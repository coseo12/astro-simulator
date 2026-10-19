/**
 * #1373 PR2 — 별자리 데이터 (`constellations.json` 파싱 · 인덱스 결합 · 정점 버퍼). Babylon 비의존 순수 함수.
 *
 * ADR `docs/decisions/20261018-1373-star-catalog-constellations.md` 결정 D3 (형식 · 런타임 결합 · 뱀자리) · R6 · N2.
 * 메시는 `constellation-lines.ts` 가, 라벨 투영은 장면 (`getConstellationScreenInfo`) 이 만든다.
 *
 * ## 런타임 결합 (D3)
 *
 * 선 정점 좌표는 파일에 없다 — 이미 로드된 카탈로그 (`StarCatalog`) 에서 인덱스로 읽는다. 그래서 선 끝은 그려진 별과
 * 같은 방향 함수 (`starSceneDirection`) 를 지나 정확히 만난다. 인덱스가 카탈로그 `count` 이상이면 **그 별자리만** 건너뛰고
 * 경고한다 (나머지는 그린다).
 */
import { equatorialJ2000ToEcliptic } from '../coords/equatorial.js';
import { toScene } from '../coords/scene-handedness.js';
import { starSceneDirection, type StarCatalog } from './star-catalog-data.js';

/** 런타임 파일 이름 — 장면 옵션 `starCatalogBaseUrl` 뒤에 붙는다 (`STAR_CATALOG_FILE_NAME` 과 같은 디렉터리). */
export const CONSTELLATIONS_FILE_NAME = 'constellations.json';
/** 형식 표지 — 생성기 `CONSTELLATION_FORMAT` 과 짝 (한쪽만 바꾸면 로더가 별자리를 만들지 않는다). */
export const CONSTELLATIONS_FORMAT = 'CNS1';

/** 별자리 1개 — 원천 좌표계 (적도 J2000). */
export interface ConstellationEntry {
  /** IAU 약어 (예: `Ori`). */
  readonly id: string;
  readonly nameKo: string;
  /** 라벨 기준점 RA [°] (J2000). */
  readonly labelRaDeg: number;
  /** 라벨 기준점 Dec [°] (J2000). */
  readonly labelDecDeg: number;
  /** 별 인덱스 평면 배열 — 연속 2개가 선분 1개. */
  readonly lines: readonly number[];
}

const isFiniteNumber = (x: unknown): x is number => typeof x === 'number' && Number.isFinite(x);

/**
 * `constellations.json` 구조 파싱. 형식 표지 · 필드 형이 어긋나면 `null` + 경고 1회 — 호출자는 별자리를 만들지 않는다
 * (`parseStarCatalog` 와 같은 fail-closed). 인덱스 범위는 여기서 보지 않는다 — 카탈로그가 있어야 알 수 있다
 * (`resolveConstellations`).
 */
export function parseConstellations(
  json: unknown,
  warn: (message: string) => void = (m) => console.warn(m),
): ConstellationEntry[] | null {
  const root = json as { format?: unknown; constellations?: unknown } | null;
  if (root === null || typeof root !== 'object' || root.format !== CONSTELLATIONS_FORMAT) {
    warn(`[constellations] 형식 표지 불일치 — 별자리를 만들지 않는다`);
    return null;
  }
  if (!Array.isArray(root.constellations)) {
    warn(`[constellations] constellations 배열 없음 — 별자리를 만들지 않는다`);
    return null;
  }
  const out: ConstellationEntry[] = [];
  for (const raw of root.constellations as unknown[]) {
    const c = raw as {
      id?: unknown;
      nameKo?: unknown;
      label?: unknown;
      lines?: unknown;
    } | null;
    const label = c?.label;
    const lines = c?.lines;
    const ok =
      c !== null &&
      typeof c === 'object' &&
      typeof c.id === 'string' &&
      typeof c.nameKo === 'string' &&
      Array.isArray(label) &&
      label.length === 2 &&
      label.every(isFiniteNumber) &&
      Array.isArray(lines) &&
      lines.length % 2 === 0 &&
      lines.every((i) => Number.isInteger(i) && (i as number) >= 0);
    if (!ok) {
      warn(`[constellations] 항목 형식 불일치 — 별자리를 만들지 않는다`);
      return null;
    }
    out.push({
      id: c.id as string,
      nameKo: c.nameKo as string,
      labelRaDeg: (label as number[])[0]!,
      labelDecDeg: (label as number[])[1]!,
      lines: lines as number[],
    });
  }
  return out;
}

/**
 * 인덱스 결합 검사 (D3). 선 인덱스가 `starCount` 이상인 별자리는 건너뛰고 경고한다 (별자리마다 1회). 반환은 그릴 별자리.
 */
export function resolveConstellations(
  entries: readonly ConstellationEntry[],
  starCount: number,
  warn: (message: string) => void = (m) => console.warn(m),
): ConstellationEntry[] {
  const valid: ConstellationEntry[] = [];
  for (const entry of entries) {
    const bad = entry.lines.find((i) => i >= starCount);
    if (bad !== undefined) {
      warn(
        `[constellations] ${entry.id} 별 인덱스 ${bad} ≥ 카탈로그 별 수 ${starCount} — 이 별자리를 건너뛴다`,
      );
      continue;
    }
    valid.push(entry);
  }
  return valid;
}

/** 라벨 기준점의 **장면** 단위 방향 — 별과 같은 경로 (적도 → 황도 → `toScene`, ADR D6 · 1366). */
export function constellationLabelSceneDirection(
  entry: ConstellationEntry,
): readonly [number, number, number] {
  return toScene(equatorialJ2000ToEcliptic(entry.labelRaDeg, entry.labelDecDeg));
}

/**
 * 선 정점 버퍼 — 선분마다 정점 2개 (공유 없음 · 743 선분 = 1,486 정점, ADR R6). 정점 = 끝점 별의 장면 방향 × `radius`.
 * 인덱스는 `resolveConstellations` 를 통과한 별자리만 받는다 (범위 검사 없음).
 */
export function buildConstellationLineVertexData(
  catalog: StarCatalog,
  entries: readonly ConstellationEntry[],
  radius: number,
): { positions: Float32Array; indices: Uint32Array; segmentCount: number } {
  let segmentCount = 0;
  for (const e of entries) segmentCount += e.lines.length / 2;
  const positions = new Float32Array(segmentCount * 2 * 3);
  const indices = new Uint32Array(segmentCount * 2);
  let v = 0;
  for (const e of entries) {
    for (const starIndex of e.lines) {
      const dir = starSceneDirection(catalog, starIndex);
      positions[v * 3] = dir[0] * radius;
      positions[v * 3 + 1] = dir[1] * radius;
      positions[v * 3 + 2] = dir[2] * radius;
      indices[v] = v;
      v += 1;
    }
  }
  return { positions, indices, segmentCount };
}
