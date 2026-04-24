import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseLodLevel } from './parse-lod-level';

describe('parseLodLevel', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('공식값 high / mid / low 는 그대로 통과', () => {
    expect(parseLodLevel('high')).toBe('high');
    expect(parseLodLevel('mid')).toBe('mid');
    expect(parseLodLevel('low')).toBe('low');
  });

  it("'auto' 는 그대로 통과 (자동 판정 모드)", () => {
    expect(parseLodLevel('auto')).toBe('auto');
  });

  it('대소문자 무시 — HIGH / Mid / LOW / AUTO', () => {
    expect(parseLodLevel('HIGH')).toBe('high');
    expect(parseLodLevel('Mid')).toBe('mid');
    expect(parseLodLevel('LOW')).toBe('low');
    expect(parseLodLevel('AUTO')).toBe('auto');
  });

  it("null / undefined / 빈 문자열 → 'auto' (기본값)", () => {
    expect(parseLodLevel(null)).toBe('auto');
    expect(parseLodLevel(undefined)).toBe('auto');
    expect(parseLodLevel('')).toBe('auto');
  });

  it("알 수 없는 값은 'auto' 폴백 + console.warn 호출", () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseLodLevel('xyz')).toBe('auto');
    expect(parseLodLevel('super-high')).toBe('auto');
    expect(parseLodLevel('ultra')).toBe('auto');
    expect(parseLodLevel('0')).toBe('auto');
    expect(spy).toHaveBeenCalledTimes(4);
    // 첫 호출에 파라미터 값 포함 확인.
    expect(spy.mock.calls[0]?.[0]).toContain('xyz');
  });
});
