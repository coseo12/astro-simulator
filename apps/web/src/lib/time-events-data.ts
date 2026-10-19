// #1377 — 시간 사건 사전 계산 파일 (`apps/web/src/data/time-events.json`) 의 형식 · 복원.
//
// 사건 목록은 정적 데이터 (`solar-system.json` 의 궤도 요소 · μ) 와 고정 범위 (스크러버 1900~2100) 만으로 정해지는 결정적 값이다.
// 그래서 런타임에 계산하지 않고 생성 시점에 한 번 계산해 둔다 (ADR `20261016-1347-event-markers.md` · `20261017-1354-...` Amendment).
// 런타임 계산은 CI 실측으로 로드마다 메인 스레드 약 3.4 초 (계산 1.2~1.3 s + 청크마다 재렌더 약 2.1 s) 였다 — #1377 Phase 0.
//
// 생성: `pnpm --filter @astro-simulator/web generate:time-events` (= `time-events-data.test.ts` 를 쓰기 모드로 실행).
// drift: 같은 테스트가 커밋된 파일을 복원한 목록과 `computeEventsForKind` 전 범위 결과를 깊은 비교한다 — 위치 모델이 바뀌어
// 사건이 움직이면 FAIL 한다.
import {
  EVENT_KINDS,
  eventDateIso,
  getEventKind,
  type AstroEvent,
  type EclipseType,
  type EventKindId,
} from '@astro-simulator/core';

/** 형식 식별자 — 형식을 바꾸면 올린다 (복원기가 모르는 형식은 거부한다). */
export const TIME_EVENTS_FORMAT = 'TEV1';

/**
 * 종류 하나의 열 (column) — 사건 시각과 (식이면) 식 종류. `id` · `subjectId` 는 종류에서 복원한다 (계산 함수와 같은 규칙 —
 * `<kind>:<YYYY-MM-DD>`, drift 테스트가 복원 결과를 계산 결과와 비교하므로 규칙이 갈리면 FAIL 한다).
 */
export interface TimeEventsKindColumn {
  kind: EventKindId;
  julianDates: number[];
  eclipseTypes?: EclipseType[];
}

export interface TimeEventsFile {
  format: typeof TIME_EVENTS_FORMAT;
  /** 계산 범위 `[startJd, endJd)` — 스크러버 범위와 같아야 한다 (복원 시 검사). */
  startJd: number;
  endJd: number;
  kinds: TimeEventsKindColumn[];
}

/** 시각 오름차순 병합 — 종류 표 순서로 이어 붙인 뒤 안정 정렬 (런타임 청크 병합 `mergedEvents` 와 같은 순서). */
export function sortEvents(events: readonly AstroEvent[]): AstroEvent[] {
  return [...events].sort((a, b) => a.julianDate - b.julianDate);
}

/** 사건 목록 → 파일 (종류 표 순서 · 종류 안 시각 오름차순). */
export function encodeTimeEvents(
  events: readonly AstroEvent[],
  startJd: number,
  endJd: number,
): TimeEventsFile {
  const kinds: TimeEventsKindColumn[] = EVENT_KINDS.map((def) => {
    const own = events.filter((e) => e.kind === def.id).sort((a, b) => a.julianDate - b.julianDate);
    const column: TimeEventsKindColumn = {
      kind: def.id,
      julianDates: own.map((e) => e.julianDate),
    };
    if (def.computation.type === 'syzygy-eclipse') {
      column.eclipseTypes = own.map((e) => {
        if (e.eclipseType === undefined)
          throw new Error(`[time-events] 식 사건에 eclipseType 없음: ${e.id}`);
        return e.eclipseType;
      });
    }
    return column;
  });
  return { format: TIME_EVENTS_FORMAT, startJd, endJd, kinds };
}

/**
 * 파일 → 사건 목록 (시각 오름차순). 형식 · 범위 · 종류 · 열 길이가 어긋나면 throw — 조용히 일부만 쓰지 않는다.
 * `expectedRange` 는 호출측 스크러버 범위 (SSoT `time-scrubber.ts`) 다.
 */
export function decodeTimeEvents(
  raw: unknown,
  expectedRange: { startJd: number; endJd: number },
): AstroEvent[] {
  const file = raw as Partial<TimeEventsFile> | null;
  if (file?.format !== TIME_EVENTS_FORMAT) {
    throw new Error(`[time-events] 알 수 없는 형식: ${String(file?.format)}`);
  }
  if (file.startJd !== expectedRange.startJd || file.endJd !== expectedRange.endJd) {
    throw new Error(
      `[time-events] 범위 불일치: 파일 [${file.startJd}, ${file.endJd}) ≠ 스크러버 [${expectedRange.startJd}, ${expectedRange.endJd})`,
    );
  }
  const columns = file.kinds ?? [];
  const seen = new Set<EventKindId>();
  const events: AstroEvent[] = [];
  for (const column of columns) {
    const def = getEventKind(column.kind); // 미지 종류는 여기서 throw
    if (seen.has(def.id)) throw new Error(`[time-events] 종류 중복: ${def.id}`);
    seen.add(def.id);
    const eclipse = def.computation.type === 'syzygy-eclipse';
    if (eclipse !== (column.eclipseTypes !== undefined)) {
      throw new Error(`[time-events] ${def.id}: eclipseTypes 유무가 계산 유형과 다르다`);
    }
    if (eclipse && column.eclipseTypes!.length !== column.julianDates.length) {
      throw new Error(`[time-events] ${def.id}: 열 길이 불일치`);
    }
    column.julianDates.forEach((julianDate, i) => {
      const event: AstroEvent = {
        id: `${def.id}:${eventDateIso(julianDate)}`,
        kind: def.id,
        subjectId: def.subjectId,
        julianDate,
      };
      if (eclipse) event.eclipseType = column.eclipseTypes![i]!;
      events.push(event);
    });
  }
  if (seen.size !== EVENT_KINDS.length) {
    throw new Error(`[time-events] 종류 누락: 파일 ${seen.size} / 종류 표 ${EVENT_KINDS.length}`);
  }
  // 종류 표 순서로 이어 붙인 뒤 안정 정렬 — 파일의 열 순서와 무관하게 같은 결과.
  const order = new Map(EVENT_KINDS.map((k, i) => [k.id, i]));
  events.sort((a, b) => order.get(a.kind)! - order.get(b.kind)!);
  return sortEvents(events);
}
