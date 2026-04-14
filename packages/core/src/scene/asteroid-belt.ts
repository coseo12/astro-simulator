/**
 * 소행성대 샘플 — N=100~1000 가상 소행성 (#99).
 *
 * - 분포만 실제(2.2~3.2 AU, e<0.2, i<20°), 개별 궤도는 seeded PRNG로 생성.
 * - Babylon ThinInstances: 전체를 단일 draw call로 렌더.
 * - 물리: 각 소행성 Kepler 2-body(태양 중력)만 — 상호 중력 무시(실제도 무시 가능 수준).
 *   Newton 엔진에 합류시키지 않는다 (O(N²) 폭발 방지).
 * - 프레임당 위치 갱신: ThinInstance matrix 버퍼를 in-place로 갱신한 뒤 업데이트 플래그.
 */
import {
  Color3,
  Matrix,
  MeshBuilder,
  StandardMaterial,
  type Mesh,
  type Scene,
} from '@babylonjs/core';
import { AU, GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import { positionAt } from '../physics/kepler.js';
import type { LoadedOrbitalElements } from '../ephemeris/solar-system-loader.js';

const SCENE_UNIT_PER_METER = 1 / AU;

export interface AsteroidBeltOptions {
  /** 생성할 소행성 수. 기본 200. */
  n?: number;
  /** 결정적 생성을 위한 seed. 기본 42. */
  seed?: number;
  /** 에폭(JD). 기본 J2000.0 */
  epoch?: number;
}

export interface AsteroidBeltHandles {
  /** ThinInstance 호스트 메쉬 */
  mesh: Mesh;
  /** 각 소행성의 Kepler 요소 (진단용) */
  elements: ReadonlyArray<LoadedOrbitalElements>;
  /** 주어진 jd에 위치 갱신 */
  updateAt: (jd: number) => void;
  dispose: () => void;
}

/** mulberry32 — 32bit PRNG, 결정적 재현 */
function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

const DEG = Math.PI / 180;
const MAIN_BELT_INNER_AU = 2.2;
const MAIN_BELT_OUTER_AU = 3.2;
const MAX_ECCENTRICITY = 0.2;
const MAX_INCLINATION_DEG = 20;
/** 시각 크기 — 진짜 크기(수 km)는 AU 단위에서 완전히 점. 띠 형태가 보이도록 강조. */
const ASTEROID_VISUAL_DIAMETER_AU = 0.008;

export function createAsteroidBelt(
  scene: Scene,
  options: AsteroidBeltOptions = {},
): AsteroidBeltHandles {
  const n = Math.max(0, Math.min(10_000, options.n ?? 200));
  const seed = options.seed ?? 42;
  const epoch = options.epoch ?? 2_451_545.0;

  const rnd = mulberry32(seed);
  const elements: LoadedOrbitalElements[] = [];
  for (let i = 0; i < n; i += 1) {
    const aAU = MAIN_BELT_INNER_AU + rnd() * (MAIN_BELT_OUTER_AU - MAIN_BELT_INNER_AU);
    const e = rnd() * MAX_ECCENTRICITY;
    const incl = rnd() * MAX_INCLINATION_DEG * DEG;
    const lan = rnd() * 2 * Math.PI;
    const argP = rnd() * 2 * Math.PI;
    const m0 = rnd() * 2 * Math.PI - Math.PI;
    elements.push({
      semiMajorAxis: aAU * AU,
      eccentricity: e,
      inclination: incl,
      longitudeOfAscendingNode: lan,
      argumentOfPeriapsis: argP,
      meanAnomalyAtEpoch: m0,
      epoch,
    });
  }

  const template = MeshBuilder.CreateSphere(
    'asteroid-template',
    { diameter: ASTEROID_VISUAL_DIAMETER_AU, segments: 6 },
    scene,
  );
  const mat = new StandardMaterial('asteroid-mat', scene);
  mat.diffuseColor = new Color3(0.55, 0.5, 0.45);
  mat.specularColor = new Color3(0.02, 0.02, 0.02);
  template.material = mat;
  template.isPickable = false;

  // 16 floats per instance (4x4 matrix). Babylon 요구 사항.
  const matrixBuffer = new Float32Array(n * 16);
  for (let i = 0; i < n; i += 1) {
    Matrix.IdentityToRef(new Matrix()); // noop — 아래에서 즉시 갱신
    writeTranslation(matrixBuffer, i, 0, 0, 0);
  }
  template.thinInstanceSetBuffer('matrix', matrixBuffer, 16, false);

  const sun = GRAVITATIONAL_CONSTANT * 1.98892e30;

  const updateAt = (jd: number) => {
    for (let i = 0; i < n; i += 1) {
      const el = elements[i]!;
      const p = positionAt(el, jd, sun);
      writeTranslation(
        matrixBuffer,
        i,
        p[0] * SCENE_UNIT_PER_METER,
        p[1] * SCENE_UNIT_PER_METER,
        p[2] * SCENE_UNIT_PER_METER,
      );
    }
    template.thinInstanceBufferUpdated('matrix');
  };

  // 초기 위치
  updateAt(epoch);

  return {
    mesh: template,
    elements,
    updateAt,
    dispose: () => {
      template.material?.dispose();
      template.dispose();
    },
  };
}

/** 4x4 row-major identity에 translation만 덮어쓴다. 회전/스케일 사용 안 함. */
function writeTranslation(buf: Float32Array, i: number, x: number, y: number, z: number): void {
  const o = i * 16;
  buf[o + 0] = 1;
  buf[o + 1] = 0;
  buf[o + 2] = 0;
  buf[o + 3] = 0;
  buf[o + 4] = 0;
  buf[o + 5] = 1;
  buf[o + 6] = 0;
  buf[o + 7] = 0;
  buf[o + 8] = 0;
  buf[o + 9] = 0;
  buf[o + 10] = 1;
  buf[o + 11] = 0;
  buf[o + 12] = x;
  buf[o + 13] = y;
  buf[o + 14] = z;
  buf[o + 15] = 1;
}
