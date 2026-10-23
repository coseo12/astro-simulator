import { create } from 'zustand';
import type {
  DisplayIntents,
  PlannedTourState,
  UnavailableDisplay,
} from '@/lib/tours/plan-tour-step';
import type { TourDriftAxis } from '@/lib/tours/detect-tour-drift';

/**
 * #1390 — 교육 모드 가이드 투어 상태 (ADR `docs/decisions/20261021-1390-education-tour.md`).
 *
 * 시뮬레이션 store (`sim-store.ts`) 와 나눈 이유: 투어는 장면 상태를 **소유하지 않고** 기존 명령만 보낸다 (결정 E4). 여기에는
 * 「어느 투어의 몇 단계를 무엇으로 맞췄는가」 만 둔다 — 실행 · 구독은 `use-tour-controller.ts`, 판정은 순수 함수
 * (`plan-tour-step.ts` · `detect-tour-drift.ts`).
 */
export interface TourStoreState {
  /** 진행 중인 투어 id. `null` = 목록 보기. */
  activeTourId: string | null;
  /** 0-based 단계 (URL `step` 은 1-based). */
  stepIndex: number;
  /**
   * 시작 요청 — 장면 가용성 (`displayCapabilities !== null`) 과 사건 목록 준비를 기다려 컨트롤러가 소비한다. URL 진입
   * (`UrlSync` 초기 effect) 과 목록 버튼이 같은 경로를 쓴다 (ADR 결정 · URL — 초기 적용 진입점 단일).
   */
  pendingStart: { tourId: string; stepIndex: number } | null;
  /** 투어 시작 순간의 표시 의도 12종 — 종료 시 복원 (결정 Q7). */
  displaySnapshot: DisplayIntents | null;
  /** 투어 시작 순간의 표시 URL 키 원문 — 종료 시 그대로 되돌린다 (`null` = 키 없음). */
  displayUrlSnapshot: Readonly<Record<string, string | null>> | null;
  /** 현재 단계가 맞춘 장면 (이탈 판정 기준). */
  planned: PlannedTourState | null;
  /** 현재 단계가 켜려 했으나 환경이 막은 토글. */
  unavailable: readonly UnavailableDisplay[];
  /** 이탈 축 — 비어 있으면 장면 그대로. */
  drift: readonly TourDriftAxis[];
  /** 단계 적용 실패 사유 (사건 목록 불러오기 실패 등). */
  error: string | null;

  requestStart: (tourId: string, stepIndex: number) => void;
  /** 진행 상태 일괄 갱신 (컨트롤러 전용). */
  patch: (partial: Partial<Omit<TourStoreState, 'requestStart' | 'patch' | 'reset'>>) => void;
  reset: () => void;
}

const INITIAL: Omit<TourStoreState, 'requestStart' | 'patch' | 'reset'> = {
  activeTourId: null,
  stepIndex: 0,
  pendingStart: null,
  displaySnapshot: null,
  displayUrlSnapshot: null,
  planned: null,
  unavailable: [],
  drift: [],
  error: null,
};

export const useTourStore = create<TourStoreState>((set) => ({
  ...INITIAL,
  requestStart: (tourId, stepIndex) => set({ pendingStart: { tourId, stepIndex }, error: null }),
  patch: (partial) => set(partial),
  reset: () => set(INITIAL),
}));

/** dev 전용 전역 노출 — 브라우저 검증 스크립트가 투어 상태를 읽는다 (`__simStore` 와 같은 규약 · prod 번들 제외). */
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  Object.defineProperty(window, '__tourStore', {
    configurable: true,
    value: useTourStore,
    writable: false,
  });
}
