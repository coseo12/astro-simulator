import { Engine, WebGPUEngine } from '@babylonjs/core';

export type EngineKind = 'webgpu' | 'webgl2';

export interface CreatedEngine {
  engine: Engine | WebGPUEngine;
  kind: EngineKind;
}

/**
 * WebGPU 우선 시도 후 실패 시 WebGL2로 폴백한다.
 * ADR: docs/phases/architecture.md §6 "WebGPU-first + WebGL2 폴백"
 */
export async function createEngine(canvas: HTMLCanvasElement): Promise<CreatedEngine> {
  // WebGPU 지원 확인
  const webgpuSupported =
    typeof navigator !== 'undefined' && 'gpu' in navigator && Boolean(navigator.gpu);

  if (webgpuSupported) {
    try {
      const engine = new WebGPUEngine(canvas, {
        antialias: true,
        stencil: true,
        adaptToDeviceRatio: true,
      });
      await engine.initAsync();
      return { engine, kind: 'webgpu' };
    } catch (error) {
      // WebGPU 초기화 실패 — WebGL2로 폴백
      console.warn('[engine-factory] WebGPU 초기화 실패, WebGL2로 폴백합니다.', error);
    }
  }

  const engine = new Engine(canvas, true, {
    preserveDrawingBuffer: true,
    stencil: true,
    adaptToDeviceRatio: true,
  });
  return { engine, kind: 'webgl2' };
}
