/**
 * GPU 모듈.
 *
 * WebGPU Compute Shader 래퍼, GPU-resident 상태 관리.
 * WebGL2 폴백 경로도 포함.
 *
 * P3 WebGPU N-body Compute에서 본격 활용.
 */

export { detectGpuCapability, type GpuCapability } from './capability';
