import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { DateTimePicker } from './date-time-picker';

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

beforeEach(() => {
  sentCommands = [];
});

describe('DateTimePicker', () => {
  it('datetime 입력 + 점프 버튼 렌더', () => {
    render(<DateTimePicker />);
    expect(screen.getByTestId('datetime-input')).toBeInTheDocument();
    expect(screen.getByTestId('datetime-jump')).toBeInTheDocument();
  });

  it('입력 전에는 점프 버튼 disabled', () => {
    render(<DateTimePicker />);
    expect(screen.getByTestId('datetime-jump')).toBeDisabled();
  });

  it('유효 날짜 입력 후 점프 → jumpToDate 명령', () => {
    render(<DateTimePicker />);
    const input = screen.getByTestId('datetime-input');
    fireEvent.change(input, { target: { value: '2026-04-14T00:00' } });
    fireEvent.click(screen.getByTestId('datetime-jump'));
    const cmd = sentCommands.find((c) => c.type === 'jumpToDate');
    expect(cmd).toBeDefined();
    // datetime-local은 로컬 타임존으로 파싱되므로 정확한 문자열 대신 ISO 형식만 검증
    const iso = (cmd as { isoUtc: string }).isoUtc;
    expect(iso).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/);
    // 2026-04-14 (KST) = 2026-04-13 15:00 (UTC) 또는 2026-04-14 00:00 (UTC)
    expect(iso).toMatch(/^2026-04-1[34]T/);
  });
});
