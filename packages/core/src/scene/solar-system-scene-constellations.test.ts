/**
 * #1373 PR2 — 장면의 별자리 선 수명 (ADR `20261018-1373` 결정 D3 · R6 · T1 · T3 · T4 · N2, NullEngine).
 *
 * fetch 를 가짜로 바꿔 두 파일 (카탈로그 · 별자리) 의 응답 시점을 테스트가 정한다. 판정 대상:
 *   - 기본 꺼짐 — 켜기 전에는 `constellations.json` 요청 0
 *   - 두 파일이 **모두** 도착한 뒤에만 선 메시 생성 (도착 순서 무관) · 파일마다 장면당 1회
 *   - 카탈로그는 별 배경과 공유 (요청 1회) · `?stars=off` 로드에서는 별 쿼드를 만들지 않는다 (T3 독립)
 *   - 도착 시 **그 시점의** 의도로 가시성 · dispose 후 도착 → 생성 0 · 실패 → warn 1회
 *   - 인덱스 범위 밖 별자리는 건너뜀 (+ warn) · 그리기 순서 (투명 큐 · alphaIndex · depth write off · infiniteDistance)
 *   - 라벨 투영 (`getConstellationScreenInfo`) — 꺼짐 = 빈 배열 · 켜짐 = 결합 통과 별자리 수
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import { STAR_CATALOG_ALPHA_INDEX, STAR_CATALOG_MESH_NAME } from './star-catalog.js';
import {
  CONSTELLATION_LINES_ALPHA_INDEX,
  CONSTELLATION_LINES_MESH_NAME,
} from './constellation-lines.js';
import { CONSTELLATIONS_FORMAT } from './constellation-data.js';

const BASE_URL = '/data/stars/';
const CATALOG_URL = `${BASE_URL}star-catalog.bin`;
const CONS_URL = `${BASE_URL}constellations.json`;

/** 유효한 3개짜리 카탈로그 (`STC1` · count 3 — 시리우스 · 북극성 · 베가). */
function catalogBuffer(): ArrayBuffer {
  const rows: Array<[number, number, number, number]> = [
    [101.287216, -16.716116, -144, 9],
    [37.946251, 89.264107, 197, 636],
    [279.2346, 38.783692, 3, -1],
  ];
  const buf = new ArrayBuffer(8 + 12 * rows.length);
  const view = new DataView(buf);
  'STC1'.split('').forEach((ch, i) => view.setUint8(i, ch.charCodeAt(0)));
  view.setUint32(4, rows.length, true);
  rows.forEach(([ra, dec, v, bv], i) => {
    const o = 8 + 12 * i;
    view.setFloat32(o, ra, true);
    view.setFloat32(o + 4, dec, true);
    view.setInt16(o + 8, v, true);
    view.setInt16(o + 10, bv, true);
  });
  return buf;
}

/** 별자리 3개 — B 는 인덱스 3 (범위 밖) 이라 건너뛰어야 한다. */
function constellationsJson() {
  return {
    format: CONSTELLATIONS_FORMAT,
    constellations: [
      { id: 'A', nameKo: '가자리', label: [100, -10], lines: [0, 1, 1, 2] },
      { id: 'B', nameKo: '나자리', label: [40, 80], lines: [0, 3] },
      { id: 'C', nameKo: '다자리', label: [280, 40], lines: [2, 0] },
    ],
  };
}

interface Deferred {
  resolve: (body: unknown) => void;
  reject: (err: Error) => void;
}

/** fetch 가짜 — URL 별 대기 응답. */
function installFetch(): { calls: string[]; pending: Map<string, Deferred> } {
  const calls: string[] = [];
  const pending = new Map<string, Deferred>();
  vi.stubGlobal(
    'fetch',
    vi.fn((url: string) => {
      calls.push(url);
      return new Promise((resolve, reject) => {
        pending.set(url, {
          resolve: (body) =>
            resolve({
              ok: true,
              status: 200,
              arrayBuffer: async () => body,
              json: async () => body,
            }),
          reject,
        });
      });
    }),
  );
  return { calls, pending };
}

const flush = async () => {
  for (let i = 0; i < 8; i += 1) await Promise.resolve();
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

const linesMesh = (scene: Scene) => scene.getMeshByName(CONSTELLATION_LINES_MESH_NAME);

describe('#1373 PR2 별자리 — 요청 게이트 (T1 기본 꺼짐)', () => {
  it('켜기 전에는 constellations.json 요청 0 · 선 메시 0', async () => {
    const { calls } = installFetch();
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    await flush();
    expect(calls).toEqual([CATALOG_URL]);
    expect(linesMesh(f.scene)).toBeNull();
    expect(f.handles.getConstellationScreenInfo()).toHaveLength(0);
  });

  it('starCatalogBaseUrl 미지정 → 켜도 fetch 0', async () => {
    const { calls } = installFetch();
    const f = makeScene({ starfield: true });
    f.handles.setConstellationsVisible(true);
    await flush();
    expect(calls).toHaveLength(0);
    expect(linesMesh(f.scene)).toBeNull();
  });
});

describe('#1373 PR2 별자리 — 비동기 수명 (T4)', () => {
  it.each(['카탈로그 먼저', '별자리 먼저'] as const)(
    '두 파일이 모두 도착한 뒤에만 생성 (%s) · 결합 통과 선분만 · 파일당 1회',
    async (order) => {
      const { calls, pending } = installFetch();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
      f.handles.setConstellationsVisible(true);
      // 카탈로그는 별 배경과 공유 — 추가 요청 없음.
      expect(calls).toEqual([CATALOG_URL, CONS_URL]);
      const [first, second] =
        order === '카탈로그 먼저'
          ? ([CATALOG_URL, catalogBuffer()] as const)
          : ([CONS_URL, constellationsJson()] as const);
      pending.get(first)!.resolve(second);
      await flush();
      expect(linesMesh(f.scene)).toBeNull();
      if (order === '카탈로그 먼저') pending.get(CONS_URL)!.resolve(constellationsJson());
      else pending.get(CATALOG_URL)!.resolve(catalogBuffer());
      await flush();
      const mesh = linesMesh(f.scene)!;
      // A 2 선분 + C 1 선분 (B 는 인덱스 3 ≥ 3 이라 건너뜀) = 3 선분 = 6 정점.
      expect(mesh.getTotalVertices()).toBe(6);
      expect(f.handles.getConstellationLines()!.segmentCount).toBe(3);
      expect(warn).toHaveBeenCalledTimes(1);
      expect(String(warn.mock.calls[0]![0])).toContain('B');
      expect(mesh.isEnabled()).toBe(true);
      // 왕복 — 재요청 · 재생성 없음.
      f.handles.setConstellationsVisible(false);
      expect(mesh.isEnabled()).toBe(false);
      f.handles.setConstellationsVisible(true);
      expect(mesh.isEnabled()).toBe(true);
      expect(calls).toHaveLength(2);
      expect(f.scene.meshes.filter((m) => m.name === CONSTELLATION_LINES_MESH_NAME)).toHaveLength(
        1,
      );
    },
  );

  it('fetch 중에 끈 토글은 도착으로 다시 켜지지 않는다', async () => {
    const { pending } = installFetch();
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    f.handles.setConstellationsVisible(true);
    f.handles.setConstellationsVisible(false);
    pending.get(CATALOG_URL)!.resolve(catalogBuffer());
    pending.get(CONS_URL)!.resolve(constellationsJson());
    await flush();
    expect(linesMesh(f.scene)!.isEnabled()).toBe(false);
    expect(f.handles.getConstellationScreenInfo()).toHaveLength(0);
  });

  it('dispose 후 도착 → 아무것도 만들지 않는다 (경고 0)', async () => {
    const { pending } = installFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    f.handles.setConstellationsVisible(true);
    const scene = f.scene;
    f.dispose();
    pending.get(CATALOG_URL)!.resolve(catalogBuffer());
    pending.get(CONS_URL)!.resolve(constellationsJson());
    await flush();
    expect(scene.meshes.some((m) => m.name === CONSTELLATION_LINES_MESH_NAME)).toBe(false);
    expect(warn).not.toHaveBeenCalled();
  });

  it('별자리 fetch 실패 → warn 1회 · console.error 0 · 재시도 없음 · 별 쿼드는 그대로', async () => {
    const { calls, pending } = installFetch();
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    const error = vi.spyOn(console, 'error');
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    f.handles.setConstellationsVisible(true);
    pending.get(CATALOG_URL)!.resolve(catalogBuffer());
    pending.get(CONS_URL)!.reject(new Error('network'));
    await flush();
    expect(warn).toHaveBeenCalledTimes(1);
    expect(error).not.toHaveBeenCalled();
    expect(linesMesh(f.scene)).toBeNull();
    expect(f.scene.getMeshByName(STAR_CATALOG_MESH_NAME)).not.toBeNull();
    f.handles.setConstellationsVisible(false);
    f.handles.setConstellationsVisible(true);
    expect(calls).toHaveLength(2);
  });
});

describe('#1373 PR2 별자리 — `?stars=` 와 독립 (T3)', () => {
  it('starfield=false 로드 + 별자리 켬 → 카탈로그 · 별자리 요청, 선 생성, 별 쿼드는 만들지 않는다 → 별 배경 ON 때 생성', async () => {
    const { calls, pending } = installFetch();
    const f = makeScene({ starfield: false, starCatalogBaseUrl: BASE_URL });
    f.handles.setConstellationsVisible(true);
    expect(calls).toEqual([CATALOG_URL, CONS_URL]);
    pending.get(CATALOG_URL)!.resolve(catalogBuffer());
    pending.get(CONS_URL)!.resolve(constellationsJson());
    await flush();
    expect(linesMesh(f.scene)!.isEnabled()).toBe(true);
    expect(f.scene.getMeshByName(STAR_CATALOG_MESH_NAME)).toBeNull();
    expect(f.scene.getMeshByName('starfield')).toBeNull();
    f.handles.setStarfieldVisible(true);
    expect(f.scene.getMeshByName(STAR_CATALOG_MESH_NAME)!.isEnabled()).toBe(true);
    // 카탈로그는 이미 있어 재요청 없음.
    expect(calls).toHaveLength(2);
    // 별 배경을 꺼도 별자리 선은 그대로다.
    f.handles.setStarfieldVisible(false);
    expect(linesMesh(f.scene)!.isEnabled()).toBe(true);
  });
});

describe('#1373 PR2 별자리 — 그리기 계약 (R6 · D7)', () => {
  it('투명 큐 (alpha < 1 · needAlphaBlending) · alphaIndex = 별 + 1 · depth write off · infiniteDistance · 그룹 0 · pick 불가', async () => {
    const { pending } = installFetch();
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    f.handles.setConstellationsVisible(true);
    pending.get(CATALOG_URL)!.resolve(catalogBuffer());
    pending.get(CONS_URL)!.resolve(constellationsJson());
    await flush();
    const mesh = linesMesh(f.scene)!;
    expect(CONSTELLATION_LINES_ALPHA_INDEX).toBe(STAR_CATALOG_ALPHA_INDEX + 1);
    expect(mesh.alphaIndex).toBe(CONSTELLATION_LINES_ALPHA_INDEX);
    expect(mesh.infiniteDistance).toBe(true);
    expect(mesh.isPickable).toBe(false);
    expect(mesh.renderingGroupId).toBe(0);
    expect(mesh.material!.needAlphaBlendingForMesh(mesh)).toBe(true);
    expect(mesh.material!.disableDepthWrite).toBe(true);
  });
});

describe('#1373 PR2 별자리 라벨 투영 (N2)', () => {
  it('켜짐 → 결합 통과 별자리마다 1행 (id · 이름) · 꺼짐 → 빈 배열', async () => {
    const { pending } = installFetch();
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    f.handles.setConstellationsVisible(true);
    pending.get(CATALOG_URL)!.resolve(catalogBuffer());
    pending.get(CONS_URL)!.resolve(constellationsJson());
    await flush();
    const rows = f.handles.getConstellationScreenInfo();
    expect(rows.map((r) => [r.id, r.nameKo])).toEqual([
      ['A', '가자리'],
      ['C', '다자리'],
    ]);
    for (const r of rows) {
      expect(Number.isFinite(r.x) || !r.inFront).toBe(true);
      expect(r.onScreen).toBe(r.inFront && r.x >= 0 && r.x <= 1280 && r.y >= 0 && r.y <= 720);
    }
    f.handles.setConstellationsVisible(false);
    expect(f.handles.getConstellationScreenInfo()).toHaveLength(0);
  });

  it('카메라 정면 방향 기준점 → 화면 중앙에 투영 (무한 원거리 — 카메라 위치 무관)', async () => {
    const { pending } = installFetch();
    const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
    f.handles.setConstellationsVisible(true);
    pending.get(CATALOG_URL)!.resolve(catalogBuffer());
    pending.get(CONS_URL)!.resolve(constellationsJson());
    await flush();
    const cam = f.scene.activeCamera as ArcRotateCamera;
    const { constellationLabelSceneDirection } = await import('./constellation-data.js');
    const dir = constellationLabelSceneDirection({
      id: 'A',
      nameKo: '가자리',
      labelRaDeg: 100,
      labelDecDeg: -10,
      lines: [],
    });
    for (const radius of [50, 5000]) {
      // 카메라를 기준점 반대편에 두고 원점을 보게 한다 → 시선 = dir.
      cam.setTarget(Vector3.Zero());
      cam.setPosition(new Vector3(-dir[0] * radius, -dir[1] * radius, -dir[2] * radius));
      f.scene.render();
      const row = f.handles.getConstellationScreenInfo().find((r) => r.id === 'A')!;
      expect(row.inFront).toBe(true);
      expect(row.x).toBeCloseTo(640, 0);
      expect(row.y).toBeCloseTo(360, 0);
    }
  });
});
