import { describe, expect, it } from 'vitest';
import {
  computeVisualScale,
  maxScaleForKind,
  MIN_VISUAL_SCALE,
  MAX_VISUAL_SCALE_PLANET,
  MAX_VISUAL_SCALE_STAR,
  MAX_VISUAL_SCALE_COMET,
} from './visual-scale.js';

const AU = 1.495_978_707e11;
const EARTH_R = 6.378e6;
const MOON_R = 1.737e6;
const MOON_EARTH_DIST = 3.844e8;

describe('computeVisualScale', () => {
  it('근접 뷰에서는 실제 크기 (scale=1)', () => {
    // 카메라가 지구에서 0.001 AU 거리 — 매우 가까움
    const s = computeVisualScale(0.001 * AU, EARTH_R, MAX_VISUAL_SCALE_PLANET);
    expect(s).toBe(MIN_VISUAL_SCALE);
  });

  it('태양계 전체 뷰(30 AU)에서는 max 스케일로 클램프', () => {
    const s = computeVisualScale(30 * AU, EARTH_R, MAX_VISUAL_SCALE_PLANET);
    expect(s).toBe(MAX_VISUAL_SCALE_PLANET);
  });

  it('중간 거리에서 선형 보간 — 1 AU 지구는 ~188', () => {
    const s = computeVisualScale(1 * AU, EARTH_R, MAX_VISUAL_SCALE_PLANET);
    expect(s).toBeGreaterThan(100);
    expect(s).toBeLessThan(300);
  });

  it('Earth-Moon 거리에서 Earth·Moon 각각 실제 크기 근방 (분리 가능)', () => {
    // 카메라가 지구-달 거리만큼 떨어짐
    const earthScale = computeVisualScale(MOON_EARTH_DIST, EARTH_R, MAX_VISUAL_SCALE_PLANET);
    const moonScale = computeVisualScale(MOON_EARTH_DIST, MOON_R, MAX_VISUAL_SCALE_PLANET);
    // scale=1일 때 시각 반경이 실제 반경과 같음. Moon 거리(3.84e8m)에서
    // Earth 반경 6378km는 월등히 작으므로 달이 별개 구로 분리됨.
    // Earth 반경 대비 Moon-Earth 거리 비 ≈ 60 → Earth는 실제 크기(1x)로 고정,
    // Moon은 반경 작아 scale ≈ 1.77. 어느 쪽도 원 거리를 덮어쓰지 않아 분리 가능.
    expect(earthScale).toBe(MIN_VISUAL_SCALE);
    expect(moonScale).toBeGreaterThan(MIN_VISUAL_SCALE);
    expect(moonScale).toBeLessThan(5);
    // 시각 반경 비교: Moon 유효 반경(moonScale*MOON_R) < Moon-Earth 거리
    expect(moonScale * MOON_R).toBeLessThan(MOON_EARTH_DIST);
    expect(earthScale * EARTH_R).toBeLessThan(MOON_EARTH_DIST);
  });

  it('maxScaleForKind — 유형별 상한', () => {
    expect(maxScaleForKind('star')).toBe(MAX_VISUAL_SCALE_STAR);
    expect(maxScaleForKind('planet')).toBe(MAX_VISUAL_SCALE_PLANET);
    expect(maxScaleForKind('moon')).toBe(MAX_VISUAL_SCALE_PLANET);
    expect(maxScaleForKind('comet')).toBe(MAX_VISUAL_SCALE_COMET);
    expect(maxScaleForKind('unknown-kind')).toBe(MAX_VISUAL_SCALE_PLANET);
  });

  it('경계값 — 반경 0 방어', () => {
    expect(computeVisualScale(1 * AU, 0, 500)).toBe(MIN_VISUAL_SCALE);
  });
});
