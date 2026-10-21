import { describe, expect, it } from 'vitest';
import { DISPLAY_TOGGLES, type DisplayCapabilities } from '@/core/display-toggles';
import { useSimStore } from '@/store/sim-store';
import {
  planDisplayRestore,
  planTourStep,
  readDisplayIntents,
  type DisplayIntents,
  type TourAction,
  type TourPlanInput,
} from './plan-tour-step';
import type { TourStep } from './types';

/**
 * #1390 — `planTourStep` (ADR `20261021-1390` 결정 · 엔진 / DoD E2). 단계 → 액션 순서 · 기준 장면 (`planned`) 을 고정한다.
 */

const CAPS_ALL: DisplayCapabilities = {
  starfield: true,
  surfaceDetail: true,
  belt: true,
  cometTails: true,
  corona: true,
  trails: true,
};

/** 기본 의도 (store 초기값과 같은 — 표의 `defaultVisible`). */
const DEFAULT_INTENTS: DisplayIntents = Object.fromEntries(
  DISPLAY_TOGGLES.map((d) => [d.id, d.defaultVisible]),
) as DisplayIntents;

const ECLIPSE_JD = 2460409.2479;

function input(overrides: Partial<TourPlanInput> = {}): TourPlanInput {
  return {
    snapshot: DEFAULT_INTENTS,
    current: DEFAULT_INTENTS,
    capabilities: CAPS_ALL,
    resolveEventJd: (id) => (id === 'solar-eclipse:2024-04-08' ? ECLIPSE_JD : null),
    ...overrides,
  };
}

function kinds(actions: readonly TourAction[]): string[] {
  return actions.map((a) =>
    a.type === 'command' ? a.command.type : a.type === 'display' ? `display:${a.id}` : a.type,
  );
}

const BASE_STEP: TourStep = {
  id: 's',
  title: 't',
  body: 'b',
  camera: { focus: 'earth', view: 'facing-parent' },
  time: { eventId: 'solar-eclipse:2024-04-08' },
  display: { orbits: false },
  ruler: 'moon',
};

describe('planTourStep — 순서 계약 (결정 D6 일반화)', () => {
  it('표시 → 시각 → 시점 요청 → 포커스 → 배속 → 거리 자', () => {
    const plan = planTourStep(BASE_STEP, input());
    if (!plan.ok) throw new Error(plan.reason);
    expect(kinds(plan.actions)).toEqual([
      'display:orbits',
      'jumpToJulianDate',
      'focusViewRequest',
      'focusOn',
      'setTimeScale',
      'rulerAnchor',
    ]);
    expect(plan.actions[2]).toEqual({
      type: 'focusViewRequest',
      request: { bodyId: 'earth', view: 'facing-parent' },
    });
    expect(plan.actions[4]).toEqual({
      type: 'command',
      command: { type: 'setTimeScale', scale: 0 },
    });
    expect(plan.actions[5]).toEqual({ type: 'rulerAnchor', anchorId: 'moon' });
  });

  it('시점이 없으면 요청을 비운다 (§교차검증 합의 2 — 미소비 요청 잔류 차단)', () => {
    const plan = planTourStep({ ...BASE_STEP, camera: { focus: 'mars' } }, input());
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.actions.find((a) => a.type === 'focusViewRequest')).toEqual({
      type: 'focusViewRequest',
      request: null,
    });
  });

  it('개요는 resetCamera · 기대 선택 null', () => {
    const plan = planTourStep({ ...BASE_STEP, camera: { focus: 'overview' } }, input());
    if (!plan.ok) throw new Error(plan.reason);
    expect(kinds(plan.actions)).toContain('resetCamera');
    expect(kinds(plan.actions)).not.toContain('focusOn');
    expect(plan.planned.focusBodyId).toBeNull();
  });

  it('시각 생략 = jumpToJulianDate 없음 · planned 시각 null', () => {
    const { time: _time, ...noTime } = BASE_STEP;
    const plan = planTourStep(noTime, input());
    if (!plan.ok) throw new Error(plan.reason);
    expect(kinds(plan.actions)).not.toContain('jumpToJulianDate');
    expect(plan.planned.julianDate).toBeNull();
  });

  it('거리 자 생략 = 해제 (null)', () => {
    const { ruler: _ruler, ...noRuler } = BASE_STEP;
    const plan = planTourStep(noRuler, input());
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.actions.at(-1)).toEqual({ type: 'rulerAnchor', anchorId: null });
    expect(plan.planned.rulerAnchorId).toBeNull();
  });
});

describe('planTourStep — 시각 해석 (§교차검증 합의 4 · 9)', () => {
  it('사건 id → JD, offsetHours 반영', () => {
    const plan = planTourStep(
      { ...BASE_STEP, time: { eventId: 'solar-eclipse:2024-04-08', offsetHours: -3 } },
      input(),
    );
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.planned.julianDate).toBeCloseTo(ECLIPSE_JD - 3 / 24, 12);
    expect(plan.actions[1]).toEqual({
      type: 'command',
      command: { type: 'jumpToJulianDate', julianDate: plan.planned.julianDate },
    });
  });

  it('JD 직접 지정', () => {
    const plan = planTourStep({ ...BASE_STEP, time: { julianDate: 2460379.875 } }, input());
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.planned.julianDate).toBe(2460379.875);
  });

  it('모르는 사건 id 는 실패 — 액션을 하나도 내지 않는다', () => {
    const plan = planTourStep({ ...BASE_STEP, time: { eventId: 'nope:2000-01-01' } }, input());
    expect(plan.ok).toBe(false);
  });
});

describe('planTourStep — 재생 구간', () => {
  it('시각 지정 + 재생 + windowDays → [시작, 시작 + window]', () => {
    const plan = planTourStep({ ...BASE_STEP, timeScale: 600, windowDays: 0.25 }, input());
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.planned.timeScale).toBe(600);
    expect(plan.planned.window).toEqual({ startJd: ECLIPSE_JD, endJd: ECLIPSE_JD + 0.25 });
  });

  it('정지 단계 · 시각 미지정 재생 단계는 구간 없음', () => {
    const paused = planTourStep({ ...BASE_STEP, windowDays: 0.25 }, input());
    const { time: _time, ...noTime } = BASE_STEP;
    const playingNoTime = planTourStep({ ...noTime, timeScale: 600, windowDays: 1 }, input());
    if (!paused.ok || !playingNoTime.ok) throw new Error('plan 실패');
    expect(paused.planned.window).toBeNull();
    expect(playingNoTime.planned.window).toBeNull();
  });
});

describe('planTourStep — 표시 토글 (E2 · 결정 E6)', () => {
  it('지정값 + 나머지는 스냅샷 — 현재와 다른 것만 액션', () => {
    // 스냅샷: 별 꺼짐. 현재: 별 켜짐 (앞 단계가 켰다) · 궤적 켜짐 (앞 단계가 켰다).
    const snapshot = { ...DEFAULT_INTENTS, stars: false };
    const current = { ...DEFAULT_INTENTS, stars: true, trails: true };
    const plan = planTourStep(
      { ...BASE_STEP, display: { constellations: true } },
      input({ snapshot, current }),
    );
    if (!plan.ok) throw new Error(plan.reason);
    const display = plan.actions.filter((a) => a.type === 'display');
    expect(display).toEqual([
      { type: 'display', id: 'stars', visible: false },
      { type: 'display', id: 'constellations', visible: true },
      { type: 'display', id: 'trails', visible: false },
    ]);
    // 이탈 판정 대상은 단계가 지정한 것만.
    expect(plan.planned.display).toEqual({ constellations: true });
  });

  it('가용성 미달 토글은 액션 · 이탈 대상에서 빠지고 사유를 낸다 (켜려던 것만)', () => {
    const caps = { ...CAPS_ALL, starfield: false };
    const plan = planTourStep(
      { ...BASE_STEP, display: { constellations: true, stars: false } },
      input({ capabilities: caps }),
    );
    if (!plan.ok) throw new Error(plan.reason);
    expect(plan.actions.some((a) => a.type === 'display')).toBe(false);
    expect(plan.planned.display).toEqual({});
    expect(plan.unavailable.map((u) => u.id)).toEqual(['constellations']);
    expect(plan.unavailable[0]!.reason).toContain('별자리');
  });

  it('장면 미준비 (capabilities null) 면 가용성 검사가 있는 토글은 보내지 않는다 (고유 발견 2)', () => {
    const plan = planTourStep(
      { ...BASE_STEP, display: { stars: false, orbits: false } },
      input({ capabilities: null }),
    );
    if (!plan.ok) throw new Error(plan.reason);
    // 궤도선은 가용성 검사 없음 (표 Q4) — 별은 sceneNotReady.
    expect(plan.actions.filter((a) => a.type === 'display')).toEqual([
      { type: 'display', id: 'orbits', visible: false },
    ]);
  });
});

describe('planDisplayRestore · readDisplayIntents (E5)', () => {
  it('스냅샷과 다른 토글만 되돌린다', () => {
    const snapshot = { ...DEFAULT_INTENTS, stars: false };
    const current = { ...DEFAULT_INTENTS, stars: true, constellations: true };
    expect(planDisplayRestore(snapshot, current)).toEqual([
      { type: 'display', id: 'stars', visible: false },
      { type: 'display', id: 'constellations', visible: false },
    ]);
    expect(planDisplayRestore(snapshot, snapshot)).toEqual([]);
  });

  it('store 의도 12종 (표 행 전부) 를 읽는다', () => {
    const intents = readDisplayIntents(useSimStore.getState());
    expect(Object.keys(intents).sort()).toEqual(DISPLAY_TOGGLES.map((d) => d.id).sort());
    expect(Object.keys(intents)).toHaveLength(12);
  });
});
