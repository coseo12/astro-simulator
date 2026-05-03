# ADR: R-Phase Body Allowlist Guard — defense-in-depth 정책 + 진입 갱신 절차

- **상태**: Accepted
- **날짜**: 2026-05-04
- **결정자**: architect (#402 PM 합의 라운드 1, 2026-05-03 후 위임)
- **관련**: #402 (본 이슈 — Top 1 FocusQuickButtons), #403 (Top 2 CelestialTree+InfoPanel 후속), #404 (Top 3 ScenarioPresets 후속), #405 (폐기 코드 정리 후속), `20260425-r1-store-scene-sync-unification.md` (event 단일 진실원 — 본 ADR §결정 3 근거), `20260425-r1-sun-visualization.md` (R-Phase incremental build SSoT), `20260428-r2-mercury-visualization.md` (R-Phase ADR 패턴 SSoT), `20260503-378-focus-frustum-fix.md` (defense-in-depth 옵션 D 패턴 인용), `20260503-397-residual-no-op.md` (R-Phase 정합 종료 조건 → 본 이슈에서 expected list 자동화)
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21) — `R_PHASE_BODY_ALLOWLIST` 박제 전 grep 결과 0 확인), "숨은 상수 변형" (volt [#69](https://github.com/coseo12/volt/issues/69) — 4곳 동시 박제 의무로 drift 방지), "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — 본 이슈 자체가 정량 매트릭스 PASS 아래 UX 회귀 잔존의 후속), "PM DoD 구조 drift" (volt [#76](https://github.com/coseo12/volt/issues/76) — 본 ADR 의 4곳 박제 절차는 PM DoD 의 영구 정책 버전), "Explore 미결정 시 debug 실측" (volt [#67](https://github.com/coseo12/volt/issues/67) — 본 ADR 은 정적 분석으로 결정 충분), "단계 게이트" (volt [#77](https://github.com/coseo12/volt/issues/77) — architect 후 reviewer/qa 게이트 의무), "헤드리스 ≠ 실 브라우저" (volt [#78](https://github.com/coseo12/volt/issues/78) — DoD-5 사용자 D-T2 실 Chrome 권고)

---

## 배경

PR #399 (#378 focus frustum fix) + PR #401 (#397 residual NO-OP 재평가) 머지 후 사용자 D-T2 (2026-05-03) 추가 보고:

> "수성, 금성은 개선됨, 아직 구현안된 행성들은 이전 잔재로 판단"
> "아직 그대로임 아마 이전 구현 버튼과 기능이 동작하면서 문제를 일으키는 듯"

#397 NO-OP 종결 후에도 사용자가 보는 화면 동일 회귀. **사용자 가설**: P10~P12 시대 UI 컴포넌트 잔존이 systemic 문제.

### v3 reset 정책 정합성 누락

v3 reset (2026-04-25) 후 R-Phase incremental build (R1 sun + R2 mercury + R3 venus 까지 구현, R4~R10 미구현) 와 UI 정합성 가드 누락. Explore 조사로 정합성 위반 Top 3 식별 — 본 ADR 은 **Top 1 FocusQuickButtons** 우선 해결 (Q6=(b) 채택).

근본 원인: R-Phase 진행에 따른 "구현된 body" 의 진실원 부재. `BODY_SCALE` 룩업은 시각 과장 배수 박제용이고, R-Phase 진입 의무 (어떤 body 가 활성?) 와 별도 SSoT 가 필요. shortcut bar 6 버튼 (sun/mercury/venus/**earth/jupiter/neptune**) 모두 활성 → R4+ body focus 호출 시 scene 가드 없음 → `DEFAULT_BODY_SCALE = 1.0` 으로 미구현 body 가 점/잔재 표시.

### PM 합의 (라운드 1, 2026-05-03)

| Q      | 결정                               | 의미                                                                                                              |
| ------ | ---------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **Q1** | (ii) R-Phase 진행에 따라 점진 활성 | sun/mercury/venus 활성, earth/jupiter/neptune disabled. R4 진입 시 earth 자동 활성, R6 시 jupiter, R10 시 neptune |
| **Q5** | (C) defense-in-depth               | UI + scene 둘 다 가드 (#378 옵션 D 패턴 일관)                                                                     |
| **Q6** | (b) Top 1 우선                     | Top 2/3 (#403/#404) 후속 분리                                                                                     |
| **Q4** | (ii) 폐기 코드 별도                | #405 후속                                                                                                         |

본 ADR 은 **R-Phase allowlist SSoT + UI/scene 가드 패턴 + 진입 갱신 절차** 를 영구 정책으로 박제. 단발성 #402 fix 가 아닌 **R4~R10 진행 동안 적용될 정책**.

---

## 후보 비교

### 축 1 — `R_PHASE_BODY_ALLOWLIST` SSoT 위치

| 후보                                                  | 장점                                                                                                                       | 단점                                                                                                                                    | 비고      |
| ----------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **A. `packages/core/src/scene/r-phase-allowlist.ts`** | scene-level focusOn 가드가 직접 import 가능. defense-in-depth 의 scene 측면 단일 SSoT 보장. R-Phase 진입 시 단일 파일 수정 | web app UI 가드 (focus-quick-buttons.tsx) 도 동일 SSoT 참조 필요 — `@astro-simulator/core` 의 scene namespace 경유 가능 (이미 export됨) | **채택**  |
| B. `packages/shared/src/r-phase-allowlist.ts`         | 단순 readonly 상수 + helper 만 — shared 가 적합. core / web 양쪽 import 부담 0                                             | shared 는 데이터/타입/이벤트 layer 인데 R-Phase 정책은 도메인 정책이라 layer 의미 약함                                                  | 차선      |
| C. `apps/web/src/constants/r-phase-allowlist.ts`      | UI 가드 측면만 보면 가장 가까운 위치                                                                                       | core 가 web 을 import 못 하므로 scene 가드는 별도 박제 필요 → defense-in-depth 위반 (Q5=(C) 실패)                                       | 즉시 기각 |

### 축 2 — UI 가드 패턴 (FocusQuickButtons)

| 후보                                                      | 장점                                                                             | 단점                                                                                                                     | 비고      |
| --------------------------------------------------------- | -------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------ | --------- |
| **A. HTML `disabled` + tooltip wrapper + opacity/cursor** | 표준 a11y. screen reader 가 disabled 인지. SSoT 단순 (단일 속성으로 비활성 박제) | tooltip 은 disabled 버튼에선 hover 안 잡힘 (브라우저 표준) — wrapper span (`<span title="...">` / radix-ui Tooltip) 필요 | **채택**  |
| B. `aria-disabled="true"` + onClick 무시 + tooltip        | focus 가능 (a11y) + tooltip 정상 동작 (button 자체는 활성)                       | onClick 가드를 명시적으로 추가해야 함 (실수 시 동작). SSoT 가 두 곳 (aria-disabled + onClick guard)                      | 차선      |
| C. 버튼 hide (display:none)                               | 단순                                                                             | Q1=(ii) "추가만 제거 없이" 정책 + v3 reset 메모리 박제 ("HUD + 4개 shortcut 구조 보존") 위배                             | 즉시 기각 |

### 축 3 — Scene 가드 패턴 (focusOn handler)

| 후보                                                   | 장점                                                                                                                                                                                                       | 단점                                                                                                                                                     | 비고      |
| ------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- |
| **A. `simulation-core.ts` `case 'focusOn'` emit 차단** | store/scene/UI 동기화 단일 진실원이 event — emit 차단 시 store/scene/UI 자동 0 변화. core-adapter / sim-canvas subscribe / url-sync 모두 영향 없음 (다 event 소비자). URL `?focus=earth` 도 동일 가드 통과 | silent ignore — UI 강제 클릭 시 사용자 피드백 0. but DoD-2 의 UI 가드가 1차 선언적 피드백 담당 — scene 은 마지막 방어선                                  | **채택**  |
| B. `sim-canvas.tsx` subscribe 분기에서 검증            | scene 측면만 영향. core 변경 없음                                                                                                                                                                          | store 의 selectedBodyId 는 이미 변경됨 → store 와 scene 가 desync. ADR `20260425-r1-store-scene-sync-unification.md` §결정 1 의 "event 단일 진실원" 위배 | 즉시 기각 |
| C. emit 차단 + subscribe 이중 가드                     | 강한 방어                                                                                                                                                                                                  | 단일 SSoT 원칙 위배. 후보 A 의 emit 차단만으로 store/scene/UI 자동 0 변화 → 이중 가드 불필요                                                             | 기각      |

### 축 4 — R-Phase 진입 갱신 절차 (Q1=(ii) 핵심)

| 후보                                                                    | 장점                                                      | 단점                                                                                                   | 비고                    |
| ----------------------------------------------------------------------- | --------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ | ----------------------- |
| A. ADR 신규 (R4/R6/R10 ADR) 만                                          | 단순                                                      | ADR 갱신 누락 시 `R_PHASE_BODY_ALLOWLIST` 와 BODY_SCALE / scene 박제 drift 가능 (volt #69 패턴)        | 단일 박제 부족          |
| **B. ADR + allowlist + 회귀 가드 expected list + CHANGELOG (4곳 동시)** | drift 방지. R-Phase 진입 PR 의 reviewer 체크리스트로 강제 | 4곳 박제 부담 — but BODY_SCALE 도 동일 패턴 (R1 ADR §Concrete Prediction "R2 추가 시 1줄") 검증 정착됨 | **채택**                |
| C. 자동화 (ADR hook 으로 allowlist 자동 추출)                           | drift 0                                                   | 본 sprint scope 밖. 자동화 인프라 비용 > drift 방지 ROI (4곳 박제는 R4/R6/R10 3회)                     | 후속 인프라 이슈로 분리 |

---

## 결정

4축 통합 결정:

1. **`R_PHASE_BODY_ALLOWLIST` SSoT 위치**: `packages/core/src/scene/r-phase-allowlist.ts` (축 1 후보 A)
   - 근거: R-Phase 정책의 진짜 진실원은 scene focus 의무 — UI 는 거기 따르는 클라이언트. `BODY_SCALE` 은 web rendering 결정이고 R-Phase 정책은 simulation domain 결정 (계층 의미 차이). core 의 scene namespace 가 이미 export됨 (`packages/core/src/index.ts`).

2. **UI 가드 패턴**: HTML `disabled` 속성 + tooltip wrapper + opacity 0.5 + cursor:not-allowed (축 2 후보 A)
   - 근거: Q1=(ii) 점진 활성 — 미구현 body 는 명시적으로 "쓸 수 없음" 시그널이 a11y 측면에서 정확. tooltip 은 wrapper span (`<span title="R4 이후 구현 예정">`) 으로 disabled 버튼 위에 박제. 회귀 가드 selector 노출용 `data-r-phase-disabled="true"` 속성 추가.

3. **Scene 가드 패턴**: `simulation-core.ts` `case 'focusOn'` 의 allowlist 검증 + `console.warn` + emit 차단 (축 3 후보 A)
   - 근거: ADR `20260425-r1-store-scene-sync-unification.md` §결정 1 의 "event 단일 진실원" 정책 일관. emit 차단 시 store/scene/UI 자동 0 변화 (DoD-3 의 "selectedBodyId 변화 0 / camera radius 변화 0" 자동 충족). URL `?focus=earth` 진입도 url-sync.tsx 의 `sendCommand({type:'focusOn'})` 가 simulation-core 통과 → 동일 가드 (URL 직접 진입도 차단 = 추가 회귀 보호).

4. **R-Phase 진입 갱신 절차** (영구 정책, 4곳 동시 박제 — 축 4 후보 B):
   - **R4 진입 (지구)** → `R_PHASE_BODY_ALLOWLIST` 에 `'earth'` 추가 + R4 ADR §결정 N 에 본 ADR §결정 4 cross-link + 회귀 가드 expected list 갱신 (아래 매트릭스) + CHANGELOG `### Behavior Changes`
   - **R6 진입 (목성)** → `'jupiter'` 동일 절차
   - **R10 진입 (해왕성)** → `'neptune'` 동일 절차
   - **R5/R7/R8/R9/R11+** (mars/saturn/uranus/pluto/moon 등) → 각 R-Phase ADR 에 동일 절차 명시 + 본 ADR §결정 4 가 SSoT 참조

   **회귀 가드 갱신 매트릭스** (R-Phase 진입 시 자동 / 수동 갱신 대상):

   | 가드 파일                                                  | 갱신 방식                                                                                                                 | 영향                                                                               |
   | ---------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------- |
   | `apps/web/scripts/browser-verify-r-phase-allowlist.mjs`    | 수동 (`EXPECTED_ENABLED` / `EXPECTED_DISABLED` 갱신)                                                                      | UI/Scene 가드 정합성 — 신규 활성 body 가 enabled 인지 검증                         |
   | `apps/web/scripts/browser-verify-378-focus.mjs`            | **자동** (`R_PHASE_BODY_ALLOWLIST` import)                                                                                | focus 회귀 가드 매트릭스 자동 확장 (3 body × 2 모드 → 4 → 5 → 6 cells)             |
   | `apps/web/scripts/browser-verify-379-lod.mjs` 시나리오 B   | **자동** (`R_PHASE_BODY_ALLOWLIST` import, sun 제외)                                                                      | T3 focus high LOD 보장 매트릭스 자동 확장                                          |
   | `apps/web/scripts/browser-verify-397-residual.mjs`         | **자동** (`R_PHASE_BODY_ALLOWLIST` import) + 수동 (`R_PHASE_EXPECTED` 갱신 — sun/jupiter focus 의 expected residual list) | residual 매트릭스 자동 확장 + R6 jupiter 진입 시 io 등 갈릴레이 moon expected 박제 |
   | 코드 SSoT (`packages/core/src/scene/r-phase-allowlist.ts`) | **수동**                                                                                                                  | body id 추가 (1줄)                                                                 |
   | ADR (해당 R-Phase ADR §결정 N)                             | 수동                                                                                                                      | 본 ADR cross-link                                                                  |
   | CHANGELOG `### Behavior Changes`                           | 수동                                                                                                                      | "R4 진입 — 'earth' R-Phase allowlist 추가" 박제                                    |

   **단일 SSoT 의 가치**: R4~R10 진입 시 `R_PHASE_BODY_ALLOWLIST` 1줄 변경만으로 378/379B/397 가드 매트릭스가 **자동 확장**. `verify:r-phase-allowlist` 의 `EXPECTED_ENABLED`/`EXPECTED_DISABLED` + `verify:397-residual` 의 `R_PHASE_EXPECTED` 만 수동 갱신 (정책 의미 영역이라 자동화 부적). cross-validate 권고 + qa #407 라운드 1 BLOCK 후 보강 (2026-05-03).

### 초기 박제값

```typescript
// packages/core/src/scene/r-phase-allowlist.ts
/**
 * R-Phase 진행에 따라 focus 가능한 body id 의 단일 진실원.
 *
 * 본 SSoT 외 body 는 simulation-core focusOn handler 가 emit 차단 (defense-in-depth scene 측면).
 * UI (focus-quick-buttons.tsx) 도 본 SSoT 참조 후 disabled 처리 (defense-in-depth UI 측면).
 *
 * R-Phase 진입 시 4곳 동시 박제 의무 (ADR `20260504-r-phase-allowlist-guard.md` §결정 4):
 *   1. 본 파일에 body id 추가
 *   2. 해당 R-Phase ADR §결정 N 에 본 ADR cross-link
 *   3. apps/web/scripts/browser-verify-r-phase-allowlist.mjs expected list 갱신
 *   4. CHANGELOG `### Behavior Changes` 박제
 *
 * 현재 박제: R1 sun (#329) + R2 mercury (#361) + R3 venus (#369)
 */
export const R_PHASE_BODY_ALLOWLIST = Object.freeze(['sun', 'mercury', 'venus'] as const);

export type RPhaseBodyId = (typeof R_PHASE_BODY_ALLOWLIST)[number];

export function isRPhaseFocusable(bodyId: string | null | undefined): boolean {
  if (bodyId === null || bodyId === undefined) return true; // null = resetCamera/free-fly 허용
  return (R_PHASE_BODY_ALLOWLIST as readonly string[]).includes(bodyId);
}
```

> 주의: `null` 입력은 `true` 반환 — `resetCamera` 시 emit 되는 `bodySelected: { id: null }` 경로를 차단하지 않기 위함. 본 ADR §결정 3 은 **focusOn case 의 bodyId 비-null 입력만 검증** 한다.

---

## 결과·재검토 조건

### 기대 효과 (측정 가능)

- **DoD-2 / DoD-3**: shortcut bar earth/jupiter/neptune 클릭 → `selectedBodyId` 변화 0 / camera radius 변화 0 (회귀 가드 단언)
- **DoD-4**: `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` CI 통합 → 회귀 시 빌드 fail
- **DoD-5**: 사용자 D-T2 실 Chrome — earth/jupiter/neptune 잔재 0 시각 확인
- **a11y**: disabled 버튼이 screen reader 에서 "비활성화됨" 인지

### 트레이드오프로 받아들인 비용

- **silent ignore 의 사용자 피드백 0** (UI 우회 강제 클릭 시) — UI 가드가 1차 방어선이므로 정상 사용 경로에서는 무관. 회귀 시 console.warn 으로 개발자 진단 가능
- **4곳 동시 박제 부담** — R4/R6/R10 진입 시마다 4곳 갱신. 자동화는 본 ADR §결과·재검토 조건 1 의 트리거 시 분리

### Concrete Prediction

- **A. R4 ADR 박제 시 코드 변경**: `r-phase-allowlist.ts` 1줄 + `browser-verify-r-phase-allowlist.mjs` 1줄 + CHANGELOG 1줄 + R4 ADR cross-link (총 4곳, 각 1~2줄)
  - 검증: `git diff --stat` — R4 진입 PR 에서 위 4곳 외 R-Phase allowlist 관련 변경 0 줄. 미달 시 SSoT drift 의심
  - 실패 시 대응: drift 발견 위치를 본 ADR amendment 로 박제 + 자동화 후속 이슈 (재검토 조건 1) 즉시 박제
- **B. R3 venus BODY_SCALE 미박제 사실**: 본 PR 머지 후 발견 — `apps/web/src/constants/body-scale.ts` 에 venus 항목 부재 (현재 sun/mercury 만). R3 진입 ADR 누락 가능성. 후속 이슈 분리 (본 ADR scope 밖) — `R_PHASE_BODY_ALLOWLIST` 는 venus 포함 (R3 #369 closed) 이지만 `BODY_SCALE` drift 가 발견된 것 자체가 본 ADR §결정 4 절차 부재의 증거

### 재검토 조건

1. **R-Phase 진입 절차에서 4곳 동시 박제 누락 발견 시** → 자동화 후속 이슈 (축 4 후보 C) 즉시 박제. 본 ADR amendment 로 자동화 SSoT cross-link
2. **`R_PHASE_BODY_ALLOWLIST` 가 5개 이상 도달 시** (예: R6 진입 시 sun/mercury/venus/earth/mars/jupiter) → 자동화 ROI 재평가 (수동 4곳 박제 vs 자동화 인프라 비용)
3. **scene 가드 emit 차단이 다른 명령에도 필요 시** (`resetCamera` / `setLodOverride` / `setCameraRadius` 등) → 별도 ADR 박제. 본 ADR 은 `focusOn` 만 다룸
4. **shortcut 버튼 자체 hide / 제거 정책 변경 시** → "추가만 제거 없이" 정책 (Q1=(ii)) 폐기 ADR 선행 필수. 본 ADR 보다 상위 정책

---

### 교차검증 반영 사항

cross-validate 1회 (2026-05-04, anchor=ADR 신규, outcome=applied — `.claude/logs/cross-validate-architecture-20260504-001612.log`).

**Claude 편향 4종 셀프 체크 통과**: 낙관적 일정 N/A / 결합 간과 통과 (defense-in-depth UI+scene 결합 명시) / 폐기 프레이밍 통과 (Accepted, 외부 조건부 경계 없음) / 순수주의 통과 (shared 도 차선으로 인정).

#### 합의 (Claude 설계와 일치 — Gemini 양호 평가)

- 구조적 완성도, 기술 결정 타당성, 인터페이스 명확성, 확장성, 강건성(심층 방어) 측면 모두 "매우 우수~우수"
- SSoT 위치 (core/scene), UI HTML disabled, scene emit 차단, 4곳 동시 박제 절차 전부 양호
- `BODY_SCALE` venus 누락 발견 (Concrete Prediction B) — 설계 깊이의 증거로 평가

#### 이견 수용

- 없음. Gemini 가 결정 4축 모두 합의

#### Claude 재분석으로 기각한 Gemini 제안

- 없음. Gemini 가 결정에 대한 반대 의견 없이 보완 제안만 제시

#### 고유 발견 (현재 ADR 에 즉시 반영)

1. **PR 템플릿 R-Phase 진입 체크리스트 추가** (Gemini 제안):
   - "reviewer 체크리스트로 강제" 를 넘어 GitHub PR 템플릿에 4곳 박제 항목 명문화
   - 범위 체크: 본 ADR §결과·재검토 조건 1 (자동화 ROI 임계) 의 **경량화 버전** — 본 ADR 본문 권고로 즉시 박제 가능 (PR 템플릿 실제 도입은 R4 진입 PR 또는 별도 인프라 이슈로 분리)
   - 반영: 아래 §결정 4 보강 항목으로 박제 (PR 템플릿 도입 권고)
2. **#403/#404 후속 이슈가 본 ADR SSoT 사용 의무 명시** (Gemini 제안):
   - 후속 이슈 본문에서 `R_PHASE_BODY_ALLOWLIST` 인용 + 본 ADR cross-link
   - 범위 체크: 본 ADR §관련 ADR / §참고 에서 #403/#404 cross-link 이미 명시됨. 후속 이슈 생성 시 본문 박제 의무 — 본 ADR §비-범위 보강

#### 고유 발견 (후속 분리)

- 없음. Gemini 제안 모두 본 ADR 범위 내 박제로 충분

### 결정 4 보강 (cross-validate 반영)

**PR 템플릿 R-Phase 진입 체크리스트 도입 권고** (실 도입은 R4 진입 시점 또는 별도 인프라 이슈):

```markdown
### R-Phase 진입 체크리스트 (해당 PR 만)

- [ ] `packages/core/src/scene/r-phase-allowlist.ts` body id 추가 (단일 SSoT)
- [ ] `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` `EXPECTED_ENABLED` / `EXPECTED_DISABLED` 갱신
- [ ] `apps/web/scripts/browser-verify-397-residual.mjs` `R_PHASE_EXPECTED` 갱신 (sun/jupiter focus 등 expected residual)
- [ ] `verify:378-focus` / `verify:379-lod` / `verify:397-residual` 매트릭스 모두 PASS 자동 확장 확인
- [ ] `CHANGELOG.md` `### Behavior Changes` 박제
- [ ] 본 R-Phase ADR 에 `20260504-r-phase-allowlist-guard.md` cross-link
```

근거: Gemini cross-validate 권고. 실수 방지 강화 — 본 ADR §결과·재검토 조건 1 (자동화 ROI) 의 경량 선행 단계.

### Amendment 2026-05-03 (qa #407 라운드 1 BLOCK 후 보강)

qa 동적 검증 (PR #407 코멘트) 4건 BLOCK 발견:

- B1: `verify:378-focus` 6/12 FAIL (earth/jupiter/neptune focus cell 의 DoD-3 FAIL)
- B2: `verify:379-lod` 시나리오 B FAIL (focusTargets=`['earth','mars']` 둘 다 R-Phase 가드 차단)
- B3: `verify:397-residual` 6/12 FAIL (earth/jupiter/neptune focus cell + sun/mercury/venus 의 unexpected residual)
- B4 (메타): 본 ADR §결정 4 "4곳 동시 박제" 가 자기 자신만 박제, 기존 378/379/397 가드 갱신 의무 누락

**근본 원인**: 본 PR 박제 시점에 `simulation-core.ts focusOn` 가드가 earth/jupiter/neptune/mars 차단을 추가했으나, 기존 회귀 가드 3개 (`verify:378-focus`, `verify:379-lod` 시나리오 B, `verify:397-residual`) 의 매트릭스 가정 (6 body 모두 focus 가능) 과 충돌.

**해소 (PR #407 보강 커밋, 2026-05-03)**:

1. **단일 SSoT import 적용** (옵션 A.5) — 3 verify 스크립트가 `R_PHASE_BODY_ALLOWLIST` 를 `@astro-simulator/core/scene` 에서 import. R4 진입 시 allowlist 1줄 변경만으로 378/379B/397 매트릭스 자동 확장 (수동 갱신 0 건).
2. §결정 4 본문에 **회귀 가드 갱신 매트릭스** 추가 — 7개 박제 위치 + 자동/수동 구분 + 영향 명시.
3. 헤더 주석 — 3 verify 파일 모두 "R-Phase 진입 시 본 SSoT 자동 확장" 명시.
4. CHANGELOG `### Behavior Changes` — R-Phase 정합 갱신 사실 박제.

**volt 교훈 활용**: volt #69 ("숨은 상수 변형") — 본 보강은 "박제 시점에 하나의 SSoT 만 변경하면 위성 모듈 N 개가 자동 따라옴" 패턴의 강화. 단일 SSoT 가 grep 만으로 drift 검출 가능.

## 비-범위

- **Top 2** (CelestialTree + InfoPanel R-Phase allowlist) — #403 후속 이슈 (Q6=(b)). **본 ADR SSoT (`R_PHASE_BODY_ALLOWLIST`) 인용 의무** — 후속 이슈 본문에 본 ADR cross-link 박제
- **Top 3** (ScenarioPresets R6 이전 disabled) — #404 후속 이슈 (Q6=(b)). 본 ADR SSoT 인용 의무 동일
- **폐기 코드** (BlackHoleDiskPanel `?bh=2` opt-in / AboutModal P12 폐기 원칙 문구) — #405 후속 이슈 (Q4=(ii))
- **#400 AU 슬라이더** — 별개 이슈
- **shortcut 버튼 자체 hide / 제거** — Q1=(ii) "추가만 제거 없이" 정책 보존
- **R4 진입 자체** — 별개 R-Phase 진입 결정
- **자동화 hook** (4곳 동시 박제 자동화) — 재검토 조건 1/2 시 분리
- **`resetCamera` / 기타 명령 가드** — 재검토 조건 3 시 별도 ADR

---

## 참고

- 발화점: PR #399 사용자 D-T2 (2026-05-03), PR #401 #397 NO-OP 후 사용자 추가 보고
- Builds on: #378 (focus fix, MERGED), #397 (NO-OP 재평가)
- 이슈: [#402](https://github.com/coseo12/astro-simulator/issues/402)
- 후속 이슈 (예정): #403 (Top 2), #404 (Top 3), #405 (폐기 코드)
- 코드 SSoT:
  - `apps/web/src/components/layout/focus-quick-buttons.tsx` (UI 가드 박제 대상)
  - `packages/core/src/scene/r-phase-allowlist.ts` (SSoT 신규)
  - `packages/core/src/engine/simulation-core.ts:201` (focusOn handler 가드 박제 대상)
  - `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` (회귀 가드 신규)
- volt 교훈: [#21](https://github.com/coseo12/volt/issues/21), [#67](https://github.com/coseo12/volt/issues/67), [#69](https://github.com/coseo12/volt/issues/69), [#74](https://github.com/coseo12/volt/issues/74), [#76](https://github.com/coseo12/volt/issues/76), [#77](https://github.com/coseo12/volt/issues/77), [#78](https://github.com/coseo12/volt/issues/78)
