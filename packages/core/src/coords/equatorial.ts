import { J2000_MEAN_OBLIQUITY_DEG } from '@astro-simulator/shared';
import type { Vec3Double } from './vec3.js';

/**
 * #1373 — 적도 J2000 → 황도 J2000 (데이터 좌표) 변환 (ADR `docs/decisions/20261018-1373-star-catalog-constellations.md` 결정 D6).
 *
 * 별 카탈로그는 적도 좌표 (RA · Dec, J2000 · ICRS) 그대로 저장한다 (결정 D2 — 1차 출처 행과 대조 가능). 장면 데이터
 * 좌표는 오른손 황도 J2000 (+X 춘분점 · +Z 황도 북극) 이라 춘분점 축 (X) 주위로 ε 만큼 돌린다:
 *
 * ```
 * x_ecl = x_eq
 * y_ecl =  cos ε · y_eq + sin ε · z_eq
 * z_ecl = −sin ε · y_eq + cos ε · z_eq
 * ```
 *
 * 그래서 적도 북극 `(0, 0, 1)` 은 `(0, sin ε, cos ε)` 로 간다 — 황도 북극에서 ε 만큼 춘분점 기준 +90° 쪽 (황경 90°) 으로
 * 기운다. 순수 함수는 **데이터 공간**에 둔다. 장면에 쓸 때는 `toScene` (ADR 1366 결정 1) 을 정점 쓰기 지점에서 거친다.
 *
 * 세차 · 고유운동은 적용하지 않는다 — 장면이 J2000 황도 고정 분점이고 지구 자전축도 같은 틀이다 (결정 D1).
 */

const DEG = Math.PI / 180;
const SIN_EPS = Math.sin(J2000_MEAN_OBLIQUITY_DEG * DEG);
const COS_EPS = Math.cos(J2000_MEAN_OBLIQUITY_DEG * DEG);

/**
 * 적도 J2000 방향 (RA · Dec, 도) → 황도 J2000 단위 벡터 (데이터 공간).
 *
 * @param raDeg 적경 [°]
 * @param decDeg 적위 [°]
 */
export function equatorialJ2000ToEcliptic(raDeg: number, decDeg: number): Vec3Double {
  const ra = raDeg * DEG;
  const dec = decDeg * DEG;
  const cosDec = Math.cos(dec);
  const xEq = cosDec * Math.cos(ra);
  const yEq = cosDec * Math.sin(ra);
  const zEq = Math.sin(dec);
  return [xEq, COS_EPS * yEq + SIN_EPS * zEq, -SIN_EPS * yEq + COS_EPS * zEq];
}

/**
 * 황도 단위 벡터 (데이터 공간) → 황경 λ ∈ [0, 360) · 황위 β ∈ [−90, 90] [°]. 진단 · 단위 테스트용.
 */
export function eclipticLonLatDeg(v: Vec3Double): { lonDeg: number; latDeg: number } {
  const lon = Math.atan2(v[1], v[0]) / DEG;
  const lat = Math.atan2(v[2], Math.hypot(v[0], v[1])) / DEG;
  return { lonDeg: lon < 0 ? lon + 360 : lon, latDeg: lat };
}
