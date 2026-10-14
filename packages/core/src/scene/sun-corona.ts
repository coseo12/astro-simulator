/**
 * #1335 — 태양 코로나 · 홍염 렌더 경로 (ADR `docs/decisions/20261014-1335-sun-corona.md` 결정 1~8).
 *
 * 태양 1개 = 메시 1개 (`sun-corona`) · GLSL `ShaderMaterial` 1개 (draw call +1). 메시는 **시선 정렬 고리(annulus)** 다 —
 * 정점 속성 `position` 은 좌표가 아니라 매개변수 `(u, v, 0)` (`u ∈ [0,1]` 둘레 각 · `v ∈ {0, 1}` 안쪽/바깥 테두리) 이고,
 * 정점 셰이더가 매 draw 태양 방향 `s` 에 수직인 평면 (카메라에서 `L = d + ρ_out · R` — 코로나 구 뒷면, 결정 2 · 축 2 (ii))
 * 위에 각반경 `α = asin(R/d)` 의 1배 · ρ_out 배로 펼친다. fragment 가 시선 광선과 `s` 의 각도에서
 * `ρ = acos(clamp(r·s, −1, 1)) / α` 를 **fragment 마다** 계산해 `ρ < 1` (disk 안쪽) · `ρ > ρ_out` 을 버린다
 * (§교차검증 합의 1 — clamp). 고리의 래스터 영역은 같은 셰이더 quad 의 진부분집합이다 (§교차검증 합의 3). 안쪽 테두리는
 * disk 실루엣의 내접 다각형이라 현과 원 사이 띠 (`1 − cos(π/N)` R) 만 disk 안쪽에서 래스터되고 `ρ < 1` 에서 discard 된다 —
 * disk 안쪽 fragment 는 출력하지 않는다.
 *
 * ## 기준계 계약 (결정 2)
 *
 * 코로나는 **「태양 mesh 가 이 draw 에 쓴 위치」 와 「같은 기록 스케일」** 만 읽는다. draw 직전 `mesh.onBeforeRenderObservable` 에서
 *  - 중심 = 태양 host mesh.position
 *  - 반경 `R = body.radius × bodyScale('sun') × bodyFrame.scale` (`bodyFrame` = ADR 1319 결정 2 의 `recordBodyFrame` 기록값)
 *
 * `floatingOrigin.originOffset` 은 읽지 않는다 (`#380` 가드 C 순서상 draw 시점 값은 다음 프레임 origin — `belt-particles.ts`
 * · `comet-tail.ts` 머리말과 같은 함정). 시간 위상(`updateAt`) 에는 아무것도 걸지 않는다. `onBindObservable` 이 아니라
 * `onBeforeRenderObservable` 인 이유도 `belt-particles.ts` 머리말과 같다 (bind 뒤 알림 → 다음 draw 반영).
 *
 * 줄무늬 방향 `e` (시선의 `s` 수직 성분 단위벡터) 는 세계 좌표 방향이라 origin 이동 · 균일 스케일에 불변이다 — 카메라가 태양
 * 주위를 돌면 다른 단면이 보인다 (화면에 붙은 무늬가 아니다).
 *
 * ## 가시성 축은 둘이다 — LOD 추종 (`isVisible`) 과 표시 토글 (`setEnabled`)
 *
 * LOD 추종은 프레임 위상 (`runFramePass` 의 LOD 적용부) 이 `corona.isVisible = sunHigh.isVisible || sunMid?.isVisible === true` 로 쓴다.
 * ⚠️ 이 모듈의 `onBeforeRenderObservable` 안에서 `isVisible` 을 쓰지 않는다 — Babylon 9.19 는 `isVisible` 이 거짓인 메시를 active mesh 에서 빼고
 * `onBeforeRenderObservable` 을 그 메시의 `Mesh.render` 안에서만 알리므로, 한 번 끄면 다시 켤 기회가 사라진다 (ADR 20261010-1329 교차검증 수용 1).
 * 표시 토글은 `mesh.setEnabled` 이고 다시 켜는 주체는 명령이다. 두 플래그를 하나로 합치지 않는다.
 *
 * ## 시간 불변 (결정 7)
 *
 * 셰이더에 시간 · jd uniform 이 없다 — 같은 카메라 = 같은 픽셀. 플레어 · 흐름은 범위 밖 (ADR 재검토 트리거 4).
 *
 * ## noise 텍스트 계약
 *
 * fragment 의 `hash33/valueNoise/fbm` 은 `sun-shader.ts` · `procedural-planet-shader.ts` · `cloud-layer.ts` 와 **같은 텍스트**다.
 * JS 미러는 `fbmMirror` 를 재사용한다 (volt #21 중복 구현 금지) — `sun-shader.test.ts` 의 noise 텍스트 동일성 계약이 가드한다.
 *
 * ## 이 모듈이 하지 않는 것
 *
 * 렌더러 종류를 모른다 — 소프트웨어 렌더 게이트 · `?corona=force` 는 web 책임 (결정 5). switch 금지 (WGSL 변환 — if-else 만).
 */
import {
  Color3,
  Constants,
  Effect,
  Mesh,
  ShaderMaterial,
  Vector3,
  VertexData,
  type Scene,
} from '@babylonjs/core';
import type { BodyReferenceFrame } from './belt-particles.js';
import { LOG_DEPTH_FRAGMENT_WRITE_GLSL } from './log-depth.js';
import { fbmMirror } from './procedural-planet-shader.js';

// ─── rendering-only 상수 (ADR 결정 3 · 사용자 결정 Q1~Q4 — 최종값은 D-T2 육안) ─────────────────────────────

/** 코로나 바깥 반경 / disk 반경 (사용자 결정 Q2 — 금성 궤도 3.09~3.13 R 밖). */
export const CORONA_OUTER_RHO = 3;
/**
 * 고리 둘레 분절 수 (POC 값). 안쪽 테두리는 disk 실루엣의 내접 다각형이라 현의 안쪽 여유는 `1 − cos(π/N)` R 이고,
 * 그 안쪽은 fragment 의 `ρ < 1` 판정이 버린다 (결정 1).
 */
export const CORONA_SEGMENTS = 96;
/**
 * 펼침 각도 상한 (rad) — `tan` 발산만 막는다 (결정 1). 계약 (§교차검증 이견 2): **화면 대각 반시야각보다 크고 `π/2` 보다 작다**.
 * 기본 fov 0.8 rad · 1280×800 의 대각 반시야각 `atan(tan(0.4) · √(1 + 1.6²)) ≈ 38.6°` (계산값). 이보다 작으면 카메라가
 * 코로나 구 안에 있을 때 화면 안에 코로나의 각진 바깥 끝이 보인다. 80° 는 종횡비 약 13 까지의 화면 대각을 덮는다 (계산값).
 */
export const CORONA_ANGLE_CAP_RAD = (80 * Math.PI) / 180;

/**
 * Baumbach (1937) K-코로나 경험식의 세 항 `(계수, 지수)` — `I(ρ) ∝ 0.0532 ρ⁻²·⁵ + 1.425 ρ⁻⁷ + 2.565 ρ⁻¹⁷`.
 * 출처: Baumbach, S. (1937), *Astronomische Nachrichten* 263, 121 (형태만 차용 — ADR 결정 3).
 */
export const BAUMBACH_TERMS: ReadonlyArray<readonly [number, number]> = [
  [0.0532, 2.5],
  [1.425, 7],
  [2.565, 17],
];
/** ρ = 1 정규화 분모 (= 세 계수의 합). */
const BAUMBACH_NORM = BAUMBACH_TERMS.reduce((sum, [c]) => sum + c, 0);
/** 표시 압축 지수 γ (`f^γ`) — Baumbach 형태는 가팔라 림의 얇은 띠만 보인다 (결정 3, `f(2)^0.3 = 0.205` 계산값). D-T2. */
export const CORONA_DISPLAY_GAMMA = 0.3;
/** ρ = 1 (림) 의 피크 세기 (ALPHA_ADD 가산량). 출발값 = POC 0.6 (D-T2 에서 확정). */
export const CORONA_PEAK_ALPHA = 0.6;
/** 진주빛 백색 (선형 RGB — 사용자 결정 Q3 (a), POC 값). */
export const CORONA_RGB: readonly [number, number, number] = [1.0, 0.95, 0.85];
/** 스트리머 변조 진폭 (±) — `1 + A · (fbm − 0.5) · 2`. POC `0.6 + 0.8·fbm` 과 같은 값 (A = 0.4). D-T2. */
export const CORONA_STREAMER_AMPLITUDE = 0.4;
/** 스트리머 noise 입력 배율 (`fbm(e · S)`). POC 값 6. D-T2. */
export const CORONA_STREAMER_SCALE = 6;
/**
 * 적도 (장면 z = 황도 북극, ADR 1-B) 집중 가중치 — `mix(1, 1 − |e·ẑ|, W)` (사용자 결정 Q1 (c)). 0 이면 등방 스트리머 (Q1 (b)).
 * 출발값 = 임의 (D-T2 육안 튜닝 — 상한은 박제하지 않는다, §교차검증 고유 2).
 */
export const CORONA_EQUATORIAL_WEIGHT = 0.5;

/**
 * 홍염 (사용자 결정 Q4 (a) — 정적 · 림 고정 · 높이 과장). D-T2 에서 거슬리면 상수 0 이 아니라 **항 자체를 삭제**한다.
 * 홍염 띠 `ρ ∈ [1, 1 + H]` 안에서 고주파 noise `n = fbm(e · S_p)` 가 문턱 T 를 넘는 방향만 혀(tongue) 모양으로 붉게 칠한다:
 * `excess = clamp((n − T) / RANGE, 0, 1)` 이 그 방향의 홍염 높이 비율, `h = (ρ − 1) / H` 가 그 아래면 켜진다.
 * 문턱 0.64 는 단위 구 위 `fbm` 분포의 상위 약 13 % (developer 실측 — 20,000 방향, p80 0.604 · p90 0.656). 출발값 전부 D-T2.
 */
export const CORONA_PROMINENCE_HEIGHT = 0.1;
export const CORONA_PROMINENCE_SCALE = 14;
export const CORONA_PROMINENCE_THRESHOLD = 0.64;
export const CORONA_PROMINENCE_RANGE = 0.12;
/** 혀 끝 부드러움 (h 단위). */
export const CORONA_PROMINENCE_SOFTNESS = 0.25;
/** 홍염 피크 혼합 비율 — 코로나 색을 이 비율만큼 홍염 색으로 바꾼다 (가산이면 림의 백색에 묻혀 붉게 안 보인다). */
export const CORONA_PROMINENCE_PEAK = 0.85;
/** H-α 계열 적색 (선형 RGB). D-T2. */
export const CORONA_PROMINENCE_RGB: readonly [number, number, number] = [1.0, 0.32, 0.22];

/** 메시 이름 (verify-fps-baseline `requiredMeshes` · 진단이 이 이름으로 찾는다). */
export const SUN_CORONA_MESH_NAME = 'sun-corona';
const SHADER_NAME = 'sunCorona';

type Vec3 = readonly [number, number, number];

const glslFloat = (n: number): string => n.toFixed(6);

/**
 * 정점 셰이더. `position = (u, v, 0)`. 모든 길이는 scene unit · 세계 좌표 (mesh 변환 미사용 — `viewProjection` 만 쓴다).
 */
export const SUN_CORONA_VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;

uniform mat4 viewProjection;
uniform vec3 cameraPosition;
uniform vec3 uSunCenter;
uniform float uSunRadius;

varying vec3 vWorldPos;
varying float vFragmentDepth;

const float RHO_OUT = ${glslFloat(CORONA_OUTER_RHO)};
const float ANGLE_CAP = ${glslFloat(CORONA_ANGLE_CAP_RAD)};
const float TWO_PI = 6.283185307;

void main(void) {
  vec3 toSun = uSunCenter - cameraPosition;
  float d = length(toSun);
  vec3 s = d > 0.0 ? toSun / d : vec3(0.0, 0.0, 1.0);
  // 각반경 α — 카메라가 태양 안 (d <= R) 이면 π/2 로 포화 (NaN 방지 — DoD D7).
  float alpha = asin(min(uSunRadius / max(d, 1e-30), 1.0));
  // s 에 수직인 기저 — s 와 평행하지 않은 보조축의 외적 (POC 와 같은 분기).
  vec3 aux = abs(s.z) < 0.9 ? vec3(0.0, 0.0, 1.0) : vec3(1.0, 0.0, 0.0);
  vec3 b1 = normalize(cross(s, aux));
  vec3 b2 = cross(s, b1);
  float rho = position.y > 0.5 ? RHO_OUT : 1.0;
  // 각도 상한 — tan 발산만 막는다 (화면 대각 반시야각보다 크다 — 상수 주석).
  float theta = min(rho * alpha, ANGLE_CAP);
  // 결정 2 · 축 2 (ii) — 코로나 구 뒷면 거리의 평면.
  float planeDist = d + RHO_OUT * uSunRadius;
  float phi = position.x * TWO_PI;
  vec3 radial = b1 * cos(phi) + b2 * sin(phi);
  vec3 p = cameraPosition + s * planeDist + radial * (planeDist * tan(theta));
  vWorldPos = p;
  vec4 clip = viewProjection * vec4(p, 1.0);
  gl_Position = clip;
  vFragmentDepth = 1.0 + clip.w;
}
`;

/**
 * fragment — ALPHA_ADD. 출력 rgb 는 가산량 그 자체 (알파 1 — 코로나 · 홍염 두 색을 한 출력에 담는다).
 * `ρ` 는 정점 보간이 아니라 fragment 마다 계산한다 (`tan` 때문에 보간 ρ 는 비선형).
 */
export const SUN_CORONA_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vWorldPos;
varying float vFragmentDepth;

uniform vec3 cameraPosition;
uniform vec3 uSunCenter;
uniform float uSunRadius;
uniform float logDepthConstant;
uniform vec3 uCoronaColor;
uniform vec3 uProminenceColor;

const float RHO_OUT = ${glslFloat(CORONA_OUTER_RHO)};
const float BAUMBACH_NORM = ${glslFloat(BAUMBACH_NORM)};
const float DISPLAY_GAMMA = ${glslFloat(CORONA_DISPLAY_GAMMA)};
const float PEAK_ALPHA = ${glslFloat(CORONA_PEAK_ALPHA)};
const float STREAMER_AMPLITUDE = ${glslFloat(CORONA_STREAMER_AMPLITUDE)};
const float STREAMER_SCALE = ${glslFloat(CORONA_STREAMER_SCALE)};
const float EQUATORIAL_WEIGHT = ${glslFloat(CORONA_EQUATORIAL_WEIGHT)};
const float PROMINENCE_HEIGHT = ${glslFloat(CORONA_PROMINENCE_HEIGHT)};
const float PROMINENCE_SCALE = ${glslFloat(CORONA_PROMINENCE_SCALE)};
const float PROMINENCE_THRESHOLD = ${glslFloat(CORONA_PROMINENCE_THRESHOLD)};
const float PROMINENCE_RANGE = ${glslFloat(CORONA_PROMINENCE_RANGE)};
const float PROMINENCE_SOFTNESS = ${glslFloat(CORONA_PROMINENCE_SOFTNESS)};
const float PROMINENCE_PEAK = ${glslFloat(CORONA_PROMINENCE_PEAK)};

// 3D hash — sin-free fract-mix (sun-shader.ts · procedural-planet-shader.ts 와 동일 텍스트 — fbmMirror 재사용 계약).
vec3 hash33(vec3 p) {
  p = fract(p * vec3(0.1031, 0.1030, 0.0973));
  p += dot(p, p.yxz + 33.33);
  return fract((p.xxy + p.yxx) * p.zyx);
}

float hash13(vec3 p) {
  return hash33(p).x;
}

// 3D value noise — trilinear smoothstep 보간 (동일 텍스트).
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

// 3-옥타브 fbm (동일 텍스트 — fbmMirror 계약).
float fbm(vec3 p) {
  return 0.55 * valueNoise(p) + 0.30 * valueNoise(p * 2.3) + 0.15 * valueNoise(p * 4.7);
}

void main(void) {
  vec3 r = normalize(vWorldPos - cameraPosition);
  vec3 toSun = uSunCenter - cameraPosition;
  float d = length(toSun);
  vec3 s = d > 0.0 ? toSun / d : vec3(0.0, 0.0, 1.0);
  float alpha = asin(min(uSunRadius / max(d, 1e-30), 1.0));
  float cosAngle = dot(r, s);
  // §교차검증 합의 1 — acos 정의역 clamp.
  float rho = acos(clamp(cosAngle, -1.0, 1.0)) / max(alpha, 1e-30);
  if (rho < 1.0 || rho > RHO_OUT) {
    discard;
  }
  // 줄무늬 방향 — 시선의 s 수직 성분 (세계 좌표 방향). ρ >= 1 이라 r != s (퇴화 없음).
  vec3 e = normalize(r - s * cosAngle);

  // 반경 프로파일 — Baumbach 형태 (ρ = 1 에서 1) · 표시 압축 f^γ · 바깥 테두리 (1 − t)².
  float baumbach = (${BAUMBACH_TERMS.map(([c, k]) => `${glslFloat(c)} * pow(rho, ${glslFloat(-k)})`).join(' + ')}) / BAUMBACH_NORM;
  float t = (rho - 1.0) / (RHO_OUT - 1.0);
  float profile = pow(baumbach, DISPLAY_GAMMA) * (1.0 - t) * (1.0 - t);
  // 스트리머 (반경 방향으로 곧은 광선 — e 에만 의존) · 적도 집중 (장면 z = 황도 북극).
  float streamer = max(1.0 + STREAMER_AMPLITUDE * (fbm(e * STREAMER_SCALE) - 0.5) * 2.0, 0.0);
  float equator = mix(1.0, 1.0 - abs(e.z), EQUATORIAL_WEIGHT);
  vec3 col = uCoronaColor * (PEAK_ALPHA * profile * streamer * equator);

  // 홍염 — 림 띠 안에서만 (정적 · 림 고정).
  float h = (rho - 1.0) / PROMINENCE_HEIGHT;
  if (h < 1.0) {
    float excess = clamp((fbm(e * PROMINENCE_SCALE) - PROMINENCE_THRESHOLD) / PROMINENCE_RANGE, 0.0, 1.0);
    float prom = PROMINENCE_PEAK * clamp((excess - h) / PROMINENCE_SOFTNESS, 0.0, 1.0);
    col = mix(col, uProminenceColor, prom);
  }

  gl_FragColor = vec4(col, 1.0);
  ${LOG_DEPTH_FRAGMENT_WRITE_GLSL}
}
`;

let coronaShaderRegistered = false;
function registerCoronaShader(): void {
  if (coronaShaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = SUN_CORONA_VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = SUN_CORONA_FRAGMENT_SHADER;
  coronaShaderRegistered = true;
}

// ─── 순수 함수 · JS 미러 (단위 테스트 SSoT — 셰이더 식과 같은 식) ─────────────────────────────────────────

/** Baumbach 형태 정규화 `f(ρ)` (ρ = 1 에서 1). */
export function baumbachProfile(rho: number): number {
  let sum = 0;
  for (const [c, k] of BAUMBACH_TERMS) sum += c * Math.pow(rho, -k);
  return sum / BAUMBACH_NORM;
}

/**
 * 반경 프로파일 미러 — `f(ρ)^γ · (1 − t)²`, `ρ ∉ [1, ρ_out]` 은 0 (fragment `discard` 와 같은 경계).
 * 피크 알파 · 스트리머 · 적도 배율은 곱하지 않는다 (그것들은 방향 함수).
 */
export function coronaProfileMirror(rho: number): number {
  if (!(rho >= 1) || rho > CORONA_OUTER_RHO) return 0;
  const t = (rho - 1) / (CORONA_OUTER_RHO - 1);
  return Math.pow(baumbachProfile(rho), CORONA_DISPLAY_GAMMA) * (1 - t) * (1 - t);
}

/** 스트리머 배율 미러 (`e` 단위벡터). */
export function coronaStreamerMirror(e: Vec3): number {
  const n = fbmMirror(
    e[0] * CORONA_STREAMER_SCALE,
    e[1] * CORONA_STREAMER_SCALE,
    e[2] * CORONA_STREAMER_SCALE,
  );
  return Math.max(1 + CORONA_STREAMER_AMPLITUDE * (n - 0.5) * 2, 0);
}

/** 적도 집중 배율 미러 — `mix(1, 1 − |e_z|, W)`. */
export function coronaEquatorMirror(e: Vec3): number {
  const w = CORONA_EQUATORIAL_WEIGHT;
  return 1 + (1 - Math.abs(e[2]) - 1) * w;
}

/** 각반경 `α = asin(min(R/d, 1))` (d ≤ 0 이면 π/2 — 셰이더의 `max(d, 1e-30)` 와 같은 포화). */
export function coronaAngularRadius(distance: number, radius: number): number {
  if (!(distance > 0)) return Math.PI / 2;
  return Math.asin(Math.min(radius / distance, 1));
}

/**
 * 고리 테두리의 펼침 반경 (평면 위 세계 길이) — `L · tan(min(ρ·α, 각도 상한))`, `L = d + ρ_out · R`.
 * 정점 셰이더와 같은 식 (D7 — `lowerRadiusLimit` 근접에서도 유한).
 */
export function coronaSpreadRadius(distance: number, radius: number, rho: number): number {
  const alpha = coronaAngularRadius(distance, radius);
  const theta = Math.min(rho * alpha, CORONA_ANGLE_CAP_RAD);
  return (distance + CORONA_OUTER_RHO * radius) * Math.tan(theta);
}

/** draw 1회분 코로나 기준계 — 결정 2. */
export interface SunCoronaFrame {
  /** 태양 중심 (scene unit) = 태양 host mesh.position. */
  center: [number, number, number];
  /** 태양 시각 반경 (scene unit) = 반경(m, bodyScale 포함) × `bodyFrame.scale`. */
  radius: number;
}

/** 순수 함수 — 위치 1개 · 스케일 1개 · 상수 1개. */
export function sunCoronaFrame(sun: Vec3, radiusMeters: number, scale: number): SunCoronaFrame {
  return { center: [sun[0], sun[1], sun[2]], radius: radiusMeters * scale };
}

/** 메시 구조 — 둘레 `(분절 + 1)` × 테두리 2 정점 (이음매는 u = 0 · 1 두 열로 닫는다). */
export interface SunCoronaGeometry {
  positions: Float32Array;
  indices: Uint32Array;
}

/** 정점 매개변수 버퍼 (Babylon 비의존 — 단위 테스트가 구조를 직접 본다). */
export function buildSunCoronaGeometry(segments = CORONA_SEGMENTS): SunCoronaGeometry {
  const positions = new Float32Array((segments + 1) * 2 * 3);
  const indices: number[] = [];
  for (let i = 0; i <= segments; i += 1) {
    const u = i / segments;
    const base = i * 2 * 3;
    // (u, v=0) 안쪽 · (u, v=1) 바깥.
    positions[base] = u;
    positions[base + 1] = 0;
    positions[base + 2] = 0;
    positions[base + 3] = u;
    positions[base + 4] = 1;
    positions[base + 5] = 0;
  }
  for (let i = 0; i < segments; i += 1) {
    const a = i * 2;
    indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
  }
  return { positions, indices: Uint32Array.from(indices) };
}

// ─── 메시 ──────────────────────────────────────────────────────────────────────────────────────────

export interface SunCoronaOptions {
  /** 태양 host mesh (high variant — position anchor). */
  sunMesh: Mesh;
  /** 태양 반경 (m) × bodyScale('sun') — 기록 스케일을 곱하면 sun high mesh 세계 반경이 된다 (DoD D4). */
  radiusMeters: number;
  /** body mesh 가 쓴 기준계 스냅샷 제공자 — draw 직전마다 호출 (캐시 금지). `scale` 만 쓴다. */
  frameProvider: () => BodyReferenceFrame;
}

/** 마지막 draw 직전에 material 에 실은 값 (진단 · 단위 테스트용 읽기 전용 사본). */
export interface SunCoronaUniforms extends SunCoronaFrame {
  /** 기준계 스케일 (scene unit / m). */
  scale: number;
  logDepthConstant: number;
}

export interface SunCoronaHandles {
  mesh: Mesh;
  material: ShaderMaterial;
  /** LOD 추종 대상 (태양 high mesh) — 프레임 위상이 이 mesh 의 가시성을 따라 `mesh.isVisible` 을 쓴다. */
  sunMesh: Mesh;
  /** draw 직전 uniform 적용 (렌더 경로가 자동 호출). 단위 테스트가 NullEngine 에서 같은 경로를 태우는 데 쓴다. */
  applyFrameUniforms: () => void;
  /** 마지막 `applyFrameUniforms` 가 실은 값. 한 번도 안 불렸으면 null. */
  readFrameUniforms: () => SunCoronaUniforms | null;
  dispose: () => void;
}

/** 태양 코로나 메시 생성 (태양 1개). */
export function createSunCorona(scene: Scene, options: SunCoronaOptions): SunCoronaHandles {
  const { sunMesh, radiusMeters, frameProvider } = options;
  const { positions, indices } = buildSunCoronaGeometry();

  const mesh = new Mesh(SUN_CORONA_MESH_NAME, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, false);
  // 정점 셰이더가 위치를 정하므로 매개변수 기반 bounding 은 무의미 — 컬링 대상에서 뺀다.
  mesh.alwaysSelectAsActiveMesh = true;
  // 클릭 선택 (`body-picking`) 에 끼지 않는다 (결정 1).
  mesh.isPickable = false;
  // 반투명 중 가장 먼저 — 뒤이은 반투명 (고리 · 구름 · LOD 교차 페이드) 이 그 위에 합성된다 (결정 1).
  mesh.alphaIndex = 0;

  registerCoronaShader();
  const material = new ShaderMaterial(
    `${SUN_CORONA_MESH_NAME}-mat`,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position'],
      uniforms: [
        'viewProjection',
        // Babylon 표준 auto-bind — bind 단계에서 scene.activeCamera.globalPosition (sun 셰이더 선례).
        'cameraPosition',
        'uSunCenter',
        'uSunRadius',
        'logDepthConstant',
        'uCoronaColor',
        'uProminenceColor',
      ],
      needAlphaBlending: true,
    },
  );
  material.setColor3('uCoronaColor', new Color3(...CORONA_RGB));
  material.setColor3('uProminenceColor', new Color3(...CORONA_PROMINENCE_RGB));
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  // 고리 감김 방향은 시선에 따라 뒤집힌다 — 컬링을 끈다.
  material.backFaceCulling = false;
  mesh.material = material;

  const tmpCenter = new Vector3();
  let lastUniforms: SunCoronaUniforms | null = null;
  // ⚠️ 여기서 `mesh.isVisible` 을 쓰지 않는다 (머리말 — 가시성 축은 프레임 위상 소유).
  const applyFrameUniforms = (): void => {
    const s = sunMesh.position;
    const { scale } = frameProvider();
    const frame = sunCoronaFrame([s.x, s.y, s.z], radiusMeters, scale);
    const maxZ = scene.activeCamera?.maxZ ?? 1e14;
    const logDepthConstant = 2.0 / (Math.log(maxZ + 1.0) / Math.LN2);
    tmpCenter.set(frame.center[0], frame.center[1], frame.center[2]);
    material.setVector3('uSunCenter', tmpCenter);
    material.setFloat('uSunRadius', frame.radius);
    material.setFloat('logDepthConstant', logDepthConstant);
    lastUniforms = { ...frame, scale, logDepthConstant };
  };
  applyFrameUniforms();
  mesh.onBeforeRenderObservable.add(applyFrameUniforms);

  return {
    mesh,
    material,
    sunMesh,
    applyFrameUniforms,
    readFrameUniforms: () => lastUniforms,
    dispose: () => {
      mesh.onBeforeRenderObservable.clear();
      material.dispose();
      mesh.dispose();
    },
  };
}
