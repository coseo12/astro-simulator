'use client';

import { SimulationCore } from '@astro-simulator/core';
import { useEffect, useRef, useState } from 'react';

/**
 * Babylon 캔버스 래퍼.
 * - SSR 우회는 `SimCanvasDynamic` (sim-canvas.dynamic.tsx) 사용
 * - StrictMode 이중 마운트 대응: 초기화 가드 + dispose
 */
export function SimCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreRef = useRef<SimulationCore | null>(null);
  const [renderer, setRenderer] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    // 이미 생성되어 있으면 재초기화 금지 (StrictMode 이중 마운트)
    if (coreRef.current && !coreRef.current.disposed) return;

    let cancelled = false;
    const core = new SimulationCore(canvas);
    coreRef.current = core;

    core
      .start()
      .then(() => {
        if (cancelled) return;
        setRenderer(core.rendererKind);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[sim-canvas] 엔진 초기화 실패', err);
        setError(err instanceof Error ? err.message : String(err));
      });

    return () => {
      cancelled = true;
      core.dispose();
      coreRef.current = null;
    };
  }, []);

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="block w-full h-full outline-none"
        style={{ touchAction: 'none' }}
      />
      {/* 디버그 HUD — B1 검증용, D1에서 정식 HUD로 대체됨 */}
      <div className="absolute top-2 right-2 num text-caption text-fg-secondary bg-bg-surface/80 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle">
        {error ? `ERR · ${error}` : renderer ? `renderer · ${renderer}` : 'initializing…'}
      </div>
    </div>
  );
}
