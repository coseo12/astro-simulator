/**
 * #1360 PR2 · PR3 — 월식 · 일식 그림자 uniform 빌더 (ADR `docs/decisions/20261018-1360-moon-phase-eclipse-shadows.md`).
 * PR3 (일식) 블록은 파일 끝 — 재분류 · 원뿔 파라미터 · 셰이더 식 JS 대조.
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
import {
  lunarEclipseGeometry,
  solarEclipseCone,
  solarEclipseGeometry,
  type EclipseRadii,
} from './eclipse-geometry.js';
import {
  ECLIPSE_SHADOW_MODE,
  LUNAR_ECLIPSE_GLOW_RGB,
  LUNAR_UMBRA_CENTER_GLOW,
  LUNAR_UMBRA_EDGE_SOFTNESS,
  classifyLunarShadowUniforms,
  classifySolarShadowUniforms,
  copyEclipseShadowUniforms,
  lunarEclipseShadowUniforms,
  noEclipseShadowUniforms,
  solarEclipseShadowUniforms,
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

// ─────────────────────────────────────────────────────────────────────────────
// #1360 PR3 — 일식 (지구 수신)
// ─────────────────────────────────────────────────────────────────────────────

function solarUniformsAt(jd: number) {
  const { moon, sun } = geometryAt(jd);
  return {
    u: solarEclipseShadowUniforms(moon, sun, RADII),
    g: solarEclipseGeometry(moon, sun, RADII),
    cone: solarEclipseCone(moon, sun, RADII),
    moon,
  };
}

/**
 * 셰이더 `eclipseShadow` 일식 분기 (`procedural-planet-shader.ts` `ECLIPSE_SHADOW_GLSL`) 의 JS 대조 — 차폐율 `x` 만.
 * `n` 은 지구 반경 단위 표면점 (단위 벡터).
 */
function solarOcclusionAt(u: ReturnType<typeof solarEclipseShadowUniforms>, n: number[]): number {
  const dot3 = (p: readonly number[], q: readonly number[]) =>
    p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
  const d = n.map((v, i) => v - u.a[i]!);
  const z = dot3(d, u.axis);
  const perp = Math.hypot(...d.map((v, i) => v - z * u.axis[i]!));
  const rp = z * u.k[0] + u.k[1];
  const ru = Math.abs(z * u.k[2] - u.k[3]);
  const vis = Math.min(1, Math.max(0, (perp - ru) / Math.max(rp - ru, 1e-6)));
  return 1 - vis;
}

/** 그림자 축이 지표 (단위 구) 에 닿는 점 — 태양 쪽 교점. 없으면 `null`. */
function axisSurfacePoint(u: ReturnType<typeof solarEclipseShadowUniforms>): number[] | null {
  const b = u.a[0] * u.axis[0] + u.a[1] * u.axis[1] + u.a[2] * u.axis[2];
  const c = u.a[0] ** 2 + u.a[1] ** 2 + u.a[2] ** 2 - 1;
  const disc = b * b - c;
  if (disc < 0) return null;
  const t = -b - Math.sqrt(disc);
  return u.a.map((v, i) => v + t * u.axis[i]!);
}

describe('#1360 PR3 D1 확장 — 일식 uniform 재분류 = 판정식 종류', () => {
  const solar = eventsIn('solar-eclipse', 2017, 2025);
  const lunar = eventsIn('lunar-eclipse', 2022, 2023);
  const named: ReadonlyArray<[string, 'lunar' | 'solar', 'total' | 'annular' | 'partial' | null]> =
    [
      ['2017-08-21', 'solar', 'total'],
      ['2024-04-08', 'solar', 'total'],
      ['2023-10-14', 'solar', 'annular'],
      ['2022-10-25', 'solar', 'partial'],
    ];
  for (const [date, which, expected] of named) {
    it(`${date} (${which === 'lunar' ? '월식' : '일식'}) — 재분류 ${expected ?? '식 아님'} = 판정식`, () => {
      const list = which === 'lunar' ? lunar : solar;
      const event = list.find((e) => e.id.endsWith(date));
      expect(event, `${date} 사건 없음`).toBeDefined();
      const { u, g } = solarUniformsAt(event!.julianDate);
      expect(g.type).toBe(expected);
      expect(classifySolarShadowUniforms(u)).toBe(g.type);
      expect(u.mode).toBe(expected === null ? ECLIPSE_SHADOW_MODE.none : ECLIPSE_SHADOW_MODE.solar);
    });
  }

  it('망 (2022-11-08 월식) — 판정식 경계식은 「개기」 를 내지만 (달이 지구 뒤 · 삭 전용 식) uniform 은 그림자 없음', () => {
    const event = lunar.find((e) => e.id.endsWith('2022-11-08'))!;
    const { u, g, moon, cone } = solarUniformsAt(event.julianDate);
    // 판정식 단독으로는 망을 거르지 못한다 — 빌더의 「달이 태양 쪽」 조건이 필요한 이유 (결함판 판별 근거).
    expect(g.type).toBe('total');
    expect(
      moon[0] * cone.axis[0] + moon[1] * cone.axis[1] + moon[2] * cone.axis[2],
    ).toBeGreaterThan(0);
    expect(u).toEqual(noEclipseShadowUniforms());
    expect(classifySolarShadowUniforms(u)).toBeNull();
  });

  it('1990 ~ 2040 망 전부 × ±6 h — 일식 uniform 은 전부 그림자 없음 (지구가 달 그림자 밖)', () => {
    const syzygies = syzygyTimes(byId, 'moon', 'full', jdOfUtc(1990, 1, 1), jdOfUtc(2040, 1, 1));
    let shadowed = 0;
    for (const syz of syzygies) {
      for (const h of SWEEP_OFFSETS_H) {
        if (solarUniformsAt(syz + h / HOURS_PER_DAY).u.mode !== ECLIPSE_SHADOW_MODE.none)
          shadowed += 1;
      }
    }
    expect(syzygies.length).toBeGreaterThan(600);
    expect(shadowed).toBe(0);
  });

  it('1990 ~ 2040 삭 전부 × 최대식 ±6 h — 재분류 불일치 0 · 네 범주 (개기 · 금환 · 부분 · 없음) 모두 표본에 있다', () => {
    const syzygies = syzygyTimes(byId, 'moon', 'new', jdOfUtc(1990, 1, 1), jdOfUtc(2040, 1, 1));
    const counts = new Map<string, number>();
    let mismatches = 0;
    for (const syz of syzygies) {
      const center = greatestEclipseNear(byId, 'moon', 'new', syz)?.julianDate ?? syz;
      for (const h of SWEEP_OFFSETS_H) {
        const { u, g } = solarUniformsAt(center + h / HOURS_PER_DAY);
        if (classifySolarShadowUniforms(u) !== g.type) mismatches += 1;
        const key = g.type ?? 'none';
        counts.set(key, (counts.get(key) ?? 0) + 1);
        expect(u.mode).toBe(g.type === null ? ECLIPSE_SHADOW_MODE.none : ECLIPSE_SHADOW_MODE.solar);
      }
    }
    expect(mismatches).toBe(0);
    for (const key of ['total', 'annular', 'partial', 'none']) {
      expect(counts.get(key) ?? 0, key).toBeGreaterThan(0);
    }
  });
});

describe('#1360 PR3 — 일식 uniform 기하', () => {
  const solar = eventsIn('solar-eclipse', 2017, 2025);
  const at = (date: string) => solar.find((e) => e.id.endsWith(date))!.julianDate;

  it('a = 달 위치 / R⊕ · axis = 판정식 원뿔 축 · k = 원뿔 파라미터 (반경은 R⊕ 단위) · glow 0', () => {
    const { u, cone, moon } = solarUniformsAt(at('2024-04-08'));
    expect(u.mode).toBe(ECLIPSE_SHADOW_MODE.solar);
    expect(u.a).toEqual(moon.map((v) => v / RADII.earth));
    expect(u.axis).toEqual([...cone.axis]);
    expect(u.k).toEqual([
      cone.tanF1,
      cone.moonRadiusSecF1 / RADII.earth,
      cone.tanF2,
      cone.moonRadiusSecF2 / RADII.earth,
    ]);
    expect(u.glow).toEqual([0, 0, 0]);
  });

  it('셰이더 식 (JS 대조) — 축 지표 교점은 본영 (차폐 1) · 반영 밖은 0 · 축에서 멀수록 차폐가 줄어든다', () => {
    for (const date of ['2017-08-21', '2024-04-08', '2023-10-14']) {
      const { u } = solarUniformsAt(at(date));
      const p = axisSurfacePoint(u);
      expect(p, date).not.toBeNull();
      expect(solarOcclusionAt(u, p!), date).toBe(1);
      // 지표 위에서 축 교점으로부터 멀어지는 대원 — 차폐 단조 비증가, 끝은 반영 밖 (0).
      const ref = u.axis[0] !== 0 || u.axis[1] !== 0 ? [0, 0, 1] : [1, 0, 0];
      const side = [
        p![1]! * ref[2]! - p![2]! * ref[1]!,
        p![2]! * ref[0]! - p![0]! * ref[2]!,
        p![0]! * ref[1]! - p![1]! * ref[0]!,
      ];
      const sl = Math.hypot(...side);
      let prev = 1;
      for (let deg = 0; deg <= 60; deg += 2) {
        const r = (deg * Math.PI) / 180;
        const n = p!.map((v, i) => v * Math.cos(r) + (side[i]! / sl) * Math.sin(r));
        const occ = solarOcclusionAt(u, n);
        expect(occ, `${date} ${deg}°`).toBeLessThanOrEqual(prev + 1e-12);
        prev = occ;
      }
      expect(prev, `${date} 60°`).toBe(0);
    }
  });

  it('PR #1369 리뷰 R2 — 부분식 2022-10-25 (γ > 1): 그림자가 축 기준 terminator 에 걸치고, 차폐는 terminator 를 가로질러 연속 (낮 · 밤 거울 짝 차 < 0.01)', () => {
    const { u, g } = solarUniformsAt(at('2022-10-25'));
    expect(g.type).toBe('partial');
    expect(g.gamma).toBeGreaterThan(1);
    const dot3 = (p: readonly number[], q: readonly number[]) =>
      p[0]! * q[0]! + p[1]! * q[1]! + p[2]! * q[2]!;
    const norm = (p: number[]) => {
      const l = Math.hypot(...p);
      return p.map((x) => x / l);
    };
    // terminator 평면 (축에 수직) 위에서 그림자 쪽 방향 û 와 그 접선 ŵ.
    const al = dot3(u.a, u.axis);
    const uHat = norm(u.a.map((x, i) => x - al * u.axis[i]!));
    const w = [
      u.axis[1] * uHat[2]! - u.axis[2] * uHat[1]!,
      u.axis[2] * uHat[0]! - u.axis[0] * uHat[2]!,
      u.axis[0] * uHat[1]! - u.axis[1] * uHat[0]!,
    ];
    let maxOcc = 0;
    for (let deg = -40; deg <= 40; deg += 4) {
      const th = (deg * Math.PI) / 180;
      const n0 = uHat.map((x, i) => x * Math.cos(th) + w[i]! * Math.sin(th));
      for (const delta of [0.02, 0.1, 0.25]) {
        const day = norm(n0.map((x, i) => x - delta * u.axis[i]!));
        const night = norm(n0.map((x, i) => x + delta * u.axis[i]!));
        const occDay = solarOcclusionAt(u, day);
        // 거울 짝은 축 수직 거리가 같고 축 방향 거리 z 만 ~2δ R 다르다 — 반경이 2δ·tan f (~0.005·2δ) 만큼 달라지는 몫만 남는다.
        // 1e-3 으로 두었을 때 −28° · δ 0.1 에서 0.0017 로 넘었다 (실측). 밤 반구 게이트가 있으면 밤 쪽이 0 이라 차가 `maxOcc` (> 0.5) 수준이 된다.
        expect(Math.abs(occDay - solarOcclusionAt(u, night)), `${deg}° δ ${delta}`).toBeLessThan(
          0.01,
        );
        maxOcc = Math.max(maxOcc, occDay);
      }
    }
    // 판별력 전제 — terminator 근처 차폐가 실제로 크다 (밤 반구 게이트가 있으면 밤 쪽만 0 이 되어 위 단언이 FAIL).
    expect(maxOcc).toBeGreaterThan(0.5);
  });

  it('반영 · 본영 반경 — 지표 근처 (z ≈ 기본면) 에서 반영 반경 = 판정식 l1, 개기는 l2 < 0 · 금환은 l2 > 0', () => {
    for (const [date, sign] of [
      ['2017-08-21', -1],
      ['2024-04-08', -1],
      ['2023-10-14', 1],
    ] as const) {
      const { u, g } = solarUniformsAt(at(date));
      // 기본면 (지구 중심) 의 z = −a·axis.
      const z = -(u.a[0] * u.axis[0] + u.a[1] * u.axis[1] + u.a[2] * u.axis[2]);
      expect(z * u.k[0] + u.k[1]).toBeCloseTo(g.penumbraRadius, 10);
      expect(z * u.k[2] - u.k[3]).toBeCloseTo(g.umbraRadius, 10);
      // 축이 지표에 닿는 점의 본영 반경 부호 = 종류 (판정식 `umbraAtSurface`).
      const p = axisSurfacePoint(u)!;
      const zs =
        (p[0]! - u.a[0]) * u.axis[0] + (p[1]! - u.a[1]) * u.axis[1] + (p[2]! - u.a[2]) * u.axis[2];
      expect(Math.sign(zs * u.k[2] - u.k[3])).toBe(sign);
    }
  });

  it('식 아님 (+3일) — 그림자 없음 값 · 버퍼 재사용 시에도 이전 값이 남지 않는다', () => {
    const jd = at('2024-04-08');
    const out = noEclipseShadowUniforms();
    const g0 = geometryAt(jd);
    solarEclipseShadowUniforms(g0.moon, g0.sun, RADII, out);
    expect(out.mode).toBe(ECLIPSE_SHADOW_MODE.solar);
    const later = geometryAt(jd + 3);
    solarEclipseShadowUniforms(later.moon, later.sun, RADII, out);
    expect(out).toEqual(noEclipseShadowUniforms());
  });

  it('분류기 교차 — 일식 uniform 은 월식 분류기에서 null, 월식 uniform 은 일식 분류기에서 null', () => {
    const { u } = solarUniformsAt(at('2024-04-08'));
    expect(classifyLunarShadowUniforms(u)).toBeNull();
    const lunarEvent = eventsIn('lunar-eclipse', 2022, 2023).find((e) =>
      e.id.endsWith('2022-11-08'),
    )!;
    const { u: lu } = uniformsAt(lunarEvent.julianDate);
    expect(classifySolarShadowUniforms(lu)).toBeNull();
  });
});
