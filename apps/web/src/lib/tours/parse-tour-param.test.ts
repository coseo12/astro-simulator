import { describe, expect, it } from 'vitest';
import { ECLIPSE_TOUR } from './eclipse-tour';
import { parseTourParam } from './parse-tour-param';

/** #1390 — `?tour=&step=` 파서 (ADR `20261021-1390` 결정 · URL / DoD E6). */

const N = ECLIPSE_TOUR.steps.length;

describe('parseTourParam', () => {
  it('키 없음 · 빈 값 → none', () => {
    expect(parseTourParam(null, null)).toEqual({ kind: 'none' });
    expect(parseTourParam(undefined, '2')).toEqual({ kind: 'none' });
    expect(parseTourParam('  ', null)).toEqual({ kind: 'none' });
  });

  it('유효 — step 은 1-based, 생략 시 1단계', () => {
    expect(parseTourParam('eclipse', null)).toEqual({
      kind: 'valid',
      tourId: 'eclipse',
      stepIndex: 0,
    });
    expect(parseTourParam('eclipse', '3')).toEqual({
      kind: 'valid',
      tourId: 'eclipse',
      stepIndex: 2,
    });
    expect(parseTourParam('eclipse', String(N))).toMatchObject({ stepIndex: N - 1 });
  });

  it('무효 — 모르는 투어', () => {
    expect(parseTourParam('nope', '1').kind).toBe('invalid');
  });

  it.each(['0', String(N + 1), '-1', '1.5', 'abc', '01', '', '1e1'])('무효 — step=%s', (step) => {
    expect(parseTourParam('eclipse', step).kind).toBe('invalid');
  });
});
