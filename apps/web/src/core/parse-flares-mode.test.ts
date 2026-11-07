/**
 * #1428 — `?flares=` 파서 단위 테스트 (ADR `20261107-1428` 결정 5, 사용자 결정 Q5 · Q6 · Q7).
 *
 * 핵심 Behavior: 기본 켜짐 (미지정 = 표시) + `off` 옵트아웃 + 모르는 값 → 켜짐 (+warn) + 소프트웨어 렌더 게이트.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseFlaresVisible, resolveFlaresAtLoad } from './parse-flares-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseFlaresVisible — ?flares= 어휘', () => {
  it('미지정 (null · undefined · 빈 문자열 · 공백) → 켜짐 (Q6 (a))', () => {
    for (const v of [null, undefined, '', '  ']) expect(parseFlaresVisible(v)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('off (대소문자 · 앞뒤 공백 무시) → 꺼짐', () => {
    for (const v of ['off', 'OFF', ' Off ']) expect(parseFlaresVisible(v)).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('on → 켜짐 (warn 없음)', () => {
    for (const v of ['on', 'ON']) expect(parseFlaresVisible(v)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('force 는 어휘가 아니다 → 켜짐 (기본) + warn (CI 강제 셀 없음 — Q7)', () => {
    expect(parseFlaresVisible('force')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
  it('그 외 → 켜짐 (기본) + warn', () => {
    expect(parseFlaresVisible('yes')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('resolveFlaresAtLoad — 소프트웨어 렌더 게이트 (Q7)', () => {
  it('의도 ∧ 허용일 때만 켠다', () => {
    expect(resolveFlaresAtLoad(true, true)).toBe(true);
    expect(resolveFlaresAtLoad(true, false)).toBe(false);
    expect(resolveFlaresAtLoad(false, true)).toBe(false);
    expect(resolveFlaresAtLoad(false, false)).toBe(false);
  });
});
