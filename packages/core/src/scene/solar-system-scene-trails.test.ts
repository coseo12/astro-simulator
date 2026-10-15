/**
 * #1341 — 궤적 trail 이 장면에 붙는 방식 (NullEngine 실 scene, ADR 20261015-1341 결정 T3 · T5 · T7 · T8 · T10).
 *
 *  1. 기본 꺼짐 — 로드 시 메시 0 (결정 T10).
 *  2. D7 꺼짐 = 계산 0 — 꺼진 상태 · N-body 엔진에서 `updateAt` · `setTier` 가 샘플러를 0회 호출 (spy). 양성 대조군:
 *     켠 상태에서는 호출마다 35회.
 *  3. D2 (장면) — 머리 정점 = 같은 시점 body `mesh.position` 의 float32 값 (위성 포함, 전 천체).
 *  4. §교차검증 합의 1 — 일시정지 (`updateAt` 미발동) 중 처음 켬 · 방향 전환이 즉시 정점에 반영된다. 기준계는 마지막으로
 *     메시에 쓴 `(origin, scale, jd)` — tier 전환 · 포커스 이동 뒤에도 머리가 메시와 같다.
 *  5. 결정 T8 — Newton 전환 시 꺼짐 · Kepler 복귀 시 의도대로 다시 켜짐.
 *  6. D8 정적 — trail 메시 가시성 쓰기가 명령 경로 밖에 0건 · trail 모듈의 `onOriginShift` 구독 0 (§교차검증 합의 2).
 *
 * 픽스처는 `solar-system-scene-sun-corona.test.ts` 와 같다 (OffscreenCanvas 스텁 포함).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import { TRAIL_LINES_MESH_NAME } from './trail-lines.js';
import {
  TRAIL_ORBIT_FRACTION,
  sampleTrailWorld,
  trailVertexCount,
  type TrailDirection,
} from './trail-sampling.js';
import type * as TrailSamplingModule from './trail-sampling.js';

// D7 — 샘플러 호출 수를 세기 위해 실제 구현을 감싼다 (동작은 원본 그대로).
vi.mock('./trail-sampling.js', async (importOriginal) => {
  const orig = await importOriginal<typeof TrailSamplingModule>();
  return { ...orig, sampleTrailWorld: vi.fn(orig.sampleTrailWorld) };
});
const samplerSpy = vi.mocked(sampleTrailWorld);

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
beforeEach(() => {
  samplerSpy.mockClear();
});
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.handles.dispose();
    f.scene.dispose();
    f.engine.dispose();
  }
});

const J2000 = 2_451_545.0;
const TRAIL_BODY_COUNT = 35;

function makeScene(): Fixture {
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
  });
  const f = { engine, scene, handles };
  fixtures.push(f);
  return f;
}

/** 머리 정점 (천체마다 첫 점) ↔ 그 천체 mesh.position 의 float32 값. 불일치 목록을 돌려준다. */
function headMismatches(f: Fixture): string[] {
  const lines = f.handles.getTrailLines()!;
  const bad: string[] = [];
  let v = 0;
  for (const spec of f.handles.getTrailBodySpecs()) {
    const p = f.handles.meshes.get(spec.id)!.position;
    const o = 3 * v;
    if (
      lines.positions[o] !== Math.fround(p.x) ||
      lines.positions[o + 1] !== Math.fround(p.y) ||
      lines.positions[o + 2] !== Math.fround(p.z)
    ) {
      bad.push(spec.id);
    }
    v += spec.segments + 1;
  }
  return bad;
}

/**
 * 기대 world 정점 (m) — 같은 (jd, 방향) 로 샘플러를 장면과 독립으로 부른다. 모체 world = 0 으로 두므로 **태양 직속**
 * 천체에만 유효하다 (Kepler 경로에서 태양 world = 원점). 머리는 비교에 쓰지 않는다.
 */
function expectedSunChildWorld(f: Fixture, jd: number, direction: TrailDirection): Float64Array {
  const specs = f.handles.getTrailBodySpecs();
  const world = new Float64Array(3 * trailVertexCount(specs));
  let offset = 0;
  for (const spec of specs) {
    offset +=
      3 *
      sampleTrailWorld(
        spec,
        jd,
        direction,
        TRAIL_ORBIT_FRACTION,
        [0, 0, 0],
        [0, 0, 0],
        world,
        offset,
      );
  }
  return world;
}

/** 천체 1개의 꼬리 정점 (장면 좌표). */
function tailVertex(f: Fixture, bodyId: string): [number, number, number] {
  const lines = f.handles.getTrailLines()!;
  let v = 0;
  for (const spec of f.handles.getTrailBodySpecs()) {
    if (spec.id === bodyId) {
      const o = 3 * (v + spec.segments);
      return [lines.positions[o]!, lines.positions[o + 1]!, lines.positions[o + 2]!];
    }
    v += spec.segments + 1;
  }
  throw new Error(bodyId);
}

describe('#1341 trail — 장면 통합', () => {
  it('기본 꺼짐 — 로드 시 trail 메시 0 · 샘플러 호출 0', () => {
    const f = makeScene();
    expect(f.handles.getTrailLines()).toBeNull();
    expect(f.scene.getMeshByName(TRAIL_LINES_MESH_NAME)).toBeNull();
    expect(samplerSpy).toHaveBeenCalledTimes(0);
  });

  it('D7 — 꺼짐이면 updateAt · setTier 가 샘플러 0회 · 켜면 호출마다 35회 (양성 대조군)', () => {
    const f = makeScene();
    // 한 번도 안 켬
    f.handles.updateAt(J2000 + 1);
    f.handles.setTier('inner');
    f.handles.updateAt(J2000 + 2);
    expect(samplerSpy).toHaveBeenCalledTimes(0);
    // 켬 → 명령 시 1회 동기 (35) + updateAt (35)
    f.handles.setTrailsVisible(true);
    expect(samplerSpy).toHaveBeenCalledTimes(TRAIL_BODY_COUNT);
    f.handles.updateAt(J2000 + 3);
    expect(samplerSpy).toHaveBeenCalledTimes(2 * TRAIL_BODY_COUNT);
    // 켰다 끔 → 다시 0
    f.handles.setTrailsVisible(false);
    samplerSpy.mockClear();
    f.handles.updateAt(J2000 + 4);
    f.handles.setTier('solar');
    f.handles.updateAt(J2000 + 5);
    expect(samplerSpy).toHaveBeenCalledTimes(0);
    // 끈 상태의 방향 전환도 계산 0
    f.handles.setTrailDirection(-1);
    expect(samplerSpy).toHaveBeenCalledTimes(0);
  });

  it('D2 · 합의 1 — 일시정지 중 처음 켜도 즉시 그려지고 머리 = mesh.position (전 천체, 위성 포함)', () => {
    const f = makeScene();
    f.handles.updateAt(J2000 + 100.25);
    // 이후 updateAt 없음 = 일시정지
    f.handles.setTrailsVisible(true);
    const lines = f.handles.getTrailLines()!;
    expect(lines.mesh.isEnabled()).toBe(true);
    expect(headMismatches(f)).toEqual([]);
    // 전제 — 정점이 실제로 채워졌다 (0 버퍼의 공허 통과 방지).
    expect(lines.positions.some((x) => x !== 0)).toBe(true);
    expect(lines.positions.length).toBe(3 * 1_955);
  });

  it('합의 1 — 일시정지 중 역재생 방향 전환이 즉시 반영된다 (꼬리가 미래 쪽으로)', () => {
    const f = makeScene();
    f.handles.updateAt(J2000 + 10);
    f.handles.setTrailsVisible(true);
    const forward = Float32Array.from(f.handles.getTrailLines()!.positions);
    f.handles.setTrailDirection(-2_000);
    const backward = f.handles.getTrailLines()!.positions;
    expect(Buffer.from(backward.buffer).equals(Buffer.from(forward.buffer))).toBe(false);
    expect(headMismatches(f)).toEqual([]);
    // 같은 jd 의 순방향 · 역방향 기대값과 꼬리 정점이 각각 일치 — 장면 좌표 scale 로 환산해 비교.
    const frame = f.handles.getBodyReferenceFrame();
    const fwdWorld = expectedSunChildWorld(f, J2000 + 10, 1);
    const bwdWorld = expectedSunChildWorld(f, J2000 + 10, -1);
    // 지구 꼬리: 지구는 태양 직속 · 시각 배율 1 → 장면 좌표 = (world − origin) × scale.
    const earthTailBwd = tailVertex(f, 'earth');
    const specs = f.handles.getTrailBodySpecs();
    let v = 0;
    for (const spec of specs) {
      if (spec.id === 'earth') break;
      v += spec.segments + 1;
    }
    const earthSpec = specs.find((s) => s.id === 'earth')!;
    const o = 3 * (v + earthSpec.segments);
    for (let c = 0; c < 3; c += 1) {
      const origin = [frame.originX, frame.originY, frame.originZ][c]!;
      expect(earthTailBwd[c]).toBe(Math.fround((bwdWorld[o + c]! - origin) * frame.scale));
      expect(forward[o + c]).toBe(Math.fround((fwdWorld[o + c]! - origin) * frame.scale));
    }
    // 0 배속 (일시정지) 은 직전 부호 유지 — 정점 불변.
    const before = Float32Array.from(backward);
    samplerSpy.mockClear();
    f.handles.setTrailDirection(0);
    expect(samplerSpy).toHaveBeenCalledTimes(0);
    expect(
      Buffer.from(f.handles.getTrailLines()!.positions.buffer).equals(Buffer.from(before.buffer)),
    ).toBe(true);
  });

  it('합의 1 · D4 — 일시정지 중 tier 전환 · 포커스 이동 후에도 머리 = mesh.position', () => {
    const f = makeScene();
    f.handles.updateAt(J2000 + 42);
    f.handles.setTrailsVisible(true);
    const scale0 = f.handles.getBodyReferenceFrame().scale;
    // 일시정지 중 tier 전환
    f.handles.setTier('inner');
    expect(f.handles.getBodyReferenceFrame().scale).not.toBe(scale0); // 전제: 실제로 바뀜
    expect(headMismatches(f)).toEqual([]);
    // 일시정지 중 포커스 이동 — origin 은 옮겨지지만 mesh 는 다음 updateAt 까지 이전 기준계 (trail 도 함께)
    f.handles.setTier('body');
    f.handles.setFocusOrigin('earth');
    expect(headMismatches(f)).toEqual([]);
    // 재생 1 프레임
    f.handles.updateAt(J2000 + 42.01);
    expect(headMismatches(f)).toEqual([]);
    // 전제 — 기록된 기준계 origin 이 실제로 earth 로 옮겨졌다 (원점 [0,0,0] 의 공허 통과 방지).
    const frame = f.handles.getBodyReferenceFrame();
    expect(Math.hypot(frame.originX, frame.originY, frame.originZ)).toBeGreaterThan(1e10);
  });

  it('결정 T8 — Newton 전환 시 꺼짐 · 샘플러 0 / Kepler 복귀 시 다시 켜짐 · 머리 = mesh', () => {
    const f = makeScene();
    f.handles.setTrailsVisible(true);
    const lines = f.handles.getTrailLines()!;
    f.handles.setPhysicsEngine('newton');
    expect(lines.mesh.isEnabled()).toBe(false);
    samplerSpy.mockClear();
    f.handles.updateAt(J2000 + 1);
    expect(samplerSpy).toHaveBeenCalledTimes(0);
    // N-body 중에 의도를 다시 켜도 메시는 꺼진 채
    f.handles.setTrailsVisible(true);
    expect(lines.mesh.isEnabled()).toBe(false);
    f.handles.setPhysicsEngine('kepler');
    expect(lines.mesh.isEnabled()).toBe(true);
    expect(headMismatches(f)).toEqual([]);
    // N-body 중 의도를 끄면 Kepler 복귀 후에도 꺼짐
    f.handles.setPhysicsEngine('newton');
    f.handles.setTrailsVisible(false);
    f.handles.setPhysicsEngine('kepler');
    expect(lines.mesh.isEnabled()).toBe(false);
  });

  it('지연 생성 1회 · 이후 setEnabled 만 · dispose 시 해제', () => {
    const f = makeScene();
    f.handles.setTrailsVisible(true);
    const first = f.handles.getTrailLines();
    f.handles.setTrailsVisible(false);
    expect(first!.mesh.isEnabled()).toBe(false);
    f.handles.setTrailsVisible(true);
    expect(f.handles.getTrailLines()).toBe(first);
    expect(f.scene.meshes.filter((m) => m.name === TRAIL_LINES_MESH_NAME)).toHaveLength(1);
    expect(first!.mesh.isPickable).toBe(false);
    f.handles.dispose();
    expect(first!.mesh.isDisposed()).toBe(true);
    fixtures.splice(0); // 이미 dispose 함
    f.scene.dispose();
    f.engine.dispose();
  });
});

describe('#1341 D8 — 정적 단언 (가시성 쓰기 · onOriginShift 구독)', () => {
  /** 주석 제거 — 서술 속 토큰에 걸리지 않도록 코드만 본다. */
  function codeOf(file: string): string {
    const src = fs.readFileSync(path.join(__dirname, file), 'utf-8');
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  }
  /** `const <name> = (...) => { ... };` 본문 — 2칸 들여쓰기 닫힘까지. */
  function closureBody(code: string, name: string): string {
    const start = code.indexOf(`const ${name} = `);
    expect(start, name).toBeGreaterThanOrEqual(0);
    const end = code.indexOf('\n  };', start);
    expect(end, name).toBeGreaterThan(start);
    return code.slice(start, end);
  }

  it('trail 메시 가시성 쓰기는 applyTrailsEnabled 안에만 있고, 그 함수는 명령 핸들러 2곳에서만 불린다', () => {
    const code = codeOf('solar-system-scene.ts');
    const visWrite = /trailLines\??\.mesh\.(setEnabled|isVisible)/g;
    const all = code.match(visWrite) ?? [];
    const apply = closureBody(code, 'applyTrailsEnabled');
    const inApply = apply.match(visWrite) ?? [];
    expect(all.length).toBeGreaterThan(0); // 전제 — 패턴이 실제 코드에 걸린다
    expect(inApply.length).toBe(all.length);
    // 호출 지점 = setTrailsVisible · setPhysicsEngine (명령 핸들러) 만
    const calls = code.match(/applyTrailsEnabled\(\)/g) ?? [];
    expect(calls).toHaveLength(2);
    expect(closureBody(code, 'setTrailsVisible')).toContain('applyTrailsEnabled()');
    expect(closureBody(code, 'setPhysicsEngine')).toContain('applyTrailsEnabled()');
  });

  it('trail 모듈은 가시성을 쓰지 않고 observer 를 등록하지 않는다', () => {
    for (const file of ['trail-lines.ts', 'trail-sampling.ts']) {
      const code = codeOf(file);
      expect(code, file).not.toMatch(/setEnabled\(|\.isVisible\s*=/);
      expect(code, file).not.toMatch(/Observable\.add/);
    }
  });

  it('합의 2 — trail 모듈 · 장면의 onOriginShift 구독 0', () => {
    for (const file of ['trail-lines.ts', 'trail-sampling.ts', 'solar-system-scene.ts']) {
      expect(codeOf(file), file).not.toMatch(/onOriginShift/);
    }
  });
});
