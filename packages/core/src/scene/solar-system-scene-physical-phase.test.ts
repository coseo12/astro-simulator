/**
 * #1360 결정 G3 · G4 — 물리 위치 출처 (`getPhysicalLocal`) 와 달 위상 기준점 (NullEngine 실 scene).
 *
 * ADR `docs/decisions/20261018-1360-moon-phase-eclipse-shadows.md`:
 *  - DoD D2 — 위성 배율 (`getOrbitVisualScale`) 을 30 · 1 로 바꿔도 `getPhysicalLocal('moon')` 이 비트 동일. N-body 경로는
 *    엔진 위치의 차를 같은 함수로 읽는다. ⚠️ 이 테스트가 고정하는 것은 「배율과의 독립」 이 아니라 **배율이 Kepler 경로의
 *    `resolveWorld` 에서만 곱해진다는 현재 구조에 대한 의존**이다 — N-body 경로가 배율을 곱하게 바뀌면 여기가 FAIL 한다.
 *  - DoD D6 — 달 절차 머티리얼 onBind 의 `uSunDirection` 이 물리 기준점 (태양 − 체인 위치 달) 방향과 이루는 각 `≤ 1e-4°`
 *    (JD 5개 — ADR §1-B 표). 현행 (메시 기준) 은 같은 JD 에서 이 허용의 수천 배 벗어난다 (양성 대조).
 *
 * 픽스처는 `solar-system-scene-lunar-orbit-line.test.ts` 와 같다 (OffscreenCanvas 스텁 포함).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import {
  ArcRotateCamera,
  NullEngine,
  Scene,
  Vector3,
  type Mesh,
  type PointLight,
} from '@babylonjs/core';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { toScene } from '../coords/scene-handedness.js';
import { resolveBodyChainPosition } from '../physics/body-chain.js';
import {
  PHYSICAL_PHASE_BODY_IDS,
  createSolarSystemScene,
  type SolarSystemSceneHandles,
} from './solar-system-scene.js';
import type * as OrbitVisualScaleModule from './orbit-visual-scale.js';

/** 위성 배율 덮어쓰기 — `null` 이면 실제 값. 장면이 쓰는 모든 배율 호출을 덮는다 (D2). */
const scaleOverride = vi.hoisted(() => ({ value: null as number | null }));
vi.mock('./orbit-visual-scale.js', async (importOriginal) => {
  const actual = await importOriginal<typeof OrbitVisualScaleModule>();
  return {
    ...actual,
    getOrbitVisualScale: (parentId: string | null | undefined, bodyId?: string | null) =>
      scaleOverride.value ?? actual.getOrbitVisualScale(parentId, bodyId),
  };
});

class StubOffscreenCanvas {
  constructor(
    public width: number,
    public height: number,
  ) {}
  getContext(): unknown {
    return new Proxy({} as Record<string | symbol, unknown>, {
      get: (target, key) =>
        key in target ? target[key] : () => ({ data: new Uint8ClampedArray(4) }),
      set: (target, key, value) => {
        target[key] = value;
        return true;
      },
    });
  }
}
const globalWithCanvas = globalThis as { OffscreenCanvas?: unknown };
let savedOffscreenCanvas: unknown;
beforeAll(() => {
  savedOffscreenCanvas = globalWithCanvas.OffscreenCanvas;
  globalWithCanvas.OffscreenCanvas = StubOffscreenCanvas;
});
afterAll(() => {
  globalWithCanvas.OffscreenCanvas = savedOffscreenCanvas;
});

interface Fixture {
  engine: NullEngine;
  scene: Scene;
  handles: SolarSystemSceneHandles;
}
const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.handles.dispose();
    f.scene.dispose();
    f.engine.dispose();
  }
  scaleOverride.value = null;
});

const J2000 = 2_451_545.0;
const RAD_TO_DEG = 180 / Math.PI;
/** ADR §1-B 표의 JD 5개 — 위상 `k_phys` 0.03 ~ 0.98 을 고루 지난다. */
const PHASE_JDS = [2_451_545, 2_451_552, 2_451_559.5, 2_451_566, 2_461_331.5] as const;
/** DoD D6 허용 — 물리 기준점 방향과의 각 [°]. */
const D6_TOLERANCE_DEG = 1e-4;
/** 양성 대조 — 현행 (메시 기준) 이 D6 허용보다 이만큼 이상 벗어나야 D6 가 판별력을 가진다. */
const D6_DISCRIMINATION_FACTOR = 100;

const system = getSolarSystem();
const bodiesById = new Map(system.bodies.map((b) => [b.id, b] as const));

function makeScene(opts: { jd?: number; surfaceDetail?: boolean } = {}): Fixture {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 800,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera('cam', 0, Math.PI / 3, 35, Vector3.Zero(), scene);
  scene.activeCamera = camera;
  const handles = createSolarSystemScene(scene, {
    surfaceDetail: opts.surfaceDetail ?? false,
    starfield: false,
    initialJulianDate: opts.jd ?? J2000,
  });
  const f = { engine, scene, handles };
  fixtures.push(f);
  return f;
}

function bitsEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

function angleDeg(a: Vector3, b: readonly number[]): number {
  const bv = new Vector3(b[0]!, b[1]!, b[2]!);
  const c = Vector3.Dot(a.normalizeToNew(), bv.normalizeToNew());
  return Math.acos(Math.min(1, Math.max(-1, c))) * RAD_TO_DEG;
}

/**
 * 절차 머티리얼 onBind 를 1회 돌리고 `uSunDirection` 을 읽는다 (cloud-layer.test.ts 와 같은 방식).
 *
 * `incrementRenderId` 로 새 프레임을 흉내 낸다 — Babylon `computeWorldMatrix` 는 같은 render id 안에서 캐시를 돌려주므로
 * (`transformNode.pure.js` — `_currentRenderId === currentRenderId`), render 없이 `updateAt` 만 돌린 테스트에서는
 * `getAbsolutePosition` 이 생성 시점 값에 머문다. 실제 draw 는 매 프레임 render id 가 오른 뒤 bind 된다.
 */
function boundSunDirection(f: Fixture, meshName: string): Vector3 {
  const mesh = f.scene.getMeshByName(meshName) as Mesh | null;
  if (!mesh?.material) throw new Error(`${meshName} 머티리얼 없음`);
  f.scene.incrementRenderId();
  mesh.material.onBindObservable.notifyObservers(mesh);
  const vectors = (mesh.material as unknown as { _vectors3: Record<string, Vector3> })._vectors3;
  return vectors.uSunDirection!.clone();
}

/**
 * 물리 기준 태양 방향 — 장면과 무관한 체인 위치 (`resolveBodyChainPosition`, 배율 미적용) 로 만든다.
 * #1366 — 체인 위치는 데이터 공간이고 셰이더 uniform 은 장면 공간이라 `toScene` (장면 경계 z 반전) 으로 옮겨 비교한다.
 */
function physicalSunDirection(jd: number): readonly [number, number, number] {
  const moon = resolveBodyChainPosition(bodiesById, 'moon', jd)!.world;
  const sun = resolveBodyChainPosition(bodiesById, 'sun', jd)!.world;
  return toScene([sun[0] - moon[0], sun[1] - moon[1], sun[2] - moon[2]]);
}

/** 현행 (결함판) 기준 — 태양 광원 위치 − 달 메시 위치 (장면 단위). */
function meshSunDirection(f: Fixture): [number, number, number] {
  const sun = (f.scene.getLightByName('sun-light') as PointLight).position;
  const moon = f.handles.meshes.get('moon')!.getAbsolutePosition();
  return [sun.x - moon.x, sun.y - moon.y, sun.z - moon.z];
}

describe('#1360 G3 — getPhysicalLocal (배율 전 물리 위치) · DoD D2', () => {
  it('Kepler — 배율 30 ↔ 1 에서 달 물리 위치 비트 동일 · 메시 위치는 달라진다 (양성 대조)', () => {
    const jd = J2000 + 9_000.5;
    scaleOverride.value = 30;
    const a = makeScene({ jd });
    a.handles.updateAt(jd);
    scaleOverride.value = 1;
    const b = makeScene({ jd });
    b.handles.updateAt(jd);

    const pa = [...a.handles.getPhysicalLocal('moon')];
    const pb = [...b.handles.getPhysicalLocal('moon')];
    expect(bitsEqual(pa, pb)).toBe(true);
    // 값 자체도 체인 위치 local 과 비트 동일 — 장면이 같은 함수 (`parentRelativePositionAt`) 를 쓴다 (#1354 M4).
    expect(bitsEqual(pa, resolveBodyChainPosition(bodiesById, 'moon', jd)!.local!)).toBe(true);

    // 양성 대조 — 메시 (화면) 위치는 배율을 따른다. 이것이 같으면 위 단언은 판별력이 없다.
    const rel = (f: Fixture) => {
      const m = f.handles.meshes.get('moon')!.position;
      const e = f.handles.meshes.get('earth')!.position;
      return [m.x - e.x, m.y - e.y, m.z - e.z];
    };
    const ra = rel(a);
    const rb = rel(b);
    expect(Math.hypot(...ra) / Math.hypot(...rb)).toBeCloseTo(30, 3);
  });

  it('뿌리 천체 · 미등록 id 는 [0, 0, 0] · 반환값은 사본 (내부 버퍼 비노출)', () => {
    const f = makeScene();
    expect(f.handles.getPhysicalLocal('sun')).toEqual([0, 0, 0]);
    expect(f.handles.getPhysicalLocal('no-such-body')).toEqual([0, 0, 0]);
    const first = f.handles.getPhysicalLocal('moon') as unknown as number[];
    first[0] = Number.NaN;
    expect(Number.isNaN(f.handles.getPhysicalLocal('moon')[0])).toBe(false);
  });

  it('N-body — 엔진 상태의 달 − 지구를 같은 함수로 읽는다 · 배율 30 ↔ 1 비트 동일', () => {
    const run = (scale: number) => {
      scaleOverride.value = scale;
      const f = makeScene();
      f.handles.updateAt(J2000);
      f.handles.setPhysicsEngine('newton');
      f.handles.updateAt(J2000 + 10);
      expect(f.handles.getPhysicsEngine()).toBe('newton');
      return f;
    };
    const a = run(30);
    const b = run(1);
    const pa = [...a.handles.getPhysicalLocal('moon')];
    const pb = [...b.handles.getPhysicalLocal('moon')];
    expect(bitsEqual(pa, pb)).toBe(true);
    // 엔진 상태 (`getBodyState` — 같은 positions 배열의 차) 와 비트 동일.
    expect(bitsEqual(pa, a.handles.getBodyState('moon', 'earth')!.pos)).toBe(true);
    // 경로 분기 판별 — N-body 값은 같은 시각의 Kepler 체인 위치와 다르다 (적분 vs 해석해).
    expect(bitsEqual(pa, resolveBodyChainPosition(bodiesById, 'moon', J2000 + 10)!.local!)).toBe(
      false,
    );
  });
  it('N-body → Kepler 복귀 — 다시 Kepler 배율 전 위치 (체인 local) 와 비트 동일 · 배율 30 ↔ 1 비트 동일', () => {
    // 초기값이 'kepler' 라서, 복귀 경로를 밟지 않으면 `updateAt` Kepler 분기의 `positionSource = 'kepler'` 대입이
    // 빠져도 다른 테스트는 통과한다 (PR #1364 리뷰 변이 MX6). 대입이 빠지면 복귀 뒤에도 N-body 분기가
    // `world[moon] − world[earth] = local × 배율` 을 읽는다.
    const jd = J2000 + 20;
    const run = (scale: number) => {
      scaleOverride.value = scale;
      const f = makeScene();
      f.handles.updateAt(J2000);
      f.handles.setPhysicsEngine('newton');
      f.handles.updateAt(J2000 + 10);
      f.handles.setPhysicsEngine('kepler');
      f.handles.updateAt(jd);
      expect(f.handles.getPhysicsEngine()).toBe('kepler');
      return [...f.handles.getPhysicalLocal('moon')];
    };
    const a = run(30);
    const b = run(1);
    expect(bitsEqual(a, resolveBodyChainPosition(bodiesById, 'moon', jd)!.local!)).toBe(true);
    expect(bitsEqual(a, b)).toBe(true);
  });
});

describe('#1360 G4 — 달 uSunDirection 물리 기준점 · DoD D6', () => {
  it('기준점 대상은 달 하나 (결정 G4 — 달 전용)', () => {
    expect([...PHYSICAL_PHASE_BODY_IDS]).toEqual(['moon']);
  });

  for (const jd of PHASE_JDS) {
    it(`JD ${jd} — 물리 기준점 방향과 각 ≤ ${D6_TOLERANCE_DEG}° · 현행 메시 기준은 ×${D6_DISCRIMINATION_FACTOR} 넘게 벗어남`, () => {
      const f = makeScene({ jd, surfaceDetail: true });
      f.handles.updateAt(jd);
      const expected = physicalSunDirection(jd);
      const got = boundSunDirection(f, 'moon');
      expect(angleDeg(got, expected)).toBeLessThanOrEqual(D6_TOLERANCE_DEG);
      // 양성 대조 — 메시 (화면) 기준 방향은 물리 방향과 크게 다르다 (ADR §1-B, 최대 4.576°).
      expect(angleDeg(got, meshSunDirection(f))).toBeGreaterThan(
        D6_TOLERANCE_DEG * D6_DISCRIMINATION_FACTOR,
      );
    });
  }

  it('body tier · 달 포커스 (floating origin = 달) 에서도 같은 각 허용', () => {
    const jd = PHASE_JDS[2];
    const f = makeScene({ jd, surfaceDetail: true });
    f.handles.updateAt(jd);
    f.handles.setTier('body');
    f.handles.setFocusOrigin('moon');
    f.handles.updateAt(jd);
    expect(f.handles.getTier()).toBe('body');
    expect(angleDeg(boundSunDirection(f, 'moon'), physicalSunDirection(jd))).toBeLessThanOrEqual(
      D6_TOLERANCE_DEG,
    );
  });

  it('지구 (기준점 대상 아님) 는 현행 그대로 — 태양 광원 − 지구 메시 방향', () => {
    const jd = PHASE_JDS[0];
    const f = makeScene({ jd, surfaceDetail: true });
    f.handles.updateAt(jd);
    const got = boundSunDirection(f, 'earth');
    const sun = (f.scene.getLightByName('sun-light') as PointLight).position;
    const earth = f.handles.meshes.get('earth')!.getAbsolutePosition();
    expect(angleDeg(got, [sun.x - earth.x, sun.y - earth.y, sun.z - earth.z])).toBeLessThan(1e-9);
  });

  it('N-body — 기준점 = 달 메시 (이 경로는 배율을 곱하지 않아 물리 위치 = 메시 위치)', () => {
    const f = makeScene({ surfaceDetail: true });
    f.handles.updateAt(J2000);
    f.handles.setPhysicsEngine('newton');
    f.handles.updateAt(J2000 + 10);
    expect(f.handles.getPhysicsEngine()).toBe('newton');
    // 메시 기준 방향과 float32 메시 위치 반올림 수준에서 일치.
    expect(angleDeg(boundSunDirection(f, 'moon'), meshSunDirection(f))).toBeLessThanOrEqual(
      D6_TOLERANCE_DEG,
    );
  });
});
