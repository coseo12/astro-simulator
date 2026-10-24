import type { Vec3Double } from '../coords/vec3.js';
import type {
  LoadedCelestialBody,
  LoadedOrbitalElements,
} from '../ephemeris/solar-system-loader.js';
import { orbitMu, orbitalPeriod, positionAt } from './kepler.js';
import { lunarTheoryPositionAt } from './lunar-theory.js';

/**
 * #1354 — 궤도 요소의 시간 변화 (세차 · 평균경도 율, ADR `docs/decisions/20261017-1354-lunar-precession-eclipses.md` 결정 M3 ·
 * M4) 와 #1404 달 이론 위치 (ADR `docs/decisions/20261023-1404-lunar-theory-meeus47.md` 결정 L1 · L3).
 *
 * 장면 Kepler 경로 (`solar-system-scene.ts` `updateAtKepler`) 와 체인 위치 (`body-chain.ts` `resolveBodyChainPosition` —
 * 정보 카드 · 거리 자 · 사건) 가 **같은 함수** `parentRelativePositionAt` 을 부른다 — 함수가 둘이면 parity 가 테스트에
 * 기대고, 하나면 구조로 보장된다 (ADR 1347 §교차검증 합의 5 와 같은 원리).
 *
 * `rates` 도 `lunarTheory` 도 없는 궤도 (달 · 8행성 외 전 천체 — #1406) 는 `positionAt(orbit, jd, orbitMu(body, parent))`
 * 그대로다 — `elementsAt` 가 같은 객체를 돌려주므로 비트 동일 (ADR 1404 DoD D9 · ADR 1406 DoD D10).
 */

const SECONDS_PER_DAY = 86_400;

/**
 * 시각 `jd` 의 궤도 요소 — 결정 M3.
 *
 * `rates` 가 있으면 epoch 를 `jd` 로 옮긴 요소를 만든다 (Δt = jd − epoch, /일):
 * `Ω(t) = Ω₀ + Ω̇·Δt` · `ω(t) = ω₀ + (ϖ̇ − Ω̇)·Δt` · `M(t) = M₀ + (L̇ − ϖ̇)·Δt`,
 * 그리고 #1406 결정 E 의 `a(t) = a₀ + ȧ·Δt` · `e(t) = e₀ + ė·Δt` · `I(t) = I₀ + İ·Δt` (달은 세 율이 `0` 이라 기점 값 그대로).
 * 평균근점이각 율이 `√(μ/a³)` 대신 데이터 율 `L̇ − ϖ̇` 이다 — 「Ω̇ · ϖ̇ 만 더하고 M 율은 Kepler n」 이면 평균경도가
 * 1년에 `40°` 앞서 간다 (ADR 축 M 후보 A1). 반환 요소의 epoch 가 `jd` 라 `positionAt(elementsAt(o, jd), jd, μ)` 의
 * Kepler 항 `n·(jd − epoch)` 은 0 이다 — μ 는 위치에 들어가지 않는다.
 *
 * `rates` 가 없으면 **같은 객체**를 돌려준다 (비트 동일). Δt = 0 (J2000) 에서도 더하는 값이 정확히 0 이라 요소 값은 같다.
 *
 * ⚠️ `rates` 보유 궤도를 `positionAt(orbit, jd, μ)` 에 직접 넣으면 고정 요소 (현행 V0) 위치가 나온다 — 반드시 이 함수를 거친다.
 *
 * **범위 전제** (ADR 1406 결정 E): 율의 검증 범위는 스크러버 1900 ~ 2100 이다 (8행성 율 = JPL SSD 표 1, DE441 대비 실측).
 * 율이 선형이라 범위 밖에서는 e · a 가 물리 범위를 벗어날 수 있다 — 계산상 `e < 0` 이 되는 가장 가까운 시각은 토성 서기
 * `12563` 이고, `e ≥ 1` · `a ≤ 0` 은 서기 `−180,000 ~ +760,000` 밖이다. 클램핑 · 런타임 검사는 두지 않는다.
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
    semiMajorAxis: orbit.semiMajorAxis + rates.semiMajorAxis * dt,
    eccentricity: orbit.eccentricity + rates.eccentricity * dt,
    inclination: orbit.inclination + rates.inclination * dt,
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

/** 위치 계산에 필요한 body 필드만 (web 의 `LoadedCelestialBody` 도 같은 타입). */
export type OrbitPositionBody = Pick<LoadedCelestialBody, 'id' | 'mass' | 'parentId' | 'orbit'>;

/**
 * 모체 기준 위치 [m] — 장면 · 체인 위치의 단일 함수 (ADR 1354 결정 M4 · ADR 1404 결정 L1 · L3). 궤도에 `lunarTheory` 가 있으면
 * 그 이론의 위치 (`lunarTheoryPositionAt` — J2000 황도, 모체 = 지구 중심) 를, 없으면 `positionAt(elementsAt(orbit, jd), jd, μ)`
 * 를 돌려준다. 위성 궤도 시각 배율은 적용하지 않는다 (데이터 SSoT 거리). 시각은 TT JD (ADR 1370).
 *
 * @param _grandparent 모체의 모체. #1404 로 주기 항 인자 (모체의 모체 μ) 가 사라져 지금은 쓰지 않는다 — 호출처 (장면
 *   `updateAtKepler` · `resolveBodyChainPosition`) 의 계약을 바꾸지 않으려고 자리만 남겼다.
 * @throws 궤도가 없을 때.
 */
export function parentRelativePositionAt(
  body: OrbitPositionBody,
  parent: OrbitPositionBody,
  _grandparent: Pick<LoadedCelestialBody, 'mass'> | null | undefined,
  julianDate: number,
): Vec3Double {
  const orbit = body.orbit;
  if (!orbit) throw new Error(`[orbit] ${body.id}: 궤도 없음`);
  if (orbit.lunarTheory) return lunarTheoryPositionAt(orbit.lunarTheory, julianDate);
  return positionAt(elementsAt(orbit, julianDate), julianDate, orbitMu(body, parent));
}
