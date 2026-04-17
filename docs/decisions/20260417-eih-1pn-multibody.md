# ADR: EIH 1PN 다체 — N×N 행성 간 1PN 가속도

- 일자: 2026-04-17
- 상태: Accepted
- 관련: P6-C #191, P5-A #178 (선행), 마스터 #188

## 배경

P5-A에서는 "태양 1개 + 시험입자 N-1개" 근사로 1PN 보정을 구현했다.
수성 근일점 41.46″/century를 ±5%로 재현해 DoD를 통과했지만, 식 자체가 시험입자 한계라

- 행성 사이의 GR 상호작용이 누락된다.
- 금성·지구의 (작지만 측정 가능한) GR 세차를 정확히 재현할 수 없다.

P6-C는 P5-A 식을 다체(EIH, Einstein-Infeld-Hoffmann) 1PN으로 확장한다.
"모든 쌍" 1PN 가속도를 합산하여 N=9(태양+8행성) 시나리오에서 100년 적분 시
이심률 drift < 1e-6/orbit을 만족시킨다.

## 후보

### 1. GR 모드 표현

| 항목      | A: bool 2개 (`enable_gr` + `enable_eih`) | B: GrMode enum (Off / Single1PN / EIH1PN) |
| --------- | ---------------------------------------- | ----------------------------------------- |
| 모순 차단 | 둘 다 true 가능 (정의 미정)              | 컴파일 시 단일 모드 강제                  |
| 호환성    | `set_gr(bool)` 그대로                    | `set_gr(bool)` → enum wrapper 필요        |
| 확장성    | 2PN 추가 시 bool 3개로 비대화            | enum variant 추가만                       |

### 2. EIH 식 위치

| 항목   | A: 신규 모듈 `gr.rs`         | B: `nbody.rs` 인라인 (P5-A 패턴 유지)   |
| ------ | ---------------------------- | --------------------------------------- |
| 응집도 | GR 항만 모듈 — Newton과 분리 | Newton + GR 인접 — 적분기 컨텍스트 일체 |
| 일관성 | 새 컨벤션 시작               | 기존 P5-A 패턴 그대로                   |
| 비용   | 모듈 분할 + import 작업      | 함수 추가만                             |

### 3. EIH 식 표기

| 항목        | A: Lagrangian/Hamiltonian → 미분 | B: 직접 가속도 (Will eq. 6.80, harmonic gauge) |
| ----------- | -------------------------------- | ---------------------------------------------- |
| 적분기 적합 | 미분 한 번 더 필요               | 가속도 그대로 → Velocity-Verlet 직결           |
| 가독성      | 추상적                           | 변수명 직관 (r_ij, v_i, a_j 등)                |
| 검증        | 어려움                           | Will/MTW 식과 1:1 대조                         |

### 4. URL 호환성

| 항목              | A: `?gr=1` 그대로 + 신규 | B: `?gr=1` 폐지, `?gr=1pn` 강제 |
| ----------------- | ------------------------ | ------------------------------- |
| P5-A 사용자 보호  | 동작                     | 깨짐                            |
| 표기 일관성       | 별칭 다중                | 단일                            |
| 마이그레이션 비용 | 없음                     | 사용자 알림 + 6개월             |

### 5. 테스트 계층

| 항목              | A: drift만 측정 | B: 3계층 (2체 동치 / 9체 drift / 수성 회귀) |
| ----------------- | --------------- | ------------------------------------------- |
| 식 오류 조기 발견 | 어려움          | 2체 동치에서 즉시 발견                      |
| 회귀 보호         | 없음            | 수성 41″ 가드 보존                          |
| 다체 효과 검증    | 부분            | 9체 drift로 종합 확인                       |

## 결정

**모두 B 계열 채택** — architect 사전 박제(이슈 #191 코멘트) 그대로 따른다.

1. **GrMode enum 3값** (`Off=0` / `Single1PN=1` / `EIH1PN=2`)
   - `NBodySystem.enable_gr: bool` → `gr_mode: GrMode` 교체
   - WASM `set_gr_mode(u8)` 신규 + `set_gr(bool)` 호환 wrapper 보존 (true→Single1PN, false→Off)
2. **EIH 식 위치 — `nbody.rs` 인라인** — P5-A 패턴 유지 (응집도·일관성 우위)
3. **EIH 직접 가속도 표기 — Will eq. 6.80 (harmonic gauge)** — Velocity-Verlet 직결
4. **URL 호환성 — `?gr=1`(기존) + `?gr=1pn`(별칭) + `?gr=eih`(신규)** — P5-A 사용자 보호
5. **테스트 3계층** — C1 2체 동치 + C2 9체 100년 drift + 수성 회귀 가드

## 인터페이스

### Rust

```rust
#[repr(u8)]
#[derive(Copy, Clone, PartialEq, Debug)]
pub enum GrMode {
    Off = 0,
    Single1PN = 1,
    EIH1PN = 2,
}

pub struct NBodySystem {
    pub masses: Vec<f64>,
    pub pos: Vec<f64>,
    pub vel: Vec<f64>,
    acc: Vec<f64>,
    pub gr_mode: GrMode,
}
```

### WASM bindgen

```rust
impl NBodyEngine {
    /// 0=Off, 1=Single1PN, 2=EIH1PN. invalid → Off + console.warn (TS 측에서 처리).
    pub fn set_gr_mode(&mut self, mode: u8);
    pub fn gr_mode(&self) -> u8;

    /// 호환 wrapper. true → Single1PN, false → Off. P5-A 외부 호출 보호.
    pub fn set_gr(&mut self, enable: bool);
    pub fn gr_enabled(&self) -> bool;
}
```

### TypeScript

```ts
export type GrMode = 'off' | 'single-1pn' | 'eih';

export interface NBodyEngineOptions {
  maxSubstepSeconds?: number;
  /** P6-C #191 — GR 모드. 미지정/false → off, true → 'single-1pn' (호환). */
  grMode?: GrMode;
  /** @deprecated P6-C부터 grMode 사용 권장. true → 'single-1pn'으로 매핑. */
  enableGR?: boolean;
}
```

### URL 매핑

| 입력      | 결정 모드  | 비고             |
| --------- | ---------- | ---------------- |
| `?gr=1`   | Single1PN  | P5-A 호환        |
| `?gr=1pn` | Single1PN  | 권장 표기 (별칭) |
| `?gr=eih` | EIH1PN     | P6-C 신규        |
| `?gr=off` | Off        | 명시적 비활성    |
| (미지정)  | Off        | 기본값           |
| 그 외     | Off + warn | 알 수 없는 값    |

## EIH 가속도 식 (Will eq. 6.80, harmonic gauge)

표준 다체 1PN 가속도 (각 body i 에 대해):

```
a_i = a_i^Newton
    + (1/c²) Σ_{j≠i} (G m_j / r_ij³) {
        [ A_ij ] (x_i - x_j)
        + [ B_ij ] (v_i - v_j)
      }
    + (1/c²) Σ_{j≠i} (7/2) (G m_j / r_ij) a_j^Newton
```

여기서

```
A_ij = -v_i² - 2 v_j² + 4 (v_i · v_j) + (3/2) ((x_i - x_j)·v_j / r_ij)²
       + 5 (G m_i / r_ij) + 4 (G m_j / r_ij)
       + Σ_{k≠i} (G m_k / r_ik) [ 4 - ... ]   // 외부 위치에너지 항
       + Σ_{k≠j} (G m_k / r_jk) [ 1 - ... ]   // 외부 위치에너지 항
       (정확한 계수는 Will eq. 6.80 또는 MTW §39.10 참조 — 코드 인라인 주석에 박제)

B_ij = (x_i - x_j) · (4 v_i - 3 v_j)
```

마지막 항 `(7/2) (G m_j / r_ij) a_j^Newton` 은 "간접 가속도" 항으로,
body j 가 받는 Newton 가속도가 body i 의 1PN 보정에 기여한다.

전체 식은 본 ADR 본문보다 코드 인라인 주석에 정확 박제한다 (`apply_eih_correction()` doc-comment).
출처: Will C.M., _Theory and Experiment in Gravitational Physics_ (2nd ed.), eq. 6.80;
MTW _Gravitation_, §39.10.

## 단위 / 적분기

P5-A ADR 그대로 계승:

- SI 단위 (`SPEED_OF_LIGHT = 299_792_458.0`, `C2 = SPEED_OF_LIGHT²`)
- Velocity-Verlet (2차 심플렉틱) 적분기
- f64 전체 사용

## 테스트 계획 (DoD 매핑)

| DoD | 테스트                                           | 통과 기준                                          |
| --- | ------------------------------------------------ | -------------------------------------------------- |
| C1  | `eih_2body_reduces_to_single_1pn`                | 2체 EIH 가속도 == P5 single 1PN 가속도, rel < 1e-6 |
| C1  | (회귀) `mercury_perihelion_precession_43_arcsec` | Single 모드, 41~46″/century 그대로 보존            |
| C1  | (보너스) `mercury_perihelion_precession_eih`     | EIH 모드, 41~46″/century (P5-A 결과와 ±5% 이내)    |
| C2  | `eih_9body_100yr_eccentricity_drift`             | 행성별 (e_final - e_initial) / orbits < 1e-6       |
| C3  | URL 매핑 통합                                    | `?gr=1`, `?gr=1pn`, `?gr=eih`, `?gr=off`, invalid  |

## 결과 / 재검토 조건

### 실측 결과 (P6-C 구현 시점)

- C1 (EIH 2체 한계): rel_err `< 1e-6` (실측 ~1e-15 수준 — 시험입자 한계에서 식 동치)
- C2 (9체 100년 drift, ≥10궤도 행성): max `8.4e-7 / orbit` (수성 3.1e-8, 금성 2.8e-7, 지구 7.8e-8, 화성 8.4e-7) — DoD `< 1e-6` 충족
- 수성 회귀 가드 (Single 모드, dt=60s): 41~46″/century (P5-A 41.46″ 재현)
- EIH 모드 수성 세차 (보너스): 41~46″/century 충족

### 측정 가능성 한계 (DoD C2 적용 범위)

- 외행성(목성·토성·천왕성·해왕성)은 100년 적분에서 1궤도 미만~수 궤도 — 이심률의 secular drift 정의가 약하다
- (e_final - e_initial) 은 위상 진동을 secular drift로 잘못 보고할 수 있다
- 따라서 DoD C2 임계 `< 1e-6 / orbit` 은 **≥10 궤도** 를 도는 행성(수성·금성·지구·화성) 한정으로 적용
- 외행성 secular 안정성 검증이 필요해지면 적분 기간 1000년+ 로 확장 (재검토 조건)
- 적분기 정밀도: dt=1hour 사용 (1day로는 수성 8e-6/orbit 관측 — `max_dt` 1차 폴백 발동)

### OK 조건

- C1, C2 모두 통과 → 본 ADR Accepted 상태 유지
- 수성 회귀 가드 (Single 모드 41.46″) 변동 없음

### 재검토 조건

- C2 미달 (내행성 drift > 1e-6/orbit) → 두 단계 폴백
  - 1차: `step_chunked` `max_dt` 추가 축소 (현재 1hour → 10min)
  - 2차: Yoshida 4차 심플렉틱 적분기 격상 (P5-A ADR §재검토 조건과 동일 트리거)
- 외행성 secular 안정성 요구 → 적분 기간 1000년+ + 행성별 평균 anomaly drift 측정으로 변경
- 다중 BH 또는 강한 GR 영역 시나리오 → EIH 2PN 또는 Schwarzschild geodesic 검토
- GPU 경로 GR 지원 요구 → 별도 ADR (WGSL f32 정밀도 분석 필요)
- `?gr=1` 별칭 사용량 0 확인 (텔레메트리/사용자 피드백 6개월) → P7에서 deprecation

## 비-범위 (P6-C에서 절대 손대지 않음)

- 2PN, Kerr (회전), 2.5PN gravitational radiation
- `geodesic.rs` (P6-A), `barnes_hut/`, GPU 경로 (`webgpu-nbody-engine.ts`, WGSL)
- 시각화: `gravitational-lensing.ts`, `accretion-disk*` PostProcess, `black-hole-rendering.ts`
- 기존 `mercury_perihelion_precession_43_arcsec` 테스트 본문 수정 (회귀 가드)
- Kepler 엔진, 소행성대 코드
- E2E Playwright (`?gr=eih`) — P6-D 책임
- 적분기 변경 (Velocity-Verlet 유지)
