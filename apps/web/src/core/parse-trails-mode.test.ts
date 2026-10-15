/**
 * #1341 — `?trails=` 파서 단위 테스트 (ADR `20261015-1341` 결정 T10, 사용자 결정 Q-T5 (a)).
 *
 * 핵심 Behavior: 기본 꺼짐 (미지정 = 숨김) + `on` 옵트인 + 모르는 값 → 꺼짐 (+warn).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseTrailsVisible } from './parse-trails-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseTrailsVisible — ?trails= 어휘', () => {
  it('미지정 (null · undefined · 빈 문자열 · 공백) → 꺼짐 (기본 꺼짐, warn 없음)', () => {
    for (const v of [null, undefined, '', '  ']) expect(parseTrailsVisible(v)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('on (대소문자 무시) → 켜짐', () => {
    for (const v of ['on', 'ON', ' On ']) expect(parseTrailsVisible(v)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('off (대소문자 무시) → 꺼짐 (warn 없음)', () => {
    for (const v of ['off', 'OFF']) expect(parseTrailsVisible(v)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('그 외 → 꺼짐 + warn', () => {
    expect(parseTrailsVisible('yes')).toBe(false);
    expect(parseTrailsVisible('force')).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
