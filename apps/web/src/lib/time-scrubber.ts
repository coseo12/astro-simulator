// #1288 D6~D8 — 시간 스크러버의 값(연도) ↔ JD 매핑과 범위 판정.
// 시각 모델(JD) 자체는 core `time/julian-date.ts` 가 SSoT 이고, 여기는 스크러버 축 변환만 다룬다.
import { time as timeApi } from '@astro-simulator/core';

/**
 * 스크러버 범위 (UTC 연도, 양 끝 포함) — D6 이동 범위와 D8 배지 경계가 **같은 상수**를 쓴다 (사용자 결정 Q3).
 * 연도 값 `Y` 는 `Y-01-01T00:00:00Z` 를 뜻하므로 상한 `2100` 은 2100년 1월 1일 0시다.
 */
export const SCRUBBER_MIN_YEAR = 1900;
export const SCRUBBER_MAX_YEAR = 2100;

/**
 * 드래그 1칸 (연도). 키보드는 `steppedYearValue` 가 따로 계산한다 (←/→ 1년, Shift+←/→ · PageUp/PageDown 10년).
 * 드래그 해상도는 어차피 픽셀이 정한다 — 200년 축이 트랙 약 246~484px(375·1280 실측)에 놓여 1px ≈ 0.4~0.8년이라,
 * 1년 칸은 픽셀 해상도의 3배 안쪽이다. 연 단위 미만 시점은 상단 날짜 입력이 담당한다.
 */
export const SCRUBBER_STEP_YEARS = 1;

/**
 * 재생 추종 시 썸 값의 양자화 단위 (연도). `useSimStore` 의 `julianDate` 는 매 프레임 바뀌므로 그대로 구독하면
 * 스크러버가 매 프레임 재렌더한다. 이 단위로 반올림한 값만 구독하면 재렌더는 「썸이 움직일 만큼 바뀔 때」로 준다
 * (1d/s → 약 91초에 1회, 1y/s → 초당 4회, 범위 밖 → 0회). 0.25년은 트랙 ≤ 800px 에서 1px 미만이다.
 * 2의 거듭제곱 역수라 반올림 결과가 부동소수 오차 없이 정확하다.
 */
export const SCRUBBER_SYNC_QUANTUM_YEARS = 0.25;

/** 해당 연도 1월 1일 0시(UTC)의 JD. `Date.UTC` 의 0~99 → 1900+ 변환을 피해 `setUTCFullYear` 로 넣는다. */
function startOfYearJulianDate(year: number): number {
  const date = new Date(0);
  date.setUTCFullYear(year, 0, 1);
  date.setUTCHours(0, 0, 0, 0);
  return timeApi.dateToJulianDate(date);
}

export const SCRUBBER_MIN_JD = startOfYearJulianDate(SCRUBBER_MIN_YEAR);
export const SCRUBBER_MAX_JD = startOfYearJulianDate(SCRUBBER_MAX_YEAR);

/**
 * 스크러버 값(소수 연도) → JD.
 *
 * 소수부는 **그 해 달력 길이**에 대한 비율이다 (윤년 366일 · 평년 365일). 그래서 정수 값은 정확히 1월 1일 0시로
 * 떨어지고, 축은 「절대 연도 선형」(사용자 결정 Q3)이되 연 경계에서 달력과 어긋나지 않는다.
 * 값은 범위로 clamp 한다.
 */
export function yearValueToJulianDate(value: number): number {
  const clamped = Math.min(SCRUBBER_MAX_YEAR, Math.max(SCRUBBER_MIN_YEAR, value));
  const year = Math.floor(clamped);
  const start = startOfYearJulianDate(year);
  if (year === clamped) return start;
  const end = startOfYearJulianDate(year + 1);
  return start + (clamped - year) * (end - start);
}

/**
 * JD → 스크러버 값(소수 연도). 범위 밖 JD 는 **끝 값으로 고정**한다 (D7 — 썸 끝 고정).
 *
 * clamp 를 Date 변환보다 **먼저** 한다 — JS Date 범위(±273,790년) 밖 JD 도 Date 를 만들지 않고 끝 값이 된다
 * (PR1 D4 의 극단 시각과 같은 입력에서 예외·NaN 이 없다). `±Infinity` 도 같은 경로로 끝 값이다.
 *
 * @returns `NaN` 이면 `null` (시각을 모른다 — 끝 값으로 위장하지 않는다)
 */
export function julianDateToYearValue(julianDate: number): number | null {
  if (Number.isNaN(julianDate)) return null;
  if (julianDate <= SCRUBBER_MIN_JD) return SCRUBBER_MIN_YEAR;
  if (julianDate >= SCRUBBER_MAX_JD) return SCRUBBER_MAX_YEAR;
  const year = timeApi.julianDateToDate(julianDate).getUTCFullYear();
  const start = startOfYearJulianDate(year);
  const end = startOfYearJulianDate(year + 1);
  return year + (julianDate - start) / (end - start);
}

/**
 * D8 — 시각이 스크러버 범위 [1900, 2100] **밖**인가. 양 끝은 범위 안이다.
 * `NaN` 은 범위 판정 대상이 아니다 (`false`) — 시각을 모를 때 경고를 띄우지 않는다.
 */
export function isOutsideScrubberRange(julianDate: number): boolean {
  return julianDate < SCRUBBER_MIN_JD || julianDate > SCRUBBER_MAX_JD;
}

/** 재생 추종용 양자화 — `SCRUBBER_SYNC_QUANTUM_YEARS` 단위 반올림. */
export function quantizeYearValue(value: number): number {
  return Math.round(value / SCRUBBER_SYNC_QUANTUM_YEARS) * SCRUBBER_SYNC_QUANTUM_YEARS;
}

/** 키보드 큰 이동 배수 — Shift+←/→ · PageUp/PageDown. Radix 기본 배수와 같은 값이다. */
export const SCRUBBER_SKIP_MULTIPLIER = 10;

/**
 * 「정수 연도에 있다」고 볼 오차 (연도) — 약 0.03초. JD ↔ Date ms 왕복의 부동소수 잔차가 1월 1일 0시를
 * 직전 해 `…999.999…` 로 돌려줘도 같은 해 경계로 본다. 그러지 않으면 → 가 제자리에 멈춘다.
 */
const YEAR_SNAP_EPSILON = 1e-9;

/**
 * #1288 리뷰 B1 — 키보드 한 번에 갈 연도. **양자화 전 실제 연도**에서 계산한다.
 *
 * 앞으로는 `floor(y) + n`, 뒤로는 `ceil(y) − n` — 연도 중간에서는 가까운 1월 1일을 첫 칸으로 센다
 * (2026-10-05 → 는 2027-01-01, 2026-04-01 ← 는 2026-01-01). `y` 가 정수면 ±n 이다.
 * Radix 기본 처리는 썸 값(0.25년 양자화) ± step 을 정수에 **반올림**해 소수부 ≥ 0.5 에서 → 가,
 * 0 < 소수부 < 0.5 에서 ← 가 한 해를 건너뛰었다. 결과는 범위로 clamp 한다.
 *
 * @param current 현재 연도 값 (`julianDateToYearValue` 결과 — 범위 밖이면 이미 끝 값)
 * @param direction `1` 앞으로 / `-1` 뒤로
 * @param years 이동 칸 수 (연)
 */
export function steppedYearValue(current: number, direction: 1 | -1, years: number): number {
  const nearest = Math.round(current);
  const y = Math.abs(current - nearest) < YEAR_SNAP_EPSILON ? nearest : current;
  const next = direction > 0 ? Math.floor(y) + years : Math.ceil(y) - years;
  return Math.min(SCRUBBER_MAX_YEAR, Math.max(SCRUBBER_MIN_YEAR, next));
}
