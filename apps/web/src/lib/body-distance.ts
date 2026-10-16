// #1281 — named import 필수 (`physics` namespace 경유 금지). `physics/index` → nbody-engine →
// physics_wasm `__dirname` 평가로 SSR 500 — 카드는 app-shell 직접 import 라 SSR 평가 대상이다.
// core/src/index.ts 가 체인 위치 함수를 별도 named export 한다 (ADR `20260504-r-phase-allowlist-guard`
// §Amendment 결정 D1 패턴).
import { resolveBodyChainPosition, type BodyChainPosition } from '@astro-simulator/core';
import type { BodyStateFn } from '@/core/sim-context';
import type { LoadedCelestialBody } from './body-info';

export interface BodyDistances {
  /** 계 중심(모체 체인의 뿌리 = 태양)으로부터 거리 [m]. 체인 미해석 시 `null`. */
  fromSunM: number | null;
  /** 모체로부터 거리 [m]. 모체가 계 중심(태양)이면 태양 거리와 같으므로 `null` (위성만 값). */
  fromParentM: number | null;
}

export type Vec3 = [number, number, number];

/**
 * 모체 체인을 따라 부모 기준 위치를 더해 계 중심 기준 위치를 만든다. 체인이 끊기면 `null`.
 *
 * #1347 — 체인 합산은 core `resolveBodyChainPosition` 하나다 (ADR `20261016-1347` §교차검증 합의 5). 시간 이벤트 계산
 * (`events/`) 이 같은 함수를 써서, 사건 시각의 위치와 카드 · 거리 자의 위치가 **같은 함수**에서 나온다. 식은 scene Kepler 경로
 * (`updateAtKepler`) 와 같다 — 부모 기준 `positionAt(orbit, jd, orbitMu(body, parent))` 의 체인 합, 시각 배율 미적용.
 *
 * **엔진 상태값 우선** — `getBodyState` 가 값을 주면(Newton · Barnes-Hut) 그 부모 기준 위치를 쓰고,
 * `null` 이면(Kepler, 엔진 미준비, WebGPU 의 비동기 velocities) 위 Kepler 식으로 떨어진다. 카드는
 * 화면에 그려진 위치와 같아야 하기 때문이다 — Kepler 식만 쓰면 Newton 모드에서 달-지구 거리가
 * 2.9% 어긋났다 (PR #1282 실측: 엔진 `354,781 km` ↔ Kepler `365,248 km`, 표시 `35.5만` ↔ `36.5만`).
 * 판정은 체인의 고리마다 한다 — 한 엔진 안에서는 모든 고리가 같은 쪽으로 간다.
 */
function resolveBodyChain(
  bodiesById: ReadonlyMap<string, LoadedCelestialBody>,
  id: string,
  jd: number,
  getBodyState: BodyStateFn | null,
): BodyChainPosition | null {
  return resolveBodyChainPosition(
    bodiesById,
    id,
    jd,
    getBodyState ? (bodyId, parentId) => getBodyState(bodyId, parentId)?.pos : null,
  );
}

/**
 * #1341 PR2 — 현재 시뮬레이션 시각 `jd` 의 계 중심 (태양) 기준 위치 [m]. 체인 미해석 · 미등록 id 면 `null`.
 * 식 · 출처 우선순위는 `resolveBodyChain` 과 같다 (엔진 상태값 우선 · Kepler 폴백 · 시각 배율 미적용).
 */
export function computeBodyWorldPosition(
  bodiesById: ReadonlyMap<string, LoadedCelestialBody>,
  id: string,
  jd: number,
  getBodyState: BodyStateFn | null = null,
): Vec3 | null {
  return resolveBodyChain(bodiesById, id, jd, getBodyState)?.world ?? null;
}

/**
 * #1341 PR2 — 두 천체 사이 물리 거리 [m] = `|world(A) − world(B)|` (ADR `20261015-1341` 결정 R3). 시각 배율 미적용 —
 * 화면 선 길이가 아니라 데이터 SSoT 거리다. 어느 한쪽이라도 체인 미해석이면 `null`.
 */
export function computeBodyPairDistance(
  bodiesById: ReadonlyMap<string, LoadedCelestialBody>,
  aId: string,
  bId: string,
  jd: number,
  getBodyState: BodyStateFn | null = null,
): number | null {
  const a = computeBodyWorldPosition(bodiesById, aId, jd, getBodyState);
  const b = computeBodyWorldPosition(bodiesById, bId, jd, getBodyState);
  if (a === null || b === null) return null;
  return Math.hypot(a[0] - b[0], a[1] - b[1], a[2] - b[2]);
}

/** 현재 시뮬레이션 시각 `jd` 의 태양·모체 거리. 위치는 `resolveBodyChain` (엔진 상태값 우선 · Kepler 폴백). */
export function computeBodyDistances(
  bodiesById: ReadonlyMap<string, LoadedCelestialBody>,
  id: string,
  jd: number,
  getBodyState: BodyStateFn | null = null,
): BodyDistances {
  const chain = resolveBodyChain(bodiesById, id, jd, getBodyState);
  if (chain === null) return { fromSunM: null, fromParentM: null };
  const { world, local } = chain;
  const body = bodiesById.get(id)!;

  const fromSunM = Math.hypot(world[0], world[1], world[2]);
  // 모체가 체인의 뿌리(태양)가 아닐 때만 위성 — 모체 거리가 태양 거리와 다른 정보가 된다.
  const parent = body.parentId != null ? bodiesById.get(body.parentId) : undefined;
  const fromParentM =
    local !== null && parent?.parentId != null ? Math.hypot(local[0], local[1], local[2]) : null;
  return { fromSunM, fromParentM };
}

/** id → body 조회 맵. */
export function indexBodies(
  bodies: readonly LoadedCelestialBody[],
): ReadonlyMap<string, LoadedCelestialBody> {
  return new Map(bodies.map((b) => [b.id, b]));
}
