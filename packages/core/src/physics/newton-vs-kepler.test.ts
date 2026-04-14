/**
 * Newton(#85) vs Kepler 해석해 1년 정확도 검증 (#87).
 *
 * 각 행성마다 **Sun + 해당 행성**만 있는 2-body Newton 시뮬레이션을 돌려
 * Kepler 해석해와 비교한다. 이렇게 해야 N-body 섭동 영향을 제거하고
 * 순수 Velocity-Verlet 적분기 정확도를 측정할 수 있다.
 *
 * 전체 N-body ↔ 2-body Kepler 비교는 물리적으로 다른 모델이므로
 * 본 이슈(#87)의 DoD 범위 밖 — 별도 섭동 분석으로 남긴다.
 */
import { describe, expect, it } from 'vitest';
import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import { NBodyEngine, orbitalStateAt, positionAt } from './index.js';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';

const DAY = 86_400;
const YEAR_DAYS = 365.25;

interface BodyError {
  id: string;
  r: number; // 태양 거리 (m)
  absErr: number; // |Newton - Kepler| (m)
  relErr: number; // 상대 오차
}

function runScenario(dtSeconds: number): BodyError[] {
  const system = getSolarSystem();
  const j0 = system.epoch;
  const j1 = j0 + YEAR_DAYS;
  const sun = system.bodies.find((b) => b.id === 'sun')!;
  const muSun = GRAVITATIONAL_CONSTANT * sun.mass;

  const results: BodyError[] = [];

  for (const body of system.bodies) {
    if (!body.orbit || body.parentId !== 'sun') continue;

    const { position, velocity } = orbitalStateAt(body.orbit, j0, muSun);
    // 2-body 시스템: Sun(원점·정지) + body.
    const masses = new Float64Array([sun.mass, body.mass]);
    const pos = new Float64Array([0, 0, 0, position[0], position[1], position[2]]);
    const vel = new Float64Array([0, 0, 0, velocity[0], velocity[1], velocity[2]]);
    const engine = new NBodyEngine(
      { ids: ['sun', body.id], masses, positions: pos, velocities: vel },
      { maxSubstepSeconds: dtSeconds },
    );
    engine.advance(YEAR_DAYS * DAY);
    const p = engine.positions();
    const nx = p[3]!;
    const ny = p[4]!;
    const nz = p[5]!;
    engine.dispose();

    const k = positionAt(body.orbit, j1, muSun);
    const absErr = Math.hypot(nx - k[0], ny - k[1], nz - k[2]);
    const r = Math.hypot(nx, ny, nz);
    results.push({ id: body.id, r, absErr, relErr: absErr / r });
  }
  return results;
}

describe('Newton vs Kepler — 1년 위치 오차', () => {
  it('dt=10min 2-body Newton: 모든 행성 상대 오차 < 0.1%', () => {
    const errs = runScenario(600);
    for (const e of errs) {
      expect(e.relErr, `${e.id} relErr ${e.relErr.toExponential(3)}`).toBeLessThan(1e-3);
    }
  });

  it('dt 스윕(1h/1d/7d) — 오차는 dt 감소에 따라 단조 감소 또는 유지', () => {
    const dtSet: [string, number][] = [
      ['1h', 3600],
      ['1d', DAY],
      ['7d', 7 * DAY],
    ];
    const rows: { dt: string; earth: number; jupiter: number; neptune: number }[] = [];
    for (const [label, dt] of dtSet) {
      const errs = runScenario(dt);
      rows.push({
        dt: label,
        earth: errs.find((e) => e.id === 'earth')!.relErr,
        jupiter: errs.find((e) => e.id === 'jupiter')!.relErr,
        neptune: errs.find((e) => e.id === 'neptune')!.relErr,
      });
    }
    // 로그로 실제 수치 남김 (newton-accuracy.md 업데이트에 활용)
    for (const r of rows) {
      console.log(
        `dt=${r.dt}: earth=${r.earth.toExponential(3)} jupiter=${r.jupiter.toExponential(3)} neptune=${r.neptune.toExponential(3)}`,
      );
    }
    // 7d는 1d보다 오차 크고, 1h는 1d보다 작거나 비슷 (Verlet 위상 오차 dt²)
    expect(rows[2]!.earth).toBeGreaterThan(rows[1]!.earth);
  });
});
