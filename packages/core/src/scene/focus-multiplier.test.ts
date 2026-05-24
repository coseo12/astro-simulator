/**
 * Focus multiplier SSoT 회귀 가드 (R4 #539 Amendment 3).
 *
 * 식 후보 2 (satellite 일괄 정책) 박제값 보호 + R5+ 자동 수용 가드.
 */
import { describe, it, expect } from 'vitest';
import {
  FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE,
  resolveFocusMultiplier,
} from './focus-multiplier.js';
import { FOCUS_USER_RADIUS_MULTIPLIER } from './camera-controller.js';

describe('focus-multiplier SSoT (R4 #539 Amendment 3)', () => {
  it('FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE 박제값 = 20 (D-T2 미통과 시 fallback 30/40)', () => {
    expect(FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE).toBe(20);
  });

  it('FOCUS_USER_RADIUS_MULTIPLIER (기존 비-satellite) = 5 보존', () => {
    expect(FOCUS_USER_RADIUS_MULTIPLIER).toBe(5);
  });

  it('moon (parentId=earth) → satellite (×20)', () => {
    expect(resolveFocusMultiplier('earth')).toBe(FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE);
  });

  it('비-satellite parentId=sun → 기존 ×5 (mercury/venus/earth/mars/jupiter/saturn 등)', () => {
    expect(resolveFocusMultiplier('sun')).toBe(FOCUS_USER_RADIUS_MULTIPLIER);
  });

  it('root body parentId=null → 기존 ×5 (sun 자체)', () => {
    expect(resolveFocusMultiplier(null)).toBe(FOCUS_USER_RADIUS_MULTIPLIER);
  });

  it('parentId=undefined (body 미존재 시 getBodyParentId fallback) → 기존 ×5', () => {
    expect(resolveFocusMultiplier(undefined)).toBe(FOCUS_USER_RADIUS_MULTIPLIER);
  });

  it('R5+ satellite 자동 수용 — phobos/deimos (parentId=mars) → ×20', () => {
    expect(resolveFocusMultiplier('mars')).toBe(FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE);
  });

  it('R6+ satellite 자동 수용 — galilean (parentId=jupiter) → ×20', () => {
    expect(resolveFocusMultiplier('jupiter')).toBe(FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE);
  });

  it('R7+ satellite 자동 수용 — titan (parentId=saturn) → ×20', () => {
    expect(resolveFocusMultiplier('saturn')).toBe(FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE);
  });

  it('D3.3 산출 검증 — moon focus 시 cameraRadius/moonScaling > 1.5 (mesh 외각 보장)', () => {
    // ADR §Amendment 3 §forensic 측정 박제값
    const MOON_WS_RADIUS = 60426; // moon high variant wsRadius (scene unit)
    const MOON_SCALING = 298810; // Amendment 2 visual scale 적용 후 moon scaling (scene unit)

    // 기존 식 (×5) — QA 측정 ≈ 1.011 (mesh 안쪽 박힘 회귀)
    const oldRadius = MOON_WS_RADIUS * FOCUS_USER_RADIUS_MULTIPLIER;
    const oldRatio = oldRadius / MOON_SCALING;
    expect(oldRatio).toBeLessThan(1.5); // 회귀 사례 = D3.3 fail
    expect(oldRatio).toBeCloseTo(1.011, 1);

    // 신규 식 (×20) — D3.3 cameraRadius/moonScaling > 1.5 통과
    const multiplier = resolveFocusMultiplier('earth');
    const newRadius = MOON_WS_RADIUS * multiplier;
    const newRatio = newRadius / MOON_SCALING;
    expect(newRatio).toBeGreaterThan(1.5);
    expect(newRatio).toBeCloseTo(4.04, 1); // ADR §Concrete Prediction §예측 2 D3.3 박제값
  });
});
