# P7 마일스톤 회고 — 적분기·트랙 B·모바일 보강 (Yoshida4 + 3D ray + #209 + #210)

작성: 2026-04-18
대상 마일스톤: P7-A / P7-B / P7-C / P7-D / P7-E
관련 PR: #212(P7-A) · #216(P7-B) · #217(P7-C) · #218(P7-D) · (본 P7-E)
마스터: #211

## 달성도 (스프린트 계약 대비)

| 마일스톤                    | 계약 기준                                                                                             | 달성        | 실측                                                                                                                                                                                                                                                                                                                          |
| --------------------------- | ----------------------------------------------------------------------------------------------------- | ----------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| P7-A Yoshida 4차 심플렉틱   | A1: 계수 ±1e-15 / A2~A4: 기본 물리 / A5: 지구 rel_err ≤ 1.25%                                         | ✅          | Rust `cargo test --release` **37/37 PASS** · 지구 EIH **3c rel_err 1.19%** (이론 3.84″/century, LRL+Newton subtraction, Phase C 개정 측정법) · 수성 0.11% / 금성 1.39% (10c). WASM 번들 delta +0.35 KB gzipped (상한 +2 KB의 17%). CI ~9m15s (11분 임계 여유).                                                                |
| P7-B 적분기 선택 API + URL  | B1: `IntegratorKind` 타입 1:1 / B2: `?integrator` URL 파싱 / B3: HUD 배지                             | ✅          | pnpm test **231/231 PASS** · `parse-integrator` 6 케이스 (verlet 별칭 / 대소문자 / 기본값 / warn 폴백) · HUD 배지 `integrator-badge` · 전역 `window.__simIntegrator` 노출                                                                                                                                                     |
| P7-C 3D ray construction    | C1: `?bh=2&ray3d=1` alpha 회귀 0 / C2: disk major axis 카메라 변화 관찰 / C3: Chrome WebGPU 수동 검증 | ✅ (5차 D') | 채택: **5차 D' 보강** (3차 E disk 실패 후 백업 경로). Chrome WebGPU 수동 PASS · swiftshader headless는 elevation 10°/45°/80° fps>1 구조 게이트만 통과 (`browser-verify-black-hole-ray3d.mjs`) · disk 픽셀 변화는 실 GPU 필요 — README.md 주석 박제                                                                            |
| P7-D 모바일 best-effort     | D1: iPhone 14 emulation `?bh=2` JD 3초 진행 / D2: 적분기 VV↔Yoshida 모바일 회귀 ratio / D3: 알림 UI   | ✅          | pnpm test **235/235 PASS** (신규 4 = engine-notice key 분리) · iPhone 14 emulation JD 35일 진행 실측 · 모바일 bench ratio **1.054** (yoshida/vv, 10% 이내) · `mobile-webgpu-best-effort` key 별도 dismiss                                                                                                                     |
| P7-E 회고·bench·인프라 정비 | E1: bench 컬럼 / E2: ADR 링크 / E3: 회고 4섹션 / E4: P6 가드 + 흡수 4건                               | ✅ (본 PR)  | `integrator_yoshida4_ms` **0.0002ms/step** (VV 0.0001ms/step 대비 **1.59×**) · `track_b_ray3d_frame_ms` 실측 JSON 박제 · p7-retrospective.md (본 문서) · `next-env.d.ts` .gitignore + rm --cached · 흡수: `?gr` 대소문자 정규화 / isMobile iPadOS 강화 (#220) / `__simStore` dev-only (#221) / QA 이관 3건 / #215 ADR §4 갱신 |

## bench 실측 (P7-E E1)

| 컬럼                      | 값                                        | 출처                                               | 비고                                                                                    |
| ------------------------- | ----------------------------------------- | -------------------------------------------------- | --------------------------------------------------------------------------------------- |
| `integrator_yoshida4_ms`  | **0.0002 ms/step** (ratio **1.59×**)      | `docs/benchmarks/p7-2026-04-18T12-53-40-617Z.json` | N=2 Kepler, 1000 step, dt=1h, 50 warmup. VV baseline 0.0001 ms/step. P8+ 회귀 baseline. |
| `track_b_ray3d_frame_ms`  | (PR 시점 실측 — `pnpm bench:p7-lens3d`)   | `docs/benchmarks/p7-lens3d-*.json`                 | Playwright chromium WebGPU (`--use-angle=metal`), ?bh=2&ray3d=1 5s × 10 샘플 + stdev.   |
| `geodesic_ms` (P6-E 유지) | 64: 6.09ms · 256: 24.53ms · 1024: 97.94ms | 동일                                               | LUT 빌드 sample sweep. P6-E baseline 대비 안정.                                         |
| `eih_1pn_ms` (P6-E 유지)  | N=9: 0.0047 ms/step                       | 동일                                               | 태양+8행성 EIH 1PN 1000 step 평균. P6-E 대비 안정.                                      |

### Yoshida4 vs Velocity-Verlet 비용

실측 ratio **1.59×** 는 ADR A8 기준 `3× ± 10%` 범위를 벗어나지만, N=2 Kepler 에서는
Yoshida 3-stage 중 가속도 재계산(`compute_accelerations`)이 Newton 2체 O(1) 이므로 실측상
VV 대비 오버헤드가 축소된 것. EIH 1PN N=9 같은 O(N²) 규모에서는 ADR 예상에 근접(추가 측정
후보, P8 bench 컬럼 확장으로 이관).

## ADR 인벤토리 (P7)

- `docs/decisions/20260418-p7-integrator-upgrade.md` (Accepted 2026-04-18, Phase C 진단 + Reviewer 🟡 + **P7-E #210/#215 §재검토 트리거 §4 갱신**)
- `docs/decisions/20260418-p7-track-b-ray3d.md` (Accepted 2026-04-18, 5차 D' 보강 채택 근거 박제)

## 잘 된 것

1. **교차검증(Gemini)의 가치가 ADR 단계에서 증명** — P7-A Yoshida 계수 식 (Yoshida 1990 eq. 4.3) 검증,
   P7-C disk shadow alpha 회귀 원인(3차 E 실패 후 5차 D' 전환), P7-D 모바일 측정법 (동일 세션 내
   VV→Yoshida 교차 측정)에서 Gemini 피드백이 3회 모두 **구현 방향을 바꿨다**. 단일 모델 편향 노출
   위험이 구현 방향 결정 국면에서 특히 크다는 것을 실증.

2. **sub-agent 순차 디스패치** — P7-A/B/C/D 를 dev/qa 페르소나 sub-agent 로 순차 처리. 각 sub-agent
   가 격리된 컨텍스트로 실행되어 이전 단계 상태 오염을 차단. volt #24 "sub-agent 마무리 박제 누락"
   패턴은 여전히 관찰됐으나, 메인 오케스트레이터가 `git log --oneline -1` / `gh pr list` 로 직접
   확인하는 보완 루틴이 자리잡음.

3. **Phase C 진단 성공 — "EIH structural bias" 가설 기각** — P7-A 지구 rel_err 1.87% (1 century, VV
   LRL 측정법) 가 초기 "EIH 식 구조적 한계" 로 오인. Phase C 에서 Single1PN 대조 실험 + centuries
   수렴 실험으로 **측정법(LRL+Newton subtraction)의 잔차가 저이심률 궤도에서 비선형**임을 식별.
   centuries 확대(3c/10c)로 물리 정확도 우선 채택. ADR §Phase C 진단 섹션에 가설 기각 + 근본 원인 +
   대응 옵션 3개 비교표를 모두 박제 — "원인 파악 전에 dt 축소로 덮는 반사적 반응" 회피.

4. **테스트 증분 합계** — P7 전체 기간 누적 pnpm **225 → 235** (신규 10) · cargo **37 유지** (P7-A 신규
   +18, 기존 19). 각 서브 마일스톤 마다 회귀 가드 테스트가 병행되어 이후 PR 에서 기존 동작 퇴행 0건.

5. **P6 인수인계 "next-env.d.ts 반복 modified" 해소** — P6 회고 §어려웠던 것 #4 항목을 P7-E E4 에서
   `.gitignore` + `git rm --cached apps/web/next-env.d.ts` 로 제도화. volt #13 "커밋 성공 ≠ 의도한
   변경 커밋됨" 규칙과 정렬.

## 어려웠던 것

1. **Phase C 측정법 전환 (LRL + Newton subtraction)** — P7-A 1차 시도에서 지구 1-century EIH 측정이
   rel_err 1.87% (이론 3.84″, 측정 3.77″). dt 축소(60s → 10s)로는 수렴 안 됨. "EIH 식 자체 문제"
   가설을 Gemini 교차검증이 **기각** — Single1PN 대조 실험을 제안받고 동일 deviation (3.7685″)을
   관찰해 측정법 한계임을 확정. 결국 centuries 확대(3c/10c)로 S/N 향상 — 사용자 지시 "물리적
   정확성 목적 — DoD 완화 최후 수단" 에 정합.

2. **5차 D' 채택 (3차 E disk 실패 경로)** — P7-C 3D ray construction 1~2차 접근은 swiftshader
   headless 에서 alpha 채널 검정 회귀를 재현. 3차 E (disk 내부 ray marching) 까지 실패 후 **백업
   경로 5차 D' (화면 공간 b 보강)** 채택. ADR `20260418-p7-track-b-ray3d.md` 에 실패 경로 4개 (1차
   A/B/C, 2차, 3차 E) 모두 "왜 실패했는가" + "다음 시도에서 재검토할 조건" 박제. P6-B D' 변형 → P7-C
   5차 D' 승계로 "근사로 덮은 부채" 가 기록된 형태로 이월 — #219 iOS Safari 실기기 측정과 함께 P14
   배포 후 재검토.

3. **모바일 측정 편차 — headless Chromium iOS emulation 한계** — P7-D 1차에서 Chromium CPU 이슈로
   VV/Yoshida 절대값이 측정 간 ±15% 진동. Gemini 피드백 반영으로 동일 세션 내 VV→Yoshida 순차
   교차 측정으로 전환 → ratio 0.95~1.05 안정. 단 **절대값은 여전히 실기기와 편차 큼** — `#219 iOS
Safari 실기기` 이슈로 분리.

4. **`time-play` silent-fail 대규모 잔존** — P7-B QA 에서 `browser-verify-*.mjs` 15개 스크립트가
   `.catch(() => {})` 로 셀렉터 부재를 삼키는 패턴 발견. 본 P7-E 에서 일괄 정비 — 편집 14개 +
   신규 `browser-verify-utils.mjs` (`pressTimePlay` 유틸). P7-B PR 본체는 JD Δ 간접 증명으로
   독립 통과시킨 덕에 범위 축소 — 그러나 15개 분산 정비가 P7-E PR 변경 파일 수를 부풀림.
   (참고: PR #222 본문 "22개" / 초안 회고 "21개" 는 모두 실측과 불일치 — #224 에서 정정.
   현재 레포 전체는 `browser-verify-*.mjs` 20개로 P7-D `mobile-p7d` 등 후속 추가분 포함.)

5. **sub-agent 마무리 보고 누락 재발 (2회)** — P7-B 커밋 SHA 누락, P7-D prod 번들 검증 누락이 다른
   세션에서 재현. volt #24 명시 박제 이후에도 동일 패턴 — "마무리 체크리스트 JSON 요구" 만으로는
   불충분하고, **메인 오케스트레이터 수동 재확인**이 필수임을 재확인. harness 개선안 후보로 격상.

6. **numeric accuracy — PR 본문/회고 수치 드리프트** — P7-E PR #222 본문(merged)은
   "22개 일괄 정비", 회고 초안(본 파일 직전 revision, 이하 "초안")은 "21개" 로 기록됐으나
   실측은 편집 14개 + 신규 utils 1개 = **15개** (레포 전체는 후속 추가분 포함 20개).
   "대략", "약", 어림 수치 금지. **회고·PR 본문에 개수/비율을 쓸 때는 `ls | wc -l` /
   `git diff --stat` / `grep -c` 등으로 실측 후 기재**한다. #224 로 정정 박제.

## 다음 인계 (P8 후보)

> **P8+ 로드맵 v2 박제 위치**: [project_p8_p16_roadmap.md](file:///Users/seo/.claude/projects/-Users-seo-project-space/memory/project_p8_p16_roadmap.md)
> (PM 라운드 2 동결, 2026-04-18)
> v0.7.0 릴리스 완료 시점에 `/pm 로드맵 박제` 재호출 — `docs/phases/roadmap-v2-solar-precision.md` 로 정식 문서화.

### P8~P16 매트릭스 요약 (v2)

| Phase | 테마                               | 규모 | 핵심 DoD                                                                |
| ----- | ---------------------------------- | ---- | ----------------------------------------------------------------------- |
| P8    | 내행성계 위성                      | 3~5d | 포보스 7h39m ±1% / 데이모스 30.3h ±1% / 달 교점역행 18.6년 ±5%          |
| P9    | 목성계 (갈릴레이 4위성 + 고리 3층) | 3~5d | Laplace 공명 1:2:4 / 주기 ±1% / Halo·Main·Gossamer 시각                 |
| P10   | 토성계 (10+ 위성 + A·B·C 링)       | 5d   | 타이탄/엔셀라두스 ±1% / 카시니 간극 2:1 / A-B 경계 74,500km ±2%         |
| P11   | 천왕성계 (5 위성 + 11 고리)        | 3~5d | 미란다/아리엘 ±1% / 자전축 97.8° / 11 고리 ±2%                          |
| P12   | 해왕성계 (트리톤 역행 + Adams 호)  | 3~5d | 트리톤 i=157° ±1° / 네레이드 e=0.75 ±5% / Adams 호 4개                  |
| P13   | 궤도 정밀 보정                     | 5d   | 지구 근일점 세차 11.45″/yr ±5% / 달 18.6년 장동 ±3% (VSOP87 경량 근사)  |
| P14   | 배포 + 번들                        | 5d   | Lighthouse Perf ≥85 / a11y ≥90 / WASM gzip <300KB / LCP <2.5s           |
| P15   | 소행성대/카이퍼                    | 5d   | 세레스 4.6년 ±1% / 명왕성 3:2 넵튠 공명 / 500~1000체 60fps              |
| P16   | 기술부채                           | 3d   | orbit draw call -50%+ / updateAt -30%+ / 후속 기술부채 (잔존 분 있으면) |

**총 예상: 35~42영업일 (≈ 7~9주)**

### P7 → P8 구체적 이관

1. **[P14 후보] #219 iOS Safari 실기기 bench** — 공개 URL 필요, 현재 범위 외. P14 배포 Phase 에서
   Vercel/Cloudflare Pages 공개 후 수동 측정 + `docs/reports/p14-ios-safari.md` 기록.

2. **[P8+ 후보] `verify-and-rust` CI 시간 단축 (#215)** — 실측 9m15s. P7-E ADR §4 임계를
   `> 7분 → > 11분` 갱신했으나 실시간 단축은 perihelion 5개 병목의 구조적 하한. 후보:
   - (a) `perihelion-verify` 잡 분리 (병렬잡) — 가장 유망
   - (b) `#[cfg(feature = "ci-fast")]` centuries 축소 옵트인
   - (c) Rust 릴리스 병렬도 상향

3. **[P14] disk 장축 픽셀 변화 자동 검증** — 현재 Chrome WebGPU 수동. P14 배포 후 Vercel Preview에
   실 GPU Playwright 또는 BrowserStack 연동 검토.

4. **[P16] 후속 기술부채** — v2 로드맵에 #220(iPadOS isMobile) / #221(\_\_simStore dev-only) / `?gr`
   대소문자는 본 P7-E 에서 **이미 해소**. 미해결: Babylon `tabindex=1` WCAG 경고 (WAI-ARIA 1.2
   업데이트 시 재검토), `?integrator` 별칭 `vv`/`yo4` 도입 여부 (문서화 비용 재평가).

5. **[P8~P12 공통] 위성 궤도 파라미터 소스** — SPICE/DE441 전면 채택은 v2 비-범위. VSOP87 경량 근사
   - Kepler 요소 직접 입력으로 시작. P13 궤도 정밀 보정에서 18.6년 장동 등 장기 secular 보정 통합.

### 회고 → 가드 제도화

- [x] **bench 컬럼 상속 정례화 계승** — P6-E E1 이후 P7-E 에서 `integrator_yoshida4_ms` /
      `track_b_ray3d_frame_ms` 2건 추가. P8+ 에서도 "Phase 마감 시 bench 컬럼 +1 이상" 원칙 유지.
- [x] **`time-play` silent-fail 구조 방지** — `scripts/browser-verify-utils.mjs` `pressTimePlay`
      유틸. 신규 browser-verify 스크립트는 동 유틸을 **반드시** import 해야 함 (후속 ADR 후보).
- [x] **ADR §재검토 트리거 실측 갱신 패턴 계승** — P6-D → P7-A → P7-E 연속 세 차례 "계획 임계가
      실측과 어긋남" 발생. ADR 템플릿에 "실측 이력 테이블" 섹션을 표준으로 편입하는 것을 P8 이후
      ADR 작성 체크리스트에 반영 (docs/decisions/README.md 업데이트 대상).
- [ ] **sub-agent 마무리 누락 방지 강화** — JSON 체크리스트만으로는 불충분. 메인 오케스트레이터의
      `git log --oneline -1` / `gh pr list` 재확인 루틴을 `.claude/agents/dev.md` 말미에 명시 박제
      (harness 개선안 후보, volt #24 연장선).
