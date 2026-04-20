import { describe, expect, it } from 'vitest';
import { loadSolarSystem } from './solar-system-loader.js';

describe('loadSolarSystem', () => {
  it('로드 성공 + 24개 바디 (sun + 8행성 + moon 7 + 왜소행성 5 + 혜성 3)', () => {
    // P8 #244: 포보스/데이모스 추가 → moon 엔티티 3개 (moon + phobos + deimos).
    // P9 #254: Galilean 4체 (io/europa/ganymede/callisto) 추가 → moon 엔티티 7개.
    const data = loadSolarSystem();
    expect(data.epoch).toBe(2451545.0);
    expect(data.tier).toBe(1);
    expect(data.bodies).toHaveLength(24);
    expect(data.bodies.filter((b) => b.kind === 'moon')).toHaveLength(7);
    expect(data.bodies.filter((b) => b.kind === 'dwarf-planet')).toHaveLength(5);
    expect(data.bodies.filter((b) => b.kind === 'comet')).toHaveLength(3);
  });

  it('태양은 궤도가 없다', () => {
    const sun = loadSolarSystem().bodies.find((b) => b.id === 'sun');
    expect(sun).toBeDefined();
    expect(sun?.orbit).toBeUndefined();
    expect(sun?.parentId).toBeNull();
  });

  it('지구 궤도 요소 — AU를 m로, 각도를 rad로 변환됨', () => {
    const earth = loadSolarSystem().bodies.find((b) => b.id === 'earth');
    expect(earth).toBeDefined();
    expect(earth?.orbit).toBeDefined();
    // a ≈ 1 AU = 1.496e11 m
    expect(earth!.orbit!.semiMajorAxis).toBeCloseTo(1.496e11, -9);
    // e ≈ 0.0167
    expect(earth!.orbit!.eccentricity).toBeCloseTo(0.0167, 3);
    // i ≈ 0 (거의 황도면)
    expect(Math.abs(earth!.orbit!.inclination)).toBeLessThan(1e-4);
    expect(earth!.orbit!.epoch).toBe(2451545.0);
  });

  it('달의 부모는 지구', () => {
    const moon = loadSolarSystem().bodies.find((b) => b.id === 'moon');
    expect(moon?.parentId).toBe('earth');
  });

  it('포보스/데이모스의 부모는 화성 (P8 #244)', () => {
    const bodies = loadSolarSystem().bodies;
    const phobos = bodies.find((b) => b.id === 'phobos');
    const deimos = bodies.find((b) => b.id === 'deimos');
    expect(phobos?.parentId).toBe('mars');
    expect(phobos?.kind).toBe('moon');
    expect(deimos?.parentId).toBe('mars');
    expect(deimos?.kind).toBe('moon');
  });

  it('모든 행성의 부모는 태양, 각도는 [-π, π]로 정규화됨', () => {
    const data = loadSolarSystem();
    const planets = data.bodies.filter((b) => b.kind === 'planet');
    expect(planets).toHaveLength(8);
    for (const p of planets) {
      expect(p.parentId).toBe('sun');
      expect(p.orbit).toBeDefined();
      expect(p.orbit!.longitudeOfAscendingNode).toBeGreaterThanOrEqual(-Math.PI);
      expect(p.orbit!.longitudeOfAscendingNode).toBeLessThanOrEqual(Math.PI);
      expect(p.orbit!.argumentOfPeriapsis).toBeGreaterThanOrEqual(-Math.PI);
      expect(p.orbit!.argumentOfPeriapsis).toBeLessThanOrEqual(Math.PI);
      expect(p.orbit!.meanAnomalyAtEpoch).toBeGreaterThanOrEqual(-Math.PI);
      expect(p.orbit!.meanAnomalyAtEpoch).toBeLessThanOrEqual(Math.PI);
    }
  });

  it('반경과 질량은 양수', () => {
    for (const b of loadSolarSystem().bodies) {
      expect(b.mass).toBeGreaterThan(0);
      expect(b.radius).toBeGreaterThan(0);
    }
  });

  it('P9 #254 — Galilean 4체 + Jupiter.rings 3층 로드 성공 (필드 접근 무결성)', () => {
    // ADR 20260420-p9-galilean-laplace-rings.md §JSON 스키마 확장 (L319~L374) 박제값 검증.
    const bodies = loadSolarSystem().bodies;

    // (1) Galilean 4체 존재 + 부모·kind·특성 수치 확인.
    const io = bodies.find((b) => b.id === 'io');
    const europa = bodies.find((b) => b.id === 'europa');
    const ganymede = bodies.find((b) => b.id === 'ganymede');
    const callisto = bodies.find((b) => b.id === 'callisto');

    for (const m of [io, europa, ganymede, callisto]) {
      expect(m).toBeDefined();
      expect(m?.kind).toBe('moon');
      expect(m?.parentId).toBe('jupiter');
      expect(m?.orbit).toBeDefined();
    }

    // Io 이심률 = 0.0041 (ADR §결정 #3 특이점 가드 경계 e > 1e-6 충족 확인)
    expect(io!.orbit!.eccentricity).toBeCloseTo(0.0041, 4);
    // Europa 이심률 = 0.009
    expect(europa!.orbit!.eccentricity).toBeCloseTo(0.009, 3);
    // Ganymede 이심률 = 0.0013
    expect(ganymede!.orbit!.eccentricity).toBeCloseTo(0.0013, 4);
    // Callisto 이심률 = 0.0074
    expect(callisto!.orbit!.eccentricity).toBeCloseTo(0.0074, 4);

    // 질량 순서: Europa < Io < Callisto < Ganymede (태양계 최대 위성)
    // JPL: Europa 4.8e22 / Io 8.93e22 / Callisto 1.08e23 / Ganymede 1.48e23
    expect(europa!.mass).toBeLessThan(io!.mass);
    expect(io!.mass).toBeLessThan(callisto!.mass);
    expect(callisto!.mass).toBeLessThan(ganymede!.mass);

    // (2) Jupiter.rings 3층 (halo/main/gossamer) 로드 확인 + 순서·반경 무결성.
    const jupiter = bodies.find((b) => b.id === 'jupiter');
    expect(jupiter).toBeDefined();
    expect(jupiter?.rings).toBeDefined();
    expect(jupiter!.rings).toHaveLength(3);

    const [halo, main, gossamer] = jupiter!.rings!;
    expect(halo!.id).toBe('halo');
    expect(main!.id).toBe('main');
    expect(gossamer!.id).toBe('gossamer');

    // 반경 (km → m 변환 확인): halo 92000~122500 km → 9.2e7 ~ 1.225e8 m
    expect(halo!.innerRadius).toBeCloseTo(92000 * 1000, -3);
    expect(halo!.outerRadius).toBeCloseTo(122500 * 1000, -3);
    expect(main!.innerRadius).toBeCloseTo(122500 * 1000, -3);
    expect(main!.outerRadius).toBeCloseTo(129000 * 1000, -3);
    expect(gossamer!.innerRadius).toBeCloseTo(129000 * 1000, -3);
    expect(gossamer!.outerRadius).toBeCloseTo(226000 * 1000, -3);

    // 층간 연속성: halo.outer == main.inner, main.outer == gossamer.inner
    expect(halo!.outerRadius).toBeCloseTo(main!.innerRadius, -3);
    expect(main!.outerRadius).toBeCloseTo(gossamer!.innerRadius, -3);

    // (3) densityProfile 범위·형식 무결성.
    for (const ring of jupiter!.rings!) {
      expect(ring.densityProfile.length).toBeGreaterThanOrEqual(2);
      for (const [rNorm, density] of ring.densityProfile) {
        expect(rNorm).toBeGreaterThanOrEqual(0);
        expect(rNorm).toBeLessThanOrEqual(1);
        expect(density).toBeGreaterThanOrEqual(0);
        expect(density).toBeLessThanOrEqual(1);
      }
    }

    // main 링 피크 밀도 1.0 (중앙 segment) — JSON 박제값 (ADR §JSON 스키마 L360)
    const mainPeakDensity = Math.max(...main!.densityProfile.map(([, d]) => d));
    expect(mainPeakDensity).toBeCloseTo(1.0, 5);

    // (4) rings 가 없는 엔티티 (예: earth) 의 rings 는 undefined
    const earth = bodies.find((b) => b.id === 'earth');
    expect(earth?.rings).toBeUndefined();
  });
});
