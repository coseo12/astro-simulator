/**
 * Scene 모듈.
 *
 * Babylon 씬 관리, 카메라 컨트롤러, 천체 메쉬 생성/업데이트.
 * 본격 Scene Graph는 C3/C6 (#15, #18)에서 구현.
 */

export {
  setupArcRotateCamera,
  ZOOM_DELTA_PERCENTAGE,
  PANNING_DELTA_PERCENTAGE,
  WASD_DELTA_PERCENTAGE,
  MAX_MOVE_STEP,
  computePanningSensibility,
  setPanningEnabled,
  attachWasdControl,
} from './camera.js';
export type { ArcCameraOptions, WasdControlHandle, WasdCoefficients } from './camera.js';
export {
  CameraController,
  FOCUS_USER_RADIUS_MULTIPLIER,
  FOCUS_USER_RADIUS_MIN_PADDING,
} from './camera-controller.js';
export type { FocusTarget } from './camera-controller.js';
// R4 #539 Amendment 3 — satellite focus multiplier 분기 SSoT.
export {
  FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE,
  resolveFocusMultiplier,
} from './focus-multiplier.js';
export { createSunEarthDemo } from './sun-earth-demo.js';
export type { SunEarthDemoHandles } from './sun-earth-demo.js';
export { enableLogarithmicDepth } from './log-depth.js';
export { createNearFarProbe } from './near-far-probe.js';
export type { NearFarProbeHandles } from './near-far-probe.js';
export { createSolarSystemScene } from './solar-system-scene.js';
export type {
  SolarSystemSceneHandles,
  SolarSystemSceneOptions,
  PhysicsEngineKind,
} from './solar-system-scene.js';
// P12-A #298 — Tier 엔진 (Display-Relative Scale Unification).
export {
  renderScaleForTier,
  tierFromFocus,
  tierFromCameraDistance,
  resolveCurrentTier,
  initialTier,
  TIER_HYSTERESIS,
} from './tier.js';
export type { Tier } from './tier.js';
// P12-B #298 — Tier 전환 애니메이션 (Q8=8D camera dolly + 입력 잠금).
export { runTierTransition, computeTargetRadius, computeNewMinZ } from './tier-transition.js';
export type { TierTransitionOptions } from './tier-transition.js';
export { createAsteroidBelt } from './asteroid-belt.js';
export type { AsteroidBeltHandles, AsteroidBeltOptions } from './asteroid-belt.js';
export { createRingPlaceholder } from './ring-placeholder.js';
export type { RingPlaceholderHandles, RingPlaceholderOptions } from './ring-placeholder.js';
export {
  createRingShaderMaterial,
  createRingShaderMesh,
  createRingInstancedMesh,
} from './ring-shader.js';
export type {
  RingShaderParams,
  RingShaderHandles,
  CreateRingShaderOptions,
} from './ring-shader.js';
export { createGravitationalLensing } from './gravitational-lensing.js';
export type { LensingHandles, BlackHoleOptions } from './gravitational-lensing.js';
export { createBlackHoleRendering } from './black-hole-rendering.js';
export type {
  BlackHoleRenderingHandles,
  BlackHoleRenderingOptions,
} from './black-hole-rendering.js';
// #713 — canvas 클릭/터치 → body 선택 (raycast picking) 순수 헬퍼.
// #719 — resolvePickedBodyIds (복수형, ray 깊이순 dedup) + PICK_CYCLE_SAME_POS_PX (cycle 임계).
export {
  resolvePickedBodyId,
  resolvePickedBodyIds,
  PICK_SCREEN_THRESHOLD_PX,
  CLICK_DRAG_THRESHOLD_PX,
  CLICK_DRAG_THRESHOLD_PX_TOUCH,
  PICK_CYCLE_SAME_POS_PX,
} from './body-picking.js';
export type { ResolvePickOptions } from './body-picking.js';

// #402 — R-Phase Body Focus Allowlist SSoT 노출 경로.
//
// ⚠️ 본 scene namespace 에는 의도적으로 re-export 하지 않는다.
//    `scene as sceneApi` namespace 경유 import 시 turbopack module dep graph 가
//    `solar-system-scene.ts` → `nbody-engine.ts` → `physics_wasm.js` (`__dirname`) 평가를
//    trigger 하여 SSR 500 회귀 (라운드 1 PR #407 + 라운드 2 실측 재현).
//    `focus-quick-buttons.tsx` 는 SSR 평가 대상이며 `next/dynamic({ssr:false})` 보호 부재
//    (app-shell.tsx 직접 import). 반면 sim-canvas 는 sim-canvas.dynamic.tsx 가 SSR 차단 → 안전.
//
//    SSoT 노출은 `packages/core/src/index.ts` 에 named export 로 직접 박제:
//      `import { isRPhaseFocusable } from '@astro-simulator/core'`
//
//    내부 (simulation-core.ts) 는 relative path 직접 import:
//      `import { isRPhaseFocusable } from '../scene/r-phase-allowlist.js'`
//
//    ADR `20260504-r-phase-allowlist-guard.md` §Amendment 결정 D1 정신 보존
//    (sub-path export 폐기) + 라운드 2 실측 회귀 메커니즘 보강 박제.
