import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseIntegratorKind } from './parse-integrator';

describe('parseIntegratorKind', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('공식값 velocity-verlet 은 그대로 통과', () => {
    expect(parseIntegratorKind('velocity-verlet')).toBe('velocity-verlet');
  });

  it('공식값 yoshida4 는 그대로 통과', () => {
    expect(parseIntegratorKind('yoshida4')).toBe('yoshida4');
  });

  it("별칭 'verlet' 은 'velocity-verlet' 으로 정규화", () => {
    expect(parseIntegratorKind('verlet')).toBe('velocity-verlet');
  });

  it('대소문자 무시 — YOSHIDA4 → yoshida4', () => {
    expect(parseIntegratorKind('YOSHIDA4')).toBe('yoshida4');
    expect(parseIntegratorKind('Velocity-Verlet')).toBe('velocity-verlet');
  });

  it('null/undefined/빈 문자열은 기본값 velocity-verlet', () => {
    expect(parseIntegratorKind(null)).toBe('velocity-verlet');
    expect(parseIntegratorKind(undefined)).toBe('velocity-verlet');
    expect(parseIntegratorKind('')).toBe('velocity-verlet');
  });

  it('알 수 없는 값은 velocity-verlet 폴백 + console.warn 1회 호출', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseIntegratorKind('rk4')).toBe('velocity-verlet');
    expect(parseIntegratorKind('yoshida2')).toBe('velocity-verlet');
    expect(parseIntegratorKind('invalid')).toBe('velocity-verlet');
    // 별칭 `vv` 는 도입하지 않았으므로 폴백 경로.
    expect(parseIntegratorKind('vv')).toBe('velocity-verlet');
    expect(spy).toHaveBeenCalledTimes(4);
  });
});
