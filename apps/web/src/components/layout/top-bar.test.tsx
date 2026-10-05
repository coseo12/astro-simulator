import { act, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { TopBar } from './top-bar';

/**
 * #1265 D4 — 표시 패널이 열린 동안 관찰 모드 자동 숨김(3초)이 상단 바를 지우지 않는다.
 * 양성 대조: 패널이 닫혀 있으면 같은 조건에서 숨는다 (억제 술어가 공허 참이 아님을 같은 파일에서 고정).
 */

const INACTIVITY_WAIT_MS = 4000;

beforeEach(() => {
  vi.useFakeTimers();
  useSimStore.setState({ mode: 'observe', displayPanelOpen: false, bodyMenuOpen: false });
});
afterEach(() => {
  vi.useRealTimers();
});

const opacity = () => screen.getByTestId('topbar').style.opacity;

describe('TopBar — 자동 숨김', () => {
  it('관찰 모드 · 패널 닫힘 · 4초 무입력 → opacity 0 (양성 대조)', () => {
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('0');
  });

  it('관찰 모드 · 패널 열림 · 4초 무입력 → opacity 1 (D4)', () => {
    useSimStore.setState({ displayPanelOpen: true });
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('1');
  });

  it('패널을 닫으면 비활성 상태가 다시 숨김으로 이어진다', () => {
    useSimStore.setState({ displayPanelOpen: true });
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    act(() => useSimStore.setState({ displayPanelOpen: false }));
    expect(opacity()).toBe('0');
  });

  it('#1281 D7 — 천체 메뉴 열림 · 4초 무입력 → opacity 1, 닫으면 다시 숨김', () => {
    useSimStore.setState({ bodyMenuOpen: true });
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('1');
    act(() => useSimStore.setState({ bodyMenuOpen: false }));
    expect(opacity()).toBe('0');
  });

  it('#1281 D7 — 숨은 뒤 터치(pointerdown) → 즉시 opacity 1', () => {
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('0');
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(opacity()).toBe('1');
  });

  it('research 모드는 패널과 무관하게 숨기지 않는다 (기존 동작 보존)', () => {
    useSimStore.setState({ mode: 'research' });
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('1');
  });
});
