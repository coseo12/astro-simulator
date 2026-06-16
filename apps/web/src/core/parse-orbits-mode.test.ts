/**
 * #688 — `?orbits=` 파서 단위 테스트.
 *
 * 핵심 Behavior: 기본 ON (미지정 = 현행 동작) + `?orbits=off` 옵트아웃. 본 테스트가
 * 기본 ON 무회귀 계약의 가드 (fail 시 진입 화면 궤도선 소실 = 조용한 회귀).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseOrbitsVisible } from './parse-orbits-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseOrbitsVisible — 기본 ON + ?orbits=off 옵트아웃 (PM Q1)', () => {
  // 기본 ON — 무회귀 핵심 계약.
  it('미지정 (null) → true (기본 ON — 현행 동작 보존)', () => {
    expect(parseOrbitsVisible(null)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('undefined → true', () => {
    expect(parseOrbitsVisible(undefined)).toBe(true);
  });
  it('빈 문자열 → true', () => {
    expect(parseOrbitsVisible('')).toBe(true);
  });

  // 옵트아웃.
  it('"off" → false (궤도선 숨김)', () => {
    expect(parseOrbitsVisible('off')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "OFF" → false', () => {
    expect(parseOrbitsVisible('OFF')).toBe(false);
  });

  // 명시 on — 기본값과 동일 (하위 호환 / 공유 URL).
  it('"on" → true (warn 없음)', () => {
    expect(parseOrbitsVisible('on')).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "On" → true', () => {
    expect(parseOrbitsVisible('On')).toBe(true);
  });

  // 이상값 — 기본값 true (ON) 폴백 + warn.
  it('이상값 "hidden" → true (기본값 폴백) + console.warn 1회', () => {
    expect(parseOrbitsVisible('hidden')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('알 수 없는 ?orbits=hidden'));
  });
  it('이상값 "xyz" → true + warn', () => {
    expect(parseOrbitsVisible('xyz')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
