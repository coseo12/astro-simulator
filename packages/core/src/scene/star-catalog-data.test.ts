/**
 * #1373 — 별 카탈로그 순수 함수 (ADR `20261018-1373` 결정 D2 · R2 · R3 · DoD D4).
 *
 * 1. 파서 — 형식 (매직 · `8 + 12 · count`) 이 어긋나면 `null` + 경고 1회 (별을 만들지 않는다).
 * 2. 등급 → 크기 · 밝기 — V 에 단조 · 상하한 고정.
 * 3. B−V → 색 — B/R 단조 감소 · 보라/마젠타 부재 (ADR 738 §결정 4 승계) · 채널 [0, 1] · 결측 백색.
 */
import { describe, expect, it, vi } from 'vitest';
import { equatorialJ2000ToEcliptic } from '../coords/equatorial.js';
import { toScene } from '../coords/scene-handedness.js';
import {
  STAR_BV_MAX,
  STAR_BV_MIN,
  STAR_CATALOG_BV_MISSING,
  STAR_CATALOG_HEADER_BYTES,
  STAR_CATALOG_RECORD_BYTES,
  STAR_MAGNITUDE_MAPPING,
  STAR_MAG_REFERENCE,
  bvToRgb,
  bvToTemperatureK,
  parseStarCatalog,
  starIntensity,
  starRadiusCssPx,
  starSceneDirection,
} from './star-catalog-data.js';

interface Row {
  ra: number;
  dec: number;
  magX100: number;
  bvX1000: number;
}

function encode(rows: Row[], magic = 'STC1', countOverride?: number): ArrayBuffer {
  const buf = new ArrayBuffer(STAR_CATALOG_HEADER_BYTES + STAR_CATALOG_RECORD_BYTES * rows.length);
  const view = new DataView(buf);
  for (let i = 0; i < 4; i += 1) view.setUint8(i, magic.charCodeAt(i));
  view.setUint32(4, countOverride ?? rows.length, true);
  rows.forEach((r, i) => {
    const o = STAR_CATALOG_HEADER_BYTES + STAR_CATALOG_RECORD_BYTES * i;
    view.setFloat32(o, r.ra, true);
    view.setFloat32(o + 4, r.dec, true);
    view.setInt16(o + 8, r.magX100, true);
    view.setInt16(o + 10, r.bvX1000, true);
  });
  return buf;
}

const SIRIUS: Row = { ra: 101.287216, dec: -16.716116, magX100: -144, bvX1000: 9 };
const MISSING_BV: Row = { ra: 10, dec: 20, magX100: 650, bvX1000: STAR_CATALOG_BV_MISSING };

describe('#1373 D2 — parseStarCatalog', () => {
  it('리틀 엔디언 레코드를 그대로 읽는다 (float32 RA · Dec · V/100 · B−V/1000 · 결측 NaN)', () => {
    const warn = vi.fn();
    const cat = parseStarCatalog(encode([SIRIUS, MISSING_BV]), warn)!;
    expect(warn).not.toHaveBeenCalled();
    expect(cat.count).toBe(2);
    expect(cat.raDeg[0]).toBe(Math.fround(SIRIUS.ra));
    expect(cat.decDeg[0]).toBe(Math.fround(SIRIUS.dec));
    expect(cat.mag[0]).toBeCloseTo(-1.44, 6);
    expect(cat.bv[0]).toBeCloseTo(0.009, 6);
    expect(Number.isNaN(cat.bv[1])).toBe(true);
  });

  it('매직 불일치 → null + 경고 1회', () => {
    const warn = vi.fn();
    expect(parseStarCatalog(encode([SIRIUS], 'STC2'), warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(1);
  });

  it('byteLength ≠ 8 + 12 · count → null + 경고 1회 (잘린 파일 · count 손상)', () => {
    const warn = vi.fn();
    const full = encode([SIRIUS, SIRIUS]);
    expect(parseStarCatalog(full.slice(0, full.byteLength - 1), warn)).toBeNull();
    expect(parseStarCatalog(encode([SIRIUS], 'STC1', 2), warn)).toBeNull();
    expect(parseStarCatalog(new ArrayBuffer(3), warn)).toBeNull();
    expect(warn).toHaveBeenCalledTimes(3);
  });

  it('starSceneDirection = toScene(equatorialJ2000ToEcliptic(float32 RA, Dec)) — 장면 경계 반전은 여기 1곳', () => {
    const cat = parseStarCatalog(encode([SIRIUS]))!;
    expect(starSceneDirection(cat, 0)).toEqual(
      toScene(equatorialJ2000ToEcliptic(Math.fround(SIRIUS.ra), Math.fround(SIRIUS.dec))),
    );
  });
});

describe('#1373 D4 — 등급 → 크기 · 밝기 (R2)', () => {
  const grid = Array.from({ length: 141 }, (_, k) => -2 + k * 0.1); // V −2 … 12

  it('V 가 커질수록 (어두울수록) 반지름 · 밝기가 줄거나 같다 (단조)', () => {
    for (let k = 1; k < grid.length; k += 1) {
      expect(starRadiusCssPx(grid[k]!)).toBeLessThanOrEqual(starRadiusCssPx(grid[k - 1]!));
      expect(starIntensity(grid[k]!)).toBeLessThanOrEqual(starIntensity(grid[k - 1]!));
    }
  });

  it('상하한 고정 — 반지름 [rMin, rMax] · 밝기 [iMin, 1], 컷 등급 (V 6.5) 은 하한', () => {
    const m = STAR_MAGNITUDE_MAPPING;
    for (const v of grid) {
      expect(starRadiusCssPx(v)).toBeGreaterThanOrEqual(m.rMin);
      expect(starRadiusCssPx(v)).toBeLessThanOrEqual(m.rMax);
      expect(starIntensity(v)).toBeGreaterThanOrEqual(m.iMin);
      expect(starIntensity(v)).toBeLessThanOrEqual(1);
    }
    expect(starRadiusCssPx(STAR_MAG_REFERENCE)).toBe(m.rMin);
    expect(starIntensity(STAR_MAG_REFERENCE)).toBe(m.iMin);
    // 시리우스 (V −1.44) 는 밝기 포화.
    expect(starIntensity(-1.44)).toBe(1);
  });

  it('밝은 별과 어두운 별이 실제로 구분된다 — V 0 ↔ V 6 반지름 차 ≥ 1.4 CSS px · 밝기 비 ≥ 2.7 (D-T2 B안 값)', () => {
    // B안 계산값: 반지름 2.455 − 1.020 = 1.435 · 밝기 1 / 0.366 = 2.73. 매핑을 바꾸면 이 하한도 함께 다시 정한다.
    expect(starRadiusCssPx(0) - starRadiusCssPx(6)).toBeGreaterThanOrEqual(1.4);
    expect(starIntensity(0) / starIntensity(6)).toBeGreaterThanOrEqual(2.7);
  });
});

describe('#1373 D4 — B−V → 색 (R3)', () => {
  const grid = Array.from({ length: 241 }, (_, k) => -0.4 + k * 0.01); // −0.4 … 2.0

  it('Ballesteros 온도 — B−V 증가에 단조 감소 · 태양 (0.65) ≈ 5,780 K', () => {
    for (let k = 1; k < grid.length; k += 1) {
      expect(bvToTemperatureK(grid[k]!)).toBeLessThan(bvToTemperatureK(grid[k - 1]!));
    }
    expect(Math.abs(bvToTemperatureK(0.65) - 5780)).toBeLessThan(60);
  });

  it('B/R 가 B−V 증가에 따라 단조 감소 (청백 → 백색 → 적황)', () => {
    let prev = Infinity;
    for (const bv of grid) {
      const [r, , b] = bvToRgb(bv);
      expect(b / r).toBeLessThanOrEqual(prev + 1e-12);
      prev = b / r;
    }
    const hot = bvToRgb(STAR_BV_MIN);
    const cool = bvToRgb(STAR_BV_MAX);
    expect(hot[2]).toBeGreaterThan(hot[0]);
    expect(cool[0]).toBeGreaterThan(cool[2]);
  });

  it('보라/마젠타 부재 — G ≥ min(R, B) (ADR 738 §결정 4 단언 승계, D65 CCT 백색 맞춤 후) · 채널 [0, 1]', () => {
    for (const bv of [...grid, -1, 3, Number.NaN]) {
      const [r, g, b] = bvToRgb(bv);
      expect(g).toBeGreaterThanOrEqual(Math.min(r, b) - 1e-9);
      for (const c of [r, g, b]) {
        expect(c).toBeGreaterThanOrEqual(0);
        expect(c).toBeLessThanOrEqual(1);
      }
    }
  });

  // 채도 상수 (`STAR_COLOR_SATURATION`) 는 이 테스트가 묶지 않는다 — 태양형은 백색 맞춤 때문에 채도와 무관하게 거의 백색이다 (PR #1375 리뷰 권고 2).
  it('태양형 (0.65) 은 거의 백색 (|R − B| < 0.1), 범위 밖 B−V 는 끝값과 같다, 결측은 백색', () => {
    const sun = bvToRgb(0.65);
    expect(Math.abs(sun[0] - sun[2])).toBeLessThan(0.1);
    expect(bvToRgb(-1)).toEqual(bvToRgb(STAR_BV_MIN));
    expect(bvToRgb(3)).toEqual(bvToRgb(STAR_BV_MAX));
    expect(bvToRgb(Number.NaN)).toEqual([1, 1, 1]);
  });
});
