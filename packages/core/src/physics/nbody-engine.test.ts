/**
 * NBodyEngine (TS) ↔ WASM 코어 왕복 검증 + Kepler state vector 테스트.
 *
 * cargo test는 Rust 측 에너지 보존 검증 (#85). 이 파일은 TS 래퍼 층에서
 * 초기 상태 빌더·서브스텝 분할·역행이 정상 동작하는지 확인한다.
 */
import { describe, expect, it } from 'vitest';
import { GRAVITATIONAL_CONSTANT } from '@astro-simulator/shared';
import { NBodyEngine, buildInitialState, orbitalStateAt } from './index.js';
import { getSolarSystem } from '../ephemeris/solar-system-loader.js';

const AU = 1.495_978_707e11;

describe('orbitalStateAt', () => {
  it('태양 중력장의 지구 궤도 — 속도 크기가 원속도 ~29.78 km/s 근방', () => {
    const system = getSolarSystem();
    const earth = system.bodies.find((b) => b.id === 'earth')!;
    const mu = GRAVITATIONAL_CONSTANT * system.bodies.find((b) => b.id === 'sun')!.mass;
    const { position, velocity } = orbitalStateAt(earth.orbit!, system.epoch, mu);
    const r = Math.hypot(position[0], position[1], position[2]);
    const v = Math.hypot(velocity[0], velocity[1], velocity[2]);
    expect(r / AU).toBeGreaterThan(0.98);
    expect(r / AU).toBeLessThan(1.02);
    expect(v).toBeGreaterThan(29_000);
    expect(v).toBeLessThan(31_000);
  });
});

describe('NBodyEngine (WASM 왕복)', () => {
  it('buildInitialState + step 1회 — 위치가 의미 있게 이동', () => {
    const system = getSolarSystem();
    const state = buildInitialState(system, system.epoch);
    const earthIdx = state.ids.indexOf('earth');
    expect(earthIdx).toBeGreaterThanOrEqual(0);
    const x0 = state.positions[3 * earthIdx]!;
    const y0 = state.positions[3 * earthIdx + 1]!;

    const eng = new NBodyEngine(state);
    eng.advance(86_400); // 1 일
    const p1 = eng.positions();
    const x1 = p1[3 * earthIdx]!;
    const y1 = p1[3 * earthIdx + 1]!;
    const moved = Math.hypot(x1 - x0, y1 - y0);
    // 하루 이동 거리 ≈ v·dt ≈ 29.78 km/s · 86400s ≈ 2.57e9 m
    expect(moved).toBeGreaterThan(2e9);
    expect(moved).toBeLessThan(3e9);
    eng.dispose();
  });

  it('역행(심플렉틱 대칭) — +dt 후 −dt 복귀 오차 < 1e-6 상대', () => {
    const system = getSolarSystem();
    const state = buildInitialState(system, system.epoch);
    const eng = new NBodyEngine(state, { maxSubstepSeconds: 3600 });
    const earthIdx = state.ids.indexOf('earth');
    const p0 = eng.positions();
    eng.advance(86_400 * 10);
    eng.advance(-86_400 * 10);
    const p1 = eng.positions();
    const dx = p1[3 * earthIdx]! - p0[3 * earthIdx]!;
    const dy = p1[3 * earthIdx + 1]! - p0[3 * earthIdx + 1]!;
    const err = Math.hypot(dx, dy);
    const r = Math.hypot(p0[3 * earthIdx]!, p0[3 * earthIdx + 1]!);
    expect(err / r).toBeLessThan(1e-6);
    eng.dispose();
  });
});
