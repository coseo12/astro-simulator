import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import { describe, expect, it } from 'vitest';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { orbitalPeriod } from '../physics/kepler.js';

/**
 * C4 (#16) 지구-달 2-body 검증.
 *
 * createSolarSystemScene은 Babylon 엔진이 필요하므로 NullEngine 헤드리스 테스트로는
 * 제한적이다. 여기서는 달 궤도의 물리적 정확성만 검증한다.
 * 시각적 검증은 scripts/browser-verify.mjs가 담당.
 */
describe('지구-달 2-body', () => {
  const system = getSolarSystem();
  const earth = system.bodies.find((b) => b.id === 'earth');
  const moon = system.bodies.find((b) => b.id === 'moon');

  it('달이 존재하며 부모는 지구', () => {
    expect(moon).toBeDefined();
    expect(moon?.parentId).toBe('earth');
  });

  it('달 반경 ≈ 1737 km', () => {
    expect(moon!.radius).toBeCloseTo(1.7374e6, -3);
  });

  it('달 궤도 반지름 ≈ 384,400 km', () => {
    const a = moon!.orbit!.semiMajorAxis;
    expect(a).toBeGreaterThan(3.8e8);
    expect(a).toBeLessThan(3.85e8);
  });

  it('달 공전주기 (항성월) ≈ 27.3일 ±1일', () => {
    // 항성월 (sidereal month): 지구 기준 2π 라디안 = 27.32일
    const muEarth = GRAVITATIONAL_CONSTANT * earth!.mass;
    const periodDays = orbitalPeriod(moon!.orbit!.semiMajorAxis, muEarth) / 86_400;
    expect(periodDays).toBeGreaterThan(26.3);
    expect(periodDays).toBeLessThan(28.3);
  });

  it('달 질량은 지구 질량의 약 1/81', () => {
    const ratio = moon!.mass / earth!.mass;
    expect(ratio).toBeCloseTo(1 / 81.3, 3);
  });

  it('달 궤도 이심률 ≈ 0.055', () => {
    expect(moon!.orbit!.eccentricity).toBeCloseTo(0.0549, 3);
  });
});
