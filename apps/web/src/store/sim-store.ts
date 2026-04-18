import type { physics } from '@astro-simulator/core';
import type { SimMode } from '@astro-simulator/shared';
import { create } from 'zustand';

type IntegratorKind = physics.IntegratorKind;

export type UnitSystem = 'si' | 'astro' | 'natural';

/**
 * P7-D #209 — 비-fatal 알림 객체.
 * 키 분리 dismiss 관리 목적 (예: 사용자가 WebGPU 폴백 알림을 닫은 상태에서
 * 모바일 best-effort 경고가 후속 표시될 때 서로 간섭하지 않도록 한다).
 */
export interface EngineNotice {
  /** 알림 유형 식별자 (예: 'webgpu-fallback', 'mobile-webgpu-best-effort'). */
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
  timeScale: number;
  fps: number | null;
  unitSystem: UnitSystem;
  physicsEngine: PhysicsEngineKind;
  /**
   * P7-B #207 — 현재 활성 적분기 (URL ?integrator=에서 결정, 초기화 시점 고정).
   * HUD 배지 표시 + 디버그 가시성 용도. 런타임 스위치는 비지원 (계약상).
   */
  integrator: IntegratorKind;
  /** 바디 id → 질량 배수 (#107). 1.0 또는 부재는 원래 질량. */
  massMultipliers: Record<string, number>;

  /**
   * P6-B #190 — accretion disk 파라미터 (?bh=2 옵트인 시에만 의미).
   * 슬라이더 변경 → store → sim-canvas useEffect → handles.setDisk* 호출.
   */
  blackHoleDisk: BlackHoleDiskParams;

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
  setTimeScale: (scale: number) => void;
  setFps: (fps: number) => void;
  setUnitSystem: (unit: UnitSystem) => void;
  setPhysicsEngine: (kind: PhysicsEngineKind) => void;
  /**
   * P7-B #207 — 초기화 시점에 URL 파라미터로 결정된 적분기를 스토어에 기록.
   * 런타임 스위치는 비지원이지만 HUD 배지 렌더링을 위해 setter 는 필요.
   */
  setIntegrator: (kind: IntegratorKind) => void;
  setMassMultiplier: (bodyId: string, multiplier: number) => void;
  resetMassMultipliers: () => void;
  setBlackHoleDiskParam: <K extends keyof BlackHoleDiskParams>(
    key: K,
    value: BlackHoleDiskParams[K],
  ) => void;
  resetBlackHoleDisk: () => void;
  incrementPing: () => void;
}

/** P6-B #190 — accretion disk 5 파라미터. ADR (4)-i 평면 thin disk. */
export interface BlackHoleDiskParams {
  /** disk 안쪽 반경 (Rs 단위). photon sphere 안쪽 비물리 → 1.5 권장 하한. */
  innerRs: number;
  /** disk 바깥 반경 (Rs 단위). */
  outerRs: number;
  /** 이심률 (0~0.9). */
  eccentricity: number;
  /** 두께 (Rs 단위). */
  thicknessRs: number;
  /** 기울기 (도). 셰이더에는 rad로 변환되어 전달. */
  tiltDeg: number;
}

const DEFAULT_BLACK_HOLE_DISK: BlackHoleDiskParams = {
  innerRs: 1.5,
  outerRs: 6.0,
  eccentricity: 0.0,
  thicknessRs: 0.15,
  tiltDeg: 17, // ≈ 0.3 rad
};

export const useSimStore = create<SimStoreState>((set) => ({
  rendererKind: null,
  engineError: null,
  engineNotice: null,
  dismissedNoticeKeys: new Set<string>(),
  mode: 'observe',
  julianDate: null,
  selectedBodyId: null,
  timeScale: 86_400,
  fps: null,
  unitSystem: 'astro',
  physicsEngine: 'kepler',
  integrator: 'velocity-verlet',
  massMultipliers: {},
  blackHoleDisk: { ...DEFAULT_BLACK_HOLE_DISK },
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
  setSelectedBody: (id) => set({ selectedBodyId: id }),
  setTimeScale: (scale) => set({ timeScale: scale }),
  setFps: (fps) => set({ fps }),
  setUnitSystem: (unit) => set({ unitSystem: unit }),
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
  setBlackHoleDiskParam: (key, value) =>
    set((state) => ({ blackHoleDisk: { ...state.blackHoleDisk, [key]: value } })),
  resetBlackHoleDisk: () => set({ blackHoleDisk: { ...DEFAULT_BLACK_HOLE_DISK } }),
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
 * 검증: `grep -r "__simStore" apps/web/.next/static` 실행 후 0건이면 성공.
 */
if (typeof window !== 'undefined' && process.env.NODE_ENV !== 'production') {
  Object.defineProperty(window, '__simStore', {
    configurable: true,
    value: useSimStore,
    writable: false,
  });
}
