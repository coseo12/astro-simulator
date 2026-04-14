'use client';

import { SimulationCore, scene as sceneApi } from '@astro-simulator/core';
import { attachCoreToStore } from '@/core/core-adapter';
import { useSimStore } from '@/store/sim-store';
import { useEffect, useRef } from 'react';

const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'earth', label: '지구' },
  { id: 'jupiter', label: '목성' },
  { id: 'neptune', label: '해왕성' },
];

/**
 * Babylon 캔버스 래퍼.
 */
export function SimCanvas() {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreRef = useRef<SimulationCore | null>(null);

  const renderer = useSimStore((s) => s.rendererKind);
  const engineError = useSimStore((s) => s.engineError);
  const julianDate = useSimStore((s) => s.julianDate);
  const selected = useSimStore((s) => s.selectedBodyId);

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
        sceneApi.enableLogarithmicDepth(core.scene);
        const camera = sceneApi.setupArcRotateCamera(core.scene, { radius: 35 });
        const controller = new sceneApi.CameraController(camera, core.scene);
        const solar = sceneApi.createSolarSystemScene(core.scene);

        core.on('timeChanged', ({ julianDate: jd }) => solar.updateAt(jd));

        core.setCameraHandlers(
          (bodyId: string) => {
            const mesh = solar.meshes.get(bodyId);
            if (mesh) controller.focusOn({ mesh });
          },
          () => controller.reset(35),
        );
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

  const handleFocus = (bodyId: string) => {
    coreRef.current?.command({ type: 'focusOn', bodyId });
  };

  const handleReset = () => {
    coreRef.current?.command({ type: 'resetCamera' });
  };

  return (
    <div className="relative w-full h-full">
      <canvas
        ref={canvasRef}
        className="block w-full h-full outline-none"
        style={{ touchAction: 'none' }}
      />
      {/* 우상단 HUD */}
      <div className="absolute top-2 right-2 flex flex-col items-end gap-1">
        <div className="num text-caption text-fg-secondary bg-bg-surface/80 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle">
          {engineError
            ? `ERR · ${engineError}`
            : renderer
              ? `renderer · ${renderer}`
              : 'initializing…'}
        </div>
        {julianDate !== null && (
          <div className="num text-caption text-fg-secondary bg-bg-surface/80 backdrop-blur px-2 py-1 rounded-sm border border-border-subtle">
            JD {julianDate.toFixed(2)}
          </div>
        )}
      </div>

      {/* 좌상단 — 포커스 버튼 (D7 (#26)에서 CelestialTree로 대체) */}
      <div className="absolute top-2 left-2 flex gap-1">
        {FOCUS_BUTTONS.map((b) => (
          <button
            key={b.id}
            type="button"
            data-testid={`focus-${b.id}`}
            onClick={() => handleFocus(b.id)}
            className={`num text-caption px-2 py-1 rounded-sm border transition-colors ${
              selected === b.id
                ? 'bg-primary/20 text-fg-primary border-primary/40'
                : 'bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated'
            }`}
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            {b.label}
          </button>
        ))}
        <button
          type="button"
          data-testid="focus-reset"
          onClick={handleReset}
          className="num text-caption px-2 py-1 rounded-sm border bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated transition-colors"
          style={{ transitionDuration: 'var(--duration-fast)' }}
        >
          reset
        </button>
      </div>
    </div>
  );
}
