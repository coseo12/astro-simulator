# ADR: Schwarzschild geodesic 솔버 — RK4 + 광선 1차 ODE

- 일자: 2026-04-17
- 상태: Accepted
- 관련: P6-A #189, 후속 P6-B(#190 시각화) / P6-D(#192 검증) / P6-E(#193 ADR 박제)

## 배경

P5-D에서 도입한 중력렌즈 시각화(`packages/core/src/scene/gravitational-lensing.ts`)는
**화면 공간 근사**(`α = 2Rs/b` weak-field, fragment shader UV 왜곡)에 머물러 있다.
이 근사는 다음 한계를 갖는다.

- thin-lens 가정 — 블랙홀 앞뒤 깊이 무시
- weak-field 전용 — `b ≳ 5Rs`만 의미. photon sphere(1.5Rs) 근처 강한 장 거동 불가
- accretion disk / 블랙홀 그림자(shadow) 비물리 (P6 후속 시각화 차단)

P6에서 3D ray geodesic 적분으로 대체할 기반 솔버가 필요하다.
P6-A는 **시각화 인터페이스에서 분리된 순수 Rust 솔버 + 단위 테스트**까지를 범위로 한다.
WGSL 포팅·시각화 통합은 P6-B 이후.

## 후보 비교

### (1) Geodesic 방정식의 표현 좌표계

| 항목                | A: Schwarzschild (r, θ, φ) — 4-vector           | B: Cartesian (x,y,z) + 광선 4-vector | C: 1차 ODE (photon orbit `d²u/dφ² + u = 3M·u²`) |
| ------------------- | ----------------------------------------------- | ------------------------------------ | ----------------------------------------------- |
| 차원                | 8 (좌표 4 + 4-운동량 4)                         | 8 (위치 + 4-운동량)                  | 2 (`u, du/dφ`)                                  |
| 구현 복잡도         | 높음 (Christoffel 기호 4종)                     | 중간 (자코비안)                      | **매우 낮음** (~30줄)                           |
| 좌표 특이점         | r=Rs에서 발산 (Eddington-Finkelstein 변환 필요) | 없음                                 | u=1/Rs에서 자연스러운 종료                      |
| 평면 외 운동        | 자연스러움                                      | 자연스러움                           | **불가** (적분 평면 가정)                       |
| 검증 용이           | 어려움 (E·L·Carter 등 다중 invariant)           | 어려움                               | **쉬움** (E, L 2개 invariant + 해석해 비교)     |
| P6-B(시각화) 적합성 | 좋음 (3D 광선 자연 표현)                        | **좋음** (Babylon WGSL 포팅 직관)    | 중간 (적분 후 평면 → 3D 회전 필요)              |

**메모**: 광선 geodesic은 Schwarzschild 메트릭의 구대칭성에서 항상 **단일 평면 운동**이라
평면 가정은 물리적으로 손실 없음. C는 그 평면에서의 궤적을 `u(φ) = 1/r(φ)`로 표현.

### (2) Step 제어 알고리즘

| 항목          | A: 고정 dλ                      | B: 단순 RK4 + r-기반 step (`dλ ∝ r²/Rs`)  | C: Adaptive RK45 (Dormand-Prince) |
| ------------- | ------------------------------- | ----------------------------------------- | --------------------------------- |
| 구현 복잡도   | 매우 낮음                       | **낮음** (~10줄)                          | 중간 (embedded error estimator)   |
| 보존 정확도   | 강한 장에서 무너짐 (1.5Rs 부근) | **A2 충족 가능** (강한 장에서 step 자동↓) | A2 충족 + 여유                    |
| step 수       | 약한 장 낭비 / 강한 장 부족     | 균형                                      | 균형                              |
| 디버깅 난이도 | 쉬움                            | 쉬움                                      | 어려움 (step 선택 비결정성)       |

### (3) Rust 모듈 위치

| 항목              | A: `nbody.rs` 확장                           | B: 신규 모듈 `geodesic.rs`                    |
| ----------------- | -------------------------------------------- | --------------------------------------------- |
| 응집              | 낮음 (N-body 시간적분 ↔ 광선 적분은 별 독립) | **높음** (자체 invariant·테스트·outcome enum) |
| 검색              | 어려움 (1PN 보정과 혼재)                     | 명확                                          |
| WASM 노출 시 충돌 | 위험 (NBodyEngine 시그니처와 섞임)           | 깨끗 (별도 export)                            |

기존 1PN 보정도 `nbody.rs`에 인라인된 상태이지만, 그 결정은 "Newton 가속도 합산 직후 추가항"
이라는 시간적분 컨텍스트 내부 작업이라 정당화된다. 광선 geodesic은 **시간적분 자체가
다른 종류**(affine parameter λ, 4-운동량)이므로 동일 모듈에 두면 응집도가 깨진다.

## 결정

- **(1) C 채택** — 광선 1차 ODE `d²u/dφ² + u = 3M·u²` 형태
- **(2) B 채택** — 단순 RK4 + r-기반 step 제어
- **(3) B 채택** — 신규 모듈 `packages/physics-wasm/src/geodesic.rs`

### 근거

1. **A2(invariant 보존 < 1e-4 / 1000 step) 충족 가능한 가장 단순한 안**.
   1차 ODE는 보존량(E, L)이 적분 변수에 직접 연결되어 드리프트가 자연 억제.
2. **A1(deflection ±5%) 검증 직관적** — `u(φ) → 0`인 두 φ의 차이가 `π + α`.
   해석해 weak-field `α ≈ 4M/b`와 직접 비교.
3. **A3(escape vs capture) 자연 분기** — 적분 중 `u → 1/Rs` 도달 = capture, `u → 0` 두번 도달 = escape.
   평면 가정 + 임계값 `b_crit = 3√3 M`(약 2.598 Rs)이 1차 ODE 해의 분기점.
4. **신규 모듈** — 후속 P6-B에서 3D 회전 + Babylon WGSL 포팅 시 인터페이스 경계가 명확.
5. **Adaptive RK45는 보류** — A2가 단순 RK4 + r-step으로 충족되면 미도입. 미충족 시 재검토 조건에 따라 격상.

### 평면 가정 정당화

광선의 초기 위치 `p0`와 방향 `d0`로 결정되는 평면(법선 `n = p0 × d0`)에서만 운동.
3D 시각화는 이 2D 궤적을 평면 회전으로 다시 3D로 lift — P6-B 인터페이스 책임.

## 인터페이스 (예상, 최종 시그니처는 dev 단계에서 확정)

```rust
// packages/physics-wasm/src/geodesic.rs (신규)

pub enum GeodesicOutcome {
    Escaped { final_phi: f64, deflection: f64 },
    Captured { capture_phi: f64 },
}

pub struct GeodesicTrajectory {
    pub phi: Vec<f64>,        // 적분 노드의 방위각
    pub u: Vec<f64>,          // u = 1/r at each phi (Rs 단위)
    pub outcome: GeodesicOutcome,
    pub e_drift: f64,         // 무차원 E invariant 상대 드리프트
    pub l_drift: f64,         // 무차원 L invariant 상대 드리프트
}

/// b: impact parameter (Rs 단위), max_phi: 적분 종료 방위각, rs_unit=1.0 가정.
/// 약속: 입력 b·rs는 자연단위 (M=1, c=1, Rs=2M=2 → 사용자는 b/Rs 비율로 전달).
pub fn integrate_photon_geodesic(
    b_over_rs: f64,
    max_phi: f64,
    initial_step: f64,
) -> GeodesicTrajectory;
```

WASM 노출 여부는 **P6-B에서 결정**. P6-A는 Rust 단위 테스트로 DoD 검증까지가 범위.

## 단위 테스트 계획 (DoD 매핑)

- **A1** (`geodesic_deflection_weak_field`, `geodesic_deflection_strong_field`)
  - b=10 Rs: 해석해 α ≈ 4M/b = 0.4 rad. ±5% 통과 확인 (weak-field)
  - b=1.5 Rs: 수치 적분 정밀값 vs 솔버 출력 ±5% (강한 장)
- **A2** (`geodesic_conservation_1000_steps`)
  - 임의 b ∈ {2.6, 3, 5, 10} Rs 케이스에서 1000 step 후 `e_drift, l_drift < 1e-4`
- **A3** (`geodesic_outcome_classification`)
  - b ∈ [0.5, 10] Rs를 50점 sweep. `b_crit = 3√3/2 ≈ 2.598`
  - b < 2.598 → Captured, b > 2.598 → Escaped
  - 경계 ±0.05 Rs 내에서 분류가 뒤집히는지 확인 (정확도 sanity)

## 결과·재검토 조건

P6-A 통과 기준:

- A1/A2/A3 단위 테스트 모두 green
- `cargo test --package physics-wasm geodesic_` 5개 이상 케이스 통과

다음 조건 발생 시 본 ADR 재검토:

- **3D 적분 필요** (예: 시간 의존 메트릭, Kerr 회전 블랙홀, 다중 블랙홀) → 옵션 (1)-A 또는 (1)-B로 격상
- **A2 미충족** (1e-4 드리프트 못 맞춤) → (2)-C Adaptive RK45 격상
- **WGSL 포팅 시 평면 회전 비용 과다** → P6-B에서 (1)-B Cartesian 4-vector 재평가
- **1.5Rs 미만 photon sphere 정밀 시각화 요구** (예: ergosphere) → metric tensor 일반화 ADR 신규

## 비-범위 (P6-A에서 절대 손대지 말 것)

- WGSL 셰이더 포팅 (P6-B)
- Babylon scene 통합 (P6-B)
- 기존 `gravitational-lensing.ts` PostProcess 수정 (P6-B/D)
- WASM bindgen 노출 (P6-B에서 결정)
- accretion disk / 블랙홀 그림자 시각화 (P6 후속)
- 1PN(`nbody.rs`) 코드 변경 (별도 솔버)

## 참고

- Misner, Thorne, Wheeler — _Gravitation_, §25.5 (광선 orbit equation)
- Hartle — _Gravity_, Ch.9 (Schwarzschild photon orbit)
- 기존 ADR: `20260417-general-relativity-1pn.md` (1PN 보정 — 본 결정과 독립)
- 기존 ADR: `20260417-gravitational-lensing-pipeline.md` (PostProcess 시각화 — P6-B에서 본 솔버 출력으로 대체 검토)
