/**
 * #1428 — 태양 플레어 생성기 단위 테스트 (ADR 20261107-1428 결정 4 · §교차검증 합의 3 · 4 · 7 · 8 · DoD D3 · D9).
 *
 *  1. 상수 — `MAX_SUN_FLARES = 4` · 상승 15 분 · 감쇠 45 분 · 계수 48 /일 · lookback.
 *  2. 광도 곡선 — POC 값 (τ = −10 · +5 · +15 · +45 · +105 분 → 0 · 0.26 · 1 · 0.51 · 0.14) · 꼬리 연속.
 *  3. 진입부 jd 가드 — 비유한 · 범위 밖 → 0 개 · 출력 버퍼 무변경.
 *  4. 결정성 — 골든 값 · 다른 jd 를 사이에 둔 재호출 일치.
 *  5. 흑점 공유 계약 — 생성기는 받은 목록만 쓴다 (흑점 생성기를 부르지 않는다) · 위치는 군 성분의 면적 가중 중심.
 *  6. 발생률 — 군 면적 비례 · 슬롯당 최대 1 회 · 상한 절단은 세기 큰 순.
 *  7. 연속성 — 1 분 간격으로 진행해도 세기가 광도 곡선 기울기 이상으로 튀지 않는다 (자정 경계 · 면적 게이트 포함).
 */
import { describe, expect, it } from 'vitest';
import {
  FLARE_CYCLES_PER_DAY,
  FLARE_DECAY_CUTOFF_EFOLDS,
  FLARE_DECAY_EFOLD_DAYS,
  FLARE_DURATION_MAX_DAYS,
  FLARE_GATE_WIDTH,
  FLARE_PROBABILITY_PER_MSH,
  FLARE_RISE_DAYS,
  FLARE_SLOT_LOOKBACK_DAYS,
  MAX_SUN_FLARES,
  createSunFlareList,
  generateSunFlares,
  lastSunFlareCandidateCount,
  sunFlareAreaGate,
  sunFlareLightCurve,
  type SunFlareList,
} from './sun-flares.js';
import {
  SUNSPOT_JD_RANGE_DAYS,
  createHeliographicSpots,
  generateHeliographicSunspots,
  lastSunspotCandidateCount,
  type HeliographicSpots,
} from './sunspots.js';

const J2000 = 2_451_545.0;
const MIN = 1 / 1440;
/** 2014-04-01 03:00 UT (사이클 24 극대 — ADR 1412 · 1428 시안 시각의 3 시간 뒤). 흑점 19 개 · 플레어 1 개 (상승 중). */
const JD_GOLDEN = 2_456_748.625;

function snapshot(list: SunFlareList, n: number): number[][] {
  const rows: number[][] = [];
  for (let i = 0; i < n; i++) {
    rows.push([
      list.latDeg[i]!,
      list.lonDeg[i]!,
      list.strength[i]!,
      list.onsetJd[i]!,
      list.idSlot[i]!,
      list.idGroup[i]!,
      list.flareSlot[i]!,
    ]);
  }
  return rows;
}

function flaresAt(jd: number, spots = createHeliographicSpots(), out = createSunFlareList()) {
  const spotCount = generateHeliographicSunspots(jd, spots);
  const n = generateSunFlares(jd, spots, spotCount, out);
  return { n, out, spots, spotCount };
}

/** 합성 흑점 목록 — 군 1 개 (단극) 를 원하는 면적 · 위치 · id 로. */
function syntheticGroup(
  areaMsh: number,
  idSlot = 5000,
  latDeg = 12,
  lonDeg = 40,
): HeliographicSpots {
  const s = createHeliographicSpots();
  s.latDeg[0] = latDeg;
  s.lonDeg[0] = lonDeg;
  s.areaMsh[0] = areaMsh;
  s.radiusRad[0] = Math.sqrt(2e-6 * areaMsh);
  s.idSlot[0] = idSlot;
  s.idGroup[0] = 0;
  s.idPart[0] = 0;
  return s;
}

describe('#1428 플레어 — 상수 (결정 3 · 4 · 합의 3 · 7)', () => {
  it('MAX_SUN_FLARES = 4 · 상승 15 분 · 감쇠 45 분 · 계수 c = 1/(2 · 15 분) = 48 /일', () => {
    expect(MAX_SUN_FLARES).toBe(4);
    expect(FLARE_RISE_DAYS * 1440).toBeCloseTo(15, 12);
    expect(FLARE_DECAY_EFOLD_DAYS * 1440).toBeCloseTo(45, 12);
    expect(FLARE_CYCLES_PER_DAY).toBeCloseTo(48, 12);
    expect(createSunFlareList().latDeg.length).toBe(MAX_SUN_FLARES);
  });

  it('지속 시간 = 상승 + 꼬리 (15 + 4 × 45 분) · lookback = ⌈지속 시간⌉ = 1 일', () => {
    expect(FLARE_DURATION_MAX_DAYS * 1440).toBeCloseTo(15 + FLARE_DECAY_CUTOFF_EFOLDS * 45, 9);
    expect(FLARE_SLOT_LOOKBACK_DAYS).toBe(Math.ceil(FLARE_DURATION_MAX_DAYS));
    expect(FLARE_SLOT_LOOKBACK_DAYS).toBe(1);
  });
});

describe('#1428 플레어 — 광도 곡선 (결정 4)', () => {
  it('POC 값 — τ = −10 · 0 · +5 · +15 · +45 · +105 분 → 0 · 0 · 0.26 · 1 · 0.50 · 0.12', () => {
    expect(sunFlareLightCurve(-10 * MIN)).toBe(0);
    expect(sunFlareLightCurve(0)).toBe(0);
    expect(sunFlareLightCurve(5 * MIN)).toBeCloseTo(0.2593, 4); // smoothstep(1/3)
    expect(sunFlareLightCurve(FLARE_RISE_DAYS)).toBe(1);
    // 꼬리를 0 으로 내린 지수 — 순수 지수 (POC 0.51 · 0.14) 와의 차는 e_cut = exp(−4) 이하.
    const cut = Math.exp(-FLARE_DECAY_CUTOFF_EFOLDS);
    for (const [tMin, pure] of [
      [45, Math.exp(-30 / 45)],
      [105, Math.exp(-90 / 45)],
    ] as const) {
      const v = sunFlareLightCurve(tMin * MIN);
      expect(Math.abs(v - pure)).toBeLessThanOrEqual(cut);
    }
  });

  it('상승은 단조 증가 · 감쇠는 단조 감소 · 지속 시간 끝에서 0 으로 연속 (계단 없음)', () => {
    let prev = -1;
    for (let t = 0; t <= FLARE_RISE_DAYS; t += 0.25 * MIN) {
      const v = sunFlareLightCurve(t);
      expect(v).toBeGreaterThanOrEqual(prev);
      prev = v;
    }
    prev = 2;
    for (let t = FLARE_RISE_DAYS; t < FLARE_DURATION_MAX_DAYS; t += 0.25 * MIN) {
      const v = sunFlareLightCurve(t);
      expect(v).toBeLessThanOrEqual(prev);
      prev = v;
    }
    expect(sunFlareLightCurve(FLARE_DURATION_MAX_DAYS - 1e-9)).toBeLessThan(1e-6);
    expect(sunFlareLightCurve(FLARE_DURATION_MAX_DAYS)).toBe(0);
  });

  it('비유한 → 0', () => {
    expect(sunFlareLightCurve(Number.NaN)).toBe(0);
    expect(sunFlareLightCurve(Number.POSITIVE_INFINITY)).toBe(0);
  });
});

describe('#1428 플레어 — 진입부 jd 가드 (합의 8)', () => {
  it('비유한 · 범위 밖 jd → 0 개 · 출력 버퍼 무변경', () => {
    const spots = createHeliographicSpots();
    const spotCount = generateHeliographicSunspots(JD_GOLDEN, spots);
    expect(spotCount).toBeGreaterThan(0);
    for (const jd of [
      Number.NaN,
      Number.POSITIVE_INFINITY,
      Number.NEGATIVE_INFINITY,
      J2000 + SUNSPOT_JD_RANGE_DAYS + 1,
      J2000 - SUNSPOT_JD_RANGE_DAYS - 1,
    ]) {
      const out = createSunFlareList();
      out.latDeg.fill(7);
      out.strength.fill(7);
      out.idSlot.fill(7);
      expect(generateSunFlares(jd, spots, spotCount, out)).toBe(0);
      expect(lastSunFlareCandidateCount()).toBe(0);
      expect(Array.from(out.latDeg)).toEqual([7, 7, 7, 7]);
      expect(Array.from(out.strength)).toEqual([7, 7, 7, 7]);
      expect(Array.from(out.idSlot)).toEqual([7, 7, 7, 7]);
    }
  });

  it('흑점 0 개 → 플레어 0 개', () => {
    expect(generateSunFlares(JD_GOLDEN, createHeliographicSpots(), 0, createSunFlareList())).toBe(
      0,
    );
  });
});

describe('#1428 플레어 — 결정성 (D3)', () => {
  it('골든 값 — 2014-04-01 03:00 UT: 흑점 19 개 · 플레어 1 개 (상승 13 분째)', () => {
    const { n, out, spotCount } = flaresAt(JD_GOLDEN);
    expect(spotCount).toBe(19);
    expect(n).toBe(1);
    expect(out.latDeg[0]).toBeCloseTo(-21.17200337172955, 12);
    expect(out.lonDeg[0]).toBeCloseTo(570.8090387655325, 10);
    expect(out.strength[0]).toBeCloseTo(0.9568776767092152, 12);
    expect(out.onsetJd[0]).toBeCloseTo(2456748.6158878524, 9);
    expect([out.idSlot[0], out.idGroup[0], out.flareSlot[0]]).toEqual([5188, 0, 5203]);
  });

  it('골든 값 — 2014-04-01 15:21.6 UT: 플레어 2 개 (서로 다른 군 · 하나는 꼬리)', () => {
    const { n, out } = flaresAt(2_456_749.14);
    expect(n).toBe(2);
    expect([out.idSlot[0], out.idGroup[0], out.flareSlot[0]]).toEqual([5188, 0, 5204]);
    expect(out.strength[0]).toBeCloseTo(0.07264769251899711, 12);
    expect([out.idSlot[1], out.idGroup[1], out.flareSlot[1]]).toEqual([5203, 0, 5204]);
    expect(out.strength[1]).toBeCloseTo(0.9632302227260993, 12);
  });

  it('같은 jd → 같은 목록 (다른 jd 를 사이에 두고 다시 불러도)', () => {
    const a = flaresAt(JD_GOLDEN);
    const first = snapshot(a.out, a.n);
    flaresAt(JD_GOLDEN + 123.4);
    flaresAt(JD_GOLDEN - 4000);
    const b = flaresAt(JD_GOLDEN);
    expect(snapshot(b.out, b.n)).toEqual(first);
  });
});

describe('#1428 플레어 — 흑점 공유 계약 (합의 4)', () => {
  it('흑점 생성기를 부르지 않는다 — 플레어 호출 전후 흑점 생성기의 마지막 후보 수가 그대로', () => {
    const spotsA = createHeliographicSpots();
    const nA = generateHeliographicSunspots(JD_GOLDEN, spotsA);
    const countA = lastSunspotCandidateCount();
    // 후보 수가 다른 jd (극소) 의 흑점을 하나 더 만들어 두고, 다시 A 의 상태로 돌린다.
    const spotsMin = createHeliographicSpots();
    generateHeliographicSunspots(2_458_832.5, spotsMin);
    expect(lastSunspotCandidateCount()).not.toBe(countA);
    generateHeliographicSunspots(JD_GOLDEN, spotsA);
    // 플레어 생성기를 다른 jd 로 불러도 흑점 생성기 상태가 바뀌지 않는다 (내부에서 흑점을 다시 만들지 않는다).
    generateSunFlares(2_458_832.5, spotsA, nA, createSunFlareList());
    expect(lastSunspotCandidateCount()).toBe(countA);
  });

  it('받은 목록만 쓴다 — 합성 군 1 개면 플레어 자리는 그 군 자리', () => {
    // 면적 600 MSH = 확률 1 → 매 슬롯 발생 (게이트 경계 r > 1 − W 만 부분 세기).
    const spots = syntheticGroup(600, 5000, 12, 40);
    const out = createSunFlareList();
    let found = 0;
    for (let jd = J2000 + 5001; jd < J2000 + 5011; jd += 5 * MIN) {
      const n = generateSunFlares(jd, spots, 1, out);
      for (let i = 0; i < n; i++) {
        expect(out.latDeg[i]).toBe(12);
        expect(out.lonDeg[i]).toBe(40);
        expect(out.idSlot[i]).toBe(5000);
        found++;
      }
    }
    expect(found).toBeGreaterThan(0);
  });

  it('양극 군 — 위치는 두 성분의 현재 면적 가중 중심, 군 1 개 = 플레어 자리 1 개', () => {
    const spots = createHeliographicSpots();
    const parts = [
      { lat: 10, lon: 30, area: 360 },
      { lat: 12, lon: 36, area: 240 },
    ];
    parts.forEach((p, k) => {
      spots.latDeg[k] = p.lat;
      spots.lonDeg[k] = p.lon;
      spots.areaMsh[k] = p.area;
      spots.idSlot[k] = 5000;
      spots.idGroup[k] = 3;
      spots.idPart[k] = k;
    });
    const out = createSunFlareList();
    let checked = 0;
    for (let jd = J2000 + 5001; jd < J2000 + 5006; jd += 5 * MIN) {
      const n = generateSunFlares(jd, spots, 2, out);
      expect(n).toBeLessThanOrEqual(1 + FLARE_SLOT_LOOKBACK_DAYS);
      for (let i = 0; i < n; i++) {
        expect(out.latDeg[i]).toBeCloseTo((10 * 360 + 12 * 240) / 600, 12);
        expect(out.lonDeg[i]).toBeCloseTo((30 * 360 + 36 * 240) / 600, 12);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('#1428 플레어 — 발생률 (결정 4 · §교차검증 이견 2)', () => {
  /** 합성 군의 슬롯 N 개 중 발생 (게이트 > 0) 한 슬롯 비율 — 각 슬롯의 발생 시각 + 정점 시각에서 본다. */
  function occurrenceRate(areaMsh: number, slots: number): number {
    const spots = syntheticGroup(areaMsh, 0);
    const out = createSunFlareList();
    const seen = new Set<number>();
    for (let s = 1; s <= slots; s++) {
      // 하루를 30 분 간격으로 훑는다 (지속 3.25 시간이라 발생을 놓치지 않는다).
      for (let k = 0; k < 48; k++) {
        const n = generateSunFlares(J2000 + s + k / 48, spots, 1, out);
        for (let i = 0; i < n; i++) seen.add(out.flareSlot[i]!);
      }
    }
    // 마지막 슬롯 다음날로 넘어간 발생은 세지 않는다.
    let count = 0;
    for (const slot of seen) if (slot >= 1 && slot <= slots) count++;
    return count / slots;
  }

  it('군 면적 비례 — 60 · 150 · 300 MSH 의 슬롯당 발생 비율 ≈ A × k (k = 1/600)', () => {
    expect(FLARE_PROBABILITY_PER_MSH).toBeCloseTo(1 / 600, 15);
    for (const area of [60, 150, 300]) {
      const rate = occurrenceRate(area, 2000);
      // 이항 표준편차 √(p(1−p)/2000) ≤ 0.0112 — 4σ 안.
      expect(Math.abs(rate - area * FLARE_PROBABILITY_PER_MSH)).toBeLessThan(0.045);
    }
    expect(occurrenceRate(0, 200)).toBe(0);
  });

  it('같은 군은 일 슬롯당 최대 1 회 — 한 jd 의 목록에서 (군, 슬롯) 이 겹치지 않는다', () => {
    const spots = createHeliographicSpots();
    const out = createSunFlareList();
    for (let jd = 2_456_658.5; jd < 2_456_688.5; jd += 10 * MIN) {
      const spotCount = generateHeliographicSunspots(jd, spots);
      const n = generateSunFlares(jd, spots, spotCount, out);
      const keys = new Set<string>();
      for (let i = 0; i < n; i++)
        keys.add(`${out.idSlot[i]}:${out.idGroup[i]}:${out.flareSlot[i]}`);
      expect(keys.size).toBe(n);
    }
  });

  it('면적 게이트 — p − r ≤ 0 이면 0, p − r ≥ W 이면 1, 사이는 단조', () => {
    expect(sunFlareAreaGate(60, 0.1)).toBe(0); // p = 0.1
    expect(sunFlareAreaGate(60, 0.1 - FLARE_GATE_WIDTH)).toBeCloseTo(1, 12);
    expect(sunFlareAreaGate(6000, 0.5)).toBe(1); // p 상한 1
    let prev = -1;
    for (let a = 50; a <= 80; a += 0.5) {
      const g = sunFlareAreaGate(a, 0.1);
      expect(g).toBeGreaterThanOrEqual(prev);
      prev = g;
    }
  });

  it('상한 절단 — 후보가 4 개를 넘으면 세기 큰 순으로 4 개', () => {
    // 같은 자리 · 면적 600 의 군 6 개를 합성 — 모두 같은 jd 에 활성일 때를 찾는다.
    const spots = createHeliographicSpots();
    for (let g = 0; g < 24; g++) {
      spots.latDeg[g] = 10;
      spots.lonDeg[g] = 10 * g;
      spots.areaMsh[g] = 600;
      spots.idSlot[g] = 5000;
      spots.idGroup[g] = g;
      spots.idPart[g] = 0;
    }
    const out = createSunFlareList();
    let tested = false;
    for (let jd = J2000 + 5001; jd < J2000 + 5011 && !tested; jd += 2 * MIN) {
      const n = generateSunFlares(jd, spots, 24, out);
      const uncapped = lastSunFlareCandidateCount();
      if (uncapped <= MAX_SUN_FLARES) continue;
      expect(n).toBe(MAX_SUN_FLARES);
      // 절단 전 전체 세기를 1 개 군씩 다시 구해 상위 4 개와 비교한다.
      const all: number[] = [];
      const one = createSunFlareList(8);
      for (let g = 0; g < 24; g++) {
        const solo = createHeliographicSpots();
        solo.latDeg[0] = 10;
        solo.lonDeg[0] = 10 * g;
        solo.areaMsh[0] = 600;
        solo.idSlot[0] = 5000;
        solo.idGroup[0] = g;
        const k = generateSunFlares(jd, solo, 1, one);
        for (let i = 0; i < k; i++) all.push(one.strength[i]!);
      }
      expect(all.length).toBe(uncapped);
      all.sort((a, b) => b - a);
      const kept = Array.from(out.strength.slice(0, n)).sort((a, b) => b - a);
      expect(kept).toEqual(all.slice(0, MAX_SUN_FLARES));
      tested = true;
    }
    expect(tested).toBe(true);
  });
});

describe('#1428 플레어 — 연속성 · 자정 경계 (합의 3 · 결정 3)', () => {
  it('2014-01-01 부터 10 일, 1 분 간격 — 세기 변화 ≤ 광도 곡선 최대 기울기 × 1.2 · 자정을 넘는 플레어가 이어진다', () => {
    // smoothstep 최대 기울기 1.5 / 상승 시간 → 1 분에 0.1 [계산]. 면적 게이트가 곱해져 조금 더 빨라질 수 있어 20 % 여유.
    const bound = (1.5 / (FLARE_RISE_DAYS * 1440)) * 1.2;
    const spots = createHeliographicSpots();
    const out = createSunFlareList();
    let prev = new Map<string, number>();
    let crossedMidnight = 0;
    let maxStep = 0;
    for (let k = 0; k <= 10 * 1440; k++) {
      const jd = 2_456_658.5 + k * MIN;
      const spotCount = generateHeliographicSunspots(jd, spots);
      const n = generateSunFlares(jd, spots, spotCount, out);
      const cur = new Map<string, number>();
      const today = Math.floor(jd - J2000);
      for (let i = 0; i < n; i++) {
        const key = `${out.idSlot[i]}:${out.idGroup[i]}:${out.flareSlot[i]}`;
        cur.set(key, out.strength[i]!);
        if (out.flareSlot[i]! < today && prev.has(key)) crossedMidnight++;
      }
      if (k > 0) {
        for (const key of new Set([...prev.keys(), ...cur.keys()])) {
          const step = Math.abs((cur.get(key) ?? 0) - (prev.get(key) ?? 0));
          maxStep = Math.max(maxStep, step);
        }
      }
      prev = cur;
    }
    expect(maxStep).toBeLessThanOrEqual(bound);
    expect(crossedMidnight).toBeGreaterThan(0);
  });

  it('면적이 자라는 군 (100 MSH/일) 48 개 × 6 일, 1 분 간격 — 면적이 판정 문턱을 지나도 진행 중 플레어가 튀지 않는다', () => {
    // 100 MSH/일 = 흑점 생성기의 성장 구간 면적 증가율 (최대 면적 / (수명 10 % · 수명 = 최대 면적 / 10 MSH/일)) [계산].
    // 확률 p = A/600 이 6 일에 0 → 1 로 지나가므로 군마다 판정 문턱 r 을 한 번 지난다. 계단 판정이면 그 순간이 플레어 진행 중일 때
    // 세기가 곡선 중간값으로 튄다 — 게이트가 그 전이를 연속으로 만드는지 본다.
    const growthPerDay = 100;
    const bound = (1.5 / (FLARE_RISE_DAYS * 1440)) * 1.2;
    const out = createSunFlareList();
    let maxStep = 0;
    let observed = 0;
    for (let g = 0; g < 48; g++) {
      const spots = syntheticGroup(0, 7000 + g);
      const jd0 = J2000 + 7000 + g;
      let prev = new Map<number, number>();
      for (let k = 0; k <= 6 * 1440; k++) {
        const jd = jd0 + k * MIN;
        spots.areaMsh[0] = growthPerDay * (jd - jd0);
        const n = generateSunFlares(jd, spots, 1, out);
        const cur = new Map<number, number>();
        for (let i = 0; i < n; i++) cur.set(out.flareSlot[i]!, out.strength[i]!);
        observed += n;
        for (const key of new Set([...prev.keys(), ...cur.keys()])) {
          maxStep = Math.max(maxStep, Math.abs((cur.get(key) ?? 0) - (prev.get(key) ?? 0)));
        }
        prev = cur;
      }
    }
    expect(observed).toBeGreaterThan(0);
    expect(maxStep).toBeLessThanOrEqual(bound);
  });

  it('표본 통계 — 2014-01-01 ~ 06-30 (5 분 간격): 하루 발생 3.5 회 · 상한 절단 전 최대 5 개', () => {
    const spots = createHeliographicSpots();
    const out = createSunFlareList();
    const onsets = new Set<string>();
    let maxUncapped = 0;
    const days = 180;
    for (let jd = 2_456_658.5; jd < 2_456_658.5 + days; jd += 5 * MIN) {
      const spotCount = generateHeliographicSunspots(jd, spots);
      const n = generateSunFlares(jd, spots, spotCount, out);
      maxUncapped = Math.max(maxUncapped, lastSunFlareCandidateCount());
      for (let i = 0; i < n; i++)
        onsets.add(`${out.idSlot[i]}:${out.idGroup[i]}:${out.flareSlot[i]}`);
    }
    expect(onsets.size / days).toBeCloseTo(3.5, 1);
    expect(maxUncapped).toBe(5);
  });
});
