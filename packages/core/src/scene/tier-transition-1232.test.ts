/**
 * #1232 — tier 경계 줌 전환 단위 테스트 (ADR 380 §Amendment 3).
 *
 * 두 결정의 계약을 고정한다:
 *  - (가) 후보 4: `preserveFocusDistance=true` 는 tween 없이 `camera.radius = targetRadius` 즉시 대입 +
 *    cleanup 동기 호출 (`released` 계약 — onComplete 정확히 1회 · attachControl · timer · listener 해제).
 *  - (나) A: 줌 관성 누적기 3종을 `computeTargetRadius` 와 같은 식으로 새 tier 단위로 환산 (경로 무관).
 *
 * 실 Babylon 내부 필드 (`camera.movement._zoomVelocity`) 를 다루는 테스트는 **NullEngine + 실
 * `ArcRotateCamera`** 로 한다 — duck-typed mock 에는 `movement` 가 없어 핀 역할을 못 한다.
 * `runTierTransition` 의 scene 제어 표면 (detach/attach/stopAnimation) 은 `mockControlScene` spy 로 본다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { Animation, ArcRotateCamera, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import type { Mesh } from '@babylonjs/core';

import { CameraController, computeFocusLowerRadiusFloor } from './camera-controller.js';
import {
  computeLowerRadiusLimit,
  computeNewMinZ,
  computeTargetRadius,
  rescaleZoomInertiaForTier,
  runTierTransition,
} from './tier-transition.js';
import { renderScaleForTier } from './tier.js';
import { mockControlScene } from './__test-utils__/babylon-mocks.js';

const INNER = renderScaleForTier('inner');
const BODY = renderScaleForTier('body');

/** 휠 줌 관성 누적기 내부 필드 — 타입 정의상 protected 라 구조 타입으로 접근. */
interface ZoomInternals {
  movement: {
    _zoomVelocity: number;
    zoomAccumulatedPixels: number;
    _rotationVelocity: Vector3;
  };
  _inertialRadiusOffset: number;
}
const internalsOf = (camera: ArcRotateCamera) => camera as unknown as ZoomInternals;

/**
 * 시각 반경 기반 최소 mesh 모킹 — `focus-lower-radius-floor.test.ts` 의 `mockMesh` 와 같은 모양
 * (scaling=1, local extendSize = 시각 반경, boundingSphere = 시각 반경 × √3).
 */
function mockMesh(visualRadius: number): Mesh {
  return {
    computeWorldMatrix: vi.fn(),
    refreshBoundingInfo: vi.fn(),
    scaling: { x: 1, y: 1, z: 1 },
    getBoundingInfo: () => ({
      boundingSphere: { radiusWorld: visualRadius * Math.sqrt(3) },
      boundingBox: { extendSize: { x: visualRadius, y: visualRadius, z: visualRadius } },
    }),
    absolutePosition: new Vector3(0, 0, 0),
    isDisposed: () => false,
  } as unknown as Mesh;
}

// earth body tier 시각 반경 (이슈 본문 실측 69,308 unit 급).
const EARTH_BODY_VISUAL_R = 69_308;

let engine: NullEngine;
let scene: Scene;

/** 실 ArcRotateCamera — 관성 누적기를 가진 유일한 표면. */
function makeCamera(radius: number, lowerRadiusLimit = 0.5): ArcRotateCamera {
  const camera = new ArcRotateCamera('cam-1232', 0, Math.PI / 3, radius, Vector3.Zero(), scene);
  camera.lowerRadiusLimit = lowerRadiusLimit;
  return camera;
}

/** 줌 관성이 살아있는 상태를 합성 (단위: 구 tier scene unit). */
function seedZoomInertia(camera: ArcRotateCamera, velocity: number, pixels: number, legacy = 0) {
  const c = internalsOf(camera);
  c.movement._zoomVelocity = velocity;
  c.movement.zoomAccumulatedPixels = pixels;
  c._inertialRadiusOffset = legacy;
}

beforeEach(() => {
  engine = new NullEngine();
  scene = new Scene(engine);
  vi.spyOn(Animation, 'CreateAndStartAnimation').mockReturnValue(null as never);
});
afterEach(() => {
  vi.restoreAllMocks();
  vi.useRealTimers();
  vi.unstubAllGlobals();
  scene.dispose();
  engine.dispose();
});

/** 'tier-transition-radius' 애니메이션 호출 목록. */
function tierTweenCalls() {
  return vi
    .mocked(Animation.CreateAndStartAnimation)
    .mock.calls.filter((c) => c[0] === 'tier-transition-radius');
}

describe('#1232 Babylon 내부 필드 핀 (fail-fast — A3.7 재검토 조건)', () => {
  it('실 ArcRotateCamera 에 movement._zoomVelocity · zoomAccumulatedPixels · _inertialRadiusOffset 가 number 로 존재', () => {
    // 런타임 헬퍼는 typeof 확인 후 skip 이라, 업그레이드로 필드가 사라지면 결함이 **조용히** 돌아온다.
    // 이 테스트가 그 경로를 CI 에서 막는다.
    const c = internalsOf(makeCamera(30));
    expect(typeof c.movement._zoomVelocity).toBe('number');
    expect(typeof c.movement.zoomAccumulatedPixels).toBe('number');
    expect(typeof c._inertialRadiusOffset).toBe('number');
  });

  it('행동 핀: _zoomVelocity 시드 → camera.update() → radius 가 시드 방향으로, 시드에 비례해 변한다', () => {
    // 존재 핀만으로는 부족하다 (#1232 reviewer 권고 4) — Babylon 업그레이드로 필드가 **남아 있으면서**
    // 의미·단위가 바뀌면 (다른 필드를 적분하거나 정규화된 값이 되면) 존재 핀은 통과하고 환산은 조용히
    // 무효가 된다. 환산이 기대는 성질 두 가지를 직접 고정한다:
    //  ① 방향 — `radius -= zoomDeltaCurrentFrame` 이라 양의 velocity 는 radius 를 줄인다 (줌인)
    //  ② 선형성 — `computeTargetRadius` 로 velocity 를 곱해 옮기는 것이 옳으려면 한 프레임 변위가
    //     velocity 에 비례해야 한다 (`zoomDelta = velocity × speed × … × dt`)
    const R0 = 1000;
    const V = 0.5;
    const K = 3;
    const deltaFor = (velocity: number) => {
      const camera = makeCamera(R0);
      seedZoomInertia(camera, velocity, 0);
      camera.update();
      return camera.radius - R0;
    };
    const dPos = deltaFor(V);
    const dNeg = deltaFor(-V);
    const dScaled = deltaFor(V * K);
    expect(dPos).toBeLessThan(0);
    expect(dNeg).toBeGreaterThan(0);
    expect(dScaled / dPos).toBeCloseTo(K, 9);
  });

  it('반례 고정: 공개 inertialRadiusOffset setter 로 곱해도 _zoomVelocity 는 바뀌지 않는다', () => {
    // 헬퍼가 공개 API 대신 내부 필드를 쓰는 이유. setter 는 0 을 쓸 때만 resetZoomVelocity 를 부른다.
    // 관성 진행 중의 실제 상태: velocity ≠ 0 이고 이번 프레임 변위 zoomDeltaCurrentFrame ≠ 0.
    // getter 는 레거시 필드·누적 픽셀이 0 이면 zoomDeltaCurrentFrame 을 돌려준다.
    const camera = makeCamera(30);
    seedZoomInertia(camera, 5, 0);
    const c = internalsOf(camera) as ZoomInternals & {
      movement: { zoomDeltaCurrentFrame: number };
    };
    c.movement.zoomDeltaCurrentFrame = 0.3;
    const k = BODY / INNER;
    camera.inertialRadiusOffset = camera.inertialRadiusOffset * k;
    // 누적기는 구 단위 그대로 — 레거시 필드에 변위 × k 가 **하나 더** 얹혔을 뿐이다 (실측 ×778 의 기전).
    expect(c.movement._zoomVelocity).toBe(5);
    expect(c._inertialRadiusOffset).toBeCloseTo(0.3 * k, 6);
  });
});

describe('#1232 rescaleZoomInertiaForTier — 관성 누적기 단위 환산', () => {
  it('누적기 3종이 각각 computeTargetRadius(x, old, new) 가 된다', () => {
    const camera = makeCamera(30);
    seedZoomInertia(camera, -1.067e4, -250, -12);
    rescaleZoomInertiaForTier(camera, BODY, INNER);
    const c = internalsOf(camera);
    expect(c.movement._zoomVelocity).toBe(computeTargetRadius(-1.067e4, BODY, INNER));
    expect(c.movement.zoomAccumulatedPixels).toBe(computeTargetRadius(-250, BODY, INNER));
    expect(c._inertialRadiusOffset).toBe(computeTargetRadius(-12, BODY, INNER));
  });

  it('회전 누적기 (rad — 스케일 무관) 는 불변', () => {
    const camera = makeCamera(30);
    const c = internalsOf(camera);
    c.movement._rotationVelocity.set(0.3, -0.2, 0);
    camera.inertialAlphaOffset = 0.01;
    rescaleZoomInertiaForTier(camera, INNER, BODY);
    expect(c.movement._rotationVelocity.asArray()).toEqual([0.3, -0.2, 0]);
    expect(camera.inertialAlphaOffset).toBe(0.01);
  });

  it('movement 가 없는 카메라 (duck-typed) 는 조용히 skip — throw 하지 않는다', () => {
    const bare = { radius: 30 } as unknown as ArcRotateCamera;
    expect(() => rescaleZoomInertiaForTier(bare, INNER, BODY)).not.toThrow();
  });
});

describe('#1232 runTierTransition preserveFocusDistance=true — 즉시 대입 + 동기 cleanup', () => {
  it('반환 시점 radius === targetRadius, tween 미생성, onComplete 동기 1회, attachControl 호출', () => {
    vi.useFakeTimers();
    const camera = makeCamera(19.5);
    const ctl = mockControlScene();
    const onComplete = vi.fn();
    runTierTransition({
      scene: ctl,
      camera,
      oldScale: INNER,
      newScale: BODY,
      focusMesh: mockMesh(EARTH_BODY_VISUAL_R),
      preserveFocusDistance: true,
      onComplete,
    });
    expect(camera.radius).toBe(computeTargetRadius(19.5, INNER, BODY));
    expect(tierTweenCalls()).toHaveLength(0);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(ctl.attachControl).toHaveBeenCalledTimes(1);
    // fallback timer 가 해제됐으므로 lockMs 경과 후에도 onComplete 는 1회.
    vi.advanceTimersByTime(1000);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(ctl.attachControl).toHaveBeenCalledTimes(1);
  });

  it('visibilitychange 가 와도 onComplete 1회 유지 (listener 해제 + released idempotent)', () => {
    const fakeDoc = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal('document', fakeDoc);
    const camera = makeCamera(19.5);
    const onComplete = vi.fn();
    const cleanup = runTierTransition({
      scene: mockControlScene(),
      camera,
      oldScale: INNER,
      newScale: BODY,
      preserveFocusDistance: true,
      onComplete,
    });
    fakeDoc.dispatchEvent(new Event('visibilitychange'));
    cleanup(); // 반환 cleanup 재호출도 no-op
    expect(onComplete).toHaveBeenCalledTimes(1);
  });

  it('호출자 lock 패턴 (setTier): 호출 전 true → 반환 시 false (onComplete 가 마지막 쓰기)', () => {
    let tierTransitionInProgress = false;
    const camera = makeCamera(19.5);
    tierTransitionInProgress = true;
    runTierTransition({
      scene: mockControlScene(),
      camera,
      oldScale: INNER,
      newScale: BODY,
      preserveFocusDistance: true,
      onComplete: () => {
        tierTransitionInProgress = false;
      },
    });
    expect(tierTransitionInProgress).toBe(false);
  });

  it('대입값은 floor 이상 — 대입 직후 _checkLimits clamp 가 걸리지 않는다', () => {
    const camera = makeCamera(19.5);
    runTierTransition({
      scene: mockControlScene(),
      camera,
      oldScale: INNER,
      newScale: BODY,
      focusMesh: mockMesh(EARTH_BODY_VISUAL_R),
      preserveFocusDistance: true,
    });
    expect(camera.radius).toBeGreaterThanOrEqual(camera.lowerRadiusLimit!);
  });

  it('누적기 환산이 이 경로에서도 적용된다', () => {
    const camera = makeCamera(19.5);
    seedZoomInertia(camera, -0.5, 0);
    runTierTransition({
      scene: mockControlScene(),
      camera,
      oldScale: INNER,
      newScale: BODY,
      preserveFocusDistance: true,
    });
    expect(internalsOf(camera).movement._zoomVelocity).toBe(computeTargetRadius(-0.5, INNER, BODY));
  });
});

describe('#1232 runTierTransition preserveFocusDistance=false — focus-entry tween 무변경', () => {
  it('tween 이 radiusOld → boundingR × 5.9 로 여전히 생성되고, 누적기 환산은 여기서도 적용 (경로 무관)', () => {
    const camera = makeCamera(22);
    seedZoomInertia(camera, 3, 7);
    runTierTransition({
      scene: mockControlScene(),
      camera,
      oldScale: INNER,
      newScale: BODY,
      focusMesh: mockMesh(EARTH_BODY_VISUAL_R),
    });
    const calls = tierTweenCalls();
    expect(calls).toHaveLength(1);
    const boundingR = EARTH_BODY_VISUAL_R * Math.sqrt(3);
    expect(calls[0]![5]).toBe(22); // 시작값 radiusOld
    expect(calls[0]![6]).toBeCloseTo(Math.max(boundingR * 5.9, boundingR + 0.01), 6);
    // tween 경로는 즉시 대입하지 않는다 — radius 는 tween 이 옮긴다.
    expect(camera.radius).toBe(22);
    const c = internalsOf(camera);
    expect(c.movement._zoomVelocity).toBe(computeTargetRadius(3, INNER, BODY));
    expect(c.movement.zoomAccumulatedPixels).toBe(computeTargetRadius(7, INNER, BODY));
  });
});

/**
 * D4 — 전환 종료 3경로 (+ 즉시 대입 경로) 모두에서 lowerRadiusLimit 이 #790 floor 합성값.
 *
 * 후보 4 는 limits 를 넓혔다 되돌리는 단계가 없으므로, 이 테스트는 「floor 가 어느 종료 경로에서도
 * 느슨해지지 않는다」 는 불변식의 회귀 가드다 (후보 3 류의 확장·복원이 들어오면 복원 누락을 잡는다).
 */
describe('#1232 D4 — cleanup 경로별 lowerRadiusLimit = #790 floor 복원', () => {
  const RADIUS_OLD = 22;

  function expectedFloor(targetRadius: number) {
    return Math.max(
      computeLowerRadiusLimit(targetRadius, computeNewMinZ(targetRadius)),
      computeFocusLowerRadiusFloor(EARTH_BODY_VISUAL_R, targetRadius),
    );
  }
  const tweenTarget = () => {
    const boundingR = EARTH_BODY_VISUAL_R * Math.sqrt(3);
    return Math.max(boundingR * 5.9, boundingR + 0.01);
  };

  function startTween(onComplete: () => void) {
    const camera = makeCamera(RADIUS_OLD);
    runTierTransition({
      scene: mockControlScene(),
      camera,
      oldScale: INNER,
      newScale: BODY,
      focusMesh: mockMesh(EARTH_BODY_VISUAL_R),
      onComplete,
    });
    return camera;
  }

  it('① 정상 종료 (onAnimationEnd 콜백 — spy 인자 [9])', () => {
    const onComplete = vi.fn();
    const camera = startTween(onComplete);
    const onEnd = tierTweenCalls()[0]![9] as () => void;
    onEnd();
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(camera.lowerRadiusLimit).toBe(expectedFloor(tweenTarget()));
  });

  it('② fallback timer', () => {
    vi.useFakeTimers();
    const onComplete = vi.fn();
    const camera = startTween(onComplete);
    expect(onComplete).not.toHaveBeenCalled();
    vi.advanceTimersByTime(500);
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(camera.lowerRadiusLimit).toBe(expectedFloor(tweenTarget()));
  });

  it('③ visibilitychange', () => {
    const fakeDoc = Object.assign(new EventTarget(), { hidden: false });
    vi.stubGlobal('document', fakeDoc);
    const onComplete = vi.fn();
    const camera = startTween(onComplete);
    expect(onComplete).not.toHaveBeenCalled();
    fakeDoc.dispatchEvent(new Event('visibilitychange'));
    expect(onComplete).toHaveBeenCalledTimes(1);
    expect(camera.lowerRadiusLimit).toBe(expectedFloor(tweenTarget()));
  });

  it('④ 즉시 대입 경로 (preserveFocusDistance=true — 동기 cleanup)', () => {
    const camera = makeCamera(RADIUS_OLD);
    runTierTransition({
      scene: mockControlScene(),
      camera,
      oldScale: INNER,
      newScale: BODY,
      focusMesh: mockMesh(EARTH_BODY_VISUAL_R),
      preserveFocusDistance: true,
    });
    const target = computeTargetRadius(RADIUS_OLD, INNER, BODY);
    expect(camera.lowerRadiusLimit).toBe(expectedFloor(target));
    // #790 불변식: 표면 밖 (visualR 이상) — 이 target 은 visualR×1.05 보다 크다.
    expect(camera.lowerRadiusLimit!).toBeGreaterThan(EARTH_BODY_VISUAL_R);
  });
});

describe('#1232 두 경로 계약 — CameraController.focusOn 은 줌 관성 누적기에 쓰지 않는다', () => {
  it('focusOn 호출 전후 _zoomVelocity · zoomAccumulatedPixels · _inertialRadiusOffset 동일', () => {
    // 쓰면 runTierTransition 의 rescaleZoomInertiaForTier 를 되돌리는 #790 클래스 회귀.
    const camera = makeCamera(30);
    seedZoomInertia(camera, 2.5, 4, 1.5);
    const controller = new CameraController(camera, mockControlScene());
    controller.focusOn({ mesh: mockMesh(2.922) });
    const c = internalsOf(camera);
    expect(c.movement._zoomVelocity).toBe(2.5);
    expect(c.movement.zoomAccumulatedPixels).toBe(4);
    expect(c._inertialRadiusOffset).toBe(1.5);
  });
});
