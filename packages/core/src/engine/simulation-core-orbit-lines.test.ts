/**
 * #688 — 궤도선 가시성 command 라우팅 회귀 가드.
 *
 * 본 테스트는 `SimulationCore.command` 가 'setOrbitLinesVisible' 호출 시 등록된
 * `setOrbitLinesVisibleHandler` 를 visible 인자 그대로 1회 위임하는지 검증한다.
 * (scene.setOrbitLinesVisible 실 동작 — satellite 일반화 #627 — 은 scene 단위 테스트가 별도 가드.)
 *
 * 단위 테스트 범위 (Babylon mock 비용 회피): `setLodOverride` (P11-B #289) 와 동일한
 * 핸들러 위임 + 미등록 시 no-op 계약만 검증.
 */
import { describe, expect, it, vi } from 'vitest';
import { SimulationCore } from './simulation-core.js';

// SimulationCore 생성자는 canvas 참조만 저장 — start() 호출 안 하면 Babylon 초기화 X.
const makeCanvas = () => ({}) as unknown as HTMLCanvasElement;

describe('SimulationCore 궤도선 토글 command 라우팅 (#688)', () => {
  it('setOrbitLinesVisible(true) 명령은 등록된 핸들러를 visible=true 로 1회 위임', () => {
    const core = new SimulationCore(makeCanvas());
    const handler = vi.fn();
    core.setOrbitLinesVisibleHandler(handler);

    core.command({ type: 'setOrbitLinesVisible', visible: true });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(true);

    core.dispose();
  });

  it('setOrbitLinesVisible(false) 명령은 핸들러를 visible=false 로 위임', () => {
    const core = new SimulationCore(makeCanvas());
    const handler = vi.fn();
    core.setOrbitLinesVisibleHandler(handler);

    core.command({ type: 'setOrbitLinesVisible', visible: false });

    expect(handler).toHaveBeenCalledTimes(1);
    expect(handler).toHaveBeenCalledWith(false);

    core.dispose();
  });

  it('on→off→on 토글 연쇄 시 핸들러 3회 각 인자 순서 보존', () => {
    const core = new SimulationCore(makeCanvas());
    const handler = vi.fn();
    core.setOrbitLinesVisibleHandler(handler);

    core.command({ type: 'setOrbitLinesVisible', visible: false });
    core.command({ type: 'setOrbitLinesVisible', visible: true });
    core.command({ type: 'setOrbitLinesVisible', visible: false });

    expect(handler).toHaveBeenCalledTimes(3);
    expect(handler).toHaveBeenNthCalledWith(1, false);
    expect(handler).toHaveBeenNthCalledWith(2, true);
    expect(handler).toHaveBeenNthCalledWith(3, false);

    core.dispose();
  });

  it('핸들러 미등록 시 setOrbitLinesVisible 명령은 no-op (scene 초기화 전 순서 무관)', () => {
    const core = new SimulationCore(makeCanvas());

    expect(() => core.command({ type: 'setOrbitLinesVisible', visible: false })).not.toThrow();

    core.dispose();
  });

  it('public API — setOrbitLinesVisibleHandler 존재 (회귀 시 즉시 실패)', () => {
    const core = new SimulationCore(makeCanvas());
    expect(typeof core.setOrbitLinesVisibleHandler).toBe('function');
    core.dispose();
  });
});
