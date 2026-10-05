import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ephemeris } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import type { BodyStateFn } from '@/core/sim-context';
import { computeBodyDistances, indexBodies } from '@/lib/body-distance';
import { DISTANCE_REFRESH_MS, useBodyDistances } from './use-body-distances';

// 엔진 상태값 주입 — scene 의 getBodyState 는 엔진 전환에도 같은 함수 참조라, 동작만 바꾼다.
const engineMock = vi.hoisted(() => ({ newtonActive: false }));
const ENGINE_MOON_FROM_EARTH_M = 354_781_000;
const fakeGetBodyState: BodyStateFn = (id, parentId) => {
  if (!engineMock.newtonActive) return null;
  if (id === 'moon' && parentId === 'earth') {
    return { pos: [ENGINE_MOON_FROM_EARTH_M, 0, 0], vel: [0, 0, 0] };
  }
  return null;
};
vi.mock('@/core/sim-context', () => ({ useSimBodyState: () => fakeGetBodyState }));

const J2000 = ephemeris.J2000_JD;
const FIVE_YEARS_DAYS = 5 * 365.25;

beforeEach(() => {
  engineMock.newtonActive = false;
  vi.useFakeTimers();
  useSimStore.setState({ julianDate: J2000 });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('#1281 useBodyDistances — 4Hz 폴링 (D2)', () => {
  it('julianDate 변경은 DISTANCE_REFRESH_MS 후 반영되고, 그 전에는 이전 값 유지', () => {
    const { result } = renderHook(() => useBodyDistances('halley'));
    const before = result.current!.fromSunM;
    expect(before).not.toBeNull();

    act(() => {
      useSimStore.setState({ julianDate: J2000 + FIVE_YEARS_DAYS });
    });
    act(() => {
      vi.advanceTimersByTime(DISTANCE_REFRESH_MS - 1);
    });
    expect(result.current!.fromSunM).toBe(before);

    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current!.fromSunM).not.toBe(before);
  });

  it('대상이 바뀌면 tick 을 기다리지 않고 현재 시각으로 계산 (직전 대상의 시각 재사용 금지)', () => {
    const { result, rerender } = renderHook(({ id }) => useBodyDistances(id), {
      initialProps: { id: 'earth' as string | null },
    });
    act(() => {
      useSimStore.setState({ julianDate: J2000 + FIVE_YEARS_DAYS });
    });
    rerender({ id: 'halley' });
    const expected = computeBodyDistances(
      indexBodies(ephemeris.getSolarSystem().bodies),
      'halley',
      J2000 + FIVE_YEARS_DAYS,
    );
    expect(result.current).toEqual(expected);
  });

  it('엔진 전환(Kepler → Newton)은 시각이 멈춰 있어도 다음 tick 에 반영된다', () => {
    const { result } = renderHook(() => useBodyDistances('moon'));
    const kepler = result.current!.fromParentM;
    expect(kepler).not.toBe(ENGINE_MOON_FROM_EARTH_M);

    engineMock.newtonActive = true;
    act(() => {
      vi.advanceTimersByTime(DISTANCE_REFRESH_MS);
    });
    expect(result.current!.fromParentM).toBe(ENGINE_MOON_FROM_EARTH_M);
  });

  it('bodyId null 이면 null + 폴링 없음', () => {
    const { result } = renderHook(() => useBodyDistances(null));
    expect(result.current).toBeNull();
    expect(vi.getTimerCount()).toBe(0);
  });

  it('julianDate 가 아직 없으면 null', () => {
    useSimStore.setState({ julianDate: null });
    const { result } = renderHook(() => useBodyDistances('earth'));
    expect(result.current).toBeNull();
  });

  it('언마운트 시 interval 정리', () => {
    const { unmount } = renderHook(() => useBodyDistances('earth'));
    expect(vi.getTimerCount()).toBe(1);
    unmount();
    expect(vi.getTimerCount()).toBe(0);
  });
});
