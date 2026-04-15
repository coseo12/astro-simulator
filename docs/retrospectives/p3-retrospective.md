# P3 마일스톤 회고 — Barnes-Hut + WebGPU compute

작성: 2026-04-15
대상 마일스톤: P3-0 / P3-A / P3-B / P3-D (P3-C 모바일은 P4로 이연 결정)
릴리스: [v0.3.0](https://github.com/coseo12/astro-simulator/releases/tag/v0.3.0)

## 달성도 (스프린트 계약 대비)

| 마일스톤            | 계약 기준                                  | 달성 | 비고                                                                              |
| ------------------- | ------------------------------------------ | ---- | --------------------------------------------------------------------------------- |
| P3-0 준비           | WebGPU 감지 + bench 확장 + Engine selector | ✅   | #124 #125 #126 모두 머지                                                          |
| P3-A Barnes-Hut     | theta=0.5 정확도 <0.1%, N=5000 PASS        | ✅   | max err 4.99e-9 (1e-3 대비 6 자릿수 여유)                                         |
| P3-B WebGPU compute | N=10000 best-effort, CPU 대비 ≥2× 가속     | ✅~  | best-effort 충족(220fps), 가속비는 측정 불가 (인계)                               |
| P3-D 검증·마감      | 종합 회귀 + v0.3.0 릴리스                  | ✅   | 287/287, [v0.3.0](https://github.com/coseo12/astro-simulator/releases/tag/v0.3.0) |
| P3-C 모바일         | iPhone 60fps@N=200                         | ⏭   | P4로 이연 (소행성대 N-body 통합과 함께)                                           |

## 잘 된 것

1. **ADR 활용** — `docs/decisions/20260415-webgpu-integration-scheme.md`에서 Hybrid vs GPU-resident 두 후보를 표로 비교 후 결정. 구현 PR(#146)에서 의사결정 근거 다시 찾기 쉬움. 향후 재검토 트리거 조건도 명시.
2. **Capability 폴백 패턴** — WebGPU 미지원 환경에서도 `engine=webgpu` URL이 깨지지 않고 barnes-hut로 자동 폴백 + HUD notice (#146 sim-canvas resolveEngine). 5-mode UI를 안전하게 노출 가능.
3. **단계적 활성화 전략** — 토글 disabled → wasm 활성화 → UI 활성화 → 측정 (3 PR로 분할). 각 단계가 독립 검증되며 릴리스 risk 분산.
4. **CPU mirror 검증 패턴** — GPU 셰이더와 동일한 알고리즘을 f32 CPU(`stepVvF32`/`computeForcesF32`)로 미러 구현. node 환경에서 GPU 없이 알고리즘 정합성 검증 가능 (#144/#145/#147).
5. **Sprint Contract 사전 합의** — P3 착수 시점 메모리에 박제(`project_p3_contract.md`) → 마일스톤 진행 중 범위 결정에 일관된 기준 제공.

## 어려웠던 것

1. **WebGPU 가속비 측정 한계** — 본 환경(macOS + 헤드리스 Chromium ANGLE Metal)에서 Babylon이 WebGL2 fallback 사용. `engine=webgpu` URL도 capability 폴백으로 barnes-hut 라우팅. 결과적으로 'CPU 대비 webgpu ≥2× 가속'을 검증할 수 없었음. **P3-D #154에서 vsync 해제까지 했지만 측정 불가는 동일** — 소행성대가 Kepler 해석해 + 렌더러 부하 지배라는 구조적 이유.
2. **vsync cap 헤드리스 측정 함정** — 1차 측정에서 모든 엔진 120fps 동률이 baseline 의미를 무력화. `--disable-gpu-vsync` flag 추가 후 절대 throughput 측정 가능. 향후 bench 도구에 vsync 해제 기본화 검토.
3. **harness ci.yml 충돌** — harness v2.2.0/v2.3.0 update에서 ci.yml이 frozen 카테고리지만 우리 프로젝트가 Rust+wasm-pack 단계를 추가한 상태라 덮어쓰기 위험. dry-run으로 사전 식별 후 수동 제외. 자세한 내용은 `harness-update-2.2.0-retrospective.md`.
4. **WGSL f32 정밀도 trade-off** — 행성 SI 좌표(~1e11m)에서 ~10km 단위 손실 발견 후 ADR에서 보전 전략 결정. 시각화 충분, 정밀 시뮬은 CPU 경로 분리. 결과적으로 명확하지만 예측 어려운 제약.
5. **focus-neptune 환경 노이즈** — 종합 검증(#155)에서 baseline 대비 -8.3% (5% 가드 위반). 1차 85.1 → 2차 92.2로 ±8% 측정 변동 — 헤드리스 환경 noise 특성. 평균/실 GPU 결과로 우회 판단.

## 다음 인계

### P4 후보 (우선순위 순)

1. **소행성대 N-body 통합** — 현재 Kepler 해석해. N-body 경로로 옮기면 BH/WebGPU 가속 효과가 실제 측정 가능. P3-B 미충족 항목(`webgpu ≥2× 가속`)을 닫을 단일 조건.
2. **Babylon `useWebGPU: true` 명시** — 데스크톱 Chrome에서 WebGPU 활성. 현재 Babylon 자동 fallback 정책에 의존하느라 GPU compute 경로 미사용.
3. **모바일 (P3-C 이연분)** — iPhone vsync 60fps 환경에서 N=10000 PASS 보장 측정. iOS Safari WebGPU(2025+).
4. **GPU timer query** — vsync 해제로도 측정이 부정확. Babylon `PerformanceMonitor` 또는 EXT_disjoint_timer_query로 GPU 시간 직접 측정.
5. **일반상대론 효과** — P4 계약상 수성 근일점 / 중력렌즈. 정밀 시뮬은 CPU `NBodySystem` (f64).

### 회고 → 가드 제도화 (CLAUDE.md 마일스톤 회고 루틴)

본 회고에서 도출된 교훈을 가드로 박제:

- [x] **vsync 해제 bench 기본화** — `bench:webgpu`에 flag 영구 적용 (#154 PR 머지로 완료)
- [x] **CPU mirror 패턴 박제** — 새 GPU 셰이더 추가 시 CPU 등가 함수 의무 (`docs/decisions/20260415-webgpu-integration-scheme.md` 참조)
- [x] **harness update dry-run 의무화** — `harness-update-2.2.0-retrospective.md`에서 이미 박제, 본 회고에서 재확인
- [ ] **`engine=webgpu` URL 진입 시 polling fallback notice** — 현재는 1회 표시, 5초 후 dismiss. 추가 가드 불필요 판단

### 데이터 / 구조 변화 요약

- 신규 패키지 모듈: `packages/core/src/gpu/` (10개 파일)
- 신규 엔진: `BarnesHutNBodyEngine` (CPU/wasm) + `WebGpuNBodyEngine` (GPU)
- `PhysicsEngineKind`: 2-mode → 5-mode (kepler/newton/barnes-hut/webgpu/auto)
- 회귀 가드: 211 → **287** (+76, BH 정확도/CPU mirror/WGSL 정합성)
- harness: v2.2.0 → v2.3.0 (페르소나 커맨드 7종 + ADR/회고 디렉토리)

## 메모리 갱신

- `project_p3_contract.md`는 본 회고 작성 시점 기준 archived 상태. P4 진입 시 신규 contract 작성.
