/**
 * #1373 — 장면의 별 카탈로그 수명 (ADR `20261018-1373` 결정 T3 · T4 · R5, NullEngine).
 *
 * fetch 를 가짜로 바꿔 응답 시점을 테스트가 정한다. 판정 대상:
 *   - URL 미지정 · 별 구 미생성 (소프트웨어 렌더 경로) 이면 fetch 0 (R5)
 *   - fetch 는 장면당 1회 — 토글 왕복으로 늘지 않는다
 *   - 응답 도착 시 **그 시점의** 의도로 가시성 (fetch 중에 끈 토글이 응답으로 다시 켜지지 않는다)
 *   - dispose 후 도착 → 아무것도 만들지 않는다 · 실패 → `console.warn` 1회 · 콘솔 에러 0
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import { STAR_CATALOG_MESH_NAME } from './star-catalog.js';

const BASE_URL = '/data/stars/';

/** 유효한 2개짜리 카탈로그 (`STC1` · count 2). */
function catalogBuffer(): ArrayBuffer {
  const buf = new ArrayBuffer(8 + 12 * 2);
  const view = new DataView(buf);
  'STC1'.split('').forEach((ch, i) => view.setUint8(i, ch.charCodeAt(0)));
  view.setUint32(4, 2, true);
  view.setFloat32(8, 101.287216, true);
  view.setFloat32(12, -16.716116, true);
  view.setInt16(16, -144, true);
  view.setInt16(18, 9, true);
  view.setFloat32(20, 37.946251, true);
  view.setFloat32(24, 89.264107, true);
  view.setInt16(28, 197, true);
  view.setInt16(30, 636, true);
  return buf;
}

interface Deferred {
  resolve: (buf: ArrayBuffer) => void;
  reject: (err: Error) => void;
}

/** fetch 가짜 — 호출마다 대기 중인 응답 하나. */
function installFetch(): { calls: string[]; pending: Deferred[] } {
  const calls: string[] = [];
  const pending: Deferred[] = [];
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      calls.push(url);
      return new Promise((resolve, reject) => {
        pending.push({
          resolve: (buf) => resolve({ ok: true, status: 200, arrayBuffer: async () => buf }),
          reject,
        });
      });
    }),
  );
  return { calls, pending };
}

/** 마이크로태스크 비우기 (fetch → arrayBuffer → then 사슬). */
const flush = async () => {
  for (let i = 0; i < 5; i += 1) await Promise.resolve();
};

interface Fixture {
  scene: Scene;
  handles: SolarSystemSceneHandles;
  dispose: () => void;
}
const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) f.dispose();
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

function makeScene(options: Parameters<typeof createSolarSystemScene>[1]): Fixture {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 720,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 2, 50, Vector3.Zero(), scene);
  const handles = createSolarSystemScene(scene, options);
  let disposed = false;
  const f: Fixture = {
    scene,
    handles,
    dispose: () => {
      if (disposed) return;
      disposed = true;
      handles.dispose();
      scene.dispose();
      engine.dispose();
    },
  };
  fixtures.push(f);
  return f;
}

const starMesh = (scene: Scene) => scene.getMeshByName(STAR_CATALOG_MESH_NAME);

describe('#1373 장면 별 카탈로그 — fetch 게이트 (R5)', () => {
  it('starCatalogBaseUrl 미지정 → fetch 0 (은하수만)', async () => {
    const { calls } = installFetch();
    const f = makeScene({ starfield: true });
    f.handles.setStarfieldVisible(false);
    f.handles.setStarfieldVisible(true);
    await flush();
    expect(calls).toHaveLength(0);
    expect(starMesh(f.scene)).toBeNull();
  });

  it('starfield=false 로드 (소프트웨어 렌더 경로) → fetch 0, 첫 ON 에서 1회', async () => {
    const { calls } = installFetch();
    const f = makeScene({ starfield: false, starCatalogBaseUrl: BASE_URL });
    await flush();
    expect(calls).toHaveLength(0);
    f.handles.setStarfieldVisible(true);
    f.handles.setStarfieldVisible(false);
    f.handles.setStarfieldVisible(true);
    expect(calls).toEqual([`${BASE_URL}star-catalog.bin`]);
  });
});

describe('#1373 장면 별 카탈로그 — 비동기 수명 (T4)', () => {
  it('starfield=true 로드 → fetch 1회 → 도착 시 쿼드 생성 · 켜짐, 토글이 구와 쿼드를 함께 끈다 (T3)', async () => {
    const { calls, pending } = installFetch();
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    expect(calls).toEqual([`${BASE_URL}star-catalog.bin`]);
    expect(starMesh(f.scene)).toBeNull();
    pending[0]!.resolve(catalogBuffer());
    await flush();
    const mesh = starMesh(f.scene)!;
    expect(mesh.getTotalVertices()).toBe(8);
    expect(mesh.isEnabled()).toBe(true);
    f.handles.setStarfieldVisible(false);
    expect(mesh.isEnabled()).toBe(false);
    expect(f.scene.getMeshByName('starfield')!.isEnabled()).toBe(false);
    f.handles.setStarfieldVisible(true);
    expect(mesh.isEnabled()).toBe(true);
    // 왕복해도 재요청 · 재생성 없음.
    expect(calls).toHaveLength(1);
    expect(f.scene.meshes.filter((m) => m.name === STAR_CATALOG_MESH_NAME)).toHaveLength(1);
  });

  it('fetch 중에 끈 토글은 응답 도착으로 다시 켜지지 않는다', async () => {
    const { pending } = installFetch();
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    f.handles.setStarfieldVisible(false);
    pending[0]!.resolve(catalogBuffer());
    await flush();
    expect(starMesh(f.scene)!.isEnabled()).toBe(false);
  });

  it('dispose 후 도착 → 아무것도 만들지 않는다 (경고 0)', async () => {
    const { pending } = installFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    const scene = f.scene;
    f.dispose();
    pending[0]!.resolve(catalogBuffer());
    await flush();
    expect(scene.meshes.some((m) => m.name === STAR_CATALOG_MESH_NAME)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('fetch 실패 → console.warn 1회 · console.error 0 · 은하수 유지 · 재시도 없음', async () => {
    const { calls, pending } = installFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error');
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    pending[0]!.reject(new Error('network'));
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(starMesh(f.scene)).toBeNull();
    expect(f.scene.getMeshByName('starfield')!.isEnabled()).toBe(true);
    f.handles.setStarfieldVisible(false);
    f.handles.setStarfieldVisible(true);
    expect(calls).toHaveLength(1);
  });

  it('손상 파일 (크기 불일치) → 경고 1회 · 쿼드 0', async () => {
    const { pending } = installFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    pending[0]!.resolve(catalogBuffer().slice(0, 20));
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(starMesh(f.scene)).toBeNull();
  });
});
