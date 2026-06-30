/**
 * #756 — 절차적 행성 표면 셰이더 (1차: 인프라 + 대표 4개, 라이브러리/에셋 0).
 *
 * **목적**: 단색 `StandardMaterial.diffuseColor` 로 렌더되는 행성에 절차적 표면 디테일을
 * 부여해 몰입을 강화한다 (방향성 기획 트랙 A — `principles.md §1 Visual Fidelity`). 외부
 * 텍스처 에셋 / 신규 라이브러리 0. `ring-shader.ts` / `starfield.ts` 의 절차적 ShaderMaterial
 * 구조를 답습한다.
 *
 * **설계 근거**: ADR `docs/decisions/20260628-756-procedural-planet-surface.md`
 *   - §결정 1 — 신규 모듈 (ring/starfield 답습). high/mid 공유 ShaderMaterial (segments 만 다름),
 *     low (billboard) 미적용.
 *   - §결정 2 — 표면 타입 소스 = 코드 상수 테이블 `SURFACE_TYPE_BY_BODY` (데이터 SSoT 불변).
 *     셰이더 내부 = 단일 셰이더 + `uniform int surfaceType` + **if-else 분기** (switch 금지 —
 *     Babylon GLSL→WGSL 변환 깨짐, cross-validate 이견 수용 1).
 *   - §결정 3 — high/mid 적용, low + tier-c (`forceOverride:'low'`) 자동 단색 (별도 코드 0).
 *   - §결정 4 — `?surface=off` = StandardMaterial 현행 복귀 (생성 시점 분기, scene 옵션).
 *   - §결정 5 — `colorHint.hex` → `uniform vec3 baseColor`, 절차 변조는 그 위에 합성.
 *
 * **Amendment 1 (#773/#775) — 광원 일관성 회귀 + 지구 대륙 mix** (ADR §Amendment 1):
 *   - §A1.3 결정 1 — 고정 방향 명암 (`shade = 0.85 + 0.15 * dot(N, fixed)`) 을 **실제 태양 방향**
 *     기반 명암으로 교체. `uniform vec3 uSunDirection` 을 `createProceduralPlanetMaterial` 의
 *     `onBindObservable` 클로저에서 각 draw 직전 `normalize(sunPos − meshPos)` 로 갱신.
 *     body mesh 회전 0 (self-rotation 미구현) + uniform scaling → world normal == local normal →
 *     `vNormal` (local) 을 그대로 dot 에 사용 (normalMatrix 불필요).
 *   - §A1.3 결정 2 — **HemisphericLight 식 완전 재현** (`mix(ground, sky, dot(N,up)*0.5+0.5)`) +
 *     PointLight diffuse (`sunIntensity * sunDiffuse * smoothstep(0, W, dot(N, sunDir))`). 단색 행성
 *     (StandardMaterial + PointLight 2.5 + HemisphericLight ambient) 과 시각 일치 (밤면/terminator/극).
 *   - §A1.3 결정 4 (#775) — rocky 분기를 `mix(oceanColor, landColor, landMask)` 로 교체 (대륙 색 구분).
 *
 * ⚠️ **회전 0 전제 (drift 가드)**: 본 광원 모델은 "body mesh 회전 0 + uniform scaling" 에 의존한다
 *   (world normal == local normal). self-rotation / axialTilt 도입 시 `vNormal` 을 world matrix 로
 *   변환해야 한다 (ADR §A1.3 결정 1 옵션 e 전환). onBind 의 dev-only 회전 어서션이 조기 감지.
 *
 * **광원 물리 상수 SSoT 주입**: sun intensity/diffuse + ambient intensity/ground/sky/up 은
 *   `solar-system-scene.ts` 가 SSoT 로 소유한다 (PointLight/HemisphericLight 와 동일 값 — 마법 숫자
 *   중복 금지, volt #69). 셰이더는 scene 를 import 하지 않고 (순환 회피) `createProceduralPlanetMaterial`
 *   인자로 주입받아 uniform 으로 설정한다 (단방향 의존). soft terminator / 육지색 등 rendering-only
 *   미학 상수는 본 셰이더 모듈이 SSoT.
 *
 * **표면 타입 4종 (§결정 5)**:
 *   - rocky (지구) — base 위 대륙/해양 대비 (저주파 noise) + 미세 명암.
 *   - desert (화성) — base 위 dust/협곡 결 (fbm) + 산화철 톤 변조.
 *   - gas-bands (목성) — base 위 위도 밴드 (latitude 변조) + 난류 결.
 *   - cratered (달) — base 위 크레이터 (cell noise 점 분포) + 명암.
 *
 * **WebGPU↔WebGL parity**: ShaderMaterial GLSL 은 양 백엔드 동작 (ring/starfield 선례 — Babylon
 *   GLSL→WGSL 변환). WGSL 별도 작성 불필요. WebGL1 미지원 (tier 시스템 전제, ring/starfield 정합).
 *
 * **log-depth 정합 (§핵심 위험 1, ring-shader #641 D-T2 선례)**: scene 이 `enableLogarithmicDepth`
 *   로 본체 StandardMaterial 을 로그 depth 공간에 기록한다. 커스텀 ShaderMaterial 이 표준 z 를
 *   쓰면 depth 비교 공간이 불일치 → 표면이 항상 다른 body 위로 그려지는 가림 버그. fragment 에서
 *   `gl_FragDepth` 를 Babylon logDepth 공식으로 기록해 정합.
 */

import { Color3, Effect, ShaderMaterial, Vector3, type Mesh, type Scene } from '@babylonjs/core';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';

// ─────────────────────────────────────────────────────────────────────────────
// 표면 타입 enum ↔ uniform int 매핑 SSoT (#756 §결정 2).
//
// JS enum 값이 곧 GLSL `uniform int surfaceType` 정수다. drift 가 발생하면 셰이더 분기가
// 엉뚱한 표면을 그린다 (조용한 회귀). procedural-planet-shader.test.ts 가 enum↔int 매핑 SSoT
// 를 가드한다 (ring-shader MAX_ARCS parity #728 패턴).
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 표면 타입 — `uniform int surfaceType` 의 정수 값과 1:1 대응 (SSoT).
 *
 * ⚠️ 이 정수 값은 FRAGMENT_SHADER 의 `if (uSurfaceType == N)` 분기와 동일해야 한다
 * (한쪽 수정 시 양쪽 동기화 의무 — 테스트 가드 대상).
 */
export enum SurfaceType {
  /** 암석형 — 대륙/해양 대비 (지구). */
  Rocky = 0,
  /** 사막형 — dust/협곡 결 + 산화철 톤 (화성). */
  Desert = 1,
  /** 가스 밴드형 — 위도 밴드 + 난류 (목성). */
  GasBands = 2,
  /** 크레이터형 — 점 분포 크레이터 + 명암 (달). */
  Cratered = 3,
}

/**
 * #756 §결정 2 — body id → 표면 타입 코드 상수 테이블 (데이터 SSoT 불변).
 *
 * "표면 타입" 은 물리 데이터가 아니라 **rendering 분류** 다 (principles.md §적용 위치).
 * `solar-system.json` 은 NASA/JPL 실측 (반경/색상/궤도) 의 SSoT 이므로 rendering 관심사를
 * 누수시키지 않는다. 테이블 미등록 body 는 자동으로 단색 (StandardMaterial) — 23개 비-범위
 * body 무회귀가 **테이블 부재로 자동 보장** (명시적 opt-in).
 *
 * 1차는 대표 4개. 이후 확장 = 데이터 추가가 아닌 **상수 1줄 추가** (R-Phase).
 */
export const SURFACE_TYPE_BY_BODY: Readonly<Record<string, SurfaceType>> = {
  earth: SurfaceType.Rocky,
  mars: SurfaceType.Desert,
  jupiter: SurfaceType.GasBands,
  moon: SurfaceType.Cratered,
};

// ─────────────────────────────────────────────────────────────────────────────
// 변조 강도 미학 상수 SSoT (#69 숨은 상수 drift 차단 — 테스트 가드 대상).
// 데이터 SSoT 아님 (rendering-only 미학 상수 — Visual Fidelity §의무 체크리스트 정합).
// 박제값 근거는 measurement-first (변조 강도는 시각 품질 실측으로 박제). baseColor (실측 색)
// 위에 합성되는 변조 진폭 — 과도하면 base 색이 묻히고, 0 이면 단색과 동일.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * rocky 대륙/해양 대비 진폭 (base color 대비 명암 변조 ±). 저주파 noise 로 대륙 패턴 형성.
 * 너무 크면 base 색 (지구 청록) 이 묻힘 — 0.35 로 디테일 ↔ base 보존 균형.
 */
export const ROCKY_CONTRAST = 0.35;

/** desert dust/협곡 결 진폭 (fbm 변조). 화성 표면의 거친 결. */
export const DESERT_DETAIL = 0.3;

/** desert 산화철 톤 변조 — R 채널 boost / B 채널 감쇠 (붉은 화성). 보라/마젠타 회피 위해 G 보존. */
export const DESERT_RUST_TINT = 0.18;

/** gas-bands 위도 밴드 명암 진폭 (sin(latitude) 변조). 목성 줄무늬 대비. */
export const GAS_BAND_AMPLITUDE = 0.28;

/** gas-bands 밴드 개수 (위도 방향 줄무늬 빈도). 목성 ~ 10여 개 밴드. */
export const GAS_BAND_COUNT = 9;

/** gas-bands 난류 결 진폭 (밴드 위 fbm 흐트러짐). 0 이면 직선 밴드. */
export const GAS_TURBULENCE = 0.12;

/** cratered 크레이터 명암 깊이 (cell noise 점 분포). 달 표면 어두운 크레이터. */
export const CRATER_DEPTH = 0.4;

/** cratered 크레이터 격자 밀도 (셀/방향). 클수록 크레이터가 촘촘. */
export const CRATER_DENSITY = 14;

// ─────────────────────────────────────────────────────────────────────────────
// Amendment 1 (#773/#775) — 광원 모델 + 대륙 mix rendering-only 미학 상수 SSoT.
// (광원 물리 상수 sun/ambient 는 scene 가 SSoT — 주입받음. 아래는 셰이더 고유 미학 상수.)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * soft terminator 폭 (낮/밤 경계 부드러움) — `smoothstep(0.0, W, dot(N, sunDir))` (ADR §A1.3 이견 수용 1).
 *
 * 단색 행성의 `max(dot(N,L), 0)` 를 soft 근사 — ndl ≤ 0 (밤면/terminator) 은 0 (밤면 어두움 유지),
 * 0 ~ W 구간만 부드럽게 전이. segments 12 (mid) / 32 (high) 의 곡면 법선 변화가 조밀하지 못해
 * `clamp(dot,0,1)` 단순 적용 시 경계가 톱니처럼 각진다 → smoothstep 으로 완화 (cross-validate agy
 * 이견 수용). 너무 크면 낮/밤 대비가 흐려지고, 0 이면 톱니 — 0.12 로 부드러움 ↔ 대비 균형 (measurement-first).
 */
export const SOFT_TERMINATOR_WIDTH = 0.12;

/**
 * #775 — rocky 육지색 RGB (rendering-only 미학 상수, 데이터 SSoT 무관 — ADR §A1.3 결정 4 A).
 *
 * ocean 색 = base color (colorHint.hex, 데이터 SSoT read-only). land 색 = 본 상수. 올리브-브라운
 * 자연 톤 (R/G 우세, B 결핍 — 보라/마젠타 anti-pattern 구조적 회피, #756 가드 정합). landMask 로
 * ocean↔land 색조(hue) mix → "바다만" 회귀 (밝기 변조만) 해소.
 */
export const LAND_COLOR_RGB = { r: 0.34, g: 0.4, b: 0.24 } as const;

/** #775 — 대륙 mask smoothstep 하한 (continents fbm < LO → 100% ocean). */
export const LAND_THRESHOLD_LO = 0.48;

/** #775 — 대륙 mask smoothstep 상한 (continents fbm > HI → 100% land). LO~HI 사이 해안선 전이. */
export const LAND_THRESHOLD_HI = 0.62;

/** shader 이름 prefix — ShadersStore key 충돌 방지 (ring/starfield 패턴 답습). */
const SHADER_NAME = 'proceduralPlanet';

/**
 * GLSL vertex shader — local position + normal 을 fragment 로 전달 (구면 좌표 절차 생성 기준).
 *
 * 표면 절차 생성의 기준 = mesh local 좌표 (구의 표면점). world 가 아닌 local 을 쓰면 tier scale /
 * floating-origin shift 에 표면 패턴이 불변 (회전 추종은 별도 — 1차는 self-rotation 미구현이라
 * local 고정으로 충분). log-depth 를 위해 clip-space w 도 전달 (ring-shader #641 선례).
 */
const VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 normal;

uniform mat4 worldViewProjection;

varying vec3 vLocalPos;
varying vec3 vNormal;
// #756 §핵심 위험 1 — 로그 depth: scene 이 enableLogarithmicDepth 로 StandardMaterial(본체)을
// 로그 depth 공간에 기록하는데, 커스텀 ShaderMaterial 이 표준 z 를 쓰면 depth 비교 공간이
// 불일치 → 본체 표면이 항상 다른 body 위로 그려진다. ring-shader 와 동일하게 fragment 에서
// gl_FragDepth 를 로그 공간으로 기록한다 (#641 D-T2 fix 선례).
varying float vFragmentDepth;

void main(void) {
  // local 구면 좌표 — 절차 패턴의 기준 (tier scale / floating-origin 불변).
  vLocalPos = normalize(position);
  vNormal = normalize(normal);
  vec4 clip = worldViewProjection * vec4(position, 1.0);
  gl_Position = clip;
  vFragmentDepth = 1.0 + clip.w;
}
`;

/**
 * GLSL fragment shader — base color 위 표면 타입별 절차 변조 (단일 셰이더 + if-else 분기).
 *
 * uniforms:
 *   - baseColor: 실측 색 (colorHint.hex) — 변조의 기준 (데이터 SSoT, read-only).
 *   - uSurfaceType: 표면 타입 정수 (SurfaceType enum 값 — JS↔GLSL SSoT).
 *   - 변조 강도 상수 (rockyContrast / desertDetail / ... ) — rendering-only 미학 상수 SSoT.
 *   - logDepthConstant: Babylon logDepth 정합 상수.
 *
 * varying:
 *   - vLocalPos: 정규화 구면 좌표 (절차 생성 기준).
 *   - vNormal: 표면 법선 (간이 명암).
 *
 * **GPU warp divergence 0**: body 1개 = draw 1개 = 동일 uSurfaceType → 같은 draw 안 모든
 * fragment 가 같은 분기 (ADR §결정 2 A). **switch-case 금지** (WGSL 변환 깨짐) — if-else 만 사용.
 */
const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vLocalPos;
varying vec3 vNormal;
varying float vFragmentDepth;

uniform vec3 baseColor;
uniform int uSurfaceType;
uniform float rockyContrast;
uniform float desertDetail;
uniform float desertRustTint;
uniform float gasBandAmplitude;
uniform float gasBandCount;
uniform float gasTurbulence;
uniform float craterDepth;
uniform float craterDensity;
uniform float logDepthConstant;

// Amendment 1 (#773) — 광원 모델 uniform (HemisphericLight + PointLight 재현, scene SSoT 주입).
//   uSunDirection: 실제 태양 방향 (normalize(sunPos − meshPos)) — onBind 에서 매 draw 갱신.
//                  body mesh 회전 0 + uniform scaling → world normal == local normal 이라 local 기준.
//   sunIntensity / sunDiffuse: PointLight (intensity 2.5 / diffuse (1,0.95,0.8)) 재현.
//   ambientIntensity / ambientGround / ambientSky / ambientUp: HemisphericLight 재현
//                  (mix(ground, sky, dot(N,up)*0.5+0.5) — terminator/극 그라데이션 일치).
//   softTerminatorWidth: 낮/밤 경계 smoothstep 폭 (각짐 완화, cross-validate 이견 1).
uniform vec3 uSunDirection;
uniform float sunIntensity;
uniform vec3 sunDiffuse;
uniform float ambientIntensity;
uniform vec3 ambientGround;
uniform vec3 ambientSky;
uniform vec3 ambientUp;
uniform float softTerminatorWidth;

// Amendment 1 (#775) — 지구 대륙 mix uniform (rendering-only 미학 상수, scene 무관).
//   landColor: 육지색 (올리브-브라운, R/G 우세 — 보라/마젠타 회피).
//   landThresholdLo/Hi: continents fbm → landMask smoothstep 임계 (해안선 전이).
uniform vec3 landColor;
uniform float landThresholdLo;
uniform float landThresholdHi;

// 3D hash — sin-free fract-mix (starfield.ts hash33 답습 — swiftshader/tier-c fps 보호).
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float hash13(vec3 p) {
  return hash33(p).x;
}

// 3D value noise — trilinear smoothstep 보간 (starfield.ts valueNoise 답습).
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

// 3-옥타브 fbm — 자연스러운 표면 결 (starfield 2-옥타브 + 1 추가, 행성 표면 디테일 강화).
float fbm(vec3 p) {
  return 0.55 * valueNoise(p) + 0.30 * valueNoise(p * 2.3) + 0.15 * valueNoise(p * 4.7);
}

void main(void) {
  vec3 p = normalize(vLocalPos);
  // ⚠️ 회전 0 전제 (Amendment 1 drift 가드): body mesh 회전 0 + uniform scaling → world normal ==
  //    local normal 이라 vNormal(local) 을 광원 dot 에 직접 사용. self-rotation / axialTilt 도입 시
  //    vNormal 을 world matrix 로 변환해야 한다 (ADR §A1.3 결정 1 옵션 e). onBind dev 어서션이 감지.
  vec3 N = normalize(vNormal);

  // Amendment 1 (#773) — 실제 태양 방향 기반 명암 (단색 행성 StandardMaterial 과 시각 일치).
  //   회전 0 + uniform scaling → world normal == local normal 이라 vNormal(local) 을 그대로 사용.
  // ① HemisphericLight 재현 — mix(ground, sky, dot(N,up)*0.5+0.5). 밤면 floor + 극 그라데이션.
  float hemiFactor = dot(N, ambientUp) * 0.5 + 0.5;
  vec3 ambientShade = ambientIntensity * mix(ambientGround, ambientSky, hemiFactor);
  // ② PointLight diffuse 재현 — sunIntensity * sunDiffuse * smoothstep(0, W, dot(N, sunDir)).
  //    단색 행성의 max(dot,0) 를 soft 근사 — ndl ≤ 0 (밤면/terminator) 은 0 (밤면 어두움 유지),
  //    0 ~ W 구간만 부드럽게 전이해 segments 12/32 의 경계 톱니(aliasing) 완화 (cross-validate 이견 1).
  float ndl = dot(N, uSunDirection);
  float sunFactor = smoothstep(0.0, softTerminatorWidth, ndl);
  vec3 sunShade = sunIntensity * sunDiffuse * sunFactor;
  // 합성 명암 (StandardMaterial PointLight+HemisphericLight diffuse 항 재현 — diffuseColor 곱 전).
  vec3 shade = ambientShade + sunShade;
  vec3 col = baseColor;

  // #756 §결정 2 — 표면 타입별 절차 변조 (if-else 분기만). 같은 draw = 같은 타입 (divergence 0).
  if (uSurfaceType == 0) {
    // ── rocky (지구) — 대륙↔해양 색 mix (Amendment 1 #775) ──────────────────
    // continents fbm → landMask. ocean = baseColor (실측 청록), land = landColor (올리브-브라운).
    // 밝기 변조만 (col=base*(1+mod)) 하던 #756 → 색조(hue) mix 로 "바다만" 회귀 해소.
    float continents = fbm(p * 2.4);
    float landMask = smoothstep(landThresholdLo, landThresholdHi, continents);
    col = mix(baseColor, landColor, landMask);
  } else if (uSurfaceType == 1) {
    // ── desert (화성) — dust/협곡 결 (fbm) + 산화철 톤 ─────────────────────
    float detail = fbm(p * 3.6);
    float mod_ = (detail - 0.5) * 2.0 * desertDetail;
    col = baseColor * (1.0 + mod_);
    // 산화철 톤 — R boost / B 감쇠 (붉은 화성). G 는 보존 (보라/마젠타 회피).
    col.r = clamp(col.r + desertRustTint, 0.0, 1.0);
    col.b = clamp(col.b - desertRustTint * 0.5, 0.0, 1.0);
  } else if (uSurfaceType == 2) {
    // ── gas-bands (목성) — 위도 밴드 + 난류 결 ────────────────────────────
    // local Y 가 위도 축 (1차는 mesh local Y 근사 — axialTilt 후속, ADR §재검토 2).
    float latitude = p.y;
    // 난류 — 밴드 경계를 흐트러뜨려 자연스러운 줄무늬 (직선 밴드 회피).
    float turb = (fbm(p * 4.0) - 0.5) * 2.0 * gasTurbulence;
    float bands = sin((latitude + turb) * gasBandCount * 3.14159265);
    float mod_ = bands * gasBandAmplitude;
    col = baseColor * (1.0 + mod_);
  } else if (uSurfaceType == 3) {
    // ── cratered (달) — 크레이터 점 분포 (cell noise) + 명암 ───────────────
    vec3 scaled = p * craterDensity;
    vec3 cell = floor(scaled);
    vec3 frac = fract(scaled);
    vec3 rnd = hash33(cell);
    // 셀 내 크레이터 중심 무작위화 (격자 패턴 차단).
    vec3 craterPos = rnd;
    float dist = length(frac - craterPos);
    // 크레이터 = 가까운 셀에서 어둡게 (smoothstep falloff). rnd.x 로 크레이터 유무/크기 변조.
    float craterSize = 0.18 + rnd.x * 0.22;
    float crater = (1.0 - smoothstep(0.0, craterSize, dist)) * step(0.35, rnd.x);
    // 저주파 결 (mare/highland 명암) + 크레이터 음영.
    float terrain = (fbm(p * 5.0) - 0.5) * 2.0 * 0.15;
    col = baseColor * (1.0 + terrain) * (1.0 - crater * craterDepth);
  }
  // 미등록 타입 (테이블 미적용) 은 여기 도달하지 않음 (호출부에서 셰이더 자체 미생성).

  // Amendment 1 (#773) §결정 3 — 합성 순서 유지: 절차 변조(대륙/밴드/크레이터) 위에 광원 명암 곱.
  //   밤면에서도 절차 디테일(대륙/밴드 패턴)은 존재하되 어둡다 (#756 고주파 엔트로피는 낮면 기준 유지).
  col *= shade;
  // 안전 clamp — 광원(낮면 휘도 > 1) + 절차 변조 후 색역 이탈 방지 (디자인 루브릭 — 보라/마젠타 등
  // 기괴 색역 차단은 baseColor/landColor 가 실측 자연색이라 R/G/B 단조 합성으로 구조적 보장. clamp 는
  // [0,1] 범위만 보정 — 낮면이 sunIntensity 2.5 로 1.0 초과해도 흰색으로 saturate, 단색 행성과 동일).
  col = clamp(col, 0.0, 1.0);

  gl_FragColor = vec4(col, 1.0);

  // #756 §핵심 위험 1 — 본체(StandardMaterial useLogarithmicDepth)와 동일한 로그 depth 공간 기록.
  gl_FragDepth = log2(max(vFragmentDepth, 1e-6)) * logDepthConstant * 0.5;
}
`;

let shaderRegistered = false;

/**
 * GLSL shader 를 Babylon `Effect.ShadersStore` 에 1회 등록 (ring/starfield 패턴 답습).
 * 같은 씬에서 모든 표면 body 가 단일 셰이더 공유 (ShadersStore 1회, 컴파일 1회).
 */
function registerProceduralPlanetShader(): void {
  if (shaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER;
  shaderRegistered = true;
}

/**
 * Amendment 1 (#773) — 광원 물리 상수 (PointLight + HemisphericLight 재현용).
 *
 * scene (`solar-system-scene.ts`) 가 이 값들의 SSoT 다 (PointLight/HemisphericLight 와 동일 값).
 * 셰이더는 scene 를 import 하지 않고 (순환 회피) 이 묶음을 주입받아 uniform 으로 설정한다
 * (단방향 의존 — volt #69 마법 숫자 중복 금지). 모든 값은 rendering-only (데이터 SSoT 무관).
 */
export interface PlanetLightingConstants {
  /** PointLight intensity (= sunLight.intensity, 2.5). */
  sunIntensity: number;
  /** PointLight diffuse RGB (= sunLight.diffuse, (1, 0.95, 0.8)). */
  sunDiffuse: readonly [number, number, number];
  /** HemisphericLight intensity (= AMBIENT_INTENSITY, 0.3). */
  ambientIntensity: number;
  /** HemisphericLight groundColor RGB (= AMBIENT_GROUND_COLOR_RGB). */
  ambientGround: readonly [number, number, number];
  /** HemisphericLight diffuse(sky) RGB (Babylon 기본 (1,1,1) 흰색). */
  ambientSky: readonly [number, number, number];
  /** HemisphericLight direction(up) (= (0,1,0)). */
  ambientUp: readonly [number, number, number];
}

export interface CreateProceduralPlanetMaterialOptions {
  /**
   * ADR §결정 3 — detailLevel uniform 차등 훅 (예약). high/mid 모두 full (1.0) 고정.
   * 후속 fps 측정에서 tier-b 약화가 필요하면 그때 호출부 배선 (1차 YAGNI — starfield gridDensity
   * override 패턴 정합). 현재 셰이더 내부 미사용 — 인터페이스 예약만.
   */
  detailLevel?: number;

  /**
   * Amendment 1 (#773) §A1.3 결정 1 — 태양 월드 위치 provider (scene-unit world).
   *
   * `createSolarSystemScene` 가 매 프레임 `sunLight.position` (Floating Origin shift + tier scale 반영된
   * scene-unit world) 을 갱신하므로, 그 값을 그대로 반환하는 콜백을 넘긴다. onBindObservable 클로저가
   * 각 draw 직전 `normalize(sunPos − meshAbsPos)` 로 `uSunDirection` 을 갱신한다 (scene→core 단방향).
   * 미전달 시 (테스트 등) onBind 미등록 — uSunDirection 은 기본 +X (호출부 setVector3 fallback).
   */
  sunPositionProvider?: () => Vector3;

  /**
   * Amendment 1 (#773) §A1.3 결정 2 — 광원 물리 상수 (scene SSoT 주입). 미전달 시 단색 행성과
   * 불일치하므로 호출부 (scene) 가 반드시 전달. 테스트 등 미전달 시 안전 기본값 (단색 행성 값) 적용.
   */
  lighting?: PlanetLightingConstants;
}

/** Amendment 1 — lighting 미전달 시 기본값 (단색 행성 PointLight/HemisphericLight 값과 동일 — 일관). */
const DEFAULT_PLANET_LIGHTING: PlanetLightingConstants = {
  sunIntensity: 2.5,
  sunDiffuse: [1, 0.95, 0.8],
  ambientIntensity: 0.3,
  ambientGround: [0.15, 0.15, 0.18],
  ambientSky: [1, 1, 1],
  ambientUp: [0, 1, 0],
};

/**
 * #756 — body 의 절차적 표면 ShaderMaterial 생성 (high/mid 공유).
 *
 * `SURFACE_TYPE_BY_BODY` 테이블에 등록된 body 만 셰이더 머티리얼을 반환한다. 미등록 body 는
 * `null` 반환 → 호출부가 기존 StandardMaterial 경로 유지 (단색, 무회귀).
 *
 * base color 는 `body.colorHint.hex` (실측 색) 를 read-only 로 uniform 전달 (데이터 SSoT 불변,
 * §결정 5). 절차 변조는 그 위에 합성된다.
 *
 * @param scene Babylon 씬
 * @param body 대상 body (colorHint.hex 사용)
 * @param name 머티리얼 이름 (high/mid 구분용)
 * @param options detailLevel 예약 (1차 미사용)
 * @returns ShaderMaterial 또는 null (테이블 미등록 body)
 */
export function createProceduralPlanetMaterial(
  scene: Scene,
  body: LoadedCelestialBody,
  name: string,
  options: CreateProceduralPlanetMaterialOptions = {},
): ShaderMaterial | null {
  const surfaceType = SURFACE_TYPE_BY_BODY[body.id];
  if (surfaceType === undefined) return null;

  registerProceduralPlanetShader();

  const material = new ShaderMaterial(
    name,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position', 'normal'],
      uniforms: [
        'worldViewProjection',
        'baseColor',
        'uSurfaceType',
        'rockyContrast',
        'desertDetail',
        'desertRustTint',
        'gasBandAmplitude',
        'gasBandCount',
        'gasTurbulence',
        'craterDepth',
        'craterDensity',
        'logDepthConstant',
        // Amendment 1 (#773) — 광원 모델 uniform.
        'uSunDirection',
        'sunIntensity',
        'sunDiffuse',
        'ambientIntensity',
        'ambientGround',
        'ambientSky',
        'ambientUp',
        'softTerminatorWidth',
        // Amendment 1 (#775) — 대륙 mix uniform.
        'landColor',
        'landThresholdLo',
        'landThresholdHi',
      ],
    },
  );

  // base color (실측 colorHint.hex) — 변조의 기준 (데이터 SSoT, read-only).
  const hex = body.colorHint?.hex ?? '#888888';
  const c = hexToColor3(hex);
  material.setColor3('baseColor', c);
  material.setInt('uSurfaceType', surfaceType);

  // 변조 강도 미학 상수 SSoT 전달.
  material.setFloat('rockyContrast', ROCKY_CONTRAST);
  material.setFloat('desertDetail', DESERT_DETAIL);
  material.setFloat('desertRustTint', DESERT_RUST_TINT);
  material.setFloat('gasBandAmplitude', GAS_BAND_AMPLITUDE);
  material.setFloat('gasBandCount', GAS_BAND_COUNT);
  material.setFloat('gasTurbulence', GAS_TURBULENCE);
  material.setFloat('craterDepth', CRATER_DEPTH);
  material.setFloat('craterDensity', CRATER_DENSITY);

  // ADR §결정 3 — detailLevel 예약 (1차 미사용, 셰이더 uniform 미선언이라 setFloat 생략).
  // options.detailLevel 은 인터페이스 예약 — 후속 활성화 시 uniform 추가 + 셰이더 배선.
  void options.detailLevel;

  // Amendment 1 (#773) — 광원 물리 상수 uniform (scene SSoT 주입, 단색 행성 PointLight/Hemispheric 일치).
  const lighting = options.lighting ?? DEFAULT_PLANET_LIGHTING;
  material.setFloat('sunIntensity', lighting.sunIntensity);
  material.setColor3('sunDiffuse', new Color3(...lighting.sunDiffuse));
  material.setFloat('ambientIntensity', lighting.ambientIntensity);
  material.setColor3('ambientGround', new Color3(...lighting.ambientGround));
  material.setColor3('ambientSky', new Color3(...lighting.ambientSky));
  material.setVector3('ambientUp', new Vector3(...lighting.ambientUp));
  material.setFloat('softTerminatorWidth', SOFT_TERMINATOR_WIDTH);

  // Amendment 1 (#775) — 대륙 mix 미학 상수 uniform (rendering-only).
  material.setColor3('landColor', new Color3(LAND_COLOR_RGB.r, LAND_COLOR_RGB.g, LAND_COLOR_RGB.b));
  material.setFloat('landThresholdLo', LAND_THRESHOLD_LO);
  material.setFloat('landThresholdHi', LAND_THRESHOLD_HI);

  // Amendment 1 (#773) §A1.3 결정 1 — 태양 방향 uniform.
  //   기본 +X (provider 미전달 시 테스트 fallback). provider 가 있으면 onBind 에서 매 draw 갱신.
  material.setVector3('uSunDirection', new Vector3(1, 0, 0));

  const sunPositionProvider = options.sunPositionProvider;
  if (sunPositionProvider) {
    // onBindObservable — 각 draw 직전 mesh 핸들과 함께 호출 (scene 이 material 핸들 별도 추적 불요,
    // 옵션 d Map 대비 우월 — ADR §A1.3 결정 1 c). tmpVector 재사용으로 alloc 0 (cross-validate 이견 2).
    const tmpSunDir = new Vector3();
    material.onBindObservable.add((mesh) => {
      const sunPos = sunPositionProvider();
      // sunDir = normalize(sunPos − meshAbsPos). 회전 0 + uniform scaling → world normal == local normal.
      // satellite (달) 도 parent 상속 위치를 getAbsolutePosition 이 정확히 반영 (ADR §A1.3 결정 1).
      const meshPos = (mesh as Mesh).getAbsolutePosition();
      sunPos.subtractToRef(meshPos, tmpSunDir);
      tmpSunDir.normalize();
      material.setVector3('uSunDirection', tmpSunDir);

      // dev-only 방어적 회전 어서션 (cross-validate 이견 3) — world normal == local normal 전제가
      // 회전 0 에 의존. self-rotation / axialTilt 도입 시 vNormal 을 world matrix 로 변환해야 한다
      // (ADR §A1.3 결정 1 옵션 e). production 무영향 (NODE_ENV DCE).
      if (process.env.NODE_ENV !== 'production') {
        const m = mesh as Mesh;
        const rotNonZero =
          m.rotationQuaternion != null
            ? Math.abs(m.rotationQuaternion.w - 1) > 1e-6 ||
              Math.abs(m.rotationQuaternion.x) > 1e-6 ||
              Math.abs(m.rotationQuaternion.y) > 1e-6 ||
              Math.abs(m.rotationQuaternion.z) > 1e-6
            : Math.abs(m.rotation.x) > 1e-6 ||
              Math.abs(m.rotation.y) > 1e-6 ||
              Math.abs(m.rotation.z) > 1e-6;
        if (rotNonZero) {
          console.warn(
            `[procedural-planet-shader] mesh "${m.name}" 회전 non-zero 감지 — 광원 모델은 world normal == local normal (회전 0) 전제. self-rotation 도입 시 normalMatrix 필요 (ADR §A1.3 결정 1 옵션 e).`,
          );
        }
      }
    });
  }

  // #756 §핵심 위험 1 — 로그 depth 상수 (Babylon logDepth 공식: 2 / log2(maxZ + 1)).
  // maxZ 는 setupArcRotateCamera 가 1e14 로 고정 (ring-shader 와 동일 선례). 카메라 부재
  // (테스트 등) 시 1e14 fallback.
  const maxZ = scene.activeCamera?.maxZ ?? 1e14;
  material.setFloat('logDepthConstant', 2.0 / (Math.log(maxZ + 1.0) / Math.LN2));

  return material;
}

// ─────────────────────────────────────────────────────────────────────────────
// GLSL 절차 변조의 순수 JS 미러 (단위 테스트 SSoT 가드 — #719 교훈 + ADR §교차검증 수용).
//
// GLSL 은 직접 단위 테스트 불가하므로, 변조 식을 JS 로 미러해 결정성 / 보라-마젠타 부재 /
// 변조 강도 상수 SSoT drift 를 가드한다 (starfield starColorMirror 패턴).
// ⚠️ 이 미러 함수들과 FRAGMENT_SHADER 의 GLSL 은 동일 식이어야 한다 (한쪽 수정 시 양쪽 동기화).
// ─────────────────────────────────────────────────────────────────────────────

/** GLSL hash33 의 JS 미러 (sin-free fract-mix). */
function hash33Mirror(px: number, py: number, pz: number): [number, number, number] {
  const fract = (n: number): number => n - Math.floor(n);
  let x = fract(px * 0.1031);
  let y = fract(py * 0.103);
  let z = fract(pz * 0.0973);
  const d = x * (y + 33.33) + y * (x + 33.33) + z * (z + 33.33);
  x += d;
  y += d;
  z += d;
  // GLSL: fract((p.xxy + p.yxx) * p.zyx)
  return [fract((x + y) * z), fract((x + x) * y), fract((y + x) * x)];
}

function hash13Mirror(px: number, py: number, pz: number): number {
  return hash33Mirror(px, py, pz)[0];
}

function valueNoiseMirror(px: number, py: number, pz: number): number {
  const fl = Math.floor;
  const ix = fl(px),
    iy = fl(py),
    iz = fl(pz);
  const fx = px - ix,
    fy = py - iy,
    fz = pz - iz;
  const sm = (f: number): number => f * f * (3 - 2 * f);
  const ux = sm(fx),
    uy = sm(fy),
    uz = sm(fz);
  const lerp = (a: number, b: number, t: number): number => a + (b - a) * t;
  const c = (dx: number, dy: number, dz: number): number => hash13Mirror(ix + dx, iy + dy, iz + dz);
  return lerp(
    lerp(lerp(c(0, 0, 0), c(1, 0, 0), ux), lerp(c(0, 1, 0), c(1, 1, 0), ux), uy),
    lerp(lerp(c(0, 0, 1), c(1, 0, 1), ux), lerp(c(0, 1, 1), c(1, 1, 1), ux), uy),
    uz,
  );
}

/** GLSL fbm 의 JS 미러 (3-옥타브). */
export function fbmMirror(px: number, py: number, pz: number): number {
  return (
    0.55 * valueNoiseMirror(px, py, pz) +
    0.3 * valueNoiseMirror(px * 2.3, py * 2.3, pz * 2.3) +
    0.15 * valueNoiseMirror(px * 4.7, py * 4.7, pz * 4.7)
  );
}

/**
 * #756 — FRAGMENT_SHADER 의 표면 변조 GLSL 의 **순수 JS 미러** (anti-pattern 계약 검증용).
 *
 * 주어진 구면 좌표 + 표면 타입에 대해 변조된 출력 RGB 를 반환한다 (광원 명암 shade 제외 —
 * 색역 검증은 변조 식만으로 충분, 광원 단조성은 `lightingShadeMirror` 가 별도 검증). GLSL 과
 * 동일 식 — 보라/마젠타 부재 (R+B 동시 우세 & G 결핍 금지) / 출력 [0,1] 범위 / 변조 강도 상수
 * SSoT 를 결정적으로 검증한다. rocky 는 Amendment 1 (#775) 대륙 mix (ocean=base ↔ land=landColor).
 *
 * ⚠️ FRAGMENT_SHADER 의 GLSL 분기와 동일 식이어야 한다 (SSoT — 한쪽 수정 시 양쪽 동기화).
 *
 * @param baseColor 실측 base 색 RGB ∈ [0,1]³
 * @param surfaceType 표면 타입
 * @param p 정규화 구면 좌표 [x,y,z] (단위 벡터 가정)
 * @returns 변조 후 RGB ∈ [0,1]³ (clamp 적용)
 */
export function surfaceColorMirror(
  baseColor: readonly [number, number, number],
  surfaceType: SurfaceType,
  p: readonly [number, number, number],
): readonly [number, number, number] {
  const [bx, by, bz] = baseColor;
  let r = bx,
    g = by,
    b = bz;
  const [px, py, pz] = p;

  if (surfaceType === SurfaceType.Rocky) {
    // Amendment 1 (#775) — 대륙↔해양 색 mix (밝기 변조 → 색조 mix). GLSL rocky 분기와 동일 식.
    const continents = fbmMirror(px * 2.4, py * 2.4, pz * 2.4);
    const t =
      (continents - LAND_THRESHOLD_LO) / Math.max(LAND_THRESHOLD_HI - LAND_THRESHOLD_LO, 1e-6);
    const landMask = (() => {
      const c = Math.min(Math.max(t, 0), 1);
      return c * c * (3 - 2 * c);
    })();
    r = bx + (LAND_COLOR_RGB.r - bx) * landMask;
    g = by + (LAND_COLOR_RGB.g - by) * landMask;
    b = bz + (LAND_COLOR_RGB.b - bz) * landMask;
  } else if (surfaceType === SurfaceType.Desert) {
    const detail = fbmMirror(px * 3.6, py * 3.6, pz * 3.6);
    const mod = (detail - 0.5) * 2 * DESERT_DETAIL;
    r = bx * (1 + mod);
    g = by * (1 + mod);
    b = bz * (1 + mod);
    r = Math.min(Math.max(r + DESERT_RUST_TINT, 0), 1);
    b = Math.min(Math.max(b - DESERT_RUST_TINT * 0.5, 0), 1);
  } else if (surfaceType === SurfaceType.GasBands) {
    const latitude = py;
    const turb = (fbmMirror(px * 4, py * 4, pz * 4) - 0.5) * 2 * GAS_TURBULENCE;
    const bands = Math.sin((latitude + turb) * GAS_BAND_COUNT * Math.PI);
    const mod = bands * GAS_BAND_AMPLITUDE;
    r = bx * (1 + mod);
    g = by * (1 + mod);
    b = bz * (1 + mod);
  } else if (surfaceType === SurfaceType.Cratered) {
    const fract = (n: number): number => n - Math.floor(n);
    const cellX = Math.floor(px * CRATER_DENSITY),
      cellY = Math.floor(py * CRATER_DENSITY),
      cellZ = Math.floor(pz * CRATER_DENSITY);
    const fracX = fract(px * CRATER_DENSITY),
      fracY = fract(py * CRATER_DENSITY),
      fracZ = fract(pz * CRATER_DENSITY);
    const rnd = hash33Mirror(cellX, cellY, cellZ);
    const dist = Math.hypot(fracX - rnd[0], fracY - rnd[1], fracZ - rnd[2]);
    const craterSize = 0.18 + rnd[0] * 0.22;
    const sm = (e0: number, e1: number, x: number): number => {
      const t = Math.min(Math.max((x - e0) / Math.max(e1 - e0, 1e-6), 0), 1);
      return t * t * (3 - 2 * t);
    };
    const crater = (1 - sm(0, craterSize, dist)) * (rnd[0] >= 0.35 ? 1 : 0);
    const terrain = (fbmMirror(px * 5, py * 5, pz * 5) - 0.5) * 2 * 0.15;
    r = bx * (1 + terrain) * (1 - crater * CRATER_DEPTH);
    g = by * (1 + terrain) * (1 - crater * CRATER_DEPTH);
    b = bz * (1 + terrain) * (1 - crater * CRATER_DEPTH);
  }

  const clamp01 = (n: number): number => Math.min(Math.max(n, 0), 1);
  return [clamp01(r), clamp01(g), clamp01(b)];
}

/**
 * Amendment 1 (#773) — FRAGMENT_SHADER 광원식 (`shade`) 의 순수 JS 미러 (단조성/일관성 검증용).
 *
 * `shade = ambientIntensity * mix(ground, sky, dot(N,up)*0.5+0.5) + sunIntensity * sunDiffuse *
 *  smoothstep(−W, +W, dot(N, sunDir))`. GLSL main() 의 광원 합성과 동일 식 — 밤면 < 낮면 단조,
 * terminator soft 전이, hemispheric 극 그라데이션을 결정적으로 검증한다 (단색 행성 일관성 SSoT).
 *
 * ⚠️ FRAGMENT_SHADER 의 GLSL 광원 합성과 동일 식이어야 한다 (한쪽 수정 시 양쪽 동기화).
 *
 * @param N 표면 법선 (단위 벡터 — 회전 0 전제로 local == world)
 * @param sunDir 태양 방향 (단위 벡터)
 * @param lighting 광원 물리 상수 (scene SSoT — 미전달 시 DEFAULT_PLANET_LIGHTING)
 * @returns 광원 명암 RGB (diffuseColor 곱 전 — 낮면은 1.0 초과 가능, clamp 미적용)
 */
export function lightingShadeMirror(
  N: readonly [number, number, number],
  sunDir: readonly [number, number, number],
  lighting: PlanetLightingConstants = DEFAULT_PLANET_LIGHTING,
): readonly [number, number, number] {
  const dot = (
    a: readonly [number, number, number],
    b: readonly [number, number, number],
  ): number => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const smoothstep = (e0: number, e1: number, x: number): number => {
    const t = Math.min(Math.max((x - e0) / Math.max(e1 - e0, 1e-6), 0), 1);
    return t * t * (3 - 2 * t);
  };
  // ① HemisphericLight — mix(ground, sky, dot(N,up)*0.5+0.5).
  const hemiFactor = dot(N, lighting.ambientUp) * 0.5 + 0.5;
  const mix = (a: number, b: number, t: number): number => a + (b - a) * t;
  const ambient: [number, number, number] = [
    lighting.ambientIntensity * mix(lighting.ambientGround[0], lighting.ambientSky[0], hemiFactor),
    lighting.ambientIntensity * mix(lighting.ambientGround[1], lighting.ambientSky[1], hemiFactor),
    lighting.ambientIntensity * mix(lighting.ambientGround[2], lighting.ambientSky[2], hemiFactor),
  ];
  // ② PointLight diffuse — sunIntensity * sunDiffuse * smoothstep(0, W, dot(N, sunDir)).
  const sunFactor = smoothstep(0, SOFT_TERMINATOR_WIDTH, dot(N, sunDir));
  return [
    ambient[0] + lighting.sunIntensity * lighting.sunDiffuse[0] * sunFactor,
    ambient[1] + lighting.sunIntensity * lighting.sunDiffuse[1] * sunFactor,
    ambient[2] + lighting.sunIntensity * lighting.sunDiffuse[2] * sunFactor,
  ];
}

/** Rec.709 휘도 (광원식 단조성 검증용 — 밤면 < 낮면 비교 스칼라화). */
export function luminance709(rgb: readonly [number, number, number]): number {
  return 0.2126 * rgb[0] + 0.7152 * rgb[1] + 0.0722 * rgb[2];
}

/** hex → RGB tuple ∈ [0,1]³ (solar-system-scene `hexToColor3` 동형 — 테스트 입력 변환용). */
function hexToColor3(hex: string): Color3 {
  const h = hex.replace('#', '');
  const r = parseInt(h.slice(0, 2), 16) / 255;
  const g = parseInt(h.slice(2, 4), 16) / 255;
  const b = parseInt(h.slice(4, 6), 16) / 255;
  return new Color3(r, g, b);
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트/검증용 re-export (procedural-planet-shader.test.ts SSoT 가드 — #69 drift 차단).
// ─────────────────────────────────────────────────────────────────────────────
export {
  // GLSL 소스 (테스트가 switch 부재 / if-else 분기 / log-depth / 변조 식 정적 검증).
  VERTEX_SHADER as PLANET_VERTEX_SHADER,
  FRAGMENT_SHADER as PLANET_FRAGMENT_SHADER,
};
