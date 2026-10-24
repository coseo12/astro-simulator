/**
 * #1354 PR2 — 일식 · 월식 사건 (ADR `docs/decisions/20261017-1354-lunar-precession-eclipses.md` 결정 E1 ~ E4 · DoD E1 ~ E5).
 *
 * - E1 — 사건 계산의 삭망 근 (`syzygyTimes`) 이 DE441 삭망 717개와 1 h 안 (PR1 은 같은 대역을 별도 헬퍼로 쟀다 — 여기서는
 *   사건 경로 자체를 잰다) + 완전성 (인접 간격).
 * - E2 · E3 · E4 — NASA 1900 ~ 2100 목록 (`__test-utils__/nasa-eclipse-fixture.ts`) 대비 적중 · 오탐 · 종류 · 최대식 시각.
 * - E5 — 판정식 단위 (합성 배치 — 위치 모델 무관).
 * - 최대식 정합 — 모든 사건 시각에서 식 지표가 국소 최소 (「최대식 대신 삭망 시각」 결함판을 잡는다).
 *
 * 임계는 구현 실측으로 재확정했다 (ADR E2 · E3 「구현 실측으로 재확정」). 실측값 · 결함판 판별은 각 상수 주석.
 *
 * #1404 (ADR `docs/decisions/20261023-1404-lunar-theory-meeus47.md` 결정 E4 · E5, DoD D5 ~ D7) — 달 위치가 `lunarTheory` 로
 * 바뀌어 임계를 조였다. 달 `rates` 변이 (세차 부호 반전 · 틀 미변환) 는 더 이상 달 위치를 바꾸지 않아 (위치는 이론, 율은 평균
 * 요소만) 그 판별력 테스트 2건을 지웠다 — 이론 변이 판별력은 `physics/lunar-theory.test.ts` (D3).
 * 실측 환경 (아래 「실측」 전부): macOS · Apple M1 Pro · Node 24.14.0 · vitest, 이 PR 의 구현 · 데이터.
 *
 * #1406 (ADR `docs/decisions/20261024-1406-planet-element-rates-standish.md` 결정 E5 — ADR 1354 재검토 트리거 1 · ADR 1404
 * 재검토 조건 1 이행) — 8행성 (EMB 포함) 이 표 1 율을 가져 태양 축 오차가 줄었다. E1 · E2 · E3 · E4 임계를 다시 쟀다. 실측은
 * 위와 같은 환경 · 이 PR 의 구현 · 데이터다. 판별력 — 행성 율을 뺀 판본 (#1406 이전 태양) 은 새 E1 · E4 를 넘는다 (아래 E4 블록).
 */
import solarSystemRaw from '@astro-simulator/shared/data/solar-system.json' with { type: 'json' };
import { describe, expect, it } from 'vitest';
import type { Vec3Double } from '../coords/vec3.js';
import {
  getSolarSystem,
  loadSolarSystem,
  type LoadedCelestialBody,
} from '../ephemeris/solar-system-loader.js';
import { clockJdToTt, ttJdToClock } from '../time/delta-t.js';
import { dateToJulianDate } from '../time/julian-date.js';
import { DE441_FULL_MOON_JD, DE441_NEW_MOON_JD } from './__test-utils__/lunar-reference-fixture.js';
import {
  NASA_LUNAR_ECLIPSES,
  NASA_SOLAR_ECLIPSES,
  nasaEclipseJulianDate,
  type NasaEclipseRow,
} from './__test-utils__/nasa-eclipse-fixture.js';
import {
  GREATEST_ECLIPSE_HALF_WINDOW_DAYS,
  computeEventsForKind,
  greatestEclipseNear,
  syzygyGeometryAt,
  syzygyTimes,
  type AstroEvent,
} from './compute-events.js';
import {
  lunarEclipseGeometry,
  solarEclipseGeometry,
  type EclipseRadii,
} from './eclipse-geometry.js';
import {
  EVENT_KIND_TOLERANCE_DAYS,
  eventLabelKo,
  getEventKind,
  type EventKindId,
} from './event-kinds.js';

const START_JD = dateToJulianDate(new Date(Date.UTC(1900, 0, 1)));
const END_JD = dateToJulianDate(new Date(Date.UTC(2100, 0, 1)));
const HOURS_PER_DAY = 24;
const MINUTES_PER_DAY = 1_440;
const DEG = Math.PI / 180;

/** NASA ↔ 모델 사건 매칭 창 [일] (ADR DoD E2 — ±3일). */
const MATCH_WINDOW_DAYS = 3;

/**
 * DoD E2 — 적중 하한 · 오탐 상한. #1406 DoD D5 — 일식 `≥ 450` · `≤ 2`, 월식 `≥ 455` · `≤ 2` (#1404 때 449 · 4 / 454 · 3,
 * B9 때 448 · 8 / 453 · 6). 실측: 일식 적중 452/452 · 오탐 0 (사건 452), 월식 적중 457/457 · 오탐 0 (사건 457) — ADR 1406
 * §1-F 설계 실측과 같은 수다. #1406 이전 (행성 율 없음) 은 일식 451 · 2 / 월식 456 · 1.
 */
const E2 = {
  'solar-eclipse': { minHits: 450, maxFalse: 2 },
  'lunar-eclipse': { minHits: 455, maxFalse: 2 },
} as const;

/**
 * DoD E3 — 종류 일치 하한 (적중 중, 혼성 = 개기 또는 금환이면 일치). #1406 DoD D5 — 일식 `≥ 446` · 월식 `≥ 452` (#1404 때
 * 443 · 442, B9 때 438 · 430). 실측 일식 449 · 월식 455 (#1406 이전 446 · 445 — 월식이 새 하한 아래). 결함판: `lunarTheory` 를
 * 뺀 판본 (A3 — 아래 판별력 테스트) · 본영 반경 부호 반전 (#1354 변이).
 */
const E3 = { 'solar-eclipse': 446, 'lunar-eclipse': 452 } as const;

/**
 * DoD E4 — 적중마다 `|t* − NASA TD|` 상한 [h]. #1406 DoD D3 — `0.5 → 0.05` h (#1404 DoD D7 때 `1.0 → 0.5` h). 실측 max
 * 일식 `2.07` · 월식 `1.60` 분 (`0.0344` · `0.0266` h — ADR 1406 §1-F 와 같다). #1406 이전 (행성 율 없음) 은 `26.54` · `25.88` 분.
 */
const E4_MAX_HOURS = 0.05;

/** 완전성 — 삭망 인접 간격 상한 [일] (실제 `29.27 ~ 29.83` 일). 범위 양 끝 여백에도 같은 상한을 건다. */
const MAX_SYZYGY_GAP_DAYS = 29.9;

/**
 * DoD E1 — 삭망 시각 허용 [h] (`orbit-elements-at.test.ts` 와 같은 대역). #1406 DoD D4 — `0.5 → 0.05` h (#1404 DoD D5 때
 * `1.0 → 0.5` h).
 */
const E1_SYZYGY_TOLERANCE_HOURS = 0.05;

/** 최대식 정합 — 사건 시각 ± 이 값에서 식 지표가 사건 시각보다 작지 않아야 한다 [일] (1분). */
const GREATEST_ECLIPSE_PROBE_DAYS = 1 / MINUTES_PER_DAY;

type EclipseKindId = 'solar-eclipse' | 'lunar-eclipse';
const ECLIPSE_KINDS: readonly EclipseKindId[] = ['solar-eclipse', 'lunar-eclipse'];
const NASA: Record<EclipseKindId, readonly NasaEclipseRow<string>[]> = {
  'solar-eclipse': NASA_SOLAR_ECLIPSES,
  'lunar-eclipse': NASA_LUNAR_ECLIPSES,
};

type RawSystem = typeof solarSystemRaw;

function byIdOf(bodies: readonly LoadedCelestialBody[]): Map<string, LoadedCelestialBody> {
  return new Map(bodies.map((b) => [b.id, b] as const));
}

const fullById = byIdOf(getSolarSystem().bodies);

function eclipsesOf(
  byId: ReadonlyMap<string, LoadedCelestialBody>,
  kind: EclipseKindId,
): AstroEvent[] {
  return computeEventsForKind(byId, getEventKind(kind), START_JD, END_JD);
}

interface MatchResult {
  hits: number;
  falsePositives: number;
  typeMatches: number;
  /** 적중 사건의 `t* − NASA` [h]. */
  errorsHours: number[];
}

/**
 * NASA 행마다 ±3일 안 미사용 모델 사건을 짝짓는다 (ADR 측정 스크립트와 같은 규칙).
 *
 * #1370 (ADR `20261023-1370` Q4) — 모델 사건 시각은 장면 시계라 `clockJdToTt` 로 옮겨 NASA TD 와 같은 척도로 비교한다. 그래서 오차는
 * 순수 모델 오차다 (ΔT 적용 전 실측값과 같다 — 그때는 장면 시계를 TT 처럼 썼다).
 */
function matchAgainstNasa(events: readonly AstroEvent[], kind: EclipseKindId): MatchResult {
  const used = new Set<AstroEvent>();
  let hits = 0;
  let typeMatches = 0;
  const errorsHours: number[] = [];
  for (const row of NASA[kind]) {
    const jd = nasaEclipseJulianDate(row);
    const m = events.find(
      (e) => !used.has(e) && Math.abs(clockJdToTt(e.julianDate) - jd) < MATCH_WINDOW_DAYS,
    );
    if (!m) continue;
    used.add(m);
    hits += 1;
    errorsHours.push((clockJdToTt(m.julianDate) - jd) * HOURS_PER_DAY);
    const nasaType = row[2];
    const ok =
      nasaType === 'hybrid'
        ? m.eclipseType === 'total' || m.eclipseType === 'annular'
        : m.eclipseType === nasaType;
    if (ok) typeMatches += 1;
  }
  return { hits, falsePositives: events.length - used.size, typeMatches, errorsHours };
}

const fullEvents: Record<EclipseKindId, AstroEvent[]> = {
  'solar-eclipse': eclipsesOf(fullById, 'solar-eclipse'),
  'lunar-eclipse': eclipsesOf(fullById, 'lunar-eclipse'),
};
const fullMatch: Record<EclipseKindId, MatchResult> = {
  'solar-eclipse': matchAgainstNasa(fullEvents['solar-eclipse'], 'solar-eclipse'),
  'lunar-eclipse': matchAgainstNasa(fullEvents['lunar-eclipse'], 'lunar-eclipse'),
};

describe('#1354 E1 — 사건 경로의 삭망 근 (DE441 717개)', () => {
  const roots = {
    new: syzygyTimes(fullById, 'moon', 'new', START_JD, END_JD),
    full: syzygyTimes(fullById, 'moon', 'full', START_JD, END_JD),
  };

  it(`기준 삭망마다 가장 가까운 모델 근이 ${E1_SYZYGY_TOLERANCE_HOURS} h 안`, () => {
    let worst = 0;
    for (const [refs, model] of [
      [DE441_NEW_MOON_JD, roots.new],
      [DE441_FULL_MOON_JD, roots.full],
    ] as const) {
      for (const ref of refs) {
        const nearest = Math.min(...model.map((t) => Math.abs(t - ref)));
        worst = Math.max(worst, nearest * HOURS_PER_DAY);
      }
    }
    // #1406 실측 max `0.0151` h (#1404 때 `0.438` h, B9 때 `−0.756 ~ +0.688` h).
    expect(worst).toBeLessThanOrEqual(E1_SYZYGY_TOLERANCE_HOURS);
  });

  /**
   * 완전성 — 인접 간격만으로는 범위 양 끝에서 근을 놓쳐도 통과한다 (리뷰 변이 A: 첫 씨앗 부호 반전). 그래서 양 끝 여백도 같은 상한
   * (`29.9` 일) 으로 단언한다 — 「범위 시작 ~ 첫 근」 · 「마지막 근 ~ 범위 끝」 을 간격으로 보면 `[start, end)` 전체가 덮인다.
   * 개수 고정 (`2_474`) 대신 이 술어를 쓴 이유: 데이터 (달 율 · 항) 에 기대지 않는 구조 조건이라 모델이 바뀌어도 틀리지 않는다.
   */
  it('완전성 — 인접 간격 29.2 ~ 29.9 일 + 범위 양 끝 여백 < 29.9 일 (근 하나가 빠지면 간격이 2배)', () => {
    for (const list of [roots.new, roots.full]) {
      // 200년 / 평균 삭망월 29.53 일 = 2,474 — 범위 끝에서 ±1.
      expect(list.length).toBeGreaterThanOrEqual(2_472);
      expect(list.length).toBeLessThanOrEqual(2_475);
      const gaps = list.slice(1).map((t, i) => t - list[i]!);
      expect(Math.min(...gaps)).toBeGreaterThan(29.2);
      expect(Math.max(...gaps)).toBeLessThan(MAX_SYZYGY_GAP_DAYS);
      expect(list[0]!).toBeGreaterThanOrEqual(START_JD);
      expect(list.at(-1)!).toBeLessThan(END_JD);
      expect(list[0]! - START_JD).toBeLessThan(MAX_SYZYGY_GAP_DAYS);
      expect(END_JD - list.at(-1)!).toBeLessThan(MAX_SYZYGY_GAP_DAYS);
    }
  });

  it('청크 경계 — 10년 창으로 나눠 이어 붙여도 200년 한 번과 같은 근 (창마다 시작 처리가 20번 돈다)', () => {
    const DECADE_DAYS = 3_652.5;
    for (const [phase, whole] of [
      ['new', roots.new],
      ['full', roots.full],
    ] as const) {
      const chunked: number[] = [];
      for (let a = START_JD; a < END_JD; a += DECADE_DAYS) {
        chunked.push(...syzygyTimes(fullById, 'moon', phase, a, Math.min(a + DECADE_DAYS, END_JD)));
      }
      expect(chunked.length).toBe(whole.length);
      for (let i = 0; i < whole.length; i += 1) {
        expect(Math.abs(chunked[i]! - whole[i]!)).toBeLessThan(1e-6);
      }
    }
  });

  it('근에서 잔차 0 — 삭은 황경차 0, 망은 π (1e-7 rad)', () => {
    for (const [phase, list] of [
      ['new', roots.new],
      ['full', roots.full],
    ] as const) {
      for (const t of list.filter((_, i) => i % 50 === 0)) {
        const g = syzygyGeometryAt(fullById, 'moon', t)!;
        let d = Math.atan2(g.moon[1], g.moon[0]) - Math.atan2(g.sun[1], g.sun[0]);
        if (phase === 'full') d -= Math.PI;
        d = Math.atan2(Math.sin(d), Math.cos(d));
        expect(Math.abs(d)).toBeLessThan(1e-7);
      }
    }
  });
});

describe('#1354 E2 — 식 적중 · 오탐 (NASA 1900 ~ 2100, 일식 452 · 월식 457)', () => {
  it('기준 표본 수 (fixture 전제)', () => {
    expect(NASA_SOLAR_ECLIPSES).toHaveLength(452);
    expect(NASA_LUNAR_ECLIPSES).toHaveLength(457);
  });

  it.each(ECLIPSE_KINDS)('%s — 적중 · 오탐 임계', (kind) => {
    const m = fullMatch[kind];
    expect(m.hits).toBeGreaterThanOrEqual(E2[kind].minHits);
    expect(m.falsePositives).toBeLessThanOrEqual(E2[kind].maxFalse);
  });
});

describe('#1354 E3 — 종류 일치 (적중 중)', () => {
  it.each(ECLIPSE_KINDS)('%s — 종류 일치 하한', (kind) => {
    expect(fullMatch[kind].typeMatches).toBeGreaterThanOrEqual(E3[kind]);
  });

  it('판별력 — lunarTheory 를 뺀 판본 (A3 — Kepler 평균 요소 + 율) 은 종류 일치 하한을 넘지 못한다', () => {
    // #1404 결정 E5 — 「주기 항 없는 판본」 을 「lunarTheory 를 뺀 판본」 으로 옮겼다 (같은 Kepler 평균 요소 경로).
    // 실측 일식 424 · 월식 420 (ADR 1354 축 M A3 와 같다 — 같은 경로).
    const raw: RawSystem = structuredClone(solarSystemRaw);
    delete (raw.bodies.find((b) => b.id === 'moon')!.orbit as Record<string, unknown>).lunarTheory;
    const byId = byIdOf(loadSolarSystem(raw).bodies);
    for (const kind of ECLIPSE_KINDS) {
      expect(matchAgainstNasa(eclipsesOf(byId, kind), kind).typeMatches).toBeLessThan(E3[kind]);
    }
  });

  it('사건 표기명 — 종류 접두 + 일식 · 월식', () => {
    const labels = new Set(ECLIPSE_KINDS.flatMap((k) => fullEvents[k].map((e) => eventLabelKo(e))));
    expect(labels).toEqual(
      new Set(['개기일식', '금환일식', '부분일식', '개기월식', '부분월식', '반영월식']),
    );
  });
});

describe('#1354 E4 — 최대식 시각 · 허용 오차', () => {
  it.each(ECLIPSE_KINDS)(`%s — 적중마다 |t* − NASA TD| ≤ ${E4_MAX_HOURS} h`, (kind) => {
    const errors = fullMatch[kind].errorsHours;
    expect(errors.length).toBe(fullMatch[kind].hits);
    expect(Math.max(...errors.map(Math.abs))).toBeLessThanOrEqual(E4_MAX_HOURS);
  });

  it.each(ECLIPSE_KINDS)(
    '%s — 허용치 = 최대 |오차| 를 0.1일 올림 + 0.2일 (ADR 1347 D5 규칙)',
    (kind) => {
      const maxDays = Math.max(...fullMatch[kind].errorsHours.map(Math.abs)) / HOURS_PER_DAY;
      const rule = Math.ceil(maxDays * 10) / 10 + 0.2;
      expect(EVENT_KIND_TOLERANCE_DAYS[kind as EventKindId]).toBeCloseTo(rule, 10);
      expect(maxDays).toBeLessThanOrEqual(EVENT_KIND_TOLERANCE_DAYS[kind as EventKindId]);
    },
  );

  it.each(ECLIPSE_KINDS.flatMap((k) => [-1, 1].map((d) => [k, d] as const)))(
    '판별력 — %s 사건 시각 %+d일 이동은 E4 · 허용치를 넘는다',
    (kind, shift) => {
      const shifted = fullEvents[kind].map((e) => ({ ...e, julianDate: e.julianDate + shift }));
      const m = matchAgainstNasa(shifted, kind);
      // 매칭 창 ±3일 안이라 적중 수는 그대로 — 오차만 커진다.
      expect(m.hits).toBe(fullMatch[kind].hits);
      expect(Math.max(...m.errorsHours.map(Math.abs))).toBeGreaterThan(E4_MAX_HOURS);
      expect(Math.min(...m.errorsHours.map(Math.abs)) / HOURS_PER_DAY).toBeGreaterThan(
        EVENT_KIND_TOLERANCE_DAYS[kind],
      );
    },
  );
});

describe('#1406 판별력 — 행성 율을 뺀 판본 (#1406 이전 태양) 은 새 E1 · E4 를 넘는다', () => {
  const PLANET_IDS = [
    'mercury',
    'venus',
    'earth',
    'mars',
    'jupiter',
    'saturn',
    'uranus',
    'neptune',
  ];
  const raw: RawSystem = structuredClone(solarSystemRaw);
  for (const id of PLANET_IDS) {
    delete (raw.bodies.find((b) => b.id === id)!.orbit as Record<string, unknown>).rates;
  }
  const baseById = byIdOf(loadSolarSystem(raw).bodies);

  it.each(ECLIPSE_KINDS)('%s — E4 (실측 max 일식 26.54 · 월식 25.88 분)', (kind) => {
    const m = matchAgainstNasa(eclipsesOf(baseById, kind), kind);
    expect(Math.max(...m.errorsHours.map(Math.abs))).toBeGreaterThan(E4_MAX_HOURS);
  });

  it('E1 — 삭 (실측 max 0.438 h)', () => {
    const roots = syzygyTimes(baseById, 'moon', 'new', START_JD, END_JD);
    let worst = 0;
    for (const ref of DE441_NEW_MOON_JD) {
      worst = Math.max(worst, Math.min(...roots.map((t) => Math.abs(t - ref))) * HOURS_PER_DAY);
    }
    expect(worst).toBeGreaterThan(E1_SYZYGY_TOLERANCE_HOURS);
  });
});

describe('#1354 최대식 정합 · 사전 필터', () => {
  const radii = (): EclipseRadii => ({
    sun: fullById.get('sun')!.radius,
    earth: fullById.get('earth')!.radius,
    moon: fullById.get('moon')!.radius,
  });
  const metricAt = (kind: EclipseKindId, jd: number) => {
    const g = syzygyGeometryAt(fullById, 'moon', jd)!;
    return kind === 'solar-eclipse'
      ? solarEclipseGeometry(g.moon, g.sun, radii()).gamma
      : lunarEclipseGeometry(g.moon, g.sun, radii()).separation;
  };

  /**
   * 「최대식 대신 삭망 시각」 결함판을 잡는 술어 — 사건 시각이 식 지표의 국소 최소다. #1354 (B9) 때는 E2 ~ E4 가 이 결함을 못
   * 잡았다 (당시 변이 실측: NASA 대비 최대 |오차| 일식 `0.767` · 월식 `0.816` h 로 당시 E4 `1.0` h 안, 적중 · 오탐 · 종류는
   * 451 · 4 · 444 / 456 · 2 · 438 로 당시 E2 · E3 임계 안). 위치 모델과 무관한 구조 술어라 #1404 이후에도 그대로 둔다.
   */
  // #1370 — 사건 시각 (장면 시계) 을 TT 로 옮겨 식 지표 (물리 함수) 를 평가한다.
  it.each(ECLIPSE_KINDS)('%s — 모든 사건 시각에서 식 지표가 ±1분보다 작거나 같다', (kind) => {
    for (const e of fullEvents[kind]) {
      const ttJd = clockJdToTt(e.julianDate);
      const at = metricAt(kind, ttJd);
      expect(at).toBeLessThanOrEqual(metricAt(kind, ttJd - GREATEST_ECLIPSE_PROBE_DAYS));
      expect(at).toBeLessThanOrEqual(metricAt(kind, ttJd + GREATEST_ECLIPSE_PROBE_DAYS));
    }
  });

  it.each(ECLIPSE_KINDS)(
    '%s — 사전 필터는 결과를 바꾸지 않는다 (전 삭망 무필터 탐색과 같은 사건 · 같은 시각)',
    (kind) => {
      const phase = kind === 'solar-eclipse' ? 'new' : 'full';
      // #1370 — 내부 함수는 TT 다. `computeEventsForKind` 와 같은 TT 범위로 돌려 결과를 시계로 되돌려 비교한다 (비트 동일).
      const unfiltered = syzygyTimes(
        fullById,
        'moon',
        phase,
        clockJdToTt(START_JD),
        clockJdToTt(END_JD),
      )
        .map((s) => greatestEclipseNear(fullById, 'moon', phase, s)!)
        .filter((g) => g.type !== null);
      expect(fullEvents[kind].map((e) => [e.julianDate, e.eclipseType])).toEqual(
        unfiltered.map((g) => [ttJdToClock(g.julianDate), g.type]),
      );
    },
  );

  it('사건 시각은 삭망 ± 탐색 창 안 · id 날짜는 시각의 UTC 날짜 · 오름차순', () => {
    for (const kind of ECLIPSE_KINDS) {
      const phase = kind === 'solar-eclipse' ? 'new' : 'full';
      const syz = syzygyTimes(fullById, 'moon', phase, START_JD, END_JD);
      const events = fullEvents[kind];
      for (let i = 0; i < events.length; i += 1) {
        const e = events[i]!;
        const nearest = Math.min(...syz.map((s) => Math.abs(s - clockJdToTt(e.julianDate))));
        expect(nearest).toBeLessThan(GREATEST_ECLIPSE_HALF_WINDOW_DAYS);
        expect(e.subjectId).toBe('moon');
        if (i > 0) expect(e.julianDate).toBeGreaterThan(events[i - 1]!.julianDate);
      }
      expect(new Set(events.map((e) => e.id)).size).toBe(events.length);
    }
    expect(fullEvents['solar-eclipse'].map((e) => e.id)).toContain('solar-eclipse:2017-08-21');
    expect(fullEvents['solar-eclipse'].map((e) => e.id)).toContain('solar-eclipse:2024-04-08');
    expect(fullEvents['lunar-eclipse'].map((e) => e.id)).toContain('lunar-eclipse:2025-03-14');
  });
});

/**
 * E5 — 판정식 단위 (합성 배치). 지구 원점, 태양 +x 1 AU, 달은 태양–지구 선 근처. 반경은 데이터 값.
 */
describe('#1354 E5 — 판정식 단위', () => {
  const AU = 1.495978707e11;
  const R: EclipseRadii = { sun: 695_700e3, earth: 6_378_137, moon: 1_737_400 };
  const SUN: Vec3Double = [AU, 0, 0];
  /** 달을 지구–태양 선 위 거리 `r` 에, 축에서 `offset` [m] 만큼 z 로 띄운다. */
  const moonAt = (r: number, offset = 0): Vec3Double => [r, 0, offset];
  const PERIGEE = 356_500e3;
  const APOGEE = 406_700e3;

  it('일식 — 정렬 + 근지 → 개기 / 원지 → 금환 / γ = 2 → 없음', () => {
    const perigee = solarEclipseGeometry(moonAt(PERIGEE), SUN, R);
    expect(perigee.gamma).toBeCloseTo(0, 9);
    expect(perigee.type).toBe('total');
    const apogee = solarEclipseGeometry(moonAt(APOGEE), SUN, R);
    expect(apogee.type).toBe('annular');
    // 축 (태양 → 달) 과 지구 중심 거리 = h·AU / |AU − r| (h ≪ r) — γ = 2 가 되는 h.
    const far = solarEclipseGeometry(moonAt(PERIGEE, (2 * R.earth * (AU - PERIGEE)) / AU), SUN, R);
    expect(far.gamma).toBeCloseTo(2, 6);
    expect(far.type).toBeNull();
  });

  /** 축 거리 offset [m] 에서 `pred` 가 참 → 거짓으로 바뀌는 경계 (이분법). */
  function boundaryOffset(pred: (offset: number) => boolean, lo: number, hi: number): number {
    expect(pred(lo)).toBe(true);
    expect(pred(hi)).toBe(false);
    for (let i = 0; i < 60; i += 1) {
      const mid = (lo + hi) / 2;
      if (pred(mid)) lo = mid;
      else hi = mid;
    }
    return (lo + hi) / 2;
  }

  it('일식 — 기본면 반경 식: 정렬 시 l1 · l2 = (z·tan f ± k·sec f) / R⊕', () => {
    const g = solarEclipseGeometry(moonAt(PERIGEE), SUN, R);
    const d = AU - PERIGEE;
    const f1 = Math.asin((R.sun + R.moon) / d);
    const f2 = Math.asin((R.sun - R.moon) / d);
    expect(g.penumbraRadius).toBeCloseTo(
      (PERIGEE * Math.tan(f1) + R.moon / Math.cos(f1)) / R.earth,
      12,
    );
    expect(g.umbraRadius).toBeCloseTo(
      (PERIGEE * Math.tan(f2) - R.moon / Math.cos(f2)) / R.earth,
      12,
    );
  });

  it('일식 — γ 경계: γ = 1 + l1 에서 부분 ↔ 없음 · γ = 1 + |l2| 에서 비중심 개기 ↔ 부분', () => {
    const geo = (h: number) => solarEclipseGeometry(moonAt(PERIGEE, h), SUN, R);
    const STEP = 1; // 경계 양쪽 1 m
    // 반영 경계 — 1.2 R⊕ (부분) ~ 2 R⊕ (없음) 사이.
    const penumbraEdge = boundaryOffset((h) => geo(h).type !== null, 1.2 * R.earth, 2 * R.earth);
    const justIn = geo(penumbraEdge - STEP);
    const justOut = geo(penumbraEdge + STEP);
    expect(justIn.type).toBe('partial');
    expect(justOut.type).toBeNull();
    expect(Math.abs(justIn.gamma - (1 + justIn.penumbraRadius))).toBeLessThan(1e-6);
    // 본영 경계 — 근지라 l2 < 0 (개기 쪽). 축이 지구를 비껴도 γ < 1 + |l2| 면 비중심 개기.
    expect(geo(0).umbraRadius).toBeLessThan(0);
    const umbraEdge = boundaryOffset((h) => geo(h).type === 'total', 0, 1.2 * R.earth);
    const inside = geo(umbraEdge - STEP);
    const outside = geo(umbraEdge + STEP);
    expect(inside.gamma).toBeGreaterThan(1);
    expect(inside.type).toBe('total');
    expect(outside.type).toBe('partial');
    expect(Math.abs(inside.gamma - (1 + Math.abs(inside.umbraRadius)))).toBeLessThan(1e-6);
  });

  it('월식 — σ 3구간 경계 (Ru − S☾ · Ru + S☾ · Rp + S☾)', () => {
    const r = 384_400e3;
    // 태양을 −x 에 두면 반태양점은 +x — 달을 +x 에서 각 σ 만큼 띄운다 (지구 원점 기준 반경 r 고정 → 반경 · 시반경 불변).
    const SUN_BEHIND: Vec3Double = [-AU, 0, 0];
    const at = (sigma: number): Vec3Double => [r * Math.cos(sigma), 0, r * Math.sin(sigma)];
    const base = lunarEclipseGeometry(at(0), SUN_BEHIND, R);
    expect(base.separation).toBeCloseTo(0, 12);
    expect(base.type).toBe('total');
    const eps = 1e-6;
    const bounds: Array<
      [number, 'total' | 'partial' | 'penumbral' | null, 'partial' | 'penumbral' | null]
    > = [
      [base.umbraRadius - base.moonSemiDiameter, 'total', 'partial'],
      [base.umbraRadius + base.moonSemiDiameter, 'partial', 'penumbral'],
      [base.penumbraRadius + base.moonSemiDiameter, 'penumbral', null],
    ];
    for (const [edge, inside, outside] of bounds) {
      expect(lunarEclipseGeometry(at(edge - eps), SUN_BEHIND, R).type).toBe(inside);
      expect(lunarEclipseGeometry(at(edge + eps), SUN_BEHIND, R).type).toBe(outside);
    }
    // Danjon 식 그대로 — NASA `LEcat5/shadow.html` 1-5 · 1-6 (계수 1.01 을 여기서 다시 쓴다 — 상수가 바뀌면 FAIL).
    const pm = Math.asin(R.earth / r);
    const ps = Math.asin(R.earth / AU);
    const ss = Math.asin(R.sun / AU);
    expect(base.penumbraRadius).toBeCloseTo(1.01 * pm + ss + ps, 14);
    expect(base.umbraRadius).toBeCloseTo(1.01 * pm - ss + ps, 14);
    expect(base.moonSemiDiameter).toBeCloseTo(Math.asin(R.moon / r), 14);
    // 실제 값 규모 `~0.7°`.
    expect(base.umbraRadius / DEG).toBeGreaterThan(0.6);
    expect(base.umbraRadius / DEG).toBeLessThan(0.8);
  });
});
