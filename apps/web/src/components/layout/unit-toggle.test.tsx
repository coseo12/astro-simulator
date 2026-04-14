import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { UnitToggle } from './unit-toggle';

beforeEach(() => {
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

describe('UnitToggle', () => {
  it('3개 단위계 버튼 렌더', () => {
    render(<UnitToggle />);
    expect(screen.getByTestId('unit-si')).toBeInTheDocument();
    expect(screen.getByTestId('unit-astro')).toBeInTheDocument();
    expect(screen.getByTestId('unit-natural')).toBeInTheDocument();
  });

  it('astro가 초기 active', () => {
    render(<UnitToggle />);
    expect(screen.getByTestId('unit-astro').className).toContain('bg-primary/25');
  });

  it('SI 클릭 시 store 업데이트 + active 전환', () => {
    render(<UnitToggle />);
    fireEvent.click(screen.getByTestId('unit-si'));
    expect(useSimStore.getState().unitSystem).toBe('si');
  });

  it('Natural 클릭 시 store natural로 변경', () => {
    render(<UnitToggle />);
    fireEvent.click(screen.getByTestId('unit-natural'));
    expect(useSimStore.getState().unitSystem).toBe('natural');
  });

  it('각 버튼에 tooltip(title) 존재', () => {
    render(<UnitToggle />);
    expect(screen.getByTestId('unit-si')).toHaveAttribute('title');
    expect(screen.getByTestId('unit-astro')).toHaveAttribute('title');
    expect(screen.getByTestId('unit-natural')).toHaveAttribute('title');
  });
});
