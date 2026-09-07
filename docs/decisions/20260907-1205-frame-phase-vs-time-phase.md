# ADR 20260907-1205 — per-frame 갱신의 위상 분리: 시간 위상 / 프레임 위상

- **상태**: **Accepted** (cross-validate 2026-09-07 — 아래 §교차검증 반영 사항 4축 통합 완료). 원 박제: `Provisional`
- **날짜**: 2026-09-07
- **이슈**: [#1205](https://github.com/coseo12/astro-simulator/issues/1205)
- **관련**: [#782](https://github.com/coseo12/astro-simulator/issues/782)/[#785](https://github.com/coseo12/astro-simulator/issues/785) (ring-anchor 즉시 동기) · [#1204](https://github.com/coseo12/astro-simulator/issues/1204)/[#1206](https://github.com/coseo12/astro-simulator/pull/1206) (sun-light 즉시 동기) · [#783](https://github.com/coseo12/astro-simulator/issues/783) (회피 레시피) · [ADR 20260628-756](20260628-756-procedural-planet-surface.md) §결정 7 / Amendment 6 / **Amendment 9**
- **용어**: [Tier](../glossary.md#tier-t1--t2--t3), [LOD](../glossary.md), [Floating Origin](../glossary.md)

> **forensic 변형 판정 — 일반 ADR 채택.** 5조건 중 (3) DoD PASS 인데 회귀 / (4) 5±2 옵션 비교 / (5) Amendment 라운드 예상 **3 충족**으로 경계선이나, (1) 가설 N≥2 는 **미충족**이고 (dev D0 가 단일 기전을 확정) (2) runtime 측정은 결정 도출이 아니라 **검증용**이다. 본 ADR 은 회귀 forensic 이 아니라 **패턴 결정**이며, (3) 의 forensic 기록은 이미 `20260628-756` Amendment 6 이 갖고 있다. Amendment 1회가 필요해지면 forensic 승격 + 양방향 cross-link.

---

## 배경

`solar-system-scene.ts` 의 `updateAt(jd)` 는 `sim-canvas.tsx` 에서 `timeChanged` 이벤트에 바인딩돼 있다. `TimeController.tick` 이 `!running || scale === 0` 에서 `false` 를 반환하므로, **일시정지에서는 `timeChanged` 가 발화하지 않고 `updateAt` 이 한 번도 돌지 않는다.**

그런데 `updateAt` 안에는 시간 종속 갱신뿐 아니라 **카메라 종속 갱신**이 섞여 있었다. 그 결과 시간이 멈추면 카메라만 움직여도 갱신되지 않는 것들이 생긴다.

`updateAt` 본문 12블록 중 **순수 카메라 종속은 둘뿐**이다 — floating-origin safety net (`floatingOrigin.update`) 과 **LOD 분기 hook (`runLodPass`)**. 혼합 블록(mesh 좌표 / satellite orbit line / ring-anchor / primary follow / 광원)의 카메라 축은 tier 전환이라는 형태로만 나타나고, 그 구멍은 `setTier` 의 즉시-동기 3건이 이미 메우고 있다. **남은 구멍이 정확히 순수 카메라 축이다.**

### 같은 생성원이 낳은 증상 3건

| # | 증상 | 처방 |
|---|---|---|
| 1 | `speed=0` 중 tier 전환 시 ring-anchor 가 구 tier scale 로 stale (drift 최대 1733%) | `setTier` 에서 즉시 동기 **추가** (#782/#785) |
| 2 | tier 전환 프레임에 `uSunDirection` 이 영벡터 (`speed=0` 이면 지속) | `setTier` 에서 즉시 동기 **추가** (#1204) |
| 3 | **본 이슈** — `speed=0` 중 LOD 결정이 갱신되지 않아 focus body 가 billboard 로 남음 | ← 본 ADR |

1·2 는 **점 패치**였고, 각각의 주석이 스스로 원인을 적고 있다 — *"`updateAt` 은 `timeChanged` 바인딩이라 이 프레임을 메우지 못한다"* / *"`setTier` 는 pause 무관 경로이므로"*. 세 번째도 점 패치로 닫으면 네 번째가 온다. 그래서 답은 「LOD 를 또 어딘가에서 한 번 더 부르기」가 아니라 **위상을 가르기**다.

### 이미 세 번째 독립 관측이었다

`apps/web/scripts/browser-verify-783-earth-detail.mjs` 헤더가 **결함을 회피 레시피로** 커밋해 두고 있었다 — *"`?speed=0` 를 로드 쿼리에 넣으면 focus 정착(LOD/광원 per-frame 갱신)이 완주하지 않아 disk 가 렌더되지 않는다 (실측)"*. **우회로가 문서화되면 결함이 결함으로 보이지 않는다.**

### 드리프트한 계약

ADR `20260628-756` §결정 7 은 `?t=<jd>&speed=0` 를 *"임의 snapshot 을 프레임 독립으로 캡처 가능"* 한 결정적 재현 수단으로 규정한다. 「시간 정지 = 장면 통째 정지」를 선언한 문장은 코드·문서 어디에도 **없다** (dev D0 §5 (3) 전수 조사, 메인 독립 확인). 계약은 반대 방향이었고 구현이 그것을 배신하고 있었다.

### 승계되는 1프레임 위상차 (cross-validate 2026-09-07 지적)

`updateTierByCamera` 는 `sim-canvas.tsx` 의 `scene.onBeforeRenderObservable` 에 걸려 있고, 이는 `scene.render()` **안쪽**이다. 프레임 위상은 `timeChanged` emit 과 `scene.render()` **사이**, 즉 `scene.render()` **바깥**이다. ⇒ tier 가 바뀌는 프레임에서 `runLodPass` 는 **구 tier** 기준으로 판정하고 렌더는 신 tier 로 나간다.

이것은 본 변경이 **만드는** 결함이 아니라 기존 `updateAt` 이 이미 갖고 있던 위상차이며, 본 결정은 그것을 **그대로 승계**한다 (재생 경로 델타 0 의 필연적 귀결). 그리고 이 위상차는 위 표의 증상 1·2 와 **같은 클래스**다 — `setTier` 의 즉시-동기 3건이 바로 「tier 전환 프레임을 메우는」 패치이고, LOD 만 그 패치가 없다. 즉 본 항목은 §재검토 조건 4 가 예고한 지점의 **조기 관측**이다.

Babylon 9.19.0 `Scene.render()` 실측 순서 (`node_modules/.pnpm/@babylonjs+core@9.19.0/…/scene.pure.js`, `render()` 정의 `L4445`):

`onBeforeAnimationsObservable`(L4470) → Actions `processTrigger`(L4473) → **`animate()`(L4477)** → `_beforeCameraUpdateStage`(L4480) → **`onBeforeRenderObservable`(L4515)** → `_processSubCameras`(L4548·L4555) → `onAfterRenderObservable`(L4568).

⚠️ **`animate()` 가 `onBeforeRenderObservable` 보다 먼저다.** 이 앱은 실제로 Babylon `Animation` 을 쓴다 (`camera-controller.ts` 의 focusOn `cam-target`/`cam-radius`, `tier-transition.ts` 의 tier 전환 radius). 따라서 후보 (A) 는 **tween 후** 카메라를 본다 — §후보 비교 가 (A) 를 낮게 둔 논거의 실측 근거다. cross-validate 라운드가 이 순서를 반대로 기술했으나 실물 대조로 기각됐다.

---

## 후보 비교 (축별)

| 축 | (A) `onBeforeRenderObservable` 관측자 | (B) `updateAt` 전체를 렌더 루프로 | (C) 카메라 변화 감지 시 1회 | (D) 정지 중 저빈도 패스 | **(F) 렌더 루프의 기존 자리에 프레임 위상** |
|---|---|---|---|---|---|
| 결함 커버리지 | LOD ✅ | LOD ✅ + 잉여 | LOD ✅ (누락 위험) | LOD ✅ | **LOD ✅** |
| 재생 시 호출 순서 델타 | 애니메이션 step 이후로 이동 | 0 | 불규칙 | 0 | **0** |
| 정지 시 추가 비용 | LOD 1×/프레임 | + 물리·소행성(최대 10,000) 전개 | ~0 | 저빈도 | LOD 1×/프레임 |
| 신규 튜닝 상수 | 0 | 0 | 임계 1 | 주기 1 | **0** |
| 누락 축 | — | — | 뷰포트 리사이즈·tier·focus 변경 | 동일 | — |
| 정지의 의미 보존 | 예 | **아니오** | 예 | 예 | **예** |
| 경로 이원화(생성원 재도입) | 아니오 | 아니오 | 아니오 | **예** | 아니오 |

> (A) 의 「애니메이션 step 이후」는 위 §배경 의 Babylon `scene.pure.js` `L4477`(`animate()`) 대 `L4515`(`onBeforeRenderObservable`) 실측 근거다.

**채택: (F).** (A) 와 내용은 같고 **자리가 다르다.** 기존 자리를 유지하면 재생 경로의 호출 순서와 입력이 변경 전과 동일하고, 델타는 「일시정지에서도 돈다」 하나로 국한된다.

---

## 결정

### 1. `updateAt` 을 두 위상으로 가른다

- **시간 위상** (`updateAt`) — `timeChanged` 바인딩 유지. 물리 전개 / 자전 / mesh 좌표 / origin primary follow / 광원 / 소행성. **일시정지에 멈추는 것이 정의상 옳다.**
- **프레임 위상** (`runFramePass`) — 렌더 루프가 매 프레임 1회 구동. **일시정지에도 돈다.**

### 2. 프레임 위상 멤버십 규칙 (⚠️ CRITICAL — 덤핑 방지)

세 조건 **전건** 충족만 편입한다.

1. 입력이 **카메라 / 뷰포트 종속**
2. **시간이 멈춰도 의미가 있다**
3. **멱등** — 같은 입력이면 같은 결과, 상태 누적 없음

**초기 멤버는 `runLodPass` 하나뿐이다.**

⚠️ `runLodPass` 는 조건 3 을 완전히는 만족하지 않는다 — `lodFadeState` 가 `performance.now()` 기준으로 누적된다 (`LOD_FADE_DURATION_MS = 200`). **명시적 예외로 기록**하며, 이것이 §결과 의 결정성 단서의 전부다.

### 3. 배치 — 렌더 루프의 기존 자리

`simulation-core.ts` 렌더 루프에서 `timeChanged` emit 과 `scene.render()` **사이**.

`onBeforeRenderObservable` (후보 A) 는 `scene.render()` **안쪽**이라 Babylon 애니메이션 step 이후에 돈다. `scene.render()` **뒤**로 두면 LOD 가 전면 1프레임 지연된다. 기존 자리를 유지하면 **재생 경로의 호출 순서와 입력이 변경 전과 동일**하다.

[dev 실측 M4] 프레임 위상 시점의 `camera.globalPosition` + `scene.getTransformMatrix()` 가 **직전 프레임 최종값**과 일치하는 비율: 수정 전 `508/508`, 수정 후 `500/500`. **당 프레임 최종값과 일치한 표본은 양쪽 모두 `0`.** ⇒ 지연 특성 델타 `0`. (지연 자체는 `camera-controller.ts` 가 #611 에서 이미 실측해 둔 기지 사실이고, 여기서 잰 것은 **델타 0 여부**다.)

⚠️ **위상차 해소는 본 결정의 범위가 아니다 (유예).** 실피해 관측 `0` 이고 — ⚠️ 이는 **픽셀 축을 재지 않았다**는 뜻이지 「LOD 분포 이탈도 없다」가 아니다. 재생 경로의 분포 이탈은 [실측] 관측된다 (`{2,4,26}` → `{4,2,26}` → `{2,4,26}`). **수정 전 구현판에서 프레임 단위로 같은 값**이 나오므로 승계이며 본 변경이 만든 것이 아니다 — 해소는 재생 경로 입력을 이동시켜 (F) 의 유일한 자산인 「재생 델타 0」을 버린다. 일시정지 축에서 본 결정은 `∞` 프레임 지연을 `1` 프레임으로 줄이는 **엄격한 개선**이며 악화 경로가 없다. escalation 트리거는 §재검토 조건 6.

### 4. 옮기지 않는 것 — floating-origin safety net

`floatingOrigin.update(cameraWorldMeters)` 는 순수 카메라 종속이지만 **옮기지 않는다.**

1. 자기 주석이 *"다음 프레임의 `updateAt` 이 새 origin 으로 좌표 재기록"* 을 성립 조건으로 적고 있다. 일시정지에는 그 다음 `updateAt` 이 없다 — 옮기면 origin 만 움직이고 mesh 좌표가 안 따라오는 **새 불일치**가 생긴다.
2. ADR `20260424-tier-naming-policy.md` §Prediction 1 Amendment 의 **금지 조건**이 *"`FloatingOrigin` 상호작용 (`fo.toLocal` / `fo.update` / `fo.reset`)"* 을 명시한다. `runLodPass` 이동은 같은 Amendment 가 예외 허용한 *"LOD 분기 hook"* 대역이지만 `fo.update` 이동은 금지 대역이다.

⇒ 「정지 중 free-fly 로 1 AU 이동 시 origin 이 안 따라간다」는 같은 클래스의 잠재 결함이나 **실피해 관측 `0`** 이므로 기록만 한다 (CLAUDE.md §검증 강도 게이트 — *"이슈는 실피해가 관측됐을 때"*).

### 5. `setTier` 의 기존 즉시-동기 3건은 유지한다

mesh 루프 / 광원 / ring-anchor. 「중복 출처 제거」 논리로 프레임 위상에 흡수하면 #380 가드 C 의 순서 계약을 건드리고 회귀 표면이 본 변경의 몇 배가 된다. **후속 이슈 후보.**

⚠️ 그리고 **광원 즉시-동기의 필요성은 오히려 커졌다.** 광원은 시간 위상에 남아 있는데 LOD 만 프레임 위상으로 갔으므로, 이제 `pause` 에서도 focus body 가 high LOD 로 착지해 절차 머티리얼이 bind 된다 — #1204 가 관측했던 *"pause 에서는 bind 0 회라 영벡터가 draw 에 도달하지 않는다"* 는 **더 이상 참이 아니다.**

---

## 결과

### 얻는 것

- `?speed=0` 가 **처음으로** ADR `20260628-756` §결정 7 이 선언한 「프레임 독립 캡처」에 가까워진다 (잔여 조건은 아래 fade 정착 — Amendment 9).
- #783 회피 레시피가 불필요해진다 (스크립트 헤더 회수 완료).
- 카메라 종속 갱신이 앞으로 추가될 때 **네 번째 `setTier` 중복 대신 갈 곳**이 생긴다.
- `setLodOverride` 가 일시정지에서도 반영된다 (JSDoc 계약 갱신).

### 잃는 것 / 비용

- **일시정지가 더 이상 CPU idle 이 아니다** — LOD 패스 1×/프레임 (32 body).
  [dev 실측 M2] 프레임 위상 1회 실행 시간: pause `n=399` / play `n=302`, median `0.1 ms` · p90 `0.1 ms` · max `0.2 ms`. ⚠️ 브라우저 `performance.now()` 는 `0.1 ms` 로 양자화돼 있어 **이것이 분해능 바닥**이다 — 참값은 `[0, 0.2) ms` 구간이라는 것까지만 말할 수 있고, 코드 주석의 *"프레임당 몇 마이크로초"* 주장은 이 도구로는 확인도 반증도 되지 않는다.
  [dev 실측 M2] `pnpm bench:scene` `idle` fps, **같은 기계·같은 dev 서버·연속 실행** 3회씩: 수정 후 `96.87 / 97.59 / 97.87` — 수정 전 `88.96 / 97.98 / 98.03`. 수정 전 3회의 산포(`88.96~98.03`)가 두 집합의 중앙값 차(`97.59` 대 `97.98`)보다 **한 자릿수 이상 크다** ⇒ 이 측정 분해능에서는 회귀를 **검출하지 못했다**. 「회귀가 없다」가 아니라 「이 도구로는 안 보인다」가 판정이다.
  ⚠️ `docs/benchmarks/baseline.json` 은 `2026-04-23` gh-actions ubuntu 값이라 절대 합격선으로 쓸 수 없다.
- **정지 중 200ms cross-fade 가 wall-clock 으로 진행**한다 → 레벨 전이 직후 캡처가 시각 종속.
  [dev 실측 M7] `?speed=0` + focus earth 상태에서 `setLodOverride('low')` → `'auto'` 왕복 시, 전이 `+19.3 ms` 시점에 알파가 열린구간인 mesh **10개** (`sun 0.899` / `sun-lod-low 0.101` …), `+209.2 ms` 시점에 `0` 개. fade 진행 프레임 `15`. **수정 전 같은 조건에서 pause 레벨 전이는 `0` 건**이었다 (얼어 있었으므로 이 창 자체가 없었다).
  처방은 **캡처 측 정착 조건** — `getLodStats().fading === 0` 을 확인한 뒤 판정. 신규 노출 필드이며 ADR `20260628-756` **Amendment 9** 가 §결정 7 을 이 조건으로 보강한다.
  ❌ 「정지 중 fade 동결」은 **기각** — 정지 전용 분기는 후보 (D) 와 같은 경로 이원화다.
- **focus 변경 시 첫 프레임 stall 이 일시정지에도 나타난다.** LOD variant lazy-create + 절차 셰이더 컴파일 비용이다.
  [dev 실측] `focusOn` 직후 다음 프레임까지의 간격: 수정 후 pause `404 ms` / 수정 후 play `421 ms` / **수정 전 play `426 ms`**. 즉 이것은 **재생 경로에 원래 있던 비용**이고, 본 변경은 일시정지를 재생과 같게 만든 것이다. (수정 전 pause 가 매끄러웠던 이유는 variant 를 아예 만들지 않았기 때문 — 결함의 부산물이다.)

### 재현 검증 (ADR `20260424-tier-naming-policy.md` §Prediction 1 Amendment 요구)

- `packages/core/src/scene/tier.ts` + `tier-transition.ts` `git diff --numstat` → **출력 0행** [dev 실측]
- `solar-system-scene.ts` 수기 diff 리뷰 → 금지 조건(mesh.position 수식 / `renderScaleForTier` 적용 지점 / Tier 상수 / `activeTier` 의미 / `FloatingOrigin` 상호작용 / `setTier` origin 로직) 위배 **0** [dev 확인 — 변경은 hook 호출 위치 이동 + JSDoc 3건 + `lodStats.fading` 1행]

---

## dev 실측 M1~M9

측정 환경: macOS · Playwright 번들 chromium(headless, 기본 백엔드) · `next dev` :3002 · 분기 rev `origin/develop` `1a21d85` · 1280×720. 「수정 전」은 같은 세션에서 작업 트리를 stash 해 재빌드한 것이다.

| # | 무엇을 쟀나 | 결과 |
|---|---|---|
| **M1** | 프레임 위상 호출 계수 (재생 / 일시정지). 판정은 **`0` 인가**와 **프레임당 1회 초과인가** | 수정 후 play `frames 501 / updateAt 501 / framePass 501`, pause `frames 551 / updateAt 0 / framePass 551`. **1×/프레임 정확, 중복 발화 0.** 수정 전 pause 는 `frames 750 / updateAt 0` (LOD 패스 `0` 회) |
| **M2** | 비용 — 프레임 위상 1회 실행 시간 + `bench:scene` A/B | 위 §잃는 것 참조. 실행 시간은 `performance.now()` 분해능 바닥, bench 는 산포가 델타를 덮음 |
| **M3** | tier 전환 프레임의 LOD 결정 입력이 mesh 좌표와 같은 기준계인가 — 수정 전/후 동일한가 | **기준계 일치**: 프레임 위상이 읽는 `(tier, originOffset)` 이 직전 시간 위상 종료 시점 값과 동일 (`basisEqual = true`). **위상차는 실재하고 수정 전/후 동일**: play 전환 프레임의 `lodStats` 가 `{2,4,26}`(구 tier 판정) → 다음 프레임 `{4,2,26}`, 수정 전·후 **같은 패턴**. focus body 의 레벨은 전환 전후 `high` 불변 |
| **M3-가시** | 위 위상차가 화면에 보이는가 | **관측 못 함.** 전환 프레임에 레벨이 바뀌는 body 는 2개이고 그 전이는 `mid→high` 라 `lodFadeState` 200ms cross-fade 로 들어간다 — 1프레임 지연은 fade **시작 시각**을 한 프레임 미루는 것이다. ⚠️ **픽셀 축은 재지 않았다** — 이 문장은 구조 논증이지 픽셀 실측이 아니다. 그리고 본 PR 은 이 축을 **바꾸지 않았다**(수정 전/후 동일) |
| **M4** | 프레임 위상 시점 카메라/VP 의 프레임 지연 — 수정 전후 동일한가 | 위 §결정 3. 수정 전 `508/508` ↔ 수정 후 `500/500` (직전 프레임 최종값 일치), 당 프레임 일치 양쪽 `0`. **델타 0** |
| **M5** | `jumpToJulianDate` + `pause` 레시피 가드가 수정 전후 동일 판정인가 | `browser-verify-783-earth-detail` / `-1119-earth-mask` / `-1202-atmosphere-rim` / `-1204-sun-light` **전건 exit 0** |
| **M6** | 일시정지 중 tier 전환(휠) 시 floating-origin assert (`console.error`) | 수정 전 `0` 건 / 수정 후 `0` 건 (pause 휠 40틱 → body tier 진입, `frames 551`) |
| **M7** | 일시정지에서 LOD 레벨 전이 직후 200ms 창의 알파 — 캡처 시각 종속이 생기는가 | **생긴다.** 위 §잃는 것. ⇒ §재검토 조건 2 발동 → `20260628-756` Amendment 9 |
| **M8** | 프레임 위상 등록/해제 수명이 `on('timeChanged')` 와 대칭인가 (언마운트·**리마운트** 포함) | 등록은 `on('timeChanged')` **바로 옆**(같은 effect 본문), 해제는 같은 effect 의 return. 최초 로드 / `about:blank` 왕복 후 재로드 **양쪽 모두** pause 에서 focus 변경에 LOD 가 반응 (`2/1/29 → 2/4/26`), 콘솔 에러 `0`. StrictMode(`reactStrictMode: true`) 하에서 `__solarScene` 정의 횟수는 `1` — 첫 마운트는 비동기 엔진 초기화 완료 전 `cancelled` 되어 씬 생성에 도달하지 않으며, **그 마운트의 cleanup(= 첫 인스턴스에 대한 `setFramePassHandler(null)` + `dispose()`)이 두 번째 마운트의 등록을 무효화하지 않음**을 확인했다. ⚠️ architect 가 경고한 「scene 은 살아있고 컴포넌트만 재마운트」 창은 **오늘 구성 불가**다 — 라우트가 `app/page.tsx` 하나뿐이고 effect cleanup 이 `instance.dispose()` 로 씬을 파괴한다. 라우트가 늘어나면 재측정 대상 |
| **M9** | `?focus=<body>&speed=0` 에서 focus tween 이 완주해 카메라가 B 에 도달하는가 | **완주한다.** 수정 전 build, `focus=sun&speed=0` 부팅 후 `focusOn('earth')`: `radius 25.3047 → 36.8268`, 중간 표본 `20` 개 / 서로 다른 값 `22` 개, `scene._activeAnimatables` 최대 `3`, 말미 500ms 변동 `0`. 도달값이 `?focus=earth&speed=0` 직접 부팅의 `36.8268` 과 **일치** ⇒ P-R (나) 의 `D_init(B)` 구성 유효 |

---

## 가드 — 술어 P-R 과 판별력 실증

신규 `apps/web/scripts/browser-verify-1205-pause-lod.mjs`.

```
P-R = (가) ∧ (나)     # 두 다리 모두 필요조건
 (가) 비퇴화   : 일시정지 중 카메라 A→B 이동 시 getLodStats() 분포가 변한다
 (나) 경로무관 : D_pause(A→B) === D_init(B)
```

- **(가) 가 판별력을 전담한다** — 결함 문장의 문자 그대로의 부정.
- **(나) 는 계약 폭을 담당한다** — *"일시정지가 LOD 결정에 영향을 주지 않는다"*.
- ❌ 기각: 「일시정지에서 focus body 가 high 다」 단독 (#1123 판별력 0 재생산).

### (나) 단독이 결함 보유판에서 통과한다는 예측이 **실측으로 확인**됐다

설계 라운드 2 §B-2 는 *"두 조건이 둘 다 일시정지라 결함판에서 같은 퇴화 상수로 수렴한다"* 고 예측했다. 실측 결과 그대로였다.

| 대상 | `D_A` | `D_pause(A→B)` | `D_init(B)` | (가) | (나) | exit |
|---|---|---|---|---|---|---|
| 결함 보유 build (stash 재빌드) | `0/0/32` | `0/0/32` | `0/0/32` | **FAIL** | **PASS** | `1` |
| 변이 (a) 훅 호출 1줄 제거 | `0/0/0` | `0/0/0` | `0/0/0` | **FAIL** | **PASS** | `1` |
| 변이 (b) 훅을 `tick()` 조건 안으로 (원 결함 형태) | `0/0/0` | `0/0/0` | `0/0/0` | **FAIL** | **PASS** | `1` |
| 원본 / 복구 | `2/1/29` | `2/4/26` | `2/4/26` | PASS | PASS | `0` |

⇒ **(나) 만 넣었으면 가드가 결함 보유판에서 초록이었다.** §B-2 분석은 반증되지 않았고 오히려 3중으로 재현됐다.

### 전제 검사 (판별력 0 차단)

두 세션의 `tier` 일치 + `radius` 상대차 `< 1e-6` + `fading === 0` 을 **판정 전에** 확인하고 어긋나면 FAIL. `rotate=off` 가 필수인 이유는 `boundingSphere.radiusWorld` 가 자전에 따라 변해(dev D0 §4 실측 `rotate=on` 에서 `8.8978~12.3299`) 두 세션이 서로 다른 거리에서 비교되기 때문이다.

---

## 재검토 조건

1. **M2 가 `idle` fps 회귀를 보일 때** — ADR `20260424-p11-b-lod-design.md` §재검토 조건 3 이 예고한 *"10 프레임 throttle 또는 `screenCoverageRadius` batch API"* 가 트리거된다. ⚠️ throttle 은 §결정 2 의 조건 3(멱등)을 더 깨므로 도입 시 본 ADR Amendment 필수. **현재 판정: 검출 실패(측정 분해능 부족)이지 「회귀 없음」이 아니다** — 프로덕션 빌드 + 저소음 환경에서 재측정할 여지가 남아 있다.
2. **M7 이 fade 창 종속을 관측할 때** — ✅ **발동함.** `20260628-756` §결정 7 에 캡처 전 정착 조건 Amendment 9 를 추가했다.
3. **프레임 위상 멤버가 2개째로 늘어날 때** — §결정 2 의 3조건을 그 멤버에 적용한 판정을 박제. 3조건을 통과하지 못하는 것을 넣으려면 본 ADR Amendment.
4. **`setTier` 즉시-동기가 4건째로 늘어날 때** — §결정 5 의 「유지」 판정이 무효화된다. 그 시점에 위상 흡수를 재평가한다.
5. **M6 가 floating-origin assert 발화를 관측할 때** — ADR `20260422-floating-origin.md` §3 계약 위배이므로 본 결정을 **재설계**한다 (배치 지점 변경 또는 후보 (A) 후퇴).
6. **M3-가시 가 tier 전환 프레임의 LOD/scale 불일치를 «가시» 수준으로 관측할 때** — 위상차 유예가 무효화된다. escalation 은 **(E3) 후보 (A) + `tierObserver` 뒤 등록**이다: `animate()` → `onBeforeRenderObservable`[tier] → [LOD] 순서가 되어 **tier 지연과 카메라 tween 지연이 동시에** 사라진다. `sim-canvas.tsx` 의 tier 옵저버 무접촉.
   ⚠️ 대가는 재생 경로 입력의 한 스텝 이동 — #380/#818/#790 회귀 세트 전량 재실행이 조건.
   ❌ 「`updateTierByCamera` 를 프레임 위상으로 이관」은 **채택하지 않는다** — free-fly gate / `upperRadiusLimit` SSoT / #704 NaN 가드 전체가 딸려 오고, tier 지연만 없앨 뿐 tween 지연은 남는다.

---

## 기존 ADR Amendment 판정

| ADR | 판정 | 근거 |
|---|---|---|
| `20260422-floating-origin.md` | **불요** | 3단 변환 / origin 갱신 / #380 가드 C 순서 무접촉. `runLodPass` 는 `originOffset` 을 **읽기만** 한다. M6 실측 `0` 건으로 확인 |
| `20260424-tier-naming-policy.md` | **불요 (재현 검증 2건 이행 완료)** | 위 §재현 검증 |
| `20260424-p11-b-lod-design.md` | **불요** | LOD 결정 규칙·임계 무변경. §재검토 조건 3 은 M2 결과 종속 |
| `20260628-756-…` | **Amendment 9 추가** | M7 관측 ⇒ §결정 7 에 캡처 전 정착 조건. ⚠️ **원문 소급 편집 0** |
| `20260509-380-…` (가드 C) | **불요** | 가드 C 는 시간 위상 내부 순서, 무접촉. `tier-transition.test.ts` 의 `createUpdateAtSimulator` 가 박제한 순서는 `advancePhysics` → `updateMeshPosition` → `setOriginToBody` 뿐이고 **`runLodPass` 를 포함하지 않는다** (실물 확인, 테스트 갱신 `0`) |

---

## 비-범위 (본 PR 에서 손대지 않은 것)

- **Q1 위상차 해소 (E1/E2/E3 전부)** — §결정 3 유예. §재검토 조건 6 이 트리거.
- `floatingOrigin.update` safety net 이동 — §결정 4.
- `setTier` 즉시-동기 3건 통합/폐기 — §결정 5. 후속 이슈 후보.
- LOD 임계·거리 규칙 튜닝 / low variant 에 절차 셰이더 적용 / `applySatelliteVisibilityGuard` 정책 재설계.
- **진입 경로별 착지 거리 통일** — dev D0 §4 가 원인을 **자전 위상**(`boundingSphere.radiusWorld` 의 회전한 AABB 대각 오염)으로 특정했다. 후속 이슈를 뜬다면 제목이 「진입 경로별」이 아니라 「`boundingSphere.radiusWorld` 자전 위상 종속」이어야 한다.
- 미등록 `browser-verify-*.mjs` 일괄 배선.

---

## 교차검증 반영 사항 (cross-validate 2026-09-07 — 설계 라운드 2)

> ✅ **메인 통합 (2026-09-07).** cross-validate 는 **설계안 + 본 ADR 초안을 같은 입력에 넣어** 1회 수행했다 (`outcome: applied` · `exit_code: 0` · `plan_bypass: false` · `bypass_files: []` — #479 step 9 는 호출 주체인 메인이 확인). 즉 본 절은 「설계 단계 결과의 이월」이 아니라 **이 문서를 포함한 검토의 결과**다. 4축 분류는 아래와 같고, 이어 `Provisional → Accepted` 로 전이한다.
>
> ⚠️ **가장 중요한 관측 — 외부 검토가 낸 처방이 결함 보유판에서 통과했다.** cross-validate 는 원안 술어 P1 의 결함을 **정확히** 짚었고(궤도 운동으로 두 경로의 body 위치가 달라 결정적이지 않다) 대안 P1-Refined 를 제시했는데, **그 대안 자체가 결함 보유판에서 PASS 한다** — 두 조건이 둘 다 일시정지라 같은 퇴화 상수로 수렴하기 때문이다. 이를 잡은 것은 **Claude 재분석**이었고, dev 실측이 **3중으로 재현**했다 (§가드 참조: 실제 결함 rev · 훅 제거 · 훅을 `tick()` 안으로 — 셋 다 `(나)` PASS · `(가)` FAIL). **「외부 모델이 술어를 고쳐 줬다」에서 멈췄으면 초록인 채 머지됐다.**
>
> ⇒ 일반화: **깨진 술어를 지적하는 능력과 대체 술어를 세우는 능력은 다르다.** 전자는 외부 검토가 강하고, 후자는 **결함 보유판에 대고 돌려 보는 것**만이 판정한다 (#1123 클래스).

### 합의 — 원안 유지

회귀 표면 / `setTier` 즉시-동기 유지 / 200ms fade 처방 (i) 채택·(iii) 기각·(ii) 보류 / 「일시정지에서도 `timeChanged` 를 emit(jd 불변)」 **절대 기각** / 비용 축 정정 / safety net 미이동 / 멤버십 3규칙. **전건 원안 유지.**

- 「jd 불변 emit」 기각 근거가 2중이 됐다 — 후보 (B) 와 같아져 정지 중 소행성 전개가 도는 것 외에, `packages/shared/src/events/core-events.ts` 헤더가 이 이벤트 맵을 *"UI 어댑터가 구독하여 Zustand store 에 전달"* 로 규정한다. 매 프레임 이벤트는 그 계약 밖이다.

### 이견 수용 — 원안 수정 2건

- **Q1 (승계 위상차)** — 실재한다. 원안이 논점으로 세우지 않은 축이었다. §배경 에 편입하고 §재검토 조건 6 에 escalation 을 박제했다.
- **Q4 (술어)** — 원안 P1(재생 A→B 분포 == 정지 A→B 분포) **폐기**. 재생 transit 중 천체가 궤도를 도는 이상 두 경로의 body 위치가 달라 술어가 **결정적이지 않다**. ⚠️ 기각 사유는 「무조건 깨지므로」가 **아니다** — 변위는 `speed` × transit wall-time 에 비례하고 둘 다 테스트가 통제하는 값이라 충분히 낮은 `speed` 에서는 통과할 수도 있다. **명시되지 않은 튜닝에 따라 통과/실패가 갈리는 술어**가 「무조건 깨지는 술어」보다 나쁘다 (우연히 초록인 채로 머지된다).

### 고유 발견 — Claude 재분석으로 기각 2건

- 🔴 **Q1 의 프레임 위상 다이어그램이 Babylon 실제 실행 순서와 반대**였다 (`render()` → `onBeforeRenderObservable` → `_animate()` 로 기술). 실물은 `animate()`(L4477) 가 `onBeforeRenderObservable`(L4515) 보다 **먼저**다. 무해하지 않다 — 뒤집힌 순서를 믿으면 후보 (A) 가 「tween 전 카메라를 본다」로 읽혀, (A) 를 (F) 보다 낮게 둔 논거가 근거 없이 무너진다. **기전 서술만 기각하고 결론(위상차 실재)은 채택.**
- 🔴 **「누락 회수 대상」으로 지목된 `updateAt` JSDoc 문안이 저장소에 존재하지 않는다.** `grep -rn "LOD 판정"` 3 hit 전부 다른 파일이고, `updateAt` 정의 바로 위에 JSDoc 이 없으며, 인터페이스 선언의 실제 문안은 *"주어진 Julian Date 시점으로 모든 천체 위치 갱신"* 이라 **수정 후에도 참**이다. 단 발견 클래스는 유효해 원안이 놓친 stale 3건(`getLodStats` JSDoc / `setLodOverride` JSDoc / hook 책임 블록)을 회수했다.

### Claude 편향 셀프 체크

| 축 | 판정 |
|---|---|
| 낙관적 일정 | ⚠️ **미통과 유지** — 「호출 1줄 이동」으로 보이나 측정 항목이 M1~M9 이고 회귀 표면이 LOD·tier·focus·fade + verify 스크립트 4종이었다 |
| 결합 간과 | ✅ 통과 — Babylon `Scene.render()` 내부 순서를 실물 대조로 해소 |
| 폐기 프레이밍 | ✅ 통과 — 기존 `setTier` 점 패치 3건을 폐기 대상으로 삼지 않고 유지 + 경계 명시 |
| 순수주의 | ✅ 통과 — 「중복 출처 제거」로 `setTier` 중복까지 흡수하려는 유혹을 §비-범위 로 격리 |
