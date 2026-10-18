/**
 * #1360 PR2 — 장면의 월식 그림자 배선 (NullEngine 실 scene). ADR `docs/decisions/20261018-1360-moon-phase-eclipse-shadows.md`.
 *
 *  - DoD D2 확장 — 위성 배율 30 ↔ 1 에서 달 머티리얼에 쓰인 그림자 uniform 비트 동일. ⚠️ 고정하는 것은 「배율과의 독립」 이
 *    아니라 **배율이 Kepler 경로의 `resolveWorld` 에서만 곱해진다는 현재 구조에 대한 의존**이다 (결정 G3).
 *  - DoD D8 (단위) — N-body 경로의 uniform 이 엔진 상태 (`getBodyState`) 에서 만들어진다 (비트 동일 · Kepler 해석해와 다름).
 *  - 결정 R2 — 수신 천체는 달뿐 (지구 · 화성 등은 `uEclMode 0`), high · lazy mid 둘 다 같은 값.
 *  - 결정 C2 — `setEclipseShadowsEnabled(false)` 는 즉시 (같은 프레임) 그림자 없음 값을 쓰고, `true` 로 되돌린다.
 *  - 결정 R1 — fragment 소스에 uniform 5개 · 함수 1개 · 합성 2줄 (`#define` 분기 없음).
 *
 * 픽스처는 `solar-system-scene-physical-phase.test.ts` 와 같다 (OffscreenCanvas 스텁 포함).
 */
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, Effect, NullEngine, Scene, Vector3, type Mesh } from '@babylonjs/core';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { syzygyGeometryAt } from '../events/compute-events.js';
import {
  ECLIPSE_SHADOW_MODE,
  classifyLunarShadowUniforms,
  lunarEclipseShadowUniforms,
  noEclipseShadowUniforms,
  type EclipseShadowUniforms,
} from '../events/eclipse-shadow-uniforms.js';
import { toSceneZ } from '../coords/scene-handedness.js';
import { lunarEclipseGeometry } from '../events/eclipse-geometry.js';
import { dateToJulianDate } from '../time/julian-date.js';
import { ECLIPSE_SHADOW_GLSL, ECLIPSE_SHADOW_UNIFORM_NAMES } from './procedural-planet-shader.js';
import {
  LUNAR_ECLIPSE_SHADOW_BODY_ID,
  createSolarSystemScene,
  type SolarSystemSceneHandles,
} from './solar-system-scene.js';
import type * as OrbitVisualScaleModule from './orbit-visual-scale.js';

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

const system = getSolarSystem();
const bodiesById = new Map(system.bodies.map((b) => [b.id, b] as const));
const RADII = {
  sun: bodiesById.get('sun')!.radius,
  earth: bodiesById.get('earth')!.radius,
  moon: bodiesById.get('moon')!.radius,
};
/** 2022-11-08 개기월식 최대식 근처 (UTC 11:00) — 판정 `total` (ADR §1-E 표). */
const ECLIPSE_JD = dateToJulianDate(new Date(Date.UTC(2022, 10, 8, 11, 0, 0)));

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
    surfaceDetail: opts.surfaceDetail ?? true,
    starfield: false,
    initialJulianDate: opts.jd ?? ECLIPSE_JD,
  });
  const f = { engine, scene, handles };
  fixtures.push(f);
  return f;
}

function flatten(u: EclipseShadowUniforms): number[] {
  return [u.mode, ...u.a, ...u.axis, ...u.k, ...u.glow];
}
/**
 * #1366 — 판정식 · uniform 빌더 출력 (데이터 공간) 을 장면 공간으로 — 장면 `updateLunarShadow` 와 같은 식 (극벡터 `a` ·
 * `axis` 의 z 반전, 그림자 없음은 그대로). 핸들 · 머티리얼 값은 장면 공간이다.
 */
function toSceneShadow(u: EclipseShadowUniforms): EclipseShadowUniforms {
  if (u.mode === 0) return u;
  return {
    ...u,
    a: [u.a[0], u.a[1], toSceneZ(u.a[2])],
    axis: [u.axis[0], u.axis[1], toSceneZ(u.axis[2])],
  };
}
function bitsEqual(a: readonly number[], b: readonly number[]): boolean {
  return a.length === b.length && a.every((v, i) => Object.is(v, b[i]));
}

/** 머티리얼이 실제로 보관한 그림자 uniform 값 (Babylon `ShaderMaterial` 내부 저장소). */
function materialShadow(f: Fixture, meshName: string): number[] {
  const mesh = f.scene.getMeshByName(meshName) as Mesh | null;
  const m = (mesh?.material ?? null) as unknown as {
    _floats: Record<string, number>;
    _vectors3: Record<string, Vector3>;
    _vectors4: Record<string, { x: number; y: number; z: number; w: number }>;
  } | null;
  if (!m) throw new Error(`${meshName} 머티리얼 없음`);
  const v3 = (n: string) => [m._vectors3[n]!.x, m._vectors3[n]!.y, m._vectors3[n]!.z];
  const k = m._vectors4.uEclK!;
  return [
    m._floats.uEclMode!,
    ...v3('uEclA'),
    ...v3('uEclAxis'),
    k.x,
    k.y,
    k.z,
    k.w,
    ...v3('uEclGlow'),
  ];
}

describe('#1360 PR2 — 월식 그림자 uniform 출처 · D2 · D8', () => {
  it('Kepler — 판정식과 같은 기하 (개기, 재분류 일치) · 머티리얼 값 = 핸들 사본', () => {
    const f = makeScene();
    f.handles.updateAt(ECLIPSE_JD);
    const u = f.handles.getLunarEclipseShadowUniforms();
    const geo = syzygyGeometryAt(bodiesById, 'moon', ECLIPSE_JD)!;
    const g = lunarEclipseGeometry(geo.moon, geo.sun, RADII);
    expect(g.type).toBe('total');
    expect(u.mode).toBe(ECLIPSE_SHADOW_MODE.lunar);
    expect(classifyLunarShadowUniforms(u)).toBe('total');
    // 장면 입력 (배율 전 위치) 과 사건 입력 (체인 위치) 은 같은 함수에서 오지만 태양 벡터의 뺄셈 순서가 달라 비트 동일까지는
    // 요구하지 않는다 — 각 성분 상대 1e-12.
    const ref = toSceneShadow(lunarEclipseShadowUniforms(geo.moon, geo.sun, RADII));
    flatten(u).forEach((v, i) => expect(v).toBeCloseTo(flatten(ref)[i]!, 10));
    // float32 저장 없이 JS 값 그대로 머티리얼에 들어간다.
    expect(bitsEqual(materialShadow(f, 'moon'), flatten(u))).toBe(true);
  });

  it('D2 — 위성 배율 30 ↔ 1 에서 그림자 uniform 비트 동일 (메시 위치는 배율을 따른다)', () => {
    scaleOverride.value = 30;
    const a = makeScene();
    a.handles.updateAt(ECLIPSE_JD);
    scaleOverride.value = 1;
    const b = makeScene();
    b.handles.updateAt(ECLIPSE_JD);
    const ua = flatten(a.handles.getLunarEclipseShadowUniforms());
    const ub = flatten(b.handles.getLunarEclipseShadowUniforms());
    expect(ua[0]).toBe(ECLIPSE_SHADOW_MODE.lunar);
    expect(bitsEqual(ua, ub)).toBe(true);
    // 화면 기하 결함판 (메시 위치로 기하를 만든 경우) 이 위 단언에 걸리려면 메시 상대 위치가 배율을 따라야 한다.
    const rel = (f: Fixture) =>
      f.handles.meshes
        .get('moon')!
        .position.subtract(f.handles.meshes.get('earth')!.position)
        .length();
    expect(rel(a) / rel(b)).toBeCloseTo(30, 3);
  });

  it('D8 — N-body: 엔진 상태 (달 − 지구 · 지구 − 태양) 에서 만든 값과 비트 동일 · Kepler 해석해와 다르다', () => {
    const jd0 = ECLIPSE_JD - 0.5;
    const run = (scale: number) => {
      scaleOverride.value = scale;
      const f = makeScene({ jd: jd0 });
      f.handles.updateAt(jd0);
      f.handles.setPhysicsEngine('newton');
      f.handles.updateAt(ECLIPSE_JD);
      expect(f.handles.getPhysicsEngine()).toBe('newton');
      return f;
    };
    const a = run(30);
    const u = a.handles.getLunarEclipseShadowUniforms();
    const moon = a.handles.getBodyState('moon', 'earth')!.pos;
    const earth = a.handles.getBodyState('earth', 'sun')!.pos;
    const fromEngine = toSceneShadow(
      lunarEclipseShadowUniforms(moon, [-earth[0], -earth[1], -earth[2]], RADII),
    );
    expect(u.mode).toBe(ECLIPSE_SHADOW_MODE.lunar);
    expect(bitsEqual(flatten(u), flatten(fromEngine))).toBe(true);
    // 경로 분기 판별 — 같은 시각 Kepler 체인 위치로 만든 값과 다르다 (적분 vs 해석해).
    const geo = syzygyGeometryAt(bodiesById, 'moon', ECLIPSE_JD)!;
    expect(
      bitsEqual(
        flatten(u),
        flatten(toSceneShadow(lunarEclipseShadowUniforms(geo.moon, geo.sun, RADII))),
      ),
    ).toBe(false);
    // N-body 도 배율 30 ↔ 1 비트 동일.
    const b = run(1);
    expect(bitsEqual(flatten(u), flatten(b.handles.getLunarEclipseShadowUniforms()))).toBe(true);
  });
});

describe('#1360 PR2 — 수신 천체 · 토글 · mid variant (결정 R2 · C2)', () => {
  it('지구 · 화성 · 목성 머티리얼은 식 시각에도 uEclMode 0 (그림자 없음 값)', () => {
    const f = makeScene();
    f.handles.updateAt(ECLIPSE_JD);
    const none = flatten(noEclipseShadowUniforms());
    for (const id of ['earth', 'mars', 'jupiter']) {
      expect(bitsEqual(materialShadow(f, id), none), id).toBe(true);
    }
    expect(LUNAR_ECLIPSE_SHADOW_BODY_ID).toBe('moon');
    expect(materialShadow(f, 'moon')[0]).toBe(ECLIPSE_SHADOW_MODE.lunar);
  });

  it('setEclipseShadowsEnabled(false) → 즉시 그림자 없음 값 · true → 계산값 복귀 (updateAt 없이)', () => {
    const f = makeScene();
    f.handles.updateAt(ECLIPSE_JD);
    expect(f.handles.getEclipseShadowsEnabled()).toBe(true);
    const on = materialShadow(f, 'moon');
    f.handles.setEclipseShadowsEnabled(false);
    expect(f.handles.getEclipseShadowsEnabled()).toBe(false);
    expect(bitsEqual(materialShadow(f, 'moon'), flatten(noEclipseShadowUniforms()))).toBe(true);
    expect(f.handles.getLunarEclipseShadowUniforms().mode).toBe(ECLIPSE_SHADOW_MODE.none);
    f.handles.setEclipseShadowsEnabled(true);
    expect(bitsEqual(materialShadow(f, 'moon'), on)).toBe(true);
  });

  it('식 아님 (+3일) — 달도 그림자 없음 값', () => {
    const f = makeScene();
    f.handles.updateAt(ECLIPSE_JD + 3);
    expect(bitsEqual(materialShadow(f, 'moon'), flatten(noEclipseShadowUniforms()))).toBe(true);
  });

  it('lazy 생성된 달 mid variant 도 생성 즉시 같은 값', () => {
    const f = makeScene();
    f.handles.updateAt(ECLIPSE_JD);
    expect(f.scene.getMeshByName('moon-lod-mid')).toBeNull();
    f.handles.setLodOverride('mid');
    f.handles.runFramePass();
    expect(f.scene.getMeshByName('moon-lod-mid')).not.toBeNull();
    expect(bitsEqual(materialShadow(f, 'moon-lod-mid'), materialShadow(f, 'moon'))).toBe(true);
    expect(materialShadow(f, 'moon-lod-mid')[0]).toBe(ECLIPSE_SHADOW_MODE.lunar);
    // 토글은 mid 에도 즉시 닿는다.
    f.handles.setEclipseShadowsEnabled(false);
    expect(materialShadow(f, 'moon-lod-mid')[0]).toBe(ECLIPSE_SHADOW_MODE.none);
  });
});

describe('#1360 PR2 — 셰이더 텍스트 (결정 R1)', () => {
  it('fragment 에 uniform 5개 · 함수 1개 · 합성 2줄 · #define 분기 없음', () => {
    makeScene();
    const frag = Effect.ShadersStore.proceduralPlanetFragmentShader!;
    expect(frag).toContain(ECLIPSE_SHADOW_GLSL);
    for (const name of ECLIPSE_SHADOW_UNIFORM_NAMES) {
      expect(frag.match(new RegExp(`uniform \\w+ ${name};`, 'g')), name).toHaveLength(1);
    }
    expect(frag.match(/vec2 eclipseShadow\(vec3 n\)/g)).toHaveLength(1);
    expect(frag).toContain('vec2 ecl = eclipseShadow(N);');
    expect(frag).toContain('shade -= sunShade * ecl.x;');
    expect(frag).toContain('shade += uEclGlow * (ecl.y * sunFactor);');
    // 합성은 shade 정의 직후 · col *= shade 앞.
    const iShade = frag.indexOf('vec3 shade = ambientShade + sunShade;');
    const iEcl = frag.indexOf('vec2 ecl = eclipseShadow(N);');
    const iMul = frag.indexOf('col *= shade;');
    expect(iShade).toBeGreaterThan(0);
    expect(iEcl).toBeGreaterThan(iShade);
    expect(iMul).toBeGreaterThan(iEcl);
    expect(ECLIPSE_SHADOW_GLSL).not.toMatch(/#\s*(define|ifdef|if)\b/);
  });
});
