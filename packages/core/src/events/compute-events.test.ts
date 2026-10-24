import { beforeAll, describe, expect, it } from 'vitest';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { meanAnomalyAt, orbitMu } from '../physics/kepler.js';
import { clockJdToTt } from '../time/delta-t.js';
import { dateToJulianDate } from '../time/julian-date.js';
import {
  computeEventsForKind,
  heliocentricLongitudeDifference,
  isSameSideBracket,
  perihelionTimes,
  type AstroEvent,
  type EventBody,
} from './compute-events.js';
import { EVENT_KINDS, getEventKind, type EventKindId } from './event-kinds.js';

/**
 * #1347 DoD M1 (사건 조건 정합) · M2 (완전성) — ADR `docs/decisions/20261016-1347-event-markers.md`.
 * 범위는 스크러버와 같은 1900-01-01 ~ 2100-01-01 (web `SCRUBBER_MIN/MAX_JD` 와 같은 식).
 */

const START_JD = dateToJulianDate(new Date(Date.UTC(1900, 0, 1)));
const END_JD = dateToJulianDate(new Date(Date.UTC(2100, 0, 1)));
const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;

/** M1 — 충 · 내합 `|Δλ(t*)| ≤ 1e-6°`. */
const ALIGNMENT_RESIDUAL_MAX_RAD = 1e-6 * DEG;
/** M1 — 근일점 `M(t*) mod 2π ≤ 1e-9 rad`. */
const PERIHELION_RESIDUAL_MAX_RAD = 1e-9;

/**
 * M2 — 종류별 개수 · 인접 간격 `[min, max]` (일). ADR M2 의 값 (교정 전 μ 측정) 과 개수가 같고, 간격은 #1349 후 develop 에서
 * 다시 잰 값 (화성 `764.00 ~ 810.93` · 금성 `579.82 ~ 587.74` · 목성 `395.44 ~ 402.81` · 토성 `377.15 ~ 379.15`) 도 ADR 범위 ± 1일 안이다.
 * 판정은 ADR 범위 ± 1일로 한다 — 근 하나가 빠지면 그 자리 간격이 2배가 되어 상한을 넘는다.
 */
const COMPLETENESS: Partial<Record<EventKindId, { count: number; gap: [number, number] }>> = {
  'mars-opposition': { count: 94, gap: [763.9, 810.8] },
  'venus-inferior-conjunction': { count: 125, gap: [579.7, 587.7] },
  'jupiter-opposition': { count: 183, gap: [395.4, 402.8] },
  'saturn-opposition': { count: 193, gap: [377.1, 379.1] },
};
const GAP_SLACK_DAYS = 1;

let bodiesById: ReadonlyMap<string, EventBody>;
const eventsByKind = new Map<EventKindId, AstroEvent[]>();

beforeAll(() => {
  bodiesById = new Map(getSolarSystem().bodies.map((b) => [b.id, b]));
  for (const kind of EVENT_KINDS) {
    eventsByKind.set(kind.id, computeEventsForKind(bodiesById, kind, START_JD, END_JD));
  }
});

function normalizedMeanAnomaly(bodyId: string, jd: number): number {
  const body = bodiesById.get(bodyId)!;
  const parent = bodiesById.get(body.parentId!)!;
  let m = meanAnomalyAt(body.orbit!, jd, orbitMu(body, parent)) % TWO_PI;
  if (m > Math.PI) m -= TWO_PI;
  if (m < -Math.PI) m += TWO_PI;
  return m;
}

/**
 * #1370 — `computeEventsForKind` 의 `julianDate` 는 장면 시계다. 조건식 (`heliocentricLongitudeDifference` · `meanAnomalyAt`) 은
 * 물리 함수라 TT 를 받으므로 `clockJdToTt(t*)` 에서 평가한다 (ADR `20261023-1370` §실측 1-F — parity 기대값을 TT 로).
 */
describe('M1 — 사건 조건 정합 (1900~2100 전 사건)', () => {
  const alignmentKinds = EVENT_KINDS.filter((k) => k.computation.type === 'heliocentric-alignment');
  const perihelionKinds = EVENT_KINDS.filter((k) => k.computation.type === 'perihelion');

  it.each(alignmentKinds.map((k) => [k.id, k] as const))(
    '%s — 모든 t* 에서 |Δλ| ≤ 1e-6° 이고 같은 쪽 (지구–행성이 태양 같은 쪽)',
    (_id, kind) => {
      const events = eventsByKind.get(kind.id)!;
      expect(events.length).toBeGreaterThan(0);
      let worst = 0;
      for (const e of events) {
        const ref =
          kind.computation.type === 'heliocentric-alignment' ? kind.computation.referenceId : '';
        const d = heliocentricLongitudeDifference(
          bodiesById,
          kind.subjectId,
          ref,
          clockJdToTt(e.julianDate),
        );
        worst = Math.max(worst, Math.abs(d));
      }
      expect(worst).toBeLessThanOrEqual(ALIGNMENT_RESIDUAL_MAX_RAD);
    },
  );

  it.each(perihelionKinds.map((k) => [k.id, k] as const))(
    '%s — 모든 t* 에서 |M mod 2π| ≤ 1e-9 rad',
    (_id, kind) => {
      const events = eventsByKind.get(kind.id)!;
      expect(events.length).toBeGreaterThan(0);
      for (const e of events) {
        expect(
          Math.abs(normalizedMeanAnomaly(kind.subjectId, clockJdToTt(e.julianDate))),
        ).toBeLessThanOrEqual(PERIHELION_RESIDUAL_MAX_RAD);
      }
    },
  );

  it('판별력 — t* ± 1일 결함판은 M1 문턱을 전건 넘는다', () => {
    for (const kind of alignmentKinds) {
      const ref =
        kind.computation.type === 'heliocentric-alignment' ? kind.computation.referenceId : '';
      for (const shift of [-1, 1]) {
        const minResidual = Math.min(
          ...eventsByKind
            .get(kind.id)!
            .map((e) =>
              Math.abs(
                heliocentricLongitudeDifference(
                  bodiesById,
                  kind.subjectId,
                  ref,
                  clockJdToTt(e.julianDate) + shift,
                ),
              ),
            ),
        );
        expect(minResidual).toBeGreaterThan(ALIGNMENT_RESIDUAL_MAX_RAD);
      }
    }
    for (const kind of perihelionKinds) {
      for (const e of eventsByKind.get(kind.id)!) {
        for (const shift of [-1, 1]) {
          expect(
            Math.abs(normalizedMeanAnomaly(kind.subjectId, clockJdToTt(e.julianDate) + shift)),
          ).toBeGreaterThan(PERIHELION_RESIDUAL_MAX_RAD);
        }
      }
    }
  });

  /**
   * 교차검증 합의 2 (ii) — 금성 외합 (일심 황경 반대쪽, `Δλ = ±π`) 은 사건이 아니다. wrap 때문에 외합에서도 `Δλ` 부호가 바뀌므로
   * 「부호 변화」만으로 근을 받으면 외합이 섞인다. 외합 시각을 직접 구해 (1) 목록에 없고 (2) 같은 쪽 판정이 거부하는지 단언한다.
   */
  it('금성 외합 시각을 거부한다 — 목록에 없고 같은 쪽 판정이 거부', () => {
    const kind = getEventKind('venus-inferior-conjunction');
    const conjunctions = eventsByKind.get(kind.id)!.map((e) => e.julianDate);
    const delta = (jd: number) => heliocentricLongitudeDifference(bodiesById, 'venus', 'earth', jd);

    // 외합 = 반대쪽 wrap (`|Δλ|` 가 π 근처에서 부호가 바뀌는 구간). 1일 간격 + 이분법.
    const superior: number[] = [];
    for (let jd = START_JD; jd < END_JD; jd += 1) {
      const a = delta(jd);
      const b = delta(jd + 1);
      if (a < 0 === b < 0 || Math.abs(a) < Math.PI / 2) continue;
      let lo = jd;
      let hi = jd + 1;
      for (let i = 0; i < 50; i += 1) {
        const mid = (lo + hi) / 2;
        if (delta(mid) < 0 === a < 0) lo = mid;
        else hi = mid;
      }
      superior.push((lo + hi) / 2);
    }
    // 외합은 내합과 같은 수 (± 1 — 범위 경계).
    expect(Math.abs(superior.length - conjunctions.length)).toBeLessThanOrEqual(1);

    // (1) 사건 목록에서 가장 가까운 사건까지 회합주기의 1/4 (≈ 146일) 이상 떨어져 있다.
    const QUARTER_SYNODIC_DAYS = 146;
    for (const t of superior) {
      const nearest = Math.min(...conjunctions.map((c) => Math.abs(c - t)));
      expect(nearest).toBeGreaterThan(QUARTER_SYNODIC_DAYS);
      // (2) 외합을 끼는 표본 구간 (실제 계산의 4일 간격) 은 같은 쪽 판정이 거부한다.
      expect(isSameSideBracket(delta(t - 2), delta(t + 2))).toBe(false);
      // (3) M1 문턱으로도 외합은 사건이 될 수 없다 — |Δλ| ≈ π.
      expect(Math.abs(delta(t))).toBeGreaterThan(Math.PI - 1e-6);
    }
  });
});

describe('M2 — 완전성', () => {
  it.each(Object.entries(COMPLETENESS))('%s — 개수 · 인접 간격', (kindId, spec) => {
    const events = eventsByKind.get(kindId as EventKindId)!;
    expect(events.length).toBe(spec!.count);
    const gaps = events.slice(1).map((e, i) => e.julianDate - events[i]!.julianDate);
    expect(Math.min(...gaps)).toBeGreaterThanOrEqual(spec!.gap[0] - GAP_SLACK_DAYS);
    expect(Math.max(...gaps)).toBeLessThanOrEqual(spec!.gap[1] + GAP_SLACK_DAYS);
  });

  /**
   * 교차검증 합의 2 (i) — 혜성 근일점은 개수가 아니라 **사건 id 집합**으로 판정한다. 개수 `2` 는 「핼리 1910 + 1986」 결함판도 통과한다.
   */
  it('혜성 근일점 — 사건 id 집합이 핼리 1986 · 스위프트-터틀 1992 와 일치', () => {
    const cometIds = EVENT_KINDS.filter((k) => k.filter === 'comet-perihelion').flatMap((k) =>
      eventsByKind.get(k.id)!.map((e) => e.id),
    );
    expect(new Set(cometIds)).toEqual(
      new Set(['halley-perihelion:1986-02-17', 'swift-tuttle-perihelion:1992-12-12']),
    );
  });

  it('사건 id 는 전 종류에서 유일하고 시각 오름차순', () => {
    const all = [...eventsByKind.values()].flat();
    expect(new Set(all.map((e) => e.id)).size).toBe(all.length);
    for (const events of eventsByKind.values()) {
      for (let i = 1; i < events.length; i += 1) {
        expect(events[i]!.julianDate).toBeGreaterThan(events[i - 1]!.julianDate);
      }
    }
  });

  it('범위 밖 사건은 없다 — [1900-01-01, 2100-01-01)', () => {
    for (const e of [...eventsByKind.values()].flat()) {
      expect(e.julianDate).toBeGreaterThanOrEqual(START_JD);
      expect(e.julianDate).toBeLessThan(END_JD);
    }
  });
});

/**
 * #1370 착수 전 확인 2 (ADR `20261023-1370` §구현 인계) — `computeEventsForKind` 는 `[from, to)` (시계) 를 TT 로 옮겨 계산하고
 * 결과를 시계로 되돌린다. 경계에 사건을 정확히 둔 청크 둘을 이어 붙여도 전 범위 결과와 같아야 한다 (누락 · 중복 0).
 * 경계 `B` = 사건 시각 자신 (시계) — `clockJdToTt(B)` 가 그 사건의 TT 와 같은 자리라 가장 불리한 배치다.
 */
describe('#1370 — 청크 경계 왕복 (경계에 사건을 둔 이음 == 전 범위)', () => {
  const HALF_SPAN_DAYS = 3_652.5;
  /** 청크마다 스캔 시작이 달라 근의 마지막 자리가 갈릴 수 있다 — 이분법 · 할선법 수렴 판정보다 큰 값 [일] (≈ 0.09 s). */
  const ROOT_MATCH_DAYS = 1e-6;
  /** 경계로 쓸 사건 — 2024 일식 · 2025 월식 · 화성 충 · 핼리 근일점 (종류 4계열: 식 2 · 일치 1 · 근일점 1). */
  const CASES: readonly [EventKindId, string][] = [
    ['solar-eclipse', 'solar-eclipse:2024-04-08'],
    ['lunar-eclipse', 'lunar-eclipse:2025-03-14'],
    ['mars-opposition', 'mars-opposition:2025-01-16'],
    ['halley-perihelion', 'halley-perihelion:1986-02-17'],
  ];

  it.each(CASES)('%s — 경계 = %s', (kindId, eventId) => {
    const kind = getEventKind(kindId);
    const boundary = eventsByKind.get(kindId)!.find((e) => e.id === eventId);
    expect(boundary, `${eventId} 없음`).toBeDefined();
    const b = boundary!.julianDate;
    const whole = computeEventsForKind(bodiesById, kind, b - HALF_SPAN_DAYS, b + HALF_SPAN_DAYS);
    const chunked = [
      ...computeEventsForKind(bodiesById, kind, b - HALF_SPAN_DAYS, b),
      ...computeEventsForKind(bodiesById, kind, b, b + HALF_SPAN_DAYS),
    ];
    expect(chunked.map((e) => e.id)).toEqual(whole.map((e) => e.id));
    expect(chunked.filter((e) => e.id === eventId)).toHaveLength(1);
    chunked.forEach((e, i) => {
      expect(Math.abs(e.julianDate - whole[i]!.julianDate)).toBeLessThan(ROOT_MATCH_DAYS);
    });
  });
});

/**
 * #1406 DoD D16 — `perihelionTimes` 는 고정 요소 해석해다. 율 보유 궤도 (8행성 · 달) 를 넘기면 장면 (`elementsAt`) 과 어긋난
 * 시각을 조용히 내는 대신 `throw` 한다 (ADR 20261024-1406 결정 C). 혜성 2종 (율 없음) 은 그대로 계산된다 — 시각의 비트
 * 동일 (행성 율 유 ↔ 무) 은 `orbit-elements-at.test.ts` D10.
 */
describe('#1406 D16 — perihelionTimes fail-fast', () => {
  it.each(['mars', 'jupiter', 'earth', 'moon'])('율 보유 %s 는 throw', (id) => {
    expect(bodiesById.get(id)!.orbit!.rates).toBeDefined();
    expect(() => perihelionTimes(bodiesById, id, START_JD, END_JD)).toThrow(/rates 보유/);
  });

  it('율 보유 천체를 근일점 사건 종류로 계산해도 throw (computeEventsForKind 경유)', () => {
    const kind = { ...getEventKind('halley-perihelion'), subjectId: 'mars' };
    expect(() => computeEventsForKind(bodiesById, kind, START_JD, END_JD)).toThrow(/rates 보유/);
  });

  it.each(['halley', 'swift-tuttle'])('율 없는 혜성 %s 는 계산된다', (id) => {
    expect(bodiesById.get(id)!.orbit!.rates).toBeUndefined();
    expect(perihelionTimes(bodiesById, id, START_JD, END_JD).length).toBeGreaterThan(0);
  });
});
