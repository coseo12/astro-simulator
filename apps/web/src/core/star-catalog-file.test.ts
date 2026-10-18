/**
 * #1373 — 커밋된 별 카탈로그 바이너리 무결성 (ADR `20261018-1373` 결정 D2 · D4 · DoD D3).
 *
 * **네트워크 무관** — 원천 (HYG v4.4) 을 받지 않고 커밋된 `public/data/stars/star-catalog.bin` 만 검사한다. 재생성 재현은
 * `node scripts/generate-star-catalog.mjs --check` 의 몫이다 (개발자 실행 시점, 빌드 · CI 경로 아님).
 *
 * 디코드는 core 파서 (`parseStarCatalog`) 를 쓰지 않고 여기서 `DataView` 로 직접 한다 — 파서와 이 테스트가 같은 결함을
 * 공유하지 않게 (형식 명세 = ADR D2 표).
 *
 * 골든 값 (별 수 · sha256 · 기준 별 행) 은 생성기 산출 README 표와 같다. 바뀌면 PR2 별자리 선 인덱스가 엉뚱한 별을 잇는다.
 */
import { createHash } from 'node:crypto';
import { readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const DATA_DIR = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../public/data/stars',
);
const BIN = readFileSync(path.join(DATA_DIR, 'star-catalog.bin'));
const README = readFileSync(path.join(DATA_DIR, 'README.md'), 'utf8');

/** ADR D1 — HYG v4.4 V ≤ 6.5 (태양 제외) 8,920 + 별자리 선 끝점 별 2 (ADR §1-C 「V > 6.5: 2개」). */
const PRIMARY_COUNT = 8_920;
const ENDPOINT_EXTRA_COUNT = 2;
const STAR_COUNT = PRIMARY_COUNT + ENDPOINT_EXTRA_COUNT;
const MAG_LIMIT_X100 = 650;
/** 생성기 산출 (2026-10-18). */
const BIN_SHA256 = '96cd1025a87a046b13d49cee2618cfa0a627aae284b18bcaccc6ecc8bbcc2dbf';
const BV_MISSING = -32768;

/** README 「기준 별」 표 — 인덱스 · float32 RA · Dec (원천 `ra × 15` · `dec`) · V×100 · B−V×1000. */
const REFERENCE_ROWS = [
  { name: '시리우스 HR 2491', index: 0, ra: 101.287216, dec: -16.716116, mag: -144, bv: 9 },
  { name: '베텔게우스 HR 2061', index: 9, ra: 88.792935, dec: 7.407063, mag: 45, bv: 1500 },
  { name: '북극성 HR 424', index: 47, ra: 37.94625, dec: 89.264109, mag: 197, bv: 636 },
  { name: '리겔 HR 1713', index: 6, ra: 78.63447, dec: -8.20164, mag: 18, bv: -30 },
  { name: '베가 HR 7001', index: 4, ra: 279.2346, dec: 38.783692, mag: 3, bv: -1 },
] as const;

const view = new DataView(BIN.buffer, BIN.byteOffset, BIN.byteLength);
const record = (i: number) => {
  const o = 8 + 12 * i;
  return {
    ra: view.getFloat32(o, true),
    dec: view.getFloat32(o + 4, true),
    mag: view.getInt16(o + 8, true),
    bv: view.getInt16(o + 10, true),
  };
};

describe('#1373 D3 — star-catalog.bin 무결성', () => {
  it('헤더 — 매직 STC1 · count 8,922 (= 8,920 + 끝점 2) · 크기 8 + 12N', () => {
    expect(BIN.toString('ascii', 0, 4)).toBe('STC1');
    expect(view.getUint32(4, true)).toBe(STAR_COUNT);
    expect(BIN.byteLength).toBe(8 + 12 * STAR_COUNT);
  });

  it('sha256 고정 · README 표와 같은 값 (README ↔ 바이너리 drift 차단)', () => {
    expect(createHash('sha256').update(BIN).digest('hex')).toBe(BIN_SHA256);
    expect(README).toContain(BIN_SHA256);
    expect(README).toContain(`**${STAR_COUNT.toLocaleString('en-US')}**`);
  });

  it.each(REFERENCE_ROWS)('기준 별 행 — $name', (s) => {
    const r = record(s.index);
    // float32 반올림 (RA 360° 근처 ulp 3e-5°) 안에서 원천 값과 같다.
    expect(Math.abs(r.ra - s.ra)).toBeLessThan(1e-4);
    expect(Math.abs(r.dec - s.dec)).toBeLessThan(1e-4);
    expect(r.mag).toBe(s.mag);
    expect(r.bv).toBe(s.bv);
  });

  it('정렬 — V×100 비감소 · 앞 8,920 개는 V ≤ 6.5 · 끝 2 개는 컷 밖 끝점 별', () => {
    let prev = -Infinity;
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const { mag } = record(i);
      expect(mag).toBeGreaterThanOrEqual(prev);
      prev = mag;
    }
    expect(record(PRIMARY_COUNT - 1).mag).toBeLessThanOrEqual(MAG_LIMIT_X100);
    for (let i = PRIMARY_COUNT; i < STAR_COUNT; i += 1) {
      expect(record(i).mag).toBeGreaterThan(MAG_LIMIT_X100);
    }
  });

  it('값 범위 — RA [0, 360) · Dec [−90, 90] · B−V 결측 40 (README 표)', () => {
    let missing = 0;
    for (let i = 0; i < STAR_COUNT; i += 1) {
      const r = record(i);
      expect(r.ra).toBeGreaterThanOrEqual(0);
      expect(r.ra).toBeLessThan(360);
      expect(Math.abs(r.dec)).toBeLessThanOrEqual(90);
      if (r.bv === BV_MISSING) missing += 1;
    }
    expect(missing).toBe(40);
  });

  it('라이선스 고지 — README 에 CC BY-SA 4.0 원문 · d3-celestial BSD-3 원문', () => {
    expect(README).toContain('Creative Commons Attribution-ShareAlike 4.0 International License');
    expect(README).toContain('Copyright (c) 2015, Olaf Frohn');
  });
});
