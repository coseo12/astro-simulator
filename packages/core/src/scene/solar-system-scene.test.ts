import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import { describe, expect, it } from 'vitest';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { orbitalPeriod } from '../physics/kepler.js';
import { AMBIENT_INTENSITY, AMBIENT_GROUND_COLOR_RGB } from './solar-system-scene.js';

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

/**
 * 회귀 가드 #372 — Ambient 라이팅이 default 진입 시 행성 그림자측 가시성 floor 를 만족하는지 검증.
 *
 * **회귀 분기점**: R2 (#363, mercury 추가, v0.15.0). R3 venus 추가 (#369) 로 가시화.
 * **근본 원인**: ambient.intensity=0.08 + groundColor=(0.01, 0.01, 0.02) — sun.disableLighting=true
 * 환경에서 행성 mesh sun-반대측이 거의 검은색으로 떨어져 윤곽 소실.
 * **fix 박제값**: intensity=0.3 (3.75×), groundColor=(0.15, 0.15, 0.18) 중립 회색톤.
 *
 * **임계 근거**: architect debug 패치 + revert 검증 (1280×720 ?gpu=a). intensity 0.25 미만 또는
 * groundColor 평균 0.05 미만으로 회귀하면 행성 그림자측 윤곽 소실 재현 — 본 테스트가 차단.
 *
 * **volt #77 매트릭스**: headless 환경은 GPU adapter 부재로 tier-c 자동 진입 → sun 1px 점 → 회귀
 * 자동 가드 통과. 본 단위 테스트는 brwoser 무관하게 상수 자체를 검증하므로 false positive 없음.
 */
describe('회귀 #372 — ambient 라이팅 가시성 floor', () => {
  // floor 임계: intensity 0.25 미만이면 행성 그림자측 인지 불가 (architect 검증).
  const INTENSITY_FLOOR = 0.25;
  // floor 임계: groundColor 평균이 0.05 미만이면 거의 검은색 회귀와 등가.
  const GROUND_COLOR_AVG_FLOOR = 0.05;

  it('AMBIENT_INTENSITY 가 가시성 floor (≥ 0.25) 를 만족', () => {
    expect(AMBIENT_INTENSITY).toBeGreaterThanOrEqual(INTENSITY_FLOOR);
  });

  it('AMBIENT_GROUND_COLOR_RGB 평균이 거의 검은색이 아님 (≥ 0.05)', () => {
    const avg =
      (AMBIENT_GROUND_COLOR_RGB.r + AMBIENT_GROUND_COLOR_RGB.g + AMBIENT_GROUND_COLOR_RGB.b) / 3;
    expect(avg).toBeGreaterThanOrEqual(GROUND_COLOR_AVG_FLOOR);
  });

  it('AMBIENT_INTENSITY 가 architect 검증 박제값 (0.3) 과 일치', () => {
    // 임의 상향 조정도 박제값 drift 이므로 정확 일치 검증. 변경 시 ADR amendment 동반 의무.
    expect(AMBIENT_INTENSITY).toBe(0.3);
  });

  it('AMBIENT_GROUND_COLOR_RGB 가 architect 검증 박제값 (0.15, 0.15, 0.18) 과 일치', () => {
    expect(AMBIENT_GROUND_COLOR_RGB).toEqual({ r: 0.15, g: 0.15, b: 0.18 });
  });
});
