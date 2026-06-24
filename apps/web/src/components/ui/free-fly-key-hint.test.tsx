import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { FreeFlyKeyHint } from './free-fly-key-hint';
import { useSimStore } from '@/store/sim-store';
import { FREE_FLY_HINT_STORAGE_KEY } from '@/lib/onboarding-storage';

/**
 * #737 — FreeFlyKeyHint 단위 테스트.
 *
 * DoD:
 *   - free-fly 진입(false→true) → toast 표시 + localStorage 글로벌 박제
 *   - 이미 박제된 경우 진입해도 미표시 (글로벌 1회)
 *   - X 버튼 / 5초 auto fade-out 닫힘
 *   - 터치 기기(pointer:coarse / maxTouchPoints>0) → 렌더 차단
 *   - non-touch 기본 환경 보장 (matchMedia/maxTouchPoints stub)
 */

/** matchMedia stub — 기본 non-touch (pointer:coarse=false). */
function stubMatchMedia(coarse: boolean): void {
  window.matchMedia = vi.fn().mockImplementation((query: string) => ({
    matches: query.includes('coarse') ? coarse : false,
    media: query,
    onchange: null,
    addEventListener: vi.fn(),
    removeEventListener: vi.fn(),
    addListener: vi.fn(),
    removeListener: vi.fn(),
    dispatchEvent: vi.fn(),
  }));
}

function setMaxTouchPoints(n: number): void {
  Object.defineProperty(navigator, 'maxTouchPoints', { value: n, configurable: true });
}

/** free-fly 진입 (false→true 전이) act 블록. */
function enterFreeFly(): void {
  act(() => {
    useSimStore.setState({ freeFlyMode: true, selectedBodyId: null });
  });
}

describe('FreeFlyKeyHint (#737)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    useSimStore.setState({ freeFlyMode: false, selectedBodyId: null });
    stubMatchMedia(false); // 기본 non-touch
    setMaxTouchPoints(0);
  });

  afterEach(() => {
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  describe('free-fly 진입 표시 (글로벌 1회)', () => {
    it('초기(freeFlyMode=false) → 미표시', () => {
      render(<FreeFlyKeyHint />);
      expect(screen.queryByTestId('free-fly-key-hint')).toBeNull();
    });

    it('free-fly 진입(false→true) → toast 표시 + localStorage 박제', () => {
      render(<FreeFlyKeyHint />);
      enterFreeFly();
      expect(screen.getByTestId('free-fly-key-hint')).toBeInTheDocument();
      expect(window.localStorage.getItem(FREE_FLY_HINT_STORAGE_KEY)).toBe('1');
    });

    it('이미 박제된 경우 → 진입해도 미표시 (글로벌 1회)', () => {
      window.localStorage.setItem(FREE_FLY_HINT_STORAGE_KEY, '1');
      render(<FreeFlyKeyHint />);
      enterFreeFly();
      expect(screen.queryByTestId('free-fly-key-hint')).toBeNull();
    });

    it('toast 닫힌 후 재진입 → 미표시 (이미 박제됨)', () => {
      render(<FreeFlyKeyHint />);
      enterFreeFly();
      expect(screen.getByTestId('free-fly-key-hint')).toBeInTheDocument();
      // 닫기
      act(() => {
        fireEvent.click(screen.getByTestId('free-fly-key-hint-close'));
      });
      act(() => {
        vi.advanceTimersByTime(200);
      });
      // free-fly 이탈 후 재진입
      act(() => {
        useSimStore.setState({ freeFlyMode: false });
      });
      enterFreeFly();
      expect(screen.queryByTestId('free-fly-key-hint')).toBeNull();
    });
  });

  describe('콘텐츠 — WASD/QE/우클릭 실측 바인딩', () => {
    it('toast 에 W/A/S/D · Q/E · 우클릭 드래그 노출', () => {
      render(<FreeFlyKeyHint />);
      enterFreeFly();
      const hint = screen.getByTestId('free-fly-key-hint');
      expect(hint).toHaveTextContent('W/A/S/D');
      expect(hint).toHaveTextContent('Q/E');
      expect(hint).toHaveTextContent('우클릭 드래그');
    });
  });

  describe('닫기 메커니즘 (X 버튼 + 5초 auto fade-out)', () => {
    it('X 버튼 → fade-out 후 200ms 뒤 미표시', () => {
      render(<FreeFlyKeyHint />);
      enterFreeFly();
      act(() => {
        fireEvent.click(screen.getByTestId('free-fly-key-hint-close'));
      });
      expect(screen.getByTestId('free-fly-key-hint')).toHaveAttribute('data-fading-out', 'true');
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.queryByTestId('free-fly-key-hint')).toBeNull();
    });

    it('5초 경과 → auto fade-out → +200ms 미표시', () => {
      render(<FreeFlyKeyHint />);
      enterFreeFly();
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('free-fly-key-hint')).toHaveAttribute('data-fading-out', 'true');
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.queryByTestId('free-fly-key-hint')).toBeNull();
    });
  });

  describe('터치 기기 렌더 차단', () => {
    it('pointer:coarse → free-fly 진입해도 미표시', () => {
      stubMatchMedia(true);
      render(<FreeFlyKeyHint />);
      enterFreeFly();
      expect(screen.queryByTestId('free-fly-key-hint')).toBeNull();
      // 박제도 안 됨 (터치는 키 안내 무의미 → 후일 데스크톱 전환 시 표시 기회 보존)
      expect(window.localStorage.getItem(FREE_FLY_HINT_STORAGE_KEY)).toBeNull();
    });

    it('maxTouchPoints>0 → 미표시', () => {
      setMaxTouchPoints(5);
      render(<FreeFlyKeyHint />);
      enterFreeFly();
      expect(screen.queryByTestId('free-fly-key-hint')).toBeNull();
    });
  });

  describe('접근성 — role / aria-live', () => {
    it('role="status" + aria-live="polite"', () => {
      render(<FreeFlyKeyHint />);
      enterFreeFly();
      const hint = screen.getByTestId('free-fly-key-hint');
      expect(hint).toHaveAttribute('role', 'status');
      expect(hint).toHaveAttribute('aria-live', 'polite');
    });
  });
});
