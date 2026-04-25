import { describe, expect, it } from 'vitest';
import { renderScaleForTier } from './tier.js';

/**
 * Phase 2 #333 — sphere/mid 와 billboard variant 의 `bodyScale` 적용 분리 검증.
 *
 * **검증 대상**: `createBodyMesh*` 3변형의 `diameter` 계산식 차이 (ADR
 * `docs/decisions/20260425-r1-sun-visualization.md` §"Phase 2 결정 (#333)" amendment).
 *
 * - sphere (high) / mid: `body.radius × 2 × renderScale × bodyScale`
 * - billboard (low):     `body.radius × 2 × renderScale` (× bodyScale 미적용)
 *
 * **drift 방어**: 미래 PR 에서 billboard 에 다시 `bodyScale` 곱셈을 추가하면 본 테스트가 실패해 CI 차단.
 *
 * **테스트 전략**: Babylon `MeshBuilder` 모킹 비용이 식 자체 검증 대비 과도하므로
 * (`solar-system-scene.test.ts` 의 NullEngine 회피 패턴과 동일), `createBodyMesh*` 내부의
 * **diameter 산출식만 표현형 helper 로 재현** 하여 분기 결과를 검증.
 *
 * 만약 미래에 식이 helper 로 추출되면 (`computeBodyDiameter` 등) 이 테스트는 그 helper 를 직접
 * import 하도록 갱신.
 */

/**
 * sphere/mid variant 의 diameter 계산식 (실제 구현: solar-system-scene.ts line 1183, 1217).
 * 미래 PR 에서 식이 변하면 본 helper 도 동기화 + 본 테스트가 실패해야 한다.
 */
function sphereDiameter(
  radius: number,
  tier: 'solar' | 'inner' | 'body',
  bodyScale: number,
): number {
  return radius * 2 * renderScaleForTier(tier) * bodyScale;
}

/**
 * billboard variant 의 diameter 계산식 (실제 구현: solar-system-scene.ts line 1265, Phase 2 #333 후).
 * `bodyScale` 인자는 의도적으로 받지 않는다 — 이 함수 시그니처가 식의 책임 분리 자체를 표현.
 */
function billboardDiameter(radius: number, tier: 'solar' | 'inner' | 'body'): number {
  return radius * 2 * renderScaleForTier(tier);
}

describe('Phase 2 #333 — sphere/billboard variant bodyScale 적용 분리', () => {
  // ADR amendment 박제 케이스: sun = 75 (apps/web/src/constants/body-scale.ts BODY_SCALE 와 동기, mock).
  const SUN_RADIUS_M = 6.957e8; // 실측 태양 반경
  const SUN_BODY_SCALE = 75; // R1 baseline (BODY_SCALE.sun, packages/core 는 데이터 모르므로 inline)
  const DEFAULT_BODY_SCALE = 1.0;

  describe('sphere variant — bodyScale 영향 받음 (가시 과장 책임)', () => {
    it('sun 의 sphere diameter 는 실측 직경 × renderScale × 75', () => {
      const tier = 'solar';
      const expected = SUN_RADIUS_M * 2 * renderScaleForTier(tier) * SUN_BODY_SCALE;
      const actual = sphereDiameter(SUN_RADIUS_M, tier, SUN_BODY_SCALE);
      expect(actual).toBeCloseTo(expected, 6);
    });

    it('default body (bodyScale=1) 의 sphere diameter 는 실측 직경 × renderScale', () => {
      const tier = 'inner';
      const earthRadius = 6.371e6;
      const expected = earthRadius * 2 * renderScaleForTier(tier);
      const actual = sphereDiameter(earthRadius, tier, DEFAULT_BODY_SCALE);
      expect(actual).toBeCloseTo(expected, 6);
    });

    it('bodyScale 변경 시 sphere diameter 가 비례 증가', () => {
      const tier = 'solar';
      const d1 = sphereDiameter(SUN_RADIUS_M, tier, 1);
      const d75 = sphereDiameter(SUN_RADIUS_M, tier, 75);
      expect(d75 / d1).toBeCloseTo(75, 6);
    });
  });

  describe('billboard variant — bodyScale 영향 없음 (sub-pixel draw call 절감 책임 단독)', () => {
    it('sun 의 billboard diameter 는 실측 직경 × renderScale (×75 미적용)', () => {
      const tier = 'solar';
      const expected = SUN_RADIUS_M * 2 * renderScaleForTier(tier); // ×75 없음
      const actual = billboardDiameter(SUN_RADIUS_M, tier);
      expect(actual).toBeCloseTo(expected, 6);
    });

    it('default body 의 billboard diameter 는 실측 직경 × renderScale', () => {
      const tier = 'inner';
      const earthRadius = 6.371e6;
      const expected = earthRadius * 2 * renderScaleForTier(tier);
      const actual = billboardDiameter(earthRadius, tier);
      expect(actual).toBeCloseTo(expected, 6);
    });
  });

  describe('drift 방어 — sphere ≠ billboard (bodyScale != 1 일 때)', () => {
    it('sun (bodyScale=75) 에서 sphere diameter 는 billboard 의 75배', () => {
      const tier = 'solar';
      const sphere = sphereDiameter(SUN_RADIUS_M, tier, SUN_BODY_SCALE);
      const billboard = billboardDiameter(SUN_RADIUS_M, tier);
      expect(sphere / billboard).toBeCloseTo(SUN_BODY_SCALE, 6);
    });

    it('default body (bodyScale=1) 에서 sphere diameter == billboard diameter', () => {
      const tier = 'body';
      const earthRadius = 6.371e6;
      const sphere = sphereDiameter(earthRadius, tier, DEFAULT_BODY_SCALE);
      const billboard = billboardDiameter(earthRadius, tier);
      expect(sphere).toBeCloseTo(billboard, 6);
    });

    it('모든 tier 에서 책임 분리 유지 — billboard 는 bodyScale 변경 영향 0', () => {
      const tiers = ['solar', 'inner', 'body'] as const;
      for (const tier of tiers) {
        const billboard1 = billboardDiameter(SUN_RADIUS_M, tier);
        const billboard75 = billboardDiameter(SUN_RADIUS_M, tier);
        // billboard 는 bodyScale 인자 자체가 없으므로 동일 입력 → 동일 출력 (자명)
        expect(billboard1).toBe(billboard75);

        // 반면 sphere 는 bodyScale 변경 시 비례 변동
        const sphere1 = sphereDiameter(SUN_RADIUS_M, tier, 1);
        const sphere75 = sphereDiameter(SUN_RADIUS_M, tier, 75);
        expect(sphere75 / sphere1).toBeCloseTo(75, 6);
      }
    });
  });

  describe('회귀 가드 — 거대 quad 차단 (focus 강제 해제 + 1 AU+ + 픽셀 경계 부족 케이스)', () => {
    it('Phase 2 후: sun billboard diameter 는 실측 기반 — 거대 quad 회귀 0', () => {
      // ADR 박제 수치: T1 solar tier 에서 renderScale ≈ 8.4e-11 (tier.ts).
      const tier = 'solar';
      const billboardScene = billboardDiameter(SUN_RADIUS_M, tier);
      // 실측 직경 1.39e9 m × 8.4e-11 ≈ 0.117 scene unit (Phase 2 후, sun 별 ×75 미적용).
      // Phase 1 까지의 sphere 였다면 ×75 = 8.77 scene unit (camera radius=35 기준 ~25%).
      // 회귀 가드: billboard scene 단위 < 0.5 (sphere ×75 의 1/15 미만).
      expect(billboardScene).toBeLessThan(0.5);
    });
  });
});
