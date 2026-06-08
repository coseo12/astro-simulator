/**
 * Orbit Visual Scale SSoT 회귀 가드.
 *
 * R4 #539 Amendment 2 (earth-moon) + R5 #594 (mars-satellites) 박제값 보호.
 */
import { describe, it, expect } from 'vitest';
import {
  EARTH_MOON_ORBIT_VISUAL_SCALE,
  MARS_SATELLITES_ORBIT_VISUAL_SCALE,
  JUPITER_SATELLITES_ORBIT_VISUAL_SCALE,
  ORBIT_VISUAL_SCALE_BY_PARENT,
  getOrbitVisualScale,
} from './orbit-visual-scale.js';

describe('orbit-visual-scale SSoT (R4 #539 Amendment 2)', () => {
  it('EARTH_MOON_ORBIT_VISUAL_SCALE 박제값 = 30 (D-T2 미통과 시 fallback 50/75)', () => {
    expect(EARTH_MOON_ORBIT_VISUAL_SCALE).toBe(30);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT.earth = EARTH_MOON_ORBIT_VISUAL_SCALE', () => {
    expect(ORBIT_VISUAL_SCALE_BY_PARENT.earth).toBe(EARTH_MOON_ORBIT_VISUAL_SCALE);
  });

  it('parent=earth 룩업 = 30 (moon)', () => {
    expect(getOrbitVisualScale('earth')).toBe(30);
  });

  it('parent=sun 미정의 → 1.0 (실측 그대로, mercury/venus/earth 무영향)', () => {
    expect(getOrbitVisualScale('sun')).toBe(1.0);
  });

  it('parent=null/undefined → 1.0 (free-fly / root body)', () => {
    expect(getOrbitVisualScale(null)).toBe(1.0);
    expect(getOrbitVisualScale(undefined)).toBe(1.0);
  });

  it('R7+ 미진입 parent (saturn) → 1.0 (R6 비-범위)', () => {
    expect(getOrbitVisualScale('saturn')).toBe(1.0);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT 는 frozen (런타임 변경 차단)', () => {
    expect(Object.isFrozen(ORBIT_VISUAL_SCALE_BY_PARENT)).toBe(true);
  });

  it('분리 마진 산출 검증 — visual_scale=30 → sum mesh < visual 거리 (≥ 1.5x 안전 임계)', () => {
    // ADR §Amendment 2 §측정 1 박제값 (실측 거리 + earthScale=800 + moonScale=800)
    const EM_DISTANCE_M = 3.847e8;
    const EARTH_MESH_RADIUS_M = 5.103e9;
    const MOON_MESH_RADIUS_M = 1.39e9;
    const SUM_MESH_M = EARTH_MESH_RADIUS_M + MOON_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('earth');
    const visualDistance = EM_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §결정 6 §Visual scale 후보 비교 §×30 = 1.78배 분리 마진 통과
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(1.78, 1);
  });
});

describe('orbit-visual-scale SSoT (R5 #594 mars-satellites — satellite 2개 첫 본 사례)', () => {
  it('MARS_SATELLITES_ORBIT_VISUAL_SCALE 박제값 = 500 (D-T2 미통과 시 fallback 600/750)', () => {
    expect(MARS_SATELLITES_ORBIT_VISUAL_SCALE).toBe(500);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT.mars = MARS_SATELLITES_ORBIT_VISUAL_SCALE', () => {
    expect(ORBIT_VISUAL_SCALE_BY_PARENT.mars).toBe(MARS_SATELLITES_ORBIT_VISUAL_SCALE);
  });

  it('parent=mars 룩업 = 500 (phobos + deimos 둘 다 적용)', () => {
    expect(getOrbitVisualScale('mars')).toBe(500);
  });

  it('phobos 분리 마진 산출 — binding constraint, visual_scale=500 → 1.69배 (≥ 1.5 통과 +0.19)', () => {
    // ADR §결정 4 §축 4 박제값 (실측 거리 + marsScale=800 + phobosScale=5000)
    const MARS_PHOBOS_DISTANCE_M = 9.376e6;
    const MARS_MESH_RADIUS_M = 2.717e9; // 3.3962e6 × 800
    const PHOBOS_MESH_RADIUS_M = 5.54e7; // 1.108e4 × 5000
    const SUM_MESH_M = MARS_MESH_RADIUS_M + PHOBOS_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('mars');
    const visualDistance = MARS_PHOBOS_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §결정 4 §축 4 §×500 = 1.69배 분리 마진 통과
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(1.69, 1);
  });

  it('deimos 분리 마진 산출 — 자동 안전, visual_scale=500 → 4.27배 (phobos binding 자동 통과)', () => {
    // ADR §결정 4 §축 4 박제값 (실측 거리 + marsScale=800 + deimosScale=5000)
    const MARS_DEIMOS_DISTANCE_M = 23.463e6;
    const MARS_MESH_RADIUS_M = 2.717e9; // 3.3962e6 × 800
    const DEIMOS_MESH_RADIUS_M = 3.135e7; // 6.27e3 × 5000
    const SUM_MESH_M = MARS_MESH_RADIUS_M + DEIMOS_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('mars');
    const visualDistance = MARS_DEIMOS_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §결정 4 §축 4 §×500 = 4.27배 분리 마진 (phobos 1.69배 의 2.53배 더 안전)
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(4.27, 1);
  });
});

describe('orbit-visual-scale SSoT (R6 #621 — jupiter-galilean)', () => {
  it('JUPITER_SATELLITES_ORBIT_VISUAL_SCALE = 16 (R6 #621 박제값)', () => {
    expect(JUPITER_SATELLITES_ORBIT_VISUAL_SCALE).toBe(16);
  });

  it('ORBIT_VISUAL_SCALE_BY_PARENT.jupiter == JUPITER_SATELLITES_ORBIT_VISUAL_SCALE (룩업 정합)', () => {
    expect(ORBIT_VISUAL_SCALE_BY_PARENT.jupiter).toBe(JUPITER_SATELLITES_ORBIT_VISUAL_SCALE);
  });

  it('getOrbitVisualScale(jupiter) == 16', () => {
    expect(getOrbitVisualScale('jupiter')).toBe(16);
  });

  it('io 분리 마진 산출 (산식 A, binding constraint) — visual_scale=16 → 1.69x (R5 phobos 정합)', () => {
    // R6 ADR §결정 4 §축 4 박제값 (실측 거리 + jupiterScale=48 + ioScale=300)
    const JUPITER_IO_DISTANCE_M = 4.2023e8; // semiMajorAxisAU 0.00280906
    const JUPITER_MESH_RADIUS_M = 3.4316e9; // 7.1492e7 × 48
    const IO_MESH_RADIUS_M = 5.465e8; // 1.8216e6 × 300
    const SUM_MESH_M = JUPITER_MESH_RADIUS_M + IO_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('jupiter');
    const visualDistance = JUPITER_IO_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §결정 4 — io binding 분리 마진 1.69x (≥ 1.5 임계 +0.19, R5 phobos 1.69x 정확 정합)
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(1.69, 1);
  });

  it('callisto 분리 마진 산출 (자동 안전) — visual_scale=16 → 7.25x (io binding 자동 통과)', () => {
    // R6 ADR §결정 4 §축 4 박제값 (실측 거리 + jupiterScale=48 + callistoScale=300)
    const JUPITER_CALLISTO_DISTANCE_M = 1.8826e9; // semiMajorAxisAU 0.0125847
    const JUPITER_MESH_RADIUS_M = 3.4316e9; // 7.1492e7 × 48
    const CALLISTO_MESH_RADIUS_M = 7.231e8; // 2.4103e6 × 300
    const SUM_MESH_M = JUPITER_MESH_RADIUS_M + CALLISTO_MESH_RADIUS_M;

    const visualScale = getOrbitVisualScale('jupiter');
    const visualDistance = JUPITER_CALLISTO_DISTANCE_M * visualScale;
    const separationMargin = visualDistance / SUM_MESH_M;

    // ADR §결정 4 — callisto 자동 안전 7.25x (io 가 binding constraint, 나머지 3개 자동 통과)
    expect(separationMargin).toBeGreaterThanOrEqual(1.5);
    expect(separationMargin).toBeCloseTo(7.25, 0);
  });
});
