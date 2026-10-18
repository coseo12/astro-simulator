/**
 * #1373 — 실측 별 카탈로그 렌더 (ADR `docs/decisions/20261018-1373-star-catalog-constellations.md` 결정 R1 · D7).
 *
 * 「N 개 쿼드 = 4N 정점」 단일 메시 + GLSL `ShaderMaterial` 1개 (draw call 1). 셰이더 골격은 `belt-particles.ts`
 * (ADR 1319) 와 같다 — 정점이 자기 별의 방향을 들고, clip 공간으로 투영한 뒤 화면 고정 px 만큼 모서리를 벌린다.
 *
 * ## 배치 계약
 *
 * - **무한 원거리 (D7)** — `infiniteDistance = true` (ADR 738 §결정 1 그대로). 엔진이 카메라 위치를 따라가게 하고 회전만
 *   반영한다 — 시차 0 · Floating Origin · tier · 줌 무관. 정점은 장면 방향 × `STAR_CATALOG_RADIUS` (starfield 구 안쪽).
 * - **좌표 (D6)** — 정점 방향은 `starSceneDirection` (적도 → 황도 데이터 → `toScene`). 메시 정점 쓰기가 유일한 반전 지점이다.
 * - **그리기 순서 (R1 · R6)** — 렌더 그룹 0 · 가산 블렌드 (투명 큐) · `alphaIndex = STAR_CATALOG_ALPHA_INDEX` (투명 큐 맨 앞,
 *   코로나 `0` 보다 앞) · depth write off · depth test 유지. 은하수 구 (불투명 큐 · depth write off) → body · 궤도선
 *   (불투명 · depth write) → 별 쿼드 순이라 행성 원반 뒤의 별은 depth test 로 가려진다 (D6).
 *   투명 큐라 가드 D8p (「그룹 0 불투명 메시 중 starfield 외는 depth write」, ADR 1265) 대상 밖이다.
 * - **depth** — 로그 depth 를 쓰지 않는다 (starfield 와 같은 표준 depth). body 가 쓴 로그 depth 보다 항상 뒤다
 *   (ADR §구현 인계 · POC 관측 1).
 *
 * ## px 계약 (R1)
 *
 * 반지름은 CSS px (`star-catalog-data.ts` R2) 이고 셰이더가 렌더 버퍼 배율 (`1 / hardwareScalingLevel` — DPR) 을 곱한다.
 * `uPxToClip` · 배율은 draw 직전 (`onBeforeRenderObservable`) 에 매번 렌더 버퍼 크기에서 다시 계산한다 — 리사이즈 · DPR
 * 변화 대응 (`belt-particles.ts` 와 같은 이유로 `onBindObservable` 이 아니다 — 그쪽은 값이 다음 draw 에 실린다).
 *
 * ## 이 모듈이 하지 않는 것
 *
 * 렌더러 종류를 모른다 (소프트웨어 렌더 게이트는 web 책임 — R5). 파일을 받지 않는다 (fetch 수명은 장면 — T4).
 */
import {
  Constants,
  Effect,
  Mesh,
  ShaderMaterial,
  Vector2,
  VertexData,
  type Scene,
} from '@babylonjs/core';
import {
  bvToRgb,
  starIntensity,
  starRadiusCssPx,
  starSceneDirection,
  type StarCatalog,
} from './star-catalog-data.js';

/** 메시 이름 — 진단 · 브라우저 측정이 이 이름으로 찾는다. */
export const STAR_CATALOG_MESH_NAME = 'star-catalog';
/** 정점 반지름 (scene unit) — starfield 구 반지름 (`STARFIELD_SPHERE_DIAMETER / 2 = 500`) 안쪽 (D7). */
export const STAR_CATALOG_RADIUS = 400;
/**
 * 투명 큐 순서 (R6 그리기 순서). 코로나 (`sun-corona.ts` `alphaIndex = 0`) 보다 앞. 별자리 선 (PR2) 은 이 값 + 1.
 */
export const STAR_CATALOG_ALPHA_INDEX = -2;
/**
 * 모서리 AA 여유 [물리 px] — 쿼드 반폭 = 반지름 + 여유. 프래그먼트가 원반 가장자리를 1 px 폭으로 부드럽게 깎는다
 * (반지름 1 px 미만의 별이 래스터 표본점을 비켜 깜박이지 않게).
 */
export const STAR_EDGE_SOFTNESS_PX = 1.0;

const SHADER_NAME = 'starCatalog';
const VERTICES_PER_QUAD = 4;
const INDICES_PER_QUAD = 6;
/** 쿼드 모서리 (clip 공간 오프셋 방향). */
const QUAD_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];

/**
 * 정점 셰이더. `starShape = (corner.x, corner.y, 반지름 CSS px)` · `starColor = 표시 색 × 밝기`.
 * `worldViewProjection` 은 `infiniteDistance` 가 카메라 이동을 지운 world 행렬을 포함한다.
 */
export const STAR_CATALOG_VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 starShape;
attribute vec3 starColor;

uniform mat4 worldViewProjection;
uniform vec2 uPxToClip;
uniform float uPxScale;

varying vec2 vCornerPx;
varying float vRadiusPx;
varying vec3 vColor;

const float EDGE_SOFTNESS_PX = ${STAR_EDGE_SOFTNESS_PX.toFixed(4)};

void main(void) {
  float radiusPx = starShape.z * uPxScale;
  float halfExtentPx = radiusPx + EDGE_SOFTNESS_PX;
  vec4 clip = worldViewProjection * vec4(position, 1.0);
  clip.xy += starShape.xy * halfExtentPx * uPxToClip * clip.w;
  gl_Position = clip;
  vCornerPx = starShape.xy * halfExtentPx;
  vRadiusPx = radiusPx;
  vColor = starColor;
}
`;

/** fragment — 반지름 r 원반, 가장자리 ±softness 를 smoothstep 으로 깎는다. 가산 블렌드라 알파 대신 색에 곱한다. */
export const STAR_CATALOG_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vCornerPx;
varying float vRadiusPx;
varying vec3 vColor;

const float EDGE_SOFTNESS_PX = ${STAR_EDGE_SOFTNESS_PX.toFixed(4)};

void main(void) {
  float d = length(vCornerPx);
  float profile = 1.0 - smoothstep(max(vRadiusPx - EDGE_SOFTNESS_PX, 0.0), vRadiusPx + EDGE_SOFTNESS_PX, d);
  if (profile <= 0.0) {
    discard;
  }
  gl_FragColor = vec4(vColor * profile, 1.0);
}
`;

let shaderRegistered = false;
function registerStarCatalogShader(): void {
  if (shaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = STAR_CATALOG_VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = STAR_CATALOG_FRAGMENT_SHADER;
  shaderRegistered = true;
}

/** 마지막 draw 직전에 실은 uniform (진단 · 단위 테스트용 읽기 전용 사본). */
export interface StarCatalogFrameUniforms {
  pxToClip: [number, number];
  pxScale: number;
}

export interface StarCatalogHandles {
  mesh: Mesh;
  material: ShaderMaterial;
  /** 별 수 (= 쿼드 수). */
  readonly count: number;
  /** draw 직전 uniform 적용 (렌더 경로가 자동 호출). */
  applyFrameUniforms: () => void;
  readFrameUniforms: () => StarCatalogFrameUniforms | null;
  dispose: () => void;
}

/**
 * 카탈로그 → 정점 버퍼 (Babylon 비의존 — 단위 테스트가 정점 방향 · 크기 · 색을 직접 검사한다).
 * 별 i 의 쿼드 정점은 `4i … 4i+3`, 인덱스는 `6i … 6i+5`.
 */
export function buildStarCatalogVertexData(catalog: StarCatalog): {
  positions: Float32Array;
  starShape: Float32Array;
  starColor: Float32Array;
  indices: Uint32Array;
} {
  const n = catalog.count;
  const positions = new Float32Array(n * VERTICES_PER_QUAD * 3);
  const starShape = new Float32Array(n * VERTICES_PER_QUAD * 3);
  const starColor = new Float32Array(n * VERTICES_PER_QUAD * 3);
  const indices = new Uint32Array(n * INDICES_PER_QUAD);
  for (let i = 0; i < n; i += 1) {
    const dir = starSceneDirection(catalog, i);
    const mag = catalog.mag[i]!;
    const radius = starRadiusCssPx(mag);
    const intensity = starIntensity(mag);
    const rgb = bvToRgb(catalog.bv[i]!);
    const v0 = i * VERTICES_PER_QUAD;
    for (let c = 0; c < VERTICES_PER_QUAD; c += 1) {
      const o = (v0 + c) * 3;
      positions[o] = dir[0] * STAR_CATALOG_RADIUS;
      positions[o + 1] = dir[1] * STAR_CATALOG_RADIUS;
      positions[o + 2] = dir[2] * STAR_CATALOG_RADIUS;
      const corner = QUAD_CORNERS[c]!;
      starShape[o] = corner[0];
      starShape[o + 1] = corner[1];
      starShape[o + 2] = radius;
      starColor[o] = rgb[0] * intensity;
      starColor[o + 1] = rgb[1] * intensity;
      starColor[o + 2] = rgb[2] * intensity;
    }
    const ix = i * INDICES_PER_QUAD;
    indices[ix] = v0;
    indices[ix + 1] = v0 + 1;
    indices[ix + 2] = v0 + 2;
    indices[ix + 3] = v0;
    indices[ix + 4] = v0 + 2;
    indices[ix + 5] = v0 + 3;
  }
  return { positions, starShape, starColor, indices };
}

/** 별 카탈로그 쿼드 메시 생성. */
export function createStarCatalog(scene: Scene, catalog: StarCatalog): StarCatalogHandles {
  const data = buildStarCatalogVertexData(catalog);

  const mesh = new Mesh(STAR_CATALOG_MESH_NAME, scene);
  const vertexData = new VertexData();
  vertexData.positions = data.positions;
  vertexData.indices = data.indices;
  vertexData.applyToMesh(mesh, false);
  mesh.setVerticesData('starShape', data.starShape, false, 3);
  mesh.setVerticesData('starColor', data.starColor, false, 3);

  // ADR 738 §결정 1 · 6 / 결정 R1 — 박제 필수 설정.
  mesh.infiniteDistance = true;
  mesh.isPickable = false;
  mesh.renderingGroupId = 0;
  mesh.alphaIndex = STAR_CATALOG_ALPHA_INDEX;
  // 쿼드는 clip 공간에서 벌어져 position 기반 bounding 이 화면 영역과 다르다 — 컬링 대상에서 뺀다.
  mesh.alwaysSelectAsActiveMesh = true;

  registerStarCatalogShader();
  const material = new ShaderMaterial(
    `${STAR_CATALOG_MESH_NAME}-mat`,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position', 'starShape', 'starColor'],
      uniforms: ['worldViewProjection', 'uPxToClip', 'uPxScale'],
      needAlphaBlending: true,
    },
  );
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  // 쿼드는 화면 공간에서 벌어지므로 감김 방향이 카메라와 무관하게 고정이지만, 엔진별 front-face 규약에 기대지 않는다.
  material.backFaceCulling = false;
  mesh.material = material;

  const tmpPxToClip = new Vector2();
  let lastUniforms: StarCatalogFrameUniforms | null = null;
  const applyFrameUniforms = (): void => {
    const engine = scene.getEngine();
    // 캐시 금지 — 리사이즈 · DPR 변경이 다음 draw 에 그대로 반영된다.
    const width = Math.max(1, engine.getRenderWidth());
    const height = Math.max(1, engine.getRenderHeight());
    const pxScale = 1 / engine.getHardwareScalingLevel();
    tmpPxToClip.set(2 / width, 2 / height);
    material.setVector2('uPxToClip', tmpPxToClip);
    material.setFloat('uPxScale', pxScale);
    lastUniforms = { pxToClip: [tmpPxToClip.x, tmpPxToClip.y], pxScale };
  };
  applyFrameUniforms();
  mesh.onBeforeRenderObservable.add(applyFrameUniforms);

  return {
    mesh,
    material,
    count: catalog.count,
    applyFrameUniforms,
    readFrameUniforms: () => lastUniforms,
    dispose: () => {
      mesh.onBeforeRenderObservable.clear();
      material.dispose();
      mesh.dispose();
    },
  };
}
