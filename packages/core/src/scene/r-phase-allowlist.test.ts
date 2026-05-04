import { describe, expect, it } from 'vitest';
import { R_PHASE_BODY_ALLOWLIST, isRPhaseFocusable } from './r-phase-allowlist.js';

/**
 * #402 R-Phase Body Focus Allowlist SSoT 단위 테스트.
 *
 * ADR `20260504-r-phase-allowlist-guard.md` §결정 1 (SSoT 박제) + §결정 3 (focusOn 가드 helper) 검증.
 */

describe('R_PHASE_BODY_ALLOWLIST — SSoT 박제값', () => {
  it('현재 박제: R1 sun + R2 mercury + R3 venus 순서로 정확히 3개', () => {
    expect(R_PHASE_BODY_ALLOWLIST).toEqual(['sun', 'mercury', 'venus']);
  });

  it('Object.freeze 로 런타임 변경 불가능', () => {
    expect(Object.isFrozen(R_PHASE_BODY_ALLOWLIST)).toBe(true);
  });

  it('readonly tuple 타입 박제 — RPhaseBodyId 추출 가능', () => {
    // 타입 레벨 검증은 컴파일러가 담당. 런타임은 구조만 확인.
    expect(R_PHASE_BODY_ALLOWLIST.length).toBe(3);
  });
});

describe('isRPhaseFocusable — focusOn 가드 helper', () => {
  it('allowlist 박제 body 는 true (sun / mercury / venus)', () => {
    expect(isRPhaseFocusable('sun')).toBe(true);
    expect(isRPhaseFocusable('mercury')).toBe(true);
    expect(isRPhaseFocusable('venus')).toBe(true);
  });

  it('allowlist 외 body 는 false (earth / jupiter / neptune / mars / saturn)', () => {
    expect(isRPhaseFocusable('earth')).toBe(false);
    expect(isRPhaseFocusable('jupiter')).toBe(false);
    expect(isRPhaseFocusable('neptune')).toBe(false);
    expect(isRPhaseFocusable('mars')).toBe(false);
    expect(isRPhaseFocusable('saturn')).toBe(false);
  });

  it('null 은 true — resetCamera / free-fly 경로 차단 금지 (ADR §결정 3)', () => {
    expect(isRPhaseFocusable(null)).toBe(true);
  });

  it('undefined 도 true — resetCamera 동등 처리 (defensive)', () => {
    expect(isRPhaseFocusable(undefined)).toBe(true);
  });

  it('빈 문자열 / 알 수 없는 body 는 false', () => {
    expect(isRPhaseFocusable('')).toBe(false);
    expect(isRPhaseFocusable('unknown-body')).toBe(false);
  });
});
