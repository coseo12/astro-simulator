/**
 * #1234 C3-A — 어댑터 조회 상한 헬퍼.
 *
 * 판정량은 「상한이 있다」가 아니라 **「미결이 유한 시간에 결말난다」** 다. 그래서 세 경우를
 * 각각 재현해 서로 다른 결말을 단언한다:
 *
 *  (가) 상한 전에 settle → 그 값 그대로 (상한이 결과를 바꾸지 않는다)
 *  (나) 영영 미결 → 상한에서 센티널 (결함 시나리오 그 자체)
 *  (다) 거부 → 그대로 거부 (삼키면 「거부」와 「미결」이 뭉개진다 — C2 계측이 만든 해상도 소실)
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  GPU_ADAPTER_TIMEOUT,
  GPU_ADAPTER_TIMEOUT_MS,
  adapterTimeoutReason,
  withAdapterTimeout,
  withAdapterTimeoutMarked,
} from './adapter-timeout';

afterEach(() => {
  vi.useRealTimers();
});

/** 영영 settle 하지 않는 Promise — CI/로컬 실패 표본의 `requestAdapter()` 그 자체. */
const pending = <T>(): Promise<T> => new Promise<T>(() => {});

describe('#1234 C3-A withAdapterTimeout', () => {
  it('(가) 상한 전에 settle 하면 그 값 그대로 — 상한은 결과를 바꾸지 않는다', async () => {
    vi.useFakeTimers();
    const p = withAdapterTimeout(Promise.resolve({ ok: 1 }), 1000);
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toEqual({ ok: 1 });
  });

  it('(가-2) `null` settle 은 센티널과 갈린다 — 어댑터 없음 ≠ 어댑터 미응답', async () => {
    vi.useFakeTimers();
    const p = withAdapterTimeout(Promise.resolve(null), 1000);
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBeNull();
    expect(await p).not.toBe(GPU_ADAPTER_TIMEOUT);
  });

  it('(나) 영영 미결이면 상한에서 센티널로 결말난다', async () => {
    vi.useFakeTimers();
    const p = withAdapterTimeout(pending<string>(), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe(GPU_ADAPTER_TIMEOUT);
  });

  it('(나-2) 상한 **직전**에는 아직 결말나지 않는다 (조기 폴백 차단)', async () => {
    vi.useFakeTimers();
    let settled = false;
    const p = withAdapterTimeout(pending<string>(), 1000).then((v) => {
      settled = true;
      return v;
    });
    await vi.advanceTimersByTimeAsync(999);
    expect(settled).toBe(false);
    await vi.advanceTimersByTimeAsync(1);
    expect(settled).toBe(true);
    await expect(p).resolves.toBe(GPU_ADAPTER_TIMEOUT);
  });

  it('(다) 거부는 그대로 전파한다 (삼키지 않는다)', async () => {
    vi.useFakeTimers();
    // 단언을 **먼저** 붙인다 — 거부한 Promise 를 핸들러 없이 한 틱 넘기면 그 자체로
    // unhandled rejection 경고가 나서, 헬퍼가 아니라 테스트가 만든 잡음이 섞인다.
    await expect(withAdapterTimeout(Promise.reject(new Error('boom')), 1000)).rejects.toThrow(
      'boom',
    );
  });

  it('상한이 이긴 뒤 대상이 늦게 거부해도 unhandled rejection 이 되지 않는다', async () => {
    vi.useFakeTimers();
    let rejectLate: ((e: unknown) => void) | undefined;
    const late = new Promise<string>((_, reject) => {
      rejectLate = reject;
    });
    const p = withAdapterTimeout(late, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe(GPU_ADAPTER_TIMEOUT);

    const onUnhandled = vi.fn();
    process.on('unhandledRejection', onUnhandled);
    rejectLate?.(new Error('late'));
    // 실 타이머로 마이크로태스크 + 한 틱을 흘려 unhandled 판정이 내려질 기회를 준다.
    vi.useRealTimers();
    await new Promise((r) => setTimeout(r, 10));
    process.off('unhandledRejection', onUnhandled);
    expect(onUnhandled).not.toHaveBeenCalled();
  });

  it('settle 하면 타이머를 정리한다 — 남기면 프로세스가 상한만큼 더 산다', async () => {
    vi.useFakeTimers();
    const p = withAdapterTimeout(Promise.resolve('x'), 60_000);
    await vi.advanceTimersByTimeAsync(0);
    await p;
    expect(vi.getTimerCount()).toBe(0);
  });

  it('기본 상한은 `GPU_ADAPTER_TIMEOUT_MS` (호출부가 값을 재선언하지 않는다)', async () => {
    vi.useFakeTimers();
    const p = withAdapterTimeout(pending<string>());
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS - 1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe(GPU_ADAPTER_TIMEOUT);
  });
});

describe('#1234 C3-A withAdapterTimeoutMarked — 마크는 상한 도달에서만', () => {
  it('상한 도달 시 마크 1개', async () => {
    vi.useFakeTimers();
    const marks: string[] = [];
    const p = withAdapterTimeoutMarked(pending<string>(), 'x:timeout', (n) => marks.push(n), 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe(GPU_ADAPTER_TIMEOUT);
    expect(marks).toEqual(['x:timeout']);
  });

  it('정상 settle 에서는 마크 0 — 「마지막 마크」 축을 흐리지 않는다', async () => {
    vi.useFakeTimers();
    const marks: string[] = [];
    const p = withAdapterTimeoutMarked(
      Promise.resolve('v'),
      'x:timeout',
      (n) => marks.push(n),
      1000,
    );
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe('v');
    expect(marks).toEqual([]);
  });

  it('훅 미지정이면 상한 도달에도 호출 0 (계측 비활성 = 도입 전과 같은 경로)', async () => {
    vi.useFakeTimers();
    const p = withAdapterTimeoutMarked(pending<string>(), 'x:timeout', undefined, 1000);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe(GPU_ADAPTER_TIMEOUT);
  });
});

describe('#1234 C3-A 상한 값 자체의 계약', () => {
  it('가드 핸들 대기 한계(20_000ms)보다 충분히 작다 — 크면 처방이 무의미하다', () => {
    // 이 단언이 깨지면 「상한이 걸려도 가드는 한계 안에서 끝난다」가 거짓이 된다.
    expect(GPU_ADAPTER_TIMEOUT_MS).toBeLessThanOrEqual(20_000 * 0.6);
  });

  it('상한 + 어댑터 이후 부팅 작업이 가드 한계 안에 들어간다 (실측 max 2555ms)', () => {
    // 위 단언(비율)과 다른 축이다 — 이쪽은 **절대 시간 예산**이다. 상한이 0.6 배를 지켜도
    // 뒤 작업이 커지면 합이 한계를 넘을 수 있으므로 합으로 한 번 더 건다.
    const POST_ADAPTER_BOOT_MAX_MS = 2555; // 96 표본의 `handlesMs − m2 어댑터 구간` 최댓값
    expect(GPU_ADAPTER_TIMEOUT_MS + POST_ADAPTER_BOOT_MAX_MS).toBeLessThan(20_000);
  });

  it('관측 최댓값(8082ms)보다 크다 — 정상 부팅에서 발화하면 진단 신호가 죽는다', () => {
    expect(GPU_ADAPTER_TIMEOUT_MS).toBeGreaterThan(8082);
  });

  it('폴백 사유에 상한 값과 이슈 번호가 남는다 (조용히 넘기지 않는다)', () => {
    const reason = adapterTimeoutReason('GPU 어댑터 요청', GPU_ADAPTER_TIMEOUT_MS);
    expect(reason).toContain('12000ms');
    expect(reason).toContain('#1234');
    expect(reason).toContain('GPU 어댑터 요청');
  });
});
