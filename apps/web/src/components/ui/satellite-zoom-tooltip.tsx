'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { resolveFocusMultiplier, FOCUS_USER_RADIUS_MULTIPLIER } from '@astro-simulator/core/scene';
import solarSystemData from '@astro-simulator/shared/data/solar-system.json';
import { useSimStore } from '@/store/sim-store';
import {
  getSatelliteZoomTooltipShown,
  markSatelliteZoomTooltipShown,
} from '@/lib/satellite-onboarding-storage';

/**
 * Satellite focus zoom-in 안내 tooltip — #534 R4 cross-validate Gemini 권고 1 후속.
 *
 * earth focus (R4) / mars focus (R5) / jupiter focus (R6+) 등 satellite-parent body 진입 시
 * 사용자에게 "확대하여 satellite (달/phobos/galilean) 의 위치를 확인하세요" 안내. R4
 * Amendment 4 (moonScale 800 → 200) 후 moon disc 가 작아져 default 진입 시 사용자가 위성
 * 존재를 인지하기 어려운 mental model gap 을 학습으로 보완.
 *
 * ## 표시 조건 (PM 합의 + architect 결정)
 *
 *   1. `selectedBodyId` 가 satellite-parent body (= 자식 중 satellite 가 있는 body)
 *   2. `getSatelliteZoomTooltipShown(bodyId) === false` (per-body 1회 박제, R5+ 자동 활성)
 *   3. focus 진입 후 **1.5초 delay** (Q3 — 1~2초 중간값, 카메라 transition 정착 시간 확보)
 *
 * ## 표시 위치 / 닫기 (PM 합의)
 *
 *   - 위치: 하단 toast (Q2 — 모바일/데스크톱 공통, 3D 좌표 변환 의존성 0)
 *   - 텍스트: "확대하여 달의 위치를 확인하세요" (Q1 — Amendment 4 moonScale 200 정합)
 *   - 닫기: X 버튼 + 5초 auto fade-out (Q4 — UX 표준 패턴)
 *
 * ## 일반화 (Q5)
 *
 *   `resolveFocusMultiplier` SSoT 재사용 — body 의 자식 중 `resolveFocusMultiplier(parentId) === 20`
 *   (satellite 분기) 인 body 가 존재하면 satellite-parent. solar-system.json 정적 데이터에서
 *   1회 계산 후 Set 으로 박제 (마운트 시 1회). R5 mars / R6 jupiter / R7 saturn 자동 수용.
 *
 *   단, R-Phase Allowlist 게이트는 별도 — focus 진입 자체가 R-Phase 미진입 body 에 대해 차단
 *   되므로 본 tooltip 도 자동으로 R-Phase 가시 body 에만 동작.
 *
 * ## 위험 가드 (architect 권고 반영)
 *
 *   - 위험 2: 1.5초 delay 중 focus 이탈 → markShown 시점은 **`visible=true` 진입 시점** (영구
 *     학습 기회 박탈 회피). delay 중 focus 이탈 시 timer cleanup 만 수행하고 markShown 호출 X.
 *   - 위험 3: SSR 호환 — `'use client'` directive + `useEffect` (클라이언트 한정 실행).
 *
 * ## 관련 ADR / 이슈
 *
 *   - 이슈 #534 — PM 5문 합의 + architect 5 결정 (코멘트 2026-05-24)
 *   - `packages/core/src/scene/focus-multiplier.ts` — `resolveFocusMultiplier` SSoT
 *   - R4 ADR `docs/decisions/20260520-r4-earth-moon-visualization.md` §Amendment 4 — moonScale 200
 */

/** Q3 — 카메라 transition 자연 정착 시간 (PM 합의 1~2초 중간값) */
const FOCUS_TO_TOOLTIP_DELAY_MS = 1500;

/** Q4 — 자동 fade-out 까지 표시 시간 (PM 합의 5초) */
const AUTO_FADE_OUT_MS = 5000;

/** 페이드 애니메이션 duration (in/out) */
const FADE_DURATION_MS = 200;

/**
 * solar-system.json 정적 데이터에서 satellite-parent body id Set 을 1회 산출.
 *
 * "satellite-parent" = 자식 중 `resolveFocusMultiplier(parentId) === SATELLITE` 인 body 가
 * 존재하는 body. 즉 earth (moon parent) / mars (phobos parent) / jupiter (galilean parent) 등.
 *
 * 모듈 스코프 1회 계산 — solar-system.json 은 정적 데이터라 런타임 변경 없음.
 */
const SATELLITE_PARENT_IDS: ReadonlySet<string> = (() => {
  const ids = new Set<string>();
  for (const body of solarSystemData.bodies) {
    if (!body.parentId) continue;
    if (resolveFocusMultiplier(body.parentId) !== FOCUS_USER_RADIUS_MULTIPLIER) {
      ids.add(body.parentId);
    }
  }
  return ids;
})();

/**
 * body id 에 대해 "이 body 가 satellite 를 가진 parent 인가" 판정.
 *
 * @internal — 단위 테스트 직접 호출용 export (테스트 환경 외부 사용 X).
 */
export function __isSatelliteParentBody(bodyId: string | null): boolean {
  if (bodyId === null) return false;
  return SATELLITE_PARENT_IDS.has(bodyId);
}

/**
 * body id 별 tooltip 텍스트 — 현재 ko-only 박제 (PM 합의 §비-범위, i18n 후속 분리).
 *
 * earth → "달의 위치" / mars → "포보스·데이모스의 위치" / jupiter → "갈릴레이 위성의 위치" 등
 * body 별 자식 satellite 명을 노출해 학습 효과 강화.
 */
function getTooltipText(bodyId: string): string {
  switch (bodyId) {
    case 'earth':
      return '확대하여 달의 위치를 확인하세요';
    case 'mars':
      return '확대하여 포보스·데이모스의 위치를 확인하세요';
    case 'jupiter':
      return '확대하여 갈릴레이 위성의 위치를 확인하세요';
    case 'saturn':
      return '확대하여 타이탄 등 위성의 위치를 확인하세요';
    default:
      // 기본 fallback — Q1 default 박제 ("위성" 일반화)
      return '확대하여 위성의 위치를 확인하세요';
  }
}

/**
 * Satellite focus zoom-in 안내 toast 컴포넌트.
 *
 * props 없음 — 내부에서 `useSimStore.selectedBodyId` subscribe (architect 결정 4 — 단일 책임).
 * 부모 (app-shell) 는 1줄 `<SatelliteZoomTooltip />` 마운트만 책임.
 */
export function SatelliteZoomTooltip() {
  const selectedBodyId = useSimStore((s) => s.selectedBodyId);
  const [visible, setVisible] = useState(false);
  const [fadingOut, setFadingOut] = useState(false);
  const currentBodyIdRef = useRef<string | null>(null);

  // body 별 satellite-parent 판정 (메모이즈 — selectedBodyId 변경 시만 재계산)
  const isSatelliteParent = useMemo(
    () => __isSatelliteParentBody(selectedBodyId),
    [selectedBodyId],
  );

  useEffect(() => {
    // focus 해제 또는 satellite-parent 아닌 body → 즉시 숨김 (전이 시점 cleanup)
    if (selectedBodyId === null || !isSatelliteParent) {
      // selectedBodyId(외부 store) 변화에 반응하는 cleanup — visible 은 결과이고 trigger 가 아니라
      // cascading 무한루프 없음 (정당한 외부 상태 sync). set-state-in-effect 규칙 보수적 false-positive.
      // eslint-disable-next-line react-hooks/set-state-in-effect
      setVisible(false);
      setFadingOut(false);
      currentBodyIdRef.current = null;
      return;
    }

    // 이미 한 번 표시한 body 면 skip (per-body 박제, architect 결정 2)
    if (getSatelliteZoomTooltipShown(selectedBodyId)) return;

    // 같은 body 가 이미 표시 중이면 skip (StrictMode 이중 실행 / 재마운트 가드)
    if (currentBodyIdRef.current === selectedBodyId) return;

    // 1.5초 delay 후 표시 — delay 중 focus 이탈 시 cleanup 으로 markShown 안 호출됨
    // (architect 위험 가드 2 — 영구 학습 기회 박탈 회피)
    const showTimer = window.setTimeout(() => {
      currentBodyIdRef.current = selectedBodyId;
      setVisible(true);
      setFadingOut(false);
      markSatelliteZoomTooltipShown(selectedBodyId); // visible=true 시점에 박제
    }, FOCUS_TO_TOOLTIP_DELAY_MS);

    return () => {
      window.clearTimeout(showTimer);
    };
  }, [selectedBodyId, isSatelliteParent]);

  // 자동 fade-out timer — visible=true 가 된 시점부터 5초 후 fade-out 시작
  useEffect(() => {
    if (!visible) return;
    const fadeStartTimer = window.setTimeout(() => {
      setFadingOut(true);
    }, AUTO_FADE_OUT_MS);
    const hideTimer = window.setTimeout(() => {
      setVisible(false);
      setFadingOut(false);
    }, AUTO_FADE_OUT_MS + FADE_DURATION_MS);
    return () => {
      window.clearTimeout(fadeStartTimer);
      window.clearTimeout(hideTimer);
    };
  }, [visible]);

  const handleDismiss = () => {
    setFadingOut(true);
    window.setTimeout(() => {
      setVisible(false);
      setFadingOut(false);
    }, FADE_DURATION_MS);
  };

  if (!visible || selectedBodyId === null) return null;

  const text = getTooltipText(selectedBodyId);

  return (
    <div
      role="status"
      aria-live="polite"
      data-testid="satellite-zoom-tooltip"
      data-body-id={selectedBodyId}
      data-fading-out={fadingOut ? 'true' : 'false'}
      className="fixed left-1/2 z-30 flex items-center gap-3 rounded-sm border border-border-subtle bg-bg-surface/95 px-4 py-2 text-body-sm text-fg-primary shadow-lg backdrop-blur"
      style={{
        bottom: 'calc(96px + env(safe-area-inset-bottom, 0px))',
        transform: 'translateX(-50%)',
        opacity: fadingOut ? 0 : 1,
        transition: `opacity ${FADE_DURATION_MS}ms ease-out`,
        maxWidth: 'min(90vw, 480px)',
      }}
    >
      <span>{text}</span>
      <button
        type="button"
        onClick={handleDismiss}
        data-testid="satellite-zoom-tooltip-close"
        aria-label="안내 닫기"
        className="text-fg-tertiary hover:text-fg-primary text-body transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        ✕
      </button>
    </div>
  );
}
