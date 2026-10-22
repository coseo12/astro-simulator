/**
 * #1390 — 투어 단계 → 명령 · 액션 목록 (순수 함수, ADR `docs/decisions/20261021-1390-education-tour.md` 결정 · 엔진).
 *
 * 컴포넌트는 이 목록을 **순서대로 실행만** 한다 (`use-tour-controller.ts`). 순서가 계약이다 — 사건 선택 (`time-events.tsx`
 * `select`, ADR 1347 결정 D6) 의 일반화:
 *   1. 표시 토글 (store setter + core 명령 — URL 은 쓰지 않는다, 결정 E6)
 *   2. `jumpToJulianDate` — core 가 `timeChanged` 를 동기 발화해 장면을 먼저 옮긴다
 *   3. 시점 요청 — 있으면 요청, **없으면 `null`** (앞 단계의 미소비 요청이 새 포커스에 새지 않게 — §교차검증 합의 2)
 *   4. `focusOn` / `resetCamera`
 *   5. `setTimeScale`
 *   6. 거리 자 기준점
 *
 * 사건 id → 율리우스일 해석은 여기 한 곳에서만 하고 결과를 `planned` 로 넘긴다 — 이탈 판정 (`detect-tour-drift.ts`) 은 그것만
 * 본다 (§교차검증 합의 4).
 */

import type { CoreCommand } from '@astro-simulator/shared';
import { isAbsoluteFocusView } from '@astro-simulator/core';
import {
  DISPLAY_TOGGLES,
  type DisplayCapabilities,
  type DisplayToggleId,
} from '@/core/display-toggles';
import type { FocusViewRequest, SimStoreState } from '@/store/sim-store';
import { TOUR_OVERVIEW, type TourStep } from './types';

/** 표시 토글 의도 12종 (표 행 전부). 투어 시작 스냅샷 · 현재 store 의도를 같은 형식으로 다룬다. */
export type DisplayIntents = Readonly<Record<DisplayToggleId, boolean>>;

const HOURS_PER_DAY = 24;

export type TourAction =
  | { type: 'display'; id: DisplayToggleId; visible: boolean }
  | { type: 'command'; command: CoreCommand }
  | { type: 'focusViewRequest'; request: FocusViewRequest | null }
  | { type: 'rulerAnchor'; anchorId: string | null };

/** 단계가 맞춘 장면 — 이탈 판정의 기준. */
export interface PlannedTourState {
  /** 기대 선택 — 개요면 `null`. */
  focusBodyId: string | null;
  /** 단계가 지정한 시각 (사건 오프셋 반영). 지정하지 않았으면 `null` = 시각 축을 보지 않는다. */
  julianDate: number | null;
  timeScale: number;
  /** 재생 구간 `[startJd, endJd]` — 시각을 지정한 재생 단계만. 끝에 닿으면 컨트롤러가 정지한다. */
  window: { startJd: number; endJd: number } | null;
  /** 단계가 **지정했고 실제로 적용한** 표시 토글 값만 (적용 불가 토글은 이탈로 세지 않는다). */
  display: Partial<Record<DisplayToggleId, boolean>>;
  rulerAnchorId: string | null;
}

/** 단계가 켜려 했으나 환경이 막은 토글 — 카드가 사유를 보인다 (결정 · URL 끝 항목). */
export interface UnavailableDisplay {
  id: DisplayToggleId;
  reason: string;
}

export interface TourPlanInput {
  /** 투어 시작 시 표시 의도 스냅샷 — 단계가 지정하지 않은 토글은 이 값으로 둔다. */
  snapshot: DisplayIntents;
  /** 지금 store 의도 — 이미 같은 값이면 액션을 내지 않는다. */
  current: DisplayIntents;
  capabilities: DisplayCapabilities | null;
  /** 사건 id → 율리우스일. 모르면 `null`. */
  resolveEventJd: (eventId: string) => number | null;
}

export type TourPlan =
  | {
      ok: true;
      actions: TourAction[];
      planned: PlannedTourState;
      unavailable: UnavailableDisplay[];
    }
  | { ok: false; reason: string };

/** store → 표시 의도 12종. 표 (`display-toggles.ts`) 를 순회하므로 행을 더해도 고칠 곳이 없다. */
export function readDisplayIntents(
  state: Pick<SimStoreState, (typeof DISPLAY_TOGGLES)[number]['intentKey']>,
): DisplayIntents {
  const out = {} as Record<DisplayToggleId, boolean>;
  for (const def of DISPLAY_TOGGLES) out[def.id] = state[def.intentKey];
  return out;
}

/** 단계 시각 해석 — 지정 없음 `undefined`, 해석 실패 `null`. */
function resolveStepJd(
  step: TourStep,
  resolveEventJd: TourPlanInput['resolveEventJd'],
): number | null | undefined {
  const time = step.time;
  if (time === undefined) return undefined;
  if ('julianDate' in time) return time.julianDate;
  const base = resolveEventJd(time.eventId);
  if (base === null) return null;
  return base + (time.offsetHours ?? 0) / HOURS_PER_DAY;
}

export function planTourStep(step: TourStep, input: TourPlanInput): TourPlan {
  const julianDate = resolveStepJd(step, input.resolveEventJd);
  if (julianDate === null) {
    const eventId = step.time && 'eventId' in step.time ? step.time.eventId : '?';
    return { ok: false, reason: `사건 ${eventId} 을 찾지 못했습니다` };
  }

  const actions: TourAction[] = [];
  const display: Partial<Record<DisplayToggleId, boolean>> = {};
  const unavailable: UnavailableDisplay[] = [];

  // 1. 표시 토글 — 지정값, 나머지는 스냅샷. 가용성 검사는 `useDisplayToggle` 과 같은 `disabledReason` (결정 · URL 끝 항목).
  for (const def of DISPLAY_TOGGLES) {
    const specified = step.display?.[def.id];
    const target = specified ?? input.snapshot[def.id];
    const reason = def.disabledReason(input.capabilities);
    if (reason !== null) {
      if (specified === true) unavailable.push({ id: def.id, reason });
      continue;
    }
    if (specified !== undefined) display[def.id] = target;
    if (input.current[def.id] !== target)
      actions.push({ type: 'display', id: def.id, visible: target });
  }

  // 2. 시각.
  if (julianDate !== undefined) {
    actions.push({ type: 'command', command: { type: 'jumpToJulianDate', julianDate } });
  }

  // 3 · 4. 시점 요청 → 포커스.
  const focus = step.camera.focus;
  const focusBodyId = focus === TOUR_OVERVIEW ? null : focus;
  const view = step.camera.view;
  // 개요 (`null`) 는 절대 방향 시점만 — 상대 시점은 대상이 없어 요청하지 않는다 (콘텐츠 유효성 테스트가 선언에서 막는다).
  const viewApplies = view !== undefined && (focusBodyId !== null || isAbsoluteFocusView(view));
  actions.push({
    type: 'focusViewRequest',
    request: viewApplies ? { bodyId: focusBodyId, view } : null,
  });
  actions.push({
    type: 'command',
    command:
      focusBodyId === null ? { type: 'resetCamera' } : { type: 'focusOn', bodyId: focusBodyId },
  });

  // 5. 배속.
  const timeScale = step.timeScale ?? 0;
  actions.push({ type: 'command', command: { type: 'setTimeScale', scale: timeScale } });

  // 6. 거리 자 — 생략 = 해제.
  const rulerAnchorId = step.ruler ?? null;
  actions.push({ type: 'rulerAnchor', anchorId: rulerAnchorId });

  const playWindow =
    timeScale !== 0 && julianDate !== undefined && step.windowDays !== undefined
      ? { startJd: julianDate, endJd: julianDate + step.windowDays }
      : null;

  return {
    ok: true,
    actions,
    unavailable,
    planned: {
      focusBodyId,
      julianDate: julianDate ?? null,
      timeScale,
      window: playWindow,
      display,
      rulerAnchorId,
    },
  };
}

/**
 * 종료 복원 — 스냅샷과 다른 토글만 되돌린다 (결정 Q7 (a) — 카메라 · 시각 · 배속은 되돌리지 않는다). URL 은 컨트롤러가 시작 전
 * 원문으로 따로 되돌린다 (투어 중 사용자가 표시 패널을 누르면 `useDisplayToggle` 이 URL 을 쓰므로 — §교차검증 합의 3).
 */
export function planDisplayRestore(
  snapshot: DisplayIntents,
  current: DisplayIntents,
): TourAction[] {
  const actions: TourAction[] = [];
  for (const def of DISPLAY_TOGGLES) {
    if (current[def.id] !== snapshot[def.id]) {
      actions.push({ type: 'display', id: def.id, visible: snapshot[def.id] });
    }
  }
  return actions;
}
