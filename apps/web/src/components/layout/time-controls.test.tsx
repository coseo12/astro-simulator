import { render, screen, fireEvent, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { J2000_JD, type CoreCommand } from '@astro-simulator/shared';
import { time as timeApi } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { TimeControls } from './time-controls';

// 외부 provider 의존성 없고, SimCommandContext만 필요 — 단순 provider mock
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
    // 최초 mount 부터 정지 상태(이전 배속 없음) — 기본 DAY_PER_SEC 86400 폴백
    expect(sentCommands).toContainEqual({
      type: 'setTimeScale',
      scale: 86_400,
    });
  });

  // #841 — pause→play 이전 배속 복원 회귀 가드. 기존 구현은 pause 시점에 store scale 이
  // 이미 0 이라 항상 DAY_PER_SEC 로 리셋됐다 (주석-구현 drift).
  it('#841 — 1y 배속에서 pause→play 시 1y 복원 (DAY_PER_SEC 리셋 회귀 가드)', () => {
    useSimStore.setState({ timeScale: 31_557_600 }); // 1y
    render(<TimeControls />);
    fireEvent.click(screen.getByTestId('time-pause'));
    expect(sentCommands).toContainEqual({ type: 'setTimeScale', scale: 0 });
    // core 가 pause 를 echo — store scale 0 반영 (실 런타임 경로 재현)
    act(() => {
      useSimStore.setState({ timeScale: 0 });
    });
    fireEvent.click(screen.getByTestId('time-play'));
    expect(sentCommands).toContainEqual({ type: 'setTimeScale', scale: 31_557_600 });
  });

  it('#841 — 역행 -1y 에서 pause→play 시 부호 포함 -1y 복원', () => {
    useSimStore.setState({ timeScale: -31_557_600 });
    render(<TimeControls />);
    fireEvent.click(screen.getByTestId('time-pause'));
    act(() => {
      useSimStore.setState({ timeScale: 0 });
    });
    fireEvent.click(screen.getByTestId('time-play'));
    expect(sentCommands).toContainEqual({ type: 'setTimeScale', scale: -31_557_600 });
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
      { type: 'setTimeScale'; scale: number } | undefined;
    expect(cmd?.scale).toBeLessThan(0);
  });

  it('UTC 문자열 렌더', () => {
    render(<TimeControls />);
    // JD 2451545.5 → 2000-01-02 00:00 (약)
    const utc = screen.getByTestId('time-utc');
    expect(utc.textContent).toMatch(/^\d{4}-\d{2}-\d{2}T/);
  });
  // #1288 D1 — 「지금」: 시점만 현재 시각으로, 배속 불변.
  describe('#1288 D1 — 지금 버튼', () => {
    const FAKE_NOW_MS = Date.UTC(2026, 9, 5, 12, 34, 56);
    beforeEach(() => {
      vi.useFakeTimers({ toFake: ['Date'] });
      vi.setSystemTime(FAKE_NOW_MS);
    });
    afterEach(() => {
      vi.useRealTimers();
    });

    it.each([
      ['재생 1d', 86_400],
      ['정지', 0],
      ['역행 -1y', -31_557_600],
    ])('%s 상태 — jumpToJulianDate(현재 JD) 1건만, setTimeScale 미발행', (_label, timeScale) => {
      useSimStore.setState({ timeScale });
      render(<TimeControls />);
      fireEvent.click(screen.getByTestId('time-now'));
      expect(sentCommands).toEqual([
        {
          type: 'jumpToJulianDate',
          julianDate: timeApi.UNIX_EPOCH_JD + FAKE_NOW_MS / timeApi.MILLIS_PER_DAY,
        },
      ]);
    });
  });

  // #1288 D2 — 100y 프리셋.
  describe('#1288 D2 — 100y 프리셋', () => {
    it('전진 상태 — setTimeScale 3_155_760_000', () => {
      render(<TimeControls />);
      fireEvent.click(screen.getByTestId('time-preset-100y'));
      expect(sentCommands).toEqual([{ type: 'setTimeScale', scale: 3_155_760_000 }]);
    });

    it('역행 상태 — 음수 부호 유지', () => {
      useSimStore.setState({ timeScale: -86_400 });
      render(<TimeControls />);
      fireEvent.click(screen.getByTestId('time-preset-100y'));
      expect(sentCommands).toEqual([{ type: 'setTimeScale', scale: -3_155_760_000 }]);
    });

    it.each([3_155_760_000, -3_155_760_000])('scale=%d — 100y 만 활성 스타일', (timeScale) => {
      useSimStore.setState({ timeScale });
      render(<TimeControls />);
      expect(screen.getByTestId('time-preset-100y').className).toContain('bg-primary/20');
      expect(screen.getByTestId('time-preset-10y').className).not.toContain('bg-primary/20');
    });
  });

  // #1288 D3 — bench·verify 스크립트가 의존하는 testid 보존.
  it.each([
    [86_400, 'time-pause'],
    [0, 'time-play'],
  ])('#1288 D3 — scale=%d 에서 기존 testid 전부 존재 (재생 토글=%s)', (timeScale, toggleId) => {
    useSimStore.setState({ timeScale });
    render(<TimeControls />);
    for (const id of [
      'time-preset-1s',
      'time-preset-1h',
      'time-preset-1d',
      'time-preset-1M',
      'time-preset-1y',
      'time-preset-10y',
      toggleId,
      'time-reverse',
      'time-forward',
      'time-utc',
    ]) {
      expect(screen.getByTestId(id)).toBeInTheDocument();
    }
  });

  // #1288 D4 — 극단 시각에서도 렌더 예외 0 + 정의된 형식 (형식 자체는 `sim-time-format.test.ts`).
  it.each([
    [
      '연도 10000',
      timeApi.dateToJulianDate(new Date(new Date(0).setUTCFullYear(10_000, 0, 1) + 30_500)),
      '+010000-01-01T00:00:30Z',
    ],
    [
      'J2000 + 300,000년',
      J2000_JD + 300_000 * 365.25,
      `JD ${(J2000_JD + 300_000 * 365.25).toFixed(1)}`,
    ],
    [
      'J2000 − 300,000년',
      J2000_JD - 300_000 * 365.25,
      `JD ${(J2000_JD - 300_000 * 365.25).toFixed(1)}`,
    ],
  ])('#1288 D4 — %s 렌더 예외 0', (_label, julianDate, expected) => {
    useSimStore.setState({ julianDate });
    expect(() => render(<TimeControls />)).not.toThrow();
    expect(screen.getByTestId('time-utc').textContent).toBe(expected);
  });
});
