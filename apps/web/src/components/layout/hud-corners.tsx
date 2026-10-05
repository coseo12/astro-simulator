'use client';

import { useSimStore } from '@/store/sim-store';

/**
 * 코너 HUD — 반투명 + 블러. 좌상 시각, 우상 렌더러/FPS, 상단 중앙 알림.
 *
 * #1281 — 좌하 `focus · <id>` 칩과 우하 고정 `정확도 · T1 관측` 범례를 제거했다.
 *   - 선택 천체 정보는 관찰 모드 좌하 카드(`body-info-card.tsx`)가, 연구 모드는 우 패널이 보인다
 *     (raw id 노출 경로 0 — 계약 D4).
 *   - 데이터 출처 Tier 는 카드의 한 줄로 옮겼고 데이터 파일 루트 `tier` 에서 읽는다 (계약 D8).
 */
export function HudCorners() {
  const renderer = useSimStore((s) => s.rendererKind);
  const engineError = useSimStore((s) => s.engineError);
  const engineNotice = useSimStore((s) => s.engineNotice);
  const dismissEngineNotice = useSimStore((s) => s.dismissEngineNotice);
  const julianDate = useSimStore((s) => s.julianDate);
  const fps = useSimStore((s) => s.fps);
  const integrator = useSimStore((s) => s.integrator);
  // P5-B #177 — ?fps=1 URL 옵트인 시 실시간 fps 카운터 표시 (실기기 측정용).
  const showFps =
    typeof window !== 'undefined' && new URLSearchParams(window.location.search).get('fps') === '1';
  // P7-B #207 — ?integrator 옵트인 감지 (URL 존재 여부). 기본값 VV 이면 배지 숨김.
  // URL 에 명시적으로 지정된 경우에만 표시 (디버그 가시성 + 사용자 신뢰 확보).
  const showIntegratorBadge =
    typeof window !== 'undefined' &&
    new URLSearchParams(window.location.search).get('integrator') !== null;

  return (
    <>
      {/* 좌상 — 현재 시각 */}
      <div
        data-testid="hud-top-left"
        className="absolute top-14 left-2 flex flex-col gap-1 text-caption num text-fg-secondary pointer-events-none"
      >
        {julianDate !== null && (
          <div data-hud-chip className="hud-chip px-2 py-1">
            JD {julianDate.toFixed(3)}
          </div>
        )}
      </div>

      {/* 우상 — 렌더러/FPS */}
      <div
        data-testid="hud-top-right"
        data-r1-region="hud-top-right"
        className="absolute top-14 right-2 flex flex-col gap-1 text-caption num text-fg-secondary items-end pointer-events-none"
      >
        <div data-hud-chip className="hud-chip px-2 py-1">
          {engineError
            ? `ERR · ${engineError}`
            : renderer
              ? `renderer · ${renderer}`
              : 'initializing…'}
        </div>
        {showFps && fps !== null && (
          <div data-testid="hud-fps" data-hud-chip className="hud-chip px-2 py-1">
            {Math.round(fps)} fps
          </div>
        )}
        {showIntegratorBadge && (
          <div data-testid="integrator-badge" data-hud-chip className="hud-chip px-2 py-1">
            integrator · {integrator}
          </div>
        )}
      </div>

      {/* 상단 중앙 — 비-fatal 알림 (P3-0 #124, dismissible)
          P7-D #209: { key, message } 구조 — data-notice-key로 key별 시각 분리 가능. */}
      {engineNotice && (
        <div
          data-testid="engine-notice"
          data-notice-key={engineNotice.key}
          role="status"
          className="absolute top-14 left-1/2 -translate-x-1/2 max-w-md text-caption num text-fg-primary bg-bg-surface/90 backdrop-blur px-3 py-1.5 rounded-sm border border-border-subtle flex items-center gap-2"
        >
          <span>{engineNotice.message}</span>
          <button
            type="button"
            data-testid="engine-notice-dismiss"
            aria-label="알림 닫기"
            onClick={() => dismissEngineNotice()}
            className="text-fg-secondary hover:text-fg-primary px-1"
          >
            ×
          </button>
        </div>
      )}
    </>
  );
}
