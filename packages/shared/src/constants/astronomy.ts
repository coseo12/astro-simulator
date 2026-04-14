/**
 * 천문학 거리/시간 단위 (SI 환산).
 */

/** 천문단위 [m] — IAU 2012 정의 */
export const AU = 149_597_870_700;

/** 광년 [m] */
export const LIGHT_YEAR = 9_460_730_472_580_800;

/** 파섹 [m] */
export const PARSEC = 3.085_677_581_491_367e16;

/** 킬로파섹 [m] */
export const KILOPARSEC = 1000 * PARSEC;

/** 메가파섹 [m] */
export const MEGAPARSEC = 1_000_000 * PARSEC;

/** 율리우스 년 [s] (365.25일) */
export const JULIAN_YEAR_SECONDS = 365.25 * 86_400;

/** J2000.0 epoch — Julian Date 2451545.0 (2000-01-01 12:00 TT) */
export const J2000_JD = 2_451_545.0;

/** 율리우스 세기 [일] — 36525일 */
export const JULIAN_CENTURY_DAYS = 36_525;
