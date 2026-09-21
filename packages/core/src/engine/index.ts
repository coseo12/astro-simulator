export { createEngine } from './engine-factory.js';
export type { CreatedEngine, EngineKind } from './engine-factory.js';
export { SimulationCore } from './simulation-core.js';
// #1234 C2-H3 — 부팅 단계 계측 훅 타입 (type-only, 런타임 모듈 그래프 영향 0).
export type { BootPhaseHook } from './boot-phase.js';
