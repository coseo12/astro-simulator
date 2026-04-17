/**
 * P6-B #190 — lensing-lut wrapper 단위 테스트.
 *
 * Rust LUT 빌더의 flat 출력이 outcome/deflection 두 채널로 올바르게
 * 디코딩되고, 경계 인덱스 계산이 정확한지 검증한다.
 *
 * Rust 측 회귀(`lensing_lut_shadow_b_crit_within_5_percent`)는 cargo test 책임.
 * 본 테스트는 TS 디코딩 계층만 검증.
 */
import { describe, expect, it } from 'vitest';
import { createLensingLut, bToLutIndex, LUT_B_MIN, LUT_B_MAX } from './lensing-lut.js';

describe('createLensingLut', () => {
  it('samples 2 미만은 throw', () => {
    expect(() => createLensingLut(1)).toThrow();
    expect(() => createLensingLut(0)).toThrow();
    expect(() => createLensingLut(-5)).toThrow();
  });

  it('outcomes/deflections 길이 = samples, interleaved = 2*samples', () => {
    const samples = 64;
    const lut = createLensingLut(samples);
    expect(lut.samples).toBe(samples);
    expect(lut.outcomes.length).toBe(samples);
    expect(lut.deflections.length).toBe(samples);
    expect(lut.interleaved.length).toBe(2 * samples);
    expect(lut.bMin).toBe(LUT_B_MIN);
    expect(lut.bMax).toBe(LUT_B_MAX);
  });

  it('outcome 값은 0.0 또는 1.0만', () => {
    const lut = createLensingLut(64);
    for (let i = 0; i < lut.samples; i++) {
      expect([0, 1]).toContain(lut.outcomes[i]);
    }
  });

  it('첫 샘플(b=B_MIN)은 Captured, 마지막(b=B_MAX)은 Escaped', () => {
    const lut = createLensingLut(64);
    expect(lut.outcomes[0]).toBe(0);
    expect(lut.outcomes[lut.samples - 1]).toBe(1);
    // Captured 영역 deflection은 0.0.
    expect(lut.deflections[0]).toBe(0);
    // Escaped b=B_MAX deflection은 양수.
    expect(lut.deflections[lut.samples - 1]).toBeGreaterThan(0);
  });

  it('shadow boundary가 b_crit (≈2.598Rs) ±5% 안 — TS 디코딩 일관성', () => {
    const lut = createLensingLut(256);
    const denom = lut.samples - 1;
    let boundaryB: number | null = null;
    for (let i = 1; i < lut.samples; i++) {
      if (lut.outcomes[i - 1] === 0 && lut.outcomes[i] === 1) {
        const bPrev = lut.bMin + (lut.bMax - lut.bMin) * ((i - 1) / denom);
        const bCurr = lut.bMin + (lut.bMax - lut.bMin) * (i / denom);
        boundaryB = 0.5 * (bPrev + bCurr);
        break;
      }
    }
    expect(boundaryB).not.toBeNull();
    const bCrit = (3 * Math.sqrt(3)) / 2; // ≈ 2.598
    const relErr = Math.abs((boundaryB! - bCrit) / bCrit);
    expect(relErr).toBeLessThan(0.05);
  });
});

describe('bToLutIndex', () => {
  it('b=bMin → 0, b=bMax → samples-1', () => {
    const lut = createLensingLut(64);
    expect(bToLutIndex(lut.bMin, lut)).toBeCloseTo(0, 6);
    expect(bToLutIndex(lut.bMax, lut)).toBeCloseTo(lut.samples - 1, 6);
  });

  it('중간 b는 선형 보간 인덱스', () => {
    const lut = createLensingLut(64);
    const mid = 0.5 * (lut.bMin + lut.bMax);
    expect(bToLutIndex(mid, lut)).toBeCloseTo((lut.samples - 1) / 2, 6);
  });
});
