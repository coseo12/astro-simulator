import type { Vec3Double } from '../coords/vec3.js';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import { parentRelativePositionAt } from './orbit-elements-at.js';

/**
 * #1347 — 모체 체인 위치 (ADR `docs/decisions/20261016-1347-event-markers.md` §교차검증 합의 5).
 *
 * web `body-distance.ts` 가 들고 있던 체인 합산을 core 로 올렸다. 시간 이벤트 계산 (`events/`) 과 정보 카드 · 거리 자가
 * **같은 함수**로 위치를 얻는다 — 함수가 둘이면 parity 테스트가 필요하고, 하나면 동일성이 구조로 보장된다.
 *
 * 식은 scene Kepler 경로 (`solar-system-scene.ts` `updateAtKepler`) 와 같다 — 부모 기준 위치
 * `parentRelativePositionAt(body, parent, grandparent, jd)` (#1354 결정 M4 — 같은 함수를 scene 도 부른다) 를 부모 체인을
 * 따라 더해 계 중심 (태양) 기준 위치를 얻는다.
 * 위성 궤도 시각 배율 (`getOrbitVisualScale`) 은 적용하지 않는다 — 데이터 SSoT 거리다 (principles §1 Visual Fidelity).
 */

/** 체인 계산에 필요한 body 필드만. web 의 `LoadedCelestialBody` 도 같은 타입이다. */
export type ChainBody = Pick<LoadedCelestialBody, 'id' | 'parentId' | 'mass' | 'orbit'>;

/**
 * 고리 하나의 부모 기준 위치를 Kepler 식 대신 줄 수 있는 함수 (N-body 엔진 상태). `null` 을 돌려주면 그 고리는 Kepler 식으로
 * 떨어진다. web 의 `getBodyState(...)?.pos` 가 이 자리에 들어간다.
 */
export type ParentRelativePositionFn = (
  bodyId: string,
  parentId: string,
) => readonly [number, number, number] | null | undefined;

/** 모체 체인 최대 깊이 — 순환 parentId 데이터 결함 시 무한 루프 차단 (현 데이터 깊이 ≤ 2). */
const MAX_CHAIN_DEPTH = 8;

export interface BodyChainPosition {
  /** 계 중심 (모체 체인의 뿌리 = 태양) 기준 위치 [m]. */
  world: [number, number, number];
  /** 체인 첫 고리 — 모체 기준 위치 [m]. 뿌리 천체 (태양) 는 `null`. */
  local: [number, number, number] | null;
}

/**
 * 모체 체인을 따라 부모 기준 위치를 더해 계 중심 기준 위치를 만든다. 체인이 끊기면 `null` — 조용히 원점으로 흡수하지 않는다.
 *
 * @param override 고리별 부모 기준 위치 공급자 (엔진 상태). `null` 이면 전 고리 Kepler 식.
 */
export function resolveBodyChainPosition(
  bodiesById: ReadonlyMap<string, ChainBody>,
  id: string,
  julianDate: number,
  override: ParentRelativePositionFn | null = null,
): BodyChainPosition | null {
  const body = bodiesById.get(id);
  if (!body) return null;

  const world: [number, number, number] = [0, 0, 0];
  let local: [number, number, number] | null = null;
  let cur: ChainBody = body;
  for (let depth = 0; cur.parentId != null; depth += 1) {
    const parent = bodiesById.get(cur.parentId);
    if (!parent || !cur.orbit || depth >= MAX_CHAIN_DEPTH) return null;
    const grandparent = parent.parentId == null ? null : bodiesById.get(parent.parentId);
    const p: Vec3Double =
      override?.(cur.id, parent.id) ??
      parentRelativePositionAt(cur, parent, grandparent, julianDate);
    if (local === null) local = [p[0], p[1], p[2]];
    world[0] += p[0];
    world[1] += p[1];
    world[2] += p[2];
    cur = parent;
  }
  return { world, local };
}

/** 계 중심 (태양) 기준 Kepler 위치 [m] — 엔진 상태 없이. 체인 미해석 · 미등록 id 면 `null`. */
export function heliocentricPositionAt(
  bodiesById: ReadonlyMap<string, ChainBody>,
  id: string,
  julianDate: number,
): [number, number, number] | null {
  return resolveBodyChainPosition(bodiesById, id, julianDate)?.world ?? null;
}
