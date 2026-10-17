import { describe, expect, it } from 'vitest';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { dateToJulianDate, julianDateToDate } from '../time/julian-date.js';
import {
  EXTERNAL_REFERENCE_SAMPLES,
  RECORDED_ERROR_BAND_DAYS,
  type ExternalReferenceSample,
} from './__test-utils__/external-reference-fixture.js';
import { computeEventsForKind } from './compute-events.js';
import {
  EVENT_KINDS,
  EVENT_KIND_TOLERANCE_DAYS,
  getEventKind,
  type EventKindId,
} from './event-kinds.js';

/**
 * #1347 DoD M3 — 외부 기준 정합 (ADR `docs/decisions/20261016-1347-event-markers.md`).
 *
 * (i) 표본마다 `|오차| ≤ EVENT_KIND_TOLERANCE_DAYS[kind]` — UI 배지 「±N일」 의 근거.
 * (ii) 표본마다 `|오차 − recordedErrorDays| ≤ 0.2` 일 — 결함 판별. 표본이 1개이거나 오차가 한쪽 부호뿐인 종류 (핼리) 는
 *      대칭 허용치 (i) 만으로는 한 방향 밀림을 놓친다 (ADR M3 결함판 표).
 */

/**
 * 이 fixture (JPL Horizons) 가 덮는 종류 — 식 (`syzygy-eclipse`) 은 기준이 NASA 식 목록이라 `eclipse-events.test.ts` 가
 * 따로 잰다 (#1354 DoD E2 ~ E4).
 */
const HORIZONS_KINDS = EVENT_KINDS.filter((k) => k.computation.type !== 'syzygy-eclipse');

const START_JD = dateToJulianDate(new Date(Date.UTC(1900, 0, 1)));
const END_JD = dateToJulianDate(new Date(Date.UTC(2100, 0, 1)));

const bodiesById = new Map(getSolarSystem().bodies.map((b) => [b.id, b]));
const modelTimes = new Map<EventKindId, number[]>(
  HORIZONS_KINDS.map((k) => [
    k.id,
    computeEventsForKind(bodiesById, k, START_JD, END_JD).map((e) => e.julianDate),
  ]),
);

/** 표본 해의 모델 사건 시각. 그 해에 사건이 정확히 1개가 아니면 표본 정의가 깨진 것이다. */
function modelTimeFor(sample: ExternalReferenceSample): number {
  const inYear = modelTimes
    .get(sample.kind)!
    .filter((jd) => julianDateToDate(jd).getUTCFullYear() === sample.year);
  if (inYear.length !== 1) {
    throw new Error(
      `[M3] ${sample.kind} ${sample.year} — 모델 사건 ${inYear.length}개 (1개여야 함)`,
    );
  }
  return inYear[0]!;
}

/** 판정 술어 — (i) ∧ (ii). `shiftDays` 는 결함판 (사건 시각을 일정하게 민 판본) 재현용. */
function sampleVerdict(sample: ExternalReferenceSample, shiftDays: number) {
  const error = modelTimeFor(sample) + shiftDays - sample.referenceJd;
  const withinTolerance = Math.abs(error) <= EVENT_KIND_TOLERANCE_DAYS[sample.kind];
  const withinBand = Math.abs(error - sample.recordedErrorDays) <= RECORDED_ERROR_BAND_DAYS;
  return { error, withinTolerance, withinBand };
}

describe('M3 — 외부 기준 (JPL Horizons) 정합', () => {
  it('fixture 가 결정 D1 의 전 종류를 덮는다 (식 2종은 NASA fixture — eclipse-events.test.ts)', () => {
    expect(new Set(EXTERNAL_REFERENCE_SAMPLES.map((s) => s.kind))).toEqual(
      new Set(HORIZONS_KINDS.map((k) => k.id)),
    );
    expect(EVENT_KINDS.length - HORIZONS_KINDS.length).toBe(2);
  });

  it.each(EXTERNAL_REFERENCE_SAMPLES.map((s) => [`${s.kind} ${s.year}`, s] as const))(
    '%s — (i) 종류 허용치 · (ii) 기록값 ±0.2일',
    (_label, sample) => {
      const { error, withinTolerance, withinBand } = sampleVerdict(sample, 0);
      expect(Math.abs(error)).toBeLessThanOrEqual(EVENT_KIND_TOLERANCE_DAYS[sample.kind]);
      expect(withinTolerance).toBe(true);
      expect(Math.abs(error - sample.recordedErrorDays)).toBeLessThanOrEqual(
        RECORDED_ERROR_BAND_DAYS,
      );
      expect(withinBand).toBe(true);
    },
  );

  /**
   * 결함판 판별 — 사건 시각을 ±1일 민 판본은 종류마다 최소 1표본이 (i) ∧ (ii) 를 어긴다. (ii) 대역 0.2일 < 1일이라 표본별 대역이
   * 모든 표본을 잡고, 대칭 허용치 (i) 도 핼리 −1일을 뺀 전 경우를 잡는다 (핼리 오차는 `+7.8` 일 한쪽 부호라 −1일은 허용치 안으로 들어온다).
   */
  it.each([-1, 1])('결함판 (사건 시각 %+d일) — 종류마다 판정 FAIL', (shift) => {
    for (const kind of HORIZONS_KINDS) {
      const samples = EXTERNAL_REFERENCE_SAMPLES.filter((s) => s.kind === kind.id);
      const verdicts = samples.map((s) => sampleVerdict(s, shift));
      expect(verdicts.some((v) => !(v.withinTolerance && v.withinBand))).toBe(true);
      // (ii) 단독으로도 전 표본을 잡는다.
      expect(verdicts.every((v) => !v.withinBand)).toBe(true);
    }
  });

  it('대칭 허용치 (i) 만으로는 핼리 −1일을 놓친다 — (ii) 를 함께 두는 이유', () => {
    const halley = EXTERNAL_REFERENCE_SAMPLES.find((s) => s.kind === 'halley-perihelion')!;
    expect(sampleVerdict(halley, -1).withinTolerance).toBe(true);
    expect(sampleVerdict(halley, -1).withinBand).toBe(false);
  });

  it('허용치는 종류 표와 같은 키 집합이다 (UI 배지 SSoT)', () => {
    expect(Object.keys(EVENT_KIND_TOLERANCE_DAYS).sort()).toEqual(
      EVENT_KINDS.map((k) => k.id).sort(),
    );
    expect(getEventKind('mars-opposition').subjectId).toBe('mars');
  });
});
