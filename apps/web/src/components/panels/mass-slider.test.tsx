import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { MassSlider } from './mass-slider';

beforeEach(() => {
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'research',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    unitSystem: 'astro',
    physicsEngine: 'newton',
    massMultipliers: {},
    pingCount: 0,
    lastPingAt: null,
  });
});

describe('MassSlider', () => {
  it('선택 없음 — 안내 메시지', () => {
    render(<MassSlider />);
    expect(screen.getByTestId('mass-slider-empty')).toBeInTheDocument();
  });

  it('선택 있음 — 슬라이더 렌더 + 초기값 1.0', () => {
    useSimStore.setState({ selectedBodyId: 'jupiter' });
    render(<MassSlider />);
    const input = screen.getByTestId('mass-slider-input') as HTMLInputElement;
    expect(input.value).toBe('1');
  });

  it('슬라이더 변경 → store 반영', () => {
    useSimStore.setState({ selectedBodyId: 'jupiter' });
    render(<MassSlider />);
    fireEvent.change(screen.getByTestId('mass-slider-input'), { target: { value: '5' } });
    expect(useSimStore.getState().massMultipliers).toEqual({ jupiter: 5 });
  });

  it('프리셋 버튼 10× 클릭', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<MassSlider />);
    fireEvent.click(screen.getByTestId('mass-preset-10'));
    expect(useSimStore.getState().massMultipliers).toEqual({ earth: 10 });
  });

  it('리셋 버튼 — 전체 클리어', () => {
    useSimStore.setState({
      selectedBodyId: 'earth',
      massMultipliers: { earth: 2, jupiter: 5 },
    });
    render(<MassSlider />);
    fireEvent.click(screen.getByTestId('mass-reset'));
    expect(useSimStore.getState().massMultipliers).toEqual({});
  });

  it('Kepler 모드 — 입력 disabled + 힌트', () => {
    useSimStore.setState({ selectedBodyId: 'earth', physicsEngine: 'kepler' });
    render(<MassSlider />);
    const input = screen.getByTestId('mass-slider-input') as HTMLInputElement;
    expect(input.disabled).toBe(true);
  });
});
