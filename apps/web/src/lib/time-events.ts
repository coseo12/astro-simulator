// #1347 — 시간 이벤트 목록 공급 (ADR `docs/decisions/20261016-1347-event-markers.md` 결정 D3).
// #1377 — 런타임 계산을 없애고 **사전 계산 파일** 을 1회 읽어 1회 반영한다 (ADR 1347 · 1354 Amendment). 구 경로 (idle 청크
// 46개 — 식은 10년 청크, 청크마다 emit) 는 CI 실측으로 로드마다 메인 스레드 약 3.4 초 (계산 1.2~1.3 s + 청크마다 재렌더 약
// 2.1 s) 를 썼다 — #1377 Phase 0. 파일 형식 · drift 가드는 `time-events-data.ts` · `time-events-data.test.ts`.
import type { AstroEvent } from '@astro-simulator/core';
import { decodeTimeEvents } from './time-events-data';
import { SCRUBBER_MAX_JD, SCRUBBER_MIN_JD } from './time-scrubber';

/**
 * 반영 시간 측정 이름 — `performance.measure('astro-events:apply')` (파일 도착 → 복원 → emit). 브라우저에서
 * `performance.getEntriesByType('measure')` 로 읽는다 (1347 DoD M7 의 측정 이름 접두를 잇는다).
 */
export const EVENT_APPLY_MEASURE = 'astro-events:apply';

export type TimeEventsStatus = 'idle' | 'loading' | 'ready' | 'error';

export interface TimeEventsSnapshot {
  readonly status: TimeEventsStatus;
  /** 사건 전부 (시각 오름차순). `ready` 가 아니면 빈 배열이다 — 부분 목록 단계는 없다. */
  readonly events: readonly AstroEvent[];
}

const IDLE_SNAPSHOT: TimeEventsSnapshot = { status: 'idle', events: [] };

/**
 * 파일 로더 — 번들러가 JSON 을 별도 chunk 로 나눈다 (dynamic import). 기능이 꺼져 있어 `requestTimeEvents` 가 한 번도 불리지
 * 않으면 chunk 도 받지 않는다 (DoD M7 — 「꺼짐 = 0회」 의 대상이 계산에서 불러오기로 바뀌었다).
 */
type TimeEventsLoader = () => Promise<unknown>;
const defaultLoader: TimeEventsLoader = () =>
  import('@/data/time-events.json').then((m: { default: unknown }) => m.default);

let loader: TimeEventsLoader = defaultLoader;
let snapshot: TimeEventsSnapshot = IDLE_SNAPSHOT;
let started = false;
/** reset 세대 — 테스트가 초기화한 뒤 늦게 도착한 이전 요청의 결과를 버린다. */
let generation = 0;
const listeners = new Set<() => void>();

function emit(next: TimeEventsSnapshot): void {
  snapshot = next;
  for (const l of listeners) l();
}

/**
 * 불러오기 시작 (멱등). 처음 호출될 때만 파일을 받고, 도착하면 복원해 **한 번** 반영한다. 결과는 모듈 수명 동안 메모한다.
 * 실패하면 (chunk 로드 실패 · 형식 불일치) `error` 로 두고 `started` 를 되돌린다. 자동 재시도는 없다 — 다음 호출이 다시
 * 시도하며, 호출 지점은 셋이다: 사건 패널을 **여는** 순간 (`error` 일 때만 — `TimeEventsButton`), 눈금 · 버튼의 활성 조건
 * (`active` — 표시 의도 · 장면 준비 · Kepler 엔진) 이 다시 참이 될 때, 새 페이지 로드.
 */
export function requestTimeEvents(): void {
  if (started) return;
  started = true;
  const mine = generation;
  emit({ status: 'loading', events: [] });
  loader().then(
    (raw) => {
      if (mine !== generation) return;
      const start = performance.now();
      let events: AstroEvent[];
      try {
        events = decodeTimeEvents(raw, { startJd: SCRUBBER_MIN_JD, endJd: SCRUBBER_MAX_JD });
      } catch (error) {
        fail(error);
        return;
      }
      emit({ status: 'ready', events });
      try {
        performance.measure(EVENT_APPLY_MEASURE, { start, end: performance.now() });
      } catch {
        // User Timing L3 미지원 환경 — 측정만 빠진다.
      }
    },
    (error: unknown) => {
      if (mine === generation) fail(error);
    },
  );
}

function fail(error: unknown): void {
  console.error('[time-events] 사건 목록을 불러오지 못했다', error);
  started = false;
  emit({ status: 'error', events: [] });
}

export function subscribeTimeEvents(listener: () => void): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export function getTimeEventsSnapshot(): TimeEventsSnapshot {
  return snapshot;
}

/** SSR — 서버에서는 불러오지 않는다. */
export function getServerTimeEventsSnapshot(): TimeEventsSnapshot {
  return IDLE_SNAPSHOT;
}

/** 테스트 전용 — 모듈 메모 초기화 + (선택) 로더 교체. 인자를 생략하면 실제 파일 로더로 돌린다. */
export function resetTimeEventsForTest(testLoader?: TimeEventsLoader): void {
  loader = testLoader ?? defaultLoader;
  generation += 1;
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
