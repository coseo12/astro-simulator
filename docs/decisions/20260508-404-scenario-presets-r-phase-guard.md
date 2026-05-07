# ADR: R-Phase UI 가드 — ScenarioPresets defense-in-depth (UI 측 3번째 축)

- **상태**: Accepted
- **날짜**: 2026-05-08
- **결정자**: architect (#404 PM 라운드 1 one-way 5/5, 2026-05-06 위임)
- **관련**:
  - **부모 시리즈**: #402 (Top 1 FocusQuickButtons), #403 (Top 2 CelestialTree + InfoPanel), `20260506-403-r-phase-ui-guard.md` (defense-in-depth 매트릭스 SSoT — 본 ADR 이 분기 7 추가 amendment)
  - **scene/URL 가드**: `20260504-r-phase-allowlist-guard.md` (R-Phase allowlist SSoT + scene 측 가드), `20260504-415-url-sync-guard.md` (URL 측 가드)
  - **자매 분리**: #405 (폐기 코드 정리 — BlackHoleDiskPanel / AboutModal / P10 KIND_LABEL 통합 후보지)
  - **정책 ADR**: `20260506-body-scale-r-phase-policy.md` (시각 활성 vs focus 활성 2축 분리)
  - **scene event 단일 진실원**: `20260425-r1-store-scene-sync-unification.md`
- **교훈 적용**:
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74)) — 본 ADR 도 #402/#403 의 정량 매트릭스 PASS 후 사용자 D-T2 잔재 인지의 후속 시리즈
  - "숨은 상수 변형" (volt [#69](https://github.com/coseo12/volt/issues/69)) — UI 측 3 진입점 (focus-quick / Tree+InfoPanel / ScenarioPresets) 에 동일 R-Phase 정책 박제 시 drift 방지
  - "단계 게이트" (volt [#77](https://github.com/coseo12/volt/issues/77)) — 본 PR 은 코드 변경 동반이라 docs-only 예외 적용 불가, developer + reviewer + qa 풀 단계 의무
  - "헤드리스 ≠ 실 브라우저" (volt [#78](https://github.com/coseo12/volt/issues/78)) — UI 가드 검증은 사용자 D-T2 의무 (CRITICAL #3)
  - "PM DoD 구조 drift" (volt [#76](https://github.com/coseo12/volt/issues/76)) — 본 ADR 의 4축 결정은 PM 인계 결정 3건을 1:1 박제
  - "worktree base drift + sub-agent cross-validate" (volt [#82](https://github.com/coseo12/volt/issues/82)/[#83](https://github.com/coseo12/volt/issues/83)) — architect Step 0 worktree 검증 + cross-validate 응답 박제까지 sub-agent 책임

---

## 배경

#402 (Top 1 FocusQuickButtons, MERGED) + #403 (Top 2 CelestialTree + InfoPanel, MERGED 2026-05-06 PR #429 ADR + PR #430 코드) 의 후속 시리즈 **Top 3**. PM 라운드 1 (2026-05-03) Q6=(b) Top 1 우선 → Top 2/3 후속 분리 결정에 따라 본 sprint 박제.

**defense-in-depth UI 측 *세 번째 축*** — focus-quick-buttons (#402) → CelestialTree + InfoPanel (#403) → **ScenarioPresets (#404)** 시리즈. 진입 경로가 다른 세 번째 UI 진입점에 동일 R-Phase 가드 박제.

#403 ADR §결정 3 의 defense-in-depth 매트릭스 (분기 N=5 + 가드 N=3) 에 **분기 7 신규 추가** — ScenarioPresets preset 적용 → mass multiplier 변경 경로. 본 ADR 의 §결정 2 가 #403 ADR Amendment 박제 동반 (단일 매트릭스 SSoT 유지).

### 문제 정의 — preset 적용 시 R-Phase 정책 위배

`apps/web/src/components/panels/scenario-presets.tsx` 의 3 preset 중 2 preset 이 R6 (jupiter) 미구현 시점에 mass multiplier 변경 노출:

| Preset id      | label              | massMultipliers       | R-Phase 정책 정합성                          |
| -------------- | ------------------ | --------------------- | -------------------------------------------- |
| `jupiter-x10`  | 목성 10배 질량     | `{ jupiter: 10 }`     | ❌ R6 미진입 (jupiter R-Phase 미정의)        |
| `no-jupiter`   | 목성 제거 (1%)     | `{ jupiter: 0.01 }`   | ❌ R6 미진입 (jupiter R-Phase 미정의)        |
| `sun-half`     | 태양 0.5배 질량    | `{ sun: 0.5 }`        | ✅ R1 sun 박제 완료 (mass multiplier R1 한정) |

preset 적용 시 부작용:
1. `setEngine('newton')` 호출 → physics engine 전환 (R-Phase 무관, 정상)
2. `resetMasses()` → 모든 mass multiplier 원복 (정상)
3. `setMass('jupiter', 10)` → R6 미구현 jupiter mass 변경 → **R-Phase incremental policy 위배**
4. `sendCommand({ type: 'jumpToJulianDate', julianDate: J2000 })` → 시간 리셋 (R-Phase 무관, 정상)

R-Phase 외 body mass multiplier 변경 → physics 시뮬레이션에 R6 미구현 body 영향 진입 → 예기치 못한 동작 가능 (예: jupiter mass=10 시 내행성 궤도 섭동이 시각 활성화되지 않은 jupiter 의 영향으로 변경, 사용자 인지 불일치).

### #402/#403 와의 직교 책임

| 축                | #402 (Top 1)                        | #403 (Top 2)                                       | 본 PR (Top 3 = #404)                              |
| ----------------- | ----------------------------------- | -------------------------------------------------- | ------------------------------------------------- |
| UI 진입점         | shortcut bar 6 버튼 (focus-quick)   | CelestialTree 트리 항목 + InfoPanel selectedBody   | ScenarioPresets preset 버튼 (3개)                  |
| Scene 측 가드     | simulation-core focusOn (이미 박제) | (재사용 — 본 PR 코드 변경 0)                        | (preset 자체는 focusOn 호출 안 함, mass mutation) |
| URL 측 가드       | url-sync `?focus=` (#415, 박제)     | (재사용 — 본 PR 코드 변경 0)                        | (재사용 — 본 PR 코드 변경 0)                       |
| SSoT              | `R_PHASE_BODY_ALLOWLIST` (박제)     | (재사용 — 본 PR 코드 변경 0)                        | (재사용 — 본 PR 코드 변경 0)                       |
| 변경 mutation     | `focusOn` (camera focus)            | `focusOn` (Tree click) / panel render (InfoPanel) | `setMass` / `setEngine` / `sendCommand` (mass)    |

본 ADR 은 **UI 측 3번째 축** (ScenarioPresets) 박제. SSoT / scene / URL 가드는 이미 박제되어 본 PR 은 UI 가드만 추가. 단, mutation 종류가 다름 — focus 가 아닌 mass multiplier 변경 — 이지만 동일 R-Phase 정책 (R-Phase 외 body 영향 차단) 적용.

### PM 합의 박제 (라운드 1, 2026-05-03)

| Q      | 결정                              | 의미                                              |
| ------ | --------------------------------- | ------------------------------------------------- |
| **Q3** | (iii) disabled + 안내             | preset 버튼 자체는 보이되 R6 미진입 preset disabled |
| **Q5** | (C) defense-in-depth (UI + scene) | 본 PR 은 UI 측 추가 (1차 방어선, scene 측 별도)   |
| **Q6** | (b) Top 1 우선 → Top 2/3 후속 분리 | 본 PR 이 Top 3                                    |

### Explore: 현재 코드 상태

- `apps/web/src/components/panels/scenario-presets.tsx` (94 lines) — `PRESETS` 배열에 3 preset 정의, `apply` 함수가 preset 무조건 적용. R-Phase 정책 인지 0
- `packages/core/src/scene/r-phase-allowlist.ts` — `R_PHASE_BODY_ALLOWLIST = ['sun', 'mercury', 'venus']` (R1~R3 박제). `isRPhaseFocusable` named export (#402 D2 wasm-safe 패턴)
- `packages/core/src/index.ts` (line 31) — named export `R_PHASE_BODY_ALLOWLIST`, `isRPhaseFocusable` 박제 (#402 ADR §Amendment D2 wasm-safe)

---

## 통합 vs 분리 결정 (defense-in-depth 매트릭스 박제 위치)

PM 인계 핵심 결정 (b). 본 ADR 의 §결정 2 가 위치 선택을 박제:

- **선택**: **(c) 둘 다 — #403 ADR Amendment + 본 #404 신규 ADR cross-link** (PM 권고 (a) 보완)
- **근거**:
  1. **매트릭스 SSoT 단일화** — defense-in-depth 분기 매트릭스는 #403 ADR §결정 3 단일 SSoT 유지. 분기 7 추가는 #403 Amendment 로 박제 (시리즈 일관성)
  2. **본 #404 고유 결정 박제** — sun-half preset 활성/비활성 결정 (DoD-2), preset id 별 가드 매핑, ScenarioPresets UI 가드 박제 패턴 코드 블록 → 본 #404 ADR 의 책임 (별도 책임 분리)
  3. **drift 방지** — 분기 매트릭스가 두 ADR 에 중복 박제되면 새 진입점 추가 시 drift 위험 (volt #69 패턴). 단일 SSoT + cross-link 가 정합
  4. **#403 ADR §재검토 트리거 2번 박제** — "defense-in-depth 분기 매트릭스 추가 — 새 UI 진입점 신설 시 매트릭스 1행 추가 + 본 ADR 갱신". 본 PR 이 정확히 이 트리거 만족 → #403 ADR Amendment 박제가 자연스러운 경로

- **분리 후 박제 의무**:
  - **#403 ADR Amendment 2026-05-08** 박제 — §"Amendment 2026-05-08 — ScenarioPresets 분기 7 추가 (#404)" 섹션 신설, 매트릭스 1행 추가
  - **본 #404 신규 ADR** 박제 — sun-half 결정 + preset 가드 패턴 + Concrete Prediction (R-Phase 자동 적응)
  - 양쪽 cross-link — #403 Amendment 가 본 #404 ADR 인용, 본 #404 ADR §관련 이 #403 ADR 인용

---

## 후보 비교

### 축 1 — DoD-2 sun-half preset 활성/비활성 결정

| 후보                                                    | 장점                                                                                                                                                                          | 단점                                                                                                                                                       | 비고                            |
| ------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------- |
| **(i) 활성 유지** (PM 권고)                              | sun = R1 박제 완료 — mass multiplier (sun × 0.5) 영향이 R1 영역 한정. preset 의도 (Kepler 3법칙 √2배 공전주기 관찰) 가 R1 sun 한정 효과. R6 무관. R-Phase incremental policy 정합 | 시리즈 일관성 부족 (3 preset 중 1개만 활성). 사용자 인지: "왜 sun-half 만 enabled?" — but tooltip/description 으로 설명 가능. R6 진입 시 자연 일괄 활성 (drift 0) | **채택**                        |
| (ii) 전체 비활성                                         | 일관성 ↑ (모든 preset disabled → R6 진입 시 일괄 활성). 사용자 인지 단순화                                                                                                       | sun-half 의 R1 한정 효과를 차단 → R-Phase incremental policy 위배 (R1 박제 완료 body 시각 활성 차단은 incremental build 의미 부정). 이미 활성 가능 효과를 차단 | 기각                            |
| (iii) sun-half 활성 + warning 메시지 ("R-Phase 진입 후 다른 preset 활성") | 사용자 인지 ↑ — 다른 preset 활성 조건 명시                                                                                                                                       | 추가 UI 분기 (warning panel) 필요. 본 PR 비-범위 확장 (PM 박제 §비-범위 4번 "Scenario 자체 신규 추가" 와 회색 영역). 본 채택안 (i) 의 description 으로 충분    | 차선                            |

**채택 근거**:
- **R-Phase incremental policy 정합성** — sun-half 는 sun (R1 박제 완료) 의 mass multiplier 변경. R1 영역 한정 효과로 R-Phase incremental build 의 의도 (R-Phase 진입 시 해당 body 시각/focus 활성 + 정책 동작 가능) 와 정확히 일치. 차단 시 incremental build 의미 부정
- **회귀 위험 격리** — sun-half 가 활성이어도 jupiter/neptune/earth body mass 는 변경 없음 (preset 정의 자체가 sun mass 만 변경). R6 미구현 body 영향 0
- **사용자 D-T2 학습 정합성** — 사용자 D-T2 (#410 머지 후 / 2026-05-04) 는 "잔재" 보고 — focus 시도 시 점 수준 표시. sun-half 는 sun (이미 시각 활성) 변경이라 잔재 발생 0. 사용자 인지 불일치 위험 0
- **#403 ADR §결정 2 패턴 일관** — #403 InfoPanel UX 메시지 채택 (사용자 인지 ↑ + 회귀 가드 검증성 ↑) 와 동일 원리. 본 안 (i) 도 활성 + description 자연 안내가 일관

**기각 근거 (ii)**:
- 일관성을 위해 R1 박제 완료 body 효과를 차단하면 R-Phase incremental policy 의 핵심 가치 (incremental visibility) 부정
- "전체 비활성 → R6 진입 시 일괄 활성" 시나리오는 R6 진입까지 sun-half 사용 차단 (Kepler 3법칙 관찰 학습 가치 차단)

### 축 2 — defense-in-depth 매트릭스 박제 위치

| 후보                                              | 장점                                                                                                                                                       | 단점                                                                                                                            | 비고                                      |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------- |
| (a) #403 ADR §결정 3 매트릭스 Amendment (PM 권고)   | 시리즈 일관성, 단일 SSoT (drift 방지)                                                                                                                       | 본 #404 고유 결정 (sun-half / preset 가드 패턴) 박제 위치 부재 → 본 ADR 박제 안 함은 #404 결정 박제 누락                            | 부족 (단일 ADR 으론 본 #404 책임 분리 안 됨) |
| (b) 본 #404 신규 ADR (`docs/decisions/20260508-404-scenario-presets-r-phase-guard.md`) | 본 #404 결정 박제 위치 확보                                                                                                                                | 분기 매트릭스 중복 박제 (drift 위험)                                                                                              | 단독 채택 시 #403 매트릭스와 drift 위험   |
| **(c) 둘 다 — #403 Amendment + 본 #404 신규 ADR (cross-link)** | (a) 의 시리즈 일관성 + (b) 의 책임 분리 모두 확보. 매트릭스 SSoT 단일 (#403) + 본 #404 고유 결정 박제 (별도)                                                  | 박제 비용 ↑ (2 파일 변경) — but ROI 양호 (매트릭스 갱신 1행 + 본 ADR 신규)                                                          | **채택**                                  |

**채택 근거**:
- #403 ADR §재검토 트리거 2번 ("defense-in-depth 분기 매트릭스 추가 — 새 UI 진입점 신설 시 매트릭스 1행 추가 + 본 ADR 갱신") 가 본 PR 정확히 만족
- 매트릭스 SSoT 단일화로 새 진입점 (#404 이후) 추가 시에도 #403 ADR Amendment 1회로 일괄 박제 가능 (시리즈 SSoT 패턴)
- 본 #404 ADR 은 ScenarioPresets 고유 결정 (sun-half / preset 가드 패턴 / Concrete Prediction R6 진입 시 자동 활성) 박제 책임 단일

### 축 3 — preset 가드 패턴 통일 (a11y 4축)

| 후보                                              | 장점                                                                                                       | 단점                                                                                              | 비고                                |
| ------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------- | ----------------------------------- |
| (i) `disabled` 만 박제                             | 코드 변경 최소                                                                                              | a11y 부족 (스크린 리더 인지 부족), browser-verify 회귀 가드 selector 약함                          | 기각                                |
| **(ii) #403 a11y 4축 패턴 통일** (`disabled` + `aria-disabled` + `title` + `data-r-phase-disabled`) | #402/#403 시리즈 패턴 일관, a11y 우수, browser-verify selector 명확, 회귀 가드 ROI ↑                        | 코드 추가량 약간 ↑ (~4 속성) — but ROI 양호 (시리즈 패턴 박제)                                     | **채택 (PM 권고)**                  |
| (iii) ScenarioPresets 고유 패턴 (예: warning panel 추가) | 사용자 인지 ↑                                                                                              | 시리즈 패턴 drift, 본 PR 비-범위 확장 (PM 박제 §비-범위 4번 회색 영역)                              | 기각                                |

**채택 근거**:
- #402 (focus-quick-buttons) → #403 (CelestialTree) → 본 #404 (ScenarioPresets) 시리즈 a11y 4축 패턴 박제로 일관성 ↑
- a11y 4축 박제는 cross-validate Gemini 개선 제안 2 (#403 ADR) 반영 — `data-r-phase-disabled` 가 E2E (browser-verify) 회귀 가드 + 선택자 노출용
- 시리즈 패턴 SSoT 박제 → 새 진입점 추가 시 동일 4축 박제 의무 (drift 차단)

### 축 4 — NO-OP 분기 평가 (preset 가드 추가의 비용 vs 가치)

| 평가 항목       | 비용                                                                                                                                                  | 가치                                                                                                                                                                 |
| --------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 코드 변경       | scenario-presets.tsx (~30 lines — disabled 분기 + a11y 4축 + tooltip)                                                                                  | UI 측 분기 7 차단 (#403 매트릭스 Amendment) — preset 적용 → R6 미구현 jupiter mass 변경 경로 1차 방어선                                                                |
| 테스트          | scenario-presets.test.tsx (신규 ~80 lines) + browser-verify 시나리오 6 추가 (~40 lines)                                                                | 사용자 D-T2 잔재 인지 차단 — defense-in-depth 시리즈 Top 3 완주, R-Phase incremental policy SSoT 박제                                                                |
| ADR / cross-val | 본 #404 ADR (~500 lines) + #403 ADR Amendment (~30 lines 추가) + cross-validate 1회                                                                    | defense-in-depth UI 측 3번째 축 박제 — R6 진입 시 자동 작동 (R_PHASE_BODY_ALLOWLIST 1줄 추가만으로 jupiter-x10/no-jupiter 자동 enabled)                                |
| 사용자 합의     | (PM 라운드 1 Q3=(iii) Q5=(C) 박제 — 추가 합의 비용 0)                                                                                                   | 사용자 D-T2 직접 보고 cluster 종결 (#412 ADR §결과 §재검토 트리거 1)                                                                                                  |
| **종합**        | 추가 PR 1 (small~medium)                                                                                                                              | **NO-OP 거부, UI 가드 추가 채택** — 사용자 합의 강함 + 회귀 가드 ROI 높음 + defense-in-depth 시리즈 완주                                                              |

NO-OP 거부 근거: 본 issue 가 인계 항목 (PM 라운드 1 Q3=(iii) Q5=(C) 박제) 이므로 "현재 동작 이미 만족" NO-OP 패턴 (volt #14) 적용 안 됨. 현재 동작은 **R6 미구현 jupiter mass preset 노출 (R-Phase incremental policy 위배)** 이라 본 PR 박제 필요.

---

## 결정

4축 통합 결정:

### 결정 1 — DoD-2 sun-half preset 활성 유지 (축 1 후보 i, PM 권고 채택)

`sun-half` preset 은 **활성 유지** (`disabled` 박제 안 함). 근거:
- sun = R1 박제 완료 (`R_PHASE_BODY_ALLOWLIST` 에 `'sun'` 박제, R1 ADR `20260425-r1-sun-visualization.md` 참조)
- preset 의도 (Kepler 3법칙 √2배 공전주기 관찰) 가 R1 sun 한정 효과
- mass multiplier (sun × 0.5) 영향이 R1 영역 한정 → R6 미구현 body 영향 0
- R-Phase incremental policy 정합성 — R1 박제 완료 body 의 이미 활성 가능 효과를 차단하지 않음

검증 단언 (단위 테스트):
- `[data-testid="preset-sun-half"]` `disabled` 속성 부재, `aria-disabled` `false` 또는 미박제, force click 시 `setMass('sun', 0.5)` 호출 1회 (정상 동작)

### 결정 2 — defense-in-depth 매트릭스 박제 위치 (축 2 후보 c, 둘 다 채택)

본 #404 신규 ADR (이 파일) + **#403 ADR Amendment 2026-05-08** 동시 박제.

#403 ADR Amendment 박제 의무 (developer 단계 작업):
- 위치: `docs/decisions/20260506-403-r-phase-ui-guard.md` 끝부분에 **§"Amendment 2026-05-08 — ScenarioPresets 분기 7 추가 (#404)"** 섹션 신설
- 내용:
  1. §결정 3 매트릭스에 **분기 7** 1행 추가 — "ScenarioPresets preset 클릭 (R6 미구현 body)" → UI 가드 (본 PR 분기 7 = #404)
  2. 분기 N=5 → N=7 갱신 (분기 6 정상 통과 + 분기 7 신규 추가)
  3. cross-link: 본 #404 ADR 인용

매트릭스 갱신 후 (#403 ADR §결정 3):

| 분기 | 진입 경로                                              | UI 가드 (Top 1 #402) | UI 가드 (Top 2 #403) | UI 가드 (Top 3 #404) | scene 가드 (#402)                | URL 가드 (#415)               | 1차 차단 위치    |
| ---- | ------------------------------------------------------ | -------------------- | -------------------- | -------------------- | --------------------------------- | ------------------------------ | ---------------- |
| 1    | focus-quick-buttons 클릭 (R4+ body)                    | **disabled**         | (도달 안 함)         | (도달 안 함)         | (도달 안 함)                      | (도달 안 함)                   | UI #402         |
| 2    | CelestialTree 클릭 (R4+ body)                          | (도달 안 함)         | **disabled**         | (도달 안 함)         | (도달 안 함)                      | (도달 안 함)                   | UI #403         |
| 3    | InfoPanel selectedBody set (R4+ body)                  | (도달 안 함)         | **R-Phase 메시지**   | (도달 안 함)         | (도달 안 함)                      | (도달 안 함)                   | UI #403         |
| 4    | 외부 URL `?focus=earth` 직접 진입                      | (도달 안 함)         | (도달 안 함)         | (도달 안 함)         | **isRPhaseFocusable=false 차단**  | **store mutation 차단 (1차)**  | URL #415        |
| 5    | scene focusOn API 직접 호출                            | (도달 안 함)         | (도달 안 함)         | (도달 안 함)         | **simulation-core focusOn emit 차단** | (도달 안 함)              | scene #402      |
| 6    | (정상) sun/mercury/venus 모든 진입 경로                | enabled              | enabled              | enabled              | isRPhaseFocusable=true            | store mutation 정상            | (정상 통과)      |
| **7** ★ 본 PR 신규 | **ScenarioPresets preset 클릭 (R6 미구현 body 영향)** | (도달 안 함)         | (도달 안 함)         | **disabled (이벤트 차단)** ★ | (도달 안 함, mass mutation only) | (도달 안 함, URL 무관)      | UI 본 PR        |

**directionality**:
- 본 PR 분기 7 차단은 1차 방어선 (사용자 즉시 피드백 — disabled 버튼)
- 분기 7 은 mass mutation (`setMass`) 만 발생, focus 변경 0 → scene/URL 가드 (#402/#415) 도달 안 함. UI 가드 단일 방어선 (분기 1/2/3 와 동일 패턴)
- 진입 경로 N=7 → 가드 N=3 (UI / scene / URL) 직교 매트릭스. 새 진입점 추가 시 매트릭스 1행 추가 + 가드 박제 의무 (#403 ADR §결정 3 패턴 일관)

### 결정 3 — preset 가드 패턴 통일 (축 3 후보 ii, #403 a11y 4축 박제)

ScenarioPresets disabled 박제 패턴이 #402 / #403 시리즈와 동일 a11y 4축:
- `disabled={!enabled}` — 이벤트 차단 (1차 방어선)
- `aria-disabled={!enabled}` — 스크린 리더 인지
- `title={!enabled ? "R-Phase 진행 시 활성" : undefined}` — tooltip 안내
- `data-r-phase-disabled={!enabled}` — E2E (browser-verify) 회귀 가드 + 선택자 노출용

**preset id 별 가드 매핑** (R-Phase allowlist 기반):
- `sun-half`: massMultipliers `{ sun: 0.5 }` → sun (R1 박제) → enabled
- `jupiter-x10`: massMultipliers `{ jupiter: 10 }` → jupiter (R6 미구현) → disabled
- `no-jupiter`: massMultipliers `{ jupiter: 0.01 }` → jupiter (R6 미구현) → disabled

**일반화된 가드 함수** (developer 단계 인계):

```tsx
// preset 의 모든 mass multiplier target body 가 R_PHASE_BODY_ALLOWLIST 에 박제되어야 enabled
import { isRPhaseFocusable } from '@astro-simulator/core';

function isPresetEnabled(preset: Preset): boolean {
  return Object.keys(preset.massMultipliers).every((bodyId) =>
    isRPhaseFocusable(bodyId)
  );
}
```

이 함수는 새 preset 추가 시 자동 적응 — `R_PHASE_BODY_ALLOWLIST` 1줄 추가로 R-Phase 진입 시 자연 활성 (zero-touch).

### ScenarioPresets UI 가드 박제 패턴 (developer 인계)

```tsx
// apps/web/src/components/panels/scenario-presets.tsx
'use client';

import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';
// #404 — defense-in-depth UI 측 3번째 축 (#402 D2 wasm-safe 패턴)
import { isRPhaseFocusable } from '@astro-simulator/core';

interface Preset {
  id: string;
  label: string;
  description: string;
  massMultipliers: Record<string, number>;
}

const PRESETS: Preset[] = [
  // ... 기존 3 preset 정의 그대로 (변경 없음)
];

const J2000 = 2_451_545.0;

/**
 * preset 활성 여부 판정 — 모든 mass multiplier target body 가
 * R_PHASE_BODY_ALLOWLIST 에 박제되어야 enabled.
 *
 * R-Phase 진입 시 자동 적응 (zero-touch): allowlist 1줄 추가만으로
 * 해당 body 영향 preset 자동 enabled.
 *
 * ADR `docs/decisions/20260508-404-scenario-presets-r-phase-guard.md` §결정 3 참조.
 */
function isPresetEnabled(preset: Preset): boolean {
  return Object.keys(preset.massMultipliers).every((bodyId) =>
    isRPhaseFocusable(bodyId)
  );
}

export function ScenarioPresets() {
  const resetMasses = useSimStore((s) => s.resetMassMultipliers);
  const setMass = useSimStore((s) => s.setMassMultiplier);
  const setEngine = useSimStore((s) => s.setPhysicsEngine);
  const sendCommand = useSimCommand();

  const apply = (preset: Preset) => {
    setEngine('newton');
    resetMasses();
    for (const [id, mul] of Object.entries(preset.massMultipliers)) {
      setMass(id, mul);
    }
    sendCommand({ type: 'jumpToJulianDate', julianDate: J2000 });
  };

  // ... resetAll 그대로

  return (
    <div data-testid="scenario-presets" className="flex flex-col gap-2">
      {/* ... 헤더 그대로 (만약에 시나리오 + 원복 버튼) */}
      {PRESETS.map((p) => {
        const enabled = isPresetEnabled(p);
        return (
          <button
            key={p.id}
            type="button"
            data-testid={`preset-${p.id}`}
            onClick={() => enabled && apply(p)}
            disabled={!enabled}
            aria-disabled={!enabled}
            // data-r-phase-disabled — E2E (browser-verify) 회귀 가드 + 선택자 노출용
            // (#403 ADR cross-validate Gemini 개선 제안 2 패턴 일관, disabled / aria-disabled 와
            // 의미 중복이지만 selector 일관성 위해 #402/#403 박제 패턴 그대로 재사용).
            data-r-phase-disabled={!enabled}
            title={!enabled ? 'R-Phase 진행 시 활성' : undefined}
            className={`text-left bg-bg-elevated/50 hover:bg-primary/15 rounded-sm px-2 py-1.5 border border-border-subtle ${
              !enabled ? 'opacity-50 cursor-not-allowed' : ''
            }`}
          >
            <div className="text-body-sm text-fg-primary">{p.label}</div>
            <div className="text-caption text-fg-tertiary leading-snug">{p.description}</div>
          </button>
        );
      })}
    </div>
  );
}
```

**검증 단언** (`scenario-presets.test.tsx`, 신규):
- `preset-sun-half`: `disabled` 속성 부재, `aria-disabled` `false` 또는 미박제, `data-r-phase-disabled="false"`, force click 시 `setEngine('newton')` + `setMass('sun', 0.5)` + `sendCommand({type: 'jumpToJulianDate'})` 호출
- `preset-jupiter-x10`: `disabled` 속성 박제, `aria-disabled="true"`, `data-r-phase-disabled="true"`, `title="R-Phase 진행 시 활성"`, force click 시 `setEngine` / `setMass` / `sendCommand` 호출 0
- `preset-no-jupiter`: 동일 (jupiter R6 미구현)
- `scenario-reset` (원복 버튼): R-Phase 무관 (mass 원복만), 항상 enabled — 본 PR 비-범위, 회귀 0 검증

### 결정 4 — NO-OP 거부, ADR 채택 (축 4 후보 채택)

본 ADR 박제로 코드 변경 0 (architect 단계 ADR-only). 코드 변경은 developer 단계에서 별도 PR.

본 ADR 의 가치는 **본 PR + R-Phase 진입 시점**에 발생:
- 본 PR (developer): `scenario-presets.tsx` UI 가드 박제 → 분기 7 1차 방어선
- R6 (jupiter) 진입 시: `R_PHASE_BODY_ALLOWLIST` 1줄 추가 → `jupiter-x10` / `no-jupiter` 자동 enabled (zero-touch)
- 사용자 D-T2 잔재 인지 차단 (defense-in-depth 시리즈 Top 3 완주)

### browser-verify 시나리오 6 박제 (DoD-5 (b))

`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 에 시나리오 6 (ScenarioPresets UI 가드) 신규:

- **6-A 정상 (sun-half)**: `[data-testid="preset-sun-half"]` 가 `disabled` 속성 부재 + `aria-disabled="false"` (또는 미박제) + `data-r-phase-disabled="false"`. force click 시 store mutation (`setMass('sun', 0.5)`) 호출 검증
- **6-B 차단 (jupiter-x10)**: `[data-testid="preset-jupiter-x10"]` 가 `disabled` 속성 + `aria-disabled="true"` + `data-r-phase-disabled="true"` + `title="R-Phase 진행 시 활성"`. force click 시 store mutation 호출 0 검증
- **6-C 차단 (no-jupiter)**: 동일 (jupiter R6 미구현)

`RPHASE_EXPECTED_ENABLED` / `RPHASE_EXPECTED_DISABLED` SSoT 그대로 재사용 (#402 D2 박제 매트릭스 정합 + #403 시나리오 5 패턴 일관).

---

## Concrete Prediction

본 ADR 채택 후 R6 (jupiter) 진입 시 본 PR 의 UI 가드는 **자동 작동**:

- `R_PHASE_BODY_ALLOWLIST` 에 `'jupiter'` 1줄 추가 → `jupiter-x10` / `no-jupiter` preset 자동 enabled (R-Phase 박제 5곳 동시 박제 절차 중 1번 자동 작동)
- `isPresetEnabled(preset)` 함수가 `R_PHASE_BODY_ALLOWLIST` 의존이라 자동 갱신
- 본 PR 코드 변경은 **R-Phase 무관** (allowlist 데이터만 의존) — R4~R10 진행 동안 본 PR 코드는 zero-touch

**검증 방법**: R6 PR 의 `git diff --stat` 으로 `scenario-presets.tsx` 변경 0 확인. `R_PHASE_BODY_ALLOWLIST` + R6 ADR + browser-verify expected list + CHANGELOG 4곳만 변경.

이 예측이 실패하면 (R6 PR 이 본 PR 파일을 수정하면) UI 가드 추상화 결함 → 리팩토링 필요. 근거: "신규 데이터 ≠ 신규 코드" (CLAUDE.md ADR 예측 재현 패턴, volt 데이터-not-code-extension).

본 Concrete Prediction 은 #403 ADR §Concrete Prediction 의 Tree/InfoPanel 자동 적응 패턴과 정합 — 시리즈 일관성 (preset id 별 매핑이 `R_PHASE_BODY_ALLOWLIST` 의존이라 자동).

---

## 결과·재검토 조건

### 기대 효과 (측정 가능)

1. **사용자 D-T2 잔재 인지 차단 (Top 3)** — ScenarioPresets R6 미구현 preset 클릭 disabled. defense-in-depth 시리즈 Top 1/2/3 완주
2. **defense-in-depth UI 측 3번째 축 박제** — #403 매트릭스 분기 N=5 → N=7 (분기 6 정상 + 분기 7 본 PR 추가). 본 PR 분기 7 1차 방어선
3. **회귀 가드 ROI** — 단위 테스트 (~80 lines) + browser-verify 시나리오 6 (~40 lines) 로 R6~R10 진입 시 회귀 자동 차단
4. **R-Phase 자동 적응 (zero-touch)** — `R_PHASE_BODY_ALLOWLIST` 1줄 추가만으로 본 PR 가드 자동 갱신. 본 PR 의 `isPresetEnabled` 함수가 일반화 추상화

### 트레이드오프로 받아들인 비용

- sun-half 활성 유지 → 시리즈 일관성 부족 (3 preset 중 1개만 활성). 단, R-Phase incremental policy 정합성 우선
- preset 가드 단일 방어선 (UI only) — focus 변경 0, scene/URL 가드 도달 안 함. 외부 경로 (URL `?preset=jupiter-x10` 등) 차단은 본 PR 비-범위

### 재검토 조건

본 ADR 재검토가 필요한 trigger:

1. **R-Phase 진입 시 가드 drift** — R6 진입 시 본 PR 코드를 수정해야 하는 변경 발생 → §Concrete Prediction 위배, 추상화 결함
2. **defense-in-depth 분기 매트릭스 추가** — 새 UI 진입점 (예: 신규 검색 패널, 신규 시나리오 UI 등) 신설 시 #403 ADR §결정 3 매트릭스 1행 추가 + 본 ADR 갱신
3. **사용자 D-T2 잔재 인지 재발** — 본 PR 머지 후 사용자가 "잔재" 보고 시 추가 진입점 식별 + ADR 갱신
4. **preset 외부 진입 경로 발견** — URL preset 적용 / 디버그 콘솔 직접 호출 / 외부 API 등 새 진입 경로 발견 시 분기 매트릭스 행 추가 + 가드 박제 (현재 본 PR 비-범위)
5. **sun-half 인지 불일치 보고** — 사용자가 "왜 sun-half 만 enabled?" 보고 시 description / tooltip 보강 (메시지 명료화)

---

## 비-범위 (PM 박제 본문 §비-범위 4건 보존)

- **Top 1 (#402) 영역** — focus-quick-buttons 가드 (별 PR 머지 완료, R_PHASE_BODY_ALLOWLIST SSoT 재사용만)
- **Top 2 (#403) 영역** — CelestialTree + InfoPanel 가드 (별 PR 머지 완료, a11y 4축 패턴만 학습)
- **폐기 코드 (BlackHoleDiskPanel / AboutModal, #405) 영역** — 후속 분리 이슈 (P10 KIND_LABEL 통합 후보지)
- **Scenario 자체 신규 추가** — preset 신규 정의 금지, 기존 3 preset (`jupiter-x10` / `no-jupiter` / `sun-half`) 가드만 박제

추가 비-범위 (PM 박제):

- **scene 측 preset 적용 가드** — preset 적용 시 R-Phase allowlist 검증을 scene/store 측에 추가하는 것은 본 PR 비-범위 (UI disabled 가 1차 방어선, scene 측은 #402 focusOn 가드만 재사용). 본 ADR §재검토 트리거 4번 (외부 진입 경로 발견 시) 후속 이슈 분리
- **i18n 키 분기 신설 금지** — UI 메시지 ("R-Phase 진행 시 활성") 한국어 하드코딩 (`/ko` 라우팅 기본). 다국어 키 추출은 i18n 라이브러리 도입 후속 이슈 분리 (#403 ADR §명시적 비-범위 학습)
- **preset 적용 idempotency** — preset 자체가 disabled 여도 외부 경로 (URL / scene API 직접 호출 / 디버그 콘솔) 로 mass multiplier 변경 가능성 — 본 PR 은 UI 진입 차단만 (1차 방어선). 외부 경로 차단은 §재검토 트리거 4번

추가 비-범위 (본 ADR 박제):

- **새 진입점 가드 매트릭스 자동 갱신** — 본 ADR 매트릭스는 #403 ADR Amendment 수동 박제. 자동화는 후속 인프라 이슈 분리 (#403 ADR §재검토 조건 §"후속 인프라 분리" 패턴 일관)

---

## Developer 인수인계

### 시작 지점

1. `apps/web/src/components/panels/scenario-presets.tsx` — `isPresetEnabled` 함수 추가 + `PRESETS.map` 분기 박제 (위 §결정 3 §ScenarioPresets UI 가드 박제 패턴 인용). **PRESETS 배열 자체 변경 금지** (PM 박제 §비-범위 4번)
2. `apps/web/src/components/panels/scenario-presets.test.tsx` — 신규 단위 테스트 (위 §결정 3 §검증 단언 인용)
3. `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` — 시나리오 6 추가 (위 §결정 §browser-verify 시나리오 6 박제 인용)
4. `docs/decisions/20260506-403-r-phase-ui-guard.md` — **§"Amendment 2026-05-08 — ScenarioPresets 분기 7 추가 (#404)"** 섹션 신설 (위 §결정 2 인용)
5. `CHANGELOG.md` — `### Behavior Changes` MINOR 박제 (DoD-6)

### 빌드 / 검증 순서 (volt #70 + #77 + #78)

```bash
# 1. core 패키지 변경 0 — re-verify
git diff develop -- packages/core/

# 2. web 변경만 빌드
pnpm --filter @astro-simulator/web build

# 3. 단위 테스트
pnpm --filter @astro-simulator/web test --run scenario-presets

# 4. SSR 200 검증 (volt #77 단계 게이트)
pnpm --filter @astro-simulator/web start &
curl -I http://localhost:3000/ko | grep "200"

# 5. browser-verify (시나리오 6 추가)
node apps/web/scripts/browser-verify-r-phase-allowlist.mjs

# 6. 사용자 D-T2 (CRITICAL #3 + volt #78) — qa 단계 의무
```

### 명시적 비-범위 (절대 손대지 말 것)

- `packages/core/src/scene/r-phase-allowlist.ts` — SSoT 재사용만, 변경 금지
- `packages/core/src/sim/simulation-core.ts` `case 'focusOn'` — #402 가드 그대로 (preset 은 focusOn 호출 안 함, mass mutation only)
- `apps/web/src/core/url-sync.tsx` — #415 가드 그대로
- `apps/web/src/components/layout/focus-quick-buttons.tsx` — #402 가드 그대로
- `apps/web/src/components/panels/celestial-tree.tsx` — #403 가드 그대로
- `apps/web/src/components/panels/celestial-info-panel.tsx` — #403 가드 그대로 (P10 KIND_LABEL 영역도 #405 통합 후보지)
- BlackHoleDiskPanel / AboutModal — #405
- **PRESETS 배열 자체** — 신규 preset 정의 금지 (PM 박제 §비-범위 4번)
- **i18n 키 분기 신설 금지** — 본 PR UI 메시지 ("R-Phase 진행 시 활성") 한국어 하드코딩. 다국어 키 추출은 i18n 라이브러리 도입 후속 이슈 분리

### 참조 문서

- 본 ADR (`docs/decisions/20260508-404-scenario-presets-r-phase-guard.md`)
- 부모 ADR (defense-in-depth 시리즈):
  - `20260504-r-phase-allowlist-guard.md` (R-Phase allowlist SSoT + scene 가드)
  - `20260504-415-url-sync-guard.md` (URL store mutation 가드)
  - `20260506-403-r-phase-ui-guard.md` (#403 UI 가드 ADR — **본 PR 이 §"Amendment 2026-05-08" 섹션 박제 의무**)
- 정책 ADR `20260506-body-scale-r-phase-policy.md` (시각 활성 vs focus 활성 분리)
- 이슈 #404 PM 라운드 1 코멘트 — https://github.com/coseo12/astro-simulator/issues/404#issuecomment-4397592426
- 이슈 #403 (자매 직전 단계, MERGED) — https://github.com/coseo12/astro-simulator/issues/403
- 이슈 #402 (자매 부모 단계, MERGED) — https://github.com/coseo12/astro-simulator/issues/402

---

## 교차검증 반영 사항

cross-validate Gemini 호출 (2026-05-08T01:56:33+09:00, anchor=ADR_R_PHASE_UI_GUARD_TOP3_404, outcome=**applied** (exit 0), log=`.claude/logs/cross-validate-architecture-20260508-015633.log`, outcome JSON=`.claude/logs/cross-validate-architecture-20260508-015633-outcome.json`).

호출 시점: ADR 박제 직후 (CLAUDE.md `## 교차검증` §"정책·설계·ADR 박제 직후 1회 루틴" 적용). 첫 호출 429 (RESOURCE_EXHAUSTED — gemini-2.5-pro capacity) 후 backoff 재시도로 정상 응답 박제.

### 4축 검증 질문 (Gemini 입력)

1. **DoD-2 sun-half 활성 유지 (결정 1)** — sun = R1 박제 완료, mass multiplier R1 영역 한정 효과의 R-Phase incremental policy 정합성. 일관성 (전체 비활성) vs 정합성 (활성 유지) 트레이드오프 평가
2. **defense-in-depth 매트릭스 박제 위치 (결정 2)** — #403 ADR Amendment + 본 #404 신규 ADR cross-link 패턴의 적절성. 단일 ADR (Amendment 만 또는 신규만) 으론 부족한 책임 분리 근거
3. **preset 가드 패턴 통일 (결정 3)** — #403 a11y 4축 패턴 통일 + `isPresetEnabled` 일반화 함수의 zero-touch 자동 적응 검증. 새 preset 추가 시 자동 작동 적절성
4. **NO-OP 분기 평가 (결정 4)** — NO-OP 거부 근거의 타당성. defense-in-depth 시리즈 Top 3 완주 가치 vs ADR 박제 비용 정당성

### 호출 전 Claude 편향 셀프 체크 (CLAUDE.md `## 교차검증` Claude 자체 편향 4종 체크리스트)

- **낙관적 일정**: 통과 — 본 ADR 박제 비용 (1 ADR 파일 신규 + #403 ADR Amendment) 만 평가, developer 단계 일정 영향은 별도 (small~medium 단일 PR)
- **결합 간과**: 부분 통과 — 본 ADR §결정 2 의 #403 ADR Amendment 박제 의무는 #403 ADR 과 결합. 결합 정합성을 cross-validate 결정 2 검증 질문에 명시 (Gemini 합의 결과 — Amendment SSoT 단방향 의존 패턴이 "정보 파편화·드리프트 방지 최선의 방법" 으로 평가됨, 결합 OK)
- **폐기 프레이밍**: 통과 — 기존 PRESETS 배열 폐기 안 함 (가드만 추가). v3 reset 시 폐기한 P12 scale unification 와 별개
- **순수주의**: 통과 — defense-in-depth 매트릭스 자동화 (#403 ADR §재검토 조건 §"후속 인프라 분리" 패턴) 즉시 도입하지 않고 R-Phase 진입 누적 후 ROI 양호 시점 후속 분리

### Gemini 6 검증 기준 평가 매트릭스

| 검증 기준 | Gemini 평가 | 비고 |
| --- | --- | --- |
| §1 구조적 완성도 | **최상 (Excellent)** | ADR 모든 요소 (배경/문제/대안/결정/결과/비-범위) 완비, defense-in-depth 매트릭스 + Concrete Prediction + Developer 인수인계 우수 |
| §2 기술 결정 타당성 | **최상 (Excellent)** | 4축 결정 (sun-half / 매트릭스 SSoT / a11y 4축 / NO-OP) 모두 합리적, 트레이드오프 명확 |
| §3 인터페이스 명확성 | **최상 (Excellent)** | UI ↔ core 결합도 최소 (`isRPhaseFocusable` + `R_PHASE_BODY_ALLOWLIST` 의존), `isPresetEnabled` 캡슐화 모범적 |
| §4 확장성 | **최상 (Excellent)** | R-Phase 진입 시 zero-touch 자동 적응, 매트릭스 갱신 절차 명시. 자동화는 후속 분리 가이드 박제됨 |
| §5 보안 | **좋음 (Good)** | UI 1차 방어선 적절, 비-범위 (외부 진입 경로) 투명 인정. UI 우회 경로 후속 이슈 등록 권고 |
| §6 누락 요소 | **좋음 (Good)** | i18n / 성능 비-범위 박제 적절, cross-validate 자체가 선진적. `apply` 함수 atomicity 확인 권고 |

**Gemini 총평**: "매우 뛰어난 설계 문서. 문제 정의·대안 분석·결정·구체적 구현 지침·미래 확장성까지 체계적. 그대로 승인하고 진행하기에 충분하며, 다른 프로젝트에서도 참고할 만한 모범 사례."

### 합의 (Claude 설계와 일치 — Gemini 양호 평가)

- **결정 1 (sun-half 활성 유지)** — Gemini 합의: "'일관성'보다 '점진적 정책(incremental policy) 정합성'을 우선시한 결정은 합리적입니다. 이미 기능이 구현된 R1 단계의 효과를 사용자가 누릴 수 있게 하는 것이 프로젝트의 핵심 가치와 부합합니다." (§2)
- **결정 2 (매트릭스 SSoT 단일화)** — Gemini 합의: "방어 매트릭스를 부모 ADR(#403)에서 단일 진실 공급원(SSoT)으로 관리하고 본 ADR(#404)에서는 링크를 통해 참조하는 방식은 정보의 파편화와 드리프트를 막는 최선의 방법입니다." (§2)
- **결정 3 (a11y 4축 패턴 통일)** — Gemini 합의: "기존 시리즈(#402, #403)와 UI 비활성화 패턴을 일치시켜 일관성을 확보하고, 접근성(a11y)과 테스트 자동화(`data-r-phase-disabled` 선택자)를 동시에 강화한 것은 매우 현명한 선택입니다." (§2)
- **`isPresetEnabled` 캡슐화** — Gemini 인용: "일반화된 함수를 통해 preset의 활성화 로직을 캡슐화하여, 컴포넌트의 다른 부분은 이 정책의 구체적인 내용에 대해 알 필요가 없도록 만들었습니다." (§3)
- **zero-touch 자동 적응 (Concrete Prediction)** — Gemini 인용: "`R_PHASE_BODY_ALLOWLIST` 배열에 해당 행성의 ID를 추가하는 것만으로 `scenario-presets.tsx`의 UI가 코드 수정 없이(zero-touch) 자동으로 활성화됩니다." (§4)
- **비-범위 투명성 (UI 우회 경로)** — Gemini 인용: "비-범위 섹션에서 UI를 통하지 않는 경로(예: URL 직접 조작, 디버그 콘솔 사용)에 대한 방어는 이번 작업에 포함되지 않음을 명확히 밝힌 점은 매우 중요하고 긍정적입니다. 이는 설계의 한계를 투명하게 인정하는 좋은 자세입니다." (§5)

### 이견 수용 (Gemini 근거 합리적, 수정 반영)

(없음 — 4축 모두 원안 합의, 수정 0건)

### Claude 재분석으로 기각한 Gemini 제안

(Gemini 응답에 ADR 본문 수정을 요구하는 명시적 제안 0건. 사소한 개선 제안은 §고유 발견 (후속 분리) 로 분류)

### 고유 발견 (현재 ADR 에 즉시 반영 0건, 모두 후속 분리)

**Gemini 발견 1: defense-in-depth 다이어그램 보완 (§1 개선 제안)**

> Gemini 인용: "(선택 사항) defense-in-depth 개념을 시각적으로 보완하기 위해, UI-가드, Scene-가드, URL-가드로 이어지는 계층 구조를 간단한 다이어그램으로 표현하면 문서를 처음 접하는 사람이 더 빠르게 이해하는 데 도움이 될 수 있습니다. 하지만 현재의 테이블만으로도 충분히 명확합니다."

- **Claude 재분석**: Gemini 본인이 "선택 사항" + "현재 테이블만으로도 충분히 명확" 명시. 본 #404 ADR 이 #403 ADR Amendment 매트릭스를 단일 SSoT 로 유지하므로 다이어그램 박제 위치는 #403 ADR 이 자연스러움
- **현재 PR 반영 안 함 근거**: (1) Gemini 자체 평가 "선택 사항" + "충분히 명확" (2) 다이어그램 박제 위치는 #403 ADR (매트릭스 SSoT) 측이라 본 #404 비-범위 (3) CLAUDE.md `## 교차검증` §"고유 발견의 수용 vs 후속 분리 3단 프로토콜" (2) 범위 체크 — 시각 보완은 본 PR `Behavior Changes` 와 직교
- **후속 분리 가이드**: 본 ADR 또는 #403 ADR §재검토 트리거 발생 시 (예: 새 진입점 N 회 누적, 매트릭스 분기 N=10+ 도달) #403 ADR 별도 Amendment 로 다이어그램 박제. 우선순위: low

**Gemini 발견 2: 매트릭스 갱신 자동화 기술 부채 백로그 (§4 개선 제안)**

> Gemini 인용: "현재는 새 UI 진입점 추가 시 방어 매트릭스를 수동으로 갱신해야 합니다. 이는 합리적인 결정이지만, 장기적으로 진입점이 계속 늘어날 경우를 대비해 '매트릭스 갱신 자동화를 위한 기술 부채' 항목을 백로그에 기록해두는 것을 고려할 수 있습니다."

- **Claude 재분석**: 본 ADR §비-범위 §"새 진입점 가드 매트릭스 자동 갱신 — 본 ADR 매트릭스는 #403 ADR Amendment 수동 박제. 자동화는 후속 인프라 이슈 분리" 와 정확히 일치. 본 ADR 이 이미 후속 분리 가이드 박제됨 (#403 ADR §재검토 조건 §"후속 인프라 분리" 패턴 일관)
- **현재 PR 반영 안 함 근거**: (1) 본 ADR §비-범위 가 이미 동등 박제 (2) 자동화 ROI 평가는 진입점 누적 데이터 (현재 N=3 — focus-quick / Tree+InfoPanel / ScenarioPresets) 가 충분치 않음. R6/R10 진입 누적 후 평가 (3) CLAUDE.md `## 교차검증` 3단 프로토콜 — 본 sprint scope 외, 후속 분리
- **후속 분리 가이드**: 본 ADR §재검토 트리거 발생 시 (또는 진입점 N=5+ 누적 시) `Builds on: #404` 링크 + 매트릭스 자동화 인프라 이슈 박제. Gemini 설계 스케치 (매트릭스 갱신 자동화 백로그) 인용. 우선순위: medium (R6 진입 시점 재평가)

**Gemini 발견 3: `apply` 함수 상태 변경 atomicity 확인 (§6 개선 제안)**

> Gemini 인용: "`apply` 함수 내에서 `setEngine`, `resetMasses`, `setMass` 등 여러 상태 변경이 순차적으로 일어납니다. 이 작업들의 원자성(atomicity)이 보장되는지, 또는 중간에 렌더링이 발생하여 예기치 않은 상태를 만들 가능성은 없는지 아주 간단하게라도 확인하면 더 견고해질 것입니다. (아마도 사용 중인 상태 관리 라이브러리(e.g., Zustand)가 이를 보장하겠지만, 확인하는 것이 좋습니다.)"

- **Claude 재분석**: `apps/web/src/store/sim-store.ts` 가 Zustand 사용 중 (코드베이스 확인). Zustand 의 `set` 호출은 React 18+ batching 으로 자동 batch 처리되어 `setEngine` + `resetMasses` + `setMass` (loop) 순차 호출이 단일 render commit 으로 처리됨. 본 PR 의 가드 추가는 `apply` 함수 호출 자체를 차단 (`onClick={() => enabled && apply(p)}`) 하므로 atomicity 와 직교 — 가드가 작동하면 `apply` 호출 0, 작동 안 하면 기존 동작 유지 (회귀 0)
- **현재 PR 반영 안 함 근거**: (1) 본 PR 은 가드 추가만, 기존 `apply` 함수 변경 0 (2) atomicity 검증은 본 PR 비-범위 (PRESETS 배열 자체 변경 금지 + apply 함수 변경 금지) (3) Zustand atomicity 는 store 레이어 책임, scenario-presets.tsx UI 가드와 직교 (4) Gemini 자체 평가 "아마도 상태 관리 라이브러리가 이를 보장" 의 추정성 인정
- **후속 분리 가이드**: 사용자 D-T2 또는 qa 단계에서 `apply` 호출 시 중간 render 노출 (예: engine 전환 → mass reset 사이 깜빡임) 보고 시 후속 이슈 박제. 본 PR 머지 후 `apply` 함수 자체 검증을 별도 sprint 로 분리. 우선순위: low (현재 미관찰)

**Gemini 발견 4: 보안 §UI 우회 후속 이슈 등록 강조 (§5 개선 제안)**

> Gemini 인용: "문서의 제안을 강력히 지지합니다. UI 계층을 우회하는 경우를 방어하기 위해 scene/store 계층에 동일한 검증 로직을 추가하는 후속 작업을 반드시 계획하고 이슈로 등록해야 합니다. 이것이 완료되어야 진정한 'Defense-in-depth'가 완성됩니다."

- **Claude 재분석**: 본 ADR §비-범위 §"scene 측 preset 적용 가드" + §재검토 트리거 4번 (preset 외부 진입 경로 발견) 으로 후속 분리 박제됨. preset 의 mutation (`setMass`) 은 store layer 라 #402 focusOn 가드 (scene/store) 와 직교 — store layer 가드는 별도 ADR 박제 필요
- **현재 PR 반영 안 함 근거**: (1) 본 ADR §비-범위 가 이미 동등 박제 (2) preset mass mutation 의 store/scene 측 가드는 새 가드 메커니즘 (mass mutation hook) 필요 — 본 PR 의 UI 가드 추상화와 별 책임 (3) 사용자 D-T2 잔재 인지 cluster 종결이 본 PR 의 핵심 가치, store 가드는 외부 진입 경로 발견 시 별도 sprint
- **후속 분리 가이드**: §재검토 트리거 4번 (preset 외부 진입 경로 발견) 시 후속 이슈 박제. `Builds on: #404` 링크 + Gemini 설계 스케치 (scene/store 가드) 인용. 우선순위: medium (외부 경로 발견 시 즉시 high 승급)

### 결론

**Gemini 결론**: "이 ADR은 그대로 승인하고 진행하기에 충분하며, 다른 프로젝트에서도 참고할 만한 모범 사례라고 생각합니다."

**Claude 분석 결론**: 4축 결정 모두 Gemini 합의, 4 개선 제안 모두 본 PR 비-범위 + 후속 분리 가이드 박제. **원안대로 진행** (현재 PR 반영 0건, 후속 분리 4건). cross-validate outcome=applied 박제.

---

## 참조

- 이슈 #404 — https://github.com/coseo12/astro-simulator/issues/404
- PM 라운드 1 코멘트 — https://github.com/coseo12/astro-simulator/issues/404#issuecomment-4397592426
- 자매 시리즈:
  - #402 (Top 1 FocusQuickButtons MERGED)
  - #403 (Top 2 CelestialTree + InfoPanel MERGED 2026-05-06)
  - #405 (폐기 코드 정리 — 후속 분리)
- 코드 SSoT (가드 적용 대상): [`apps/web/src/components/panels/scenario-presets.tsx`](../../apps/web/src/components/panels/scenario-presets.tsx)
- SSoT (R-Phase allowlist): [`packages/core/src/scene/r-phase-allowlist.ts`](../../packages/core/src/scene/r-phase-allowlist.ts)
- volt [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작)
- volt [#76](https://github.com/coseo12/volt/issues/76) (PM DoD 구조 drift)
- volt [#77](https://github.com/coseo12/volt/issues/77) (단계 게이트)
- volt [#78](https://github.com/coseo12/volt/issues/78) (헤드리스 ≠ 실 브라우저)
- volt [#82](https://github.com/coseo12/volt/issues/82) (worktree base drift)
- volt [#83](https://github.com/coseo12/volt/issues/83) (sub-agent cross-validate 응답 박제)
