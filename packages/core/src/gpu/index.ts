/**
 * GPU 모듈.
 *
 * WebGPU Compute Shader 래퍼, GPU-resident 상태 관리.
 * WebGL2 폴백 경로도 포함.
 *
 * P3 WebGPU N-body Compute에서 본격 활용.
 */

export { detectGpuCapability, type GpuCapability } from './capability';
export {
  GpuComputeContext,
  WebGpuUnavailableError,
  createGpuComputeContext,
  isWebGpuEngine,
} from './compute-context.js';
export { GpuFloat32Buffer } from './buffer.js';
export { WGSL_GRAVITY_PAIR } from './wgsl-helpers.js';
export {
  NBODY_FORCE_TILE,
  NBODY_FORCE_WGSL,
  createNbodyForceShader,
  dispatchNbodyForce,
  type NbodyForceDispatchOptions,
} from './nbody-force-shader.js';
export { computeForcesF32 } from './nbody-force-cpu.js';
export {
  NBODY_VV_TILE,
  NBODY_VV_PHASE_PRE,
  NBODY_VV_PHASE_POST,
  NBODY_VV_WGSL,
  createNbodyVvShader,
} from './nbody-vv-shader.js';
export { stepVvF32 } from './nbody-vv-cpu.js';
