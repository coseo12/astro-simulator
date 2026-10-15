import { act, renderHook } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ephemeris } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import type { BodyStateFn } from '@/core/sim-context';
import { computeBodyPairDistance, indexBodies } from '@/lib/body-distance';
import { DISTANCE_REFRESH_MS } from './use-body-distances';
import { useRulerDistance } from './use-ruler-distance';

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
const byId = indexBodies(ephemeris.getSolarSystem().bodies);

beforeEach(() => {
  engineMock.newtonActive = false;
  vi.useFakeTimers();
  useSimStore.setState({ julianDate: J2000 });
});
afterEach(() => {
  vi.useRealTimers();
});

describe('#1341 useRulerDistance — 4 Hz 폴링 · 쌍 판정 (결정 R3)', () => {
  it('값 = computeBodyPairDistance · 시각 변경은 DISTANCE_REFRESH_MS 후 반영', () => {
    const { result } = renderHook(() => useRulerDistance('earth', 'mars'));
    expect(result.current).toBe(computeBodyPairDistance(byId, 'earth', 'mars', J2000));
    const before = result.current;
    act(() => {
      useSimStore.setState({ julianDate: J2000 + 30 });
    });
    act(() => {
      vi.advanceTimersByTime(DISTANCE_REFRESH_MS - 1);
    });
    expect(result.current).toBe(before);
    act(() => {
      vi.advanceTimersByTime(1);
    });
    expect(result.current).toBe(computeBodyPairDistance(byId, 'earth', 'mars', J2000 + 30));
  });

  it('A · B 중 하나가 null 이거나 같으면 null', () => {
    for (const [a, b] of [
      [null, 'mars'],
      ['earth', null],
      ['earth', 'earth'],
    ] as const) {
      const { result } = renderHook(() => useRulerDistance(a, b));
      expect(result.current, `${a}-${b}`).toBeNull();
    }
  });

  it('쌍이 바뀌면 tick 없이 즉시 · 엔진 상태값은 다음 tick 에 반영', () => {
    const { result, rerender } = renderHook(({ b }) => useRulerDistance('earth', b), {
      initialProps: { b: 'mars' as string | null },
    });
    rerender({ b: 'moon' });
    expect(result.current).toBe(computeBodyPairDistance(byId, 'earth', 'moon', J2000));
    engineMock.newtonActive = true;
    act(() => {
      vi.advanceTimersByTime(DISTANCE_REFRESH_MS);
    });
    expect(result.current).toBe(ENGINE_MOON_FROM_EARTH_M);
  });
});
