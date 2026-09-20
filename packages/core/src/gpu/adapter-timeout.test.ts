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
  createAdapterBudget,
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
    const p = withAdapterTimeoutMarked(
      pending<string>(),
      'x:timeout',
      (n) => marks.push(n),
      createAdapterBudget(1000),
    );
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
      createAdapterBudget(1000),
    );
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe('v');
    expect(marks).toEqual([]);
  });

  it('훅 미지정이면 상한 도달에도 호출 0 (계측 비활성 = 도입 전과 같은 경로)', async () => {
    vi.useFakeTimers();
    const p = withAdapterTimeoutMarked(
      pending<string>(),
      'x:timeout',
      undefined,
      createAdapterBudget(1000),
    );
    await vi.advanceTimersByTimeAsync(1000);
    await expect(p).resolves.toBe(GPU_ADAPTER_TIMEOUT);
  });

  it('예산 미지정이면 단발 상한 `GPU_ADAPTER_TIMEOUT_MS` (기존 계약 보존)', async () => {
    vi.useFakeTimers();
    const p = withAdapterTimeoutMarked(pending<string>(), 'x:timeout');
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS - 1);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe(GPU_ADAPTER_TIMEOUT);
  });
});

/**
 * #1238 리뷰 R1 — **체인 예산**.
 *
 * 판정량은 「각 호출이 상한을 갖는다」가 아니라 **「직렬 호출들의 대기 합이 총 예산을 넘지
 * 않는다」** 다. 호출당 상한이면 그 합이 `n × 12 s` 로 자라 가드 핸들 대기 한계 `20_000 ms` 를
 * 넘고, 그러면 처방이 있어도 가드는 여전히 타임아웃한다.
 *
 * ⚠️ 합을 키우는 것은 「상한 2회 발화」가 아니다 — 앞 상한이 발화하면 호출자가 뒤 호출을
 * 건너뛰므로 한 체인의 발화는 최대 1회다. 키우는 것은 **「앞이 느리게 settle + 뒤가 미결」**
 * 이고, 아래 두 번째 케이스가 그 배치를 그대로 잰다.
 */
describe('#1238 R1 createAdapterBudget — 체인 전체가 하나의 예산을 쓴다', () => {
  it('직렬 두 호출이 **모두 미결**이어도 합이 총 예산이다 (2배가 아니다)', async () => {
    vi.useFakeTimers();
    const budget = createAdapterBudget(1000);
    const first = withAdapterTimeoutMarked(pending<string>(), 'a:timeout', undefined, budget);
    await vi.advanceTimersByTimeAsync(1000);
    await expect(first).resolves.toBe(GPU_ADAPTER_TIMEOUT);

    // 예산이 이미 소진됐다 — 두 번째 호출은 **시간을 더 쓰지 않고** 즉시 결말난다.
    let secondSettled = false;
    const second = withAdapterTimeoutMarked(pending<string>(), 'b:timeout', undefined, budget).then(
      (v) => {
        secondSettled = true;
        return v;
      },
    );
    await vi.advanceTimersByTimeAsync(0);
    expect(secondSettled).toBe(true);
    await expect(second).resolves.toBe(GPU_ADAPTER_TIMEOUT);
    // 합 = 1000ms. 호출당 상한이었다면 2000ms 여야 한다.
    expect(vi.getTimerCount()).toBe(0);
    budget.release();
  });

  it('앞 호출이 **늦게 settle** 하면 뒤 호출은 잔여만 받는다 (R1 의 실제 배치)', async () => {
    vi.useFakeTimers();
    const budget = createAdapterBudget(1000);
    // 앞: 820ms 에 settle (관측 최댓값 8082ms ↔ 예산 12_000ms 의 축소 재현).
    let resolveFirst: ((v: string) => void) | undefined;
    const firstRaw = new Promise<string>((r) => {
      resolveFirst = r;
    });
    const first = withAdapterTimeoutMarked(firstRaw, 'a:timeout', undefined, budget);
    await vi.advanceTimersByTimeAsync(820);
    resolveFirst?.('adapter');
    await expect(first).resolves.toBe('adapter');

    // 뒤: 미결. 남은 예산은 180ms 다 — 호출당 상한이었다면 여기서 1000ms 를 더 썼을 자리다.
    let secondSettled = false;
    const second = withAdapterTimeoutMarked(pending<string>(), 'b:timeout', undefined, budget).then(
      (v) => {
        secondSettled = true;
        return v;
      },
    );
    await vi.advanceTimersByTimeAsync(179);
    expect(secondSettled).toBe(false); // 잔여가 남아 있는 동안은 조기 폴백이 아니다
    await vi.advanceTimersByTimeAsync(1);
    expect(secondSettled).toBe(true);
    await expect(second).resolves.toBe(GPU_ADAPTER_TIMEOUT);
    budget.release();
  });

  it('마감 시계는 **첫 호출**에서 시작한다 (예산 생성 시점이 아니다)', async () => {
    vi.useFakeTimers();
    const budget = createAdapterBudget(1000);
    // 예산을 만들어 두고 500ms 를 흘려도 아직 시계는 안 돈다 — 체인이 어댑터를 기다리기
    // 시작한 시점이 기준이다.
    await vi.advanceTimersByTimeAsync(500);
    expect(vi.getTimerCount()).toBe(0);

    const p = withAdapterTimeoutMarked(pending<string>(), 'a:timeout', undefined, budget);
    await vi.advanceTimersByTimeAsync(999);
    expect(vi.getTimerCount()).toBe(1);
    await vi.advanceTimersByTimeAsync(1);
    await expect(p).resolves.toBe(GPU_ADAPTER_TIMEOUT);
    budget.release();
  });

  it('`release()` 는 공유 타이머를 놓는다 — 남기면 프로세스가 예산만큼 더 산다', async () => {
    vi.useFakeTimers();
    const budget = createAdapterBudget(60_000);
    const p = withAdapterTimeoutMarked(Promise.resolve('x'), 'a:timeout', undefined, budget);
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe('x');
    expect(vi.getTimerCount()).toBe(1); // 체인이 아직 안 끝났으므로 마감은 살아 있다
    budget.release();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('해제된 예산은 **즉시 소진**으로 답한다 (재무장도, 무한 대기도 아니다)', async () => {
    vi.useFakeTimers();
    const budget = createAdapterBudget(1000);
    budget.release();
    // 해제 뒤 호출은 체인 소유자의 버그다. 타이머를 다시 걸면 해제 계약이 거짓이 되고,
    // 영영 미결이면 이 모듈이 고치려던 증상 그 자체가 된다 → fail-closed.
    const p = withAdapterTimeoutMarked(pending<string>(), 'a:timeout', undefined, budget);
    await vi.advanceTimersByTimeAsync(0);
    await expect(p).resolves.toBe(GPU_ADAPTER_TIMEOUT);
    expect(vi.getTimerCount()).toBe(0);
  });
});

describe('#1234 C3-A 상한 값 자체의 계약', () => {
  /**
   * 가드가 장면 핸들을 기다리는 한계. **동결 리터럴**이다 — 허용치를 다른 측정량에 연동하면
   * 고장난 측정이 허용치를 부풀린다 (#1238 리뷰 R7 은 이 선택 자체는 옳다고 확인했다).
   *
   * ⚠️ 이 값의 **정본은 `scripts/browser-verify-utils.mjs` 의 `handleTimeout` 기본값**이고
   * 여기 있는 것은 그 사본이다 (저장소에 사본이 여럿 있다 — 인라인 verify 8종 ·
   * `apps/web/scripts/browser-verify-1234-adapter-stall.mjs` 의 `HANDLE_TIMEOUT_MS`).
   * 어느 가드의 한계가 이 값 **밑으로** 내려가면 아래 예산 단언은 **조용히 통과한다** —
   * 정본을 낮출 때 이 사본을 함께 내리는 것이 그 창을 닫는 유일한 수단이다.
   */
  const GUARD_HANDLE_LIMIT_MS = 20_000;

  it('가드 핸들 대기 한계(20_000ms)보다 충분히 작다 — 크면 처방이 무의미하다', () => {
    // 이 단언이 깨지면 「상한이 걸려도 가드는 한계 안에서 끝난다」가 거짓이 된다.
    expect(GPU_ADAPTER_TIMEOUT_MS).toBeLessThanOrEqual(GUARD_HANDLE_LIMIT_MS * 0.6);
  });

  it('**체인 어댑터 대기 합** + 어댑터 이후 부팅 작업이 가드 한계 안에 들어간다', () => {
    // 위 단언(비율)과 다른 축이다 — 이쪽은 **절대 시간 예산**이다. 상한이 0.6 배를 지켜도
    // 뒤 작업이 커지면 합이 한계를 넘을 수 있으므로 합으로 한 번 더 건다.
    //
    // #1238 리뷰 R1 — 이 단언의 왼쪽 항이 성립하려면 상한이 **호출당이 아니라 체인당**이어야
    // 한다. 호출당이면 부팅 한 번의 어댑터 대기가 `12_000` 이 아니라 그 배수까지 자라
    // (`isWebGpuUsable` → `getWebGpuFeatures`, `requestAdapter` → `requestAdapterInfo`)
    // 이 식의 왼쪽이 실제 최악과 달라진다. 「체인 합 = 총 예산」을 고정하는 것은 위
    // §`createAdapterBudget` 블록이고, 이 단언은 그 합을 **가드 한계**에 대는 축이다.
    const POST_ADAPTER_BOOT_MAX_MS = 2555; // 96 표본의 `handlesMs − m2 어댑터 구간` 최댓값
    const CHAIN_ADAPTER_WAIT_MAX_MS = GPU_ADAPTER_TIMEOUT_MS; // 체인당 예산 = 대기 합의 상계
    expect(CHAIN_ADAPTER_WAIT_MAX_MS + POST_ADAPTER_BOOT_MAX_MS).toBeLessThan(
      GUARD_HANDLE_LIMIT_MS,
    );
  });

  it('관측 최댓값(8082ms)보다 크다 — 정상 부팅에서 발화하면 진단 신호가 죽는다', () => {
    // ⚠️ 모집단 술어 (#1238 리뷰 R3): `8082` 는 headless swiftshader 에서 `requestAdapter()` 가
    // **`adapter === null` 로 settle** 한 시간의 최댓값이다 (96 표본 전건 `gpu:adapter-null`).
    // 실 어댑터를 넘겨받는 시간의 분포가 아니므로 이 하한은 **하드웨어 경로에 대한 근거가
    // 아니다** — `12_000` 을 지탱하는 것은 위 두 단언(가드 한계에서 유도)이다.
    expect(GPU_ADAPTER_TIMEOUT_MS).toBeGreaterThan(8082);
  });

  it('폴백 사유에 상한 값과 이슈 번호가 남는다 (조용히 넘기지 않는다)', () => {
    const reason = adapterTimeoutReason('GPU 어댑터 요청', GPU_ADAPTER_TIMEOUT_MS);
    expect(reason).toContain('12000ms');
    expect(reason).toContain('#1234');
    expect(reason).toContain('GPU 어댑터 요청');
  });
});
