/**
 * #1341 PR2 DoD E7 — 거리 자 단위 · 광시간 · 위성 배율 고지 (ADR `20261015-1341` 결정 R5 · R6).
 */
import { describe, expect, it } from 'vitest';
import { ephemeris, getOrbitVisualScale } from '@astro-simulator/core';
import { AU, SPEED_OF_LIGHT } from '@astro-simulator/shared';
import { indexBodies } from './body-distance';
import { formatKmKo, formatSunDistance } from './body-info';
import {
  RULER_AU_DISPLAY_MIN,
  formatLightTime,
  formatRulerDistance,
  rulerVisualScaleNotices,
} from './ruler';

const byId = indexBodies(ephemeris.getSolarSystem().bodies);
const BOUNDARY_M = RULER_AU_DISPLAY_MIN * AU;

describe('formatRulerDistance — 경계 0.01 AU (결정 R5)', () => {
  it('경계값 · 바로 위는 AU · km (formatSunDistance 와 같은 문자열)', () => {
    expect(formatRulerDistance(BOUNDARY_M)).toBe(formatSunDistance(BOUNDARY_M));
    expect(formatRulerDistance(BOUNDARY_M)).toBe('0.01 AU · 150만 km');
    expect(formatRulerDistance(BOUNDARY_M * 1.0001)).toMatch(/ AU · /);
    expect(formatRulerDistance(1.523 * AU)).toBe(formatSunDistance(1.523 * AU));
  });

  it('경계 바로 아래는 km 만 (AU 표기 없음 — 0.00 AU 방지)', () => {
    const below = BOUNDARY_M * 0.9999;
    expect(formatRulerDistance(below)).toBe(formatKmKo(below / 1000));
    expect(formatRulerDistance(below)).not.toMatch(/AU/);
    // 지구–달 대표값
    expect(formatRulerDistance(384_400_000)).toBe('38.4만 km');
  });
});

describe('formatLightTime — 광시간 (결정 R5 · 연구 모드)', () => {
  const at = (seconds: number) => seconds * SPEED_OF_LIGHT;
  it('1분 미만 → 소수 2자리 초', () => {
    expect(formatLightTime(384_400_000)).toBe('1.28초');
    expect(formatLightTime(at(59.99))).toBe('59.99초');
  });
  it('반올림 후 60초는 분 단위로 올라간다', () => {
    expect(formatLightTime(at(59.996))).toBe('1분 0초');
  });
  it('1시간 미만 → 분 · 초 (1 AU = 8분 19초)', () => {
    expect(formatLightTime(AU)).toBe('8분 19초');
    expect(formatLightTime(at(3_599.4))).toBe('59분 59초');
  });
  it('1시간 이상 → 시간 · 분', () => {
    expect(formatLightTime(at(3_600))).toBe('1시간 0분');
    expect(formatLightTime(at(4 * 3_600 + 10 * 60 + 20))).toBe('4시간 10분');
  });
});

describe('rulerVisualScaleNotices — 위성 배율 고지 (결정 R6)', () => {
  it('행성 · 태양 쌍은 고지 없음', () => {
    expect(rulerVisualScaleNotices(byId, ['earth', 'mars'], true)).toEqual([]);
    expect(rulerVisualScaleNotices(byId, ['sun', 'neptune'], true)).toEqual([]);
  });

  it('위성 포함 쌍 — N = getOrbitVisualScale(parentId, id) (하드코딩 아님)', () => {
    const moonN = getOrbitVisualScale('earth', 'moon');
    expect(moonN).not.toBe(1); // 전제 — 고지 대상
    expect(rulerVisualScaleNotices(byId, ['earth', 'moon'], true)).toEqual([
      `화면의 달 위치는 모체로부터 ×${moonN} 떨어져 그려집니다`,
    ]);
    const ioN = getOrbitVisualScale('jupiter', 'io');
    const europaN = getOrbitVisualScale('jupiter', 'europa');
    expect(ioN).not.toBe(europaN); // 전제 — per-body 룩업이 실제로 갈린다 (parent 값 재사용 변이 반증)
    expect(rulerVisualScaleNotices(byId, ['io', 'europa'], true)).toEqual([
      `화면의 이오 위치는 모체로부터 ×${ioN} 떨어져 그려집니다`,
      `화면의 유로파 위치는 모체로부터 ×${europaN} 떨어져 그려집니다`,
    ]);
  });

  it('Amendment 1 (리뷰 B1) — N-body 엔진이면 위성 쌍도 고지 0 (시각 배율 미적용)', () => {
    for (const ids of [
      ['earth', 'moon'],
      ['io', 'europa'],
      ['mars', 'phobos'],
    ]) {
      expect(rulerVisualScaleNotices(byId, ids, true).length, ids.join('-')).toBeGreaterThan(0); // 양성 대조
      expect(rulerVisualScaleNotices(byId, ids, false), ids.join('-')).toEqual([]);
    }
  });

  it('미등록 id 는 건너뛴다', () => {
    expect(rulerVisualScaleNotices(byId, ['no-such-body', 'phobos'], true)).toEqual([
      `화면의 포보스 위치는 모체로부터 ×${getOrbitVisualScale('mars', 'phobos')} 떨어져 그려집니다`,
    ]);
  });
});
