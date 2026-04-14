import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { TimeControls } from './time-controls';

// next-intl 의존성 없고, SimCommandContext만 필요 — 단순 provider mock
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
    julianDate: 2_451_545.5,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    unitSystem: 'astro',
    pingCount: 0,
    lastPingAt: null,
  });
});

describe('TimeControls', () => {
  it('정지 아닌 상태 — pause 버튼 렌더', () => {
    render(<TimeControls />);
    expect(screen.getByTestId('time-pause')).toBeInTheDocument();
  });

  it('pause 클릭 시 setTimeScale 0 명령 발행', () => {
    render(<TimeControls />);
    fireEvent.click(screen.getByTestId('time-pause'));
    expect(sentCommands).toContainEqual({ type: 'setTimeScale', scale: 0 });
  });

  it('scale=0일 때 play 버튼 렌더 + 클릭 시 이전 배율 복원', () => {
    useSimStore.setState({ timeScale: 0 });
    render(<TimeControls />);
    fireEvent.click(screen.getByTestId('time-play'));
    // scale 0에서 play — 기본 DAY_PER_SEC 86400으로 복원
    expect(sentCommands).toContainEqual({
      type: 'setTimeScale',
      scale: 86_400,
    });
  });

  it('1y 프리셋 클릭 시 YEAR_PER_SEC 명령', () => {
    render(<TimeControls />);
    fireEvent.click(screen.getByTestId('time-preset-1y'));
    expect(sentCommands).toContainEqual({
      type: 'setTimeScale',
      scale: 31_557_600,
    });
  });

  it('역행 버튼 → 음수 배율', () => {
    render(<TimeControls />);
    fireEvent.click(screen.getByTestId('time-reverse'));
    const cmd = sentCommands.find((c) => c.type === 'setTimeScale') as
      | { type: 'setTimeScale'; scale: number }
      | undefined;
    expect(cmd?.scale).toBeLessThan(0);
  });

  it('UTC 문자열 렌더', () => {
    render(<TimeControls />);
    // JD 2451545.5 → 2000-01-02 00:00 (약)
    const utc = screen.getByTestId('time-utc');
    expect(utc.textContent).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
});
