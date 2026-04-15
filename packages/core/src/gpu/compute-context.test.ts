import { describe, expect, it } from 'vitest';
import { createGpuComputeContext, isWebGpuEngine, WebGpuUnavailableError } from './compute-context';

describe('isWebGpuEngine', () => {
  it('isWebGPU=true 엔진을 인식', () => {
    const fake = { isWebGPU: true } as never;
    expect(isWebGpuEngine(fake)).toBe(true);
  });

  it('isWebGPU 미설정/false는 거부', () => {
    expect(isWebGpuEngine({} as never)).toBe(false);
    expect(isWebGpuEngine({ isWebGPU: false } as never)).toBe(false);
  });
});

describe('createGpuComputeContext', () => {
  it('non-WebGPU 엔진은 WebGpuUnavailableError', () => {
    expect(() => createGpuComputeContext({ isWebGPU: false } as never)).toThrow(
      WebGpuUnavailableError,
    );
  });
});
