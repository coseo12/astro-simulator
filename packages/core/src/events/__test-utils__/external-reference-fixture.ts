import type { EventKindId } from '../event-kinds.js';

/**
 * #1347 DoD M3 — 사건 시각 외부 기준값 (ADR `docs/decisions/20261016-1347-event-markers.md` 1-A 와 같은 표본 · 같은 방법).
 * 테스트는 네트워크를 쓰지 않는다 — 기준 JD 를 여기 박제한다.
 *
 * ## 조회 조건 (2026-10-16 재조회 — JPL Horizons API `https://ssd.jpl.nasa.gov/api/horizons.api`)
 *
 * 공통: `EPHEM_TYPE='VECTORS'` · `CENTER='500@10'` · `REF_PLANE='ECLIPTIC'` · `REF_SYSTEM='J2000'` · `VEC_CORR='NONE'` ·
 * `VEC_TABLE='1'` · `OUT_UNITS='AU-D'`. 시각은 TDB (`JDTDB`).
 *
 * - **충 · 내합** — 지구 `COMMAND='399'` 와 `'499'` (화성) · `'299'` (금성) · `'599'` (목성) · `'699'` (토성) 를 모델 사건 시각
 *   (정수 JD 반올림) ±15일, `STEP_SIZE='1h'` 로 받아 일심 황경차 `atan2(y, x)` 의 같은 쪽 부호 변화를 선형 보간했다.
 * - **혜성 근일점** — 핼리 `COMMAND='DES=1P;CAP<1987;NOFRAG'` · 스위프트-터틀 `'DES=109P;CAP<1993;NOFRAG'`. 모델 시각 ±60일 6시간
 *   간격에서 일심 거리 최솟값을 찾고, 그 주변 ±2일 30분 간격 3점 포물선 보간.
 * - `source` = 응답의 `Target body name … {source: …}` (충 · 내합은 지구 행도 함께).
 *
 * ## 방법 검산
 *
 * 같은 기준값으로 교정 전 μ (`G × 1.98892e30`) 모델을 다시 돌리면 ADR 1-A 의 오차 31개가 소수 2자리까지 전부 같다 — 표본 ·
 * 기준값 · 방법이 ADR 과 같다는 확인이다.
 *
 * ## `recordedErrorDays`
 *
 * `모델 − 기준` (일) — #1349 (태양 GM IAU 교정) 머지 후 develop `76ed1d71` 에서 잰 값. DoD M3 (ii) 는 표본마다
 * `|오차 − recordedErrorDays| ≤ 0.2` 일을 요구한다. 모델 시각은 UTC 해석 JD, 기준은 TDB 라 그 차 (ΔT, 이 범위에서 분 단위) 가
 * 섞여 있다 — 일 단위 판정에는 영향이 없다 (ADR 1-A).
 */
export interface ExternalReferenceSample {
  kind: EventKindId;
  /** 사건이 든 해 (UTC) — 모델 사건 목록에서 그 해의 사건 하나를 고른다. */
  year: number;
  referenceJd: number;
  recordedErrorDays: number;
  source: string;
}

export const EXTERNAL_REFERENCE_SAMPLES: readonly ExternalReferenceSample[] = [
  {
    kind: 'mars-opposition',
    year: 1909,
    referenceJd: 2418573.91879,
    recordedErrorDays: 0.403,
    source: 'mar099 · 지구 DE441',
  },
  {
    kind: 'mars-opposition',
    year: 1924,
    referenceJd: 2424021.20552,
    recordedErrorDays: 0.311,
    source: 'mar099 · 지구 DE441',
  },
  {
    kind: 'mars-opposition',
    year: 1956,
    referenceJd: 2435727.41101,
    recordedErrorDays: 0.201,
    source: 'mar099 · 지구 DE441',
  },
  {
    kind: 'mars-opposition',
    year: 1971,
    referenceJd: 2441173.78244,
    recordedErrorDays: 0.118,
    source: 'mar099 · 지구 DE441',
  },
  {
    kind: 'mars-opposition',
    year: 2003,
    referenceJd: 2452880.24482,
    recordedErrorDays: -0.014,
    source: 'mar099 · 지구 DE441',
  },
  {
    kind: 'mars-opposition',
    year: 2018,
    referenceJd: 2458326.71318,
    recordedErrorDays: -0.071,
    source: 'mar099 · 지구 DE441',
  },
  {
    kind: 'mars-opposition',
    year: 2020,
    referenceJd: 2459136.47209,
    recordedErrorDays: -0.079,
    source: 'mar099 · 지구 DE441',
  },
  {
    kind: 'mars-opposition',
    year: 2035,
    referenceJd: 2464586.31415,
    recordedErrorDays: -0.12,
    source: 'mar099 · 지구 DE441',
  },
  {
    kind: 'mars-opposition',
    year: 2050,
    referenceJd: 2470032.82292,
    recordedErrorDays: -0.222,
    source: 'mar099 · 지구 DE441',
  },
  {
    kind: 'mars-opposition',
    year: 2099,
    referenceJd: 2487994.83435,
    recordedErrorDays: -0.374,
    source: 'mar099 · 지구 DE441',
  },
  {
    kind: 'venus-inferior-conjunction',
    year: 1906,
    referenceJd: 2417544.71686,
    recordedErrorDays: -0.473,
    source: 'DE441 · 지구 DE441',
  },
  {
    kind: 'venus-inferior-conjunction',
    year: 1950,
    referenceJd: 2433312.77383,
    recordedErrorDays: -0.248,
    source: 'DE441 · 지구 DE441',
  },
  {
    kind: 'venus-inferior-conjunction',
    year: 2004,
    referenceJd: 2453164.85981,
    recordedErrorDays: 0.025,
    source: 'DE441 · 지구 DE441',
  },
  {
    kind: 'venus-inferior-conjunction',
    year: 2012,
    referenceJd: 2456084.54447,
    recordedErrorDays: 0.061,
    source: 'DE441 · 지구 DE441',
  },
  {
    kind: 'venus-inferior-conjunction',
    year: 2020,
    referenceJd: 2459004.23524,
    recordedErrorDays: 0.09,
    source: 'DE441 · 지구 DE441',
  },
  {
    kind: 'venus-inferior-conjunction',
    year: 2050,
    referenceJd: 2470096.33192,
    recordedErrorDays: 0.245,
    source: 'DE441 · 지구 DE441',
  },
  {
    kind: 'venus-inferior-conjunction',
    year: 2097,
    referenceJd: 2487033.97962,
    recordedErrorDays: 0.487,
    source: 'DE441 · 지구 DE441',
  },
  {
    kind: 'jupiter-opposition',
    year: 1905,
    referenceJd: 2417173.85851,
    recordedErrorDays: 1.171,
    source: 'jup365_merged · 지구 DE441',
  },
  {
    kind: 'jupiter-opposition',
    year: 1950,
    referenceJd: 2433519.79319,
    recordedErrorDays: 0.695,
    source: 'jup365_merged · 지구 DE441',
  },
  {
    kind: 'jupiter-opposition',
    year: 2000,
    referenceJd: 2451876.58493,
    recordedErrorDays: 0.043,
    source: 'jup365_merged · 지구 DE441',
  },
  {
    kind: 'jupiter-opposition',
    year: 2023,
    referenceJd: 2460251.70299,
    recordedErrorDays: -0.406,
    source: 'jup365_merged · 지구 DE441',
  },
  {
    kind: 'jupiter-opposition',
    year: 2050,
    referenceJd: 2469825.74083,
    recordedErrorDays: -0.536,
    source: 'jup365_merged · 지구 DE441',
  },
  {
    kind: 'jupiter-opposition',
    year: 2095,
    referenceJd: 2486579.48188,
    recordedErrorDays: -1.263,
    source: 'jup365_merged · 지구 DE441',
  },
  {
    kind: 'saturn-opposition',
    year: 1905,
    referenceJd: 2417080.85005,
    recordedErrorDays: 0.139,
    source: 'sat441l · 지구 DE441',
  },
  {
    kind: 'saturn-opposition',
    year: 1950,
    referenceJd: 2433347.69218,
    recordedErrorDays: -0.037,
    source: 'sat441l · 지구 DE441',
  },
  {
    kind: 'saturn-opposition',
    year: 2000,
    referenceJd: 2451868.02074,
    recordedErrorDays: -0.147,
    source: 'sat441l · 지구 DE441',
  },
  {
    kind: 'saturn-opposition',
    year: 2023,
    referenceJd: 2460183.84443,
    recordedErrorDays: 0.09,
    source: 'sat441l · 지구 DE441',
  },
  {
    kind: 'saturn-opposition',
    year: 2050,
    referenceJd: 2470015.93808,
    recordedErrorDays: -0.074,
    source: 'sat441l · 지구 DE441',
  },
  {
    kind: 'saturn-opposition',
    year: 2095,
    referenceJd: 2486280.2005,
    recordedErrorDays: -0.106,
    source: 'sat441l · 지구 DE441',
  },
  {
    kind: 'halley-perihelion',
    year: 1986,
    referenceJd: 2446470.95896,
    recordedErrorDays: 7.838,
    source: 'JPL#75',
  },
  {
    kind: 'swift-tuttle-perihelion',
    year: 1992,
    referenceJd: 2448969.1781,
    recordedErrorDays: -0.316,
    source: 'DASTCOM',
  },
];

/** DoD M3 (ii) — 표본별 기록값 대역 [일]. */
export const RECORDED_ERROR_BAND_DAYS = 0.2;
