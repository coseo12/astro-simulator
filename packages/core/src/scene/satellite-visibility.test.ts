/**
 * Satellite Visibility Guard SSoT 회귀 가드 (#546 R4 Amendment 4 후속).
 *
 * `applySatelliteVisibilityGuard` 5 케이스 검증:
 *   1. earth focus + moon pxDiameter ≥ 4 → LOD low → mid 승격 (정상 활성화)
 *   2. earth focus + moon pxDiameter < 4 → LOD low 유지 + alpha mask 보호 (이견 수용 #1)
 *   3. sun focus + moon → 가드 비활성 (Q2=(a) earth focus 만 정합)
 *   4. earth focus + mercury (parentId='sun') → 가드 비활성 (Q3=(c) parent-child 결합 정합)
 *   5. R5+ 일반화: mars focus + phobos (parentId='mars') → low → mid 승격 자동 수용
 *
 * 참고: `docs/decisions/20260524-546-satellite-billboard-visibility-forensic.md` §4 Concrete Prediction
 */
import { describe, it, expect } from 'vitest';
import { applySatelliteVisibilityGuard } from './satellite-visibility.js';
import { LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER } from './billboard-alpha-mask.js';

describe('satellite-visibility guard (#546 R4 Amendment 4 후속)', () => {
  describe('Q3=(c) parent-child 결합 가드 (정상 발동 케이스)', () => {
    it('earth focus + moon (parentId=earth) + pxDiameter 12 → low → mid 승격 (forensic 1280×720)', () => {
      // forensic 측정 1: earth-focus-initial @ 1280×720 → moon pxDiameter=12.17 / level=low / isVisible=false
      // 본 가드 적용 후 → level=mid 승격 → mid mesh isVisible=true (사용자 인지 충족)
      const effective = applySatelliteVisibilityGuard({
        parentId: 'earth',
        focusedBodyId: 'earth',
        baselineLodLevel: 'low',
        pxDiameter: 12.17,
      });
      expect(effective).toBe('mid');
    });

    it('earth focus + moon + pxDiameter 18.25 (이미 mid) → mid 유지 (가드 비-침범)', () => {
      // forensic 1920×1080 — 이미 mid 진입. 가드는 low → mid floor 강제만 담당, mid 이상 무영향.
      const effective = applySatelliteVisibilityGuard({
        parentId: 'earth',
        focusedBodyId: 'earth',
        baselineLodLevel: 'mid',
        pxDiameter: 18.25,
      });
      expect(effective).toBe('mid');
    });

    it('earth focus + moon + pxDiameter 91.10 (이미 high) → high 유지', () => {
      // forensic moon-focus-direct @ 375×667 — 이미 high. mid floor 가드 비-침범.
      const effective = applySatelliteVisibilityGuard({
        parentId: 'earth',
        focusedBodyId: 'earth',
        baselineLodLevel: 'high',
        pxDiameter: 91.1,
      });
      expect(effective).toBe('high');
    });
  });

  describe('agy cross-validate 이견 수용 #1 — 4 px guard (극소 픽셀 보호)', () => {
    it('earth focus + moon + pxDiameter < 4 → low 유지 (alpha mask Amendment 1 보호)', () => {
      // 자연 거리 12~22 px 는 모두 4 px 이상이라 본 분기 미발동. 미래 R6+ 매우 작은 satellite 보호.
      // 그래픽스 상식: 1~2 px 에 3D sphere 강제 시 aliasing 심화 → billboard low 가 정석.
      const effective = applySatelliteVisibilityGuard({
        parentId: 'earth',
        focusedBodyId: 'earth',
        baselineLodLevel: 'low',
        pxDiameter: 2.5,
      });
      expect(effective).toBe('low');
    });

    it('4 px 임계 경계 — pxDiameter < 4 → low / >= 4 → mid', () => {
      const justBelow = applySatelliteVisibilityGuard({
        parentId: 'earth',
        focusedBodyId: 'earth',
        baselineLodLevel: 'low',
        pxDiameter: LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER - 0.01,
      });
      expect(justBelow).toBe('low');

      const exactlyAt = applySatelliteVisibilityGuard({
        parentId: 'earth',
        focusedBodyId: 'earth',
        baselineLodLevel: 'low',
        pxDiameter: LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER,
      });
      expect(exactlyAt).toBe('mid');
    });
  });

  describe('Q2=(a) earth focus 상태만 — 가드 비활성 케이스', () => {
    it('default sun 시점 (focusedBodyId=null) + moon → 가드 비활성 (baseline 유지)', () => {
      // Amendment 4 moonScale 200 의 "원거리 sub-pixel" 의도 보존. 가드가 default 시점 침범 시
      // moon 이 sun 시점에서 항상 mid 강제 → moonScale 200 의도 회귀 (D5.4 위반).
      const effective = applySatelliteVisibilityGuard({
        parentId: 'earth',
        focusedBodyId: null,
        baselineLodLevel: 'low',
        pxDiameter: 1.57,
      });
      expect(effective).toBe('low');
    });

    it('sun focus + moon → 가드 비활성 (Q2=(a) earth focus 만 정합)', () => {
      const effective = applySatelliteVisibilityGuard({
        parentId: 'earth',
        focusedBodyId: 'sun',
        baselineLodLevel: 'low',
        pxDiameter: 12.17,
      });
      expect(effective).toBe('low');
    });

    it('moon focus 직접 (focusedBodyId=moon, moon.parentId=earth) → 가드 비활성', () => {
      // moon 자신이 focus 면 lod.ts isFocused 분기가 이미 high 강제. 본 가드는 child satellite 한정.
      // (parentId === focusedBodyId 식에서 'earth' !== 'moon' 으로 자동 비활성)
      const effective = applySatelliteVisibilityGuard({
        parentId: 'earth',
        focusedBodyId: 'moon',
        baselineLodLevel: 'high',
        pxDiameter: 49.17,
      });
      expect(effective).toBe('high');
    });
  });

  describe('Q3=(c) 행성 / root body 비-satellite 분기 (가드 비활성)', () => {
    it('earth focus + mercury (parentId=sun) → 가드 비활성 (행성 아닌 satellite 한정)', () => {
      // parentId='sun' 은 행성 — 본 가드는 satellite 한정. 행성 자신은 focus 시 lod.ts isFocused 로 high.
      const effective = applySatelliteVisibilityGuard({
        parentId: 'sun',
        focusedBodyId: 'earth',
        baselineLodLevel: 'low',
        pxDiameter: 2.0,
      });
      expect(effective).toBe('low');
    });

    it('earth focus + sun (parentId=null, root) → 가드 비활성', () => {
      const effective = applySatelliteVisibilityGuard({
        parentId: null,
        focusedBodyId: 'earth',
        baselineLodLevel: 'low',
        pxDiameter: 5.0,
      });
      expect(effective).toBe('low');
    });

    it('earth focus + body without parentId (undefined) → 가드 비활성', () => {
      const effective = applySatelliteVisibilityGuard({
        parentId: undefined,
        focusedBodyId: 'earth',
        baselineLodLevel: 'low',
        pxDiameter: 5.0,
      });
      expect(effective).toBe('low');
    });
  });

  describe('R5+ 자동 수용 — parentId 일반화 검증 (Q3=(c) SSoT)', () => {
    it('R5 mars focus + phobos (parentId=mars) → low → mid 승격 자동', () => {
      // R5 진입 시 R_PHASE_BODY_ALLOWLIST 갱신 1곳 + 본 가드 무수정으로 phobos 자동 수용.
      const effective = applySatelliteVisibilityGuard({
        parentId: 'mars',
        focusedBodyId: 'mars',
        baselineLodLevel: 'low',
        pxDiameter: 10.0,
      });
      expect(effective).toBe('mid');
    });

    it('R6 jupiter focus + io (parentId=jupiter) → low → mid 승격 자동', () => {
      const effective = applySatelliteVisibilityGuard({
        parentId: 'jupiter',
        focusedBodyId: 'jupiter',
        baselineLodLevel: 'low',
        pxDiameter: 8.0,
      });
      expect(effective).toBe('mid');
    });

    it('R7 saturn focus + titan (parentId=saturn) → low → mid 승격 자동', () => {
      const effective = applySatelliteVisibilityGuard({
        parentId: 'saturn',
        focusedBodyId: 'saturn',
        baselineLodLevel: 'low',
        pxDiameter: 6.0,
      });
      expect(effective).toBe('mid');
    });

    it('R6 jupiter focus + io + pxDiameter < 4 → low 유지 (극소 픽셀 보호 자동 수용)', () => {
      // R6+ Galilean 중 카메라 자세에 따라 sub-pixel 가능 — 4 px guard 자동 보호.
      const effective = applySatelliteVisibilityGuard({
        parentId: 'jupiter',
        focusedBodyId: 'jupiter',
        baselineLodLevel: 'low',
        pxDiameter: 3.0,
      });
      expect(effective).toBe('low');
    });
  });

  describe('Split-brain SRP 가드 — 단방향 데이터 흐름 (agy 이견 수용 #2)', () => {
    it('baseline mid 입력 + 가드 비활성 케이스 → mid 그대로 반환 (LOD 엔진 결정 무수정)', () => {
      const effective = applySatelliteVisibilityGuard({
        parentId: null,
        focusedBodyId: null,
        baselineLodLevel: 'mid',
        pxDiameter: 30,
      });
      expect(effective).toBe('mid');
    });

    it('baseline high 입력 + 가드 발동 케이스 → high 유지 (low → mid 만 floor 강제)', () => {
      // 가드는 low → mid 한 방향만 승격. mid/high 는 LOD 엔진 결정 그대로 반환.
      const effective = applySatelliteVisibilityGuard({
        parentId: 'earth',
        focusedBodyId: 'earth',
        baselineLodLevel: 'high',
        pxDiameter: 60,
      });
      expect(effective).toBe('high');
    });
  });
});
