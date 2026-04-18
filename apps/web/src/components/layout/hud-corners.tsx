'use client';

import { useSimStore } from '@/store/sim-store';

/**
 * 4코너 HUD — 반투명 + 블러.
 * 관찰 모드: 최소 (좌상 시각, 우상 렌더러)
 * 연구 모드: 풀 (D4에서 확장)
 */
export function HudCorners() {
  const renderer = useSimStore((s) => s.rendererKind);
  const engineError = useSimStore((s) => s.engineError);
  const engineNotice = useSimStore((s) => s.engineNotice);
  const setEngineNotice = useSimStore((s) => s.setEngineNotice);
  const julianDate = useSimStore((s) => s.julianDate);
  const selected = useSimStore((s) => s.selectedBodyId);
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
          <div className="bg-bg-surface/70 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle">
            JD {julianDate.toFixed(3)}
          </div>
        )}
      </div>

      {/* 우상 — 렌더러/FPS */}
      <div
        data-testid="hud-top-right"
        className="absolute top-14 right-2 flex flex-col gap-1 text-caption num text-fg-secondary items-end pointer-events-none"
      >
        <div className="bg-bg-surface/70 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle">
          {engineError
            ? `ERR · ${engineError}`
            : renderer
              ? `renderer · ${renderer}`
              : 'initializing…'}
        </div>
        {showFps && fps !== null && (
          <div
            data-testid="hud-fps"
            className="bg-bg-surface/70 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle"
          >
            {Math.round(fps)} fps
          </div>
        )}
        {showIntegratorBadge && (
          <div
            data-testid="integrator-badge"
            className="bg-bg-surface/70 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle"
          >
            integrator · {integrator}
          </div>
        )}
      </div>

      {/* 상단 중앙 — 비-fatal 알림 (P3-0 #124, dismissible) */}
      {engineNotice && (
        <div
          data-testid="engine-notice"
          role="status"
          className="absolute top-14 left-1/2 -translate-x-1/2 max-w-md text-caption num text-fg-primary bg-bg-surface/90 backdrop-blur px-3 py-1.5 rounded-sm border border-border-subtle flex items-center gap-2"
        >
          <span>{engineNotice}</span>
          <button
            type="button"
            data-testid="engine-notice-dismiss"
            aria-label="알림 닫기"
            onClick={() => setEngineNotice(null)}
            className="text-fg-tertiary hover:text-fg-primary px-1"
          >
            ×
          </button>
        </div>
      )}

      {/* 좌하 — 선택 천체 */}
      {selected && (
        <div
          data-testid="hud-bottom-left"
          className="absolute bottom-20 left-2 text-caption num text-fg-secondary bg-bg-surface/70 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle pointer-events-none"
        >
          focus · {selected}
        </div>
      )}

      {/* 우하 — Tier 범례 (D8에서 동적화) */}
      <div
        data-testid="hud-bottom-right"
        className="absolute bottom-20 right-2 text-caption num text-fg-tertiary bg-bg-surface/60 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle pointer-events-none flex items-center gap-2"
      >
        <span
          className="inline-block w-2 h-2 rounded-full"
          style={{ background: 'var(--tier-1-observed)' }}
        />
        Tier 1 관측
      </div>
    </>
  );
}
