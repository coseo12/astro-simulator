import { render, screen, act, fireEvent } from '@testing-library/react';
import { describe, expect, it, beforeEach, afterEach, vi } from 'vitest';
import { SatelliteZoomTooltip, __isSatelliteParentBody } from './satellite-zoom-tooltip';
import { useSimStore } from '@/store/sim-store';

/**
 * #534 — Satellite zoom tooltip 단위 테스트.
 *
 * DoD 매트릭스:
 *   D1: earth focus 진입 후 1.5초 → tooltip 표시
 *   D2: 텍스트 "확대하여 달의 위치를 확인하세요"
 *   D3: localStorage 키 `r4.satellite-zoom-tooltip-shown.earth` 박제
 *   D4: X 버튼 + auto fade-out 5초
 *   D6: mercury / venus / sun focus 시 미표시
 *   D8: mars / jupiter 도 satellite-parent — 일반화 정합 + per-body 박제
 *
 * ## React useEffect + fake timers 결합 가드
 *
 *   `useSimStore.setState` 와 `vi.advanceTimersByTime` 을 같은 act 블록에 넣으면 setState 가
 *   trigger 한 useEffect 가 microtask 단계에서 setTimeout 을 등록하기 전에 timer 가 advance 됨.
 *   따라서 **setState act → 별도 advance act** 로 분리 의무. helper `focusBody` 로 캡슐화.
 */

/** setState commit + useEffect flush + timer advance 분리 — React + fake timer 정합 */
function focusBody(bodyId: string | null, advanceMs = 0): void {
  act(() => {
    useSimStore.setState({ selectedBodyId: bodyId });
  });
  if (advanceMs > 0) {
    act(() => {
      vi.advanceTimersByTime(advanceMs);
    });
  }
}

describe('SatelliteZoomTooltip (#534)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    // store 초기화 — selectedBodyId=null
    useSimStore.setState({ selectedBodyId: null, freeFlyMode: false });
  });

  afterEach(() => {
    // pending timer 정리 후 real timer 복귀
    act(() => {
      vi.runOnlyPendingTimers();
    });
    vi.useRealTimers();
  });

  describe('__isSatelliteParentBody — Q5 일반화 (architect 결정 1)', () => {
    it('earth (moon parent) → true', () => {
      expect(__isSatelliteParentBody('earth')).toBe(true);
    });

    it('mars (phobos/deimos parent) → true', () => {
      expect(__isSatelliteParentBody('mars')).toBe(true);
    });

    it('jupiter (galilean parent) → true', () => {
      expect(__isSatelliteParentBody('jupiter')).toBe(true);
    });

    it('sun (planet parent — non-satellite) → false', () => {
      expect(__isSatelliteParentBody('sun')).toBe(false);
    });

    it('mercury (no children) → false', () => {
      expect(__isSatelliteParentBody('mercury')).toBe(false);
    });

    it('venus (no children) → false', () => {
      expect(__isSatelliteParentBody('venus')).toBe(false);
    });

    it('null → false', () => {
      expect(__isSatelliteParentBody(null)).toBe(false);
    });
  });

  describe('D1 — earth focus 진입 후 1.5초 delay 후 표시', () => {
    it('초기 마운트 + selectedBodyId=null → tooltip 미표시', () => {
      render(<SatelliteZoomTooltip />);
      expect(screen.queryByTestId('satellite-zoom-tooltip')).toBeNull();
    });

    it('earth focus 진입 직후 → 미표시 (delay 진행 중)', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('earth', 1000); // 1.5초 미만
      expect(screen.queryByTestId('satellite-zoom-tooltip')).toBeNull();
    });

    it('earth focus + 1.5초 경과 → tooltip 표시', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('earth', 1500);
      expect(screen.getByTestId('satellite-zoom-tooltip')).toBeInTheDocument();
    });

    it('delay 중 focus 이탈 → tooltip 미표시 + localStorage 박제 안 됨 (architect 위험 2)', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('earth', 500);
      // focus 이탈
      focusBody(null, 2000);
      expect(screen.queryByTestId('satellite-zoom-tooltip')).toBeNull();
      // 영구 학습 기회 박탈 회피 — localStorage 박제 안 됨
      expect(window.localStorage.getItem('r4.satellite-zoom-tooltip-shown.earth')).toBeNull();
    });
  });

  describe('D2 — 텍스트 정확성', () => {
    it('earth focus → "확대하여 달의 위치를 확인하세요"', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('earth', 1500);
      expect(screen.getByTestId('satellite-zoom-tooltip')).toHaveTextContent(
        '확대하여 달의 위치를 확인하세요',
      );
    });

    it('mars focus → "확대하여 포보스·데이모스의 위치를 확인하세요"', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('mars', 1500);
      expect(screen.getByTestId('satellite-zoom-tooltip')).toHaveTextContent(
        '확대하여 포보스·데이모스의 위치를 확인하세요',
      );
    });

    it('jupiter focus → "확대하여 갈릴레이 위성의 위치를 확인하세요"', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('jupiter', 1500);
      expect(screen.getByTestId('satellite-zoom-tooltip')).toHaveTextContent(
        '확대하여 갈릴레이 위성의 위치를 확인하세요',
      );
    });
  });

  describe('D3 — localStorage per-body 키 박제', () => {
    it('earth focus + 1.5초 → `r4.satellite-zoom-tooltip-shown.earth` 박제', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('earth', 1500);
      expect(window.localStorage.getItem('r4.satellite-zoom-tooltip-shown.earth')).toBe('1');
    });

    it('박제 후 동일 body 재진입 → tooltip 미표시 (per-body 1회)', () => {
      window.localStorage.setItem('r4.satellite-zoom-tooltip-shown.earth', '1');
      render(<SatelliteZoomTooltip />);
      focusBody('earth', 2000);
      expect(screen.queryByTestId('satellite-zoom-tooltip')).toBeNull();
    });

    it('earth 박제 후 mars 진입 → mars tooltip 표시 (per-body 분리 SSoT)', () => {
      window.localStorage.setItem('r4.satellite-zoom-tooltip-shown.earth', '1');
      render(<SatelliteZoomTooltip />);
      focusBody('mars', 1500);
      expect(screen.getByTestId('satellite-zoom-tooltip')).toBeInTheDocument();
      expect(window.localStorage.getItem('r4.satellite-zoom-tooltip-shown.mars')).toBe('1');
    });
  });

  describe('D4 — 닫기 메커니즘 (X 버튼 + 5초 auto fade-out)', () => {
    it('X 버튼 클릭 → fade-out 시작 후 200ms 뒤 미표시', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('earth', 1500);
      expect(screen.getByTestId('satellite-zoom-tooltip')).toBeInTheDocument();

      act(() => {
        fireEvent.click(screen.getByTestId('satellite-zoom-tooltip-close'));
      });
      // fade-out 시작 시점 — data-fading-out=true
      expect(screen.getByTestId('satellite-zoom-tooltip')).toHaveAttribute(
        'data-fading-out',
        'true',
      );

      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.queryByTestId('satellite-zoom-tooltip')).toBeNull();
    });

    it('표시 후 5초 경과 → 자동 fade-out 시작 → 200ms 후 미표시', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('earth', 1500);
      expect(screen.getByTestId('satellite-zoom-tooltip')).toBeInTheDocument();

      // 5초 경과 — auto fade-out 시작
      act(() => {
        vi.advanceTimersByTime(5000);
      });
      expect(screen.getByTestId('satellite-zoom-tooltip')).toHaveAttribute(
        'data-fading-out',
        'true',
      );

      // +200ms — 완전 제거
      act(() => {
        vi.advanceTimersByTime(200);
      });
      expect(screen.queryByTestId('satellite-zoom-tooltip')).toBeNull();
    });
  });

  describe('D6 — non-satellite-parent body focus 시 미표시', () => {
    it('sun focus → tooltip 미표시', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('sun', 3000);
      expect(screen.queryByTestId('satellite-zoom-tooltip')).toBeNull();
    });

    it('mercury focus → tooltip 미표시', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('mercury', 3000);
      expect(screen.queryByTestId('satellite-zoom-tooltip')).toBeNull();
    });

    it('venus focus → tooltip 미표시', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('venus', 3000);
      expect(screen.queryByTestId('satellite-zoom-tooltip')).toBeNull();
    });
  });

  describe('D8 — R5+ satellite-parent body 자동 활성 (일반화 SSoT)', () => {
    it('mars focus → tooltip 표시 + mars 키 박제 (R5 자동 활성)', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('mars', 1500);
      expect(screen.getByTestId('satellite-zoom-tooltip')).toBeInTheDocument();
      expect(screen.getByTestId('satellite-zoom-tooltip')).toHaveAttribute('data-body-id', 'mars');
      expect(window.localStorage.getItem('r4.satellite-zoom-tooltip-shown.mars')).toBe('1');
    });

    it('jupiter focus → tooltip 표시 + jupiter 키 박제 (R6 자동 활성)', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('jupiter', 1500);
      expect(screen.getByTestId('satellite-zoom-tooltip')).toBeInTheDocument();
      expect(window.localStorage.getItem('r4.satellite-zoom-tooltip-shown.jupiter')).toBe('1');
    });
  });

  describe('접근성 — role / aria-live / aria-label', () => {
    it('tooltip 표시 시 role="status" + aria-live="polite"', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('earth', 1500);
      const tooltip = screen.getByTestId('satellite-zoom-tooltip');
      expect(tooltip).toHaveAttribute('role', 'status');
      expect(tooltip).toHaveAttribute('aria-live', 'polite');
    });

    it('닫기 버튼 — aria-label="안내 닫기"', () => {
      render(<SatelliteZoomTooltip />);
      focusBody('earth', 1500);
      expect(screen.getByTestId('satellite-zoom-tooltip-close')).toHaveAttribute(
        'aria-label',
        '안내 닫기',
      );
    });
  });
});
