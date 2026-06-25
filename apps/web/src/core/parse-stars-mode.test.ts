/**
 * #738 — `?stars=` 파서 단위 테스트.
 *
 * 핵심 Behavior: 기본 ON (미지정 = 별 배경 표시) + `?stars=off` 옵트아웃. 본 테스트가
 * 기본 ON 계약의 가드 (fail 시 진입 화면 별 배경 소실 = 조용한 회귀).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { parseStarsVisible, resolveStarfieldVisible } from './parse-stars-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;

beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});

afterEach(() => {
  warnSpy.mockRestore();
});

describe('parseStarsVisible — 기본 ON + ?stars=off 옵트아웃 (ADR §결정 7)', () => {
  // 기본 ON — 트랙 A1 몰입 기본 경험 계약.
  it('미지정 (null) → true (기본 ON — 별 배경 기본 표시)', () => {
    expect(parseStarsVisible(null)).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('undefined → true', () => {
    expect(parseStarsVisible(undefined)).toBe(true);
  });
  it('빈 문자열 → true', () => {
    expect(parseStarsVisible('')).toBe(true);
  });

  // 옵트아웃.
  it('"off" → false (별 배경 숨김)', () => {
    expect(parseStarsVisible('off')).toBe(false);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "OFF" → false', () => {
    expect(parseStarsVisible('OFF')).toBe(false);
  });

  // 명시 on — 기본값과 동일 (하위 호환 / 공유 URL).
  it('"on" → true (warn 없음)', () => {
    expect(parseStarsVisible('on')).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('대소문자 무시 — "On" → true', () => {
    expect(parseStarsVisible('On')).toBe(true);
  });

  // 이상값 — 기본값 true (ON) 폴백 + warn.
  it('이상값 "hidden" → true (기본값 폴백) + console.warn 1회', () => {
    expect(parseStarsVisible('hidden')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
    expect(warnSpy).toHaveBeenCalledWith(expect.stringContaining('알 수 없는 ?stars=hidden'));
  });
  it('이상값 "xyz" → true + warn', () => {
    expect(parseStarsVisible('xyz')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('resolveStarfieldVisible — 소프트웨어 렌더 별 배경 비활성 (ADR §Amendment 2, #745)', () => {
  // #745 — 시그니처가 (starsVisible, allowStarfield: boolean) 로 일반화됨. tier 결합 제거.
  // allowStarfield = !isSoftwareRenderer (sim-canvas 배선). 소프트웨어 렌더 → allowStarfield=false.

  // 소프트웨어 렌더 (allowStarfield=false) — fill-rate graceful degradation. starsVisible 의향과
  // 무관하게 항상 false. 본 단언이 fail 시 CI(항상 swiftshader) fps/r1-guard 회귀 재발 (조용한 차단).
  it('소프트웨어 렌더 (allowStarfield=false) + stars ON → false (별 미생성)', () => {
    expect(resolveStarfieldVisible(true, false)).toBe(false);
  });
  it('소프트웨어 렌더 (allowStarfield=false) + stars OFF → false (이미 off)', () => {
    expect(resolveStarfieldVisible(false, false)).toBe(false);
  });

  // 하드웨어 렌더 (allowStarfield=true) — starsVisible 의향 그대로 전달 (회귀 해소: WebGPU 미지원
  // 하드웨어 가속 PC 도 별 표시, 대다수 사용자 환경).
  it('하드웨어 렌더 (allowStarfield=true) + stars ON → true (별 배경 유지)', () => {
    expect(resolveStarfieldVisible(true, true)).toBe(true);
  });
  it('하드웨어 렌더 (allowStarfield=true) + stars OFF → false (?stars=off 옵트아웃 보존)', () => {
    expect(resolveStarfieldVisible(false, true)).toBe(false);
  });
});
