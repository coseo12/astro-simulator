# ADR: canvas 클릭/터치로 body 선택 (raycast picking) — #713

- **상태**: **Accepted** (cross-validate 2026-06-20 agy 통합 — §교차검증 반영 사항 4+1축 박제 완료)
- **날짜**: 2026-06-20
- **결정자**: architect (#713 설계)
- **관련**:
  - [#713](https://github.com/coseo12/astro-simulator/issues/713) (본 이슈 — canvas 클릭 body 선택)
  - [`20260609-624-satellite-pick-occlusion-no-op.md`](20260609-624-satellite-pick-occlusion-no-op.md) (#624 — "클릭 picking 자체가 코드에 부재 → 신규 feature 분리" 종결, §4 본 feature 인계 박제)
  - [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) (R6 — galilean 조밀 배치, occlusion 최전면 선택 동기)
  - [`20260613-675-glow-pixel-marker.md`](20260613-675-glow-pixel-marker.md) (#675 — glow marker visual scale 확대, picking geometry 미확대 난점의 출처)
  - [`20260504-r-phase-allowlist-guard.md`](20260504-r-phase-allowlist-guard.md) (#402 — `isRPhaseFocusable` 가드, 클릭 경로도 재사용)
  - [`20260425-r1-store-scene-sync-unification.md`](20260425-r1-store-scene-sync-unification.md) (R1 — `focusOn` event-only store sync 단일 진입점)
  - 공통 진입점: `packages/core/src/engine/simulation-core.ts` `case 'focusOn'` (라인 229~)
  - pointer 등록: `apps/web/src/components/sim-canvas.tsx` `instance.start().then()` 내부
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (기존 `focusOn` 진입점·`isRPhaseFocusable` 가드 재사용) / "measurement-first" (작은 body picking 영역은 가설이 아닌 DoD-3 4.5px 실측으로 검증) / "DoD PASS ≠ 제품 동작" (UI 가드 도입 PR DoD 4축).

---

## §1 배경

로드맵 v3 R1~R10 완주로 27개 body 시각화 완료. 그러나 body 선택 경로는 **shortcut bar / URL(`?focus=`) / programmatic command** 3개뿐이다. 위성(galilean/titan/titania/triton 등)은 `showInShortcutBar=false` (#617) 라 **URL `?focus=io` 타이핑이 유일 경로 = discoverability gap** — 사실상 일반 사용자에게 은폐. #624 NO-OP ADR 이 "canvas 클릭 picking 자체가 코드에 부재" 를 전수 grep 으로 확인하고 본 feature 로 분리 종결했다.

본 ADR 은 canvas에서 body/위성을 **마우스 클릭/터치로 직접 선택**해 focus 전환하는 설계를 결정한다. 핵심 제약: 기존 공통 진입점([focus / focusOn](../glossary.md#focus--focuson--detachfocus--clearfocus) `sendCommand({ type:'focusOn', bodyId })` → `isRPhaseFocusable` 가드 → `bodySelected` emit → `setSelectedBody`)을 재사용하여 store sync · 카메라 전환 · free-fly 해제를 **자동** 으로 얻는다. 클릭 경로는 "mesh → bodyId 역변환 + 동일 진입점 호출" 만 추가한다.

### 범위 (사용자 확정 2026-06-20)

- **만든다**: 최전면 body 단일 클릭/터치 선택 (occlusion 시 카메라에 가장 가까운 body), 위성 클릭, glow marker 발동 작은 body 클릭.
- **만들지 않는다 (비-범위)**: 겹침 cycle/multi-pick (반복 클릭 순환) → 후속 분리 / 궤도선 클릭 선택 (#624 candidate C) / 드래그·박스 다중 선택.

### Explore 검증 코드 사실 (출발점)

- `command()` `case 'focusOn'` (`simulation-core.ts:229~`) — `isRPhaseFocusable(bodyId)` 가드 통과 시 `emit('bodySelected', {id})`. `bodyId===null` 은 가드 우회 (resetCamera). 클릭은 이 진입점만 호출하면 store sync·카메라·free-fly 해제 전부 자동.
- `meshes: Map<string, Mesh>` (`solar-system-scene.ts:434, 466`) — **역방향(mesh→bodyId) 헬퍼 없음**.
- LOD variant 3종: high(sphere 32seg) = transform owner + 항상 `setEnabled(true)`, mid(12seg sphere) / low(BILLBOARDMODE_ALL quad) = `parent=highMesh`, 비활성 variant 는 `isVisible=false` 로만 숨김 (`setEnabled(false)` 금지 — parent-child 전파). `meshes.get(id)` = high variant. mid/low 는 `midVariants`/`lowVariants` Map.
- glow marker (`glow-marker.ts`) — low quad 의 `scaling` 을 화면 고정 px(parent 4.5 / satellite 2.25)로 역보정해 **visual** 확대. picking geometry(quad 실 크기)는 미확대 → 작은 body 클릭 난점.
- `setSelectedBody(id)` (`sim-store.ts:217~219`) — `{ selectedBodyId: id, freeFlyMode: false }` 단일 set. free-fly 중 클릭해도 freeFlyMode 자동 false.

---

## §2 결정할 항목 (축별 후보 비교)

### 결정 1 — mesh → bodyId 역매핑 방식

| 후보                                | 장점                                                                                                                                                                        | 단점                                                                                                                            |
| ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------- |
| **(A) `mesh.metadata.bodyId` 박제** | mesh 가 자기 정체성 보유 — pick 결과(`pickedMesh`)에서 O(1) 직접 읽기. LOD variant(mid/low) 각각에 박제하면 어떤 variant 가 picked 돼도 동일 id. Babylon 표준 metadata 슬롯 | metadata 가 다른 용도(`scene.metadata.__lodBillboardAlphaMask` 등)와 혼용 — 단, mesh 단위 metadata 는 현재 미사용이라 충돌 없음 |
| (B) 역Map `Map<Mesh, string>` 신규  | metadata 비오염                                                                                                                                                             | 신규 상태 추가 — mid/low lazy-create 시점마다 등록 필요, dispose 시 정리 의무. SSoT 가 `meshes` Map 과 이원화                   |
| (C) pick 시 `meshes` 순회 비교      | 신규 상태 0                                                                                                                                                                 | O(N) 순회 — pick 마다 27+ body. mid/low variant 는 `meshes` 에 없어 매칭 실패                                                   |

**채택: (A) `mesh.metadata.bodyId`.** high/mid/low variant 생성 시점(`createBodyMesh`/`getVariantMesh`)에 `mesh.metadata = { ...mesh.metadata, bodyId: body.id }` 박제. pick 결과의 어떤 variant 든 O(1) 역변환. (B)는 dispose 정리 의무·이원 SSoT 부담, (C)는 mid/low 미커버 + O(N). metadata 박제는 mesh 라이프사이클(생성/dispose)과 동일 주기라 누수 없음.

### 결정 2 — 작은 body/위성 picking 영역 확대 (DoD-3: 마커 ~4.5px 클릭)

| 후보                                               | 장점                                                                                                                                                                                              | 단점                                                                                                                                              |
| -------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| (a) glow active 시 picking collider 별도 확대      | 정밀 — 마커 visual 크기와 hit 영역 일치                                                                                                                                                           | 신규 mesh/collider 추가 — glow 토글마다 enable/dispose, fps 영향, LOD fade 와 상호작용 복잡                                                       |
| **(b) `scene.pick` predicate + 화면거리 fallback** | 신규 geometry 0. 1차 정확 `scene.pick` (sphere mesh 직격) → miss 시 클릭 좌표에서 화면상 가장 가까운 allowlist body 가 `PICK_SCREEN_THRESHOLD_PX`(기본 ~12px, ≥ 마커 4.5px 반경 여유) 이내면 선택 | fallback 은 z-order 무시 — 단, 작은 marker 끼리 12px 내 동시 존재는 드물고, MVP 는 최전면 정책상 fallback 후보 중 카메라 최근접 1개 선택으로 일관 |
| (c) invisible picking proxy sphere                 | hit 영역 명시적                                                                                                                                                                                   | body 27+ × proxy = 메모리/씬 복잡, proxy 위치 동기화 매 프레임, 정상 sphere 와 중복 pick                                                          |

**채택: (b) `scene.pick` predicate 1차 + 화면거리 fallback 2차.** 큰 body 는 1차 `scene.pick`(predicate 로 활성 pickable variant 만) 이 정확 직격. 작은/marker body 는 mesh 실 px 가 4px 미만이라 직격 확률 낮으므로, miss 시 화면 투영 좌표(`Vector3.Project`) 기준 클릭점에서 임계 px 이내 allowlist body 중 **카메라 최근접 1개** 선택. 임계값은 상수 `PICK_SCREEN_THRESHOLD_PX` SSoT(매직넘버 금지). (a)/(c)의 신규 geometry 부담 회피 + DoD-3 충족.

> measurement-first 의무: developer 는 임계값을 가설로 박지 말고 R6 galilean/R10 dwarf marker 실 px 를 측정해 4.5px 마커가 임계 내 들어오는지 실측 후 확정. 측정 결과를 회귀 가드에 박제.

### 결정 3 — occlusion 최전면 선택 + pickable predicate

- `scene.pick` 기본이 ray 상 **가장 가까운** `pickedMesh` 반환 → jupiter 앞 galilean 겹침 시 최전면 자동 (MVP cycle 비범위와 정합).
- **predicate 필수** — pick 대상 제한: (1) 활성 LOD variant 만 (`isVisible && isEnabled` — 숨은 high/mid/low variant 픽킹 방지), (2) `mesh.metadata.bodyId` 존재 + `isRPhaseFocusable(id)` true (궤도선/ring/배경 mesh 제외).
- `isPickable` 정합: 비활성 variant 는 `isVisible=false` 이나 Babylon `scene.pick` 은 기본 `isVisible=false` mesh 도 pickable 일 수 있으므로 **predicate 에서 `isVisible` 명시 체크**(또는 variant 전환 시 활성만 `isPickable=true`). predicate 방식 채택 — variant 전환 코드(showVariantEntirely/hideVariantEntirely)를 건드리지 않아 회귀면 작다.

### 결정 4 — pointer 이벤트 처리 (드래그 vs 클릭 구분)

| 축           | 결정                                                                                                                                                                                                                                                |
| ------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 이벤트 타입  | `scene.onPointerObservable` 의 `POINTERUP`. pointer**down 좌표 기록 → up 좌표와 이동 px** 비교로 드래그/탭 구분. `POINTERTAP` 은 Babylon 내장 임계가 있으나 화면 회전(ArcRotateCamera 드래그)과의 임계 px 제어가 어려워 down/up 좌표 직접 비교 채택 |
| 드래그 구분  | down→up 이동 `≤ CLICK_DRAG_THRESHOLD_PX`(기본 ~5px) 면 클릭, 초과면 카메라 회전으로 간주 no-op. 상수 SSoT                                                                                                                                           |
| 터치         | `onPointerObservable` 이 마우스/터치 통합 처리 (Babylon pointer 추상화) — 추가 코드 최소. 모바일 터치 = 범위 포함                                                                                                                                   |
| 빈 우주 클릭 | pick miss + fallback miss → no-op (reset 아님, 콘솔 오류 0). `setSelectedBody(null)` 호출하지 않음                                                                                                                                                  |

> **cross-validate 보강 (agy 2026-06-20)** — 결정 4 에 4개 가드 추가:
>
> - **멀티터치 가드**: 활성 포인터 = 1 일 때만 클릭 연산 개시 — 핀치줌/2-finger 회전 중 한 손가락 먼저 떼며 발생하는 `POINTERUP` 오선택 방지 (모바일 범위 직결).
> - **click-through 가드**: pointer 이벤트가 canvas 직접 발생인지 확인 — UI 오버레이(shortcut bar/상태창/모달) 위 클릭/탭이 배경 천체로 전파돼 오선택되지 않게. `onPointerObservable` 은 canvas 바인딩이나 `pointer-events` 설정 차이 대비 명시 가드.
> - **터치 jitter 임계 분리**: 터치는 탭에도 미세 좌표 이동 → `CLICK_DRAG_THRESHOLD_PX` 를 마우스/터치 분리 (터치 ~8–10px). 단순 탭이 드래그로 오판정돼 no-op 되는 것 방지.
> - **좌표계**: `scene.pick` / `Vector3.Project` 는 **engine 내부 px** 기준 — `scene.pointerX/pointerY` 사용(또는 DPR 보정). 브라우저 CSS px 직접 전달 금지 (#623 `adaptToDeviceRatio:true` 정합).

### 결정 5 — `isRPhaseFocusable` 가드 재사용 위치

- 최종 안전망은 `simulation-core.ts` `case 'focusOn'` 가 이미 `isRPhaseFocusable` 으로 비-allowlist 거부 → 클릭 경로도 동일 진입점이라 **자동 적용**.
- 추가로 클릭 단계(predicate)에서 **조기 필터** — predicate 가 `isRPhaseFocusable(id)` 통과 mesh 만 pick 후보로 둔다. 이유: 비-allowlist mesh 가 pick 돼 `sendCommand` 까지 갔다가 core 에서 `console.warn` 거부되면 사용자에게 "클릭했는데 warn" 노이즈. 조기 필터로 클릭 자체를 no-op 화 (warn 0). **이중 방어** (defense-in-depth) — 둘 다 유지.

### 결정 6 — 회귀 가드 설계 (UI 가드 도입 PR DoD 4축)

- **단위 테스트** (`packages/core` + `apps/web`): (1) `mesh.metadata.bodyId` 박제 정확성 (high/mid/low 동일 id) (2) pick predicate 가 비-allowlist/숨은 variant 제외 (3) 화면거리 fallback 이 최근접 1개 선택 (4) 드래그 임계 초과 시 no-op.
- **browser-verify 스크립트** `scripts/browser-verify-click-select.mjs` (기존 `browser-verify-*.mjs` 패턴): (i) 큰 body(earth) 클릭 → `selectedBodyId` 갱신 + 카메라 추적 (ii) 위성(io) 클릭 → focus (iii) glow marker body 클릭 → focus (iv) 빈 우주 클릭 → `selectedBodyId` 불변 + 콘솔 오류 0 (v) free-fly 진입 후 클릭 → `freeFlyMode` false 전환.
- **UI 가드 도입 PR DoD 4축** ([guard-pr-dod.md](../lessons/guard-pr-dod.md)): (1) 격리 동적 테스트 (2) 3중 시뮬 positive(클릭→선택)→negative(빈 우주/비-allowlist→no-op exit1)→recovery (3) 5 페르소나 self-consistency (해당 없으면 N/A 명시) (4) 메타 측정 안정성. real Chrome GUI 수동 검증 1회 (headless WebGPU false-positive 회피, [headless-browser-verification.md](../lessons/headless-browser-verification.md)).

---

## §3 결정 요약

| #   | 항목                   | 채택                                                                                                             |
| --- | ---------------------- | ---------------------------------------------------------------------------------------------------------------- |
| 1   | mesh→bodyId 역매핑     | **`mesh.metadata.bodyId`** (high/mid/low 전 variant 박제, O(1))                                                  |
| 2   | 작은 body picking 확대 | **`scene.pick` predicate 1차 + 화면거리 fallback 2차** (임계 `PICK_SCREEN_THRESHOLD_PX`, 신규 geometry 0)        |
| 3   | occlusion 최전면       | `scene.pick` 기본 최근접 + **predicate**(활성 variant only / allowlist only)                                     |
| 4   | pointer 처리           | `onPointerObservable` `POINTERUP` + down/up 이동 `≤ CLICK_DRAG_THRESHOLD_PX` 클릭 판정, 터치 통합, 빈 우주 no-op |
| 5   | allowlist 가드         | core `focusOn` 자동 적용 + 클릭 predicate **조기 필터** (이중 방어, warn 0)                                      |
| 6   | 회귀 가드              | 단위(metadata/predicate/fallback/드래그) + `browser-verify-click-select.mjs` + DoD 4축                           |

### 핵심 데이터 흐름 (구현 인계)

```
사용자 클릭/탭 (canvas)
  → scene.onPointerObservable(POINTERUP)
  → 드래그 판정 (down/up 이동 ≤ CLICK_DRAG_THRESHOLD_PX)
  → scene.pick(x, y, predicate)              // predicate: 활성 variant + allowlist + metadata.bodyId
  → hit? mesh.metadata.bodyId : 화면거리 fallback (PICK_SCREEN_THRESHOLD_PX 내 최근접)
  → bodyId 있으면 sendCommand({ type:'focusOn', bodyId })   // 기존 진입점
       → isRPhaseFocusable 가드 (core) → emit('bodySelected') → setSelectedBody(id, freeFlyMode:false)
       → sim-canvas subscribe syncFocusToScene (카메라/tier/free-fly 해제 자동)
  → bodyId 없으면 no-op (콘솔 오류 0)
```

신규 picking 헬퍼는 **core scene 의 순수 함수**(예: `packages/core/src/scene/body-picking.ts` — `resolvePickedBodyId(scene, camera, x, y, opts): string | null`)로 분리해 단위 테스트 + SSoT 화 권장 (glow-marker.ts 순수 함수 선례). web 레이어(sim-canvas)는 pointer observable 등록 + `sendCommand` 호출만.

---

## §4 결과 / 재검토 조건

- **성공 기준**: §정제 DoD 7항 전부 PASS. 특히 DoD-2(위성 클릭) 로 discoverability gap 해소 — URL-only 였던 galilean/위성을 클릭으로 진입 가능.
- **재검토 트리거**:
  1. 화면거리 fallback 의 임계 px 가 dwarf/comet marker 실 px 와 mismatch → 작은 body 클릭 실패 시 임계 재측정·재조정 (measurement-first, ADR Amendment).
  2. occlusion cycle 요구 부상 → 후속 이슈(반복 클릭 순환) 진입 시 본 ADR `scene.pick` 결과의 N-depth 확장으로 superset 설계. **→ [#719](https://github.com/coseo12/astro-simulator/issues/719) 로 분리·진입 (ADR [`20260620-719-overlap-cycle.md`](20260620-719-overlap-cycle.md), `scene.multiPick` 깊이순 확장 superset).**
  3. predicate 가 신규 mesh 유형(ring arcs / 향후 라벨 mesh)을 잘못 pick → predicate allowlist 명시 확장.
- **Concrete Prediction** (data-not-code 정합): 본 feature 는 web 레이어 pointer wiring + core 순수 picking 헬퍼만 추가 — 기존 `focusOn`/store/카메라 sync 코드 **변경 0 라인** 예측. 구현 후 `git diff --stat` 으로 simulation-core.ts / sim-store.ts / core-adapter 변경 0 재현.

---

## §교차검증 반영 사항 (cross-validate 2026-06-20 agy outcome=applied)

agy 가 본 설계를 "코어 비즈니스 로직 변형 0 라인 + 화면거리 폴백으로 작은 marker 클릭 문제 극복 — 매우 뛰어나고 안정적인 아키텍처" 로 Accepted 지지. 6개 발견을 스프린트 범위(겹침 cycle 후속분리 / 모바일 터치 포함)와 대조해 분류:

### 합의 (4)

- **결정 1 (`mesh.metadata.bodyId`)** — 역Map 의 SSoT 이원화·dispose 누수 위험을 격리한 Babylon 표준 metadata 활용이 성능(O(1))·관리 양면 최선. Claude 설계와 일치.
- **결정 2 (화면거리 fallback)** — collider 동적 생성/scale 확대 대비 클릭 시점에만 작동하는 화면 투영 폴백이 성능·복잡성 조율 최적. 일치.
- **결정 5 (이중 방어)** — core 가드 + UI predicate 조기 필터로 warn 노이즈 제거가 안정적 UX. 일치.
- **결정 3 (최전면 MVP)** — cycle 후속분리로 과설계 회피 + `scene.pick` 배열 깊이 확장 여지 보장. 일치.

### 고유 발견 수용 — 범위 내 (본 PR 반영, 결정 4 보강 박제)

모두 **모바일 터치 = 범위 포함**과 직결되어 현재 PR 에 반영 (위 결정 4 cross-validate 보강 블록):

- **(1) click-through 가드** — UI 오버레이(shortcut bar/모달) 위 클릭이 배경 천체로 전파돼 오선택. DoD-4(빈 우주 no-op)와 직결되는 회귀 위험 → canvas 직접 이벤트 검증. **DoD-4 에 흡수.**
- **(2) 멀티터치 가드** — 핀치줌/2-finger 회전 중 `POINTERUP` 오선택 → 활성 포인터=1 제약. **DoD-5(모바일) 보강.**
- **(3) 터치 jitter 임계 분리** — 터치 탭 미세 이동이 드래그 오판정 → 마우스/터치 임계 분리(~8–10px). **결정 4 보강.**
- **(4) DPI 좌표계** — `scene.pick`/`Project` 는 engine 내부 px → `scene.pointerX/Y` 사용. #623(`adaptToDeviceRatio:true`) 기존 정합. **구현 의무 박제.**

### 구현 권고 (무해, 자명)

- **(6) fallback 필터 순서** — 2차 폴백 진입 시 `isRPhaseFocusable` 통과 body 만 먼저 추린 뒤 `Vector3.Project` → 불필요 행렬 연산 절감. 27 body 라 영향 미미하나 무해 → developer 구현 시 자연 적용 권고.

### 기각 / 후속 분리 (1) — 범위 밖

- **(5) `opts.filter` 콜백** (궤도선/라벨 클릭 확장 대비) — 현재 **비-범위**(궤도선 클릭 = #624 candidate C). YAGNI — 지금 불필요한 추상화 추가는 과설계. 향후 궤도선/라벨 클릭 feature 진입 시 그 PR 에서 `resolvePickedBodyId` opts 확장 (§4 재검토 트리거 3 에 정합). 후속 이슈 별도 박제 불요 (#624 candidate C 가 이미 인계처).

### Claude 편향 셀프 체크 (4종)

- **낙관적 일정**: 통과 (core 순수 헬퍼 + web wiring, 변경 0라인 예측은 보수적 — focusOn 진입점 재사용 검증됨).
- **결합 간과**: architect 1차 **주의** 식별(fallback 임계 px ↔ marker 실 px) → measurement-first 의무로 해소 (결정 2). agy 가 동일 결합에 추가 위험 미제기, 대신 **터치/멀티터치/click-through 결합**(모바일 입력 ↔ 픽킹)을 보강 발견 → 결정 4 흡수. 결합 사각 2종 모두 박제 완료.
- **폐기 프레이밍**: 해당 없음 (신규 feature).
- **순수주의**: 통과 (MVP 최전면 단일 선택 — cycle 후속 분리로 과설계 회피, agy 도 확장 여지 보장 확인).
