import { describe, expect, it } from 'vitest';
import {
  NBODY_VV_PHASE_POST,
  NBODY_VV_PHASE_PRE,
  NBODY_VV_TILE,
  NBODY_VV_WGSL,
} from './nbody-vv-shader';
import { stepVvF32 } from './nbody-vv-cpu';
import { computeForcesF32 } from './nbody-force-cpu';

describe('NBODY_VV_WGSL', () => {
  it('phase 상수 정의', () => {
    expect(NBODY_VV_PHASE_PRE).toBe(0);
    expect(NBODY_VV_PHASE_POST).toBe(1);
  });

  it('TILE 64 + workgroup_size 일치', () => {
    expect(NBODY_VV_TILE).toBe(64);
    expect(NBODY_VV_WGSL).toContain('@workgroup_size(64)');
  });

  it('binding 4개 (params/pos/vel/acc) + read_write 정확', () => {
    expect(NBODY_VV_WGSL).toContain('@binding(0) var<uniform> params');
    expect(NBODY_VV_WGSL).toContain('@binding(1) var<storage, read_write> positions');
    expect(NBODY_VV_WGSL).toContain('@binding(2) var<storage, read_write> velocities');
    expect(NBODY_VV_WGSL).toContain('@binding(3) var<storage, read> accelerations');
  });

  it('phase==0일 때만 위치 업데이트', () => {
    expect(NBODY_VV_WGSL).toMatch(/if\s*\(\s*params\.phase\s*==\s*0u\s*\)/);
  });
});

describe('stepVvF32 (CPU 참조 적분기)', () => {
  const G = 6.6743e-11;
  const SUN_MASS = 1.989e30;
  const AU = 1.495_978_707e11;
  const DAY = 86_400;
  const YEAR = 365.25 * DAY;

  it('Sun-Earth 원궤도 1년 후 (AU, 0) 부근 복귀', () => {
    const v_circ = Math.sqrt((G * SUN_MASS) / AU);
    const positions = new Float32Array([0, 0, 0, AU, 0, 0]);
    const velocities = new Float32Array([0, 0, 0, 0, v_circ, 0]);
    const masses = new Float32Array([SUN_MASS, 5.972e24]);
    const softeningSq = 0;
    let acc = computeForcesF32(positions, masses, softeningSq, G);
    const accBuf = new Float32Array(acc);
    const dt = DAY;
    const steps = Math.floor(YEAR / dt);
    for (let s = 0; s < steps; s++) {
      stepVvF32(positions, velocities, accBuf, masses, dt, softeningSq, G);
    }
    // 지구가 (AU, 0) 부근 복귀 — f32 정밀도라 CPU f64보다 큰 오차 허용
    const dx = (positions[3] ?? 0) - AU;
    const dy = positions[4] ?? 0;
    const err = Math.hypot(dx, dy) / AU;
    expect(err).toBeLessThan(0.05); // 5% 이내 (f32 누적 손실 고려)
  });

  it('적분기 호출이 in-place로 속도 갱신 (가속도 != 0)', () => {
    const positions = new Float32Array([0, 0, 0, 10, 0, 0]);
    const velocities = new Float32Array([0, 0, 0, 0, 0, 0]);
    const masses = new Float32Array([1e25, 1e10]);
    const acc = computeForcesF32(positions, masses, 0, G);
    const beforeVel = velocities[4];
    stepVvF32(positions, velocities, new Float32Array(acc), masses, 1, 0, G);
    // acc[3](x방향)이 비0 → vel[3]도 비0 갱신
    expect(velocities[3]).not.toBe(0);
    // acc[4](y방향)은 0 → vel[4]도 그대로
    expect(velocities[4]).toBe(beforeVel);
  });
});
