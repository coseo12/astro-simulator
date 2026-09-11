/**
 * #1215 — `?clouds=` 파서 단위 테스트 (`parse-surface-mode.test.ts` 동형).
 *
 * 핵심 Behavior: 기본 ON + `?clouds=off` 옵트아웃. `?clouds=off` 는 `verify:1202` G6 재정의의
 * 두 번째 페이지 전제이므로 (ADR §A10.10) 파싱이 항상 ON 을 내면 G6 이 조용히 구름 프레임을 잰다.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseCloudsVisible } from './parse-cloud-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseCloudsVisible — 기본 ON + ?clouds=off 옵트아웃 (ADR §A10.9)', () => {
  it('미지정 (null) → true (기본 ON)', () => {
    expect(parseCloudsVisible(null)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('undefined → true', () => {
    expect(parseCloudsVisible(undefined)).toBe(true);
  });
  it('빈 문자열 → true', () => {
    expect(parseCloudsVisible('')).toBe(true);
  });

  it('"off" → false (구름 미생성 경로)', () => {
    expect(parseCloudsVisible('off')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "OFF" → false', () => {
    expect(parseCloudsVisible('OFF')).toBe(false);
  });

  it('"on" → true (warn 없음)', () => {
    expect(parseCloudsVisible('on')).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "On" → true', () => {
    expect(parseCloudsVisible('On')).toBe(true);
  });

  it('이상값 "none" → true (기본값 폴백) + console.warn 1회', () => {
    expect(parseCloudsVisible('none')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('알 수 없는 ?clouds=none'));
  });
});
