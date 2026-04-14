import { describe, expect, it } from 'vitest';
import { AU, J2000_JD, JULIAN_YEAR_SECONDS, LIGHT_YEAR } from './astronomy.js';

describe('astronomy constants', () => {
  it('AU 정의값 — IAU 2012', () => {
    expect(AU).toBe(149_597_870_700);
  });

  it('광년 = c × 율리우스 년 (대략)', () => {
    // 정확한 정의값으로 비교
    expect(LIGHT_YEAR).toBe(9_460_730_472_580_800);
  });

  it('율리우스 년 = 365.25 × 86400 초', () => {
    expect(JULIAN_YEAR_SECONDS).toBe(31_557_600);
  });

  it('J2000.0 = JD 2451545.0', () => {
    expect(J2000_JD).toBe(2_451_545.0);
  });
});
