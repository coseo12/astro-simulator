/**
 * #1265 — 표시 토글 command 라우팅 회귀 가드 (별 배경 · 지구 구름 · 야간 불빛).
 *
 * `simulation-core-orbit-lines.test.ts` (#688) 의 5 케이스를 명령 3종 각각에 그대로 적용한다
 * (ADR `docs/decisions/20260927-1265-runtime-display-toggles.md` §결정 1 — 궤도선 선례 동형).
 * scene setter 의 실제 동작은 `scene/solar-system-scene-display-toggles.test.ts` 가 별도로 가드한다.
 *
 * 추가 1 케이스 — 명령 간 **교차 라우팅 0**: 한 명령이 다른 효과의 핸들러를 부르면 (switch case 복붙
 * 실수) 두 효과가 함께 움직인다. 효과별 명령을 둔 이유 (exhaustive 검사) 가 라우팅 오배선까지는 못
 * 잡으므로 여기서 잡는다.
 */
import { describe, expect, it, vi } from 'vitest';
import { SimulationCore } from './simulation-core.js';

// SimulationCore 생성자는 canvas 참조만 저장 — start() 호출 안 하면 Babylon 초기화 X.
const makeCanvas = () => ({}) as unknown as HTMLCanvasElement;

type ToggleType =
  | 'setStarfieldVisible'
  | 'setCloudsVisible'
  | 'setNightLightsVisible'
  | 'setAsteroidBeltVisible'
  | 'setKuiperBeltVisible';
type Register = (core: SimulationCore, handler: (visible: boolean) => void) => void;

const CASES: ReadonlyArray<{ type: ToggleType; register: Register }> = [
  { type: 'setStarfieldVisible', register: (c, h) => c.setStarfieldVisibleHandler(h) },
  { type: 'setCloudsVisible', register: (c, h) => c.setCloudsVisibleHandler(h) },
  { type: 'setNightLightsVisible', register: (c, h) => c.setNightLightsVisibleHandler(h) },
  // #1319 PR3 — 소행성대 · 카이퍼 띠 토글 (같은 5 케이스).
  { type: 'setAsteroidBeltVisible', register: (c, h) => c.setAsteroidBeltVisibleHandler(h) },
  { type: 'setKuiperBeltVisible', register: (c, h) => c.setKuiperBeltVisibleHandler(h) },
];

describe.each(CASES)('SimulationCore $type command 라우팅 (#1265)', ({ type, register }) => {
  it('visible=true 명령은 등록된 핸들러를 true 로 1회 위임', () => {
    const core = new SimulationCore(makeCanvas());
    const handler = vi.fn();
    register(core, handler);

    core.command({ type, visible: true });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(true);
    core.dispose();
  });

  it('visible=false 명령은 핸들러를 false 로 위임', () => {
    const core = new SimulationCore(makeCanvas());
    const handler = vi.fn();
    register(core, handler);

    core.command({ type, visible: false });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(false);
    core.dispose();
  });

  it('off→on→off 연쇄 시 핸들러 3회 각 인자 순서 보존', () => {
    const core = new SimulationCore(makeCanvas());
    const handler = vi.fn();
    register(core, handler);

    core.command({ type, visible: false });
    core.command({ type, visible: true });
    core.command({ type, visible: false });

    expect(handler.mock.calls.map((c) => c[0])).toEqual([false, true, false]);
    core.dispose();
  });

  it('핸들러 미등록 시 명령은 no-op (scene 초기화 전 순서 무관)', () => {
    const core = new SimulationCore(makeCanvas());
    expect(() => core.command({ type, visible: false })).not.toThrow();
    core.dispose();
  });

  it('dispose 뒤 명령은 핸들러를 부르지 않는다 (command 라우터 공통 가드)', () => {
    const core = new SimulationCore(makeCanvas());
    const handler = vi.fn();
    register(core, handler);
    core.dispose();

    core.command({ type, visible: true });

    expect(handler).not.toHaveBeenCalled();
  });
});

describe('SimulationCore 표시 토글 — 교차 라우팅 0 (#1265)', () => {
  it('각 명령은 자기 효과의 핸들러만 부른다 (궤도선 포함 6종 — #1319 PR3 띠 2종)', () => {
    const core = new SimulationCore(makeCanvas());
    const handlers = {
      setOrbitLinesVisible: vi.fn(),
      setStarfieldVisible: vi.fn(),
      setCloudsVisible: vi.fn(),
      setNightLightsVisible: vi.fn(),
      setAsteroidBeltVisible: vi.fn(),
      setKuiperBeltVisible: vi.fn(),
    };
    core.setOrbitLinesVisibleHandler(handlers.setOrbitLinesVisible);
    core.setStarfieldVisibleHandler(handlers.setStarfieldVisible);
    core.setCloudsVisibleHandler(handlers.setCloudsVisible);
    core.setNightLightsVisibleHandler(handlers.setNightLightsVisible);
    core.setAsteroidBeltVisibleHandler(handlers.setAsteroidBeltVisible);
    core.setKuiperBeltVisibleHandler(handlers.setKuiperBeltVisible);

    for (const type of Object.keys(handlers) as (keyof typeof handlers)[]) {
      for (const h of Object.values(handlers)) h.mockClear();
      core.command({ type, visible: false });
      for (const [name, h] of Object.entries(handlers))
        expect(h, `${type} → ${name}`).toHaveBeenCalledTimes(name === type ? 1 : 0);
    }
    core.dispose();
  });
});
