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

/**
 * #1234 C2 2단계 — 부팅 계측 마크.
 *
 * 본 계측의 **유일한 존재 이유**는 아래 세 경우를 `bootPhases` 스냅샷 하나로 가르는 것이다
 * (계약 C2 기준 2). 갈리지 않으면 계측이 실패한 것이므로, 세 경우를 각각 재현해 **마지막
 * 마크가 서로 다름**을 직접 단언한다 — 「마크가 찍힌다」가 아니라 「판별된다」가 판정량이다.
 *
 *  (가) `requestAdapter` 호출 **전**
 *  (나) 호출했고 **미결**
 *  (다) settle 했는데 그 **뒤**가 느림
 *
 * 미결 케이스는 `detectGpuCapability()` 의 반환 Promise 자체가 영영 안 풀리므로 **await 하면
 * 안 된다**. 마이크로태스크만 flush 하고 그 시점 스냅샷을 읽는다 — 실제 실패 표본에서 진단
 * 스크립트가 하는 일과 같은 형태다.
 */
describe('#1234 C2 — detectGpuCapability 부팅 계측 마크', () => {
  /** 마이크로태스크 큐를 비운다 (pending Promise 는 그대로 남는다). */
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };

  it('훅 미지정이면 호출 0 — 도입 전과 같은 경로', async () => {
    setNavigator({ gpu: { requestAdapter: vi.fn().mockResolvedValue(null) } });
    // 훅 없이도 반환 계약이 그대로임을 확인 (계측이 결과를 바꾸지 않는다).
    const cap = await detectGpuCapability();
    expect(cap.webgpu).toBe(false);
  });

  it('(가) navigator.gpu 부재 — 호출 전에 종단', async () => {
    const marks: string[] = [];
    setNavigator({});
    await detectGpuCapability((n) => marks.push(n));
    expect(marks).toEqual(['gpu:detect-enter', 'gpu:detect-unsupported']);
    expect(marks).not.toContain('gpu:adapter-call');
  });

  it('(나) requestAdapter 미결 — `gpu:adapter-call` 에서 멈춘다', async () => {
    const marks: string[] = [];
    // 영영 settle 하지 않는 Promise = CI 실패 표본의 가설 그 자체.
    setNavigator({ gpu: { requestAdapter: () => new Promise<unknown>(() => {}) } });
    void detectGpuCapability((n) => marks.push(n));
    await flush();

    expect(marks).toEqual(['gpu:detect-enter', 'gpu:adapter-call']);
    // 핵심: 「호출했다」는 찍혔는데 settle 마크가 없다 → (가) 와 명시적으로 갈린다.
    expect(marks).not.toContain('gpu:adapter-resolved');
    expect(marks).not.toContain('gpu:adapter-rejected');
  });

  it('(다) settle 후 adapterInfo 미결 — settle 마크까지는 찍힌다', async () => {
    const marks: string[] = [];
    setNavigator({
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({
          requestAdapterInfo: () => new Promise<never>(() => {}),
        }),
      },
    });
    void detectGpuCapability((n) => marks.push(n));
    await flush();

    expect(marks).toEqual([
      'gpu:detect-enter',
      'gpu:adapter-call',
      'gpu:adapter-resolved',
      'gpu:adapter-info-call',
    ]);
    expect(marks).not.toContain('gpu:detect-return');
  });

  it('세 경우의 **마지막 마크**가 서로 다르다 (판별력 자체의 단언)', async () => {
    const lastMarkOf = async (navigatorValue: unknown): Promise<string | undefined> => {
      const marks: string[] = [];
      setNavigator(navigatorValue);
      void detectGpuCapability((n) => marks.push(n));
      await flush();
      return marks.at(-1);
    };

    const before = await lastMarkOf({}); // (가)
    const pending = await lastMarkOf({ gpu: { requestAdapter: () => new Promise(() => {}) } }); // (나)
    const afterSettle = await lastMarkOf({
      gpu: {
        requestAdapter: () => Promise.resolve({ requestAdapterInfo: () => new Promise(() => {}) }),
      },
    }); // (다)

    expect(new Set([before, pending, afterSettle]).size).toBe(3);
    expect(before).toBe('gpu:detect-unsupported');
    expect(pending).toBe('gpu:adapter-call');
    expect(afterSettle).toBe('gpu:adapter-info-call');
  });

  it('거부는 미결과 갈린다 — `gpu:adapter-rejected` 후 종단', async () => {
    const marks: string[] = [];
    setNavigator({ gpu: { requestAdapter: vi.fn().mockRejectedValue(new Error('boom')) } });
    const cap = await detectGpuCapability((n) => marks.push(n));

    expect(marks).toEqual([
      'gpu:detect-enter',
      'gpu:adapter-call',
      'gpu:adapter-rejected',
      'gpu:detect-error',
    ]);
    // 계측이 기존 반환 계약을 바꾸지 않았음을 같은 케이스에서 확인 (rethrow 경로).
    expect(cap.reason).toBe('boom');
  });

  it('정상 경로는 종단 마크까지 — 뒤가 느리면 소비자 마크 부재로 갈린다', async () => {
    const marks: string[] = [];
    setNavigator({
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({
          requestAdapterInfo: vi.fn().mockResolvedValue({ vendor: 'apple' }),
        }),
      },
    });
    const cap = await detectGpuCapability((n) => marks.push(n));

    expect(marks).toEqual([
      'gpu:detect-enter',
      'gpu:adapter-call',
      'gpu:adapter-resolved',
      'gpu:adapter-info-call',
      'gpu:adapter-info-resolved',
      'gpu:detect-return',
    ]);
    expect(cap.webgpu).toBe(true);
  });

  it('adapter null 은 종단 마크가 따로다 (`gpu:adapter-null`)', async () => {
    const marks: string[] = [];
    setNavigator({ gpu: { requestAdapter: vi.fn().mockResolvedValue(null) } });
    await detectGpuCapability((n) => marks.push(n));
    expect(marks.at(-1)).toBe('gpu:adapter-null');
  });

  it('requestAdapterInfo 미노출 브라우저는 absent 마크로 구분된다', async () => {
    const marks: string[] = [];
    setNavigator({ gpu: { requestAdapter: vi.fn().mockResolvedValue({}) } });
    await detectGpuCapability((n) => marks.push(n));
    expect(marks).toContain('gpu:adapter-info-absent');
    expect(marks.at(-1)).toBe('gpu:detect-return');
  });
});
