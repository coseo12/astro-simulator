import { render, screen, fireEvent } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
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

  // #1288 D5 — 입력은 UTC 로 해석한다 (라벨과 일치). 종전에는 로컬 시간대 해석이라 두 결과를 모두 허용했다.
  // 시간대 2종에서 정확값을 단언하고, 같은 입력의 로컬 해석이 실제로 갈리는지를 양성 대조로 함께 본다.
  describe('#1288 D5 — UTC 해석', () => {
    const originalTz = process.env.TZ;
    afterEach(() => {
      process.env.TZ = originalTz;
    });

    it.each(['Asia/Seoul', 'America/Los_Angeles'])(
      'TZ=%s — 2026-04-14T00:00 → 정확히 UTC 자정',
      (tz) => {
        process.env.TZ = tz;
        expect(new Date('2026-04-14T00:00').toISOString()).not.toBe('2026-04-14T00:00:00.000Z');
        render(<DateTimePicker />);
        fireEvent.change(screen.getByTestId('datetime-input'), {
          target: { value: '2026-04-14T00:00' },
        });
        fireEvent.click(screen.getByTestId('datetime-jump'));
        expect(sentCommands).toEqual([{ type: 'jumpToDate', isoUtc: '2026-04-14T00:00:00.000Z' }]);
      },
    );
  });

  it('JS Date 범위 밖 입력 — 명령 미발행 + 오류 표시', () => {
    render(<DateTimePicker />);
    fireEvent.change(screen.getByTestId('datetime-input'), {
      target: { value: '300000-01-01T00:00' },
    });
    fireEvent.click(screen.getByTestId('datetime-jump'));
    expect(sentCommands).toEqual([]);
    expect(screen.getByText('잘못된 날짜')).toBeInTheDocument();
  });
});
