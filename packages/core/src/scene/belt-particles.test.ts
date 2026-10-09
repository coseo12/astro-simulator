/**
 * #1319 — 띠 입자 GPU Kepler 경로 단위 테스트 (ADR 20261008-1319 PR1 DoD).
 *
 *  1. 정점 셰이더 Kepler 의 float32 JS 미러 vs `positionAt` — a ≤ 50 AU · e ≤ 0.3 무작위 1000 요소에서
 *     위치 오차 ≤ 1e-4 AU. `uDays` 는 rebase 가 허용하는 전 구간 `[−BELT_EPOCH_REBASE_DAYS, +…]` 를 훑는다
 *     (임계 하나만 재면 그 사이의 계단을 놓친다 — 오차는 `|uDays|` 에 단조가 아니다, `BELT_EPOCH_REBASE_DAYS` 주석).
 *  2. epoch rebase — 임계를 넘으면 `M0` 를 새 epoch 로 다시 쓰고, 그 뒤에도 미러 == `positionAt`.
 *  3. 메시 구조 · 수명주기 (NullEngine) — 4N 정점 · 6N 인덱스 · 컬링 제외 · 비선택 · dispose 해제.
 *  4. uniform — `uPxToClip` 이 엔진의 **현재** 렌더 크기에서 계산된다 (리사이즈 반영), 기준계는 provider 값.
 *
 * 미러와 GLSL 의 줄 대응은 셰이더 문자열에 미러의 핵심 식이 그대로 있는지로 묶는다 (5).
 */
import { afterEach, describe, expect, it, vi } from 'vitest';
import { NullEngine, Scene } from '@babylonjs/core';
import { AU, GRAVITATIONAL_CONSTANT, SOLAR_MASS } from '@astro-simulator/shared';
import { positionAt } from '../physics/kepler.js';
import type { LoadedOrbitalElements } from '../ephemeris/solar-system-loader.js';
import { ASTEROID_BELT_MAX_N, generateUniformBeltElements, mulberry32 } from './asteroid-belt.js';
import {
  BELT_EPOCH_REBASE_DAYS,
  BELT_PARTICLE_PX,
  BELT_VERTEX_SHADER,
  beltKeplerPositionF32,
  beltOrbitAttributes,
  createBeltParticles,
  type BodyReferenceFrame,
} from './belt-particles.js';

const MU_SUN = GRAVITATIONAL_CONSTANT * SOLAR_MASS;
const J2000 = 2_451_545.0;
/** DoD 한계 (AU). */
const POSITION_TOLERANCE_AU = 1e-4;
const SAMPLE_COUNT = 1000;
/** DoD 표본 범위 — 장반경 하한 2 AU 는 띠 입자 분포 하한(현 2.2 · PR2 주 띠 2.1 AU) 아래다. */
const SAMPLE_A_MIN_AU = 2;
const SAMPLE_A_MAX_AU = 50;
const SAMPLE_E_MAX = 0.3;
const SAMPLE_I_MAX = Math.PI / 4;
/** `uDays` 격자 — 한쪽 50 점 (총 101 점). 계단 폭(수천 일) 보다 촘촘하다. */
const DAY_GRID_STEPS = 50;

function randomElements(seed: number): LoadedOrbitalElements[] {
  const rnd = mulberry32(seed);
  return Array.from({ length: SAMPLE_COUNT }, () => ({
    semiMajorAxis: (SAMPLE_A_MIN_AU + rnd() * (SAMPLE_A_MAX_AU - SAMPLE_A_MIN_AU)) * AU,
    eccentricity: rnd() * SAMPLE_E_MAX,
    inclination: rnd() * SAMPLE_I_MAX,
    longitudeOfAscendingNode: rnd() * 2 * Math.PI,
    argumentOfPeriapsis: rnd() * 2 * Math.PI,
    meanAnomalyAtEpoch: rnd() * 2 * Math.PI - Math.PI,
    epoch: J2000,
  }));
}

/** 셰이더에 실리는 값 그대로 (float32 반올림은 미러 내부의 `Math.fround`). */
function mirrorAU(
  el: LoadedOrbitalElements,
  epochBase: number,
  jd: number,
): [number, number, number] {
  const { orbitA, orbitB } = beltOrbitAttributes(el, MU_SUN, epochBase, 1);
  return beltKeplerPositionF32(orbitA, orbitB, Math.fround(jd - epochBase));
}

function errorAU(el: LoadedOrbitalElements, epochBase: number, jd: number): number {
  const p = mirrorAU(el, epochBase, jd);
  const q = positionAt(el, jd, MU_SUN);
  return Math.hypot(p[0] - q[0] / AU, p[1] - q[1] / AU, p[2] - q[2] / AU);
}

describe('#1319 셰이더 Kepler float32 미러 vs positionAt', () => {
  it('a ≤ 50 AU · e ≤ 0.3 무작위 1000 요소 × |uDays| ≤ BELT_EPOCH_REBASE_DAYS 전 구간에서 오차 ≤ 1e-4 AU', () => {
    const els = randomElements(1319);
    let worst = 0;
    for (let k = -DAY_GRID_STEPS; k <= DAY_GRID_STEPS; k += 1) {
      const days = (BELT_EPOCH_REBASE_DAYS * k) / DAY_GRID_STEPS;
      for (const el of els) worst = Math.max(worst, errorAU(el, J2000, J2000 + days));
    }
    expect(worst).toBeLessThanOrEqual(POSITION_TOLERANCE_AU);
    // 공허 통과 방지 — 미러가 실제로 float32 로 계산되고 있다 (double 그대로면 오차가 ~1e-12 AU).
    expect(worst).toBeGreaterThan(1e-7);
  });

  it('미러는 회전 순서를 positionAt 과 같게 쓴다 — Ω · ω 를 맞바꾸면 1e-4 AU 를 크게 넘는다', () => {
    // 같은 측정이 순서 · 부호 오류를 실제로 잡는지 (판별력) 확인한다.
    const el = randomElements(7)[0]!;
    const { orbitA, orbitB } = beltOrbitAttributes(el, MU_SUN, J2000, 1);
    const swapped: [number, number, number, number] = [orbitB[1], orbitB[0], orbitB[2], orbitB[3]];
    const p = beltKeplerPositionF32(orbitA, swapped, 0);
    const q = positionAt(el, J2000, MU_SUN);
    const err = Math.hypot(p[0] - q[0] / AU, p[1] - q[1] / AU, p[2] - q[2] / AU);
    expect(err).toBeGreaterThan(100 * POSITION_TOLERANCE_AU);
  });

  it('임계를 넘는 |uDays| 에서는 rebase 없이 오차가 한계를 넘는다 — 임계가 장식이 아니다', () => {
    // 계단 (n·uDays 의 float32 반올림) 이 실재함을 보인다: 임계의 3 배 구간에서 같은 측정이 실패한다.
    const els = randomElements(1319);
    let worst = 0;
    for (let k = 1; k <= DAY_GRID_STEPS; k += 1) {
      const days = (3 * BELT_EPOCH_REBASE_DAYS * k) / DAY_GRID_STEPS;
      for (const el of els) worst = Math.max(worst, errorAU(el, J2000, J2000 + days));
    }
    expect(worst).toBeGreaterThan(POSITION_TOLERANCE_AU);
  });
});

// ── NullEngine ──────────────────────────────────────────────────────────────

interface Fixture {
  engine: NullEngine;
  scene: Scene;
}
const fixtures: Fixture[] = [];
afterEach(() => {
  vi.restoreAllMocks();
  for (const f of fixtures.splice(0)) {
    f.scene.dispose();
    f.engine.dispose();
  }
});
function makeScene(width = 1280, height = 720): Fixture {
  const engine = new NullEngine({
    renderWidth: width,
    renderHeight: height,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  const f = { engine, scene };
  fixtures.push(f);
  return f;
}
const ZERO_FRAME: BodyReferenceFrame = { originX: 0, originY: 0, originZ: 0, scale: 8.4e-11 };

describe('#1319 createBeltParticles — 메시 구조 · 수명주기 (NullEngine)', () => {
  it('N 쿼드 = 4N 정점 · 6N 인덱스, 컬링 제외 · 비선택', () => {
    const { scene } = makeScene();
    const belt = createBeltParticles(scene, {
      n: 250,
      epoch: J2000,
      frameProvider: () => ZERO_FRAME,
    });
    expect(belt.n).toBe(250);
    expect(belt.mesh.getTotalVertices()).toBe(1000);
    expect(belt.mesh.getTotalIndices()).toBe(1500);
    expect(belt.mesh.getVerticesData('orbitA')).toHaveLength(1000 * 4);
    expect(belt.mesh.getVerticesData('orbitB')).toHaveLength(1000 * 4);
    expect(belt.mesh.alwaysSelectAsActiveMesh).toBe(true);
    expect(belt.mesh.isPickable).toBe(false);
    expect(belt.mesh.material).toBe(belt.material);
    belt.dispose();
  });

  it('입자 수는 ASTEROID_BELT_MAX_N 으로 clamp (구 경로 · `?belt=` 파싱과 같은 상한 승계)', () => {
    const { scene } = makeScene();
    const belt = createBeltParticles(scene, {
      n: ASTEROID_BELT_MAX_N + 5,
      epoch: J2000,
      frameProvider: () => ZERO_FRAME,
    });
    expect(belt.n).toBe(ASTEROID_BELT_MAX_N);
    belt.dispose();
  });

  it('분포는 구 경로와 같다 — 속성 a · e 가 generateUniformBeltElements 와 일치 (PR1 은 경로만 교체)', () => {
    const { scene } = makeScene();
    const belt = createBeltParticles(scene, {
      n: 40,
      seed: 42,
      epoch: J2000,
      frameProvider: () => ZERO_FRAME,
    });
    const els = generateUniformBeltElements(40, 42, J2000);
    const orbitA = belt.mesh.getVerticesData('orbitA')!;
    for (let i = 0; i < 40; i += 1) {
      // 쿼드의 네 정점이 같은 요소를 든다.
      for (let c = 0; c < 4; c += 1) {
        const o = (i * 4 + c) * 4;
        expect(orbitA[o]).toBe(Math.fround(els[i]!.semiMajorAxis / AU));
        expect(orbitA[o + 1]).toBe(Math.fround(els[i]!.eccentricity));
      }
    }
    belt.dispose();
  });

  it('dispose 는 메시와 머티리얼을 장면에서 해제한다', () => {
    const { scene } = makeScene();
    const belt = createBeltParticles(scene, {
      n: 10,
      epoch: J2000,
      frameProvider: () => ZERO_FRAME,
    });
    expect(scene.meshes).toContain(belt.mesh);
    expect(scene.materials).toContain(belt.material);
    belt.dispose();
    expect(scene.meshes).not.toContain(belt.mesh);
    expect(scene.materials).not.toContain(belt.material);
  });
});

describe('#1319 createBeltParticles — 시간 · uniform', () => {
  it('|jd − epochBase| ≤ 임계면 rebase 없음, 넘으면 epochBase = jd 로 rebase 후 미러 == positionAt', () => {
    const { scene } = makeScene();
    const n = 64;
    const belt = createBeltParticles(scene, { n, epoch: J2000, frameProvider: () => ZERO_FRAME });
    belt.updateAt(J2000 + BELT_EPOCH_REBASE_DAYS);
    expect(belt.getEpochBase()).toBe(J2000);
    expect(belt.readFrameUniforms()).not.toBeNull();

    const far = J2000 + 3.3 * BELT_EPOCH_REBASE_DAYS;
    belt.updateAt(far);
    expect(belt.getEpochBase()).toBe(far);
    belt.applyFrameUniforms();
    expect(belt.readFrameUniforms()!.days).toBe(0);

    // 재업로드된 속성 (메시에서 다시 읽은 float32) 로 미러를 돌린 위치 == positionAt(far).
    const orbitA = belt.mesh.getVerticesData('orbitA')!;
    const orbitB = belt.mesh.getVerticesData('orbitB')!;
    const els = generateUniformBeltElements(n, 42, J2000);
    let worst = 0;
    for (let i = 0; i < n; i += 1) {
      const o = i * 4 * 4;
      const p = beltKeplerPositionF32(
        [orbitA[o]!, orbitA[o + 1]!, orbitA[o + 2]!, orbitA[o + 3]!],
        [orbitB[o]!, orbitB[o + 1]!, orbitB[o + 2]!, orbitB[o + 3]!],
        0,
      );
      const q = positionAt(els[i]!, far, MU_SUN);
      worst = Math.max(worst, Math.hypot(p[0] - q[0] / AU, p[1] - q[1] / AU, p[2] - q[2] / AU));
    }
    expect(worst).toBeLessThanOrEqual(POSITION_TOLERANCE_AU);
    belt.dispose();
  });

  it('uPxToClip 은 엔진의 현재 렌더 크기에서 계산된다 (캐시 없음 — 리사이즈 반영)', () => {
    const { engine, scene } = makeScene(1280, 720);
    const belt = createBeltParticles(scene, {
      n: 4,
      epoch: J2000,
      frameProvider: () => ZERO_FRAME,
    });
    belt.applyFrameUniforms();
    expect(belt.readFrameUniforms()!.pxToClip).toEqual([2 / 1280, 2 / 720]);
    // NullEngine 은 캔버스가 없어 `setSize` 가 렌더 크기를 바꾸지 않는다 (실측) — 엔진 getter 를 직접 바꾼다.
    // 판정 대상은 「매 호출 엔진에서 다시 읽는가」 이므로 getter 교체로 충분하다.
    vi.spyOn(engine, 'getRenderWidth').mockReturnValue(750);
    vi.spyOn(engine, 'getRenderHeight').mockReturnValue(1624);
    belt.applyFrameUniforms();
    expect(belt.readFrameUniforms()!.pxToClip).toEqual([2 / 750, 2 / 1624]);
    belt.dispose();
  });

  it('기준계 uniform 은 provider 값 그대로 — uOrigin = origin / AU, uScale = scale × AU', () => {
    const { scene } = makeScene();
    const frame: BodyReferenceFrame = {
      originX: 1.2 * AU,
      originY: -0.3 * AU,
      originZ: 0,
      scale: 2.51e-5,
    };
    const belt = createBeltParticles(scene, { n: 4, epoch: J2000, frameProvider: () => frame });
    belt.applyFrameUniforms();
    const u = belt.readFrameUniforms()!;
    expect(u.origin[0]).toBeCloseTo(1.2, 12);
    expect(u.origin[1]).toBeCloseTo(-0.3, 12);
    expect(u.scale).toBe(2.51e-5 * AU);
    // provider 는 매번 다시 읽힌다 (캐시 금지).
    frame.scale = 8.4e-11;
    belt.applyFrameUniforms();
    expect(belt.readFrameUniforms()!.scale).toBe(8.4e-11 * AU);
    belt.dispose();
  });

  it('draw 직전 경로 — mesh.onBeforeRenderObservable 이 uniform 을 싣는다 (material bind 이전)', () => {
    const { scene } = makeScene();
    const frame: BodyReferenceFrame = { originX: 0, originY: 0, originZ: 0, scale: 1e-9 };
    const belt = createBeltParticles(scene, { n: 4, epoch: J2000, frameProvider: () => frame });
    frame.scale = 3e-9;
    belt.mesh.onBeforeRenderObservable.notifyObservers(belt.mesh);
    expect(belt.readFrameUniforms()!.scale).toBe(3e-9 * AU);
    belt.dispose();
  });
});

describe('#1319 GLSL ↔ 미러 대응 · 크기 상수', () => {
  it('정점 셰이더가 미러와 같은 Newton 4회 · 회전 순서 · 화면 고정 px 식을 담는다', () => {
    expect(BELT_VERTEX_SHADER).toContain('for (int k = 0; k < 4; k++)');
    expect(BELT_VERTEX_SHADER).toContain('E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));');
    expect(BELT_VERTEX_SHADER).toContain('float M = mod(orbitA.w + orbitB.z * uDays, TWO_PI);');
    expect(BELT_VERTEX_SHADER).toContain(
      'vec3 p = vec3(cosO * x1 - sinO * y2, sinO * x1 + cosO * y2, z2);',
    );
    expect(BELT_VERTEX_SHADER).toContain('vec3 local = (p - uOrigin) * uScale;');
    expect(BELT_VERTEX_SHADER).toContain(
      'clip.xy += position.xy * PARTICLE_RADIUS_PX * uPxToClip * clip.w;',
    );
    expect(BELT_VERTEX_SHADER).toContain(
      `const float PARTICLE_RADIUS_PX = ${(BELT_PARTICLE_PX / 2).toFixed(4)};`,
    );
    expect(BELT_VERTEX_SHADER).toContain('vFragmentDepth = 1.0 + clip.w;');
  });
});
