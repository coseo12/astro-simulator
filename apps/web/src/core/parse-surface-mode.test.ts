/**
 * #756 — `?surface=` 파서 단위 테스트.
 *
 * 핵심 Behavior: 기본 ON (미지정 = 절차 표면 디테일 표시) + `?surface=off` 옵트아웃 (단색 복귀).
 * 본 테스트가 기본 ON 계약의 가드 (fail 시 절차 표면 소실 = 조용한 회귀).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSurfaceVisible } from './parse-surface-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseSurfaceVisible — 기본 ON + ?surface=off 옵트아웃 (ADR §결정 4)', () => {
  // 기본 ON — 트랙 A 몰입 기본 경험 계약.
  it('미지정 (null) → true (기본 ON — 절차 표면 기본 표시)', () => {
    expect(parseSurfaceVisible(null)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('undefined → true', () => {
    expect(parseSurfaceVisible(undefined)).toBe(true);
  });
  it('빈 문자열 → true', () => {
    expect(parseSurfaceVisible('')).toBe(true);
  });

  // 옵트아웃 — StandardMaterial 현행 단색 복귀.
  it('"off" → false (표면 디테일 숨김, 단색 복귀)', () => {
    expect(parseSurfaceVisible('off')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "OFF" → false', () => {
    expect(parseSurfaceVisible('OFF')).toBe(false);
  });

  // 명시 on — 기본값과 동일 (하위 호환 / 공유 URL).
  it('"on" → true (warn 없음)', () => {
    expect(parseSurfaceVisible('on')).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "On" → true', () => {
    expect(parseSurfaceVisible('On')).toBe(true);
  });

  // 이상값 — 기본값 true (ON) 폴백 + warn.
  it('이상값 "flat" → true (기본값 폴백) + console.warn 1회', () => {
    expect(parseSurfaceVisible('flat')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('알 수 없는 ?surface=flat'));
  });
  it('이상값 "xyz" → true + warn', () => {
    expect(parseSurfaceVisible('xyz')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
