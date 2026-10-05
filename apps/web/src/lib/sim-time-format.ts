// #1288 — 시뮬레이션 시각의 표시·입력 변환.
// 시각 모델(JD) 자체는 core `time/julian-date.ts` 가 SSoT 이고, 여기는 UI 문자열 경계만 다룬다.
import { time as timeApi } from '@astro-simulator/core';

/** 시각이 없거나 유한하지 않을 때의 표시 — 기존 `time-utc` 의 미초기화 표기와 같다. */
export const UTC_LABEL_EMPTY = '—';

/** ISO 문자열 끝의 밀리초 — 표시는 초 단위까지만 한다. */
const MILLIS_SUFFIX = /\.\d{3}Z$/;

/**
 * JD → TimeBar UTC 표시 문자열 (#1288 D4).
 *
 * 형식은 세 갈래이며 어느 JD 에도 예외를 던지지 않는다:
 * - 연도 0~9999: `YYYY-MM-DDTHH:mm:ssZ` (종전 형식 그대로)
 * - 그 밖이지만 JS Date 범위(±8.64e15 ms ≈ ±273,790년) 안: ISO 8601 확장 연도 `±YYYYYY-MM-DDTHH:mm:ssZ`
 * - JS Date 범위 밖: `JD <소수 1자리>` — UTC 달력으로 표현할 수 없으므로 JD 를 그대로 보인다
 *
 * 종전 구현은 `toISOString().slice(0, 19)` 였다. 확장 연도는 앞에 3자(`+0`·자릿수)가 붙어
 * 19자 자르기가 초를 잘랐고, Date 범위 밖에서는 `toISOString` 이 RangeError 를 던졌다.
 * 고정 길이 자르기 대신 밀리초 접미만 떼어 두 결함을 함께 없앤다.
 */
export function formatUtcLabel(julianDate: number | null): string {
  if (julianDate === null || !Number.isFinite(julianDate)) return UTC_LABEL_EMPTY;
  const date = timeApi.julianDateToDate(julianDate);
  if (Number.isNaN(date.getTime())) return `JD ${julianDate.toFixed(1)}`;
  return date.toISOString().replace(MILLIS_SUFFIX, 'Z');
}

/**
 * `<input type="datetime-local">` 값 형식 — `YYYY-MM-DDTHH:mm[:ss[.sss]]`.
 * 연도는 HTML 명세상 4자리 **이상**이다 (부호 없음).
 */
const DATETIME_LOCAL_PATTERN =
  /^(\d{4,})-(\d{2})-(\d{2})T(\d{2}):(\d{2})(?::(\d{2})(?:\.(\d{1,3}))?)?$/;

/**
 * `datetime-local` 값을 **UTC 벽시계**로 해석해 ISO 8601 UTC 문자열을 돌려준다 (#1288 D5).
 * 해석할 수 없으면 `null`.
 *
 * `new Date(value)` 는 시간대 표기가 없는 날짜·시각을 **로컬 시간대**로 해석한다 — 라벨이
 * 「UTC 시점」이라고 적힌 입력이 KST 에서 9시간 어긋났다. 성분을 직접 뽑아 UTC 로 조립한다.
 *
 * `Date.UTC` 는 0~99 연도를 1900+ 로 바꾸므로 연도는 `setUTCFullYear` 로 따로 넣는다.
 */
export function datetimeLocalToIsoUtc(value: string): string | null {
  const match = DATETIME_LOCAL_PATTERN.exec(value);
  if (!match) return null;
  const [, year, month, day, hour, minute, second = '0', millis = '0'] = match;
  const date = new Date(0);
  date.setUTCFullYear(Number(year), Number(month) - 1, Number(day));
  date.setUTCHours(Number(hour), Number(minute), Number(second), Number(millis.padEnd(3, '0')));
  // 13월·32일·25시처럼 범위 밖 성분은 Date 가 조용히 이월시킨다 — 왕복이 어긋나면 잘못된 입력이다.
  // Date 범위 밖(±8.64e15 ms)이면 getTime 이 NaN 이다.
  if (
    Number.isNaN(date.getTime()) ||
    date.getUTCMonth() !== Number(month) - 1 ||
    date.getUTCDate() !== Number(day) ||
    date.getUTCHours() !== Number(hour) ||
    date.getUTCMinutes() !== Number(minute) ||
    date.getUTCSeconds() !== Number(second)
  ) {
    return null;
  }
  return date.toISOString();
}
