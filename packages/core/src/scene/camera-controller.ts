import {
  Animation,
  EasingFunction,
  ExponentialEase,
  Matrix,
  Vector3,
  type ArcRotateCamera,
  type Mesh,
  type Observer,
  type Scene,
} from '@babylonjs/core';

const FRAMES_PER_SECOND = 60;
const TRANSITION_MS = 300;

/**
 * focus user-trigger 한정 radius 배수 (#408 — F1 의존 역전 (c) 부산물).
 *
 * `focusOn` 의 `desiredRadius = max(meshRadius × 5, meshRadius + 0.01)` 식에서 사용.
 * tier 전환 시 `runTierTransition` 의 `FOCUS_RADIUS_MULTIPLIER = 5.9` (V5 달성 공식) 와 분리 의도:
 *  - user-trigger 경로 (버튼 / URL): 본 ×5 → focus body 가 화면 중앙에 적당히 크게
 *  - tier transition 경로: ×5.9 → V5 DoD (지구 세로 40% ±5%) 달성 정밀값
 *
 * `applyFocusTier` 가 `cameraDistMeters = desiredRadius × metersPerSceneUnit` 을 계산할 때
 * 동일 식이 SSoT 1곳에서 import 되어 sim-canvas 와 camera-controller 의 drift 를 차단한다
 * (Gemini cross-validate 부분 수용 — ADR §결정 1 §매직 넘버 상수화 권고).
 */
export const FOCUS_USER_RADIUS_MULTIPLIER = 5;

/**
 * meshRadius × 5 가 매우 작을 때 (T1 시점 등) 0 에 가까워져 카메라가 mesh 내부에 박히지
 * 않도록 보장하는 최소 padding (scene unit). `Math.max(meshRadius × N, meshRadius + PADDING)`.
 */
export const FOCUS_USER_RADIUS_MIN_PADDING = 0.01;

/**
 * #790 — focus 시 lowerRadiusLimit 의 시각 반경 (resolveMeshVisualRadius) 대비 안전 마진.
 *
 * 카메라 radius 가 mesh 시각 반경 이하로 내려가면 카메라가 mesh 내부로 진입해 backface
 * culling 으로 화면 전체 암전 (#774 qa 실측: `?focus=sun` lowerRadiusLimit 0.5 < sun 시각
 * 반경 2.92). 마진 5% 근거:
 *  - 표면 밖 유지가 목적이므로 1.0 초과 최소치면 충분 — 과대 마진은 근접 관찰 UX 를 깎고,
 *    inner tier 대형 planet (jupiter/saturn) 에서 body tier 진입 경계 (0.1 AU) 를 침범할
 *    여지를 만든다 (시각 반경 15.3 × 1.05 = 16.0 < 23 unit — 경계 대비 30% 여유)
 *  - meshVisualRadius × 0.05 가 default minZ(0.01) 대비 충분히 커지는 body (시각 반경 ≥ 0.2
 *    unit — 32 body 전수 침범 대상 전부 해당, #790 대조표) 에서 near-plane 이 mesh 표면과
 *    교차하지 않는 여유 확보
 *  - T1 극소 mesh (시각 반경 < 0.2, venus 관찰 모드 등 #378 완화 경로) 에서는 floor 가
 *    기존 완화값(≥ minZ)보다 작아 바인딩되지 않음 → #378 무회귀
 */
export const FOCUS_LOWER_RADIUS_SURFACE_MARGIN = 1.05;

/**
 * #790 — focus body 의 lowerRadiusLimit 하한 (시각 반경 기반) 산출.
 *
 * `min(meshVisualRadius × 1.05, desiredRadius)` — desiredRadius 상한 clamp 는 "focus 프레이밍
 * radius 는 항상 도달 가능" 불변식 보장 (floor > desiredRadius 면 Babylon _checkLimits 가
 * 프레이밍 radius 를 floor 로 강제 상향해 focus 연출 자체가 깨짐). 32 body 전수에서
 * `meshVisualRadius ≤ floor ≤ desiredRadius` 성립 확인 (#790 대조표 — desiredRadius 는
 * boundingSphere.radiusWorld(≥ 시각 반경) × ≥5 또는 + 0.01 이므로 수학적으로도 항상 floor 초과).
 *
 * meshVisualRadius 는 `resolveMeshVisualRadius` (회전 불변) 를 전달할 것 —
 * boundingSphere.radiusWorld 는 (1) box 외접구라 시각 반경 × √3 상시 과대, (2) #782 자전
 * quaternion 위상에 따라 world AABB 가 진동해 (jupiter 실측 33.2~34.8 unit vs 시각 반경 15.3)
 * 비결정적. bounding 기준 floor 는 jupiter/saturn 에서 body tier 진입 경계 (0.1 AU ≈ 23 unit,
 * inner tier) 를 초과해 줌인 escalation 을 차단하는 신규 회귀를 만든다 (2026-07-09 실측).
 *
 * 호출처 (2곳 — 어느 한쪽만 적용 시 나머지 경로가 floor 를 되돌리는 회귀):
 *  - `CameraController.focusOn` — user-trigger focus (버튼 / URL). tier 무전환 케이스
 *    (sun: solar→solar) 는 이 경로만 floor 를 세울 수 있다
 *  - `runTierTransition` (focusMesh 경로) — focus 중 tier 전환이 lowerRadiusLimit 을
 *    `targetRadius × 0.01` (≈ 표면 94% 안쪽) 로 재설정하므로 재적용 필수
 */
export function computeFocusLowerRadiusFloor(
  meshVisualRadius: number,
  desiredRadius: number,
): number {
  return Math.min(meshVisualRadius * FOCUS_LOWER_RADIUS_SURFACE_MARGIN, desiredRadius);
}

/**
 * #790 — mesh 의 회전 불변 시각 반경 (scene unit).
 *
 * `max(boundingBox.extendSize(local) 각 축 × |scaling| 각 축)` — sphere mesh 의 local 반경에
 * tier scaling 을 곱한 값으로, `diameter = radius × 2 × renderScale × bodyScale` 생성식의
 * 반경과 일치한다 (saturn solar tier 실측 0.7130 vs 산식 0.7128).
 *
 * boundingSphere.radiusWorld 를 쓰지 않는 이유는 computeFocusLowerRadiusFloor 주석 참조
 * (√3 과대 + #782 자전 위상 진동). 본 함수는 회전과 무관하게 결정적이며, 축별 곱의 max 채택으로
 * 비균등 scaling (oblate 등) 에서도 최대 반경 기준 보수 판정을 유지한다.
 */
export function resolveMeshVisualRadius(mesh: Mesh): number {
  return visualRadiusFromScale(mesh, mesh.scaling);
}

/**
 * #1228 — **부모 변환을 포함한** 회전 불변 시각 반경 (scene unit).
 *
 * `max(boundingBox.extendSize(local) 각 축 × |부모 체인 scaling 곱| 각 축)`. `resolveMeshVisualRadius`
 * 와 식은 같고 scale 원천만 다르다 — `mesh.scaling` 에 조상 노드들의 `scaling` 을 축별로 곱한다.
 *
 * **왜 별도 함수인가.** LOD mid variant (`createBodyMeshMid`) 는 host 의 **자식**이고 자신의
 * `scaling` 은 `1` 로 유지된다 — tier scaling 은 부모(host)에만 있다. local scaling 기준 반경은
 * mid 에서 `1 / tier scaling` 로 작아져, 마스크 LOD 판정(`projectedDiskRadiusPx`)이 mid 를 항상
 * 임계 아래로 판정했다 (#1228 F1 실측: inner tier `18.3333` 에서 host `98.32 px` / mid `5.363 px`).
 * `resolveMeshVisualRadius` 자체를 바꾸지 않은 이유 (#1228 F4): #790 floor 호출부 2곳
 * (`focusOn` · `runTierTransition`) 은 `meshes` Map 의 host 를 넘기는데 host 는 부모가 없어 두 식이
 * 같은 값을 낸다 — 바꿔도 floor 에 얻는 것이 없고, 대신 #790 단위 테스트 mock (`scaling` 만 가짐)
 * 과 가드 스크립트의 local scaling 산식 사본 (`browser-verify-756/773/774/790`) 이 함께 움직여야
 * 한다. 호출부 한 곳만 바꾸면 floor 경로 diff 가 `0` 행이다.
 *
 * **회전 불변 — 구조적으로.** 회전(자전 quaternion)을 입력으로 받지 않으므로 위상의 함수가 될
 * 수 없다. 이것이 참 world 반경과 같은 이유는 Babylon 행벡터 규약에서 world = `S · R · T` (부모
 * 체인이면 그 곱) 이고 `S · R` 의 i 행 길이가 `|sᵢ|` 로 R 과 무관하기 때문이다 — 부모 쪽 회전도
 * 자식 scale 뒤에 곱해져 같다. ⚠️ 예외는 **회전 뒤에 비균등 scale 이 오는** 체인 (자식이 회전하고
 * 부모가 비균등 scale) 뿐이며, 그 경우 이 곱은 참 world 반경의 근사다 — host 는 `setTier` 의
 * `scaling.setAll` 로, mid 는 `scaling` 미변경(`1`) 이라 이 체인은 균등 scale 이다.
 *
 * ⚠️ **`mesh.absoluteScaling` 을 쓰지 않는 이유 (실측).** 초판은 world matrix 분해값
 * `absoluteScaling` 을 썼는데 Babylon `Matrix` 가 `Float32Array` 라 분해 결과가 자전 위상마다
 * 흔들렸다 — NullEngine 16 위상 순회에서 반경 폭 `2.2e-7` · `projectedDiskRadiusPx` 폭 `2.4e-7 px`
 * 로, #1157 불변 단언 (`< 1e-9`) 이 **부모 없는 host 에서도** 깨졌다. 판정 경계에서 토글할 크기는
 * 아니나 「위상 전건 동일」 계약을 약화시키는 대신 float64 곱을 택했다. 부수 효과로 부모 없는
 * mesh 에서는 `resolveMeshVisualRadius` 와 **비트 동일**하고, world matrix 신선도 전제도 없다.
 */
export function resolveMeshWorldVisualRadius(mesh: Mesh): number {
  let sx = mesh.scaling.x;
  let sy = mesh.scaling.y;
  let sz = mesh.scaling.z;
  for (let node = mesh.parent; node !== null; node = node.parent) {
    // `Node` 자체는 scaling 이 없다 (TransformNode 이상만 보유) — 없으면 배수 1.
    const parentScaling = (node as Partial<Pick<Mesh, 'scaling'>>).scaling;
    if (parentScaling === undefined) continue;
    sx *= parentScaling.x;
    sy *= parentScaling.y;
    sz *= parentScaling.z;
  }
  return visualRadiusFromScale(mesh, { x: sx, y: sy, z: sz });
}

/** 두 시각 반경 함수의 공통 식 — 축별 `extendSize × |scale|` 의 max. */
function visualRadiusFromScale(
  mesh: Mesh,
  scale: { readonly x: number; readonly y: number; readonly z: number },
): number {
  const { extendSize } = mesh.getBoundingInfo().boundingBox;
  return Math.max(
    extendSize.x * Math.abs(scale.x),
    extendSize.y * Math.abs(scale.y),
    extendSize.z * Math.abs(scale.z),
  );
}

export interface FocusTarget {
  /** 대상 메쉬 */
  mesh: Mesh;
  /** 메쉬로부터의 기본 거리 (씬 단위). 기본: 메쉬 반경 × 5 */
  radius?: number;
  /**
   * #1360 PR2 결정 C3 (ADR 1354 Q-S Amendment) — 시점 방향: 대상 → 카메라 world 방향 (정규화 불요). 주면 카메라 `alpha` ·
   * `beta` 도 같은 전환 시간으로 그 방향에 맞춘다 (`alpha` 는 짧은 쪽으로 돈다). 생략하면 현행대로 시점 각을 유지한다.
   */
  viewDirection?: ViewDirectionLike;
  /**
   * #1390 PR3 (ADR `20261021-1390` Amendment 2) — 화면 위로 둘 world 방향 (정규화 불요). 주면 카메라 `upVector` 를 그 방향으로
   * 바꾸고 `alpha` · `beta` 를 그 축 기준으로 다시 센다 (카메라 위치는 그대로 — 화면 롤만 바뀐다). 생략하면 장면 기본 위 방향 (+Y)
   * 으로 되돌린다. 시점 방향과 평행하면 화면 위가 정의되지 않으므로 호출자가 평행하지 않은 방향을 준다.
   */
  viewUp?: ViewDirectionLike;
}

/** 장면 기본 위 방향 — `setupArcRotateCamera` (Babylon `ArcRotateCamera` 기본 `upVector`). */
const DEFAULT_VIEW_UP: ViewDirectionLike = { x: 0, y: 1, z: 0 };
/** 위 방향 비교 허용 오차 (단위 벡터 성분차) — 같으면 `upVector` 를 다시 쓰지 않는다. */
const VIEW_UP_EPSILON = 1e-12;

/** 시점 방향 → ArcRotate 각. `beta` 는 카메라 한계로 자른다 (극 방향이면 `alpha` 는 정의상 임의 — 현재 값을 유지). */
export interface ArcAngles {
  alpha: number;
  beta: number;
}

/** 시점 방향 — Babylon `Vector3` 또는 같은 모양의 평범한 객체. */
export type ViewDirectionLike = { readonly x: number; readonly y: number; readonly z: number };

const TWO_PI = Math.PI * 2;
/** 극 방향 판정 — 수평 성분이 이보다 작으면 `alpha` 를 바꾸지 않는다 (atan2(0, 0) 회피). */
const POLAR_HORIZONTAL_EPSILON = 1e-9;

/**
 * #1360 PR2 — 대상 → 카메라 방향 `dir` 을 ArcRotate 각으로 바꾼다. Babylon ArcRotate 위치식
 * `target + r·(cos α sin β, cos β, sin α sin β)` (upVector = +Y — `camera.ts` 기본) 의 역이다.
 * `alpha` 는 `currentAlpha` 에서 짧은 쪽으로 도는 값 (`|Δ| ≤ π`) 을 돌려준다 — 전환 애니메이션이 한 바퀴 돌지 않게.
 */
export function viewDirectionToArcAngles(
  dir: ViewDirectionLike,
  currentAlpha: number,
  lowerBetaLimit: number | null,
  upperBetaLimit: number | null,
): ArcAngles {
  const len = Math.hypot(dir.x, dir.y, dir.z);
  if (!(len > 0)) return { alpha: currentAlpha, beta: Number.NaN };
  const y = dir.y / len;
  let beta = Math.acos(Math.min(1, Math.max(-1, y)));
  if (lowerBetaLimit != null) beta = Math.max(lowerBetaLimit, beta);
  if (upperBetaLimit != null) beta = Math.min(upperBetaLimit, beta);
  if (Math.hypot(dir.x, dir.z) / len < POLAR_HORIZONTAL_EPSILON)
    return { alpha: currentAlpha, beta };
  const raw = Math.atan2(dir.z, dir.x);
  // currentAlpha 기준 (−π, π] 로 감싼 차.
  let delta = (raw - currentAlpha) % TWO_PI;
  if (delta > Math.PI) delta -= TWO_PI;
  if (delta <= -Math.PI) delta += TWO_PI;
  return { alpha: currentAlpha + delta, beta };
}

/**
 * #1390 PR3 — world 방향 → 카메라 위 방향 기준 프레임 (`up` 이 +Y 가 되는 회전). Babylon `ArcRotateCamera` 가 `upVector` 를
 * 다룰 때 쓰는 회전 (`Matrix.RotationAlignToRef(up, +Y)` — `_upToYMatrix`) 과 같은 식이라, 결과에 {@link viewDirectionToArcAngles}
 * 를 쓰면 그 `upVector` 의 `alpha` · `beta` 가 된다. 기본 위 방향 (+Y) 이면 입력을 그대로 돌려준다 (종전 경로 — 값 불변).
 */
export function toCameraUpFrame(dir: ViewDirectionLike, up: ViewDirectionLike): ViewDirectionLike {
  if (up.x === 0 && up.y === 1 && up.z === 0) return dir;
  const m = new Matrix();
  Matrix.RotationAlignToRef(new Vector3(up.x, up.y, up.z).normalize(), Vector3.Up(), m);
  return Vector3.TransformNormal(new Vector3(dir.x, dir.y, dir.z), m);
}

/**
 * #1390 Amendment 1 — ArcRotate 각 → 시점 방향 (대상 → 카메라, 단위 벡터). {@link viewDirectionToArcAngles} 의 역이다 (같은 위치식).
 * 고정 시점 각 (예: 앱 첫 화면 각) 을 `viewDirection` 계약으로 넘길 때 쓴다.
 */
export function arcAnglesToViewDirection(angles: ArcAngles): ViewDirectionLike {
  const sinBeta = Math.sin(angles.beta);
  return {
    x: Math.cos(angles.alpha) * sinBeta,
    y: Math.cos(angles.beta),
    z: Math.sin(angles.alpha) * sinBeta,
  };
}

/**
 * ArcRotate 기반 카메라 컨트롤러.
 *
 * P1 MVP:
 *  - focusOn(mesh): 대상 천체로 타겟/반지름 부드러운 전환
 *  - 사용자 드래그/줌은 유지
 *  - Floating Origin: 씬 단위가 AU라 P1 스케일에서는 float32 충분
 *    (극단 줌 시에는 C7/P2에서 coords/FloatingOrigin 통합 예정)
 */
export class CameraController {
  readonly camera: ArcRotateCamera;
  #scene: Scene;
  #easing: EasingFunction;

  /**
   * R-Phase #507 — focus body 추적 observer.
   *
   * 회귀: mercury focus 는 정상 추적 (activeTier='body' → primary follow 활성),
   * venus focus 는 mesh 가 공전해도 카메라 target 고정 (activeTier='inner' → primary follow skip).
   *
   * 본 observer 는 scene 측 tier 정책 (T1/T2 origin reset) 과 직교하게 카메라 책임으로 추적:
   * focus 진입 시 매 프레임 `mesh.computeWorldMatrix(true)` 후 `camera.target.copyFrom(mesh.absolutePosition)`.
   * tier 무관. (#611 — worldMatrix 갱신 없이 읽으면 absolutePosition 이 직전 프레임 값이라 한 프레임 lag.)
   *
   * 라이프사이클:
   *  - focusOn() Animation 종료 (onAnimationEnd) 후 attach — Animation 도중 target 덮어쓰기 race 회피
   *  - 새 focusOn() / reset() / dispose() 호출 시 detach
   *  - 매 frame 비용: focus mesh 1개 computeWorldMatrix + copyFrom (3 float) — perf 영향 무시 가능
   */
  #followObserver: Observer<Scene> | null = null;

  constructor(camera: ArcRotateCamera, scene: Scene) {
    this.camera = camera;
    this.#scene = scene;
    const easing = new ExponentialEase();
    easing.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
    this.#easing = easing;
  }

  #detachFollow(): void {
    if (this.#followObserver) {
      this.#scene.onBeforeRenderObservable.remove(this.#followObserver);
      this.#followObserver = null;
    }
  }

  /**
   * #509 — follow observer 외부 해제 (free-fly 진입 경로 전용).
   *
   * `reset()` 은 follow detach + Animation 동반이지만 free-fly 는 시점 유지 필수 →
   * Animation 없이 follow 만 해제하는 public 진입점. 호출자 책임으로 한 번만 호출.
   */
  clearFollow(): void {
    this.#detachFollow();
  }

  #attachFollow(mesh: Mesh): void {
    this.#detachFollow();
    this.#followObserver = this.#scene.onBeforeRenderObservable.add(() => {
      // mesh 가 dispose 됐거나 scene 에서 제거됐으면 detach (스크럽 안전)
      if (mesh.isDisposed()) {
        this.#detachFollow();
        return;
      }
      // #611 — onBeforeRender 시점에 mesh.position 은 이번 프레임 값으로 갱신됐으나
      // (render loop: time.tick → updateAt → mesh.position 설정이 scene.render 보다 먼저),
      // worldMatrix 는 아직 이번 프레임 계산 전이라 `absolutePosition` 이 **직전 프레임** 값을
      // 반환한다. 갱신 없이 읽으면 target 이 한 프레임 lag → 궤도 각속도가 큰 위성
      // (phobos 주기 7.66h / deimos 30.3h) 에서 프레임당 이동량이 tolerance 를 초과해
      // DoD-3 (target 동기화) 회귀. 행성은 각속도가 작아 lag 가 tolerance 내라 잠복했다.
      // 측정 스크립트 (browser-verify-378-focus.mjs:101) 와 동일하게 강제 갱신 후 읽어
      // lag 0. focus mesh 1개만 매 프레임 갱신이라 비용 무시 가능.
      mesh.computeWorldMatrix(true);
      this.camera.target.copyFrom(mesh.absolutePosition);
    });
  }

  /**
   * 특정 메쉬를 중심으로 카메라를 부드럽게 이동시킨다.
   *
   * **P12-B #298 맥락**: `focusOn` 은 **user focus 트리거 한정** (버튼 클릭 / URL 동기).
   * `desiredRadius = meshRadius × 5` 기본값 유지. 이후 `updateTierByCamera` 가 tier 전환을
   * 감지하면 `solar-system-scene.ts:setTier` → `runTierTransition` 이 pending radius tween 을
   * `scene.getAnimatableByTarget(camera)` 로 취소하고 실거리 보존 수식 (`radius_old × newScale /
   * oldScale`) 로 재시작한다. 사용자는 두 단계 애니메이션을 하나의 부드러운 전환으로 체감.
   *
   * **#834 계약 (focus-entry 정착 = inner 궤도 맥락)**: 이 `× 5` (아래 `meshRadius ×
   * FOCUS_USER_RADIUS_MULTIPLIER`) 프레이밍으로 planet 은 **inner 궤도 맥락 ~21% 로 정착**한다
   * (earth 세로 20.8%, 실거리 0.21 AU > 0.1 AU 경계 → tierFromFocus = inner). `meshRadius` 는
   * `boundingSphere.radiusWorld` (≈ 2.4× 시각 반경 — box 외접구 √3 과대 + #782 자전 위상 진동)
   * 라 V5 40% (`FOCUS_RADIUS_MULTIPLIER = 5.9`) 대비 undershoot 이나, 이는 **의도된 궤도 맥락
   * 프레이밍** (궤도선 + 위성 동반) 이며 **회귀가 아니다** (#834 NO-OP 실측 재검증 — #818 이전부터
   * 동일). body-tier 근접 (V5 40%) 은 줌인으로 도달. 상세: ADR
   * `docs/decisions/20260718-834-focus-entry-tier-no-op.md`.
   *
   * NOTE (operative 경로): production 의 실제 배수는 sim-canvas 가 `resolveFocusMultiplier(parentId)`
   * 로 계산해 `target.radius` 로 명시 전달하며 (아래 `??` fallback 우회), 행성은 그 값도 `× 5` 라
   * 수치 동일하다. 즉 focusOn 내부의 `meshRadius × FOCUS_USER_RADIUS_MULTIPLIER` 는 fallback 이고
   * operative 경로는 sim-canvas 쪽 — 행성 focus-entry 정착 결과는 양 경로에서 같다.
   *
   * #1232 — focusOn 은 줌 관성 누적기(camera.movement._zoomVelocity 등)에 쓰지 않는다.
   * renderScale 변경은 applyFocusTier → setTier → runTierTransition 에서만 일어나고, 누적기의
   * tier 단위 환산도 거기서 한 번 한다 (rescaleZoomInertiaForTier). 여기서 누적기를 쓰면 그 환산을
   * 되돌리는 #790 클래스 회귀가 된다.
   */
  focusOn(target: FocusTarget): void {
    const { mesh } = target;
    // #1390 PR3 — 위 방향을 먼저 맞춘다 (아래 시점 방향 → 각 환산이 그 축 기준이다). 생략 = 기본 (+Y) 복원.
    this.#applyViewUp(target.viewUp);
    // #378 옵션 B (defense-in-depth) — boundingInfo 명시 갱신.
    // mesh.scaling 이 setTier 등에서 갱신된 직후 boundingSphere.radiusWorld 가 다음 frame 의
    // world matrix 갱신 전까지 잔존 값을 반환하는 timing race 방지. focusOn 호출자
    // (sim-canvas → simulation-core 'focusOn' 명령) 가 setTier 후 같은 프레임에 호출하는
    // 시나리오에서 안전망. 매 호출 1회 cost 무시 가능 수준.
    mesh.computeWorldMatrix(true);
    const boundingInfo = mesh.getBoundingInfo();
    const meshRadius = boundingInfo.boundingSphere.radiusWorld;
    const desiredRadius =
      target.radius ??
      Math.max(
        meshRadius * FOCUS_USER_RADIUS_MULTIPLIER,
        meshRadius + FOCUS_USER_RADIUS_MIN_PADDING,
      );

    // #378 옵션 A — focus 트리거 한정 lowerRadiusLimit 동적 완화.
    // T1 시점 desiredRadius (~0.01 unit) 가 ArcRotateCamera default lowerRadiusLimit (0.5) 미만
    // 이면 카메라 radius 가 0.5 로 clamp 되어 mesh 내부에 박힘 → tier 전환 후 mesh 외각이 카메라
    // frustum 밖으로 빠져 venus 관찰 모드 "허공" 회귀 (D-T2 라운드 3 보고).
    // tier-transition.ts 의 #380 이전 한 방향 완화와 동일 패턴 (그쪽은 현재 가드 A
    // `computeLowerRadiusLimit` 양방향 동기로 대체 — #845 라인 앵커화).
    // focus 트리거 한정 완화 (manual zoom 영향 0).
    if (this.camera.lowerRadiusLimit != null && desiredRadius < this.camera.lowerRadiusLimit) {
      this.camera.lowerRadiusLimit = Math.max(this.camera.minZ, desiredRadius * 0.5);
    }

    // #790 — focus 트리거 한정 lowerRadiusLimit 시각 반경 하한 (상향).
    // #378 완화(하향)와 반대 방향: default 0.5 (또는 tier 전환의 targetRadius×0.01) 가 focus
    // body 시각 반경보다 작으면 최대 줌인 시 카메라가 mesh 내부 진입 → backface culling 암전
    // (#774 qa 실측 sun 2.92 vs 0.5 — 대조표상 32 body 전수 침범). 회전 불변 시각 반경 × 1.05
    // 를 하한으로 올려 카메라가 항상 mesh 표면 밖에 머물게 한다. desiredRadius clamp 로 focus
    // 프레이밍 도달성 보존. free-fly / reset 진입 시 sim-canvas 가 default 로 원복 (기존 동작).
    if (this.camera.lowerRadiusLimit != null) {
      const surfaceFloor = computeFocusLowerRadiusFloor(
        resolveMeshVisualRadius(mesh),
        desiredRadius,
      );
      if (this.camera.lowerRadiusLimit < surfaceFloor) {
        this.camera.lowerRadiusLimit = surfaceFloor;
      }
    }

    const targetPos = mesh.absolutePosition.clone();

    // R-Phase #507 — 새 focus 진입 시 기존 follow observer detach. Animation 도중 race 방지 +
    // 이전 mesh 가 dispose 되지 않은 채 attach 잔존하는 경로 차단.
    this.#detachFollow();

    // 현재 target → 새 target으로 애니메이션 (camera.target)
    Animation.CreateAndStartAnimation(
      'cam-target',
      this.camera,
      'target',
      FRAMES_PER_SECOND,
      (TRANSITION_MS / 1000) * FRAMES_PER_SECOND,
      this.camera.target.clone(),
      targetPos,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      this.#easing,
      () => {
        // R-Phase #507 — onAnimationEnd: Animation 종료 후 follow observer attach.
        // Animation 도중 attach 하면 매 프레임 target.copyFrom 이 Animation 보간값을 덮어써
        // 부드러운 진입 효과 손실. 종료 후 attach 로 race 0.
        this.#attachFollow(mesh);
      },
    );

    // 반지름 애니메이션
    Animation.CreateAndStartAnimation(
      'cam-radius',
      this.camera,
      'radius',
      FRAMES_PER_SECOND,
      (TRANSITION_MS / 1000) * FRAMES_PER_SECOND,
      this.camera.radius,
      desiredRadius,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      this.#easing,
    );

    // #1360 PR2 결정 C3 — 선택적 시점 방향. 같은 전환 시간 · easing 으로 alpha · beta 를 맞춘다.
    if (target.viewDirection) this.#animateViewDirection(target.viewDirection);
  }

  /**
   * #1390 PR3 — 카메라 `upVector` 를 `up` (생략 = 기본 +Y) 으로 둔다. 이미 같으면 아무것도 하지 않는다 — 기본 위 방향만 쓰는 경로
   * (`from-sun` 을 거치지 않은 모든 포커스 · reset) 는 `upVector` 를 한 번도 쓰지 않아 종전과 같다.
   *
   * Babylon `upVector` 는 값만 바꾸면 같은 `alpha` · `beta` 가 새 축 기준으로 읽혀 카메라가 튄다. 그래서 바꾼 직후
   * `rebuildAnglesAndRadius` 로 **현재 위치를 고정한 채** 각을 다시 센다 — 화면의 롤만 바뀐다.
   */
  #applyViewUp(up: ViewDirectionLike | undefined): void {
    const want = up ?? DEFAULT_VIEW_UP;
    const len = Math.hypot(want.x, want.y, want.z);
    if (!(len > 0)) return;
    const cur = this.camera.upVector;
    if (
      Math.abs(cur.x - want.x / len) < VIEW_UP_EPSILON &&
      Math.abs(cur.y - want.y / len) < VIEW_UP_EPSILON &&
      Math.abs(cur.z - want.z / len) < VIEW_UP_EPSILON
    ) {
      return;
    }
    // 기본 복원은 정확히 (0, 1, 0) 으로 쓴다 — Babylon 은 성분 정확 비교로 「기본 축」 경로를 고른다.
    this.camera.upVector =
      up === undefined ? Vector3.Up() : new Vector3(want.x / len, want.y / len, want.z / len);
    this.camera.rebuildAnglesAndRadius();
  }

  /** 시점 방향 (대상 → 카메라) 으로 alpha · beta 를 전환 시간 · easing 에 맞춰 옮긴다. 방향이 영벡터면 아무것도 하지 않는다. */
  #animateViewDirection(viewDirection: ViewDirectionLike): void {
    const angles = viewDirectionToArcAngles(
      toCameraUpFrame(viewDirection, this.camera.upVector),
      this.camera.alpha,
      this.camera.lowerBetaLimit,
      this.camera.upperBetaLimit,
    );
    if (!Number.isFinite(angles.beta)) return;
    for (const [name, from, to] of [
      ['alpha', this.camera.alpha, angles.alpha],
      ['beta', this.camera.beta, angles.beta],
    ] as const) {
      Animation.CreateAndStartAnimation(
        `cam-${name}`,
        this.camera,
        name,
        FRAMES_PER_SECOND,
        (TRANSITION_MS / 1000) * FRAMES_PER_SECOND,
        from,
        to,
        Animation.ANIMATIONLOOPMODE_CONSTANT,
        this.#easing,
      );
    }
  }

  /**
   * 카메라 reset — 기본 위치로 복귀.
   *
   * #1390 Amendment 1 — `viewDirection` 을 주면 alpha · beta 도 같은 전환으로 그 방향에 맞춘다 (`focusOn` 의 `viewDirection` 과
   * 같은 계약). 생략하면 현행대로 alpha · beta 를 애니메이션하지 않는다 — 관찰 · 연구 모드의 reset 은 인자를 주지 않는다.
   * 생략이 시점 각 보존을 뜻하지는 않는다 — target tween 이 Babylon `setTarget` (`rebuildAnglesAndRadius`) 을 거쳐 카메라 위치를
   * 고정한 채 각을 다시 셈하므로, 화면의 각은 직전 카메라 위치가 정한다 (PR #1396 리뷰 실측).
   */
  reset(
    targetRadius = 35,
    target: Vector3 = Vector3.Zero(),
    viewDirection?: ViewDirectionLike,
  ): void {
    // R-Phase #507 — focus 해제 시 follow observer detach. observer 잔존 시 Animation 의
    // target=(0,0,0) 을 매 프레임 mesh 위치로 덮어써 reset 자체가 무효화됨.
    this.#detachFollow();
    // #1390 PR3 — 개요는 기본 위 방향 (+Y) 이다 (`viewDirection` 각도 그 축 기준 — `DEFAULT_CAMERA_*`).
    this.#applyViewUp(undefined);

    Animation.CreateAndStartAnimation(
      'cam-reset-target',
      this.camera,
      'target',
      FRAMES_PER_SECOND,
      (TRANSITION_MS / 1000) * FRAMES_PER_SECOND,
      this.camera.target.clone(),
      target,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      this.#easing,
    );
    Animation.CreateAndStartAnimation(
      'cam-reset-radius',
      this.camera,
      'radius',
      FRAMES_PER_SECOND,
      (TRANSITION_MS / 1000) * FRAMES_PER_SECOND,
      this.camera.radius,
      targetRadius,
      Animation.ANIMATIONLOOPMODE_CONSTANT,
      this.#easing,
    );
    if (viewDirection) this.#animateViewDirection(viewDirection);
  }

  dispose(): void {
    this.#detachFollow();
    this.#scene.stopAllAnimations();
  }
}
