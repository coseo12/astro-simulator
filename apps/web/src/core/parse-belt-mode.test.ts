/**
 * #1319 PR3 — `?belt=` · `?kuiper=` 파서 단위 테스트 (ADR `20261008-1319` 결정 3 · 6, 사용자 결정 Q5).
 *
 * 핵심 Behavior: 기본 켜짐 (미지정 = 표시) + `off` 옵트아웃 + 기존 숫자 의미 (`?belt=N` = 수 · 강제 생성) 유지.
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { ASTEROID_BELT_MAX_N } from '@astro-simulator/core';
import {
  parseBeltParam,
  parseBeltVisible,
  parseKuiperVisible,
  resolveBeltAtLoad,
} from './parse-belt-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

const ON_DEFAULT = { visible: true, count: null, forced: false };
const OFF = { visible: false, count: null, forced: false };

describe('parseBeltParam — ?belt= 어휘', () => {
  it('미지정 (null · undefined · 빈 문자열) → 켜짐 · 수 미지정 · 강제 아님 (기본 켜짐)', () => {
    for (const v of [null, undefined, '', '  ']) expect(parseBeltParam(v)).toEqual(ON_DEFAULT);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('off (대소문자 무시) → 꺼짐', () => {
    for (const v of ['off', 'OFF', 'Off']) expect(parseBeltParam(v)).toEqual(OFF);
  });

  it('on → 켜짐 · 기본 수 (warn 없음)', () => {
    expect(parseBeltParam('on')).toEqual(ON_DEFAULT);
    expect(parseBeltParam('ON')).toEqual(ON_DEFAULT);
    expect(warnSpy).not.toHaveBeenCalled();
  });

  it('0 → 꺼짐 (현행 의미 보존)', () => {
    expect(parseBeltParam('0')).toEqual(OFF);
  });

  it('N ≥ 1 → 켜짐 + 수 N + 강제 생성', () => {
    expect(parseBeltParam('1')).toEqual({ visible: true, count: 1, forced: true });
    expect(parseBeltParam('200')).toEqual({ visible: true, count: 200, forced: true });
    expect(parseBeltParam('3900')).toEqual({ visible: true, count: 3900, forced: true });
  });

  it('상한 초과는 ASTEROID_BELT_MAX_N 으로 clamp (core 상수 단일 출처) · 상한 그대로는 통과', () => {
    expect(ASTEROID_BELT_MAX_N).toBe(10_000);
    expect(parseBeltParam(String(ASTEROID_BELT_MAX_N))).toEqual({
      visible: true,
      count: ASTEROID_BELT_MAX_N,
      forced: true,
    });
    expect(parseBeltParam('25000')).toEqual({
      visible: true,
      count: ASTEROID_BELT_MAX_N,
      forced: true,
    });
  });

  it('소수 · 음수는 내림 후 판정 — 1.9 → 1 · 0.5 → 꺼짐 · -5 → 꺼짐 (-5 는 구 clamp 결과 0 과 같은 의미, 0.5 는 구 파서가 생성 경로로 보냈다 — 파서 머리말)', () => {
    expect(parseBeltParam('1.9')).toEqual({ visible: true, count: 1, forced: true });
    expect(parseBeltParam('0.5')).toEqual(OFF);
    expect(parseBeltParam('-5')).toEqual(OFF);
  });

  it('그 외 → 켜짐 (기본) + warn 1회 — 기존 parse-*-mode 의 「모르는 값 → 기본 동작」', () => {
    expect(parseBeltParam('lots')).toEqual(ON_DEFAULT);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });

  it('parseBeltVisible = 의도만 (표시 토글 표의 역방향 파서)', () => {
    expect(parseBeltVisible(null)).toBe(true);
    expect(parseBeltVisible('off')).toBe(false);
    expect(parseBeltVisible('0')).toBe(false);
    expect(parseBeltVisible('1000')).toBe(true);
    expect(parseBeltVisible('x')).toBe(true);
  });
});

describe('parseKuiperVisible — ?kuiper= 어휘 (on/off)', () => {
  it('미지정 → 켜짐 · off → 꺼짐 · on → 켜짐 · 그 외 → 켜짐 + warn', () => {
    expect(parseKuiperVisible(null)).toBe(true);
    expect(parseKuiperVisible(undefined)).toBe(true);
    expect(parseKuiperVisible('')).toBe(true);
    expect(parseKuiperVisible('off')).toBe(false);
    expect(parseKuiperVisible('OFF')).toBe(false);
    expect(parseKuiperVisible('on')).toBe(true);
    expect(warnSpy).not.toHaveBeenCalled();
    expect(parseKuiperVisible('0')).toBe(true);
    expect(warnSpy).toHaveBeenCalledTimes(1);
  });
});

describe('resolveBeltAtLoad — 소프트웨어 렌더 게이트 (결정 3)', () => {
  it('하드웨어: 의도 그대로 · 소프트웨어: 강제(?belt=N) 일 때만 생성 · 꺼짐 의도는 강제여도 생성 안 함', () => {
    expect(resolveBeltAtLoad(true, false, true)).toBe(true);
    expect(resolveBeltAtLoad(false, false, true)).toBe(false);
    expect(resolveBeltAtLoad(true, false, false)).toBe(false);
    expect(resolveBeltAtLoad(true, true, false)).toBe(true);
    expect(resolveBeltAtLoad(false, true, false)).toBe(false);
  });
});
