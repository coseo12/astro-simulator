/**
 * 시간 역행 대칭성 테스트 (#88).
 *
 * Velocity-Verlet은 심플렉틱·시간 대칭(symplectic time-reversible) 적분기.
 *   x(t), v(t) → step(+dt) → x(t+dt), v(t+dt) → step(−dt) → x(t), v(t)
 * 이 성질은 **고정 dt**에서만 성립 — 가변 dt는 대칭성 파괴.
 *
 * 태양계 9체(Sun + 8 행성 + Moon) 기준으로 전진 +T, 역행 −T 후 초기 상태
 * 복원 오차를 위치/속도 양쪽에서 측정. 부동소수점 rounding 외에는 0이 나와야 한다.
 */
import { describe, expect, it } from 'vitest';
import { NBodyEngine, buildInitialState } from './index.js';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';

const DAY = 86_400;

function maxRelativeError(
  initial: Float64Array,
  recovered: Float64Array,
  referenceScale: number,
): number {
  let maxErr = 0;
  for (let i = 0; i < initial.length; i += 1) {
    const err = Math.abs(recovered[i]! - initial[i]!) / referenceScale;
    if (err > maxErr) maxErr = err;
  }
  return maxErr;
}

describe('Verlet 시간 역행 대칭성 — 태양계 9체', () => {
  // P8 #244: 포보스/데이모스 추가로 체 수가 11 로 증가 시 1년 적분 오차 누적이 1e-9 임계
  // 초과 (포보스 주기 7.65h × dt=10min sub-step → 1144 주기/년 × 46 sub-step/주기 = 5e4+
  // step 누적). 본 테스트의 **원 의도는 9체 대칭성 검증** 이므로 화성 위성은 명시적 제외.
  // 위성 전체 N-body 검증은 P8 PR-2 의 Rust `measure_moon_orbital_period` 에서 수행.
  // P9 #254: Galilean 4체 (io/europa/ganymede/callisto) 도 동일 이유로 제외. Io 주기 1.77d
  // × dt=10min → 253 sub-step/주기 × 206 주기/년 = 5e4 step 누적으로 오차 증폭.
  // 본 테스트 원 의도(9체 대칭성)는 유지. Galilean N-body 정합성은 P9 PR-2 의 Rust
  // `measure_galilean_period` + `measure_laplace_resonance` 로 검증.
  // R7 #641: titan 도 동일 이유로 제외 (주기 15.95d × dt=10min → ~1.4e3 sub-step/주기 ×
  // 23 주기/년 누적 — galilean 과 동일 오차 증폭 메커니즘). 본 테스트 원 의도(9체 대칭성) 유지.
  const EXCLUDED_SATELLITES = new Set([
    'phobos', // P8
    'deimos', // P8
    'io', // P9
    'europa', // P9
    'ganymede', // P9
    'callisto', // P9
    'titan', // R7 #641
  ]);
  const fullSystem = getSolarSystem();
  const system = {
    ...fullSystem,
    bodies: fullSystem.bodies.filter((b) => !EXCLUDED_SATELLITES.has(b.id)),
  };
  const initial = buildInitialState(system, system.epoch);
  const AU = 1.495_978_707e11;

  it('±10일 (dt=1h sub-step) 상대 오차 < 1e-9', () => {
    const engine = new NBodyEngine(initial, { maxSubstepSeconds: 3600 });
    const T = 10 * DAY;
    engine.advance(+T);
    engine.advance(-T);
    const pos = engine.positions();
    const vel = engine.velocities();
    engine.dispose();

    // 위치 스케일: 해왕성 궤도(30 AU) 기준으로 상대 오차
    const posErr = maxRelativeError(initial.positions, pos, 30 * AU);
    // 속도 스케일: 수성 최대 속도(~60 km/s) 기준
    const velErr = maxRelativeError(initial.velocities, vel, 60_000);
    expect(posErr, `pos relErr ${posErr.toExponential(3)}`).toBeLessThan(1e-9);
    expect(velErr, `vel relErr ${velErr.toExponential(3)}`).toBeLessThan(1e-9);
  });

  it('±1년 (dt=10min sub-step) 상대 오차 < 1e-9', () => {
    const engine = new NBodyEngine(initial, { maxSubstepSeconds: 600 });
    const T = 365.25 * DAY;
    engine.advance(+T);
    engine.advance(-T);
    const pos = engine.positions();
    const vel = engine.velocities();
    engine.dispose();

    const posErr = maxRelativeError(initial.positions, pos, 30 * AU);
    const velErr = maxRelativeError(initial.velocities, vel, 60_000);
    expect(posErr, `pos relErr ${posErr.toExponential(3)}`).toBeLessThan(1e-9);
    expect(velErr, `vel relErr ${velErr.toExponential(3)}`).toBeLessThan(1e-9);
  });

  it('분할 왕복(작은 step 여러 번)도 대칭성 유지', () => {
    // +dt, +dt, +dt → −dt, −dt, −dt 식으로 분할해도 동일하게 복원되어야 함.
    const engine = new NBodyEngine(initial, { maxSubstepSeconds: 3600 });
    for (let i = 0; i < 5; i += 1) engine.advance(+2 * DAY);
    for (let i = 0; i < 5; i += 1) engine.advance(-2 * DAY);
    const pos = engine.positions();
    engine.dispose();
    const posErr = maxRelativeError(initial.positions, pos, 30 * AU);
    expect(posErr, `pos relErr ${posErr.toExponential(3)}`).toBeLessThan(1e-9);
  });
});
