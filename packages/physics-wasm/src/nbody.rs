//! Velocity-Verlet (Leapfrog) N-body 적분기.
//!
//! - 알고리즘: 반속도 업데이트 → 위치 업데이트 → 가속도 재계산 → 반속도 업데이트
//! - 심플렉틱 특성: 고정 dt에서 에너지 오차 bounded. 1000년 드리프트 < 0.1% 목표(#85).
//! - 중력 합: O(N²) 직접 합 (N ≤ 1000 수준에서 실용). Barnes-Hut/Octree는 P3.
//! - 저장 형식: flat `Vec<f64>` 길이 3N (x,y,z 순, AoS-flat). Cache-friendly 순차 접근.
//!
//! 좌표·시간 단위: SI (m, kg, s). G = 6.67430e-11.

pub const GRAVITATIONAL_CONSTANT: f64 = 6.67430e-11;

/// N-body 시스템 상태. 모든 벡터는 길이 3N flat.
pub struct NBodySystem {
    pub masses: Vec<f64>,
    pub pos: Vec<f64>,
    pub vel: Vec<f64>,
    acc: Vec<f64>,
}

impl NBodySystem {
    pub fn new(masses: Vec<f64>, pos: Vec<f64>, vel: Vec<f64>) -> Self {
        let n = masses.len();
        assert_eq!(pos.len(), 3 * n, "pos는 3N 길이여야 함");
        assert_eq!(vel.len(), 3 * n, "vel는 3N 길이여야 함");
        let mut sys = Self {
            masses,
            pos,
            vel,
            acc: vec![0.0; 3 * n],
        };
        sys.compute_accelerations();
        sys
    }

    pub fn n(&self) -> usize {
        self.masses.len()
    }

    /// O(N²) 중력 가속도 재계산. acc[i] = Σ_{j≠i} G*m_j*(x_j - x_i)/|r_ij|³.
    fn compute_accelerations(&mut self) {
        let n = self.n();
        for a in self.acc.iter_mut() {
            *a = 0.0;
        }
        for i in 0..n {
            let (xi, yi, zi) = (self.pos[3 * i], self.pos[3 * i + 1], self.pos[3 * i + 2]);
            for j in (i + 1)..n {
                let dx = self.pos[3 * j] - xi;
                let dy = self.pos[3 * j + 1] - yi;
                let dz = self.pos[3 * j + 2] - zi;
                let r2 = dx * dx + dy * dy + dz * dz;
                let r = r2.sqrt();
                // Newton's law: F_ij / m_i = G*m_j/r² · r̂. 뉴턴 3법칙으로 j→i는 부호 반전.
                let inv_r3 = 1.0 / (r2 * r);
                let s_i = GRAVITATIONAL_CONSTANT * self.masses[j] * inv_r3;
                let s_j = GRAVITATIONAL_CONSTANT * self.masses[i] * inv_r3;
                self.acc[3 * i] += s_i * dx;
                self.acc[3 * i + 1] += s_i * dy;
                self.acc[3 * i + 2] += s_i * dz;
                self.acc[3 * j] -= s_j * dx;
                self.acc[3 * j + 1] -= s_j * dy;
                self.acc[3 * j + 2] -= s_j * dz;
            }
        }
    }

    /// Velocity-Verlet 1 스텝.
    /// v ← v + ½ a dt;  x ← x + v dt;  a ← a(x);  v ← v + ½ a dt
    pub fn step(&mut self, dt: f64) {
        let n3 = self.n() * 3;
        // 1) v_half
        for k in 0..n3 {
            self.vel[k] += 0.5 * self.acc[k] * dt;
        }
        // 2) x_new
        for k in 0..n3 {
            self.pos[k] += self.vel[k] * dt;
        }
        // 3) a_new (self.acc 갱신)
        self.compute_accelerations();
        // 4) v_new
        for k in 0..n3 {
            self.vel[k] += 0.5 * self.acc[k] * dt;
        }
    }

    /// 총 에너지 = 운동E + 중력 퍼텐셜E. 심플렉틱 드리프트 검증용.
    pub fn total_energy(&self) -> f64 {
        let n = self.n();
        let mut ke = 0.0;
        for i in 0..n {
            let v2 = self.vel[3 * i].powi(2)
                + self.vel[3 * i + 1].powi(2)
                + self.vel[3 * i + 2].powi(2);
            ke += 0.5 * self.masses[i] * v2;
        }
        let mut pe = 0.0;
        for i in 0..n {
            for j in (i + 1)..n {
                let dx = self.pos[3 * j] - self.pos[3 * i];
                let dy = self.pos[3 * j + 1] - self.pos[3 * i + 1];
                let dz = self.pos[3 * j + 2] - self.pos[3 * i + 2];
                let r = (dx * dx + dy * dy + dz * dz).sqrt();
                pe -= GRAVITATIONAL_CONSTANT * self.masses[i] * self.masses[j] / r;
            }
        }
        ke + pe
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    const SUN_MASS: f64 = 1.989e30;
    const EARTH_MASS: f64 = 5.972e24;
    const AU: f64 = 1.495_978_707e11;
    const DAY: f64 = 86_400.0;
    const YEAR: f64 = 365.25 * DAY;

    /// 태양-지구 2-body 원궤도 초기 상태 구성.
    fn sun_earth_system() -> NBodySystem {
        let v_circ = (GRAVITATIONAL_CONSTANT * SUN_MASS / AU).sqrt();
        NBodySystem::new(
            vec![SUN_MASS, EARTH_MASS],
            vec![0.0, 0.0, 0.0, AU, 0.0, 0.0],
            vec![0.0, 0.0, 0.0, 0.0, v_circ, 0.0],
        )
    }

    #[test]
    fn energy_conserved_1000_years() {
        // Sun-Earth 원궤도, dt = 1 day, 1000년 → 드리프트 < 0.1% (1e-3)
        let mut sys = sun_earth_system();
        let e0 = sys.total_energy();
        let dt = DAY;
        let steps = (1000.0 * YEAR / dt) as usize;
        for _ in 0..steps {
            sys.step(dt);
        }
        let e1 = sys.total_energy();
        let drift = ((e1 - e0) / e0).abs();
        println!(
            "1000y Verlet drift: {:.3e} (E0={:.3e}, E1={:.3e}, steps={})",
            drift, e0, e1, steps
        );
        assert!(
            drift < 1e-3,
            "에너지 드리프트 {:.3e} ≥ 0.1% — 심플렉틱 특성 위반",
            drift
        );
    }

    #[test]
    fn circular_orbit_position_returns_after_one_year() {
        // 1년 후 지구는 초기 위치 부근으로 복귀
        let mut sys = sun_earth_system();
        let dt = DAY;
        let steps = (YEAR / dt) as usize;
        for _ in 0..steps {
            sys.step(dt);
        }
        let x = sys.pos[3];
        let y = sys.pos[4];
        let r = (x * x + y * y).sqrt();
        let r_err = (r - AU).abs() / AU;
        let theta_err = y.atan2(x).abs(); // 초기 +X 방향 복귀
        println!(
            "1y return: r_err={:.3e}, theta_err={:.3e} rad (x={:.3e}, y={:.3e})",
            r_err, theta_err, x, y
        );
        // 반경은 심플렉틱이 잘 보존, 위상은 dt=1day 수준에서 수 mrad
        assert!(r_err < 1e-3, "반경 오차 {:.3e}", r_err);
        assert!(theta_err < 0.02, "위상 오차 {:.3e} rad", theta_err);
    }

    #[test]
    fn bench_step_costs_various_n() {
        // N=[10,100,200,1000] 1 step 비용 측정. 실패 조건 없음 — 수치만 기록.
        use std::time::Instant;
        for &n in &[10usize, 100, 200, 1000] {
            let mut masses = vec![1e24; n];
            masses[0] = SUN_MASS;
            let mut pos = vec![0.0; 3 * n];
            let mut vel = vec![0.0; 3 * n];
            for i in 1..n {
                let r = AU * (1.0 + i as f64 * 0.01);
                pos[3 * i] = r;
                vel[3 * i + 1] = (GRAVITATIONAL_CONSTANT * SUN_MASS / r).sqrt();
            }
            let mut sys = NBodySystem::new(masses, pos, vel);
            let iters = 10;
            let t0 = Instant::now();
            for _ in 0..iters {
                sys.step(DAY);
            }
            let per_step_us = t0.elapsed().as_secs_f64() * 1e6 / iters as f64;
            println!("N={:4}: {:.1} µs/step", n, per_step_us);
        }
    }
}
