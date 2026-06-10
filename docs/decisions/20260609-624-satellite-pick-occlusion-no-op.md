# ADR (NO-OP): galilean satellite occlusion/raycast hit-test — 클릭 picking 미구현이라 occlusion 버그 부재 (#624)

- **상태**: **Accepted** (NO-OP — 이슈 전제(클릭 raycast)가 코드에 부재함을 전수 확인. 단순 결정 ADR 직접 Accepted)
- **날짜**: 2026-06-09
- **결정자**: developer (#624 R6 후속 forensic)
- **관련**:
  - [#624](https://github.com/coseo12/astro-simulator/issues/624) (본 이슈 — R6 ADR cross-validate agy 고유 발견)
  - [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) (R6 — galilean 4개 조밀 배치)
  - [#617](https://github.com/coseo12/astro-simulator/issues/617) (`showInShortcutBar` — galilean=false, shortcut bar 미노출 근거)
  - 선택 경로: `apps/web/src/components/layout/focus-quick-buttons.tsx` (shortcut bar) / `apps/web/src/core/url-sync.tsx` (`?focus=`) / `simulation-core.ts` (`focusOn` command → `bodySelected` emit)
- **교훈 적용**: "measurement-first" (volt #32) + "인계 항목 실측 재검증 — NO-OP ADR 패턴" (volt #14/#67) — 이슈가 가정한 "raycast occlusion 오작동" 을 코드 전수 검색으로 검증한 결과, **클릭 picking 자체가 부재** → 고칠 버그 없음. 전제 위에 feature 를 짓기 전 코드 확인.

---

## §1 배경 / 이슈 전제

R6 ADR cross-validate(agy) 고유 발견: jupiter 에 galilean 4개(io/europa/ganymede/callisto)가 조밀 배치되어, 일직선 겹침/jupiter 엄폐 시 **(1) 마우스 클릭 raycast 가 앞 satellite 에 가려 특정 위성 선택 불가 (2) jupiter mesh 뒤 satellite hit-test 불가** 우려. 작업 항목: "현재 raycast hit-test(`pickInfo`/`scene.pick`) 구현 확인 — z-order 처리".

## §2 Forensic — 코드 전수 검색

`packages/core/src` + `apps/web/src` 전수 grep (대소문자 무시):

| 검색어                                                              | 결과     |
| ------------------------------------------------------------------- | -------- |
| `scene.pick` / `.pick(` / `pickWithRay` / `pickInfo` / `pickedMesh` | **0 건** |
| `onPointerObservable` / `PointerEventTypes` / `pointerdown`         | **0 건** |
| `ActionManager` / `OnPickTrigger` / `registerAction`                | **0 건** |

- **body 클릭 선택(raycast picking) 메커니즘이 코드베이스에 전혀 없다.** body 메쉬는 default `isPickable=true` 이나 이를 읽는 pick 코드 자체가 부재.
- body 선택 경로는 **3개뿐**: ① shortcut bar(`focus-quick-buttons`) ② URL `?focus=<id>`(`url-sync`) ③ programmatic `sendCommand({ type: 'focusOn', bodyId })`. 모두 `bodyId` 명시 선택 → emit `bodySelected` → store sync.
- galilean(io/europa/ganymede/callisto)은 `showInShortcutBar=false`(#617)라 **shortcut bar 미노출** → 현재 **URL `?focus=io` 가 유일 선택 경로**.

## §3 결론 — NO-OP

- **occlusion/raycast 버그 부재**: 클릭 raycast 가 없으므로 "앞 satellite 가 뒤를 가림 / jupiter 뒤 hit-test 불가" 현상이 **발생할 수 없다**. 이슈는 "클릭 선택이 존재한다" 는 **잘못된 전제**(미구현 feature 가정) 위에 작성됨.
- **galilean 선택은 URL 로 가능**(이슈 candidate B "이미 가능" 이 현 유일·정상 경로). occlusion 무관하게 항상 정확 선택(bodyId 명시).
- **조치**: 코드 동작 변경 없음(고칠 picking 코드 부재). 본 NO-OP ADR 로 "클릭 picking 미구현 = occlusion 버그 부재 + URL 선택 경로" 종결 박제.

## §4 후속 — 클릭 선택은 신규 feature (분리)

"canvas 클릭으로 body 선택" 은 **신규 기능**(현재 미구현)이며, 도입 시 비로소 이슈가 예견한 occlusion 처리가 필요해진다. 사용자 결정(2026-06-09): **현 URL 우회로 충분 → NO-OP 종결**. 향후 직접 클릭 선택 수요 발생 시:

- **신규 feature 이슈**로 분리 (scene.pick + `bodySelected` emit + 겹침 cycle UI + jupiter 뒤 satellite multi-pick). R7(saturn moons 다수)에서 수요 커지면 우선순위 상향.
- 대안: galilean shortcut bar 노출(#617 모바일 너비 정책 재검토) 또는 궤도선 클릭(candidate C).

## §5 회귀 가드

- **불필요** (NO-OP — 보호할 동작/코드 없음). 클릭 picking 도입 시 그 feature PR 에서 occlusion 테스트 신설.

## §6 재검토 트리거

- canvas 클릭 picking feature 도입 PR → occlusion/multi-pick 설계 필수 (본 ADR §4 인계).
- R7+ satellite 다수 진입 + URL 우회 불충분 피드백 시 클릭 선택 feature 우선순위 재평가.

## §교차검증 반영 사항 (cross-validate 2026-06-09 agy outcome=applied)

agy 가 본 NO-OP("잘못된 버그 전제를 정적 분석으로 정정, 불필요 구현 차단 — 훌륭한 관리 사례") Accepted 지지. 4축 분류:

- **합의 (1)**: 코드 전수 검색으로 raycast picking 부재 확정 → occlusion 버그 부재, 불필요 feature 구현 차단.
- **고유 발견 수용 (1, ADR 강조)**: **galilean discoverability gap** — `showInShortcutBar=false` + 클릭 선택 부재 → URL `?focus=io` 타이핑이 유일 경로(발견성 매우 낮음, 사실상 일반 사용자에게 은폐). **본 ADR §4 이미 인지**, 사용자 결정(2026-06-09)으로 **URL 우회 충분 → NO-OP 종결** (accepted tradeoff). 향후 수요 시 sidebar/search/궤도선 클릭 등 대체 인터페이스를 §4 후속 feature 로.
- **반려/이미 해결 (3)**: ① **URL 미존재 ID sanitization** — `simulation-core.ts:225` `isRPhaseFocusable(cmd.bodyId)` 가드(#402)가 비-allowlist/미존재 `?focus=xyz` 를 reject(console.warn, emit 안 함) → 런타임 오류 없음, **이미 해결**. ② **Babylon 백그라운드 raycast 부작용** — pointer observer/ActionManager 0건이라 엔진이 클릭 시 pick 연산 미구동(observer 없으면 picking 안 함) → 부작용 없음. ③ **클릭 picking PR 시 ADR context link** — §6 재검토 트리거에 "도입 PR → 본 ADR §4 인계" 이미 박제.
- **Claude 편향 셀프 체크**: NO-OP 가 "조사 회피" 아닌지 — 전수 grep(scene.pick/pointer/ActionManager 0건)으로 picking 부재를 능동 확정(추정 아님). discoverability gap 은 숨기지 않고 §3/§4 + 본 절에 명시.

## 변경 이력

- 2026-06-09: NO-OP ADR (developer, #624). 코드 전수 검색으로 클릭 raycast picking 부재 확정 → occlusion 버그 부재. galilean URL 선택 경로 박제. 클릭 선택은 신규 feature 로 분리(사용자 NO-OP 종결 결정). agy cross-validate 통합 (discoverability gap 명시 + sanitization 기존 가드 확인).
