import { describe, expect, it } from 'vitest';
import { ephemeris } from '@astro-simulator/core';
import { AU } from '@astro-simulator/shared';
import {
  findBodyAndParent,
  formatDays,
  formatKmKo,
  formatRadiusKm,
  formatSunDistance,
  groupThousands,
  josaRo,
  kindLabel,
  orbitalPeriodSeconds,
  parentDistanceLabel,
  rPhaseBlockedMessage,
} from './body-info';

const bodies = ephemeris.getSolarSystem().bodies;

describe('#1281 body-info — 공용 조회 · 주기', () => {
  it('findBodyAndParent — 위성은 모체를 함께 해석, 태양은 모체 null, 미등록 id 는 data null', () => {
    const moon = findBodyAndParent(bodies, 'moon');
    expect(moon.data?.id).toBe('moon');
    expect(moon.parent?.id).toBe('earth');
    expect(findBodyAndParent(bodies, 'sun').parent).toBeNull();
    expect(findBodyAndParent(bodies, 'no-such-body')).toEqual({ data: null, parent: null });
    expect(findBodyAndParent(bodies, null)).toEqual({ data: null, parent: null });
  });

  it('orbitalPeriodSeconds — #841 μ = G·(M_parent + m): 달 27.32 일 · 지구 1.000 년', () => {
    const moon = findBodyAndParent(bodies, 'moon');
    const earth = findBodyAndParent(bodies, 'earth');
    expect(formatDays(orbitalPeriodSeconds(moon.data!, moon.parent)!)).toBe('27.32 일');
    expect(formatDays(orbitalPeriodSeconds(earth.data!, earth.parent)!)).toBe('1.000 년');
  });

  it('orbitalPeriodSeconds — 모체 미해석 / 궤도 없음은 null (조용한 태양 질량 폴백 금지)', () => {
    const moon = findBodyAndParent(bodies, 'moon');
    expect(orbitalPeriodSeconds(moon.data!, null)).toBeNull();
    expect(orbitalPeriodSeconds(findBodyAndParent(bodies, 'sun').data!, null)).toBeNull();
  });

  it('kindLabel — 5종 한국어, 미등록 kind 는 원문', () => {
    expect(kindLabel('star')).toBe('항성');
    expect(kindLabel('planet')).toBe('행성');
    expect(kindLabel('dwarf-planet')).toBe('왜소행성');
    expect(kindLabel('moon')).toBe('위성');
    expect(kindLabel('comet')).toBe('혜성');
    expect(kindLabel('asteroid')).toBe('asteroid');
  });

  it('rPhaseBlockedMessage — 연구 패널과 같은 문구', () => {
    expect(rPhaseBlockedMessage('달')).toBe(
      '달 은(는) R-Phase 미진입 — 후속 R-Phase 에서 활성화 예정입니다.',
    );
  });
});

describe('#1281 body-info — 사람 단위 포맷터', () => {
  it('groupThousands — 정수 반올림 + 콤마', () => {
    expect(groupThousands(0)).toBe('0');
    expect(groupThousands(999)).toBe('999');
    expect(groupThousands(1000)).toBe('1,000');
    expect(groupThousands(695_700)).toBe('695,700');
    expect(groupThousands(1_234_567.6)).toBe('1,234,568');
  });

  it('formatKmKo — 억 / 만(소수 1자리 · 정수 콤마) / km 경계', () => {
    expect(formatKmKo(9_377)).toBe('9,377 km');
    expect(formatKmKo(384_400)).toBe('38.4만 km');
    expect(formatKmKo(57_909_050)).toBe('5,791만 km');
    expect(formatKmKo(149_597_870.7)).toBe('1.50억 km');
    expect(formatKmKo(1_000_000)).toBe('100만 km');
  });

  it('formatKmKo — 반올림이 단위를 넘기면 상위 단위로 올린다', () => {
    // 반올림 전 값으로 가르면 `10,000 km` / `100.0만 km` / `10,000만 km` 가 된다.
    expect(formatKmKo(9_999.6)).toBe('1.0만 km');
    expect(formatKmKo(999_960)).toBe('100만 km');
    expect(formatKmKo(99_999_999)).toBe('1.00억 km');
  });

  it('formatSunDistance — `AU 소수 2자리 · 한국어 km`', () => {
    expect(formatSunDistance(AU)).toBe('1.00 AU · 1.50억 km');
    expect(formatSunDistance(1.01 * AU)).toBe('1.01 AU · 1.51억 km');
  });

  it('formatRadiusKm — 100 km 미만 소수 1자리, 이상 정수 콤마', () => {
    expect(formatRadiusKm(5_500)).toBe('5.5 km');
    expect(formatRadiusKm(11_080)).toBe('11.1 km');
    expect(formatRadiusKm(6_378_137)).toBe('6,378 km');
    expect(formatRadiusKm(695_700_000)).toBe('695,700 km');
  });

  it('josaRo / parentDistanceLabel — 받침 유무 · ㄹ 받침 · 비한글', () => {
    expect(josaRo('지구')).toBe('로');
    expect(josaRo('목성')).toBe('으로');
    expect(josaRo('서울')).toBe('로'); // ㄹ 받침
    expect(josaRo('Earth')).toBe('(으)로');
    expect(parentDistanceLabel('지구')).toBe('지구로부터 거리');
    expect(parentDistanceLabel('목성')).toBe('목성으로부터 거리');
    expect(parentDistanceLabel('해왕성')).toBe('해왕성으로부터 거리');
  });
});
