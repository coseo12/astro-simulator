/**
 * #1412 — 태양 흑점 목록: 장면 시계 jd → 흑점 (태양면 좌표) 순수 함수 + 태양면 → 장면 변환 + 광과민성 감쇠.
 *
 * **설계 근거**: ADR `docs/decisions/20261025-1412-sunspots.md`
 *   - 결정 1 — CPU 해석적 흑점 목록. 셰이더는 결과 단위벡터 · 각반경만 받는다 (`sun-shader.ts`).
 *   - 결정 2 — 차등 자전 + 생성 · 소멸 + 11년 주기. **jd 순수 함수**. jd 는 셰이더로 가지 않는다 (#782 규약).
 *   - 결정 3 — 실효 자전 주파수 감쇠 (WCAG 2.2 SC 2.3.1, 3 Hz) — {@link stepSunspotVisibility}.
 *   - 결정 7 — 출처 계수 · 극소 표 · 신생률 · 크기 분포 · 감쇠 주파수의 상수 SSoT 는 본 모듈이다.
 *     색 · 반경비 · 필라멘트 · 크기 배율 (×2.5) 은 `sun-shader.ts` 가 소유한다.
 *
 * 함수 셋으로 나눈다 (결정 2 시그니처):
 *   - 생성기 {@link generateHeliographicSunspots} — 태양면 좌표 (위도 · 경도 · 물리 각반경 · 면적 · id) 만 낸다.
 *   - 변환기 {@link heliographicToScene} — 데이터 (오른손 황도) 좌표에서 기저를 만들고 마지막에 장면 `S_z` (#1366).
 *   - 기록기 `writeSunspotUniforms` (`sun-shader.ts`) — 위 둘을 묶어 `vec4` 배열을 쓴다 (배율이 셰이더 소유라 그쪽에 둔다).
 * 나누는 이유: 「특정 날짜의 실제 흑점」 (재검토 트리거 3) 은 생성기만, 「지구에서 본 태양」 (트리거 4) 은 장면 쪽만 바꾸게.
 *
 * **호출당 할당 0** — 재생 중 매 프레임 호출된다. 출력 버퍼는 호출자 소유, 후보 · 사이클 scratch 는 모듈 재사용.
 *
 * ⚠️ 표시 근사: 흑점 위치 · 크기 · 개수는 **통계 모델**이다. 특정 날짜의 실제 흑점과 같지 않다 — 사이클 위상만 실제
 * 극소 표를 따른다. 신생률 · 크기 분포 계수 일부는 POC 육안 승인값이다 (아래 각 상수 주석).
 */

import { J2000_JD } from '@astro-simulator/shared';
import { equatorialJ2000ToEcliptic } from '../coords/equatorial.js';
import { toSceneZ } from '../coords/scene-handedness.js';

const DEG = Math.PI / 180;

// ─────────────────────────────────────────────────────────────────────────────
// 상수 SSoT — 출처 계수 (문헌 · 식 번호) · 렌더 근사 계수 (POC 육안 승인값)
// ─────────────────────────────────────────────────────────────────────────────

/** 셰이더 `vec4 spots[48]` 의 길이 = 활성 흑점 상한 (결정 1). 1900~2100 0.5 일 간격 실측 최대 38 (ADR 1-H). */
export const SUNSPOT_MAX = 48;

/**
 * 사이클 극소 (13개월 평균 국제 흑점수 최소) — `[연, 월]`. 사이클 13 ~ 25.
 *
 * - 사이클 13~24: Hathaway 2015, *Living Rev. Sol. Phys.* 12:4, Table 2 의 「13-month Mean Minimum」 열.
 *   대조 원문: arXiv:1502.07020v1 PDF (https://arxiv.org/pdf/1502.07020v1) 28쪽 Table 2 — 12행 전건 일치 (#1412 PR1, 2026-10-25).
 *   같은 표의 「Average」 열 (세 지표 평균 — 예: 1996/08) 이 아니라 「13-month Mean」 열이다.
 * - 사이클 25: 2019/12 — NASA · NOAA Solar Cycle 25 Prediction Panel 발표 (2020-09-15, https://svs.gsfc.nasa.gov/13714).
 * 표 앞뒤는 {@link MEAN_CYCLE_PERIOD_MONTHS} 로 외삽한다. 실제 극소가 새로 확정되면 행을 더한다 (재검토 트리거 5).
 */
export const SOLAR_CYCLE_MINIMA_YM: readonly (readonly [number, number])[] = [
  [1890, 3],
  [1902, 1],
  [1913, 7],
  [1923, 8],
  [1933, 9],
  [1944, 2],
  [1954, 4],
  [1964, 10],
  [1976, 3],
  [1986, 9],
  [1996, 5],
  [2008, 12],
  [2019, 12],
];

/** 평균 사이클 주기 — 사이클 1~22 평균 131.7 개월 (Hathaway 2015 §4.3). 극소 표 밖 외삽에 쓴다. */
export const MEAN_CYCLE_PERIOD_MONTHS = 131.7;

/** 월 길이 [일] — 율리우스년 / 12. 사이클 식 (Eq. 6 · 8) 의 τ 단위 변환. */
const DAYS_PER_MONTH = 365.25 / 12;

/** 사이클 모양 식의 시작점 t₀ = 극소 − 4 개월 (Hathaway 2015 §4.5, Hathaway et al. 1994 평균 사이클 적합). */
const CYCLE_START_BEFORE_MINIMUM_MONTHS = 4;

/** 사이클 모양 Eq. 6 `F(τ) = A (τ/b)³ / [exp((τ/b)²) − c]` 의 b [월] · c (Hathaway 2015 §4.5 평균 사이클). A 는 정규화로 소거. */
const CYCLE_SHAPE_B_MONTHS = 56;
const CYCLE_SHAPE_C = 0.8;

/** 한 사이클이 흑점을 내는 τ 상한 [월] — 그 뒤 꼬리는 무시 (POC). 평균 주기의 약 1.67 배라 앞뒤 사이클이 겹친다. */
const CYCLE_ACTIVE_TAU_MAX_MONTHS = 220;

/**
 * 한 날에 동시에 흑점을 내는 사이클 수 상한 — scratch 크기. 극소 간격 최솟값 116 개월 (1986/09→1996/05) 의 연속 두 간격 합이
 * 220 개월을 넘으므로 τ ∈ (0, 220] 에 드는 사이클은 최대 2 개다 (`sunspots.test.ts` 가 단언).
 */
const MAX_ACTIVE_CYCLES = 2;

/** 흑점대 중심 위도 Eq. 8 `λ̄(τ) = 28° exp(−τ/90)` (Hathaway 2015 §4.10). */
const CENTROID_LAT_START_DEG = 28;
const CENTROID_LAT_DECAY_MONTHS = 90;

/** 흑점대 폭 Eq. 9 `σλ(A) = 1.5° + 3.8° [1 − exp(−A/400)]` (Hathaway 2015 §4.10). */
const WIDTH_BASE_DEG = 1.5;
const WIDTH_SPAN_DEG = 3.8;
const WIDTH_AREA_SCALE = 400;
/** Eq. 9 의 A (사이클 활동 수준) 대리값 = 정규화 사이클 모양 × 1500 (POC — 극대에서 큰 사이클 수준). */
const WIDTH_ACTIVITY_PROXY = 1500;

/** 평균 사이클 극대에서 하루 신생 흑점군 수 — 렌더 근사 (POC 육안 승인값, 시안 C). */
export const GROUPS_PER_DAY_AT_MAX = 1.2;

/** 최대 면적 lognormal 분포 (Solanki, Inhester & Schüssler 2006 §6.2 「크기 분포 lognormal」) — ln 평균 · 표준편차. 값은 POC. */
const LN_AREA_MEAN = Math.log(60);
const LN_AREA_SD = 1.0;
/** 최대 면적 범위 [MSH] — 지름 3,000~60,000 km (Solanki 2006 §6.2). 각반경 `√(2·10⁻⁶·A)` 로 930 → 지름 0.0862 R. */
export const SUNSPOT_AREA_MIN_MSH = 2.3;
export const SUNSPOT_AREA_MAX_MSH = 930;

/** 수명 = 최대 면적 / 감쇠율 (Solanki 2006 §6.2 「수명은 최대 면적에 선형」). 감쇠율 값은 POC. 최소 1 일. */
const DECAY_MSH_PER_DAY = 10;
const LIFE_MIN_DAYS = 1;
/** 면적이 최대에 이르는 수명 비율 — 앞 10 % 동안 커지고 나머지 동안 선형으로 준다 (팝 인 · 팝 아웃 없음, 결정 2). */
const GROWTH_FRACTION = 0.1;

/** 슬롯 lookback [일] — 가장 긴 수명 (930/10 = 93 일) 보다 길게. 슬롯 루프 반복 수가 이 값으로 고정된다 (결정 2). */
const SLOT_LOOKBACK_DAYS = Math.ceil(SUNSPOT_AREA_MAX_MSH / DECAY_MSH_PER_DAY) + 2;

/** 양극 흑점군 — 최대 면적이 이 값 초과일 때 확률 0.8 로 선행 60 % · 후행 40 % 쌍 (결정 2 — POC 값). */
const BIPOLAR_MIN_AREA_MSH = 40;
const BIPOLAR_PROBABILITY = 0.8;
const LEADER_AREA_FRACTION = 0.6;
/** 양극 간격 = 군 면적 각반경 × 3 (POC). 경도 간격의 cos 위도 보정 하한 0.2. */
const BIPOLAR_SEPARATION_RADII = 3.0;
const BIPOLAR_COSLAT_FLOOR = 0.2;
/** Joy 의 법칙 — 백색광 흑점 기울기 위도 10° 당 약 2.5° (Hathaway 2015 §4.13). 선행 흑점이 적도 쪽. */
const JOY_TILT_PER_LAT = 0.25;

/** 흑점 항성 자전 `ω(φ) = A + B sin²φ` [°/일] — Howard et al. 1984 전 흑점 (Lößnitz et al. 2025 A&A 703 A187 부록 표 재인용). */
export const SUNSPOT_ROTATION_A_DEG_PER_DAY = 14.522;
export const SUNSPOT_ROTATION_B_DEG_PER_DAY = -2.84;

/** 태양 자전축 (ICRF) α₀ · δ₀ [°] — Archinal et al. 2018 (IAU WGCCRE 2015). */
const SUN_POLE_RA_DEG = 286.13;
const SUN_POLE_DEC_DEG = 63.87;

/** 슬롯 난수열 시드 salt (결정 2 결정성 계약). 값은 POC 와 같다 — POC 통계 (1-G · 1-H) 와 시안 C 목록이 그대로 이어진다. */
export const SUNSPOT_SEED_SALT = 0x1412;
/** 시드 혼합 상수 — `Math.imul(d, 0x9E3779B1)` (Knuth 곱셈 해시, 2654435761). */
const SEED_MULTIPLIER = 0x9e3779b1;

/** 범위 가드 [일] — `|jd − J2000| > 1e7` 이면 흑점 0 개 (`d` 를 int32 안에 · 슬롯 루프가 float 정밀도에서 멈추지 않게). */
export const SUNSPOT_JD_RANGE_DAYS = 1e7;

/** 광과민성 문턱 [Hz] — WCAG 2.2 SC 2.3.1 「1 초에 3 회를 넘는 섬광 금지」 (결정 3). */
export const SUNSPOT_MAX_FLICKER_HZ = 3;
/** 목표 전환 지속 시간 [s] = `1/(2·3)` — 같은 3 Hz 에서 나온다 (새 시상수 0, 결정 3). */
export const SUNSPOT_VISIBILITY_PERSIST_S = 1 / (2 * SUNSPOT_MAX_FLICKER_HZ);
/** 가시도 최대 변화율 [1/s] = `2·3` — 켜짐↔꺼짐 1 왕복이 1/3 s 이상 (결정 3). */
export const SUNSPOT_VISIBILITY_RATE_PER_S = 2 * SUNSPOT_MAX_FLICKER_HZ;

// ─────────────────────────────────────────────────────────────────────────────
// 태양 자전축 · 태양면 기저 (데이터 = 오른손 황도 J2000)
// ─────────────────────────────────────────────────────────────────────────────

/** 태양 자전축 (북극 방향) — 데이터 좌표 단위벡터. 황도 법선과 7.252° · 승교점 황경 75.76° (ADR 1-B 검산). */
export const SUN_POLE_DATA: readonly [number, number, number] = equatorialJ2000ToEcliptic(
  SUN_POLE_RA_DEG,
  SUN_POLE_DEC_DEG,
);

/**
 * 태양 자전축 — 장면 좌표 (극벡터 `S_z`, #1366). 셰이더 `sunAxis` uniform 의 값.
 * 북극 「방향」 이라 극벡터로 다룬다 — 흑점 중심 (극벡터) 과의 내적이 sin 위도가 되려면 둘이 같은 변환을 받아야 한다.
 */
export const SUN_AXIS_SCENE: readonly [number, number, number] = [
  SUN_POLE_DATA[0],
  SUN_POLE_DATA[1],
  toSceneZ(SUN_POLE_DATA[2]),
];

// 태양면 경도 0 = 태양 적도의 황도 승교점 방향 E1 = normalize(ẑ × P), E2 = P × E1 (오른손 — 데이터 좌표에서 외적).
// ⚠️ 장면 좌표에서 외적하지 않는다 (거울상 함정, 결정 2).
const POLE_X = SUN_POLE_DATA[0];
const POLE_Y = SUN_POLE_DATA[1];
const POLE_Z = SUN_POLE_DATA[2];
const NODE_LEN = Math.hypot(POLE_X, POLE_Y);
const E1_X = -POLE_Y / NODE_LEN;
const E1_Y = POLE_X / NODE_LEN;
const E1_Z = 0;
const E2_X = POLE_Y * E1_Z - POLE_Z * E1_Y;
const E2_Y = POLE_Z * E1_X - POLE_X * E1_Z;
const E2_Z = POLE_X * E1_Y - POLE_Y * E1_X;

/** 태양면 경도 0 방향 (승교점) — 데이터 좌표. 진단 · 단위 테스트용. */
export const SUN_EQUATOR_NODE_DATA: readonly [number, number, number] = [E1_X, E1_Y, E1_Z];

/**
 * 변환기 — 태양면 위도 · 경도 [°] → 장면 좌표 단위벡터를 `out[offset..offset+2]` 에 쓴다 (할당 0).
 * 경도가 늘면 자전축 둘레로 오른손 (북극에서 보아 반시계 = 순행) 으로 돈다 — 데이터 좌표 기준.
 */
export function heliographicToScene(
  latDeg: number,
  lonDeg: number,
  out: number[] | Float32Array | Float64Array,
  offset: number,
): void {
  const phi = latDeg * DEG;
  const lam = lonDeg * DEG;
  const cosPhi = Math.cos(phi);
  const sinPhi = Math.sin(phi);
  const c = cosPhi * Math.cos(lam);
  const s = cosPhi * Math.sin(lam);
  out[offset] = c * E1_X + s * E2_X + sinPhi * POLE_X;
  out[offset + 1] = c * E1_Y + s * E2_Y + sinPhi * POLE_Y;
  out[offset + 2] = toSceneZ(c * E1_Z + s * E2_Z + sinPhi * POLE_Z);
}

/** 흑점 항성 자전 각속도 [°/일] — Howard et al. 1984. 적도 14.522 · 위도 30° 13.812 (D4). */
export function sunspotOmegaDegPerDay(latDeg: number): number {
  const s = Math.sin(latDeg * DEG);
  return SUNSPOT_ROTATION_A_DEG_PER_DAY + SUNSPOT_ROTATION_B_DEG_PER_DAY * s * s;
}

// ─────────────────────────────────────────────────────────────────────────────
// 11년 주기 — 극소 표 + 평균 주기 외삽 (사이클 index 는 산술로 — 반복 없음)
// ─────────────────────────────────────────────────────────────────────────────

/** 그 달 15 일 0h UT 의 JD (13개월 평균 극소의 월 중심 근사). 그레고리력 정수 JDN 식. */
function monthMidJd(year: number, month: number): number {
  const a = Math.floor((14 - month) / 12);
  const y = year + 4800 - a;
  const m = month + 12 * a - 3;
  const jdn =
    15 +
    Math.floor((153 * m + 2) / 5) +
    365 * y +
    Math.floor(y / 4) -
    Math.floor(y / 100) +
    Math.floor(y / 400) -
    32045;
  return jdn - 0.5;
}

const CYCLE_PERIOD_DAYS = MEAN_CYCLE_PERIOD_MONTHS * DAYS_PER_MONTH;
/** 표 사이클 t₀ (극소 − 4 개월) [JD]. index 0 = 사이클 13. */
const TABLE_T0: readonly number[] = SOLAR_CYCLE_MINIMA_YM.map(
  ([y, m]) => monthMidJd(y, m) - CYCLE_START_BEFORE_MINIMUM_MONTHS * DAYS_PER_MONTH,
);
const TABLE_LAST = TABLE_T0.length - 1;
const TABLE_T0_FIRST = TABLE_T0[0]!;
const TABLE_T0_LAST = TABLE_T0[TABLE_LAST]!;

/** 사이클 index k (0 = 사이클 13, 표 밖은 정수 외삽) 의 t₀ [JD]. */
function cycleStartJd(k: number): number {
  if (k < 0) return TABLE_T0_FIRST + k * CYCLE_PERIOD_DAYS;
  if (k > TABLE_LAST) return TABLE_T0_LAST + (k - TABLE_LAST) * CYCLE_PERIOD_DAYS;
  return TABLE_T0[k]!;
}

/** `cycleStartJd(k) < dayJd` 인 가장 큰 k. 표 밖은 산술 (`ceil`), 표 안은 13 행 이내 검색. */
function latestCycleBefore(dayJd: number): number {
  if (dayJd <= TABLE_T0_FIRST) return Math.ceil((dayJd - TABLE_T0_FIRST) / CYCLE_PERIOD_DAYS) - 1;
  if (dayJd > TABLE_T0_LAST) {
    return TABLE_LAST + Math.ceil((dayJd - TABLE_T0_LAST) / CYCLE_PERIOD_DAYS) - 1;
  }
  let k = TABLE_LAST;
  while (TABLE_T0[k]! >= dayJd) k--;
  return k;
}

function cycleShapeRaw(tauMonths: number): number {
  if (tauMonths <= 0) return 0;
  const x = tauMonths / CYCLE_SHAPE_B_MONTHS;
  return (x * x * x) / (Math.exp(x * x) - CYCLE_SHAPE_C);
}

/** Eq. 6 정규화 상수 — τ 0~300 개월을 0.1 개월 간격으로 본 최댓값 (모듈 로드 1회 · POC 와 같은 격자 — 참 최댓값과 상대 1e-5 안). */
const CYCLE_SHAPE_MAX = (() => {
  let max = 0;
  for (let i = 0; i < 3000; i++) max = Math.max(max, cycleShapeRaw(i * 0.1));
  return max;
})();

/** 사이클 모양 Eq. 6 을 최댓값 1 로 정규화 — τ [월] (사이클 t₀ 기준). τ ≤ 0 이면 0. */
export function cycleShape(tauMonths: number): number {
  return cycleShapeRaw(tauMonths) / CYCLE_SHAPE_MAX;
}

// ─────────────────────────────────────────────────────────────────────────────
// 결정적 난수 — mulberry32 (결정 2 결정성 계약)
// ─────────────────────────────────────────────────────────────────────────────

/** mulberry32 상태 (모듈 재사용 — 할당 0). */
let rngState = 0;

function seedSlot(d: number): void {
  rngState = (Math.imul(d, SEED_MULTIPLIER) ^ SUNSPOT_SEED_SALT) >>> 0;
}

function rand(): number {
  rngState = (rngState + 0x6d2b79f5) >>> 0;
  let t = rngState;
  t = Math.imul(t ^ (t >>> 15), t | 1);
  t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
  return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
}

/** Box–Muller 정규 난수 (난수 2 개 소비). */
function gauss(): number {
  const u = Math.max(rand(), 1e-9);
  const v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// ─────────────────────────────────────────────────────────────────────────────
// 생성기
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 생성기 출력 — 흑점 i 의 태양면 좌표 (struct of arrays, 길이 {@link SUNSPOT_MAX}). 호출자 소유.
 * id = `(slot, group, part)` — 생성 일 슬롯 · 그 슬롯 안 군 순번 · 양극 성분 (0 선행/단극, 1 후행). 사전순이 동률 정렬 키.
 */
export interface HeliographicSpots {
  latDeg: Float64Array;
  lonDeg: Float64Array;
  /** 반영 바깥 각반경 [rad] — **물리 값** (×2.5 배율 전, 결정 1). */
  radiusRad: Float64Array;
  /** 현재 면적 [MSH] (물리 값). */
  areaMsh: Float64Array;
  idSlot: Int32Array;
  idGroup: Int32Array;
  idPart: Int32Array;
}

function createSpotArrays(capacity: number): HeliographicSpots {
  return {
    latDeg: new Float64Array(capacity),
    lonDeg: new Float64Array(capacity),
    radiusRad: new Float64Array(capacity),
    areaMsh: new Float64Array(capacity),
    idSlot: new Int32Array(capacity),
    idGroup: new Int32Array(capacity),
    idPart: new Int32Array(capacity),
  };
}

/** 생성기 출력 버퍼 (기본 길이 {@link SUNSPOT_MAX}). 호출자가 1회 만들어 재사용한다. */
export function createHeliographicSpots(capacity: number = SUNSPOT_MAX): HeliographicSpots {
  return createSpotArrays(capacity);
}

/** 하루 신생 군 수 상한 — `floor(total + r)` ≤ `ceil(신생률 상한)`. */
const MAX_GROUPS_PER_SLOT = Math.ceil(GROUPS_PER_DAY_AT_MAX * MAX_ACTIVE_CYCLES);
/** 후보 scratch 용량 — 슬롯 수 × 군 수 상한 × 양극 2. 상한 절단 전 활성 흑점 전부가 들어간다. */
const CANDIDATE_CAPACITY = (SLOT_LOOKBACK_DAYS + 1) * MAX_GROUPS_PER_SLOT * 2;

const candidates = createSpotArrays(CANDIDATE_CAPACITY);
const candidateOrder = new Int32Array(CANDIDATE_CAPACITY);
const cycleTau = new Float64Array(MAX_ACTIVE_CYCLES);
const cycleS = new Float64Array(MAX_ACTIVE_CYCLES);

/** 정렬 키 비교 — 현재 면적 큰 순, 동률이면 id 사전순 (결정 1). a 가 앞이면 음수. */
function compareSpots(src: HeliographicSpots, a: number, b: number): number {
  const da = src.areaMsh[b]! - src.areaMsh[a]!;
  if (da !== 0) return da;
  return (
    src.idSlot[a]! - src.idSlot[b]! ||
    src.idGroup[a]! - src.idGroup[b]! ||
    src.idPart[a]! - src.idPart[b]!
  );
}

function copySpot(src: HeliographicSpots, i: number, out: HeliographicSpots, dst: number): void {
  out.latDeg[dst] = src.latDeg[i]!;
  out.lonDeg[dst] = src.lonDeg[i]!;
  out.radiusRad[dst] = src.radiusRad[i]!;
  out.areaMsh[dst] = src.areaMsh[i]!;
  out.idSlot[dst] = src.idSlot[i]!;
  out.idGroup[dst] = src.idGroup[i]!;
  out.idPart[dst] = src.idPart[i]!;
}

/**
 * 상한 절단 — `src` 의 앞 `count` 개 중 현재 면적 큰 순 (동률 id 사전순) 으로 `cap` 개를 `out` 에 쓰고 개수를 반환한다.
 * 삽입 정렬 (할당 0 — index scratch 는 모듈 소유, `count ≤` 후보 용량). 1900~2100 에서는 도달하지 않는 경로라 단위
 * 테스트가 합성 입력으로 직접 검증한다 (ADR 1-H — 최대 활성 38).
 */
export function selectLargestSpots(
  src: HeliographicSpots,
  count: number,
  out: HeliographicSpots,
  cap: number,
): number {
  if (count <= cap) {
    for (let i = 0; i < count; i++) copySpot(src, i, out, i);
    return count;
  }
  if (count > candidateOrder.length) {
    throw new RangeError(
      `[sunspots] 절단 입력 ${count} 개가 scratch 용량 ${candidateOrder.length} 를 넘는다`,
    );
  }
  for (let i = 0; i < count; i++) {
    let k = i;
    while (k > 0 && compareSpots(src, i, candidateOrder[k - 1]!) < 0) {
      candidateOrder[k] = candidateOrder[k - 1]!;
      k--;
    }
    candidateOrder[k] = i;
  }
  for (let i = 0; i < cap; i++) copySpot(src, candidateOrder[i]!, out, i);
  return cap;
}

/** 활성 흑점 수의 상한 절단 없는 값 — 마지막 {@link generateHeliographicSunspots} 호출의 후보 수 (D3 단언용). */
let lastUncappedCount = 0;
export function lastSunspotCandidateCount(): number {
  return lastUncappedCount;
}

/**
 * 생성기 — 장면 시계 jd 의 활성 흑점을 `out` 에 쓰고 개수를 반환한다 (할당 0, jd 순수 함수).
 *
 * 일 슬롯 `d = floor(jd − J2000)` 마다 시드 `(Math.imul(d, 0x9E3779B1) ^ SALT) >>> 0` 의 mulberry32 로 그날 신생 군을 만든다.
 * **슬롯 안 난수 소비 순서 (정본 — 바꾸면 골든 값 테스트가 깨진다)**:
 *   1. 개수 `n = floor(total + r)` (total = Σ 사이클 신생률)
 *   군 j = 0..n−1 마다:
 *   2. 사이클 선택 `r · total` (사이클 index 오름차순 누적)
 *   3. 생성 시각 `birth = 슬롯 시작 + r`
 *   4. 크기 — 정규 난수 (r 2 개)
 *   5. 반구 `r < 0.5 ? 북 : 남`
 *   6. 위도 — 정규 난수 (r 2 개)
 *   7. 경도 `r · 360`
 *   8. 양극 여부 — **최대 면적 > 40 MSH 일 때만** r 1 개 소비 (단락 평가)
 * 모든 소비는 생존 판정 **전**에 끝난다 — 그래서 슬롯의 난수열이 조회 jd 와 무관하고, 같은 흑점이 시간에 따라 이어진다.
 *
 * `!Number.isFinite(jd)` 또는 `|jd − J2000| > 1e7` 일이면 0 개. 활성 수가 {@link SUNSPOT_MAX} 를 넘으면 현재 면적 큰 순
 * (동률 id 사전순) 으로 자른다 — 1900~2100 에서는 걸리지 않는다 (ADR 1-H).
 */
export function generateHeliographicSunspots(jd: number, out: HeliographicSpots): number {
  lastUncappedCount = 0;
  if (!Number.isFinite(jd) || Math.abs(jd - J2000_JD) > SUNSPOT_JD_RANGE_DAYS) return 0;

  const today = Math.floor(jd - J2000_JD);
  let m = 0;
  for (let d = today - SLOT_LOOKBACK_DAYS; d <= today; d++) {
    const dayJd = J2000_JD + d;

    // 그날 흑점을 내는 사이클 (index 오름차순) 과 신생률.
    let kLo = latestCycleBefore(dayJd);
    const tauFloorJd = dayJd - CYCLE_ACTIVE_TAU_MAX_MONTHS * DAYS_PER_MONTH;
    let found = 0;
    while (found < MAX_ACTIVE_CYCLES && cycleStartJd(kLo) >= tauFloorJd) {
      found++;
      kLo--;
    }
    let nc = 0;
    let total = 0;
    for (let k = kLo + 1; nc < found; k++, nc++) {
      const tau = (dayJd - cycleStartJd(k)) / DAYS_PER_MONTH;
      const s = cycleShape(tau);
      cycleTau[nc] = tau;
      cycleS[nc] = s;
      total += GROUPS_PER_DAY_AT_MAX * s;
    }

    seedSlot(d);
    const n = Math.floor(total + rand());
    for (let j = 0; j < n; j++) {
      // 2. 사이클 선택 (신생률 비례) — 누적이 r·total 을 처음 넘는 사이클. 부동소수 끝값은 첫 사이클로 (POC 와 같음).
      let pick = rand() * total;
      let c = 0;
      for (let q = 0; q < nc; q++) {
        pick -= GROUPS_PER_DAY_AT_MAX * cycleS[q]!;
        if (pick <= 0) {
          c = q;
          break;
        }
      }
      const tau = cycleTau[c]!;
      const shape = cycleS[c]!;
      // 3~8.
      const birth = dayJd + rand();
      const lnA = LN_AREA_MEAN + LN_AREA_SD * gauss();
      const aMax = Math.min(SUNSPOT_AREA_MAX_MSH, Math.max(SUNSPOT_AREA_MIN_MSH, Math.exp(lnA)));
      const life = Math.max(LIFE_MIN_DAYS, aMax / DECAY_MSH_PER_DAY);
      const hemi = rand() < 0.5 ? 1 : -1;
      const sigma =
        WIDTH_BASE_DEG +
        WIDTH_SPAN_DEG * (1 - Math.exp(-(shape * WIDTH_ACTIVITY_PROXY) / WIDTH_AREA_SCALE));
      const centroid = CENTROID_LAT_START_DEG * Math.exp(-tau / CENTROID_LAT_DECAY_MONTHS);
      const lat0 = Math.max(0, centroid + sigma * gauss());
      const lon0 = rand() * 360;
      const bipolar = aMax > BIPOLAR_MIN_AREA_MSH && rand() < BIPOLAR_PROBABILITY;

      const age = jd - birth;
      if (age < 0 || age >= life) continue;

      // 면적 envelope — 수명 앞 10 % 성장, 나머지 선형 감쇠.
      const g = age / life;
      const env =
        g < GROWTH_FRACTION
          ? g / GROWTH_FRACTION
          : 1 - (g - GROWTH_FRACTION) / (1 - GROWTH_FRACTION);
      const area = aMax * env;
      const lat = hemi * lat0;
      // 차등 자전 — 경도는 군 중심 위도의 ω 로 나이만큼 (항성계).
      const lon = lon0 + sunspotOmegaDegPerDay(lat) * age;

      const parts = bipolar ? 2 : 1;
      const tiltRad = JOY_TILT_PER_LAT * lat0 * DEG;
      const sepDeg = bipolar ? (BIPOLAR_SEPARATION_RADII * Math.sqrt(2e-6 * area)) / DEG : 0;
      const lonScale = 1 / Math.max(BIPOLAR_COSLAT_FLOOR, Math.cos(lat * DEG));
      for (let pi = 0; pi < parts; pi++) {
        // 선행 (+1, 서쪽 = +경도 · 적도 쪽) / 후행 (−1). 단극은 0.
        const side = bipolar ? (pi === 0 ? 1 : -1) : 0;
        const frac = bipolar ? (pi === 0 ? LEADER_AREA_FRACTION : 1 - LEADER_AREA_FRACTION) : 1;
        const a = area * frac;
        const dLon = ((side * sepDeg) / 2) * Math.cos(tiltRad) * lonScale;
        const dLat = -side * hemi * (sepDeg / 2) * Math.sin(tiltRad);
        candidates.latDeg[m] = lat + dLat;
        candidates.lonDeg[m] = lon + dLon;
        candidates.radiusRad[m] = Math.sqrt(2e-6 * a);
        candidates.areaMsh[m] = a;
        candidates.idSlot[m] = d;
        candidates.idGroup[m] = j;
        candidates.idPart[m] = pi;
        m++;
      }
    }
  }

  lastUncappedCount = m;
  // 상한 이하면 생성 순서 (= id 사전순: 슬롯 · 군 · 성분 오름차순) 그대로.
  return selectLargestSpots(candidates, m, out, SUNSPOT_MAX);
}

// ─────────────────────────────────────────────────────────────────────────────
// 광과민성 감쇠 (결정 3) — 프레임 위상에서 매 프레임 1회
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 실효 자전 주파수 [Hz] = `|Δjd| / Δt × ω(0) / 360` — 흑점이 한 자리를 지나 다시 오는 빈도 (결정 3).
 * 재생 · 스크러버 드래그 · 점프를 같은 식으로 잡는다. 역재생은 `|Δjd|` 라 같다.
 */
export function sunspotEffectiveHz(deltaJd: number, deltaSec: number): number {
  return (Math.abs(deltaJd) / deltaSec) * (SUNSPOT_ROTATION_A_DEG_PER_DAY / 360);
}

/** 감쇠 상태 — 호출자 소유 (장면 1 개당 1 개). */
export interface SunspotVisibilityState {
  lastJd: number;
  lastMs: number;
  /** 현재 연속 구간의 판정 (`f > 3`). */
  fast: boolean;
  /** 그 판정이 시작된 시각 [ms]. */
  fastSinceMs: number;
  /** 목표 가시도 (0 · 1). */
  target: number;
  /** 실제 가시도 0~1 — 셰이더 `spotVisibility`. */
  visibility: number;
}

export function createSunspotVisibilityState(): SunspotVisibilityState {
  return {
    lastJd: Number.NaN,
    lastMs: Number.NaN,
    fast: false,
    fastSinceMs: Number.NaN,
    target: 1,
    visibility: 1,
  };
}

/**
 * 감쇠 한 걸음 — 장면 시계 jd 와 실시간 `nowMs` (performance.now) 로 가시도를 갱신해 반환한다 (할당 0).
 *
 * - 목표: `f > 3 Hz` 가 연속 `1/6 s` 이상 이어지면 0, `f ≤ 3` 이 같은 시간 이어지면 1, 그 사이는 직전 목표 유지.
 *   한 프레임만 튀는 Δjd (날짜 점프 · 탭 복귀) 는 지속 시간을 채우지 못해 무시된다.
 *   판정 구간은 직전 표본 시각부터다 — 구간 `[lastMs, nowMs]` 동안 그 주파수였다고 본다.
 * - 실제 값은 목표를 향해 초당 최대 `6` 으로만 움직인다 → 켜짐↔꺼짐 1 왕복 ≥ 1/3 s (1 초에 3 회 이하).
 * - 일시정지 (`Δjd = 0`) 는 `f = 0` 이라 지속 시간 뒤 가시도가 1 로 돌아온다 (프레임 위상은 일시정지에도 돈다, ADR 1-H).
 * - `Δt ≤ 0` (같은 시각의 재호출 · 시계 역행) 표본은 정보가 없어 상태를 바꾸지 않는다.
 */
export function stepSunspotVisibility(
  state: SunspotVisibilityState,
  jd: number,
  nowMs: number,
): number {
  if (!Number.isFinite(state.lastMs)) {
    state.lastJd = jd;
    state.lastMs = nowMs;
    state.fastSinceMs = nowMs;
    return state.visibility;
  }
  const dtMs = nowMs - state.lastMs;
  if (!(dtMs > 0)) return state.visibility;
  const dtSec = dtMs / 1000;
  const deltaJd = Number.isFinite(jd) && Number.isFinite(state.lastJd) ? jd - state.lastJd : 0;
  const fast = sunspotEffectiveHz(deltaJd, dtSec) > SUNSPOT_MAX_FLICKER_HZ;
  if (fast !== state.fast) {
    state.fast = fast;
    state.fastSinceMs = state.lastMs;
  }
  if ((nowMs - state.fastSinceMs) / 1000 >= SUNSPOT_VISIBILITY_PERSIST_S) {
    state.target = fast ? 0 : 1;
  }
  const maxStep = SUNSPOT_VISIBILITY_RATE_PER_S * dtSec;
  const diff = state.target - state.visibility;
  state.visibility += Math.max(-maxStep, Math.min(maxStep, diff));
  state.lastJd = jd;
  state.lastMs = nowMs;
  return state.visibility;
}
