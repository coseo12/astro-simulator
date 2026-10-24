import { describe, expect, it } from 'vitest';
import { clockJdToTt, ephemeris, physics } from '@astro-simulator/core';
import { AU, GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import type { BodyStateFn } from '@/core/sim-context';
import {
  computeBodyDistances,
  computeBodyPairDistance,
  computeBodyWorldPosition,
  indexBodies,
} from './body-distance';
import { formatKmKo, formatSunDistance } from './body-info';

const bodies = ephemeris.getSolarSystem().bodies;
const byId = indexBodies(bodies);
const J2000 = ephemeris.J2000_JD;
const DAYS_PER_YEAR = 365.25;
// #1370 — 카드 함수 인자는 장면 시계 JD 다. 기대값을 만드는 물리 함수 (`orbitalStateAt` · `positionAt` ·
// `parentRelativePositionAt`) 는 TT 를 받으므로 `clockJdToTt` 로 옮겨 부른다 (ADR `20261023-1370` §결정 P 진입점 3).

function norm(v: readonly number[]): number {
  return Math.hypot(v[0]!, v[1]!, v[2]!);
}

describe('#1281 computeBodyDistances — 현재 시뮬레이션 시각 기준 거리 (D2)', () => {
  it('지구 태양 거리 == ‖orbitalStateAt(elementsAt(earth.orbit, tt), tt, G·M☉).position‖ (상대 1e-12) + 표시 문자열 일치', () => {
    const earth = byId.get('earth')!;
    const sun = byId.get('sun')!;
    for (const jd of [J2000, J2000 + 100, J2000 + 9_000.5]) {
      const got = computeBodyDistances(byId, 'earth', jd).fromSunM!;
      // #1406 — 지구 (EMB) 는 율 보유라 장면과 같은 시각 요소 (`elementsAt`) 로 기대값을 만든다.
      const tt = clockJdToTt(jd);
      const ref = norm(
        physics.orbitalStateAt(
          physics.elementsAt(earth.orbit!, tt),
          tt,
          GRAVITATIONAL_CONSTANT * sun.mass,
        ).position,
      );
      expect(Math.abs(got - ref) / ref).toBeLessThan(1e-12);
      expect(formatSunDistance(got)).toBe(formatSunDistance(ref));
    }
  });

  it('지구 태양 거리는 12개월 샘플 전부 0.98~1.02 AU', () => {
    for (let month = 0; month < 12; month += 1) {
      const jd = J2000 + (month * DAYS_PER_YEAR) / 12;
      const au = computeBodyDistances(byId, 'earth', jd).fromSunM! / AU;
      expect(au).toBeGreaterThanOrEqual(0.98);
      expect(au).toBeLessThanOrEqual(1.02);
    }
  });

  it('행성은 모체 거리 null (모체 = 태양이라 태양 거리와 중복)', () => {
    expect(computeBodyDistances(byId, 'earth', J2000).fromParentM).toBeNull();
    expect(computeBodyDistances(byId, 'halley', J2000).fromParentM).toBeNull();
  });

  it('달 — 모체(지구) 거리 36~41만 km 대 + 태양 거리 = 지구 + 달 위치 합', () => {
    const d = computeBodyDistances(byId, 'moon', J2000);
    const km = d.fromParentM! / 1000;
    expect(km).toBeGreaterThan(356_000);
    expect(km).toBeLessThan(407_000);
    expect(formatKmKo(km)).toMatch(/^(3[5-9]|40)\.\d만 km$/);
    const earth = byId.get('earth')!;
    const sun = byId.get('sun')!;
    const moon = byId.get('moon')!;
    const tt = clockJdToTt(J2000);
    // #1406 — 지구 (EMB) 는 율 보유 — 장면과 같은 시각 요소.
    const e = physics.orbitalStateAt(
      physics.elementsAt(earth.orbit!, tt),
      tt,
      GRAVITATIONAL_CONSTANT * sun.mass,
    );
    // #1354 결정 M4 — 달은 이론 위치 (`lunarTheory`, #1404) 라 장면과 같은 단일 함수 `parentRelativePositionAt` 로 기대값을
    // 만든다 (그 함수의 정확도는 core `orbit-elements-at.test.ts` E1 · P1 · `lunar-theory.test.ts` 가 DE441 로 단언). 종전
    // `orbitalStateAt(moon.orbit)` 은 J2000 에서도 이론 위치와 `5,617 km` 다르다 (#1404 DoD D10).
    const m = physics.parentRelativePositionAt(moon, earth, sun, tt);
    const ref = norm([e.position[0] + m[0], e.position[1] + m[1], e.position[2] + m[2]]);
    expect(Math.abs(d.fromSunM! - ref) / ref).toBeLessThan(1e-12);
  });

  it('#1305 — 카론 태양 거리 == ‖명왕성(G·M☉) + 카론(G(M_pluto + M_charon))‖ (scene 과 같은 μ, jd ≠ epoch)', () => {
    // 모체 거리 (‖카론 local‖) 는 원궤도라 μ 와 무관하게 ≈ a 다 — μ 를 판별하려면 방향이 들어가는
    // 태양 거리로 본다. μ 를 G·M_pluto 로 되돌리면 카론 위치가 수천 km 움직여 상대 1e-12 를 넘는다.
    const charon = byId.get('charon')!;
    const pluto = byId.get('pluto')!;
    const sun = byId.get('sun')!;
    const jd = J2000 + 9_496.5 + 3.3; // epoch 와 다른 시각 — μ 가 위치를 바꾸는 구간
    const d = computeBodyDistances(byId, 'charon', jd);
    const p = physics.positionAt(pluto.orbit!, clockJdToTt(jd), GRAVITATIONAL_CONSTANT * sun.mass);
    const c = physics.positionAt(
      charon.orbit!,
      clockJdToTt(jd),
      GRAVITATIONAL_CONSTANT * (pluto.mass + charon.mass),
    );
    const ref = norm([p[0] + c[0], p[1] + c[1], p[2] + c[2]]);
    expect(Math.abs(d.fromSunM! - ref) / ref).toBeLessThan(1e-12);
    expect(d.fromParentM! / 1000).toBeGreaterThan(19_500);
    expect(d.fromParentM! / 1000).toBeLessThan(19_700);
  });

  it('핼리 — jd 와 jd + 5년의 표시 문자열이 다르다 (재생 중 갱신의 재료)', () => {
    const a = formatSunDistance(computeBodyDistances(byId, 'halley', J2000).fromSunM!);
    const b = formatSunDistance(
      computeBodyDistances(byId, 'halley', J2000 + 5 * DAYS_PER_YEAR).fromSunM!,
    );
    expect(a).not.toBe(b);
  });

  it('태양(체인 뿌리)은 0, 미등록 id 와 끊긴 체인은 null (fail-visible)', () => {
    expect(computeBodyDistances(byId, 'sun', J2000)).toEqual({ fromSunM: 0, fromParentM: null });
    expect(computeBodyDistances(byId, 'no-such-body', J2000)).toEqual({
      fromSunM: null,
      fromParentM: null,
    });
    const orphan = new Map(byId);
    orphan.delete('earth');
    expect(computeBodyDistances(orphan, 'moon', J2000)).toEqual({
      fromSunM: null,
      fromParentM: null,
    });
  });

  it('엔진 상태값(getBodyState)이 있으면 그것을 쓴다 — Newton 계열 화면 위치와 일치', () => {
    const MOON_FROM_EARTH_M = 354_781_000;
    const calls: Array<[string, string]> = [];
    const getBodyState: BodyStateFn = (id, parentId) => {
      calls.push([id, parentId]);
      if (id === 'moon') return { pos: [MOON_FROM_EARTH_M, 0, 0], vel: [0, 0, 0] };
      if (id === 'earth') return { pos: [AU, 0, 0], vel: [0, 0, 0] };
      return null;
    };
    const d = computeBodyDistances(byId, 'moon', J2000, getBodyState);
    expect(calls).toEqual([
      ['moon', 'earth'],
      ['earth', 'sun'],
    ]);
    expect(d.fromParentM).toBe(MOON_FROM_EARTH_M);
    expect(d.fromSunM).toBe(AU + MOON_FROM_EARTH_M);
  });

  it('엔진 상태값이 null(Kepler · 엔진 미준비)이면 Kepler 식으로 떨어진다', () => {
    const kepler = computeBodyDistances(byId, 'moon', J2000);
    expect(computeBodyDistances(byId, 'moon', J2000, () => null)).toEqual(kepler);
  });

  /**
   * #1370 착수 전 확인 3 (ADR `20261023-1370` §구현 인계) — 엔진 상태 고리와 Kepler 폴백 고리가 섞인 체인. 엔진 상태는 장면
   * `updateAt(clockJd)` 이 TT 로 적분한 값이라 시각 인자가 없다. 폴백 고리가 같은 TT 를 보면, 「모체만 엔진이 TT 위치를 준」 체인이
   * 전부 Kepler 인 체인 (`clockJdToTt` 경로) 과 비트 동일해야 한다. 폴백이 시계를 그대로 쓰면 위성 고리가 ΔT 만큼 어긋난다.
   */
  it('#1370 — 섞인 체인 (모체 = 엔진 상태 · 위성 = Kepler 폴백) 도 같은 TT 를 본다', () => {
    const clockJd = J2000 + 9_000.5;
    const tt = clockJdToTt(clockJd);
    const earth = byId.get('earth')!;
    const sun = byId.get('sun')!;
    const moon = byId.get('moon')!;
    // 엔진이 TT 시각에 둔 지구 (여기서는 그 시각의 Kepler 위치로 흉내 낸다) — 달 고리는 상태 없음 (폴백).
    const earthAtTt = physics.parentRelativePositionAt(earth, sun, null, tt);
    const getBodyState: BodyStateFn = (id) =>
      id === 'earth' ? { pos: [earthAtTt[0], earthAtTt[1], earthAtTt[2]], vel: [0, 0, 0] } : null;
    const mixed = computeBodyWorldPosition(byId, 'moon', clockJd, getBodyState)!;
    const allKepler = computeBodyWorldPosition(byId, 'moon', clockJd)!;
    expect(mixed).toEqual(allKepler);
    // 판별력 — 폴백 고리가 시계 시각 그대로였다면 (달 위치를 clockJd 로) 같지 않다.
    const moonAtClock = physics.parentRelativePositionAt(moon, earth, sun, clockJd);
    expect(mixed).not.toEqual([
      earthAtTt[0] + moonAtClock[0],
      earthAtTt[1] + moonAtClock[1],
      earthAtTt[2] + moonAtClock[2],
    ]);
  });
});

/**
 * #1341 PR2 DoD E1 — 두 천체 거리. 독립 계산 = `physics.orbitalStateAt` 를 모체 체인마다 직접 부른 합 (장면 · 카드가 쓰는
 * `positionAt` 경로와 다른 함수). μ 는 #1305 식 (태양 직속 G·M☉ / 위성 G(M_parent + m)).
 *
 * #1354 결정 M4 — 달 고리는 독립 경로가 없다 (달 이론의 다른 구현을 두지 않는다 — 함수가 둘이면 parity 가
 * 테스트에 기댄다). 그 고리만 장면과 같은 `parentRelativePositionAt` 로 만든다. 정확도는 core E1 · P1 (DE441) 이 단언한다.
 */
describe('#1341 computeBodyPairDistance — 두 천체 물리 거리 (E1)', () => {
  /** `clockJd` = 카드에 넘기는 장면 시계 — 독립 계산도 TT 로 옮겨 부른다 (#1370). */
  function independentWorld(id: string, clockJd: number): [number, number, number] {
    const jd = clockJdToTt(clockJd);
    const w: [number, number, number] = [0, 0, 0];
    let cur = byId.get(id)!;
    while (cur.parentId != null) {
      const parent = byId.get(cur.parentId)!;
      const mu =
        parent.parentId == null
          ? GRAVITATIONAL_CONSTANT * parent.mass
          : GRAVITATIONAL_CONSTANT * (parent.mass + cur.mass);
      const grandparent = parent.parentId == null ? null : byId.get(parent.parentId)!;
      const p = cur.orbit!.rates
        ? physics.parentRelativePositionAt(cur, parent, grandparent, jd)
        : physics.orbitalStateAt(cur.orbit!, jd, mu).position;
      w[0] += p[0];
      w[1] += p[1];
      w[2] += p[2];
      cur = parent;
    }
    return w;
  }

  const PAIRS = [
    ['earth', 'mars'],
    ['earth', 'moon'],
    ['jupiter', 'io'],
    ['moon', 'mars'],
    ['io', 'europa'],
    ['sun', 'neptune'],
  ] as const;

  it.each(PAIRS)('%s–%s == 독립 Kepler 계산 (상대 1e-12, jd 3종 · 순서 무관)', (a, b) => {
    for (const jd of [J2000 - 3_650.25, J2000, J2000 + 9_000.5]) {
      const wa = independentWorld(a, jd);
      const wb = independentWorld(b, jd);
      const ref = Math.hypot(wa[0] - wb[0], wa[1] - wb[1], wa[2] - wb[2]);
      const got = computeBodyPairDistance(byId, a, b, jd)!;
      expect(Math.abs(got - ref) / ref).toBeLessThan(1e-12);
      expect(computeBodyPairDistance(byId, b, a, jd)).toBe(got);
    }
  });

  it('지구–달 J2000 = 36~41만 km 대 (시각 배율 ×30 미적용 — 데이터 SSoT 거리)', () => {
    const km = computeBodyPairDistance(byId, 'earth', 'moon', J2000)! / 1000;
    expect(km).toBeGreaterThan(356_000);
    expect(km).toBeLessThan(407_000);
  });

  it('getBodyState 를 주입하면 그 값을 쓴다 (엔진 상태 우선)', () => {
    const MOON_FROM_EARTH_M = 354_781_000;
    const MARS_FROM_SUN = 1.5 * AU;
    const getBodyState: BodyStateFn = (id) => {
      if (id === 'moon') return { pos: [MOON_FROM_EARTH_M, 0, 0], vel: [0, 0, 0] };
      if (id === 'earth') return { pos: [AU, 0, 0], vel: [0, 0, 0] };
      if (id === 'mars') return { pos: [0, MARS_FROM_SUN, 0], vel: [0, 0, 0] };
      return null;
    };
    expect(computeBodyPairDistance(byId, 'earth', 'moon', J2000, getBodyState)).toBe(
      MOON_FROM_EARTH_M,
    );
    expect(computeBodyPairDistance(byId, 'earth', 'mars', J2000, getBodyState)).toBe(
      Math.hypot(AU, MARS_FROM_SUN),
    );
  });

  it('computeBodyWorldPosition — 태양 = 원점 · 지구 = 독립 계산 · 체인 미해석 · 미등록 id = null', () => {
    expect(computeBodyWorldPosition(byId, 'sun', J2000)).toEqual([0, 0, 0]);
    const e = computeBodyWorldPosition(byId, 'earth', J2000)!;
    const ref = independentWorld('earth', J2000);
    expect(Math.hypot(e[0] - ref[0], e[1] - ref[1], e[2] - ref[2]) / norm(ref)).toBeLessThan(1e-12);
    expect(computeBodyWorldPosition(byId, 'no-such-body', J2000)).toBeNull();
    const orphan = new Map(byId);
    orphan.delete('earth');
    expect(computeBodyWorldPosition(orphan, 'moon', J2000)).toBeNull();
    expect(computeBodyPairDistance(orphan, 'moon', 'mars', J2000)).toBeNull();
    expect(computeBodyPairDistance(byId, 'earth', 'no-such-body', J2000)).toBeNull();
  });
});
