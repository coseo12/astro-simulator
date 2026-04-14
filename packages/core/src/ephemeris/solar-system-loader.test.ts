import { describe, expect, it } from 'vitest';
import { loadSolarSystem } from './solar-system-loader.js';

describe('loadSolarSystem', () => {
  it('로드 성공 + 18개 바디 (sun + 8행성 + moon + 왜소행성 5 + 혜성 3)', () => {
    const data = loadSolarSystem();
    expect(data.epoch).toBe(2451545.0);
    expect(data.tier).toBe(1);
    expect(data.bodies).toHaveLength(18);
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
});
