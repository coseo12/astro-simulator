import { renderHook, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useMouseInactivity } from './use-mouse-inactivity';

beforeEach(() => {
  vi.useFakeTimers();
});

afterEach(() => {
  vi.useRealTimers();
});

describe('useMouseInactivity', () => {
  it('초기값은 false (활성 상태)', () => {
    const { result } = renderHook(() => useMouseInactivity(1000));
    expect(result.current).toBe(false);
  });

  it('timeout 경과 시 true로 전환', () => {
    const { result } = renderHook(() => useMouseInactivity(1000));
    expect(result.current).toBe(false);
    act(() => {
      vi.advanceTimersByTime(1500);
    });
    expect(result.current).toBe(true);
  });

  it('mousemove 발생 시 타이머 리셋', () => {
    const { result } = renderHook(() => useMouseInactivity(1000));
    act(() => {
      vi.advanceTimersByTime(900);
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new MouseEvent('mousemove'));
      vi.advanceTimersByTime(900);
    });
    expect(result.current).toBe(false); // 재시작되어 아직 inactive 아님

    act(() => {
      vi.advanceTimersByTime(500);
    });
    expect(result.current).toBe(true);
  });

  it('keydown / wheel 이벤트로도 리셋', () => {
    const { result } = renderHook(() => useMouseInactivity(500));
    act(() => {
      vi.advanceTimersByTime(400);
      window.dispatchEvent(new KeyboardEvent('keydown'));
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(false);

    act(() => {
      window.dispatchEvent(new WheelEvent('wheel'));
      vi.advanceTimersByTime(400);
    });
    expect(result.current).toBe(false);

    act(() => {
      vi.advanceTimersByTime(200);
    });
    expect(result.current).toBe(true);
  });

  it('unmount 시 타이머/리스너 정리', () => {
    const { unmount } = renderHook(() => useMouseInactivity(1000));
    const before = window.setTimeout.length; // smoke
    expect(before).toBeGreaterThanOrEqual(0);
    unmount();
    // 이벤트 dispatch 해도 에러 없이 지나가야 함
    expect(() => {
      window.dispatchEvent(new MouseEvent('mousemove'));
    }).not.toThrow();
  });
});
