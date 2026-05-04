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

export const VERSION = '0.0.0';
