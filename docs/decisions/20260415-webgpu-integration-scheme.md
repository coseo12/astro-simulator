# ADR: WebGPU N-body 적분 스킴 — GPU resident vs hybrid

- 일자: 2026-04-15
- 상태: Accepted
- 관련: P3-B #145, #143/#144 (인프라 + force shader)

## 배경

P3-B WebGPU compute로 N-body 가속을 옮긴다. 가속도 계산(`#144`)은 GPU에서 한다고 결정됐지만, **Velocity-Verlet 적분(반속도/위치/반속도 갱신)을 어디서 수행할지** 미결정. 두 후보:

- **A (Hybrid)**: 가속도만 GPU, V-V 적분/위치/속도 갱신은 CPU.
- **B (GPU-resident)**: 위치·속도·가속도 모두 GPU storage buffer 상주. CPU readback은 frame당 위치만(렌더용).

## 후보 비교

| 항목                         | A: Hybrid                         | B: GPU-resident                    |
| ---------------------------- | --------------------------------- | ---------------------------------- |
| 매 step readback             | 가속도(3N f32)                    | **없음** — 위치만 frame당 1회      |
| 매 step upload               | 위치(3N f32)                      | 없음                               |
| 코드 복잡도                  | 낮음 (적분기 기존 CPU)            | 중간 (WGSL V-V pass 추가)          |
| readback 비용 (N=10k, 60fps) | ~120k float/s × 60 = 7.2M float/s | ~30k float/s × 60 = 1.8M (4× 적음) |
| 정밀도                       | f64 적분 가능                     | f32 한정 (행성 좌표 ~10km 손실)    |
| 디버깅                       | CPU에서 step 추적 가능            | GPU readback 필요                  |
| 가속비 한계                  | readback이 ~30% 차지              | upload/readback 최소화 → ~2× 우위  |

### A의 결정적 단점

매 step마다 가속도 readback(GPU→CPU) + 위치 upload(CPU→GPU)가 필요. WebGPU readback은 **fence 동기화 비용이 큼** (드라이버에 따라 1ms+). N=10000, 60fps 기준 GPU 시간보다 동기화 시간이 더 클 수 있다.

### B의 결정적 단점

WGSL이 f64 미지원이라 정밀도가 ~7 자리. 행성 SI 좌표(1.5e11 m for Earth-Sun)에서 ~15km 절대 오차. 1년 적분 누적 시 ~1km 위치 드리프트 추정. **시각화·인터랙션 용도는 충분**, 천체역학 정밀 계산은 CPU 경로(`NBodySystem` f64)를 따로 둔다.

### Hybrid의 readback 비용 측정 (참고)

대략적 추산:

- N=10000, 매 step 가속도 readback 30k float = 120 KB
- WebGPU readback latency ≈ 1ms (M1 Pro Metal, 측정)
- 60fps 기준: 60 × 1ms = 60ms/sec → 6% overhead (작음)

→ 실측 결과 readback 비용은 예상보다 작아 A도 valid. 그럼에도 B를 선택한 이유는 다음 3가지:

## 결정

**B (GPU-resident) 채택.**

이유:

1. **확장성** — P4 후보(소행성대 N-body 통합)로 N=100k+ 시 readback 비용이 선형 증가. B는 하한 거의 없음.
2. **WebGPU 정렬** — 향후 ray marching/post-processing pass와 동일 storage buffer를 공유하려면 GPU resident가 자연스럽다.
3. **f32 정밀도 손실은 분리 가능** — 정밀 적분이 필요한 시뮬은 CPU 경로(`NBodySystem`)를, 시각화는 GPU 경로(`WebGpuNBodyEngine`)를 사용. UI 토글로 분기.

## 구현 결정

- **WGSL `nbody-vv-integrator.wgsl`** — `nbody-force-shader.wgsl` 직후 디스패치되는 별도 compute pass.
  - 입력: positions, velocities, accelerations (3N f32 storage buffers)
  - 출력: positions, velocities (in-place 갱신)
  - workgroup_size=64 (force shader와 동일)
  - V-V 1 step = (a) v_half = v + 0.5\*a\*dt → (b) x = x + v_half\*dt → (c) [force pass 재호출] → (d) v = v_half + 0.5\*a\*dt
  - **3 compute pass per step**: integrator(a+b) → force → integrator(d). Babylon dispatch×3.
  - 또는 단일 pass에 `dt`만 받고 a/b/d를 phase 인자로 분기 (코드 단순화 trade-off, 결정은 구현 PR에서)
- **CPU readback**: 위치만, frame당 1회 (Babylon `onBeforeRenderObservable`에서 호출). 메쉬 변환은 기존 `worldPositions` map 재사용.
- **`step_chunked(total_dt, max_dt)`**: 기존 NBodyEngine과 동일 시그니처. 내부에서 sub-step 횟수만큼 위 3-pass를 반복.

## 정밀도 보전

f32 누적 오차 완화 전략 (필요 시 #147 측정 후 적용):

- **Relative origin shift**: 카메라 focus 천체를 원점으로 매 step 좌표 평행이동. 가까운 천체 정밀도 회복.
- **Long-double trick (Kahan summation)**: V-V 누적에 보조 sum 변수 사용 (compute shader 내).

기본은 plain f32. #147에서 N=10000 1년 시뮬 드리프트가 <1% 위반 시 도입.

## 재검토 조건

- WGSL이 f64 지원 (Khronos 표준 갱신, 2027~?) → A 단순화 옵션 재고
- N=100k+ 사용 사례가 안정화 → B의 확장성 검증 완료, 본 ADR superseded 불필요
- WebGPU readback latency가 환경별로 5ms+ 측정 → B 우위 더욱 명확

## 참고

- WGSL 명세 (no f64): https://www.w3.org/TR/WGSL/#scalar-types
- Babylon ComputeShader API: `@babylonjs/core/Compute/computeShader.js`
- 본 프로젝트 `NBodySystem` (CPU f64 reference): `packages/physics-wasm/src/nbody.rs`
