/**
 * #1329 — 혜성 꼬리 · 코마 렌더 경로 (ADR `docs/decisions/20261010-1329-comet-tail-coma.md` 결정 1~4).
 *
 * 혜성 1개 = 메시 1개 · GLSL `ShaderMaterial` 1개 (draw call 1). 메시는 코마 쿼드 1 + 이온 리본 1 + 먼지 리본 1 이고
 * 정점 속성 `position` 은 좌표가 아니라 **매개변수** `(t 또는 u, side 또는 v, kind)` 다 — kind 0 = 코마, 1 = 이온, 2 = 먼지.
 * 정점 셰이더가 중심선 `c(t) = head + axis·(t·L) + lag·(k·t²·L)` 과 접선을 해석적으로 계산하고,
 * 폭 방향 `normalize(cross(tangent, c − cameraPosition))` 으로 **view(세계) 공간에서** 펼친다 (결정 1 — clip 공간
 * 펼침은 꼬리가 카메라 뒤로 지날 때 `w ≤ 0` 에서 뒤집혀 기각). 카메라 뒤로 지나는 부분은 GPU 클리핑이 처리한다.
 *
 * ## 기준계 · 시간 위상 계약 (결정 2)
 *
 * 꼬리는 **「그 혜성과 태양 mesh 가 이 draw 에 쓴 위치」** 만 읽는다. draw 직전 `mesh.onBeforeRenderObservable` 에서
 *  - `head = 혜성 host mesh.position` · `axis = normalize(head − 태양 mesh.position)`
 *  - `scale = bodyFrame.scale` (ADR 1319 결정 2 의 `recordBodyFrame` 기록값 — 신규 기록 지점 0)
 *  - `r = |head − 태양| / scale` → 활동도 (결정 3) 입력
 *  - `lag = −normalize(cross(ĥ, axis))` — 궤도 운동 반대쪽 (먼지 꼬리 휨 방향)
 *
 * `floatingOrigin.originOffset` 은 읽지 않는다 (`#380` 가드 C 순서상 draw 시점 값은 이미 다음 프레임 origin —
 * `belt-particles.ts` 머리말과 같은 함정). 시간 위상(`updateAt`) 에는 **아무것도 걸지 않는다** — 일시정지 · tier 전환 ·
 * 포커스 이동 · Floating Origin 이동이 모두 다음 draw 에 구조적으로 반영된다 (ADR 1205 와 같은 축).
 *
 * `onBindObservable` 이 아니라 `onBeforeRenderObservable` 인 이유는 `belt-particles.ts` 머리말과 같다 — Babylon 9.19
 * `ShaderMaterial.bind` 는 `onBindObservable` 을 uniform 업로드 **뒤**에 알려 거기서 쓴 값은 다음 draw 에 실린다.
 *
 * ## 궤도면 법선 ĥ 는 상수다 — N-body 경로에서도
 *
 * ĥ 는 로드 시 1회 `orbitalStateAt` (기존 해석해) 의 `normalize(position × velocity)` 로 구한다 (`cometOrbitNormal`).
 * **N-body 엔진 경로에서도 상수로 둔다** — 꼬리 머리 · 축은 mesh 위치를 따르므로 엔진과 무관하게 맞고, ĥ 는 먼지 꼬리
 * 휨 방향에만 쓰인다. 섭동에 의한 궤도면 변화는 무시한다 (ADR 결정 2 · 교차검증 합의 3).
 *
 * ## 활동도가 0 이면 「접는다」 — `isVisible = false` 금지 (교차검증 수용 1)
 *
 * `a(r) = 0` (r ≥ 3 AU) 이면 정점 셰이더가 모든 꼭짓점을 머리 한 점으로 접어 **면적 0** 으로 만든다. `isVisible = false`
 * 로 끄면 안 된다: Babylon 9.19 는 `isVisible` 이 거짓인 메시를 active mesh 에서 빼고 (`scene.pure.js`
 * `_evaluateActiveMeshes`), `onBeforeRenderObservable` 은 그 메시를 그리는 `Mesh.render` 안에서만 알린다
 * (`mesh.pure.js` `render`). 활동도를 그 observer 안에서 계산하므로 한 번 끄면 근일점에 와도 다시 켜지지 않는다.
 * ⚠️ 표시 토글 OFF 는 별도 경로 (`mesh.setEnabled(false)` — 다시 켜는 주체가 명령, 결정 5) 다. 두 플래그를 하나로
 * 합치면 이 함정이 되돌아온다 (ADR §교차검증 Claude 고유 1).
 *
 * ## 이 모듈이 하지 않는 것
 *
 * 렌더러 종류를 모른다 — 소프트웨어 렌더 게이트는 web 책임 (결정 4). 혜성 목록을 모른다 — 장면이 `kind: 'comet'`
 * 전수로 호출한다.
 */
import {
  Color3,
  Constants,
  Effect,
  Mesh,
  ShaderMaterial,
  Vector3,
  Vector4,
  VertexData,
  type Scene,
} from '@babylonjs/core';
import { AU } from '@astro-simulator/shared';
import type { LoadedOrbitalElements } from '../ephemeris/solar-system-loader.js';
import { orbitalStateAt } from '../physics/state-vector.js';
import type { BodyReferenceFrame } from './belt-particles.js';
import { LOG_DEPTH_FRAGMENT_WRITE_GLSL } from './log-depth.js';

// ─── rendering-only 상수 (ADR 결정 3 · 사용자 결정 Q2 · Q4 · Q5 — 최종값은 D-T2 육안) ─────────────────────────

/**
 * 활동 개시 태양 거리 (AU) — 물 얼음 승화가 혜성 활동을 지배하기 시작하는 거리의 **통상값**.
 * 출처: Meech, K. J. & Svoren, J. (2004), "Using Cometary Activity to Trace the Physical and Chemical Evolution of
 * Cometary Nuclei", in *Comets II* (Festou · Keller · Weaver 편, Univ. Arizona Press), pp. 317–335 —
 * 취지: 약 3 AU 안쪽에서는 물 얼음이 활동의 주 동력이다 (요지 — 원문 직접 인용 아님).
 */
export const COMET_ACTIVITY_ONSET_AU = 3;
/** 광도 법칙의 정규화 거리 (AU) — `m = M1 + 5 log Δ + 2.5 n log r` 의 `M1` 이 r = 1 AU 기준이라 새 기준이 아니다. */
const ACTIVITY_NORMALIZATION_AU = 1;
/** r = 1 AU 에서 이온 꼬리 길이 (AU, 세계 길이 — 줌에 따라 화면 길이가 변한다). 사용자 결정 Q2. */
export const COMET_ION_TAIL_LENGTH_1AU = 0.3;
/**
 * 먼지 꼬리 길이 / 이온 꼬리 길이. 출발값 = 임의 (이슈 #1329 설계안 박제값, D-T2 에서 확정) — 먼지가 이온보다 짧게
 * 보이는 통상 모습만 반영했다.
 */
export const COMET_DUST_TAIL_LENGTH_RATIO = 0.5;
/**
 * 먼지 꼬리 끝의 횡변위 / 길이 — `c(t) = head + axis·tL + lag·k·t²L` 의 `k`. 출발값 = 임의 (설계안 박제값, D-T2 에서 확정).
 */
export const COMET_DUST_TAIL_CURVE = 0.3;
/**
 * 이온 꼬리 끝(t = 1) 반폭 / 이온 꼬리 길이. 출발값 = 임의 (D-T2 에서 확정) — ADR 에 값이 없어 PR1 이 정했다.
 * 먼지 꼬리는 이 값의 `COMET_DUST_WIDTH_FACTOR` 배 (ADR 결정 3 — 폭은 이온의 2배, 같은 t 에서).
 */
export const COMET_ION_TAIL_HALF_WIDTH_RATIO = 0.04;
export const COMET_DUST_WIDTH_FACTOR = 2;
/**
 * 머리 쪽(t = 0) 반폭 / 꼬리 끝 반폭 — 선형으로 넓어진다. 출발값 = 임의 (D-T2 에서 확정). 단 머리 쪽 반폭은 코마 반지름
 * (화면 하한 적용 후) 을 넘지 않게 자른다 — 포커스 근접에서 리본 끝단이 코마 밖으로 드러나 핵 중심을 지나는 직선 경계가
 * 생겼다 (PR #1331 리뷰 권고 1 · 사용자 육안). 이 상한은 새 임계가 아니라 이미 있는 코마 반지름이다.
 */
export const COMET_TAIL_HEAD_WIDTH_FRACTION = 0.25;
/** 가시 코마 반지름 차수 (km, r = 1 AU, × a) — 10⁴~10⁵ km. */
export const COMET_COMA_RADIUS_1AU_KM = 1e5;
/** 코마 화면 하한 지름 (**물리 px**, × min(a, 1)) — 사용자 결정 Q5 (glow marker 4.5 px 의 ≈ 3.5 배). */
export const COMET_COMA_MIN_PX_1AU = 16;
/** 리본 폭 화면 하한 (**물리 px**) — 멀리서 계단 소실 방지. 출발값 = 임의 (1 px 반폭 — 래스터화가 끊기지 않는 최소, D-T2). */
export const COMET_TAIL_MIN_WIDTH_PX = 2;
/** 리본 분절 수 (꼬리 1개당). 정점 = (분절 + 1) × 2. */
export const COMET_TAIL_SEGMENTS = 32;

/** 색 (선형 RGB) — 사용자 결정 Q4: 이온 청색 (CO⁺) · 먼지 백황색 (반사광) · 코마 청록 (C₂). 최종 색은 D-T2. */
export const COMET_ION_RGB: readonly [number, number, number] = [0.35, 0.6, 1.0];
export const COMET_DUST_RGB: readonly [number, number, number] = [1.0, 0.9, 0.7];
export const COMET_COMA_RGB: readonly [number, number, number] = [0.55, 1.0, 0.85];
/**
 * 최대 알파 (밝기 1 기준) — ALPHA_ADD 라 겹치는 곳은 더해진다. 출발값 = 임의 (D-T2 에서 확정).
 * 포커스 화면 백색 포화 (PR #1331 사용자 결정 (b)) 는 이 배율이 아니라 겹침 자체를 줄여 해소했다 — 리본은 머리에서 코마
 * 반지름만큼 0 → 1 로 켜져 코마 중심과 겹치지 않고 (`vHeadFade`), 화면을 넘는 성분은 근접 페이드로 흐려진다.
 * 세 피크를 합 1 로 정규화 (0.45 · 0.3 · 0.25) 하는 대안은 기본 카메라 꼬리 휘도를 절반으로 깎아 (핼리 장면 근일점
 * on − off 휘도 합: 같은 보정에 배율 유지 19,449 · 정규화 9,690) 「solar 화면 모습 유지」 와 충돌해 채택하지 않았다.
 */
export const COMET_COMA_PEAK_ALPHA = 0.9;
export const COMET_ION_PEAK_ALPHA = 0.6;
export const COMET_DUST_PEAK_ALPHA = 0.5;

const SHADER_NAME = 'cometTail';
const KIND_COMA = 0;
const KIND_ION = 1;
const KIND_DUST = 2;
const METERS_PER_KM = 1000;
/** 코마 쿼드 모서리 (카메라 right/up 기준). 반지름 1 원 밖은 fragment 가 `discard`. */
const COMA_CORNERS: ReadonlyArray<readonly [number, number]> = [
  [-1, -1],
  [1, -1],
  [1, 1],
  [-1, 1],
];
/** 축이 궤도면 법선과 평행할 때 (N-body 경로에서 이론상 가능) 먼지 휨을 끄는 하한 — |cross| 비교. */
const LAG_DEGENERATE_EPS = 1e-9;

type Vec3 = readonly [number, number, number];

/**
 * 활동도 `a(r) = max(0, ln(r_on / r) / ln(r_on / 1 AU))` (결정 3).
 *
 * 혜성 광도 법칙 `m = M1 + 5 log Δ + 2.5 n log r` 에서 태양 거리에 따른 밝아짐 `2.5 n log(r_on / r)` 을 r = 1 AU 값으로
 * 나눈 것 — `n` 이 약분되어 혜성별 광도 파라미터가 필요 없다 (데이터 추가 0). r ≥ 3 AU → 0, r = 1 AU → 1.
 * 비유한 · 0 이하 입력은 0 (NaN 방어 — 머리가 태양과 겹치는 퇴화 포함).
 */
export function cometActivity(rAU: number): number {
  if (!Number.isFinite(rAU) || rAU <= 0) return 0;
  const a =
    Math.log(COMET_ACTIVITY_ONSET_AU / rAU) /
    Math.log(COMET_ACTIVITY_ONSET_AU / ACTIVITY_NORMALIZATION_AU);
  return Math.max(0, a);
}

/**
 * 궤도면 단위 법선 ĥ = normalize(r × v) — 로드 시 1회 (결정 2). 2체 Kepler 에서 시각 무관 상수다.
 * 역행 혜성 (halley i = 162°) 은 z 가 음수라 먼지 휨 부호가 자동으로 맞는다.
 */
export function cometOrbitNormal(
  elements: LoadedOrbitalElements,
  julianDate: number,
  mu: number,
): Vec3 {
  const { position: r, velocity: v } = orbitalStateAt(elements, julianDate, mu);
  const h: [number, number, number] = [
    r[1] * v[2] - r[2] * v[1],
    r[2] * v[0] - r[0] * v[2],
    r[0] * v[1] - r[1] * v[0],
  ];
  const len = Math.hypot(h[0], h[1], h[2]);
  if (!(len > 0)) throw new Error('[cometOrbitNormal] 각운동량 0 — 궤도 요소 퇴화');
  return [h[0] / len, h[1] / len, h[2] / len];
}

/** draw 1회분 꼬리 상태 — 위치 2개 · 스케일 1개 · 상수 1개의 순수 함수 (`cometTailFrame`). */
export interface CometTailFrame {
  /** 머리 (scene unit) = 혜성 host mesh.position. */
  head: [number, number, number];
  /** 반태양 단위 벡터. 머리 = 태양 퇴화 시 (0,0,0) (이때 activity = 0 이라 셰이더가 접는다). */
  axis: [number, number, number];
  /** 먼지 휨 방향 단위 벡터 `−normalize(ĥ × axis)`. 퇴화 시 (0,0,0) (휨 없음). */
  lag: [number, number, number];
  /** 태양 거리 (AU). */
  rAU: number;
  /** 활동도 a(r). */
  activity: number;
  /** 이온 · 먼지 꼬리 길이 (scene unit). */
  ionLength: number;
  dustLength: number;
  /** 코마 세계 반지름 (scene unit) — 화면 하한은 셰이더가 적용. */
  comaRadius: number;
}

/**
 * 꼬리 상태 (결정 2 · 3) — Babylon 비의존 순수 함수.
 *
 * @param head 혜성 mesh.position (scene unit)
 * @param sun 태양 mesh.position (scene unit)
 * @param scale `bodyFrame.scale` — scene unit / m
 * @param orbitNormal ĥ (단위 벡터)
 */
export function cometTailFrame(
  head: Vec3,
  sun: Vec3,
  scale: number,
  orbitNormal: Vec3,
): CometTailFrame {
  const dx = head[0] - sun[0];
  const dy = head[1] - sun[1];
  const dz = head[2] - sun[2];
  const dist = Math.hypot(dx, dy, dz);
  const valid = dist > 0 && Number.isFinite(dist) && scale > 0 && Number.isFinite(scale);
  if (!valid) {
    return {
      head: [head[0], head[1], head[2]],
      axis: [0, 0, 0],
      lag: [0, 0, 0],
      rAU: 0,
      activity: 0,
      ionLength: 0,
      dustLength: 0,
      comaRadius: 0,
    };
  }
  const axis: [number, number, number] = [dx / dist, dy / dist, dz / dist];
  const rAU = dist / scale / AU;
  const activity = cometActivity(rAU);
  // lag = −(ĥ × axis) / |ĥ × axis| — 순행이면 운동 반대쪽.
  const cx = orbitNormal[1] * axis[2] - orbitNormal[2] * axis[1];
  const cy = orbitNormal[2] * axis[0] - orbitNormal[0] * axis[2];
  const cz = orbitNormal[0] * axis[1] - orbitNormal[1] * axis[0];
  const cLen = Math.hypot(cx, cy, cz);
  const lag: [number, number, number] =
    cLen > LAG_DEGENERATE_EPS ? [-cx / cLen, -cy / cLen, -cz / cLen] : [0, 0, 0];
  const ionLength = COMET_ION_TAIL_LENGTH_1AU * AU * scale * activity;
  return {
    head: [head[0], head[1], head[2]],
    axis,
    lag,
    rAU,
    activity,
    ionLength,
    dustLength: ionLength * COMET_DUST_TAIL_LENGTH_RATIO,
    comaRadius: COMET_COMA_RADIUS_1AU_KM * METERS_PER_KM * scale * activity,
  };
}

/**
 * 정점 셰이더. `position` = `(t|u, side|v, kind)`. 모든 길이는 scene unit.
 * `uPxWorld` = 깊이 1 에서 물리 px 1개의 세계 길이 (`2 / (P[1][1] · renderHeight)`) — 화면 px 하한 = px × 깊이 × uPxWorld.
 */
export const COMET_TAIL_VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;

uniform mat4 view;
uniform mat4 viewProjection;
uniform vec3 cameraPosition;
uniform vec3 uHead;
uniform vec3 uAxis;
uniform vec3 uLag;
uniform vec4 uShape;
uniform float uPxWorld;
uniform float uTanHalfFov;

varying vec2 vUv;
varying float vKind;
varying float vAlpha;
varying float vHeadFade;
varying float vFragmentDepth;

const float DUST_CURVE = ${COMET_DUST_TAIL_CURVE.toFixed(4)};
const float ION_HALF_WIDTH_RATIO = ${COMET_ION_TAIL_HALF_WIDTH_RATIO.toFixed(4)};
const float DUST_WIDTH_FACTOR = ${COMET_DUST_WIDTH_FACTOR.toFixed(4)};
const float HEAD_WIDTH_FRACTION = ${COMET_TAIL_HEAD_WIDTH_FRACTION.toFixed(4)};
const float TAIL_MIN_HALF_PX = ${(COMET_TAIL_MIN_WIDTH_PX / 2).toFixed(4)};
const float COMA_MIN_RADIUS_PX = ${(COMET_COMA_MIN_PX_1AU / 2).toFixed(4)};
const float SIN_EPS = 1e-4;

void main(void) {
  // uShape = (이온 길이, 먼지 길이, 코마 세계 반지름, 활동도)
  float activity = uShape.w;
  // 결정 3 — a = 0 이면 모든 꼭짓점을 머리로 접는다 (면적 0). isVisible 로 끄지 않는다 (머리말).
  float on = step(1e-6, activity);
  float brightness = min(activity, 1.0);
  float kind = position.z;
  vec3 p = uHead;
  float alpha = brightness;
  // 코마 반지름 (세계 반지름 vs 화면 하한) — 코마 쿼드와 리본 머리 폭이 같은 값을 쓴다.
  float headDepth = max((viewProjection * vec4(uHead, 1.0)).w, 0.0);
  float comaRadius = max(uShape.z, COMA_MIN_RADIUS_PX * brightness * headDepth * uPxWorld);
  vHeadFade = 1.0;

  if (kind < 0.5) {
    // 코마 — 카메라 right/up 평면의 쿼드 (view 행렬의 회전 행 = 카메라 기저, 손잡이 무관).
    vec3 right = vec3(view[0][0], view[1][0], view[2][0]);
    vec3 up = vec3(view[0][1], view[1][1], view[2][1]);
    p = uHead + (right * position.x + up * position.y) * comaRadius;
    // 카메라 근접 페이드 (화면 점유) — 리본과 같은 규칙. 코마가 화면 높이를 넘으면 넘는 배수만큼 흐려진다.
    float comaCover = comaRadius / max(headDepth * uTanHalfFov, 1e-30);
    alpha *= clamp(1.0 / max(comaCover, 1e-30), 0.0, 1.0);
    vUv = position.xy;
  } else {
    float t = position.x;
    float side = position.y;
    bool dust = kind > 1.5;
    float len = dust ? uShape.y : uShape.x;
    float k = dust ? DUST_CURVE : 0.0;
    vec3 c = uHead + uAxis * (t * len) + uLag * (k * t * t * len);
    vec3 tangent = uAxis + uLag * (2.0 * k * t);
    float tanLen = length(tangent);
    tangent = tanLen > 0.0 ? tangent / tanLen : uAxis;
    vec3 toCam = c - cameraPosition;
    float camDist = length(toCam);
    vec3 s = cross(tangent, toCam);
    float sLen = length(s);
    // 축 정면 시선 — |cross| → 0 이면 NaN 없이 폭 방향을 0 으로, 알파는 sinθ 로 줄인다 (결정 1).
    float sinTheta = camDist > 0.0 ? sLen / camDist : 0.0;
    vec3 sideDir = sinTheta > SIN_EPS ? s / sLen : vec3(0.0);
    float depth = max((viewProjection * vec4(c, 1.0)).w, 0.0);
    float widthFactor = dust ? DUST_WIDTH_FACTOR : 1.0;
    float tipHalf = uShape.x * ION_HALF_WIDTH_RATIO * widthFactor;
    // 머리에서 가늘게 — 머리 쪽 반폭은 코마 반지름 이하 (리본 끝단이 코마 밖으로 드러나지 않게).
    float headHalf = min(tipHalf * HEAD_WIDTH_FRACTION, comaRadius);
    float halfWorld = mix(headHalf, tipHalf, t);
    float halfWidth = max(halfWorld, TAIL_MIN_HALF_PX * depth * uPxWorld);
    p = c + sideDir * (side * halfWidth);
    // 카메라 근접 페이드 (화면 점유) — 이 지점의 리본 폭이 화면 높이를 넘으면 넘는 배수만큼 흐려진다.
    // 점유율 = 반폭 / (깊이 · tan(fov/2)). 기준은 화면 자신이라 새 임계가 아니다. 기본 카메라 (solar) 는 리본 폭이
    // 수 px 라 1 (무변화). 카메라 뒤 (깊이 0) 는 0.
    float cover = halfWidth / max(depth * uTanHalfFov, 1e-30);
    float nearFade = clamp(1.0 / max(cover, 1e-30), 0.0, 1.0);
    alpha *= sinTheta * nearFade;
    // 머리 세기 — 머리에서 코마 반지름만큼 가는 동안 0 → 1 (fragment 에서 clamp). 코마가 머리를 넘겨받는다.
    vHeadFade = comaRadius > 0.0 ? (t * len) / comaRadius : 1.0;
    vUv = vec2(t, side);
  }

  p = uHead + (p - uHead) * on;
  vec4 clip = viewProjection * vec4(p, 1.0);
  gl_Position = clip;
  vKind = kind;
  vAlpha = alpha * on;
  vFragmentDepth = 1.0 + clip.w;
}
`;

/**
 * fragment — ALPHA_ADD (색 × 알파 를 더한다). 코마는 반지름 1 원 밖 `discard` + 중심 집중,
 * 리본은 축 방향으로 꼬리 끝에서 0, 폭 방향으로 가장자리에서 0. 로그 depth 는 SSoT 문장 그대로.
 */
export const COMET_TAIL_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec2 vUv;
varying float vKind;
varying float vAlpha;
varying float vHeadFade;
varying float vFragmentDepth;

uniform float logDepthConstant;
uniform vec3 uComaColor;
uniform vec3 uIonColor;
uniform vec3 uDustColor;

const float COMA_PEAK = ${COMET_COMA_PEAK_ALPHA.toFixed(4)};
const float ION_PEAK = ${COMET_ION_PEAK_ALPHA.toFixed(4)};
const float DUST_PEAK = ${COMET_DUST_PEAK_ALPHA.toFixed(4)};

void main(void) {
  vec3 color;
  float intensity;
  if (vKind < 0.5) {
    float r2 = dot(vUv, vUv);
    if (r2 > 1.0) {
      discard;
    }
    intensity = COMA_PEAK * exp(-4.0 * r2) * (1.0 - r2);
    color = uComaColor;
  } else {
    float along = (1.0 - vUv.x) * (1.0 - vUv.x) * clamp(vHeadFade, 0.0, 1.0);
    float across = 1.0 - vUv.y * vUv.y;
    bool dust = vKind > 1.5;
    intensity = (dust ? DUST_PEAK : ION_PEAK) * along * across;
    color = dust ? uDustColor : uIonColor;
  }
  gl_FragColor = vec4(color, intensity * vAlpha);
  ${LOG_DEPTH_FRAGMENT_WRITE_GLSL}
}
`;

let cometShaderRegistered = false;
function registerCometShader(): void {
  if (cometShaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = COMET_TAIL_VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = COMET_TAIL_FRAGMENT_SHADER;
  cometShaderRegistered = true;
}

/** 메시 구조 — 코마 쿼드 4 정점 + 리본 2개 × (분절 + 1) × 2 정점. */
export interface CometTailGeometry {
  positions: Float32Array;
  indices: Uint32Array;
}

/** 정점 매개변수 버퍼 (Babylon 비의존 — 단위 테스트가 구조를 직접 본다). */
export function buildCometTailGeometry(segments = COMET_TAIL_SEGMENTS): CometTailGeometry {
  const ribbonVertices = (segments + 1) * 2;
  const vertexCount = COMA_CORNERS.length + ribbonVertices * 2;
  const positions = new Float32Array(vertexCount * 3);
  const indices: number[] = [];
  let v = 0;
  const push = (a: number, b: number, kind: number): void => {
    positions[v * 3] = a;
    positions[v * 3 + 1] = b;
    positions[v * 3 + 2] = kind;
    v += 1;
  };
  for (const [x, y] of COMA_CORNERS) push(x, y, KIND_COMA);
  indices.push(0, 1, 2, 0, 2, 3);
  for (const kind of [KIND_ION, KIND_DUST]) {
    const base = v;
    for (let i = 0; i <= segments; i += 1) {
      const t = i / segments;
      push(t, -1, kind);
      push(t, 1, kind);
    }
    for (let i = 0; i < segments; i += 1) {
      const a = base + i * 2;
      indices.push(a, a + 1, a + 3, a, a + 3, a + 2);
    }
  }
  return { positions, indices: Uint32Array.from(indices) };
}

export interface CometTailOptions {
  /** 혜성 body id — 메시 이름 `comet-tail-<id>`. */
  bodyId: string;
  /** 혜성 host mesh (high variant — position anchor). */
  headMesh: Mesh;
  /** 태양 mesh. */
  sunMesh: Mesh;
  /** 궤도면 법선 ĥ (`cometOrbitNormal`). */
  orbitNormal: Vec3;
  /** body mesh 가 쓴 기준계 스냅샷 제공자 — draw 직전마다 호출 (캐시 금지). `scale` 만 쓴다. */
  frameProvider: () => BodyReferenceFrame;
}

/** 마지막 draw 직전에 material 에 실은 값 (진단 · 단위 테스트용 읽기 전용 사본). */
export interface CometTailUniforms extends CometTailFrame {
  /** 같은 draw 에서 읽은 태양 mesh.position (scene unit). */
  sun: [number, number, number];
  /** 기준계 스케일 (scene unit / m). */
  scale: number;
  /** 깊이 1 에서 물리 px 1개의 세계 길이. */
  pxWorld: number;
  /** 깊이 1 에서 화면 반높이의 세계 길이 (tan(fov/2)) — 근접 페이드 기준. */
  tanHalfFov: number;
  logDepthConstant: number;
}

export interface CometTailHandles {
  bodyId: string;
  mesh: Mesh;
  material: ShaderMaterial;
  /** draw 직전 uniform 적용 (렌더 경로가 자동 호출). 단위 테스트가 NullEngine 에서 같은 경로를 태우는 데 쓴다. */
  applyFrameUniforms: () => void;
  /** 마지막 `applyFrameUniforms` 가 실은 값. 한 번도 안 불렸으면 null. */
  readFrameUniforms: () => CometTailUniforms | null;
  dispose: () => void;
}

/** 혜성 1개의 꼬리 · 코마 메시 생성. */
export function createCometTail(scene: Scene, options: CometTailOptions): CometTailHandles {
  const { bodyId, headMesh, sunMesh, orbitNormal, frameProvider } = options;
  const name = `comet-tail-${bodyId}`;
  const { positions, indices } = buildCometTailGeometry();

  const mesh = new Mesh(name, scene);
  const vertexData = new VertexData();
  vertexData.positions = positions;
  vertexData.indices = indices;
  vertexData.applyToMesh(mesh, false);
  // 정점 셰이더가 위치를 정하므로 매개변수 기반 bounding 은 무의미 — 컬링 대상에서 뺀다.
  mesh.alwaysSelectAsActiveMesh = true;
  // 클릭 선택 (`body-picking`) 에 끼지 않는다 (결정 1).
  mesh.isPickable = false;

  registerCometShader();
  const material = new ShaderMaterial(
    `${name}-mat`,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: ['position'],
      uniforms: [
        'view',
        'viewProjection',
        'cameraPosition',
        'uHead',
        'uAxis',
        'uLag',
        'uShape',
        'uPxWorld',
        'uTanHalfFov',
        'logDepthConstant',
        'uComaColor',
        'uIonColor',
        'uDustColor',
      ],
      needAlphaBlending: true,
    },
  );
  material.setColor3('uComaColor', new Color3(...COMET_COMA_RGB));
  material.setColor3('uIonColor', new Color3(...COMET_ION_RGB));
  material.setColor3('uDustColor', new Color3(...COMET_DUST_RGB));
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  // 리본 감김 방향은 시선에 따라 뒤집힌다 — 컬링을 끈다.
  material.backFaceCulling = false;
  mesh.material = material;

  const tmpHead = new Vector3();
  const tmpAxis = new Vector3();
  const tmpLag = new Vector3();
  const tmpShape = new Vector4();
  let lastUniforms: CometTailUniforms | null = null;
  const applyFrameUniforms = (): void => {
    const h = headMesh.position;
    const s = sunMesh.position;
    const { scale } = frameProvider();
    const frame = cometTailFrame([h.x, h.y, h.z], [s.x, s.y, s.z], scale, orbitNormal);
    const engine = scene.getEngine();
    // 캐시 금지 — 리사이즈 · DPR 변경이 다음 draw 에 반영된다. renderHeight = 물리 px (교차검증 수용 3).
    const height = Math.max(1, engine.getRenderHeight());
    // 투영 행렬 [1][1] = 1/tan(fov/2) (scene 쪽 사본은 첫 render 전 미정이라 카메라에서 읽는다).
    const p11 = scene.activeCamera?.getProjectionMatrix().m[5] ?? 0;
    const pxWorld = p11 > 0 ? 2 / (p11 * height) : 0;
    // 화면 반높이의 깊이 1 세계 길이 = tan(fov/2) = 1 / P[1][1] (근접 페이드의 화면 점유 기준).
    const tanHalfFov = p11 > 0 ? 1 / p11 : 0;
    const maxZ = scene.activeCamera?.maxZ ?? 1e14;
    const logDepthConstant = 2.0 / (Math.log(maxZ + 1.0) / Math.LN2);
    tmpHead.set(frame.head[0], frame.head[1], frame.head[2]);
    tmpAxis.set(frame.axis[0], frame.axis[1], frame.axis[2]);
    tmpLag.set(frame.lag[0], frame.lag[1], frame.lag[2]);
    material.setVector3('uHead', tmpHead);
    material.setVector3('uAxis', tmpAxis);
    material.setVector3('uLag', tmpLag);
    tmpShape.set(frame.ionLength, frame.dustLength, frame.comaRadius, frame.activity);
    material.setVector4('uShape', tmpShape);
    material.setFloat('uPxWorld', pxWorld);
    material.setFloat('uTanHalfFov', tanHalfFov);
    material.setFloat('logDepthConstant', logDepthConstant);
    lastUniforms = {
      ...frame,
      sun: [s.x, s.y, s.z],
      scale,
      pxWorld,
      tanHalfFov,
      logDepthConstant,
    };
  };
  applyFrameUniforms();
  mesh.onBeforeRenderObservable.add(applyFrameUniforms);

  return {
    bodyId,
    mesh,
    material,
    applyFrameUniforms,
    readFrameUniforms: () => lastUniforms,
    dispose: () => {
      mesh.onBeforeRenderObservable.clear();
      material.dispose();
      mesh.dispose();
    },
  };
}
