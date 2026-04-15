//! P3-A #133 — 태양계 8행성 1년 시뮬에서 Newton 직접합 대비 Barnes-Hut 정확도 검증.
//!
//! P3 계약: theta=0.5에서 각 행성 위치 상대오차 <0.1%.
//! N=9 (Sun + 8 planets)로 작아 트리 워크 vs 직접합 정확도 차이만 본다.
//! (성능 우위는 #134 N=5000+에서 측정.)
//!
//! 초기 조건: 단순화된 원궤도 가정 (실제 SPICE 데이터 대비 오차 무관 — 두 적분기를
//! 동일 초기 상태에서 시작해 상대 비교만 한다).

use physics_wasm::barnes_hut::engine::BarnesHutSystem;
use physics_wasm::nbody::{NBodySystem, GRAVITATIONAL_CONSTANT};

const SUN_MASS: f64 = 1.989e30;
const AU: f64 = 1.495_978_707e11;
const DAY: f64 = 86_400.0;
const YEAR: f64 = 365.25 * DAY;

/// 행성: 질량(kg), 평균 반장축(AU)
const PLANETS: &[(f64, f64)] = &[
    (3.301e23, 0.387),  // Mercury
    (4.867e24, 0.723),  // Venus
    (5.972e24, 1.000),  // Earth
    (6.417e23, 1.524),  // Mars
    (1.898e27, 5.203),  // Jupiter
    (5.683e26, 9.537),  // Saturn
    (8.681e25, 19.191), // Uranus
    (1.024e26, 30.069), // Neptune
];

fn build_initial() -> (Vec<f64>, Vec<f64>, Vec<f64>) {
    let mut masses = vec![SUN_MASS];
    let mut pos = vec![0.0, 0.0, 0.0];
    let mut vel = vec![0.0, 0.0, 0.0];
    for (i, &(m, a_au)) in PLANETS.iter().enumerate() {
        let a = a_au * AU;
        // 각 행성을 균등한 위상 각도에 배치 (시계방향 원궤도)
        let theta = i as f64 * std::f64::consts::TAU / PLANETS.len() as f64;
        let v_circ = (GRAVITATIONAL_CONSTANT * SUN_MASS / a).sqrt();
        masses.push(m);
        pos.extend_from_slice(&[a * theta.cos(), a * theta.sin(), 0.0]);
        // 접선 방향 속도
        vel.extend_from_slice(&[-v_circ * theta.sin(), v_circ * theta.cos(), 0.0]);
    }
    (masses, pos, vel)
}

fn integrate_year_direct(
    masses: Vec<f64>,
    pos: Vec<f64>,
    vel: Vec<f64>,
    dt: f64,
) -> Vec<f64> {
    let mut sys = NBodySystem::new(masses, pos, vel);
    let steps = (YEAR / dt) as usize;
    for _ in 0..steps {
        sys.step(dt);
    }
    sys.pos
}

fn integrate_year_bh(
    masses: Vec<f64>,
    pos: Vec<f64>,
    vel: Vec<f64>,
    dt: f64,
    theta: f64,
) -> (Vec<f64>, std::time::Duration) {
    let mut sys = BarnesHutSystem::new(masses, pos, vel, theta);
    let steps = (YEAR / dt) as usize;
    let t0 = std::time::Instant::now();
    for _ in 0..steps {
        sys.step(dt);
    }
    (sys.pos, t0.elapsed())
}

fn integrate_year_direct_timed(
    masses: Vec<f64>,
    pos: Vec<f64>,
    vel: Vec<f64>,
    dt: f64,
) -> (Vec<f64>, std::time::Duration) {
    let mut sys = NBodySystem::new(masses, pos, vel);
    let steps = (YEAR / dt) as usize;
    let t0 = std::time::Instant::now();
    for _ in 0..steps {
        sys.step(dt);
    }
    (sys.pos, t0.elapsed())
}

fn max_relative_position_error(reference: &[f64], compared: &[f64]) -> (f64, usize) {
    let n = reference.len() / 3;
    let mut max_err = 0.0_f64;
    let mut max_i = 0;
    for i in 0..n {
        let rx = reference[3 * i];
        let ry = reference[3 * i + 1];
        let rz = reference[3 * i + 2];
        let r_mag = (rx * rx + ry * ry + rz * rz).sqrt();
        let cx = compared[3 * i];
        let cy = compared[3 * i + 1];
        let cz = compared[3 * i + 2];
        let dx = rx - cx;
        let dy = ry - cy;
        let dz = rz - cz;
        let err = (dx * dx + dy * dy + dz * dz).sqrt() / r_mag.max(1e-30);
        if err > max_err {
            max_err = err;
            max_i = i;
        }
    }
    (max_err, max_i)
}

#[test]
fn theta_half_within_0_1_percent_one_year() {
    let (m, p, v) = build_initial();
    let dt = DAY;
    let direct = integrate_year_direct(m.clone(), p.clone(), v.clone(), dt);
    let (bh, _) = integrate_year_bh(m, p, v, dt, 0.5);
    let (max_err, idx) = max_relative_position_error(&direct, &bh);
    eprintln!(
        "theta=0.5 1y: max relative position error = {:.4e} (body idx={})",
        max_err, idx
    );
    assert!(
        max_err < 1e-3,
        "P3 계약 위반: max relative error {:.4e} ≥ 0.1% (body idx={})",
        max_err,
        idx
    );
}

#[test]
fn theta_sweep_accuracy_and_speed() {
    // P3-A 계약: theta 0.3/0.5/0.7 정확도+속도 표를 콘솔에 출력.
    // CI에서도 30s 안에 끝나도록 dt=DAY (steps ~ 365).
    let (m, p, v) = build_initial();
    let dt = DAY;
    let (direct, t_direct) = integrate_year_direct_timed(m.clone(), p.clone(), v.clone(), dt);

    println!("\n=== Barnes-Hut theta sweep (8 planets, 1 year, dt=1 day) ===");
    println!(
        "{:>8} {:>16} {:>20}",
        "theta", "max_rel_err", "wallclock (ms)"
    );
    println!("{:>8} {:>16.4e} {:>20.2}", "direct", 0.0, t_direct.as_secs_f64() * 1000.0);
    for &theta in &[0.3, 0.5, 0.7] {
        let (bh, t_bh) = integrate_year_bh(m.clone(), p.clone(), v.clone(), dt, theta);
        let (err, _) = max_relative_position_error(&direct, &bh);
        println!(
            "{:>8.2} {:>16.4e} {:>20.2}",
            theta,
            err,
            t_bh.as_secs_f64() * 1000.0
        );
        // 모든 theta에서 최소 1% 오차 가드 (회귀 감지용)
        assert!(err < 1e-2, "theta={} max err {:.4e} ≥ 1%", theta, err);
    }
}
