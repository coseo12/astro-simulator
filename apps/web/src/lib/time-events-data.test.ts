import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EVENT_KINDS,
  computeEventsForKind,
  ephemeris,
  type AstroEvent,
} from '@astro-simulator/core';
import {
  TIME_EVENTS_FORMAT,
  decodeTimeEvents,
  encodeTimeEvents,
  sortEvents,
  type TimeEventsFile,
} from './time-events-data';
import { SCRUBBER_MAX_JD, SCRUBBER_MIN_JD } from './time-scrubber';

/**
 * #1377 — 사전 계산 파일 (`src/data/time-events.json`) 의 생성기 겸 drift 가드.
 *
 * - 쓰기 모드 (`TIME_EVENTS_WRITE=1`, `pnpm --filter @astro-simulator/web generate:time-events`): 전 범위를 계산해 파일을 쓴다.
 *   prettier 로 정규화해 쓴다 — 커밋 시 lint-staged 가 같은 출력을 내므로 생성물 ↔ 포맷 drift 가 없다.
 * - 검사 모드 (기본 — CI): 커밋된 파일을 복원한 목록이 `computeEventsForKind` **전 범위** 결과와 깊은 비교로 같아야 한다.
 *   위치 모델 (궤도 요소 · μ · 시각 모델) 이 바뀌어 사건 하나라도 움직이면 FAIL — 「파일을 다시 생성하라」 는 뜻이다.
 *
 * 전 범위를 고른 이유: 표본 구간은 범위 밖 사건의 drift 를 놓친다. 전 범위 계산은 Node 실측 161 ms (M1 Pro, vitest) 라
 * 표본으로 줄일 이유가 없다. 식 종류의 전 범위 = 10년 청크 이어 붙이기 (구 런타임 경로) 는 develop `53aa8dc2` 의 E9 테스트가
 * 확인했다 — 그래서 이 파일의 사건 목록은 구 런타임 목록과 같다.
 */

const DATA_PATH = resolve(__dirname, '../data/time-events.json');
const RANGE = { startJd: SCRUBBER_MIN_JD, endJd: SCRUBBER_MAX_JD };

/** 종류별 사건 수 — 구 런타임 (develop `53aa8dc2`) 실측과 같다. 파일 재생성으로 이 수가 바뀌면 의도한 모델 변경인지 확인할 것. */
const EXPECTED_COUNTS: Readonly<Record<string, number>> = {
  'mars-opposition': 94,
  'venus-inferior-conjunction': 125,
  'jupiter-opposition': 183,
  'saturn-opposition': 193,
  'halley-perihelion': 1,
  'swift-tuttle-perihelion': 1,
  'solar-eclipse': 455,
  'lunar-eclipse': 458,
};

function computeAll(): AstroEvent[] {
  const bodiesById = new Map(ephemeris.getSolarSystem().bodies.map((b) => [b.id, b]));
  return sortEvents(
    EVENT_KINDS.flatMap((kind) =>
      computeEventsForKind(bodiesById, kind, RANGE.startJd, RANGE.endJd),
    ),
  );
}

async function writeGenerated(file: TimeEventsFile): Promise<void> {
  const prettier = await import('prettier');
  const config = (await prettier.resolveConfig(DATA_PATH)) ?? {};
  const text = await prettier.format(JSON.stringify(file), { ...config, parser: 'json' });
  writeFileSync(DATA_PATH, text);
}

describe('#1377 사전 계산 파일', () => {
  const computed = computeAll();

  it('drift — 커밋된 파일 복원 == computeEventsForKind 전 범위 (사건 수 · id · 시각 비트 · 식 종류)', async () => {
    if (process.env.TIME_EVENTS_WRITE === '1') {
      await writeGenerated(encodeTimeEvents(computed, RANGE.startJd, RANGE.endJd));
    }
    const committed: unknown = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
    const decoded = decodeTimeEvents(committed, RANGE);
    // toEqual 은 숫자를 Object.is 로 비교한다 — JD 는 비트 단위로 같아야 한다 (JSON 숫자는 왕복 정확).
    expect(decoded).toEqual(computed);
  });

  it('종류별 사건 수 — 구 런타임과 같다 (일식 455 · 월식 458 …)', () => {
    const counts: Record<string, number> = {};
    for (const e of computed) counts[e.kind] = (counts[e.kind] ?? 0) + 1;
    expect(counts).toEqual(EXPECTED_COUNTS);
  });

  it('encode → decode 왕복 = 원본 (열 순서와 무관)', () => {
    const file = encodeTimeEvents(computed, RANGE.startJd, RANGE.endJd);
    expect(decodeTimeEvents(file, RANGE)).toEqual(computed);
    const reversed = { ...file, kinds: [...file.kinds].reverse() };
    expect(decodeTimeEvents(reversed, RANGE)).toEqual(computed);
  });

  it('복원기는 어긋난 파일을 거부한다 — 형식 · 범위 · 종류 누락 · 열 길이', () => {
    const file = encodeTimeEvents(computed, RANGE.startJd, RANGE.endJd);
    expect(() => decodeTimeEvents({ ...file, format: 'TEV0' }, RANGE)).toThrow(/형식/);
    expect(() => decodeTimeEvents({ ...file, endJd: RANGE.endJd + 1 }, RANGE)).toThrow(/범위/);
    expect(() => decodeTimeEvents({ ...file, kinds: file.kinds.slice(1) }, RANGE)).toThrow(/누락/);
    const broken = file.kinds.map((c) =>
      c.eclipseTypes ? { ...c, eclipseTypes: c.eclipseTypes.slice(1) } : c,
    );
    expect(() => decodeTimeEvents({ ...file, kinds: broken }, RANGE)).toThrow(/열 길이/);
    expect(() => decodeTimeEvents(null, RANGE)).toThrow(/형식/);
    expect(TIME_EVENTS_FORMAT).toBe('TEV1');
  });
});
