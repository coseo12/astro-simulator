'use client';

/**
 * LOD dev overlay — 두 모드 지원
 *
 * 1. **집계 모드** (P11-B #289 — `?debug=draw-calls`)
 *    LOD H/M/L 분포 1줄 박제. backwards-compat 으로 유지 (이전 사용자/QA 워크플로 보존).
 *
 * 2. **상세 모드** (#388 — `?lodOverlay=1`)
 *    body 별 LOD level / screenCoverage / pxDiameter / cameraDistance 표 박제.
 *    PR #387 cross-validate Gemini 고유 발견 분리 — #379 Phase 1 (screenCoverage 식 정정) 디버깅 도구.
 *
 *    reviewer 권고 직접 해소:
 *      - non-blocking #1: forensic `actualCameraRadius` 일률 35 → cell 별 변별 가능
 *      - non-blocking #2: `bodyInfo.pixelDiameter` null → raw 박제 + 일관성 검증 가능
 *
 * ADR: `docs/decisions/20260424-p11-b-lod-design.md` §결정 §6 (집계 모드)
 *      `docs/decisions/20260502-379-fix-decision.md` §Phase 1 (상세 모드 발화점)
 *
 * 활성 조건 (양 모드 공통):
 *  - `process.env.NODE_ENV !== 'production'` — prod 빌드에서 컴포넌트 본체 DCE
 *  - URL 파라미터 (`?debug=draw-calls` 또는 `?lodOverlay=1`) — dev 에서도 기본 숨김
 *
 * 갱신: 1초 throttle. 매 프레임 갱신은 24+ body × 4 column re-render 비용 과도.
 */
import { useEffect, useState } from 'react';

// `window.__solarScene` 는 sim-canvas 가 dev 빌드에서 노출하는 handles (`Object.defineProperty`).
// 본 컴포넌트가 prod 에서 early-return 으로 제거되므로 prod bundle 에 `__solarScene` 참조도 없음.
interface LodStats {
  high: number;
  mid: number;
  low: number;
  override: 'high' | 'mid' | 'low' | 'auto';
}

// #388 — `getLodInfo()` 반환 타입. core 패키지 LodBodyInfo 와 시그니처 정합 (read-only 계약).
// 직접 import 하지 않는 이유: 본 컴포넌트는 prod 에서 DCE 되며, 타입 import 만으로도
// type-only 부수효과는 없으나 의존 명시 최소화 + worktree 경계에서 자체 검증 가능 형태 유지.
interface LodBodyInfo {
  id: string;
  level: 'high' | 'mid' | 'low';
  screenCoverage: number;
  pxDiameter: number;
  cameraDistanceMeters: number;
}

interface SceneHandlesPartial {
  getLodStats?: () => LodStats;
  getLodInfo?: () => readonly LodBodyInfo[];
}

const POLL_INTERVAL_MS = 1000;

// LOD level 색상 코딩 — DoD-4 (#388). high=green / mid=yellow / low=red.
// tailwind 의미 색상 (text-emerald / text-amber / text-rose) 가 디자인 시스템 fg-* 를 거치지 않으므로
// 색약 사용자에게도 명도 차이가 충분한 saturated tone 사용.
const LEVEL_COLOR_CLASS: Record<LodBodyInfo['level'], string> = {
  high: 'text-emerald-400',
  mid: 'text-amber-400',
  low: 'text-rose-400',
};

/**
 * `?lodOverlay=1` 활성 여부. URL 파싱 1회만 수행 (window.location 변경은 라우트 단위).
 *
 * `process.env.NODE_ENV` 가드는 호출자가 처리 (DCE 보장).
 */
function isDetailedOverlayEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('lodOverlay') === '1';
}

/**
 * `?debug=draw-calls` 활성 여부. 기존 P11-B 워크플로 보존.
 */
function isAggregateOverlayEnabled(): boolean {
  if (typeof window === 'undefined') return false;
  return new URLSearchParams(window.location.search).get('debug') === 'draw-calls';
}

/**
 * 본 컴포넌트는 dev/test 환경 한정 — `process.env.NODE_ENV === 'production'` 일 때 함수 진입 즉시
 * `null` 반환하여 React tree 에서 제거되며, Next.js Turbopack/SWC 가 빌드 시점 리터럴 치환으로
 * **컴포넌트 본체 (useState / useEffect / JSX) 전체를 DCE** 한다. dev/test 에서는 URL 파라미터에 따라
 * 집계 모드 (`?debug=draw-calls`) 또는 상세 모드 (`?lodOverlay=1`) 중 하나로 동작.
 *
 * **DoD-5 (#388)**: prod bundle 에서 `lod-row-` / `waiting for first frame` 등 detailed-mode JSX
 * 문자열이 보이지 않아야 한다. 공식 검증: PR 본문의 grep 결과 (`grep -rln "lod-row-"`).
 */
export function LodDevOverlay() {
  // **빌드 시점 DCE 의존 지점** — 본 분기는 Turbopack/SWC 가 `process.env.NODE_ENV` 를 리터럴
  // (`'production'`) 로 치환하면서 함수 본체 나머지 전체를 unreachable 로 판단해 제거한다.
  // dev/test 에서만 아래 hooks 가 실행됨.
  if (process.env.NODE_ENV === 'production') return null;
  return <LodDevOverlayImpl />;
}

/**
 * 실제 hooks/JSX 보유 본체. 별도 함수로 분리한 이유:
 *
 *  - 위 `LodDevOverlay` 의 `if (production) return null` 조기 종료가 **컴포넌트 함수 본체 전체 DCE**
 *    에 직결되어야 한다. hooks (`useState`, `useEffect`) 가 같은 함수에 있으면 minifier 가 dead branch
 *    제거를 보수적으로 회피할 수 있다 — Hook 의존 그래프 보존이 명시적으로 요청되지 않으면 안전 경로 선택.
 *  - 본체를 분리하면 `LodDevOverlayImpl` 자체가 `LodDevOverlay` 안에서만 참조되며, top-level 의 prod
 *    분기 (`'production' === 'production' → return null`) 가 호출 사이트 자체를 제거 → DCE 가 함수
 *    그래프를 따라 자연스럽게 전파.
 */
/**
 * 초기 모드 결정 — URL 파싱 1회. lazy initializer 형식으로 mount 시점에만 평가하여
 * `useEffect` 내부 setState 회피 (`react-hooks/set-state-in-effect`).
 */
function resolveInitialMode(): 'off' | 'aggregate' | 'detailed' {
  if (isDetailedOverlayEnabled()) return 'detailed';
  if (isAggregateOverlayEnabled()) return 'aggregate';
  return 'off';
}

function LodDevOverlayImpl() {
  const [stats, setStats] = useState<LodStats | null>(null);
  const [bodies, setBodies] = useState<readonly LodBodyInfo[]>([]);
  // mode 는 mount 시 1회 결정 — URL 변경은 페이지 라우팅 단위라 effect 내부 setState 불필요.
  const [mode] = useState<'off' | 'aggregate' | 'detailed'>(resolveInitialMode);

  useEffect(() => {
    if (typeof window === 'undefined') return;
    if (mode === 'off') return;

    const detailed = mode === 'detailed';

    const timer = window.setInterval(() => {
      const scene = (window as unknown as { __solarScene?: SceneHandlesPartial }).__solarScene;
      if (!scene) return;
      if (scene.getLodStats) {
        setStats(scene.getLodStats());
      }
      if (detailed && scene.getLodInfo) {
        // getLodInfo 반환은 내부 버퍼 — 매 frame in-place mutate 됨.
        // React state 비교가 새 참조라 판단하도록 shallow copy (배열 스프레드).
        // 24+ body × 1초 = 초당 24+ 객체 할당, 무시 가능 비용.
        setBodies([...scene.getLodInfo()]);
      }
    }, POLL_INTERVAL_MS);

    return () => window.clearInterval(timer);
  }, [mode]);

  if (mode === 'off' || !stats) return null;

  const total = stats.high + stats.mid + stats.low;

  // 집계 모드 — 기존 동작 유지 (단일 행 박제).
  if (mode === 'aggregate') {
    return (
      <div
        data-testid="lod-dev-overlay"
        className="absolute bottom-36 left-2 text-caption num text-fg-tertiary bg-bg-surface/70 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle pointer-events-none"
      >
        LOD · total {total} · H:{stats.high} M:{stats.mid} L:{stats.low} ({stats.override})
      </div>
    );
  }

  // 상세 모드 — body 별 LOD raw 데이터 표 박제.
  return (
    <div
      data-testid="lod-dev-overlay"
      data-overlay-mode="detailed"
      className="absolute bottom-36 left-2 max-h-[60vh] overflow-y-auto text-caption num text-fg-tertiary bg-bg-surface/80 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle pointer-events-none"
    >
      <div className="font-semibold text-fg-secondary pb-1 border-b border-border-subtle mb-1">
        LOD · total {total} · H:{stats.high} M:{stats.mid} L:{stats.low} ({stats.override})
      </div>
      {bodies.length === 0 ? (
        <div data-testid="lod-dev-overlay-empty" className="text-fg-tertiary italic">
          waiting for first frame...
        </div>
      ) : (
        <table className="text-[10px] leading-tight">
          <thead className="text-fg-secondary">
            <tr>
              <th className="text-left pr-2">body</th>
              <th className="text-left pr-2">lod</th>
              <th className="text-right pr-2">cov(px)</th>
              <th className="text-right pr-2">dia(px)</th>
              <th className="text-right">camR(km)</th>
            </tr>
          </thead>
          <tbody>
            {bodies.map((b) => (
              <tr key={b.id} data-testid={`lod-row-${b.id}`} data-lod-level={b.level}>
                <td className="pr-2">{b.id}</td>
                <td className={`pr-2 font-semibold ${LEVEL_COLOR_CLASS[b.level]}`}>{b.level}</td>
                <td className="text-right pr-2">{b.screenCoverage.toFixed(2)}</td>
                <td className="text-right pr-2">{b.pxDiameter.toFixed(2)}</td>
                <td className="text-right">{(b.cameraDistanceMeters / 1000).toFixed(0)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
