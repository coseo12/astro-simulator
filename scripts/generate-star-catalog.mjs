#!/usr/bin/env node
/**
 * #1373 — 실측 별 카탈로그 · 별자리 생성기 (HYG v4.4 + d3-celestial → `star-catalog.bin` · `constellations.json` + 데이터 README).
 *
 * ADR `docs/decisions/20261018-1373-star-catalog-constellations.md` 결정 D1 · D2 · D3 (인덱스 고정) · D4.
 *
 * **네트워크는 개발자 실행 시점만** — 빌드 · CI 경로가 아니다. 산출물 (`star-catalog.bin` · `README.md`) 은
 * 커밋되며, 단위 테스트 (`star-catalog-file.test.ts` · `constellations-file.test.ts`) 는 커밋된 파일만 검사한다 (네트워크 무관).
 * 원천 파일은 임시 디렉터리 (`--src-dir`, 기본 `os.tmpdir()` 아래 새 디렉터리) 에만 내려받는다 — 저장소에 넣지 않는다.
 *
 * ── 원천 (취득 2026-10-18) ────────────────────────────────────────────────────
 *   HYG v4.4      : Codeberg `astronexus/hyg` — GitHub `astronexus/HYG-Database` 는 archived 이며 README 가
 *                   「now hosted at https://codeberg.org/astronexus/hyg」 로 이전을 고지한다. 커밋 고정 URL.
 *                   라이선스 CC BY-SA 4.0 (`data/hyg/CURRENT/LICENSE`).
 *   d3-celestial  : GitHub `ofrohn/d3-celestial` `data/constellations.lines.json` (선) · `data/constellations.json`
 *                   (한국어 이름 `ko` · 라벨 기준점) — BSD-3-Clause. 선 정점은 끝점 별 포함 · 인덱스 고정 (PR1) 과
 *                   `constellations.json` 선분 인덱스 (PR2) 에 같은 스냅 결과를 쓴다.
 *
 * ── 파이프라인 ────────────────────────────────────────────────────────────────
 *   1. 두 원천 다운로드 → sha256 대조 (불일치 = 즉시 중단. 원천 변조 · 버전 변경을 조용히 흡수하지 않는다)
 *   2. HYG CSV 파싱 → 태양 (id 0) 제외 → 주 집합 = V ≤ 6.5
 *   3. d3 선 정점마다 스냅 후보 집합 (V ≤ 7.0) 의 최근접 별 → 허용 60″ 초과면 실패. 주 집합 밖이면 포함
 *   4. 정렬 (V×100 정수 오름차순 → HYG id 오름차순) — 이 순서가 PR2 `constellations.json` 이 참조하는 인덱스다
 *   5. 바이너리 기록 (ADR D2 형식) + README 렌더 (prettier 로 정규화 — lint-staged 와 같은 출력)
 *   6. (PR2) 별자리 — 선분 = d3 polyline 의 연속 정점 쌍 → 4 의 인덱스 쌍. 이름 = d3 `ko` + `NAME_KO_OVERRIDES`
 *      (Q-N 대조표 권고). 뱀자리 두 조각은 선을 합치고 라벨은 머리 쪽 1개 (ADR D3). 산출 `constellations.json`
 *
 * 사용:
 *   node scripts/generate-star-catalog.mjs                    # 재생성
 *   node scripts/generate-star-catalog.mjs --check            # 기존 산출물과 바이트 대조 (미기록)
 *   node scripts/generate-star-catalog.mjs --src-dir <dir>    # 원천 다운로드 위치 지정 (없거나 빈 디렉터리)
 */

import { createHash } from 'node:crypto';
import { gunzipSync } from 'node:zlib';
import { mkdir, mkdtemp, readdir, readFile, writeFile } from 'node:fs/promises';
import { existsSync } from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';

// ─────────────────────────────────────────────────────────────────────────────
// 계약 상수 (ADR D1 · D2 · D3 — 값 변경 = 산출물 변경 = ADR 재검토)
// ─────────────────────────────────────────────────────────────────────────────

/** HYG 저장소 커밋 (v4.4 · 2026-07-12 「Add p Eridani labeling change to HYG gzip」). */
const HYG_COMMIT = '53e3df311869e813ace5f1ad2ec4ce909f13256c';
/** HYG CSV gzip — Codeberg LFS 는 `/media/` 경로가 실제 바이트를 준다 (`/raw/` 는 133 B LFS 포인터). */
const HYG_URL = `https://codeberg.org/astronexus/hyg/media/commit/${HYG_COMMIT}/data/hyg/CURRENT/hyg_v44.csv.gz`;
const HYG_LICENSE_URL = `https://codeberg.org/astronexus/hyg/raw/commit/${HYG_COMMIT}/data/hyg/CURRENT/LICENSE`;
/** ADR §1-A 실측과 같은 값. */
const HYG_SHA256 = '00b349893b9a53106dd488d8371e8d2fa586043e500bb3cdb8bff3931682197d';
const HYG_BYTES = 13_636_362;

/** d3-celestial 저장소 커밋 (master HEAD, 2022-07-05). 선 파일의 마지막 변경은 `d2e20e10` (2020-03-20). */
const D3_COMMIT = '7e720a3de062059d4c5400a379146a601d9010e0';
const D3_LINES_URL = `https://raw.githubusercontent.com/ofrohn/d3-celestial/${D3_COMMIT}/data/constellations.lines.json`;
const D3_LICENSE_URL = `https://raw.githubusercontent.com/ofrohn/d3-celestial/${D3_COMMIT}/LICENSE`;
const D3_LINES_SHA256 = '294f66bef5d5cf50b1e17f16d2efa1d97a15131612c68dd935adef6e7373e13c';
const D3_LINES_BYTES = 27_136;
/** 이름 · 라벨 기준점 파일 (같은 커밋). ADR §1-C 「50,581 B」. */
const D3_NAMES_URL = `https://raw.githubusercontent.com/ofrohn/d3-celestial/${D3_COMMIT}/data/constellations.json`;
const D3_NAMES_SHA256 = 'ab4ae692027cbc042c0d6791a84456a65eb7c55656107fd00c58ff6e55d4d8b2';
const D3_NAMES_BYTES = 50_581;

/** 취득일 — 산출 README 에 박는다 (실행 시각을 쓰면 `--check` 가 날짜마다 깨진다). */
const ACQUIRED_ON = '2026-10-18';

/** D1 등급 컷 (사용자 결정 Q-M (b)). */
const MAG_LIMIT = 6.5;
/** 선 정점 스냅 후보 집합 등급 한계 — ADR §1-C 실측 (HYG V ≤ 7.0: 최대 16.3″ · 60″ 초과 0) 과 같은 집합. */
const SNAP_CANDIDATE_MAG_LIMIT = 7.0;
/** D3 스냅 허용 각거리 [″]. 넘으면 생성 실패. */
const SNAP_TOLERANCE_ARCSEC = 60;

/** D3 별자리 계약 — 생성 시 이 값과 다르면 실패한다 (ADR §1-C 실측 · DoD D3). */
const EXPECTED_SEGMENTS = 743;
const EXPECTED_CONSTELLATIONS = 88;
/** `constellations.json` 형식 표지 (`star-catalog.bin` 의 `STC1` 과 같은 역할). */
const CONSTELLATION_FORMAT = 'CNS1';

/**
 * D5 한국어 이름 — d3 `ko` 를 출발점으로, 표준 표기와 다른 항목만 덮어쓴다 (Q-N 대조표 **권고** 열 — 사용자 확정 전 초안).
 * 대조표 · 1차 출처 URL 은 PR #1373 PR2 코멘트에 있다. 값을 바꾸면 `constellations.json` 이 바뀐다 (`--check` 가 잡는다).
 */
const NAME_KO_OVERRIDES = Object.freeze({
  // 한국천문연구원 별자리 페이지 `https://astro.kasi.re.kr/learning/pageView/5373` (제목 「헤르쿨레스자리」 · 약자 Her)
  Her: '헤르쿨레스자리',
  // 같은 출처 `https://astro.kasi.re.kr/learning/pageView/5342` (제목 「백조자리」 · 약자 Cyg)
  Cyg: '백조자리',
});

/** D2 바이너리 형식. */
const MAGIC = 'STC1';
const HEADER_BYTES = 8;
const RECORD_BYTES = 12;
const MAG_SCALE = 100;
const BV_SCALE = 1000;
const BV_MISSING = -32768;

/** README 「기준 별」 표 — ADR §1-E 의 HR 번호. */
const REFERENCE_STARS = [
  { hr: '2491', name: '시리우스' },
  { hr: '2061', name: '베텔게우스' },
  { hr: '424', name: '북극성' },
  { hr: '1713', name: '리겔' },
  { hr: '7001', name: '베가' },
];

const REPO_ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const OUTPUT_DIR_RELATIVE = 'apps/web/public/data/stars';
const BIN_RELATIVE = `${OUTPUT_DIR_RELATIVE}/star-catalog.bin`;
const CONSTELLATIONS_RELATIVE = `${OUTPUT_DIR_RELATIVE}/constellations.json`;
const README_RELATIVE = `${OUTPUT_DIR_RELATIVE}/README.md`;

const DEG = Math.PI / 180;
const ARCSEC_PER_RAD = (180 / Math.PI) * 3600;

// ─────────────────────────────────────────────────────────────────────────────
// 다운로드 · 무결성
// ─────────────────────────────────────────────────────────────────────────────

function sha256(buf) {
  return createHash('sha256').update(buf).digest('hex');
}

/**
 * 다운로드 재시도 횟수. Codeberg 가 13 MB 전송 중 소켓을 닫는 경우가 실측됐다 (2026-10-18, 2 MB 지점).
 * 재시도 대상은 **전송 실패 (연결 끊김 등) 와 HTTP 비-2xx 응답**이다 — 받은 바이트의 무결성 (sha256 · 크기) 불일치는
 * 재시도하지 않고 즉시 중단한다 (`download` 가 루프 밖에서 대조).
 */
const DOWNLOAD_ATTEMPTS = 3;

async function fetchBytes(url) {
  let lastError;
  for (let attempt = 1; attempt <= DOWNLOAD_ATTEMPTS; attempt += 1) {
    try {
      const res = await fetch(url);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      return Buffer.from(await res.arrayBuffer());
    } catch (err) {
      lastError = err;
      console.warn(
        `[star-catalog] 다운로드 ${attempt}/${DOWNLOAD_ATTEMPTS} 실패 ${url}: ${err.message}`,
      );
    }
  }
  throw new Error(`다운로드 실패 ${url}: ${lastError?.message}`);
}

/** 다운로드 → 크기 · sha256 대조. 불일치는 즉시 throw (fail-fast — fallback 없음). */
async function download(url, expectedSha, expectedBytes, destPath) {
  const buf = await fetchBytes(url);
  const got = sha256(buf);
  if (expectedSha !== null && (got !== expectedSha || buf.length !== expectedBytes)) {
    throw new Error(
      `원천 무결성 불일치 — ${url}\n  기대 sha256 ${expectedSha} (${expectedBytes} B)\n  실제 sha256 ${got} (${buf.length} B)`,
    );
  }
  await writeFile(destPath, buf);
  return buf;
}

/** 원천 디렉터리 — 없으면 만들고, 있으면 비어 있어야 한다 (기존 파일을 원천으로 오인하지 않는다). */
async function prepareSourceDir(argv) {
  const i = argv.indexOf('--src-dir');
  if (i < 0) return mkdtemp(path.join(os.tmpdir(), 'star-catalog-src-'));
  const dir = path.resolve(argv[i + 1] ?? '');
  if (existsSync(dir)) {
    const entries = await readdir(dir);
    if (entries.length > 0) throw new Error(`--src-dir 는 빈 디렉터리여야 한다: ${dir}`);
  } else {
    await mkdir(dir, { recursive: true });
  }
  return dir;
}

// ─────────────────────────────────────────────────────────────────────────────
// CSV (RFC 4180 최소 — 따옴표 안 쉼표 · `""` 이스케이프)
// ─────────────────────────────────────────────────────────────────────────────

function splitCsvLine(line) {
  const out = [];
  let cur = '';
  let quoted = false;
  for (let i = 0; i < line.length; i += 1) {
    const ch = line[i];
    if (quoted) {
      if (ch === '"') {
        if (line[i + 1] === '"') {
          cur += '"';
          i += 1;
        } else {
          quoted = false;
        }
      } else {
        cur += ch;
      }
    } else if (ch === '"') {
      quoted = true;
    } else if (ch === ',') {
      out.push(cur);
      cur = '';
    } else {
      cur += ch;
    }
  }
  out.push(cur);
  return out;
}

/** HYG 행 → { id, hip, hr, proper, raDeg, decDeg, mag, ci } (태양 · 등급 결측 제외). */
function parseHyg(csvText) {
  const lines = csvText.split(/\r?\n/).filter((l) => l.length > 0);
  const header = splitCsvLine(lines[0]);
  const col = (name) => {
    const k = header.indexOf(name);
    if (k < 0) throw new Error(`HYG 헤더에 ${name} 열이 없다`);
    return k;
  };
  const c = {
    id: col('id'),
    hip: col('hip'),
    hr: col('hr'),
    proper: col('proper'),
    ra: col('ra'),
    dec: col('dec'),
    mag: col('mag'),
    ci: col('ci'),
  };
  const stars = [];
  for (let n = 1; n < lines.length; n += 1) {
    const f = splitCsvLine(lines[n]);
    if (f.length !== header.length)
      throw new Error(`HYG ${n} 행 열 수 ${f.length} ≠ ${header.length}`);
    const id = Number(f[c.id]);
    if (id === 0) continue; // 태양 (Sol) — 장면에 따로 있다
    if (f[c.mag] === '') continue;
    stars.push({
      id,
      hip: f[c.hip],
      hr: f[c.hr],
      proper: f[c.proper],
      // HYG `ra` 는 시 (0–24) — 도로 바꾼다. `dec` 는 도.
      raDeg: Number(f[c.ra]) * 15,
      decDeg: Number(f[c.dec]),
      mag: Number(f[c.mag]),
      ci: f[c.ci] === '' ? null : Number(f[c.ci]),
    });
  }
  return stars;
}

// ─────────────────────────────────────────────────────────────────────────────
// 선 정점 스냅 (D3 인덱스 고정)
// ─────────────────────────────────────────────────────────────────────────────

function unitVector(raDeg, decDeg) {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  return [Math.cos(dec) * Math.cos(ra), Math.cos(dec) * Math.sin(ra), Math.sin(dec)];
}

/** 두 단위 벡터 사이 각 [″] — `atan2(|a×b|, a·b)` (작은 각에서 acos 보다 안정). */
function angleArcsec(a, b) {
  const cx = a[1] * b[2] - a[2] * b[1];
  const cy = a[2] * b[0] - a[0] * b[2];
  const cz = a[0] * b[1] - a[1] * b[0];
  const dot = a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  return Math.atan2(Math.hypot(cx, cy, cz), dot) * ARCSEC_PER_RAD;
}

/** d3 선 정점 (중복 제거) — `[lon, lat]` 의 lon 은 RA° 를 [−180, 180] 로 감은 값이다 (d3 `data/readme.md`). */
function lineVertices(linesJson) {
  const seen = new Map();
  let segments = 0;
  for (const feature of linesJson.features) {
    for (const polyline of feature.geometry.coordinates) {
      segments += polyline.length - 1;
      for (const [lon, lat] of polyline) {
        const key = `${lon},${lat}`;
        if (!seen.has(key)) seen.set(key, { key, raDeg: lon < 0 ? lon + 360 : lon, decDeg: lat });
      }
    }
  }
  return { vertices: [...seen.values()], segments, features: linesJson.features.length };
}

function snapVertices(vertices, candidates) {
  const candVec = candidates.map((s) => unitVector(s.raDeg, s.decDeg));
  const snapped = new Set();
  /** 정점 키 (`lineVertices` 와 같은 `${lon},${lat}`) → 스냅된 별 — 별자리 선분 인덱스 (PR2) 가 쓴다. */
  const starByKey = new Map();
  const errors = [];
  for (const v of vertices) {
    const vv = unitVector(v.raDeg, v.decDeg);
    let best = -1;
    let bestArc = Infinity;
    for (let k = 0; k < candidates.length; k += 1) {
      const arc = angleArcsec(vv, candVec[k]);
      if (arc < bestArc) {
        bestArc = arc;
        best = k;
      }
    }
    if (bestArc > SNAP_TOLERANCE_ARCSEC) {
      throw new Error(
        `선 정점 (${v.raDeg}, ${v.decDeg}) 최근접 별 ${bestArc.toFixed(1)}″ > 허용 ${SNAP_TOLERANCE_ARCSEC}″`,
      );
    }
    snapped.add(candidates[best]);
    starByKey.set(v.key, candidates[best]);
    errors.push(bestArc);
  }
  errors.sort((a, b) => a - b);
  return { snapped, errors, starByKey };
}

// ─────────────────────────────────────────────────────────────────────────────
// 별자리 (D3 · D5 — PR2)
// ─────────────────────────────────────────────────────────────────────────────

/** d3 `[lon, lat]` → `[RA°, Dec°]` (RA 를 [0, 360) 로 펼친다 — `lineVertices` 와 같은 규칙). */
const lonLatToRaDec = ([lon, lat]) => [lon < 0 ? lon + 360 : lon, lat];

/**
 * d3 선 · 이름 → 별자리 목록. 선분 = polyline 연속 정점 쌍 → 정렬된 카탈로그 인덱스 쌍.
 * 같은 IAU 약어의 feature (뱀자리 머리 · 꼬리) 는 선을 합치고, 이름 · 라벨은 **처음** feature (머리) 의 것을 쓴다 (ADR D3).
 * 계약 위반 (선분 수 · 별자리 수 · 이름 누락 · 인덱스 범위 · 길이 0 선분) 은 생성 실패 — 조용히 흡수하지 않는다.
 */
function buildConstellations(linesJson, namesJson, starByKey, stars) {
  const indexOf = new Map(stars.map((s, i) => [s, i]));
  const segmentsById = new Map();
  let segmentCount = 0;
  for (const feature of linesJson.features) {
    const pairs = segmentsById.get(feature.id) ?? [];
    for (const polyline of feature.geometry.coordinates) {
      for (let k = 1; k < polyline.length; k += 1) {
        const ends = [polyline[k - 1], polyline[k]].map(([lon, lat]) => {
          const star = starByKey.get(`${lon},${lat}`);
          const index = star === undefined ? undefined : indexOf.get(star);
          if (index === undefined)
            throw new Error(`${feature.id} 선 정점 (${lon}, ${lat}) 인덱스 없음`);
          return index;
        });
        if (ends[0] === ends[1]) throw new Error(`${feature.id} 길이 0 선분 (별 ${ends[0]})`);
        pairs.push(ends[0], ends[1]);
        segmentCount += 1;
      }
    }
    segmentsById.set(feature.id, pairs);
  }
  if (segmentCount !== EXPECTED_SEGMENTS)
    throw new Error(`선분 ${segmentCount} ≠ 계약 ${EXPECTED_SEGMENTS}`);

  const constellations = [];
  const seen = new Set();
  for (const feature of namesJson.features) {
    if (seen.has(feature.id)) continue; // 뱀자리 꼬리 — 라벨은 머리 1개
    seen.add(feature.id);
    const d3Ko = feature.properties.ko;
    const nameKo = NAME_KO_OVERRIDES[feature.id] ?? d3Ko;
    if (typeof nameKo !== 'string' || nameKo.trim() === '')
      throw new Error(`${feature.id} 한국어 이름 없음`);
    const lines = segmentsById.get(feature.id);
    if (!lines) throw new Error(`${feature.id} 선 데이터 없음`);
    constellations.push({
      id: feature.id,
      nameKo,
      label: lonLatToRaDec(feature.geometry.coordinates),
      lines,
    });
  }
  for (const id of segmentsById.keys())
    if (!seen.has(id)) throw new Error(`선만 있고 이름이 없는 별자리 ${id}`);
  for (const id of Object.keys(NAME_KO_OVERRIDES))
    if (!seen.has(id)) throw new Error(`NAME_KO_OVERRIDES 의 모르는 약어 ${id}`);
  if (constellations.length !== EXPECTED_CONSTELLATIONS)
    throw new Error(`별자리 ${constellations.length} ≠ 계약 ${EXPECTED_CONSTELLATIONS}`);
  return { constellations, segmentCount, featureCount: namesJson.features.length };
}

function renderConstellationsJson({ constellations, binSha, starCount }) {
  return `${JSON.stringify({
    format: CONSTELLATION_FORMAT,
    // 인덱스가 가리키는 카탈로그 — 바뀌면 선이 엉뚱한 별을 잇는다 (무결성 테스트가 대조).
    starCatalog: { sha256: binSha, count: starCount },
    constellations,
  })}\n`;
}

// ─────────────────────────────────────────────────────────────────────────────
// 바이너리 (D2)
// ─────────────────────────────────────────────────────────────────────────────

const quantMag = (mag) => Math.round(mag * MAG_SCALE);
const quantBv = (ci) => (ci === null ? BV_MISSING : Math.round(ci * BV_SCALE));

function encodeCatalog(stars) {
  const buf = Buffer.alloc(HEADER_BYTES + RECORD_BYTES * stars.length);
  buf.write(MAGIC, 0, 'ascii');
  buf.writeUInt32LE(stars.length, 4);
  stars.forEach((s, i) => {
    const o = HEADER_BYTES + RECORD_BYTES * i;
    buf.writeFloatLE(s.raDeg, o);
    buf.writeFloatLE(s.decDeg, o + 4);
    buf.writeInt16LE(quantMag(s.mag), o + 8);
    buf.writeInt16LE(quantBv(s.ci), o + 10);
  });
  return buf;
}

/** 자기 검증 — 기록한 바이트를 다시 읽어 레코드가 의도한 값과 일치하는지 (float32 반올림 허용). */
function selfVerify(buf, stars) {
  if (buf.toString('ascii', 0, 4) !== MAGIC) throw new Error('자기 검증: 매직 불일치');
  if (buf.readUInt32LE(4) !== stars.length) throw new Error('자기 검증: count 불일치');
  if (buf.length !== HEADER_BYTES + RECORD_BYTES * stars.length)
    throw new Error('자기 검증: 크기 불일치');
  stars.forEach((s, i) => {
    const o = HEADER_BYTES + RECORD_BYTES * i;
    if (buf.readFloatLE(o) !== Math.fround(s.raDeg)) throw new Error(`자기 검증: ${i} RA`);
    if (buf.readFloatLE(o + 4) !== Math.fround(s.decDeg)) throw new Error(`자기 검증: ${i} Dec`);
    if (buf.readInt16LE(o + 8) !== quantMag(s.mag)) throw new Error(`자기 검증: ${i} V`);
    if (buf.readInt16LE(o + 10) !== quantBv(s.ci)) throw new Error(`자기 검증: ${i} B−V`);
  });
}

// ─────────────────────────────────────────────────────────────────────────────
// README
// ─────────────────────────────────────────────────────────────────────────────

function renderReadme(ctx) {
  const {
    stars,
    primaryCount,
    extras,
    binSha,
    binBytes,
    snap,
    lines,
    hygLicenseText,
    d3LicenseText,
    refRows,
    cons,
    consSha,
    consBytes,
  } = ctx;
  const fmtArc = (x) => `${x.toFixed(1)}″`;
  const p = (q) =>
    snap.errors[Math.min(snap.errors.length - 1, Math.floor(q * snap.errors.length))];
  const missingBv = stars.filter((s) => s.ci === null).length;
  const extraRows = [...extras]
    .sort((a, b) => stars.indexOf(a) - stars.indexOf(b))
    .map(
      (s) =>
        `| ${stars.indexOf(s)} | ${s.id} | ${s.hip || '—'} | ${s.hr || '—'} | ${s.mag.toFixed(2)} | ${s.raDeg.toFixed(6)} | ${s.decDeg.toFixed(6)} |`,
    )
    .join('\n');
  const refTable = refRows
    .map(
      (r) =>
        `| ${r.name} | ${r.hr} | ${r.index} | ${r.raDeg.toFixed(6)} | ${r.decDeg.toFixed(6)} | ${r.magQ} | ${r.bvQ} |`,
    )
    .join('\n');
  const overrideRows = Object.entries(NAME_KO_OVERRIDES)
    .map(([id, name]) => {
      const d3Ko = cons.d3KoById.get(id);
      return `| ${id} | ${d3Ko} | ${name} |`;
    })
    .join('\n');
  const quote = (text) =>
    text
      .trim()
      .split('\n')
      .map((l) => (l.length > 0 ? `> ${l}` : '>'))
      .join('\n');

  return `# 별 카탈로그 데이터 — 출처 · 라이선스 · 형식

> 이 파일은 \`scripts/generate-star-catalog.mjs\` 가 생성한다. 손으로 고치지 말 것 — \`--check\` 가 바이트 대조로 어긋남을 잡는다.

ADR [\`20261018-1373-star-catalog-constellations.md\`](../../../../../docs/decisions/20261018-1373-star-catalog-constellations.md) 결정 D1 · D2 · D3 · D4 · D5.

## \`star-catalog.bin\`

| 항목 | 값 |
| --- | --- |
| 원천 데이터셋 | **HYG Stellar Database v4.4** (astronexus) |
| 취득 URL | \`${HYG_URL}\` |
| 원천 커밋 | \`${HYG_COMMIT}\` |
| 원천 sha256 | \`${HYG_SHA256}\` (${HYG_BYTES.toLocaleString('en-US')} B, gzip) |
| 취득일 | ${ACQUIRED_ON} |
| 별 수 | **${stars.length.toLocaleString('en-US')}** = V ≤ ${MAG_LIMIT} ${primaryCount.toLocaleString('en-US')} + 별자리 선 끝점 별 ${extras.length} |
| B−V 결측 | ${missingBv} |
| 파일 크기 | **${binBytes.toLocaleString('en-US')} B** (= 8 + 12 × ${stars.length.toLocaleString('en-US')}) |
| 파일 sha256 | \`${binSha}\` |
| 라이선스 | **CC BY-SA 4.0** (아래) |

### 형식 (리틀 엔디언 — \`DataView\` 로 읽는다)

| 오프셋 | 형 | 내용 |
| --- | --- | --- |
| 0 | \`char[4]\` | 매직 \`"${MAGIC}"\` |
| 4 | \`uint32\` | 별 수 N |
| 8 + 12·i + 0 | \`float32\` | 적경 RA [°] (J2000 · ICRS — HYG \`ra\` × 15) |
| 8 + 12·i + 4 | \`float32\` | 적위 Dec [°] (HYG \`dec\`) |
| 8 + 12·i + 8 | \`int16\` | 실시 등급 V × ${MAG_SCALE} (HYG \`mag\`, 반올림) |
| 8 + 12·i + 10 | \`int16\` | 색지수 B−V × ${BV_SCALE} (HYG \`ci\`, 반올림 · 결측 \`${BV_MISSING}\`) |

좌표는 원천 그대로 적도 J2000 이다 — 황도 · 장면 변환은 코드 (\`packages/core/src/coords/equatorial.ts\` → \`toScene\`) 가 한다. 그래서 각 레코드를 원천 CSV 행과 바로 대조할 수 있다.

### 선택 · 정렬

1. 태양 (HYG \`id = 0\`) 을 뺀다.
2. **V ≤ ${MAG_LIMIT}** 인 별 ${primaryCount.toLocaleString('en-US')} 개.
3. d3-celestial 별자리 선 정점 ${snap.errors.length} 개 (중복 제거) 를 V ≤ ${SNAP_CANDIDATE_MAG_LIMIT.toFixed(1)} 별 중 최근접 별에 스냅한다 (허용 ${SNAP_TOLERANCE_ARCSEC}″ — 넘으면 생성 실패). 각거리 p50 ${fmtArc(p(0.5))} · p99 ${fmtArc(p(0.99))} · 최대 ${fmtArc(snap.errors[snap.errors.length - 1])}. 스냅된 별 중 2. 의 집합 밖에 있는 별을 더한다 (컷보다 어두운 끝점 별):

| 인덱스 | HYG id | HIP | HR | V | RA [°] | Dec [°] |
| ---: | ---: | ---: | ---: | ---: | ---: | ---: |
${extraRows}

4. **정렬**: V × ${MAG_SCALE} 정수 오름차순 → HYG \`id\` 오름차순. 이 순서가 \`constellations.json\` 이 참조하는 인덱스다 — 바뀌면 선이 엉뚱한 별을 잇는다. 선 원천: ${lines.features} feature · ${lines.segments} 선분.

### 기준 별 (단위 테스트 골든 값)

| 별 | HR | 인덱스 | RA [°] | Dec [°] | V × ${MAG_SCALE} | B−V × ${BV_SCALE} |
| --- | ---: | ---: | ---: | ---: | ---: | ---: |
${refTable}

### 변경 사항 (CC BY-SA 4.0 §3(a)(1)(B) 변경 표시)

원천 CSV 에서 위 선택 · 정렬을 거쳐 4개 열 (\`ra\` · \`dec\` · \`mag\` · \`ci\`) 만 남기고, \`ra\` 를 시에서 도로 바꾸고, 위 형식으로 양자화했다 (RA · Dec float32 · V · B−V 고정소수점 int16). 나머지 열은 버렸다.

## \`constellations.json\`

| 항목 | 값 |
| --- | --- |
| 원천 | **d3-celestial** (Olaf Frohn) 커밋 \`${D3_COMMIT}\` |
| 선 | \`data/constellations.lines.json\` — sha256 \`${D3_LINES_SHA256}\` (${D3_LINES_BYTES.toLocaleString('en-US')} B) |
| 이름 · 라벨 기준점 | \`data/constellations.json\` — sha256 \`${D3_NAMES_SHA256}\` (${D3_NAMES_BYTES.toLocaleString('en-US')} B) |
| 별자리 | **${cons.constellations.length}** (원천 ${cons.featureCount} feature — 뱀자리 머리 · 꼬리를 1개로) |
| 선분 | **${cons.segmentCount}** |
| 파일 크기 | ${consBytes.toLocaleString('en-US')} B |
| 파일 sha256 | \`${consSha}\` |
| 라이선스 | **BSD-3-Clause** (아래) |

### 형식 (JSON)

- \`format\` — \`"${CONSTELLATION_FORMAT}"\`.
- \`starCatalog\` — 인덱스가 가리키는 \`star-catalog.bin\` 의 sha256 · 별 수. 런타임은 이 값을 읽지 않는다 (무결성 테스트가 대조한다).
- \`constellations[]\` — \`id\` (IAU 약어) · \`nameKo\` (한국어 이름) · \`label\` (라벨 기준점 \`[RA°, Dec°]\`, J2000 — d3 \`geometry.coordinates\` 의 RA 를 [0, 360) 로 펼친 값) · \`lines\` (별 인덱스 평면 배열 — 연속 2개가 선분 1개).

선 정점 좌표는 담지 않는다 — 런타임이 로드한 \`star-catalog.bin\` 에서 인덱스로 읽는다 (선 끝이 그려진 별과 정확히 만난다). 인덱스는 위 「선택 · 정렬」 3 의 스냅 결과다.

### 변경 사항

- 선: d3 polyline 정점 좌표를 \`star-catalog.bin\` 인덱스로 바꿨다 (최근접 별 스냅). 뱀자리 두 조각은 한 항목으로 합쳤다.
- 이름: d3 \`ko\` 를 출발점으로, 아래 항목만 바꿨다 (한국천문연구원 · 한국천문학회 표기 대조 — 이슈 #1373 PR2 대조표). 라벨 기준점은 뱀자리 머리 쪽 1개.

| IAU | d3 \`ko\` | 사용 |
| --- | --- | --- |
${overrideRows}

## 재생성 (네트워크 필요 — 개발자 실행 시점만, 빌드 · CI 경로 아님)

\`\`\`bash
node scripts/generate-star-catalog.mjs          # 재생성
node scripts/generate-star-catalog.mjs --check  # 기존 파일과 바이트 대조 (미기록)
\`\`\`

원천 세 파일 (HYG CSV · d3 선 · d3 이름) 의 sha256 은 스크립트 상수다. 다운로드 직후 대조하고 다르면 중단한다.

## 라이선스

### HYG Stellar Database — CC BY-SA 4.0

\`star-catalog.bin\` 은 HYG v4.4 의 파생 데이터이며 **CC BY-SA 4.0** 으로 배포한다 (저장소 코드의 MIT 와 별개). 원천 \`data/hyg/CURRENT/LICENSE\` (\`${HYG_LICENSE_URL}\`) 원문:

${quote(hygLicenseText)}

출처 표기: HYG Stellar Database v4.4 (astronexus) — https://codeberg.org/astronexus/hyg — CC BY-SA 4.0 (https://creativecommons.org/licenses/by-sa/4.0/).

### d3-celestial — BSD-3-Clause

\`constellations.json\` 은 d3-celestial 의 별자리 선 (\`constellations.lines.json\`) · 이름 · 라벨 기준점 (\`constellations.json\`) 의 파생 데이터다. 선 정점은 \`star-catalog.bin\` 의 끝점 별 선택에도 쓴다. 원문 \`LICENSE\` (\`${D3_LICENSE_URL}\`):

${quote(d3LicenseText)}
`;
}

/** prettier 정규화 (확장자로 파서를 고른다 — `.md` · `.json`). */
async function formatMarkdown(md, filepath) {
  // lint-staged 가 같은 prettier 로 다시 포맷한다 — 생성기가 미리 같은 출력을 내야 `--check` 가 커밋 후에도 성립한다.
  const prettier = await import('prettier');
  const config = (await prettier.resolveConfig(filepath)) ?? {};
  return prettier.format(md, { ...config, filepath });
}

// ─────────────────────────────────────────────────────────────────────────────
// main
// ─────────────────────────────────────────────────────────────────────────────

async function main() {
  const argv = process.argv.slice(2);
  const checkOnly = argv.includes('--check');
  const srcDir = await prepareSourceDir(argv);
  console.log(`[star-catalog] 원천 디렉터리 ${srcDir}`);

  const hygGz = await download(HYG_URL, HYG_SHA256, HYG_BYTES, path.join(srcDir, 'hyg_v44.csv.gz'));
  const linesBuf = await download(
    D3_LINES_URL,
    D3_LINES_SHA256,
    D3_LINES_BYTES,
    path.join(srcDir, 'constellations.lines.json'),
  );
  const namesBuf = await download(
    D3_NAMES_URL,
    D3_NAMES_SHA256,
    D3_NAMES_BYTES,
    path.join(srcDir, 'constellations.json'),
  );
  // 라이선스 원문은 인용용 — 내용이 바뀌면 README 바이트가 바뀌어 `--check` 가 잡는다 (sha 상수는 두지 않는다).
  const hygLicenseText = (
    await download(HYG_LICENSE_URL, null, 0, path.join(srcDir, 'HYG_LICENSE'))
  ).toString('utf8');
  const d3LicenseText = (
    await download(D3_LICENSE_URL, null, 0, path.join(srcDir, 'D3_LICENSE'))
  ).toString('utf8');

  const all = parseHyg(gunzipSync(hygGz).toString('utf8'));
  const primary = all.filter((s) => s.mag <= MAG_LIMIT);
  const candidates = all.filter((s) => s.mag <= SNAP_CANDIDATE_MAG_LIMIT);
  const linesJson = JSON.parse(linesBuf.toString('utf8'));
  const namesJson = JSON.parse(namesBuf.toString('utf8'));
  const lines = lineVertices(linesJson);
  const snap = snapVertices(lines.vertices, candidates);

  const primarySet = new Set(primary);
  const extras = [...snap.snapped].filter((s) => !primarySet.has(s));
  const stars = [...primary, ...extras].sort(
    (a, b) => quantMag(a.mag) - quantMag(b.mag) || a.id - b.id,
  );

  const bin = encodeCatalog(stars);
  selfVerify(bin, stars);

  const refRows = REFERENCE_STARS.map(({ hr, name }) => {
    const s = stars.find((x) => x.hr === hr);
    if (!s) throw new Error(`기준 별 HR ${hr} 이 카탈로그에 없다`);
    return {
      name,
      hr,
      index: stars.indexOf(s),
      raDeg: Math.fround(s.raDeg),
      decDeg: Math.fround(s.decDeg),
      magQ: quantMag(s.mag),
      bvQ: quantBv(s.ci),
    };
  });

  const cons = buildConstellations(linesJson, namesJson, snap.starByKey, stars);
  cons.d3KoById = new Map(namesJson.features.map((f) => [f.id, f.properties.ko]));
  const consPath = path.join(REPO_ROOT, CONSTELLATIONS_RELATIVE);
  const consText = await formatMarkdown(
    renderConstellationsJson({
      constellations: cons.constellations,
      binSha: sha256(bin),
      starCount: stars.length,
    }),
    consPath,
  );
  const consBuf = Buffer.from(consText, 'utf8');

  const readmePath = path.join(REPO_ROOT, README_RELATIVE);
  const readme = await formatMarkdown(
    renderReadme({
      stars,
      primaryCount: primary.length,
      extras,
      binSha: sha256(bin),
      binBytes: bin.length,
      snap,
      lines,
      hygLicenseText,
      d3LicenseText,
      refRows,
      cons,
      consSha: sha256(consBuf),
      consBytes: consBuf.length,
    }),
    readmePath,
  );

  console.log(
    `[star-catalog] 별 ${stars.length} (V≤${MAG_LIMIT} ${primary.length} + 끝점 ${extras.length}) · ${bin.length} B · sha256 ${sha256(bin)}`,
  );
  console.log(
    `[star-catalog] 선 ${lines.features} feature · ${lines.segments} 선분 · 정점 ${lines.vertices.length} · 스냅 최대 ${snap.errors[snap.errors.length - 1].toFixed(2)}″`,
  );
  console.log(
    `[star-catalog] 별자리 ${cons.constellations.length} · 선분 ${cons.segmentCount} · 이름 덮어쓰기 ${Object.keys(NAME_KO_OVERRIDES).length} · ${consBuf.length} B · sha256 ${sha256(consBuf)}`,
  );

  const binPath = path.join(REPO_ROOT, BIN_RELATIVE);
  if (checkOnly) {
    let ok = true;
    for (const [p, data] of [
      [binPath, bin],
      [consPath, consBuf],
      [readmePath, Buffer.from(readme, 'utf8')],
    ]) {
      if (!existsSync(p)) {
        console.error(`[star-catalog] --check: 기존 산출물 부재 ${p}`);
        ok = false;
        continue;
      }
      const same = Buffer.compare(await readFile(p), data) === 0;
      console.log(
        `[star-catalog] --check ${path.relative(REPO_ROOT, p)}: ${same ? '바이트 동일' : '불일치'}`,
      );
      ok &&= same;
    }
    if (!ok) process.exitCode = 1;
    return;
  }
  await mkdir(path.dirname(binPath), { recursive: true });
  await writeFile(binPath, bin);
  await writeFile(consPath, consBuf);
  await writeFile(readmePath, readme, 'utf8');
  console.log(
    `[star-catalog] 기록 ${BIN_RELATIVE} · ${CONSTELLATIONS_RELATIVE} · ${README_RELATIVE}`,
  );
}

main().catch((err) => {
  console.error(`[star-catalog] 실패: ${err instanceof Error ? err.message : err}`);
  process.exit(1);
});
