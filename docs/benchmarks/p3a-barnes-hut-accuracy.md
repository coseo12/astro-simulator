# P3-A — Barnes-Hut 정확도 검증

대상: `BarnesHutSystem` (Velocity-Verlet + Salmon-Warren MAC) vs `NBodySystem` (직접합)
실행: `cargo test --release --manifest-path packages/physics-wasm/Cargo.toml --test barnes_hut_accuracy -- --nocapture`

## 시나리오

- 태양 + 8행성 (Mercury–Neptune)
- 단순화된 원궤도 초기 조건 (각 행성을 균등 위상에 배치)
- dt = 1 day
- 1년(365.25 day) 적분
- 두 적분기를 동일 초기 상태에서 시작해 1년 후 위치를 직접 비교

## 결과

| theta    | max relative error | wallclock (ms) |
| -------- | -----------------: | -------------: |
| (direct) |                0.0 |           0.06 |
| 0.30     |           3.17e-10 |           2.13 |
| 0.50     |            4.99e-9 |           1.65 |
| 0.70     |            2.22e-8 |           1.74 |

(macOS M1 Pro · `cargo test --release` 측정. CI ubuntu-latest 환경에서는 절대값 차이 있음.)

## 해석

### 정확도

- **P3 계약 충족**: theta=0.5 max rel err = 4.99e-9 << 0.1% (1e-3). 4 자릿수 여유.
- theta가 커질수록 오차 증가 (0.3 → 0.7에서 ~70× 악화)지만 모두 1e-7 수준.
- 8행성 + 균등 분포라 트리 노드들이 잘 분리되고, 상호작용도 약해 MAC 근사가 매우 정확.

### 속도

- N=9에서는 직접합이 BH보다 빠르다 (~30×). 트리 빌드/COM/walk 오버헤드가 N²의 81 페어 계산보다 큼.
- 속도 교차점은 N≈500–1000 범위로 알려져 있고, P3-A #134에서 N=5000 측정으로 확인 예정.
- BH 자체의 theta별 속도 차이는 미미 — N이 작아 트리 깊이가 얕고 MAC 분기 빈도가 낮음.

### theta 권장값 (정리)

| 용도             | theta   | 비고                            |
| ---------------- | ------- | ------------------------------- |
| 정밀 (장기 적분) | 0.3     | 오차 1e-10 수준, 속도 약간 느림 |
| 균형 (기본)      | **0.5** | P3 계약 검증값. 권장 기본       |
| 시각화 전용      | 0.7     | 가장 빠름, 1e-7 수준 오차       |

## 회귀 가드

`tests/barnes_hut_accuracy.rs`는 CI `cargo test --release`에 자동 포함된다.

- `theta_half_within_0_1_percent_one_year`: 1e-3 가드 (P3 계약 직접 검증)
- `theta_sweep_accuracy_and_speed`: 모든 theta에서 1e-2 회귀 가드

CI 실행 시간: ~1초 내 (DoD 30s 한도 충분히 만족).

## 후속 (#134)

- N=5000 시나리오 별도 벤치 (속도 우위 확인) → `docs/benchmarks/p3a-perf.md`
- baseline.json P3-A 시점 갱신
- UI에서 barnes-hut 활성화
