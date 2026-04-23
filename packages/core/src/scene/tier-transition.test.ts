/**
 * P12-B #298 — Tier 전환 애니메이션 단위 테스트.
 *
 * ADR `20260423-display-relative-scale-unification.md` §3 배선 원리 — **실거리 보존**:
 *   radius_old / oldScale == radius_new / newScale
 *   ⇒ radius_new = radius_old × (newScale / oldScale)
 *
 * 본 테스트는 수식 레이어 (`computeTargetRadius`, `computeNewMinZ`) 를 순수 함수로 추출해
 * Babylon 의존 없이 산술 불변식을 박제한다. `runTierTransition` 자체는 Babylon Animation /
 * Scene 을 직접 호출하므로 단위 테스트 범위 밖 (통합/브라우저 레이어).
 *
 * ## 불변식 (C1 수식 증명)
 *
 * camera.radius / renderScale = **사용자 관점 실거리 m**. tier 전환 전후 이 값이 보존되면:
 *   1. 카메라-focus body 실거리 불변 (사용자 체감 자연스러움)
 *   2. mesh.diameter_scene = body.radius_m × newScale 로 확대되고, radius 도 동일 배수로
 *      확대되므로 apparent_px = mesh.diameter / radius = const (apparent size 불변)
 *
 * **architect ADR §3 표기 정합성**:
 *   ADR 은 `ratio = newScale/oldScale, radius_new = radius_old / ratio` 로 서술하지만, 이는
 *   방향이 반대 (`radius_new < radius_old` 이면 zoom in 에서 카메라가 mesh 내부에 갇힘).
 *   architect 의 V5 hard fail 승격 근거 "수식이 참이면 V5 자동 충족, 미충족 시 ratio 계산
 *   또는 radius clamp 문제" 는 본 확대 방향 수식을 따를 때 성립 — "수식 버그 감지 센서" 로
 *   기능한다. 본 구현은 직관적 확대 방향 채택 + 주석으로 서술 정합 박제.
 */

import { describe, expect, it } from 'vitest';
import { renderScaleForTier } from './tier.js';
import { computeTargetRadius, computeNewMinZ } from './tier-transition.js';

describe('computeTargetRadius — C1 실거리 보존 불변식', () => {
  it('불변식: radius_old / oldScale == radius_new / newScale (실거리 m 보존)', () => {
    const radiusOld = 30;
    const oldScale = renderScaleForTier('solar'); // 8.4e-11
    const newScale = renderScaleForTier('inner'); // 1.54e-9
    const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
    // 실거리 m = radius / renderScale
    expect(radiusOld / oldScale).toBeCloseTo(radiusNew / newScale, 0); // m 단위로 10 자릿수 차이 허용
    // 비율 정확성
    expect(radiusNew).toBeCloseTo(radiusOld * (newScale / oldScale), 10);
  });

  it('same-tier (oldScale === newScale) 시 radius 불변', () => {
    const radiusOld = 12.34;
    const scale = renderScaleForTier('body');
    expect(computeTargetRadius(radiusOld, scale, scale)).toBe(radiusOld);
  });

  it('T1 → T2: ratio ≈ 18.3 — radius 가 18.3 배 확대 (자연스러운 zoom)', () => {
    const radiusOld = 30;
    const oldScale = renderScaleForTier('solar');
    const newScale = renderScaleForTier('inner');
    const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
    const ratio = newScale / oldScale;
    // ratio ≈ 1.54e-9 / 8.4e-11 ≈ 18.3
    expect(ratio).toBeGreaterThan(15);
    expect(ratio).toBeLessThan(22);
    expect(radiusNew).toBeGreaterThan(radiusOld); // 확대
    expect(radiusNew / radiusOld).toBeCloseTo(ratio, 10);
  });

  it('T1 → T3: ratio ≈ 3e5 — huge ratio 에서도 산술 안정성 유지', () => {
    const radiusOld = 30;
    const oldScale = renderScaleForTier('solar');
    const newScale = renderScaleForTier('body');
    const ratio = newScale / oldScale;
    const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
    expect(ratio).toBeGreaterThan(1e5);
    expect(Number.isFinite(radiusNew)).toBe(true);
    expect(radiusNew).toBeGreaterThan(radiusOld);
    // 실거리 m 보존
    expect(radiusOld / oldScale).toBeCloseTo(radiusNew / newScale, 0);
  });

  it('T3 → T1 (zoom out): ratio < 1 — radius 축소 (대칭성)', () => {
    const radiusOld = 1e6; // T3 에서 지구 관찰 중 radius
    const oldScale = renderScaleForTier('body');
    const newScale = renderScaleForTier('solar');
    const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
    expect(radiusNew).toBeLessThan(radiusOld); // 축소
    // 실거리 m 보존
    expect(radiusOld / oldScale).toBeCloseTo(radiusNew / newScale, 0);
  });

  it('모든 tier 쌍 (3×3) 에서 실거리 불변식 보존', () => {
    const tiers: Array<'solar' | 'inner' | 'body'> = ['solar', 'inner', 'body'];
    const radiusOld = 42;
    for (const from of tiers) {
      for (const to of tiers) {
        const oldScale = renderScaleForTier(from);
        const newScale = renderScaleForTier(to);
        const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
        // 실거리 m 보존 — m 단위 값이 크므로 상대오차 기반 검증
        const realOld = radiusOld / oldScale;
        const realNew = radiusNew / newScale;
        expect(Math.abs(realOld - realNew) / realOld).toBeLessThan(1e-12);
      }
    }
  });

  it('apparent size 불변 간접 증명: mesh.diameter / radius 비율 보존', () => {
    // Phase A setTier: mesh.scaling.setAll(newScale / initialScale)
    //   initialScale === oldScale (첫 setTier 시 초기 tier = 기본 solar)
    //   → 전환 후 mesh.diameter_scene = earth × 2 × newScale  (base × newScale)
    // 지구 반경 (m)
    const earthRadiusM = 6.371e6;

    const oldScale = renderScaleForTier('solar');
    const newScale = renderScaleForTier('body');

    // 전환 전 mesh.diameter_scene = earth × 2 × oldScale × (oldScale / initialScale)
    //   = earth × 2 × oldScale (initialScale === oldScale 이므로)
    const meshDiameterBefore = earthRadiusM * 2 * oldScale;
    const radiusOld = 30;
    const apparentBefore = meshDiameterBefore / radiusOld;

    // 전환 후 mesh.diameter_scene = earth × 2 × oldScale × (newScale / initialScale)
    //   = earth × 2 × newScale
    const meshDiameterAfter = earthRadiusM * 2 * newScale;
    const radiusNew = computeTargetRadius(radiusOld, oldScale, newScale);
    const apparentAfter = meshDiameterAfter / radiusNew;

    // apparent size 불변 — 상대 오차 ≤ 1e-12
    expect(Math.abs(apparentAfter - apparentBefore) / apparentBefore).toBeLessThan(1e-12);
  });
});

describe('computeNewMinZ — V5 clamp 충돌 방어 (위험 #3)', () => {
  it('targetRadius × 0.01 반환 (정상 범위)', () => {
    expect(computeNewMinZ(1)).toBeCloseTo(0.01, 10);
    expect(computeNewMinZ(100)).toBeCloseTo(1, 10);
  });

  it('targetRadius 가 매우 작을 때 floor (1e-6) 적용', () => {
    expect(computeNewMinZ(1e-12)).toBe(1e-6);
    expect(computeNewMinZ(0)).toBe(1e-6);
  });

  it('T1 (radiusOld=30) → T3 전환 시 minZ 가 현실적인 값 (현 minZ 0.01 보다 커짐)', () => {
    const radiusOld = 30;
    const oldScale = renderScaleForTier('solar');
    const newScale = renderScaleForTier('body');
    const targetRadius = computeTargetRadius(radiusOld, oldScale, newScale);
    // targetRadius ≈ 30 × 2.51e-5 / 8.4e-11 ≈ 8.96e6 unit — 매우 큼
    const newMinZ = computeNewMinZ(targetRadius);
    // newMinZ = targetRadius × 0.01 ≈ 8.96e4 — 현 minZ 0.01 보다 훨씬 큼 → minZ 늘리지 않음 (논리: max 비교)
    expect(newMinZ).toBeGreaterThan(0.01);
    expect(newMinZ).toBeCloseTo(targetRadius * 0.01, 5);
  });

  it('T3 → T1 축소 전환 시 minZ 는 floor 로 떨어져 clamp 해소', () => {
    const radiusOld = 1e6; // T3 radius
    const oldScale = renderScaleForTier('body');
    const newScale = renderScaleForTier('solar');
    const targetRadius = computeTargetRadius(radiusOld, oldScale, newScale);
    // targetRadius = 1e6 × 8.4e-11 / 2.51e-5 ≈ 3.35 unit
    const newMinZ = computeNewMinZ(targetRadius);
    expect(newMinZ).toBeCloseTo(0.0335, 4);
  });
});
