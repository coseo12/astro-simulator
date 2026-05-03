/**
 * R-Phase Body Allowlist SSoT 단위 테스트.
 *
 * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 1 (SSoT) + §초기 박제값.
 *
 * 본 테스트는 SSoT 박제값 자체와 helper 동작 계약을 박제 — R-Phase 진입 시 4곳 동시 박제
 * 의무 중 1곳 (본 파일) 검증.
 */
import { describe, expect, it } from 'vitest';
import { R_PHASE_BODY_ALLOWLIST, isRPhaseFocusable } from './r-phase-allowlist.js';

describe('R_PHASE_BODY_ALLOWLIST SSoT (#402)', () => {
  it('현재 박제값 = R1 sun + R2 mercury + R3 venus (3 entries)', () => {
    // SSoT 박제값 변경 시 본 테스트가 실패 → R-Phase 진입 절차 (4곳 동시 박제) 트리거.
    expect([...R_PHASE_BODY_ALLOWLIST]).toEqual(['sun', 'mercury', 'venus']);
    expect(R_PHASE_BODY_ALLOWLIST).toHaveLength(3);
  });

  it('readonly tuple — 런타임 freeze 단언 (drift 방지)', () => {
    // Object.freeze 적용 — 런타임에 push/splice/index 할당 차단.
    expect(Object.isFrozen(R_PHASE_BODY_ALLOWLIST)).toBe(true);
  });
});

describe('isRPhaseFocusable() (#402)', () => {
  it('R-Phase allowlist body 는 true 반환 (sun / mercury / venus)', () => {
    expect(isRPhaseFocusable('sun')).toBe(true);
    expect(isRPhaseFocusable('mercury')).toBe(true);
    expect(isRPhaseFocusable('venus')).toBe(true);
  });

  it('R-Phase 미활성 body 는 false 반환 (earth / jupiter / neptune)', () => {
    // R4 진입 전: earth / jupiter / neptune 는 미활성 (FocusQuickButtons 잔존 버튼 회귀 차단).
    expect(isRPhaseFocusable('earth')).toBe(false);
    expect(isRPhaseFocusable('jupiter')).toBe(false);
    expect(isRPhaseFocusable('neptune')).toBe(false);
  });

  it('null / undefined 는 true 반환 — resetCamera bodySelected({id:null}) 경로 허용', () => {
    // ADR §초기 박제값 주석: resetCamera 호출 시 emit 되는 `bodySelected: { id: null }` 경로를
    // 차단하지 않기 위해 null 입력은 통과.
    expect(isRPhaseFocusable(null)).toBe(true);
    expect(isRPhaseFocusable(undefined)).toBe(true);
  });

  it('빈 string / 알 수 없는 string 은 false 반환', () => {
    // 미정의 body id (URL 직접 진입 등) 는 차단 — silent ignore (DoD-3).
    expect(isRPhaseFocusable('')).toBe(false);
    expect(isRPhaseFocusable('mars')).toBe(false);
    expect(isRPhaseFocusable('moon')).toBe(false);
    expect(isRPhaseFocusable('saturn')).toBe(false);
  });
});
