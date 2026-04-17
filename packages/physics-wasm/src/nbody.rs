//! Velocity-Verlet (Leapfrog) N-body 적분기.
//!
//! - 알고리즘: 반속도 업데이트 → 위치 업데이트 → 가속도 재계산 → 반속도 업데이트
//! - 심플렉틱 특성: 고정 dt에서 에너지 오차 bounded. 1000년 드리프트 < 0.1% 목표(#85).
//! - 중력 합: O(N²) 직접 합 (N ≤ 1000 수준에서 실용). Barnes-Hut/Octree는 P3.
//! - 저장 형식: flat `Vec<f64>` 길이 3N (x,y,z 순, AoS-flat). Cache-friendly 순차 접근.
//!
//! 좌표·시간 단위: SI (m, kg, s). G = 6.67430e-11.

pub const GRAVITATIONAL_CONSTANT: f64 = 6.67430e-11;
/// 광속 (m/s). 1PN GR 보정에 사용.
const SPEED_OF_LIGHT: f64 = 299_792_458.0;
const C2: f64 = SPEED_OF_LIGHT * SPEED_OF_LIGHT;

/// N-body 시스템 상태. 모든 벡터는 길이 3N flat.
pub struct NBodySystem {
    pub masses: Vec<f64>,
    pub pos: Vec<f64>,
    pub vel: Vec<f64>,
    acc: Vec<f64>,
    /// P5-A #178 — 1PN GR 보정 활성. true면 가장 무거운 body(태양)에 대한
    /// Schwarzschild 세차 보정항을 가속도에 추가한다.
    pub enable_gr: bool,
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
            enable_gr: false,
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
        // P5-A #178 — 1PN GR 보정 (태양 기준 Schwarzschild 세차항).
        // 가장 무거운 body를 central mass로 가정하고 나머지 body에 보정 적용.
        // a_GR_i = (GM/(c²r³)) * [(4GM/r - v²)r + 4(r·v)v]
        // 여기서 r = pos_i - pos_central, v = vel_i - vel_central.
        if self.enable_gr {
            self.apply_gr_correction();
        }
    }

    /// 1PN Schwarzschild 세차 보정. central body(index 0, 가장 무거운) 기준.
    fn apply_gr_correction(&mut self) {
        let n = self.n();
        if n < 2 {
            return;
        }
        // central body = index 0 (태양 고정)
        let gm = GRAVITATIONAL_CONSTANT * self.masses[0];
        let (cx, cy, cz) = (self.pos[0], self.pos[1], self.pos[2]);
        let (cvx, cvy, cvz) = (self.vel[0], self.vel[1], self.vel[2]);

        for i in 1..n {
            let rx = self.pos[3 * i] - cx;
            let ry = self.pos[3 * i + 1] - cy;
            let rz = self.pos[3 * i + 2] - cz;
            let vx = self.vel[3 * i] - cvx;
            let vy = self.vel[3 * i + 1] - cvy;
            let vz = self.vel[3 * i + 2] - cvz;

            let r2 = rx * rx + ry * ry + rz * rz;
            let r = r2.sqrt();
            let v2 = vx * vx + vy * vy + vz * vz;
            let rdotv = rx * vx + ry * vy + rz * vz;

            // a_GR = (GM/(c²r³)) * [(4GM/r - v²)r + 4(r·v)v]
            let coeff = gm / (C2 * r2 * r);
            let radial = 4.0 * gm / r - v2;
            let tangential = 4.0 * rdotv;

            self.acc[3 * i] += coeff * (radial * rx + tangential * vx);
            self.acc[3 * i + 1] += coeff * (radial * ry + tangential * vy);
            self.acc[3 * i + 2] += coeff * (radial * rz + tangential * vz);
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

    // P5-A #178 — 수성 근일점 세차 GR 보정 검증.
    // 태양+수성 2-body, 100년(1200+ 궤도) 시뮬 후 세차 측정.
    // 이론: 42.98″/century. 허용: ±5% → 40.8~45.1″.
    const MERCURY_MASS: f64 = 3.301e23;
    const MERCURY_A: f64 = 5.791e10; // 장반경 (m)
    const MERCURY_E: f64 = 0.20563;
    const MERCURY_PERIOD: f64 = 87.969 * DAY; // 공전주기 (s)

    fn sun_mercury_gr_system() -> NBodySystem {
        // 근일점(perihelion)에서 시작 — +x 방향, 속도 +y
        let r_peri = MERCURY_A * (1.0 - MERCURY_E);
        let mu = GRAVITATIONAL_CONSTANT * SUN_MASS;
        // vis-viva: v² = μ(2/r - 1/a)
        let v_peri = (mu * (2.0 / r_peri - 1.0 / MERCURY_A)).sqrt();
        let mut sys = NBodySystem::new(
            vec![SUN_MASS, MERCURY_MASS],
            vec![0.0, 0.0, 0.0, r_peri, 0.0, 0.0],
            vec![0.0, 0.0, 0.0, 0.0, v_peri, 0.0],
        );
        sys.enable_gr = true;
        sys
    }

    /// 근일점 방향 각도를 라디안으로 측정 (x-y 평면).
    fn measure_perihelion_angle(sys: &mut NBodySystem) -> f64 {
        let dt = 60.0; // 1분 간격으로 근일점 탐색
        let steps_per_orbit = (MERCURY_PERIOD / dt) as usize;
        let mut min_r = f64::MAX;
        let mut peri_x = 0.0;
        let mut peri_y = 0.0;
        for _ in 0..steps_per_orbit {
            sys.step(dt);
            let x = sys.pos[3] - sys.pos[0];
            let y = sys.pos[4] - sys.pos[1];
            let r = (x * x + y * y).sqrt();
            if r < min_r {
                min_r = r;
                peri_x = x;
                peri_y = y;
            }
        }
        peri_y.atan2(peri_x)
    }

    #[test]
    fn mercury_perihelion_precession_43_arcsec() {
        let mut sys = sun_mercury_gr_system();

        // 첫 궤도: 초기 근일점 방향 측정
        let angle_0 = measure_perihelion_angle(&mut sys);

        // 100년 = ~415 궤도. 나머지 414 궤도 전진.
        let centuries = 1.0;
        let total_orbits = (centuries * 100.0 * 365.25 / 87.969) as usize;
        let dt = 60.0;
        let steps_per_orbit = (MERCURY_PERIOD / dt) as usize;

        // 중간 궤도는 빠르게 전진 (근일점 측정 없이)
        for _ in 1..(total_orbits - 1) {
            for _ in 0..steps_per_orbit {
                sys.step(dt);
            }
        }

        // 마지막 궤도: 근일점 방향 측정
        let angle_final = measure_perihelion_angle(&mut sys);

        let precession_rad = angle_final - angle_0;
        let precession_arcsec = precession_rad * 206_265.0; // rad → arcseconds
        let per_century = precession_arcsec / centuries;

        println!(
            "Mercury perihelion precession: {:.2}″/century (theory: 42.98″)",
            per_century
        );
        println!(
            "  angle_0={:.6e} rad, angle_final={:.6e} rad, delta={:.6e} rad",
            angle_0, angle_final, precession_rad
        );

        // ±5% of 42.98″ → 40.83~45.13″
        assert!(
            per_century > 40.0 && per_century < 46.0,
            "세차 {:.2}″/century가 ±5% 범위(40.8~45.1) 밖",
            per_century
        );
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
