/**
 * 물리 모듈.
 *
 * P1: Kepler 궤도 해석해 (이 파일)
 * P2: Leapfrog/Verlet 심플렉틱 N-body 적분기
 * P3: WebGPU Compute 기반 대규모 N-body
 * P4: 일반상대론 효과 (수성 근일점, 중력렌즈)
 */

export {
  solveKeplerEquation,
  trueAnomalyFromEccentric,
  meanAnomalyAt,
  positionAt,
  orbitalPeriod,
} from './kepler.js';
export { orbitalStateAt, type StateVector } from './state-vector.js';
export {
  NBodyEngine,
  buildInitialState,
  type NBodyEngineOptions,
  type NBodyState,
} from './nbody-engine.js';
export { BarnesHutNBodyEngine, type BarnesHutEngineOptions } from './barnes-hut-engine.js';
