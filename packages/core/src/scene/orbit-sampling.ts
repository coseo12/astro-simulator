/**
 * 궤도선 샘플링 순수 함수 모듈 (#627 satellite 분류 SSoT + R10b #664 동적 segments).
 *
 * #850 Phase 1 — `solar-system-scene.ts` 테일에서 **순수 이동** (동작·값 변경 0).
 * 이동 전 위치: `solar-system-scene.ts` 2442-2502. 클로저 참조 0 (전부 순수 함수).
 */
import { Vector3 } from '@babylonjs/core';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import { renderScaleForTier, type Tier } from './tier.js';

/**
 * #627 — 궤도선이 satellite 궤도 (parent 추적 + visual scale 필요) 인지 판정 SSoT.
 *
 * ADR `docs/decisions/20260606-627-satellite-orbit-structure-forensic.md` §5 옵션 A.
 *
 * satellite (moon/phobos/deimos/galilean 등) 의 `sampleOrbitPoints` 는 parent 0 원점 기준
 * ellipse 점을 반환하므로, sun 중심 `orbit-lines` batch 에 넣으면 태양 원점에 잘못 렌더된다
 * (forensic 실측 vertex 54% 원점 밀집). 따라서 parent 가 sun 이 아닌 (= 행성을 도는) body 는
 * parent 별 별도 LineSystem 으로 분리해 (a) position 을 parent scene 좌표로 동기화 +
 * (b) `getOrbitVisualScale(parentId)` scaling 을 적용한다.
 *
 * - parentId === null (sun) → planet batch (false)
 * - parentId === 'sun' (행성) → planet batch (false)
 * - parentId === 'earth'/'mars'/'jupiter' 등 (satellite) → satellite 분리 (true)
 *
 * @param parentId body 의 parentId (LoadedCelestialBody.parentId)
 */
export function isSatelliteOrbit(parentId: string | null | undefined): parentId is string {
  return parentId !== null && parentId !== undefined && parentId !== 'sun';
}

export function sampleOrbitPoints(body: LoadedCelestialBody, tier: Tier): Vector3[] | null {
  if (!body.orbit || !body.parentId) return null;
  const orbit = body.orbit;
  // 궤도 한 바퀴 샘플링 (진근점각 기준 등간격)
  // R10b #664 — 고이심률 (e ≥ 0.6) body 는 256 seg: 진근점각 등간격은 근일점 자동 밀집 +
  // 원일점 희소가 구조라, halley (e 0.967) 원일점측 chord sagitta 가 프레임핏 13.97px 로
  // 다각형 꺾임이 육안 식별됨 (D-T2 실측 발동 — ADR 20260612-r10b §축 3 fix 1순위.
  // 256 seg → 1.52px, eris 식별-불가 기준선 1.10px 근접). 임계 0.6 근거: 실측 검증된 최대
  // OK (eris 0.436 — 꺾임 식별 불가) 와 최소 혜성 (encke 0.848) 사이 — e < 0.6 인 기존
  // 24 body 는 seg 64 불변 (vertex 동일, pixel-diff 기존 궤도선 무영향).
  const segments = orbit.eccentricity >= 0.6 ? 256 : 64; // 성능 최적화 (P1 E3) + 고이심률 예외
  const points: Vector3[] = [];

  const cosO = Math.cos(orbit.longitudeOfAscendingNode);
  const sinO = Math.sin(orbit.longitudeOfAscendingNode);
  const cosI = Math.cos(orbit.inclination);
  const sinI = Math.sin(orbit.inclination);
  const cosW = Math.cos(orbit.argumentOfPeriapsis);
  const sinW = Math.sin(orbit.argumentOfPeriapsis);

  for (let s = 0; s <= segments; s += 1) {
    const nu = (s / segments) * Math.PI * 2;
    const r =
      (orbit.semiMajorAxis * (1 - orbit.eccentricity * orbit.eccentricity)) /
      (1 + orbit.eccentricity * Math.cos(nu));
    const xOrb = r * Math.cos(nu);
    const yOrb = r * Math.sin(nu);
    const x1 = cosW * xOrb - sinW * yOrb;
    const y1 = sinW * xOrb + cosW * yOrb;
    const y2 = cosI * y1;
    const z2 = sinI * y1;
    const x = cosO * x1 - sinO * y2;
    const y = sinO * x1 + cosO * y2;
    // P12-A #298 — orbit line 점도 현재 tier 의 renderScale 로 환산 (원칙 #4 거리 동일 스케일).
    const scale = renderScaleForTier(tier);
    points.push(new Vector3(x * scale, y * scale, z2 * scale));
  }

  return points;
}
