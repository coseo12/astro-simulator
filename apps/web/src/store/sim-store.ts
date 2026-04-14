import type { SimMode } from '@astro-simulator/shared';
import { create } from 'zustand';

export type UnitSystem = 'si' | 'astro' | 'natural';

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

  // 시뮬레이션 상태
  mode: SimMode;
  julianDate: number | null;
  selectedBodyId: string | null;
  timeScale: number;
  fps: number | null;
  unitSystem: UnitSystem;

  // 개발/디버그용 라운드트립 카운터
  pingCount: number;
  lastPingAt: number | null;

  // actions (Core → store)
  setRenderer: (kind: 'webgpu' | 'webgl2' | null) => void;
  setEngineError: (message: string | null) => void;
  setMode: (mode: SimMode) => void;
  setTime: (julianDate: number) => void;
  setSelectedBody: (id: string | null) => void;
  setTimeScale: (scale: number) => void;
  setFps: (fps: number) => void;
  setUnitSystem: (unit: UnitSystem) => void;
  incrementPing: () => void;
}

export const useSimStore = create<SimStoreState>((set) => ({
  rendererKind: null,
  engineError: null,
  mode: 'observe',
  julianDate: null,
  selectedBodyId: null,
  timeScale: 86_400,
  fps: null,
  unitSystem: 'astro',
  pingCount: 0,
  lastPingAt: null,

  setRenderer: (kind) => set({ rendererKind: kind }),
  setEngineError: (message) => set({ engineError: message }),
  setMode: (mode) => set({ mode }),
  setTime: (julianDate) => set({ julianDate }),
  setSelectedBody: (id) => set({ selectedBodyId: id }),
  setTimeScale: (scale) => set({ timeScale: scale }),
  setFps: (fps) => set({ fps }),
  setUnitSystem: (unit) => set({ unitSystem: unit }),
  incrementPing: () =>
    set((state) => ({
      pingCount: state.pingCount + 1,
      lastPingAt: Date.now(),
    })),
}));
