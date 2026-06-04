# ADR: R-Phase Body Allowlist Guard — defense-in-depth 정책 + 진입 갱신 절차

- **상태**: Accepted
- **날짜**: 2026-05-04
- **결정자**: architect (#402 PM 합의 라운드 1, 2026-05-03 후 위임)
- **관련**: #402 (본 이슈 — Top 1 FocusQuickButtons), #403 (Top 2 CelestialTree+InfoPanel 후속), #404 (Top 3 ScenarioPresets 후속), #405 (폐기 코드 정리 후속), #415 (store mutation 측면 3번째 방어선 — `20260504-415-url-sync-guard.md`), `20260425-r1-store-scene-sync-unification.md` (event 단일 진실원 — 본 ADR §결정 3 근거), `20260425-r1-sun-visualization.md` (R-Phase incremental build SSoT), `20260428-r2-mercury-visualization.md` (R-Phase ADR 패턴 SSoT), `20260503-378-focus-frustum-fix.md` (defense-in-depth 옵션 D 패턴 인용), `20260503-397-residual-no-op.md` (R-Phase 정합 종료 조건 → 본 이슈에서 expected list 자동화)
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

   > **Amendment (#613, 2026-06-04) — `R_PHASE_BODY_ALLOWLIST` 자동 생성으로 절차 간소화 (ADR `20260604-613-r-phase-metadata-ssot.md`)**: 본 §결정 4 의 "①`R_PHASE_BODY_ALLOWLIST` 에 body id 직접 추가" 절차는 **소멸**한다. body 데이터(`solar-system.json`)의 `introducedInRPhase` 메타데이터를 `CURRENT_R_PHASE` 로 필터해 allowlist 를 자동 생성하므로, R-Phase 진입 시 **`CURRENT_R_PHASE` 1줄 증가** 로 대체된다 (R6+ body 는 데이터에 사전 부여됨). 나머지 박제(②ADR cross-link / ③browser-verify `FOCUS_BODIES` 갱신 / ④CHANGELOG)는 존속 — #598 정적 가드가 자동 생성값 ↔ `FOCUS_BODIES` 정합을 계속 차단. 즉 동시 박제 **4곳 → 3곳** (allowlist 직접 박제만 자동화). 아래 R4/R6/R10 예시의 "allowlist 추가"는 "`CURRENT_R_PHASE` 증가"로 읽는다.

   - **R4 진입 (지구)** → `R_PHASE_BODY_ALLOWLIST` 에 `'earth'` 추가 + R4 ADR §결정 N 에 본 ADR §결정 4 cross-link + `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` expected list 갱신 + CHANGELOG `### Behavior Changes`
   - **R6 진입 (목성)** → `'jupiter'` 동일 절차
   - **R10 진입 (해왕성)** → `'neptune'` 동일 절차
   - **R5/R7/R8/R9/R11+** (mars/saturn/uranus/pluto/moon 등) → 각 R-Phase ADR 에 동일 절차 명시 + 본 ADR §결정 4 가 SSoT 참조
   - **외부 진입점 가드 의무** (#415 add-on, `20260504-415-url-sync-guard.md` §결정 1·5): URL 파라미터 / deep link / programmatic command 등 store action 직접 호출 진입점 신설 시 `isRPhaseFocusable` 가드 통합 의무 + 회귀 가드 mjs 시나리오 4 매트릭스 갱신

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
5. **§결정 4 표 누적 행 수 N ≥ 5 도달 시** → 별도 ADR 분리 검토 발화.
   - **분리 절차**:
     - (a) `docs/decisions/<YYYYMMDD>-r-phase-amendment-checklist.md` 신규 ADR 박제 후 표 이전
     - (b) 본 ADR §결정 4 표 위치에는 신규 ADR 로의 cross-link 만 잔존 (history 보존, ~~취소선~~ 항목 포함)
     - (c) 폐기 ADR 박제 시 본 §결정 4 의 R-Phase 진입 절차 본문은 SSoT 유지
   - **임계값 근거**: R-Phase R10 까지 총 ~6 행 예상의 절반 도달 시 §결정 4 본질 정책 (R-Phase allowlist guard) 가독성 보전
   - 후속 이슈 [#462](https://github.com/coseo12/astro-simulator/issues/462) 박제 (PR #460 reviewer non-blocking #2)

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

- [ ] `packages/core/src/scene/r-phase-allowlist.ts` body id 추가
- [ ] `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` expected list 갱신
- [ ] `CHANGELOG.md` `### Behavior Changes` 박제
- [ ] 본 R-Phase ADR 에 `20260504-r-phase-allowlist-guard.md` cross-link
```

근거: Gemini cross-validate 권고. 실수 방지 강화 — 본 ADR §결과·재검토 조건 1 (자동화 ROI) 의 경량 선행 단계.

#### R-Phase 진입 시 Amendment 검토 의무 (누적)

R-Phase 진입 시점에 신규 결정이 기존 ADR 의 전제와 상충할 수 있는 경우, 진입 PR 에 해당 ADR Amendment / 폐기 검토를 동반한다. 본 표는 누적되며, R5+ 진입 시 1행씩 추가한다. 폐기 항목은 행 제거 대신 ~~취소선~~ + 폐기 PR cross-link 로 history 를 보존한다.

**누적 행 수 임계값 (분리 트리거)**: 본 표 행 수 **N ≥ 5** 도달 시 별도 ADR 분리 검토 발화 (§재검토 조건 #5). 임계값 근거: R-Phase 는 R10 까지 총 ~6 행 예상의 절반 도달 시점 — 조기 분리로 §결정 4 본질 정책 (R-Phase allowlist guard) 가독성을 보전. 폐기 ~~취소선~~ 항목도 행 수에 포함 (history 보존 부담 누적 신호).

| trigger R-Phase | 검토 대상 ADR | 검토 의도 | 박제 PR | 박제 시점 |
| --- | --- | --- | --- | --- |
| R4 (earth) | [docs/decisions/20260512-au-slider-semantics.md](20260512-au-slider-semantics.md) | viewport-aware scaling 도입 결정 박제 시 동일 PR 에 본 ADR Amendment (AU 슬라이더 의미 확장) | #460 | 2026-05-14 |

**근거**: ADR 20260512 §결정 C "구조적 가드" (Gemini cross-validate 2026-05-12 Q5 이견 수용) + 이슈 [#454](https://github.com/coseo12/astro-simulator/issues/454).

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
- 라운드별 PR 추적 (라운드 2 정정 시 보강):
  - 라운드 1 ADR 박제: PR #406 (merged `3c90844`)
  - 라운드 1 sprint 폐기: PR #407 (closed `3eed4e0` — turbopack `__dirname` SSR 500 회귀)
  - **라운드 2 ADR Amendment**: [PR #413](https://github.com/coseo12/astro-simulator/pull/413) (head `fix/402-r-phase-allowlist-guard-round2`, 본 ADR Amendment + 라운드 2 정정 본 박제)
  - **라운드 2 developer 코드 구현**: [PR #414](https://github.com/coseo12/astro-simulator/pull/414) (head `fix/402-r-phase-allowlist-guard-round2-impl`, commit `d6eb2c5`, 514/515 단위 + 12/12 회귀 가드 + SSR 200 PASS — 라운드 2 정정 발견)
- 코드 SSoT:
  - `apps/web/src/components/layout/focus-quick-buttons.tsx` (UI 가드 박제 대상)
  - `packages/core/src/scene/r-phase-allowlist.ts` (SSoT 신규)
  - `packages/core/src/scene/index.ts` (re-export 의도적 회피 — 라운드 2 정정)
  - `packages/core/src/index.ts` (named export 직접 박제 — 라운드 2 정정)
  - `packages/core/src/engine/simulation-core.ts:201` (focusOn handler 가드 박제 대상)
  - `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` (회귀 가드 신규)
  - `scripts/verify-core-exports-immutable.sh` (D2 자동화 — WASM-safe 화이트리스트 SSoT)
- volt 교훈: [#21](https://github.com/coseo12/volt/issues/21), [#67](https://github.com/coseo12/volt/issues/67), [#69](https://github.com/coseo12/volt/issues/69), [#70](https://github.com/coseo12/volt/issues/70) (monorepo dist stale), [#74](https://github.com/coseo12/volt/issues/74), [#76](https://github.com/coseo12/volt/issues/76), [#77](https://github.com/coseo12/volt/issues/77) (헤드리스 ≠ 실 Chrome / 단계 게이트), [#78](https://github.com/coseo12/volt/issues/78), [#79](https://github.com/coseo12/volt/issues/79)

---

## Amendment 2026-05-04 — Turbopack `__dirname` SSR 500 회귀 + wasm-safe 패턴 박제 (라운드 2)

> **상태**: 라운드 1 §결정 1/4 갱신 — sub-path export 폐기, **named export 직접 박제** (core/src/index.ts) + scene/index.ts re-export 의도적 회피. §결정 2/3 보존. 라운드 2 정정 (2026-05-04, PR #414 실측 발견 반영).
> **트리거**: PR #407 (라운드 1 sprint, closed `3eed4e0`) 머지 직전 사용자 D-T2 (2026-05-04) 보고.
> **사용자 D-T2 인용**: "다시 포커스 시 이상현상이 재발했어" / "금성 클릭시 허공에 포커스됨 또한 한번에 포커스가 자연스럽게 되지 않고 반복되듯 줌하는 현상"
> **라운드 2 정정 사유 (2026-05-04, PR #414)**: 본 Amendment 초안의 "namespace re-export 강제" 패턴 (`sceneApi.isRPhaseFocusable`) 도 SSR 500 동일 발현 확인. 원인은 turbopack 이 namespace 경유 시 `packages/core/src/scene/index.ts` re-export chain → `solar-system-scene.ts` → `nbody-engine.ts` → `physics_wasm.js:367` (`${__dirname}`) evaluation 까지 trigger 하기 때문. **D1 정정**: namespace re-export 폐기 → `core/src/index.ts` named export 직접 박제 + `scene/index.ts` 의도적 회피로 교체. SSR 200 회복 확인 (PR #414 실측).

### 회귀 메커니즘 박제 (forensic)

PR #407 가 다음 변경 적용:

1. **`packages/core/package.json` exports field** 에 sub-path 추가:
   ```json
   "./scene/r-phase-allowlist": {
     "types": "./dist/scene/r-phase-allowlist.d.ts",
     "import": "./dist/scene/r-phase-allowlist.js"
   }
   ```
2. **`packages/core/src/engine/simulation-core.ts`** focusOn 가드:
   ```ts
   import { isRPhaseFocusable } from '../scene/r-phase-allowlist.js';
   ```

**SSR HTTP 500** (`ENOENT: ... /ROOT/packages/physics-wasm/pkg/physics_wasm_bg.wasm`) 발현. 메인 working tree dev 서버 직접 검증으로 확정 (develop tip `3c90844` SSR 200 / PR #407 head 만 SSR 500).

#### 3자 결합 메커니즘

```
wasm-pack `--target nodejs` 출력 (physics_wasm.js:367)
        ↓
const wasmPath = `${__dirname}/physics_wasm_bg.wasm`;
const wasmBytes = require('fs').readFileSync(wasmPath);
        ↓
Next.js 15 SSR runtime (turbopack)
        ↓
turbopack module dep graph 변경 (sub-path entry 추가) →
__dirname resolve = '/ROOT/...' (가상 path) → ENOENT
        ↓
SSR HTTP 500 → 클라이언트 hydration 부분 실패 →
physics engine 미초기화 → mesh.position 미갱신 →
사용자 D-T2 "허공 포커스 + 반복 줌" 시각 회귀
```

**핵심 발견**: turbopack 의 module dep graph 가 새 sub-path entry point 를 추가하면서 chunking boundary 를 새로 긋고, 이 과정에서 가상 파일 시스템(VFS) 의 `__dirname` 해석이 꼬인다. 기존 `./scene` entry 안에 편승하면 graph 영향 0.

#### 라운드 2 정정 발견 — namespace re-export 도 SSR 평가 trigger (PR #414 실측)

본 Amendment 초안 (PR #413 첫 push) 은 "sub-path export 폐기 + `scene/index.ts` re-export + namespace 경유 (`sceneApi.isRPhaseFocusable`)" 패턴을 제시했으나, **PR #414 실측 결과 동일 SSR 500 발현**.

**메커니즘 (실측)**:

```
apps/web/src/components/layout/focus-quick-buttons.tsx (app-shell 직접 import — SSR 평가 대상)
        ↓ import { scene as sceneApi } from '@astro-simulator/core'
turbopack module resolver
        ↓ namespace 경유 시 scene namespace 의 모든 re-export 평가 강제
packages/core/src/scene/index.ts (re-export chain)
        ↓ export * from './r-phase-allowlist.js'
        ↓ export * from './solar-system-scene.js'   ← 함께 평가
solar-system-scene.ts
        ↓ import { ... } from '../engine/nbody-engine.js'
nbody-engine.ts
        ↓ import physics_wasm
physics_wasm.js:367
        ↓ const wasmPath = `${__dirname}/physics_wasm_bg.wasm`
SSR runtime ENOENT → HTTP 500
```

**대조 관찰** (왜 sim-canvas 는 동일 import 를 해도 안 깨지나):

- `apps/web/src/components/sim-canvas.dynamic.tsx` 는 `next/dynamic({ ssr: false })` 로 sim-canvas 본체 평가를 클라이언트로 미룸 → SSR 시 `solar-system-scene.ts` 평가 0
- `focus-quick-buttons.tsx` 는 app-shell 에서 직접 import → SSR 평가 대상 → namespace 경유 시 chain 폭발
- 즉, namespace 경유는 **SSR 평가 컨텍스트** 에 따라 trigger 여부가 달라진다. dev 서버에서만 발현하는 것이 아니라, "SSR 평가 대상 컴포넌트" 가 namespace 경유 시 즉시 발현

**미래 회피 패턴 (PR #414 채택)**:

1. `packages/core/src/scene/index.ts` 에서 `r-phase-allowlist.ts` re-export **의도적 회피** — chain 평가 trigger 차단 (회귀 메커니즘 주석 박제 의무)
2. `packages/core/src/index.ts` 에 **named export 직접 박제** (`R_PHASE_BODY_ALLOWLIST` / `isRPhaseFocusable` / `RPhaseBodyId`) — module graph 영향 최소
3. `apps/web` 호출 측: `import { isRPhaseFocusable } from '@astro-simulator/core'` named import (namespace 금지)

이 패턴은 라운드 2 정정 (D1 갱신) 으로 박제. 라운드 2 초안의 "namespace re-export" 는 **폐기**.

#### 시도하고 실패한 fix

| 시도                                                                                                   | 결과     | 메커니즘                                                                                      |
| ------------------------------------------------------------------------------------------------------ | -------- | --------------------------------------------------------------------------------------------- |
| `next.config.mjs` `serverExternalPackages: ['@astro-simulator/physics-wasm', '@astro-simulator/core']` | **무효** | Next.js 15.x 시점 turbopack 은 `serverExternalPackages` 무시 (webpack-only 옵션). 알려진 패턴 |

#### qa 라운드 2 진단 오류 (volt #77 강제 입증)

- qa 라운드 2 비차단 권고: "dev 환경 turbopack workspace root inferred '/ROOT/...' SSR wasm 500 — base develop 시점부터 존재"
- **실측: develop 200, PR #407 만 500** — qa 진단 잘못
- 원인: 헤드리스 playwright 우회 패턴 + base 확인 누락. **사용자 실 Chrome 검증으로만 본질 발현**
- volt #77 (헤드리스 ≠ 실 Chrome) 의 정확한 입증 사례 → DoD-9 (실 Chrome 의무) 박제 근거

### 후보 비교 (라운드 2)

| 후보                                                                                                                                               | 장점                                                                                                                                                                                       | 단점                                                                                                                        | 비고             |
| -------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------- | ---------------- |
| **A. SSoT 위치 보존 (`packages/core/src/scene/r-phase-allowlist.ts`) + sub-path export 폐기 + `scene/index.ts` re-export + namespace 경유 import** | turbopack module dep graph 영향 0 (기존 `./scene` entry 편승). 라운드 1 §결정 1 의 SSoT 단일성 / 도메인 layer 의미 유지. web 은 이미 `scene as sceneApi` 패턴 사용 중 — import 경로 변경만 | sub-path export 가 가능한 다른 SSoT 도 동일 패턴 강제 (확장성 약간 제약 — 단, WASM 도메인 한정으로 스코프 좁힘)             | **채택**         |
| B. simulation-core.ts 인라인 (`R_PHASE_BODY_ALLOWLIST` + `isRPhaseFocusable`)                                                                      | turbopack 영향 0. import 경로 0                                                                                                                                                            | scene 도메인 정책을 engine 모듈에 박제 → 단일 책임 위배. 라운드 1 §결정 1 후보 C ("apps/web 자체 SSoT") 와 같은 패턴의 변형 | 차선 (긴급 폴백) |
| C. JSON SSoT (`apps/web/scripts/r-phase-allowlist-ssot.json`)                                                                                      | verify 스크립트 적합                                                                                                                                                                       | simulation-core / UI 모두 동일 import — 코드 SSoT 가 자연스러움. JSON import 자체도 module graph 영향 가능성 (실측 안 됨)   | 즉시 기각        |

#### 후보 A 채택 근거

1. **회피 비용 최소** — 라운드 1 SSoT 위치 그대로 유지. import 경로 1줄만 변경 (`'@astro-simulator/core/scene/r-phase-allowlist'` → `'../scene/r-phase-allowlist.js'` 또는 namespace 경유)
2. **단기 워크어라운드 vs 근본 해결 분리** — `--target nodejs` 자체가 SSR 안티패턴 (cross-validate Q3 응답) 이지만, R-Phase allowlist sprint 의 비목표. **후속 이슈로 분리 박제** (재검토 조건 5)
3. **확장성 제약 최소화** — Gemini 권고에 따라 "모든 sub-path 금지" 가 아닌 **"WASM 모듈 의존 도메인 (scene / physics / render / gpu) 한정 sub-path 추가 금지"** 로 스코프 좁힘. coords / ephemeris / time 등 순수 데이터 도메인은 영향 없음

### 결정 (라운드 2)

#### 결정 D1 — 라운드 1 §결정 1 갱신 (SSoT 위치 보존 + sub-path export 폐기 + named export 직접 박제)

> **라운드 2 정정 (2026-05-04, PR #414)**: 본 D1 초안의 "namespace re-export" 패턴이 SSR 500 동일 발현으로 **폐기**. 아래는 PR #414 실측 PASS 패턴.

- SSoT 위치: `packages/core/src/scene/r-phase-allowlist.ts` (라운드 1 와 동일)
- **`packages/core/package.json` exports field 에 `./scene/r-phase-allowlist` sub-path 추가 금지** (라운드 2 보존)
- **`packages/core/src/scene/index.ts` 에서 `r-phase-allowlist.ts` re-export 의도적 회피** ⚠️ — `solar-system-scene.ts` 등 동일 namespace 의 다른 re-export chain 이 namespace 경유 시 함께 평가되어 `physics_wasm.js:367` `${__dirname}` evaluation 을 trigger 함. 회귀 메커니즘 주석 박제 의무 (`scene/index.ts` 에 "왜 re-export 하지 않는가" 명시)
- **`packages/core/src/index.ts` 에 named export 직접 박제** — `R_PHASE_BODY_ALLOWLIST` / `isRPhaseFocusable` / `RPhaseBodyId` 3종을 main entry 에 직접 박제. 별도 namespace 평가 trigger 없음
- `apps/web` 호출 측: **named import 만 허용** (`import { isRPhaseFocusable } from '@astro-simulator/core'`). namespace 경유 (`import { scene as sceneApi } from '@astro-simulator/core'` → `sceneApi.isRPhaseFocusable`) **금지** — namespace 도 chain 평가 trigger
- `packages/core/src/engine/simulation-core.ts` 는 같은 패키지 내부이므로 직접 relative import (`'../scene/r-phase-allowlist.js'`) — 라운드 1 와 동일
- **근거**:
  - turbopack chunking boundary 가 `./scene` entry 안에서만 결정 → sub-path 미추가 → `__dirname` resolve 영향 0 (라운드 2 보존)
  - **추가 발견 (라운드 2 정정)**: namespace 경유 (`scene` namespace) 도 turbopack 이 chain 평가 → `solar-system-scene.ts` 평가 → `nbody-engine.ts` import 평가 → `physics_wasm.js:367` evaluation trigger. **회피책**: main entry (`core/src/index.ts`) 에서 named export 직접 박제 시 chain 평가 0 (단일 symbol 만 export, scene namespace 평가 없음)
  - sim-canvas 는 `sim-canvas.dynamic.tsx` 의 `next/dynamic({ssr:false})` 로 SSR 평가 회피하지만 **focus-quick-buttons 는 app-shell 직접 import → SSR 평가 대상**. SSR 평가 대상 컴포넌트가 namespace 경유 시 즉시 chain 폭발 → named import 만 안전

#### 결정 D2 — 라운드 1 §결정 4 보강 (5번째 동시 박제 항목 + 자동화 hook)

라운드 1 의 4곳 동시 박제 (allowlist 파일 / R-Phase ADR cross-link / verify 스크립트 / CHANGELOG) 보존 + 5번째 항목 추가:

5. **wasm-safe 패턴 검증 항목**:
   - `packages/core/package.json` exports field 에 **WASM 의존 도메인 (scene / physics / render / gpu) 의 새 sub-path entry 추가 금지** (turbopack `__dirname` SSR 회귀)
   - **WASM-safe 화이트리스트** (PR #414 의 `verify-core-exports-immutable.sh` SSoT): `. / ./coords / ./physics / ./scene / ./gpu / ./ephemeris` — 이 목록 외 entry 추가 시 자동 차단
   - **순수 데이터 도메인은 자유** (Gemini cross-validate Q3 권고 — 스코프 좁힘): coords / ephemeris / time / utils 등 WASM 미사용 도메인은 sub-path export 자유 (단, 화이트리스트 갱신 동반 PR 필요)
   - **신규 SSoT 의 web 측 import 경로 규칙** (라운드 2 정정 반영):
     - **명시적 named export 우선** — `core/src/index.ts` 에 직접 박제, web 에서 named import (`import { X } from '@astro-simulator/core'`)
     - namespace 경유 (`import { scene as sceneApi }` → `sceneApi.X`) **금지** — SSR 평가 대상 컴포넌트에서 chain 평가 trigger
     - `scene/index.ts` 등 namespace barrel 에 신규 SSoT re-export 추가 시 회귀 메커니즘 주석 의무 (왜 회피하는지 SSoT)
   - 새 namespace 도입 시 (예: `coords` 처럼 WASM 미사용 도메인이 아닌 신규 카테고리) `next.config.mjs` 의 webpack/turbopack 양쪽 호환성 사전 검증 필수 (`curl http://localhost:3000/ko` HTTP 200 + 콘솔 에러 0)

**자동화 hook (Gemini cross-validate 권고 — Q5 응답, PR #414 실측 박제)**:

- `scripts/verify-core-exports-immutable.sh` 신설 — `jq` 로 `packages/core/package.json` exports field 의 entry 검사
- 화이트리스트 SSoT: `. / ./coords / ./physics / ./scene / ./gpu / ./ephemeris` (스크립트 본문에 박제, 변경 시 동반 PR + ADR amendment 의무)
- WASM 도메인 (scene/physics/render/gpu) sub-path 추가 시 exit 1
- CI `detect-and-test` step 통합 (PR #414 의 `.github/workflows/ci.yml` 참조)
- 휴먼 누락 (reviewer 체크리스트만으로는 불충분 — Gemini 명시 권고) 가드
- ROI: 30분 작성 비용 vs 무한 회귀 방지

#### 결정 D3 — DoD-9 신규 추가 (SSR 200 검증 의무)

라운드 1 DoD-1~8 보존 + 추가:

- **DoD-9 (CRITICAL — 라운드 2 회귀 직접 가드)**:
  - PR head checkout 후 메인 working tree dev 서버 재기동 → `curl http://localhost:3000/ko` HTTP 200 확인 의무 (developer + qa 양 단계)
  - 사용자 D-T2 venus focus 정상 동작 (3-tier transition 1회만, oscillate 없음, target jump → animation 부드러움)
  - 헤드리스 playwright 단독 머지 결정 금지 — volt #77 강제

#### 결정 D4 — turbopack 회귀 메커니즘 ADR 박제 (미래 회피용)

본 §회귀 메커니즘 박제 섹션 + §라운드 2 정정 발견 섹션 자체가 D4 — 미래 동일 패턴 회피용 SSoT. 다음 3자 결합 패턴 발견 시 본 ADR Amendment cross-link 의무:

**3자 결합 trigger 패턴**:

- wasm-pack `--target nodejs` 출력 + Next.js SSR 환경
- `${__dirname}` 또는 `require('fs').readFileSync` 패턴이 monorepo workspace package 안에 있음
- turbopack module dep graph 변경 — 다음 중 하나:
  - sub-path export 추가 (라운드 1 발견)
  - **namespace re-export 경유 (`scene as sceneApi.X` 또는 `scene/index.ts` 의 새 re-export)** — 라운드 2 정정 발견. SSR 평가 대상 컴포넌트가 namespace 경유 시 chain 평가 폭발
  - barrel file refactor (`index.ts` 의 `export *` 추가)
  - 새 namespace 도입

**미래 회피 패턴 (PR #414 채택)**:

- WASM-safe 도메인 SSoT 는 `core/src/index.ts` 에 named export 직접 박제
- namespace barrel (`scene/index.ts` 등) 에 SSoT 추가 회피 (회피 사유 주석 박제 의무)
- web 호출 측은 named import 만 허용, namespace 경유 금지
- `verify-core-exports-immutable.sh` 자동 가드로 휴먼 누락 차단

**SSR 평가 컨텍스트 매트릭스** (라운드 2 정정 발견):

| import 패턴                                                    | 호출 컴포넌트 SSR 평가 대상                    | 결과                                                     |
| -------------------------------------------------------------- | ---------------------------------------------- | -------------------------------------------------------- |
| sub-path (`@astro-simulator/core/scene/r-phase-allowlist`)     | 임의                                           | SSR 500 (라운드 1 발현)                                  |
| namespace 경유 (`scene as sceneApi.X`)                         | SSR 평가 대상 (예: app-shell 직접 import)      | SSR 500 (라운드 2 정정 발현)                             |
| namespace 경유                                                 | `next/dynamic({ssr:false})` 로 클라이언트 미룸 | SSR 200 (예: sim-canvas — 단, R-Phase guard 박제 부적합) |
| **named import (`import { X } from '@astro-simulator/core'`)** | 임의                                           | **SSR 200** (PR #414 채택 패턴)                          |

### Concrete Prediction (라운드 2 — 정정 후)

- **A. import 경로 변경량 (라운드 2 정정 반영)**: `apps/web/src/components/layout/focus-quick-buttons.tsx` 1곳 (named import) + `packages/core/src/engine/simulation-core.ts` 1곳 (relative import) + `packages/core/src/index.ts` named export 박제 3 symbol + `packages/core/src/scene/index.ts` re-export 회피 주석 박제. 합 4곳 / ~10줄. 미달 시 SSoT drift 의심. **`scene/index.ts` 에 r-phase-allowlist re-export 추가 시 즉시 회귀 의심**
- **B. SSR 200 검증 통과**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ko` → `200`. 500 시 회귀 직접 발현 (라운드 1 / 라운드 2 mechanism 재현)
- **C. exports field 변경량**: `packages/core/package.json` 변경 0줄. 1줄이라도 추가되면 자동화 hook (`verify-core-exports-immutable.sh`) 가 차단 (D2 자동화)
- **D. named import 만 사용 (라운드 2 정정 신규)**: `apps/web` 내에서 `R_PHASE_BODY_ALLOWLIST` / `isRPhaseFocusable` 호출 시 `import { X } from '@astro-simulator/core'` 형태만 허용. `import { scene as sceneApi }` 후 `sceneApi.X` 패턴 0건 (`grep -rn 'sceneApi\\.isRPhaseFocusable\\|scene\\..*RPhaseFocusable' apps/web/src` 0 결과)

### 재검토 조건 (라운드 2 추가)

5. **`--target bundler` / `--target web` 마이그레이션 트리거** (장기 근본 해결, Gemini Q3 권고):
   - Edge Runtime / Middleware / Edge API Routes 도입 결정 시 **즉시 트리거** (`--target nodejs` 는 Edge 환경에서 즉시 크래시 — `fs` / `__dirname` 부재)
   - WASM 의존 도메인이 5개 이상 도달 시 (sub-path 금지 정책 비용 > 마이그레이션 비용)
   - 본 ADR scope 밖 — 후속 이슈 분리 (트리거 발현 시 즉시 박제)
6. **pnpm symlink resolve 회귀 모니터링** (Gemini Q4 발견):
   - `resolve.symlinks` 설정 변경 또는 turbopack 캐싱 이슈 발생 시 `__dirname` 이 `.pnpm` 가상 스토어 내부 엉뚱한 경로 가리킬 수 있음 → ENOENT 재발 가능
   - 모니터링 항목: monorepo 의 pnpm workspace 구조 변경 PR / Next.js 메이저 업그레이드 PR 에서 SSR 200 회귀 검증 의무
7. **CI 환경 경로 길이 / 특수문자 회귀** (Gemini Q4 발견):
   - 가상 컨테이너의 `__dirname` 절대 경로가 너무 길거나 특수문자 포함 시 `fs` 레벨 실패 가능
   - 현재 미발현. CI 환경 변경 시 SSR 200 smoke 검증

### 제약 박제 (현재 아키텍처)

- **Edge Runtime 호환성 0** (Gemini Q4 명시): 현재 `--target nodejs` 빌드물은 Next.js Middleware / Edge API Routes / Edge Runtime 환경에서 즉시 크래시. R-Phase allowlist 가드를 포함한 모든 `@astro-simulator/core` 코드는 **Node.js runtime 한정** — Edge 사용 계획이 생기면 재검토 조건 5 트리거

### 교차검증 반영 사항 (라운드 2)

cross-validate 1회 (2026-05-04, anchor=ADR Amendment, outcome=applied — `.claude/logs/cross-validate-architecture-20260504-145430.log`).

**Claude 편향 4종 셀프 체크**: 통과. 단, "결합 간과" 가 위험할 뻔 — Gemini 가 "자동화 hook 없으면 휴먼 누락 가능" 을 지적해 reviewer 체크리스트만 신뢰하던 결합 간과를 보강 (D2 자동화 hook 추가).

#### 합의 (Claude 설계와 일치 — 즉시 반영)

- D1 sub-path export 폐기 + namespace re-export — 단기 워크어라운드로 타당 (Gemini Q1 명시)
- D3 SSR 200 + 사용자 D-T2 의무 (DoD-9) — 견고한 방어책
- D4 turbopack 메커니즘 박제 — 맥락 유실 방지 필수
- 라운드 1 의 4곳 동시 박제 절차 그대로 적용 가능 (5번째 항목만 추가)

#### 이견 수용 (Gemini 권고로 원안 보강)

1. **exports 제한 스코프 좁힘** (Gemini Q3 응답):
   - 원안: "모든 sub-path export 추가 금지"
   - 수정안: **"WASM 의존 도메인 (scene / physics / render / gpu) 한정 sub-path 추가 금지"**
   - 근거: monorepo 확장성 보존 — coords / ephemeris / time 등 순수 데이터 도메인은 sub-path export 자유 (WASM `__dirname` 미발현)
2. **자동화 hook 강제** (Gemini Q5 응답):
   - 원안: reviewer 체크리스트 권고만
   - 수정안: **`scripts/verify-core-exports-immutable.sh` 자동화 hook 박제 (D2 보강)**
   - 근거: 휴먼 피로도 가드 — 리뷰어 한 줄 누락 가능성. 30분 작성 ROI

#### Claude 재분석으로 기각한 Gemini 제안

- 없음. Gemini 모든 제안이 합리적

#### 고유 발견 (현재 ADR 에 즉시 반영)

1. **D1 본문 보강** — "왜 sub-path export 를 피해야만 했는가 (Turbopack chunking boundary 이슈)" 명시 (Gemini Q1 응답 → §회귀 메커니즘 박제 반영)
2. **Edge Runtime 제약 박제** — 현재 아키텍처 제약 명시 (§제약 박제)
3. **자동화 hook ROI 30분 박제** — D2 보강 (Gemini 명시 ROI 인용)

#### 고유 발견 (후속 분리)

1. **`--target bundler` / `--target web` 마이그레이션** — 근본 해결책이지만 R-Phase allowlist sprint scope 밖. **후속 이슈로 분리** (재검토 조건 5 트리거 발현 시 즉시 박제). 우선순위: medium (현재 SSR 200 회복 후 안정성 모니터링 우선)
2. **Symlink resolve 함정** — 현재 미발현 위험. 재검토 조건 6 모니터링 박제로 충분 (별도 이슈 불필요)
3. **CI 경로 길이 함정** — 동일 (재검토 조건 7)

### 라운드 2 정정 박제 (2026-05-04, PR #414 실측 발견 반영)

> 본 ADR Amendment 의 D1 patch — namespace re-export 폐기 + named export 직접 박제로 교체. PR #414 (developer 라운드 2 코드 구현, head=`fix/402-r-phase-allowlist-guard-round2-impl`, commit `d6eb2c5`) 가 발견·실측·박제.

#### 정정 사유

- 본 Amendment 초안 D1 의 "namespace re-export 강제" (`import { scene as sceneApi } from '@astro-simulator/core'` 후 `sceneApi.isRPhaseFocusable`) 패턴이 PR #414 실측 결과 SSR 500 동일 발현
- 메커니즘: turbopack 이 namespace 경유 시 `packages/core/src/scene/index.ts` re-export chain (`solar-system-scene.ts` 포함) 평가 → `nbody-engine.ts` → `physics_wasm.js:367` `${__dirname}` evaluation trigger
- sim-canvas 는 `next/dynamic({ssr:false})` 로 회피하지만 focus-quick-buttons 는 app-shell 직접 import → SSR 평가 대상 → namespace 경유 시 chain 폭발

#### 정정 적용 (PR #414 실측 PASS 패턴)

- D1 갱신: namespace re-export → `core/src/index.ts` named export 직접 박제 + `scene/index.ts` re-export 의도적 회피
- D2 보강: WASM-safe 화이트리스트 명시 (`. / ./coords / ./physics / ./scene / ./gpu / ./ephemeris`) + 순수 데이터 도메인 자유 명시
- D4 보강: namespace re-export trigger 메커니즘 + SSR 평가 컨텍스트 매트릭스 추가
- §회귀 메커니즘: 라운드 2 정정 발견 섹션 추가 (메커니즘 / 대조 관찰 / 미래 회피 패턴)
- §Concrete Prediction: D 항목 추가 (named import 만 사용 단언)
- §Developer 인수인계: PR #414 실제 채택 패턴 박제 (시작 지점 7단계 + 빌드/검증 순서 9단계)

#### 라운드 1 → 라운드 2 → 라운드 2 정정 패턴 매트릭스

| 패턴                                | exports field                    | scene/index.ts re-export | core/index.ts named export | web 호출 패턴                                                  | SSR       | 비고                                             |
| ----------------------------------- | -------------------------------- | ------------------------ | -------------------------- | -------------------------------------------------------------- | --------- | ------------------------------------------------ |
| 라운드 1 (PR #407 closed `3eed4e0`) | `./scene/r-phase-allowlist` 추가 | 없음                     | 없음                       | sub-path import                                                | ❌ 500    | turbopack chunking boundary 폭발                 |
| 라운드 2 초안 (Amendment 첫 push)   | 변경 0                           | `export *` 추가          | 없음                       | namespace 경유 (`sceneApi.X`)                                  | ❌ 500    | namespace chain 평가 trigger (PR #414 실측 발견) |
| **라운드 2 정정 (PR #414 채택)**    | **변경 0**                       | **회피 주석**            | **named export 박제**      | **named import (`import { X } from '@astro-simulator/core'`)** | **✓ 200** | chain 평가 0                                     |

#### 라운드 2 정정 cross-validate (2026-05-04, anchor=ADR Amendment 라운드 2 정정, outcome=applied)

cross-validate 1회 (`/Users/seo/project/space/.claude/logs/cross-validate-architecture-20260504-164109.log`).

**Claude 편향 4종 셀프 체크 통과**: (a) 낙관적 일정 N/A — 정정은 PR #414 실측 발견 후속 / (b) 결합 간과 통과 — D1 + D2 + D4 결합 명시 + SSR 평가 컨텍스트 매트릭스 박제 / (c) 폐기 프레이밍 통과 — 라운드 2 초안 (namespace re-export) 명시 폐기 박제 / (d) 순수주의 통과 — Gemini Q3 응답 반영해 화이트리스트 스코프 좁힘 (WASM 도메인 한정 vs 모든 sub-path 금지) 보존.

##### 합의 (Gemini 평가, Claude 설계와 일치)

- **총평 "매우 뛰어난 수준의 ADR"** — 실패로부터의 학습 / 구체적 예측 / 방어적 설계 / 자동화 회귀 방지 / 프로세스화 5축 모두 양호
- **항목별**: 구조적 완성도 매우 우수 / 기술 결정 타당성 매우 우수 / 인터페이스 명확성 우수 / 확장성 우수 / 보안 양호 / 누락 요소 매우 우수
- "SSR 평가 컨텍스트 매트릭스" Gemini 가 "이 문제에 대한 완벽한 이해" 로 평가 — 라운드 2 정정의 핵심 산출물 정합성 확인
- WASM 의존 도메인 한정 화이트리스트 (스코프 좁힘) 가 "확장성을 고려한 좋은 선택" — D2 보강 정합성 확인
- `Object.freeze` 불변성 / Defense-in-depth UI+scene / 자동화 hook 모두 양호 평가

##### 이견 수용

- 없음. Gemini 가 라운드 2 정정 결정에 대한 반대 의견 없이 보완 제안만 제시

##### Claude 재분석으로 기각한 Gemini 제안

- 없음. Gemini 모든 제안이 합리적

##### 고유 발견 (즉시 반영)

- **본 cross-validate 결과 박제 자체** — 본 §라운드 2 정정 cross-validate 섹션이 즉시 반영 항목

##### 고유 발견 (후속 분리)

1. **린트 규칙 커스터마이징** (Gemini 항목 3 인터페이스 명확성 개선 제안):
   - `apps/web` 에서 `import { scene as sceneApi } from '@astro-simulator/core'` 후 `sceneApi.isRPhaseFocusable` 접근 시 린트 에러
   - 현재 `verify-core-exports-immutable.sh` + `grep` 기반 검증으로 **차선책 충분** (Gemini 명시)
   - 범위 체크: 본 ADR §결정 D1/D2 의 휴먼 가드 강화는 D2 자동화 hook + reviewer 체크리스트 + Concrete Prediction D 로 이미 3중 방어. 린트 규칙은 4중 방어로 ROI medium
   - **후속 인프라 이슈 분리** — 우선순위 medium (현재 SSR 200 회복 + 12/12 회귀 가드 + verify 스크립트 정착 후 검토)
2. **`BODY_SCALE` venus 누락 (#412) cross-link 의무 강조** (Gemini 항목 6 누락 요소 개선 제안 1):
   - Concrete Prediction B 가 발견한 `BODY_SCALE` drift 의 후속 이슈 #412 가 본 ADR 머지 시 명시적으로 생성·링크되도록 박제 강조
   - 범위 체크: 이미 §참고 / 비-범위 섹션에 #412 분리 명시. 추가 박제 불필요
   - **현재 ADR 박제 충분** (Gemini 권고 보존을 위해 §참고에 #412 명시 박제 확인)
3. **`--target bundler` 마이그레이션 추적용 이슈** (Gemini 항목 6 누락 요소 개선 제안 2):
   - 재검토 조건 5 트리거 발현 전이라도 별도 추적용 이슈 미리 생성
   - 범위 체크: 본 ADR §재검토 조건 5 + Edge Runtime 제약 박제로 미래 readers 가 트리거 즉시 인지 가능. 현재 미발현 단계에서 추적용 이슈 생성은 ROI low
   - **본 ADR 박제로 충분** (트리거 발현 시 즉시 분리)
4. **지식 전파 — 기술 블로그/내부 위키** (Gemini 항목 6 누락 요소 개선 제안 3):
   - Turbopack + WASM + SSR 조합 ADR 의 요약본
   - 범위 체크: harness 외 전파 — 별도 인프라 / 운영 이슈
   - **후속 분리** — 우선순위 low

---

### 라운드 2 Developer 인수인계 (라운드 2 정정 반영 — PR #414 채택 패턴)

> **이 섹션은 PR #414 (developer 라운드 2 코드 구현) 의 실제 채택 패턴을 박제**. 라운드 2 초안의 namespace re-export 패턴은 **폐기**.

#### 시작 지점 (PR #414 실제 채택)

1. **`packages/core/src/scene/r-phase-allowlist.ts`** 신규 — `R_PHASE_BODY_ALLOWLIST = Object.freeze(['sun', 'mercury', 'venus'] as const)` + `isRPhaseFocusable(bodyId)` helper + `RPhaseBodyId` 타입 (라운드 1 박제값 코드 재사용)
2. **`packages/core/src/scene/index.ts`** 에 `r-phase-allowlist.ts` re-export **의도적 회피** ⚠️ — `solar-system-scene.ts` 등 동일 namespace 의 chain 평가 trigger 차단. 회귀 메커니즘 주석 박제 의무 (왜 회피하는지 명시)
3. **`packages/core/src/index.ts`** 에 named export 직접 박제 ⚠️:
   ```ts
   export {
     R_PHASE_BODY_ALLOWLIST,
     isRPhaseFocusable,
     type RPhaseBodyId,
   } from './scene/r-phase-allowlist.js';
   ```
4. **`packages/core/package.json`** **변경 0** (sub-path export 추가 금지 — D1 보존)
5. **`packages/core/src/engine/simulation-core.ts`** focusOn 가드 — import 경로 `'../scene/r-phase-allowlist.js'` (같은 패키지 내부 relative import)
6. **`apps/web/src/components/layout/focus-quick-buttons.tsx`** UI 가드 — **named import 만**: `import { isRPhaseFocusable } from '@astro-simulator/core'` (namespace 경유 금지)
7. **회귀 가드 스크립트 + 자동화 hook 신규**:
   - `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` (3종 매트릭스 12 case)
   - **`scripts/verify-core-exports-immutable.sh`** 신규 (D2 보강 — `jq` 로 exports entry 화이트리스트 검사: `. / ./coords / ./physics / ./scene / ./gpu / ./ephemeris`)
   - `.github/workflows/ci.yml` 에 `verify-core-exports-immutable` + `verify:r-phase-allowlist` step 통합

#### 빌드 / 검증 순서 (volt #70 + 라운드 2 정정 + volt #77 SSR 200 단계 게이트)

1. `r-phase-allowlist.ts` 작성 + `scene/index.ts` 회피 주석 박제 + `core/src/index.ts` named export 박제 후 `pnpm --filter @astro-simulator/core build` 선행 (volt #70 monorepo dist stale 가드)
2. `pnpm --filter @astro-simulator/core test` (단위 테스트 — r-phase-allowlist 6 case + simulation-core focusOn 가드 9 case)
3. `pnpm --filter @astro-simulator/web test` (UI 가드 11 case)
4. `apps/web` dev 서버 **재기동** (HMR 신뢰 금지)
5. **CRITICAL DoD-9 (SSR 200 회복 직접 가드 — volt #77 단계 게이트)**: `curl -s -o /dev/null -w "%{http_code}" http://localhost:3000/ko` → `200` 확인 (500 시 즉시 차단 — sub-path export 추가 또는 namespace re-export trigger 흔적 의심. `grep -rn 'sceneApi\\.isRPhaseFocusable\\|scene\\..*RPhaseFocusable' apps/web/src` 으로 namespace 경유 잔재 확인)
6. `pnpm --filter @astro-simulator/web verify:r-phase-allowlist` (회귀 가드 12/12)
7. `bash scripts/verify-core-exports-immutable.sh` (D2 자동화)
8. `grep -rn` 으로 U+FFFD (replacement character) 검사 — `<수정 파일>` 대상 0건 (CRITICAL #4)
9. **사용자 D-T2 실 Chrome 의무** (DoD-5 + DoD-9 — volt #77 헤드리스 ≠ 실 Chrome) — venus focus 정상 동작 확인 (3-tier 1회 / oscillate 0 / animation 부드러움) + earth/jupiter/neptune 잔재 0

#### 명시적 비-범위 (라운드 2 정정 반영)

- `packages/core/package.json` exports field 변경 — sub-path 추가 금지 (D1 보존)
- `packages/core/src/scene/index.ts` 에 `r-phase-allowlist.ts` re-export 추가 — **금지** (D1 라운드 2 정정)
- `apps/web` 에서 namespace 경유 (`import { scene as sceneApi }` → `sceneApi.X`) — **금지** (D1 라운드 2 정정)
- `--target bundler` 마이그레이션 — 재검토 조건 5 후속 이슈 (D2 후속 분리)
- Edge Runtime / Middleware / Edge API Routes 사용 — 제약 박제로 차단
- BODY_SCALE 변경 — #412 분리
- 기타 R-Phase allowlist 무관 컴포넌트 변경 — celestial-tree-panel / celestial-info-panel / scenario-presets / black-hole-disk-panel / about-modal 0 (#403 / #404 / #405 후속)

#### 머지 권한

- developer 는 PR 생성까지만. **머지 권한 행사 금지** (CRITICAL #1)
- 단계 게이트 (volt #77): developer → reviewer → qa → 사용자 D-T2 PASS → 머지
