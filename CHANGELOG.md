# 변경 이력

모든 중요한 변경사항은 이 파일에 기록된다.
Semantic Versioning을 따른다.

## [Unreleased]

### Behavior Changes (#704 — free-fly 감도 설정 UI, PR #705 진행 중)

- **[#704] SSR 격리 fix — free-fly-sensitivity 의 babylon 값 import 제거 (리터럴 + drift 가드)** ([#704](https://github.com/coseo12/astro-simulator/issues/704)) — qa SSR 진단 정정. `apps/web/src/store/free-fly-sensitivity.ts` 의 `import { scene } from '@astro-simulator/core'` 가 `scene` 네임스페이스 **값**을 import → 그 `camera.ts` 가 `@babylonjs/core`(physics_wasm 체인 포함)를 끌어들여 Next.js server component 그래프에서 SSR prerender 가 `physics_wasm_bg.wasm` ENOENT 로 500 (`develop`=SSR 200 / pre-fix #704=SSR 500 직접 대조, `next build` prerender FAIL → post-fix PASS, dev `curl /ko` 500→**200**). 클라이언트 hydrate 는 정상이었으나 production(main) SSR 위험 미검증 상태. **fix**: `scene` 값 import 제거 + default 를 숫자 리터럴(`{ wasd: 0.015, zoomoutFactor: 5, panning: 0.01, zoom: 0.01 }`)로 박제. SSoT(camera.ts const 일치)는 **drift 가드 단위 테스트**(`free-fly-sensitivity.test.ts` — 테스트는 SSR 그래프 밖이라 babylon import 무방, 리터럴이 const 와 drift 하면 FAIL)가 보존. ADR `20260618-704-freefly-sensitivity-settings-ui.md` §Amendment SSR 격리 (축 2-A "const 값 import SSoT" → "리터럴 + drift 가드" 전환). 일반화: store/server-component 그래프에 babylon/wasm 값 import 금지 — type-only(`import type`)는 compile 시 erase 되어 SSR 안전.

## [0.29.0] — 2026-06-18

### Behavior Changes (#693 — free-fly 패닝 F3)

- **[#693] free-fly 패닝 (F3) — 우클릭/Ctrl 드래그 target 평면 이동 + floating origin 정합 (MINOR)** ([#693](https://github.com/coseo12/astro-simulator/issues/693)) — free-fly 모드에서 우클릭(또는 Ctrl+좌클릭) 드래그로 카메라 target 을 화면 평면 방향으로 이동(패닝). **radius 비례 `panningSensibility`** (`PANNING_DELTA_PERCENTAGE = 0.01`, `REFERENCE / (radius × pct)`) 로 tier별 renderScale 비대칭(solar≈35 ↔ body≈158386)에서도 drag 1px ↔ world 이동 비율 일정 (#629 `wheelDeltaPercentage` 철학 패닝 적용) — `onBeforeRender` 가 줌 중 radius 변동을 따라 매 프레임 재산출. **floating origin 정합**: free-fly originOffset=[0,0,0] 불변식상 좌표 보정 0 (architect measurement-first 로 #629 "floating origin × panning 위험" 정적 기각 사유를 실측 기각, 코어 12라인). focus 중에는 `panningSensibility=0` (followObserver 가 target 덮어쓰므로 무의미 + jitter 회피). 우클릭 contextmenu 차단 (canvas 한정). ADR `20260616-693-freefly-panning.md` SSoT. 비-범위: 패닝 감도 설정 UI / 모바일 2-finger 팬.

### Behavior Changes (#699 — free-fly 카메라 통합 재설계)

- **[#699] free-fly 카메라 통합 재설계 — 진입/줌/이동/시점 일관 모델 (MINOR)** ([#699](https://github.com/coseo12/astro-simulator/issues/699)) — free-fly 진입(시점 보존 단일 규칙) + 줌 % + WASD 이동(deltaTime 정규화) + 패닝 일관 모델. ADR `20260617-699-freefly-camera-unified-redesign.md` SSoT.
  - **D-T2 Amendment 1 (2026-06-18) — 탐색 버튼(command 경로) free-fly 진입 정상화**: 사용자 보고 "탐색 버튼 클릭 시 리셋만 되고 조작이 안 됨" critical 회귀 fix. simulation-core `enterFreeFly` 가 `freeFlyEntered → bodySelected:null` 2-emit 하여 후행 `bodySelected:null` 이 어댑터 `setSelectedBody(null)` 로 store `freeFlyMode` 를 false 로 덮어써(§509) free-fly 가 reset 으로 되돌아가던 문제 — 후행 `bodySelected:null` emit 제거(2-emit→1-emit). `store.enterFreeFly()` 가 `{selectedBodyId:null, freeFlyMode:true}` 를 단일 set 으로 commit. `resetCamera` 경로는 자체 `bodySelected:null` emit 유지 (reset 버튼 무회귀). emit 순서 #509 부터 존재한 develop 잠복 버그를 #699 가 표면화 → #699 PR 에 fix 포함. 가드 사각 해소: verify:699 신규 S5 (실 버튼 = `__simCore.command` 경로 SSoT) + 단위 가드 + 3중 시뮬레이션.
  - **D-T2 Amendment 2 (2026-06-18) — free-fly 진입 시 캔버스 자동 포커스 (버튼 진입 후 즉시 WASD 가능)**: Amendment 1 fix 후 사용자 2차 보고 "진입 후 이동이 안됨" 회귀 fix. Babylon `scene.onKeyboardObservable` 은 canvas 가 키보드 포커스를 가질 때만 키를 수신하는데(실측: window 전역 keydown 은 미수신), 탐색/focus 버튼 클릭으로 진입하면 포커스가 그 버튼에 남아 사용자가 캔버스를 클릭하기 전엔 WASD 무반응이던 문제 — `detachToFreeFly` 끝에 `refocusCanvas()` 호출(텍스트 입력 포커스 가드 포함)로 진입 즉시 canvas 키보드 포커스 자동 부여. 이제 버튼 진입 직후 캔버스 클릭 없이 바로 이동 가능. 가드 사각 해소: verify:699 신규 S6 (실 탐색 버튼 click → 캔버스 click 없이 WASD 이동량 > 0 + `activeElement === canvas`) + 3중 시뮬레이션(negative=`refocusCanvas()` 제거 시 activeEl=BUTTON/worldΔ=0 FAIL).

## [0.28.0] — 2026-06-16

### Behavior Changes (#688 — 궤도선 toggle UI)

- **[#688] 궤도선 toggle UI — `?orbits=off` + 토글 버튼 (glow marker 시너지: 별자리 뷰) (MINOR — UI 기능)** ([#688](https://github.com/coseo12/astro-simulator/issues/688)) — 27 body 궤도선(행성+위성)을 런타임 on/off 하는 토글. 후속 후보 분석 1순위 (LOW 난이도 + 기존 인프라 재사용 HIGH + glow 시너지). **scene 인프라 `setOrbitLinesVisible` (satellite 일괄 #627) 0 변경 재사용** — web/core wiring 만 추가 (glow `?marker=` + LOD `setLodOverride` command 패턴 답습). **확정 동작 (PM 합의 2026-06-16)**: 기본 ON + `?orbits=off` 옵트아웃 (미지정·`?orbits=on`·이상값 → ON, 폴백+warn) / shortcut bar 마지막 토글 버튼 (reset/free-fly 동급, aria-pressed 가역 + active 스타일) / 전체 on/off (행성+위성 일괄 — `setOrbitLinesVisible` satellite Map 포함) / UI 버튼(런타임) + URL 초기값 둘 다. **glow 시너지**: 궤도선 OFF + glow ON(기본) = body 위치가 glow 픽셀로만 표시되는 "별자리 뷰" (qa 실측). **wiring**: `CoreCommand.setOrbitLinesVisible` + `simulation-core.ts` `setOrbitLinesVisibleHandler` (미등록 no-op) + `parse-orbits-mode.ts` URL 파서 + `sim-store.ts` state + `focus-quick-buttons.tsx` 토글 버튼. **검증**: core 497 / web 371 (873 tests, 신규 18 케이스) + 3단계 브라우저 (가역 토글 / `?orbits=off` OFF 시작 / focus·reset 무회귀) + 별자리 뷰 캡처 + D-T2 실 Chrome 사용자 승인 (2026-06-16). reviewer approve (command/URL/state/무회귀/glow 직교 정합). r1-guard baseline 갱신 (shortcut-bar region 토글 버튼 신규). ADR 생략 (단순 UX — cross-validate 비대상, 구현 PR 설계 인라인). **MINOR 분류** — UI 기능 추가. 비-범위: 궤도선 색상/스타일 커스터마이징 / 개별 body 궤도선 선택 토글 / fade 애니메이션.

## [0.27.0] — 2026-06-13

### Behavior Changes (#680 — tier-c LOD override race 근본 fix + fps 가드 진단 인프라)

- **[#680] tier-c LOD override race 제3 윈도우 근본 fix + fps-baseline-guard 진단 인프라 (MINOR — 앱 코드: 저사양 GPU LOD 결정론화)** ([#680](https://github.com/coseo12/astro-simulator/issues/680)) — #677 Amendment 2 의 race fix (출처 2개 보강) 후에도 fps-baseline-guard mobile 잔존 flake (동일 코드 fail −44~54% → rerun 만점). **진단 인프라** (`captureLodDiag` — 측정 시점 tier/override/lod 박제 + fail 시 가설 자동 분류) 가 CI 에서 **가설 1 (race 제3 윈도우) 즉시 확정**: desktop `override=low` 정착 vs mobile `override=auto` 잔존 (강제 low 유실 → sun high sphere 풀렌더). **근본 원인 (앱 코드)**: `url-sync.tsx` mount 의 무조건 `setLodOverride('auto')` 발행 (**제3 출처 — #677 Amendment 2 누락**) 이 tier-c 강제 low 를 덮어씀. delay sweep 100% 결정론 재현 (delay=0 → 'auto', ≥50ms → 'low'). **fix** (`sim-canvas.tsx`, glow 코드 0 변경): handler 가 매 진입마다 URL `?lod=` + `__gpuTierForceLod` 강제 플래그 재참조 (`resolveLodWithTierForce`) → 미지정 'auto' 를 강제값으로 idempotent 치환 (#677 2중화 → 3중 + 순서 보장, `?lod=` URL 우선 보존). **진단 처치** (`verify-fps-baseline.mjs`): override='low' 정착 8s bounded 대기 (영구 race-lost 는 FAIL 표면화 — 은폐 0) + 재측정 1회 best (transient 흡수, 진짜 회귀는 두 번 다 fail). **DoD 연속 5/5 run green 실측** (mobile override 전부 'low' 정착). #677 ADR Amendment 3 Accepted (agy 응답 불가 → Claude 단독 + reviewer 독립 검증). **실 tier-c 기기도 동일 race 겪으므로 앱 fix = 제품 동작 변화 (MINOR)** — 저사양 GPU 에서 강제 low LOD 안정 적용.

### Behavior Changes (CI 인프라 — #666 Node 중앙화 + #684 Playwright 캐싱, 앱 런타임 무관)

- **[#666] Node 버전 중앙 집중 관리 — `.node-version` 정확 버전 일원화** ([#666](https://github.com/coseo12/astro-simulator/issues/666)) — playwright 6 workflow 의 하드코딩 Node 핀 (ci/a11y/fps '22' / bench 계열 20) 중복을 `.node-version` (정확 버전 `22.16.0`) 중앙 파일로 일원화 (8 workflow `node-version-file` 전환) + `.nvmrc` 24.14.0→22.16.0 정리 (#606 deadlock 로컬 footgun 해소). **bench 20→22 영향 0 실측** (Node 비종속 — WASM+Chromium 렌더링, baseline 재측정 불요). 정확 버전이라 #606 root cause (engines 범위 해석) 와 무관 — Amendment 3 "전수 명시 핀" 의도를 중앙 SSoT 로 보존. #606 ADR Amendment 4 Accepted (cross-validate agy 이견 0). **Behavior Changes: CI 만**.
- **[#684] Playwright Chromium 바이너리 캐싱 (`actions/cache`) — extract deadlock 직교 2차 방어** ([#684](https://github.com/coseo12/astro-simulator/issues/684)) — 6 workflow 에 `actions/cache@v4` (`~/.cache/ms-playwright`, key `playwright-{os}-hashFiles(pnpm-lock)`) + 히트/미스 분기 (미스=`install --with-deps` extract O / 히트=`install-deps` **extract 생략**). **양 경로 CI 실측**: 미스 ci 29s·bench 26s → 히트 13s·14s. **Node 22 핀 (1차) ↔ extract 생략 (2차)** defense-in-depth — 캐시 히트 시 extract 단계 자체 미발생 = #606 deadlock 발생 불가. #606 ADR Amendment 5 Accepted (agy 제안 범위 내 → cross-validate 재발동 비대상). **Behavior Changes: CI 만**.

## [0.26.0] — 2026-06-13

### Behavior Changes (#677 forensic — tier-c LOD override race fix)

- **[#675-forensic] tier-c 강제 LOD override race fix — headless/저속 환경에서 강제 low LOD 영구 유실 (잠복 버그, glow 무관 입증)** ([PR #677](https://github.com/coseo12/astro-simulator/pull/677) 커밋 cd9603f, ADR `20260613-675-glow-pixel-marker.md` Amendment 2) — CI fps-baseline-guard mobile 3 시나리오 −36~43% FAIL 의 forensic 결과: glow marker 비용 ≈ 0 (order 통제 A/B 실측) 이고 **glow 부재 develop run 27412497611 이 동일 시그니처 선행 FAIL** — 원인은 `sim-canvas.tsx` 의 tier-c 판정 (`detectGpuCapability().then` 플래그 박제) 와 handler 등록 (`instance.start().then` 1회 읽기) 의 별개 async chain race. race-lost 시 강제 low 영구 유실 → auto LOD (sun high 131.7px sphere) 렌더가 swiftshader CI 에서 증폭. **fix**: tier-c 분기에서 `setLodOverride` command 직접 발행 동승 (적용 경로 2중화, 양 경로 idempotent, `?lod=` URL 우선 보존). **회귀 가드**: `browser-verify-glow-marker.mjs` 축 6 신설 (requestAdapter 를 scene 준비까지 게이트 — race-lost 방향 결정론 재현, pre-fix FAIL / post-fix PASS 3중 시뮬레이션). #663 으로 복구된 fps 가드가 첫 실전에서 잠복 race 를 노출시킨 연쇄 — 증분 reviewer + cross-validate (agy) 검증 완료.

### Behavior Changes (#675 glow pixel marker 정식화 — 기본 ON)

- **[#675] glow pixel marker 정식화 — 줌아웃 sub-pixel body 의 화면 고정 크기 글로우 표기, 기본 ON + `?marker=off` 옵트아웃 (MINOR, ADR Accepted cross-validate 2026-06-12 agy outcome=applied)** ([#675](https://github.com/coseo12/astro-simulator/issues/675)) — 사용자 요청 (2026-06-12) → `preview/glow-marker` 3-iteration 실 Chrome D-T2 만족 승인 → PM 확정값 5종 정식화. ADR `20260613-675-glow-pixel-marker.md` SSoT. **확정 박제값 (PM 2026-06-13)**: 발동 = **실 billboard 렌더 px** (측정 pxDiameter ÷ bodyScale) **< 4** + low LOD (iteration 2 fix — effective px [4,16) 데드존 해소, volt #32 measurement-first) / 크기 계층 **2:1** (parent 4.5px / satellite 2.25px — `?ratio=` 디버그 유지) / **sun 포함 27 body 전수** (star 도 parent 동급 4.5px — iteration 3) / emissive boost parent **1.6** / satellite **2.0** (휘도 보상 실측값, 해제 시 star full / non-star ×0.3 원복). **기본 ON 은 web 레이어 결정** — `parseMarkerMode` 기본값 `'glow'` (미지정/이상값 → glow, `?marker=off` 옵트아웃 = 기존 동작 100% 보존), core `glowMarker` 옵션 기본값 false 유지 (NullEngine 테스트 무회귀 — ADR §축 1 레이어 분리). **판정 식 순수 모듈 분리**: 신규 `packages/core/src/scene/glow-marker.ts` (`resolveGlowMarker()` + PM 확정 상수 export — Babylon 미의존 고속 단위 테스트, agy "매우 적절함") — scene (runLodPass) 은 호출 + mesh/material 적용만 (frame loop 구조·연산량 프리뷰 동일, emissive 쓰기는 상태 전이 시 1회). **주석 계약 개정** (ADR §축 2 SSoT): "mesh.scaling 은 high variant 만" → low variant quad 의 glow 역보정 예외 1건 추가 (position owner 단일성 불변, mid 여전히 금지). **popping 명시 수용** (ADR §축 3 — 발동/해제 경계가 LOD low 경계와 일치, 27 body 전수 bodyScale ≥ 48 → low 대역 실 billboard px ≤ 0.33 ≪ 4 — 기존 200ms cross-fade 마스킹, 코드 0). **off-frustum 가드 유지** (`pxDiameter` 유한·양수 — fail-safe, ADR §축 4). **ring 동반 body glow dot + 잔존 ring 픽셀 공존 명시 수용** (ADR §축 5 — 코드 0). **신규 가드**: `glow-marker.test.ts` (발동 경계/2:1/sun 동급/star 원복/off-frustum/clamp + 4px SSoT drift 가드) + `parse-marker-mode.test.ts` (기본 ON 계약) + `browser-verify-glow-marker.mjs` 5축 (40 AU +10 / 100 AU +11 식별 천체 / `?marker=off` 격리 / off-frustum / 100 AU 전수 발동 / `?marker=glow` 하위 호환) CI 통합 (port 3008). **pixel-diff baseline 전면 갱신 — 의도된 Behavior Change** (default 뷰에 glow 픽셀 등장, bootstrap feature-ref dispatch — 사전 등록). px-ratio/diskArea/fps/a11y/정적 가드 갱신 0 (해석적 산출 — ADR §축 1 측정 정의). **MINOR 분류** — 기본 ON UX Behavior Change. 비-범위: 클릭 raycast (#624 후속) / ring low LOD 숨김 / LOD 결정 로직 변경 / marker 설정 UI / 동적 DPR / 모바일 별도 targetPx / bloom post-process.

## [0.25.0] — 2026-06-12

### Docs (R10 통합 회고 — 로드맵 v3 종결 기록)

- **[#664] R10 통합 회고 + off-by-one 표기 정정 + halley-x10 description polish** ([PR #672](https://github.com/coseo12/astro-simulator/pull/672)) — `docs/retrospectives/r10-retrospective.md` 신규 (달성도/잘 된 것/어려웠던 것/인수인계 4섹션 — 로드맵 v3 27 body 전수 완주 종결 기록 겸함). bar 버튼 카운트 off-by-one drift 정정 (qa 실측 14 = focus 12 + reset + free-fly — R9 부터 +1 누적, focus-quick-buttons.tsx 주석 2곳 + R10b ADR §축 6). scenario-presets halley-x10 description "(R10b 진입 완료 — 활성)" (reviewer 권고 2). **Behavior Changes: None — 문서/문구만** (preset description 문자열 1건은 표기 정정).

### Behavior Changes (R10b 혜성 3 body 시각화 — 로드맵 v3 최종 라운드)

- **[#664] R10b 혜성 3 body 시각화 (halley/encke/swift-tuttle) — 고이심률 궤도선 첫 사례 (e=0.967) + comet scale 5번째 그룹 + negative 가상 ID 3분류 전환 + 로드맵 v3 완주 (MINOR, ADR Accepted cross-validate 2026-06-12 agy outcome=applied)** ([#664](https://github.com/coseo12/astro-simulator/issues/664)) — 로드맵 v3 §R10 분할 후행 라운드 (PM 2026-06-12: Q1=A comet=5000 / Q2=A halley 만 bar 승격 / Q3=A 64 seg 유지 + measurement-first / Q4 negative 가상 ID 전환 + v0.25.0 독립 릴리스). ADR `20260612-r10b-comets-visualization.md` SSoT. **확정 박제값**: `BODY_SCALE.{halley,encke,swift-tuttle}=5000` (**comet 그룹 — 5번째 scale 그룹, phobos/deimos 극소형 계보 답습 — PM Q1=A**. 그룹 단일값으로 그룹 내 사실 서열 swift-tuttle > halley > encke 자동 보존 + cross-group swift-tuttle×5000 < ceres×800 비 0.173 보존 + 5000 통합 그룹 사실 서열 swift-tuttle > phobos > deimos > halley > encke. 식 px 0.085~0.460 — **3 body 전부 sub-px billboard 4px fallback 전면 의존, PM 명시**) / `CURRENT_R_PHASE=10→11` (#613 자동 생성 7번째 실전 — allowlist **27 body, 전 데이터 소진 = 로드맵 v3 시각화 라운드 완주**) / halley `showInShortcutBar=true` + `FOCUS_BUTTONS` halley 1줄 (PM Q2=A — halley 만 승격, **15버튼 비-행성 카테고리 후미 컨벤션 신규 박제** — a 17.834 AU 거리순 엄격 삽입 (saturn/uranus 사이) 은 행성 8 거리순 블록 파괴로 기각. encke/swift-tuttle 은 URL `?focus=` 진입 — #624 tradeoff) / `PX_RATIO_THRESHOLDS` 3 body 전부 N/A 미박제 (8번째 그룹 — 실측 sunPxRatio 0.02~0.11%). **고이심률 궤도선 조건부 축 발동 (PM Q3 measurement-first 적중)**: 64 seg D-T2 실측에서 halley/swift-tuttle 원일점측 다각형 꺾임 육안 식별 (ADR 사전 산출 13.97px/13.45px = eris 식별-불가 기준선 1.10px 의 12.7배 — **예측 정합**) → fix 1순위 `sampleOrbitPoints` **`segments = e >= 0.6 ? 256 : 64`** (진근점각 등간격 유지 — 근일점 자동 밀집 보존. **기존 24 body 전부 e < 0.6 이라 seg 64 불변 = vertex 동일, pixel-diff 기존 궤도선 무영향**. 2-pass 재실측으로 꺾임 해소 확인. 임계 0.6 anchor: 최대 OK eris 0.436 ↔ 최소 혜성 encke 0.848) + 신규 단위 가드 `orbit-line-segments.test.ts` (소스 정적 매칭 + 데이터 경계 2축). **negative 가상 ID 3분류 전환** (phase 11 진입으로 미진입 실데이터 0 — agy 1순위 권고의 분기-semantics 정밀화): ① 순수 membership 가드 (isRPhaseFocusable / simulation-core focusOn / getBodyScale default + E2E 4-A) → 가상 ID **`nonexistent-body`** (phase 진행 영구 비종속 — phase 12+ 동명 실데이터 등록 금지) ② UI disabled/blocked 계약 4 파일 (url-sync / celestial-tree / celestial-info-panel / scenario-presets 단위) → **vi.mock 부분 mock** (`importOriginal` passthrough — isRPhaseFocusable 만 지정 body false) ③ E2E disabled 경로 → positive 전환 + 축 종료 (`RPHASE_TREE_EXPECTED_DISABLED=[]` + 6-H halley-x10 **zero-touch enabled 재현 6번째**, preset 코드/데이터 변경 0). **역행 혜성 2 body**: halley i=162.26° / swift-tuttle 113.45° — 공전 방향 반대 = 사실 정합 (R9 triton 선례, 코드 0. **역행 2 + 순행 1 (encke 11.78°) 혼재 첫 프레임**). **가드 동기화 24→27 body**: FOCUS_BODIES (#598) / r1-guard targetIds (#619) / RPHASE_EXPECTED_ENABLED +halley (#617). **Concrete Prediction 실측**: 확정 코어 5 라인 + 조건부 +1 라인 (발동) = **6 라인 ≤ 7 적중** / ring·tilt·satellite·tier·LOD·물리 변경 0 적중. **모바일 (375×667) cumulative diskArea 16.818% = R10a baseline 정확 동일** (혜성 3 전부 off-screen — 보수 상한 +0.02%p 미만 실측 0) ≤ 25%. time-reversal **변경 0** (혜성 3 기적분 suite green — halley e=0.967 포함). **pixel-diff baseline 변화 — 의도된 Behavior Change** (혜성 궤도선 근일점측 q 4.23~12.13 unit 이 default 프레임 radius 35 관통 — R10a "변화 0" 과 상이, 사전 등록. Linux baseline bootstrap 갱신 필요). **검증**: core 475 / web 342 / shared 4 PASS / verify:378-focus **54/54** (27 body × 2 modes) / verify:r-phase-allowlist PASS (4-A 가상 ID + 6-H positive) / px-ratio 3 viewport PASS (기존 24 body 무회귀) / 줌아웃 도달 radius 실측 halley 901 / swift-tuttle 1,023 / encke 60.5 unit (전부 eris 기준선 2,353 미만 — 구조 보장 적중) / 캡처 8장 `docs/reports/664-r10b-*.png` (64seg-before 꺾임 증거 포함). **MINOR 분류** — R10b body 시각화 (Behavior Change). 비-범위: 꼬리·코마 / 비중력 효과 / 궤도 세차 / halley 비구형 표현 / 위성 데이터 확장 / 신규 negative preset / 클릭 raycast.

## [0.24.0] — 2026-06-11

### Behavior Changes (인프라 — #663 a11y/fps baseline guard 복구)

- **[#663] a11y/fps-baseline-guard Node 22 핀 — playwright Node 24.16 deadlock 잔여 2 workflow fix (#606 ADR Amendment 3)** ([#663](https://github.com/coseo12/astro-simulator/issues/663)) — `a11y-baseline-guard.yml` / `fps-baseline-guard.yml` 의 `node-version-file: 'package.json'` (engines `">=20.0.0"` → setup-node 최신 24.16 해석) 이 playwright 1.59.1 extract deadlock (#606 root cause 동형) 을 유발, **R9 (2026-06-10) 시점부터 모든 브랜치에서 "Playwright chromium 설치" 단계 timeout cancelled 상시** (required check 아님 — 머지 비차단이나 a11y/fps 회귀 감지 silent 무력화). fix: `node-version: '22'` 명시 핀 (ci.yml #610 동형) + `workflow_dispatch` 수동 재실측 경로 (volt #45 2단계 함정 — main 반영 후 사용 가능). **fix PR #665 자가 입증**: 본 PR CI 에서 양 가드 green (R9 이후 첫 측정 완주 — `.github/**` paths-ignore 우회는 runtime 파일 동반으로 확보). **#606 ADR Amendment 3 정책 박제**: playwright 사용 workflow 전수 `node-version` 명시 핀 의무 (engines 범위 해석 금지 — 전수 감사: bench/bench-remeasure/r1-bootstrap 기핀 20/22 확인, 미핀은 본 2개가 전부) + ci.yml 잔존 `node-version-file` 3곳 NO-OP 분류 (yarn/npm/no-lockfile 폴백 — pnpm-lock 존재로 dead path). cross-validate (agy outcome=applied): 중앙 `.node-version` 일원화 고유 발견 → #666 분리 (low). reviewer 권고 stale 주석 2건 동반 정정 (browser-verify-r-phase-allowlist "19→24 body" / pluto-x10 description). **Behavior Changes: CI 만** (앱 런타임 무관).

### Behavior Changes (R10a 왜소행성 5 body 시각화)

- **[#659] R10a 왜소행성 5 body 시각화 (ceres/pluto/haumea/makemake/eris) — 첫 비-행성 라운드 + dwarf scale 4번째 그룹 + R10a/R10b allowlist 분리 메커니즘 (MINOR, ADR Accepted cross-validate 2026-06-11 agy outcome=applied)** ([#659](https://github.com/coseo12/astro-simulator/issues/659)) — 로드맵 v3 §R10 분할 첫 라운드 (PM 2026-06-11: Q1=A R10a 왜소행성 5 / R10b 혜성 3 독립 릴리스). ADR `20260611-r10a-dwarf-planets-visualization.md` SSoT. **확정 박제값**: `BODY_SCALE.{ceres,pluto,haumea,makemake,eris}=800` (**dwarf 그룹 — 4번째 scale 그룹, inner 700~800 계보 답습 — PM Q2=A**. 그룹 단일값으로 그룹 내 사실 서열 pluto > eris > haumea > makemake > ceres 자동 보존 + cross-group pluto×800 < mercury×700 비 0.557 보존. 식 px: pluto 6.73 / eris 6.59 / haumea 4.42 / makemake 4.05 / ceres 2.66 — solar view 실효는 depth 투영 축소로 **5 body 전부 billboard 4px fallback 의존**. scale 4그룹 체계 완성: inner 700~800 / gas giant 48 / ice giant 250 / dwarf 800) / **혜성 3 body (halley/encke/swift-tuttle) `introducedInRPhase` 10→11 재박제** (**R10a/R10b allowlist 분리 메커니즘 — 데이터 3값 + `$comment`, 코드 0**. 로드맵 라벨 ↔ phase 정수 매핑 **R10a=10 / R10b=11** 을 데이터 `$comment` + allowlist 주석 + 로드맵 문서 3곳 동시 박제 — §위험 #6) / `CURRENT_R_PHASE=9→10` (#613 자동 생성 6번째 실전 — allowlist 24 body, 혜성 3 자동 제외) / pluto `showInShortcutBar=true` + `FOCUS_BUTTONS` pluto 1줄 (PM Q3=A — pluto 만 승격, 14버튼 거리순 마지막. ceres/haumea/makemake/eris 는 URL `?focus=` 진입 — #624 tradeoff) / `PX_RATIO_THRESHOLDS` **5 body 전부 N/A 미박제** (4px fallback 의존 — phobos/deimos §결정 6 답습 7번째 그룹, **임계 박제 0 인 첫 라운드**). **negative 케이스 2 직교 축 재배치** (pluto positive 전환으로 기존 negative 커버리지 소멸): ① allowlist 미진입 축 pluto → **halley** (URL 4-A / tree 5-B·5-C / url-sync·celestial-tree·celestial-info-panel·body-scale·simulation-core 가드 테스트 + RPHASE_TREE_EXPECTED_DISABLED) ② bar 미등록 직교 축 (#617) = **ceres 등 4 body** (parent=sun 첫 bar-미등록 사례 — 가드 주석 박제). **scenario preset**: pluto-x10 zero-touch 자동 enabled (Concrete Prediction 재현 5번째) + halley-x10 신규 (R10b negative). **가드 동기화 19→24 body**: FOCUS_BODIES (#598) / r1-guard targetIds (#619) / RPHASE_EXPECTED_ENABLED +pluto (#617). **신규 단위 가드**: dwarf 서열 정량 가드 (strict 부등호 4 + cross-group 비 0.557±0.01 + 그룹 동일값 800) + 혜성 phase 11 검증 (R10a/R10b 분리 회귀 가드) + R10b phase 11 시뮬레이션 27 body. time-reversal **변경 0** (5 body 기박제 — 공전 주기 4.6~559 yr 는 단주기 위성 누적 메커니즘 비해당). **MINOR 분류** — R10a body 시각화 (Behavior Change). 비-범위: 혜성 3 진입 (R10b) / 혜성 꼬리·코마 / charon 등 왜소행성 위성 (데이터 부재) / 궤도 세차 / haumea 비구형 표현 / 클릭 raycast 선택.

## [0.23.0] — 2026-06-11

### Behavior Changes (R9 해왕성 + 고리 + 트리톤 시각화)

- **[#653] R9 해왕성 + 고리 (composite) + 트리톤 시각화 — ice giant 정책 2번째 인스턴스 + ring·tilt 이중 코드 0 (3연속) + 역행 위성 첫 사례 (로드맵 마지막 행성) (MINOR, ADR Accepted cross-validate 2026-06-10 agy outcome=applied)** ([#653](https://github.com/coseo12/astro-simulator/issues/653)) — 로드맵 v3 §R9 진입. ADR `20260610-r9-neptune-triton-rings-visualization.md` SSoT. **확정 박제값**: `BODY_SCALE.neptune=250` (**ice giant 정책 답습 2번째 인스턴스** — uranus 동일값으로 neptune/uranus px 비 0.969 = 사실 radius 비 자동 보존, R5 mars=earth / R7 saturn=jupiter 동형 3번째. px 43.84 / neptune/earth 1.21. "ice giant = 250" 단일 mental model 완성) / `BODY_SCALE.triton=300` (triton/neptune 비 0.0656 — moon/earth 0.068 최근접. **titania=500 답습은 비 0.109 상한 초과 기각 — 비율 산출 방법론이 SSoT, scale 값 답습 아님**. 4px fallback billboard 의존) / `solar-system.json` triton body 신규 (JPL Horizons 2026-06-10 쿼리, **Neptune-centric J2000 Ecliptic + 2026-01-01 TDB epoch** — IN 129.1418°/OM 222.6557°/ϖ 231.5353°/L 272.3256°, a/e 는 NASA Fact Sheet. **⚠️ inclination 129.14° > 90° = 역행 (태양계 유일 대형 역행 위성) — 공전 애니메이션이 다른 모든 body 와 반대 방향인 것이 사실 정합, 버그 아님 (PM Q1 사전 등록). NASA 통념 157° 는 적도면 기준 — > 90° 가 frame 무관 불변량**) / neptune.rings **1 composite layer** (41,000~62,930 km — Galle/Le Verrier/Lassell/Arago/Adams 5 rings 를 densityProfile 12점 피크로 실측 반경 정규화 위치 표현, Adams @1.0 최대 밀도. colorHint #6F635A + ringAlphaHint 0.7. **Adams arcs 균질 근사는 PM Q2 합의 — 방사 densityProfile 의 각도 방향 한계, 의도된 근사**) / neptune `axialTiltDeg=28.32` (R8 tilt 인프라 재사용 — **데이터 1값, 코드 0**) / `NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE=75` (binding = Adams ring outer mesh — R7 유형 3번째, 마진 1.65x R8 titania 정확 동률. **×50 uranus 답습은 1.10x 함정값** — Adams 상대 확장 2.541 > uranus ε 2.001) / `CURRENT_R_PHASE=8→9` (#613 자동 생성 5번째 실전 — allowlist 19 body) / **shortcut bar 변경 0** (neptune showInShortcutBar 이미 true + FOCUS_BUTTONS 기존재 → 1줄 자동 enabled, #613 Concrete Prediction negative→positive 전환 5번째). **Concrete Prediction 적중**: ring 렌더 경로 + tilt 경로 (loader/scene/shader) **이중 코드 0 — R7→R8→R9 3연속** (R8 tilt 인프라 1회 비용의 정량 증거) / **코어 합계 5 라인 = 예측 ≤ 5 정확 적중** (R8 23 라인 대비 −78%). **r1-guard neptune 임계 = 4.9** (실측 4.66% 3 viewport 완전 결정적 × 1.05 — 식 17.80% 대비 ×0.26 축소, uranus ×0.41 과 같은 방향의 perspective artifact 로 depth 30.07 AU 확대. triton N/A — 실측 0.31% sub-pixel). **모바일 diskArea cumulative 16.82% ≤ 25%** (R8 baseline 동일 — neptune 모바일 off-screen 분류 ADR 예상 정확 적중). **time-reversal triton 제외** (실측: 미제외 시 1년 vel relErr 3.826e-9 > 1e-9 임계 — 주기 5.877d, R8 titania 선례 메커니즘 재현. 역행은 대칭성과 무관). **scenario preset**: neptune-x10 zero-touch 자동 enabled (Concrete Prediction 재현 4번째) + pluto-x10 신규 (R10 negative 케이스 교체 보존). **negative 케이스 구조 변화**: 로드맵 마지막 행성 진입으로 shortcut bar disabled 대상 소멸 (R10 8 body 전부 bar 미등록) — negative 는 URL 4-A (pluto) + CelestialTree 5-B/5-C (pluto) + preset 6-G (pluto-x10) 가 보존. **검증**: core 466 / web 313 tests PASS / typecheck·lint 신규 0 / verify:378-focus 38/38 (19 body × 2 modes) / verify:r-phase-allowlist PASS (6-F neptune enabled + 6-G pluto 차단) / verify:627-satellite-orbit PASS (neptune distToParent 0.0000, scaling=75) / verify:629/631 무회귀 / px-ratio 3 viewport PASS / 콘솔 에러 0 / 스크린샷 6장 `docs/reports/653-r9-*.png`. **D-T2 실 Chrome GUI 수동 검증은 사용자 위임** (headless ≠ 실 브라우저, volt #77) — triton 역행 공전 방향 + tilt 28.32° 타원 고리 + uranus/saturn/jupiter 무회귀. **MINOR 분류** — R9 body 시각화 (Behavior Change). 비-범위: Adams arcs 각도 비균질 / nereid·proteus 등 추가 위성 / triton Laplace 세차 / pole RA/Dec 정밀화 / R10 진입.

## [0.22.0] — 2026-06-10

### Behavior Changes (R8 천왕성 + 고리 + 티타니아 시각화)

- **[#647] R8 천왕성 + 고리 (composite) + 티타니아 시각화 — ice giant 정책 신설 + axial tilt 인프라 (97.77° 세로 고리, saturn 26.73° 동반) (MINOR, ADR Accepted cross-validate 2026-06-10 agy outcome=applied)** ([#647](https://github.com/coseo12/astro-simulator/issues/647)) — 로드맵 v3 §R8 진입. ADR `20260610-r8-uranus-titania-rings-visualization.md` SSoT. **확정 박제값**: `BODY_SCALE.uranus=250` (**ice giant 정책 신설 — 3번째 scale 그룹**: 사실 비율 sun 3.67% 명시 위배 + earth 대비 직관 우선, PM 제약 "천왕성 > 지구" — px 45.24 / uranus/earth 1.25. ⚠️ uranus > jupiter/saturn 시각 역전은 PM 제약의 수학적 필연 — 회귀 보고 시 PM 재합의 라운드 필수, §위험 #1) / `BODY_SCALE.titania=500` (titania/uranus 비 0.0617 — moon/earth 0.068 수렴대, 4px fallback billboard 의존) / `solar-system.json` titania body 신규 (JPL Horizons 2026-06-10 쿼리, **Uranus-centric J2000 Ecliptic** — IN 97.7633°/OM 167.6422°/ϖ 69.5337°/L 17.8379°, a/e 는 NASA Fact Sheet. **세로 궤도 (~98°) 는 사실 정합 — uranus 계 전체 누움, 버그 아님**) / uranus.rings **1 composite layer** (41,837~51,149 km — 9 narrow rings 가 전부 sub-pixel 이라 densityProfile 15점 피크로 실측 반경 정규화 위치 표현, ε @1.0 최대 밀도. colorHint #5A5E66 + ringAlphaHint 0.8) / `URANUS_SATELLITES_ORBIT_VISUAL_SCALE=50` (binding = ε ring outer mesh — R7 유형 2번째, 마진 1.65x. ×30 은 ring 미고려 함정값 0.99x fail) / `CURRENT_R_PHASE=7→8` (#613 자동 생성 4번째 실전 — allowlist 17 body) / uranus `showInShortcutBar=true` + `FOCUS_BUTTONS` uranus 1줄 (12버튼 — 모바일 overflow-x-auto 흡수). **axial tilt 인프라 (R8 유일 코어 확장)**: body `axialTiltDeg` optional zod 스키마 (0~180) → ring 생성 3경로 (shader/fallback/placeholder) `rotation.x = π/2 + tiltRad`. uranus 97.77° (**세로 고리 — R8 핵심 showcase**) + **saturn 26.73° 동반 적용** (R7 비-범위 해소 — saturn ring 외형 변화는 의도된 Behavior Change, r1-guard Linux pixel baseline `--update` 갱신 필요). jupiter 미지정 → tilt 0 폴백 (하위 호환 무회귀, runtime 실측 90°/116.73°/187.77°). 방위각은 world X 고정 근사 (pole RA/Dec 미사용 — §위험 #6). **densityProfile zod `.max(16)`** (agy 수용 — shader MAX_DENSITY_POINTS=16 정합, uniform overflow 파싱 차단). **모바일 diskArea off-screen 제외** (R7 Amendment 1 ③ 이행, 옵션 a): r1-guard 가 projected center viewport/NDC 밖 body 를 cumulative 에서 제외 + `offScreenBodies` 보고 — saturn perspective artifact 오염 해소, **신규 baseline 16.82%** (≤ 25%, ADR 예상 9.96% 괴리는 사전 추정 오차 — 측정 정상, Amendment 1 ②). **r1-guard uranus 임계 = 7.9** (실측 7.52% 3 viewport 완전 결정적 × 1.05 — 식 18.37% 대비 ×0.41 축소, saturn ×6.8 부풀림과 같은 뿌리의 반대 방향 perspective artifact. titania N/A). **Concrete Prediction**: ring 렌더 경로 (tilt 제외) 변경 **0 적중** (R7 예측 재현 — generic 결합 추상화 건강성 입증) / 코어 23 라인 (예측 ≤18 +5 — 시그니처 threading 비용 과소 추정, Amendment 1 ③ 정직 박제). **scenario preset**: uranus-x10 zero-touch 자동 enabled (3번째 재현) + neptune-x10 신규 (negative 케이스 교체 보존). **검증**: core 457 / web 303 tests PASS / typecheck 신규 0 / verify:378-focus 34/34 (17 body × 2 modes) / verify:r-phase-allowlist PASS (6-E uranus enabled + 6-F neptune 차단) / verify:627-satellite-orbit PASS (uranus distToParent 0.0020, scaling=50) / verify:629/631 무회귀 / px-ratio 3 viewport PASS / 콘솔 에러 0 / 스크린샷 5장 `docs/reports/647-r8-*.png`. **D-T2 실 Chrome GUI 수동 검증은 사용자 위임** (headless ≠ 실 브라우저, volt #77) — 세로 고리 + titania 세로 궤도 + saturn tilt + tilt 방위 시각 정합 (agy D-T2 확인 항목). **MINOR 분류** — R8 body 시각화 + saturn ring tilt (Behavior Change). 비-범위: miranda/ariel/umbriel/oberon (R9+) / ν·μ dust ring / jupiter tilt 3.13° / 본체 자전 / pole RA/Dec 정밀화 / neptune 진입.

## [0.21.0] — 2026-06-10

### Behavior Changes (R7 D-T2 — ring shader 잠복 결함 fix 2건)

- **[#641-D-T2] ring shader inner cutoff + 로그 depth 정합 — P9 잠복 결함 2건 fix (MINOR, R7 D-T2 2 라운드)** — R7 ring × bodyScale 결합이 jupiter/saturn ring 을 처음 가시화하며 P9 ring shader 의 잠복 결함 2건 표면화 (사용자 D-T2 실 Chrome 발견 — "fix 가 가려진 결함 노출" 패턴 3번째): **① inner cutoff 부재** — fragment 에 layer innerRadius cutoff 가 없어 `interpDensity` 의 r≤profileR[0] clamp 가 disc 중심까지 칠함 → 5층 누적 불투명 원반에 본체 묻힘 ("고리 부자연"). fix: `innerRatio` uniform discard (annulus) + densityProfile 을 [inner, outer] layer 구간 재정규화 (Encke gap 0.782 데이터 의도 검산 정합). fallback InstancedMesh 경로는 원래 정상 (innerScene 사용). **② 커스텀 ShaderMaterial 로그 depth 불일치** — scene `enableLogarithmicDepth` 가 본체(StandardMaterial)를 로그 depth 공간에 기록하는데 ring shader 는 표준 z 기록 → depth 비교 공간 불일치로 가림 엉터리 ("행성이 항상 고리 위"). fix: ring fragment 에 Babylon logDepth 공식 (`gl_FragDepth = log2(1+w) × logDepthConstant × 0.5`, 상수 = 2/log2(maxZ+1)). **재사용 계약: 본 코드베이스에 커스텀 ShaderMaterial 추가 시 로그 depth 기록 필수** (안 하면 본체와 가림 깨짐). 검증: 얕은 각도 (7°/20°) 에서 고리 앞=본체 앞 / 뒤=가림 정상 + core 447 PASS + 사용자 D-T2 만족 확인.

### Behavior Changes (인프라/NO-OP — #626 + R6 후속 3건 종결)

- **[#626] fps/a11y baseline guard paths-ignore — docs-only PR 25/20분 timeout 제거** ([#626](https://github.com/coseo12/astro-simulator/issues/626)) — 두 워크플로 `pull_request`+`push` 트리거에 `paths-ignore`(`**/*.md`, `docs/**`, `.github/**`) 추가 (fail-safe — 코드/데이터/config 있으면 실행). **실증**: PR #637(.github 만 변경)에서 fps/a11y SKIP — GitHub paths 필터는 head-based 즉시 효과 (workflow_dispatch 2단계 함정과 다름). **Behavior Changes: CI 만** (앱 런타임 무관).
- **[#623] body 가시성 px 산출 DPR 기준 — physical px 일관 확인 (NO-OP)** ([#623](https://github.com/coseo12/astro-simulator/issues/623)) — DPR 1 vs 2 실측: 모든 body pxDiameter 정확히 ×2 (`adaptToDeviceRatio:true` → `getRenderHeight` 물리 px) → coverage·threshold 동일 물리 px 공간 정합, 버그 없음. lod.ts 주석 + NO-OP ADR `20260609-623` 박제. 동적 DPR (런타임 모니터 이동/줌) 은 경계 박제만.
- **[#622] satellite orbit visual scale 1.7배 gap — 측정-정의 artifact 확정 (NO-OP)** ([#622](https://github.com/coseo12/astro-simulator/issues/622)) — boundingSphere stale/fresh=1.0 실측으로 #611 worldMatrix 타이밍 가설 기각. 산식 A (설계 real-meter) ↔ B (런타임 scene-unit) 의 scale 합성 정의 차이 — runtime 버그 아님, 시각 회귀 0. orbit-visual-scale.ts WARNING 주석 (재오인 분석 금지) + NO-OP ADR `20260609-622`.
- **[#624] galilean occlusion — 클릭 picking 미구현이라 버그 부재 (NO-OP)** ([#624](https://github.com/coseo12/astro-simulator/issues/624)) — 코드 전수 grep (scene.pick / onPointerObservable / ActionManager 0건) 으로 클릭 raycast 부재 확정 → occlusion 버그 발생 불가 (이슈가 미구현 feature 가정). body 선택은 shortcut bar / URL / command 뿐 — galilean 은 URL `?focus=` 로 정확 선택. 클릭 선택은 신규 feature 분리. NO-OP ADR `20260609-624`.

### Behavior Changes (R7 토성 + 고리 + 타이탄 시각화)

- **[#641] R7 토성 + 고리 5층 + 타이탄 시각화 — 거성 예외 2번째 인스턴스 + ring × bodyScale 결합 (코어 인프라 1회 확장) (MINOR, ADR Accepted cross-validate 2026-06-10 agy outcome=applied)** ([#641](https://github.com/coseo12/astro-simulator/issues/641)) — 로드맵 v3 §R7 진입. ADR `20260610-r7-saturn-titan-rings-visualization.md` SSoT. **확정 박제값**: `BODY_SCALE.saturn=48` (jupiter 동일값 — saturn/jupiter mesh 비 0.843 = 사실 radius 비 정확 보존, R5 mars=earth 선례 동형. 식 px 비 8.32% ≤ 8.5% 거성 임계) / `BODY_SCALE.titan=100` (galilean 최종값 답습, titan/saturn 비 0.089) / `solar-system.json` titan body 신규 (JPL Horizons 2026-06-10 쿼리, **Saturn-centric J2000 Ecliptic** — IN 27.709°/OM 169.0774°/ϖ 347.0208°/L 339.3313°, a/e 는 NASA Fact Sheet) / saturn.rings 5층 (D/C/B/A/F — NASA/JPL 실측 반경, Cassini Division 은 B–A 층간 gap 자연 표현, Encke gap 은 A ring densityProfile dip @0.782, F ring 140,180 km = saturn 반경 2.326배) / `SATURN_SATELLITES_ORBIT_VISUAL_SCALE=10` (**binding constraint = ring outer mesh — R4/R5/R6 과 다른 신규 유형**, 산식 A 마진 1.75x) / `CURRENT_R_PHASE=6→7` (#613 자동 생성 3번째 실전 — allowlist 15 body) / saturn `showInShortcutBar=true` + `FOCUS_BUTTONS` saturn 1줄. **ring × bodyScale 결합 (R7 유일 코어 인프라 확장)**: body mesh 는 생성 시점 bodyScale bake 인데 ring disc 는 실반경 × renderScale 만 — 미결합 시 saturn 고리가 mesh 안에 완전히 묻힘 (실측 확정). scene ring 생성부에서 host `bodyScale` 을 ring 반경에 rendering 시점 곱해 ring/body 비율 = 사실 비율 보존 (데이터 SSoT 무수정, generic). **부수효과 — jupiter ring 가시화** (R6 비-범위 해제): generic 결합으로 jupiter.rings (outer 3.16배) 도 보임 → 신규 optional 스키마 `ringAlphaHint` (saturn **0.9** prominent / jupiter **0.15** faint — PM Q3 대조, 미지정 0.6 하위 호환) + ring layer 별 `colorHint` (saturn 5층 톤 분리, jupiter 미지정 → DEFAULT `#887766` 폴백 무회귀). **r1-guard saturn 임계 = 59.7** (실측 56.89% × 1.05, 3 viewport 결정적): ADR 예상 ~13.1% 과 괴리 → §재검토 트리거 #4 절차 (측정 방법 검증 우선, volt #32) 수행 — default solar view 에서 saturn (9.54 AU) 의 view-space depth w=5.13 (유클리드 111.4 unit) 로 perspective division 이 투영 직경을 ×21 부풀리는 **측정-정의 artifact** 확정 (jupiter +57% 와 같은 뿌리의 극단값, wsRadius 비 0.843 정확 → scale 박제값 정상). titan 은 N/A (4px fallback). **scenario preset**: saturn-x10 zero-touch 자동 enabled (#404 Concrete Prediction 재현 2번째) + uranus-x10 신규 (disabled-path negative 케이스 교체 보존 — R6 saturn-x10 선례). **검증**: core 447 tests PASS / web 299 tests PASS / typecheck 0 / verify:378-focus 30/30 (15 body × 2 modes) / verify:r-phase-allowlist PASS (6-D saturn enabled + 6-E uranus 차단) / verify:627-satellite-orbit PASS (saturn LineSystem 자동 확장 — distToParent 0.0296, scaling=10) / px-ratio 3 viewport PASS + 모바일 누적 22.96% ≤ 25% / 콘솔 에러 0 / 얕은 각도 ring z-fighting 무발생 (headless) / 스크린샷 6장 `docs/reports/641-r7-*.png`. **D-T2 실 Chrome GUI 수동 검증은 사용자 위임** (headless ≠ 실 브라우저, volt #77). **MINOR 분류** — R7 body 시각화 + jupiter ring 가시화 (Behavior Change). 비-범위: enceladus 등 추가 위성 (R8+) / E ring / ring tilt 26.73° (후속 분리) / ring shadow / titan 대기 헤이즈 / uranus 진입.

## [0.20.0] — 2026-06-09

### Behavior Changes (free-fly 카메라 회귀 fix #629/#631 + Vercel 빌드 인프라 #633)

- **[#629] free-fly 줌 "고정" 회귀 fix — wheelDeltaPercentage (scale-invariant zoom) (MINOR, forensic ADR Accepted cross-validate 2026-06-07 agy outcome=applied)** ([#629](https://github.com/coseo12/astro-simulator/issues/629)) — R6 D-T2 발견(R5 잠복). 위성(galilean) focus → free-fly 진입 시 카메라가 tier=body / radius≈158386 으로 잔존하는데, Babylon 절대 `wheelPrecision=3` 은 틱당 수십 unit (절대) 만 변경 → radius 158386 대비 변화율 **0.03%** 로 줌이 체감상 정지("탐색 시 시점 고정"). **measurement-first 정정**: #627 ADR §8 의 정적 가설(lowerRadiusLimit 미원복)을 실측이 기각(실측 467, 극소 아님). **fix**: 절대 `wheelPrecision`/`pinchPrecision` → `wheelDeltaPercentage`/`pinchDeltaPercentage` (`ZOOM_DELTA_PERCENTAGE=0.01`, radius 비례 %) — 모든 tier/scale 일정 비율 줌, desktop wheel + mobile pinch 동시 해소. **회귀 가드**: `verify:629-freefly-zoom` (S2 위성 free-fly 줌 5틱 rel ≥ 1%) + CI port 3006, 3중 시뮬레이션(neg 0.03% exit 1). 무회귀: #380/#378 + 단위 437 PASS. **MINOR** — 줌 감도 radius 비례 변경. 비-범위: 줌아웃 허공(#631 별도).

- **[#631] free-fly deep-tier 줌아웃 "허공" fix — cameraFromSunMeters origin 보정 + body tier pull-back (MINOR, forensic ADR Accepted cross-validate 2026-06-08 agy outcome=applied)** ([#631](https://github.com/coseo12/astro-simulator/issues/631)) — #629 D-T2 후속. 위성 focus → free-fly 줌아웃 시 태양계가 frame 밖("허공"). **forensic 2원인**: (1) `sim-canvas.tsx` `cameraFromSunMeters` 가 floating origin `originOffset` 누락 → body tier(origin=focus body)에서 sun 아닌 focus body 거리 측정 → tier escalate 안 됨 (씬 updateAt 1093-1098 은 올바른데 sim-canvas 만 drift) (2) target 이 위성 먼 위치에 stranding. **measurement-first**: core fix(originOffset 가산)만 적용 시 보이는 mesh 1→0 악화 → "tier escalation 만으로 해결" 가설 기각 → target 재앵커 필수. **fix**: (core) originOffset 가산 + (UX) `detachToFreeFly` 에서 tier=body 면 태양계 개요로 pull-back(`controller.reset()`, alpha/beta 시점 방향 유지). inner/solar tier(행성)는 **기존 #509 시점 보존 유지** (deep tier 한정 예외). **회귀 가드**: `verify:631-freefly-tier` (S1 io pull-back tier=solar+target≈0 / S2 earth #509 보존) + CI port 3007, 3중 시뮬레이션. 무회귀: #629/#378 + core 437 + web 296 PASS. **MINOR** — body tier 탐색 진입 동작 변화(개요 pull-back). 비-범위: free-fly 패닝(F3) / tier별 정책 메타데이터.

- **[#633] Vercel 빌드 인프라 fix — 모노레포 풀빌드(wasm-pack + dist) vercel.json** ([#633](https://github.com/coseo12/astro-simulator/issues/633)) — Vercel 이 `next build`(apps/web)만 돌려 워크스페이스 dist/wasm 미빌드 → Turbopack "Can't resolve @astro-simulator/core/shared" 빌드 실패. core 의 tsc 빌드조차 physics-wasm 타입을 요구해 wasm-pack 이 체인 전제. **fix** `apps/web/vercel.json`: `installCommand` = Vercel 이미지 기존 Rust(/rust) 사용 + wasm32 target + wasm-pack@0.14.0 + `pnpm i`, `buildCommand` = `pnpm -r build`(CI 동일 전체 체인). `.gitignore` 에 `.vercel` 추가(CLI 시크릿 커밋 방지). vercel deploy preview 빌드 성공 검증. **Behavior Changes: None — 배포 인프라만** (앱 런타임 무관). 비-범위: production 자동배포 빈도 제어(머지 게이트로 별도).

### Behavior Changes (R6 목성 + 갈릴레이 위성 4개 시각화)

- **[#621] R6 목성 + 갈릴레이 위성 4개 시각화 — Q2=B 거성 예외 첫 인스턴스화 + satellite 4개 첫 본 사례 (MINOR, ADR Accepted cross-validate 2026-06-05 agy outcome=applied)** ([#621](https://github.com/coseo12/astro-simulator/issues/621)) — 로드맵 v3 §R6 진입. R5 (mars + phobos + deimos) 위에 **jupiter + galilean 4개(io/europa/ganymede/callisto)를 명시적으로 visible** 하게 추가. **사용자 결정 (PM 합의 2026-06-05)**: Q1=A (galilean 4개 전부 동시 진입) / **Q2=B 임계 완화 (jupiter 가스 거성 예외 — sun 대비 ~10% 상향)** / Q3=agy 고유 발견 3건 후속 분리(#622 잔여 gap forensic / #623 DPR / #624 occlusion). **확정 박제값**: `BODY_SCALE.jupiter=48` (sun 대비 px 비 ~9.87%, ≤ 10% margin 0.13%, mesh visible 24.3px — 사실 비율 jupiter/sun=10.276% 정합 우선, "거성이 지구보다 작게 보임" 직관 위배 해소) / `BODY_SCALE.{io,europa,ganymede,callisto}=300` (moon-class, io/europa 4px fallback + ganymede/callisto mesh visible, 사실 크기 순서 보존) / `JUPITER_SATELLITES_ORBIT_VISUAL_SCALE=16` + `ORBIT_VISUAL_SCALE_BY_PARENT.jupiter=16` (io binding 분리 마진 1.69x — R5 phobos 1.69x 정확 정합, jupiterScale 48 mesh 4.8배 확대 결합 효과로 ×6→×16 동반 상향) / `PX_RATIO_THRESHOLDS.jupiter=10` (퍼센트 단위 정수 — guard sunPxRatio 직접 비교, 거성 예외 inner planet 단조와 직교) / `CURRENT_R_PHASE=5→6` (#613 메타데이터 SSoT 자동 생성 — `R_PHASE_BODY_ALLOWLIST` 13 body 자동 확장, shortcut bar jupiter 자동 enabled). **Q2=B 거성 예외 첫 인스턴스화**: inner planet 거리순 단조(mercury 6 < venus 11 < earth 15)의 예외 — jupiter(10%)는 venus와 mars 사이, 가스 거성 사실 비율 정합 우선. R7+ saturn/uranus/neptune 거성 예외 답습 인계. **Q2=B 천장 정정**: sun 천장(25%) 인스턴스화는 sun 자신만 — jupiter(sun의 10.28%) 포함 어떤 body도 천장 도달 불가 (R5 인계 "jupiter ≥ 100%" 오독 정정). **R5 §결정 4 산식 정정**: "1.69x ↔ 0.99 mismatch"를 산식 A(설계 임계 visual_orbit/sum_mesh) / 산식 B(검증 metric position.length/boundingSphere.radiusWorld) **정의 분리**로 정정 — 버그 아닌 metric 정의 미명시. 잔여 1.74배 gap runtime 원인은 후속 forensic(#622, #611 computeWorldMatrix(true) 전례 출발점). **Concrete Prediction 적중**: 코어 코드 변경 **정확히 8 라인** (BODY_SCALE 5 + CURRENT_R_PHASE 1 + ORBIT_VISUAL_SCALE_BY_PARENT 상수 1 + 룩업 1) — #613/#617 메타데이터 SSoT 자동화로 R5 ADR 예측 ≤18 → 8 라인 ("신규 데이터 ≠ 신규 코드" + "신규 함수 ≠ 신규 구현" 동시 실증). **#613 자동 전파 실증**: `CURRENT_R_PHASE=6` 1줄로 allowlist 13 body 자동 확장 + jupiter shortcut bar disabled→enabled 자동 전환 (FOCUS_BUTTONS 배열 변경 0줄, galilean showInShortcutBar=false 라 bar 미등록 — R5 인계 "11버튼 overflow" 무효화). **검증**: core 426 tests PASS (421 + R6 신규 5: BODY_SCALE jupiter/galilean + orbit-visual-scale jupiter binding/callisto + allowlist 13/CURRENT_R_PHASE 6 갱신) / web 294 tests PASS / web typecheck 0 / #598 FOCUS_BODIES + #619 targetIds + #617 showInShortcutBar 정적 매칭 가드 13 body 정합 PASS / 코어 코드 8 라인 (Concrete Prediction 적중). **D-T2 실 Chrome GUI 수동 검증은 qa 단계 위임** (headless ≠ 실 브라우저, volt #77) — jupiter 거성 직관 + galilean 4개 분리 + 시각 역전 없음 육안 확인. **MINOR 분류** — R6 body 시각화 product 동작 변화 (jupiter + galilean 4 visible). 비-범위: jupiter 표면 PBR / 대적점 / 고리 / galilean 표면 디테일 / Laplace resonance (후속) / 잔여 gap forensic(#622) / DPR(#623) / occlusion(#624) / saturn R7+ 진입. **§Notes — Amendment 1 (2026-06-06, qa D-T2 후 perspective 보정)**: r1-guard `PX_RATIO_THRESHOLDS.jupiter` 임계 **10 → 16.3**. ADR §결정 5 식 9.87% 는 wsRadius 비 예측이나 qa `--measure-px-ratio` 실측 **15.52% / 38.21px** (3 viewport 결정적 + galilean 4 동일 1.56~1.58배 일관). **earth 2026-05-21 선례** (식 14.67% → 실측 16.40%, +11.8%) 와 동일 방향 — ADR 식이 perspective foreshortening 무시, jupiter 는 sun 5.2 AU 거리라 편차 최대 (+57%). **jupiterScale=48 박제값 / Q2=B 거성 예외 정책 보존** (38px > earth 36px 거성 직관 강화, galilean 8.82px ≪ jupiter 38px 역전 없음) + **임계만 실측 × 1.05 = 16.3 보정** (earth 17 / venus 14.26 패턴 — 정책 식값 ≠ guard 실측 튜닝 이원화). **DoD 재조정** (사용자 합의 2026-06-06, 세 위치 박제: 코드 주석 `r1-ui-regression-guard.mjs:104` + PR #627 본문 + 본 Notes). #622 forensic 산식↔실측 gap 과 같은 뿌리. scale 축소(qa 권고 A)는 거성 직관 역행이라 기각.

### Behavior Changes (R6 #627 satellite 궤도선 구조 결함 fix — moon 패턴 일반화 + galilean scale 하향)

- **[#627] satellite 궤도선 구조 결함 fix — phobos/deimos/galilean 궤도선이 태양 원점에 잘못 렌더되던 문제 해소 (옵션 A) + galilean BODY_SCALE 300→200→100 (옵션 D, D-T2 2차 iteration) (MINOR, forensic ADR Accepted cross-validate 2026-06-06 agy outcome=applied)** ([#627](https://github.com/coseo12/astro-simulator/pull/627)) — R6 D-T2 실 Chrome 검증에서 사용자 보고 2건 (volt #77 headless 미포착): (1) galilean 이 목성 대비 과대 (2) focus 시 불필요한 궤도라인 + 탐색 모드 궤도라인 잔상. **forensic 실측 (develop tip)**: R5 까지 moon 만 별도 LineSystem (parent 추적 + visual scale) 이었고 phobos/deimos/galilean 은 sun 중심 `orbit-lines` batch 로 처리 → position (0,0,0) 태양 원점 고정 + visual scale 미적용 → **궤도선이 mars/jupiter 가 아닌 sun 옆에 렌더** (`orbit-lines` vertex 54% 가 원점 1 unit 이내 밀집). satellite **mesh 는 정상 추적** (`resolveWorld`), 궤도선 경로만 결함 — 근본 원인은 R5 §결정 4 가 `MARS_SATELLITES_ORBIT_VISUAL_SCALE=500` 을 박제했으나 mesh 경로만 구현하고 궤도선은 moon 만 처리한 **구현 누락** (R5 도입 잠복, R6 galilean 4개로 표면화). **fix (옵션 A — moon 패턴 일반화)**: `rebuildOrbitLines` 가 satellite (parentId !== 'sun') 를 parent 별 `Map<string, LineSystem>` (`satellite-orbit-line-<parent>`) 으로 분리 — `isSatelliteOrbit(parentId)` 분류 SSoT + `getOrbitVisualScale(parentId)` scaling (earth=30 / mars=500 / jupiter=16) + `updateAt` 루프가 각 LineSystem position 을 parent scene 좌표로 매 프레임 동기화 (moon 전용 → satellite Map 순회 일반화). moon 특수 케이스 제거 (`satelliteOrbitLines.get('earth')`, 색상 강조 #552 만 별도 룩업). **agy 고유 발견 3건 반영**: ① 다중 LineSystem dispose 라이프사이클 (`disposeSatelliteOrbitLines` Map 순회 안전 dispose — rebuild 재호출 + scene dispose 둘 다, 메모리 누수 차단) ② `getOrbitVisualScale` fallback 계약 (`DEFAULT_ORBIT_VISUAL_SCALE=1.0` export + null/undefined/미매핑 1.0 보장) ③ 회귀 가드 원점 밀집 통계 테스트. **fix 후 실측 (1280×720, dev)**: satellite 궤도선 worldCenter ↔ parent — earth 0.053 / mars 0.0003 / jupiter 0.019 unit (모두 ±0.2 충족) + planet `orbit-lines` 원점 1 unit 이내 vertex 54% → **0.0%**. **옵션 D 발동 (보고 1, 2단계 D-T2 iteration)**: 옵션 A 적용 후 galilean 재측정 — ganymede/jupiter 여전히 0.230 (moon/earth 0.068 의 3.4배 과대) → `BODY_SCALE.{io,europa,ganymede,callisto}` **300 → 200 (1차) → 100 (2차, 사용자 D-T2 "목성 대비 아직 큼" 재보고 후 dev iteration 합의)** (moon/earth 0.068 정합, moon Amendment 4 정책 답습). 재측정 2차: ganymede **0.077** (moon 의 1.13배) / io 0.053 / europa 0.046 / callisto 0.070 — 사용자 "목성 대비 적당" 합의. jupiterScale 48 + JUPITER_SATELLITES_ORBIT_VISUAL_SCALE 16 무변경 (Q2=B 임계 불변). trade-off: galilean mesh px 1/3 축소 (4개 sub-4px → 4px fallback billboard 전면 의존 — LOD Phase 2 #391 흡수, 미세 크기 순서 묻히나 jupiter 38px ≫ galilean 역전 0). **회귀 가드 신설**: `apps/web/scripts/browser-verify-627-satellite-orbit.mjs` (verify:627-satellite-orbit) — 2축 (A 각 satellite 궤도선 worldCenter ↔ parent ±0.2 unit / B planet orbit-lines 원점 1 unit 이내 vertex 0 — agy 보강 ③ 통계 테스트) + CI `detect-and-test` 통합 (port 3005). 3중 시뮬레이션 negative-test 확인 (결함기 forensic 데이터로 FAIL 재현). 단위 테스트 `packages/core/src/scene/satellite-orbit-structure.test.ts` 신설 (isSatelliteOrbit 분류 11 케이스 + getOrbitVisualScale fallback). **검증**: core 437 tests PASS (426 + 11 신규) / web 296 tests PASS (galilean scale 100 단언 갱신 8건) / core+web typecheck 0 / lint 0 신규 error. **ADR Amendment**: R5 ADR §Amendment 2 (구현 누락 정정 — mars 궤도선 visual scale 적용 실측) + R6 ADR §Amendment 2 (galilean 300→200→100, D-T2 2차) + #627 forensic §Amendment 1 (fix 구현 + 재측정) + `orbit-visual-scale.ts` §적용 위치 주석 갱신 ("모든 satellite orbit LineSystem"). **D-T2 실 Chrome GUI 수동 검증은 사용자 위임** (headless ≠ 실 브라우저, volt #77). **MINOR 분류** — satellite 궤도선 위치 정합 + galilean mesh 크기 변화 (사용자 같은 입력에 다른 렌더). 비-범위: 카메라 free-fly 고정 (#629 별도 분리, develop 재현 R6 무관) / satellite orbit visual scale 잔여 gap (#622) / galilean 표면 디테일 / Laplace resonance.

### Behavior Changes (R-Phase body 목록 잔여 하드코딩 SSoT 가드)

- **[#617 + #619] R-Phase body 목록 잔여 하드코딩 SSoT 정리 — showInShortcutBar 메타 + targetIds 정적 매칭 가드 (MINOR)** ([#617](https://github.com/coseo12/astro-simulator/issues/617) / [#619](https://github.com/coseo12/astro-simulator/issues/619)) — #613 후속. #613 이 `R_PHASE_BODY_ALLOWLIST` 를 자동 생성으로 drift 주요 표면을 제거한 뒤 남은 **잔여 하드코딩 사본 3개**를 정적 매칭 가드로 차단. **#619** (reviewer 권고, volt #69 은닉 상수): `r1-ui-regression-guard.mjs:186` `targetIds` (px-ratio 측정 대상, allowlist 와 동일 8개)가 #598 가드 비대상이라 R6 진입 시 정체 위험 → `r-phase-allowlist.test.ts` 에 `targetIds == R_PHASE_BODY_ALLOWLIST` 정적 가드 추가. **#617** (cross-validate agy 고유 발견): shortcut bar 노출 목록(`FOCUS_BUTTONS` / `RPHASE_EXPECTED_ENABLED`/`DISABLED`)은 "focus 가능"(introducedInRPhase)과 **직교 축** — satellite(phobos/deimos)는 focus 가능하나 미등록(R5 Q4a=A 모바일 너비). `solar-system.json` 24 body 에 `showInShortcutBar` boolean 메타 부여(데이터 SSoT: sun~mars + jupiter/neptune=true, 나머지 16=false) → `FOCUS_BUTTONS`(렌더) / `RPHASE_EXPECTED_ENABLED`(=showInShortcutBar && focusable) / `RPHASE_EXPECTED_DISABLED`(=showInShortcutBar && !focusable) 하드코딩과 정적 매칭 가드. **렌더 자동 생성은 비목표** (UI 무변경 + verify 격리성 유지 — ADR #613 §결정 D 패턴 정합). **3중 시뮬레이션 실증** (가드 도입 DoD): positive 421 PASS → negative(targetIds deimos 제거) #619 가드 FAIL → recovery 421 PASS. **검증**: core 421 tests PASS (#613 417 + 정적 가드 4) / web typecheck 0 (showInShortcutBar 소비처 영향 0) / verify-core-exports PASS / 데이터 값 무손실(python round-trip). **UI/런타임 동작 무변경** (가드만 추가, FOCUS_BUTTONS/RPHASE_EXPECTED/targetIds 하드코딩 유지). **MINOR 분류** — R-Phase 진입 시 정적 가드 검증(CI fail-fast) 추가. 비-범위: FOCUS_BUTTONS 렌더 데이터 파생(격리성/UI 안전상 보류) / targetIds 자동 생성(r1-guard 격리성) / shortcut bar 모바일 너비 정책 변경.

### Behavior Changes (R-Phase body 메타데이터 SSoT — allowlist 자동 생성)

- **[#613] R-Phase body 메타데이터 SSoT (`introducedInRPhase`) — `R_PHASE_BODY_ALLOWLIST` 자동 생성, 5곳 동시 박제 → 3곳 (MINOR, ADR Accepted cross-validate 2026-06-04 agy outcome=applied)** ([#613](https://github.com/coseo12/astro-simulator/issues/613)) — #602 cross-validate(agy) 고유 발견 후속. **근본 원인**: R-Phase 진입 시 body "최초 등장 페이즈" 정보가 여러 파일에 흩어져 수동 동기화 → 반복 drift (#598 allowlist↔FOCUS_BODIES / #602 397-residual FOCUS_BODIES R3 잔존). **해결**: `solar-system.json` 24 body 전체에 `introducedInRPhase` 메타데이터 부여(데이터 SSoT) → `R_PHASE_BODY_ALLOWLIST` 를 `filterBodiesByPhase(bodies, CURRENT_R_PHASE)` 자동 생성. **런타임 동작 무변경** (자동 생성 결과 == 기존 하드코딩 8개 sun~deimos, `toEqual` 회귀 0). **R-Phase 진입 박제 5곳 → 3곳 감소**: `R_PHASE_BODY_ALLOWLIST` 직접 박제 소멸 → `CURRENT_R_PHASE` 1줄 증가로 대체 (R6+ body 데이터 사전 부여). **Concrete Prediction**: R6 진입 = `CURRENT_R_PHASE = 5 → 6` **단 1줄** (데이터 0줄, allowlist/소비처 코드 0줄) — "신규 데이터 ≠ 신규 코드" 패턴(`docs/lessons/data-not-code-extension.md`) 강한 실증. **설계 결정** (ADR `20260604-613-r-phase-metadata-ssot.md` §A~F): (A) introducedInRPhase JSON 데이터 SSoT (Visual Fidelity §1 정합) / (B) `RPhaseBodyId` = `string` 후퇴 (소비처 13곳 타입 의존 0 실측 + 24-body union 별도 추출은 데이터 중복 hardcode 로 #613 취지 역행 → 런타임 `isRPhaseFocusable` 가드 방어, web typecheck 에러 0 실증) / (C) `CURRENT_R_PHASE` + `filterBodiesByPhase` 순수 함수를 `r-phase-allowlist.ts` 에 배치 (loader 는 zod+interface 만) / (D) #598 정적 가드 존속 (`FOCUS_BODIES` 하드코딩 유지 — verify 스크립트 격리성, 자동 생성↔하드코딩 정합 CI 차단) / (E) 전체 24 body 사전 부여 (로드맵 v3 R1~R10 확정 매핑) / (F) 회귀 0 검증 (toEqual 순서 보존 + R1/R4/R6/R10 시뮬레이션 단위 테스트). **wasm-safe 실증**: loader import dep graph 변경에도 `verify-core-exports-immutable.sh` PASS (sub-path 추가 0) + dev SSR 200 (turbopack `__dirname` 회귀 없음, ADR §Amendment D1 가드). **변경**: `solar-system.json` (24 body introducedInRPhase, 데이터 값 무손실 — 텍스트 삽입 24줄) + `solar-system-loader.ts` (zod + `LoadedCelestialBody.introducedInRPhase` + map) + `r-phase-allowlist.ts` (CURRENT_R_PHASE + filterBodiesByPhase + 자동 생성 + RPhaseBodyId string + 주석 5곳→3곳) + `r-phase-allowlist.test.ts` (자동 생성 회귀 0 + R1/R4/R6/R10 시뮬 + #598 가드 존속, core 417 tests PASS). **cross-validate 반영 (4축)**: 합의 6건 (결정 A~F 전부 타당) + 이견 수용 2건 (top-level 평가 타이밍 → loadSolarSystem 동기성 실측 반증 후 import-order 부분 수용 / filterBodiesByPhase 순수 함수 분리) + 고유 발견 후속 분리 1건 ([#617](https://github.com/coseo12/astro-simulator/issues/617) — `showInShortcutBar` 메타 자동화). **MINOR 분류** — R-Phase 진입 절차(개발/에이전트 행동) 변화 + 메타데이터 인프라 신규. 비-범위: #617 shortcut bar 메타 / #619 r1-guard `targetIds` 은닉 상수(reviewer 권고, #598 가드 확장 후속) / RPhaseBodyId 마스터 튜플 전환(타입 소비처 발생 시) / R6 jupiter 실제 진입(CURRENT_R_PHASE 증가는 R6 사이클).

## [0.19.0] — 2026-06-04

### 요약

R5 (화성 + 포보스 + 데이모스) visualization 완주 + satellite 2개 첫 본 사례 + R5 후속 회귀/CI 안정화 일괄 정리. 19 커밋 누적 — 마지막 릴리스 v0.18.0 (2026-05-28) 이후 7일.

**카테고리별 매핑**:

- **R5 본 시각화** (MINOR): #594 화성 + 포보스 + 데이모스 (Q2=B 2번째 본 인스턴스화, satellite 2개 첫 본 사례)
- **satellite focus 회귀 fix** (MINOR): #611 follow observer 한 프레임 lag — onBeforeRender worldMatrix 미갱신으로 위성 focus 시 camera target 추적 lag (#610 freeze fix 로 드러난 R5 잠복 회귀)
- **CI 안정화** (MINOR): #606 r1-guard freeze root cause = Node 24.16 + playwright extract 비호환 → Node 22 핀 + step 4분리 + timeout-minutes:10 가드 (PR #608/#610)
- **NO-OP / ADR Amendment / 가드 폐기** (PATCH): #604 R5 ADR §결정 4 Amendment 1 (산식 1.69x vs 실측 0.99 분리) / #606 forensic ADR / #602 browser-verify-397-residual.mjs 회귀 가드 폐기 (CI 미통합 + R-Phase 갱신 부담)

상세 entry 는 아래 sub-section 참조. cross-validate (agy) 반영: #604/#605/#606/#607/#602 outcome=applied.

### Notes (행동 변경 없음 — 회귀 가드 폐기)

- **[#602] browser-verify-397-residual.mjs 회귀 가드 폐기 — CI 미통합 + R-Phase 갱신 부담 > 가치 (PATCH, ADR §Amendment 1 Accepted cross-validate 2026-06-04 agy outcome=applied)** ([#602](https://github.com/coseo12/astro-simulator/issues/602)) — PR #602. #397 NO-OP ADR 의 R-Phase residual(focus 외 body viewport 점유율) 회귀 가드 스크립트 + `apps/web/package.json` `verify:397-residual` 스크립트 폐기. **폐기 사유 (ROI 역전)**: (1) "CI `detect-and-test` 통합 검토" 가 끝내 미실행 (수동 전용) → 자동 회귀 검출 0 (2) `R_PHASE_EXPECTED` 매트릭스가 R-Phase 진입마다 dev 서버 실측 갱신 의무인데 **R4(#532)/R5(#594) 둘 다 누락** (FOCUS_BODIES 가 R3 baseline `[sun,mercury,venus,earth,jupiter,neptune]` 잔존 — jupiter/neptune 미구현이라 focus 불가). #598(PR #601) 단위 테스트 구현 중 drift 발견 → #602 박제 (3) focus 동작은 `browser-verify-378-focus.mjs`(CI 실행, #611 satellite follow lag 직접 차단 입증)가 커버, residual 측면은 priority:low + #397 NO-OP 종결. **보존**: "R-Phase 정합 종료 조건" 원칙은 397 ADR §재검토 조건 + R-Phase 공통 DoD 에 박제 유지 (스크립트 없이도 R-Phase ADR expected 명시 의무 살아있음), `docs/reports/397-residual/` 측정 증거 유지. **ADR 정합 갱신**: 397 ADR §회귀 가드 §Amendment 1 박제 (R3 원본은 `<details>` 역사 기록 보존) + 378 ADR §#397 재평가 회귀 가드 참조 폐기 명시. **PATCH 분류** — 검증 스크립트 폐기, product/agent 동작 변화 0 (frozen `.claude/` 미해당). **cross-validate 반영 (4축 분류)**: 합의 2건 (Amendment 폐기+역사 보존 추적성 우월 / 옵션 B NO-OP 타당) + 핵심 사각 우려 1건 (스크립트 폐기 → 잔존도 검증 수동 의존 — 폐기 사유 (1)(3) 에서 이미 다룸, "새 사각 생성" 아닌 "작동 안 하던 가드 명시 제거") + 고유 발견 수용 후속 분리 1건 ([#613](https://github.com/coseo12/astro-simulator/issues/613) — `introducedInRPhase` body 메타데이터 SSoT 자동화, #598/#602 drift 근본 해결책, priority:low) + Claude 기각 1건 (transient state / scale-control UI / 렌더 fade-out — #397/#400 영역 이미 종결, 비목표). 비-범위: residual 검증 자동화 재구현 (#613 후속) / docs/reports/397-residual 측정 증거 / R-Phase 공통 DoD 템플릿 변경.

### Behavior Changes (satellite focus follow lag fix)

- **[#611] satellite (phobos + deimos) focus follow 한 프레임 lag 근본 fix — camera-controller follow observer worldMatrix 갱신 (MINOR — focus 추적 동작 변화)** ([#611](https://github.com/coseo12/astro-simulator/issues/611)) — PR #610 (#606 freeze fix) 으로 r1-guard freeze 가 해소되며 그동안 skip 되던 `#378 focus 회귀 가드` 가 실행돼 드러난 **R5 (#596) 잠복 회귀** 의 근본 fix. **Root cause = follow observer 한 프레임 lag**: render loop 순서상 `time.tick → updateAt → mesh.position` 설정이 `scene.render` 보다 먼저라 `onBeforeRenderObservable` 시점 mesh.position 은 이번 프레임 값이지만 **worldMatrix 미갱신** → `mesh.absolutePosition` 이 직전 프레임 값을 반환. follow observer (`camera-controller.ts:105`) 가 갱신 없이 읽어 `camera.target` 이 한 프레임 뒤처짐. 궤도 각속도가 큰 위성 (phobos 주기 7.66h / deimos 30.3h) 은 프레임당 이동량이 DoD-3 tolerance (meshRadiusWorld × 5) 를 초과해 FAIL, 행성은 각속도가 작아 tolerance 내라 잠복 (mercury 88일 / mars 687일). phobos > deimos 강도차 = 주기 차 (각속도 phobos > deimos). research 모드 2.5배 / deimos run별 flaky = panel resize 무거운 프레임 (dt↑) 이 한 프레임 이동량 증폭. **Fix (1라인 + 주석)**: follow observer 에서 `mesh.computeWorldMatrix(true)` 후 `absolutePosition` 읽기 — 측정 스크립트 (`browser-verify-378-focus.mjs:101`) 와 동일 시점이라 lag 0. focus mesh 1개만 매 프레임 갱신, 비용 무시 가능. **실측 (로컬 verify:378-focus, 8 body × 2 mode)**: 16/16 PASS, phobos/deimos × observe/research 4 cell 전부 **targetΔ=0.000** (이전 phobos observe 12764 / research 32566, deimos research flaky 5429~6816 → 전부 0). 기존 행성 cells 회귀 0. **회귀 가드 복원**: `browser-verify-378-focus.mjs` FOCUS_BODIES 에 phobos + deimos 복원 (#610 임시 제외 해제) → CI r1-guard 에서 satellite follow lag 직접 차단. **스프린트 계약 §6 ROI 재조정**: 완료 기준 4 (camera-controller 단위 테스트) 는 NullEngine + focusOn Animation 완료 트리거 셋업 비용이 검증 대상 (follow observer 1라인) 대비 과도 (이 코드베이스의 NullEngine 회피 + browser-verify 통합 가드 정책 — `solar-system-scene.test.ts:10` / `browser-verify-378-focus.mjs:14` 답습) → **통합 회귀 가드 복원 (조용한 퇴행 → CI 빌드 실패 전환) + 코드 주석 계약** 으로 대체. 3위치 박제 (코드 주석 `camera-controller.ts` + PR 본문 + 본 CHANGELOG). **MINOR 분류** — focus 추적 product 동작 변화 (위성 focus 시 카메라가 위성 궤도 운동을 정확히 추적). 비-범위: 행성 focus 동작 (영향 0, lag 가 tolerance 내라 체감 변화 없음) / R5 박제값 (marsScale/phobosScale/MARS_SATELLITES_ORBIT_VISUAL_SCALE) / Floating Origin ADR / tier transition 로직.

### Notes (행동 변경 없음 — 자가 입증 결과 박제)

- **[#606] r1-guard forensic ADR §Amendment 1 박제 — 옵션 (b) 자가 입증 36배 단축 + 가설 5 재확인 (Accepted, cross-validate 2026-06-01 agy outcome=applied)** ([#606](https://github.com/coseo12/astro-simulator/issues/606)) — PR #608 (`e1d3ebf`) 머지 후 본 PR #608 자체 CI run 26716302495 자가 입증 결과 박제. **자가 입증 측정 결과**: r1-guard step 시작 2026-05-31T15:12:39Z → 종료 15:22:52Z = **10분 13초** (`timeout-minutes:10` 정확 발현) / conclusion = failure (timeout cancelled) / workflow 전체 시간 11분 (fail-fast 후속 step skipped) / 이전 baseline ~6시간 stuck → **36배 단축** (360분 → 10분). **Concrete Prediction §예측 2 검증 PASS** — 코드 변경 1라인 예측 정확 일치 (실측 1라인 + 주석 1라인 + ADR §5 갱신 1라인 + CHANGELOG 4라인 = 3 파일 7 라인, ±50% 임계 PASS). **가설 5 재확인**: timeout 가드는 freeze 증상 차단만, root cause 미해소 (10분 cancelled = freeze 발생 사실). sub-가설 5a/5b/5c 중 root cause 확정은 후속 옵션 (a) PR 의 D-X1a/D-X1b/D-X2 측정 의무. **부수 효과 실측**: fail-fast 효과 (후속 step #378/#408/#402 등 자동 skipped) + admin override 의존 즉시 감소 + R6 인계 위험 완화 (galilean 4 추가 시 stuck 발생해도 동일 36배 단축). **§재검토 트리거 갱신 2건 추가** (§6 §재검토 트리거 기존 4 → 6항목): (5) timeout-minutes:10 임계 부족 시 — pnpm install (~3분) + build (~2분) 누적 합 8분 초과 시 r1-guard 측정 시간 부족으로 정상 시에도 cancelled 위험. 다음 N=3 push 검증 시 r1-guard step 실측 < 2분 (D-X1b) 확인 의무 / (6) fail-fast 효과 변화 — workflow 정의 변경 (composite action / matrix expansion) 시 fail-fast 자동 적용 보장 재검증 의무. **학습 정수**: (a) measurement-first 원칙 (volt #51) 답습 — Concrete Prediction 박제로 사후 검증 가능 / (b) agy cross-validate 제안 2 거부 결정 정합 검증 — 후속 PR #608 분리 + 자가 입증 + 메모리 SSoT 갱신 동시 박제로 가치 보존 입증 / (c) forensic ADR 변형의 사후 검증 가치 — 일반 ADR (Concrete Prediction 없음) 대비 우월성 입증. **ADR 메타데이터**: `Accepted + Amendment 1 Provisional (2026-06-01 cross-validate 대기)`. **PATCH 분류** — 코드 / 박제값 / 회귀 가드 / 단위 테스트 / 워크플로 동작 변화 0 (옵션 b 자체는 PR #608 별도 박제). **cross-validate 반영 (4축 분류)** — 합의 4건 (로직 정확성 / 보안 / 성능 / 설계) + 이견 0 + Claude 기각 0 + 고유 발견 수용 1건 (agy 제안 2 §재검토 트리거 #5 정량화 보강 즉시 반영 — "최근 5회 평균 정상 빌드 시간 8분 초과 또는 단일 정상 빌드 시간 9분 초과 2회 이상 연속 발생 시" 명시) + 후속 분리 1건 (agy 제안 1 — workflow step 분리 후속 PR 옵션 (f) 신설, 본 ADR §5 §Fix 후 박제 의무 박제, 우선순위 low — §재검토 트리거 #5 발화 시 검토 의무). 비-범위: 옵션 (a) targetIds 5 body 임시 revert / 옵션 (c) `projectWorldToScreen` numerical guard / 옵션 (d) Playwright launch options / 본 ADR §결정 본문 변경 / R5 ADR §결정 5 Amendment / 코드 / 회귀 가드 / 단위 테스트 / 박제값 모두 변경 0.

### Behavior Changes (CI fix — r1-guard freeze root cause = Node 24.16 + playwright extract 비호환)

- **[#606] r1-guard freeze root cause 확정 + fix — Node 22 핀 (Node 24.16 + playwright 1.59.1 extract 비호환) + step 4분리 + 가설 1~5 전부 오진 정정 (MINOR — CI workflow 구조 변경, ADR §Amendment 2 Accepted cross-validate 2026-06-01 agy outcome=applied)** ([#606](https://github.com/coseo12/astro-simulator/issues/606)) — PR #610. **measurement-first 4단계 진단으로 ADR 가설 1~5 (scene/satellite/verify/build) 전부 오진 발견 + root cause 확정**. **가설 5 오진 메커니즘**: ADR §1 가설 5 가 지목한 `measureBodyPxRatios`/`targetIds` 8 body 측정은 r1-guard `--measure-px-ratio` 모드 **전용** — CI ci.yml:110 은 플래그 없이 호출 = **verify 모드 (`runForViewport`)** 라 절대 호출 안 함 (dead code). 따라서 옵션 (a) (targetIds revert) / (c) (NDC guard) 는 verify 경로 밖 → CI 효과 0 (적용했다면 회귀 미해소). **4단계 측정 (CI 실측 SSoT)**: (1) r1-guard step 4분리 (install/build/start/verify 개별 timeout) → run 26753107929 에서 **install (1/4) 5분 13초 timeout, build/start/verify 전부 skipped (미도달)** (2) `DEBUG=pw:install` → run 26753862359 에서 `download complete` (success) 후 `extracting archive` 직후 **5분 hang** (2차 다운로드 아님 = extract 단계) (3) disk/mem/node + extract 중 df 폴링 → run 26756305719 에서 **Node v24.16.0 / 디스크 88G avail (extract 5분 내내 변동 0 = I/O 0바이트) / 메모리 14Gi → 자원 전부 정상**, extract deadlock (4) detect-and-test job **Node 22 핀** → run 26756788369 에서 **install 28초 통과** (이전 5분 hang → 28초) + build 35s / start 3s / verify 8s 전부 success. **Root cause**: Node 24.16 + playwright 1.59.1 의 `extracting archive` deadlock (자원 무관). **회귀 시점 재해석**: ADR §측정 1 "PR #596 머지 후 2초" 는 R5 코드와 무인과 — setup-node 가 `engines.node ">=20.0.0"` 를 최신 Node 24.16 으로 설치하기 시작한 **runner 인프라 시점**과 R5 머지가 우연히 겹친 것 (ADR §가설 2 인프라 회귀 부분 부활 + 정정). **fix**: `.github/workflows/ci.yml:39` `node-version-file: 'package.json'` → `node-version: '22'` 핀 (playwright/baseline/lock 무영향). **유지**: r1-guard step 4분리 (freeze 재발 시 step 단위 격리, ADR 옵션 f 정합) + verify `R1_GUARD_DIAG=1` 진단 로깅 상시화 (`apps/web/scripts/r1-ui-regression-guard.mjs` `diag()` 헬퍼, stderr unbuffered → 재발 시 stuck 직전 단계 보존). **부수 발견 #611 분리**: freeze fix 로 그동안 r1-guard freeze 에 가려 skip 되던 `#378 focus 회귀 가드` 실행 → **satellite (phobos + deimos) focus DoD-3 (target 동기화) 회귀** 노출. phobos: observe Δ=12764 / research Δ=32566 모두 tol 12042 크게 초과 (강발현). deimos: research Δ 가 run 마다 5429~6816 변동, tol 6814 경계 flaky (margin 2.04). satellite focus 시 camera target 이 mesh 궤도 운동 못 따라가는 lag 공통 회귀. R5 잠복, freeze (#606) 와 직교 → 이슈 [#611](https://github.com/coseo12/astro-simulator/issues/611) 분리 + `browser-verify-378-focus.mjs` FOCUS_BODIES 에서 phobos + deimos 임시 제외 (주석 계약 + #611 링크) 로 freeze fix green 머지. **학습 정수**: measurement-first 가 정성적 가설 (satellite freeze) 채택 \*전\_ 실측으로 dead code 오진 차단 (volt #32 역방향 손실 패턴 회피) + forensic ADR 도 "코드 실제 실행 경로" 검증 의무 (DoD PASS ≠ 실행 경로 일치) + step 분리의 진단 핵심 가치 (ADR 옵션 f "low" 였으나 진단 핵심 도구). **MINOR 분류** — CI workflow gate 구조 변경 (Node 핀 + step 분리 + 진단 로깅 상시화). **재검토**: playwright 1.60+ 업그레이드로 Node 24 extract 호환 확인 시 Node 22 핀 해제 가능 (§6 §재검토 트리거 #4). **cross-validate 반영 (4축 분류)**: 합의 5건 (measurement-first dead code 발견 / Node 22 LTS 핀 타당 / step 분리+진단 로깅 관측성 / 재검토 조건 명문화 / 보안 무영향) + 이견 0 + Claude 기각 1건 (agy "next start readiness 메커니즘 결여" 오탐 — ci.yml start step 에 curl readiness loop + exit 1 이미 존재, agy 파일 미열람) + 고유 발견 3건 박제 (① 로컬 정합성 gap — `.nvmrc` Node 24.14 잔존, fresh playwright install 시 동일 위험 가능, 후속 검토 분리 / ② SSoT 트레이드오프 — detect-and-test job 만 국소 핀은 의도적 결정, 전체 통일은 범위 확장 / ③ measureBodyPxRatios 는 `--measure-px-ratio` 전용이라 완전 dead code 아님, R6 전 정리 의사결정 후속). 비-범위: #611 phobos focus 근본 fix (별도 이슈) / 로컬 정합성 (`.nvmrc` 핀, 후속 검토) / playwright 버전 업그레이드 / R5 박제값 변경 / 옵션 (a/b/c/d) (전부 오진 영역) 모두 변경 0.

- **[#606 옵션 b] ci.yml r1-guard step `timeout-minutes: 10` 추가 — Playwright Chromium freeze ~6시간 stuck 즉각 가드 (PATCH)** ([#606](https://github.com/coseo12/astro-simulator/issues/606)) — `docs/decisions/20260531-606-r1-guard-playwright-freeze-forensic.md` §5 §Fix 후 박제 의무 §"옵션 (b) high 우선순위" 분리 박제 작업. **변경**: `.github/workflows/ci.yml` line 99 r1-guard step 에 `timeout-minutes: 10` 추가 (1 라인). 본 ADR §3 §옵션 (b) 산식 답습 — `pnpm exec playwright install` (~3분) + `pnpm build` (~2분) + readiness wait 60초 + r1-guard 측정 (정상 ~1분 / freeze 시 무한) 누적 정상 ~6분 → 10분 임계 안전 마진 4분. **즉각 운영 효과**: stuck 시 60초 → 600초 (10분) 후 자동 cancelled → admin override 의존 즉시 감소 (메모리 SSoT 답습 GitHub Actions 기본 timeout 360분 → 10분 단축). **본 ADR §4 §Concrete Prediction §예측 2 답습** (1 라인 변경, ±50% 임계 PASS). **agy cross-validate 제안 2 가치 보존 후속 분리 박제** (본 ADR §7 §교차검증 §Claude 기각 1건 후속 PR 우선순위 high 격상 박제 정합). **본 ADR §5 §Fix 후 박제 의무 갱신** — 옵션 (b) ✅ 완료 표시 + 다음 N=3 push 검증 후 admin override 의존 감소 실측 (본 ADR §Amendment 1 박제 예정). **PATCH 분류** — CLAUDE.md §릴리스 §"행동 변화 vs 문서 변경 판정 질문" 기준 (product 동작 변화 0, CI workflow gate 행동 변화만 — 다른 다운스트림 영향 0 + frozen 파일 (`.claude/`) 미해당). **cross-validate 비대상** — 1 라인 변경 ROI marginal + 본 ADR (Accepted) 의 명시된 후속 PR 영역 (신규 결정 박제 아님). 비-범위: 옵션 (a) targetIds 5 body 임시 revert / 옵션 (c) `projectWorldToScreen` numerical guard 강화 / 옵션 (d) Playwright launch options 정정 / 본 ADR §결정 본문 변경 / R5 ADR §결정 5 Amendment / 메모리 SSoT 갱신 모두 변경 ❌.

### Notes (행동 변경 없음 — 문서·주석 정합성 정리)

- **[#606] r1-guard Playwright Chromium freeze forensic ADR 박제 — CI detect-and-test ~6시간 stuck 일관 회귀 (PR #596 R5 머지 직후, Accepted cross-validate 2026-05-31 agy outcome=applied)** ([#606](https://github.com/coseo12/astro-simulator/issues/606)) — PR #605 (#604 close 작업) 의 detect-and-test 4시간+ stuck 발현 forensic 후속 분리. **회귀 시점 SSoT (5초 단위 정확도)**: PR #596 (R5 mars + phobos + deimos 머지, commit `28be1cd`) merged=2026-05-29T05:41:22Z 직후 첫 stuck CI run id=26620332744 created=2026-05-29T05:41:24Z (**머지 후 2초**). **누적 회귀 실측**: 정상 baseline ~5분 (마지막 성공 id=26555081614 2026-05-28T04:40:55Z) → R5 머지 후 **10회차+ 일관 ~6시간 stuck → cancelled** (GitHub Actions 기본 timeout 360분 정확 도달, 전 브랜치 develop/feature/fix/chore 무관). 메모리 박제 SSoT "CI 인프라 timeout 4회차" → 실측 **10회차+ 누적** (SSoT stale 발견). **가설 4종 → 1종 압축 (가설 5 신규)**: (1) Playwright Chromium swiftshader adapter freeze ❌ 약화 (R5 머지 전 정상 통과 사실로 부분 기각) (2) GitHub Actions runner transient ❌ 기각 (10회차+ 일관) (3) `pnpm build` 산출물 corruption ❌ 기각 (build step success 통과) (4) Next.js `start` mode + Playwright headless 결합 ❌ 기각 (start 자체 변경 없음) (5) **신규 가설: R5 추가 satellite body (phobos/deimos) 측정 시 Babylon `boundingSphere.radiusWorld` 또는 NDC projection 무한 wait** ✅ 확정 (정황 증거 강력 — 회귀 시점 정확도 2초 + r1-guard 변경 +9 라인만 + satellite 좌표계 mars-relative orbit + Floating Origin Tier transition 16292배 점프 + 5 body → 8 body 측정 확장). **가설 5 sub-가설 3종**: (5a) phobos/deimos `boundingSphere.radiusWorld` 비동기 갱신 sync access 무한 wait / (5b) `projectWorldToScreen` NDC 변환 numerical precision NaN/Infinity Chromium GPU shader freeze (R5 ADR §Amendment 1 measurement metric mismatch 영역 정합) / (5c) `page.evaluate` payload 직렬화 satellite mesh 순환 참조 IPC deadlock. **ADR `20260531-606-r1-guard-playwright-freeze-forensic.md` 신규 박제** (forensic ADR 변형 8섹션 구조 답습 — `docs/templates/forensic-adr-template.md` 정합): §1 회귀 시점 측정 + 가설 검증 5종 + §2 영향 모듈/파일 + §3 옵션 5종 비교 매트릭스 (a/b/c/d/e) + §4 Concrete Prediction 5항목 (라인 수 + D-X1/D-X2 + Provisional→Accepted 전이 조건 + 인접 영역 무영향) + §5 결정 (옵션 e — Provisional + 후속 분리) + §6 위험 5종 / 재검토 트리거 4종 + §7 Amendment 라운드 N≥1 예상 + §8 참고 (cross-link 8건). **옵션 매트릭스 (5축 비교 사용자 결정 영역)**: (a) targetIds 5 body 임시 revert (가설 5 확정 검증) / (b) ci.yml r1-guard step `timeout-minutes: 10` 추가 (즉각 가드) / (c) `projectWorldToScreen` numerical guard 강화 (가설 5b 직접 타격) / (d) Playwright launch options 정정 (가설 1 잔존 영역 보완) / (e) ADR Provisional 박제만 (단기/장기 fix 후속 분리). **architect 사전 선호**: 단기 (b) + (a) 결합 / 장기 (c) 또는 (d) root cause fix + R6 진입 전 일반화 가드. **본 PR 결정**: (e) ADR Provisional 박제만 — 사용자 합의 옵션 D 답습 + CRITICAL #2 정합 (root cause 미확정 상태에서 즉시 fix 결정 금지). **R6 인계 가치**: R6 진입 시 galilean 4 satellite 추가로 stuck 가속 (8 body → 12 body) — 본 ADR §6 §위험 #2 박제로 R6 architect 단계 root cause fix 선행 의무 자동 트리거. **PATCH 분류** — CLAUDE.md §릴리스 §"행동 변화 vs 문서 변경 판정 질문" 기준 (코드 / 박제값 / 회귀 가드 / 단위 테스트 / 워크플로 동작 변화 0). **cross-validate 반영 (4축 분류)** — 합의 5건 (forensic 8섹션 정합 / 회귀 시점 정확도 2초 / 가설 5 정황 증거 / 보안 양호 / 인코딩 정합) + 이견 0 + Claude 기각 1건 (agy 제안 2 옵션 b 본 PR 통합 머지 권고 거부 — 사용자 합의 옵션 D 정합 + 후속 PR 분리로 가치 보존) + 고유 발견 수용 2건 (agy 제안 1 가설 5b/5c 작동 메커니즘 구체화 본문 보강 — 5b pure JS NaN CPU 무한 loop / 5c page.evaluate 직렬화 분기 + payload 원시 데이터 타입 운영 규칙 신설 / agy 제안 3 Concrete Prediction §예측 3 정량화 분리 — D-X1a 워크플로 < 10분 + D-X1b r1-guard step < 2분 + 측정 도구 박제). **후속 PR (옵션 b) 우선순위 high 격상** — agy 제안 2 거부 후속 PR 분리 가치 보존, 본 ADR §5 §Fix 후 박제 의무 박제. 비-범위: 단기/장기 fix 구현 (옵션 a/b/c/d, 별도 후속 PR 분리) / R5 ADR §결정 5 Amendment (fix 후 박제값 영향 시) / Playwright trace upload 활성화 / GitHub Actions debug logging 활성화 / 메모리 SSoT 갱신 (#606 종결 후 일괄) / 코드 / 회귀 가드 / 단위 테스트 / 박제값 모두 변경 0.

- **[#604] R5 ADR §결정 4 Amendment 1 — 산식 1.69x vs 실측 0.99 분리 명시 (Accepted, cross-validate 2026-05-31 agy outcome=applied)** ([#604](https://github.com/coseo12/astro-simulator/issues/604)) — PR #603 (#597 NO-OP ADR) §Forensic 측정 §핵심 발견 #1 부산물 박제. **결정 (옵션 B 채택)**: §결정 4 산식 (1.69x) 유지 + PR #603 실측 데이터 (phobos `phobos.position.length() / mars.boundingSphere.radiusWorld` = 0.99 모든 cell / deimos = 2.49 모든 cell) 분리 박제 + Tier scale 가설 3종 박제 (검증 없음) + R6 architect 단계 산식 정정 의무 트리거 갱신. **ADR `20260528-r5-mars-visualization.md` §Amendment 1 신규 §섹션 추가**: 산식 보존 (§결정 4 SSoT) + 실측 표 박제 (headless 7 cell + 실 Chrome 8 cell 동일 패턴 — 환경 무관) + mismatch 분석 (산식 vs 실측 1.71배 일관 ratio — 단일 원인 시사) + 가설 3종 (Floating Origin Tier scale 변환 누락 / `mesh.scaling` 후 `boundingSphere.radiusWorld` 갱신 시점 / measurement metric vs 산식 metric 정의 차이) + 옵션 A/B/C 비교 + 옵션 B 선택 근거 5축 + §재검토 트리거 갱신. **ADR 메타데이터 상태**: `Accepted + Amendment 1 Accepted (#604, cross-validate 2026-05-31 agy outcome=applied)` 박제 (CLAUDE.md §ADR Status 워크플로 #370 정합, Provisional → Accepted 전이 완료). **현재 유효 결정 요약 핵심 박제값 표 + §핵심 결정 요약 #4 갱신**: 산식 1.69x / 실측 0.99 분리 명시 cross-link. **옵션 A 거부 근거**: priority:low 대비 작업량 과잉 + Floating Origin SSoT 침범 위험. **옵션 C 거부 근거**: mismatch 박제 보류 시 R6 architect 가 발견 못 할 위험 (volt #21 변형). **PATCH 분류** — CLAUDE.md §릴리스 §"행동 변화 vs 문서 변경 판정 질문" 기준 (에이전트 / 코드 / 박제값 / 회귀 가드 동작 변화 없음). **cross-validate 반영 (4축 분류)** — 합의 3건 (PATCH 분류 / ADR 정합 / 옵션 B 자체 반박 0) + 이견 0 + Claude 기각 1건 (agy 제안 1 CHANGELOG 1500자 한 줄 개행 분할 거부 — 프로젝트 컨벤션 답습 우선) + 고유 발견 2건 즉시 반영 (agy 제안 2 수용 — phobos mismatch 수식 오타 정정 1.74 → 1.71배, 1.69/0.99=1.708 사실 정합 + deimos 1.71 일관성 강화 / agy 제안 3 수용 — R6 architect 단계 Tier 변환 edge validation 테스트 의무 명시 §재검토 트리거 추가). 비-범위: 산식 자체 정정 (옵션 A, R6 인계) / `MARS_SATELLITES_ORBIT_VISUAL_SCALE=500` 박제값 변경 ❌ / Floating Origin ADR (`20260422-floating-origin.md`) 갱신 ❌ / runtime debug 스크립트로 가설 검증 (PR #603 forensic 데이터 재활용) ❌ / 코드 / 회귀 가드 / 단위 테스트 / 박제값 모두 변경 0.

### Behavior Changes (R5 mars + phobos + deimos visualization)

- **[#594] R5 화성 + 포보스 + 데이모스 시각화 — Q2=B 2번째 본 인스턴스화 + satellite 2개 첫 본 사례** ([#594](https://github.com/coseo12/astro-simulator/issues/594)) — Roadmap v3 §R5 진입. PM 합의 라운드 1 (2026-05-28): **Q1=B** (mars + phobos + deimos 모두 진입) / Q2/Q3 architect 위임 / **Q4a=A** (shortcut bar 에 mars 만 추가, phobos/deimos 미등록 — 모바일 너비 안전) / **Q5=A** (sunScale 50 보존). ADR: [`20260528-r5-mars-visualization.md`](docs/decisions/20260528-r5-mars-visualization.md) (Accepted, cross-validate 2026-05-28 agy outcome=applied, R4 ADR forensic 변형 8섹션 구조 답습 + satellite 2개 첫 본 사례 SSoT). **박제값 매트릭스**: `marsScale=800` (earth 동일값, radius 53.3% 사실 비율 정확 정합, mars sun 대비 px 비 ~7.81% margin 0.19%) / `phobosScale=5000` (moon Amendment 4 학습 — 사실 비율 0.326% 명시 위배 + 4px fallback billboard 의존) / `deimosScale=5000` (phobos 동일값, mental model "phobos ≈ deimos") / `MARS_SATELLITES_ORBIT_VISUAL_SCALE=500` (phobos 분리 마진 1.69x binding constraint / deimos 4.27x 자동 안전, R4 §결정 6 패턴 답습 + cross-validate 이견 수용 #1 명명 박제 — `MARS_SATELLITES_*` 채택, deimos 포함하므로 `MARS_PHOBOS_*` 보다 정확). **5곳 동시 박제** (R-Phase Allowlist Guard ADR §결정 4 절차 답습): (1) `R_PHASE_BODY_ALLOWLIST` 에 mars/phobos/deimos 추가 (`packages/core/src/scene/r-phase-allowlist.ts`) (2) R5 ADR §결정 7 cross-link (3) `browser-verify-r-phase-allowlist.mjs` expected list 갱신 + URL 직접 진입 매트릭스 4-B 에 mars/phobos/deimos 정상 진입 cell 추가 (4) 본 CHANGELOG `[Unreleased]` `### Behavior Changes` 박제 (5) `verify-core-exports-immutable.sh` 통과 (WASM sub-path 추가 0건). **추가 박제**: `apps/web/src/constants/body-scale.ts` 에 mars/phobos/deimos 3줄 + `apps/web/src/components/layout/focus-quick-buttons.tsx` FOCUS_BUTTONS 에 mars 1줄 (Q4a=A) + `packages/core/src/scene/orbit-visual-scale.ts` 에 `MARS_SATELLITES_ORBIT_VISUAL_SCALE=500` + `ORBIT_VISUAL_SCALE_BY_PARENT.mars` 1줄 + `apps/web/scripts/r1-ui-regression-guard.mjs` `PX_RATIO_THRESHOLDS.mars=8` + `targetIds` 에 mars/phobos/deimos 추가 + `apps/web/scripts/browser-verify-378-focus.mjs` FOCUS_BODIES 에 R4 drift 누적 (earth/moon) + R5 (mars/phobos/deimos) 동시 추가 (R4 baseline 잔존 drift 해소, R5 ADR §위험 #4 박제 정합). **Concrete Prediction 측정**: R4 ADR §Concrete Prediction "R5 추가 시 ≤ 7 라인" 의 본 R5 검증 — 코드 변경 ~8 라인 (BODY_SCALE 3 + R_PHASE_BODY_ALLOWLIST 3 + FOCUS_BUTTONS 1 + ORBIT_VISUAL_SCALE_BY_PARENT 1, +1 라인 over: `ORBIT_VISUAL_SCALE_BY_PARENT.mars` 추가 1줄 사유, R6+ 예상 갱신 박제). **단위 테스트 갱신**: `r-phase-allowlist.test.ts` (length 5→8, mars/phobos/deimos 단언 + isRPhaseFocusable 갱신) / `body-scale.test.ts` (mars/phobos/deimos getBodyScale 단언 3건) / `orbit-visual-scale.test.ts` (MARS_SATELLITES_ORBIT_VISUAL_SCALE = 500 단언 + phobos 1.69x / deimos 4.27x 분리 마진 산출 검증 2건) / `focus-quick-buttons.test.tsx` (mars 활성 + 텍스트 "화성" 단언 + phobos/deimos shortcut 미등록 검증 — Q4a=A 박제). **R6 인계 의무** (R5 ADR §위험 #7 + §위험 #6): R6 jupiter 진입 시 11 버튼 = 392 px > 375 px overflow → horizontal scroll / 2단 grid 재트리거 + ORBIT_VISUAL_SCALE_BY_PARENT.jupiter 신규 / satellite 별 fine-tuning 필요 시 `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 도입 (Amendment 1 가능). **Amendment 라운드 N≥1 예상** (D-T2 사용자 검증 결과로). 비-범위: mars 표면 visual / phobos irregular shape / mars 이심율 시각 강조 / shortcut bar 모바일 너비 재조정 (R6 trigger) / 실측 데이터 변경 / LOD 시스템 변경 / R6+ body 진입.

## [0.18.0] — 2026-05-27

### 요약

R4 (지구+달) visualization 완주 + a11y baseline 도입 + Z 패턴 ADR Amendment 7~12 누적 + R1~R3 후속 NO-OP 일괄 정리. 46 커밋 누적 — 마지막 릴리스 v0.17.0 (2026-05-20) 이후 7일. 상세 entry 22건은 아래 sub-section 참조.

**카테고리별 머지 매핑**:

- **R4 (지구+달) 사이클**: `#532` / `#534` / `#539` / `#546` — R4 ADR forensic 변형 승격 + Amendment 4 까지 누적, Q2=B SSoT 첫 본 인스턴스화 (PR #533/#537/#540/#543/#545/#547/#548/#549)
- **a11y baseline + WCAG 2.2 AA**: `#535` / `#551` / `#552` / `#564` — 자동 측정 가드 + 격차 3건 통합 fix + target-size 전 영역 정합 (PR #551/#560/#561/#567)
- **저사양 모바일 FPS 가드**: `#536` (PR #553)
- **Visual Fidelity 원칙 명문화**: `#541` — `docs/architecture/principles.md` §1 (PR #550)
- **Z 패턴 ADR Amendment 7~12**: `#554` / `#556` / `#557` / `#569` / `#572` / `#574` / `#577` / `#578` / `#581` — 측정 식 자기참조 인플레이션 정정 + Phase 1 드리프트 가시화 + 경고 피로감 가드 (N=10 soft-warn) + [TODO] → upstream PR URL 자동 해소 + Phase 3 sidecar 라이프사이클 자동화 + PR title 컨벤션 의무 + TODO Aging Guard (시간 누적 차원) + .prettierignore 교차 검증 가드 거부 박제 + cross-repo false-positive 차단 (PR #555/#570/#571/#575/#576/#579/#580/#582/#583/#585/#586/#587/#588/#589/#590/#591)
- **R4 후속 docs 정리**: `#563` / `#565` / `#566` — principles.md cross-link + dead reference 정정 + ADR 전이 (PR #584)
- **NO-OP 결정 박제**: `#446` / `#445` / `#447` / `#438` / `#376` / `#353` / `#352` / `#383` — Camera 리팩토링 2건 + UX polishing 3건 + R1 메타 가드 자동화 2건 + verify-visual-proportion (PR #524/#527/#529/#530)
- **인프라**: harness v3.6.0 → v4.2.5 Antigravity 마이그레이션 (PR #544), Glossary + ADR Status workflow + 시각 자료 embed 표준 (`#449`/`#370`/`#382` PR #520)
- **기타**: iOS Safari 17.4+ Yoshida4 bench 가이드 (`#219` PR #531), lint 부채 정리 (`#386`/`#434`/`#435` PR #521), URL R-Phase 가드 자동 제거 옵션 A (`#418` PR #525), LodBodyInfo dev overlay 컬럼 (`#393` PR #528), R3 venus 명시 단언 보강 (`#416` PR #522), R1 ADR Amendment v3 모바일 점유율 박제값 정정 (`#427` PR #526), 폐기 코드 정리 (`#405` PR #523), r1-guard baseline Linux CI 전환 (`#337` PR #562/#568), CLAUDE.md Z 패턴 TL;DR 3단계 카드 (`#559` PR #588), adr-z-pattern-health-v2 CI exit code 계약 SSoT (`#558` PR #587)

### Behavior Changes (Amendment 10 cross-repo false-positive 차단)

- **[#581] Amendment 10 §결정점 2 정정 — `extractIssueRefsFromTitle()` 단순 `#N` → `[#N]` brackets 필수 (cross-repo false-positive 차단)** ([#581](https://github.com/coseo12/astro-simulator/issues/581)) — PR #580 (Amendment 10) reviewer 단계 cross-repo false-positive 실측 발견 후속. **PR #254 (`volt #114` 인용) → astro-simulator #114 단순 `#N` 오탐 1건 확인** → 옵션 A 채택 (`[#N]` brackets 필수, #574 옵션 C / #578 옵션 B 패턴 답습). **수정**: `scripts/verify-z-pattern-health.mjs` `extractIssueRefsFromTitle()` 패턴 3 정정 — `(?:^|[^\\w/])#(\\d+)\\b` → `\\[#(\\d+)\\]` brackets 필수. 본 프로젝트 PR title 컨벤션 (`feat(scope): [#N] description`) 표준 답습으로 false-positive 회피. **self-test 확장**: 기존 6 cases (extractIssueRefs) + 5 cases 추가 (cross-repo volt #114 skip / 단순 #N skip / PR squash merge suffix `(#583)` skip / upstream 자기 ref skip / brackets 정합 매칭 정상) → 총 **22 PASS, 0 failed**. 1 case 갱신 (`multi` — brackets 강제 정합). **baseline 재실측**: 다운스트림 [TODO] 잔존 8 파일 → upstream merged PR 매칭 3건 (`.claude/agents/architect.md` / `.claude/agents/pm.md` / `CLAUDE.md` → upstream PR #260). 정정 전 매칭 (PR #254 `volt #114` 오탐) 제거 정합. **회귀 0 확인**: `verify-z-pattern-health.mjs` [ADR OK] 모든 임계값 미발화 / Phase 1=8 / Phase 2=4 / 진행률 50% / `verifyPhase2Sync` 동일 출력. **ADR §Amendment 10 §결정점 2 정정 박제**: 단순 `#N` → `[#N]` brackets 필수 + 옵션 A 한계 명시 (cross-repo issue number 우연 충돌 잔존, 옵션 B/C 후속 분리 가치 박제 — low). **한계 박제**: `[#252]` 형식 cross-repo issue number 우연 충돌 (upstream harness-setting #252 ↔ astro-simulator #252) 잔존 — `--dry-run` 기본 + `--apply` 분리 안전망으로 file write 위험 0, 후속 분리 우선순위 low. **agy cross-validate 비대상** — reviewer 실측 발견 가드 정정만 (기존 SSoT 보존, 신규 결정 박제 아님). 비-범위: 옵션 B (PR body 분석) ❌ / 옵션 C (다운스트림 OPEN 이슈 state 조회) ❌ — 본 PR 비-범위, 후속 분리 가치 보존.

### Behavior Changes (Amendment 12 자동화 — `--mode=todo-aging`)

- **[#577] ADR 20260515 Amendment 12 자동화 구현 — `--mode=todo-aging` + CI workflow + ADR §결정점 3 정정** ([#577](https://github.com/coseo12/astro-simulator/issues/577)) — PR #585 (Amendment 12 Provisional ADR 박제) 후속 developer 사이클. **자동화 구현**: `scripts/verify-harness-drift-decorator.mjs` 에 `--mode=todo-aging` 분기 추가 (~+130 라인) — `findTodoLines()` / `getBlameForLine()` (porcelain 형식 파싱) / `isHarnessManagedCommit()` (`chore(harness):` prefix 매칭) / `runTodoAging()` (blameFn 주입 가능, 테스트 격리) 헬퍼 + `mainTodoAging()` (soft-warn stdout 마커 `[TODO Aging Trigger]`). 임계값 SSoT: `TODO_AGING_THRESHOLD_DAYS = 30`. **CI workflow 통합** (`.github/workflows/adr-z-pattern-health-v2.yml`): step 2개 추가 (`Verify TODO Aging Threshold` + `Create [TODO Aging Trigger] issue`, ~+75 라인). 월 cron 시점 stdout 마커 grep 감지 시 자동 이슈 생성 (중복 방지 `gh issue list --search`, priority:medium). **self-test 확장**: 기존 36 cases 회귀 0 + Amendment 12 boundary 8 cases 추가 (positive 29일 / negative 31일 / boundary 30일 정확 / harness-managed 제외 90일 / `isHarnessManagedCommit` 단위 4) → 총 **44 PASS, 0 failed**. mock `blameFn` 주입 패턴으로 git 의존성 격리 (CLAUDE.md §가드 도입 PR DoD §(2) 3중 시뮬레이션 정합). **현재 develop tip 실측** (`--mode=todo-aging`, develop tip ff24995): violations 0 / harness-managed 제외 0 / skipped 0 — 6 drift 파일 모두 [TODO] 박제 후 1일 경과 (#571 Amendment 8 일괄 박제, baseline buffer 29일 여유). **ADR §결정점 3 정정** (architect 가정 오류 → developer 단계 실측 정정): `.harness/manifest.json` 의 `apply.*` 키 매트릭스 매칭 가정 오류 (실제 manifest 키 `harnessVersion`/`installedAt`/`files` 만 존재) → commit message prefix `chore(harness):` 매칭으로 정정. ADR §결정점 3 본문 + §baseline 실측 표 동시 갱신 (baseline 표는 architect 단계 "파일 첫 박제 시점" → developer 단계 "[TODO] 라인 git blame 시점" 정합 — §결정점 6 §정의 정합, CLAUDE.md §스프린트 계약 #10 답습). **회귀 0 확인**: 4 모드 모두 정상 (verify drift 6 / PASS 6 / FAIL 0 / orphans 0 / count-warn drift 6 < N=10 / sidecar-cleanup orphan 0 / todo-aging violations 0). `verify-agent-ssot.sh` 회귀 0 (script + workflow + ADR 변경만, 5 페르소나 .md 변경 없음). **silent 가드 비대칭 의도적** (Amendment 8/9/10/11 답습): 데코레이터 누락 = fail-fast / drift 카운트 = soft-warn / TODO 해소 = soft-warn + opt-in 자동화 / sidecar = fail-fast (verify) + opt-in 자동화 / **TODO Aging = soft-warn** (시점 차이 — 30일 경과 시점엔 upstream PR 미제출 또는 망각 상태, hard-block 불가). **§재검토 조건 #5 > #6 > #7 우선순위 박제** (자동 이슈 본문에 동시 발화 시 분기 의무 명시). **D8 메타 측정 자기 적용 안정성**: 본 가드 도입 PR 자체 baseline=1일 (모든 [TODO] 라인 동일 commit) → 30일 임계 위반 0 → 자기 모순 회피 PASS (회귀 가드 4축 §4 정합). **후속 분리 영역**: Amendment 12 Provisional → Accepted 전이 (CLAUDE.md §ADR Status 워크플로 §전이 절차 답습, #566 PR #584 머지 사례) — 별도 후속 PR. 비-범위: ADR §결정 본문 / Amendment 8 데코레이터 형식 / Amendment 9 N=10 임계 / Amendment 10 매칭 휴리스틱 / Amendment 11 sidecar 라이프사이클 / Y-회귀 doctor mute (#573 upstream 영역) / Prettier 정합성 (#578) / agy CLI 헬퍼 (cross-validate 고유 발견 2, 사용자 결정 분기) 모두 변경 ❌.

### Notes (행동 변경 없음 — 문서·주석 정합성 정리)

- **[#578] agy 권고 drift ↔ .prettierignore 교차 검증 가드 — 거부 근거 박제 (baseline 실측 후 ROI 검증 실패)** ([#578](https://github.com/coseo12/astro-simulator/issues/578)) — PR #569 (Amendment 10) cross-validate agy 고유 발견 #3 후속 분리. **baseline 실측 (develop tip, 2026-05-27)**: 6 drift 파일 ↔ `.prettierignore` 교차 검증 — 1건 누락 (`docs/phases/roadmap-v3-incremental.md`), 5건 정합 포함. **누락 원인**: CLAUDE.md "프로젝트 고유 보강 교훈" §"prettier 컨벤션 충돌" §예외 경로 SSoT (`docs/phases/**` 등) 정합 의도적 제외 — `sync-prettierignore.mjs` 가 화이트리스트 적용. **결정: agy 제안 가드 거부** (옵션 B — ADR 거부 근거 박제만, #574 옵션 C 패턴 답습). 근거: agy 가드 도입 시 1건 즉시 false-positive (예외 경로 SSoT 충돌) + 기존 가드 (`sync-prettierignore.mjs --check` + `prettierignore-drift.yml`) 가 동일 영역 중복 검증 + 운영 부담 +1 ROI 검증 실패. **ADR `20260419-prettier-harness-conflict.md` §"drift 파일 ↔ .prettierignore 교차 검증 가드 (#578 거부 근거 박제)" 신규 §섹션 추가**. **미래 재검토 트리거 (옵션 A 승격 경로 보존)**: 예외 경로 외 drift leak 발생 / CLAUDE.md 예외 경로 SSoT 폐기 / agy 가드 + 화이트리스트 통합 신규 설계. cross-validate 비대상 — 가드 거부 결정만 (행동 변화 0, 기존 SSoT 보존). 비-범위: agy 가드 도입 (옵션 A) / 화이트리스트 매니페스트 신규 / 예외 경로 SSoT 변경 / `sync-prettierignore.mjs` 변경 / CI workflow 변경 / ADR §결정 본문 변경 모두 변경 ❌.

- **[#574] Amendment 7 §단점 — PR title 컨벤션 의무 박제 (옵션 C 채택, 가드 신규 보류)** ([#574](https://github.com/coseo12/astro-simulator/issues/574)) — PR #555 Amendment 7 cross-validate agy 후속 분리. **옵션 비교** (A/B/C): (A) Semantic PRs Linter CI 통합 — 외부 service 의존, (B) `verify-pr-title-convention.mjs` 신규 가드 — ROI marginal (위반 빈도 0), (C) ADR §단점 영역 컨벤션 박제만 — **운영 비용 0** + 미래 위반 시 옵션 B 승격 경로 보존. **결정: 옵션 C** 채택 — measurement-first 원칙 (volt #51) + Amendment 2 silent 약화 답습 + 1인 운영 부담 회피. **ADR `20260515-harness-managed-divergent-pattern.md` §Amendment 7 §트레이드오프 §단점 영역 갱신** — PR title 정합 regex 3 패턴 SSoT 박제 (`Amendment N` / `hotfix` / `release vX.Y.Z`, `isAdrEvolutionPr()` 정합) + 3축 옵션 비교 표 박제. **미래 1+ 위반 발생 시 옵션 B 승격 후속 이슈 분리 의무**. 현재 위반 빈도 0 (Amendment 7 정정 후 baseline 정상 유지). 비-범위: ADR §결정 본문 / Amendment 1~12 SSoT / 측정 식 (Amendment 7 보존) / Semantic PRs Linter 도입 / `verify-pr-title-convention.mjs` 신규 / CI workflow 신규 모두 변경 ❌. cross-validate 비대상 — 컨벤션 박제만 (옵션 C 결정값 자체는 신규지만 가드 행동 변화 0, agy 권고 답습으로 신규 결정 도입 아님).

- **[#559] Z 패턴 TL;DR 3단계 카드 + markdownlint 정합성 사전 박제** ([#559](https://github.com/coseo12/astro-simulator/issues/559)) — PR #555 (ADR 20260515 Amendment 7) 박제 직후 agy cross-validate 고유 발견 #4 후속 분리 (cross-validate 발견 6 + 7 통합 박제). **CLAUDE.md `### Z 패턴 TL;DR (3단계 카드)` 신설** ("매니페스트 최신 ≠ 파일 적용 완료" 직후): Phase 1 (선반영, 데코레이터 의무 Amendment 8) → Phase 2 (upstream PR 동시 제출, cross-link 박제) → Phase 3 (`harness update --apply-all-safe` 자동 동기화 + Amendment 10 [TODO] 해소 + Amendment 11 sidecar 정리) — silent 회귀 가드 5단 (Amendment 8/9/10/11/12) 인용. 신규 개발자 온보딩 인지 부하 완화 (agy cross-validate 발견 6 답습). **ADR `20260419-prettier-harness-conflict.md` 에 §"markdownlint 등 정적 검사 도구 충돌 가능성" 신규 §섹션 박제** (사전 가드, 본 프로젝트 markdownlint 미도입 — 미래 도입 시점 SSoT): 경계 위험 가설 (harness-managed `.md` 의 markdownlint local fix → sha256 drift) + 4 예방 가드 박제 (`.markdownlintignore` 매니페스트 동기화 + CI drift 가드 + 운영 의무 + 데코레이터 의무). prettier 경계 drift (volt #35) 답습 패턴 정합. **본 PR 자체는 markdownlint 미도입** — 미래 도입 시점 본 §섹션 참조 의무. 비-범위: markdownlint 실제 도입 / `.markdownlint.json` config / `.markdownlintignore` 신설 / CI workflow 신설 / ADR §결정 본문 변경 / Amendment 1~12 SSoT 변경 ❌ 모두 변경 0. cross-validate 비대상 — 신규 결정 박제 아님 (사전 가드 박제만, CLAUDE.md §교차검증 §"박제 직후 1회 루틴" 트리거 조건 미충족).

- **[#558] adr-z-pattern-health-v2 CI exit code 계약 SSoT 박제 — block vs warn 동작 명시** ([#558](https://github.com/coseo12/astro-simulator/issues/558)) — PR #555 (ADR 20260515 Amendment 7) 박제 직후 agy cross-validate 고유 발견 #3 후속 분리. **현재 운영 사실 (옵션 A — soft-warn) 박제만** (행동 변화 0). **ADR §결과·재검토 조건 §측정 지표 다음에 §"CI exit code 계약 (workflow 동작 SSoT)" 신규 §섹션 추가**: 가드 스크립트 exit 0/1/2 → workflow 동작 매핑 3행 표 박제 (exit 0 = PASS / exit 1 = 자동 이슈 생성 + workflow exit 0 = PASS soft-warn / exit 2 = workflow exit 1 = FAIL hard-block). 옵션 A 채택 근거: 운영 사실 답습 + Amendment 2 silent 가드 약화 SSoT 정합 + Amendment 1 점진적 진화 정합 + Amendment 8/9/10/11/12 비대칭 의도적 SSoT 정합. Hybrid (옵션 C, 90일 hard-block) 거부 — Amendment 11 §교차검증 §기각한 외부 모델 제안 (agy 60일 hard-block) 답습 거부. **Hard-block 예외**: exit 2 (실행 에러) 는 가드 자체 작동 보장 차원으로 hard-block 유지 (Amendment 8 §결정점 3a 정합). **Amendment 9/10/11/12 발화 마커 일관성 박제** (6 마커 SSoT — `[ADR Trigger]` / `[Alert Fatigue Trigger]` / `[Phase 2 Sync Required]` / `[TODO Resolution Suggested]` / `[Sidecar Cleanup — Dry Run/Apply]` / `[TODO Aging Trigger]`). **`.github/workflows/adr-z-pattern-health-v2.yml` 상단 주석 보강**: exit code 매핑 SSoT 박제 + soft-warn 옵션 A 채택 근거 + hard-block 예외 명시. **cross-validate 비대상** — 본 박제는 ADR §결정 본문 / 신규 결정 박제 / 행동 변화 모두 없음 (운영 사실 명시화만), CLAUDE.md §교차검증 §"박제 직후 1회 루틴" 트리거 조건 (정책·설계·결정 신규 박제) 미충족. 비-범위: ADR §결정 본문 변경 ❌ / 측정 식 (Amendment 7 보존) / 다른 §재검토 조건 / N 임계 / 90일 임계 / exit code 정의 자체 변경 (운영 사실 답습만) / workflow step 동작 변경 (주석 보강만, 동작 변경 0) 모두 변경 ❌.

- **[#563 / #565 / #566] R4 후속 docs 정리 일괄 — principles.md §1 cross-link + dead reference 정정 + ADR Provisional→Accepted 전이** ([#563](https://github.com/coseo12/astro-simulator/issues/563) / [#565](https://github.com/coseo12/astro-simulator/issues/565) / [#566](https://github.com/coseo12/astro-simulator/issues/566)) — PR #561 (#552 머지) 후 잔존 docs 정합성 격차 3건 묶음 처리 (행동 변화 0). **#563**: `docs/architecture/principles.md` §1 Visual Fidelity 적용 사례 표에 #552 행 추가 — `R4 후속 (a11y) / 20260525-552-a11y-baseline-fix.md §결정 3 / moon orbit color (RGB) / MOON_ORBIT_COLOR_DEFAULT = Color3(0.30, 0.35, 0.50) / WCAG 1.4.11 2.32:1 → 3.06:1 / §의무 체크리스트 4항목 첫 본 인스턴스화` 형식. PR #560 cross-validate agy 고유 발견 (architect 단계) — `#552 ADR scope 외, principles.md SSoT 권한 침범 회피` 분리 결정 답습. **#565**: `packages/core/src/scene/solar-system-scene.ts:474` 주석 dead reference 정정 — 옛 RGB `Color3(0.25, 0.28, 0.4)` → 신 SSoT `MOON_ORBIT_COLOR_DEFAULT` 변수명 + 신 RGB `Color3(0.30, 0.35, 0.50)` + `#552 a11y 갱신 — WCAG 1.4.11 3.06:1 PASS` 명시. line 513 의 일반 궤도선 (`orbitLines.color = new Color3(0.25, 0.28, 0.4)`) 은 **의도된 잔존** 박제 (moon orbit 외 모든 body, #552 fix 비대상) — 주석 2줄 추가 (volt #69 숨은 상수 변형 dead reference 차단 패턴). **#566**: `docs/decisions/20260525-552-a11y-baseline-fix.md` 메타데이터 `상태: Provisional ... → 상태: Accepted (cross-validate 2026-05-25)` 전이 — CLAUDE.md §"ADR Status 워크플로 (Provisional → Accepted, 부분 도입 — #370 옵션 C)" §전이 절차 정합. §교차검증 반영 사항 4축 분류 (합의 / 이견 수용 / Claude 재분석 기각 / 고유 발견 후속 분리) 본문 보존. 박제값 보존 — `MOON_ORBIT_COLOR_DEFAULT` / `MOON_ORBIT_COLOR_EARTH_FOCUS` / 일반 궤도선 `Color3(0.25, 0.28, 0.4)` / ADR §결정 본문 / principles.md §의무 체크리스트 4항목 SSoT (#541) 모두 무수정. 비-범위: #552 ADR §결정 본문 변경 ❌ / moon orbit 색상 값 재변경 ❌ / 다른 ADR 의 Status 전이 (#566 비-범위에 박제 — 별도 후속 이슈 분리) / principles.md §의무 체크리스트 4항목 SSoT 변경 (#541 SSoT 권한 보존) ❌ / R4 §결정 5 / focus-quick-buttons / shortcut bar 레이아웃 ❌. 코드 변경 합계 **3 파일 (principles.md +1행 / solar-system-scene.ts 주석 3줄 갱신 / ADR 메타데이터 1줄)** — 행동 변화 0, 문서·주석 정합성 강화.

### Behavior Changes

- **[#577] ADR 20260515 Amendment 12 (Provisional) — TODO Aging Guard (시간 누적 차원, cross-validate agy 고유 발견 #2 후속)** ([#577](https://github.com/coseo12/astro-simulator/issues/577)) — Amendment 10 PR #580 cross-validate agy Antigravity (2026-05-26) 고유 발견 #2 후속 분리. Amendment 10 §단점 "사후 커밋 1회 의무 leak" + 영구 망각 위험 차단 — 다운스트림 [TODO] 박제 후 upstream PR 영영 미제출 시 silent leak 차단 가드 박제 (시간 누적 차원, Amendment 9/10/11 차원 직교). **baseline 실측** (develop tip ff24995, 2026-05-26): [TODO] 잔존 4 파일 git blame 시점 — harness-guards.yml (31일, harness-managed) / verify-z-pattern-health.mjs (9일, Phase 1) / verify-harness-drift-decorator.mjs (당일) / resolve-harness-drift-todo.mjs (당일). agy 원안 7일 임계 검증 결과 즉시 1건 위반 (verify-z-pattern-health 9일) — measurement-first 원칙 (CLAUDE.md §"가드 설계 원칙" + §스프린트 계약 #10) 정정 후 30일 채택 (baseline 위반 0 + buffer 21일 + Amendment 2 ~1 sprint 정합). **결정점 1 — 시점 추적**: git blame 채택 (메타파일 거부 — 단일 SSoT + 운영 부담 0). **결정점 2 — 임계 기간**: 30일 (`TODO_AGING_THRESHOLD_DAYS = 30`) — 7/14/60/90일 후보 비교 후 채택. **결정점 3 — harness-managed 카테고리 분리**: `.harness/manifest.json` 매트릭스 매칭 → harness-managed (upstream 영역, #573 직교) 제외. **결정점 4 — 발화 형태**: soft-warn (`[TODO Aging Trigger]` 자동 이슈, Amendment 9/10 답습) — hard-fail 거부 (1인 운영 부담 폭증 회피, Amendment 11 §교차검증 §기각 agy 60일 hard-block 에스컬레이션 답습). **결정점 5 — 통합 위치**: `verify-harness-drift-decorator.mjs` 통합 (`--mode=todo-aging` 신규, 단일 스크립트 SSoT). **결정점 6 — git blame 시점 정의**: [TODO] 라인 최초 commit 시점 (라인 수정 시 갱신, Amendment 10 URL 교체 발생 시 자연 해소). **silent 가드 비대칭 의도적** (Amendment 8/9/10/11 답습 + 본 Amendment 12 확장): 데코레이터 누락 (Amendment 8) = fail-fast / drift 카운트 (Amendment 9) = soft-warn / TODO 해소 (Amendment 10) = soft-warn + opt-in 자동화 / sidecar 라이프사이클 (Amendment 11) = fail-fast + opt-in 자동화 / **TODO Aging (Amendment 12) = soft-warn** (사후 행동 + 시점 차이 — 30일 경과 시점엔 upstream PR 미제출 또는 망각). **CLI 모드 분기 SSoT 확장**: 기존 `--mode=verify` (Amendment 8) / `--mode=count-warn` (Amendment 9) / `--mode=sidecar-cleanup` (Amendment 11) + 신규 **`--mode=todo-aging`** (Amendment 12) — 4 모드 분기. **§재검토 조건 #7 신설** — 시간/누적 차원 (#5 Phase 2 진행률) + drift 파일 수 차원 (#6 Amendment 9) + **TODO 시간 누적 차원 (#7 본 Amendment 12)** 직교 박제. 동시 발화 시 우선순위 명시 (#5 > #6 > #7). **본 PR은 ADR Amendment 박제 + cross-validate만 — 자동화 스크립트 구현은 별도 후속 developer 사이클**. ADR Status **Provisional** (cross-validate 결과 본문 통합 후 별도 후속 이슈로 Accepted 전이 — CLAUDE.md §"ADR Status 워크플로" §전이 절차 답습, #566 PR #584 머지 사례 참조). 비-범위: ADR §결정 본문 변경 ❌ / Amendment 8 데코레이터 형식 ❌ / Amendment 9 N=10 임계 ❌ / Amendment 10 매칭 휴리스틱 ❌ / Amendment 11 sidecar-cleanup 모드 ❌ / 자동화 스크립트 구현 (별도 developer 사이클) / Y-회귀 doctor mute (#573, upstream 영역) / Prettier 정합성 (#578) / Upstream PR 데코레이터 오염 방지 (#581) 모두 변경 ❌.

- **[#572] ADR 20260515 Amendment 11 — Phase 3 sidecar 라이프사이클 자동화 (cross-validate agy 고유 발견 #1 후속)** ([#572](https://github.com/coseo12/astro-simulator/issues/572)) — Amendment 9 PR #575 cross-validate agy Antigravity (2026-05-26) 고유 발견 #1 후속 분리. agy §6 §누락 요소 1 "사후 라이프사이클 단계가 모호합니다" 영구 박제 해소 — Phase 3 (`harness update --apply-all-safe`) 가 drift 해소 시 sidecar (`<filename>.HARNESS-DRIFT.md`) 자동 정리 자동화 박제. **자동화 방식 (ADR §결정점 1)**: 기존 `scripts/verify-harness-drift-decorator.mjs` 의 `parseMode()` 헬퍼에 `sidecar-cleanup` 옵션 추가 — Amendment 9 (`count-warn`) / Amendment 10 (단일 스크립트 통합) 패턴 답습. 신규 별도 스크립트 거부 (운영 부담 2배). **감지 휴리스틱 (ADR §결정점 2)**: 기존 `detectOrphanSidecars()` (라인 175~217) 재사용 — 검사 1 (`base file missing`) + 검사 2 (`base file not in drift state (Phase 3 cleanup needed)`) 결합 박제. 휴리스틱 SSoT 단일화 (`verify` 모드 / `sidecar-cleanup` 모드 양쪽 동일 헬퍼 호출, 코드 중복 0). **발화 형태 (ADR §결정점 3 옵션 C — Amendment 10 패턴 답습)**: `--dry-run` 기본 (목록 출력만, 파일 잔존) + `--apply` 명시 시 실제 file unlink. 자동 즉시 삭제 (옵션 A) 거부 (회수 불가). soft-warn 자동 코멘트 (옵션 B) 거부 (sidecar 라이프사이클은 PR 자동 코멘트보다 로컬 사전 정리 효율적). **silent 가드 방향 (ADR §결정점 4 비대칭 이중 박제)**: `verify` 모드 fail-fast 보존 (Amendment 8 silent leak 차단) + `sidecar-cleanup` 모드 opt-in 자동화 (사용자 시점 정리). Amendment 8/9/10/11 비대칭 SSoT 통합표 박제 (ADR §결정점 4 표). **CLI 시그니처**: `node scripts/verify-harness-drift-decorator.mjs --mode=sidecar-cleanup [--apply]` — 3 모드 (verify 기본 / count-warn / sidecar-cleanup) 분기. stdout 마커 SSoT: `[Sidecar Cleanup — Dry Run]` (dry-run) / `[Sidecar Cleanup — Apply]` (apply). **self-test 확장**: 기존 29 cases (regex 13 / format 7 / sim 5 / count-warn 4) 회귀 0 + Amendment 11 boundary 4 cases 추가 → 총 **36 PASS, 0 failed** (positive 0 / dry-run 2 / apply→recovery 2 / drift 안전 거부 1, ADR §회귀 가드 4축 §(2) 3중 시뮬레이션 정합). **현재 develop tip 실측** (develop tip 39cff53): sidecar 0 / orphan 0 — Amendment 8 sidecar 자체 부재 (적용 빈도 < 5건 박제값 정합). 본 가드 도입 시점 즉시 적용 가능한 cleanup 대상 0건, 미래 sidecar 추가 시점부터 가드 작동. **`--apply` 안전 장치**: `detectOrphanSidecars()` 가 식별한 orphan 만 삭제 — 정상 sidecar (drift 상태 base file 동반) 는 절대 삭제 대상 아님. self-test case 4 (`alive.json.HARNESS-DRIFT.md` 안전 거부) 가 회귀 가드. **CI workflow 변경 0건** (ADR §Concrete Prediction SSoT 정합) — sidecar-cleanup 는 opt-in CLI 모드 (사용자 명시 호출만), `verify` 모드 fail-fast 동작 기존 workflow 정합 유지. ADR §결정점 3 §옵션 B (soft-warn 라벨 + 자동 코멘트) 명시적 거부 박제값 보존. **회귀 0 확인**: `--mode=verify` 라이브 (drift 6 / PASS 6 / orphan 0 / exit 0) + `--mode=count-warn` 라이브 (drift 6 < N=10 / exit 0) + 신규 `--mode=sidecar-cleanup` 라이브 (no orphan sidecars / exit 0). `verify-agent-ssot.sh` 회귀 0 (script + CHANGELOG 변경만, 5 페르소나 .md 변경 없음). **silent 가드 비대칭 의도적** (Amendment 8/9/10 답습): 데코레이터 누락 = fail-fast / drift 카운트 초과 = soft-warn / TODO 해소 매칭 = soft-warn + opt-in 자동화 / sidecar 라이프사이클 = fail-fast (verify) + opt-in 자동화 (sidecar-cleanup) 이중 박제. **D8 메타 측정 자기 적용 안정성**: `verify-harness-drift-decorator.mjs` 자체에도 `// HARNESS-DRIFT: Z-PATTERN [TODO]` 데코레이터 박제 보존 (Phase 1 도입 PR 정합). 비-범위: ADR §결정 본문 변경 ❌ / 측정 식 (Amendment 7 보존) / 데코레이터 형식 (Amendment 8 보존) / N=10 임계 (Amendment 9 보존) / [TODO] 매칭 휴리스틱 (Amendment 10 보존) / TODO Aging Guard (#577 영역) / Prettier 정합성 (#578 영역) / Y-회귀 doctor mute (#573, upstream 영역) / agy 고유 발견 후속 분리 (#581 Upstream PR 데코레이터 오염 방지, low #6 누락 요소 2 / 3) 모두 변경 ❌.

- **[#569] ADR 20260515 Amendment 10 — [TODO] → upstream PR URL 자동 해소 (cross-validate agy 고유 발견 #1 후속)** ([#569](https://github.com/coseo12/astro-simulator/issues/569)) — Amendment 8 PR #570 cross-validate agy Antigravity (2026-05-26) 고유 발견 #1 후속 분리. Amendment 8 §단점 "TODO → URL 교체 누락" systemic leak 차단 자동화 박제 (silent 가드 강화 방향, Amendment 2/6 약화와 비대칭 일관). **자동화 방식**: 기존 `scripts/verify-z-pattern-health.mjs` 의 `verifyPhase2Sync()` 확장 (`includeTodoResolution` 옵션 추가, +~120 라인) — upstream merged PR (coseo12/harness-setting, "ADR 20260515" 검색) 의 title issue ref 추출 + 변경 파일 경로 매칭 + 다운스트림 [TODO] 잔존 파일과 AND 결합. **매칭 휴리스틱** (ADR §결정점 2 후보 다): (a) upstream PR title 에 본 프로젝트 이슈 ref (`#N` / `astro-simulator#N` / `coseo12/astro-simulator#N` 3 패턴 SSoT) AND (b) upstream PR 변경 파일 경로 = 다운스트림 [TODO] 잔존 파일 — 둘 다 충족 시 매칭 (precision ↑, false-positive 회피). **신규 wrapper CLI**: `scripts/resolve-harness-drift-todo.mjs` (~270 라인) — `--dry-run` (기본 안전, file write 없음, 매칭 N≥1 → exit 1 soft-warn) / `--apply` (실제 갱신, file write) / `--file=<path>` (특정 파일만) / `--self-test` (인라인 17 cases) 모드 분기. **CI workflow 통합**: `.github/workflows/adr-z-pattern-health-v2.yml` 에 step 2개 추가 (`Detect [TODO] resolution candidates` + `Create [TODO Resolution Suggested] issue`) — 월 cron 시점 stdout `[TODO Resolution Suggested]` 마커 grep 감지 시 자동 이슈 생성 (중복 방지 `gh issue list --search`). **현재 develop tip 실측** (--dry-run, develop tip 263c1cf): 다운스트림 [TODO] 잔존 7 파일 → upstream merged PR 매칭 3건 (`CLAUDE.md` → upstream PR #254 / `.claude/agents/architect.md` → upstream PR #260 / `.claude/agents/pm.md` → upstream PR #260). 잔존 4 파일 (verify-z-pattern-health.mjs / verify-harness-drift-decorator.mjs / resolve-harness-drift-todo.mjs / docs/phases/roadmap-v3-incremental.md / .github/workflows/harness-guards.yml) 은 upstream PR 미생성 (Amendment 8/9/10 본 프로젝트 분기 영역, harness-setting 영역 X). **self-test 17 cases PASS**: extractIssueRefs 6 (3 패턴 / multi / empty / no refs) + applyTodoReplacement 9 (.md / .mjs / .yml positive + 4 negative + 2 boundary) + AND 결합 boundary 2. **회귀 0 확인**: 기존 `verify-z-pattern-health.mjs` Phase 1=6 / Phase 2=4 / 진행률 66.7% / exit 0 + `[Phase 2 Sync] OK` 동일 출력. `verify-agent-ssot.sh` 회귀 0 (script + workflow 변경만, 5 페르소나 .md 변경 없음). **silent 가드 비대칭 의도적** (Amendment 8/9 답습): 데코레이터 누락 = fail-fast / drift 카운트 초과 = soft-warn / TODO 해소 매칭 = soft-warn (시점 차이, Phase 1 PR 시점엔 upstream PR 미생성). **D8 메타 측정 자기 적용 안정성**: `resolve-harness-drift-todo.mjs` 자체에도 `// HARNESS-DRIFT: Z-PATTERN [TODO]` 데코레이터 박제 (Phase 1 도입 PR 정합). 비-범위: ADR §결정 본문 변경 ❌ / 측정 식 (Amendment 7 보존) / 데코레이터 형식 (Amendment 8 보존) / N=10 임계 (Amendment 9 보존) / TODO Aging Guard (#577 영역) / sidecar 자동 삭제 (#572 영역) / Prettier 정합성 (#578 영역) / upstream harness-setting 영역 (#573) 모두 변경 ❌.

- **[#557] ADR 20260515 Amendment 9 — 경고 피로감 가드 (활성 drift ≥ N=10 soft-warn, cross-validate agy 고유 발견 #2)** ([#557](https://github.com/coseo12/astro-simulator/issues/557)) — Amendment 7 (PR #555) cross-validate agy Antigravity (2026-05-25) 고유 발견 #2 후속. 활성 drift 파일 수 (`detectDriftFiles().length`, orphan 제외) 차원 silent 회귀 가드 박제 — Amendment 2/6 silent 약화 사이클 (시간/누적 차원, §재검토 조건 #5) 와 직교한 **drift 파일 수 차원** §재검토 조건 #6 신설. **임계값 SSoT**: `ALERT_FATIGUE_THRESHOLD_N = 10` (baseline 6 + buffer 4, Amendment 2 N=10 정합). agy 원안 N=3 거부 — measurement-first 원칙 (CLAUDE.md §스프린트 계약 #10) baseline=6 실측 후 N=10 정정 (volt #51 외부 툴 주장 실측 가드 패턴 답습). **확장**: `scripts/verify-harness-drift-decorator.mjs` 에 `--mode=count-warn` CLI 플래그 분기 추가 (~+130 라인). 기본 `--mode=verify` (Amendment 8 데코레이터 fail-fast) 회귀 0. count-warn 동작: drift < N → exit 0 (`alert fatigue: OK`) / drift ≥ N → exit 0 + stdout `[Alert Fatigue Trigger]` 마커 + drift 파일 목록 (soft-warn, CI hard-block 아님). **CI workflow**: `.github/workflows/adr-z-pattern-health-v2.yml` 에 step 2개 추가 (`Verify Alert Fatigue Threshold` + `Create [Alert Fatigue Trigger] issue`). 월 cron 시점 stdout `[Alert Fatigue Trigger]` 마커 grep 감지 시 자동 이슈 생성 (중복 방지 `gh issue list --search` + 3 영업일 결정 분기 의무 본문 박제 — Phase 2 가속 / 일부 Phase 1 revert / N 재조정). **self-test 확장**: 기존 25 cases (regex 13 / format 7 / sim 5) 회귀 0 + Amendment 9 boundary 4 cases 추가 (N-1=9 / N=10 / N+1=11 / files 목록 박제) → 총 29 PASS. **silent 가드 비대칭 의도적** (Amendment 8 §결정점 4 정합): 데코레이터 누락 (Phase 1 PR check) = fail-fast (예방 < 1줄) / drift 카운트 초과 (월 cron) = soft-warn (1인 운영 트레이드오프, 사용자 결정 분기). **D3 자기 적용 안정성**: 현재 develop tip drift=6 < N=10 → 본 가드 도입 PR 자체가 즉시 위반 상태로 진입하는 자기 모순 회피. **회귀 0 확인**: `verify-agent-ssot.sh` 회귀 0 (script + workflow 변경만, 5 페르소나 .md 변경 없음). 비-범위: ADR §결정 본문 / 측정 식 (Amendment 7 보존) / 데코레이터 형식 (Amendment 8 보존) / N=10 임계값 / TODO 자동 해소 (#569 영역) / orphan sidecar 자동 삭제 (#572 영역) 모두 변경 ❌.

- **[#556] ADR 20260515 Amendment 8 — Phase 1 드리프트 가시화 + Phase 2 중도 변경 정적 비교 가드 (cross-validate agy 고유 발견 #1)** ([#556](https://github.com/coseo12/astro-simulator/issues/556)) — Amendment 7 (PR #555) cross-validate agy Antigravity (2026-05-25) 고유 발견 #1 후속. 두 차원 가시성/무결성 강화 가드 박제 (silent 가드 강화 방향, Amendment 2/6 약화와 비대칭 일관). **차원 1 — HARNESS-DRIFT 데코레이터 의무**: Phase 1 임시 수정 (harness-managed sha256 불일치) 파일에 데코레이터 박제 의무. 본문 SSoT `HARNESS-DRIFT: Z-PATTERN [<upstream-link-or-TODO>]` + 파일 형식별 분기 (`.md` HTML 주석 / `.ts|js|mjs|cjs` line-slash / `.yml|sh` line-hash / `.json` sidecar `<filename>.HARNESS-DRIFT.md`) + 위치 (파일 첫 줄, shebang/DOCTYPE/YAML frontmatter 1블록 직후 1줄 허용). regex SSoT 박제 (ADR §Amendment 8 §위치 SSoT). developer 단계 보완 — architect 박제 regex 가 `.claude/agents/*.md` 컨벤션 (YAML frontmatter) 미커버 발견 → YAML frontmatter 1블록 prefix 허용 추가 (의미 동일, 파일 메타 헤더 직후 첫 컨텐츠 라인). **차원 2 — Phase 2 중도 변경 정적 비교 가드** (Amendment 5 보완): `scripts/verify-z-pattern-health.mjs` 에 `verifyPhase2Sync()` 함수 추가 — upstream open PR (coseo12/harness-setting, "ADR 20260515" 검색) 의 변경 파일과 로컬 drift 파일을 경로 매칭하여 `[Phase 2 Sync Drift]` 라인 stdout 박제 (soft-warn, exit code 변경 없음 — Amendment 8 §결정점 3b 옵션 A). CI workflow (`.github/workflows/adr-z-pattern-health-v2.yml`) 가 stdout 파싱하여 `[Phase 2 Sync Required]` 라벨 (priority:medium) + 자동 이슈 생성 (중복 방지 검색 후). **신규**: `scripts/verify-harness-drift-decorator.mjs` (~265 라인 — manifest sha256 비교 / 형식별 분기 / regex 검증 / sidecar 라이프사이클 + orphan 탐지 / 인라인 self-test 25 cases). CI 통합 `.github/workflows/harness-guards.yml` step 추가 (fail-fast — 데코레이터 누락 PR 차단). **데코레이터 박제 6 파일** (현재 develop tip drift): `CLAUDE.md` / `.claude/agents/architect.md` / `.claude/agents/pm.md` / `scripts/verify-z-pattern-health.mjs` / `docs/phases/roadmap-v3-incremental.md` / `.github/workflows/harness-guards.yml`. upstream PR 미생성으로 `[TODO]` 박제 — Phase 2 PR 머지 직후 실제 URL 교체 의무. **sidecar 라이프사이클 계약** (cross-validate agy 이견 수용 — orphan 방지): `<filename>.HARNESS-DRIFT.md` 존재 시 동일 디렉토리에 `<filename>` 반드시 존재 + manifest drift 상태 의무, orphan 발견 시 verify 스크립트 CI fail. **회귀 0 확인**: 기존 `verify-z-pattern-health.mjs` Phase 1=6 / Phase 2=4 / 진행률 66.7% / exit 0 동일. `verify-agent-ssot.sh` 45/45 PASS. 비-범위: ADR §결정 본문 변경 ❌ / Z 패턴 유지 / 측정 식 변경 ❌ (Amendment 7 정정 보존) / N 임계값 / 90일 임계 변경 ❌ / 동시 드리프트 N개 상한 (#557 영역) ❌ / TODO 자동 해소 (#569 Amendment 9 영역) ❌.

- **[#564] axe target-size 위반 shortcut-bar 외 영역 통합 fix — WCAG 2.2 2.5.8 전 영역 정합** ([#564](https://github.com/coseo12/astro-simulator/issues/564)) — PR #561 (#552 머지) 의 잔존 axe `serious:target-size` 위반 1건 (multi-element) 통합 fix. 3 영역에 동일 패턴 적용: (1) `apps/web/src/components/layout/mode-switcher.tsx` (observe / research / education / sandbox 4 button) — className 에 `min-w-6 min-h-6 shrink-0` 추가 + 부모 `<div>` 에 `overflow-x-auto whitespace-nowrap max-w-full` 안전망. (2) `apps/web/src/components/layout/unit-toggle.tsx` (si / astro / natural 3 button) — 동일 패턴. (3) `apps/web/src/components/layout/time-controls.tsx` (reverse / pause / forward 3 button + scale preset 6 button) — 동일 패턴. **baseline 갱신** (`docs/benchmarks/a11y-baseline.json`) — `axe.violations` 1 → 0 (desktop + mobile 모두) + `axe.ids` `["serious:target-size"]` → `[]` + 신규 `previousMeasuredAt: "2026-05-25"` (PR #561 baseline) / `updateReason` 박제 (의도성 3중 박제 — JSON updateReason / PR 본문 / CHANGELOG). 박제값 보존 — `MODES` / `UNITS` / `SCALE_PRESETS` 배열 / `data-r1-region="top-nav"` (TopBar) / `flex gap-0.5` / `flex gap-2` 구조 / 색상 토큰 / Tailwind padding 유지 (`px-2 py-1` / `px-2 py-0.5` / `p-1`) 모두 무수정. **R1 baseline 영역 영향** (top-nav) — ModeSwitcher (TopBar.left) + UnitToggle (TopBar.right) 모두 R1 baseline 영역 `[data-r1-region="top-nav"]` 안에 위치하여 24×24 px 강제 후 캡처 변화 예상. macOS 갱신 금지, workflow_dispatch CI Linux 캡처 의무 (#411/#515 패턴, volt #45 변형). TimeControls 는 TimeBar 영역 → R1 baseline 외 (영향 없음). 코드 변경 합계 **~12 라인 in-place 수정** (Concrete Prediction ~9 라인 대비 +3 라인 — scale-preset 6 button 도 동일 패턴 적용으로 정합성 확보, ADR Amendment 박제 의무 없음). PR #561 ADR §결정 1 SSoT 답습 — ADR 신규 박제 없음.
- **[#552] a11y baseline 측정 격차 3건 통합 fix — WCAG 2.2 AA 정합** ([#552](https://github.com/coseo12/astro-simulator/issues/552)) — PR #551 의 WCAG 2.2 AA 자동 측정 가드 baseline 첫 측정 (`docs/benchmarks/a11y-baseline.json`, 2026-05-24) 에서 확정된 3 격차 통합 fix. (1) axe `serious:target-size` (WCAG 2.2 2.5.8) — `apps/web/src/components/layout/focus-quick-buttons.tsx` 의 3 `<button>` className 에 `min-w-6 min-h-6 shrink-0` 추가 (Tailwind = 24×24 px hit-area 강제) + 부모 `<div>` 에 `overflow-x-auto whitespace-nowrap max-w-full` 안전망 도입 (R6 jupiter 진입 시 모바일 overflow trigger 영구 해소 + i18n locale 텍스트 길이 폭발 흡수). (2) shortcut bar fontSize 10 → 12 px — `apps/web/app/[locale]/globals.css:66` 의 `--text-mini` 토큰 0.625rem → 0.75rem 갱신 (토큰 SSoT 보존, 값만 갱신). (3) moon orbit `MOON_ORBIT_COLOR_DEFAULT` 명도 대비 2.32:1 → 3.06:1 (WCAG 1.4.11 ≥ 3:1) — `packages/core/src/scene/solar-system-scene.ts:482` 의 Color3(0.25, 0.28, 0.4) → Color3(0.30, 0.35, 0.50) 갱신 (명도 26% 상향, 톤 R:G:B 비율 보존으로 EARTH_FOCUS 10.02:1 와 자연 그라데이션 유지). **baseline 갱신** (`docs/benchmarks/a11y-baseline.json`) — 5 필드 갱신 + 신규 2 필드 (`previousMeasuredAt: "2026-05-24"` / `updateReason: "#552 통합 fix — target-size / fontSize / moon orbit contrast 3 격차 모두 임계 충족. silent 회귀 차단 보호 박제."`) 박제. 의도성 박제 3중 위치: JSON `updateReason` / ADR §결정 5 / PR #561 본문. **Visual Fidelity §의무 체크리스트 첫 본 인스턴스화** — `docs/architecture/principles.md` §1 의 4항목 (데이터 SSoT 보존 / rendering 시점 분리 / 사용자 D-T2 가이드 / baseline 박제) 모두 본 PR 의 moon orbit 색상 변경에 PASS 적용. 향후 R-Phase ADR 의 reference. 박제값 보존 — `MOON_ORBIT_COLOR_EARTH_FOCUS` (10.02:1) / `FOCUS_BUTTONS` 배열 / `flex gap-1` 구조 / `data-r1-region` 속성 / R-Phase Allowlist / orbitLines 일반 / `--text-mini` 토큰 이름 모두 무수정. 코드 변경 합계 **6 라인 in-place 수정** + baseline JSON 갱신 (Concrete Prediction 정합, R-Phase 시리즈 "데이터/상수만 변경, 신규 코드 0" 패턴 답습). agy cross-validate outcome=applied (architecture mode, log `.claude/logs/cross-validate-architecture-20260525-175423.log`) — ① 일관성 / ② Visual Fidelity 적용 우수 / ③ 인터페이스 명확성 / ⑤ 보안 (silent 갱신 차단 3중 박제) 4축 합의. cross-validate 이견 수용 2건 (overflow-x-auto 안전망 결정 1 통합 + grep 정적 분석 DoD 추가). 비-범위: `MOON_ORBIT_COLOR_EARTH_FOCUS` / FOCUS_BUTTONS 배열 / shortcut bar 레이아웃 재설계 / 다른 색상 토큰 / WCAG 2.2 가드 스크립트 / `--text-mini` 토큰 재명명 / Tailwind `text-mini` → `text-xs` 전환 / R5+ 진입 결정 / `docs/architecture/principles.md` §1 적용 사례 표 갱신 (cross-validate 고유 발견, 후속 분리). 후속 이슈 분리 (low): principles.md §1 적용 사례 표에 본 ADR (#552) 항목 + cross-link 박제 (단순 문서 cross-link, 코드 변경 0).
- **[#554] ADR 20260515 Amendment 7 — Z 패턴 측정 식 자기참조 인플레이션 정정 (옵션 D 채택)** ([#554](https://github.com/coseo12/astro-simulator/issues/554)) — 2026-05-25 자동 탐지 workflow (`.github/workflows/adr-z-pattern-health-v2.yml`) [ADR Trigger] 발화 (Phase 1 회차 12 ≥ N=10). 발화 원인 forensic: PR citations 12개 중 실제 Z 패턴 적용은 **6건** (#468/#472/#475/#478/#481/#482), 나머지 6건은 ADR 자체 진화 (Amendment 박제 4건 #486/#489/#490/#501 + 자동화 hotfix #491 + 릴리스 #494) — 측정 식 자기참조 인플레이션. CLAUDE.md §스프린트 계약 #10 "수치 DoD 미달 시 측정 방법 검증 우선" 원칙 직접 적용 (silent 가드 약화 옵션 C 또는 Phase 2 강제 옵션 A 대신 측정 결함 정정 우선). **자동화 스크립트 2단 정정** (`scripts/verify-z-pattern-health.mjs`): (1) 신규 `isAdrEvolutionPr(title)` 함수로 PR title regex (`Amendment N` / `hotfix` / `release vX.Y.Z`) 식별하여 `adrCitations` 카운트에서 제외 (2) `phase1Count = Math.max(amendmentCount, adrCitations)` → `phase1Count = adrCitations` (Math.max 폐기 — D1 검증에서 Amendment 7 박제 자체로 amendmentCount 6→7 증가하여 Math.max 가 인플레값 채택하는 2축 자기참조 발견). 정정 후 실측: Phase 1 = 6, Phase 2 = 4, 진행률 66.7% (Amendment 1 임계 33% 대비 2배 초과), 3중 OR 임계 모두 미발화 exit 0 ✅. ADR §재검토 조건 #5 본문에 "ADR 자체 진화 PR (Amendment 박제 / hotfix / release) 은 Z 적용 회차로 카운트하지 않음" 명시 + §Amendment 7 forensic 박제 (Phase 1=12 PR 분류 표 + 측정 식 2단 정정 사유 + silent 가드 무력화 위험 점검 + Claude 편향 셀프 체크 4종). agy cross-validate outcome=applied (exit 0, log `.claude/logs/cross-validate-architecture-20260525-134600.log`) — "측정 식 자체에 대한 포렌식 및 결함 분석 적용" 모범 사례 평가. 비-범위: §결정 본문 변경 / Phase 2 의무 폐지 / 다른 §재검토 조건 / N 임계 재완화 / 측정 식의 다른 차원 변경. 후속 분리 권고 (agy 고유 발견 4건, 모두 본 PR 비-범위): Phase 1 드리프트 데코레이터 주석 (medium) / 경고 피로감 가드 (medium) / CI exit code 계약 명시 (low) / 신규 진입 인지 부하 완화 (low).
- **[#546] satellite billboard 시각 강화 — parent-focus-aware LOD floor + 4 px guard (R4 Amendment 4 후속)** ([#546](https://github.com/coseo12/astro-simulator/issues/546)) — R4 Amendment 4 (moonScale 800 → 200) 머지 후 사용자 D-T2 회귀 ("줌인 상황에 따라 달이 안 보이는건 정상?") 해소. forensic 측정 (1280×720 earth focus moon level=low pxD=12.17 / 1920×1080 mid pxD=18.25 / 375×667 mid pxD=22.55, 3 viewport 모두 mid/high variant `isVisible=false`) 의 직접 원인이 **parent focus 시 child satellite 의 LOD 가 default 식으로만 결정되어 high variant 비활성화** 임을 식별. forensic ADR `docs/decisions/20260524-546-satellite-billboard-visibility-forensic.md` §5 결정 — 옵션 5 hybrid (parent-focus aware LOD floor + 4 px guard) 채택. 호출 시퀀스 LOD 엔진 baseline → satellite-visibility 가드 후처리 (SRP 단방향, agy cross-validate 이견 수용 #2). **신규 파일**: `packages/core/src/scene/satellite-visibility.ts` (parent-child + 4 px guard SSoT) + `packages/core/src/scene/satellite-visibility.test.ts` (17 케이스 — earth focus + moon / 4 px boundary / default sun 무회귀 / R5+ mars·jupiter·saturn 자동 수용 / Split-brain SRP). **변경**: `packages/core/src/scene/solar-system-scene.ts:runLodPass` 가드 호출 결합 +18 라인 + `apps/web/scripts/browser-verify-546-satellite-visibility.mjs` 3 viewport × 2 시나리오 회귀 가드. 박제값 보존 — `LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER=4` (Amendment 1) / `FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE=20` (Amendment 3) / `EARTH_MOON_ORBIT_VISUAL_SCALE=30` (Amendment 2) / `moonScale=200` (Amendment 4) / R-Phase Allowlist (5 body) / LOD 본체 (lod.ts) 모두 무수정. **R5+ 자동 수용** — parentId 기반 일반화로 R5 mars+phobos/deimos / R6 jupiter+galilean / R7 saturn+titan 본 가드 무수정 자동 활성. **D5 DoD PASS** — D5.1 earth focus moon level≥mid (3 viewport 모두 mid) / D5.2 moon-lod-mid `isVisible=true` (사용자 인지 가능 형태) / D5.3 pxDiameter≥4 (12.26~22.72 px, Amendment 1 SSoT 정합) / D5.4 default sun 시점 moon=low 보존 (Amendment 4 의도). 비-범위: LOD 본체 변경 ❌ / Amendment 1/2/3/4 박제값 변경 ❌ / camera-controller·focus-multiplier 정책 변경 ❌ / 다른 R-Phase body 영향 ❌ / R-Phase Allowlist 변경 ❌. **후속 분리 이슈 박제 예정** (agy cross-validate 고유 발견 4건): LOD 전이 visual pop (medium, R5 진입 전) / R6+ 다중 위성 인플레이션 부하 (high, R6 진입 전 필수) / dynamic FOV 가드 임계 (low) / Floating Origin shift LOD 안정성 (선택).
- **[#534] satellite-parent body focus 시 zoom-in 안내 tooltip — R4 cross-validate Gemini 권고 1 후속** ([#534](https://github.com/coseo12/astro-simulator/issues/534)) — R4 Amendment 4 (moonScale 800 → 200) 후 default 진입 시 moon disc 가 작아져 사용자가 위성 존재를 인지하기 어려운 mental model gap 을 onboarding tooltip 으로 보완. earth focus 진입 + 1.5초 delay 후 하단 toast "확대하여 달의 위치를 확인하세요" 표시 (X 버튼 + 5초 auto fade-out). 일반화 SSoT — `resolveFocusMultiplier` SSoT 재사용으로 R5 mars (포보스·데이모스) / R6 jupiter (갈릴레이 위성) / R7 saturn (타이탄) focus 시 자동 활성 (body 별 텍스트 분기 + per-body localStorage 키 `r4.satellite-zoom-tooltip-shown.<bodyId>`). **신규 파일**: `apps/web/src/lib/satellite-onboarding-storage.ts` (localStorage helper SSoT, SSR + quota fallback) + `apps/web/src/components/ui/satellite-zoom-tooltip.tsx` (UI 컴포넌트, satellite-parent 일반화 `__isSatelliteParentBody`). **변경**: `apps/web/src/components/layout/app-shell.tsx` 1줄 마운트 (`<SatelliteZoomTooltip />`). 박제값 보존 — `resolveFocusMultiplier` SSoT (focus-multiplier.ts) / camera-controller / r-phase-allowlist / earthScale / moonScale 모두 무수정. **단위 테스트**: 30 cases 추가 (`satellite-onboarding-storage.test.ts` 8 + `satellite-zoom-tooltip.test.tsx` 22 — Q5 일반화 7 / D1 4 / D2 3 / D3 3 / D4 2 / D6 3 / D8 2 / a11y 2). 비-범위: 다국어 i18n (ko-only 박제 보존) / 다른 onboarding tooltip 일반 framework (info 패널 / shortcut bar 등) / camera-controller / focus-multiplier 정책 변경 / earthScale / moonScale 재변경 / ADR 신규 박제 (architect cross-validate skip 결정 정합).
- **[#539] R4 Amendment 4 — moonScale 800 → 200 (사실 비율 vs 사용자 시각 인지 mismatch 해결)** ([#539](https://github.com/coseo12/astro-simulator/issues/539)) — Amendment 3 fix PR #545 QA PASS + 사용자 D-T2 시각 확인에서 회귀 2건 발견: (1) moon 크기 비정상적으로 큼 (default sun 시점), (2) 특정 카메라 각도에서 moon 사라짐. debug 스크립트 6 각도 sweep 실측: moon screen radius 5.5 px (high mesh, isVisible=false) / earth screen radius 20.4 px / earth-moon distance 28 px @ default. **결정적 발견**: 사실 비율 (moon = earth 27.2%) 정합이 사용자 천문 직관 (moon = sub-pixel) 과 mismatch — PM / architect / cross-validate Gemini / developer / QA 5 단계 모두 합의 후 D-T2 만 발견. `apps/web/src/constants/body-scale.ts` `moon: 800 → 200`. moon mesh radius 1.39e9 m → **3.475e8 m** (earth 의 27.2% → **6.8%**) / moon sun 대비 px 비 4.47% → **1.12%** (Amendment 1 임계 5% 안전) / earth-moon visual distance / moon mesh radius **8.3배 → 33배** (사용자 인지 자연화). **사실 비율 깨짐 — 사용자 천문 직관 우선** (R3 ADR Amendment 2026-05-03 라운드 3 "사실 비율 강화" 원칙과 직교). orbit visual scale=30 / earthScale=800 / Amendment 1 임계 (17% / 5%) 보존. moon focus marginal (D3.1 85 px → ~21 px) 인정. 사라짐 회귀는 LOD billboard sub-pixel + beta 극단 culling 추정 — 본 amendment 범위 밖 (R5+ 또는 별도 후속 이슈로 분리). 단위 테스트 `body-scale.test.ts` moon 단언 200 갱신 (2 cases).
- **[#539] R4 Amendment 3 — moon focus LOD × visual scale 결합 결함 해결 + measurement-only DoD 함정 회피** ([#539](https://github.com/coseo12/astro-simulator/issues/539)) — Amendment 2 fix PR #542 QA 차단 (D2.4 시각 회귀) 후속. 진단: visual scale=30 + moonScale=800 결합으로 moon high variant wsRadius (≈ 60426) 가 매우 커, 기존 focus 진입 식 `cameraRadius = meshRadius × FOCUS_USER_RADIUS_MULTIPLIER (=5)` 가 moon mesh 표면 안쪽 0.01 단위에 박힘 (`cameraRadius/moonScaling ≈ 1.011`). screenCoverage ≈ 0 → LOD `low` 판정 → moon high variant `isVisible=false` 토글 → moon-lod-low 1 px billboard 만 가시 ("화면 중앙에 안 보임"). wheel zoom-in 30회로도 LOD high 전환 미발동. ADR `20260520-r4-earth-moon-visualization.md` §Amendment 3 forensic 5/5 박제 + 옵션 (a)~(e) 5축 비교 → **옵션 (a) cameraRadius 자동 조정 + 식 후보 2 (satellite 일괄 정책)** 선택. **Fix**: 신규 SSoT `packages/core/src/scene/focus-multiplier.ts` 박제 (`FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE = 20` + `resolveFocusMultiplier(parentId)` helper, R5+ phobos/io/europa/titan 자동 수용). `packages/core/src/scene/solar-system-scene.ts` handles 에 `getBodyParentId(id)` SSoT lookup 추가. `apps/web/src/components/sim-canvas.tsx syncFocusToScene` 식 후보 2 적용 — body parentId lookup → `resolveFocusMultiplier` → `desiredRadius = max(meshRadius × {20 if satellite else 5}, meshRadius + padding)` → `controller.focusOn({ mesh, radius: desiredRadius })` 명시적 전달 (camera-controller default 식 우회). **LOD 시스템 / visual scale=30 / 박제값 (earthScale/moonScale=800 / Amendment 1 임계 17/5) 무수정**. **D-T2 실측 (LOD-aware measurement, 1280×720)**: D3.1 moon focus mesh 화면 중앙 ≥ 200 px (`isVisible=true` 검증 후 측정) / D3.2 moon high variant `isVisible=true` + moon-lod-low `isVisible=false` / D3.3 cameraRadius/moonScaling > 1.5 (≈ 4.04 식 예측, +2.54 margin) / D3.4 Amendment 2 D2.1/D2.2/D2.3 무회귀 / D3.5 Amendment 1 임계 보존 (earth ≤ 17 / moon ≤ 5) / D3.6 R-Phase Allowlist 보존. **메타 결정**: LOD-aware measurement 패턴 SSoT 정의 (`mesh.isVisible` 검증 후 wsRadius × projection 측정) — R5+ R-Phase ADR Concrete Prediction §수치 DoD 의무 인용. PR #542 Amendment 2 fix (orbit visual scale=30 도입 + satellite resolveWorld 분기 + orbit line scaling) 도 본 PR 에 통합 (#542 close, 본 PR 이 SSoT 통합). 단위 테스트 `focus-multiplier.test.ts` 신규 (10 cases, satellite 분기 정책 + D3.3 식 검증). 핵심 코드 변경 ~10 라인 (ADR §Concrete Prediction §예측 1 박제값 5~7 라인 정합 + Amendment 2 통합 분).
- **[#539] R4 Amendment 2 — moon visual fusion 해결: earth-moon orbit visual scale=30 도입 (rendering 시점, 실측 데이터 SSoT 보존)** ([#539](https://github.com/coseo12/astro-simulator/issues/539)) — R4 머지 (PR #537, commit 9b4ba37) 직후 사용자 D-T2 시각 회귀 발견: (1) earth focus zoom-in 해도 달 가시화 안 됨, (2) moon shortcut/URL focus 시 달이 존재하지 않음. 메인 오케스트레이터 debug 스크립트 (volt #67 패턴, `scripts/_debug-moon-visibility-tmp.mjs`, 실행 직후 `rm`) forensic 실측: moon mesh radius (1.39e9 m) > earth-moon distance (3.847e8 m) **3.6배** + earth mesh radius **13.26배** → mesh 가 earth-moon 거리 흡수 → 시각적 fusion. ADR `20260520-r4-earth-moon-visualization.md` §Amendment 2 forensic 변형 승격 (5/5 조건 충족) + 옵션 비교 5축 (i)~(v) → **옵션 (iii-amended) earth-moon orbit visual scale 도입** 선택. **Fix**: 신규 SSoT `packages/core/src/scene/orbit-visual-scale.ts` 박제 (`EARTH_MOON_ORBIT_VISUAL_SCALE = 30` + `ORBIT_VISUAL_SCALE_BY_PARENT` lookup + `getOrbitVisualScale(parentId)` helper, R5+ satellite SSoT 패턴 일반화). `packages/core/src/scene/solar-system-scene.ts` `resolveWorld` 분기에서 `world = parent + (local × visual_scale)` 적용 (parentId 가 sun 이 아닌 satellite 한정). moon orbit LineSystem 도 `scaling.set(30, 30, 30)` 적용 (시각 정합 — orbit line 도 ×30 expansion). **데이터 SSoT 보존**: `solar-system.json` moon orbit semiMajorAxisAU 무수정 (실측 3.847e8 m). **박제값 보존**: earthScale=800 / moonScale=800 / R4 D8 임계 (earth ≤ 17% / moon ≤ 5%) / R-Phase Allowlist 5 body. **D-T2 실측** (1280×720): D2.1 moon pxDiameter sun 시점 6.30 px (≥ 4 px PASS, +2.30 margin) / D2.2 earth-moon pxDist 28.05 px (분리 임계 30 px marginal -1.95, disc 간 빈 공간 13.2 px 확보) / D2.3 earth focus zoom-in moon pxDiameter 49.19 px (≥ 50 px marginal -0.81) / D2.4 moon focus moon pxDiameter 196.65 px (≥ 200 px marginal -3.35). 분리 마진 1.86배 (≥ 1.5x 임계 통과, ADR 예측 1.78배 보다 양호). D2.5 r1-guard 회귀 0 (earth 16.40% / moon 4.42%) / D2.6 R-Phase Allowlist 회귀 0. **fallback 트리거 (ADR §재검토 #7)**: D-T2 사용자 보고 시 visual_scale 30 → 50 → 75 단계 상향, 75 미통과 시 Amendment 3 (옵션 v parent-relative frame). 단위 테스트 `orbit-visual-scale.test.ts` 신규 (8 cases, SSoT 회귀 가드 + 분리 마진 1.78배 자동 검증). 코드 변경 합계 **8 라인** (ADR §Concrete Prediction 예측 1 박제값 7~8 라인 정합)
- **[#532] R4 D8 임계 amendment — earth ≤ 17% / moon ≤ 5.0% (perspective 보정 안정화)** ([#532](https://github.com/coseo12/astro-simulator/issues/532)) — Developer 단계 실측 검증에서 D8 earth ≤ 15% 임계 FAIL (16.40% 측정, ADR 식 예측 14.67% 대비 +11.8% 편차). 측정 방법 검증 (CLAUDE.md §"수치 DoD 미달 시 측정 방법 검증 우선" 가드 #10) 결과 r1-guard `boundingSphere.radiusWorld` 기반 측정 자체는 정확하나, ADR §결정 1 산출식 `(r_body × scale) / (r_sun × sunScale)` 이 **wsRadius 비** 만 계산 → perspective projection 의 카메라 거리 foreshortening 누락 확인. 검증 신호: mercury (−3.9%) / venus (−2.5%) 가 식 예측보다 작고 **earth (+11.8%) / moon (+12.0%) 만 식 예측보다 큼** — 식 결함 일관 패턴. earthScale=800 / moonScale=800 architect 박제값은 보존, 임계만 완화: `PX_RATIO_THRESHOLDS.earth: 15 → 17` (margin 0.6%) / `moon: 4.5 → 5.0` (margin 0.53%). ADR `20260520-r4-earth-moon-visualization.md` §Amendment 1 (2026-05-21) 박제 + §결정 3 결정값 갱신.
- **[#532] R4 진입 — earth + moon 시각화 + Q2=B 비례 결정 정책 SSoT 첫 본 인스턴스화** ([#532](https://github.com/coseo12/astro-simulator/issues/532)) — Roadmap v3 §R4 진입. R-Phase Allowlist 갱신 (`packages/core/src/scene/r-phase-allowlist.ts`) — `earth`, `moon` 추가 활성 (sun/mercury/venus/earth/moon 5개), jupiter/neptune disabled 유지. **earthScale=800 / moonScale=800 박제** (`apps/web/src/constants/body-scale.ts`) — venus 동일값으로 사실 비율 정합 (earth radius 1.054배 / moon-earth 27.2%). **Q2=B sun 대비 px 비 임계 박제** (Q2=B SSoT 첫 본 인스턴스화) — earth ≤ 15% (예측 14.67% margin 0.33%) / moon ≤ 4.5% (예측 3.99% margin 0.51%). **shortcut bar 7개 확장** (`apps/web/src/components/layout/focus-quick-buttons.tsx`) — sun / mercury / venus / earth / **moon** / jupiter / neptune (parent-satellite 자연 그룹) + Tailwind 토큰 `text-caption px-2 py-1` → `text-mini px-1 py-0.5` 축소 (모바일 375px viewport 수용). **달 궤도 라인** (`packages/core/src/scene/solar-system-scene.ts`) — moon orbit 을 별도 LineSystem (`moon-orbit-line`) 으로 분리, earth 실시간 위치 추종 (`moonOrbitLine.position` 매 프레임 동기) + earth focus 진입 시 색상 강조 (default Color3(0.25, 0.28, 0.4) → focus Color3(0.65, 0.7, 0.85), 명도 ~2.6배). **회귀 가드 갱신** — `apps/web/scripts/r1-ui-regression-guard.mjs` `PX_RATIO_THRESHOLDS` 에 `earth: 15` + `moon: 4.5` 추가 (5 body 측정 + 모바일 누적 disk area ≤ 25% 가드) + `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` expected list 갱신 (4-A 차단 jupiter/neptune / 4-B 정상 sun/mercury/venus/earth/moon). **ADR**: [`docs/decisions/20260520-r4-earth-moon-visualization.md`](docs/decisions/20260520-r4-earth-moon-visualization.md) Accepted (cross-validate 2026-05-20). **후속 이슈 분리** (Gemini cross-validate 고유 발견 3건 비-범위): #534 earth focus zoom-in tooltip / #535 WCAG AA 자동 측정 가드 / #536 저사양 모바일 FPS 회귀 가드. R-Phase Allowlist 4곳 동시 박제 절차 준수 (ADR `20260504-r-phase-allowlist-guard.md` §결정 4)

## [0.17.0] — 2026-05-20

> **focus 라이프사이클 + 계측 인프라 (2026-05-19~20)** — `clearFocus` tier/origin 복원 + camera-controller follow observer + 자유시점(free-fly) 진입 메커니즘 신설 + Option D 가드 부수 비용 측정 + tier transition 입력 시도 계측 + forensic ADR 템플릿 박제. 7 PR 누적: PR [#511](https://github.com/coseo12/astro-simulator/pull/511) (#510 reset 회귀), [#512](https://github.com/coseo12/astro-simulator/pull/512) (#507 venus focus 추적), [#513](https://github.com/coseo12/astro-simulator/pull/513) (#509 free-fly UX), [#515](https://github.com/coseo12/astro-simulator/pull/515) (R1 baseline Linux 재캡처), [#514](https://github.com/coseo12/astro-simulator/pull/514) (#448 perf 측정), [#516](https://github.com/coseo12/astro-simulator/pull/516) (#444 입력 계측), [#517](https://github.com/coseo12/astro-simulator/pull/517) (#381 forensic 템플릿).

### Behavior Changes

- **#510 reset 버튼 회귀 차단 — `clearFocus` 에 tier/origin 복원 동반 (#511)** ([#510](https://github.com/coseo12/astro-simulator/issues/510)) — `packages/core/src/scene/solar-system-scene.ts:751 clearFocus()` 가 `focusBodyIdForAssert = null` 한 줄만 실행하여 tier (focus 시 sub-tier) + origin (focus body 위치) 가 잔존. `controller.reset(35)` Animation 시작 시 매 프레임 `updateTierByCamera` 가 잘못된 tier 판정 → `setTier` 트리거 → `tier-transition.ts:288-296` 의 stopAnimation 이 `cam-reset-radius/target` 까지 stop + `computeTargetRadius(35, oldScale, newScale)` 로 radius 폭증 (forensic 실측: 35 → 688,901 ≈ ×19,683). **Fix**: `clearFocus()` 에 `setTier(defaultInitialTier())` 한 줄 추가 — setTier 내부에서 `computeFloatingOriginForTier(tier, null, ...)` 가 origin 도 복원 (T1/T2 진입 → `[0, 0, 0]` SSoT). 실측: venus → reset radius 35.00 ✅ / mercury 35.00 ✅ / sun 463.92 (sun mesh 크기 반영, 시각 정상). H6 신규 가설 (H1 detachControl / H2 alpha-beta / H3 lowerRadiusLimit / H4 floatingOrigin 4 가설 전부 기각/부분 후 신규 발견)
- **#507 venus focus 추적 회귀 — camera-controller follow observer 도입 (#512)** ([#507](https://github.com/coseo12/astro-simulator/issues/507)) — `packages/core/src/scene/camera-controller.ts` 에 `#followObserver` 도입. `focusOn` Animation `onAnimationEnd` 콜백에서 attach (race 회피) + `reset` / 새 `focusOn` / `dispose` 시 detach. `mesh.isDisposed()` 가드. forensic: mercury 'body' tier → primary follow 발화 / venus 'inner' tier → primary follow skip (tier-conditional 정책). scene 측 tier 정책 (T1/T2 origin reset) 보존, camera 측 책임으로 follow 추가 (옵션 A 채택, 옵션 B T1/T2 primary follow 확장 대비 listener overhead 0). 실측: venus diff 24 → **0.039** (4cm) / mercury 0.067 회귀 가드 / sun 0.000 정확
- **#509 자유시점(free-fly) 진입 메커니즘 신설 (#513)** ([#509](https://github.com/coseo12/astro-simulator/issues/509)) — focus 상태에서 카메라 시점(alpha/beta/radius/target/tier) 을 그대로 유지하면서 focus tracking 만 해제하는 자유시점 UX 추가. **신규 API**: `solar.detachFocus()` (clearFocus 와 분리, tier/origin 보존) + `controller.clearFollow()` (#509 follow observer 외부 detach) + `sendCommand({type: 'enterFreeFly'})` + `CoreEvents.freeFlyEntered`. **Store**: `freeFlyMode: boolean` + `enterFreeFly()` action (selectedBodyId=null + freeFlyMode=true 동시 set). **UI**: shortcut bar "탐색" 버튼 (focus 없을 때 disabled) + Esc 단축키 (input/contenteditable 보호). **subscribe 분기**: `selectedBodyId=null && freeFlyMode=true` → detachToFreeFly() (clearFocus + reset 대신 detachFocus + clearFollow). 실측: free-fly 진입 후 3초 freeze dΔ=0.0000 (alpha/beta/radius/target 모두 변화 0), wheel zoom 정상, venus 재진입 diff 0.0384
- **#444 tier transition 입력 시도 계측 — G8b 격상 결정 데이터 (#516)** ([#444](https://github.com/coseo12/astro-simulator/issues/444)) — `tier-transition.ts:runTierTransition` 진입 시 document level wheel/touchstart 핸들러 등록 (capture phase + passive). transition 윈도우 (detachControl ~ cleanup) 내 발생한 입력 시도 횟수를 누적 후 cleanup 시점에 호출자 콜백 (`onInputAttempts`) 으로 1회 전달 (count > 0 일 때만). **신규**: `TierTransitionOptions.onInputAttempts?: (count: number) => void` / `SolarSystemSceneOptions.onTierTransitionInputAttempts` / `SimulationCore.metrics = { tierTransitionInputDrops: 0 }`. **DevTools 접근**: `window.__simCore.metrics.tierTransitionInputDrops`. 실측: false positive 0 (transition 외부 wheel 카운트 안 됨), transition 윈도우 wheel dispatch × 10 → drops 8 정상 카운트
- **#381 forensic ADR + Amendment 패턴 템플릿화 (#517)** ([#381](https://github.com/coseo12/astro-simulator/issues/381)) — `docs/templates/forensic-adr-template.md` 신규 박제 (260 라인, 8 섹션 placeholder + 모범 사례 링크). **8 섹션**: 배경 / 영향 모듈 / 옵션 비교 5±2 / Concrete Prediction / 결정 / 위험·재검토 / Amendment 라운드 N / 후속·분리 이슈. **CLAUDE.md `### 아키텍처 결정 기록 (ADR)`** 에 forensic 변형 발동 조건 5종 추가 — 3개 이상 충족 시 forensic 사용 (가설 N≥2 / runtime 측정 필수 / DoD PASS 인데 회귀 / 5±2 옵션 / Amendment 예상). 판정 애매 시 일반 ADR 시작 → Amendment 1회 필요 시점에 승격 + 양방향 cross-link. **`.claude/agents/architect.md`** 에 호출 절차 5단계 (일반 ADR 시도 → 부족 인식 → 템플릿 복사 → 8섹션 채움 → `_debug-*-tmp.mjs` 실측 직후 `rm`). 모범 사례 3건: `20260430-r3-followup-body-proportion.md` (#373), `20260509-380-zoom-camera-freeze-forensic.md` (#380), `20260504-411-r1-guard-shortcut-bar-forensic.md` (#411)

### Notes (행동 변경 없음 — 측정·인프라·문서)

- **#448 Option D + G8a 가드 부수 비용 측정 (#514)** — `scripts/bench-tier-guard-cost.mjs` 신규 (Playwright + CDP `Emulation.setCPUThrottlingRate` rate=4). 4 시나리오 (idle / focus / post-zoom / post-reset) 측정. 실측: 모든 시나리오 fps ≥ 55 / p95 ≤ 20ms (임계 24/60 의 2~3배 여유). 가드 발화 vs idle: 66 → 55 (~17% fps 감소). Gemini F5 권고 (ADR `20260509-380-zoom-camera-freeze-forensic.md` Amendment 2026-05-11 F5) 검증 완료. `pnpm bench:tier-guard-cost` 재실행 가능 (env: `BENCH_CPU_SLOWDOWN`, `BENCH_FPS_THRESHOLD`, `BENCH_P95_FRAME_MS`)
- **R1 baseline Linux CI 캡처 갱신 (#515)** — `apps/web/scripts/__baselines__/r1/` 12장 (4 영역 × 3 viewport) 을 develop tip (#509 "탐색" 버튼 추가 반영) 기준으로 재캡처. workflow_dispatch (`r1:baseline-bootstrap` workflow) 자동 PR. shortcut-bar 216 → 244 (mobile 139 → 156). 학습: `gh workflow run` default ref = main (volt #45 함정 변형) — `--ref develop` 명시 필수

### 학습 (메모리 박제)

- **`gh workflow run` default ref = main** — workflow_dispatch 의 ref 미명시 시 main 에서 실행됨. develop 기준 워크플로 (예: r1:baseline-bootstrap) 는 `--ref develop` 명시 필수. volt #45 workflow_dispatch 2단계 함정의 변형
- **PR base update 로 새 baseline 자동 반영** — develop 의 baseline 갱신 후 다른 PR 의 R1 가드는 자동 재실행 안 됨. `gh pr update-branch <PR>` 로 base merge 후 CI trigger 필요
- **`Closes: #N` 콜론 문법 auto-close 미발동** — 본 세션 6 이슈 (#510, #507, #509, #448, #444, #381) 모두 수동 close. PR 본문에 `Closes #N` (콜론 없음) 또는 별도 줄에 박제 권장

## [0.16.0] — 2026-05-17

> **R3 사이클 + 메타 안정화 (2026-05-17)** — Roadmap v3 R3 (금성) 가시성 진입 + R-Phase defense-in-depth 가드 시리즈 박제 (#402/#403/#404/#411/#412/#415) + 회귀 fix (#378/#380/#385/#391/#408/#419/#440) + 메타 인프라 안정화 (cross-validate plan-mode 우회 가드 #479 / create-pr Strict Assertion #471 / 5 페르소나 create-pr SSoT #477 / PR 템플릿 ADR 호환성 #455 / 메타 7체크박스 #470 / DoD 측정 방법 #469) + ADR Z 패턴 health metric 자동 탐지 (#483 Amendment 3). 57 커밋 누적. PR [#486](https://github.com/coseo12/astro-simulator/pull/486) (#476 Amendment 1 Phase 2 N=3 OR 30일 트리거) + [#489](https://github.com/coseo12/astro-simulator/pull/489) (#487 Amendment 2 N=10 OR 90일 완화 옵션 C) + [#490](https://github.com/coseo12/astro-simulator/pull/490) (#483 자동 탐지 + Amendment 3) + hotfix 2회 ([#491](https://github.com/coseo12/astro-simulator/pull/491) YAML 'on:' → "on": quote / [#492](https://github.com/coseo12/astro-simulator/pull/492) workflow rename `-v2.yml`).

### Behavior Changes

- **#380 줌 freeze + jitter 회귀 fix — Option D+G8a 4 가드 직교 적용 (defense-in-depth Top 4) (#380)** ([#380](https://github.com/coseo12/astro-simulator/issues/380)) — ADR [`docs/decisions/20260509-380-zoom-camera-freeze-forensic.md`](docs/decisions/20260509-380-zoom-camera-freeze-forensic.md) §결정 §Amendment 2026-05-11 §G8a SSoT. 4 가드 직교 박제 — **가드 A** (`packages/core/src/scene/tier-transition.ts:computeLowerRadiusLimit` 신규 헬퍼 + `runTierTransition` 의 lowerRadiusLimit 한 방향 완화 → 양방향 동기화 교체) — tier 별 적정 lowerRadiusLimit (`targetRadius * 0.01`) 으로 매 진입 시점 동기화. T3 body default `lowerRadiusLimit = 0.5` (≈ 20km) 가 mesh 표면 줌인 wall 형성 + 누적 drift 차단 (G1 fix). **가드 B** (#408 F2 fix 의 `tierTransitionInProgress` 플래그 검증 박제) — 단위 테스트로 in-flight lock 라이프사이클 단언 (lock 진입 → 재진입 차단 → cleanup 후 재진입 가능) + detachControl 호출 횟수 1회 고정 검증 (ADR Concrete Prediction 2). **가드 C** (`solar-system-scene.ts:updateAt` 의 `setOriginToBody` 호출을 mesh.position 갱신 루프 *후*로 이동) — frame 내 mesh.position 과 origin 이 같은 reference frame 으로 정합 → cam.globalPosition 일관 → tier 재판정 race 차단 (G3 fix). **가드 G8a** (`solar-system-scene.ts:setTier` 진입 시 즉시 `scene.detachControl()` 호출 + `runTierTransition` 진입 시 동일 호출 idempotent 흡수) — 카메라 입력 잠금을 transition 결정 _직후_ 즉시 발동 → 사용자 wheel/pinch race 윈도우 0 ms 로 축소. tier transition tween 시작 전 race 분기 제거 → 사용자 D-T2 양상 (jitter at tier transition) 직접 차단 (G8 fix). **회귀 가드** (`apps/web/scripts/browser-verify-380-zoom.mjs` 신규 + `verify:380-zoom` package script): 4 시나리오 매트릭스 — S1 T3 진입 후 줌인 5회 (가드 A wall 차단), S2 tier 전환 시점 빠른 휠 5회 (가드 G8a race window 0, ADR Prediction 6), S3 빠른 휠 회전 5회 (가드 B oscillate 차단, ADR Prediction 2), S4 T3 + focus + 자유 줌 (가드 C freeze 차단, ADR Prediction 4). **단위 테스트**: `tier-transition.test.ts` 에 4 그룹 16 cases 추가 — `computeLowerRadiusLimit` 5 cases (정상 / floor / T1 / T3 / 회귀 가드) + G8a detachControl 진입 시점 3 cases (호출 순서 / idempotent / 회귀 가드) + 가드 B in-flight lock 4 cases (lock=true / cleanup 후 재진입 / detachControl 1회 고정 / 회귀 가드) + 가드 C primary follow 4 cases (T3+focus 정상 순서 / T1 skip / focus 없음 skip / 회귀 가드). 562 → 578 PASS. **사용자 D-T2** (2026-05-11) 양상 보고 — jitter at tier transition + 줌인/줌아웃 둘 다 — Option D+G8a 4 가드 직교로 두 인지 (jitter + freeze) 동시 해결. defense-in-depth 시리즈 #402 (Top 1) / #403 (Top 2) / #404 (Top 3) 와 직교 — 본 결정은 카메라 race 4 분기 직교 매트릭스 박제 (Top 4). cross-validate Gemini 호출 architect 단계 박제 완료 (Option D+G8a 4 가드 사양 합의, F7 주석 보강 만 현 PR 반영, F1~F6 후속 이슈 #444~#449 분리). **F7 주석 보강 반영** (Gemini 고유 발견 §범위 내) — `runTierTransition` 진입 시 카메라 제어권 명시 주석 추가 (releaseControl 1회 발동 보장 + 호출자 idempotent 흡수)
- **`SimCommandProvider` mount 순서 정합화 — `useSimCommand` race condition 본질 해결 (#419)** ([#419](https://github.com/coseo12/astro-simulator/issues/419)) — `apps/web/src/core/sim-context.tsx` 의 `SimCommandProvider` 가 `core === null` 시 children 렌더 보류 (`if (core === null) return null;` early return, A1-E 후보). sim-canvas 의 비동기 core 인스턴스 생성 (`useEffect → setCore`) 이 완료된 후에만 children (UrlSync + SidePanels + InfoPanel 등) 의 useEffect 가 발화 → `sendCommand` 가 항상 non-null core 호출 보장 → race condition 구조적 차단. children mount 지연 < 100ms (core 생성 시간, browser-verify 1초 timeout PASS 유지로 검증). 기존 useSimCommand 호출자 7곳 (focus-quick-buttons / mode-switcher / time-controls / scale-control / date-time-picker / celestial-tree / scenario-presets) 모두 사용자 클릭 핸들러 안 호출이라 영향 0. ADR [`docs/decisions/20260510-419-sim-canvas-mount-race.md`](docs/decisions/20260510-419-sim-canvas-mount-race.md) §결정 1 (A1-E early return). 부모 ADR `20260504-415-url-sync-guard.md` §재검토 조건 1 충족 — §Amendment (2026-05-10) 박제 (PR #436)
- **`apps/web/src/core/url-sync.tsx` `?focus=` 가드 분기에서 `setSelectedBody(urlFocus)` race fallback 제거 (#419)** ([#419](https://github.com/coseo12/astro-simulator/issues/419)) — `sendCommand({type:'focusOn', bodyId})` 단독으로 `selectedBodyId` sync (event 단일 진실원 R1 #334+#335 ADR `20260425-r1-store-scene-sync-unification.md` §결정 3 정신 회복). race 부재 보장 (mount 순서 정합화로). `setSelectedBody` 변수 선언도 제거 (lint warning 차단). R-Phase allowlist 가드 분기 (#415, `isRPhaseFocusable`) 자체 로직 변경 0 — store mutation 부수 효과 SSoT 사용만 폐기. **회귀 가드**: `?focus=sun` / `?focus=mercury` / `?focus=venus` 진입 시 `selectedBodyId` 정상 sync (R1 #329 / R2 #361 / R3 #369 회귀 보호) — `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 4-B PASS 유지로 검증
- **`apps/web/src/core/sim-context.test.tsx` 신규 — SimCommandProvider mount 순서 단위 테스트 0 → 2 (#419)** ([#419](https://github.com/coseo12/astro-simulator/issues/419)) — 매트릭스: `core={null}` props 시 children 미렌더 단언 (race condition 구조적 차단) + `core={mockCore}` props 시 children 등장 + useSimCommand 가 mock.command 호출 (정상 동작 회귀 보호). ADR §결정 3-1 박제 사양 일관. 2/2 PASS
- **`apps/web/src/core/url-sync.test.tsx` 갱신 — race fallback 부재 검증 (#419)** ([#419](https://github.com/coseo12/astro-simulator/issues/419)) — 기존 8 케이스 보존 + 케이스 1~3 (sun/mercury/venus) 의 `selectedBodyId` 단언을 `sendCommand` 호출 단언으로 격상 (mock 환경에서 setSelectedBody 직접 호출 경로 부재; e2e 검증은 browser-verify 시나리오 4-B 담당). 신규 케이스 9 추가 — `?focus=sun` 진입 시 `vi.spyOn(useSimStore.getState(), 'setSelectedBody')` 호출 0회 단언 (DoD-4 race fallback 부재 검증, event 단일 진실원). 9/9 PASS (전체 url-sync.test.tsx 9 cases / 209 web tests / 565 모노레포 tests 모두 PASS)
- **ScenarioPresets R-Phase UI 가드 추가 — defense-in-depth UI 측 3번째 축 (#404)** ([#404](https://github.com/coseo12/astro-simulator/issues/404)) — `apps/web/src/components/panels/scenario-presets.tsx` 에 `isPresetEnabled` 일반화 함수 박제 (`Object.keys(preset.massMultipliers).every((id) => isRPhaseFocusable(id))`) — preset 의 모든 mass multiplier target body 가 `R_PHASE_BODY_ALLOWLIST` 에 박제되어야 enabled. R-Phase 미진입 preset (R3 시점 기준 `jupiter-x10` / `no-jupiter`, jupiter R6 미구현) 이 `disabled` + `aria-disabled="true"` + `data-r-phase-disabled="true"` + `title="R-Phase 진행 시 활성"` + `opacity-50 cursor-not-allowed` 으로 시각/접근성 동시 차별화 (a11y 4축 박제, #402/#403 시리즈 패턴 일관). **sun-half preset 은 활성 유지** — sun = R1 박제 완료 (`R_PHASE_BODY_ALLOWLIST` 에 `'sun'`), mass multiplier (sun × 0.5) 영향이 R1 영역 한정 → R-Phase incremental policy 정합성 (architect ADR §결정 1). PRESETS 배열 자체 변경 0 (PM 박제 §비-범위 4번 보존). ADR [`docs/decisions/20260508-404-scenario-presets-r-phase-guard.md`](docs/decisions/20260508-404-scenario-presets-r-phase-guard.md) §결정 1~4 (sun-half 활성 유지 / 매트릭스 SSoT (c) 둘 다 / a11y 4축 통일 / NO-OP 거부). **#403 ADR Amendment 2026-05-08 동시 박제** — 분기 매트릭스 N=5 → N=7 갱신 (#403 ADR §"Amendment 2026-05-08 — ScenarioPresets 분기 7 추가 (#404)" 섹션 신설, 단일 SSoT 유지). i18n 키 분기 신설 금지 — 한국어 하드코딩 (`/en` 라우팅 미지원 박제, ADR §명시적 비-범위). #402 (Top 1 focus-quick-buttons) + #403 (Top 2 CelestialTree + InfoPanel) + #415 (URL store mutation) 와 직교 — 본 결정은 ScenarioPresets preset 적용 → mass multiplier 변경 경로 (분기 7) 의 UI 측 1차 방어선 추가. R-Phase 진입 시 zero-touch (Concrete Prediction §재현 검증) — `R_PHASE_BODY_ALLOWLIST` 1줄 추가만으로 본 PR 가드 자동 갱신 (`isPresetEnabled` 일반화 추상화 데이터 의존). cross-validate Gemini 호출 architect 단계 박제 완료 (4축 결정 모두 합의, 4 개선 제안 모두 후속 분리)
- **`apps/web/src/components/panels/scenario-presets.test.tsx` 갱신 — ScenarioPresets R-Phase UI 가드 단위 테스트 3 → 15 (#404)** ([#404](https://github.com/coseo12/astro-simulator/issues/404)) — 매트릭스: 기존 3 cases (3개 프리셋 + 원복 버튼 렌더 / 원복 동작) 보존 + 12 신규 cases. sun-half (R1 박제) 활성 + jupiter-x10 (R6 미구현) disabled + no-jupiter (R6 미구현) disabled + a11y 4축 (disabled / aria-disabled='true' / data-r-phase-disabled='true' / title='R-Phase 진행 시 활성') 정합성 + sun-half tooltip 부재 (불필요 노이즈 차단) + 시각 차별화 (opacity-50 / cursor-not-allowed) + disabled preset 강제 click → apply 부작용 0 (HTML disabled 자체 차단) + sun-half click → setEngine(newton) + setMass(sun, 0.5) + sendCommand(J2000) 정상 동작 회귀 가드 + 원복 버튼 (scenario-reset) 항상 enabled (R-Phase 무관 회귀 0 검증). `vi.mock('@/core/sim-context')` + 실 `useSimStore` (`physicsEngine: 'kepler'` + `massMultipliers: { earth: 2 }` 초기 상태). 15/15 PASS 목표
- **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 6 추가 — ScenarioPresets UI 가드 (#404)** ([#404](https://github.com/coseo12/astro-simulator/issues/404)) — 기존 시나리오 1~5 (UI shortcut / smoke / 강제 click / URL 직접 진입 / CelestialTree+InfoPanel) 보존 + 시나리오 6 신규 3 cells: 6-A 정상 (sun-half preset 활성 — disabled 부재 / aria-disabled='false' / data-r-phase-disabled='false', click 시 physicsEngine='newton' + massMultipliers={sun:0.5} 정상 동작) + 6-B 차단 (jupiter-x10 disabled + a11y 4축 박제 + title='R-Phase 진행 시 활성', force click 시 physicsEngine/massMultipliers 변화 0) + 6-C 차단 (no-jupiter 동일). ScenarioPresets 는 `mode === 'research' || 'sandbox'` 에서만 렌더 → 시나리오 6 진입 시 `mode: 'research'` 전환 + framer-motion 애니메이션 (250ms) 완료 대기 (#403 학습). 3/3 cells PASS 목표
- **CelestialTree + InfoPanel R-Phase UI 가드 추가 — defense-in-depth UI 측 2번째 축 (#403)** ([#403](https://github.com/coseo12/astro-simulator/issues/403)) — `apps/web/src/components/panels/celestial-tree.tsx` + `apps/web/src/components/panels/celestial-info-panel.tsx` 두 곳에 R-Phase allowlist 가드 박제. **CelestialTree**: R-Phase 미진입 body (R3 시점 기준 earth / jupiter / neptune 등) tree 항목이 `disabled` + `aria-disabled="true"` + `data-r-phase-disabled="true"` + `title` (`"<body.nameKo> 은(는) R-Phase 미진입 — 후속 R-Phase 에서 활성화 예정입니다."`) + `opacity-50 cursor-not-allowed` 으로 시각/접근성 동시 차별화. **InfoPanel**: `selected && data && !isRPhaseFocusable(selected)` 분기를 정상 분기 _이전_ 추가 — `data-testid="info-panel-r-phase-blocked"` + body 이름 포함 R-Phase 안내 메시지. 외부 경로 (programmatic command 등) 로 selectedBody 가 R-Phase 외 body 로 set 된 경우의 잔존 정보 panel 노출 차단 (1차 방어선은 #402 UI / #415 url-sync, 본 분기는 잔존 가드). 사용자 D-T2 (#403 발화점, 2026-05-03) "CelestialTree R4+ body 클릭 + InfoPanel selectedBody 잔재" 회귀 직접 가드. ADR [`docs/decisions/20260506-403-r-phase-ui-guard.md`](docs/decisions/20260506-403-r-phase-ui-guard.md) §결정 1~4 (P10 KIND_LABEL 정리 분리 / InfoPanel 메시지 채택 / defense-in-depth 매트릭스 / NO-OP 거부). i18n 키 분기 신설 금지 — 한국어 하드코딩 (`/en` 라우팅 미지원 박제, ADR §명시적 비-범위 line 356). P10 `KIND_LABEL` (line 11~17) / `COLOR_SOURCE_LABEL` (line 20~24) 잔존 보존 (DoD-3 비-범위 분리, #405 통합 후보지). `R_PHASE_BODY_ALLOWLIST` SSoT 재사용 (named export wasm-safe, #402 §Amendment D1 패턴 일관). #402 부모 ADR §결정 2 (UI 가드, 1차 방어선 — focus-quick-buttons) + §결정 3 (scene 가드, 2차 방어선) + #415 (url-sync 가드, 3번째 방어선) 와 직교 — 본 결정은 분기 2 (CelestialTree) + 분기 3 (InfoPanel) 의 UI 측 1차 방어선 추가. R-Phase 진입 시 zero-touch (Concrete Prediction §re-verify) — `R_PHASE_BODY_ALLOWLIST` 1줄 추가만으로 본 PR 가드 자동 갱신
- **`apps/web/src/components/panels/celestial-tree.test.tsx` 신규 — CelestialTree R-Phase UI 가드 단위 테스트 0 → 12 (#403)** ([#403](https://github.com/coseo12/astro-simulator/issues/403)) — 매트릭스: R-Phase 박제 body (sun / mercury / venus) 활성 + R-Phase 외 body (earth / jupiter / neptune) disabled + aria-disabled + data-r-phase-disabled + tooltip (body 이름 + R-Phase 메시지) + opacity-50 + cursor-not-allowed + 강제 click 시 focusOn 발행 0 + 활성 click 시 정상 발행 + active 스타일 (selected + 활성 동시) 검증. `vi.mock('@/core/sim-context')` + 실 `useSimStore`. 12/12 PASS
- **`apps/web/src/components/panels/celestial-info-panel.test.tsx` 신규 — InfoPanel R-Phase 가드 단위 테스트 0 → 11 (#403)** ([#403](https://github.com/coseo12/astro-simulator/issues/403)) — 매트릭스: `selectedBodyId === null` info-panel-empty 폴백 (기존 분기 회귀 보호) + R-Phase 박제 body (sun / mercury / venus) info-panel 정상 분기 (R1/R2/R3 회귀 보호) + R-Phase 외 body (earth / jupiter / neptune) info-panel-r-phase-blocked 분기 + 차단 분기 body 이름 정확 박제 (지구/목성 구별) + R-Phase 메시지 박제 + 알 수 없는 body id (data 없음) info-panel-empty 폴백 (R-Phase 분기 미진입). 11/11 PASS
- **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 5 추가 — CelestialTree + InfoPanel UI 가드 (#403)** ([#403](https://github.com/coseo12/astro-simulator/issues/403)) — 기존 시나리오 1~4 (UI shortcut / smoke / 강제 click / URL 직접 진입) 보존 + 시나리오 5 신규 9 cells: 5-A 정상 CelestialTree (sun / mercury / venus tree 클릭 → selectedBodyId 정상 set + info-panel 정상 분기) + 5-B 차단 CelestialTree (earth / jupiter / neptune tree 항목 disabled + aria-disabled + data-r-phase-disabled + title 박제 + force click 시 store / camera 변화 0) + 5-C 차단 InfoPanel (외부 경로 시뮬레이션 — `window.__simStore.setState({selectedBodyId: <R-Phase 외 body>})` 직접 mutation 후 info-panel-r-phase-blocked 분기 렌더 + R-Phase 메시지 박제). CelestialTree / CelestialInfoPanel 은 `mode === 'research' || 'sandbox'` 에서만 렌더 → 시나리오 5 진입 시 `mode: 'research'` 전환 + framer-motion 애니메이션 (250ms) 완료 대기. 9/9 cells PASS
- **BODY_SCALE R-Phase 정책 ADR 박제 — Behavior Changes: None (정책 박제만, 코드/박제값 변경 0) (#412)** ([#412](https://github.com/coseo12/astro-simulator/issues/412)) — `docs/decisions/20260506-body-scale-r-phase-policy.md` 신규 박제. **본 ADR 은 코드 변경 0 / 박제값 변경 0** — 시각 활성 (BODY_SCALE 박제) vs focus 활성 (R-Phase allowlist #402) **2축 직교 정책 매트릭스** + **R-Phase 진입 의무 5곳 동시 박제 체크리스트** (BODY_SCALE / R_PHASE_BODY_ALLOWLIST / FOCUS_BODIES / R-Phase ADR / CHANGELOG) SSoT 박제. R4 (earth) / R6 (jupiter) / R10 (neptune) 진입 시 본 ADR §"R-Phase 진입 의무 체크리스트" 인용 의무. 사용자 D-T2 (PR #410, 2026-05-04) "행성 표기 비율 실제와 현재 차이" 질문 분석에서 mercury/venus 외 5+ body (earth/jupiter/neptune/mars/saturn/uranus) 가 BODY_SCALE 미박제 → `DEFAULT_BODY_SCALE = 1.0` 적용 → 사실 도달률 0.14% 점 수준 표시 발견 (#397 NO-OP mismatch 진짜 원인 박제). cross-validate (Gemini) 4축 검증 모두 합의 (§1 구조적 완성도 / §2 기술 결정 타당성 / §3 인터페이스 명확성 / §4 확장성 우수, §5 보안 문제 없음, §6 자동화 스크립트 후속 분리 가이드와 일치). 본 ADR §결정 4 — NO-OP 거부 + 정책 ADR 채택 (가치 > 비용). mars/saturn/uranus 의 R-Phase 정의는 별도 후속 이슈 분리 (현재 분면 IV 유지). 자동화 (`pnpm run r-phase:add` CLI) 는 §재검토 트리거 1번 발생 시 (또는 R6 진입 후) 후속 인프라 이슈 분리 가이드 박제
- **`verify:378-focus` 매트릭스 12 → 6 cells 축소 — R-Phase allowlist 동기화 (#424)** ([#424](https://github.com/coseo12/astro-simulator/issues/424)) — `apps/web/scripts/browser-verify-378-focus.mjs` 의 `FOCUS_BODIES = ['sun', 'mercury', 'venus', 'earth', 'jupiter', 'neptune']` (6 body × 2 모드 = 12 cells) → `['sun', 'mercury', 'venus']` (R-Phase R3 진입 완료 body 만, 3 body × 2 모드 = 6 cells). PR #414 (#402 라운드 2) 머지로 simulation-core focusOn 가드가 R-Phase 외 body 의 카메라 동기화를 차단 → 본 매트릭스의 earth/jupiter/neptune 6 cells 가 의도하지 않게 FAIL (DoD-1 frustum + DoD-3 target distance) 하던 잠복 회귀 해소. develop ci.yml 4 commit 잠복 (#414 → #417 → #421 → #422 → #423 빈 commit push 로 재발견, run 25332704505). #411 r1-guard forensic blind spot — r1-guard FAIL 만 추적했고 verify:378-focus 동일 PR #414 회귀 누락. **R-Phase 진입 시 갱신 의무**: R4 (earth) / R6 (jupiter) / R10 (neptune) 진입 시 `R_PHASE_BODY_ALLOWLIST` 와 본 매트릭스 동시 갱신 (파일 docstring + FOCUS_BODIES 주석 박제). 매트릭스 console.log 헤더는 동적 cell 개수로 변경 (`${FOCUS_BODIES.length * MODES.length} cells`). DoD-1~3 검증 로직 자체는 변경 0 (active body 검증 의도 보존)
- **url-sync `?focus=` 파라미터 R-Phase allowlist 가드 추가 — defense-in-depth 3번째 방어선 (store mutation 측면) (#415)** ([#415](https://github.com/coseo12/astro-simulator/issues/415)) — `apps/web/src/core/url-sync.tsx` 의 초기 1회 `?focus=<bodyId>` URL 처리에 `isRPhaseFocusable(urlFocus)` 가드 합류 (옵션 B). R-Phase 미진입 body (R3 시점 기준 earth / jupiter / neptune 등) URL 직접 진입 시 `sendCommand({type:'focusOn'})` + `setSelectedBody()` 둘 다 skip + dev `console.warn` 박제 (`R-Phase 미진입 body — 무시. R_PHASE_BODY_ALLOWLIST: sun, mercury, venus.`). PR #414 (#402 라운드 2) 의 **simulation-core focusOn handler** scene 가드 (2번째 방어선) 가 emit 차단해도 `setSelectedBody(urlFocus)` 직접 호출이 store mutation 을 우회하던 잠복 결함 (PR #414 reviewer 정적 리뷰 권고 3 식별) 해소. line 77+78 의 race condition fallback (sim-canvas mount 전 `useSimCommand` no-op timing gap 보호) 은 보존 — `useSimCommand` race 자체 해결은 후속 이슈 #419. `R_PHASE_BODY_ALLOWLIST` 상수도 `@astro-simulator/core` 에서 named import (#402 §Amendment D1 패턴 일관 — namespace 경유 금지). #402 부모 ADR §결정 2 (UI 가드, 1차 방어선) + §결정 3 (scene 가드, 2차 방어선) 와 직교 — 본 결정은 store mutation 측면 3번째 방어선. ADR [`docs/decisions/20260504-415-url-sync-guard.md`](docs/decisions/20260504-415-url-sync-guard.md) §결정 1 (옵션 B = D2)
- **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 시나리오 4 추가 — URL 직접 진입 매트릭스 (#415)** ([#415](https://github.com/coseo12/astro-simulator/issues/415)) — 기존 시나리오 1~3 (UI / smoke / 강제 click) 보존 + 시나리오 4 신규 7 cells: 4-A 차단 (`?focus=earth` / `?focus=jupiter` / `?focus=neptune` → `selectedBodyId === null`) + 4-B 정상 (`?focus=sun` / `?focus=mercury` / `?focus=venus` → `selectedBodyId === <body>`, R1 #329 / R2 #361 / R3 #369 회귀 보호) + 4-C 무효 (`?focus=invalid-body-id` → `selectedBodyId === null`, 기존 R1 가드 회귀 보호). 매 케이스 새 page context — `initialized.current` useRef 우회. 부모 ADR §결정 4 의 동시 박제 절차에 "외부 진입점 가드 의무" 1줄 cross-link 추가 (URL 파라미터 / deep link / programmatic command 진입점 신설 시 가드 통합 + 시나리오 4 매트릭스 갱신 의무)
- **`apps/web/src/core/url-sync.test.tsx` 신규 — url-sync 단위 테스트 0 → 8 (#415)** ([#415](https://github.com/coseo12/astro-simulator/issues/415)) — 매트릭스: `?focus=sun/mercury/venus` 정상 동작 (R1/R2/R3 회귀 보호) + `?focus=earth/jupiter/neptune` 가드 차단 + `?focus=invalid-body-id` 기존 가드 회귀 + `?focus=null` no-op. 모든 가드 분기에서 `vi.spyOn(console, 'warn')` 단언 의무 (cross-validate Gemini §5 권고 — 진단 기능 dev 작동 보장). nuqs `useQueryState` mock + `useSimCommand` mock + 실 `useSimStore` 사용 (`setSelectedBody` 호출 추적). 8/8 PASS (1.27s)
- **R-Phase Body Focus Allowlist 가드 도입 — defense-in-depth (UI + scene 양 측면) (#402)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — `packages/core/src/scene/r-phase-allowlist.ts` 신규 SSoT 박제 (`R_PHASE_BODY_ALLOWLIST = ['sun', 'mercury', 'venus']` + `isRPhaseFocusable(bodyId)` helper). UI 측면 (`apps/web/src/components/layout/focus-quick-buttons.tsx`): R-Phase 미박제 body (earth / jupiter / neptune) 버튼이 `disabled` + `aria-disabled="true"` + `data-r-phase-disabled="true"` + tooltip + opacity 50% + cursor-not-allowed 으로 시각/접근성 동시 차별화. scene 측면 (`packages/core/src/engine/simulation-core.ts` `case 'focusOn'`): UI 우회 (URL `?focus=earth` 직접 진입 / 외부 commander) 도 `isRPhaseFocusable` 검사 후 `bodySelected` event emit 차단 + console.warn (URL `?focus=earth` 직접 진입 시 R-Phase 미박제 body 잔재 0 보장). 사용자 D-T2 (#402 발화점, 2026-05-03) "earth/jupiter/neptune 클릭 시 잔재 보임" 회귀 직접 가드. ADR [`docs/decisions/20260504-r-phase-allowlist-guard.md`](docs/decisions/20260504-r-phase-allowlist-guard.md) §결정 1 (SSoT) + §결정 2 (UI 가드) + §결정 3 (scene emit 차단) + §결정 4 (5곳 동시 박제 절차 — R4 진입 시) + §Amendment 결정 D1 (sub-path export 폐기 + namespace re-export 강제, 라운드 2 turbopack `__dirname` SSR 회귀 fix)
- **R-Phase 진입 시 5곳 동시 박제 의무 박제 (#402 라운드 2)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — R4/R6/R10 진입 시 5곳 동시 갱신 의무 박제 (라운드 1 의 4곳에서 5번째 wasm-safe 검증 추가): (1) `r-phase-allowlist.ts` body id 추가, (2) 해당 R-Phase ADR §결정 N 에 본 ADR cross-link, (3) `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` expected list 갱신, (4) `CHANGELOG.md` `### Behavior Changes` 박제, (5) WASM 의존 도메인 (scene / physics / render / gpu) 한정 sub-path 추가 금지 검증 — `scripts/verify-core-exports-immutable.sh` 자동 차단. ADR §Amendment 결정 D2
- **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` 신설 — R-Phase Allowlist 회귀 가드 (#402)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — 3종 매트릭스: (1) 박제 body (sun/mercury/venus) 활성 + 미박제 body (earth/jupiter/neptune) `disabled` + `aria-disabled="true"` + `data-r-phase-disabled="true"` 단언, (2) 활성 버튼 click 시 `selectedBodyId === body` smoke, (3) 강제 click (Playwright `force: true` HTML disabled 우회) 시 store/camera 변화 0 (defense-in-depth scene 측면 검증). CLI: `pnpm --filter @astro-simulator/web verify:r-phase-allowlist`. **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `next dev -p 3004` 기동 후 검증 step 추가 (verify:378-focus / verify:focus-transition 패턴 일관)
- **`scripts/verify-core-exports-immutable.sh` 신설 — turbopack `__dirname` SSR 회귀 자동 가드 (#402 라운드 2)** ([#402](https://github.com/coseo12/astro-simulator/issues/402)) — `packages/core/package.json` exports field 에 WASM 의존 도메인 (scene / physics / render / gpu) sub-path 추가 시 exit 1. 라운드 1 (PR #407 closed `3eed4e0`) 회귀 메커니즘: wasm-pack `--target nodejs` 출력의 `${__dirname}/physics_wasm_bg.wasm` 가 turbopack module dep graph 변경 시 `/ROOT/...` 가상 path 로 ENOENT → SSR 500. 화이트리스트 (`. / ./coords / ./physics / ./scene / ./gpu / ./ephemeris`) 외 WASM 도메인 sub-path 추가 시 자동 차단. coords / ephemeris / time 등 순수 데이터 도메인은 자유 (Gemini cross-validate Q3 권고 — 스코프 좁힘). **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `bash scripts/verify-core-exports-immutable.sh` step 추가
- **focus 전환 시 tier oscillate 회귀 fix — F1+F2 defense-in-depth 적용 (#408)** ([#408](https://github.com/coseo12/astro-simulator/issues/408)) — `packages/core/src/scene/solar-system-scene.ts` 에 (F1) `applyFocusTier(bodyId, cameraDistMeters): Tier` 신규 scene API 박제. `sim-canvas.tsx syncFocusToScene` 헬퍼가 `setFocusOrigin` 직후 + `controller.focusOn` 직전에 호출 → focusOn 의 cam-target tween (300ms) 보간 시작 **전에** final tier 정착 → 보간 중 `updateTierByCamera` 가 동일 tier 반환으로 no-op (race 차단). (F2) `tierTransitionInProgress` closure 변수 + `runTierTransition` 의 `onComplete?: () => void` 콜백 박제 — `setTier` 진입 시 lock=true, cleanup 정상 종료 / fallback timer / visibilitychange 어느 경로로 발동해도 onComplete 가 1회만 호출되어 lock=false (idempotent, `released` 플래그 패턴). lock 활성 시 `updateTierByCamera` 가 no-op 으로 transition 진행 중 재판정 race 차단. 사용자 D-T2 (2026-05-04) frame-by-frame 측정 회귀 (venus → mercury 전환 시 inner→body→inner oscillate 2회, camR 38만 unit jump, target origin reset) 해소. ADR [`docs/decisions/20260504-focus-tier-oscillate-fix.md`](docs/decisions/20260504-focus-tier-oscillate-fix.md) §결정 1 (F1, 의존 역전 (c)) + §결정 2 (F2, lock + onComplete idempotent)
- **`FOCUS_USER_RADIUS_MULTIPLIER` / `FOCUS_USER_RADIUS_MIN_PADDING` 명명 상수 박제 (#408)** ([#408](https://github.com/coseo12/astro-simulator/issues/408)) — `packages/core/src/scene/camera-controller.ts` 의 `desiredRadius = max(meshRadius × 5, meshRadius + 0.01)` 식의 매직 넘버를 명명 상수로 추출 + scene namespace export. `sim-canvas.tsx` 의 `applyFocusTier` cameraDistMeters 산식이 동일 SSoT 1곳 import → camera-controller / sim-canvas 식 drift 차단. tier-transition.ts 의 `FOCUS_RADIUS_MULTIPLIER = 5.9` (V5 달성 정밀값) 와 분리 의도 박제 (user-trigger 경로 한정 ×5 vs tier 전환 경로 ×5.9). Gemini cross-validate 부분 수용 (ADR §결정 1 §매직 넘버 상수화 권고)
- **`apps/web/scripts/browser-verify-focus-transition.mjs` 신설 — focus 전환 회귀 가드 9 cells 매트릭스 (#408)** ([#408](https://github.com/coseo12/astro-simulator/issues/408)) — 3 from × 3 to (sun/mercury/venus, R-Phase v3 활성 body) = 9 cells. 각 cell 마다 from body 안정화 후 to body 클릭 simulation (`simCore.sendCommand({type:'focusOn', bodyId})`) → 1.5초 동안 16ms 간격 frame snapshot (tier / camera.target / camera.radius) 캡처. DoD 3종 단언: (1) tier 전환 횟수 ≤ 1 (oscillate 차단), (2) target origin reset (camTarget < 0.5 unit) 0 회 (sun 케이스 제외), (3) camR jump > 1000 unit 0 회. CLI: `pnpm --filter @astro-simulator/web verify:focus-transition`. **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `next dev -p 3003` 기동 후 검증 step 추가 (verify:378-focus 패턴 일관)
- **focus 시 허공 표시 회귀 fix — 옵션 D (A+B defense-in-depth) 적용 (#378)** ([#378](https://github.com/coseo12/astro-simulator/issues/378)) — `packages/core/src/scene/camera-controller.ts` `focusOn()` 에 (A) `desiredRadius < camera.lowerRadiusLimit` 일 때 `lowerRadiusLimit = max(camera.minZ, desiredRadius * 0.5)` 동적 완화 + `mesh.computeWorldMatrix(true)` 명시 호출. `packages/core/src/scene/tier-transition.ts:174` 직전에 (B) `focusMesh.computeWorldMatrix(true) + focusMesh.refreshBoundingInfo()` 추가. 두 옵션 모두 focus 트리거 한정 / 기존 동작 비-침습 (manual zoom 영향 0). venus 관찰 모드 D-T2 라운드 3 (2026-05-03) 보고 회귀 (T1 시점 desiredRadius=0.0104 < lowerRadiusLimit=0.5 clamp → tier 전환 후 mesh 외각 frustum 밖) 해소. 12 cells 매트릭스 (6 body × 2 모드) 실측 12/12 PASS — venus 관찰 / 연구 모두 `camera.isInFrustum(venusMesh) === true` + `camera.radius / meshRadiusWorld = 5.90` (mesh 내부 박힘 차단 비 ≥ 1.5 충족). ADR [`docs/decisions/20260503-378-focus-frustum-fix.md`](docs/decisions/20260503-378-focus-frustum-fix.md) §결정 (옵션 D, defense-in-depth). 실측 박제: [`docs/reports/378-forensic/output-developer.json`](docs/reports/378-forensic/output-developer.json)
- **`apps/web/scripts/browser-verify-378-focus.mjs` 신설 — focus 회귀 가드 12 cells 매트릭스** ([#378](https://github.com/coseo12/astro-simulator/issues/378)) — 6 body (sun/mercury/venus/earth/jupiter/neptune) × 2 모드 (observe/research) = 12 cells 매트릭스. 각 cell 별 DoD 3종 단언: (1) `camera.isInFrustum(focusMesh) === true`, (2) `camera.radius > meshRadiusWorld * 1.5` (mesh 내부 박힘 차단), (3) `camera.target` 이 `focusMesh.absolutePosition` 근방 (오차 ≤ meshRadiusWorld × 5). CLI: `pnpm --filter @astro-simulator/web verify:378-focus` 또는 `node apps/web/scripts/browser-verify-378-focus.mjs`. dev 빌드 의존 (`window.__solarScene.meshes` Map + `mesh.getScene().activeCamera`). **CI `detect-and-test` job 통합** — `.github/workflows/ci.yml` 에 `next dev -p 3002` 기동 후 검증 step 추가 (cross-validate G3 수용 — 사용자 D-T2 재발견 비용 > CI 시간 비용 ROI 명백)
- **R3 라운드 3 D-1 채택 — venus > mercury 사실 비율 강화 (#385, #373 라운드 3 후속)** ([#385](https://github.com/coseo12/astro-simulator/issues/385)) — `BODY_SCALE.mercury` 900 → **700** / `BODY_SCALE.venus` 650 → **800** (D-1 채택, architect 4축 평가 — 사실 비율 도달률 / 4px fallback 안전 마진 / LOD 일관성 / 모바일 누적 disk area). venus/mercury 시각비 1.79배 → **2.83배** (사실 비율 6052/2440 = 2.48배 도달률 72% → **114%**). 사용자 D-T2 (PR #384, 2026-05-01) "전체적인 비율은 개선됨 / 실제 비율적으론 아직 맞지 않는 듯" 부분 통과 → 라운드 3 적극 재조정. mercury 저점 pxDiameter 5.29 px (4px fallback 마진 +1.29 px, D-2 의 2.43배 안전), venus 고점 48.4 px (mid 임계 50 미만 → mid 일관 유지, high 미진입). 모바일 누적 disk area 16.75% (가드 25% 마진 8.25%p). r1-guard `--measure-px-ratio` 임계 갱신 — mercury 6% → **4.95%** / venus 11% → **14.26%** (±5% 마진 정책 보존). forensic ADR [`docs/decisions/20260430-r3-followup-body-proportion.md`](docs/decisions/20260430-r3-followup-body-proportion.md) Amendment 2026-05-03 (라운드 3) SSoT
- **`PX_RATIO_THRESHOLDS` 임계 갱신 (#385 라운드 3 D-1)** ([#385](https://github.com/coseo12/astro-simulator/issues/385)) — `apps/web/scripts/r1-ui-regression-guard.mjs` 의 `PX_RATIO_THRESHOLDS` 박제값 갱신 (mercury 6 → 4.95 / venus 11 → 14.26). 산출 식: `예측값 × 1.05 (±5% 마진 정책)` — mercury 4.71% × 1.05 ≈ 4.95%, venus 13.58% × 1.05 ≈ 14.26%. 라운드 2 SSoT 의 ±5% 마진 정책 보존 (architect ADR Amendment 2026-05-03 라운드 3 §결정 2). R4+ body 추가 시 본 룩업에 1줄 추가만 — body-scale.ts 와 동일 SSoT 패턴
- **billboard alpha mask 적용 — 모바일/데스크톱 사각형 회귀 fix (#391 Phase 2, #379 후속)** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — `createBodyBillboard` material 에 procedural 원형 alpha mask 적용 (`StandardMaterial.opacityTexture` + `transparencyMode = 1` ALPHATEST + `alphaCutOff = 0.5`). `MeshBuilder.CreatePlane` quad 자체는 유지 (low LOD 정책 변경 없음). #379 Phase 1 (PR #390, screenCoverage 식 정정) 머지 후에도 작은 viewport / 낮은 DPR 환경 (모바일 320×568 ~ 데스크톱 1920×1080 dpr1) 6 cell 에서 mercury (pxDiameter 6.80~12.94) / venus (12.39~15.71) 가 low billboard 잔존하여 정사각형 quad 의 픽셀 그리드 노출이 사용자 D-T2 사각형 회귀 trigger — alpha mask 가 quad 윤곽 → 원형 disc 변환으로 회귀 차단. 8 cell 매트릭스 검증 8/8 PASS (`pnpm verify:391-billboard` 시나리오 D), Phase 1 baseline `verify:379-lod` sun=high 100% / 최대 low ratio 95.8% 보존. r1-guard `--measure-px-ratio` 영향 0 (mercury 6.07% / venus 11.03% 동일). bench:scene 회귀 0 (idle/play/focus 5종 모두 develop tip 대비 +9~+11% 향상, 측정 변동성 안). ADR [`docs/decisions/20260502-391-phase2-billboard.md`](docs/decisions/20260502-391-phase2-billboard.md) §결정
- **billboard alpha mask 4px fallback 임계 박제** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — `LOD_BILLBOARD_ALPHA_MASK_MIN_PX_DIAMETER = 4` 상수 + `shouldApplyBillboardAlphaMask(pxDiameter)` 헬퍼 export. `runLodPass` 가 매 프레임 측정 + low variant material 의 `opacityTexture` 토글 (≥ 4px → mask 적용 / < 4px → null + `transparencyMode = 0` OPAQUE 사각형 quad 유지). 근거: smoothstep(0.4, 0.5) 의 0.53px 전이 구간이 hardware pixel 1개 미만 → GPU sampler aliasing + sub-pixel flickering 회피 (사용자가 3px 이하에서 원/사각형 구분 불가, 사각형 quad 가 시각 안정성 우위). cross-validate (Gemini) 이견 수용 #1. #385 라운드 3 (mercury/venus 박제값 인하) 진입 시 안전 마진 제공. 단위 테스트 6 case 신설 (`packages/core/src/scene/lod-billboard-alpha-mask.test.ts`)
- **DynamicTexture 64×64 scene 단위 공유 + dispose 책임 박제** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — `getOrCreateBillboardAlphaMask(scene)` 가 `scene.metadata.__lodBillboardAlphaMask` 캐시로 1회 생성. 24 body 의 low variant material 모두 동일 인스턴스를 `opacityTexture` 로 공유 참조 (≈ 16KB VRAM 단일 박제, per-body 생성 시 24×). scene dispose 시 `disposeBillboardAlphaMask(scene)` 명시 정리 — HMR / navigation 시 텍스처 누수 방지. cross-validate 이견 수용 #2. browser-verify 시나리오 E 검증 (opacityTexture 고유 인스턴스 = 1)
- **`apps/web/scripts/browser-verify-391-billboard.mjs` 신설 — alpha mask 회귀 가드 2종 시나리오** ([#391](https://github.com/coseo12/astro-simulator/issues/391)) — 시나리오 D: 8 cell 매트릭스 (Phase 1 baseline 동일) 에서 mercury/venus 의 pxDiameter ≥ 4px 와 lowVariant.material.opacityTexture/transparencyMode 정합성 검증 / 시나리오 E: scene.metadata 캐시 박제 + opacityTexture 고유 인스턴스 1 (per-body 생성 회귀 가드). CLI: `pnpm verify:391-billboard`. dev 빌드 (`window.__simCore.scene` + `__solarScene.getLodInfo()` 의존)
- **`screenCoverageRadius` 식 정정 — sun=high 100% 회복 (#379 Phase 1)** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — `packages/core/src/render/lod.ts` 의 edge offset axis 를 world-up (+y) 고정에서 **camera-up basis (invView col 1)** 로 변경. 카메라가 비스듬한 자세 (T1 default 의 ArcRotateCamera 가 ~15° tilt) 에서 world-up 의 view-forward 성분이 NDC y 변화를 흡수해 pixel offset 이 ~50% 작게 측정되던 결함 해소. forensic 매트릭스 (`docs/reports/379-forensic/output.json`, 40 cell) 에서 sun=low 100% / mercury=low 100% / venus=low 100% 였던 회귀가 sun=high 100% (8/8 spot-check, `apps/web/scripts/browser-verify-379-lod.mjs` 시나리오 A) 로 정정. 사용자 D-T2 (#379 모바일 사각형) 의 1차 원인 (sun 이 LOD billboard plane 으로 fallback) 해소. 식 정정 효과 측정 (1280×720 dpr1, T1 default): sun coverage 39.99→**71.08 px** (이론 ≈ 71 일치), mercury 2.43→**4.31 px**, venus 4.41→**7.85 px**. mercury/venus 는 박제값 (mercury=900 / venus=650, 라운드 2) 환경에서 여전히 mid 임계 (8) 미달 → 후속 #385 라운드 3 영역 (architect ADR §재검토 #4 박제). r1-guard `--measure-px-ratio` 결과는 BBOX-based `boundingSphere.radiusWorld` 사용으로 식 fix 영향 0 (mercury 6.07% / venus 11.03% 측정값 동일, 라운드 2 baseline 유지)
- **`SolarSystemSceneHandles.runLodPass` cameraUpWorld 박제** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — `scene.getViewMatrix().clone().invert().m[4..6]` 을 매 프레임 1회 추출해 `screenCoverageRadius` 에 전달. 첫 frame 에 `_viewMatrix` lazy 미초기화 시 `[0, 1, 0]` fallback (ArcRotateCamera default 자세에서 ±10% 이내). 성능 영향 0 (matrix invert 1회/frame, 모든 body 에 재사용)
- **`apps/web/scripts/browser-verify-379-lod.mjs` 신설 — LOD 회귀 가드 3종 시나리오 매트릭스** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — DoD-Guard-1 (architect ADR `20260502-379-fix-decision.md` §"Phase 1 구현 PR" §"회귀 가드"). 시나리오 A: T1 default 8 viewport (모바일 4 + 데스크톱 4) sun=high 비율 + 최대 low ratio 검증 / 시나리오 B: T3 body focus (지구/화성) → focus body=high 보장 / 시나리오 C: asteroid sub-pixel low billboard 유지 (high 회귀 임계 ≤ 5). CLI: `pnpm verify:379-lod` (또는 `pnpm --filter @astro-simulator/web verify:379-lod`). baseline `apps/web/scripts/__baselines__/lod-379.json` 박제 + sun=high 비율 5%p 하락 시 회귀 검출. dev 빌드 (`__solarScene.getLodInfo()` 의존, #388 API)
- **`screenCoverageRadius` 시그니처 확장 — `cameraUpWorld?: Vec3Double` 추가 (선택)** ([#379](https://github.com/coseo12/astro-simulator/issues/379)) — backward compat (부재 시 `[0, 1, 0]` fallback). 단위 테스트 `packages/core/src/render/lod.test.ts` 의 5종 신규 케이스 + #379 forensic SSoT 5종 케이스 추가 (총 lod 테스트 38 → 46). cross-validate 이견 수용 #1 (엣지 케이스: frustum 경계 / sub-pixel asteroid / 카메라 내부) 박제

- **LOD dev overlay 상세 모드 (`?lodOverlay=1`)** ([#388](https://github.com/coseo12/astro-simulator/issues/388)) — body 별 LOD level + screenCoverage(px) + pxDiameter(px) + cameraDistance(km) 4 column 표 박제. 색상 코딩 (high=emerald / mid=amber / low=rose) + `data-lod-level` 속성. 기존 `?debug=draw-calls` 집계 모드는 backwards-compat 으로 유지 (단일 행 H/M/L 분포 박제). **prod bundle DCE 검증**: `LodDevOverlay` 함수 진입 즉시 `if (production) return null` 으로 본체 (`useState`/`useEffect`/JSX) 전체 제거 — `LodDevOverlayImpl` 분리로 hooks 의존 그래프와 prod 분기 격리. `grep -rln "lod-row-\|waiting for first frame" .next/static/` 0 매치 실측. 발화점: PR [#387](https://github.com/coseo12/astro-simulator/pull/387) ([#379] architect 단계) Gemini cross-validate 고유 발견 분리 — `docs/decisions/20260502-379-fix-decision.md` Phase 1 (screenCoverage 식 정정) 디버깅 도구
- **`SolarSystemSceneHandles.getLodInfo()` API 추가** ([#388](https://github.com/coseo12/astro-simulator/issues/388)) — `runLodPass` 매 프레임 갱신. 반환 시그니처 `readonly LodBodyInfo[]` (`id` / `level` / `screenCoverage` / `pxDiameter` / `cameraDistanceMeters`). 내부 버퍼 in-place mutate (재할당 회피, 매 프레임 24+ body × 5 필드 = 120+ assignment). 호출자는 read-only 계약 — mutate 금지. PR #387 reviewer non-blocking #1 (forensic `actualCameraRadius` 일률 35 cell 별 변별) + #2 (`bodyInfo.pixelDiameter` null) 직접 해소 가능 — overlay 가 raw 박제하면 forensic 측정 시 cell 별 차이가 드러남

### Notes

- **LOD overlay tree-shaking 검증 절차** — prod build 후 `grep -rln "lod-row-\|waiting for first frame\|isDetailedOverlayEnabled" apps/web/.next/static/chunks/` 가 0 매치여야 한다. `LodDevOverlay` 의 prod early-return 패턴은 컴포넌트 본체 분리 (`LodDevOverlayImpl`) 가 필수 — 단일 함수 내 hooks 와 prod 분기 공존 시 minifier 가 보수적 회피하여 hooks 의존 그래프 보존, dead branch JSX 가 잔존 (실측 1차 시도에서 발견)
- **`getLodInfo` core API 는 prod bundle 에 포함됨** — `LodBodyInfo` 인터페이스 + `runLodPass` 의 buffer in-place mutation (~30 라인) 은 packages/core scene 정상 API 의 일부로 prod 에서도 호출 가능. dev overlay 만 prod 에서 호출하지 않을 뿐. bundle size 영향 약 +1KB minified (버퍼 mutation 코드만, JSX 0)
- **`__solarScene.getLodInfo` 후방 호환** — 구버전 scene (P11-B v0.13.0~v0.15.0) 에는 `getLodInfo` 부재. dev overlay 가 optional chaining 으로 가드 — `getLodInfo` 미존재 시 `waiting for first frame` 메시지 유지 (#388 vitest 회귀 가드)

> **R3 D-T2 후속 — body 비율 자연화 (2026-05-01, #373 라운드 2 적극 재조정)** — 어제 (2026-04-30) D-T2 사용자 검증 5건 회귀 발견 중 **#1 (sun ↔ mercury / venus 비율 미해소)** 만 본 PR 범위. #378/#379/#380 (회귀 #2~#4) 은 별도 이슈 분리. 선행 PR [#377](https://github.com/coseo12/astro-simulator/pull/377) (옵션 c 보수값 mercury=2000 / venus=1500) D-T2 미통과 → CLOSED → 라운드 2 적극값 (임계 비례 역산 mercury=900 / venus=650) 채택. forensic ADR [`docs/decisions/20260430-r3-followup-body-proportion.md`](docs/decisions/20260430-r3-followup-body-proportion.md) Amendment 2026-05-01 (라운드 2) SSoT.

### Behavior Changes

- **수성/금성/태양 시각 비율 자연화 — 라운드 2 적극 재조정** ([#373](https://github.com/coseo12/astro-simulator/issues/373)) — 박제값 갱신 3건:
  - `BODY_SCALE.sun` 75 → **50** (R1 amendment, 옵션 a) — sun 자체 자연 크기화. 1280×720 brightRatio 4.19% → ~1.86% (R1 ADR Amendment 2026-05-01 §"sunScale 50 점유율 산출")
  - `BODY_SCALE.mercury` 8500 → **900** (R2 amendment 라운드 2, 옵션 c 적극 재조정) — sun 대비 px 비 38% → ~6%. 임계 비례 역산 `2000 × 6/13.5 ≈ 889`
  - `BODY_SCALE.venus` 4000 → **650** (R3 amendment 라운드 2, 옵션 c 적극 재조정) — sun 대비 px 비 45% → ~11%. 임계 비례 역산 `1500 × 11/25.5 ≈ 647`
- **r1-guard `--measure-px-ratio` flag 신설** — body 별 px diameter + sun 대비 px 비 + diskAreaRatio 자동 측정 + 임계 가드. CLI: `pnpm --filter @astro-simulator/web r1:guard:px-ratio` (또는 `node scripts/r1-ui-regression-guard.mjs --measure-px-ratio`). 임계: mercury sun 대비 ≤ 6% / venus sun 대비 ≤ 11% / 모바일 누적 disk area ≤ 25% (sun + mercury + venus). dev 빌드 (`window.__solarScene` 노출) 의존 + `?gpu=a` 강제 진입 (volt #77 false positive 가드). ADR [`20260430-r3-followup-body-proportion.md`](docs/decisions/20260430-r3-followup-body-proportion.md) §결정 2 §5 + [`20260425-r1-ui-pixel-diff-guard.md`](docs/decisions/20260425-r1-ui-pixel-diff-guard.md) Amendment 2026-05-01 §결정 2

### Notes

- **D-T2 사용자 검증 단계 분리** — 본 PR 은 박제값 갱신 + r1-guard `--measure-px-ratio` 신설 + 단위 테스트/빌드/lint PASS 까지. **실 Chrome GUI 수동 검증** 은 qa 단계 또는 사용자 D-T2 직접 (volt #77 — headless 검증만으로 종결 금지)
- **R3 baseline 갱신 별도 후속 PR** — sunScale 50 변경은 캔버스 외 4 영역 (top-nav / shortcut-bar / hud-top-right / hud-bottom-right) 에 직접 영향 0 (canvas 영역 비교 제외 박제, R1 UI pixel-diff guard ADR §결정 4) 이지만 sun mesh 가 shortcut-bar 의 하이라이트 색상에 indirect 영향 가능성 있음. PR CI r1-guard step 미스매치 발견 시 `r1:baseline-bootstrap` workflow_dispatch 1회 실행 → auto PR 생성 별도 머지 (R2 #365 / R3 패턴)
- **회귀 분리 박제 (#378/#379/#380)** — D-T2 5건 회귀 중 비율 미해소 #1 만 본 PR 범위. #2~#4 (Roadmap v3 amendment §"회귀 분리" 박제) 는 별도 이슈로 직교 추적. PR 한 건당 회귀 한 가지만 책임지는 SRP 원칙 (volt #30 Phase 분리 릴리스 리듬 적용)
- **사후 재조정 경로 박제** — 라운드 2 박제값 (sun 50 / mercury 900 / venus 650) 은 임계 한계 정렬 적극값. forensic ADR §재검토 트리거 #1 라운드 2 보강에 후속 적극값 (mercury 700 / venus 500 — sun 대비 ~5% / ~9% 보수 여유) + 옵션 (e) log scaling 우선순위 high 승격 경로 박제. 측정 노이즈 ± 5% 마진 안에 가까스로 통과 시 사용자 평가 정성 (#1 비율 미해소만 해결, #2~#4 별도) 우선

### Docs

- **forensic ADR `20260430-r3-followup-body-proportion.md` Amendment 2026-05-01 (라운드 2)** ([#373](https://github.com/coseo12/astro-simulator/issues/373)) — §재검토 트리거 #1 라운드 2 발동 (선행 PR #377 옵션 c 보수값 D-T2 미통과 → 라운드 2 적극값 채택). 박제값 적극 재조정 + r1-guard 임계 보존 + Cross-validate 결과 (Gemini 2.5 Pro outcome=applied). architect 라운드 2 자체-검증 + 사용자 결정 박제
- **R1/R2/R3 ADR Amendment 2026-05-01 (라운드 2 동반 박제)** — sunScale 50 baseline 갱신 (R1) + mercuryScale 900 (R2 라운드 2) + venusScale 650 (R3 라운드 2). 라운드 1 amendment 본문 보존 (trace = "왜 라운드 1 에서 라운드 2 로 재조정했는가" forensic ADR §"임계 비례 역산" SSoT)
- **r1-ui-pixel-diff-guard ADR Amendment 2026-05-01 (라운드 2)** — sunScale 50 baseline 동반 갱신 (`--measure-sun-coverage` brightRatio 가드 1280×720 ≥ 3% → ≥ 0.5%, sunScale 50 통과 여유 마진) + `--measure-px-ratio` flag 신설 박제

> **R3 사이클 진입 (2026-04-29)** — Roadmap v3 "Incremental Body-by-Body Build" 세 번째 스프린트. 태양 + 수성 (R2) 위에 **금성** 점진 추가. R1+R2 박제 인프라 (BODY_SCALE 룩업 / FOCUS_BUTTONS / focus sync / rebuildOrbitLines / r2-focus-race-guard) 100% 재사용. `venus: 4000` BODY_SCALE 1줄 + `FOCUS_BUTTONS` 1줄 = R2 ADR `20260428-r2-mercury-visualization.md` §결과 Concrete Prediction "R3 추가 시 코드 변경 ≤ 2 라인" **첫 외부 검증 — PASS**. 핵심 6 파일 변경 0 (solar-system-scene.ts / tier.ts / lod.ts / sim-canvas.tsx / celestial-info-panel.tsx / camera-controller.ts). 추가로 R2 머지 시점부터 잠재한 **ambient 라이팅 약점 (#372)** 회귀 fix 동봉 — default 진입 시 행성 그림자측 인지 가능 임계 회복 (옵션 A 정책). PR [#369](https://github.com/coseo12/astro-simulator/pull/369) (R3 anchor + ADR + 시각화 통합 + #372 fix).

### Behavior Changes

- **금성 가시성 진입 — `BODY_SCALE.venus = 4000` 추가** ([#369](https://github.com/coseo12/astro-simulator/issues/369)) — viewport 점유율 1280×720 / 1920×1080 0.692% (DoD 0.5% + 마진 38%), 모바일 (375×667) 2.19%. mercury 시각비 117% (venus 가 mercury 보다 17% 큼 — 과학적 사실 정합), sun 시각비 46% (sun 의 약 1/2). 픽셀 직경 98.91px @ 1280×720. 모바일 누적 차단율 sun + mercury + venus = 16.39% (한계 25% 까지 8.6%p margin). ADR `20260429-r3-venus-visualization.md` §결정 1
- **shortcut bar 6→7 항목 (태양 / 수성 / 금성 / 지구 / 목성 / 해왕성 + reset)** — `FOCUS_BUTTONS` 배열에 mercury 다음 위치 (천체 거리 순) 에 `{ id: 'venus', label: '금성' }` 1줄 추가. R1+R2 패턴 100% 정합 — 키바인딩 무박제, aria 자연 라벨. shortcut-bar dimension 1280: 170→195 (+25px), 모바일 113→128 (+15px). axe 0 위반 (R1+R2 회귀 0)
- **금성 focus / info 패널 / 궤도 라인 자동 일반화** — `solar-system.json` venus 데이터 (이미 박제) + R1 syncFocusToScene helper / CelestialInfoPanel / rebuildOrbitLines 자동 일반화. **핵심 6 파일 변경 0** — R2 ADR Concrete Prediction "R3 추가 시 ≤ 2 라인" 첫 외부 검증 성공. body mesh 머티리얼 default StandardMaterial (단색 — Q2=A 박제). 궤도 라인 색상 `Color3(0.25, 0.28, 0.4)` 일관 (R1+R2 박제값 보존)
- **r2-focus-race-guard body-agnostic 3-body 첫 검증** — 시나리오 1 (sun → mercury) / 2 (mercury → reset) PASS. 3-body 환경 (sun + mercury + venus) 에서 Babylon `Animation.CreateAndStartAnimation` 자동 폐기 동작 유효성 확증 (Q4=A — body id 무관 동일 property name 호출). 시나리오 3 (Animation tween spy) 환경 의존 skip (R2 일관)
- **회귀 #372 ambient 라이팅 강화 — default 진입 행성 그림자측 가시성 floor 회복** ([#372](https://github.com/coseo12/astro-simulator/issues/372)) — `solar-system-scene.ts` ambient.intensity 0.08 → 0.3 (3.75×) + groundColor (0.01, 0.01, 0.02) → (0.15, 0.15, 0.18) 중립 회색톤. R2 (#363, mercury 추가, v0.15.0) 머지 시점부터 잠재한 라이팅 약점이 R3 venus 추가로 가시화. sun.disableLighting=true 환경이라 sun 자체 영향 무 (1280×720 ?gpu=a 점유율 4.12% → 4.19%, +0.07%p — R1 박제 3.87% ± 0.5% 가드 안전). 행성 mesh sun-반대측 평균 luminance 인지 가능 임계 회복. **volt #77 직접 입증** — headless 는 GPU adapter 부재로 tier-c 자동 진입 → sun 1px 점 → 자동화 가드 8/8 PASS 였던 false positive 사례. AMBIENT_INTENSITY / AMBIENT_GROUND_COLOR_RGB 상수 export + `solar-system-scene.test.ts` 회귀 가드 4건 (intensity ≥ 0.25 floor / groundColor 평균 ≥ 0.05 floor / 박제값 정확 일치 2건) 박제 — 임의 하향 조정 시 단위 테스트 차단

### Notes

- **R3 baseline 갱신은 별도 후속 PR 분리 (R2 #365 패턴)** — 본 PR 머지 후 r1-guard step 5 가 의도된 FAIL (shortcut-bar 6→7 dimension 변동 + top-nav DOM nesting 부수효과). Linux CI `r1:baseline-bootstrap` workflow_dispatch 1회 실행 → auto PR 생성 → 갱신 PR 별도 머지. macOS local `--update` 는 폰트 false positive 박제 위험으로 차단 (Amendment v3 §결정 1)
- **D-T2 실 Chrome GUI 수동 검증 사용자 단계 분리** — headless 검증만으로 종결 금지 (volt #77 false positive). 본 PR 은 reviewer/qa 통과 후 사용자가 sun ↔ mercury ↔ venus focus 빠른 전환 + 모바일 (375×667) 인지 가능성 + venus info 패널 ("× 4000 과장 중" + 자전 주기 retrograde 표기) 수동 검증
- **R3 ADR Gemini cross-validate 합의 — viewport-aware scaling 도입 결정 시점 R4 로 박제** — Gemini 권고 1 수용 ("R5 진입 전 검토" → "R4 ADR 박제 시점에 명시적 결정 박제 의무"). 능동적 기술 부채 관리 — 모바일 누적 차단율 한계 25% 가 R5 (mars) 진입 시 도달 위험 → R4 architect 가 도입 / 미도입 / 부분 도입 (모바일 only) 3 후보 비교 의무. R3 ADR §위험·미해결 + §재검토 트리거 #3 박제
- **#372 후속 — planet 가시성 headless 가드 (`?gpu=a` 매트릭스) 후속 이슈 분리 후보** — 본 PR 은 ambient 상수 SSoT 단위 테스트만 박제 (architect 권고 1 수용). headless 환경에서 `?gpu=a` 강제 + mercury / venus mesh 영역 sun-반대측 평균 luminance 임계 측정 자동화는 별도 이슈 (#373 후보 — 메인 사용자 의사 확인 후 분리). volt #77 매트릭스 자동화 후속 이슈도 동일 분리 후보 (R3 ADR §재검토 트리거 #3 후속)

### Docs

- **ADR `20260429-r3-venus-visualization.md` 신규** ([#369](https://github.com/coseo12/astro-simulator/issues/369)) — 610 라인. R3 시각화 결정 6건 통합 (venusScale=4000 / shortcut-bar venus 항목 / orbit 라인 무수정 / focus race body-agnostic / info 패널 자동 일반화 / 비-범위 보호 가드). 11 후보 × 3 viewport venusScale 산출표. R4 Concrete Prediction (earth 단독 = 1 라인 / earth + moon = 0~2 라인). Gemini cross-validate 합의 (6 영역 우수 + S급 ADR + viewport-aware scaling R4 결정 시점 구체화 권고 수용). 후속 발견 분리 (ADR Status workflow Provisional → Accepted 표준화 — priority:medium-low)

## [0.15.0] — 2026-04-28

> **R2 사이클 (2026-04-28)** — Roadmap v3 "Incremental Body-by-Body Build" 두 번째 스프린트. 태양 단독 visible (R1, v0.14.0) 위에 **수성** 점진 추가. R1 박제 인프라 (BODY_SCALE 룩업 / FOCUS_BUTTONS / focus sync / rebuildOrbitLines / r1-guard 매트릭스) 100% 재사용. `mercury: 8500` BODY_SCALE 1줄 + `FOCUS_BUTTONS` 1줄 = R1 §결과 Concrete Prediction "R2 코드 변경 ≤ 3 라인" 자연 검증. PR [#363](https://github.com/coseo12/astro-simulator/pull/363) (R2 anchor) + [#365](https://github.com/coseo12/astro-simulator/pull/365) (baseline 갱신 + Amendment v4 정정) + [#366](https://github.com/coseo12/astro-simulator/pull/366) (agent-browser 가드 — volt #79). 누락된 release entry 박제는 [#373](https://github.com/coseo12/astro-simulator/issues/373) PR 흐름에서 회수 (release version bump 가드 통과 의무).

### Behavior Changes

- **수성 가시성 진입 — `BODY_SCALE.mercury = 8500` 추가** ([#361](https://github.com/coseo12/astro-simulator/issues/361)) — viewport 점유율 1280×720 / 1920×1080 0.612% (DoD 0.5% + 마진 22%), 모바일 (375×667) 1.94%. sun 시각비 약 40% (sun 의 1/2.5 — "수성 < 태양" 자연스러움). 픽셀 직경 84.76px @ 1280×720. ADR `20260428-r2-mercury-visualization.md` §결정 1
- **shortcut bar 5 항목 (태양 / 수성 / 지구 / 목성 / 해왕성)** — `FOCUS_BUTTONS` 배열에 sun 다음 위치 (천체 거리 순) 에 `{ id: 'mercury', label: '수성' }` 1줄 추가. R1 패턴 100% 정합 — 키바인딩 무박제, aria 자연 라벨. axe 0 위반 (R1 회귀 0)
- **수성 focus / info 패널 자동 일반화** — `solar-system.json` mercury 데이터 (이미 박제) + R1 syncFocusToScene helper / CelestialInfoPanel 자동 일반화. 코드 변경 0
- **R2 focus race condition 회귀 가드 신설** — `apps/web/scripts/r2-focus-race-guard.mjs` 3 시나리오 (sun→mercury / mercury→reset / Animation tween 카운트). 단일 body (sun) 환경이라 R1 단독에서 검증 불가했던 다중 body race scenario 처음 도입. ADR §결정 4 의 "Babylon 자동 폐기 신뢰" 회귀 가드. 실측 보정: focusOn 의 property name 은 `cam-target` / `cam-radius`, reset 의 property name 은 `cam-reset-target` / `cam-reset-radius` (camera-controller.ts:91) — 자동 폐기는 focusOn → focusOn 케이스에 한정. focusOn → reset 은 다른 property라 lerp 병행이지만 시작점이 현재 카메라 위치라 자연스러운 보간
- **agent-browser Chrome cleanup 가드 도입** (volt [#79](https://github.com/coseo12/volt/issues/79)) — `.claude/agents/qa.md` 마무리 절차 + CLAUDE.md "프로젝트 고유 보강 교훈" §"sub-agent 이탈의 프로세스 레벨 확장" 블록에 agent-browser 좀비 정리 의무 박제. **sub-agent 루틴**: `browser-test` 스킬로 agent-browser 사용 후 반환 직전 `pgrep -f "agent-browser-chrome-" >/dev/null && pkill -TERM/KILL -f "agent-browser-chrome-"` 실행. **메인 루틴**: sub-agent 복귀 직후 `pgrep -af "agent-browser-chrome-"` 검사 + 발견 시 정리. 사용자 본 Chrome 영향 0 (식별자 `agent-browser-chrome-<UUID>` user-data-dir). **본 세션 (2026-04-28) 실측**: 6 세션 / 52 좀비 / 3일치 누적 → 800%+ CPU. agent-browser 도구 자체 cleanup 이 정상 case 작동하나 sub-agent 비정상 종료 시 lineage 끊긴 좀비 잔존 — `spawned_bg_pids` SSoT 가 직접 spawn PID 만 커버하므로 도구 wrapper child process 별도 가드 (volt #46/#52 의 agent-browser 변형)

### Notes

- **R2 baseline 갱신 + Amendment v4 Concrete Prediction 정정 (R2 후속 사이클, 2026-04-28)** — PR [#363](https://github.com/coseo12/astro-simulator/pull/363) 머지 후 발견된 r1-guard step 5 의도된 FAIL 해소. shortcut-bar 3 viewport (의도 변경 = mercury 5번째 버튼) **+** top-nav 3 viewport (DOM nesting 부수효과 = `<header data-r1-region="top-nav">` 내부에 shortcut-bar 가 child) = **6 PNG 동시 갱신**. hud-top-right / hud-bottom-right 6장은 변경 0 (D-R2 R1 회귀 0 검증). Linux CI `r1:baseline-bootstrap` workflow_dispatch 산출본 사용 (macOS local `--update` 는 폰트 false positive 박제 위험으로 차단)
- **Amendment v4 Concrete Prediction 정정** — 원안 "shortcut-bar 3장만 변경, 다른 9장 변경 0" 이 DOM nesting 가정 누락. 정정: "shortcut-bar 3장 + top-nav 3장 = 6장 동시 갱신 (R3~R10 SSoT)". §위험·미해결 에 nesting 부수효과 박제 + §재검토 트리거 #5 (DOM nesting 가정 무효화) 추가
- **shortcut-bar baseline 갱신은 별도 commit 또는 후속 PR 분리** — Amendment v4 §결정 2 5단계 적용. macOS local 환경에서 `r1-ui-regression-guard.mjs --update` 실행 시 의도 외 영역 (top-nav / hud-top-right / hud-bottom-right) 도 폰트 차이로 갱신 → Linux CI 환경에서만 정합. 본 PR 의 머지 전 reviewer 단계에서 CI green 확인 후 baseline 갱신 절차 별도 진행
- **BODY_SCALE.mercury default 1.0 fallback 테스트 제거** — `body-scale.test.ts` 의 "미정의 body default 1.0" 테스트에서 mercury 사례 삭제 + 다른 body (earth / jupiter / unknown) 로 일반화. R3+ 추가 시 동일 패턴 갱신 의무
- **r2-focus-race-guard.mjs 의 시나리오 3 (Animation tween spy) 환경 의존 skip** — Babylon 글로벌 (`window.BABYLON`) 미노출 환경 (현재 ESM module 빌드) 에서는 spy 설치 불가, soft skip 처리. 시나리오 1, 2 가 race 회귀 가드 본질 (store sync + camera 변화) 보장
- **dev 서버 사용 의무** — r2-focus-race-guard 는 `__simCore` / `__solarScene` 글로벌 (sim-canvas.tsx:252 NODE_ENV 가드) 의존 → `pnpm dev` 환경 필요. p329-qa-focus-lod-guard 와 동일 정책

### Docs

- **ADR `20260428-r2-mercury-visualization.md` 신규** ([#361](https://github.com/coseo12/astro-simulator/issues/361)) — 632 라인. R2 시각화 결정 5건 통합 (mercuryScale=8500 / shortcut-bar / orbit 라인 / focus race / info 패널). 11 후보 × 3 viewport mercuryScale 산출표. R3 Concrete Prediction (코드 변경 ≤ 2 라인 + 단서 조항: venus 머티리얼 분기 예외). Gemini cross-validate 합의 (Q1/Q4 산출 정합 / Q3 R3 단서 조항 추가) + 후속 이슈 #362 (R1 sun 1920×1080 점유율 정정)
- **ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment v4** ([#357](https://github.com/coseo12/astro-simulator/issues/357), [#361](https://github.com/coseo12/astro-simulator/issues/361)) — 192 라인. sentinel 정책 amendment + shortcut-bar baseline 갱신 절차 (Q3=B 통합). 후보 (d) 수동 검토 분리 채택 + R2 직접 적용 5단계 + R3~R10 패턴 SSoT
- **ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment v4 Concrete Prediction 정정** (R2 후속 #361, 2026-04-28) — §결과·재검토 조건 §"Concrete Prediction (R2 PR 자동 재현) — 2026-04-28 정정" + §위험·미해결 nesting 부수효과 bullet + §재검토 트리거 #5 추가. 원안 "shortcut-bar 3장만 변경" → 정정 "shortcut-bar 3장 + top-nav 3장 = 6장 동시 갱신". DOM nesting (top-bar 가 shortcut-bar 의 부모) 자연 부수효과 박제. R3~R10 SSoT

## [0.14.0] — 2026-04-26

> **R1 후속 F-2 (#348) — ci.yml r1-guard step 통합 + Linux baseline 정합 + ADR Amendment v3** — v0.13.1 부트스트래핑 인프라 위에 chicken-and-egg 해소. 모든 PR check 의 `detect-and-test` job 이 R1 UI 회귀 가드를 자동 trigger. PR [#347](https://github.com/coseo12/astro-simulator/pull/347)/[#349](https://github.com/coseo12/astro-simulator/pull/349)/[#350](https://github.com/coseo12/astro-simulator/pull/350)/[#351](https://github.com/coseo12/astro-simulator/pull/351)/[#354](https://github.com/coseo12/astro-simulator/pull/354)/[#355](https://github.com/coseo12/astro-simulator/pull/355) 6 PR 머지 + workflow_dispatch 1회 실증 + 메타 가드 실증 1차 (#356 close, #357 분리).

### Behavior Changes

- **ci.yml `detect-and-test` job 에 R1 UI 회귀 가드 step 5개 통합** ([#348](https://github.com/coseo12/astro-simulator/issues/348), PR [#355](https://github.com/coseo12/astro-simulator/pull/355) `39c896f`) — `verify:no-scientific-grep` 직후에 (1) Rust 툴체인 (`dtolnay/rust-toolchain@stable`, 1.94.1, wasm32-unknown-unknown) (2) Rust 빌드 캐시 (`Swatinem/rust-cache@v2`, packages/physics-wasm) (3) wasm-pack 설치 (`taiki-e/install-action@v2 wasm-pack@0.14.0`) (4) R1 UI 회귀 가드 (Playwright Chromium + `pnpm build` + next start -p 3001 + `r1-ui-regression-guard.mjs`) (5) diff 이미지 업로드 (`actions/upload-artifact@v4`, retention 7 days) — 5개 step 추가. 모든 PR 의 detect-and-test 시간이 약 +100s 증가 (실측 2m10s, ADR §위험 #1 임계 8분의 27%). `if:` 가드: `pnpm-lock.yaml` + `apps/web/scripts/r1-ui-regression-guard.mjs` + `rust-toolchain.toml` + `Cargo.toml` 존재 시에만 trigger. 4 영역 (top-nav / shortcut-bar / hud-top-right / hud-bottom-right) × 3 viewport (1280×720 / 1920×1080 / 375×667) = 12 영역 mismatch ≤ 0.5% 검증. 실패 시 diff PNG artifact 자동 업로드. ADR `20260425-r1-ui-pixel-diff-guard.md` §Amendment v3 (PR [#354](https://github.com/coseo12/astro-simulator/pull/354), commit `9481c9d`)
- **R1 baseline 12 PNG: macOS → Linux CI 캡처본 전환** ([#337](https://github.com/coseo12/astro-simulator/issues/337), PR [#351](https://github.com/coseo12/astro-simulator/pull/351) `d9ae9c0`) — `r1:baseline-bootstrap` workflow_dispatch run 24956759573 (2m1s 완주, ubuntu-latest 환경) 으로 자동 갱신. 로컬 macOS 검증 시 폰트 차이로 false positive 가능 — `SKIP_LOCAL=1` 또는 CI 결과 신뢰
- **메타 가드 실증 1차 — positive control 미확보 사실 박제** (PR [#356](https://github.com/coseo12/astro-simulator/pull/356) close, run 24957820142) — 1글자 텍스트 변경 ('태양' → '태앙') 의 shortcut-bar mismatch 가 0.114~0.197% 로 임계 0.5% 미만 → r1-guard PASS. r1-guard step 자체 작동은 logs (12 영역 × 3 viewport mismatch 측정 출력) 로 확인. sentinel 정책 + 임계값 재검토는 후속 [#357](https://github.com/coseo12/astro-simulator/issues/357) 로 분리. ADR §결과·재검토 조건 §메타 가드 실증 절차 박제

### Docs

- **ADR `20260425-r1-ui-pixel-diff-guard.md` Amendment v3** (PR [#354](https://github.com/coseo12/astro-simulator/pull/354) `9481c9d`) — 247 라인 신규. 핵심 결정 4건 박제: (1) wasm-pack 후보 A (단일 job 통합) (2) ci.yml r1-guard step 5개 형태 (`if:` 가드 + `pnpm build` 보존 + `exit $GUARD_EXIT`) (3) step 위치 `verify:no-scientific-grep` 직후 (4) 메타 가드 실증 절차 (1글자 변경 → fail → PR close — 본 사이클은 미확보, 분리). Concrete Prediction (ci.yml +35~40 / 다른 파일 0 / detect-and-test ≤ 8분) 박제. Gemini cross-validate "S급 ADR" 평가, BLOCK 0건. 후속 이슈 [#352](https://github.com/coseo12/astro-simulator/issues/352) (메타 가드 자동화 = 카나리아) / [#353](https://github.com/coseo12/astro-simulator/issues/353) (diff 이미지 inline 첨부) — 모두 priority:low 보류

### Notes

- **release PR `--merge` 방식** (gitflow 정책, ADR `20260419-release-merge-strategy.md`) — squash 시 develop 과 diverge 발생 + merge-back 강제. merge commit 으로 main tip 이 develop tip 을 직계 조상으로 포함하므로 fast-forward `git push origin main:develop` 만으로 동기화 완료
- **closed 이슈**: [#337](https://github.com/coseo12/astro-simulator/issues/337) (R1 후속 F-1 부트스트래핑) / [#348](https://github.com/coseo12/astro-simulator/issues/348) (R1 후속 F-2 통합)
- **잔여 phase:R1 OPEN 이슈**: #352 / #353 / #357 — 모두 후속 보류, 다음 R-Phase (R2 수성) 진입 가능 시점

## [0.13.1] — 2026-04-26

> **R1 후속 F-1 (#337) 부트스트래핑 인프라 단독 릴리스** — `r1:baseline-bootstrap` workflow 를 default branch (`main`) 에 도달시켜 `workflow_dispatch` 트리거 가능 상태로 진입 (volt #45 함정 회피). 행동 변화는 `SKIP_LOCAL=1` 1건 + 워크플로 신규. R1 후속 F-2 (#348) 는 본 릴리스 머지 + dispatch + baseline 갱신 PR 머지 후 별도 진입 (chicken-and-egg).

### Behavior Changes

- **R1 UI 회귀 가드 baseline CI Linux 전환 인프라 — 부트스트래핑 단계** ([#337](https://github.com/coseo12/astro-simulator/issues/337), PR [#347](https://github.com/coseo12/astro-simulator/pull/347)) — `.github/workflows/r1-baseline-bootstrap.yml` (`workflow_dispatch`, ubuntu-latest 캡처 + `peter-evans/create-pull-request`) 신규. `apps/web/scripts/r1-ui-regression-guard.mjs` 매개변수화: `BASE_URL` 환경변수 계약 헤더 주석 박제 + `SKIP_LOCAL=1 + macOS darwin` 즉시 PASS 종료 (6 라인 변경). `r1-ui-regions.mjs` 0 라인 변경. baseline 12 PNG 는 본 릴리스 머지 후 `r1:baseline-bootstrap` workflow_dispatch 1회 실행으로 자동 갱신 PR 생성 (Linux 캡처본 교체). 로컬 macOS 검증 시 폰트 차이 false positive 가능 — `SKIP_LOCAL=1` env var 또는 CI 결과 신뢰. **`ci.yml` 의 r1-guard step 통합은 본 PR 비-범위** — chicken-and-egg 회피 (Linux baseline 갱신 PR 머지 후 별도 후속 PR 에서 통합. `pnpm build` 가 detect-and-test job 에 없는 wasm-pack 의존을 끌어오는 추가 위험도 후속 PR 에서 wasm-pack 설치 step 분리로 해소). ADR `20260425-r1-ui-pixel-diff-guard.md` §Amendment 2026-04-26

## [0.13.0] — 2026-04-26

> **R1 사이클 (2026-04-25 ~ 2026-04-26)** — Roadmap v3 "Incremental Body-by-Body Build" 첫 스프린트. 태양 가시성 복구 + 회귀 가드 인프라. 8 PR 머지 (#330, #331, #332, #338, #339, #340, #342, #344).

### Fix

- **billboard variant `bodyScale` 분리** ([#333](https://github.com/coseo12/astro-simulator/issues/333), Phase 2) — `createBodyBillboard` 의 `diameter` 식에서 `bodyScale` 곱셈 제거. sphere/mid variant 는 그대로 유지 (시각 과장 책임 단독). billboard 는 sub-pixel draw call 절감 책임 단독 — 책임 직교화. focus 강제 해제 + 1 AU+ 카메라 거리 + 픽셀 경계 부족 edge case 에서 거대 quad 회귀 차단 (PR [#332](https://github.com/coseo12/astro-simulator/pull/332) 검증 중 발견된 시각 회귀의 근본 해결). ADR `20260425-r1-sun-visualization.md` §"Phase 2 결정 (#333)" amendment 참조. 신규 단위 테스트 (`packages/core/src/scene/body-scale-variants.test.ts`, 9 케이스) drift 방어
- **store-scene 동기화 단일 경로 통합** ([#334](https://github.com/coseo12/astro-simulator/issues/334) + [#335](https://github.com/coseo12/astro-simulator/issues/335)) — `SimulationCore.setCameraHandlers(focus, reset, setRadius)` → `setCameraRadiusHandler(setRadius)` 단일 인자로 단순화 + 리네이밍. focus / resetCamera 콜백 폐기 → `useSimStore.subscribe(selectedBodyId)` 분기가 scene focus / 카메라 reset 단일 책임. `syncFocusToScene(bodyId)` helper 추출 (마운트 직후 1회 sync 와 subscribe 분기 식 공유, DRY). `case 'focusOn'` / `case 'resetCamera'` 의 `bodySelected` event emit 은 보존 — store sync 경로 (core-adapter → setSelectedBody) 의존. **이중 호출 해소**: 클릭 시 `controller.focusOn` 1회만 호출 (이전 2회). `setSelectedBody(null)` 시 `controller.reset` 1회 (이전 2회 또는 미래 info-panel close 누락 가능성). PR #332 Phase 1 fix `acfcb74` 의 임시 해결책 (subscribe + setCameraHandlers 이중 경로) 을 정식 통합으로 대체. ADR `20260425-r1-store-scene-sync-unification.md` §결정 1~6. 회귀 가드: `simulation-core-camera-sync.test.ts` 6 케이스 (이벤트 emit / 핸들러 호출 횟수 / `setCameraHandlers` 부활 방지)

### Chore

- **P11-C QA 진단 스크립트 박제 + 임시 벤치 폐기** ([#290](https://github.com/coseo12/astro-simulator/issues/290), PR [#330](https://github.com/coseo12/astro-simulator/pull/330) `1b4f6d6`) — `apps/web/scripts/p290-{diag-visibility, qa-console-errs, qa-idle-fps, qa-real-chrome}.mjs` 4건 회귀 가드용 정식 추적. phase 라벨 없는 임시 벤치 산출물 (`docs/benchmarks/2026-04-24T08-*.json`) 3건 폐기
- **Harness v2.29.1 → v3.6.0 업데이트** ([volt #77](https://github.com/coseo12/volt/issues/77), PR [#338](https://github.com/coseo12/astro-simulator/pull/338) `9d818e9`) — v3.0.0 책임 분리 6c 수동 마이그레이션 완료. lessons 9개 / 가이드 2개 / frozen verify 4개 신규. ci.yml user-only 격리 (`docs/harness-ci-migration.md`). harness-guards.yml lib 부재 시 skip 임시 패치 (commit `a8f75d4`)

### Docs

- **R1 태양 가시성 ADR 2편 박제** ([#329](https://github.com/coseo12/astro-simulator/issues/329), PR [#331](https://github.com/coseo12/astro-simulator/pull/331) `c001ac1`) — 시각화 ADR (`docs/decisions/20260425-r1-sun-visualization.md`) + 회귀 가드 ADR (`docs/decisions/20260425-r1-ui-pixel-diff-guard.md`). 4 결정 (sunScale 75 / 상수 위치 / 곱셈 순서 / pixel diff 임계값) 박제. Concrete Prediction (R2 추가 시 4 파일 0 라인) 박제
- **ADR `20260425-r1-sun-visualization.md` Amendment** ([#336](https://github.com/coseo12/astro-simulator/issues/336), PR [#339](https://github.com/coseo12/astro-simulator/pull/339) `f427f88`) — §결과·재검토 조건 보강: 재검토 트리거 #6 ("[#333](https://github.com/coseo12/astro-simulator/issues/333) Phase 2 처리 시점 도래") + §위험·미해결 sub-섹션 신규 ("Phase 2 미해결 사항 (#333)")

### R1 태양 가시성 복구 (Roadmap v3 — 사용자가 명시적으로 visible)

메인 이슈: [#329](https://github.com/coseo12/astro-simulator/issues/329) · ADR: [`20260425-r1-sun-visualization.md`](docs/decisions/20260425-r1-sun-visualization.md) (시각화) + [`20260425-r1-ui-pixel-diff-guard.md`](docs/decisions/20260425-r1-ui-pixel-diff-guard.md) (회귀 가드)

PR [#332](https://github.com/coseo12/astro-simulator/pull/332) (`6e7382e`) — 기본 진입 화면 태양 가시성 복구 + UI 회귀 가드 인프라. P12 폐기 후 incremental body-by-body build 의 첫 body.

#### Behavior Changes

- **`BODY_SCALE.sun = 75` 시각 과장 박제** (`apps/web/src/constants/body-scale.ts`) — 1 AU 거리 카메라 시점에 viewport 점유율 ≥ 3% (1280×720 / 1920×1080 / 375×667 3 viewport 검증). 이전 sub-pixel ~1px → 가시 sphere
- **`packages/core` ↔ `apps/web` 의존성 역전 방지** — `bodyScale: (id) => number` callback DI 주입. `packages/core` 는 시각 과장 데이터를 모름 (시각/물리 계층 분리)
- **`sim-canvas.tsx` `selectedBodyId` ↔ scene focus 동기화** (commit `acfcb74` Phase 1 fix) — `useSimStore.subscribe` + 마운트 직후 1회 sync. URL `?focus=` 진입 시 LOD 분기 정상 high 적용. 이전 동기화 누락으로 거대 quad 회귀
- **R1 회귀 가드 인프라** (`apps/web/scripts/r1-{ui-regression-guard, ui-regions}.mjs` + `__baselines__/r1/` 12 PNG) — pixelmatch threshold=0.1 / mismatch ≤ 0.5% / 4 영역 × 3 viewport
- **focus LOD 회귀 자동 가드** (`apps/web/scripts/p329-qa-focus-lod-guard.mjs`, commit `9516b68`) — `channel: 'chrome'` 강제 + sphere/billboard 자동 판별. volt #33 (headless swiftshader 함정) 변형 false positive 차단
- **info-panel sun 5 항목 표시** — mass / radius / luminosity / spectral class / dataSource (IAU 2015). `?mode=research` 모드 한정 (observe 모드 SidePanels 숨김 — R1 비-범위)
- **`focus=sun` URL override + dev 경고** — 허용 body id 외 무시 + 콘솔 경고
- **HUD `× 75 과장 중` 명시 표시** — 사용자 친화 표현 (Gemini 교차검증 개선 제안 2 반영)
- **Q3=C 비-범위 자동 가드** (`apps/web/scripts/verify-r1-tier-untouched.sh`) — `tier.ts` / `tier-transition.ts` / `lod-body-thresholds.ts` 0 라인 변경 검증. PR 머지 전 강제

### Harness 워크플로 (volt #77 반영, v3.6.0)

- **메인 오케스트레이터 단계 게이트 신규** (PR [#338](https://github.com/coseo12/astro-simulator/pull/338)) — `developer → reviewer → qa → 사용자/머지` 순서 강제. developer self-compare 자명 PASS 함정 차단. 예외: docs only / chore. CLAUDE.md `### sub-agent 검증 완료 ≠ GitHub 박제 완료` line 287 박제
- **에이전트 3개 갱신** — `.claude/agents/{pm, qa, reviewer}.md` 행동 정의 v3.6.0 정합
- **스킬 2개 갱신** — `.claude/skills/{cross-validate, run-tests}/...` 절차 정합

### 분류

- PR [#330](https://github.com/coseo12/astro-simulator/pull/330): PATCH (회귀 가드 스크립트 박제, 행동 변화 없음)
- PR [#331](https://github.com/coseo12/astro-simulator/pull/331): PATCH (ADR docs only)
- PR [#332](https://github.com/coseo12/astro-simulator/pull/332): **MINOR** (UI 행동 변화 + 회귀 가드 인프라 신규)
- PR [#338](https://github.com/coseo12/astro-simulator/pull/338): **MINOR** (메인 오케스트레이터 게이트 룰 + 에이전트/스킬 갱신)
- PR [#339](https://github.com/coseo12/astro-simulator/pull/339): PATCH (ADR amendment, 문서 보강만)
- PR [#340](https://github.com/coseo12/astro-simulator/pull/340): PATCH (CHANGELOG 소급 박제, 문서 보강만)
- PR [#342](https://github.com/coseo12/astro-simulator/pull/342) (#333 Phase 2): **MINOR** (billboard `bodyScale` 분리 — 시각 행동 변화 + drift 방어 단위 테스트 9 케이스)
- PR [#344](https://github.com/coseo12/astro-simulator/pull/344) (#334 + #335): **MINOR** (`setCameraHandlers` → `setCameraRadiusHandler` 내부 API 리네이밍 + 시그니처 단순화 + 행동 변화 — 이중 호출 1회로 단일화)

### Notes

- R1 후속 5건 ([#333](https://github.com/coseo12/astro-simulator/issues/333), [#334](https://github.com/coseo12/astro-simulator/issues/334), [#335](https://github.com/coseo12/astro-simulator/issues/335), [#336](https://github.com/coseo12/astro-simulator/issues/336), [#337](https://github.com/coseo12/astro-simulator/issues/337)) — R2 (수성) 진입 전 처리 권고. #333 / #334 / #335 / #336 완료, **#337 (CI Linux baseline 부트스트래핑) 만 잔존**
- 109건 `상위에서 삭제됨` 분류 (harness v3.6.0 자가 점검 결과) — 별도 라운드 처리 권고. `.claude/skills/capture-volt/SKILL.md` / `.claude/commands/volt.md` 보존 우선

#### Behavior Changes (CHANGELOG 소급 박제 자체)

None — 문서 보강만 (PATCH). 본 박제 자체는 코드/에이전트 행동 변화 없음. 미래 release 시점 박제 누락 방지.

## [0.12.0] — 2026-04-23

### P12-B 8D 카메라 dolly 애니메이션 (Display-Relative Scale Unification Phase B)

메인 이슈: #298 · ADR: [`docs/decisions/20260423-display-relative-scale-unification.md`](docs/decisions/20260423-display-relative-scale-unification.md) §3 (배선 원리) / §Phase 분리 / §Concrete Prediction

PR #304 (`208f5cb`) — Q8=8D 카메라 dolly 병행 interp + 입력 잠금. Phase A 의 Tier 엔진 기반 (v0.11.0) 위에 integration.

#### Behavior Changes

- **`runTierTransition` 신규 — scene scale 즉시 setAll + `camera.radius` 300ms ExponentialEase interp 병행** (`packages/core/src/scene/tier-transition.ts`) — apparent size 불변 수식 `radius_new = radius_old / ratio` (`ratio = renderScale_new / renderScale_old`) 로 focus body 화면 크기 유지. tier 전환 시 `scene.detachControl()` + `onAnimationEnd` / `setTimeout(lockMs=500)` 이중 해제. Pending tween 취소 (`scene.getAnimatableByTarget(camera).stop()`) + `document.visibilitychange` 핸들러 (idempotent attachControl)
- **`setTier` 가 `runTierTransition` 호출로 전환** (`packages/core/src/scene/solar-system-scene.ts:436`) — 기존 `scaling.setAll` 즉시 반영은 유지하되 camera dolly 병행 추가. `isArcRotateCamera` 런타임 타입 가드
- **`focusOn` JSDoc 에 Phase B tier 연계 맥락 박제** (`packages/core/src/scene/camera-controller.ts:44`) — user-trigger focus 경로 (`desiredRadius = meshRadius*5`) 는 유지. tier 전환 시 radius 재계산 경로는 `runTierTransition` 위임
- **카메라 `minZ` 재조정** — tier 전환 전 `cam.minZ = radius_new * 0.01` 적용. `radius_new < minZ` clamp 충돌 방어 (V5 달성 센서)

#### DoD 실측 (P12-B Phase B)

| DoD                                      | 실측                                                                | 상태 |
| ---------------------------------------- | ------------------------------------------------------------------- | ---- |
| V5 T3 Body 지구 세로 40% ±5% (304~336px) | **322px**                                                           | PASS |
| A1 focus 중심 편차 ≤10px                 | **0.0px**                                                           | PASS |
| C1 apparent size 변동 ≤5%                | 수식 단위 테스트 (`tier-transition.test.ts` 11건, `1e-12` 상대오차) | PASS |
| C2 fps<30 프레임 ≤2                      | canvas 비검정 + console.error 0 (Level 1)                           | PASS |
| C3 전환 ≤500ms                           | QA 독립 재측정 lock 373.5ms / click→reattach 506ms                  | PASS |
| C4 입력 잠금 + 100ms 내 재활성           | detachControl during=false / attachControl after=true (Level 2)     | PASS |

위험 3건 해소: pending tween 연쇄 (getAnimatableByTarget.stop 구현) / 탭 비활성 영구 잠금 (visibilitychange + fallback timer 이중 방어) / minZ clamp (`radius_new * 0.01` 재조정).

### P12-C Display-Relative Scale Unification 완결 (Phase C)

메인 이슈: #298 (auto-close) / #288 (auto-close) · ADR Amendment: [`docs/decisions/20260423-display-relative-scale-unification.md`](docs/decisions/20260423-display-relative-scale-unification.md) §Amendment / [`docs/decisions/20260422-floating-origin.md`](docs/decisions/20260422-floating-origin.md) §Amendment · 회고: [`docs/retrospectives/p12-retrospective.md`](docs/retrospectives/p12-retrospective.md)

### Behavior Changes

#### UI 제거 — 단일 모드 전환 완결 (R1/R2/R5)

- **`ViewModeSwitcher` / `ScaleBadge` / `OnboardingTooltip` / `ScientificModeNotice` 4종 UI 컴포넌트 제거** — `apps/web/src/components/layout/` 에서 파일 + 테스트 총 8건 삭제. `app-shell.tsx` 의 import / render 참조 제거. 단일 모드 채택으로 "과장 모드 토글" UX 폐기
- **`sim-store.viewMode` 필드 + `setViewMode` action + `ViewMode` 타입 제거** — Zustand store 의 뷰 모드 축 완전 소멸. `useSimStore` 소비자 코드 (`sim-canvas.tsx` / `about-modal.tsx` 등) 에서 viewMode 구독 제거
- **URL `?view=scientific|educational` 파라미터 폐기 (backward-ignore)** — `url-sync.tsx` 에서 `?view=` 경로 제거. 기존 북마크는 파라미터를 조용히 무시하고 단일 모드로 자연 진입 (에러 없음, CRITICAL UX 방어)
- **`html[data-view-mode]` 어트리뷰트 제거** — `apps/web/app/[locale]/layout.tsx` 에서 `data-view-mode="educational"` 제거. CSS / E2E selector 에서 `data-view-mode` 참조 없음 확인
- **`SolarSystemSceneHandles.setViewMode` API 제거** — `packages/core/src/scene/solar-system-scene.ts` 에서 backward-compat 유지하던 deprecated API 완전 소멸. 호출 경로 (`sim-canvas.tsx`) 동반 제거
- **`AboutModal` 단일 모드 컨텍스트 재작성** — 과장 배수 요약 테이블 섹션 제거, "스케일 정책" 섹션 (IAU 실측 고정 + 3단 tier 자동 전환) 추가
- **R1 회귀 가드 CI 통합** — `scripts/verify-no-scientific-grep.mjs` 신규. `packages/` + `apps/` 범위 활성 코드 라인에서 `scientific` 식별자 / 리터럴 재도입 시 exit 1. 주석(역사 맥락) 은 허용. CI `detect-and-test` 에 `R1 회귀 가드` step 추가

#### Reviewer 이관 하드닝 (M1 / m1 / m3)

- **M1 — `setTier` 가 `runTierTransition` cleanup 클로저 저장** (`solar-system-scene.ts`) — 연쇄 전환 race 방지. `pendingTierCleanup` 변수에 이전 cleanup 보관, 다음 전환 진입 시 `pendingTierCleanup?.()` 선행 호출. `tier-transition.test.ts` 에 "연쇄 전환 cleanup 호출" 단위 테스트 3건 추가 (정상 / idempotent / 버그 재현 대조)
- **m1 — visibilitychange JSDoc 문구 완화** (`tier-transition.ts:230-240`) — "fallback timer 와 이중 방어 (defense-in-depth). 둘 중 먼저 도달한 쪽이 release" 로 재작성. 구현-주석 drift 지표로서 정확도 ↑
- **m3 — `TIER_TRANSITION_EASE` module-level const hoisting** (`tier-transition.ts`) — `camera-controller.ts:#easing` 생성자 1회 생성 패턴과 일관성. `ExponentialEase` 는 stateless 하여 공유 안전

#### QA suggestion #1 — C3 측정 방식 교체

- **`scripts/browser-verify-tier-transition.mjs` C3 측정 교체** — 기존 "radius 5프레임 <1% stable" 감지 (ExponentialEase tail + polling IPC 오버헤드 포함) 를 `_alreadyAttached` 폴링 기반 click→reattach 직접 측정 (10ms 폴링, 1500ms 예산) 으로 교체. THRESHOLD 600ms (durationMs=300 + lockMs=500 마진 + 100ms 측정 오차 버퍼). 기존 radius 안정화 기준은 WARN 레벨 부수 지표로 병기

#### 문서 Amendment (D1 / D2 / D3 / D4)

- **D1** — ADR `20260423-display-relative-scale-unification.md` §Amendment 2026-04-23 박제 — Phase A/B/C 실측 결과 + §Concrete Prediction 재현 결과 (3/4 PASS, #3 은 P11-B 시점으로 이월) + Q10 Floating Origin 확정 (간소화 유지, 제거 아님) + QA/Reviewer/developer 이관 항목 처리 결과
- **D1-b** — ADR `20260422-floating-origin.md` §Amendments 1줄 추가 — "P12 에서 역할 축소. T3 body tier primary, T1/T2 no-op"
- **D2** — `docs/principles/fact-first.md` §Amendments 2026-04-23 박제 — 단일 모드 전환으로 `educational`/`scientific` 이중 모드 폐기, §예외 3건은 모든 tier 에 항시 적용, 과장 해제는 billboard marker overlay (P11-B) 로 이관. §"`scientific` 모드 UX 보호" 섹션은 역사 맥락 보존 용으로 유지
- **D3** — `docs/phases/roadmap-v2-solar-precision.md` renumber — P12 Display-Relative Scale Unification (완료) / P13 Texture Pipeline (원 P12) / P14 토성계 (원 P13) / P15 천왕성·해왕성계 (원 P14) / P16 소행성대+카이퍼대 (원 P15) / P17 배포+기술부채 청산 (원 P16). 이력 문서 (`p10-plan.md` / `p10-retrospective.md` / 과거 commit message) 는 retrofit 금지 (당시 판정 맥락 보존)
- **D4** — ADR §Concrete Prediction 재현 결과 표 박제 (ADR §Amendment (b) 에 포함)

#### 회고 문서

- **`docs/retrospectives/p12-retrospective.md`** 신규 — CLAUDE.md 마일스톤 회고 루틴 4섹션 (달성도 / 잘된 것 / 어려웠던 것 / 다음 인수인계). Phase A/B/C 통합 회고 + 후속 이슈 3건 (#305/#306/#307) 경로 박제

### 후속 이슈 (Phase C 에서 분리)

- **#305** — P11-B followup `lowerRadiusLimit` 원복 누락 재검토 (Reviewer m2)
- **#306** — P12 followup `FOCUS_RADIUS_MULTIPLIER` viewport/fov 동적화 (developer suggestion #1)
- **#307** — P12 followup browser-verify focus 버튼 확장 + minZ clamp 작은 body 재검증 + fps HUD 직접 측정 (QA suggestion #2/#3)

### DoD 실측 (P12-C Phase C)

| DoD                             | 상태  | 증거                                                                              |
| ------------------------------- | ----- | --------------------------------------------------------------------------------- |
| R1 `scientific` 활성 코드 hit 0 | PASS  | `node scripts/verify-no-scientific-grep.mjs` — 157 파일 스캔 0 건                 |
| R2 UI 4종 제거                  | PASS  | `rg 'ViewModeSwitcher\|ScaleBadge\|OnboardingTooltip\|ScientificModeNotice'` 0 건 |
| R5 fact-first §Amendment        | PASS  | `docs/principles/fact-first.md` §Amendments 2026-04-23 entry                      |
| M1 연쇄 전환 cleanup            | PASS  | `tier-transition.test.ts` 신규 describe 3건 PASS                                  |
| D1/D2/D3/D4 박제                | PASS  | 각 문서 §Amendment 섹션 박제                                                      |
| 회고                            | PASS  | `docs/retrospectives/p12-retrospective.md` 4섹션                                  |
| typecheck                       | PASS  | `pnpm -r typecheck` 0 errors                                                      |
| 테스트                          | PASS  | `pnpm -r test` 328 tests (core 226 + web 97 + shared 4 + physics 1)               |
| 빌드                            | PASS  | `pnpm build` Next.js 16.2.3 성공                                                  |
| 한글 U+FFFD                     | CLEAN | `pnpm check-encoding` 0 건                                                        |

### auto-close 대상

- **#298** P12 Display-Relative Scale Unification (Phase A/B/C 통합 완결)
- **#288** P11-A Floating Origin (scientific 모드 jitter 해소 목표가 단일 모드 전환으로 근본 원인 소멸)

## [0.11.0] — 2026-04-23

### P11-A Floating Origin + P12-A Tier 엔진 기반 (Display-Relative Scale Unification Phase A)

메인 이슈: #288 (P11-A Floating Origin) / #298 (P12 Scale Unification 계약) · ADR: [`docs/decisions/20260422-floating-origin.md`](docs/decisions/20260422-floating-origin.md) / [`docs/decisions/20260423-display-relative-scale-unification.md`](docs/decisions/20260423-display-relative-scale-unification.md) · 원칙: [`docs/principles/fact-first.md`](docs/principles/fact-first.md)

4 PR 누적 (P11-A + bench remeasure + P12 ADR + P12-A Phase A):

- **PR #291 (P11-A Floating Origin)** — scientific 모드 float32 jitter 해소. camera origin 동적 shift (focus body primary + free-fly 1 AU threshold safety net). Zustand / Rust engine / worldPositions 는 heliocentric 절대 m 유지 (ADR §3 주석 계약). `__floatingOrigin` / `__solarScene.floatingOrigin` 전역 dev 노출. 관련 이슈 #271 closed. 후속 #294 (non-focus fps 30~40% 회귀) / #295 / #296 / #297 분리
- **PR #293 (bench baseline 재측정)** — GH Actions ubuntu × 10 회 median 으로 `docs/benchmarks/baseline.json` 갱신. `bench-baseline-remeasure` workflow dispatch 구조. #225 closed
- **PR #300 (P12 ADR 박제)** — Display-Relative Scale Unification 결정 매트릭스 + 5축 후보 비교 + Concrete Prediction 4건 + Q10 float32 정밀도 수식 + Phase 분리 판정 + 재검토 조건 10건. PM 3 라운드 Q&A 수렴 (명확도 52 → 5/5) + Gemini 교차검증 적용
- **PR #301 (P12-A Tier 엔진)** — `tier.ts` 신규 (182 LoC, Solar/Inner/Body 3단) + `SCENE_UNIT_PER_METER` 동적화 + kind 차등 (`visual-scale.ts`) 폐기. rings/asteroid-belt tier 비율 전파 (host.scaling + per-call 주입). ScaleBadge 거짓 UI 제거 (문구 "실측 비율 1.0" 재정의)

### Behavior Changes

#### P11-A Floating Origin (#291)

- **scientific 모드 jitter 해소** — 목성/해왕성 focus 상태 카메라 pan 시 픽셀 양자화 제거. body 중심이 scene 원점 근처에서 렌더되어 float32 유효숫자 손실 없음
- **Floating Origin primary follow** — focus body 는 매 프레임 scene 원점 근처 (local 좌표 ≤ 1e5 m) 유지. 단, Zustand / Rust engine state 는 Heliocentric 절대값 유지 (정보 패널 거리 표시 변함 없음)
- **safety net 1 AU threshold** — free-fly 탐색 중 카메라 1 AU 이상 이동 시 origin shift. focus 상태에서는 primary 가 우선
- **`SolarSystemSceneHandles` API 확장** — `floatingOrigin` + `setFocusOrigin(bodyId)` 2 field 추가
- **`FloatingOrigin` API 확장** — `setOriginToBody(world)` + `onOriginShift(listener)` 2 메서드 추가 (기존 `update` / `toLocal` / `toWorld` 변경 없음)

#### P12-A Display-Relative Scale Unification 기반 (#301)

- **body 시각 과장 완전 제거** — `educational` 모드의 per-body scale 팽창 (planet ×500, moon ×500, dwarf-planet ×2000, comet ×20000) 폐기. tier 별 실측 `renderScale` 만 적용 — 멀리서 보면 body 가 작아 보일 수 있다 (P11-B billboard marker 도입 전까지 sub-pixel 가능)
- **3단 tier 도입** — `solar` (해왕성 궤도 수용) / `inner` (화성 궤도 수용) / `body` (focus body 중심). 각 tier 별 `renderScaleForTier(tier)` 로 mesh.position / orbit line / sun light 에 동일 배수 적용. kind 별 차등 없음
- **하이브리드 tier 트리거** — focus 있으면 focus body kind 기반 자동 tier, free-fly 시 카메라-원점 거리 stateless 재계산. 히스테리시스 ±15% 로 경계 왕복 방지
- **교차 tier 전환 시 즉시 점프 flicker** — Phase A 는 애니메이션 없음. Phase B (Q8=8D scale + camera.radius 병행 300ms interp) 에서 해소 예정
- **`scene.solar.clearFocus()` / `setTier` / `updateTierByCamera` / `getTier` 공개 API 신설**
- **`setViewMode('scientific'|'educational')` backward-compat 유지** — 렌더 결과에 영향 없음. Phase C 에서 API 제거 예정
- **`ScaleBadge` 문구 재정의** — 기존 "×N 과장 중" → "실측 비율 1.0". Phase A 에서 과장 실제 제거됐으므로 거짓 UI 차단 (dead reference 정리)
- **`SCENE_UNIT_PER_METER = 1/AU` 하드코딩 제거** — 3파일 (`asteroid-belt.ts` / `ring-placeholder.ts` / `ring-shader.ts`) 의 상수 선언 제거, tier 함수 경유로 전환
- **회귀 가드 신규** — `tier-proportion.test.ts` (5건, 비율 불변식) + `scale-badge.test.tsx` (과장/× 재등장 차단 다층)

#### 벤치 baseline 재측정 (#293)

- `docs/benchmarks/baseline.json` 환경 `gh-actions-ubuntu-chromium-headless` 기준 N=10 median 으로 갱신. 이후 CI bench 게이트의 회귀 기준점

### DoD 실측 (P12-A Phase A)

| DoD      | 상태                                       | 증거                                                                 |
| -------- | ------------------------------------------ | -------------------------------------------------------------------- |
| V1/V3    | PASS                                       | browser-verify 해왕성 189/380px, 화성 9/384px                        |
| V5       | WARN → Phase B 이관 (사용자 승인 재조정)   | 지구 2198px / 목표 320±5% — Phase B dolly 에서 해소                  |
| V2/V4/V6 | DEFERRED → P11-B billboard marker (Q-C=C3) | —                                                                    |
| A2/A3    | PASS                                       | tier.test.ts 6건 + tier-lookat.test.ts 4건                           |
| R3/R4/R6 | PASS                                       | visual-scale.ts 폐기 + SCENE_UNIT_PER_METER 0 + engine boundary test |
| 테스트   | 343 PASS / 0 FAIL                          | `pnpm -r test`                                                       |

### 알려진 제한

- **교차 tier 전환 flicker** — Phase A 는 즉시 점프 (ADR 에 사전 합의된 degrade). Phase B (v0.12 예정) 에서 scale+radius 병행 interp 로 해소
- **V5 지구 세로 40% DoD 미충족** — Phase A 는 scale 만 교체 + 카메라 radius 불변 → focus body 과도 확대 (2198px). Phase B 에서 hard fail 승격 예정
- **V2/V4/V6 최소 pixel floor 미구현** — P11-B billboard marker 합산 측정 이관 (Q-C=C3)
- **P11-A non-focus fps 30~40% 회귀** (#294) — Floating Origin 배선 overhead 조사 중
- **scale-badge 존재 유지** — Phase C 에서 완전 제거 예정 (view-mode-switcher / onboarding-tooltip / scientific-mode-notice 포함)
- **Floating Origin 존속 여부 재검토 필요** — Q10. T1/T2 tier 는 float32 정밀도 충분 예측 (ADR §4 수식) → 재설계 완료 시 T1/T2 simplify 후보. T3 primary 는 유지

### 신규 이슈 (v0.11.0 중 분리 / 후속)

- **#288** P11-A Floating Origin (open, Phase C 완료 후 재검토)
- **#294** P11-A non-focus fps 30~40% 회귀 — 배선 overhead 조사
- **#295** browser-verify originOffset assert 범위 완화
- **#296** #271 canvas readback 대체 지표 — headless swiftshader false negative 방어
- **#297** `bench:baseline-remeasure` 로컬 smoke 스크립트
- **#298** P12 Display-Relative Scale Unification (open, Phase B/C 진행 예정)
- **#299** Tier 전환 시 ARIA Live Region 알림 (P12 후속, priority:low)

### 하네스 업데이트

v2.28.1 유지. v0.11.0 범위에서 하네스 수정 없음.

### 다음 마일스톤 (로드맵 v2)

- **v0.12.0 예정 (P12-B)** — Q8=8D scale + camera.radius 병행 300ms interp + 카메라 입력 500ms 잠금. C1/C2/C3/C4 연속성 DoD + V5 hard fail 승격
- **v0.13.0 예정 (P12-C)** — UI 컴포넌트 완전 제거 (ViewModeSwitcher / ScaleBadge / OnboardingTooltip / ScientificModeNotice) + `sim-store.viewMode` 필드 제거 + `fact-first.md` §예외 Amendment + `roadmap-v2-solar-precision.md` renumber (P12~P17 +1) + P11-A Floating Origin T1/T2 simplify (Q10 실측 확정 후)

## [0.10.0] — 2026-04-21

### P10 — Fact-First 원칙 + 데이터 감사 + 사실 모드 UI

메인 이슈: #266 (계약) / #268 (P10-A) / #274 (P10-B) / #278 (P10-C) · 회고: [`docs/retrospectives/p10-retrospective.md`](docs/retrospectives/p10-retrospective.md) · 원칙: [`docs/principles/fact-first.md`](docs/principles/fact-first.md) · 플랜: [`docs/phases/p10-plan.md`](docs/phases/p10-plan.md)

10 PR 분할 릴리스 (CLAUDE.md §Phase 분리 릴리스 리듬):

- **PR #269 + #273 (P10-A 원칙 박제 + Gemini 교차검증)** — `docs/principles/fact-first.md` 박제 + 로드맵 v2 (`roadmap-v2-solar-precision.md`) 재작성 + 모바일 보류 ADR + CLAUDE.md 참조. 2차 Gemini 교차검증 6건 즉시 반영 + 4건 이견 수용 + 1건 분리 (#271)
- **PR #275 + #276 + #277 (P10-B 데이터 감사)** — 타입 확장 (dataSource/lastVerified/colorSource/uncertainty) + IAU 2015 전수 대조 테이블 + 감사 방법론 박제 + `solar-system.json` 9건 수정 + 24 bodies 감사 필드 채움 + CI `verify-and-rust` 에 `verify:iau-data` 회귀 게이트 통합 (0 errors 필수). #274 closed
- **PR #279 + #280 + #281 (P10-C 사실 모드 UI)** — viewMode store (educational/scientific) + URL `?view=` sync + 키보드 `m` + ViewModeSwitcher + scientific 모드 실제 과장 해제 (scaling 500→1) + ScaleBadge + OnboardingTooltip + ScientificModeNotice + AboutModal (IAU/NASA/JPL 크레딧) + info panel 감사 필드 노출. #278 closed
- **PR #283 + #284 (P10-D 정확도 이슈)** — Galilean 4체 JPL Horizons API 재쿼리 (J2000 ecliptic, φ₀=179.69°) + Newton state vector 직접 추출 (forward-diff 폐기, timeScale 내성) + observedFps ref 수정. #261·#263 closed. D5-b amp≤2° 는 tidal force 미모델링으로 #282 scope 재조정 (P11+)
- **PR #285 (P10 회고)** — docs/retrospectives/p10-retrospective.md + 플랜 업데이트 + 벤치 실측 보고

### Behavior Changes

#### 데이터 — IAU 2015 ±0.01% 공차 준수 (P10-B)

- **`packages/shared/data/solar-system.json` 9건 수정** — radius 규약을 IAU equatorial nominal 로 통일 (near-spherical body). jupiter 6.9911e7 → 7.1492e7 (+2.26%), saturn 5.8232e7 → 6.0268e7 (+3.50%), uranus 2.5362e7 → 2.5559e7, neptune 2.4622e7 → 2.4764e7, mars 3.3895e6 → 3.3962e6, phobos 1.1267e4 → 1.108e4, deimos 6.2e3 → 6.27e3, neptune mass 1.0243e26 → 1.02413e26, jupiter mass 1.8982e27 → 1.89813e27. irregular body (Phobos/Deimos/Haumea/3 혜성) 에 `uncertainty` 필수
- **`packages/shared/data/solar-system.json` 24 bodies 감사 필드 자동 추가** — `dataSource` / `lastVerified: "2026-04-21"` / `colorSource` (observed 17 / artistic 4 / inferred 2) + 8 irregular body 에 `uncertainty.{mass, radius}` 상대 오차 박제
- **Galilean 4체 궤도 요소 JPL Horizons API 재쿼리** — frame 을 Laplace plane → J2000 ecliptic 으로 통일. Io/Europa/Ganymede/Callisto 의 λ/ϖ/Ω/e/i/a 전체 2026-01-01 00:00 TDB 값으로 교체. Laplace 공명 인자 φ₀ = 179.6929° (평형점 180° ± 0.31°) 달성
- **`packages/shared/src/constants/solar-system.ts` legacy 상수 2건 IAU 정합화** — SOLAR_MASS 1.98847e30 → 1.98892e30 (IAU B3 §1), JUPITER_RADIUS 6.9911e7 → 7.1492e7 (equatorial)

#### 렌더링 — scientific 모드 실제 과장 해제 (P10-C)

- **scientific 모드에서 `solar-system-scene` per-body scaling 1.0 강제** — IAU 실측 비율 렌더. 기본 educational 모드는 기존 거리-의존 과장 (MAX*VISUAL_SCALE*\*) 유지
- **헤더 우측 `ViewModeSwitcher` 2-버튼 토글** — `data-testid="view-mode-switcher"`, data-mode + `data-view-mode` DOM 어트리뷰트 동기화, 키보드 `m` 단축키 (input/modifier 가드)
- **URL `?view=scientific|educational` 양방향 sync** — nuqs parseAsStringEnum, 디폴트 educational 은 URL 생략. 기존 `?mode=observe|research` 와 key 분리 (계약 재조정, CRITICAL #6 §7)
- **ScaleBadge** 헤더 표시 — focused body kind 별 상한 (`태양 — 시각 크기 최대 ×20 과장 중`) / scientific 모드 (`지구 — 실제 비율 1.0`) / focus 없음 (`시각 과장 모드` / `사실 비율 모드`)
- **OnboardingTooltip** 첫 진입 CTA — "시각 크기 과장 중. [실제 비율로 보기]". localStorage `astro:onboarding-dismissed` 영속 dismiss. scientific 진입 시 자동 skip
- **ScientificModeNotice** `?view=scientific` 최초 진입 시 빈 화면 이탈 방지 배너 — localStorage `astro:scientific-notice-dismissed` 영속
- **AboutModal** 헤더 `?` 버튼 — IAU 2015 / NASA Fact Sheet / NASA JPL / Standish-Williams (1992) 4개 출처 attribution 링크 + 라이선스 + 현재 viewMode 별 정책 안내 + 공차 ±0.01% 명시. Esc / 닫기 / 외부 클릭 닫기
- **CelestialInfoPanel 감사 필드 섹션** — `dataSource` / `lastVerified` / `colorSource` (관측/아티스트/추론) 표시. mass/radius 옆 `uncertainty` ±% 컬럼 (irregular body 한정)

#### 역학 정확도 (P10-D)

- **Galilean 초기 Laplace 인자 φ₀ 평형점 실증** — `test_laplace_initial_phase_equilibrium` (빠른 경로, Rust) 로 179.69° 검증. 기존 218° circulation 상태 해소. 단, 100 Io 주기 적분 후 libration 은 tidal force 미모델링으로 재현 불가 → #282 로 이관
- **Osculating 1Hz polling timeScale 내성화** — `SolarSystemSceneHandles.getBodyState(id, parentId)` 신규 API 로 Newton 엔진 state vector 직접 추출. forward-diff 폐기 → timeScale=86400 기본값에서도 `sat-dynamic-{io/europa/ganymede/callisto}` 배지 4/4 렌더 (browser-verify 16/16 실증)
- **observedFps 의존성 배열 버그 수정** — ADR §Amendments 2026-04-20 박제 버그 완결. `useEffect([..., observedFps])` 가 fps raf 매 frame setState 로 재실행 유발하던 것을 `observedFpsRef` 로 해소

#### CI 회귀 가드 신설

- **`verify:iau-data` CI step** (`ci-physics-wasm.yml::verify-and-rust`) — IAU 2015 ±0.01% 공차 초과 / 감사 필드 (dataSource/lastVerified/colorSource) 부재 시 exit 1 로 PR 머지 차단. 의도적 실패 주입 실증 완료

### DoD 실측

| Sub                | 원 DoD | 달성 | 이관/미달                         |
| ------------------ | ------ | ---- | --------------------------------- |
| P10-A 원칙 박제    | 8      | 8/8  | —                                 |
| P10-B 데이터 감사  | 8      | 8/8  | —                                 |
| P10-C 사실 모드 UI | 8      | 8/8  | —                                 |
| P10-D 정확도 이슈  | 3      | 2/3  | #255 → P13 (J2/J4)                |
| P10-D.5 벤치 회귀  | 3      | 부분 | 환경 mismatch (CI remeasure 필요) |

**30 DoD 중 28 달성 (93%)**.

### 알려진 제한

- **Laplace 공명 libration 재현 불가** — 순수 Newton 다체는 tidal force 미모델링. 실 천체의 조석 에너지 소산 + 공명 barrier 부재로 시뮬은 circulation 으로 발산. 데이터 정확성은 확보 (φ₀ = 179.69° 박제). 후속 #282 (P11+)
- **목성 J2/J4 편평도 세차 미반영** — 현 공차 ±1% 에서는 오차 미검출. #255 P13 (궤도 정밀 보정) 이관
- **scale-badge MAX_SCALE_BY_KIND 인라인 미러링** — core scene import 가 SSR prerender 에서 wasm 로드 시도로 실패. ssr-safe 경로 분리는 후속 이슈
- **로컬 vs CI 벤치 환경 mismatch** — 로컬 macOS headless 측정은 "상대 변화" 관찰용 한정. 공식 회귀 판단은 CI `bench-baseline-remeasure` dispatch 로 ubuntu 재측정 후 확정

### 신규 이슈 (P11+ 후속)

- **#282** tidal force Laplace libration — D5-b amp ≤ 2° 달성 경로
- **#271** float32 jitter (P11 Floating Origin 블로커)
- **#272** iOS 플래그십 모바일 재도전 트리거

### 하네스 업데이트

v2.28.1 (현재) 유지. P10 범위에서 하네스 수정 없음.

## [0.9.0] — 2026-04-20

### P9 — 목성계 (Galilean + Laplace 공명 + 고리 3층 + Osculating 동기화)

메인 이슈: #254 · ADR: [`docs/decisions/20260420-p9-galilean-laplace-rings.md`](docs/decisions/20260420-p9-galilean-laplace-rings.md) · 회고: [`docs/retrospectives/p9-retrospective.md`](docs/retrospectives/p9-retrospective.md)

4 PR 분할 릴리스 (CLAUDE.md §Phase 분리 릴리스 리듬 적용):

- **PR #258 (PR-1 인프라 + Galilean JSON + 고리 placeholder)** — `solar-system.json` 에 Galilean 4체(Io/Europa/Ganymede/Callisto) + Jupiter.rings 3층(Halo/Main/Gossamer) JSON 신설 + zod 스키마 `RingLayerRawSchema` 확장 + `ring-placeholder.ts` 단색 3층 disk
- **PR #260 (PR-2 Rust satellites + M4 장기 테스트 분리)** — `packages/physics-wasm/src/satellites/{laplace,osculating}.rs` 신규 모듈 + 단위테스트 5건 (D1~D4 주기 + D5-a 잔차 + Osculating 왕복) + `extract_osculating_elements` WASM bindgen export + **M4**: 장기 적분 테스트 6건 `#[ignore]` 분리 + CI workflow 빠른/장기 경로 독립 job
- **PR #262 (PR-2.5 고리 shader 3층 + M1 백업)** — `ring-shader.ts` fragment shader 방사밀도 3구간 + `createRingShaderMaterial`/`createRingShaderMesh` 신규 + 수동 플래그 `?ring=fallback`/`?ring=placeholder` + 실 Chrome 3 시나리오 수동 검증 통과 + M1 백업 (SPS 자동 전환)
- **PR-3 (본 PR) TS 통합 + UI + 회고 + v0.9.0** — `use-osculating-sync.ts` 훅 + `satellite-info-panel.tsx` (D8) + `?mass=jupiter×N` URL 핸들러 + ADR §Amendments 3건 + 회고 + 버전 bump

### Behavior Changes

- **sim-canvas 에 목성계 위성 4체 (Io/Europa/Ganymede/Callisto) 자동 렌더** — `?mode=research&focus=jupiter` 에서 목성 주위 Galilean 위성이 JSON 기반 Kepler 해석 요소로 표시. CelestialTree 사이드패널에 `tree-io` / `tree-europa` / `tree-ganymede` / `tree-callisto` 버튼 자동 노출
- **목성 고리 3층 shader 렌더** — Halo (92k~122.5k km) / Main (122.5k~129k km) / Gossamer (129k~226k km) 각 반경별 fragment shader 방사밀도 표현. `?ring=fallback` 으로 InstancedMesh/SPS 전환, `?ring=placeholder` 로 PR-1 단색 disk 복귀 가능
- **Galilean 이심률·경사 UI 패널 (D8)** — `SatelliteInfoPanel` 에 4체 `e` / `i` 값 표시 (`solar-system.json` 바인딩, 하드코딩 금지). `singularity===1` 시 "원순환 근사" 배지
- **Osculating 1Hz polling 훅 인프라** — `use-osculating-sync.ts` 훅 + fps 자동 폴백 (1Hz → 2Hz → 5Hz → 10Hz, 히스테리시스 +5fps). WASM `extract_osculating_elements` wiring 완결. 단 기본 `timeScale=86400` 조건에서 forward-diff velocity noise 로 UI 배지 미렌더 — [#263](https://github.com/coseo12/astro-simulator/issues/263) 이관
- **`?mass=jupiter×N` URL 파라미터 동적 질량** — Newton 엔진 경로에서 씬 물리에 반영 (Io-Jupiter 거리 감소 실측 확인). Osculating UI 반영은 #263 완료 시점까지 정적 JSON 값 표시
- **DoD 물리 검증 CI 가드 6건 추가** — `cargo test` 에 `test_io_period_1pct` / `test_europa_period_1pct` / `test_ganymede_period_1pct` / `test_callisto_period_1pct` / `test_laplace_resonance_residual_1pct` / `test_osculating_roundtrip` 상시 게이트. D5-b (위상 진폭 ±2°) 는 `#[ignore]` + follow-up [#261](https://github.com/coseo12/astro-simulator/issues/261) 이관
- **M4 장기 테스트 분리** — `mercury/yoshida_*_perihelion_*`, `earth/venus_perihelion_eih_*` 6건에 `#[ignore = "long-integration; run with --include-ignored in CI"]` 어트리뷰트. 일상 `cargo test --lib` 경로 완주 시간 **30분+ → 9.27s (≈ 200× 단축)**. CI 장기 경로는 `cargo test --release --lib -- --include-ignored` 독립 job (`continue-on-error: true`)
- **sub-agent 이탈의 프로세스 레벨 확장 교훈** (CLAUDE.md §프로젝트 고유 보강 교훈 추가, [#259](https://github.com/coseo12/astro-simulator/pull/259)) — sub-agent 가 `run_in_background` 로 띄운 프로세스 정리 누락 시 cargo target 디렉토리 경쟁으로 교착 발생. 메인 오케스트레이터 루틴 (`pgrep -f "cargo|next dev|physics_wasm-"` 독립 확인) + sub-agent 마무리 체크리스트 `spawned_bg_pids` 필드 규범화. [volt #52](https://github.com/coseo12/volt/issues/52) 박제

### DoD 실측 (ADR 대비 여유율)

| DoD                        | 계약          | 실측                             | 여유율     |
| -------------------------- | ------------- | -------------------------------- | ---------- |
| D1 Io 공전주기             | ±1%           | PASS                             | —          |
| D2 Europa 공전주기         | ±1%           | PASS                             | —          |
| D3 Ganymede 공전주기       | ±1%           | PASS                             | —          |
| D4 Callisto 공전주기       | ±1%           | PASS                             | —          |
| D5-a Laplace 잔차          | ±1%           | **0.00024**                      | 41×        |
| D5-b 위상 진폭             | ±2°           | **이관 (#261 데이터 교정)**      | —          |
| D6 고리 3층 shader         | 가시          | PASS (실 Chrome 6 스크린샷)      | —          |
| D7 Osculating 동기화       | 1Hz polling   | **인프라 완결 / UI 이관 (#263)** | —          |
| D8 이심률·경사 UI          | JSON 바인딩   | PASS                             | —          |
| M4 cargo fast path         | ≤5분          | **9.27s**                        | **32×**    |
| cargo include-ignored path | 독립 job 분리 | **216.9s**                       | CI 병렬 OK |
| fps baseline (실 Chrome)   | ≥55fps        | **평균 59.98 / 최소 59.75**      | 60fps 유지 |

### 알려진 제한 (스프린트 계약 재조정 박제, CLAUDE.md §7 세 위치 완결)

- **D5-b 위상 진폭 ±2°** — `measure_laplace_resonance()` 측정 도구 정상이나 PR-1 에서 박제한 JPL Galilean 초기 조건의 Laplace 인자 φ₀ = 218° (이론 평형점 180° 대비 38° 벗어남) → circulation 상태로 libration 재현 불가. 측정법 검증 우선 원칙 (CLAUDE.md §스프린트 계약 10) 충실 수행 후 데이터 교정 분리. 해결은 `solar-system.json` Galilean 4체 `meanLongitudeDeg` JPL Horizons 재쿼리 → [#261](https://github.com/coseo12/astro-simulator/issues/261) 이관
- **D7 Osculating UI 동적 표시** — 훅 인프라 완결 / `?mass=jupiter×N` 씬 물리 반영 정상이나 `timeScale=86400` 기본값에서 forward-diff velocity noise 과다로 UI 배지 미렌더. 해결은 Babylon 씬 저장 velocity state vector 직접 추출 (forward-diff 폐기) → [#263](https://github.com/coseo12/astro-simulator/issues/263) 이관. v0.9.0 은 정적 JSON 값 표시
- **Osculating shader `onError` 비동기 폴백 미구현** — `ring-shader.ts` 는 동기 exception 경로만 M1 자동 전환. 비동기 `onError` 는 기록만 수행. 수동 `?ring=fallback` 은 정상. ADR §재검토 조건 #5 에 위임

### 후속 OPEN

- [#261](https://github.com/coseo12/astro-simulator/issues/261) (P9-followup, priority:medium) — Galilean 초기 조건 φ₀ = 218° → 180° 데이터 교정 + D5-b 재개
- [#263](https://github.com/coseo12/astro-simulator/issues/263) (P9-followup, priority:medium) — Osculating 속도 추정 timeScale 내성화 (forward-diff → 씬 state vector 직접 추출)
- [#245](https://github.com/coseo12/astro-simulator/issues/245) / [#246](https://github.com/coseo12/astro-simulator/issues/246) (P8-followup, priority:low) — 위성 줌 토글 / 클릭 정보 패널 인터랙션
- [#255](https://github.com/coseo12/astro-simulator/issues/255) (P9-followup, priority:medium) — 목성 J2/J4 편평도 세차
- [#256](https://github.com/coseo12/astro-simulator/issues/256) / [#257](https://github.com/coseo12/astro-simulator/issues/257) (P9-followup, priority:low) — 장기 적분 에너지 보존 DoD / 고리 shader 섀도우 매핑

## [0.8.0] — 2026-04-19

### P8 — 내행성계 위성 정밀화 (포보스·데이모스·달 교점역행)

메인 이슈: #244 · ADR: [`docs/decisions/20260419-satellite-orbit-hybrid.md`](docs/decisions/20260419-satellite-orbit-hybrid.md) · 회고: [`docs/retrospectives/p8-retrospective.md`](docs/retrospectives/p8-retrospective.md)

3 PR 분할 릴리스 (CLAUDE.md §Phase 분리 릴리스 리듬 적용):

- **PR #248 (PR-1 인프라 + #242 선행)** — `scripts/bench-scene.mjs` vsync 페그 해소 + `solar-system.json` 포보스/데이모스 2종 엔티티 추가 + `solar-system-loader.test.ts` 가드 + `time-reversal.test.ts` 9체 의도 보존 필터
- **PR #250 (PR-2 Rust 측정 헬퍼)** — `packages/physics-wasm/src/nbody.rs` `measure_moon_orbital_period` / `measure_node_regression_period` 헬퍼 2종 + 단위테스트 3건 (phobos/deimos/lunar_node). Gemini 교차검증 수용 (상대 좌표계 + Nyquist smoothing)
- **PR-3 (본 PR) TS 통합 + 회고 + v0.8.0 릴리스 준비** — ADR 예측대로 sim-canvas 코드 변경 0 라인 (기존 `parentId` + `updateAtKepler` 재사용). 회고 + CHANGELOG + 버전 bump.

### Behavior Changes

- **sim-canvas 에 화성 위성 2종 (포보스/데이모스) 자동 렌더** — `?mode=research` 에서 화성 주위 위성이 JSON 기반 Kepler 해석 요소로 표시. 렌더 코드 라인 추가 0 (기존 `parentId=mars` 체인 재사용). CelestialTree 사이드패널에 `tree-phobos` / `tree-deimos` 버튼 자동 노출, 클릭 시 focus 카메라 전환 동작 (실측 L2 PASS)
- **DoD 물리 검증 CI 가드 3건 추가** — `cargo test` 에 `test_phobos_period_1pct` / `test_deimos_period_1pct` / `test_lunar_node_regression_5pct` 상시 게이트. 측정 실패 시 릴리스 차단. WASM 런타임 번들 delta 0 bytes (`#[cfg(test)]` 격리)
- **9체 `time-reversal.test.ts` 명시 필터** — 포보스 주기 7.65h × dt=10min 의 per-step 1/45 period 누적 오차가 기존 1e-9 임계를 초과하여 화성 위성 명시 필터. 원 9체 대칭성 의도 보존. 위성 자체의 시간 역행 검증은 PR-2 `measure_moon_orbital_period` 로 대체
- **bench-scene vsync 페그 해소 (PR-1)** — `--disable-frame-rate-limit` + `--disable-gpu-vsync` 플래그. 머지 직후 baseline 재측정 자동 PR 생성. 기존 baseline 대비 양의 Δ 관찰 예상 (uncapped FPS)

### DoD 실측 (ADR 대비 여유율)

| DoD                   | 계약 | 실측        | 여유율 |
| --------------------- | ---- | ----------- | ------ |
| 포보스 공전주기       | ±1%  | **0.087%**  | 11.5×  |
| 데이모스 공전주기     | ±1%  | **0.032%**  | 31×    |
| 달 교점역행 주기      | ±5%  | **4.45%**   | 1.12×  |
| WASM 번들 delta       | +2KB | **0 bytes** | —      |
| cargo test 시간 delta | +45s | **+18s**    | 2.5×   |

### 후속 OPEN (priority:medium)

- #245 위성 줌 토글 (`?satellites=zoomed` 옵트인) — 위성이 실 스케일에서 서브픽셀, 탐색 UX 보강
- #246 위성 클릭 정보 패널 — celestial-info-panel 에 궤도 요소 표시
- #247 Osculating elements 동적 동기화 파이프라인 — 질량 변경 시 위성 무반응 (Gemini 교차검증 고유 발견, 정적 Kepler 한계). P9/P13 후보
- #251 bench-scene 다회 샘플링 + `stdev_ratio` 필드 (#242 DoD 일부 open 유지)

### 알려진 제한

- `?focus=<moon|phobos|deimos>` URL 직접 진입 시 카메라 focus 는 동작하나 CelestialTree 사이드패널 active 토글은 미연동. 기존 동작과 동일 (#246 클릭 정보 패널 범위). **PR-3 퇴행이 아님**.

## [0.7.1] — 2026-04-19

### Behavior Changes: None — 문서/인프라/정적 에러 해소만

P7-E 후속 follow-up 5건 중 4건 완결 + pre-existing 정적 에러 2건 해소.
앱 런타임 / 물리 식 / 기본 bench 동작 모두 불변.

**#224 #226 P7-E follow-up 문서·주석·회귀 가드** (PR #233)

- `docs/retrospectives/p7-retrospective.md`: `22개`/`21개` → 실측 15개 (편집 14 + utils 1) 정정
- `§어려웠던 것 #6 numeric accuracy` 신설 — "회고·PR 에 개수/비율 기재 시 실측 후 기재" 원칙 박제
- `apps/web/src/core/parse-gr-mode.test.ts` 사용자 실수 케이스 (on/true/gr/0/2/eih1pn/single1pn) 회귀 가드 +7 케이스
- `apps/web/src/store/sim-store.ts` `__simStore` `configurable:true` HMR 근거 + `defineProperty` 사용 이유 주석 박제
- `docs/decisions/README.md` §Amendments 표준 포맷 신설 (갱신 이력 테이블 컬럼 고정)
- `docs/decisions/20260418-p7-integrator-upgrade.md` Phase C 진단 + CI 임계 2건 §Amendments 소급 시범 적용

**#223 bench-p7-lens3d vsync 페그 해소 + DoD 재조정** (PR #234)

- 원인: headless chromium RAF 상한(120Hz vsync) 으로 측정값 stdev ≈ 0 (ray3d 연산 부하 미반영)
- `scripts/bench-p7-lens3d.mjs` launch args 에 `--disable-frame-rate-limit` + `--disable-gpu-vsync` 추가
- `pressTimePlay` import (`skipIfAbsent:true` — `?bh=2&ray3d=1` 기본 자동 재생 회귀 가드 목적)
- 리포트 JSON 에 `stdev_ratio = stdev/avg` 필드 신설 (GPU 속도 독립 지표)
- **DoD 재조정** (사용자 합의): `stdev_ms > 0.5ms` → `stdev_ratio > 1%` (M1 Pro Metal ~1200fps 에서 절대 stdev 원천 도달 불가)
- 3위치 박제: 이슈 #223 body / 스크립트 주석 / PR 본문
- 새 baseline: `docs/benchmarks/p7-lens3d-2026-04-19T04-03-10-225Z.json` (avg 0.920ms · stdev_ratio 2.61% · fps 1088)

**#225 baseline 재측정 workflow + median aggregator (설계 PR)** (PR #238)

- `.github/workflows/bench-baseline-remeasure.yml` 신설 — `workflow_dispatch` 수동 트리거, plan → bench (matrix N 병렬) → aggregate (median + PR 자동 생성) 3 job
- `scripts/bench-aggregate-median.mjs` (의존성 0, stand-alone) — 여러 회차 JSON 을 median 으로 집계
- `scripts/bench-aggregate-median.test.mjs` 회귀 가드 **8/8 PASS**
- `docs/benchmarks/README.md` 재측정 절차 문서화
- 도구 도입만 — 실제 baseline 갱신은 본 릴리스 후 사용자 수동 트리거 → 자동 PR

**#236 #237 pre-existing typecheck/lint 해소** (PR #239)

- `packages/core/src/gpu/nbody-force-shader.test.ts`: `noUncheckedIndexedAccess` TS2532/TS2345 해소 (non-null assertion, Float32Array 길이 6 정적 보장)
- `apps/web/src/components/panels/black-hole-disk-panel.tsx`: `useState + useEffect + window.location.search` → `nuqs useQueryState('bh')` (url-sync 패턴 일관, react-hooks/set-state-in-effect 해소)
- 브라우저 smoke: `?bh=2&mode=research` panel visible=true 회귀 없음 확인

### 후속 OPEN (priority:low)

- #219 iOS Safari 실기기 bench (P14 배포 이후)
- #235 vsync 우회 플래그 다른 bench 스크립트로 확산

## [0.7.0] — 2026-04-18

### P7 — 트랙 B 3D ray + 적분기 격상 (Yoshida 4차)

**P7-A Yoshida 4차 심플렉틱 적분기 + Phase C 측정법 개선** (#206, PR #212)

- `packages/physics-wasm/src/integrator.rs` 신규 — Yoshida 1990 4차 심플렉틱
- `IntegratorKind` enum (VelocityVerlet / Yoshida4) + `set_integrator(u8)` bindgen
- EIH 가속도 본체 **불변** — 적분기만 감쌈
- **Phase C 측정 방식 개선**: LRL 벡터 + Newton baseline subtraction 도입
  - P6-D `min_r` 샘플링 노이즈 제거 → 진짜 수렴값 확인
  - 수성 0.11% / 지구 1.19% (3c) / 금성 1.39% (10c) rel_err 확정
  - Kepler 2체 5000 orbit drift **1.87e-13** (DoD 1e-10 대비 3자리 여유)
- WASM gzipped 16.36 → 16.71 KB (+0.35KB, 상한 +2KB 대비 17% 소진)
- ADR: `docs/decisions/20260418-p7-integrator-upgrade.md`

**P7-B 적분기 선택 API + URL 옵트인** (#207, PR #216)

- `packages/core/src/physics/nbody-engine.ts` — `IntegratorKind` union literal (TS) + `INTEGRATOR_TO_U8` (Rust 1:1)
- `apps/web/src/core/parse-integrator.ts` — URL 파서 (`verlet`/`velocity-verlet`/`yoshida4`), invalid → VV 폴백
- 기본값: `velocity-verlet` (Yoshida 옵트인 `?integrator=yoshida4`)
- E2E: `scripts/browser-verify-integrator.mjs` (정적 / URL 전환 / `?gr=eih&integrator=yoshida4` 5초 재생)

**P7-C 트랙 B 3D ray construction — 5차 D' 보강 채택** (#208, PR #217, PM M1 백업 경로)

- P6-B 3회 실패 후 P7-C 에서 5단계 순차 재시도:
  - 1차(A) 단일 invViewProj + 알파 fix — WebGL2 GLSL prelude 에러로 실패
  - 2차(C) 분리 invView/invProj (thinSSRPostProcess 패턴) — 동일 증상
  - 3차(E) **Frustum Corner Interpolation (Gemini 교차검증 고유 발견)** — 셰이더 컴파일 성공 + lensing 왜곡 성공, 하지만 실 Chrome 검증에서 disk mask 실패 확인
  - 4차(B) WGSL mat4_invert — 미진입
  - **5차(D) D' 보강**: `diskAxisX/Y` 를 world disk major axis 의 화면 투영 방향으로 대체 — 카메라 회전 시 disk 타원 장축 화면 내 회전
- 3차(E) 코드는 `?ray3d=1` 실험적 경로로 보존 (lensing 효과 자산)
- ADR: `docs/decisions/20260418-p7-track-b-ray3d.md` (Accepted as permanent approximation, Path 5)
- 선행 ADR `20260417-accretion-disk-shadow-pipeline.md` §재검토 트리거 발동 기록

**P7-D 모바일 best-effort 실측** (#209, PR #218)

- Playwright Chromium iPhone 14 emulation
- `engineNotice` 구조 전환: `string | null` → `{ key: string; message: string } | null` + `dismissedNoticeKeys` (key-scoped dismiss)
- `isMobile && !navigator.gpu` 경고 노티 (best-effort 정책)
- **A/B 교차 bench**: VV 1352.86 fps / Yoshida4 1383.75 fps (**ratio 1.054**, 임계 ≥0.90)
- 신규: `scripts/browser-verify-mobile-p7d.mjs`, `scripts/bench-scene-mobile.mjs`

**P7-E bench 컬럼 + 회고 + P6 가드 + 후속 흡수** (#210, PR #222, closes #215/#220/#221)

- E1 bench: `integrator_yoshida4_ms` (0.0002 ms/step, 1.59× VV) + `track_b_ray3d_frame_ms` (8.331 ms, M1 Pro WebGPU)
- E3 회고: `docs/retrospectives/p7-retrospective.md` (4섹션 + v2 로드맵 참조)
- E4 P6 가드: `apps/web/next-env.d.ts` .gitignore + `git rm --cached`
- 흡수 #215: ADR §재검토 트리거 §4 갱신 (>7분 → >11분, 실측 기반)
- 흡수 #220: `apps/web/src/core/is-mobile.ts` (iPadOS 13+ desktop UA `Macintosh + maxTouchPoints > 1` 감지)
- 흡수 #221: `__simStore` dev-only 전역 노출 (prod 번들 DCE 검증) + 시나리오 4 재작성
- 흡수 QA 이관 3건:
  - `scripts/browser-verify-utils.mjs` 신규 공통 유틸 (`pressTimePlay`, `hasSimErrors`)
  - 22개 browser-verify-\*.mjs 의 `time-play` silent-fail 패턴 + NaN regex 일괄 정비
  - `apps/web/src/core/parse-gr-mode.ts` (`?gr` 대소문자 정규화)

### 검증

- pnpm test **252/252** PASS (shared 4 + physics-wasm 1 + core 163 + web 84)
- cargo test --release **37 passed** (lib) + 2 (barnes_hut)
- 브라우저 3단계 검증 전부 PASS (실 Chrome 수동 + 에뮬레이션)
- WASM gzipped 16.71 KB (P6 대비 +0.35KB)
- Rust 본체 P7-B/C/D/E 전부 무수정 — P7-A에서만 integrator 추가

### 후속 이슈 (모두 priority:low)

- #219 iOS Safari 17.4+ 실기기 bench 수동 측정 (P14 배포 후)
- #223 `bench-p7-lens3d.mjs` `pressTimePlay` 도입 (120Hz vsync 페그 해소)
- #224 PR #222 본문/회고 '22개/21개' 수치 정정
- #225 `bench:scene:sweep` focus-earth/neptune baseline 재설정
- #226 Reviewer 후속 3건 (parseGrMode regex / `__simStore` configurable / ADR §Amendments)

### 이전 릴리스

- v0.6.1 (2026-04-18) — long-term-drift 테스트 타임아웃 방어
- v0.6.0 (2026-04-17) — P6 물리 심화 (중력렌즈 3D + EIH 1PN 다체)

## [0.6.1] — 2026-04-18

### 테스트 안정화

**long-term-drift 타임아웃 방어** (#203, closes #199)

- `packages/core/src/physics/long-term-drift.test.ts` — 두 `it()`에 `testTimeout: 30_000ms` 명시
- 재현 조사: main 단일 실행 1.31s / core 전체 163/163 PASS — **선재 회귀 아님**
- 100년 9체 Newton 적분은 단독 ~1.3s이나 병렬/CI 부하 시 vitest 기본 5s 초과 가능 → 안정성 확보 목적의 방어 조치
- `LONG_INTEGRATION_TIMEOUT_MS` 상수 추출 + 이유 주석

## [0.6.0-p6] — 2026-04-17

### P6 물리 심화 — 중력렌즈 고도화 + EIH 1PN 다체

**P6-A Schwarzschild geodesic RK4 솔버** (#194)

- `packages/physics-wasm/src/geodesic.rs` 신규 — 광선 1차 ODE `d²u/dφ² + u = 3M·u²` + 단순 RK4 + r-기반 step
- `GeodesicOutcome::{Escaped, Captured}` 분류, invariant 보존 측정
- 단위 테스트: weak-field b=50 Rs deflection rel_err **3.52%**, strong-field b=3 Rs rel_err **0.05%** (Iyer-Petters 2007 기준)
- invariant drift **~1e-14** (한계 1e-4, 10¹⁰ 배 여유)
- ADR: `docs/decisions/20260417-geodesic-solver.md`

**P6-B accretion disk + LUT shadow (D' 변형)** (#195)

- WASM bindgen `build_lensing_lut(samples) -> Vec<f32>` 신규 (flat `[outcome, deflection] × samples`)
- 신규 PostProcess `packages/core/src/scene/black-hole-rendering.ts` (WGSL/GLSL 듀얼)
- URL `?bh=2` 옵트인 (P5-D `?bh=1` 보존)
- 5 UI 파라미터 슬라이더 (Inner/Outer/Eccentricity/Thickness/Tilt)
- ADR D' 변형 박제 — 원안 3D ray construction → 화면공간 b/Rs + LUT (Babylon invViewProj 이슈로 후퇴, 3D 복원은 #196 후속)
- 알파 채널 fix (신규 원인 #4 식별): `vec4f(result.rgb, 1.0)` WGSL/GLSL 일관 — P5-D는 우연히 회피했던 패턴
- ADR 2건: `20260417-accretion-disk-shadow-pipeline.md`, `20260417-gravitational-lensing-pipeline.md` (P5-D Superseded)

**P6-C EIH 1PN 다체** (#197)

- `GrMode` enum (Off / Single1PN / EIH1PN) — 동시 활성 모순 차단
- WASM `set_gr_mode(u8)` 신규 + `set_gr(bool)` 호환 wrapper 보존
- `nbody.rs` 인라인 EIH 가속도 (Will eq. 6.80, harmonic gauge)
- URL: `?gr=eih` 신규 + `?gr=1`/`?gr=1pn` 호환 + `?gr=invalid` → off + warn
- 단위 테스트: 2체 한계 동치, 9체 100년 drift < 1e-6/orbit
- ADR: `docs/decisions/20260417-eih-1pn-multibody.md`

**P6-D 행성 근일점 ±5% 검증** (#198)

- `measure_perihelion_precession_eih(name, mass, a, e, period, expected, tol_pct)` 헬퍼 추출 (수성 하드코딩 → 일반화)
- **수성 42.59″** (rel_err 0.90%), **금성 8.67″** (rel_err 0.63%), **지구 3.74″** (rel_err 2.48%) — 모두 ±5%
- dt=2.5s 5단계 폴백 (60s → 30s → 15s → 7.5s → 5s → 2.5s) 끝에 통과 — RK4 정밀도 한계
- 수성 41.46″/century Single 모드 회귀 가드 무수정 보존
- ADR: `docs/decisions/20260417-perihelion-verification.md` (Park 2017 인용)

**P6-E bench + ADR + 회고 + 중복 방지 가드** (#200)

- `scripts/bench-p6e.mjs` — geodesic_ms sweep {64/256/1024} + eih_1pn_ms (N=9, 1000 step 평균)
- 실측: geodesic 7.78/30.88/121.32 ms, eih_1pn 0.0042 ms/step
- `scripts/check-duplicate-functions.mjs` + pre-commit + CI warn-only — P5 회고 `stateVectorAt` 중복 교훈 도구화
- 정규화 토큰 교집합 ≥ 2 + 도메인 stop list + 회귀 픽스처 13/13
- ADR: `docs/decisions/20260417-duplicate-function-guard.md`
- 회고: `docs/retrospectives/p6-retrospective.md`

### 후속 추적

- **#196** — 트랙 B 3D ray construction (invViewProj) + `?bh=2` silent failure 디버깅
- **#199** — `long-term-drift.test.ts` 5s timeout 선재 (P6-E 회귀 아님, 타임아웃 완화 후보)

## [0.5.0-p5] — 2026-04-17

### P5 일반상대론 + 중력렌즈 + 실기기 + 측정 도구

**P5-E bench baseline** (#181)

- v0.4.0 bench 결과 스냅샷 (`baseline-v0.4.0.json`)
- `bench:scene:set-baseline --compare <tag>` 비교 기능

**P5-B 실기기 iPhone 측정** (#182)

- iPhone 12 mini (A14/iOS 26.3.1) 직접 측정: N=200 **60fps**, N=10000 **40~50fps** 크래시 없음
- fps HUD 카운터 (`?fps=1` URL 옵트인) — SimulationCore에서 `engine.getFps()` 0.5초 emit
- WebGPU 미지원 (A14) → WebGL2 폴백 정상
- `next.config.mjs` allowedDevOrigins 추가

**P5-A 일반상대론** (#183)

- Rust NBodySystem에 1PN Schwarzschild 세차 보정항: `a_GR = (GM/(c²r³))[(4GM/r - v²)r + 4(r·v)v]`
- 수성 근일점 세차 **41.46″/century** (이론 42.98″, 오차 3.5%, DoD ±5% 충족)
- WASM `set_gr()/gr_enabled()` + TS `NBodyEngineOptions.enableGR` + URL `?gr=1`
- ADR: `docs/decisions/20260417-general-relativity-1pn.md`

**P5-C GPU compute shader별 세분화** (#184)

- `ComputeShader.gpuTimeInFrame: WebGPUPerfCounter`로 force/integrator 분리 측정
- `WebGpuNBodyEngine.readShaderTimings()` → `{forceMs, integratorMs}`
- `engine.enableGPUTimingMeasurements = true` 활성
- bench에 force_ms/integrator_ms 컬럼 + `window.__gpuShaderTimings` 노출

**P5-D 중력렌즈 시각화** (#185)

- Schwarzschild 블랙홀 PostProcess WGSL fragment shader
- 궤도선 왜곡 + Einstein ring (파란 글로우) + event horizon 흑색
- dual shader path (WGSL for WebGPU, GLSL for WebGL2)
- URL `?bh=1&bhx=N&bhy=N&bhz=N` 옵트인
- WGSL `textureSample` uniform control flow 제약 → branchless `step()/mix()` 해결
- ADR: `docs/decisions/20260417-gravitational-lensing-pipeline.md`

## [0.4.0-p4] — 2026-04-16

### P4 WebGPU 실측 + 모바일 1차 게이트

**P4-B WebGPU 활성 회귀 가드** (#168)

- EngineFactory 전환 **NO-OP** 결정 — `docs/decisions/20260416-engine-factory-no-op.md`
- `scripts/browser-verify-webgpu.mjs` 신규 — HUD `renderer · webgpu` assert, capability notice 미표시, reload 후 경로 유지 (5/5 통과)
- `--enable-unsafe-webgpu` 외 flag 명시 — 헤드리스 기본값 의존 제거

**P4-D GPU frame time 직접 측정** (#169)

- `SimulationCore.enableGpuTimer()` / `readGpuFrameTimeMs()` / `debugGpuTimer()` 공개 API
- `EngineInstrumentation.gpuFrameTimeCounter` 기반 ms 단위 측정 (lastSecAverage → average → current 폴백)
- `?gpuTimer=1` URL 옵트인 시 `window.__gpuFrameTimeMs` getter 노출
- `engine-factory.ts` — WebGPUEngine 생성 시 `timestamp-query` feature optional 요청
- `scripts/bench-webgpu.mjs` — GPU ms 컬럼 + `--enable-webgpu-developer-features` flag 추가

**P4-A 소행성대 N-body 편입** (#170)

- `?beltNbody=1` URL 옵트인 — 소행성대를 N-body 엔진에 편입
- **실측 WebGPU 226× @ N=5000, 286× @ N=10000** (vs barnes-hut CPU)
- `AsteroidBeltHandles.getNbodyState()` / `writeWorldPositions()` 추가
- `scripts/browser-verify-belt-nbody.mjs` — 3단계 회귀 가드 (6/6 통과)
- bench throughput ≥ 2× assertion 추가 (exit 1 on fail)

**P4-C 모바일 1차 게이트** (#171)

- `scripts/browser-verify-mobile-p4c.mjs` — iPhone 14 emulation 3 시나리오 (5/5 통과)
- 결과 리포트 자동 생성 (`docs/reports/p4c-mobile-YYYYMMDD.md`)
- 실기기 iPhone Safari 측정은 인계 (iOS 17.4+ WebGPU)

**회고** (#172)

- `docs/retrospectives/p4-retrospective.md` — 고정 4섹션
- P4-E(일반상대론) P5로 분리

### 수치 변화

- bench: WebGPU/BH = **0.45×(P3) → 226×(P4)** (소행성대 N-body 편입으로 가속 실제 측정 가능)
- 테스트: 287 → 290+ (GPU timer + state vector 가드 추가)
- 회귀 스크립트: +3종 (`verify:webgpu`, `verify:belt-nbody`, `verify:mobile-p4c`)

## [0.3.0-p3] — 2026-04-15

### P3 Barnes-Hut + WebGPU compute

**P3-0 준비**

- WebGPU 감지 + 자동 폴백 (`detectGpuCapability`, HUD dismissible notice) (#124)
- `bench:scene:sweep` N=5000/10000 확장 + CI bench 워크플로 timeout 30분 (#125)
- Engine selector 4-mode 확장 (`kepler|newton|barnes-hut|webgpu|auto`) (#126)

**P3-A Barnes-Hut (Rust/CPU)**

- Octree 데이터 구조 — flat `Vec<Node>`, leaf cap=1, MAX_DEPTH=24 (#130)
- COM + Salmon-Warren MAC tree-walk force (theta=0.5 max err **4.99e-9**) (#131)
- WASM `BarnesHutEngine` 노출 + Velocity-Verlet 통합 (#132)
- 1년 시뮬 정확도 검증 — Newton 직접합 대비 P3 계약 1e-3의 6 자릿수 여유 (#133)
- UI 활성화 + auto 모드 라우팅 (belt N≥1000 → barnes-hut) (#134)

**P3-B WebGPU compute**

- WebGPU compute 인프라 — `GpuComputeContext`, `GpuFloat32Buffer`, WGSL helpers (#143)
- N-body force WGSL shader — `workgroup_size=64` tiled algorithm (#144)
- V-V 적분 ADR + WGSL shader (`docs/decisions/20260415-webgpu-integration-scheme.md`, B 스킴 GPU-resident) (#145)
- `WebGpuNBodyEngine` JS 어댑터 + scene 라우팅 + UI 활성화 (capability 자동 폴백) (#146)
- 정확도 가드 + `bench:webgpu` 측정 도구 + p3b-perf.md (#147)

**P3-D 검증·마감**

- vsync 해제 throughput 측정 (`--disable-gpu-vsync` flag) — 가속비 측정 한계 박제 (#154)
- 종합 회귀 검증 287/287 통과 (Rust 22 + vitest 211 + browser-verify 54) (#155)
- v0.3.0 릴리스 (#156)

**아키텍처/데이터:**

- 신규 패키지 모듈: `packages/core/src/gpu/` (compute-context / buffer / wgsl-helpers / nbody-force-shader / nbody-vv-shader / capability)
- 신규 엔진: `BarnesHutNBodyEngine` (CPU/wasm) + `WebGpuNBodyEngine` (GPU)
- `PhysicsEngineKind`: `kepler|newton|barnes-hut|webgpu|auto` 5-mode
- harness v2.2.0 → v2.3.0 적용 (신규 페르소나 커맨드 7종 + ADR/회고 디렉토리)

**Known Issues / 인계:**

- WebGPU 가속비 측정 환경 한계: 헤드리스 Chromium ANGLE Metal에서 Babylon이 WebGL2 fallback 사용. webgpu URL은 capability 폴백으로 barnes-hut 라우팅. 실 측정은 데스크톱 Chrome Canary 또는 Babylon `useWebGPU: true` 명시 필요.
- 소행성대가 Kepler 해석해 + ThinInstances 렌더로 처리됨 — N-body 엔진 입력은 ~10 bodies. 'CPU 대비 webgpu ≥2× 가속'은 소행성대 N-body 통합(P4 후보) 후 재측정.
- WGSL f32 한정 정밀도 — 행성 SI 좌표(~1e11 m)에서 ~10km 단위 손실. 정밀 시뮬은 CPU 경로(`NBodySystem` f64) 사용.

**문서:**

- `docs/decisions/20260415-webgpu-integration-scheme.md` (ADR)
- `docs/benchmarks/p3a-barnes-hut-accuracy.md`, `p3a-perf.md`, `p3b-perf.md`, `p3d-comprehensive-verify.md`
- `docs/retrospectives/harness-update-2.2.0-retrospective.md` (P3 진행 중 회고)

## [0.2.0-p2] — 2026-04-15

### P2 태양계 확장 + Newton N-body

**P2-0 준비**

- PR 템플릿 브라우저 3단계 검증 필수 섹션 (#74)
- `verify:test-coverage` 워크스페이스 Vitest 가드 (#75)
- `updateAt` 프레임당 Map 재할당 제거 (#76)
- orbit 라인 LineSystem 통합 — draw call 9→1 (#77)
- `bench:scene` 자동 벤치 + baseline diff (#78)

**P2-A Newton N-body**

- `@astro-simulator/physics-wasm` 신규 크레이트 — Rust 1.94.1 + wasm-pack 0.14 (#84)
- Velocity-Verlet(Leapfrog) 적분기 — 1000년 에너지 드리프트 2.4e-9 (#85)
- WASM ↔ TS 바인딩 `NBodyEngine` + 씬 통합 (#86)
- Kepler 대비 정확도 검증: dt=10min 모든 행성 < 0.1% 오차 (#87)
- 시간 역행 대칭성 < 1e-9 상대 오차 (#88)
- Kepler↔Newton UI 토글 + URL `?engine=newton` (#89)

**P2-B 소천체 + 시각 스케일**

- 왜소행성 5개 (Ceres/Pluto/Haumea/Makemake/Eris) (#97)
- 혜성 3개 (Halley/Encke/Swift-Tuttle) (#98)
- 소행성대 ThinInstances `?belt=N` N=100~1000 (#99)
- 거리-의존 per-body 시각 스케일 — P1 Moon 버그 해결 (#100)

**P2-C 파라미터 + 북마크**

- 선택 천체 질량 슬라이더 0.1~10× (Newton 런타임 반영) (#107)
- 시간 포함 URL 북마크 버튼 (#108)
- "만약에" 프리셋 3종: jupiter-x10 / no-jupiter / sun-half (#109)

**P2-D 검증·마감**

- 장기 안정성: 9체 100년 드리프트 1.5e-10 (#115)
- 실 GPU(Apple M1 Pro): N=1000 소행성대에서 120 fps 달성 (#116)
- a11y 재검증 + MassSlider aria-label / Canvas tabindex 수정 (#117)

**아키텍처/데이터:**

- 바디 10 → **18** (sun + 8행성 + moon + 왜소행성 5 + 혜성 3)
- `NBodyEngine` 래퍼: `buildInitialState` + `advance(dtSeconds)` + 역행
- scene 옵션: `physicsEngine`, `asteroidBeltN`, `setBodyMassMultiplier`

**테스트 증분:** P1 139 → **P2 187 PASS** (core 128 + apps/web 54 + shared 4 + physics-wasm 1)

**성능:**

- 헤드리스 fps 감소(콘텐츠 추가 반영분, -16~20%)
- 실 GPU에서 N=1000까지 120fps vsync cap 도달

**알려진 제약:**

- 소행성대는 Kepler 전용 — Newton 합류 시 O(N²) 폭발. P3 GPU compute에서 재검토
- macOS Chromium만 실 GPU 측정 — Linux/Windows/모바일은 P3 후속
- 혜성 비중력 효과(태양풍) 미반영 — ±2% 정확도 한계
- 질량 변경 후 시간 역행으로 원 상태 복원 불가 — 프리셋 원복으로 암묵 리셋

## [0.1.0-p1] — 2026-04-14

### P1 태양계 MVP

**신규 기능:**

- 태양 + 행성 8개 + 달, J2000.0 기준 Kepler 궤도 해석해
- 시간 컨트롤 (재생/일시정지/역행, 6 프리셋 1s~10y)
- 카메라 포커스 전환 애니메이션 (300ms ease-out)
- 4모드 UI 프레임 (관찰/연구 활성, 교육/샌드박스 예약)
- 모드별 사이드 패널 (CelestialTree + CelestialInfoPanel + TierBadge)
- 스케일 컨트롤 (로그 슬라이더 0.01~100 AU)
- DateTimePicker + UnitToggle + URL 상태 동기화
- 국제화 (ko/en)
- 흑체복사 기반 다크 디자인 토큰

**아키텍처:**

- 이중 레이어 — 순수 TS 코어 (`@astro-simulator/core`) + Next.js UI (`apps/web`)
- CPU float64 + GPU RTE float32 좌표계
- Floating Origin (B4) — 10^13m 거리 정밀도 검증
- Logarithmic depth buffer — 근/원 동시 렌더
- WebGPU-first + WebGL2 폴백 (adapter 사전 판별)

**데이터:**

- JPL/Standish 1992 기준 10개 천체 궤도 요소
- Zod 런타임 검증

**테스트:**

- 130개 단위 테스트 (core 89 + shared 4 + web 37)
- Playwright E2E: browser/mobile/scale/perf/a11y 5개 스위트
- JPL 공칭값 대비 궤도 요소/공전주기/거리 경계 ±1% 검증
- axe-core WCAG 2.1 AA 위반 0건
- 색약 시뮬 검증 (protanopia/deuteranopia/tritanopia)

**성능 (Playwright headless):**

- 정지/재생 36~38 FPS
- 포커스 상태 90+ FPS

**알려진 제약:**

- WebGPU 실환경 검증은 수동 (헤드리스 chromium 미지원)
- 행성 시각 크기 × 500 배율로 표시 (실제 크기는 점으로 보이는 문제 회피)
- Moon은 지구 시각 메쉬 내부에 위치 (per-body 스케일은 P2)
- 로그 시간 스크러버는 P2로 연기
- 시각 북마크(스냅샷 URL)는 P2로 연기

### 변경

- 해당 없음 (초기 릴리스)

### 수정

- Next 16 `middleware` → `proxy` 파일 컨벤션 대응 (PR #53)
- WebGPU 초기화 실패 시 Babylon 내부 console.error 오염 제거 (PR #54)
- URL 상태 동기화 무한 루프 방지 (PR #67)
