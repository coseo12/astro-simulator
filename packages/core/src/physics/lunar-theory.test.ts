/**
 * #1404 — 달 위치 이론 (ADR `docs/decisions/20261023-1404-lunar-theory-meeus47.md` 결정 L1 · L2, DoD D3 · D4).
 *
 * - D4 — Meeus 예제 47.a (회전 전, 날짜 평균 분점) 를 인쇄 자리수까지 재현한다.
 * - D3 — P1 달 위치 (DE441 4시각 — `events/__test-utils__/lunar-reference-fixture.ts`) `|Δλ| ≤ 6″` · `|Δβ| ≤ 6″` · `|Δr| ≤ 10 km`
 *   와 이론 변이 3종의 판별력 (ADR 결정 E5 — 달 `rates` 변이 판별 테스트를 대체한다).
 *
 * 실측 (macOS · Apple M1 Pro · Node 24.14.0 · vitest, 이 PR 의 구현 · 데이터): 각 변이의 4시각 최댓값 `|Δλ|` · `|Δβ|` · `|Δr|` —
 * 이론 `1.81″` · `1.72″` · `5.24 km` / 부가항 뺌 `20.37″` · `9.07″` · `5.24 km` / 황도 회전 대신 `p` 만 더함 `1.87″` · `41.38″` ·
 * `5.24 km` / 세차 변환 통째로 뺌 `4958.77″` · `41.38″` · `5.24 km` (ADR §DoD D3 의 설계 실측 `1.8″` · `1.7″` · `5.2 km` ·
 * `20.4″` · `41.4″` · `4958.8″` 과 같다).
 */
import { describe, expect, it } from 'vitest';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { DE441_MOON_POSITIONS } from '../events/__test-utils__/lunar-reference-fixture.js';
import type { Vec3Double } from '../coords/vec3.js';
import {
  eclipticOfDateToJ2000,
  eclipticPrecessionAnglesToJ2000,
  eclipticToCartesian,
  lunarArgumentsAt,
  lunarEclipticOfDate,
  lunarTheoryPositionAt,
} from './lunar-theory.js';

const DEG = Math.PI / 180;
const ARCSEC = DEG / 3600;
const KM = 1000;
const TWO_PI = 2 * Math.PI;

/** DoD D3 허용. */
const P1_LONGITUDE_TOLERANCE_ARCSEC = 6;
const P1_LATITUDE_TOLERANCE_ARCSEC = 6;
const P1_DISTANCE_TOLERANCE_KM = 10;

/** Meeus 예제 47.a — 1992-04-12 0h TD (JDE `2448724.5`). 인쇄 값 λ · β [도, 소수 6자리] · Δ [km, 소수 1자리]. */
const MEEUS_EXAMPLE_47A = {
  julianDate: 2_448_724.5,
  longitudeDeg: '133.162655',
  latitudeDeg: '-3.229126',
  distanceKm: '368409.7',
} as const;

const theory = getSolarSystem().bodies.find((b) => b.id === 'moon')!.orbit!.lunarTheory!;

/** (−π, π] 로 감는다. */
function wrapAngle(a: number): number {
  return Math.atan2(Math.sin(a), Math.cos(a));
}

/** 직교 → (λ, β [rad], r [m]). */
function sphericalOf(p: Vec3Double): [number, number, number] {
  const r = Math.hypot(p[0], p[1], p[2]);
  return [Math.atan2(p[1], p[0]), Math.asin(p[2] / r), r];
}

/** 4시각의 최대 오차 `[|Δλ| ″, |Δβ| ″, |Δr| km]`. */
function maxP1Error(position: (jd: number) => Vec3Double): [number, number, number] {
  let lon = 0;
  let lat = 0;
  let dist = 0;
  for (const s of DE441_MOON_POSITIONS) {
    const m = sphericalOf(position(s.julianDate));
    const ref = sphericalOf([
      s.geocentricKm[0] * KM,
      s.geocentricKm[1] * KM,
      s.geocentricKm[2] * KM,
    ]);
    lon = Math.max(lon, Math.abs(wrapAngle(m[0] - ref[0])) / ARCSEC);
    lat = Math.max(lat, Math.abs(m[1] - ref[1]) / ARCSEC);
    dist = Math.max(dist, Math.abs(m[2] - ref[2]) / KM);
  }
  return [lon, lat, dist];
}

describe('#1404 D4 — Meeus 예제 47.a (회전 전, 날짜 평균 분점)', () => {
  it('λ 133.162655° · β −3.229126° · Δ 368409.7 km (인쇄 자리수)', () => {
    const p = lunarEclipticOfDate(theory, MEEUS_EXAMPLE_47A.julianDate);
    expect((p.longitude / DEG).toFixed(6)).toBe(MEEUS_EXAMPLE_47A.longitudeDeg);
    expect((p.latitude / DEG).toFixed(6)).toBe(MEEUS_EXAMPLE_47A.latitudeDeg);
    expect((p.distance / KM).toFixed(1)).toBe(MEEUS_EXAMPLE_47A.distanceKm);
  });
});

describe('#1404 L1 — 계산 계약', () => {
  it('인자는 [0, 2π) 로 정규화된다 (결정 L1-1) — 스크러버 양 끝 · J2000', () => {
    for (const jd of [2_415_020.5, 2_451_545.0, 2_488_069.5]) {
      for (const [key, v] of Object.entries(lunarArgumentsAt(theory, jd))) {
        expect(v, key).toBeGreaterThanOrEqual(0);
        expect(v, key).toBeLessThan(TWO_PI);
      }
    }
  });

  it('J2000 에서 세차 회전은 항등 (η = p = 0 → λ = λ₀ · β = β₀, 결정 L1-5 부호 규약)', () => {
    const jd = 2_451_545.0;
    const angles = eclipticPrecessionAnglesToJ2000(jd);
    expect(Math.abs(angles.eta)).toBe(0);
    expect(Math.abs(angles.p)).toBe(0);
    const ofDate = lunarEclipticOfDate(theory, jd);
    const j2000 = eclipticOfDateToJ2000(ofDate, jd);
    expect(Math.abs(wrapAngle(j2000.longitude - ofDate.longitude))).toBeLessThan(1e-12);
    expect(Math.abs(j2000.latitude - ofDate.latitude)).toBeLessThan(1e-12);
  });

  it('부호 — J2000 이후 시각에서 p < 0 (날짜 → J2000 이라 경과 t = −T, 결정 L1-5)', () => {
    const jd2050 = 2_451_545.0 + 50 * 365.25;
    expect(eclipticPrecessionAnglesToJ2000(jd2050).p).toBeLessThan(0);
  });
});

describe('#1404 D3 — P1 달 위치 (DE441 4시각)', () => {
  it(`이론 위치 — |Δλ| ≤ ${P1_LONGITUDE_TOLERANCE_ARCSEC}″ · |Δβ| ≤ ${P1_LATITUDE_TOLERANCE_ARCSEC}″ · |Δr| ≤ ${P1_DISTANCE_TOLERANCE_KM} km`, () => {
    const [lon, lat, dist] = maxP1Error((jd) => lunarTheoryPositionAt(theory, jd));
    expect(lon).toBeLessThanOrEqual(P1_LONGITUDE_TOLERANCE_ARCSEC);
    expect(lat).toBeLessThanOrEqual(P1_LATITUDE_TOLERANCE_ARCSEC);
    expect(dist).toBeLessThanOrEqual(P1_DISTANCE_TOLERANCE_KM);
  });

  it('판별력 — 부가항을 뺀 판본은 경도 허용을 넘는다', () => {
    const [lon] = maxP1Error((jd) => lunarTheoryPositionAt({ ...theory, additiveTerms: [] }, jd));
    expect(lon).toBeGreaterThan(P1_LONGITUDE_TOLERANCE_ARCSEC);
  });

  it('판별력 — 황도 회전 대신 경도에 p 만 더한 판본은 위도 허용을 넘는다', () => {
    const [, lat] = maxP1Error((jd) => {
      const ofDate = lunarEclipticOfDate(theory, jd);
      const { p } = eclipticPrecessionAnglesToJ2000(jd);
      return eclipticToCartesian({ ...ofDate, longitude: ofDate.longitude + p });
    });
    expect(lat).toBeGreaterThan(P1_LATITUDE_TOLERANCE_ARCSEC);
  });

  it('판별력 — 세차 변환을 통째로 뺀 판본 (날짜 분점 그대로) 은 경도 허용을 넘는다', () => {
    const [lon] = maxP1Error((jd) => eclipticToCartesian(lunarEclipticOfDate(theory, jd)));
    expect(lon).toBeGreaterThan(P1_LONGITUDE_TOLERANCE_ARCSEC);
  });
});
