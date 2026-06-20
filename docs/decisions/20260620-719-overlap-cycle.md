# ADR: 겹침 cycle — 같은 위치 반복 클릭 시 ray 상 뒤 body 순환 선택 — #719

- **상태**: **Provisional** (신규 ADR cross-validate 발동 대상 — 메인 오케스트레이터가 §교차검증 반영 사항 통합 후 Accepted 전이)
- **날짜**: 2026-06-20
- **결정자**: architect (#719 설계)
- **관련**:
  - [#719](https://github.com/coseo12/astro-simulator/issues/719) (본 이슈 — 겹침 cycle)
  - [`20260620-713-click-body-select.md`](20260620-713-click-body-select.md) (**선행 SSoT** — canvas 클릭 body 선택. 본 ADR 은 그 §4 재검토 트리거 2 의 superset 구현. 양방향 cross-link)
  - [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) (R6 — galilean 조밀 배치, occlusion cycle 동기의 출처)
  - [`20260609-624-satellite-pick-occlusion-no-op.md`](20260609-624-satellite-pick-occlusion-no-op.md) (#624 — 클릭 picking 부재 종결, 본 계열의 시발)
  - 확장 대상 순수 함수: `packages/core/src/scene/body-picking.ts` `resolvePickedBodyId`
  - pointer 핸들러: `apps/web/src/components/sim-canvas.tsx` `onPointerObservable` POINTERUP (라인 438~479)
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (기존 `resolvePickedBodyId` + `focusOn` 진입점 재사용, 신규 모듈 0) / "Concrete Prediction" (core store/카메라 변경 0 라인 예측 재현) / "DoD PASS ≠ 제품 동작" (UI 가드 도입 PR DoD 4축) / "주석 계약 vs 구현 drift" (cycle 상태 추적 위치 SSoT 박제).

---

## §1 배경

[#713](https://github.com/coseo12/astro-simulator/issues/713) 이 canvas 클릭 body 선택을 구현하면서 **occlusion 최전면 단일 선택**(`scene.pick` 의 ray 최근접 1개)을 채택하고, **겹침 cycle 은 명시적으로 비-범위**로 후속 분리했다. #713 ADR §4 재검토 트리거 2:

> occlusion cycle 요구 부상 → 후속 이슈(반복 클릭 순환) 진입 시 본 ADR `scene.pick` 결과의 N-depth 확장으로 superset 설계.

본 ADR 이 그 superset 이다. R6 ([`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md)) 이 galilean(io/europa/ganymede/callisto)을 jupiter 근처에 조밀 배치하면서, 시선 방향으로 일직선 겹침이 잦다. 현재 `resolvePickedBodyId` 는 `scene.pick`(최근접 1개)만 반환하므로, jupiter/galilean 이 겹쳐 보이는 화면 위치를 클릭하면 **최전면 body 만** 선택되고 ray 상 뒤쪽 body 는 선택 불가다.

본 ADR 은 `resolvePickedBodyId` 를 `scene.multiPick`(ray 상 전체 hit, 깊이순) 으로 N-depth 확장하여, **같은 화면 위치(임계 px 내) 반복 클릭 시 ray 상 다음(뒤) body 로 순환 선택**(wrap 포함)하는 설계를 결정한다.

### 범위 (사용자 확정 2026-06-20)

- **만든다**: ① 겹친 body 위치(임계 px 내) 반복 클릭 → ray 상 다음(뒤) body 순환 ② 마지막 body 도달 후 재클릭 → 첫 body 로 **wrap** ③ 다른 위치 클릭 → cycle 리셋 + 새 위치 최전면 선택 ④ 겹침 없으면 cycle no-op(같은 body 유지) ⑤ 모바일 터치 동일 cycle.
- **만들지 않는다 (비-범위, 사용자 확정)**:
  - **marker(화면거리 fallback) 의 cycle** — `scene.multiPick` 실 ray hit(sphere mesh) body 만 cycle. 작은 marker(`PICK_SCREEN_THRESHOLD_PX` 화면거리 fallback)는 **단일 선택 유지**. marker cycle 은 후속 분리.
  - **겹침 후보 시각 표시 UI** (선택지 리스트/하이라이트/뱃지).
  - **궤도선 클릭 선택** (#624 candidate C).

### 출발점 (현재 구현 실측 — 2026-06-20)

`packages/core/src/scene/body-picking.ts` `resolvePickedBodyId(scene, camera, x, y, opts): string | null`:

1. **1차** `scene.pick(x, y, predicate)` — predicate: 활성 LOD variant(`isVisible && isEnabled`) + `metadata.bodyId` 존재 + `isFocusable(id)`(allowlist). ray 최근접 1개 mesh → `pickedMesh.metadata.bodyId`.
2. **2차** 화면거리 fallback — 1차 miss 시 `Vector3.Project` 로 화면 투영 좌표가 `PICK_SCREEN_THRESHOLD_PX=12` 이내인 allowlist body 중 (화면거리 → 카메라 최근접) 1개.

web(`sim-canvas.tsx`) `onPointerObservable` POINTERUP 핸들러 (클로저 로컬 상태 `downX/downY/downPointerId/activePointers` 보유)가 드래그/멀티터치/click-through 가드 통과 후 `resolvePickedBodyId` 호출 → `instance.command({ type:'focusOn', bodyId })`. 핸들러 클로저는 `instance.start().then()` 내부에서 1회 등록되어 세션 동안 살아있다 — **cycle 상태(마지막 위치+인덱스)를 둘 자연스러운 그릇이 이미 존재**.

---

## §2 결정할 항목 (축별 후보 비교)

### 결정 1 — multiPick 확장 방식 (`scene.pick` 단일 → `scene.multiPick` 깊이순 + dedup)

| 후보                                                               | 장점                                                                                                                                           | 단점                                                                                                                                        |
| ------------------------------------------------------------------ | ---------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A) `scene.multiPick(x, y, predicate)` + bodyId dedup + 깊이순** | Babylon 표준 — predicate(#713 동일) 통과 mesh 의 ray hit 전체를 `distance` 오름차순 배열로 반환. depth 정렬 내장. 신규 geometry/raycast 코드 0 | 같은 bodyId 의 LOD variant(high/mid/low) 가 동시에 hit 될 수 있어 **dedup 필수**. LOD fade 전환 중(~200ms)엔 from/to 둘 다 `isVisible` 가능 |
| (B) 수동 ray + sphere 교차 계산                                    | dedup·정렬 완전 제어                                                                                                                           | Babylon raycast 재구현 — `scene.multiPick` 이 이미 제공하는 것을 중복. 유지비↑                                                              |
| (C) `scene.pick` 반복 + 직전 hit mesh `isPickable=false` 토글      | 기존 1-pick 재사용                                                                                                                             | mesh 상태를 매 클릭 mutation → 회귀면 큼, 정리 누락 시 영구 비픽킹. variant 전환 코드와 충돌                                                |

**채택: (A) `scene.multiPick` + bodyId dedup + 깊이순.** `scene.multiPick(x, y, predicate)` 는 ray 와 교차하는 모든 picked mesh 를 `PickingInfo[]` 로 반환(Babylon 내부 `distance` 오름차순). predicate 는 **#713 1차 predicate 와 동일** 재사용(활성 variant + metadata.bodyId + allowlist) — 코드 SSoT. 반환 배열을 `metadata.bodyId` 로 매핑 후 **첫 등장 순서 보존 dedup**(같은 bodyId 의 high/mid/low variant 중 ray 최근접 1개만 유지) → `string[]` 깊이순 후보 리스트. (B)는 Babylon 재구현, (C)는 mesh mutation 회귀 위험으로 기각.

> **dedup 규칙 (구현 인계)**: `multiPick` 결과를 `distance` 오름차순으로 순회하며 `bodyId` 가 이미 본 적 없으면 리스트에 push(첫 등장 = ray 최근접 variant). `Set<string>` seen 가드. LOD fade 전환 중 동일 bodyId 2 variant hit 도 dedup 으로 1회만 등장(무해). 결과 = **bodyId 깊이순 distinct 리스트** `string[]`.

### 결정 2 — cycle 상태 추적 위치 (web 핸들러 로컬 vs core 헬퍼 opts)

| 후보                                                                 | 장점                                                                                                                                                                                                                                   | 단점                                                                                                                                                                    |
| -------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) web `sim-canvas` POINTERUP 핸들러 클로저 로컬 상태**           | `downX/downY/activePointers` 등 클릭 세션 상태가 **이미 이 클로저 로컬**. cycle 상태(마지막 클릭 위치 + 마지막 선택 bodyId)도 동형 — 상태 소유 일관. **core 순수 함수는 stateless 유지**(#713 "core 순수 함수 + web wiring" 분리 정합) | web 레이어에 상태 1개 추가 (단, 기존 클로저 패턴 답습이라 신규 구조 0)                                                                                                  |
| (b) core `resolvePickedBodyId` opts 로 주입(이전 위치·인덱스 in/out) | 상태 흐름 명시                                                                                                                                                                                                                         | **순수 함수 오염** — out 파라미터 또는 반환 구조 변경(`string` → `{id, index}`)으로 #713 시그니처 깨짐. core 가 "마지막 클릭 위치"라는 web UX 개념을 알게 됨(책임 역전) |
| (c) sim-store / core 상태에 cycle 인덱스 박제                        | 전역 접근                                                                                                                                                                                                                              | **core/store 변경** — #713 Concrete Prediction(core 변경 0) 파괴. cycle 은 순전히 입력 레이어 UX 라 store 에 둘 이유 없음                                               |

**채택: (a) web `sim-canvas` POINTERUP 핸들러 클로저 로컬 상태.** cycle 상태(`lastClickX/lastClickY` + `cycleCandidates: string[]` + `cycleIndex: number` 또는 `lastSelectedBodyId`)는 클릭이라는 **입력 레이어의 UX 상태**이지 시뮬레이션 도메인 상태가 아니다. `downX/activePointers` 가 이미 같은 클로저에 사는 것과 동형. **core `resolvePickedBodyId` 는 stateless 유지** — 단, 깊이순 후보 리스트를 web 이 얻을 수 있도록 **새 순수 함수 `resolvePickedBodyIds`(복수형, `string[]` 반환)를 추가**하고 기존 단수형은 #713 무회귀 위해 보존(또는 단수형이 복수형을 호출해 `[0]` 반환하도록 위임 — 구현 재량, 단 #713 시그니처·동작 불변 의무). (b)는 순수 함수 오염, (c)는 store 변경으로 #713 예측 파괴.

> core 책임 = "화면 좌표 → 깊이순 bodyId 리스트"(stateless 변환). web 책임 = "같은 위치 판정 + 인덱스 추적 + wrap + focusOn 호출"(stateful UX). 책임 경계 #713 과 동일.

### 결정 3 — "같은 위치" 판정 임계 (cycle continue vs reset)

| 후보                                                                                                     | 장점                                                                                            | 단점                                                                                                                                                                              |
| -------------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(A) 직전 클릭 좌표와 화면거리 ≤ `PICK_CYCLE_SAME_POS_PX` 면 같은 위치 → cycle continue, 초과 → reset** | 명시 임계 상수 SSoT(매직넘버 금지). #713 `CLICK_DRAG_THRESHOLD_PX`(드래그 판정)와 **의미 구분** | 신규 상수 1개 (단, SSoT 박제로 관리)                                                                                                                                              |
| (B) `CLICK_DRAG_THRESHOLD_PX` 재사용                                                                     | 신규 상수 0                                                                                     | **의미 혼용** — 드래그 판정(down→up 이동, 마우스 5/터치 10)과 "같은 위치 재클릭"(별개 클릭 down 좌표 간 거리)은 다른 개념. 한 상수 변경이 두 동작 동시 변형(주석 계약 drift 위험) |

**채택: (A) 신규 상수 `PICK_CYCLE_SAME_POS_PX` SSoT.** "직전 클릭과 같은 위치인가"는 **드래그 판정과 다른 의미축**이므로 상수를 분리한다(#713 `CLICK_DRAG_THRESHOLD_PX`/`CLICK_DRAG_THRESHOLD_PX_TOUCH` 와 병렬). 직전 클릭 좌표(`lastClickX/Y`)와 현재 클릭 좌표의 화면거리(engine px)가 `PICK_CYCLE_SAME_POS_PX` 이내면 같은 위치 → cycle continue, 초과면 reset(새 위치 최전면). (B)의 상수 재사용은 의미 혼용 + drift 위험으로 기각.

> **measurement-first 의무**: developer 는 `PICK_CYCLE_SAME_POS_PX` 를 가설로 박지 말고, 같은 body 를 의도적으로 연타할 때의 **마우스/터치 실 좌표 흔들림**을 실측(`scripts/_debug-719-*-tmp.mjs`, 사용 후 rm)해 확정한다. 후보: marker fallback 임계(12px)와 동급 또는 터치 jitter(~10px)보다 약간 큰 ~12–16px. 너무 작으면 손 흔들림에 cycle 끊김(reset 오발), 너무 크면 의도적 다른 body 클릭이 cycle 로 오인. 실측값을 회귀 가드(`body-picking` 또는 web 핸들러 단위 테스트 경계)에 박제. 단수/복수 임계 분리 여부(마우스 vs 터치)도 실측 후 판단 — 분리 필요 시 `PICK_CYCLE_SAME_POS_PX_TOUCH` 추가.

### 결정 4 — cycle 다음 선택 로직 (인덱스 카운터 vs 직전 bodyId 기준)

같은 위치 N번째 클릭 시 깊이순 후보 리스트 `cands: string[]` 에서 다음 선택을 결정한다. body 는 공전/LOD 변화로 **프레임마다 hit 리스트 구성·순서가 바뀔 수 있다**(같은 위치라도). 안정성이 핵심.

| 후보                                                                         | 장점                                                                                                                                                                                            | 단점                                                                                                                                         |
| ---------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) 순수 인덱스 카운터 `(idx+1) % len` (리스트 재계산 무시)                  | 단순                                                                                                                                                                                            | **리스트가 프레임마다 바뀌면 인덱스가 다른 body 를 가리킴**. galilean 공전으로 hit 순서 변동 시 카운터가 무의미 — 같은 body 반복 또는 건너뜀 |
| **(b) 직전 선택 bodyId 의 현재 리스트 내 위치 +1 (wrap), 직전 id 부재 시 0** | hit 리스트가 매 클릭 재계산돼도 **직전 선택을 현재 리스트에서 찾아 그 다음**으로 → 리스트 재구성에 견고. 직전 id 가 리스트에서 사라졌으면(가려짐 해소/공전 이탈) 최전면(index 0) 으로 안전 복귀 | 직전 id 가 현재 리스트에 없을 때의 fallback 규칙 1개 필요(= index 0)                                                                         |

**채택: (b) 직전 선택 bodyId 기준 다음(wrap).** 매 클릭 `cands = resolvePickedBodyIds(...)` 를 재계산하고, **직전 선택 bodyId 를 현재 `cands` 에서 `indexOf`** → 찾으면 `cands[(found+1) % cands.length]`(wrap), 못 찾으면(또는 같은 위치 첫 클릭) `cands[0]`(최전면). 인덱스 카운터(a)는 hit 리스트가 프레임마다 변동(공전/LOD)할 때 깨지므로 기각. (b)는 "직전 선택을 앵커로 다음" 이라 리스트 재구성에 견고하고, wrap(완료 기준 2)·리셋(완료 기준 3)·단일 no-op(완료 기준 4, len=1 이면 `(0+1)%1=0` 으로 같은 body 유지)이 자연 도출.

> **상태 최소화**: web 핸들러는 `lastClickX/Y`(같은 위치 판정용) + `lastSelectedBodyId`(다음 앵커용) 2개만 보유하면 충분. `cands` 배열·인덱스를 세션 보존할 필요 없음(매 클릭 재계산 + 직전 id 앵커). 다른 위치 클릭(reset) 시 `lastSelectedBodyId` 는 새 위치 `cands[0]` 로 갱신.

### 결정 5 — marker fallback 정합 (multiPick hit 0 → 단일 선택, cycle 없음)

- `scene.multiPick` 결과 dedup 후 `cands.length === 0`(빈 우주 또는 작은 marker 직격 miss) → **기존 화면거리 fallback 단일 선택**(`resolvePickedBodyId` 2차 경로) 그대로. cycle 없음(완료 기준: marker 비-범위).
- `cands.length >= 1` → cycle 경로. `length === 1`(겹침 없음)이면 결정 4 로직상 같은 body 유지(no-op) → #713 단일 클릭과 **동작 동일**.
- **두 경로 결합 안전성**: web 핸들러는 ① 먼저 `resolvePickedBodyIds` 로 ray hit 리스트 시도 → `length>=1` 이면 cycle 분기 ② `length===0` 이면 `resolvePickedBodyId` 단일 fallback(또는 복수형이 내부에서 fallback 까지 수행하고 빈 ray hit 시 fallback bodyId 를 length-1 리스트로 반환 — 구현 재량, 단 **fallback 선택은 cycle 인덱스에서 제외**해 marker 연타가 순환 안 되게). marker 연타 시 `lastSelectedBodyId` 가 그 marker 로 고정돼도 `cands.length===1`(단일) 이라 같은 body 유지(무해).

> **핵심 불변식**: cycle 은 `scene.multiPick` **실 ray hit(sphere mesh) 가 2개 이상**일 때만 의미 있는 순환을 한다. ray hit ≤ 1 이면 단일 선택(#713 동작). marker fallback 은 cycle 후보 리스트에 들어가지 않는다(사용자 확정 비-범위).

### 결정 6 — #713 무회귀 보장 (단일 클릭 경로 불변)

- **겹침 없음 = 단일과 동일**: `scene.multiPick` 결과 dedup 후 `length===1` 이면 `cands[0]` = `scene.pick` 최근접과 동일 body → #713 단일 클릭과 결과 동일.
- **드래그/멀티터치/click-through/free-fly/빈 우주 가드 전부 유지**: 본 ADR 은 POINTERUP 핸들러의 **bodyId 해석부만** 단일→cycle 확장. 그 앞단 가드(드래그 임계, `activePointers.size===1`, `isCanvasEvent`, free-fly 자동 해제는 `focusOn` 진입점이 담당)는 손대지 않는다.
- **`focusOn` 진입점 재사용**: cycle 이 선택한 bodyId 도 동일하게 `instance.command({ type:'focusOn', bodyId })` 호출 → store sync·카메라·free-fly 해제 자동. core/store 변경 0.
- **단수형 시그니처 보존**: `resolvePickedBodyId`(단수) 의 시그니처·동작 불변(복수형 신설). #713 `body-picking.test.ts` 기존 케이스 전부 PASS 유지 의무.

### 결정 7 — 회귀 가드 설계 (UI 가드 도입 PR DoD 4축)

- **단위 테스트** (`packages/core` `body-picking.test.ts` 확장): (1) `resolvePickedBodyIds` 가 multiPick 결과를 깊이순 정렬 (2) 같은 bodyId variant(high/mid/low) dedup → 1회 등장 (3) 직전 id 기준 다음 선택 + wrap(마지막→첫) (4) 직전 id 가 현재 리스트 부재 시 index 0 복귀 (5) ray hit 0 시 화면거리 fallback 단일(cycle 없음) (6) ray hit 1 시 단일 유지(#713 동작 불변). web 핸들러 "같은 위치 판정 + reset"은 web 단위(가능하면) 또는 browser-verify 로.
- **browser-verify 확장** `scripts/browser-verify-click-select.mjs`(#713 기존 파일 확장 — 신규 파일 불요): (i) jupiter+galilean 겹침 위치 반복 클릭 → `selectedBodyId` 가 깊이순 다음 body 로 순환 (ii) 마지막 body 후 재클릭 → 첫 body wrap (iii) 다른 위치 클릭 → cycle 리셋 + 최전면 (iv) 겹침 없는 단일 body 반복 클릭 → 같은 body 유지 (v) #713 기존 시나리오(단일 클릭/위성/빈 우주/free-fly) 전부 무회귀.
- **UI 가드 도입 PR DoD 4축** ([guard-pr-dod.md](../lessons/guard-pr-dod.md)): (1) 격리 동적 테스트 (2) 3중 시뮬 positive(겹침 연타→순환)→negative(다른 위치→reset 최전면 / 겹침 없음→no-op)→recovery (3) 5 페르소나 self-consistency(해당 없으면 N/A 명시) (4) 메타 측정 안정성. **real Chrome GUI 수동 검증 1회**(headless WebGPU false-positive 회피, [headless-browser-verification.md](../lessons/headless-browser-verification.md)) — galilean 겹침은 시각 확인 필수.

---

## §3 결정 요약

| #   | 항목                 | 채택                                                                                                                                            |
| --- | -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| 1   | multiPick 확장       | **`scene.multiPick` + bodyId dedup(첫 등장=ray 최근접) + 깊이순** → `string[]` 후보 리스트 (predicate #713 재사용)                              |
| 2   | cycle 상태 위치      | **web `sim-canvas` POINTERUP 핸들러 클로저 로컬** (`lastClickX/Y` + `lastSelectedBodyId`). core 는 stateless 복수형 `resolvePickedBodyIds` 추가 |
| 3   | "같은 위치" 판정     | **신규 상수 `PICK_CYCLE_SAME_POS_PX` SSoT** (드래그 임계와 의미 분리). 직전 클릭과 ≤ 임계면 continue, 초과면 reset. measurement-first 실측      |
| 4   | 다음 선택 로직       | **직전 선택 bodyId 의 현재 리스트 위치 +1 (wrap)**, 부재 시 index 0 (리스트 프레임 변동에 견고)                                                 |
| 5   | marker fallback 정합 | ray hit 0 → 화면거리 fallback 단일(cycle 없음). hit≥1 만 cycle. fallback bodyId 는 cycle 후보 제외                                              |
| 6   | #713 무회귀          | 겹침 없음(len 1) = 단일 동일. 가드(드래그/멀티터치/click-through/free-fly/빈 우주) 전부 유지. 단수 시그니처 보존                                |
| 7   | 회귀 가드            | 단위(dedup/깊이순/wrap/부재복귀/fallback/단일) + `browser-verify-click-select.mjs` 확장 + DoD 4축 + real Chrome 1회                             |

### 핵심 데이터 흐름 (구현 인계)

```
사용자 클릭/탭 (canvas)
  → scene.onPointerObservable(POINTERUP)
  → 가드: activePointers.size===1 / isCanvasEvent / 드래그 임계 (#713 그대로)
  → cands = resolvePickedBodyIds(scene, camera, x, y, opts)   // multiPick 깊이순 dedup string[]
  ├─ cands.length === 0:  // 빈 우주 or marker 직격 miss
  │    → resolvePickedBodyId 단일 fallback (화면거리)  → bodyId or null (cycle 없음)
  └─ cands.length >= 1:   // ray hit (sphere) — cycle 경로
       → samePos = dist(현재, lastClick) <= PICK_CYCLE_SAME_POS_PX
       → next = (samePos && lastSelectedBodyId in cands)
                  ? cands[(indexOf(lastSelectedBodyId)+1) % cands.length]   // 다음 (wrap)
                  : cands[0]                                                 // 최전면 (reset / 첫클릭)
       → lastClick = 현재좌표 ; lastSelectedBodyId = next
  → bodyId 있으면 instance.command({ type:'focusOn', bodyId })   // #713 기존 진입점 — store/카메라/free-fly 자동
  → bodyId 없으면 no-op (콘솔 오류 0)
```

`resolvePickedBodyIds` = `packages/core/src/scene/body-picking.ts` 신설 순수 함수(stateless). 단수형 `resolvePickedBodyId` 는 보존(#713 무회귀) — 복수형 첫 원소 + fallback 위임으로 재구현하거나 그대로 둠(구현 재량, 단 #713 시그니처·동작 불변). web `sim-canvas` 는 cycle 상태 2개 + 같은 위치 판정 + wrap 로직만 추가.

---

## §4 결과 / 재검토 조건

- **성공 기준**: §정제 DoD 7항 전부 PASS. 특히 DoD-1/2(겹침 연타 순환 + wrap)로 jupiter 뒤 galilean 의 클릭 선택 가능 — #713 단일 선택의 occlusion 한계 해소.
- **트레이드오프로 받아들인 비용**: `scene.pick`(1 ray, O(meshes)) → `scene.multiPick`(같은 1 ray, 전체 hit 수집 + dedup O(hits)). 클릭 시점에만 1회 — fps 무관(매 프레임 아님). cycle 상태 2개 web 보유(입력 레이어 한정, store 무관).
- **재검토 트리거**:
  1. `PICK_CYCLE_SAME_POS_PX` 가 실 사용 흔들림과 mismatch → cycle 끊김(reset 오발) 또는 다른 body 오인 → 실측 재조정(measurement-first, ADR Amendment).
  2. **marker(작은 body) 겹침 cycle 요구 부상** → 현재 비-범위(화면거리 fallback 단일). 후속 이슈 진입 시 fallback 후보를 깊이순 리스트에 합류시키는 superset(본 ADR `cands` 에 fallback 후보 append + 카메라 깊이 정렬) 으로 확장.
  3. **겹침 후보 시각 표시 UI 요구**(현재 cycle 은 "어디까지 순환했는지" 시각 피드백 없음) → 후속 이슈(선택지 리스트/하이라이트). 본 ADR `cands` 리스트가 그 UI 의 데이터 소스가 됨.
  4. `scene.multiPick` 이 신규 mesh 유형(ring arcs / 라벨 mesh)을 잘못 hit → predicate allowlist 명시 확장(#713 §4 트리거 3 정합).

### Concrete Prediction (data-not-code / #713 정합)

- **본 feature 구현 시**: `simulation-core.ts` / `sim-store.ts` / `core-adapter` 코드 변경 **0 줄** 예측 — cycle 은 (1) core scene 순수 함수 추가(`body-picking.ts` 복수형) + (2) web pointer wiring(`sim-canvas.tsx` cycle 상태·로직)만. focusOn 진입점·store·카메라 sync 재사용.
  - **검증 방법**: 구현 PR 에서 `git diff --stat packages/core/src/engine/simulation-core.ts packages/core/src/store/sim-store.ts apps/web/src/adapters/` (또는 해당 core-adapter 경로) — 변경 0 라인이면 예측 성공.
  - **실패 시 대응**: cycle 이 store/카메라 변경을 요구하면 → (a) 입력 레이어로 재배치 가능한지 재검토 (b) 불가피하면 ADR Amendment 로 예측 실패 박제 + 근거.
- **변경 예상 파일** (≤ 2): `packages/core/src/scene/body-picking.ts`(복수형 추가 + 단수형 보존), `apps/web/src/components/sim-canvas.tsx`(cycle 상태 + 로직). 테스트: `body-picking.test.ts` 확장, `scripts/browser-verify-click-select.mjs` 확장.

---

## §교차검증 반영 사항

> **상태 Provisional 유지** — cross-validate(agy) 1차 시도(2026-06-20, `cross-validate-architecture-20260620-152659`)에서 **agy 가 빈 응답(비-capacity fatal-error, exit 1)으로 실패** → `claude-only analysis completed — 단일 모델 편향 노출 미확보`. 외부 모델 두 번째 시각을 확보하지 못했으므로 본 ADR 은 **Provisional 로 유지**한다. 메인 오케스트레이터가 agy 복구 후 cross-validate 를 재시도하고, 4+1축(합의 / 이견 수용 / Claude 재분석 기각 / 고유 발견 후속분리 / Claude 편향 셀프 체크)으로 통합한 뒤 §상태를 **Accepted (cross-validate YYYY-MM-DD)** 로 전이한다.

### Claude 단독 분석 (agy 미확보 — 단일 모델, 편향 노출 미달)

agy 미응답으로 외부 시각이 없으므로, architect 가 셀프 체크에서 식별한 **결합 간과 미통과 축**을 단독으로 추가 점검한 결과만 박제(외부 합의/이견 항목 없음):

- **cycle 상태(web 클로저) ↔ multiPick hit 리스트 프레임 변동 결합** — 결정 4(직전 id 앵커 + index 0 fallback)가 1차 방어. 추가 사각: 직전 선택 body 가 **공전으로 ray 에서 완전 이탈**하면 `indexOf` 부재 → `cands[0]`(최전면) 복귀. 사용자 체감상 "연타했는데 최전면으로 점프"가 가능하나, body 가 이미 ray 이탈한 상황이라 cycle 의미 자체가 소멸한 정상 동작(무해). developer 가 browser-verify (iv) 겹침 단일 유지 케이스에서 LOD fade 구간(~200ms) 연타도 1회 포함 권고.
- **모바일 터치 jitter ↔ `PICK_CYCLE_SAME_POS_PX` 결합** — 터치 연타는 좌표 흔들림(~8–10px)이 커 `PICK_CYCLE_SAME_POS_PX` 가 너무 작으면 reset 오발(cycle 끊김). 결정 3 measurement-first 에서 **터치 jitter 보다 약간 큰 ~12–16px 후보** 박제 + 필요 시 `PICK_CYCLE_SAME_POS_PX_TOUCH` 분리 명시 — 결합 위험 사전 흡수.
- **Concrete Prediction 보장성** — cycle 상태를 web 클로저에 둠으로써(결정 2) core/store/카메라 미접촉 → `git diff --stat` 검증 경로(§4)로 실측 가능. 단일 모델 분석이라 외부 반증 없음 — developer 구현 후 실측이 최종 가드.

> agy 복구 후 본 단락은 외부 모델 4+1축 통합으로 대체된다. 현 상태는 **단일 모델 편향 노출 미확보**임을 명시.
