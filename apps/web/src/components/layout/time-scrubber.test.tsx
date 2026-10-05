import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { J2000_JD, type CoreCommand } from '@astro-simulator/shared';
import { time as timeApi } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { SCRUBBER_MAX_JD, SCRUBBER_MIN_JD } from '@/lib/time-scrubber';
import { OUT_OF_RANGE_BADGE_TEXT, TimeScrubber } from './time-scrubber';

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

/** jsdom 은 레이아웃이 없다 — 슬라이더 폭을 연도와 1:1(200px = 200년)로 고정해 포인터 좌표 = 연도 오프셋. */
const TRACK_WIDTH_PX = 200;

function isoToJd(iso: string): number {
  return timeApi.isoToJulianDate(iso);
}

function lastJump(): number | undefined {
  const jumps = sentCommands.filter(
    (c): c is Extract<CoreCommand, { type: 'jumpToJulianDate' }> => c.type === 'jumpToJulianDate',
  );
  return jumps.at(-1)?.julianDate;
}

function thumb(): HTMLElement {
  return screen.getByTestId('time-scrubber-thumb');
}

function setStoreJd(julianDate: number | null): void {
  act(() => {
    useSimStore.setState({ julianDate });
  });
}

beforeEach(() => {
  sentCommands = [];
  useSimStore.setState({ julianDate: J2000_JD, timeScale: 86_400 });
  // Radix 슬라이더는 포인터 캡처와 요소 크기에 의존한다 — jsdom 미구현분만 채운다.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 0,
    y: 0,
    left: 0,
    top: 0,
    right: TRACK_WIDTH_PX,
    bottom: 24,
    width: TRACK_WIDTH_PX,
    height: 24,
    toJSON: () => ({}),
  });
  const captured = new Set<number>();
  Element.prototype.setPointerCapture = (id: number) => void captured.add(id);
  Element.prototype.releasePointerCapture = (id: number) => void captured.delete(id);
  Element.prototype.hasPointerCapture = (id: number) => captured.has(id);
});

afterEach(() => {
  vi.restoreAllMocks();
});

describe('#1288 TimeScrubber', () => {
  it('D7 — 썸이 시뮬레이션 시각을 따른다 (양자화 0.25년)', () => {
    render(<TimeScrubber />);
    expect(thumb()).toHaveAttribute('aria-valuenow', '2000');
    setStoreJd(isoToJd('2050-07-02T12:00:00Z'));
    expect(thumb()).toHaveAttribute('aria-valuenow', '2050.5');
    expect(thumb()).toHaveAttribute('aria-valuetext', '2050년');
  });

  it('D7·D8 — 범위 밖이면 썸은 끝에 고정되고 배지가 보인다, 안으로 돌아오면 사라진다', () => {
    render(<TimeScrubber />);
    expect(screen.queryByTestId('time-scrubber-out-of-range')).toBeNull();

    setStoreJd(SCRUBBER_MAX_JD + 1);
    expect(thumb()).toHaveAttribute('aria-valuenow', '2100');
    expect(screen.getByTestId('time-scrubber-out-of-range')).toHaveTextContent(
      OUT_OF_RANGE_BADGE_TEXT,
    );

    setStoreJd(SCRUBBER_MIN_JD - 1);
    expect(thumb()).toHaveAttribute('aria-valuenow', '1900');
    expect(screen.getByTestId('time-scrubber-out-of-range')).toBeInTheDocument();

    // 경계 자체는 범위 안 — 같은 상수
    setStoreJd(SCRUBBER_MIN_JD);
    expect(screen.queryByTestId('time-scrubber-out-of-range')).toBeNull();
    setStoreJd(SCRUBBER_MAX_JD);
    expect(screen.queryByTestId('time-scrubber-out-of-range')).toBeNull();
  });

  it('D6 키보드 — →/← 1년, PageUp 10년, Home/End 끝 (Radix 기본) → jumpToJulianDate', () => {
    render(<TimeScrubber />);
    act(() => thumb().focus());

    fireEvent.keyDown(thumb(), { key: 'ArrowRight' });
    expect(lastJump()).toBe(isoToJd('2001-01-01T00:00:00Z'));

    // 점프는 core 가 timeChanged 로 store 에 되돌려 준다 — 실 런타임 경로 재현
    setStoreJd(lastJump() as number);
    fireEvent.keyDown(thumb(), { key: 'ArrowLeft' });
    expect(lastJump()).toBe(isoToJd('2000-01-01T00:00:00Z'));

    setStoreJd(lastJump() as number);
    fireEvent.keyDown(thumb(), { key: 'PageUp' });
    expect(lastJump()).toBe(isoToJd('2010-01-01T00:00:00Z'));

    fireEvent.keyDown(thumb(), { key: 'End' });
    expect(lastJump()).toBe(SCRUBBER_MAX_JD);
    fireEvent.keyDown(thumb(), { key: 'Home' });
    expect(lastJump()).toBe(SCRUBBER_MIN_JD);

    // 스크러버는 배속을 건드리지 않는다
    expect(sentCommands.some((c) => c.type === 'setTimeScale')).toBe(false);
  });

  it('D6 드래그 — 포인터 위치의 연도로 점프', () => {
    render(<TimeScrubber />);
    const slider = screen.getByTestId('time-scrubber-slider');
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 150, button: 0 });
    expect(lastJump()).toBe(isoToJd('2050-01-01T00:00:00Z'));
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 26 });
    expect(lastJump()).toBe(isoToJd('1926-01-01T00:00:00Z'));
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 26 });
  });

  it('D7 — 드래그 중에는 재생(store 갱신)이 썸을 덮어쓰지 않고, 놓으면 다시 따른다', () => {
    render(<TimeScrubber />);
    const slider = screen.getByTestId('time-scrubber-slider');
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 150, button: 0 });
    expect(thumb()).toHaveAttribute('aria-valuenow', '2050');

    // 재생이 진행돼 시각이 바뀐다 (점프 결과 + 경과)
    setStoreJd(isoToJd('2060-07-02T12:00:00Z'));
    expect(thumb()).toHaveAttribute('aria-valuenow', '2050');

    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 150 });
    expect(thumb()).toHaveAttribute('aria-valuenow', '2060.5');
  });

  it('D7 — 갔다가 제자리로 돌아온 드래그도 놓으면 추종을 재개한다 (Radix commit 미발행 경로)', () => {
    render(<TimeScrubber />);
    const slider = screen.getByTestId('time-scrubber-slider');
    setStoreJd(isoToJd('2050-01-01T00:00:00Z'));
    fireEvent.pointerDown(slider, { pointerId: 1, clientX: 150, button: 0 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 100 });
    fireEvent.pointerMove(slider, { pointerId: 1, clientX: 150 });
    fireEvent.pointerUp(slider, { pointerId: 1, clientX: 150 });

    setStoreJd(isoToJd('2070-07-02T12:00:00Z'));
    expect(thumb()).toHaveAttribute('aria-valuenow', '2070.5');
  });

  it('시각이 아직 없으면 비활성 (J2000 자리)', () => {
    useSimStore.setState({ julianDate: null });
    render(<TimeScrubber />);
    expect(screen.getByTestId('time-scrubber-slider')).toHaveAttribute('data-disabled');
    expect(thumb()).toHaveAttribute('aria-valuenow', '2000');
  });
});
