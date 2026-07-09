import {
  Animation,
  EasingFunction,
  ExponentialEase,
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
  const { extendSize } = mesh.getBoundingInfo().boundingBox;
  const { scaling } = mesh;
  return Math.max(
    extendSize.x * Math.abs(scaling.x),
    extendSize.y * Math.abs(scaling.y),
    extendSize.z * Math.abs(scaling.z),
  );
}

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
    // tier-transition.ts:189 와 동일 패턴 — focus 트리거 한정 완화 (manual zoom 영향 0).
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
  }

  /** 카메라 reset — 기본 위치로 복귀 */
  reset(targetRadius = 35, target: Vector3 = Vector3.Zero()): void {
    // R-Phase #507 — focus 해제 시 follow observer detach. observer 잔존 시 Animation 의
    // target=(0,0,0) 을 매 프레임 mesh 위치로 덮어써 reset 자체가 무효화됨.
    this.#detachFollow();

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
    this.#detachFollow();
    this.#scene.stopAllAnimations();
  }
}
