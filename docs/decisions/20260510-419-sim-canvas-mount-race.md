# ADR: SimCommandProvider mount 순서 정합화 — useSimCommand race condition SSoT 해소

- **상태**: Accepted
- **날짜**: 2026-05-10
- **결정자**: architect (#419 PM 위임, 2026-05-09 라운드 1+2 합의 완료)
- **관련**: #419 (본 이슈), #415 (부모 — `20260504-415-url-sync-guard.md` §재검토 조건 1), #329 (R1 sun visualization), #361 (R2 mercury), #369 (R3 venus), `20260425-r1-store-scene-sync-unification.md` (event 단일 진실원)
- **교훈 적용**: "주석 계약 vs 구현 drift" (volt [#49](https://github.com/coseo12/volt/issues/49) — `useSimCommand` no-op fallback 의 historical 의도가 race fallback 으로 drift 한 사례 — 본 ADR 이 해소), "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — 정적 리뷰 (#414 reviewer 권고 3) 가 잠복 race 식별), "단계 게이트" (volt [#77](https://github.com/coseo12/volt/issues/77) — architect 단계가 race 의 본질 해결 박제), "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21) — early return 1줄 + 기존 SimCommandProvider 재사용, 신규 헬퍼 박제 0)

---

## 배경

부모 ADR `docs/decisions/20260504-415-url-sync-guard.md` §재검토 조건 1 + cross-validate Gemini 고유 발견 #2 후속 분리 (#415 →[issues] #419).

### 부모 ADR §재검토 조건 1 의 재현

부모 ADR §결정 1 의 url-sync.tsx 가드 분기는 `sendCommand({type:'focusOn'})` (line 103) + `setSelectedBody(urlFocus)` (line 104) 둘 다 보존. line 104 의 진짜 존재 이유는 race condition 보호 fallback (부모 ADR §배경 line 50-58 분석):

- `useSimCommand()` (sim-context.tsx:31-34) 는 core null 시 `() => undefined` no-op fallback
- url-sync 는 sim-canvas children 위치 (sim-canvas.tsx:511 — `<SimCommandProvider core={core}>{children}</SimCommandProvider>`)
- sim-canvas 가 core 인스턴스를 비동기 useEffect 에서 생성 (sim-canvas.tsx:31-501) — `instance = new SimulationCore(canvas)` 는 useEffect 본문 line 121, `setCore(instance)` line 125
- url-sync 의 초기 1회 useEffect (initialized.current 가드, line 62) 발화 시점에 `core === null` 가능 → `sendCommand` no-op → emit 0 → store 미반영 → URL `?focus=sun` 진입했는데 selectedBodyId null 회귀 (#329 R1 회귀 잠복)
- 부모 ADR §결정 1 의 line 104 `setSelectedBody(urlFocus)` 가 이 race 의 fallback 으로 작동 중

### 문제 재진술

1. **line 104 의 race fallback 은 부수 효과 SSoT 사용** — sim-context no-op 이 timing gap 을 만들고, url-sync 의 store 직접 호출이 그 gap 을 메움. 부모 ADR §결정 3 (event 단일 진실원 — `bodySelected` emit → core-adapter → setSelectedBody) 정신과 충돌
2. **외부 진입점 신설 마다 race 인식 의무** — 부모 ADR §결정 5 (Amendment 6번째 항목) 의 외부 진입점 가드 박제는 race fallback 까지 매번 인식해야 하는 비용 — 새 useEffect 진입자가 timing gap 을 매번 의식
3. **silent skew 위험** — race 통과 시 sendCommand + setSelectedBody 둘 다 성공, race 발현 시 setSelectedBody 만 성공. emit 경로 누락 시 `core-adapter` 의 다른 부수 작업 (focus subscribe / scene focusOrigin sync 등) 도 같이 누락 — 결국 store 만 업데이트되고 scene 미반영 잠복 가능

### cross-validate (#415 ADR §교차검증) 고유 발견 #2

> `useSimCommand` race condition 자체 기술 부채 (Gemini §2 권고): 본 ADR §재검토 조건 1 에 이미 박제 — 본 sprint 의 line 104 fallback 보존은 "race 의 임시 보호"이고 근본 해결은 별도 sprint. 우선순위: medium.

본 ADR 이 그 별도 sprint 를 박제.

---

## 정적 조사 결과

### 영향 모듈 / 파일 (실측 검증)

- **`apps/web/src/core/sim-context.tsx`** (35줄) — `SimCommandProvider` (line 17-28) + `useSimCommand` (line 31-34, no-op fallback)
- **`apps/web/src/core/url-sync.tsx`** — line 79-106 의 `if (urlFocus) {...}` 분기 + line 104 `setSelectedBody(urlFocus)` (race fallback 제거 대상)
- **`apps/web/src/components/sim-canvas.tsx`** — line 22 `SimCanvas` 컴포넌트 + line 29 `useState<SimulationCore | null>(null)` + line 121-125 비동기 core 생성 + setCore + line 511 `<SimCommandProvider core={core}>{children}</SimCommandProvider>`
- **`useSimCommand` 호출자 매트릭스 (DoD-7 회귀 매트릭스 영향 범위)** — 7곳:
  - `apps/web/src/core/url-sync.tsx:58` (본 ADR 직접 영향 — line 104 race fallback 제거)
  - `apps/web/src/components/layout/focus-quick-buttons.tsx:37` (사용자 클릭 — mount 후 트리거. core null 영향 0)
  - `apps/web/src/components/layout/mode-switcher.tsx:30` (사용자 클릭)
  - `apps/web/src/components/layout/time-controls.tsx:29` (사용자 클릭)
  - `apps/web/src/components/layout/scale-control.tsx:19` (사용자 클릭)
  - `apps/web/src/components/layout/date-time-picker.tsx:12` (사용자 클릭)
  - `apps/web/src/components/panels/celestial-tree.tsx:31` (사용자 클릭)
  - `apps/web/src/components/panels/scenario-presets.tsx:78` (사용자 클릭)
- **`SimCommandProvider` 사용 측 단일점**: `apps/web/src/components/sim-canvas.tsx:511` 만. 본 ADR 결정의 변경 면적은 sim-canvas + sim-context 2 파일 + (선택) url-sync 1줄 (line 104).

### 라운드 1 가설 검증 — race condition 실재 확인

코드 흐름 정적 추적:
1. `<SimCanvas>` mount → `<canvas ref={canvasRef} />` + `<SimCommandProvider core={core}>{children}</SimCommandProvider>` 렌더 (children = UrlSync + SidePanels 등). 이 시점 `core === null`
2. children mount → UrlSync 의 `useSimCommand()` 호출 → `ctx?.command ?? (() => undefined)` 평가 → ctx 는 SimCommandProvider 의 api object (`{ command: (cmd) => core?.command(cmd) }`) — ctx 자체는 non-null 이지만 **`core` 가 null 이므로 `core?.command(cmd)` 가 no-op**
3. UrlSync 의 useEffect 발화 → `sendCommand({type:'focusOn', bodyId: 'sun'})` 호출 → 위 step 2 의 closure 가 실행 → `core?.command(cmd)` no-op → emit 0
4. 한 tick 뒤 SimCanvas useEffect 발화 → `instance = new SimulationCore(canvas)` + `setCore(instance)` → 다음 렌더에 SimCommandProvider 재평가 → 새 api object (`{ command: (cmd) => instance.command(cmd) }`) → 그러나 이미 UrlSync useEffect 는 1회 발화 끝남

**결론: race 실재**. 부모 ADR §재검토 조건 1 가설 정확.

### 부수 발견

- **sim-context.tsx 의 useSimCommand 가 매 렌더 새 closure 생성** (line 33 `(() => undefined)`) — re-render 시 referential equality 깨짐. 그러나 url-sync 의 useEffect 가 `[]` 빈 배열 deps 라 영향 없음. **본 ADR 비-범위** — 다른 호출자가 sendCommand 를 deps 에 넣을 경우 re-render loop 위험 있으나 모두 클릭 핸들러 안에서 호출되어 deps 미사용. 잠복 위험만 존재.
- **commandContext value object 도 매 렌더 새 객체** (line 24-26 `const api: SimCommandApi = {...}`) — 위와 동일 영향. 본 ADR 비-범위.

---

## 후보 비교

축은 5개로 평가: (1) 부수 영향 / (2) 구현 복잡도 + 변경 범위 / (3) 회귀 위험 (#329 R1 보호) / (4) React 패턴 자연스러움 / (5) 테스트 가능성.

### 후보

| 후보 | 설명 |
|------|------|
| **A1-S. SimCommandProvider Suspense** | core null 시 Suspense fallback (또는 throw promise) — children 마운트 자체 차단. core ready 후 fallback 해제 |
| **A1-E. SimCommandProvider early return** | core null 시 children 렌더 보류 (`if (!core) return <>{children 미렌더}</>` 또는 `return null`) — 단순 conditional render. core ready 후 children 첫 렌더 |
| **A2. core ready signal context 노출** | `SimCommandContext` 가 `{ command, ready: boolean }` 또는 별도 `useSimCommandReady()` 훅 노출. 호출자 7곳이 ready 체크 후 sendCommand 호출 |
| **B. sim-context fallback 명시 throw** | `useSimCommand()` 가 core null 시 dev throw + production no-op. silent fallback 제거. **부모 ADR §후보 B 와 동일** |
| **C. url-sync 가 core 명시 대기** | `useContext(SimCommandContext)` 에서 `core` 자체 노출 + url-sync 가 `useEffect(() => { if (!core) return; ... }, [core])`. **부모 ADR §후보 C 와 동일** |

라운드 1 PM 합의에서 B / C 기각 (race 자체 미해결). 본 ADR 은 **A1-S vs A1-E vs A2** 의 최종 선택.

### 축 1 — 부수 영향 (다른 children mount 시점 지연 정도)

| 후보 | 평가 | 점수 |
|------|------|------|
| **A1-S** | Suspense fallback 첫 프레임 노출 — children (UrlSync + SidePanels + InfoPanel + 모든 UI) 전체 마운트 지연. SidePanels 의 비-core 의존 UI 도 fallback 처리 중. 첫 프레임 사용자 인지 fallback 화면 노출 가능 (CRITICAL #3 UI 작업 검증 영향) | 2/5 |
| **A1-E** | children 미렌더 — A1-S 와 동일하게 SidePanels 도 지연. 단, `null` 반환은 fallback UI 부재 — 빈 화면 짧게 노출 (canvas 만). core ready 후 children mount → useEffect 발화 1회 (race 부재) | 3/5 |
| **A2** | children 즉시 마운트, useEffect 도 즉시 실행 — UI fallback 없음. 단 useSimCommand 호출자 7곳이 ready 체크 분기 추가 — 분기 누락 시 race 재발 위험 | 4/5 |

**보강**: A1-S/A1-E 둘 다 "children 마운트 지연" 자체는 동일 (수십 ms). canvas 자체는 SimCanvas 직속 자식이라 지연 0 — 시각적 영향은 SidePanels / overlay UI 만. core 초기화 시간이 ~100ms 이내라 사용자 체감 영향 미미. **단, A1-S 의 Suspense fallback UI** 는 명시적으로 정의해야 함 — 미정의 시 빈 fallback 표시.

### 축 2 — 구현 복잡도 + 변경 범위

| 후보 | 변경 파일 | 변경 줄 | 점수 |
|------|---------|---------|------|
| **A1-S** | sim-context.tsx (Suspense boundary 또는 throw promise 패턴), sim-canvas.tsx (Suspense fallback 컴포넌트 정의), url-sync.tsx (line 104 제거), url-sync.test.tsx (race 단위 테스트) | ~30~50줄 추가 (Suspense fallback UI 디자인 + lazy promise 패턴) + url-sync 1줄 삭제 + 테스트 ~30줄 | 2/5 |
| **A1-E** | sim-context.tsx (`if (!core) return ...` 1줄), url-sync.tsx (line 104 제거), url-sync.test.tsx (race 단위 테스트), sim-context.test.tsx 또는 sim-canvas.test.tsx (children 미렌더 단언) | ~5줄 추가 (early return) + url-sync 1줄 삭제 + 테스트 ~30~50줄 | **5/5** |
| **A2** | sim-context.tsx (API 확장 — ready 추가), url-sync.tsx (line 104 제거 + ready 분기 또는 [core] deps), 호출자 7곳 (focus-quick-buttons / mode-switcher / time-controls / scale-control / date-time-picker / celestial-tree / scenario-presets — ready 체크 분기 추가 또는 sendCommand 가 자동 큐잉), 테스트 갱신 | ~50~100줄 변경 (API 확장 + 호출자 7곳 갱신 + 테스트 갱신) | 2/5 |

**핵심**: A1-E 가 변경 범위 최소 — sim-context 1줄 추가 + url-sync 1줄 삭제 + 단위 테스트.

### 축 3 — 회귀 위험 (R1 #329 보호 강도)

| 후보 | 평가 | 점수 |
|------|------|------|
| **A1-S** | Suspense fallback 후 children mount → useEffect 1회 발화 → core non-null 보장 → sendCommand 정상 → emit → setSelectedBody → R1 sun visualization 진입 | 5/5 |
| **A1-E** | A1-S 와 동일 — children 미렌더 → useEffect 발화 0 → core ready 후 children 첫 mount 에서 useEffect 1회 발화 → sendCommand 정상 | 5/5 |
| **A2** | url-sync 가 `useEffect(() => { if (!core) return; ... initialized.current 처리 ... }, [core])` 으로 변경 — initialized.current 가드 + core deps 조합. core 가 처음 non-null 될 때 useEffect 발화 → sendCommand 정상. 단, 호출자 7곳 갱신 누락 시 다른 진입점에서 race 재발 — 7곳 중 한 곳이라도 ready 미체크 시 silent skew | 3/5 |

**핵심**: A1-S/A1-E 는 **구조적으로 race 차단** (children 자체가 마운트 안 됨). A2 는 **호출자 규율** 의존 — 회귀 강도 다름.

### 축 4 — React 패턴 자연스러움 (React 19 + Next.js 15)

| 후보 | 평가 | 점수 |
|------|------|------|
| **A1-S** | React 19 의 권장 비동기 패턴 (use hook + Suspense) — 그러나 현재 `setCore(instance)` 는 동기 useState 갱신, promise 가 아님. throw promise 변환은 인위적. Next.js 15 RSC 컨텍스트에서 client component 의 Suspense 는 hydration mismatch 위험 (특히 SimCommandProvider 가 sim-canvas 의 자식이라 RSC 직접 영향 적지만, fallback UI 가 server-render 와 client-mount 시점에 다름) | 2/5 |
| **A1-E** | 컨테이너 컴포넌트의 conditional render (`if (!core) return null` 또는 `return <>{null}</>`) — React 의 가장 단순한 패턴. Next.js 15 RSC 영향 0 — `'use client'` boundary 안에서 client state 기반 conditional render 는 React 18 부터 안정 | **5/5** |
| **A2** | Context 가 ready 상태를 노출하는 패턴은 React 자체로는 자연스럽지만, useEffect 의존 배열에 `[core]` 또는 `[ready]` 추가 시 useEffect 재실행 시멘틱 변경 — initialized.current 가드와 함께 사용해야 정확히 1회 보장 | 3/5 |

### 축 5 — 테스트 가능성 (DoD-3 단언 작성 용이성)

| 후보 | DoD-3 단언 패턴 | 점수 |
|------|----------------|------|
| **A1-S** | testing-library 의 Suspense fallback 단언 — `expect(screen.queryByText('loading...')).toBeInTheDocument()` 후 `await waitFor(() => expect(screen.queryByTestId('child')).toBeInTheDocument())`. 단언 2단계 + waitFor 비동기 | 3/5 |
| **A1-E** | `core={null}` 으로 SimCommandProvider 렌더 → children 미렌더 단언 — `expect(screen.queryByTestId('child')).toBeNull()`. 단일 단언 + 동기. `core={mockCore}` 변경 시 children 등장 단언 (RTL `rerender`) | **5/5** |
| **A2** | API 확장 후 `useSimCommand()` mock 의 ready 필드 단언 — 호출자 7곳 각자 단위 테스트 갱신 | 3/5 |

### 종합

| 후보 | 부수 영향 (1) | 변경 범위 (2) | 회귀 위험 (3) | React 자연 (4) | 테스트 (5) | 합계 |
|------|------|------|------|------|------|------|
| **A1-S** | 2 | 2 | 5 | 2 | 3 | 14 |
| **A1-E** | **3** | **5** | **5** | **5** | **5** | **23** |
| **A2** | 4 | 2 | 3 | 3 | 3 | 15 |

**채택: A1-E (early return)**. 평균 4.6/5.

차이 핵심:
- **vs A1-S**: A1-E 가 변경 범위 60% 적음 + Next.js 15 RSC hydration mismatch 위험 0 + 동기 패턴 자연스러움
- **vs A2**: A1-E 가 호출자 7곳 갱신 불필요 (단일점 변경) + 회귀 강도 구조적 (호출자 규율 의존 0)

---

## 결정

### 결정 1 — `SimCommandProvider` early return (A1-E)

`apps/web/src/core/sim-context.tsx` 의 `SimCommandProvider` 가 `core === null` 시 children 렌더 보류:

```typescript
export function SimCommandProvider({
  core,
  children,
}: {
  core: SimulationCore | null;
  children: ReactNode;
}) {
  // ADR `20260510-419-sim-canvas-mount-race.md` §결정 1.
  // core null 시 children 렌더 보류 — useSimCommand race condition 구조적 차단.
  // sim-canvas.tsx 의 비동기 core 생성 (useEffect → setCore) 이 완료된 후에만
  // children 의 useEffect 가 발화 → sendCommand 가 항상 non-null core 호출 보장.
  //
  // 부모 ADR `20260504-415-url-sync-guard.md` §재검토 조건 1 충족 — line 104 race fallback 의 존재 이유 소멸.
  if (core === null) return null;

  const api: SimCommandApi = {
    command: (cmd) => core.command(cmd),
  };
  return <SimCommandContext.Provider value={api}>{children}</SimCommandContext.Provider>;
}
```

**근거**:
- 회귀 위험 5/5 (children 자체 미렌더 — useEffect 발화 0 → race 구조적 차단)
- 변경 범위 5/5 (sim-context.tsx 1줄 + 코멘트)
- React 패턴 자연 5/5 (conditional render — 가장 단순한 컨테이너 패턴)
- 테스트 가능성 5/5 (`core={null}` props 로 children 미렌더 단언 1줄)

**부수 효과**:
- `useSimCommand()` 의 no-op fallback (line 33 `() => undefined`) 은 보존 — context provider 자체가 부재하는 경우 (Provider 외부 호출, 단위 테스트 누락 케이스 등) 의 안전망
- children mount 지연 ~100ms 이내 (core 인스턴스 생성 + first useEffect tick)

### 결정 2 — url-sync.tsx line 104 `setSelectedBody(urlFocus)` 제거

`apps/web/src/core/url-sync.tsx` 의 `if (urlFocus)` 분기에서 race fallback 제거:

```typescript
} else {
  // 카메라 focus + store selectedBodyId sync (info-panel 표시 트리거).
  // ADR `20260510-419-sim-canvas-mount-race.md` §결정 1 (mount 순서 정합화) 후
  //   sendCommand({type:'focusOn'}) → simulation-core focusOn → emit 'bodySelected' → core-adapter → setSelectedBody 자동
  //   race condition 부재로 setSelectedBody fallback 제거 — event 단일 진실원
  //   (R1 #334+#335 ADR `20260425-r1-store-scene-sync-unification.md` §결정 3 정신 회복).
  sendCommand({ type: 'focusOn', bodyId: urlFocus });
}
```

**근거**:
- 부모 ADR §결정 3 (event 단일 진실원) 정신 회복 — store mutation 의 부수 효과 SSoT 사용 해소
- 결정 1 의 mount 순서 정합화로 race 부재 보장 → fallback 의 존재 이유 소멸 (부모 ADR §재검토 조건 1 충족)
- DoD-1 (line 104 1줄 삭제 단언) 충족

### 결정 3 — 단위 테스트 (DoD-3, DoD-4)

#### 3-0. `apps/web/src/components/sim-canvas.test.tsx` setCore 전파 단언 (DoD-3 보강, cross-validate 반영)

cross-validate Gemini 권고 §6 §개선 제안 §1 — sim-canvas 의 `core` 상태가 `null → SimulationCore` 전이 시 `SimCommandProvider` 의 `core` prop 이 정상 갱신되는지 검증. 현재 sim-canvas.test.tsx 가 SimulationCore 의 비동기 생성을 mock 할 수 있다면 단언 1줄로 검증 가능. mock 어려우면 (`new SimulationCore(canvas)` 가 Babylon scene 의존) 본 단언은 browser-verify 의 `__simCore` 전역 노출 단언 (sim-canvas.tsx:128) 으로 간접 확인. **Implementation 결정은 developer 단계** (mock 가능성 실측).

#### 3-1. `apps/web/src/core/sim-context.test.tsx` 신규 (DoD-3)

```typescript
describe('SimCommandProvider — core null 시 children 미렌더 (#419 §결정 1)', () => {
  it('core={null} → children 미렌더 (race condition 구조적 차단)', () => {
    render(
      <SimCommandProvider core={null}>
        <div data-testid="child">child</div>
      </SimCommandProvider>,
    );
    expect(screen.queryByTestId('child')).toBeNull();
  });

  it('core={mockCore} → children 등장 + useSimCommand 가 mock.command 호출', () => {
    const mockCommand = vi.fn();
    const mockCore = { command: mockCommand } as unknown as SimulationCore;
    function Child() {
      const send = useSimCommand();
      send({ type: 'setMode', mode: 'observe' });
      return <div data-testid="child">child</div>;
    }
    render(
      <SimCommandProvider core={mockCore}>
        <Child />
      </SimCommandProvider>,
    );
    expect(screen.getByTestId('child')).toBeInTheDocument();
    expect(mockCommand).toHaveBeenCalledWith({ type: 'setMode', mode: 'observe' });
  });
});
```

#### 3-2. `apps/web/src/core/url-sync.test.tsx` 라운드 2 합의 DoD-4 보강 (DoD-4)

mock 으로 useSimCommand 가 항상 non-null core (mock command 함수) 반환하도록 유지 — 결정 1 mount 순서 정합화 후 race 부재 환경 시뮬레이션. 기존 8 케이스 단언이 그대로 통과 (race fallback 제거로 setSelectedBody 0회 가도 sendCommand 가 정상 emit → core-adapter 가 store 갱신 — 단 단위 테스트는 mock 이므로 emit 경로 미시뮬, **단언은 sendCommand 호출 + console.warn 만**).

추가 케이스 (DoD-4 race fallback 부재 검증):
```typescript
it('?focus=sun → sendCommand 1회 + setSelectedBody 직접 호출 0회 (race fallback 제거 검증, #419 §결정 2)', () => {
  mockUrlFocus = 'sun';
  const setSelectedBodySpy = vi.spyOn(useSimStore.getState(), 'setSelectedBody');

  render(<UrlSync />);

  expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'sun' });
  // race fallback 제거 — url-sync 가 setSelectedBody 직접 호출 0회 (event 단일 진실원).
  expect(setSelectedBodySpy).not.toHaveBeenCalled();
});
```

**참고**: 기존 url-sync.test.tsx 케이스 1 (line 86 `expect(useSimStore.getState().selectedBodyId).toBe('sun')`) 은 mock 환경에서 setSelectedBody 호출 경로 부재 → `null` 반환 가능. 케이스 1 단언을 **`expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'sun' })` 로 변경** (현재 line 87 의 단언을 1차 단언으로 격상). selectedBodyId 단언은 e2e (browser-verify) 가 담당.

### 결정 4 — 회귀 가드 (DoD-2, DoD-7)

#### 4-1. `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 4-B 확장 (DoD-2)

기존 시나리오 4-B (`?focus=sun` / `?focus=mercury` / `?focus=venus` 진입 시 `selectedBodyId === <body>` 단언 — line 17) 가 R1 #329 회귀 가드 역할. **mount 순서 변경 후에도 시나리오 4-B 가 PASS 유지** 가 본 ADR DoD-2 의 핵심.

추가 단언:
- 페이지 진입 후 1초 이내 `__simCore` 전역 노출 + `selectedBodyId` 박힘 단언 — mount 지연이 사용자 인지 불가 범위인지 검증
- 추가 케이스 신설 0 — 기존 4-B 가 충분

#### 4-2. DoD-7 회귀 매트릭스 — 시나리오 1~6 PASS 보존

`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 의 시나리오 1~6 (mode-switcher / focus-quick-buttons / scenario-presets / celestial-tree / info-panel) 모두 PASS 유지 — 기존 useSimCommand 호출자 7곳 모두 사용자 클릭 핸들러 안에서 호출되어 mount 후 시점이라 race 영향 0 (정적 조사 §"라운드 1 가설 검증" 의 호출자 매트릭스 분석).

### 결정 5 — 부모 ADR `20260504-415-url-sync-guard.md` Amendment 박제

부모 ADR §재검토 조건 1 충족. **신규 §Amendment 섹션 추가** (architect 비-범위 침범 방지 위해 §재검토 조건 직접 수정 대신 §Amendment 섹션 신설 — `20260506-403-r-phase-ui-guard.md` 의 Amendment 위치 패턴 일관, volt #91):

```markdown
## Amendment (2026-05-10) — §재검토 조건 1 충족 (#419)

ADR `docs/decisions/20260510-419-sim-canvas-mount-race.md` (Accepted) 가 본 ADR §재검토 조건 1 의 `useSimCommand` race condition 본질 해결을 박제.

### 변경 사항

- **§결정 1 (옵션 B = D2) 의 url-sync.tsx line 104 `setSelectedBody(urlFocus)` race fallback 제거** — #419 §결정 2 에서 처리. 본 ADR §결정 1 의 가드 분기는 그대로 유지 (sendCommand 단독으로 R-Phase allowlist 외 body 차단 + R-Phase 진입 body 의 emit chain 자동 sync)
- **§배경 line 50-58 의 race condition 분석** 은 historical 기록으로 보존 — drift 분석 의 정확성을 미래 관찰자가 재구성 가능하게 함

### 연쇄 효과

- 본 ADR §결정 4 (단위 테스트 매트릭스) 의 케이스 1 단언이 race fallback 부재 환경 가정으로 재해석 — sendCommand 경로만 확인. selectedBodyId 단언은 browser-verify (e2e) 이관
- 본 ADR §재검토 조건 1 → "충족 완료 (#419 ADR Accepted, 2026-05-10)" 로 박제
- 본 ADR §재검토 조건 2 (외부 진입점 신설 시 가드) 는 race 부재 환경이므로 외부 진입점 race 인식 의무 소멸 — 가드 의무만 박제

### Cross-link

`docs/decisions/20260510-419-sim-canvas-mount-race.md` (본 Amendment 의 근거 ADR)
```

**근거**: volt #91 ADR Amendment 위치 결정 트리 (b) — 신규 이슈 (#419) 가 부모 ADR §재검토 조건을 충족 → 신규 ADR + 부모 ADR Amendment 동시 박제. developer 단계에서 부모 ADR 본문 1곳 추가 (architect 가 본문 작성 후 developer 가 git mv 또는 cat 으로 적용).

### 결정 6 — CHANGELOG `### Behavior Changes` (DoD-8)

```markdown
### Behavior Changes (#419)

- **`SimCommandProvider` 가 core null 시 children 렌더 보류** — sim-canvas mount 시점에 비동기 core 인스턴스 생성 완료 전에는 children (UrlSync + SidePanels + InfoPanel) 미렌더. 사용자 인지 영향 < 100ms (core 생성 시간). 기존 useSimCommand 호출자 7곳 (focus-quick-buttons / mode-switcher / time-controls / scale-control / date-time-picker / celestial-tree / scenario-presets) 모두 클릭 핸들러 안 호출이라 영향 0
- **url-sync.tsx 의 `?focus=` 가드 분기에서 `setSelectedBody(urlFocus)` race fallback 제거** — sendCommand({type:'focusOn'}) 단독으로 selectedBodyId sync (event 단일 진실원 R1 #334+#335 정신 회복). race 부재 보장 (mount 순서 정합화)
- **회귀 가드**: `?focus=sun` / `?focus=mercury` / `?focus=venus` 진입 시 selectedBodyId 정상 sync (R1 #329 / R2 #361 / R3 #369 회귀 보호) — `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 4-B 가 PASS 유지

CHANGELOG entry 위치: 다음 MINOR 릴리스 (행동 변화 → MINOR, CLAUDE.md §SemVer 분류 기준).
```

---

## 결과·재검토 조건

### 기대 효과 (측정 가능)

- **DoD-1 (line 104 제거)**: `git diff develop..fix/419 -- apps/web/src/core/url-sync.tsx` 결과 1줄 삭제 (line 104 `setSelectedBody(urlFocus)`)
- **DoD-2 (race 회귀 가드)**: `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 4-B (sun/mercury/venus URL 직접 진입) PASS — `selectedBodyId === <body>` 단언 R1 #329 회귀 보호
- **DoD-3 (mount 순서 정합화)**: `apps/web/src/core/sim-context.test.tsx` 신규 — `core={null}` props 시 children 미렌더 단언 + `core={mockCore}` 시 children 등장 + useSimCommand 가 mock.command 호출
- **DoD-4 (race fallback 부재 검증)**: `apps/web/src/core/url-sync.test.tsx` 추가 케이스 — sendCommand 호출 후 `setSelectedBody` direct call 0회 (mock spy)
- **DoD-5 (ADR amendment)**: 부모 ADR `20260504-415-url-sync-guard.md` 에 §Amendment (2026-05-10) 섹션 박제 (결정 5)
- **DoD-6 (한글 인코딩)**: 본 ADR + 부모 ADR amendment + 코드 변경 모두 `grep -rn '\xef\xbf\xbd'` 0건
- **DoD-7 (회귀 매트릭스)**: focus-quick-buttons / info-panel / celestial-tree / mode-switcher 등 시나리오 1~6 PASS 보존 (race 영향 0 보장)
- **DoD-8 (CHANGELOG)**: `### Behavior Changes` 박제 (위 결정 6)

### 트레이드오프로 받아들인 비용

- **children mount 지연 ~100ms** — SimCanvas 의 비동기 core 생성 시간만큼 SidePanels / InfoPanel / UrlSync 마운트 지연. 사용자 체감 영향 미미 (core 생성이 빠름) + canvas 자체는 SimCanvas 직속 자식이라 지연 0 — 즉 "검은 canvas 짧게 노출 → UI 등장" 패턴. UI 작업 3단계 검증 (CRITICAL #3) 의 정적 확인에서 검증
- **SidePanels 의 비-core 의존 UI 도 지연** — 향후 core 무관 UI (예: language switcher) 가 추가되면 본 결정의 영향 범위 재평가 — 재검토 조건 3
- **`useSimCommand` no-op fallback (sim-context.tsx line 33) 은 보존** — Provider 외부 호출 시 안전망. 단, A1-E 채택 후 Provider 가 항상 non-null core 가진 children 만 보유 → no-op fallback 은 SimCommandContext 가 부재하는 경로 (단위 테스트, Storybook 등) 만 도달

### Concrete Predictions

- **A. 코드 변경 범위 (실측 가능)**: `git diff --stat develop..fix/419-sim-canvas-mount-race`
  - sim-context.tsx: ~5줄 추가 (early return + 코멘트 3줄)
  - url-sync.tsx: 1줄 삭제 (line 104) + 코멘트 4줄 갱신
  - sim-context.test.tsx (신규): ~40줄 (2 케이스 + setup)
  - url-sync.test.tsx: ~15줄 추가 (DoD-4 케이스) + 케이스 1 단언 갱신
  - 부모 ADR `20260504-415-url-sync-guard.md`: ~25줄 추가 (Amendment 섹션)
  - CHANGELOG.md: ~5줄 추가 (Behavior Changes)
  - **총 변경**: ~95~110 lines, 6 파일. R-Phase allowlist 자체 변경 0 — SSoT 보존 검증
- **B. mount 지연 영향**: production build 의 SimCanvas mount → SimulationCore 인스턴스 생성 → setCore tick → children 마운트 = ~50~150ms 범위 (기기 성능 의존). browser-verify 시나리오 4-B 의 페이지 진입 후 first selectedBodyId 폴링이 1초 timeout 안에 PASS 유지 → mount 지연이 사용자 체감 영향 무시 가능 수준임을 증명
- **C. 회귀 가드 PASS 시간**: 기존 browser-verify 스크립트 ~25초 → 변동 0 (시나리오 추가 0, 단언 추가 0). CI 시간 영향 0
- **D. mount 지연 production 측정 (선택, qa 단계)**: `performance.mark('SimCanvas mount start')` + `performance.mark('SimCommandProvider children first render')` 추가 후 `performance.measure` 로 실제 mount 지연 측정 — < 200ms 단언 (qa 옵션). 본 ADR DoD 비-범위 — 재검토 조건 4 에 trigger 만 박제

### 재검토 조건

1. **A1-E 채택 후 SidePanels mount 지연이 사용자 인지 가능 (>500ms)** → A2 (호출자 7곳 ready 체크) 또는 children 분리 (core-dependent vs core-independent 분리) 검토. 측정: `performance.measure('SimCanvas → first child render')` 분포 추적
2. **신규 외부 진입점 (deep link / IPC / programmatic API) 도입** → 부모 ADR §결정 5 의 6번째 박제 항목 적용. race 부재 환경 (본 ADR §결정 1) 이므로 외부 진입점은 가드만 박제하면 충분 — race 인식 의무 소멸
3. **core-independent UI 컴포넌트 신규 도입 (language switcher / theme toggle 등)** → SimCommandProvider 의 children 에서 분리. core 의존 children 만 SimCommandProvider 안에 두고, 비-의존 children 은 Provider 외부에 둬 mount 지연 회피
4. **A2 (ready signal context) 채택 필요성 재평가 trigger** — 위 조건 1/3 또는 mount 지연 측정 P95 > 500ms 시 A2 elevation 검토. 본 ADR §후보 비교의 A2 분석 재사용 가능
5. **`useSimCommand` no-op fallback (sim-context.tsx line 33) 제거** → Provider 외부 호출 케이스 (단위 테스트, Storybook 등) 0 보장 시 fallback 제거 가능. 본 sprint 비-범위

---

## 비-범위

- **#418 (가드 거부 시 사용자 UX 피드백)** — 별도 이슈. URL `?focus=earth` 진입 후 사용자가 무시됨을 인지할 UX (Toast / URL replace) 디자인. 본 ADR 비-범위
- **`useSimCommand` no-op fallback 제거** — 재검토 조건 5. 본 sprint 비-범위
- **A2 (core ready signal context) elevation** — 재검토 조건 4. 본 sprint 비-범위
- **호출자 7곳 (focus-quick-buttons / mode-switcher / time-controls / scale-control / date-time-picker / celestial-tree / scenario-presets) 변경** — 본 ADR §결정 1 의 mount 순서 정합화로 race 부재 보장 → 호출자 변경 불필요
- **core-independent children 분리** — 재검토 조건 3. 본 sprint 비-범위 (현재 모든 children 이 core 의존)
- **`useGuardedQueryParam` 재사용 추상화** (부모 ADR §교차검증 §고유 발견 #3) — 부모 ADR 비-범위 일관
- **mount 지연 production 측정 (`performance.mark/measure`)** — 재검토 조건 4 의 trigger 만 박제. qa 옵션
- **#434 (sim-context fallback 옵션 B 잔여)** — 별도 이슈 (라운드 2 PM 분리)

---

## 참고

- 발화점: 부모 ADR `20260504-415-url-sync-guard.md` §재검토 조건 1 + cross-validate Gemini 고유 발견 #2
- Builds on: #415 (라운드 2 MERGED — `c4a36c4`), `20260504-415-url-sync-guard.md` (부모 ADR — 본 Amendment 박제 대상)
- 이슈: [#419](https://github.com/coseo12/astro-simulator/issues/419)
- 코드 SSoT:
  - `apps/web/src/core/sim-context.tsx:17-28` (`SimCommandProvider` — §결정 1 박제 대상)
  - `apps/web/src/core/url-sync.tsx:99-105` (line 104 race fallback — §결정 2 제거 대상)
  - `apps/web/src/components/sim-canvas.tsx:511` (`<SimCommandProvider core={core}>{children}</SimCommandProvider>` — 변경 0, 결정 1 의 props 흐름 SSoT)
  - `apps/web/src/core/sim-context.test.tsx` (신규 — 결정 3-1)
  - `apps/web/src/core/url-sync.test.tsx` (DoD-4 추가 케이스 — 결정 3-2)
  - `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` (시나리오 4-B 회귀 가드 — 결정 4-1, 변경 0)
- volt 교훈: [#21](https://github.com/coseo12/volt/issues/21) (사전 조사 — 신규 헬퍼 박제 0), [#49](https://github.com/coseo12/volt/issues/49) (주석 drift — line 104 historical 의도 → race fallback 으로 drift), [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작 — 정적 리뷰가 잠복 race 식별), [#77](https://github.com/coseo12/volt/issues/77) (단계 게이트 — architect 단계가 race 의 본질 해결 박제), [#91](https://github.com/coseo12/volt/issues/91) (ADR Amendment 위치 결정 트리 (b) 패턴 일관)

---

## 교차검증 반영 사항

cross-validate 1회 예정 (architect 박제 직후, anchor=ADR 신규). 본 섹션은 cross-validate 호출 후 갱신.

### Claude 편향 4종 셀프 체크 (호출 전)

- **낙관적 일정**: 통과 — architect 단계 일정 추정 없음. developer 단계 변경 ~95~110 lines 는 §Concrete Prediction A 로 박제됨
- **결합 간과**: 통과 — useSimCommand 호출자 7곳 매트릭스 (focus-quick-buttons / mode-switcher / time-controls / scale-control / date-time-picker / celestial-tree / scenario-presets) 모두 정적 조사로 영향 분석 완료. mount 지연 부수 영향도 결과·재검토 조건에 박제
- **폐기 프레이밍**: 통과 — Accepted, 외부 조건부 경계 명시 (재검토 조건 5종)
- **순수주의**: 통과 — A1-S 의 React 19 권장 패턴 (Suspense) 을 변경 범위 + RSC mismatch 위험으로 기각. A2 의 호출자 규율 의존을 회귀 강도로 기각. A1-E 의 컨테이너 컨디셔널 렌더 패턴을 "이상적 단순성 = 실용 안전" 결합으로 채택

### 교차검증 호출 결과 (2026-05-09 18:04 UTC, anchor=ADR 신규, outcome=applied)

- **로그**: `.claude/logs/cross-validate-architecture-20260510-030416.log`
- **outcome JSON**: `.claude/logs/cross-validate-architecture-20260510-030416-outcome.json`
- **모델**: gemini-2.5-pro (single shot, exit 0)

### 합의 (Claude 설계와 일치 — Gemini 양호 평가)

- **A1-E 채택의 기술적 타당성**: 5축 평가의 합리성 + "구조적 race 차단" + "변경 범위 최소화" 가 가장 실용적이고 안전한 선택이라는 결론에 전적 동의 (§종합 평가 "매우 우수함")
- **Suspense (A1-S) 의 React 19 RSC 컨텍스트 위험 회피**: 미래 기술 스택과의 호환성 고려 양호 (§기술 결정 타당성)
- **암묵적 계약의 명시화**: `useSimCommand()` 가 호출되는 시점에는 항상 core 가 존재함을 보장하는 패턴이 모듈 간 계약을 견고하게 만듦 (§인터페이스 명확성)
- **SSoT 원칙 회복**: url-sync line 104 제거로 event 단일 진실원 (R1 #334+#335) 정신 회복 — 데이터 흐름 예측 가능 (§인터페이스 명확성)
- **재검토 조건의 박제**: 5종 재검토 조건이 미래 진화 경로를 열어 둠. 특히 §재검토 조건 3 의 core-independent UI 분리 사전 박제 양호 (§확장성)
- **보안 영향 0**: 내부 상태 관리 / 렌더링 로직 한정 (§보안)

### 이견 수용

- 없음. Gemini 가 결정 5축 + 자가 점검 6개 질문 모두 합의 (또는 자가 점검 충분으로 간접 합의)

### Claude 재분석으로 기각한 Gemini 제안

- 없음. Gemini 가 보완 제안만 제시 (반대 의견 없음)

### 고유 발견 (현재 ADR 에 즉시 반영)

1. **sim-canvas.tsx setCore 전파 검증 (Gemini §6 §개선 제안 §1)**:
   - 범위 체크: 본 ADR §결정 3 (단위 테스트) 의 매트릭스 보강 — sim-context 와 url-sync 에 집중되어 있어 sim-canvas 의 setCore 호출 → SimCommandProvider props 전파 검증 누락
   - 반영: §결정 3-0 신규 추가 — sim-canvas.test.tsx 의 setCore 전파 단언 (mock 가능성 실측은 developer 단계)
   - DoD 영향: DoD-3 (mount 순서 정합화 단위 테스트) 의 보강 — 이미 박제된 DoD 항목의 보강이라 신규 DoD 추가 0

### 고유 발견 (후속 분리)

1. **`SimCommandProvider` 의 매 렌더 새 closure / value object 잠재 re-render 비효율 (Gemini §6 §개선 제안 §2)** → [#435](https://github.com/coseo12/astro-simulator/issues/435):
   - 본 ADR §정적 조사 결과 §부수 발견 에 이미 박제 — Gemini 가 후속 이슈 분리 + cross-link 권고
   - 후속 분리 근거: 본 sprint DoD 가 race condition 본질 해결만 다룸. useMemo 안정화는 직교 영역 (현재 영향 0, 잠재 위험)
   - 우선순위: low (잠복 회귀 발생 빈도 0, 미래 호출자가 sendCommand 를 deps 에 추가 시 elevation)
   - 후속 이슈 박제: [#435](https://github.com/coseo12/astro-simulator/issues/435) (`Builds on: #419`)

### 6개 자가 점검 질문 명시 답변 분석

- **Q1 (RSC hydration mismatch)**: Gemini 가 직접 답변 안 함. 그러나 §기술 결정 타당성 에서 "Suspense 의 잠재적 RSC 이슈를 고려하여 기각한 점도 미래 기술 스택과의 호환성을 고려한 좋은 결정" 명시 — A1-E 자체는 RSC 위험 회피가 정확. `'use client'` boundary 안의 client state 기반 conditional render 는 React 18 부터 안정 (Claude 자체 분석 §축 4 점수 5/5 와 합의)
- **Q2 (mount 지연 사용자 인지)**: Gemini 가 직접 답변 안 함. Claude §결과·재검토 조건 §트레이드오프 ("100ms 이내 + canvas 자체 직속 자식이라 지연 0") + §재검토 조건 1 (사용자 인지 가능 >500ms 시 elevation) 박제로 충분
- **Q3 (A2 더 적은 변경 범위 가능성)**: Gemini 가 §기술 결정 타당성 에서 "구조적 해결책을 선택한 것은 장기적으로 시스템의 안정성을 높이는 현명한 판단" 명시 — A2 의 "개발자 규율 의존" 을 명시적으로 부정. 큐잉 패턴은 추가 복잡도 → A1-E 가 우월
- **Q4 (5축 누락 측면)**: Gemini 가 §누락 요소 에서 "거의 없음 (매우 상세함)" 평가 — 5축 충분
- **Q5 (Amendment 위치)**: Gemini 가 직접 답변 안 함. 본 ADR 의 Amendment 위치 (부모 ADR 본문 마지막에 §Amendment 섹션 추가) 는 volt #91 트리 (b) 패턴 일관 — 미래 관찰자 가독성 우수. inline 수정 안 한 이유는 architect 가 부모 ADR 본문 직접 수정 금지 규칙 (architect 비-범위 침범 방지). 단, **§재검토 조건 1 자체에 inline cross-link** ("충족 완료 — §Amendment (2026-05-10) 참조") 1줄 추가는 가독성 개선 — 본 ADR §결정 5 보강
- **Q6 (단위 테스트 한계)**: Gemini §6 §개선 제안 §1 가 sim-canvas.test.tsx 보강 권고 — 본 ADR §결정 3-0 신규 박제로 반영. 실 mount race 의 e2e 검증 의무는 browser-verify 시나리오 4-B 가 담당 (Claude §결정 4-1 박제 일관)

### Concrete Prediction E — Gemini 직접 단언 미수행 영역 (실측 의무)

본 ADR cross-validate 가 6개 질문 중 4개 (Q1, Q2, Q3, Q5) 에 직접 답변 안 함 (간접 합의 또는 self-check 충분 평가). 따라서 다음은 developer / qa 단계의 실측 의무:

- **E-1 (RSC hydration)**: production build 후 `pnpm build && pnpm start` → 페이지 진입 시 console 의 `Hydration failed` warning 0건 단언 (qa 단계)
- **E-2 (mount 지연 측정)**: `performance.measure('SimCanvas mount → first child render')` 분포 P50 < 100ms, P95 < 200ms 단언 (qa 옵션, 재검토 조건 1 의 trigger)
- **E-3 (Storybook / 단위 테스트 mock 패턴)**: 향후 Storybook 도입 시 `<SimCommandProvider core={mockCore}>` mock 패턴 정립 — 본 ADR §재검토 조건 5 trigger
