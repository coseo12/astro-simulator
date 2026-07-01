/**
 * #782 — `?rotate=` 파서 단위 테스트.
 *
 * 핵심 Behavior: 기본 ON (미지정 = 자전 표시) + `?rotate=off` 옵트아웃 (자전 정지, snapshot 격리).
 * 본 테스트가 기본 ON 계약의 가드 (fail 시 자전 소실 = 조용한 회귀).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseRotateEnabled } from './parse-rotate-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseRotateEnabled — 기본 ON + ?rotate=off 옵트아웃 (ADR §A2.3 결정 7)', () => {
  // 기본 ON — 트랙 A 몰입 기본 경험 계약.
  it('미지정 (null) → true (기본 ON — 자전 기본 표시)', () => {
    expect(parseRotateEnabled(null)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('undefined → true', () => {
    expect(parseRotateEnabled(undefined)).toBe(true);
  });
  it('빈 문자열 → true', () => {
    expect(parseRotateEnabled('')).toBe(true);
  });

  // 옵트아웃 — 자전 정지 (자전 도입 전 픽셀 100% 복귀, snapshot 가드 격리).
  it('"off" → false (자전 정지, 현행 픽셀 복귀)', () => {
    expect(parseRotateEnabled('off')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "OFF" → false', () => {
    expect(parseRotateEnabled('OFF')).toBe(false);
  });

  // 명시 on — 기본값과 동일 (하위 호환 / 공유 URL).
  it('"on" → true (warn 없음)', () => {
    expect(parseRotateEnabled('on')).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "On" → true', () => {
    expect(parseRotateEnabled('On')).toBe(true);
  });

  // 이상값 — 기본값 true (ON) 폴백 + warn.
  it('이상값 "spin" → true (기본값 폴백) + console.warn 1회', () => {
    expect(parseRotateEnabled('spin')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('알 수 없는 ?rotate=spin'));
  });
  it('이상값 "xyz" → true + warn', () => {
    expect(parseRotateEnabled('xyz')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});
