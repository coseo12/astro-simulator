/**
 * #1390 — 투어 장면 이탈 판정 (순수 함수, ADR `docs/decisions/20261021-1390-education-tour.md` 결정 E3 「이탈 축」).
 *
 * 캔버스 줌 · 회전은 보지 않는다 — 장면 (선택) 을 깨지 않기 때문이다 (ADR 1-C 실측). 충돌은 store 상태 층에서만 생기므로 그
 * 축만 비교한다: 선택 · 자유 비행 · 시각 · 배속 · 단계가 지정한 표시 토글.
 */

import type { DisplayToggleId } from '@/core/display-toggles';
import type { DisplayIntents, PlannedTourState } from './plan-tour-step';

/** 시각 비교 허용 오차 [일] — DoD E2 와 같은 값 (§교차검증 합의 5). */
export const TOUR_TIME_TOLERANCE_DAYS = 1e-6;

export type TourDriftAxis = 'focus' | 'freeFly' | 'time' | 'timeScale' | 'display';

export interface TourObservedState {
  selectedBodyId: string | null;
  freeFlyMode: boolean;
  julianDate: number | null;
  timeScale: number;
  display: DisplayIntents;
}

export function detectTourDrift(
  planned: PlannedTourState,
  observed: TourObservedState,
): TourDriftAxis[] {
  const axes: TourDriftAxis[] = [];
  if (observed.freeFlyMode) axes.push('freeFly');
  if (observed.selectedBodyId !== planned.focusBodyId) axes.push('focus');

  if (planned.timeScale === 0) {
    // 정지 단계 — 재생 · 스크러버 · 사건 선택 · 날짜 입력이 전부 이 두 축으로 수렴한다.
    if (observed.timeScale !== 0) axes.push('timeScale');
    if (planned.julianDate !== null && !sameJd(observed.julianDate, planned.julianDate)) {
      axes.push('time');
    }
  } else {
    // 재생 단계 — 배속 변경, 그리고 시각을 지정했으면 재생 구간 밖 (§교차검증 이견 수용 1 — 재생 중 스크러버 점프).
    // 일시정지 후 같은 배속으로 재개하면 구간 안인 한 비이탈이다 (§교차검증 기각 2).
    if (observed.timeScale !== planned.timeScale) axes.push('timeScale');
    if (planned.window !== null && !insideWindow(observed.julianDate, planned.window)) {
      axes.push('time');
    }
  }

  for (const [id, value] of Object.entries(planned.display) as [DisplayToggleId, boolean][]) {
    if (observed.display[id] !== value) {
      axes.push('display');
      break;
    }
  }
  return axes;
}

/**
 * 재생 구간 끝에 닿았는가 — 컨트롤러가 이 판정으로 정지한다 (결정 E2 — 단계 진행은 아니다). 단계 배속 그대로 재생 중일 때만
 * 참이다 (사용자가 배속을 바꿨으면 그건 이탈이지 구간 종료가 아니다).
 */
export function isTourWindowComplete(
  planned: PlannedTourState,
  observed: Pick<TourObservedState, 'julianDate' | 'timeScale'>,
): boolean {
  if (planned.window === null || planned.timeScale === 0) return false;
  if (observed.timeScale !== planned.timeScale || observed.julianDate === null) return false;
  const end = planned.window.endJd;
  return planned.timeScale > 0
    ? observed.julianDate >= end - TOUR_TIME_TOLERANCE_DAYS
    : observed.julianDate <= end + TOUR_TIME_TOLERANCE_DAYS;
}

/** 구간 끝에서 멈춘 뒤의 기준 장면 — 정지 · 시각 = 구간 끝. 이 정지는 이탈로 세지 않는다 (결정 E3). */
export function plannedAfterWindowStop(planned: PlannedTourState): PlannedTourState {
  if (planned.window === null) return planned;
  return { ...planned, timeScale: 0, julianDate: planned.window.endJd, window: null };
}

function sameJd(observed: number | null, planned: number): boolean {
  return observed !== null && Math.abs(observed - planned) <= TOUR_TIME_TOLERANCE_DAYS;
}

function insideWindow(
  observed: number | null,
  window: { startJd: number; endJd: number },
): boolean {
  if (observed === null) return false;
  const lo = Math.min(window.startJd, window.endJd) - TOUR_TIME_TOLERANCE_DAYS;
  const hi = Math.max(window.startJd, window.endJd) + TOUR_TIME_TOLERANCE_DAYS;
  return observed >= lo && observed <= hi;
}
