/**
 * 장기 드리프트 검증 (#115, P2-D).
 *
 * 전체 태양계 9체 Newton N-body를 100년 적분 후 에너지 보존 드리프트를 측정.
 * 1000년 직접 측정은 WASM 호출 오버헤드로 테스트 시간이 길어지므로, 100년 결과를
 * 기록하고 Rust cargo test(1000년 Sun-Earth #85, 2.4e-9)로 장기 경향을 확인한다.
 *
 * 심플렉틱(Verlet) 특성: 에너지 오차는 bounded oscillation — 선형 드리프트 없음.
 */
import { describe, expect, it } from 'vitest';
import { NBodyEngine, buildInitialState } from './index.js';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';

const DAY = 86_400;
const YEAR = 365.25 * DAY;

// 100년 9체 적분은 단독 실행 시 ~1.3s 이나 병렬 테스트/CI 부하 시 5s 초과 가능 (#199).
// 안정성 확보를 위해 30s 타임아웃을 지정한다.
const LONG_INTEGRATION_TIMEOUT_MS = 30_000;

describe('장기 드리프트 — 태양계 9체 Newton', () => {
  it(
    '100년 에너지 드리프트 < 0.5% (dt=1h 서브스텝)',
    () => {
      const system = getSolarSystem();
      const state = buildInitialState(system, system.epoch);
      const engine = new NBodyEngine(state, { maxSubstepSeconds: 3600 });
      const e0 = engine.totalEnergy();
      engine.advance(100 * YEAR);
      const e1 = engine.totalEnergy();
      const drift = Math.abs((e1 - e0) / e0);
      // 실측치 로그 (CI에서 확인)
      console.log(`100년 에너지 드리프트: ${drift.toExponential(3)}`);
      expect(drift).toBeLessThan(5e-3);
      engine.dispose();
    },
    LONG_INTEGRATION_TIMEOUT_MS,
  );

  it(
    '100년 후 위치가 유한값 — 시스템 이탈 없음',
    () => {
      const system = getSolarSystem();
      const state = buildInitialState(system, system.epoch);
      const engine = new NBodyEngine(state, { maxSubstepSeconds: 3600 });
      engine.advance(100 * YEAR);
      const pos = engine.positions();
      for (let i = 0; i < state.ids.length; i += 1) {
        const r = Math.hypot(pos[3 * i]!, pos[3 * i + 1]!, pos[3 * i + 2]!);
        expect(Number.isFinite(r)).toBe(true);
        // Eris 원일점(~98 AU) 수준을 고려한 상한 — 카오스 이탈 방지 검증
        expect(r / 1.496e11).toBeLessThan(150);
      }
      engine.dispose();
    },
    LONG_INTEGRATION_TIMEOUT_MS,
  );
});
