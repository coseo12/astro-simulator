import { afterEach, describe, expect, it, vi } from 'vitest';
import { detectGpuCapability } from './capability';
import { GPU_ADAPTER_TIMEOUT_MS } from './adapter-timeout';

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

/**
 * #1234 C3-A — 미결의 **결말**.
 *
 * 위 C2 블록의 미결 케이스들은 반환 Promise 가 영영 안 풀려 `void` + 마이크로태스크 flush 로만
 * 관측할 수 있었다. 그것이 곧 결함이었다. 여기서는 같은 입력에 **`await` 를 걸고 돌아온다**는
 * 것 자체가 판정량이다 — 이 단언은 상한을 지우면 **테스트가 타임아웃으로 죽는다**.
 */
describe('#1234 C3 — detectGpuCapability 어댑터 미결의 결말', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('requestAdapter 미결 → 상한에서 webgpu:false + 타임아웃 사유로 **반환한다**', async () => {
    vi.useFakeTimers();
    const marks: string[] = [];
    setNavigator({ gpu: { requestAdapter: () => new Promise(() => {}) } });

    const capPromise = detectGpuCapability((n) => marks.push(n));
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS);
    const cap = await capPromise;

    expect(cap.webgpu).toBe(false);
    // 「조용히 넘기지 않는다」 — 사유가 어댑터 null 과 갈려야 진단이 된다.
    expect(cap.reason).toContain('12000ms');
    expect(cap.reason).toContain('#1234');
    expect(marks).toContain('gpu:adapter-timeout');
    expect(marks.at(-1)).toBe('gpu:adapter-timeout');
    // settle 한 적이 없으므로 settle 마크는 없어야 한다 (상한이 settle 을 흉내내지 않는다).
    expect(marks).not.toContain('gpu:adapter-resolved');
  });

  it('「어댑터 null」과 「어댑터 미응답」의 사유가 서로 다르다', async () => {
    setNavigator({ gpu: { requestAdapter: vi.fn().mockResolvedValue(null) } });
    const nullCap = await detectGpuCapability();

    vi.useFakeTimers();
    setNavigator({ gpu: { requestAdapter: () => new Promise(() => {}) } });
    const timeoutPromise = detectGpuCapability();
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS);
    const timeoutCap = await timeoutPromise;

    expect(nullCap.webgpu).toBe(false);
    expect(timeoutCap.webgpu).toBe(false);
    // 결론은 같고 사유는 다르다 — 폴백이 진단을 지우지 않는다는 것이 C3 의 요구였다.
    expect(nullCap.reason).not.toBe(timeoutCap.reason);
  });

  it('requestAdapterInfo 미결 → 상한에서 adapterInfo 없이 webgpu:true 로 반환한다', async () => {
    vi.useFakeTimers();
    const marks: string[] = [];
    setNavigator({
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({
          requestAdapterInfo: () => new Promise<never>(() => {}),
        }),
      },
    });

    const capPromise = detectGpuCapability((n) => marks.push(n));
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS);
    const cap = await capPromise;

    // info 는 원래 「실패해도 webgpu 는 사용 가능」 계약이라 상한도 같은 결말로 흡수된다.
    expect(cap.webgpu).toBe(true);
    expect(cap.adapterInfo).toBeUndefined();
    expect(marks).toContain('gpu:adapter-info-timeout');
    // 종단 마크는 그대로 — 「함수가 끝났다」 축은 상한 도입으로 바뀌지 않는다.
    expect(marks.at(-1)).toBe('gpu:detect-return');
    expect(marks).not.toContain('gpu:adapter-info-resolved');
  });

  it('정상 경로는 상한 마크 0 — 건강한 부팅에 흔적을 남기지 않는다', async () => {
    const marks: string[] = [];
    setNavigator({
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({
          requestAdapterInfo: vi.fn().mockResolvedValue({ vendor: 'apple', description: 'M3' }),
        }),
      },
    });

    const cap = await detectGpuCapability((n) => marks.push(n));
    expect(cap.webgpu).toBe(true);
    expect(cap.adapterInfo?.description).toBe('M3');
    expect(marks.filter((m) => m.includes('timeout'))).toEqual([]);
  });
});

/**
 * #1238 리뷰 R1 — **직렬 2회 주입.** 이 함수의 어댑터 계열 await 는 둘이고
 * (`requestAdapter` → `requestAdapterInfo`) 상한이 호출당이면 대기 합이 `2 × 12 s` 로 자란다.
 *
 * 아래는 그 최악 배치를 그대로 주입한다: 1회차가 **관측 최댓값 8082 ms 만큼 걸려** settle 하고
 * 2회차가 **영영 미결**. 호출당 상한이었다면 이 함수는 `8082 + 12_000 = 20_082 ms` 에 반환해
 * 가드 핸들 대기 한계 `20_000 ms` 를 넘는다 — **처방이 있어도 가드가 타임아웃한다**.
 */
describe('#1238 R1 — detectGpuCapability 체인의 어댑터 대기 합', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('1회차 8082ms settle + 2회차 미결 → 체인이 12_000ms 에 끝난다 (20_082 아님)', async () => {
    vi.useFakeTimers();
    const marks: string[] = [];
    let resolveAdapter: ((v: unknown) => void) | undefined;
    setNavigator({
      gpu: {
        requestAdapter: () =>
          new Promise((resolve) => {
            resolveAdapter = resolve;
          }),
      },
    });

    let settled = false;
    const capPromise = detectGpuCapability((n) => marks.push(n)).then((c) => {
      settled = true;
      return c;
    });

    // 1회차: 관측 최댓값만큼 걸려 **성공적으로** settle (미결이 아니다).
    await vi.advanceTimersByTimeAsync(8082);
    resolveAdapter?.({ requestAdapterInfo: () => new Promise<never>(() => {}) });
    await vi.advanceTimersByTimeAsync(0);
    expect(marks).toContain('gpu:adapter-resolved');
    expect(marks).not.toContain('gpu:adapter-timeout');

    // 2회차(`requestAdapterInfo`)는 잔여 3918ms 만 받는다.
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS - 8082 - 1);
    expect(settled).toBe(false); // 잔여가 남아 있는 동안은 조기 폴백이 아니다
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);

    const cap = await capPromise;
    // 결말은 양성이다 — 2회차 상한은 「adapterInfo 없이 webgpu:true」로 흡수된다.
    expect(cap.webgpu).toBe(true);
    expect(cap.adapterInfo).toBeUndefined();
    expect(marks).toContain('gpu:adapter-info-timeout');
    expect(marks.at(-1)).toBe('gpu:detect-return');
  });

  it('두 호출이 **모두 미결**이면 발화는 1회 — 앞 상한이 뒤 호출을 건너뛴다', async () => {
    vi.useFakeTimers();
    const marks: string[] = [];
    const requestAdapter = vi.fn(() => new Promise<never>(() => {}));
    setNavigator({ gpu: { requestAdapter } });

    const capPromise = detectGpuCapability((n) => marks.push(n));
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS);
    const cap = await capPromise;

    expect(cap.webgpu).toBe(false);
    // 「상한 2회 발화」는 구조적으로 없다 — 이것이 R1 의 합을 만드는 기전이 아님을 고정한다.
    expect(marks.filter((m) => m.endsWith('-timeout'))).toEqual(['gpu:adapter-timeout']);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });
});
