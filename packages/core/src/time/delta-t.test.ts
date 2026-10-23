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
/** 이음매 바로 아래 · 위 표본 간격 [일] (`1e-6` 일 ≈ 0.086 s — ΔT 다항식 기울기 `~1 s/년` 이라 그 사이 변화는 `~3e-9 s`). */
const SEAM_EPSILON_DAYS = 1e-6;
/** 왕복 허용 오차 [s] (DoD D2). */
const ROUND_TRIP_TOLERANCE_SECONDS = 1e-6;
/** 왕복 표본 간격 [일] — ADR 실측과 같은 7.3일. */
const ROUND_TRIP_STEP_DAYS = 7.3;

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

  it('윤초 표 28행 — 행 경계는 `>=` (경계 순간부터 새 값)', () => {
    expect(LEAP_SECOND_TABLE_START_JD).toBe(JD_1972);
    expect(ttMinusClockSeconds(isoToJulianDate('1972-06-30T23:59:59Z'))).toBeCloseTo(42.184, 9);
    expect(ttMinusClockSeconds(isoToJulianDate('1972-07-01T00:00:00Z'))).toBeCloseTo(43.184, 9);
    expect(ttMinusClockSeconds(isoToJulianDate('1999-01-01T00:00:00Z'))).toBeCloseTo(64.184, 9);
    expect(ttMinusClockSeconds(isoToJulianDate('2015-07-01T00:00:00Z'))).toBeCloseTo(68.184, 9);
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
