/**
 * #1360 PR2 — 월식 그림자 uniform 빌더 (ADR `docs/decisions/20261018-1360-moon-phase-eclipse-shadows.md`).
 *
 * - DoD D1 확장 — uniform 만으로 다시 분류한 종류가 판정식 (`lunarEclipseGeometry`) 종류와 같다. 지정 5개 식 (2017-08-21 ·
 *   2024-04-08 일식 → 월식 아님 · 2022-11-08 · 2025-03-14 개기 · 2023-05-05 반영) + 1990 ~ 2040 망 전부 (최대식 근처 ±6 h).
 * - 방향 — `a` 는 그림자 중심 → 달 중심 (반태양점의 하늘면 성분과 반대). 반전 결함판은 여기서 FAIL 한다.
 * - 식이 아니면 그림자 없음 (`mode 0`, 합성 항등값) — 결정 R2.
 */
import { describe, expect, it } from 'vitest';
import type { Vec3Double } from '../coords/vec3.js';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';
import { dateToJulianDate } from '../time/julian-date.js';
import {
  computeEventsForKind,
  greatestEclipseNear,
  syzygyGeometryAt,
  syzygyTimes,
  type AstroEvent,
} from './compute-events.js';
import { lunarEclipseGeometry, type EclipseRadii } from './eclipse-geometry.js';
import {
  ECLIPSE_SHADOW_MODE,
  LUNAR_ECLIPSE_GLOW_RGB,
  LUNAR_UMBRA_CENTER_GLOW,
  LUNAR_UMBRA_EDGE_SOFTNESS,
  classifyLunarShadowUniforms,
  copyEclipseShadowUniforms,
  lunarEclipseShadowUniforms,
  noEclipseShadowUniforms,
} from './eclipse-shadow-uniforms.js';
import { getEventKind } from './event-kinds.js';

const system = getSolarSystem();
const byId = new Map(system.bodies.map((b) => [b.id, b] as const));
const RADII: EclipseRadii = {
  sun: byId.get('sun')!.radius,
  earth: byId.get('earth')!.radius,
  moon: byId.get('moon')!.radius,
};
const HOURS_PER_DAY = 24;
/** 광범위 표본 — 최대식 (또는 망) 앞뒤 시간 오프셋 [h]. 개기 · 부분 · 반영 · 식 아님 경계를 모두 지난다. */
const SWEEP_OFFSETS_H = [-6, -4, -3, -2, -1.5, -1, -0.5, 0, 0.5, 1, 1.5, 2, 3, 4, 6] as const;

function jdOfUtc(y: number, m: number, d: number): number {
  return dateToJulianDate(new Date(Date.UTC(y, m - 1, d)));
}

function eventsIn(kind: 'lunar-eclipse' | 'solar-eclipse', y0: number, y1: number): AstroEvent[] {
  return computeEventsForKind(byId, getEventKind(kind), jdOfUtc(y0, 1, 1), jdOfUtc(y1, 1, 1));
}

function geometryAt(jd: number): { moon: Vec3Double; sun: Vec3Double } {
  const geo = syzygyGeometryAt(byId, 'moon', jd);
  if (!geo) throw new Error(`체인 미해석 JD ${jd}`);
  return geo;
}

function uniformsAt(jd: number) {
  const { moon, sun } = geometryAt(jd);
  return {
    u: lunarEclipseShadowUniforms(moon, sun, RADII),
    g: lunarEclipseGeometry(moon, sun, RADII),
  };
}

describe('#1360 PR2 D1 확장 — uniform 재분류 = 판정식 종류', () => {
  const lunar = eventsIn('lunar-eclipse', 2017, 2026);
  const solar = eventsIn('solar-eclipse', 2017, 2025);
  const named: ReadonlyArray<
    [string, 'lunar' | 'solar', 'total' | 'partial' | 'penumbral' | null]
  > = [
    ['2017-08-21', 'solar', null],
    ['2024-04-08', 'solar', null],
    ['2022-11-08', 'lunar', 'total'],
    ['2025-03-14', 'lunar', 'total'],
    ['2023-05-05', 'lunar', 'penumbral'],
  ];
  for (const [date, which, expectedLunar] of named) {
    it(`${date} (${which === 'lunar' ? '월식' : '일식'}) — 재분류 ${expectedLunar ?? '식 아님'} = 판정식`, () => {
      const list = which === 'lunar' ? lunar : solar;
      const event = list.find((e) => e.id.endsWith(date));
      expect(event, `${date} 사건 없음`).toBeDefined();
      const { u, g } = uniformsAt(event!.julianDate);
      expect(g.type).toBe(expectedLunar);
      expect(classifyLunarShadowUniforms(u)).toBe(g.type);
      expect(u.mode).toBe(
        expectedLunar === null ? ECLIPSE_SHADOW_MODE.none : ECLIPSE_SHADOW_MODE.lunar,
      );
    });
  }

  it('1990 ~ 2040 망 전부 × 최대식 ±6 h — 재분류 불일치 0 · 네 범주 (개기 · 부분 · 반영 · 없음) 모두 표본에 있다', () => {
    const syzygies = syzygyTimes(byId, 'moon', 'full', jdOfUtc(1990, 1, 1), jdOfUtc(2040, 1, 1));
    const counts = new Map<string, number>();
    let mismatches = 0;
    for (const syz of syzygies) {
      const center = greatestEclipseNear(byId, 'moon', 'full', syz)?.julianDate ?? syz;
      for (const h of SWEEP_OFFSETS_H) {
        const { u, g } = uniformsAt(center + h / HOURS_PER_DAY);
        if (classifyLunarShadowUniforms(u) !== g.type) mismatches += 1;
        const key = g.type ?? 'none';
        counts.set(key, (counts.get(key) ?? 0) + 1);
        // 식이 아니면 그림자 없음 · 식이면 월식 모드 — 결정 R2.
        expect(u.mode).toBe(g.type === null ? ECLIPSE_SHADOW_MODE.none : ECLIPSE_SHADOW_MODE.lunar);
      }
    }
    expect(mismatches).toBe(0);
    for (const key of ['total', 'partial', 'penumbral', 'none']) {
      expect(counts.get(key) ?? 0, key).toBeGreaterThan(0);
    }
  });
});

describe('#1360 PR2 — 월식 uniform 기하', () => {
  const event = eventsIn('lunar-eclipse', 2022, 2023).find((e) => e.id.endsWith('2022-11-08'))!;
  /** 2022-11-08 최대식 −70분 — 부분 위상 (ADR §1-F 방향 판정 시각). */
  const partialJd = event.julianDate - 70 / (HOURS_PER_DAY * 60);

  it('|a| = σ / S☾ · a ⟂ axis · axis = 지구 → 달 단위 벡터 · k = (Ru, Rp)/S☾ + 미학 상수', () => {
    const { moon } = geometryAt(partialJd);
    const { u, g } = uniformsAt(partialJd);
    expect(g.type).toBe('partial');
    expect(Math.hypot(...u.a)).toBeCloseTo(g.separation / g.moonSemiDiameter, 12);
    const d = Math.hypot(...moon);
    u.axis.forEach((v, i) => expect(v).toBeCloseTo(moon[i]! / d, 15));
    expect(u.a[0] * u.axis[0] + u.a[1] * u.axis[1] + u.a[2] * u.axis[2]).toBeCloseTo(0, 12);
    expect(u.k).toEqual([
      g.umbraRadius / g.moonSemiDiameter,
      g.penumbraRadius / g.moonSemiDiameter,
      LUNAR_UMBRA_CENTER_GLOW,
      LUNAR_UMBRA_EDGE_SOFTNESS,
    ]);
    expect(u.glow).toEqual([...LUNAR_ECLIPSE_GLOW_RGB]);
  });

  it('방향 — a 는 그림자 중심 → 달 중심 (반태양 방향의 하늘면 성분과 반대 · 반전 결함판 판별)', () => {
    const { moon, sun } = geometryAt(partialJd);
    const { u } = uniformsAt(partialJd);
    const dm = Math.hypot(...moon);
    const ds = Math.hypot(...sun);
    const m = moon.map((v) => v / dm);
    const anti = sun.map((v) => -v / ds);
    const along = anti[0]! * m[0]! + anti[1]! * m[1]! + anti[2]! * m[2]!;
    const towardShadow = anti.map((v, i) => v - along * m[i]!);
    const cos =
      (u.a[0] * towardShadow[0]! + u.a[1] * towardShadow[1]! + u.a[2] * towardShadow[2]!) /
      (Math.hypot(...u.a) * Math.hypot(...towardShadow));
    expect(cos).toBeCloseTo(-1, 12);
  });

  it('달 표면점의 그림자 중심 거리 — 그림자 쪽 가장자리가 반대쪽보다 Ru 에 가깝다 (셰이더 q 식의 JS 대조)', () => {
    const { u } = uniformsAt(partialJd);
    const unit = u.a.map((v) => -v / Math.hypot(...u.a));
    // 셰이더: q = a + (n − (n·axis)·axis). 그림자 쪽 가장자리 n = −â (axis 에 수직), 반대쪽 n = +â.
    const sAt = (n: number[]) => {
      const nd = n[0]! * u.axis[0] + n[1]! * u.axis[1] + n[2]! * u.axis[2];
      return Math.hypot(...u.a.map((a, i) => a + n[i]! - nd * u.axis[i]!));
    };
    const near = sAt(unit);
    const far = sAt(unit.map((v) => -v));
    expect(near).toBeCloseTo(Math.hypot(...u.a) - 1, 12);
    expect(far).toBeCloseTo(Math.hypot(...u.a) + 1, 12);
    // 부분 위상 — 그림자 쪽 가장자리는 본영 안, 반대쪽은 본영 밖.
    expect(near).toBeLessThan(u.k[0]);
    expect(far).toBeGreaterThan(u.k[0]);
  });

  it('식 아님 (+3일) — 그림자 없음 값 (합성 항등) · 버퍼 재사용 시에도 이전 값이 남지 않는다', () => {
    const out = noEclipseShadowUniforms();
    const { moon, sun } = geometryAt(event.julianDate);
    lunarEclipseShadowUniforms(moon, sun, RADII, out);
    expect(out.mode).toBe(ECLIPSE_SHADOW_MODE.lunar);
    const later = geometryAt(event.julianDate + 3);
    lunarEclipseShadowUniforms(later.moon, later.sun, RADII, out);
    expect(out).toEqual(noEclipseShadowUniforms());
  });

  it('상수 — Rp > Ru > 0 (분모 양수) · 중심 배율 ∈ (0, 1] · 경계 띠 ∈ (0, 1) · 붉은 빛 R > G > B > 0', () => {
    const { u } = uniformsAt(event.julianDate);
    expect(u.k[1]).toBeGreaterThan(u.k[0]);
    expect(u.k[0]).toBeGreaterThan(0);
    expect(LUNAR_UMBRA_CENTER_GLOW).toBeGreaterThan(0);
    expect(LUNAR_UMBRA_CENTER_GLOW).toBeLessThanOrEqual(1);
    expect(LUNAR_UMBRA_EDGE_SOFTNESS).toBeGreaterThan(0);
    expect(LUNAR_UMBRA_EDGE_SOFTNESS).toBeLessThan(1);
    const [r, g, b] = LUNAR_ECLIPSE_GLOW_RGB;
    expect(r).toBeGreaterThan(g);
    expect(g).toBeGreaterThan(b);
    expect(b).toBeGreaterThan(0);
  });

  it('copyEclipseShadowUniforms — 값 복사 (배열 참조 공유 없음)', () => {
    const { u } = uniformsAt(event.julianDate);
    const out = copyEclipseShadowUniforms(u, noEclipseShadowUniforms());
    expect(out).toEqual(u);
    expect(out.a).not.toBe(u.a);
    expect(out.k).not.toBe(u.k);
  });
});
