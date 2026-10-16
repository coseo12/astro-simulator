/**
 * 태양계 기본 질량/반경 (참고용 상수).
 * 정밀한 궤도 요소는 JPL Horizons 스냅샷 (C1, #13)에서 로드한다.
 * P10-B-2 #274: IAU 2015 Resolution B3 nominal values + ±0.01% 공차 감사.
 * radius 규약: near-spherical body 는 IAU 2015 equatorial (solar-system.json 과 일치).
 */

import { GRAVITATIONAL_CONSTANT } from './physics.js';

/**
 * 태양 중력 파라미터 GM [m^3/s^2] — IAU 2015 Resolution B3 nominal solar mass parameter
 * `(GM)☉N = 1.3271244e20` (정확값). JPL Horizons 태양 (DE441) `GM = 132712440041.93938 km^3/s^2` 와
 * 상대오차 `−3.2e-10` (2026-10-16 조회).
 */
export const SOLAR_GM = 1.3271244e20;

/**
 * 태양 질량 [kg] = `SOLAR_GM / G` (#1349).
 *
 * 궤도 운동이 정하는 것은 GM 이고 질량은 G 로 나눈 파생값이다. 이전 값 `1.98892e30` 은 G 를 CODATA 2018
 * (`6.67430e-11`) 로 쓰면서 곱이 `1.32746e20` 이 되어 IAU GM 보다 `0.02566 %` 컸다 (`1.3271244e20 / 1.98892e30`
 * = `6.67259e-11` — 다른 G 값에 해당하는 질량). 그 차이가 J2000 에서 멀어질수록 행성 위상 오차로 누적됐다
 * (2026-10-16 지구 황경 `+1.19°`). `solar-system.json` sun `mass` 는 이 값과 같은 리터럴이다
 * (`kepler.test.ts` 가 동일성을 검사한다).
 */
export const SOLAR_MASS = SOLAR_GM / GRAVITATIONAL_CONSTANT;

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
