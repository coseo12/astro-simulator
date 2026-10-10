/**
 * #1329 — 혜성 꼬리 · 코마 렌더 경로 단위 테스트 (ADR 20261010-1329 · 이슈 D2 · D8 · D9).
 *
 *  1. 활동도 `cometActivity` — r ≥ 3 AU → 0 · r = 1 AU → 1 · r 감소에 단조 증가 · 비유한/0 방어 · 근일점 실측값.
 *  2. `cometTailFrame` — |axis| = 1 · 반태양 · lag ⟂ axis · lag 가 궤도 운동 반대쪽 (역행 halley 포함) ·
 *     a = 0 → 길이 0 · 머리 = 태양 퇴화 시 NaN 0 · D2 길이 비 a(2)/a(q) = 0.248 ± 0.01.
 *  3. 메시 구조 · 머티리얼 계약 (NullEngine) — 정점 136 · 삼각형 130 · 컬링 제외 · 비선택 · ALPHA_ADD · depth write off.
 *  4. **D9 재활성** — 원일점 (a = 0) 에서 한 번 그린 뒤 머리를 근일점으로 옮겨 다시 그리면 활동도가 양수로 갱신된다.
 *     `isVisible = false` 로 끄는 설계 (교차검증 수용 1 이전) 는 두 번째 render 에서 observer 가 불리지 않아 여기서 FAIL 한다.
 */
import { afterEach, describe, expect, it } from 'vitest';
import {
  ArcRotateCamera,
  Constants,
  MeshBuilder,
  NullEngine,
  Scene,
  Vector3,
  type Mesh,
} from '@babylonjs/core';
import { AU } from '@astro-simulator/shared';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { orbitMu } from '../physics/kepler.js';
import { orbitalStateAt } from '../physics/state-vector.js';
import { renderScaleForTier } from './tier.js';
import type { BodyReferenceFrame } from './belt-particles.js';
import {
  COMET_ACTIVITY_ONSET_AU,
  COMET_DUST_TAIL_LENGTH_RATIO,
  COMET_ION_TAIL_LENGTH_1AU,
  COMET_TAIL_SEGMENTS,
  COMET_TAIL_VERTEX_SHADER,
  buildCometTailGeometry,
  cometActivity,
  cometOrbitNormal,
  cometTailFrame,
  createCometTail,
} from './comet-tail.js';

type V3 = readonly [number, number, number];
const dot = (a: V3, b: V3) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
const norm = (a: V3) => Math.hypot(a[0], a[1], a[2]);
const J2000 = 2_451_545.0;
/** ADR 1-A 실측 근일점 거리 (AU). */
const HALLEY_Q_AU = 0.586;
/** 이슈 D2 — r = 2 AU 대 핼리 근일점 꼬리 길이 비 0.248 ± 0.01. */
const D2_RATIO = 0.248;
const D2_TOLERANCE = 0.01;

const system = getSolarSystem();
const comets = system.bodies.filter((b) => b.kind === 'comet');
const sun = system.bodies.find((b) => b.id === 'sun')!;

describe('cometActivity — a(r) = max(0, ln(3/r)/ln 3) (결정 3)', () => {
  it('r ≥ 3 AU → 0', () => {
    for (const r of [COMET_ACTIVITY_ONSET_AU, 3.0001, 5, 35.08, 1e6]) {
      expect(cometActivity(r)).toBe(0);
    }
  });
  it('r = 1 AU → 1 (광도 법칙 정규화 거리)', () => {
    expect(cometActivity(1)).toBeCloseTo(1, 12);
  });
  it('r 감소에 단조 증가 (0.1 ~ 3 AU 격자)', () => {
    let prev = -1;
    for (let r = 3; r >= 0.1; r -= 0.01) {
      const a = cometActivity(r);
      expect(a).toBeGreaterThanOrEqual(prev);
      prev = a;
    }
  });
  it('비유한 · 0 · 음수 → 0 (NaN 없음)', () => {
    for (const r of [0, -1, Number.NaN, Number.POSITIVE_INFINITY, Number.NEGATIVE_INFINITY]) {
      expect(cometActivity(r)).toBe(0);
    }
  });
  it('근일점 활동도 — 데이터 q = a(1 − e) 에서 halley 1.486 · encke 1.984 · swift-tuttle 1.027 · r = 2 AU 0.369', () => {
    // ADR 결정 3 표기 encke `1.985` · swift-tuttle `1.028` 은 데이터 q 의 값 1.9842 · 1.0273 과 소수 셋째 자리에서
    // 다르다 (ADR 쪽 r 의 출처는 일 단위 표본 — 결정 자체에는 영향 없음). 여기서는 데이터 q 를 정본으로 쓴다.
    const q = (id: string) => {
      const o = comets.find((c) => c.id === id)!.orbit!;
      return (o.semiMajorAxis * (1 - o.eccentricity)) / AU;
    };
    expect(q('halley')).toBeCloseTo(HALLEY_Q_AU, 3);
    expect(cometActivity(q('halley'))).toBeCloseTo(1.486, 3);
    expect(cometActivity(q('encke'))).toBeCloseTo(1.984, 3);
    expect(cometActivity(q('swift-tuttle'))).toBeCloseTo(1.027, 3);
    expect(cometActivity(2)).toBeCloseTo(0.369, 3);
  });
});

describe('cometOrbitNormal — 로드 시 1회 상수 ĥ', () => {
  it('데이터의 혜성 전수에 대해 단위 벡터 · 시각 무관 (2체 Kepler 상수)', () => {
    expect(comets.length).toBeGreaterThan(0);
    for (const c of comets) {
      const mu = orbitMu(c, sun);
      const h1 = cometOrbitNormal(c.orbit!, J2000, mu);
      const h2 = cometOrbitNormal(c.orbit!, J2000 + 3000, mu);
      expect(norm(h1)).toBeCloseTo(1, 12);
      for (let k = 0; k < 3; k += 1) expect(Math.abs(h1[k]! - h2[k]!)).toBeLessThan(1e-9);
    }
  });
  it('역행 halley (i 162°) 는 ĥ.z < 0', () => {
    const halley = comets.find((c) => c.id === 'halley')!;
    expect(cometOrbitNormal(halley.orbit!, J2000, orbitMu(halley, sun))[2]).toBeLessThan(0);
  });
});

describe('cometTailFrame — 기준계 순수 함수 (결정 2)', () => {
  const scale = renderScaleForTier('solar');

  it('|axis| = 1 · 반태양 · lag ⟂ axis · |lag| = 1', () => {
    const head: V3 = [3.1, -4.2, 1.7];
    const sunPos: V3 = [0.5, 0.2, -0.3];
    const f = cometTailFrame(head, sunPos, scale, [0, 0, 1]);
    expect(norm(f.axis)).toBeCloseTo(1, 12);
    expect(
      dot(f.axis, [head[0] - sunPos[0], head[1] - sunPos[1], head[2] - sunPos[2]]),
    ).toBeGreaterThan(0);
    expect(Math.abs(dot(f.lag, f.axis))).toBeLessThan(1e-12);
    expect(norm(f.lag)).toBeCloseTo(1, 12);
  });

  it('lag 는 궤도 운동 반대쪽 — 데이터 혜성 전수 × 궤도 위 8 시각 (역행 halley 포함)', () => {
    for (const c of comets) {
      const mu = orbitMu(c, sun);
      const h = cometOrbitNormal(c.orbit!, J2000, mu);
      const periodDays = (2 * Math.PI * Math.sqrt(c.orbit!.semiMajorAxis ** 3 / mu)) / 86_400;
      for (let k = 0; k < 8; k += 1) {
        const { position, velocity } = orbitalStateAt(c.orbit!, J2000 + (periodDays * k) / 8, mu);
        const head: V3 = [position[0] * scale, position[1] * scale, position[2] * scale];
        const f = cometTailFrame(head, [0, 0, 0], scale, h);
        expect(dot(f.lag, velocity)).toBeLessThan(0);
      }
    }
  });

  it('r ≥ 3 AU → 활동도 · 길이 · 코마 0 (축은 유효)', () => {
    const d = 3.5 * AU * scale;
    const f = cometTailFrame([d, 0, 0], [0, 0, 0], scale, [0, 0, 1]);
    expect(f.rAU).toBeCloseTo(3.5, 9);
    expect(f.activity).toBe(0);
    expect(f.ionLength).toBe(0);
    expect(f.dustLength).toBe(0);
    expect(f.comaRadius).toBe(0);
    expect(norm(f.axis)).toBeCloseTo(1, 12);
  });

  it('머리 = 태양 · scale 0 · 비유한 → NaN 없음 + 활동도 0', () => {
    const cases: Array<[V3, V3, number]> = [
      [[1, 2, 3], [1, 2, 3], scale],
      [[1, 2, 3], [0, 0, 0], 0],
      [[Number.NaN, 0, 0], [0, 0, 0], scale],
    ];
    for (const [h, s, sc] of cases) {
      const f = cometTailFrame(h, s, sc, [0, 0, 1]);
      for (const v of [
        ...f.axis,
        ...f.lag,
        f.rAU,
        f.activity,
        f.ionLength,
        f.dustLength,
        f.comaRadius,
      ]) {
        expect(Number.isNaN(v)).toBe(false);
      }
      expect(f.activity).toBe(0);
    }
  });

  it('축이 ĥ 와 평행 (퇴화) → lag (0,0,0), NaN 없음', () => {
    const f = cometTailFrame([0, 0, 1], [0, 0, 0], scale, [0, 0, 1]);
    expect(f.lag).toEqual([0, 0, 0]);
  });

  it('길이 — 이온 = 0.3 AU × a (세계 길이) · 먼지 = 이온 × 비율', () => {
    const d = 1 * AU * scale;
    const f = cometTailFrame([d, 0, 0], [0, 0, 0], scale, [0, 0, 1]);
    expect(f.ionLength / scale / AU).toBeCloseTo(COMET_ION_TAIL_LENGTH_1AU, 9);
    expect(f.dustLength / f.ionLength).toBeCloseTo(COMET_DUST_TAIL_LENGTH_RATIO, 12);
  });

  it('D2 — r = 2 AU 대 핼리 근일점 이온 꼬리 길이 비 0.248 ± 0.01 (tier 무관)', () => {
    for (const tierScale of [renderScaleForTier('solar'), renderScaleForTier('body')]) {
      const at = (rAU: number) =>
        cometTailFrame([rAU * AU * tierScale, 0, 0], [0, 0, 0], tierScale, [0, 0, 1]).ionLength;
      const ratio = at(2) / at(HALLEY_Q_AU);
      expect(Math.abs(ratio - D2_RATIO)).toBeLessThanOrEqual(D2_TOLERANCE);
    }
  });
});

describe('buildCometTailGeometry — 코마 쿼드 + 이온 · 먼지 리본', () => {
  it('정점 136 · 삼각형 130 (분절 32) · kind 분포 4 / 66 / 66', () => {
    const g = buildCometTailGeometry();
    const vertexCount = g.positions.length / 3;
    expect(COMET_TAIL_SEGMENTS).toBe(32);
    expect(vertexCount).toBe(136);
    expect(g.indices.length / 3).toBe(130);
    const kinds = [0, 0, 0];
    for (let i = 0; i < vertexCount; i += 1) kinds[g.positions[i * 3 + 2]!]! += 1;
    expect(kinds).toEqual([4, 66, 66]);
    for (const ix of g.indices) expect(ix).toBeLessThan(vertexCount);
  });
});

describe('정점 셰이더 — a = 0 접기 · 축 정면 퇴화 분기 (결정 1 · 3)', () => {
  it('a = 0 이면 머리로 접고 (면적 0) 알파 0, 축 정면은 length/ε 분기', () => {
    expect(COMET_TAIL_VERTEX_SHADER).toContain('float on = step(1e-6, activity);');
    expect(COMET_TAIL_VERTEX_SHADER).toContain('p = uHead + (p - uHead) * on;');
    expect(COMET_TAIL_VERTEX_SHADER).toContain('vAlpha = alpha * on;');
    expect(COMET_TAIL_VERTEX_SHADER).toContain('sinTheta > SIN_EPS ? s / sLen : vec3(0.0)');
  });
});

// ── NullEngine ─────────────────────────────────────────────────────────────────────────────────────────

interface Fixture {
  engine: NullEngine;
  scene: Scene;
  head: Mesh;
  sunMesh: Mesh;
  frame: BodyReferenceFrame;
}
const fixtures: Fixture[] = [];
afterEach(() => {
  for (const f of fixtures.splice(0)) {
    f.scene.dispose();
    f.engine.dispose();
  }
});

function makeFixture(): Fixture {
  const engine = new NullEngine({
    renderWidth: 1280,
    renderHeight: 720,
    textureSize: 512,
    deterministicLockstep: false,
    lockstepMaxSteps: 1,
  });
  const scene = new Scene(engine);
  scene.activeCamera = new ArcRotateCamera('cam', 0, Math.PI / 3, 50, Vector3.Zero(), scene);
  const head = MeshBuilder.CreateSphere('halley', { diameter: 0.01 }, scene);
  const sunMesh = MeshBuilder.CreateSphere('sun', { diameter: 0.1 }, scene);
  const frame: BodyReferenceFrame = {
    originX: 0,
    originY: 0,
    originZ: 0,
    scale: renderScaleForTier('solar'),
  };
  const f = { engine, scene, head, sunMesh, frame };
  fixtures.push(f);
  return f;
}

function placeAtAU(f: Fixture, rAU: number) {
  f.head.position.set(rAU * AU * f.frame.scale, 0, 0);
}

describe('createCometTail — 메시 · 머티리얼 계약 (NullEngine)', () => {
  it('이름 · 컬링 제외 · 비선택 · ALPHA_ADD · depth write off · 블렌딩 · dispose 해제', () => {
    const f = makeFixture();
    placeAtAU(f, 1);
    const tail = createCometTail(f.scene, {
      bodyId: 'halley',
      headMesh: f.head,
      sunMesh: f.sunMesh,
      orbitNormal: [0, 0, 1],
      frameProvider: () => f.frame,
    });
    expect(tail.mesh.name).toBe('comet-tail-halley');
    expect(tail.mesh.getTotalVertices()).toBe(136);
    expect(tail.mesh.alwaysSelectAsActiveMesh).toBe(true);
    expect(tail.mesh.isPickable).toBe(false);
    expect(tail.material.alphaMode).toBe(Constants.ALPHA_ADD);
    expect(tail.material.disableDepthWrite).toBe(true);
    expect(tail.material.needAlphaBlending()).toBe(true);
    tail.dispose();
    expect(f.scene.getMeshByName('comet-tail-halley')).toBeNull();
    expect(f.scene.materials.includes(tail.material)).toBe(false);
  });

  it('uniform 은 draw 시점의 head · sun mesh.position + frameProvider scale (캐시 없음)', () => {
    const f = makeFixture();
    placeAtAU(f, 1);
    const tail = createCometTail(f.scene, {
      bodyId: 'halley',
      headMesh: f.head,
      sunMesh: f.sunMesh,
      orbitNormal: [0, 0, 1],
      frameProvider: () => f.frame,
    });
    // tier 전환 흉내 — 스케일 · 위치를 바꾼 뒤 시간 진행 없이 다시 그린다.
    const bodyScale = renderScaleForTier('body');
    f.frame.scale = bodyScale;
    f.head.position.set(0.5 * AU * bodyScale, 0, 0);
    f.sunMesh.position.set(-0.1, 0.2, 0.3);
    tail.mesh.onBeforeRenderObservable.notifyObservers(tail.mesh);
    const u = tail.readFrameUniforms()!;
    expect(u.head).toEqual([f.head.position.x, f.head.position.y, f.head.position.z]);
    expect(u.sun).toEqual([-0.1, 0.2, 0.3]);
    expect(u.scale).toBe(bodyScale);
    // 물리 px 환산 — 엔진 렌더 높이(물리 px) · 투영 행렬에서 매번 계산.
    expect(u.pxWorld).toBeCloseTo(
      2 / (f.scene.activeCamera!.getProjectionMatrix().m[5]! * 720),
      12,
    );
  });
});

describe('D9 — 원일점 (a = 0) 에서 시작해 근일점으로 오면 꼬리가 다시 켜진다 (교차검증 수용 1)', () => {
  it('scene.render 경로: a = 0 렌더 후에도 isVisible 유지 · 다음 render 의 observer 가 활동도를 갱신', () => {
    const f = makeFixture();
    placeAtAU(f, 35.08); // halley 원일점
    const tail = createCometTail(f.scene, {
      bodyId: 'halley',
      headMesh: f.head,
      sunMesh: f.sunMesh,
      orbitNormal: [0, 0, 1],
      frameProvider: () => f.frame,
    });
    f.scene.render();
    expect(tail.readFrameUniforms()!.rAU).toBeCloseTo(35.08, 6);
    expect(tail.readFrameUniforms()!.activity).toBe(0);

    placeAtAU(f, HALLEY_Q_AU); // 시간을 근일점까지 진행한 것과 같은 mesh 상태
    f.scene.render();
    const u = tail.readFrameUniforms()!;
    expect(u.rAU).toBeCloseTo(HALLEY_Q_AU, 6);
    expect(u.activity).toBeCloseTo(cometActivity(HALLEY_Q_AU), 6);
    expect(u.ionLength).toBeGreaterThan(0);
    // 접기는 셰이더 몫 — 메시 가시성 · 활성 플래그는 건드리지 않는다 (토글 경로 setEnabled 와 분리).
    expect(tail.mesh.isVisible).toBe(true);
    expect(tail.mesh.isEnabled()).toBe(true);
  });
});
