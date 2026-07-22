import { act, cleanup, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { ReactNode } from 'react';
import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import type { SimulationCore } from '@astro-simulator/core';
import { SimCommandProvider, type BodyStateFn } from '@/core/sim-context';
import { useSimStore } from '@/store/sim-store';
import { useOsculatingSync } from './use-osculating-sync';

/**
 * #847 — 데이터 경로 전환 회귀 가드.
 *
 * 배경: 훅이 dev 전용 전역 `window.__solarScene` / `window.__simStore` 를 캐스팅 접근해
 * production 빌드 (`NODE_ENV === 'production'` 게이트로 전역 미노출) 에서 조용히 정적
 * JSON 폴백으로 퇴행했다. 본 테스트는 전환된 정식 경로 2개를 고정한다:
 *
 *  1. scene handle — `SimCommandProvider` context (`useSimBodyState`) 주입 경로
 *  2. 질량 배수 — `useSimStore` 직접 import (getState 스냅샷) 경로
 *
 * 그리고 **window 전역이 존재해도 소비하지 않음** (의존 0) 을 poisoned 전역으로 검증한다 —
 * window 경유 접근이 재도입되면 poisoned 값이 관측되어 즉시 FAIL.
 */

// --- @astro-simulator/core mock ---
// 정적 import (ephemeris) + 훅 내부 동적 import('@astro-simulator/core') (physics) 모두 대체.
// wasm 로드 없이 extract 호출 (pos, vel, mu) 인자를 관측하기 위함.
const JUPITER_MASS_KG = 1.898e27;

const { extractMock } = vi.hoisted(() => ({
  extractMock: vi.fn(() => ({
    semiMajorAxis: 421_800_000,
    eccentricity: 0.004,
    inclination: 0.038,
    longitudeOfAscendingNode: 0,
    argumentOfPeriapsis: 0,
    meanAnomaly: 0,
    singularity: 0 as const,
  })),
}));

vi.mock('@astro-simulator/core', () => ({
  ephemeris: {
    getSolarSystem: () => ({ bodies: [{ id: 'jupiter', mass: 1.898e27 }] }),
  },
  physics: { extractOsculatingElements: extractMock },
}));

// --- 헬퍼 ---

/** Jupiter-centric 고정 state 반환 stub (Newton 활성 시뮬레이션). */
const stubBodyState: BodyStateFn = (id, parentId) => {
  if (parentId !== 'jupiter' || id === parentId) return null;
  return { pos: [421.8e6, 0, 0], vel: [0, 17_334, 0] };
};

function makeWrapper(getBodyState: BodyStateFn | null) {
  const mockCore = { command: vi.fn() } as unknown as SimulationCore;
  return function Wrapper({ children }: { children: ReactNode }) {
    return (
      <SimCommandProvider core={mockCore} getBodyState={getBodyState}>
        {children}
      </SimCommandProvider>
    );
  };
}

/** poisoned dev 전역 설치 — window 경유 접근이 재도입되면 관측되도록. */
function installPoisonedGlobals() {
  const poisonedGetBodyState = vi.fn(() => ({
    pos: [1, 1, 1] as [number, number, number],
    vel: [1, 1, 1] as [number, number, number],
  }));
  Object.defineProperty(window, '__solarScene', {
    configurable: true,
    value: { getBodyState: poisonedGetBodyState },
    writable: false,
  });
  Object.defineProperty(window, '__simStore', {
    configurable: true,
    value: { getState: () => ({ massMultipliers: { jupiter: 999 } }) },
    writable: false,
  });
  return { poisonedGetBodyState };
}

function removePoisonedGlobals() {
  delete (window as unknown as Record<string, unknown>).__solarScene;
  delete (window as unknown as Record<string, unknown>).__simStore;
}

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  cleanup();
  vi.useRealTimers();
  extractMock.mockClear();
  useSimStore.getState().resetMassMultipliers();
  removePoisonedGlobals();
});

describe('useOsculatingSync — #847 context 주입 경로', () => {
  it('context getBodyState 주입 시 1 폴링 후 elements 산출 (Galilean 4체 × WASM 추출)', async () => {
    const { result } = renderHook(() => useOsculatingSync(), {
      wrapper: makeWrapper(stubBodyState),
    });

    expect(result.current.elements).toBeNull();

    // 동적 import 해소 + 첫 폴링 (baseInterval=1000ms) 경과.
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    expect(result.current.elements).not.toBeNull();
    expect(result.current.elements!.io.semiMajorAxis).toBe(421_800_000);
    // 4 Galilean 각 1회 추출.
    expect(extractMock).toHaveBeenCalledTimes(4);
    // mu = G × M_jupiter × 1 (배수 미설정).
    expect(extractMock).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.any(Array),
      GRAVITATIONAL_CONSTANT * JUPITER_MASS_KG,
    );
  });

  it('massMultipliers 는 useSimStore 직접 스냅샷 반영 — 다음 폴링부터 mu 배수 적용', async () => {
    renderHook(() => useOsculatingSync(), { wrapper: makeWrapper(stubBodyState) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });
    expect(extractMock).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.any(Array),
      GRAVITATIONAL_CONSTANT * JUPITER_MASS_KG,
    );

    // #847 — window.__simStore 아닌 같은 앱 store 직접 경로. polling 재시작 없이
    // getState() 스냅샷 재조회로 다음 폴링부터 반영되어야 한다.
    act(() => {
      useSimStore.getState().setMassMultiplier('jupiter', 2);
    });
    await act(async () => {
      await vi.advanceTimersByTimeAsync(1000);
    });

    expect(extractMock).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.any(Array),
      GRAVITATIONAL_CONSTANT * JUPITER_MASS_KG * 2,
    );
  });

  it('정당한 폴백 — getBodyState 호출 결과 null (Kepler 모드) 이면 elements null 유지', async () => {
    const keplerBodyState: BodyStateFn = () => null;
    const { result } = renderHook(() => useOsculatingSync(), {
      wrapper: makeWrapper(keplerBodyState),
    });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    expect(result.current.elements).toBeNull();
    expect(extractMock).not.toHaveBeenCalled();
  });
});

describe('useOsculatingSync — #847 window 전역 의존 0 회귀 가드', () => {
  it('dev 전역(__solarScene/__simStore)이 존재해도 소비하지 않는다 — context 미배선이면 폴백', async () => {
    const { poisonedGetBodyState } = installPoisonedGlobals();

    // context getBodyState=null (scene 미배선) — 과거 구현이면 window 전역으로 산출됐을 조건.
    const { result } = renderHook(() => useOsculatingSync(), { wrapper: makeWrapper(null) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(2100);
    });

    // 전역이 있어도 정적 폴백 유지 (window 경로 미소비 증명).
    expect(result.current.elements).toBeNull();
    expect(poisonedGetBodyState).not.toHaveBeenCalled();
    expect(extractMock).not.toHaveBeenCalled();
  });

  it('context 배선 시 mu 는 직접 store 값 사용 — poisoned __simStore(×999) 미관측', async () => {
    installPoisonedGlobals();

    renderHook(() => useOsculatingSync(), { wrapper: makeWrapper(stubBodyState) });

    await act(async () => {
      await vi.advanceTimersByTimeAsync(1100);
    });

    // 과거 구현이면 window.__simStore 의 jupiter:999 가 mu 에 섞였을 것.
    expect(extractMock).toHaveBeenLastCalledWith(
      expect.any(Array),
      expect.any(Array),
      GRAVITATIONAL_CONSTANT * JUPITER_MASS_KG,
    );
  });
});
