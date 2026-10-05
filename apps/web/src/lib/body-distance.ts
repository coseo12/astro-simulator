// #1281 — named import 필수 (`physics` namespace 경유 금지). `physics/index` → nbody-engine →
// physics_wasm `__dirname` 평가로 SSR 500 — 카드는 app-shell 직접 import 라 SSR 평가 대상이다.
// core/src/index.ts 가 positionAt 를 별도 named export 한다 (ADR `20260504-r-phase-allowlist-guard`
// §Amendment 결정 D1 패턴).
import { positionAt } from '@astro-simulator/core';
import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import type { LoadedCelestialBody } from './body-info';

export interface BodyDistances {
  /** 계 중심(모체 체인의 뿌리 = 태양)으로부터 거리 [m]. 체인 미해석 시 `null`. */
  fromSunM: number | null;
  /** 모체로부터 거리 [m]. 모체가 계 중심(태양)이면 태양 거리와 같으므로 `null` (위성만 값). */
  fromParentM: number | null;
}

type Vec3 = [number, number, number];

/** 모체 체인 최대 깊이 — 순환 parentId 데이터 결함 시 무한 루프 차단 (현 데이터 깊이 ≤ 2). */
const MAX_CHAIN_DEPTH = 8;

/**
 * 현재 시뮬레이션 시각 `jd` 의 태양·모체 거리.
 *
 * scene Kepler 경로(`solar-system-scene.ts` `updateAtKepler`)와 **같은 식**이다 — 부모 기준 위치
 * `positionAt(orbit, jd, G·M_parent)` 를 부모 체인을 따라 더해 계 중심 기준 위치를 얻는다.
 * 시각 과장 배율(`getOrbitVisualScale`)은 적용하지 않는다 — 데이터 SSoT 거리다
 * (principles §1 Visual Fidelity: 왜곡은 렌더 시점에만).
 *
 * Newton 엔진 경로와의 미세 차이는 표시 자릿수로 흡수된다고 본다 (이슈 #1281 §위험, 브라우저 1회 대조).
 */
export function computeBodyDistances(
  bodiesById: ReadonlyMap<string, LoadedCelestialBody>,
  id: string,
  jd: number,
): BodyDistances {
  const body = bodiesById.get(id);
  if (!body) return { fromSunM: null, fromParentM: null };

  const world: Vec3 = [0, 0, 0];
  let local: Vec3 | null = null;
  let cur: LoadedCelestialBody = body;
  for (let depth = 0; cur.parentId != null; depth += 1) {
    const parent = bodiesById.get(cur.parentId);
    // 체인이 끊기면 조용히 원점으로 흡수하지 않는다 — 호출부가 「계산 불가」로 표기.
    if (!parent || !cur.orbit || depth >= MAX_CHAIN_DEPTH) {
      return { fromSunM: null, fromParentM: null };
    }
    const p = positionAt(cur.orbit, jd, GRAVITATIONAL_CONSTANT * parent.mass);
    if (local === null) local = [p[0], p[1], p[2]];
    world[0] += p[0];
    world[1] += p[1];
    world[2] += p[2];
    cur = parent;
  }

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
