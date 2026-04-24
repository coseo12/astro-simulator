'use client';

import { SimulationCore, scene as sceneApi, gpu as gpuApi } from '@astro-simulator/core';
// P12-A #298 — Tier 엔진 유틸 (renderScaleForTier) 는 sceneApi 네임스페이스에 이미 re-export 되어 있다.
// `sceneApi.renderScaleForTier` 로 접근한다 (별도 import 불필요, 아래 onBeforeRender 에서 사용).
import { attachCoreToStore } from '@/core/core-adapter';
import { parseIntegratorKind } from '@/core/parse-integrator';
import { parseGrMode } from '@/core/parse-gr-mode';
import { parseLodLevel } from '@/core/parse-lod-level';
import { detectIsMobile } from '@/core/is-mobile';
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
  const unsubDiskRef = useRef<(() => void) | null>(null);
  // P12-A #298 N1 — onBeforeRender observer 중복 등록 방지용 cleanup 핸들.
  // HMR / 컴포넌트 remount 시 scene 이 살아있을 수 있어 관찰자 누수 방지.
  const tierObserverCleanupRef = useRef<(() => void) | null>(null);
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
          useSimStore.getState().setEngineNotice({
            key: 'webgpu-fallback',
            message: `WebGPU 미지원 — ${cap.reason ?? 'unknown'} · Newton로 폴백.`,
          });
        }
      } else if (cap.adapterInfo) {
        // eslint-disable-next-line no-console
        console.info('[gpu] adapter:', cap.adapterInfo);
      }

      // P7-D #209 — 모바일 UserAgent + WebGPU 미지원 조합에서 best-effort 안내.
      // iOS Safari <17.4 등 WebGPU 미탑재 모바일에서 일부 시각 효과(렌즈·disk)가
      // 제한됨을 사용자에게 1회 고지한다. 이미 `webgpu-fallback` 키 알림이 있으면
      // 중복 고지 방지 — 별도 키 사용 (dismiss 독립 관리).
      //
      // P7-E #210 / #220 — iPadOS 13+ 는 데스크톱 UA 로 전송되므로 Macintosh +
      // maxTouchPoints 조합 감지 (Apple 공식 권고). `detectIsMobile` 유틸로 분리.
      const isMobile =
        typeof navigator !== 'undefined'
          ? detectIsMobile({
              userAgent: navigator.userAgent,
              maxTouchPoints: navigator.maxTouchPoints,
            })
          : false;
      if (isMobile && !cap.webgpu) {
        useSimStore.getState().setEngineNotice({
          key: 'mobile-webgpu-best-effort',
          message: '모바일 WebGPU best-effort — 일부 시각 효과가 제한될 수 있습니다.',
        });
      }
    });

    const instance = new SimulationCore(canvas);
    // Babylon이 기본 tabindex=1을 설정 — a11y(WCAG 2.4.3) 권고상 양수 금지.
    canvas.setAttribute('tabindex', '0');
    coreRef.current = instance;
    setCore(instance);
    // P7-C #208 — browser-verify 스크립트에서 카메라/씬 조작이 필요할 때 사용.
    // 테스트 목적 전역 노출 (프로덕션에도 노출되나 민감 데이터 아님).
    Object.defineProperty(window, '__simCore', {
      configurable: true,
      value: instance,
      writable: false,
    });
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
              useSimStore.getState().setEngineNotice({
                key: 'webgpu-fallback',
                message: 'WebGPU 미지원 — Barnes-Hut로 폴백.',
              });
              return 'barnes-hut';
            }
            return 'webgpu';
          }
          // auto
          if (isWebGpu && beltN >= 1000) return 'webgpu';
          if (beltN >= 1000) return 'barnes-hut';
          return 'newton';
        };
        // P5-A #178 / P6-C #191 / P7-E #210 — ?gr URL 옵트인.
        // `parseGrMode` 로 분리 (parseIntegratorKind 선례) — 대소문자 무시, 별칭 동일.
        const grParam = new URLSearchParams(window.location.search).get('gr');
        const grMode = parseGrMode(grParam);
        // P7-B #207 — ?integrator=yoshida4 / velocity-verlet(verlet 별칭) 파싱.
        // 실험적 옵트인 — 기본값 VV 유지, 디버그/검증 목적의 URL 파라미터.
        const integratorParam = new URLSearchParams(window.location.search).get('integrator');
        const integrator = parseIntegratorKind(integratorParam);
        // HUD 배지 + browser-verify 스크립트용 전역 노출.
        Object.defineProperty(window, '__simIntegrator', {
          configurable: true,
          value: integrator,
          writable: false,
        });
        useSimStore.getState().setIntegrator(integrator);
        // P9 #254 PR-3 — ?mass=jupiter×N URL 옵트인 (D7 Osculating 동적 검증용).
        //   형식: `?mass=jupiter×2` / `?mass=jupiter*1.5` / `?mass=jupiter=0.5` (× * = 모두 허용)
        //   효과: Jupiter 질량 배수 변경 → Galilean 위성 궤도반경 자연 감소/증가 관찰
        //   (Osculating 1Hz polling 이 변화 반영 — SatelliteInfoPanel 의 `a` 값 동적 갱신).
        //   ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md` §R2, §재검토 조건 #7.
        const massParam = new URLSearchParams(window.location.search).get('mass');
        if (massParam) {
          // jupiter×N / jupiter*N / jupiter=N — 세 구분자 모두 허용 (URL 인코딩 편의).
          const match = massParam.match(/^jupiter[×*=]([\d.]+)$/);
          if (match) {
            const multiplier = Number(match[1]);
            if (Number.isFinite(multiplier) && multiplier > 0) {
              useSimStore.getState().setMassMultiplier('jupiter', multiplier);
            }
          }
        }
        // P9 #254 PR-2.5 — ?ring=shader|fallback|placeholder URL 옵트인.
        //   shader (기본): `densityProfile[]` uniform + GLSL 선형 보간 (Halo/Main/Gossamer 구분)
        //   fallback: M1 InstancedMesh 입자 분포 (shader 실패 시 자동 전환 또는 수동 테스트)
        //   placeholder: PR-1 단색 disk (회귀 검증)
        const ringParam = new URLSearchParams(window.location.search).get('ring');
        const ringRenderMode: 'shader' | 'fallback' | 'placeholder' =
          ringParam === 'fallback' || ringParam === 'placeholder' ? ringParam : 'shader';
        const solar = sceneApi.createSolarSystemScene(instance.scene, {
          physicsEngine: resolveEngine(useSimStore.getState().physicsEngine),
          asteroidBeltN: beltN,
          asteroidNbody,
          grMode,
          integrator,
          ringRenderMode,
        });

        // P5-C #179 — shader별 GPU ms 노출 (bench 폴링용). solar 생성 후 등록.
        if (gpuTimerParam === '1') {
          Object.defineProperty(window, '__gpuShaderTimings', {
            configurable: true,
            get: () => solar.readShaderTimings(),
          });
        }

        // P10-C-2 #278 — dev 빌드에서 scene handles 노출 (E2E scale 검증 목적).
        if (process.env.NODE_ENV !== 'production') {
          Object.defineProperty(window, '__solarScene', {
            configurable: true,
            value: solar,
            writable: false,
          });
        }

        // P5-D #180 — ?bh=1 옵트인 시 중력렌즈 PostProcess + 블랙홀 메쉬 추가.
        // P6-B #190 — ?bh=2 옵트인 시 정확 shadow + accretion disk PostProcess (별도 모듈).
        const bhParam = new URLSearchParams(window.location.search).get('bh');
        if (bhParam === '1' && instance.scene) {
          const lensing = sceneApi.createGravitationalLensing(instance.scene, camera, {
            position: [3, 0, 0],
            lensStrength: 3,
            visualRadius: 0.3,
          });
          const bhx = Number(new URLSearchParams(window.location.search).get('bhx')) || 3;
          const bhy = Number(new URLSearchParams(window.location.search).get('bhy')) || 0;
          const bhz = Number(new URLSearchParams(window.location.search).get('bhz')) || 0;
          lensing.setPosition(bhx, bhy, bhz);
        } else if (bhParam === '2' && instance.scene) {
          const initialDisk = useSimStore.getState().blackHoleDisk;
          // P7-C #208 — ?ray3d=1 옵트인 시 3D ray construction 경로 활성화.
          // 기본(미지정/0)은 P6-B D' 화면공간 근사 유지 (회귀 격리).
          const ray3dParam = new URLSearchParams(window.location.search).get('ray3d');
          const useRay3D = ray3dParam === '1';
          const bh = sceneApi.createBlackHoleRendering(instance.scene, camera, {
            position: [3, 0, 0],
            visualRadius: 0.3,
            diskInnerRs: initialDisk.innerRs,
            diskOuterRs: initialDisk.outerRs,
            diskEccentricity: initialDisk.eccentricity,
            diskThicknessRs: initialDisk.thicknessRs,
            diskTiltRad: (initialDisk.tiltDeg * Math.PI) / 180,
            useRay3D,
          });
          // 검증 스크립트가 현재 활성 경로를 감지할 수 있도록 전역 노출.
          Object.defineProperty(window, '__bhRay3D', {
            configurable: true,
            value: useRay3D,
            writable: false,
          });
          // store 변경 → handles 호출 (LUT 재생성 0회 — uniform만 갱신).
          const unsubDisk = useSimStore.subscribe((state, prev) => {
            const next = state.blackHoleDisk;
            const old = prev.blackHoleDisk;
            if (next === old) return;
            if (next.innerRs !== old.innerRs) bh.setDiskInner(next.innerRs);
            if (next.outerRs !== old.outerRs) bh.setDiskOuter(next.outerRs);
            if (next.eccentricity !== old.eccentricity) bh.setDiskEccentricity(next.eccentricity);
            if (next.thicknessRs !== old.thicknessRs) bh.setDiskThickness(next.thicknessRs);
            if (next.tiltDeg !== old.tiltDeg) bh.setDiskTilt((next.tiltDeg * Math.PI) / 180);
          });
          // dispose 시 구독 해제 (useEffect cleanup chain에 묶기 위해 ref 보존).
          unsubDiskRef.current = unsubDisk;
        }

        instance.on('timeChanged', ({ julianDate }) => solar.updateAt(julianDate));

        // P11-B #289 — `setLodOverride` command → scene 에 전달. URL `?lod=` 초기 1회 호출 경로.
        // UrlSync 가 mount 시 `sendCommand({ type: 'setLodOverride', level })` 호출 → 여기로 라우팅.
        //
        // [타이밍 주의] UrlSync 의 mount useEffect 는 `setCore(instance)` 직후 실행되지만 scene 초기화
        // (`instance.start().then(...)`) 는 비동기라 handler 가 아직 null. 이 경우 command 가 no-op 되어
        // override 유실. 방어 장치로 handler 등록 시점에 **URL 을 직접 재파싱** 하여 즉시 override 적용
        // (UrlSync 호출이 이미 지나갔어도 최신 URL 상태 복원). 두 경로 동시 적용해도 idempotent.
        instance.setLodOverrideHandler((level) => {
          solar.setLodOverride(level);
        });
        {
          const lodParam = new URLSearchParams(window.location.search).get('lod');
          const parsed = parseLodLevel(lodParam);
          solar.setLodOverride(parsed);
        }

        // 엔진 스토어 변경 → 씬 setPhysicsEngine (#89 심리스 전환)
        // + 질량 배수 변경 → setBodyMassMultiplier (#107)
        // (P12-C #298 — viewMode 구독 삭제: 단일 모드 전환)
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
            if (mesh) {
              // P11-A #288 — Floating Origin primary shift (ADR §1-B).
              // focus 전환과 **동일 프레임** 에 origin 을 해당 body 월드 좌표로 이동.
              // 이후 `updateAt` 이 body 를 scene 원점 근처에서 렌더 → float32 jitter 제거.
              solar.setFocusOrigin(bodyId);
              controller.focusOn({ mesh });
            }
          },
          () => {
            // P12-A #298 — reset 시 focus 해제 → tier 는 free-fly 경로로 판정.
            solar.clearFocus();
            controller.reset(35);
          },
          (radius: number) => {
            camera.radius = radius;
          },
        );

        // P12-A #298 — Tier 하이브리드 트리거 자동 판정 (Q7=7-d2).
        //
        // 매 프레임 카메라 위치 → 현재 tier 재판정 (히스테리시스 ±15% 로 왕복 flicker 방지).
        // focus 존재 시 focus body 거리 기준, 없으면 카메라-원점 거리 기준.
        //
        // 비용: 프레임당 Map lookup 1회 + 산술 연산 ~10회. fps 영향 무시 가능 수준 (ADR 재검토 조건 #10
        // 에 throttle 옵션 예비 박제).
        const onBeforeRender = () => {
          if (!instance.scene) return;
          const activeCam = instance.scene.activeCamera;
          if (!activeCam) return;
          const activeTier = solar.getTier();
          // scene unit → m 환산: 현재 tier 의 renderScale 역수.
          const metersPerSceneUnit = 1 / sceneApi.renderScaleForTier(activeTier);
          const cx = activeCam.globalPosition.x * metersPerSceneUnit;
          const cy = activeCam.globalPosition.y * metersPerSceneUnit;
          const cz = activeCam.globalPosition.z * metersPerSceneUnit;
          const cameraFromSunMeters = Math.sqrt(cx * cx + cy * cy + cz * cz);
          // focus body 와의 거리 — ArcRotateCamera 의 `radius` 가 target 과의 거리 (scene unit).
          // focus 가 없을 때 (free-fly) 도 값은 있지만 solar.updateTierByCamera 가 focus id 부재를
          // 감지해 카메라-원점 경로로 판정하므로 값 자체는 전달만 하고 효과 없음.
          const arcCam = activeCam as unknown as { radius?: number };
          const focusDistSceneUnit = typeof arcCam.radius === 'number' ? arcCam.radius : 0;
          const cameraFromFocusMeters = focusDistSceneUnit * metersPerSceneUnit;
          solar.updateTierByCamera(cameraFromSunMeters, cameraFromFocusMeters);
        };
        const tierObserver = instance.scene.onBeforeRenderObservable.add(onBeforeRender);
        // N1 권고 — unmount / HMR 시 observer 해제. scene dispose 시 자동 정리되지만 React
        // remount 타이밍에 scene 은 살아있고 컴포넌트만 다시 마운트되는 경로를 방어.
        tierObserverCleanupRef.current = () => {
          if (tierObserver && instance.scene) {
            instance.scene.onBeforeRenderObservable.remove(tierObserver);
          }
        };

        // P11-A #288 — dev 빌드 한정 `__floatingOrigin` 전역 노출 (검증 스크립트용).
        // prod 에서도 `__solarScene.floatingOrigin` 경유 접근 가능하지만 편의상 top-level 도 제공.
        if (process.env.NODE_ENV !== 'production') {
          Object.defineProperty(window, '__floatingOrigin', {
            configurable: true,
            get: () => solar.floatingOrigin,
          });
        }
      })
      .catch((err: unknown) => {
        if (cancelled) return;
        console.error('[sim-canvas] 엔진 초기화 실패', err);
      });

    return () => {
      cancelled = true;
      unsubEngine?.();
      unsubDiskRef.current?.();
      unsubDiskRef.current = null;
      tierObserverCleanupRef.current?.();
      tierObserverCleanupRef.current = null;
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
