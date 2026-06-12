'use client';

import { SimulationCore, scene as sceneApi, gpu as gpuApi } from '@astro-simulator/core';
import type { Tier } from '@astro-simulator/core/scene';
import type { CameraSyncSurface } from '@/core/sim-context';
// P12-A #298 — Tier 엔진 유틸 (renderScaleForTier) 는 sceneApi 네임스페이스에 이미 re-export 되어 있다.
// `sceneApi.renderScaleForTier` 로 접근한다 (별도 import 불필요, 아래 onBeforeRender 에서 사용).
import { attachCoreToStore } from '@/core/core-adapter';
import { parseIntegratorKind } from '@/core/parse-integrator';
import { parseGrMode } from '@/core/parse-gr-mode';
import { parseLodLevel } from '@/core/parse-lod-level';
import { parseGpuTier } from '@/core/parse-gpu-tier';
import { parseMarkerMode } from '@/core/parse-marker-mode';
import { detectGpuTier, type GpuTier } from '@/core/detect-gpu-tier';
import { SimCommandProvider } from '@/core/sim-context';
import { useSimStore } from '@/store/sim-store';
import { getBodyScale } from '@/constants/body-scale';
import { render as renderApi } from '@astro-simulator/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * Babylon 캔버스 + Core 초기화.
 * 캔버스 위의 UI는 children/overlay에서 렌더 — 이 컴포넌트는 엔진 lifecycle에만 집중.
 */
export function SimCanvas({ children }: { children?: ReactNode }) {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const coreRef = useRef<SimulationCore | null>(null);
  // P12-A #298 N1 — onBeforeRender observer 중복 등록 방지용 cleanup 핸들.
  // HMR / 컴포넌트 remount 시 scene 이 살아있을 수 있어 관찰자 누수 방지.
  const tierObserverCleanupRef = useRef<(() => void) | null>(null);
  const [core, setCore] = useState<SimulationCore | null>(null);
  // #400 ADR 20260512-au-slider-semantics — ScaleControl 양방향 sync 용 camera + tier getter.
  // sim-canvas 의 `instance.start().then(...)` 내부에서 setupArcRotateCamera + createSolarSystemScene
  // 이 완료되면 setCameraTierApi 로 끌어올린다. SimCommandProvider 가 children 에 전달.
  // - camera: `onViewMatrixChangedObservable` 구독 + `radius` 읽기 (mutate 금지)
  // - getActiveTier: `solar.getTier` 직접 전달 — 호출 시점 active tier snapshot 반환
  const [cameraTierApi, setCameraTierApi] = useState<{
    camera: CameraSyncSurface;
    getActiveTier: () => Tier;
  } | null>(null);

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

      // P11-C #290 — GPU tier 감지 + 프로파일 적용 + Graceful Degradation 알림.
      //
      // P7-D/P7-E 의 모바일 best-effort 분기를 tier 프로파일 감지로 승격. 기존 키
      // `mobile-webgpu-best-effort` 는 `tier-c-graceful-degradation` 으로 치환되며
      // 저성능 데스크톱(WebGL2-only)도 tier-c 경로에 포함된다 (ADR §위험 2 + 알림 키 SSoT §1).
      //
      // 감지 순서 (ADR §결정 §1 축 1):
      //   1. URL `?gpu=a|b|c` 가 있으면 tier 강제 (invalid 는 'auto' 폴백 + console.warn)
      //   2. 그 외 → `detectGpuTier(input)` 자동 감지
      //   3. tier-c 시 LOD 'low' 강제 + 알림 키 'tier-c-graceful-degradation' 표시
      //
      // SSR 디폴트는 `GPU_TIER_SSR_DEFAULT='b'` 중립. hydration 후 실측으로 덮어쓴다.
      if (typeof navigator !== 'undefined') {
        const gpuUrlParam = new URLSearchParams(window.location.search).get('gpu');
        const parsedGpu = parseGpuTier(gpuUrlParam);
        const detectedTier: GpuTier =
          parsedGpu !== 'auto'
            ? parsedGpu
            : detectGpuTier({
                webgpu: {
                  supported: cap.webgpu,
                  adapterInfo: cap.adapterInfo ?? null,
                },
                hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
                navigator: {
                  userAgent: navigator.userAgent,
                  maxTouchPoints: navigator.maxTouchPoints,
                },
              });

        // browser-verify / dev overlay 에서 감지 tier 확인 가능하도록 전역 노출.
        Object.defineProperty(window, '__gpuTier', {
          configurable: true,
          value: detectedTier,
          writable: false,
        });

        // tier-c → 자동 최대 억제 조합 (ADR §축 5 후보 A — DoD #5).
        //   - LOD 'low' 강제 (단, URL `?lod=` 가 있으면 URL 우선)
        //   - 알림 키 'tier-c-graceful-degradation' 표시
        //   - 파티클/shadow/post-proc OFF 는 tier profile 소비자가 scene 구성 시 반영
        if (detectedTier === 'c') {
          const profile = renderApi.TIER_PROFILES.c;
          const lodParam = new URLSearchParams(window.location.search).get('lod');
          const hasLodOverride = lodParam !== null && lodParam !== '';
          if (!hasLodOverride && profile.lod.forceOverride) {
            // LOD 'low' 강제 — scene 초기화 완료 후 적용되도록 command stream 경유.
            // sendCommand 가 아직 handler 를 못 연결했을 수 있어도 setLodOverrideHandler
            // 등록 시점에 URL 재파싱 경로가 fallback 처리 (기존 P11-B handler 로직 재사용).
            // 여기서는 window 에 예약 플래그만 박제 — handler 등록 시 참고.
            Object.defineProperty(window, '__gpuTierForceLod', {
              configurable: true,
              value: profile.lod.forceOverride,
              writable: false,
            });
          }
          useSimStore.getState().setEngineNotice({
            key: 'tier-c-graceful-degradation',
            message:
              '저성능 환경 감지 — 시각 효과가 자동 축소됩니다. (URL ?gpu=b|a 로 수동 상향 가능)',
          });
        }
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
        // [preview] ?marker=glow — sub-pixel body 글로우 픽셀 마커 옵트인 (미지정 시 기존 동작 100% 동일).
        const markerParam = new URLSearchParams(window.location.search).get('marker');
        const markerMode = parseMarkerMode(markerParam);
        const solar = sceneApi.createSolarSystemScene(instance.scene, {
          physicsEngine: resolveEngine(useSimStore.getState().physicsEngine),
          asteroidBeltN: beltN,
          asteroidNbody,
          grMode,
          integrator,
          ringRenderMode,
          // R1 #329 — body 별 시각 과장 배수 주입 (DI). 현재 `sun = 75` 만 정의됨.
          // ADR `docs/decisions/20260425-r1-sun-visualization.md` §결정 3.
          bodyScale: getBodyScale,
          // #444 — tier transition 윈도우 사용자 입력 시도 카운트. SimulationCore.metrics 누적.
          // DevTools: `__simCore.metrics.tierTransitionInputDrops`. G8b 격상 결정 데이터.
          onTierTransitionInputAttempts: (count) => {
            instance.metrics.tierTransitionInputDrops += count;
          },
          // [preview] glow pixel marker — ?marker=glow 일 때만 true.
          glowMarker: markerMode === 'glow',
        });

        // #400 ADR 20260512-au-slider-semantics — ScaleControl 양방향 sync 용 camera + tier getter 노출.
        // SimCommandProvider 에 전달 → ScaleControl 이 `useSimCameraTier` 로 구독.
        // camera 는 setupArcRotateCamera 의 instance, getActiveTier 는 solar.getTier 직접 전달.
        if (!cancelled) {
          setCameraTierApi({ camera, getActiveTier: solar.getTier });
        }

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
        // (#405 — `?bh=2` accretion disk 경로는 v3 reset 후 적용 대상 없어 폐기.
        //  BlackHoleDiskPanel + store.blackHoleDisk + createBlackHoleRendering 호출 함께 제거.)
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
          // P11-C #290 — URL `?lod=` 가 없고 GPU tier-c 가 LOD low 강제를 예약했으면 그걸 적용.
          //   URL 우선 원칙: `?lod=` 가 있으면 사용자 디버그 경로를 차단하지 않는다.
          const hasLodUrl = lodParam !== null && lodParam !== '';
          const tierForced = (window as { __gpuTierForceLod?: 'high' | 'mid' | 'low' })
            .__gpuTierForceLod;
          if (!hasLodUrl && tierForced) {
            solar.setLodOverride(tierForced);
          } else {
            solar.setLodOverride(parsed);
          }
        }

        // R1 #334+#335 — store-scene 동기화 단일 경로 helper.
        //
        // ADR `20260425-r1-store-scene-sync-unification.md` §결정 4.
        // 마운트 직후 1회 sync 와 subscribe 분기가 동일 식 사용 → DRY (`syncFocusToScene` 1곳 수정으로
        // 두 진입점 일관 변경). 신규 진입점 추가 시 (예: 모바일 swipe gesture) 도 본 helper 재사용.
        //
        // 의도:
        //  - id !== null  → solar.setFocusOrigin(id) + controller.focusOn(mesh) (mesh 존재 시)
        //  - id === null  → solar.clearFocus() + controller.reset(35)
        //                   ("focus 해제 = 카메라 reset" 박제 — ADR §결정 3).
        const syncFocusToScene = (bodyId: string | null) => {
          if (bodyId !== null) {
            const mesh = solar.meshes.get(bodyId);
            if (mesh) {
              // P11-A #288 — Floating Origin primary shift (ADR §1-B).
              // focus 전환과 **동일 프레임** 에 origin 을 해당 body 월드 좌표로 이동.
              solar.setFocusOrigin(bodyId);

              // #408 F1 — focusOn 진입 시 final tier 사전 결정 + setTier (의존 역전 (c) 채택).
              //
              // 목적: controller.focusOn 의 cam-target tween (300ms) 보간 중간 frame 에서
              // `cameraFromFocusMeters` 가 일시적으로 0.1 AU 미만으로 떨어져 `tierFromFocus` 가
              // 잘못된 tier 를 반환하는 race 차단. tier 가 보간 시작 **전에** 정착되므로 보간 중
              // updateTierByCamera 가 동일 tier 반환 → no-op.
              //
              // cameraDistMeters 산식 — camera-controller.ts focusOn() 의 desiredRadius 와 정합:
              //   desiredRadius = max(meshRadius × FOCUS_USER_RADIUS_MULTIPLIER,
              //                       meshRadius + FOCUS_USER_RADIUS_MIN_PADDING)
              //   metersPerSceneUnit = 1 / renderScaleForTier(currentTier)
              //   cameraDistMeters = desiredRadius × metersPerSceneUnit
              //
              // 주의: meshRadius (boundingSphere.radiusWorld) 는 **현 tier** 의 scaling 이 적용된
              // 상태값이므로 metersPerSceneUnit 도 **현 tier** 기준이어야 일관 (`tierFromFocus`
              // 가 결정한 newTier 적용 전이라 같은 tier 의 식). 결정된 finalTier 가 다르면 setTier
              // 가 즉시 mesh.scaling 과 origin 을 갱신하므로 다음 controller.focusOn 호출 시
              // mesh.absolutePosition 은 새 tier 좌표계에서 정확.
              // R4 #539 Amendment 3 — satellite focus multiplier 분기 (식 후보 2).
              // moon focus 시 visual scale=30 + moonScale=800 결합으로 wsRadius 가 매우 커
              // 기존 ×5 식이 mesh 내부 (`cameraRadius/moonScaling ≈ 1.011`) 에 카메라 박힘.
              // satellite (parentId ≠ null && parentId ≠ 'sun') 는 ×20 적용해 mesh 외각 보장
              // (D3.3 cameraRadius/moonScaling > 1.5 통과). R5+ phobos/io/europa/titan 자동 수용.
              // ADR `20260520-r4-earth-moon-visualization.md` §Amendment 3 §식 후보 2.
              const parentId = solar.getBodyParentId(bodyId);
              const focusMultiplier = sceneApi.resolveFocusMultiplier(parentId);

              // 1차 측정 — 현 tier 기준 cameraDistMeters 산출 (applyFocusTier 입력용).
              mesh.computeWorldMatrix(true);
              const meshRadiusPre = mesh.getBoundingInfo().boundingSphere.radiusWorld;
              const desiredRadiusPre = Math.max(
                meshRadiusPre * focusMultiplier,
                meshRadiusPre + sceneApi.FOCUS_USER_RADIUS_MIN_PADDING,
              );
              const currentTier = solar.getTier();
              const metersPerSceneUnit = 1 / sceneApi.renderScaleForTier(currentTier);
              const cameraDistMeters = desiredRadiusPre * metersPerSceneUnit;
              solar.applyFocusTier(bodyId, cameraDistMeters);

              // R4 #539 Amendment 3 — applyFocusTier 가 setTier 트리거 시 mesh.scaling 이 즉시
              // 갱신되므로 wsRadius 재측정 필수. tier T1→T3 전환 시 wsRadius 가 0.2 → 60426 으로
              // 점프 (≈ ×300000), 1차 desiredRadius=4.04 로 controller.focusOn 호출하면 새 tier
              // mesh 내부 매우 깊숙이 카메라 박힘 → D3.2 isVisible=false 회귀.
              // 2차 측정으로 tier 전환 후 mesh radius 기준 desiredRadius 재계산.
              mesh.computeWorldMatrix(true);
              const meshRadius = mesh.getBoundingInfo().boundingSphere.radiusWorld;
              const desiredRadius = Math.max(
                meshRadius * focusMultiplier,
                meshRadius + sceneApi.FOCUS_USER_RADIUS_MIN_PADDING,
              );

              // controller.focusOn 도 동일 식 적용 (sim-canvas SSoT 단일). 명시적 radius 전달로
              // camera-controller 내부 default 식 (×5) 우회 — Amendment 3 satellite 분기 정합.
              controller.focusOn({ mesh, radius: desiredRadius });
            }
          } else {
            // P12-A #298 — focus 해제 → tier 는 free-fly 경로로 판정.
            solar.clearFocus();
            controller.reset(35);
          }
        };

        // #509 — 자유시점 (free-fly) 진입 분기. clearFocus + reset 과 달리 tier/origin/camera 보존.
        // syncFocusToScene 과 별도 helper — selectedBodyId 변화 (null 전이) 와 freeFlyMode 변화를
        // 분리 처리하기 위함 (resetCamera vs enterFreeFly 경로 구분).
        const detachToFreeFly = () => {
          // #631 — deep tier(body, 위성/근접 focus)에서 탐색 진입 시: 시점 보존(#509)을 그대로 두면
          // target 이 focus body 의 먼 위치(예: io ~5.2 AU)에 동결되어 줌아웃해도 태양계가 frame 밖
          // → "허공" (D-T2). 따라서 body tier 진입은 태양계 개요로 pull-back 한다 (target→sun 원점 +
          // solar radius). controller.reset 은 alpha/beta(시점 방향)는 유지하므로 "현재 각도로 태양계
          // 전체를 보는" 자연스러운 탐색이 된다. inner/solar tier(행성)는 기존 #509 시점 보존 유지.
          if (solar.getTier() === 'body') {
            solar.clearFocus();
            // controller.reset() 기본값 = (radius 35, target 원점) = 태양계 개요. 매직 넘버 없이
            // 문서화된 default 사용 (cross-validate agy 권고 #1).
            controller.reset();
            return;
          }
          solar.detachFocus();
          controller.clearFollow();
        };

        // 엔진 스토어 변경 → 씬 setPhysicsEngine (#89 심리스 전환)
        // + 질량 배수 변경 → setBodyMassMultiplier (#107)
        // + selectedBodyId 변경 → syncFocusToScene (R1 #334+#335 — scene focus / camera 단일 책임)
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
          // R1 #334+#335 — selectedBodyId ↔ scene focus 동기화 (단일 진실원).
          //
          // 클릭 / URL / programmatic 진입 모두 동일 흐름:
          //   sendCommand({ type: 'focusOn' | 'resetCamera' })
          //     → simulation-core 가 'bodySelected' event emit
          //     → core-adapter 가 store.setSelectedBody(id) 호출
          //     → 본 subscribe 가 변화 감지 → syncFocusToScene(id) 호출 (단일 호출).
          //
          // 이전 (Phase 1 fix `acfcb74`): subscribe 분기 + setCameraHandlers focus/reset 콜백 이중 경로.
          // 이중 호출로 `controller.focusOn` 의 `Animation.CreateAndStartAnimation × 2` 가 2회 폐기 + 재시작.
          if (state.selectedBodyId !== prev.selectedBodyId) {
            // #509 — selectedBodyId=null 전이 시 freeFlyMode 확인. true 면 detachToFreeFly (시점 유지),
            // false 면 syncFocusToScene (sun 중심 reset). enterFreeFly action 이 selectedBodyId=null +
            // freeFlyMode=true 를 같은 set 으로 commit 하므로 두 상태가 동시 관찰됨.
            if (state.selectedBodyId === null && state.freeFlyMode) {
              detachToFreeFly();
            } else {
              syncFocusToScene(state.selectedBodyId);
            }
          }
        });
        // R1 #334+#335 — `setCameraRadiusHandler` 단일 인자 (focus/reset 콜백 폐기 — ADR §결정 2).
        instance.setCameraRadiusHandler((radius: number) => {
          camera.radius = radius;
        });

        // R1 #334+#335 — 마운트 직후 selectedBodyId 가 이미 있으면 helper 로 1회 초기 sync.
        //
        // URL `?focus=sun` 진입 케이스: url-sync.tsx 의 useEffect 가 sendCommand({ type:'focusOn' }) +
        // setSelectedBody(urlFocus) 호출하지만, sim-canvas 마운트 시점에는 두 호출 모두 이미 끝나
        // store snapshot 에 selectedBodyId 가 박혀있다. 위 subscribe 는 마운트 후의 변화만 감지하므로
        // 마운트 직후 명시적 1회 sync 로 첫 프레임부터 high LOD 진입.
        // ADR `20260425-r1-store-scene-sync-unification.md` §축 3 후보 B.
        syncFocusToScene(useSimStore.getState().selectedBodyId);

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
          // #631 — cameraFromSunMeters 는 sun(절대 월드 원점) 기준 거리여야 한다.
          // body tier 에서 floatingOrigin 이 focus body 로 이동(originOffset ≠ 0)하므로
          // globalPosition(shifted-origin local) × metersPerSceneUnit 만으로는 focus body 로부터의
          // 거리가 되어 sun 거리를 과소 측정한다. originOffset(m) 을 가산해 참 거리를 구한다.
          // 누락 시 free-fly 줌아웃에서 tier 가 escalate 안 됨(body 고정 → 허공). 씬 updateAt
          // (solar-system-scene.ts:1093-1098)의 cameraWorldMeters 계산과 동일 패턴.
          // T1/T2 는 originOffset=[0,0,0] 이라 무영향, body tier 만 교정.
          const origin = solar.floatingOrigin.originOffset;
          const cx = activeCam.globalPosition.x * metersPerSceneUnit + origin[0];
          const cy = activeCam.globalPosition.y * metersPerSceneUnit + origin[1];
          const cz = activeCam.globalPosition.z * metersPerSceneUnit + origin[2];
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
      tierObserverCleanupRef.current?.();
      tierObserverCleanupRef.current = null;
      detach();
      instance.dispose();
      coreRef.current = null;
      setCore(null);
      // #400 — camera 도 dispose 됨. ScaleControl 이 다음 mount 까지 subscribe 보류.
      setCameraTierApi(null);
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
      <SimCommandProvider
        core={core}
        camera={cameraTierApi?.camera ?? null}
        getActiveTier={cameraTierApi?.getActiveTier ?? null}
      >
        {children}
      </SimCommandProvider>
    </>
  );
}
