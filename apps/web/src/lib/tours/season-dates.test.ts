import { time as timeApi } from '@astro-simulator/core';
import { describe, expect, it } from 'vitest';
import {
  APHELION_2024_JD,
  DECEMBER_SOLSTICE_2024_JD,
  JUNE_SOLSTICE_2024_JD,
  MARCH_EQUINOX_2024_JD,
  PERIHELION_2025_JD,
} from './season-dates';

/** 출처 (USNO) 가 분 단위라 상수는 소수 4자리 일 — 반올림 오차 상한 0.5e-4 일 (≈ 4 초). */
const JD_TOLERANCE_DAYS = 1e-4;

describe('season-dates — USNO UT 시각 → JD 환산', () => {
  it.each([
    ['2024-03-20T03:06:00Z', MARCH_EQUINOX_2024_JD],
    ['2024-06-20T20:51:00Z', JUNE_SOLSTICE_2024_JD],
    ['2024-07-05T05:06:00Z', APHELION_2024_JD],
    ['2024-12-21T09:20:00Z', DECEMBER_SOLSTICE_2024_JD],
    ['2025-01-04T13:28:00Z', PERIHELION_2025_JD],
  ])('%s', (iso, jd) => {
    expect(Math.abs(timeApi.isoToJulianDate(iso) - jd)).toBeLessThan(JD_TOLERANCE_DAYS);
  });
});
