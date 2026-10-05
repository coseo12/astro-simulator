import { describe, expect, it } from 'vitest';
import { J2000_JD } from '@astro-simulator/shared';
import { time as timeApi } from '@astro-simulator/core';
import {
  SCRUBBER_MAX_JD,
  SCRUBBER_MAX_YEAR,
  SCRUBBER_MIN_JD,
  SCRUBBER_MIN_YEAR,
  SCRUBBER_SYNC_QUANTUM_YEARS,
  isOutsideScrubberRange,
  julianDateToYearValue,
  quantizeYearValue,
  yearValueToJulianDate,
} from './time-scrubber';

/** 1일 (JD 단위) — 경계 안/밖 판정용 오프셋. */
const ONE_DAY = 1;
/** 왕복 허용 오차 (JD) — 1ms. Date 는 ms 정밀도라 그 아래는 의미가 없다. */
const ROUND_TRIP_TOLERANCE_JD = 1 / 86_400_000;

function isoToJd(iso: string): number {
  return timeApi.isoToJulianDate(iso);
}

describe('#1288 D6 — 스크러버 값 ↔ JD 매핑', () => {
  it('양 끝은 1900-01-01 · 2100-01-01 0시(UTC)', () => {
    expect(SCRUBBER_MIN_JD).toBe(isoToJd('1900-01-01T00:00:00Z'));
    expect(SCRUBBER_MAX_JD).toBe(isoToJd('2100-01-01T00:00:00Z'));
    expect(yearValueToJulianDate(SCRUBBER_MIN_YEAR)).toBe(SCRUBBER_MIN_JD);
    expect(yearValueToJulianDate(SCRUBBER_MAX_YEAR)).toBe(SCRUBBER_MAX_JD);
    expect(julianDateToYearValue(SCRUBBER_MIN_JD)).toBe(SCRUBBER_MIN_YEAR);
    expect(julianDateToYearValue(SCRUBBER_MAX_JD)).toBe(SCRUBBER_MAX_YEAR);
  });

  it('중간 — 정수 연도는 그 해 1월 1일 0시', () => {
    expect(yearValueToJulianDate(2000)).toBe(isoToJd('2000-01-01T00:00:00Z'));
    expect(yearValueToJulianDate(2026)).toBe(isoToJd('2026-01-01T00:00:00Z'));
  });

  it('소수부는 그 해 달력 길이 비율 — 윤년 2000 의 0.5 는 366일의 절반(7월 2일 0시)', () => {
    expect(yearValueToJulianDate(2000.5)).toBe(isoToJd('2000-07-02T00:00:00Z'));
    // 평년 2001 의 0.5 는 365일의 절반 = 7월 2일 12시
    expect(yearValueToJulianDate(2001.5)).toBe(isoToJd('2001-07-02T12:00:00Z'));
  });

  it('J2000(2000-01-01T12:00) → 2000 + 0.5/366', () => {
    expect(julianDateToYearValue(J2000_JD)).toBeCloseTo(2000 + 0.5 / 366, 12);
  });

  it.each([1900.25, 1950, 1999.999, 2000.123, 2026.287, 2099.75])('왕복 %s', (value) => {
    const jd = yearValueToJulianDate(value);
    const back = julianDateToYearValue(jd);
    expect(back).not.toBeNull();
    expect(Math.abs(yearValueToJulianDate(back as number) - jd)).toBeLessThan(
      ROUND_TRIP_TOLERANCE_JD,
    );
  });

  it('값 → JD 는 범위로 clamp', () => {
    expect(yearValueToJulianDate(1800)).toBe(SCRUBBER_MIN_JD);
    expect(yearValueToJulianDate(2500)).toBe(SCRUBBER_MAX_JD);
  });
});

describe('#1288 D7 — 범위 밖 JD 는 썸 끝 고정', () => {
  it('하한 밖 → 1900, 상한 밖 → 2100', () => {
    expect(julianDateToYearValue(SCRUBBER_MIN_JD - ONE_DAY)).toBe(SCRUBBER_MIN_YEAR);
    expect(julianDateToYearValue(SCRUBBER_MAX_JD + ONE_DAY)).toBe(SCRUBBER_MAX_YEAR);
  });

  it('JS Date 범위 밖 · 무한대도 예외 없이 끝 값 (PR1 D4 극단 시각과 같은 입력)', () => {
    const TEN_MILLION_YEARS_JD = 365.25 * 10_000_000;
    expect(julianDateToYearValue(J2000_JD - TEN_MILLION_YEARS_JD)).toBe(SCRUBBER_MIN_YEAR);
    expect(julianDateToYearValue(J2000_JD + TEN_MILLION_YEARS_JD)).toBe(SCRUBBER_MAX_YEAR);
    expect(julianDateToYearValue(Number.NEGATIVE_INFINITY)).toBe(SCRUBBER_MIN_YEAR);
    expect(julianDateToYearValue(Number.POSITIVE_INFINITY)).toBe(SCRUBBER_MAX_YEAR);
  });

  it('NaN 은 끝 값으로 위장하지 않는다 (null)', () => {
    expect(julianDateToYearValue(Number.NaN)).toBeNull();
  });
});

describe('#1288 D8 — 범위 밖 판정 (D6 과 같은 경계 상수)', () => {
  it('양 끝은 범위 안', () => {
    expect(isOutsideScrubberRange(SCRUBBER_MIN_JD)).toBe(false);
    expect(isOutsideScrubberRange(SCRUBBER_MAX_JD)).toBe(false);
    expect(isOutsideScrubberRange(J2000_JD)).toBe(false);
  });

  it('경계 바로 밖(1ms)은 범위 밖', () => {
    expect(isOutsideScrubberRange(SCRUBBER_MIN_JD - ROUND_TRIP_TOLERANCE_JD)).toBe(true);
    expect(isOutsideScrubberRange(SCRUBBER_MAX_JD + ROUND_TRIP_TOLERANCE_JD)).toBe(true);
  });

  it('범위 밖 판정과 썸 끝 고정이 같은 경계를 쓴다', () => {
    for (const jd of [SCRUBBER_MIN_JD - ONE_DAY, SCRUBBER_MAX_JD + ONE_DAY]) {
      expect(isOutsideScrubberRange(jd)).toBe(true);
      expect([SCRUBBER_MIN_YEAR, SCRUBBER_MAX_YEAR]).toContain(julianDateToYearValue(jd));
    }
  });

  it('NaN 은 경고하지 않는다', () => {
    expect(isOutsideScrubberRange(Number.NaN)).toBe(false);
  });
});

describe('#1288 D7 — 재생 추종 양자화', () => {
  it('단위 반올림 — 같은 칸 안의 시각은 같은 값 (재렌더 없음)', () => {
    expect(quantizeYearValue(2026.1)).toBe(2026);
    expect(quantizeYearValue(2026.12)).toBe(2026);
    expect(quantizeYearValue(2026.13)).toBe(2026 + SCRUBBER_SYNC_QUANTUM_YEARS);
  });

  it('양 끝은 그대로', () => {
    expect(quantizeYearValue(SCRUBBER_MIN_YEAR)).toBe(SCRUBBER_MIN_YEAR);
    expect(quantizeYearValue(SCRUBBER_MAX_YEAR)).toBe(SCRUBBER_MAX_YEAR);
  });
});
