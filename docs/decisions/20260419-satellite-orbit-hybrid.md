# ADR: 위성 궤도 — 테스트용 N-body / 렌더용 Kepler 해석 하이브리드 채택

- **상태**: Accepted
- **날짜**: 2026-04-19
- **결정자**: architect (P8 #244)
- **관련**: P8 #244 (본 마일스톤), #245 (후속 줌 토글 — 비-범위), #246 (후속 클릭 패널 — 비-범위), P5-A #178 (선행 수성 세차 측정 패턴), P6-D #192 (선행 EIH 1PN 헬퍼 추출), 로드맵 v2 (MEMORY `project_p8_p16_roadmap.md`)

## 배경

P8 은 내행성계 위성 3종 — 포보스·데이모스·달 — 의 궤도 역학을 정량 검증하고 시각화하는 마일스톤이다. 달성 목표:

- D1: 포보스 공전주기 7h 39m 13.85s (0.31891 day) ±1%
- D2: 데이모스 공전주기 30h 18m 43.2s (1.26244 day) ±1%
- D3: 달 교점역행 주기 18.613년 ±5%

이 시점에서 코드베이스는 다음 자산을 이미 보유한다:

- **Rust N-body 적분 인프라** (`packages/physics-wasm/src/nbody.rs`) — Yoshida 4차 / Velocity-Verlet / EIH 1PN 다체 / `measure_perihelion_angle` · `measure_perihelion_precession_eih` · `measure_perihelion_precession_gr_centuries` 헬퍼 (P5-A·P6-D 계승)
- **TS Kepler 해석 렌더** (`packages/core/src/scene/solar-system-scene.ts`) — `parentId` 체인 기반 `updateAtKepler`. 이미 달이 `parentId=earth` 로 렌더 경로에서 자동 작동 중
- **solar-system.json 스키마** — `semiMajorAxisAU` 기반 (loader 가 `* AU` 변환). 달 엔티티 이미 정의됨 (`a=0.00257189 AU`, `e=0.0549`, `i=5.145°`)

**쟁점**: 위성 3종의 DoD 수치 검증과 sim-canvas 에서의 시각적 렌더링을 어떤 물리 계층에서 수행할 것인가.

위험 축:

- **정확도** — DoD ±1% / ±5% 충족 가능한 정밀도
- **성능** — sim-canvas frame budget (60fps 데스크톱 / 30fps 모바일, P4 계승). 포보스 T=7.65h 는 시뮬 10만배 가속 시 초당 260바퀴 — N-body 이중 시뮬 부담
- **검증 용이성** — CI deterministic, Rust 단위테스트 재현성, `cargo test` 시간 예산 (verify-and-rust 현재 ~9m15s, 임계 11m)
- **구현 복잡도** — 기존 헬퍼 재사용 범위, 신규 코드 라인 수
- **P5-A/P6-D 패턴 일관성** — 측정법·초기 조건 컨벤션 계승

## 후보 비교

### 1. 물리 계층 분리 — N-body 단독 / Kepler 단독 / 하이브리드

| 후보                                                          | 정확도                                                  | 성능                                                                           | 검증 용이성                                  | 구현 복잡도                                                | 패턴 일관성                                         |
| ------------------------------------------------------------- | ------------------------------------------------------- | ------------------------------------------------------------------------------ | -------------------------------------------- | ---------------------------------------------------------- | --------------------------------------------------- |
| **A. N-body 단독** (Rust 통합, TS 가 WASM 포지션 폴링)        | ⭐ 최고 (물리 정합성 100%)                              | ✗ 렌더 매 프레임 WASM 호출, 위성 3체 × 시뮬배속 × frame rate. 프레임 드롭 위험 | ⭐ DoD 테스트 = 시뮬 자체                    | ✗ sim-canvas ↔ WASM 포지션 bridge 신규, parentId 변환 추가 | ✗ 기존 `updateAtKepler` 경로와 이중 상태            |
| **B. Kepler 단독** (TS 해석 전개, DoD 테스트도 Kepler 식으로) | ✗ 교점역행은 3체 secular 효과 — 해석적으로 재현 불가능  | ⭐ 해석 식 O(1) per-frame                                                      | ✗ DoD D3 측정 불가 (Kepler 2체는 교점역행=0) | ⭐ 기존 `updateAtKepler` 그대로, JSON 추가만               | ⭐ 달 기존 구현 그대로                              |
| **C. 하이브리드** (Rust N-body = DoD 검증 / TS Kepler = 렌더) | ⭐ DoD 만족, 시각은 Kepler 근사 (±0.1% 수준, 인지 불가) | ⭐ 렌더는 Kepler, DoD 테스트는 `cargo test` 별도                               | ⭐ DoD = Rust 단위테스트, 렌더 = snapshot    | △ Rust 헬퍼 2 신설 + JSON 2 엔티티. sim-canvas 무변경      | ⭐ P5-A·P6-D 와 동일 — 테스트는 N-body, 렌더는 해석 |

**결정 축**:

- A 는 DoD 검증에 최적이지만 렌더 성능이 P4 budget 붕괴. 특히 포보스 궤도주기 7.65h 는 시뮬 10만배 가속 하에서 per-frame N-body step 이 반복되어 stdev_ratio 악화
- B 는 D3 측정이 원리적으로 불가능 (Kepler 2체는 교점 세차가 0). D1/D2 도 vis-viva 순수 해석으로는 적분기 검증 효과 없음
- C 는 두 경로를 분리해 각자의 책임을 최적화한다. 같은 fixture (JPL Horizons 2026-01-01 epoch) 를 양쪽에서 써 **phase alignment 오차 < ±0.1°** 목표

### 2. 측정법 (D1/D2) — 근점 통과 간격 / vernal node / 각도 회귀

| 후보                                             | 장점                                        | 단점                                      | 비고                                      |
| ------------------------------------------------ | ------------------------------------------- | ----------------------------------------- | ----------------------------------------- |
| **A. 근점 통과 2회 간격** (P5-A `min_r` 패턴)    | 기존 `measure_perihelion_angle` 구조 재사용 | 저이심률 (데이모스 e=0.00033) 에서 불안정 | 데이모스는 vernal node 간격 fallback 필요 |
| **B. Vernal node crossing 간격** (z=0 부호 변경) | 원형 궤도에 안정                            | 비경사 궤도 (i≈0) 에서 신호 약함          | 포보스·데이모스 모두 i≈1° 로 충분         |
| **C. 각도 회귀** (mean anomaly linear fit)       | 모든 이심률 안정                            | 초기 조건 vis-viva 가정 깨지면 편향       | P5-A 패턴과 이질적                        |

**결정**: A + B 하이브리드. `measure_moon_orbital_period(..., eccentricity_threshold=0.005)` — e > 0.005 면 A (포보스, 달), e ≤ 0.005 면 B (데이모스). CLAUDE.md §스프린트 계약 #10 "수치 DoD 미달 시 측정 방법 검증 우선" 교훈 반영 — volt #32 처럼 측정 노이즈로 우연 성공·실패 판정을 피한다.

### 3. 측정법 (D3) — 노드 벡터 각도 드리프트 / 경사 매트릭스 / 평균 원소 변화

| 후보                                             | 장점                                   | 단점                                          | 비고                                                          |
| ------------------------------------------------ | -------------------------------------- | --------------------------------------------- | ------------------------------------------------------------- |
| **A. 노드 벡터 `N = L × ẑ` 방위각 시간 회귀**    | 해석적으로 18.6년 퇴행 직접 측정       | 5년 적분 = 27% 샘플링 — 2차 항 영향 확인 필요 | `atan2(N_y, N_x)` 선형 회귀 후 역산. 5년 기본, 10년 확장 가능 |
| **B. 경사 벡터 `i`, `Ω` 직접 추출 후 ω̇_Ω 계산**  | 표준 Lagrange planetary equations 대응 | 궤도 요소 추출 코드 신규 (코드 라인 +80)      | 장기엔 안정, 단기엔 A 대비 이득 없음                          |
| **C. 평균 원소 변화** (100주기 각 평균 후 drift) | 단기 노이즈 평활                       | 5년에 100주기 (T=27.3d) 는 경계               | A 대비 계산량 동일, 해석 용이성 낮음                          |

**결정**: A (노드 벡터 방위각 선형 회귀). 근거:

- D3 공차 ±5% 는 18.613년 × ±5% = ±0.93년 — 5년 적분의 27% 샘플링에서도 달성 가능 (1PN 없이 Newton 3체 secular 효과만)
- 측정법이 스칼라 1차원 시계열 → 선형 회귀가 가장 직관적, 디버깅 용이
- 2차 항 우려 시 10년 적분으로 확장 (CI 시간 +30s 예산 내)

### 4. 초기 조건 — simplified Keplerian / JPL Horizons 2026-01-01

| 후보                                                 | 장점                                   | 단점                                        | 비고                                    |
| ---------------------------------------------------- | -------------------------------------- | ------------------------------------------- | --------------------------------------- |
| **A. Simplified Keplerian** (근점 시작, vis-viva)    | P5-A·P6-D 와 동일 패턴, 외부 의존 없음 | 실 위상 무관 (DoD 관점 secular 이므로 무관) | 포보스·데이모스는 이 경로 충분          |
| **B. JPL Horizons 2026-01-01 state vector 하드코딩** | 렌더 phase alignment 정확              | fixture JSON 관리 비용                      | 달 3체 + 렌더 alignment 목적으로 B 필요 |

**결정**: D1/D2 는 A (P5-A 패턴 계승), D3 는 B (렌더/테스트 epoch 통일 → phase alignment 오차 최소화). fixture 위치: `packages/physics-wasm/tests/fixtures/satellite-states.json`.

## 결정

**하이브리드 채택 (후보 1-C)** + 측정법 1-2-A·1-2-B 동적 선택 + 1-3-A + 1-4-A·1-4-B 혼용.

### 구현 계층

| 계층                            | 역할                                                      | 위치                                                                |
| ------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------- |
| **Rust N-body (DoD 검증)**      | 포보스/데이모스 근점 통과 간격, 달 노드 벡터 드리프트     | `packages/physics-wasm/src/nbody.rs` (#[cfg(test)] 블록)            |
| **TS Kepler (sim-canvas 렌더)** | `parentId` 체인 + `updateAtKepler` — 기존 경로 **무변경** | `packages/core/src/scene/solar-system-scene.ts` (변경 없음)         |
| **데이터 원천**                 | 포보스/데이모스 궤도 요소 추가, 달은 기존 그대로          | `packages/shared/data/solar-system.json`                            |
| **D3 fixture**                  | JPL Horizons 2026-01-01 epoch 달/지구/태양 상태 벡터      | `packages/physics-wasm/tests/fixtures/satellite-states.json` (신규) |

### 인터페이스 시그니처

```rust
/// 위성 공전주기 측정 — 근점 통과 2회 간격 평균 (e > threshold) 또는
/// vernal node crossing 간격 (e ≤ threshold) fallback.
/// 반환 단위: 초 (seconds). CLAUDE.md §스프린트 계약 #10 에 따라 단위를 드러내 오진 방지.
fn measure_moon_orbital_period(
    sys: &mut NBodySystem,
    parent_idx: usize,      // 부모 행성의 body index (포보스/데이모스→mars, 달→earth)
    satellite_idx: usize,   // 위성 body index
    nominal_period_sec: f64,// 탐색 윈도우 기준값 (nominal × 3 내부에서 통과 탐색)
    dt: f64,                // 적분 step (기본 1s for 포보스, 5s for 달)
) -> f64;

/// 달 교점역행 주기 측정 — 노드 벡터 `N = L × ẑ` 방위각 시간 선형 회귀.
/// 반환 단위: 년 (years). 음수면 퇴행(retrograde, 정상 달 거동), 양수면 전진.
///
/// **상대 좌표계 (Gemini 교차검증 #247 수용)**: 모든 상태 벡터는 부모 행성 대비 상대치.
///   r_rel = r_sat - r_parent ;  v_rel = v_sat - v_parent
///   L = r_rel × v_rel
///   N = L × ẑ (ecliptic plane 기준 승교점 방향)
/// 절대 좌표계(태양 기준) 사용 시 지구 공전 자체가 노드 방위각에 주입되어 잔차 발생.
fn measure_node_regression_period(
    sys: &mut NBodySystem,
    satellite_idx: usize,   // 달 body index
    parent_idx: usize,      // 지구 body index (N = (r - r_earth) × (v - v_earth) 로 상대 각운동량)
    integration_years: f64, // 5.0 기본 / 10.0 확장
    sample_interval_days: f64, // 1.0 기본 — 항성월 27.3일/삭망월 29.5일 대비 ≪ 주기로
                               // Nyquist 여유 확보 (Gemini 교차검증 수용, 종전 30.0 에일리어싱 회피)
    smoothing_window_days: f64,// 180.0 기본 — 단기 태양 섭동(≈173일 Saros-like) 평활화 이동평균
                               // 선형 회귀 입력 전 smoothing 필수
    dt: f64,                // 적분 step (기본 3600s = 1h)
) -> f64;
```

반환 단위는 함수 시그니처 문서화 주석에 **명시적** 으로 박제 — volt #32 "수치 DoD 미달 시 측정법 검증 우선" 교훈을 계약 수준에서 반영.

### JSON 스키마 추가 (포보스/데이모스)

단위 변환: 포보스 a=9376 km → 9376 / 149597870.7 = 6.26752e-5 AU. 데이모스 a=23463 km → 1.56840e-4 AU.

```json
{
  "id": "phobos",
  "kind": "moon",
  "nameKo": "포보스",
  "nameEn": "Phobos",
  "mass": 1.0659e16,
  "radius": 1.1267e4,
  "parentId": "mars",
  "$comment": "JPL Small-Body Database, Mars satellite ephemeris (2026-01-01 평균 궤도 요소).",
  "colorHint": { "hex": "#8A7560" },
  "orbit": {
    "semiMajorAxisAU": 6.26752e-5,
    "eccentricity": 0.0151,
    "inclinationDeg": 1.093,
    "longitudeOfAscendingNodeDeg": 207.79,
    "longitudeOfPerihelionDeg": 357.83,
    "meanLongitudeDeg": 92.474
  }
}
```

데이모스 동일 패턴 (JSON 은 PR-1 에서 실제 값 박제).

## 결과·재검토 조건

### 예상 결과

- DoD 3건 Rust 단위테스트로 CI deterministic 검증. 예산: `cargo test` 시간 +45s (포보스 1s × 2.3만 step = 7h, 데이모스 5s × 2.2만 step = 30h, 달 3600s × 4.4만 step = 5년). verify-and-rust 임계 11m 내 여유
- sim-canvas 에서 화성 주위 포보스/데이모스 + 지구 주위 달 모두 `updateAtKepler` 경로로 자동 렌더 — 구현 코드 라인 **추가 0** (기존 parentId 체인 재사용)
- WASM 번들 +2KB 상한: Rust 신규 헬퍼 2 함수 + fixture JSON inline 없음 (tests/fixtures 는 런타임 미포함) → 예상 +0.8KB

### 재검토 조건

- WASM 번들 >2KB 초과 시 헬퍼 inline 재검토, `#[cfg(test)]` 경계 확인
- `cargo test` 시간 60s 초과 (verify-and-rust 임계 11m 압박) 시 달 적분 5년 → 3년 단축 + 2차 항 허용 오차 확장 논의
- D3 5년 적분으로 ±5% 미달 시 10년 확장 (1차 fallback), 여전히 미달 시 1PN 3체 섭동 포함 (P13 범위 침범 — 별도 ADR 필요)
- 렌더 phase alignment 육안 오차 >5° 발견 시 JSON meanLongitudeDeg epoch 보정 재측정
- 모바일 30fps 회귀 발견 시 위성 mesh segments 축소 (기본 32 → 16) — 위성은 화면상 서브픽셀 크기

### 비-범위 (변경 시 별도 ADR)

- SPICE / DE441 C 바인딩 — P17+ 후보
- 화성 외 지구형 위성 (수성/금성 없음) — 이 행성엔 자연위성 없음, 영구 비-범위
- EIH 1PN 위성 보정 — Newton 3체로 ±5% 달성, GR 기여 < 0.3% (secular)
- `apply_eih_correction` / `apply_gr_correction` 본체 수정 — P13 범위
- 위성 줌 토글 (#245), 클릭 인터랙션 (#246) — P8-followup 별도 이슈

### 의존 / 선행 ADR

- `20260417-perihelion-verification.md` — P6-D 헬퍼 추출 패턴 계승
- `20260418-p7-integrator-upgrade.md` — Yoshida 4차 (본 ADR 에서 달 장기 적분에 사용 권장)

## §Amendments

본 ADR 의 수치·임계·DoD 갱신 이력. 포맷 규약: `docs/decisions/README.md` §Amendments.

| 날짜       | 변경 요약                                                                                               | 근거                 |
| ---------- | ------------------------------------------------------------------------------------------------------- | -------------------- |
| 2026-04-19 | D3 `sample_interval_days` 30.0 → 1.0 + `smoothing_window_days` 180.0 신설 (에일리어싱 회피)             | Gemini 교차검증 #244 |
| 2026-04-19 | D2·D3 측정법 상대 좌표계 (부모 행성 대비 `r_rel` / `v_rel`) 명시 박제                                   | Gemini 교차검증 #244 |
| 2026-04-19 | 후속 이슈 #247 분리 — "위성 Osculating elements 동적 동기화 파이프라인" (UX 비동기화 우려, P9/P13 후보) | Gemini 교차검증 #244 |

### 2026-04-19 — 상세

**D3 에일리어싱 (심각도: 높음, 즉시 수용)**

Gemini 교차검증에서 `sample_interval_days: 30.0` 이 달 항성월(27.3일)·삭망월(29.5일) 과 근접해 beat 현상 유발 위험을 지적. 5년 적분 × 30일 간격 = 60 샘플로는 단기 태양 섭동(≈173일) 을 제거하지 못함.

대응:

- `sample_interval_days: 1.0` 기본 — Nyquist 조건 충족 (27일 주기 대비 1/27 < 1/2)
- `smoothing_window_days: 180.0` 신설 — 173일 섭동 한 주기 포함 이동평균으로 단기 잔차 제거
- 선형 회귀는 smoothing 후 시리즈에 적용

**D2·D3 상대 좌표계 (심각도: 중간, 수용)**

노드 벡터 `N = L × ẑ` 의 L 이 **태양 기준 각운동량** 으로 계산되면 지구 공전 자체가 L 방위에 주입됨. D2 (노드 교차) 도 `z - z_parent = 0` 조건으로 명확화.

**Osculating elements 동적 동기화 (심각도: 높음, 후속 분리)**

"UX 비동기화" (질량 변경 시 위성 무반응) 은 "인터랙티브 시뮬레이터" 정체성과 직결. 그러나 PM 계약 Q2=c 하이브리드(정적 Kepler) 결정과 상충 → **후속 이슈 #247 로 분리** (volt #29 3단 프로토콜). P9/P13 후보, priority:medium.
