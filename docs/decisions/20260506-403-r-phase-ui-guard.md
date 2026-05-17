# ADR: R-Phase UI 가드 — CelestialTree + InfoPanel defense-in-depth (UI 측 2번째 축)

- **상태**: Accepted
- **날짜**: 2026-05-06
- **결정자**: architect (#403 PM 라운드 2, 2026-05-06 위임)
- **관련**:
  - **부모 시리즈**: #402 (Top 1 FocusQuickButtons), `20260504-r-phase-allowlist-guard.md` (R-Phase allowlist SSoT + scene 측 가드)
  - **자매 분리**: #404 (Top 3 ScenarioPresets), #405 (폐기 코드 정리 — BlackHoleDiskPanel / AboutModal / P10 KIND_LABEL 통합 후보지)
  - **defense-in-depth 3번째 축**: #415 url-sync 가드 (`20260504-415-url-sync-guard.md`)
  - **사용자 D-T2 보고 계열**: #412 (BODY_SCALE R-Phase 정책, 시각 활성 vs focus 활성 분리), `20260506-body-scale-r-phase-policy.md`
  - **scene event 단일 진실원**: `20260425-r1-store-scene-sync-unification.md`
- **교훈 적용**:
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74)) — 본 ADR 도 #402 의 정량 매트릭스 PASS 후 사용자 D-T2 잔재 인지의 후속
  - "숨은 상수 변형" (volt [#69](https://github.com/coseo12/volt/issues/69)) — UI 측 Tree/InfoPanel 두 곳에 동일 정책 박제 시 drift 방지
  - "단계 게이트" (volt [#77](https://github.com/coseo12/volt/issues/77)) — 본 PR 은 코드 변경 동반이라 docs-only 예외 적용 불가, developer + reviewer + qa 풀 단계 의무
  - "헤드리스 ≠ 실 브라우저" (volt [#78](https://github.com/coseo12/volt/issues/78)) — UI 가드 검증은 사용자 D-T2 의무 (CRITICAL #3)
  - "PM DoD 구조 drift" (volt [#76](https://github.com/coseo12/volt/issues/76)) — 본 ADR 의 4축 결정은 PM 라운드 2 인계 결정 3건을 1:1 박제

---

## 배경

#402 (Top 1 FocusQuickButtons) 머지 후 PM 라운드 2 (2026-05-06) 가 Top 2 (CelestialTree + InfoPanel) 분리 박제. 사용자 D-T2 잔재 인지가 #402 의 6 shortcut 버튼 영역 외에도 좌측 천체 트리 + 우측 정보 패널에서 동일 패턴 (R4+ body 클릭 → focus 시도 → 잔재 점/빈 panel) 으로 재현 가능. #412 (BODY_SCALE R-Phase 정책) 가 시각 활성을 정책 정렬했지만 **UI 진입점 가드는 별도 축**.

### #402 와의 직교 책임

| 축            | #402 (Top 1)                         | 본 PR (Top 2 = #403)                             |
| ------------- | ------------------------------------ | ------------------------------------------------ |
| UI 진입점     | shortcut bar 6 버튼 (focus-quick)    | CelestialTree 트리 항목 + InfoPanel selectedBody |
| Scene 측 가드 | simulation-core focusOn (이미 박제)  | (재사용 — 본 PR 코드 변경 0)                     |
| URL 측 가드   | url-sync `?focus=` (#415, 이미 박제) | (재사용 — 본 PR 코드 변경 0)                     |
| SSoT          | `R_PHASE_BODY_ALLOWLIST` (이미 박제) | (재사용 — 본 PR 코드 변경 0)                     |

본 ADR 은 **UI 측 2번째 축** (CelestialTree + InfoPanel) 박제. SSoT / scene / URL 가드는 이미 박제되어 본 PR 은 UI 가드만 추가.

### PM 합의 박제 (라운드 1, 2026-05-03 / 라운드 2, 2026-05-06)

| Q      | 결정                                      | 의미                                        |
| ------ | ----------------------------------------- | ------------------------------------------- |
| **Q2** | (iii) 표시 유지 + 클릭 disabled + tooltip | 트리 항목 자체는 보이되 R4+ 는 클릭 차단    |
| **Q5** | (C) defense-in-depth (UI + scene)         | 본 PR 은 UI 측 추가 (scene 측 #402 와 직교) |
| **Q6** | (b) Top 1 우선 → Top 2 후속 분리          | 본 PR 이 Top 2                              |

### Explore: 현재 코드 상태

- `apps/web/src/components/panels/celestial-tree.tsx` (75 lines) — `renderBody` 가 모든 body 에 동일 button 렌더 + onClick 무조건 `focusOn`. R-Phase 정책 인지 0
- `apps/web/src/components/panels/celestial-info-panel.tsx` (218 lines) — `selectedBodyId` 가 R-Phase allowlist 외여도 panel 정보 (kind / orbit / mass / radius) 정상 렌더. P10 폐기 레거시 `KIND_LABEL` (line 11~17) + `COLOR_SOURCE_LABEL` (line 20~23) 잔존
- `packages/core/src/scene/r-phase-allowlist.ts` — `R_PHASE_BODY_ALLOWLIST` + `isRPhaseFocusable` named export (#402 D2 wasm-safe 패턴)

---

## 통합 vs 분리 결정 (DoD-3 P10 KIND_LABEL / COLOR_SOURCE 정리)

PM 라운드 2 인계 핵심 결정 (a). 본 PR 책임 단일화를 위해 P10 폐기 레거시 정리는 **별도 분리**:

- **선택**: (iii) 본 PR 비-범위 분리 — PM 권고 채택
- **근거**:
  1. R-Phase 가드 추가 (active topic) vs P10 폐기 UI 정리 (cleanup topic) 직교 책임. 단일 PR 1 책임 원칙
  2. 회귀 위험 격리 — 본 PR 의 사용자 D-T2 검증은 R-Phase UI 가드 동작에만 집중. P10 정리 회귀가 섞이면 root cause 분리 어려움
  3. #405 (폐기 코드 정리 chore) 가 이미 BlackHoleDiskPanel / AboutModal trail 을 갖고 있어 KIND_LABEL/COLOR_SOURCE 통합이 자연스러움
- **분리 후 박제 의무** (cross-validate "고유 발견 후속 분리" 프로토콜):
  - architect 단계 종결 후 `gh issue` 로 #405 본문에 KIND_LABEL/COLOR_SOURCE 추가 (또는 별도 새 이슈) — **developer 단계가 PR 본문 `Refs #405` 인용**

---

## 후보 비교

### 축 1 — DoD-3 P10 KIND_LABEL / COLOR_SOURCE UI 정리 분리/통합

| 후보                         | 장점                                                                      | 단점                                                                     | 비고               |
| ---------------------------- | ------------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------ |
| (i) 본 PR 동시 처리          | 단일 PR 으로 P10 잔재 일괄 정리                                           | PR 크기 ↑, 회귀 위험 ↑, 본 PR 의 사용자 D-T2 검증 root cause 분리 어려움 | 기각               |
| (ii) #405 chore 통합         | 폐기 코드 일괄 정리 일관성 ↑ (이미 BlackHoleDiskPanel / AboutModal trail) | #405 가 별도 PR 이라 본 PR 종결 후 별 PR 진행                            | 차선               |
| **(iii) 본 PR 비-범위 분리** | 직교 책임 / 단일 PR 작은 단위 / 회귀 격리 / 후속 chore 이슈 박제          | P10 잔재가 한 PR 더 살아있음 (관찰 비용)                                 | **채택 (PM 권고)** |

### 축 2 — InfoPanel 가드 패턴

| 후보                                            | 장점                                                                                              | 단점                                                                                                             | 비고                              |
| ----------------------------------------------- | ------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------- | --------------------------------- |
| (i) panel 자체 미렌더 (`info-panel-empty` 분기) | 코드 변경 최소 — `selected && data && isRPhaseFocusable(selected)` 로 1줄                         | 사용자 인지 약함 (왜 빈 panel 인지 모름). 회귀 가드 검증성 낮음 (`info-panel-empty` 와 정상 빈 패널 구별 어려움) | 차선                              |
| **(ii) "R-Phase 미구현" 메시지**                | 사용자 인지 ↑ (body name + "R<N> 진입 시 표시 예정"), 회귀 가드 검증성 ↑ (testid 명확), a11y 우수 | 코드 추가량 약간 ↑ (~15 lines 신규 분기 + i18n 텍스트)                                                           | **채택 (PM 추정 권고)**           |
| (iii) selectedBody 자체 차단 (useEffect 가드)   | defense-in-depth UI 측 추가 분기 (외부 set 보호)                                                  | url-sync 가 이미 #415 가드로 차단하므로 외부 진입 경로 거의 없음. 추가 복잡도 대비 ROI 낮음                      | 보강용 (DoD-2 채택안에 보조 박제) |

**채택 근거**:

- 사용자 D-T2 학습: 사용자가 "이전 잔재" 라고 보고한 사례에서 명시적 안내가 인지 도움
- 회귀 가드 ROI: `data-testid="info-panel-r-phase-blocked"` 명확 단언이 단위 테스트 + browser-verify 매트릭스 모두에서 검증 가능
- (iii) 보강: 본 채택안 (ii) 의 분기 자체가 selectedBody 직접 차단 분기를 포함하므로 (iii) 는 (ii) 안에 자연 흡수

### 축 3 — defense-in-depth UI ↔ scene 가드 직교 매트릭스

본 PR 머지 후 R-Phase 외 body focus 시도의 차단 매트릭스:

| 분기 | 진입 경로                                        | UI 가드 (본 PR Top 2)              | UI 가드 (#402 Top 1)       | scene 가드 (#402)                     | URL 가드 (#415)               | 1차 차단 위치 |
| ---- | ------------------------------------------------ | ---------------------------------- | -------------------------- | ------------------------------------- | ----------------------------- | ------------- |
| 1    | focus-quick-buttons 클릭 (R4+ body)              | (도달 안 함)                       | **disabled (이벤트 차단)** | (도달 안 함)                          | (도달 안 함)                  | UI #402       |
| 2    | CelestialTree 클릭 (R4+ body)                    | **disabled (이벤트 차단)** ★ 본 PR | (도달 안 함)               | (도달 안 함)                          | (도달 안 함)                  | UI 본 PR      |
| 3    | InfoPanel selectedBody set (외부 경로, R4+ body) | **R-Phase 미구현 메시지** ★ 본 PR  | (도달 안 함)               | (도달 안 함)                          | (도달 안 함)                  | UI 본 PR      |
| 4    | 외부 URL `?focus=earth` 직접 진입                | (도달 안 함, 페이지 외부)          | (도달 안 함, store 경유)   | **isRPhaseFocusable=false 차단**      | **store mutation 차단 (1차)** | URL #415      |
| 5    | scene focusOn API 직접 호출 (시나리오/preset 등) | (도달 안 함)                       | (도달 안 함)               | **simulation-core focusOn emit 차단** | (도달 안 함)                  | scene #402    |
| 6    | (정상) sun/mercury/venus 모든 진입 경로          | enabled                            | enabled                    | isRPhaseFocusable=true                | store mutation 정상           | (정상 통과)   |

**directionality**:

- 본 PR 분기 2/3 차단은 1차 방어선 (사용자 즉시 피드백 — disabled / 메시지)
- #402 / #415 는 다른 진입 경로 1차 방어선 + 본 PR 분기 1차 방어 통과 시 2차 방어 (scene 가드는 모든 분기의 마지막 방어선)
- 진입 경로 N=5 → 가드 N=3 직교 매트릭스. 새 진입점 추가 시 매트릭스 1행 추가 + 가드 박제 의무

### 축 4 — NO-OP 분기 평가 (UI 가드 추가의 비용 vs 가치)

| 평가 항목       | 비용                                                                                                                                           | 가치                                                                                                                                |
| --------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 코드 변경       | celestial-tree.tsx (~30 lines) + celestial-info-panel.tsx (~15 lines)                                                                          | UI 측 분기 2/3 차단 (위 매트릭스)                                                                                                   |
| 테스트          | celestial-tree.test.tsx (신규 ~80 lines) + celestial-info-panel.test.tsx (신규 또는 갱신 ~60 lines) + browser-verify 시나리오 확장 (~50 lines) | 사용자 D-T2 잔재 인지 차단 — #412 BODY_SCALE 정책의 진짜 보완 (R4+ body 시각 활성 차단 + focus 진입 차단 동시)                      |
| ADR / cross-val | 본 ADR (~600 lines) + cross-validate 1회                                                                                                       | defense-in-depth UI 측 2번째 축 박제 — R4 진입 시 자동 작동 (R_PHASE_BODY_ALLOWLIST 1줄 추가만으로 새 R-Phase body 가 자동 enabled) |
| 사용자 합의     | (PM 라운드 1 Q2=(iii) Q5=(C) 박제 — 추가 합의 비용 0)                                                                                          | 사용자 D-T2 직접 보고 cluster 종결 (#412 ADR §결과 §재검토 트리거 1)                                                                |
| **종합**        | 추가 PR 1 (small~medium)                                                                                                                       | **NO-OP 거부, UI 가드 추가 채택** — 사용자 합의 강함 + 회귀 가드 ROI 높음                                                           |

---

## 결정

4축 통합 결정:

1. **DoD-3 P10 KIND_LABEL / COLOR_SOURCE UI 정리** = (iii) 본 PR 비-범위 분리 (PM 권고 채택)
   - 후속 박제: architect 단계 종결 후 #405 본문에 KIND_LABEL/COLOR_SOURCE 통합 또는 별도 chore 이슈 생성. developer 단계가 PR 본문 `Refs #<후속>` 인용

2. **InfoPanel 가드 패턴** = (ii) "R-Phase 미구현" 메시지 표시 (PM 추정 권고 채택)
   - `data-testid="info-panel-r-phase-blocked"` 박제
   - 메시지 패턴: `"{body.nameKo} 은(는) R-Phase 미진입 — 후속 R-Phase 에서 활성화 예정입니다."` (정확한 R-N 번호 표시는 R-Phase 진입 매핑 별도 박제 필요 → 본 PR 은 일반 안내, 매핑 후속 이슈)
   - selectedBody 직접 차단 (축 2 후보 (iii)) 은 채택안 (ii) 안에 자연 흡수 — `selected && data && !isRPhaseFocusable(selected)` 분기로 통합

3. **defense-in-depth UI ↔ scene 가드 직교 매트릭스 박제** (축 3 매트릭스 위 표 그대로 채택)
   - 분기 N=5 + 가드 N=3 직교 매트릭스 박제
   - 본 PR 은 분기 2 (CelestialTree) + 분기 3 (InfoPanel) 1차 방어선 추가
   - 새 진입점 추가 시 매트릭스 1행 추가 + 가드 박제 의무 (R-Phase 진입 5곳 박제 의무 시리즈에 매트릭스 갱신 추가는 비-범위 — 본 PR 은 매트릭스 자체 박제)

4. **NO-OP 거부, UI 가드 추가 채택** (축 4 채택)
   - 사용자 합의 강함 + 회귀 가드 ROI 높음 + 직교 책임 분리 가능

### CelestialTree UI 가드 박제 패턴 (developer 인계)

```tsx
// apps/web/src/components/panels/celestial-tree.tsx
import { isRPhaseFocusable, R_PHASE_BODY_ALLOWLIST } from '@astro-simulator/core';

const renderBody = (id: string, depth = 0) => {
  // ...
  const focusable = isRPhaseFocusable(id);
  return (
    <li key={id}>
      <button
        type="button"
        data-testid={`tree-${id}`}
        onClick={() => focusable && handleFocus(id)}
        disabled={!focusable}
        aria-disabled={!focusable}
        // data-r-phase-disabled — E2E (browser-verify) 회귀 가드 + 선택자 노출용 (cross-validate Gemini 개선 제안 2 반영).
        // disabled / aria-disabled 와 의미 중복이지만 selector 일관성 위해 #402 박제 패턴 그대로 재사용.
        data-r-phase-disabled={!focusable}
        title={
          !focusable
            ? `${body.nameKo} 은(는) R-Phase 미진입 — 후속 R-Phase 에서 활성화 예정입니다.`
            : undefined
        }
        className={`... ${!focusable ? 'opacity-50 cursor-not-allowed' : ''}`}
      >
        {/* ... */}
      </button>
      {/* ... */}
    </li>
  );
};
```

**검증 단언** (`celestial-tree.test.tsx`):

- `tree-sun` / `tree-mercury` / `tree-venus`: `disabled` 없음, `aria-disabled="false"`, `data-r-phase-disabled="false"`
- `tree-earth` / `tree-jupiter` / `tree-neptune`: `disabled` 있음, `aria-disabled="true"`, `data-r-phase-disabled="true"`, `title` 속성 박제
- 강제 click 시 `sendCommand` 호출 0회 (jest mock)

### InfoPanel UI 가드 박제 패턴 (developer 인계)

```tsx
// apps/web/src/components/panels/celestial-info-panel.tsx
import { isRPhaseFocusable } from '@astro-simulator/core';

if (!selected || !data) {
  return <div data-testid="info-panel-empty">{/* 기존 빈 패널 */}</div>;
}

if (!isRPhaseFocusable(selected)) {
  return (
    <div data-testid="info-panel-r-phase-blocked">
      <h3 className="text-body-sm text-fg-secondary mb-2">천체 정보</h3>
      <p className="text-caption text-fg-tertiary">
        {data.nameKo} 은(는) R-Phase 미진입 — 후속 R-Phase 에서 활성화 예정입니다.
      </p>
    </div>
  );
}

// 정상 분기 (기존 로직)
```

**검증 단언** (`celestial-info-panel.test.tsx`):

- `selectedBodyId === null`: `info-panel-empty` 렌더
- `selectedBodyId === 'sun'`: `info-panel` 렌더 (정상)
- `selectedBodyId === 'earth'`: `info-panel-r-phase-blocked` 렌더 + body name 포함 + R-Phase 메시지 박제

### browser-verify 시나리오 확장 (DoD-5 (c))

`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 에 시나리오 5 (CelestialTree + InfoPanel UI 가드) 신규:

- 5-A 정상: `[data-testid="tree-sun"]` click → `selectedBodyId === 'sun'` + `[data-testid="info-panel"]` 렌더
- 5-B 차단 (CelestialTree): `[data-testid="tree-earth"]` `disabled` 속성 / `aria-disabled` / `data-r-phase-disabled` 단언, force click 시 store / camera 변화 0
- 5-C 차단 (InfoPanel): URL `?focus=earth` 진입 시 url-sync 가드 작동 + 만약 selectedBody 가 다른 경로로 set 되면 `[data-testid="info-panel-r-phase-blocked"]` 렌더 (defense-in-depth 잔존)

`RPHASE_EXPECTED_ENABLED` / `RPHASE_EXPECTED_DISABLED` SSoT 그대로 재사용 (#402 D2 박제 매트릭스 정합).

---

## Concrete Prediction

본 ADR 채택 후 R4 (지구) 진입 시 본 PR 의 UI 가드는 **자동 작동**:

- `R_PHASE_BODY_ALLOWLIST` 에 `'earth'` 1줄 추가 → CelestialTree `tree-earth` 자동 enabled (R-Phase 박제 5곳 동시 박제 절차 중 1번 자동 작동)
- InfoPanel `selectedBodyId === 'earth'` 시 자동 정상 분기 렌더 (R-Phase 미구현 분기 자동 미진입)
- 본 PR 코드 변경은 **R-Phase 무관** (allowlist 데이터만 의존) — R4~R10 진행 동안 본 PR 코드는 zero-touch

**검증 방법**: R4 PR 의 `git diff --stat` 으로 `celestial-tree.tsx` / `celestial-info-panel.tsx` 변경 0 확인. `R_PHASE_BODY_ALLOWLIST` + ADR + browser-verify expected list + CHANGELOG 4곳만 변경.

이 예측이 실패하면 (R4 PR 이 본 PR 파일을 수정하면) UI 가드 추상화 결함 → 리팩토링 필요. 근거: "신규 데이터 ≠ 신규 코드" (CLAUDE.md ADR 예측 재현 패턴).

---

## 결과·재검토 조건

### 기대 효과 (측정 가능)

1. **사용자 D-T2 잔재 인지 차단** — CelestialTree R4+ body 클릭 시 disabled / InfoPanel selectedBody R4+ 시 명시적 메시지. 사용자 D-T2 검증 시 "잔재" 보고 0 회 목표
2. **defense-in-depth UI 측 2번째 축 박제** — 분기 매트릭스 N=5 + 가드 N=3, 본 PR 으로 분기 2/3 1차 방어선 박제
3. **회귀 가드 ROI** — 단위 테스트 (~140 lines) + browser-verify 시나리오 5 (~50 lines) 로 R4~R10 진입 시 회귀 자동 차단
4. **R-Phase 자동 적응** — `R_PHASE_BODY_ALLOWLIST` 1줄 추가만으로 본 PR 가드 자동 갱신 (zero-touch)

### 트레이드오프로 받아들인 비용

- DoD-3 P10 KIND_LABEL / COLOR_SOURCE 정리는 본 PR 비-범위 분리 → P10 잔재 한 PR 더 살아있음 (단, #405 통합으로 일괄 정리)
- InfoPanel R-Phase 메시지 박제는 R-N 매핑 (R4 → 지구) 정확 표시는 후속 (본 PR 은 일반 안내 "후속 R-Phase 에서 활성화 예정")

### 재검토 조건

본 ADR 재검토가 필요한 trigger:

1. **R-Phase 진입 시 가드 drift** — R4 진입 시 본 PR 코드를 수정해야 하는 변경 발생 → §Concrete Prediction 위배, 추상화 결함
2. **defense-in-depth 분기 매트릭스 추가** — 새 UI 진입점 (예: ScenarioPresets #404 / 새 검색 패널 등) 신설 시 매트릭스 1행 추가 + 본 ADR 갱신
3. **사용자 D-T2 잔재 인지 재발** — 본 PR 머지 후 사용자가 "잔재" 보고 시 추가 진입점 식별 + ADR 갱신
4. **InfoPanel R-N 매핑 박제 요구** — "후속 R-Phase" 일반 안내가 부족하다는 사용자 보고 시 R-N 매핑 후속 이슈

### 교차검증 반영 사항

cross-validate Gemini 호출 (2026-05-06T09:07Z, anchor=ADR_R_PHASE_UI_GUARD_TOP2, outcome=applied, log=`/Users/seo/project/space/.claude/logs/cross-validate-architecture-20260506-180632.log`).

**호출 전 Claude 편향 셀프 체크** (CLAUDE.md `## 교차검증` Claude 자체 편향 4종 체크리스트):

- 낙관적 일정: 본 PR 은 single-day 작업 (~3시간) — 작은 단위 / 회귀 가드 박제. 통과
- 결합 간과: UI 가드 추가가 sim-core / store / scene 어느 것도 변경하지 않음 (read-only import). 통과
- 폐기 프레이밍: P10 KIND_LABEL 정리는 본 PR 비-범위 분리 (#405 통합). 폐기 책임 회피 아님 — 분리 박제. 통과
- 순수주의: defense-in-depth 매트릭스를 6 분기까지 박제했지만 본 PR 은 분기 2/3 만 추가 (정상 분기 6 + scene-only 분기 5 는 #402/#415 박제). 통과

**Gemini 총평**: "매우 훌륭한 설계 문서. 즉시 개발에 착수해도 좋을 만큼 완성도가 높음. 원안대로 진행하는 것에 전적으로 동의." 6 검증 기준 (구조적 완성도 / 기술 결정 타당성 / 인터페이스 명확성 / 확장성 / 보안 / 누락 요소) 모두 우수~양호 평가.

#### 합의 (Claude 설계와 일치 — Gemini 양호 평가)

- **SSoT 재사용 패턴** — `R_PHASE_BODY_ALLOWLIST` 단일 진실 공급원 재사용으로 중복 제거 + 유지보수 비용 ↓ (Gemini §2)
- **책임 분리 (DoD-3 P10 정리 분리)** — '단일 책임 원칙' 준수, PR 복잡성 + 회귀 테스트 범위 ↓ (Gemini §2). 본 ADR §통합 vs 분리 결정 + §결정 1 일치
- **InfoPanel UX 메시지 채택** (DoD-2 (ii)) — 빈 화면 대신 명시적 안내가 사용자 피드백 + 테스트 용이성 ↑ (Gemini §2). 본 ADR §결정 2 일치
- **defense-in-depth 직교 매트릭스** — 다층 방어 전략 견고성 인정 (Gemini §3 §5). 본 ADR §결정 3 매트릭스 자체 박제 가치 인정
- **데이터 주도 설계 (Concrete Prediction)** — R4~R10 진입 시 코드 zero-touch 예측 우수 (Gemini §4). 본 ADR §Concrete Prediction 일치
- **인터페이스 명확성** — Developer 인수인계 코드 예시 + 테스트 단언 박제로 모듈 계약 명확 (Gemini §3)

#### 이견 수용 (Gemini 권고로 원안 보강)

- **i18n 명시 (Gemini 개선 제안 1)** — 본 PR UI 메시지 (`"후속 R-Phase 에서 활성화 예정입니다."`) 가 한국어 하드코딩. **현재 프로젝트는 ko/en 다국어 라우팅 (`/ko`, `/en`) 채택** (BASE_URL `http://localhost:3000/ko` 기본). i18n 라이브러리 사용 여부는 본 ADR 범위 외 (UI 메시지 박제 자체가 본 PR 범위) — 그러나 **Developer 인수인계 §시작 지점** 에 "다국어 키 분기 미존재 시 한국어 하드코딩 OK, 향후 i18n 도입 시 키 추출 후속 이슈" 1줄 보강 필요. **수용 → ADR §Developer 인수인계 보강**
- **`data-r-phase-disabled` 속성 목적 명시 (Gemini 개선 제안 2)** — 코드 주석으로 "E2E 테스트 + 특정 스타일링을 위한 선택자" 명시 권고. 본 ADR §결정 §CelestialTree UI 가드 박제 패턴 코드 블록은 단순 박제만, **목적 주석 누락**. **수용 → ADR §결정 §CelestialTree UI 가드 박제 패턴 코드 블록에 주석 추가** (developer 단계 구현 시 자연 적용)

#### Claude 재분석으로 기각한 Gemini 제안

- (없음 — Gemini 총평 "원안대로 진행" 동의, 기각 대상 0)

#### 고유 발견 (현재 ADR 에 즉시 반영)

- **i18n 키 분기 미존재 명시** — Developer 인수인계 §명시적 비-범위 에 "i18n 키 분기 미존재" 1줄 추가 (위 §이견 수용 1번 박제)
- **`data-r-phase-disabled` 주석 박제** — 위 §결정 §CelestialTree UI 가드 박제 패턴 코드 블록에 한 줄 주석 박제 (위 §이견 수용 2번)

#### 고유 발견 (후속 분리)

- (없음 — 모든 Gemini 제안이 본 PR 범위 내 + 비용 저렴으로 즉시 반영)

---

## 비-범위 (PM 박제 본문 §비-범위 3건 보존)

- **Top 1 (#402) 영역** — FocusQuickButtons 가드 (별 PR 머지 완료, R_PHASE_BODY_ALLOWLIST SSoT 재사용만)
- **Top 3 (ScenarioPresets, #404) 영역** — 후속 분리 이슈
- **폐기 코드 (BlackHoleDiskPanel / AboutModal, #405) 영역** — 후속 분리 이슈 (DoD-3 P10 KIND_LABEL 통합 후보지)

추가 비-범위 (본 ADR 박제):

- **InfoPanel R-N 매핑 박제** — "후속 R-Phase" 일반 안내만 박제. 정확 R-N 번호 표시는 후속 이슈
- **새 진입점 가드 매트릭스 자동 갱신** — 본 ADR 매트릭스는 수동 박제. 자동화는 후속 인프라 이슈 분리 (R4~R10 박제 의무 5곳 절차에 매트릭스 갱신 추가는 별도 결정 필요)

---

## Developer 인수인계

### 시작 지점

1. `apps/web/src/components/panels/celestial-tree.tsx` — `renderBody` 함수에 `isRPhaseFocusable` import + button `disabled` 속성 + tooltip 박제 (위 §결정 §CelestialTree UI 가드 박제 패턴 인용)
2. `apps/web/src/components/panels/celestial-info-panel.tsx` — `selected && data` 분기 후 `isRPhaseFocusable(selected)` 추가 분기 (위 §결정 §InfoPanel UI 가드 박제 패턴 인용). **P10 KIND_LABEL / COLOR_SOURCE_LABEL line 11~17, 20~23 은 손대지 말 것** (본 PR 비-범위)
3. `apps/web/src/components/panels/celestial-tree.test.tsx` — 신규 단위 테스트 (위 §결정 §검증 단언 인용)
4. `apps/web/src/components/panels/celestial-info-panel.test.tsx` — 신규 또는 갱신 단위 테스트
5. `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` — 시나리오 5 추가 (위 §결정 §browser-verify 시나리오 확장 인용)

### 빌드 / 검증 순서 (volt #70 + #77 + #78)

```bash
# 1. core 패키지 변경 0 — re-verify
git diff develop -- packages/core/

# 2. web 변경만 빌드
pnpm --filter @astro-simulator/web build

# 3. 단위 테스트
pnpm --filter @astro-simulator/web test --run celestial-tree celestial-info-panel

# 4. SSR 200 검증 (volt #77 단계 게이트)
pnpm --filter @astro-simulator/web start &
curl -I http://localhost:3000/ko | grep "200"

# 5. browser-verify (시나리오 5 추가)
node apps/web/scripts/browser-verify-r-phase-allowlist.mjs

# 6. 사용자 D-T2 (CRITICAL #3 + volt #78) — qa 단계 의무
```

### 명시적 비-범위 (절대 손대지 말 것)

- `packages/core/src/scene/r-phase-allowlist.ts` — SSoT 재사용만, 변경 금지
- `packages/core/src/sim/simulation-core.ts` `case 'focusOn'` — #402 가드 그대로
- `apps/web/src/core/url-sync.tsx` — #415 가드 그대로
- `apps/web/src/components/layout/focus-quick-buttons.tsx` — #402 가드 그대로
- `celestial-info-panel.tsx` line 11~17, 20~23 (P10 KIND_LABEL / COLOR_SOURCE_LABEL) — #405 통합 후보지, 본 PR 비-범위
- BlackHoleDiskPanel / AboutModal — #405
- **i18n 키 분기 신설 금지** (cross-validate Gemini 개선 제안 1 반영) — 본 PR UI 메시지는 한국어 하드코딩 (`/ko` 라우팅 기본). 다국어 키 추출 (`t('rPhase.disabledWarning')` 패턴) 은 향후 i18n 라이브러리 도입 후속 이슈 분리. 본 PR 은 `/en` 라우팅 미지원 상태로 박제

### 참조 문서

- 본 ADR (`docs/decisions/20260506-403-r-phase-ui-guard.md`)
- 부모 ADR `20260504-r-phase-allowlist-guard.md` (R-Phase allowlist SSoT + scene 가드)
- 자매 ADR `20260504-415-url-sync-guard.md` (URL store mutation 가드)
- 정책 ADR `20260506-body-scale-r-phase-policy.md` (시각 활성 vs focus 활성 분리)
- 이슈 #403 PM 라운드 2 코멘트 — https://github.com/coseo12/astro-simulator/issues/403#issuecomment-4386406958

---

## 참고

- 이슈 #403 — https://github.com/coseo12/astro-simulator/issues/403
- PM 라운드 2 코멘트 — https://github.com/coseo12/astro-simulator/issues/403#issuecomment-4386406958
- volt [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작)
- volt [#76](https://github.com/coseo12/volt/issues/76) (PM DoD 구조 drift)
- volt [#77](https://github.com/coseo12/volt/issues/77) (단계 게이트)
- volt [#78](https://github.com/coseo12/volt/issues/78) (헤드리스 ≠ 실 브라우저)
- volt [#82](https://github.com/coseo12/volt/issues/82) (worktree base drift)
- volt [#83](https://github.com/coseo12/volt/issues/83) (sub-agent cross-validate 응답 박제)

---

## Amendment 2026-05-08 — ScenarioPresets 분기 7 추가 (#404)

- **상태**: Accepted
- **날짜**: 2026-05-08
- **트리거**: 본 ADR §재검토 트리거 2번 ("defense-in-depth 분기 매트릭스 추가 — 새 UI 진입점 신설 시 매트릭스 1행 추가 + 본 ADR 갱신") 직접 만족
- **관련 ADR**: [`20260508-404-scenario-presets-r-phase-guard.md`](20260508-404-scenario-presets-r-phase-guard.md) (Top 3 신규 ADR)
- **관련 PR**: #404 developer PR (이슈 #404)

### 배경

#404 (Top 3 ScenarioPresets) 가 defense-in-depth UI 측 _세 번째 축_ 박제 — focus-quick-buttons (#402) → CelestialTree + InfoPanel (#403) → **ScenarioPresets (#404)** 시리즈. 본 #403 ADR §결정 3 의 **분기 매트릭스가 시리즈 SSoT** 이므로 분기 7 박제 책임은 본 ADR Amendment 가 담당 (단일 SSoT 유지, drift 방지). #404 ADR §결정 2 (축 2 후보 c, 둘 다 채택) 가 본 Amendment 박제를 명시 인계.

### Amendment 결정

**분기 매트릭스 갱신** (위 §결정 3 매트릭스 → 본 Amendment 가 N=5 → N=7 갱신):

| 분기              | 진입 경로                                             | UI 가드 (Top 1 #402) | UI 가드 (Top 2 #403) | UI 가드 (Top 3 #404)         | scene 가드 (#402)                     | URL 가드 (#415)               | 1차 차단 위치 |
| ----------------- | ----------------------------------------------------- | -------------------- | -------------------- | ---------------------------- | ------------------------------------- | ----------------------------- | ------------- |
| 1                 | focus-quick-buttons 클릭 (R4+ body)                   | **disabled**         | (도달 안 함)         | (도달 안 함)                 | (도달 안 함)                          | (도달 안 함)                  | UI #402       |
| 2                 | CelestialTree 클릭 (R4+ body)                         | (도달 안 함)         | **disabled**         | (도달 안 함)                 | (도달 안 함)                          | (도달 안 함)                  | UI #403       |
| 3                 | InfoPanel selectedBody set (R4+ body)                 | (도달 안 함)         | **R-Phase 메시지**   | (도달 안 함)                 | (도달 안 함)                          | (도달 안 함)                  | UI #403       |
| 4                 | 외부 URL `?focus=earth` 직접 진입                     | (도달 안 함)         | (도달 안 함)         | (도달 안 함)                 | **isRPhaseFocusable=false 차단**      | **store mutation 차단 (1차)** | URL #415      |
| 5                 | scene focusOn API 직접 호출                           | (도달 안 함)         | (도달 안 함)         | (도달 안 함)                 | **simulation-core focusOn emit 차단** | (도달 안 함)                  | scene #402    |
| 6                 | (정상) sun/mercury/venus 모든 진입 경로               | enabled              | enabled              | enabled                      | isRPhaseFocusable=true                | store mutation 정상           | (정상 통과)   |
| **7** ★ #404 신규 | **ScenarioPresets preset 클릭 (R6 미구현 body 영향)** | (도달 안 함)         | (도달 안 함)         | **disabled (이벤트 차단)** ★ | (도달 안 함, mass mutation only)      | (도달 안 함, URL 무관)        | UI #404       |

**핵심 변화**:

- 분기 N=5 → **N=7** (분기 6 정상 통과 + 분기 7 #404 신규 추가). 분기 N=5 는 **차단 분기 수** 의미가 아니라 **표 전체 행 수**. #404 신규 분기 7 추가로 **차단 분기 5 + 정상 분기 1 + #404 신규 차단 분기 1 = N=7**
- 분기 7 1차 차단 위치는 **UI #404** (ScenarioPresets disabled). focus 가 아닌 **mass mutation** 만 발생 → scene/URL 가드 도달 안 함 (분기 1/2/3 와 동일 단일 방어선 패턴)
- a11y 4축 (`disabled` + `aria-disabled` + `title` + `data-r-phase-disabled`) 시리즈 패턴 일관

### Amendment 후 cross-link 박제

- 본 Amendment → #404 ADR 인용 (`20260508-404-scenario-presets-r-phase-guard.md`)
- #404 ADR §결정 2 → 본 Amendment 인용 (단방향 의존 패턴 — Gemini cross-validate "정보 파편화·드리프트 방지 최선의 방법" 평가)

### 5곳/4곳/7곳 표기 명확화 (reviewer 권고 1, 2 cross-link 해소)

ADR PR #431 reviewer 비차단 권고 1, 2 (5곳/4곳/7곳 표기 drift) 해소:

- **5곳** — #402 ADR §결정 4 의 **R-Phase 진입 시 동시 박제 의무 5곳** (allowlist body id / R-Phase ADR cross-link / browser-verify expected list / CHANGELOG / wasm-safe sub-path 검증). 본 매트릭스 분기 수와 무관
- **4곳** — #412 ADR (BODY_SCALE R-Phase 정책) §"R-Phase 진입 의무 체크리스트" 4곳 (BODY_SCALE / R_PHASE_BODY_ALLOWLIST / FOCUS_BODIES / R-Phase ADR + CHANGELOG = 5곳 중 4곳 박제 ↔ 5곳 SSoT 와의 부분집합 의미)
- **7곳** — 본 매트릭스 분기 N=7 (defense-in-depth 진입 경로 매트릭스 행 수). #412 §체크리스트 합집합과는 무관
- **결론**: 5/4/7 모두 **다른 축의 카운트** — 동일 SSoT drift 아님. 각 SSoT 의 의미 명확 박제로 reviewer 권고 1, 2 해소

### 회귀 가드

- `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 6 (#404 ADR §결정 §browser-verify 시나리오 6 박제) 가 분기 7 작동 자동 회귀 가드. CI `detect-and-test` job 통합 (기존 verify:r-phase-allowlist 패턴 일관)
- R6 (jupiter) 진입 시 본 매트릭스 분기 7 의 차단/정상 분기 자동 전환 검증 (`R_PHASE_BODY_ALLOWLIST` 1줄 추가만으로 zero-touch — #404 ADR §Concrete Prediction 인용)
