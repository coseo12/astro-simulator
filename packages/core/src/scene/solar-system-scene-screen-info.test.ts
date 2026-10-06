/**
 * #1293 — `getBodyScreenInfo()` (라벨용 화면 투영 pull API) 를 NullEngine scene 에서 잰다.
 *
 * 기준은 Babylon `Vector3.Project` (body-picking 의 화면거리 fallback 이 쓰는 식) 이다 — 라벨이 picking 과 같은
 * 화면 좌표계를 쓰는지가 D4 의 전제다. CSS px 환산은 `getHardwareScalingLevel` 을 고정해 따로 잰다.
 *
 * 절차 표면 · 별 배경을 끈다 — 이 테스트의 판정 대상이 아니고 좌표는 그 옵션과 무관하다. LOD low 의 billboard
 * alpha mask 가 `DynamicTexture` 를 만들어 node 에서 `OffscreenCanvas` 가 필요하다 — 2D 호출을 삼키는 스텁만 둔다
 * (`solar-system-scene-display-toggles.test.ts` 와 같은 처리).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, Matrix, NullEngine, Scene, Vector3, Viewport } from '@babylonjs/core';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';

const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 720;

interface Fixture {
  engine: NullEngine;
  scene: Scene;
  handles: SolarSystemSceneHandles;
}

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

const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.handles.dispose();
    f.scene.dispose();
    f.engine.dispose();
  }
  vi.restoreAllMocks();
});

function makeScene(): Fixture {
  const engine = new NullEngine({
    renderWidth: RENDER_WIDTH,
    renderHeight: RENDER_HEIGHT,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 3, 50, Vector3.Zero(), scene);
  const handles = createSolarSystemScene(scene, { surfaceDetail: false, starfield: false });
  const f = { engine, scene, handles };
  fixtures.push(f);
  return f;
}

/** 렌더 루프 1틱과 같은 순서 — 프레임 위상 → render (행렬 갱신). */
function tick(f: Fixture) {
  f.handles.runFramePass();
  f.scene.render();
}

describe('#1293 getBodyScreenInfo', () => {
  it('runLodPass 전에는 빈 배열', () => {
    const f = makeScene();
    expect(f.handles.getBodyScreenInfo()).toHaveLength(0);
  });

  it('행 = getLodInfo 행 (id 순서 동일) · 좌표 = Vector3.Project (hardwareScaling 1)', () => {
    const f = makeScene();
    tick(f);
    const info = f.handles.getBodyScreenInfo();
    const lod = f.handles.getLodInfo();
    expect(info.map((r) => r.id)).toEqual(lod.map((r) => r.id));
    expect(info.length).toBeGreaterThan(0);

    const viewport = new Viewport(0, 0, RENDER_WIDTH, RENDER_HEIGHT);
    for (const row of info) {
      if (!row.inFront) continue;
      const mesh = f.handles.meshes.get(row.id)!;
      const p = Vector3.Project(
        mesh.getAbsolutePosition(),
        Matrix.Identity(),
        f.scene.getTransformMatrix(),
        viewport,
      );
      expect(row.x).toBeCloseTo(p.x, 2);
      expect(row.y).toBeCloseTo(p.y, 2);
      expect(row.cameraDistance).toBeCloseTo(
        Vector3.Distance(f.scene.activeCamera!.globalPosition, mesh.getAbsolutePosition()),
        6,
      );
    }
    // 태양은 카메라 target (원점) — 화면 중앙.
    const sun = info.find((r) => r.id === 'sun')!;
    expect(sun.onScreen).toBe(true);
    expect(sun.x).toBeCloseTo(RENDER_WIDTH / 2, 1);
    expect(sun.y).toBeCloseTo(RENDER_HEIGHT / 2, 1);
  });

  it('CSS px 환산 — hardwareScalingLevel 0.5 (DPR 2) 면 좌표·반지름이 엔진 px 의 절반', () => {
    const f = makeScene();
    tick(f);
    const engineRows = f.handles.getBodyScreenInfo().map((r) => ({ ...r }));
    vi.spyOn(f.engine, 'getHardwareScalingLevel').mockReturnValue(0.5);
    const cssRows = f.handles.getBodyScreenInfo();
    const lod = f.handles.getLodInfo();
    cssRows.forEach((row, i) => {
      const e = engineRows[i]!;
      expect(row.id).toBe(e.id);
      if (row.inFront) {
        expect(row.x).toBeCloseTo(e.x / 2, 6);
        expect(row.y).toBeCloseTo(e.y / 2, 6);
      }
      expect(row.radius).toBeCloseTo(lod[i]!.screenCoverage * 0.5, 9);
    });
  });

  it('embeddedInParent = 렌더된 위성 구가 렌더된 모체 구 안에 완전히 들어감 (메시 실측 반경 · 모든 행)', () => {
    const f = makeScene();
    tick(f);
    const radius = (id: string) => {
      const m = f.handles.meshes.get(id)!;
      return m.getBoundingInfo().boundingBox.extendSize.x * Math.abs(m.absoluteScaling.x);
    };
    const info = new Map(f.handles.getBodyScreenInfo().map((r) => [r.id, r]));
    let withParent = 0;
    // 모체 관계는 데이터 SSoT 에서 — 판정식을 독립적으로 다시 계산해 대조한다.
    for (const b of getSolarSystem().bodies) {
      const row = info.get(b.id);
      if (!row) continue;
      if (!b.parentId) {
        expect(row.embeddedInParent).toBe(false);
        continue;
      }
      const c = f.handles.meshes.get(b.id)!.getAbsolutePosition();
      const p = f.handles.meshes.get(b.parentId)!.getAbsolutePosition();
      expect(row.embeddedInParent).toBe(
        Vector3.Distance(c, p) + radius(b.id) <= radius(b.parentId),
      );
      withParent += 1;
    }
    expect(withParent).toBeGreaterThan(0);
  });

  it('onScreen = inFront ∧ 중심이 캔버스 안 (모든 행)', () => {
    const f = makeScene();
    tick(f);
    for (const row of f.handles.getBodyScreenInfo()) {
      const inside = row.x >= 0 && row.x <= RENDER_WIDTH && row.y >= 0 && row.y <= RENDER_HEIGHT;
      expect(row.onScreen).toBe(row.inFront && inside);
    }
  });
});
