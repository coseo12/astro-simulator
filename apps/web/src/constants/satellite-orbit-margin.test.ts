import { describe, expect, it } from 'vitest';
import solarSystem from '@astro-simulator/shared/data/solar-system.json';
import { AU } from '@astro-simulator/shared/constants';
import { getOrbitVisualScale } from '@astro-simulator/core/scene';
import { getBodyScale } from './body-scale';

/**
 * #1299 — 위성 궤도 시각 배율 × **실제 bodyScale** 결합 마진 가드.
 *
 * ## 왜 web 에 있는가
 * 궤도 시각 배율 (`getOrbitVisualScale`) 은 core, bodyScale 은 web (`body-scale.ts`) 에 있고 core 는 web 을
 * import 할 수 없다 (core 는 `bodyScale` 콜백을 주입받는다 — `SolarSystemSceneOptions.bodyScale`). core 쪽 기존
 * 마진 테스트는 목성 반경을 jupiterScale=48 상수로 박아 #762 (48 → 129.3) 이후에도 통과했고, 그 사이 이오
 * 궤도 전체가 목성 렌더 구 안에 묻혔다 (#1299). 두 값을 모두 볼 수 있는 쪽이 web 이라 여기서 결합한다.
 *
 * ## 렌더 좌표 산식 (renderScale 은 모든 항에 공통이라 소거)
 *   - 모체·위성 렌더 반경 = `radius × bodyScale(id)` (`body-mesh-factory.ts` diameter 식)
 *   - 고리 렌더 반경 = `outerRadiusKm × 1000 × bodyScale(host)` (`solar-system-scene.ts` hostBodyScale 결합)
 *   - 위성 시각 궤도 = 실측 궤도 × `getOrbitVisualScale(parentId, id)` (`resolveWorld` · 궤도선 공통)
 *   - 근점 = a(1 − e), 원지점 = a(1 + e)
 *
 * 임계 1.5 는 R4~R12 가 공유해 온 분리 임계 (`orbit-visual-scale.ts` 헤더 — 「분리 임계 ≥ 1.5x」) 다.
 */

/** R4~R12 공통 분리 임계 (`orbit-visual-scale.ts` 산식 A 「≥ 1.5x」). */
const SEPARATION_MIN = 1.5;
const KM_M = 1000;

interface OrbitData {
  semiMajorAxisAU: number;
  eccentricity: number;
}
interface RingData {
  outerRadiusKm: number;
}
interface BodyData {
  id: string;
  parentId?: string | null;
  radius?: number;
  orbit?: OrbitData;
  rings?: RingData[];
}

const bodies = (solarSystem as { bodies: BodyData[] }).bodies;
const byId = new Map(bodies.map((b) => [b.id, b]));

const body = (id: string): BodyData => {
  const b = byId.get(id);
  if (!b) throw new Error(`solar-system.json 에 ${id} 없음`);
  return b;
};

/** 렌더 반경 (m, renderScale 소거) — 실반경 × 실제 bodyScale. */
const renderRadius = (id: string): number => {
  const r = body(id).radius;
  if (typeof r !== 'number' || !(r > 0)) throw new Error(`${id} radius 부재`);
  return r * getBodyScale(id);
};

const visualScale = (id: string): number => getOrbitVisualScale(body(id).parentId, id);

const orbitOf = (id: string): OrbitData => {
  const o = body(id).orbit;
  if (!o) throw new Error(`${id} orbit 부재`);
  return o;
};

/** 시각 근점 반경 (m) — 근점 × 시각 배율. */
const visualPeriapsis = (id: string): number => {
  const o = orbitOf(id);
  return o.semiMajorAxisAU * AU * (1 - o.eccentricity) * visualScale(id);
};

/** 시각 원지점 반경 (m) — 원지점 × 시각 배율. */
const visualApoapsis = (id: string): number => {
  const o = orbitOf(id);
  return o.semiMajorAxisAU * AU * (1 + o.eccentricity) * visualScale(id);
};

/** 모체 고리 중 가장 바깥 렌더 반경 (m). 고리 없으면 0. */
const ringOuterRenderRadius = (hostId: string): number => {
  const rings = body(hostId).rings ?? [];
  if (rings.length === 0) return 0;
  return Math.max(...rings.map((r) => r.outerRadiusKm * KM_M)) * getBodyScale(hostId);
};

/** 근점 마진 — 근점 × 배율 / (경계 반경 + 위성 렌더 반경). */
const periapsisMargin = (id: string, boundaryRadius: number): number =>
  visualPeriapsis(id) / (boundaryRadius + renderRadius(id));

/**
 * 안쪽 → 바깥 순서의 위성들이 궤도 띠로 겹치지 않는지 — 안쪽 (원지점 + 렌더 반경) < 바깥 (근점 − 렌더 반경).
 * 원반 반경까지 넣는 이유: 순서만 맞고 원반이 겹치면 정렬 순간 두 위성이 한 덩어리로 보인다.
 */
const expectOrbitBandsOrdered = (idsInnerToOuter: readonly string[]) => {
  for (let i = 1; i < idsInnerToOuter.length; i++) {
    const inner = idsInnerToOuter[i - 1]!;
    const outer = idsInnerToOuter[i]!;
    const innerEdge = visualApoapsis(inner) + renderRadius(inner);
    const outerEdge = visualPeriapsis(outer) - renderRadius(outer);
    expect(innerEdge, `${inner} 원지점 띠 < ${outer} 근점 띠`).toBeLessThan(outerEdge);
  }
};

const GALILEAN = ['io', 'europa', 'ganymede', 'callisto'] as const;
const SATURN_MOONS = ['enceladus', 'rhea', 'titan', 'iapetus'] as const;

describe('#1299 — 목성 갈릴레이 위성 (실제 bodyScale)', () => {
  it('D1 이오 근점 마진 ≥ 1.5 — 근점 × 배율 / (목성 렌더 반경 + 이오 렌더 반경)', () => {
    const margin = periapsisMargin('io', renderRadius('jupiter'));
    expect(margin).toBeGreaterThanOrEqual(SEPARATION_MIN);
  });

  it('갈릴레이 4개 전부 근점 마진 ≥ 1.5 (io 가 binding — 나머지는 자동 충족)', () => {
    for (const id of GALILEAN) {
      expect(periapsisMargin(id, renderRadius('jupiter')), id).toBeGreaterThanOrEqual(
        SEPARATION_MIN,
      );
    }
  });

  it('D2 궤도 순서 보존 — io < europa < ganymede < callisto (원지점·근점 + 원반 비중첩)', () => {
    expectOrbitBandsOrdered(GALILEAN);
  });
});

describe('#1299 — 토성 위성 (실제 bodyScale · 렌더 고리 반경)', () => {
  it('전제 — 토성은 고리를 렌더하고 고리 바깥이 토성 렌더 반경보다 크다 (binding = ring outer)', () => {
    expect(ringOuterRenderRadius('saturn')).toBeGreaterThan(renderRadius('saturn'));
  });

  it('D3 근점 시각 반경 ≥ 고리 바깥 렌더 반경 × 1.5 (4개 전부)', () => {
    const ringOuter = ringOuterRenderRadius('saturn');
    for (const id of SATURN_MOONS) {
      expect(visualPeriapsis(id), id).toBeGreaterThanOrEqual(ringOuter * SEPARATION_MIN);
    }
  });

  it('근점 마진 ≥ 1.5 — 근점 × 배율 / (고리 바깥 렌더 반경 + 위성 렌더 반경) (D3 보다 엄격)', () => {
    const ringOuter = ringOuterRenderRadius('saturn');
    for (const id of SATURN_MOONS) {
      expect(periapsisMargin(id, ringOuter), id).toBeGreaterThanOrEqual(SEPARATION_MIN);
    }
  });

  it('D3 궤도 순서 보존 — enceladus < rhea < titan < iapetus (원지점·근점 + 원반 비중첩)', () => {
    expectOrbitBandsOrdered(SATURN_MOONS);
  });
});

describe('#1299 재발 방지 — 모든 위성이 모체 렌더 구 밖', () => {
  // bodyScale 이 다시 바뀌어 어떤 위성 궤도든 모체 구 안으로 들어가면 여기서 FAIL 한다 (#762 → #1299 클래스).
  const satellites = bodies.filter(
    (b) => b.parentId && b.parentId !== 'sun' && b.orbit && typeof b.radius === 'number',
  );

  it('위성 표본이 비어 있지 않다 (공허 통과 방지)', () => {
    expect(satellites.length).toBeGreaterThanOrEqual(GALILEAN.length + SATURN_MOONS.length);
  });

  it('근점 마진 ≥ 1.5 — 근점 × 배율 / (모체 렌더 반경 + 위성 렌더 반경) (전 위성)', () => {
    for (const s of satellites) {
      expect(periapsisMargin(s.id, renderRadius(s.parentId!)), s.id).toBeGreaterThanOrEqual(
        SEPARATION_MIN,
      );
    }
  });
});
