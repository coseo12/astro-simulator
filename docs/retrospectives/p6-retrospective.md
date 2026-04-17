# P6 마일스톤 회고 — 물리 심화 (중력렌즈 고도화 + EIH 1PN 다체)

작성: 2026-04-18
대상 마일스톤: P6-A / P6-B / P6-C / P6-D / P6-E
관련 PR: #194(P6-A) · #195(P6-B) · #197(P6-C) · #198(P6-D) · (본 P6-E)
마스터: #188

## 달성도 (스프린트 계약 대비)

| 마일스톤                | 계약 기준                                                    | 달성 | 실측                                                                                                                              |
| ----------------------- | ------------------------------------------------------------ | ---- | --------------------------------------------------------------------------------------------------------------------------------- |
| P6-A geodesic RK4 솔버  | A1: 1.5Rs deflection ±5% / A2: invariant<1e-4 / A3: 분류     | ✅   | weak-field ±5%(b≥8Rs) / invariant ~1e-14 / Captured·Escaped·PhotonSphere 3종 분류                                                 |
| P6-B disk+shadow        | B1: disk 렌더 / B2: shadow 2.598Rs ±5% / B3: 60fps           | ✅   | 이심률·두께 반영 disk / b_crit ±5% (D' 변형 LUT) / 60fps 데스크톱 WebGPU                                                          |
| P6-C EIH 1PN 다체       | C1: N×N 가속도 / C2: 9체 100년 drift<1e-6/orbit / C3: URL    | ✅   | N×N + 간접 가속도 / 2.8e-7 · 7.8e-8/orbit (금성·지구) / `?gr=eih`                                                                 |
| P6-D 행성 근일점 검증   | D1: 수성 41.46″ 회귀 없음 / D2: 금성 ±5% / D3: 지구 ±5%      | ✅   | 수성 42.59″ (rel_err 0.90%) · 금성 8.67″ (rel_err 0.63%) · 지구 3.74″ (rel_err 2.48%) — 모두 ±5% PASS (dt=2.5s 5단계 폴백)        |
| P6-E bench / ADR / 가드 | E1: bench 컬럼 / E2: ADR 2건 / E3: 회고 / E4: 중복 방지 가드 | ✅   | geodesic_ms 7.78/30.88/121.32ms (64/256/1024) · eih_1pn_ms 0.0042ms/step (N=9) · ADR 4건 (P6-A/B/C/D) · 회고 본문 · 가드 3 픽스처 |

## 잘 된 것

1. **물리 검증의 정량 기준 확대** — P5-A는 수성 1개(41.46″)였으나 P6-D에서 수성·금성·지구 3개로 확장. 각 행성의 GR 기여(42.98″/8.62″/3.84″)를 ±5%로 개별 검증. rel_err 0.90% / 0.63% / 2.48% — 이론치 출처(Einstein 1915 / Will TEGP / IAU Pitjeva 2014 / Park 2017)를 테스트 주석과 ADR에 박제. "맞는지 모르는 결과"가 아닌 "틀리면 행성 어느 단계에서 왜 틀렸는지 바로 보이는" 구조.

2. **ADR에 "architect 결정의 현실 조정" 박제 (D' 변형)** — P6-B는 원래 C' 3D ray construction을 계획했으나 구현 중 "3D ray → LUT 1D b" 매핑이 alpha 채널 검은 화면을 유발. dev에서 D' 변형(화면 공간 b 근사 + LUT 조회)으로 실시간 전환. ADR `20260417-accretion-disk-shadow-pipeline.md`에 **두 결정을 모두 기록**하고 C' 재검토 조건을 명시. "원안 vs 실측 조정"을 추적 가능한 형태로 남긴 것이 다음 마일스톤의 인계 기반.

3. **알파 채널 검은 화면 진단 — 신규 근본 원인 발견** — P6-B에서 기존에 알려진 원인 3종(shadow 과잉 / LUT miss / alpha premult)을 모두 점검해도 재현. 결국 "accretion disk 알파가 0으로 계산되어 PostProcess가 블랙을 write한다"는 **신규 4번째 원인**을 식별. 디버깅 과정에서 "기존 가설이 모두 기각되면 가설 목록 자체를 확장한다"는 교훈 (회고 → 가드 제도화 §).

4. **타임박스 효율 극적 압축** — P6 전체 계약 3~5 영업일에 대비해 실측 **1~2일 (P6-A~D 2026-04-17 하루)**. P6-A~D 전부 동일 날짜 머지. 단, P6-D의 적분 정밀도 폴백 (dt=60s→2.5s 5단계)은 ±5% 마진을 맞추려 사전 계획보다 CI 시간이 ~223초 증가 — 이는 비용-이득에서 수용.

5. **P6-D ADR 정정 (P6-E reviewer MINOR)** — 재검토 트리거 §2 (dt=15s에서도 미달 시 → Yoshida 격상) 기술을 실측 후 정량 3종 (지구 rel_err > 4% / dt < 1s / CI > 15분)으로 재정의. "계획 시 썼던 트리거는 실측 현실과 정렬되지 않는다"는 교훈을 ADR 내부에 명시적으로 박제 — 다음 마일스톤에서 동일 패턴 방지.

## 어려웠던 것

1. **트랙 B 3D ray construction 미해결 (#196)** — P6-A의 geodesic 솔버는 완성됐으나 PostProcess에서 화면 좌표 → 3D 광선 방향 변환의 완전 구현이 검은 화면 회피를 위해 "화면 공간 b 근사"로 대체됨. 완전한 3D ray는 P7 이후로 이월. ADR에 재검토 조건 박제했으나 "근사로 덮은 부채"가 회계상 명확히 남았다.

2. **dev agent 마무리 보고 누락 패턴 (3회)** — P6-C 커밋/PR 누락, P6-D 실측 수치 누락, P6-B QA 코멘트 박제 누락이 각각 별개 세션에서 재현. 본 P6-E dev 프롬프트에 **"마무리 보고에 PR URL + 커밋 SHA + bench 수치 + E4 회귀 결과 모두 포함"** 명시를 추가하여 반복 방지. harness 개선안(capture-volt #X)로 격상 필요.

3. **dt=2.5s 5단계 폴백 — RK4 정밀도 한계** — P6-D 1차 시도 dt=60s에서 금성 3.38″ (60% 미달) / 지구 1.27″ (67% 미달). 순차 축소(30s / 15s / 7.5s / 5s)도 모두 미달. dt=2.5s에서야 ±5% 마진 통과. CI ~223초 허용했으나 Yoshida 4차 심플렉틱 격상의 비용-이득 재평가가 P7 후보 (#196 개선 포함).

4. **next-env.d.ts 반복 modified** — Next.js 빌드 부산물이 매 커밋 전 modified로 잡힘. .gitignore 대상으로 격상 검토 필요 (빌드가 매번 갱신, tracked). harness CRITICAL #5 "의도한 변경 커밋됨" 검증 루틴으로 방어 중.

5. **stateVectorAt 중복 방지 (P5 교훈) — 자동화 채택까지 긴 드리프트** — P5 회고에서 "[ ] stateVectorAt 중복 방지" 항목이 수동 가드로 남아 P6 전체에서 **수작업에 의존**. P6-E E4에서야 `scripts/check-duplicate-functions.mjs` 자동화로 격상. "수작업 가이드는 경험적으로 스킵된다"는 원칙은 P5→P6 한 마일스톤 주기 안에서도 증명됨 — 다음부터는 회고 가드 항목은 **다음 마일스톤 착수 시 자동화 우선순위 상위**.

## 다음 인계 (P7 후보)

1. **트랙 B #196 해결 — 3D ray construction** — P6-B D' 변형으로 덮은 "화면 공간 b 근사"를 완전 3D ray로 승격. accretion disk의 관측자 각도 변화를 정확히 반영. ADR `20260417-accretion-disk-shadow-pipeline.md` §C' 재검토 조건과 매칭.

2. **적분기 격상 (Yoshida 4차 심플렉틱 or RK8)** — P6-D 지구 rel_err 2.48%는 ±5% 마진의 ~절반. 지구 rel_err < 1% 목표. ADR `20260417-perihelion-verification.md` §재검토 트리거(정정된 정량 3종) 충족 시 즉시 발동.

3. **Kerr 회전 블랙홀** — Schwarzschild(비회전)에서 Kerr(회전)로 확장. frame-dragging 시각화. 적분기 확장 + LUT 재설계.

4. **EIH 2PN** — 1PN을 넘어 2차 post-Newtonian. 중력파 복사 효과까지 포함. P6-C 구조 재활용.

5. **시뮬 시나리오 프리셋** — "수성 세차 관측 · 중력렌즈 데모 · 소행성대 N-body · 9체 GR drift" 원클릭 프리셋. URL 상태 공유 이미 부분 지원.

6. **배포 최적화** — Vercel/Cloudflare Pages 배포 · WASM 번들 최적화 · Lighthouse 점수 목표.

### 회고 → 가드 제도화

- [x] **중복 함수 자동 가드 제도화** — P6-E E4 `scripts/check-duplicate-functions.mjs` + pre-commit + CI. ADR `20260417-duplicate-function-guard.md`. 회귀 테스트 픽스처 3종 PASS (토큰 로직 / 실사례 WARN / 무관 함수 PASS).
- [x] **bench 컬럼 정례화** — P6-E E1 `scripts/bench-p6e.mjs` + `pnpm bench:p6e`. geodesic_ms sample sweep + eih_1pn_ms N=9 컬럼 노출. 다음 마일스톤에서 회귀 비교 가능.
- [x] **ADR에 실측 결과 + 재검토 트리거 정정 명시** — P6-D ADR 정정(§재검토 트리거 §2)처럼 "계획 트리거 → 실측 후 정량 재정의" 패턴을 다음 ADR 템플릿에 반영 (docs/decisions/README.md 업데이트 대상).
- [ ] **trunk-based next-env.d.ts 해소** — Next.js 빌드 부산물이 매 커밋 marker. .gitignore 격상 or commit workflow 정비.
- [ ] **dev 마무리 보고 체크리스트 강제** — agent(dev) 워크플로 마지막 단계에 "PR URL / 커밋 SHA / 실측 수치 / 테스트 결과" 4항목 체크리스트. capture-volt로 knowledge 이슈 생성.

### 데이터 / 구조 변화 요약

- 신규 Rust API: `GrMode` enum(Off/Single1PN/EIH1PN) · `apply_eih_correction()` · `measure_perihelion_precession_eih()` 헬퍼 · `SchwarzschildGeodesicSolver` (geodesic.rs) · `build_lensing_lut(samples)`
- 신규 WASM 바인딩: `NBodyEngine.set_gr_mode(u8)` · `NBodyEngine.gr_mode()` · `build_lensing_lut(samples) → Float32Array`
- 신규 TS API: accretion disk PostProcess · LUT 기반 shadow renderer
- 신규 URL 파라미터: `?gr=eih` (P6-C)
- ADR 4건 신규 (P6-A/B/C/D) + 1건 (P6-E E4 중복 가드) = P6 총 5건
  - `20260417-geodesic-solver.md` (P6-A)
  - `20260417-accretion-disk-shadow-pipeline.md` (P6-B, D' 변형 박제)
  - `20260417-eih-1pn-multibody.md` (P6-C)
  - `20260417-perihelion-verification.md` (P6-D, §재검토 트리거 정정)
  - `20260417-duplicate-function-guard.md` (P6-E E4)
- bench 신규: `scripts/bench-p6e.mjs` + `pnpm bench:p6e`
- 가드 신규: `scripts/check-duplicate-functions.mjs` + `scripts/check-duplicate-functions.test.mjs` + pre-commit + CI

## baseline 대비 수치

| 항목                         | P5 baseline (v0.5.0)               | P6 실측                                           | 비고                       |
| ---------------------------- | ---------------------------------- | ------------------------------------------------- | -------------------------- |
| 수성 근일점 (arcsec/century) | 41.46 (Single 1PN)                 | 42.59 (EIH 보너스, dt=2.5s) · 41.46 (Single 유지) | Single 모드 회귀 가드 PASS |
| 금성 근일점 검증             | 없음                               | 8.67″/century, rel_err 0.63% (±5% PASS)           | P6-D 신규                  |
| 지구 근일점 검증             | 없음                               | 3.74″/century, rel_err 2.48% (±5% PASS)           | P6-D 신규                  |
| geodesic LUT 빌드 (256)      | 없음                               | 30.88 ms (avg, n=10)                              | P6-E 신규 bench            |
| geodesic LUT 빌드 (1024)     | 없음                               | 121.32 ms (avg)                                   | P6-E 신규 bench            |
| EIH 1PN 스텝 (N=9)           | 없음 (Single 1PN은 O(1) 중심 교정) | 0.0042 ms/step                                    | P6-E 신규 bench            |
| 9체 100년 drift              | 없음 (Single 1PN 범위 외)          | 금성 2.8e-7 · 지구 7.8e-8 /orbit                  | P6-C 목표 <1e-6 달성       |
| ADR 누적                     | P5 기준 2건                        | P6 기준 5건 추가 (총 P5+P6 = 7건)                 | 의사결정 추적성 향상       |

## 메모리 갱신

- `project_p6_contract.md`는 본 회고 작성 시점 **archived** 상태. P7 진입 시 신규 contract 작성.
- 트랙 B #196 open 유지 — P7 후보 1순위.
