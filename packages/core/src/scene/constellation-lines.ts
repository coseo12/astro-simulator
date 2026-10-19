/**
 * #1373 PR2 — 별자리 선 메시 (ADR `docs/decisions/20261018-1373-star-catalog-constellations.md` 결정 R6 · D7).
 *
 * `LinesMesh` 1개 (`ruler-line.ts` 패턴) · 선분마다 정점 2개 (743 선분 = 1,486 정점) · 단색 uniform · draw call 1.
 *
 * ## 배치 계약
 *
 * - **무한 원거리 (D7)** — `infiniteDistance = true`. 정점은 끝점 별의 장면 방향 × `STAR_CATALOG_RADIUS` (별 쿼드와 같은
 *   반지름 · 같은 방향 함수 — 선 끝이 그려진 별과 정확히 만난다, D3 런타임 결합).
 * - **그리기 순서 (R6)** — 렌더 그룹 0 · `alpha < 1` 이라 투명 큐 (가드 D8p 대상 밖) · `alphaIndex =
 *   CONSTELLATION_LINES_ALPHA_INDEX` (별 쿼드 바로 뒤, 코로나 `0` 보다 앞) · depth write off · depth test 유지. 은하수 구 →
 *   body · 궤도선 → 별 쿼드 → 별자리 선 순이라 행성 원반 뒤의 선은 depth test 로 가려진다 (DoD D6).
 * - **depth** — `LinesMesh` 의 `color` 셰이더는 로그 depth 를 쓰지 않는다 (표준 depth — 별 쿼드 · starfield 와 같다). 반지름
 *   400 의 표준 depth (≈ 1 − 0.01/400) 는 body 의 로그 depth 보다 항상 뒤다.
 *
 * ## 이 모듈이 하지 않는 것
 *
 * 가시성 (`setEnabled`) 을 쓰지 않는다 — 장면의 명령 (`setConstellationsVisible`) 과 생성 직후 1회만 쓴다. 파일을 받지 않는다.
 */
import { Color3, LinesMesh, ShaderMaterial, VertexData, type Scene } from '@babylonjs/core';
import { buildConstellationLineVertexData, type ConstellationEntry } from './constellation-data.js';
import { STAR_CATALOG_ALPHA_INDEX, STAR_CATALOG_RADIUS } from './star-catalog.js';
import type { StarCatalog } from './star-catalog-data.js';

/** 메시 이름 — 진단 · 브라우저 측정이 이 이름으로 찾는다. */
export const CONSTELLATION_LINES_MESH_NAME = 'constellation-lines';
/** 투명 큐 순서 (R6) — 별 쿼드 바로 뒤. */
export const CONSTELLATION_LINES_ALPHA_INDEX = STAR_CATALOG_ALPHA_INDEX + 1;
/**
 * 선 색 (sRGB hex) · 불투명도 — rendering-only (최종값 D-T2 육안 승인). 궤도선 (청회색 `PLANET_ORBIT_COLOR`) 과 다른 계열
 * (따뜻한 모래색) 이라 겹쳐도 갈린다 (ADR R6 · §1-F 관측 2).
 */
export const CONSTELLATION_LINE_COLOR_HEX = '#b8a07a';
export const CONSTELLATION_LINE_ALPHA = 0.45;

export interface ConstellationLinesHandles {
  readonly mesh: LinesMesh;
  /** 그린 선분 수 (건너뛴 별자리 제외). */
  readonly segmentCount: number;
  dispose(): void;
}

export function createConstellationLines(
  scene: Scene,
  catalog: StarCatalog,
  entries: readonly ConstellationEntry[],
): ConstellationLinesHandles {
  const data = buildConstellationLineVertexData(catalog, entries, STAR_CATALOG_RADIUS);
  // 정점 색 · 정점 alpha 없음 — 단색은 LinesMesh 의 `color` uniform (색 + `mesh.alpha`) 이다.
  const mesh = new LinesMesh(CONSTELLATION_LINES_MESH_NAME, scene, null, null, false, false, false);
  const vertexData = new VertexData();
  vertexData.positions = data.positions;
  vertexData.indices = data.indices;
  vertexData.applyToMesh(mesh, false);
  mesh.color = Color3.FromHexString(CONSTELLATION_LINE_COLOR_HEX);
  mesh.alpha = CONSTELLATION_LINE_ALPHA;

  // ADR 738 §결정 1 · 6 / 결정 R6 — 별 쿼드와 같은 박제 설정.
  mesh.infiniteDistance = true;
  mesh.isPickable = false;
  mesh.renderingGroupId = 0;
  mesh.alphaIndex = CONSTELLATION_LINES_ALPHA_INDEX;
  // 하늘 전체에 퍼져 있어 절두체 컬링 이득이 없다 (별 쿼드 · trail 과 같은 이유).
  mesh.alwaysSelectAsActiveMesh = true;

  const material = mesh.material;
  // 투명 큐 · depth write 끔을 조용히 건너뛰지 않는다 — LinesMesh 내부 머티리얼 형태가 바뀌면 여기서 멈춘다 (trail-lines 선례).
  if (!(material instanceof ShaderMaterial)) {
    throw new Error(
      '[constellation-lines] LinesMesh 내부 머티리얼이 ShaderMaterial 이 아니다 — 투명 큐 · depth write 끔을 걸 수 없다',
    );
  }
  // `mesh.alpha` 는 color uniform 의 alpha 일 뿐 큐를 정하지 않는다 (내부 머티리얼은 `needAlphaBlending: false` 로 만들어진다).
  // 머티리얼 alpha 를 같은 값으로 둬 `needAlphaBlending()` 이 참이 되게 한다 → 투명 큐 (D8p 대상 밖) + 알파 블렌드.
  material.alpha = CONSTELLATION_LINE_ALPHA;
  material.disableDepthWrite = true;

  return {
    mesh,
    segmentCount: data.segmentCount,
    dispose: () => {
      mesh.dispose();
    },
  };
}
