import type { Vec3Double } from '../coords/vec3.js';
import type { LoadedOrbitalElements } from '../ephemeris/solar-system-loader.js';

/**
 * Kepler 2-body 해석해.
 *
 * ADR: docs/phases/architecture.md §5
 * P1: 해석해로 충분 (행성간 섭동 무시, 태양계 단기간 정확도 ±1%)
 * P2+: 심플렉틱 N-body로 교체
 */

const TWO_PI = Math.PI * 2;

/**
 * Kepler 방정식 M = E - e·sin E 를 Newton-Raphson으로 풀어 이심이상 E를 구한다.
 *
 * @param meanAnomaly 평균이상 M [rad]
 * @param eccentricity 이심률 e (0 ≤ e < 1)
 * @param tolerance 수렴 임계 (rad)
 * @param maxIter 최대 반복 횟수
 * @returns 이심이상 E [rad]
 */
export function solveKeplerEquation(
  meanAnomaly: number,
  eccentricity: number,
  tolerance = 1e-10,
  maxIter = 50,
): number {
  if (!(eccentricity >= 0) || eccentricity >= 1) {
    throw new Error(`Kepler 해석해는 타원 궤도 전용 (0 ≤ e < 1), 입력: e=${eccentricity}`);
  }

  // M을 [-π, π]로 정규화 후 초기 추정값
  let M = meanAnomaly % TWO_PI;
  if (M > Math.PI) M -= TWO_PI;
  if (M < -Math.PI) M += TWO_PI;

  // 초기 추정: 낮은 e는 M, 높은 e는 π 근처
  let E = eccentricity < 0.8 ? M : Math.PI * Math.sign(M || 1);

  for (let i = 0; i < maxIter; i += 1) {
    const f = E - eccentricity * Math.sin(E) - M;
    const fp = 1 - eccentricity * Math.cos(E);
    const dE = f / fp;
    E -= dE;
    if (Math.abs(dE) < tolerance) return E;
  }

  throw new Error(
    `Kepler 방정식 수렴 실패 (M=${meanAnomaly}, e=${eccentricity}, maxIter=${maxIter})`,
  );
}

/**
 * 이심이상 E → 진근점각 ν.
 */
export function trueAnomalyFromEccentric(eccentricAnomaly: number, eccentricity: number): number {
  const cosE = Math.cos(eccentricAnomaly);
  const sinE = Math.sin(eccentricAnomaly);
  const e = eccentricity;
  // 표준 공식. atan2로 분기 처리
  return Math.atan2(Math.sqrt(1 - e * e) * sinE, cosE - e);
}

/**
 * 현 시점 평균이상 M(t) — 주어진 궤도와 중심 중력파라미터 μ 하에서.
 *
 * @param elements 궤도 요소
 * @param julianDate 현재 시각 (JD)
 * @param mu 중심 질량체의 중력 파라미터 μ = G·M_central [m^3/s^2]
 */
export function meanAnomalyAt(
  elements: LoadedOrbitalElements,
  julianDate: number,
  mu: number,
): number {
  const a = elements.semiMajorAxis;
  const n = Math.sqrt(mu / (a * a * a)); // 평균 운동 [rad/s]
  const dtSeconds = (julianDate - elements.epoch) * 86_400;
  return elements.meanAnomalyAtEpoch + n * dtSeconds;
}

/**
 * 3D 위치 계산 — 중심 천체(부모) 기준 좌표.
 *
 * 좌표계: 부모 천체의 적도/황도 기준 평면(행성=황도, 달=지구 적도 or 황도).
 * P1에서는 모든 궤도를 같은 기준 평면으로 간주한다 (J2000 ecliptic).
 */
export function positionAt(
  elements: LoadedOrbitalElements,
  julianDate: number,
  mu: number,
): Vec3Double {
  const M = meanAnomalyAt(elements, julianDate, mu);
  const E = solveKeplerEquation(M, elements.eccentricity);
  const nu = trueAnomalyFromEccentric(E, elements.eccentricity);

  const a = elements.semiMajorAxis;
  const e = elements.eccentricity;
  const r = a * (1 - e * Math.cos(E));

  // 궤도면 좌표 (근일점 방향 = +x)
  const xOrb = r * Math.cos(nu);
  const yOrb = r * Math.sin(nu);

  // 3D 회전: Rz(Ω) · Rx(i) · Rz(ω) · (xOrb, yOrb, 0)
  const cosO = Math.cos(elements.longitudeOfAscendingNode);
  const sinO = Math.sin(elements.longitudeOfAscendingNode);
  const cosI = Math.cos(elements.inclination);
  const sinI = Math.sin(elements.inclination);
  const cosW = Math.cos(elements.argumentOfPeriapsis);
  const sinW = Math.sin(elements.argumentOfPeriapsis);

  // Rz(ω) · (xOrb, yOrb, 0)
  const x1 = cosW * xOrb - sinW * yOrb;
  const y1 = sinW * xOrb + cosW * yOrb;
  // Rx(i): y, z 회전
  const x2 = x1;
  const y2 = cosI * y1;
  const z2 = sinI * y1;
  // Rz(Ω)
  const x = cosO * x2 - sinO * y2;
  const y = sinO * x2 + cosO * y2;
  const z = z2;

  return [x, y, z];
}

/**
 * 궤도 공전주기 T = 2π √(a³/μ) [s]
 */
export function orbitalPeriod(semiMajorAxis: number, mu: number): number {
  return TWO_PI * Math.sqrt((semiMajorAxis * semiMajorAxis * semiMajorAxis) / mu);
}
