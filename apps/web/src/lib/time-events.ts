// #1347 — 시간 이벤트 지연 계산 · 메모 (ADR `docs/decisions/20261016-1347-event-markers.md` 결정 D3).
//
// 루트 named import (`physics` · `scene` namespace 경유 금지 — 타임바는 app-shell 직접 import 라 SSR 평가 대상, body-distance.ts 와
// 같은 사유). `ephemeris` namespace 는 거리 자 (`use-ruler-distance.ts`) 가 이미 같은 방식으로 쓴다.
import {
  EVENT_KINDS,
  computeEventsForKind,
  ephemeris as ephemerisApi,
  type AstroEvent,
  type EventKindId,
} from '@astro-simulator/core';
import { SCRUBBER_MAX_JD, SCRUBBER_MIN_JD } from './time-scrubber';

/**
 * 종류별 청크 시간 측정 이름 접두 — `performance.measure('astro-events:<kind>')` (DoD M7). 브라우저에서
 * `performance.getEntriesByType('measure')` 로 읽는다.
 */
export const EVENT_CHUNK_MEASURE_PREFIX = 'astro-events:';

/** idle 콜백 최대 대기 [ms] — 렌더 루프가 idle 기간을 남기지 않아도 이 시간 뒤에는 청크를 돌린다. */
const IDLE_TIMEOUT_MS = 1_000;

export type TimeEventsStatus = 'idle' | 'computing' | 'ready';

export interface TimeEventsSnapshot {
  readonly status: TimeEventsStatus;
  /** 계산이 끝난 종류의 사건 전부 (시각 오름차순). 계산 중에는 끝난 종류만 들어 있다. */
  readonly events: readonly AstroEvent[];
}

const IDLE_SNAPSHOT: TimeEventsSnapshot = { status: 'idle', events: [] };

let memo = new Map<EventKindId, AstroEvent[]>();
let snapshot: TimeEventsSnapshot = IDLE_SNAPSHOT;
let started = false;
let pendingCancel: (() => void) | null = null;
const listeners = new Set<() => void>();

function emit(next: TimeEventsSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

/** 다음 idle 시점에 `cb` — `requestIdleCallback` 미지원 (Safari) 이면 `setTimeout`. 취소 함수를 돌려준다. */
function scheduleIdle(cb: () => void): () => void {
  if (typeof window !== 'undefined' && typeof window.requestIdleCallback === 'function') {
    const handle = window.requestIdleCallback(cb, { timeout: IDLE_TIMEOUT_MS });
    return () => window.cancelIdleCallback(handle);
  }
  const handle = setTimeout(cb, 0);
  return () => clearTimeout(handle);
}

function mergedEvents(): AstroEvent[] {
  return [...memo.values()].flat().sort((a, b) => a.julianDate - b.julianDate);
}

/** 종류 하나 = 청크 하나. 끝나면 다음 종류를 다시 idle 로 넘긴다 — 한 번에 돌리면 long task (ADR 1-E `~100` ms). */
function runNextChunk(): void {
  pendingCancel = null;
  const kind = EVENT_KINDS.find((k) => !memo.has(k.id));
  if (!kind) {
    emit({ status: 'ready', events: mergedEvents() });
    return;
  }
  const bodiesById = new Map(ephemerisApi.getSolarSystem().bodies.map((b) => [b.id, b]));
  const start = performance.now();
  const events = computeEventsForKind(bodiesById, kind, SCRUBBER_MIN_JD, SCRUBBER_MAX_JD);
  const end = performance.now();
  try {
    performance.measure(`${EVENT_CHUNK_MEASURE_PREFIX}${kind.id}`, { start, end });
  } catch {
    // User Timing L3 미지원 환경 — 측정만 빠지고 계산 결과는 그대로 쓴다.
  }
  memo.set(kind.id, events);
  const done = memo.size === EVENT_KINDS.length;
  emit({ status: done ? 'ready' : 'computing', events: mergedEvents() });
  if (!done) pendingCancel = scheduleIdle(runNextChunk);
}

/**
 * 계산 시작 (멱등). 처음 호출될 때만 첫 청크를 idle 로 예약한다 — 기능이 꺼져 있어 한 번도 불리지 않으면 계산은 0회다 (DoD M7).
 * 결과는 모듈 수명 동안 메모한다 (요소 · μ 는 런타임에 바뀌지 않는다).
 */
export function requestTimeEvents(): void {
  if (started) return;
  started = true;
  emit({ status: 'computing', events: [] });
  pendingCancel = scheduleIdle(runNextChunk);
}

export function subscribeTimeEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTimeEventsSnapshot(): TimeEventsSnapshot {
  return snapshot;
}

/** SSR — 서버에서는 계산하지 않는다. */
export function getServerTimeEventsSnapshot(): TimeEventsSnapshot {
  return IDLE_SNAPSHOT;
}

/** 테스트 전용 — 모듈 메모 · 예약 초기화. */
export function resetTimeEventsForTest(): void {
  pendingCancel?.();
  pendingCancel = null;
  memo = new Map();
  started = false;
  snapshot = IDLE_SNAPSHOT;
  listeners.clear();
}

/**
 * 현재 시각 기준 이전 / 다음 사건 (패널의 「이전 · 다음 사건」 — 결정 D4). 같은 시각 (방금 고른 사건) 은 이전도 다음도 아니다 —
 * 반복해서 누르면 한 칸씩 움직인다. 시각 비교 여유는 북마크 URL 정밀도 (`t.toFixed(5)` ≈ 0.86 초) 보다 넉넉한 1 분.
 */
const SAME_EVENT_EPSILON_DAYS = 1 / 1_440;

export function adjacentEvent(
  events: readonly AstroEvent[],
  julianDate: number,
  direction: 1 | -1,
): AstroEvent | null {
  if (direction > 0) {
    return events.find((e) => e.julianDate > julianDate + SAME_EVENT_EPSILON_DAYS) ?? null;
  }
  for (let i = events.length - 1; i >= 0; i -= 1) {
    if (events[i]!.julianDate < julianDate - SAME_EVENT_EPSILON_DAYS) return events[i]!;
  }
  return null;
}
