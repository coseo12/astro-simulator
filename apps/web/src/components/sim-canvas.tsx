'use client';

import {
  SimulationCore,
  scene as sceneApi,
  gpu as gpuApi,
  isRPhaseFocusable,
} from '@astro-simulator/core';
// #713 — canvas 클릭/터치 picking. PointerEventTypes 는 web Babylon (^9) 에서 직접 import.
import { PointerEventTypes } from '@babylonjs/core';
import type { Tier } from '@astro-simulator/core/scene';
import type { CameraSyncSurface } from '@/core/sim-context';
// P12-A #298 — Tier 엔진 유틸 (renderScaleForTier) 는 sceneApi 네임스페이스에 이미 re-export 되어 있다.
// `sceneApi.renderScaleForTier` 로 접근한다 (별도 import 불필요, 아래 onBeforeRender 에서 사용).
import { attachCoreToStore } from '@/core/core-adapter';
import { parseIntegratorKind } from '@/core/parse-integrator';
import { parseGrMode } from '@/core/parse-gr-mode';
import { parseLodLevel } from '@/core/parse-lod-level';
import { parseGpuTier } from '@/core/parse-gpu-tier';
import { parseGlowMarkerRatio, parseMarkerMode } from '@/core/parse-marker-mode';
import { parseOrbitsVisible } from '@/core/parse-orbits-mode';
import { parseStarsVisible, resolveStarfieldVisible } from '@/core/parse-stars-mode';
import { detectSoftwareRenderer } from '@/core/detect-software-renderer';
import { detectGpuTier, type GpuTier } from '@/core/detect-gpu-tier';
import { SimCommandProvider } from '@/core/sim-context';
import { useSimStore } from '@/store/sim-store';
import { getBodyScale } from '@/constants/body-scale';
import { render as renderApi } from '@astro-simulator/core';
import { useEffect, useRef, useState, type ReactNode } from 'react';

/**
 * #745 — WebGL `UNMASKED_RENDERER_WEBGL` 문자열을 **임시 canvas** 로 동기 추출.
 *
 * 소프트웨어 렌더 (swiftshader/llvmpipe/swrast) 감지의 주(primary) 신뢰 소스. CI swiftshader 는
 * WebGL2 경로 (WebGPU 미지원) 이고 RENDERER 에 `SwiftShader` 문자열이 확실히 포함된다 (실측 확정).
 * 임시 canvas 는 Babylon engine lifecycle 결합도 0 — 실측상 임시 canvas 와 실 engine context 가
 * 동일 SwiftShader 를 반환한다 (ADR §Amendment 2 agy Q3 수용). 추출 실패 시 null (보수적 — 별 표시).
 */
function extractWebglRendererString(): string | null {
  if (typeof document === 'undefined') return null;
  try {
    const canvas = document.createElement('canvas');
    const gl =
      (canvas.getContext('webgl2') as WebGL2RenderingContext | null) ??
      (canvas.getContext('webgl') as WebGLRenderingContext | null);
    if (!gl) return null;
    const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
    if (!debugInfo) return null;
    const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL);
    return typeof renderer === 'string' ? renderer : null;
  } catch {
    // context 생성/확장 실패 — 보수적으로 null (별 표시 유지).
    return null;
  }
}

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
    //
    // #738 Amendment — 단일 Promise 를 두 async chain (capability 감지 / scene 생성) 이 공유한다.
    // GPU tier 는 이 then 에서 LOD 강제/알림에 쓰이고, scene 콜백은 WebGPU adapterInfo (별 배경
    // 소프트웨어 렌더 보조 감지 — #745) 등에 gpuCap 을 쓴다. 두 경로가 별개로 detectGpuCapability()
    // 를 호출하면 adapter 요청이 2회 발생 + 결과 비결정 (race) → 동일 Promise 공유로 SSoT 1회
    // (#677 race 윈도우 차단).
    const gpuCapPromise = gpuApi.detectGpuCapability();

    // #738 — GPU tier 판정 SSoT (URL ?gpu= override > detectGpuTier 자동 감지). LOD 강제/알림용.
    // (#745 부터 별 배경 비활성은 tier 가 아닌 소프트웨어 렌더 감지 기준 — resolveGpuTier 와 무관.)
    const resolveGpuTier = (cap: Awaited<typeof gpuCapPromise>): GpuTier => {
      const gpuUrlParam = new URLSearchParams(window.location.search).get('gpu');
      const parsedGpu = parseGpuTier(gpuUrlParam);
      if (parsedGpu !== 'auto') return parsedGpu;
      return detectGpuTier({
        webgpu: { supported: cap.webgpu, adapterInfo: cap.adapterInfo ?? null },
        hardwareConcurrency: navigator.hardwareConcurrency ?? 0,
        navigator: { userAgent: navigator.userAgent, maxTouchPoints: navigator.maxTouchPoints },
      });
    };

    gpuCapPromise.then((cap) => {
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
        // #738 — tier 판정 SSoT (resolveGpuTier) 사용. LOD 강제/알림용 (별 배경 비활성은 #745 부터
        // 소프트웨어 렌더 감지 기준 — tier 와 분리).
        const detectedTier: GpuTier = resolveGpuTier(cap);

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
            // LOD 'low' 강제 — 적용 경로 2중화 (#677 forensic fix).
            //
            // 본 then (capability 감지) 과 instance.start().then (handler 등록 + 플래그 읽기) 은
            // 별개 async chain 이라 완료 순서가 비결정적이다:
            //  (1) 감지가 먼저 → window 플래그 박제 → handler 등록 시점 읽기가 적용 (기존 P11-B 경로)
            //  (2) scene 초기화가 먼저 → 플래그 읽기 시점이 이미 지나가 강제 low 영구 유실 →
            //      auto LOD (sun high + mid sphere) 렌더 → CI fps-baseline-guard flaky FAIL
            //      (#677 — glow 무관. develop push run 27412497611 desktop 28.1 FPS 선행 사례.
            //      headless/저속 환경에서 requestAdapter 가 느릴 때 발현)
            // 방향 (2) 를 command 직접 발행으로 커버 — handler 미등록이면 no-op (방향 (1) 이 처리),
            // 양 경로 동시 적용은 idempotent. 회귀 가드: browser-verify-glow-marker.mjs 축 6.
            Object.defineProperty(window, '__gpuTierForceLod', {
              configurable: true,
              value: profile.lod.forceOverride,
              writable: false,
            });
            coreRef.current?.command({ type: 'setLodOverride', level: profile.lod.forceOverride });
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
    // #699 — 캔버스 키보드 포커스 복원 (ADR §5-6, cross-validate 고유 발견 3).
    // WASD 키 입력은 canvas 가 키보드 포커스를 가져야 attachWasdControl 의 activeElement 가드를
    // 통과한다. 사이드바 버튼(탐색/focus 등) 클릭 후 그 버튼이 포커스를 가져가면 WASD 가 무반응
    // → pointer 가 canvas 위로 진입할 때 자동으로 canvas 에 포커스를 되돌린다. named handler +
    // 아래 cleanup 에서 removeEventListener (HMR/unmount 리스너 누수 방지).
    const refocusCanvas = () => {
      const active = document.activeElement;
      // 텍스트 입력 포커스 중에는 가로채지 않는다(사용자 입력 보호).
      const isTextInput =
        active instanceof HTMLElement &&
        (active.tagName === 'INPUT' || active.tagName === 'TEXTAREA' || active.isContentEditable);
      if (isTextInput) return;
      if (document.activeElement !== canvas) canvas.focus();
    };
    canvas.addEventListener('pointerenter', refocusCanvas);
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
    // #704 — free-fly 감도 zoom/zoomoutFactor push 구독 해제 핸들 (cleanup 에서 호출).
    let unsubSensitivity: (() => void) | null = null;
    // #738 — scene 생성을 GPU capability 와 함께 await (Promise.all). createSolarSystemScene 의
    // starfield 옵션은 GPU 환경에 의존 (#745: 소프트웨어 렌더면 fill-rate graceful degradation
    // 으로 스킵 — WebGPU adapterInfo 보조 감지에 gpuCap 필요)하므로 scene 콜백 진입 시점에 gpuCap
    // 이 확정돼야 한다. instance.start() 만 await 하면 capability 가 아직 미해결일 수 있어 race
    // (#677 윈도우). Promise.all 로 둘 다 동기 사용 가능.
    Promise.all([instance.start(), gpuCapPromise])
      .then(([, gpuCap]) => {
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
        // #693 — free-fly 패닝 활성 상태. free-fly 진입(detachToFreeFly) 시 true, focus/reset
        // (syncFocusToScene) 시 false. onBeforeRender 가 이 플래그를 읽어 free-fly 중에만 radius
        // 비례 panningSensibility 를 매 프레임 재산출(줌 일관성, ADR §결정 2). 토글 SSoT 는
        // sceneApi.setPanningEnabled 1곳.
        let freeFlyActive = false;
        // #699 — free-fly 진입 시점 카메라 radius 스냅샷 (sun anomaly 구조적 차단 — ADR §5-2).
        //
        // [문제] focus 후 free-fly 진입 시 다음 onBeforeRender 의 updateTierByCamera 가
        // tierFromCameraDistance 로 tier 를 재판정해 즉시 escalate → runTierTransition 의 실거리
        // 보존 산식(radius_new = radius_old × newScale/oldScale)이 발화해 진입 radius 를 덮어쓴다
        // (sun 25.3→463.9 = 18× 줌아웃 / io 158386→35 = #631 강제 pull-back). 둘 다 "진입 시점 시점
        // 보존"(#509)을 깬다.
        // [구조적 차단] "진입 직후 1회 억제"(첫 프레임 후 휠 1칸에 snap-back 위험)를 폐기하고,
        // **진입 radius 기준 임계**로 tier escalation 을 gate 한다 — 사용자가 진입 radius 보다 유의미
        // 하게 **줌아웃**(radius 증가)할 때만 escalate 허용. 줌인/소폭 변동은 tier 유지 → 진입 radius
        // 보존 + snap-back 0. (ADR §5-2 "이후 사용자 줌 시에만 정상 escalate".)
        let freeFlyEntryRadius: number | null = null;
        // #704 (ADR `20260618-704-body-tier-zoomout-jump.md` §5 옵션 c) — free-fly 진입 시점 **body
        // tier anchor** (탐색 시작 body id). body tier(위성 focus)에서 free-fly 진입한 경우에만 설정.
        //
        // [회귀] 외행성계 위성(io=목성계 5.2AU) focus → free-fly → 줌아웃 시, detachFocus 가 focus
        // tracking 을 해제(focusBodyIdForAssert=null)하면 updateTierByCamera 가 tierFromCameraDistance
        // (cameraFromSun) 경로를 탄다. io 는 cameraFromSun 이 본질적으로 solar 영역(5.2AU > solarUpper
        // 3AU)이라 줌아웃하면 즉시 body→solar 직행 escalate → rescale 급락(158386→0.53, ×3.35e-6).
        // earth/default(inner/solar)는 cameraFromSun 이 정상 클램프되어 무회귀(#704 B-1).
        //
        // [fix] anchor 가 설정되면 escalation gate 가 updateTierByCamera 에 anchor id 를 전달 → Core 가
        // cameraFromSun 대신 anchor(위성) 기준 tierFromFocus 로 판정 → 위성 kind('moon')는 항상 body
        // 반환 → 줌아웃해도 body tier 유지(위성 근방 탐색 보존, escalate 0). 외/내행성 위성 무관 동일
        // (이견 4). 줌아웃 상한은 entryRadius×zoomoutFactor 가 차단(#631 허공 방지 계승). 진입 tier 가
        // body 가 아니면(earth/default) null → 기존 cameraFromSun 경로 유지(#704 B-1 무회귀).
        let freeFlyAnchorBodyId: string | null = null;
        // #699 — free-fly WASD/QE 키보드 이동 핸들 (#696 PR #698 통합 재구현 — 계수 0.015).
        // free-fly 진입 시 setEnabled(true), focus/reset 시 setEnabled(false)(focus follow 충돌
        // 회피). 패닝(#693)과 동일 freeFlyActive 토글 SSoT 를 공유한다 — 입력 채널만 별개(키 vs 드래그).
        // reset/focus 진입 시 clearKeys 로 눌림 키 잔류 방지(키업 유실 대비). unmount/HMR 시 detach.
        // #704 — WASD 계수 getter pull (매 프레임 store 최신값). 슬라이더로 wasd 감도를 키 hold 중
        // 변경해도 즉시 반영(스냅샷 아님 — ADR §결정 1 축 1-A). maxStep 은 1차 비노출이라 const 고정.
        const wasdControl = sceneApi.attachWasdControl(camera, instance.scene, () => ({
          wasd: useSimStore.getState().freeFlySensitivity.wasd,
          maxStep: sceneApi.MAX_MOVE_STEP,
        }));
        // camera dispose 시 WASD observer/blur 리스너 해제 (HMR/StrictMode 재마운트 누수 방지 —
        // #693 contextmenu handler onDisposeObservable 선례).
        camera.onDisposeObservable.add(() => wasdControl.detach());
        // #699 — free-fly 줌아웃 상한 (허공 대체 처리 — ADR §5-3). 진입 시 강제 줌아웃(#631) 대신
        // 사용자가 줌아웃할 때 빈 공간 도달 직전에서 멈춘다.
        //
        // [tier-relative 설계] radius 는 tier 별 renderScale 에 종속(solar≈35 ↔ body≈158386)이라
        // **고정 scene-unit 상한은 tier 마다 의미가 달라** 진입 radius 를 잘못 clamp 한다(body tier
        // 158386 을 4000 으로 강제 = io 강제 pull-back 재현). 따라서 상한을 **진입 radius 비례**로 둔다:
        //   upperRadiusLimit = entryRadius × FREE_FLY_ZOOMOUT_FACTOR
        // 진입 radius 보존(clamp 없음) + factor 만큼 줌아웃 허용(그 사이 tier escalation gate 가
        // 임계 초과 시 escalate → 새 tier 에서 radius 재산정). escalation 후(gate 해제)에는 solar
        // 개요 상한(SOLAR_ZOOMOUT_LIMIT)으로 좁혀 빈 공간 진입을 차단한다.
        // #704 — 줌아웃 배율은 store 사용자 감도 (default 5 = FREE_FLY_ZOOMOUT_FACTOR_DEFAULT).
        // 진입 시 1회 산정이라, free-fly 활성 중 슬라이더 변경은 아래 store 구독이 즉시 재산정한다
        // (ADR §결정 1 줌아웃 실시간 반영 — agy 이견 수용). 함수로 매 사용 시점 store 최신값 pull.
        const getZoomoutFactor = () => useSimStore.getState().freeFlySensitivity.zoomoutFactor;
        // tier escalation 후 solar 개요에서의 줌아웃 상한 (scene unit). 해왕성 30 AU ≈ 3.8 scene unit
        // (solar renderScale) 이라 1000 은 외곽 관찰 충분 + 그 너머 빈 공간 차단. D-T2 튜닝 지점.
        const SOLAR_ZOOMOUT_LIMIT = 1000;
        const DEFAULT_UPPER_RADIUS_LIMIT = camera.upperRadiusLimit ?? 1e14;
        // #699 — setupArcRotateCamera 기본 lowerRadiusLimit (focusOn 이 desiredRadius×0.5 로 낮춘 것을
        // free-fly 진입 시 원복하기 위한 SSoT — ADR §5-2 sun anomaly 차단 (a)).
        const DEFAULT_LOWER_RADIUS_LIMIT = 0.5;
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
        // #675 — glow pixel marker 기본 ON + `?marker=off` 옵트아웃 (ADR 20260613-675 §축 1).
        const markerParam = new URLSearchParams(window.location.search).get('marker');
        const markerMode = parseMarkerMode(markerParam);
        // #675 — ?ratio= glow marker 모행성:위성 비율 (PM 확정 기본 2:1, 디버그용 — ADR §축 7).
        const ratioParam = new URLSearchParams(window.location.search).get('ratio');
        const glowMarkerRatio = parseGlowMarkerRatio(ratioParam);
        // #738 — 별 배경 기본 ON + `?stars=off` 옵트아웃 (ADR 20260624-738 §결정 7).
        const starsParam = new URLSearchParams(window.location.search).get('stars');
        const starsParamVisible = parseStarsVisible(starsParam);
        // #738 Amendment (PR #742) / #745 Amendment 2 — 소프트웨어 렌더 (swiftshader/llvmpipe/swrast)
        // 에서는 별 배경을 생성하지 않는다 (fill-rate graceful degradation). 전체화면 절차 fragment
        // shader 가 소프트웨어 렌더에서 fill-rate 치명타 (CI desktop ~13fps, baseline 49.9 대비 진짜
        // 회귀). #745 정정: Amendment 1 은 비활성 기준을 tier-c (WebGPU 미지원 데스크톱 전부 — 소프트웨어
        // + WebGL2 하드웨어 무구분) 로 잡아 하드웨어 가속 PC 에서도 별이 사라지는 과잉 비활성 회귀 →
        // 진짜 기준인 소프트웨어 렌더로 정정. renderer 추출: WebGL UNMASKED 1차/주 (CI swiftshader 확실
        // 감지 — fps 무회귀 핵심 제약) + WebGPU adapterInfo.description 보조 OR (빈 {} 라 신뢰 낮음).
        // 결정식 SSoT = resolveStarfieldVisible + detectSoftwareRenderer (단위 테스트 가드).
        const rendererString =
          extractWebglRendererString() ?? gpuCap.adapterInfo?.description ?? null;
        const isSoftwareRenderer = detectSoftwareRenderer(rendererString);
        const starfieldVisible = resolveStarfieldVisible(starsParamVisible, !isSoftwareRenderer);
        // browser-verify / dev overlay 에서 별 가시성 + software 감지 결과 확인용 전역 노출.
        // CI(software) 에서 __starfieldVisible=false / 하드웨어에서 true assertion (fps 회귀 전 조기 검출).
        Object.defineProperty(window, '__starfieldVisible', {
          configurable: true,
          value: starfieldVisible,
          writable: false,
        });
        Object.defineProperty(window, '__isSoftwareRenderer', {
          configurable: true,
          value: isSoftwareRenderer,
          writable: false,
        });
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
          // #675 — glow pixel marker. 기본 ON 은 parseMarkerMode 기본값 ('glow') 이 결정 —
          // core 옵션 기본값은 false 유지 (ADR 20260613-675 §축 1 레이어 분리).
          glowMarker: markerMode === 'glow',
          // #675 — 모행성:위성 marker 비율 (glowMarker=false 면 scene 이 무시).
          glowMarkerSatelliteRatio: glowMarkerRatio,
          // #738 — 별 배경 + 은하수. 기본 ON 은 parseStarsVisible 기본값 (true) 이 결정 —
          // core 옵션 기본값은 false 유지 (ADR 20260624-738 §결정 7 레이어 분리).
          starfield: starfieldVisible,
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

        // #713 — canvas 클릭/터치 → body 선택 (raycast picking).
        // ADR `docs/decisions/20260620-713-click-body-select.md` §3 핵심 데이터 흐름.
        //
        // web 레이어 책임: POINTERDOWN/UP observable 등록 + 드래그/멀티터치/click-through 가드.
        // "engine px → bodyId 역변환" 은 core 순수 헬퍼 resolvePickedBodyId 에 위임 (단위 테스트 가능).
        // 선택은 기존 진입점 instance.command({type:'focusOn'}) 재사용 — isRPhaseFocusable 가드 +
        // bodySelected emit → core-adapter setSelectedBody → syncFocusToScene (카메라/tier/free-fly
        // 해제) 전부 자동. 따라서 simulation-core / sim-store / core-adapter 변경 0 라인 (Concrete Prediction).
        const pointerScene = instance.scene;
        if (pointerScene) {
          // pointerdown 좌표 + pointerId 기록 (드래그 판정 기준). engine px (scene.pointerX/Y) 사용 —
          // #623 adaptToDeviceRatio:true 정합 (CSS px 금지). cross-validate 보강 (4).
          let downX = 0;
          let downY = 0;
          let downPointerId: number | null = null;
          // 멀티터치 가드 — 활성 포인터 집합. size===1 일 때만 클릭 연산 (핀치줌/2-finger 회전 중
          // 한 손가락 먼저 떼며 발생하는 POINTERUP 오선택 방지). cross-validate 보강 (1).
          const activePointers = new Set<number>();

          // #719 — 겹침 cycle 상태 (web 클로저 로컬, core stateless 유지 — ADR §결정 2).
          //   lastClickX/Y      : 직전 클릭 engine px 좌표 ("같은 위치" 판정 기준).
          //   lastSelectedBodyId: 직전 선택 bodyId (cycle 다음 앵커 — ADR §결정 4 직전 id +1 wrap).
          // downX/activePointers 가 이미 사는 클로저와 동형. instance.start().then() 내부 1회 등록이라
          // 세션 동안 생존 (agy ① — #713 activePointers 클로저 패턴 답습, useRef 전환 불요).
          let lastClickX: number | null = null;
          let lastClickY: number | null = null;
          let lastSelectedBodyId: string | null = null;

          // click-through 가드 — pointer 이벤트가 canvas 직접 발생인지 (UI 오버레이 위 클릭이 배경
          // 천체로 전파돼 오선택되지 않게). Babylon onPointerObservable 의 event.target 이 canvas 인지 확인.
          // cross-validate 보강 (2) — DoD-4 (UI 오버레이 위 클릭 no-op) 직결.
          const isCanvasEvent = (evt: { target?: EventTarget | null } | undefined): boolean => {
            const canvasEl = pointerScene.getEngine().getRenderingCanvas();
            return !evt?.target || evt.target === canvasEl;
          };

          instance.scene.onPointerObservable.add((pointerInfo) => {
            const evt = pointerInfo.event as PointerEvent;
            const pointerId = typeof evt?.pointerId === 'number' ? evt.pointerId : 0;
            // 터치/마우스 구분 — 드래그 임계 분리 (터치 jitter). cross-validate 보강 (3).
            const isTouch = evt?.pointerType === 'touch';
            const dragThreshold = isTouch
              ? sceneApi.CLICK_DRAG_THRESHOLD_PX_TOUCH
              : sceneApi.CLICK_DRAG_THRESHOLD_PX;

            if (pointerInfo.type === PointerEventTypes.POINTERDOWN) {
              activePointers.add(pointerId);
              downPointerId = pointerId;
              downX = pointerScene.pointerX;
              downY = pointerScene.pointerY;
              return;
            }

            if (pointerInfo.type === PointerEventTypes.POINTERUP) {
              const wasSinglePointer = activePointers.size === 1;
              activePointers.delete(pointerId);

              // 멀티터치 / 다른 pointer up / canvas 외부 이벤트 → no-op (콘솔 오류 0).
              if (!wasSinglePointer || pointerId !== downPointerId) return;
              if (!isCanvasEvent(evt)) return;

              const upX = pointerScene.pointerX;
              const upY = pointerScene.pointerY;
              const moved = Math.hypot(upX - downX, upY - downY);
              // 드래그 (카메라 회전/패닝) → no-op.
              if (moved > dragThreshold) return;

              const activeCam = pointerScene.activeCamera;
              if (!activeCam) return;

              // #719 — 겹침 cycle (ADR §3 핵심 데이터 흐름).
              //   1. ray hit 후보 리스트(깊이순 dedup)를 multiPick 으로 얻는다.
              //   2. hit ≥ 1: 직전 클릭과 같은 위치(≤ PICK_CYCLE_SAME_POS_PX)면 직전 선택 bodyId 를
              //      앵커로 다음(뒤) body 로 wrap, 다른 위치면 최전면(cands[0]) 으로 리셋.
              //   3. hit 0: 화면거리 fallback 단일 선택(resolvePickedBodyId 2차 경로) — cycle 없음.
              //      (작은 marker 겹침 cycle 은 비-범위 — ADR §결정 5.)
              const cands = sceneApi.resolvePickedBodyIds(pointerScene, activeCam, upX, upY, {
                isFocusable: isRPhaseFocusable,
              });

              let bodyId: string | null;
              if (cands.length >= 1) {
                // 같은 위치 판정 — 직전 클릭 좌표와 engine px 거리 ≤ 임계 (ADR §결정 3).
                const samePos =
                  lastClickX !== null &&
                  lastClickY !== null &&
                  Math.hypot(upX - lastClickX, upY - lastClickY) <= sceneApi.PICK_CYCLE_SAME_POS_PX;
                // 같은 위치 + 직전 id 가 현재 후보에 있으면 다음(뒤)으로 wrap, 아니면 최전면 (ADR §결정 4).
                // 겹침 없음(len 1)이면 (idx+1)%1=0 으로 같은 body 유지 → #713 단일 클릭 동작 동일.
                if (samePos && lastSelectedBodyId !== null) {
                  const idx = cands.indexOf(lastSelectedBodyId);
                  // 인덱스 접근은 항상 유효 범위(idx∈[0,len), wrap %len) — noUncheckedIndexedAccess
                  // 대비 ?? null 좁힘 (실제 undefined 불가, len≥1 보장).
                  bodyId =
                    idx !== -1 ? (cands[(idx + 1) % cands.length] ?? null) : (cands[0] ?? null);
                } else {
                  bodyId = cands[0] ?? null;
                }
                // cycle 상태 갱신 — 다음 클릭의 같은 위치 판정 + 앵커 기준.
                lastClickX = upX;
                lastClickY = upY;
                lastSelectedBodyId = bodyId;
              } else {
                // ray hit 0 → 화면거리 fallback 단일 (marker 직격 miss 흡수). cycle 후보 아님 —
                // fallback bodyId 는 lastSelectedBodyId 앵커에서 제외해 marker 연타 순환 방지 (ADR §결정 5).
                bodyId = sceneApi.resolvePickedBodyId(pointerScene, activeCam, upX, upY, {
                  isFocusable: isRPhaseFocusable,
                });
                // fallback 선택 시 cycle 앵커 리셋 (다음 ray hit 클릭이 최전면부터 시작).
                lastClickX = upX;
                lastClickY = upY;
                lastSelectedBodyId = null;
              }

              // 빈 우주 / 비-allowlist → no-op (setSelectedBody(null) 호출 금지 — reset 아님).
              if (!bodyId) return;
              // 기존 진입점 재사용 — isRPhaseFocusable 가드(이중 방어) + store sync 자동.
              instance.command({ type: 'focusOn', bodyId });
            }
          });
        }

        // P11-B #289 — `setLodOverride` command → scene 에 전달. URL `?lod=` 초기 1회 호출 경로.
        // UrlSync 가 mount 시 `sendCommand({ type: 'setLodOverride', level })` 호출 → 여기로 라우팅.
        //
        // [타이밍 주의] UrlSync 의 mount useEffect 는 `setCore(instance)` 직후 실행되지만 scene 초기화
        // (`instance.start().then(...)`) 는 비동기라 handler 가 아직 null. 이 경우 command 가 no-op 되어
        // override 유실. 방어 장치로 handler 등록 시점에 **URL 을 직접 재파싱** 하여 즉시 override 적용
        // (UrlSync 호출이 이미 지나갔어도 최신 URL 상태 복원). 두 경로 동시 적용해도 idempotent.
        //
        // #680 — tier-c 강제 LOD 보존 (race 제3 윈도우 fix). UrlSync 는 `?lod=` 미지정 시
        // `setLodOverride('auto')` 를 **무조건** 발행한다 (url-sync.tsx:120-122). 이 'auto' command 가
        // handler 등록 **후** 도착하면 (저속/headless 의 비결정적 mount 타이밍) tier-c 강제 'low' 를
        // 'auto' 로 덮어써 sun high + mid sphere 렌더 → fps-baseline-guard FAIL.
        //   #677 Amendment 2 는 detectGpuCapability().then 의 command 직접 발행만 보강했으나,
        //   그 후 도착하는 UrlSync 'auto' 를 막지 못했다 (run 27456421530 mobile override='auto'
        //   잔존 — 진단 trace: setLodOverride('low')@1059ms → setLodOverride('auto')@1272ms).
        // 처치: handler 가 매 진입마다 **현 URL + tier-c 강제 플래그를 재참조**해 미지정 기본
        // ('auto') 를 강제값으로 치환한다 (재판정마다 결정론 정착). 사용자 명시 `?lod=` 는
        // 그대로 통과 (디버그 경로 보존 — URL 우선 원칙). 강제 플래그가 늦게 박제돼도 (Chain A
        // 지연) 후속 어떤 setLodOverride 진입에서든 강제값 복원 → 순서 무관 idempotent.
        const resolveLodWithTierForce = (level: 'high' | 'mid' | 'low' | 'auto') => {
          const lodParam = new URLSearchParams(window.location.search).get('lod');
          const hasLodUrl = lodParam !== null && lodParam !== '';
          const tierForced = (window as { __gpuTierForceLod?: 'high' | 'mid' | 'low' })
            .__gpuTierForceLod;
          // 사용자 명시 URL 우선. 미지정('auto' 기본) + tier-c 강제면 강제값으로 치환.
          if (!hasLodUrl && level === 'auto' && tierForced) return tierForced;
          return level;
        };
        instance.setLodOverrideHandler((level) => {
          solar.setLodOverride(resolveLodWithTierForce(level));
        });
        {
          // P11-C #290 — URL `?lod=` 가 없고 GPU tier-c 가 LOD low 강제를 예약했으면 그걸 적용.
          //   URL 우선 원칙: `?lod=` 가 있으면 사용자 디버그 경로를 차단하지 않는다.
          // #680 — handler 와 동일 식 (resolveLodWithTierForce) 사용 → 강제 보존 로직 SSoT 단일.
          const parsed = parseLodLevel(new URLSearchParams(window.location.search).get('lod'));
          solar.setLodOverride(resolveLodWithTierForce(parsed));
        }

        // #688 — 궤도선 가시성 핸들러 + URL `?orbits=off` 초기값. setLodOverride wiring 패턴 답습.
        //   handler: UI 토글 버튼 / URL 초기 command → scene.setOrbitLinesVisible (satellite 일반화 #627).
        instance.setOrbitLinesVisibleHandler((visible) => solar.setOrbitLinesVisible(visible));
        {
          // 초기값: `?orbits=off` → 숨김 / 미지정·`?orbits=on` → 표시 (기본 ON, 현행 보존).
          const orbitsVisible = parseOrbitsVisible(
            new URLSearchParams(window.location.search).get('orbits'),
          );
          solar.setOrbitLinesVisible(orbitsVisible);
          // 버튼 표시 SSoT 동기화 (토글 버튼이 store 를 구독). 무조건 발행 — store 기본 true 와
          // 같으면 idempotent no-op, `?orbits=off` 면 false 반영 (reviewer 권고: 주석-구현 정합).
          useSimStore.getState().setOrbitLinesVisible(orbitsVisible);
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
              // #693 — focus 진입 시 패닝 비활성 (ADR §결정 3 옵션 A). focus 중 followObserver 가
              // 매 프레임 target 을 덮어쓰므로 패닝 무의미 + jitter. free-fly 진입 시 재활성.
              freeFlyActive = false;
              freeFlyEntryRadius = null;
              // #704 (이견 5) — focus 전환 시 free-fly anchor 스냅샷 reset (stale 판정 오작동 방지).
              freeFlyAnchorBodyId = null;
              sceneApi.setPanningEnabled(camera, false);
              // #699 — focus 진입 시 WASD 비활성 + 눌림 키 클리어 + free-fly 줌 상한 해제(기본 복원).
              // focus follow 가 매 프레임 target 을 덮어쓰므로 WASD 이동 무의미. focusOn 이 동적으로
              // lowerRadiusLimit 을 낮추므로(camera-controller.ts:150) upperRadiusLimit 만 기본 복원.
              wasdControl.setEnabled(false);
              wasdControl.clearKeys();
              camera.upperRadiusLimit = DEFAULT_UPPER_RADIUS_LIMIT;
            }
          } else {
            // P12-A #298 — focus 해제 → tier 는 free-fly 경로로 판정.
            solar.clearFocus();
            controller.reset(35);
            // #693 — reset(focus 해제 = sun 중심 복귀)도 free-fly 가 아니므로 패닝 비활성.
            freeFlyActive = false;
            freeFlyEntryRadius = null;
            // #704 (이견 5) — reset(focus 해제) 시 free-fly anchor 스냅샷 reset.
            freeFlyAnchorBodyId = null;
            sceneApi.setPanningEnabled(camera, false);
            // #699 — reset 시 WASD 비활성 + 눌림 키 클리어(free-fly→reset 후 키 잔류 이동 방지) +
            // 줌 한계 기본 복원(reset 은 sun 중심 개요 = 기본 좌표계).
            wasdControl.setEnabled(false);
            wasdControl.clearKeys();
            camera.lowerRadiusLimit = DEFAULT_LOWER_RADIUS_LIMIT;
            camera.upperRadiusLimit = DEFAULT_UPPER_RADIUS_LIMIT;
          }
        };

        // #509 — 자유시점 (free-fly) 진입 분기. clearFocus + reset 과 달리 tier/origin/camera 보존.
        // syncFocusToScene 과 별도 helper — selectedBodyId 변화 (null 전이) 와 freeFlyMode 변화를
        // 분리 처리하기 위함 (resetCamera vs enterFreeFly 경로 구분).
        const detachToFreeFly = (anchorBodyId: string | null = null) => {
          // #699 — 진입 단일화 (tier 무관 단일 규칙 — ADR §5-1). #631 의 body tier reset(35)
          // pull-back 을 폐기한다. 모든 tier(sun/earth/io/default)가 **현 시점·줌을 보존**한 채로
          // focus tracking 만 해제 + 자유 이동(패닝/WASD) 활성. #631 "허공" 위험은 진입 강제 줌아웃이
          // 아니라 (a) 줌아웃 상한 + (b) tier escalation gate 로 대체 처리(ADR §5-3).
          //
          // #704 (ADR §5 옵션 c) — body tier 진입 시 anchor 캡처. 진입 시점 tier 가 body 이고 직전 focus
          // body 가 있을 때만 anchor 설정 → 줌아웃 시 cameraFromSun 직행 escalate 차단(위성 근방 보존).
          // earth(inner)/default(solar)는 anchor 없음 → 기존 cameraFromSun 경로 유지(#704 B-1 무회귀).
          freeFlyAnchorBodyId = anchorBodyId && solar.getTier() === 'body' ? anchorBodyId : null;
          solar.detachFocus();
          controller.clearFollow();

          // #699 — sun anomaly 구조적 차단 (ADR §5-2). focusOn 이 lowerRadiusLimit 을 desiredRadius
          // ×0.5 로 낮춘 것을 기본값으로 원복(완화 잔존 시 진입 후 줌인이 비정상적으로 깊이 들어감).
          // 진입 radius 를 스냅샷해 onBeforeRender 의 tier escalation gate 기준으로 삼는다 — 사용자가
          // 진입 radius 보다 유의미하게 줌아웃할 때만 escalate(snap-back 0).
          camera.lowerRadiusLimit = DEFAULT_LOWER_RADIUS_LIMIT;
          freeFlyEntryRadius = camera.radius;
          // #699 — 진입 radius 비례 줌아웃 상한 적용(clamp 없이 factor 배 줌아웃 허용 — ADR §5-3).
          // body tier 진입 radius(158386)를 보존하면서 escalation 트리거 여유 확보.
          camera.upperRadiusLimit = camera.radius * getZoomoutFactor();

          // #693 — free-fly 진입 → radius 비례 패닝 활성. onBeforeRender 가 줌 중 radius 변동을
          // 따라 매 프레임 재산출 (ADR §결정 2). #704 — pct = store 사용자 패닝 감도.
          freeFlyActive = true;
          sceneApi.setPanningEnabled(
            camera,
            true,
            useSimStore.getState().freeFlySensitivity.panning,
          );
          // #699 — free-fly 진입 → WASD/QE 키보드 이동 활성 (ADR §5-4).
          wasdControl.setEnabled(true);
          // #699 D-T2 — 진입 즉시 캔버스에 키보드 포커스 부여. 탐색/focus 버튼 클릭으로 진입하면
          // 포커스가 그 버튼에 남아 scene.onKeyboardObservable 이 키를 받지 못해 WASD 가 무반응이다
          // (Babylon 키보드 입력은 canvas 포커스 시에만 수신 — 실측 onKeyboardObservable=false).
          // pointerenter refocus 는 마우스가 캔버스에 "새로 진입"할 때만 발화하므로, 진입 시점에
          // 명시적으로 focus 를 부여해 캔버스 클릭 없이 바로 이동 가능케 한다. refocusCanvas 는
          // 텍스트 입력 포커스 가드를 포함한다.
          refocusCanvas();
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
              // #704 — 직전 focus body(prev.selectedBodyId)를 anchor 로 전달. body tier 진입 시에만
              // detachToFreeFly 내부에서 anchor 채택(외행성 위성 줌아웃 급변 차단 — ADR §5 옵션 c).
              detachToFreeFly(prev.selectedBodyId);
            } else {
              syncFocusToScene(state.selectedBodyId);
            }
          } else if (state.freeFlyMode !== prev.freeFlyMode && state.freeFlyMode) {
            // #693 — solar 개요(selectedBodyId 이미 null)에서 free-fly 직접 진입 경로.
            // 이 경우 selectedBodyId 가 변하지 않아 위 분기가 발화하지 않는다(enterFreeFly 가
            // null→null + freeFlyMode false→true 만 commit). 패닝 활성화를 위해 freeFlyMode
            // 전이(false→true)도 detachToFreeFly 로 라우팅한다. ADR §1 측정 시나리오 A "free-fly 직접".
            // #704 — solar 개요 직접 진입은 anchor 없음(selectedBodyId 이미 null) → cameraFromSun 경로.
            detachToFreeFly(null);
          } else if (
            state.freeFlyMode !== prev.freeFlyMode &&
            !state.freeFlyMode &&
            state.selectedBodyId === null
          ) {
            // #693 (qa 차단 fix) — free-fly 패닝 후 reset 경로.
            // reset 버튼 → resetCamera command → setSelectedBody(null) = {selectedBodyId:null,
            // freeFlyMode:false}. free-fly 진입 상태는 이미 selectedBodyId=null 이므로 1차 분기
            // (selectedBodyId 변화)가 미발화하고, 2차 분기는 `&& state.freeFlyMode`(=false)라 미발화.
            // → syncFocusToScene(null) 미호출 → 패닝으로 옮긴 target 이 원점 복원 안 됨 (DoD "reset 원복" 위반).
            // freeFlyMode true→false 전이(selectedBodyId 불변 null)를 sun 중심 reset 으로 라우팅하여
            // controller.reset(35) 로 target 원점 복원 + 패닝 비활성. focus→reset(selectedBodyId 변화)
            // 경로는 1차 분기가 이미 처리하므로 본 분기는 free-fly→reset 에만 한정 발화.
            syncFocusToScene(null);
          }
        });

        // #704 — free-fly 감도 zoom / zoomoutFactor push 구독 (ADR §결정 1 축 1-A).
        //
        // WASD/패닝은 pull(getter/매 프레임) 경로라 자체 갱신되지만, zoom(카메라 속성)·zoomoutFactor
        // (진입 시 1회 산정)은 push 가 필요하다:
        //  - zoom: wheelDeltaPercentage/pinchDeltaPercentage 는 카메라 속성이라 변경 시 즉시 set.
        //          focus 중에도 줌은 동일 속성을 쓰므로 free-fly 무관 항상 적용(거동 모델 불변 — 회귀 아님).
        //  - zoomoutFactor: 진입 시 upperRadiusLimit=entryRadius×factor 1회 산정이라, free-fly 활성 +
        //          진입 radius(freeFlyEntryRadius) 유효 시에만 즉시 재산정(escalation gate 해제 후
        //          freeFlyEntryRadius=null 이면 solar 개요 상한이 지배하므로 미적용 — DoD-1 재진입 불요).
        const applySensitivity = (
          sens: ReturnType<typeof useSimStore.getState>['freeFlySensitivity'],
        ) => {
          camera.wheelDeltaPercentage = sens.zoom;
          camera.pinchDeltaPercentage = sens.zoom;
          if (freeFlyActive && freeFlyEntryRadius !== null) {
            camera.upperRadiusLimit = freeFlyEntryRadius * sens.zoomoutFactor;
          }
        };
        // 마운트 직후 1회 적용 — Hydration useEffect 가 localStorage 값을 store 에 덮어쓰면 본 구독이
        // 발화해 카메라에 반영(초기 default 와 영속값이 다를 때 새로고침 후에도 즉시 반영).
        applySensitivity(useSimStore.getState().freeFlySensitivity);
        unsubSensitivity = useSimStore.subscribe((state, prev) => {
          if (state.freeFlySensitivity !== prev.freeFlySensitivity) {
            applySensitivity(state.freeFlySensitivity);
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
          // #699 — free-fly 진입 tier escalation gate (sun anomaly 구조적 차단 — ADR §5-2).
          // #704 D-T2 — escalation gate ↔ zoomoutFactor 결합 모순 해소 (ADR Amendment 2026-06-18).
          //
          // 진입 직후 updateTierByCamera 가 tierFromCameraDistance 로 tier 를 즉시 재판정하면
          // runTierTransition 실거리 보존 산식이 진입 radius 를 덮어쓴다(sun 25.3→463.9 / io
          // 158386→35 강제 pull-back). "1회 억제"(snap-back 위험)가 아니라 **진입 radius 임계**로
          // gate 한다 — 사용자가 진입 radius 의 (1 + margin) 배 초과로 **줌아웃**할 때만 escalate
          // 허용. 줌인/소폭 변동은 tier 유지 → 진입 시점 보존 + snap-back 0.
          //
          // [#704 D-T2 회귀] 구 구현은 gate 해제 시점(진입 ×1.15)에 즉시 upperRadiusLimit 을
          // SOLAR_ZOOMOUT_LIMIT(1000)으로 덮어쓰고 freeFlyEntryRadius=null 로 만들어, 사용자의
          // zoomoutFactor 설정(entryRadius×factor)을 15% 줌아웃 후 무력화했다(슬라이더 무의미).
          // 게다가 radius 가 1000 까지 자유 증가 → solar escalation 임계(≈690)를 넘어 rescale
          // 급락(690→40, 17×)을 유발해 "급격한 카메라 이동" UX 회귀를 냈다(D-T2 측정).
          //
          // [수정] gate 해제(escalation 억제 해제)와 upperRadiusLimit 덮어쓰기를 **분리**한다:
          //  - gate 는 escalation 억제만 담당(진입 시점 보존). 해제 후에도 freeFlyEntryRadius 를
          //    null 로 만들지 않아 upperRadiusLimit = entryRadius × zoomoutFactor 가 그대로 유지된다
          //    (store 구독이 SSoT). 사용자 factor 가 작으면(entryRadius×factor < escalation 임계)
          //    그 한계에서 줌아웃이 멈춰 escalation 자체가 안 일어난다 → rescale 급락 0.
          //  - tier 가 **실제로 escalate** 한 순간(updateTierByCamera 반환 tier ≠ 직전 tier)에만
          //    SOLAR_ZOOMOUT_LIMIT 로 전환 + freeFlyEntryRadius=null. body tier 거대 진입(io 158386)이나
          //    큰 factor 로 임계를 넘긴 경우의 solar 개요 빈 공간 차단(#631 "허공 방지" 계승, ADR §5-3).
          const TIER_ESCALATION_ZOOMOUT_MARGIN = 0.15; // 진입 대비 15% 줌아웃 시 escalate 개시.
          let allowTierUpdate = true;
          if (freeFlyActive && freeFlyEntryRadius !== null) {
            if (focusDistSceneUnit <= freeFlyEntryRadius * (1 + TIER_ESCALATION_ZOOMOUT_MARGIN)) {
              // 진입 radius 근처(줌인 포함) → tier 재판정 보류(진입 시점 보존).
              allowTierUpdate = false;
            }
            // 진입 ×1.15 초과 → escalation 억제만 해제(allowTierUpdate=true). upperRadiusLimit 은
            // 덮어쓰지 않는다 — entryRadius×zoomoutFactor 가 줌아웃 상한 SSoT (위 store 구독).
          }
          if (allowTierUpdate) {
            // #704 (ADR §5 옵션 c) — body tier anchor 가 있으면 Core 가 cameraFromSun 대신 anchor 기준
            // (cameraFromFocus) 으로 판정한다. 외행성 위성(io)은 anchor kind('moon')가 항상 body 를
            // 반환 → 줌아웃해도 body 유지(escalate 0, 위성 근방 보존). upperRadiusLimit 은 store 구독의
            // entryRadius×zoomoutFactor 가 줌아웃 상한 SSoT(허공 차단). anchor 없으면(earth/default)
            // 기존 cameraFromSun 경로 → #704 B-1 무회귀.
            const newTier = solar.updateTierByCamera(
              cameraFromSunMeters,
              cameraFromFocusMeters,
              freeFlyAnchorBodyId,
            );
            // tier 가 실제로 escalate(또는 변동)한 순간에만 solar 개요 상한으로 전환. escalation 후
            // 카메라가 solar/inner tier 로 재산정되어 진입 radius 비례 상한(deep tier 거대값)은 더 이상
            // 유효하지 않으므로 SOLAR_ZOOMOUT_LIMIT 로 좁혀 빈 공간 진입 차단 (ADR §5-3 허공 대체).
            if (freeFlyEntryRadius !== null && newTier !== activeTier) {
              freeFlyEntryRadius = null;
              // #704 — escalate 가 실제로 발생하면(default/earth 또는 명시적 개요 복귀) anchor 도 해제
              // (anchor 기준 판정은 body tier 한정 — escalate 후 solar/inner 좌표계로 전환됨).
              freeFlyAnchorBodyId = null;
              const activeCamArc = activeCam as unknown as { upperRadiusLimit?: number };
              activeCamArc.upperRadiusLimit = SOLAR_ZOOMOUT_LIMIT;
              // #704 (이견 6) — 대규모 스케일 전환(body→solar 300,000×) + origin shift 동시 발생 시
              // 수치 불안정(NaN/우주 미아) 가드. 전환 후 카메라 좌표 NaN 발견 시 dev 경고(저비용 1식).
              const camPos = activeCam.globalPosition;
              const camTarget = (
                activeCam as unknown as { target?: { x: number; y: number; z: number } }
              ).target;
              if (
                Number.isNaN(camPos.x) ||
                Number.isNaN(camPos.y) ||
                Number.isNaN(camPos.z) ||
                (camTarget &&
                  (Number.isNaN(camTarget.x) ||
                    Number.isNaN(camTarget.y) ||
                    Number.isNaN(camTarget.z)))
              ) {
                console.error(
                  '[#704] tier escalation 후 카메라 좌표 NaN — 전환 전 좌표 동기화 트랜잭션 검토 필요',
                  { newTier, camPos, camTarget },
                );
              }
            }
          }

          // #693 — free-fly 패닝 감도 줌 일관성 (ADR §결정 2, agy 고유 발견 ②).
          // panningSensibility 는 radius 비례 정적 스칼라라 줌(radius 변동) 시 진입 시점 값이
          // 잔존하면 화면 px↔world 비율이 어긋난다("튀는" UX). free-fly 활성 중에는 매 프레임
          // radius 기반 재산출 (산술 1식, 비용 무시 가능). focus 중에는 sensibility=0 유지(토글이
          // 비활성화했으므로 재산출 안 함).
          if (freeFlyActive) {
            // #704 — pct = store 사용자 패닝 감도 (슬라이더 변경 시 다음 프레임부터 즉시 반영).
            sceneApi.setPanningEnabled(
              camera,
              true,
              useSimStore.getState().freeFlySensitivity.panning,
            );
          }
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
      unsubSensitivity?.();
      tierObserverCleanupRef.current?.();
      tierObserverCleanupRef.current = null;
      // #699 — 캔버스 포커스 복원 리스너 해제 (HMR/unmount 누수 방지). WASD detach 는
      // camera.onDisposeObservable 에서 처리(instance.dispose() 가 camera dispose 트리거).
      canvas.removeEventListener('pointerenter', refocusCanvas);
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
