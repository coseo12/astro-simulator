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
 */

import { Effect, ShaderMaterial, Vector3, type Scene } from '@babylonjs/core';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import { fbmMirror } from './procedural-planet-shader.js';
import { hexToColor3 } from './color-utils.js';

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

  // emissive 합성 — 광원 shade 없음 (ADR §결정 4). 출력이 곧 발광색.
  vec3 col = baseColor * granulation * limb;
  // 안전 clamp — u ≤ 1 이라 limb ≥ 0 구조 보장이지만 granulation 상향 변조 (>1) 의 [0,1]
  // 이탈만 보정 (흰색 saturate — warm 색역 유지, 테스트 가드).
  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);

  // ADR §결정 7 — 본체(StandardMaterial useLogarithmicDepth)와 동일한 로그 depth 공간 기록.
  gl_FragDepth = log2(max(vFragmentDepth, 1e-6)) * logDepthConstant * 0.5;
}
`;

let shaderRegistered = false;

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
      ],
    },
  );

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

  return material;
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

// ─────────────────────────────────────────────────────────────────────────────
// 테스트/검증용 re-export (sun-shader.test.ts SSoT 가드 — #69 drift 차단).
// ─────────────────────────────────────────────────────────────────────────────
export {
  // GLSL 소스 (테스트가 switch 부재 / log-depth / world normal 배선 / noise 텍스트 동일성 정적 검증).
  VERTEX_SHADER as SUN_VERTEX_SHADER,
  FRAGMENT_SHADER as SUN_FRAGMENT_SHADER,
};
