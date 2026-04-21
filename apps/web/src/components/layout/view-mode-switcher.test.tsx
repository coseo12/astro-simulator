import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { ViewModeSwitcher } from './view-mode-switcher';

beforeEach(() => {
  useSimStore.setState({
    viewMode: 'educational',
  });
  document.documentElement.removeAttribute('data-view-mode');
});

describe('ViewModeSwitcher (P10-C #278)', () => {
  it('2개 뷰 모드 버튼 렌더', () => {
    render(<ViewModeSwitcher />);
    expect(screen.getByTestId('view-mode-educational')).toBeInTheDocument();
    expect(screen.getByTestId('view-mode-scientific')).toBeInTheDocument();
  });

  it('educational 이 초기 active 상태', () => {
    render(<ViewModeSwitcher />);
    expect(screen.getByTestId('view-mode-educational')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('view-mode-scientific')).toHaveAttribute('data-active', 'false');
  });

  it('scientific 클릭 시 store viewMode 갱신', () => {
    render(<ViewModeSwitcher />);
    fireEvent.click(screen.getByTestId('view-mode-scientific'));
    expect(useSimStore.getState().viewMode).toBe('scientific');
  });

  it('뷰 모드 변경 시 html[data-view-mode] 속성 동기화', () => {
    render(<ViewModeSwitcher />);
    fireEvent.click(screen.getByTestId('view-mode-scientific'));
    expect(document.documentElement.getAttribute('data-view-mode')).toBe('scientific');
    fireEvent.click(screen.getByTestId('view-mode-educational'));
    expect(document.documentElement.getAttribute('data-view-mode')).toBe('educational');
  });

  it('키보드 m 키로 educational ↔ scientific 토글', () => {
    render(<ViewModeSwitcher />);
    fireEvent.keyDown(window, { key: 'm' });
    expect(useSimStore.getState().viewMode).toBe('scientific');
    fireEvent.keyDown(window, { key: 'm' });
    expect(useSimStore.getState().viewMode).toBe('educational');
  });

  it('input 포커스 중 m 키 입력은 무시 (사용자 타이핑 방해 방지)', () => {
    render(
      <>
        <input data-testid="text-input" />
        <ViewModeSwitcher />
      </>,
    );
    const input = screen.getByTestId('text-input') as HTMLInputElement;
    input.focus();
    fireEvent.keyDown(input, { key: 'm' });
    expect(useSimStore.getState().viewMode).toBe('educational');
  });

  it('modifier 키와 함께 입력된 m 키는 무시 (cmd+m 등)', () => {
    render(<ViewModeSwitcher />);
    fireEvent.keyDown(window, { key: 'm', metaKey: true });
    expect(useSimStore.getState().viewMode).toBe('educational');
  });

  it('aria-checked 가 active 상태와 일치', () => {
    render(<ViewModeSwitcher />);
    expect(screen.getByTestId('view-mode-educational')).toHaveAttribute('aria-checked', 'true');
    expect(screen.getByTestId('view-mode-scientific')).toHaveAttribute('aria-checked', 'false');
    fireEvent.click(screen.getByTestId('view-mode-scientific'));
    expect(screen.getByTestId('view-mode-educational')).toHaveAttribute('aria-checked', 'false');
    expect(screen.getByTestId('view-mode-scientific')).toHaveAttribute('aria-checked', 'true');
  });
});
