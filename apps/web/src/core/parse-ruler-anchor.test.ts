/**
 * #1341 PR2 — `?ruler=` 파서 단위 테스트 (ADR `20261015-1341` 결정 R7).
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRulerAnchor } from './parse-ruler-anchor';

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseRulerAnchor — ?ruler= 어휘', () => {
  it('키 없음 → null (warn 없음)', () => {
    expect(parseRulerAnchor(null)).toBeNull();
    expect(parseRulerAnchor(undefined)).toBeNull();
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('allowlist 안 id → 그 id (앞뒤 공백 제거, warn 없음)', () => {
    expect(parseRulerAnchor('earth')).toBe('earth');
    expect(parseRulerAnchor(' moon ')).toBe('moon');
    expect(parseRulerAnchor('io')).toBe('io');
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('빈 값 · 미등록 id · 대소문자 다른 id → null + warn', () => {
    expect(parseRulerAnchor('')).toBeNull();
    expect(parseRulerAnchor('  ')).toBeNull();
    expect(parseRulerAnchor('nope')).toBeNull();
    expect(parseRulerAnchor('Earth')).toBeNull();
    expect(warnSpy).toHaveBeenCalledTimes(4);
  });
});
