'use client';

/**
 * P11-B #289 — LOD dev overlay
 *
 * ADR: `docs/decisions/20260424-p11-b-lod-design.md` §결정 §6
 *
 * draw call 분포를 시각화해 LOD 동작을 런타임 관찰 가능하게 한다.
 *
 * 활성 조건:
 *  - `process.env.NODE_ENV !== 'production'` (prod 빌드에서 DCE)
 *  - URL `?debug=draw-calls` 옵트인 (dev 에서도 기본 숨김, 필요할 때만 활성)
 *
 * 표시 형식: `LOD H:12 M:8 L:72 (auto)` — LOD 별 body 수 + override 상태
 *
 * 갱신: 1초 throttle. 매 프레임 갱신은 LOD 분기 O(N) 대비 과도한 re-render 비용.
 */
import { useEffect, useState } from 'react';

// `window.__solarScene` 는 dev 빌드에서 sim-canvas 가 노출하는 handles (`Object.defineProperty`).
// LOD 집계는 `getLodStats()` 반환. handles 구조는 solar-system-scene.ts SolarSystemSceneHandles 참조.
interface LodStats {
  high: number;
  mid: number;
  low: number;
  override: 'high' | 'mid' | 'low' | 'auto';
}

interface SceneHandlesPartial {
  getLodStats?: () => LodStats;
}

const POLL_INTERVAL_MS = 1000;

export function LodDevOverlay() {
  const [stats, setStats] = useState<LodStats | null>(null);
  const [enabled, setEnabled] = useState(false);

  useEffect(() => {
    if (process.env.NODE_ENV === 'production') return;
    if (typeof window === 'undefined') return;
    const debugParam = new URLSearchParams(window.location.search).get('debug');
    if (debugParam !== 'draw-calls') return;
    setEnabled(true);
    const timer = window.setInterval(() => {
      const scene = (window as unknown as { __solarScene?: SceneHandlesPartial }).__solarScene;
      if (scene?.getLodStats) {
        setStats(scene.getLodStats());
      }
    }, POLL_INTERVAL_MS);
    return () => window.clearInterval(timer);
  }, []);

  if (!enabled || !stats) return null;

  const total = stats.high + stats.mid + stats.low;
  return (
    <div
      data-testid="lod-dev-overlay"
      className="absolute bottom-36 left-2 text-caption num text-fg-tertiary bg-bg-surface/70 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle pointer-events-none"
    >
      LOD · total {total} · H:{stats.high} M:{stats.mid} L:{stats.low} ({stats.override})
    </div>
  );
}
