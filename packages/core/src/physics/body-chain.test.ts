import { describe, expect, it } from 'vitest';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { heliocentricPositionAt, resolveBodyChainPosition } from './body-chain.js';
import { parentRelativePositionAt } from './orbit-elements-at.js';

/**
 * #1347 — 모체 체인 위치 (DoD M4 · 교차검증 합의 5). 사건 계산과 web 거리 계산이 이 함수 하나를 쓴다. 여기서는 그 함수가
 * scene Kepler 경로의 식 (부모 기준 위치의 체인 합) 과 같은 값을 내는지 본다.
 *
 * #1354 결정 M4 — 부모 기준 위치는 scene 과 같은 단일 함수 `parentRelativePositionAt` 이다 (달은 `lunarTheory` 이론
 * 위치 (#1404), 그 밖은 `positionAt(orbit, jd, orbitMu)` 그대로 — 후자의 비트 동일은 `orbit-elements-at.test.ts` I1 이
 * 단언한다).
 * 여기서는 체인 합만 본다.
 */

const bodies = getSolarSystem().bodies;
const bodiesById = new Map(bodies.map((b) => [b.id, b]));
/** M4 — 6 body × 3 시각. 위성 (달 · 카론) 은 체인 깊이 2. */
const PARITY_BODIES = ['earth', 'mars', 'venus', 'halley', 'moon', 'charon'] as const;
const PARITY_JDS = [2_415_020.5, 2_451_545.0, 2_488_069.5] as const;
const PARITY_RELATIVE_TOLERANCE = 1e-12;

/** 식 그대로의 손 전개 (체인 합). */
function handChain(id: string, jd: number): [number, number, number] {
  let cur = bodiesById.get(id)!;
  const out: [number, number, number] = [0, 0, 0];
  while (cur.parentId != null) {
    const parent = bodiesById.get(cur.parentId)!;
    const grandparent = parent.parentId == null ? null : bodiesById.get(parent.parentId)!;
    const p = parentRelativePositionAt(cur, parent, grandparent, jd);
    out[0] += p[0];
    out[1] += p[1];
    out[2] += p[2];
    cur = parent;
  }
  return out;
}

describe('resolveBodyChainPosition', () => {
  it.each(PARITY_BODIES.flatMap((id) => PARITY_JDS.map((jd) => [id, jd] as const)))(
    'M4 — %s @ JD %d 가 체인 손 전개와 상대오차 ≤ 1e-12',
    (id, jd) => {
      const got = heliocentricPositionAt(bodiesById, id, jd)!;
      const want = handChain(id, jd);
      const norm = Math.hypot(...want);
      expect(
        Math.hypot(got[0] - want[0], got[1] - want[1], got[2] - want[2]) / norm,
      ).toBeLessThanOrEqual(PARITY_RELATIVE_TOLERANCE);
    },
  );

  it('local 은 체인 첫 고리 (모체 기준) — 위성은 world ≠ local', () => {
    const r = resolveBodyChainPosition(bodiesById, 'moon', 2_451_545.0)!;
    const moon = bodiesById.get('moon')!;
    expect(r.local).toEqual([
      ...parentRelativePositionAt(
        moon,
        bodiesById.get('earth')!,
        bodiesById.get('sun')!,
        2_451_545.0,
      ),
    ]);
    expect(r.world).not.toEqual(r.local);
  });

  it('override 가 값을 주면 그 고리는 Kepler 대신 그 값', () => {
    const r = resolveBodyChainPosition(bodiesById, 'moon', 2_451_545.0, (bodyId) =>
      bodyId === 'moon' ? [1, 2, 3] : null,
    )!;
    expect(r.local).toEqual([1, 2, 3]);
    const earth = heliocentricPositionAt(bodiesById, 'earth', 2_451_545.0)!;
    expect(r.world).toEqual([earth[0] + 1, earth[1] + 2, earth[2] + 3]);
  });

  it('태양은 원점 · local null, 미등록 · 끊긴 체인은 null', () => {
    expect(resolveBodyChainPosition(bodiesById, 'sun', 2_451_545.0)).toEqual({
      world: [0, 0, 0],
      local: null,
    });
    expect(resolveBodyChainPosition(bodiesById, 'nope', 2_451_545.0)).toBeNull();
    const broken = new Map(bodiesById);
    broken.delete('earth');
    expect(resolveBodyChainPosition(broken, 'moon', 2_451_545.0)).toBeNull();
  });
});
