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
  const julianDate = useSimStore((s) => s.julianDate);
  const selected = useSimStore((s) => s.selectedBodyId);

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
      </div>

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
