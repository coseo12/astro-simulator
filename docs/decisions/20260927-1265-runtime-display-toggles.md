# ADR 20260927-1265 — 런타임 표시 토글: core 명령 API · URL 쓰기 계약 · 표시 패널

- **상태**: Accepted (cross-validate 2026-09-27)
- **날짜**: 2026-09-27
- **결정자**: architect (이슈 [#1265](https://github.com/coseo12/astro-simulator/issues/1265) 스프린트 계약 · 사용자 결정 Q1~Q4 2026-09-27)
- **관련**:
  - [ADR 20260624-738](20260624-738-procedural-starfield.md) §결정 7 · §후속 분리 후보 「런타임 starfield 토글 UI 버튼」 — 본 ADR 이 그 후보의 설계다
  - [ADR 20260628-756](20260628-756-procedural-planet-surface.md) §결정 4 (URL-only 패턴 A vs command 패턴 B 비교) · §A10.9 결정 8 (`?clouds=off`) · §A11.6 결정 4 (`?nightlights=off`) — 본 ADR 은 구름·불빛에 **패턴 B** 를 추가 채택하고 표면(`?surface=`)은 패턴 A 로 **유지**한다
  - [ADR 20260907-1205](20260907-1205-frame-phase-vs-time-phase.md) — 시간 위상 / 프레임 위상 분리 (결정 3 의 「켤 때 즉시 동기」 근거)
  - #688 (궤도선 command 선례) · #737 (`data-modal-open` Esc 가드) · #850 (URL 파싱 주석 계약) · #1219 (DOM 오염 캡처) · #1258 (r1 baseline CI 전용 갱신)
- **용어**: [LOD](../glossary.md), [Tier](../glossary.md#tier-t1--t2--t3)

> **forensic 변형 판정 — 일반 ADR.** 5조건 중 (1) 가설 N≥2 / (3) DoD PASS 인데 회귀 / (5) Amendment 라운드 예상이 해당 없다 (신규 기능 설계). 3개 미만.

---

## 배경

런타임에 켜고 끌 수 있는 표시 효과는 궤도선(#688) 하나뿐이다. 별 배경(#738)·지구 구름(#1215)·야간 불빛(#1226)은 로드 시점 `?x=off` 로만 끌 수 있다. 사용자 결정(Q1~Q4)으로 상단 바 우측 「표시」 버튼 + 비모달 드롭다운 패널에서 4개(궤도선 포함)를 켜고 끄며, 상태를 URL 에 `history: replace` 로 반영한다.

제약은 두 개다.

1. **로드 경로 1비트 불변** — `?x=off` 로드 경로는 가드 다수의 전제다 (`verify:1215` 측정 불가 (5) 「`?clouds=off` 면 구름 mesh 0」, `verify:738` S4·S6, `verify:1226` (5)). 런타임 경로는 새로 만들되, 로드 경로의 동작·URL·전역(`window.__starfieldVisible`)은 바꾸지 않는다.
2. **런타임 결과 = 로드 결과 (픽셀)** — 런타임에 끈 화면은 해당 `?x=off` 로드 화면과 같아야 한다 (계약 D5~D8).

코드 실측 (`develop@c2329440`) 에서 설계를 좌우한 사실 5건:

| # | 사실 | 근거 |
| --- | --- | --- |
| F1 | 구름은 켜질 때 렌더링 그룹 0 의 **투명 정렬 함수**를 교체한다. 끄는 경로(dispose)는 `setRenderingOrder(0, null, null, null)` 로 복원한다 | `solar-system-scene.ts:754-769` |
| F2 | `setRenderingOrder(0, null, null, null)` 은 생성자 기본값과 **같은 경로**다 — setter 가 `null` 이면 `PainterSortCompare` / `defaultTransparentSortCompare` 를 넣는다 | Babylon 9.19.0 `Rendering/renderingGroup.js:15-49` · `renderingManager.js:257-267` |
| F3 | 렌더링 그룹 0 의 **불투명 큐 정렬은 `PainterSortCompare` = `material.uniqueId` 오름차순**이다. 로드 시 별 배경 머티리얼은 body 머티리얼보다 **먼저** 만들어져 가장 먼저 그려진다 | `renderingGroup.js:283-290` · `solar-system-scene.ts:625-629` (bodies 생성 `:697` 보다 앞) |
| F4 | 구름 상대 자전 `applyCloudDrift` 는 **시간 위상** (`updateAt`) 에만 있다. 일시정지에서는 `updateAt` 이 돌지 않는다 | `solar-system-scene.ts:1621-1623` · ADR 1205 §배경 |
| F5 | 야간 불빛 세기는 **모든** 절차 행성 머티리얼 생성 시 `options.nightLights` 로 1회 set 되고, mid variant 는 `surfaceLightingArgs` 객체를 **참조로** 받아 lazy 생성된다 | `procedural-planet-shader.ts:1323` · `solar-system-scene.ts:2083-2091` · `body-mesh-factory.ts:128-137` |

추가로 web 쪽 2건:

| # | 사실 | 근거 |
| --- | --- | --- |
| W1 | `UrlSync` 의 store→URL 동기는 `useEffect` 구독이며 **마운트 직후에도 1회 실행**된다 (`initialized.current` 가 같은 커밋의 첫 effect 에서 `true` 가 된다) | `url-sync.tsx:61-64, 129-148` |
| W2 | `focus-quick-buttons` 의 Esc→자유시점 리스너는 `selected` 가 바뀔 때마다 **window 에 재등록**된다. 모달 가드(`data-modal-open`)는 리스너 등록 순서에 기대고 있다 — 모달은 열릴 때 등록돼 항상 뒤에 선다 | `focus-quick-buttons.tsx:50-70` · `modal.tsx:117-133` |

---

## 후보 비교

### 축 1 — core 명령 API 형태

| 후보 | 장점 | 단점 |
| --- | --- | --- |
| **A. 효과별 명령 3종** (`setStarfieldVisible` / `setCloudsVisible` / `setNightLightsVisible`) + 핸들러 3종 — `setOrbitLinesVisible` 동형 | #688 선례와 완전 동형. `CoreCommand` 판별식 유니온 + `default: never` exhaustive 검사가 효과별로 작동. 테스트 선례(`simulation-core-orbit-lines.test.ts`) 그대로 복제 | `SimulationCore` 핸들러 슬롯 +3 (보일러플레이트) |
| B. 범용 명령 1종 `{ type: 'setDisplayLayer'; layer; visible }` + 핸들러 1종 | 슬롯 1개. 패널 데이터 테이블과 1:1 | 궤도선만 다른 명령으로 남는 **이중 경로** (궤도선 이관은 기존 계약·테스트 변경 = 범위 밖). `layer` 가 문자열 유니온이라 새 레이어 추가 시 core 분기 누락을 컴파일러가 못 잡는다 (scene 쪽 switch 가 별도) |

→ **A 채택.** 보일러플레이트 비용 < 선례 동형성 + exhaustive 검사. B 는 궤도선까지 이관하는 별도 리팩토링이 있을 때만 의미가 있다.

### 축 2 — 효과별 OFF/ON 기전

| 효과 | 후보 | 판정 |
| --- | --- | --- |
| 구름 | (a) `mesh.setEnabled(false)` | ✗ 정렬 함수(F1)가 남는다 — 로드 OFF 와 **구조가 다르다** (`verify:1215` 헤더가 같은 이유로 런타임 OFF 를 OFF 기준으로 쓰지 않았다) |
| 구름 | **(b) dispose + 정렬 함수 복원 / 켤 때 로드와 같은 생성 함수 재호출** | ✓ 로드 OFF 와 구조 동일(F2). 켤 때는 로드 ON 과 같은 함수 |
| 별 | (a) 매번 dispose / 재생성 | ✗ 재생성마다 머티리얼 `uniqueId` 가 커져 불투명 큐 순서가 로드와 달라진다(F3) — 로드 ON 페이지를 끄고 켜기만 해도 순서가 바뀐다 |
| 별 | **(b) 없을 때만 지연 생성, 이후 `setEnabled` 토글** | ✓ 로드 ON 페이지는 원래 순서 유지. 순서가 달라지는 경우는 「`?stars=off` 로드 후 처음 켤 때」 하나로 한정 (위험 R1). 별은 정렬 함수를 건드리지 않아 `setEnabled(false)` 는 로드 OFF 와 픽셀 동등 (비활성 mesh 는 active mesh 에서 빠진다) |
| 불빛 | **uniform `nightLightStrength` 갱신 + 상태 보관** (유일 후보) | 같은 셰이더 프로그램, uniform 값만 다르다 → 로드 OFF 와 픽셀 동등 (`procedural-planet-shader.ts:1320-1323` 주석 「정확한 no-op」) |

### 축 3 — URL 쓰기 위치

| 후보 | 장점 | 단점 |
| --- | --- | --- |
| A. `UrlSync` 에 store→URL `useEffect` 4개 추가 (`mode`/`speed` 선례) | 기존 패턴 | **로드 경로 파괴 위험** — W1 로 마운트 직후 store 기본값(`true`)이 URL 에 쓰여 `?stars=off` 를 **scene 이 읽기 전에 지울 수 있다** (scene 생성은 엔진 `await` 뒤 비동기 — 순서 비결정 [추정: 타이밍 미실측, 구조상 배제가 목적]) |
| **B. 사용자 토글 이벤트에서만 쓴다** — 공용 훅 `useDisplayToggle()` 이 store · command · URL 을 한 호출에서 갱신 | 사용자 조작 전에는 URL 쓰기 0 → 로드 경로 URL 불변이 **구조적**으로 성립. 패널과 단축 바가 같은 훅을 공유(Q4) | UrlSync 밖에 URL 쓰기 지점이 하나 더 생긴다 (주석으로 이유 박제) |

→ **B 채택.**

### 축 4 — 패널 Esc 와 자유시점 오발화 차단

| 후보 | 판정 |
| --- | --- |
| (a) 패널에 `data-modal-open="true"` 부착 (기존 가드 그대로) | ✗ 비모달에 모달 속성 — `verify:737`·`verify:848` 이 이 속성으로 모달을 찾는다. 그리고 (b) 와 같은 순서 문제를 가진다 |
| (b) 패널 전용 속성 `data-display-panel-open` + 기존 가드 셀렉터에 OR | △ 비모달이라 패널이 열린 채 body 선택이 바뀌면(캔버스 클릭) W2 로 자유시점 리스너가 **패널 리스너보다 뒤에** 재등록된다. 그러면 패널 리스너가 먼저 닫기를 예약하고 [추정: React 18 이 이산 이벤트 갱신을 마이크로태스크로 flush 하고, 브라우저는 리스너 콜백 사이에 마이크로태스크 체크포인트를 돈다 — 스펙 추론, 미실측] 속성이 사라진 뒤 자유시점 리스너가 돌 수 있다 |
| **(c) (b) + 패널 Esc 리스너를 window *capture* 단계에 등록하고 `preventDefault()` / 자유시점 가드에 `e.defaultPrevented` 검사 추가** | ✓ capture 단계는 등록 순서와 무관하게 bubble 단계보다 먼저 돈다 — 순서 의존 제거. 속성 가드는 #737 과 같은 방식으로 병행 유지(방어 심층) |

→ **(c) 채택.**

---

## 결정

### 결정 1 — core API: 효과별 명령 3종 (궤도선 선례 동형)

- `packages/shared/src/events/core-events.ts` `CoreCommand` 에 3종 추가: `{ type: 'setStarfieldVisible'; visible: boolean }` · `{ type: 'setCloudsVisible'; visible: boolean }` · `{ type: 'setNightLightsVisible'; visible: boolean }`.
- `SimulationCore` 에 핸들러 슬롯·등록 메서드 3종 (`setStarfieldVisibleHandler` 등 — `setOrbitLinesVisibleHandler` 와 같은 시그니처, 미등록 시 no-op). 1회성 command 라우터 핸들러이므로 `| null` 이탈 사유(ADR 1205 §결정 2 의 `setFramePassHandler` 주석)는 해당 없다.
- `SolarSystemSceneHandles` 에 같은 이름의 scene 메서드 3종. **core 는 렌더러 종류를 모른다** — 소프트웨어 렌더 차단은 web 이 한다(결정 5). 로드 경로가 `resolveStarfieldVisible` 로 web 에서 거르는 것과 같은 레이어 분리다.

### 결정 2 — 구름: OFF = dispose + 정렬 복원, ON = 로드와 같은 생성 함수

로드 경로의 구름 블록(`solar-system-scene.ts:736-770`)을 **본문 그대로** 두 클로저로 옮긴다: `enableClouds()` (생성 + `registerHost` + `registerMember(cloud)` + `setRenderingOrder(0, …, compare)`) / `disableClouds()` (기존 disposer 본문 — `setRenderingOrder(0, null, null, null)` + `layer.dispose()` + `cloudLayer = null`). 로드 시점에는 `if (clouds && surfaceDetail) enableClouds()` 를 **같은 위치**에서 1회 호출하고, `disposables` 에는 `disableClouds` 슬롯 disposer 를 **같은 위치**에서 1개 push 한다 (`cloudLayer === null` 이면 no-op — 로드 OFF 에서 dispose 시 정렬 함수를 건드리지 않는다).

런타임 `setCloudsVisible(visible)`:

1. `!surfaceDetail` 이면 return (유효 조건 `clouds && surfaceDetail` 동형).
2. 이미 그 상태면 return (멱등 — D6 누수 0 의 전제).
3. OFF → `disableClouds()`.
4. ON → `enableClouds()` 에 더해 **런타임 전용 2단계**:
   - (a) **이미 lazy 생성된** earth mid·low variant 를 계열에 등록한다 — 로드 OFF 에서 생성된 variant 는 `registerMember` 가 host 미등록으로 `false` 를 반환해 빠져 있다 (`cloud-layer.ts:479-483`). 등록은 `Map.set` 이라 재등록 멱등.
   - (b) **즉시 동기**: `rotationStates.has(CLOUD_LAYER_BODY_ID)` 면 `applyCloudDrift(cloudLayer, currentJd, rotationEpoch)` 를 바로 부른다. 없으면 일시정지 중 켠 구름이 identity 회전으로 남아 로드 ON 과 달라진다 (F4 — #1205 클래스). 가시성(`cloudLayer.mesh.isVisible`)은 프레임 위상(`runFramePass`)이 매 프레임 쓰고 렌더 직전에 돈다 (`simulation-core.ts:356-365`) — 별도 동기 불요.

**OFF 때 계열 레지스트리를 비운다** (`HostFamilyRegistry.clear()` 신설 — `entries`·`hosts` 둘 다). 레지스트리는 mesh 를 키로 쓰는 `Map` 이고 해제 메서드가 없어 (`cloud-layer.ts:469-470`), 비우지 않으면 ON/OFF 왕복마다 dispose 된 구름 mesh 가 키로 누적된다. 비우면 레지스트리 상태도 로드 OFF(빈 레지스트리)와 같아지고, OFF 중 lazy 생성된 mid·low 는 로드 OFF 와 똑같이 `registerMember` 가 `false` 로 빠진다 — 재-ON 시 위 4-(a) 가 다시 등록한다. (교차검증 반영 — 초판은 「정렬 함수만 제거하면 레지스트리는 읽히지 않는다」는 이유로 비우지 않았으나, 읽히지 않는 것과 누적되지 않는 것은 다른 축이었다.)

### 결정 3 — 별: 없을 때만 지연 생성, 이후 `setEnabled`

- 로드: `starfieldHandles = starfield ? createStarfield(scene) : null` (같은 위치), 슬롯 disposer 1개.
- `setStarfieldVisible(true)`: `starfieldHandles ??= createStarfield(scene)` 후 `mesh.setEnabled(true)`. `false`: `starfieldHandles?.mesh.setEnabled(false)`.
- `window.__starfieldVisible` 은 **로드 시점 판정** 의미를 유지한다 (D12) — 런타임 토글이 갱신하지 않는다.

### 결정 4 — 불빛: `surfaceLightingArgs.nightLights` 를 단일 가변 상태로

- `setNightLightsVisible(visible)`: `!surfaceDetail` 이면 return. `surfaceLightingArgs.nightLights = visible` (이후 lazy 생성되는 mid 가 이 값을 읽는다 — F5). 이어서 `meshes` 와 `midVariants` 의 머티리얼 중 **절차 행성 머티리얼만** `setFloat('nightLightStrength', resolveNightLightStrength(visible))`.
- 「절차 행성 머티리얼인가」는 조건식 복제(`surfaceDetail && kind !== 'star' && SURFACE_TYPE_BY_BODY[id]`) 대신 `procedural-planet-shader.ts` 에 **모듈 WeakSet 등록 + `isProceduralPlanetMaterial(material)` 술어**를 둔다 — `createProceduralPlanetMaterial` 이 생성 시 등록한다. 생성 조건의 사본을 만들지 않는다 (volt #69).
- 세기 값은 기존 `resolveNightLightStrength` 를 재사용한다 (volt #21 — 신규 함수 0).
- 구름 머티리얼은 `nightLights` 를 읽지 않는다 (`cloud-layer.ts` 에 참조 0 — grep 실측).

### 결정 5 — web 상태 · 가용성 · URL 쓰기

- **store** (`sim-store.ts`): `starsVisible` / `cloudsVisible` / `nightLightsVisible` (URL **의도**, 기본 `true` — `orbitLinesVisible` 동형) · `displayCapabilities: { starfield: boolean; surfaceDetail: boolean } | null` (기본 `null` = 장면 미준비) · `displayPanelOpen: boolean`.
- **초기화**: `sim-canvas.tsx` 궤도선 블록(`:937-949`) 옆에서 핸들러 3종 등록 + store 초기값을 **이미 파싱된 지역 변수**로 set — `starsParamVisible` / `cloudsVisible` / `nightLightsVisible` / `surfaceVisible` / `!isSoftwareRenderer`. `new URLSearchParams` 신규 호출 0 (#850 계약 `:514-518`). 언마운트 시 `displayCapabilities = null`.
- **표시 상태**: 별 `aria-pressed = resolveStarfieldVisible(starsVisible, caps.starfield)` (기존 순수 함수 재사용), 구름·불빛 `= intent && caps.surfaceDetail`, 궤도선 `= orbitLinesVisible`.
- **가용성**: `caps === null` 이면 신규 3종 불가 (핸들러 미등록 시 command 가 no-op 으로 사라져 store·scene 이 어긋나는 것을 막는다). 궤도선은 기존대로 항상 가능 (Q4 — 현행 유지).
- **URL 쓰기** — 공용 훅 `useDisplayToggle()` 의 `toggle(id)` 한 곳에서만:
  1. 불가하면 return (방어 심층 — 버튼 상태와 독립).
  2. store set → `sendCommand(...)` → nuqs `useQueryStates` 로 `{ [urlKey]: serializeDisplayToggle(next) }` (`history: 'replace'`).
  - `serializeDisplayToggle(visible) = visible ? null : 'off'` — ON 은 키 삭제, OFF 는 `off` (Q2). 역방향은 **기존** `parseOrbitsVisible` / `parseStarsVisible` / `parseCloudsVisible` / `parseNightLightsVisible` 을 그대로 쓴다 (어휘 공유, 새 파서 0).
  - URL 키 4개는 모두 **기존** 파라미터다 — 새 URL 파라미터 0, 새 URL 읽기 0.
- 북마크 버튼은 `window.location.href` 를 복사하므로(`bookmark-button.tsx:22`) URL 이 동기화되면 **코드 변경 없이** 현재 상태를 담는다 (`?orbits=off` 불일치 해소 포함). 가드가 실측으로 확인한다 (D11).

### 결정 6 — 패널 구조 · 키보드 · 자동 숨김

- **컴포넌트**: `apps/web/src/components/layout/display-panel.tsx` — 트리거 버튼(`data-testid="display-panel-toggle"`, `aria-expanded`, `aria-controls`) + 패널. 우측 그룹에서 `SensitivitySettingsModal` 과 `BookmarkButton` 사이.
- **패널 렌더**: `createPortal(…, document.body)` + `position: fixed` (트리거 `getBoundingClientRect()` 기준 우측 정렬, 뷰포트 안으로 clamp) + `z-[var(--z-dropdown)]`. 이유: (i) 우측 그룹은 모바일에서 `overflow-x-auto` 라 절대 위치 자식이 잘린다 (`top-bar.tsx:44`), (ii) 헤더 쌓임 맥락(`z-hud` 10) 안에서는 사이드 패널(`z-panel` 20) 아래로 깔린다, (iii) canvas 합성 레이어의 형제 DOM 가림 (#704 D-T2 · `modal.tsx` §계약 1). 닫히면 언마운트 (`open=false` → `null` — Modal 동형).
- **비모달**: backdrop 없음, `aria-modal` 없음, 캔버스 조작 유지. 패널 밖 `pointerdown` 은 닫기(포커스 복원 없음).
- **키보드**: 열릴 때 첫 토글로 포커스 이동 · **Tab 은 가두지 않는다** — 비모달 disclosure 패턴이라 Tab 은 패널 안 토글을 차례로 지나 패널 밖 다음 요소로 나간다 (WAI-ARIA APG: 비모달 팝오버에 focus trap 금지. 교차검증 반영 — 초판의 `resolveFocusTrapTarget` 재사용 순환안 폐기). 계약 D14 「Tab 으로 토글 4개 순회」는 선형 순회로 성립한다 · Esc = 닫기 + 트리거로 포커스 복원 · 창 `resize` 시 패널을 닫는다 (fixed 배치 좌표가 트리거와 어긋나는 것을 재계산 대신 제거). Esc 리스너는 결정 축 4 (c) — **window capture 단계** + `preventDefault()`, 패널 요소에 `data-display-panel-open="true"`. `focus-quick-buttons.tsx:54` 가드는 `if (e.defaultPrevented) return;` 과 셀렉터 `'[data-modal-open="true"], [data-display-panel-open="true"]'` 를 쓴다 (셀렉터는 상수 1개로). → 패널 속성 부착과 두 항 셀렉터는 [Amendment 1](#amendment-1--구현-실측으로-정정한-서술-3건-pr-1268-2026-09-28) 로 폐기.
- **비활성 표현**: 신규 3종이 불가하면 `aria-disabled="true"` + 사유 `title` + 사유 텍스트 `aria-describedby` + 비활성 스타일. 클릭은 `toggle()` 의 가용성 검사로 no-op. **네이티브 `disabled` 를 쓰지 않는 이유** — 네이티브 `disabled` 는 포커스 순서에서 빠져 CI(swiftshader, 별 불가) 와 `?surface=off` 에서 D14 「Tab 으로 토글 4개 순회」가 구조적으로 불가능해지고, 사유가 스크린 리더에 닿지 않는다. (계약 D9·D10 「`disabled`」 표현을 `aria-disabled` 로 해석 — 2026-09-27 사용자 확정)
- **자동 숨김 억제**: `top-bar.tsx` `hidden = mode === 'observe' && inactive && !displayPanelOpen`.
- **문구·사유는 상수**: 토글 라벨(궤도선/별 배경/구름/야간 불빛)과 비활성 사유 3종(소프트웨어 렌더 / 표면 off / 장면 준비 중)은 `display-toggles.ts` 데이터 테이블에 둔다.

### 결정 7 — 데이터 테이블 1개가 4 토글의 SSoT

`apps/web/src/core/display-toggles.ts` 에 `DISPLAY_TOGGLES` (id · urlKey · 라벨 · 기존 parse 함수 · command 빌더 · store 선택자 · 가용성 판정 · 비활성 사유) 를 두고 패널·훅·단위 테스트가 모두 이 표를 읽는다. 궤도선 행은 기존 `setOrbitLinesVisible` 명령을 가리킨다.

### 결정 8 — PR 2 단계 분할 (2026-09-27 사용자 확정)

| PR | 범위 | 완료 기준 |
| --- | --- | --- |
| **PR1 — core** | `CoreCommand` 3종 · `SimulationCore` 핸들러 3종 · scene setter 3종 (결정 2·3·4, `HostFamilyRegistry.clear()`, `isProceduralPlanetMaterial`) · 단위 테스트 · 본 ADR | D5 · D6 · D7 · D8 (구조 + OFF 픽셀) · D8p · D12 · D16 (core) · D15 (scene 직접 호출분). 픽셀 판정은 **`window.__solarScene` 의 신규 setter 를 직접 호출**해 해당 `?x=off` 로드와 비교한다 — UI 없이 core 기전만 격리 검증 |
| **PR2 — web** | store · `useDisplayToggle` · 패널 · 상단 바 · Esc 가드 · a11y surface · r1 top-nav baseline (CI 캡처) | D1~D4 · D9~D11 · D13 · D14 · D15 (UI) · D16 (web) · D17 · D18 · D8b (실 Chrome 수동) + 3단계 브라우저 검증. D5~D8 은 UI 경로로 재판정 |

PR1 은 호출자가 없어 **사용자 화면 변화 0** 이고 로드 경로 불변(D12)이라 단독 머지가 backward-compat 하다. 근거: 교차검증 「분할 강력 권장」 + architect 편향 셀프 체크 「낙관적 일정 미통과 의심」 합의.

---

## 결과·재검토 조건

### 기대 효과 (측정 가능)

- 계약 D1~D18 — 판정은 신규 가드 `verify:1265-display-panel` (이슈 코멘트 §테스트 전략) + 기존 가드 무수정 통과(D12).
- 로드 경로 불변: 사용자 조작 전 URL 쓰기 0 (결정 5) · scene 로드 분기 본문 불변(결정 2·3 은 같은 위치 호출로 이동만) · 전역 불변.

### 받아들인 비용

- `SimulationCore` 핸들러 슬롯 +3 (축 1 A).
- 구름 ON 마다 머티리얼 재생성 — 셰이더 effect 는 Babylon 캐시로 재사용될 것으로 본다 [추정 — 미실측, D15 콘솔 0 · 체감 지연은 qa 가 관찰].
- **R1 (별 지연 생성 순서)** — `?stars=off` 로드 후 처음 켠 별은 불투명 큐에서 body 뒤에 그려진다 (F3). body 들은 로그 depth 를 쓰고(`log-depth.ts:11-20` · `:37-38`) 별은 depth write off · 표준 depth 라, 별 fragment 는 body 가 이미 쓴 depth 에 막힐 것으로 본다 [추정 — 계산: `maxZ 1e14` 에서 `logDepthConstant ≈ 0.043`, 카메라 거리 100 scene unit body depth ≈ `0.14` < 반경 500 구의 표준 depth ≈ `1`. 미실측]. ⚠️ 이 계산은 near 평면을 고정으로 두었는데, 교차검증 반례 1 이 **near 가 변하면 별 depth 가 달라진다**는 축을 짚었다. 실측 — `camera.minZ` 초기값은 `0.01` (`camera.ts:307`) 이고 tier 전환은 `newMinZ < camera.minZ` 일 때만 대입해 **감소만** 한다 (`tier-transition.ts:407-410`). 따라서 별 표준 depth 는 항상 `≥ 1 − 0.01/500` 근방이고, body 로그 depth `log2(d+1)/log2(1e14+1)` 가 그 값을 넘으려면 body 가 scene unit `~1e14` 에 있어야 한다 — 현 스케일에서 도달하지 않는다. 논증의 **두 번째 전제**는 「그룹 0 불투명 큐에서 별 외의 mesh 는 모두 depth write 를 한다」이고 (현재 `disableDepthWrite = true` 는 `starfield.ts` · `cloud-layer.ts` 두 곳뿐이며 구름은 투명 큐 — 궤도선 `CreateLineSystem` 은 alpha 1 불투명 + depth write), 이 전제는 CI(software) 에서도 구조로 읽을 수 있다 → 가드 D8p 로 상시 검사. 픽셀 확인은 하드웨어 전용(D8b) — CI 도달 불가.
- 가드의 지구 disk 역투영 식은 `verify:1215` `measurePair` 의 **사본**이다 (저장소에 같은 식의 사본이 이미 5곳 — 783/1119/1202/1215/1226). D12 가 `verify:1215` 무수정을 요구하므로 공용 모듈 추출은 이번 범위 밖이다.

### 재검토 트리거

1. D8b (하드웨어 실측) 에서 `?stars=off`→ON 화면이 기본 로드와 다르다 → R1 전제 붕괴. 별 생성 순서를 로드와 맞추는 기전(예: 그룹 0 불투명 정렬 함수 도입 — 로드 경로 변경이라 별도 ADR) 재검토.
2. 가드 D8p 가 FAIL (그룹 0 불투명 큐에 depth write off mesh 등장) → R1 논증 무효. 같은 조치.
3. 표면(`surface`) 런타임 토글을 도입할 때 — ADR 756 §결정 4 를 재개정하고, 본 ADR 결정 2·4 의 `!surfaceDetail` 조기 반환을 재설계한다 (현재 표면 off 면 절차 머티리얼 자체가 없다).
4. 궤도선까지 범용 명령(축 1 B)으로 통합하는 요구가 생길 때.
5. 모바일 레이아웃 최적화 재개(ADR `20260420-mobile-support-suspension.md`) — 패널 fixed 배치를 재검토.

---

## 교차검증 반영 사항

**수행 2026-09-27** (`agy`, `cross_validate.sh architecture`, outcome `applied`). 입력은 본 ADR + 이슈 설계 코멘트 + 코드 발췌 2개(free-fly Esc `useEffect` 전체 · 로드 구름 `if` 블록 전체) + 반례 탐색 질문 4개. 외부 모델은 도구 없이 텍스트만 봤다 — 코드 대조는 메인이 했다.

**합의 (반영)**

- **PR 분할** — 외부 「분할 강력 권장」 · architect 셀프 체크 「낙관적 일정 미통과 의심」 → 결정 8.
- **축 4 (c) Esc capture 설계에 반례 없음** — capture 단계 리스너는 등록 순서와 무관하게 bubble 단계보다 먼저 돈다. 설계 그대로.
- 축 1 A · 축 3 B · 데이터 테이블 SSoT — 외부도 타당 판정.

**이견 수용 (반영)**

- **구름 OFF 시 레지스트리 누적 (외부 질문 3 반례 1)** — 코드 대조로 확정 (`HostFamilyRegistry.entries` 는 mesh 키 `Map`, 해제 메서드 0). 결정 2 에 `clear()` 추가.
- **비모달 패널 Tab 순환은 APG 위반** — 결정 6 에서 trap 폐기, 선형 Tab.
- **패널 열린 채 창 크기 변경 시 위치 어긋남** — 결정 6 에 resize 시 닫기 추가.

**기각 (근거)**

- **R1 반례 1 (원거리 depth 역전)** — near 축을 짚은 것은 유효해 R1 논증을 보강했으나 반례 자체는 성립하지 않는다: `minZ ≤ 0.01` 단조 감소 실측으로 역전에는 body 가 scene unit `~1e14` 에 있어야 한다 (§받아들인 비용 R1).
- **R1 반례 2 (불투명 큐의 depth write off mesh)** — 현재 해당 mesh 0 (`disableDepthWrite = true` 는 starfield · cloud-layer 둘뿐, 구름은 투명 큐, 궤도선은 불투명 + depth write). 미래 발생은 D8p 가 상시 감시 — 외부가 말한 「사후 감시」가 맞지만 그 감시가 이 ADR 의 재검토 트리거 2 다.
- **R1 반례 3 (MSAA 에지)** [추정 기각] — 샘플 단위 depth test 라 body 가 덮은 샘플은 body, 덮지 않은 샘플은 별로 로드 ON 과 같은 결과가 된다. 픽셀 확인은 D8b (실 Chrome 수동, 사용자 확정).
- **portal SSR 크래시** — 패널은 사용자 클릭 뒤 `open=true` 일 때만 렌더되고 서버 렌더 시점엔 `null` 이다 (결정 6 「닫히면 언마운트」). `document` 접근 경로 없음.
- **고빈도 토글 경쟁** [추정 기각] — scene setter 는 동기(생성·dispose 모두 같은 틱)이고 멱등 검사(결정 2-2)가 있다. 계약 D15 (10회 왕복 콘솔 에러 0) 가 판정한다.
- **별을 로드 시 항상 생성하고 `setEnabled` 만 쓰자 (`verify:738` 의 mesh 0 조건을 active mesh 로 재정의)** — 계약 D12 「`verify:738` S4 무수정 통과」·비목표 「로드 경로 변경 금지」와 상충 (CRITICAL #6 — 비목표 우선).

**고유 발견 (외부)** — `e.defaultPrevented` 가드는 다른 위젯이 Esc 를 `preventDefault` 한 경우에도 free-fly 를 막는다. 「무언가 Esc 를 소비했으면 free-fly 를 발화하지 않는다」는 의도에 맞으므로 수용하되 속성 셀렉터 가드를 병행 유지한다 (결정 6 그대로).

**Claude 편향 셀프 체크 (메인)** — 외부 반례 3건 중 2건을 수치·코드로 기각했으므로 「기각 편향」을 점검했다: 기각 2건은 전부 실측 근거(`camera.ts:307` · `tier-transition.ts:407-410` · `disableDepthWrite` 전수 grep)가 있고, 근거 없는 추론 기각(MSAA · 경쟁)은 [추정 기각] 으로 표기하고 판정을 계약(D8b · D15)에 넘겼다.

- **호출 전 Claude 편향 셀프 체크** (architect 1차):
  - 낙관적 일정 — ⚠️ 미통과 의심. core 3 setter + store + 훅 + 패널 + 가드(D5~D11 + 변이 10종) + a11y surface + r1 baseline(CI 전용) 이 한 PR 이다. 프롬프트에 「PR 분할 필요성」 질문 삽입 권장.
  - 결합 간과 — 통과 시도. F3(불투명 순서) · F4(일시정지 드리프트) · W1(마운트 URL 쓰기) · W2(Esc 리스너 순서) 4건을 찾아 결정에 반영. 단 R1 · 축 4 (c) 의 근거가 **[추정]** 이라 프롬프트에 두 추론의 반례 탐색을 명시 질문으로 삽입 권장.
  - 폐기 프레이밍 — 해당 없음 (신규 기능).
  - 순수주의 — 통과. 공용 측정 모듈 추출·범용 명령 통합을 비-범위로 둠.

---

## Amendment 1 — 구현 실측으로 정정한 서술 3건 (PR #1268, 2026-09-28)

> 위 후보 비교 표 · 결정 본문은 당시 추론 기록이라 **소급 편집하지 않는다**. 결론(축 4 (c) 채택 · `aria-disabled` 해석 · portal)은 바뀌지 않는다. cross-validate 는 메인이 수행한다.

1. **축 4 (c) · 결정 6 의 「속성 가드 병행 (방어 심층)」 은 성립하지 않는다.** 패널 속성은 패널이 열려 있을 때만 존재하고, capture 리스너는 그보다 넓은 「열림」 상태 전체에 붙는다 — 속성이 있는 상태 ⊂ capture 리스너가 붙은 상태다. 그래서 패널 자신의 Esc 에서는 capture 리스너가 먼저 닫기 + `preventDefault` 를 하고, 자유시점 리스너가 돌 때는 패널이 **선택 변경 여부와 무관하게 항상** 이미 사라져 있다 — **현 구현 (닫힘 애니메이션 없음 · 닫히면 언마운트) 기준**이다. 닫힘 전환을 두면 이 단정은 다시 검토한다 (차단은 어차피 `defaultPrevented` 라 결론과는 무관하다). 속성 검사가 결정을 내리는 도달 가능 상태가 없다.
   - 실측: PR #1268 변이 c — 자유시점 가드에서 `defaultPrevented` 검사만 지우면 선택 변경이 없는 D14 엣지와 D14b 둘 다 자유시점이 발화했다 (`exit 1`).
   - 처분: 자유시점 쪽 차단은 `defaultPrevented` 가 전담한다. 셀렉터의 패널 속성 항과 패널의 `data-display-panel-open` 부착은 dead 라 **제거**했다 (「실효 없음」 주석으로 남기는 안도 있었으나, 막지 않는 가드를 남기면 다음 독자가 방어가 두 겹이라고 읽는다). 모달 가드 `[data-modal-open]` (#737) 는 그대로다 — 모달 리스너는 bubble 이고 `preventDefault` 를 하지 않는다.
2. **결정 5 「불가하면 return (방어 심층 — 버튼 상태와 독립)」 → 유일한 차단 지점.** D9 · D10 을 `aria-disabled` 로 해석한 뒤 (2026-09-27 재조정) 버튼은 클릭을 받으므로, `toggle()` 의 가용성 검사가 소프트웨어 렌더 별 · `?surface=off` 구름·불빛을 막는 **유일한** 지점이다 (core 는 렌더러를 모른다 — 결정 1). PR #1268 변이 a (이 검사 제거) 에서 소프트웨어 렌더인데 별이 생성됐다.
3. **결정 6 「Tab 은 … 패널 밖 다음 요소로 나간다」 의 목적지.** portal 이라 DOM 상 패널은 문서 끝이고, 그대로 두면 마지막 토글의 Tab 이 트리거 다음 요소가 아니라 문서 끝으로 빠진다 (WCAG 2.4.3 — PR #1268 cross-validate 5-A). 구현은 패널이 트리거 바로 뒤에 있는 것처럼 잇는다: 열린 트리거 Tab → 첫 토글 · 첫 토글 Shift+Tab → 트리거 (패널 유지) · 마지막 토글 Tab → 패널을 닫고 트리거 다음 요소. 가두지 않는다는 결정 (APG) 은 그대로다. 대칭으로, 포커스가 트리거와 패널을 **둘 다** 벗어나면 (예: 첫 토글 Shift+Tab → 트리거 → 다시 Shift+Tab) 패널을 닫는다 — 이어 갈 요소가 없으면 트리거로 돌린다 (PR #1268 라운드 3). 같은 라운드에서 창 스크롤도 resize 와 같은 이유로 닫기 조건에 넣었다 (`fixed` 좌표 어긋남 — 좁은 폭의 우측 그룹이 `overflow-x-auto`).

### 재검토 트리거 (Amendment 1)

- **패널이 열린 채 Esc 를 쓰는 다른 오버레이 (모달 등) 가 뜰 수 있게 되면** — 패널의 capture `preventDefault` 가 그 오버레이의 Esc 를 가로채 먼저 소비한다. 현재는 도달 불가다 (모달을 여는 경로는 상단 바 버튼 클릭뿐이고 그 `pointerdown` 이 패널을 먼저 닫는다. 단일 키 단축키는 비목표). 도달 가능해지면 오버레이 우선순위 (최상단만 Esc 처리) 를 재설계한다.

### 교차검증 반영 사항 (Amendment 1)

`agy` (2026-09-28, `applied`) — 입력: 결정 6 원문 + Amendment 1 전문 + `display-panel.tsx` 전체 + 자유시점 Esc `useEffect` 전체. 메인 판정 원문: PR #1268 코멘트 `issuecomment-5865190206`.

- **수용 4** — 포커스 탈출 비대칭 (둘 다 벗어나면 닫기) · 트리거 다음 요소 없음 시 포커스 유실 (트리거로 폴백, reviewer R5 와 합의) · 스크롤 시 닫기 · 모달과의 Esc 경합 (현재 도달 불가 → 위 재검토 트리거로만 박제).
- **한정 추가** — 「항상 이미 사라져 있다」 에 「현 구현 (닫힘 애니메이션 없음) 기준」 (React 배칭으로 속성이 남을 수 있다는 지적은 기각 — 변이 c 가 bubble 시점 속성 부재를 보였고, 차단은 속성이 아니라 `defaultPrevented` 라 결론과 무관).
- **기각** — 패널 내부 컨트롤 자체 Esc 불가 · 모달/패널 가드 프로토콜 이원화 · `defaultPrevented` 시맨틱 (패널 안에 Esc 를 쓰는 컨트롤이 없고 이원화는 축 4 에서 비교·채택한 결과, reviewer 가 모달 보호 무약화 확인) / 매 Tab DOM 순회 성능 (포커서블 수십 개 수준) / Popover API 전환 · 통합 overlay 스택 (범위 밖).
