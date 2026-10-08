/**
 * #1308 — 시간 위상 등록 (`bindTimePhase`) 의 「등록 시점 현재 시각 1회 동기」 계약 회귀 가드.
 *
 * 결함 기전: `timeChanged` 는 엣지 이벤트라 늦게 붙은 구독자는 그 전 발화를 못 받는다. 부팅에서
 * scene 의 `updateAt` 구독은 `start()` resolve **뒤**에 붙는데, URL `?t=` 의 `jumpToJulianDate` 와
 * `start()` 말미 초기 알림은 그 **전**에 발화한다. 재생이면 `tick` 이 다시 발화해 가려지지만,
 * 일시정지 (`?speed=0`) 면 `tick` 이 `false` 라 장면이 생성자 기본값 (J2000) 에 머문다.
 *
 * 테스트는 부팅 순서를 그대로 재현한다 — `url-sync` 의 명령 (jump → setTimeScale) 이 `start()` 보다
 * 먼저, 시간 위상 등록은 `start()` resolve 뒤 (`sim-canvas` 의 `.then`).
 *
 * 변이 검출 [실측] — 5 테스트 중 FAIL 수. 원본 PASS → 변이 FAIL → 복구 PASS 3단 확인.
 *  - 변이 (a) 「즉시 호출 1줄 제거」(= 결함 판본, 단순 구독) → **4/5 FAIL** (일시정지 2건 포함)
 *  - 변이 (b) 「구독 1줄 제거」(즉시 호출만)              → **2/5 FAIL** (재생 추종 · 점프 추종)
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';

const h = vi.hoisted(() => ({
  /** `engine.runRenderLoop` 이 붙잡은 콜백 — 테스트가 수동으로 프레임을 돌린다. */
  renderLoopCb: null as (() => void) | null,
  sceneRender: vi.fn(),
  sceneDispose: vi.fn(),
  engineDispose: vi.fn(),
}));

// engine-factory.test.ts 동형 — node 환경에서 실 엔진/WebGL 컨텍스트를 요구하므로 스텁으로 치환.
vi.mock('@babylonjs/core', () => {
  class Scene {
    clearColor: unknown = null;
    render = h.sceneRender;
    dispose = h.sceneDispose;
  }
  class Color3 {}
  class Color4 {}
  return { Scene, Color3, Color4 };
});

vi.mock('@babylonjs/core/Instrumentation/engineInstrumentation.js', () => ({
  EngineInstrumentation: class {
    captureGPUFrameTime = false;
    gpuFrameTimeCounter = { current: 0, average: 0, lastSecAverage: 0 };
    dispose() {}
  },
}));

vi.mock('./engine-factory.js', () => ({
  createEngine: vi.fn(async () => ({
    kind: 'webgl2' as const,
    engine: {
      runRenderLoop: (cb: () => void) => {
        h.renderLoopCb = cb;
      },
      getFps: () => 60,
      resize: vi.fn(),
      dispose: h.engineDispose,
    },
  })),
}));

import { SimulationCore } from './simulation-core.js';

const makeCanvas = () => ({}) as unknown as HTMLCanvasElement;

/** `performance.now()` 를 결정적으로 통제 — 프레임 델타를 테스트가 지정한다. */
let nowMs = 1_000;

beforeEach(() => {
  nowMs = 1_000;
  h.renderLoopCb = null;
  vi.spyOn(performance, 'now').mockImplementation(() => nowMs);
  // node 환경에는 ResizeObserver 가 없다 (start() 가 생성자를 호출).
  Object.defineProperty(globalThis, 'ResizeObserver', {
    value: class {
      observe() {}
      unobserve() {}
      disconnect() {}
    },
    configurable: true,
    writable: true,
  });
});

afterEach(() => {
  vi.restoreAllMocks();
  vi.clearAllMocks();
});

/**
 * 프레임 1회 구동. `deltaMs` 만큼 시계를 진행시킨 뒤 렌더 루프 콜백을 부른다.
 *
 * ⚠️ 렌더 루프의 **첫 호출은 `#lastFrameTime === null` 이라 `dt = 0`** 이고,
 * `TimeController.tick(0)` 은 `dtSeconds <= 0` 에서 `false` 를 반환한다. 즉 첫 프레임은
 * 재생 중에도 `timeChanged` 를 발화하지 않는다 — 아래 테스트들이 이 사실에 의존한다.
 */
const frame = (deltaMs = 16) => {
  nowMs += deltaMs;
  h.renderLoopCb?.();
};

const T = 2_460_000.5;

/** `url-sync` → `start()` → `sim-canvas` `.then` 순서로 부팅하고 시간 위상을 등록한다. */
const bootThenBind = async (speed: number | null) => {
  const core = new SimulationCore(makeCanvas());
  core.command({ type: 'jumpToJulianDate', julianDate: T });
  if (speed !== null) core.command({ type: 'setTimeScale', scale: speed });
  await core.start();
  const timePhase = vi.fn<(jd: number) => void>();
  core.bindTimePhase(timePhase);
  return { core, timePhase };
};

describe('#1308 시간 위상 등록 — 등록 시점 현재 시각 1회 동기', () => {
  it('일시정지 부팅 (`?t=T&speed=0`) — 등록 즉시 T 로 1회 호출, 이후 프레임에선 추가 호출 0', async () => {
    const { core, timePhase } = await bootThenBind(0);

    // 결함 판본 (단순 구독) 은 여기서 0 회 — 장면이 J2000 에 머문다.
    expect(timePhase).toHaveBeenCalledTimes(1);
    expect(timePhase).toHaveBeenLastCalledWith(T);

    frame();
    frame();
    frame();
    expect(timePhase).toHaveBeenCalledTimes(1);

    core.dispose();
  });

  it('pause 명령 부팅도 동일 — `!running` 분기', async () => {
    const core = new SimulationCore(makeCanvas());
    core.command({ type: 'jumpToJulianDate', julianDate: T });
    core.command({ type: 'pause' });
    await core.start();
    const timePhase = vi.fn<(jd: number) => void>();
    core.bindTimePhase(timePhase);
    frame();
    frame();

    expect(timePhase.mock.calls).toEqual([[T]]);

    core.dispose();
  });

  it('재생 부팅 — 첫 호출은 T, 이후 tick 마다 전진한 JD 로 추종', async () => {
    const { core, timePhase } = await bootThenBind(null);
    expect(timePhase.mock.calls).toEqual([[T]]);

    frame(); // 첫 프레임은 dt=0 → timeChanged 없음
    frame(1_000);
    expect(timePhase).toHaveBeenCalledTimes(2);
    const last = timePhase.mock.calls.at(-1)?.[0] ?? Number.NaN;
    expect(last).toBeGreaterThan(T);

    core.dispose();
  });

  it('등록 후 시간 점프 (스크러버 · 점프 경로) — 새 JD 로 추종', async () => {
    const { core, timePhase } = await bootThenBind(0);
    core.command({ type: 'jumpToJulianDate', julianDate: T + 100 });
    expect(timePhase.mock.calls).toEqual([[T], [T + 100]]);

    core.dispose();
  });

  it('dispose 이후 등록은 no-op — 호출 0', async () => {
    const core = new SimulationCore(makeCanvas());
    await core.start();
    core.dispose();
    const timePhase = vi.fn<(jd: number) => void>();
    core.bindTimePhase(timePhase);
    expect(timePhase).not.toHaveBeenCalled();
  });
});
