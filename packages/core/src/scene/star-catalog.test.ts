/**
 * #1373 — 별 카탈로그 쿼드 메시 (ADR `20261018-1373` 결정 R1 · D6 · D7).
 *
 * 1. 정점 버퍼 — 쿼드 4 정점이 같은 장면 방향 × 반지름, 크기 · 색은 R2 · R3 함수값 그대로.
 * 2. 메시 · 머티리얼 계약 (NullEngine) — 무한 원거리 · 비선택 · 그룹 0 · 투명 큐 맨 앞 · 가산 · depth write off.
 * 3. px 계약 — `uPxToClip` · DPR 배율은 매 draw 엔진에서 다시 읽는다.
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { Constants, NullEngine, Scene } from '@babylonjs/core';
import {
  STAR_CATALOG_ALPHA_INDEX,
  STAR_CATALOG_FRAGMENT_SHADER,
  STAR_CATALOG_MESH_NAME,
  STAR_CATALOG_RADIUS,
  STAR_CATALOG_VERTEX_SHADER,
  buildStarCatalogVertexData,
  createStarCatalog,
} from './star-catalog.js';
import {
  bvToRgb,
  starIntensity,
  starRadiusCssPx,
  starSceneDirection,
  type StarCatalog,
} from './star-catalog-data.js';

function catalogOf(rows: Array<[number, number, number, number]>): StarCatalog {
  return {
    count: rows.length,
    raDeg: Float32Array.from(rows.map((r) => r[0])),
    decDeg: Float32Array.from(rows.map((r) => r[1])),
    mag: Float32Array.from(rows.map((r) => r[2])),
    bv: Float32Array.from(rows.map((r) => r[3])),
  };
}

// 시리우스 · 북극성 · B−V 결측 어두운 별.
const CATALOG = catalogOf([
  [101.287216, -16.716116, -1.44, 0.009],
  [37.946251, 89.264107, 1.97, 0.636],
  [200, -60, 6.5, Number.NaN],
]);

describe('#1373 buildStarCatalogVertexData', () => {
  it('별 i 의 쿼드 4 정점 = 장면 방향 × STAR_CATALOG_RADIUS (float32), 인덱스 6i … 6i+5', () => {
    const d = buildStarCatalogVertexData(CATALOG);
    expect(d.positions).toHaveLength(CATALOG.count * 4 * 3);
    expect(d.indices).toHaveLength(CATALOG.count * 6);
    for (let i = 0; i < CATALOG.count; i += 1) {
      const dir = starSceneDirection(CATALOG, i);
      for (let c = 0; c < 4; c += 1) {
        const o = (i * 4 + c) * 3;
        for (let k = 0; k < 3; k += 1) {
          expect(d.positions[o + k]).toBe(Math.fround(dir[k]! * STAR_CATALOG_RADIUS));
        }
      }
      expect([...d.indices.slice(i * 6, i * 6 + 6)]).toEqual([
        i * 4,
        i * 4 + 1,
        i * 4 + 2,
        i * 4,
        i * 4 + 2,
        i * 4 + 3,
      ]);
    }
  });

  it('starShape = (모서리 ±1, ±1, 반지름 CSS px) · starColor = bvToRgb × 밝기', () => {
    const d = buildStarCatalogVertexData(CATALOG);
    for (let i = 0; i < CATALOG.count; i += 1) {
      const rgb = bvToRgb(CATALOG.bv[i]!);
      const intensity = starIntensity(CATALOG.mag[i]!);
      const corners = new Set<string>();
      for (let c = 0; c < 4; c += 1) {
        const o = (i * 4 + c) * 3;
        corners.add(`${d.starShape[o]},${d.starShape[o + 1]}`);
        expect(d.starShape[o + 2]).toBe(Math.fround(starRadiusCssPx(CATALOG.mag[i]!)));
        for (let k = 0; k < 3; k += 1) {
          expect(d.starColor[o + k]).toBe(Math.fround(rgb[k]! * intensity));
        }
      }
      expect([...corners].sort()).toEqual(['-1,-1', '-1,1', '1,-1', '1,1']);
    }
  });
});

describe('#1373 createStarCatalog — 메시 · 머티리얼 계약 (NullEngine)', () => {
  const fixtures: Array<{ engine: NullEngine; scene: Scene }> = [];
  afterEach(() => {
    vi.restoreAllMocks();
    for (const f of fixtures.splice(0)) {
      f.scene.dispose();
      f.engine.dispose();
    }
  });
  const makeScene = () => {
    const engine = new NullEngine({
      renderWidth: 1280,
      renderHeight: 720,
      textureSize: 512,
      deterministicLockstep: false,
      lockstepMaxSteps: 1,
    });
    const scene = new Scene(engine);
    fixtures.push({ engine, scene });
    return { engine, scene };
  };

  it('무한 원거리 · 비선택 · 그룹 0 · 컬링 제외 · 투명 큐 맨 앞 (코로나 0 보다 앞)', () => {
    const { scene } = makeScene();
    const h = createStarCatalog(scene, CATALOG);
    expect(h.mesh.name).toBe(STAR_CATALOG_MESH_NAME);
    expect(h.count).toBe(3);
    expect(h.mesh.getTotalVertices()).toBe(12);
    expect(h.mesh.getTotalIndices()).toBe(18);
    expect(h.mesh.infiniteDistance).toBe(true);
    expect(h.mesh.isPickable).toBe(false);
    expect(h.mesh.renderingGroupId).toBe(0);
    expect(h.mesh.alwaysSelectAsActiveMesh).toBe(true);
    expect(h.mesh.alphaIndex).toBe(STAR_CATALOG_ALPHA_INDEX);
    expect(STAR_CATALOG_ALPHA_INDEX).toBeLessThan(0);
    h.dispose();
  });

  it('가산 블렌드 (투명 큐 → 가드 D8p 대상 밖) · depth write off · 로그 depth 미사용', () => {
    const { scene } = makeScene();
    const h = createStarCatalog(scene, CATALOG);
    expect(h.material.needAlphaBlending()).toBe(true);
    expect(h.material.alphaMode).toBe(Constants.ALPHA_ADD);
    expect(h.material.disableDepthWrite).toBe(true);
    expect(h.mesh.material).toBe(h.material);
    // body 가 쓴 로그 depth 보다 항상 뒤 → depth test 로 원반 뒤 별이 가려진다 (D6). 로그 depth 를 쓰면 이 전제가 깨진다.
    expect(STAR_CATALOG_FRAGMENT_SHADER).not.toContain('gl_FragDepth');
    expect(STAR_CATALOG_VERTEX_SHADER).not.toContain('logDepth');
    h.dispose();
  });

  it('uPxToClip · DPR 배율은 매 호출 엔진에서 다시 읽는다 (리사이즈 · DPR 변경 반영)', () => {
    const { engine, scene } = makeScene();
    const h = createStarCatalog(scene, CATALOG);
    h.applyFrameUniforms();
    expect(h.readFrameUniforms()).toEqual({ pxToClip: [2 / 1280, 2 / 720], pxScale: 1 });
    vi.spyOn(engine, 'getRenderWidth').mockReturnValue(750);
    vi.spyOn(engine, 'getRenderHeight').mockReturnValue(1624);
    vi.spyOn(engine, 'getHardwareScalingLevel').mockReturnValue(0.5);
    h.applyFrameUniforms();
    expect(h.readFrameUniforms()).toEqual({ pxToClip: [2 / 750, 2 / 1624], pxScale: 2 });
    h.dispose();
  });

  it('dispose — 메시 · 머티리얼 해제', () => {
    const { scene } = makeScene();
    const h = createStarCatalog(scene, CATALOG);
    h.dispose();
    expect(scene.getMeshByName(STAR_CATALOG_MESH_NAME)).toBeNull();
    expect(scene.materials.includes(h.material)).toBe(false);
  });
});
