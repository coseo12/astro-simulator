/**
 * #391 Phase 2 — billboard alpha mask 4px fallback 임계 단위 테스트.
 *
 * ADR `docs/decisions/20260502-391-phase2-billboard.md` §결정 §"developer 단계 작업 명세" §2.
 * cross-validate 이견 수용 #1 — pxDiameter < 4px 진입 시 alpha mask 바이패스.
 *
 * 본 테스트는 순수 헬퍼 함수의 경계 분기만 검증한다 (Babylon scene / DynamicTexture 미의존).
 * 실제 material 토글 동작은 `apps/web/scripts/browser-verify-391-billboard.mjs` 에서 검증.
 */

import { describe, expect, it } from 'vitest';
import {
  LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER,
  shouldApplyBillboardAlphaMask,
} from './solar-system-scene.js';

describe('#391 Phase 2 — shouldApplyBillboardAlphaMask 4px fallback 분기', () => {
  it('SSoT 임계값은 4px (ADR 박제 변경 시 Amendment 의무)', () => {
    // 본 assert 가 fail 하면 ADR `20260502-391-phase2-billboard.md` 박제값과 drift.
    // smoothstep(0.4, 0.5) 의 0.53px 전이 구간이 hardware pixel 1개 미만 → sub-pixel aliasing.
    expect(LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER).toBe(4);
  });

  it('pxDiameter ≥ 4px → alpha mask 적용 (true)', () => {
    expect(shouldApplyBillboardAlphaMask(4.0)).toBe(true);
    expect(shouldApplyBillboardAlphaMask(4.1)).toBe(true); // 경계 직후
    expect(shouldApplyBillboardAlphaMask(7.0)).toBe(true); // mercury 대표값 (~6.8 ~ 13)
    expect(shouldApplyBillboardAlphaMask(15.71)).toBe(true); // venus 대표값 (~12 ~ 16)
    expect(shouldApplyBillboardAlphaMask(100)).toBe(true);
  });

  it('pxDiameter < 4px → alpha mask 바이패스 (false, 사각형 quad 유지)', () => {
    expect(shouldApplyBillboardAlphaMask(3.9)).toBe(false); // 경계 직전
    expect(shouldApplyBillboardAlphaMask(3.0)).toBe(false);
    expect(shouldApplyBillboardAlphaMask(1.5)).toBe(false); // sub-pixel asteroid
    expect(shouldApplyBillboardAlphaMask(0.5)).toBe(false);
  });

  it('비정상 입력 → false (안전 측 fallback)', () => {
    // Number.isFinite 가 NaN / ±Infinity 모두 false 처리 → 헬퍼는 항상 false 반환 (안전).
    // pxDiameter 가 Infinity 인 케이스는 측정 식 이상 신호 (frustum 외 / 0 거리 등) — fallback 이 안전.
    expect(shouldApplyBillboardAlphaMask(0)).toBe(false);
    expect(shouldApplyBillboardAlphaMask(-1)).toBe(false);
    expect(shouldApplyBillboardAlphaMask(NaN)).toBe(false);
    expect(shouldApplyBillboardAlphaMask(Infinity)).toBe(false);
    expect(shouldApplyBillboardAlphaMask(-Infinity)).toBe(false);
  });

  it('Phase 1 baseline forensic SSoT 의 mercury/venus pxDiameter 가 모두 임계 통과', () => {
    // ADR `20260502-391-phase2-billboard.md` Forensic 매트릭스 박제 (8 cell):
    //  - mercury: 6.80 (320×568) ~ 12.94 (1920×1080)
    //  - venus:  12.39 (320×568) ~ 15.71 (1280×720)
    // 6/8 cell 모두 pxDiameter ≥ 4px → alpha mask 적용 → 사용자 D-T2 회귀 차단 직접 보장.
    const phase1Forensic = [
      { id: 'mercury', min: 6.8, max: 12.94 },
      { id: 'venus', min: 12.39, max: 15.71 },
    ];
    for (const { min, max } of phase1Forensic) {
      expect(shouldApplyBillboardAlphaMask(min)).toBe(true);
      expect(shouldApplyBillboardAlphaMask(max)).toBe(true);
    }
  });

  it('#385 라운드 3 후보값 시뮬레이션 — pxDiameter 4px 미만은 fallback 진입', () => {
    // ADR §"결과·재검토 조건 #4" — #385 mercury 700-800 / venus 800-900 인하 시 시뮬.
    // 예: mercuryScale 700 → mercury coverage ≈ 2.65px @ 320×568 dpr1 → fallback 진입 (사각형 유지).
    expect(shouldApplyBillboardAlphaMask(2.65)).toBe(false); // mercury 700 시뮬
    expect(shouldApplyBillboardAlphaMask(3.99)).toBe(false); // 경계 직전 (보호 마진)
  });
});
