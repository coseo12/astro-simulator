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

/**
 * #1354 — 일반세차 (황경 방향 누적 세차 율) [도/율리우스 세기]. IAU 2006 P03 (Capitaine et al. 2003, ERFA `p06e.c`
 * `p_A` 의 선형항 `5028.796195″/세기`).
 *
 * 「날짜 평균 분점」 기준으로 표기된 경도 율 (예: Meeus *Astronomical Algorithms* 2판 47장의 달 평균 요소) 을
 * 장면 좌표 (J2000 황도 · 고정 분점) 의 율로 옮길 때 뺀다 — 로더가 `rates.frame === 'mean-equinox-of-date'` 에 적용한다.
 * `rates.frame === 'J2000'` (8행성 — JPL SSD 표 1) 은 이미 J2000 틀이라 빼지 않는다 (#1406 결정 F′).
 * ADR `docs/decisions/20261017-1354-lunar-precession-eclipses.md` 결정 M2.
 */
export const GENERAL_PRECESSION_DEG_PER_CENTURY = 5028.796195 / 3600;

/**
 * #1362 — 지구 자전각 (Earth Rotation Angle) 식의 J2000.0 값 [회전수]. IERS Conventions (2010) 식 5.15
 * `θ(T_u) = 2π(0.7790572732640 + 1.00273781191135448·T_u)`, `T_u = JD(UT1) − 2451545.0`.
 *
 * 장면 jd 는 UTC 기반 (`time/julian-date.ts`) 이라 UT1 대신 쓴다 — `|UT1 − UTC| < 0.9 s` 는 자전각 `< 0.004°` 다.
 */
export const EARTH_ROTATION_ANGLE_AT_J2000_TURNS = 0.779_057_273_264;

/** #1362 — 지구 자전각의 율 [회전수/UT1 일]. IERS Conventions (2010) 식 5.15 (위 상수와 짝). */
export const EARTH_ROTATION_ANGLE_RATE_TURNS_PER_DAY = 1.002_737_811_911_354_48;

/**
 * #1373 — J2000.0 평균 황도경사 ε [″]. IAU 2006 (Hilton et al. 2006 · IERS Conventions (2010) 식 5.40 상수항 `84381.406″`).
 *
 * 적도 J2000 (별 카탈로그 RA · Dec) → 황도 J2000 (장면 데이터 좌표) 변환 `R_x(+ε)` 에 쓴다
 * (`packages/core/src/coords/equatorial.ts`). 지구 자전축 기울기 데이터 `axialTiltDeg = 23.44` 는 NASA 반올림값이라
 * 이 상수와 0.0007° 다르다 — 두 값을 섞지 않는다. ADR `docs/decisions/20261018-1373-star-catalog-constellations.md` 결정 D6.
 */
export const J2000_MEAN_OBLIQUITY_ARCSEC = 84_381.406;

/** #1373 — {@link J2000_MEAN_OBLIQUITY_ARCSEC} 의 도 단위 (23.4392794…°). */
export const J2000_MEAN_OBLIQUITY_DEG = J2000_MEAN_OBLIQUITY_ARCSEC / 3600;
