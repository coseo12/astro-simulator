# ADR: url-sync R-Phase Allowlist 가드 — store mutation 측면 3번째 방어선

- **상태**: Accepted
- **날짜**: 2026-05-04
- **결정자**: architect (#415 PM 위임, 2026-05-04)
- **관련**: #415 (본 이슈), #402 (부모 — Top 1 FocusQuickButtons MERGED), #403 (Top 2 후속), #404 (Top 3 후속), `20260504-r-phase-allowlist-guard.md` (부모 ADR — defense-in-depth UI/scene 2축), `20260425-r1-store-scene-sync-unification.md` (event 단일 진실원 — 본 ADR §결정 1 근거)
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21) — `isRPhaseFocusable` SSoT 재사용, 신규 가드 함수 박제 0), "주석 계약 vs 구현 drift" (volt [#49](https://github.com/coseo12/volt/issues/49) — url-sync.tsx line 75-76 historical 주석이 race condition 보호 역할을 가렸음), "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — #402 라운드 2 PASS 후 정적 리뷰 우회 잠복 발견), "단계 게이트" (volt [#77](https://github.com/coseo12/volt/issues/77) — reviewer 정적 분석이 본 우회 식별, qa/사용자 검증으로는 불가능했을 잠복)

---

## 배경

PR #414 (#402 라운드 2) reviewer 정적 리뷰 권고 3 발견. https://github.com/coseo12/astro-simulator/pull/414#issuecomment-4369166088

`apps/web/src/core/url-sync.tsx:71-84` 의 초기 1회 useEffect 에서 `?focus=<bodyId>` URL 파라미터 처리가 다음 2단 호출:

```typescript
if (validIds.has(urlFocus)) {
  sendCommand({ type: 'focusOn', bodyId: urlFocus }); // (1) scene focus
  setSelectedBody(urlFocus); // (2) store mutation 직접
}
```

**문제**: (2) `setSelectedBody(urlFocus)` 직접 호출이 simulation-core focusOn handler 의 R-Phase allowlist 가드 (PR #414 의 `isRPhaseFocusable(bodyId)` 검사) 를 **우회**. URL `?focus=earth` 직접 진입 시:

1. (1) sendCommand → simulation-core `case 'focusOn'` → `isRPhaseFocusable('earth') === false` → emit 차단 + console.warn (PR #414 가드 작동)
2. (2) setSelectedBody('earth') → store 직접 mutation → `selectedBodyId === 'earth'` 잔재 (가드 우회)
3. selectedBodyId 의존 컴포넌트 (info-panel / celestial-tree / sim-canvas focus subscribe / focus-quick-buttons highlight) 잘못된 표시
4. 추가 회귀: sim-canvas line 422 의 `state.selectedBodyId !== prev.selectedBodyId` subscribe 가 `syncFocusToScene('earth')` 호출 → `BODY_SCALE` 미박제 R4+ body 의 점/잔재 시각 회귀 (`#412` 인접)

### #402 ADR 직교 영역 vs 본 이슈

- **#402 부모 ADR §결정 2 (UI 가드)**: focus-quick-buttons.tsx 의 disabled + tooltip + opacity. UI 클릭 경로 1차 방어선
- **#402 부모 ADR §결정 3 (scene 가드)**: simulation-core focusOn handler 의 emit 차단. command 경로 2차 방어선
- **본 이슈 (store mutation 측면)**: url-sync 의 store action 직접 호출 — 위 2축이 가드하지 않는 **3번째 우회 경로**. PR #414 시점 정적 리뷰가 식별

### url-sync.tsx line 78 의 historical 의도 (구현 drift 분석)

line 75-76 주석:

> "shortcut 버튼 클릭 경로는 controller.focusOn 후 'bodySelected' event 가 emit 되지만,
> URL 직접 진입 시 그 event 가 발생하지 않아 selectedBodyId 가 set 되지 않는 기존 동작 보강."

**현재 진실 (실측)**:

- `core-adapter.ts:26-28` 의 `core.on('bodySelected', ...)` → `store.setSelectedBody(id)` 자동 호출 — emit 되면 selectedBodyId 자동 sync
- `simulation-core.ts:220` `case 'focusOn'` → `this.#emitter.emit('bodySelected', { id: cmd.bodyId })` — focusOn command 가 emit 호출 (PR #414 가드 통과 시)
- 결론: line 75-76 주석은 R1 #334+#335 (`20260425-r1-store-scene-sync-unification.md`) 이전 시대의 **stale comment**. 현재는 sendCommand({type:'focusOn'}) 단독으로 selectedBodyId sync 가능

**그럼 line 78 의 진짜 존재 이유는?** — race condition 보호:

- `useSimCommand()` (sim-context.tsx:33) 는 core null 시 `() => undefined` no-op fallback
- url-sync.tsx 가 sim-canvas children 에 위치 (sim-canvas.tsx:511), 그러나 sim-canvas 가 core 인스턴스 생성을 비동기 useEffect 에서 수행 (라인 ~280)
- url-sync 의 초기 1회 useEffect 발화 시점에 `core === null` 가능 → `sendCommand` no-op → emit 0 → setSelectedBody 호출 0 → URL `?focus=sun` 진입했는데 selectedBodyId 가 null 인 회귀
- line 78 은 이 race 를 보호하는 **fallback** 으로 작동 중

이는 옵션 비교에서 옵션 A (line 78 단순 제거) 의 race 위험을 의미 — 부모 ADR §결정 3 의 emit 단일 진실원 정책과 sim-context no-op fallback 사이의 timing gap.

---

## 후보 비교

축은 5개로 평가: (1) 가드 강도 / (2) SSoT 정신 / (3) 코드 변경 범위 / (4) 회귀 위험 (race) / (5) ADR 일관성.

### 후보

| 후보                         | 설명                                                                                                                                                       |
| ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. line 78 직접 제거**     | `setSelectedBody(urlFocus)` 호출 단순 제거. sendCommand({type:'focusOn'}) 만 남김. focusOn handler 의 emit → core-adapter → setSelectedBody 자동 sync 의존 |
| **B. url-sync 자체 가드**    | line 78 위치에 `isRPhaseFocusable(urlFocus)` 검사 + dev console.warn 추가. allowlist 외 body 면 sendCommand 도 setSelectedBody 도 둘 다 skip               |
| **C. sim-store action 가드** | `setSelectedBody` action 자체에 `isRPhaseFocusable(id)` 검사 + dev console.warn. 모든 호출자에 일괄 적용 (url-sync / core-adapter / sim-store.test 등)     |
| **D1. A + B 결합**           | line 78 제거 + url-sync 자체에 (urlFocus 검증 시점에) `isRPhaseFocusable` 가드 분기 추가. sendCommand 도 가드 통과 후 1회만 호출                           |
| **D2. B 단독 (보강된 형태)** | line 78 보존하되 if 분기에 `isRPhaseFocusable` 가드 합류. sendCommand + setSelectedBody 둘 다 가드 통과 시에만 실행. race 보호 fallback 유지               |

### 축 1 — 가드 강도 (R-Phase allowlist 외 body 의 store mutation 차단)

| 후보   | 평가                                                                                                                                                        | 점수    |
| ------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A      | sendCommand → focusOn → emit 차단 (PR #414 가드 작동). 단, **race condition 시 (core null) sendCommand no-op + setSelectedBody 호출도 0** → 가드 통과**됨** | 4/5     |
| B      | url-sync 자체에서 1차 차단 — sendCommand / setSelectedBody 둘 다 skip. scene 가드 (PR #414) 와 함께 2중 방어                                                | 5/5     |
| C      | sim-store action 가드 — store mutation 차단 보장. 단 url-sync 가 sendCommand 만 남기고 line 78 보존 시 race 후 store mutation 시도 → 가드가 reject (정상)   | 5/5     |
| D1     | url-sync 가드 + scene 가드 + (옵션) sim-store 가드 — 3중 방어 가능. race 통과 후 line 78 부재 시 emit 단독 의존 → race 시점 가드는 url-sync 차원에서 처리   | 5/5     |
| **D2** | url-sync 가드 통과 시 sendCommand + setSelectedBody 둘 다 호출 — race 시 setSelectedBody fallback 작동 + 가드는 url-sync 진입에서 1차 차단                  | **5/5** |

### 축 2 — SSoT 정신 (R_PHASE_BODY_ALLOWLIST 단일 진실원 + 가드 helper 재사용)

| 후보   | 평가                                                                                                                                                                                                                 | 점수    |
| ------ | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A      | 가드 위치 0 추가 — focusOn handler (scene 측면) 가드에 위임. SSoT 변동 0                                                                                                                                             | 5/5     |
| B      | url-sync 가 `isRPhaseFocusable` named import 추가. SSoT 재사용 (#402 부모 ADR §Amendment D1 named import 패턴 일관)                                                                                                  | 5/5     |
| C      | sim-store 가 `isRPhaseFocusable` named import 추가. SSoT 재사용 양호. **단** sim-store action 의 시맨틱 변경 — "store mutation = 도메인 정책" 결합 → store 책임이 R-Phase 도메인 정책까지 확장 (단일 책임 약간 위배) | 3/5     |
| D1     | url-sync + scene 둘 다 같은 SSoT 참조 — 일관성 좋음                                                                                                                                                                  | 5/5     |
| **D2** | url-sync 가 1곳에 SSoT 박제 — 단일 helper, 단일 책임                                                                                                                                                                 | **5/5** |

### 축 3 — 코드 변경 범위 + 영향 모듈

| 후보   | 변경 파일                                                                                                                                        | 단위 테스트 영향                                                                                                                                   | 점수    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------ | -------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A      | url-sync.tsx 1줄 삭제                                                                                                                            | 0 (race 회귀 시 e2e 영향)                                                                                                                          | 5/5     |
| B      | url-sync.tsx ~5줄 추가 + import 1줄 + 단위 테스트 신규 (~30줄) + 회귀 가드 mjs 확장 (~30줄)                                                      | url-sync 단위 테스트 신규 (현재 0) — DoD-3 의무                                                                                                    | 4/5     |
| C      | sim-store.ts ~5줄 추가 + import 1줄 + 단위 테스트 갱신 (sim-store.test 의 line 53-55 `setSelectedBody('jupiter')` 가 실패 — 테스트 fixture 수정) | sim-store.test 영향. core-adapter 동작 영향 (`setSelectedBody(id)` 가 reject → R-Phase 외 body 의 정상 emit 시 store 미반영) → 부수 영향 검증 부담 | 2/5     |
| D1     | url-sync.tsx ~5줄 추가 + line 78 제거 + 단위 테스트 + 회귀 가드 — B 와 동일                                                                      | B 와 유사. line 78 제거로 race 회귀 위험 추가                                                                                                      | 3/5     |
| **D2** | url-sync.tsx ~5줄 추가 (가드 분기) + import 1줄 + 단위 테스트 + 회귀 가드 — line 78 보존                                                         | url-sync 단위 테스트 신규                                                                                                                          | **4/5** |

### 축 4 — 회귀 위험 (race condition 보호)

| 후보   | 평가                                                                                                                                                                                                                                                                            | 점수    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------- |
| A      | **HIGH RISK** — line 78 단순 제거. core 가 mount 전 url-sync useEffect 발화 시 sendCommand no-op → emit 0 → setSelectedBody 호출 0 → URL `?focus=sun` 진입했는데 selectedBodyId null 회귀 (#329 R1 회귀 가능). 현재 line 78 은 이 race 의 fallback 역할 — 제거 시 회귀 잠복     | 1/5     |
| B      | line 78 보존 — race fallback 유지. 단, `isRPhaseFocusable` 분기에 sendCommand + setSelectedBody 둘 다 묶음 → race 시 setSelectedBody fallback 작동                                                                                                                              | 5/5     |
| C      | sim-store action 가드. race 시 sendCommand no-op + setSelectedBody → action 가드 통과 (sun/mercury/venus 라면 reject 0) → 정상. **부수 영향**: core-adapter onBodySelected (line 26-28) 가 `setSelectedBody(null)` 호출 시 `isRPhaseFocusable(null) === true` → reject 0 (정상) | 4/5     |
| D1     | A 의 race 위험 그대로                                                                                                                                                                                                                                                           | 1/5     |
| **D2** | line 78 보존 + 가드. race fallback 유지하면서 R-Phase 외 body 차단                                                                                                                                                                                                              | **5/5** |

### 축 5 — #402 부모 ADR 일관성 + #378 옵션 D 패턴

| 후보   | 평가                                                                                                                                                                                                                                       | 점수    |
| ------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ | ------- |
| A      | "scene 가드 단독 신뢰" — #402 부모 ADR §결정 3 의 emit 차단에 위임. defense-in-depth 패턴 위배 (scene 측면 단독 → race 시 fallback 부재로 "0 가드 = 0 회귀" 의존)                                                                          | 2/5     |
| B      | **defense-in-depth 3축** (UI / scene / store mutation) — #402 부모 ADR 의 2축 (UI + scene) + 본 ADR §결정 1 의 3번째 축 (store mutation = url-sync). #378 옵션 D 패턴 (`20260503-378-focus-frustum-fix.md`) 일관 — "여러 진입점 각각 가드" | 5/5     |
| C      | 4번째 축 (sim-store action 자체) 박제. 일관성 양호 단, store mutation 측면을 store layer 자체로 끌어올림 → SSoT 책임 비대 (축 2 단일 책임 위배)                                                                                            | 3/5     |
| D1     | A의 race 위험 + B 의 패턴                                                                                                                                                                                                                  | 3/5     |
| **D2** | #402 부모 ADR §결정 3 의 emit 단일 진실원 + #378 옵션 D 패턴 직접 일관                                                                                                                                                                     | **5/5** |

### 종합

| 후보   | 가드(1) | SSoT(2) | 변경(3) | 회귀(4) | ADR(5) | 합계   |
| ------ | ------- | ------- | ------- | ------- | ------ | ------ |
| A      | 4       | 5       | 5       | 1       | 2      | 17     |
| B      | 5       | 5       | 4       | 5       | 5      | 24     |
| C      | 5       | 3       | 2       | 4       | 3      | 17     |
| D1     | 5       | 5       | 3       | 1       | 3      | 17     |
| **D2** | **5**   | **5**   | **4**   | **5**   | **5**  | **24** |

**B 와 D2 가 동률**. 차이점:

- **B 정의**: line 78 위치에 가드 추가 (line 78 자체는 보존)
- **D2 정의**: B 의 보강된 형태 — 가드 분기 안에서 line 77+78 둘 다 호출

실질적으로 B = D2 (둘 다 line 77+78 보존, 가드 분기 추가). 표현 차이만 있다. **채택: B (= D2)** — 단순 표현 선호.

---

## 결정

### 결정 1 — url-sync 자체 가드 (옵션 B = D2)

`apps/web/src/core/url-sync.tsx` line 71-84 의 if 분기에 `isRPhaseFocusable(urlFocus)` 가드 합류:

```typescript
import { isRPhaseFocusable } from '@astro-simulator/core';
// ... (named import — #402 부모 ADR §Amendment D1 패턴 일관)

if (urlFocus) {
  const validIds = new Set(ephemerisApi.getSolarSystem().bodies.map((b) => b.id));
  if (!validIds.has(urlFocus)) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[url-sync] ?focus=${urlFocus} 는 알 수 없는 body id — 무시. 허용 id 예: sun / earth / jupiter / neptune.`,
      );
    }
  } else if (!isRPhaseFocusable(urlFocus)) {
    // R-Phase 미진입 body — store mutation 우회 차단 (defense-in-depth store mutation 측면).
    // ADR `20260504-415-url-sync-guard.md` §결정 1.
    if (process.env.NODE_ENV !== 'production') {
      console.warn(
        `[url-sync] ?focus=${urlFocus} 는 R-Phase 미진입 body — 무시. ` +
          `R_PHASE_BODY_ALLOWLIST: ${R_PHASE_BODY_ALLOWLIST.join(', ')}.`,
      );
    }
  } else {
    // 카메라 focus + store selectedBodyId sync.
    // line 77 (sendCommand) + line 78 (setSelectedBody) 둘 다 보존:
    //   - sendCommand({type:'focusOn'}) → simulation-core focusOn → emit 'bodySelected' → core-adapter → setSelectedBody 자동
    //   - setSelectedBody(urlFocus) 는 race condition fallback (sim-canvas mount 전 useSimCommand no-op 시 보호)
    sendCommand({ type: 'focusOn', bodyId: urlFocus });
    setSelectedBody(urlFocus);
  }
}
```

**근거**:

- 가드 강도 5/5 (allowlist 외 body 의 sendCommand + setSelectedBody 둘 다 차단)
- race condition 보호 5/5 (line 77+78 둘 다 보존)
- defense-in-depth 3축 일관 — UI (#402 §결정 2) + scene (#402 §결정 3) + url-sync (본 ADR §결정 1)
- SSoT 재사용 — `isRPhaseFocusable` named import 만 추가, 신규 helper 박제 0
- **실측 안전망**: PR #414 의 simulation-core focusOn 가드는 그대로 작동 — sendCommand({type:'focusOn'}) 가 R-Phase 외 body 인 경우 emit 차단. 본 결정 1 의 url-sync 가드는 그 위에 1차 방어선

### 결정 2 — `R_PHASE_BODY_ALLOWLIST` named import 추가 (web 측)

위 결정 1 의 console.warn 메시지에서 allowlist 목록 노출 (사용자/개발자 진단 도움) — `R_PHASE_BODY_ALLOWLIST` 도 함께 named import:

```typescript
import { isRPhaseFocusable, R_PHASE_BODY_ALLOWLIST } from '@astro-simulator/core';
```

**근거**:

- #402 부모 ADR §Amendment D1: named import 만 허용 (namespace 경유 금지). 본 결정 일관
- url-sync.tsx 는 sim-canvas children 으로 SSR 평가 대상 가능성 있음 → namespace 경유 시 chain 평가 trigger 위험. named import 안전
- `R_PHASE_BODY_ALLOWLIST` 가 `core/src/index.ts` 에 직접 박제 (PR #414) — 이미 named export 가능

### 결정 3 — 회귀 가드 확장 (browser-verify-r-phase-allowlist.mjs)

DoD-2 충족:

- 시나리오 4 신규: URL 직접 진입 매트릭스 — `?focus=earth` / `?focus=jupiter` / `?focus=neptune` 각각으로 `goto()` 후
  - `selectedBodyId === null` 단언 (변화 0)
  - `console.warn` 메시지에 `R-Phase 미진입` 또는 `not in R_PHASE_BODY_ALLOWLIST` 포함 (1개 이상 — url-sync 또는 simulation-core 어느 한쪽)
  - camera radius 변화 0
- 시나리오 4-2: 정상 동작 회귀 가드 — `?focus=sun` / `?focus=mercury` / `?focus=venus` 진입 시 `selectedBodyId === <body>` 단언 (R1 #329 / R2 #361 / R3 #369 회귀 보호)

### 결정 4 — 단위 테스트 (DoD-3)

`apps/web/src/core/url-sync.test.tsx` 신규 (현재 0):

- mock: `useSimStore` / `useSimCommand` / `nuqs` 의 `useQueryState` (parseAsString)
- 매트릭스:
  - `?focus=sun` → setSelectedBody('sun') 1회 호출 + sendCommand({type:'focusOn', bodyId:'sun'}) 1회 호출
  - `?focus=earth` → setSelectedBody 0회 호출 + sendCommand 0회 호출 (`focusOn` 타입) + console.warn 1회
  - `?focus=invalid` → setSelectedBody 0회 호출 + console.warn 1회 (기존 가드 회귀 보호)
  - `?focus=null` → 둘 다 0회 호출

근거: testing-library/react + vitest 패턴 — 기존 `mode-switcher.test.tsx` / `time-controls.test.tsx` / `focus-quick-buttons.test.tsx` 의 mock 패턴 일관.

### 결정 5 — #402 부모 ADR §Amendment 추가 항목 (5번째 박제 절차 보강)

**부모 ADR `20260504-r-phase-allowlist-guard.md` §Amendment §결정 D2 (5번째 박제 항목)** 의 5번째 항목 ("WASM 의존 도메인 sub-path 추가 금지 검증") 은 보존. 본 ADR 은 그 외 6번째 항목 추가 권고:

6. **외부 진입점 (URL 파라미터 / deep link / programmatic command) 우회 가드 박제 의무**:
   - URL 파라미터 처리기 (url-sync.tsx 등) 가 store mutation 직접 호출 시 `isRPhaseFocusable` 가드 통합 의무
   - deep link / external command 진입점 신설 시 동일 가드 의무
   - 검증: 회귀 가드 mjs 의 URL 직접 진입 시나리오 매트릭스 (DoD-2 의 시나리오 4)

이는 부모 ADR §결정 4 의 4곳 (라운드 1) → 5곳 (라운드 2 §Amendment D2) → **6곳** 동시 박제 절차 확장. 단, 실제 부모 ADR 본문 갱신은 본 PR 머지 후 follow-up amendment commit (또는 별도 PR) 로 박제 (architect 비-범위에서 부모 ADR 본문 직접 수정 금지 규칙 준수).

**대안 (비-침범)**: 부모 ADR §관련 ADR 섹션에 본 ADR cross-link 추가만으로 충분 — 6번째 항목 자체는 본 ADR §결정 1 이 이미 담당. 부모 ADR §결정 4 의 절차에는 "외부 진입점 가드 의무" 문구만 1줄 추가 (본 ADR cross-link). PR diff 최소화.

**채택**: 비-침범 대안 (부모 ADR 본문 1줄만 수정 + cross-link). developer 단계에서 처리.

---

## 결과·재검토 조건

### 기대 효과 (측정 가능)

- **DoD-1 (회귀 시나리오 해소)**: URL `?focus=earth` 직접 진입 후 `selectedBodyId === null` (시나리오 4 회귀 가드 PASS)
- **DoD-2 (회귀 가드)**: `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 4 매트릭스 PASS — earth / jupiter / neptune URL 진입 매트릭스 + sun / mercury / venus 정상 동작 매트릭스
- **DoD-3 (단위 테스트)**: `apps/web/src/core/url-sync.test.tsx` 신규 — 4 케이스 매트릭스 PASS
- **DoD-4 (한글 인코딩)**: U+FFFD (replacement character) 0건 — `scripts/check-encoding.sh` PASS
- **DoD-5 (CHANGELOG)**: `### Behavior Changes` 박제 — "url-sync `?focus=` 파라미터가 R_PHASE_BODY_ALLOWLIST 외 body 진입 시 store mutation skip + dev console.warn"
- **race condition 보호 보존**: `?focus=sun` URL 진입 시 selectedBodyId === 'sun' (R1 #329 회귀 보호) — line 78 fallback 역할 유지

### 트레이드오프로 받아들인 비용

- **url-sync.tsx 가 R-Phase 도메인 정책에 직접 의존**: 단일 책임 측면에서는 url-sync 가 "URL 파라미터 처리"라는 책임에 R-Phase allowlist 정책이 합류. 단, `isRPhaseFocusable` 은 helper 호출 1줄 — 정책 SSoT 자체는 여전히 `r-phase-allowlist.ts`. 결합 최소
- **race condition fallback (line 78) 유지**: sim-context no-op fallback 의 timing gap 자체는 본 ADR §비-범위 — 별도 후속 이슈 (재검토 조건 1) 로 분리 가능. 현재는 "잘 작동 중인 race fallback" 보존이 안전 선택

### Concrete Prediction

- **A. 코드 변경 범위 (실측 가능)**: `git diff --stat develop..fix/415` 결과
  - url-sync.tsx: ~10줄 추가 (가드 분기 + import 1줄 + 코멘트 3줄)
  - url-sync.test.tsx (신규): ~50줄 (4 케이스 + setup mock)
  - browser-verify-r-phase-allowlist.mjs: ~40줄 추가 (시나리오 4 매트릭스 + helper)
  - CHANGELOG.md: 1~2줄 추가
  - 부모 ADR `20260504-r-phase-allowlist-guard.md`: §결정 4 또는 §관련 ADR 에 cross-link 1줄 추가 (선택)
  - **총 변경**: ~100~110 lines, 5 파일. R-Phase allowlist 자체 (`r-phase-allowlist.ts`) 변경 0 — SSoT 보존 검증
- **B. 회귀 가드 시나리오 4 매트릭스 PASS 시간**: 시나리오 1~3 + 4 (3 disabled body × 2 단언 + 3 enabled body × 1 단언 = 9 케이스 추가) — 기존 스크립트 ~15초 → 예상 ~25초 (페이지 reload 6회 추가). CI 시간 영향 < 30초

### 재검토 조건

1. **sim-context useSimCommand race condition 자체 해결 시** → line 78 fallback 의 존재 이유 소멸. 본 ADR §결정 1 의 가드 분기는 유지하되 line 77 + 78 의 line 78 단독 제거 가능. 별도 후속 ADR / 이슈 박제 필요 — **충족 완료 (#419 ADR Accepted, 2026-05-10) — §Amendment (2026-05-10) 참조**
2. **다른 외부 진입점 (deep link / programmatic API / IPC) 신설 시** → 본 ADR §결정 5 의 6번째 박제 항목 (외부 진입점 가드 의무) 적용. 새 진입점도 `isRPhaseFocusable` 가드 통합
3. **R_PHASE_BODY_ALLOWLIST 가 5개 이상 도달 시** → 부모 ADR §재검토 조건 2 (자동화 ROI 재평가) 와 함께 평가. 본 ADR §결정 1~4 자동화 가능성 검토
4. **store mutation 측면 다른 직접 호출 발견 시** (예: programmatic IPC / external store action 호출 등) → 본 ADR amendment 로 4번째 가드 축 박제 또는 별도 ADR

---

## 비-범위

- **#403 (Top 2 CelestialTree + InfoPanel)** — 별도 이슈. R4+ body 클릭 disabled 정책. 본 ADR SSoT (`R_PHASE_BODY_ALLOWLIST`) 인용 의무 (부모 ADR §비-범위 일관)
- **#404 (Top 3 ScenarioPresets R6 이전 disabled)** — 별도 이슈
- **#412 (BODY_SCALE 미박제 5+ body 정책)** — 별도 이슈. 본 ADR 가드 통과한 정상 body 의 시각 표현은 `BODY_SCALE` SSoT 의 책임
- **`useSimCommand` race condition 자체 해결** — 재검토 조건 1. 본 sprint 비목표
- **sim-store action 가드 (옵션 C)** — 단일 책임 위배 + 부수 영향 검증 부담으로 기각 (축 2/3 점수)
- **sim-store.test 의 `setSelectedBody('jupiter')` 케이스 갱신** — 옵션 C 미채택으로 변경 0
- **부모 ADR `20260504-r-phase-allowlist-guard.md` 본문 직접 수정** — architect 비-범위. cross-link 1줄 추가는 developer 단계에서 처리
- **자동화 hook (외부 진입점 가드 의무 자동 검증)** — 재검토 조건 1/2 시 분리

---

## 참고

- 발화점: PR #414 (#402 라운드 2) reviewer 정적 리뷰 권고 3 (2026-05-04)
- Builds on: #402 (라운드 2 MERGED, `d2f6adf`), `20260504-r-phase-allowlist-guard.md` (부모 ADR)
- 이슈: [#415](https://github.com/coseo12/astro-simulator/issues/415)
- 코드 SSoT:
  - `apps/web/src/core/url-sync.tsx:71-84` (가드 박제 대상 — 결정 1)
  - `packages/core/src/scene/r-phase-allowlist.ts` (`isRPhaseFocusable` SSoT 재사용)
  - `packages/core/src/index.ts` (named export — 결정 2)
  - `apps/web/src/core/url-sync.test.tsx` (신규 — 결정 4)
  - `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` (시나리오 4 매트릭스 — 결정 3)
- volt 교훈: [#21](https://github.com/coseo12/volt/issues/21) (사전 조사 — `isRPhaseFocusable` 재사용), [#49](https://github.com/coseo12/volt/issues/49) (주석 drift — line 75-76 historical 주석 분석), [#67](https://github.com/coseo12/volt/issues/67) (Explore 정적 분석 충분), [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작 — 본 이슈 자체가 #402 PASS 후 정적 리뷰 우회 잠복), [#77](https://github.com/coseo12/volt/issues/77) (단계 게이트 — reviewer 정적 분석이 본 우회 식별)

---

## 교차검증 반영 사항

cross-validate 1회 (2026-05-04, anchor=ADR 신규, outcome=applied — `.claude/logs/cross-validate-architecture-20260504-225329.log`).

### Claude 편향 4종 셀프 체크

- **낙관적 일정**: N/A (architect 단계 — 일정 추정 없음)
- **결합 간과**: 통과 — line 78 의 race condition fallback 역할을 명시 분석 + line 77 의 emit chain 까지 추적 (drift 분석 §배경 마지막 블록)
- **폐기 프레이밍**: 통과 — Accepted, 외부 조건부 경계 명시 (재검토 조건 4종)
- **순수주의**: 통과 — 옵션 C (sim-store action 가드) 의 단일 책임 위배 트레이드오프를 정성 평가 후 채택 안 함. 옵션 A 의 race 위험을 "이상적 단순성 vs 실제 race 보호" 균형으로 기각. line 78 보존을 "race fallback 의 실용 가치" 로 인정

### 합의 (Claude 설계와 일치 — Gemini 양호 평가)

- **결정 1 옵션 B/D2 채택의 기술적 타당성**: 5개 축 평가 통해 도출된 결정에 전적 동의 — race condition 회귀 위험 회피 + SRP 위배 회피 둘 다 정확
- **structural 완성도**: 배경 / 후보 비교 / 결정 / 근거 / DoD / 재검토 조건 / 비-범위 + 교훈 적용 + Concrete Prediction 까지 완벽한 구조
- **Defense-in-depth 3번째 방어선 구축**: UI (#402 §결정 2) + scene (#402 §결정 3) + url-sync (본 §결정 1) 의 일관성 양호
- **named import 패턴 (#402 §Amendment D1) 일관**: `@astro-simulator/core` 로부터 `isRPhaseFocusable` + `R_PHASE_BODY_ALLOWLIST` 만 노출 — module 결합도 최소

### 이견 수용

- 없음. Gemini 가 결정 5축 모두 합의

### Claude 재분석으로 기각한 Gemini 제안

- 없음. Gemini 가 보완 제안만 제시 (반대 의견 없음)

### 고유 발견 (현재 ADR 에 즉시 반영)

1. **단위 테스트에 `console.warn` spy 단언 추가** (Gemini 보안 §5 권고):
   - 범위 체크: 본 ADR §결정 4 (단위 테스트) 의 매트릭스 보강 — DoD-3 의 4 케이스 중 R-Phase 외 body 케이스 (`?focus=earth`) 와 invalid 케이스 (`?focus=invalid`) 의 단언에 `vi.spyOn(console, 'warn')` + 호출 횟수 + 메시지 내용 (`'R-Phase 미진입'` 또는 `'알 수 없는 body id'` 부분 매칭) 추가
   - 반영: §결정 4 매트릭스에 명시적 spy 단언 의무 추가. developer 단계에서 박제

2. **Concrete Prediction 에 성능 영향 명시** (Gemini §6 권고):
   - 범위 체크: 본 ADR §결과·재검토 조건 §Concrete Prediction 보강 — `isRPhaseFocusable` 호출은 useEffect 초기 1회 + Set.includes 1회 = O(1) 상수 시간. 클라이언트 성능 영향 무시 가능 (< 0.1ms)
   - 반영: 아래 §Concrete Prediction C 신규 항목으로 박제

### 고유 발견 (후속 분리)

1. **가드 거부 시 사용자 UX 피드백** (Gemini §6 권고 - UX 측면) → [#418](https://github.com/coseo12/astro-simulator/issues/418):
   - URL `?focus=earth` 진입 후 selectedBodyId null 유지 → 사용자가 URL 파라미터 무시됨을 인지 못 함
   - 후속 분리 근거: 본 sprint DoD 가 "store mutation 차단" + "dev console.warn" 만 다룸. 사용자 facing UX (Toast / URL replace) 는 직교 영역 + UI/i18n 디자인 결정 동반 필요
   - 우선순위: low (잠복 회귀 발생 빈도 낮음 — URL 직접 진입 + R-Phase 외 body 동시 조건. CRITICAL #6 stage:planning 분리)
   - 후속 이슈 박제: [#418](https://github.com/coseo12/astro-simulator/issues/418) (`Builds on: #415`)

2. **`useSimCommand` race condition 자체 기술 부채** (Gemini §2 권고) → [#419](https://github.com/coseo12/astro-simulator/issues/419):
   - 본 ADR §재검토 조건 1 에 이미 박제 — 본 sprint 의 line 78 fallback 보존은 "race 의 임시 보호"이고 근본 해결은 별도 sprint
   - 우선순위: medium (race 발현 시 line 78 이 보호하지만 SSoT 으로 부적절 — sim-canvas mount 순서 자체 정합화가 본질 해결)
   - 후속 이슈 박제: [#419](https://github.com/coseo12/astro-simulator/issues/419) (`Builds on: #415`)

3. **`useGuardedQueryParam` 재사용 추상화** (Gemini §3 권고 - 장기):
   - URL 파라미터 처리 패턴이 deep link / external API 등 신설 시 반복 → 커스텀 훅 추출
   - 본 sprint 비-범위 — url-sync.tsx 의 다른 파라미터 (mode / t / speed / engine / lod) 는 R-Phase 가드 무관. 추상화 ROI 가 낮음
   - 우선순위: low (재발 패턴 1회만 관찰 — 미래 재발 시 재평가)
   - 후속 분리: 별도 이슈 박제 안 함 — 본 ADR §재검토 조건 4 에 trigger 조건만 박제

### 결정 4 보강 (cross-validate 반영)

§결정 4 단위 테스트 매트릭스의 `?focus=earth` / `?focus=invalid` 케이스에 다음 단언 의무 추가:

```typescript
const warnSpy = vi.spyOn(console, 'warn').mockImplementation(() => {});
// ... render UrlSync with ?focus=earth ...
expect(warnSpy).toHaveBeenCalledTimes(1);
expect(warnSpy.mock.calls[0][0]).toMatch(/R-Phase 미진입/);
```

근거: 진단 기능이 dev 환경에서 실제 작동하는지 보장. silent ignore 의 race 잠복 방지.

### Concrete Prediction C — 성능 영향 (cross-validate 반영)

- **C. 성능 영향 (실측 가능)**: `isRPhaseFocusable` 은 useEffect 초기 1회 + Set.has lookup 1회 = O(1) 상수 시간 (< 0.1ms). 클라이언트 성능 측정 불필요. dev 환경 console.warn 도 production 빌드에서 dead-code elimination (NODE_ENV 가드)
  - 검증: production 번들에 `R-Phase 미진입` 문자열 부재 확인 (`grep -r "R-Phase 미진입" apps/web/.next/static` 0건) — production 빌드 후 회귀 가드 옵션
  - 실패 시 대응: NODE_ENV 가드 누락 의심 — Edit 후 build 재검증

---

## Amendment (2026-05-10) — §재검토 조건 1 충족 (#419)

ADR `docs/decisions/20260510-419-sim-canvas-mount-race.md` (Accepted) 가 본 ADR §재검토 조건 1 의 `useSimCommand` race condition 본질 해결을 박제. volt #91 ADR Amendment 위치 결정 트리 (b) 패턴 — 신규 이슈 (#419) 가 부모 ADR §재검토 조건을 충족 → 신규 ADR + 부모 ADR Amendment 동시 박제.

### 변경 사항

- **§결정 1 (옵션 B = D2) 의 url-sync.tsx line 104 `setSelectedBody(urlFocus)` race fallback 제거** — #419 §결정 2 에서 처리. 본 ADR §결정 1 의 가드 분기는 그대로 유지 (sendCommand 단독으로 R-Phase allowlist 외 body 차단 + R-Phase 진입 body 의 emit chain 자동 sync)
- **§배경 line 50-58 의 race condition 분석** 은 historical 기록으로 보존 — drift 분석의 정확성을 미래 관찰자가 재구성 가능하게 함

### 연쇄 효과

- 본 ADR §결정 4 (단위 테스트 매트릭스) 의 케이스 1 단언이 race fallback 부재 환경 가정으로 재해석 — sendCommand 호출만 확인. selectedBodyId 단언은 browser-verify (e2e) 이관 (#419 §결정 3-2)
- 본 ADR §재검토 조건 1 → "충족 완료 (#419 ADR Accepted, 2026-05-10)" 로 박제
- 본 ADR §재검토 조건 2 (외부 진입점 신설 시 가드) 는 race 부재 환경이므로 외부 진입점 race 인식 의무 소멸 — 가드 의무만 박제

### Cross-link

`docs/decisions/20260510-419-sim-canvas-mount-race.md` — 본 Amendment 의 근거 ADR (mount 순서 정합화, A1-E early return 채택)
