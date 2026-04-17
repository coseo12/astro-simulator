//! astro-simulator Newton N-body WASM 코어.
//!
//! - `add`: TS ↔ WASM 왕복 스모크 (#84)
//! - `nbody`: Velocity-Verlet 적분기 + O(N²) 중력 합 (#85)
//! - `NBodyEngine`: WASM export 래퍼 — TS에서 직접 사용 (#86)
//!
//! 좌표계: SI 단위 (m, kg, s). 위치/속도는 3N-flat `Vec<f64>` (AoS-flat).
//! 심플렉틱 특성상 고정 dt에서 에너지 오차가 장기적으로 bounded oscillation.

use wasm_bindgen::prelude::*;

pub mod barnes_hut;
pub mod nbody;

use barnes_hut::engine::BarnesHutSystem;
use nbody::NBodySystem;

/// 스모크 테스트용 함수. #84.
#[wasm_bindgen]
pub fn add(a: f64, b: f64) -> f64 {
    a + b
}

/// NBodySystem을 WASM으로 노출하는 래퍼. TS는 Float64Array를 그대로 주고받는다.
#[wasm_bindgen]
pub struct NBodyEngine {
    inner: NBodySystem,
}

#[wasm_bindgen]
impl NBodyEngine {
    /// masses(N) · pos(3N) · vel(3N) 로 초기화. 길이 불일치 시 panic.
    #[wasm_bindgen(constructor)]
    pub fn new(masses: Vec<f64>, pos: Vec<f64>, vel: Vec<f64>) -> NBodyEngine {
        NBodyEngine {
            inner: NBodySystem::new(masses, pos, vel),
        }
    }

    pub fn n(&self) -> usize {
        self.inner.n()
    }

    /// P5-A #178 — 1PN GR 보정 on/off. 기본 false.
    pub fn set_gr(&mut self, enable: bool) {
        self.inner.enable_gr = enable;
    }

    pub fn gr_enabled(&self) -> bool {
        self.inner.enable_gr
    }

    /// 1 스텝 전진(Velocity-Verlet). 역행은 dt < 0.
    pub fn step(&mut self, dt: f64) {
        self.inner.step(dt);
    }

    /// max_dt 이하로 내부 서브스텝 분할하여 total_dt만큼 적분.
    pub fn step_chunked(&mut self, total_dt: f64, max_dt: f64) {
        let abs = total_dt.abs();
        if abs == 0.0 {
            return;
        }
        let sub_count = (abs / max_dt).ceil() as usize;
        let sub_dt = total_dt / sub_count as f64;
        for _ in 0..sub_count {
            self.inner.step(sub_dt);
        }
    }

    /// 현재 위치 3N flat.
    pub fn positions(&self) -> Vec<f64> {
        self.inner.pos.clone()
    }

    /// 현재 속도 3N flat.
    pub fn velocities(&self) -> Vec<f64> {
        self.inner.vel.clone()
    }

    pub fn total_energy(&self) -> f64 {
        self.inner.total_energy()
    }
}

/// Barnes-Hut O(N log N) 가속 엔진 (P3-A #132).
/// `NBodyEngine`과 동일 시그니처 — JS는 동일한 어댑터로 두 엔진을 교체 가능.
#[wasm_bindgen]
pub struct BarnesHutEngine {
    inner: BarnesHutSystem,
}

#[wasm_bindgen]
impl BarnesHutEngine {
    /// `theta`: MAC 임계값 (0=직접합, 0.5 권장, 0.7 빠름).
    /// `softening`: close-encounter 발산 방지용 ε. 권장: 가장 가까운 입자쌍의 1% 수준.
    #[wasm_bindgen(constructor)]
    pub fn new(
        masses: Vec<f64>,
        pos: Vec<f64>,
        vel: Vec<f64>,
        theta: f64,
        softening: f64,
    ) -> BarnesHutEngine {
        let mut inner = BarnesHutSystem::new(masses, pos, vel, theta);
        inner.softening_sq = softening * softening;
        BarnesHutEngine { inner }
    }

    pub fn n(&self) -> usize {
        self.inner.n()
    }

    pub fn step(&mut self, dt: f64) {
        self.inner.step(dt);
    }

    pub fn step_chunked(&mut self, total_dt: f64, max_dt: f64) {
        let abs = total_dt.abs();
        if abs == 0.0 {
            return;
        }
        let sub_count = (abs / max_dt).ceil() as usize;
        let sub_dt = total_dt / sub_count as f64;
        for _ in 0..sub_count {
            self.inner.step(sub_dt);
        }
    }

    pub fn positions(&self) -> Vec<f64> {
        self.inner.pos.clone()
    }

    pub fn velocities(&self) -> Vec<f64> {
        self.inner.vel.clone()
    }

    pub fn total_energy(&self) -> f64 {
        self.inner.total_energy()
    }

    pub fn theta(&self) -> f64 {
        self.inner.theta
    }

    pub fn set_theta(&mut self, theta: f64) {
        self.inner.theta = theta;
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_basic() {
        assert_eq!(add(1.5, 2.25), 3.75);
    }
}
