import { afterEach, describe, expect, it } from 'vitest';
import { J2000_JD } from '@astro-simulator/shared';
import { time as timeApi } from '@astro-simulator/core';
import { datetimeLocalToIsoUtc, formatUtcLabel, UTC_LABEL_EMPTY } from './sim-time-format';

/** Date 가 표현하는 최대 절대 시각 [ms] (ECMAScript 명세 — ±1e8 일). */
const MAX_DATE_MS = 8.64e15;
const DAYS_PER_JULIAN_YEAR = 365.25;
/** 계약 D4 의 경계 — J2000 ±300,000년 (JS Date 범위 ±273,790년 밖). */
const EXTREME_YEARS = 300_000;

const jdOf = (ms: number) => timeApi.dateToJulianDate(new Date(ms));
/**
 * 초 중간(+500 ms) — JD(일 단위 double) 왕복은 이 크기에서 ms 미만 오차가 나고 `Date` 가 ms 를 버림하므로,
 * 정각 입력은 1초 앞으로 떨어질 수 있다 (`…:59.000` → `…:58.999…`). 표시 형식을 재는 테스트라 왕복 오차를 피한다.
 */
const MID_SECOND_MS = 500;

describe('formatUtcLabel (#1288 D4)', () => {
  it('일반 시각 — 종전 형식 YYYY-MM-DDTHH:mm:ssZ 유지', () => {
    expect(formatUtcLabel(J2000_JD)).toBe('2000-01-01T12:00:00Z');
  });

  it('연도 9999 마지막 초 — 4자리 연도 형식', () => {
    expect(formatUtcLabel(jdOf(Date.UTC(9999, 11, 31, 23, 59, 59, MID_SECOND_MS)))).toBe(
      '9999-12-31T23:59:59Z',
    );
  });

  // 경계 JD 1 — 연도 > 9999. 종전 `slice(0, 19)` 는 확장 연도 접두 3자 때문에 초를 잘랐다.
  it('연도 10000 — ISO 확장 연도, 초 보존', () => {
    const ms = new Date(0).setUTCFullYear(10_000, 0, 1) + 30_000 + MID_SECOND_MS;
    expect(formatUtcLabel(jdOf(ms))).toBe('+010000-01-01T00:00:30Z');
  });

  it('JS Date 최대 시각 — 확장 연도 형식', () => {
    expect(formatUtcLabel(jdOf(MAX_DATE_MS))).toBe('+275760-09-13T00:00:00Z');
  });

  // 경계 JD 2·3 — JS Date 범위 밖 (종전 구현은 toISOString RangeError).
  it.each([
    ['J2000 + 300,000년', J2000_JD + EXTREME_YEARS * DAYS_PER_JULIAN_YEAR],
    ['J2000 − 300,000년', J2000_JD - EXTREME_YEARS * DAYS_PER_JULIAN_YEAR],
  ])('%s — 예외 없이 JD 형식', (_label, jd) => {
    expect(() => timeApi.julianDateToIso(jd)).toThrow(RangeError); // 종전 경로가 실제로 터지는 입력인지 대조
    expect(formatUtcLabel(jd)).toBe(`JD ${jd.toFixed(1)}`);
  });

  it('null · NaN · Infinity — 미초기화 표기', () => {
    expect(formatUtcLabel(null)).toBe(UTC_LABEL_EMPTY);
    expect(formatUtcLabel(Number.NaN)).toBe(UTC_LABEL_EMPTY);
    expect(formatUtcLabel(Number.POSITIVE_INFINITY)).toBe(UTC_LABEL_EMPTY);
  });
});

describe('datetimeLocalToIsoUtc (#1288 D5)', () => {
  const originalTz = process.env.TZ;
  afterEach(() => {
    process.env.TZ = originalTz;
  });

  // 시간대 2종 — 서울(+9)·로스앤젤레스(4월 −7). 양성 대조: 같은 입력을 종전 `new Date(value)` 로 해석하면
  // 두 시간대의 결과가 실제로 갈려야 한다 (시간대 전환이 이 실행에서 먹지 않으면 테스트가 공허해진다).
  it.each(['Asia/Seoul', 'America/Los_Angeles'])('TZ=%s 에서도 UTC 로 해석', (tz) => {
    process.env.TZ = tz;
    const legacyIso = new Date('2026-04-14T00:00').toISOString();
    expect(legacyIso).not.toBe('2026-04-14T00:00:00.000Z');
    expect(datetimeLocalToIsoUtc('2026-04-14T00:00')).toBe('2026-04-14T00:00:00.000Z');
  });

  it('초·밀리초 포함 입력', () => {
    expect(datetimeLocalToIsoUtc('2026-04-14T09:30:15')).toBe('2026-04-14T09:30:15.000Z');
    expect(datetimeLocalToIsoUtc('2026-04-14T09:30:15.5')).toBe('2026-04-14T09:30:15.500Z');
  });

  it('0~99 연도 — 1900 년대로 바뀌지 않음', () => {
    expect(datetimeLocalToIsoUtc('0050-06-01T00:00')).toBe('0050-06-01T00:00:00.000Z');
  });

  it('5자리 연도 — ISO 확장 연도', () => {
    expect(datetimeLocalToIsoUtc('12345-01-01T00:00')).toBe('+012345-01-01T00:00:00.000Z');
  });

  it.each(['', 'abc', '2026-13-01T00:00', '2026-02-30T00:00', '2026-04-14T25:00', '2026-04-14'])(
    '해석 불가 입력 %j → null',
    (value) => {
      expect(datetimeLocalToIsoUtc(value)).toBeNull();
    },
  );

  it('JS Date 범위 밖 연도 → null', () => {
    expect(datetimeLocalToIsoUtc('300000-01-01T00:00')).toBeNull();
  });
});
