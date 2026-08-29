/**
 * #849 — physics-wasm ↔ TS 바인딩 스모크 확장.
 *
 * cargo test (Rust 63+건) 는 물리 로직을 검증하지만 wasm-bindgen 경계
 * (Vec<f64> ↔ Float64Array marshalling / u8 enum 왕복) 회귀는 잡지 못한다.
 * 본 파일은 바인딩 표면을 3체 미니 시스템으로 왕복 검증한다 — 물리 정밀도
 * 단언은 Rust 측 책임이므로 여기서는 형상 (길이·유한값·에너지 부호) 중심.
 *
 * 결정성: 초기 조건은 전부 고정 상수 (Math.random 금지) — 실패 시 항상 재현 가능.
 */
import { describe, expect, it } from 'vitest';
import {
  BarnesHutEngine,
  NBodyEngine,
  add,
  extract_osculating_elements,
} from '../pkg/physics_wasm.js';

// 결정적 3체 미니 시스템 (SI): 중심별 + 원궤도 행성 2 (1 AU / 1.5 AU, 위상 90° 분리).
const G = 6.674_3e-11;
const M_STAR = 1.989e30;
const M_PLANET = 5.972e24;
const AU = 1.495_978_707e11;

function threeBodySystem() {
  const r1 = AU;
  const r2 = 1.5 * AU;
  const v1 = Math.sqrt((G * M_STAR) / r1);
  const v2 = Math.sqrt((G * M_STAR) / r2);
  return {
    masses: new Float64Array([M_STAR, M_PLANET, M_PLANET]),
    pos: new Float64Array([0, 0, 0, r1, 0, 0, 0, r2, 0]),
    vel: new Float64Array([0, 0, 0, 0, v1, 0, -v2, 0, 0]),
  };
}

const DT_SECONDS = 3600;
const STEP_COUNT = 24; // 1일 — step 소수 회 (보존 근사 확인 목적, 장기 적분은 Rust/CI 영역)

describe('physics-wasm ↔ TS binding', () => {
  it('add() — WASM 왕복 스모크', () => {
    expect(add(1.5, 2.25)).toBe(3.75);
    expect(add(-1, 1)).toBe(0);
  });
});

describe('#849 NBodyEngine — 3체 생성→step→positions/total_energy 왕복', () => {
  it('생성 → n=3, positions/velocities 는 3N(9) Float64Array + 전 원소 유한', () => {
    const { masses, pos, vel } = threeBodySystem();
    const eng = new NBodyEngine(masses, pos, vel);
    expect(eng.n()).toBe(3);

    const p = eng.positions();
    const v = eng.velocities();
    expect(p).toBeInstanceOf(Float64Array); // Vec<f64> marshalling 형상 핀
    expect(p).toHaveLength(9);
    expect(v).toHaveLength(9);
    expect([...p, ...v].every((x) => Number.isFinite(x))).toBe(true);
  });

  it('step ×24 (1일) — 위치 이동 + 에너지 부호(<0, 속박계) + 상대 드리프트 < 1e-6', () => {
    const { masses, pos, vel } = threeBodySystem();
    const eng = new NBodyEngine(masses, pos, vel);
    const e0 = eng.total_energy();
    expect(Number.isFinite(e0)).toBe(true);
    expect(e0).toBeLessThan(0); // 속박계 총 에너지 음수

    for (let i = 0; i < STEP_COUNT; i += 1) eng.step(DT_SECONDS);

    const p1 = eng.positions();
    // 1 AU 행성 1일 이동 ≈ v·t ≈ 29.78 km/s × 86400 s ≈ 2.57e9 m
    const moved = Math.hypot(p1[3]! - AU, p1[4]!, p1[5]!);
    expect(moved).toBeGreaterThan(2e9);
    expect(moved).toBeLessThan(3e9);

    const e1 = eng.total_energy();
    expect(Math.abs(e1 - e0) / Math.abs(e0)).toBeLessThan(1e-6); // 심플렉틱 보존 근사
  });

  it('step_chunked — total_dt 를 max_dt 서브스텝으로 분할해도 유한 상태 유지', () => {
    const { masses, pos, vel } = threeBodySystem();
    const eng = new NBodyEngine(masses, pos, vel);
    const e0 = eng.total_energy();
    eng.step_chunked(86_400, DT_SECONDS);
    expect(Math.abs(eng.total_energy() - e0) / Math.abs(e0)).toBeLessThan(1e-6);
    expect([...eng.positions()].every((x) => Number.isFinite(x))).toBe(true);
  });

  it('u8 enum 경계 — set_gr_mode 0/1/2 왕복 + 미지값 → Off(0) 폴백', () => {
    const { masses, pos, vel } = threeBodySystem();
    const eng = new NBodyEngine(masses, pos, vel);
    expect(eng.gr_mode()).toBe(0); // 기본 Off

    eng.set_gr_mode(1);
    expect(eng.gr_mode()).toBe(1); // Single1PN
    expect(eng.gr_enabled()).toBe(true);

    eng.set_gr_mode(2);
    expect(eng.gr_mode()).toBe(2); // EIH1PN

    eng.set_gr_mode(255); // 미지값 — panic 아닌 Off 폴백 (u8 marshalling 경계)
    expect(eng.gr_mode()).toBe(0);
    expect(eng.gr_enabled()).toBe(false);

    eng.set_gr(true); // P5-A 호환 wrapper
    expect(eng.gr_mode()).toBe(1);
  });

  it('u8 enum 경계 — set_integrator 0/1 왕복 + 미지값 → Velocity-Verlet(0) 폴백', () => {
    const { masses, pos, vel } = threeBodySystem();
    const eng = new NBodyEngine(masses, pos, vel);
    expect(eng.integrator()).toBe(0);
    eng.set_integrator(1);
    expect(eng.integrator()).toBe(1); // Yoshida4
    eng.set_integrator(9);
    expect(eng.integrator()).toBe(0); // 폴백
  });
});

describe('#849 BarnesHutEngine — 3체 생성→step→positions/total_energy 왕복', () => {
  const THETA = 0.5;
  const SOFTENING = 1e3; // 최근접 쌍(≈0.5 AU) 대비 극소 — 에너지 계산 왜곡 무시 가능

  it('생성 → n=3, theta 왕복(f64 marshalling), positions 형상', () => {
    const { masses, pos, vel } = threeBodySystem();
    const eng = new BarnesHutEngine(masses, pos, vel, THETA, SOFTENING);
    expect(eng.n()).toBe(3);
    expect(eng.theta()).toBe(THETA);
    eng.set_theta(0.7);
    expect(eng.theta()).toBe(0.7);

    const p = eng.positions();
    expect(p).toBeInstanceOf(Float64Array);
    expect(p).toHaveLength(9);
    expect(eng.velocities()).toHaveLength(9);
  });

  it('step ×24 — 에너지 부호(<0) + 상대 드리프트 < 1e-5 (BH 근사 오차 여유)', () => {
    const { masses, pos, vel } = threeBodySystem();
    const eng = new BarnesHutEngine(masses, pos, vel, THETA, SOFTENING);
    const e0 = eng.total_energy();
    expect(e0).toBeLessThan(0);

    for (let i = 0; i < STEP_COUNT; i += 1) eng.step(DT_SECONDS);

    expect(Math.abs(eng.total_energy() - e0) / Math.abs(e0)).toBeLessThan(1e-5);
    expect([...eng.positions()].every((x) => Number.isFinite(x))).toBe(true);
  });

  it('step_chunked — 서브스텝 분할 경로 유한 상태 유지', () => {
    const { masses, pos, vel } = threeBodySystem();
    const eng = new BarnesHutEngine(masses, pos, vel, THETA, SOFTENING);
    eng.step_chunked(86_400, DT_SECONDS);
    expect([...eng.positions()].every((x) => Number.isFinite(x))).toBe(true);
  });
});

describe('#849 extract_osculating_elements — 바인딩 스모크', () => {
  const MU_JUPITER = G * 1.898_2e27;

  it('원궤도 (Europa 장반경) → 길이 7 + a 복원 + e<1e-6 + singularity=1', () => {
    // Rust 측 osculating_wasm_export_length_and_order 와 동형 케이스 — JS 경계 통과 검증.
    const r = 671_100_000;
    const v = Math.sqrt(MU_JUPITER / r);
    const out = extract_osculating_elements(r, 0, 0, 0, v, 0, MU_JUPITER);
    expect(out).toBeInstanceOf(Float64Array); // flat Vec<f64>(7) marshalling 핀
    expect(out).toHaveLength(7);
    expect(Math.abs(out[0]! - r) / r).toBeLessThan(1e-6); // a
    expect(out[1]!).toBeLessThan(1e-6); // e
    expect(out[6]).toBe(1); // singularity — 원순환 근사
  });

  it('경사 타원 (e=0.3, i=30°) 근점 상태 → a/e/i 복원 + singularity=0', () => {
    const a = 671_100_000;
    const e = 0.3;
    const inc = Math.PI / 6;
    const rp = a * (1 - e);
    const vp = Math.sqrt((MU_JUPITER * (1 + e)) / rp);
    // 근점 (rp, 0, 0), 속도는 궤도면을 i 만큼 기울여 (0, vp·cos i, vp·sin i).
    const out = extract_osculating_elements(
      rp,
      0,
      0,
      0,
      vp * Math.cos(inc),
      vp * Math.sin(inc),
      MU_JUPITER,
    );
    expect(out).toHaveLength(7);
    expect(Math.abs(out[0]! - a) / a).toBeLessThan(1e-6); // a
    expect(out[1]!).toBeCloseTo(e, 6); // e
    expect(out[2]!).toBeCloseTo(inc, 6); // i
    expect(out[6]).toBe(0); // 비특이 궤도
    expect([...out].every((x) => Number.isFinite(x))).toBe(true); // Ω/ω/M 포함 전 원소 유한
  });
});
