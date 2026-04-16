/**
 * P4-D #166 — SimulationCore GPU timer API 가드.
 *
 * 실제 Babylon engine 필요 경로(활성 측정)는 브라우저 bench에서 검증한다.
 * 단위 테스트는 public API의 방어 동작만 확인:
 *   - start() 이전: enableGpuTimer → false
 *   - disposed 이후: enableGpuTimer → false
 *   - enableGpuTimer 미호출 시: readGpuFrameTimeMs → null
 */
import { describe, expect, it } from 'vitest';
import { SimulationCore } from './simulation-core.js';

// core는 node 환경에서 실행된다. SimulationCore 생성자는 canvas 참조만 저장하므로
// 최소 interface만 만족하는 mock으로 충분하다 (start() 호출 안 함).
const makeCanvas = () => ({}) as unknown as HTMLCanvasElement;

describe('SimulationCore GPU timer (P4-D)', () => {
  it('start() 이전에는 enableGpuTimer가 false를 반환한다', () => {
    const core = new SimulationCore(makeCanvas());
    expect(core.enableGpuTimer()).toBe(false);
    expect(core.readGpuFrameTimeMs()).toBeNull();
    core.dispose();
  });

  it('dispose 이후에는 enableGpuTimer가 false를 반환한다', () => {
    const core = new SimulationCore(makeCanvas());
    core.dispose();
    expect(core.enableGpuTimer()).toBe(false);
    expect(core.readGpuFrameTimeMs()).toBeNull();
  });

  it('instrumentation 미활성 시 readGpuFrameTimeMs는 null', () => {
    const core = new SimulationCore(makeCanvas());
    expect(core.readGpuFrameTimeMs()).toBeNull();
    core.dispose();
  });
});
