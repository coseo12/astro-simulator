/**
 * #1341 — 궤적 trail 샘플러 (ADR `docs/decisions/20261015-1341-trail-ruler.md` 결정 T1 · T2 · T9). Babylon 비의존.
 *
 * ## 점 출처 — 이심근점이각(E) 등간격, 무상태 (결정 T1)
 *
 * 천체 i 의 창 `W_i = P_i × f` 는 평균 근점각으로 `ΔM = 2π · f` 다 (`M = n·t`, `n·P = 2π`). 머리 `E_h = E(M(jd))`,
 * 꼬리 `E_t = E(M(jd) − s · 2π · f)` 를 Kepler 방정식으로 **두 번만** 풀고, 사이 점은 `E_h + (E_t − E_h) · k / N` 에서
 * 궤도 요소로 직접 계산한다 (Kepler 풀이 없음). E 는 공전 횟수까지 펼친 **연속값**이라 창이 근일점 (M = 0) 을
 * 가로질러도 보간이 한 바퀴를 거꾸로 돌지 않는다 (ADR §교차검증 합의 3).
 *
 * 과거 상태를 저장하지 않는다 — 출력은 `(jd, 방향, 데이터)` 의 순수 함수다. 그래서 점프 · 역재생 · 배속 변경 ·
 * 엔진 복귀에 리셋 규칙이 없다 (DoD D3).
 *
 * ## 기준계 — 위성은 모체 상대 (결정 T2)
 *
 * world 점 = `parentWorld(지금) + local(E_k) × visualScale` — scene `updateAtKepler` 의 `resolveWorld` 와 같은 식이다.
 * **머리 점은 샘플이 아니라 호출자가 넘긴 `headWorld` (scene `worldPositions` 값) 그대로** 쓴다 — 메시와 같은 출처라
 * 머리 정점과 천체 중심이 같은 float64 → 같은 float32 가 된다 (결정 T3 · DoD D2 · D4).
 */
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import { orbitMu, solveKeplerEquation } from '../physics/kepler.js';
import { getOrbitVisualScale } from './orbit-visual-scale.js';

const TWO_PI = Math.PI * 2;
const SECONDS_PER_DAY = 86_400;

/**
 * 창 길이 — 공전주기의 비율 `f` (사용자 결정 Q-T2 (a), 초기값 1/12 = 평균 근점각 30°). 육안 승인 (D-T2 · DoD D12)
 * 에서 확정한다. 각도를 고정하므로 화면상 호 길이는 천체 간 비슷하다.
 */
export const TRAIL_ORBIT_FRACTION = 1 / 12;

/**
 * 고이심률 임계 — 궤도선 (`orbit-sampling.ts` 의 256 seg 예외) 과 같은 값을 쓴다 (결정 T1). 궤도선 쪽 리터럴은 기존
 * 정적 가드 (`orbit-line-segments.test.ts`) 가 소스 문자열로 고정하고 있어 import 로 바꾸지 않았다 — 대신
 * `trail-sampling.test.ts` 가 두 값의 일치를 단언한다 (숨은 상수 drift 가드, volt #69).
 */
export const HIGH_ECCENTRICITY_THRESHOLD = 0.6;
/** 천체당 선분 수 N (점 수는 N + 1). */
export const TRAIL_SEGMENTS = 48;
/** e ≥ {@link HIGH_ECCENTRICITY_THRESHOLD} 의 선분 수 — 근일점 부근 꺾임 완화 (꺾임 여부는 육안 승인 대상, 결정 T1 [추정]). */
export const TRAIL_SEGMENTS_HIGH_ECCENTRICITY = 128;

/** 방향 부호 — `+1` = 재생 (꼬리가 과거), `−1` = 역재생 (꼬리가 미래) (결정 T5). */
export type TrailDirection = 1 | -1;

export interface TrailBodySpec {
  readonly id: string;
  readonly parentId: string;
  readonly eccentricity: number;
  readonly semiMajorAxis: number;
  /** `a·√(1 − e²)` — 궤도면 y 성분 계수. */
  readonly semiMinorAxis: number;
  /** 평균 운동 n [rad/s] — `meanAnomalyAt` 과 같은 식. */
  readonly meanMotion: number;
  readonly meanAnomalyAtEpoch: number;
  readonly epoch: number;
  /** 근일점 방향 단위벡터 P = Rz(Ω)·Rx(i)·Rz(ω)·x̂ — `positionAt` 의 회전과 같다. */
  readonly p: readonly [number, number, number];
  /** 궤도면 수직 방향 단위벡터 Q = Rz(Ω)·Rx(i)·Rz(ω)·ŷ. */
  readonly q: readonly [number, number, number];
  /** 위성 궤도 시각 배율 (`getOrbitVisualScale`) — 태양 직속은 1. */
  readonly visualScale: number;
  /** 선분 수 N. */
  readonly segments: number;
}

/** 이심률 → 선분 수 (궤도선과 같은 임계). */
export function trailSegmentsFor(eccentricity: number): number {
  return eccentricity >= HIGH_ECCENTRICITY_THRESHOLD
    ? TRAIL_SEGMENTS_HIGH_ECCENTRICITY
    : TRAIL_SEGMENTS;
}

/** 궤도 보유 천체 1개의 사양. 모체가 없거나 궤도가 없으면 `null`. */
export function createTrailBodySpec(
  body: LoadedCelestialBody,
  parent: LoadedCelestialBody,
): TrailBodySpec | null {
  const orbit = body.orbit;
  if (!orbit || !body.parentId) return null;
  const a = orbit.semiMajorAxis;
  const e = orbit.eccentricity;
  const mu = orbitMu(body, parent);
  const cosO = Math.cos(orbit.longitudeOfAscendingNode);
  const sinO = Math.sin(orbit.longitudeOfAscendingNode);
  const cosI = Math.cos(orbit.inclination);
  const sinI = Math.sin(orbit.inclination);
  const cosW = Math.cos(orbit.argumentOfPeriapsis);
  const sinW = Math.sin(orbit.argumentOfPeriapsis);
  return {
    id: body.id,
    parentId: body.parentId,
    eccentricity: e,
    semiMajorAxis: a,
    semiMinorAxis: a * Math.sqrt(1 - e * e),
    meanMotion: Math.sqrt(mu / (a * a * a)),
    meanAnomalyAtEpoch: orbit.meanAnomalyAtEpoch,
    epoch: orbit.epoch,
    // Rz(Ω)·Rx(i)·Rz(ω) 의 1 · 2 열 — `positionAt` 의 3단 회전을 (xOrb, 0, 0) · (0, yOrb, 0) 에 적용한 것과 같다.
    p: [cosO * cosW - sinO * cosI * sinW, sinO * cosW + cosO * cosI * sinW, sinI * sinW],
    q: [-cosO * sinW - sinO * cosI * cosW, -sinO * sinW + cosO * cosI * cosW, sinI * cosW],
    visualScale: getOrbitVisualScale(body.parentId, body.id),
    segments: trailSegmentsFor(e),
  };
}

/**
 * 대상 집합 — 궤도선과 같은 집합 (결정 T9): allowlist ∩ 궤도 보유. 순서는 `bodies` 순서 (정점 배치 순서).
 */
export function createTrailBodySpecs(
  bodies: readonly LoadedCelestialBody[],
  allowlist: readonly string[],
): TrailBodySpec[] {
  const byId = new Map(bodies.map((b) => [b.id, b] as const));
  const specs: TrailBodySpec[] = [];
  for (const body of bodies) {
    if (!body.orbit || !body.parentId) continue;
    if (!allowlist.includes(body.id)) continue;
    const parent = byId.get(body.parentId);
    // 조용히 건너뛰지 않는다 — 궤도선과 같은 집합이라는 계약이 깨진 것이다.
    if (!parent) throw new Error(`[trail] ${body.id}: 모체 ${body.parentId} 없음`);
    const spec = createTrailBodySpec(body, parent);
    if (spec) specs.push(spec);
  }
  return specs;
}

/** 전 천체 점 수 합 (Σ (N + 1)). */
export function trailVertexCount(specs: readonly TrailBodySpec[]): number {
  let n = 0;
  for (const s of specs) n += s.segments + 1;
  return n;
}

/** 시각 → 펼친 평균 근점각 (`meanAnomalyAt` 과 같은 식 — 2π 로 감지 않는다). */
export function trailMeanAnomalyAt(spec: TrailBodySpec, julianDate: number): number {
  return spec.meanAnomalyAtEpoch + spec.meanMotion * (julianDate - spec.epoch) * SECONDS_PER_DAY;
}

/**
 * 펼친 M → 펼친 E. `M − e·sin E` 는 M · E 에 같은 2πk 를 더해도 성립하므로, [−π, π] 로 접은 M 을 풀고 접은 만큼
 * 되돌린다. 결과는 M 에 대해 연속 · 단조다 — 창이 근일점을 가로질러도 보간 구간이 끊기지 않는다.
 */
export function continuousEccentricAnomaly(meanAnomaly: number, eccentricity: number): number {
  const wraps = Math.round(meanAnomaly / TWO_PI) * TWO_PI;
  const folded = meanAnomaly - wraps;
  return solveKeplerEquation(folded, eccentricity) + wraps;
}

/** 머리 · 꼬리의 펼친 E. 꼬리 = `M(jd) − s · 2π · f` (= 시각 `jd − s · W`). */
export function trailEccentricAnomalyRange(
  spec: TrailBodySpec,
  julianDate: number,
  direction: TrailDirection,
  fraction: number,
): { head: number; tail: number } {
  const mHead = trailMeanAnomalyAt(spec, julianDate);
  const mTail = mHead - direction * TWO_PI * fraction;
  return {
    head: continuousEccentricAnomaly(mHead, spec.eccentricity),
    tail: continuousEccentricAnomaly(mTail, spec.eccentricity),
  };
}

/**
 * 천체 1개의 trail 점 N + 1 개를 **모체 기준 로컬 좌표 (m, 시각 배율 미적용)** 로 `out[offset…]` 에 쓴다.
 * k = 0 이 머리, k = N 이 꼬리. 반환 = 쓴 점 수.
 */
export function sampleTrailLocal(
  spec: TrailBodySpec,
  julianDate: number,
  direction: TrailDirection,
  fraction: number,
  out: Float64Array,
  offset: number,
): number {
  const { head, tail } = trailEccentricAnomalyRange(spec, julianDate, direction, fraction);
  const n = spec.segments;
  const step = (tail - head) / n;
  const a = spec.semiMajorAxis;
  const b = spec.semiMinorAxis;
  const e = spec.eccentricity;
  const [px, py, pz] = spec.p;
  const [qx, qy, qz] = spec.q;
  for (let k = 0; k <= n; k += 1) {
    const E = head + step * k;
    // 궤도면 좌표 (근일점 방향 = +x) — r·cos ν = a(cos E − e), r·sin ν = b·sin E.
    const x = a * (Math.cos(E) - e);
    const y = b * Math.sin(E);
    const o = offset + 3 * k;
    out[o] = px * x + qx * y;
    out[o + 1] = py * x + qy * y;
    out[o + 2] = pz * x + qz * y;
  }
  return n + 1;
}

/**
 * 천체 1개의 trail 점 N + 1 개를 **world 좌표 (m, Heliocentric)** 로 쓴다 — `parentWorld + local × visualScale`.
 * k = 0 (머리) 은 샘플 대신 `headWorld` 값을 그대로 넣는다 (메시와 같은 출처 — DoD D2).
 */
export function sampleTrailWorld(
  spec: TrailBodySpec,
  julianDate: number,
  direction: TrailDirection,
  fraction: number,
  parentWorld: readonly [number, number, number],
  headWorld: readonly [number, number, number],
  out: Float64Array,
  offset: number,
): number {
  const count = sampleTrailLocal(spec, julianDate, direction, fraction, out, offset);
  const s = spec.visualScale;
  for (let k = 1; k < count; k += 1) {
    const o = offset + 3 * k;
    out[o] = parentWorld[0] + out[o]! * s;
    out[o + 1] = parentWorld[1] + out[o + 1]! * s;
    out[o + 2] = parentWorld[2] + out[o + 2]! * s;
  }
  out[offset] = headWorld[0];
  out[offset + 1] = headWorld[1];
  out[offset + 2] = headWorld[2];
  return count;
}
