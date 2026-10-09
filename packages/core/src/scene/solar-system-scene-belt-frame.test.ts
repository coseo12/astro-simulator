/**
 * #1319 결정 2 — 띠 입자가 body mesh 와 같은 기준계 `(origin, scale)` 를 쓰는가 (NullEngine 실 scene).
 *
 * 결함 (ADR 20261008-1319 실측 1-C):
 *  (가) origin 미차감 — 달 포커스 (body tier) 에서 띠 무게중심이 태양에서 ≈ 0.79 AU 떨어진 장면 원점(달) 주위.
 *  (나) 일시정지 중 tier 전환 — 띠 갱신이 `updateAt`(시간 위상) 에만 묶여 body tier 에서도 solar 스케일 고착.
 *
 * 판정의 기준값은 **body mesh 에서 역산**한다 — 태양은 heliocentric 원점 (world = 0) 이므로
 * `sun.position = (0 − origin) × scale` → `origin = −sun.position / scale`. 띠 쪽 값(`uOrigin` · `uScale`) 과
 * 다른 경로로 얻은 값이라 스냅샷 헬퍼 자체의 오류도 잡는다.
 *
 * 전제 단언으로 공허 통과를 막는다 — (가) 는 draw 시점 `floatingOrigin.originOffset` 이 루프가 쓴 origin 과
 * **실제로 다르다** (primary follow 가 이미 옮겼다) 는 것, (나) 는 tier 전환 전 띠가 solar 스케일이었다는 것.
 *
 * 픽스처는 `solar-system-scene-orbit-line-origin.test.ts` 와 같다 (OffscreenCanvas 스텁 포함).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3, type Mesh } from '@babylonjs/core';
import { AU, J2000_JD } from '@astro-simulator/shared';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import { renderScaleForTier } from './tier.js';

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

function makeScene(options: { asteroidNbody?: boolean } = {}): Fixture {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 720,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 3, 50, Vector3.Zero(), scene);
  const handles = createSolarSystemScene(scene, {
    surfaceDetail: false,
    starfield: false,
    asteroidBeltN: 200,
    asteroidNbody: options.asteroidNbody ?? false,
  });
  const f = { engine, scene, handles };
  fixtures.push(f);
  return f;
}

/** body mesh 루프가 실제로 쓴 origin (m) — 태양 mesh 위치에서 역산. */
function originFromSunMesh(f: Fixture, scale: number): [number, number, number] {
  const sun = f.handles.meshes.get('sun')!.position;
  return [-sun.x / scale, -sun.y / scale, -sun.z / scale];
}

/** draw 경로를 태운다 — Babylon 이 mesh render 직전에 알리는 observable (belt-particles.ts 머리말). */
function drawBelt(f: Fixture) {
  const belt = f.handles.getBeltParticles();
  if (!belt) throw new Error('GPU 띠 입자 없음');
  belt.mesh.onBeforeRenderObservable.notifyObservers(belt.mesh);
  const u = belt.readFrameUniforms();
  if (!u) throw new Error('uniform 미적용');
  return u;
}

/** 두 AU 좌표의 거리 (AU). */
function distAU(a: readonly number[], b: readonly number[]): number {
  return Math.hypot(a[0]! - b[0]!, a[1]! - b[1]!, a[2]! - b[2]!);
}

describe('#1319 결정 2 — 띠 입자 기준계 = body mesh 기준계', () => {
  it('?belt=N (beltNbody 아님) 은 GPU 경로를 쓴다', () => {
    const f = makeScene();
    expect(f.handles.getBeltParticles()).not.toBeNull();
    expect(f.scene.getMeshByName('belt-particles')).not.toBeNull();
    expect(f.scene.getMeshByName('asteroid-template')).toBeNull();
  });

  it('(가) body tier + 달 포커스 재생 — draw 시 uOrigin == body mesh 루프가 쓴 origin (다음 프레임 origin 아님)', () => {
    const f = makeScene();
    f.handles.setFocusOrigin('moon');
    f.handles.setTier('body');
    // 달은 10 일에 궤도의 1/3 을 돈다 — 루프가 쓴 origin(직전 달 위치) 과 primary follow 가 옮긴 origin 이 갈린다.
    f.handles.updateAt(J2000_JD + 10);

    const scale = renderScaleForTier('body');
    const loopOrigin = originFromSunMesh(f, scale);
    const nextOrigin = f.handles.floatingOrigin.originOffset;
    // 전제 — 원점이 태양이 아니고, draw 시점의 originOffset 은 이미 다른 값이다 (공허 통과 방지).
    expect(Math.hypot(...loopOrigin) / AU).toBeGreaterThan(0.9);
    expect(
      distAU(
        loopOrigin.map((v) => v / AU),
        nextOrigin.map((v) => v / AU),
      ),
    ).toBeGreaterThan(1e-4);

    const u = drawBelt(f);
    const loopOriginAU = loopOrigin.map((v) => v / AU);
    // body mesh 위치가 float32 (Vector3) 라 역산값은 상대 ~1e-7 — 1 AU 에서 1e-6 AU 여유.
    expect(distAU(u.origin, loopOriginAU)).toBeLessThan(1e-6);
    expect(
      distAU(
        u.origin,
        nextOrigin.map((v) => v / AU),
      ),
    ).toBeGreaterThan(1e-4);
    expect(u.scale).toBe(scale * AU);
  });

  it('(나) 시간 정지 상태에서 setTier(body) 직후 draw 의 uScale == renderScaleForTier(body) × AU', () => {
    const f = makeScene();
    // 생성 시 updateAt(initialJulianDate) 1회 뒤 시간 위상은 더 돌지 않는다 (일시정지와 같은 상태).
    const before = drawBelt(f);
    expect(before.scale).toBe(renderScaleForTier('solar') * AU);
    expect(before.origin).toEqual([0, 0, 0]);

    f.handles.setFocusOrigin('moon');
    f.handles.setTier('body');
    const u = drawBelt(f);
    const scale = renderScaleForTier('body');
    expect(u.scale).toBe(scale * AU);
    // origin 도 같은 호출에서 달로 — body mesh 가 쓴 값과 일치.
    expect(
      distAU(
        u.origin,
        originFromSunMesh(f, scale).map((v) => v / AU),
      ),
    ).toBeLessThan(1e-6);
    expect(Math.hypot(...u.origin)).toBeGreaterThan(0.9);
  });

  it('포커스 해제 (solar 복귀) 도 시간 위상 없이 다음 draw 에 반영된다', () => {
    const f = makeScene();
    f.handles.setFocusOrigin('moon');
    f.handles.setTier('body');
    f.handles.clearFocus();
    const u = drawBelt(f);
    expect(u.scale).toBe(renderScaleForTier('solar') * AU);
    expect(u.origin).toEqual([0, 0, 0]);
  });

  it('dispose 는 띠 메시 · 머티리얼을 해제한다', () => {
    const f = makeScene();
    const belt = f.handles.getBeltParticles()!;
    f.handles.dispose();
    expect(f.scene.meshes).not.toContain(belt.mesh);
    expect(f.scene.materials).not.toContain(belt.material);
    expect(f.handles.getBeltParticles()).toBeNull();
  });
});

describe('#1319 결정 1 — ?beltNbody=1 구 CPU 경로 + origin 차감 (결함 (가))', () => {
  it('구 경로를 쓰고, 달 포커스 body tier 에서 띠 무게중심이 태양 mesh 근처다', () => {
    const f = makeScene({ asteroidNbody: true });
    expect(f.handles.getBeltParticles()).toBeNull();
    const template = f.scene.getMeshByName('asteroid-template') as Mesh | null;
    expect(template).not.toBeNull();

    f.handles.setFocusOrigin('moon');
    f.handles.setTier('body');
    f.handles.updateAt(J2000_JD + 10);

    const matrices = template!.thinInstanceGetWorldMatrices();
    expect(matrices).toHaveLength(200);
    let cx = 0;
    let cy = 0;
    let cz = 0;
    for (const m of matrices) {
      cx += m.m[12]!;
      cy += m.m[13]!;
      cz += m.m[14]!;
    }
    const n = matrices.length;
    const scale = renderScaleForTier('body');
    const sun = f.handles.meshes.get('sun')!.position;
    // 띠 무게중심 ↔ 태양 거리 (AU). 균일 분포 200 개라 무게중심은 태양에서 수 0.1 AU 안쪽이다
    // (a 2.2~3.2 AU 원형 분포의 표본 평균). 결함판은 장면 원점(달) 주위라 태양에서 ≈ 1 AU.
    const centroidToSunAU = Math.hypot(cx / n - sun.x, cy / n - sun.y, cz / n - sun.z) / scale / AU;
    const centroidToOriginAU = Math.hypot(cx / n, cy / n, cz / n) / scale / AU;
    // 전제 — 원점(달) 이 태양에서 ≈ 1 AU 떨어져 있어 두 판정이 갈린다.
    expect(Math.hypot(sun.x, sun.y, sun.z) / scale / AU).toBeGreaterThan(0.9);
    expect(centroidToSunAU).toBeLessThan(0.3);
    expect(centroidToOriginAU).toBeGreaterThan(0.7);
  });
});
