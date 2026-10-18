/**
 * #1341 PR2 — 두 천체 거리 자의 화면 선 (ADR `docs/decisions/20261015-1341-trail-ruler.md` 결정 R2).
 *
 * `LinesMesh` 1개 · 정점 2개 (기준점 A · 현재 선택 B). 단색 · 불투명 · `isPickable = false`.
 *
 * - **정점 위치** — 절대 장면 좌표 `S_z((world − origin) × scale)` 를 float64 로 계산해 `Float32Array` 에 담는다
 *   (`S_z` = #1366 장면 경계 z 반전, `coords/scene-handedness.ts`). body
 *   `mesh.position` 과 같은 식 · 같은 입력이라 끝점과 천체 중심이 같은 float32 값이 된다 (결정 R2 · DoD E4). 메시
 *   자신의 world 행렬은 항등이다.
 * - **깊이** — 기본 깊이 판정 그대로. 확대된 구 안쪽 구간은 가려져 선이 표면에서 나온다 (축 R2 (a)).
 *
 * ## 이 모듈이 하지 않는 것 (결정 R2 — 결정 T7 과 같은 규칙)
 *
 * 가시성 (`setEnabled` · `isVisible`) 을 쓰지 않는다 — 장면의 명령 핸들러 (`setRuler`) 만 쓴다. observer 도 등록하지
 * 않는다 — 정점 갱신은 장면이 body `mesh.position` 을 쓰는 두 지점 (`updateAt` · `setTier`) 과 명령 시 1회 동기에서
 * `commit()` 으로 한다. Floating Origin 이동 이벤트를 구독하지 않는다.
 */
import { Color3, LinesMesh, VertexBuffer, VertexData, type Scene } from '@babylonjs/core';

/** 메시 이름 — 검증 스크립트 · 테스트가 찾는 키. */
export const RULER_LINE_MESH_NAME = 'ruler-line';

/**
 * 선 색 (sRGB hex). 궤도선 · trail (천체 `colorHint`) 과 겹쳐도 구분되도록 채도 높은 밝은 노랑을 쓴다.
 * 선 스타일은 결정이 아니라 rendering 선택이다 — 육안 승인 (DoD E9) 에서 조정한다 (ADR §교차검증 이견 4).
 */
export const RULER_LINE_COLOR_HEX = '#ffd84d';

export interface RulerLineHandles {
  readonly mesh: LinesMesh;
  /** 장면 좌표 정점 버퍼 (xyz × 2 — A, B). 장면이 채운 뒤 `commit()` 한다. */
  readonly positions: Float32Array;
  /** `positions` 를 GPU 정점 버퍼로 올린다. */
  commit(): void;
  dispose(): void;
}

export function createRulerLine(scene: Scene): RulerLineHandles {
  const positions = new Float32Array(6);
  // 정점 색 · 정점 alpha 없음 — 단색은 LinesMesh 의 `color` uniform 이다.
  const mesh = new LinesMesh(RULER_LINE_MESH_NAME, scene, null, null, false, false, false);
  const data = new VertexData();
  data.positions = positions;
  data.indices = [0, 1];
  // 위치만 updatable.
  data.applyToMesh(mesh, true);
  mesh.color = Color3.FromHexString(RULER_LINE_COLOR_HEX);
  mesh.alpha = 1;
  mesh.isPickable = false;
  // 정점을 갱신해도 bounding 을 다시 재지 않는다 — 두 천체가 태양계 전역 어디든 있을 수 있어 컬링 이득도 없다 (trail 과 같은 이유).
  mesh.alwaysSelectAsActiveMesh = true;
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
