import { describe, expect, it, vi, afterEach } from 'vitest';
import { parseGrMode } from './parse-gr-mode';

describe('parseGrMode', () => {
  afterEach(() => {
    vi.restoreAllMocks();
  });

  it('공식값 off 는 그대로 통과', () => {
    expect(parseGrMode('off')).toBe('off');
  });

  it('공식값 single-1pn 은 그대로 통과', () => {
    expect(parseGrMode('single-1pn')).toBe('single-1pn');
  });

  it('공식값 eih 는 그대로 통과', () => {
    expect(parseGrMode('eih')).toBe('eih');
  });

  it("별칭 '1' 은 'single-1pn' 으로 정규화 (P5-A 호환)", () => {
    expect(parseGrMode('1')).toBe('single-1pn');
  });

  it("별칭 '1pn' 은 'single-1pn' 으로 정규화", () => {
    expect(parseGrMode('1pn')).toBe('single-1pn');
  });

  it('대소문자 무시 — EIH → eih / 1PN → single-1pn / OFF → off', () => {
    expect(parseGrMode('EIH')).toBe('eih');
    expect(parseGrMode('Eih')).toBe('eih');
    expect(parseGrMode('1PN')).toBe('single-1pn');
    expect(parseGrMode('1Pn')).toBe('single-1pn');
    expect(parseGrMode('OFF')).toBe('off');
    expect(parseGrMode('Off')).toBe('off');
    expect(parseGrMode('Single-1PN')).toBe('single-1pn');
  });

  it('null/undefined/빈 문자열은 기본값 off', () => {
    expect(parseGrMode(null)).toBe('off');
    expect(parseGrMode(undefined)).toBe('off');
    expect(parseGrMode('')).toBe('off');
  });

  it('알 수 없는 값은 off 폴백 + console.warn 1회 호출', () => {
    const spy = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseGrMode('2pn')).toBe('off');
    expect(parseGrMode('kerr')).toBe('off');
    expect(parseGrMode('newton')).toBe('off');
    expect(spy).toHaveBeenCalledTimes(3);
  });
});
