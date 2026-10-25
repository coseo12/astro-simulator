/**
 * #774 — 태양 emissive 절차 표면 셰이더 (granulation + limb darkening + 색온도 그라데이션).
 *
 * **목적**: 단색 emissive disk (`StandardMaterial.emissiveColor + disableLighting`) 로만 렌더되는
 * 태양에 사실적 표면 디테일을 부여한다 (방향성 기획 트랙 A — `principles.md §1 Visual Fidelity`,
 * #756 절차적 행성 표면의 직접 후속). 외부 텍스처 에셋 / 신규 라이브러리 0. ring/starfield/
 * procedural-planet 의 절차적 ShaderMaterial 구조를 답습한 **4번째 절차 셰이더 모듈**이다.
 *
 * **설계 근거**: ADR `docs/decisions/20260703-774-sun-emissive-shader.md`
 *   - §결정 1 — 신규 독립 모듈. `SURFACE_TYPE_BY_BODY` 에 sun **미등록 유지** (테이블은 "외부광
 *     반사 표면" 전용 — `procedural-planet-shader.ts` 변경 0). 호출부 star 분기가 직접 본 팩토리 호출.
 *   - §결정 2 — granulation (fbm) + limb darkening (Eddington 근사 `I(μ) = 1 − u(1−μ)`) + 색온도
 *     그라데이션 (채널별 u 계수로 자동 도출 — 실물리에서 u 는 파장 함수, blue 가 더 감광 →
 *     가장자리가 자동으로 주황). sunspot / 시간 변동 / 코로나는 후속 (§재검토 조건 2·3·5).
 *   - §결정 3 — granulation 은 **painted-on 정적** (vLocalPos local — #782 규약). sun 은
 *     `rotationPeriodHours` 데이터 부재로 self-rotation 비대상 (데이터 0 유지). 단 vNormal 은
 *     #782 옵션 e (world normal) 규약 답습 — limb darkening viewDir(world) dot 정합 + 미래
 *     자전 데이터 추가 시 셰이더 무수정 안전.
 *   - §결정 4 — **emissive 전용**: ShaderMaterial 은 광원 uniform 을 선언하지 않으면 fragment
 *     출력이 곧 최종색 (`disableLighting` 개념 자체가 불필요 — 자동 무광). planet 셰이더가 광원
 *     재현을 위해 9 uniform 을 일부러 주입한 것의 정확한 역방향. 알파 1 고정 (OPAQUE — 기존
 *     star StandardMaterial 과 동일 블렌딩 특성, 렌더 순서 무회귀). 태양 중심 PointLight
 *     (`sun-light`) 는 본 셰이더가 참조하지 않으므로 간섭 0.
 *   - §결정 6 — high/mid 동일 셰이더 공유 (팝핑 0 — #756 실증), low (billboard) + tier-c
 *     (`forceOverride:'low'`) 는 현행 star full emissive 유지 (별도 코드 0 — glow-marker 정합 §결정 5).
 *   - §결정 7 — log-depth 정합: ring (#641) / planet (#756) 2회 실증 패턴 복제 (`gl_FragDepth`
 *     로그 공간 기록). 누락 시 태양이 수성/금성 통과 시 항상 위로 그려지는 가림 버그.
 *   - §결정 8 — 상수 SSoT 는 본 모듈 소유 (rendering-only 미학 상수 — 데이터 SSoT 무관).
 *     baseColor 는 `colorHint.hex` read-only uniform (#756 결정 5 동형).
 *
 * **viewDir 배선 (`cameraPosition`)**: Babylon ShaderMaterial 표준 auto-bind uniform — uniforms
 *   배열에 'cameraPosition' 선언 시 bind 단계에서 `scene.activeCamera.globalPosition` 자동 설정
 *   (shaderMaterial.js `_options.uniforms.indexOf("cameraPosition")` — v8.56/v9.2 동일 확인).
 *   런타임 확증은 limb darkening radial 프로파일 실측 (미동작이면 프로파일이 평탄해져 즉시 노출).
 *
 * ⚠️ **noise 미러 계약 (drift 가드)**: 본 GLSL 의 hash33/valueNoise/fbm 은
 *   `procedural-planet-shader.ts` GLSL 과 **동일 텍스트**여야 한다 — JS 미러는 그쪽의
 *   `fbmMirror` 를 재사용하므로 (volt #21 중복 구현 금지), GLSL 텍스트가 갈라지면 미러가
 *   양쪽 중 한쪽과 어긋난다. sun-shader.test.ts 가 핵심 식 동일성을 정적 계약으로 가드.
 *
 * **WebGPU↔WebGL parity**: GLSL 은 양 백엔드 동작 (Babylon GLSL→WGSL 변환 — ring/starfield/
 *   planet 선례). **switch-case 금지** (WGSL 변환 깨짐 — #756 이견 수용 1), if-else 만 사용.
 *
 * **#1412 흑점** (ADR `docs/decisions/20261025-1412-sunspots.md`): 흑점 목록은 CPU 가 만든다 (`sunspots.ts` —
 *   jd 순수 함수). 셰이더는 `uniform vec4 spots[48]` (`xyz` 장면 단위벡터 중심 · `w` 반영 각반경 ×2.5) + `spotCount`
 *   만 받아 상수 상한 루프로 원판 판정한다 (결정 1). jd 는 셰이더로 가지 않는다 (#782 규약). 합성은
 *   `baseColor × granulation′ × spotFactor × limb` (결정 4). `spotCount = 0` 이면 흑점 도입 전과 같은 식이 된다
 *   (`mix(x, y, 0) = x`, `× 1` — 소프트웨어 렌더 게이트 · `?sunspots=off` 의 경로).
 */

import { Effect, ShaderMaterial, Vector3, type Scene } from '@babylonjs/core';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import { fbmMirror } from './procedural-planet-shader.js';
import { hexToColor3 } from './color-utils.js';
import { LOG_DEPTH_FRAGMENT_WRITE_GLSL } from './log-depth.js';
import {
  SUNSPOT_MAX,
  SUN_AXIS_SCENE,
  createHeliographicSpots,
  generateHeliographicSunspots,
  heliographicToScene,
} from './sunspots.js';

// ─────────────────────────────────────────────────────────────────────────────
// rendering-only 미학 상수 SSoT (#69 숨은 상수 drift 차단 — sun-shader.test.ts 가드 대상).
// 데이터 SSoT 아님 (`solar-system.json` 무관). 출발값은 물리 근사, 최종값은 measurement-first
// 화면 실측 튜닝으로 박제 (ADR §결정 8 — developer 재량).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 채널별 limb darkening 계수 u(λ) — Eddington 근사 `I(μ) = 1 − u(1−μ)` 의 u 를 RGB 로 분리.
 *
 * 실물리에서 u 는 파장 함수다 (Allen's Astrophysical Quantities 근사 — 700nm ~0.5 / 550nm ~0.6 /
 * 400nm ~0.85–0.9). blue 가 더 어두워지므로 **감광 + 가장자리 주황 (색온도 그라데이션) 을 상수
 * 1묶음으로 동시 달성** (ADR §결정 2 — 별도 색 mix 불요). u_R < u_G < u_B 순서가 warm 색역
 * (가장자리 B/R 비 감소) 의 구조적 전제 — 테스트가 순서를 가드.
 */
export const LIMB_DARKENING_U_RGB = [0.5, 0.6, 0.9] as const;

/**
 * granulation fbm 입력 배율 — 쌀알(granule) 크기. 클수록 촘촘.
 * 단위 구면 좌표 × SCALE 이 fbm 격자 입력 — 48 이면 disk 지름 방향 ~96 셀 (실제 태양 광구의
 * "쌀알" 인상 재현, 화면 실측 튜닝 결과 출발값 유지 — PR 본문 근거 박제).
 */
export const GRANULATION_SCALE = 48;

/**
 * granulation 변조 진폭 (±). 실제 granule 명암 대비는 낮다 (~수 %) — base 색 (colorHint.hex
 * #FFE9A8 실측) 보존 우선 (#756 상수 철학 동형). 0 이면 단색과 동일, 과도하면 base 가 묻힘.
 */
export const GRANULATION_CONTRAST = 0.12;

// ─────────────────────────────────────────────────────────────────────────────
// #1412 흑점 — rendering-only 상수 SSoT (ADR 20261025-1412 결정 7: 색 · 반경비 · 필라멘트 · 배율은 본 모듈).
// 출처 계수 · 극소 표 · 신생률 · 감쇠 주파수는 `sunspots.ts` 소유.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 흑점 크기 배율 — **각반경**에 곱한다 (면적으로는 6.25 배, 결정 1 · 사용자 Q2). 표시 근사다 (Visual Fidelity — 정보 카드
 * 반지름은 실측 그대로). 수명 · 정렬 · 상한 판정은 물리 면적으로 하고, 배율은 uniform 기록 직전에만 곱한다.
 */
export const SUNSPOT_SIZE_EXAGGERATION = 2.5;

/**
 * 본영 · 반영의 조용한 광구 대비 파장 적분 휘도비 — 본영 약 20 % · 반영 약 75 % (Solanki, Inhester & Schüssler 2006,
 * *Rep. Prog. Phys.* 69:563 §6.1).
 */
export const UMBRA_LUMINANCE_RATIO = 0.2;
export const PENUMBRA_LUMINANCE_RATIO = 0.75;

/** 태양 유효온도 [K] — IAU 2015 Resolution B3 (nominal). 휘도비 → 온도 (Stefan–Boltzmann `T = T☉ · 비^¼`) 의 기준. */
export const SUN_EFFECTIVE_TEMPERATURE_K = 5772;

/** 채널 대표 파장 [µm] — R 610 · G 550 · B 465 nm. **렌더 선택**이다 (출처 값 아님, 결정 4). */
export const SUNSPOT_CHANNEL_WAVELENGTHS_UM = [0.61, 0.55, 0.465] as const;

/** 제2 복사 상수 `c₂ = hc/k` [µm·K] (CODATA). Planck 비 계산용. */
const PLANCK_C2_UM_K = 14387.77;

/**
 * Planck 비 `B(λ, T) / B(λ, T_ref)` — 같은 파장에서 온도 T 의 분광 복사휘도를 기준 온도 대비로 (결정 4 유도식).
 * `B ∝ 1 / (exp(c₂/λT) − 1)` 이라 상수 인자는 소거된다.
 */
export function planckChannelRatio(
  lambdaUm: number,
  temperatureK: number,
  referenceK: number,
): number {
  return (
    (Math.exp(PLANCK_C2_UM_K / (lambdaUm * referenceK)) - 1) /
    (Math.exp(PLANCK_C2_UM_K / (lambdaUm * temperatureK)) - 1)
  );
}

/** 휘도비 → 채널 인자 RGB: `T = 5772 K × 비^¼` 의 Planck 비를 대표 파장 3개에서 (결정 4). */
function spotChannelFactors(luminanceRatio: number): readonly [number, number, number] {
  const t = SUN_EFFECTIVE_TEMPERATURE_K * Math.pow(luminanceRatio, 0.25);
  const [r, g, b] = SUNSPOT_CHANNEL_WAVELENGTHS_UM;
  return [
    planckChannelRatio(r, t, SUN_EFFECTIVE_TEMPERATURE_K),
    planckChannelRatio(g, t, SUN_EFFECTIVE_TEMPERATURE_K),
    planckChannelRatio(b, t, SUN_EFFECTIVE_TEMPERATURE_K),
  ];
}

/** 본영 채널 인자 (3860 K) — 약 `(0.130, 0.105, 0.070)`. */
export const UMBRA_RGB = spotChannelFactors(UMBRA_LUMINANCE_RATIO);
/** 반영 채널 인자 (5371 K) — 약 `(0.734, 0.711, 0.669)`. */
export const PENUMBRA_RGB = spotChannelFactors(PENUMBRA_LUMINANCE_RATIO);

/** 본영 반경 / 반영 반경 = `1/√5.5` — 반영 면적이 본영의 4~5 배 → 전체 5~6 배의 중간 (Solanki 2006 §6.1). */
export const UMBRA_RADIUS_RATIO = 1 / Math.sqrt(5.5);

/** 테두리 smoothstep 안쪽 경계 (반경 비례) — 반영 0.8~1.0 · 본영 0.6~1.0 (POC 시안 C). */
export const PENUMBRA_EDGE_INNER = 0.8;
export const UMBRA_EDGE_INNER = 0.6;

/** 반영 안의 granulation 억제 비율 — `granulation′ = mix(granulation, 1, max(본영, 반영 × 0.7))` (결정 4). */
export const PENUMBRA_GRANULATION_SUPPRESSION = 0.7;

/** 반영 필라멘트 대비 (±) — 시안 C 승인값 (사용자 Q8). */
export const FILAMENT_CONTRAST = 0.35;
/** 필라멘트 방위 주파수 — 단위 방위 벡터 × 9 가 noise 입력 (시안 C 와 같은 줄무늬 밀도). */
export const FILAMENT_AZIMUTH_FREQUENCY = 9.0;
/** 필라멘트 noise 시드 배율 — `dot(c, sunAxis) × 17` (흑점마다 다른 noise 단면, 시안 C 의 17). */
export const FILAMENT_SEED_SCALE = 17.0;

/** GLSL 실수 리터럴 (정수값도 `.0` 을 붙인다 — GLSL ES 는 int → float 암묵 변환이 없다). */
function glslFloat(n: number): string {
  return Number.isInteger(n) ? `${n}.0` : `${n}`;
}

/** shader 이름 prefix — ShadersStore key 충돌 방지 (ring/starfield/planet 패턴 답습). */
const SHADER_NAME = 'sunSurface';

/**
 * GLSL vertex shader — local position (granulation 기준) + world normal / world position
 * (limb darkening 기준) 을 fragment 로 전달.
 *
 * **vLocalPos = local 구면 좌표** — granulation 패턴의 기준 (painted-on — ADR §결정 3).
 * tier scale / floating-origin shift 에 표면 패턴이 mesh 와 함께 움직인다. world 변환 금지.
 *
 * **vNormal = world normal (#782 옵션 e 규약 답습)** — `normalize((world * vec4(normal,0)).xyz)`.
 * limb darkening 의 viewDir(world) 와 dot 정합에 필요. sun 은 현재 회전 identity 지만 미래
 * 자전 데이터 추가 시 셰이더 무수정 안전. uniform scale 전제라 world 곱 후 normalize 로 충분
 * (normalMatrix inverse-transpose 불요 — planet Amendment 2 cross-validate Q2 합의 동형).
 *
 * **vWorldPos** — viewDir = normalize(cameraPosition − vWorldPos) 용 (per-fragment 정확 시선각.
 * floating-origin 으로 sun 이 원점 근처지만 focus=sun 근접 시 disk 가 대면적이라 per-vertex
 * 근사 대신 per-fragment 로 μ 프로파일 정확도 확보).
 *
 * log-depth 를 위해 clip-space w 도 전달 (ring #641 / planet #756 선례 — ADR §결정 7).
 */
const VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 worldViewProjection;
// #782 옵션 e 규약 답습 — world matrix (Babylon auto-bind). vNormal 을 world 공간으로 변환해
// viewDir(world) 와 dot 정합 (limb darkening μ). uniform scale + 순수 회전이라 world 곱 후
// normalize 로 충분. ⚠️ jd/큰 수 uniform 은 넘기지 않는다 (float32 jitter 차단 — #782 규약).
uniform mat4 world;

varying vec3 vLocalPos;
varying vec3 vNormal;
varying vec3 vWorldPos;
// ADR §결정 7 — 로그 depth: scene 이 enableLogarithmicDepth 로 StandardMaterial(다른 body)을
// 로그 depth 공간에 기록하는데, 커스텀 ShaderMaterial 이 표준 z 를 쓰면 depth 비교 공간이
// 불일치 → 태양이 수성/금성 통과 시 항상 위로 그려진다. fragment 에서 gl_FragDepth 를 로그
// 공간으로 기록한다 (ring #641 / planet #756 실증 패턴 복제).
varying float vFragmentDepth;

void main(void) {
  // local 구면 좌표 — granulation 패턴의 기준 (painted-on, ADR §결정 3 — world 변환 금지).
  vLocalPos = normalize(position);
  // #782 옵션 e — world normal (limb darkening viewDir 와 동일 world 좌표계 dot 정합). w=0 으로
  // 변환해 translation 무시 (방향 벡터), uniform scale 이므로 normalize 로 스케일 정규화.
  vNormal = normalize((world * vec4(normal, 0.0)).xyz);
  // world position — per-fragment viewDir 계산 기준 (cameraPosition − vWorldPos).
  vWorldPos = (world * vec4(position, 1.0)).xyz;
  vec4 clip = worldViewProjection * vec4(position, 1.0);
  gl_Position = clip;
  vFragmentDepth = 1.0 + clip.w;
}
`;

/**
 * GLSL fragment shader — emissive 전용: base 발광색 × granulation × limb darkening.
 *
 * **광원 uniform 0 (ADR §결정 4)** — 씬 광원을 참조하지 않으므로 fragment 출력이 곧 발광색
 * (자동 무광). planet 셰이더의 shade(외부광 재현) 합성이 **의도적으로 없다** — 태양은
 * self-luminous 라 외부광 명암이 무의미 (태양 자신이 그 PointLight 의 광원).
 *
 * uniforms:
 *   - baseColor: 실측 색 (colorHint.hex #FFE9A8) — 발광의 기준 (데이터 SSoT, read-only).
 *   - limbDarkeningU: 채널별 u 계수 (감광 + 색온도 동시 — LIMB_DARKENING_U_RGB SSoT).
 *   - granulationScale / granulationContrast: 쌀알 크기/진폭 (rendering-only 미학 상수 SSoT).
 *   - cameraPosition: Babylon 표준 auto-bind (viewDir 용 — scene.activeCamera.globalPosition).
 *   - logDepthConstant: Babylon logDepth 정합 상수 (ADR §결정 7).
 *
 * **switch-case 금지** (WGSL 변환 깨짐 — #756 이견 수용 1). 분기 자체가 없는 단일 경로 셰이더.
 */
const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vLocalPos;
varying vec3 vNormal;
varying vec3 vWorldPos;
varying float vFragmentDepth;

uniform vec3 baseColor;
uniform vec3 limbDarkeningU;
uniform float granulationScale;
uniform float granulationContrast;
uniform vec3 cameraPosition;
uniform float logDepthConstant;
// #1412 흑점 (ADR 20261025-1412 결정 1 · 4). xyz = 장면 단위벡터 중심 · w = 반영 각반경 (×2.5 적용 후).
uniform vec4 spots[${SUNSPOT_MAX}];
uniform float spotCount;
// 결정 3 — 광과민성 감쇠 가시도 0~1 (프레임 위상이 매 프레임 쓴다).
uniform float spotVisibility;
// 결정 4 — 필라멘트 접선 기저 · noise 시드의 기준 (태양 자전축, 장면 좌표 상수).
uniform vec3 sunAxis;
uniform vec3 umbraRgb;
uniform vec3 penumbraRgb;
uniform float umbraRadiusRatio;
uniform float filamentContrast;

// 3D hash — sin-free fract-mix (procedural-planet-shader.ts 와 동일 텍스트 — JS 미러 fbmMirror
// 재사용 계약. 한쪽 수정 시 양쪽 + 미러 동기화 의무, sun-shader.test.ts 정적 가드).
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float hash13(vec3 p) {
  return hash33(p).x;
}

// 3D value noise — trilinear smoothstep 보간 (planet/starfield 와 동일 텍스트).
float valueNoise(vec3 p) {
  vec3 i = floor(p);
  vec3 f = fract(p);
  vec3 u = f * f * (3.0 - 2.0 * f);
  return mix(
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 0.0)), hash13(i + vec3(1.0, 0.0, 0.0)), u.x),
      mix(hash13(i + vec3(0.0, 1.0, 0.0)), hash13(i + vec3(1.0, 1.0, 0.0)), u.x),
      u.y
    ),
    mix(
      mix(hash13(i + vec3(0.0, 0.0, 1.0)), hash13(i + vec3(1.0, 0.0, 1.0)), u.x),
      mix(hash13(i + vec3(0.0, 1.0, 1.0)), hash13(i + vec3(1.0, 1.0, 1.0)), u.x),
      u.y
    ),
    u.z
  );
}

// 3-옥타브 fbm — granulation 결 (planet 셰이더와 동일 텍스트 — fbmMirror 계약).
float fbm(vec3 p) {
  return 0.55 * valueNoise(p) + 0.30 * valueNoise(p * 2.3) + 0.15 * valueNoise(p * 4.7);
}

void main(void) {
  vec3 p = normalize(vLocalPos);
  vec3 N = normalize(vNormal);

  // ── limb darkening (ADR §결정 2) — Eddington 근사 I(μ) = 1 − u(1−μ) ──────────
  // μ = dot(N, viewDir): disk 중심 1 → 가장자리 0. 채널별 u (u_R < u_G < u_B) 로 blue 가
  // 더 감광 → 가장자리가 자동으로 주황 (색온도 그라데이션 — 별도 색 mix 불요).
  vec3 viewDir = normalize(cameraPosition - vWorldPos);
  float mu = clamp(dot(N, viewDir), 0.0, 1.0);
  vec3 limb = vec3(1.0) - limbDarkeningU * (1.0 - mu);

  // ── granulation (ADR §결정 2·3) — painted-on 정적 fbm 변조 (vLocalPos 기준) ──
  // (fbm − 0.5) × 2 × contrast — 평균 0 근처 변조로 base 발광색 보존 (#756 상수 철학).
  float granule = fbm(p * granulationScale);
  float granulation = 1.0 + (granule - 0.5) * 2.0 * granulationContrast;

  // ── #1412 흑점 (ADR 20261025-1412 결정 1 · 4) — 상수 상한 루프 + 원판 판정 (현 거리 length(p − c)) ──
  // 반영이 가장 진한 흑점 하나의 필라멘트만 쓴다 (겹침 시). spotCount = 0 이면 첫 반복에서 빠진다.
  float penMask = 0.0;
  float umbMask = 0.0;
  float fil = 0.0;
  for (int i = 0; i < ${SUNSPOT_MAX}; i++) {
    if (float(i) >= spotCount) break;
    vec4 spot = spots[i];
    vec3 c = spot.xyz;
    float rP = spot.w;
    vec3 dv = p - c;
    float d = length(dv);
    if (d < rP) {
      float pen = 1.0 - smoothstep(rP * ${glslFloat(PENUMBRA_EDGE_INNER)}, rP, d);
      float rU = rP * umbraRadiusRatio;
      float umb = 1.0 - smoothstep(rU * ${glslFloat(UMBRA_EDGE_INNER)}, rU, d);
      if (pen > penMask) {
        penMask = pen;
        // 반영 필라멘트 — 방위각만의 noise (반경 방향으로 늘어진 줄무늬). 접선 기저는 자전축에 고정한다:
        // t = 동서, b = 남북. 흑점이 자전축 둘레로 돌면 t · b 도 같이 돌아 무늬가 흑점에 붙어 다닌다 (결정 4).
        // |cross(sunAxis, c)| = cos(위도) ≥ 0.707 (위도 < 45° — sunspots.test.ts D3) 라 특이점 분기가 없다.
        vec3 t = normalize(cross(sunAxis, c));
        vec3 b = cross(c, t);
        vec2 az = vec2(dot(dv, t), dot(dv, b));
        az = az / max(length(az), 1e-6);
        // 시드 = sin(위도) — 흑점 수명 동안 상수 (배열 index 는 정렬로 바뀔 수 있어 쓰지 않는다).
        fil = valueNoise(vec3(az * ${glslFloat(FILAMENT_AZIMUTH_FREQUENCY)}, dot(c, sunAxis) * ${glslFloat(FILAMENT_SEED_SCALE)})) - 0.5;
      }
      umbMask = max(umbMask, umb);
    }
  }
  vec3 spotFactor = mix(vec3(1.0), penumbraRgb * (1.0 + filamentContrast * fil), penMask);
  spotFactor = mix(spotFactor, umbraRgb, umbMask);
  // 결정 3 — 감쇠. granulation 억제도 같은 가시도로 (가시도 0 = 흑점 없는 픽셀과 같은 식).
  spotFactor = mix(vec3(1.0), spotFactor, spotVisibility);
  granulation = mix(granulation, 1.0, max(umbMask, penMask * ${glslFloat(PENUMBRA_GRANULATION_SUPPRESSION)}) * spotVisibility);

  // emissive 합성 — 광원 shade 없음 (ADR §결정 4). 출력이 곧 발광색. 흑점도 limb darkening 을 받는다 (#1412 결정 4).
  vec3 col = baseColor * granulation * spotFactor * limb;
  // 안전 clamp — u ≤ 1 이라 limb ≥ 0 구조 보장이지만 granulation 상향 변조 (>1) 의 [0,1]
  // 이탈만 보정 (흰색 saturate — warm 색역 유지, 테스트 가드).
  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);

  // ADR §결정 7 — 본체(StandardMaterial useLogarithmicDepth)와 동일한 로그 depth 공간 기록.
  ${LOG_DEPTH_FRAGMENT_WRITE_GLSL}
}
`;

let shaderRegistered = false;

/** #1412 — `createSunSurfaceMaterial` 이 만든 머티리얼 집합 (planet `isProceduralPlanetMaterial` 동형 — WeakSet 이라 GC 무간섭). */
const sunSurfaceMaterials = new WeakSet<ShaderMaterial>();

/** #1412 — 이 머티리얼이 태양 절차 표면 머티리얼인가 (흑점 uniform 을 받는가). */
export function isSunSurfaceMaterial(material: unknown): material is ShaderMaterial {
  return material instanceof ShaderMaterial && sunSurfaceMaterials.has(material);
}

/**
 * GLSL shader 를 Babylon `Effect.ShadersStore` 에 1회 등록 (ring/starfield/planet 패턴 답습).
 * high/mid variant 가 단일 셰이더 공유 (ShadersStore 1회, 컴파일 1회).
 */
function registerSunShader(): void {
  if (shaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER;
  shaderRegistered = true;
}

/**
 * #774 — 태양 emissive 절차 표면 ShaderMaterial 생성 (high/mid 공유).
 *
 * star 전용 팩토리 — planet 팩토리와 달리 테이블 조회가 없다 (**무조건 생성, null 반환 없음** —
 * 호출부 `createBodyMesh`/`createBodyMeshMid` 의 star 분기가 `surfaceDetail=true` 일 때만 호출.
 * ADR §결정 1 — `SURFACE_TYPE_BY_BODY` 는 "외부광 반사 표면" 전용으로 sun 미등록 유지).
 *
 * 광원 인자 (`surfaceLighting`) 를 받지 않는다 — emissive 전용 (ADR §결정 4). base color 는
 * `body.colorHint.hex` (실측 #FFE9A8) 를 read-only uniform 으로 전달 (데이터 SSoT 불변).
 *
 * @param scene Babylon 씬 (logDepthConstant 용 activeCamera.maxZ 참조)
 * @param body 대상 body (colorHint.hex 사용 — sun)
 * @param name 머티리얼 이름 (high/mid 구분용)
 * @returns ShaderMaterial (emissive 전용 — 씬 광원과 무간섭)
 */
export function createSunSurfaceMaterial(
  scene: Scene,
  body: LoadedCelestialBody,
  name: string,
): ShaderMaterial {
  registerSunShader();

  const material = new ShaderMaterial(
    name,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position', 'normal'],
      uniforms: [
        'worldViewProjection',
        // #782 옵션 e 규약 — world matrix auto-bind (vNormal world 변환 + vWorldPos).
        'world',
        // Babylon 표준 auto-bind — uniforms 배열 선언 시 bind 단계에서
        // scene.activeCamera.globalPosition 자동 설정 (shaderMaterial.js 실측 확인, ADR §결정 8).
        // 미동작 시 limb darkening radial 프로파일이 평탄해져 브라우저 실측에서 즉시 노출 —
        // 그 경우 onBind 갱신 폴백 (planet uSunDirection 패턴) 으로 전환.
        'cameraPosition',
        'baseColor',
        'limbDarkeningU',
        'granulationScale',
        'granulationContrast',
        'logDepthConstant',
        // #1412 흑점 (ADR 20261025-1412 결정 1 · 3 · 4).
        'spots',
        'spotCount',
        'spotVisibility',
        'sunAxis',
        'umbraRgb',
        'penumbraRgb',
        'umbraRadiusRatio',
        'filamentContrast',
      ],
    },
  );
  sunSurfaceMaterials.add(material);

  // base color (실측 colorHint.hex #FFE9A8) — 발광의 기준 (데이터 SSoT, read-only).
  const hex = body.colorHint?.hex ?? '#FFE9A8';
  material.setColor3('baseColor', hexToColor3(hex));

  // rendering-only 미학 상수 SSoT 전달 (ADR §결정 8).
  material.setVector3(
    'limbDarkeningU',
    new Vector3(LIMB_DARKENING_U_RGB[0], LIMB_DARKENING_U_RGB[1], LIMB_DARKENING_U_RGB[2]),
  );
  material.setFloat('granulationScale', GRANULATION_SCALE);
  material.setFloat('granulationContrast', GRANULATION_CONTRAST);

  // ADR §결정 7 — 로그 depth 상수 (Babylon logDepth 공식: 2 / log2(maxZ + 1)).
  // maxZ 는 setupArcRotateCamera 가 1e14 로 고정 (ring/planet 과 동일 선례). 카메라 부재
  // (테스트 등) 시 1e14 fallback.
  const maxZ = scene.activeCamera?.maxZ ?? 1e14;
  material.setFloat('logDepthConstant', 2.0 / (Math.log(maxZ + 1.0) / Math.LN2));

  // #1412 — 흑점 없음으로 시작한다 (`spotCount = 0`). 목록은 장면이 시간 위상 (`updateAt`) 에서 쓰고 (`setArray4` 에
  // 장면 버퍼를 다시 묶는다), 가시도는 프레임 위상이 쓴다. 상수 uniform 은 여기서 한 번.
  material.setArray4('spots', new Array<number>(4 * SUNSPOT_MAX).fill(0));
  material.setFloat('spotCount', 0);
  material.setFloat('spotVisibility', 1);
  material.setVector3(
    'sunAxis',
    new Vector3(SUN_AXIS_SCENE[0], SUN_AXIS_SCENE[1], SUN_AXIS_SCENE[2]),
  );
  material.setVector3('umbraRgb', new Vector3(UMBRA_RGB[0], UMBRA_RGB[1], UMBRA_RGB[2]));
  material.setVector3(
    'penumbraRgb',
    new Vector3(PENUMBRA_RGB[0], PENUMBRA_RGB[1], PENUMBRA_RGB[2]),
  );
  material.setFloat('umbraRadiusRatio', UMBRA_RADIUS_RATIO);
  material.setFloat('filamentContrast', FILAMENT_CONTRAST);

  return material;
}

// ─────────────────────────────────────────────────────────────────────────────
// #1412 — 기록기 (생성기 + 변환기 → vec4 배열)
// ─────────────────────────────────────────────────────────────────────────────

/** 기록기 scratch — 생성기 출력 (모듈 재사용, 호출당 할당 0). */
const writerSpots = createHeliographicSpots();

/**
 * #1412 기록기 — 장면 시계 jd 의 흑점을 `vec4` 배열 `out` (길이 `4 × SUNSPOT_MAX`) 에 쓰고 개수를 반환한다 (할당 0).
 * `out[4i..4i+2]` = 장면 단위벡터 중심, `out[4i+3]` = `2.5 × √(2·10⁻⁶·A(t))` (반영 각반경, 결정 1). 개수 뒤는 0 으로 채운다.
 */
export function writeSunspotUniforms(jd: number, out: number[]): number {
  const n = generateHeliographicSunspots(jd, writerSpots);
  for (let i = 0; i < n; i++) {
    heliographicToScene(writerSpots.latDeg[i]!, writerSpots.lonDeg[i]!, out, 4 * i);
    out[4 * i + 3] = SUNSPOT_SIZE_EXAGGERATION * writerSpots.radiusRad[i]!;
  }
  for (let k = 4 * n; k < 4 * SUNSPOT_MAX; k++) out[k] = 0;
  return n;
}

// ─────────────────────────────────────────────────────────────────────────────
// GLSL 의 순수 JS 미러 (단위 테스트 SSoT 가드 — #719 교훈 + planet surfaceColorMirror 패턴).
//
// fbm 미러는 procedural-planet-shader.ts 의 `fbmMirror` 를 **재사용**한다 (volt #21 — 중복
// 구현 금지. GLSL 텍스트가 planet 과 동일하므로 미러도 동일해야 한다 — 정적 계약 가드).
// ⚠️ 이 미러 함수들과 FRAGMENT_SHADER 의 GLSL 은 동일 식이어야 한다 (한쪽 수정 시 양쪽 동기화).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * limb darkening GLSL (`vec3(1.0) − limbDarkeningU × (1 − μ)`) 의 JS 미러.
 *
 * @param mu 시선각 cos (dot(N, viewDir)) — [0,1] 밖 입력은 GLSL clamp 와 동일하게 clamp.
 * @returns 채널별 limb 감광 계수 RGB (중심 μ=1 → [1,1,1], 가장자리 μ=0 → 1−u)
 */
export function limbDarkeningMirror(mu: number): readonly [number, number, number] {
  const m = Math.min(Math.max(mu, 0), 1);
  return [
    1 - LIMB_DARKENING_U_RGB[0] * (1 - m),
    1 - LIMB_DARKENING_U_RGB[1] * (1 - m),
    1 - LIMB_DARKENING_U_RGB[2] * (1 - m),
  ];
}

/**
 * #774 — FRAGMENT_SHADER 합성식 (`baseColor × granulation × limb`) 의 **순수 JS 미러**.
 *
 * 주어진 구면 좌표 + 시선각 μ 에 대해 최종 발광 RGB 를 반환한다. GLSL 과 동일 식 —
 * 결정성 / limb 단조성 / warm 색역 (R ≥ B — 보라·마젠타 부재) / 상수 SSoT 를 결정적으로
 * 검증한다 (planet surfaceColorMirror 패턴).
 *
 * ⚠️ FRAGMENT_SHADER 의 GLSL 과 동일 식이어야 한다 (SSoT — 한쪽 수정 시 양쪽 동기화).
 *
 * @param baseColor 실측 base 발광색 RGB ∈ [0,1]³ (colorHint.hex)
 * @param p 정규화 구면 좌표 [x,y,z] (단위 벡터 가정 — granulation 기준)
 * @param mu 시선각 cos (disk 중심 1 → 가장자리 0)
 * @returns 발광 RGB ∈ [0,1]³ (clamp 적용)
 */
export function sunColorMirror(
  baseColor: readonly [number, number, number],
  p: readonly [number, number, number],
  mu: number,
): readonly [number, number, number] {
  const granule = fbmMirror(
    p[0] * GRANULATION_SCALE,
    p[1] * GRANULATION_SCALE,
    p[2] * GRANULATION_SCALE,
  );
  const granulation = 1 + (granule - 0.5) * 2 * GRANULATION_CONTRAST;
  const limb = limbDarkeningMirror(mu);
  const clamp01 = (n: number): number => Math.min(Math.max(n, 0), 1);
  return [
    clamp01(baseColor[0] * granulation * limb[0]),
    clamp01(baseColor[1] * granulation * limb[1]),
    clamp01(baseColor[2] * granulation * limb[2]),
  ];
}

/** GLSL `smoothstep` 의 JS 미러 (edge0 < edge1 가정). */
function smoothstepMirror(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * #1412 — 흑점 한 개의 FRAGMENT_SHADER 흑점 합성 (`spotFactor` · granulation 억제 가중치) 의 **순수 JS 미러**.
 *
 * @param chordDist 표면점 ↔ 흑점 중심 현 거리 `length(p − c)`
 * @param penumbraRadius 반영 각반경 (uniform `w` — 배율 적용 후)
 * @param filamentNoise GLSL `valueNoise(...) − 0.5` 값 (필라멘트 — noise 미러는 planet 쪽 비공개라 입력으로 받는다)
 * @param visibility 감쇠 가시도 0~1
 * @returns `factor` = 채널 인자 RGB, `granulationWeight` = `mix(granulation, 1, w)` 의 w
 * ⚠️ FRAGMENT_SHADER 와 같은 식이어야 한다 (한쪽 수정 시 양쪽 동기화).
 */
export function sunspotShadeMirror(
  chordDist: number,
  penumbraRadius: number,
  filamentNoise: number,
  visibility: number,
): { factor: readonly [number, number, number]; granulationWeight: number } {
  let pen = 0;
  let umb = 0;
  if (chordDist < penumbraRadius) {
    pen = 1 - smoothstepMirror(penumbraRadius * PENUMBRA_EDGE_INNER, penumbraRadius, chordDist);
    const rU = penumbraRadius * UMBRA_RADIUS_RATIO;
    umb = 1 - smoothstepMirror(rU * UMBRA_EDGE_INNER, rU, chordDist);
  }
  const fil = pen > 0 ? filamentNoise : 0;
  const mix = (a: number, b: number, w: number): number => a * (1 - w) + b * w;
  const factor = [0, 1, 2].map((ch) => {
    const penCh = PENUMBRA_RGB[ch]! * (1 + FILAMENT_CONTRAST * fil);
    const f = mix(mix(1, penCh, pen), UMBRA_RGB[ch]!, umb);
    return mix(1, f, visibility);
  }) as unknown as readonly [number, number, number];
  return {
    factor,
    granulationWeight: Math.max(umb, pen * PENUMBRA_GRANULATION_SUPPRESSION) * visibility,
  };
}

/**
 * #1412 — 필라멘트 접선 기저 GLSL (`t = normalize(cross(sunAxis, c))` · `b = cross(c, t)`) 의 JS 미러.
 * 흑점이 자전축 둘레로 돌면 `t` · `b` 도 같은 회전으로 돈다 (결정 4 — 무늬가 흑점에 붙어 다님).
 */
export function sunspotFilamentBasisMirror(
  c: readonly [number, number, number],
  axis: readonly [number, number, number],
): { t: [number, number, number]; b: [number, number, number] } {
  const tx = axis[1] * c[2] - axis[2] * c[1];
  const ty = axis[2] * c[0] - axis[0] * c[2];
  const tz = axis[0] * c[1] - axis[1] * c[0];
  const len = Math.hypot(tx, ty, tz);
  const t: [number, number, number] = [tx / len, ty / len, tz / len];
  const b: [number, number, number] = [
    c[1] * t[2] - c[2] * t[1],
    c[2] * t[0] - c[0] * t[2],
    c[0] * t[1] - c[1] * t[0],
  ];
  return { t, b };
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트/검증용 re-export (sun-shader.test.ts SSoT 가드 — #69 drift 차단).
// ─────────────────────────────────────────────────────────────────────────────
export {
  // GLSL 소스 (테스트가 switch 부재 / log-depth / world normal 배선 / noise 텍스트 동일성 정적 검증).
  VERTEX_SHADER as SUN_VERTEX_SHADER,
  FRAGMENT_SHADER as SUN_FRAGMENT_SHADER,
};
