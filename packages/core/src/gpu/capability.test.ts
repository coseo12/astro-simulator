import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectGpuCapability } from './capability';

const setNavigator = (value: unknown) => {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
};

afterEach(() => {
  setNavigator(undefined);
});

describe('detectGpuCapability', () => {
  it('navigator 미존재 환경에서 webgpu:false 반환', async () => {
    setNavigator(undefined);
    const cap = await detectGpuCapability();
    expect(cap.webgpu).toBe(false);
    expect(cap.reason).toContain('지원하지');
  });

  it('navigator.gpu 미노출 시 false', async () => {
    setNavigator({});
    const cap = await detectGpuCapability();
    expect(cap.webgpu).toBe(false);
  });

  it('requestAdapter null 반환 시 false', async () => {
    setNavigator({ gpu: { requestAdapter: vi.fn().mockResolvedValue(null) } });
    const cap = await detectGpuCapability();
    expect(cap.webgpu).toBe(false);
    expect(cap.reason).toContain('어댑터');
  });

  it('어댑터 획득 시 true + adapterInfo', async () => {
    setNavigator({
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({
          requestAdapterInfo: vi.fn().mockResolvedValue({
            vendor: 'apple',
            architecture: 'metal',
            description: 'Apple M1',
          }),
        }),
      },
    });
    const cap = await detectGpuCapability();
    expect(cap.webgpu).toBe(true);
    expect(cap.adapterInfo?.vendor).toBe('apple');
  });

  it('requestAdapterInfo 실패해도 webgpu:true 유지', async () => {
    setNavigator({
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({
          requestAdapterInfo: vi.fn().mockRejectedValue(new Error('not supported')),
        }),
      },
    });
    const cap = await detectGpuCapability();
    expect(cap.webgpu).toBe(true);
    expect(cap.adapterInfo).toBeUndefined();
  });

  it('requestAdapter throw 시 false + reason', async () => {
    setNavigator({
      gpu: { requestAdapter: vi.fn().mockRejectedValue(new Error('boom')) },
    });
    const cap = await detectGpuCapability();
    expect(cap.webgpu).toBe(false);
    expect(cap.reason).toBe('boom');
  });
});
