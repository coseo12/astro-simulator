/**
 * #1412 — `?sunspots=` 파서 단위 테스트 (ADR `20261025-1412` 결정 5, 사용자 결정 Q6 · Q9).
 *
 * 핵심 Behavior: 기본 켜짐 (미지정 = 표시) + `off` 옵트아웃 + 모르는 값 → 켜짐 (+warn) + 소프트웨어 렌더 게이트.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseSunspotsVisible, resolveSunspotsAtLoad } from './parse-sunspots-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseSunspotsVisible — ?sunspots= 어휘', () => {
  it('미지정 (null · undefined · 빈 문자열 · 공백) → 켜짐', () => {
    for (const v of [null, undefined, '', '  ']) expect(parseSunspotsVisible(v)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('off (대소문자 · 앞뒤 공백 무시) → 꺼짐', () => {
    for (const v of ['off', 'OFF', ' Off ']) expect(parseSunspotsVisible(v)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('on → 켜짐 (warn 없음)', () => {
    for (const v of ['on', 'ON']) expect(parseSunspotsVisible(v)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('force 는 어휘가 아니다 → 켜짐 (기본) + warn (CI 강제 셀 없음 — 결정 5)', () => {
    expect(parseSunspotsVisible('force')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
  it('그 외 → 켜짐 (기본) + warn', () => {
    expect(parseSunspotsVisible('yes')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('resolveSunspotsAtLoad — 소프트웨어 렌더 게이트 (Q9)', () => {
  it('의도 ∧ 허용일 때만 켠다', () => {
    expect(resolveSunspotsAtLoad(true, true)).toBe(true);
    expect(resolveSunspotsAtLoad(true, false)).toBe(false);
    expect(resolveSunspotsAtLoad(false, true)).toBe(false);
    expect(resolveSunspotsAtLoad(false, false)).toBe(false);
  });
});
