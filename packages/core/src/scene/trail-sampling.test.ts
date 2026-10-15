/**
 * #1341 — trail 샘플러 단위 테스트 (ADR `20261015-1341-trail-ruler.md` 결정 T1 · T2 · T9, DoD D1 · D2 · D3).
 *
 *  - D1 샘플 정합: 점 k 가 `positionAt(t_k)` 와 일치 (`t_k` = `M(E_k)` 역산 시각), 꼬리 = `jd − s·W`.
 *    35 천체 × 시각 (과거 · J2000 · 미래 + 꼬리 창이 근일점 M = 0 을 가로지르는 시각 — §교차검증 합의 3) × 방향 2.
 *
 *    ⚠️ 측정 방법 (DoD D1 재조정 — 한계 `1e-9` 는 그대로, `t_k` 의 **표현**만 바꿨다. **사용자 수용 2026-10-15**).
 *    `t_k` 를 JD float 로 되돌려 `positionAt` 에 넣으면 JD 2.4e6 부근의 표현 간격 (`2⁻³¹ 일 ≈ 4.0e-5 s`) 이 위치 오차
 *    `≈ n · δt` 로 들어온다. 공전주기가 짧을수록 커진다.
 *    실측 술어 (2026-10-15): 역산 식 `t_k = epoch + (M_k − M₀) / n / 86400` (궤도 요소 epoch 기준, `M_k = E_k − e·sin E_k`),
 *    시각 3 (J2000 − 36525 · J2000 · J2000 + 36525) × 방향 2 × 전 정점의 상대오차 최댓값. 포보스 (P 7.7 h) `4.771e-9` ·
 *    프로테우스 `1.349e-9` · 데이모스 `1.196e-9` · 엔셀라두스 `1.100e-9` 가 `1e-9` 를 넘고, 나머지 31 천체는 `≤ 8.543e-10`
 *    (이오). 머리 시각 기준 역산 `t_k = jd + (M_k − M(jd)) / n / 86400` 로 재면 값이 2 ~ 5 % 달라지지만 (포보스
 *    `4.661e-9` · 이오 `8.379e-10` — PR #1343 리뷰 재현) 「4 천체 초과」 는 두 식이 같다.
 *    이것은 샘플러가 아니라 **기준 함수 입력의 표현 한계**다 — 같은 점을 평균 근점각 `M_k` 로 직접 넣은 `positionAt`
 *    (epoch = 그 시각으로 둔 요소) 과는 전 천체 `≤ 8.767e-11` (포보스) 이다. 그래서 중간 점은 `M_k` 로 시각을 표현한
 *    `positionAt` 과 대조하고, 시각 ↔ M 대응은 **머리** (같은 JD 를 직접 넣어 대조) 와 **꼬리** (`M(E_t) = M(jd) − s·2π·f`) 에서
 *    따로 단언한다.
 *  - D2 머리 = 메시 world: 머리 정점 입력이 `headWorld` 와 같은 값 (`===`).
 *  - D3 무상태: 임의 호출 열 뒤 출력 = 같은 `jd` 단독 호출 출력 (바이트 동일).
 */
import fs from 'node:fs';
import path from 'node:path';
import { describe, expect, it } from 'vitest';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { orbitMu, positionAt } from '../physics/kepler.js';
import { R_PHASE_BODY_ALLOWLIST } from './r-phase-allowlist.js';
import {
  HIGH_ECCENTRICITY_THRESHOLD,
  TRAIL_ORBIT_FRACTION,
  TRAIL_SEGMENTS,
  TRAIL_SEGMENTS_HIGH_ECCENTRICITY,
  continuousEccentricAnomaly,
  createTrailBodySpecs,
  sampleTrailLocal,
  sampleTrailWorld,
  trailEccentricAnomalyRange,
  trailMeanAnomalyAt,
  trailVertexCount,
  type TrailBodySpec,
  type TrailDirection,
} from './trail-sampling.js';

const SECONDS_PER_DAY = 86_400;
const TWO_PI = Math.PI * 2;
const J2000 = 2_451_545.0;
/** 과거 · J2000 · 미래 (DoD D1 시각 3종). */
const BASE_TIMES = [J2000 - 36_525, J2000, J2000 + 36_525] as const;
const DIRECTIONS: readonly TrailDirection[] = [1, -1];
/** DoD D1 상대오차 한계. */
const D1_REL_TOL = 1e-9;

const system = getSolarSystem();
const bodiesById = new Map(system.bodies.map((b) => [b.id, b] as const));
const specs = createTrailBodySpecs(system.bodies, R_PHASE_BODY_ALLOWLIST);

function muOf(spec: TrailBodySpec): number {
  const body = bodiesById.get(spec.id)!;
  return orbitMu(body, bodiesById.get(spec.parentId)!);
}

/**
 * 근일점 통과 시각 (M = 2πk) 하나 — J2000 근처. 창이 그 시각을 가로지르도록 머리 시각을 잡는다:
 * s = +1 이면 창 [jd − W, jd] 이므로 jd = t_p + W/2, s = −1 이면 창 [jd, jd + W] 이므로 jd = t_p − W/2.
 */
function perihelionCrossingTime(spec: TrailBodySpec, direction: TrailDirection): number {
  const m0 = trailMeanAnomalyAt(spec, J2000);
  const k = Math.round(m0 / TWO_PI);
  const tp = J2000 + (k * TWO_PI - m0) / spec.meanMotion / SECONDS_PER_DAY;
  const windowDays = (TRAIL_ORBIT_FRACTION * TWO_PI) / spec.meanMotion / SECONDS_PER_DAY;
  return tp + (direction * windowDays) / 2;
}

describe('#1341 trail 대상 집합 (결정 T9)', () => {
  it('궤도선과 같은 집합 = allowlist ∩ 궤도 보유 — 35 천체, 정점 1,955', () => {
    const expected = system.bodies
      .filter((b) => b.orbit && b.parentId && R_PHASE_BODY_ALLOWLIST.includes(b.id))
      .map((b) => b.id);
    expect(specs.map((s) => s.id)).toEqual(expected);
    expect(specs).toHaveLength(35);
    expect(specs.some((s) => s.id === 'sun')).toBe(false);
    expect(trailVertexCount(specs)).toBe(1_955);
  });

  it('고이심률 임계 = 궤도선 (`orbit-sampling.ts`) 의 임계 — 숨은 상수 drift 가드', () => {
    const source = fs.readFileSync(path.join(__dirname, 'orbit-sampling.ts'), 'utf-8');
    const m = source.match(/orbit\.eccentricity\s*>=\s*([0-9.]+)\s*\?/);
    expect(m).not.toBeNull();
    expect(Number(m![1])).toBe(HIGH_ECCENTRICITY_THRESHOLD);
  });

  it('선분 수 — e ≥ 0.6 은 128, 그 외 48 (궤도선 고이심률 예외와 같은 임계)', () => {
    for (const s of specs) {
      expect(s.segments).toBe(
        s.eccentricity >= HIGH_ECCENTRICITY_THRESHOLD
          ? TRAIL_SEGMENTS_HIGH_ECCENTRICITY
          : TRAIL_SEGMENTS,
      );
    }
    // 데이터 전제 — 고이심률 3 (혜성) 이 실제로 있다 (공허 통과 방지).
    expect(specs.filter((s) => s.segments === TRAIL_SEGMENTS_HIGH_ECCENTRICITY)).toHaveLength(3);
  });
});

describe('#1341 D1 — 샘플 정합 (positionAt(t_k) 대조)', () => {
  /** 한 시각 · 한 방향의 최대 상대오차 + 꼬리 M 오차. */
  function check(spec: TrailBodySpec, jd: number, direction: TrailDirection) {
    const mu = muOf(spec);
    const out = new Float64Array(3 * (spec.segments + 1));
    sampleTrailLocal(spec, jd, direction, TRAIL_ORBIT_FRACTION, out, 0);
    const { head, tail } = trailEccentricAnomalyRange(spec, jd, direction, TRAIL_ORBIT_FRACTION);
    let maxRel = 0;
    for (let k = 0; k <= spec.segments; k += 1) {
      const E = head + ((tail - head) * k) / spec.segments;
      // 시각 t_k 를 평균 근점각 M_k 로 표현 — epoch = t_k 로 둔 요소에 같은 t_k 를 넣는다 (dt = 0, JD 반올림 없음).
      const mK = E - spec.eccentricity * Math.sin(E);
      const orbit = bodiesById.get(spec.id)!.orbit!;
      const ref = positionAt({ ...orbit, meanAnomalyAtEpoch: mK, epoch: J2000 }, J2000, mu);
      const d = Math.hypot(
        out[3 * k]! - ref[0],
        out[3 * k + 1]! - ref[1],
        out[3 * k + 2]! - ref[2],
      );
      maxRel = Math.max(maxRel, d / Math.hypot(ref[0], ref[1], ref[2]));
    }
    // 머리 = positionAt(jd) 그대로 (역산 시각을 거치지 않는 직접 대조).
    const headRef = positionAt(bodiesById.get(spec.id)!.orbit!, jd, mu);
    const headRel =
      Math.hypot(out[0]! - headRef[0], out[1]! - headRef[1], out[2]! - headRef[2]) /
      Math.hypot(headRef[0], headRef[1], headRef[2]);
    // 꼬리 = jd − s·W — 평균 근점각 공간에서 대조 (`M(E_t) = M(jd) − s·2π·f`).
    const mTail = tail - spec.eccentricity * Math.sin(tail);
    const mExpected = trailMeanAnomalyAt(spec, jd) - direction * TWO_PI * TRAIL_ORBIT_FRACTION;
    const tailMErr = Math.abs(mTail - mExpected) / (TWO_PI * TRAIL_ORBIT_FRACTION);
    return { maxRel, headRel, tailMErr, head, tail };
  }

  it('35 천체 × 시각 (과거 · J2000 · 미래 · 근일점 가로지름) × 방향 2 — 상대오차 ≤ 1e-9', () => {
    let worst = { id: '', rel: 0 };
    let cases = 0;
    for (const spec of specs) {
      for (const direction of DIRECTIONS) {
        const times = [...BASE_TIMES, perihelionCrossingTime(spec, direction)];
        for (const jd of times) {
          const r = check(spec, jd, direction);
          expect(r.maxRel, `${spec.id} jd=${jd} s=${direction}`).toBeLessThanOrEqual(D1_REL_TOL);
          expect(r.headRel, `${spec.id} head`).toBeLessThanOrEqual(D1_REL_TOL);
          expect(r.tailMErr, `${spec.id} tail`).toBeLessThanOrEqual(D1_REL_TOL);
          if (r.maxRel > worst.rel) worst = { id: spec.id, rel: r.maxRel };
          cases += 1;
        }
      }
    }
    expect(cases).toBe(35 * 2 * 4);
    // 최댓값은 기록만 한다 (회귀 시 비교용 — 판정은 위 한계).
    expect(worst.rel).toBeGreaterThan(0);
  });

  it('근일점 가로지름 시각 — 창 안에 M = 2πk 가 실제로 있고, 방향 부호대로 꼬리가 놓인다 (전제 단언)', () => {
    for (const spec of specs) {
      for (const direction of DIRECTIONS) {
        const jd = perihelionCrossingTime(spec, direction);
        const { head, tail } = trailEccentricAnomalyRange(
          spec,
          jd,
          direction,
          TRAIL_ORBIT_FRACTION,
        );
        // E 연속값 — 근일점 (E = 2πk) 을 사이에 둔다.
        const k = Math.round(head / TWO_PI);
        const pe = k * TWO_PI;
        expect((head - pe) * (tail - pe), `${spec.id} s=${direction}`).toBeLessThan(0);
        // s = +1 이면 꼬리가 과거 (E 감소), s = −1 이면 미래 (E 증가).
        expect(Math.sign(tail - head)).toBe(-direction);
      }
    }
  });

  it('펼친 E 는 M 에 대해 연속 · 단조 — 2π 경계에서 되감기지 않는다', () => {
    const e = 0.967; // 핼리 수준 이심률
    let prev = continuousEccentricAnomaly(-3 * TWO_PI, e);
    for (let m = -3 * TWO_PI + 0.01; m <= 3 * TWO_PI; m += 0.01) {
      const E = continuousEccentricAnomaly(m, e);
      expect(E).toBeGreaterThan(prev);
      prev = E;
    }
  });
});

describe('#1341 D2 — 머리 = 메시 world (동일성)', () => {
  it('머리 정점 = headWorld 값 그대로 (===), 위성 포함', () => {
    for (const spec of specs) {
      const out = new Float64Array(3 * (spec.segments + 1));
      // 실제 장면 값처럼 임의 비정수 — 샘플 값과 우연히 같을 수 없는 값.
      const headWorld: [number, number, number] = [1.234567e11, -9.87654e10, 3.1415e9];
      const parentWorld: [number, number, number] = [7.7e10, 1.1e10, -2.2e9];
      sampleTrailWorld(spec, J2000, 1, TRAIL_ORBIT_FRACTION, parentWorld, headWorld, out, 0);
      expect(out[0]).toBe(headWorld[0]);
      expect(out[1]).toBe(headWorld[1]);
      expect(out[2]).toBe(headWorld[2]);
    }
    // 데이터 전제 — 위성 (시각 배율 ≠ 1) 이 대상에 있다.
    expect(specs.some((s) => s.parentId !== 'sun' && s.visualScale !== 1)).toBe(true);
  });

  it('머리 외 점 = parentWorld + local × visualScale (결정 T2 — 모체 상대)', () => {
    const moon = specs.find((s) => s.id === 'moon')!;
    const local = new Float64Array(3 * (moon.segments + 1));
    const world = new Float64Array(3 * (moon.segments + 1));
    const parentWorld: [number, number, number] = [1.4e11, 2.5e10, 1.0e6];
    sampleTrailLocal(moon, J2000, 1, TRAIL_ORBIT_FRACTION, local, 0);
    sampleTrailWorld(moon, J2000, 1, TRAIL_ORBIT_FRACTION, parentWorld, [0, 0, 0], world, 0);
    for (let k = 1; k <= moon.segments; k += 1) {
      for (let c = 0; c < 3; c += 1) {
        expect(world[3 * k + c]).toBe(parentWorld[c]! + local[3 * k + c]! * moon.visualScale);
      }
    }
    expect(moon.visualScale).toBe(30);
  });
});

describe('#1341 D3 — 무상태 (바이트 동일)', () => {
  /** 전 천체 world 버퍼 1회 계산 — 장면이 하는 것과 같은 배치. */
  function sampleAll(jd: number, direction: TrailDirection): Uint8Array {
    const out = new Float64Array(3 * trailVertexCount(specs));
    let offset = 0;
    for (const spec of specs) {
      const n = sampleTrailWorld(
        spec,
        jd,
        direction,
        TRAIL_ORBIT_FRACTION,
        [1e9, 2e9, 3e9],
        [4e9, 5e9, 6e9],
        out,
        offset,
      );
      offset += 3 * n;
    }
    return new Uint8Array(out.buffer);
  }

  it('tick · 점프 ±100년 · 역행 · 반복 뒤 = 같은 jd 단독 호출', () => {
    const target = J2000 + 1234.5678;
    const alone = sampleAll(target, 1);
    const aloneReverse = sampleAll(target, -1);
    // 호출 열 — 같은 출력 버퍼를 재사용하지 않도록 매번 새로 받되, 모듈 상태가 있다면 여기서 오염된다.
    for (let i = 0; i < 30; i += 1) sampleAll(target - 30 + i, 1); // tick
    sampleAll(target + 36_525, 1); // +100년 점프
    sampleAll(target - 36_525, -1); // −100년 점프 · 역행
    for (let i = 0; i < 10; i += 1) sampleAll(target + 5 - i, -1); // 역재생 tick
    sampleAll(target, 1); // 반복
    expect(Buffer.from(sampleAll(target, 1)).equals(Buffer.from(alone))).toBe(true);
    expect(Buffer.from(sampleAll(target, -1)).equals(Buffer.from(aloneReverse))).toBe(true);
    // 전제 — 두 방향 출력이 실제로 다르다 (방향 인자가 출력에 닿는다).
    expect(Buffer.from(alone).equals(Buffer.from(aloneReverse))).toBe(false);
  });
});
