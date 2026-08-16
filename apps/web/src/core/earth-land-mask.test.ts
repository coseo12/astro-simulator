/**
 * #1119 — 커밋된 지구 육지 마스크 에셋 무결성 테스트 (ADR `20260628-756` §A4.3 결정 8 / §A4.5 DoD 10).
 *
 * **네트워크 무관** — 원천 데이터를 받지 않고 저장소에 커밋된 PNG 만 검사한다. 생성 재현은
 * `scripts/generate-earth-land-mask.mjs --check` 의 몫이다 (개발자 실행 시점, 빌드·CI 경로 아님).
 *
 * 검증 3축 (§결정 8 — 축이 **직교**하도록 고른 것이 요지다):
 *   1. **규약** — known-point 육지/바다 판별 (양성 8 / 음성 6). 상하·좌우 반전·오교체를 잡는다.
 *   2. **내용** — 면적(cos φ)가중 육지 비율. 손상·엉뚱한 파일 교체를 잡는다.
 *   3. **인코딩** — 크기 · IHDR `colorType/bitDepth` · 파일 바이트 상한 (DoD 9 ①④).
 *
 * ⚠️ **1축의 판별력은 약하다 — 단독으로 규약을 증명하지 못한다.** 오규약(위도 반전 / 경도 180°
 * 시프트) 으로 재도 절반 이상이 우연히 통과한다 (음성 6점이 대양이라 어느 규약에서도 대개 바다다).
 * 규약의 강한 증거는 **화면 IoU 축** (`browser-verify-1119-earth-mask.mjs`, §A4.5 DoD 1) 이고, 본
 * 파일은 그 축을 **기계화 가능한 저비용 회귀 가드**로 보완할 뿐이다. 아래 「판별력 한정」 테스트가
 * 그 약함 자체를 골든 벡터로 박제한다.
 *
 * PNG 디코드는 의존 없이 `node:zlib` 로 직접 한다 — 계약이 `filterType: 0` (None) 이므로 각
 * 스캔라인의 필터 바이트가 실제로 `0` 인지까지 **바이트 수준으로** 확인할 수 있다 (라이브러리를
 * 쓰면 이 축이 디코더 뒤로 숨는다).
 */
import { readFileSync } from 'node:fs';
import { inflateSync } from 'node:zlib';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { describe, expect, it } from 'vitest';

const MASK_PATH = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  '../../public/textures/earth-land-mask.png',
);

/** §A4.3 결정 2 채택 해상도. */
const MASK_WIDTH = 1024;
const MASK_HEIGHT = 512;

/** §A4.5 DoD 9 ① — 정본 `27,295` B + 5% 여유. */
const MASK_MAX_BYTES = 28_660;

/** §A4.3 결정 3-a — 판정 임계 (GRAYSCALE 계조 ≥ 128 = 육지). */
const LAND_THRESHOLD = 128;

/** §A4.3 결정 3-b — 면적가중 육지 비율 계약 (실제 지구 29.2%, 남극 포함). */
const AREA_WEIGHTED_LAND_PCT = 28.75;
const AREA_WEIGHTED_TOLERANCE_PP = 0.5;

interface DecodedMask {
  width: number;
  height: number;
  bitDepth: number;
  colorType: number;
  /** 스캔라인 필터 바이트 집합 (계약상 {0} 이어야 한다). */
  filterTypes: Set<number>;
  /** 길이 width*height 의 8bit 계조. */
  gray: Uint8Array;
  byteLength: number;
}

/** PNG 시그니처 (8 B). */
const PNG_SIGNATURE = Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]);

/**
 * 의존 0 GRAYSCALE-8 PNG 디코더 (본 에셋의 계약 인코딩 전용).
 *
 * 계약 밖 인코딩 (팔레트 / 16bit / 인터레이스 / 필터 ≠ None) 을 만나면 **던진다** — 조용히
 * 해석하지 않는 것이 요지다 (fail-fast). 그래서 "다른 도구로 다시 인코딩했다" 는 사고가 테스트
 * 실패로 드러난다.
 */
function decodeGrayscalePng(buffer: Buffer): DecodedMask {
  if (!buffer.subarray(0, 8).equals(PNG_SIGNATURE)) throw new Error('PNG 시그니처 불일치');

  let offset = 8;
  let width = 0;
  let height = 0;
  let bitDepth = 0;
  let colorType = -1;
  let interlace = 0;
  const idatChunks: Buffer[] = [];

  while (offset + 8 <= buffer.length) {
    const length = buffer.readUInt32BE(offset);
    const type = buffer.toString('ascii', offset + 4, offset + 8);
    const data = buffer.subarray(offset + 8, offset + 8 + length);
    if (type === 'IHDR') {
      width = data.readUInt32BE(0);
      height = data.readUInt32BE(4);
      bitDepth = data.readUInt8(8);
      colorType = data.readUInt8(9);
      interlace = data.readUInt8(12);
    } else if (type === 'IDAT') {
      idatChunks.push(Buffer.from(data));
    } else if (type === 'IEND') {
      break;
    }
    offset += 12 + length; // length(4) + type(4) + data + crc(4)
  }

  if (colorType !== 0)
    throw new Error(`계약 위반 — colorType=${colorType} (GRAYSCALE 0 이어야 함)`);
  if (bitDepth !== 8) throw new Error(`계약 위반 — bitDepth=${bitDepth}`);
  if (interlace !== 0) throw new Error(`계약 위반 — interlace=${interlace}`);

  const raw = inflateSync(Buffer.concat(idatChunks));
  const stride = width; // GRAYSCALE 8bit = 1 B/px
  const gray = new Uint8Array(width * height);
  const filterTypes = new Set<number>();
  for (let y = 0; y < height; y += 1) {
    const rowStart = y * (stride + 1);
    // 스캔라인 수가 IHDR height 와 어긋나면 여기서 undefined 가 나온다 → -1 로 표면화해 던진다.
    const filterType = raw[rowStart] ?? -1;
    filterTypes.add(filterType);
    if (filterType !== 0)
      throw new Error(`계약 위반 — 스캔라인 ${y} 필터 ${filterType} (None 0 계약)`);
    raw.copy(gray, y * stride, rowStart + 1, rowStart + 1 + stride);
  }

  return { width, height, bitDepth, colorType, filterTypes, gray, byteLength: buffer.length };
}

const buffer = readFileSync(MASK_PATH);
const mask = decodeGrayscalePng(buffer);

/**
 * GPU 와 동일한 BILINEAR 샘플 (픽셀 중심 · u WRAP · v CLAMP — §A4.3 결정 4 채택 샘플링).
 *
 * ⚠️ `NEAREST` 로 재면 Sydney 가 `60/255` 로 FAIL 한다 (해안 도시 sub-texel). **채택 샘플링과
 * 계약을 맞추는 것**이 요지다 — 초판 ADR 이 이 둘을 어긋나게 뒀다가 reviewer 차단을 받았다.
 */
function sampleBilinear(latitudeDeg: number, longitudeDeg: number): number {
  const u = (longitudeDeg + 180) / 360;
  const v = (90 - latitudeDeg) / 180;
  const fx = u * mask.width - 0.5;
  const fy = v * mask.height - 0.5;
  const x0 = Math.floor(fx);
  const y0 = Math.floor(fy);
  const tx = fx - x0;
  const ty = fy - y0;
  const wrapX = (x: number): number => ((x % mask.width) + mask.width) % mask.width;
  const clampY = (y: number): number => Math.min(mask.height - 1, Math.max(0, y));
  // wrapX/clampY 로 인덱스가 항상 범위 안이지만 `noUncheckedIndexedAccess` 라 명시 fallback.
  const texel = (x: number, y: number): number => mask.gray[clampY(y) * mask.width + wrapX(x)] ?? 0;
  const top = texel(x0, y0) * (1 - tx) + texel(x0 + 1, y0) * tx;
  const bottom = texel(x0, y0 + 1) * (1 - tx) + texel(x0 + 1, y0 + 1) * tx;
  return top * (1 - ty) + bottom * ty;
}

/** §A4.3 결정 3-a **A-집합** — 규약 검증 14점 (양성 land 8 / 음성 ocean 6). */
const KNOWN_POINTS: Array<[name: string, lat: number, lon: number, expected: 'land' | 'ocean']> = [
  ['Greenwich Observatory', 51.4779, -0.0015, 'land'],
  ['Tokyo', 35.6812, 139.7671, 'land'],
  ['Sydney', -33.8688, 151.2093, 'land'],
  ['Mexico City', 19.4326, -99.1332, 'land'],
  ['Nairobi', -1.2921, 36.8219, 'land'],
  ['Sao Paulo', -23.5505, -46.6333, 'land'],
  ['Antarctica interior', -89.0, 0.0, 'land'],
  ['Novosibirsk', 55.0084, 82.9357, 'land'],
  ['Gulf of Guinea', 0.0, 0.0, 'ocean'],
  ['Mid-Atlantic', 30.0, -40.0, 'ocean'],
  ['Central Pacific', 0.0, -160.0, 'ocean'],
  ['Arctic Ocean', 89.5, 0.0, 'ocean'],
  ['Indian Ocean', -20.0, 80.0, 'ocean'],
  ['South Atlantic', -40.0, -20.0, 'ocean'],
];

describe('#1119 마스크 에셋 — 축 3 인코딩 (§A4.5 DoD 9 ①④ / DoD 10)', () => {
  it('크기 1024×512 (§A4.3 결정 2 채택 해상도)', () => {
    expect(mask.width).toBe(MASK_WIDTH);
    expect(mask.height).toBe(MASK_HEIGHT);
  });

  it('IHDR colorType=0 (GRAYSCALE) · bitDepth=8 — PALETTE 아님', () => {
    expect(mask.colorType).toBe(0);
    expect(mask.bitDepth).toBe(8);
  });

  it('스캔라인 필터가 전부 None(0) — 계약 filterType 0 이 파일 바이트에 실재', () => {
    expect([...mask.filterTypes]).toEqual([0]);
  });

  it(`파일 바이트 ≤ ${MASK_MAX_BYTES} (정본 27,295 + 5% 여유 — 절대 임계, 자기참조 아님)`, () => {
    expect(mask.byteLength).toBeLessThanOrEqual(MASK_MAX_BYTES);
  });

  it('고유 계조가 정확히 65개 — 8×8 면적평균(round(255·k/64)) 산출물임을 증명', () => {
    // 이진 마스크(2계조)나 다른 다운샘플(임의 계조)로 교체되면 즉시 드러난다.
    expect(new Set(mask.gray).size).toBe(65);
  });
});

describe('#1119 마스크 에셋 — 축 1 규약 (known-point, §A4.3 결정 3-a A-집합)', () => {
  it.each(KNOWN_POINTS)('%s (%f, %f) → %s', (_name, lat, lon, expected) => {
    const value = sampleBilinear(lat, lon);
    expect(value >= LAND_THRESHOLD ? 'land' : 'ocean').toBe(expected);
  });

  it('BILINEAR 14/14 PASS (채택 샘플링 — NEAREST 로 재면 Sydney 가 깨진다)', () => {
    const passed = KNOWN_POINTS.filter(
      ([, lat, lon, expected]) =>
        (sampleBilinear(lat, lon) >= LAND_THRESHOLD ? 'land' : 'ocean') === expected,
    ).length;
    expect(passed).toBe(14);
  });

  it('Sydney 는 의도된 카나리아 — 임계 128 대비 여유가 좁다 (해상도·데이터셋 변경 시 최초 파손점)', () => {
    const sydney = sampleBilinear(-33.8688, 151.2093);
    expect(sydney).toBeGreaterThan(LAND_THRESHOLD);
    expect(sydney).toBeLessThan(160);
  });

  it('판별력 한정 — 오규약도 절반 이상 통과한다 (이 집합만으로 규약을 증명하지 말 것)', () => {
    // 골든 벡터: 커밋된 에셋에 대한 **실측값**이다. 마스크를 바꾸면 재도출해야 한다
    // (§A4.7 재검토 조건 6 — 조용한 임계 완화 금지, 의식적 SSoT 갱신).
    const survived = (mapper: (lat: number, lon: number) => number): number =>
      KNOWN_POINTS.filter(
        ([, lat, lon, expected]) =>
          (mapper(lat, lon) >= LAND_THRESHOLD ? 'land' : 'ocean') === expected,
      ).length;
    // 위도 부호 반전 (상하 뒤집힘) — Phase 0 이 실측한 `invertY` 함정이 만드는 바로 그 결함.
    expect(survived((lat, lon) => sampleBilinear(-lat, lon))).toBe(6);
    // 경도 180° 시프트 (본초자오선 오정렬).
    expect(survived((lat, lon) => sampleBilinear(lat, ((lon + 360) % 360) - 180))).toBe(9);
  });
});

describe('#1119 마스크 에셋 — 축 2 내용 (면적가중 육지 비율, §A4.3 결정 3-b)', () => {
  const stats = ((): { areaWeightedPct: number; plainPixelPct: number } => {
    let weighted = 0;
    let weightTotal = 0;
    let plain = 0;
    for (let y = 0; y < mask.height; y += 1) {
      const latRad = ((90 - ((y + 0.5) * 180) / mask.height) * Math.PI) / 180;
      const w = Math.cos(latRad);
      for (let x = 0; x < mask.width; x += 1) {
        const value = (mask.gray[y * mask.width + x] ?? 0) / 255;
        weighted += value * w;
        plain += value;
      }
      weightTotal += w * mask.width;
    }
    return {
      areaWeightedPct: (weighted / weightTotal) * 100,
      plainPixelPct: (plain / (mask.width * mask.height)) * 100,
    };
  })();

  it(`면적(cos φ)가중 육지 비율 = ${AREA_WEIGHTED_LAND_PCT}% ± ${AREA_WEIGHTED_TOLERANCE_PP}pp (실제 지구 29.2%)`, () => {
    expect(Math.abs(stats.areaWeightedPct - AREA_WEIGHTED_LAND_PCT)).toBeLessThanOrEqual(
      AREA_WEIGHTED_TOLERANCE_PP,
    );
  });

  it('면적가중 < equirect 단순 픽셀 비율 — 육지가 저위도에 편중돼 있다는 지리 신호', () => {
    // 무작위 마스크는 위도 상관이 0 이라 두 값이 거의 같아진다 (실측 33.242% ± 0.073 vs 33.05%).
    // 실제 지리를 담은 마스크만 면적가중이 유의하게 낮다 — 즉 이 부등식이 "지리성" 의 증거다.
    expect(stats.areaWeightedPct).toBeLessThan(stats.plainPixelPct - 3);
  });
});
