/**
 * #1335 — 태양 코로나가 장면에 붙는 방식 (NullEngine 실 scene, ADR 20261014-1335 결정 2 · 4 · 5 · 6, DoD D4 · D9).
 *
 *  1. 로드 옵션 — `sunCorona` 미지정 = 생성 0 (core 기본 false, 게이트는 web 책임). true = `sun-corona` 1개.
 *  2. D4 기준계 — 재생 · 일시정지 + tier 전환 · 다른 천체 포커스 (earth) · 줌 각 단계에서, draw 가 실은 중심 = 같은 시점
 *     sun world 행렬 이동 성분, 반경 = sun high mesh `boundingBox.extendSizeWorld.x` (⚠️ `boundingSphere.radiusWorld` 는
 *     AABB 반대각이라 √3 R — ADR 1-A). 상대오차 ≤ 2⁻²³ (float32 기계 엡실론 — 새 임계 아님).
 *     전제 단언으로 공허 통과를 막는다 — 단계마다 scale 또는 origin 이 **실제로 바뀌었다** 는 것.
 *  3. 가시성 결합 (결정 4) — LOD 추종 (`isVisible`, 프레임 위상) 과 토글 (`setEnabled`) 이 서로를 덮지 않는다.
 *     LOD low → 코로나 `isVisible = false`, high 복귀 → 다시 true (재활성 경로).
 *  4. 지연 생성 · 멱등 · dispose.
 *
 * 픽스처는 `solar-system-scene-comet-tails.test.ts` 와 같다 (OffscreenCanvas 스텁 포함).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import { renderScaleForTier } from './tier.js';
import { SUN_CORONA_MESH_NAME } from './sun-corona.js';

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
  camera: ArcRotateCamera;
  handles: SolarSystemSceneHandles;
}
const fixtures: Fixture[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    f.handles.dispose();
    f.scene.dispose();
    f.engine.dispose();
  }
});

const J2000 = 2_451_545.0;
/** D4 한계 — float32 기계 엡실론 2⁻²³ (새 임계 아님). */
const FLOAT32_EPS = 2 ** -23;
/** LOD cross-fade 지속 (ms) 보다 충분히 긴 시간 진행 — fade 를 정착시킨다. */
const SETTLE_ADVANCE_MS = 10_000;

function makeScene(options: { sunCorona?: boolean } = {}): Fixture {
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
    initialJulianDate: J2000,
    ...(options.sunCorona === undefined ? {} : { sunCorona: options.sunCorona }),
  });
  const f = { engine, scene, camera, handles };
  fixtures.push(f);
  return f;
}

/** draw 경로를 태운 뒤 world 행렬 · bbox 기준과 대조한 상대오차. */
function measure(f: Fixture) {
  const corona = f.handles.getSunCorona()!;
  corona.mesh.onBeforeRenderObservable.notifyObservers(corona.mesh);
  const u = corona.readFrameUniforms()!;
  const sun = f.handles.meshes.get('sun')!;
  const t = sun.computeWorldMatrix(true).getTranslation();
  sun.refreshBoundingInfo();
  const radiusRef = sun.getBoundingInfo().boundingBox.extendSizeWorld.x;
  // 상대오차 = |차| / |기준|. world 행렬은 Float32Array 라 기준 자체가 float32 반올림을 품는다 — 그래서 한계가 float32
  // 기계 엡실론이다. 기준이 원점 (sun 포커스) 이면 차가 정확히 0 이어야 한다.
  const diff = Math.hypot(u.center[0] - t.x, u.center[1] - t.y, u.center[2] - t.z);
  const centerNorm = Math.hypot(t.x, t.y, t.z);
  const centerErr = diff === 0 ? 0 : diff / centerNorm;
  const radiusErr = Math.abs(u.radius - radiusRef) / radiusRef;
  return { u, centerErr, radiusErr, radiusRef };
}

/** 시간을 앞으로 돌려 LOD fade 를 정착시킨다 (프레임 위상 2회 — 전환 등록 · 정착). */
function settleLod(f: Fixture, level: 'high' | 'mid' | 'low' | 'auto') {
  let now = performance.now();
  vi.spyOn(performance, 'now').mockImplementation(() => now);
  f.handles.setLodOverride(level);
  f.handles.runFramePass();
  now += SETTLE_ADVANCE_MS;
  f.handles.runFramePass();
  vi.restoreAllMocks();
}

describe('#1335 — 태양 코로나 장면 통합', () => {
  it('sunCorona 미지정 → 생성 0 (core 기본 false) · 프레임 위상이 메시 없이도 돈다 (합의 2 — null 가드)', () => {
    const f = makeScene();
    expect(f.handles.getSunCorona()).toBeNull();
    expect(f.scene.getMeshByName(SUN_CORONA_MESH_NAME)).toBeNull();
    expect(() => {
      f.handles.runFramePass();
      settleLod(f, 'low');
      settleLod(f, 'auto');
    }).not.toThrow();
  });

  it('sunCorona: true → sun-corona 1개 · 활성 · 비선택', () => {
    const f = makeScene({ sunCorona: true });
    const meshes = f.scene.meshes.filter((m) => m.name === SUN_CORONA_MESH_NAME);
    expect(meshes).toHaveLength(1);
    expect(meshes[0]!.isEnabled()).toBe(true);
    expect(meshes[0]!.isPickable).toBe(false);
  });

  it('D4 — 재생 · 일시정지 tier 전환 · earth 포커스 · 줌 각 단계에서 중심 · 반경 상대오차 ≤ 2⁻²³', () => {
    const f = makeScene({ sunCorona: true });
    const check = (label: string) => {
      const { centerErr, radiusErr } = measure(f);
      expect(centerErr, `${label} center`).toBeLessThanOrEqual(FLOAT32_EPS);
      expect(radiusErr, `${label} radius`).toBeLessThanOrEqual(FLOAT32_EPS);
    };

    // (1) solar · 정지
    check('solar paused');
    expect(measure(f).u.scale).toBe(renderScaleForTier('solar'));
    const r0 = measure(f).u.radius;

    // (2) 재생 — 시간 진행 (태양은 SSB 기준 미세 이동)
    for (let k = 1; k <= 5; k += 1) {
      f.handles.updateAt(J2000 + k * 3);
      check(`playing solar step ${k}`);
    }

    // (3) 일시정지 중 earth 포커스 + body tier (시간 위상 없음)
    const centerBefore = measure(f).u.center;
    f.handles.setFocusOrigin('earth');
    f.handles.setTier('body');
    const afterTier = measure(f).u;
    expect(afterTier.scale, '전제: tier 스케일이 실제로 바뀌었다').toBe(renderScaleForTier('body'));
    expect(afterTier.radius, '전제: 반경이 실제로 바뀌었다').not.toBe(r0);
    check('paused earth focus body tier');

    // (4) body tier 재생 — origin 이 매 프레임 이동
    for (let k = 1; k <= 5; k += 1) {
      f.handles.updateAt(J2000 + 15 + k * 0.5);
      check(`playing body tier step ${k}`);
    }
    const centerAfter = measure(f).u.center;
    expect(
      Math.hypot(
        centerAfter[0] - centerBefore[0],
        centerAfter[1] - centerBefore[1],
        centerAfter[2] - centerBefore[2],
      ),
      '전제: 장면 원점이 실제로 바뀌었다',
    ).toBeGreaterThan(0);

    // (5) 줌 — 카메라 radius 4 구간 (기준계는 카메라와 무관해야 한다)
    for (const radius of [35, 25.3, 19.96, 4.53]) {
      f.camera.radius = radius;
      f.handles.runFramePass();
      check(`zoom radius ${radius}`);
    }

    // (6) 정지 상태에서 sun 포커스 + solar 복귀
    f.handles.setFocusOrigin('sun');
    f.handles.setTier('solar');
    expect(measure(f).u.scale).toBe(renderScaleForTier('solar'));
    check('paused back to solar sun focus');
  });

  it('렌더 경로 — scene.render() 가 draw 직전 observer 로 uniform 을 싣는다', () => {
    const f = makeScene({ sunCorona: true });
    f.handles.setTier('inner');
    f.scene.render();
    const { centerErr, radiusErr } = measure(f);
    expect(centerErr).toBeLessThanOrEqual(FLOAT32_EPS);
    expect(radiusErr).toBeLessThanOrEqual(FLOAT32_EPS);
  });
});

describe('#1335 결정 4 — 가시성 축 2개 (LOD isVisible · 토글 setEnabled) 가 서로를 덮지 않는다', () => {
  it('LOD low → 코로나 isVisible false · high 복귀 → true (프레임 위상이 재활성)', () => {
    const f = makeScene({ sunCorona: true });
    const corona = f.handles.getSunCorona()!;
    settleLod(f, 'high');
    expect(f.handles.meshes.get('sun')!.isVisible).toBe(true);
    expect(corona.mesh.isVisible).toBe(true);

    settleLod(f, 'low');
    expect(f.handles.meshes.get('sun')!.isVisible, '전제: sun high 가 실제로 숨었다').toBe(false);
    expect(corona.mesh.isVisible).toBe(false);
    // draw 경로가 돌아도 (observer) isVisible 을 건드리지 않는다.
    f.scene.render();
    expect(corona.mesh.isVisible).toBe(false);

    settleLod(f, 'high');
    expect(corona.mesh.isVisible).toBe(true);
  });

  it('LOD mid → 코로나 보임 (mid 도 rim 을 싣는 variant)', () => {
    const f = makeScene({ sunCorona: true });
    settleLod(f, 'mid');
    expect(f.handles.meshes.get('sun')!.isVisible).toBe(false);
    expect(f.scene.getMeshByName('sun-lod-mid')?.isVisible).toBe(true);
    expect(f.handles.getSunCorona()!.mesh.isVisible).toBe(true);
  });

  it('토글 OFF 중 LOD 가 바뀌어도 enabled 는 false 유지 · 토글 ON 시 LOD 상태 그대로 (LOD low 면 숨은 채)', () => {
    const f = makeScene({ sunCorona: true });
    const corona = f.handles.getSunCorona()!;
    f.handles.setSunCoronaVisible(false);
    expect(corona.mesh.isEnabled()).toBe(false);

    settleLod(f, 'low');
    expect(corona.mesh.isEnabled(), 'LOD 가 토글을 덮지 않는다').toBe(false);
    expect(corona.mesh.isVisible).toBe(false);
    settleLod(f, 'high');
    expect(corona.mesh.isEnabled(), 'LOD 가 토글을 덮지 않는다').toBe(false);
    expect(corona.mesh.isVisible).toBe(true);

    settleLod(f, 'low');
    f.handles.setSunCoronaVisible(true);
    expect(corona.mesh.isEnabled()).toBe(true);
    expect(corona.mesh.isVisible, '토글이 LOD 를 덮지 않는다').toBe(false);
    settleLod(f, 'high');
    expect(corona.mesh.isVisible).toBe(true);
  });

  it('꺼진 채 로드 → 처음 켤 때 1회 지연 생성 · 이후 setEnabled 만 (멱등) · LOD low 에서 켜도 즉시 숨김', () => {
    const f = makeScene({ sunCorona: false });
    f.handles.setSunCoronaVisible(false);
    expect(f.handles.getSunCorona()).toBeNull();

    settleLod(f, 'low');
    f.handles.setSunCoronaVisible(true);
    const created = f.handles.getSunCorona()!;
    expect(created).not.toBeNull();
    expect(created.mesh.isEnabled()).toBe(true);
    expect(created.mesh.isVisible, '지연 생성 직후 LOD 가시성 동기').toBe(false);

    const meshCount = f.scene.meshes.length;
    const materialCount = f.scene.materials.length;
    for (let i = 0; i < 3; i += 1) {
      f.handles.setSunCoronaVisible(false);
      f.handles.setSunCoronaVisible(true);
    }
    expect(f.handles.getSunCorona()).toBe(created);
    expect(f.scene.meshes.length).toBe(meshCount);
    expect(f.scene.materials.length).toBe(materialCount);
  });

  it('dispose — 메시 · 머티리얼 해제', () => {
    const f = makeScene({ sunCorona: true });
    const corona = f.handles.getSunCorona()!;
    const material = corona.material;
    f.handles.dispose();
    expect(f.scene.getMeshByName(SUN_CORONA_MESH_NAME)).toBeNull();
    expect(f.scene.materials.includes(material)).toBe(false);
    // afterEach 가 다시 dispose 하지 않게 fixture 에서 뺀다.
    fixtures.splice(fixtures.indexOf(f), 1);
    f.scene.dispose();
    f.engine.dispose();
  });
});
