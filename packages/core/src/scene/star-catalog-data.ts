/**
 * #1373 — 실측 별 카탈로그 데이터 (파싱 · 등급 → 크기/밝기 · B−V → 색). Babylon 비의존 순수 함수.
 *
 * ADR `docs/decisions/20261018-1373-star-catalog-constellations.md` 결정 D2 (형식) · R2 (등급 매핑) · R3 (색).
 * 렌더 메시는 `star-catalog.ts` 가 만든다 — 이 모듈은 값만 계산한다 (단위 테스트 대상).
 *
 * R2 · R3 의 상수는 **rendering-only** 미학 값이다 (Visual Fidelity — 데이터 SSoT 는 카탈로그의 V · B−V 그대로).
 * 최종값은 사용자 육안 승인 (D-T2) 으로 정한다.
 */
import { equatorialJ2000ToEcliptic } from '../coords/equatorial.js';
import { toScene } from '../coords/scene-handedness.js';

// ─────────────────────────────────────────────────────────────────────────────
// D2 — 바이너리 형식 (`scripts/generate-star-catalog.mjs` 와 짝. 한쪽만 바꾸면 로더가 별을 만들지 않는다)
// ─────────────────────────────────────────────────────────────────────────────

/** 매직 `char[4]` — 형식 버전을 겸한다 (`STC1`). */
export const STAR_CATALOG_MAGIC = 'STC1';
export const STAR_CATALOG_HEADER_BYTES = 8;
export const STAR_CATALOG_RECORD_BYTES = 12;
/** V 고정소수점 배율 (int16 = V × 100). */
export const STAR_CATALOG_MAG_SCALE = 100;
/** B−V 고정소수점 배율 (int16 = B−V × 1000). */
export const STAR_CATALOG_BV_SCALE = 1000;
/** B−V 결측 표지 (int16 최솟값). */
export const STAR_CATALOG_BV_MISSING = -32768;
/** 런타임 파일 이름 — 장면 옵션 `starCatalogBaseUrl` 뒤에 붙는다. */
export const STAR_CATALOG_FILE_NAME = 'star-catalog.bin';

/** 파싱 결과 — 원천 좌표계 (적도 J2000) 그대로. 인덱스 = 파일 레코드 순서 (PR2 별자리 선이 참조한다). */
export interface StarCatalog {
  readonly count: number;
  readonly raDeg: Float32Array;
  readonly decDeg: Float32Array;
  /** 실시 등급 V. */
  readonly mag: Float32Array;
  /** 색지수 B−V. 결측은 `NaN`. */
  readonly bv: Float32Array;
}

/**
 * `star-catalog.bin` 파싱 (리틀 엔디언 · `DataView`). 매직 · 크기 (`8 + 12 · count`) 가 어긋나면 `null` + 경고 1회 —
 * 이 경우 호출자는 별을 만들지 않는다 (ADR D2). 값 범위는 검사하지 않는다 (무결성은 커밋 시점 단위 테스트 몫).
 */
export function parseStarCatalog(
  buffer: ArrayBuffer,
  warn: (message: string) => void = (m) => console.warn(m),
): StarCatalog | null {
  if (buffer.byteLength < STAR_CATALOG_HEADER_BYTES) {
    warn(`[star-catalog] 파일이 헤더보다 짧다 (${buffer.byteLength} B) — 별을 만들지 않는다`);
    return null;
  }
  const view = new DataView(buffer);
  let magic = '';
  for (let i = 0; i < 4; i += 1) magic += String.fromCharCode(view.getUint8(i));
  if (magic !== STAR_CATALOG_MAGIC) {
    warn(`[star-catalog] 매직 불일치 (${JSON.stringify(magic)}) — 별을 만들지 않는다`);
    return null;
  }
  const count = view.getUint32(4, true);
  const expected = STAR_CATALOG_HEADER_BYTES + STAR_CATALOG_RECORD_BYTES * count;
  if (buffer.byteLength !== expected) {
    warn(
      `[star-catalog] 크기 불일치 (${buffer.byteLength} B ≠ 8 + 12 × ${count} = ${expected} B) — 별을 만들지 않는다`,
    );
    return null;
  }
  const raDeg = new Float32Array(count);
  const decDeg = new Float32Array(count);
  const mag = new Float32Array(count);
  const bv = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    const o = STAR_CATALOG_HEADER_BYTES + STAR_CATALOG_RECORD_BYTES * i;
    raDeg[i] = view.getFloat32(o, true);
    decDeg[i] = view.getFloat32(o + 4, true);
    mag[i] = view.getInt16(o + 8, true) / STAR_CATALOG_MAG_SCALE;
    const bvRaw = view.getInt16(o + 10, true);
    bv[i] = bvRaw === STAR_CATALOG_BV_MISSING ? Number.NaN : bvRaw / STAR_CATALOG_BV_SCALE;
  }
  return { count, raDeg, decDeg, mag, bv };
}

/** 별 i 의 **장면** 단위 방향 — 적도 → 황도 (`equatorialJ2000ToEcliptic`, 데이터 공간) → `toScene` (ADR 1366). */
export function starSceneDirection(
  catalog: StarCatalog,
  i: number,
): readonly [number, number, number] {
  return toScene(equatorialJ2000ToEcliptic(catalog.raDeg[i]!, catalog.decDeg[i]!));
}

// ─────────────────────────────────────────────────────────────────────────────
// R2 — 등급 → 크기 · 밝기 (rendering-only. 최종값 D-T2)
// ─────────────────────────────────────────────────────────────────────────────

/** 기준 등급 = 카탈로그 컷 (V 6.5). 상대 플럭스 `f = 10^(−0.4 (V − V_REF))` 는 이 등급에서 1 이다. */
export const STAR_MAG_REFERENCE = 6.5;

/**
 * 크기 · 밝기 매핑 상수 (R2). 반지름 단위는 **CSS px** — 셰이더가 렌더 버퍼 배율 (DPR) 을 곱한다.
 * `r = clamp(r0 + r1 · log2 f, rMin, rMax)` · `I = clamp(i0 + i1 · log2 f, iMin, 1)`.
 */
export interface StarMagnitudeMapping {
  readonly r0: number;
  readonly r1: number;
  readonly rMin: number;
  readonly rMax: number;
  readonly i0: number;
  readonly i1: number;
  readonly iMin: number;
}

/**
 * 초안 (D-T2 전). `log2 f` 는 V 6.5 → 0 · V 3 → 4.65 · V 0 → 8.64 · 시리우스 (V −1.44) → 10.55.
 * 반지름 0.8 → 2.2 CSS px, 밝기 0.22 → 1 (V ≈ 0.3 에서 포화). 근거는 육안 비교 스크린샷 (PR 본문).
 */
export const STAR_MAGNITUDE_MAPPING: StarMagnitudeMapping = Object.freeze({
  r0: 0.8,
  r1: 0.13,
  rMin: 0.8,
  rMax: 2.2,
  i0: 0.22,
  i1: 0.095,
  iMin: 0.22,
});

const clamp = (x: number, lo: number, hi: number): number => Math.min(hi, Math.max(lo, x));

/** `log2 f = −0.4 (V − V_REF) · log2 10`. */
export function starFluxLog2(mag: number): number {
  return -0.4 * (mag - STAR_MAG_REFERENCE) * Math.log2(10);
}

/** 반지름 [CSS px]. V 가 작을수록 (밝을수록) 크다 — 단조 비증가 (V 기준). */
export function starRadiusCssPx(
  mag: number,
  mapping: StarMagnitudeMapping = STAR_MAGNITUDE_MAPPING,
): number {
  return clamp(mapping.r0 + mapping.r1 * starFluxLog2(mag), mapping.rMin, mapping.rMax);
}

/** 밝기 계수 ∈ [iMin, 1]. */
export function starIntensity(
  mag: number,
  mapping: StarMagnitudeMapping = STAR_MAGNITUDE_MAPPING,
): number {
  return clamp(mapping.i0 + mapping.i1 * starFluxLog2(mag), mapping.iMin, 1);
}

// ─────────────────────────────────────────────────────────────────────────────
// R3 — B−V → 색 (Ballesteros 2012 → Planck 궤적 → sRGB → 백색 혼합)
// ─────────────────────────────────────────────────────────────────────────────

/** Ballesteros 식 입력 범위 — 맨눈 별의 B−V 분포 바깥은 끝값으로 묶는다 (식의 극 `B−V = −0.674` 회피). */
export const STAR_BV_MIN = -0.4;
export const STAR_BV_MAX = 2.0;
/**
 * 채도 (0 = 백색, 1 = 흑체 색 그대로). 실제 밤하늘의 별은 맨눈에 거의 백색이라 낮춘다 — ADR 738 §결정 4
 * 「다수 백색 ~ 담황 · 소수 청백 / 적황 · 보라 · 마젠타 금지」 를 잇는다. 최종값 D-T2.
 */
export const STAR_COLOR_SATURATION = 0.55;

/** Ballesteros (2012, EPL 97 34008) — B−V → 유효 온도 [K]. */
export function bvToTemperatureK(bv: number): number {
  const x = clamp(bv, STAR_BV_MIN, STAR_BV_MAX);
  return 4600 * (1 / (0.92 * x + 1.7) + 1 / (0.92 * x + 0.62));
}

/**
 * Planck 궤적 색도 (CIE 1931 xy) — Kim et al. (2002) 3차 근사 (1667 K – 25000 K). Ballesteros 출력 범위
 * (B−V −0.4 → 2.0 = 약 21,700 K → 3,170 K) 가 그 안에 든다.
 */
function planckianXy(tK: number): readonly [number, number] {
  const t = clamp(tK, 1667, 25000);
  const i = 1e3 / t;
  const x =
    t <= 4000
      ? -0.2661239 * i ** 3 - 0.234358 * i ** 2 + 0.8776956 * i + 0.17991
      : -3.0258469 * i ** 3 + 2.1070379 * i ** 2 + 0.2226347 * i + 0.24039;
  const y =
    t <= 2222
      ? -1.1063814 * x ** 3 - 1.3481102 * x ** 2 + 2.18555832 * x - 0.20219683
      : t <= 4000
        ? -0.9549476 * x ** 3 - 1.37418593 * x ** 2 + 2.09137015 * x - 0.16748867
        : 3.081758 * x ** 3 - 5.8733867 * x ** 2 + 3.75112997 * x - 0.37001483;
  return [x, y];
}

/** 선형 sRGB → sRGB 전달 함수 (IEC 61966-2-1). 셰이더 출력은 감마 공간 프레임버퍼에 그대로 쓰인다. */
function srgbEncode(c: number): number {
  return c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055;
}

/**
 * 백색 기준 흑체 온도 [K] — D65 의 상관 색온도 (CCT 6504 K).
 *
 * Planck 궤적은 6,000 – 7,000 K 에서 D65 백색점 아래 (분홍 쪽) 를 지난다. 선형 sRGB 를 그대로 쓰면 그 구간 별이
 * G < min(R, B) — 마젠타 기미 (실측 최대 0.013, 8 bit 3단계 · B−V 0.47) 가 되어 ADR 738 §결정 4 와 충돌한다.
 * 그래서 이 온도의 흑체 색으로 채널별 나눈다 (von Kries 식 백색 맞춤) — 궤적이 백색을 지나고 양쪽이 R 또는 B 쪽 단조 tint 가 된다.
 */
export const STAR_WHITE_REFERENCE_K = 6504;

/** 흑체 색도 → XYZ (Y = 1) → 선형 sRGB (음수 0). */
function planckianLinearRgb(tK: number): readonly [number, number, number] {
  const [x, y] = planckianXy(tK);
  const X = x / y;
  const Z = (1 - x - y) / y;
  return [
    Math.max(0, 3.2406 * X - 1.5372 - 0.4986 * Z),
    Math.max(0, -0.9689 * X + 1.8758 + 0.0415 * Z),
    Math.max(0, 0.0557 * X - 0.204 + 1.057 * Z),
  ];
}

const WHITE_REFERENCE_LINEAR = planckianLinearRgb(STAR_WHITE_REFERENCE_K);

/**
 * B−V → 표시 색 (sRGB, 채널 ∈ [0, 1]). B−V 결측 (`NaN`) 은 백색.
 *
 * Ballesteros 온도 → 흑체 색도 → 선형 sRGB → 백색 기준 흑체로 채널별 나눔 → 최대 채널 1 로 정규화 → 감마 →
 * `STAR_COLOR_SATURATION` 만큼만 백색에서 벗어난다. B−V 가 커질수록 B/R 이 단조 감소한다 (단위 테스트가 격자로 단언).
 */
export function bvToRgb(bv: number): readonly [number, number, number] {
  if (!Number.isFinite(bv)) return [1, 1, 1];
  const raw = planckianLinearRgb(bvToTemperatureK(bv));
  const lin = raw.map((c, k) => c / WHITE_REFERENCE_LINEAR[k]!);
  const peak = Math.max(lin[0]!, lin[1]!, lin[2]!);
  const s = STAR_COLOR_SATURATION;
  const [r, g, b] = lin.map((c) => 1 - s + s * srgbEncode(c / peak));
  return [r!, g!, b!];
}
