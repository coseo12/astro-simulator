# ADR: P9 — 목성계 Galilean + Laplace 공명 + 고리 3층 + Osculating 동기화

- **상태**: Accepted
- **날짜**: 2026-04-20
- **결정자**: architect (P9 #254)
- **관련**: P9 #254 (본 마일스톤), P8 ADR `20260419-satellite-orbit-hybrid.md` (하이브리드 패턴 계승 + Osculating P9 흡수 박제), P7 ADR `20260418-p7-integrator-upgrade.md` (Yoshida 4차 — 본 ADR 장기 적분 기반), P6-D ADR `20260417-perihelion-verification.md` / P6-C ADR `20260417-eih-1pn-multibody.md`, 선행 이슈 #247 (Osculating 동기화, P9 흡수), 로드맵 v2 MEMORY `project_p8_p16_roadmap.md`

## 배경

P9 (#254) 는 P8 (내행성계 위성) 직후 태양계 공전행성 위성 계층을 **목성계로 확장**하는 마일스톤이다. PM 스프린트 계약(라운드 1/2 + Gemini 교차검증, 2026-04-20) 으로 확정된 8 DoD + 4 PR 분할이 본 ADR 의 전제 입력이다. 본 ADR 은 구현 직전의 **설계 세부 5개 결정**을 박제한다 — 스프린트 범위·DoD 수치 는 PM 단계에서 이미 확정되어 본 ADR 범위 밖.

### PM 확정 입력 (재진술 금지, 요약만)

- 사용자 답변: **Q1=a (#247 P9 흡수), Q2=c (shader 고리), Q3=c (이심률·경사 UI), Q4=b (4 PR 분할), Q5=b (Laplace ±1%)**
- 교차검증 반영: **M1 위상 진폭 ±2° DoD 신규 / M2 5체 N-body 상호 섭동 명시 / M3 비-범위 3항 추가**
- 타임박스 7~10 영업일, 정확도 Galilean 주기 ±1% / Laplace 잔차 ±1% / 위상 진폭 ±2°

### 본 ADR 에서 결정해야 할 5가지 (설계 세부)

1. **N-body 적분 그룹 경계** — Jupiter+4 Galilean 만 vs 태양계 전체 vs hybrid
2. **고리 shader 밀도 표현** — `densityProfile[]` 배열 상수 vs LUT texture vs 분기문
3. **Osculating 변환 특이점 처리** — `e<1e-6` early return vs Equinoctial 원소 우회 vs RK 안정화
4. **PR-2.5 고리 분리 필요성** — 독립 PR vs PR-3 통합 (Q4=b 재확인 근거)
5. **위상 진폭 측정 방식** — peak-to-peak vs RMS vs FFT

### 기존 자산 (재사용 대상 — 실측 확인)

- **Rust N-body 인프라** (`packages/physics-wasm/src/nbody.rs`) — `NBodySystem` + EIH/Single1PN/Off 모드 + P8 `measure_moon_orbital_period` / `measure_node_regression_period` 헬퍼
- **Yoshida 4차 적분기** (`integrator.rs`) — 심플렉틱 장기 안정성 (P7-A)
- **TS Kepler 렌더 경로** (`packages/core/src/scene/solar-system-scene.ts`) — `parentId` 체인 `updateAtKepler` (변경 없음 — P8 ADR 계승)
- **solar-system.json 스키마** (`packages/core/src/ephemeris/solar-system-loader.ts`) — zod 검증, `parentId` 지원. **`rings` 필드 부재** → 본 ADR 에서 스키마 확장
- **씬 디렉토리** `packages/core/src/scene/` — `asteroid-belt.ts` / `gravitational-lensing.ts` / `black-hole-rendering.ts` 등 존재. 궤도링 전용 shader 는 **부재** → 신규 `ring-shader.ts`

### 경로 정정 (계약서 vs 실측)

계약서의 `apps/web/src/scenes/rings/RingShaderMaterial.ts` 및 `apps/web/src/data/solar-system.schema.ts` 는 실재하지 않는다. 실제 레이아웃은:

- **씬**: `packages/core/src/scene/` 이 씬 모듈 anchor. 렌더 shader 는 **core 패키지** 에 두는 게 기존 패턴. → `packages/core/src/scene/ring-shader.ts` 로 박제
- **스키마**: `packages/core/src/ephemeris/solar-system-loader.ts` 가 zod 스키마 + 로딩 담당 (단일 파일). → 본 파일 내부에 `rings` 섹션 확장

## 후보 비교

### 1. N-body 적분 그룹 경계 (D1~D5 Rust 테스트 범위)

| 축 / 후보                  | (a) Jupiter + 4 Galilean (5체)                                          | (b) 태양계 전체 (14체 이상)                                       | (c) Hybrid — Sun + Jupiter + 4 (6체)                  |
| -------------------------- | ----------------------------------------------------------------------- | ----------------------------------------------------------------- | ----------------------------------------------------- |
| **물리 정합성**            | ⭐ Galilean 상호 섭동 전부 포함. 외부 영향은 DoD ±1% 수준에서 무시 가능 | ⭐⭐ 이상적 완전성. 목성 궤도운동 자체도 포함                     | ⭐ 태양의 tidal pull 포함 (목성 근/원일 차이)         |
| **CI 비용**                | ⭐ step 당 5² = 25회 가속도 합                                          | ✗ 14² = 196회, Yoshida 3-stage × 100 Io 주기 = 분 단위            | △ 6² = 36회 (중간)                                    |
| **D5-a 잔차 기대치**       | 상호 섭동으로 Laplace 공명 0.01 이하 달성 예상 (물리 실증)              | 외행성 섭동 효과는 Galilean 에 <1e-4 수준 — 잔차 개선 없음        | 태양 tidal 은 Galilean 에 <1e-3 — 역시 관측 차이 미미 |
| **측정법 해석 용이성**     | ⭐ Jupiter-centric 좌표 변환이 즉각 (Jupiter 고정 근사 가능)            | ✗ 태양계 barycentric — Jupiter 위치 시변 → 좌표 변환 매 step 필수 | △ Jupiter 공전 포함, 좌표 변환 필수                   |
| **초기 조건 fixture 부담** | ⭐ 4 Galilean + Jupiter 5엔티티 상태 벡터                               | ✗ 14 엔티티 + 외행성 정밀도 요구                                  | △ 6 엔티티                                            |
| **장기 적분 에너지 drift** | ⭐ 5체 symplectic 에너지 bounded                                        | ⭐⭐ 동일                                                         | ⭐ 동일                                               |

**결정**: **(a) Jupiter + 4 Galilean 5체** 채택.

근거: (1) DoD 공차 ±1% 에서 외부 섭동 기여 < 1e-3 (Laplace 1979 이론값, Lainey 2009 정밀도 대비). (2) CI 비용이 주기당 25/196 = **1/8 수준** — 100 Io 주기(177일) Yoshida 4차 dt=60s 기준 약 25만 step, 5체는 예산 내. (3) Jupiter-centric 좌표가 측정법(평균경도 λ 추출)에서 자연스러움. (b)/(c) 는 외부 섭동을 포함하려다 측정 노이즈만 증가시킴 (volt #32 측정법 검증 우선 교훈).

### 2. 고리 shader 방사밀도 표현 (D6)

| 축 / 후보                          | (a) `densityProfile: [r, d]` 배열 상수 (uniform)     | (b) LUT texture (1D texture, 256px)                      | (c) fragment shader 분기문 `if (r < r1) ... else if ...` |
| ---------------------------------- | ---------------------------------------------------- | -------------------------------------------------------- | -------------------------------------------------------- |
| **shader 복잡도**                  | ⭐ uniform 배열 + 선형 보간                          | △ texture sampling 필요 (mipmap 고려)                    | ⭐ if-else 3분기                                         |
| **P10 토성 확장성**                | ⭐ Cassini 간극 등 급변 구조는 배열 길이만 늘리면 됨 | ⭐⭐ Cassini 간극·F 링 등 정밀 구조를 LUT 에 그대로 박제 | ✗ 분기 수 폭증, shader 가독성 붕괴                       |
| **파라미터 인터페이스**            | JSON `densityProfile[]` 직접 전달, bindgen 부담 없음 | JSON → Float32Array 변환 + GPU 업로드 필요               | JSON `innerRadius`/`outerRadius` × N 구조체              |
| **런타임 비용**                    | per-fragment 선형 보간 O(log N)                      | per-fragment texture fetch                               | per-fragment 분기 (GPU 분기 페널티)                      |
| **디버깅 용이성**                  | ⭐ JSON 값 변경 → 즉시 반영                          | △ LUT 재생성 파이프라인 필요                             | ⭐ 분기 식 직접 수정                                     |
| **M1 백업 (InstancedMesh) 호환성** | ⭐ 동일 배열을 입자 밀도로 변환 가능                 | △ texture → CPU 읽기 왕복                                | ✗ 분기 식은 InstancedMesh 와 매핑 불일치                 |

**결정**: **(a) `densityProfile: [r_normalized, density]` 배열 상수 (uniform) + fragment shader 선형 보간** 채택.

근거: (1) P10 토성 Cassini 간극·F 링은 배열 길이만 늘려 표현 가능 — Q2=c "P10 재사용 전제" 에 정확히 부합. (2) LUT(b) 는 3층 goss 고리엔 과잉, 텍스처 업로드 파이프라인이 Osculating polling 과 경합할 위험. (3) 분기문(c) 은 확장성 제로. (4) **M1 백업**: shader 실패 시 `densityProfile` 을 그대로 InstancedMesh 입자 `position.random(r ∈ [r_i, r_{i+1}] with prob ∝ d_i)` 로 변환 — 즉시 전환 가능.

배열 형식: `[[r0, d0], [r1, d1], ..., [rN, dN]]` 단, `r_i` 는 `(r_inner + r_outer) / 2` 에 대해 정규화된 [0, 1] 구간 값. `d_i` 는 0~1 density. Halo/Main/Gossamer 세 층은 **각각 독립 shader instance** (3개의 disk mesh) — 층간 alpha blending 은 three.js 기본 transparent 처리.

### 3. Osculating 변환 특이점 처리 (D7)

| 축 / 후보                    | (a) `e < 1e-6` early return (기본 Kepler 원소)                                                  | (b) Equinoctial 원소 (h, k, p, q) 우회      | (c) Runge-Kutta 안정화 (해석해 대신 반복 수치) |
| ---------------------------- | ----------------------------------------------------------------------------------------------- | ------------------------------------------- | ---------------------------------------------- |
| **알고리즘 복잡도**          | ⭐ 고전 공식 + `if` 1줄 가드                                                                    | △ Kepler ↔ Equinoctial 변환 신규 (코드 +60) | ✗ 반복 루프 + 수렴 판정                        |
| **Galilean 실제 이심률**     | Io e=0.0041 / Europa 0.009 / Ganymede 0.0013 — 모두 `e > 1e-6`, 특이점 미발생                   | 필요 없음 (Galilean 은 특이점 안 밟음)      | 필요 없음                                      |
| **원순환 (e→0) 안전성**      | `e<1e-6` 에서 `ω`, `M` 은 정의 불가 — 둘을 합친 `λ` 만 유효. early return 시 `ω=0, M=λ` 로 표시 | ⭐ 수학적으로 continuous, 원순환도 정상     | ⭐ 마찬가지                                    |
| **경사 특이점 (i→0)**        | `Ω` 정의 불가 — 유사 early return 필요                                                          | ⭐ 자연스럽게 처리                          | ⭐ 마찬가지                                    |
| **P9 사용 케이스**           | Jupiter mass×2 인터랙션으로 e 가 일시 0 근접해도 극히 단기 — 시각 잠깐 hold 용납                | 오버엔지니어링                              | 오버엔지니어링                                 |
| **왕복 정확도 (DoD ≤1e-10)** | ⭐ 고전 공식 f64 정밀도                                                                         | ⭐ 동일                                     | △ 반복 횟수 튜닝 필요                          |

**결정**: **(a) early return 가드 (`e < 1e-6` 또는 `sin(i) < 1e-6`)** 채택.

근거: (1) Galilean 4체 실제 이심률은 모두 `> 1e-3` — 특이점 미발생. Jupiter mass 스윕 시에도 e 의 변동폭은 ±0.001 수준. (2) early return 시 UI 에서 "원순환 근사" 배지 1회 표기로 사용자 혼란 방지. (3) P10+ 확장 시점에 토성 위성 중 원순환 근접 후보(미마스 e=0.0196) 발견 시 재검토. (4) DoD 왕복 오차 1e-10 은 고전 공식으로 충분 — 반복 수치해는 오히려 오차 증가 위험.

### 4. PR-2.5 고리 분리 필요성 (Q4=b 재확인)

| 축 / 후보                              | (a) 독립 PR-2.5                                                                           | (b) PR-3 통합                                                   |
| -------------------------------------- | ----------------------------------------------------------------------------------------- | --------------------------------------------------------------- |
| **리뷰 범위**                          | ⭐ shader 전용 리뷰 — WebGL/Three.js 전문성 독립 판정                                     | ✗ TS 통합 + UI + shader 가 한 PR 에 뒤엉킴 (800 라인 이상 예상) |
| **M1 백업 전환 비용**                  | ⭐ PR-2.5 에서 shader 실패 시 InstancedMesh 로 전환 후 다음 PR 진행 — 독립 롤백           | ✗ shader 실패가 UI 구현 작업 전체 블록                          |
| **headless + 실 Chrome 검증 분리**     | ⭐ PR-2.5 단독 시각 검증 1회 (volt #33 준수)                                              | △ PR-3 에 포함되나 UI 검증과 섞임                               |
| **Phase 분리 릴리스 리듬 (CLAUDE.md)** | ⭐ backward-compat — PR-1/2 만 배포되어도 플레이스홀더 disk 작동. PR-2.5 는 shader 교체만 | △ shader + UI 동시 릴리스                                       |
| **의존성 그래프**                      | PR-1 JSON → PR-2 Rust → PR-2.5 shader ← → PR-3 TS (PR-2.5/PR-3 병렬 가능)                 | 직렬 체인                                                       |
| **CI 시간**                            | PR-2.5 pixel assertion 스크립트 추가                                                      | PR-3 에 통합                                                    |

**결정**: **(a) 독립 PR-2.5** 채택. Q4=b 사용자 결정과 CLAUDE.md §Phase 분리 릴리스 리듬 3조건 모두 충족:

- **backward-compat** — PR-1 플레이스홀더 disk 만 있어도 시스템 정상 (Jupiter 단색 disk 렌더)
- **완결 Behavior Change 집합** — PR-2.5 는 "고리 3층 shader 렌더" 단일 행동 변화
- **사용자 동의** — Q4=b 로 4 PR 분할 이미 승인

**병렬 가능 구간**: PR-2.5 와 PR-3 은 의존성 독립. PR-2 Rust 완료 후 두 PR 동시 착수 가능. 단 PR-3 은 PR-2.5 shader 완료를 선호 (시각적 QA 한 번에).

### 5. 위상 진폭 측정 방식 (D5-b)

| 축 / 후보                 | (a) peak-to-peak / 2                                          | (b) RMS (root-mean-square)                         | (c) FFT 주파수 분해                               |
| ------------------------- | ------------------------------------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| **측정 단순성**           | ⭐ max(φ) − min(φ) 스캔 1회                                   | ⭐ Σ(φ²)/N 스칼라                                  | ✗ FFT 라이브러리 의존 (Rust `rustfft` crate 도입) |
| **노이즈 민감도**         | ✗ 1회 outlier 로 진폭 과대 평가                               | ⭐ 평균화로 outlier 완화                           | ⭐⭐ 주파수 대역 분리로 noise floor 식별          |
| **DoD ±2° 해석**          | ⭐ "최대 이탈 각도" 물리 직관 — 사용자 기대와 일치            | △ RMS 2° ≈ peak-to-peak 2.8° (√2 환산) — 해석 혼동 | ⭐⭐ 공명 주파수 성분만 분리 가능                 |
| **100 Io 주기 적분 특성** | Laplace 주기는 Io 궤도 주기 비율로 느리게 변동 — peak 이 뚜렷 | ⭐ 평균화 적절                                     | ⭐⭐ 장기 trend vs 진동 분리                      |
| **WASM 바이너리 증분**    | ⭐ 스칼라 2개 (min/max)                                       | ⭐ 동일                                            | ✗ FFT crate = +5~10 KB                            |
| **구현 + 디버깅 비용**    | ⭐ 10 LOC                                                     | ⭐ 10 LOC                                          | △ crate import + window 함수 튜닝                 |

**결정**: **(a) peak-to-peak / 2** 채택 (기본), 실패 시 (c) FFT 로 재검토.

근거: (1) DoD "±2°" 의 사용자 기대가 "최대 이탈 각도" — peak-to-peak / 2 가 자연 매핑. (2) Galilean Laplace 공명은 Io 주기(1.77d) 와 영속 공명(secular phase lock) 의 합 — **100 Io 주기 = 177일** 에서 peak 명확 관찰됨 (Lainey 2009). (3) outlier 완화는 적분 초기 **1 Io 주기(첫 1.77일) burn-in 스킵** 으로 해결. (4) RMS(b) 는 ±2° 해석 혼동 비용이 이득보다 큼. FFT(c) 는 WASM 크기 증분 + crate 도입이 비-범위 침범 — 재검토 트리거로만 박제.

**보조 기록**: peak-to-peak 외에 **참고 수치** 로 `φ(t) 시계열 표준편차` 를 Rust 반환값에 포함해 디버깅 시 RMS ≈ std·√2 상호 확인. DoD 판정은 peak-to-peak / 2 만 사용.

## 결정 (요약)

| #   | 결정                   | 선택                                               | 반려                                   |
| --- | ---------------------- | -------------------------------------------------- | -------------------------------------- |
| 1   | N-body 적분 그룹       | **(a) Jupiter + 4 Galilean 5체**                   | (b) 태양계 전체, (c) Sun + Jupiter + 4 |
| 2   | 고리 shader 밀도 표현  | **(a) `densityProfile[]` 배열 + 선형 보간**        | (b) LUT texture, (c) 분기문            |
| 3   | Osculating 특이점 처리 | **(a) `e<1e-6` / `sin(i)<1e-6` early return 가드** | (b) Equinoctial, (c) RK 안정화         |
| 4   | PR-2.5 고리 분리       | **(a) 독립 PR** — Q4=b 재확인                      | (b) PR-3 통합                          |
| 5   | 위상 진폭 측정         | **(a) peak-to-peak / 2**, 보조 std 기록            | (b) RMS, (c) FFT                       |

## 인터페이스 박제

### Rust — `packages/physics-wasm/src/satellites/` (신규 서브모듈)

파일 구조:

```
packages/physics-wasm/src/satellites/
├── mod.rs          # pub mod laplace; pub mod osculating;
├── laplace.rs      # 공명 + 주기 측정
└── osculating.rs   # 고전 Kepler 역변환
```

`lib.rs` 에서 `pub mod satellites;` 추가.

#### `laplace.rs` 핵심 시그니처

```rust
/// Galilean 4체 개별 공전주기 측정.
/// 반환: 초 (seconds). JPL 기준 Io 1.769 day / Europa 3.551 / Ganymede 7.155 / Callisto 16.689 day.
///
/// **적분 그룹**: Jupiter + Io + Europa + Ganymede + Callisto (5체 상호 섭동, ADR 결정 #1).
/// **측정법**: P8 `measure_moon_orbital_period` 계승 — 근점 통과 2회 간격 평균 (e > 0.001 전부 충족).
/// **적분기**: Yoshida 4차 심플렉틱 (P7-A), dt=60s 기본.
pub fn measure_galilean_period(satellite_name: &str) -> f64;

#[derive(Debug, Clone, Copy)]
pub struct LaplaceResult {
    /// D5-a 잔차: |n_Io − 3·n_Europa + 2·n_Ganymede| / n_Io (무차원, ≤ 0.01)
    pub residual: f64,
    /// D5-b 위상 진폭 (peak-to-peak / 2, 도 단위, ≤ 2.0)
    pub phase_amplitude_deg: f64,
    /// 디버그 보조: φ(t) 시계열 표준편차 (도 단위)
    pub phase_std_deg: f64,
}

/// Laplace 공명 측정 — 100 Io 주기 5체 적분 후 잔차·위상 진폭 반환.
///
/// **위상 진폭 측정** (ADR 결정 #5):
///   - φ(t) = λ_Io(t) − 3·λ_Europa(t) + 2·λ_Ganymede(t) (평균경도 라디안)
///   - 평균경도 λ = Ω + ω + M (Jupiter-centric osculating 추출)
///   - 첫 1 Io 주기(1.77d) burn-in 스킵 후 peak-to-peak / 2 계산
///   - 표준편차는 피크 검출 오류 시 sanity check 용
pub fn measure_laplace_resonance() -> LaplaceResult;
```

#### `osculating.rs` 핵심 시그니처

```rust
/// 고전 Kepler 6원소 (osculating). 모두 SI 단위 (m, rad).
#[derive(Debug, Clone, Copy)]
pub struct OscElements {
    pub semi_major_axis: f64,    // a (m)
    pub eccentricity: f64,       // e
    pub inclination: f64,        // i (rad)
    pub longitude_of_ascending_node: f64,  // Ω (rad, -π~π)
    pub argument_of_periapsis: f64,        // ω (rad, -π~π)
    pub mean_anomaly: f64,       // M (rad, -π~π)
    /// 특이점 플래그: `e<1e-6` 또는 `sin(i)<1e-6` 시 1 (ADR 결정 #3)
    /// UI 에서 "원순환 근사" 배지 표시용
    pub singularity: u8,
}

/// State vector → Osculating elements (Jupiter-centric 가정).
///
/// **ADR 결정 #3 (early return 가드)**:
///   - e < 1e-6 → `argument_of_periapsis=0`, `mean_anomaly=λ_true`, `singularity=1`
///   - sin(i) < 1e-6 → `longitude_of_ascending_node=0`, `argument_of_periapsis=ω_adj`, `singularity=1`
///
/// **왕복 오차 DoD**: `extract → to_state → extract` 원소 오차 ≤ 1e-10 (Galilean 실 e/i 범위).
pub fn extract_osculating_elements(
    pos_rel: [f64; 3],    // Jupiter-centric 위치 (m)
    vel_rel: [f64; 3],    // Jupiter-centric 속도 (m/s)
    mu_parent: f64,       // G·M_jupiter (SI)
) -> OscElements;
```

#### WASM bindgen export (`lib.rs` 추가)

```rust
// P9 #254 — Osculating 원소 추출 (Galilean 동적 동기화용).
// Float64Array 6개 원소 순서 박제: [a, e, i, Ω, ω, M]. 마지막 7번째는 singularity flag (0/1).
#[wasm_bindgen]
pub fn extract_osculating_elements(
    pos_x: f64, pos_y: f64, pos_z: f64,
    vel_x: f64, vel_y: f64, vel_z: f64,
    mu_parent: f64,
) -> Vec<f64>;  // length=7 flat (a, e, i, Ω, ω, M, singularity)
```

**WASM bridge 형식 결정**: `Float64Array` 7원소 flat 반환. `wasm_bindgen` 의 struct export(serde-wasm-bindgen) 대신 flat 배열 선택 — 1Hz polling × 4 Galilean 당 호출 시 직렬화/역직렬화 부담 최소화. TS 는 `[0..=5]` 를 원소, `[6]` 를 singularity flag 로 읽음.

### TS — `packages/core/src/scene/ring-shader.ts` (신규)

```ts
export interface RingShaderParams {
  innerRadius: number; // m
  outerRadius: number; // m
  /** [[r_normalized ∈ [0,1], density ∈ [0,1]], ...] — 배열 길이 N (Halo/Main/Gossamer 각 3~5 점) */
  densityProfile: Array<[number, number]>;
  /** RGB(a) tint. 기본 #887766 (Jupiter ring dust) */
  color?: [number, number, number];
  /** three.js Scene 추가용 mesh. ADR 결정 #2: 3 층은 각각 독립 RingMesh */
  createMesh(parent: THREE.Object3D): THREE.Mesh;
}

/**
 * 고리 fragment shader 기반 렌더.
 *
 * ADR 결정 #2: uniform `densityProfile` 배열 + fragment 선형 보간.
 *   fragment:
 *     float r_norm = (length(vUv.xy - 0.5) * 2.0 - r_inner) / (r_outer - r_inner);
 *     float d = interpLinear(densityProfile, r_norm);
 *     gl_FragColor = vec4(color * d, d);   // alpha = density
 *
 * **M1 백업 경로** (R1 완화): `?ring=fallback` URL 플래그 또는 shader 컴파일 실패 탐지 시
 * `InstancedMesh` 입자로 자동 전환. `densityProfile` 를 그대로 입자 density 로 사용.
 */
export function createRingShaderMaterial(params: RingShaderParams): THREE.ShaderMaterial;
```

### TS — `apps/web/src/hooks/use-osculating-sync.ts` (신규)

```ts
export interface OscSyncOptions {
  /** 기본 1Hz. fps<55 시 자동 강등 (ADR 결정 #3 단계 폴백). */
  pollIntervalMs?: number;
  /** false 설정 시 polling 비활성 (URL `?osc=off`). 기본 true. */
  enabled?: boolean;
}

export interface OscSyncResult {
  /** Galilean 4체 × OscElements (Jupiter-centric). null = 초기 로딩 */
  elements: Record<'io' | 'europa' | 'ganymede' | 'callisto', OscElements> | null;
  /** 현재 적용 polling 주기 (ms). fps 폴백 상태 관찰용 */
  currentIntervalMs: number;
}

/**
 * 1Hz Osculating polling 훅.
 *
 * ADR 결정 #3 (특이점 처리): `singularity===1` 원소는 UI 배지 표시 (원순환 근사).
 *
 * **fps 자동 폴백** (R2 완화):
 *   - 기본 1000ms (1Hz)
 *   - fps<55 관찰 시 → 500ms (2Hz) — 더 자주 측정하되 단일 호출 부담은 동일
 *   - 여전히 fps<50 → 200ms (5Hz)
 *   - 여전히 fps<45 → 100ms (10Hz)
 *   - fps 복귀 시 단계 복원 (히스테리시스 +5fps, 즉 55→60 복귀 시 역전)
 *   - fps 측정: `requestAnimationFrame` 델타 이동평균 (window=2s)
 */
export function useOsculatingSync(opts?: OscSyncOptions): OscSyncResult;
```

**주의**: 폴백이 "느려지는" 방향이 직관적이지만, 실제로는 **더 자주 측정해 polling 을 frame budget 에 분산** 시키는 방향이 유리 (1Hz 때 대량 batch 계산보다 10Hz 소량 계산이 per-frame 부담 적음). 단, 상한은 10Hz — 그 이상은 영향 있음. 재검토 트리거에 fps<45 10Hz 도달 빈도 명시.

### TS — `apps/web/src/components/panels/satellite-info-panel.tsx` (신규)

```tsx
export interface SatelliteInfoPanelProps {
  /** 표시 대상 — Galilean 4체 전체 또는 선택된 1체 */
  satellites: Array<'io' | 'europa' | 'ganymede' | 'callisto'>;
  /** `useOsculatingSync` 결과 — 없으면 JSON 정적 값 폴백 */
  oscElements?: OscSyncResult['elements'];
}

/**
 * Galilean 이심률·경사 표시 패널 (D8).
 *
 * 데이터 바인딩:
 *   - 1차: `oscElements` (동적) — 있으면 사용, 없으면
 *   - 2차: `solar-system.json` (정적) — 기본값
 *
 * **#246 경계**: 본 컴포넌트는 **정보 표시만**. 클릭/ARIA/ESC 흐름은 #246 범위 (별도 PR).
 *
 * 표시 포맷:
 *   Io     e=0.0041  i=0.036°  [원순환 근사 배지 if singularity===1]
 *   Europa e=0.009   i=0.466°
 *   ...
 */
export function SatelliteInfoPanel(props: SatelliteInfoPanelProps): JSX.Element;
```

### JSON 스키마 확장 (`solar-system.json`)

**Galilean 엔티티 (4체, `parentId=jupiter`)**:

```json
{
  "id": "io",
  "kind": "moon",
  "nameKo": "이오",
  "nameEn": "Io",
  "mass": 8.9319e22,
  "radius": 1.8216e6,
  "parentId": "jupiter",
  "$comment": "JPL Horizons 2026-01-01 평균 궤도 요소 (Jupiter-centric, Laplace plane 기준).",
  "colorHint": { "hex": "#F2D35C" },
  "orbit": {
    "semiMajorAxisAU": 2.821e-3,
    "eccentricity": 0.0041,
    "inclinationDeg": 0.036,
    "longitudeOfAscendingNodeDeg": 43.977,
    "longitudeOfPerihelionDeg": 84.129,
    "meanLongitudeDeg": 171.016
  }
}
```

Europa / Ganymede / Callisto 동일 패턴 (수치는 PR-1 에서 JPL 실값 박제).

**Jupiter.rings 확장** — 기존 Jupiter 엔티티에 필드 추가:

```json
{
  "id": "jupiter",
  ...기존 필드...,
  "rings": [
    {
      "id": "halo",
      "innerRadiusKm": 92000,
      "outerRadiusKm": 122500,
      "densityProfile": [[0.0, 0.3], [0.5, 0.5], [1.0, 0.2]]
    },
    {
      "id": "main",
      "innerRadiusKm": 122500,
      "outerRadiusKm": 129000,
      "densityProfile": [[0.0, 0.8], [0.3, 1.0], [1.0, 0.9]]
    },
    {
      "id": "gossamer",
      "innerRadiusKm": 129000,
      "outerRadiusKm": 226000,
      "densityProfile": [[0.0, 0.15], [0.4, 0.1], [1.0, 0.02]]
    }
  ]
}
```

**zod 스키마 확장** (`solar-system-loader.ts`):

```ts
const RingLayerRawSchema = z.object({
  id: z.string().min(1),
  innerRadiusKm: z.number().positive(),
  outerRadiusKm: z.number().positive(),
  densityProfile: z.array(z.tuple([z.number().min(0).max(1), z.number().min(0).max(1)])).min(2),
});

const CelestialBodyRawSchema = z.object({
  ...,
  rings: z.array(RingLayerRawSchema).optional(),  // 목성·토성+ 전용
});
```

### PR 분할 의존성 그래프 (Q4=b 재확인)

```
PR-1 (infra + JSON + placeholder)
  ├─ solar-system.json Galilean 4체 + Jupiter.rings 추가
  ├─ zod 스키마 rings 확장
  └─ 플레이스홀더 단색 disk (Three.js CircleGeometry)

  ↓ blocks

PR-2 (Rust 물리 + 단위테스트)  ← JSON 없이는 초기 조건 fixture 불가
  ├─ packages/physics-wasm/src/satellites/{laplace,osculating}.rs
  ├─ WASM bindgen `extract_osculating_elements` export
  └─ fixtures/galilean-states.json (JPL Horizons)

  ↓ unblocks (parallel)

PR-2.5 (shader 교체)     PR-3 (TS 통합 + UI + 회고)
  ├─ ring-shader.ts        ├─ use-osculating-sync.ts
  ├─ pixel assertion       ├─ satellite-info-panel.tsx
  └─ M1 백업 경로          ├─ DOM 스냅샷 테스트
                           ├─ CHANGELOG v0.9.0 + Behavior Changes
                           └─ retrospective + tag + release
```

**병렬 가능**: PR-2 완료 후 PR-2.5 와 PR-3 동시 착수 가능. 단 PR-3 머지는 PR-2.5 이후 권장 (시각 QA 통합).

## 위험 완화 설계 스케치

### R1: shader 부분 freeze (volt #33) → M1 백업 자동 전환

**전환 조건** (어느 하나 충족 시):

1. shader 컴파일 실패 (`WebGLRenderer` context 에서 `onError` 콜백 트리거)
2. headless pixel assertion 실패 후 실 Chrome 검증 1회 불합격
3. URL 수동 플래그 `?ring=fallback` 존재

**전환 로직**: `createRingShaderMaterial` 내부에서 `try { ... } catch` 로 shader 실패 감지. 실패 시 `createRingInstancedMesh(params)` 대체 호출. `densityProfile` 배열을 그대로 입자 density 로 사용 — rejection sampling 으로 각 반경에 비례 입자 분포. 층당 2000 particles (3층 × 2000 = 6000, 60fps 예산 내).

**박제 위치**: PR-2.5 `ring-shader.ts` 내 `createRingInstancedMesh` 함수 + `scripts/verify-ring-shader.mjs` 의 실패 시 자동 전환 로그.

### R2: Osculating polling fps 자동 폴백

**폴백 단계** (히스테리시스 +5fps):

| fps 관측 (2s EMA) | 적용 interval | 설명                                                                 |
| ----------------- | ------------- | -------------------------------------------------------------------- |
| ≥ 60              | 1000ms (1Hz)  | 기본                                                                 |
| 55~59             | 500ms (2Hz)   | 1차 강등                                                             |
| 50~54             | 200ms (5Hz)   | 2차 강등                                                             |
| 45~49             | 100ms (10Hz)  | 3차 강등 (최대)                                                      |
| < 45              | 100ms (유지)  | 경고 로그 (`console.warn('osc-sync: fps critical')`) + 재검토 트리거 |

**복귀 조건**: 현재 단계 상한 + 5fps 초과 시 이전 단계 복원. 즉 55→60 시 500ms → 1000ms 복원, 50→55 시 200ms → 500ms.

**fps 측정**: `requestAnimationFrame` delta 이동평균. window=2s (≈120 frame). 너무 짧으면 노이즈, 너무 길면 반응 늦음.

### R3: 장기 적분 안정성 (50/100/200 주기 비교)

**검증 방식**: `measure_laplace_resonance` 를 `integration_io_periods: usize` 파라미터화 (기본 100). 단위테스트 3건:

```rust
#[test] fn laplace_50_periods_residual_bounded() { ... /* |residual| ≤ 0.015 허용 */ }
#[test] fn laplace_100_periods_residual_doD()    { ... /* |residual| ≤ 0.01 DoD */ }
#[test] fn laplace_200_periods_residual_bounded(){ ... /* |residual| ≤ 0.012 (secular drift 확인) */ }
```

100 주기가 DoD. 50 은 under-sampling 확인용, 200 은 secular drift 관찰용. 200 에서 잔차가 100 대비 >50% 증가 시 Yoshida 차수 상향 재검토 (P7 ADR §재검토 트리거 #6 경로).

## 결과 / 재검토 조건

### 예상 결과

- **Galilean 주기 DoD**: Io 1.77d / Europa 3.55d / Ganymede 7.15d / Callisto 16.69d 모두 ±1% — Yoshida 4차 dt=60s 에서 예산 내
- **Laplace 잔차**: 이론 상 완전 공명 시 0. 수치 적분에선 <1e-3 수준 기대 (5체 상호 섭동 포함)
- **위상 진폭**: JPL DE441 ephemeris 실측 ±0.8° 수준 (Lainey 2009). DoD ±2° 여유 충분
- **CI 시간**: PR-2 증분 ~180s (100 Io 주기 × 5체 × dt=60s × 3-stage = 75만 step × 0.2μs ≈ 150s + 4 주기 개별 테스트 30s)
- **WASM 번들 증분**: `satellites/` 모듈 +1.2 KB gzipped (상한 +2 KB 내)
- **Osculating polling 성능 영향**: fps=60 기본 유지 (1Hz × 4 호출 × <0.5ms = 2ms/s 즉 0.12% 프레임 예산)

### 재검토 조건

| #   | 트리거                                                                         | 대응                                                                                                                                                |
| --- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | Galilean 어느 1체라도 `measure_galilean_period` rel_err > 1%                   | 측정법 검증 우선 (volt #32): (1) burn-in 주기 확대, (2) 근점 탐색 윈도우 조정, (3) dt=30s 축소. 3단계 후에도 미달이면 5체→6체(Sun 포함) 확대 재검토 |
| 2   | Laplace 위상 진폭 peak-to-peak 측정 ±2° 초과                                   | (a) peak 검출 오류 의심 — std 비교로 확인 (std×√2 ≈ peak-to-peak/2 여야 함). 불일치 시 (c) FFT 전환 검토. Rust `rustfft` crate 도입 ADR 신규 필요   |
| 3   | Osculating 왕복 오차 > 1e-10                                                   | (a) 특이점 가드 조건 완화 (1e-6 → 1e-5), (b) Equinoctial 원소 우회 도입 — 별도 ADR                                                                  |
| 4   | fps<45 가 10Hz 폴백에서도 지속                                                 | polling subset 전환 — 4 Galilean 중 selected 1체만 동기화. URL `?osc=io-only` 플래그                                                                |
| 5   | shader 3차 이상 실패 (실 Chrome 수동 검증 포함)                                | M1 InstancedMesh 전환 + 차후 WebGPU 쉐이더 재도전 (P12+ 범위)                                                                                       |
| 6   | 200 주기 잔차가 100 주기 대비 >50% 증가                                        | Yoshida 4차 secular drift 한계 — P7 ADR §재검토 트리거 #6 경로로 RK8 ADR 착수                                                                       |
| 7   | `?mass=jupiter×N` 조작 시 Galilean 외 외행성 궤도에도 영향 관측 (비-범위 침범) | `?mass` 스코프를 `jupiter` 로 한정하는 URL 파라미터 재설계 — 별도 이슈                                                                              |

### 비-범위 (본 ADR 변경 시 별도 ADR 필요)

- **J2/J4 비구대칭 중력** — [P9-followup-1]
- **장기 적분 에너지 보존 DoD** — [P9-followup-2]
- **고리 섀도우 매핑** — [P9-followup-3]
- **아말테아/내소형 위성** — P10+ 후보
- **고해상도 목성·위성 텍스처** — 별도 자산 파이프라인
- **SPICE/DE441 kernel** — P17+ 후보
- **Kerr / 2PN 상대론** — 본 Phase 무관
- **P10 토성계** — `RingShaderMaterial` 재사용 전제만
- **#246 클릭 인터랙션 전체** — 정보 표시만 흡수

### 의존 / 선행 ADR

- `20260419-satellite-orbit-hybrid.md` (P8) — §Amendments 에 Osculating P9 흡수 박제 (본 ADR 과 동시 박제)
- `20260418-p7-integrator-upgrade.md` (P7) — Yoshida 4차 사용 근거
- `20260417-eih-1pn-multibody.md` (P6-C) — Newton/1PN 모드 스위치 (본 Phase 는 Newton 기본, GR 은 비-범위)

## §Amendments

본 ADR 의 수치·임계·DoD 갱신 이력. 포맷 규약: `docs/decisions/README.md` §Amendments.

| 날짜 | 변경 요약                     | 근거                             |
| ---- | ----------------------------- | -------------------------------- |
| —    | (본 ADR 초판 박제, 변경 없음) | PR-3 병합 후 실측 기반 수정 예정 |
