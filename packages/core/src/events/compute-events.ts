import type { Vec3Double } from '../coords/vec3.js';
import type { LoadedCelestialBody } from '../ephemeris/solar-system-loader.js';
import type { ChainBody } from '../physics/body-chain.js';
import { heliocentricPositionAt, resolveBodyChainPosition } from '../physics/body-chain.js';
import { meanAnomalyAt, orbitMu } from '../physics/kepler.js';
import { clockJdToTt, ttJdToClock } from '../time/delta-t.js';
import { isoToJulianDate, julianDateToIso } from '../time/julian-date.js';
import {
  lunarEclipseGeometry,
  solarEclipseGeometry,
  type EclipseRadii,
  type EclipseType,
} from './eclipse-geometry.js';
import type { EventKindDef, EventKindId } from './event-kinds.js';

/**
 * #1347 — 시간 이벤트 시각 계산 (ADR `docs/decisions/20261016-1347-event-markers.md` 결정 D2).
 *
 * **장면과 같은 식**으로 계산한다 — 위치는 `heliocentricPositionAt` (= scene Kepler 경로의 모체 체인 합), 평균근점이각은
 * `meanAnomalyAt(orbit, jd, orbitMu(body, parent))`. 기준 μ 를 따로 두지 않는다: `solar-system.json` 이나 `orbitMu` 가
 * 바뀌면 사건도 같이 움직이고, 고른 순간 화면에 사건이 보인다. 그래서 마커 시각의 오차 = 장면 모델의 오차다.
 *
 * 분기는 계산 유형 (`EventComputation.type`) 뿐이다 — 종류 id 로 분기하지 않는다 (ADR §Concrete Prediction). #1354 가
 * 유형 `syzygy-eclipse` (지구 중심 삭망 + 그림자 판정 — 일식 · 월식) 를 더했다 (ADR `20261017-1354-...` 결정 E1).
 *
 * #1370 — 시각척도. 이 파일의 내부 함수 (`heliocentricAlignmentTimes` · `perihelionTimes` · `syzygyTimes` · `eclipseEvents` ·
 * `greatestEclipseNear` 등) 는 물리 함수라 시각 인자 · 반환이 **TT JD** 다. 장면 시계 ↔ TT 변환은 진입점
 * {@link computeEventsForKind} 한 곳에서만 한다 (ADR `20261023-1370` §결정 P 진입점 2).
 */

const TWO_PI = Math.PI * 2;

/**
 * 황경차 부호 변화를 찾는 표본 간격 [일]. 근 사이 간격 (같은 쪽 일치 ↔ 반대쪽 일치 = 회합주기의 절반, 최소 토성 `~189` 일)
 * 보다 충분히 작으면 근을 놓치지 않는다. ADR 1-E 는 2일 간격으로 쟀다 — 4일이면 평가 횟수가 절반이다.
 */
export const ALIGNMENT_SCAN_STEP_DAYS = 4;

/** 이분법 최대 반복 — 4일 구간을 `2^-40` 배로 줄이면 `~4e-12` 일로 JD 배정밀도 (`~5e-10` 일) 보다 작다. 그 전에 멈춘다. */
const BISECTION_MAX_ITERATIONS = 64;

/** 사건 계산에 필요한 body 필드 — 체인 위치 + 식 판정 반경 (#1354). web 의 `LoadedCelestialBody` 도 같은 타입이다. */
export type EventBody = ChainBody & Pick<LoadedCelestialBody, 'radius'>;

export interface AstroEvent {
  /**
   * `<kind>:<YYYY-MM-DD>` — 같은 종류는 하루에 둘 이상 생기지 않는다 (회합주기 ≥ `377` 일 · 혜성 주기 ≥ 수십 년 · 같은 위상
   * 삭망 간격 ≥ `29` 일).
   */
  id: string;
  kind: EventKindId;
  subjectId: string;
  /**
   * 사건 시각 `t*` (JD, **장면 시계** — UTC 해석, 앱 `dateToJulianDate` 와 같다). #1370 — 모델은 TT 로 계산하고 시계로 되돌린 값이다.
   * NASA (TD) · JPL (TDB) 와 비교할 때는 `clockJdToTt` 로 옮긴다.
   */
  julianDate: number;
  /** 식 종류 (#1354 결정 E3) — `syzygy-eclipse` 계산 유형에만 있다. */
  eclipseType?: EclipseType;
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
 *
 * 고정 요소 전용이다. `rates` 보유 궤도 (달 · 8행성 — #1406) 는 장면이 `elementsAt` 로 움직여 이 해석해와 어긋나므로
 * 진입부에서 `throw` 한다 (ADR 1406 결정 C · DoD D16). 사용처는 율 없는 혜성 2종뿐이고, 율 대응은 그 사건 종류를 들일 때
 * 설계한다.
 *
 * @throws 대상 궤도가 `rates` 를 가질 때.
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
  if (orbit.rates) {
    throw new Error(
      `[perihelionTimes] ${bodyId}: rates 보유 궤도는 고정 요소 해석해를 쓸 수 없다 (ADR 1406 결정 C)`,
    );
  }
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

/**
 * 삭망 반복의 씨앗 간격 [일] — 평균 삭망월. **근을 정하는 값이 아니다** — 다음 근 근처에서 반복을 시작하는 데만 쓴다 (근은
 * 모델 위치의 황경차에서 나온다). 실제 삭망 간격은 `29.27 ~ 29.83` 일이라 씨앗은 근에서 1일 안에 떨어진다.
 */
const SYZYGY_SEED_INTERVAL_DAYS = 29.530589;
/** 씨앗 간격에 대응하는 평균 이각 속도 [rad/일] — 반복의 첫 기울기. */
const SYZYGY_SEED_RATE_RAD_PER_DAY = TWO_PI / SYZYGY_SEED_INTERVAL_DAYS;
/** 삭망 근 수렴 판정 [일] — `1e-8` 일 ≈ 1 ms. */
const SYZYGY_ROOT_TOLERANCE_DAYS = 1e-8;
/** 할선법 최대 반복 — 씨앗이 근에서 1일 안이라 실제로는 4 ~ 6회에 수렴한다. */
const SYZYGY_MAX_ITERATIONS = 30;
/**
 * 같은 근을 두 번 받지 않는 최소 간격 [일] — 삭망월의 절반. 반복이 이미 받은 근으로 다시 수렴하면 버린다.
 */
const SYZYGY_MIN_SEPARATION_DAYS = SYZYGY_SEED_INTERVAL_DAYS / 2;

/** 최대식 탐색 창 [일] — 삭망 시각 ± 이 값 (결정 E1). 삭망과 최대식의 차는 시 단위다 (ADR 1-A 측정 스크립트와 같은 창). */
export const GREATEST_ECLIPSE_HALF_WINDOW_DAYS = 0.4;
/**
 * 최대식 황금분할 수렴 판정 [일] — `1e-6` 일 ≈ 0.09 s. 최종 구간 폭이 이 값보다 작고 최소점을 품으므로, 같은 최소를 찾은 두 실행의
 * 결과 차는 이 값 미만이다. #1404 — 사전 계산 파일 drift 테스트가 식 시각을 이 허용치로 비교한다 (플랫폼 간 1 ulp 차가 마지막
 * 황금분할 비교를 뒤집으면 결과가 한 스텝 (`~4.3e-7` 일) 갈린다 — `time-events-data.test.ts`).
 */
export const GREATEST_ECLIPSE_TOLERANCE_DAYS = 1e-6;
const GOLDEN_RATIO_CONJUGATE = (Math.sqrt(5) - 1) / 2;
/**
 * 삭망 시각 사전 필터 — 삭망 순간의 식 지표 (γ · σ) 에 이 값을 곱해도 식 한계를 넘으면 최대식 탐색을 건너뛴다. 삭망 (황경 일치)
 * 에서 최근접까지는 지표가 상대 경로 경사 (`~5.5°`) 의 cos 배로만 줄어든다 — `0.9` = cos 25.8° 라 여유가 크다. 필터가 결과를
 * 바꾸지 않는다는 것은 `eclipse-events.test.ts` 가 전 삭망 대조로 단언한다.
 */
const ECLIPSE_PREFILTER_FACTOR = 0.9;

/** 지구 중심 (모체 중심) 달 · 태양 위치 [m] — 장면과 같은 체인 위치. */
export interface SyzygyGeometryInput {
  moon: Vec3Double;
  sun: Vec3Double;
}

/**
 * 주체 (위성) 의 모체 중심 주체 · 광원 (체인 뿌리) 위치 — `resolveBodyChainPosition` 한 번 (결정 E1). 모체의 계 중심 기준 위치 =
 * `world − local`, 체인 뿌리 (태양) 는 계 중심 원점이라 모체 중심 태양 = `−(world − local)`. 체인 미해석이면 `null`.
 */
export function syzygyGeometryAt(
  bodiesById: ReadonlyMap<string, ChainBody>,
  subjectId: string,
  julianDate: number,
): SyzygyGeometryInput | null {
  const chain = resolveBodyChainPosition(bodiesById, subjectId, julianDate);
  if (!chain?.local) return null;
  const { world, local } = chain;
  return {
    moon: local,
    sun: [local[0] - world[0], local[1] - world[1], local[2] - world[2]],
  };
}

/** 삭망 잔차 — 모체 중심 황경차 `λ☾ − λ☉ − 위상` (rad, `(−π, π]`). 삭 `0` · 망 `π`. */
function syzygyResidual(geo: SyzygyGeometryInput, phase: 'new' | 'full'): number {
  const offset = phase === 'full' ? Math.PI : 0;
  return wrapAngle(
    Math.atan2(geo.moon[1], geo.moon[0]) - Math.atan2(geo.sun[1], geo.sun[0]) - offset,
  );
}

/** 씨앗 `seed` 근처의 삭망 근 — 할선법. 잔차는 근 근처에서 단조 증가 (이각 속도 `10.8 ~ 14.4°/일`) 라 1일 안 씨앗에서 수렴한다. */
function syzygyRootNear(f: (jd: number) => number, seed: number): number {
  let t0 = seed;
  let f0 = f(t0);
  let t1 = t0 - f0 / SYZYGY_SEED_RATE_RAD_PER_DAY;
  for (let i = 0; i < SYZYGY_MAX_ITERATIONS; i += 1) {
    const f1 = f(t1);
    if (f1 === 0) return t1;
    const slope = (f1 - f0) / (t1 - t0);
    // 기울기가 양수가 아니면 (부동소수 한계 근처) 평균 율로 한 걸음 — 잔차는 단조 증가라 양수가 정상이다.
    const t2 = t1 - f1 / (slope > 0 ? slope : SYZYGY_SEED_RATE_RAD_PER_DAY);
    t0 = t1;
    f0 = f1;
    t1 = t2;
    if (Math.abs(t1 - t0) < SYZYGY_ROOT_TOLERANCE_DAYS) break;
  }
  return t1;
}

/**
 * 삭망 시각 목록 — `[startJd, endJd)` 안 (결정 E1). 첫 씨앗은 시작 시각의 잔차를 평균 율로 앞으로 옮긴 시각, 이후 씨앗은
 * 직전 근 + 평균 삭망월이다.
 */
export function syzygyTimes(
  bodiesById: ReadonlyMap<string, ChainBody>,
  subjectId: string,
  phase: 'new' | 'full',
  startJd: number,
  endJd: number,
): number[] {
  const f = (jd: number) => {
    const geo = syzygyGeometryAt(bodiesById, subjectId, jd);
    return geo === null ? Number.NaN : syzygyResidual(geo, phase);
  };
  const f0 = f(startJd);
  if (Number.isNaN(f0)) return [];
  // 다음 근까지 남은 각 (−f0 를 [0, 2π) 로) / 평균 율.
  const ahead = (((-f0 % TWO_PI) + TWO_PI) % TWO_PI) / SYZYGY_SEED_RATE_RAD_PER_DAY;
  const roots: number[] = [];
  let seed = startJd + ahead;
  let previous = Number.NEGATIVE_INFINITY;
  while (seed < endJd + SYZYGY_SEED_INTERVAL_DAYS) {
    const root = syzygyRootNear(f, seed);
    if (root >= endJd) break;
    if (root >= startJd && root - previous > SYZYGY_MIN_SEPARATION_DAYS) {
      roots.push(root);
      previous = root;
    }
    seed = Math.max(root, seed) + SYZYGY_SEED_INTERVAL_DAYS;
  }
  return roots;
}

/** 체인 뿌리 탐색 최대 깊이 — 순환 parentId 데이터 결함 시 무한 루프 차단 (`body-chain.ts` 와 같은 값, 현 데이터 깊이 ≤ 2). */
const ROOT_SEARCH_MAX_DEPTH = 8;

/**
 * 주체 (위성) · 모체 · 체인 뿌리의 반경 — 식 판정 입력. 하나라도 없으면 `null`. #1360 PR2 — 장면의 월식 그림자 uniform 도
 * 같은 함수로 반경을 얻는다 (판정과 렌더의 반경 출처 단일화).
 */
export function eclipseRadiiOf(
  bodiesById: ReadonlyMap<string, EventBody>,
  subjectId: string,
): EclipseRadii | null {
  const subject = bodiesById.get(subjectId);
  const parent = subject?.parentId != null ? bodiesById.get(subject.parentId) : undefined;
  if (!subject || !parent) return null;
  let root: EventBody | undefined = parent;
  for (let depth = 0; root?.parentId != null && depth < ROOT_SEARCH_MAX_DEPTH; depth += 1) {
    root = bodiesById.get(root.parentId);
  }
  if (!root || root.parentId != null) return null;
  return { sun: root.radius, earth: parent.radius, moon: subject.radius };
}

/** 식 지표 (최대식 = 최소) 와 판정 — 삭 = 일식 γ, 망 = 월식 σ. */
function eclipseMetric(
  geo: SyzygyGeometryInput,
  phase: 'new' | 'full',
  radii: EclipseRadii,
): { metric: number; limit: number; type: EclipseType | null } {
  if (phase === 'new') {
    const g = solarEclipseGeometry(geo.moon, geo.sun, radii);
    return { metric: g.gamma, limit: 1 + g.penumbraRadius, type: g.type };
  }
  const g = lunarEclipseGeometry(geo.moon, geo.sun, radii);
  return { metric: g.separation, limit: g.penumbraRadius + g.moonSemiDiameter, type: g.type };
}

export interface GreatestEclipse {
  /** 최대식 시각 `t*` [JD]. */
  julianDate: number;
  /** `t*` 의 식 지표 (일식 γ [지구 반경] · 월식 σ [rad]). */
  metric: number;
  /** `t*` 의 판정 — 식이 아니면 `null`. */
  type: EclipseType | null;
}

/**
 * 삭망 시각 근처의 최대식 — `[syzygy − 0.4, syzygy + 0.4]` 일 안 식 지표 최소 (황금분할). 사전 필터 없이 항상 탐색한다
 * (필터는 {@link eclipseEvents} 가 건다). 체인 · 반경 미해석이면 `null`.
 */
export function greatestEclipseNear(
  bodiesById: ReadonlyMap<string, EventBody>,
  subjectId: string,
  phase: 'new' | 'full',
  syzygyJd: number,
): GreatestEclipse | null {
  const radii = eclipseRadiiOf(bodiesById, subjectId);
  if (radii === null) return null;
  const evaluate = (jd: number) => {
    const geo = syzygyGeometryAt(bodiesById, subjectId, jd);
    return geo === null ? null : eclipseMetric(geo, phase, radii);
  };
  const metricAt = (jd: number) => evaluate(jd)?.metric ?? Number.POSITIVE_INFINITY;
  let a = syzygyJd - GREATEST_ECLIPSE_HALF_WINDOW_DAYS;
  let b = syzygyJd + GREATEST_ECLIPSE_HALF_WINDOW_DAYS;
  let c = b - GOLDEN_RATIO_CONJUGATE * (b - a);
  let d = a + GOLDEN_RATIO_CONJUGATE * (b - a);
  let fc = metricAt(c);
  let fd = metricAt(d);
  while (b - a > GREATEST_ECLIPSE_TOLERANCE_DAYS) {
    if (fc < fd) {
      b = d;
      d = c;
      fd = fc;
      c = b - GOLDEN_RATIO_CONJUGATE * (b - a);
      fc = metricAt(c);
    } else {
      a = c;
      c = d;
      fc = fd;
      d = a + GOLDEN_RATIO_CONJUGATE * (b - a);
      fd = metricAt(d);
    }
  }
  const julianDate = (a + b) / 2;
  const at = evaluate(julianDate);
  if (at === null) return null;
  return { julianDate, metric: at.metric, type: at.type };
}

/**
 * 식 목록 — `[startJd, endJd)` 안 삭망마다 최대식을 찾아 판정한다 (결정 E1 · E2). 삭망 순간 지표가 사전 필터를 넘으면 탐색하지
 * 않는다 ({@link ECLIPSE_PREFILTER_FACTOR}). 사건 시각은 최대식이라 범위 끝 근처에서 `[startJd, endJd)` 를 수 시간 벗어날 수
 * 있다 — 범위는 **삭망 시각** 기준으로 자른다 (청크를 이어 붙여도 한 사건이 두 청크에 들어가지 않는다).
 */
export function eclipseEvents(
  bodiesById: ReadonlyMap<string, EventBody>,
  subjectId: string,
  phase: 'new' | 'full',
  startJd: number,
  endJd: number,
): GreatestEclipse[] {
  const radii = eclipseRadiiOf(bodiesById, subjectId);
  if (radii === null) return [];
  const out: GreatestEclipse[] = [];
  for (const syzygyJd of syzygyTimes(bodiesById, subjectId, phase, startJd, endJd)) {
    const geo = syzygyGeometryAt(bodiesById, subjectId, syzygyJd);
    if (geo === null) continue;
    const atSyzygy = eclipseMetric(geo, phase, radii);
    if (atSyzygy.metric * ECLIPSE_PREFILTER_FACTOR > atSyzygy.limit) continue;
    const greatest = greatestEclipseNear(bodiesById, subjectId, phase, syzygyJd);
    if (greatest?.type) out.push(greatest);
  }
  return out;
}

/** `t*` 의 사건 id 날짜부 (UTC `YYYY-MM-DD`). */
export function eventDateIso(julianDate: number): string {
  return julianDateToIso(julianDate).slice(0, 10);
}

/**
 * 한 종류의 사건 목록 (시각 오름차순). 범위는 `[startJd, endJd)` 와 종류의 `window` 의 교집합.
 *
 * #1370 — 시각 인자 · 범위 · 결과 `julianDate` 는 모두 **장면 시계** JD 다. 범위를 TT 로 옮겨 내부 함수를 부르고, 결과를
 * `ttJdToClock` 으로 되돌린다. id 날짜도 되돌린 시계 시각으로 만든다. 청크 경계 `B` 는 양쪽 청크가 같은 `clockJdToTt(B)` 로
 * 옮기므로 TT 범위도 빈틈 · 겹침 없이 이어진다 (이음 붙인 청크 == 전 범위 — `compute-events.test.ts`).
 */
export function computeEventsForKind(
  bodiesById: ReadonlyMap<string, EventBody>,
  kind: EventKindDef,
  startJd: number,
  endJd: number,
): AstroEvent[] {
  const fromClockJd = kind.window
    ? Math.max(startJd, isoToJulianDate(`${kind.window.start}T00:00:00Z`))
    : startJd;
  const toClockJd = kind.window
    ? Math.min(endJd, isoToJulianDate(`${kind.window.end}T00:00:00Z`))
    : endJd;
  if (!(fromClockJd < toClockJd)) return [];
  const fromTtJd = clockJdToTt(fromClockJd);
  const toTtJd = clockJdToTt(toClockJd);

  const computation = kind.computation;
  // 내부 함수 결과 (TT) — 식이면 식 종류를 함께 든다. `eclipseEvents` 는 식인 것만 돌려준다 (type 은 null 이 아니다).
  const found: { ttJd: number; eclipseType?: EclipseType }[] =
    computation.type === 'syzygy-eclipse'
      ? eclipseEvents(bodiesById, kind.subjectId, computation.phase, fromTtJd, toTtJd).map((e) => ({
          ttJd: e.julianDate,
          eclipseType: e.type!,
        }))
      : (computation.type === 'perihelion'
          ? perihelionTimes(bodiesById, kind.subjectId, fromTtJd, toTtJd)
          : heliocentricAlignmentTimes(
              bodiesById,
              kind.subjectId,
              computation.referenceId,
              fromTtJd,
              toTtJd,
            )
        ).map((ttJd) => ({ ttJd }));

  return found.map(({ ttJd, eclipseType }) => {
    const clockJd = ttJdToClock(ttJd);
    const event: AstroEvent = {
      id: `${kind.id}:${eventDateIso(clockJd)}`,
      kind: kind.id,
      subjectId: kind.subjectId,
      julianDate: clockJd,
    };
    if (eclipseType !== undefined) event.eclipseType = eclipseType;
    return event;
  });
}
