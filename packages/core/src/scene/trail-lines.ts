/**
 * #1341 — 궤적 trail 메시 (ADR `docs/decisions/20261015-1341-trail-ruler.md` 결정 T3 · T6 · T7).
 *
 * 전 천체 선을 `LinesMesh` 1개에 묶는다 (인덱스 선분 — 천체 경계에서는 선분을 잇지 않는다). draw call 1.
 *
 * - **정점 위치** — 절대 장면 좌표 `S_z((world − origin) × scale)` 를 float64 로 계산해 `Float32Array` 에 담는다 (결정 T3 ·
 *   `S_z` = #1366 장면 경계 z 반전, `coords/scene-handedness.ts`).
 *   body `mesh.position` 과 같은 식 · 같은 입력이라 머리 정점과 천체 중심이 같은 float32 값이 된다. 메시 자신의
 *   world 행렬은 항등 (position 0 · scaling 1) 이다.
 * - **정점 색** — 천체 `colorHint` (결정 T6 · Q-T8), alpha 는 **인덱스 기반 고정 페이드** (머리 1 → 꼬리 0). 생성 시
 *   1회만 쓴다 — 프레임마다 색 버퍼를 갱신하지 않는다. 점이 E 등간격이라 이심 궤도에서 페이드가 시간에 비례하지 않는다
 *   (ADR §교차검증 고유 발견 4 — 비용과 맞바꾼 것, 육안 승인 대상).
 * - **블렌딩** — `ALPHA_ADD` · depth write 없음. 궤도선과의 깊이 경합은 현행 깊이 그대로 둔다 (Q-T7 (a)).
 *
 * ## 이 모듈이 하지 않는 것 (결정 T7)
 *
 * 가시성 (`setEnabled` · `isVisible`) 을 쓰지 않는다 — 장면의 명령 핸들러만 쓴다. observer 도 등록하지 않는다 —
 * 정점 갱신은 장면이 body `mesh.position` 을 쓰는 두 지점 (`updateAt` · `setTier`) 과 명령 시 1회 동기에서 `commit()`
 * 으로 한다. Floating Origin 이동 이벤트를 구독하지 않는다 (결정 T3 — 축 T2 (c) 기각).
 */
import {
  Constants,
  LinesMesh,
  ShaderMaterial,
  VertexBuffer,
  VertexData,
  type Scene,
} from '@babylonjs/core';

/** 메시 이름 — 검증 스크립트 · 테스트가 찾는 키. */
export const TRAIL_LINES_MESH_NAME = 'trail-lines';

/** 천체 1개의 선 배치 — 점 수 (N + 1) 와 색 (선형 RGB 0~1). */
export interface TrailLineLayout {
  readonly pointCount: number;
  readonly color: readonly [number, number, number];
}

export interface TrailLinesHandles {
  readonly mesh: LinesMesh;
  /** 장면 좌표 정점 버퍼 (xyz × 전 정점). 장면이 채운 뒤 `commit()` 한다. */
  readonly positions: Float32Array;
  /** `positions` 를 GPU 정점 버퍼로 올린다. */
  commit(): void;
  dispose(): void;
}

/** 색 버퍼 (RGBA × 정점) — 머리 alpha 1 → 꼬리 alpha 0 선형. 생성 시 1회. */
export function buildTrailColors(layouts: readonly TrailLineLayout[]): Float32Array {
  let total = 0;
  for (const l of layouts) total += l.pointCount;
  const colors = new Float32Array(4 * total);
  let v = 0;
  for (const l of layouts) {
    const last = l.pointCount - 1;
    for (let k = 0; k < l.pointCount; k += 1) {
      const o = 4 * v;
      colors[o] = l.color[0];
      colors[o + 1] = l.color[1];
      colors[o + 2] = l.color[2];
      colors[o + 3] = last > 0 ? 1 - k / last : 1;
      v += 1;
    }
  }
  return colors;
}

/** 인덱스 버퍼 — 천체마다 연속 점을 선분으로 잇고, 천체 사이는 잇지 않는다. */
export function buildTrailIndices(layouts: readonly TrailLineLayout[]): Uint32Array {
  let segments = 0;
  for (const l of layouts) segments += Math.max(0, l.pointCount - 1);
  const indices = new Uint32Array(2 * segments);
  let base = 0;
  let i = 0;
  for (const l of layouts) {
    for (let k = 0; k + 1 < l.pointCount; k += 1) {
      indices[i] = base + k;
      indices[i + 1] = base + k + 1;
      i += 2;
    }
    base += l.pointCount;
  }
  return indices;
}

export function createTrailLines(
  scene: Scene,
  layouts: readonly TrailLineLayout[],
): TrailLinesHandles {
  const colors = buildTrailColors(layouts);
  const positions = new Float32Array((colors.length / 4) * 3);
  // useVertexColor · useVertexAlpha — 색 · 페이드는 정점 속성 (머티리얼 uniform 색 없음).
  const mesh = new LinesMesh(TRAIL_LINES_MESH_NAME, scene, null, null, false, true, true);
  const data = new VertexData();
  data.positions = positions;
  data.colors = colors;
  data.indices = buildTrailIndices(layouts);
  // 위치만 updatable — 색 · 인덱스는 생성 시 1회.
  data.applyToMesh(mesh, true);
  mesh.isPickable = false;
  // 선이 태양계 전역에 퍼져 있어 절두체 컬링 이득이 없고, 정점 갱신마다 bounding 을 다시 잴 필요도 없어진다.
  mesh.alwaysSelectAsActiveMesh = true;
  const material = mesh.material;
  // 결정 T6 의 블렌딩 · depth 설정을 조용히 건너뛰지 않는다 — LinesMesh 내부 머티리얼 형태가 바뀌면 (Babylon 업그레이드)
  // 여기서 멈춘다 (PR #1343 리뷰 권고 2).
  if (!(material instanceof ShaderMaterial)) {
    throw new Error(
      '[trail-lines] LinesMesh 내부 머티리얼이 ShaderMaterial 이 아니다 — ALPHA_ADD · depth write 끔을 걸 수 없다',
    );
  }
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  return {
    mesh,
    positions,
    commit: () => {
      mesh.updateVerticesData(VertexBuffer.PositionKind, positions, false, false);
    },
    dispose: () => {
      mesh.dispose();
    },
  };
}
