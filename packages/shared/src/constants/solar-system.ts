/**
 * 태양계 기본 질량/반경 (참고용 상수).
 * 정밀한 궤도 요소는 JPL Horizons 스냅샷 (C1, #13)에서 로드한다.
 * P10-B-2 #274: IAU 2015 Resolution B3 nominal values + ±0.01% 공차 감사.
 * radius 규약: near-spherical body 는 IAU 2015 equatorial (solar-system.json 과 일치).
 */

/** 태양 질량 [kg] — IAU 2015 Resolution B3 §1 M_sun_N */
export const SOLAR_MASS = 1.98892e30;

/** 태양 반경 [m] — IAU 2015 Resolution B3 §1 R_sun_N (equatorial) */
export const SOLAR_RADIUS = 6.957e8;

/** 지구 질량 [kg] — IAU 2015 Resolution B3 §2 M_earth_N */
export const EARTH_MASS = 5.972_2e24;

/** 지구 반경 [m] — WGS84 equatorial (IAU B3 6.3781e6 과 공차 내 일치) */
export const EARTH_RADIUS = 6.378_137e6;

/** 목성 질량 [kg] — IAU 2015 Resolution B3 §3 M_jupiter_N */
export const JUPITER_MASS = 1.898_13e27;

/** 목성 반경 [m] — IAU 2015 Resolution B3 §3 R_jupiter_N (equatorial) */
export const JUPITER_RADIUS = 7.149_2e7;
