//! 적분기 합성기. 가속도 식(`nbody::compute_accelerations`)은 손대지 않는다.
//!
//! P7-A #206 — Yoshida 1990 4차 심플렉틱 적분기를 신규 도입하고,
//! 기존 Velocity-Verlet과 병존시킨다. 기본값은 VV 유지 (후방 호환).
//!
//! 공개:
//! - `IntegratorKind` — WASM bindgen `#[repr(u8)]` (0/1)
//! - `YOSHIDA_W0`, `YOSHIDA_W1` — 논문 표준 계수
//! - `YOSHIDA_C[4]`, `YOSHIDA_D[3]` — drift/kick 계수 배열
//! - `step_yoshida4(sys, dt)` — Yoshida 1990 3-stage 합성
//!
//! 계수는 본 파일 const 배열로 박제하고, 논문 표와 소수 10자리 일치를 단위 테스트로 가드.
//!
//! 출처:
//! - Yoshida H. (1990) "Construction of higher order symplectic integrators",
//!   Phys. Lett. A 150, 262-268, eq. (4.3) + Table 2.
//! - Hairer-Lubich-Wanner, *Geometric Numerical Integration*, 2nd ed. Ch. II.4
//! - Sanz-Serna J.M., Calvo M.P., *Numerical Hamiltonian Problems* (1994), §V.4

use crate::nbody::NBodySystem;

/// P7-A #206 — 적분기 종류. `#[repr(u8)]`로 WASM bindgen에 정수로 노출 (0/1).
///
/// - `VelocityVerlet = 0`: 2차 심플렉틱 (기본값, 기존 동작 재현)
/// - `Yoshida4 = 1`: 4차 심플렉틱 (3-stage 합성, 장기 궤도 정밀도 우위)
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub enum IntegratorKind {
    #[default]
    VelocityVerlet = 0,
    Yoshida4 = 1,
}

impl IntegratorKind {
    /// u8 → IntegratorKind. 알 수 없는 값은 `VelocityVerlet`로 안전 폴백 (panic 회피).
    pub fn from_u8(v: u8) -> Self {
        match v {
            1 => IntegratorKind::Yoshida4,
            _ => IntegratorKind::VelocityVerlet,
        }
    }
}

/// Yoshida (1990) 4th-order symplectic coefficients.
///
/// 식 (4.3):
/// ```text
/// w0 = -2^(1/3) / (2 - 2^(1/3))
/// w1 =      1   / (2 - 2^(1/3))
/// w0 + 2 w1 = 1
/// ```
///
/// IEEE f64 참조값(소수 16자리):
/// - `w1 =  1.3512071919596576`
/// - `w0 = -1.7024143839193153`
pub const YOSHIDA_W1: f64 = 1.351_207_191_959_657_6; // 1 / (2 - 2^(1/3))
pub const YOSHIDA_W0: f64 = -1.702_414_383_919_315_3; // -2^(1/3) / (2 - 2^(1/3))

/// drift 계수 배열 (4개). Σ c_i = 1.
///
/// c1 = c4 = w1/2,  c2 = c3 = (w0 + w1)/2
pub const YOSHIDA_C: [f64; 4] = [
    YOSHIDA_W1 * 0.5,
    (YOSHIDA_W0 + YOSHIDA_W1) * 0.5,
    (YOSHIDA_W0 + YOSHIDA_W1) * 0.5,
    YOSHIDA_W1 * 0.5,
];

/// kick 계수 배열 (3개). Σ d_i = 1 (= w0 + 2 w1).
///
/// d1 = d3 = w1,  d2 = w0
pub const YOSHIDA_D: [f64; 3] = [YOSHIDA_W1, YOSHIDA_W0, YOSHIDA_W1];

/// Yoshida 4차 심플렉틱 1 스텝. drift-kick 합성 `D K D K D K D` (c4·d3·c3·d2·c2·d1·c1 순).
///
/// - drift: `x ← x + v · c_i · dt` (위치만 갱신, 속도 불변)
/// - kick : `compute_accelerations()` 재계산 후 `v ← v + a · d_i · dt`
///
/// 총 4 drift + 3 kick = 3 kick(가속도 재계산 3회). Velocity-Verlet 1 kick(재계산 1회) 대비 약 3× 비용.
///
/// EIH/Single 1PN 분기는 `compute_accelerations()` 내부에서 이미 처리되므로 적분기는 식과 무관.
///
/// 주의: 호출 진입 시 `sys.acc`는 이전 step 말미 상태 — 첫 kick 전에 `compute_accelerations()`가
/// 한 번 호출되어야 한다 (Yoshida는 drift로 시작하므로 첫 drift 이후 `compute_accelerations()`
/// 호출로 자연 해결).
pub fn step_yoshida4(sys: &mut NBodySystem, dt: f64) {
    let n3 = sys.n() * 3;

    // Stage 1: drift c1
    let c1_dt = YOSHIDA_C[0] * dt;
    for k in 0..n3 {
        sys.pos[k] += sys.vel[k] * c1_dt;
    }
    // Kick d1
    sys.compute_accelerations_public();
    let d1_dt = YOSHIDA_D[0] * dt;
    for k in 0..n3 {
        sys.vel[k] += sys.acc[k] * d1_dt;
    }

    // Stage 2: drift c2
    let c2_dt = YOSHIDA_C[1] * dt;
    for k in 0..n3 {
        sys.pos[k] += sys.vel[k] * c2_dt;
    }
    // Kick d2
    sys.compute_accelerations_public();
    let d2_dt = YOSHIDA_D[1] * dt;
    for k in 0..n3 {
        sys.vel[k] += sys.acc[k] * d2_dt;
    }

    // Stage 3: drift c3
    let c3_dt = YOSHIDA_C[2] * dt;
    for k in 0..n3 {
        sys.pos[k] += sys.vel[k] * c3_dt;
    }
    // Kick d3
    sys.compute_accelerations_public();
    let d3_dt = YOSHIDA_D[2] * dt;
    for k in 0..n3 {
        sys.vel[k] += sys.acc[k] * d3_dt;
    }

    // 최종 drift c4 (속도 갱신 없음)
    let c4_dt = YOSHIDA_C[3] * dt;
    for k in 0..n3 {
        sys.pos[k] += sys.vel[k] * c4_dt;
    }

    // 다음 step의 관측자(`total_energy` 등)를 위해 acc를 최신 위치 기준으로 갱신.
    // (Yoshida는 마지막이 drift로 끝나므로 acc가 한 stage 뒤처진 상태로 남는다.)
    sys.compute_accelerations_public();
}

#[cfg(test)]
mod tests {
    use super::*;

    /// 부동소수점 기준값과 상대 오차 비교 헬퍼. 0에 가까운 경우는 절대 오차 사용.
    fn approx_eq(a: f64, b: f64, tol: f64) -> bool {
        let diff = (a - b).abs();
        let scale = a.abs().max(b.abs()).max(1.0);
        diff <= tol * scale
    }

    #[test]
    fn yoshida_coefficients_match_paper() {
        // Yoshida 1990 eq. (4.3) — 해석해 대조.
        // 2^(1/3) = 1.2599210498948732
        let cbrt2: f64 = 2.0_f64.powf(1.0 / 3.0);
        let w1_ref: f64 = 1.0 / (2.0 - cbrt2);
        let w0_ref: f64 = -cbrt2 / (2.0 - cbrt2);

        println!(
            "Yoshida coefficients (reference):\n  w1 = {:.16}\n  w0 = {:.16}",
            w1_ref, w0_ref
        );
        println!(
            "Yoshida coefficients (const):\n  YOSHIDA_W1 = {:.16}\n  YOSHIDA_W0 = {:.16}",
            YOSHIDA_W1, YOSHIDA_W0
        );

        // 소수 10자리 일치 — DoD A1.
        assert!(
            approx_eq(YOSHIDA_W1, w1_ref, 1e-10),
            "YOSHIDA_W1 = {:.16} 이 해석해 {:.16} 와 10자리 일치하지 않음",
            YOSHIDA_W1,
            w1_ref
        );
        assert!(
            approx_eq(YOSHIDA_W0, w0_ref, 1e-10),
            "YOSHIDA_W0 = {:.16} 이 해석해 {:.16} 와 10자리 일치하지 않음",
            YOSHIDA_W0,
            w0_ref
        );

        // 정규화 조건: w0 + 2 w1 = 1 (±1e-15).
        let norm = YOSHIDA_W0 + 2.0 * YOSHIDA_W1;
        println!("w0 + 2 w1 = {:.16} (should be 1.0)", norm);
        assert!(
            (norm - 1.0).abs() < 1e-15,
            "Yoshida 정규화 조건 w0 + 2 w1 = 1 위반: {:.16}",
            norm
        );

        // drift 계수 합 Σ c_i = 1 (±1e-15).
        let sum_c: f64 = YOSHIDA_C.iter().sum();
        println!("Σ c_i = {:.16} (should be 1.0)", sum_c);
        assert!(
            (sum_c - 1.0).abs() < 1e-15,
            "Σ c_i = {:.16} ≠ 1.0",
            sum_c
        );

        // kick 계수 합 Σ d_i = 1 (±1e-15).
        let sum_d: f64 = YOSHIDA_D.iter().sum();
        println!("Σ d_i = {:.16} (should be 1.0)", sum_d);
        assert!(
            (sum_d - 1.0).abs() < 1e-15,
            "Σ d_i = {:.16} ≠ 1.0",
            sum_d
        );
    }

    #[test]
    fn integrator_kind_dispatch() {
        // IntegratorKind::from_u8 분기 동작 검증 — DoD A(dispatch).
        assert_eq!(IntegratorKind::from_u8(0), IntegratorKind::VelocityVerlet);
        assert_eq!(IntegratorKind::from_u8(1), IntegratorKind::Yoshida4);
        // 알 수 없는 값은 VelocityVerlet 폴백 (panic 회피).
        assert_eq!(IntegratorKind::from_u8(2), IntegratorKind::VelocityVerlet);
        assert_eq!(IntegratorKind::from_u8(255), IntegratorKind::VelocityVerlet);

        // Default trait — VV.
        assert_eq!(IntegratorKind::default(), IntegratorKind::VelocityVerlet);

        // u8 역변환 (enum → u8).
        assert_eq!(IntegratorKind::VelocityVerlet as u8, 0);
        assert_eq!(IntegratorKind::Yoshida4 as u8, 1);
    }
}
