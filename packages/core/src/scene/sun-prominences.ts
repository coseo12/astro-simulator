/**
 * #1428 — 태양 홍염: 태양면 고정 3D 루프 메시 (ADR `docs/decisions/20261107-1428-solar-flares-prominences.md` 결정 1 · 3 · 5 · 7).
 *
 * 홍염 전체 = 메시 1개 (`sun-prominences`) · GLSL `ShaderMaterial` 1개 (draw call +1). 루프 하나 = 리본 (곡선 점 `분절 + 1` 개 × 측 2).
 *
 * ## 세 부분 (흑점 모듈과 같은 분리 — ADR 1412 결정 2)
 *
 *  - 생성기 {@link generateProminences} — 장면 시계 jd → 활성 홍염 (태양면 좌표 · 높이 · 밝기) **jd 순수 함수**.
 *    일 슬롯 `d = floor(jd − J2000)` 마다 mulberry32 (`seedActivityRng(d, PROMINENCE_SEED_SALT)`), 신생률은 흑점의 사이클 모양
 *    (`activeSolarCycles` · `cycleShape`) 과 정온 하한, 위도는 흑점과 같은 활동대 (`activityBandCentroidDeg` · `activityBandWidthDeg`),
 *    경도는 차등 자전 `sunspotOmegaDegPerDay`. 흑점 목록과는 **독립**이다 (Q9).
 *  - 기하 기록기 {@link writeProminenceGeometry} — 목록 → 고정 크기 정점 버퍼 (곡선 점 · 접선 · 리본 측 · 밝기 · 반폭).
 *    태양면 → 장면 변환은 `heliographicToScene` (거울상 함정 — 데이터 좌표에서 기저를 만든다, ADR 1412 결정 2).
 *  - 메시 {@link createSunProminences} — 기준계 · 가시성 · 셰이더.
 *
 * ## 갱신 위상 (결정 1 · 3)
 *
 * 곡선 점은 jd 의 함수라 **시간 위상** (`updateAt`) 이 정점 버퍼를 갱신한다 — 일시정지 중에는 갱신 0. 카메라 정렬 (리본 펼침) 은
 * 정점 셰이더가 하므로 카메라만 움직이는 프레임에 CPU 갱신이 없다. 감쇠 가시도 (`uVisibility`) 는 프레임 위상이 쓴다.
 * 셰이더에 시간 · jd uniform 이 없다 (#782 규약 · ADR 774 재검토 조건 3).
 *
 * ## 기준계 계약 (ADR 1335 결정 2 그대로)
 *
 * draw 직전 `onBeforeRenderObservable` 에서 중심 = 태양 host mesh.position, 반경 = `body.radius × bodyScale('sun') × bodyFrame.scale`.
 * `floatingOrigin.originOffset` 은 읽지 않는다 (`sun-corona.ts` 머리말과 같은 함정).
 *
 * ## 가시성 축은 둘이다 — LOD 추종 (`isVisible`) 과 표시 토글 (`setEnabled`) (ADR 1335 결정 4 그대로)
 *
 * LOD 추종은 프레임 위상의 LOD 적용부가 쓴다. ⚠️ 이 모듈의 observer 안에서 `isVisible` 을 쓰지 않는다 (`sun-corona.ts` 머리말).
 * 감쇠 가시도 0 이어도 메시를 끄지 않는다 — 밝기에 곱할 뿐이다 (토글 축과 섞지 않는다).
 *
 * ## 이 모듈이 하지 않는 것
 *
 * 렌더러 종류를 모른다 — 소프트웨어 렌더 게이트는 web 책임 (결정 5). switch 금지 (WGSL 변환 — if-else 만).
 *
 * ⚠️ 표시 근사: 홍염 위치 · 높이 · 개수 · 수명은 **통계 모델**이다 (받아들인 비용 3). 높이 0.20~0.32 R 은 실제 범위
 * (0.015~0.15 R) 를 과장한 값이다 (Q8 — Visual Fidelity). 형태 상수는 아래 한곳 (rendering-only SSoT) 에 있다 — 최종값은 D-T2 육안.
 */
import {
  Color3,
  Constants,
  Effect,
  Mesh,
  ShaderMaterial,
  Vector3,
  type Scene,
} from '@babylonjs/core';
import { J2000_JD } from '@astro-simulator/shared';
import type { BodyReferenceFrame } from './belt-particles.js';
import { LOG_DEPTH_FRAGMENT_WRITE_GLSL } from './log-depth.js';
import {
  SOLAR_CYCLE_MAX_ACTIVE,
  SUNSPOT_JD_RANGE_DAYS,
  activeSolarCycles,
  activityBandCentroidDeg,
  activityBandWidthDeg,
  activityGauss,
  activityRand,
  heliographicToScene,
  seedActivityRng,
  sunspotOmegaDegPerDay,
} from './sunspots.js';

// ─────────────────────────────────────────────────────────────────────────────
// rendering-only 상수 SSoT (결정 7) — 출발값 = POC (ADR 1-A), 최종값 = D-T2 육안
// ─────────────────────────────────────────────────────────────────────────────

/** 동시에 그리는 홍염 상한 = 정점 버퍼 슬롯 수. 1900~2100 0.5 일 간격 생성기 실측 최대값보다 크게 둔다 (단위 테스트가 단언). */
export const PROMINENCE_MAX = 16;
/** 루프 하나의 분절 수 (곡선 점 = 분절 + 1). POC 값. */
export const PROMINENCE_SEGMENTS = 40;

/** 꼭대기 높이 범위 [R] — Q8 (POC 범위, 과장값). 균등 분포. */
export const PROMINENCE_HEIGHT_MIN_R = 0.2;
export const PROMINENCE_HEIGHT_MAX_R = 0.32;
/** 발자국 간격 범위 [° 경도] (POC 8~14°). 균등 분포. */
export const PROMINENCE_FOOT_SEPARATION_MIN_DEG = 8;
export const PROMINENCE_FOOT_SEPARATION_MAX_DEG = 14;
/** 아치 기울기 범위 [rad] — 반경 방향에서 옆으로 눕는 각 (±, 균등). POC 목록 −0.3~0.4. */
export const PROMINENCE_TILT_MAX_RAD = 0.4;
/** 두 번째 발자국의 위도 어긋남 [°/rad] — 기울기 × 이 값 (POC `tilt · 4`). */
export const PROMINENCE_TILT_FOOT_LAT_DEG_PER_RAD = 4;

/** 평균 사이클 극대에서 하루 신생 홍염 수 (사이클 모양 비례 항). 렌더 근사 — D-T2. */
export const PROMINENCES_PER_DAY_AT_MAX = 0.6;
/** 정온 홍염 하한 [개/일] — 사이클 극소에도 홍염이 있다 (Q9 근거). 렌더 근사 — D-T2. */
export const PROMINENCES_PER_DAY_QUIET = 0.15;
/** 수명 범위 [일] — 균등 분포. 렌더 근사 (실제 정온 홍염은 수 주 ~ 수 개월) — D-T2. */
export const PROMINENCE_LIFE_MIN_DAYS = 3;
export const PROMINENCE_LIFE_MAX_DAYS = 15;

/**
 * 밝기 · 높이 전이의 최소 지속 [일] (결정 1). 생성 · 소멸 · 분출 envelope 의 모든 전이가 이 값 이상이다 (단위 테스트가 단언) —
 * 감쇠 계수 {@link PROMINENCE_CYCLES_PER_DAY} 가 이 값에서 나온다 (결정 3).
 */
export const PROMINENCE_MIN_TRANSITION_DAYS = 0.5;
/** 상승 · 소멸 구간 = 수명 × 이 비율 (POC 20 %). `수명 최소 × 비율 ≥ 최소 전이` (단위 테스트). */
export const PROMINENCE_RISE_FRACTION = 0.2;
/** 상승 시작 높이 비율 — 상승 구간 동안 이 값에서 1 로 자란다 (POC 0.3). */
export const PROMINENCE_INITIAL_HEIGHT_FRACTION = 0.3;
/** 분출 확률 — 분출하는 홍염은 수명 끝 {@link PROMINENCE_ERUPTION_DAYS} 동안 높아지며 사라진다 (소멸 대신). */
export const PROMINENCE_ERUPTION_PROBABILITY = 0.25;
/** 분출 지속 [일] (POC 1 일). 높이는 이 동안 ×{@link PROMINENCE_ERUPTION_HEIGHT_FACTOR} 로 자란다. */
export const PROMINENCE_ERUPTION_DAYS = 1;
/** 분출 밝기 소멸이 시작되는 분출 경과 비율 (POC 0.3 일 / 1 일) — 소멸 전이 = (1 − 이 값) × 분출 지속. */
export const PROMINENCE_ERUPTION_FADE_START_FRACTION = 0.3;
/** 분출 끝 높이 배율 (ADR 1-A — ×3.2). */
export const PROMINENCE_ERUPTION_HEIGHT_FACTOR = 3.2;

/** 감쇠 실효 주파수 계수 `c` [cycles/일] = `1/(2T)`, T = 최소 전이 (ADR 1428 축 4 표 — 홍염 1 /일). */
export const PROMINENCE_CYCLES_PER_DAY = 1 / (2 * PROMINENCE_MIN_TRANSITION_DAYS);

/** 리본 반폭 [R] (POC 0.035). 양끝 가늘기: 반폭 × (`TAPER_BASE` + (1 − `TAPER_BASE`) · sin(π s)). */
export const PROMINENCE_HALF_WIDTH_R = 0.035;
export const PROMINENCE_TAPER_BASE = 0.6;
/** 가닥 결 (루프에 붙은 정적 밝기 변조) — `BASE + A1 sin(2π(F1 s + φ1)) + A2 sin(2π(F2 s + φ2))` (POC 값). */
export const PROMINENCE_THREAD_BASE = 0.75;
export const PROMINENCE_THREAD_AMP_1 = 0.15;
export const PROMINENCE_THREAD_FREQ_1 = 3;
export const PROMINENCE_THREAD_AMP_2 = 0.1;
export const PROMINENCE_THREAD_FREQ_2 = 7;

/** H-α 적색 (선형 RGB — 삭제안과 같은 색, ADR 결정 1 출발값). */
export const PROMINENCE_RGB: readonly [number, number, number] = [1.0, 0.32, 0.22];
/** 리본 중심 피크 세기 (ALPHA_ADD 가산량 — POC 0.85). */
export const PROMINENCE_PEAK_ALPHA = 0.85;
/** 리본 단면 `exp(−K v²)` 의 K (POC 2.5). */
export const PROMINENCE_ACROSS_FALLOFF = 2.5;
/** 림 경계 페더 — `smoothstep(1, 1 + 이 값, ρ)` (POC 0.015). */
export const PROMINENCE_LIMB_FEATHER_RHO = 0.015;

/**
 * 리본 측 방향 평행 특이점 문턱 (§교차검증 합의 1) — 단위 접선 × 단위 시선의 제곱 길이가 이 값보다 작으면 (사잇각 약 0.06° 이하 [계산] — `asin(√1e-6)`)
 * 대체 기저 `cross(radial, v)` 로 바꾼다. 정규화 하한 {@link PROMINENCE_SIDE_EPS_MIN} 은 0 벡터를 NaN 대신 0 으로 만든다.
 */
export const PROMINENCE_SIDE_EPS = 1e-6;
export const PROMINENCE_SIDE_EPS_MIN = 1e-12;

/** 슬롯 난수열 salt (흑점 0x1412 와 다른 값 — 결정 1). */
export const PROMINENCE_SEED_SALT = 0x1428;
/** 슬롯 lookback [일] — 흑점 생성기 규약 `⌈최장 수명⌉ + 2` (§교차검증 합의 3). */
export const PROMINENCE_SLOT_LOOKBACK_DAYS = Math.ceil(PROMINENCE_LIFE_MAX_DAYS) + 2;

/** 메시 이름 (진단이 이 이름으로 찾는다). */
export const SUN_PROMINENCES_MESH_NAME = 'sun-prominences';
/** 커스텀 정점 속성 이름 — 곡선 접선 · 리본 매개변수 `(측 ±1, 밝기, 반폭 [R])`. 곡선 점은 표준 `position`. */
export const PROMINENCE_TANGENT_KIND = 'promTangent';
export const PROMINENCE_PARAMS_KIND = 'promParams';
const SHADER_NAME = 'sunProminence';

const POINTS_PER_LOOP = PROMINENCE_SEGMENTS + 1;
/** 루프 1개 정점 수 = 곡선 점 × 측 2. */
export const PROMINENCE_VERTICES_PER_LOOP = POINTS_PER_LOOP * 2;
/** 정점 버퍼 총 정점 수 (고정 — §교차검증 합의 2). */
export const PROMINENCE_VERTEX_COUNT = PROMINENCE_MAX * PROMINENCE_VERTICES_PER_LOOP;

// ─────────────────────────────────────────────────────────────────────────────
// 생성기 (jd 순수 함수)
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 생성기 출력 (struct of arrays, 길이 {@link PROMINENCE_MAX}). 호출자 소유.
 * id = `(slot, index)` — 생성 일 슬롯 · 그 슬롯 안 순번. 사전순은 슬롯 단위로만 생성 순서다 (슬롯 안 생성 시각 `birth` 는 순번과 무관).
 */
export interface ProminenceList {
  /** 첫 발자국 위도 [°] (두 번째 발자국은 `+ 기울기 × 4°`). */
  latDeg: Float64Array;
  /** 발자국 중심 경도 [°] — 그 jd 의 차등 자전 반영값. */
  lonDeg: Float64Array;
  sepDeg: Float64Array;
  tiltRad: Float64Array;
  /** 현재 꼭대기 높이 [R] — 상승 · 분출 배율 반영값. */
  heightR: Float64Array;
  /** 현재 밝기 envelope 0~1 (가닥 결 · 감쇠 가시도 전). */
  brightness: Float64Array;
  threadPhase1: Float64Array;
  threadPhase2: Float64Array;
  idSlot: Int32Array;
  idIndex: Int32Array;
}

export function createProminenceList(capacity: number = PROMINENCE_MAX): ProminenceList {
  return {
    latDeg: new Float64Array(capacity),
    lonDeg: new Float64Array(capacity),
    sepDeg: new Float64Array(capacity),
    tiltRad: new Float64Array(capacity),
    heightR: new Float64Array(capacity),
    brightness: new Float64Array(capacity),
    threadPhase1: new Float64Array(capacity),
    threadPhase2: new Float64Array(capacity),
    idSlot: new Int32Array(capacity),
    idIndex: new Int32Array(capacity),
  };
}

function smoothstep(edge0: number, edge1: number, x: number): number {
  const t = Math.min(Math.max((x - edge0) / (edge1 - edge0), 0), 1);
  return t * t * (3 - 2 * t);
}

/**
 * 밝기 envelope — 나이 `age` [일] · 수명 `life` [일]. 앞 `RISE_FRACTION` 상승 (smoothstep). 끝은 분출 여부에 따라
 * 소멸 (`RISE_FRACTION` 구간 smoothstep) 또는 분출 (끝 `ERUPTION_DAYS` 의 `FADE_START` 이후 smoothstep). 수명 밖은 0.
 */
export function prominenceBrightness(age: number, life: number, erupts: boolean): number {
  if (!(age >= 0) || !(age < life)) return 0;
  const rise = PROMINENCE_RISE_FRACTION * life;
  const up = smoothstep(0, rise, age);
  if (erupts) {
    const te = age - (life - PROMINENCE_ERUPTION_DAYS);
    return (
      up *
      (1 -
        smoothstep(
          PROMINENCE_ERUPTION_FADE_START_FRACTION * PROMINENCE_ERUPTION_DAYS,
          PROMINENCE_ERUPTION_DAYS,
          te,
        ))
    );
  }
  return up * (1 - smoothstep(life - rise, life, age));
}

/** 높이 배율 — 상승 구간 `INITIAL → 1`, 분출 구간 `1 → ERUPTION_HEIGHT_FACTOR` (smoothstep). */
export function prominenceHeightScale(age: number, life: number, erupts: boolean): number {
  const rise = PROMINENCE_RISE_FRACTION * life;
  const grow =
    PROMINENCE_INITIAL_HEIGHT_FRACTION +
    (1 - PROMINENCE_INITIAL_HEIGHT_FRACTION) * smoothstep(0, rise, age);
  if (!erupts) return grow;
  const te = age - (life - PROMINENCE_ERUPTION_DAYS);
  return (
    grow *
    (1 + (PROMINENCE_ERUPTION_HEIGHT_FACTOR - 1) * smoothstep(0, PROMINENCE_ERUPTION_DAYS, te))
  );
}

const cycleTau = new Float64Array(SOLAR_CYCLE_MAX_ACTIVE);
const cycleS = new Float64Array(SOLAR_CYCLE_MAX_ACTIVE);

/** 마지막 {@link generateProminences} 의 상한 절단 전 활성 수 (단위 테스트 — 상한 여유 단언용). */
let lastUncappedCount = 0;
export function lastProminenceCandidateCount(): number {
  return lastUncappedCount;
}

/**
 * 생성기 — 장면 시계 jd 의 활성 홍염을 `out` 에 쓰고 개수를 반환한다 (할당 0, jd 순수 함수).
 *
 * **진입부 계약 (결정 1)**: 첫 문장에서 `!Number.isFinite(jd)` 또는 `|jd − J2000| > SUNSPOT_JD_RANGE_DAYS` 이면 0 개 —
 * 슬롯 루프 · 시드 연산 · 출력 버퍼 쓰기보다 앞 (흑점 생성기와 같은 위치 · 같은 범위 상수).
 *
 * 슬롯 `[today − LOOKBACK, today]` 순회 (흑점 생성기 규약). **슬롯 안 난수 소비 순서 (정본 — 바꾸면 골든 값 테스트가 깨진다)**:
 *   1. 개수 `n = floor(rate + r)` (rate = 정온 + 극대 × Σ 사이클 모양)
 *   개체 j = 0..n−1 마다:
 *   2. 사이클 선택 `r · Σ모양` (모양이 모두 0 이면 마지막 사이클)
 *   3. 생성 시각 `birth = 슬롯 시작 + r`
 *   4. 수명 `MIN + r (MAX − MIN)`
 *   5. 반구 `r < 0.5 ? 북 : 남`
 *   6. 위도 — 정규 난수 (r 2 개)
 *   7. 경도 `r · 360`
 *   8. 발자국 간격 · 9. 꼭대기 높이 · 10. 기울기 (`(2r − 1) · MAX`) · 11. 분출 `r < P` · 12~13. 가닥 위상 2 개
 * 모든 소비는 생존 판정 **전**에 끝난다 — 슬롯의 난수열이 조회 jd 와 무관해 같은 개체가 자정 경계를 넘어 이어진다 (D9).
 *
 * 활성 수가 {@link PROMINENCE_MAX} 를 넘으면 id 사전순으로 앞의 `PROMINENCE_MAX` 개를 남긴다 (오래된 슬롯 우선 — 이미 보이는
 * 루프가 새 루프 때문에 사라지지 않는다). 상한은 실측 최대보다 크게 둔다.
 */
export function generateProminences(jd: number, out: ProminenceList): number {
  lastUncappedCount = 0;
  if (!Number.isFinite(jd) || Math.abs(jd - J2000_JD) > SUNSPOT_JD_RANGE_DAYS) return 0;

  const cap = Math.min(PROMINENCE_MAX, out.latDeg.length);
  const today = Math.floor(jd - J2000_JD);
  let m = 0;
  for (let d = today - PROMINENCE_SLOT_LOOKBACK_DAYS; d <= today; d++) {
    const dayJd = J2000_JD + d;
    const nc = activeSolarCycles(dayJd, cycleTau, cycleS);
    let shapeTotal = 0;
    for (let q = 0; q < nc; q++) shapeTotal += cycleS[q]!;
    const rate = PROMINENCES_PER_DAY_QUIET + PROMINENCES_PER_DAY_AT_MAX * shapeTotal;

    seedActivityRng(d, PROMINENCE_SEED_SALT);
    const n = Math.floor(rate + activityRand());
    for (let j = 0; j < n; j++) {
      // 2. 사이클 선택 (모양 비례). 모양이 모두 0 이면 (사이클 시작 직후) 가장 새 사이클.
      let pick = activityRand() * shapeTotal;
      let c = nc - 1;
      for (let q = 0; q < nc; q++) {
        pick -= cycleS[q]!;
        if (pick <= 0 && shapeTotal > 0) {
          c = q;
          break;
        }
      }
      const tau = c >= 0 ? cycleTau[c]! : 0;
      const shape = c >= 0 ? cycleS[c]! : 0;
      // 3~13.
      const birth = dayJd + activityRand();
      const life =
        PROMINENCE_LIFE_MIN_DAYS +
        activityRand() * (PROMINENCE_LIFE_MAX_DAYS - PROMINENCE_LIFE_MIN_DAYS);
      const hemi = activityRand() < 0.5 ? 1 : -1;
      const lat0 = Math.max(
        0,
        activityBandCentroidDeg(tau) + activityBandWidthDeg(shape) * activityGauss(),
      );
      const lon0 = activityRand() * 360;
      const sep =
        PROMINENCE_FOOT_SEPARATION_MIN_DEG +
        activityRand() * (PROMINENCE_FOOT_SEPARATION_MAX_DEG - PROMINENCE_FOOT_SEPARATION_MIN_DEG);
      const height =
        PROMINENCE_HEIGHT_MIN_R +
        activityRand() * (PROMINENCE_HEIGHT_MAX_R - PROMINENCE_HEIGHT_MIN_R);
      const tilt = (2 * activityRand() - 1) * PROMINENCE_TILT_MAX_RAD;
      const erupts = activityRand() < PROMINENCE_ERUPTION_PROBABILITY;
      const phase1 = activityRand();
      const phase2 = activityRand();

      const age = jd - birth;
      if (age < 0 || age >= life) continue;
      lastUncappedCount++;
      if (m >= cap) continue;

      const lat = hemi * lat0;
      out.latDeg[m] = lat;
      // 차등 자전 — 발자국 중심 경도가 첫 발자국 위도의 ω 로 나이만큼 돈다 (흑점과 같은 식 — 항성계).
      out.lonDeg[m] = lon0 + sunspotOmegaDegPerDay(lat) * age;
      out.sepDeg[m] = sep;
      out.tiltRad[m] = tilt;
      out.heightR[m] = height * prominenceHeightScale(age, life, erupts);
      out.brightness[m] = prominenceBrightness(age, life, erupts);
      out.threadPhase1[m] = phase1;
      out.threadPhase2[m] = phase2;
      out.idSlot[m] = d;
      out.idIndex[m] = j;
      m++;
    }
  }
  return m;
}

// ─────────────────────────────────────────────────────────────────────────────
// 기하 기록기 — 목록 → 고정 크기 정점 버퍼 (§교차검증 합의 2)
// ─────────────────────────────────────────────────────────────────────────────

/** 정점 버퍼 3 종 (고정 길이 {@link PROMINENCE_VERTEX_COUNT} × 3). */
export interface ProminenceVertexBuffers {
  /** 곡선 점 — 태양 중심 기준 · R 단위 (장면 좌표 방향). */
  positions: Float32Array;
  /** 곡선 접선 (정규화 전 — 셰이더가 정규화). */
  tangents: Float32Array;
  /** `(리본 측 ±1, 밝기, 반폭 [R])`. */
  params: Float32Array;
}

export function createProminenceVertexBuffers(): ProminenceVertexBuffers {
  return {
    positions: new Float32Array(PROMINENCE_VERTEX_COUNT * 3),
    tangents: new Float32Array(PROMINENCE_VERTEX_COUNT * 3),
    params: new Float32Array(PROMINENCE_VERTEX_COUNT * 3),
  };
}

/** 고정 인덱스 버퍼 — 루프마다 분절 × 삼각형 2 (정점 순서: 곡선 점 k 의 측 −1, +1). */
export function buildProminenceIndices(): Uint32Array {
  const indices = new Uint32Array(PROMINENCE_MAX * PROMINENCE_SEGMENTS * 6);
  let w = 0;
  for (let i = 0; i < PROMINENCE_MAX; i++) {
    const base = i * PROMINENCE_VERTICES_PER_LOOP;
    for (let k = 0; k < PROMINENCE_SEGMENTS; k++) {
      const a = base + k * 2;
      indices[w++] = a;
      indices[w++] = a + 1;
      indices[w++] = a + 3;
      indices[w++] = a;
      indices[w++] = a + 3;
      indices[w++] = a + 2;
    }
  }
  return indices;
}

/** 곡선 점 scratch (루프 1개 — 접선 차분에 이웃 점이 필요하다). */
const curve = new Float64Array(POINTS_PER_LOOP * 3);
const foot1 = new Float64Array(3);
const foot2 = new Float64Array(3);

/**
 * 루프 i 의 곡선 점을 `curve` scratch 에 쓴다 (R 단위, 태양 중심 기준). POC 식 그대로:
 * 발자국 현을 따라 `b(s)` 를 잇고 반경 방향 `radial = b/|b|` 로 `1 + lift cos(tilt)`, 옆 (`radial × 현`) 으로 `lift sin(tilt)`,
 * `lift = 높이 · sin(π s)`.
 */
function writeLoopCurve(list: ProminenceList, i: number): void {
  const lat = list.latDeg[i]!;
  const lon = list.lonDeg[i]!;
  const sep = list.sepDeg[i]!;
  const tilt = list.tiltRad[i]!;
  const h = list.heightR[i]!;
  heliographicToScene(lat, lon - sep / 2, foot1, 0);
  heliographicToScene(lat + tilt * PROMINENCE_TILT_FOOT_LAT_DEG_PER_RAD, lon + sep / 2, foot2, 0);
  const cx = foot2[0]! - foot1[0]!;
  const cy = foot2[1]! - foot1[1]!;
  const cz = foot2[2]! - foot1[2]!;
  const ct = Math.cos(tilt);
  const st = Math.sin(tilt);
  for (let k = 0; k < POINTS_PER_LOOP; k++) {
    const s = k / PROMINENCE_SEGMENTS;
    const bx = foot1[0]! + cx * s;
    const by = foot1[1]! + cy * s;
    const bz = foot1[2]! + cz * s;
    const bn = Math.hypot(bx, by, bz);
    const rx = bx / bn;
    const ry = by / bn;
    const rz = bz / bn;
    const sx = ry * cz - rz * cy;
    const sy = rz * cx - rx * cz;
    const sz = rx * cy - ry * cx;
    const sn = Math.hypot(sx, sy, sz) || 1;
    const lift = h * Math.sin(Math.PI * s);
    const up = 1 + lift * ct;
    const side = (lift * st) / sn;
    curve[k * 3] = rx * up + sx * side;
    curve[k * 3 + 1] = ry * up + sy * side;
    curve[k * 3 + 2] = rz * up + sz * side;
  }
}

/** 곡선 점 k 의 밝기 (envelope × 가닥 결) 와 반폭 [R] (양끝 가늘기). */
function threadFactor(list: ProminenceList, i: number, s: number): number {
  return (
    PROMINENCE_THREAD_BASE +
    PROMINENCE_THREAD_AMP_1 *
      Math.sin(2 * Math.PI * (PROMINENCE_THREAD_FREQ_1 * s + list.threadPhase1[i]!)) +
    PROMINENCE_THREAD_AMP_2 *
      Math.sin(2 * Math.PI * (PROMINENCE_THREAD_FREQ_2 * s + list.threadPhase2[i]!))
  );
}

/**
 * 목록 → 정점 버퍼 (할당 0). 슬롯 `i < count` 는 루프 i, 나머지 슬롯은 **밝기 0 + 모든 정점을 같은 점 (원점) · 반폭 0 으로 퇴화**
 * (면적 0 삼각형 — fragment 없음, §교차검증 합의 2). 인덱스 버퍼 · 버퍼 길이는 바뀌지 않는다.
 */
export function writeProminenceGeometry(
  list: ProminenceList,
  count: number,
  buffers: ProminenceVertexBuffers,
): void {
  const { positions, tangents, params } = buffers;
  const n = Math.min(count, PROMINENCE_MAX);
  for (let i = 0; i < PROMINENCE_MAX; i++) {
    const loopBase = i * PROMINENCE_VERTICES_PER_LOOP;
    if (i >= n) {
      for (let v = 0; v < PROMINENCE_VERTICES_PER_LOOP; v++) {
        const o = (loopBase + v) * 3;
        positions[o] = 0;
        positions[o + 1] = 0;
        positions[o + 2] = 0;
        tangents[o] = 0;
        tangents[o + 1] = 0;
        tangents[o + 2] = 0;
        params[o] = v % 2 === 0 ? -1 : 1;
        params[o + 1] = 0;
        params[o + 2] = 0;
      }
      continue;
    }
    writeLoopCurve(list, i);
    const bright = list.brightness[i]!;
    for (let k = 0; k < POINTS_PER_LOOP; k++) {
      const s = k / PROMINENCE_SEGMENTS;
      const k0 = Math.max(k - 1, 0);
      const k1 = Math.min(k + 1, PROMINENCE_SEGMENTS);
      const tx = curve[k1 * 3]! - curve[k0 * 3]!;
      const ty = curve[k1 * 3 + 1]! - curve[k0 * 3 + 1]!;
      const tz = curve[k1 * 3 + 2]! - curve[k0 * 3 + 2]!;
      const b = bright * threadFactor(list, i, s);
      const halfWidth =
        PROMINENCE_HALF_WIDTH_R *
        (PROMINENCE_TAPER_BASE + (1 - PROMINENCE_TAPER_BASE) * Math.sin(Math.PI * s));
      for (let side = 0; side < 2; side++) {
        const o = (loopBase + k * 2 + side) * 3;
        positions[o] = curve[k * 3]!;
        positions[o + 1] = curve[k * 3 + 1]!;
        positions[o + 2] = curve[k * 3 + 2]!;
        tangents[o] = tx;
        tangents[o + 1] = ty;
        tangents[o + 2] = tz;
        params[o] = side === 0 ? -1 : 1;
        params[o + 1] = b;
        params[o + 2] = halfWidth;
      }
    }
  }
}

/** 루프 i 의 꼭대기 (s = 0.5) 곡선 점 [R] 을 `out` 에 쓴다 — D2 투영 표본 (기본 카메라에서 림 밖인가) 용. */
export function prominenceApex(
  list: ProminenceList,
  i: number,
  out: Float64Array | number[],
): void {
  writeLoopCurve(list, i);
  const k = Math.floor(PROMINENCE_SEGMENTS / 2);
  out[0] = curve[k * 3]!;
  out[1] = curve[k * 3 + 1]!;
  out[2] = curve[k * 3 + 2]!;
}

// ─────────────────────────────────────────────────────────────────────────────
// 리본 측 방향 JS 미러 (결정 1 · §교차검증 합의 1 — 셰이더와 같은 식)
// ─────────────────────────────────────────────────────────────────────────────

type Vec3 = readonly [number, number, number];

function safeNormalizeMirror(x: number, y: number, z: number): [number, number, number] {
  const k = 1 / Math.sqrt(Math.max(x * x + y * y + z * z, PROMINENCE_SIDE_EPS_MIN));
  return [x * k, y * k, z * k];
}

/**
 * 리본 측 방향 — 정점 셰이더 `ribbonSide` 와 같은 식. 접선 `t` · 시선 `view` (카메라 → 정점) 를 정규화한 뒤 `cross(t, v)`,
 * 제곱 길이 < `SIDE_EPS` 면 `cross(radial, v)` (`radial` = 곡선 점 방향), 마지막에 `inversesqrt(max(·, SIDE_EPS_MIN))` 정규화.
 * 둘 다 퇴화하면 0 벡터 (폭 0 리본) — NaN 이 아니다 (D9).
 */
export function prominenceRibbonSideMirror(
  t: Vec3,
  view: Vec3,
  radial: Vec3,
): [number, number, number] {
  const tn = safeNormalizeMirror(t[0], t[1], t[2]);
  const vn = safeNormalizeMirror(view[0], view[1], view[2]);
  let sx = tn[1] * vn[2] - tn[2] * vn[1];
  let sy = tn[2] * vn[0] - tn[0] * vn[2];
  let sz = tn[0] * vn[1] - tn[1] * vn[0];
  if (sx * sx + sy * sy + sz * sz < PROMINENCE_SIDE_EPS) {
    const rn = safeNormalizeMirror(radial[0], radial[1], radial[2]);
    sx = rn[1] * vn[2] - rn[2] * vn[1];
    sy = rn[2] * vn[0] - rn[0] * vn[2];
    sz = rn[0] * vn[1] - rn[1] * vn[0];
  }
  return safeNormalizeMirror(sx, sy, sz);
}

// ─────────────────────────────────────────────────────────────────────────────
// 셰이더
// ─────────────────────────────────────────────────────────────────────────────

const glslFloat = (n: number): string => n.toExponential(6);

/**
 * 정점 셰이더. `position` = 곡선 점 (태양 중심 기준 · R 단위). 세계 좌표 = `uSunCenter + uSunRadius · position` (mesh 변환 미사용 —
 * `viewProjection` 만 쓴다). 측 방향은 카메라 위치로 매 draw 계산한다 (결정 1 — 카메라만 움직이는 프레임에 CPU 갱신 0).
 */
export const SUN_PROMINENCE_VERTEX_SHADER = /* glsl */ `
precision highp float;

attribute vec3 position;
attribute vec3 ${PROMINENCE_TANGENT_KIND};
attribute vec3 ${PROMINENCE_PARAMS_KIND};

uniform mat4 viewProjection;
uniform vec3 cameraPosition;
uniform vec3 uSunCenter;
uniform float uSunRadius;

varying vec3 vWorldPos;
varying vec2 vRibbon;
varying float vFragmentDepth;

const float SIDE_EPS = ${glslFloat(PROMINENCE_SIDE_EPS)};
const float SIDE_EPS_MIN = ${glslFloat(PROMINENCE_SIDE_EPS_MIN)};

// 0 벡터는 NaN 대신 0 으로 (§교차검증 합의 1 — 안전 정규화).
vec3 safeNormalize(vec3 v) {
  return v * inversesqrt(max(dot(v, v), SIDE_EPS_MIN));
}

void main(void) {
  vec3 center = uSunCenter + uSunRadius * position;
  vec3 t = safeNormalize(${PROMINENCE_TANGENT_KIND});
  vec3 v = safeNormalize(center - cameraPosition);
  vec3 side = cross(t, v);
  // 평행 특이점 — 다리가 시선과 나란하면 외적이 0 이다. 반경 방향 기저로 바꾼다 (둘 다 퇴화하면 폭 0 리본).
  if (dot(side, side) < SIDE_EPS) {
    side = cross(safeNormalize(position), v);
  }
  side = safeNormalize(side);
  vec3 p = center + side * (${PROMINENCE_PARAMS_KIND}.x * ${PROMINENCE_PARAMS_KIND}.z * uSunRadius);
  vWorldPos = p;
  vRibbon = vec2(${PROMINENCE_PARAMS_KIND}.x, ${PROMINENCE_PARAMS_KIND}.y);
  vec4 clip = viewProjection * vec4(p, 1.0);
  gl_Position = clip;
  vFragmentDepth = 1.0 + clip.w;
}
`;

/**
 * fragment — ALPHA_ADD. 각반경 판정 `ρ < 1` (disk 안쪽) 을 앞뒤 관계없이 버린다 — `ρ ≥ 1` 시선은 태양 구와 만나지 않으므로
 * 가시 영역이 태양 깊이에 의존하지 않는다 (§교차검증 이견 1). ρ 식은 코로나와 같다 (`acos` 정의역 clamp).
 */
export const SUN_PROMINENCE_FRAGMENT_SHADER = /* glsl */ `
precision highp float;

varying vec3 vWorldPos;
varying vec2 vRibbon;
varying float vFragmentDepth;

uniform vec3 cameraPosition;
uniform vec3 uSunCenter;
uniform float uSunRadius;
uniform float logDepthConstant;
uniform vec3 uProminenceColor;
uniform float uVisibility;

const float PEAK_ALPHA = ${glslFloat(PROMINENCE_PEAK_ALPHA)};
const float ACROSS_FALLOFF = ${glslFloat(PROMINENCE_ACROSS_FALLOFF)};
const float LIMB_FEATHER = ${glslFloat(PROMINENCE_LIMB_FEATHER_RHO)};

void main(void) {
  vec3 r = normalize(vWorldPos - cameraPosition);
  vec3 toSun = uSunCenter - cameraPosition;
  float d = length(toSun);
  vec3 s = d > 0.0 ? toSun / d : vec3(0.0, 0.0, 1.0);
  float alpha = asin(min(uSunRadius / max(d, 1e-30), 1.0));
  float rho = acos(clamp(dot(r, s), -1.0, 1.0)) / max(alpha, 1e-30);
  if (rho < 1.0) {
    discard;
  }
  float across = exp(-ACROSS_FALLOFF * vRibbon.x * vRibbon.x);
  float edge = smoothstep(1.0, 1.0 + LIMB_FEATHER, rho);
  vec3 col = uProminenceColor * (PEAK_ALPHA * vRibbon.y * across * edge * uVisibility);
  gl_FragColor = vec4(col, 1.0);
  ${LOG_DEPTH_FRAGMENT_WRITE_GLSL}
}
`;

/** `ShaderMaterial` 선언 목록 — 셰이더 선언과의 일관성은 단위 테스트가 단언한다 (§교차검증 이견 3). */
export const SUN_PROMINENCE_ATTRIBUTES: readonly string[] = [
  'position',
  PROMINENCE_TANGENT_KIND,
  PROMINENCE_PARAMS_KIND,
];
export const SUN_PROMINENCE_UNIFORMS: readonly string[] = [
  'viewProjection',
  // Babylon 표준 auto-bind — bind 단계에서 scene.activeCamera.globalPosition (코로나 선례).
  'cameraPosition',
  'uSunCenter',
  'uSunRadius',
  'logDepthConstant',
  'uProminenceColor',
  'uVisibility',
];

let prominenceShaderRegistered = false;
function registerProminenceShader(): void {
  if (prominenceShaderRegistered) return;
  Effect.ShadersStore[`${SHADER_NAME}VertexShader`] = SUN_PROMINENCE_VERTEX_SHADER;
  Effect.ShadersStore[`${SHADER_NAME}FragmentShader`] = SUN_PROMINENCE_FRAGMENT_SHADER;
  prominenceShaderRegistered = true;
}

// ─────────────────────────────────────────────────────────────────────────────
// 메시
// ─────────────────────────────────────────────────────────────────────────────

export interface SunProminencesOptions {
  /** 태양 host mesh (high variant — position anchor · LOD 추종 대상). */
  sunMesh: Mesh;
  /** 태양 반경 (m) × bodyScale('sun') — 기록 스케일을 곱하면 sun high mesh 세계 반경 (코로나와 같은 값). */
  radiusMeters: number;
  /** body mesh 가 쓴 기준계 스냅샷 제공자 — draw 직전마다 호출 (캐시 금지). `scale` 만 쓴다. */
  frameProvider: () => BodyReferenceFrame;
}

/** 마지막 draw 직전에 material 에 실은 값 (진단 · 단위 테스트용). */
export interface SunProminencesUniforms {
  center: [number, number, number];
  radius: number;
  scale: number;
  logDepthConstant: number;
}

export interface SunProminencesHandles {
  mesh: Mesh;
  material: ShaderMaterial;
  /** LOD 추종 대상 (태양 high mesh). */
  sunMesh: Mesh;
  /** 시간 위상 — 장면 시계 jd 의 루프를 정점 버퍼에 기록하고 활성 수를 반환한다 (재할당 0). */
  writeAt: (clockJd: number) => number;
  /** 프레임 위상 — 감쇠 가시도 (0~1) 를 밝기에 곱한다. */
  setFadeVisibility: (visibility: number) => void;
  /** 마지막 `writeAt` 의 활성 수. */
  activeCount: () => number;
  applyFrameUniforms: () => void;
  readFrameUniforms: () => SunProminencesUniforms | null;
  dispose: () => void;
}

/** 태양 홍염 메시 생성 (태양 1개). 정점 버퍼는 여기서 1 회 할당한다 (이후 제자리 갱신 — §교차검증 합의 2). */
export function createSunProminences(
  scene: Scene,
  options: SunProminencesOptions,
): SunProminencesHandles {
  const { sunMesh, radiusMeters, frameProvider } = options;
  const list = createProminenceList();
  const buffers = createProminenceVertexBuffers();
  writeProminenceGeometry(list, 0, buffers);

  const mesh = new Mesh(SUN_PROMINENCES_MESH_NAME, scene);
  mesh.setVerticesData('position', buffers.positions, true, 3);
  mesh.setVerticesData(PROMINENCE_TANGENT_KIND, buffers.tangents, true, 3);
  mesh.setVerticesData(PROMINENCE_PARAMS_KIND, buffers.params, true, 3);
  mesh.setIndices(buildProminenceIndices());
  // 정점 셰이더가 세계 위치를 정하므로 (R 단위 곡선 점) bounding 은 무의미 — 컬링 대상에서 뺀다.
  mesh.alwaysSelectAsActiveMesh = true;
  mesh.isPickable = false;
  // 코로나와 같은 값 — 가산끼리는 순서 무관 (결정 1).
  mesh.alphaIndex = 0;

  registerProminenceShader();
  const material = new ShaderMaterial(
    `${SUN_PROMINENCES_MESH_NAME}-mat`,
    scene,
    { vertex: SHADER_NAME, fragment: SHADER_NAME },
    {
      attributes: [...SUN_PROMINENCE_ATTRIBUTES],
      uniforms: [...SUN_PROMINENCE_UNIFORMS],
      needAlphaBlending: true,
    },
  );
  material.setColor3('uProminenceColor', new Color3(...PROMINENCE_RGB));
  material.setFloat('uVisibility', 1);
  material.alphaMode = Constants.ALPHA_ADD;
  material.disableDepthWrite = true;
  // 리본 감김은 시선에 따라 뒤집힌다 — 컬링을 끈다.
  material.backFaceCulling = false;
  mesh.material = material;

  let count = 0;
  const writeAt = (clockJd: number): number => {
    count = generateProminences(clockJd, list);
    writeProminenceGeometry(list, count, buffers);
    mesh.updateVerticesData('position', buffers.positions);
    mesh.updateVerticesData(PROMINENCE_TANGENT_KIND, buffers.tangents);
    mesh.updateVerticesData(PROMINENCE_PARAMS_KIND, buffers.params);
    return count;
  };

  const tmpCenter = new Vector3();
  let lastUniforms: SunProminencesUniforms | null = null;
  // ⚠️ 여기서 `mesh.isVisible` 을 쓰지 않는다 (머리말 — 가시성 축은 프레임 위상 소유).
  const applyFrameUniforms = (): void => {
    const s = sunMesh.position;
    const { scale } = frameProvider();
    const radius = radiusMeters * scale;
    const maxZ = scene.activeCamera?.maxZ ?? 1e14;
    const logDepthConstant = 2.0 / (Math.log(maxZ + 1.0) / Math.LN2);
    tmpCenter.set(s.x, s.y, s.z);
    material.setVector3('uSunCenter', tmpCenter);
    material.setFloat('uSunRadius', radius);
    material.setFloat('logDepthConstant', logDepthConstant);
    lastUniforms = { center: [s.x, s.y, s.z], radius, scale, logDepthConstant };
  };
  applyFrameUniforms();
  mesh.onBeforeRenderObservable.add(applyFrameUniforms);

  return {
    mesh,
    material,
    sunMesh,
    writeAt,
    setFadeVisibility: (visibility: number) => material.setFloat('uVisibility', visibility),
    activeCount: () => count,
    applyFrameUniforms,
    readFrameUniforms: () => lastUniforms,
    dispose: () => {
      mesh.onBeforeRenderObservable.clear();
      material.dispose();
      mesh.dispose();
    },
  };
}
