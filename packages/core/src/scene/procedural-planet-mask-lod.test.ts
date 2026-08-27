/**
 * #1157 — 마스크 LOD 판정 반경의 회전 불변성 가드.
 *
 * 결함: Amendment 4 (#1119) 의 `projectedDiskRadiusPx` 가 `boundingSphere.radiusWorld / √3` 로
 * 반경을 잡았는데 그 값이 **자전 위상의 함수**라, 참 반경이 임계(`SURFACE_MASK_MIN_DISK_PX = 16`)
 * 근방일 때 카메라가 고정돼 있어도 `uMaskEnabled` 가 자전 위상을 따라 토글했다 (#1157 Phase 0
 * 실측 — **수정 전** 트리, `camRadius = 329`, 1.0 day 16 스텝 **1 run**: 투영 반경
 * `12.886 ~ 18.651 px` 진동, 그 16 스텝에서 4회 전이. PR 본문 표).
 *
 * 본 테스트가 단언하는 것 (NullEngine — 실 GPU 불필요):
 *  1. **두 산식이 갈린다** — 회전 quaternion 을 준 mesh 에서 `radiusWorld / √3` 은 위상에 따라
 *     변하고 `resolveMeshVisualRadius` 는 변하지 않는다. 이것이 결함의 기전이다.
 *  2. **토글 소멸** (기준 2) — 현행 `projectedDiskRadiusPx` 는 위상 전건 동일하고, 종전 산식이
 *     토글하는 거리 대역에서도 마스크 판정이 단일값이다.
 *  3. **판별력** (기준 3) — 진동만 없앤 게 아니라 원래 성질이 산다: 참 반경이 임계 아래면 판정이
 *     `false`, 위면 `true` 이고 **위상과 무관하게** 그렇다.
 *  4. 카메라 부재 시 `Infinity` (판정 불가를 "작다" 로 오해하지 않는다) — 선재 계약 무회귀.
 */

import { describe, expect, it } from 'vitest';
import {
  ArcRotateCamera,
  Matrix,
  MeshBuilder,
  NullEngine,
  Quaternion,
  Scene,
  Vector3,
  Viewport,
  type Mesh,
} from '@babylonjs/core';

import { resolveMeshVisualRadius } from './camera-controller.js';
import { projectedDiskRadiusPx, SURFACE_MASK_MIN_DISK_PX } from './procedural-planet-shader.js';

/** 렌더 타깃 크기 — 앱의 기본 뷰포트(1280×720)와 같은 종횡비. NullEngine 기본값(512×256) 대신 고정. */
const RENDER_WIDTH = 1280;
const RENDER_HEIGHT = 720;

/** 자전 1주기 분할 수 — 브라우저 실측(16 스텝)과 같은 해상도. */
const PHASE_STEPS = 16;

/** 지구 자전축 기울기 (도). 위상만으로는 world AABB 진동이 얕아 실 케이스와 형태를 맞춘다. */
const AXIAL_TILT_DEG = 23.44;

interface Fixture {
  scene: Scene;
  camera: ArcRotateCamera;
  mesh: Mesh;
  dispose: () => void;
}

/** NullEngine 위에 「카메라 + 원점의 구체」 최소 씬을 세운다. */
function makeFixture(meshRadius = 1, scaling = 1): Fixture {
  const engine = new NullEngine({
    renderWidth: RENDER_WIDTH,
    renderHeight: RENDER_HEIGHT,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  const camera = new ArcRotateCamera('cam', 0, Math.PI / 2, 50, Vector3.Zero(), scene);
  scene.activeCamera = camera;
  const mesh = MeshBuilder.CreateSphere('earth', { diameter: meshRadius * 2, segments: 16 }, scene);
  mesh.scaling.setAll(scaling);
  mesh.rotationQuaternion = Quaternion.Identity();
  return {
    scene,
    camera,
    mesh,
    dispose: () => {
      scene.dispose();
      engine.dispose();
    },
  };
}

/**
 * 자전 위상 `phase ∈ [0, 1)` 을 적용하고 world matrix / bounding info 를 갱신한다.
 *
 * 축 기울기(Z) → 자전(Y) 합성 — `self-rotation.ts` 의 「기울인 축 둘레 회전」과 같은 형태다
 * (본 테스트가 필요로 하는 것은 실 앱과 **동일한 quaternion** 이 아니라 회전이 world AABB 를
 * 흔든다는 사실이므로, 형태만 맞추고 값은 재현하지 않는다).
 */
function applyPhase(fx: Fixture, phase: number): void {
  const tilt = Quaternion.RotationAxis(new Vector3(0, 0, 1), (AXIAL_TILT_DEG * Math.PI) / 180);
  const spin = Quaternion.RotationAxis(new Vector3(0, 1, 0), phase * 2 * Math.PI);
  tilt.multiplyToRef(spin, fx.mesh.rotationQuaternion!);
  fx.mesh.computeWorldMatrix(true);
  fx.mesh.refreshBoundingInfo();
  fx.scene.updateTransformMatrix();
}

/**
 * **독립 오라클** — 주어진 world 반경을 현행과 같은 방식(카메라 right edge 점 투영)으로 화면
 * 픽셀로 환산한다. 피검 함수(`projectedDiskRadiusPx`)를 호출하지 않는다.
 *
 * ⚠️ 오라클이 SUT 와 독립인 것이 이 파일의 설계 핵심이다 — 초판은 캘리브레이션에 SUT 를 썼는데,
 * 그러면 SUT 를 종전 식으로 되돌리는 변이에서 **카메라 거리 자체가 함께 이동**해 실패가 엉뚱한
 * 단언(증인 생존)에서 났다. 오라클을 분리하면 변이 시 기준 2 단언이 직접 깨진다.
 */
function projectRadiusToPx(scene: Scene, mesh: Mesh, worldRadius: number): number {
  const camera = scene.activeCamera!;
  const engine = scene.getEngine();
  const vp = camera.viewport.toGlobal(engine.getRenderWidth(), engine.getRenderHeight());
  const transform = scene.getTransformMatrix();
  const center = mesh.getAbsolutePosition();
  const right = camera.getDirection(new Vector3(1, 0, 0));
  const edge = center.add(right.scale(worldRadius));
  const pc = Vector3.Project(center, Matrix.Identity(), transform, vp);
  const pe = Vector3.Project(edge, Matrix.Identity(), transform, vp);
  return Math.hypot(pe.x - pc.x, pe.y - pc.y);
}

/** 종전 반경 산식 (`radiusWorld / √3`) — **회귀 증인**. 종전 코드의 기전을 붙잡아 둔다. */
const legacyRadiusOf = (mesh: Mesh): number =>
  mesh.getBoundingInfo().boundingSphere.radiusWorld / Math.sqrt(3);

/** 한 위상에서의 측정값. `px` 만 피검 함수 산이고 나머지는 오라클 산이다. */
interface PhaseProbe {
  visualRadius: number;
  legacyRadius: number;
  /** 피검 — `projectedDiskRadiusPx` 반환값. */
  px: number;
  /** 오라클 — 회전 불변 반경을 투영한 값. */
  referencePx: number;
  /** 오라클 — 종전 반경을 투영한 값. */
  legacyPx: number;
  maskOn: boolean;
}

function probePhases(fx: Fixture, steps = PHASE_STEPS): PhaseProbe[] {
  const out: PhaseProbe[] = [];
  for (let i = 0; i < steps; i++) {
    applyPhase(fx, i / steps);
    const px = projectedDiskRadiusPx(fx.scene, fx.mesh);
    out.push({
      visualRadius: resolveMeshVisualRadius(fx.mesh),
      legacyRadius: legacyRadiusOf(fx.mesh),
      px,
      referencePx: projectRadiusToPx(fx.scene, fx.mesh, resolveMeshVisualRadius(fx.mesh)),
      legacyPx: projectRadiusToPx(fx.scene, fx.mesh, legacyRadiusOf(fx.mesh)),
      maskOn: px >= SURFACE_MASK_MIN_DISK_PX,
    });
  }
  return out;
}

/**
 * `camera.radius` 를 조절해 **오라클의 회전 불변 투영 반경**이 `targetPx` 가 되게 맞춘다.
 * 반환값도 오라클 산이다 (SUT 미호출 — 위 ⚠️ 참조).
 */
function calibrateToPx(fx: Fixture, targetPx: number): number {
  const measure = (): number =>
    projectRadiusToPx(fx.scene, fx.mesh, resolveMeshVisualRadius(fx.mesh));
  // px ∝ 1/radius 근사 — 원근 때문에 정확한 반비례는 아니라 반복 수렴시킨다.
  for (let i = 0; i < 3; i++) {
    applyPhase(fx, 0);
    fx.camera.radius *= measure() / targetPx;
  }
  applyPhase(fx, 0);
  return measure();
}

describe('#1157 기전 — 회전 quaternion 하에서 두 반경 산식이 갈린다', () => {
  it('`radiusWorld / √3` 은 위상에 따라 변하고 `resolveMeshVisualRadius` 는 불변', () => {
    const fx = makeFixture();
    try {
      const probes = probePhases(fx);
      const visual = probes.map((p) => p.visualRadius);
      const legacy = probes.map((p) => p.legacyRadius);

      // 회전 불변 산식: 16 위상 전건 동일 (부동소수 오차 허용).
      expect(Math.max(...visual) - Math.min(...visual)).toBeLessThan(1e-9);

      // 종전 산식: 같은 16 위상에서 진동한다 — 이것이 결함의 기전이다.
      expect(Math.max(...legacy) - Math.min(...legacy)).toBeGreaterThan(0.05);

      // 종전 산식은 항상 참 반경 **이상**이다 (box 외접구라 과대 방향으로만 틀린다).
      for (const p of probes) expect(p.legacyRadius).toBeGreaterThanOrEqual(p.visualRadius - 1e-9);

      // 과대 배율의 상한은 √3 (world AABB 가 최대로 부풀어도 그 이상 갈 수 없다).
      const ratios = probes.map((p) => p.legacyRadius / p.visualRadius);
      expect(Math.max(...ratios)).toBeLessThanOrEqual(Math.sqrt(3) + 1e-9);
      expect(Math.max(...ratios)).toBeGreaterThan(1.05); // 실제로 부풀었다 (무회전이면 1.0)
    } finally {
      fx.dispose();
    }
  });

  it('tier scaling(균등 18.3333) 이 걸린 mesh 에서도 회전 불변성이 유지된다', () => {
    const fx = makeFixture(0.8335, 18.3333); // jupiter inner tier 실측 형태 (#790 테스트 선례)
    try {
      const probes = probePhases(fx);
      const visual = probes.map((p) => p.visualRadius);
      expect(Math.max(...visual) - Math.min(...visual)).toBeLessThan(1e-6);
      expect(visual[0]).toBeCloseTo(0.8335 * 18.3333, 6);
    } finally {
      fx.dispose();
    }
  });
});

describe('#1157 기준 2 — 토글 소멸 (카메라 고정 + 자전만)', () => {
  it('종전 산식이 임계를 넘나드는 거리 대역에서, 현행 판정은 단일값이다', () => {
    const fx = makeFixture();
    try {
      // 종전 산식의 과대 배율 대역을 먼저 잰다.
      const base = probePhases(fx);
      const ratios = base.map((p) => p.legacyRadius / p.visualRadius);
      const ratioMin = Math.min(...ratios);
      const ratioMax = Math.max(...ratios);

      // 「종전 산식이 토글하는」 대역 = 참 반경이 `16/ratioMax ~ 16/ratioMin` 인 구간. 그 중앙에
      // 카메라를 세운다 (브라우저 실측에서 `pxInvariant = 11.006` 이 놓였던 자리와 같은 성격).
      const target =
        (SURFACE_MASK_MIN_DISK_PX / ratioMax + SURFACE_MASK_MIN_DISK_PX / ratioMin) / 2;
      const landed = calibrateToPx(fx, target);
      // 캘리브레이션이 실제로 그 대역 안에 떨어졌는지 먼저 확인한다 (fail-fast — 밖이면 아래
      // 단언이 공허하게 참이 된다).
      expect(landed).toBeGreaterThan(SURFACE_MASK_MIN_DISK_PX / ratioMax);
      expect(landed).toBeLessThan(SURFACE_MASK_MIN_DISK_PX / ratioMin);

      const probes = probePhases(fx);

      // (a) 종전 산식은 이 거리에서 임계를 넘나든다 — 증인이 살아 있음을 확인.
      const legacyOn = probes.map((p) => p.legacyPx >= SURFACE_MASK_MIN_DISK_PX);
      expect(new Set(legacyOn).size).toBe(2);

      // (b) 현행 판정은 16 위상 전건 동일 = distinct 1 (기준 2).
      expect(new Set(probes.map((p) => p.maskOn)).size).toBe(1);

      // (c) 투영 반경 자체도 위상 전건 동일.
      const px = probes.map((p) => p.px);
      expect(Math.max(...px) - Math.min(...px)).toBeLessThan(1e-9);

      // (d) 피검 함수가 회전 불변 오라클을 따라간다 (종전 오라클이 아니라).
      for (const p of probes) {
        expect(p.px).toBeCloseTo(p.referencePx, 9);
        expect(p.px).toBeLessThan(p.legacyPx);
      }
    } finally {
      fx.dispose();
    }
  });
});

describe('#1157 기준 3 — 판별력 (진동만 없앤 게 아니라 원래 성질이 산다)', () => {
  it('참 반경이 임계 아래면 전 위상 OFF / 위면 전 위상 ON', () => {
    const fx = makeFixture();
    try {
      // 임계 아래 — 여유 있게 0.75×.
      const below = calibrateToPx(fx, SURFACE_MASK_MIN_DISK_PX * 0.75);
      expect(below).toBeLessThan(SURFACE_MASK_MIN_DISK_PX);
      const belowProbes = probePhases(fx);
      expect(belowProbes.every((p) => p.maskOn === false)).toBe(true);

      // 임계 위 — 여유 있게 1.5×.
      const above = calibrateToPx(fx, SURFACE_MASK_MIN_DISK_PX * 1.5);
      expect(above).toBeGreaterThan(SURFACE_MASK_MIN_DISK_PX);
      const aboveProbes = probePhases(fx);
      expect(aboveProbes.every((p) => p.maskOn === true)).toBe(true);
    } finally {
      fx.dispose();
    }
  });

  it('임계 자체는 박제값 16 (기준 4 — 본 PR 무접촉)', () => {
    expect(SURFACE_MASK_MIN_DISK_PX).toBe(16);
  });
});

describe('#1157 선재 계약 무회귀', () => {
  it('카메라 부재면 Infinity — 판정 불가를 "작다" 로 오해하지 않는다', () => {
    const fx = makeFixture();
    try {
      fx.scene.activeCamera = null;
      expect(projectedDiskRadiusPx(fx.scene, fx.mesh)).toBe(Number.POSITIVE_INFINITY);
    } finally {
      fx.dispose();
    }
  });

  it('뷰포트 전역 변환 경로 무회귀 — 전체 화면 viewport 기준 px 가 유한 양수', () => {
    const fx = makeFixture();
    try {
      applyPhase(fx, 0);
      expect(fx.camera.viewport).toEqual(new Viewport(0, 0, 1, 1));
      const px = projectedDiskRadiusPx(fx.scene, fx.mesh);
      expect(Number.isFinite(px)).toBe(true);
      expect(px).toBeGreaterThan(0);
    } finally {
      fx.dispose();
    }
  });
});
