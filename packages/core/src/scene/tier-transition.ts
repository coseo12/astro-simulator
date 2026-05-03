/**
 * P12-B #298 — Tier 전환 애니메이션 (Q8=8D 배선 원리)
 *
 * ADR: `docs/decisions/20260423-display-relative-scale-unification.md` §3 후보 D
 *
 * ## 배선 원리 (apparent size 불변)
 *
 * Phase A 는 tier 전환 시 mesh.scaling 과 orbit line 을 즉시 `newScale/oldScale` 배수로
 * 확대했다. 그러나 카메라 radius 가 그대로라면 body 가 화면을 가득 채우거나 (scale up)
 * 사라지는 (scale down) flicker 가 발생한다. Phase B 는 다음 수식으로 apparent size 보존:
 *
 *   ratio = renderScale_new / renderScale_old
 *   radius_new = radius_old / ratio         ← scene unit 관점 시야각 불변
 *   apparent_px(body) = focal_length × (body.radius_m × renderScale) / camera.radius
 *                     = const  (ratio 상쇄)
 *
 * mesh.scaling 과 orbit line 은 setTier 가 **즉시** 적용 (rebuild) 하고, camera.radius 만
 * 300ms ExponentialEase 로 interp. 이 구성이 "apparent size 는 즉각 변하지만 카메라가 rollback
 * 하지 않은 상태" 를 피하면서 "scene unit 관점 시야각은 불변" 을 만족시킨다.
 *
 * ## 안전장치 (ADR §3 Medium)
 *
 *  1. **Pending tween 취소** — user focusOn 직후 tier 경계를 넘으면 radius 애니메이션 2개
 *     충돌 가능. 진입 시 `scene.getAnimatableByTarget(camera)` 로 pending 취소 후 재시작.
 *  2. **이중 attachControl 안전장치** — `onAnimationEnd` 콜백 + `setTimeout(lockMs)` fallback.
 *     Babylon Animation 은 탭 비활성 (document.hidden) 에서 frame callback 미발생 → fallback
 *     timer 가 반드시 발동해 영구 잠금 방지. `attachControl` 은 idempotent.
 *  3. **visibilitychange resume** — `document.visibilitychange` 에서 resume 시 강제
 *     attachControl. handler idempotent. 구독은 시작 시, 해제는 정리 경로 (animation end).
 *  4. **minZ 재조정** — `radius_new` 가 이전 minZ 이하로 clamp 되면 apparent size 수식이 깨짐.
 *     전환 전 `cam.minZ = radius_new × 0.01` 로 선행 조정 (V5 clamp 충돌 방어).
 */

import {
  Animation,
  EasingFunction,
  ExponentialEase,
  type ArcRotateCamera,
  type Mesh,
  type Scene,
} from '@babylonjs/core';

/**
 * focus 대상 mesh 에서 카메라까지의 목표 radius 배수 — `meshBoundingRadius × N`.
 *
 * 기준 viewport 1280×800, Babylon default fov 0.8 rad. V5 DoD "지구 세로 40% ±5% (304~336px)"
 * 달성 공식 유도:
 *
 *   pixel = mesh_diameter × render_h / (2 × radius × tan(fov / 2))
 *         = (2 × boundingR × N) / N × render_h / (2 × (boundingR × N) × tan(fov/2))
 *   ⇒ pixel = render_h / (N × tan(fov / 2))
 *   ⇒ N = render_h / (target_pixel × tan(fov / 2))
 *       = 800 / (320 × tan(0.4)) = 800 / (320 × 0.4228) ≈ **5.91**
 *
 * 실측 검증:
 *   - ×5.0 → 357px (상한 336 초과)
 *   - ×5.3 → 340px (상한 336 초과)
 *   - ×5.9 → 320 근사 (V5 DoD 중앙 ±5%)
 *
 * camera-controller.ts 의 기존 `focusOn` (`×5`) 은 **user-trigger 경로 한정 유지** — 본 상수는
 * tier 전환 시 `runTierTransition` 의 focusMesh 경로 전용. fov/viewport 이 변하면 수식으로 재튜닝.
 */
const FOCUS_RADIUS_MULTIPLIER = 5.9;

/**
 * Tier 전환 전용 ExponentialEase — module-level 에서 1회 생성 후 공유.
 *
 * [P12-C #298 — m3 하드닝] 함수형 모듈 특성상 `runTierTransition` 호출마다 `new ExponentialEase()`
 * 재생성은 오버헤드가 무시할 수준이지만, `camera-controller.ts` 가 생성자에서 1회 생성 후 `#easing`
 * 필드로 재사용하는 패턴과의 **일관성 nit** 으로 hoisting (Phase B PR #304 Reviewer m3).
 * easing 함수는 stateless — 공유 안전.
 */
const TIER_TRANSITION_EASE = (() => {
  const ease = new ExponentialEase();
  ease.setEasingMode(EasingFunction.EASINGMODE_EASEOUT);
  return ease;
})();

/**
 * Camera dolly 목표 radius 계산 (Q8=8D apparent size 불변 수식).
 *
 * ## 수식 유도 — world-unit 실거리 보존
 *
 *   camera.radius 는 scene unit. 실거리 m = camera.radius / renderScale
 *   전환 전후 "사용자가 관찰하는 실거리" 를 보존해야 자연스럽다:
 *     radius_old / oldScale == radius_new / newScale
 *   ⇒ radius_new = radius_old × (newScale / oldScale)
 *
 * ## apparent size 불변 의미
 *
 *   mesh.diameter_scene (Phase A setTier 가 `scaling = newScale/initialScale`) =
 *     body.radius_m × newScale (초기 생성 직경 × scaling).
 *   apparent_px ∝ mesh.diameter_scene / camera.radius
 *     = (body.radius_m × newScale) / (radius_old × newScale / oldScale)
 *     = (body.radius_m × oldScale) / radius_old
 *     = 전환 전 apparent_px  ← 불변 성립
 *
 * ## ADR 서술 정합성
 *
 *   ADR §3 표기 `ratio = renderScale_new / renderScale_old, radius_new = radius_old / ratio` 는
 *   ratio 를 **역수** 로 해석할 때만 본 수식과 동일해진다. 본 구현은 직관적인 "scene unit
 *   비례 확대" 방향으로 정의 — 실거리 보존 관점에서 architect 의 V5 달성 의도와 정합.
 *   architect 설계안의 V5 hard fail 승격 근거 "수식 버그 감지 센서" 는 본 방향이 맞을 때
 *   자동 충족되도록 기능.
 *
 * ## 부동소수점 안정성
 *
 *   oldScale 이 매우 작을 때 (T1 solar = 8.4e-11) 나눗셈 전 곱셈 조합 `(r × new) / old` 이
 *   `r × (new/old)` 보다 double-precision 안정. T1→T3 (ratio ≈ 3e5) 같은 극단값에서도
 *   radius_old 가 30 전후의 정상 값이면 문제없음.
 *
 * @param radiusOld 전환 전 camera.radius (scene unit)
 * @param oldScale 전환 전 renderScale (m → scene unit)
 * @param newScale 전환 후 renderScale
 * @returns 전환 후 목표 radius (scene unit)
 */
export function computeTargetRadius(radiusOld: number, oldScale: number, newScale: number): number {
  return (radiusOld * newScale) / oldScale;
}

/**
 * minZ 재조정 권장값 — V5 clamp 충돌 방어.
 *
 * `cam.minZ = radius_new × 0.01` (ADR architect 설계안 위험 #3).
 * radius_new 가 현 minZ 이하로 떨어지면 apparent size 수식이 Babylon lowerRadiusLimit 에
 * clamp 되어 수식 의도가 깨진다. 전환 전에 미리 minZ 를 낮춰두면 정상 구간 내 동작.
 *
 * floor 는 1e-6 — 과도한 near-plane 축소로 log-depth 가 무의미해지는 구간 회피.
 */
export function computeNewMinZ(targetRadius: number): number {
  const FLOOR = 1e-6;
  return Math.max(FLOOR, targetRadius * 0.01);
}

/**
 * `runTierTransition` 옵션.
 */
export interface TierTransitionOptions {
  /** Babylon scene — detachControl/attachControl, animatable 조회에 필요 */
  scene: Scene;
  /** ArcRotateCamera — radius interp 대상 */
  camera: ArcRotateCamera;
  /** 전환 전 renderScale (m → scene unit) */
  oldScale: number;
  /** 전환 후 renderScale */
  newScale: number;
  /**
   * focus body mesh (있다면). Phase A 의 setTier 시점 scaling 이 이미 newScale 로 적용된 상태여야 한다.
   * 있으면 `desiredRadius = mesh.boundingSphere.radiusWorld × FOCUS_RADIUS_MULTIPLIER` 로 V5 달성 공식 사용.
   * 없으면 실거리 보존 수식 `radius_old × (newScale / oldScale)` fallback.
   */
  focusMesh?: Mesh;
  /** 전환 시간 (ms). 기본 300 */
  durationMs?: number;
  /** 입력 잠금 최대 시간 (ms). 기본 500 — durationMs + fallback 마진 */
  lockMs?: number;
}

/**
 * Tier 전환 애니메이션 한 번 실행. 기존 `setTier` 에서 mesh scaling / orbit rebuild 는
 * 즉시 처리되었다는 전제. 본 함수는 **camera.radius dolly + 입력 잠금** 만 책임.
 *
 * @returns cleanup 함수 — 테스트 / 강제 해제 목적. 내부 타이머 + visibility listener 해제.
 */
export function runTierTransition(opts: TierTransitionOptions): () => void {
  const { scene, camera, oldScale, newScale, focusMesh, durationMs = 300, lockMs = 500 } = opts;

  const radiusOld = camera.radius;
  // focusMesh 가 있으면 V5 달성 공식 (boundingRadius × 5) 사용. setTier 시점에 scaling 이 이미 newScale
  // 반영된 상태이므로 boundingSphere.radiusWorld 도 새 tier 기준.
  // 없으면 실거리 보존 수식 fallback (free-fly tier 전환 등 focus 없는 경로).
  let targetRadius: number;
  if (focusMesh) {
    // #378 옵션 B — boundingInfo 갱신 강제 (defense-in-depth, ADR 가설 4).
    // setTier 가 mesh.scaling 을 newScale 로 갱신했더라도 boundingSphere.radiusWorld 가
    // 다음 frame 의 world matrix recompute 전까지 잔존 값을 반환하는 timing race 가능.
    // venus 관찰 모드 회귀의 가장 그럴듯한 단일 원인 (ADR §결정 근거 3, 연구 모드 정상의 메커니즘
    // = panel resize → engine.resize() → 자연 boundingInfo 갱신 → H4 회피).
    // solar-system-scene.ts:569 에서 이미 모든 mesh 의 computeWorldMatrix(true) 를 호출하지만,
    // 호출 순서 / 다른 부수효과 race 시 안전망.
    focusMesh.computeWorldMatrix(true);
    focusMesh.refreshBoundingInfo();
    const boundingInfo = focusMesh.getBoundingInfo();
    const meshRadius = boundingInfo.boundingSphere.radiusWorld;
    targetRadius = Math.max(meshRadius * FOCUS_RADIUS_MULTIPLIER, meshRadius + 0.01);
  } else {
    targetRadius = computeTargetRadius(radiusOld, oldScale, newScale);
  }

  // (1) minZ 재조정 — radius_new 가 minZ clamp 에 걸리지 않도록 선행 (V5 보장).
  //     maxZ 는 log-depth 전제로 충분 (1e14). minZ 만 낮춘다.
  const newMinZ = computeNewMinZ(targetRadius);
  if (newMinZ < camera.minZ) {
    camera.minZ = newMinZ;
  }
  // lowerRadiusLimit 과도 충돌 가능 — targetRadius 가 lowerRadiusLimit 이하로 내려가면 clamp.
  // 전환 중 한시적으로 lowerRadiusLimit 도 완화 (전환 직후 원복은 생략 — 사용자 수동 reset 허용).
  if (camera.lowerRadiusLimit != null && targetRadius < camera.lowerRadiusLimit) {
    camera.lowerRadiusLimit = Math.max(newMinZ, targetRadius * 0.5);
  }

  // (2) Pending tween 취소 — user focusOn 직후 tier 경계를 넘을 때 애니메이션 충돌 방지.
  //
  //     radius + target 모두 취소한다. 이유:
  //     - focusOn 이 설정한 target tween 은 **tier 전환 전 mesh.position** (구 renderScale 좌표) 으로
  //       interp 중. tier 전환 직후 mesh.position 이 새 renderScale 로 재할당됨 (solar-system-scene
  //       의 updateAt 경로). 기존 target tween 을 놔두면 과도기 target 에 고정 → A1 편차 발생.
  //     - 대신 본 함수가 새 mesh.absolutePosition 으로 target 을 **즉시 재설정** (아래 (3) 단계).
  //       focusOn 의 300ms target tween 은 시각적으로 거의 완료 시점이므로 순간 jump 무시 가능.
  //
  //     `scene.stopAnimation(camera, animationName)` 은 특정 이름 animation 만 취소.
  for (const name of [
    'cam-radius',
    'cam-reset-radius',
    'tier-transition-radius',
    'cam-target',
    'cam-reset-target',
  ]) {
    scene.stopAnimation(camera, name);
  }

  // (2-b) focusMesh 있으면 camera.target 을 mesh 새 월드 좌표로 **즉시 동기화**.
  //       focusOn 이 구 renderScale 기준 좌표로 tween 중이던 것을 취소하고 새 좌표로 jump.
  //       target 은 ArcRotateCamera 기준 기본 Vector3 — setTarget() 로 직접 할당.
  if (focusMesh) {
    focusMesh.computeWorldMatrix(true);
    const worldPos = focusMesh.absolutePosition;
    // camera.target 은 Vector3. Vector3 의 copyFrom 으로 값 복사 (새 객체 할당 회피).
    camera.target.copyFrom(worldPos);
  }

  // (3) 입력 잠금. detachControl 호출 — pointer / keyboard 이벤트 모두 차단 (Babylon 표준).
  scene.detachControl();

  let released = false;
  const releaseControl = () => {
    if (released) return;
    released = true;
    // attachControl 은 idempotent 하지만 scene 이 dispose 된 edge case 대비 try 감싸기.
    try {
      scene.attachControl();
    } catch {
      // scene dispose 후 호출 — 안전하게 무시.
    }
  };

  // (4) Fallback timer — onAnimationEnd 미호출 (탭 비활성 / 오류) 시 강제 해제.
  const fallbackHandle = setTimeout(releaseControl, lockMs);

  // (5) visibilitychange 핸들러 — fallback timer 와 이중 방어 (defense-in-depth).
  //     실 런타임에서는 `setTimeout(releaseControl, lockMs=500)` 이 선행 발동해 visibility 이벤트
  //     도달 시점에 이미 `released=true` 인 경우가 지배적이지만, 둘 중 **먼저 도달한 쪽이 release**
  //     하고 다른 쪽은 idempotent 로 흡수. 탭 즉시 복귀 시 fallback 을 기다리지 않고 attach 를
  //     앞당기는 효과도 겸함 (UX jitter 최소화).
  //     document 는 브라우저 환경 only — SSR / jsdom 환경에선 globalThis.document 가 없거나 제한.
  const doc: Document | undefined = typeof document !== 'undefined' ? document : undefined;
  const onVisibilityChange = () => {
    if (doc && !doc.hidden) {
      releaseControl();
    }
  };
  doc?.addEventListener('visibilitychange', onVisibilityChange);

  // (6) 애니메이션 시작 — module-level `TIER_TRANSITION_EASE` (ExponentialEase EASEOUT) 공유.
  //     easing 은 stateless 하므로 재사용 안전 (m3 hoisting).
  const FRAMES_PER_SECOND = 60;
  const totalFrames = Math.max(1, Math.round((durationMs / 1000) * FRAMES_PER_SECOND));

  const cleanup = () => {
    clearTimeout(fallbackHandle);
    doc?.removeEventListener('visibilitychange', onVisibilityChange);
    releaseControl();
  };

  Animation.CreateAndStartAnimation(
    'tier-transition-radius',
    camera,
    'radius',
    FRAMES_PER_SECOND,
    totalFrames,
    radiusOld,
    targetRadius,
    Animation.ANIMATIONLOOPMODE_CONSTANT,
    TIER_TRANSITION_EASE,
    () => {
      // onAnimationEnd — 정상 종료 경로. fallback timer 취소 + listener 해제 + attachControl.
      cleanup();
    },
  );

  return cleanup;
}
