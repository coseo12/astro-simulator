/**
 * #1373 PR2 — 커밋된 별자리 파일 무결성 (ADR `20261018-1373` 결정 D3 · D5 · DoD D3).
 *
 * **네트워크 무관** — 커밋된 `public/data/stars/constellations.json` · `star-catalog.bin` 만 읽는다. 재생성 재현 (바이트
 * 동일) 은 `node scripts/generate-star-catalog.mjs --check` 의 몫이다.
 *
 * 파싱은 core 로더를 쓰지 않고 여기서 직접 한다 — 로더와 이 테스트가 같은 결함을 공유하지 않게.
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
const RAW = readFileSync(path.join(DATA_DIR, 'constellations.json'));
const BIN = readFileSync(path.join(DATA_DIR, 'star-catalog.bin'));
const README = readFileSync(path.join(DATA_DIR, 'README.md'), 'utf8');

interface Entry {
  id: string;
  nameKo: string;
  label: [number, number];
  lines: number[];
}
const DATA = JSON.parse(RAW.toString('utf8')) as {
  format: string;
  starCatalog: { sha256: string; count: number };
  constellations: Entry[];
};

/** ADR §1-C 실측 · DoD D3. */
const SEGMENT_COUNT = 743;
const CONSTELLATION_COUNT = 88;
/** 생성기 산출 (2026-10-19). */
const CONSTELLATIONS_SHA256 = '2f5e6f628889f5e5ae2c5cbc6761907b92af020615fd94ae684333a0349860a4';
/** `star-catalog-file.test.ts` 의 기준 별 인덱스 (README 표). */
const BETELGEUSE_INDEX = 9;
const RIGEL_INDEX = 6;

const binCount = BIN.readUInt32LE(4);

describe('#1373 PR2 D3 — constellations.json 무결성', () => {
  it('형식 표지 CNS1 · sha256 고정 · README 에 같은 값', () => {
    expect(DATA.format).toBe('CNS1');
    expect(createHash('sha256').update(RAW).digest('hex')).toBe(CONSTELLATIONS_SHA256);
    expect(README).toContain(CONSTELLATIONS_SHA256);
  });

  it('참조 카탈로그 = 커밋된 star-catalog.bin (sha256 · 별 수) — 인덱스 결합 전제', () => {
    expect(DATA.starCatalog.sha256).toBe(createHash('sha256').update(BIN).digest('hex'));
    expect(DATA.starCatalog.count).toBe(binCount);
  });

  it('별자리 88 · IAU 약어 중복 없음 (뱀자리 머리 · 꼬리 = 1개) · 이름 비어 있지 않음', () => {
    const ids = DATA.constellations.map((c) => c.id);
    expect(ids).toHaveLength(CONSTELLATION_COUNT);
    expect(new Set(ids).size).toBe(CONSTELLATION_COUNT);
    expect(ids.filter((id) => id === 'Ser')).toHaveLength(1);
    for (const c of DATA.constellations) expect(c.nameKo.trim().length).toBeGreaterThan(0);
  });

  it('선분 743 · 모든 인덱스 정수 ∈ [0, N) · 길이 0 선분 없음', () => {
    let segments = 0;
    for (const c of DATA.constellations) {
      expect(c.lines.length % 2).toBe(0);
      for (let k = 0; k < c.lines.length; k += 2) {
        const [a, b] = [c.lines[k]!, c.lines[k + 1]!];
        for (const i of [a, b]) {
          expect(Number.isInteger(i)).toBe(true);
          expect(i).toBeGreaterThanOrEqual(0);
          expect(i).toBeLessThan(binCount);
        }
        expect(a).not.toBe(b);
        segments += 1;
      }
    }
    expect(segments).toBe(SEGMENT_COUNT);
  });

  it('라벨 기준점 — RA ∈ [0, 360) · Dec ∈ [−90, 90]', () => {
    for (const c of DATA.constellations) {
      expect(c.label[0]).toBeGreaterThanOrEqual(0);
      expect(c.label[0]).toBeLessThan(360);
      expect(Math.abs(c.label[1])).toBeLessThanOrEqual(90);
    }
  });

  it('결합 표본 — 오리온 선이 베텔게우스 · 리겔 인덱스를 잇는다 (정렬 순서가 바뀌면 FAIL)', () => {
    const ori = DATA.constellations.find((c) => c.id === 'Ori')!;
    expect(ori.lines).toContain(BETELGEUSE_INDEX);
    expect(ori.lines).toContain(RIGEL_INDEX);
  });

  it('D5 이름 — Q-N 대조표 권고 반영 (Her · Cyg), 그 밖은 d3 표기 (예: 북쪽왕관자리 유지)', () => {
    const name = (id: string) => DATA.constellations.find((c) => c.id === id)!.nameKo;
    expect(name('Her')).toBe('헤르쿨레스자리');
    expect(name('Cyg')).toBe('백조자리');
    expect(name('CrB')).toBe('북쪽왕관자리');
    expect(name('Ori')).toBe('오리온자리');
    expect(name('Ser')).toBe('뱀자리');
  });
});
