/**
 * #1373 PR2 — `?constellations=` 파서 단위 테스트 (ADR `20261018-1373` 결정 T1, 사용자 결정 Q-D (a)).
 *
 * 핵심 Behavior: 기본 꺼짐 (미지정 = 숨김) + `on` 옵트인 + 모르는 값 (`force` 포함 — 결정 R5) → 꺼짐 (+warn).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseConstellationsVisible } from './parse-constellations-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseConstellationsVisible — ?constellations= 어휘', () => {
  it('미지정 (null · undefined · 빈 문자열 · 공백) → 꺼짐 (기본 꺼짐, warn 없음)', () => {
    for (const v of [null, undefined, '', '  ']) expect(parseConstellationsVisible(v)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('on (대소문자 무시) → 켜짐', () => {
    for (const v of ['on', 'ON', ' On ']) expect(parseConstellationsVisible(v)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('off (대소문자 무시) → 꺼짐 (warn 없음)', () => {
    for (const v of ['off', 'OFF']) expect(parseConstellationsVisible(v)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('그 외 (force 포함 — 강제 어휘 없음) → 꺼짐 + warn', () => {
    expect(parseConstellationsVisible('yes')).toBe(false);
    expect(parseConstellationsVisible('force')).toBe(false);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});
