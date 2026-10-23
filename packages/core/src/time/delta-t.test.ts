import { describe, expect, it } from 'vitest';
import {
  clockJdToTt,
  LEAP_SECOND_TABLE_START_JD,
  ttJdToClock,
  ttMinusClockSeconds,
} from './delta-t.js';
import { isoToJulianDate } from './julian-date.js';

// #1370 — ADR `docs/decisions/20261023-1370-delta-t-dynamical-time.md` DoD D2.

const SECONDS_PER_DAY = 86_400;
/** 1972-01-01T00:00:00Z 의 시계 JD — 윤초 표 첫 행 (ADR §결정 M). */
const JD_1972 = 2_441_317.5;
const JD_2017 = isoToJulianDate('2017-01-01T00:00:00Z');
/** 이음매 바로 아래 · 위 표본 간격 [일] (`1e-6` 일 ≈ 0.086 s). */
const SEAM_EPSILON_DAYS = 1e-6;
/** 왕복 허용 오차 [s] (DoD D2). */
const ROUND_TRIP_TOLERANCE_SECONDS = 1e-6;
/** 왕복 표본 간격 [일] — ADR 실측과 같은 7.3일. */
const ROUND_TRIP_STEP_DAYS = 7.3;
/**
 * 변환 부호 단언 허용 [s] — JD `~2.46e6` 근처 배정밀도 1 ulp 는 `2^-31` 일 (`≈ 4.0e-5 s`) 이다. 부호가 뒤집히면 차는 `~138 s` 다.
 */
const JD_ULP_SECONDS = 2 ** -31 * SECONDS_PER_DAY;

/**
 * 윤초 표 기대값 — IERS Bulletin C (IANA `leap-seconds.list`, 조회 2026-10-23) 28행을 모듈과 **독립으로** 옮겨 적었다.
 * `[그날 00:00:00Z 부터, TAI − UTC [s]]`. 모듈 표의 한 행이라도 바뀌면 아래 전수 테스트가 FAIL 한다.
 */
const EXPECTED_LEAP_SECONDS: ReadonlyArray<readonly [string, number]> = [
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

/** 소수 연도 y 의 시계 JD (ADR 연속식의 역). */
function clockJdOfYear(y: number): number {
  return 2_451_545.0 + (y - 2000) * 365.25;
}

describe('ttMinusClockSeconds — 정의값 (DoD D2)', () => {
  it.each([
    ['2024-04-08T18:17:20Z', 69.184],
    ['2016-12-31T23:59:59Z', 68.184],
    ['2017-01-01T00:00:00Z', 69.184],
    ['1972-01-01T00:00:00Z', 42.184],
    ['2100-01-01T00:00:00Z', 69.184],
  ])('%s → %f s', (iso, expected) => {
    expect(ttMinusClockSeconds(isoToJulianDate(iso))).toBeCloseTo(expected, 9);
  });

  it('1900-01-01 → −2.79 ± 0.01 s (E–M 1900 구간 시작)', () => {
    expect(
      Math.abs(ttMinusClockSeconds(isoToJulianDate('1900-01-01T00:00:00Z')) - -2.79),
    ).toBeLessThan(0.01);
  });

  it('1900 이전은 1900.0 값으로 고정 (Q3)', () => {
    const at1900 = ttMinusClockSeconds(clockJdOfYear(1900));
    expect(ttMinusClockSeconds(clockJdOfYear(1850))).toBe(at1900);
    expect(ttMinusClockSeconds(clockJdOfYear(1000))).toBe(at1900);
  });

  it('윤초 표 28행 전수 — 각 행 시작 순간 = 32.184 + TAI−UTC, 1초 전 = 직전 행 값 (행 경계 `>=`)', () => {
    expect(EXPECTED_LEAP_SECONDS).toHaveLength(28);
    expect(LEAP_SECOND_TABLE_START_JD).toBe(JD_1972);
    for (const [i, [isoDate, taiMinusUtc]] of EXPECTED_LEAP_SECONDS.entries()) {
      const start = isoToJulianDate(`${isoDate}T00:00:00Z`);
      expect(ttMinusClockSeconds(start), isoDate).toBeCloseTo(32.184 + taiMinusUtc, 9);
      // 첫 행 1초 전은 E–M 구간이라 제외 (이음매 테스트가 덮는다).
      if (i > 0) {
        const before = ttMinusClockSeconds(start - 1 / SECONDS_PER_DAY);
        expect(before, `${isoDate} − 1 s`).toBeCloseTo(
          32.184 + EXPECTED_LEAP_SECONDS[i - 1]![1],
          9,
        );
      }
    }
  });
});

describe('ttMinusClockSeconds — 이음매 연속성 (ADR §결정 M 수치)', () => {
  /** 경계 위 값 − 아래 값 [s]. */
  const jump = (jd: number) =>
    ttMinusClockSeconds(jd + SEAM_EPSILON_DAYS) - ttMinusClockSeconds(jd - SEAM_EPSILON_DAYS);

  it.each([
    ['1920 E–M 구간', clockJdOfYear(1920), 0.0124],
    ['1941 E–M 구간', clockJdOfYear(1941), 0.0009],
    ['1961 E–M 구간', clockJdOfYear(1961), 0.0296],
    ['1972 E–M → 윤초 표', JD_1972, -0.0665],
  ])('%s 이음매 ≈ %f s', (_label, jd, expected) => {
    expect(Math.abs(jump(jd) - expected)).toBeLessThan(5e-4);
  });

  it('1972 이음매 양쪽 값 — 42.2505 → 42.1840 s', () => {
    expect(ttMinusClockSeconds(JD_1972 - SEAM_EPSILON_DAYS)).toBeCloseTo(42.2505, 3);
    expect(ttMinusClockSeconds(JD_1972)).toBeCloseTo(42.184, 9);
  });

  it('E–M 구간 이음매는 모두 0.07 s 미만 (윤초 계단 +1 s 는 정의상 제외)', () => {
    for (const jd of [clockJdOfYear(1920), clockJdOfYear(1941), clockJdOfYear(1961), JD_1972]) {
      expect(Math.abs(jump(jd))).toBeLessThan(0.07);
    }
  });
});

describe('변환 부호 — 시계 → TT 는 ΔT 를 더하고, TT → 시계는 뺀다', () => {
  it.each([
    ['2024-04-08T18:17:20Z', 69.184],
    ['1990-06-01T00:00:00Z', 57.184],
  ])('%s — clockJdToTt(t) − t = +ΔT · ttJdToClock(t) − t = −ΔT (1 ulp 안)', (iso, deltaT) => {
    const t = isoToJulianDate(iso);
    expect(Math.abs((clockJdToTt(t) - t) * SECONDS_PER_DAY - deltaT)).toBeLessThanOrEqual(
      JD_ULP_SECONDS,
    );
    expect(Math.abs((ttJdToClock(t) - t) * SECONDS_PER_DAY + deltaT)).toBeLessThanOrEqual(
      JD_ULP_SECONDS,
    );
  });
});

describe('ttJdToClock — 역변환 (고정 3회)', () => {
  it('1900~2100 왕복 오차 ≤ 1e-6 s (7.3일 간격)', () => {
    const start = isoToJulianDate('1900-01-01T00:00:00Z');
    const end = isoToJulianDate('2100-01-01T00:00:00Z');
    let maxErrorSeconds = 0;
    let samples = 0;
    for (let t = start; t < end; t += ROUND_TRIP_STEP_DAYS) {
      const err = Math.abs(ttJdToClock(clockJdToTt(t)) - t) * SECONDS_PER_DAY;
      maxErrorSeconds = Math.max(maxErrorSeconds, err);
      samples += 1;
    }
    // 표본이 비면 최대 오차 0 으로 공허 통과한다 — 표본 수를 함께 단언한다.
    expect(samples).toBeGreaterThan(9_000);
    expect(maxErrorSeconds).toBeLessThanOrEqual(ROUND_TRIP_TOLERANCE_SECONDS);
  });

  it('마지막 윤초 경계 ±2 s 안 (경계 직후 1 s 제외) 도 왕복 오차 ≤ 1e-6 s', () => {
    for (const dtSec of [-2, -1, -0.5, 1, 1.5, 2]) {
      const t = JD_2017 + dtSec / SECONDS_PER_DAY;
      expect(Math.abs(ttJdToClock(clockJdToTt(t)) - t) * SECONDS_PER_DAY).toBeLessThanOrEqual(
        ROUND_TRIP_TOLERANCE_SECONDS,
      );
    }
  });

  it('윤초 직후 역상이 없는 TT 구간 — 결과는 결정적이고 경계에서 1 s 안 (L + 69.0 s → L − 0.184 s)', () => {
    const tt = JD_2017 + 69.0 / SECONDS_PER_DAY;
    const first = ttJdToClock(tt);
    expect(ttJdToClock(tt)).toBe(first);
    expect(Math.abs((first - JD_2017) * SECONDS_PER_DAY - -0.184)).toBeLessThan(1e-3);
  });

  it('NaN · ±Infinity 는 그대로 전파된다 (반복 횟수 고정 — 무한 루프 없음)', () => {
    expect(ttMinusClockSeconds(Number.NaN)).toBeNaN();
    expect(clockJdToTt(Number.NaN)).toBeNaN();
    expect(ttJdToClock(Number.NaN)).toBeNaN();
    expect(clockJdToTt(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(clockJdToTt(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
    expect(ttJdToClock(Number.POSITIVE_INFINITY)).toBe(Number.POSITIVE_INFINITY);
    expect(ttJdToClock(Number.NEGATIVE_INFINITY)).toBe(Number.NEGATIVE_INFINITY);
  });
});
