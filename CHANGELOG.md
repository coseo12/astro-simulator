# 변경 이력

모든 중요한 변경사항은 이 파일에 기록된다.
Semantic Versioning을 따른다.

## [0.6.0-p6] — 2026-04-17

### P6 물리 심화 — 중력렌즈 고도화 + EIH 1PN 다체

**P6-A Schwarzschild geodesic RK4 솔버** (#194)

- `packages/physics-wasm/src/geodesic.rs` 신규 — 광선 1차 ODE `d²u/dφ² + u = 3M·u²` + 단순 RK4 + r-기반 step
- `GeodesicOutcome::{Escaped, Captured}` 분류, invariant 보존 측정
- 단위 테스트: weak-field b=50 Rs deflection rel_err **3.52%**, strong-field b=3 Rs rel_err **0.05%** (Iyer-Petters 2007 기준)
- invariant drift **~1e-14** (한계 1e-4, 10¹⁰ 배 여유)
- ADR: `docs/decisions/20260417-geodesic-solver.md`

**P6-B accretion disk + LUT shadow (D' 변형)** (#195)

- WASM bindgen `build_lensing_lut(samples) -> Vec<f32>` 신규 (flat `[outcome, deflection] × samples`)
- 신규 PostProcess `packages/core/src/scene/black-hole-rendering.ts` (WGSL/GLSL 듀얼)
- URL `?bh=2` 옵트인 (P5-D `?bh=1` 보존)
- 5 UI 파라미터 슬라이더 (Inner/Outer/Eccentricity/Thickness/Tilt)
- ADR D' 변형 박제 — 원안 3D ray construction → 화면공간 b/Rs + LUT (Babylon invViewProj 이슈로 후퇴, 3D 복원은 #196 후속)
- 알파 채널 fix (신규 원인 #4 식별): `vec4f(result.rgb, 1.0)` WGSL/GLSL 일관 — P5-D는 우연히 회피했던 패턴
- ADR 2건: `20260417-accretion-disk-shadow-pipeline.md`, `20260417-gravitational-lensing-pipeline.md` (P5-D Superseded)

**P6-C EIH 1PN 다체** (#197)

- `GrMode` enum (Off / Single1PN / EIH1PN) — 동시 활성 모순 차단
- WASM `set_gr_mode(u8)` 신규 + `set_gr(bool)` 호환 wrapper 보존
- `nbody.rs` 인라인 EIH 가속도 (Will eq. 6.80, harmonic gauge)
- URL: `?gr=eih` 신규 + `?gr=1`/`?gr=1pn` 호환 + `?gr=invalid` → off + warn
- 단위 테스트: 2체 한계 동치, 9체 100년 drift < 1e-6/orbit
- ADR: `docs/decisions/20260417-eih-1pn-multibody.md`

**P6-D 행성 근일점 ±5% 검증** (#198)

- `measure_perihelion_precession_eih(name, mass, a, e, period, expected, tol_pct)` 헬퍼 추출 (수성 하드코딩 → 일반화)
- **수성 42.59″** (rel_err 0.90%), **금성 8.67″** (rel_err 0.63%), **지구 3.74″** (rel_err 2.48%) — 모두 ±5%
- dt=2.5s 5단계 폴백 (60s → 30s → 15s → 7.5s → 5s → 2.5s) 끝에 통과 — RK4 정밀도 한계
- 수성 41.46″/century Single 모드 회귀 가드 무수정 보존
- ADR: `docs/decisions/20260417-perihelion-verification.md` (Park 2017 인용)

**P6-E bench + ADR + 회고 + 중복 방지 가드** (#200)

- `scripts/bench-p6e.mjs` — geodesic_ms sweep {64/256/1024} + eih_1pn_ms (N=9, 1000 step 평균)
- 실측: geodesic 7.78/30.88/121.32 ms, eih_1pn 0.0042 ms/step
- `scripts/check-duplicate-functions.mjs` + pre-commit + CI warn-only — P5 회고 `stateVectorAt` 중복 교훈 도구화
- 정규화 토큰 교집합 ≥ 2 + 도메인 stop list + 회귀 픽스처 13/13
- ADR: `docs/decisions/20260417-duplicate-function-guard.md`
- 회고: `docs/retrospectives/p6-retrospective.md`

### 후속 추적

- **#196** — 트랙 B 3D ray construction (invViewProj) + `?bh=2` silent failure 디버깅
- **#199** — `long-term-drift.test.ts` 5s timeout 선재 (P6-E 회귀 아님, 타임아웃 완화 후보)

## [0.5.0-p5] — 2026-04-17

### P5 일반상대론 + 중력렌즈 + 실기기 + 측정 도구

**P5-E bench baseline** (#181)

- v0.4.0 bench 결과 스냅샷 (`baseline-v0.4.0.json`)
- `bench:scene:set-baseline --compare <tag>` 비교 기능

**P5-B 실기기 iPhone 측정** (#182)

- iPhone 12 mini (A14/iOS 26.3.1) 직접 측정: N=200 **60fps**, N=10000 **40~50fps** 크래시 없음
- fps HUD 카운터 (`?fps=1` URL 옵트인) — SimulationCore에서 `engine.getFps()` 0.5초 emit
- WebGPU 미지원 (A14) → WebGL2 폴백 정상
- `next.config.mjs` allowedDevOrigins 추가

**P5-A 일반상대론** (#183)

- Rust NBodySystem에 1PN Schwarzschild 세차 보정항: `a_GR = (GM/(c²r³))[(4GM/r - v²)r + 4(r·v)v]`
- 수성 근일점 세차 **41.46″/century** (이론 42.98″, 오차 3.5%, DoD ±5% 충족)
- WASM `set_gr()/gr_enabled()` + TS `NBodyEngineOptions.enableGR` + URL `?gr=1`
- ADR: `docs/decisions/20260417-general-relativity-1pn.md`

**P5-C GPU compute shader별 세분화** (#184)

- `ComputeShader.gpuTimeInFrame: WebGPUPerfCounter`로 force/integrator 분리 측정
- `WebGpuNBodyEngine.readShaderTimings()` → `{forceMs, integratorMs}`
- `engine.enableGPUTimingMeasurements = true` 활성
- bench에 force_ms/integrator_ms 컬럼 + `window.__gpuShaderTimings` 노출

**P5-D 중력렌즈 시각화** (#185)

- Schwarzschild 블랙홀 PostProcess WGSL fragment shader
- 궤도선 왜곡 + Einstein ring (파란 글로우) + event horizon 흑색
- dual shader path (WGSL for WebGPU, GLSL for WebGL2)
- URL `?bh=1&bhx=N&bhy=N&bhz=N` 옵트인
- WGSL `textureSample` uniform control flow 제약 → branchless `step()/mix()` 해결
- ADR: `docs/decisions/20260417-gravitational-lensing-pipeline.md`

## [0.4.0-p4] — 2026-04-16

### P4 WebGPU 실측 + 모바일 1차 게이트

**P4-B WebGPU 활성 회귀 가드** (#168)

- EngineFactory 전환 **NO-OP** 결정 — `docs/decisions/20260416-engine-factory-no-op.md`
- `scripts/browser-verify-webgpu.mjs` 신규 — HUD `renderer · webgpu` assert, capability notice 미표시, reload 후 경로 유지 (5/5 통과)
- `--enable-unsafe-webgpu` 외 flag 명시 — 헤드리스 기본값 의존 제거

**P4-D GPU frame time 직접 측정** (#169)

- `SimulationCore.enableGpuTimer()` / `readGpuFrameTimeMs()` / `debugGpuTimer()` 공개 API
- `EngineInstrumentation.gpuFrameTimeCounter` 기반 ms 단위 측정 (lastSecAverage → average → current 폴백)
- `?gpuTimer=1` URL 옵트인 시 `window.__gpuFrameTimeMs` getter 노출
- `engine-factory.ts` — WebGPUEngine 생성 시 `timestamp-query` feature optional 요청
- `scripts/bench-webgpu.mjs` — GPU ms 컬럼 + `--enable-webgpu-developer-features` flag 추가

**P4-A 소행성대 N-body 편입** (#170)

- `?beltNbody=1` URL 옵트인 — 소행성대를 N-body 엔진에 편입
- **실측 WebGPU 226× @ N=5000, 286× @ N=10000** (vs barnes-hut CPU)
- `AsteroidBeltHandles.getNbodyState()` / `writeWorldPositions()` 추가
- `scripts/browser-verify-belt-nbody.mjs` — 3단계 회귀 가드 (6/6 통과)
- bench throughput ≥ 2× assertion 추가 (exit 1 on fail)

**P4-C 모바일 1차 게이트** (#171)

- `scripts/browser-verify-mobile-p4c.mjs` — iPhone 14 emulation 3 시나리오 (5/5 통과)
- 결과 리포트 자동 생성 (`docs/reports/p4c-mobile-YYYYMMDD.md`)
- 실기기 iPhone Safari 측정은 인계 (iOS 17.4+ WebGPU)

**회고** (#172)

- `docs/retrospectives/p4-retrospective.md` — 고정 4섹션
- P4-E(일반상대론) P5로 분리

### 수치 변화

- bench: WebGPU/BH = **0.45×(P3) → 226×(P4)** (소행성대 N-body 편입으로 가속 실제 측정 가능)
- 테스트: 287 → 290+ (GPU timer + state vector 가드 추가)
- 회귀 스크립트: +3종 (`verify:webgpu`, `verify:belt-nbody`, `verify:mobile-p4c`)

## [0.3.0-p3] — 2026-04-15

### P3 Barnes-Hut + WebGPU compute

**P3-0 준비**

- WebGPU 감지 + 자동 폴백 (`detectGpuCapability`, HUD dismissible notice) (#124)
- `bench:scene:sweep` N=5000/10000 확장 + CI bench 워크플로 timeout 30분 (#125)
- Engine selector 4-mode 확장 (`kepler|newton|barnes-hut|webgpu|auto`) (#126)

**P3-A Barnes-Hut (Rust/CPU)**

- Octree 데이터 구조 — flat `Vec<Node>`, leaf cap=1, MAX_DEPTH=24 (#130)
- COM + Salmon-Warren MAC tree-walk force (theta=0.5 max err **4.99e-9**) (#131)
- WASM `BarnesHutEngine` 노출 + Velocity-Verlet 통합 (#132)
- 1년 시뮬 정확도 검증 — Newton 직접합 대비 P3 계약 1e-3의 6 자릿수 여유 (#133)
- UI 활성화 + auto 모드 라우팅 (belt N≥1000 → barnes-hut) (#134)

**P3-B WebGPU compute**

- WebGPU compute 인프라 — `GpuComputeContext`, `GpuFloat32Buffer`, WGSL helpers (#143)
- N-body force WGSL shader — `workgroup_size=64` tiled algorithm (#144)
- V-V 적분 ADR + WGSL shader (`docs/decisions/20260415-webgpu-integration-scheme.md`, B 스킴 GPU-resident) (#145)
- `WebGpuNBodyEngine` JS 어댑터 + scene 라우팅 + UI 활성화 (capability 자동 폴백) (#146)
- 정확도 가드 + `bench:webgpu` 측정 도구 + p3b-perf.md (#147)

**P3-D 검증·마감**

- vsync 해제 throughput 측정 (`--disable-gpu-vsync` flag) — 가속비 측정 한계 박제 (#154)
- 종합 회귀 검증 287/287 통과 (Rust 22 + vitest 211 + browser-verify 54) (#155)
- v0.3.0 릴리스 (#156)

**아키텍처/데이터:**

- 신규 패키지 모듈: `packages/core/src/gpu/` (compute-context / buffer / wgsl-helpers / nbody-force-shader / nbody-vv-shader / capability)
- 신규 엔진: `BarnesHutNBodyEngine` (CPU/wasm) + `WebGpuNBodyEngine` (GPU)
- `PhysicsEngineKind`: `kepler|newton|barnes-hut|webgpu|auto` 5-mode
- harness v2.2.0 → v2.3.0 적용 (신규 페르소나 커맨드 7종 + ADR/회고 디렉토리)

**Known Issues / 인계:**

- WebGPU 가속비 측정 환경 한계: 헤드리스 Chromium ANGLE Metal에서 Babylon이 WebGL2 fallback 사용. webgpu URL은 capability 폴백으로 barnes-hut 라우팅. 실 측정은 데스크톱 Chrome Canary 또는 Babylon `useWebGPU: true` 명시 필요.
- 소행성대가 Kepler 해석해 + ThinInstances 렌더로 처리됨 — N-body 엔진 입력은 ~10 bodies. 'CPU 대비 webgpu ≥2× 가속'은 소행성대 N-body 통합(P4 후보) 후 재측정.
- WGSL f32 한정 정밀도 — 행성 SI 좌표(~1e11 m)에서 ~10km 단위 손실. 정밀 시뮬은 CPU 경로(`NBodySystem` f64) 사용.

**문서:**

- `docs/decisions/20260415-webgpu-integration-scheme.md` (ADR)
- `docs/benchmarks/p3a-barnes-hut-accuracy.md`, `p3a-perf.md`, `p3b-perf.md`, `p3d-comprehensive-verify.md`
- `docs/retrospectives/harness-update-2.2.0-retrospective.md` (P3 진행 중 회고)

## [0.2.0-p2] — 2026-04-15

### P2 태양계 확장 + Newton N-body

**P2-0 준비**

- PR 템플릿 브라우저 3단계 검증 필수 섹션 (#74)
- `verify:test-coverage` 워크스페이스 Vitest 가드 (#75)
- `updateAt` 프레임당 Map 재할당 제거 (#76)
- orbit 라인 LineSystem 통합 — draw call 9→1 (#77)
- `bench:scene` 자동 벤치 + baseline diff (#78)

**P2-A Newton N-body**

- `@astro-simulator/physics-wasm` 신규 크레이트 — Rust 1.94.1 + wasm-pack 0.14 (#84)
- Velocity-Verlet(Leapfrog) 적분기 — 1000년 에너지 드리프트 2.4e-9 (#85)
- WASM ↔ TS 바인딩 `NBodyEngine` + 씬 통합 (#86)
- Kepler 대비 정확도 검증: dt=10min 모든 행성 < 0.1% 오차 (#87)
- 시간 역행 대칭성 < 1e-9 상대 오차 (#88)
- Kepler↔Newton UI 토글 + URL `?engine=newton` (#89)

**P2-B 소천체 + 시각 스케일**

- 왜소행성 5개 (Ceres/Pluto/Haumea/Makemake/Eris) (#97)
- 혜성 3개 (Halley/Encke/Swift-Tuttle) (#98)
- 소행성대 ThinInstances `?belt=N` N=100~1000 (#99)
- 거리-의존 per-body 시각 스케일 — P1 Moon 버그 해결 (#100)

**P2-C 파라미터 + 북마크**

- 선택 천체 질량 슬라이더 0.1~10× (Newton 런타임 반영) (#107)
- 시간 포함 URL 북마크 버튼 (#108)
- "만약에" 프리셋 3종: jupiter-x10 / no-jupiter / sun-half (#109)

**P2-D 검증·마감**

- 장기 안정성: 9체 100년 드리프트 1.5e-10 (#115)
- 실 GPU(Apple M1 Pro): N=1000 소행성대에서 120 fps 달성 (#116)
- a11y 재검증 + MassSlider aria-label / Canvas tabindex 수정 (#117)

**아키텍처/데이터:**

- 바디 10 → **18** (sun + 8행성 + moon + 왜소행성 5 + 혜성 3)
- `NBodyEngine` 래퍼: `buildInitialState` + `advance(dtSeconds)` + 역행
- scene 옵션: `physicsEngine`, `asteroidBeltN`, `setBodyMassMultiplier`

**테스트 증분:** P1 139 → **P2 187 PASS** (core 128 + apps/web 54 + shared 4 + physics-wasm 1)

**성능:**

- 헤드리스 fps 감소(콘텐츠 추가 반영분, -16~20%)
- 실 GPU에서 N=1000까지 120fps vsync cap 도달

**알려진 제약:**

- 소행성대는 Kepler 전용 — Newton 합류 시 O(N²) 폭발. P3 GPU compute에서 재검토
- macOS Chromium만 실 GPU 측정 — Linux/Windows/모바일은 P3 후속
- 혜성 비중력 효과(태양풍) 미반영 — ±2% 정확도 한계
- 질량 변경 후 시간 역행으로 원 상태 복원 불가 — 프리셋 원복으로 암묵 리셋

## [0.1.0-p1] — 2026-04-14

### P1 태양계 MVP

**신규 기능:**

- 태양 + 행성 8개 + 달, J2000.0 기준 Kepler 궤도 해석해
- 시간 컨트롤 (재생/일시정지/역행, 6 프리셋 1s~10y)
- 카메라 포커스 전환 애니메이션 (300ms ease-out)
- 4모드 UI 프레임 (관찰/연구 활성, 교육/샌드박스 예약)
- 모드별 사이드 패널 (CelestialTree + CelestialInfoPanel + TierBadge)
- 스케일 컨트롤 (로그 슬라이더 0.01~100 AU)
- DateTimePicker + UnitToggle + URL 상태 동기화
- 국제화 (ko/en)
- 흑체복사 기반 다크 디자인 토큰

**아키텍처:**

- 이중 레이어 — 순수 TS 코어 (`@astro-simulator/core`) + Next.js UI (`apps/web`)
- CPU float64 + GPU RTE float32 좌표계
- Floating Origin (B4) — 10^13m 거리 정밀도 검증
- Logarithmic depth buffer — 근/원 동시 렌더
- WebGPU-first + WebGL2 폴백 (adapter 사전 판별)

**데이터:**

- JPL/Standish 1992 기준 10개 천체 궤도 요소
- Zod 런타임 검증

**테스트:**

- 130개 단위 테스트 (core 89 + shared 4 + web 37)
- Playwright E2E: browser/mobile/scale/perf/a11y 5개 스위트
- JPL 공칭값 대비 궤도 요소/공전주기/거리 경계 ±1% 검증
- axe-core WCAG 2.1 AA 위반 0건
- 색약 시뮬 검증 (protanopia/deuteranopia/tritanopia)

**성능 (Playwright headless):**

- 정지/재생 36~38 FPS
- 포커스 상태 90+ FPS

**알려진 제약:**

- WebGPU 실환경 검증은 수동 (헤드리스 chromium 미지원)
- 행성 시각 크기 × 500 배율로 표시 (실제 크기는 점으로 보이는 문제 회피)
- Moon은 지구 시각 메쉬 내부에 위치 (per-body 스케일은 P2)
- 로그 시간 스크러버는 P2로 연기
- 시각 북마크(스냅샷 URL)는 P2로 연기

### 변경

- 해당 없음 (초기 릴리스)

### 수정

- Next 16 `middleware` → `proxy` 파일 컨벤션 대응 (PR #53)
- WebGPU 초기화 실패 시 Babylon 내부 console.error 오염 제거 (PR #54)
- URL 상태 동기화 무한 루프 방지 (PR #67)
