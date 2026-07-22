import type { physics } from '@astro-simulator/core';
import type { SimMode } from '@astro-simulator/shared';
import { create } from 'zustand';
import {
  FREE_FLY_SENSITIVITY_DEFAULT,
  savePersistedSensitivity,
  type FreeFlySensitivity,
  type FreeFlySensitivityAxis,
} from './free-fly-sensitivity';

type IntegratorKind = physics.IntegratorKind;

// #841 — UnitSystem / unitSystem / setUnitSystem 제거. 소비자가 UnitToggle 자신뿐인
// display-only 상태였고 "P2 확장" 계획은 폐기된 v2 로드맵 잔재. 단위 전환 재도입 시
// 실제 소비자(포매터)와 함께 신규 이슈로 설계한다.

/**
 * P7-D #209 — 비-fatal 알림 객체.
 * 키 분리 dismiss 관리 목적 (예: 사용자가 WebGPU 폴백 알림을 닫은 상태에서
 * 모바일 best-effort 경고가 후속 표시될 때 서로 간섭하지 않도록 한다).
 */
export interface EngineNotice {
  /** 알림 유형 식별자 (예: 'webgpu-fallback', 'tier-c-graceful-degradation'). */
  key: string;
  /** 사용자에게 표시될 텍스트. */
  message: string;
}
/**
 * 물리 엔진 종류 (P3-0 #126).
 *  - kepler: 2-body 해석해 (P1)
 *  - newton: N-body Velocity-Verlet 직접합 (P2-A, wasm)
 *  - barnes-hut: O(N log N) octree (P3-A 도입 예정 — 현재 비활성)
 *  - webgpu: GPU compute shader (P3-B 도입 예정 — 현재 비활성)
 *  - auto: 환경 capability 감지로 최적 자동 선택 (현재는 newton로 동작)
 */
export type PhysicsEngineKind = 'kepler' | 'newton' | 'barnes-hut' | 'webgpu' | 'auto';

/** 현재 런타임에서 실제 동작하는 엔진. webgpu는 capability 보유 환경에서만 가능 (sim-canvas가 폴백 처리). */
export const RUNNABLE_ENGINES: ReadonlySet<PhysicsEngineKind> = new Set([
  'kepler',
  'newton',
  'barnes-hut',
  'webgpu',
  'auto',
]);

/**
 * 시뮬레이션 UI 상태 store.
 *
 * Core에서 방출되는 이벤트를 어댑터가 이 store에 반영한다.
 * 컴포넌트는 이 store를 선택적으로 구독한다 (리렌더 최소화).
 *
 * ## 좌표계 불변식 (P11-A #288, ADR `docs/decisions/20260422-floating-origin.md` §3)
 *
 * 만약 body 월드 좌표를 이 store 에 추가하게 되면 **반드시 Heliocentric 절대 좌표 (m)** 를 유지한다.
 * - Rust physics engine state: Heliocentric 절대 좌표 (m)
 * - 본 store state: Heliocentric 절대 좌표 (m) — 정보 패널 거리 표시, JPL 호환
 * - Babylon/Three.js scene 좌표: Scene 삽입 **직전** 에만 Floating Origin 행렬 변환 적용 (shift-local)
 *
 * Scene 좌표 (shift-local 또는 scene unit) 가 store 로 누출되면 origin shift 에 따라
 * UI 숫자가 흔들려 사용자 혼란 + JPL 외부 비교 불가 → 즉시 버그로 간주.
 */
export interface SimStoreState {
  // 엔진 상태
  rendererKind: 'webgpu' | 'webgl2' | null;
  engineError: string | null;
  /**
   * 비-fatal 알림 (예: WebGPU 미지원 폴백). dismiss 가능.
   * P7-D #209: `{ key, message }` 구조로 확장 — 키 분리 dismiss 관리.
   */
  engineNotice: EngineNotice | null;
  /**
   * P7-D #209 — 사용자가 dismiss한 알림 key 집합 (세션 한정).
   * 같은 key의 알림이 재발생해도 자동 표시하지 않는다.
   * 영속화(localStorage)는 본 마일스톤 범위 밖 — 후속 이슈로 분리.
   */
  dismissedNoticeKeys: ReadonlySet<string>;

  // 시뮬레이션 상태
  mode: SimMode;
  julianDate: number | null;
  selectedBodyId: string | null;
  /**
   * #509 — 자유시점 (free-fly) 모드. focus 해제 시 'reset' (sun 중심 복귀) vs 'free-fly' (시점 유지) 구분.
   *
   * 전이:
   *  - focus 진입 (selectedBodyId !== null) → 자동 false
   *  - resetCamera 경로 → false (sun 중심)
   *  - enterFreeFly 경로 → true (시점 유지)
   * subscribe 측은 `selectedBodyId === null && freeFlyMode === true` 분기에서 detachFocus + clearFollow.
   */
  freeFlyMode: boolean;
  /**
   * #688 — 궤도선 (행성+위성 일괄) 가시성. 토글 버튼 표시 + 런타임 on/off 의 SSoT.
   *
   * 초기값은 URL `?orbits=` (parseOrbitsVisible) 가 sim-canvas mount 시 결정 (기본 true).
   * 버튼 클릭 → setOrbitLinesVisible 액션 (store) + setOrbitLinesVisible command (scene) 동시.
   */
  orbitLinesVisible: boolean;
  /**
   * #704 — free-fly 카메라 감도 4축 계수 (wasd / zoomoutFactor / panning / zoom).
   *
   * 초기값 = camera.ts named const default (SSoT). 영속(localStorage)은 클라이언트 mount 후
   * `loadPersistedSensitivity()` 가 useEffect 1회 로드해 setFreeFlySensitivity 로 덮어쓴다
   * (store 생성 시 직접 로드 금지 — Next.js Hydration Mismatch 차단, ADR §결정 3 Hydration 안전).
   * sim-canvas 가 본 객체를 구독해 4축을 카메라에 동적 주입(축 1-A 경로별 최소 침습).
   */
  freeFlySensitivity: FreeFlySensitivity;
  timeScale: number;
  fps: number | null;
  physicsEngine: PhysicsEngineKind;
  /**
   * P7-B #207 — 현재 활성 적분기 (URL ?integrator=에서 결정, 초기화 시점 고정).
   * HUD 배지 표시 + 디버그 가시성 용도. 런타임 스위치는 비지원 (계약상).
   */
  integrator: IntegratorKind;
  /** 바디 id → 질량 배수 (#107). 1.0 또는 부재는 원래 질량. */
  massMultipliers: Record<string, number>;

  // 개발/디버그용 라운드트립 카운터
  pingCount: number;
  lastPingAt: number | null;

  // actions (Core → store)
  setRenderer: (kind: 'webgpu' | 'webgl2' | null) => void;
  setEngineError: (message: string | null) => void;
  /**
   * P7-D #209 — 알림 설정/해제.
   * - `notice === null`: 현재 알림 해제 (dismiss 기록 없음).
   * - `notice` 객체: key가 `dismissedNoticeKeys`에 포함되면 재노출하지 않는다 (no-op).
   */
  setEngineNotice: (notice: EngineNotice | null) => void;
  /**
   * P7-D #209 — 사용자 dismiss. 현재 알림을 해제하고 key를 기억한다.
   * 같은 key의 후속 `setEngineNotice` 호출은 재노출되지 않는다 (세션 한정).
   */
  dismissEngineNotice: () => void;
  setMode: (mode: SimMode) => void;
  setTime: (julianDate: number) => void;
  setSelectedBody: (id: string | null) => void;
  /** #509 — 자유시점 진입 시 호출. selectedBodyId=null + freeFlyMode=true 동시 set. */
  enterFreeFly: () => void;
  /** #688 — 궤도선 가시성 설정. 토글 버튼 + URL 초기값에서 호출 (버튼 표시 SSoT). */
  setOrbitLinesVisible: (visible: boolean) => void;
  /**
   * #704 — 단일 감도 축 갱신 (ADR §결정 1/3).
   *
   * @param axis  'wasd' | 'zoomoutFactor' | 'panning' | 'zoom' (리터럴 유니온 — 오타 컴파일 차단).
   * @param value 새 값 (모달이 슬라이더 onValueChange 에서 전달 — 런타임 카메라 즉시 반영).
   * @param persist localStorage 디스크 쓰기 여부. 슬라이더는 onValueChange=false(드래그 중 폭주 회피)
   *               / onValueCommit=true(드래그 종료 1회). 누락 시 false (메모리만 갱신).
   */
  setFreeFlySensitivity: (axis: FreeFlySensitivityAxis, value: number, persist?: boolean) => void;
  /**
   * #704 — 4축 일괄 default 복원 + localStorage 즉시 동기화 (ADR §결정 3 reset 영속 동기화).
   * 누락 시 복원 후 새로고침하면 이전 영속값 재로드되는 버그 (agy 누락 요소 1) → reset 은 항상 persist.
   */
  resetFreeFlySensitivity: () => void;
  setTimeScale: (scale: number) => void;
  setFps: (fps: number) => void;
  setPhysicsEngine: (kind: PhysicsEngineKind) => void;
  /**
   * P7-B #207 — 초기화 시점에 URL 파라미터로 결정된 적분기를 스토어에 기록.
   * 런타임 스위치는 비지원이지만 HUD 배지 렌더링을 위해 setter 는 필요.
   */
  setIntegrator: (kind: IntegratorKind) => void;
  setMassMultiplier: (bodyId: string, multiplier: number) => void;
  resetMassMultipliers: () => void;
  incrementPing: () => void;
}

// #405 — P6-B BlackHoleDisk store (`?bh=2` accretion disk) 폐기. v3 reset 후 적용 대상 없음.

export const useSimStore = create<SimStoreState>((set) => ({
  rendererKind: null,
  engineError: null,
  engineNotice: null,
  dismissedNoticeKeys: new Set<string>(),
  mode: 'observe',
  julianDate: null,
  selectedBodyId: null,
  freeFlyMode: false,
  // #688 — 기본 ON. URL `?orbits=off` 진입 시 sim-canvas 가 mount 직후 false 로 덮어쓴다.
  orbitLinesVisible: true,
  // #704 — 감도 4축 초기값 = camera.ts const default (SSoT). 영속 로드는 클라 mount useEffect 가 담당
  // (Hydration Mismatch 차단 — 서버·클라 동일 default 로 첫 렌더 고정, ADR §결정 3).
  freeFlySensitivity: { ...FREE_FLY_SENSITIVITY_DEFAULT },
  timeScale: 86_400,
  fps: null,
  physicsEngine: 'kepler',
  integrator: 'velocity-verlet',
  massMultipliers: {},
  pingCount: 0,
  lastPingAt: null,

  setRenderer: (kind) => set({ rendererKind: kind }),
  setEngineError: (message) => set({ engineError: message }),
  setEngineNotice: (notice) =>
    set((state) => {
      if (notice === null) return { engineNotice: null };
      // 이미 dismiss한 key는 재노출하지 않는다 (세션 한정).
      if (state.dismissedNoticeKeys.has(notice.key)) return state;
      return { engineNotice: notice };
    }),
  dismissEngineNotice: () =>
    set((state) => {
      const current = state.engineNotice;
      if (!current) return { engineNotice: null };
      const next = new Set(state.dismissedNoticeKeys);
      next.add(current.key);
      return { engineNotice: null, dismissedNoticeKeys: next };
    }),
  setMode: (mode) => set({ mode }),
  setTime: (julianDate) => set({ julianDate }),
  setSelectedBody: (id) =>
    // #509 — focus 진입 시 freeFlyMode 자동 해제. resetCamera 경로 (id=null) 도 freeFlyMode=false.
    // enterFreeFly 경로는 별도 action 으로 freeFlyMode=true 명시.
    set({ selectedBodyId: id, freeFlyMode: false }),
  enterFreeFly: () => set({ selectedBodyId: null, freeFlyMode: true }),
  setOrbitLinesVisible: (visible) => set({ orbitLinesVisible: visible }),
  setFreeFlySensitivity: (axis, value, persist = false) =>
    set((state) => {
      // 동일 값이면 no-op (불필요 리렌더/영속 회피 — Hydration 로드가 default 와 같을 때 등).
      if (state.freeFlySensitivity[axis] === value) return state;
      const next = { ...state.freeFlySensitivity, [axis]: value };
      // onValueCommit(드래그 종료) 시점에만 디스크 쓰기 — onValueChange 매 픽셀 폭주 회피 (ADR §결정 3).
      if (persist) savePersistedSensitivity(next);
      return { freeFlySensitivity: next };
    }),
  resetFreeFlySensitivity: () => {
    // 4축 default 복원 + localStorage 즉시 동기화 (누락 시 복원 후 새로고침에 이전 영속값 재로드 — agy).
    const next = { ...FREE_FLY_SENSITIVITY_DEFAULT };
    savePersistedSensitivity(next);
    set({ freeFlySensitivity: next });
  },
  setTimeScale: (scale) => set({ timeScale: scale }),
  setFps: (fps) => set({ fps }),
  setPhysicsEngine: (kind) => set({ physicsEngine: kind }),
  setIntegrator: (kind) => set({ integrator: kind }),
  setMassMultiplier: (bodyId, multiplier) =>
    set((state) => {
      const next = { ...state.massMultipliers };
      if (multiplier === 1) delete next[bodyId];
      else next[bodyId] = multiplier;
      return { massMultipliers: next };
    }),
  resetMassMultipliers: () => set({ massMultipliers: {} }),
  incrementPing: () =>
    set((state) => ({
      pingCount: state.pingCount + 1,
      lastPingAt: Date.now(),
    })),
}));

/**
 * P7-E #210 / #221 — dev 빌드 한정 전역 노출 (E2E 통합 검증 목적).
 *
 * - `process.env.NODE_ENV !== 'production'` 가드로 Next.js webpack dead-code
 *   elimination 트리거 — prod 번들에는 이 블록 전체가 포함되지 않는다.
 * - `browser-verify-mobile-p7d.mjs` 시나리오 4 의 "UI 통합 스킵" 분기 제거 목적.
 * - 민감 데이터 아님 (Zustand store API) — dev 검증 전용.
 *
 * 속성 구성 근거 (#226-2):
 * - `configurable: true` — Next.js HMR(Hot Module Replacement) 이 이 모듈을 재평가할 때
 *   기존 프로퍼티를 재정의(`defineProperty` 재호출) 할 수 있도록 허용. `false` 면 HMR 사이클
 *   두 번째부터 `TypeError: Cannot redefine property: __simStore` 로 dev 서버가 멈춘다.
 * - `writable: false` — 직접 할당(`window.__simStore = ...`) 으로 스토어 참조를 바꾸지 못하도록
 *   방어. 재정의는 HMR 경로(configurable) 로만 가능.
 * - 일반 할당(`window.__simStore = useSimStore`) 대신 `defineProperty` 를 쓰는 이유는
 *   `writable: false` 를 명시하기 위함 — 할당 문법으로는 이 보장을 얻을 수 없다.
 *
 * 검증: `grep -r "__simStore" apps/web/.next/static` 실행 후 0건이면 성공.
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  Object.defineProperty(window, '__simStore', {
    configurable: true,
    value: useSimStore,
    writable: false,
  });
}
