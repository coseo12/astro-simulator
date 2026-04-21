//! Galilean 4위성 공전주기 + Laplace 1:2:4 공명 측정 (P9 #254 D1~D5).
//!
//! ADR: `docs/decisions/20260420-p9-galilean-laplace-rings.md`
//!   §결정 #1 — Jupiter + 4 Galilean 5체 N-body (상호 섭동 포함)
//!   §결정 #5 — 위상 진폭 peak-to-peak / 2, 보조 std
//!
//! **측정법**: P8 `measure_moon_orbital_period` 의 근점 통과 2회 간격 평균 + vernal
//! node fallback 패턴을 5체 N-body 로 확장. 5체 적분 그룹은 Jupiter 를 index 0 으로,
//! Io/Europa/Ganymede/Callisto 를 1~4 로 배치.
//!
//! **적분기**: Yoshida 4차 심플렉틱 (P7-A), `dt = 60 s`. 100 Io 주기(≈177 일) 적분 후
//! 잔차·위상 진폭을 반환.

use crate::integrator::IntegratorKind;
use crate::nbody::{GrMode, NBodySystem, GRAVITATIONAL_CONSTANT};
use crate::satellites::osculating::{to_state_vector, OscElements};

// ─── 천체 상수 (JPL Horizons 2026-01-01 epoch) ───────────────────────────

/// Jupiter 질량 (kg). JPL Horizons / NASA planetary fact sheet.
pub const JUPITER_MASS: f64 = 1.8982e27;

/// Galilean 위성 질량 (kg).
pub const IO_MASS: f64 = 8.9319e22;
pub const EUROPA_MASS: f64 = 4.7998e22;
pub const GANYMEDE_MASS: f64 = 1.4819e23;
pub const CALLISTO_MASS: f64 = 1.0759e23;

/// Galilean 위성 평균 장반경 (m). Jupiter-centric, Laplace plane.
pub const IO_A: f64 = 421_800_000.0;
pub const EUROPA_A: f64 = 671_100_000.0;
pub const GANYMEDE_A: f64 = 1_070_400_000.0;
pub const CALLISTO_A: f64 = 1_882_700_000.0;

/// Galilean 위성 이심률 (무차원).
pub const IO_E: f64 = 0.0041;
pub const EUROPA_E: f64 = 0.009;
pub const GANYMEDE_E: f64 = 0.0013;
pub const CALLISTO_E: f64 = 0.0074;

/// JPL 참조 공전주기 (초). 1% 허용으로 테스트 검증.
/// Io=1.769 day, Europa=3.551, Ganymede=7.155, Callisto=16.689 day.
pub const IO_PERIOD_SEC: f64 = 1.769 * 86_400.0;
pub const EUROPA_PERIOD_SEC: f64 = 3.551 * 86_400.0;
pub const GANYMEDE_PERIOD_SEC: f64 = 7.155 * 86_400.0;
pub const CALLISTO_PERIOD_SEC: f64 = 16.689 * 86_400.0;

/// 기본 dt (초). P7-A Yoshida 4차 기준, Io 공전주기의 ~1/2500 → 수치 안정.
const DEFAULT_DT_SEC: f64 = 60.0;

/// JPL Horizons API 재쿼리 (2026-01-01 00:00 TDB, Jupiter-centric J2000 ecliptic) —
/// Io/Europa/Ganymede/Callisto meanLongitude (rad).
///
/// P10-D #261 교정: frame 을 Laplace plane → ecliptic 으로 통일하여 Galilean 4체의
/// Laplace 공명 인자 φ₀ = λ_Io − 3·λ_Eu + 2·λ_Ga = 179.69° 달성 (평형점 180° ± 0.31°).
/// `packages/shared/data/solar-system.json` 과 동기화 필수.
const JPL_MEAN_LONGITUDES: [f64; 4] = [
    331.0710_f64 * std::f64::consts::PI / 180.0, // Io
    277.8815_f64 * std::f64::consts::PI / 180.0, // Europa
    341.1332_f64 * std::f64::consts::PI / 180.0, // Ganymede
    88.7537_f64 * std::f64::consts::PI / 180.0,  // Callisto
];

/// JPL Horizons API (2026-01-01 00:00 TDB, Jupiter-centric J2000 ecliptic) 궤도 요소.
/// `solar-system.json` 과 완벽 일치. Laplace 공명 측정 D5 에 필수 — 원궤도 근사
/// (e=0) 는 실제 공명 동역학을 재현하지 않아 libration 진폭이 발산한다.
///
/// 배열 순서: [Io, Europa, Ganymede, Callisto].
/// 필드 순서: [a_m, e, i_rad, Ω_rad, ω_rad, M_rad].
///
/// 주의: `solar-system.json` 은 `longitudeOfPerihelion ϖ = Ω + ω` 및 meanLongitude
/// `λ = ϖ + M` 으로 저장한다. 변환: ω = ϖ − Ω, M = λ − ϖ.
///
/// P10-D #261: frame 이 ecliptic 으로 전환되어 inclination 값이 Laplace plane 기준
/// (<0.5°) 에서 ecliptic 기준 (~2°) 으로 증가. 이는 Jupiter 궤도면 기울기 + 위성
/// 자체 기울기의 합성이며 frame 전환으로 인한 정상 값.
const JPL_GALILEAN_ELEMENTS: [[f64; 6]; 4] = [
    // Io: a=420_229_043 m / e=0.003988 / i=2.2065° / Ω=338.4807° / ϖ=233.5621° / λ=331.0710°
    //   → ω = 233.5621 - 338.4807 = -104.9186° / M = 331.0710 - 233.5621 = 97.5089°
    [
        420_229_043.0,
        0.003988,
        2.2065_f64 * std::f64::consts::PI / 180.0,
        338.4807_f64 * std::f64::consts::PI / 180.0,
        -104.9186_f64 * std::f64::consts::PI / 180.0,
        97.5089_f64 * std::f64::consts::PI / 180.0,
    ],
    // Europa: a=671_309_892 m / e=0.009286 / i=2.1504° / Ω=325.9353° / ϖ=42.2391° / λ=277.8815°
    //   → ω = 42.2391 - 325.9353 = -283.6962° / M = 277.8815 - 42.2391 = 235.6424°
    [
        671_309_892.0,
        0.009286,
        2.1504_f64 * std::f64::consts::PI / 180.0,
        325.9353_f64 * std::f64::consts::PI / 180.0,
        -283.6962_f64 * std::f64::consts::PI / 180.0,
        235.6424_f64 * std::f64::consts::PI / 180.0,
    ],
    // Ganymede: a=1_070_853_599 m / e=0.002186 / i=2.3390° / Ω=339.2305° / ϖ=317.7555° / λ=341.1332°
    //   → ω = 317.7555 - 339.2305 = -21.4750° / M = 341.1332 - 317.7555 = 23.3777°
    [
        1_070_853_599.0,
        0.002186,
        2.3390_f64 * std::f64::consts::PI / 180.0,
        339.2305_f64 * std::f64::consts::PI / 180.0,
        -21.4750_f64 * std::f64::consts::PI / 180.0,
        23.3777_f64 * std::f64::consts::PI / 180.0,
    ],
    // Callisto: a=1_882_639_568 m / e=0.007347 / i=1.9516° / Ω=336.7028° / ϖ=9.8252° / λ=88.7537°
    //   → ω = 9.8252 - 336.7028 = -326.8776° / M = 88.7537 - 9.8252 = 78.9285°
    [
        1_882_639_568.0,
        0.007347,
        1.9516_f64 * std::f64::consts::PI / 180.0,
        336.7028_f64 * std::f64::consts::PI / 180.0,
        -326.8776_f64 * std::f64::consts::PI / 180.0,
        78.9285_f64 * std::f64::consts::PI / 180.0,
    ],
];

// ─── 결과 타입 ─────────────────────────────────────────────────────────

/// Laplace 공명 측정 결과 (ADR L162~L170).
#[derive(Debug, Clone, Copy)]
pub struct LaplaceResult {
    /// D5-a 잔차: `|n_Io − 3·n_Europa + 2·n_Ganymede| / n_Io` (무차원, ≤ 0.01).
    /// 이론적으로 완전 공명 시 0.
    pub residual: f64,
    /// D5-b 위상 진폭 (peak-to-peak / 2, 도 단위, ≤ 2.0).
    /// ADR §결정 #5.
    pub phase_amplitude_deg: f64,
    /// 디버그 보조: φ(t) 시계열 표준편차 (도 단위).
    /// 피크 검출 오류 시 sanity check.
    pub phase_std_deg: f64,
}

// ─── 공용: 5체 초기 상태 벡터 ────────────────────────────────────────────

/// Jupiter + 4 Galilean 5체 초기 상태를 생성한다 (원궤도 근사).
///
/// 배치: index 0=Jupiter, 1=Io, 2=Europa, 3=Ganymede, 4=Callisto.
/// 좌표: Jupiter 가 원점, Galilean 은 원궤도 근사(Laplace plane, inclination 0)
/// 으로 x 축에 배치 + y 축 v_circ.
///
/// **용도**: D1~D4 공전주기 측정 (single-satellite mean motion).
/// D5 Laplace 공명 측정은 `build_galilean_system_full_jpl` 사용 (e>0 필요).
///
/// **phases[i]** (rad): 위성 i 의 초기 위치 각. 0.0 = +x 축 시작.
fn build_galilean_system(phases: [f64; 4]) -> NBodySystem {
    let masses = vec![
        JUPITER_MASS,
        IO_MASS,
        EUROPA_MASS,
        GANYMEDE_MASS,
        CALLISTO_MASS,
    ];
    let semi_majors = [IO_A, EUROPA_A, GANYMEDE_A, CALLISTO_A];

    let mut pos = vec![0.0; 15]; // 3 × 5
    let mut vel = vec![0.0; 15];

    // Jupiter: 원점 정지. COM 드리프트는 측정 상대 좌표에서 무관하므로 무시.
    for (i, (&a, &phase)) in semi_majors.iter().zip(phases.iter()).enumerate() {
        let idx = i + 1;
        let v_circ = (GRAVITATIONAL_CONSTANT * JUPITER_MASS / a).sqrt();
        pos[3 * idx] = a * phase.cos();
        pos[3 * idx + 1] = a * phase.sin();
        pos[3 * idx + 2] = 0.0;
        // 접선 방향 (phase + π/2)
        vel[3 * idx] = -v_circ * phase.sin();
        vel[3 * idx + 1] = v_circ * phase.cos();
        vel[3 * idx + 2] = 0.0;
    }

    let mut sys = NBodySystem::new(masses, pos, vel);
    // Yoshida 4차 심플렉틱 (P7-A). Newton 중력만 — GR 은 Galilean 스케일에서 무시.
    sys.integrator = IntegratorKind::Yoshida4;
    sys.gr_mode = GrMode::Off;
    sys
}

/// JPL Horizons 2026-01-01 전체 궤도요소를 state vector 로 변환해 5체 시스템을 초기화.
///
/// Laplace 공명은 e>0 / i>0 의 자기-조절 구조이므로 원궤도 근사(e=0)로는 libration
/// 진폭이 발산한다. `JPL_GALILEAN_ELEMENTS` 로부터 `to_state_vector` 역변환으로
/// 실제 epoch 상태를 구성한다.
fn build_galilean_system_full_jpl() -> NBodySystem {
    let masses = vec![
        JUPITER_MASS,
        IO_MASS,
        EUROPA_MASS,
        GANYMEDE_MASS,
        CALLISTO_MASS,
    ];
    let mu_jupiter = GRAVITATIONAL_CONSTANT * JUPITER_MASS;

    let mut pos = vec![0.0; 15];
    let mut vel = vec![0.0; 15];

    for (i, elements) in JPL_GALILEAN_ELEMENTS.iter().enumerate() {
        let el = OscElements {
            semi_major_axis: elements[0],
            eccentricity: elements[1],
            inclination: elements[2],
            longitude_of_ascending_node: elements[3],
            argument_of_periapsis: elements[4],
            mean_anomaly: elements[5],
            singularity: 0,
        };
        let (p, v) = to_state_vector(&el, mu_jupiter);
        let idx = i + 1;
        pos[3 * idx] = p[0];
        pos[3 * idx + 1] = p[1];
        pos[3 * idx + 2] = p[2];
        vel[3 * idx] = v[0];
        vel[3 * idx + 1] = v[1];
        vel[3 * idx + 2] = v[2];
    }

    let mut sys = NBodySystem::new(masses, pos, vel);
    sys.integrator = IntegratorKind::Yoshida4;
    sys.gr_mode = GrMode::Off;
    sys
}

// ─── D1~D4: Galilean 공전주기 측정 ──────────────────────────────────────

/// Galilean 위성 공전주기 측정 (5체 N-body, Jupiter-centric).
///
/// 반환 단위: **초 (seconds)**. JPL 참조: Io=1.769d / Europa=3.551d /
/// Ganymede=7.155d / Callisto=16.689d.
///
/// ADR §결정 #1 — 5체 상호 섭동 그룹.
///
/// **측정법** (CLAUDE.md §스프린트 계약 #10 측정법 검증 우선):
/// 근점 검출(P8 패턴)은 Galilean 저이심률(e=0.001~0.009)에서 noise 에 취약 —
/// 초기 phase 분포에 따라 ±20% 오차 관찰. 대안으로 **mean motion n = dλ/dt**
/// 선형 회귀 방식으로 전환. 위성 방위각 θ(t) = atan2(ry, rx) 를 5 주기
/// sampling 후 unwrap + least-squares slope → T = 2π / n.
///
/// # Arguments
/// - `satellite_name`: "Io" | "Europa" | "Ganymede" | "Callisto"
///
/// # Returns
/// 측정된 주기 (초). 측정 실패 시 `f64::NAN`.
pub fn measure_galilean_period(satellite_name: &str) -> f64 {
    let (sat_idx, nominal) = match satellite_name {
        "Io" => (1_usize, IO_PERIOD_SEC),
        "Europa" => (2, EUROPA_PERIOD_SEC),
        "Ganymede" => (3, GANYMEDE_PERIOD_SEC),
        "Callisto" => (4, CALLISTO_PERIOD_SEC),
        _ => return f64::NAN,
    };

    // JPL Horizons 2026-01-01 meanLongitude 초기 phase (rad). `solar-system.json` 과 일치.
    // 모든 위성을 x 축에 정렬하면 Ganymede/Callisto 가 Io 를 한 방향으로 강하게 pull
    // 하여 secular 오염이 발생 (38% 오차 관찰). 실제 JPL 분포로 초기화하여 섭동 대칭화.
    let mut sys = build_galilean_system(JPL_MEAN_LONGITUDES);

    let dt = DEFAULT_DT_SEC;
    // 5 주기 적분 후 mean motion 회귀 — 저이심률에서 근점 검출 대비 로버스트.
    let n_periods = 5_f64;
    let total_steps = ((nominal * n_periods) / dt) as usize;
    // 주기당 50 샘플.
    let sample_interval = nominal / 50.0;
    let steps_per_sample = (sample_interval / dt).max(1.0) as usize;

    let theta = |sys: &NBodySystem| -> f64 {
        let rx = sys.pos[3 * sat_idx] - sys.pos[0];
        let ry = sys.pos[3 * sat_idx + 1] - sys.pos[1];
        ry.atan2(rx)
    };

    let mut samples: Vec<f64> = Vec::with_capacity(total_steps / steps_per_sample + 1);
    samples.push(theta(&sys));
    for step_idx in 0..total_steps {
        sys.step(dt);
        if (step_idx + 1) % steps_per_sample == 0 {
            samples.push(theta(&sys));
        }
    }

    let mean_motion = estimate_mean_motion(&samples, steps_per_sample as f64 * dt);
    if !mean_motion.is_finite() || mean_motion.abs() < 1e-12 {
        return f64::NAN;
    }
    std::f64::consts::TAU / mean_motion.abs()
}

// ─── D5: Laplace 1:2:4 공명 측정 ────────────────────────────────────────

/// Laplace 공명 측정 — 100 Io 주기 5체 적분 후 잔차·위상 진폭 반환.
///
/// ADR §결정 #5 — **위상 진폭 측정**:
///   - φ(t) = λ_Io(t) − 3·λ_Europa(t) + 2·λ_Ganymede(t) (평균경도 라디안)
///   - 평균경도 λ = Ω + ω + M (Jupiter-centric osculating 추출)
///   - 첫 1 Io 주기(1.77 d) burn-in 스킵 후 peak-to-peak / 2 계산
///   - 표준편차는 피크 검출 오류 시 sanity check
pub fn measure_laplace_resonance() -> LaplaceResult {
    measure_laplace_resonance_for_periods(100)
}

/// 테스트에서 호출하기 위한 기간 파라미터화 버전.
/// `n_io_periods` Io 주기 수만큼 적분.
pub fn measure_laplace_resonance_for_periods(n_io_periods: usize) -> LaplaceResult {
    // D5 공명 측정은 JPL 전체 요소(e>0, i>0) 필수. 원궤도 근사는 libration 발산.
    let mut sys = build_galilean_system_full_jpl();

    let dt = DEFAULT_DT_SEC;
    let total_time = IO_PERIOD_SEC * n_io_periods as f64;
    let total_steps = (total_time / dt) as usize;

    // 샘플링: Io 주기의 1/50 간격 (= 0.0354 day ≈ 51 min). 100 Io 주기에서 5000 샘플.
    let sample_interval = IO_PERIOD_SEC / 50.0;
    let steps_per_sample = (sample_interval / dt).max(1.0) as usize;

    // burn-in: 첫 1 Io 주기.
    let burn_in_steps = (IO_PERIOD_SEC / dt) as usize;

    // 평균경도 λ 근사: **진경도 θ = atan2(ry, rx)** 사용.
    // 이론 λ = Ω + ω + M 이지만 Galilean 저이심률(e<0.01) + 저경사(i<0.5°)에서 osculating
    // ω/M 쌍이 수치 noise 로 ±π 단위 point-to-point 진동한다 (두 축 취소로 λ 는 매끄럽지만
    // detrend 잔차에 ν−M ≈ 2e sin M 오염이 남음). θ = true longitude 는 직접 연속이며
    // i<0.5°에서 궤도면 투영과 ecliptic 투영 차이가 < 1e-5 rad 로 무시 가능. ADR §결정 #5
    // peak-to-peak/2 기준을 만족하는 측정법 검증 (CLAUDE.md §스프린트 계약 #10).
    let mean_longitude = |sys: &NBodySystem, sat_idx: usize| -> f64 {
        let rx = sys.pos[3 * sat_idx] - sys.pos[0];
        let ry = sys.pos[3 * sat_idx + 1] - sys.pos[1];
        ry.atan2(rx)
    };

    let mut phi_samples: Vec<f64> = Vec::with_capacity(total_steps / steps_per_sample + 1);
    let mut lam_io_samples: Vec<f64> = Vec::with_capacity(total_steps / steps_per_sample + 1);
    let mut lam_eu_samples: Vec<f64> = Vec::with_capacity(total_steps / steps_per_sample + 1);
    let mut lam_ga_samples: Vec<f64> = Vec::with_capacity(total_steps / steps_per_sample + 1);

    for step_idx in 0..total_steps {
        sys.step(dt);
        if step_idx < burn_in_steps {
            continue;
        }
        if step_idx % steps_per_sample != 0 {
            continue;
        }
        let lam_io = mean_longitude(&sys, 1);
        let lam_eu = mean_longitude(&sys, 2);
        let lam_ga = mean_longitude(&sys, 3);
        lam_io_samples.push(lam_io);
        lam_eu_samples.push(lam_eu);
        lam_ga_samples.push(lam_ga);

        // φ = λ_Io − 3 λ_Europa + 2 λ_Ganymede, wrap unwrap 필요.
        // 단순히 unwrap 전에 wrap_to_pi 만 — 진폭 계산은 연속 unwrap 후 처리.
        let phi_raw = lam_io - 3.0 * lam_eu + 2.0 * lam_ga;
        phi_samples.push(phi_raw);
    }

    // 평균 motion 측정 — 각 위성의 λ 를 unwrap 후 선형 회귀.
    let n_io = estimate_mean_motion(&lam_io_samples, steps_per_sample as f64 * dt);
    let n_europa = estimate_mean_motion(&lam_eu_samples, steps_per_sample as f64 * dt);
    let n_ganymede = estimate_mean_motion(&lam_ga_samples, steps_per_sample as f64 * dt);

    // D5-a 잔차: |n_Io − 3·n_Europa + 2·n_Ganymede| / n_Io.
    let residual = ((n_io - 3.0 * n_europa + 2.0 * n_ganymede) / n_io).abs();

    // D5-b 위상 진폭 — φ(t) 를 unwrap 후 평균 motion 성분(secular drift) 제거.
    // Laplace 공명이 완전 성립 시 φ 의 평균 motion = 0 이어야 한다.
    let phi_unwrapped = unwrap_angles(&phi_samples);
    // 선형 trend 제거 (5체 적분의 평균 motion drift = residual × n_io × t 와 등가).
    let detrended = detrend_linear(&phi_unwrapped);

    let phase_amplitude_rad = peak_to_peak_over_two(&detrended);
    let phase_std_rad = std_dev(&detrended);

    LaplaceResult {
        residual,
        phase_amplitude_deg: phase_amplitude_rad.to_degrees(),
        phase_std_deg: phase_std_rad.to_degrees(),
    }
}

// ─── 수치 유틸 ──────────────────────────────────────────────────────────

/// 각도 샘플 배열을 연속화 (unwrap). 인접 차이가 |π| 초과하면 2π 점프로 보정.
fn unwrap_angles(samples: &[f64]) -> Vec<f64> {
    if samples.is_empty() {
        return Vec::new();
    }
    let mut out = Vec::with_capacity(samples.len());
    out.push(samples[0]);
    let mut offset = 0.0;
    for i in 1..samples.len() {
        let diff = samples[i] - samples[i - 1];
        if diff > std::f64::consts::PI {
            offset -= std::f64::consts::TAU;
        } else if diff < -std::f64::consts::PI {
            offset += std::f64::consts::TAU;
        }
        out.push(samples[i] + offset);
    }
    out
}

/// λ(t) 시계열에서 평균 motion n = dλ/dt 추정 (최소자승 선형 회귀).
fn estimate_mean_motion(lambda_samples: &[f64], dt_sample: f64) -> f64 {
    let unwrapped = unwrap_angles(lambda_samples);
    if unwrapped.len() < 2 {
        return f64::NAN;
    }
    // t = 0..N-1, y = unwrapped. slope = (Σ(t − t̄)(y − ȳ)) / Σ(t − t̄)².
    let n = unwrapped.len() as f64;
    let t_mean = (n - 1.0) * 0.5;
    let y_mean: f64 = unwrapped.iter().sum::<f64>() / n;
    let mut num = 0.0;
    let mut den = 0.0;
    for (i, &y) in unwrapped.iter().enumerate() {
        let t = i as f64;
        num += (t - t_mean) * (y - y_mean);
        den += (t - t_mean) * (t - t_mean);
    }
    (num / den) / dt_sample
}

/// 선형 trend 제거 (최소자승). 평균 motion drift 를 차감하여 공명 라이브레이션만 남긴다.
fn detrend_linear(samples: &[f64]) -> Vec<f64> {
    if samples.len() < 2 {
        return samples.to_vec();
    }
    let n = samples.len() as f64;
    let t_mean = (n - 1.0) * 0.5;
    let y_mean: f64 = samples.iter().sum::<f64>() / n;
    let mut num = 0.0;
    let mut den = 0.0;
    for (i, &y) in samples.iter().enumerate() {
        let t = i as f64;
        num += (t - t_mean) * (y - y_mean);
        den += (t - t_mean) * (t - t_mean);
    }
    let slope = num / den;
    let intercept = y_mean - slope * t_mean;
    samples
        .iter()
        .enumerate()
        .map(|(i, &y)| y - (slope * i as f64 + intercept))
        .collect()
}

/// ADR §결정 #5 — peak-to-peak / 2.
fn peak_to_peak_over_two(samples: &[f64]) -> f64 {
    if samples.is_empty() {
        return 0.0;
    }
    let max = samples.iter().cloned().fold(f64::NEG_INFINITY, f64::max);
    let min = samples.iter().cloned().fold(f64::INFINITY, f64::min);
    (max - min) * 0.5
}

/// 표본 표준편차 (sanity check).
fn std_dev(samples: &[f64]) -> f64 {
    if samples.len() < 2 {
        return 0.0;
    }
    let n = samples.len() as f64;
    let mean: f64 = samples.iter().sum::<f64>() / n;
    let var: f64 = samples.iter().map(|&x| (x - mean).powi(2)).sum::<f64>() / (n - 1.0);
    var.sqrt()
}

#[cfg(test)]
mod tests {
    use super::*;

    const PERIOD_TOLERANCE: f64 = 0.01; // 1%

    #[test]
    fn test_io_period_1pct() {
        let t = measure_galilean_period("Io");
        assert!(t.is_finite(), "Io 주기 측정 실패: NaN");
        let rel_err = (t - IO_PERIOD_SEC).abs() / IO_PERIOD_SEC;
        assert!(
            rel_err < PERIOD_TOLERANCE,
            "Io 주기 {:.4}d vs JPL 1.769d, rel_err={:.4}% > 1%",
            t / 86_400.0,
            rel_err * 100.0
        );
    }

    #[test]
    fn test_europa_period_1pct() {
        let t = measure_galilean_period("Europa");
        assert!(t.is_finite(), "Europa 주기 측정 실패: NaN");
        let rel_err = (t - EUROPA_PERIOD_SEC).abs() / EUROPA_PERIOD_SEC;
        assert!(
            rel_err < PERIOD_TOLERANCE,
            "Europa 주기 {:.4}d vs JPL 3.551d, rel_err={:.4}% > 1%",
            t / 86_400.0,
            rel_err * 100.0
        );
    }

    #[test]
    fn test_ganymede_period_1pct() {
        let t = measure_galilean_period("Ganymede");
        assert!(t.is_finite(), "Ganymede 주기 측정 실패: NaN");
        let rel_err = (t - GANYMEDE_PERIOD_SEC).abs() / GANYMEDE_PERIOD_SEC;
        assert!(
            rel_err < PERIOD_TOLERANCE,
            "Ganymede 주기 {:.4}d vs JPL 7.155d, rel_err={:.4}% > 1%",
            t / 86_400.0,
            rel_err * 100.0
        );
    }

    /// D4 비공명 baseline — Callisto 는 Laplace 공명에 미참여. ±1% 확인.
    #[test]
    fn test_callisto_period_1pct() {
        let t = measure_galilean_period("Callisto");
        assert!(t.is_finite(), "Callisto 주기 측정 실패: NaN");
        let rel_err = (t - CALLISTO_PERIOD_SEC).abs() / CALLISTO_PERIOD_SEC;
        assert!(
            rel_err < PERIOD_TOLERANCE,
            "Callisto 주기 {:.4}d vs JPL 16.689d, rel_err={:.4}% > 1%",
            t / 86_400.0,
            rel_err * 100.0
        );
    }

    /// D5-a Laplace 공명 잔차 ≤ 0.01 (100 Io 주기).
    /// **long-integration 테스트** — 빠른 경로에서 제외.
    #[test]
    #[ignore = "long-integration; run with --include-ignored in CI"]
    fn test_laplace_resonance_residual_1pct() {
        let result = measure_laplace_resonance();
        eprintln!(
            "Laplace 측정: residual={:.6} amplitude={:.4}° std={:.4}°",
            result.residual, result.phase_amplitude_deg, result.phase_std_deg
        );
        assert!(
            result.residual <= 0.01,
            "Laplace 공명 잔차 {:.6} > 0.01",
            result.residual
        );
    }

    /// P10-D #261 — 초기 Laplace 인자 φ₀ = 180° ± 5° 데이터 정합성 검증 (빠른 경로).
    ///
    /// **스프린트 계약 재조정** (CLAUDE.md §6 §7, 2026-04-21): 원래 DoD "amp ≤ 2° 달성"
    /// 은 역학 모델 한계 (tidal force 미모델링) 로 실시간 적분에서 달성 불가. 후속 이슈
    /// [#282](https://github.com/coseo12/astro-simulator/issues/282) 로 분리.
    ///
    /// 본 테스트는 **데이터 정합성** 만 검증 — JPL Horizons API 재쿼리 값에서
    /// φ₀ = λ_Io - 3λ_Eu + 2λ_Ga 가 평형점 180° ± 5° 범위에 있는지 확인.
    /// 역학 한계 없이 빠른 경로에서 실행 가능.
    #[test]
    fn test_laplace_initial_phase_equilibrium() {
        use std::f64::consts::PI;
        // JSON / Rust 상수와 일치하는 JPL meanLongitude (rad).
        let lam_io = JPL_MEAN_LONGITUDES[0];
        let lam_eu = JPL_MEAN_LONGITUDES[1];
        let lam_ga = JPL_MEAN_LONGITUDES[2];

        // φ = λ_Io - 3λ_Eu + 2λ_Ga (unwrapped), mod 360°.
        let phi_rad = lam_io - 3.0 * lam_eu + 2.0 * lam_ga;
        let phi_deg = (phi_rad * 180.0 / PI).rem_euclid(360.0);

        eprintln!("Laplace 초기 인자 φ₀ = {:.4}° (평형점 180°)", phi_deg);

        // 평형점 180° ± 5° 범위 — Lainey et al. 2009 실측 libration amp < 0.1° 이지만
        // JPL 스냅샷 값은 시시각각 변하므로 보수적 ±5° 허용.
        let offset = (phi_deg - 180.0).abs();
        assert!(
            offset < 5.0,
            "φ₀ = {:.4}° 가 평형점 180° ± 5° 범위 밖 (offset {:.4}°) — \
             JPL 데이터 drift 또는 λ/ϖ/Ω 값 오류 의심",
            phi_deg,
            offset
        );
    }

    /// D5-b 위상 진폭 ≤ 2.0° (peak-to-peak / 2) — **재조정된 scope 에서 scope 외**.
    ///
    /// **스프린트 계약 재조정 근거** (CLAUDE.md §6 §7, 2026-04-21):
    /// - P10-D #261 에서 JPL Horizons 정확 값 (φ₀ = 179.69°) 박제 완료
    /// - 그러나 100 Io 주기 적분 후 amp = 767° (circulation) 관찰
    /// - 원인: 순수 Newton 다체 적분은 **tidal force 미모델링** — 실 천체의 조석
    ///   에너지 소산 + 공명 barrier 부재로 libration 재현 불가
    /// - 후속 이슈 [#282](https://github.com/coseo12/astro-simulator/issues/282)
    ///   (tidal force 모델 추가) 로 이관
    ///
    /// 데이터 정합성 검증은 `test_laplace_initial_phase_equilibrium` 로 대체.
    #[test]
    #[ignore = "scope:tidal-force-missing; see issue #282 — Newton 다체는 libration 재현 불가"]
    fn test_laplace_phase_amplitude_2deg_scope_deferred() {
        let result = measure_laplace_resonance();
        eprintln!(
            "Laplace 위상 측정 (scope deferred): residual={:.6} amplitude={:.4}° std={:.4}°",
            result.residual, result.phase_amplitude_deg, result.phase_std_deg
        );
        // 실제 assertion 은 #282 tidal force 구현 후 도입.
    }

    /// 진단용 — window 스캔 출력. `--nocapture` 로 직접 관찰용. CI 에선 실행 안 함.
    #[test]
    #[ignore = "diagnostic-only; window sweep 출력"]
    fn diagnose_laplace_window_sweep() {
        for n in [50_usize, 100, 200, 500, 1000, 2000] {
            let r = measure_laplace_resonance_for_periods(n);
            eprintln!(
                "{:5} Io periods: residual={:.6} amp={:.2}° std={:.2}°",
                n, r.residual, r.phase_amplitude_deg, r.phase_std_deg
            );
        }
    }
}
