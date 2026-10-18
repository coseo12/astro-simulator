/**
 * @astro-simulator/core
 *
 * 순수 TypeScript 시뮬레이션 코어.
 * React/Next.js 등 UI 프레임워크 의존성을 가지지 않는다.
 * Babylon.js는 peer dependency.
 */

export * from './engine/index.js';

export * as coords from './coords/index.js';
export * as physics from './physics/index.js';
export * as scene from './scene/index.js';
export * as gpu from './gpu/index.js';
export * as ephemeris from './ephemeris/index.js';
export * as time from './time/index.js';
// P11-B #289 — LOD 3단 분기 + 화면 점유 계산 (render 레이어, Scale Tier 와 직교).
export * as render from './render/index.js';

// #402 — R-Phase Body Focus Allowlist SSoT 직접 named export.
//
// scene namespace 경유 (sceneApi.isRPhaseFocusable) 가 turbopack module dep graph 에서
// solar-system-scene → nbody-engine → physics_wasm `__dirname` 평가를 trigger 하여 SSR 500
// 회귀를 일으키므로, focus-quick-buttons.tsx (SSR 평가 대상, dynamic ssr:false 보호 부재) 는
// 본 named export 경유로 모듈 그래프 영향 0 보장.
//
// `import { isRPhaseFocusable, R_PHASE_BODY_ALLOWLIST } from '@astro-simulator/core'`
//
// ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §Amendment 결정 D1
// (sub-path export 폐기 + 라운드 2 실측 회귀 메커니즘 보강).
export { R_PHASE_BODY_ALLOWLIST, isRPhaseFocusable } from './scene/r-phase-allowlist.js';
export type { RPhaseBodyId } from './scene/r-phase-allowlist.js';

// #1281 — Kepler 위치 해석해 직접 named export (관찰 모드 정보 카드의 실시간 태양 거리).
//
// `physics` namespace 경유 (`physics.orbitalStateAt` 등) 는 physics/index → nbody-engine →
// physics_wasm `__dirname` 평가를 trigger 하여 SSR 500 — 위 #402 와 동일 기전. 카드는
// app-shell.tsx 직접 import 라 SSR 평가 대상이다. `kepler.ts` 는 type import + `@astro-simulator/shared`
// 상수만 가져 (#1305) 런타임 모듈 그래프 영향 0. exports field 불변 (ADR `20260504-r-phase-allowlist-guard.md`
// §Amendment 결정 D1 패턴). #1305 — 장면 공전 μ (`orbitMu` / `twoBodyMu`) 도 같은 경로로 노출.
export { orbitMu, positionAt, twoBodyMu } from './physics/kepler.js';

// #1319 PR3 — `?belt=N` 상한 직접 named export (web `parse-belt-mode.ts` 의 clamp — 리터럴 중복 제거).
// `scene` namespace 경유는 위 #402 와 같은 SSR 기전에 걸린다 (파서는 표시 토글 표 → 표시 패널 경로로 SSR 평가 대상).
// `belt-population.ts` 는 Babylon 비의존 (shared 상수 · `kepler.ts` · 로더 type import 만) 이라 모듈 그래프 영향이 위
// `kepler.ts` 와 같다. exports field 불변.
export { ASTEROID_BELT_MAX_N } from './scene/belt-population.js';

// #1341 PR2 — 위성 궤도 시각 배율 SSoT 직접 named export (거리 자의 배율 고지 — ADR `20261015-1341` 결정 R6, N 하드코딩
// 금지). 고지는 관찰 모드 카드 (app-shell 직접 import → SSR 평가 대상) 가 쓴다 — `scene` namespace 경유는 위 #402 와 같은
// SSR 기전에 걸린다. `orbit-visual-scale.ts` 는 import 0 (상수 표 + 순수 함수) 이라 모듈 그래프 영향 0. exports field 불변.
export { getOrbitVisualScale } from './scene/orbit-visual-scale.js';

// #1347 — 시간 이벤트 마커 (ADR `20261016-1347`) · 모체 체인 위치 직접 named export. 사건 계산은 타임바 (app-shell 직접
// import → SSR 평가 대상) 가, 체인 위치는 정보 카드 · 거리 자 (`body-distance.ts`) 가 쓴다 — `physics` namespace 경유는 위
// #402 와 같은 SSR 기전에 걸린다. 두 모듈은 `kepler.ts` · `time/julian-date.ts` · 로더 type import 만 가져 모듈 그래프 영향이
// 위 `kepler.ts` 와 같다. exports field 불변.
export {
  EVENT_KINDS,
  EVENT_KIND_TOLERANCE_DAYS,
  computeEventsForKind,
  eventDateIso,
  eventFocusBodyId,
  eventLabelKo,
  getEventKind,
} from './events/index.js';
export type {
  AstroEvent,
  EclipseType,
  EventFilterId,
  EventFocusView,
  EventKindDef,
  EventKindId,
} from './events/index.js';
export { heliocentricPositionAt, resolveBodyChainPosition } from './physics/body-chain.js';
export type {
  BodyChainPosition,
  ChainBody,
  ParentRelativePositionFn,
} from './physics/body-chain.js';
// #1354 — 궤도 요소 시간 변화 · 위치 단일 함수 직접 named export. 정보 카드 공전주기 (`siderealPeriodOf`) 가 쓴다 —
// SSR 기전은 위 `kepler.ts` 와 같다 (`orbit-elements-at.ts` 는 `kepler.ts` · shared 상수 · 로더 type import 만). exports field 불변.
export {
  elementsAt,
  meanMotionOf,
  parentRelativePositionAt,
  siderealPeriodOf,
} from './physics/orbit-elements-at.js';
export type { OrbitPositionBody, PeriodicPerturbation } from './physics/orbit-elements-at.js';

// #845 — GpuTier / LodLevel 루트 type re-export.
//
// `./render` 는 package.json exports sub-path 미등재 (#402 exports 불변 가드 — 신규 sub-path
// 추가 금지) 라 apps/web 이 render 도메인 타입을 참조할 단일 경로가 필요하다.
// GpuTier 는 `render/tier-profile.ts` 가 선언 SSoT — apps/web `detect-gpu-tier.ts` 의 과거
// 이중 선언을 본 루트 경유 re-export 로 통일. type-only 라 런타임 모듈 그래프 영향 0
// (#402 SSR 회귀 무관).
export type { GpuTier, LodLevel } from './render/index.js';

export const VERSION = '0.0.0';
