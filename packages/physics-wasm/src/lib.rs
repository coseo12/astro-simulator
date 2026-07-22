//! astro-simulator Newton N-body WASM 코어.
//!
//! - `add`: TS ↔ WASM 왕복 스모크 (#84)
//! - `nbody`: Velocity-Verlet 적분기 + O(N²) 중력 합 (#85)
//! - `NBodyEngine`: WASM export 래퍼 — TS에서 직접 사용 (#86)
//!
//! 좌표계: SI 단위 (m, kg, s). 위치/속도는 3N-flat `Vec<f64>` (AoS-flat).
//! 심플렉틱 특성상 고정 dt에서 에너지 오차가 장기적으로 bounded oscillation.

// #843 negative 검증용 임시 주입 — dead_code 경고 유발 (revert 예정)
fn negative_gate_probe_843() -> i32 {
    42
}

use wasm_bindgen::prelude::*;

pub mod barnes_hut;
pub mod geodesic;
pub mod integrator;
pub mod nbody;
pub mod satellites;

use barnes_hut::engine::BarnesHutSystem;
use integrator::IntegratorKind;
use nbody::{GrMode, NBodySystem};

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

    /// P5-A #178 — 1PN GR 보정 on/off (호환 wrapper).
    /// P6-C #191에서 GrMode enum으로 교체됨. true → Single1PN, false → Off.
    /// P5-A 기존 호출자 보호 차원에서 시그니처 보존 — 신규 코드는 `set_gr_mode` 권장.
    pub fn set_gr(&mut self, enable: bool) {
        self.inner.gr_mode = if enable {
            GrMode::Single1PN
        } else {
            GrMode::Off
        };
    }

    /// 호환 getter — Off=false, 그 외=true.
    pub fn gr_enabled(&self) -> bool {
        self.inner.gr_mode != GrMode::Off
    }

    /// P6-C #191 — GR 모드 설정. 0=Off, 1=Single1PN, 2=EIH1PN.
    /// 알 수 없는 값은 Off로 폴백 (panic 회피).
    pub fn set_gr_mode(&mut self, mode: u8) {
        self.inner.gr_mode = GrMode::from_u8(mode);
    }

    /// 현재 GR 모드 (0=Off, 1=Single1PN, 2=EIH1PN).
    pub fn gr_mode(&self) -> u8 {
        self.inner.gr_mode as u8
    }

    /// P7-A #206 — 적분기 설정. 0=Velocity-Verlet (기본), 1=Yoshida 4차 심플렉틱.
    /// 알 수 없는 값은 Velocity-Verlet로 폴백 (panic 회피).
    pub fn set_integrator(&mut self, kind: u8) {
        self.inner.integrator = IntegratorKind::from_u8(kind);
    }

    /// P7-A #206 — 현재 적분기 (0=Velocity-Verlet, 1=Yoshida4).
    pub fn integrator(&self) -> u8 {
        self.inner.integrator as u8
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

// P9 #254 — Osculating 원소 추출 (Galilean 동적 동기화용).
// Float64Array 7 원소 순서 박제: [a, e, i, Ω, ω, M, singularity].
// serde-wasm-bindgen 의 struct export 대신 flat Vec<f64> 선택 — 1Hz polling ×
// 4 Galilean 당 호출 시 직렬화/역직렬화 부담 최소화.
// ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md` L213~L226.
#[wasm_bindgen]
pub fn extract_osculating_elements(
    pos_x: f64,
    pos_y: f64,
    pos_z: f64,
    vel_x: f64,
    vel_y: f64,
    vel_z: f64,
    mu_parent: f64,
) -> Vec<f64> {
    let el = satellites::osculating::extract_osculating_elements(
        [pos_x, pos_y, pos_z],
        [vel_x, vel_y, vel_z],
        mu_parent,
    );
    vec![
        el.semi_major_axis,
        el.eccentricity,
        el.inclination,
        el.longitude_of_ascending_node,
        el.argument_of_periapsis,
        el.mean_anomaly,
        f64::from(el.singularity),
    ]
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn add_basic() {
        assert_eq!(add(1.5, 2.25), 3.75);
    }

    /// WASM bridge flat 배열 길이·필드 순서 박제 (ADR L226).
    #[test]
    fn osculating_wasm_export_length_and_order() {
        let mu_jupiter = 6.67430e-11 * 1.8982e27;
        // Europa 장반경·원순환 → singularity=1 경로.
        let r: f64 = 671_100_000.0;
        let v = (mu_jupiter / r).sqrt();
        let out = extract_osculating_elements(r, 0.0, 0.0, 0.0, v, 0.0, mu_jupiter);
        assert_eq!(out.len(), 7, "WASM export 는 길이 7 flat 배열");
        assert!((out[0] - r).abs() / r < 1e-6, "a 복원 오차");
        assert!(out[1] < 1e-6, "e<1e-6 기대");
        // singularity flag
        assert_eq!(out[6], 1.0, "원순환에서 singularity=1");
    }
}
