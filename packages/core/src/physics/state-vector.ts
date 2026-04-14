/**
 * Kepler 궤도 요소 → 위치·속도 state vector (SI 단위).
 *
 * Newton N-body 적분기(#85)는 초기 상태로 위치·속도를 요구하므로,
 * JPL 궤도 요소에서 수치미분 없이 해석적으로 계산한다.
 *
 * 공식 출처: 표준 천체역학 교과서(Vallado 등) — 궤도면 좌표에서
 *   r = a(1-e²)/(1+e·cos ν)
 *   ṙ   = √(μ/p) · e · sin ν
 *   rν̇  = √(μ/p) · (1 + e·cos ν)
 * 를 3D로 회전한다(Rz(Ω) Rx(i) Rz(ω)).
 */
import type { Vec3Double } from '../coords/vec3.js';
import type { LoadedOrbitalElements } from '../ephemeris/solar-system-loader.js';
import { solveKeplerEquation, meanAnomalyAt, trueAnomalyFromEccentric } from './kepler.js';

export interface StateVector {
  position: Vec3Double;
  velocity: Vec3Double;
}

/**
 * julianDate 시점의 부모 기준 위치(m)·속도(m/s)를 계산한다.
 * mu = G * M_parent.
 */
export function orbitalStateAt(
  elements: LoadedOrbitalElements,
  julianDate: number,
  mu: number,
): StateVector {
  const M = meanAnomalyAt(elements, julianDate, mu);
  const E = solveKeplerEquation(M, elements.eccentricity);
  const nu = trueAnomalyFromEccentric(E, elements.eccentricity);

  const a = elements.semiMajorAxis;
  const e = elements.eccentricity;
  const p = a * (1 - e * e);
  const r = p / (1 + e * Math.cos(nu));

  const cosNu = Math.cos(nu);
  const sinNu = Math.sin(nu);

  // 궤도면(perifocal) 좌표: x = 근일점 방향
  const xOrb = r * cosNu;
  const yOrb = r * sinNu;
  const sqrtMuOverP = Math.sqrt(mu / p);
  const vxOrb = -sqrtMuOverP * sinNu;
  const vyOrb = sqrtMuOverP * (e + cosNu);

  // 회전: Rz(Ω) Rx(i) Rz(ω)
  const cosO = Math.cos(elements.longitudeOfAscendingNode);
  const sinO = Math.sin(elements.longitudeOfAscendingNode);
  const cosI = Math.cos(elements.inclination);
  const sinI = Math.sin(elements.inclination);
  const cosW = Math.cos(elements.argumentOfPeriapsis);
  const sinW = Math.sin(elements.argumentOfPeriapsis);

  const rotate = (x: number, y: number): Vec3Double => {
    const x1 = cosW * x - sinW * y;
    const y1 = sinW * x + cosW * y;
    const y2 = cosI * y1;
    const z2 = sinI * y1;
    const xWorld = cosO * x1 - sinO * y2;
    const yWorld = sinO * x1 + cosO * y2;
    return [xWorld, yWorld, z2];
  };

  return {
    position: rotate(xOrb, yOrb),
    velocity: rotate(vxOrb, vyOrb),
  };
}
