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
import { AU, GRAVITATIONAL_CONSTANT, SOLAR_MASS } from '@astro-simulator/shared';
import { positionAt } from '../physics/kepler.js';
import { orbitalStateAt } from '../physics/state-vector.js';
import type { LoadedOrbitalElements } from '../ephemeris/solar-system-loader.js';

// P12-A #298 B1 — `SCENE_UNIT_PER_METER = 1/AU` 하드코딩 제거. tier 전환 시 본 모듈의
// ThinInstance 좌표가 body mesh 의 renderScaleForTier(tier) 와 동일 배수로 스케일되도록
// 호출자가 **모든 진입점** — 생성 시점 `options.sceneUnitPerMeter` + 매 프레임 `updateAt` /
// `writeWorldPositions` — 에 `sceneUnitPerMeter` 를 주입한다.
// 주석 계약: `sceneUnitPerMeter === renderScaleForTier(activeTier)` 이어야 rings/행성과
// 상대 비율이 보존됨.
//
// 본 모듈은 **의도적으로 tier-agnostic** 이다 — `tier.js` 를 import 하지 않으며, 그것이 계약의
// 본체다. `renderScaleForTier('solar')` 를 여기서 직접 부르는 대안(#998 5항 원안)은 하드코딩의
// 대상만 `1 / AU` → tier 리터럴 `'solar'` 로 옮길 뿐 계약을 되돌린다 (#998 축 C 에서 기각).
//
// 근거 계보 (#998 축 C 판정) — 계약의 원 출처 ADR `20260423-display-relative-scale-unification.md`
// 는 2026-04-25 roadmap reset 으로 **폐기**되어 `docs/deprecated/decisions/` 로 이동했다. 폐기된 것은
// §원칙 §1 "상대 비율 = 실측 고정" 과 단일 모드 UX 계층이고, **tier 엔진(renderScale = tier 함수)
// 은 코드 잔존 + 현행 유지**다 (폐기 ADR 머리말 §참고 / `docs/decisions/20260504-focus-tier-oscillate-fix.md`
// §관련 ADR — "폐기 처리되었으나 코드는 유지"). 따라서 본 계약의 **현행 근거**는 아래이며, 폐기 ADR
// 은 이력 근거로만(경로 `docs/deprecated/decisions/…`) 인용한다:
//   - `./tier.ts` 머리말 §계약 1~4 (renderScale 은 tier 함수 — `SCENE_UNIT_PER_METER` 하드코딩 금지)
//   - `docs/architecture/principles.md` §1 Visual Fidelity §적용 위치 원칙 (왜곡은 rendering 시점에만)
//   - 회귀 가드 `./tier-proportion.test.ts` (산술 불변식) + `./asteroid-belt-scale-contract.test.ts`
//     (본 모듈 초기 배치 실측)

export interface AsteroidBeltOptions {
  /**
   * **필수** — 초기 ThinInstance 배치에 적용할 renderScale (m → scene unit).
   * 호출자가 `renderScaleForTier(activeTier)` 를 주입한다 (위 주석 계약).
   *
   * #998 축 C 이전에는 본 모듈이 자기 init 에서 `1 / AU` 를 하드코딩했다 — *"호출자가 주입"* 이라
   * 선언해놓고 **자기 계약을 자기가 위반**한 지점이다. NullEngine 실측(`asteroid-belt-scale-contract.test.ts`)
   * 기준 초기 배치 반경이 **1.90~3.59 scene unit** 이었고, solar tier 정답은 **27.65~40.21** 이다
   * (`8.4e-11 ÷ (1/AU)` = **12.566배**). 덮어쓰기 경로가 끊기면 이 값이 그대로 화면에 나가고
   * 자가 교정 경로가 없어 증상이 영구다.
   *
   * **선택 필드 + 기본값으로 두지 않는다** — 기본값은 같은 함정을 그대로 남기는 fallback 분기다
   * (CLAUDE.md §가드 설계 원칙 — drift 경로 fallback 금지). 필수 필드로 두면 주입 누락이
   * **컴파일 시점에** 걸린다.
   */
  sceneUnitPerMeter: number;
  /** 생성할 소행성 수. 기본 200. */
  n?: number;
  /** 결정적 생성을 위한 seed. 기본 42. */
  seed?: number;
  /** 에폭(JD). 기본 J2000.0 */
  epoch?: number;
  /**
   * P4-A #165 — 개별 소행성 질량 (kg). 기본 3e18 kg (주 소행성대 평균 규모).
   * N-body 경로 사용 시 상호작용 강도에 영향. Kepler 경로에서는 무시된다.
   */
  assetMass?: number;
}

export interface AsteroidBeltHandles {
  /** ThinInstance 호스트 메쉬 */
  mesh: Mesh;
  /** 각 소행성의 Kepler 요소 (진단용) */
  elements: ReadonlyArray<LoadedOrbitalElements>;
  /**
   * 주어진 jd에 위치 갱신 (Kepler 해석해 경로).
   *
   * @param jd Julian Date
   * @param sceneUnitPerMeter 현재 tier 의 `renderScaleForTier(tier)` (m → scene unit 배수).
   *   tier 전환 시 호출자가 새 값을 주입하면 다음 프레임에 스케일 반영.
   */
  updateAt: (jd: number, sceneUnitPerMeter: number) => void;
  /**
   * P4-A #165 — 각 소행성의 현 월드 좌표(SI m, 태양 원점)를 ThinInstance 버퍼에 반영.
   * 인자는 길이 3N의 flat array. WebGPU 엔진은 Float32Array, Newton/BH는 Float64Array를
   * 반환하므로 유니온으로 받는다. 빈 배열이면 갱신하지 않음 (방어).
   *
   * @param sceneUnitPerMeter 현재 tier 의 `renderScaleForTier(tier)`.
   */
  writeWorldPositions: (
    positions: Float32Array | Float64Array,
    offset: number,
    count: number,
    sceneUnitPerMeter: number,
  ) => void;
  /**
   * P4-A #165 — N-body 초기 state (positions/velocities/masses). 길이 3N / 3N / N.
   * 태양 기준 heliocentric coordinates.
   */
  getNbodyState: (
    jd: number,
    sunMu: number,
  ) => { masses: Float64Array; positions: Float64Array; velocities: Float64Array };
  /** 소행성 수 */
  readonly n: number;
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
  options: AsteroidBeltOptions,
): AsteroidBeltHandles {
  const n = Math.max(0, Math.min(10_000, options.n ?? 200));
  const seed = options.seed ?? 42;
  const epoch = options.epoch ?? 2_451_545.0;
  const assetMass = options.assetMass ?? 3e18;
  const { sceneUnitPerMeter } = options;

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

  // #845 — 리터럴 1.98892e30 을 shared `SOLAR_MASS` SSoT 로 교체 (volt #69 숨은 상수).
  const sun = GRAVITATIONAL_CONSTANT * SOLAR_MASS;

  const updateAt = (jd: number, sceneUnitPerMeter: number) => {
    for (let i = 0; i < n; i += 1) {
      const el = elements[i]!;
      const p = positionAt(el, jd, sun);
      writeTranslation(
        matrixBuffer,
        i,
        p[0] * sceneUnitPerMeter,
        p[1] * sceneUnitPerMeter,
        p[2] * sceneUnitPerMeter,
      );
    }
    template.thinInstanceBufferUpdated('matrix');
  };

  // 초기 위치 — #998 축 C 이전에는 여기서 `1 / AU` 를 하드코딩해 **호출자 주입 계약을 모듈이
  // 자기 init 에서 위반**했다. 이제 호출자가 넘긴 `options.sceneUnitPerMeter` 를 그대로 쓴다.
  //
  // 이 호출은 여전히 프레임 `updateAt` 이 덮어쓰지만, 안전 근거가 **"덮어써짐" 하나 → "값 자체가
  // 이미 맞음" 으로 바뀐** 것이 본 변경의 요지다. `solar-system-scene.ts` 의 씬 생성 말미 동기
  // `updateAt(initialJulianDate)` 경로가 향후 끊기거나 순서가 밀려도 초기 프레임이 정답 스케일이다.
  updateAt(epoch, sceneUnitPerMeter);

  // P4-A #165 — N-body 경로에서 사용할 초기 state vector.
  const getNbodyState = (jd: number, sunMu: number) => {
    const masses = new Float64Array(n);
    const positions = new Float64Array(3 * n);
    const velocities = new Float64Array(3 * n);
    for (let i = 0; i < n; i += 1) {
      masses[i] = assetMass;
      const { position, velocity } = orbitalStateAt(elements[i]!, jd, sunMu);
      positions[3 * i + 0] = position[0];
      positions[3 * i + 1] = position[1];
      positions[3 * i + 2] = position[2];
      velocities[3 * i + 0] = velocity[0];
      velocities[3 * i + 1] = velocity[1];
      velocities[3 * i + 2] = velocity[2];
    }
    return { masses, positions, velocities };
  };

  // N-body 엔진이 적분한 위치를 ThinInstance 버퍼로 반영.
  // `positions`는 (태양+행성+...+소행성) 전체 배열. `offset`은 소행성 시작 인덱스(body count).
  const writeWorldPositions = (
    positions: Float32Array | Float64Array,
    offset: number,
    count: number,
    sceneUnitPerMeter: number,
  ) => {
    const limit = Math.min(count, n);
    for (let i = 0; i < limit; i += 1) {
      const o = 3 * (offset + i);
      writeTranslation(
        matrixBuffer,
        i,
        (positions[o] ?? 0) * sceneUnitPerMeter,
        (positions[o + 1] ?? 0) * sceneUnitPerMeter,
        (positions[o + 2] ?? 0) * sceneUnitPerMeter,
      );
    }
    template.thinInstanceBufferUpdated('matrix');
  };

  return {
    mesh: template,
    elements,
    updateAt,
    writeWorldPositions,
    getNbodyState,
    n,
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
