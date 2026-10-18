import { describe, expect, it } from 'vitest';
import {
  AU,
  GENERAL_PRECESSION_DEG_PER_CENTURY,
  J2000_JD,
  J2000_MEAN_OBLIQUITY_ARCSEC,
  J2000_MEAN_OBLIQUITY_DEG,
  JULIAN_YEAR_SECONDS,
  LIGHT_YEAR,
} from './astronomy.js';

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

  it('#1373 J2000 평균 황도경사 ε = 84381.406″ (IAU 2006) — 도 단위 23.4392794°', () => {
    expect(J2000_MEAN_OBLIQUITY_ARCSEC).toBe(84_381.406);
    expect(J2000_MEAN_OBLIQUITY_DEG).toBeCloseTo(23.439_279_4, 7);
  });

  it('#1354 일반세차 p_A = 5028.796195″/세기 (IAU 2006 P03 선형항) — 도 단위', () => {
    expect(GENERAL_PRECESSION_DEG_PER_CENTURY * 3600).toBeCloseTo(5028.796195, 9);
  });
});
