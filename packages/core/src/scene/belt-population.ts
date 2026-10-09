/**
 * #1319 PR2 — 소행성대 · 카이퍼 띠 입자의 궤도 요소 생성기 (ADR `docs/decisions/20261008-1319-asteroid-belt-gpu.md` 결정 4).
 *
 * **순수 함수 · Babylon 비의존 · seed 결정적.** `belt-particles.ts` 가 이 출력으로 정점 속성 버퍼를 채운다.
 *
 * ## 정확도 수준 (ADR 결정 4 · 사용자 결정 Q4)
 *
 * 「통계적 형태 + 공명 위상 고정, 2체 Kepler (섭동 · 칭동 없음)」. 공명군(힐다 · 트로이 · 플루티노) 은
 * 평균운동을 `√(μ/a³)` 로 유도하지 않고 **행성 평균운동의 정수비로 직접 넣는다** — 트로이 `n = n_J` ·
 * 힐다 `1.5 n_J` · 플루티노 `(2/3) n_N`. 그러면 공명각의 시간 미분이 정확히 0 이라 2체 Kepler 로도
 * 구조가 영구 보존된다 (공명 천체의 시간 평균 평균운동이 정수비인 것이 공명의 정의 — ADR §교차검증 기각 마지막 항).
 *
 * ## 숨은 상수 금지 (volt #69)
 *
 * 목성 · 해왕성의 `a` · `λ(epoch)` · `n` 은 이 모듈에 리터럴로 두지 않는다. `solar-system.json` → 로더 →
 * `orbitMu` 경로(`beltPlanetsFromSystem`) 로 **입력**받는다. 공명 위치(커크우드 간극 · 힐다 · 플루티노 장반경)도
 * 결정 4 표의 숫자를 옮겨 적지 않고 행성 `a` 와 공명비에서 Kepler 제3법칙으로 도출한다 (표 값과의 일치는 단위 테스트).
 *
 * ## ADR 표 표기의 해석
 *
 * - `X ± h` (예: 힐다 a `3.97 ± 0.05` · φ `0 ± 30°`) — 폭 `2h` **균등** 분포.
 * - `N(0, σ)` (트로이 경도) — 정규 분포. `e σ` · `i σ` — Rayleigh 분포 (표 문구 그대로).
 * - 이심률 상한: 표가 상한을 적은 그룹(주 띠 0.3 · 고전대 0.15) 은 그 값, **적지 않은 그룹(힐다 · 트로이 · 플루티노)
 *   은 0.3** — 정점 셰이더의 Newton 4회 Kepler 풀이가 검증된 범위가 `e ≤ 0.3` 이다 (PR1 DoD 「JS 미러 vs
 *   `positionAt` ≤ 1e-4 AU」 의 표본 범위 · ADR §교차검증 합의). Rayleigh 는 꼬리가 무한이라 상한 없이는
 *   불변식 `e < 1` 도 확률적으로만 성립한다. 상한 밖 표본은 다시 뽑는다 (절단 분포).
 */
import { AU } from '@astro-simulator/shared';
import type { LoadedSolarSystem } from '../ephemeris/solar-system-loader.js';
import { orbitMu } from '../physics/kepler.js';

/** 그룹 5종 — 소행성대 3 (주 띠 · 힐다 · 트로이) + 카이퍼 2 (고전대 · 플루티노). */
export type BeltGroup = 'main' | 'hilda' | 'trojan' | 'kuiperClassical' | 'plutino';

/** 소행성대 메시 (웜 그레이) 에 실리는 그룹 — ADR 결정 6 토글 `belt`. */
export const ASTEROID_BELT_GROUPS: readonly BeltGroup[] = ['main', 'hilda', 'trojan'];
/** 카이퍼 메시 (쿨 그레이) 에 실리는 그룹 — ADR 결정 6 토글 `kuiper`. */
export const KUIPER_BELT_GROUPS: readonly BeltGroup[] = ['kuiperClassical', 'plutino'];
/** 생성 순서 = 그룹별 난수 스트림 인덱스. 순서를 바꾸면 같은 seed 의 출력이 바뀐다. */
const GROUP_ORDER: readonly BeltGroup[] = [...ASTEROID_BELT_GROUPS, ...KUIPER_BELT_GROUPS];

export type BeltCounts = Record<BeltGroup, number>;

/** 기본 입자 수 — 사용자 결정 Q1 (합 5400). */
export const BELT_DEFAULT_COUNTS: Readonly<BeltCounts> = {
  main: 3000,
  hilda: 300,
  trojan: 600,
  kuiperClassical: 1200,
  plutino: 300,
};

/** 띠 입자 1개의 궤도 요소. 각은 rad, `meanMotion` 은 rad/day (속성 `orbitB.z` 와 같은 단위). */
export interface BeltOrbit {
  semiMajorAxisAU: number;
  eccentricity: number;
  inclination: number;
  longitudeOfAscendingNode: number;
  argumentOfPeriapsis: number;
  /** `epoch` 시점의 평균이상. */
  meanAnomalyAtEpoch: number;
  /** 평균운동 [rad/day] — 공명군은 행성 평균운동의 정수비 (Kepler 유도값 아님). */
  meanMotion: number;
  /** JD. */
  epoch: number;
}

/** 공명 기준 행성 — 로더 경로에서 읽은 값. */
export interface ResonancePlanet {
  semiMajorAxisAU: number;
  /** `epoch` 시점의 평균경도 λ = Ω + ω + M [rad]. */
  meanLongitudeAtEpoch: number;
  /** 평균운동 [rad/day] — 장면 Kepler 경로(`positionAt(orbit, jd, orbitMu(body, sun))`) 와 같은 값. */
  meanMotion: number;
}

export interface BeltPlanets {
  /** 행성 요소의 epoch (JD) — 생성된 입자 요소의 epoch 이기도 하다. */
  epoch: number;
  /** 태양 직속 궤도의 μ [m³/s²] — 비공명 그룹 평균운동 `√(μ/a³)` 에 쓴다. */
  mu: number;
  jupiter: ResonancePlanet;
  neptune: ResonancePlanet;
}

export type BeltPopulation = Record<BeltGroup, BeltOrbit[]>;

const DEG = Math.PI / 180;
const TWO_PI = Math.PI * 2;
const SECONDS_PER_DAY = 86_400;

// ── 공명비 (평균운동 비 n_입자 / n_행성) ───────────────────────────────────────
/** 트로이 1:1 · 힐다 3:2 (목성 기준) · 플루티노 2:3 (해왕성 기준). */
const TROJAN_MEAN_MOTION_RATIO = 1;
const HILDA_MEAN_MOTION_RATIO = 3 / 2;
const PLUTINO_MEAN_MOTION_RATIO = 2 / 3;

/**
 * 커크우드 간극 노치 — 목성과의 내부 평균운동 공명 `n/n_J = p/q`.
 *
 * `widthAU` 는 depth 1 (중심 완전 제거) Gaussian 노치의 σ 다. ADR 결정 4 표는 간극 위치만 적고 모양은 적지 않았다.
 * 값은 ADR 실측 1-E 표의 「`a` 열」 대비 (간극 중심 ±0.01 AU 밀도 / 이웃 밀도) — 3:1 `0.22` · 5:2 `0.33` ·
 * 7:3 `0.39` — 를 재현하도록 역산했다 (노치 수락 확률 `1 − exp(−x²/2σ²)` 의 ±0.01 AU 평균이 그 대비가 되는 σ).
 * 차수가 높은 공명일수록 좁다는 물리적 순서(3:1 2차 > 5:2 3차 > 7:3 4차) 와도 맞는다.
 * 2:1 (1차, 주 띠 바깥 경계 3.3 AU 근처) 은 DoD 대비 측정 대상이 아니다 — 측정된 것 중 가장 넓은 3:1 의 폭을 쓴다.
 */
const KIRKWOOD_GAPS: ReadonlyArray<{ p: number; q: number; widthAU: number }> = [
  { p: 3, q: 1, widthAU: 0.00775 },
  { p: 5, q: 2, widthAU: 0.00586 },
  { p: 7, q: 3, widthAU: 0.00513 },
  { p: 2, q: 1, widthAU: 0.00775 },
];

// ── 결정 4 표 ────────────────────────────────────────────────────────────────
const MAIN_A_MIN_AU = 2.1;
const MAIN_A_MAX_AU = 3.3;
const MAIN_E_SIGMA = 0.09;
const MAIN_I_SIGMA = 8 * DEG;

const HILDA_A_HALF_WIDTH_AU = 0.05;
const HILDA_PHI_HALF_WIDTH = 30 * DEG;
const HILDA_E_SIGMA = 0.15;
const HILDA_I_SIGMA = 8 * DEG;

const TROJAN_LONGITUDE_OFFSET = 60 * DEG;
const TROJAN_LONGITUDE_SIGMA = 12 * DEG;
/** L4 : L5 개수비. */
const TROJAN_L4_TO_L5_RATIO = 1.6;
const TROJAN_E_SIGMA = 0.06;
const TROJAN_I_SIGMA = 10 * DEG;

const KUIPER_A_MIN_AU = 42;
const KUIPER_A_MAX_AU = 48;
const KUIPER_E_SIGMA = 0.05;
const KUIPER_E_CAP = 0.15;
/** 냉 고전대 비율 (나머지 = 온). */
const KUIPER_COLD_FRACTION = 0.6;
const KUIPER_COLD_I_SIGMA = 2 * DEG;
const KUIPER_HOT_I_SIGMA = 12 * DEG;

const PLUTINO_A_HALF_WIDTH_AU = 0.2;
const PLUTINO_PHI_CENTER = 180 * DEG;
const PLUTINO_PHI_HALF_WIDTH = 40 * DEG;
const PLUTINO_E_SIGMA = 0.15;
const PLUTINO_I_SIGMA = 10 * DEG;

/**
 * 이심률 공통 상한 — 표가 상한을 적은 주 띠 값이자 셰이더 Kepler 검증 범위 (머리말 「ADR 표 표기의 해석」).
 * 고전대는 표의 더 좁은 상한 `KUIPER_E_CAP` 을 쓴다.
 */
export const BELT_ECCENTRICITY_CAP = 0.3;

/** 그룹별 난수 스트림 seed 간격 (황금비 32bit) — mulberry32 의 증분(0x6d2b79f5) 과 달라 스트림이 겹치지 않는다. */
const GROUP_SEED_STRIDE = 0x9e3779b9;
/** 기각 표본추출 무한 루프 방지 — 파라미터가 깨져 수락 확률이 0 이 되면 조용히 멈추지 않고 실패한다. */
const MAX_REJECTION_ATTEMPTS = 10_000;

/**
 * mulberry32 — 32bit PRNG, 결정적 재현. 띠 입자 난수의 단일 정의다 — 구 CPU 경로(`asteroid-belt.ts` 균일 분포) ·
 * GPU 경로 밝기(`belt-particles.ts`) · 이 모듈의 그룹 분포가 모두 이것을 쓴다 (#1319 PR2 에서 Babylon 비의존인 이곳으로 이동).
 */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 평균운동 [rad/day] — `kepler.ts` `meanAnomalyAt` 의 `√(μ/a³)` [rad/s] × 86400. */
export function meanMotionRadPerDay(semiMajorAxisMeters: number, mu: number): number {
  const a = semiMajorAxisMeters;
  return Math.sqrt(mu / (a * a * a)) * SECONDS_PER_DAY;
}

/**
 * 평균운동 비 `ratio = n_입자 / n_행성` 인 궤도의 장반경 [AU] — 같은 μ 의 Kepler 제3법칙 `a ∝ n^(-2/3)`.
 * 예: 목성 3:1 커크우드 간극 = `resonanceSemiMajorAxisAU(a_J, 3)`.
 */
export function resonanceSemiMajorAxisAU(planetSemiMajorAxisAU: number, ratio: number): number {
  return planetSemiMajorAxisAU * Math.pow(ratio, -2 / 3);
}

/** 커크우드 간극 중심 [AU] (3:1 · 5:2 · 7:3 · 2:1 순) — 목성 `a` 에서 도출. 진단 · 단위 테스트용. */
export function kirkwoodGapCentersAU(
  jupiterSemiMajorAxisAU: number,
): Array<{ label: string; centerAU: number }> {
  return KIRKWOOD_GAPS.map(({ p, q }) => ({
    label: `${p}:${q}`,
    centerAU: resonanceSemiMajorAxisAU(jupiterSemiMajorAxisAU, p / q),
  }));
}

/** 각을 [−π, π) 로 — float32 에 실을 때 절대값이 작을수록 반올림 오차가 작다. */
function wrapPi(x: number): number {
  return x - TWO_PI * Math.floor((x + Math.PI) / TWO_PI);
}

/**
 * 로더 경로에서 공명 기준 행성을 읽는다 — `solar-system.json` → `getSolarSystem()` → 이 함수.
 * 평균운동은 장면이 행성을 움직이는 식(`positionAt(orbit, jd, orbitMu(body, sun))`) 과 같은 μ 로 계산한다.
 */
export function beltPlanetsFromSystem(system: LoadedSolarSystem): BeltPlanets {
  const byId = new Map(system.bodies.map((b) => [b.id, b]));
  const sun = byId.get('sun');
  if (!sun) throw new Error('[beltPlanetsFromSystem] sun body 없음');
  const read = (id: string): { planet: ResonancePlanet; epoch: number } => {
    const body = byId.get(id);
    if (!body?.orbit) throw new Error(`[beltPlanetsFromSystem] ${id} 궤도 요소 없음`);
    const o = body.orbit;
    return {
      planet: {
        semiMajorAxisAU: o.semiMajorAxis / AU,
        meanLongitudeAtEpoch: wrapPi(
          o.longitudeOfAscendingNode + o.argumentOfPeriapsis + o.meanAnomalyAtEpoch,
        ),
        meanMotion: meanMotionRadPerDay(o.semiMajorAxis, orbitMu(body, sun)),
      },
      epoch: o.epoch,
    };
  };
  const jupiter = read('jupiter');
  const neptune = read('neptune');
  // 두 행성의 λ 가 같은 순간을 가리켜야 공명각이 의미를 갖는다.
  if (jupiter.epoch !== neptune.epoch) {
    throw new Error(
      `[beltPlanetsFromSystem] 목성 · 해왕성 epoch 불일치: ${jupiter.epoch} ≠ ${neptune.epoch}`,
    );
  }
  return {
    epoch: jupiter.epoch,
    // 띠 입자는 태양 직속 궤도 — `orbitMu` 의 태양 직속 분기(G·M_sun) 를 그대로 쓴다.
    mu: orbitMu({ parentId: 'sun', mass: 0 }, sun),
    jupiter: jupiter.planet,
    neptune: neptune.planet,
  };
}

/**
 * `?belt=N` 의 N (소행성대 그룹 총수) 을 기본 비율(주 띠 3000 : 힐다 300 : 트로이 600) 로 나눈다 — ADR 결정 6.
 * 최대 잉여 방식이라 합이 정확히 N 이다. 동률이면 앞 그룹 우선.
 */
export function scaleAsteroidBeltCounts(
  total: number,
): Pick<BeltCounts, 'main' | 'hilda' | 'trojan'> {
  const n = Math.max(0, Math.floor(total));
  const weights = ASTEROID_BELT_GROUPS.map((g) => BELT_DEFAULT_COUNTS[g]);
  const weightSum = weights.reduce((s, w) => s + w, 0);
  const exact = weights.map((w) => (n * w) / weightSum);
  const counts = exact.map(Math.floor);
  let remaining = n - counts.reduce((s, c) => s + c, 0);
  const byRemainder = exact
    .map((x, k) => ({ k, r: x - Math.floor(x) }))
    .sort((u, v) => v.r - u.r || u.k - v.k);
  for (const { k } of byRemainder) {
    if (remaining <= 0) break;
    counts[k] = counts[k]! + 1;
    remaining -= 1;
  }
  return { main: counts[0]!, hilda: counts[1]!, trojan: counts[2]! };
}

// ── 표본추출 ────────────────────────────────────────────────────────────────

type Rng = () => number;

function uniform(rnd: Rng, min: number, max: number): number {
  return min + rnd() * (max - min);
}

/** Rayleigh(σ) — 역함수. `1 − u ∈ (0, 1]` 이라 `log` 가 유한하다 (mulberry32 는 0 을 낼 수 있다). */
function rayleigh(rnd: Rng, sigma: number): number {
  return sigma * Math.sqrt(-2 * Math.log(1 - rnd()));
}

/** Rayleigh(σ) 를 `[0, cap)` 으로 절단 — 상한 밖이면 다시 뽑는다. */
function truncatedRayleigh(rnd: Rng, sigma: number, cap: number): number {
  for (let k = 0; k < MAX_REJECTION_ATTEMPTS; k += 1) {
    const x = rayleigh(rnd, sigma);
    if (x < cap) return x;
  }
  throw new Error(`[belt-population] Rayleigh(σ=${sigma}) 절단 [0, ${cap}) 표본추출 실패`);
}

/** 표준정규 — Box–Muller (`1 − u` 로 `log(0)` 회피). */
function standardNormal(rnd: Rng): number {
  const r = Math.sqrt(-2 * Math.log(1 - rnd()));
  return r * Math.cos(TWO_PI * rnd());
}

/** 커크우드 노치 수락 확률 — 간극 중심에서 0, 멀어지면 1. 노치가 겹치면 곱한다. */
function kirkwoodAcceptance(aAU: number, gapCentersAU: readonly number[]): number {
  let p = 1;
  for (let k = 0; k < KIRKWOOD_GAPS.length; k += 1) {
    const dx = aAU - gapCentersAU[k]!;
    const w = KIRKWOOD_GAPS[k]!.widthAU;
    p *= 1 - Math.exp(-(dx * dx) / (2 * w * w));
  }
  return p;
}

/**
 * 궤도면 각(Ω, ϖ) 과 평균경도 λ 로 요소를 마무리한다 — ω = ϖ − Ω, M = λ − ϖ (로더와 같은 변환).
 */
function finishOrbit(
  base: Pick<
    BeltOrbit,
    'semiMajorAxisAU' | 'eccentricity' | 'inclination' | 'meanMotion' | 'epoch'
  >,
  node: number,
  perihelionLongitude: number,
  meanLongitude: number,
): BeltOrbit {
  return {
    ...base,
    longitudeOfAscendingNode: wrapPi(node),
    argumentOfPeriapsis: wrapPi(perihelionLongitude - node),
    meanAnomalyAtEpoch: wrapPi(meanLongitude - perihelionLongitude),
  };
}

function generateMain(rnd: Rng, count: number, planets: BeltPlanets): BeltOrbit[] {
  const gapCenters = KIRKWOOD_GAPS.map(({ p, q }) =>
    resonanceSemiMajorAxisAU(planets.jupiter.semiMajorAxisAU, p / q),
  );
  const out: BeltOrbit[] = [];
  for (let i = 0; i < count; i += 1) {
    let aAU = Number.NaN;
    for (let k = 0; k < MAX_REJECTION_ATTEMPTS; k += 1) {
      const candidate = uniform(rnd, MAIN_A_MIN_AU, MAIN_A_MAX_AU);
      if (rnd() < kirkwoodAcceptance(candidate, gapCenters)) {
        aAU = candidate;
        break;
      }
    }
    if (Number.isNaN(aAU)) throw new Error('[belt-population] 주 띠 a 기각 표본추출 실패');
    out.push(
      finishOrbit(
        {
          semiMajorAxisAU: aAU,
          eccentricity: truncatedRayleigh(rnd, MAIN_E_SIGMA, BELT_ECCENTRICITY_CAP),
          inclination: rayleigh(rnd, MAIN_I_SIGMA),
          meanMotion: meanMotionRadPerDay(aAU * AU, planets.mu),
          epoch: planets.epoch,
        },
        rnd() * TWO_PI,
        rnd() * TWO_PI,
        rnd() * TWO_PI,
      ),
    );
  }
  return out;
}

/**
 * 힐다 — 목성 3:2. 공명각 φ = 3λ_J − 2λ − ϖ 를 먼저 뽑고 λ 를 푼다: λ = (3λ_J − ϖ − φ)/2 + kπ.
 * 2 로 나누므로 해가 두 갈래(k = 0, 1) 다 — 한 갈래만 쓰면 삼각형의 절반이 빈다. 갈래는 균등하게 뽑는다.
 */
function generateHilda(rnd: Rng, count: number, planets: BeltPlanets): BeltOrbit[] {
  const { jupiter } = planets;
  const centerAU = resonanceSemiMajorAxisAU(jupiter.semiMajorAxisAU, HILDA_MEAN_MOTION_RATIO);
  const out: BeltOrbit[] = [];
  for (let i = 0; i < count; i += 1) {
    const aAU = uniform(rnd, centerAU - HILDA_A_HALF_WIDTH_AU, centerAU + HILDA_A_HALF_WIDTH_AU);
    const e = truncatedRayleigh(rnd, HILDA_E_SIGMA, BELT_ECCENTRICITY_CAP);
    const inc = rayleigh(rnd, HILDA_I_SIGMA);
    const node = rnd() * TWO_PI;
    const varpi = rnd() * TWO_PI;
    const phi = uniform(rnd, -HILDA_PHI_HALF_WIDTH, HILDA_PHI_HALF_WIDTH);
    const branch = Math.floor(rnd() * 2);
    const lambda = (3 * jupiter.meanLongitudeAtEpoch - varpi - phi) / 2 + branch * Math.PI;
    out.push(
      finishOrbit(
        {
          semiMajorAxisAU: aAU,
          eccentricity: e,
          inclination: inc,
          meanMotion: HILDA_MEAN_MOTION_RATIO * jupiter.meanMotion,
          epoch: planets.epoch,
        },
        node,
        varpi,
        lambda,
      ),
    );
  }
  return out;
}

/** 트로이 L4 개수 — `count × 1.6 / 2.6` 반올림 (나머지 L5). 무작위가 아니라 고정 분할이다. */
export function trojanL4Count(count: number): number {
  return Math.round((count * TROJAN_L4_TO_L5_RATIO) / (TROJAN_L4_TO_L5_RATIO + 1));
}

/** 트로이 — 목성 1:1. λ = λ_J ± 60° + N(0, 12°), 앞 `trojanL4Count` 개가 L4 (+60° = 목성 공전 방향 앞). */
function generateTrojan(rnd: Rng, count: number, planets: BeltPlanets): BeltOrbit[] {
  const { jupiter } = planets;
  const l4 = trojanL4Count(count);
  const out: BeltOrbit[] = [];
  for (let i = 0; i < count; i += 1) {
    const side = i < l4 ? 1 : -1;
    const e = truncatedRayleigh(rnd, TROJAN_E_SIGMA, BELT_ECCENTRICITY_CAP);
    const inc = rayleigh(rnd, TROJAN_I_SIGMA);
    const node = rnd() * TWO_PI;
    const varpi = rnd() * TWO_PI;
    const lambda =
      jupiter.meanLongitudeAtEpoch +
      side * TROJAN_LONGITUDE_OFFSET +
      TROJAN_LONGITUDE_SIGMA * standardNormal(rnd);
    out.push(
      finishOrbit(
        {
          semiMajorAxisAU: resonanceSemiMajorAxisAU(
            jupiter.semiMajorAxisAU,
            TROJAN_MEAN_MOTION_RATIO,
          ),
          eccentricity: e,
          inclination: inc,
          meanMotion: TROJAN_MEAN_MOTION_RATIO * jupiter.meanMotion,
          epoch: planets.epoch,
        },
        node,
        varpi,
        lambda,
      ),
    );
  }
  return out;
}

/** 카이퍼 고전대 — 앞 `round(count × 0.6)` 개가 냉 (i σ 2°), 나머지 온 (i σ 12°). */
function generateKuiperClassical(rnd: Rng, count: number, planets: BeltPlanets): BeltOrbit[] {
  const cold = Math.round(count * KUIPER_COLD_FRACTION);
  const out: BeltOrbit[] = [];
  for (let i = 0; i < count; i += 1) {
    const aAU = uniform(rnd, KUIPER_A_MIN_AU, KUIPER_A_MAX_AU);
    out.push(
      finishOrbit(
        {
          semiMajorAxisAU: aAU,
          eccentricity: truncatedRayleigh(rnd, KUIPER_E_SIGMA, KUIPER_E_CAP),
          inclination: rayleigh(rnd, i < cold ? KUIPER_COLD_I_SIGMA : KUIPER_HOT_I_SIGMA),
          meanMotion: meanMotionRadPerDay(aAU * AU, planets.mu),
          epoch: planets.epoch,
        },
        rnd() * TWO_PI,
        rnd() * TWO_PI,
        rnd() * TWO_PI,
      ),
    );
  }
  return out;
}

/**
 * 플루티노 — 해왕성 2:3. φ = 3λ − 2λ_N − ϖ 를 먼저 뽑고 λ 를 푼다: λ = (φ + 2λ_N + ϖ)/3 + 2πk/3.
 * 3 으로 나누므로 해가 세 갈래(k = 0, 1, 2) 다 — 갈래는 균등하게 뽑는다 (힐다와 같은 이유).
 */
function generatePlutino(rnd: Rng, count: number, planets: BeltPlanets): BeltOrbit[] {
  const { neptune } = planets;
  const centerAU = resonanceSemiMajorAxisAU(neptune.semiMajorAxisAU, PLUTINO_MEAN_MOTION_RATIO);
  const out: BeltOrbit[] = [];
  for (let i = 0; i < count; i += 1) {
    const aAU = uniform(
      rnd,
      centerAU - PLUTINO_A_HALF_WIDTH_AU,
      centerAU + PLUTINO_A_HALF_WIDTH_AU,
    );
    const e = truncatedRayleigh(rnd, PLUTINO_E_SIGMA, BELT_ECCENTRICITY_CAP);
    const inc = rayleigh(rnd, PLUTINO_I_SIGMA);
    const node = rnd() * TWO_PI;
    const varpi = rnd() * TWO_PI;
    const phi = PLUTINO_PHI_CENTER + uniform(rnd, -PLUTINO_PHI_HALF_WIDTH, PLUTINO_PHI_HALF_WIDTH);
    const branch = Math.floor(rnd() * 3);
    const lambda = (phi + 2 * neptune.meanLongitudeAtEpoch + varpi) / 3 + (branch * TWO_PI) / 3;
    out.push(
      finishOrbit(
        {
          semiMajorAxisAU: aAU,
          eccentricity: e,
          inclination: inc,
          meanMotion: PLUTINO_MEAN_MOTION_RATIO * neptune.meanMotion,
          epoch: planets.epoch,
        },
        node,
        varpi,
        lambda,
      ),
    );
  }
  return out;
}

const GENERATORS: Record<
  BeltGroup,
  (rnd: Rng, count: number, planets: BeltPlanets) => BeltOrbit[]
> = {
  main: generateMain,
  hilda: generateHilda,
  trojan: generateTrojan,
  kuiperClassical: generateKuiperClassical,
  plutino: generatePlutino,
};

/**
 * 그룹 5종의 궤도 요소를 만든다 (ADR 결정 4). seed 결정적 — 그룹마다 독립 난수 스트림이라
 * 한 그룹의 개수를 바꿔도 다른 그룹의 요소는 그대로다.
 *
 * @param seed 결정적 생성 seed
 * @param counts 그룹별 개수 (음수 · 소수는 내림 후 0 하한)
 * @param planets `beltPlanetsFromSystem(getSolarSystem())`
 */
export function generateBeltPopulation(
  seed: number,
  counts: Readonly<BeltCounts>,
  planets: BeltPlanets,
): BeltPopulation {
  const out = {} as BeltPopulation;
  GROUP_ORDER.forEach((group, k) => {
    const rnd = mulberry32((seed + GROUP_SEED_STRIDE * (k + 1)) >>> 0);
    const count = Math.max(0, Math.floor(counts[group]));
    out[group] = GENERATORS[group](rnd, count, planets);
  });
  return out;
}
