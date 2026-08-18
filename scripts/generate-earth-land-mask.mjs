#!/usr/bin/env node
/**
 * #1119 — 지구 육지 마스크 PNG 생성기 (Natural Earth 50m → equirectangular GRAYSCALE PNG).
 *
 * ADR `docs/decisions/20260628-756-procedural-planet-surface.md` **Amendment 4** §A4.3 결정 1·2·8.
 *
 * **의존 0 신설** — `pngjs` (루트 devDependency) + `node:zlib` 만 사용한다. `sharp` 는 §결정 2 가
 * 명시 기각했다 (`next` 경유 **전이** 의존이라 계약 툴체인이 아니다). 기각된 도구로만 재현되는
 * 헤드라인 수치는 계약을 깬다 (§A4.8 reviewer 차단 1).
 *
 * **네트워크는 개발자 실행 시점만** — 빌드·CI 경로가 아니다. 산출물 PNG 는 커밋되며, 단위
 * 테스트(`earth-land-mask.test.ts`) 는 커밋된 PNG 만 검사한다 (네트워크 무관).
 *
 * ── 원천 데이터 (§A4.3 결정 1, 취득 2026-08-17) ──────────────────────────────
 *   데이터셋   : Natural Earth 1:50m Physical Vectors — Land (`ne_50m_land`) VERSION 4.1.0
 *   취득 URL   : https://naciscdn.org/naturalearth/50m/physical/ne_50m_land.zip
 *   zip SHA256 : 0b8e670cf80dce9cbebe2a193bc44ba5602758c22e1fa603980553646d7ff162
 *   좌표계     : GEOGCS["GCS_WGS_1984"] … PRIMEM["Greenwich", 0] — WGS84 경위도, 본초자오선 Greenwich
 *   라이선스   : public domain ("All versions of Natural Earth raster + vector map data found on
 *                this website are in the public domain." / "No permission is needed to use Natural
 *                Earth." / "Crediting the authors is unnecessary.")
 *                → `apps/web/public/textures/README.md` 에 원문 인용 + 모순 표기 각주 박제.
 *
 * ── 파이프라인 ────────────────────────────────────────────────────────────────
 *   1. zip 다운로드 → SHA256 대조 (불일치 시 즉사 — fail-fast)
 *   2. ZIP central directory 파싱 → `ne_50m_land.shp` 만 raw-inflate
 *   3. SHP Polygon(5) 레코드 파싱 → 링 목록
 *   4. 8192×4096 이진 래스터화 (scanline even-odd — 홀(내수면)이 자동으로 뚫린다)
 *   5. 8×8 면적평균 다운샘플 → 1024×512, 값 = round(255 · k / 64), k = 육지 서브픽셀 수
 *      ⇒ 고유 계조가 **정확히 65개** (0…64) — 이 저엔트로피가 §결정 2 (2-b′) 압축률의 근거다
 *   6. `pngjs` 인코딩 (아래 4개 상수 — **빠뜨리면 재현되지 않는다**)
 *   7. 자기 검증 2축 — (i) IHDR colorType/bitDepth (ii) 재디코드 픽셀 완전 일치
 *
 * 사용:
 *   node scripts/generate-earth-land-mask.mjs                 # 기본 경로에 생성
 *   node scripts/generate-earth-land-mask.mjs --check         # 기존 파일과 바이트 대조만 (미기록)
 */

import { createHash } from 'node:crypto';
import { inflateRawSync } from 'node:zlib';
import { mkdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { PNG } from 'pngjs';

// ─────────────────────────────────────────────────────────────────────────────
// 계약 상수 (ADR §A4.3 결정 2·8 — 값 변경 시 ADR Amendment 의무)
// ─────────────────────────────────────────────────────────────────────────────

/** 원천 zip URL (§결정 1). 미러 `https://naturalearth.s3.amazonaws.com/50m_physical/ne_50m_land.zip` 는 SHA256 동일. */
const SOURCE_URL = 'https://naciscdn.org/naturalearth/50m/physical/ne_50m_land.zip';

/** 원천 zip SHA256 (§결정 1 — 두 출처 동일 실측). 불일치 = 즉시 중단. */
const SOURCE_SHA256 = '0b8e670cf80dce9cbebe2a193bc44ba5602758c22e1fa603980553646d7ff162';

/** Natural Earth VERSION (§A4.7 재검토 조건 6 — 상위 버전 도입은 의식적 SSoT 갱신). */
const SOURCE_VERSION = '4.1.0';

/** zip 내부에서 읽을 엔트리 (SHP 지오메트리만 — dbf/prj 는 래스터화에 불요). */
const SHP_ENTRY = 'ne_50m_land.shp';

/** 중간 이진 래스터 폭 (§결정 2 (2-b) — 8192 = 1024 × 8, 면적 사전필터의 서브픽셀 격자). */
const RASTER_WIDTH = 8192;
/** 중간 이진 래스터 높이 (equirectangular 2:1). */
const RASTER_HEIGHT = 4096;

/** 채택 마스크 폭 (§결정 2 — 정합 폭 구간 [618, 1854] 를 [0.55×, 1.66×] 로 덮는다). */
const MASK_WIDTH = 1024;
/** 채택 마스크 높이 (equirectangular 2:1). */
const MASK_HEIGHT = 512;

/** 다운샘플 배수 (8×8 = 64 서브픽셀 → 고유 계조 65개). */
const DOWNSAMPLE = RASTER_WIDTH / MASK_WIDTH;

/**
 * PNG 인코딩 파라미터 (§A4.3 결정 8 — **4개 전건 명시 의무**).
 *
 * ⚠️ 같은 `pngjs` 로도 옵션에 따라 산출이 `27,295` ~ `101,045` B (**3.7배**) 로 갈린다.
 * `colorType` 을 지정하지 않으면 RGBA(`101,045` B)로 나간다. 30조합 전수 sweep 최소가 아래 조합이다.
 */
const PNG_ENCODE_OPTIONS = Object.freeze({
  colorType: 0, // GRAYSCALE (PALETTE 아님 — IHDR 바이트로 검증한다)
  bitDepth: 8,
  filterType: 0, // None — 65 계조 저엔트로피에 최적 (전수 sweep 최소)
  deflateStrategy: 3, // Z_RLE
  deflateLevel: 9,
});

/**
 * 입력 버퍼 서술 (계약 상수 아님 — 출력 바이트에 영향 0).
 *
 * `pngjs` 의 내부 버퍼는 항상 RGBA 이고 본 스크립트는 alpha 를 255 로 채운다. `inputHasAlpha: false`
 * 로 두면 bitpacker 가 stride 를 4 → **3 으로 줄여** 읽어 픽셀이 어긋난다 (round-trip 자기 검증이
 * 실제로 이를 잡아냈다). alpha 가 전 픽셀 255 라 합성 결과는 원본과 동일하다.
 */
const PNG_INPUT_OPTIONS = Object.freeze({ inputHasAlpha: true });

/** 산출 파일 (§A4.4 Concrete Prediction — 예측 `27,295` B, DoD 9 ① 절대 임계 `≤ 28,660` B). */
const OUTPUT_RELATIVE = 'apps/web/public/textures/earth-land-mask.png';

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');

// ─────────────────────────────────────────────────────────────────────────────
// ZIP (store/deflate) 최소 리더 — central directory 기반. `node:zlib` 만 사용.
// ─────────────────────────────────────────────────────────────────────────────

/** ZIP End Of Central Directory 시그니처. */
const EOCD_SIGNATURE = 0x06054b50;
/** ZIP Central Directory File Header 시그니처. */
const CDFH_SIGNATURE = 0x02014b50;

/**
 * zip 버퍼에서 지정 엔트리를 추출한다 (store=0 / deflate=8 만 지원 — Natural Earth 배포본은 deflate).
 *
 * @param {Buffer} zip
 * @param {string} entryName
 * @returns {Buffer}
 */
function extractZipEntry(zip, entryName) {
  // EOCD 탐색 — 뒤에서부터 시그니처 스캔 (comment 최대 65535 B).
  let eocd = -1;
  for (let i = zip.length - 22; i >= 0 && i >= zip.length - 22 - 65_535; i -= 1) {
    if (zip.readUInt32LE(i) === EOCD_SIGNATURE) {
      eocd = i;
      break;
    }
  }
  if (eocd < 0) throw new Error('ZIP: EOCD 시그니처를 찾지 못했다');

  const entryCount = zip.readUInt16LE(eocd + 10);
  let offset = zip.readUInt32LE(eocd + 16);

  for (let n = 0; n < entryCount; n += 1) {
    if (zip.readUInt32LE(offset) !== CDFH_SIGNATURE) {
      throw new Error(`ZIP: central directory 헤더 손상 (entry ${n})`);
    }
    const method = zip.readUInt16LE(offset + 10);
    const compressedSize = zip.readUInt32LE(offset + 20);
    const nameLength = zip.readUInt16LE(offset + 28);
    const extraLength = zip.readUInt16LE(offset + 30);
    const commentLength = zip.readUInt16LE(offset + 32);
    const localOffset = zip.readUInt32LE(offset + 42);
    const name = zip.toString('utf8', offset + 46, offset + 46 + nameLength);

    if (name === entryName) {
      // local file header — 이름/extra 길이는 central 값과 다를 수 있어 local 에서 다시 읽는다.
      const localNameLength = zip.readUInt16LE(localOffset + 26);
      const localExtraLength = zip.readUInt16LE(localOffset + 28);
      const dataStart = localOffset + 30 + localNameLength + localExtraLength;
      const raw = zip.subarray(dataStart, dataStart + compressedSize);
      if (method === 0) return Buffer.from(raw);
      if (method === 8) return inflateRawSync(raw);
      throw new Error(`ZIP: 미지원 압축 방식 ${method} (${entryName})`);
    }
    offset += 46 + nameLength + extraLength + commentLength;
  }
  throw new Error(`ZIP: 엔트리 부재 — ${entryName}`);
}

// ─────────────────────────────────────────────────────────────────────────────
// SHP (ESRI Shapefile) Polygon 파서 — 링 목록만 뽑는다.
// ─────────────────────────────────────────────────────────────────────────────

/** SHP 파일 코드 (big-endian, 헤더 0~3). */
const SHP_FILE_CODE = 9994;
/** SHP shape type — Polygon. */
const SHP_TYPE_POLYGON = 5;

/**
 * SHP 버퍼 → 링 배열. 각 링은 `Float64Array` (lon, lat 교차 저장).
 *
 * even-odd 채우기를 쓰므로 **링의 winding(외곽/홀)을 구분할 필요가 없다** — 홀은 교차 횟수로 자동
 * 처리된다 (SHP 규약상 외곽 CW / 홀 CCW 이지만 판정에 사용하지 않는다).
 *
 * @param {Buffer} shp
 * @returns {Float64Array[]}
 */
function parseShapefileRings(shp) {
  if (shp.readInt32BE(0) !== SHP_FILE_CODE) throw new Error('SHP: 파일 코드 불일치');
  const shapeType = shp.readInt32LE(32);
  if (shapeType !== SHP_TYPE_POLYGON) {
    throw new Error(`SHP: Polygon(5) 이 아니다 — shapeType=${shapeType}`);
  }
  // 헤더의 파일 길이는 16-bit word 단위 (big-endian).
  const fileLength = shp.readInt32BE(24) * 2;

  const rings = [];
  let cursor = 100; // 100 B 헤더 뒤부터 레코드.
  while (cursor + 8 <= fileLength) {
    const contentLength = shp.readInt32BE(cursor + 4) * 2;
    const content = cursor + 8;
    const recordType = shp.readInt32LE(content);
    if (recordType === SHP_TYPE_POLYGON) {
      const numParts = shp.readInt32LE(content + 36);
      const numPoints = shp.readInt32LE(content + 40);
      const partsAt = content + 44;
      const pointsAt = partsAt + numParts * 4;
      for (let part = 0; part < numParts; part += 1) {
        const start = shp.readInt32LE(partsAt + part * 4);
        const end = part + 1 < numParts ? shp.readInt32LE(partsAt + (part + 1) * 4) : numPoints;
        const count = end - start;
        if (count < 3) continue;
        const ring = new Float64Array(count * 2);
        for (let i = 0; i < count; i += 1) {
          ring[i * 2] = shp.readDoubleLE(pointsAt + (start + i) * 16); // lon
          ring[i * 2 + 1] = shp.readDoubleLE(pointsAt + (start + i) * 16 + 8); // lat
        }
        rings.push(ring);
      }
    }
    cursor = content + contentLength;
  }
  return rings;
}

// ─────────────────────────────────────────────────────────────────────────────
// 래스터화 — equirectangular scanline even-odd (픽셀 중심 샘플링)
//
// 마스크 파일 규약 (§A4.3 결정 3): `x=0 ↔ 경도 −180°` / `x=W/2 ↔ 경도 0°` / `y=0 ↔ 위도 +90°`.
// 픽셀 중심 = `lon(x) = −180 + (x+0.5)·360/W`, `lat(y) = 90 − (y+0.5)·180/H`.
// ─────────────────────────────────────────────────────────────────────────────

/**
 * @param {Float64Array[]} rings
 * @returns {Uint8Array} 길이 RASTER_WIDTH*RASTER_HEIGHT, 육지=1 / 바다=0
 */
function rasterizeBinary(rings) {
  const W = RASTER_WIDTH;
  const H = RASTER_HEIGHT;
  const out = new Uint8Array(W * H);

  // 스캔라인당 전체 엣지를 훑으면 4096 × 전체엣지 라 느리다 → 시작 행 기준 버킷팅.
  // 각 엣지를 자신이 걸치는 행 범위의 첫 행 버킷에 넣고, 활성 리스트를 유지한다.
  /** @type {number[][]} */
  const buckets = Array.from({ length: H }, () => []);
  /** @type {number[]} 평탄화된 엣지 (x1,y1,x2,y2) */
  const edges = [];

  const rowOfLat = (lat) => ((90 - lat) * H) / 180 - 0.5; // 실수 행 좌표 (픽셀 중심 기준)

  for (const ring of rings) {
    const n = ring.length / 2;
    for (let i = 0; i < n; i += 1) {
      const j = (i + 1) % n;
      const x1 = ring[i * 2];
      const y1 = ring[i * 2 + 1];
      const x2 = ring[j * 2];
      const y2 = ring[j * 2 + 1];
      if (y1 === y2) continue; // 수평 엣지는 교차 판정에 기여하지 않는다 (even-odd 반열림 규약)
      const idx = edges.length / 4;
      edges.push(x1, y1, x2, y2);
      // 이 엣지가 걸치는 행 범위 — lat 이 큰 쪽이 행이 작다.
      const rTop = Math.ceil(Math.min(rowOfLat(y1), rowOfLat(y2)));
      const startRow = Math.max(0, Math.min(H - 1, rTop));
      buckets[startRow].push(idx);
    }
  }

  /** @type {Set<number>} */
  let active = new Set();
  const crossings = new Float64Array(4096);

  for (let y = 0; y < H; y += 1) {
    for (const idx of buckets[y]) active.add(idx);
    const lat = 90 - ((y + 0.5) * 180) / H;

    let count = 0;
    /** @type {number[]} */
    const expired = [];
    for (const idx of active) {
      const x1 = edges[idx * 4];
      const y1 = edges[idx * 4 + 1];
      const x2 = edges[idx * 4 + 2];
      const y2 = edges[idx * 4 + 3];
      // 반열림 규약 [min, max) — 정점 중복 계수 차단.
      const yMin = Math.min(y1, y2);
      const yMax = Math.max(y1, y2);
      if (lat < yMin) {
        // 스캔이 이 엣지 아래로 내려갔다 (lat 감소 방향) → 더는 안 쓴다.
        expired.push(idx);
        continue;
      }
      if (lat >= yMax) continue; // 아직 도달 전 (버킷 경계 오차 흡수)
      const t = (lat - y1) / (y2 - y1);
      if (count < crossings.length) crossings[count] = x1 + t * (x2 - x1);
      count += 1;
    }
    for (const idx of expired) active.delete(idx);
    if (count === 0) continue;
    if (count > crossings.length) throw new Error(`scanline 교차 초과: ${count}`);

    const xs = Array.prototype.slice.call(crossings.subarray(0, count)).sort((a, b) => a - b);
    const rowBase = y * W;
    for (let k = 0; k + 1 < xs.length; k += 2) {
      const lonA = xs[k];
      const lonB = xs[k + 1];
      // 픽셀 중심이 [lonA, lonB) 안이면 육지.
      let xStart = Math.ceil(((lonA + 180) * W) / 360 - 0.5);
      let xEnd = Math.ceil(((lonB + 180) * W) / 360 - 0.5) - 1;
      if (xEnd < xStart) continue;
      if (xStart < 0) xStart = 0;
      if (xEnd > W - 1) xEnd = W - 1;
      out.fill(1, rowBase + xStart, rowBase + xEnd + 1);
    }
  }
  return out;
}

/**
 * 8×8 면적평균 다운샘플 → 8bit 계조. 값 = `round(255 · k / 64)` (고유 계조 65개).
 *
 * @param {Uint8Array} binary
 * @returns {Buffer} 길이 MASK_WIDTH*MASK_HEIGHT
 */
function downsampleAreaAverage(binary) {
  const out = Buffer.alloc(MASK_WIDTH * MASK_HEIGHT);
  const step = DOWNSAMPLE;
  const sub = step * step;
  for (let my = 0; my < MASK_HEIGHT; my += 1) {
    for (let mx = 0; mx < MASK_WIDTH; mx += 1) {
      let k = 0;
      for (let dy = 0; dy < step; dy += 1) {
        const rowBase = (my * step + dy) * RASTER_WIDTH + mx * step;
        for (let dx = 0; dx < step; dx += 1) k += binary[rowBase + dx];
      }
      out[my * MASK_WIDTH + mx] = Math.round((255 * k) / sub);
    }
  }
  return out;
}

// ─────────────────────────────────────────────────────────────────────────────
// PNG 인코딩 + 자기 검증 2축
// ─────────────────────────────────────────────────────────────────────────────

/**
 * GRAYSCALE 8bit PNG 인코딩 (§결정 8 계약 파라미터).
 *
 * `pngjs` 는 입력을 RGBA 로 받으므로 계조를 3채널에 복제해 넣고 `colorType: 0` 으로 내보낸다
 * (출력 IHDR 은 GRAYSCALE — 자기 검증 (i) 이 이를 바이트로 확인한다).
 *
 * @param {Buffer} gray
 * @returns {Buffer}
 */
function encodeGrayscalePng(gray) {
  // PNG 인스턴스의 내부 버퍼는 항상 RGBA — 계약 `colorType` 은 write 시점에만 적용된다.
  const png = new PNG({ width: MASK_WIDTH, height: MASK_HEIGHT });
  for (let i = 0; i < gray.length; i += 1) {
    const v = gray[i];
    png.data[i * 4] = v;
    png.data[i * 4 + 1] = v;
    png.data[i * 4 + 2] = v;
    png.data[i * 4 + 3] = 255;
  }
  // ⚠️ `PNG.sync.write` 는 옵션 객체에 기본값을 **써 넣는다** (deflateChunkSize 등) — 계약 상수를
  // frozen 으로 두려면 사본을 넘겨야 한다 (원본이 frozen 이면 TypeError).
  return PNG.sync.write(png, { ...PNG_ENCODE_OPTIONS, ...PNG_INPUT_OPTIONS });
}

/**
 * 자기 검증 2축 (§결정 8): (i) IHDR colorType/bitDepth (ii) 재디코드 픽셀 완전 일치.
 *
 * @param {Buffer} pngBuffer
 * @param {Buffer} gray
 */
function selfVerify(pngBuffer, gray) {
  // (i) IHDR — PNG 시그니처 8 B + 길이 4 B + 'IHDR' 4 B 뒤에 width/height/bitDepth/colorType.
  const ihdrType = pngBuffer.toString('ascii', 12, 16);
  if (ihdrType !== 'IHDR') throw new Error(`IHDR 청크 부재 (${ihdrType})`);
  const width = pngBuffer.readUInt32BE(16);
  const height = pngBuffer.readUInt32BE(20);
  const bitDepth = pngBuffer.readUInt8(24);
  const colorType = pngBuffer.readUInt8(25);
  if (width !== MASK_WIDTH || height !== MASK_HEIGHT) {
    throw new Error(`IHDR 크기 불일치: ${width}×${height}`);
  }
  if (colorType !== 0 || bitDepth !== 8) {
    throw new Error(`IHDR 인코딩 불일치: colorType=${colorType} bitDepth=${bitDepth} (기대 0 / 8)`);
  }

  // (ii) 재디코드 round-trip — 불일치 0 이어야 한다.
  const decoded = PNG.sync.read(pngBuffer);
  let mismatch = 0;
  for (let i = 0; i < gray.length; i += 1) {
    if (decoded.data[i * 4] !== gray[i]) mismatch += 1;
  }
  if (mismatch !== 0) throw new Error(`round-trip 픽셀 불일치 ${mismatch}`);

  return { width, height, bitDepth, colorType, mismatch };
}

// ─────────────────────────────────────────────────────────────────────────────
// 통계 (§결정 3-b 지리 sanity — 단위 테스트 임계와 동일 산식)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 면적(`cos φ`) 가중 육지 비율 + equirect 단순 픽셀 비율.
 *
 * @param {Buffer} gray
 */
function landStats(gray) {
  let weighted = 0;
  let weightTotal = 0;
  let plain = 0;
  for (let y = 0; y < MASK_HEIGHT; y += 1) {
    const lat = ((90 - ((y + 0.5) * 180) / MASK_HEIGHT) * Math.PI) / 180;
    const w = Math.cos(lat);
    for (let x = 0; x < MASK_WIDTH; x += 1) {
      const v = gray[y * MASK_WIDTH + x] / 255;
      weighted += v * w;
      plain += v;
    }
    weightTotal += w * MASK_WIDTH;
  }
  return {
    areaWeightedPct: (weighted / weightTotal) * 100,
    plainPixelPct: (plain / (MASK_WIDTH * MASK_HEIGHT)) * 100,
  };
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

async function fetchSource(cacheDir) {
  await mkdir(cacheDir, { recursive: true });
  const cached = path.join(cacheDir, 'ne_50m_land.zip');
  if (existsSync(cached)) {
    const buf = await readFile(cached);
    if (createHash('sha256').update(buf).digest('hex') === SOURCE_SHA256) {
      console.log(`[source] 캐시 사용 — ${cached}`);
      return buf;
    }
    console.log('[source] 캐시 해시 불일치 → 재다운로드');
  }
  console.log(`[source] GET ${SOURCE_URL}`);
  const res = await fetch(SOURCE_URL);
  if (!res.ok) throw new Error(`다운로드 실패 HTTP ${res.status}`);
  const buf = Buffer.from(await res.arrayBuffer());
  await writeFile(cached, buf);
  return buf;
}

async function main() {
  const checkOnly = process.argv.includes('--check');
  const cacheDir = process.env.NE_CACHE_DIR ?? path.join(os.tmpdir(), 'astro-sim-ne-1119');

  const zip = await fetchSource(cacheDir);
  const sha = createHash('sha256').update(zip).digest('hex');
  if (sha !== SOURCE_SHA256) {
    throw new Error(`SHA256 불일치\n  기대 ${SOURCE_SHA256}\n  실측 ${sha}`);
  }
  console.log(`[source] SHA256 대조 OK (${SOURCE_VERSION})`);

  const shp = extractZipEntry(zip, SHP_ENTRY);
  const rings = parseShapefileRings(shp);
  const pointCount = rings.reduce((s, r) => s + r.length / 2, 0);
  console.log(`[shp] 링 ${rings.length} / 정점 ${pointCount}`);

  const binary = rasterizeBinary(rings);
  let landSub = 0;
  for (let i = 0; i < binary.length; i += 1) landSub += binary[i];
  console.log(
    `[raster] ${RASTER_WIDTH}×${RASTER_HEIGHT} 육지 서브픽셀 ${landSub} (${((landSub / binary.length) * 100).toFixed(3)}%)`,
  );

  const gray = downsampleAreaAverage(binary);
  const levels = new Set(gray);
  const stats = landStats(gray);
  console.log(
    `[mask] ${MASK_WIDTH}×${MASK_HEIGHT} 고유 계조 ${levels.size} (기대 65) · 면적가중 육지 ${stats.areaWeightedPct.toFixed(2)}% · 픽셀비율 ${stats.plainPixelPct.toFixed(2)}%`,
  );

  const pngBuffer = encodeGrayscalePng(gray);
  const verified = selfVerify(pngBuffer, gray);
  console.log(
    `[verify] IHDR colorType=${verified.colorType} bitDepth=${verified.bitDepth} · round-trip 불일치 ${verified.mismatch}`,
  );
  console.log(`[png] ${pngBuffer.length} B`);

  const outPath = path.join(REPO_ROOT, OUTPUT_RELATIVE);
  if (checkOnly) {
    if (!existsSync(outPath)) throw new Error(`--check: 기존 산출물 부재 ${outPath}`);
    const existing = await readFile(outPath);
    const same = existing.equals(pngBuffer);
    console.log(
      `[check] 기존 ${existing.length} B ↔ 재생성 ${pngBuffer.length} B → ${same ? '바이트 동일' : '불일치'}`,
    );
    if (!same) process.exitCode = 1;
    return;
  }

  await mkdir(path.dirname(outPath), { recursive: true });
  await writeFile(outPath, pngBuffer);
  console.log(`[out] ${OUTPUT_RELATIVE}`);
}

main().catch((err) => {
  console.error(`[generate-earth-land-mask] ${err.message}`);
  process.exit(1);
});
