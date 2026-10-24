import { readFileSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';
import {
  EVENT_KINDS,
  GREATEST_ECLIPSE_TOLERANCE_DAYS,
  computeEventsForKind,
  ephemeris,
  getEventKind,
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
 * #1377 — 사전 계산 파일 (`public/data/events/time-events.json`) 의 생성기 겸 drift 가드.
 *
 * - 쓰기 모드 (`TIME_EVENTS_WRITE=1`, `pnpm --filter @astro-simulator/web generate:time-events`): 전 범위를 계산해 파일을 쓴다.
 *   ⚠️ 이 테스트는 `@astro-simulator/core` 의 **`dist`** 를 읽는다 — core src 만 고치고 빌드하지 않으면 옛 모델로 「재생성」 된다
 *   (PR #1379 리뷰 R2 실측: md5 불변 · 4 passed). 그래서 생성 스크립트는 shared · core 빌드를 먼저 돈다.
 *   prettier 로 정규화해 쓴다 — 커밋 시 lint-staged 가 같은 출력을 내므로 생성물 ↔ 포맷 drift 가 없다.
 * - 검사 모드 (기본 — CI): 커밋된 파일을 복원한 목록이 `computeEventsForKind` **전 범위** 결과와 깊은 비교로 같아야 한다.
 *   위치 모델 (궤도 요소 · μ · 시각 모델) 이 바뀌어 사건 하나라도 움직이면 FAIL — 「파일을 다시 생성하라」 는 뜻이다.
 *
 * 전 범위를 고른 이유: 표본 구간은 범위 밖 사건의 drift 를 놓친다. 전 범위 계산은 Node 실측 161 ms (M1 Pro, vitest) 라
 * 표본으로 줄일 이유가 없다. 식 종류의 전 범위 = 10년 청크 이어 붙이기 (구 런타임 경로) 는 develop `53aa8dc2` 의 E9 테스트가
 * 확인했다 — 그래서 이 파일의 사건 목록은 구 런타임 목록과 같다.
 */

const DATA_PATH = resolve(__dirname, '../../public/data/events/time-events.json');
const RANGE = { startJd: SCRUBBER_MIN_JD, endJd: SCRUBBER_MAX_JD };

/**
 * 종류별 사건 수 — 구 런타임 (develop `53aa8dc2`) 실측에서 출발했다. 파일 재생성으로 이 수가 바뀌면 의도한 모델 변경인지 확인할 것.
 * #1404 (달 이론 — ADR `20261023-1404` 결정 E2) 로 일식 `455 → 453` · 월식 `458 → 457` (다른 종류 불변).
 */
const EXPECTED_COUNTS: Readonly<Record<string, number>> = {
  'mars-opposition': 94,
  'venus-inferior-conjunction': 125,
  'jupiter-opposition': 183,
  'saturn-opposition': 193,
  'halley-perihelion': 1,
  'swift-tuttle-perihelion': 1,
  'solar-eclipse': 453,
  'lunar-eclipse': 457,
};

/**
 * #1404 — 사건 시각의 허용 차 [일]. 식 2종은 최대식 황금분할의 수렴 허용치 (`GREATEST_ECLIPSE_TOLERANCE_DAYS` — 최종 구간이 최소점을
 * 품으므로 두 실행의 차는 이 값 미만) 로, 그 밖 (이분법 · 할선법 근 — 기계 정밀도까지 반복) 은 비트 단위로 비교한다.
 *
 * 왜 식만 허용치인가: 월식 `2085-06-08` 이 CI (Node 22.16.0 linux-x64) 와 로컬 (macOS arm64) 에서 `4.3e-7` 일 갈렸다 (PR #1407 CI
 * run 40067476501). 로컬에서 달 거리에 1 ulp (`× (1 ± 2⁻⁵²)`) 만 곱해도 월식 7 ~ 9건이 최대 `4.30e-7` 일 움직이고, 그중
 * `2085-06-08` 은 정확히 CI 값으로 간다 — 최소점이 마지막 두 탐색점의 한가운데에 놓이면 1 ulp 가 비교를 뒤집어 결과가 한 스텝
 * 옮겨진다. 어느 플랫폼 차가 그 1 ulp 를 만드는지는 x64 재현 환경이 없어 확정하지 않았다.
 */
function eventTimeTolerance(e: AstroEvent): number {
  return getEventKind(e.kind).computation.type === 'syzygy-eclipse'
    ? GREATEST_ECLIPSE_TOLERANCE_DAYS
    : 0;
}

/** 시각을 뺀 사건 (id · 종류 · 주체 · 식 종류는 정확 일치로 비교). */
function withoutTime(e: AstroEvent): Omit<AstroEvent, 'julianDate'> {
  const { julianDate: _julianDate, ...rest } = e;
  return rest;
}

/** 허용 차를 넘는 사건 — `[id, 파일 시각, 계산 시각]`. 두 목록은 같은 길이 · 같은 순서라고 가정한다 (앞 단언이 보장). */
function timeViolations(
  decoded: readonly AstroEvent[],
  computed: readonly AstroEvent[],
): Array<[string, number, number]> {
  const out: Array<[string, number, number]> = [];
  computed.forEach((c, i) => {
    const d = decoded[i]!;
    const tolerance = eventTimeTolerance(c);
    const same =
      tolerance === 0
        ? Object.is(d.julianDate, c.julianDate)
        : Math.abs(d.julianDate - c.julianDate) <= tolerance;
    if (!same) out.push([c.id, d.julianDate, c.julianDate]);
  });
  return out;
}

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

  it('drift — 커밋된 파일 복원 == computeEventsForKind 전 범위 (사건 수 · id · 식 종류 정확, 시각은 식 허용치 · 그 밖 비트)', async () => {
    if (process.env.TIME_EVENTS_WRITE === '1') {
      await writeGenerated(encodeTimeEvents(computed, RANGE.startJd, RANGE.endJd));
    }
    const committed: unknown = JSON.parse(readFileSync(DATA_PATH, 'utf8'));
    const decoded = decodeTimeEvents(committed, RANGE);
    // JSON.stringify → JSON.parse 왕복은 정확하다. 브라우저도 `fetch` → `res.json()` 이 같은 텍스트를 `JSON.parse` 하므로 파일 값과
    // 비트 동일이다 (dev · prod 실측 1,510건 불일치 0 — 번들 import 시절의 35건 1 ulp 손실 (PR #1379 리뷰 R1) 은 fetch 로 옮기며
    // 사라졌다). 시각 허용 차는 `eventTimeTolerance` (#1404).
    const message =
      '사전 계산 파일이 계산 결과와 다르다 — 위치 모델이 바뀌었으면 `pnpm --filter @astro-simulator/web generate:time-events` (core 빌드 포함) 로 재생성하라';
    expect(decoded.map(withoutTime), message).toEqual(computed.map(withoutTime));
    expect(timeViolations(decoded, computed), message).toEqual([]);
  });

  it('판별력 — 식 시각 허용치를 넘는 이동 · 비-식 사건의 1 ulp 이동 · ΔT (69.184 s) 이동은 위반이다', () => {
    const solarIndex = computed.findIndex((e) => e.kind === 'solar-eclipse');
    const marsIndex = computed.findIndex((e) => e.kind === 'mars-opposition');
    const moved = (i: number, delta: number) =>
      computed.map((e, j) => (j === i ? { ...e, julianDate: e.julianDate + delta } : e));
    // 허용치 안 (식) — 위반 아님.
    expect(
      timeViolations(moved(solarIndex, GREATEST_ECLIPSE_TOLERANCE_DAYS / 2), computed),
    ).toEqual([]);
    // 허용치 2배 (식) · 1 ulp (비-식) — 위반.
    expect(
      timeViolations(moved(solarIndex, GREATEST_ECLIPSE_TOLERANCE_DAYS * 2), computed),
    ).toHaveLength(1);
    const mars = computed[marsIndex]!.julianDate;
    // 1 ulp — `2^(⌊log₂|x|⌋ − 52)`.
    const marsUlp = 2 ** (Math.floor(Math.log2(Math.abs(mars))) - 52);
    expect(timeViolations(moved(marsIndex, marsUlp), computed)).toHaveLength(1);
    // ΔT (2017 이후 TT − UTC = 69.184 s) 를 전 사건에 더하면 전부 위반 (#1370 축).
    const deltaT = 69.184 / 86_400;
    const shifted = computed.map((e) => ({ ...e, julianDate: e.julianDate + deltaT }));
    expect(timeViolations(shifted, computed)).toHaveLength(computed.length);
  });

  it('종류별 사건 수 — 기록값과 같다 (일식 453 · 월식 457 …)', () => {
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
