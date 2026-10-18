import type { Vec3Double } from '../coords/vec3.js';
import {
  lunarEclipseGeometry,
  type EclipseRadii,
  type LunarEclipseType,
} from './eclipse-geometry.js';

/**
 * #1360 PR2 — 식 그림자 uniform 빌더 (ADR `docs/decisions/20261018-1360-moon-phase-eclipse-shadows.md` 결정 G1 · G2 · R1 ·
 * R4 · R5). Babylon 무의존 순수 함수다 — 입력은 판정식 (`lunarEclipseGeometry`) 과 같은 「지구 중심 달 · 태양 물리 위치 [m]」
 * 이고, 장면은 그 값을 `getPhysicalLocal` (배율 전 위치 — 결정 G3) 로 만든다. 판정 「개기」 와 렌더 「본영」 이 같은 식의
 * 출력이 되도록 기하를 다시 계산하지 않고 판정식 출력 (σ · `Ru` · `Rp` · `S☾`) 을 그대로 쓴다.
 *
 * 좌표계: 장면 world 축은 물리 위치 축과 같다 (메시 위치 = `(world − origin) × renderScale`, 축 교환 없음). 그래서 이
 * 함수가 만든 방향 벡터를 셰이더의 world normal 과 그대로 내적한다. 출력은 방향 · 비율뿐이라 floating origin · tier ·
 * 위성 배율 · bodyScale 과 무관하다 (결정 R6 — 그림자는 천체 반경 단위로 계산).
 */

/**
 * `uEclMode` 값. 셰이더는 `1` 만 월식으로 읽고 그 밖은 그림자 없음으로 읽는다 — 일식 (`2`) 분기는 PR3 가 더한다.
 */
export const ECLIPSE_SHADOW_MODE = { none: 0, lunar: 1, solar: 2 } as const;
export type EclipseShadowMode = (typeof ECLIPSE_SHADOW_MODE)[keyof typeof ECLIPSE_SHADOW_MODE];

/**
 * 결정 R5 (사용자 결정 Q-L (a)) — 개기 월식 본영 안의 붉은 빛 (명암 `shade` 에 더하는 RGB). Danjon 척도 L = 2 의 표현을 고정
 * 미학 상수로 둔다. 출처: F. Espenak, NASA GSFC 「Danjon Scale of Lunar Eclipse Brightness」
 * (`eclipse.gsfc.nasa.gov/OH/Danjon.html`) — L = 2 는 「짙은 빨강 또는 녹슨 색, 본영 중심은 매우 어둡고 가장자리는 비교적
 * 밝다」. 세기는 사용자 승인 2026-10-18 (「이대로」 — 현행 유지) 로 확정했다. DoD D3 의 R/G 하한 `1.4` 도 그대로다.
 *
 * rendering-only — 식마다의 실제 L 값 데이터는 없다 (Q-L (c) 기각 사유).
 */
export const LUNAR_ECLIPSE_GLOW_RGB: readonly [number, number, number] = [0.16, 0.038, 0.01];

/**
 * 결정 R5 — 본영 중심의 붉은 빛 배율 (본영 경계 = 1). 중심에서 경계로 선형 증가한다 — L = 2 의 「중심은 매우 어둡고 가장자리는
 * 비교적 밝다」. rendering-only 미학 상수.
 */
export const LUNAR_UMBRA_CENTER_GLOW = 0.35;

/**
 * 본영 경계의 부드러운 띠 폭 (본영 반경 비율). 붉은 빛이 이 띠 안에서 0 → 1 로 켜진다 — 반영 (직사광 차폐) 은 거리 선형
 * (결정 R4) 이라 경계에서 이미 연속이고, 붉은 빛만 계단이 되지 않게 한다. ADR §1-F POC 값.
 */
export const LUNAR_UMBRA_EDGE_SOFTNESS = 0.03;

/**
 * 셰이더 uniform 5개의 값 (`uEclMode` · `uEclA` · `uEclAxis` · `uEclK` · `uEclGlow`).
 *
 * 월식 (`mode = 1`, 달 머티리얼) — 달 반경 단위의 하늘면 (축 = 지구 → 달) 기하:
 *  - `a` = `(σ / S☾) · ĉ` — ĉ 는 지구 그림자 중심 → 달 중심 방향 (하늘면 단위 벡터).
 *  - `axis` = 지구 → 달 단위 벡터.
 *  - `k` = `(Ru / S☾, Rp / S☾, LUNAR_UMBRA_CENTER_GLOW, LUNAR_UMBRA_EDGE_SOFTNESS)`.
 *  - `glow` = {@link LUNAR_ECLIPSE_GLOW_RGB}.
 *
 * 셰이더는 표면점 world normal `n` 에 대해 `q = a + (n − (n·axis)·axis)` 의 길이를 그림자 중심 거리로 읽는다.
 */
export interface EclipseShadowUniforms {
  mode: EclipseShadowMode;
  a: [number, number, number];
  axis: [number, number, number];
  k: [number, number, number, number];
  glow: [number, number, number];
}

/** 그림자 없음 — 셰이더 합성이 정확한 항등이 되는 값 (결정 R1). 식이 아닐 때 · 토글이 꺼졌을 때 · 수신 천체가 아닐 때. */
export function noEclipseShadowUniforms(): EclipseShadowUniforms {
  return { mode: 0, a: [0, 0, 0], axis: [0, 0, 1], k: [0, 0, 0, 0], glow: [0, 0, 0] };
}

/** `src` 를 `out` 에 복사한다 (배열 재할당 없음 — 장면이 프레임마다 같은 버퍼를 쓴다). */
export function copyEclipseShadowUniforms(
  src: Readonly<EclipseShadowUniforms>,
  out: EclipseShadowUniforms,
): EclipseShadowUniforms {
  out.mode = src.mode;
  for (let i = 0; i < 3; i += 1) {
    out.a[i] = src.a[i]!;
    out.axis[i] = src.axis[i]!;
    out.glow[i] = src.glow[i]!;
  }
  for (let i = 0; i < 4; i += 1) out.k[i] = src.k[i]!;
  return out;
}

function setNone(out: EclipseShadowUniforms): EclipseShadowUniforms {
  out.mode = 0;
  out.a[0] = 0;
  out.a[1] = 0;
  out.a[2] = 0;
  out.axis[0] = 0;
  out.axis[1] = 0;
  out.axis[2] = 1;
  out.k[0] = 0;
  out.k[1] = 0;
  out.k[2] = 0;
  out.k[3] = 0;
  out.glow[0] = 0;
  out.glow[1] = 0;
  out.glow[2] = 0;
  return out;
}

/**
 * 월식 그림자 uniform (결정 G2 · R2) — 판정식이 식이 아니라고 하면 (`type === null`, `σ ≥ Rp + S☾`) 그림자 없음 (`mode 0`).
 *
 * @param moon 지구 중심 달 위치 [m] (물리 — 위성 배율 미적용)
 * @param sun 지구 중심 태양 위치 [m]
 * @param out 결과 버퍼 (생략 시 새로 만든다)
 */
export function lunarEclipseShadowUniforms(
  moon: Vec3Double,
  sun: Vec3Double,
  radii: EclipseRadii,
  out: EclipseShadowUniforms = noEclipseShadowUniforms(),
): EclipseShadowUniforms {
  const g = lunarEclipseGeometry(moon, sun, radii);
  if (g.type === null) return setNone(out);

  const moonDistance = Math.hypot(moon[0], moon[1], moon[2]);
  const sunDistance = Math.hypot(sun[0], sun[1], sun[2]);
  const mx = moon[0] / moonDistance;
  const my = moon[1] / moonDistance;
  const mz = moon[2] / moonDistance;
  // 반태양 단위 벡터의 하늘면 성분 — 달 중심에서 그림자 중심 쪽. ĉ 는 그 반대 (그림자 중심 → 달 중심).
  const ax = -sun[0] / sunDistance;
  const ay = -sun[1] / sunDistance;
  const az = -sun[2] / sunDistance;
  const along = ax * mx + ay * my + az * mz;
  const px = ax - along * mx;
  const py = ay - along * my;
  const pz = az - along * mz;
  const perp = Math.hypot(px, py, pz);
  const offset = g.separation / g.moonSemiDiameter;
  // 정확히 축 위 (σ = 0) 면 방향이 정의되지 않는다 — 그림자 중심 = 달 중심이므로 a = 0 이 맞다.
  const scale = perp > 0 ? -offset / perp : 0;

  out.mode = ECLIPSE_SHADOW_MODE.lunar;
  out.a[0] = px * scale;
  out.a[1] = py * scale;
  out.a[2] = pz * scale;
  out.axis[0] = mx;
  out.axis[1] = my;
  out.axis[2] = mz;
  out.k[0] = g.umbraRadius / g.moonSemiDiameter;
  out.k[1] = g.penumbraRadius / g.moonSemiDiameter;
  out.k[2] = LUNAR_UMBRA_CENTER_GLOW;
  out.k[3] = LUNAR_UMBRA_EDGE_SOFTNESS;
  out.glow[0] = LUNAR_ECLIPSE_GLOW_RGB[0];
  out.glow[1] = LUNAR_ECLIPSE_GLOW_RGB[1];
  out.glow[2] = LUNAR_ECLIPSE_GLOW_RGB[2];
  return out;
}

/**
 * uniform 만으로 월식 종류를 다시 분류한다 (DoD D1 확장) — 셰이더가 보는 값 (`|a|` = σ/S☾, `k.x` = Ru/S☾, `k.y` = Rp/S☾)
 * 이 판정식과 같은 경계를 갖는지 확인하는 용도다. 경계식은 `lunarEclipseGeometry` 의 `σ < Ru − S☾` · `σ < Ru + S☾` ·
 * `σ < Rp + S☾` 를 S☾ 로 나눈 꼴이다.
 */
export function classifyLunarShadowUniforms(
  u: Readonly<EclipseShadowUniforms>,
): LunarEclipseType | null {
  if (u.mode !== ECLIPSE_SHADOW_MODE.lunar) return null;
  const offset = Math.hypot(u.a[0], u.a[1], u.a[2]);
  if (offset < u.k[0] - 1) return 'total';
  if (offset < u.k[0] + 1) return 'partial';
  if (offset < u.k[1] + 1) return 'penumbral';
  return null;
}
