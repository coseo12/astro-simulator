/**
 * #1329 — `?comettails=` 파서 단위 테스트 (ADR `20261010-1329` 결정 4 · 5, 사용자 결정 Q7).
 *
 * 핵심 Behavior: 기본 켜짐 (미지정 = 표시) + `off` 옵트아웃 + `force` 소프트웨어 게이트 우회 + 모르는 값 → 켜짐 (+warn).
 */

import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  parseCometTailsParam,
  parseCometTailsVisible,
  resolveCometTailsAtLoad,
} from './parse-comet-tails-mode';

let warnSpy: ReturnType<typeof vi.spyOn>;
beforeEach(() => {
  warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => undefined);
});
afterEach(() => {
  warnSpy.mockRestore();
});

const ON = { visible: true, forced: false };
const OFF = { visible: false, forced: false };
const FORCED = { visible: true, forced: true };

describe('parseCometTailsParam — ?comettails= 어휘', () => {
  it('미지정 (null · undefined · 빈 문자열 · 공백) → 켜짐 · 강제 아님 (기본 켜짐)', () => {
    for (const v of [null, undefined, '', '  ']) expect(parseCometTailsParam(v)).toEqual(ON);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('off (대소문자 무시) → 꺼짐', () => {
    for (const v of ['off', 'OFF', 'Off']) expect(parseCometTailsParam(v)).toEqual(OFF);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('on → 켜짐 (warn 없음)', () => {
    for (const v of ['on', 'ON']) expect(parseCometTailsParam(v)).toEqual(ON);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('force (대소문자 무시) → 켜짐 + 게이트 우회', () => {
    for (const v of ['force', 'FORCE', ' Force ']) expect(parseCometTailsParam(v)).toEqual(FORCED);
    expect(warnSpy).not.toHaveBeenCalled();
  });
  it('그 외 → 켜짐 (기본) + warn', () => {
    expect(parseCometTailsParam('yes')).toEqual(ON);
    expect(parseCometTailsParam('1')).toEqual(ON);
    expect(warnSpy).toHaveBeenCalledTimes(2);
  });
});

describe('parseCometTailsVisible — 토글 표 역방향 파서 (의도만)', () => {
  it('off 만 false', () => {
    expect(parseCometTailsVisible(null)).toBe(true);
    expect(parseCometTailsVisible('off')).toBe(false);
    expect(parseCometTailsVisible('force')).toBe(true);
  });
});

describe('resolveCometTailsAtLoad — 소프트웨어 렌더 게이트 (결정 4)', () => {
  it('하드웨어: 의도대로', () => {
    expect(resolveCometTailsAtLoad(true, false, true)).toBe(true);
    expect(resolveCometTailsAtLoad(false, false, true)).toBe(false);
  });
  it('소프트웨어: 기본 미생성 · force 만 생성', () => {
    expect(resolveCometTailsAtLoad(true, false, false)).toBe(false);
    expect(resolveCometTailsAtLoad(true, true, false)).toBe(true);
    expect(resolveCometTailsAtLoad(false, false, false)).toBe(false);
  });
});
