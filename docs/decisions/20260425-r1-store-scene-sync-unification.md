# ADR: store-scene 동기화 단일 경로 통합 (selectedBodyId ↔ scene focus + camera)

- **상태**: Accepted
- **날짜**: 2026-04-25
- **이슈**: [#334](https://github.com/coseo12/astro-simulator/issues/334) (B-1 store-scene 이중 호출 해소), [#335](https://github.com/coseo12/astro-simulator/issues/335) (B-2 setSelectedBody(null) 카메라 점프 가드)
- **관계**: PR [#332](https://github.com/coseo12/astro-simulator/pull/332) (R1 본 구현 — Phase 1 fix `acfcb74` 가 일상 회귀 차단), PR [#342](https://github.com/coseo12/astro-simulator/pull/342) (#333 Phase 2 — billboard bodyScale 제거), [#336](https://github.com/coseo12/astro-simulator/issues/336) ADR amendment
- **선행 ADR**: [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) §결정 4 ↔ Phase 1 fix 가 본 ADR 의 단일 경로 통합으로 자연 일반화
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (volt #21, 기존 store/scene/controller API 재사용), "신규 데이터 ≠ 신규 코드" (R2~R10 추가 시 본 sync 경로 코드 변경 0 박제), "인계 항목 실측 재검증" (volt #14, Phase 1 fix 머지 후 호출 흐름 grep 으로 reviewer 분석 재확인), "주석 계약 vs 구현 drift" (volt #49, 단일 경로 박제 시 콜백 잔존 시 재침투 위험 → 콜백 자체 삭제)

---

## 통합 vs 분리 결정

#334 (이중 focus 호출) 와 #335 (null 분기 중복 reset) 는 동일 영역 (`sim-canvas.tsx` subscribe 콜백 ↔ `setCameraHandlers`) 의 같은 결합 결함. **단일 ADR + 단일 구현 PR** 로 통합 처리. 분리 시 #334 후보 A 가 #335 의 null 분기를 자연스럽게 흡수하는 구조라 분리 자체가 인위적.

---

## 배경

### 호출 흐름 (현재 develop tip — `068d8ed` Phase 2 머지 후 실측)

**클릭 / URL / programmatic 진입 모두 다음 흐름**:

```
사용자 클릭 (focus-quick-buttons.tsx:28 / celestial-tree.tsx:32 / url-sync.tsx:77)
  ↓
sendCommand({ type: 'focusOn', bodyId })
  ↓
simulation-core.ts:198-201
  ├─ #focusOnHandler?.(bodyId)        ← setCameraHandlers 첫 콜백 (1차)
  │   └─ solar.setFocusOrigin(bodyId)
  │   └─ controller.focusOn({ mesh })  ← Animation.CreateAndStartAnimation × 2 (target + radius)
  └─ emit 'bodySelected' { id }
       ↓
core-adapter.ts:26-28
  └─ store.setSelectedBody(id)
       ↓
sim-canvas.tsx:340 useSimStore.subscribe (Phase 1 fix `acfcb74`)
  └─ state.selectedBodyId !== prev.selectedBodyId 변화 감지
      └─ solar.setFocusOrigin(state.selectedBodyId)  ← 2차 (id !== null)
      └─ controller.focusOn({ mesh })                ← Animation × 2 (1차 즉시 덮어씀)
```

**resetCamera (focus 해제)** 도 동형 중복:

```
sendCommand({ type: 'resetCamera' })
  ↓
simulation-core.ts:202-205
  ├─ #resetCameraHandler?.()           ← setCameraHandlers 둘째 콜백 (1차)
  │   └─ solar.clearFocus()
  │   └─ controller.reset(35)          ← Animation × 2 (target=Zero + radius=35)
  └─ emit 'bodySelected' { id: null }
       ↓
core-adapter.ts → store.setSelectedBody(null)
       ↓
sim-canvas.tsx:367-370 (else 분기)
  └─ solar.clearFocus()                 ← 2차
  └─ controller.reset(35)               ← Animation × 2 (1차 즉시 덮어씀)
```

### 구조적 결함

- **이중 진실원**: scene 호출 책임이 두 곳 (`setCameraHandlers` 콜백 + `subscribe` 분기) 에 분산. URL parser / 클릭 / programmatic API 가 한쪽만 트리거하면 회귀 (PR #332 검증 중 발견된 회귀의 근본 원인 — Phase 1 fix `acfcb74` 가 두 번째 경로를 추가해 차단했지만 첫 경로도 살아있음)
- **Animation 덮어쓰기 비용**: `Animation.CreateAndStartAnimation` 은 동일 target 즉시 재호출 시 첫 tween 을 즉시 폐기하지만 Babylon `_runtimeAnimations` 큐에 일시 push 후 flush 되는 과정 비용 발생. floating origin `setOriginToBody` 는 동일 좌표 재호출 시 line 84-85 에서 no-op 보호 (`if (newId === currentId)`) — animation 은 보호 안 됨
- **frame 1 jitter 잠재**: 두 번 시작된 tween 의 `from` 값이 미세하게 다를 수 있는 race (1차 tween 이 0.1ms 이미 진행한 상태를 2차가 `clone()` 으로 캡처 후 같은 target 으로 재시작) — 시각 차이 미미하지만 60fps 1프레임 jitter 가능
- **#335 잠재 위험**: 미래 info-panel close 버튼 추가 시 `setSelectedBody(null)` 만 호출 → subscribe else 분기로 카메라 강제 reset(35). 사용자 의도와 분리될 수 있음 (close = "정보만 닫기" 일 때 카메라 점프는 의도 외)

### Phase 1 fix `acfcb74` 와의 관계

PR #332 implementer 가 회귀 차단을 위해 `subscribe` 분기 (sim-canvas.tsx:340-372) 를 **추가** 했으나, **`setCameraHandlers` 콜백을 함께 폐기하지 않아** 이중 경로 상태로 머지. reviewer 가 §B-1 에서 "변수 분리 자체의 유지 vs 통합" 권고로 분리 — 본 ADR 이 그 통합 결정.

### 사전 조사 — "신규 함수 ≠ 신규 구현" (volt #21)

기존 API 전수 grep 결과:

| API                            | 위치                      | 본 ADR 에서 재사용                             |
| ------------------------------ | ------------------------- | ---------------------------------------------- |
| `solar.setFocusOrigin(bodyId)` | `solar-system-scene.ts`   | 그대로 — subscribe 분기에서 직접 호출          |
| `solar.clearFocus()`           | `solar-system-scene.ts`   | 그대로 — subscribe 분기에서 직접 호출          |
| `solar.meshes.get(bodyId)`     | `solar-system-scene.ts`   | 그대로 — mesh resolution                       |
| `controller.focusOn({ mesh })` | `camera-controller.ts:52` | 그대로 — subscribe 분기에서 직접 호출          |
| `controller.reset(35)`         | `camera-controller.ts:91` | 그대로 — subscribe 분기에서 직접 호출 (조건부) |
| `useSimStore.subscribe`        | `sim-store.ts` (Zustand)  | 그대로 — Phase 1 fix 패턴 확장                 |

**신규 함수 0개**. 단일 경로 통합은 기존 함수의 호출 위치 정리만으로 가능.

---

## 후보 비교

### 축 1 — store-scene 동기화 단일 경로 통합 방식 (#334)

#### 후보 A — `setCameraHandlers` focus/reset 콜백 폐기 + subscribe 단일 책임 (선호)

```typescript
// sim-canvas.tsx (변경 후 — focus/reset 콜백 인자 폐기)
instance.setCameraHandlers(
  // focusOn 콜백: undefined (제거)
  // resetCamera 콜백: undefined (제거)
  (radius: number) => {
    camera.radius = radius;
  }, // setCameraRadius 만 유지
);

// subscribe 분기 (Phase 1 fix 확장 — null 분기 의도 명확화)
unsubEngine = useSimStore.subscribe((state, prev) => {
  // ... 기존 physicsEngine / massMultipliers 분기 ...
  if (state.selectedBodyId !== prev.selectedBodyId) {
    if (state.selectedBodyId) {
      const mesh = solar.meshes.get(state.selectedBodyId);
      if (mesh) {
        solar.setFocusOrigin(state.selectedBodyId);
        controller.focusOn({ mesh });
      }
    } else {
      // #335 — id=null 시 focus 해제 + 카메라 reset (단일 경로).
      // info-panel close 버튼 등 미래 진입점도 동일 의도 (focus 해제 = 카메라 reset).
      solar.clearFocus();
      controller.reset(35);
    }
  }
});
```

`simulation-core.ts` 의 `case 'focusOn'` / `case 'resetCamera'` 는 `#focusOnHandler` / `#resetCameraHandler` 가 null 이어도 emit 만 정상 동작 (`?.()` optional chaining). 핸들러 미등록 = scene 호출 없음 + event emit 만 → store 가 변화 → subscribe 가 scene 호출. **scene 책임이 subscribe 한 곳**.

| 축                     | 평가                                                                                                                                                                                         |
| ---------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **회귀 위험**          | 낮음 — Phase 1 fix 가 이미 해당 분기를 검증 (회귀 가드 `p329-qa-focus-lod-guard.mjs` 차단 효과 유지). setCameraHandlers focus/reset 콜백 폐기는 동일 함수 호출의 위치 이동이라 동작 변화 0   |
| **구현 비용**          | 낮음 — 약 -25 라인 / +5 라인 (sim-canvas.tsx). simulation-core.ts 의 `setCameraHandlers` 시그니처를 `(setRadius?)` 로 단순화 가능                                                            |
| **추적성**             | 높음 — 단일 진실원. 향후 회귀 디버깅 시 "scene focus 가 왜 안 바뀌었나" → subscribe 분기 한 곳만 점검                                                                                        |
| **미래 확장 (R2~R10)** | 높음 — 새 body 추가는 데이터 (`solar-system.json`) 만. 본 sync 경로는 `selectedBodyId` 가 어떤 id 이든 `solar.meshes.get(id)` 로 일반화 처리 → **코드 변경 0** Concrete Prediction 박제 가능 |
| **R2~R10 호환성**      | 호환 — body 가 아닌 object (예: 위성 / 소행성) 도 `solar.meshes.get(id)` 가 mesh 반환하면 동일 경로                                                                                          |

#### 후보 B — subscribe 분기에 "직전 호출과 동일하면 skip" 가드 (임시)

```typescript
const lastHandledFocusBodyIdRef = useRef<string | null>(null);
if (
  state.selectedBodyId !== prev.selectedBodyId &&
  state.selectedBodyId !== lastHandledFocusBodyIdRef.current
) {
  // ... 기존 sync ...
  lastHandledFocusBodyIdRef.current = state.selectedBodyId;
}
```

| 축                | 평가                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| **회귀 위험**     | 낮음 — 보존적 변경                                                                             |
| **구현 비용**     | 매우 낮음 — +3 라인                                                                            |
| **추적성**        | 낮음 — **단일 진실원 미확보**. 두 경로 잔존. 추후 디버깅 시 "어느 경로가 트리거했나" 추적 비용 |
| **미래 확장**     | 중간 — 새 진입점 추가 시마다 이중 호출 의식 + skip 가드 의존                                   |
| **R2~R10 호환성** | 호환                                                                                           |

후보 B 는 임시 방편으로 기록 — 본 결정에서 채택 안 함.

#### 후보 C — `setCameraHandlers` 유지 + subscribe 분기 제거 (역방향 통합)

`subscribe` 분기 (Phase 1 fix `acfcb74`) 를 제거하고 `setCameraHandlers` 콜백만 진실원으로. URL parser / programmatic API 도 모두 `sendCommand({ type: 'focusOn' })` 경유 강제.

| 축            | 평가                                                                                                                                                                                                                           |
| ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **회귀 위험** | **높음** — Phase 1 fix 가 차단한 회귀가 부활. URL `?focus=sun` 진입 시 `sendCommand` 가 scene 초기화 전 호출되면 핸들러 null → scene 호출 누락 (sim-canvas.tsx:399-407 의 마운트 직후 1회 sync 가 보강하지만 timing 가정 누적) |
| **구현 비용** | 낮음 — Phase 1 fix 분기 -10 라인                                                                                                                                                                                               |
| **추적성**    | 낮음 — `sendCommand` 비-경유 경로 (예: 향후 React Query / 외부 lib 가 직접 store 수정) 시 scene drift 위험                                                                                                                     |
| **미래 확장** | 낮음 — programmatic API 가 store 우회 못 함 (`setSelectedBody` 호출만으로 카메라 sync 안 됨)                                                                                                                                   |

후보 C 는 Phase 1 fix 의 직접적인 회귀 — **채택 불가**.

#### 후보 D — sim-canvas 외부 (예: store middleware 또는 별도 use\* hook) 으로 sync 책임 추출

```typescript
// useSelectedBodySync.ts (신규 hook)
export function useSelectedBodySync(solar, controller) {
  useEffect(() => {
    return useSimStore.subscribe((state, prev) => {
      /* sync */
    });
  }, [solar, controller]);
}
```

| 축                | 평가                                                                                           |
| ----------------- | ---------------------------------------------------------------------------------------------- |
| **회귀 위험**     | 중간 — hook lifecycle 가 sim-canvas 의 useEffect lifecycle 와 어긋나면 deps 누락 위험          |
| **구현 비용**     | 중간 — 신규 파일 + 테스트                                                                      |
| **추적성**        | 높음 (분리 명확) ↔ 낮음 (분산) — 양면                                                          |
| **미래 확장**     | 중간 — sim-canvas 내부에서 다른 sync (massMultipliers / physicsEngine) 와 분리되어 일관성 손실 |
| **R2~R10 호환성** | 호환                                                                                           |

후보 D 는 추상화 비용 대비 이득 불명. **채택 안 함** — sim-canvas useEffect 의 기존 subscribe 와 결합도 유지가 단순.

### 축 2 — `setSelectedBody(null)` else 분기 처리 (#335)

#### 후보 A (#335 본문) — else 분기 자체 제거 + setCameraHandlers.reset 가 단일 책임

후보 1A 채택 시 `setCameraHandlers.reset` 콜백 자체가 폐기되므로 본 후보는 **자동 무효** (setCameraHandlers 의 reset 콜백이 사라지므로 "그곳이 단일 책임" 이 성립 안 함).

#### 후보 B (#335 본문) — 주석 박제 후 보존 (약한 가드)

후보 1A 와 결합 시: 주석은 "subscribe 가 단일 책임" 이라는 사실을 드러내지만, 후보 1A 가 그 자체로 단일 책임을 강제하므로 별도 주석 박제 비용은 낮으나 가치도 낮음.

#### 후보 C (#335 본문, 선호) — B-1 통합 리팩토링에 흡수

**축 1 후보 A 채택 시 자연 흡수** — null 분기는 subscribe 가 책임 (`solar.clearFocus()` + `controller.reset(35)`). 의도 명확화:

- `setSelectedBody(null)` = "현재 focus 해제" → 카메라 reset(35) 로 free-fly 복귀가 정상 의도
- 미래 info-panel close 버튼이 추가될 때 카메라 점프가 의도와 다르면 (예: "정보만 닫고 현재 줌 유지") 별도 close action (`closeInfoPanel`) 분리 + subscribe 영향 없음
- 현재 R1 범위에서는 명시적 close 핸들러 부재 → 카메라 reset 의도 = 충분 안전

| 축            | 평가                                                                                               |
| ------------- | -------------------------------------------------------------------------------------------------- |
| **회귀 위험** | 낮음 — 현재 동작 (`clearFocus + reset(35)`) 보존                                                   |
| **구현 비용** | 0 — 축 1 후보 A 의 자연 산출                                                                       |
| **추적성**    | 높음 — 단일 진실원                                                                                 |
| **미래 확장** | 명확 — info-panel close 가 카메라 점프와 직교해야 한다면 close action 분리로 자연 해결 (별도 이슈) |

### 축 3 — 마운트 직후 1회 초기 sync (sim-canvas.tsx:398-407)

URL `?focus=sun` 진입 시 url-sync.tsx:78 의 `setSelectedBody(urlFocus)` 가 sim-canvas mount 시점 store snapshot 으로 박제 → subscribe 는 mount **후의** 변화만 감지 → 첫 진입 시 scene focus 호출 누락. PR #332 implementer 가 명시적 1회 sync 블록 추가.

#### 후보 A — 현재 1회 초기 sync 블록 그대로 유지

```typescript
// 현재 코드 (sim-canvas.tsx:398-407) 그대로
const initialSelected = useSimStore.getState().selectedBodyId;
if (initialSelected) {
  const mesh = solar.meshes.get(initialSelected);
  if (mesh) {
    solar.setFocusOrigin(initialSelected);
    controller.focusOn({ mesh });
  }
}
```

| 축     | 평가                                                                                    |
| ------ | --------------------------------------------------------------------------------------- |
| 단순성 | 명시적 — "마운트 직후 snapshot 1회 적용" 의도 코드로 직접 표현                          |
| 일관성 | 약점 — subscribe 분기와 동일 식 중복 (DRY 위배). 향후 sync 식 변경 시 두 곳 동기화 필요 |

#### 후보 B (선호) — 1회 초기 sync 블록을 별도 helper 로 추출 + subscribe 분기와 식 공유

```typescript
const syncFocusToScene = (id: string | null) => {
  if (id) {
    const mesh = solar.meshes.get(id);
    if (mesh) {
      solar.setFocusOrigin(id);
      controller.focusOn({ mesh });
    }
  } else {
    solar.clearFocus();
    controller.reset(35);
  }
};

// 마운트 직후 1회
syncFocusToScene(useSimStore.getState().selectedBodyId);

// subscribe 분기
unsubEngine = useSimStore.subscribe((state, prev) => {
  // ... 기존 ...
  if (state.selectedBodyId !== prev.selectedBodyId) {
    syncFocusToScene(state.selectedBodyId);
  }
});
```

| 축        | 평가                               |
| --------- | ---------------------------------- |
| 단순성    | 약간 우회 (helper 정의) ↔ DRY 향상 |
| 일관성    | 강 — 식 1개                        |
| 회귀 위험 | 낮음 — 동일 식 추출                |
| 미래 확장 | 강 — 식 변경 시 helper 1곳         |

축 3 후보 B 채택 — 축 1 후보 A 와 결합 시 자연.

---

## 결정

### 결정 1 — store-scene sync 단일 경로 통합 (축 1 후보 A)

`setCameraHandlers` 의 focus / resetCamera 콜백 인자 **폐기**. `setCameraRadius` 만 유지. `useSimStore.subscribe` 의 `selectedBodyId` 변화 감지 분기가 scene focus / camera 동기화 단일 책임.

**이유**:

- 단일 진실원 — URL parser / 클릭 / programmatic API 모두 동일 경로
- Phase 1 fix `acfcb74` 의 분기가 이미 회귀 가드 검증 완료 — 폐기 위험 0
- "신규 함수 ≠ 신규 구현" 교훈 정합 — 신규 추상화 0, 기존 함수 호출 위치 이동만
- 미래 R2~R10 시 코드 변경 0 (Concrete Prediction)

### 결정 2 — `simulation-core.ts` API 단순화 + 리네이밍

`setCameraHandlers` 시그니처 변경 + **리네이밍 의무** (Gemini 교차검증 1순위 권고 수용 — `### 교차검증 반영 사항` §이견 수용 참조):

```typescript
// 변경 전
setCameraHandlers(
  focusOn: (bodyId: string) => void,
  resetCamera: () => void,
  setRadius?: (radius: number) => void,
): void

// 변경 후 — 리네이밍 + 시그니처 단순화
setCameraRadiusHandler(setRadius: (radius: number) => void): void
```

리네이밍 사유 (결합 간과 △ 방어책): 향후 작업자가 함수명만 봐도 책임 인지 (radius 만 처리, focus/reset 은 subscribe 책임). `setCameraHandlers` 라는 모호한 이름은 향후 "다시 focus 콜백을 추가" 하려는 회귀 유혹을 방어하지 못함.

`#focusOnHandler` / `#resetCameraHandler` 필드 + `case 'focusOn'` 의 `#focusOnHandler?.(cmd.bodyId)` 호출 + `case 'resetCamera'` 의 `#resetCameraHandler?.()` 호출 모두 **삭제**. event emit 은 그대로 유지 (`bodySelected` event → store sync 경로 보존).

### 결정 3 — `setSelectedBody(null)` 분기 의도 명확화 (축 2 후보 C)

`subscribe` 분기 else 가 `solar.clearFocus()` + `controller.reset(35)` 호출 — 의도 = **"focus 해제 = 카메라 reset"** 박제. 미래 info-panel close 가 카메라 점프와 직교해야 한다면 별도 action 분리 (별도 이슈, 본 ADR §재검토 트리거 #2).

### 결정 4 — `syncFocusToScene` helper 추출 (축 3 후보 B)

마운트 직후 1회 sync 블록과 subscribe 분기 식 통합. helper 단일 함수로 추출하여 DRY + 미래 식 변경 시 1곳 수정.

### 결정 5 — 비-범위 보호 가드

다음은 본 ADR 범위 외 — developer 가 "단일 경로 통합" 명목으로 손대지 않음:

- `case 'focusOn'` / `case 'resetCamera'` 의 `bodySelected` event emit — 그대로 유지 (core-adapter → store sync 경로 보존)
- `core-adapter.ts:26-28` 의 `onBodySelected` → `store.setSelectedBody(id)` 호출 — 그대로
- url-sync.tsx:77-78 의 `sendCommand({ type: 'focusOn' })` + `setSelectedBody(urlFocus)` 양방향 호출 — `sendCommand` 가 store sync 트리거하므로 `setSelectedBody(urlFocus)` 는 결정 1 적용 후에도 idempotent (이미 동일 id 면 subscribe no-op). 단순화 가능하지만 본 ADR 범위 외 — 별도 이슈 분리 가능
- `solar.setFocusOrigin` / `solar.clearFocus` / `controller.focusOn` / `controller.reset` 본체 — 무수정
- R1 회귀 가드 (`p329-qa-focus-lod-guard.mjs`) — 통과 의무 (DoD)

### 결정 6 — 회귀 가드 테스트 추가 의무 (단위 또는 통합 — ROI 우선)

#333 Phase 2 ADR 의 "Gemini 1순위 권고" (단위 테스트 vs 주석 계약) 패턴 따름. developer PR 에서 회귀 가드 테스트 추가:

- **테스트 1 — 이중 호출 방지**: `controller.focusOn` (또는 `Animation.CreateAndStartAnimation`) 을 spy 로 감싸고 `sendCommand({ type: 'focusOn', bodyId: 'sun' })` 1회 호출. spy call count = 1 assert (현재는 2 — 회복귀 시 즉시 실패)
- **테스트 2 — null 분기 단일 호출**: `controller.reset` spy 로 `sendCommand({ type: 'resetCamera' })` 1회 호출. spy call count = 1 assert (현재는 2)
- **테스트 3 — URL 진입 마운트 1회 sync**: `?focus=sun` 진입 시 mount 직후 첫 frame 에 `solar.setFocusOrigin` 1회 호출 + 그 외 시점 추가 호출 0 assert

**구현 형태 — ROI 우선 선택** (Gemini 교차검증 2순위 권고 수용):

1. **단위 테스트 (1순위 시도)**: `apps/web/src/components/sim-canvas.test.tsx` (신규). Babylon scene + camera + solar 를 `jest.mock` / `vi.mock` 으로 차단. mock 비용이 ROI 5문 (CLAUDE.md "테스트 ROI 5문 체크") 통과 시 채택
2. **통합 테스트 (2순위 시도)**: `testing-library/react` + `zustand` 실제 store + Babylon mock 일부만. `sendCommand` → store → subscribe 의 **호출 횟수 검증** 만 하고 Babylon 본체는 spy 로만 차단. mock 비용 1순위 미통과 시 권고
3. **E2E 확장 (3순위 / 보완)**: 기존 `apps/web/scripts/p329-qa-focus-lod-guard.mjs` 에 `Animation.CreateAndStartAnimation` 호출 카운트 검증 hook 추가. Playwright `page.evaluate` 로 카운터 노출. 시각적 회귀는 4영역 mismatch ≤ 0.5% 가 차단하지만 호출 수 회귀는 별도 가드 필요

developer 자체 판단으로 1~3 중 1개 이상 선택. 단, **테스트 1 (이중 호출 방지)** 은 본 ADR 의 핵심 회귀 가드이므로 어떤 형태로든 추가 의무.

---

## 결과·재검토 조건

### Concrete Prediction (R2~R10 코드 변경 0 박제)

본 결정 1 채택 시 R2 (수성), R3 (금성) ... R10 (해왕성+) 추가 시 **다음 파일 변경 0 라인**:

- `apps/web/src/components/sim-canvas.tsx` (subscribe 분기) — `solar.meshes.get(state.selectedBodyId)` 가 어떤 id 이든 mesh 반환하면 일반화 처리. 신규 body 식별자 추가 = 0 라인
- `packages/core/src/engine/simulation-core.ts` (`case 'focusOn'`) — bodyId 가 string 인 한 일반화. 0 라인
- `apps/web/src/core/core-adapter.ts` (`onBodySelected`) — 0 라인

R2 PR 시 `git diff --stat` 으로 위 3 파일 변경 0 실증 — 본 ADR §결과·재검토 조건 박제 의무.

신규 진입점 추가 시 (예: 모바일 swipe gesture) 도 동일 — `sendCommand({ type: 'focusOn' })` 또는 `setSelectedBody(id)` 둘 중 하나 호출하면 단일 sync 경로가 자연 처리.

### 회귀 가드

- `pnpm verify:r1-guard` — 4 영역 mismatch ≤ 0.5% 유지 (PR #332 회귀 가드)
- `apps/web/scripts/p329-qa-focus-lod-guard.mjs` — `?focus=sun` 정상 sphere 시그니처 + LOD high 진입 (PR #332 회귀 가드)
- `apps/web/src/components/sim-canvas.test.tsx` — 결정 6 단위 테스트 (이중 호출 방지)
- `pnpm test --filter @astro-simulator/web` — 본 ADR 단위 테스트 통과
- 기존 테스트 회귀 0

### 재검토 트리거

다음 조건 중 하나면 본 ADR 재검토 (Amendment 또는 신 ADR):

1. **info-panel close 버튼 추가** — `setSelectedBody(null)` 호출이 카메라 점프와 직교해야 한다면 별도 close action 분리 (`closeInfoPanel` action 신설). 본 ADR §결정 3 의 "focus 해제 = 카메라 reset" 의도 가정 무효화
2. **programmatic API 다중 진입점** — 외부 lib (예: React Query) 가 store 직접 수정 + sync 비-기대 경로 발견 시 단일 sync 경로 보강 (예: middleware)
3. **R2~R10 진행 중 Concrete Prediction 실패** — 본 ADR §결과 의 "코드 변경 0" 예측이 어떤 R-Phase 에서 깨지면 본 ADR 의 추상화가 부족한 신호. amendment 박제
4. **Babylon Animation API 변경** — `Animation.CreateAndStartAnimation` 의 동일 target 즉시 재호출 동작 변경 시 본 ADR §배경 의 "frame 1 jitter 잠재" 분석 무효화 가능성. 재검토
5. **`controller.reset(35)` 인자 변경 (예: 카메라 reset 거리 동적화)** — 인자 동적화 시 결정 4 helper 시그니처 확장 검토

### 위험 / 미해결

- **subscribe 의 다른 분기 (physicsEngine / massMultipliers) 와의 의존 순서** — selectedBodyId sync 가 physicsEngine 변경 분기 후 실행되어야 하는 경우 race 가능 (physics 가 mesh 를 재생성하는 등). 현재는 두 분기가 직교 (mesh 변경 vs focus 전환) 라 안전하지만 R2+ 에서 의존 발생 시 분기 순서 명시 박제 필요
- **store middleware 도입 시** — 후속 `sync to scene` middleware 패턴 도입 시 본 ADR 의 subscribe 분기와 책임 중복 가능. 그 시점에 통합 또는 한쪽 폐기 결정
- **단위 테스트 mock 비용** — Babylon scene + camera + solar 전체 mock 이 부피 큼. 결정 6 의 단위 테스트가 ROI 5문 (CLAUDE.md "테스트 ROI 5문 체크") 통과 필수. 통과 못 하면 주석 계약 + 수동 회귀 가드 (`p329-qa-focus-lod-guard.mjs`) 로 대체. developer 자체 판단

### Phase 분리 — 본 ADR 은 단일 PR

CLAUDE.md "Phase 분리 릴리스 리듬" 적용 조건 3가지 중:

- **backward-compat**: ✓ — 본 ADR 결정 1 적용 후에도 기존 클릭 / URL / programmatic 진입점 모두 동작 (콜백 폐기는 내부 변경, 외부 API `sendCommand` 그대로)
- **각 Phase 가 완결 Behavior Change 집합**: 본 ADR 은 단일 결정 (이중 호출 → 단일 호출). Phase 분리 가치 낮음
- **사용자 점진 릴리스 동의**: N/A (단일 PR)

→ **단일 PR + 단일 릴리스** (PATCH 분류 — 사용자 가시 행동 변화 없음, 내부 구조 정리). 단, MINOR 분류 검토:

- 본 변경이 `simulation-core.ts` 의 `setCameraHandlers` 시그니처 변경을 포함 → **외부 API breaking** 가능성. 단, `simulation-core` 의 `setCameraHandlers` 가 내부 (sim-canvas) 외부에서 호출되는 곳 없음 (grep 으로 확인) → MINOR (행동 변화 + 내부 API 시그니처 변경) 가 적합. developer 가 PR 본문에서 결정 박제

---

## 교차검증 반영 사항

본 ADR 박제 직후 cross-validate 1회 (Gemini 2.5 Pro, 2026-04-25). Claude 자체 편향 4종 셀프 체크:

- 낙관적 일정 ✓ — 단일 PR + 단순 변경 (subscribe 분기 +5 / setCameraHandlers -25 라인). 일정 추가 없음
- 결합 간과 △ — `setCameraHandlers.focus/reset` 폐기와 `case 'focusOn'/'resetCamera'` 의 `bodySelected` event emit 보존이 결합. cross-validate 호출 프롬프트에 명시 질문 삽입
- 폐기 프레이밍 ✓ — 콜백 폐기 사유 명확 (이중 진실원 결함)
- 순수주의 △ — "단일 진실원 = 더 좋다" 사후 정당화 가능성. 후보 B/C/D 비교 균형 명시 질문 삽입

outcome=applied (exit 0). 로그: `.claude/logs/cross-validate-architecture-20260425-215012.log`

### 합의 — Claude 설계와 일치 + 본 ADR 에 반영

- **결정 1 (subscribe 단일 책임)** — Gemini 가 "이중 호출 문제를 해결하기 위해 `subscribe`를 단일 진실원으로 삼은 후보 A 채택은 아키텍처를 단순화하고 예측 가능성을 높이는 **최선의 결정**" 으로 강하게 합의. 순수주의 △ 우려 해소
- **결정 2 (`setCameraHandlers` API 단순화)** — Gemini 가 "더 이상 사용되지 않는 콜백 제거는 API 를 명확하고 사용하기 쉽게 만든다" 로 합의
- **결정 3 (`setSelectedBody(null)` 의도 명확화)** — Gemini 가 "암묵적 동작을 명시적 계약으로 전환" 로 합의
- **결정 4 (`syncFocusToScene` helper 추출)** — Gemini 가 "DRY 향상 + 마운트 시점과 subscribe 시점 통합" 로 합의
- **Concrete Prediction (R2~R10 코드 변경 0)** — Gemini 가 "이 설계가 얼마나 확장성이 뛰어난지 증명하는 강력한 근거" 로 합의

### 이견 수용 — Claude 원안 보강

- **`setCameraHandlers` 리네이밍 (Gemini 1순위 권고)** — Claude 원안 §결정 2 는 시그니처 단순화만 명시 + 리네이밍은 "developer 자체 판단" 으로 위임. Gemini 가 **"`setCameraRadiusHandler` 와 같이 더 명확한 이름으로 변경하는 작업을 이번 PR 에 포함할 것을 강력히 권장"**. **수용** — 결합 간과 △ 셀프 체크 우려 (향후 작업자가 결합 의식 못 함) 의 직접 방어책. Developer 인계에 리네이밍 의무 박제 (의견 → 의무로 격상)

- **단위 테스트 vs 통합 테스트 비중 (Gemini 2순위 권고)** — Claude 원안 §결정 6 은 단위 테스트 의무 + ROI 5문 미통과 시 주석 계약 / 수동 가드 대체. Gemini 가 **"Babylon mock 비용 큼 → 통합 테스트 (testing-library/react + zustand) 또는 E2E (Playwright / 기존 `p329-qa-focus-lod-guard.mjs` 확장) 가 실용적"** 로 권고. **수용** — Developer 인계에 통합 테스트 우선 옵션 명시 추가 (테스트 ROI 가드 + 단위 테스트 mock 비용 ROI 미통과 시 통합 테스트 또는 E2E 확장이 유효 대체재)

### Claude 재분석으로 기각한 Gemini 제안

없음 — Gemini 의 모든 권고가 Claude 원안과 정합. 추가 후보의 미인지 강점 발견 안 됨 (순수주의 △ 우려 완전 해소).

### 고유 발견 (후속 분리)

없음 — Gemini 의 모든 제안이 본 ADR 범위 내 처리 가능. 스프린트 비목표 (R2~R10 / Babylon API 변경 / programmatic API 다중 진입점) 위배 항목 없음.

### Gemini 추가 강조 (낮은 우선순위, 본 ADR 본문에 이미 반영)

- **"성능 최적화가 아닌 구조 개선과 버그 수정"** — Gemini 가 본 작업 주된 목표 명확화 권고. Claude 원안 §배경 의 "frame 1 jitter 잠재" 표현이 이미 성능 주장 회피 + 구조 개선 의도 명시. ADR 본문 수정 없음 (이미 정합)

---

## Developer 인계

**시작 지점**:

1. `packages/core/src/engine/simulation-core.ts`:
   - `setCameraHandlers` → **`setCameraRadiusHandler` 로 리네이밍** (Gemini 교차검증 1순위 권고 수용 — §결정 2)
   - 시그니처: `setCameraRadiusHandler(setRadius: (radius: number) => void): void`
   - `#focusOnHandler` / `#resetCameraHandler` 필드 + 호출 라인 (`case 'focusOn'` / `case 'resetCamera'` 의 `?.()` 호출) **삭제**
   - **`bodySelected` event emit 은 보존** (결정 5 — store sync 경로 의존)
2. `apps/web/src/components/sim-canvas.tsx`:
   - `setCameraHandlers` 호출 (현재 line 373-392) → `setCameraRadiusHandler` 호출로 변경 + `setRadius` 콜백만 전달
   - `useSimStore.subscribe` 분기 (line 340-372) 에서 `selectedBodyId` 분기를 helper `syncFocusToScene` 로 추출 (§결정 4)
   - 마운트 직후 1회 sync 블록 (line 398-407) 도 helper 호출로 통합 (§축 3 후보 B)
3. 회귀 가드 테스트 (§결정 6):
   - **테스트 위치 — ROI 우선 선택**: 단위 테스트 (`apps/web/src/components/sim-canvas.test.tsx` 신규) → 통합 테스트 (`testing-library/react` + zustand) → E2E 확장 (`p329-qa-focus-lod-guard.mjs` 에 호출 카운트 hook) 순서로 시도. 1~3 중 1개 이상 선택
   - **테스트 1 (이중 호출 방지)** 은 어떤 형태로든 의무 — 본 ADR 핵심 회귀 가드
   - mock 비용 ROI 5문 (CLAUDE.md "테스트 ROI 5문 체크") 통과 못 하면 통합 테스트 또는 E2E 확장 우선 선택
4. CHANGELOG `### Behavior Changes` 박제 (§결정 1~5):
   - "store-scene 동기화 단일 경로 통합 — `setCameraHandlers` 폐기 + `setCameraRadiusHandler` 도입"
   - "이중 `controller.focusOn` / `controller.reset` 호출 해소 (각 1회)"
   - "`setSelectedBody(null)` 의도 = 'focus 해제 + 카메라 reset' 명시 박제"
   - 분류: **MINOR** (외부 API breaking 가능성 + 행동 변화) — 단, `simulation-core` 의 `setCameraHandlers` 가 sim-canvas 외부 호출처 없음 (PR 에서 grep 재확인 의무). 호출처 0 면 PATCH 분류 가능

**참조 문서**:

- 본 ADR (단일 경로 통합)
- [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) (R1 시각화 + Phase 1 fix `acfcb74` 분기 도입)
- [`20260424-p11-b-lod-design.md`](20260424-p11-b-lod-design.md) (LOD 분기 — focus 분기 사용처)
- [`20260422-floating-origin.md`](20260422-floating-origin.md) §3 (`setFocusOrigin` 단일 책임)
- PR #332 코멘트 reviewer §B-1 / §B-2 (회귀 가드 도입 배경)

**비-범위** (절대 손대지 말 것):

- `case 'focusOn'` / `case 'resetCamera'` 의 `bodySelected` event emit — 보존
- `core-adapter.ts:26-28` `onBodySelected` → `store.setSelectedBody(id)` — 보존
- `url-sync.tsx:77-78` 의 `sendCommand` + `setSelectedBody` 양방향 호출 — 본 ADR 범위 외 (별도 이슈 분리 가능)
- `solar.setFocusOrigin` / `solar.clearFocus` / `controller.focusOn` / `controller.reset` 본체 — 무수정
- `useSimStore.subscribe` 의 다른 분기 (`physicsEngine` / `massMultipliers`) — 무수정
- R1 시각화 ADR `20260425-r1-sun-visualization.md` 의 §결정 1~5 — 무수정 (본 ADR 은 §결정 4 → Phase 1 fix 의 일반화이며 시각화 결정 자체는 무관)
- R2~R10 (mercury / venus / ...) — 본 ADR 의 Concrete Prediction 검증 대상이지만 코드 변경 0 박제 의무 외 추가 작업 없음
