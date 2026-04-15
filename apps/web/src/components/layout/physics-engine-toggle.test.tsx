import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { PhysicsEngineToggle } from './physics-engine-toggle';

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
    physicsEngine: 'kepler',
    pingCount: 0,
    lastPingAt: null,
  });
});

describe('PhysicsEngineToggle', () => {
  it('초기에 Kepler 활성', () => {
    render(<PhysicsEngineToggle />);
    expect(screen.getByTestId('engine-kepler').dataset.active).toBe('true');
    expect(screen.getByTestId('engine-newton').dataset.active).toBe('false');
  });

  it('Newton 클릭 시 store 반영 + active 전환', () => {
    render(<PhysicsEngineToggle />);
    fireEvent.click(screen.getByTestId('engine-newton'));
    expect(useSimStore.getState().physicsEngine).toBe('newton');
    expect(screen.getByTestId('engine-newton').dataset.active).toBe('true');
    expect(screen.getByTestId('engine-kepler').dataset.active).toBe('false');
  });

  it('두 버튼 모두 title(툴팁) 보유', () => {
    render(<PhysicsEngineToggle />);
    expect(screen.getByTestId('engine-kepler')).toHaveAttribute('title');
    expect(screen.getByTestId('engine-newton')).toHaveAttribute('title');
  });

  // P3-A #134 — webgpu만 disabled, barnes-hut/auto는 활성화
  it('webgpu 버튼만 disabled (P3-B 대기)', () => {
    render(<PhysicsEngineToggle />);
    for (const id of ['kepler', 'newton', 'barnes-hut', 'auto']) {
      const btn = screen.getByTestId(`engine-${id}`);
      expect(btn).not.toBeDisabled();
      expect(btn.dataset.runnable).toBe('true');
    }
    const webgpu = screen.getByTestId('engine-webgpu');
    expect(webgpu).toBeDisabled();
    expect(webgpu.dataset.runnable).toBe('false');
  });

  it('disabled 엔진(webgpu) 클릭은 store에 반영되지 않음', () => {
    render(<PhysicsEngineToggle />);
    fireEvent.click(screen.getByTestId('engine-webgpu'));
    expect(useSimStore.getState().physicsEngine).toBe('kepler');
  });

  it('barnes-hut 클릭 시 store 반영', () => {
    render(<PhysicsEngineToggle />);
    fireEvent.click(screen.getByTestId('engine-barnes-hut'));
    expect(useSimStore.getState().physicsEngine).toBe('barnes-hut');
  });
});
