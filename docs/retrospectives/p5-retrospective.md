# P5 마일스톤 회고 — 일반상대론 + 중력렌즈 + 실기기 + 측정 도구

작성: 2026-04-17
대상 마일스톤: P5-A / P5-B / P5-C / P5-D / P5-E
릴리스: [v0.5.0](https://github.com/coseo12/astro-simulator/releases/tag/v0.5.0)
관련 PR: #181(P5-E) · #182(P5-B) · #183(P5-A) · #184(P5-C) · #185(P5-D)

## 달성도 (스프린트 계약 대비)

| 마일스톤            | 계약 기준                                  | 달성 | 실측                                        |
| ------------------- | ------------------------------------------ | ---- | ------------------------------------------- |
| P5-E bench baseline | v0.4.0 태그에 bench 스냅샷 + 비교 스크립트 | ✅   | `baseline-v0.4.0.json` + `--compare` 기능   |
| P5-B 실기기 iPhone  | N=200 60fps, N=10000 크래시 없음           | ✅   | 60fps / 40~50fps (iPhone 12 mini A14)       |
| P5-A 일반상대론     | 수성 근일점 43″/century ±5%                | ✅   | **41.46″** (오차 3.5%)                      |
| P5-C shader 세분화  | force/integrator 별 GPU ms 분리            | ✅   | `readShaderTimings()` API + bench 컬럼      |
| P5-D 중력렌즈       | 블랙홀 근처 광선 휘어짐 시각적 관찰 가능   | ✅   | 궤도선 왜곡 + Einstein ring + event horizon |

## 잘 된 것

1. **물리 검증의 해석적 기준** — P5-A에서 수성 근일점 세차의 이론치(42.98″)를 직접 비교 대상으로 사용. 100년(415 궤도) 시뮬 후 41.46″를 얻어 ±3.5% 오차 — 순수 수치 검증. "맞는지 모르는 결과"가 아닌 "틀리면 왜 틀린지 바로 보이는" 구조.

2. **WGSL uniform control flow 제약 즉시 해결** — P5-D에서 `textureSample`이 if 분기 안에서 호출 불가한 WGSL 제약을 발견 → `step()/mix()` branchless 패턴으로 1회 수정에 해결. shader compilation 에러를 console에서 직접 캡처해 원인 특정이 빨랐다.

3. **기존 인프라 재사용** — P5-A는 `orbitalStateAt`(state-vector.ts)가 이미 존재해 중복 작성을 피함. P5-C는 P4-D의 EngineInstrumentation 위에 `enableGPUTimingMeasurements`만 추가. P5-B는 store에 이미 있던 fps 필드를 HUD로 연결만.

4. **실기기 즉시 측정** — P5-B에서 `next.config.mjs` `allowedDevOrigins` 한 줄 추가로 iPhone Wi-Fi 접근 해결. 실기기 결과(60fps, WebGPU 미지원 폴백)를 바로 리포트에 기록.

5. **타임박스 대폭 단축** — 12~16 영업일 예상 대비 **1일 내 5 서브 완료**. P4 세션과 합산하면 2일 내 P4+P5(10 서브마일스톤 + 2 릴리스). 원인: URL 옵트인 패턴 재사용, ADR/bench 인프라 누적 효과, 실측 우선 접근.

## 어려웠던 것

1. **Babylon WebGPU PostProcess WGSL 규약 미문서화** — Babylon의 내장 pass shader(`ShadersWGSL/pass.fragment.js`)를 역공학해서 `varying vUV: vec2f` 선언이 필수임을 발견. 공식 문서에 WGSL PostProcess 작성법이 없어 시행착오 3회(GLSL 시도 → 중복 선언 제거 → WGSL 전환 → varying 누락 → uniform control flow). 총 ~30분 소요.

2. **WebGPU `textureSample` uniform control flow 제약** — GLSL에서는 if 분기 안 `texture2D`가 자유롭지만 WGSL에서는 불가. GPU 파이프라인의 파생(derivative) 연산이 non-uniform 분기에서 정의되지 않기 때문. `step()/mix()` branchless 패턴은 성능에도 유리하지만 가독성이 떨어짐.

3. **iPhone 12 mini WebGPU 미지원** — iOS 26.3.1에서도 A14 Bionic은 `navigator.gpu` 미노출. WebGPU는 A15(iPhone 13)+ 전용으로 추정. P5-B DoD의 "WebGPU 경로 활성 확인"은 하드웨어 제약으로 미충족 — 폴백 정상 동작으로 대체.

4. **agent-browser 세션 불안정** — 장시간 세션에서 `Resource temporarily unavailable (os error 35)` 에러 발생. Playwright 직접 호출로 우회. agent-browser의 daemon 리소스 관리 한계.

5. **`stateVectorAt` 중복 작성** — `physics/kepler.ts`에 새로 작성한 후 `physics/state-vector.ts`에 동일 함수(`orbitalStateAt`)가 이미 존재함을 발견. 기존 코드베이스 탐색 부족. P4-A에서도 사용된 함수라 빨리 발견했어야 함.

## 다음 인계

### P6 후보

1. **중력렌즈 고도화** — 현재 화면 공간 근사 → 3D geodesic ray tracing. accretion disk 시각화. 블랙홀 그림자(shadow) 정확도 향상.
2. **다체 GR (EIH 1PN)** — 현재 태양 중심 근사 → 행성 간 1PN 상호작용. 정밀도 ±1%.
3. **시뮬 시나리오 프리셋** — "수성 세차 관측", "중력렌즈 데모", "소행성대 N-body" 등 원클릭 프리셋.
4. **배포 최적화** — Vercel/Cloudflare Pages 배포. WASM 번들 최적화. lighthouse 점수.
5. **멀티플레이어/공유** — URL state 공유 (현재 URL 파라미터 기반이라 이미 부분 지원).

### 회고 → 가드 제도화

- [x] **WGSL branchless 패턴 규약** — Babylon WGSL PostProcess에서 `textureSample`은 분기 밖에서만 호출. `step()/mix()` 사용. 본 회고에 기록.
- [x] **Babylon WGSL PostProcess 선언 순서** — `varying vUV: vec2f` → `var sampler` → `var texture` → `uniform` 순. pass shader 역공학 결과.
- [x] **실기기 측정 절차** — `allowedDevOrigins` + `?fps=1` + Wi-Fi 접근. P5-B에서 확립.
- [ ] **iPhone A15+ WebGPU 재측정** — A14에서 미지원 확인. A15 실기기 확보 시 재측정.
- [ ] **stateVectorAt 중복 방지** — 신규 함수 작성 전 `grep` 또는 Agent(Explore)로 기존 유사 함수 존재 여부 확인 의무화.

### 데이터 / 구조 변화 요약

- 신규 Rust API: `NBodySystem.enable_gr` + `apply_gr_correction()` (1PN Schwarzschild)
- 신규 WASM 바인딩: `set_gr()/gr_enabled()`
- 신규 TS API: `NBodyEngineOptions.enableGR`, `WebGpuNBodyEngine.readShaderTimings()`
- 신규 PostProcess: `gravitational-lensing.ts` (dual WGSL/GLSL)
- 신규 HUD: fps 카운터 (`?fps=1`)
- 신규 URL 파라미터: `?gr=1`, `?bh=1&bhx=N&bhy=N&bhz=N`, `?fps=1`
- ADR 2건: `20260417-general-relativity-1pn.md`, `20260417-gravitational-lensing-pipeline.md`
- 실기기 리포트: `docs/reports/p4c-mobile-실기기-20260417.md`
- bench baseline: `baseline-v0.4.0.json` + `--compare` 기능

## 메모리 갱신

- `project_p5_contract.md`는 본 회고 작성 시점 **archived** 상태. P6 진입 시 신규 contract 작성.
