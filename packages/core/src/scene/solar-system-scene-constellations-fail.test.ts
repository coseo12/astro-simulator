/**
 * #1373 PR2 — 선 메시 생성 실패 경고의 접두사 (PR #1376 리뷰 권고 4).
 *
 * 카탈로그가 별자리 파일보다 **늦게** 오면 선 생성은 카탈로그 fetch 의 `.then` 안에서 돈다. 생성이 throw 하면 (LinesMesh 내부
 * 머티리얼 형태 불변식) 경고가 `[star-catalog] … 로드 실패` 로 원인을 잘못 가리켰다. `createConstellationLines` 를 throw 하는
 * 가짜로 바꿔 두 도착 순서 모두 `[constellations]` 접두사 1회 · 별 쿼드는 그대로임을 고정한다 (모듈 mock 은 파일 단위라 분리).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import { createSolarSystemScene, type SolarSystemSceneHandles } from './solar-system-scene.js';
import { STAR_CATALOG_MESH_NAME } from './star-catalog.js';
import { CONSTELLATIONS_FORMAT } from './constellation-data.js';
import type * as ConstellationLinesModule from './constellation-lines.js';

vi.mock('./constellation-lines.js', async (importOriginal) => {
  const actual = await importOriginal<typeof ConstellationLinesModule>();
  return {
    ...actual,
    createConstellationLines: () => {
      throw new Error('내부 머티리얼 불변식');
    },
  };
});

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

describe('#1373 PR2 선 생성 실패 — 경고 접두사 (리뷰 권고 4)', () => {
  it.each(['카탈로그 늦게', '별자리 늦게'] as const)(
    '%s → [constellations] 경고 1회 · [star-catalog] 경고 0 · 별 쿼드 유지 · 선 0',
    async (order) => {
      const { pending } = installFetch();
      const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
      const f = makeScene({ starfield: true, starCatalogBaseUrl: BASE_URL });
      f.handles.setConstellationsVisible(true);
      if (order === '카탈로그 늦게') {
        pending.get(CONS_URL)!.resolve(constellationsJson());
        await flush();
        pending.get(CATALOG_URL)!.resolve(catalogBuffer());
      } else {
        pending.get(CATALOG_URL)!.resolve(catalogBuffer());
        await flush();
        pending.get(CONS_URL)!.resolve(constellationsJson());
      }
      await flush();
      const messages = warn.mock.calls.map((c) => String(c[0]));
      // B (인덱스 범위 밖) 건너뜀 경고 1 + 생성 실패 경고 1.
      expect(
        messages.filter((m) => m.startsWith('[constellations] 선 메시 생성 실패')),
      ).toHaveLength(1);
      expect(messages.filter((m) => m.startsWith('[star-catalog]'))).toEqual([]);
      expect(f.scene.getMeshByName(STAR_CATALOG_MESH_NAME)).not.toBeNull();
      expect(f.handles.getConstellationLines()).toBeNull();
      expect(f.handles.getConstellationScreenInfo()).toHaveLength(0);
    },
  );
});
