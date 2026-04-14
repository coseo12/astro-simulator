import { AU, GRAVITATIONAL_CONSTANT, J2000_JD, SOLAR_MASS } from '@astro-simulator/shared';
import { describe, expect, it } from 'vitest';
import { length } from '../coords/vec3.js';
import { positionAt, orbitalPeriod } from '../physics/kepler.js';
import { getSolarSystem } from './solar-system-loader.js';

const MU_SUN = GRAVITATIONAL_CONSTANT * SOLAR_MASS;

/**
 * E1 (#30) JPL Horizons 대비 위치 오차 검증.
 *
 * 참조 데이터: IAU/JPL 표준 궤도 요소 + 천문학 레퍼런스 (Meeus, Seidelmann).
 * 1% 기준은 Standish 1992 mean elements 해석해의 J2000 근방 수십 년 범위 정확도.
 *
 * 완전한 DE440 비교는 외부 SPICE 툴킷 의존이므로 P1 범위 외.
 * 여기서는 천문학 상식에 부합하는지를 광역 검증한다.
 */
describe('JPL Horizons 대비 궤도 정확도 검증 (E1)', () => {
  const system = getSolarSystem();
  const byId = new Map(system.bodies.map((b) => [b.id, b]));

  describe('행성 궤도 요소 — 공칭값 ±1% (Standish 1992 기반)', () => {
    // 표준 천문학 레퍼런스 값 (Seidelmann "Explanatory Supplement", Meeus Table 32.1)
    const REFERENCE = [
      { id: 'mercury', a_AU: 0.38709893, e: 0.20563069, iDeg: 7.00487 },
      { id: 'venus', a_AU: 0.72333199, e: 0.00677323, iDeg: 3.39471 },
      { id: 'earth', a_AU: 1.00000011, e: 0.01671022, iDeg: 0.00005 },
      { id: 'mars', a_AU: 1.52366231, e: 0.09341233, iDeg: 1.85061 },
      { id: 'jupiter', a_AU: 5.20336301, e: 0.04839266, iDeg: 1.3053 },
      { id: 'saturn', a_AU: 9.53707032, e: 0.0541506, iDeg: 2.48446 },
      { id: 'uranus', a_AU: 19.19126393, e: 0.04716771, iDeg: 0.76986 },
      { id: 'neptune', a_AU: 30.06896348, e: 0.00858587, iDeg: 1.76917 },
    ];

    for (const ref of REFERENCE) {
      it(`${ref.id} 장반경 a 오차 ≤1%`, () => {
        const body = byId.get(ref.id);
        const a_AU = (body?.orbit?.semiMajorAxis ?? 0) / AU;
        const err = Math.abs(a_AU - ref.a_AU) / ref.a_AU;
        expect(err).toBeLessThan(0.01);
      });
      it(`${ref.id} 이심률 e 오차 ≤5% (극소값 영향)`, () => {
        const body = byId.get(ref.id);
        const e = body?.orbit?.eccentricity ?? 0;
        const err = Math.abs(e - ref.e) / Math.max(ref.e, 1e-3);
        expect(err).toBeLessThan(0.05);
      });
    }
  });

  describe('공전주기 공칭값 대비 ±1%', () => {
    // 표준 공전주기 (일 단위) — Seidelmann Explanatory Supplement Table 8.1
    const PERIOD_DAYS: Record<string, number> = {
      mercury: 87.969,
      venus: 224.701,
      earth: 365.256,
      mars: 686.98,
      jupiter: 4_332.59,
      saturn: 10_759.22,
      uranus: 30_685.4,
      neptune: 60_189,
    };

    for (const [id, expectedDays] of Object.entries(PERIOD_DAYS)) {
      it(`${id} 공전주기 ≈ ${expectedDays}일`, () => {
        const body = byId.get(id);
        if (!body?.orbit) throw new Error(`${id} orbit missing`);
        const periodDays = orbitalPeriod(body.orbit.semiMajorAxis, MU_SUN) / 86_400;
        const err = Math.abs(periodDays - expectedDays) / expectedDays;
        expect(err).toBeLessThan(0.01);
      });
    }
  });

  describe('거리 경계 (근일점/원일점)', () => {
    // Meeus Astronomical Algorithms Table 32.C
    const DISTANCE_BOUNDS_AU: Record<string, { peri: number; apo: number }> = {
      mercury: { peri: 0.3075, apo: 0.4667 },
      venus: { peri: 0.7184, apo: 0.7282 },
      earth: { peri: 0.9833, apo: 1.0167 },
      mars: { peri: 1.381, apo: 1.666 },
      jupiter: { peri: 4.95, apo: 5.458 },
      neptune: { peri: 29.81, apo: 30.33 },
    };

    for (const [id, bounds] of Object.entries(DISTANCE_BOUNDS_AU)) {
      it(`${id} 근일점/원일점 공칭 범위 부합`, () => {
        const body = byId.get(id);
        if (!body?.orbit) throw new Error(`${id} orbit missing`);
        const a = body.orbit.semiMajorAxis / AU;
        const e = body.orbit.eccentricity;
        const peri = a * (1 - e);
        const apo = a * (1 + e);
        expect(peri).toBeGreaterThan(bounds.peri * 0.99);
        expect(peri).toBeLessThan(bounds.peri * 1.01);
        expect(apo).toBeGreaterThan(bounds.apo * 0.99);
        expect(apo).toBeLessThan(bounds.apo * 1.01);
      });
    }
  });

  describe('시간 경과 후 위치 안정성 (장기 시뮬 검증)', () => {
    it('지구 100년 후 거리 [0.98, 1.02] AU 유지', () => {
      const earth = byId.get('earth');
      if (!earth?.orbit) throw new Error('earth');
      const pos = positionAt(earth.orbit, J2000_JD + 100 * 365.25, MU_SUN);
      const r = length(pos) / AU;
      expect(r).toBeGreaterThan(0.98);
      expect(r).toBeLessThan(1.02);
    });

    it('해왕성 100년 후 거리 [29.5, 30.5] AU 유지', () => {
      const neptune = byId.get('neptune');
      if (!neptune?.orbit) throw new Error('neptune');
      const pos = positionAt(neptune.orbit, J2000_JD + 100 * 365.25, MU_SUN);
      const r = length(pos) / AU;
      expect(r).toBeGreaterThan(29.5);
      expect(r).toBeLessThan(30.5);
    });

    it('모든 행성 1000년 후 궤도 붕괴 없음 (Kepler는 해석해이므로 자명하나 regression 보호)', () => {
      for (const body of system.bodies) {
        if (!body.orbit) continue;
        const pos = positionAt(body.orbit, J2000_JD + 1000 * 365.25, MU_SUN);
        const r = length(pos);
        expect(Number.isFinite(r)).toBe(true);
        expect(r).toBeGreaterThan(0);
      }
    });
  });

  describe('왜소행성 궤도 요소 공칭값 (±1% / ±5%) — JPL/IAU', () => {
    // 출처: JPL SBDB / Minor Planet Center / DE440
    const DWARF_REF = [
      { id: 'ceres', a_AU: 2.7675, e: 0.079, iDeg: 10.59 },
      { id: 'pluto', a_AU: 39.482, e: 0.2488, iDeg: 17.14 },
      { id: 'haumea', a_AU: 43.13, e: 0.1913, iDeg: 28.21 },
      { id: 'makemake', a_AU: 45.79, e: 0.159, iDeg: 29.0 },
      { id: 'eris', a_AU: 67.86, e: 0.436, iDeg: 44.04 },
    ];
    for (const ref of DWARF_REF) {
      it(`${ref.id} a 오차 ≤1%, e·i 오차 ≤5%`, () => {
        const body = byId.get(ref.id);
        const a_AU = (body?.orbit?.semiMajorAxis ?? 0) / AU;
        const e = body?.orbit?.eccentricity ?? 0;
        const iDeg = ((body?.orbit?.inclination ?? 0) * 180) / Math.PI;
        expect(Math.abs(a_AU - ref.a_AU) / ref.a_AU).toBeLessThan(0.01);
        expect(Math.abs(e - ref.e) / ref.e).toBeLessThan(0.05);
        expect(Math.abs(iDeg - ref.iDeg) / ref.iDeg).toBeLessThan(0.05);
      });
    }
  });

  describe('지구-달 시스템 (부모 중심 좌표)', () => {
    it('달-지구 거리 [356k, 407k] km', () => {
      const moon = byId.get('moon');
      if (!moon?.orbit) throw new Error('moon');
      const muEarth = GRAVITATIONAL_CONSTANT * 5.9722e24;
      // 달은 지구 상대 좌표
      const pos = positionAt(moon.orbit, J2000_JD, muEarth);
      const r = length(pos) / 1000; // km
      expect(r).toBeGreaterThan(356_000);
      expect(r).toBeLessThan(407_000);
    });

    it('달 공전주기 ≈ 27.32일 (항성월)', () => {
      const moon = byId.get('moon');
      if (!moon?.orbit) throw new Error('moon');
      const muEarth = GRAVITATIONAL_CONSTANT * 5.9722e24;
      const periodDays = orbitalPeriod(moon.orbit.semiMajorAxis, muEarth) / 86_400;
      const err = Math.abs(periodDays - 27.32) / 27.32;
      expect(err).toBeLessThan(0.01);
    });
  });
});
