import type { ChainBody } from '../physics/body-chain.js';
import { heliocentricPositionAt } from '../physics/body-chain.js';
import { meanAnomalyAt, orbitMu } from '../physics/kepler.js';
import { isoToJulianDate, julianDateToIso } from '../time/julian-date.js';
import type { EventKindDef, EventKindId } from './event-kinds.js';

/**
 * #1347 — 시간 이벤트 시각 계산 (ADR `docs/decisions/20261016-1347-event-markers.md` 결정 D2).
 *
 * **장면과 같은 식**으로 계산한다 — 위치는 `heliocentricPositionAt` (= scene Kepler 경로의 모체 체인 합), 평균근점이각은
 * `meanAnomalyAt(orbit, jd, orbitMu(body, parent))`. 기준 μ 를 따로 두지 않는다: `solar-system.json` 이나 `orbitMu` 가
 * 바뀌면 사건도 같이 움직이고, 고른 순간 화면에 사건이 보인다. 그래서 마커 시각의 오차 = 장면 모델의 오차다.
 *
 * 분기는 계산 유형 (`EventComputation.type`) 뿐이다 — 종류 id 로 분기하지 않는다 (ADR §Concrete Prediction).
 */

const TWO_PI = Math.PI * 2;

/**
 * 황경차 부호 변화를 찾는 표본 간격 [일]. 근 사이 간격 (같은 쪽 일치 ↔ 반대쪽 일치 = 회합주기의 절반, 최소 토성 `~189` 일)
 * 보다 충분히 작으면 근을 놓치지 않는다. ADR 1-E 는 2일 간격으로 쟀다 — 4일이면 평가 횟수가 절반이다.
 */
export const ALIGNMENT_SCAN_STEP_DAYS = 4;

/** 이분법 최대 반복 — 4일 구간을 `2^-40` 배로 줄이면 `~4e-12` 일로 JD 배정밀도 (`~5e-10` 일) 보다 작다. 그 전에 멈춘다. */
const BISECTION_MAX_ITERATIONS = 64;

export interface AstroEvent {
  /** `<kind>:<YYYY-MM-DD>` — 같은 종류는 하루에 둘 이상 생기지 않는다 (회합주기 ≥ `377` 일 · 혜성 주기 ≥ 수십 년). */
  id: string;
  kind: EventKindId;
  subjectId: string;
  /** 사건 시각 `t*` (JD, UTC 해석 — 앱 `dateToJulianDate` 와 같다). */
  julianDate: number;
}

/** 각을 `(−π, π]` 로. */
function wrapAngle(rad: number): number {
  let a = rad % TWO_PI;
  if (a > Math.PI) a -= TWO_PI;
  if (a <= -Math.PI) a += TWO_PI;
  return a;
}

/**
 * 일심 황경차 `λ_subject − λ_reference` (rad, `(−π, π]`). 위치는 J2000 황도 좌표라 황경 = `atan2(y, x)`.
 * 어느 한쪽이라도 체인 미해석이면 `NaN`.
 */
export function heliocentricLongitudeDifference(
  bodiesById: ReadonlyMap<string, ChainBody>,
  subjectId: string,
  referenceId: string,
  julianDate: number,
): number {
  const s = heliocentricPositionAt(bodiesById, subjectId, julianDate);
  const r = heliocentricPositionAt(bodiesById, referenceId, julianDate);
  if (s === null || r === null) return Number.NaN;
  return wrapAngle(Math.atan2(s[1], s[0]) - Math.atan2(r[1], r[0]));
}

/**
 * 부호 변화 구간이 같은 쪽 일치 (`Δλ = 0`) 인가. 반대쪽 일치 (`Δλ = ±π`, 외합 · 외행성 합) 에서도 wrap 때문에 부호가 바뀌지만
 * 그때 양 끝의 `|Δλ|` 는 `π` 근처다. 같은 쪽 근은 양 끝이 모두 `0` 근처 — 경계를 `π/2` 로 둔다 (표본 간격 4일 동안 황경차는
 * 수 도밖에 변하지 않는다).
 */
export function isSameSideBracket(deltaA: number, deltaB: number): boolean {
  const HALF_PI = Math.PI / 2;
  return Math.abs(deltaA) < HALF_PI && Math.abs(deltaB) < HALF_PI;
}

/** `[lo, hi]` 안의 `f = 0` 근 (양 끝 부호 반대 전제). 구간이 더 줄지 않으면 (JD 배정밀도 한계) 멈춘다. */
function bisect(f: (jd: number) => number, lo: number, hi: number, fLo: number): number {
  let a = lo;
  let b = hi;
  let fa = fLo;
  for (let i = 0; i < BISECTION_MAX_ITERATIONS; i += 1) {
    const mid = (a + b) / 2;
    if (mid === a || mid === b) break;
    const fm = f(mid);
    if (fm === 0) return mid;
    if (fa < 0 === fm < 0) {
      a = mid;
      fa = fm;
    } else {
      b = mid;
    }
  }
  return (a + b) / 2;
}

/**
 * 일심 황경 같은 쪽 일치 시각 목록 — `[startJd, endJd)` 안. 충 (외행성) · 내합 (내행성) 공용.
 */
export function heliocentricAlignmentTimes(
  bodiesById: ReadonlyMap<string, ChainBody>,
  subjectId: string,
  referenceId: string,
  startJd: number,
  endJd: number,
): number[] {
  const f = (jd: number) => heliocentricLongitudeDifference(bodiesById, subjectId, referenceId, jd);
  const roots: number[] = [];
  let prevJd = startJd;
  let prev = f(prevJd);
  if (Number.isNaN(prev)) return roots;
  while (prevJd < endJd) {
    const jd = Math.min(prevJd + ALIGNMENT_SCAN_STEP_DAYS, endJd);
    const cur = f(jd);
    if (prev === 0) {
      roots.push(prevJd);
    } else if (prev < 0 !== cur < 0 && cur !== 0 && isSameSideBracket(prev, cur)) {
      roots.push(bisect(f, prevJd, jd, prev));
    }
    prevJd = jd;
    prev = cur;
  }
  return roots;
}

/**
 * 근일점 통과 시각 목록 — `[startJd, endJd)` 안. 모체 기준 궤도에서 `M(t) = M₀ + n·(t − epoch)` 가 `2πk` 가 되는 해석해
 * (`n` = `orbitMu(body, parent)` 의 평균 운동 — `meanAnomalyAt` 과 같은 식).
 */
export function perihelionTimes(
  bodiesById: ReadonlyMap<string, ChainBody>,
  bodyId: string,
  startJd: number,
  endJd: number,
): number[] {
  const body = bodiesById.get(bodyId);
  const parent = body?.parentId != null ? bodiesById.get(body.parentId) : undefined;
  if (!body?.orbit || !parent) return [];
  const orbit = body.orbit;
  const mu = orbitMu(body, parent);
  // 평균 운동은 `meanAnomalyAt` 의 두 시각 차로 얻는다 — 식을 따로 쓰지 않아 장면과 어긋날 수 없다.
  const radPerDay =
    meanAnomalyAt(orbit, orbit.epoch + 1, mu) - meanAnomalyAt(orbit, orbit.epoch, mu);
  const m0 = meanAnomalyAt(orbit, orbit.epoch, mu);
  const kStart = Math.ceil((m0 + radPerDay * (startJd - orbit.epoch)) / TWO_PI);
  const times: number[] = [];
  for (let k = kStart; ; k += 1) {
    const jd = orbit.epoch + (TWO_PI * k - m0) / radPerDay;
    if (jd >= endJd) break;
    if (jd >= startJd) times.push(jd);
  }
  return times;
}

/** `t*` 의 사건 id 날짜부 (UTC `YYYY-MM-DD`). */
export function eventDateIso(julianDate: number): string {
  return julianDateToIso(julianDate).slice(0, 10);
}

/**
 * 한 종류의 사건 목록 (시각 오름차순). 범위는 `[startJd, endJd)` 와 종류의 `window` 의 교집합.
 */
export function computeEventsForKind(
  bodiesById: ReadonlyMap<string, ChainBody>,
  kind: EventKindDef,
  startJd: number,
  endJd: number,
): AstroEvent[] {
  const from = kind.window
    ? Math.max(startJd, isoToJulianDate(`${kind.window.start}T00:00:00Z`))
    : startJd;
  const to = kind.window ? Math.min(endJd, isoToJulianDate(`${kind.window.end}T00:00:00Z`)) : endJd;
  if (!(from < to)) return [];

  const computation = kind.computation;
  const times =
    computation.type === 'perihelion'
      ? perihelionTimes(bodiesById, kind.subjectId, from, to)
      : heliocentricAlignmentTimes(bodiesById, kind.subjectId, computation.referenceId, from, to);

  return times.map((julianDate) => ({
    id: `${kind.id}:${eventDateIso(julianDate)}`,
    kind: kind.id,
    subjectId: kind.subjectId,
    julianDate,
  }));
}
