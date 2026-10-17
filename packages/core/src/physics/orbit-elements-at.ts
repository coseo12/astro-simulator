import { J2000_JD, JULIAN_CENTURY_DAYS } from '@astro-simulator/shared';
import type { Vec3Double } from '../coords/vec3.js';
import type {
  LoadedCelestialBody,
  LoadedOrbitalElements,
  LoadedPeriodicTerm,
} from '../ephemeris/solar-system-loader.js';
import { meanAnomalyAt, orbitMu, orbitalPeriod, positionAt } from './kepler.js';

/**
 * #1354 — 궤도 요소의 시간 변화 (세차 · 평균경도 율) 와 주기 섭동 (ADR `docs/decisions/20261017-1354-lunar-precession-eclipses.md`
 * 결정 M3 · M4).
 *
 * 장면 Kepler 경로 (`solar-system-scene.ts` `updateAtKepler`) 와 체인 위치 (`body-chain.ts` `resolveBodyChainPosition` —
 * 정보 카드 · 거리 자 · 사건) 가 **같은 함수** `parentRelativePositionAt` 을 부른다 — 함수가 둘이면 parity 가 테스트에
 * 기대고, 하나면 구조로 보장된다 (ADR 1347 §교차검증 합의 5 와 같은 원리).
 *
 * `rates` 도 `periodicTerms` 도 없는 궤도 (현재 달 외 전 천체) 는 `positionAt(orbit, jd, orbitMu(body, parent))` 그대로다 —
 * `elementsAt` 가 같은 객체를 돌려주므로 비트 동일 (DoD I1).
 */

const SECONDS_PER_DAY = 86_400;

/**
 * Meeus 47장 — 표 47.A · 47.B 의 M (태양 평균근점이각) 계수 항에 곱하는 지구 궤도 이심률 감소 인자
 * `E = 1 − 0.002516·T − 0.0000074·T²` 의 1차 계수 (T = J2000 기준 율리우스 세기). 2차항은 1900 ~ 2100 에서 `≤ 7.4e-6`
 * 이라 쓰지 않는다 (ADR 측정 스크립트와 같은 식). 항이 M 을 `|k|` 번 가지면 `E^|k|` 를 곱한다.
 */
const EARTH_ECCENTRICITY_FACTOR_PER_CENTURY = 0.002516;

/**
 * 시각 `jd` 의 궤도 요소 — 결정 M3.
 *
 * `rates` 가 있으면 epoch 를 `jd` 로 옮긴 요소를 만든다 (Δt = jd − epoch, rad/일):
 * `Ω(t) = Ω₀ + Ω̇·Δt` · `ω(t) = ω₀ + (ϖ̇ − Ω̇)·Δt` · `M(t) = M₀ + (L̇ − ϖ̇)·Δt`.
 * 평균근점이각 율이 `√(μ/a³)` 대신 데이터 율 `L̇ − ϖ̇` 이다 — 「Ω̇ · ϖ̇ 만 더하고 M 율은 Kepler n」 이면 평균경도가
 * 1년에 `40°` 앞서 간다 (ADR 축 M 후보 A1). 반환 요소의 epoch 가 `jd` 라 `positionAt(elementsAt(o, jd), jd, μ)` 의
 * Kepler 항 `n·(jd − epoch)` 은 0 이다 — μ 는 위치에 들어가지 않는다.
 *
 * `rates` 가 없으면 **같은 객체**를 돌려준다 (비트 동일). Δt = 0 (J2000) 에서도 더하는 값이 정확히 0 이라 요소 값은 같다.
 *
 * ⚠️ `rates` 보유 궤도를 `positionAt(orbit, jd, μ)` 에 직접 넣으면 고정 요소 (현행 V0) 위치가 나온다 — 반드시 이 함수를 거친다.
 */
export function elementsAt(
  orbit: LoadedOrbitalElements,
  julianDate: number,
): LoadedOrbitalElements {
  const rates = orbit.rates;
  if (!rates) return orbit;
  const dt = julianDate - orbit.epoch;
  const dNode = rates.longitudeOfAscendingNode * dt;
  const dPerihelion = rates.longitudeOfPerihelion * dt;
  const dMeanLongitude = rates.meanLongitude * dt;
  return {
    ...orbit,
    longitudeOfAscendingNode: orbit.longitudeOfAscendingNode + dNode,
    argumentOfPeriapsis: orbit.argumentOfPeriapsis + (dPerihelion - dNode),
    meanAnomalyAtEpoch: orbit.meanAnomalyAtEpoch + (dMeanLongitude - dPerihelion),
    epoch: julianDate,
  };
}

/**
 * 평균 운동 [rad/s] — `rates` 가 있으면 `L̇ − ϖ̇` (근점월), 없으면 Kepler `√(μ/a³)` (`meanAnomalyAt` 과 같은 식).
 * 궤적 샘플러 (`trail-sampling.ts`) 와 정보 카드 공전주기가 장면과 같은 율을 쓰도록 둔다.
 */
export function meanMotionOf(orbit: LoadedOrbitalElements, mu: number): number {
  const rates = orbit.rates;
  if (rates) return (rates.meanLongitude - rates.longitudeOfPerihelion) / SECONDS_PER_DAY;
  const a = orbit.semiMajorAxis;
  return Math.sqrt(mu / (a * a * a));
}

/**
 * 항성 공전 주기 [s] — 평균경도가 2π 를 도는 시간 (정보 카드 공전주기 — §교차검증 구현 계약 1). `rates` 가 있으면
 * `2π / L̇` (달 `27.32166` 일 — Kepler `27.32181` 일), 없으면 Kepler `orbitalPeriod(a, μ)` 그대로.
 */
export function siderealPeriodOf(orbit: LoadedOrbitalElements, mu: number): number {
  const rates = orbit.rates;
  if (rates) return (2 * Math.PI * SECONDS_PER_DAY) / rates.meanLongitude;
  return orbitalPeriod(orbit.semiMajorAxis, mu);
}

/** 주기 섭동 합 — 모체 기준 황경 · 황위 [rad] 와 거리 [m] 에 더하는 값. */
export interface PeriodicPerturbation {
  longitude: number;
  latitude: number;
  distance: number;
}

/** 주기 항 인자 [rad] — Meeus 47장 기호 (D 이각 · M 모체 평균근점이각 · M′ 위성 평균근점이각 · F 위도 인수). 감지 않은 연속값. */
export interface PeriodicArguments {
  D: number;
  M: number;
  Mp: number;
  F: number;
}

/**
 * 주기 항 인자 (결정 M4). **모델 자신의 요소**에서 만든다 — 상수를 따로 두지 않는다 (ADR 1347 D2 와 같은 원리):
 * `L′ = Ω + ω + M′` (위성 평균경도) · `F = L′ − Ω` · `D = L′ − L☉` (`L☉ = L_모체 + π` — 모체에서 본 태양) ·
 * `M` = 모체의 평균근점이각 (= 모체에서 본 태양의 평균근점이각). Meeus 다항식 (47.2 – 47.5) 과의 대조는
 * `orbit-elements-at.test.ts` 가 단언한다 — B9 9행은 D 계수가 0 · 2 뿐이라 `+π` 누락이 위치에 드러나지 않는다.
 *
 * @param elements 위성의 시각 요소 (`elementsAt` 결과)
 * @param mu 위성 궤도 μ (`orbitMu(body, parent)`)
 * @param parentOrbit 모체 궤도 요소 (고정 또는 율 보유 — 여기서 `elementsAt` 를 거친다)
 * @param parentMu 모체 궤도 μ (`orbitMu(parent, grandparent)`)
 */
export function periodicArgumentsAt(
  elements: LoadedOrbitalElements,
  mu: number,
  parentOrbit: LoadedOrbitalElements,
  parentMu: number,
  julianDate: number,
): PeriodicArguments {
  const meanAnomaly = meanAnomalyAt(elements, julianDate, mu);
  const meanLongitude =
    elements.longitudeOfAscendingNode + elements.argumentOfPeriapsis + meanAnomaly;
  const parentElements = elementsAt(parentOrbit, julianDate);
  const parentMeanAnomaly = meanAnomalyAt(parentElements, julianDate, parentMu);
  const sunMeanLongitude =
    parentElements.longitudeOfAscendingNode +
    parentElements.argumentOfPeriapsis +
    parentMeanAnomaly +
    Math.PI;
  return {
    D: meanLongitude - sunMeanLongitude,
    M: parentMeanAnomaly,
    Mp: meanAnomaly,
    F: meanLongitude - elements.longitudeOfAscendingNode,
  };
}

/** 주기 섭동 합 (결정 M4) — 인자는 {@link periodicArgumentsAt}. 매개변수도 그 함수와 같다. */
export function periodicPerturbationAt(
  terms: ReadonlyArray<LoadedPeriodicTerm>,
  elements: LoadedOrbitalElements,
  mu: number,
  parentOrbit: LoadedOrbitalElements,
  parentMu: number,
  julianDate: number,
): PeriodicPerturbation {
  const args = periodicArgumentsAt(elements, mu, parentOrbit, parentMu, julianDate);
  const centuries = (julianDate - J2000_JD) / JULIAN_CENTURY_DAYS;
  const eccentricityFactor = 1 - EARTH_ECCENTRICITY_FACTOR_PER_CENTURY * centuries;

  const out: PeriodicPerturbation = { longitude: 0, latitude: 0, distance: 0 };
  for (const t of terms) {
    const arg = t.D * args.D + t.M * args.M + t.Mp * args.Mp + t.F * args.F;
    const amplitude = t.amplitude * eccentricityFactor ** Math.abs(t.M);
    if (t.component === 'distance') out.distance += amplitude * Math.cos(arg);
    else out[t.component] += amplitude * Math.sin(arg);
  }
  return out;
}

/** 모체 기준 직교 좌표에 (Δλ, Δβ, Δr) 를 더한다 — 좌표계는 궤도 요소의 기준 평면 (장면 = J2000 황도). */
function applyPerturbation(p: Vec3Double, d: PeriodicPerturbation): Vec3Double {
  const r = Math.hypot(p[0], p[1], p[2]);
  const longitude = Math.atan2(p[1], p[0]) + d.longitude;
  const latitude = Math.asin(p[2] / r) + d.latitude;
  const distance = r + d.distance;
  const cosLat = Math.cos(latitude);
  return [
    distance * cosLat * Math.cos(longitude),
    distance * cosLat * Math.sin(longitude),
    distance * Math.sin(latitude),
  ];
}

/** 위치 계산에 필요한 body 필드만 (web 의 `LoadedCelestialBody` 도 같은 타입). */
export type OrbitPositionBody = Pick<LoadedCelestialBody, 'id' | 'mass' | 'parentId' | 'orbit'>;

/**
 * 모체 기준 위치 [m] — 장면 · 체인 위치의 단일 함수 (결정 M4). `positionAt(elementsAt(orbit, jd), jd, μ)` 에
 * `periodicTerms` 가 있으면 모체 기준 (λ, β, r) 섭동을 더한다. 위성 궤도 시각 배율은 적용하지 않는다 (데이터 SSoT 거리).
 *
 * @param grandparent 모체의 모체 (주기 항 인자의 모체 μ 용). `periodicTerms` 가 없으면 쓰지 않는다.
 * @throws 궤도가 없거나, `periodicTerms` 가 있는데 모체 궤도 · 모체의 모체가 없을 때 — 로더 검사 (`assertPeriodicTermsHost`)
 *   를 거친 데이터에서는 일어나지 않는다. 조용히 섭동을 빼지 않는다.
 */
export function parentRelativePositionAt(
  body: OrbitPositionBody,
  parent: OrbitPositionBody,
  grandparent: Pick<LoadedCelestialBody, 'mass'> | null | undefined,
  julianDate: number,
): Vec3Double {
  const orbit = body.orbit;
  if (!orbit) throw new Error(`[orbit] ${body.id}: 궤도 없음`);
  const mu = orbitMu(body, parent);
  const elements = elementsAt(orbit, julianDate);
  const p = positionAt(elements, julianDate, mu);
  const terms = orbit.periodicTerms;
  if (!terms) return p;
  if (!parent.orbit || !grandparent) {
    throw new Error(
      `[orbit] ${body.id}: 주기 항 인자에 모체 ${parent.id} 의 궤도 · 모체가 필요하다`,
    );
  }
  const d = periodicPerturbationAt(
    terms,
    elements,
    mu,
    parent.orbit,
    orbitMu(parent, grandparent),
    julianDate,
  );
  return applyPerturbation(p, d);
}
