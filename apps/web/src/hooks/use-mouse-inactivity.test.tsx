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
    // #849 — 구 단언 `window.setTimeout.length ≥ 0` 은 항진 명제 (Function.length 는 항상 ≥ 0).
    // fake timer 카운트 비교로 실제 정리 여부를 검증한다.
    const { unmount } = renderHook(() => useMouseInactivity(1000));
    expect(vi.getTimerCount()).toBeGreaterThan(0); // mount 직후 inactivity 타이머 활성

    unmount();
    expect(vi.getTimerCount()).toBe(0); // cleanup 이 타이머 해제

    // 리스너도 해제 — dispatch 가 새 타이머를 재스케줄하지 않아야 함
    window.dispatchEvent(new MouseEvent('mousemove'));
    expect(vi.getTimerCount()).toBe(0);
  });
});
