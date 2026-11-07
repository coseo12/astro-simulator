/**
 * #1428 — 태양 플레어 목록: 장면 시계 jd + 그 jd 의 흑점 목록 → 플레어 (태양면 위치 · 세기) 순수 함수.
 *
 * **설계 근거**: ADR `docs/decisions/20261107-1428-solar-flares-prominences.md`
 *   - 결정 4 — 플레어 자리는 흑점 생성기의 **군**이다. 군마다 일 슬롯 해시로 그날의 발생을 **슬롯당 0 또는 1 회** 정하고
 *     (발생률은 군 면적에 비례), 세기 = 광도 곡선 (상승 15 분 smoothstep · 감쇠 45 분 지수) × 감쇠 가시도.
 *   - Amendment 1 — 세기에 면적 게이트 {@link sunFlareAreaGate} 를 곱한다 (연속성 — 발생 확률은 `p` 그대로). 감쇠 가시도는
 *     셰이더 uniform `flareVisibility` 로 따로 곱한다.
 *   - §교차검증 합의 4 — **이 모듈은 흑점 생성기를 부르지 않는다.** 장면이 `updateAt` 에서 흑점 목록을 1 회 만들어 흑점 uniform
 *     기록과 이 생성기에 함께 넘긴다 (`?sunspots=off` 에서도 플레어 자리가 있다 — 토글 1 개 = 효과 1 개).
 *   - §교차검증 합의 7 — {@link MAX_SUN_FLARES} 가 셰이더 배열 크기 · 생성기 출력 상한 · 단위 테스트의 SSoT 다.
 *   - §교차검증 합의 8 — 진입부 jd 가드는 함수 첫 문장 (흑점 생성기와 같은 위치 · 같은 범위 상수).
 *   - 결정 3 — 셰이더에 시간 uniform 0 (#782 규약). 세기는 CPU float64 에서 계산한 값만 넘긴다. 감쇠 가시도는 장면 프레임 위상이
 *     {@link FLARE_CYCLES_PER_DAY} 로 진행해 별도 uniform 으로 곱한다.
 *   - 결정 7 — 발생률 · 광도 곡선 상수의 SSoT 는 본 모듈이다. 반경 · 리본 형태 (화면 모양) 는 `sun-shader.ts` 가 소유한다.
 *
 * **호출당 할당 0** — 재생 중 매 프레임 호출된다. 출력 버퍼는 호출자 소유, 후보 scratch 는 모듈 재사용.
 *
 * ⚠️ 표시 근사: 플레어 위치 · 빈도 · 세기는 **통계 모델**이다. 특정 날짜의 실제 플레어와 같지 않다 (ADR 받아들인 비용 3).
 */

import { J2000_JD } from '@astro-simulator/shared';
import {
  SUNSPOT_JD_RANGE_DAYS,
  SUNSPOT_MAX,
  activityRand,
  seedActivityRng,
  type HeliographicSpots,
} from './sunspots.js';

// ─────────────────────────────────────────────────────────────────────────────
// 상수 SSoT — rendering-only (출발값 = POC · 최종값 사용자 D-T2). 육안 단계 조정은 이 블록만 고친다.
// ─────────────────────────────────────────────────────────────────────────────

/** 셰이더 `vec4 flares[4]` 의 길이 = 동시에 그리는 플레어 상한 (§교차검증 합의 7). */
export const MAX_SUN_FLARES = 4;

const MINUTES_PER_DAY = 1440;
/** 광도 곡선 상승 시간 [일] = 15 분 (POC, smoothstep). 감쇠 계수 {@link FLARE_CYCLES_PER_DAY} 가 이 값에서 나온다 (결정 3). */
export const FLARE_RISE_DAYS = 15 / MINUTES_PER_DAY;
/** 감쇠 e-folding 시간 [일] = 45 분 (POC, 지수). */
export const FLARE_DECAY_EFOLD_DAYS = 45 / MINUTES_PER_DAY;
/**
 * 감쇠 꼬리를 끊는 e-folding 수. 곡선은 `(e − e_cut) / (1 − e_cut)` 로 내려 `e_cut = exp(−4)` 에서 **연속으로** 0 에 닿는다
 * (끊는 순간의 계단 없음 — POC 의 순수 지수와의 차이는 `e_cut` = 0.0183 이하 [계산]). 수명이 유한해야 lookback 이 유한하다.
 */
export const FLARE_DECAY_CUTOFF_EFOLDS = 4;
/** 플레어 1 회의 지속 시간 [일] = 상승 + 꼬리 = 15 + 180 분 = 0.1354 일 [계산]. */
export const FLARE_DURATION_MAX_DAYS =
  FLARE_RISE_DAYS + FLARE_DECAY_CUTOFF_EFOLDS * FLARE_DECAY_EFOLD_DAYS;
/** 슬롯 lookback [일] = `⌈지속 시간⌉` (§교차검증 합의 3) — 발생 시각이 `[today − 1, today + 1)` 이면 덮는다. */
export const FLARE_SLOT_LOOKBACK_DAYS = Math.ceil(FLARE_DURATION_MAX_DAYS);
/** 감쇠 계수 `c = 1/(2 · 상승 시간)` = 48 /일 (ADR 축 4 표 · 결정 3). */
export const FLARE_CYCLES_PER_DAY = 1 / (2 * FLARE_RISE_DAYS);

/**
 * 군 1 개 · 일 슬롯 1 개의 발생 확률 = 현재 군 면적 [MSH] × 이 값 (상한 1). 600 MSH 이상인 군은 매일 1 회, 흑점 생성기의
 * 최대 면적 중앙값 (60 MSH) 크기 군은 0.1 회다 [계산]. 출발값 — 최종값은 사용자 D-T2.
 * 이 값에서 생성기 표본 (2014-01-01 ~ 2014-06-30, 5 분 간격) 의 발생 수는 하루 3.5 회다 (`sun-flares.test.ts` 가 단언).
 */
export const FLARE_PROBABILITY_PER_MSH = 1 / 600;
/**
 * 면적 게이트 폭 — 발생 판정 `r < p(A)` 를 계단 대신 `smoothstep(0, W, p(A) − r)` 로 둔다.
 * 왜: `p` 는 **지금 jd 의 군 면적**에서 나오는데 (호출 계약상 흑점 생성기를 다시 부를 수 없다 — 합의 4), 면적은 플레어가 진행되는
 * 3 시간 동안에도 변한다. 계단 판정이면 면적이 문턱을 지나는 순간 진행 중인 플레어가 **곡선 중간 세기로 나타나거나 사라진다**.
 * 폭 W 의 게이트는 그 순간을 「면적이 W/k MSH 바뀌는 시간」 에 걸친 연속 전이로 만든다 (단위 테스트가 1 분 간격 연속성을 단언).
 */
export const FLARE_GATE_WIDTH = 0.02;
/** 일 슬롯 · 군 해시 시드 salt (흑점 `0x1412` · 홍염 `0x1428` 과 다른 값). */
export const FLARE_SEED_SALT = 0x1428f1;
/** 군 id 혼합 상수 (murmur3 fmix32 의 두 곱셈 상수 — 서로 다른 홀수면 된다). */
const GROUP_SLOT_MIX = 0x85ebca6b;
const GROUP_INDEX_MIX = 0xc2b2ae35;

const DECAY_CUTOFF_VALUE = Math.exp(-FLARE_DECAY_CUTOFF_EFOLDS);

// ─────────────────────────────────────────────────────────────────────────────
// 광도 곡선 · 게이트
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 광도 곡선 0~1 — 발생 후 경과 `dtDays` [일]. 상승 `smoothstep(0, 15 분)` → 정점 1 → `exp(−t/45 분)` 를 꼬리 컷 값에서 0 이 되게
 * 내린 곡선. 범위 밖 (발생 전 · 지속 시간 후 · 비유한) 은 0.
 */
export function sunFlareLightCurve(dtDays: number): number {
  if (!(dtDays >= 0) || !(dtDays < FLARE_DURATION_MAX_DAYS)) return 0;
  if (dtDays < FLARE_RISE_DAYS) {
    const t = dtDays / FLARE_RISE_DAYS;
    return t * t * (3 - 2 * t);
  }
  const e = Math.exp(-(dtDays - FLARE_RISE_DAYS) / FLARE_DECAY_EFOLD_DAYS);
  return Math.max(0, (e - DECAY_CUTOFF_VALUE) / (1 - DECAY_CUTOFF_VALUE));
}

/** 면적 게이트 0~1 — `smoothstep(0, W, min(1, A·k) − r)`. `r` 은 슬롯 · 군 해시의 판정 난수. */
export function sunFlareAreaGate(areaMsh: number, threshold: number): number {
  const p = Math.min(1, areaMsh * FLARE_PROBABILITY_PER_MSH);
  const t = Math.min(Math.max((p - threshold) / FLARE_GATE_WIDTH, 0), 1);
  return t * t * (3 - 2 * t);
}

// ─────────────────────────────────────────────────────────────────────────────
// 생성기
// ─────────────────────────────────────────────────────────────────────────────

/**
 * 생성기 출력 (struct of arrays, 길이 {@link MAX_SUN_FLARES}). 호출자 소유.
 * id = `(군 idSlot, 군 idGroup, 발생 슬롯)` — 흑점 군 id 에 발생 일 슬롯을 더한 것.
 */
export interface SunFlareList {
  /** 군 중심 위도 · 경도 [°] — 군 성분 (선행 · 후행) 의 현재 면적 가중 평균. */
  latDeg: Float64Array;
  lonDeg: Float64Array;
  /** 군 성분 중 가장 큰 물리 각반경 [rad] (흑점 배율 전 — 화면 크기는 `sun-shader.ts` 가 정한다, ADR Amendment 1). */
  radiusRad: Float64Array;
  /** 세기 0~1 = 광도 곡선 × 면적 게이트 (감쇠 가시도 전 — 그건 셰이더 uniform 이 곱한다). */
  strength: Float64Array;
  /** 발생 시각 [JD]. */
  onsetJd: Float64Array;
  idSlot: Int32Array;
  idGroup: Int32Array;
  /** 발생 일 슬롯 `floor(onset − J2000)`. */
  flareSlot: Int32Array;
}

export function createSunFlareList(capacity: number = MAX_SUN_FLARES): SunFlareList {
  return {
    latDeg: new Float64Array(capacity),
    lonDeg: new Float64Array(capacity),
    radiusRad: new Float64Array(capacity),
    strength: new Float64Array(capacity),
    onsetJd: new Float64Array(capacity),
    idSlot: new Int32Array(capacity),
    idGroup: new Int32Array(capacity),
    flareSlot: new Int32Array(capacity),
  };
}

/** 후보 scratch 용량 — 군 ≤ 흑점 상한, 군마다 슬롯 `lookback + 1` 개. */
const CANDIDATE_CAPACITY = SUNSPOT_MAX * (FLARE_SLOT_LOOKBACK_DAYS + 1);
const candidates = createSunFlareList(CANDIDATE_CAPACITY);
const candidateOrder = new Int32Array(CANDIDATE_CAPACITY);

/** 마지막 {@link generateSunFlares} 의 상한 절단 전 후보 수 (단위 테스트 — 상한 여유 단언용). */
let lastUncappedCount = 0;
export function lastSunFlareCandidateCount(): number {
  return lastUncappedCount;
}

/** 정렬 키 — 세기 큰 순, 동률이면 발생 이른 순 · 군 id 순. a 가 앞이면 음수. */
function compareFlares(a: number, b: number): number {
  const ds = candidates.strength[b]! - candidates.strength[a]!;
  if (ds !== 0) return ds;
  const dt = candidates.onsetJd[a]! - candidates.onsetJd[b]!;
  if (dt !== 0) return dt;
  return (
    candidates.idSlot[a]! - candidates.idSlot[b]! || candidates.idGroup[a]! - candidates.idGroup[b]!
  );
}

function copyCandidate(i: number, out: SunFlareList, dst: number): void {
  out.latDeg[dst] = candidates.latDeg[i]!;
  out.lonDeg[dst] = candidates.lonDeg[i]!;
  out.radiusRad[dst] = candidates.radiusRad[i]!;
  out.strength[dst] = candidates.strength[i]!;
  out.onsetJd[dst] = candidates.onsetJd[i]!;
  out.idSlot[dst] = candidates.idSlot[i]!;
  out.idGroup[dst] = candidates.idGroup[i]!;
  out.flareSlot[dst] = candidates.flareSlot[i]!;
}

/**
 * 생성기 — 장면 시계 jd 와 **그 jd 의 흑점 목록**에서 활성 플레어를 `out` 에 쓰고 개수를 반환한다 (할당 0, 입력의 순수 함수).
 *
 * **진입부 계약 (합의 8)**: 첫 문장에서 `!Number.isFinite(jd)` 또는 `|jd − J2000| > SUNSPOT_JD_RANGE_DAYS` 이면 0 개 —
 * 군 순회 · 시드 연산 · 출력 버퍼 쓰기보다 앞.
 *
 * 군 = 같은 `(idSlot, idGroup)` 의 흑점 성분 (양극이면 2 개). 군마다 슬롯 `s ∈ [today − LOOKBACK, today]` 를 돌며 시드
 * `(s, 군 id)` 의 mulberry32 로 **판정 난수 `r` · 발생 시각 `s + r′`** 두 개를 소비한다 (정본 순서 — 바꾸면 골든 값이 깨진다).
 * 군이 태어나기 전 슬롯 (`s < idSlot`) 은 건너뛴다. 세기 = {@link sunFlareLightCurve}(jd − 발생) × {@link sunFlareAreaGate}(면적, r).
 *
 * 세기 > 0 인 후보가 {@link MAX_SUN_FLARES} 를 넘으면 세기 큰 순으로 남긴다 (버려지는 것은 가장 어두운 것 — 꼬리 쪽).
 * 상한 이하면 군 순서 (= 흑점 목록 순서) · 슬롯 오름차순 그대로다.
 */
export function generateSunFlares(
  jd: number,
  spots: Readonly<HeliographicSpots>,
  spotCount: number,
  out: SunFlareList,
): number {
  lastUncappedCount = 0;
  if (!Number.isFinite(jd) || Math.abs(jd - J2000_JD) > SUNSPOT_JD_RANGE_DAYS) return 0;

  const n = Math.min(spotCount, spots.latDeg.length);
  const today = Math.floor(jd - J2000_JD);
  let m = 0;
  for (let i = 0; i < n; i++) {
    const gSlot = spots.idSlot[i]!;
    const gIndex = spots.idGroup[i]!;
    // 군의 첫 성분에서만 처리한다 (상한 절단 뒤엔 성분이 이웃하지 않을 수 있어 앞쪽 전체를 본다 — n ≤ 48).
    let seen = false;
    for (let k = 0; k < i; k++) {
      if (spots.idSlot[k] === gSlot && spots.idGroup[k] === gIndex) {
        seen = true;
        break;
      }
    }
    if (seen) continue;
    // 군 면적 · 면적 가중 중심 (양극 성분의 경도는 같은 lon0 에서 나와 360° 감기지 않는다).
    let area = 0;
    let latSum = 0;
    let lonSum = 0;
    let radius = 0;
    for (let k = i; k < n; k++) {
      if (spots.idSlot[k] !== gSlot || spots.idGroup[k] !== gIndex) continue;
      const a = spots.areaMsh[k]!;
      area += a;
      latSum += a * spots.latDeg[k]!;
      lonSum += a * spots.lonDeg[k]!;
      radius = Math.max(radius, spots.radiusRad[k]!);
    }
    if (!(area > 0)) continue;

    for (let s = today - FLARE_SLOT_LOOKBACK_DAYS; s <= today; s++) {
      seedActivityRng(
        s,
        FLARE_SEED_SALT ^ Math.imul(gSlot, GROUP_SLOT_MIX) ^ Math.imul(gIndex + 1, GROUP_INDEX_MIX),
      );
      const threshold = activityRand();
      const onset = J2000_JD + s + activityRand();
      if (s < gSlot) continue;
      const strength = sunFlareLightCurve(jd - onset) * sunFlareAreaGate(area, threshold);
      if (!(strength > 0)) continue;
      candidates.latDeg[m] = latSum / area;
      candidates.lonDeg[m] = lonSum / area;
      candidates.radiusRad[m] = radius;
      candidates.strength[m] = strength;
      candidates.onsetJd[m] = onset;
      candidates.idSlot[m] = gSlot;
      candidates.idGroup[m] = gIndex;
      candidates.flareSlot[m] = s;
      m++;
    }
  }

  lastUncappedCount = m;
  const cap = Math.min(MAX_SUN_FLARES, out.latDeg.length);
  if (m <= cap) {
    for (let i = 0; i < m; i++) copyCandidate(i, out, i);
    return m;
  }
  // 상한 절단 — 삽입 정렬 (할당 0, m ≤ 후보 용량).
  for (let i = 0; i < m; i++) {
    let k = i;
    while (k > 0 && compareFlares(i, candidateOrder[k - 1]!) < 0) {
      candidateOrder[k] = candidateOrder[k - 1]!;
      k--;
    }
    candidateOrder[k] = i;
  }
  for (let i = 0; i < cap; i++) copyCandidate(candidateOrder[i]!, out, i);
  return cap;
}
