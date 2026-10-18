import type { Vec3Double } from './vec3.js';

/**
 * #1366 — 데이터 좌표 ↔ 장면 좌표 경계 (ADR `docs/decisions/20261018-1366-scene-handedness.md`).
 *
 * 데이터 (ephemeris · 물리 엔진 · 사건 판정식 · 순수 샘플러) 는 오른손 황도 좌표다 (+X 춘분점 · +Z 황도 북극).
 * Babylon 장면은 왼손계 (`scene.useRightHandedSystem` 미사용) 라 데이터 성분을 그대로 넣으면 화면이 황도면 기준
 * **거울상**이 된다 (데이터 축 → 시청자 행렬식 −1 — 궤도 경사 · 달 황위 · 식 그림자 위치가 반대편).
 * 그래서 장면에 넣는 경계에서 z 부호 하나를 뒤집는다: `S_z = diag(1, 1, −1)`.
 *
 * - **극벡터** (위치 · 변위 · 방향): `scene = S_z · data` — {@link toScene} · {@link toSceneZ}.
 *   `S_z` 는 자기 역원이라 역변환 식도 같지만, 읽는 쪽이 방향을 알 수 있게 이름을 나눈다 ({@link fromScene} · {@link fromSceneZ}).
 * - **축벡터** (외적 결과 — 궤도 법선 · 각운동량): `scene = det(S_z) · S_z · data = (−x, −y, z)` — {@link axialToScene}.
 *   반사는 외적에 행렬식을 곱한다 (`(S_z a) × (S_z b) = −S_z (a × b)`). 장면에서 다시 극벡터와 외적하는 축벡터
 *   (혜성 먼지 휨 `ĥ × axis`) 를 단순 z 반전하면 휨 방향이 반대가 된다.
 *
 * 계약: **순수 함수 (`sampleOrbitPoints` · `cometOrbitNormal` · `lunarEclipseShadowUniforms` 등) 는 데이터 공간에 둔다** —
 * 반전은 장면에 쓰는 지점 (메시 · 선 정점 · uniform 쓰기) 에서만 한다. 장면 값을 데이터로 되돌리는 지점 (카메라 위치 →
 * LOD · tier 판정 · free-fly origin) 은 {@link fromSceneZ} 를 쓴다.
 */

/**
 * 장면 z = `SCENE_Z_SIGN` × 데이터 z. GLSL 사본 (`belt-particles.ts` 정점 셰이더) 은 이 값을 문자열로 주입받는다.
 */
export const SCENE_Z_SIGN = -1;

/**
 * 극벡터 z 성분: 데이터 → 장면.
 *
 * `+ 0` 은 입력 `0` 에서 `−0` 을 만들지 않으려는 것이다 (`−0 + 0 = +0`). 태양 같은 원점 천체의 위치가 `Object.is`
 * 비교 (`toBe(0)`) · 진단 출력에서 부호를 갖지 않게 한다.
 */
export function toSceneZ(dataZ: number): number {
  return SCENE_Z_SIGN * dataZ + 0;
}

/** 극벡터 z 성분: 장면 → 데이터 (카메라 위치를 데이터 좌표 거리 · LOD 판정에 쓸 때). */
export function fromSceneZ(sceneZ: number): number {
  return SCENE_Z_SIGN * sceneZ + 0;
}

/** 극벡터 (위치 · 변위 · 방향): 데이터 → 장면. */
export function toScene(v: Vec3Double): Vec3Double {
  return [v[0], v[1], toSceneZ(v[2])];
}

/** 극벡터: 장면 → 데이터. */
export function fromScene(v: Vec3Double): Vec3Double {
  return [v[0], v[1], fromSceneZ(v[2])];
}

/**
 * 축벡터 (외적 결과 — 궤도 법선 등): 데이터 → 장면. `det(S_z) · S_z · v = (−x, −y, z)`.
 * 장면에서 극벡터 `b` 와 외적하면 `axialToScene(h) × toScene(b) = toScene(h × b)` 가 된다.
 */
export function axialToScene(v: Vec3Double): Vec3Double {
  return [SCENE_Z_SIGN * v[0] + 0, SCENE_Z_SIGN * v[1] + 0, v[2]];
}
