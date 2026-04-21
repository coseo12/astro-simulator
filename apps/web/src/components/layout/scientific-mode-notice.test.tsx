import { render, screen, fireEvent } from '@testing-library/react';
import { act } from 'react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { ScientificModeNotice } from './scientific-mode-notice';

const STORAGE_KEY = 'astro:scientific-notice-dismissed';

beforeEach(() => {
  window.localStorage.clear();
  useSimStore.setState({ viewMode: 'educational' });
});

describe('ScientificModeNotice (P10-C-2 #278)', () => {
  it('viewMode=educational — 배너 숨김', () => {
    render(<ScientificModeNotice />);
    expect(screen.queryByTestId('scientific-mode-notice')).toBeNull();
  });

  it('viewMode=scientific + dismiss 기록 없음 — 배너 노출', () => {
    useSimStore.setState({ viewMode: 'scientific' });
    render(<ScientificModeNotice />);
    expect(screen.getByTestId('scientific-mode-notice')).toBeInTheDocument();
  });

  it('viewMode=scientific + dismiss 기록 있음 — 배너 숨김', () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    useSimStore.setState({ viewMode: 'scientific' });
    render(<ScientificModeNotice />);
    expect(screen.queryByTestId('scientific-mode-notice')).toBeNull();
  });

  it('dismiss 버튼 → 배너 제거 + localStorage 기록', () => {
    useSimStore.setState({ viewMode: 'scientific' });
    render(<ScientificModeNotice />);
    fireEvent.click(screen.getByTestId('scientific-mode-notice-dismiss'));
    expect(screen.queryByTestId('scientific-mode-notice')).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('scientific ↔ educational 토글 — educational 시 숨김, scientific 재진입 시 dismiss 유지', () => {
    useSimStore.setState({ viewMode: 'scientific' });
    const { rerender } = render(<ScientificModeNotice />);
    fireEvent.click(screen.getByTestId('scientific-mode-notice-dismiss'));

    // educational 복귀
    act(() => useSimStore.setState({ viewMode: 'educational' }));
    rerender(<ScientificModeNotice />);
    expect(screen.queryByTestId('scientific-mode-notice')).toBeNull();

    // scientific 재진입 — 이미 dismiss 했으므로 여전히 숨김
    act(() => useSimStore.setState({ viewMode: 'scientific' }));
    rerender(<ScientificModeNotice />);
    expect(screen.queryByTestId('scientific-mode-notice')).toBeNull();
  });
});
