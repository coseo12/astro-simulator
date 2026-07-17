/**
 * #790 — focus body 최대 줌인 시 카메라 mesh 내부 진입 암전 회귀 가드.
 *
 * 현상: `?focus=sun` 에서 lowerRadiusLimit(0.5) < sun 시각 반경(2.922) → 최대 줌인 시
 * 카메라가 mesh 내부 진입 → backface culling 화면 암전 (#774 qa 실측, 사전 존재).
 * 대조표 실측 (모듈 로직 재현, PR 본문 박제): 32/32 body 전수 침범 —
 *  - tier 무전환 (sun): default 0.5 vs meshR 2.922 (limit/meshR = 0.171)
 *  - tier 전환 body: 가드 A `targetRadius×0.01 = meshR×0.059` — 표면 94% 안쪽
 *
 * fix: focus 경로 2곳 (focusOn / runTierTransition focusMesh) 에서
 * `computeFocusLowerRadiusFloor(visualR, desiredR) = min(visualR × 1.05, desiredR)` 하한 상향.
 * visualR = `resolveMeshVisualRadius` (local extendSize × scaling, 회전 불변) —
 * boundingSphere.radiusWorld 는 box 외접구 √3 과대 + #782 자전 위상 진동으로 부적합
 * (jupiter 실측 33.2~34.8 진동, floor 로 쓰면 body tier 진입 경계 23 unit 침범 회귀).
 *
 * 검증 대상 (Babylon 엔진/WebGL 불필요 — duck-typed mock + Animation static spy):
 *  - FOCUS_LOWER_RADIUS_SURFACE_MARGIN 박제값 (1.05)
 *  - computeFocusLowerRadiusFloor 순수식 + 불변식 (visualR ≤ floor ≤ desiredR)
 *  - resolveMeshVisualRadius — 축별 extendSize × scaling 의 max (회전 불변 정의)
 *  - CameraController.focusOn — sun 재현 케이스 + #378 극소 mesh 완화 무회귀
 *  - runTierTransition — focusMesh 경로 floor 적용 / free-fly (focusMesh 없음) 무회귀
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { Animation, Vector3 } from '@babylonjs/core';
import type { ArcRotateCamera, Mesh, Scene } from '@babylonjs/core';
import { AU } from '@astro-simulator/shared';

import {
  CameraController,
  FOCUS_LOWER_RADIUS_SURFACE_MARGIN,
  computeFocusLowerRadiusFloor,
  resolveMeshVisualRadius,
} from './camera-controller.js';
import {
  runTierTransition,
  computeNewMinZ,
  computeLowerRadiusLimit,
  computeTargetRadius,
} from './tier-transition.js';
import { renderScaleForTier } from './tier.js';

/** focusOn/runTierTransition 이 만지는 속성만 갖는 최소 카메라 모킹. */
function mockCamera(lowerRadiusLimit = 0.5, minZ = 0.01): ArcRotateCamera {
  return {
    radius: 30,
    minZ,
    lowerRadiusLimit,
    target: new Vector3(0, 0, 0),
  } as unknown as ArcRotateCamera;
}

/**
 * 시각 반경 기반 최소 mesh 모킹 — scaling=1 기본, local extendSize = 시각 반경 (균등 구체).
 * boundingSphere.radiusWorld 는 실 Babylon 처럼 box 외접구 (시각 반경 × √3) 로 모킹해
 * "bounding ≥ 시각 반경" 관계를 재현한다 — desiredRadius(프레이밍) 는 bounding 기준,
 * floor 는 시각 반경 기준이라는 이원 구조가 production 과 동일하게 통과해야 한다.
 */
function mockMesh(visualRadius: number, scaling = { x: 1, y: 1, z: 1 }): Mesh {
  const maxScale = Math.max(Math.abs(scaling.x), Math.abs(scaling.y), Math.abs(scaling.z));
  return {
    computeWorldMatrix: vi.fn(),
    refreshBoundingInfo: vi.fn(),
    scaling,
    getBoundingInfo: () => ({
      boundingSphere: { radiusWorld: visualRadius * maxScale * Math.sqrt(3) },
      boundingBox: { extendSize: { x: visualRadius, y: visualRadius, z: visualRadius } },
    }),
    absolutePosition: new Vector3(0, 0, 0),
    isDisposed: () => false,
  } as unknown as Mesh;
}

function mockScene(): Scene {
  return {
    onBeforeRenderObservable: { add: vi.fn(), remove: vi.fn() },
    detachControl: vi.fn(),
    attachControl: vi.fn(),
    stopAnimation: vi.fn(),
    stopAllAnimations: vi.fn(),
  } as unknown as Scene;
}

// Animation.CreateAndStartAnimation 은 실 scene/rendering loop 필요 — 정적 spy 로 차단.
// focusOn/runTierTransition 의 lowerRadiusLimit 동기 로직만 검증 (tween 자체는 브라우저 가드 영역).
beforeEach(() => {
  vi.spyOn(Animation, 'CreateAndStartAnimation').mockReturnValue(null as never);
});
afterEach(() => {
  vi.restoreAllMocks();
});

describe('#790 computeFocusLowerRadiusFloor — 순수식 + 불변식', () => {
  it('FOCUS_LOWER_RADIUS_SURFACE_MARGIN 박제값 = 1.05', () => {
    expect(FOCUS_LOWER_RADIUS_SURFACE_MARGIN).toBe(1.05);
  });

  it('정상 범위: meshR × 1.05 반환 (desiredR 여유 충분)', () => {
    // sun: meshR 2.922 (solar tier 시각 반경), desiredR 14.61 (×5)
    expect(computeFocusLowerRadiusFloor(2.922, 14.61)).toBeCloseTo(3.0681, 4);
  });

  it('desiredR clamp: floor 가 프레이밍 radius 를 초과하지 않는다 (도달성 불변식)', () => {
    // 호출자가 명시 radius 를 meshR×1.05 미만으로 전달하는 방어 케이스.
    expect(computeFocusLowerRadiusFloor(10, 5)).toBe(5);
  });

  it('대조표 대표 5 body — 불변식 visualR ≤ max(가드 A, floor) ≤ desiredR (production 합성식)', () => {
    // #790 대조표 (모듈 로직 재현 스크립트 실측값 박제). tier 전환 body 는
    // runTierTransition 의 합성: max(computeLowerRadiusLimit(targetTT, newMinZ), floor).
    // targetTT 는 boundingSphere(≈ visualR × √3) × 5.9 — production 이원 구조 재현.
    const V5_MULTIPLIER = 5.9; // tier-transition.ts FOCUS_RADIUS_MULTIPLIER
    const SQRT3 = Math.sqrt(3);
    const cases = [
      { id: 'earth', visualR: 6.931e4 }, // planet → body tier
      { id: 'jupiter', visualR: 14.24 }, // planet → inner tier
      { id: 'moon', visualR: 4.72e3 }, // satellite (×20)
      { id: 'eris', visualR: 2.96e4 }, // dwarf → body tier
      { id: 'encke', visualR: 301.2 }, // comet (최소 시각 반경)
    ];
    for (const { visualR } of cases) {
      const boundingR = visualR * SQRT3;
      const targetTT = Math.max(boundingR * V5_MULTIPLIER, boundingR + 0.01);
      const guardA = computeLowerRadiusLimit(targetTT, computeNewMinZ(targetTT));
      const fixed = Math.max(guardA, computeFocusLowerRadiusFloor(visualR, targetTT));
      expect(fixed).toBeGreaterThanOrEqual(visualR); // 표면 밖 보장
      expect(fixed).toBeLessThanOrEqual(targetTT); // 프레이밍 도달성 보장
      // 가드 A (targetTT×0.01 = visualR×0.102) vs floor (visualR×1.05) — floor 가 항상 우세.
      expect(fixed).toBeCloseTo(visualR * FOCUS_LOWER_RADIUS_SURFACE_MARGIN, 6);
    }
  });
});

describe('#790 resolveMeshVisualRadius — 회전 불변 시각 반경', () => {
  it('균등 구체: extendSize × scaling (saturn solar tier 실측 0.7130 재현)', () => {
    expect(resolveMeshVisualRadius(mockMesh(0.713))).toBeCloseTo(0.713, 6);
  });

  it('tier scaling 반영: local 0.8335 × scaling 18.333 (jupiter inner tier 실측 15.28)', () => {
    const mesh = mockMesh(0.8335, { x: 18.3333, y: 18.3333, z: 18.3333 });
    expect(resolveMeshVisualRadius(mesh)).toBeCloseTo(15.28, 2);
  });

  it('비균등 scaling: 축별 곱의 max (oblate 보수 판정)', () => {
    const mesh = mockMesh(1, { x: 2, y: 1.5, z: -3 });
    expect(resolveMeshVisualRadius(mesh)).toBe(3); // |z| 축 우세 (음수 scaling 방어)
  });

  it('boundingSphere(√3 과대) 보다 항상 작거나 같다 — floor 기반 교체 근거', () => {
    const mesh = mockMesh(2.922);
    const visual = resolveMeshVisualRadius(mesh);
    const bounding = mesh.getBoundingInfo().boundingSphere.radiusWorld;
    expect(visual).toBeLessThan(bounding);
    expect(bounding / visual).toBeCloseTo(Math.sqrt(3), 6);
  });
});

describe('#790 CameraController.focusOn — lowerRadiusLimit 시각 반경 하한 (상향)', () => {
  it('sun 재현: default 0.5 → visualR 2.922 × 1.05 로 상향 (침범 차단)', () => {
    const camera = mockCamera(0.5);
    const controller = new CameraController(camera, mockScene());
    controller.focusOn({ mesh: mockMesh(2.922) });
    expect(camera.lowerRadiusLimit).toBeCloseTo(2.922 * 1.05, 4);
    expect(camera.lowerRadiusLimit!).toBeGreaterThan(2.922);
  });

  it('tier 전환 잔존 limit (earth body tier 가드 A 값) → visualR × 1.05 로 상향', () => {
    // 대조표: earth visualR 6.931e4, 가드 A 잔존 limit (= targetTT × 0.01 ≈ visualR × 0.102)
    const camera = mockCamera(4089);
    const controller = new CameraController(camera, mockScene());
    controller.focusOn({ mesh: mockMesh(6.931e4) });
    expect(camera.lowerRadiusLimit).toBeCloseTo(6.931e4 * 1.05, 0);
  });

  it('#378 무회귀: 극소 mesh (T1 venus 관찰) — 완화(하향) 경로 유지, floor 비바인딩', () => {
    // visualR 0.002 → boundingR 0.00346 → desiredR = boundingR + 0.01 = 0.01346 < 0.5
    // → #378 완화 = max(minZ 0.01, desiredR × 0.5 = 0.00673) = 0.01.
    // floor = min(0.002 × 1.05, 0.01346) = 0.0021 < 0.01 → floor 는 바인딩되지 않는다.
    const camera = mockCamera(0.5, 0.01);
    const controller = new CameraController(camera, mockScene());
    controller.focusOn({ mesh: mockMesh(0.002) });
    expect(camera.lowerRadiusLimit).toBeCloseTo(0.01, 6);
  });

  it('명시 radius 전달 시에도 floor 적용 (sim-canvas satellite ×20 경로)', () => {
    // moon: visualR 4720, 명시 desiredR = 94400 → floor = min(4956, 94400) = 4956.
    const camera = mockCamera(278.5); // 가드 A 잔존값 (대조표)
    const controller = new CameraController(camera, mockScene());
    controller.focusOn({ mesh: mockMesh(4720), radius: 94400 });
    expect(camera.lowerRadiusLimit).toBeCloseTo(4720 * 1.05, 0);
  });

  it('프레이밍 도달성: 상향 후에도 lowerRadiusLimit ≤ desiredRadius', () => {
    const camera = mockCamera(0.5);
    const controller = new CameraController(camera, mockScene());
    const visualR = 2.922;
    controller.focusOn({ mesh: mockMesh(visualR) });
    // desiredRadius = boundingSphere(visualR×√3) × 5 — floor(visualR×1.05) 는 항상 그 이하.
    const desired = visualR * Math.sqrt(3) * 5;
    expect(camera.lowerRadiusLimit!).toBeLessThanOrEqual(desired);
  });
});

describe('#790 runTierTransition — focusMesh 경로 floor 적용', () => {
  it('focusMesh 있음: lowerRadiusLimit ≥ visualR × 1.05 (가드 A 단독값 visualR×0.102 를 상향)', () => {
    const camera = mockCamera(0.5);
    const scene = mockScene();
    const visualR = 6.931e4; // earth body tier 시각 반경 (대조표)
    const cleanup = runTierTransition({
      scene,
      camera,
      oldScale: 8.4e-11,
      newScale: 2.51e-5,
      focusMesh: mockMesh(visualR),
    });
    cleanup();
    expect(camera.lowerRadiusLimit).toBeCloseTo(visualR * 1.05, 0);
    expect(camera.lowerRadiusLimit!).toBeGreaterThan(visualR);
    // 프레이밍 도달성: targetRadius (boundingR × 5.9 = visualR × √3 × 5.9) 이하.
    expect(camera.lowerRadiusLimit!).toBeLessThanOrEqual(visualR * Math.sqrt(3) * 5.9);
  });

  it('focusMesh 없음 (free-fly 전환): 기존 #380 가드 A 값 유지 — 무회귀', () => {
    const camera = mockCamera(0.5);
    const scene = mockScene();
    // free-fly 실거리 보존 수식: targetRadius = 30 × (1.54e-9 / 8.4e-11) ≈ 550.
    const cleanup = runTierTransition({
      scene,
      camera,
      oldScale: 8.4e-11,
      newScale: 1.54e-9,
    });
    cleanup();
    const targetRadius = (30 * 1.54e-9) / 8.4e-11;
    const expected = computeLowerRadiusLimit(targetRadius, computeNewMinZ(targetRadius));
    expect(camera.lowerRadiusLimit).toBeCloseTo(expected, 6);
  });
});

/**
 * #818 — 줌 crossing apparent-size 보존 (`preserveFocusDistance`) 단위 가드.
 *
 * ## 회귀 (architect 실측 재현)
 *
 * jupiter/saturn focus inner 정착 → 휠 줌인으로 cameraFromFocus 가 0.1 AU(=23.04 unit) 경계를
 * 넘어 inner→body crossing. 기존 focusMesh 경로는 `boundingR_body × 5.9` 로 재프레이밍 →
 * 카메라를 mesh 규모의 수백만 unit(≈0.89 AU) 밖으로 catapult → cameraFromFocus 가 다시 0.1 AU
 * 밖으로 튐 → inner 역판정 → 무한 진동(runaway, ~34 unit stall 로 관찰).
 *
 * fix: 줌 crossing (`preserveFocusDistance=true`) 은 focusMesh 경로에서도 `computeTargetRadius`
 * (실거리/apparent-size 보존) 로 목표 radius 산출 → crossing 후에도 cameraFromFocus < 0.1 AU 유지
 * → body 안정 → floor 까지 seamless 줌인. floor(#790)/target 동기화는 그대로 유지.
 *
 * ## 산술 재현 (crossing inner r=22 → body targetRadius < 0.1 AU)
 *
 *   computeTargetRadius(22, renderScale_inner, renderScale_body)
 *     = 22 × (2.51e-5 / 1.54e-9) ≈ 358,571 unit
 *   cameraFromFocus_m = 358,571 / renderScale_body ≈ 1.4286e10 m ≈ 0.0955 AU < 0.1 AU → body 안정
 */
describe('#818 runTierTransition — 줌 crossing apparent-size 보존 (preserveFocusDistance)', () => {
  const INNER = renderScaleForTier('inner'); // 1.54e-9
  const BODY = renderScaleForTier('body'); // 2.51e-5
  const PLANET_BODY_BOUNDARY_AU = 0.1; // tierFromFocus planet body↔inner 경계 (AU)

  /** Animation spy 에서 'tier-transition-radius' 애니메이션의 목표 radius(arg[6]) 추출. */
  function capturedTargetRadius(): number {
    const spy = vi.mocked(Animation.CreateAndStartAnimation);
    const call = spy.mock.calls.find((c) => c[0] === 'tier-transition-radius');
    if (!call) throw new Error('tier-transition-radius animation 미발동');
    return call[6] as number;
  }

  // jupiter body tier 시각 반경 ≈ 249,000 unit. #790 test 실측 inner tier 15.28 unit 에
  // body/inner renderScale 비(2.51e-5 / 1.54e-9 ≈ 16,299) 를 곱한 값 (display bodyScale 반영).
  // setTier 가 crossing 시점에 이미 body scaling 을 mesh 에 적용한 상태 전제.
  const JUPITER_BODY_VISUAL_R = 249_000;

  it('preserveFocusDistance=true: targetRadius = computeTargetRadius (실거리 보존, boundingR×5.9 catapult 아님)', () => {
    const camera = mockCamera(0.5);
    camera.radius = 22; // crossing 직전 inner tier radius (0.1 AU 경계 안쪽)
    const scene = mockScene();
    const cleanup = runTierTransition({
      scene,
      camera,
      oldScale: INNER,
      newScale: BODY,
      focusMesh: mockMesh(JUPITER_BODY_VISUAL_R),
      preserveFocusDistance: true,
    });
    cleanup();

    const expectedTarget = computeTargetRadius(22, INNER, BODY); // ≈ 358,571 unit
    expect(capturedTargetRadius()).toBeCloseTo(expectedTarget, 0);
    // boundingR × 5.9 (catapult) 이 아님 — 실거리 보존이 수백만 unit catapult 를 회피 (수십배 작다).
    const catapult = JUPITER_BODY_VISUAL_R * Math.sqrt(3) * 5.9; // ≈ 2.54M unit
    expect(capturedTargetRadius()).toBeLessThan(catapult);
    expect(catapult / capturedTargetRadius()).toBeGreaterThan(5); // catapult 이 ≥5배 더 멀다
  });

  it('산술 재현: crossing 후 cameraFromFocus < 0.1 AU → body 안정 (역판정 진동 차단)', () => {
    const camera = mockCamera(0.5);
    camera.radius = 22;
    const scene = mockScene();
    const cleanup = runTierTransition({
      scene,
      camera,
      oldScale: INNER,
      newScale: BODY,
      focusMesh: mockMesh(JUPITER_BODY_VISUAL_R),
      preserveFocusDistance: true,
    });
    cleanup();

    const target = capturedTargetRadius();
    // crossing 후 카메라-focus 실거리 (m) = target / renderScale_body.
    const cameraFromFocusAU = target / BODY / AU;
    expect(cameraFromFocusAU).toBeLessThan(PLANET_BODY_BOUNDARY_AU); // body 안정 (0.0955 AU)
    expect(cameraFromFocusAU).toBeCloseTo(0.0955, 3);
  });

  it('대조 — preserveFocusDistance=false 는 catapult (cameraFromFocus ≫ 0.1 AU → inner 역판정 진동)', () => {
    // 기존 버그 재현: focus-entry 공식(boundingR × 5.9) 을 줌 crossing 에 그대로 쓰면
    // 카메라가 0.1 AU 밖으로 튕겨나가 tierFromFocus 가 inner 를 역판정 → 무한 진동.
    const camera = mockCamera(0.5);
    camera.radius = 22;
    const scene = mockScene();
    const cleanup = runTierTransition({
      scene,
      camera,
      oldScale: INNER,
      newScale: BODY,
      focusMesh: mockMesh(JUPITER_BODY_VISUAL_R),
      // preserveFocusDistance 미전달 → 기본 false.
    });
    cleanup();

    const cameraFromFocusAU = capturedTargetRadius() / BODY / AU;
    expect(cameraFromFocusAU).toBeGreaterThan(PLANET_BODY_BOUNDARY_AU); // catapult (0.6 AU 급)
  });

  it('preserveFocusDistance=false (focus-entry): 기존 boundingR×5.9 재프레이밍 유지 — V5 무회귀', () => {
    const camera = mockCamera(0.5);
    camera.radius = 22;
    const scene = mockScene();
    const cleanup = runTierTransition({
      scene,
      camera,
      oldScale: INNER,
      newScale: BODY,
      focusMesh: mockMesh(JUPITER_BODY_VISUAL_R),
      // preserveFocusDistance 미전달 → 기본 false (focus-entry V5 경로).
    });
    cleanup();

    const boundingR = JUPITER_BODY_VISUAL_R * Math.sqrt(3);
    const expectedTarget = Math.max(boundingR * 5.9, boundingR + 0.01);
    expect(capturedTargetRadius()).toBeCloseTo(expectedTarget, 0);
  });

  it('preserveFocusDistance=true 여도 floor(#790) 유지 — visualR ≤ lowerRadiusLimit ≤ targetRadius', () => {
    const camera = mockCamera(0.5);
    camera.radius = 22;
    const scene = mockScene();
    const cleanup = runTierTransition({
      scene,
      camera,
      oldScale: INNER,
      newScale: BODY,
      focusMesh: mockMesh(JUPITER_BODY_VISUAL_R),
      preserveFocusDistance: true,
    });
    cleanup();

    const target = capturedTargetRadius();
    expect(camera.lowerRadiusLimit!).toBeGreaterThanOrEqual(JUPITER_BODY_VISUAL_R); // 표면 밖 보장
    expect(camera.lowerRadiusLimit!).toBeLessThanOrEqual(target); // 프레이밍 도달성
  });
});
