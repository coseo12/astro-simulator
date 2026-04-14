import { ArcRotateCamera, Vector3, type Scene } from '@babylonjs/core';

export interface ArcCameraOptions {
  /** 수평 회전각 (rad) */
  alpha?: number;
  /** 수직 회전각 (rad) */
  beta?: number;
  /** 타겟까지 거리 (씬 단위) */
  radius?: number;
  /** 타겟 위치 */
  target?: Vector3;
  /** 최소 거리 */
  lowerRadiusLimit?: number;
  /** 최대 거리 */
  upperRadiusLimit?: number;
}

/**
 * 기본 ArcRotate 카메라를 씬에 설치한다.
 * Floating Origin 기반의 본격 카메라 시스템은 C6 (#18)에서 구현.
 */
export function setupArcRotateCamera(
  scene: Scene,
  options: ArcCameraOptions = {},
): ArcRotateCamera {
  const {
    alpha = -Math.PI / 2,
    beta = Math.PI / 2.5,
    radius = 30,
    target = Vector3.Zero(),
    lowerRadiusLimit = 0.5,
    upperRadiusLimit = 1e14,
  } = options;

  const camera = new ArcRotateCamera('camera', alpha, beta, radius, target, scene);
  camera.lowerRadiusLimit = lowerRadiusLimit;
  camera.upperRadiusLimit = upperRadiusLimit;
  camera.wheelPrecision = 3;
  camera.pinchPrecision = 50;
  camera.panningSensibility = 0;
  // 로그 뎁스 버퍼 전제 — 극단 near/far (행성 표면 ~ 태양계 외곽 이상)
  camera.minZ = 0.01;
  camera.maxZ = 1e14;

  const canvas = scene.getEngine().getRenderingCanvas();
  if (canvas) {
    camera.attachControl(canvas, true);
  }

  return camera;
}
