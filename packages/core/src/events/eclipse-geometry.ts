import type { Vec3Double } from '../coords/vec3.js';

/**
 * #1354 — 일식 · 월식 판정식 (ADR `docs/decisions/20261017-1354-lunar-precession-eclipses.md` 결정 E2). 위치 모델과 무관한 순수
 * 함수다 — 입력은 지구 중심 달 · 태양 위치 [m] (J2000 황도, 배율 미적용 물리 위치) 와 세 천체 반경 [m].
 *
 * ADR §1-A — 이 판정식을 DE441 위치에 그대로 적용하면 NASA 목록 (6개 10년, 일식 138 · 월식 138) 을 적중 · 종류까지 전건
 * 재현한다. 남는 오차는 위치 모델 쪽이다.
 */

/** 일식 종류 — 혼성은 구별하지 않는다 (사용자 결정 T (a), 축이 지표에 닿는 점의 본영 반경 부호로 개기 / 금환). */
export type SolarEclipseType = 'total' | 'annular' | 'partial';
/** 월식 종류 (사용자 결정 T (a)). */
export type LunarEclipseType = 'total' | 'partial' | 'penumbral';
export type EclipseType = SolarEclipseType | LunarEclipseType;

/** 판정에 쓰는 반경 [m] — 데이터 `radius` (태양 · 지구 · 달). */
export interface EclipseRadii {
  readonly sun: number;
  readonly earth: number;
  readonly moon: number;
}

/**
 * Danjon 방식의 지구 그림자 확대율 — NASA GSFC `LEcat5/shadow.html` 식 (1-5) · (1-6) 의 `1.01` (`≈ 1 + 1/85 − 1/594`, 대기에 의한
 * 그림자 확대). NASA 5천년 월식 목록이 이 방식을 쓴다고 같은 페이지가 밝힌다 (ADR §실측 기준값 출처).
 */
export const DANJON_SHADOW_ENLARGEMENT = 1.01;

export interface SolarEclipseGeometry {
  /** 그림자 축 (태양 → 달) 과 지구 중심 사이 거리 [지구 반경] — 최대식은 이 값의 최소 시각이다 (NASA 정의). */
  readonly gamma: number;
  /** 반영 반경 `l1` [지구 반경, 기본면]. */
  readonly penumbraRadius: number;
  /** 본영 반경 `l2` [지구 반경, 기본면] — 음수면 본영 꼭짓점이 기본면 너머 (개기 쪽). */
  readonly umbraRadius: number;
  readonly type: SolarEclipseType | null;
}

export interface LunarEclipseGeometry {
  /** 달 중심과 지구 그림자 중심 (반태양점) 사이 각 [rad] — 최대식은 이 값의 최소 시각이다 (NASA 정의). */
  readonly separation: number;
  /** 반영 반경 `Rp` [rad]. */
  readonly penumbraRadius: number;
  /** 본영 반경 `Ru` [rad]. */
  readonly umbraRadius: number;
  /** 달 시반경 `S☾` [rad]. */
  readonly moonSemiDiameter: number;
  readonly type: LunarEclipseType | null;
}

function norm(v: Vec3Double): number {
  return Math.hypot(v[0], v[1], v[2]);
}

function dot(a: Vec3Double, b: Vec3Double): number {
  return a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
}

/**
 * #1360 결정 G2 — 일식 그림자 원뿔 파라미터. 판정 (`solarEclipseGeometry`) 과 그림자 렌더 uniform (PR2 · PR3) 이 **같은 함수**
 * 의 출력을 쓴다 — 두 곳이 각자 `f1` · `f2` 를 계산하면 판정 「개기」 와 렌더 「본영」 이 다른 식이 될 수 있다.
 *
 * 그림자 축 위에서 달로부터 축 방향 거리 `z` [m] 인 평면의 반경 [m] 은
 * `l1(z) = z·tanF1 + moonRadiusSecF1` (반영) · `l2(z) = z·tanF2 − moonRadiusSecF2` (본영). `l2` 가 음수면 본영 꼭짓점이 그
 * 평면 너머 (개기 쪽), 양수면 평면이 꼭짓점 너머 (금환 쪽) 다 — 꼭짓점은 `z_v = moonRadiusSecF2 / tanF2`
 * (`SolarEclipseGeometry.umbraRadius` 의 「음수면 본영 꼭짓점이 기본면 너머」 와 같은 주어).
 */
export interface SolarEclipseCone {
  /** 그림자 축 단위 벡터 (태양 → 달). */
  readonly axis: Vec3Double;
  /** 태양–달 거리 [m]. */
  readonly sunMoonDistance: number;
  /** `tan f1` (`sin f1 = (R☉ + R☾)/d`). */
  readonly tanF1: number;
  /** `tan f2` (`sin f2 = (R☉ − R☾)/d`). */
  readonly tanF2: number;
  /** `R☾·sec f1` [m]. */
  readonly moonRadiusSecF1: number;
  /** `R☾·sec f2` [m]. */
  readonly moonRadiusSecF2: number;
}

/**
 * 일식 원뿔 파라미터 (결정 G2) — 입력 규약은 `solarEclipseGeometry` 와 같다.
 *
 * ⚠️ 연산 순서를 바꾸지 마라 — `solarEclipseGeometry` 는 추출 전과 **비트 동일**해야 한다 (#1354 E1 ~ E5 무수정 통과 ·
 * `eclipse-geometry.test.ts` 동결 사본 대조). `tan` · `R☾/cos` 를 따로 계산해 두고 판정식이 같은 순서로 더한다.
 *
 * @param moon 지구 중심 달 위치 [m]
 * @param sun 지구 중심 태양 위치 [m]
 */
export function solarEclipseCone(
  moon: Vec3Double,
  sun: Vec3Double,
  radii: EclipseRadii,
): SolarEclipseCone {
  const toMoon: Vec3Double = [moon[0] - sun[0], moon[1] - sun[1], moon[2] - sun[2]];
  const sunMoonDistance = norm(toMoon);
  const axis: Vec3Double = [
    toMoon[0] / sunMoonDistance,
    toMoon[1] / sunMoonDistance,
    toMoon[2] / sunMoonDistance,
  ];
  const f1 = Math.asin((radii.sun + radii.moon) / sunMoonDistance);
  const f2 = Math.asin((radii.sun - radii.moon) / sunMoonDistance);
  return {
    axis,
    sunMoonDistance,
    tanF1: Math.tan(f1),
    tanF2: Math.tan(f2),
    moonRadiusSecF1: radii.moon / Math.cos(f1),
    moonRadiusSecF2: radii.moon / Math.cos(f2),
  };
}

/**
 * 일식 기하 — 기본면 (지구 중심을 지나고 그림자 축에 수직) 에서 반영 `l1 = z·tan f1 + k·sec f1`, 본영
 * `l2 = z·tan f2 − k·sec f2` (`sin f1 = (R☉ + R☾)/d`, `sin f2 = (R☉ − R☾)/d`, `z` = 달에서 기본면까지, `k = R☾`).
 * 원뿔 파라미터는 `solarEclipseCone` (#1360 결정 G2) 이 만든다.
 *
 * - `γ < 1 + l1` → 식 (부분 이상).
 * - `γ < 1` → 축이 지표에 닿는 점 (기본면에서 달 쪽으로 `√(1 − γ²)`) 의 본영 반경 부호로 개기 (음수) / 금환.
 * - `1 ≤ γ < 1 + |l2|` → 비중심 개기 / 금환 (기본면 `l2` 의 부호).
 *
 * @param moon 지구 중심 달 위치 [m]
 * @param sun 지구 중심 태양 위치 [m]
 */
export function solarEclipseGeometry(
  moon: Vec3Double,
  sun: Vec3Double,
  radii: EclipseRadii,
): SolarEclipseGeometry {
  const cone = solarEclipseCone(moon, sun, radii);
  const u = cone.axis;
  // 달 위치의 축 방향 성분 — 달이 지구보다 태양 쪽이면 음수. 기본면까지 거리 z = −along.
  const along = dot(moon, u);
  const perp: Vec3Double = [moon[0] - u[0] * along, moon[1] - u[1] * along, moon[2] - u[2] * along];
  const gamma = norm(perp) / radii.earth;
  const z = -along;
  const tanF2 = cone.tanF2;
  const penumbraRadius = (z * cone.tanF1 + cone.moonRadiusSecF1) / radii.earth;
  const umbraRadius = (z * tanF2 - cone.moonRadiusSecF2) / radii.earth;

  let type: SolarEclipseType | null = null;
  if (gamma < 1) {
    const surfaceHeight = Math.sqrt(1 - gamma * gamma);
    const umbraAtSurface = umbraRadius - surfaceHeight * tanF2;
    type = umbraAtSurface < 0 ? 'total' : 'annular';
  } else if (gamma < 1 + Math.abs(umbraRadius)) {
    type = umbraRadius < 0 ? 'total' : 'annular';
  } else if (gamma < 1 + penumbraRadius) {
    type = 'partial';
  }
  return { gamma, penumbraRadius, umbraRadius, type };
}

/**
 * 월식 기하 — Danjon 식 (NASA `LEcat5/shadow.html` 1-5 · 1-6): 반영 `Rp = 1.01·P☾ + S☉ + P☉`, 본영
 * `Ru = 1.01·P☾ − S☉ + P☉` (`P` = 지평 시차 `asin(R⊕/d)`, `S` = 시반경). 그림자 중심 이각 `σ` 에 대해
 * `σ < Ru − S☾` 개기 · `σ < Ru + S☾` 부분 · `σ < Rp + S☾` 반영.
 *
 * @param moon 지구 중심 달 위치 [m]
 * @param sun 지구 중심 태양 위치 [m]
 */
export function lunarEclipseGeometry(
  moon: Vec3Double,
  sun: Vec3Double,
  radii: EclipseRadii,
): LunarEclipseGeometry {
  const moonDistance = norm(moon);
  const sunDistance = norm(sun);
  // 반태양점 방향 (−sun) 과 달 방향 사이 각.
  const cosSeparation = -dot(moon, sun) / (moonDistance * sunDistance);
  const separation = Math.acos(Math.min(1, Math.max(-1, cosSeparation)));
  const moonParallax = Math.asin(radii.earth / moonDistance);
  const sunParallax = Math.asin(radii.earth / sunDistance);
  const sunSemiDiameter = Math.asin(radii.sun / sunDistance);
  const moonSemiDiameter = Math.asin(radii.moon / moonDistance);
  const penumbraRadius = DANJON_SHADOW_ENLARGEMENT * moonParallax + sunSemiDiameter + sunParallax;
  const umbraRadius = DANJON_SHADOW_ENLARGEMENT * moonParallax - sunSemiDiameter + sunParallax;

  let type: LunarEclipseType | null = null;
  if (separation < umbraRadius - moonSemiDiameter) type = 'total';
  else if (separation < umbraRadius + moonSemiDiameter) type = 'partial';
  else if (separation < penumbraRadius + moonSemiDiameter) type = 'penumbral';
  return { separation, penumbraRadius, umbraRadius, moonSemiDiameter, type };
}
