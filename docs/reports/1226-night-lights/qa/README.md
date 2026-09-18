# #1226 qa 동적 검증 원자료 (PR [#1231](https://github.com/coseo12/astro-simulator/pull/1231))

브랜치 tip **`bdeeebe`** 에서 qa 가 직접 실행한 로그·캡처다. **판정은 각 로그 말미의 `exit=N`** 이다 (별도 파일에 두지 않는다 — 이전 사이클에 `m4-exits.txt` 삭제로 exit 코드가 회수 불가였다).

## 측정 조건

- `next dev` **두 대** — feature `3000` (본 저장소 `bdeeebe`) · develop tip `3100` (`26d3187` = merge-base, 별 worktree)
- `packages/core` 빌드: **재빌드하지 않았다** (권한 없음). 대신 **최신임을 실증**했다 — 아래 §dist 선행 조건
- 브라우저: 가드 로그는 **headless chromium + `--use-angle=swiftshader`** (`SWIFTSHADER=1`, CI 재현) / `qa-browser3.log` 은 **실 Chrome GUI** (`HEADFUL=1` → `channel: chrome` · `headless: false` · WebGPU)

## dist 선행 조건 (CLAUDE.md §monorepo dist stale — volt #70)

`pnpm --filter @astro-simulator/core build` 가 권한 거부라 **재빌드 대신 3중 실증**했다:

1. **소스 무변경** — `e39b6d9`(develop 병합, dist 빌드 `03:08`) 이후 HEAD 까지 `packages/core/src` · `apps/web/src` diff **`0` 줄** (유일한 런타임 접촉은 가드 스크립트 `browser-verify-1226-night-lights.mjs` 자신이다)
2. **상수 일치** — `dist/scene/procedural-planet-shader.js` 에 `nightLightStrength` · `NIGHT_LIGHT_CLUSTER_LO = 0.52` 등 g1 승인값 존재
3. **mtime 오탐 배제** — mtime 만으로 stale 로 보이던 core 파일 5종 (`engine-factory` · `simulation-core` · `cloud-layer` · `glow-marker` · `self-rotation`) 은 **갓 빌드한 develop tip worktree 의 dist 와 `git hash-object` 바이트 동일**했다 (src 도 동일) ⇒ mtime 차이는 git checkout 산물이고 내용 stale 이 아니다

추가로 **런타임 sanity** 가 로그 안에 있다 — 가드가 매 실행 인쇄하는 `strengths {"P1":[0.9],"P2":[0],"P3":[0.9],"P4":[0]}` 는 신규 uniform 을 **서빙된 번들에서 읽은 값**이라 `console.log` 주입보다 강한 증거다.

## 파일

| 파일                            | 무엇                                                                  | 결과                                                                                                   |
| ------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------ |
| `qa-dod.log`                    | 신규 가드 기본 모드 (`SWIFTSHADER=1`)                                 | `exit=0` · 게이트 **10종 전건 PASS** · 판정량이 `../phase2/baseline/profile-1.log` 와 **전 항목 동일** |
| `qa-d9.log`                     | `MODE=d9` — develop tip (`3100`) 과 full frame 동일성 3종 + 양성 대조 | `exit=0` · 게이트 **5종 PASS** · (a)(b)(c) `0 px` · 양성 `987 px` · 커밋된 `../phase2/d9.log` 와 동일  |
| `d10-after/*.log` (12)          | 선재 가드 12종 현 tip 재실행 (D10 「후」)                             | **12/12 `exit=0`**                                                                                     |
| `qa-unit-tests.log`             | `pnpm -r test`                                                        | `exit=0` · core `1130` · web `567` · shared `4` · physics-wasm `11` · 실패 `0`                         |
| `qa-browser3.log` · `browser3/` | 브라우저 3단계 (실 Chrome GUI · WebGPU)                               | `exit=0` · 전 페이지 콘솔 에러 **`0`**                                                                 |

## 브라우저 3단계 재현 레시피

캡처 스크립트는 임시였고 커밋하지 않았다 (volt #67 — `d13-prep/README.md` 선례). 재현 키:

- `HEADFUL=1 BASE_URL=http://localhost:3000 CAPTURE_DIR=<dir> node <script>` · `launchBrowser({ gpu: 'default' })` (→ `channel: chrome` · `headless: false`)
- 결정적 프레임은 `verify:1226` `setupPage` 와 **같은 API** — `hideDomOverlays(page)` → `__simCore.command({type:'jumpToJulianDate', julianDate: 2451808})` → `command({type:'pause'})` → `1000ms` → `activeCamera.beta = π/2` → `waitForLodSettle` → rAF 4프레임 → `locator('canvas').first().screenshot()`
- `bootstrapScene` 는 `handles: ['__simCore','__solarScene']` 가 필요하다 (기본값은 `__solarScene` 뿐)
- ⚠️ **`setPaused` / `setJulianDate` 는 존재하지 않는다.** qa 1차 실행이 그 이름을 써서 **freeze 가 조용히 no-op** 이 됐고, 두 페이지가 서로 다른 sim 시각에서 캡처돼 토글 차분이 `60626 px` 로 나왔다 (참값 `1002`). 2차 실행에서 위 정본 API 로 교정했다 — 로그의 값은 교정 후다

### 판정량

- **[1/3] 정적** — desktop `1280×720` canvas `1` · WebGPU `true` · earth mesh 존재 / mobile `390×844` (render `780×1688`, DPR 2) · WebGPU `true` · **가로 오버플로 없음** (`scrollWidth 390 == clientWidth 390`) · 양쪽 콘솔 에러 `0`
- **[2/3] 인터랙션** — `?nightlights=off` 토글: 절차 표면 머티리얼 **6개 전건** `nightLightStrength 0.9 → 0` · 같은 결정적 프레임 캔버스 차분 **`1002 / 921600 px`** (최대 채널차 `198`). ⚠️ 이 값은 **실 Chrome WebGPU** 이고 swiftshader 가드의 같은 쌍 (`main` P1↔P2, `fullChanged`) 은 **`1006 px`** 다 — 두 렌더러 차 **`4 px`**. 조작: 휠 `radius 35 → 374.13` · 드래그 `alpha −1.5708 → −2.5173`
- **「구조적으로 earth 전용」 런타임 확인** (reviewer 의 정적 주장에 대한 독립 증거) — 같은 프레임의 머티리얼별 uniform:

  | 머티리얼                                                                     | `nightLightStrength` | `uMaskEnabled` | 실제 불빛                                                         |
  | ---------------------------------------------------------------------------- | -------------------: | -------------: | ----------------------------------------------------------------- |
  | `earth-surface-mat`                                                          |                `0.9` |        **`1`** | **그려진다**                                                      |
  | `moon` · `mars` · `jupiter` · `moon-lod-mid` · `mars-lod-mid` `-surface-mat` |                `0.9` |        **`0`** | 게이트 `landMask × (1 − iceMask) × uMaskEnabled` 가 `0` → **`0`** |
  | `sun-surface-mat`                                                            |        없음 (`null`) |           없음 | 별 프로그램 (표면 셰이더 미진입)                                  |

  ⇒ 세기 uniform 은 rocky 전건에 바인딩되지만 **마스크 등록이 earth 1건**이라 다른 body 는 구조적으로 `0` 이다 (`SURFACE_MASK_BY_BODY`). 「마스크 등록이 늘면 상속된다」 도 이 표에서 그대로 읽힌다

- **[3/3] 흐름** — URL ↔ 상태 7 조합 전건 계약대로 (아래) · 네비게이션 back/forward 가 `0.9 ↔ 0` 을 URL 과 함께 복원

| URL                           | 불빛 uniform            | 구름 mesh | `rotationQuaternion` |
| ----------------------------- | ----------------------- | --------- | -------------------- |
| (기본)                        | `0.9`                   | 존재      | 존재                 |
| `?nightlights=off`            | **`0`**                 | 존재      | 존재                 |
| `?clouds=off`                 | `0.9`                   | 없음      | 존재                 |
| `?rotate=off`                 | `0.9`                   | 존재      | **`null`**           |
| `?clouds=off&nightlights=off` | `0`                     | 없음      | `null`               |
| `?surface=off`                | 표면 머티리얼 자체 없음 | 없음      | 존재                 |
| `?nightlights=banana`         | `0.9` (폴백)            | 존재      | 존재                 |

- `nightlights` ↔ `clouds` **독립** 실증 — 한쪽을 끄면 다른 쪽 상태가 그대로다 (양방향)
- `?surface=off` 에서 구름도 없는 것은 **정상**이다 — `solar-system-scene.ts:538` 이 구름 유효 조건을 `clouds && surfaceDetail` 로 규정한다 (불빛은 `:550` 이 `nightLights && surfaceDetail`)
- `?nightlights=banana` → ON 폴백 + `console.warn("[parse-night-lights-mode] 알 수 없는 ?nightlights=banana — ON (기본) 으로 폴백")` (파서 계약대로, `warning` 이라 콘솔 **에러** 는 `0`)
- ⚠️ 휠 `deltaY < 0` 은 이 앱에서 **줌아웃**이다 (`radius` 증가). 로그의 `줌인 false` 는 qa 의 방향 가정이 틀린 것이고 결함이 아니다 — 판정량은 「휠·드래그가 카메라를 실제로 움직인다」다

## D10 전·후 판정량 (계약 D10 요구 — PASS 여부만 적지 않는다)

`전` = develop tip (`../phase2/d10-before/`) · `후` = 현 tip qa 재실행 (`d10-after/`). 위험 R1~R3 축만 발췌:

| 축                                 | 전     | 후     | 기준                  | 여유           |
| ---------------------------------- | ------ | ------ | --------------------- | -------------- |
| **R1** `773` earth night mean      | `28.9` | `33.3` | 계약 도출 상한 `≲ 55` | 유지           |
| **R1** `773` earth contrastMean    | `4.73` | `4.11` | 낙차 마진 `0.1`       | 유지           |
| **R2** `783 dod` 극 대역 밤면 휘도 | `52.8` | `55.1` | `< 71.0`              | `18.2 → 15.9`  |
| **R3** `675` 40 AU cluster 증가분  | `+11`  | `+11`  | `≥ +10`               | `1` (**불변**) |
| **R3** `675` 100 AU cluster 증가분 | `+14`  | `+14`  | `≥ +11`               | `3` (**불변**) |

- `후` 는 커밋된 `../phase2/d10-after/` 와도 대조했고 판정량이 재현된다 (`773` contrastMean `4.11` · dayMean `136.7` · nightMean `33.3` / `783 dod` `55.1` 동일)
- **R3 는 여유 `1` 이 그대로다** — 불빛이 glow cluster 계수에 닿지 않았다 (계약 R3 의 low 누수 경로를 `D7(2)` · MN-7 이 막는다)

## CI (참고 — qa 가 고칠 수 있는 축이 아니다)

`shader-pixel-guard` 가 이 브랜치에서 3회 돌았고 **같은 코드가 다른 결과**를 냈다:

| run           | sha       | 결과                                                                                             |
| ------------- | --------- | ------------------------------------------------------------------------------------------------ |
| `35309333596` | `456dfb0` | **`verify:1226-night-lights` FAIL** — `page.waitForFunction: Timeout 20000ms` @ `bootstrapScene` |
| `35310869031` | `3ed1357` | **전건 success** — `verify:1215` ✓ · **`verify:1226` ✓**                                         |
| `35311544308` | `bdeeebe` | **`verify:1215-cloud-layer` FAIL** — 같은 `bootstrapScene` 타임아웃 · `verify:1226` **skipped**  |

- `456dfb0 → 3ed1357` 은 **CHANGELOG + ADR 뿐** (런타임 `0` 줄), `3ed1357 → bdeeebe` 의 비-docs diff 는 가드 스크립트 `measureV2` **+5 줄** (`INJECT=mn6` 전용 경로 — 기본 모드 미도달)
- ⇒ 두 실패는 **게이트 FAIL 이 아니라 부트 타임아웃**이고, 같은 코드가 중간 run 에서 통과했으므로 **환경 flake** 다. 신규 가드 고유 문제도 아니다 (한 번은 `1215` 가 맞았다)
- 두 실패가 모두 **`verify` job 의 마지막 두 스텝** (15 · 16) 에서 났다 — 16 스텝 직렬 실행의 뒤쪽이라는 상관은 있으나 인과는 실증되지 않았다 [관측]
- **CI 렌더러 임계 질문의 답** — `3ed1357` run 이 `verify:1226-night-lights` 를 **CI 렌더러에서 실제로 통과**시켰다. tip `bdeeebe` 에서는 skip 이라 기록이 없고, 그 사이 diff 는 위처럼 기본 모드 미도달 경로 `+5` 줄이다
