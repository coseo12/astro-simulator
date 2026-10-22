/**
 * #1390 — 투어가 쓰는 지구의 계절 · 근원일점 시각 [JD, TT≈UT 구분 없이 장면 시각]. 계절 투어 (T3) 와 별자리 투어 (T4) 가
 * 함께 쓴다 — 같은 하지 · 동지 값이 두 파일에 따로 있으면 한쪽만 고쳐지는 숨은 상수 drift 가 된다 (volt #69).
 *
 * 출처: USNO Astronomical Applications Dept., 「Earth's Seasons and Apsides」 (API `aa.usno.navy.mil/api/seasons`, 2024 · 2025,
 * 시각 UT — 분 단위):
 * - 2024 Equinox      03-20 03:06 → JD 2460389.6292
 * - 2024 Solstice     06-20 20:51 → JD 2460482.3688
 * - 2024 Aphelion     07-05 05:06 → JD 2460496.7125
 * - 2024 Solstice     12-21 09:20 → JD 2460665.8889
 * - 2025 Perihelion   01-04 13:28 → JD 2460680.0611
 *
 * 사건 파일 (`time-events.json`) 에는 지점 · 분점 · 지구 근원일점 종류가 없어 상수로 둔다 (ADR `20261021-1390` §Visual Fidelity 1
 * — 하드코딩 + 출처. 지구 근일점은 ADR 1347 사용자 결정 K1 (a) 로 사건 종류에서 뺐다). UT → JD 환산은
 * `season-dates.test.ts` 가 core `isoToJulianDate` 로 고정한다 (분 단위 출처라 허용 오차 1e-4 일 ≈ 9 초).
 */

/** 2024 년 3월 분점 (춘분) — 2024-03-20 03:06 UT. */
export const MARCH_EQUINOX_2024_JD = 2460389.6292;
/** 2024 년 6월 지점 (하지) — 2024-06-20 20:51 UT. */
export const JUNE_SOLSTICE_2024_JD = 2460482.3688;
/** 2024 년 원일점 — 2024-07-05 05:06 UT. */
export const APHELION_2024_JD = 2460496.7125;
/** 2024 년 12월 지점 (동지) — 2024-12-21 09:20 UT. */
export const DECEMBER_SOLSTICE_2024_JD = 2460665.8889;
/** 2025 년 근일점 — 2025-01-04 13:28 UT. */
export const PERIHELION_2025_JD = 2460680.0611;
