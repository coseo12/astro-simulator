/**
 * #1354 결정 V1 — 율 보유 천체 (달) 궤도선 · 궤적이 장면에서 현재 시각 평균 요소를 따른다 (NullEngine 실 scene).
 *
 *  1. 로드 시각의 평균 요소로 그린다 (J2000 이외 시각으로 로드해도).
 *  2. Ω · ϖ 변화가 문턱 (`PRECESSING_ORBIT_LINE_THRESHOLD_RAD`) 미만이면 정점 불변, 넘으면 그 시각 요소로 갱신 —
 *     시각 점프도 같은 규칙. 메시는 재생성하지 않는다 (같은 객체 · 같은 `uniqueId` — ADR 1265 결정 3).
 *  3. tier 전환 재생성은 현재 시각 요소로.
 *  4. 율 없는 천체의 LineSystem 은 갱신 경로를 타지 않는다 (정점 바이트 동일).
 *  5. 궤적 — 달 사양을 현재 시각으로 다시 만든다 (머리 = 메시는 `solar-system-scene-trails.test.ts` D2 가 단언).
 *  6. 결정 M4 — 장면 달 메시 = 지구 메시 + 배율 × 체인 위치 local (장면이 `resolveBodyChainPosition` 과 같은 함수를 쓴다).
 *
 * 픽스처는 `solar-system-scene-trails.test.ts` 와 같다 (OffscreenCanvas 스텁 포함).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3, VertexBuffer } from '@babylonjs/core';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { toScene, toSceneZ } from '../coords/scene-handedness.js';
import { resolveBodyChainPosition } from '../physics/body-chain.js';
import { orbitMu, positionAt } from '../physics/kepler.js';
import { elementsAt } from '../physics/orbit-elements-at.js';
import { clockJdToTt } from '../time/delta-t.js';
import { sampleOrbitPoints } from './orbit-sampling.js';
import { getOrbitVisualScale } from './orbit-visual-scale.js';
import {
  PRECESSING_ORBIT_LINE_THRESHOLD_RAD,
  createSolarSystemScene,
  type SolarSystemSceneHandles,
} from './solar-system-scene.js';

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
});

const J2000 = 2_451_545.0;
const DEG = Math.PI / 180;
const MOON_LINE = 'satellite-orbit-line-earth';
const system = getSolarSystem();
const bodiesById = new Map(system.bodies.map((b) => [b.id, b] as const));
const moon = bodiesById.get('moon')!;
/** ϖ̇ [rad/일] — 문턱에 먼저 닿는 쪽 (|ϖ̇| `0.111°/일` > |Ω̇| `0.053°/일`). */
const perihelionRate = moon.orbit!.rates!.longitudeOfPerihelion;
/** 문턱에 닿기까지의 일 수 (ϖ 기준). */
const daysToThreshold = PRECESSING_ORBIT_LINE_THRESHOLD_RAD / Math.abs(perihelionRate);

function makeScene(initialJulianDate = J2000): Fixture {
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
    surfaceDetail: false,
    starfield: false,
    initialJulianDate,
  });
  const f = { engine, scene, handles };
  fixtures.push(f);
  return f;
}

function positionsOf(f: Fixture, name: string): Float32Array {
  const mesh = f.scene.getMeshByName(name);
  if (!mesh) throw new Error(`${name} 없음`);
  return Float32Array.from(mesh.getVerticesData(VertexBuffer.PositionKind)!);
}

/**
 * 기대 정점 — `rebuildOrbitLines` 와 같은 식 (그 시각 요소 × 위성 배율 → 장면 경계 z 반전 #1366), float32.
 * #1370 — `clockJd` 는 장면에 넘긴 시계 시각이다. 요소는 TT (`clockJdToTt`) 에서 만든다 (장면과 같은 변환).
 */
function expectedMoonLine(f: Fixture, clockJd: number): Float32Array {
  const scale = getOrbitVisualScale('earth', 'moon');
  const pts = sampleOrbitPoints(moon, f.handles.getTier(), clockJdToTt(clockJd))!;
  return Float32Array.from(pts.flatMap((p) => [p.x * scale, p.y * scale, toSceneZ(p.z * scale)]));
}

describe('#1354 V1 — 달 궤도선 정점 갱신 (장면)', () => {
  it('문턱 전제 — 0.5° (ϖ 기준 4.49 일 지연, PR 본문 실측)', () => {
    expect(PRECESSING_ORBIT_LINE_THRESHOLD_RAD).toBe(0.5 * DEG);
    expect(daysToThreshold).toBeCloseTo(4.49, 2);
  });

  it('로드 시각의 평균 요소로 그린다 — J2000 이외 시각 로드', () => {
    const jd = J2000 + 9_000;
    const f = makeScene(jd);
    expect(positionsOf(f, MOON_LINE)).toEqual(expectedMoonLine(f, jd));
    // 판별력 — 데이터 epoch 선과 다르다.
    expect(positionsOf(f, MOON_LINE)).not.toEqual(expectedMoonLine(f, J2000));
  });

  it('문턱 미만 진행은 정점 불변 · 넘으면 그 시각 요소로 갱신 (같은 메시 객체)', () => {
    const f = makeScene();
    const mesh = f.scene.getMeshByName(MOON_LINE)!;
    const uid = mesh.uniqueId;
    const atLoad = positionsOf(f, MOON_LINE);
    const before = Math.floor(daysToThreshold);
    f.handles.updateAt(J2000 + before);
    expect(positionsOf(f, MOON_LINE)).toEqual(atLoad);
    f.handles.updateAt(J2000 + before + 1);
    expect(positionsOf(f, MOON_LINE)).toEqual(expectedMoonLine(f, J2000 + before + 1));
    expect(positionsOf(f, MOON_LINE)).not.toEqual(atLoad);
    expect(f.scene.getMeshByName(MOON_LINE)).toBe(mesh);
    expect(mesh.uniqueId).toBe(uid);
  });

  it('시각 점프 (역방향 포함) 도 같은 규칙 — 점프 시각 요소', () => {
    const f = makeScene();
    for (const jd of [J2000 + 36_000, J2000 - 30_000, J2000 + 0.25]) {
      f.handles.updateAt(jd);
      // J2000 + 0.25 는 직전 (−30,000 일) 요소 대비 문턱을 넘으므로 갱신된다.
      expect(positionsOf(f, MOON_LINE)).toEqual(expectedMoonLine(f, jd));
    }
  });

  it('tier 전환 재생성은 현재 시각 요소로', () => {
    const f = makeScene();
    const jd = J2000 + 5_000;
    f.handles.updateAt(jd);
    const other = f.handles.getTier() === 'solar' ? 'inner' : 'solar';
    f.handles.setTier(other);
    expect(f.handles.getTier()).toBe(other);
    expect(positionsOf(f, MOON_LINE)).toEqual(expectedMoonLine(f, jd));
  });

  it('율 없는 천체의 궤도선은 시각과 무관하게 바이트 동일 (갱신 경로 밖)', () => {
    const f = makeScene();
    const names = ['orbit-lines', 'satellite-orbit-line-mars', 'satellite-orbit-line-jupiter'];
    const before = names.map((n) => positionsOf(f, n));
    f.handles.updateAt(J2000 + 36_000);
    names.forEach((n, i) => expect(positionsOf(f, n), n).toEqual(before[i]));
  });

  it('궤적 — 달 사양을 현재 시각 요소로 다시 만든다 (율 없는 천체 사양은 로드 사양 그대로)', () => {
    const f = makeScene();
    const jd = J2000 + 7_000;
    f.handles.updateAt(jd);
    const loadSpecs = f.handles.getTrailBodySpecs().map((s) => ({ ...s }));
    f.handles.setTrailsVisible(true);
    const specs = f.handles.getTrailBodySpecs();
    const moonSpec = specs.find((s) => s.id === 'moon')!;
    // #1370 — 궤적 사양 epoch 는 장면 위치 시각 (TT).
    expect(moonSpec.epoch).toBe(clockJdToTt(jd));
    const el = elementsAt(moon.orbit!, clockJdToTt(jd));
    expect(moonSpec.meanAnomalyAtEpoch).toBe(el.meanAnomalyAtEpoch);
    for (const s of specs)
      if (s.id !== 'moon') expect(s).toEqual(loadSpecs.find((x) => x.id === s.id));
  });
});

/**
 * PR #1356 리뷰 권고 1 — 결정 M4 (장면 · 체인 위치 단일 함수) 의 장면 쪽 단언. 장면 `updateAtKepler` 를 고정 요소
 * `positionAt(body.orbit, …)` 로 되돌려도 위 테스트들은 통과한다 (궤적 머리는 메시에 묶이고 궤도선 테스트는 메시를 보지
 * 않는다). 여기서는 J2000 이외 시각에서 달 메시 위치 자체를 체인 위치와 대조한다.
 */
describe('#1354 결정 M4 — 장면 달 메시 = 지구 메시 + 배율 × resolveBodyChainPosition local', () => {
  /** J2000 + 9,000.5 일 (2024-08) — 율 · 주기 항이 모두 0 이 아닌 시각. */
  const JD = J2000 + 9_000.5;
  /**
   * 허용 — 지구 일심 거리 (`~1.5e11 m`) 에 대한 상대 `1e-6` (`~150 km`, 장면 단위로는 배율을 곱한 값). 메시 위치는
   * float32 라 성분당 `~6e-8 × 1.5e11 ≈ 9 km` 반올림이 들어간다. 고정 요소 경로와의 차 (아래 양성 대조) 는 이보다 세
   * 자릿수 이상 크다.
   */
  const RELATIVE_TOLERANCE = 1e-6;

  function moonMinusEarthMesh(f: Fixture): [number, number, number] {
    const m = f.handles.meshes.get('moon')!.position;
    const e = f.handles.meshes.get('earth')!.position;
    return [m.x - e.x, m.y - e.y, m.z - e.z];
  }

  it('Kepler 장면 — 달 메시 − 지구 메시 = scale × 배율 × local (체인 위치)', () => {
    const f = makeScene();
    f.handles.updateAt(JD);
    const { scale } = f.handles.getBodyReferenceFrame();
    const visualScale = getOrbitVisualScale('earth', 'moon');
    // #1370 — `updateAt(JD)` 의 JD 는 장면 시계, 체인 위치 (물리 함수) 는 TT 에서.
    const ttJd = clockJdToTt(JD);
    const local = resolveBodyChainPosition(bodiesById, 'moon', ttJd)!.local!;
    const earthWorld = resolveBodyChainPosition(bodiesById, 'earth', ttJd)!.world;
    // #1366 — 체인 위치는 데이터 공간, 메시 차는 장면 공간 (z 반전).
    const expected = toScene(local).map((x) => x * visualScale * scale);
    const got = moonMinusEarthMesh(f);
    const tolerance = RELATIVE_TOLERANCE * Math.hypot(...earthWorld) * scale;
    const err = Math.hypot(got[0] - expected[0]!, got[1] - expected[1]!, got[2] - expected[2]!);
    expect(err).toBeLessThanOrEqual(tolerance);

    // 양성 대조 — 고정 요소 (V0) 경로라면 같은 자리에서 허용의 1,000 배 넘게 벗어난다.
    const v0Local = positionAt(moon.orbit!, ttJd, orbitMu(moon, bodiesById.get('earth')!));
    const v0 = toScene(v0Local).map((x) => x * visualScale * scale);
    expect(Math.hypot(got[0] - v0[0]!, got[1] - v0[1]!, got[2] - v0[2]!)).toBeGreaterThan(
      tolerance * 1_000,
    );
  });
});
