import { describe, expect, it } from 'vitest';
import { AU } from '@astro-simulator/shared';
import { renderScaleForTier } from '@astro-simulator/core/scene';

import {
  formatScaleLabel,
  sceneUnitToAU,
  UNIT_BOUNDARY,
  type SceneUnitToAUDeps,
} from './scale-control-utils';

/**
 * #400 ADR `20260512-au-slider-semantics.md` 결정 A — tier-aware AU 환산 + 단위 분기 검증.
 *
 * DoD-6 (테스트 + 회귀 가드) 핵심:
 *  - tier 별 환산식 정확성 (T1 / T2 / T3)
 *  - 단위 분기 경계값 (1e-3 AU, 1 AU, 1000 AU)
 *  - expected behavior 1/2 ± 1% 마진 (Gemini Q2 이견 수용)
 *  - 음수 / NaN / Infinity fallback
 */

describe('sceneUnitToAU — tier-aware 환산 (ADR 결정 A)', () => {
  it('T1 solar: 1 scene unit ≈ 0.0795 AU (renderScale 8.4e-11 역수)', () => {
    // 실 환산: renderScale 8.4e-11 (m → unit) 역수 = 1.19e10 m/unit. 1 unit = 1.19e10 m / AU = 0.0795 AU.
    // (ADR §배경 표의 "79.5 AU" 는 typo — 실 산식 결과는 0.0795 AU. 결정 A 환산식 자체는 정확.)
    const expected = 1 / renderScaleForTier('solar') / AU;
    const got = sceneUnitToAU({ sceneUnit: 1, tier: 'solar', AU });
    // ± 1% 마진 (expected behavior #1 — Gemini Q2 이견 수용).
    expect(got).toBeCloseTo(expected, 5);
    expect(got).toBeGreaterThan(0.07);
    expect(got).toBeLessThan(0.09);
  });

  it('T2 inner: 1 scene unit ≈ 0.0043 AU', () => {
    const expected = 1 / renderScaleForTier('inner') / AU;
    const got = sceneUnitToAU({ sceneUnit: 1, tier: 'inner', AU });
    expect(got).toBeCloseTo(expected, 5);
    // 약 0.0043 AU.
    expect(got).toBeGreaterThan(0.003);
    expect(got).toBeLessThan(0.005);
  });

  it('T3 body: 1 scene unit ≈ 2.66e-7 AU (≈ 39.8 km)', () => {
    const expected = 1 / renderScaleForTier('body') / AU;
    const got = sceneUnitToAU({ sceneUnit: 1, tier: 'body', AU });
    expect(got).toBeCloseTo(expected, 12);
    // 약 2.66e-7 AU.
    expect(got).toBeGreaterThan(2e-7);
    expect(got).toBeLessThan(3e-7);
  });

  it('sceneUnit = 0 → 0 AU (모든 tier 동일)', () => {
    expect(sceneUnitToAU({ sceneUnit: 0, tier: 'solar', AU })).toBe(0);
    expect(sceneUnitToAU({ sceneUnit: 0, tier: 'inner', AU })).toBe(0);
    expect(sceneUnitToAU({ sceneUnit: 0, tier: 'body', AU })).toBe(0);
  });

  it('expected behavior #1 — T1 solar / free-fly: ± 1% 마진 검증', () => {
    // 슬라이더 LOG_MAX = 2 → 100 scene unit. T1 에서 약 7.95 AU.
    const got = sceneUnitToAU({ sceneUnit: 100, tier: 'solar', AU });
    const truth = 100 / renderScaleForTier('solar') / AU;
    // ± 1% 마진.
    expect(Math.abs((got - truth) / truth)).toBeLessThan(0.01);
  });

  it('expected behavior #2 — T3 body / focus: ± 1% 마진 검증', () => {
    // 슬라이더 LOG_MIN = -2 → 0.01 scene unit. T3 에서 약 2.66e-9 AU ≈ 0.398 km.
    const got = sceneUnitToAU({ sceneUnit: 0.01, tier: 'body', AU });
    const truth = 0.01 / renderScaleForTier('body') / AU;
    expect(Math.abs((got - truth) / truth)).toBeLessThan(0.01);
  });
});

describe('formatScaleLabel — 단위 자동 분기 (ADR 결정 A expected behavior #5)', () => {
  it('< 1e-3 AU → km 단위 (T3 body 일상 단위)', () => {
    // 39.8 km ≈ 2.66e-7 AU.
    const label = formatScaleLabel(2.66e-7);
    expect(label).toMatch(/^\d+ km$/);
    // 약 40 km.
    const match = label.match(/^(\d+) km$/);
    expect(match).not.toBeNull();
    const km = Number(match![1]);
    expect(km).toBeGreaterThan(30);
    expect(km).toBeLessThan(50);
  });

  it('1e-3 ~ 1 AU → mAU 단위 (T2 inner)', () => {
    // 0.5 AU = 500 mAU.
    expect(formatScaleLabel(0.5)).toBe('500 mAU');
    // 0.001 AU = 1 mAU (경계).
    expect(formatScaleLabel(0.001)).toBe('1 mAU');
    // 0.999 AU = 999 mAU (1 AU 직전).
    expect(formatScaleLabel(0.999)).toBe('999 mAU');
  });

  it('1 ~ 1000 AU → AU 단위 (T1 solar 표준)', () => {
    expect(formatScaleLabel(1)).toBe('1.00 AU');
    expect(formatScaleLabel(35)).toBe('35.00 AU');
    expect(formatScaleLabel(50.0)).toBe('50.00 AU');
    expect(formatScaleLabel(999.99)).toBe('999.99 AU');
  });

  it('≥ 1000 AU → kAU 단위 (T1 solar 극단 줌아웃)', () => {
    expect(formatScaleLabel(1000)).toBe('1.00 kAU');
    expect(formatScaleLabel(7950)).toBe('7.95 kAU');
  });

  it('단위 경계값 정확성 (UNIT_BOUNDARY SSoT)', () => {
    // 경계값에서 단위 전환 (< 비교) — 정확히 boundary 면 다음 단위.
    expect(formatScaleLabel(UNIT_BOUNDARY.km)).toMatch(/mAU$/);
    expect(formatScaleLabel(UNIT_BOUNDARY.mAU)).toMatch(/AU$/);
    expect(formatScaleLabel(UNIT_BOUNDARY.AU)).toMatch(/kAU$/);
  });

  it('음수 / NaN / Infinity → 방어적 fallback', () => {
    expect(formatScaleLabel(-1)).toBe('-- AU');
    expect(formatScaleLabel(Number.NaN)).toBe('-- AU');
    expect(formatScaleLabel(Number.POSITIVE_INFINITY)).toBe('-- AU');
  });
});

describe('sceneUnitToAU + formatScaleLabel 결합 — 실 슬라이더 시나리오', () => {
  it('T1 solar 기본 진입 (35 scene unit) → 약 2.78 AU', () => {
    const deps: SceneUnitToAUDeps = { sceneUnit: 35, tier: 'solar', AU };
    const radiusAU = sceneUnitToAU(deps);
    const label = formatScaleLabel(radiusAU);
    // 35 / 8.4e-11 / AU ≈ 2.785 AU → "2.79 AU" (소수점 2자리 반올림).
    expect(label).toMatch(/^2\.\d{2} AU$/);
  });

  it('T3 body focus 진입 (0.5 scene unit) → 약 20 km', () => {
    const deps: SceneUnitToAUDeps = { sceneUnit: 0.5, tier: 'body', AU };
    const radiusAU = sceneUnitToAU(deps);
    const label = formatScaleLabel(radiusAU);
    // 0.5 / 2.51e-5 / AU ≈ 1.33e-7 AU ≈ 19.9 km.
    expect(label).toMatch(/^\d+ km$/);
    const km = Number(label.match(/^(\d+) km$/)![1]);
    expect(km).toBeGreaterThan(15);
    expect(km).toBeLessThan(25);
  });

  it('T2 inner 1 scene unit → 약 643,000 km = 4 mAU', () => {
    const deps: SceneUnitToAUDeps = { sceneUnit: 1, tier: 'inner', AU };
    const radiusAU = sceneUnitToAU(deps);
    const label = formatScaleLabel(radiusAU);
    // 1 / 1.54e-9 / AU ≈ 0.00434 AU = 4 mAU.
    expect(label).toMatch(/mAU$/);
  });
});
