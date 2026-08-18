/**
 * P9 #254 PR-2.5 — 행성 고리 shader 렌더러 (3층 방사밀도).
 *
 * **목적**: PR-1 의 단색 `ring-placeholder.ts` 를 교체한다. 각 층(Halo/Main/Gossamer)
 * 을 독립 Babylon `ShaderMaterial` + Disc mesh 로 렌더하고, fragment shader 에서
 * `densityProfile[]` 배열 uniform + 선형 보간으로 alpha 를 계산한다.
 *
 * **설계 근거**: ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md`
 *   - §결정 #2 — `densityProfile[r_normalized, density]` 배열 + 선형 보간 (LUT/분기 반려)
 *   - §결정 #4 — 독립 PR-2.5 (리뷰 범위/M1 백업 독립)
 *   - §인터페이스 박제 L228~L255 — Babylon.js `ShaderMaterial`/`TransformNode`/`Scene`/`Mesh`
 *   - §R1 — shader 컴파일 실패 시 M1 백업 (Babylon SPS InstancedMesh) 자동 전환
 *
 * **fragment shader** (GLSL):
 *   1. 디스크 중심으로부터 반경 r_disk (0~1) 계산 (xy 평면)
 *   2. r_norm = r_disk (디스크 반경이 곧 정규화 반경 — 디스크는 outerRadius 에 맞춰 생성)
 *   3. densityProfileR/D 배열에서 선형 보간 → density d
 *   4. gl_FragColor = vec4(color * d, d)   (alpha = density)
 *
 * **씬 단위**: `renderScaleForTier(tier)` 경유 (P12-A #298). solar tier 기준 1 unit ≈ 1 AU.
 *   innerRadius/outerRadius 는 SI (m) 로 입력받아 생성 시점 tier 로 scene unit 환산.
 *   이후 tier 전환은 host.scaling 으로 자식 메쉬 전체가 동일 배수 확대.
 *
 * **M1 백업 경로** (§R1):
 *   - shader 컴파일 실패 감지 시 `createRingInstancedMesh` 로 자동 전환
 *   - `?ring=fallback` URL 플래그로 수동 트리거 가능 (scene 통합측에서 판단)
 */

import {
  Color3,
  Effect,
  MeshBuilder,
  ShaderMaterial,
  StandardMaterial,
  Vector3,
  type Mesh,
  type Scene,
} from '@babylonjs/core';
import type { LoadedRingLayer } from '../ephemeris/solar-system-loader.js';
import { LOG_DEPTH_FRAGMENT_WRITE_GLSL } from './log-depth.js';
import { renderScaleForTier, type Tier } from './tier.js';

// P12-A #298 B1 — `SCENE_UNIT_PER_METER = 1/AU` 하드코딩 제거. 생성 시점의 tier 로 반경을 계산한다.
// ring mesh 는 host planet mesh 의 자식이라 host.scaling 이 tier 전환 시 새 배수로 설정되면
// ring 도 동일 배수로 확대되어 body 와 상대 비율 보존 (원칙 #1·#4).

/** 기본 색 — 목성 dust 톤 (`#887766`). */
const DEFAULT_RING_COLOR: readonly [number, number, number] = [0x88 / 255, 0x77 / 255, 0x66 / 255];

/** Disc tessellation — 관측 품질 vs draw cost 균형. */
const DISC_TESSELLATION = 96;

/**
 * uniform densityProfile 최대 길이.
 *
 * #845 주석 계약 정정 — 구 "3~5 포인트 → 8로 여유" 는 P9 목성 시점 서술이고, R8 (#647) 에서
 * uranus composite 15점 수용을 위해 16 으로 상향된 현행 값과 모순이었다.
 *
 * loader (`solar-system-loader.ts`) 의 zod `.max(MAX_DENSITY_POINTS)` 파싱 상한과 독립 선언
 * parity — 순환 import 회피를 위해 양쪽 독립 선언 + 대조 테스트 (`ring-shader-arcs.test.ts`,
 * MAX_ARCS #728 동형 패턴). 정합이 깨지면 데이터 silent drop 또는 uniform overflow.
 */
export const MAX_DENSITY_POINTS = 16;

/**
 * #728 — azimuthal arc uniform 고정 배열 상한 (GLSL 동적 길이 불가 — loader `MAX_ARCS` 정합).
 * Adams 가시 클러스터 aggregate 는 1~2 bump 로 충분하나 5 arc 개별 박제 여지로 4.
 * 미사용 슬롯은 width 0 → factor 계산에서 darkFactor 만 남아 무영향.
 */
export const MAX_ARCS = 4;

/**
 * #728 — arc 밖 영역 기본 밝기 배율 (arc 밝기 대조의 분모). data `arcDarkFactor` 미지정 시 사용.
 * D-T2 실측 조정값 (ADR 20260621-728 §결정 2 — arc bright vs dark ≥ 2:1).
 * arcs 미보유 층은 azFactor 1.0 로 short-circuit 되어 이 값과 무관 (무회귀).
 */
const DEFAULT_ARC_DARK_FACTOR = 0.35;

/** M1 백업: 층당 입자 수 (ADR §R1). 3층 × 2000 = 6000 particles, 60fps 예산 내. */
const FALLBACK_PARTICLES_PER_LAYER = 2000;

/** shader 이름 prefix — ShadersStore key 충돌 방지. */
const SHADER_NAME = 'ringLayer';

/**
 * GLSL vertex shader — 표준 disc.
 * Babylon CreateDisc 는 XY 평면에 uv (0~1) 를 자동 생성한다. uv 는 중심(0.5, 0.5) 기준.
 */
const VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec2 uv;

uniform mat4 worldViewProjection;

varying vec2 vUV;
// #641 D-T2 fix 2 — 로그 depth: scene 이 enableLogarithmicDepth 로 StandardMaterial(본체)을
// 로그 depth 공간에 기록하는데, 커스텀 ShaderMaterial 은 표준 z 를 쓰면 depth 비교 공간이
// 불일치 → 본체↔고리 가림이 엉터리 (행성이 항상 고리 위). Babylon logDepth 공식과 동일하게
// fragment 에서 gl_FragDepth 를 로그 공간으로 기록한다.
varying float vFragmentDepth;

void main(void) {
  gl_Position = worldViewProjection * vec4(position, 1.0);
  vUV = uv;
  vFragmentDepth = 1.0 + gl_Position.w;
}
`;

/**
 * GLSL fragment shader — 방사 밀도 선형 보간.
 *
 * uniforms:
 *   - color: vec3 RGB tint
 *   - densityProfileR[N]: 정규화 반경 (0~1) 오름차순
 *   - densityProfileD[N]: 밀도 (0~1)
 *   - profileLength: 유효 포인트 수 (2 ≤ N ≤ MAX_DENSITY_POINTS)
 *   - ringAlpha: 전역 alpha 스케일 (층간 과포화 방지)
 *
 * varying:
 *   - vUV: Babylon Disc 는 [0,1]×[0,1]. 중심(0.5, 0.5) 기준 반경 → [0,1] 로 스케일.
 */
const FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUV;

uniform vec3 color;
uniform float densityProfileR[${MAX_DENSITY_POINTS}];
uniform float densityProfileD[${MAX_DENSITY_POINTS}];
uniform int profileLength;
uniform float ringAlpha;
// #641 D-T2 fix — layer innerRadius/outerRadius 비 (0~1). r < innerRatio 는 discard (annulus).
// 기존엔 inner cutoff 가 없어 interpDensity 의 r<=profileR[0] clamp 가 disc 중심까지
// profileD[0] 로 칠함 → 5층 누적으로 본체가 불투명 원반에 묻힘 (P9 jupiter 에선 ring 이
// bodyScale 미결합으로 mesh 안에 묻혀 잠복 — R7 ring×bodyScale 결합으로 표면화).
uniform float innerRatio;
// #641 D-T2 fix 2 — Babylon logDepth 정합 상수 = 2 / log2(camera.maxZ + 1).
uniform float logDepthConstant;
varying float vFragmentDepth;

// #728 — azimuthal arc 변조 uniform. arcCount 0 이면 azFactor 1.0 (균질 환형 무회귀).
//   - arcCenters[i]: arc 중심 방위각 (radian, disc local UV X축 기준 CCW). loader degree → radian.
//   - arcHalfWidths[i]: arc 반각 (radian). loader widthDeg/2 → radian.
//   - arcBrightness[i]: arc 영역 alpha 배율 (≥ 0).
//   - arcDarkFactor: arc 밖(어두운 나머지) 밝기 배율.
// arc 경계는 hard cutoff 대신 smoothstep 페이딩 (줌아웃 aliasing/깜빡임 방지 — agy 수용).
uniform int arcCount;
uniform float arcCenters[${MAX_ARCS}];
uniform float arcHalfWidths[${MAX_ARCS}];
uniform float arcBrightness[${MAX_ARCS}];
uniform float arcDarkFactor;

/**
 * densityProfile 배열 선형 보간.
 * profileR 은 오름차순 가정. r_norm 가 구간 밖이면 양 끝 값으로 clamp.
 */
float interpDensity(float r_norm) {
  if (profileLength <= 1) return 0.0;
  // 범위 밖 clamp
  if (r_norm <= densityProfileR[0]) return densityProfileD[0];
  // 구간 탐색 (최대 MAX_DENSITY_POINTS-1 번 반복 — GLSL 루프 상한)
  for (int i = 0; i < ${MAX_DENSITY_POINTS - 1}; i++) {
    if (i >= profileLength - 1) break;
    float r0 = densityProfileR[i];
    float r1 = densityProfileR[i + 1];
    if (r_norm >= r0 && r_norm <= r1) {
      float t = (r_norm - r0) / max(r1 - r0, 1e-6);
      return mix(densityProfileD[i], densityProfileD[i + 1], t);
    }
  }
  // 루프 종료까지 매치 실패 → 마지막 값
  return densityProfileD[profileLength - 1];
}

// #728 — azimuthal arc 밝기 배율. arcCount 0 이면 1.0 (균질 무회귀).
//   각 arc 중심에서의 각거리 (wrap-around 고려, [-π,π]) 가 half-width 안이면 arc brightness,
//   밖이면 darkFactor 로 smoothstep 보간. 여러 arc 가 겹치면 가장 밝은 값 채택 (max).
//   branchless smoothstep + max 누적 (GPU warp divergence / 줌아웃 aliasing 최소화).
//   azimuth: fragment 방위각 (radian, atan2 결과 [-π,π]).
float azimuthalArcFactor(float azimuth) {
  if (arcCount <= 0) return 1.0;

  // 기본은 어두운 나머지. arc 영역에 들어가면 brightness 로 올라간다.
  float factor = arcDarkFactor;
  // smoothstep 페이딩 폭 (radian). arc 경계가 1px 미만에서 너무 급하면 줌아웃 aliasing →
  // 약 2° 페이딩으로 부드럽게 (cluster span ~47° 대비 충분히 좁아 경계 식별 유지).
  const float EDGE_FADE = 0.035; // ≈ 2°

  for (int i = 0; i < ${MAX_ARCS}; i++) {
    if (i >= arcCount) break;
    // 중심으로부터 각거리 (wrap-around — atan2 로 [-π,π] 정규화).
    float delta = abs(atan(sin(azimuth - arcCenters[i]), cos(azimuth - arcCenters[i])));
    // delta 가 (halfWidth - fade) 안이면 1, (halfWidth) 밖이면 0 으로 부드럽게 떨어진다.
    float inArc = 1.0 - smoothstep(
      arcHalfWidths[i] - EDGE_FADE,
      arcHalfWidths[i] + EDGE_FADE,
      delta
    );
    factor = max(factor, mix(arcDarkFactor, arcBrightness[i], inArc));
  }
  return factor;
}

void main(void) {
  // 디스크 중심(0.5, 0.5) 기준 반경을 [0, 1] 로. (거리 × 2 = 0~1)
  float r = length(vUV - vec2(0.5)) * 2.0;

  // 디스크 바깥(원 밖) + layer 안쪽 (innerRadius 미만 annulus 밖) 은 그리지 않음 (#641 fix).
  if (r > 1.0 || r < innerRatio) discard;

  // densityProfile 의 r 는 layer 내부 [inner, outer] 구간 정규화 (데이터 의도 — 예: saturn A ring
  // Encke gap dip 0.782 = (133,480-122,170)/(136,780-122,170)). disc 전역 r 을 layer 구간으로 재정규화.
  float r_norm = (r - innerRatio) / max(1.0 - innerRatio, 1e-6);

  float d = interpDensity(r_norm);

  // #728 — azimuthal arc 변조. arc 영역은 밝게(brightness), 나머지는 어둡게(darkFactor).
  // arcCount 0 (arc 데이터 없는 모든 층) 은 1.0 → 기존 균질 환형 그대로 (무회귀).
  // disc local UV 중심(0.5,0.5) 기준 방위각 — centerDeg 와 동일 기준축 (UV X축, +x 방향).
  float azimuth = atan(vUV.y - 0.5, vUV.x - 0.5);
  float azFactor = azimuthalArcFactor(azimuth);

  float alpha = clamp(d * ringAlpha * azFactor, 0.0, 1.0);
  gl_FragColor = vec4(color * d * azFactor, alpha);

  // #641 D-T2 fix 2 — 본체(StandardMaterial useLogarithmicDepth)와 동일한 로그 depth 공간 기록.
  ${LOG_DEPTH_FRAGMENT_WRITE_GLSL}
}
`;

const DEG_TO_RAD = Math.PI / 180;

/**
 * #728 — GLSL `azimuthalArcFactor` 의 smoothstep 페이딩 폭 (radian, ≈ 2°). FRAGMENT_SHADER
 * `EDGE_FADE` 와 정합 (주석 계약 — drift 시 azimuth 경계 테스트가 감지).
 */
export const ARC_EDGE_FADE_RAD = 0.035;

/** GLSL smoothstep 동형 (Hermite). 단위 테스트에서 GLSL 경계 거동 재현용. */
function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / Math.max(edge1 - edge0, 1e-6), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * #728 — fragment `azimuthalArcFactor` GLSL 함수의 **순수 JS 미러** (azimuth 기준축 계약 검증용).
 *
 * GLSL 과 동일 로직 — arc 데이터를 받아 주어진 방위각의 alpha 배율을 반환한다. 셰이더 GLSL 은
 * 직접 단위 테스트 불가하므로, 이 미러로 azimuth↔centerDeg 기준축 계약 / wrap-around / smoothstep
 * 경계 / 다중 arc max 누적 / 빈 배열 무회귀(1.0) 를 결정적으로 검증한다 (주석 계약 drift 가드).
 *
 * ⚠️ 이 함수와 FRAGMENT_SHADER 의 GLSL 은 동일 식이어야 한다 (SSoT — 한쪽 수정 시 양쪽 동기화 의무).
 *
 * @param azimuthRad fragment 방위각 (radian, atan2 결과 [-π,π])
 * @param arcs arc 데이터 (degree). undefined/빈 배열 → 1.0 (무회귀)
 * @param darkFactor arc 밖 영역 밝기 배율
 */
export function computeArcFactor(
  azimuthRad: number,
  arcs: ReadonlyArray<{ centerDeg: number; widthDeg: number; brightness: number }> | undefined,
  darkFactor: number = DEFAULT_ARC_DARK_FACTOR,
): number {
  if (!arcs || arcs.length === 0) return 1.0;

  let factor = darkFactor;
  for (let i = 0; i < arcs.length && i < MAX_ARCS; i++) {
    const a = arcs[i]!;
    const centerRad = a.centerDeg * DEG_TO_RAD;
    const halfWidthRad = a.widthDeg * 0.5 * DEG_TO_RAD;
    // wrap-around 각거리 — atan2(sin, cos) 로 [-π,π] 정규화 후 절댓값.
    const diff = azimuthRad - centerRad;
    const delta = Math.abs(Math.atan2(Math.sin(diff), Math.cos(diff)));
    const inArc =
      1 - smoothstep(halfWidthRad - ARC_EDGE_FADE_RAD, halfWidthRad + ARC_EDGE_FADE_RAD, delta);
    factor = Math.max(factor, darkFactor + (a.brightness - darkFactor) * inArc);
  }
  return factor;
}

/**
 * #728 — arc 데이터를 고정 길이 uniform 배열로 패킹 (fallback warn 포함 — drift 가드).
 *
 * arc 데이터가 누락/형식 오류(NaN, 음수 폭 등) 면 console.warn + 균질 full ring 유지
 * (arcCount 0). ADR 20260621-728 §교차검증 이견 수용 4 (fallback console.warn).
 *
 * @returns `{ count, centers[], halfWidths[], brightness[] }` — count 0 이면 azFactor 1.0.
 */
export function packArcUniforms(
  arcs: ReadonlyArray<{ centerDeg: number; widthDeg: number; brightness: number }> | undefined,
): { count: number; centers: number[]; halfWidths: number[]; brightness: number[] } {
  const centers = new Array<number>(MAX_ARCS).fill(0);
  const halfWidths = new Array<number>(MAX_ARCS).fill(0);
  const brightness = new Array<number>(MAX_ARCS).fill(0);

  if (!arcs || arcs.length === 0) {
    return { count: 0, centers, halfWidths, brightness };
  }

  let count = 0;
  for (const a of arcs) {
    if (count >= MAX_ARCS) break;
    // 형식 검증 — 유효하지 않은 arc 는 건너뛰고 경고 (full ring 유지 가드).
    const valid =
      Number.isFinite(a.centerDeg) &&
      Number.isFinite(a.widthDeg) &&
      a.widthDeg > 0 &&
      Number.isFinite(a.brightness) &&
      a.brightness >= 0;
    if (!valid) {
      console.warn('[ring-shader] #728 invalid arc data, skipping (full ring 유지):', a);
      continue;
    }
    centers[count] = a.centerDeg * DEG_TO_RAD;
    halfWidths[count] = a.widthDeg * 0.5 * DEG_TO_RAD;
    brightness[count] = a.brightness;
    count++;
  }

  return { count, centers, halfWidths, brightness };
}

let shaderRegistered = false;

/**
 * GLSL shader 를 Babylon `Effect.ShadersStore` 에 1회 등록.
 * (같은 씬에서 여러 행성/층이 공유)
 */
function registerRingShader(): void {
  if (shaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = FRAGMENT_SHADER;
  shaderRegistered = true;
}

export interface RingShaderParams {
  /**
   * 고리 안쪽 반경 (m). 디스크는 outerRadius 로 생성되고, shader 가 `innerRatio =
   * innerRadius/outerRadius` 로 annulus cutoff (#641 D-T2 fix — r < innerRatio discard +
   * densityProfile 의 r 를 [inner, outer] layer 구간 재정규화). 이전 계약("r_norm 해석에 쓰이지
   * 않는다")은 P9 잠복 결함 — fallback InstancedMesh 경로는 처음부터 innerScene 을 올바르게 사용.
   */
  innerRadius: number;
  /** 고리 바깥 반경 (m). 디스크 반경 = outerRadius × renderScaleForTier(tier). */
  outerRadius: number;
  /** `[[r_normalized ∈ [0,1], density ∈ [0,1]], ...]` 배열. 길이 N (2 ≤ N ≤ 16). */
  densityProfile: ReadonlyArray<readonly [number, number]>;
  /** RGB tint (0~1 각 채널). 기본 `#887766`. */
  color?: readonly [number, number, number];
  /** 전역 alpha 스케일 (층간 겹침 완화). 기본 0.6. */
  ringAlpha?: number;
  /**
   * #728 — azimuthal arc 데이터 (optional, neptune Adams 전용). 미지정/빈 배열 시 균질 환형
   * (arcCount 0 → azFactor 1.0 무회귀). centerDeg/widthDeg 는 degree (shader 가 radian 변환).
   */
  arcs?: ReadonlyArray<{ centerDeg: number; widthDeg: number; brightness: number }>;
  /** #728 — arc 밖 영역 밝기 배율 (0~1). 미지정 시 `DEFAULT_ARC_DARK_FACTOR`. */
  arcDarkFactor?: number;
}

export interface RingShaderHandles {
  /** 층별 메쉬 배열 (입력 rings 순서 동일). */
  meshes: Mesh[];
  /** 사용 중인 렌더 경로 — `'shader'` 또는 `'fallback'` (M1 InstancedMesh). 검증 스크립트용. */
  mode: 'shader' | 'fallback';
  /** 호스트 메쉬 위치·회전 동기화 (부모-자식 재연결). */
  syncToHost: (host: Mesh) => void;
  dispose: () => void;
}

export interface CreateRingShaderOptions {
  /** 기본 색 (모든 층 공통). 층별 덮어쓰기는 `layerColors[i]` 사용. */
  color?: readonly [number, number, number];
  /** 층별 색 override. 미지정 시 `color` → 기본 `#887766` 순 폴백. */
  layerColors?: ReadonlyArray<readonly [number, number, number] | undefined>;
  /** 전역 alpha (기본 0.6). */
  ringAlpha?: number;
  /**
   * 강제 M1 백업 경로 사용. `?ring=fallback` URL 플래그 또는 수동 테스트용.
   * shader 컴파일 성공 여부와 무관하게 항상 InstancedMesh 로 렌더.
   */
  forceFallback?: boolean;
  /**
   * P12-A #298 B1 — 생성 시점의 tier. 디스크 반경 계산에 사용된다.
   * 이후 tier 전환은 host.scaling 으로 흡수되므로 초기 tier 만 정확하면 된다.
   * 기본값 `'solar'` — 초기 tier 가 solar 로 시작하는 현 디폴트에 맞춤.
   */
  tier?: Tier;
  /**
   * R8 #647 §축 2a — ring 자전축 기울기 (rad). disc `rotation.x = π/2 + axialTiltRad`
   * (shader/fallback 양 경로 동일 — placeholder 는 `ring-placeholder.ts` 동명 옵션).
   * 회전축 방위각은 world X 고정 근사 (pole RA/Dec 미사용 — ADR §위험 #6 주석 계약).
   * 층간 z-offset (`position.y = idx × 1e-4`) 의 tilt 후 ring 법선 방향 cos 편차는
   * 1e-4 scene unit 스케일이라 무시 (주석 계약, 테스트 불요 — ROI 5문).
   * 기본 0 — 기존 동작 (XZ 공전면) 하위 호환 (jupiter 무회귀).
   */
  axialTiltRad?: number;
  /**
   * 테스트 주입용 — shader 컴파일 강제 실패 유도 (잘못된 GLSL 주입).
   * 내부 로직 테스트 전용, 프로덕션 코드에서 호출 금지.
   */
  _injectBrokenShader?: boolean;
}

/**
 * 행성 고리 shader 재질 + disc mesh 생성 (단일 층).
 *
 * 층 1개당 1 개의 `ShaderMaterial` + Disc mesh. 재질 파라미터는 `params.densityProfile`
 * 배열에서 즉시 uniform 으로 전달된다.
 *
 * **주의**: shader 컴파일 실패 시 이 함수는 예외를 throw 하지 않는다 — Babylon `onError`
 * 콜백이 비동기이므로 상위 `createRingShaderMesh` 에서 `onCompiled/onError` 이벤트를
 * 감지해 fallback 으로 교체한다. 본 함수는 재질만 반환.
 */
export function createRingShaderMaterial(scene: Scene, params: RingShaderParams): ShaderMaterial {
  registerRingShader();

  const material = new ShaderMaterial(
    `ring-shader-mat`,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position', 'uv'],
      uniforms: [
        'worldViewProjection',
        'color',
        'densityProfileR',
        'densityProfileD',
        'profileLength',
        'ringAlpha',
        'innerRatio',
        'logDepthConstant',
        // #728 — azimuthal arc 변조 uniform.
        'arcCount',
        'arcCenters',
        'arcHalfWidths',
        'arcBrightness',
        'arcDarkFactor',
      ],
      needAlphaBlending: true,
    },
  );

  // uniform 채우기
  const color = params.color ?? DEFAULT_RING_COLOR;
  material.setColor3('color', new Color3(color[0], color[1], color[2]));

  // densityProfile 배열 → Float32 고정 길이 (MAX_DENSITY_POINTS) 로 패킹.
  // 뒤쪽 여분은 마지막 값 반복 (interpDensity 가 profileLength 로 컷오프하지만 안전 여유).
  const len = Math.min(params.densityProfile.length, MAX_DENSITY_POINTS);
  const rArr = new Float32Array(MAX_DENSITY_POINTS);
  const dArr = new Float32Array(MAX_DENSITY_POINTS);
  for (let i = 0; i < MAX_DENSITY_POINTS; i++) {
    const src = params.densityProfile[Math.min(i, len - 1)]!;
    rArr[i] = src[0];
    dArr[i] = src[1];
  }
  material.setFloats('densityProfileR', Array.from(rArr));
  material.setFloats('densityProfileD', Array.from(dArr));
  material.setInt('profileLength', len);
  material.setFloat('ringAlpha', params.ringAlpha ?? 0.6);
  // #641 D-T2 fix — layer annulus cutoff. inner ≥ outer 등 비정상 데이터는 0 (full disc) 로 방어.
  const innerRatio =
    params.outerRadius > 0
      ? Math.min(Math.max(params.innerRadius / params.outerRadius, 0), 0.999)
      : 0;
  material.setFloat('innerRatio', innerRatio);

  // #641 D-T2 fix 2 — 로그 depth 상수 (Babylon logDepth 공식: 2 / log2(maxZ + 1)).
  // maxZ 는 setupArcRotateCamera 가 1e14 로 고정 (tier 전환은 minZ 만 변경 — tier-transition.ts).
  // activeCamera 부재 (테스트 등) 시 1e14 fallback.
  const maxZ = scene.activeCamera?.maxZ ?? 1e14;
  material.setFloat('logDepthConstant', 2.0 / (Math.log(maxZ + 1.0) / Math.LN2));

  // #728 — azimuthal arc uniform (neptune Adams 전용). arcs 미지정 시 count 0 → azFactor 1.0 무회귀.
  const arc = packArcUniforms(params.arcs);
  material.setInt('arcCount', arc.count);
  material.setFloats('arcCenters', arc.centers);
  material.setFloats('arcHalfWidths', arc.halfWidths);
  material.setFloats('arcBrightness', arc.brightness);
  material.setFloat('arcDarkFactor', params.arcDarkFactor ?? DEFAULT_ARC_DARK_FACTOR);

  // 투명 파이프라인 — 뒷면도 렌더 (고리는 위·아래 모두 관측)
  material.backFaceCulling = false;
  material.alphaMode = 2; // Engine.ALPHA_COMBINE (standard transparency)

  return material;
}

/**
 * 단일 고리 disc mesh + shader material 생성.
 *
 * Shader 컴파일 성공 여부는 비동기로 판정되므로, 본 함수는 즉시 mesh 를 반환하고
 * 상위 호출자가 `ShaderMaterial.onCompiled`/`onError` 이벤트로 fallback 전환 여부를
 * 결정한다.
 */
function createSingleRingShaderMesh(
  scene: Scene,
  name: string,
  params: RingShaderParams,
  zOffset: number,
  sceneUnitPerMeter: number,
  axialTiltRad: number,
): { mesh: Mesh; material: ShaderMaterial } {
  const radiusScene = params.outerRadius * sceneUnitPerMeter;
  const disc = MeshBuilder.CreateDisc(
    name,
    { radius: radiusScene, tessellation: DISC_TESSELLATION },
    scene,
  );
  // R8 #647 §축 2a — XZ 공전면 (π/2) + 자전축 기울기 (uranus 97.77° 세로 고리 / saturn 26.73°).
  // #1130 — body 자전축과 같은 ORBITAL_NORMAL_OFFSET(π/2) 적용 (self-rotation.ts 참조).
  disc.rotation.x = Math.PI + axialTiltRad;
  disc.position.y = zOffset; // z-fighting 방지 (층간 미세 offset)

  const material = createRingShaderMaterial(scene, params);
  material.name = `${name}-mat`;
  disc.material = material;

  return { mesh: disc, material };
}

/**
 * M1 백업 경로 — InstancedMesh 기반 입자 분포.
 *
 * ADR §R1: shader 실패 시 `densityProfile` 을 입자 density 로 사용. rejection
 * sampling 으로 반경별 입자 분포 생성. Babylon `SolidParticleSystem` 보다
 * `InstancedMesh` 가 대규모 정적 파티클에 draw call 단일이라 유리.
 *
 * 각 층 2000 particles × 3층 = 6000 draw (1 draw call).
 */
export function createRingInstancedMesh(
  scene: Scene,
  host: Mesh,
  ring: LoadedRingLayer,
  color: readonly [number, number, number],
  layerIdx: number,
  sceneUnitPerMeter: number,
  axialTiltRad = 0,
): Mesh {
  const innerScene = ring.innerRadius * sceneUnitPerMeter;
  const outerScene = ring.outerRadius * sceneUnitPerMeter;

  // 소스 파티클 — 작은 flat disc (카메라에 정면으로 보이도록)
  const particleSize = Math.max((outerScene - innerScene) / 200, 1e-5);
  const source = MeshBuilder.CreateDisc(
    `${host.name}-ring-${ring.id}-particle`,
    { radius: particleSize, tessellation: 6 },
    scene,
  );
  const mat = new StandardMaterial(`${host.name}-ring-${ring.id}-particle-mat`, scene);
  mat.diffuseColor = new Color3(color[0], color[1], color[2]);
  mat.emissiveColor = new Color3(color[0] * 0.4, color[1] * 0.4, color[2] * 0.4);
  mat.specularColor = new Color3(0, 0, 0);
  mat.alpha = 0.6;
  mat.backFaceCulling = false;
  source.material = mat;
  // R8 #647 §축 2a — shader 경로와 동일 tilt (3경로 일관 — 회귀 검증 모드 정합).
  // #1130 — 위 disc 와 동일 보정.
  source.rotation.x = Math.PI + axialTiltRad;
  source.position.y = layerIdx * 1e-4;
  source.parent = host;

  // Rejection sampling — densityProfile 을 max 값으로 정규화 후 r 별 prob 추출
  const profile = ring.densityProfile;
  let maxD = 0;
  for (const [, d] of profile) maxD = Math.max(maxD, d);
  const maxDSafe = maxD > 0 ? maxD : 1;

  const interpD = (rNorm: number): number => {
    if (profile.length === 0) return 0;
    if (rNorm <= profile[0]![0]) return profile[0]![1];
    for (let i = 0; i < profile.length - 1; i++) {
      const [r0, d0] = profile[i]!;
      const [r1, d1] = profile[i + 1]!;
      if (rNorm >= r0 && rNorm <= r1) {
        const t = (rNorm - r0) / Math.max(r1 - r0, 1e-6);
        return d0 + (d1 - d0) * t;
      }
    }
    return profile[profile.length - 1]![1];
  };

  let placed = 0;
  let attempts = 0;
  const maxAttempts = FALLBACK_PARTICLES_PER_LAYER * 10; // 수렴 안전장치
  while (placed < FALLBACK_PARTICLES_PER_LAYER && attempts < maxAttempts) {
    attempts++;
    const rNorm = Math.random();
    const accept = Math.random();
    if (accept > interpD(rNorm) / maxDSafe) continue;

    // 반경 = inner + rNorm * (outer - inner), 각도 = 0~2π 균등
    const radius = innerScene + rNorm * (outerScene - innerScene);
    const theta = Math.random() * Math.PI * 2;
    const x = radius * Math.cos(theta);
    const z = radius * Math.sin(theta);

    const inst = source.createInstance(`${host.name}-ring-${ring.id}-inst-${placed}`);
    inst.position = new Vector3(x, 0, z);
    inst.parent = source;
    placed++;
  }

  return source;
}

/**
 * 행성 고리 shader 메쉬 생성 (모든 층).
 *
 * ADR §R1 M1 백업: shader 컴파일 실패 시 자동으로 InstancedMesh 로 전환.
 *
 * @param scene Babylon 씬
 * @param host 호스트 행성 메쉬 (부모로 연결)
 * @param rings 로드된 고리 층 배열
 * @param options 색·alpha override 및 fallback 강제 플래그
 */
export function createRingShaderMesh(
  scene: Scene,
  host: Mesh,
  rings: ReadonlyArray<LoadedRingLayer>,
  options: CreateRingShaderOptions = {},
): RingShaderHandles {
  const baseColor = options.color ?? DEFAULT_RING_COLOR;
  const ringAlpha = options.ringAlpha ?? 0.6;
  const layerColors = options.layerColors ?? [];
  const sceneUnitPerMeter = renderScaleForTier(options.tier ?? 'solar');
  // R8 #647 §축 2a — 미지정 시 0 (XZ 공전면 하위 호환, jupiter 무회귀).
  const axialTiltRad = options.axialTiltRad ?? 0;

  // forceFallback — 즉시 InstancedMesh 경로로 분기
  if (options.forceFallback) {
    return buildFallbackHandles(
      scene,
      host,
      rings,
      baseColor,
      layerColors,
      sceneUnitPerMeter,
      axialTiltRad,
    );
  }

  const meshes: Mesh[] = [];
  const materials: ShaderMaterial[] = [];
  let compileFailed = false;

  // 모든 층을 일단 shader 로 시도
  try {
    rings.forEach((ring, idx) => {
      const color = layerColors[idx] ?? baseColor;
      const { mesh, material } = createSingleRingShaderMesh(
        scene,
        `${host.name}-ring-${ring.id}`,
        {
          innerRadius: ring.innerRadius,
          outerRadius: ring.outerRadius,
          densityProfile: ring.densityProfile,
          color,
          ringAlpha,
          // #728 — azimuthal arc (neptune Adams 전용). 미지정 층은 undefined → 균질 무회귀.
          ...(ring.arcs ? { arcs: ring.arcs } : {}),
          ...(ring.arcDarkFactor !== undefined ? { arcDarkFactor: ring.arcDarkFactor } : {}),
        },
        idx * 1e-4,
        sceneUnitPerMeter,
        axialTiltRad,
      );
      mesh.parent = host;

      // onError 는 비동기 — 컴파일 실패 로그만 남김. 즉시 전환은 상위 sync 감지 로직에서 처리.
      material.onError = (_effect, errors) => {
        compileFailed = true;
        // eslint-disable-next-line no-console
        console.warn(`[ring-shader] compile error for ${ring.id}:`, errors);
      };

      meshes.push(mesh);
      materials.push(material);
    });
  } catch (err) {
    // 동기 예외 (Effect 생성 실패 등) 감지 시 즉시 fallback
    // eslint-disable-next-line no-console
    console.warn('[ring-shader] sync exception, fallback to instanced mesh:', err);
    compileFailed = true;
  }

  // _injectBrokenShader 테스트 훅 — material 을 강제로 잘못된 shader 로 교체
  // 실제 onError 콜백 호출 타이밍 재현용.
  if (options._injectBrokenShader && materials.length > 0) {
    compileFailed = true;
  }

  if (compileFailed) {
    // 생성된 shader mesh 정리 후 fallback 경로
    for (const m of meshes) {
      m.material?.dispose();
      m.dispose();
    }
    meshes.length = 0;
    return buildFallbackHandles(
      scene,
      host,
      rings,
      baseColor,
      layerColors,
      sceneUnitPerMeter,
      axialTiltRad,
    );
  }

  const syncToHost = (hostMesh: Mesh) => {
    for (const m of meshes) if (m.parent !== hostMesh) m.parent = hostMesh;
  };

  const dispose = () => {
    for (const m of meshes) {
      m.material?.dispose();
      m.dispose();
    }
    meshes.length = 0;
  };

  return { meshes, mode: 'shader', syncToHost, dispose };
}

/**
 * M1 백업 handles 빌더 — `createRingShaderMesh` 내부 및 `forceFallback` 경로 공용.
 */
function buildFallbackHandles(
  scene: Scene,
  host: Mesh,
  rings: ReadonlyArray<LoadedRingLayer>,
  baseColor: readonly [number, number, number],
  layerColors: ReadonlyArray<readonly [number, number, number] | undefined>,
  sceneUnitPerMeter: number,
  axialTiltRad = 0,
): RingShaderHandles {
  // #728 — fallback(InstancedMesh) 경로는 균등 theta 분포라 arc 미지원 (rejection sampling 의
  // 각도 균등). arc 데이터 보유 층이 fallback 으로 렌더되면 균질 환형이 되는 것이 의도된 한계.
  // ADR 20260621-728 §결정 1 (fallback arc 미지원 명시) + §교차검증 이견 수용 4 (console.warn).
  if (rings.some((r) => r.arcs && r.arcs.length > 0)) {
    console.warn('[ring-shader] #728 ring arcs not supported in fallback path (full ring 유지)');
  }

  const meshes: Mesh[] = [];
  rings.forEach((ring, idx) => {
    const color = layerColors[idx] ?? baseColor;
    const mesh = createRingInstancedMesh(
      scene,
      host,
      ring,
      color,
      idx,
      sceneUnitPerMeter,
      axialTiltRad,
    );
    meshes.push(mesh);
  });

  const syncToHost = (hostMesh: Mesh) => {
    for (const m of meshes) if (m.parent !== hostMesh) m.parent = hostMesh;
  };

  const dispose = () => {
    for (const m of meshes) {
      // InstancedMesh 들은 source mesh dispose 시 함께 정리됨
      m.material?.dispose();
      m.dispose();
    }
    meshes.length = 0;
  };

  return { meshes, mode: 'fallback', syncToHost, dispose };
}

// ─────────────────────────────────────────────────────────────────────────────
// 테스트/검증용 re-export (sun/planet 셰이더 SSoT 가드 선례 — #845 log-depth parity).
// ─────────────────────────────────────────────────────────────────────────────
export {
  // GLSL 소스 — log-depth 공용 조각 (`LOG_DEPTH_FRAGMENT_WRITE_GLSL`) 포함 여부를
  // `log-depth-glsl.test.ts` 가 정적 검증 (텍스트 동일성 = 픽셀 불변 전제).
  FRAGMENT_SHADER as RING_FRAGMENT_SHADER,
};
