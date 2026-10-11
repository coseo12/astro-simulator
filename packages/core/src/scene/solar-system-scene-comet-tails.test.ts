/**
 * #1329 — 혜성 꼬리가 장면에 붙는 방식 (NullEngine 실 scene, ADR 20261010-1329 결정 2 · 4 · 5 · 이슈 D3).
 *
 *  1. 「전 comet 커버」 — `kind: 'comet'` 전수 (데이터 순서) 에 꼬리 1개씩. 하드코딩 금지 (교차검증 기각 7 의 구현 고정).
 *  2. 로드 옵션 — `cometTails` 미지정 = 생성 0 (core 기본 false, 게이트는 web 책임).
 *  3. D3 기준계 — 재생 · 일시정지 + tier 전환 · 다른 천체 포커스 각 단계에서, draw 가 실은 머리 = 같은 시점 혜성 mesh
 *     world 행렬 이동 성분 (상대오차 ≤ 1e-6), 축 = 태양 → 혜성 world 방향 (≤ 1e-4°), scale = `bodyFrame.scale`.
 *     비교 기준은 world 행렬 (`computeWorldMatrix(true)`) 이라 uniform 쪽 값과 다른 경로다.
 *     전제 단언으로 공허 통과를 막는다 — 단계마다 scale 또는 origin 이 **실제로 바뀌었다** 는 것.
 *  4. dispose — 메시 · 머티리얼 해제.
 *
 * 픽스처는 `solar-system-scene-belt-frame.test.ts` 와 같다 (OffscreenCanvas 스텁 포함).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
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

/** 핼리 장면 근일점 (ADR 1-A — 2체 Kepler, 역사 근일점 아님). */
const HALLEY_PERIHELION_JD = 2_446_479.5;
/** 이슈 D3 한계. */
const HEAD_REL_TOLERANCE = 1e-6;
const AXIS_ANGLE_TOLERANCE_DEG = 1e-4;

function makeScene(options: { cometTails?: boolean; jd?: number } = {}): Fixture {
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
    initialJulianDate: options.jd ?? HALLEY_PERIHELION_JD,
    ...(options.cometTails === undefined ? {} : { cometTails: options.cometTails }),
  });
  const f = { engine, scene, handles };
  fixtures.push(f);
  return f;
}

function worldTranslation(f: Fixture, id: string): [number, number, number] {
  const t = f.handles.meshes.get(id)!.computeWorldMatrix(true).getTranslation();
  return [t.x, t.y, t.z];
}

/** 한 꼬리를 draw 경로로 태우고 world 행렬 기준과 대조한 오차. */
function measure(f: Fixture, id: string) {
  const tail = f.handles.getCometTails().find((t) => t.bodyId === id)!;
  tail.mesh.onBeforeRenderObservable.notifyObservers(tail.mesh);
  const u = tail.readFrameUniforms()!;
  const head = worldTranslation(f, id);
  const sun = worldTranslation(f, 'sun');
  const d: [number, number, number] = [head[0] - sun[0], head[1] - sun[1], head[2] - sun[2]];
  const dist = Math.hypot(...d);
  const headErr = Math.hypot(u.head[0] - head[0], u.head[1] - head[1], u.head[2] - head[2]) / dist;
  const cos = (u.axis[0] * d[0] + u.axis[1] * d[1] + u.axis[2] * d[2]) / dist;
  const angleDeg = (Math.acos(Math.min(1, Math.max(-1, cos))) * 180) / Math.PI;
  return { u, headErr, angleDeg };
}

describe('#1329 — 혜성 꼬리 장면 통합', () => {
  it('cometTails 미지정 → 생성 0 (core 기본 false)', () => {
    const f = makeScene();
    expect(f.handles.getCometTails()).toEqual([]);
    expect(f.scene.meshes.filter((m) => m.name.startsWith('comet-tail-'))).toHaveLength(0);
  });

  it('전 comet 커버 — kind: comet 전수 (데이터 순서) 에 꼬리 1개씩 · 이름 comet-tail-<id>', () => {
    const f = makeScene({ cometTails: true });
    const cometIds = getSolarSystem()
      .bodies.filter((b) => b.kind === 'comet')
      .map((b) => b.id);
    expect(cometIds.length).toBeGreaterThan(0);
    expect(f.handles.getCometTails().map((t) => t.bodyId)).toEqual(cometIds);
    for (const id of cometIds) {
      const mesh = f.scene.getMeshByName(`comet-tail-${id}`);
      expect(mesh).not.toBeNull();
      expect(mesh!.isEnabled()).toBe(true);
      expect(mesh!.isPickable).toBe(false);
    }
  });

  it('핼리 장면 근일점 — 활동도 > 0 · scale = bodyFrame.scale', () => {
    const f = makeScene({ cometTails: true });
    const { u } = measure(f, 'halley');
    expect(u.rAU).toBeGreaterThan(0.58);
    expect(u.rAU).toBeLessThan(0.6);
    expect(u.activity).toBeGreaterThan(1.4);
    expect(u.scale).toBe(f.handles.getBodyReferenceFrame().scale);
  });

  it('D3 — 재생 · 일시정지 tier 전환 · 다른 천체 포커스 각 단계에서 머리 상대오차 ≤ 1e-6 · 축 ≤ 1e-4°', () => {
    const f = makeScene({ cometTails: true });
    const ids = f.handles.getCometTails().map((t) => t.bodyId);
    const check = (label: string) => {
      for (const id of ids) {
        const { headErr, angleDeg } = measure(f, id);
        expect(headErr, `${label} / ${id} head`).toBeLessThanOrEqual(HEAD_REL_TOLERANCE);
        expect(angleDeg, `${label} / ${id} axis`).toBeLessThanOrEqual(AXIS_ANGLE_TOLERANCE_DEG);
      }
    };

    // (1) solar · 정지
    check('solar paused');
    const scale0 = measure(f, 'halley').u.scale;
    expect(scale0).toBe(renderScaleForTier('solar'));

    // (2) 일시정지 중 핼리 포커스 + body tier (시간 위상 없음)
    f.handles.setFocusOrigin('halley');
    f.handles.setTier('body');
    const afterTier = measure(f, 'halley').u;
    expect(afterTier.scale, '전제: tier 스케일이 실제로 바뀌었다').toBe(renderScaleForTier('body'));
    // 포커스 원점 — 핼리 머리가 장면 원점 근처 (body tier 원점 이동이 반영된 위치).
    expect(Math.hypot(...afterTier.head)).toBeLessThan(Math.hypot(...afterTier.sun));
    check('paused focus halley body tier');

    // (3) body tier 재생 — origin 이 매 프레임 이동
    for (let k = 1; k <= 5; k += 1) {
      f.handles.updateAt(HALLEY_PERIHELION_JD + k * 0.5);
      check(`playing body tier step ${k}`);
    }

    // (4) 다른 천체 (지구) 포커스 + inner tier
    const sunBefore = measure(f, 'halley').u.sun;
    f.handles.setFocusOrigin('earth');
    f.handles.setTier('inner');
    f.handles.updateAt(HALLEY_PERIHELION_JD + 3);
    const sunAfter = measure(f, 'halley').u.sun;
    expect(
      Math.hypot(
        sunAfter[0] - sunBefore[0],
        sunAfter[1] - sunBefore[1],
        sunAfter[2] - sunBefore[2],
      ),
      '전제: 장면 원점이 실제로 바뀌었다',
    ).toBeGreaterThan(0);
    check('earth focus inner tier');

    // (5) 다시 정지 상태에서 solar 복귀 (시간 위상 없음)
    f.handles.setTier('solar');
    expect(measure(f, 'halley').u.scale).toBe(renderScaleForTier('solar'));
    check('paused back to solar');
  });

  it('원일점 근처 시각 로드 → 활동도 0, 근일점으로 시간을 옮기면 같은 메시가 다시 활동 (D9 — 장면 경로)', () => {
    // 핼리 원일점 (ADR D2 `?t=2460288.5`, r 35.08 AU).
    const f = makeScene({ cometTails: true, jd: 2_460_288.5 });
    const tail = f.handles.getCometTails().find((t) => t.bodyId === 'halley')!;
    f.scene.render();
    expect(tail.readFrameUniforms()!.rAU).toBeGreaterThan(35);
    expect(tail.readFrameUniforms()!.activity).toBe(0);
    f.handles.updateAt(HALLEY_PERIHELION_JD);
    f.scene.render();
    expect(tail.readFrameUniforms()!.activity).toBeGreaterThan(1.4);
  });

  it('dispose — 꼬리 메시 · 머티리얼 해제', () => {
    const f = makeScene({ cometTails: true });
    const materials = f.handles.getCometTails().map((t) => t.material);
    f.handles.dispose();
    expect(f.scene.meshes.filter((m) => m.name.startsWith('comet-tail-'))).toHaveLength(0);
    for (const m of materials) expect(f.scene.materials.includes(m)).toBe(false);
    // afterEach 이중 dispose 방지
    fixtures.splice(fixtures.indexOf(f), 1);
    f.scene.dispose();
    f.engine.dispose();
  });
});
