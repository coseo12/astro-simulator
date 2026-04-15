import { describe, expect, it } from 'vitest';
import { GpuFloat32Buffer } from './buffer';

describe('GpuFloat32Buffer', () => {
  it('잘못된 length는 RangeError', () => {
    // 실제 GPU 컨텍스트 없이 length 검증만 확인
    const fakeCtx = { engine: {} } as never;
    expect(() => new GpuFloat32Buffer(fakeCtx, 0)).toThrow(RangeError);
    expect(() => new GpuFloat32Buffer(fakeCtx, -1)).toThrow(RangeError);
    expect(() => new GpuFloat32Buffer(fakeCtx, 1.5)).toThrow(RangeError);
  });
});
