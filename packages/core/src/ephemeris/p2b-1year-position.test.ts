/**
 * P2-B 종합 — 왜소행성/혜성의 1년 후 Kepler 위치가 안정적인지 (#101).
 *
 * 순수 적분기(WASM) 정확도는 #87에서 완료. 이 테스트는 loader → Kepler positionAt으로
 * 1년 후 위치를 계산했을 때 수치가 NaN·무한대·음수 크기 등 이상 없이 반환되는지,
 * 그리고 장반경 대비 허용 범위 내인지를 검증한다.
 */
import { describe, expect, it } from 'vitest';
import { AU, GRAVITATIONAL_CONSTANT, J2000_JD, SOLAR_MASS } from '@astro-simulator/shared';
import { length } from '../coords/vec3.js';
import { positionAt } from '../physics/kepler.js';
import { getSolarSystem } from './solar-system-loader.js';

const MU_SUN = GRAVITATIONAL_CONSTANT * SOLAR_MASS;

describe('P2-B 왜소행성·혜성 1년 위치 수치 건전성', () => {
  const sys = getSolarSystem();
  const targets = sys.bodies.filter((b) => b.kind === 'dwarf-planet' || b.kind === 'comet');

  for (const body of targets) {
    it(`${body.id} 1년 후 위치 유한값 + [peri, apo] 범위`, () => {
      if (!body.orbit) throw new Error(`${body.id} orbit`);
      const p = positionAt(body.orbit, J2000_JD + 365.25, MU_SUN);
      const r = length(p);
      expect(Number.isFinite(r)).toBe(true);
      expect(r).toBeGreaterThan(0);
      const a = body.orbit.semiMajorAxis;
      const e = body.orbit.eccentricity;
      const peri = a * (1 - e);
      const apo = a * (1 + e);
      expect(r).toBeGreaterThanOrEqual(peri * 0.999);
      expect(r).toBeLessThanOrEqual(apo * 1.001);
    });
  }

  it('모든 소천체 태양 거리 합리성 ≥ 수성(0.3 AU) 이상', () => {
    for (const body of targets) {
      if (!body.orbit) continue;
      const p = positionAt(body.orbit, J2000_JD, MU_SUN);
      const rAU = length(p) / AU;
      expect(rAU).toBeGreaterThan(0.3);
    }
  });
});
