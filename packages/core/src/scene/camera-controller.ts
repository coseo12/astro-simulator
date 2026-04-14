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

  /** 특정 메쉬를 중심으로 카메라를 부드럽게 이동시킨다. */
  focusOn(target: FocusTarget): void {
    const { mesh } = target;
    const boundingInfo = mesh.getBoundingInfo();
    const meshRadius = boundingInfo.boundingSphere.radiusWorld;
    const desiredRadius = target.radius ?? Math.max(meshRadius * 5, meshRadius + 0.01);

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
