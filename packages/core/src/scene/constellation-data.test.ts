/**
 * #1373 PR2 — 별자리 데이터 순수 함수 (ADR `20261018-1373` 결정 D3 · R6 · N2).
 *
 * 판정 대상: 형식 fail-closed · 인덱스 범위 밖 별자리만 건너뜀 (+ 경고) · 선 정점 = 끝점 별의 장면 방향 (별 쿼드와 같은 함수) ·
 * 라벨 방향 = 같은 변환 경로 (적도 → 황도 → `toScene`).
 */
import { describe, expect, it, vi } from 'vitest';
import {
  CONSTELLATIONS_FORMAT,
  buildConstellationLineVertexData,
  constellationLabelSceneDirection,
  parseConstellations,
  resolveConstellations,
  type ConstellationEntry,
} from './constellation-data.js';
import { starSceneDirection, type StarCatalog } from './star-catalog-data.js';
import { equatorialJ2000ToEcliptic } from '../coords/equatorial.js';
import { toScene } from '../coords/scene-handedness.js';

/** 3개짜리 카탈로그 (시리우스 · 북극성 · 베가 좌표). */
const CATALOG: StarCatalog = {
  count: 3,
  raDeg: new Float32Array([101.287216, 37.94625, 279.2346]),
  decDeg: new Float32Array([-16.716116, 89.264109, 38.783692]),
  mag: new Float32Array([-1.44, 1.97, 0.03]),
  bv: new Float32Array([0.009, 0.636, -0.001]),
};

const entry = (id: string, lines: number[], label: [number, number] = [10, 20]) => ({
  id,
  nameKo: `${id}자리`,
  label,
  lines,
});

describe('parseConstellations — 형식 (fail-closed)', () => {
  it('정상 → 항목 그대로 (라벨 RA · Dec 분리)', () => {
    const warn = vi.fn();
    const out = parseConstellations(
      { format: CONSTELLATIONS_FORMAT, constellations: [entry('Ori', [0, 1, 1, 2], [84, 13])] },
      warn,
    );
    expect(out).toEqual([
      { id: 'Ori', nameKo: 'Ori자리', labelRaDeg: 84, labelDecDeg: 13, lines: [0, 1, 1, 2] },
    ]);
    expect(warn).not.toHaveBeenCalled();
  });

  it.each([
    ['형식 표지 불일치', { format: 'CNS0', constellations: [] }],
    ['배열 없음', { format: CONSTELLATIONS_FORMAT }],
    ['null', null],
    ['선 길이 홀수', { format: CONSTELLATIONS_FORMAT, constellations: [entry('A', [0, 1, 2])] }],
    ['음수 인덱스', { format: CONSTELLATIONS_FORMAT, constellations: [entry('A', [0, -1])] }],
    ['정수 아님', { format: CONSTELLATIONS_FORMAT, constellations: [entry('A', [0, 1.5])] }],
    [
      '라벨 형식',
      {
        format: CONSTELLATIONS_FORMAT,
        constellations: [{ id: 'A', nameKo: 'a', label: [1], lines: [] }],
      },
    ],
    [
      '이름 형식',
      {
        format: CONSTELLATIONS_FORMAT,
        constellations: [{ id: 'A', nameKo: 3, label: [1, 2], lines: [] }],
      },
    ],
  ])('%s → null + 경고 1회', (_name, json) => {
    const warn = vi.fn();
    expect(parseConstellations(json, warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });
});

describe('resolveConstellations — 인덱스 결합 (D3)', () => {
  it('인덱스 ≥ count 인 별자리만 건너뛰고 경고한다 (나머지는 유지)', () => {
    const warn = vi.fn();
    const entries = parseConstellations(
      {
        format: CONSTELLATIONS_FORMAT,
        constellations: [entry('A', [0, 1]), entry('B', [1, 3]), entry('C', [2, 0])],
      },
      warn,
    )!;
    const valid = resolveConstellations(entries, CATALOG.count, warn);
    expect(valid.map((e) => e.id)).toEqual(['A', 'C']);
    expect(warn).toHaveBeenCalledTimes(1);
    expect(warn.mock.calls[0]![0]).toContain('B');
  });

  it('경계 — 인덱스 count − 1 은 유효, count 는 무효', () => {
    const warn = vi.fn();
    const mk = (lines: number[]): ConstellationEntry => ({
      id: 'X',
      nameKo: 'x',
      labelRaDeg: 0,
      labelDecDeg: 0,
      lines,
    });
    expect(resolveConstellations([mk([0, 2])], 3, warn)).toHaveLength(1);
    expect(resolveConstellations([mk([0, 3])], 3, warn)).toHaveLength(0);
  });
});

describe('buildConstellationLineVertexData — 선 정점 (R6)', () => {
  it('선분마다 정점 2개 · 정점 = 끝점 별 장면 방향 × 반지름 (별 쿼드와 같은 함수)', () => {
    const entries: ConstellationEntry[] = [
      { id: 'A', nameKo: 'a', labelRaDeg: 0, labelDecDeg: 0, lines: [0, 1, 1, 2] },
      { id: 'B', nameKo: 'b', labelRaDeg: 0, labelDecDeg: 0, lines: [2, 0] },
    ];
    const r = 400;
    const { positions, indices, segmentCount } = buildConstellationLineVertexData(
      CATALOG,
      entries,
      r,
    );
    expect(segmentCount).toBe(3);
    expect(positions.length).toBe(3 * 2 * 3);
    expect([...indices]).toEqual([0, 1, 2, 3, 4, 5]);
    const starOrder = [0, 1, 1, 2, 2, 0];
    starOrder.forEach((star, v) => {
      const dir = starSceneDirection(CATALOG, star);
      for (let k = 0; k < 3; k += 1) expect(positions[v * 3 + k]).toBeCloseTo(dir[k]! * r, 3);
    });
  });
});

describe('constellationLabelSceneDirection — 라벨 방향 (N2 · D6)', () => {
  it('적도 → 황도 → toScene (별과 같은 경로) · 단위 벡터', () => {
    const e: ConstellationEntry = {
      id: 'Ori',
      nameKo: '오리온자리',
      labelRaDeg: 84,
      labelDecDeg: 13,
      lines: [],
    };
    const dir = constellationLabelSceneDirection(e);
    const expected = toScene(equatorialJ2000ToEcliptic(84, 13));
    for (let k = 0; k < 3; k += 1) expect(dir[k]).toBeCloseTo(expected[k]!, 12);
    expect(Math.hypot(...dir)).toBeCloseTo(1, 12);
  });
});
