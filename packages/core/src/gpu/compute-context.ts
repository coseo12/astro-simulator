/**
 * GPU compute 컨텍스트 (P3-B #143).
 *
 * Babylon의 `WebGPUEngine`에 ComputeShader API를 활용하기 위한 얇은 래퍼.
 * #144(force shader), #145(적분기)가 이 위에 빌드된다.
 *
 * 비-WebGPU 환경(WebGL2 fallback)은 명시적으로 거부 — 호출자는 `detectGpuCapability()`로
 * 사전 분기 후 진입해야 한다.
 */
import {
  ComputeShader,
  type IComputeShaderOptions,
} from '@babylonjs/core/Compute/computeShader.js';
import type { WebGPUEngine } from '@babylonjs/core/Engines/webgpuEngine.js';
import type { AbstractEngine } from '@babylonjs/core/Engines/abstractEngine.js';

/**
 * GPU compute가 가능한 Babylon 엔진인지 좁힌다.
 * Babylon의 `AbstractEngine`은 WebGL2/WebGPU 양쪽을 감싸므로 caller가 안전하게 분기 가능.
 */
export function isWebGpuEngine(engine: AbstractEngine): engine is WebGPUEngine {
  // Babylon은 런타임에 isWebGPU 플래그를 노출. 런타임 체크가 가장 신뢰성 높음.
  return (engine as { isWebGPU?: boolean }).isWebGPU === true;
}

/** GPU compute 기능이 없을 때 던지는 에러. 호출자가 폴백 분기에 사용. */
export class WebGpuUnavailableError extends Error {
  constructor(reason: string) {
    super(`WebGPU compute unavailable: ${reason}`);
    this.name = 'WebGpuUnavailableError';
  }
}

/**
 * GPU compute 컨텍스트. WebGPUEngine + 헬퍼 묶음.
 * 직접 생성하지 말고 `createGpuComputeContext(engine)`을 사용한다.
 */
export class GpuComputeContext {
  constructor(public readonly engine: WebGPUEngine) {}

  /**
   * WGSL 소스에서 ComputeShader 빌드.
   * `bindingsMapping`은 WGSL 변수명 ↔ (group, binding) 매핑. WGSL reflection 미지원
   * 환경 호환을 위해 명시적으로 전달해야 한다.
   */
  createShader(name: string, wgslSource: string, options: IComputeShaderOptions): ComputeShader {
    return new ComputeShader(name, this.engine, { computeSource: wgslSource }, options);
  }
}

/**
 * 엔진에서 GPU compute 컨텍스트를 만든다. WebGPU가 아니면 `WebGpuUnavailableError`.
 */
export function createGpuComputeContext(engine: AbstractEngine): GpuComputeContext {
  if (!isWebGpuEngine(engine)) {
    throw new WebGpuUnavailableError('engine is not WebGPU (WebGL2 fallback in use)');
  }
  return new GpuComputeContext(engine);
}
