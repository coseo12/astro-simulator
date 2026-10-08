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

  describe('혜성 궤도 요소 공칭값 (JPL SBDB 기반 ±2%)', () => {
    // 혜성은 태양풍 비중력 효과로 공전 간 약간 변동 — ±2% 여유.
    const COMET_REF = [
      { id: 'halley', a_AU: 17.834, e: 0.96714, iDeg: 162.26, periodYears: 75.32 },
      { id: 'encke', a_AU: 2.2152, e: 0.848, iDeg: 11.78, periodYears: 3.3 },
      { id: 'swift-tuttle', a_AU: 26.09, e: 0.963, iDeg: 113.45, periodYears: 133.28 },
    ];
    for (const ref of COMET_REF) {
      it(`${ref.id} 장반경 오차 ≤2%`, () => {
        const body = byId.get(ref.id);
        const a_AU = (body?.orbit?.semiMajorAxis ?? 0) / AU;
        expect(Math.abs(a_AU - ref.a_AU) / ref.a_AU).toBeLessThan(0.02);
      });
      it(`${ref.id} 이심률/경사 오차 ≤2%`, () => {
        const body = byId.get(ref.id);
        const e = body?.orbit?.eccentricity ?? 0;
        const iDeg = ((body?.orbit?.inclination ?? 0) * 180) / Math.PI;
        // inclination 부호는 normalize가 [-π, π]로 가져와서 음수일 수 있음 → abs
        expect(Math.abs(e - ref.e) / ref.e).toBeLessThan(0.02);
        expect(Math.abs(Math.abs(iDeg) - ref.iDeg) / ref.iDeg).toBeLessThan(0.02);
      });
      it(`${ref.id} 공전주기 ≈ ${ref.periodYears}년`, () => {
        const body = byId.get(ref.id);
        if (!body?.orbit) throw new Error(ref.id);
        const periodYears = orbitalPeriod(body.orbit.semiMajorAxis, MU_SUN) / 86_400 / 365.25;
        expect(Math.abs(periodYears - ref.periodYears) / ref.periodYears).toBeLessThan(0.02);
      });
    }
  });

  describe('#1318 태양 직속 소천체 J2000 위치 — JPL Horizons 상태벡터 대조', () => {
    // json 은 SBDB 궤도해를 Horizons 로 J2000 에 평가한 접촉 요소를 ϖ · L 형태로 박제했다. 로더의 ω = ϖ − Ω ·
    // M₀ = L − ϖ 역변환과 루트 epoch(J2000) 해석이 맞으면 J2000 위치가 Horizons 상태벡터와 일치한다.
    // 대조값은 json 과 독립인 Horizons VECTORS 원시값 (CENTER=500@10 / REF_PLANE=ECLIPTIC / J2000 TDB, AU).
    // 허용 1000 km — 요소 반올림 (실측 최대 261 km, haumea 43 AU) 대비 넉넉하고, 베스타 L 을 0.001° 만 틀려도
    // (6,717 km) 걸린다. epoch 시점이라 장면 μ 와 무관하다.
    // 왜소행성 4 · 혜성 2 는 #1318 에서 같은 방식으로 교정했다 — 종전 값은 J2000 위치가 0.13~1.4 배 (태양 거리 대비)
    // 어긋났다 (eris 는 태양 반대편). 원시값 · 종전 값은 json `$orbitComment`.
    const HORIZONS_J2000_AU: Record<string, [number, number, number]> = {
      vesta: [-1.353580437607153, -1.673136657862151, 2.149018113721361e-1],
      pallas: [-8.411384433388419e-1, 1.653739426955205, -1.073889494800965],
      hygiea: [-2.374062486038638, -1.463570769967126, -1.781685951459966e-1],
      ceres: [-2.379327705915647, 7.954860388931395e-1, 4.630055715902157e-1],
      haumea: [-45.98975416258292, -5.120482285486933, 22.38562723851461],
      makemake: [-43.5784783265468, 11.47834473139828, 24.91821564163504],
      eris: [88.39334192774233, 30.76524538911426, -26.0943902751538],
      encke: [3.089291093891643, 1.14911528860036e-2, 2.778287537600695e-1],
      'swift-tuttle': [-12.57514687248681, 3.687234330253122, -12.42229064076265],
    };
    const TOLERANCE_KM = 1000;
    for (const [id, ref] of Object.entries(HORIZONS_J2000_AU)) {
      it(`${id} J2000 위치 오차 < ${TOLERANCE_KM} km`, () => {
        const body = byId.get(id);
        if (!body?.orbit) throw new Error(id);
        const p = positionAt(body.orbit, J2000_JD, MU_SUN);
        const dKm = Math.hypot(p[0] - ref[0] * AU, p[1] - ref[1] * AU, p[2] - ref[2] * AU) / 1000;
        expect(dKm).toBeLessThan(TOLERANCE_KM);
      });
    }

    // 교정하지 않은 2 body — 종전 값이 이미 태양 거리 대비 1.8e-3 이하로 맞다 (pluto 3.0e-4 · halley 1.8e-3).
    // 접촉 요소로 바꾸면 J2000 은 0 이 되지만 2026 오차가 커진다 (pluto 3.4e6 → 2.3e7 km) 라 유지했다.
    const KEPT_J2000_AU: Record<string, [number, number, number]> = {
      pluto: [-9.875347258580963, -27.95878609745811, 5.850454132132248],
      halley: [-17.38599346385816, 16.9791761108223, -7.577986613535686],
    };
    const KEPT_REL_TOLERANCE = 5e-3;
    for (const [id, ref] of Object.entries(KEPT_J2000_AU)) {
      it(`${id} J2000 위치 오차 / 태양 거리 < ${KEPT_REL_TOLERANCE}`, () => {
        const body = byId.get(id);
        if (!body?.orbit) throw new Error(id);
        const p = positionAt(body.orbit, J2000_JD, MU_SUN);
        const d = Math.hypot(p[0] - ref[0] * AU, p[1] - ref[1] * AU, p[2] - ref[2] * AU);
        expect(d / (Math.hypot(...ref) * AU)).toBeLessThan(KEPT_REL_TOLERANCE);
      });
    }

    it('대조 표가 태양 직속 비행성 body 전부를 덮는다 (누락 0)', () => {
      const covered = new Set([...Object.keys(HORIZONS_J2000_AU), ...Object.keys(KEPT_J2000_AU)]);
      const targets = system.bodies.filter(
        (b) => b.parentId === 'sun' && b.kind !== 'planet' && b.orbit,
      );
      expect(targets.length).toBeGreaterThanOrEqual(11);
      for (const b of targets) expect(covered.has(b.id), `${b.id} 대조 표 누락`).toBe(true);
    });
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
