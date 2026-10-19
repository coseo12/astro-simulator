/**
 * #1373 — 적도 J2000 → 황도 J2000 변환 (ADR `20261018-1373` 결정 D6 · DoD D1).
 *
 * 기대값은 ADR §1-E 표 (같은 식 · 독립 계산) 다. ε 부호 반전 · z 반전 누락은 수십 도 차로 FAIL 한다 —
 * 아래 「결함판 판별」 테스트가 그 판별력을 직접 보인다.
 */
import { describe, expect, it } from 'vitest';
import { J2000_MEAN_OBLIQUITY_DEG } from '@astro-simulator/shared';
import { eclipticLonLatDeg, equatorialJ2000ToEcliptic } from './equatorial.js';
import { toScene } from './scene-handedness.js';

const DEG = Math.PI / 180;
/** DoD D1 허용 오차 [°]. */
const D1_TOLERANCE_DEG = 0.001;

/** ADR §1-E 표 — (RA, Dec) 입력 · (λ, β) 기대 · 장면 방향 기대 (있는 것만). */
const REFERENCE = [
  {
    name: '시리우스 HR 2491',
    ra: 101.2871,
    dec: -16.7161,
    lon: 104.0816,
    lat: -39.6052,
    scene: [-0.18745, 0.7473, 0.63749],
  },
  {
    name: '베텔게우스 HR 2061',
    ra: 88.7929,
    dec: 7.4069,
    lon: 88.7546,
    lat: -16.0271,
    scene: [0.02089, 0.9609, 0.27609],
  },
  {
    name: '북극성 HR 424',
    ra: 37.9529,
    dec: 89.2642,
    lon: 88.5677,
    lat: 66.1015,
    scene: [0.01013, 0.40499, -0.91426],
  },
  {
    name: '리겔 HR 1713',
    ra: 78.6346,
    dec: -8.2017,
    lon: 76.8297,
    lat: -31.1228,
    scene: [0.19505, 0.83354, 0.51687],
  },
  {
    name: '베가 HR 7001',
    ra: 279.2346,
    dec: 38.7836,
    lon: 285.3161,
    lat: 61.7328,
    scene: [0.12509, -0.45676, -0.88075],
  },
] as const;

const angleDeg = (a: readonly number[], b: readonly number[]): number => {
  const dot = a[0]! * b[0]! + a[1]! * b[1]! + a[2]! * b[2]!;
  return Math.acos(Math.min(1, Math.max(-1, dot / (Math.hypot(...a) * Math.hypot(...b))))) / DEG;
};

describe('#1373 D1 — equatorialJ2000ToEcliptic', () => {
  it.each(REFERENCE)('$name — λ · β 가 ADR §1-E 표와 ≤ 0.001°', (s) => {
    const { lonDeg, latDeg } = eclipticLonLatDeg(equatorialJ2000ToEcliptic(s.ra, s.dec));
    // 황경은 고위도에서 각거리보다 크게 움직이므로 원 위 거리로 환산하지 않고 그대로 비교한다 (더 엄격).
    expect(Math.abs(lonDeg - s.lon)).toBeLessThanOrEqual(D1_TOLERANCE_DEG);
    expect(Math.abs(latDeg - s.lat)).toBeLessThanOrEqual(D1_TOLERANCE_DEG);
  });

  it.each(REFERENCE)('$name — 장면 방향은 toScene 을 거친 값 (ADR §1-E 장면 방향 열)', (s) => {
    const scene = toScene(equatorialJ2000ToEcliptic(s.ra, s.dec));
    expect(angleDeg(scene, s.scene)).toBeLessThanOrEqual(D1_TOLERANCE_DEG);
  });

  it('적도 북극 → (0, sin ε, cos ε)', () => {
    const v = equatorialJ2000ToEcliptic(0, 90);
    const eps = J2000_MEAN_OBLIQUITY_DEG * DEG;
    expect(v[0]).toBeCloseTo(0, 12);
    expect(v[1]).toBeCloseTo(Math.sin(eps), 12);
    expect(v[2]).toBeCloseTo(Math.cos(eps), 12);
  });

  it('춘분점 (RA 0 · Dec 0) 은 +X 그대로 · 단위 벡터 보존', () => {
    const v = equatorialJ2000ToEcliptic(0, 0);
    expect(v[0]).toBeCloseTo(1, 12);
    expect(v[1]).toBeCloseTo(0, 12);
    expect(v[2]).toBeCloseTo(0, 12);
    for (const s of REFERENCE) {
      expect(Math.hypot(...equatorialJ2000ToEcliptic(s.ra, s.dec))).toBeCloseTo(1, 12);
    }
  });

  it('결함판 판별 — ε 부호 반전 · z 반전 누락은 수십 도 어긋난다', () => {
    const polaris = REFERENCE[2];
    const good = toScene(equatorialJ2000ToEcliptic(polaris.ra, polaris.dec));
    // ε 부호 반전 = R_x(−ε): y·z 의 sin 항 부호가 바뀐다.
    const [x, y, z] = equatorialJ2000ToEcliptic(polaris.ra, polaris.dec);
    const eps = J2000_MEAN_OBLIQUITY_DEG * DEG;
    // 올바른 결과에서 적도 성분을 되돌린 뒤 R_x(−ε) 로 다시 돌린다.
    const yEq = Math.cos(eps) * y - Math.sin(eps) * z;
    const zEq = Math.sin(eps) * y + Math.cos(eps) * z;
    const wrongSign = toScene([
      x,
      Math.cos(eps) * yEq - Math.sin(eps) * zEq,
      Math.sin(eps) * yEq + Math.cos(eps) * zEq,
    ]);
    const noFlip = equatorialJ2000ToEcliptic(polaris.ra, polaris.dec);
    expect(angleDeg(wrongSign, good)).toBeGreaterThan(10);
    expect(angleDeg(noFlip, good)).toBeGreaterThan(10);
  });
});
