import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseGpuTier } from './parse-gpu-tier';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseGpuTier — ADR §결정 §3 (DoD #2 + #3)', () => {
  // DoD #2 — 허용값 3건
  it('"a" → "a"', () => {
    expect(parseGpuTier('a')).toBe('a');
  });
  it('"b" → "b"', () => {
    expect(parseGpuTier('b')).toBe('b');
  });
  it('"c" → "c"', () => {
    expect(parseGpuTier('c')).toBe('c');
  });

  // DoD #3 — 값 검증: 허용값 3 + 거부값 1
  it('대소문자 무시 — "A" → "a"', () => {
    expect(parseGpuTier('A')).toBe('a');
  });
  it('대소문자 무시 — "B" → "b"', () => {
    expect(parseGpuTier('B')).toBe('b');
  });
  it('대소문자 무시 — "C" → "c"', () => {
    expect(parseGpuTier('C')).toBe('c');
  });
  it('거부값 "d" → "auto" + console.warn 1회', () => {
    expect(parseGpuTier('d')).toBe('auto');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('알 수 없는 ?gpu=d'));
  });

  // 추가 검증: 명시 auto / 미지정 / 특이값
  it('"auto" 명시 → "auto" (warn 없음)', () => {
    expect(parseGpuTier('auto')).toBe('auto');
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('null → "auto"', () => {
    expect(parseGpuTier(null)).toBe('auto');
  });
  it('undefined → "auto"', () => {
    expect(parseGpuTier(undefined)).toBe('auto');
  });
  it('빈 문자열 → "auto"', () => {
    expect(parseGpuTier('')).toBe('auto');
  });
  it('거부값 "tier-a" → "auto" + warn', () => {
    expect(parseGpuTier('tier-a')).toBe('auto');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
  it('거부값 "xyz" → "auto" + warn', () => {
    expect(parseGpuTier('xyz')).toBe('auto');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
