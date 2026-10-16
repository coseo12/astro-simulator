/**
 * #1347 — `?events=` 파서 단위 테스트 (ADR `20261016-1347` 결정 D7 — 기본 켜짐 · `off` 옵트아웃).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseEventsVisible } from './parse-events-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseEventsVisible — ?events= 어휘', () => {
  it('미지정 (null · undefined · 빈 문자열 · 공백) → 켜짐 (기본, warn 없음)', () => {
    for (const v of [null, undefined, '', '  ']) expect(parseEventsVisible(v)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('on (대소문자 · 공백 무시) → 켜짐', () => {
    for (const v of ['on', 'ON', ' On ']) expect(parseEventsVisible(v)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('off (대소문자 무시) → 꺼짐 (warn 없음)', () => {
    for (const v of ['off', 'OFF', ' off ']) expect(parseEventsVisible(v)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('그 외 → 켜짐 + warn', () => {
    expect(parseEventsVisible('yes')).toBe(true);
    expect(parseEventsVisible('0')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
