import {
  Animation,
  EasingFunction,
  ExponentialEase,
  Vector3,
  type ArcRotateCamera,
  type Mesh,
  type Scene,
} from '@babylonjs/core';

const FRAMES_PER_SECOND = 60;
const TRANSITION_MS = 300;

export interface FocusTarget {
  /** 대상 메쉬 */
  mesh: Mesh;
  /** 메쉬로부터의 기본 거리 (씬 단위). 기본: 메쉬 반경 × 5 */
  radius?: number;
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

  constructor(camera: ArcRotateCamera, scene: Scene) {
    this.camera = camera;
    this.#scene = scene;
    const easing = new ExponentialEase();
    easing.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
    this.#easing = easing;
  }

  /**
   * 특정 메쉬를 중심으로 카메라를 부드럽게 이동시킨다.
   *
   * **P12-B #298 맥락**: `focusOn` 은 **user focus 트리거 한정** (버튼 클릭 / URL 동기).
   * `desiredRadius = meshRadius × 5` 기본값 유지. 이후 `updateTierByCamera` 가 tier 전환을
   * 감지하면 `solar-system-scene.ts:setTier` → `runTierTransition` 이 pending radius tween 을
   * `scene.getAnimatableByTarget(camera)` 로 취소하고 실거리 보존 수식 (`radius_old × newScale /
   * oldScale`) 로 재시작한다. 사용자는 두 단계 애니메이션을 하나의 부드러운 전환으로 체감.
   */
  focusOn(target: FocusTarget): void {
    const { mesh } = target;
    // #378 옵션 B (defense-in-depth) — boundingInfo 명시 갱신.
    // mesh.scaling 이 setTier 등에서 갱신된 직후 boundingSphere.radiusWorld 가 다음 frame 의
    // world matrix 갱신 전까지 잔존 값을 반환하는 timing race 방지. focusOn 호출자
    // (sim-canvas → simulation-core 'focusOn' 명령) 가 setTier 후 같은 프레임에 호출하는
    // 시나리오에서 안전망. 매 호출 1회 cost 무시 가능 수준.
    mesh.computeWorldMatrix(true);
    const boundingInfo = mesh.getBoundingInfo();
    const meshRadius = boundingInfo.boundingSphere.radiusWorld;
    const desiredRadius = target.radius ?? Math.max(meshRadius * 5, meshRadius + 0.01);

    // #378 옵션 A — focus 트리거 한정 lowerRadiusLimit 동적 완화.
    // T1 시점 desiredRadius (~0.01 unit) 가 ArcRotateCamera default lowerRadiusLimit (0.5) 미만
    // 이면 카메라 radius 가 0.5 로 clamp 되어 mesh 내부에 박힘 → tier 전환 후 mesh 외각이 카메라
    // frustum 밖으로 빠져 venus 관찰 모드 "허공" 회귀 (D-T2 라운드 3 보고).
    // tier-transition.ts:189 와 동일 패턴 — focus 트리거 한정 완화 (manual zoom 영향 0).
    if (this.camera.lowerRadiusLimit != null && desiredRadius < this.camera.lowerRadiusLimit) {
      this.camera.lowerRadiusLimit = Math.max(this.camera.minZ, desiredRadius * 0.5);
    }

    const targetPos = mesh.absolutePosition.clone();

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

    // 대상이 움직이는 천체라면 매 프레임 target 추적 — 단순화: 한 번만 애니메이션
    // C6 다음 단계(D6/D7 UI)에서 실시간 추적 필요 시 observer 등록 예정.
  }

  /** 카메라 reset — 기본 위치로 복귀 */
  reset(targetRadius = 35, target: Vector3 = Vector3.Zero()): void {
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
  }

  dispose(): void {
    this.#scene.stopAllAnimations();
  }
}
