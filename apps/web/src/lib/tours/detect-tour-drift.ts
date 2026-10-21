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

/** 초당 일수 — 배속 [초/초] × 벽시계 [초] → 장면 시각 진행 [일]. */
const SECONDS_PER_DAY = 86_400;
/**
 * 프레임 진행으로 인정하는 시각 진행의 배수 여유 — 「직전 표본 이후 벽시계 경과 × 배속」 의 이 배까지는 재생이 흘린 시각이다.
 * core 는 프레임 dt 를 자르지 않으므로 (`simulation-core.ts` 렌더 루프 — 탭 복귀 뒤 첫 프레임은 길다) 고정 dt 상한 대신 **벽시계
 * 경과로 기대 진행량을 잰다**. 2 배 = core 의 프레임 시각과 구독 알림 시각의 어긋남 흡수.
 */
export const TOUR_FRAME_ADVANCE_SLACK = 2;
/** 벽시계 경과의 하한 [ms] — 같은 태스크 안 연속 알림 (경과 ≈ 0) 에서도 한 프레임 분량은 진행으로 인정한다. */
export const TOUR_MIN_FRAME_MS = 50;

/** 시각 · 배속 표본 — 컨트롤러가 store 의 시각 · 배속이 바뀔 때마다 벽시계 시각과 함께 남긴다. */
export interface TourTimeSample {
  julianDate: number | null;
  timeScale: number;
  /** `performance.now()` [ms]. */
  atMs: number;
}

/**
 * 재생 구간 끝에 **재생으로** 닿았는가 — 컨트롤러가 이 판정으로 정지한다 (결정 E2 — 단계 진행은 아니다).
 *
 * 참 조건 (전부): 직전 표본 · 지금 모두 단계 배속으로 재생 중 · 직전 표본은 구간 안 · 지금은 끝을 넘음 · 그 사이 진행이 재생 방향이고
 * 「벽시계 경과 × 배속 × 여유」 이내. 마지막 조건이 **프레임 진행과 사용자 도약을 가른다** — 재생 중 스크러버를 앞으로 끌거나
 * 「지금」 을 누르면 (배속은 그대로 `jumpToJulianDate` 만 간다) 같은 배속 · 끝 너머라도 거짓이고, 그 도약은 `detectTourDrift`
 * 의 `'time'` 이탈이 된다 (PR #1394 리뷰 B1 — 종전 판정은 「배속 같음 ∧ 끝 너머」 뿐이라 도약을 끝으로 되돌리고 안내도 없었다).
 */
export function isTourWindowComplete(
  planned: PlannedTourState,
  prev: TourTimeSample | null,
  cur: TourTimeSample,
): boolean {
  const window = planned.window;
  const scale = planned.timeScale;
  if (window === null || scale === 0 || prev === null) return false;
  if (prev.timeScale !== scale || cur.timeScale !== scale) return false;
  if (prev.julianDate === null || cur.julianDate === null) return false;
  if (!insideWindow(prev.julianDate, window)) return false;
  const direction = Math.sign(scale);
  const crossed =
    direction > 0
      ? cur.julianDate >= window.endJd - TOUR_TIME_TOLERANCE_DAYS
      : cur.julianDate <= window.endJd + TOUR_TIME_TOLERANCE_DAYS;
  if (!crossed) return false;
  const advanceDays = (cur.julianDate - prev.julianDate) * direction;
  const elapsedMs = Math.max(cur.atMs - prev.atMs, TOUR_MIN_FRAME_MS);
  const expectedDays = ((elapsedMs / 1000) * Math.abs(scale)) / SECONDS_PER_DAY;
  return (
    advanceDays >= -TOUR_TIME_TOLERANCE_DAYS &&
    advanceDays <= expectedDays * TOUR_FRAME_ADVANCE_SLACK + TOUR_TIME_TOLERANCE_DAYS
  );
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
