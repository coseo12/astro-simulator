'use client';

import { SimulationCore, scene as sceneApi, gpu as gpuApi } from '@astro-simulator/core';
import { attachCoreToStore } from '@/core/core-adapter';
import { SimCommandProvider } from '@/core/sim-context';
import { useSimStore } from '@/store/sim-store';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Babylon 캔버스 + Core 초기화.
 * 캔버스 위의 UI는 children/overlay에서 렌더 — 이 컴포넌트는 엔진 lifecycle에만 집중.
 */
export function SimCanvas({ children }: { children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreRef = useRef<SimulationCore | null>(null);
  const [core, setCore] = useState<SimulationCore | null>(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    if (coreRef.current && !coreRef.current.disposed) return;

    // P3-0 #124 — WebGPU capability 감지 (마운트 시 1회). 사용자가 webgpu/auto
    // 엔진을 요청했는데 미지원이면 콘솔 경고 + HUD notice + newton 폴백 안내.
    gpuApi.detectGpuCapability().then((cap) => {
      const requested = useSimStore.getState().physicsEngine;
      const wantsGpu = requested === 'webgpu' || requested === 'auto';
      if (!cap.webgpu) {
        // 항상 경고: 향후 P3-A/B 활성화 시 진단에 도움.
        // eslint-disable-next-line no-console
        console.warn('[gpu] WebGPU 미지원:', cap.reason);
        if (wantsGpu) {
          useSimStore
            .getState()
            .setEngineNotice(`WebGPU 미지원 — ${cap.reason ?? 'unknown'} · Newton로 폴백.`);
        }
      } else if (cap.adapterInfo) {
        // eslint-disable-next-line no-console
        console.info('[gpu] adapter:', cap.adapterInfo);
      }
    });

    const instance = new SimulationCore(canvas);
    // Babylon이 기본 tabindex=1을 설정 — a11y(WCAG 2.4.3) 권고상 양수 금지.
    canvas.setAttribute('tabindex', '0');
    coreRef.current = instance;
    setCore(instance);
    const detach = attachCoreToStore(instance);

    let cancelled = false;
    let unsubEngine: (() => void) | null = null;
    instance
      .start()
      .then(() => {
        if (cancelled || !instance.scene) return;
        sceneApi.enableLogarithmicDepth(instance.scene);
        // P4-D #166 — bench 전용. `?gpuTimer=1` 진입 시 GPU frame time 측정 활성화
        // + window에 최근 평균 노출 (bench 스크립트가 폴링). 미지원 환경은 null 유지.
        const gpuTimerParam = new URLSearchParams(window.location.search).get('gpuTimer');
        if (gpuTimerParam === '1') {
          const enabled = instance.enableGpuTimer();
          Object.defineProperty(window, '__gpuFrameTimeMs', {
            configurable: true,
            get: () => instance.readGpuFrameTimeMs(),
          });
          // 디버그 가시화 — Babylon caps + instrumentation 원시값
          Object.defineProperty(window, '__gpuTimerDebug', {
            configurable: true,
            get: () => instance.debugGpuTimer(),
          });
          // eslint-disable-next-line no-console
          console.info('[gpu-timer] enable=', enabled, 'caps=', instance.debugGpuTimer());
        }
        const camera = sceneApi.setupArcRotateCamera(instance.scene, { radius: 35 });
        const controller = new sceneApi.CameraController(camera, instance.scene);
        // 소행성대 N — URL ?belt=NNN 우선, 없으면 0 (생성 안 함).
        const beltParam = new URLSearchParams(window.location.search).get('belt');
        const beltN = beltParam ? Math.max(0, Math.min(10_000, Number(beltParam) || 0)) : 0;
        // P4-A #165 — ?beltNbody=1 옵트인 시 소행성대를 N-body 엔진에 편입.
        // BH tree / GPU compute 가속 효과를 실측 가능케 한다. 기본 false로 기존 Kepler 경로 유지.
        const beltNbodyParam = new URLSearchParams(window.location.search).get('beltNbody');
        const asteroidNbody = beltNbodyParam === '1';
        // P3-B #146 — webgpu 활성화. 미지원 환경이면 webgpu 요청도 barnes-hut로 폴백.
        // auto: WebGPU 가능 + N≥1000이면 webgpu, 가능하지만 N<1000이면 newton(오버헤드 회피),
        //       WebGPU 미지원이면 N≥1000이면 barnes-hut, 아니면 newton.
        const isWebGpu = (instance.scene?.getEngine() as { isWebGPU?: boolean })?.isWebGPU === true;
        const resolveEngine = (
          k: ReturnType<typeof useSimStore.getState>['physicsEngine'],
        ): 'kepler' | 'newton' | 'barnes-hut' | 'webgpu' => {
          if (k === 'kepler') return 'kepler';
          if (k === 'newton') return 'newton';
          if (k === 'barnes-hut') return 'barnes-hut';
          if (k === 'webgpu') {
            if (!isWebGpu) {
              useSimStore.getState().setEngineNotice('WebGPU 미지원 — Barnes-Hut로 폴백.');
              return 'barnes-hut';
            }
            return 'webgpu';
          }
          // auto
          if (isWebGpu && beltN >= 1000) return 'webgpu';
          if (beltN >= 1000) return 'barnes-hut';
          return 'newton';
        };
        // P5-A #178 — ?gr=1 옵트인 시 1PN GR 보정 활성 (수성 근일점 세차 등).
        const grParam = new URLSearchParams(window.location.search).get('gr');
        const enableGR = grParam === '1';
        const solar = sceneApi.createSolarSystemScene(instance.scene, {
          physicsEngine: resolveEngine(useSimStore.getState().physicsEngine),
          asteroidBeltN: beltN,
          asteroidNbody,
          enableGR,
        });

        instance.on('timeChanged', ({ julianDate }) => solar.updateAt(julianDate));

        // 엔진 스토어 변경 → 씬 setPhysicsEngine (#89 심리스 전환)
        // + 질량 배수 변경 → setBodyMassMultiplier (#107)
        unsubEngine = useSimStore.subscribe((state, prev) => {
          if (state.physicsEngine !== prev.physicsEngine) {
            solar.setPhysicsEngine(resolveEngine(state.physicsEngine));
          }
          if (state.massMultipliers !== prev.massMultipliers) {
            const prevKeys = new Set(Object.keys(prev.massMultipliers));
            const nextKeys = new Set(Object.keys(state.massMultipliers));
            // 제거된 키는 1.0으로 복원
            for (const k of prevKeys) {
              if (!nextKeys.has(k)) solar.setBodyMassMultiplier(k, 1);
            }
            for (const [k, v] of Object.entries(state.massMultipliers)) {
              if (prev.massMultipliers[k] !== v) solar.setBodyMassMultiplier(k, v);
            }
          }
        });
        instance.setCameraHandlers(
          (bodyId: string) => {
            const mesh = solar.meshes.get(bodyId);
            if (mesh) controller.focusOn({ mesh });
          },
          () => controller.reset(35),
          (radius: number) => {
            camera.radius = radius;
          },
        );
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[sim-canvas] 엔진 초기화 실패', err);
      });

    return () => {
      cancelled = true;
      unsubEngine?.();
      detach();
      instance.dispose();
      coreRef.current = null;
      setCore(null);
    };
  }, []);

  return (
    <>
      <canvas
        ref={canvasRef}
        data-testid="sim-canvas"
        className="absolute inset-0 w-full h-full outline-none"
        style={{ touchAction: 'none' }}
      />
      <SimCommandProvider core={core}>{children}</SimCommandProvider>
    </>
  );
}
