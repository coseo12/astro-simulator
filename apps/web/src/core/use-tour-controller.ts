'use client';

/**
 * #1390 — 투어 컨트롤러 (ADR `docs/decisions/20261021-1390-education-tour.md` 결정 E4 — 기존 명령만 보낸다).
 *
 * 하는 일은 셋뿐이다 — (1) `planTourStep` 이 낸 액션을 순서대로 **실행**, (2) store 를 **구독**해 `detectTourDrift` 결과를
 * 투어 store 에 반영, (3) 재생 구간 끝에서 정지. 판정은 전부 순수 함수에 있다. 카메라 · 자유 비행 상태기계 · `sim-canvas`
 * 포커스 동기는 건드리지 않는다 (§Concrete Prediction — `sim-canvas.tsx` 0 줄).
 *
 * 실측 (2026-10-21, PR1 — `?gpu=a` headless 3회): `focusOn` · `jumpToJulianDate` · `setTimeScale` · `resetCamera` ·
 * `enterFreeFly` 는 전부 **명령 호출 안에서 store 반영까지 동기**로 끝난다 (core emit → `core-adapter` → store). 그래서 「적용 중
 * 판정 보류」 (`applyingRef`) 는 묶음을 실행하는 동안만 걸면 충분하다 — 묶음이 끝난 직후 첫 판정이 곧 정착 판정이다.
 *
 * 마운트는 하나 — 교육 모드 카드 (`tour-card.tsx`) 가 항상 마운트돼 이 훅을 쓴다 (모드가 바뀌어도 종료 복원이 돌도록 카드는
 * 렌더만 생략한다).
 */

import { useQueryStates } from 'nuqs';
import { useCallback, useEffect, useMemo, useRef, useSyncExternalStore } from 'react';
import { DISPLAY_TOGGLES, getDisplayToggle } from '@/core/display-toggles';
import { DISPLAY_URL_KEYS } from '@/core/use-display-toggle';
import { useSimCommand } from '@/core/sim-context';
import {
  getServerTimeEventsSnapshot,
  getTimeEventsSnapshot,
  requestTimeEvents,
  subscribeTimeEvents,
} from '@/lib/time-events';
import { getTour } from '@/lib/tours';
import {
  detectTourDrift,
  isTourWindowComplete,
  plannedAfterWindowStop,
  type TourDriftAxis,
  type TourObservedState,
} from '@/lib/tours/detect-tour-drift';
import {
  planDisplayRestore,
  planTourStep,
  readDisplayIntents,
  type TourAction,
} from '@/lib/tours/plan-tour-step';
import type { TourDef } from '@/lib/tours/types';
import { useSimStore } from '@/store/sim-store';
import { useTourStore } from '@/store/tour-store';

/** 사건 목록을 불러오지 못했을 때 카드에 보일 문구. */
export const TOUR_EVENTS_ERROR = '사건 목록을 불러오지 못했습니다. 다시 시도해 주세요.';

export interface TourController {
  /** 목록에서 투어 시작 (1단계). 장면 · 사건 목록이 준비되면 적용된다. */
  start: (tourId: string) => void;
  goTo: (stepIndex: number) => void;
  next: () => void;
  prev: () => void;
  /** 「이 장면으로 돌아가기」 — 현재 단계 재적용. */
  returnToScene: () => void;
  /** 종료 — 표시 토글 · 표시 URL 키를 시작 전으로 되돌린다 (결정 Q7 (a)). */
  end: () => void;
}

function tourUsesEvents(tour: TourDef): boolean {
  return tour.steps.some((s) => s.time !== undefined && 'eventId' in s.time);
}

function resolveEventJd(eventId: string): number | null {
  return getTimeEventsSnapshot().events.find((e) => e.id === eventId)?.julianDate ?? null;
}

function observe(): TourObservedState {
  const s = useSimStore.getState();
  return {
    selectedBodyId: s.selectedBodyId,
    freeFlyMode: s.freeFlyMode,
    julianDate: s.julianDate,
    timeScale: s.timeScale,
    display: readDisplayIntents(s),
  };
}

function sameAxes(a: readonly TourDriftAxis[], b: readonly TourDriftAxis[]): boolean {
  return a.length === b.length && a.every((x, i) => x === b[i]);
}

/** 표시 URL 키 원문 (시작 전 상태 그대로 되돌리기 위해 — `?belt=500` · `?corona=force` 같은 비-on/off 값 포함). */
function readDisplayUrl(): Record<string, string | null> {
  const params = new URLSearchParams(window.location.search);
  const out: Record<string, string | null> = {};
  for (const def of DISPLAY_TOGGLES) out[def.urlKey] = params.get(def.urlKey);
  return out;
}

export function useTourController(): TourController {
  const sendCommand = useSimCommand();
  // 종료 복원에서만 쓴다 — 단계 적용은 표시 URL 을 쓰지 않는다 (ADR §구현 인계 ⚠️ — 쓰면 복원 후 URL 이 투어 값을 남긴다).
  const [, setDisplayUrl] = useQueryStates(DISPLAY_URL_KEYS, { history: 'replace' });
  const applyingRef = useRef(false);
  const stopScheduledRef = useRef(false);

  const mode = useSimStore((s) => s.mode);
  const capabilities = useSimStore((s) => s.displayCapabilities);
  const pendingStart = useTourStore((s) => s.pendingStart);
  const activeTourId = useTourStore((s) => s.activeTourId);
  const events = useSyncExternalStore(
    subscribeTimeEvents,
    getTimeEventsSnapshot,
    getServerTimeEventsSnapshot,
  );

  const execute = useCallback(
    (actions: readonly TourAction[]) => {
      applyingRef.current = true;
      try {
        for (const action of actions) {
          const sim = useSimStore.getState();
          switch (action.type) {
            case 'display': {
              const def = getDisplayToggle(action.id);
              sim[def.setterKey](action.visible);
              if (def.command) sendCommand(def.command(action.visible));
              break;
            }
            case 'command':
              sendCommand(action.command);
              break;
            case 'focusViewRequest':
              sim.setFocusViewRequest(action.request);
              break;
            case 'rulerAnchor':
              sim.setRulerAnchor(action.anchorId);
              break;
          }
        }
      } finally {
        applyingRef.current = false;
      }
    },
    [sendCommand],
  );

  const evaluate = useCallback(() => {
    const t = useTourStore.getState();
    if (t.activeTourId === null || t.planned === null || applyingRef.current) return;
    const drift = detectTourDrift(t.planned, observe());
    if (!sameAxes(drift, t.drift)) t.patch({ drift });
  }, []);

  const applyStep = useCallback(
    (tourId: string, stepIndex: number) => {
      const step = getTour(tourId)?.steps[stepIndex];
      const snapshot = useTourStore.getState().displaySnapshot;
      if (!step || !snapshot) return;
      const sim = useSimStore.getState();
      const plan = planTourStep(step, {
        snapshot,
        current: readDisplayIntents(sim),
        capabilities: sim.displayCapabilities,
        resolveEventJd,
      });
      if (!plan.ok) {
        useTourStore.getState().patch({ error: plan.reason });
        return;
      }
      execute(plan.actions);
      stopScheduledRef.current = false;
      useTourStore.getState().patch({
        stepIndex,
        planned: plan.planned,
        unavailable: plan.unavailable,
        drift: [],
        error: null,
      });
      // 묶음 직후 첫 판정 — 명령이 동기라 (모듈 머리 실측) 여기서 이탈 0 이어야 정상이다.
      evaluate();
    },
    [execute, evaluate],
  );

  // 시작 요청 소비 — 장면 가용성 (고유 발견 2: 표시 set 은 `displayCapabilities === null` 이면 no-op) + 사건 목록 대기.
  // 실측 (PR1, 3/3): `UrlSync` 초기 effect 가 가용성 설정보다 0.44~2.5 s 먼저 돈다 — 이 대기가 없으면 URL 진입 단계의 표시 토글이
  // 사라진다.
  useEffect(() => {
    if (pendingStart === null || capabilities === null) return;
    const tour = getTour(pendingStart.tourId);
    if (!tour) {
      useTourStore.getState().patch({ pendingStart: null });
      return;
    }
    if (tourUsesEvents(tour)) {
      if (events.status === 'idle') {
        requestTimeEvents();
        return;
      }
      if (events.status === 'loading') return;
      if (events.status === 'error') {
        useTourStore.getState().patch({ pendingStart: null, error: TOUR_EVENTS_ERROR });
        return;
      }
    }
    const t = useTourStore.getState();
    // 진행 중 투어를 바꾸는 경우 스냅샷은 처음 것을 유지한다 (종료 복원 기준은 「투어에 들어오기 전」).
    const fresh = t.activeTourId === null || t.displaySnapshot === null;
    t.patch({
      pendingStart: null,
      activeTourId: tour.id,
      displaySnapshot: fresh ? readDisplayIntents(useSimStore.getState()) : t.displaySnapshot,
      displayUrlSnapshot: fresh ? readDisplayUrl() : t.displayUrlSnapshot,
      error: null,
    });
    applyStep(tour.id, pendingStart.stepIndex);
  }, [pendingStart, capabilities, events.status, applyStep]);

  // 구독 — 재생 구간 끝 정지 + 이탈 판정.
  useEffect(() => {
    if (activeTourId === null) return;
    const stopAtWindowEnd = () => {
      stopScheduledRef.current = false;
      const planned = useTourStore.getState().planned;
      if (
        planned === null ||
        planned.window === null ||
        !isTourWindowComplete(planned, observe())
      ) {
        return;
      }
      // 정지 → 구간 끝 시각으로 맞춤 (프레임 경계 초과분을 지워 정지 시각이 결정적이다). 이탈로 세지 않는다.
      execute([
        { type: 'command', command: { type: 'setTimeScale', scale: 0 } },
        {
          type: 'command',
          command: { type: 'jumpToJulianDate', julianDate: planned.window.endJd },
        },
      ]);
      useTourStore.getState().patch({ planned: plannedAfterWindowStop(planned) });
      evaluate();
    };
    return useSimStore.subscribe((s) => {
      const planned = useTourStore.getState().planned;
      if (planned === null || applyingRef.current) return;
      if (isTourWindowComplete(planned, s)) {
        // 구독 콜백 안에서 store 를 다시 쓰지 않는다 — 같은 알림 루프의 다른 구독자 (sim-canvas 등) 가 낡은 (state, prev) 쌍을
        // 받는다. 마이크로태스크로 미룬다.
        if (!stopScheduledRef.current) {
          stopScheduledRef.current = true;
          queueMicrotask(stopAtWindowEnd);
        }
        return;
      }
      evaluate();
    });
  }, [activeTourId, execute, evaluate]);

  const end = useCallback(() => {
    const t = useTourStore.getState();
    if (t.displaySnapshot) {
      execute(planDisplayRestore(t.displaySnapshot, readDisplayIntents(useSimStore.getState())));
    }
    if (t.displayUrlSnapshot) void setDisplayUrl({ ...t.displayUrlSnapshot });
    t.reset();
  }, [execute, setDisplayUrl]);

  // 모드 전환 (관찰 · 연구) = 투어 종료 (결정 E3 끝 항목). 렌더 시점 값만 본다 — URL 진입은 `UrlSync` 가 모드와 시작 요청을 같은
  // effect 에서 함께 쓰므로 그 커밋의 이 effect 는 둘 다 낡은 값 (observe · null) 이라 오발화하지 않는다.
  useEffect(() => {
    if (mode === 'education') return;
    if (activeTourId !== null || pendingStart !== null) end();
  }, [mode, activeTourId, pendingStart, end]);

  const start = useCallback((tourId: string) => {
    const tour = getTour(tourId);
    if (!tour) return;
    // 실패 뒤 재시도 포함 — `requestTimeEvents` 는 불러오는 중 · 완료면 no-op, 실패 뒤면 다시 받는다.
    if (tourUsesEvents(tour)) requestTimeEvents();
    useTourStore.getState().requestStart(tourId, 0, true);
  }, []);

  const goTo = useCallback(
    (stepIndex: number) => {
      const { activeTourId: id } = useTourStore.getState();
      const tour = id === null ? null : getTour(id);
      if (!tour || stepIndex < 0 || stepIndex >= tour.steps.length) return;
      applyStep(tour.id, stepIndex);
    },
    [applyStep],
  );

  return useMemo(
    () => ({
      start,
      goTo,
      next: () => goTo(useTourStore.getState().stepIndex + 1),
      prev: () => goTo(useTourStore.getState().stepIndex - 1),
      returnToScene: () => goTo(useTourStore.getState().stepIndex),
      end,
    }),
    [start, goTo, end],
  );
}
