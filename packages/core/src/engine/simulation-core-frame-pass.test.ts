/**
 * #1205 — 프레임 위상 (`setFramePassHandler`) 렌더 루프 계약 회귀 가드.
 *
 * ADR `docs/decisions/20260907-1205-frame-phase-vs-time-phase.md` §결정 1 / §결정 3.
 *
 * 본 테스트가 방어하는 계약은 셋이다.
 *  1. **프레임당 정확히 1회** — 2 회면 재생 경로에서 LOD 패스가 2×/프레임이 된다.
 *  2. **일시정지에서도 돈다** — `TimeController.tick` 이 `false` 를 반환하는 구간
 *     (`!running` 또는 `scale === 0`) 에서도 호출돼야 한다. 이것이 #1205 결함의 본체다.
 *  3. **배치 순서** — `timeChanged` emit **직후**, `scene.render()` **직전**.
 *
 * 변이 검출 [실측] — 8 테스트 중 FAIL 수. 매 변이마다 원본 PASS → 변이 FAIL → 복구 PASS 3단 확인.
 *  - 변이 (a) 「훅 호출 1줄 제거」(`void` 읽기만 남김)   → **6/8 FAIL**
 *  - 변이 (b) 「훅을 `tick()` 조건 안으로」(원 결함 형태) → **6/8 FAIL**
 *  - 변이 (c) 「`scene.render()` 뒤로 이동」             → **1/8 FAIL** — `배치 순서` **단독 검출**
 *  - 변이 (d) 「프레임 위상 호출 2 줄로 복제」(2×/프레임) → **6/8 FAIL**
 *
 * ⚠️ (b) 가 「일시정지 2 건만 FAIL」일 것이라는 사전 예측은 **반증됐다** — 렌더 루프의 첫 호출은
 * `dt = 0` 이라 재생 중에도 `tick()` 이 `false` 이므로 `배치 순서` 테스트도 함께 걸린다.
 *
 * ⚠️ **변이 (C) 「`updateAt` 안에 `runLodPass` 재도입」은 본 테스트가 잡지 못한다.** 그 호출은
 * `solar-system-scene` 내부이고 `SimulationCore` 경계 밖이다. 본 테스트가 닫는 것은 계약의
 * 「프레임 위상 자신이 프레임당 1회」 절반이고, 「시간 위상이 LOD 패스를 부르지 않는다」 절반은
 * **의식적 기각**이다 — 근거는 위 ADR §비-범위 「2×/프레임 계약의 가드 부재 — 검토 후 기각」.
 *
 * 단위 테스트 범위 (Babylon mock 비용 회피): `engine-factory` 를 스텁으로 대체해 렌더 루프
 * 콜백을 붙잡아 수동 구동한다. `solar-system-scene` 의 `runFramePass` 실동작은
 * `apps/web/scripts/browser-verify-1205-pause-lod.mjs` 가 별도 가드.
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

describe('#1205 프레임 위상 — 렌더 루프 계약', () => {
  it('등록 후 렌더 루프 N 프레임 → 핸들러 정확히 N 회 (프레임당 1회, 중복 발화 0)', async () => {
    const core = new SimulationCore(makeCanvas());
    await core.start();
    const framePass = vi.fn();
    core.setFramePassHandler(framePass);

    frame();
    expect(framePass).toHaveBeenCalledTimes(1);
    frame();
    frame();
    expect(framePass).toHaveBeenCalledTimes(3);

    core.dispose();
  });

  it('일시정지(pause) 에서 timeChanged 는 0 회인데 프레임 위상은 매 프레임 호출 — #1205 본체', async () => {
    const core = new SimulationCore(makeCanvas());
    await core.start();

    const onTimeChanged = vi.fn();
    core.on('timeChanged', onTimeChanged);
    const framePass = vi.fn();
    core.setFramePassHandler(framePass);

    core.command({ type: 'pause' });
    frame();
    frame();
    frame();

    // 시간 위상은 죽어 있다 (`TimeController.tick` 이 `!running` 에서 false).
    expect(onTimeChanged).not.toHaveBeenCalled();
    // 프레임 위상은 그와 무관하게 돈다. 훅이 `tick()` 조건 안으로 들어가면 여기서 FAIL.
    expect(framePass).toHaveBeenCalledTimes(3);

    core.dispose();
  });

  it('setTimeScale(0) 에서도 동일 — `scale === 0` 분기 (URL `?speed=0` 경로)', async () => {
    const core = new SimulationCore(makeCanvas());
    await core.start();

    const onTimeChanged = vi.fn();
    core.on('timeChanged', onTimeChanged);
    const framePass = vi.fn();
    core.setFramePassHandler(framePass);

    core.command({ type: 'setTimeScale', scale: 0 });
    frame();
    frame();

    expect(onTimeChanged).not.toHaveBeenCalled();
    expect(framePass).toHaveBeenCalledTimes(2);

    core.dispose();
  });

  it('재생 중 호출 순서 — timeChanged → framePass → scene.render (§결정 3 배치 계약)', async () => {
    const core = new SimulationCore(makeCanvas());
    await core.start();

    const log: string[] = [];
    core.on('timeChanged', () => log.push('timeChanged'));
    core.setFramePassHandler(() => log.push('framePass'));
    h.sceneRender.mockImplementation(() => log.push('render'));

    // 첫 프레임은 dt=0 이라 timeChanged 가 없다 (위 `frame` 주석).
    frame();
    expect(log).toEqual(['framePass', 'render']);

    log.length = 0;
    frame();
    // 프레임 위상이 `scene.render()` 뒤로 밀리거나 emit 앞으로 당겨지면 여기서 FAIL.
    expect(log).toEqual(['timeChanged', 'framePass', 'render']);

    core.dispose();
  });

  it('null 로 해제하면 이후 프레임에서 호출되지 않는다 (수명 계약 — 시그니처의 `| null`)', async () => {
    const core = new SimulationCore(makeCanvas());
    await core.start();
    const framePass = vi.fn();
    core.setFramePassHandler(framePass);

    frame();
    expect(framePass).toHaveBeenCalledTimes(1);

    core.setFramePassHandler(null);
    frame();
    frame();

    expect(framePass).toHaveBeenCalledTimes(1);

    core.dispose();
  });

  it('핸들러 미등록 구간에서도 렌더 루프가 죽지 않는다 (scene.render 는 계속 호출)', async () => {
    const core = new SimulationCore(makeCanvas());
    await core.start();

    // 등록한 적 없음 → `#framePassHandler` 는 초기값 null.
    expect(() => {
      frame();
      frame();
    }).not.toThrow();
    expect(h.sceneRender).toHaveBeenCalledTimes(2);

    // 등록 → 해제 → 계속 구동해도 동일.
    core.setFramePassHandler(vi.fn());
    core.setFramePassHandler(null);
    expect(() => frame()).not.toThrow();
    expect(h.sceneRender).toHaveBeenCalledTimes(3);

    core.dispose();
  });

  it('dispose 이후 렌더 루프 콜백이 불려도 핸들러는 호출되지 않는다', async () => {
    const core = new SimulationCore(makeCanvas());
    await core.start();
    const framePass = vi.fn();
    core.setFramePassHandler(framePass);

    frame();
    expect(framePass).toHaveBeenCalledTimes(1);

    core.dispose();
    // Babylon 이 dispose 와 같은 tick 에 루프를 한 번 더 부르는 경우를 모사.
    frame();

    expect(framePass).toHaveBeenCalledTimes(1);
  });

  it('public API — setFramePassHandler 존재 + null 수용 (시그니처 회귀 시 즉시 실패)', () => {
    const core = new SimulationCore(makeCanvas());
    expect(typeof core.setFramePassHandler).toBe('function');
    // start() 전 / 미등록 상태에서의 해제도 무해해야 한다 (등록 순서 무관).
    expect(() => core.setFramePassHandler(null)).not.toThrow();
    core.dispose();
  });
});
