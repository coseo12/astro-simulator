/**
 * #1360 결정 G2 — 일식 원뿔 파라미터 추출 (`solarEclipseCone`) 이 판정식 (`solarEclipseGeometry`) 을 바꾸지 않는다.
 *
 * ADR `docs/decisions/20261018-1360-moon-phase-eclipse-shadows.md` DoD D1 — 1차 가드는 #1354 E1 ~ E5
 * (`eclipse-events.test.ts`) 무수정 통과다. 여기서는 그보다 촘촘하게, 추출 **전** 판정식의 동결 사본과 출력을
 * `Object.is` (비트) 로 대조한다 — E 테스트는 종류 · 시각 허용 오차를 보므로 마지막 비트의 변화는 통과시킨다.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3Double } from '../coords/vec3.js';
import {
  solarEclipseCone,
  solarEclipseGeometry,
  type EclipseRadii,
  type SolarEclipseGeometry,
  type SolarEclipseType,
} from './eclipse-geometry.js';

const RADII: EclipseRadii = { sun: 6.957e8, earth: 6.371e6, moon: 1.7374e6 };
const AU = 1.495978707e11;

/**
 * 추출 전 `solarEclipseGeometry` 의 **동결 사본** (develop `99194931`). 수정 금지 — 이 함수가 바뀌면 대조가 무의미해진다.
 */
function frozenSolarEclipseGeometry(
  moon: Vec3Double,
  sun: Vec3Double,
  radii: EclipseRadii,
): SolarEclipseGeometry {
  const norm = (v: Vec3Double) => Math.hypot(v[0], v[1], v[2]);
  const dot = (a: Vec3Double, b: Vec3Double) => a[0] * b[0] + a[1] * b[1] + a[2] * b[2];
  const axis: Vec3Double = [moon[0] - sun[0], moon[1] - sun[1], moon[2] - sun[2]];
  const sunMoonDistance = norm(axis);
  const u: Vec3Double = [
    axis[0] / sunMoonDistance,
    axis[1] / sunMoonDistance,
    axis[2] / sunMoonDistance,
  ];
  const along = dot(moon, u);
  const perp: Vec3Double = [moon[0] - u[0] * along, moon[1] - u[1] * along, moon[2] - u[2] * along];
  const gamma = norm(perp) / radii.earth;
  const z = -along;
  const f1 = Math.asin((radii.sun + radii.moon) / sunMoonDistance);
  const f2 = Math.asin((radii.sun - radii.moon) / sunMoonDistance);
  const tanF2 = Math.tan(f2);
  const penumbraRadius = (z * Math.tan(f1) + radii.moon / Math.cos(f1)) / radii.earth;
  const umbraRadius = (z * tanF2 - radii.moon / Math.cos(f2)) / radii.earth;
  let type: SolarEclipseType | null = null;
  if (gamma < 1) {
    const surfaceHeight = Math.sqrt(1 - gamma * gamma);
    const umbraAtSurface = umbraRadius - surfaceHeight * tanF2;
    type = umbraAtSurface < 0 ? 'total' : 'annular';
  } else if (gamma < 1 + Math.abs(umbraRadius)) {
    type = umbraRadius < 0 ? 'total' : 'annular';
  } else if (gamma < 1 + penumbraRadius) {
    type = 'partial';
  }
  return { gamma, penumbraRadius, umbraRadius, type };
}

/** 결정적 의사난수 (mulberry32) — 실행마다 같은 표본. */
function rng(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** 삭 근처 표본 — 달은 태양 쪽 (지구–달 거리 3.5e8 ~ 4.1e8 m), 축에서 지구 반경 0 ~ 3배 벗어난 배치를 고루. */
function sampleConfigs(n: number): Array<{ moon: Vec3Double; sun: Vec3Double }> {
  const r = rng(1360);
  const out: Array<{ moon: Vec3Double; sun: Vec3Double }> = [];
  for (let i = 0; i < n; i += 1) {
    const sunDist = AU * (0.983 + 0.034 * r());
    const lon = 2 * Math.PI * r();
    const sun: Vec3Double = [sunDist * Math.cos(lon), sunDist * Math.sin(lon), 0];
    const moonDist = 3.5e8 + 0.6e8 * r();
    // 축 수직 오프셋 [지구 반경 0 ~ 3] — 개기 · 금환 · 부분 · 없음 네 분기를 다 지나게.
    const offset = 3 * RADII.earth * r();
    const offAngle = 2 * Math.PI * r();
    const ux = Math.cos(lon);
    const uy = Math.sin(lon);
    const moon: Vec3Double = [
      ux * moonDist - uy * offset * Math.cos(offAngle),
      uy * moonDist + ux * offset * Math.cos(offAngle),
      offset * Math.sin(offAngle),
    ];
    out.push({ moon, sun });
  }
  return out;
}

describe('#1360 G2 — 일식 원뿔 함수 추출 (판정식 비트 동일)', () => {
  const configs = sampleConfigs(2_000);

  it('표본이 판정식 네 분기를 모두 지난다 (대조의 전제)', () => {
    const types = new Set(
      configs.map((c) => frozenSolarEclipseGeometry(c.moon, c.sun, RADII).type),
    );
    expect(types).toEqual(new Set(['total', 'annular', 'partial', null]));
  });

  it('solarEclipseGeometry = 추출 전 동결 사본 — 네 출력 전부 Object.is (2,000 표본)', () => {
    let mismatches = 0;
    for (const c of configs) {
      const got = solarEclipseGeometry(c.moon, c.sun, RADII);
      const ref = frozenSolarEclipseGeometry(c.moon, c.sun, RADII);
      if (
        !Object.is(got.gamma, ref.gamma) ||
        !Object.is(got.penumbraRadius, ref.penumbraRadius) ||
        !Object.is(got.umbraRadius, ref.umbraRadius) ||
        got.type !== ref.type
      ) {
        mismatches += 1;
      }
    }
    expect(mismatches).toBe(0);
  });

  it('원뿔 파라미터로 기본면 반경을 다시 만들면 판정식 l1 · l2 와 비트 동일 (uniform 과 판정이 같은 식)', () => {
    for (const c of configs.slice(0, 200)) {
      const cone = solarEclipseCone(c.moon, c.sun, RADII);
      const g = solarEclipseGeometry(c.moon, c.sun, RADII);
      const u = cone.axis;
      const z = -(c.moon[0] * u[0] + c.moon[1] * u[1] + c.moon[2] * u[2]);
      expect(
        Object.is((z * cone.tanF1 + cone.moonRadiusSecF1) / RADII.earth, g.penumbraRadius),
      ).toBe(true);
      expect(Object.is((z * cone.tanF2 - cone.moonRadiusSecF2) / RADII.earth, g.umbraRadius)).toBe(
        true,
      );
    }
  });

  it('원뿔 파라미터 정의 — 축은 태양 → 달 단위 벡터, sin f1 · sin f2 · sec 항', () => {
    const sun: Vec3Double = [AU, 0, 0];
    const moon: Vec3Double = [3.8e8, 0, 0];
    const cone = solarEclipseCone(moon, sun, RADII);
    const d = AU - 3.8e8;
    expect(cone.sunMoonDistance).toBe(d);
    expect(cone.axis).toEqual([-1, 0, 0]);
    const f1 = Math.asin((RADII.sun + RADII.moon) / d);
    const f2 = Math.asin((RADII.sun - RADII.moon) / d);
    expect(cone.tanF1).toBe(Math.tan(f1));
    expect(cone.tanF2).toBe(Math.tan(f2));
    expect(cone.moonRadiusSecF1).toBe(RADII.moon / Math.cos(f1));
    expect(cone.moonRadiusSecF2).toBe(RADII.moon / Math.cos(f2));
    // 반영 원뿔이 본영보다 넓다 (f1 > f2).
    expect(cone.tanF1).toBeGreaterThan(cone.tanF2);
  });
});
