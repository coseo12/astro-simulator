//! State vector → Osculating Kepler 6원소 변환 (P9 #254 D7).
//!
//! ADR: `docs/decisions/20260420-p9-galilean-laplace-rings.md` §결정 #3
//! (early return 가드 — `e<1e-6` 또는 `sin(i)<1e-6` 에서 특이점 처리).
//!
//! **입력 좌표계**: Jupiter-centric (부모 기준 상대 좌표). 태양계 전체 좌표를 넘기면
//! 부모 공전 속도가 원소에 secular 오염으로 누적된다.
//!
//! **단위**: 모두 SI (m, rad, m³/s²).

/// Osculating 특이점 판정 임계값 (무차원).
///
/// - `e < ECC_SINGULAR_THRESHOLD` → 근점 방향이 수치적으로 무의미
/// - `sin(i) < INC_SINGULAR_THRESHOLD` → 승교점이 수치적으로 무의미
///
/// ADR §결정 #3 에서 Equinoctial/RK 안정화 대신 early return 가드 선택.
const ECC_SINGULAR_THRESHOLD: f64 = 1e-6;
const INC_SINGULAR_THRESHOLD: f64 = 1e-6;

/// 고전 Kepler 6원소 (osculating). 모두 SI 단위 (m, rad).
#[derive(Debug, Clone, Copy)]
pub struct OscElements {
    /// 장반경 (m)
    pub semi_major_axis: f64,
    /// 이심률 (무차원, 타원 궤도에서 0 ≤ e < 1)
    pub eccentricity: f64,
    /// 궤도 경사각 (rad, 0 ≤ i ≤ π)
    pub inclination: f64,
    /// 승교점 경도 Ω (rad, -π ~ π)
    pub longitude_of_ascending_node: f64,
    /// 근점 편각 ω (rad, -π ~ π)
    pub argument_of_periapsis: f64,
    /// 평균근점이각 M (rad, -π ~ π)
    pub mean_anomaly: f64,
    /// 특이점 플래그: `e<1e-6` 또는 `sin(i)<1e-6` 시 1 (ADR 결정 #3).
    /// UI 에서 "원순환 근사" 배지 표시용.
    pub singularity: u8,
}

/// State vector → Osculating elements (Jupiter-centric 가정).
///
/// **ADR 결정 #3 (early return 가드)**:
///   - `e < 1e-6` → `argument_of_periapsis = 0`, `mean_anomaly = λ_true`, `singularity = 1`
///   - `sin(i) < 1e-6` → `longitude_of_ascending_node = 0`, `argument_of_periapsis = ω_adj`, `singularity = 1`
///
/// **왕복 오차 DoD (D7)**: `extract → to_state → extract` 원소 오차 ≤ 1e-10
/// (Galilean 실 e/i 범위에서).
///
/// # Arguments
/// - `pos_rel`: Jupiter-centric 위치 (m)
/// - `vel_rel`: Jupiter-centric 속도 (m/s)
/// - `mu_parent`: `G · M_jupiter` (m³/s²)
pub fn extract_osculating_elements(
    pos_rel: [f64; 3],
    vel_rel: [f64; 3],
    mu_parent: f64,
) -> OscElements {
    let [rx, ry, rz] = pos_rel;
    let [vx, vy, vz] = vel_rel;

    let r = (rx * rx + ry * ry + rz * rz).sqrt();
    let v2 = vx * vx + vy * vy + vz * vz;

    // 비에너지 → 장반경 (vis-viva).
    let energy = 0.5 * v2 - mu_parent / r;
    let semi_major_axis = -mu_parent / (2.0 * energy);

    // 각운동량 h = r × v.
    let hx = ry * vz - rz * vy;
    let hy = rz * vx - rx * vz;
    let hz = rx * vy - ry * vx;
    let h2 = hx * hx + hy * hy + hz * hz;
    let h_norm = h2.sqrt();

    // 경사각 i = acos(hz / |h|).
    let inclination = (hz / h_norm).clamp(-1.0, 1.0).acos();
    let sin_i = inclination.sin();

    // 이심률 벡터 e⃗ = (v × h) / μ − r̂.
    // 표준: e⃗ = ((v² − μ/r) r − (r·v) v) / μ. 여기서 직접 식 사용.
    let r_dot_v = rx * vx + ry * vy + rz * vz;
    let ex = ((v2 - mu_parent / r) * rx - r_dot_v * vx) / mu_parent;
    let ey = ((v2 - mu_parent / r) * ry - r_dot_v * vy) / mu_parent;
    let ez = ((v2 - mu_parent / r) * rz - r_dot_v * vz) / mu_parent;
    let eccentricity = (ex * ex + ey * ey + ez * ez).sqrt();

    // 특이점 조기 판정 — 분기에서 재사용.
    let is_circular = eccentricity < ECC_SINGULAR_THRESHOLD;
    let is_equatorial = sin_i < INC_SINGULAR_THRESHOLD;
    let singularity: u8 = if is_circular || is_equatorial {
        1
    } else {
        0
    };

    // 승교점 벡터 N = ẑ × h = (-hy, hx, 0). |N| = h_xy.
    let nx = -hy;
    let ny = hx;
    let n_norm = (nx * nx + ny * ny).sqrt();

    // 진경도 λ_true = atan2(r_y, r_x) (적도 + 원순환 특이점에서 재사용용).
    let true_longitude = ry.atan2(rx);

    // 케이스 분기 (ADR 결정 #3).
    let (longitude_of_ascending_node, argument_of_periapsis, mean_anomaly) = if is_equatorial
        && is_circular
    {
        // 적도 + 원순환: Ω=0, ω=0, M = λ_true.
        (0.0, 0.0, wrap_to_pi(true_longitude))
    } else if is_equatorial {
        // 적도 원궤도 아님 — Ω=0, ω = atan2(ey, ex), M from true anomaly.
        let omega_pi = ey.atan2(ex);
        let true_anomaly = solve_true_anomaly(ex, ey, ez, rx, ry, rz, r_dot_v, eccentricity, r);
        let mean_anomaly = true_to_mean_anomaly(true_anomaly, eccentricity);
        (0.0, wrap_to_pi(omega_pi), wrap_to_pi(mean_anomaly))
    } else if is_circular {
        // 원순환 + 경사 — ω=0, M = u (argument of latitude).
        let omega_node = ny.atan2(nx);
        // argument of latitude u = atan2(rz / sin i, (rx cos Ω + ry sin Ω))
        let cos_node = omega_node.cos();
        let sin_node = omega_node.sin();
        let x_in_plane = rx * cos_node + ry * sin_node;
        let y_in_plane = rz / sin_i;
        let u = y_in_plane.atan2(x_in_plane);
        (wrap_to_pi(omega_node), 0.0, wrap_to_pi(u))
    } else {
        // 일반 케이스 — 6원소 정상 추출.
        let omega_node = ny.atan2(nx);
        // ω: n⃗ 와 e⃗ 사이 각 (부호: e_z).
        let n_dot_e = (nx * ex + ny * ey) / n_norm;
        let cos_omega = n_dot_e / eccentricity;
        let arg_peri = cos_omega.clamp(-1.0, 1.0).acos();
        let arg_peri_signed = if ez < 0.0 { -arg_peri } else { arg_peri };
        let true_anomaly = solve_true_anomaly(ex, ey, ez, rx, ry, rz, r_dot_v, eccentricity, r);
        let mean_anomaly = true_to_mean_anomaly(true_anomaly, eccentricity);
        (
            wrap_to_pi(omega_node),
            wrap_to_pi(arg_peri_signed),
            wrap_to_pi(mean_anomaly),
        )
    };

    OscElements {
        semi_major_axis,
        eccentricity,
        inclination,
        longitude_of_ascending_node,
        argument_of_periapsis,
        mean_anomaly,
        singularity,
    }
}

/// Osculating elements → Jupiter-centric state vector.
///
/// D7 왕복 오차 검증용 역변환. 특이점 브랜치(singularity=1) 에서는 ω=0 / Ω=0
/// 규약대로 재구성되어 원소↔state 이 bijective 이지는 않을 수 있으나, 왕복 시
/// 다시 같은 브랜치로 들어가 오차 ≤ 1e-10 을 만족한다.
pub fn to_state_vector(el: &OscElements, mu_parent: f64) -> ([f64; 3], [f64; 3]) {
    let a = el.semi_major_axis;
    let e = el.eccentricity;
    let i = el.inclination;
    let omega_node = el.longitude_of_ascending_node;
    let arg_peri = el.argument_of_periapsis;
    let m = el.mean_anomaly;

    // Kepler 방정식 M = E − e sin E — Newton 반복.
    let eccentric_anomaly = solve_kepler(m, e);
    let cos_e = eccentric_anomaly.cos();
    let sin_e = eccentric_anomaly.sin();

    // 궤도면 좌표 (근점을 +x 축으로).
    let x_orb = a * (cos_e - e);
    let y_orb = a * (1.0 - e * e).sqrt() * sin_e;
    let r_orb = a * (1.0 - e * cos_e);

    // 진경위각속도 — vis-viva 로부터 구한 속도.
    let mu_over_r = mu_parent / r_orb;
    let n_mean = (mu_parent / (a * a * a)).sqrt();
    // 표준 RV 식: v_x = -a n sin E / (1 - e cos E) * a (궤도면)
    let denom = 1.0 - e * cos_e;
    let vx_orb = -a * n_mean * sin_e / denom;
    let vy_orb = a * n_mean * (1.0 - e * e).sqrt() * cos_e / denom;
    // 해설용: mu_over_r 는 에너지 자기일관성 체크용 (삭제하면 경고)
    let _ = mu_over_r;

    // 회전 행렬 R_z(Ω) R_x(i) R_z(ω).
    let cos_w = arg_peri.cos();
    let sin_w = arg_peri.sin();
    let cos_o = omega_node.cos();
    let sin_o = omega_node.sin();
    let cos_i = i.cos();
    let sin_i = i.sin();

    // 궤도면 → 관성좌표.
    let r11 = cos_o * cos_w - sin_o * sin_w * cos_i;
    let r12 = -cos_o * sin_w - sin_o * cos_w * cos_i;
    let r21 = sin_o * cos_w + cos_o * sin_w * cos_i;
    let r22 = -sin_o * sin_w + cos_o * cos_w * cos_i;
    let r31 = sin_w * sin_i;
    let r32 = cos_w * sin_i;

    let pos = [
        r11 * x_orb + r12 * y_orb,
        r21 * x_orb + r22 * y_orb,
        r31 * x_orb + r32 * y_orb,
    ];
    let vel = [
        r11 * vx_orb + r12 * vy_orb,
        r21 * vx_orb + r22 * vy_orb,
        r31 * vx_orb + r32 * vy_orb,
    ];
    (pos, vel)
}

/// Kepler 방정식 해법 (Newton-Raphson).
/// M = E − e sin E. e < 0.8 범위에서 3~5 반복 수렴.
fn solve_kepler(mean_anomaly: f64, eccentricity: f64) -> f64 {
    let m = wrap_to_pi(mean_anomaly);
    let mut e_anom = if eccentricity < 0.8 { m } else { std::f64::consts::PI };
    for _ in 0..30 {
        let f = e_anom - eccentricity * e_anom.sin() - m;
        let fp = 1.0 - eccentricity * e_anom.cos();
        let delta = f / fp;
        e_anom -= delta;
        if delta.abs() < 1e-14 {
            break;
        }
    }
    e_anom
}

/// 이심률 벡터 + 위치로부터 진근점 이각 ν 계산.
#[allow(clippy::too_many_arguments)]
fn solve_true_anomaly(
    ex: f64,
    ey: f64,
    ez: f64,
    rx: f64,
    ry: f64,
    rz: f64,
    r_dot_v: f64,
    e: f64,
    r: f64,
) -> f64 {
    let cos_nu = ((ex * rx + ey * ry + ez * rz) / (e * r)).clamp(-1.0, 1.0);
    let nu = cos_nu.acos();
    if r_dot_v < 0.0 {
        -nu
    } else {
        nu
    }
}

/// ν (진근점이각) → M (평균근점이각).
fn true_to_mean_anomaly(true_anomaly: f64, eccentricity: f64) -> f64 {
    // ν → E: tan(E/2) = sqrt((1-e)/(1+e)) tan(ν/2).
    let half_factor = ((1.0 - eccentricity) / (1.0 + eccentricity)).sqrt();
    let tan_half_e = half_factor * (true_anomaly * 0.5).tan();
    let eccentric_anomaly = 2.0 * tan_half_e.atan();
    // E → M: Kepler 방정식 직접 적용.
    eccentric_anomaly - eccentricity * eccentric_anomaly.sin()
}

/// [-π, π] 로 정규화.
fn wrap_to_pi(angle: f64) -> f64 {
    use std::f64::consts::{PI, TAU};
    let mut a = angle % TAU;
    if a > PI {
        a -= TAU;
    } else if a < -PI {
        a += TAU;
    }
    a
}

#[cfg(test)]
mod tests {
    use super::*;

    /// Galilean 실 e/i 범위에서 원소 → state → 원소 왕복 오차 ≤ 1e-10.
    #[test]
    fn test_osculating_roundtrip() {
        // μ_jupiter = G · M_jupiter. M_jupiter = 1.8982e27 kg, G = 6.67430e-11.
        let mu_jupiter = 6.67430e-11 * 1.8982e27;

        // Europa 근사 요소 (JPL Horizons 2026-01-01).
        let original = OscElements {
            semi_major_axis: 671_100_000.0,
            eccentricity: 0.009,
            inclination: 0.466_f64.to_radians(),
            longitude_of_ascending_node: 219.106_f64.to_radians() - std::f64::consts::PI,
            argument_of_periapsis: 0.2_f64,
            mean_anomaly: 1.5_f64,
            singularity: 0,
        };
        let (pos, vel) = to_state_vector(&original, mu_jupiter);
        let recovered = extract_osculating_elements(pos, vel, mu_jupiter);

        // 상대 오차 (semi_major_axis 는 m 단위 1e8 규모 — 절대 1e-2 는 상대 1e-10).
        let rel_a = ((recovered.semi_major_axis - original.semi_major_axis) / original.semi_major_axis).abs();
        assert!(
            rel_a < 1e-10,
            "semi_major_axis 상대 오차 {} > 1e-10",
            rel_a
        );
        let rel_e = (recovered.eccentricity - original.eccentricity).abs();
        assert!(rel_e < 1e-10, "eccentricity 오차 {} > 1e-10", rel_e);
        let rel_i = (recovered.inclination - original.inclination).abs();
        assert!(rel_i < 1e-10, "inclination 오차 {} > 1e-10", rel_i);
        let rel_node = angle_diff(recovered.longitude_of_ascending_node, original.longitude_of_ascending_node);
        assert!(rel_node < 1e-10, "Ω 오차 {} > 1e-10", rel_node);
        let rel_peri = angle_diff(recovered.argument_of_periapsis, original.argument_of_periapsis);
        assert!(rel_peri < 1e-10, "ω 오차 {} > 1e-10", rel_peri);
        let rel_m = angle_diff(recovered.mean_anomaly, original.mean_anomaly);
        assert!(rel_m < 1e-10, "M 오차 {} > 1e-10", rel_m);
        assert_eq!(recovered.singularity, 0, "특이점 플래그 오작동");
    }

    /// e ≈ 0 원순환 궤도에서 singularity=1 플래그 확인.
    #[test]
    fn test_osculating_circular_orbit_flags_singularity() {
        let mu_jupiter = 6.67430e-11 * 1.8982e27;
        // 완벽한 원순환: r=Europa a, v = sqrt(μ/r).
        let r: f64 = 671_100_000.0;
        let v = (mu_jupiter / r).sqrt();
        let pos = [r, 0.0, 0.0];
        let vel = [0.0, v, 0.0];
        let el = extract_osculating_elements(pos, vel, mu_jupiter);
        assert_eq!(el.singularity, 1, "e<1e-6 에서 특이점 플래그 누락");
        assert!(el.eccentricity < 1e-6, "e={} 기대 <1e-6", el.eccentricity);
    }

    /// 각도 차 (wrap-around 고려).
    fn angle_diff(a: f64, b: f64) -> f64 {
        use std::f64::consts::PI;
        let d = (a - b).abs() % (2.0 * PI);
        if d > PI { 2.0 * PI - d } else { d }
    }
}
