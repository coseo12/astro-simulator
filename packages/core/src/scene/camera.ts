import { ArcRotateCamera, Vector3, type Scene } from '@babylonjs/core';

/**
 * #629 — 줌(휠/핀치) 델타를 radius 비례(%)로 적용하는 비율 상수.
 *
 * 틱당 약 1% 줌. 절대 `wheelPrecision`/`pinchPrecision` 대신 사용하는 이유는 tier 별
 * renderScale 비대칭(T1 solar radius≈35 ↔ T3 body radius≈158386) 때문이다 — 절대 델타는
 * deep tier 에서 변화율이 0.03% 로 떨어져 줌이 체감상 멈춘다 (forensic ADR
 * docs/decisions/20260607-629-freefly-camera-zoom-forensic.md). 휠/핀치 동일 값으로
 * desktop·mobile 줌 감도를 일치시킨다. D-T2 피드백 시 본 상수만 조정.
 */
export const ZOOM_DELTA_PERCENTAGE = 0.01;

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
  // #629 — 줌 델타를 radius 비례(%)로 적용한다.
  //
  // 절대 `wheelPrecision`/`pinchPrecision` 은 tier 별 renderScale 비대칭 (T1 solar radius≈35
  // ↔ T3 body radius≈158386) 에서 동일 틱이 전혀 다른 비율 변화를 낳는다. 위성(galilean) focus
  // 후 free-fly 진입 시 카메라가 tier=body / radius≈158386 으로 잔존하는데, 절대 델타(틱당 수십
  // unit)는 radius 158386 대비 변화율이 0.03% 로 떨어져 줌이 체감상 완전히 멈춘다 → 사용자가
  // "탐색 시 시점 고정" 으로 인지 (forensic ADR docs/decisions/20260607-629-freefly-camera-zoom-forensic.md).
  // percentage 모드는 모든 tier/scale 에서 일정 비율(틱당 ~1%) 줌을 보장한다.
  // (Babylon: deltaPercentage 설정 시 절대 precision 은 무시되므로 wheelPrecision/pinchPrecision 제거.)
  camera.wheelDeltaPercentage = ZOOM_DELTA_PERCENTAGE;
  camera.pinchDeltaPercentage = ZOOM_DELTA_PERCENTAGE;
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
