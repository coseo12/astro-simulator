'use client';

import { SimulationCore, scene as sceneApi } from '@astro-simulator/core';
import { attachCoreToStore } from '@/core/core-adapter';
import { useSimStore } from '@/store/sim-store';
import { useEffect, useRef } from 'react';

/**
 * Babylon 캔버스 래퍼.
 * - SSR 우회는 `SimCanvasDynamic` (sim-canvas.dynamic.tsx) 사용
 * - StrictMode 이중 마운트 대응: 초기화 가드 + dispose
 */
export function SimCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreRef = useRef<SimulationCore | null>(null);

  const renderer = useSimStore((s) => s.rendererKind);
  const engineError = useSimStore((s) => s.engineError);
  const pingCount = useSimStore((s) => s.pingCount);
  const incrementPing = useSimStore((s) => s.incrementPing);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;

    if (coreRef.current && !coreRef.current.disposed) return;

    const core = new SimulationCore(canvas);
    coreRef.current = core;

    const detach = attachCoreToStore(core);

    let cancelled = false;
    core
      .start()
      .then(() => {
        if (cancelled || !core.scene) return;
        // B5: 로그 뎁스 버퍼 — 극단 near/far 동시 렌더
        sceneApi.enableLogarithmicDepth(core.scene);
        // C3: 카메라는 태양계 전체를 보도록 35 AU (해왕성 30 AU 포함)
        sceneApi.setupArcRotateCamera(core.scene, { radius: 35 });
        // C3: JPL 궤도 요소 + Kepler 해석해 기반 태양계
        sceneApi.createSolarSystemScene(core.scene);
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[sim-canvas] 엔진 초기화 실패', err);
      });

    return () => {
      cancelled = true;
      detach();
      core.dispose();
      coreRef.current = null;
    };
  }, []);

  const handlePing = () => {
    const core = coreRef.current;
    if (!core) return;
    // 라운드트립 테스트 — UI에서 store 업데이트, Core로 명령 발행
    incrementPing();
    core.command({ type: 'setMode', mode: 'observe' });
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="block w-full h-full outline-none"
        style={{ touchAction: 'none' }}
      />
      {/* 개발용 HUD — D1 (#20)에서 정식 HUD로 대체 */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
        <div className="num text-caption text-fg-secondary bg-bg-surface/80 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle">
          {engineError
            ? `ERR · ${engineError}`
            : renderer
              ? `renderer · ${renderer}`
              : 'initializing…'}
        </div>
        <button
          type="button"
          onClick={handlePing}
          className="num text-caption text-fg-primary bg-primary/10 hover:bg-primary/20 border border-primary/30 px-2 py-1 rounded-sm transition-colors"
          style={{ transitionDuration: 'var(--duration-fast)' }}
        >
          ping: {pingCount}
        </button>
      </div>
    </div>
  );
}
