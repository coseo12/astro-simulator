/**
 * #1354 PR1 — 달 궤도 시간 변화 모델 (ADR `docs/decisions/20261017-1354-lunar-precession-eclipses.md` 결정 M1 ~ M5 · V1).
 *
 * DoD E1 (삭망 대역) · P1 (달 위치) · I1 (다른 천체 불변) · I2 (J2000 달 · N-body 초기 상태) · V1 (궤도선) + §교차검증
 * 구현 계약 3건 (카드 공전주기 수치 · N-body 「율 반영 · 주기 항 미적용」 의 J2000 이외 시각 단언 · 로더 거부).
 *
 * 기준값은 네트워크 없이 `events/__test-utils__/lunar-reference-fixture.ts` (DE441 — 출처 · 조회 조건은 그 파일 머리말).
 */
import solarSystemRaw from '@astro-simulator/shared/data/solar-system.json' with { type: 'json' };
import {
  GENERAL_PRECESSION_DEG_PER_CENTURY,
  J2000_JD,
  JULIAN_CENTURY_DAYS,
} from '@astro-simulator/shared';
import { describe, expect, it } from 'vitest';
import {
  loadSolarSystem,
  type LoadedCelestialBody,
  type LoadedSolarSystem,
} from '../ephemeris/solar-system-loader.js';
import { EVENT_KINDS } from '../events/event-kinds.js';
import { computeEventsForKind } from '../events/compute-events.js';
import {
  DE441_FULL_MOON_JD,
  DE441_MOON_POSITIONS,
  DE441_NEW_MOON_JD,
} from '../events/__test-utils__/lunar-reference-fixture.js';
import { sampleOrbitPoints } from '../scene/orbit-sampling.js';
import { renderScaleForTier } from '../scene/tier.js';
import { createTrailBodySpec, sampleTrailLocal } from '../scene/trail-sampling.js';
import { resolveBodyChainPosition } from './body-chain.js';
import { orbitMu, orbitalPeriod, positionAt } from './kepler.js';
import { buildInitialState } from './nbody-engine.js';
import {
  elementsAt,
  meanMotionOf,
  parentRelativePositionAt,
  periodicArgumentsAt,
  siderealPeriodOf,
} from './orbit-elements-at.js';
import { orbitalStateAt } from './state-vector.js';

const DEG = Math.PI / 180;
const TWO_PI = 2 * Math.PI;
const SECONDS_PER_DAY = 86_400;
const HOURS_PER_DAY = 24;
const KM = 1000;

/** 1900-01-01 · J2000 · 2026-10-17 · 2100-01-01 (스크러버 범위 양 끝 + 기본 로드 + 「지금」 표본). */
const JD_1900 = 2_415_020.5;
const JD_2026 = 2_461_330.5;
const JD_2100 = 2_488_069.5;
const SAMPLE_JDS = [JD_1900, J2000_JD, JD_2026, JD_2100] as const;

/** DoD E1 — 삭망 시각 허용 [h]. B9 실측 max `0.76` h (ADR 축 M). */
const E1_SYZYGY_TOLERANCE_HOURS = 1.0;
/** E1 탐색 창 [일] — 기준 시각 ±3일 안에서 모델 근을 찾는다 (이각 속도 `~12°/일` → 창 끝 `|f| ≈ 0.64 rad`, 감김 없음). */
const SYZYGY_SEARCH_HALF_WINDOW_DAYS = 3;
const SYZYGY_BISECTION_STEPS = 48;

/** DoD P1 허용 — `|Δλ| ≤ 0.2°` · `|Δβ| ≤ 0.1°` · `|Δr| ≤ 1,000 km`. */
const P1_LONGITUDE_TOLERANCE_DEG = 0.2;
const P1_LATITUDE_TOLERANCE_DEG = 0.1;
const P1_DISTANCE_TOLERANCE_KM = 1000;

type RawSystem = typeof solarSystemRaw;

/** 원본 JSON 사본 — 테스트마다 변형해도 다른 테스트에 새지 않는다. */
function rawCopy(): RawSystem {
  return structuredClone(solarSystemRaw);
}

/** 달의 `rates` · `periodicTerms` 를 뺀 판본 (V0 — #1354 이전 데이터와 같은 달 요소). */
function rawWithoutLunarModel(): RawSystem {
  const raw = rawCopy();
  const moon = raw.bodies.find((b) => b.id === 'moon')!;
  const orbit = moon.orbit as Record<string, unknown>;
  delete orbit.rates;
  delete orbit.periodicTerms;
  return raw;
}

function byIdOf(system: LoadedSolarSystem): Map<string, LoadedCelestialBody> {
  return new Map(system.bodies.map((b) => [b.id, b] as const));
}

const full = loadSolarSystem();
const fullById = byIdOf(full);
const v0 = loadSolarSystem(rawWithoutLunarModel());
const v0ById = byIdOf(v0);

const moon = fullById.get('moon')!;
const earth = fullById.get('earth')!;
const sun = fullById.get('sun')!;
const moonMu = orbitMu(moon, earth);

/** (−π, π] 로 감는다. */
function wrapAngle(a: number): number {
  let x = a % TWO_PI;
  if (x > Math.PI) x -= TWO_PI;
  if (x <= -Math.PI) x += TWO_PI;
  return x;
}

/** 지구 중심 황경차 `λ☾ − λ☉ − 위상` — 장면과 같은 체인 위치 (`resolveBodyChainPosition`). */
function syzygyFunction(
  byId: ReadonlyMap<string, LoadedCelestialBody>,
  jd: number,
  phaseOffset: number,
): number {
  const moonLocal = resolveBodyChainPosition(byId, 'moon', jd)!.local!;
  const earthWorld = resolveBodyChainPosition(byId, 'earth', jd)!.world;
  // 태양의 지구 중심 위치 = −(지구 일심 위치) (Kepler 경로에서 태양 world = 원점).
  const sunLongitude = Math.atan2(-earthWorld[1], -earthWorld[0]);
  return wrapAngle(Math.atan2(moonLocal[1], moonLocal[0]) - sunLongitude - phaseOffset);
}

/**
 * E1 테스트 헬퍼 — 기준 시각 근처의 모델 삭망 시각 (이벤트 계산은 PR2 범위라 여기서 직접 구한다). 창 양 끝 부호가 같으면
 * (모델 근이 창 밖) `NaN` — 판정에서 FAIL 로 드러난다.
 */
function modelSyzygyNear(
  byId: ReadonlyMap<string, LoadedCelestialBody>,
  referenceJd: number,
  phaseOffset: number,
): number {
  let lo = referenceJd - SYZYGY_SEARCH_HALF_WINDOW_DAYS;
  let hi = referenceJd + SYZYGY_SEARCH_HALF_WINDOW_DAYS;
  let fLo = syzygyFunction(byId, lo, phaseOffset);
  const fHi = syzygyFunction(byId, hi, phaseOffset);
  if (!(fLo < 0 && fHi > 0)) return Number.NaN;
  for (let i = 0; i < SYZYGY_BISECTION_STEPS; i += 1) {
    const mid = (lo + hi) / 2;
    const fMid = syzygyFunction(byId, mid, phaseOffset);
    if (fMid < 0 === fLo < 0) {
      lo = mid;
      fLo = fMid;
    } else {
      hi = mid;
    }
  }
  return (lo + hi) / 2;
}

/** 717개 삭망의 `|모델 − 기준|` 최댓값 [h] (근을 못 찾으면 `Infinity`). */
function maxSyzygyErrorHours(byId: ReadonlyMap<string, LoadedCelestialBody>): number {
  let worst = 0;
  const cases: Array<[readonly number[], number]> = [
    [DE441_NEW_MOON_JD, 0],
    [DE441_FULL_MOON_JD, Math.PI],
  ];
  for (const [refs, phase] of cases) {
    for (const ref of refs) {
      const t = modelSyzygyNear(byId, ref, phase);
      const err = Number.isNaN(t) ? Infinity : Math.abs(t - ref) * HOURS_PER_DAY;
      worst = Math.max(worst, err);
    }
  }
  return worst;
}

/** 지구 중심 (λ, β [도], r [km]). */
function eclipticOf(p: readonly [number, number, number]): [number, number, number] {
  const r = Math.hypot(p[0], p[1], p[2]);
  return [Math.atan2(p[1], p[0]) / DEG, Math.asin(p[2] / r) / DEG, r / KM];
}

describe('#1354 E1 — 삭망 시각 (DE441 717개, 1901 ~ 1910 · 2021 ~ 2030 · 2091 ~ 2099)', () => {
  it('기준 표본 수 — 삭 358 · 망 359 (fixture 전제)', () => {
    expect(DE441_NEW_MOON_JD).toHaveLength(358);
    expect(DE441_FULL_MOON_JD).toHaveLength(359);
  });

  it(`전 표본 |모델 − 기준| ≤ ${E1_SYZYGY_TOLERANCE_HOURS} h`, () => {
    const worst = maxSyzygyErrorHours(fullById);
    expect(worst).toBeLessThanOrEqual(E1_SYZYGY_TOLERANCE_HOURS);
  });

  it('판별력 — V0 (상수 요소) 은 같은 대역을 넘는다 (양성 대조군)', () => {
    // ADR 1-B — V0 삭망 오차 `−26.54 ~ +27.01` h.
    expect(maxSyzygyErrorHours(v0ById)).toBeGreaterThan(E1_SYZYGY_TOLERANCE_HOURS * 10);
  });
});

describe('#1354 P1 — 달 위치 (DE441, 4시각)', () => {
  it.each(DE441_MOON_POSITIONS.map((s) => [s.label, s] as const))(
    '%s — |Δλ| ≤ 0.2° · |Δβ| ≤ 0.1° · |Δr| ≤ 1,000 km',
    (_label, sample) => {
      const local = resolveBodyChainPosition(fullById, 'moon', sample.julianDate)!.local!;
      const [lam, bet, r] = eclipticOf(local);
      const ref = eclipticOf([
        sample.geocentricKm[0] * KM,
        sample.geocentricKm[1] * KM,
        sample.geocentricKm[2] * KM,
      ]);
      expect(Math.abs(wrapAngle((lam - ref[0]) * DEG) / DEG)).toBeLessThanOrEqual(
        P1_LONGITUDE_TOLERANCE_DEG,
      );
      expect(Math.abs(bet - ref[1])).toBeLessThanOrEqual(P1_LATITUDE_TOLERANCE_DEG);
      expect(Math.abs(r - ref[2])).toBeLessThanOrEqual(P1_DISTANCE_TOLERANCE_KM);
    },
  );

  it('판별력 — V0 은 2026-10-17 에서 황위 대역을 넘는다 (ADR 1-B `Δβ +6.737°`)', () => {
    const sample = DE441_MOON_POSITIONS.find((s) => s.label === '2026-10-17')!;
    const local = resolveBodyChainPosition(v0ById, 'moon', sample.julianDate)!.local!;
    const ref = eclipticOf([
      sample.geocentricKm[0] * KM,
      sample.geocentricKm[1] * KM,
      sample.geocentricKm[2] * KM,
    ]);
    expect(Math.abs(eclipticOf(local)[1] - ref[1])).toBeGreaterThan(P1_LATITUDE_TOLERANCE_DEG * 10);
  });
});

describe('#1354 M3 — elementsAt', () => {
  it('율 없는 궤도는 같은 객체 (비트 동일 경로)', () => {
    for (const b of full.bodies) {
      if (!b.orbit || b.orbit.rates) continue;
      for (const jd of SAMPLE_JDS) expect(elementsAt(b.orbit, jd)).toBe(b.orbit);
    }
  });

  it('율 보유 천체는 달 하나 (I1 전제 — 공허 통과 방지)', () => {
    expect(full.bodies.filter((b) => b.orbit?.rates).map((b) => b.id)).toEqual(['moon']);
    expect(full.bodies.filter((b) => b.orbit?.periodicTerms).map((b) => b.id)).toEqual(['moon']);
  });

  it('J2000 (Δt = 0) 에서 각 요소 값이 데이터 요소와 같다 — epoch 만 같은 값으로 다시 쓴다', () => {
    const el = elementsAt(moon.orbit!, J2000_JD);
    expect(el.longitudeOfAscendingNode).toBe(moon.orbit!.longitudeOfAscendingNode);
    expect(el.argumentOfPeriapsis).toBe(moon.orbit!.argumentOfPeriapsis);
    expect(el.meanAnomalyAtEpoch).toBe(moon.orbit!.meanAnomalyAtEpoch);
    expect(el.epoch).toBe(J2000_JD);
  });

  it('평균경도 율이 데이터 율이다 — Kepler n 이 아니다 (ADR 후보 A1 결함 회피)', () => {
    const jd = J2000_JD + 3652.5;
    const el = elementsAt(moon.orbit!, jd);
    const meanLongitude =
      el.longitudeOfAscendingNode + el.argumentOfPeriapsis + el.meanAnomalyAtEpoch;
    const meanLongitude0 =
      moon.orbit!.longitudeOfAscendingNode +
      moon.orbit!.argumentOfPeriapsis +
      moon.orbit!.meanAnomalyAtEpoch;
    expect(meanLongitude - meanLongitude0).toBeCloseTo(
      moon.orbit!.rates!.meanLongitude * 3652.5,
      9,
    );
    // 평균근점이각 율 = L̇ − ϖ̇ (근점월 27.5545 일, ADR 1-C).
    expect((TWO_PI / meanMotionOf(moon.orbit!, moonMu) / SECONDS_PER_DAY).toFixed(4)).toBe(
      '27.5545',
    );
  });
});

describe('#1354 M2 — 로더 (율 틀 변환 · 주기 항 단위 · 거부)', () => {
  it('율 = (Meeus 원값 − p_A) [도/세기] → rad/일', () => {
    const rates = moon.orbit!.rates!;
    const toScene = (degPerCentury: number) =>
      ((degPerCentury - GENERAL_PRECESSION_DEG_PER_CENTURY) * DEG) / JULIAN_CENTURY_DAYS;
    expect(rates.meanLongitude).toBe(toScene(481267.88123421));
    expect(rates.longitudeOfAscendingNode).toBe(toScene(-1934.1362891));
    expect(rates.longitudeOfPerihelion).toBe(toScene(4069.0137287));
    // 검산 (ADR §실측 기준값 출처) — 평균경도 율 13.1763582 °/일 (J2000 고정), 승교점 퇴행 주기 18.6 년.
    expect(rates.meanLongitude / DEG).toBeCloseTo(13.1763582, 7);
    expect(TWO_PI / Math.abs(rates.longitudeOfAscendingNode) / 365.25).toBeCloseTo(18.6, 1);
  });

  it('주기 항 9행 — 경도 · 위도는 rad, 거리는 m', () => {
    const terms = moon.orbit!.periodicTerms!;
    expect(terms).toHaveLength(9);
    expect(terms.filter((t) => t.component === 'longitude')).toHaveLength(4);
    expect(terms.filter((t) => t.component === 'latitude')).toHaveLength(3);
    expect(terms.filter((t) => t.component === 'distance')).toHaveLength(2);
    expect(terms[0]!.amplitude).toBe(1.274027 * DEG);
    expect(terms.find((t) => t.component === 'distance')!.amplitude).toBe(-3699.111 * KM);
  });

  it('rates.frame 은 literal — 다른 틀 이름은 파싱 실패', () => {
    const raw = rawCopy();
    const orbit = raw.bodies.find((b) => b.id === 'moon')!.orbit as { rates: { frame: string } };
    orbit.rates.frame = 'J2000';
    expect(() => loadSolarSystem(raw)).toThrow();
  });

  /** 달의 주기 항을 다른 천체에 옮겨 단 판본. */
  function rawWithTermsOn(id: string): RawSystem {
    const raw = rawCopy();
    const terms = (raw.bodies.find((b) => b.id === 'moon')!.orbit as { periodicTerms: unknown })
      .periodicTerms;
    const target = raw.bodies.find((b) => b.id === id)!;
    (target.orbit as Record<string, unknown>).periodicTerms = structuredClone(terms);
    return raw;
  }

  it.each(['earth', 'jupiter', 'pluto', 'halley', 'ceres'])(
    '계약 3 — 「모체가 태양을 도는 위성」 이 아닌 %s 에 periodicTerms 가 있으면 거부',
    (id) => {
      expect(() => loadSolarSystem(rawWithTermsOn(id))).toThrow(/periodicTerms/);
    },
  );

  it('결정 M2 의 인자 규칙 — 모체가 태양을 도는 다른 위성 (포보스 · 카론) 은 받는다 (거부 경계 고정)', () => {
    // 인자 D · M 은 모체 (화성 · 명왕성) 요소로 정의된다 — 규칙은 천체 이름이 아니라 체인 구조다 (ADR 결정 M2).
    for (const id of ['phobos', 'charon']) {
      expect(() => loadSolarSystem(rawWithTermsOn(id))).not.toThrow();
    }
  });
});

describe('#1354 I1 — 다른 천체 불변 (달 율 · 주기 항 유 ↔ 무, 같은 jd)', () => {
  const others = full.bodies.filter((b) => b.id !== 'moon');

  it('체인 world 위치 (Kepler 장면과 같은 함수) 비트 동일 — 35 천체 × 4시각', () => {
    let n = 0;
    for (const b of others) {
      for (const jd of SAMPLE_JDS) {
        expect(resolveBodyChainPosition(fullById, b.id, jd), `${b.id} @ ${jd}`).toEqual(
          resolveBodyChainPosition(v0ById, b.id, jd),
        );
        n += 1;
      }
    }
    expect(n).toBe(35 * 4);
  });

  it('달 외 천체의 위치 = positionAt(orbit, jd, orbitMu) 그대로 (단일 함수가 경로를 바꾸지 않는다)', () => {
    for (const b of others) {
      if (!b.orbit || !b.parentId) continue;
      const parent = fullById.get(b.parentId)!;
      const gp = parent.parentId == null ? null : fullById.get(parent.parentId)!;
      for (const jd of SAMPLE_JDS) {
        expect(parentRelativePositionAt(b, parent, gp, jd)).toEqual(
          positionAt(b.orbit, jd, orbitMu(b, parent)),
        );
      }
    }
  });

  it('궤도선 정점 · 궤적 정점 비트 동일', () => {
    for (const b of others) {
      if (!b.orbit || !b.parentId) continue;
      const v0Body = v0ById.get(b.id)!;
      const parent = fullById.get(b.parentId)!;
      const v0Parent = v0ById.get(b.parentId)!;
      for (const jd of SAMPLE_JDS) {
        const a = sampleOrbitPoints(b, 'solar', jd)!;
        const c = sampleOrbitPoints(v0Body, 'solar', jd)!;
        expect(a.map((p) => [p.x, p.y, p.z])).toEqual(c.map((p) => [p.x, p.y, p.z]));
        const specA = createTrailBodySpec(b, parent, jd)!;
        const specC = createTrailBodySpec(v0Body, v0Parent, jd)!;
        expect(specA).toEqual(specC);
        const outA = new Float64Array(3 * (specA.segments + 1));
        const outC = new Float64Array(3 * (specC.segments + 1));
        sampleTrailLocal(specA, jd, 1, 1 / 12, outA, 0);
        sampleTrailLocal(specC, jd, 1, 1 / 12, outC, 0);
        expect(Array.from(outA)).toEqual(Array.from(outC));
      }
    }
  });

  it('기존 6종 사건 목록 julianDate 비트 동일 (1900 ~ 2100)', () => {
    // 식 2종 (#1354 PR2 — `syzygy-eclipse`) 은 달 위치가 곧 사건이라 이 대조의 대상이 아니다 (eclipse-events.test.ts).
    const legacy = EVENT_KINDS.filter((k) => k.computation.type !== 'syzygy-eclipse');
    expect(legacy).toHaveLength(6);
    for (const kind of legacy) {
      const a = computeEventsForKind(fullById, kind, JD_1900, JD_2100).map((e) => e.julianDate);
      const c = computeEventsForKind(v0ById, kind, JD_1900, JD_2100).map((e) => e.julianDate);
      expect(a.length, kind.id).toBeGreaterThan(0);
      expect(a, kind.id).toEqual(c);
    }
  });

  it('양성 대조군 — 달은 실제로 바뀐다 (두 판본이 같은 데이터가 아니다)', () => {
    const a = resolveBodyChainPosition(fullById, 'moon', JD_2026)!.local!;
    const c = resolveBodyChainPosition(v0ById, 'moon', JD_2026)!.local!;
    expect(Math.hypot(a[0] - c[0], a[1] - c[1], a[2] - c[2])).toBeGreaterThan(10_000 * KM);
  });
});

/** N-body 초기 상태에서 천체 1개의 [위치, 속도] (flat 배열 → 튜플). */
function stateOf(
  state: ReturnType<typeof buildInitialState>,
  id: string,
): { p: [number, number, number]; v: [number, number, number] } {
  const i = state.ids.indexOf(id);
  return {
    p: [state.positions[3 * i]!, state.positions[3 * i + 1]!, state.positions[3 * i + 2]!],
    v: [state.velocities[3 * i]!, state.velocities[3 * i + 1]!, state.velocities[3 * i + 2]!],
  };
}

const dist = (a: readonly number[], b: readonly number[]) =>
  Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);

describe('#1354 I2 — J2000 달 · N-body 초기 상태 (결정 M5)', () => {
  it('J2000 달 local 이 V0 대비 5,357 km 바뀐다 (Q-M (b) — 주기 9항, 기록값)', () => {
    const a = resolveBodyChainPosition(fullById, 'moon', J2000_JD)!.local!;
    const c = resolveBodyChainPosition(v0ById, 'moon', J2000_JD)!.local!;
    // ADR 영향 범위 실측 `5,357 km` — 정수 km 반올림으로 고정 (주기 항 · 인자 결함이면 바뀐다).
    expect(Math.round(dist(a, c) / KM)).toBe(5357);
  });

  it('J2000 N-body 초기 상태는 V0 와 비트 동일 (율 × 0 · 주기 항 미적용)', () => {
    const a = buildInitialState(full, J2000_JD);
    const c = buildInitialState(v0, J2000_JD);
    expect(a.ids).toEqual(c.ids);
    expect(Array.from(a.positions)).toEqual(Array.from(c.positions));
    expect(Array.from(a.velocities)).toEqual(Array.from(c.velocities));
  });

  /**
   * 계약 2 — J2000 이외 시각. 모체 반동 없이 지구 상태에 달 상대 상태를 더한 값이므로, 빼서 되돌린 값은 지구 일심 위치
   * (`~1.5e11 m`) 의 float64 반올림 (`~3e-5 m`) 안에서 율 반영 요소의 상태 벡터와 같다.
   */
  const NBODY_ROUNDTRIP_TOLERANCE_M = 1;
  const NBODY_JDS = [2_433_282.5 /* 1950-01-01 */, JD_2026, 2_486_394.5 /* 2095-06-01 */];

  it.each(NBODY_JDS)(
    '계약 2 — JD %d 의 달 초기 상태 = elementsAt (율 반영) 상태 벡터 · 주기 항 미적용',
    (jd) => {
      const s = buildInitialState(full, jd);
      const m = stateOf(s, 'moon');
      const e = stateOf(s, 'earth');
      const rel = {
        p: [m.p[0] - e.p[0], m.p[1] - e.p[1], m.p[2] - e.p[2]],
        v: [m.v[0] - e.v[0], m.v[1] - e.v[1], m.v[2] - e.v[2]],
      };
      const mean = orbitalStateAt(elementsAt(moon.orbit!, jd), jd, moonMu);
      expect(dist(rel.p, mean.position)).toBeLessThanOrEqual(NBODY_ROUNDTRIP_TOLERANCE_M);
      expect(dist(rel.v, mean.velocity)).toBeLessThanOrEqual(1e-6);
      // 율 반영 — 고정 요소 상태와 다르다 (승교점 · 근지점 · 평균경도가 돌았다).
      const fixed = orbitalStateAt(moon.orbit!, jd, moonMu);
      expect(dist(rel.p, fixed.position)).toBeGreaterThan(10_000 * KM);
      // 주기 항 미적용 — 장면 위치 (주기 항 포함) 와 다르다.
      const scene = parentRelativePositionAt(moon, earth, sun, jd);
      expect(dist(rel.p, scene)).toBeGreaterThan(1_000 * KM);
    },
  );
});

describe('#1354 V1 — 궤도선 = 현재 시각 평균 요소 타원', () => {
  /** 점에서 폴리라인까지 최소 거리. */
  function polylineDistance(p: readonly number[], pts: ReadonlyArray<readonly number[]>): number {
    let best = Infinity;
    for (let i = 0; i < pts.length - 1; i += 1) {
      const a = pts[i]!;
      const b = pts[i + 1]!;
      const ab = [b[0]! - a[0]!, b[1]! - a[1]!, b[2]! - a[2]!];
      const ap = [p[0]! - a[0]!, p[1]! - a[1]!, p[2]! - a[2]!];
      const t = Math.max(
        0,
        Math.min(
          1,
          (ab[0]! * ap[0]! + ab[1]! * ap[1]! + ab[2]! * ap[2]!) /
            (ab[0]! ** 2 + ab[1]! ** 2 + ab[2]! ** 2),
        ),
      );
      best = Math.min(
        best,
        Math.hypot(ap[0]! - t * ab[0]!, ap[1]! - t * ab[1]!, ap[2]! - t * ab[2]!),
      );
    }
    return best;
  }

  const ORBIT_LINE_SEGMENTS = 64;
  const a = moon.orbit!.semiMajorAxis;
  const e = moon.orbit!.eccentricity;
  /**
   * ⚠️ DoD V1 재조정 (사용자 합의 2026-10-17 — PR 본문 · CHANGELOG Notes 동시 기록). ADR 의 한계 `a·(1 − cos(π/64))`
   * (`463.4 km`) 는 원의 현 처짐이다. 궤도선은 초점 기준 진근점각 등간격이라 원지점 쪽 현이 길고 (`r_apo·Δν`) 그 점의 곡률
   * 반경이 `b²/a` 로 작아, 처짐 상한은 `(a(1+e)·Δν)² / (8·a(1−e²)) = a·(1+e)/(1−e)·Δν²/8` (`517.4 km`) 다. 2026-10-17
   * (원지점 근처, r `405,853 km`) 에서 새로 그린 선과 달의 거리 실측 `501.5 km` 가 원 한계를 넘고 타원 한계 안이다.
   * 이 판정은 **그 시각에 새로 그린 선** 기준이다 — 재생 중 장면의 선은 최대 `4.49` 일 묵고, 그때 거리 상한은 `672 km`
   * (갱신 문턱 `0.5°` 의 비용, `PRECESSING_ORBIT_LINE_THRESHOLD_RAD` 주석의 실측표) 다. 재생 중 `517.4 km` 초과는 회귀가 아니다.
   */
  const ELLIPSE_POLYLINE_SAG_M =
    ((a * (1 + e)) / (1 - e)) * ((TWO_PI / ORBIT_LINE_SEGMENTS) ** 2 / 8);

  function moonLineDistance(jd: number, lineJd: number): number {
    const scale = renderScaleForTier('solar');
    const pts = sampleOrbitPoints(moon, 'solar', lineJd)!.map((v) => [
      v.x / scale,
      v.y / scale,
      v.z / scale,
    ]);
    const meanPosition = positionAt(elementsAt(moon.orbit!, jd), jd, moonMu);
    return polylineDistance(meanPosition, pts);
  }

  it.each([JD_1900, JD_2026, JD_2100])(
    'JD %d — 평균 요소 위치와 그 시각 궤도선의 최소 거리 ≤ 타원 처짐 상한',
    (jd) => {
      expect(moonLineDistance(jd, jd)).toBeLessThanOrEqual(ELLIPSE_POLYLINE_SAG_M);
    },
  );

  it('판별력 — 데이터 epoch 궤도선 (갱신 안 함, 축 V (b)) 은 같은 시각에 수만 km 벗어난다', () => {
    expect(moonLineDistance(JD_2026, J2000_JD)).toBeGreaterThan(10_000 * KM);
  });

  it('궤적 사양 meanMotion = L̇ − ϖ̇ · 머리 = 평균 요소 위치', () => {
    const spec = createTrailBodySpec(moon, earth, JD_2026)!;
    expect(spec.meanMotion).toBe(meanMotionOf(moon.orbit!, moonMu));
    const out = new Float64Array(3 * (spec.segments + 1));
    sampleTrailLocal(spec, JD_2026, 1, 1 / 12, out, 0);
    const mean = positionAt(elementsAt(moon.orbit!, JD_2026), JD_2026, moonMu);
    expect(dist([out[0]!, out[1]!, out[2]!], mean) / Math.hypot(...mean)).toBeLessThanOrEqual(
      1e-12,
    );
  });
});

describe('#1354 계약 1 — 정보 카드 달 공전주기 (항성월)', () => {
  it('siderealPeriodOf = 2π / L̇ = 27.32166 일 (Kepler 2π√(a³/μ) 27.32181 일에서 −0.00015 일)', () => {
    const sidereal = siderealPeriodOf(moon.orbit!, moonMu) / SECONDS_PER_DAY;
    const kepler = orbitalPeriod(moon.orbit!.semiMajorAxis, moonMu) / SECONDS_PER_DAY;
    expect(sidereal.toFixed(5)).toBe('27.32166');
    expect(kepler.toFixed(5)).toBe('27.32181');
  });

  it('율 없는 천체는 Kepler 주기와 같다', () => {
    const mars = fullById.get('mars')!;
    const mu = orbitMu(mars, sun);
    expect(siderealPeriodOf(mars.orbit!, mu)).toBe(orbitalPeriod(mars.orbit!.semiMajorAxis, mu));
  });
});

/**
 * PR #1356 리뷰 권고 2 — 주기 항 인자 (D · M · M′ · F) 를 Meeus 47장 다항식 (식 47.2 – 47.5, PyMeeus `Moon.py` 재현값) 과
 * 대조한다. B9 9행은 D 계수가 0 · 2 뿐이라 `L☉ = L_지구 + π` 의 `+π` 가 빠져도 위치가 같다 (`2(D+π) ≡ 2D`) — 위치 테스트로는
 * 못 잡고, D 계수가 홀수인 항 (예: 시차부등 `[1,0,0,0]`) 을 넣는 순간 (ADR §Concrete Prediction B9 → B28) 드러난다.
 */
describe('#1354 주기 항 인자 = Meeus 다항식 (리뷰 권고 2)', () => {
  /** Meeus 다항식 [도] — T = J2000 기준 율리우스 세기. */
  function meeusArgumentsDeg(jd: number) {
    const T = (jd - J2000_JD) / JULIAN_CENTURY_DAYS;
    return {
      D:
        297.8501921 +
        445267.1114034 * T -
        0.0018819 * T ** 2 +
        T ** 3 / 545868 -
        T ** 4 / 113065000,
      M: 357.5291092 + 35999.0502909 * T - 0.0001536 * T ** 2 + T ** 3 / 24490000,
      Mp:
        134.9633964 + 477198.8675055 * T + 0.0087414 * T ** 2 + T ** 3 / 69699 - T ** 4 / 14712000,
      F:
        93.272095 + 483202.0175233 * T - 0.0036539 * T ** 2 - T ** 3 / 3526000 + T ** 4 / 863310000,
    };
  }

  /**
   * 허용 차 [도]. 실측 (모델 − Meeus, D / M / M′ / F): J2000 `+0.005 / −0.002 / +0.137 / −0.032` · 2100-01-01
   * `+0.201 / +0.127 / +0.128 / −0.028` · 1900-01-01 `−0.187 / −0.131 / +0.128 / −0.028` (PR #1356 리뷰 probe 와 J2000 은
   * 같고, 2100 은 `0.01°` 안에서 같다). 최댓값 `0.201°` (2100 D — 1900 과 부호가 반대인 시간 비례 차. 원인 단정은 하지 않는다 — ADR 축 M 「잔여의 추세」) 위에
   * 여유를 두어 `0.3°` 로 둔다. M′ 의 `~0.13°` 는 기점 반올림 (Q-D2 (a) — 기점 값 유지) 이다. `+π` 누락은 D 를 `180°`
   * 옮기므로 이 대역보다 세 자릿수 크다.
   */
  const ARGUMENT_TOLERANCE_DEG = 0.3;

  it.each([
    ['J2000', J2000_JD],
    ['2100-01-01', JD_2100],
  ] as const)('%s — |모델 − Meeus| ≤ 0.3° (D · M · M′ · F)', (_label, jd) => {
    const args = periodicArgumentsAt(
      elementsAt(moon.orbit!, jd),
      moonMu,
      earth.orbit!,
      orbitMu(earth, sun),
      jd,
    );
    const ref = meeusArgumentsDeg(jd);
    for (const key of ['D', 'M', 'Mp', 'F'] as const) {
      const diffDeg = wrapAngle(args[key] - ref[key] * DEG) / DEG;
      expect(Math.abs(diffDeg), key).toBeLessThanOrEqual(ARGUMENT_TOLERANCE_DEG);
    }
  });
});
