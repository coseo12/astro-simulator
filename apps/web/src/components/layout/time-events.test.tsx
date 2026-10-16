import { act, fireEvent, render, screen, within } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import * as core from '@astro-simulator/core';
import { EVENT_FILTER_DEFAULTS } from '@/lib/event-filters';
import { getTimeEventsSnapshot, resetTimeEventsForTest } from '@/lib/time-events';
import { useSimStore } from '@/store/sim-store';
import {
  ECLIPSE_EXCLUSION_NOTE,
  EVENTS_NBODY_DISABLED_REASON,
  TimeEventTicks,
  TimeEventsButton,
} from './time-events';

/**
 * #1347 — 타임바 시간 이벤트 마커 (ADR `docs/decisions/20261016-1347-event-markers.md`).
 * M5 (선택 — 명령 순서 · 거리 자) · M6 (조작 — 필터 · 이전/다음 · listbox 키보드 · 계산 전 열기) · M7 (꺼짐 = 계산 0회 spy) ·
 * M9 (N-body 비활성 · 런타임 전환) 의 단위 부분.
 */

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

// M7 — 계산 함수 호출 횟수를 센다 (구현은 실제 함수 그대로).
vi.mock('@astro-simulator/core', async (importOriginal) => {
  const actual = await importOriginal<typeof core>();
  return { ...actual, computeEventsForKind: vi.fn(actual.computeEventsForKind) };
});
const computeSpy = vi.mocked(core.computeEventsForKind);

const CAPS = {
  starfield: true,
  surfaceDetail: true,
  belt: true,
  cometTails: true,
  corona: true,
  trails: true,
};
const J2000 = 2_451_545.0;

function renderEvents() {
  return render(
    <div>
      <div data-testid="track" style={{ position: 'relative' }}>
        <TimeEventTicks />
      </div>
      <TimeEventsButton />
      <button type="button">after</button>
    </div>,
  );
}

/** idle 청크 (jsdom 은 `requestIdleCallback` 이 없어 `setTimeout` 폴백) 를 전부 돌린다. */
async function flushChunks() {
  for (let i = 0; i < core.EVENT_KINDS.length + 1; i += 1) {
    await act(async () => {
      vi.runOnlyPendingTimers();
    });
  }
}

const trigger = () => screen.getByTestId('time-events-toggle');
const panel = () => screen.queryByTestId('time-events-panel');

beforeEach(() => {
  vi.useFakeTimers();
  resetTimeEventsForTest();
  computeSpy.mockClear();
  sentCommands = [];
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    x: 900,
    y: 760,
    left: 900,
    top: 760,
    right: 924,
    bottom: 784,
    width: 24,
    height: 24,
    toJSON: () => ({}),
  });
  Element.prototype.scrollIntoView = () => undefined;
  useSimStore.setState({
    eventsVisible: true,
    eventFilters: { ...EVENT_FILTER_DEFAULTS },
    displayCapabilities: CAPS,
    physicsEngine: 'kepler',
    julianDate: J2000,
    timeScale: 86_400,
    rulerAnchorId: null,
    selectedBodyId: null,
  });
});

afterEach(() => {
  vi.useRealTimers();
  vi.restoreAllMocks();
});

describe('M7 — 꺼짐이면 계산 0회', () => {
  it('?events=off (eventsVisible=false) — 눈금 · 버튼 없음, 계산 함수 호출 0회', async () => {
    useSimStore.setState({ eventsVisible: false });
    const { container } = renderEvents();
    await flushChunks();
    expect(computeSpy).not.toHaveBeenCalled();
    expect(screen.queryByTestId('time-events-toggle')).toBeNull();
    expect(screen.queryByTestId('time-event-ticks')).toBeNull();
    expect(getTimeEventsSnapshot().status).toBe('idle');
    // 타임바 서브트리에 새 요소가 없다 (M8 의 단위 부분).
    expect(within(container).getByTestId('track').childElementCount).toBe(0);
  });

  it('장면 준비 전 (displayCapabilities=null) 에도 계산을 시작하지 않는다 — URL 의도가 store 에 들어가기 전', async () => {
    useSimStore.setState({ displayCapabilities: null });
    renderEvents();
    await flushChunks();
    expect(computeSpy).not.toHaveBeenCalled();
  });

  it('켜짐 — 종류별 1청크씩 (호출 = 종류 수), 다시 그려도 재계산 없음 (모듈 메모)', async () => {
    const { unmount } = renderEvents();
    expect(computeSpy).not.toHaveBeenCalled(); // 동기 경로에서 돌지 않는다 — idle 로 넘긴다
    await flushChunks();
    expect(computeSpy).toHaveBeenCalledTimes(core.EVENT_KINDS.length);
    unmount();
    renderEvents();
    await flushChunks();
    expect(computeSpy).toHaveBeenCalledTimes(core.EVENT_KINDS.length);
  });
});

describe('눈금', () => {
  it('필터 기본값 — 화성 충 · 금성 내합 · 혜성 근일점만 (목성 · 토성 충 꺼짐)', async () => {
    renderEvents();
    await flushChunks();
    const kinds = new Set(screen.getAllByTestId('time-event-tick').map((t) => t.dataset.kind));
    expect(kinds).toEqual(
      new Set([
        'mars-opposition',
        'venus-inferior-conjunction',
        'halley-perihelion',
        'swift-tuttle-perihelion',
      ]),
    );
    // 94 + 125 + 1 + 1
    expect(screen.getAllByTestId('time-event-tick')).toHaveLength(221);
    expect(screen.getByTestId('time-event-ticks')).toHaveClass('pointer-events-none');
    expect(screen.getByTestId('time-event-ticks')).toHaveAttribute('aria-hidden', 'true');
  });
});

describe('사건 패널 — 조작 (M6)', () => {
  it('계산 전에 열면 「계산 중」 상태 — 빈 목록이 아니다 (§교차검증 합의 4)', async () => {
    renderEvents();
    fireEvent.click(trigger());
    expect(panel()).not.toBeNull();
    expect(screen.getByTestId('time-events-computing')).toHaveTextContent('사건 계산 중');
    expect(screen.queryByTestId('time-events-list')).toBeNull();
    await flushChunks();
    expect(screen.queryByTestId('time-events-computing')).toBeNull();
    expect(screen.getAllByTestId('time-event-option')).toHaveLength(221);
  });

  it('일 · 월식 미포함 안내 1줄 (§교차검증 합의 3)', async () => {
    renderEvents();
    fireEvent.click(trigger());
    expect(screen.getByTestId('time-events-eclipse-note')).toHaveTextContent(
      ECLIPSE_EXCLUSION_NOTE,
    );
  });

  it('필터 토글 — 목성 충 켜면 목록 · 눈금에 들어온다', async () => {
    renderEvents();
    await flushChunks();
    fireEvent.click(trigger());
    const jupiter = screen.getByTestId('time-event-filter-jupiter-opposition');
    expect(jupiter).toHaveAttribute('aria-pressed', 'false');
    fireEvent.click(jupiter);
    expect(jupiter).toHaveAttribute('aria-pressed', 'true');
    expect(screen.getAllByTestId('time-event-option')).toHaveLength(221 + 183);
    expect(screen.getAllByTestId('time-event-tick')).toHaveLength(221 + 183);
  });

  it('목성 · 토성까지 전부 켜면 목록의 모든 사건에 키보드로 도달 (↓ 반복 · End · Home)', async () => {
    useSimStore.setState({
      eventFilters: {
        'mars-opposition': true,
        'venus-inferior-conjunction': true,
        'jupiter-opposition': true,
        'saturn-opposition': true,
        'comet-perihelion': true,
      },
      julianDate: 2_415_020.5, // 1900 — 첫 사건부터
    });
    renderEvents();
    await flushChunks();
    fireEvent.click(trigger());
    const list = screen.getByTestId('time-events-list');
    const options = screen.getAllByTestId('time-event-option');
    expect(options).toHaveLength(94 + 125 + 183 + 193 + 2);
    const visited = new Set<string>();
    const activeOptionId = () => list.getAttribute('aria-activedescendant');
    visited.add(activeOptionId()!);
    for (let i = 0; i < options.length; i += 1) {
      fireEvent.keyDown(list, { key: 'ArrowDown' });
      visited.add(activeOptionId()!);
    }
    expect(visited.size).toBe(options.length);
    fireEvent.keyDown(list, { key: 'Home' });
    expect(activeOptionId()).toBe(options[0]!.id);
    fireEvent.keyDown(list, { key: 'End' });
    expect(activeOptionId()).toBe(options.at(-1)!.id);
    // 597회 키 입력 × 597행 목록 — jsdom 에서 ~11 s (로컬 실측). 실브라우저 M6 이 같은 도달을 다시 본다.
  }, 60_000);

  it('Esc — 패널 닫고 트리거로 포커스 · 기본 동작 차단 (자유시점 Esc 와 충돌 0)', async () => {
    renderEvents();
    fireEvent.click(trigger());
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(panel()).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('패널 밖 pointerdown 으로 닫힌다', () => {
    renderEvents();
    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByText('after'));
    expect(panel()).toBeNull();
  });
});

describe('선택 (M5)', () => {
  function chooseOption(id: string) {
    const option = screen.getAllByTestId('time-event-option').find((o) => o.dataset.eventId === id);
    if (!option) throw new Error(`option 없음: ${id}`);
    fireEvent.click(option);
  }

  it('화성 충 2003 — 시각 → 포커스 → 일시정지 순서 · 거리 자 기준점 = 지구 (S3 (b))', async () => {
    renderEvents();
    await flushChunks();
    fireEvent.click(trigger());
    const event = getTimeEventsSnapshot().events.find((e) =>
      e.id.startsWith('mars-opposition:2003-'),
    )!;
    chooseOption(event.id);
    expect(sentCommands).toEqual([
      { type: 'jumpToJulianDate', julianDate: event.julianDate },
      { type: 'focusOn', bodyId: 'mars' },
      { type: 'setTimeScale', scale: 0 },
    ]);
    expect(useSimStore.getState().rulerAnchorId).toBe('earth');
  });

  it('핼리 1986 — 혜성 근일점은 거리 자를 바꾸지 않는다 (S3 (a))', async () => {
    useSimStore.setState({ rulerAnchorId: 'jupiter' });
    renderEvents();
    await flushChunks();
    fireEvent.click(trigger());
    chooseOption('halley-perihelion:1986-02-17');
    const halley = getTimeEventsSnapshot().events.find(
      (e) => e.id === 'halley-perihelion:1986-02-17',
    )!;
    expect(sentCommands).toEqual([
      { type: 'jumpToJulianDate', julianDate: halley.julianDate },
      { type: 'focusOn', bodyId: 'halley' },
      { type: 'setTimeScale', scale: 0 },
    ]);
    expect(useSimStore.getState().rulerAnchorId).toBe('jupiter');
  });

  it('listbox Enter 로 활성 사건 선택', async () => {
    renderEvents();
    await flushChunks();
    fireEvent.click(trigger());
    const list = screen.getByTestId('time-events-list');
    fireEvent.keyDown(list, { key: 'Home' });
    fireEvent.keyDown(list, { key: 'Enter' });
    const first = getTimeEventsSnapshot().events.find(
      (e) => useSimStore.getState().eventFilters[core.getEventKind(e.kind).filter],
    )!;
    expect(sentCommands[0]).toEqual({ type: 'jumpToJulianDate', julianDate: first.julianDate });
  });

  it('이전 / 다음 사건 — 현재 시각 기준, 같은 사건은 건너뛴다', async () => {
    renderEvents();
    await flushChunks();
    fireEvent.click(trigger());
    fireEvent.click(screen.getByTestId('time-event-next'));
    const jumps = () =>
      sentCommands.filter(
        (c): c is Extract<CoreCommand, { type: 'jumpToJulianDate' }> =>
          c.type === 'jumpToJulianDate',
      );
    const firstNext = jumps()[0]!.julianDate;
    expect(firstNext).toBeGreaterThan(J2000);
    // 시각이 사건 시각으로 옮겨진 뒤 (core 가 timeChanged 로 store 를 갱신하는 것을 흉내) 다시 「다음」.
    act(() => useSimStore.setState({ julianDate: firstNext }));
    fireEvent.click(screen.getByTestId('time-event-next'));
    expect(jumps()[1]!.julianDate).toBeGreaterThan(firstNext);
    act(() => useSimStore.setState({ julianDate: jumps()[1]!.julianDate }));
    fireEvent.click(screen.getByTestId('time-event-prev'));
    expect(jumps()[2]!.julianDate).toBe(firstNext);
  });
});

describe('N-body 엔진 (M9 단위 부분)', () => {
  it('Newton — 눈금 0개 · 버튼 aria-disabled + 사유 · 클릭해도 열리지 않음 · 계산 0회', async () => {
    useSimStore.setState({ physicsEngine: 'newton' });
    renderEvents();
    await flushChunks();
    expect(screen.queryByTestId('time-event-ticks')).toBeNull();
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    expect(trigger()).toHaveAttribute('title', EVENTS_NBODY_DISABLED_REASON);
    expect(trigger()).toHaveAccessibleDescription(EVENTS_NBODY_DISABLED_REASON);
    fireEvent.click(trigger());
    expect(panel()).toBeNull();
    expect(computeSpy).not.toHaveBeenCalled();
  });

  it('패널을 연 채 Newton 으로 전환 → 패널 닫힘 · 눈금 숨김 → Kepler 복귀 시 눈금 복원', async () => {
    renderEvents();
    await flushChunks();
    fireEvent.click(trigger());
    expect(panel()).not.toBeNull();
    act(() => useSimStore.setState({ physicsEngine: 'newton' }));
    expect(panel()).toBeNull();
    expect(screen.queryByTestId('time-event-ticks')).toBeNull();
    expect(trigger()).toHaveAttribute('aria-disabled', 'true');
    act(() => useSimStore.setState({ physicsEngine: 'kepler' }));
    expect(screen.getAllByTestId('time-event-tick')).toHaveLength(221);
    expect(trigger()).toHaveAttribute('aria-disabled', 'false');
  });
});
