/**
 * #849 — engine-factory webgpu→webgl2 fallback 분기 테스트.
 *
 * createEngine 의 분기 (ADR docs/phases/architecture.md §6 "WebGPU-first + WebGL2 폴백"):
 *  (1) navigator/gpu 부재 → webgl2 (WebGPUEngine 생성 시도 자체가 없어야 함)
 *  (2) requestAdapter null/throw → webgl2 (헤드리스 브라우저 경로)
 *  (3) adapter 존재 → webgpu + timestamp-query feature 조건부 요청 (P4-D #166)
 *  (4) adapter 존재 but initAsync 실패 → console.warn + webgl2 폴백 (catch 분기)
 *
 * @babylonjs/core 는 vi.mock 으로 전면 대체 (SSR 격리 — Babylon import 그래프가 실 엔진/
 * WebGL 컨텍스트를 요구하므로 node 환경에서 생성자 관측용 스텁으로 치환).
 * navigator 모킹은 gpu/capability.test.ts 의 defineProperty 패턴 동형.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';

const { engineCtorSpy, webgpuCtorSpy, initAsyncMock } = vi.hoisted(() => ({
  engineCtorSpy: vi.fn(),
  webgpuCtorSpy: vi.fn(),
  initAsyncMock: vi.fn(),
}));

vi.mock('@babylonjs/core', () => {
  class Engine {
    constructor(...args: unknown[]) {
      engineCtorSpy(...args);
    }
  }
  class WebGPUEngine {
    initAsync = initAsyncMock;
    constructor(...args: unknown[]) {
      webgpuCtorSpy(...args);
    }
  }
  return { Engine, WebGPUEngine };
});

import { createEngine } from './engine-factory.js';
import { GPU_ADAPTER_TIMEOUT_MS } from '../gpu/adapter-timeout.js';

// gpu/capability.test.ts 동형 — Node 21+ 는 전역 navigator 가 실존하므로 defineProperty 로 교체.
const setNavigator = (value: unknown) => {
  Object.defineProperty(globalThis, 'navigator', {
    value,
    configurable: true,
    writable: true,
  });
};

const canvas = {} as HTMLCanvasElement;

afterEach(() => {
  setNavigator(undefined);
  vi.clearAllMocks();
});

describe('#849 createEngine — WebGL2 폴백 분기 (WebGPU 사전 판별 실패)', () => {
  it('navigator 부재 → webgl2 (WebGPUEngine 생성 시도 없음)', async () => {
    setNavigator(undefined);
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
    expect(webgpuCtorSpy).not.toHaveBeenCalled();
    // Engine(canvas, antialias=true, opts) 시그니처 + 옵션 계약 핀.
    expect(engineCtorSpy).toHaveBeenCalledTimes(1);
    expect(engineCtorSpy).toHaveBeenCalledWith(canvas, true, {
      preserveDrawingBuffer: true,
      stencil: true,
      adaptToDeviceRatio: true,
    });
  });

  it('navigator.gpu 미노출 → webgl2', async () => {
    setNavigator({});
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
    expect(webgpuCtorSpy).not.toHaveBeenCalled();
  });

  it('requestAdapter null (헤드리스 브라우저) → webgl2', async () => {
    setNavigator({ gpu: { requestAdapter: vi.fn().mockResolvedValue(null) } });
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
    expect(webgpuCtorSpy).not.toHaveBeenCalled();
  });

  it('requestAdapter throw → webgl2 (사전 판별 catch)', async () => {
    setNavigator({ gpu: { requestAdapter: vi.fn().mockRejectedValue(new Error('boom')) } });
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
    expect(webgpuCtorSpy).not.toHaveBeenCalled();
  });
});

describe('#849 createEngine — WebGPU 경로 + timestamp-query 조건부 feature', () => {
  it('adapter 존재 (feature 없음) → webgpu + requiredFeatures 빈 배열', async () => {
    setNavigator({
      gpu: { requestAdapter: vi.fn().mockResolvedValue({ features: [] }) },
    });
    initAsyncMock.mockResolvedValue(undefined);
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgpu');
    expect(engineCtorSpy).not.toHaveBeenCalled();
    expect(webgpuCtorSpy).toHaveBeenCalledTimes(1);
    expect(webgpuCtorSpy).toHaveBeenCalledWith(canvas, {
      antialias: true,
      stencil: true,
      adaptToDeviceRatio: true,
      deviceDescriptor: { requiredFeatures: [] },
    });
    expect(initAsyncMock).toHaveBeenCalledTimes(1);
  });

  it('adapter 가 timestamp-query 지원 → requiredFeatures 에 포함 (P4-D #166)', async () => {
    setNavigator({
      gpu: {
        requestAdapter: vi.fn().mockResolvedValue({ features: ['timestamp-query'] }),
      },
    });
    initAsyncMock.mockResolvedValue(undefined);
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgpu');
    expect(webgpuCtorSpy).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({
        deviceDescriptor: { requiredFeatures: ['timestamp-query'] },
      }),
    );
  });

  it('adapter 존재 but initAsync 실패 → console.warn + webgl2 폴백 (catch 분기)', async () => {
    setNavigator({
      gpu: { requestAdapter: vi.fn().mockResolvedValue({ features: [] }) },
    });
    initAsyncMock.mockRejectedValue(new Error('device lost'));
    const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);

    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
    expect(webgpuCtorSpy).toHaveBeenCalledTimes(1); // 시도는 했고
    expect(engineCtorSpy).toHaveBeenCalledTimes(1); // 폴백으로 WebGL2 생성
    expect(warnSpy).toHaveBeenCalledWith(
      expect.stringContaining('WebGL2로 폴백'),
      expect.any(Error),
    );
    warnSpy.mockRestore();
  });
});

/**
 * #1234 C2 2단계 — 어댑터 **사전 판별** 구간 계측.
 *
 * `engine:webgpu-probe` 는 `isWebGpuUsable()` 이 **끝난 뒤** 찍힌다. 그 안쪽이
 * `await gpu.requestAdapter()` 라 (`gpu/capability.ts` 와 같은 실패 모드) 거기서 멈추면
 * createEngine 이 마크를 하나도 남기지 못했고, 그러면 「`start()` 미호출」과 「어댑터 조회
 * 미결」이 **같은 스냅샷** (엔진 마크 0) 으로 보였다. 아래가 그 둘이 갈림을 단언한다.
 */
describe('#1234 C2 — createEngine 어댑터 사전 판별 마크', () => {
  const flush = async () => {
    for (let i = 0; i < 5; i += 1) await Promise.resolve();
  };

  it('훅 미지정이면 호출 0 (기존 분기 계약 불변)', async () => {
    setNavigator({});
    const created = await createEngine(canvas);
    expect(created.kind).toBe('webgl2');
  });

  it('navigator.gpu 부재 — 진입 마크는 있고 어댑터 호출 마크는 없다', async () => {
    const marks: string[] = [];
    setNavigator({});
    await createEngine(canvas, (n) => marks.push(n));

    expect(marks).toEqual(['engine:create-enter', 'engine:webgpu-probe', 'engine:webgl2-ctor']);
    expect(marks).not.toContain('engine:probe-adapter-call');
  });

  it('requestAdapter 미결 — `engine:probe-adapter-call` 에서 멈춘다', async () => {
    const marks: string[] = [];
    setNavigator({ gpu: { requestAdapter: () => new Promise(() => {}) } });
    void createEngine(canvas, (n) => marks.push(n));
    await flush();

    expect(marks).toEqual(['engine:create-enter', 'engine:probe-adapter-call']);
    // 이 마크가 없으면 아래 「미호출」 케이스와 구분이 불가능하다.
    expect(marks).not.toContain('engine:webgpu-probe');
  });

  it('「createEngine 미호출」과 「어댑터 조회 미결」이 스냅샷으로 갈린다', async () => {
    const notCalled: string[] = [];
    // (가) 아예 호출하지 않음 — 마크 0.

    const pending: string[] = [];
    setNavigator({ gpu: { requestAdapter: () => new Promise(() => {}) } });
    void createEngine(canvas, (n) => pending.push(n));
    await flush();

    expect(notCalled.at(-1)).toBeUndefined();
    expect(pending.at(-1)).toBe('engine:probe-adapter-call');
  });
});

/**
 * #1234 C3-A — 미결 어댑터의 **결말**.
 *
 * C2 의 판정량이 「미결이 판별된다」였다면 C3 의 판정량은 **「미결이 끝난다」** 다. 그래서
 * 단언은 마크가 아니라 **`createEngine` 의 반환 자체**에 건다 — 위 C2 블록의 미결 케이스는
 * `void` 로 던져두고 마크만 봤지만 (반환을 `await` 하면 테스트가 행한다), 여기서는 같은 입력에
 * `await` 를 걸고 **돌아온다**는 것이 판정량이다.
 */
describe('#1234 C3-A — 어댑터 미결의 결말 (상한 + WebGL2 폴백)', () => {
  afterEach(() => {
    vi.useRealTimers();
  });

  it('사전 판별 미결 → 상한에서 webgl2 로 폴백하고 **반환한다**', async () => {
    vi.useFakeTimers();
    const marks: string[] = [];
    setNavigator({ gpu: { requestAdapter: () => new Promise(() => {}) } });

    const created = createEngine(canvas, (n) => marks.push(n));
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS);

    await expect(created).resolves.toMatchObject({ kind: 'webgl2' });
    expect(webgpuCtorSpy).not.toHaveBeenCalled();
    // 「어댑터가 null 이었다」와 「어댑터가 응답하지 않았다」를 가르는 마크.
    expect(marks).toContain('engine:probe-adapter-timeout');
    expect(marks.at(-1)).toBe('engine:webgl2-ctor');
  });

  it('상한 **직전**까지는 여전히 미결 — 조기 폴백이 아니다', async () => {
    vi.useFakeTimers();
    let done = false;
    setNavigator({ gpu: { requestAdapter: () => new Promise(() => {}) } });
    void createEngine(canvas).then(() => {
      done = true;
    });

    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS - 1);
    expect(done).toBe(false);
    expect(engineCtorSpy).not.toHaveBeenCalled();

    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);
  });

  it('getWebGpuFeatures 의 2회차 어댑터 조회가 미결이어도 WebGPU 생성은 진행한다', async () => {
    vi.useFakeTimers();
    const marks: string[] = [];
    let call = 0;
    initAsyncMock.mockResolvedValue(undefined);
    setNavigator({
      gpu: {
        requestAdapter: () => {
          call += 1;
          // 1회차 (사전 판별) 는 settle, 2회차 (feature 조회) 는 미결 — 「앞이 settle 했으니
          // 뒤도 settle 한다」가 보장이 아님을 재현한다.
          return call === 1
            ? Promise.resolve({ features: new Set(['timestamp-query']) })
            : new Promise(() => {});
        },
      },
    });

    const created = createEngine(canvas, (n) => marks.push(n));
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS);

    await expect(created).resolves.toMatchObject({ kind: 'webgpu' });
    expect(marks).toContain('engine:features-adapter-timeout');
    // feature 집합이 비었으므로 timestamp-query 는 요청되지 않는다 (P4-D bench 전용 — 폴백 결말).
    expect(webgpuCtorSpy).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({ deviceDescriptor: { requiredFeatures: [] } }),
    );
  });

  /**
   * #1238 리뷰 R1 — **직렬 2회 주입.** `createEngine` 의 어댑터 조회는 둘이고
   * (`isWebGpuUsable` → `getWebGpuFeatures`) 상한이 호출당이면 대기 합이 `2 × 12 s` 로 자란다.
   *
   * 아래는 최악 배치다: 1회차가 **관측 최댓값 8082 ms 만큼 걸려** settle 하고 2회차가 **영영
   * 미결**. 호출당 상한이었다면 `createEngine` 은 `8082 + 12_000 = 20_082 ms` 에 반환해 가드
   * 핸들 대기 한계 `20_000 ms` 를 넘는다.
   *
   * 위 「2회차 미결이어도 WebGPU 생성은 진행한다」 케이스와 축이 다르다 — 저쪽은 **결말**을,
   * 이쪽은 **시각**을 잰다.
   */
  it('1회차 8082ms settle + 2회차 미결 → 체인이 12_000ms 에 끝난다 (20_082 아님)', async () => {
    vi.useFakeTimers();
    const marks: string[] = [];
    let done = false;
    let call = 0;
    let resolveFirst: ((v: unknown) => void) | undefined;
    initAsyncMock.mockResolvedValue(undefined);
    setNavigator({
      gpu: {
        requestAdapter: () => {
          call += 1;
          if (call === 1) {
            return new Promise((resolve) => {
              resolveFirst = resolve;
            });
          }
          return new Promise(() => {});
        },
      },
    });

    void createEngine(canvas, (n) => marks.push(n)).then(() => {
      done = true;
    });

    // 1회차: 관측 최댓값만큼 걸려 **성공적으로** settle (미결이 아니다).
    await vi.advanceTimersByTimeAsync(8082);
    resolveFirst?.({ features: new Set(['timestamp-query']) });
    await vi.advanceTimersByTimeAsync(0);
    expect(marks).toContain('engine:webgpu-probe');
    expect(marks).not.toContain('engine:probe-adapter-timeout');

    // 2회차(`getWebGpuFeatures`)는 잔여 3918ms 만 받는다.
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS - 8082 - 1);
    expect(done).toBe(false); // 잔여가 남아 있는 동안은 조기 폴백이 아니다
    await vi.advanceTimersByTimeAsync(1);
    expect(done).toBe(true);

    // 결말은 양성이다 — 2회차 상한은 「빈 feature 집합」으로 흡수되고 WebGPU 생성은 진행된다.
    expect(marks).toContain('engine:features-adapter-timeout');
    expect(webgpuCtorSpy).toHaveBeenCalledWith(
      canvas,
      expect.objectContaining({ deviceDescriptor: { requiredFeatures: [] } }),
    );
  });

  it('두 조회가 **모두 미결**이면 발화는 1회 — 앞 상한이 뒤 호출을 건너뛴다', async () => {
    vi.useFakeTimers();
    const marks: string[] = [];
    const requestAdapter = vi.fn(() => new Promise<never>(() => {}));
    setNavigator({ gpu: { requestAdapter } });

    const created = createEngine(canvas, (n) => marks.push(n));
    await vi.advanceTimersByTimeAsync(GPU_ADAPTER_TIMEOUT_MS);
    await expect(created).resolves.toMatchObject({ kind: 'webgl2' });

    // 「상한 2회 발화」는 구조적으로 없다 — R1 의 합을 만드는 기전이 발화 횟수가 아님을 고정한다.
    expect(marks.filter((m) => m.endsWith('-timeout'))).toEqual(['engine:probe-adapter-timeout']);
    expect(requestAdapter).toHaveBeenCalledTimes(1);
  });

  it('정상 어댑터 경로는 상한 마크 0 — 상한이 건강한 부팅에 흔적을 남기지 않는다', async () => {
    const marks: string[] = [];
    initAsyncMock.mockResolvedValue(undefined);
    setNavigator({
      gpu: { requestAdapter: vi.fn().mockResolvedValue({ features: new Set() }) },
    });

    const created = await createEngine(canvas, (n) => marks.push(n));
    expect(created.kind).toBe('webgpu');
    expect(marks.filter((m) => m.includes('timeout'))).toEqual([]);
  });
});
