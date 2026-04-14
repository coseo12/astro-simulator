import { Engine, WebGPUEngine } from '@babylonjs/core';

export type EngineKind = 'webgpu' | 'webgl2';

export interface CreatedEngine {
  engine: Engine | WebGPUEngine;
  kind: EngineKind;
}

/**
 * WebGPU 우선 시도 후 실패 시 WebGL2로 폴백한다.
 * ADR: docs/phases/architecture.md §6 "WebGPU-first + WebGL2 폴백"
 *
 * WebGPUEngine 생성 전에 navigator.gpu.requestAdapter()를 먼저 시도하여
 * 실제 사용 가능한 adapter가 있는 경우에만 진행한다.
 * 이렇게 하지 않으면 Babylon 내부에서 console.error로 실패 로그가 먼저 찍힌다
 * (try/catch로 잡히지 않음).
 */
export async function createEngine(canvas: HTMLCanvasElement): Promise<CreatedEngine> {
  if (await isWebGpuUsable()) {
    try {
      const engine = new WebGPUEngine(canvas, {
        antialias: true,
        stencil: true,
        adaptToDeviceRatio: true,
      });
      await engine.initAsync();
      return { engine, kind: 'webgpu' };
    } catch (error) {
      // adapter는 있었으나 초기화 중 실패 — WebGL2로 폴백
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

/**
 * 현재 환경에서 WebGPU 사용이 가능한지 사전 판별.
 * - navigator.gpu 존재
 * - requestAdapter() 가 null이 아닌 adapter 반환
 *
 * 헤드리스 브라우저(Playwright Chromium 등)는 gpu 객체는 있으나 adapter가 null이므로
 * 여기서 즉시 false로 판별되어 WebGL2 경로로 이동.
 */
async function isWebGpuUsable(): Promise<boolean> {
  if (typeof navigator === 'undefined') return false;
  const gpu = (navigator as Navigator & { gpu?: GPU }).gpu;
  if (!gpu) return false;
  try {
    const adapter = await gpu.requestAdapter();
    return adapter !== null;
  } catch {
    return false;
  }
}
