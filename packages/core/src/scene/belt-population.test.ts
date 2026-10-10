/**
 * #1319 PR2 — 띠 입자 분포 생성기 단위 테스트 (ADR 20261008-1319 결정 4 · 이슈 #1319 PR2 DoD).
 *
 *  1. 공명 위치 — 커크우드 간극 · 힐다 · 플루티노 장반경을 행성 `a` 와 공명비에서 도출한 값이 결정 4 표와 일치.
 *  2. 주 띠 `a` 히스토그램 간극 대비 (간극 중심 ±0.01 AU / 이웃 4~6 bin) 3:1 · 5:2 · 7:3 각 ≤ 0.5.
 *  3. 트로이 — `λ − λ_J` 가 L4 +60° / L5 −60° 중심 · 표준편차 ≤ 15° · L4:L5 = 1.6 ± 0.1 ·
 *     100 년 뒤에도 `λ − λ_J` 변화 ≤ 0.01° (장면이 목성을 움직이는 식과 대조).
 *  4. 힐다 `|mean φ|` ≤ 5° · 플루티노 `mean φ` = 180° ± 5° · 평균운동 비 1.5 / (2/3) 정확 (double).
 *  5. 불변식 — 전 요소 `0 ≤ e < 1` · `a > 0` · 유한값. 빈 배열은 FAIL (공허 통과 금지).
 *  6. seed 결정성 · 그룹 스트림 독립 · `?belt=N` 개수 비율 분할.
 *
 * 각도 평균은 원형 평균(`atan2(Σsin, Σcos)`) 이다 — 0°/360° 경계에서 산술 평균은 틀린다.
 */
import { describe, expect, it } from 'vitest';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { meanAnomalyAt, orbitMu } from '../physics/kepler.js';
import {
  ASTEROID_BELT_GROUPS,
  BELT_DEFAULT_COUNTS,
  BELT_ECCENTRICITY_CAP,
  KUIPER_BELT_GROUPS,
  beltPlanetsFromSystem,
  generateBeltPopulation,
  kirkwoodGapCentersAU,
  meanMotionRadPerDay,
  resonanceSemiMajorAxisAU,
  scaleAsteroidBeltCounts,
  trojanL4Count,
  type BeltCounts,
  type BeltGroup,
  type BeltOrbit,
  type BeltPopulation,
} from './belt-population.js';
import { beltOrbitAttributes } from './belt-particles.js';

const DEG = Math.PI / 180;
const SEED = 42;
const DAYS_PER_CENTURY = 36_525;

const system = getSolarSystem();
const planets = beltPlanetsFromSystem(system);
const population = generateBeltPopulation(SEED, BELT_DEFAULT_COUNTS, planets);

/** (−π, π] 로. */
function wrapSigned(x: number): number {
  const r = x - 2 * Math.PI * Math.floor((x + Math.PI) / (2 * Math.PI));
  return r === -Math.PI ? Math.PI : r;
}
function meanLongitude(o: BeltOrbit): number {
  return o.longitudeOfAscendingNode + o.argumentOfPeriapsis + o.meanAnomalyAtEpoch;
}
function perihelionLongitude(o: BeltOrbit): number {
  return o.longitudeOfAscendingNode + o.argumentOfPeriapsis;
}
function circularMean(angles: readonly number[]): number {
  let s = 0;
  let c = 0;
  for (const a of angles) {
    s += Math.sin(a);
    c += Math.cos(a);
  }
  return Math.atan2(s, c);
}
function mean(xs: readonly number[]): number {
  return xs.reduce((s, x) => s + x, 0) / xs.length;
}
function std(xs: readonly number[]): number {
  const m = mean(xs);
  return Math.sqrt(xs.reduce((s, x) => s + (x - m) * (x - m), 0) / xs.length);
}

// ── 1. 공명 위치 ────────────────────────────────────────────────────────────

describe('#1319 PR2 공명 위치 — 행성 a 와 공명비에서 도출 (표 값과 일치)', () => {
  it('커크우드 간극 3:1 · 5:2 · 7:3 · 2:1 = 결정 4 표 (2.502 · 2.825 · 2.958 · 3.279) ± 0.002 AU', () => {
    const gaps = kirkwoodGapCentersAU(planets.jupiter.semiMajorAxisAU);
    expect(gaps.map((g) => g.label)).toEqual(['3:1', '5:2', '7:3', '2:1']);
    const table = [2.502, 2.825, 2.958, 3.279];
    gaps.forEach((g, k) => expect(Math.abs(g.centerAU - table[k]!), g.label).toBeLessThan(0.002));
  });

  it('힐다 중심 = 결정 4 표 3.97 AU (± 0.005) · 플루티노 중심 = 39.4 AU (± 0.05) — 표 유효숫자 반 자리', () => {
    expect(
      Math.abs(resonanceSemiMajorAxisAU(planets.jupiter.semiMajorAxisAU, 3 / 2) - 3.97),
    ).toBeLessThan(0.005);
    expect(
      Math.abs(resonanceSemiMajorAxisAU(planets.neptune.semiMajorAxisAU, 2 / 3) - 39.4),
    ).toBeLessThan(0.05);
  });

  it('로더 경로 — 목성 · 해왕성 n 은 장면 Kepler 경로와 같은 μ (orbitMu) 에서 · λ = Ω + ω + M', () => {
    const sun = system.bodies.find((b) => b.id === 'sun')!;
    for (const id of ['jupiter', 'neptune'] as const) {
      const body = system.bodies.find((b) => b.id === id)!;
      const p = planets[id];
      expect(p.meanMotion).toBe(meanMotionRadPerDay(body.orbit!.semiMajorAxis, orbitMu(body, sun)));
      const o = body.orbit!;
      expect(
        Math.abs(
          wrapSigned(
            p.meanLongitudeAtEpoch -
              (o.longitudeOfAscendingNode + o.argumentOfPeriapsis + o.meanAnomalyAtEpoch),
          ),
        ),
      ).toBeLessThan(1e-12);
    }
    expect(planets.epoch).toBe(system.bodies.find((b) => b.id === 'jupiter')!.orbit!.epoch);
  });
});

// ── 2. 주 띠 간극 ────────────────────────────────────────────────────────────

/** 히스토그램 bin 폭 = 간극 중심 ±0.01 AU. */
const GAP_BIN_HALF_WIDTH_AU = 0.01;
/** 이웃 bin 위치 — 간극 bin 에서 4~6 bin 떨어진 양쪽 (총 6 bin). */
const NEIGHBOR_BIN_OFFSETS = [-6, -5, -4, 4, 5, 6];

/** 간극 대비 = 간극 bin 개수 / 이웃 bin 개수 평균 (1.0 = 간극 없음). */
function gapContrast(aValues: readonly number[], centerAU: number): number {
  const width = 2 * GAP_BIN_HALF_WIDTH_AU;
  const countIn = (c: number) =>
    aValues.filter((a) => a >= c - GAP_BIN_HALF_WIDTH_AU && a < c + GAP_BIN_HALF_WIDTH_AU).length;
  const neighbors = NEIGHBOR_BIN_OFFSETS.map((k) => countIn(centerAU + k * width));
  const neighborMean = mean(neighbors);
  // 전제 — 이웃 bin 이 비어 있으면 대비가 정의되지 않는다 (공허 통과 방지).
  expect(neighborMean).toBeGreaterThan(0);
  return countIn(centerAU) / neighborMean;
}

describe('#1319 PR2 주 띠 — 커크우드 간극 (a 분포에만, ADR 1-E · Q2)', () => {
  const gaps = kirkwoodGapCentersAU(planets.jupiter.semiMajorAxisAU).filter(
    (g) => g.label !== '2:1', // 2:1 은 주 띠 바깥 경계(3.3 AU) 에 붙어 바깥 이웃 bin 이 없다 — DoD 대상 아님.
  );

  // (#1319 PR3) 「기본 수 3000 · seed 42」 단언은 삭제했다 — 3000 표본의 간극 대비는 seed 에 따라 0.5 를 넘나들어
  // (200 seed 중 14.5% 초과 — PR #1324 reviewer 실측) 판별력이 없었다. 판정은 아래 200,000 대표본이 한다.

  it('대표본 200,000 — 간극 대비 ≤ 0.5 (seed 우연이 아닌 분포 성질) · 간극 밖 대조 bin 은 ≈ 1', () => {
    const big = generateBeltPopulation(7, { ...zeroCounts(), main: 200_000 }, planets).main.map(
      (o) => o.semiMajorAxisAU,
    );
    for (const g of gaps) expect(gapContrast(big, g.centerAU), g.label).toBeLessThanOrEqual(0.5);
    // 판별력 대조 — 같은 측정이 간극 없는 위치(2.65 AU, 3:1 과 5:2 사이) 에서는 0.5 를 크게 넘는다.
    expect(gapContrast(big, 2.65)).toBeGreaterThan(0.9);
  });

  it('주 띠 a ∈ [2.1, 3.3] AU', () => {
    for (const o of population.main) {
      expect(o.semiMajorAxisAU).toBeGreaterThanOrEqual(2.1);
      expect(o.semiMajorAxisAU).toBeLessThanOrEqual(3.3);
    }
  });
});

// ── 3. 트로이 ──────────────────────────────────────────────────────────────

describe('#1319 PR2 트로이 — L4 +60° / L5 −60°, 평균운동 = n_J', () => {
  const offsets = population.trojan.map((o) =>
    wrapSigned(meanLongitude(o) - planets.jupiter.meanLongitudeAtEpoch),
  );
  const l4 = offsets.filter((d) => d > 0);
  const l5 = offsets.filter((d) => d < 0);

  it('L4 중심 +60° · L5 중심 −60° (± 5°) · 표준편차 ≤ 15°', () => {
    expect(l4.length + l5.length).toBe(BELT_DEFAULT_COUNTS.trojan);
    expect(Math.abs(mean(l4) / DEG - 60)).toBeLessThanOrEqual(5);
    expect(Math.abs(mean(l5) / DEG + 60)).toBeLessThanOrEqual(5);
    expect(std(l4) / DEG).toBeLessThanOrEqual(15);
    expect(std(l5) / DEG).toBeLessThanOrEqual(15);
  });

  it('L4 : L5 개수비 1.6 ± 0.1 (기본 600 · 그리고 ?belt=N 축소 시 작은 개수에서도)', () => {
    expect(Math.abs(l4.length / l5.length - 1.6)).toBeLessThanOrEqual(0.1);
    // `?belt=1000` 의 트로이 수 154 — 고정 분할이라 작은 N 에서도 비율이 유지된다.
    const small = scaleAsteroidBeltCounts(1000).trojan;
    const l4Small = trojanL4Count(small);
    expect(Math.abs(l4Small / (small - l4Small) - 1.6)).toBeLessThanOrEqual(0.1);
  });

  it('평균운동 = n_J 정확 (double) — 100 년 뒤 λ − λ_J 변화 ≤ 0.01° (장면의 목성 전파식과 대조)', () => {
    const jupiter = system.bodies.find((b) => b.id === 'jupiter')!;
    const sun = system.bodies.find((b) => b.id === 'sun')!;
    const jOrbit = jupiter.orbit!;
    const t = planets.epoch + DAYS_PER_CENTURY;
    // 장면이 목성을 움직이는 식 — `positionAt(orbit, jd, orbitMu(body, sun))` 의 평균이상.
    const lambdaJ =
      jOrbit.longitudeOfAscendingNode +
      jOrbit.argumentOfPeriapsis +
      meanAnomalyAt(jOrbit, t, orbitMu(jupiter, sun));
    let worst = 0;
    for (const o of population.trojan) {
      expect(o.meanMotion).toBe(planets.jupiter.meanMotion);
      const before = wrapSigned(meanLongitude(o) - planets.jupiter.meanLongitudeAtEpoch);
      // 셰이더가 받는 값 그대로 — 100 년 뒤로 rebase 한 속성(double, cast 전) 의 λ = Ω + ω + M0.
      const { orbitA, orbitB } = beltOrbitAttributes(o, t, 1);
      const after = wrapSigned(orbitB[0] + orbitB[1] + orbitA[3] - lambdaJ);
      worst = Math.max(worst, Math.abs(wrapSigned(after - before)));
    }
    expect(worst / DEG).toBeLessThanOrEqual(0.01);
  });
});

// ── 4. 힐다 · 플루티노 ──────────────────────────────────────────────────────

describe('#1319 PR2 힐다 (목성 3:2) · 플루티노 (해왕성 2:3) — 공명각 · 평균운동 비', () => {
  it('힐다 φ = 3λ_J − 2λ − ϖ : |mean φ| ≤ 5° · 전 표본 |φ| ≤ 30°', () => {
    const phis = population.hilda.map((o) =>
      wrapSigned(
        3 * planets.jupiter.meanLongitudeAtEpoch - 2 * meanLongitude(o) - perihelionLongitude(o),
      ),
    );
    expect(phis).toHaveLength(BELT_DEFAULT_COUNTS.hilda);
    expect(Math.abs(circularMean(phis)) / DEG).toBeLessThanOrEqual(5);
    for (const phi of phis) expect(Math.abs(phi) / DEG).toBeLessThanOrEqual(30 + 1e-9);
  });

  it('플루티노 φ = 3λ − 2λ_N − ϖ : mean φ = 180° ± 5°', () => {
    const phis = population.plutino.map((o) =>
      wrapSigned(
        3 * meanLongitude(o) - 2 * planets.neptune.meanLongitudeAtEpoch - perihelionLongitude(o),
      ),
    );
    expect(phis).toHaveLength(BELT_DEFAULT_COUNTS.plutino);
    // 180° 근방은 ±π 경계라 π 만큼 돌려 0 근방에서 잰다.
    const shifted = circularMean(phis.map((p) => p + Math.PI));
    expect(Math.abs(shifted) / DEG).toBeLessThanOrEqual(5);
  });

  it('λ 해의 갈래가 모두 쓰인다 — 행성 대비 평균경도 4 사분면이 전부 차 있다', () => {
    // 공명각 식을 λ 로 풀면 힐다는 2 갈래(÷2) · 플루티노는 3 갈래(÷3) 다. 한 갈래만 쓰면 λ 가
    // 힐다 ≈ 210° · 플루티노 ≈ 147° 폭에 갇혀 최소 한 사분면이 빈다 (삼각형 · 고리의 일부가 빈다).
    const quadrants = (orbits: readonly BeltOrbit[], planetLongitude: number) =>
      new Set(
        orbits.map((o) => {
          const d = wrapSigned(meanLongitude(o) - planetLongitude) + Math.PI; // [0, 2π]
          return Math.min(3, Math.floor(d / (Math.PI / 2)));
        }),
      ).size;
    expect(quadrants(population.hilda, planets.jupiter.meanLongitudeAtEpoch)).toBe(4);
    expect(quadrants(population.plutino, planets.neptune.meanLongitudeAtEpoch)).toBe(4);
  });

  it('갈래별 개수 비율 — 플루티노 3 갈래 각 1/3 (대표본, 갈래 수를 줄이는 변이를 잡는다)', () => {
    // 위 사분면 단언은 「갈래가 1개뿐」 만 잡는다 — 플루티노를 2 갈래로 줄여도 λ 가 4 사분면에 퍼져 통과한다 (PR #1324
    // reviewer 실측 35/35 PASS). 그래서 갈래 k 를 각 입자에서 복원해 비율을 직접 본다.
    // 복원: 공명각 φ 는 갈래와 무관하게 같은 값이라 (3·2πk/3 = 2πk) 생성 구간 안의 대표값으로 접은 뒤, λ 와
    // 갈래 0 해 (φ 식을 λ 로 푼 값) 의 차를 갈래 간격(2π/갈래 수) 으로 나누면 k 다.
    const N = 30_000;
    const big = generateBeltPopulation(11, { ...zeroCounts(), plutino: N }, planets);
    const branchShares = (
      orbits: readonly BeltOrbit[],
      branches: number,
      branchZeroLambda: (o: BeltOrbit) => number,
    ) => {
      const counts = new Array<number>(branches).fill(0);
      for (const o of orbits) {
        const diff = meanLongitude(o) - branchZeroLambda(o);
        const step = (2 * Math.PI) / branches;
        const k = ((Math.round(diff / step) % branches) + branches) % branches;
        counts[k] = counts[k]! + 1;
      }
      return counts.map((c) => c / orbits.length);
    };
    const lambdaN = planets.neptune.meanLongitudeAtEpoch;
    const plutinoShares = branchShares(big.plutino, 3, (o) => {
      const raw = 3 * meanLongitude(o) - 2 * lambdaN - perihelionLongitude(o);
      const phi = Math.PI + wrapSigned(raw - Math.PI); // 생성 구간 180° ± 40° 의 대표값
      return (phi + 2 * lambdaN + perihelionLongitude(o)) / 3;
    });
    // 허용폭 0.02 — 이항 표준편차 (N = 30,000 에서 ≈ 0.003) 의 6배 이상. 갈래를 하나 줄이면 비율이 1/2 · 1/2 · 0
    // 으로 바뀌어 0.17 이상 벗어난다.
    for (const share of plutinoShares) expect(Math.abs(share - 1 / 3)).toBeLessThanOrEqual(0.02);
  });

  it('평균운동 비 — 힐다 1.5 n_J · 플루티노 (2/3) n_N 정확 (double, float32 cast 전)', () => {
    for (const o of population.hilda) {
      expect(o.meanMotion).toBe(1.5 * planets.jupiter.meanMotion);
      expect(o.meanMotion / planets.jupiter.meanMotion).toBe(1.5);
    }
    for (const o of population.plutino) {
      expect(o.meanMotion).toBe((2 / 3) * planets.neptune.meanMotion);
      // 2/3 은 이진 표현이 정확하지 않다 — 비는 double 반올림 2 ulp 안.
      expect(Math.abs(o.meanMotion / planets.neptune.meanMotion - 2 / 3)).toBeLessThanOrEqual(
        2 * Number.EPSILON,
      );
    }
  });
});

// ── 5. 불변식 ───────────────────────────────────────────────────────────────

const ALL_GROUPS: readonly BeltGroup[] = [...ASTEROID_BELT_GROUPS, ...KUIPER_BELT_GROUPS];

function zeroCounts(): BeltCounts {
  return { main: 0, hilda: 0, trojan: 0, kuiperClassical: 0, plutino: 0 };
}

/**
 * 생성기 불변식 위반 목록. **빈 입력이면 던진다** — 「위반 0」 이 「표본 0」 에서 공허하게 참이 되지 않게 한다.
 */
function invariantViolations(orbits: readonly BeltOrbit[]): string[] {
  if (orbits.length === 0) throw new Error('불변식 검사 표본이 비었다');
  const out: string[] = [];
  orbits.forEach((o, i) => {
    for (const [k, v] of Object.entries(o)) {
      if (!Number.isFinite(v)) out.push(`#${i} ${k} 비유한 ${v}`);
    }
    if (!(o.eccentricity >= 0 && o.eccentricity < 1)) out.push(`#${i} e=${o.eccentricity}`);
    if (!(o.semiMajorAxisAU > 0)) out.push(`#${i} a=${o.semiMajorAxisAU}`);
  });
  return out;
}

describe('#1319 PR2 생성기 불변식 (ADR §교차검증 이견 수용 6)', () => {
  it('그룹 5종 전 요소 — 0 ≤ e < 1 · a > 0 · 유한값 (각 그룹 개수 = 요청 수 > 0)', () => {
    for (const g of ALL_GROUPS) {
      expect(population[g], g).toHaveLength(BELT_DEFAULT_COUNTS[g]);
      expect(invariantViolations(population[g]), g).toEqual([]);
    }
  });

  it('여러 seed · 대표본에서도 위반 0 (Rayleigh 꼬리 · 기각 표본추출 경계)', () => {
    const counts: BeltCounts = {
      main: 20_000,
      hilda: 5_000,
      trojan: 5_000,
      kuiperClassical: 5_000,
      plutino: 5_000,
    };
    for (const seed of [1, 1319, 0xffffffff]) {
      const pop = generateBeltPopulation(seed, counts, planets);
      for (const g of ALL_GROUPS) expect(invariantViolations(pop[g]), `${seed} ${g}`).toEqual([]);
    }
  });

  it('이심률 상한 — 셰이더 Kepler 검증 범위 e < 0.3 · 고전대 e < 0.15 (결정 4 표)', () => {
    for (const g of ALL_GROUPS) {
      const cap = g === 'kuiperClassical' ? 0.15 : BELT_ECCENTRICITY_CAP;
      for (const o of population[g]) expect(o.eccentricity, g).toBeLessThan(cap);
    }
  });

  it('검사기 자신 — 빈 배열은 통과가 아니라 실패 · 위반 요소는 잡는다', () => {
    expect(() => invariantViolations([])).toThrow();
    const bad = { ...population.main[0]!, eccentricity: 1 };
    expect(invariantViolations([bad])).toHaveLength(1);
    const nan = { ...population.main[0]!, meanMotion: Number.NaN };
    expect(invariantViolations([nan])).toHaveLength(1);
  });

  it('개수 0 그룹은 빈 배열 (생성기는 던지지 않는다)', () => {
    const pop: BeltPopulation = generateBeltPopulation(SEED, zeroCounts(), planets);
    for (const g of ALL_GROUPS) expect(pop[g]).toEqual([]);
  });
});

// ── 6. 결정성 · 개수 ────────────────────────────────────────────────────────

describe('#1319 PR2 seed 결정성 · ?belt=N 개수 분할', () => {
  it('같은 seed → 요소 동일 · 다른 seed → 다름', () => {
    expect(generateBeltPopulation(SEED, BELT_DEFAULT_COUNTS, planets)).toEqual(population);
    expect(generateBeltPopulation(SEED + 1, BELT_DEFAULT_COUNTS, planets).main).not.toEqual(
      population.main,
    );
  });

  it('그룹 스트림 독립 — 주 띠 수를 바꿔도 트로이 · 카이퍼 요소는 그대로', () => {
    const other = generateBeltPopulation(SEED, { ...BELT_DEFAULT_COUNTS, main: 17 }, planets);
    expect(other.trojan).toEqual(population.trojan);
    expect(other.kuiperClassical).toEqual(population.kuiperClassical);
  });

  it('scaleAsteroidBeltCounts — 합 = N · 기본 비율 3000:300:600 유지', () => {
    expect(scaleAsteroidBeltCounts(3900)).toEqual({ main: 3000, hilda: 300, trojan: 600 });
    expect(scaleAsteroidBeltCounts(1000)).toEqual({ main: 769, hilda: 77, trojan: 154 });
    expect(scaleAsteroidBeltCounts(0)).toEqual({ main: 0, hilda: 0, trojan: 0 });
    for (const n of [1, 7, 200, 999, 10_000]) {
      const c = scaleAsteroidBeltCounts(n);
      expect(c.main + c.hilda + c.trojan, String(n)).toBe(n);
    }
  });
});
