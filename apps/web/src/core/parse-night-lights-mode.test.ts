/**
 * #1226 — `?nightlights=` 파서 단위 테스트 (`parse-cloud-mode.test.ts` 동형).
 *
 * 핵심 Behavior: 기본 ON + `?nightlights=off` 옵트아웃. 신규 가드 `verify:1226-night-lights` 의 OFF 페이지
 * (P2 · P4) 는 이 파싱에 의존한다 — 파싱이 항상 ON 을 내면 ON/OFF 차분이 조용히 `0` 이 된다 (변이 MN-8).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseNightLightCandidate, parseNightLightsVisible } from './parse-night-lights-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseNightLightsVisible — 기본 ON + ?nightlights=off 옵트아웃 (ADR §A11.6)', () => {
  it('미지정 (null) → true (기본 ON)', () => {
    expect(parseNightLightsVisible(null)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('undefined → true', () => {
    expect(parseNightLightsVisible(undefined)).toBe(true);
  });
  it('빈 문자열 → true', () => {
    expect(parseNightLightsVisible('')).toBe(true);
  });

  it('"off" → false', () => {
    expect(parseNightLightsVisible('off')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "OFF" → false', () => {
    expect(parseNightLightsVisible('OFF')).toBe(false);
  });

  it('"on" → true (warn 없음)', () => {
    expect(parseNightLightsVisible('on')).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "On" → true', () => {
    expect(parseNightLightsVisible('On')).toBe(true);
  });

  it('이상값 "none" → true (기본값 폴백) + console.warn 1회', () => {
    expect(parseNightLightsVisible('none')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('알 수 없는 ?nightlights=none'));
  });
});

describe('parseNightLightCandidate — D1 후보 id 정규화 (Phase 1 임시)', () => {
  it('미지정 → undefined (core 기본 후보)', () => {
    expect(parseNightLightCandidate(null)).toBeUndefined();
    expect(parseNightLightCandidate(undefined)).toBeUndefined();
  });
  it('빈 문자열 · 공백 → undefined', () => {
    expect(parseNightLightCandidate('')).toBeUndefined();
    expect(parseNightLightCandidate('  ')).toBeUndefined();
  });
  it('대소문자 · 앞뒤 공백 정규화 — " B " → "b"', () => {
    expect(parseNightLightCandidate(' B ')).toBe('b');
  });
  it('유효성은 판정하지 않는다 — 미지 id 도 그대로 전달 (core 가 warn + 기본 후보)', () => {
    expect(parseNightLightCandidate('zz')).toBe('zz');
    expect(warnSpy).not.toHaveBeenCalled();
  });
});
