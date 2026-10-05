import { describe, expect, it } from 'vitest';
import { ephemeris, physics } from '@astro-simulator/core';
import { AU, GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import { computeBodyDistances, indexBodies } from './body-distance';
import { formatKmKo, formatSunDistance } from './body-info';

const bodies = ephemeris.getSolarSystem().bodies;
const byId = indexBodies(bodies);
const J2000 = ephemeris.J2000_JD;
const DAYS_PER_YEAR = 365.25;

function norm(v: readonly number[]): number {
  return Math.hypot(v[0]!, v[1]!, v[2]!);
}

describe('#1281 computeBodyDistances — 현재 시뮬레이션 시각 기준 거리 (D2)', () => {
  it('지구 태양 거리 == ‖orbitalStateAt(earth.orbit, jd, G·M☉).position‖ (상대 1e-12) + 표시 문자열 일치', () => {
    const earth = byId.get('earth')!;
    const sun = byId.get('sun')!;
    for (const jd of [J2000, J2000 + 100, J2000 + 9_000.5]) {
      const got = computeBodyDistances(byId, 'earth', jd).fromSunM!;
      const ref = norm(
        physics.orbitalStateAt(earth.orbit!, jd, GRAVITATIONAL_CONSTANT * sun.mass).position,
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
    const e = physics.orbitalStateAt(earth.orbit!, J2000, GRAVITATIONAL_CONSTANT * sun.mass);
    const m = physics.orbitalStateAt(moon.orbit!, J2000, GRAVITATIONAL_CONSTANT * earth.mass);
    const ref = norm([
      e.position[0] + m.position[0],
      e.position[1] + m.position[1],
      e.position[2] + m.position[2],
    ]);
    expect(Math.abs(d.fromSunM! - ref) / ref).toBeLessThan(1e-12);
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
});
