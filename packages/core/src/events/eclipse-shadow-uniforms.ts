import type { Vec3Double } from '../coords/vec3.js';
import {
  lunarEclipseGeometry,
  solarEclipseCone,
  solarEclipseGeometry,
  type EclipseRadii,
  type LunarEclipseType,
  type SolarEclipseType,
} from './eclipse-geometry.js';

/**
 * #1360 PR2 — 식 그림자 uniform 빌더 (ADR `docs/decisions/20261018-1360-moon-phase-eclipse-shadows.md` 결정 G1 · G2 · R1 ·
 * R4 · R5). Babylon 무의존 순수 함수다 — 입력은 판정식 (`lunarEclipseGeometry`) 과 같은 「지구 중심 달 · 태양 물리 위치 [m]」
 * 이고, 장면은 그 값을 `getPhysicalLocal` (배율 전 위치 — 결정 G3) 로 만든다. 판정 「개기」 와 렌더 「본영」 이 같은 식의
 * 출력이 되도록 기하를 다시 계산하지 않고 판정식 출력 (σ · `Ru` · `Rp` · `S☾`) 을 그대로 쓴다.
 *
 * 좌표계: 입력 · 출력 모두 **데이터 공간** (오른손 황도) 이다. 장면 world 축은 데이터 축의 z 반전이다 (#1366 — 메시 위치 =
 * `S_z((world − origin) × renderScale)`, `coords/scene-handedness.ts`). 그래서 장면이 머티리얼에 쓰기 전에 방향 벡터
 * `a` · `axis` (둘 다 극벡터) 의 z 를 `toSceneZ` 로 바꾼 뒤 셰이더의 world normal 과 내적한다 (`solar-system-scene.ts`
 * `updateLunarShadow`). 길이 · 비율 (`k` · `|a|`) 은 반사에 불변이다. 출력은 방향 · 비율뿐이라 floating origin · tier ·
 * 위성 배율 · bodyScale 과 무관하다 (결정 R6 — 그림자는 천체 반경 단위로 계산).
 */

/**
 * `uEclMode` 값. 셰이더는 `1` 을 월식 (달 머티리얼), `2` 를 일식 (지구 표면 · 구름 머티리얼 — #1360 PR3), 그 밖을 그림자 없음으로
 * 읽는다.
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

/**
 * #1360 PR3 — 일식 그림자 uniform (결정 G2 · R2 · R6). 판정식이 식이 아니라고 하면 (`type === null`, `γ ≥ 1 + l1`) 또는 달이
 * 지구보다 태양 쪽이 아니면 (본문 주석) 그림자 없음 (`mode 0`). 원뿔 파라미터는 판정식과 **같은 함수** (`solarEclipseCone`) 의 출력이다 — 판정 「개기」 와 렌더 「본영」 이 같은
 * `f1` · `f2` 를 쓴다.
 *
 * 지구 반경 단위 기하 (지구 중심 원점, 축 = 태양 → 달):
 *  - `a` = 달 위치 / R⊕.
 *  - `axis` = 그림자 축 단위 벡터 (태양 → 달).
 *  - `k` = `(tan f1, R☾·sec f1 / R⊕, tan f2, R☾·sec f2 / R⊕)` — 표면점 `n` 에서 달까지 축 방향 거리 `z = (n − a)·axis`
 *    [지구 반경] 의 평면에서 반영 반경 `l1 = z·k.x + k.y`, 본영 반경 `l2 = z·k.z − k.w` (음수면 개기 쪽 — 셰이더는 `|l2|`).
 *  - `glow` = 0 (붉은 빛은 월식 전용).
 *
 * 셰이더는 world normal `n` 을 지구 반경 단위의 표면점으로 읽는다 — 그래서 bodyScale 로 지구 화면 크기가 과장돼도 그림자가
 * 지표에서 차지하는 각 영역은 실제와 같다 (결정 R6).
 *
 * @param moon 지구 중심 달 위치 [m] (물리 — 위성 배율 미적용)
 * @param sun 지구 중심 태양 위치 [m]
 * @param out 결과 버퍼 (생략 시 새로 만든다)
 */
export function solarEclipseShadowUniforms(
  moon: Vec3Double,
  sun: Vec3Double,
  radii: EclipseRadii,
  out: EclipseShadowUniforms = noEclipseShadowUniforms(),
): EclipseShadowUniforms {
  const cone = solarEclipseCone(moon, sun, radii);
  // 달이 지구보다 태양 쪽이 아니면 (기본면까지 축 거리 `z = −moon·axis ≤ 0`) 그림자 없음. 판정식 경계식에는 이 조건이 없다 —
  // 사건 경로는 판정식을 삭 근처에서만 부르기 때문이다 (`syzygy-eclipse` phase `new`). 장면은 매 프레임 부르므로 여기서 막는다:
  // 망에서는 `z < 0` 이라 `|l2|` 가 커져 판정식이 「개기」 를 낸다 (단위 테스트 실측 — 2022-11-08 월식 시각).
  if (moon[0] * cone.axis[0] + moon[1] * cone.axis[1] + moon[2] * cone.axis[2] >= 0)
    return setNone(out);
  const g = solarEclipseGeometry(moon, sun, radii);
  if (g.type === null) return setNone(out);

  out.mode = ECLIPSE_SHADOW_MODE.solar;
  out.a[0] = moon[0] / radii.earth;
  out.a[1] = moon[1] / radii.earth;
  out.a[2] = moon[2] / radii.earth;
  out.axis[0] = cone.axis[0];
  out.axis[1] = cone.axis[1];
  out.axis[2] = cone.axis[2];
  out.k[0] = cone.tanF1;
  out.k[1] = cone.moonRadiusSecF1 / radii.earth;
  out.k[2] = cone.tanF2;
  out.k[3] = cone.moonRadiusSecF2 / radii.earth;
  out.glow[0] = 0;
  out.glow[1] = 0;
  out.glow[2] = 0;
  return out;
}

/**
 * uniform 만으로 일식 종류를 다시 분류한다 (DoD D1 확장) — 셰이더가 보는 값 (`a` · `axis` · `k`) 으로 `solarEclipseGeometry` 의
 * 경계식을 다시 세운다. 기본면 (지구 중심을 지나고 축에 수직) 까지 거리 `z = −a·axis`, `γ = |a − (a·axis)·axis|`,
 * `l1 = z·k.x + k.y`, `l2 = z·k.z − k.w`. 경계식은 판정식과 같다 — `γ < 1` 이면 축이 지표에 닿는 점의 본영 반경
 * (`l2 − √(1 − γ²)·k.z`) 부호, `γ < 1 + |l2|` 이면 기본면 `l2` 부호, `γ < 1 + l1` 이면 부분.
 */
export function classifySolarShadowUniforms(
  u: Readonly<EclipseShadowUniforms>,
): SolarEclipseType | null {
  if (u.mode !== ECLIPSE_SHADOW_MODE.solar) return null;
  const along = u.a[0] * u.axis[0] + u.a[1] * u.axis[1] + u.a[2] * u.axis[2];
  const gamma = Math.hypot(
    u.a[0] - u.axis[0] * along,
    u.a[1] - u.axis[1] * along,
    u.a[2] - u.axis[2] * along,
  );
  const z = -along;
  // 빌더는 z ≤ 0 (달이 지구 뒤) 에서 mode 0 을 내므로 여기 도달하지 않는다 — 같은 조건을 그대로 둔다 (uniform 단독 해석).
  if (z <= 0) return null;
  const penumbra = z * u.k[0] + u.k[1];
  const umbra = z * u.k[2] - u.k[3];
  if (gamma < 1) return umbra - Math.sqrt(1 - gamma * gamma) * u.k[2] < 0 ? 'total' : 'annular';
  if (gamma < 1 + Math.abs(umbra)) return umbra < 0 ? 'total' : 'annular';
  if (gamma < 1 + penumbra) return 'partial';
  return null;
}
