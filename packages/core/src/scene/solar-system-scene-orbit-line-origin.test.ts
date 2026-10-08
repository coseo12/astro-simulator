/**
 * #1318 — 궤도선 LineSystem 이 floating origin 이동 후에도 모체 자리에 있는가 (NullEngine 실 scene).
 *
 * 결함: 태양 중심 `orbit-lines` 는 position 을 한 번도 설정하지 않아 (0,0,0) 에 남았다. T3 (body) 포커스는
 * `setOriginToBody(focus)` 로 원점을 포커스 천체로 옮기므로 궤도선이 **포커스 천체 중심**으로 그려졌다.
 * 또 `setTier` 는 `rebuildOrbitLines` 로 LineSystem 을 새로 만들어 위성 궤도선까지 (0,0,0) 으로 돌려놓는데,
 * 일시정지 중이면 (`updateAt` 미발동) 다음 시간 위상까지 그대로 남는다.
 *
 * 판정은 「궤도선 position == 모체 mesh position」 (같은 기준계) 과, 그 결과로 「천체 중심이 자기 궤도
 * 폴리라인 위에 있다」 둘이다. 전제 (원점이 실제로 옮겨 갔다 — 태양 mesh 가 원점이 아니다) 를 먼저 단언해
 * 공허 통과를 막는다.
 *
 * 픽스처는 `solar-system-scene-screen-info.test.ts` 와 같다 (OffscreenCanvas 스텁 포함).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3, type AbstractMesh } from '@babylonjs/core';
import { J2000_JD } from '@astro-simulator/shared';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';

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

function makeScene(): Fixture {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 720,
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

/** `setTier` 가 LineSystem 을 다시 만들므로 매번 이름으로 새로 찾는다. */
function line(f: Fixture, name: string): AbstractMesh {
  const m = f.scene.getMeshByName(name);
  if (!m) throw new Error(`${name} 없음`);
  return m;
}

/** 두 위치의 차를 기준 길이로 나눈 상대 오차. */
function relDiff(a: Vector3, b: Vector3, ref: number): number {
  return Vector3.Distance(a, b) / ref;
}

/** 천체 중심에서 궤도 폴리라인 (월드 좌표) 까지의 최소 거리 / 태양 거리. */
function distanceToOrbitLine(f: Fixture, bodyId: string): number {
  const ol = line(f, 'orbit-lines');
  const wm = ol.computeWorldMatrix(true);
  const pos = ol.getVerticesData('position')!;
  const pts: Vector3[] = [];
  for (let i = 0; i < pos.length; i += 3) {
    pts.push(Vector3.TransformCoordinates(new Vector3(pos[i], pos[i + 1], pos[i + 2]), wm));
  }
  const body = f.handles.meshes.get(bodyId)!;
  body.computeWorldMatrix(true);
  const c = body.getAbsolutePosition();
  const sun = f.handles.meshes.get('sun')!.getAbsolutePosition();
  // 선분은 index 쌍이 정의한다 (LINES) — 정점을 순서대로 이으면 한 궤도 끝점과 다음 궤도 첫 점 사이에
  // 존재하지 않는 선분이 생겨, 그 위를 지나는 천체를 거짓으로 「궤도선 위」 로 판정할 수 있다.
  const idx = ol.getIndices()!;
  expect(idx.length).toBeGreaterThan(0);
  let best = Infinity;
  for (let k = 0; k + 1 < idx.length; k += 2) {
    const a = pts[idx[k]!]!;
    const ab = pts[idx[k + 1]!]!.subtract(a);
    const l2 = ab.lengthSquared();
    if (l2 === 0) continue;
    const t = Math.max(0, Math.min(1, Vector3.Dot(c.subtract(a), ab) / l2));
    best = Math.min(best, Vector3.Distance(c, a.add(ab.scale(t))));
  }
  return best / Vector3.Distance(c, sun);
}

/** 기존 정상 수준 (비포커스 · 행성 포커스 실측 ≤ 1.3e-3 — 64 분할 폴리라인의 현 오차) 의 여유 상한. */
const ON_LINE_TOLERANCE = 3e-3;

describe('#1318 — T3 포커스에서 궤도선이 모체 자리에 있다 (floating origin 정합)', () => {
  it('일시정지 경로 — setFocusOrigin + setTier(body) 만 (updateAt 없음) 후 궤도선 == 모체 위치', () => {
    const f = makeScene();
    f.handles.setFocusOrigin('ceres');
    f.handles.setTier('body');
    expect(f.handles.getTier()).toBe('body');

    const sunMesh = f.handles.meshes.get('sun')!;
    // 전제 — 원점이 세레스로 옮겨 가서 태양 로컬 좌표가 원점이 아니다 (아니면 아래 판정은 공허하다).
    expect(sunMesh.position.length()).toBeGreaterThan(0);

    const ref = sunMesh.position.length();
    expect(relDiff(line(f, 'orbit-lines').position, sunMesh.position, ref)).toBeLessThan(1e-9);
    // 위성 궤도선도 setTier 의 rebuild 로 (0,0,0) 이 됐다가 같은 호출에서 모체 자리로 간다.
    const pluto = f.handles.meshes.get('pluto')!;
    expect(
      relDiff(line(f, 'satellite-orbit-line-pluto').position, pluto.position, ref),
    ).toBeLessThan(1e-9);

    for (const id of ['ceres', 'vesta', 'mars', 'pluto']) {
      expect(distanceToOrbitLine(f, id), `${id} 궤도선 위`).toBeLessThan(ON_LINE_TOLERANCE);
    }
  });

  it('재생 경로 — 이어서 updateAt 이 돌아도 궤도선 == 태양 위치, 천체는 궤도선 위', () => {
    const f = makeScene();
    f.handles.setFocusOrigin('vesta');
    f.handles.setTier('body');
    f.handles.updateAt(J2000_JD + 123.4);

    const sunMesh = f.handles.meshes.get('sun')!;
    expect(sunMesh.position.length()).toBeGreaterThan(0);
    expect(
      relDiff(line(f, 'orbit-lines').position, sunMesh.position, sunMesh.position.length()),
    ).toBeLessThan(1e-9);
    for (const id of ['vesta', 'ceres', 'pallas', 'hygiea', 'mars', 'halley']) {
      expect(distanceToOrbitLine(f, id), `${id} 궤도선 위`).toBeLessThan(ON_LINE_TOLERANCE);
    }
  });

  it('포커스 해제 (T3 → 기본 tier) — 원점 복귀 후에도 궤도선 == 태양 위치', () => {
    const f = makeScene();
    f.handles.setFocusOrigin('ceres');
    f.handles.setTier('body');
    f.handles.clearFocus();
    expect(f.handles.getTier()).not.toBe('body');
    const sunMesh = f.handles.meshes.get('sun')!;
    expect(Vector3.Distance(line(f, 'orbit-lines').position, sunMesh.position)).toBeLessThanOrEqual(
      1e-9 * Math.max(1, sunMesh.position.length()),
    );
    expect(distanceToOrbitLine(f, 'ceres')).toBeLessThan(ON_LINE_TOLERANCE);
  });
});
