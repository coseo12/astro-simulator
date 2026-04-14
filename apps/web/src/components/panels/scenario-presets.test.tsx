import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { ScenarioPresets } from './scenario-presets';

let sent: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => sent.push(cmd),
}));

beforeEach(() => {
  sent = [];
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'research',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    unitSystem: 'astro',
    physicsEngine: 'kepler',
    massMultipliers: { earth: 2 },
    pingCount: 0,
    lastPingAt: null,
  });
});

describe('ScenarioPresets', () => {
  it('3개 프리셋 + 원복 버튼 렌더', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-jupiter-x10')).toBeInTheDocument();
    expect(screen.getByTestId('preset-no-jupiter')).toBeInTheDocument();
    expect(screen.getByTestId('preset-sun-half')).toBeInTheDocument();
    expect(screen.getByTestId('scenario-reset')).toBeInTheDocument();
  });

  it('목성 10× 적용 — 엔진 Newton + 질량 10 + 시간 J2000 리셋', () => {
    render(<ScenarioPresets />);
    fireEvent.click(screen.getByTestId('preset-jupiter-x10'));
    const s = useSimStore.getState();
    expect(s.physicsEngine).toBe('newton');
    expect(s.massMultipliers).toEqual({ jupiter: 10 });
    expect(sent).toContainEqual({ type: 'jumpToJulianDate', julianDate: 2_451_545.0 });
  });

  it('원복 — Kepler + 질량 초기화 + 시간 J2000', () => {
    render(<ScenarioPresets />);
    fireEvent.click(screen.getByTestId('scenario-reset'));
    const s = useSimStore.getState();
    expect(s.physicsEngine).toBe('kepler');
    expect(s.massMultipliers).toEqual({});
    expect(sent).toContainEqual({ type: 'jumpToJulianDate', julianDate: 2_451_545.0 });
  });
});
