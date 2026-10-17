'use client';

import {
  EVENT_KIND_TOLERANCE_DAYS,
  eventLabelKo,
  getEventKind,
  getOrbitVisualScale,
  type AstroEvent,
  type EventFilterId,
  type EventKindId,
} from '@astro-simulator/core';
import { CalendarClock, ChevronLeft, ChevronRight } from 'lucide-react';
import {
  memo,
  useCallback,
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  useSyncExternalStore,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { useSimCommand } from '@/core/sim-context';
import { getFocusableElements, nextFocusableAfter } from '@/lib/focus-trap';
import {
  adjacentEvent,
  getServerTimeEventsSnapshot,
  getTimeEventsSnapshot,
  requestTimeEvents,
  subscribeTimeEvents,
  type TimeEventsSnapshot,
} from '@/lib/time-events';
import { julianDateToYearValue, yearValueToTrackPercent } from '@/lib/time-scrubber';
import { useSimStore } from '@/store/sim-store';

/**
 * #1347 — 타임바 시간 이벤트 마커 (ADR `docs/decisions/20261016-1347-event-markers.md`).
 *
 * - **눈금** (`TimeEventTicks`) — 스크러버 트랙 안 `pointer-events-none` 1px 선 (결정 D4). 누를 대상이 아니다 — 데스크톱 24px hit
 *   target 이 9.9년이라 사건 하나하나를 누를 수 없다 (ADR 1-D). 드래그 · 키보드 계약은 그대로 Radix 슬라이더가 받는다.
 * - **사건 패널** (`TimeEventsButton`) — 스크러버 행 오른쪽 끝 24px 버튼 → 비모달 패널 (`display-panel.tsx` 패턴): 종류 필터 ·
 *   이전/다음 사건 · 목록 (listbox — ↑↓ · Home/End · Enter) · 종류별 오차 배지. 일 · 월식 미포함 안내 (§교차검증 합의 3) 는
 *   #1354 가 식을 넣으며 지웠고 (결정 E7), 식 필터가 켜져 있으면 그 자리에 위성 배율 고지 1줄을 둔다 (결정 E5 · 축 S (a)).
 * - **선택** (결정 D6 · 사용자 결정 S3 (b)) — `jumpToJulianDate(t*)` → `focusOn(주체)` → `setTimeScale(0)`, 충 · 내합 · 식 (주체 =
 *   달 — #1354 사용자 결정 S (a)) 은 거리 자 기준점을 지구로 (`?ruler=earth` 는 `UrlSync` 가 store 에서 쓴다). 순서가 계약이다 — core 는 `jumpToJulianDate` 에서 `timeChanged`
 *   를 동기 발화해 장면 위치를 `t*` 로 옮긴 **뒤** `focusOn` 이 카메라를 잡는다 (§교차검증 합의 1).
 * - **꺼짐** (`?events=off`) — 둘 다 아무것도 그리지 않고 계산도 시작하지 않는다 (결정 D3 · DoD M8).
 * - **N-body 엔진** — 눈금 숨김 · 버튼 `aria-disabled` + 사유, 열린 패널은 닫는다. Kepler 로 돌아오면 다시 보인다 (결정 D8).
 */

/** 종류별 눈금 · 필터 점 색 (디자인 토큰). `Record<EventKindId, …>` — 종류 표에 행을 더하면 타입 검사가 누락을 잡는다. */
const KIND_COLOR_CLASS: Readonly<Record<EventKindId, string>> = {
  'mars-opposition': 'bg-star-m',
  'venus-inferior-conjunction': 'bg-star-g',
  'jupiter-opposition': 'bg-star-k',
  'saturn-opposition': 'bg-star-a',
  'halley-perihelion': 'bg-nebula-teal',
  'swift-tuttle-perihelion': 'bg-nebula-teal',
  'solar-eclipse': 'bg-star-o',
  'lunar-eclipse': 'bg-nebula-violet',
};

/** 필터 칩 라벨 · 순서 (결정 D7). */
const FILTER_LABELS: ReadonlyArray<{ id: EventFilterId; label: string; kind: EventKindId }> = [
  { id: 'mars-opposition', label: '화성 충', kind: 'mars-opposition' },
  { id: 'venus-inferior-conjunction', label: '금성 내합', kind: 'venus-inferior-conjunction' },
  { id: 'comet-perihelion', label: '혜성 근일점', kind: 'halley-perihelion' },
  { id: 'jupiter-opposition', label: '목성 충', kind: 'jupiter-opposition' },
  { id: 'saturn-opposition', label: '토성 충', kind: 'saturn-opposition' },
  { id: 'solar-eclipse', label: '일식', kind: 'solar-eclipse' },
  { id: 'lunar-eclipse', label: '월식', kind: 'lunar-eclipse' },
];

/** N-body 비활성 사유 (결정 D8). 버튼 `title` 과 `aria-describedby` 가 같은 문자열을 쓴다. */
export const EVENTS_NBODY_DISABLED_REASON =
  'Kepler 해석해 기준 사건입니다 — 현재 엔진에서는 천체 위치가 달라 사용할 수 없습니다';

/** 식 필터 (켜져 있으면 배율 고지를 보인다 — 결정 E5). */
const ECLIPSE_FILTER_IDS: readonly EventFilterId[] = ['solar-eclipse', 'lunar-eclipse'];

/**
 * 식 사건 배율 고지 (#1354 결정 E5 · 사용자 결정 X (a)). 장면의 달은 지구로부터 ×N 거리에 그려지지만 지구 → 달 **방향**은
 * 물리값 그대로라 (ADR 축 S) 식 순간의 정렬은 화면에서도 맞고, 거리 · 크기 비만 다르다. N 은 장면과 같은 SSoT
 * `getOrbitVisualScale('earth', 'moon')` — 리터럴로 쓰지 않는다 (1341 R6).
 */
export function eclipseScaleNotice(): string {
  return `식 — 화면의 달은 지구로부터 실제 거리의 ×${getOrbitVisualScale('earth', 'moon')} 에 그려집니다. 정렬 방향은 실제와 같고, 거리 자 수치는 실제 거리입니다.`;
}

/** 트리거 위 패널 간격 (px). */
const PANEL_GAP_PX = 4;
/** 패널이 뷰포트 가장자리에 붙지 않게 두는 최소 여백 (px) — `display-panel.tsx` 와 같은 값. */
const VIEWPORT_MARGIN_PX = 8;
/** 패널 폭 (px). 375 에서도 양쪽 여백 8px 안에 든다 (375 − 16 = 359). */
const PANEL_WIDTH_PX = 296;

interface PanelPosition {
  bottom: number;
  right: number;
  maxHeight: number;
}

/** 트리거 위로 우측 정렬 + 뷰포트 안쪽 clamp — 타임바가 화면 맨 아래라 패널은 위로 연다. */
function resolvePanelPosition(trigger: HTMLElement): PanelPosition {
  const rect = trigger.getBoundingClientRect();
  const maxRight = window.innerWidth - PANEL_WIDTH_PX - VIEWPORT_MARGIN_PX;
  return {
    bottom: window.innerHeight - rect.top + PANEL_GAP_PX,
    right: Math.max(VIEWPORT_MARGIN_PX, Math.min(window.innerWidth - rect.right, maxRight)),
    maxHeight: Math.max(0, rect.top - PANEL_GAP_PX - VIEWPORT_MARGIN_PX),
  };
}

/**
 * listbox 이동 키 → 다음 활성 위치. 이동 키가 아니면 `null`. ↑↓ 는 한 칸 · 양 끝에서 제자리, Home / End 는 끝.
 * 순수 함수로 둔 이유: 「모든 사건에 키보드로 도달」 을 전 위치에 대해 싸게 단언하기 위해서다 (`time-events.test.tsx`).
 */
export function listboxNextIndex(key: string, current: number, length: number): number | null {
  if (length <= 0) return null;
  if (key === 'ArrowDown') return Math.min(length - 1, current + 1);
  if (key === 'ArrowUp') return Math.max(0, current - 1);
  if (key === 'Home') return 0;
  if (key === 'End') return length - 1;
  return null;
}

/** `YYYY-MM-DD` (UTC) — 사건 id 의 날짜부와 같다 (core `eventDateIso`). 시:분은 표시하지 않는다 (결정 D5). */
function eventDate(event: AstroEvent): string {
  return event.id.slice(event.id.indexOf(':') + 1);
}

function formatTolerance(kind: EventKindId): string {
  return `±${EVENT_KIND_TOLERANCE_DAYS[kind]}일`;
}

/** 표시 게이트 — 의도 ∧ 장면 준비 (`?events=off` 로드에서는 store 가 먼저 `false` 가 된 뒤 가용성이 열린다). */
function useTimeEventsGate(): { shown: boolean; kepler: boolean } {
  const visible = useSimStore((s) => s.eventsVisible);
  const ready = useSimStore((s) => s.displayCapabilities !== null);
  const kepler = useSimStore((s) => s.physicsEngine === 'kepler');
  return { shown: visible && ready, kepler };
}

/** 사건 목록 구독 + (켜져 있고 Kepler 면) 지연 계산 시작. 꺼져 있으면 `requestTimeEvents` 를 부르지 않는다 (M7). */
function useTimeEvents(active: boolean): TimeEventsSnapshot {
  useEffect(() => {
    if (active) requestTimeEvents();
  }, [active]);
  return useSyncExternalStore(
    subscribeTimeEvents,
    getTimeEventsSnapshot,
    getServerTimeEventsSnapshot,
  );
}

function useFilteredEvents(events: readonly AstroEvent[]): AstroEvent[] {
  const filters = useSimStore((s) => s.eventFilters);
  return useMemo(
    () => events.filter((e) => filters[getEventKind(e.kind).filter]),
    [events, filters],
  );
}

/** 스크러버 트랙 안 사건 눈금. `Slider.Track` 의 자식으로 둔다 (연도 눈금과 같은 `inset-x-1.5` 배치). */
export function TimeEventTicks() {
  const { shown, kepler } = useTimeEventsGate();
  const active = shown && kepler;
  const { events } = useTimeEvents(active);
  const filtered = useFilteredEvents(events);
  if (!active || filtered.length === 0) return null;
  return (
    <span
      className="pointer-events-none absolute inset-y-0 inset-x-1.5"
      aria-hidden="true"
      data-testid="time-event-ticks"
    >
      {filtered.map((e) => {
        const year = julianDateToYearValue(e.julianDate);
        if (year === null) return null;
        const comet = getEventKind(e.kind).computation.type === 'perihelion';
        return (
          <span
            key={e.id}
            data-testid="time-event-tick"
            data-kind={e.kind}
            // 트랙 위쪽으로 솟는 1px 선 — 연도 눈금 (트랙 가운데 상하 대칭) 과 겹쳐도 구분된다. 혜성은 길게 (결정 D4).
            className={`absolute bottom-full w-px -translate-x-1/2 ${comet ? 'h-2.5' : 'h-1.5'} ${KIND_COLOR_CLASS[e.kind]}`}
            style={{ left: `${yearValueToTrackPercent(year)}%` }}
          />
        );
      })}
    </span>
  );
}

/** 스크러버 행 오른쪽 끝 사건 패널 버튼 + 패널. 꺼져 있으면 `null` (타임바 DOM 이 현행과 같다 — M8). */
export function TimeEventsButton() {
  const { shown, kepler } = useTimeEventsGate();
  const snapshot = useTimeEvents(shown && kepler);
  const [open, setOpen] = useState(false);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const reasonId = useId();
  const panelId = useId();
  const titleId = useId();
  const disabled = !kepler;

  const close = useCallback((restoreFocus: boolean) => {
    setOpen(false);
    if (restoreFocus) triggerRef.current?.focus();
  }, []);

  // 엔진이 N-body 로 바뀌면 (패널을 연 채 런타임 전환 — §교차검증 합의 2 (iii)) 패널을 닫는다. effect 가 아니라 렌더 중
  // 이전 값 비교로 한다 (React 「props 변화에 맞춰 state 조정」 패턴 — effect 안 setState 의 연쇄 렌더 회피).
  const [prevDisabled, setPrevDisabled] = useState(disabled);
  if (prevDisabled !== disabled) {
    setPrevDisabled(disabled);
    if (disabled) setOpen(false);
  }

  // 열린 동안만 전역 리스너 — Esc (capture · 자유시점 Esc 보다 먼저) · 패널 밖 pointerdown · resize.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close(true);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    const onResize = () => close(false);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  if (!shown) return null;

  const handleTriggerClick = () => {
    if (disabled) return;
    if (open) {
      close(false);
      return;
    }
    if (triggerRef.current) setPosition(resolvePanelPosition(triggerRef.current));
    setOpen(true);
  };

  const panelFocusables = () => (panelRef.current ? getFocusableElements(panelRef.current) : []);

  // 트리거 Tab — 열려 있으면 (DOM 상 문서 끝의) 패널 첫 요소로 잇는다 (`display-panel.tsx` 와 같은 순서 규칙).
  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (!open || e.key !== 'Tab' || e.shiftKey) return;
    const first = panelFocusables()[0];
    if (!first) return;
    e.preventDefault();
    first.focus();
  };

  const handlePanelKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    if (e.key !== 'Tab') return;
    const items = panelFocusables();
    const trigger = triggerRef.current;
    if (!trigger || items.length === 0) return;
    if (e.shiftKey && e.target === items[0]) {
      e.preventDefault();
      trigger.focus();
      return;
    }
    if (!e.shiftKey && e.target === items[items.length - 1]) {
      e.preventDefault();
      const next = nextFocusableAfter(trigger, panelRef.current);
      close(false);
      (next ?? trigger).focus();
    }
  };

  // 포커스가 트리거와 패널을 둘 다 벗어나면 닫는다 (`display-panel.tsx` 와 같은 규칙).
  const handleBlur = (e: ReactFocusEvent<HTMLElement>) => {
    if (!open) return;
    const to = e.relatedTarget;
    if (!(to instanceof Node)) return;
    if (panelRef.current?.contains(to) || triggerRef.current?.contains(to)) return;
    close(false);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="time-events-toggle"
        aria-label="시간 사건"
        aria-expanded={open}
        aria-controls={open ? panelId : undefined}
        aria-disabled={disabled}
        aria-describedby={disabled ? reasonId : undefined}
        title={
          disabled
            ? EVENTS_NBODY_DISABLED_REASON
            : '시간 사건 — 충 · 내합 · 혜성 근일점 · 일식 · 월식'
        }
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        onBlur={handleBlur}
        className={`p-1 rounded-sm border min-w-6 min-h-6 shrink-0 inline-flex items-center justify-center transition-colors ${
          disabled
            ? 'bg-bg-surface/80 border-border-subtle text-fg-secondary cursor-not-allowed opacity-60'
            : open
              ? 'bg-primary/20 border-primary/40 text-fg-primary'
              : 'bg-bg-surface/80 border-border-subtle text-fg-secondary hover:bg-bg-elevated'
        }`}
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        <CalendarClock size={14} aria-hidden="true" />
        {disabled ? (
          <span id={reasonId} className="sr-only">
            {EVENTS_NBODY_DISABLED_REASON}
          </span>
        ) : null}
      </button>
      {open && position && !disabled
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="group"
              aria-labelledby={titleId}
              data-testid="time-events-panel"
              onKeyDown={handlePanelKeyDown}
              onBlur={handleBlur}
              className="fixed z-[var(--z-dropdown)] flex flex-col bg-bg-surface border border-border-subtle rounded-sm p-3 shadow-lg overflow-y-auto"
              style={{
                bottom: position.bottom,
                right: position.right,
                width: PANEL_WIDTH_PX,
                maxHeight: position.maxHeight,
              }}
            >
              <TimeEventsPanelBody titleId={titleId} snapshot={snapshot} />
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function TimeEventsPanelBody({
  titleId,
  snapshot,
}: {
  titleId: string;
  snapshot: TimeEventsSnapshot;
}) {
  const sendCommand = useSimCommand();
  const filters = useSimStore((s) => s.eventFilters);
  const setEventFilter = useSimStore((s) => s.setEventFilter);
  const setRulerAnchor = useSimStore((s) => s.setRulerAnchor);
  const filtered = useFilteredEvents(snapshot.events);
  const computing = snapshot.status !== 'ready';
  const listId = useId();
  const listRef = useRef<HTMLUListElement | null>(null);

  // listbox 의 활성 항목 — 처음에는 현재 시각 다음 사건 (없으면 마지막).
  const [activeId, setActiveId] = useState<string | null>(null);
  const activeIndex = useMemo(() => {
    const i = activeId === null ? -1 : filtered.findIndex((e) => e.id === activeId);
    if (i >= 0) return i;
    const jd = useSimStore.getState().julianDate;
    if (jd === null || filtered.length === 0) return filtered.length > 0 ? 0 : -1;
    const next = filtered.findIndex((e) => e.julianDate >= jd);
    return next >= 0 ? next : filtered.length - 1;
  }, [activeId, filtered]);
  const active = activeIndex >= 0 ? filtered[activeIndex]! : null;

  const select = useCallback(
    (event: AstroEvent) => {
      const kind = getEventKind(event.kind);
      // 순서가 계약이다 (모듈 머리 주석) — 시각 → (시점 요청) → 포커스 → 일시정지.
      sendCommand({ type: 'jumpToJulianDate', julianDate: event.julianDate });
      // #1360 PR2 결정 C3 — 시점 요청은 포커스 **전에** 둔다. 포커스 동기 (`sim-canvas`) 가 진입 때 소비한다.
      if (kind.focusView) {
        useSimStore
          .getState()
          .setFocusViewRequest({ bodyId: kind.subjectId, view: kind.focusView });
      }
      sendCommand({ type: 'focusOn', bodyId: kind.subjectId });
      sendCommand({ type: 'setTimeScale', scale: 0 });
      if (kind.autoRulerAnchorEarth) setRulerAnchor('earth');
      setActiveId(event.id);
    },
    [sendCommand, setRulerAnchor],
  );

  const step = (direction: 1 | -1) => {
    const jd = useSimStore.getState().julianDate;
    if (jd === null) return;
    const target = adjacentEvent(filtered, jd, direction);
    if (target) select(target);
  };

  // 활성 항목이 바뀌면 목록 안에서 보이게 한다 (패널 안 스크롤 — 트리거 위치는 그대로).
  useEffect(() => {
    if (!active) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-event-id="${active.id}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [active]);

  const handleListKeyDown = (e: ReactKeyboardEvent<HTMLUListElement>) => {
    if (filtered.length === 0) return;
    if (e.key === 'Enter' || e.key === ' ') {
      e.preventDefault();
      if (active) select(active);
      return;
    }
    const next = listboxNextIndex(e.key, activeIndex, filtered.length);
    if (next === null) return;
    e.preventDefault();
    setActiveId(filtered[next]!.id);
  };

  return (
    <>
      <p id={titleId} className="text-caption text-fg-secondary mb-1">
        시간 사건 (1900~2100)
      </p>
      {ECLIPSE_FILTER_IDS.some((id) => filters[id]) ? (
        <p className="text-mini text-fg-secondary mb-2" data-testid="time-events-scale-note">
          {eclipseScaleNotice()}
        </p>
      ) : null}
      <div role="group" aria-label="사건 종류" className="flex flex-wrap gap-1 mb-2">
        {FILTER_LABELS.map((f) => (
          <button
            key={f.id}
            type="button"
            data-testid={`time-event-filter-${f.id}`}
            aria-pressed={filters[f.id]}
            onClick={() => setEventFilter(f.id, !filters[f.id])}
            className={`inline-flex items-center gap-1 min-h-6 rounded-sm border px-1.5 text-mini transition-colors ${
              filters[f.id]
                ? 'border-primary/40 bg-primary/20 text-fg-primary'
                : 'border-border-subtle bg-bg-surface text-fg-secondary hover:bg-bg-elevated'
            }`}
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            <span
              aria-hidden="true"
              className={`h-2 w-2 rounded-full ${KIND_COLOR_CLASS[f.kind]}`}
            />
            {f.label}
          </button>
        ))}
      </div>
      <div className="flex gap-1 mb-2">
        <button
          type="button"
          data-testid="time-event-prev"
          onClick={() => step(-1)}
          disabled={computing}
          className="flex-1 inline-flex items-center justify-center gap-0.5 min-h-6 rounded-sm border border-border-subtle bg-bg-surface px-1.5 text-mini text-fg-primary hover:bg-bg-elevated disabled:opacity-40"
        >
          <ChevronLeft size={12} aria-hidden="true" />
          이전 사건
        </button>
        <button
          type="button"
          data-testid="time-event-next"
          onClick={() => step(1)}
          disabled={computing}
          className="flex-1 inline-flex items-center justify-center gap-0.5 min-h-6 rounded-sm border border-border-subtle bg-bg-surface px-1.5 text-mini text-fg-primary hover:bg-bg-elevated disabled:opacity-40"
        >
          다음 사건
          <ChevronRight size={12} aria-hidden="true" />
        </button>
      </div>
      {computing ? (
        <p
          role="status"
          className="text-mini text-fg-secondary"
          data-testid="time-events-computing"
        >
          사건 계산 중…
        </p>
      ) : filtered.length === 0 ? (
        <p className="text-mini text-fg-secondary" data-testid="time-events-empty">
          고른 종류의 사건이 없습니다
        </p>
      ) : (
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="사건 목록"
          tabIndex={0}
          aria-activedescendant={active ? `${listId}-${active.id}` : undefined}
          onKeyDown={handleListKeyDown}
          data-testid="time-events-list"
          className="min-h-0 flex-1 overflow-y-auto rounded-sm border border-border-subtle focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/50"
          style={{ maxHeight: 240 }}
        >
          {filtered.map((e) => (
            <EventOption
              key={e.id}
              event={e}
              optionId={`${listId}-${e.id}`}
              isActive={active?.id === e.id}
              onSelect={select}
            />
          ))}
        </ul>
      )}
    </>
  );
}

/**
 * 목록 한 행. `memo` — 전 종류를 켜면 597행 (식까지 켜면 + 일식 · 월식) 이라, ↑↓ 한 번에 활성 표시가 바뀐 두 행만 다시 그린다.
 */
const EventOption = memo(function EventOption({
  event,
  optionId,
  isActive,
  onSelect,
}: {
  event: AstroEvent;
  optionId: string;
  isActive: boolean;
  onSelect: (event: AstroEvent) => void;
}) {
  return (
    <li
      id={optionId}
      role="option"
      aria-selected={isActive}
      data-event-id={event.id}
      data-testid="time-event-option"
      onClick={() => onSelect(event)}
      className={`flex items-center gap-1.5 px-2 py-1 min-h-6 cursor-pointer text-mini ${
        isActive ? 'bg-primary/20 text-fg-primary' : 'text-fg-secondary hover:bg-bg-elevated'
      }`}
    >
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-full ${KIND_COLOR_CLASS[event.kind]}`}
      />
      <span className="num">{eventDate(event)}</span>
      <span className="flex-1 truncate">{eventLabelKo(event)}</span>
      <span className="num shrink-0 text-fg-secondary" title="모델 사건 시각과 실제 날짜의 최대 차">
        <span className="sr-only">오차 </span>
        {formatTolerance(event.kind)}
      </span>
    </li>
  );
});
