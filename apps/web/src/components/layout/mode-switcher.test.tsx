import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { ModeSwitcher } from './mode-switcher';

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

beforeEach(() => {
  sentCommands = [];
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'observe',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    unitSystem: 'astro',
    pingCount: 0,
    lastPingAt: null,
  });
});

describe('ModeSwitcher', () => {
  it('4개 모드 버튼 렌더', () => {
    render(<ModeSwitcher />);
    expect(screen.getByTestId('mode-observe')).toBeInTheDocument();
    expect(screen.getByTestId('mode-research')).toBeInTheDocument();
    expect(screen.getByTestId('mode-education')).toBeInTheDocument();
    expect(screen.getByTestId('mode-sandbox')).toBeInTheDocument();
  });

  it('observe가 초기 active 상태', () => {
    render(<ModeSwitcher />);
    expect(screen.getByTestId('mode-observe')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('mode-research')).toHaveAttribute('data-active', 'false');
  });

  it('research 클릭 시 store 모드 갱신 + setMode 명령', () => {
    render(<ModeSwitcher />);
    fireEvent.click(screen.getByTestId('mode-research'));
    expect(useSimStore.getState().mode).toBe('research');
    expect(sentCommands).toContainEqual({ type: 'setMode', mode: 'research' });
  });

  it('education 모드는 disabled 상태', () => {
    render(<ModeSwitcher />);
    const btn = screen.getByTestId('mode-education') as HTMLButtonElement;
    expect(btn).toBeDisabled();
    // P2+ 툴팁 존재
    expect(btn).toHaveAttribute('title');
  });

  it('disabled 모드 클릭은 setMode 명령 발행 안 함', () => {
    render(<ModeSwitcher />);
    fireEvent.click(screen.getByTestId('mode-sandbox'));
    expect(sentCommands).not.toContainEqual(
      expect.objectContaining({ type: 'setMode', mode: 'sandbox' }),
    );
  });

  it('모드 변경 시 html[data-mode] 속성 동기화', () => {
    render(<ModeSwitcher />);
    fireEvent.click(screen.getByTestId('mode-research'));
    expect(document.documentElement.getAttribute('data-mode')).toBe('research');
  });
});
