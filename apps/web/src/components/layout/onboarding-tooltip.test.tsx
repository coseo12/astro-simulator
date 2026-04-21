import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { OnboardingTooltip } from './onboarding-tooltip';

const STORAGE_KEY = 'astro:onboarding-dismissed';

beforeEach(() => {
  window.localStorage.clear();
  useSimStore.setState({ viewMode: 'educational' });
});

describe('OnboardingTooltip (P10-C-2 #278)', () => {
  it('dismiss 기록 없음 + educational — 툴팁 노출', () => {
    render(<OnboardingTooltip />);
    expect(screen.getByTestId('onboarding-tooltip')).toBeInTheDocument();
  });

  it('dismiss 기록 있음 — 툴팁 숨김', () => {
    window.localStorage.setItem(STORAGE_KEY, '1');
    render(<OnboardingTooltip />);
    expect(screen.queryByTestId('onboarding-tooltip')).toBeNull();
  });

  it('scientific 으로 진입한 경우 — 온보딩 생략', () => {
    useSimStore.setState({ viewMode: 'scientific' });
    render(<OnboardingTooltip />);
    expect(screen.queryByTestId('onboarding-tooltip')).toBeNull();
  });

  it('닫기 버튼 → dismiss + 툴팁 제거 + localStorage 기록', () => {
    render(<OnboardingTooltip />);
    fireEvent.click(screen.getByTestId('onboarding-dismiss'));
    expect(screen.queryByTestId('onboarding-tooltip')).toBeNull();
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
  });

  it('실제 비율로 보기 → viewMode=scientific + dismiss', () => {
    render(<OnboardingTooltip />);
    fireEvent.click(screen.getByTestId('onboarding-view-scientific'));
    expect(useSimStore.getState().viewMode).toBe('scientific');
    expect(window.localStorage.getItem(STORAGE_KEY)).toBe('1');
    expect(screen.queryByTestId('onboarding-tooltip')).toBeNull();
  });
});
