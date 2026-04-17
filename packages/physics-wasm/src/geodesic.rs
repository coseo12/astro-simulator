//! Schwarzschild 광선(null) geodesic 적분기 (P6-A #189).
//!
//! - 표현: 광선 1차 ODE (Binet 방정식) `d²u/dφ² + u = 3M·u²`
//!   - `u(φ) = 1/r(φ)` (자연단위 M=1, c=1, G=1, Rs = 2M = 2)
//!   - 구대칭성으로 광선은 항상 단일 평면 운동 → 평면에서 (u, φ)로 표현
//! - 적분: 단순 RK4 + r-기반 step 제어 (`dφ ∝ r²/Rs`)
//! - 분류: `b_crit = 3√3·M ≈ 5.196 (M단위) = 2.598 (Rs단위)` 기준 escape vs capture
//! - 보존량: 광선의 1차 적분 `I(u, u') = (du/dφ)² + u² − Rs·u³ − 1/b² = 0`
//!   - E, L 개별 추적이 본 표현에서는 직접 등장하지 않으므로 단일 invariant `I`의
//!     상대 드리프트로 e_drift / l_drift를 정의 (`l_drift`는 b 변동분 기반).
//!
//! 입력 `b_over_rs`: 임팩트 파라미터를 Rs 단위로 전달 (= b/Rs).
//!
//! ADR: docs/decisions/20260417-geodesic-solver.md
//!
//! 참고:
//! - Misner, Thorne, Wheeler — *Gravitation*, §25.5
//! - Hartle — *Gravity*, Ch.9

/// 자연단위 Rs (= 2M, M=1).
pub const RS: f64 = 2.0;
/// 자연단위 M.
pub const M: f64 = 1.0;
/// Photon sphere 임계 임팩트 파라미터 (Rs 단위). `b_crit = 3√3·M / Rs = 3√3/2`.
pub const B_CRIT_OVER_RS: f64 = 2.598_076_211_353_316; // 3·sqrt(3)/2
/// 적분 종료 — capture 판정 임계치 (u가 이 값 이상이면 horizon 도달로 처리).
const U_CAPTURE: f64 = 1.0 / RS; // = 0.5
/// 적분 종료 — escape 판정 임계치 (u가 이 값 미만이면 무한대 도달로 처리).
const U_ESCAPE: f64 = 1e-6;
/// r-기반 step 스케일 계수 (dφ_actual = initial_step · min(1, (r/Rs)² / SCALE)).
const STEP_SCALE: f64 = 4.0;
/// 적분 노드 최대 개수 가드 (무한루프 방지).
const MAX_NODES: usize = 1_000_000;

/// 광선 적분 결과 분류.
#[derive(Debug, Clone, Copy, PartialEq)]
pub enum GeodesicOutcome {
    /// 무한대로 escape. `final_phi`: 종료 시 방위각, `deflection`: `final_phi - π` (rad).
    Escaped { final_phi: f64, deflection: f64 },
    /// Horizon으로 capture. `capture_phi`: capture 시 방위각.
    Captured { capture_phi: f64 },
}

/// 광선 궤적 + 분류 + invariant 드리프트.
#[derive(Debug, Clone)]
pub struct GeodesicTrajectory {
    /// 적분 노드의 방위각 φ.
    pub phi: Vec<f64>,
    /// 각 노드의 u = 1/r (자연단위).
    pub u: Vec<f64>,
    pub outcome: GeodesicOutcome,
    /// E invariant 상대 드리프트 — 1차 적분 `I` 의 |max - min| / |I_initial scale|.
    pub e_drift: f64,
    /// L invariant 상대 드리프트 — 동일 invariant 기반 (본 표현에선 별도 분리 불가).
    pub l_drift: f64,
}

/// Binet 방정식 우변: d²u/dφ² = -u + 3M·u².
#[inline]
fn d2u_dphi2(u: f64) -> f64 {
    -u + 3.0 * M * u * u
}

/// 1차 적분 (보존되어야 하는 invariant): `(du/dφ)² + u² − Rs·u³ = 1/b²`.
/// 본 함수는 좌변을 반환 — 이상적이면 시계열 동안 `1/b²`로 일정.
#[inline]
fn invariant(u: f64, du: f64) -> f64 {
    du * du + u * u - RS * u * u * u
}

/// 단일 RK4 step. 상태 (u, du/dφ)를 dφ 만큼 전진.
#[inline]
fn rk4_step(u: f64, du: f64, dphi: f64) -> (f64, f64) {
    // ODE: u' = du, du' = f(u) = -u + 3M·u²
    let k1u = du;
    let k1d = d2u_dphi2(u);

    let k2u = du + 0.5 * dphi * k1d;
    let k2d = d2u_dphi2(u + 0.5 * dphi * k1u);

    let k3u = du + 0.5 * dphi * k2d;
    let k3d = d2u_dphi2(u + 0.5 * dphi * k2u);

    let k4u = du + dphi * k3d;
    let k4d = d2u_dphi2(u + dphi * k3u);

    let u_next = u + (dphi / 6.0) * (k1u + 2.0 * k2u + 2.0 * k3u + k4u);
    let du_next = du + (dphi / 6.0) * (k1d + 2.0 * k2d + 2.0 * k3d + k4d);
    (u_next, du_next)
}

/// 광선 geodesic 적분 (1차 ODE form, RK4, r-기반 step).
///
/// - `b_over_rs`: 임팩트 파라미터 / Rs.
/// - `max_phi`: 적분 종료 방위각 (안전 가드).
/// - `initial_step`: 기본 dφ — 강한 장(작은 r)에서 자동으로 축소.
///
/// 초기조건: `u(0) = 0`, `du/dφ(0) = 1/b` (무한대에서 입사, perihelion 방향으로 φ 증가).
pub fn integrate_photon_geodesic(
    b_over_rs: f64,
    max_phi: f64,
    initial_step: f64,
) -> GeodesicTrajectory {
    assert!(b_over_rs > 0.0, "b_over_rs는 양수여야 함");
    assert!(max_phi > 0.0, "max_phi는 양수여야 함");
    assert!(initial_step > 0.0, "initial_step은 양수여야 함");

    // b는 자연단위. b_over_rs는 Rs 단위라 곱해서 환산.
    let b = b_over_rs * RS;
    let inv_b2 = 1.0 / (b * b);

    // 초기조건: 무한대 입사 (u=0, u'=1/b).
    let mut phi = 0.0_f64;
    let mut u = 0.0_f64;
    let mut du = 1.0 / b;

    let mut phis = Vec::with_capacity(1024);
    let mut us = Vec::with_capacity(1024);
    phis.push(phi);
    us.push(u);

    // Invariant 시계열 추적 — initial은 1/b² (analytical).
    let mut inv_min = inv_b2;
    let mut inv_max = inv_b2;

    // u가 escape 임계치 아래로 두 번째 떨어질 때 escape 종료.
    // 초기 u=0이므로 perihelion 통과 후 다시 u가 작아지는 시점을 추적.
    let mut passed_perihelion = false;
    let mut outcome: Option<GeodesicOutcome> = None;

    // 종료점 보간을 위해 직전 step 보존.
    let mut u_prev;
    let mut phi_prev;

    for _ in 0..MAX_NODES {
        // r-기반 step 제어: r이 작을수록 dφ 축소.
        // u = 0 근처(무한대)에서는 default step. u가 클수록 step 축소.
        let r_over_rs = if u > 1e-12 { 1.0 / (u * RS) } else { f64::INFINITY };
        let scale = if r_over_rs.is_finite() {
            (r_over_rs * r_over_rs / STEP_SCALE).min(1.0).max(1e-4)
        } else {
            1.0
        };
        let dphi = initial_step * scale;

        u_prev = u;
        phi_prev = phi;

        let (u_new, du_new) = rk4_step(u, du, dphi);
        phi += dphi;
        u = u_new;
        du = du_new;

        phis.push(phi);
        us.push(u);

        // Invariant 시계열 업데이트.
        let inv = invariant(u, du);
        if inv < inv_min {
            inv_min = inv;
        }
        if inv > inv_max {
            inv_max = inv;
        }

        // Capture 판정 — u가 horizon 임계치 도달.
        if u >= U_CAPTURE {
            outcome = Some(GeodesicOutcome::Captured { capture_phi: phi });
            break;
        }

        // Perihelion 통과 감지 — du/dφ 부호 변화 (양 → 음).
        if !passed_perihelion && du < 0.0 {
            passed_perihelion = true;
        }

        // Escape 판정 — perihelion 통과 후 u가 다시 escape 임계치 아래로.
        if passed_perihelion && u <= U_ESCAPE && u >= 0.0 {
            // 종료 시점 선형 보간: 직전 (phi_prev, u_prev), 현재 (phi, u).
            // u=0 시점의 phi를 추정 — 1차 step의 dφ 누적 artifact 제거.
            let phi_zero = if (u_prev - u).abs() > 1e-15 {
                phi_prev + (phi - phi_prev) * (u_prev / (u_prev - u))
            } else {
                phi
            };
            outcome = Some(GeodesicOutcome::Escaped {
                final_phi: phi_zero,
                deflection: phi_zero - std::f64::consts::PI,
            });
            break;
        }

        // u가 음수로 발산하거나 NaN인 경우 (수치 오류) — escape로 처리.
        if !u.is_finite() || u < -U_ESCAPE {
            outcome = Some(GeodesicOutcome::Escaped {
                final_phi: phi,
                deflection: phi - std::f64::consts::PI,
            });
            break;
        }

        // 안전 가드 — max_phi 초과.
        if phi >= max_phi {
            // 미결판이면 마지막 상태로 escape 처리 (deflection은 phi - π).
            outcome = Some(GeodesicOutcome::Escaped {
                final_phi: phi,
                deflection: phi - std::f64::consts::PI,
            });
            break;
        }
    }

    let outcome = outcome.unwrap_or(GeodesicOutcome::Escaped {
        final_phi: phi,
        deflection: phi - std::f64::consts::PI,
    });

    // Invariant 드리프트: |max - min| / |inv_initial|. 본 표현에서는 E와 L이
    // 단일 invariant `I = 1/b²`로 묶이므로 e_drift, l_drift 모두 동일 값.
    let drift = (inv_max - inv_min).abs() / inv_b2.abs();

    GeodesicTrajectory {
        phi: phis,
        u: us,
        outcome,
        e_drift: drift,
        l_drift: drift,
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use std::f64::consts::PI;

    /// A1 — Weak field deflection: b = 50 Rs (= 100 M).
    /// 해석해 α = 4M/b = 4/100 = 0.04 rad (1차 근사). 큰 b에서 매우 정확. ±5%.
    /// b=10 Rs (4M/b=0.2)는 2차 항이 약 18% 기여하므로 1차 근사 ±5%에 들어가지 않음 —
    /// b=50으로 키워 1차 근사가 정확한 영역에서 검증.
    #[test]
    fn geodesic_deflection_weak_field() {
        let b_over_rs = 50.0;
        let traj = integrate_photon_geodesic(b_over_rs, 4.0 * PI, 1e-3);
        let GeodesicOutcome::Escaped { deflection, .. } = traj.outcome else {
            panic!(
                "weak field b={}Rs은 escape여야 함, got {:?}",
                b_over_rs, traj.outcome
            );
        };
        // b 자연단위: b_phys = b_over_rs * Rs (Rs=2)
        let b_phys = b_over_rs * RS;
        let expected = 4.0 * M / b_phys; // 1차 근사
        let rel_err = ((deflection - expected) / expected).abs();
        assert!(
            rel_err < 0.05,
            "weak field deflection: expected={:.6}, got={:.6}, rel_err={:.4}",
            expected,
            deflection,
            rel_err
        );
    }

    /// A1 — Strong field deflection: b = 3 Rs (= 6 M).
    /// Reference: Iyer-Petters 2007 / Bozza 2002 strong-field limit, b/M=6에서 α ≈ 1.720 rad.
    /// (참고: Misner-Thorne-Wheeler §25.5 Table — b/M=6 영역에서 deflection이 1차 근사 4M/b=0.667을
    /// 크게 상회. 약 2.5배.)
    /// ±5%.
    #[test]
    fn geodesic_deflection_strong_field() {
        let b_over_rs = 3.0;
        let traj = integrate_photon_geodesic(b_over_rs, 6.0 * PI, 1e-4);
        let GeodesicOutcome::Escaped { deflection, .. } = traj.outcome else {
            panic!(
                "b={}Rs은 escape여야 함 (b > b_crit), got {:?}",
                b_over_rs, traj.outcome
            );
        };
        // 강한 장 reference (literature). 솔버 출력 ~1.7194 와 비교.
        let reference = 1.7203_f64;
        let rel_err = ((deflection - reference) / reference).abs();
        assert!(
            rel_err < 0.05,
            "strong field deflection: ref={:.4}, got={:.4}, rel_err={:.4}",
            reference,
            deflection,
            rel_err
        );
        // 추가 sanity — 약한 장 근사보다 명확히 커야 함.
        let weak_bound = 4.0 * M / (b_over_rs * RS); // ≈ 0.667
        assert!(
            deflection > 2.0 * weak_bound,
            "strong field deflection({:.4})은 weak 근사({:.4}) 2배 이상이어야 함",
            deflection,
            weak_bound
        );
    }

    /// A2 — Invariant 보존: b ∈ {2.6, 3, 5, 10} Rs.
    /// 1000 step 이상 적분 후 상대 드리프트 < 1e-4.
    #[test]
    fn geodesic_conservation_1000_steps() {
        for &b_over_rs in &[2.6_f64, 3.0, 5.0, 10.0] {
            let traj = integrate_photon_geodesic(b_over_rs, 8.0 * PI, 1e-3);
            assert!(
                traj.phi.len() >= 1000,
                "b={}Rs: 1000 step 이상 필요, got {}",
                b_over_rs,
                traj.phi.len()
            );
            assert!(
                traj.e_drift < 1e-4,
                "b={}Rs: e_drift={:.2e} (limit 1e-4)",
                b_over_rs,
                traj.e_drift
            );
            assert!(
                traj.l_drift < 1e-4,
                "b={}Rs: l_drift={:.2e} (limit 1e-4)",
                b_over_rs,
                traj.l_drift
            );
        }
    }

    /// A3 — Escape vs capture 분류: b sweep [0.5, 10] Rs 50점.
    /// b_crit = 2.598 Rs 기준 분류.
    #[test]
    fn geodesic_outcome_classification() {
        let n = 50;
        for i in 0..n {
            let b = 0.5 + (10.0 - 0.5) * (i as f64) / (n as f64 - 1.0);
            let traj = integrate_photon_geodesic(b, 8.0 * PI, 1e-3);
            let is_escaped = matches!(traj.outcome, GeodesicOutcome::Escaped { .. });
            let is_captured = matches!(traj.outcome, GeodesicOutcome::Captured { .. });
            assert!(
                is_escaped ^ is_captured,
                "b={:.3}Rs: outcome 분류 모호함 {:?}",
                b,
                traj.outcome
            );

            // 경계 ±0.05 Rs 영역은 sanity 면제 (수치 한계).
            if (b - B_CRIT_OVER_RS).abs() < 0.05 {
                continue;
            }
            if b < B_CRIT_OVER_RS {
                assert!(
                    is_captured,
                    "b={:.3}Rs < {:.3}Rs (b_crit) 인데 escape: {:?}",
                    b, B_CRIT_OVER_RS, traj.outcome
                );
            } else {
                assert!(
                    is_escaped,
                    "b={:.3}Rs > {:.3}Rs (b_crit) 인데 capture: {:?}",
                    b, B_CRIT_OVER_RS, traj.outcome
                );
            }
        }
    }

    /// A3 sanity — 경계값 직접 검증 (b_crit 이하/이상 1점씩).
    #[test]
    fn geodesic_boundary_classification() {
        // b = 2.5 Rs (< b_crit): capture.
        let traj_low = integrate_photon_geodesic(2.5, 8.0 * PI, 1e-3);
        assert!(
            matches!(traj_low.outcome, GeodesicOutcome::Captured { .. }),
            "b=2.5Rs은 captured여야 함, got {:?}",
            traj_low.outcome
        );

        // b = 2.7 Rs (> b_crit): escape.
        let traj_high = integrate_photon_geodesic(2.7, 8.0 * PI, 1e-3);
        assert!(
            matches!(traj_high.outcome, GeodesicOutcome::Escaped { .. }),
            "b=2.7Rs은 escaped여야 함, got {:?}",
            traj_high.outcome
        );
    }
}
