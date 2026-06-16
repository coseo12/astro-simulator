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

/**
 * #693 — free-fly 패닝(우클릭/Ctrl 드래그) 시 화면 px ↔ world 이동 비율 상수.
 *
 * "drag 1px ≈ radius × PANNING_DELTA_PERCENTAGE world 이동" 을 보장한다. tier 별 renderScale
 * 비대칭(solar radius≈35 ↔ body radius≈158386)에서 절대 `panningSensibility` 는 화면 px↔world
 * 비율이 깨진다는 #629 `wheelDeltaPercentage` 교훈을 패닝에 적용 (forensic ADR
 * docs/decisions/20260616-693-freefly-panning.md §결정 2). D-T2 감도 튜닝 시 본 상수만 조정.
 */
export const PANNING_DELTA_PERCENTAGE = 0.01;

/**
 * #693 — radius 기반 `panningSensibility` 산출.
 *
 * Babylon `panningSensibility` 는 정적 스칼라(divisor — 값↑ = 둔감)이고 radius 에 자동 비례하지
 * 않는다("deltaPercentage" 패닝 옵션 부재) → radius 가 변할 때마다(줌) 재산출해야 화면 px↔world
 * 비율이 일정하다. drag 1px world 이동량 ≈ radius × PANNING_DELTA_PERCENTAGE 가 되도록
 * `sensibility = REFERENCE / (radius × pct)` 형태.
 *
 * **zero-division 가드 (ADR §결정 1, agy 고유 발견 ①)**: 분모 radius 가 0/NaN 이면 sensibility 가
 * Infinity/NaN 으로 발산 → 패닝 입력이 NaN target 을 만들어 렌더링 먹통(DoS). radius 는 카메라
 * `lowerRadiusLimit`(tier 별 양수, 기본 0.5)에서 clamp 되지만 산식 분모는 방어적으로 명시 하한
 * (`Math.max(radius, lowerRadiusLimit, EPSILON)`)을 적용한다.
 */
export function computePanningSensibility(camera: ArcRotateCamera): number {
  // Babylon panning 내부식 기준 참조 상수: sensibility=1 일 때 1px drag ≈ 1 world unit /
  // (radius 무관). REFERENCE_SENSIBILITY 를 radius×pct 로 나눠 radius 비례를 부여한다.
  const REFERENCE_SENSIBILITY = 1000;
  const EPSILON = 1e-6;
  const lower = camera.lowerRadiusLimit ?? EPSILON;
  // NaN 방어: Number.isFinite 가 아니면 lower 로 대체 후 하한 clamp.
  const safeRadius = Number.isFinite(camera.radius) ? camera.radius : lower;
  const denom = Math.max(safeRadius, lower, EPSILON) * PANNING_DELTA_PERCENTAGE;
  return REFERENCE_SENSIBILITY / denom;
}

/**
 * #693 — free-fly ↔ focus 전환 시 패닝 활성/비활성 토글.
 *
 * - free-fly 진입 → `computePanningSensibility(camera)` (radius 비례 활성)
 * - focus 진입 → `0` (비활성). focus 중 `#followObserver`(camera-controller.ts)가 매 프레임
 *   target 을 focus mesh 로 덮어쓰므로 패닝 입력이 즉시 상쇄됨 → 활성화 무의미 + jitter (ADR §결정 3
 *   옵션 A).
 *
 * free-fly 활성 중에는 줌(radius 변동)에 따라 sensibility 가 어긋나지 않도록 `onBeforeRender` 에서
 * `enabled=true` 로 매 프레임 재호출해야 한다 (ADR §결정 2, agy 고유 발견 ②).
 */
export function setPanningEnabled(camera: ArcRotateCamera, enabled: boolean): void {
  camera.panningSensibility = enabled ? computePanningSensibility(camera) : 0;
}

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
  // #693 — 패닝은 free-fly 진입 시에만 활성. 초기값 0(비활성) — focus 가 기본 상태이고 focus 중
  // followObserver 가 target 을 덮어쓰므로 패닝 무의미(ADR §결정 3 옵션 A). free-fly ↔ focus
  // 전환 시 setPanningEnabled() 로 토글, free-fly 활성 중에는 onBeforeRender 에서 radius 비례
  // 재산출(줌 일관성, §결정 2). 패닝 축 = Babylon 기본 스크린 평면(viewport XY) — "보이는 화면을
  // 미는" 멘탈 모델 정합 (§결정 3, panningAxis 미설정 = 기본값 유지).
  camera.panningSensibility = 0;
  // 로그 뎁스 버퍼 전제 — 극단 near/far (행성 표면 ~ 태양계 외곽 이상)
  camera.minZ = 0.01;
  camera.maxZ = 1e14;

  const canvas = scene.getEngine().getRenderingCanvas();
  if (canvas) {
    camera.attachControl(canvas, true);
    // #693 — 우클릭 드래그 패닝 시 브라우저 contextmenu 팝업 차단 (ADR §결정 5).
    // `attachControl(canvas, true)` 는 noPreventDefault=true 라 native 우클릭 메뉴가 뜬다 →
    // 우클릭 패닝과 충돌. canvas 한정 contextmenu 차단으로 패닝 UX 보존 (좌클릭 회전/휠 줌 무영향).
    // named handler + camera dispose 시 제거 — HMR/StrictMode 재마운트 리스너 누수 방지 (reviewer 권고).
    const preventContextMenu = (e: Event) => e.preventDefault();
    canvas.addEventListener('contextmenu', preventContextMenu);
    camera.onDisposeObservable.add(() => {
      canvas.removeEventListener('contextmenu', preventContextMenu);
    });
  }

  return camera;
}
