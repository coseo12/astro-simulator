/**
 * #1319 — 소행성대 띠 입자 GPU Kepler 렌더 경로 (ADR `docs/decisions/20261008-1319-asteroid-belt-gpu.md` 결정 1·2·5).
 *
 * 「N 개 쿼드 = 4N 정점」 단일 메시 + GLSL `ShaderMaterial` 1개 (draw call 1). 각 정점이 자기 입자의
 * 궤도 요소를 속성으로 들고, **정점 셰이더가 Kepler 방정식을 Newton 4회로 풀어** 위치를 정한다.
 * 그 위치를 clip 공간으로 투영한 뒤 화면 고정 물리 px 만큼 모서리를 벌린다 (tier·줌 무관 지름 3 px).
 *
 * 프레임당 CPU 작업은 uniform 5개 (`uDays` · `uScale` · `uOrigin` · `uPxToClip` · `logDepthConstant`) 뿐이다 — O(1).
 * 예외는 epoch rebase (아래 `BELT_EPOCH_REBASE_DAYS`) 1회 O(N) 재업로드.
 *
 * ## 기준계 계약 (결정 2)
 *
 * 띠는 body mesh 가 **실제로 쓴** `(origin, scale)` 스냅샷(`BodyReferenceFrame`)을 draw 직전에 읽는다.
 * `floatingOrigin.originOffset` 을 그 시점에 다시 읽지 않는다 — `#380` 가드 C 순서상 그 값은 이미 다음
 * 프레임 origin 이라 body 와 한 프레임 어긋난다 (`solar-system-scene.ts` `syncSunLightPosition` 주석과 같은 함정).
 * 스냅샷은 scene 이 body `mesh.position` 을 쓰는 두 지점(`updateAt` 루프 · `setTier` 즉시 재계산) 에서 기록한다.
 * 그래서 시간이 멈춰 있어도 tier·origin 변경이 다음 draw 에 반영된다 (시간 위상 비의존 — ADR 1205 와 같은 축).
 *
 * ## 왜 `onBindObservable` 이 아니라 `onBeforeRenderObservable` 인가
 *
 * Babylon 9.19.0 `ShaderMaterial.bind` 는 저장된 uniform 값을 effect 에 **먼저** 흘려 보낸 뒤 마지막에
 * `_afterBind` 에서 `onBindObservable` 을 알린다 (`shaderMaterial.pure.js` `bind` → `_afterBind`). 거기서
 * `material.setX` 를 하면 값은 **다음** draw 에 반영된다 — 재생 중 body tier 에선 origin 이 매 프레임 움직이므로
 * 띠가 body 보다 1 프레임 늦는다. `Mesh.render` 는 `onBeforeRenderObservable` 을 material bind **이전**에
 * 알리므로 (`mesh.pure.js` `render`) 같은 draw 의 bind 가 방금 쓴 값을 싣는다.
 *
 * ## 분포는 입력이다 (PR2)
 *
 * 궤도 요소는 호출자가 `BeltOrbit[]` 로 넘긴다 — 생성은 Babylon 비의존 순수 함수 `belt-population.ts`
 * (`generateBeltPopulation`) 의 책임이다. 평균운동 `n` 도 요소에 실려 온다 (공명군은 행성 평균운동의 정수비라
 * `√(μ/a³)` 로 다시 유도하면 안 된다 — ADR 결정 4). 메시 1개 = 색 1개라 소행성대(웜) · 카이퍼(쿨) 는 메시 2개다 (결정 5).
 *
 * ## 이 모듈이 하지 않는 것
 *
 * 렌더러 종류를 모른다 (소프트웨어 렌더 게이트는 web 책임 — ADR §교차검증 이견 수용 5, PR3).
 * N-body(`?beltNbody=1`) 위치는 Kepler 셰이더로 표현할 수 없어 구 CPU 경로(`asteroid-belt.ts`) 가 맡는다.
 */
import {
  Color3,
  Effect,
  Mesh,
  ShaderMaterial,
  Vector2,
  Vector3,
  VertexData,
  type Scene,
} from '@babylonjs/core';
import { AU } from '@astro-simulator/shared';
import { mulberry32, type BeltOrbit } from './belt-population.js';
import { LOG_DEPTH_FRAGMENT_WRITE_GLSL } from './log-depth.js';

/**
 * body `mesh.position` 이 쓰인 기준계 — `mesh.position = (world − origin) × scale`.
 * origin 은 m (heliocentric), scale 은 m → scene unit (`renderScaleForTier(tier)`).
 */
export interface BodyReferenceFrame {
  originX: number;
  originY: number;
  originZ: number;
  scale: number;
}

/** 지름 — 물리 px (#623 `adaptToDeviceRatio` 라 렌더 버퍼 = 물리 px). 결정 5 · 사용자 결정 Q7 (최종값은 D-T2). */
export const BELT_PARTICLE_PX = 3;
/** 입자별 밝기 범위 — 대표 천체(#1318 body · glow marker) 보다 어둡게 (결정 5). */
export const BELT_BRIGHTNESS_MIN = 0.6;
export const BELT_BRIGHTNESS_MAX = 1.0;
/** 주 띠 웜 그레이 (선형 RGB, 밝기 1.0 기준). 구 경로 구 머티리얼 `diffuseColor (0.55, 0.5, 0.45)` 와 같은 색조. */
export const BELT_WARM_GRAY_RGB: readonly [number, number, number] = [0.55, 0.5, 0.45];
/**
 * 카이퍼 쿨 그레이 (결정 5) — 웜 그레이의 R·B 를 맞바꾼 값. 밝기(채널 평균) 가 같아 색조만 다르다.
 * 최종 색은 D-T2 육안 승인 대상이다.
 */
export const BELT_COOL_GRAY_RGB: readonly [number, number, number] = [0.45, 0.5, 0.55];
/**
 * 힐다 강조색 (선형 RGB, 밝기 1.0 기준) — **힐다 = 목성 3:2 공명군 강조. 시각 구분 전용이며 물리 색이 아니다.**
 *
 * 사용자 결정 (2026-10-09, PR #1324): 힐다 삼각형은 데이터상 구조가 있어도 주 띠 · 트로이와 같은 웜 그레이라
 * 육안으로 거의 안 보였다. 개수를 늘리는 대신 (분포 왜곡) 색으로만 구분한다.
 *
 * 색 선택: 녹청 계열. 배경 별 색 (`starfield.ts` `starColor` — 적황 · 백색 · 청백) · 주 띠 웜 그레이 · 카이퍼 쿨 그레이
 * 어느 것과도 색상이 겹치지 않는 축이 녹색이다. 상대 휘도 (Rec.709) 는 `0.528` 로 웜 그레이 `0.507` 과 거의 같게
 * 맞춰 「밝기 계층」 은 그대로 두고 색상만 바꿨다 — 대표 천체 glow marker (body 색 × emissive 1.6 · 2.0) 보다 어둡다
 * (ADR 20261008-1319 결정 5). 최종 색은 사용자 육안 확인 대상이다.
 */
export const BELT_HILDA_ACCENT_RGB: readonly [number, number, number] = [0.33, 0.6, 0.4];

/**
 * epoch rebase 임계 (일). `|jd − epochBase|` 가 이를 넘으면 CPU(double) 에서 `M0` 를 새 epoch 로 다시 쓴다.
 *
 * 값의 근거 (ADR §교차검증 이견 수용 3 — 발명하지 않고 DoD 「JS 미러 vs `positionAt` ≤ 1e-4 AU」 에서 도출).
 * JS 미러(`beltKeplerPositionF32`) 와 `positionAt` 를 a ∈ [2, 50] AU · e ∈ [0, 0.3] 무작위 1000 요소 ×
 * `uDays` ∈ [−T, T] 201 점에서 잰 최대 위치 오차 (seed 7 / 1319 / 42 의 최댓값, 2026-10-09 실측):
 *
 *   T 10,000 → 4.7e-5 AU · 20,000 → 4.7e-5 · 25,000 → 5.8e-5 · 30,000 → 7.2e-5 · 40,000 → 8.0e-5
 *   (단일 `|uDays|` 점에서 1e-4 를 처음 넘는 것은 55,000 ~ 65,000 일)
 *
 * 오차는 두 층이다. (1) **바닥 ≈ 4.7e-5** — `uDays` 무관, 각 요소를 float32 로 싣는 반올림
 * (각 1개당 ulp(2π)/2 ≈ 2.4e-7 rad × a 50 AU). (2) **계단** — `n · uDays` 의 float32 반올림이
 * `|n · uDays|` 의 ulp 를 따라 2 배씩 커진다. `n ∝ a^-1.5` 라 계단은 장반경이 가장 작은 입자에서 먼저 오고,
 * a = 2 AU (n = 6.08e-3 rad/day) 의 곱이 128 rad 를 넘는 ≈ 21,000 일부터 바닥 위로 올라온다 (위 표의 25,000).
 * 그래서 **계단이 시작되기 전인 20,000 일 (≈ 55 년)** 로 둔다 — 그 아래에선 오차가 바닥에 머물러 한계 대비
 * ≈ 2 배 여유가 남고, 이 여유는 미러가 재지 못하는 GPU `sin`/`cos` 구현 오차 (GLSL 명세상 정밀도 미보장) 몫이다.
 * 띠 입자 분포(`belt-population.ts`) 는 a 2.1 AU (주 띠 하한) ~ 48 AU (카이퍼 고전대 상한) · e < 0.3 이라
 * 측정 표본 범위(a ∈ [2, 50] AU · e ≤ 0.3) 안이다.
 *
 * rebase 는 한 번에 O(N) (속성 버퍼 `orbitA` 1회 재업로드) 이다. 1900~2100 슬라이더를 끝에서 끝으로
 * 끌면 (73,050 일) 3~4 회 발동한다. 회귀 가드: `belt-particles.test.ts` 가 `|uDays| ≤ BELT_EPOCH_REBASE_DAYS` 전 구간에서
 * 1e-4 AU 를 단언한다.
 */
export const BELT_EPOCH_REBASE_DAYS = 20_000;

const SHADER_NAME = 'beltParticles';
const TWO_PI = Math.PI * 2;
/** 쿼드 1개 = 정점 4 · 인덱스 6. */
const VERTICES_PER_QUAD = 4;
const INDICES_PER_QUAD = 6;
/** 정점 속성 vec4 2개 (`orbitA` · `orbitB`). */
const ORBIT_STRIDE = 4;
/** 쿼드 모서리 (clip 공간 오프셋 방향). 반지름 1 원 밖은 fragment 가 `discard`. */
const QUAD_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
/** 밝기 난수 스트림을 궤도 요소 스트림과 분리하는 seed 오프셋 (요소 바이트 동일성 보존). */
const BRIGHTNESS_SEED_OFFSET = 1;

/**
 * 밝기 속성 `orbitB.w` 에 강조 여부를 **부호**로 싣는다 — 음수 = 강조 (힐다), 양수 = 메시 기본색.
 *
 * 밝기는 `[BELT_BRIGHTNESS_MIN, BELT_BRIGHTNESS_MAX]` = `[0.6, 1.0]` 로 항상 양수라 부호 비트가 비어 있다.
 * 정점 속성을 하나 더 두는 대안 (정점당 +4 바이트 · 버퍼 1개 · 속성 선언 1개) 보다 작은 변경이고, 메시를 나누는
 * 대안 (draw call +1) 과 달리 소행성대가 메시 1개 · draw call 1개로 남는다. 셰이더는 `abs` 로 밝기를, `step` 으로 강조를 푼다.
 */
export function encodeBeltBrightness(brightness: number, accent: boolean): number {
  return accent ? -brightness : brightness;
}

/**
 * 정점 셰이더. `beltKeplerPositionF32` 가 **줄 단위로 대응**하는 JS 미러다 — 한쪽을 고치면 다른 쪽도 고친다.
 * 회전 순서는 `kepler.ts` `positionAt` 과 같은 Rz(Ω) · Rx(i) · Rz(ω).
 */
export const BELT_VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec4 orbitA;
attribute vec4 orbitB;

uniform mat4 viewProjection;
uniform float uDays;
uniform float uScale;
uniform vec3 uOrigin;
uniform vec2 uPxToClip;

varying vec2 vCorner;
varying float vBrightness;
varying float vAccent;
varying float vFragmentDepth;

const float TWO_PI = 6.283185307179586;
const float PARTICLE_RADIUS_PX = ${(BELT_PARTICLE_PX / 2).toFixed(4)};

void main(void) {
  float a = orbitA.x;
  float e = orbitA.y;
  float M = mod(orbitA.w + orbitB.z * uDays, TWO_PI);
  float E = M + e * sin(M);
  for (int k = 0; k < 4; k++) {
    E = E - (E - e * sin(E) - M) / (1.0 - e * cos(E));
  }
  float xo = a * (cos(E) - e);
  float yo = a * sqrt(1.0 - e * e) * sin(E);
  float cosW = cos(orbitB.y);
  float sinW = sin(orbitB.y);
  float x1 = cosW * xo - sinW * yo;
  float y1 = sinW * xo + cosW * yo;
  float cosI = cos(orbitA.z);
  float sinI = sin(orbitA.z);
  float y2 = cosI * y1;
  float z2 = sinI * y1;
  float cosO = cos(orbitB.x);
  float sinO = sin(orbitB.x);
  vec3 p = vec3(cosO * x1 - sinO * y2, sinO * x1 + cosO * y2, z2);

  vec3 local = (p - uOrigin) * uScale;
  vec4 clip = viewProjection * vec4(local, 1.0);
  clip.xy += position.xy * PARTICLE_RADIUS_PX * uPxToClip * clip.w;
  gl_Position = clip;
  vCorner = position.xy;
  vBrightness = abs(orbitB.w);
  vAccent = step(orbitB.w, 0.0);
  vFragmentDepth = 1.0 + clip.w;
}
`;

/**
 * fragment — 불투명 + 반지름 1 원 밖 `discard`. 로그 depth 는 SSoT 문장 그대로.
 * 색 `uColor` 는 메시(그룹 묶음) 마다 생성 시 1회 설정한다 — 프레임마다 바뀌지 않는다 (PR2 — 웜 / 쿨 2색).
 * 강조 입자 (`vAccent = 1`, 밝기 속성 음수 — `encodeBeltBrightness`) 는 `uAccentColor` 를 쓴다 (힐다 — 시각 구분 전용).
 */
export const BELT_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vCorner;
varying float vBrightness;
varying float vAccent;
varying float vFragmentDepth;

uniform float logDepthConstant;
uniform vec3 uColor;
uniform vec3 uAccentColor;

void main(void) {
  if (dot(vCorner, vCorner) > 1.0) {
    discard;
  }
  gl_FragColor = vec4(mix(uColor, uAccentColor, vAccent) * vBrightness, 1.0);
  ${LOG_DEPTH_FRAGMENT_WRITE_GLSL}
}
`;

let beltShaderRegistered = false;
function registerBeltShader(): void {
  if (beltShaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = BELT_VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = BELT_FRAGMENT_SHADER;
  beltShaderRegistered = true;
}

/** GLSL `mod(x, y) = x − y · floor(x / y)` 의 float32 미러. */
function modF32(x: number, y: number): number {
  const f = Math.fround;
  return f(x - f(y * Math.floor(f(x / y))));
}

/**
 * 정점 셰이더 Kepler 의 float32 JS 미러 — `BELT_VERTEX_SHADER` 와 **줄 단위 대응** (단위 테스트 전용 계약).
 * 모든 중간값을 `Math.fround` 로 float32 에 가둬 셰이더의 단정밀도 산술을 흉내 낸다.
 * GPU `sin`/`cos` 의 구현 오차는 흉내 내지 못한다 (`BELT_EPOCH_REBASE_DAYS` 여유의 근거).
 *
 * @param orbitA `(a[AU], e, i, M0)` — 속성 버퍼에 실린 float32 값
 * @param orbitB `(Ω, ω, n[rad/day], 밝기)`
 * @param uDays `jd − epochBase` (float32 로 반올림해 넘긴다)
 * @returns 태양 중심 위치 [AU]
 */
export function beltKeplerPositionF32(
  orbitA: readonly [number, number, number, number],
  orbitB: readonly [number, number, number, number],
  uDays: number,
): [number, number, number] {
  const f = Math.fround;
  const a = f(orbitA[0]);
  const e = f(orbitA[1]);
  const M = modF32(f(f(orbitA[3]) + f(f(orbitB[2]) * f(uDays))), f(TWO_PI));
  let E = f(M + f(e * f(Math.sin(M))));
  for (let k = 0; k < 4; k += 1) {
    E = f(E - f(f(f(E - f(e * f(Math.sin(E)))) - M) / f(1 - f(e * f(Math.cos(E))))));
  }
  const xo = f(a * f(f(Math.cos(E)) - e));
  const yo = f(f(a * f(Math.sqrt(f(1 - f(e * e))))) * f(Math.sin(E)));
  const cosW = f(Math.cos(f(orbitB[1])));
  const sinW = f(Math.sin(f(orbitB[1])));
  const x1 = f(f(cosW * xo) - f(sinW * yo));
  const y1 = f(f(sinW * xo) + f(cosW * yo));
  const cosI = f(Math.cos(f(orbitA[2])));
  const sinI = f(Math.sin(f(orbitA[2])));
  const y2 = f(cosI * y1);
  const z2 = f(sinI * y1);
  const cosO = f(Math.cos(f(orbitB[0])));
  const sinO = f(Math.sin(f(orbitB[0])));
  return [f(f(cosO * x1) - f(sinO * y2)), f(f(sinO * x1) + f(cosO * y2)), z2];
}

/** 각을 [−π, π) 로 — float32 에 실을 때 절대값이 작을수록 반올림 오차가 작다. */
function wrapPi(x: number): number {
  const r = x - TWO_PI * Math.floor((x + Math.PI) / TWO_PI);
  return r;
}

/**
 * 입자 1개의 정점 속성 (double → float32 는 호출자가 버퍼에 쓰며 일어난다).
 * `M0` 는 `epochBase` 시점의 평균이상 — 요소의 epoch 와 다르면 요소에 실린 평균운동으로 double 전파한다
 * (rebase 와 같은 식). 평균운동은 요소의 값을 그대로 싣는다 (공명군의 정수비 고정 — `belt-population.ts`).
 */
export function beltOrbitAttributes(
  el: BeltOrbit,
  epochBase: number,
  brightness: number,
): { orbitA: [number, number, number, number]; orbitB: [number, number, number, number] } {
  const n = el.meanMotion;
  const m0 = wrapPi(el.meanAnomalyAtEpoch + n * (epochBase - el.epoch));
  return {
    orbitA: [el.semiMajorAxisAU, el.eccentricity, el.inclination, m0],
    orbitB: [el.longitudeOfAscendingNode, el.argumentOfPeriapsis, n, brightness],
  };
}

export interface BeltParticlesOptions {
  /** 입자별 궤도 요소 — `generateBeltPopulation` 출력의 그룹 묶음. 개수 상한(clamp) 은 호출자 책임. */
  orbits: readonly BeltOrbit[];
  /** 메시 이름. 기본 `'belt-particles'`. */
  name?: string;
  /** 선형 RGB (밝기 1.0 기준). 기본 `BELT_WARM_GRAY_RGB`. */
  color?: readonly [number, number, number];
  /**
   * 입자별 강조 여부 (길이 = `orbits.length`). 참인 입자는 `accentColor` 로 그린다 — 힐다 3:2 공명군 시각 구분 전용.
   * 미지정이면 전부 기본색.
   */
  accentFlags?: ArrayLike<boolean>;
  /** 강조색 (선형 RGB). 기본 `BELT_HILDA_ACCENT_RGB`. */
  accentColor?: readonly [number, number, number];
  /** 밝기 난수 seed. 기본 42. 요소 생성 seed 와 별개다. */
  seed?: number;
  /** 초기 `epochBase` (JD) — 장면 초기 시각. 요소의 epoch 와 달라도 된다 (`beltOrbitAttributes`). */
  epoch: number;
  /** body mesh 가 쓴 기준계 스냅샷 제공자 — draw 직전마다 호출 (캐시 금지). */
  frameProvider: () => BodyReferenceFrame;
}

/** 마지막 draw 직전에 material 에 실은 uniform 값 (진단 · 단위 테스트용 읽기 전용 사본). */
export interface BeltFrameUniforms {
  days: number;
  scale: number;
  origin: [number, number, number];
  pxToClip: [number, number];
  logDepthConstant: number;
}

export interface BeltParticlesHandles {
  mesh: Mesh;
  material: ShaderMaterial;
  /** 입자 수. */
  readonly n: number;
  /** 시간 위상 — `uDays` 갱신 + 필요 시 epoch rebase. */
  updateAt: (jd: number) => void;
  /** 현재 `epochBase` (JD) — 진단용. */
  getEpochBase: () => number;
  /** draw 직전 uniform 적용 (렌더 경로가 자동 호출). 단위 테스트가 NullEngine 에서 같은 경로를 태우는 데 쓴다. */
  applyFrameUniforms: () => void;
  /** 마지막 `applyFrameUniforms` 가 실은 값. 한 번도 안 불렸으면 null. */
  readFrameUniforms: () => BeltFrameUniforms | null;
  dispose: () => void;
}

/**
 * 띠 입자 메시 생성 — 궤도 요소는 입력(`options.orbits`) 이다 (PR2 — 생성은 `belt-population.ts`).
 */
export function createBeltParticles(
  scene: Scene,
  options: BeltParticlesOptions,
): BeltParticlesHandles {
  const elements = options.orbits;
  const n = elements.length;
  const seed = options.seed ?? 42;
  const name = options.name ?? 'belt-particles';
  const color = options.color ?? BELT_WARM_GRAY_RGB;
  const accentColor = options.accentColor ?? BELT_HILDA_ACCENT_RGB;
  const { accentFlags } = options;
  if (accentFlags && accentFlags.length !== n) {
    // 길이가 어긋나면 강조가 엉뚱한 입자에 붙는다 — 조용히 넘기지 않는다.
    throw new Error(`[createBeltParticles] accentFlags 길이 ${accentFlags.length} ≠ orbits ${n}`);
  }
  const { epoch, frameProvider } = options;

  const brightnessRnd = mulberry32(seed + BRIGHTNESS_SEED_OFFSET);
  const brightness = new Float64Array(n);
  for (let i = 0; i < n; i += 1) {
    brightness[i] =
      BELT_BRIGHTNESS_MIN + brightnessRnd() * (BELT_BRIGHTNESS_MAX - BELT_BRIGHTNESS_MIN);
  }

  const vertexCount = n * VERTICES_PER_QUAD;
  const positions = new Float32Array(vertexCount * 3);
  const indices = new Uint32Array(n * INDICES_PER_QUAD);
  const orbitAData = new Float32Array(vertexCount * ORBIT_STRIDE);
  const orbitBData = new Float32Array(vertexCount * ORBIT_STRIDE);

  let epochBase = epoch;
  const writeParticle = (i: number): void => {
    const { orbitA, orbitB } = beltOrbitAttributes(
      elements[i]!,
      epochBase,
      encodeBeltBrightness(brightness[i]!, accentFlags?.[i] === true),
    );
    for (let c = 0; c < VERTICES_PER_QUAD; c += 1) {
      const o = (i * VERTICES_PER_QUAD + c) * ORBIT_STRIDE;
      orbitAData.set(orbitA, o);
      orbitBData.set(orbitB, o);
    }
  };
  for (let i = 0; i < n; i += 1) {
    const v0 = i * VERTICES_PER_QUAD;
    for (let c = 0; c < VERTICES_PER_QUAD; c += 1) {
      const corner = QUAD_CORNERS[c]!;
      positions[(v0 + c) * 3] = corner[0];
      positions[(v0 + c) * 3 + 1] = corner[1];
      positions[(v0 + c) * 3 + 2] = 0;
    }
    const ix = i * INDICES_PER_QUAD;
    indices[ix] = v0;
    indices[ix + 1] = v0 + 1;
    indices[ix + 2] = v0 + 2;
    indices[ix + 3] = v0;
    indices[ix + 4] = v0 + 2;
    indices[ix + 5] = v0 + 3;
    writeParticle(i);
  }

  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, false);
  mesh.setVerticesData('orbitA', orbitAData, true, ORBIT_STRIDE);
  mesh.setVerticesData('orbitB', orbitBData, false, ORBIT_STRIDE);
  // 정점 셰이더가 위치를 정하므로 position 속성(쿼드 모서리) 기반 bounding 은 무의미 — 컬링 대상에서 뺀다.
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;

  registerBeltShader();
  const material = new ShaderMaterial(
    `${name}-mat`,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position', 'orbitA', 'orbitB'],
      uniforms: [
        'viewProjection',
        'uDays',
        'uScale',
        'uOrigin',
        'uPxToClip',
        'logDepthConstant',
        'uColor',
        'uAccentColor',
      ],
    },
  );
  material.setColor3('uColor', new Color3(color[0], color[1], color[2]));
  material.setColor3('uAccentColor', new Color3(accentColor[0], accentColor[1], accentColor[2]));
  // 쿼드는 화면 공간에서 벌어지므로 감김 방향이 카메라와 무관하게 고정이지만, 엔진별 front-face 규약에
  // 기대지 않도록 컬링을 끈다 (불투명 · depth write on 은 기본값).
  material.backFaceCulling = false;
  mesh.material = material;

  let currentDays = 0;
  const updateAt = (jd: number): void => {
    let days = jd - epochBase;
    if (Math.abs(days) > BELT_EPOCH_REBASE_DAYS) {
      // M0 는 원 요소 epoch 에서 double 로 다시 전파한다 (누적 반올림 없음).
      epochBase = jd;
      for (let i = 0; i < n; i += 1) writeParticle(i);
      mesh.updateVerticesData('orbitA', orbitAData);
      days = 0;
    }
    currentDays = days;
  };

  const tmpOrigin = new Vector3();
  const tmpPxToClip = new Vector2();
  let lastUniforms: BeltFrameUniforms | null = null;
  const applyFrameUniforms = (): void => {
    const frame = frameProvider();
    const engine = scene.getEngine();
    // 캐시 금지 — 리사이즈 · DPR 변경이 다음 draw 에 그대로 반영된다 (ADR 이견 수용 4).
    const width = Math.max(1, engine.getRenderWidth());
    const height = Math.max(1, engine.getRenderHeight());
    const maxZ = scene.activeCamera?.maxZ ?? 1e14;
    const logDepthConstant = 2.0 / (Math.log(maxZ + 1.0) / Math.LN2);
    // origin 을 AU 로 — 셰이더의 `p` 가 AU 라 `(p − uOrigin) × uScale` 이 body mesh 의
    // `(world − origin) × scale` 과 같은 식이 된다 (uScale = scale × AU, scene unit / AU).
    tmpOrigin.set(frame.originX / AU, frame.originY / AU, frame.originZ / AU);
    tmpPxToClip.set(2 / width, 2 / height);
    const uScale = frame.scale * AU;
    material.setFloat('uDays', currentDays);
    material.setFloat('uScale', uScale);
    material.setVector3('uOrigin', tmpOrigin);
    material.setVector2('uPxToClip', tmpPxToClip);
    material.setFloat('logDepthConstant', logDepthConstant);
    lastUniforms = {
      days: currentDays,
      scale: uScale,
      origin: [tmpOrigin.x, tmpOrigin.y, tmpOrigin.z],
      pxToClip: [tmpPxToClip.x, tmpPxToClip.y],
      logDepthConstant,
    };
  };
  applyFrameUniforms();
  mesh.onBeforeRenderObservable.add(applyFrameUniforms);

  return {
    mesh,
    material,
    n,
    updateAt,
    getEpochBase: () => epochBase,
    applyFrameUniforms,
    readFrameUniforms: () => lastUniforms,
    dispose: () => {
      mesh.onBeforeRenderObservable.clear();
      material.dispose();
      mesh.dispose();
    },
  };
}
