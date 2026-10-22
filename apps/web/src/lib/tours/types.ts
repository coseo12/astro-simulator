/**
 * #1390 — 교육 모드 가이드 투어의 데이터 형식 (ADR `docs/decisions/20261021-1390-education-tour.md` 결정 E1 · 단계 형식).
 *
 * 투어는 손으로 쓰는 TS 선언이다 (`satisfies TourDef`). 엔진 (`plan-tour-step.ts` · `detect-tour-drift.ts`) 은 이 형식만 읽고
 * 투어 id 를 모른다 — 투어를 더할 때 고칠 곳은 투어 파일 하나와 목록 (`index.ts`) 1줄이다 (ADR §Concrete Prediction PR2).
 */

import type { EventFocusView } from '@astro-simulator/core';
import type { DisplayToggleId } from '@/core/display-toggles';

/** 개요 (태양 중심 — `resetCamera`). */
export const TOUR_OVERVIEW = 'overview' as const;

export interface TourCamera {
  /** R-Phase 천체 id (`isRPhaseFocusable` 참 — 콘텐츠 유효성 테스트가 고정) 또는 개요. */
  focus: string | typeof TOUR_OVERVIEW;
  /**
   * 시점 방향. 생략 = 시점 각 유지 (시점 요청을 내지 않는다 — 'keep' 값은 두지 않는다).
   * 개요에는 절대 방향 시점 (`isAbsoluteFocusView` — `ecliptic-oblique`) 만 쓴다 (#1390 Amendment 1 — 개요 복귀는 target · 거리만
   * 바꾸고 시점 각은 직전 포커스 경로가 남긴 값이라, 지정하지 않으면 진입 경로마다 화면이 달라진다. 콘텐츠 유효성 테스트가 고정).
   * ⚠️ 같은 천체가 이어지는 단계에서 카메라를 다시 잡으려면 `view` 가 있어야 한다 — 포커스 동기는 선택이 **바뀔 때만** 카메라를
   * 옮긴다 (ADR 결정 · 엔진 「같은 천체 단계의 카메라 재구도 계약」).
   */
  view?: EventFocusView;
}

/** 시각 — 율리우스일 직접 지정 또는 사건 id (`time-events.json` 의 `<kind>:<YYYY-MM-DD>`) + 시간 오프셋. */
export type TourTime = { julianDate: number } | { eventId: string; offsetHours?: number };

export interface TourStep {
  /** 안정 id (테스트 · 문안 참조용). URL `step` 은 1-based 인덱스다. */
  id: string;
  title: string;
  /** 설명 2~4 문장 — 375 바텀시트에서 접지 않고 읽히는 길이 (DoD E11 — `TOUR_BODY_MAX_CHARS`). */
  body: string;
  camera: TourCamera;
  /** 생략 = 시각 유지. */
  time?: TourTime;
  /** 배속 [초/초]. 생략 = 0 (정지). */
  timeScale?: number;
  /**
   * `timeScale ≠ 0` 단계의 재생 구간 [일] — 시작 시각부터 이만큼 지나면 컨트롤러가 정지한다 (단계 진행은 아니다 — 결정 E2).
   * 시각 (`time`) 을 지정한 재생 단계에서만 의미가 있다 (콘텐츠 유효성 테스트가 고정).
   */
  windowDays?: number;
  /** 부분 지정 — 지정하지 않은 토글은 투어 시작 시 스냅샷 값으로 둔다. */
  display?: Partial<Record<DisplayToggleId, boolean>>;
  /** 거리 자 기준점 id. 생략 = 해제 (`null`). B 는 현재 선택이다 (ADR 1341 결정 R1). */
  ruler?: string | null;
}

export interface TourDef {
  /** URL `?tour=` 값 (kebab-case). */
  id: string;
  title: string;
  /** 375 접힌 칩의 짧은 이름 (`2/5 · 일식 ▴`). */
  shortTitle: string;
  /** 목록 보기의 한 줄 요약. */
  summary: string;
  steps: readonly TourStep[];
}

/** 본문 최대 글자 수 (DoD E11 — 375 바텀시트 접힘 없이 읽힘. PR1 실측 후 재조정 가능). */
export const TOUR_BODY_MAX_CHARS = 160;
