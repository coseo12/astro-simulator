/**
 * #1370 — 장면 시계 (UTC) ↔ 역학시 (TT) 변환. ADR `docs/decisions/20261023-1370-delta-t-dynamical-time.md` §결정 M · P.
 *
 * ## 규약 (주석 계약)
 *
 * - 물리 함수 (`positionAt` · `elementsAt` · `parentRelativePositionAt` · `resolveBodyChainPosition` · `heliocentricPositionAt` ·
 *   `buildInitialState` · `syzygyTimes` · `eclipseEvents` · `greatestEclipseNear` · `perihelionTimes` ·
 *   `heliocentricAlignmentTimes` · 소행성대 · 궤적 샘플러) 의 시각 인자는 **TT JD** 다. 요소 epoch · 율이 역학시 기준이기 때문이다.
 * - 장면 시계 JD (`TimeController` · store · URL `t` · 화면 표시 · 사건 파일 — `dateToJulianDate` 의 UTC 해석) 는
 *   **진입점에서 정확히 한 번** TT 로 바뀐다. 진입점은 셋이다: 장면 `updateAt` · `computeEventsForKind` · web `resolveBodyChain`.
 *   물리 함수끼리는 서로 부르므로, 변환을 물리 함수 안에 두면 이중 변환이 생긴다 (ADR 축 P2 기각 사유).
 * - 자전 (`computeSpinQuaternion` — 지구 ERA 포함) · 구름 드리프트 (`applyCloudDrift`) 는 **시계 JD** 를 쓴다 (시계 ≈ UT1,
 *   `|UT1 − UTC| < 0.9 s`).
 *
 * TT 는 TDB 와 같은 값으로 쓴다 (차 `< 2 ms` — ADR §비-범위).
 */
import { J2000_JD, JULIAN_YEAR_SECONDS } from '@astro-simulator/shared';
import { MILLIS_PER_DAY, UNIX_EPOCH_JD } from './julian-date.js';

const SECONDS_PER_DAY = MILLIS_PER_DAY / 1000;
/** 율리우스년 [일] — J2000.0 기준 연속 소수 연도 식의 분모 (ADR §결정 M · §교차검증 기각 `365.2425`). */
const DAYS_PER_JULIAN_YEAR = JULIAN_YEAR_SECONDS / SECONDS_PER_DAY;

/** TT − TAI [s] — 정의값. */
const TT_MINUS_TAI_SECONDS = 32.184;

/**
 * 윤초 표 — `[UTC 날짜 (그날 00:00:00Z 부터 유효), TAI − UTC [s]]`.
 *
 * 출처: IERS Bulletin C 를 옮긴 IANA `https://data.iana.org/time-zones/tzdb/leap-seconds.list` (조회 2026-10-23).
 * 28행 (1972-01-01 `10 s` ~ 2017-01-01 `37 s`). **파일 만료일 2027-06-28** — 그 전까지 새 윤초가 없다는 IERS 공지다.
 * 새 윤초가 공지되면 1행을 더하고 사건 파일을 재생성한다 (ADR 재검토 조건 1).
 */
const LEAP_SECOND_TABLE: ReadonlyArray<readonly [isoDate: string, taiMinusUtc: number]> = [
  ['1972-01-01', 10],
  ['1972-07-01', 11],
  ['1973-01-01', 12],
  ['1974-01-01', 13],
  ['1975-01-01', 14],
  ['1976-01-01', 15],
  ['1977-01-01', 16],
  ['1978-01-01', 17],
  ['1979-01-01', 18],
  ['1980-01-01', 19],
  ['1981-07-01', 20],
  ['1982-07-01', 21],
  ['1983-07-01', 22],
  ['1985-07-01', 23],
  ['1988-01-01', 24],
  ['1990-01-01', 25],
  ['1991-01-01', 26],
  ['1992-07-01', 27],
  ['1993-07-01', 28],
  ['1994-07-01', 29],
  ['1996-01-01', 30],
  ['1997-07-01', 31],
  ['1999-01-01', 32],
  ['2006-01-01', 33],
  ['2009-01-01', 34],
  ['2012-07-01', 35],
  ['2015-07-01', 36],
  ['2017-01-01', 37],
];

/** 윤초 표 행의 시작 시계 JD (오름차순) — 위 표에서 한 번 만든다. */
const LEAP_SECOND_START_JDS: readonly number[] = LEAP_SECOND_TABLE.map(
  ([isoDate]) => UNIX_EPOCH_JD + Date.parse(`${isoDate}T00:00:00Z`) / MILLIS_PER_DAY,
);

/**
 * 윤초 표 첫 행 (1972-01-01T00:00:00Z) 의 시계 JD = `2441317.5`. 이 값 **이상**이면 윤초 표, 미만이면 Espenak–Meeus 다항식이다.
 * 경계 바로 아래 · 위 값은 `42.2505 → 42.1840 s` (`−0.0665 s` — ADR §결정 M 이음매).
 */
export const LEAP_SECOND_TABLE_START_JD = LEAP_SECOND_START_JDS[0]!;

/** 소수 연도 하한 — 1900 이전은 1900.0 값 (`−2.79 s`) 으로 고정한다 (ADR Q3). */
const EM_MIN_YEAR = 1900;

/**
 * Espenak–Meeus ΔT 다항식 [s] (1900 ≤ y < 1972 에서만 부른다).
 *
 * 출처: NASA GSFC `https://eclipse.gsfc.nasa.gov/SEhelp/deltatpoly2004.html` (조회 2026-10-23) — Espenak & Meeus,
 * *Five Millennium Canon of Solar Eclipses*, NASA/TP-2006-214141. 값의 원 출처 Morrison & Stephenson 2004.
 * 구간 경계는 원문 그대로이고, 원문 다항식 자체가 경계에서 `1920 +0.0124 s` · `1941 +0.0009 s` · `1961 +0.0296 s` 만큼 끊긴다.
 */
function espenakMeeusSeconds(y: number): number {
  if (y < 1920) {
    const t = y - 1900;
    return -2.79 + 1.494119 * t - 0.0598939 * t ** 2 + 0.0061966 * t ** 3 - 0.000197 * t ** 4;
  }
  if (y < 1941) {
    const t = y - 1920;
    return 21.2 + 0.84493 * t - 0.0761 * t ** 2 + 0.0020936 * t ** 3;
  }
  if (y < 1961) {
    const t = y - 1950;
    return 29.07 + 0.407 * t - t ** 2 / 233 + t ** 3 / 2547;
  }
  const t = y - 1975;
  return 45.45 + 1.067 * t - t ** 2 / 260 - t ** 3 / 718;
}

/**
 * TT − 장면 시계 [s].
 *
 * - `clockJd >= 2441317.5` (1972-01-01T00:00:00Z) → `32.184 + (TAI − UTC)`. 표 행 경계도 `>=` 로 판정한다. 2017-01-01 이후 =
 *   `69.184` (표 이후 상수 — ADR Q2 F1).
 * - 그 미만 → Espenak–Meeus. 소수 연도는 `y = 2000 + (clockJd − 2451545.0) / 365.25` (율리우스년 연속식 — 원문의 월 중순 계단
 *   `y = 연 + (월 − 0.5)/12` 와 같은 달 안 ΔT 차 최대 `0.067 s`). `y < 1900` 은 1900 으로 고정 (ADR Q3).
 * - `NaN` 은 `NaN`, `±Infinity` 는 각 끝 구간 값 (`+Infinity` → `69.184`, `−Infinity` → 1900.0 값).
 */
export function ttMinusClockSeconds(clockJd: number): number {
  if (clockJd >= LEAP_SECOND_TABLE_START_JD) {
    // 표는 28행이라 선형 탐색으로 충분하다 — 뒤에서부터 찾으면 현재 근방 (2017 이후) 은 1회 비교로 끝난다.
    for (let i = LEAP_SECOND_START_JDS.length - 1; i >= 0; i -= 1) {
      if (clockJd >= LEAP_SECOND_START_JDS[i]!)
        return TT_MINUS_TAI_SECONDS + LEAP_SECOND_TABLE[i]![1];
    }
  }
  if (Number.isNaN(clockJd)) return Number.NaN;
  const y = Math.max(EM_MIN_YEAR, 2000 + (clockJd - J2000_JD) / DAYS_PER_JULIAN_YEAR);
  return espenakMeeusSeconds(y);
}

/** 장면 시계 JD → TT JD. */
export function clockJdToTt(clockJd: number): number {
  return clockJd + ttMinusClockSeconds(clockJd) / SECONDS_PER_DAY;
}

/**
 * 역변환 고정점 반복 횟수 — 수렴 판정 · `while` 을 쓰지 않는다 (ADR §결정 M). 3회면 1900~2100 을 7.3일 간격으로 돈 왕복 오차가
 * `0 s` 다 (ADR §결정 M 실측 · #1370 PR 재측정 10,007 표본 — macOS · Node 24.14.0). 횟수가 고정이라 무한 루프가 없고 결과가 결정적이다.
 */
const INVERSE_ITERATIONS = 3;

/**
 * TT JD → 장면 시계 JD. `c ← ttJd − ttMinusClockSeconds(c) / 86400` 를 고정 3회.
 *
 * 윤초 직후 역상이 없는 TT `1 s` 구간 (`[L + 68.184 s, L + 69.184 s)`, `L` = 윤초 시작) 에서는 반복이 두 값 사이를 진동하지만,
 * 횟수가 고정이라 같은 입력에 같은 출력이고 경계에서 `1 s` 안이다.
 */
export function ttJdToClock(ttJd: number): number {
  let clockJd = ttJd;
  for (let i = 0; i < INVERSE_ITERATIONS; i += 1) {
    clockJd = ttJd - ttMinusClockSeconds(clockJd) / SECONDS_PER_DAY;
  }
  return clockJd;
}
