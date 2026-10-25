/**
 * #1412 — 태양 흑점 생성기 · 변환기 · 감쇠 단위 테스트 (ADR `docs/decisions/20261025-1412-sunspots.md` §DoD D3 · D4 · D6 · D10).
 */

import { describe, expect, it } from 'vitest';
import { J2000_JD } from '@astro-simulator/shared';
import { fromScene } from '../coords/scene-handedness.js';
import {
  GROUPS_PER_DAY_AT_MAX,
  MEAN_CYCLE_PERIOD_MONTHS,
  SOLAR_CYCLE_MINIMA_YM,
  SUNSPOT_AREA_MAX_MSH,
  SUNSPOT_AREA_MIN_MSH,
  SUNSPOT_JD_RANGE_DAYS,
  SUNSPOT_MAX,
  SUNSPOT_MAX_FLICKER_HZ,
  SUNSPOT_SEED_SALT,
  SUNSPOT_VISIBILITY_PERSIST_S,
  SUNSPOT_VISIBILITY_RATE_PER_S,
  SUN_AXIS_SCENE,
  SUN_EQUATOR_NODE_DATA,
  SUN_POLE_DATA,
  createHeliographicSpots,
  createSunspotVisibilityState,
  cycleShape,
  generateHeliographicSunspots,
  heliographicToScene,
  lastSunspotCandidateCount,
  selectLargestSpots,
  stepSunspotVisibility,
  sunspotEffectiveHz,
  sunspotOmegaDegPerDay,
} from './sunspots.js';

const DEG = Math.PI / 180;
/** 1900-01-01 0h · 2100-01-01 0h (UT) — 스크러버 범위 (ADR 1-G · 1-H 와 같은 표본 구간). */
const JD_1900 = 2415020.5;
const JD_2100 = 2488069.5;
/** 2014-04-01 0h — 시안 C 의 시각 (사이클 24 극대 2014/04, Hathaway 2015 Table 1). */
const JD_POC = 2456748.5;

const dot = (a: readonly number[], b: readonly number[]): number =>
  a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
const cross = (a: readonly number[], b: readonly number[]): [number, number, number] => [
  a[1]! * b[2]! - a[2]! * b[1]!,
  a[2]! * b[0]! - a[0]! * b[2]!,
  a[0]! * b[1]! - a[1]! * b[0]!,
];

describe('#1412 sunspots — 좌표 변환 (D10 · ADR 1-B 검산)', () => {
  it('태양 자전축 — 황도 법선과 7.252° · 승교점 황경 75.76° (Carrington i · Ω)', () => {
    expect(Math.acos(SUN_POLE_DATA[2]) / DEG).toBeCloseTo(7.252, 3);
    const nodeLon = Math.atan2(SUN_EQUATOR_NODE_DATA[1], SUN_EQUATOR_NODE_DATA[0]) / DEG;
    // 실측 75.766° — Carrington Ω (75.76°, 소수 둘째 자리 표기) 와 0.01° 안.
    expect(Math.abs(nodeLon - 75.76)).toBeLessThan(0.01);
  });

  it('장면 자전축 = 데이터 자전축의 S_z (z 만 반전 — #1366)', () => {
    expect(SUN_AXIS_SCENE[0]).toBe(SUN_POLE_DATA[0]);
    expect(SUN_AXIS_SCENE[1]).toBe(SUN_POLE_DATA[1]);
    expect(SUN_AXIS_SCENE[2]).toBe(-SUN_POLE_DATA[2]);
  });

  it('heliographicToScene — 단위벡터 · 내적 = sin 위도 (장면 축과) · offset 위치에만 쓴다', () => {
    const out = [9, 9, 9, 9, 9];
    heliographicToScene(23, 141, out, 1);
    expect(out[0]).toBe(9);
    expect(out[4]).toBe(9);
    const v = out.slice(1, 4);
    expect(Math.hypot(v[0]!, v[1]!, v[2]!)).toBeCloseTo(1, 12);
    expect(dot(v, SUN_AXIS_SCENE)).toBeCloseTo(Math.sin(23 * DEG), 12);
  });

  it('경도 증가 = 자전축 기준 순행 (데이터 좌표에서 오른손 — 북극에서 보아 반시계, D4)', () => {
    const a = [0, 0, 0];
    const b = [0, 0, 0];
    for (const lat of [-30, 0, 15]) {
      heliographicToScene(lat, 40, a, 0);
      heliographicToScene(lat, 41, b, 0);
      const winding = dot(
        cross(fromScene(a as [number, number, number]), fromScene(b as [number, number, number])),
        SUN_POLE_DATA,
      );
      expect(winding).toBeGreaterThan(0);
    }
  });
});

describe('#1412 sunspots — 차등 자전 (D4)', () => {
  it('Howard et al. 1984 — 적도 14.522°/일 · 위도 30° 13.812°/일 · 남북 대칭', () => {
    expect(sunspotOmegaDegPerDay(0)).toBeCloseTo(14.522, 12);
    expect(sunspotOmegaDegPerDay(30)).toBeCloseTo(13.812, 12);
    expect(sunspotOmegaDegPerDay(-30)).toBeCloseTo(sunspotOmegaDegPerDay(30), 12);
  });

  it('같은 흑점 (같은 id) 의 하루 경도 증분 = 그 위도의 ω (단극 흑점, 성장 · 감쇠 무관)', () => {
    const a = createHeliographicSpots();
    const b = createHeliographicSpots();
    const na = generateHeliographicSunspots(JD_POC, a);
    const nb = generateHeliographicSunspots(JD_POC + 1, b);
    let checked = 0;
    for (let i = 0; i < na; i++) {
      for (let k = 0; k < nb; k++) {
        if (
          a.idSlot[i] !== b.idSlot[k] ||
          a.idGroup[i] !== b.idGroup[k] ||
          a.idPart[i] !== b.idPart[k]
        )
          continue;
        // 양극 성분은 간격이 면적에 따라 변해 경도에 오프셋이 섞인다 — 위도가 같으면 (단극) 순수 자전만 남는다.
        if (a.latDeg[i] !== b.latDeg[k]) continue;
        expect(b.lonDeg[k]! - a.lonDeg[i]!).toBeCloseTo(sunspotOmegaDegPerDay(a.latDeg[i]!), 9);
        checked++;
      }
    }
    expect(checked).toBeGreaterThan(0);
  });
});

describe('#1412 sunspots — 위도 분포 · 상한 (D3)', () => {
  it('1900~2100 7.3 일 간격 — |위도| 5~35° 비율 ≥ 90 % · 최대 < 45° (표본 통계 — 필라멘트 기저 cos 위도 ≥ 0.707)', () => {
    const out = createHeliographicSpots();
    let inBand = 0;
    let total = 0;
    let maxAbsLat = 0;
    for (let jd = JD_1900; jd < JD_2100; jd += 7.3) {
      const n = generateHeliographicSunspots(jd, out);
      for (let i = 0; i < n; i++) {
        const a = Math.abs(out.latDeg[i]!);
        total++;
        if (a >= 5 && a <= 35) inBand++;
        maxAbsLat = Math.max(maxAbsLat, a);
      }
    }
    expect(total).toBeGreaterThan(0);
    expect(inBand / total).toBeGreaterThanOrEqual(0.9);
    expect(maxAbsLat).toBeLessThan(45);
    expect(Math.cos(maxAbsLat * DEG)).toBeGreaterThanOrEqual(Math.SQRT1_2);
  });

  it('1900~2100 0.5 일 간격 — 상한 절단 전 최대 활성 수 ≤ SUNSPOT_MAX (48)', () => {
    const out = createHeliographicSpots();
    let maxCount = 0;
    for (let jd = JD_1900; jd < JD_2100; jd += 0.5) {
      generateHeliographicSunspots(jd, out);
      maxCount = Math.max(maxCount, lastSunspotCandidateCount());
    }
    expect(maxCount).toBeLessThanOrEqual(SUNSPOT_MAX);
  }, 60_000);

  it('반영 각반경 (물리) 은 면적 범위 [2.3, 930] MSH 의 √(2·10⁻⁶·A) 안 · 930 MSH 는 지름 60,000 km 근처', () => {
    const out = createHeliographicSpots();
    const rMax = Math.sqrt(2e-6 * SUNSPOT_AREA_MAX_MSH);
    for (let jd = JD_POC - 400; jd < JD_POC + 400; jd += 3.1) {
      const n = generateHeliographicSunspots(jd, out);
      for (let i = 0; i < n; i++) {
        expect(out.radiusRad[i]).toBeLessThanOrEqual(rMax);
        expect(out.areaMsh[i]).toBeGreaterThan(0);
        expect(out.areaMsh[i]).toBeLessThanOrEqual(SUNSPOT_AREA_MAX_MSH);
      }
    }
    // 930 MSH → 지름 0.0862 R (= 60,000 km 근처, Solanki 2006 §6.2 상한) · 2.3 MSH → 약 3,000 km.
    expect(2 * rMax * 695_700).toBeCloseTo(60_010, -2);
    expect(2 * Math.sqrt(2e-6 * SUNSPOT_AREA_MIN_MSH) * 695_700).toBeCloseTo(2_984, -1);
  });

  it('생성기 상한 배선 — 출력 버퍼보다 많으면 그 길이까지 면적 큰 순으로 자른다 (리뷰 R4 — 상한 무시 변이 검출)', () => {
    const full = createHeliographicSpots();
    const n = generateHeliographicSunspots(JD_POC, full);
    expect(n).toBe(17);
    const areas = Array.from(full.areaMsh.subarray(0, n)).sort((a, b) => b - a);
    const small = createHeliographicSpots(10);
    expect(generateHeliographicSunspots(JD_POC, small)).toBe(10);
    expect(lastSunspotCandidateCount()).toBe(17);
    expect(Array.from(small.areaMsh)).toEqual(areas.slice(0, 10));
  });

  it('상한 절단 — 현재 면적 큰 순, 동률은 id (slot, group, part) 사전순', () => {
    const src = createHeliographicSpots(6);
    const areas = [5, 9, 9, 1, 9, 7];
    const ids: [number, number, number][] = [
      [3, 0, 0],
      [4, 1, 0],
      [4, 0, 1],
      [1, 0, 0],
      [2, 2, 0],
      [0, 0, 0],
    ];
    areas.forEach((a, i) => {
      src.areaMsh[i] = a;
      src.latDeg[i] = i;
      [src.idSlot[i], src.idGroup[i], src.idPart[i]] = ids[i]!;
    });
    const out = createHeliographicSpots(4);
    expect(selectLargestSpots(src, 6, out, 4)).toBe(4);
    // 면적 9 셋 → id 사전순 (2,2,0) < (4,0,1) < (4,1,0), 다음 7.
    expect(Array.from(out.latDeg)).toEqual([4, 2, 1, 5]);
    // 상한 이하 — 입력 순서 그대로.
    const out6 = createHeliographicSpots(6);
    expect(selectLargestSpots(src, 3, out6, 4)).toBe(3);
    expect(Array.from(out6.latDeg.subarray(0, 3))).toEqual([0, 1, 2]);
  });
});

describe('#1412 sunspots — 11년 주기 (결정 2 · Q4)', () => {
  it('극소 표 13 행 (사이클 13~25) — 첫 행 1890/03 · 마지막 2019/12 (Hathaway 2015 Table 2 + NASA·NOAA 2020)', () => {
    expect(SOLAR_CYCLE_MINIMA_YM).toHaveLength(13);
    expect(SOLAR_CYCLE_MINIMA_YM[0]).toEqual([1890, 3]);
    expect(SOLAR_CYCLE_MINIMA_YM[11]).toEqual([2008, 12]);
    expect(SOLAR_CYCLE_MINIMA_YM[12]).toEqual([2019, 12]);
  });

  it('동시 활동 사이클 ≤ 2 — 연속 두 극소 간격 합 > 220 개월 (scratch 크기 전제)', () => {
    const months = SOLAR_CYCLE_MINIMA_YM.map(([y, m]) => y * 12 + m);
    for (let i = 0; i + 2 < months.length; i++) {
      expect(months[i + 2]! - months[i]!).toBeGreaterThan(220);
    }
    expect(2 * MEAN_CYCLE_PERIOD_MONTHS).toBeGreaterThan(220);
    // 표 끝과 외삽 첫 사이클 사이도 같은 전제.
    expect(months[12]! - months[11]! + MEAN_CYCLE_PERIOD_MONTHS).toBeGreaterThan(220);
    expect(MEAN_CYCLE_PERIOD_MONTHS + months[1]! - months[0]!).toBeGreaterThan(220);
  });

  it('사이클 모양 정규화 — 최댓값 ≈ 1 (0.1 개월 격자 최댓값으로 나눈다 — 더 촘촘한 격자에서 1 + 1e-5 미만), τ ≤ 0 은 0', () => {
    let max = 0;
    for (let t = 0; t < 300; t += 0.01) max = Math.max(max, cycleShape(t));
    expect(Math.abs(max - 1)).toBeLessThan(1e-5);
    expect(cycleShape(0)).toBe(0);
    expect(cycleShape(-5)).toBe(0);
  });

  it('2008-12 (사이클 24 극소) 흑점 0 개 · 2014-04 (극대) 17 개 (POC 목록과 같은 수)', () => {
    const out = createHeliographicSpots();
    expect(generateHeliographicSunspots(2454815.5, out)).toBe(0);
    expect(generateHeliographicSunspots(JD_POC, out)).toBe(17);
  });

  it('표 밖 (1700 · 2300) 도 외삽 사이클로 흑점이 난다 (주기 없음 아님)', () => {
    const out = createHeliographicSpots();
    let seen1700 = 0;
    let seen2300 = 0;
    for (let k = 0; k < 4000; k += 10) {
      seen1700 = Math.max(seen1700, generateHeliographicSunspots(2341972.5 + k, out));
      seen2300 = Math.max(seen2300, generateHeliographicSunspots(2561117.5 + k, out));
    }
    expect(seen1700).toBeGreaterThan(0);
    expect(seen2300).toBeGreaterThan(0);
    expect(GROUPS_PER_DAY_AT_MAX).toBe(1.2);
  });
});

describe('#1412 sunspots — 결정성 · 입력 방어 (D5 · D10)', () => {
  it('해시 골든 값 — jd 2456748.5 의 첫 흑점 (시드 salt 0x1412 · 소비 순서 고정)', () => {
    expect(SUNSPOT_SEED_SALT).toBe(0x1412);
    const out = createHeliographicSpots();
    expect(generateHeliographicSunspots(JD_POC, out)).toBe(17);
    expect([out.idSlot[0], out.idGroup[0], out.idPart[0]]).toEqual([5122, 0, 0]);
    expect(out.latDeg[0]).toBeCloseTo(3.088868047055054, 10);
    expect(out.lonDeg[0]).toBeCloseTo(1253.6187697226892, 8);
    expect(out.radiusRad[0]).toBeCloseTo(0.006645529536974624, 12);
    expect(out.areaMsh[0]).toBeCloseTo(22.081531413401084, 9);
  });

  it('같은 jd → 같은 목록 (호출 사이 다른 jd 를 끼워도)', () => {
    const a = createHeliographicSpots();
    const b = createHeliographicSpots();
    const na = generateHeliographicSunspots(JD_POC + 0.37, a);
    generateHeliographicSunspots(JD_POC - 1234.5, b);
    const nb = generateHeliographicSunspots(JD_POC + 0.37, b);
    expect(nb).toBe(na);
    expect(Array.from(b.latDeg.subarray(0, nb))).toEqual(Array.from(a.latDeg.subarray(0, na)));
    expect(Array.from(b.lonDeg.subarray(0, nb))).toEqual(Array.from(a.lonDeg.subarray(0, na)));
    expect(Array.from(b.radiusRad.subarray(0, nb))).toEqual(
      Array.from(a.radiusRad.subarray(0, na)),
    );
  });

  it('흑점은 생성 · 소멸 사이 이어진다 — 0.05 일 뒤 같은 id 의 위치 이동은 작다 (팝 · 순간이동 없음)', () => {
    const a = createHeliographicSpots();
    const b = createHeliographicSpots();
    const na = generateHeliographicSunspots(JD_POC, a);
    const nb = generateHeliographicSunspots(JD_POC + 0.05, b);
    let matched = 0;
    for (let i = 0; i < na; i++) {
      for (let k = 0; k < nb; k++) {
        if (
          a.idSlot[i] !== b.idSlot[k] ||
          a.idGroup[i] !== b.idGroup[k] ||
          a.idPart[i] !== b.idPart[k]
        )
          continue;
        // 0.05 일 × 14.5°/일 ≈ 0.73° + 양극 간격 변화 — 1° 미만.
        expect(Math.abs(b.lonDeg[k]! - a.lonDeg[i]!)).toBeLessThan(1);
        expect(Math.abs(b.latDeg[k]! - a.latDeg[i]!)).toBeLessThan(0.1);
        matched++;
      }
    }
    // 0.05 일 사이 소멸 · 생성으로 몇 개 바뀔 수는 있으나 대부분 이어진다.
    expect(matched).toBeGreaterThanOrEqual(na - 2);
  });

  it('비유한 · 범위 밖 jd → 흑점 0 개', () => {
    const out = createHeliographicSpots();
    expect(generateHeliographicSunspots(Number.NaN, out)).toBe(0);
    expect(generateHeliographicSunspots(Number.POSITIVE_INFINITY, out)).toBe(0);
    expect(generateHeliographicSunspots(Number.NEGATIVE_INFINITY, out)).toBe(0);
    expect(generateHeliographicSunspots(J2000_JD + SUNSPOT_JD_RANGE_DAYS + 1, out)).toBe(0);
    expect(generateHeliographicSunspots(J2000_JD - SUNSPOT_JD_RANGE_DAYS - 1, out)).toBe(0);
    expect(lastSunspotCandidateCount()).toBe(0);
  });
});

describe('#1412 sunspots — 광과민성 감쇠 (D6 · 결정 3 · Amendment 1 창 판정)', () => {
  const FRAME_MS = 1000 / 60;
  /** 스크러버 1 step 에 해당하는 점프 크기 [일] — Radix 썸 0.25 년 양자화. */
  const QUARTER_YEAR = 365.25 / 4;

  type State = ReturnType<typeof createSunspotVisibilityState>;
  /** 시작 표본 + 정지 0.5 s (창 이력 채움). */
  function start(): { s: State; t: { jd: number; ms: number } } {
    const s = createSunspotVisibilityState();
    const t = { jd: JD_POC, ms: 1000 };
    stepSunspotVisibility(s, t.jd, t.ms);
    play(s, t, 0, 0.5);
    return { s, t };
  }
  /** 일정 배속 [일/s] 으로 `seconds` 동안 `frameMs` 간격 재생 — 가시도 이력을 반환. */
  function play(
    s: State,
    t: { jd: number; ms: number },
    daysPerSec: number,
    seconds: number,
    frameMs = FRAME_MS,
  ): number[] {
    const history: number[] = [];
    const frames = Math.round((seconds * 1000) / frameMs);
    for (let f = 0; f < frames; f++) {
      t.ms += frameMs;
      t.jd += (daysPerSec * frameMs) / 1000;
      history.push(stepSunspotVisibility(s, t.jd, t.ms));
    }
    return history;
  }
  /** `everyFrames` 프레임마다 `stepDays` 점프 (나머지 프레임은 jd 정지) — 스크러버 · 키 반복 형태. */
  function jumps(
    s: State,
    t: { jd: number; ms: number },
    stepDays: number,
    everyFrames: number,
    seconds: number,
  ): number[] {
    const history: number[] = [];
    const frames = Math.round((seconds * 1000) / FRAME_MS);
    for (let f = 1; f <= frames; f++) {
      t.ms += FRAME_MS;
      if (f % everyFrames === 0) t.jd += stepDays;
      history.push(stepSunspotVisibility(s, t.jd, t.ms));
    }
    return history;
  }

  it('프리셋 주파수 — 1M (30 일/s) 1.21 Hz · 1y (365.25 일/s) 14.73 Hz', () => {
    expect(sunspotEffectiveHz(30, 1)).toBeCloseTo(1.21, 2);
    expect(sunspotEffectiveHz(365.25, 1)).toBeCloseTo(14.73, 2);
    expect(sunspotEffectiveHz(-365.25, 1)).toBeCloseTo(14.73, 2);
    expect(SUNSPOT_MAX_FLICKER_HZ).toBe(3);
    expect(SUNSPOT_VISIBILITY_PERSIST_S).toBeCloseTo(1 / 6, 12);
    expect(SUNSPOT_VISIBILITY_RATE_PER_S).toBe(6);
  });

  it('1M 재생 — 가시도 1 유지', () => {
    const { s, t } = start();
    expect(Math.min(...play(s, t, 30, 3))).toBe(1);
  });

  it('1y 재생 — 지속 1/6 s 를 채운 뒤에만 내려가기 시작해 0 에 닿고, 변화율 ≤ 6/s', () => {
    const { s, t } = start();
    const h = play(s, t, 365.25, 2);
    const firstDrop = h.findIndex((v) => v < 1);
    expect((firstDrop + 1) * FRAME_MS).toBeGreaterThanOrEqual(
      SUNSPOT_VISIBILITY_PERSIST_S * 1000 - 1e-6,
    );
    expect(h[h.length - 1]).toBe(0);
    for (let i = 1; i < h.length; i++) {
      expect(Math.abs(h[i]! - h[i - 1]!)).toBeLessThanOrEqual(
        SUNSPOT_VISIBILITY_RATE_PER_S * (FRAME_MS / 1000) + 1e-12,
      );
    }
  });

  it('단발 점프 (10,000 일) — 점프 프레임 길이와 무관하게 가시도 불변 (리뷰 B2: 170 ms 이상 프레임에서 0 이던 결함)', () => {
    for (const jumpFrameMs of [FRAME_MS, 100, 170, 200, 250, 500, 2000]) {
      const { s, t } = start();
      play(s, t, 1, 1); // 1 d/s 재생 중
      t.ms += jumpFrameMs;
      t.jd += 10_000;
      expect(stepSunspotVisibility(s, t.jd, t.ms), `점프 프레임 ${jumpFrameMs} ms`).toBe(1);
      expect(Math.min(...play(s, t, 1, 1)), `점프 프레임 ${jumpFrameMs} ms 뒤 1 s`).toBe(1);
    }
  });

  it('스크러버 형태 — 0.25 년 점프가 3 프레임마다 (20 회/s) 오면 감쇠한다 (리뷰 B1 · 종전 알려진 한계 해소)', () => {
    const { s, t } = start();
    const h = jumps(s, t, QUARTER_YEAR, 3, 1.5);
    expect(h[h.length - 1]).toBe(0);
    // 변화율 제한은 그대로.
    for (let i = 1; i < h.length; i++) {
      expect(Math.abs(h[i]! - h[i - 1]!)).toBeLessThanOrEqual(
        SUNSPOT_VISIBILITY_RATE_PER_S * (FRAME_MS / 1000) + 1e-12,
      );
    }
  });

  it('프레임마다 정지 · 2 배속을 번갈아도 (평균 14.7 Hz) 감쇠한다 — 창 평균이 정지 프레임을 묶는다', () => {
    const { s, t } = start();
    let last = 1;
    for (let f = 0; f < 120; f++) {
      t.ms += FRAME_MS;
      if (f % 2 === 0) t.jd += (365.25 * 2 * FRAME_MS) / 1000;
      last = stepSunspotVisibility(s, t.jd, t.ms);
    }
    expect(last).toBe(0);
  });

  it('점프 열의 경계 — 간격 150 ms (9 프레임) 는 감쇠, 200 ms (12 프레임) 는 불변 (창 1/6 s = 10 프레임)', () => {
    // 창 길이와 같은 10 프레임 · 한 프레임 넘는 11 프레임 간격은 표본 시각의 부동소수 반올림이 창 경계를 정해 어느 쪽도
    // 계약으로 단언하지 않는다 (프레임 양자화 — 창 끝 표본이 「빠름」 이면 다음 점프와 이어진다).
    const fast = start();
    expect(jumps(fast.s, fast.t, QUARTER_YEAR, 9, 2).at(-1)).toBe(0);
    const slow = start();
    expect(Math.min(...jumps(slow.s, slow.t, QUARTER_YEAR, 12, 2))).toBe(1);
  });

  it('1y 재생 후 일시정지 — 1 로 복귀 (창 비움 1/6 s + 지속 1/6 s 뒤에 오르기 시작)', () => {
    const { s, t } = start();
    play(s, t, 365.25, 2);
    expect(s.visibility).toBe(0);
    const h = play(s, t, 0, 1);
    expect(h[h.length - 1]).toBe(1);
    const firstRise = h.findIndex((v) => v > 0);
    expect((firstRise + 1) * FRAME_MS).toBeGreaterThanOrEqual(
      2 * SUNSPOT_VISIBILITY_PERSIST_S * 1000 - 1e-6,
    );
  });

  it('같은 프레임 2회 호출 — 1y 감쇠 결과가 1회 호출과 같다 (창 평균은 같은 jd 표본 추가에 불변)', () => {
    const once = start();
    const twice = start();
    let minOnce = 1;
    let minTwice = 1;
    for (let f = 0; f < 120; f++) {
      for (const st of [once, twice]) {
        st.t.ms += FRAME_MS;
        st.t.jd += (365.25 * FRAME_MS) / 1000;
      }
      minOnce = Math.min(minOnce, stepSunspotVisibility(once.s, once.t.jd, once.t.ms));
      minTwice = Math.min(minTwice, stepSunspotVisibility(twice.s, twice.t.jd, twice.t.ms));
      minTwice = Math.min(minTwice, stepSunspotVisibility(twice.s, twice.t.jd, twice.t.ms + 0.1));
    }
    expect(minOnce).toBe(0);
    expect(minTwice).toBe(0);
  });

  it('표본 이력보다 빠른 프레임률 (1 kHz) — 1y 는 감쇠, 단발 점프는 불변', () => {
    const a = start();
    expect(play(a.s, a.t, 365.25, 1, 1).at(-1)).toBe(0);
    const b = start();
    play(b.s, b.t, 0, 0.5, 1);
    b.t.ms += 1;
    b.t.jd += 10_000;
    stepSunspotVisibility(b.s, b.t.jd, b.t.ms);
    expect(Math.min(...play(b.s, b.t, 0, 1, 1))).toBe(1);
  });

  it('같은 시각 재호출 (Δt ≤ 0) 은 버린다 — 표본 수 · 판정 · 가시도 불변', () => {
    const { s, t } = start();
    play(s, t, 365.25, 0.1);
    const before = {
      count: s.count,
      head: s.head,
      fast: s.fast,
      target: s.target,
      visibility: s.visibility,
    };
    stepSunspotVisibility(s, t.jd + 5, t.ms);
    stepSunspotVisibility(s, t.jd + 5, t.ms - 3);
    expect({
      count: s.count,
      head: s.head,
      fast: s.fast,
      target: s.target,
      visibility: s.visibility,
    }).toEqual(before);
  });
});
