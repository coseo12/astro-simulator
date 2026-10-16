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
  listboxNextIndex,
} from './time-events';

/**
 * #1347 — 타임바 시간 이벤트 마커 (ADR `docs/decisions/20261016-1347-event-markers.md`).
 * M5 (선택 — 명령 순서 · 거리 자) · M6 (조작 — 필터 · 이전/다음 · listbox 키보드 · 계산 전 열기) · M7 (꺼짐 = 계산 0회 spy) ·
 * M9 (N-body 비활성 · 런타임 전환) 의 단위 부분.
 */

let sentCommands: CoreCommand[] = [];
// 안정 참조 — 실제 앱의 `useSimCommand` 는 `useMemo` 된 api 의 `command` 라 렌더마다 같은 함수다 (`sim-context.tsx`).
// 렌더마다 새 함수를 주면 패널의 `select` (`useCallback` 의존) 가 매번 바뀌어 `memo` 된 목록 행 전부가 다시 그려진다.
const sendCommandMock = (cmd: CoreCommand) => {
  sentCommands.push(cmd);
};
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => sendCommandMock,
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

  /**
   * 「모든 사건에 키보드로 도달」 을 귀납으로 본다 — ↓ 597회 전수 대신.
   *
   * 전수판은 CI 에서 `45.8` s · `20` s 타임아웃 (PR #1351 qa B2, 로컬 `4.4 ~ 4.7` s) 이었다. 키 1회마다 597행 목록을 다시
   * 그리므로 비용이 키 수에 비례한다. 판별력은 아래 세 단언의 합으로 지킨다:
   *   (a) 목록 길이 = 전 종류 사건 수 (필터에서 빠진 종류가 없다)
   *   (b) Home = 첫 항목 · End = 마지막 항목, 양 끝에서 더 누르면 제자리 (clamp)
   *   (c) ↓ 한 번 = 정확히 다음 항목 · ↑ 한 번 = 정확히 이전 항목 — 앞 구간 · 가운데 · 뒤 구간 표본에서. 앞 구간 (1900~)
   *       은 네 종류가 섞여 종류 경계 (인접 항목의 종류가 다름) 를 여러 번 지난다.
   * (d) 키 → 위치 규칙 자체 (`listboxNextIndex`) 는 597 전 위치에서 ↓↑ 를 단언한다 (아래 별도 테스트 — 렌더 없이 싸다).
   * (d) 가 규칙이 위치와 무관함을, (c) 가 컴포넌트가 그 규칙을 그대로 쓰는지 (종류 경계 포함) 를 보므로 Home 에서 ↓ 를 반복하면
   * 모든 항목에 닿는다. 실브라우저 M6 은 ↓ 596회 전수 도달을 따로 확인했다.
   */
  it('목성 · 토성까지 전부 켜면 목록의 모든 사건에 키보드로 도달 (길이 · Home/End · ↓↑ 한 칸 규칙)', async () => {
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
    // (a)
    expect(options).toHaveLength(94 + 125 + 183 + 193 + 2);
    const activeIndex = () =>
      options.findIndex((o) => o.id === list.getAttribute('aria-activedescendant'));
    const press = (key: string) => fireEvent.keyDown(list, { key });
    const SAMPLE_STEPS = 12;

    // (b) 양 끝 + clamp
    press('Home');
    expect(activeIndex()).toBe(0);
    press('ArrowUp');
    expect(activeIndex()).toBe(0);
    press('End');
    expect(activeIndex()).toBe(options.length - 1);
    press('ArrowDown');
    expect(activeIndex()).toBe(options.length - 1);

    // (c) 한 칸 규칙 — 앞 구간 (종류 경계 다수)
    press('Home');
    const kinds = new Set<string>();
    for (let i = 1; i <= SAMPLE_STEPS; i += 1) {
      press('ArrowDown');
      expect(activeIndex()).toBe(i);
      kinds.add(options[i]!.dataset.eventId!.split(':')[0]!);
    }
    expect(kinds.size).toBeGreaterThanOrEqual(3); // 표본이 실제로 종류 경계를 지났다
    // 가운데 — 클릭으로 활성 항목을 옮긴 뒤 ↓ · ↑
    const mid = Math.floor(options.length / 2);
    fireEvent.click(options[mid]!);
    expect(activeIndex()).toBe(mid);
    for (let i = 1; i <= SAMPLE_STEPS; i += 1) {
      press('ArrowDown');
      expect(activeIndex()).toBe(mid + i);
    }
    for (let i = SAMPLE_STEPS - 1; i >= 0; i -= 1) {
      press('ArrowUp');
      expect(activeIndex()).toBe(mid + i);
    }
    // 뒤 구간 — End 에서 ↑
    press('End');
    for (let i = 1; i <= SAMPLE_STEPS; i += 1) {
      press('ArrowUp');
      expect(activeIndex()).toBe(options.length - 1 - i);
    }
    // 로컬 실측 `0.57 ~ 0.60` s (3회). 직전 CI 는 로컬의 약 10배 (전수판 로컬 `4.4 ~ 4.7` s ↔ CI `45.8` s) 라 기본 5 s 를
    // 넘을 수 있어 20 s 로 둔다.
  }, 20_000);

  it('(d) listboxNextIndex — 전 위치 (597) 에서 ↓ 는 다음 · ↑ 는 이전 · 양 끝 제자리 · Home/End · 그 외 키 null', () => {
    const n = 94 + 125 + 183 + 193 + 2;
    for (let i = 0; i < n; i += 1) {
      expect(listboxNextIndex('ArrowDown', i, n)).toBe(Math.min(n - 1, i + 1));
      expect(listboxNextIndex('ArrowUp', i, n)).toBe(Math.max(0, i - 1));
      expect(listboxNextIndex('Home', i, n)).toBe(0);
      expect(listboxNextIndex('End', i, n)).toBe(n - 1);
      expect(listboxNextIndex('a', i, n)).toBeNull();
    }
    // Home 에서 ↓ 를 반복하면 전 항목을 한 번씩 지나 끝에 닿는다.
    const seen = new Set<number>([0]);
    for (let i = 0, cur = 0; i < n; i += 1)
      seen.add((cur = listboxNextIndex('ArrowDown', cur, n)!));
    expect(seen.size).toBe(n);
    expect(listboxNextIndex('ArrowDown', 0, 0)).toBeNull();
  });

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
    // 전환으로 닫힌 패널은 Kepler 로 돌아와도 닫혀 있다 — 열림 의도가 남아 있으면 복귀 순간 저절로 다시 열린다.
    expect(panel()).toBeNull();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
  });
});
