/**
 * ⚠️ #1274 D13 프리뷰 임시 — `parseIceGiantCandidate` 와 함께 승인 후 삭제한다.
 */
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseIceGiantCandidate } from './parse-ice-giant-candidate';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseIceGiantCandidate — D13 후보 id 정규화 (프리뷰 임시)', () => {
  it('미지정 → undefined (core 테이블 값)', () => {
    expect(parseIceGiantCandidate(null)).toBeUndefined();
    expect(parseIceGiantCandidate(undefined)).toBeUndefined();
  });
  it('빈 문자열 · 공백 → undefined', () => {
    expect(parseIceGiantCandidate('')).toBeUndefined();
    expect(parseIceGiantCandidate('  ')).toBeUndefined();
  });
  it('대소문자 · 앞뒤 공백 정규화 — " B " → "b"', () => {
    expect(parseIceGiantCandidate(' B ')).toBe('b');
  });
  it('유효성은 판정하지 않는다 — 미지 id 도 그대로 전달 (core 가 warn + 테이블 값)', () => {
    expect(parseIceGiantCandidate('zz')).toBe('zz');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
