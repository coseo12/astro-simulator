//! Barnes-Hut Velocity-Verlet 적분기 (#132).
//!
//! 알고리즘은 `nbody::NBodySystem`과 동일한 심플렉틱 V-V를 사용하되, O(N²) 직접합 대신
//! 매 스텝 octree를 새로 빌드하고 트리 워크로 force를 계산한다.
//!
//! 트리 재빌드 비용
//! ----------------
//! 매 스텝마다 위치가 변하므로 octree를 재빌드한다. 빌드는 O(N log N)이고
//! 트리 워크 force 계산도 O(N log N) — 합쳐 O(N log N) per step.
//! 직접합 O(N²)을 N≈500 이상에서 추월한다.
//!
//! softening
//! ---------
//! `softening_sq`는 close-encounter 발산을 막기 위한 ε². Newton 직접합과 동일한 값을
//! 권장 (현재 직접합은 hard sphere라 ε=0이지만 BH는 노드 단위 평균이라 가까이 갈 수 있어
//! 안전을 위해 작은 값 권장: ε² ~ (0.01 × cell_min_size)²).

use super::octree::{Aabb, Octree, Particle};
use crate::nbody::GRAVITATIONAL_CONSTANT;

/// Barnes-Hut N-body 시스템 상태.
pub struct BarnesHutSystem {
    pub masses: Vec<f64>,
    pub pos: Vec<f64>,
    pub vel: Vec<f64>,
    acc: Vec<f64>,
    /// MAC 임계값. 0=직접합, 0.5 권장, 0.7 빠름.
    pub theta: f64,
    /// 발산 방지용 ε². 0이면 끄기.
    pub softening_sq: f64,
    /// 빌드 시 입자가 누락되지 않도록 bounds에 추가하는 padding 비율 (1.05 = 5%).
    pub bounds_pad: f64,
}

impl BarnesHutSystem {
    pub fn new(masses: Vec<f64>, pos: Vec<f64>, vel: Vec<f64>, theta: f64) -> Self {
        let n = masses.len();
        assert_eq!(pos.len(), 3 * n, "pos는 3N 길이여야 함");
        assert_eq!(vel.len(), 3 * n, "vel는 3N 길이여야 함");
        let mut sys = Self {
            masses,
            pos,
            vel,
            acc: vec![0.0; 3 * n],
            theta,
            softening_sq: 0.0,
            bounds_pad: 1.05,
        };
        sys.compute_accelerations();
        sys
    }

    pub fn n(&self) -> usize {
        self.masses.len()
    }

    /// Velocity-Verlet 1 스텝 (nbody.rs와 동일 알고리즘).
    pub fn step(&mut self, dt: f64) {
        let n3 = self.n() * 3;
        for k in 0..n3 {
            self.vel[k] += 0.5 * self.acc[k] * dt;
        }
        for k in 0..n3 {
            self.pos[k] += self.vel[k] * dt;
        }
        self.compute_accelerations();
        for k in 0..n3 {
            self.vel[k] += 0.5 * self.acc[k] * dt;
        }
    }

    /// Octree 재빌드 + 트리 워크 force.
    fn compute_accelerations(&mut self) {
        let n = self.n();
        let particles = self.particles_view();
        let bounds = fit_bounds(&particles, self.bounds_pad);
        let mut tree = Octree::build(&particles, bounds);
        tree.compute_com(&particles);
        for i in 0..n {
            let pos = [self.pos[3 * i], self.pos[3 * i + 1], self.pos[3 * i + 2]];
            let f = tree.compute_force(
                pos,
                Some(i as u32),
                &particles,
                self.theta,
                self.softening_sq,
                GRAVITATIONAL_CONSTANT,
            );
            // f는 가속도 (compute_force는 G*m/r³ 합 = 가속도 단위)
            self.acc[3 * i] = f[0];
            self.acc[3 * i + 1] = f[1];
            self.acc[3 * i + 2] = f[2];
        }
    }

    fn particles_view(&self) -> Vec<Particle> {
        (0..self.n())
            .map(|i| Particle {
                position: [self.pos[3 * i], self.pos[3 * i + 1], self.pos[3 * i + 2]],
                mass: self.masses[i],
            })
            .collect()
    }

    /// 총 에너지 (드리프트 검증용). nbody.rs와 동일 로직.
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

fn fit_bounds(particles: &[Particle], pad: f64) -> Aabb {
    let mut mn = [f64::INFINITY; 3];
    let mut mx = [f64::NEG_INFINITY; 3];
    for p in particles {
        for k in 0..3 {
            if p.position[k] < mn[k] {
                mn[k] = p.position[k];
            }
            if p.position[k] > mx[k] {
                mx[k] = p.position[k];
            }
        }
    }
    let cx = 0.5 * (mn[0] + mx[0]);
    let cy = 0.5 * (mn[1] + mx[1]);
    let cz = 0.5 * (mn[2] + mx[2]);
    let half = ((mx[0] - mn[0]).max(mx[1] - mn[1]).max(mx[2] - mn[2])) * 0.5 * pad;
    // 정육면체 bounds — octant 분할이 균등해 트리 깊이 최소화
    Aabb::new([cx - half, cy - half, cz - half], [cx + half, cy + half, cz + half])
}

#[cfg(test)]
mod tests {
    use super::*;

    const SUN_MASS: f64 = 1.989e30;
    const EARTH_MASS: f64 = 5.972e24;
    const AU: f64 = 1.495_978_707e11;
    const DAY: f64 = 86_400.0;
    const YEAR: f64 = 365.25 * DAY;

    fn sun_earth() -> BarnesHutSystem {
        let v_circ = (GRAVITATIONAL_CONSTANT * SUN_MASS / AU).sqrt();
        BarnesHutSystem::new(
            vec![SUN_MASS, EARTH_MASS],
            vec![0.0, 0.0, 0.0, AU, 0.0, 0.0],
            vec![0.0, 0.0, 0.0, 0.0, v_circ, 0.0],
            0.0, // theta=0 → 직접합과 동일 (2-body라 의미 없지만 검증용)
        )
    }

    #[test]
    fn step_with_theta_zero_matches_direct_sum_within_tolerance() {
        // theta=0이면 BarnesHut과 nbody의 1년 시뮬 결과가 거의 동일해야.
        use crate::nbody::NBodySystem;
        let v_circ = (GRAVITATIONAL_CONSTANT * SUN_MASS / AU).sqrt();
        let mut bh = BarnesHutSystem::new(
            vec![SUN_MASS, EARTH_MASS],
            vec![0.0, 0.0, 0.0, AU, 0.0, 0.0],
            vec![0.0, 0.0, 0.0, 0.0, v_circ, 0.0],
            0.0,
        );
        let mut ds = NBodySystem::new(
            vec![SUN_MASS, EARTH_MASS],
            vec![0.0, 0.0, 0.0, AU, 0.0, 0.0],
            vec![0.0, 0.0, 0.0, 0.0, v_circ, 0.0],
        );
        let dt = DAY;
        let steps = (YEAR / dt) as usize;
        for _ in 0..steps {
            bh.step(dt);
            ds.step(dt);
        }
        // 1년 후 위치 비교 — 누적 적분 차이는 부동소수 한계 내 작아야
        let dx = bh.pos[3] - ds.pos[3];
        let dy = bh.pos[4] - ds.pos[4];
        let rel = ((dx * dx + dy * dy).sqrt()) / AU;
        assert!(rel < 1e-9, "1년 적분 후 BH(θ=0) vs 직접합 위치 차이 {:.2e} AU", rel);
    }

    #[test]
    fn circular_orbit_returns_after_one_year() {
        let mut sys = sun_earth();
        let dt = DAY;
        let steps = (YEAR / dt) as usize;
        for _ in 0..steps {
            sys.step(dt);
        }
        // 지구가 초기 (AU, 0)으로 복귀
        let dx = sys.pos[3] - AU;
        let dy = sys.pos[4];
        let err = ((dx * dx + dy * dy).sqrt()) / AU;
        assert!(err < 0.01, "1년 후 위치 오차 {:.4} AU > 1%", err);
    }

    #[test]
    fn n10_step_theta_zero_matches_direct_sum() {
        // DoD #132: N=10 step 1회 후 Newton 직접합과 위치 오차 <1e-6 (theta=0)
        use crate::nbody::NBodySystem;
        let n = 10;
        let masses: Vec<f64> = (0..n).map(|i| 1.0e22 * (i as f64 + 1.0)).collect();
        let pos: Vec<f64> = (0..n)
            .flat_map(|i| {
                let t = i as f64 * std::f64::consts::TAU / n as f64;
                [AU * t.cos(), AU * t.sin(), 0.0]
            })
            .collect();
        let vel: Vec<f64> = vec![0.0; 3 * n];
        let mut bh = BarnesHutSystem::new(masses.clone(), pos.clone(), vel.clone(), 0.0);
        let mut ds = NBodySystem::new(masses, pos, vel);
        let dt = 60.0;
        bh.step(dt);
        ds.step(dt);
        for i in 0..n {
            for k in 0..3 {
                let diff = (bh.pos[3 * i + k] - ds.pos[3 * i + k]).abs() / AU;
                assert!(
                    diff < 1e-6,
                    "i={} k={} 상대오차 {:.2e} ≥ 1e-6 AU",
                    i,
                    k,
                    diff
                );
            }
        }
    }

    #[test]
    fn energy_drift_under_one_percent_100_years() {
        let mut sys = sun_earth();
        let e0 = sys.total_energy();
        let dt = DAY;
        let steps = (100.0 * YEAR / dt) as usize;
        for _ in 0..steps {
            sys.step(dt);
        }
        let e1 = sys.total_energy();
        let drift = ((e1 - e0) / e0).abs();
        eprintln!("BH 100y 에너지 드리프트: {:.3e}", drift);
        assert!(drift < 0.01, "100년 에너지 드리프트 {:.3e} > 1%", drift);
    }
}
