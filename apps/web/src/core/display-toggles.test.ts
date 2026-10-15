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

const HW: DisplayCapabilities = {
  starfield: true,
  surfaceDetail: true,
  belt: true,
  cometTails: true,
  corona: true,
  trails: true,
};
const SOFTWARE: DisplayCapabilities = {
  starfield: false,
  surfaceDetail: true,
  belt: false,
  cometTails: false,
  corona: false,
  trails: true,
};
const SURFACE_OFF: DisplayCapabilities = {
  starfield: true,
  surfaceDetail: false,
  belt: true,
  cometTails: true,
  corona: true,
  trails: true,
};
/** #1319 PR3 — 소프트웨어 렌더 + `?belt=N` 강제 (bench · verify 경로) — 띠는 만들어져 있으므로 토글도 열린다. */
const SOFTWARE_FORCED: DisplayCapabilities = {
  starfield: false,
  surfaceDetail: true,
  belt: true,
  cometTails: false,
  corona: false,
  trails: true,
};
/** #1329 PR2 — 소프트웨어 렌더 + `?comettails=force` (CI 강제 셀) — 꼬리는 만들어져 있으므로 토글도 열린다. */
const SOFTWARE_COMET_FORCED: DisplayCapabilities = {
  starfield: false,
  surfaceDetail: true,
  belt: false,
  cometTails: true,
  corona: false,
  trails: true,
};
/** #1335 PR2 — 소프트웨어 렌더 + `?corona=force` (CI 강제 셀) — 코로나는 만들어져 있으므로 토글도 열린다. */
const SOFTWARE_CORONA_FORCED: DisplayCapabilities = {
  starfield: false,
  surfaceDetail: true,
  belt: false,
  cometTails: false,
  corona: true,
  trails: true,
};

describe('display-toggles — 표 구성', () => {
  it('10 토글 · URL 키 10종 · id 중복 없음 (#1293 라벨 · #1319 PR3 소행성대 · 카이퍼 · #1329 PR2 혜성 꼬리 · #1335 PR2 태양 코로나 · #1341 PR1 궤적 행 추가)', () => {
    expect(DISPLAY_TOGGLES.map((d) => d.id)).toEqual([
      'orbits',
      'stars',
      'clouds',
      'nightLights',
      'labels',
      'belt',
      'kuiper',
      'cometTails',
      'corona',
      'trails',
    ]);
    expect(DISPLAY_TOGGLES.map((d) => d.urlKey)).toEqual([
      'orbits',
      'stars',
      'clouds',
      'nightlights',
      'labels',
      'belt',
      'kuiper',
      'comettails',
      'corona',
      'trails',
    ]);
  });

  it('command 빌더가 각자의 core 명령을 가리킨다 (교차 라우팅 0) · 라벨은 web 전용 (null)', () => {
    expect(DISPLAY_TOGGLES.map((d) => d.command?.(false) ?? null)).toEqual([
      { type: 'setOrbitLinesVisible', visible: false },
      { type: 'setStarfieldVisible', visible: false },
      { type: 'setCloudsVisible', visible: false },
      { type: 'setNightLightsVisible', visible: false },
      null,
      { type: 'setAsteroidBeltVisible', visible: false },
      { type: 'setKuiperBeltVisible', visible: false },
      { type: 'setCometTailsVisible', visible: false },
      { type: 'setSunCoronaVisible', visible: false },
      { type: 'setTrailsVisible', visible: false },
    ]);
  });

  it('#1293 라벨 — 장면 준비 전에도 가능 · 표시 상태 = 의도', () => {
    const labels = getDisplayToggle('labels');
    expect(labels.disabledReason(null)).toBeNull();
    expect(labels.pressed(true, null)).toBe(true);
    expect(labels.pressed(false, HW)).toBe(false);
  });

  it('getDisplayToggle — id 조회', () => {
    expect(getDisplayToggle('clouds').urlKey).toBe('clouds');
  });
});

/** 기본 켜짐 행 — #1341 이전 9행. 출력 불변 (DoD D10) 의 대상. */
const DEFAULT_ON_ROWS = DISPLAY_TOGGLES.filter((d) => d.defaultVisible);

describe('display-toggles — URL 직렬화 ↔ 기존 parse round-trip (D16)', () => {
  it('serialize: 기본 켜짐 — ON → 키 삭제(null) · OFF → "off" (종전 출력)', () => {
    expect(serializeDisplayToggle(true, true)).toBeNull();
    expect(serializeDisplayToggle(false, true)).toBe('off');
  });

  it('#1341 D10 — 기존 9행은 defaultVisible=true 라 출력 불변 · trails 만 기본 꺼짐', () => {
    expect(DEFAULT_ON_ROWS.map((d) => d.id)).toEqual([
      'orbits',
      'stars',
      'clouds',
      'nightLights',
      'labels',
      'belt',
      'kuiper',
      'cometTails',
      'corona',
    ]);
    for (const def of DEFAULT_ON_ROWS) {
      expect(serializeDisplayToggle(true, def.defaultVisible)).toBeNull();
      expect(serializeDisplayToggle(false, def.defaultVisible)).toBe('off');
    }
    expect(getDisplayToggle('trails').defaultVisible).toBe(false);
  });

  it('#1341 D10 — trails: 켜짐 → "on" · 꺼짐 → 키 삭제 (기본값과 같으면 삭제)', () => {
    const def = getDisplayToggle('trails');
    expect(serializeDisplayToggle(true, def.defaultVisible)).toBe('on');
    expect(serializeDisplayToggle(false, def.defaultVisible)).toBeNull();
    const cases: Array<[string | null, 'on' | null]> = [
      [null, null],
      ['on', 'on'],
      ['ON', 'on'],
      ['off', null],
      ['x', null],
    ];
    for (const [s, expected] of cases)
      expect(serializeDisplayToggle(def.parse(s), def.defaultVisible)).toBe(expected);
  });

  it.each(DISPLAY_TOGGLES.map((d) => [d.id, d] as const))(
    '%s — parse(serialize(v, defaultVisible)) === v (v ∈ {true, false})',
    (_id, def) => {
      for (const v of [true, false])
        expect(def.parse(serializeDisplayToggle(v, def.defaultVisible))).toBe(v);
    },
  );

  it.each(DEFAULT_ON_ROWS.map((d) => [d.id, d] as const))(
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
        expect(serializeDisplayToggle(def.parse(s), def.defaultVisible)).toBe(expected);
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

  it('장면 미준비 (caps=null) — 신규 3종 · 띠 2종 · 혜성 꼬리 · 태양 코로나 불가 + 준비 중 사유 + 꺼짐', () => {
    for (const id of [
      'stars',
      'clouds',
      'nightLights',
      'belt',
      'kuiper',
      'cometTails',
      'corona',
      'trails',
    ] as const) {
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

  it('#1319 PR3 소프트웨어 렌더 — 소행성대 · 카이퍼 불가 + 띠 사유, 의도가 true 여도 꺼짐 (결정 3)', () => {
    for (const id of ['belt', 'kuiper'] as const) {
      const def = getDisplayToggle(id);
      expect(def.disabledReason(SOFTWARE)).toBe(DISPLAY_DISABLED_REASONS.softwareRendererBelt);
      expect(def.pressed(true, SOFTWARE)).toBe(false);
      // 표면 off 는 띠와 무관하다.
      expect(def.disabledReason(SURFACE_OFF)).toBeNull();
    }
    // 띠 사유는 별 사유와 다른 문구 (어느 효과가 막혔는지 낭독이 갈린다).
    expect(DISPLAY_DISABLED_REASONS.softwareRendererBelt).not.toBe(
      DISPLAY_DISABLED_REASONS.softwareRenderer,
    );
  });

  it('#1319 PR3 소프트웨어 렌더 + ?belt=N 강제 — 띠 토글은 열리고 별은 여전히 막힌다', () => {
    for (const id of ['belt', 'kuiper'] as const) {
      const def = getDisplayToggle(id);
      expect(def.disabledReason(SOFTWARE_FORCED)).toBeNull();
      expect(def.pressed(true, SOFTWARE_FORCED)).toBe(true);
    }
    expect(getDisplayToggle('stars').disabledReason(SOFTWARE_FORCED)).toBe(
      DISPLAY_DISABLED_REASONS.softwareRenderer,
    );
  });

  it('#1329 PR2 소프트웨어 렌더 — 혜성 꼬리 불가 + 꼬리 사유, 의도가 true 여도 꺼짐 (결정 4)', () => {
    const def = getDisplayToggle('cometTails');
    expect(def.disabledReason(SOFTWARE)).toBe(DISPLAY_DISABLED_REASONS.softwareRendererCometTails);
    expect(def.pressed(true, SOFTWARE)).toBe(false);
    expect(def.disabledReason(SURFACE_OFF)).toBeNull();
    // `?belt=N` 강제는 꼬리 가용성과 무관하다 (각자의 강제만 연다).
    expect(def.disabledReason(SOFTWARE_FORCED)).toBe(
      DISPLAY_DISABLED_REASONS.softwareRendererCometTails,
    );
    expect(DISPLAY_DISABLED_REASONS.softwareRendererCometTails).not.toBe(
      DISPLAY_DISABLED_REASONS.softwareRendererBelt,
    );
  });

  it('#1329 PR2 소프트웨어 렌더 + ?comettails=force — 꼬리 토글은 열리고 띠 · 별은 여전히 막힌다', () => {
    const def = getDisplayToggle('cometTails');
    expect(def.disabledReason(SOFTWARE_COMET_FORCED)).toBeNull();
    expect(def.pressed(true, SOFTWARE_COMET_FORCED)).toBe(true);
    expect(getDisplayToggle('belt').disabledReason(SOFTWARE_COMET_FORCED)).toBe(
      DISPLAY_DISABLED_REASONS.softwareRendererBelt,
    );
    expect(getDisplayToggle('stars').disabledReason(SOFTWARE_COMET_FORCED)).toBe(
      DISPLAY_DISABLED_REASONS.softwareRenderer,
    );
  });

  it('#1335 PR2 소프트웨어 렌더 — 태양 코로나 불가 + 코로나 사유, 의도가 true 여도 꺼짐 (결정 5)', () => {
    const def = getDisplayToggle('corona');
    expect(def.label).toBe('태양 코로나');
    expect(def.disabledReason(SOFTWARE)).toBe(DISPLAY_DISABLED_REASONS.softwareRendererCorona);
    expect(def.pressed(true, SOFTWARE)).toBe(false);
    // 다른 강제 (`?belt=N` · `?comettails=force`) 는 코로나 가용성과 무관하다 (각자의 강제만 연다).
    for (const caps of [SOFTWARE_FORCED, SOFTWARE_COMET_FORCED]) {
      expect(def.disabledReason(caps)).toBe(DISPLAY_DISABLED_REASONS.softwareRendererCorona);
      expect(def.pressed(true, caps)).toBe(false);
    }
    // `?surface=off` 는 코로나와 무관 (표면 셰이더가 아니라 별도 메시).
    expect(def.disabledReason(SURFACE_OFF)).toBeNull();
    expect(new Set(Object.values(DISPLAY_DISABLED_REASONS)).size).toBe(
      Object.values(DISPLAY_DISABLED_REASONS).length,
    );
  });

  it('#1335 PR2 소프트웨어 렌더 + ?corona=force — 코로나 토글은 열리고 혜성 꼬리 · 별은 여전히 막힌다', () => {
    const def = getDisplayToggle('corona');
    expect(def.disabledReason(SOFTWARE_CORONA_FORCED)).toBeNull();
    expect(def.pressed(true, SOFTWARE_CORONA_FORCED)).toBe(true);
    expect(def.pressed(false, SOFTWARE_CORONA_FORCED)).toBe(false);
    expect(getDisplayToggle('cometTails').disabledReason(SOFTWARE_CORONA_FORCED)).toBe(
      DISPLAY_DISABLED_REASONS.softwareRendererCometTails,
    );
    expect(getDisplayToggle('stars').disabledReason(SOFTWARE_CORONA_FORCED)).toBe(
      DISPLAY_DISABLED_REASONS.softwareRenderer,
    );
  });

  it('#1335 PR2 코로나 parse — 로드 전용 `force` 도 의도 ON 으로 읽고, 직렬화하면 키 삭제 (왕복 대상 아님)', () => {
    const def = getDisplayToggle('corona');
    expect(def.parse('force')).toBe(true);
    expect(def.parse('FORCE')).toBe(true);
    expect(serializeDisplayToggle(def.parse('force'), def.defaultVisible)).toBeNull();
  });

  it('#1341 PR1 trails — N-body 엔진이면 불가 + 엔진 사유, 의도가 true 여도 꺼짐 (결정 T8) · 렌더러 · 표면과 무관', () => {
    const def = getDisplayToggle('trails');
    expect(def.label).toBe('궤적');
    const nbody: DisplayCapabilities = { ...HW, trails: false };
    expect(def.disabledReason(nbody)).toBe(DISPLAY_DISABLED_REASONS.nbodyTrails);
    expect(def.pressed(true, nbody)).toBe(false);
    // 소프트웨어 렌더 게이트 없음 (결정 T10) · 표면 off 무관.
    for (const caps of [SOFTWARE, SURFACE_OFF]) {
      expect(def.disabledReason(caps)).toBeNull();
      expect(def.pressed(true, caps)).toBe(true);
    }
    // 다른 행은 엔진과 무관하다.
    for (const other of DISPLAY_TOGGLES.filter((d) => d.id !== 'trails'))
      expect(other.disabledReason(nbody)).toBeNull();
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
