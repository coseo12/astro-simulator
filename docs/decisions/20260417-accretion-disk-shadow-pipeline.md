# ADR: Accretion disk + 정확 shadow 파이프라인 — Geodesic LUT + WGSL 샘플링

- **상태**: Accepted
- **날짜**: 2026-04-17
- **결정자**: Architect (P6-B #190)
- **관련**: P6-B #190 / 선행 P6-A #189 #194 / 후속 P6-E #193 (bench)

## 배경

P5-D(`docs/decisions/20260417-gravitational-lensing-pipeline.md`)는 화면공간 thin-lens 근사 PostProcess(`α = 2Rs/b`)로 lensing을 시각화했다.
P6-A(`docs/decisions/20260417-geodesic-solver.md`)에서 검증된 1차 ODE + RK4 광선 솔버(`packages/physics-wasm/src/geodesic.rs`)가 도입되면서, 다음을 구현해야 한다.

1. **B1**: accretion disk 렌더 (이심률·두께 UI 노출)
2. **B2**: 정확한 블랙홀 shadow — 반지름 `b_crit ≈ 2.598 Rs` ±5%
3. **B3**: 60fps 유지 (데스크톱 N=200, WebGPU)

핵심 결정 영역:

- **광선 적분 위치**(per-pixel WGSL vs WASM LUT vs 매프레임 전송 vs 하이브리드) — B2/B3 동시 충족 가능 여부 좌우
- **shadow 측정 방법**(광선 통계 vs 픽셀 분석) — B2 자동화 형태 결정
- **WASM bindgen 노출** — P6-A ADR이 "P6-B에서 결정"으로 미룬 항목
- **disk 모델·교차 판정** — 광선과 disk 평면의 교차 = disk 색상 샘플링 트리거
- **WGSL/GLSL 듀얼 셰이더 패턴** — P5-D에서 확립된 규약 재사용

P5-D ADR은 Draft 상태(shader 패스스루 미해결)였으나 sim-canvas 통합(`?bh=1`) 완료 + P5 회고 머지로 사실상 Accepted 동작.
본 ADR은 P5-D를 **Superseded by 본 ADR**로 전환하고 새 파이프라인을 박제한다.

## 후보 비교

### (1) Geodesic 솔버 호출 전략 — 핵심 결정

| 후보                                                                   | 정확도 (B2)          | fps (B3, N=200)                   | 동적 파라미터 (B1)     | 구현 비용                     | WASM bindgen                   |
| ---------------------------------------------------------------------- | -------------------- | --------------------------------- | ---------------------- | ----------------------------- | ------------------------------ |
| **A**: WGSL per-pixel 광선 적분                                        | 최상                 | 위험 큼 (photon sphere 분기 비용) | 즉시                   | 높음 (RK4 + r-step WGSL 포팅) | 불필요                         |
| **B**: Rust(WASM) 사전 적분 + 룩업 텍스처(LUT)                         | 상 (LUT 해상도 의존) | 좋음 (셰이더는 샘플링만)          | LUT 재생성 비용 (수ms) | 중간                          | **필수** (`build_lensing_lut`) |
| **C**: Rust(WASM) 매프레임 적분 + 텍스처 업로드                        | 최상                 | 매우 위험 (CPU↔GPU 병목)          | 즉시                   | 낮음                          | 필수                           |
| **D**: 하이브리드 — shadow boundary는 LUT(B2), disk 색상은 WGSL 분석식 | 상                   | 좋음 + 낮은 LUT 비용              | 부분 즉시              | 높음 (두 경로 모두)           | 필수                           |

비교 축 보충:

- **A의 fps 위험**: photon sphere 근처 step 수 ↑ → fragment shader가 픽셀당 100+ RK4 iter 가능. 1920×1080 viewport면 광선 200만 개/프레임 → 60fps 비현실.
- **B의 LUT 정확도**: shadow boundary는 1차원 함수(`b → outcome` ∈ {captured, escaped(deflection)}). 1024 sample이면 b 해상도 ~0.01Rs → B2 ±5%(2.598±0.13Rs) 충분.
- **C의 CPU 비용**: per-pixel은 비현실, per-direction(예: viewport 64×64)도 매프레임 수만 광선 → fps 위험.
- **D의 분리 가치**: disk는 동적 파라미터(이심률·두께·tilt)가 자주 변하므로 LUT 재생성 회피 이득. shadow는 b_crit이 메트릭 고정값이라 LUT가 더 적합.

### (2) Shadow 측정 방법 (B2 DoD)

| 후보                                                    | 정확성                | 자동화 용이                         | 구현 비용                     | 비고           |
| ------------------------------------------------------- | --------------------- | ----------------------------------- | ----------------------------- | -------------- |
| **1**: Rust 광선 통계 (b sweep → captured/escaped 경계) | 최상 (수치 정밀)      | 매우 높음 (cargo test + bench JSON) | 매우 낮음 (P6-A 솔버 재사용)  | 시각 무관      |
| **2**: 픽셀 분석 (canvas readback → shadow 영역 반지름) | 상 (렌더 정확도 의존) | 중간 (브라우저 + readback 비용)     | 중간 (playwright + 픽셀 처리) | 시각 검증 보조 |

### (3) WASM bindgen 노출 (P6-A 미결 항목)

| 후보                                                          | 시그니처                             | 데이터 전송 비용 | 유연성                           | 비고                      |
| ------------------------------------------------------------- | ------------------------------------ | ---------------- | -------------------------------- | ------------------------- |
| **α**: `build_lensing_lut(b_min, b_max, samples) -> Vec<f32>` | flat array (deflection·outcome 코드) | 1회 (수KB)       | 높음 (TS에서 텍스처 업로드 자유) | 단순                      |
| **β**: `LensingLut` struct + getter 메서드                    | 객체 lifetime                        | 호출당           | 중간                             | overengineering           |
| **γ**: 노출 안 함 (LUT 데이터를 빌드 시 정적 JSON 임베드)     | 없음                                 | 0                | 낮음 (재생성 불가)               | 빌드 파이프라인 변경 필요 |

### (4) Accretion disk 모델

| 후보                                                                           | 표현력 (B1)                     | 셰이더 비용         | 비고       |
| ------------------------------------------------------------------------------ | ------------------------------- | ------------------- | ---------- |
| **i**: 평면 thin disk (z=0, inner/outer radius, eccentricity, thickness, tilt) | 충분                            | 낮음                | MVP 적합   |
| **ii**: Volumetric (Novikov-Thorne 등)                                         | 최상                            | 높음 (ray marching) | P6 범위 외 |
| **iii**: 정적 텍스처 매핑                                                      | 낮음 (eccentricity 동적성 없음) | 매우 낮음           | B1 미충족  |

### (5) WGSL/GLSL 듀얼 셰이더

P5-D 패턴 (`createGravitationalLensing`) 재사용:

- `ShaderStore.ShadersStoreWGSL` (WebGPU) + `Effect.ShadersStore` (WebGL2)
- WGSL 선언 순서: `varying vUV` → `var sampler` → `var texture` → `uniform`
- `textureSample`은 uniform control flow 안에서만 호출 → `step()/mix()` branchless

## 결정

- **(1) D' 채택 (D 변형)** — 하이브리드: LUT(shadow + base deflection) + WGSL(화면공간 b/Rs 매핑 + disk 교차·색상)
  - 광선 적분 본체는 Rust LUT (B2 정확성·검증 재사용)
  - Disk 교차·색상은 WGSL 분석식 (B1 동적 파라미터 즉응)
  - 60fps 가드(B3)는 셰이더가 RK4 미실행 + LUT 1D 텍스처 샘플링만 수행하여 확보
  - **D 원안 vs D' 변형**:
    - 원안 D: 광선별 3D ray construction (WGSL invViewProj 역행렬) → 카메라 광선마다 b 계산 후 LUT 샘플링
    - 채택 D': **화면공간 b/Rs 근사 + LUT 샘플링** — 화면 중심 기준 픽셀 거리 → b 매핑, 그 후 LUT outcome/deflection 샘플링
  - **변경 이유**: Babylon `setMatrix`로 invViewProj 행렬 전달 시 fragment shader가 검은 화면 출력 (uniform 바인딩 처리 이슈 추정). 3D ray construction 경로 미가용.
  - **본질 영향**:
    - shadow 정확성: LUT 데이터(b_crit ±5%)는 그대로 유지 — `outcome_flag` 임계값에서 결정되며 매핑 방식과 무관
    - disk 5 파라미터 동적성: 그대로 (WGSL 분석식 분리)
    - 60fps: 그대로 (오히려 ray construction 비용 회피로 유리)
    - 차이점: 광선이 **3D 공간 경로 → b**가 아닌 **화면공간 거리 → b**로 매핑됨 (P5-D 패턴 확장). 카메라 시점이 disk 평면에 비스듬할 때 시각적 비대칭이 약화될 수 있음.
- **(2) 1 채택 (옵션 2 보조)** — Rust 광선 통계가 메인 측정. 픽셀 분석은 시각 회귀 가드용 보조 (P6-E 책임)
- **(3) α 채택** — `#[wasm_bindgen] pub fn build_lensing_lut(samples: u32) -> Vec<f32>`
  - flat `Vec<f32>` 형식: `[outcome_flag, deflection]` × samples (총 `2 * samples` floats)
  - `outcome_flag`: 0.0 = Captured, 1.0 = Escaped
  - b 범위는 자연단위 [0.5, 10.0] Rs로 고정 (constant in Rust 모듈) — TS는 samples만 전달
  - TS wrapper: `packages/core/src/physics/lensing-lut.ts` 신규
- **(4) i 채택** — 평면 thin disk + UI 파라미터 5종 (inner/outer radius, eccentricity, thickness, tilt)
  - 광선 ↔ disk 평면 교차: WGSL에서 disk normal과 광선 방향의 dot으로 교점 계산
  - 색상은 거리 기반 그라데이션 (구체 색상 모델은 dev 결정)
- **(5) P5-D 패턴 재사용** — 신규 모듈 `packages/core/src/scene/black-hole-rendering.ts` (`gravitational-lensing.ts`와 별도)
  - 기존 `createGravitationalLensing`는 P5-D 회귀 가드용으로 보존 (`?bh=1`)
  - 신규 `createBlackHoleRendering`는 `?bh=2` 옵트인 (회귀 위험 격리)

### 근거

1. **B2/B3 동시 충족**: D만이 정확도(LUT 1024 sample → ±0.01Rs ≪ ±5%)와 fps(셰이더 RK4 없음)를 모두 만족.
2. **shadow 측정 자동화**: Rust 광선 통계는 cargo test로 즉시 회귀 가드 가능. P6-E bench harness 통합도 단일 함수 호출.
3. **WASM bindgen 최소면**: flat `Vec<f32>` 한 함수만 노출. struct/lifetime 복잡도 회피. P6-A의 `integrate_photon_geodesic`은 비공개 유지.
4. **회귀 격리**: `?bh=2` 별도 옵트인 → P5-D 기존 동작(`?bh=1`)에 영향 없음. P6-D 검증 단계에서 두 경로 비교 가능.
5. **P5-D ADR 정리**: Draft 상태가 6개월간 미해결로 남아 있는 것보다 본 ADR이 명시적으로 superseded 처리.

### 비결정 항목 (dev 단계 자유)

- Disk 색상 그라데이션의 구체 함수 (Doppler boost 포함 여부 등)
- LUT samples 기본값 (256/512/1024 중 — B2 ±5% 만족 최소값)
- UI 패널 위치 (기존 patterns 따름)
- WGSL uniform 이름·구조

## 결과·재검토 조건

### 기대 효과

- B1: UI에서 eccentricity/thickness 슬라이더 조작 시 disk 외형 즉시 변화 (LUT 재생성 0회)
- B2: 광선 통계 cargo test에서 b_crit ≈ 2.598 Rs ±5% 회귀 가드. 픽셀 분석은 시각 회귀 가드용 보조 (P6-E)
- B3: 데스크톱 WebGPU N=200에서 60fps 유지. bench harness `?bh=2` 시나리오로 회귀 자동화 (P6-E)

### 트레이드오프

- LUT 재생성이 필요한 변경(Rs 동적 변경 등)은 ms 비용 발생 — 현재 Rs는 메트릭 고정값이라 비용 없음. 멀티 블랙홀 도입 시 재검토.
- 평면 disk만 지원 — volumetric은 P6 범위 외.
- WGSL 분석식 disk 교차는 기하 정밀도 한계 (광선 self-intersection 등) — MVP 한계 수용.

### 재검토 트리거

- **invViewProj 처리 해결** → D' → D 원안 복원 (광선별 3D ray construction). P6-B 트랙 B에서 재시도 예정. 성공 시 본 ADR을 D 원안으로 갱신하고 D' 사유는 변경 이력 섹션에 박제.
- **B3 미달** (N=200 60fps 미충족) → (1)-D에서 (1)-B로 후퇴 (disk도 LUT 사전계산)
- **B2 미달** (LUT 해상도 부족) → samples 증가 + 비선형 b 분포 도입 (photon sphere 근처 dense)
- **다중 블랙홀 도입** → LUT 차원 ↑ → (1)-A WGSL per-pixel 재평가
- **Kerr (회전) 블랙홀** → P6-A 솔버 자체 재설계 필요 → 본 ADR + P6-A ADR 동시 재검토
- **disk volumetric 요구** → ray marching 추가 → 본 ADR 별도 ADR로 분기

## 참고

- 선행 ADR: `docs/decisions/20260417-geodesic-solver.md` (P6-A — 본 ADR이 미결 항목인 WASM bindgen 노출을 (3)-α로 확정)
- Superseded ADR: `docs/decisions/20260417-gravitational-lensing-pipeline.md` (P5-D — 화면공간 근사. 본 ADR Accepted 시 상태 갱신)
- 관련 코드:
  - `packages/physics-wasm/src/geodesic.rs` — 광선 솔버 (P6-A)
  - `packages/physics-wasm/src/lib.rs` — WASM bindgen 노출 지점
  - `packages/core/src/scene/gravitational-lensing.ts` — P5-D PostProcess (보존)
  - `apps/web/src/components/sim-canvas.tsx` — `?bh=1` 통합 지점 (P5-D), `?bh=2` 신규 (P6-B)
- 외부:
  - Misner-Thorne-Wheeler — _Gravitation_, §25.5 (광선 orbit equation)
  - Bozza 2002 — strong-field deflection limit
  - Luminet 1979 — accretion disk silhouette (참고용 시각 reference)
