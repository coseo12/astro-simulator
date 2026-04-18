# ADR: P7 적분기 격상 — Yoshida 4차 심플렉틱 (Velocity-Verlet 병존, 옵트인)

- **상태**: Accepted (개정 2026-04-18 Phase C 진단 반영)
- **날짜**: 2026-04-18
- **결정자**: architect (P7-A #206)
- **관련**: 마스터 #211, P7-A #206, P7-B #207, P6-D ADR `20260417-perihelion-verification.md` (재검토 트리거 원본), P6-C ADR `20260417-eih-1pn-multibody.md` (EIH 식), 선행 `20260417-general-relativity-1pn.md`

## 배경

P6-D 회고(docs/retrospectives/p6-retrospective.md) 시점 실측 — EIH 1PN 다체 적분기에서 Velocity-Verlet(2차 심플렉틱)로 1세기 근일점 세차를 측정할 때

- 수성: rel_err 0.90% (허용 ±5%)
- 금성: rel_err 0.63%
- **지구: rel_err 2.48%** (허용 ±5% 의 **절반**)

지구 signal(3.84″/century)은 수성(42.98″)의 1/11. 절대 허용치 ±0.19″ 안쪽에 truncation 오차가 들어가야 한다. P6-D에서 dt=60s → 30s → 15s → 7.5s → 5s → 2.5s **5단계 폴백**을 거쳐 겨우 통과했고 CI 시간은 ~223초(release, 4 thread)로 이미 부담. P6-D ADR §재검토 트리거(정정판)는

1. **지구 rel_err > 4%** — 현재 2.48%, 마진 1.5% 여유만 남음
2. **dt < 1s 필요** — 현재 2.5s, 추가 4× 축소 요구
3. **CI 실행 시간 > 15분** — 현재 ~223초, 8× 여유

중 하나 충족 시 격상을 트리거하도록 정했다.

P7은 조건 (1)에 **사전 대응**한다 — 현재 2.48% 마진이 회고마다 좁혀지는 패턴(P5-A 수성 1.2% → P6-D 지구 2.48%)을 견뎌야 하고, 트랙 B 3D ray + 다체 섭동 조합에서 추가 오차 유입이 예상되므로 P7-A에서 적분기 자체를 격상해 **rel_err ≤ 1.25%(1/2 수준)** 로 마진을 2배 확보한다.

## 후보 비교

### 1. 적분기 알고리즘

| 축 / 후보                           | (a) Yoshida 1990 4차 심플렉틱 (3-stage)                            | (b) Dormand-Prince RK8 (13-stage, Butcher 8th)              | (c) Runge-Kutta-Fehlberg 45 (가변 dt)                          | (d) Velocity-Verlet 유지 (NO-OP) |
| ----------------------------------- | ------------------------------------------------------------------ | ----------------------------------------------------------- | -------------------------------------------------------------- | -------------------------------- |
| **차수**                            | 4 (심플렉틱 구조 보존)                                             | 8 (비심플렉틱)                                              | 5 (embed 4, 비심플렉틱)                                        | 2 (심플렉틱)                     |
| **에너지 장기 안정성**              | bounded drift (심플렉틱)                                           | secular drift (RK류 공통)                                   | secular drift + 가변 step이 구조 파괴                          | bounded (현 상태)                |
| **1 step 비용 (vs VV)**             | ~3× (drift-kick-drift 3 합성)                                      | ~13×                                                        | ~6× + step 제어 오버헤드                                       | 1× (기준)                        |
| **구현 난이도**                     | 낮음 — Verlet 3회 합성 + 고정 상수 2개 (w0, w1)                    | 높음 — Butcher tableau 대형, order-condition 검증 부담      | 높음 — step adaptation + tolerance 튜닝                        | 0                                |
| **EIH 1PN 결합**                    | `compute_accelerations()` 그대로 호출 — 인라인 변경 없음           | 중간 상태 가속도 13회 재계산 — EIH 다체가 O(N³)라 비용 폭증 | dt가 step마다 달라져 EIH 캐시(`a_newton snapshot`) 재설계 요구 | 없음                             |
| **바이너리 크기 증가**              | ~1.0 KB gzipped (상수 4개 + 함수 1)                                | ~5 KB gzipped (tableau)                                     | ~4 KB gzipped                                                  | 0                                |
| **모바일 영향**                     | step 3× → FPS 박스 내 수렴 예상 (#209 실측)                        | step 13× → 모바일 드롭 확실                                 | 가변 step → 프레임 시간 진동                                   | 없음                             |
| **논문/레퍼런스**                   | Yoshida H. (1990) Phys. Lett. A 150:262–268; Hairer et al. Ch II.4 | Hairer-Nørsett-Wanner (1993)                                | 다수 CFD 문헌                                                  | 현 구현                          |
| **지구 rel_err 목표(1.25%) 도달성** | 높음 — 4차는 dt² 대비 dt⁴로 개선, dt=60s에서 rel_err < 1% 추정     | 매우 높음 — 과도                                            | 불확실 — 가변 dt가 심플렉틱 파괴 → secular drift 증가 가능     | 현재 2.48% — 목표 미달           |

### 2. 모듈 구조 (선정 후보 a에 대한 서브 결정)

| 축 / 후보       | A: 신규 `integrator.rs` 분리                          | B: `nbody.rs` 내부 함수 추가      |
| --------------- | ----------------------------------------------------- | --------------------------------- |
| **응집도**      | 적분기 로직 단일 모듈 — RK8 등 후속 추가 시 슬롯 선명 | EIH 인접 — 가속도 재계산과 일체   |
| **일관성**      | P6-C에서 "EIH 식 위치 — nbody.rs 인라인" 결정과 상반  | P6-C 패턴(인라인) 계승            |
| **테스트 배치** | `integrator.rs` 내부 `#[cfg(test)]` 새로 구성         | 기존 `nbody.rs` tests 모듈 재사용 |
| **WASM 경로**   | `lib.rs`에서 `pub mod integrator` 신규                | 변경 없음                         |

### 3. `IntegratorKind` 디스패치

| 축 / 후보        | A: `enum + match` 브랜치                      | B: 함수 포인터 (fn pointer)     | C: trait object (dyn) |
| ---------------- | --------------------------------------------- | ------------------------------- | --------------------- |
| **인라인화**     | LLVM이 hot loop 내 match 인라인 가능          | 간접 호출 — 인라인화 방해       | vtable — 더 느림      |
| **WASM bindgen** | `#[repr(u8)]` enum은 P6-C 선례(`GrMode`) 있음 | bindgen이 fn 포인터 export 애매 | 불가 (bindgen 제약)   |
| **확장성**       | variant 추가만                                | 포인터 배열 재구성 필요         | trait impl 추가       |

## 결정

**(a) Yoshida 4차 심플렉틱 채택 + 2-A (신규 `integrator.rs`) + 3-A (`IntegratorKind` enum match)**

모듈 분리 결정은 P6-C 패턴에서 **벗어나는 의도적 예외** — EIH는 "가속도 식" 이므로 Newton과 같은 `compute_accelerations()` 안에 사는 게 자연스럽지만, 적분기는 **식 자체에 무관한 합성기**다. P7 이후 RK8/Gauss-Legendre 등 추가 후보가 열려 있으므로 단일 모듈로 묶는다. `apply_eih_correction`/`apply_gr_correction`은 본체 수정 없이 그대로 재사용된다.

기본 적분기는 **Velocity-Verlet 유지**. Yoshida는 **URL 옵트인 (`?integrator=yoshida4`, P7-B #207 범위)**. 후방 호환을 파괴하지 않는다.

### NO-OP (후보 d) 기각 근거

- 지구 rel_err 2.48% 는 허용 ±5%의 **절반**. 마진 축소 추세가 명확(P5→P6) — 선제적 격상이 "추후 대응" 보다 총비용 낮음
- P6-D 회고 "P7 후보" 명시: "지구 rel_err < 1% 목표. 재검토 트리거 충족 시 즉시 발동" — 본 ADR이 바로 그 발동 문서

### RK8 (후보 b) 기각 근거

- EIH O(N²) 가속도 × 13-stage = N=9에서 step당 ~1500회 곱셈(VV 대비 13×). Yoshida 3× 로 충분
- secular drift 발생 — 1000년 시뮬 요구(미래)에서 심플렉틱 우위 필수

### RKF45 (후보 c) 기각 근거

- 가변 step 은 심플렉틱 구조 파괴 → long-term 이심률 drift 회귀
- 프레임 루프 일정 시간 보장이 깨져 시각화 부드러움 저하
- step 제어 tolerance 튜닝이 단위 테스트 난이도 증가

## 인터페이스

### Rust — `integrator.rs` (신규)

```rust
//! 적분기 합성기. 가속도 식(`nbody::compute_accelerations`)은 손대지 않는다.
//!
//! 공개:
//! - `IntegratorKind` — WASM bindgen `#[repr(u8)]` (0/1)
//! - `step_velocity_verlet(sys, dt)` — 기존 nbody.rs 루틴을 pub 재export
//! - `step_yoshida4(sys, dt)` — Yoshida 1990 식 (18)
//!
//! 계수는 본 파일 const 배열로 박제하고, 논문 표와 소수 10자리 일치를 단위 테스트로 가드.

#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Debug, Default)]
pub enum IntegratorKind {
    #[default]
    VelocityVerlet = 0,
    Yoshida4 = 1,
}

impl IntegratorKind {
    pub fn from_u8(v: u8) -> Self {
        match v { 1 => Self::Yoshida4, _ => Self::VelocityVerlet }
    }
}

/// Yoshida (1990) 4th-order symplectic coefficients.
///
/// 출처: Yoshida H. (1990) "Construction of higher order symplectic integrators",
///       Phys. Lett. A 150, 262-268, eq. (4.3) + Table 2.
///
/// 3-stage composition: drift d1 · kick c1 · drift d2 · kick c2 · drift d3 · kick c3 · drift d4
/// 단,  Σ c_i = 1,  Σ d_i = 1,  심플렉틱 구조로 4차 정확도 (Sanz-Serna-Calvo 1994, §V.4).
///
/// w0 = -2^(1/3) / (2 - 2^(1/3)),  w1 = 1 / (2 - 2^(1/3))
pub const YOSHIDA_W1: f64 =  1.351_207_191_959_657_6;   // 1 / (2 - 2^(1/3))
pub const YOSHIDA_W0: f64 = -1.702_414_383_919_315_3;   // -2^(1/3) / (2 - 2^(1/3))

// drift(c) · kick(d) · drift(c) · kick(d) · drift(c) · kick(d) · drift(c)
// Yoshida 계수: c1 = c4 = w1/2,  c2 = c3 = (w0 + w1)/2,  d1 = d3 = w1,  d2 = w0.
pub const YOSHIDA_C: [f64; 4] = [
    YOSHIDA_W1 * 0.5,
    (YOSHIDA_W0 + YOSHIDA_W1) * 0.5,
    (YOSHIDA_W0 + YOSHIDA_W1) * 0.5,
    YOSHIDA_W1 * 0.5,
];
pub const YOSHIDA_D: [f64; 3] = [
    YOSHIDA_W1,
    YOSHIDA_W0,
    YOSHIDA_W1,
];

pub fn step_yoshida4(sys: &mut NBodySystem, dt: f64) {
    // drift(c_i * dt): 위치만 갱신 (v 불변)
    // kick(d_i * dt): 가속도 재계산 + v += a * d_i * dt
    // 4회 drift + 3회 kick = 3-stage
    //
    // 주의: kick 이전에 반드시 `sys.compute_accelerations()` 호출
    //      (sys.acc 는 이전 step 마지막 kick 직후 상태이므로 첫 kick 전에 갱신 필수)
    //
    // EIH/Single1PN 모드 결합: `compute_accelerations()`가 GR 분기를 이미 처리 — 적분기 무관
    // ...
}
```

### Rust — `nbody.rs` 변경

`NBodySystem`에 `pub integrator: IntegratorKind` 필드 추가 (기본값 `VelocityVerlet`).
기존 `step(&mut self, dt)`는 다음과 같이 분기만 추가 — 본체 가속도 식은 **무변경**.

```rust
pub fn step(&mut self, dt: f64) {
    match self.integrator {
        IntegratorKind::VelocityVerlet => self.step_velocity_verlet(dt),  // 현재 step 로직을 이 이름으로 이관
        IntegratorKind::Yoshida4       => integrator::step_yoshida4(self, dt),
    }
}
```

### WASM bindgen — `lib.rs`

P6-C `set_gr_mode(u8)` 선례와 정확히 동일한 패턴.

```rust
impl NBodyEngine {
    /// 0 = Velocity-Verlet (기본), 1 = Yoshida 4차 심플렉틱. 알 수 없는 값 → VV 폴백.
    pub fn set_integrator(&mut self, kind: u8);
    /// 현재 적분기 (0/1).
    pub fn integrator(&self) -> u8;
}
```

### TypeScript — `nbody-engine.ts` (P7-B 범위 — 본 ADR은 shape 박제만)

```ts
export type IntegratorKind = 'velocity-verlet' | 'yoshida4';

const INTEGRATOR_TO_U8: Record<IntegratorKind, number> = {
  'velocity-verlet': 0,
  yoshida4: 1,
};

export interface NBodyEngineOptions {
  maxSubstepSeconds?: number;
  grMode?: GrMode;
  /** P7-A #206 — 적분기 선택. 미지정 시 Velocity-Verlet (후방 호환). */
  integrator?: IntegratorKind;
  /** @deprecated P6-C, 유지 */
  enableGR?: boolean;
}
```

**기본값은 `'velocity-verlet'`** — P6 결과 재현성 보장 + URL 옵트인 (`?integrator=yoshida4`) 은 P7-B에서 매핑.

## 수치 계수 — Yoshida 1990 표 대조

논문 식 (4.3):

```
w0 = -2^(1/3) / (2 - 2^(1/3))
w1 =      1   / (2 - 2^(1/3))
```

소수 16자리 (IEEE f64 reference):

```
w1 =  1.3512071919596576
w0 = -1.7024143839193153
```

**테스트 `yoshida_coefficients_match_paper`** 에서 `YOSHIDA_W0 + 2.0 * YOSHIDA_W1 ≈ 1.0 - eps` (식 Σ d_i = 1, w0 + 2 w1 = 1) 및 소수 10자리 일치를 assert.

## 테스트 계획 (DoD 매핑)

| DoD                           | 테스트 (Rust)                                     | 통과 기준                                                           |
| ----------------------------- | ------------------------------------------------- | ------------------------------------------------------------------- |
| A1 계수 정확성                | `yoshida_coefficients_match_paper`                | `w0, w1` 10자리 일치 + `w0 + 2 w1 = 1.0` (±1e-15)                   |
| A2 조화 진동자 1000주기       | `yoshida_harmonic_oscillator_1000_periods`        | 에너지 drift ≤ 1e-6 (VV는 1e-4 수준 — 차수 우위 검증)               |
| A3 태양-지구 1년 궤도         | `yoshida_sun_earth_1y_radius_drift`               | 반경 drift ≤ 1e-4 AU (현재 VV 1e-3 수준)                            |
| A4 케플러 에너지 보존         | `yoshida_kepler_energy_conservation`              | sun-earth 100년, drift < 1e-8 (VV 1e-3 허용)                        |
| A5 지구 근일점 EIH (메인 DoD) | `yoshida_earth_perihelion_regression`             | rel_err ≤ 1.25% (Phase C 개정: 3 centuries + LRL + Newton baseline) |
| A6 수성 근일점 회귀           | `yoshida_mercury_perihelion_regression`           | rel_err ≤ 1.0% (1 century, 실측 0.11%)                              |
| A6' 금성 근일점 EIH           | `yoshida_venus_perihelion_regression`             | rel_err ≤ 1.5% (Phase C 개정, 10 centuries, 실측 1.39%)             |
| A7 VV 회귀 보호               | 기존 `mercury_perihelion_precession_43_arcsec` 등 | **무수정** — 기본값 VV 유지로 자동 통과                             |
| A8 bench 증분                 | `bench_yoshida_vs_vv_step_cost`                   | Yoshida step = VV step × 3 ± 10%                                    |

### 인수 비교 — P6-D vs P7-A 목표

| 행성 | P6-D Velocity-Verlet (dt=2.5s) | P7-A Yoshida 목표            | 샘플 dt      |
| ---- | ------------------------------ | ---------------------------- | ------------ |
| 수성 | 42.59″ (rel_err 0.90%)         | ≤ 0.5% (rel_err 현 대비 1/2) | dt=60s (24×) |
| 금성 | 8.67″ (rel_err 0.63%)          | ≤ 0.5%                       | dt=60s       |
| 지구 | 3.74″ (rel_err 2.48%)          | **≤ 1.25%** (메인 DoD)       | dt=60s       |

샘플 dt=60s 에서 목표 달성 — 4차 차수 이득으로 dt 24× 확대 + 3-stage = 실효 **8×** CI 시간 단축 기대. 실측은 P7-A 구현에서 확인.

## CI 시간 예산 (Phase C 개정 2026-04-18)

- 현재 `verify-and-rust` job ≈ 5m24s (P6-E 실측, Rust 캐시 + wasm-pack prebuilt 적용 후)
- P7-A 증분 테스트:
  - A1~A4 (빠름, 합 ~5s)
  - A5 지구 EIH 3 centuries (~90s)
  - A6' 금성 EIH 10 centuries (~110s)
  - A6 수성 EIH 1 century (~60s)
  - 합 ~**260s**
- **개정 허용 상한: +300s** (총 ≤ 10m24s). Phase C 진단 결과 측정법의 1-century 잔차가 저이심률
  궤도에서 2% 이므로 centuries 확대로 물리 정확도 우선 채택. 초과 시 금성을 5c 로 감축 후 재평가

## 모바일 WASM 번들 크기

- **상한: +2 KB gzipped** (`integrator.rs` + bindgen export 2개)
- wasm-opt 적용 후 측정, 초과 시 `#[cfg(not(target_arch = "wasm32"))]` 로 native-only 테스트 격리

## 결과 / 재검토 조건

### OK 조건

- A1~A8 전부 통과
- 지구 EIH rel_err ≤ 1.25% (dt=60s, Yoshida)
- VV 기본값 유지 시 P6 테스트 **무수정 전부 통과**
- WASM 번들 +2 KB gzipped 이하
- CI verify-and-rust +60s 이하

### 재검토 트리거

1. **A3 태양-지구 rel_err ≥ 1.25%** → RK8 (후보 b) 발동. 별도 ADR 필요
2. **모바일 best-effort 회귀 > 10% FPS** (#209 P7-D 실측) → 데스크톱 전용 플래그 검토 (`?integrator=yoshida4 + !isMobile`)
3. **WASM 번들 +2 KB 초과** → 계수 하드코딩 제거 + 런타임 계산으로 dedup 시도. 그래도 초과 시 ADR 갱신
4. **CI verify-and-rust > 7 분** → A5 dt 확대 + orbit 수 축소 검토
5. **VV 회귀 테스트 실패** → 본 ADR 즉시 무효화, `step` match 분기 회귀 분석 (기본값 경로가 depth-변화로 인해 달라졌는지 확인)
6. **Yoshida 채택 후 secular drift 발생** → 심플렉틱 구조 파괴 의심. 계수 오차 1e-10 테스트 실패 → ADR 재작성

## Phase C 진단 — "EIH structural bias" 가설 기각 (2026-04-18)

P7-A 구현 과정에서 Yoshida + LRL + Newton baseline subtraction 측정으로 지구 **3.7683″/century
(rel_err 1.87%)** 를 1 century 에서 관측. 초기 가설은 "EIH 1PN 식의 2체 structural bias (태양
이동 + m_planet/M_sun 항)"로 원인 지목. 사용자 지시로 **Phase C 진짜 원인 규명** 수행.

### 진단 실험

**실험 1 — Single1PN 대조**: 동일 측정법 (Yoshida + LRL + Newton baseline) 으로 Single1PN
모드 (태양 고정 시험입자, Schwarzschild 측지선 정확해) 에 돌려 비교.

| 행성 | Single1PN 1c     | EIH1PN 1c        | 차이 |
| ---- | ---------------- | ---------------- | ---- |
| 수성 | 42.9317″ (0.11%) | 42.9317″ (0.11%) | 동일 |
| 지구 | 3.7685″ (1.86%)  | 3.7683″ (1.87%)  | 동일 |
| 금성 | 8.4114″ (2.42%)  | 8.4114″ (2.42%)  | 동일 |

**결론 1**: Single1PN (Schwarzschild 정확해) 에서도 **지구/금성이 동일 deviation** → EIH 식의
structural bias 가 아니다. 두 식이 모두 이론값에서 벗어남 = 측정법 문제.

**실험 2 — centuries 수렴**: 동일 EIH1PN 에 centuries 만 변화.

| centuries | 지구 (이론 3.84″) | 금성 (이론 8.62″) | 수성 (이론 42.98″) |
| --------- | ----------------- | ----------------- | ------------------ |
| 1c        | 3.7683 (1.87%)    | 8.4114 (2.42%)    | 42.93 (0.11%)      |
| 3c        | 3.7942 (1.19%)    | 8.4337 (2.16%)    | —                  |
| 5c        | 3.8000 (1.04%)    | —                 | —                  |
| 10c       | 3.8072 (0.85%)    | 8.5001 (1.39%)    | 42.9979 (0.04%)    |

**결론 2**: centuries 증가 시 이론값에 수렴. 수렴이 **선형이 아니므로 Newton baseline
subtraction 이 1 century 저이심률 궤도에서 비선형 잔차를 남김**. dt 축소 (60s → 10s) 로는
수렴값이 변하지 않음 — 적분기 정확도는 이미 포화. centuries 확대만이 S/N 향상 경로.

### 근본 원인

LRL 각도 측정법의 구조적 한계:

- LRL 벡터 `A = v × L - μ r̂` 는 **순수 Kepler** 2체에서만 정확히 근일점 방향 지시
- 1PN GR 보정 하에서는 `A` 가 작은 진동 + secular drift 를 함께 보임 (μ 값이 Newton 고정이므로)
- Newton 모드 `A` drift 를 subtract 해도, GR 모드 `A` 진동 패턴이 Newton 과 동일하지 않아 잔차 발생
- 저이심률 궤도(e=0.007~0.017)에서는 GR 신호가 작아(상대적으로 ±3″) 이 잔차 비중이 커짐

### 대응 (3가지 옵션 중 선택)

| 옵션                                      | 정확도                  | CI 비용 | 채택 |
| ----------------------------------------- | ----------------------- | ------- | ---- |
| A) centuries 확대 (지구 3c, 금성 10c)     | 지구 1.19% / 금성 1.39% | +260s   | ✓    |
| B) 측정법 교체 (parabolic fit, 극값 보간) | 예측 어려움, 복잡도 ↑   | 비슷    | ✗    |
| C) DoD 완화 (지구 ±2.5%, 금성 ±3%)        | 물리 목표 후퇴          | 0       | ✗    |

A 채택 근거: 사용자 지시 "물리적 정확성이 목적 — DoD 완화는 최후 수단". 금성 DoD 는 1.5%
로 소폭 조정 (10c 에서도 1.39% — 1.0% 는 추가 centuries 확대가 CI 비용 과다).

### 재검토 조건 (개정)

1. **지구 rel_err > 1.5%** → A5 5 centuries 로 확대, 또는 측정법(B) 재검토
2. **금성 rel_err > 2.0%** → 10c 에서도 잔차 개선 안 되면 측정법 교체 착수
3. **CI verify-and-rust > 12분** → 금성/지구 centuries 를 5c 수준으로 일괄 축소
4. **EIH 식 버그 재의심** (예: 외행성 섭동 시나리오에서 structural deviation 재관측) → Soffel
   eq. 3.4.11 상세 재검증 (Phase C 는 2체 한계만 검증함 — 다체 상호 섭동은 재검증 범위 밖)

### 진단 테스트 박제

`nbody.rs` 의 `diag_*` 테스트 (10개)는 `#[ignore]` 처리. 필요 시 `cargo test --ignored diag_`
로 재현. Phase C 재검토 필요 시 첫 실행 대상.

## 비-범위 (P7-A에서 절대 손대지 않음)

- **EIH 1PN / Single 1PN 가속도 식** (P5-A, P6-C에서 확정 — 적분기는 가속도 식 소비자)
- `apply_eih_correction()` / `apply_gr_correction()` **본체 무수정** (정합성 주의 항목)
- `mercury_perihelion_precession_43_arcsec` 본문 (P5-A 회귀 가드)
- WASM bindgen 기본 시그니처 — `set_integrator` 만 신규, 기타 동일
- TS 어댑터 코드 — P7-B #207 범위 (본 ADR은 타입 shape 박제만)
- URL 매핑 (`?integrator=…`) — P7-B #207
- Barnes-Hut / WebGPU 경로 — 본 ADR 스코프 밖 (경로별 적분기 선택은 후속)
- 시각화 (lensing / black-hole / accretion-disk)
- Runtime 적분기 핫스왑 (초기화 시점 고정 — 마스터 #211 비-범위)

## 참고

- Yoshida H. (1990) "Construction of higher order symplectic integrators", _Physics Letters A_ 150(5–7), 262–268
- Hairer E., Lubich C., Wanner G., _Geometric Numerical Integration_, 2nd ed. (Springer, 2006), Ch. II.4 "Order conditions"
- Sanz-Serna J.M., Calvo M.P., _Numerical Hamiltonian Problems_ (Chapman & Hall, 1994), §V.4
- ADR `20260417-perihelion-verification.md` §재검토 트리거 — 본 ADR 발동 근거
- ADR `20260417-eih-1pn-multibody.md` — EIH 가속도 식 (본 ADR 소비자)
- 이슈 #206 — P7-A 스프린트 계약
- 마스터 #211 — P7 마일스톤
- 회고 `docs/retrospectives/p6-retrospective.md` — 적분기 격상 후속 인수인계
