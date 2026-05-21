/**
 * Orbit Visual Scale SSoT 회귀 가드.
 *
 * R4 #539 Amendment 2 박제값 보호.
 */
import { describe, it, expect } from 'vitest';
import {
  EARTH_MOON_ORBIT_VISUAL_SCALE,
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

  it('R5+ 미진입 parent (mars/jupiter/saturn) → 1.0 (Amendment 2 비-범위)', () => {
    expect(getOrbitVisualScale('mars')).toBe(1.0);
    expect(getOrbitVisualScale('jupiter')).toBe(1.0);
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
