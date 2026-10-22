/**
 * #1360 PR2 결정 C3 (ADR 1354 Q-S Amendment) — `FocusTarget.viewDirection` · `viewDirectionToArcAngles`.
 *
 * - 변환식이 Babylon ArcRotate 위치식의 역이다 — 각을 넣어 만든 카메라 위치의 방향이 요청 방향과 같다.
 * - `alpha` 는 짧은 쪽으로 돈다 (`|Δ| ≤ π`) · `beta` 는 카메라 한계로 잘린다 · 극 방향은 `alpha` 유지.
 * - `focusOn` 은 `viewDirection` 이 있을 때만 alpha · beta 애니메이션을 더한다 (생략 = 현행 — 시점 각 유지).
 */
import { afterEach, describe, expect, it } from 'vitest';
import { ArcRotateCamera, MeshBuilder, NullEngine, Scene, Vector3 } from '@babylonjs/core';
import {
  arcAnglesToViewDirection,
  CameraController,
  viewDirectionToArcAngles,
} from './camera-controller.js';
import { DEFAULT_CAMERA_ALPHA, DEFAULT_CAMERA_BETA } from './camera.js';

const disposers: Array<() => void> = [];
afterEach(() => {
  for (const d of disposers.splice(0)) d();
});

function makeCamera() {
  const engine = new NullEngine();
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera('cam', 0.3, 1.1, 10, Vector3.Zero(), scene);
  scene.activeCamera = camera;
  disposers.push(() => {
    scene.dispose();
    engine.dispose();
  });
  return { scene, camera };
}

/** 각을 카메라에 넣고 Babylon 이 계산한 위치에서 대상 → 카메라 단위 방향을 읽는다. */
function cameraDirection(camera: ArcRotateCamera, alpha: number, beta: number): Vector3 {
  camera.alpha = alpha;
  camera.beta = beta;
  camera.getViewMatrix(true);
  return camera.position.subtract(camera.target).normalize();
}

describe('#1360 PR2 — viewDirectionToArcAngles', () => {
  const dirs: ReadonlyArray<[number, number, number]> = [
    [1, 0, 0],
    [0, 0, 1],
    [-0.6, -0.72, 0.35],
    [0.2, 0.9, -0.4],
    [-1, 0.1, -0.05],
  ];
  for (const d of dirs) {
    it(`방향 (${d.join(', ')}) — 각 → 카메라 위치 방향이 요청과 같다`, () => {
      const { camera } = makeCamera();
      const dir = new Vector3(...d);
      const { alpha, beta } = viewDirectionToArcAngles(dir, camera.alpha, 0.01, Math.PI - 0.01);
      const got = cameraDirection(camera, alpha, beta);
      expect(Vector3.Dot(got, dir.normalizeToNew())).toBeCloseTo(1, 9);
    });
  }

  it('alpha 는 현재 값에서 짧은 쪽 (|Δ| ≤ π) — 감긴 현재 값 (alpha = 7π) 에서도', () => {
    const dir = new Vector3(Math.cos(0.1), 0, Math.sin(0.1));
    for (const current of [0, 6.2, 7 * Math.PI, -20]) {
      const { alpha } = viewDirectionToArcAngles(dir, current, null, null);
      expect(Math.abs(alpha - current)).toBeLessThanOrEqual(Math.PI);
      // 같은 방향 (2π 배수 차이).
      const k = (alpha - 0.1) / (2 * Math.PI);
      expect(k).toBeCloseTo(Math.round(k), 9);
    }
  });

  it('beta 는 카메라 한계로 잘린다 · 극 방향은 alpha 유지 · 영벡터는 beta NaN (호출부가 무시)', () => {
    expect(viewDirectionToArcAngles(new Vector3(0, 1, 0), 0.7, 0.01, 3).beta).toBe(0.01);
    expect(viewDirectionToArcAngles(new Vector3(0, 1, 0), 0.7, 0.01, 3).alpha).toBe(0.7);
    expect(viewDirectionToArcAngles(new Vector3(0, -1, 0), 0.7, 0.01, 3).beta).toBe(3);
    expect(Number.isNaN(viewDirectionToArcAngles(new Vector3(0, 0, 0), 0.7, 0.01, 3).beta)).toBe(
      true,
    );
  });
});

describe('#1360 PR2 — CameraController.focusOn viewDirection', () => {
  function animatedProperties(scene: Scene, camera: ArcRotateCamera): Map<string, number> {
    const out = new Map<string, number>();
    for (const animatable of scene.getAllAnimatablesByTarget(camera)) {
      for (const runtime of animatable.getAnimations()) {
        const keys = runtime.animation.getKeys();
        out.set(runtime.animation.targetProperty, keys[keys.length - 1]!.value as number);
      }
    }
    return out;
  }

  it('viewDirection 이 있으면 alpha · beta 를 그 방향 각으로 애니메이션한다', () => {
    const { scene, camera } = makeCamera();
    const mesh = MeshBuilder.CreateSphere('m', { diameter: 2 }, scene);
    mesh.position.set(5, 0, 0);
    const controller = new CameraController(camera, scene);
    const dir = new Vector3(-0.6, -0.72, 0.35);
    controller.focusOn({ mesh, radius: 8, viewDirection: dir });
    const props = animatedProperties(scene, camera);
    const expected = viewDirectionToArcAngles(
      dir,
      0.3,
      camera.lowerBetaLimit,
      camera.upperBetaLimit,
    );
    expect(props.get('alpha')).toBeCloseTo(expected.alpha, 12);
    expect(props.get('beta')).toBeCloseTo(expected.beta, 12);
    expect(props.get('radius')).toBe(8);
  });

  it('viewDirection 생략 — alpha · beta 애니메이션 없음 (현행 — 시점 각 유지)', () => {
    const { scene, camera } = makeCamera();
    const mesh = MeshBuilder.CreateSphere('m', { diameter: 2 }, scene);
    const controller = new CameraController(camera, scene);
    controller.focusOn({ mesh, radius: 8 });
    const props = animatedProperties(scene, camera);
    expect(props.has('alpha')).toBe(false);
    expect(props.has('beta')).toBe(false);
    expect(props.has('radius')).toBe(true);
  });
});

describe('#1390 Amendment 1 — arcAnglesToViewDirection · CameraController.reset viewDirection', () => {
  function animatedProperties(scene: Scene, camera: ArcRotateCamera): Map<string, number> {
    const out = new Map<string, number>();
    for (const animatable of scene.getAllAnimatablesByTarget(camera)) {
      for (const runtime of animatable.getAnimations()) {
        const keys = runtime.animation.getKeys();
        out.set(runtime.animation.targetProperty, keys[keys.length - 1]!.value as number);
      }
    }
    return out;
  }

  it('각 → 방향 → 각 왕복 (앱 첫 화면 각) — Babylon 위치 방향과 같다', () => {
    const { camera } = makeCamera();
    const angles = { alpha: DEFAULT_CAMERA_ALPHA, beta: DEFAULT_CAMERA_BETA };
    const dir = arcAnglesToViewDirection(angles);
    expect(Math.hypot(dir.x, dir.y, dir.z)).toBeCloseTo(1, 12);
    const got = cameraDirection(camera, angles.alpha, angles.beta);
    expect(got.x * dir.x + got.y * dir.y + got.z * dir.z).toBeCloseTo(1, 9);
    const back = viewDirectionToArcAngles(dir, DEFAULT_CAMERA_ALPHA, null, null);
    expect(back.alpha).toBeCloseTo(DEFAULT_CAMERA_ALPHA, 12);
    expect(back.beta).toBeCloseTo(DEFAULT_CAMERA_BETA, 12);
  });

  it('reset 에 viewDirection 을 주면 시작 각과 무관하게 같은 alpha · beta 로 애니메이션한다', () => {
    const angles = { alpha: DEFAULT_CAMERA_ALPHA, beta: DEFAULT_CAMERA_BETA };
    for (const [alpha0, beta0] of [
      [0.3, 1.1],
      [-0.26, 1.79], // 실측 — 1→7 순회 시 개요 진입 각 (beta 102.6°)
      [0, 0.85], // 실측 — 일식 투어 직후 (beta 48.5°)
    ] as const) {
      const { scene, camera } = makeCamera();
      camera.alpha = alpha0;
      camera.beta = beta0;
      const controller = new CameraController(camera, scene);
      controller.reset(35, undefined, arcAnglesToViewDirection(angles));
      const props = animatedProperties(scene, camera);
      expect(props.get('beta')).toBeCloseTo(DEFAULT_CAMERA_BETA, 12);
      // alpha 는 짧은 쪽 — 2π 배수 차이까지 같은 방향.
      const k = (props.get('alpha')! - DEFAULT_CAMERA_ALPHA) / (2 * Math.PI);
      expect(k).toBeCloseTo(Math.round(k), 9);
      expect(props.get('radius')).toBe(35);
    }
  });

  it('reset 인자 생략 — alpha · beta 애니메이션 없음 (관찰 · 연구 모드 reset 현행 유지)', () => {
    const { scene, camera } = makeCamera();
    const controller = new CameraController(camera, scene);
    controller.reset(35);
    const props = animatedProperties(scene, camera);
    expect(props.has('alpha')).toBe(false);
    expect(props.has('beta')).toBe(false);
    expect(props.get('radius')).toBe(35);
    expect(props.has('target')).toBe(true);
  });
});
