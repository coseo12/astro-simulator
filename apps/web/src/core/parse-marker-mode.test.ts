/**
 * #675 — `?marker=` / `?ratio=` 파서 단위 테스트.
 *
 * ADR `docs/decisions/20260613-675-glow-pixel-marker.md` §축 6 매트릭스 (파서 행).
 * 핵심 Behavior Change: 미지정 기본값 'off' → **'glow' (기본 ON)** — 본 테스트가
 * 기본 ON 계약의 회귀 가드 (fail 시 default 진입 화면 glow 소실 = 조용한 UX 회귀).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  GLOW_MARKER_RATIO_DEFAULT,
  parseGlowMarkerRatio,
  parseMarkerMode,
} from './parse-marker-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseMarkerMode — 기본 ON + ?marker=off 옵트아웃 (ADR §축 1)', () => {
  // 기본 ON — Behavior Change 핵심 계약.
  it('미지정 (null) → "glow" (기본 ON)', () => {
    expect(parseMarkerMode(null)).toBe('glow');
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('undefined → "glow"', () => {
    expect(parseMarkerMode(undefined)).toBe('glow');
  });
  it('빈 문자열 → "glow"', () => {
    expect(parseMarkerMode('')).toBe('glow');
  });

  // 옵트아웃.
  it('"off" → "off" (옵트아웃 — 기존 동작 100% 보존 경로)', () => {
    expect(parseMarkerMode('off')).toBe('off');
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "OFF" → "off"', () => {
    expect(parseMarkerMode('OFF')).toBe('off');
  });

  // 명시 glow — 하위 호환 (프리뷰 공유 URL 보존).
  it('"glow" 명시 → "glow" (warn 없음)', () => {
    expect(parseMarkerMode('glow')).toBe('glow');
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "Glow" → "glow"', () => {
    expect(parseMarkerMode('Glow')).toBe('glow');
  });

  // 이상값 — 기본값 'glow' 폴백 + warn (parse-gpu-tier "unknown → 기본 동작" 패턴 정합).
  it('이상값 "on" → "glow" (기본값 폴백) + console.warn 1회', () => {
    expect(parseMarkerMode('on')).toBe('glow');
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('알 수 없는 ?marker=on'));
  });
  it('이상값 "xyz" → "glow" + warn', () => {
    expect(parseMarkerMode('xyz')).toBe('glow');
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('parseGlowMarkerRatio — PM 확정 기본 2:1 (ADR §축 7 디버그 파라미터)', () => {
  it('미지정 → 2 (기본 2:1)', () => {
    expect(parseGlowMarkerRatio(null)).toBe(GLOW_MARKER_RATIO_DEFAULT);
    expect(parseGlowMarkerRatio(undefined)).toBe(2);
    expect(parseGlowMarkerRatio('')).toBe(2);
  });
  it('"3" → 3 (3:1 비교값 — 프리뷰 비채택)', () => {
    expect(parseGlowMarkerRatio('3')).toBe(3);
  });
  it('"2.5" → 2.5 (1~10 유한 수 허용)', () => {
    expect(parseGlowMarkerRatio('2.5')).toBe(2.5);
  });
  it('경계 — "1" / "10" 허용', () => {
    expect(parseGlowMarkerRatio('1')).toBe(1);
    expect(parseGlowMarkerRatio('10')).toBe(10);
  });
  it('범위 밖 "0.5" / "11" → 2 폴백 + warn', () => {
    expect(parseGlowMarkerRatio('0.5')).toBe(2);
    expect(parseGlowMarkerRatio('11')).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
  it('비수치 "abc" / "NaN" / "Infinity" → 2 폴백 + warn', () => {
    expect(parseGlowMarkerRatio('abc')).toBe(2);
    expect(parseGlowMarkerRatio('NaN')).toBe(2);
    expect(parseGlowMarkerRatio('Infinity')).toBe(2);
    expect(warnSpy).toHaveBeenCalledTimes(3);
  });
});
