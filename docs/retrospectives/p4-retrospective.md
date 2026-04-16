# P4 마일스톤 회고 — WebGPU 실측 + 모바일

작성: 2026-04-16
대상 마일스톤: P4-A / P4-B / P4-C / P4-D (P4-E 일반상대론은 P5로 분리)
관련 PR: #168(P4-B) · #169(P4-D) · #170(P4-A) · #171(P4-C)

## 달성도 (스프린트 계약 대비)

| 마일스톤         | 계약 기준                                                                             | 달성 | 실측                                                          |
| ---------------- | ------------------------------------------------------------------------------------- | ---- | ------------------------------------------------------------- |
| P4-B WebGPU 활성 | Chrome 139+ `engine=webgpu` 진입 시 capability notice 미표시, navigator.gpu 경로 확인 | ✅   | 실측 결과 **이미 해소**된 상태 — NO-OP로 종결 + 회귀 가드 5/5 |
| P4-A N-body 편입 | N=5000에서 `webgpu / barnes-hut ≥ 2.0×`                                               | ✅   | **226×** (N=5000), 286× (N=10000)                             |
| P4-C 모바일      | N=200 @ 60fps, N=10000 크래시 없음, WebGPU 미지원 폴백                                | ✅~  | emulation 1차 게이트 5/5, **실기기 인계**                     |
| P4-D GPU timer   | GPU frame time ms 단위 bench 컬럼                                                     | ✅   | `EngineInstrumentation` + bench 표 + 가드                     |

P4-E(일반상대론)는 범위 분리 결정에 따라 **P5로 이연**.

## 잘 된 것

1. **실측 기반 재설계** — P4-B 원래 "EngineFactory 전환"이었으나 실측 후 **현재 패턴(직접 생성)이 더 명시적**임을 확인하고 NO-OP로 결정. `docs/decisions/20260416-engine-factory-no-op.md`에 근거 박제. 구현 전 실측으로 범위를 축소한 사례.
2. **P3 인계 → P4 착수 기반 정립** — P4-D의 GPU timer가 P4-A의 측정 기준(BH ms vs WebGPU ms 비교)을 제공하도록 **의도적으로 순서 배치**(B→D→A→C). 각 PR이 다음 PR의 실측 근거가 됨.
3. **URL 옵트인 설계** — `?beltNbody=1` / `?gpuTimer=1`로 프로덕션 회귀 없이 bench/개발 전용 경로 활성. **기본값 = 안전한 경로** 원칙 관철.
4. **226× 가속 실측** — P3 회고가 인계한 "WebGPU 가속비 측정 불가"를 명확히 닫음. 목표(≥2×) 대비 두 자릿수 초과 달성. CPU wasm 한계(N=10000에서 1.23 fps)와 GPU compute 우위가 **동일 bench에서 대비**되어 가치 증명 명확.
5. **타임박스 크게 단축** — 8~10 영업일 예상 대비 **1일 내 4 서브 완료**. 원인: 실측 우선 접근으로 과도설계 회피 + P3에서 쌓인 인프라(engine-factory WebGPU 경로, CPU mirror 패턴) 재사용.

## 어려웠던 것

1. **headless Chrome WebGPU timestamp-query** — `captureGPUFrameTime=true` + `timerQuery` cap 만으로는 부족. `--enable-webgpu-developer-features` + `--enable-dawn-features=allow_unsafe_apis` **두 flag를 추가**해야 ns 값이 0이 아닌 값으로 기록됨. count는 증가하지만 값이 0이라는 오탐이 발생해 30분 디버깅 소요.
2. **O(N²) newton hang** — 첫 bench에서 `time-preset-1y`(timescale=31.5M sec/sec) × N=10000으로 frame당 6 sub-step × 10^8 연산 → playwright timeout까지 5분 hang. **preset 제거 + newton N≥5000 skip**으로 해결. 초기 범위 합의 시 이 케이스를 예상하지 못함.
3. **GPU ms 오독 위험** — barnes-hut은 CPU(wasm) 시뮬이라 GPU ms에는 **렌더 시간만** 잡힘. 결과가 `bh 0.07ms vs webgpu 2.18ms`로 나와 "WebGPU가 더 느리다"는 오해를 유발. bench 스크립트에 **"fps 비율이 실질 기준"** 주석 명시 및 회고에 기록.
4. **Playwright Chromium ≠ 실기기 Safari** — P4-C는 viewport/userAgent만 iPhone 흉내. **WebKit + iOS Safari WebGPU** 특성은 검증 불가. "1차 게이트"로 명확히 범위를 분리하고 실기기 측정을 TODO로 인계. 실측 없이 ✅ 처리하는 유혹 회피.
5. **PR 스택 복잡도** — P4-B / P4-D / P4-A가 서로 의존(P4-A가 P4-D의 GPU timer API 필요). stack PR(P4-A base=P4-D)로 처리했으나 **main 머지 순서**가 강제됨. 독립 파일 분리로 완화했지만 구조적 부담은 남음.

## 다음 인계

### P5 후보 (우선순위 순)

1. **일반상대론 — 수성 근일점 precession** — P4에서 분리된 항목. CPU `NBodySystem` (f64) 경로에 Schwarzschild 보정항 추가. 목표: 43″/century ±5% 재현. 시각화/정밀 계산 분리 구조를 유지.
2. **실기기 iPhone Safari 측정** — P4-C 인계. iOS 17.4+ 실물에서 N=200 60fps, N=10000 크래시 없음 직접 검증. 실기기 접근 획득 시 수행.
3. **GPU ms 세분화 (compute shader별)** — 현재 EngineInstrumentation은 전체 GPU frame만. 조사 결과 `ComputeShader.gpuTimeInFrame` API 존재. force/integrator 셰이더별 시간 분리 측정 → Barnes-Hut 대비 진짜 compute 가속비 계산 가능.
4. **중력렌즈 시각화** — 블랙홀/중성자별 근처에서 빛의 휘어짐 시각화. ray marching pass 추가. P4 WebGPU compute 인프라 재활용.
5. **시뮬 베이스라인 배포** — v0.4.0에 release note 포함. bench baseline을 git tag와 연동.

### 회고 → 가드 제도화 (CLAUDE.md 마일스톤 회고 루틴)

P4에서 도출된 교훈을 가드로 박제:

- [x] **bench throughput 가드 ≥2×** — `scripts/bench-webgpu.mjs`에 assert 추가. N=5000에서 실패 시 exit 1.
- [x] **모바일 WebGPU 폴백 가드** — `scripts/browser-verify-mobile-p4c.mjs`에서 navigator.gpu 차단 시 WebGL2 폴백 확인.
- [x] **GPU ms ≠ 시뮬 시간** 주석 명시 — bench 스크립트 + 본 회고에 기록. CPU 시뮬 엔진(BH/newton)은 GPU ms에 렌더만 잡힘을 상기.
- [x] **실측 기반 구현 전 재검증** — EngineFactory NO-OP ADR 형식. "P3 회고 인계 항목"이 P4 시점 실측에서 이미 해결되어 있을 수 있음을 인정.
- [ ] **headless WebGPU timestamp-query 활성 flag 조합** — 향후 다른 bench 스크립트에서도 동일 flag 필요 시 공통 launch 옵션으로 추출 (후속).
- [ ] **stack PR 머지 순서 가이드** — 문서화(PR 템플릿 또는 PR 본문 체크리스트)

### 데이터 / 구조 변화 요약

- 신규 public API (core/engine): `enableGpuTimer()` / `readGpuFrameTimeMs()` / `debugGpuTimer()`
- 신규 public API (core/scene): `AsteroidBeltHandles.getNbodyState()` / `writeWorldPositions()`
- 신규 scene option: `asteroidNbody: boolean` (URL `?beltNbody=1`)
- engine-factory: WebGPUEngine 생성 시 `timestamp-query` feature optional 요청
- 신규 bench/verify: `bench:webgpu` 가드 강화, `verify:webgpu`, `verify:belt-nbody`, `verify:mobile-p4c`
- 테스트 증분: 156 → **156** (P4-D gating 3개 + 구조적 변화 대응). 브라우저 verify: +5 스크립트, +16 assertion
- 신규 ADR: `docs/decisions/20260416-engine-factory-no-op.md`

## 메모리 갱신

- `project_p4_contract.md`는 본 회고 작성 시점 **archived** 상태. P5 진입 시 신규 contract 작성.
- P4-C 실기기 측정은 `docs/reports/p4c-mobile-실기기-YYYYMMDD.md` 경로로 향후 별도 보고.
