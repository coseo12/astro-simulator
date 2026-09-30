import { describe, expect, it } from 'vitest';
import {
  DISPLAY_DISABLED_REASONS,
  DISPLAY_TOGGLES,
  getDisplayToggle,
  serializeDisplayToggle,
  type DisplayCapabilities,
} from './display-toggles';

/**
 * #1265 D16 — 표시 토글 데이터 테이블 · URL 직렬화 (ADR `20260927-1265` 결정 5 · 7).
 *
 * 직렬화의 역방향은 기존 `parse-*-mode.ts` 4종이다 — 두 방향이 같은 어휘를 쓰는지를 round-trip 으로 고정한다.
 */

const HW: DisplayCapabilities = { starfield: true, surfaceDetail: true };
const SOFTWARE: DisplayCapabilities = { starfield: false, surfaceDetail: true };
const SURFACE_OFF: DisplayCapabilities = { starfield: true, surfaceDetail: false };

describe('display-toggles — 표 구성', () => {
  it('4 토글 · 기존 URL 키 4종 · id 중복 없음', () => {
    expect(DISPLAY_TOGGLES.map((d) => d.id)).toEqual(['orbits', 'stars', 'clouds', 'nightLights']);
    expect(DISPLAY_TOGGLES.map((d) => d.urlKey)).toEqual([
      'orbits',
      'stars',
      'clouds',
      'nightlights',
    ]);
  });

  it('command 빌더가 각자의 core 명령을 가리킨다 (교차 라우팅 0)', () => {
    expect(DISPLAY_TOGGLES.map((d) => d.command(false))).toEqual([
      { type: 'setOrbitLinesVisible', visible: false },
      { type: 'setStarfieldVisible', visible: false },
      { type: 'setCloudsVisible', visible: false },
      { type: 'setNightLightsVisible', visible: false },
    ]);
  });

  it('getDisplayToggle — id 조회', () => {
    expect(getDisplayToggle('clouds').urlKey).toBe('clouds');
  });
});

describe('display-toggles — URL 직렬화 ↔ 기존 parse round-trip (D16)', () => {
  it('serialize: ON → 키 삭제(null) · OFF → "off"', () => {
    expect(serializeDisplayToggle(true)).toBeNull();
    expect(serializeDisplayToggle(false)).toBe('off');
  });

  it.each(DISPLAY_TOGGLES.map((d) => [d.id, d] as const))(
    '%s — parse(serialize(v)) === v (v ∈ {true, false})',
    (_id, def) => {
      for (const v of [true, false]) expect(def.parse(serializeDisplayToggle(v))).toBe(v);
    },
  );

  it.each(DISPLAY_TOGGLES.map((d) => [d.id, d] as const))(
    '%s — serialize(parse(s)) 정규화 (null·on→키 삭제 / off·OFF→off / 모르는 값→ON 폴백)',
    (_id, def) => {
      const cases: Array<[string | null, 'off' | null]> = [
        [null, null],
        ['on', null],
        ['off', 'off'],
        ['OFF', 'off'],
        ['x', null],
      ];
      for (const [s, expected] of cases)
        expect(serializeDisplayToggle(def.parse(s))).toBe(expected);
    },
  );
});

describe('display-toggles — 가용성 · 표시 상태', () => {
  it('궤도선은 장면 준비 전에도 항상 가능 (Q4 현행 유지)', () => {
    const orbits = getDisplayToggle('orbits');
    expect(orbits.disabledReason(null)).toBeNull();
    expect(orbits.pressed(true, null)).toBe(true);
    expect(orbits.pressed(false, SOFTWARE)).toBe(false);
  });

  it('장면 미준비 (caps=null) — 신규 3종 불가 + 준비 중 사유 + 꺼짐', () => {
    for (const id of ['stars', 'clouds', 'nightLights'] as const) {
      const def = getDisplayToggle(id);
      expect(def.disabledReason(null)).toBe(DISPLAY_DISABLED_REASONS.sceneNotReady);
      expect(def.pressed(true, null)).toBe(false);
    }
  });

  it('소프트웨어 렌더 — 별만 불가 (D9), 의도가 true 여도 꺼짐 (resolveStarfieldVisible 동형)', () => {
    const stars = getDisplayToggle('stars');
    expect(stars.disabledReason(SOFTWARE)).toBe(DISPLAY_DISABLED_REASONS.softwareRenderer);
    expect(stars.pressed(true, SOFTWARE)).toBe(false);
    expect(getDisplayToggle('clouds').disabledReason(SOFTWARE)).toBeNull();
    expect(getDisplayToggle('nightLights').disabledReason(SOFTWARE)).toBeNull();
  });

  it('?surface=off — 구름·불빛 불가 (D10), 의도가 true 여도 꺼짐. 별은 영향 없음', () => {
    for (const id of ['clouds', 'nightLights'] as const) {
      const def = getDisplayToggle(id);
      expect(def.disabledReason(SURFACE_OFF)).toBe(DISPLAY_DISABLED_REASONS.surfaceOff);
      expect(def.pressed(true, SURFACE_OFF)).toBe(false);
    }
    expect(getDisplayToggle('stars').disabledReason(SURFACE_OFF)).toBeNull();
  });

  it('하드웨어 · 표면 ON — 전부 가능, 표시 상태 = 의도', () => {
    for (const def of DISPLAY_TOGGLES) {
      expect(def.disabledReason(HW)).toBeNull();
      expect(def.pressed(true, HW)).toBe(true);
      expect(def.pressed(false, HW)).toBe(false);
    }
  });
});
