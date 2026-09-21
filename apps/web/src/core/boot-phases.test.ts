/**
 * #1234 C2-H3 — 부팅 단계 기록기 가드.
 *
 * 계측은 **진단 전용**이라 앱 동작을 바꾸지 않는다. 그래서 여기서 닫는 것은 「값이 맞나」가
 * 아니라 **진단이 거짓말을 하지 않는가** 네 가지다:
 *   (1) 구간 소요 = 직전 mark 와의 차 (누적 경과를 소요로 오독하면 원인 지목이 통째로 뒤집힌다)
 *   (2) 체인이 교차해도 소요는 **자기 체인 안에서** 잰다 (dev StrictMode 이중 마운트)
 *   (3) `window.__bootPhases` 는 **읽는 시점 스냅샷** — 부팅이 멈춘 채로 읽어도 그때까지가 보인다
 *       (이 성질이 본 계측의 존재 이유다. 완료 시 1회 박제였다면 실패 표본에서 비어 있게 된다)
 *   (4) 상한 초과는 **조용히 사라지지 않는다** (`dropped` 로 「기록 없음」과 구분)
 *
 * `performance.now` 는 **고정 시각으로 스텁**한다 — 실시각으로 재면 세 mark 가 전부 같은 ms 로
 * 뭉개져 (1)·(2) 가 깨진 구현에서도 통과한다 (퇴화 수렴).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import {
  __resetBootPhasesForTest,
  markBootPhase,
  nextBootChain,
  readBootPhases,
} from './boot-phases';

/** `performance.now()` 를 대본대로 돌려준다 (호출 순서 = 대본 순서). */
function scriptNow(values: number[]): void {
  const spy = vi.spyOn(performance, 'now');
  for (const v of values) spy.mockReturnValueOnce(v);
}

afterEach(() => {
  vi.restoreAllMocks();
  __resetBootPhasesForTest();
  delete (window as unknown as Record<string, unknown>).__bootPhases;
});

describe('markBootPhase', () => {
  it('구간 소요는 누적 경과가 아니라 직전 mark 와의 차', () => {
    scriptNow([100, 350]);
    markBootPhase('a');
    markBootPhase('b');
    const { phases } = readBootPhases();

    expect(phases).toEqual([
      // 첫 mark 의 delta 는 네비게이션 기준 경과 (= atMs) 와 같다는 계약.
      { name: 'a', chain: 'm0', atMs: 100, deltaMs: 100 },
      // 누적 350 이 아니라 차분 250 이어야 한다.
      { name: 'b', chain: 'm0', atMs: 350, deltaMs: 250 },
    ]);
  });

  it('체인이 교차해도 소요는 자기 체인 안에서 잰다', () => {
    // dev StrictMode 이중 마운트 재현 — 두 초기화가 동시에 진행하며 mark 가 교차한다.
    // 전역 직전 mark 와 빼면 여기서 250 (남의 체인과의 차) 이 나오고, 그 거짓 분포가 그대로
    // 원인 지목에 쓰인다.
    const a = nextBootChain();
    const b = nextBootChain();
    expect(a).not.toBe(b);

    scriptNow([100, 150, 400]);
    markBootPhase('web:effect-start', a);
    markBootPhase('web:effect-start', b);
    markBootPhase('engine:webgl2-ctor', a);

    const { phases } = readBootPhases();
    expect(phases.map((p) => [p.chain, p.name, p.deltaMs])).toEqual([
      [a, 'web:effect-start', 100],
      [b, 'web:effect-start', 150],
      [a, 'engine:webgl2-ctor', 300],
    ]);
  });

  it('window.__bootPhases 는 읽는 시점 스냅샷 (부팅 중간에도 그때까지가 보인다)', () => {
    markBootPhase('web:effect-start');
    const mid = (window as unknown as { __bootPhases: ReturnType<typeof readBootPhases> })
      .__bootPhases;
    expect(mid.phases.map((p) => p.name)).toEqual(['web:effect-start']);

    markBootPhase('scene:body-meshes');
    const later = (window as unknown as { __bootPhases: ReturnType<typeof readBootPhases> })
      .__bootPhases;
    expect(later.phases.map((p) => p.name)).toEqual(['web:effect-start', 'scene:body-meshes']);
    // 앞서 읽은 스냅샷이 뒤늦게 변하면 「그 시점에 무엇이 있었나」를 못 읽는다.
    expect(mid.phases).toHaveLength(1);
  });

  it('상한 초과분은 조용히 사라지지 않고 dropped 로 센다', () => {
    for (let i = 0; i < 200; i += 1) markBootPhase(`p${i}`);
    const { phases, dropped } = readBootPhases();

    expect(phases.length).toBeLessThan(200);
    expect(dropped).toBe(200 - phases.length);
  });

  it('반환 스냅샷을 변형해도 내부 기록은 불변', () => {
    markBootPhase('a');
    const snapshot = readBootPhases();
    snapshot.phases.length = 0;

    expect(readBootPhases().phases.map((p) => p.name)).toEqual(['a']);
  });
});
