import {
  AU,
  GRAVITATIONAL_CONSTANT,
  J2000_JD,
  JULIAN_YEAR_SECONDS,
  SOLAR_MASS,
} from '@astro-simulator/shared';
import { describe, expect, it } from 'vitest';
import { length } from '../coords/vec3.js';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import {
  meanAnomalyAt,
  orbitalPeriod,
  positionAt,
  solveKeplerEquation,
  trueAnomalyFromEccentric,
} from './kepler.js';

const MU_SUN = GRAVITATIONAL_CONSTANT * SOLAR_MASS;

describe('solveKeplerEquation', () => {
  it('e=0 (원형) 은 E = M', () => {
    expect(solveKeplerEquation(0.5, 0)).toBeCloseTo(0.5, 10);
    expect(solveKeplerEquation(-1, 0)).toBeCloseTo(-1, 10);
  });

  it('M=0 이면 E=0', () => {
    expect(solveKeplerEquation(0, 0.5)).toBeCloseTo(0, 10);
  });

  it('Kepler 방정식 항등식 만족 — M = E - e·sin E', () => {
    const cases = [
      { M: 1.2, e: 0.1 },
      { M: -0.8, e: 0.3 },
      { M: 2.5, e: 0.5 },
      { M: 3.0, e: 0.8 },
      { M: 0.1, e: 0.95 },
    ];
    for (const c of cases) {
      const E = solveKeplerEquation(c.M, c.e);
      const reconstructed = E - c.e * Math.sin(E);
      // M은 [-π, π]로 정규화되어 비교
      let Mnorm = c.M % (2 * Math.PI);
      if (Mnorm > Math.PI) Mnorm -= 2 * Math.PI;
      if (Mnorm < -Math.PI) Mnorm += 2 * Math.PI;
      expect(reconstructed).toBeCloseTo(Mnorm, 8);
    }
  });

  it('e ≥ 1 은 에러', () => {
    expect(() => solveKeplerEquation(1, 1)).toThrow();
    expect(() => solveKeplerEquation(1, 1.5)).toThrow();
    expect(() => solveKeplerEquation(1, -0.1)).toThrow();
  });
});

describe('trueAnomalyFromEccentric', () => {
  it('E=0 이면 ν=0', () => {
    expect(trueAnomalyFromEccentric(0, 0.1)).toBeCloseTo(0, 10);
  });

  it('e=0 이면 ν=E', () => {
    expect(trueAnomalyFromEccentric(0.7, 0)).toBeCloseTo(0.7, 10);
  });
});

describe('orbitalPeriod', () => {
  it('지구 공전주기 ≈ 365.25일 (±0.1% 이내)', () => {
    const periodSec = orbitalPeriod(AU, MU_SUN);
    const periodDays = periodSec / 86400;
    expect(periodDays).toBeGreaterThan(365.25 * 0.999);
    expect(periodDays).toBeLessThan(365.25 * 1.001);
  });

  it('수성 공전주기 ≈ 87.97일', () => {
    const periodSec = orbitalPeriod(0.38709927 * AU, MU_SUN);
    const periodDays = periodSec / 86400;
    expect(periodDays).toBeCloseTo(87.97, 0);
  });
});

describe('positionAt — 태양계 실제 궤도 요소 검증', () => {
  const system = getSolarSystem();
  const planets = system.bodies.filter((b) => b.orbit && b.parentId === 'sun');

  it('J2000.0 epoch에서 지구 거리 ∈ [근일점, 원일점] (~0.98~1.02 AU)', () => {
    // 지구 e=0.0167 → 거리는 AU × (1 ± e) 범위
    const earth = planets.find((b) => b.id === 'earth');
    if (!earth?.orbit) throw new Error('earth not found');
    const pos = positionAt(earth.orbit, J2000_JD, MU_SUN);
    const r = length(pos);
    expect(r).toBeGreaterThan(AU * 0.98);
    expect(r).toBeLessThan(AU * 1.02);
  });

  it('모든 행성 J2000.0 거리가 근일점~원일점 범위 내', () => {
    for (const p of planets) {
      if (!p.orbit) continue;
      const { semiMajorAxis: a, eccentricity: e } = p.orbit;
      const periapsis = a * (1 - e);
      const apoapsis = a * (1 + e);
      const pos = positionAt(p.orbit, J2000_JD, MU_SUN);
      const r = length(pos);
      expect(r).toBeGreaterThanOrEqual(periapsis * 0.999);
      expect(r).toBeLessThanOrEqual(apoapsis * 1.001);
    }
  });

  it('지구 1년 후 위치는 초기 위치 근처로 복귀 (±1% 이내, Kepler 주기성)', () => {
    const earth = planets.find((b) => b.id === 'earth');
    if (!earth?.orbit) throw new Error('earth not found');
    const p0 = positionAt(earth.orbit, J2000_JD, MU_SUN);
    const p1 = positionAt(earth.orbit, J2000_JD + 365.25636, MU_SUN); // 항성년
    const diff = Math.hypot(p0[0] - p1[0], p0[1] - p1[1], p0[2] - p1[2]);
    const scale = length(p0);
    expect(diff / scale).toBeLessThan(0.01);
  });

  it('수성 88일 주기', () => {
    const mercury = planets.find((b) => b.id === 'mercury');
    if (!mercury?.orbit) throw new Error('mercury not found');
    const period = orbitalPeriod(mercury.orbit.semiMajorAxis, MU_SUN) / 86400;
    expect(period).toBeCloseTo(87.97, 0);
  });

  it('meanAnomalyAt — 1년 후 약 2π 증가 (지구)', () => {
    const earth = planets.find((b) => b.id === 'earth');
    if (!earth?.orbit) throw new Error('earth not found');
    const M0 = meanAnomalyAt(earth.orbit, J2000_JD, MU_SUN);
    const M1 = meanAnomalyAt(earth.orbit, J2000_JD + 365.25636, MU_SUN);
    const delta = M1 - M0;
    expect(delta).toBeCloseTo(2 * Math.PI, 2);
    // JULIAN_YEAR_SECONDS 사용 smoke check
    expect(JULIAN_YEAR_SECONDS).toBeGreaterThan(0);
  });
});
