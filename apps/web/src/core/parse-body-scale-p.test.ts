import { describe, expect, it, vi } from 'vitest';
import { DEFAULT_BODY_SCALE_P } from '@/constants/body-scale';
import { BODY_SCALE_P_MAX, BODY_SCALE_P_MIN, parseBodyScaleP } from './parse-body-scale-p';

describe('#762 — parseBodyScaleP (?bodyScaleP= URL flag)', () => {
  it('미지정 / null / undefined / 빈 문자열 → default 0.5', () => {
    expect(parseBodyScaleP(null)).toBe(DEFAULT_BODY_SCALE_P);
    expect(parseBodyScaleP(undefined)).toBe(DEFAULT_BODY_SCALE_P);
    expect(parseBodyScaleP('')).toBe(DEFAULT_BODY_SCALE_P);
  });

  it('범위 [0.1, 1.0] 유한 수는 그대로 파싱', () => {
    expect(parseBodyScaleP('0.4')).toBe(0.4);
    expect(parseBodyScaleP('0.55')).toBe(0.55);
    expect(parseBodyScaleP('0.6')).toBe(0.6);
    expect(parseBodyScaleP(String(BODY_SCALE_P_MIN))).toBe(BODY_SCALE_P_MIN);
    expect(parseBodyScaleP(String(BODY_SCALE_P_MAX))).toBe(BODY_SCALE_P_MAX);
  });

  it('범위 밖 (0 / 1.5 / 음수) → default 폴백 + warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseBodyScaleP('0')).toBe(DEFAULT_BODY_SCALE_P);
    expect(parseBodyScaleP('1.5')).toBe(DEFAULT_BODY_SCALE_P);
    expect(parseBodyScaleP('-0.5')).toBe(DEFAULT_BODY_SCALE_P);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });

  it('비수치 값 → default 폴백 + warn', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {});
    expect(parseBodyScaleP('abc')).toBe(DEFAULT_BODY_SCALE_P);
    expect(parseBodyScaleP('NaN')).toBe(DEFAULT_BODY_SCALE_P);
    expect(warn).toHaveBeenCalled();
    warn.mockRestore();
  });
});
