/**
 * #1293 — body 화면 좌표 투영 (3D 이름 라벨용 순수 함수).
 *
 * scene 좌표 (floating origin 적용 · scene unit) 의 한 점을 view × projection 행렬로 투영해
 * **CSS px** (캔버스 좌상단 원점) 좌표를 낸다. 수식은 `Vector3.Project(p, Identity, vp, Viewport(0,0,W,H))`
 * 와 같다 (단위 테스트가 Babylon 구현과 대조한다) — 할당 없이 `out` 에 쓰기 위해 인라인했다.
 *
 * ## 왜 CSS px 인가
 * 엔진은 `adaptToDeviceRatio: true` (#623) 라 렌더 버퍼가 물리 px 이다. DOM 오버레이는 CSS px 로 배치하므로
 * 호출자가 렌더 크기가 아니라 **CSS 크기** (`renderWidth × hardwareScalingLevel`) 를 넘긴다. NDC → px 환산이
 * 선형이라 어느 크기를 넘기든 같은 식이다.
 *
 * ## 카메라 뒤 판정
 * clip `w ≤ 0` 이면 카메라 평면 뒤다. 그 점을 `w` 로 나누면 좌표가 화면 반대쪽으로 뒤집혀 「화면 안」 으로
 * 보일 수 있으므로 (perspective divide 특이점) 좌표를 쓰지 않고 `inFront = false` 로만 알린다.
 */

/** 투영 결과 (재사용 버퍼). `inFront === false` 면 `x` · `y` 는 의미가 없다. */
export interface ScreenPoint {
  x: number;
  y: number;
  inFront: boolean;
}

/**
 * scene 좌표 `(sx, sy, sz)` → CSS px. 결과를 `out` 에 쓰고 그대로 반환한다.
 *
 * @param viewProj `scene.getTransformMatrix().m` (16 원소, `lod.ts` `mulMat4Point` 와 같은 인덱싱)
 * @param width 캔버스 CSS 폭 (px)
 * @param height 캔버스 CSS 높이 (px)
 */
export function projectToScreen(
  sx: number,
  sy: number,
  sz: number,
  viewProj: ArrayLike<number>,
  width: number,
  height: number,
  out: ScreenPoint,
): ScreenPoint {
  const m = viewProj;
  const cx = (m[0] ?? 0) * sx + (m[4] ?? 0) * sy + (m[8] ?? 0) * sz + (m[12] ?? 0);
  const cy = (m[1] ?? 0) * sx + (m[5] ?? 0) * sy + (m[9] ?? 0) * sz + (m[13] ?? 0);
  const cw = (m[3] ?? 0) * sx + (m[7] ?? 0) * sy + (m[11] ?? 0) * sz + (m[15] ?? 0);
  if (!(cw > 0)) {
    out.inFront = false;
    out.x = 0;
    out.y = 0;
    return out;
  }
  // NDC → 뷰포트. y 는 화면 아래가 + 라 뒤집는다 (`Vector3.Project` 의 viewport 변환과 같다).
  out.x = ((cx / cw + 1) / 2) * width;
  out.y = ((1 - cy / cw) / 2) * height;
  out.inFront = true;
  return out;
}

/** 화면 안 판정 — 중심점이 `[0, width] × [0, height]` 안에 있는가 (경계 포함). */
export function isInsideViewport(x: number, y: number, width: number, height: number): boolean {
  return x >= 0 && x <= width && y >= 0 && y <= height;
}

/**
 * #1293 qa B1 — 자식 구가 모체 구 안에 **완전히** 들어 있는가 (렌더 좌표 · scene unit).
 *
 * bodyScale 로 과장된 모체는 가까운 위성의 궤도를 삼킬 수 있다 (#1299 이전 목성 ↔ 이오 — 궤도 시각 배율 재계산으로
 * 해소, 본 판정은 bodyScale 변경 재발 시의 안전망). 그 위성은 카메라 방향과 무관하게
 * 한 픽셀도 그려지지 않는데, 화면 깊이 비교 (web 규칙 1b) 는 위성이 모체보다 **먼** 경우만 잡으므로 궤도 앞쪽
 * 절반에서는 빈 모체 표면 위에 라벨만 뜬다.
 *
 * 판정은 「위성 메시가 전혀 보이지 않는가」 이므로 **위성 반지름을 더한다** (`d + r_child ≤ r_parent`).
 * 중심만 비교 (`d < r_parent`) 하면 모체 표면 밖으로 일부가 튀어나와 실제로 보이는 위성의 라벨까지 지운다.
 * 반대로 이 조건이 참이면 자식 구의 모든 점이 모체 구 안이라 어느 시점에서도 가려진다 (불투명 모체 전제).
 * 거리는 카메라와 무관한 3D 렌더 좌표라 통과 (transit — 모체 원반 앞을 지나는 위성) 라벨은 지우지 않는다.
 */
export function isSphereInsideSphere(
  child: { x: number; y: number; z: number },
  childRadius: number,
  parent: { x: number; y: number; z: number },
  parentRadius: number,
): boolean {
  const dx = child.x - parent.x;
  const dy = child.y - parent.y;
  const dz = child.z - parent.z;
  return Math.sqrt(dx * dx + dy * dy + dz * dz) + childRadius <= parentRadius;
}
