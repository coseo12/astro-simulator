import { J2000_JD, JULIAN_CENTURY_DAYS } from '@astro-simulator/shared';
import type { Vec3Double } from '../coords/vec3.js';
import type { LoadedLunarTheory, LunarArgumentKey } from '../ephemeris/solar-system-loader.js';

/**
 * #1404 — 달 위치 이론 (ADR `docs/decisions/20261023-1404-lunar-theory-meeus47.md` 결정 L1 · L2 · L5).
 *
 * 출처: J. Meeus, *Astronomical Algorithms* 2판 (1998) 47장 (식 47.1 ~ 47.5 · 표 47.A · 47.B · 부가항) 과 21장 (황도 좌표 세차).
 * 계수 (표 숫자) 는 `solar-system.json` `moon.orbit.lunarTheory` 에 원 단위로 있고, 로더가 rad · m 로 옮긴다. 세차 회전 계수는
 * 달의 물리 데이터가 아니라 좌표계 변환이라 이 파일의 상수다 (결정 L2 마지막 항목).
 *
 * 계산 계약 (결정 L1):
 * 1. 인자 L′ · D · M · M′ · F · A1 · A2 · A3 = T 다항식 [도] → `mod 360` 으로 `[0, 360)` → 라디안.
 * 2. 표 47.A 행마다 `Σl += l·E^|M|·sin θ` · `Σr += r·E^|M|·cos θ`, 표 47.B 행마다 `Σb += b·E^|M|·sin θ`
 *    (`θ = D·D + M·M + M′·M′ + F·F`, `E = 1 − 0.002516 T − 0.0000074 T²`). 부가항도 같은 규칙 (M 계수 0 → `E⁰ = 1`).
 * 3. 날짜 평균 황도 · 분점 `λ₀ = L′ + Σl` · `β₀ = Σb` · `Δ = 385000.56 km + Σr`.
 * 4. Meeus 21장 구면식으로 J2000 황도 · 분점으로 회전 (행렬식이 아니다).
 *
 * ⚠️ **위치 전용** — 속도는 돌려주지 않는다. N-body 초기 상태 · 궤도선 · 궤적은 평균 요소 (`elementsAt`) 를 쓴다 (결정 L4).
 * 이 이론의 속도가 필요해지면 (해석적 미분 또는 수치 미분) 별도 결정이 필요하다.
 *
 * 시각 인자는 TT JD 다 (ADR 1370 §결정 P — 물리 함수 규약). 장면 시계 변환은 진입점의 몫이다.
 */

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;
const FULL_TURN_DEG = 360;

/*
 * Meeus 21장 — 황도 좌표 세차 (출발 epoch T 의 평균 황도 · 분점 → 도착 epoch 의 평균 황도 · 분점, 경과 t [율리우스 세기]).
 * 각 [″] (Π 의 상수항만 [도]):
 *   η = (47.0029 − 0.06603 T + 0.000598 T²) t + (−0.03302 + 0.000598 T) t² + 0.000060 t³
 *   Π = 174.876384° + (3289.4789 T + 0.60622 T²) − (869.8089 + 0.50491 T) t + 0.03536 t²
 *   p = (5029.0966 + 2.22226 T − 0.000042 T²) t + (1.11113 − 0.000042 T) t² − 0.000006 t³
 *
 * `p` 의 선형항 `5029.0966″` 은 로더 율 틀 변환의 `GENERAL_PRECESSION_DEG_PER_CENTURY` (`@astro-simulator/shared`, IAU 2006 `5028.796195″`) 와
 * 출처가 다른 값이다 — 합치지 않는다 (ADR 결정 L2 「다른 일반세차 값과의 관계」). 그 상수는 평균 요소 (궤도선 · 궤적) 의
 * 율에, 이 계수는 이론 위치 회전에만 쓰인다.
 */
const ETA_T1_ARCSEC = [47.0029, -0.06603, 0.000598] as const;
const ETA_T2_ARCSEC = [-0.03302, 0.000598] as const;
const ETA_T3_ARCSEC = 0.00006;
const PI_CONSTANT_DEG = 174.876384;
const PI_T0_ARCSEC = [3289.4789, 0.60622] as const;
const PI_T1_ARCSEC = [869.8089, 0.50491] as const;
const PI_T2_ARCSEC = 0.03536;
const P_T1_ARCSEC = [5029.0966, 2.22226, -0.000042] as const;
const P_T2_ARCSEC = [1.11113, -0.000042] as const;
const P_T3_ARCSEC = -0.000006;

/** 계수 `[c₀, c₁, …]` 의 다항식 값 (Horner). */
function polynomial(coefficients: ReadonlyArray<number>, x: number): number {
  let v = 0;
  for (let i = coefficients.length - 1; i >= 0; i -= 1) v = v * x + coefficients[i]!;
  return v;
}

/** J2000 기준 율리우스 세기 (TT). */
function centuriesSinceJ2000(julianDateTt: number): number {
  return (julianDateTt - J2000_JD) / JULIAN_CENTURY_DAYS;
}

/** 도 단위 각을 `[0, 360)` 에 넣고 라디안으로 바꾼다 (결정 L1-1 — 정규화는 계약이다). */
function normalizedDegToRad(deg: number): number {
  const reduced = deg % FULL_TURN_DEG;
  return (reduced < 0 ? reduced + FULL_TURN_DEG : reduced) * DEG;
}

/**
 * `E^|m|` (결정 L1-2 · L1-3). 표의 `|M|` 은 0 · 1 · 2 뿐이다 — 그 밖의 값이 오면 거듭제곱으로 계산한다 (조용히 1 로 두지 않는다).
 */
function eccentricityPower(e: number, e2: number, m: number): number {
  const k = Math.abs(m);
  if (k === 0) return 1;
  if (k === 1) return e;
  if (k === 2) return e2;
  return e ** k;
}

/** 인자 [rad, `[0, 2π)`] — 결정 L1-1. */
export type LunarArguments = Readonly<Record<LunarArgumentKey, number>>;

/** 시각 `jd` (TT) 의 인자 8개 [rad]. */
export function lunarArgumentsAt(theory: LoadedLunarTheory, julianDateTt: number): LunarArguments {
  const T = centuriesSinceJ2000(julianDateTt);
  const a = theory.meanArgumentsDeg;
  return {
    Lp: normalizedDegToRad(polynomial(a.Lp, T)),
    D: normalizedDegToRad(polynomial(a.D, T)),
    M: normalizedDegToRad(polynomial(a.M, T)),
    Mp: normalizedDegToRad(polynomial(a.Mp, T)),
    F: normalizedDegToRad(polynomial(a.F, T)),
    A1: normalizedDegToRad(polynomial(a.A1, T)),
    A2: normalizedDegToRad(polynomial(a.A2, T)),
    A3: normalizedDegToRad(polynomial(a.A3, T)),
  };
}

/** 지구 중심 황도 구면 좌표 — 경도 · 위도 [rad], 거리 [m]. */
export interface LunarEclipticPosition {
  longitude: number;
  latitude: number;
  distance: number;
}

/**
 * 날짜 평균 황도 · 분점의 달 위치 (결정 L1-1 ~ L1-4 — 회전 전). Meeus 예제 47.a 와 같은 단계의 출력이다.
 * 경도는 `L′ ∈ [0, 2π)` 에 Σl 을 더한 값이라 `[0, 2π)` 를 조금 벗어날 수 있다 (감지 않는다).
 */
export function lunarEclipticOfDate(
  theory: LoadedLunarTheory,
  julianDateTt: number,
): LunarEclipticPosition {
  const T = centuriesSinceJ2000(julianDateTt);
  const args = lunarArgumentsAt(theory, julianDateTt);
  const e = polynomial(theory.eccentricityFactor, T);
  const e2 = e * e;
  const { D, M, Mp, F } = args;

  let sumLongitude = 0;
  let sumDistance = 0;
  const lr = theory.longitudeDistanceTerms;
  for (let i = 0; i < lr.length; i += 1) {
    const t = lr[i]!;
    const theta = t.D * D + t.M * M + t.Mp * Mp + t.F * F;
    const factor = eccentricityPower(e, e2, t.M);
    sumLongitude += t.longitude * factor * Math.sin(theta);
    sumDistance += t.distance * factor * Math.cos(theta);
  }
  let sumLatitude = 0;
  const b = theory.latitudeTerms;
  for (let i = 0; i < b.length; i += 1) {
    const t = b[i]!;
    const theta = t.D * D + t.M * M + t.Mp * Mp + t.F * F;
    sumLatitude += t.latitude * eccentricityPower(e, e2, t.M) * Math.sin(theta);
  }
  const additive = theory.additiveTerms;
  for (let i = 0; i < additive.length; i += 1) {
    const t = additive[i]!;
    let theta = 0;
    let m = 0;
    for (let j = 0; j < t.argument.length; j += 1) {
      const [key, coefficient] = t.argument[j]!;
      theta += coefficient * args[key];
      if (key === 'M') m = coefficient;
    }
    const v = t.amplitude * eccentricityPower(e, e2, m) * Math.sin(theta);
    if (t.component === 'longitude') sumLongitude += v;
    else sumLatitude += v;
  }

  return {
    longitude: args.Lp + sumLongitude,
    latitude: sumLatitude,
    distance: theory.meanDistance + sumDistance,
  };
}

/** 황도 세차 각 (Meeus 21장 η · Π · p) [rad]. */
export interface EclipticPrecessionAngles {
  eta: number;
  Pi: number;
  p: number;
}

/**
 * 시각 `jd` (TT) 의 평균 황도 · 분점 → J2000 평균 황도 · 분점 세차 각 (결정 L1-5). 출발 epoch = `jd` (T), 도착 = J2000 이라
 * 경과 `t = −T` 다. J2000 에서 `η = p = 0`.
 */
export function eclipticPrecessionAnglesToJ2000(julianDateTt: number): EclipticPrecessionAngles {
  const T = centuriesSinceJ2000(julianDateTt);
  const t = -T;
  const eta =
    (polynomial(ETA_T1_ARCSEC, T) * t +
      polynomial(ETA_T2_ARCSEC, T) * t * t +
      ETA_T3_ARCSEC * t * t * t) *
    ARCSEC;
  const Pi =
    PI_CONSTANT_DEG * DEG +
    ((PI_T0_ARCSEC[0] + PI_T0_ARCSEC[1] * T) * T -
      polynomial(PI_T1_ARCSEC, T) * t +
      PI_T2_ARCSEC * t * t) *
      ARCSEC;
  const p =
    (polynomial(P_T1_ARCSEC, T) * t +
      polynomial(P_T2_ARCSEC, T) * t * t +
      P_T3_ARCSEC * t * t * t) *
    ARCSEC;
  return { eta, Pi, p };
}

/**
 * 날짜 평균 황도 좌표 (λ₀, β₀) 를 J2000 평균 황도 좌표로 옮긴다 — Meeus 21장 구면식 (결정 L1-5):
 * `A = cos η cos β₀ sin(Π − λ₀) − sin η sin β₀` · `B = cos β₀ cos(Π − λ₀)` · `C = cos η sin β₀ + sin η cos β₀ sin(Π − λ₀)`,
 * `λ = p + Π − atan2(A, B)` · `β = asin(C)`. 거리는 바뀌지 않는다.
 */
export function eclipticOfDateToJ2000(
  position: LunarEclipticPosition,
  julianDateTt: number,
): LunarEclipticPosition {
  const { eta, Pi, p } = eclipticPrecessionAnglesToJ2000(julianDateTt);
  const cosEta = Math.cos(eta);
  const sinEta = Math.sin(eta);
  const cosB = Math.cos(position.latitude);
  const sinB = Math.sin(position.latitude);
  const sinPiL = Math.sin(Pi - position.longitude);
  const A = cosEta * cosB * sinPiL - sinEta * sinB;
  const B = cosB * Math.cos(Pi - position.longitude);
  const C = cosEta * sinB + sinEta * cosB * sinPiL;
  return {
    longitude: p + Pi - Math.atan2(A, B),
    latitude: Math.asin(C),
    distance: position.distance,
  };
}

/** 황도 구면 → 직교 [m] (`(Δ cos β cos λ, Δ cos β sin λ, Δ sin β)`). */
export function eclipticToCartesian(position: LunarEclipticPosition): Vec3Double {
  const cosB = Math.cos(position.latitude);
  return [
    position.distance * cosB * Math.cos(position.longitude),
    position.distance * cosB * Math.sin(position.longitude),
    position.distance * Math.sin(position.latitude),
  ];
}

/**
 * 달의 지구 중심 위치 [m] — J2000 황도 · 분점 (장면 데이터 좌표, 모체 = 지구 중심). 결정 L1 의 전 단계.
 * **위치 전용** (속도 없음 — 파일 머리말).
 */
export function lunarTheoryPositionAt(theory: LoadedLunarTheory, julianDateTt: number): Vec3Double {
  return eclipticToCartesian(
    eclipticOfDateToJ2000(lunarEclipticOfDate(theory, julianDateTt), julianDateTt),
  );
}
