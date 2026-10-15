/**
 * #1341 PR2 — 거리 자 선이 장면에 붙는 방식 (NullEngine 실 scene, ADR 20261015-1341 결정 R1 · R2).
 *
 *  1. 로드 시 메시 0 — 설정 전에는 아무것도 만들지 않는다.
 *  2. 끝점 = A · B 의 body `mesh.position` float32 값 (DoD E4 의 단위 축) — 설정 직후 · 시간 위상 · 일시정지 중 tier 전환
 *     · 일시정지 중 포커스 이동 · N-body 엔진 · N-body → Kepler 복귀.
 *  3. §교차검증 합의 1 — 설정 명령은 마지막으로 메시에 쓴 `(origin, scale)` 로 1회 동기한다. **새 기준계를 만들지 않는다**:
 *     T3 포커스 + 시간 위상 2회 뒤 (기록 기준계 ≠ 현재 `originOffset` 을 전제로 단언) 설정해도 끝점 = 메시.
 *  4. 무효 쌍 (null · 같은 천체 · 미등록 id) → 끔 · 꺼진 동안 정점 갱신 0.
 *  5. 정적 — 자 메시 가시성 쓰기는 `setRuler` 안에만 · 자 모듈은 가시성 · observer · `onOriginShift` 를 쓰지 않는다.
 *
 * 픽스처는 `solar-system-scene-trails.test.ts` 와 같다 (OffscreenCanvas 스텁 포함).
 */
import fs from 'node:fs';
import path from 'node:path';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import { RULER_LINE_MESH_NAME } from './ruler-line.js';

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

/** 끝점 (A, B) ↔ 각 천체 mesh.position 의 float32 값. 불일치 목록을 돌려준다. */
function endpointMismatches(f: Fixture, aId: string, bId: string): string[] {
  const p = f.handles.getRulerLine()!.positions;
  const bad: string[] = [];
  [aId, bId].forEach((id, end) => {
    const m = f.handles.meshes.get(id)!.position;
    if (
      p[3 * end] !== Math.fround(m.x) ||
      p[3 * end + 1] !== Math.fround(m.y) ||
      p[3 * end + 2] !== Math.fround(m.z)
    ) {
      bad.push(id);
    }
  });
  return bad;
}

/** 공허 통과 방지 — 두 끝점이 0 버퍼가 아니고 서로 다르다. */
function expectFilledAndDistinct(f: Fixture): void {
  const p = f.handles.getRulerLine()!.positions;
  expect(p.some((x) => x !== 0)).toBe(true);
  expect(p[0] !== p[3] || p[1] !== p[4] || p[2] !== p[5]).toBe(true);
}

describe('#1341 PR2 거리 자 — 장면 통합', () => {
  it('로드 시 자 메시 0', () => {
    const f = makeScene();
    expect(f.handles.getRulerLine()).toBeNull();
    expect(f.scene.getMeshByName(RULER_LINE_MESH_NAME)).toBeNull();
  });

  it('합의 1 — 일시정지 중 설정해도 즉시 그려지고 끝점 = mesh.position (행성 · 위성 쌍)', () => {
    const f = makeScene();
    f.handles.updateAt(J2000 + 100.25);
    // 이후 updateAt 없음 = 일시정지
    f.handles.setRuler('earth', 'mars');
    const line = f.handles.getRulerLine()!;
    expect(line.mesh.isEnabled()).toBe(true);
    expect(endpointMismatches(f, 'earth', 'mars')).toEqual([]);
    expectFilledAndDistinct(f);
    f.handles.setRuler('earth', 'moon');
    expect(endpointMismatches(f, 'earth', 'moon')).toEqual([]);
    expectFilledAndDistinct(f);
  });

  it('결정 R2 — 시간 위상 (updateAt) 마다 끝점이 메시를 따라간다', () => {
    const f = makeScene();
    f.handles.setRuler('jupiter', 'io');
    const before = Float32Array.from(f.handles.getRulerLine()!.positions);
    f.handles.updateAt(J2000 + 0.5);
    expect(endpointMismatches(f, 'jupiter', 'io')).toEqual([]);
    // 전제 — 실제로 움직였다 (같은 값 비교의 공허 통과 방지).
    expect(
      Buffer.from(f.handles.getRulerLine()!.positions.buffer).equals(Buffer.from(before.buffer)),
    ).toBe(false);
  });

  it('합의 1 · E4 — 일시정지 중 tier 전환 · 포커스 이동 · 재생 1 프레임 뒤에도 끝점 = mesh.position', () => {
    const f = makeScene();
    f.handles.updateAt(J2000 + 42);
    f.handles.setRuler('earth', 'mars');
    const scale0 = f.handles.getBodyReferenceFrame().scale;
    f.handles.setTier('inner');
    expect(f.handles.getBodyReferenceFrame().scale).not.toBe(scale0); // 전제: 실제로 바뀜
    expect(endpointMismatches(f, 'earth', 'mars')).toEqual([]);
    f.handles.setTier('body');
    f.handles.setFocusOrigin('earth');
    expect(endpointMismatches(f, 'earth', 'mars')).toEqual([]);
    f.handles.updateAt(J2000 + 42.01);
    expect(endpointMismatches(f, 'earth', 'mars')).toEqual([]);
    const frame = f.handles.getBodyReferenceFrame();
    expect(Math.hypot(frame.originX, frame.originY, frame.originZ)).toBeGreaterThan(1e10);
  });

  it('PR1 리뷰 교훈 · 합의 1 — T3 지구 포커스에서 시간 위상 2회 뒤 설정해도 끝점 = mesh.position (새 기준계 없음)', () => {
    const f = makeScene();
    f.handles.setTier('body');
    f.handles.setFocusOrigin('earth');
    f.handles.updateAt(J2000 + 1);
    f.handles.updateAt(J2000 + 2);
    // 전제 — primary follow 가 mesh 루프 뒤에 origin 을 옮겨, 기록 기준계와 현재 origin 이 실제로 다르다.
    // (현재 `originOffset` 으로 동기하는 변이는 이 전제 아래에서 끝점이 메시와 어긋나 FAIL 한다.)
    const frame = f.handles.getBodyReferenceFrame();
    const origin = f.handles.floatingOrigin.originOffset;
    expect(origin[0]).not.toBe(frame.originX);
    f.handles.setRuler('earth', 'moon');
    expect(endpointMismatches(f, 'earth', 'moon')).toEqual([]);
    expectFilledAndDistinct(f);
  });

  it('엔진 게이트 없음 — Newton 에서도 끝점 = mesh.position · 일시정지 중 Kepler 복귀 직후도 = mesh.position', () => {
    const f = makeScene();
    f.handles.updateAt(J2000);
    f.handles.setRuler('earth', 'moon');
    f.handles.setPhysicsEngine('newton');
    f.handles.updateAt(J2000 + 10);
    expect(f.handles.getRulerLine()!.mesh.isEnabled()).toBe(true);
    expect(endpointMismatches(f, 'earth', 'moon')).toEqual([]);
    const onNewton = Float32Array.from(f.handles.getRulerLine()!.positions);
    f.handles.setPhysicsEngine('kepler');
    // 이후 updateAt 없음 = 일시정지 중 복귀. PR1 이 넣은 `updateAt(currentJd)` 가 메시 · 자 선을 함께 다시 쓴다.
    expect(endpointMismatches(f, 'earth', 'moon')).toEqual([]);
    const onReturn = Float32Array.from(f.handles.getRulerLine()!.positions);
    // 전제 — 복귀가 실제로 위치를 바꿨다 (N-body 물리 위치 → Kepler × 위성 시각 배율).
    expect(Buffer.from(onReturn.buffer).equals(Buffer.from(onNewton.buffer))).toBe(false);
    // 정상 상태 — 같은 jd 에서 시간 위상을 한 번 더 돌린 결과와 바이트 동일.
    f.handles.updateAt(J2000 + 10);
    expect(
      Buffer.from(f.handles.getRulerLine()!.positions.buffer).equals(Buffer.from(onReturn.buffer)),
    ).toBe(true);
  });

  it('결정 R1 — 무효 쌍 (선택 없음 · 같은 천체 · 미등록 id) 은 끔 · 꺼진 동안 정점 갱신 0', () => {
    const f = makeScene();
    f.handles.setRuler('earth', 'mars');
    const line = f.handles.getRulerLine()!;
    const commit = vi.spyOn(line, 'commit');
    for (const [a, b] of [
      ['earth', null],
      [null, 'mars'],
      ['earth', 'earth'],
      ['earth', 'nope'],
    ] as const) {
      f.handles.setRuler(a, b);
      expect(line.mesh.isEnabled(), `${a}-${b}`).toBe(false);
    }
    f.handles.updateAt(J2000 + 3);
    f.handles.setTier('inner');
    expect(commit).toHaveBeenCalledTimes(0);
    // 다시 유효 쌍 → 같은 메시 재사용 · 켬 · 즉시 동기
    f.handles.setRuler('venus', 'mars');
    expect(f.handles.getRulerLine()).toBe(line);
    expect(line.mesh.isEnabled()).toBe(true);
    expect(commit).toHaveBeenCalledTimes(1);
    expect(endpointMismatches(f, 'venus', 'mars')).toEqual([]);
  });

  it('지연 생성 1회 · isPickable false · dispose 시 해제', () => {
    const f = makeScene();
    f.handles.setRuler('earth', 'mars');
    const first = f.handles.getRulerLine()!;
    f.handles.setRuler(null, null);
    f.handles.setRuler('earth', 'jupiter');
    expect(f.handles.getRulerLine()).toBe(first);
    expect(f.scene.meshes.filter((m) => m.name === RULER_LINE_MESH_NAME)).toHaveLength(1);
    expect(first.mesh.isPickable).toBe(false);
    expect(first.positions.length).toBe(6);
    f.handles.dispose();
    expect(first.mesh.isDisposed()).toBe(true);
    fixtures.splice(0); // 이미 dispose 함
    f.scene.dispose();
    f.engine.dispose();
  });
});

describe('#1341 PR2 결정 R2 — 정적 단언 (가시성 쓰기 · observer · onOriginShift)', () => {
  /** 주석 제거 — 서술 속 토큰에 걸리지 않도록 코드만 본다. */
  function codeOf(file: string): string {
    const src = fs.readFileSync(path.join(__dirname, file), 'utf-8');
    return src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/\/\/.*$/gm, '');
  }
  function closureBody(code: string, name: string): string {
    const start = code.indexOf(`const ${name} = `);
    expect(start, name).toBeGreaterThanOrEqual(0);
    const end = code.indexOf('\n  };', start);
    expect(end, name).toBeGreaterThan(start);
    return code.slice(start, end);
  }

  it('자 메시 가시성 쓰기는 setRuler (명령 핸들러) 안에만 있다', () => {
    const code = codeOf('solar-system-scene.ts');
    const visWrite = /rulerLine\??\.mesh\.(setEnabled|isVisible)/g;
    const all = code.match(visWrite) ?? [];
    const inSetRuler = closureBody(code, 'setRuler').match(visWrite) ?? [];
    expect(all.length).toBeGreaterThan(0); // 전제 — 패턴이 실제 코드에 걸린다
    expect(inSetRuler.length).toBe(all.length);
  });

  it('syncRuler 호출부 = updateAt · setTier · 명령 시 1회 동기 (그 외 0)', () => {
    const code = codeOf('solar-system-scene.ts');
    // 호출만 센다 (정의 `const syncRuler = (` 는 매칭 밖) — syncRulerToLastBodyFrame 안 1 + setTier 1 + updateAt 1.
    const calls = code.match(/\bsyncRuler\(/g) ?? [];
    expect(calls).toHaveLength(3);
    expect(closureBody(code, 'updateAt')).toContain('syncRuler(');
    expect(closureBody(code, 'setTier')).toContain('syncRuler(');
    expect(closureBody(code, 'syncRulerToLastBodyFrame')).toContain('syncRuler(');
    const toLast = code.match(/\bsyncRulerToLastBodyFrame\(\)/g) ?? [];
    expect(toLast).toHaveLength(1);
    expect(closureBody(code, 'setRuler')).toContain('syncRulerToLastBodyFrame()');
  });

  it('자 모듈은 가시성 · observer · onOriginShift 를 쓰지 않는다', () => {
    const code = codeOf('ruler-line.ts');
    expect(code).not.toMatch(/setEnabled\(|\.isVisible\s*=/);
    expect(code).not.toMatch(/Observable\.add/);
    expect(code).not.toMatch(/onOriginShift/);
  });
});
