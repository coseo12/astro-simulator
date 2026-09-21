# browser-verify 공용 헬퍼 — 사용 규약 + 리뷰 체크리스트

> SSoT 구현: [`scripts/browser-verify-utils.mjs`](../../scripts/browser-verify-utils.mjs)
> 회귀 가드: [`scripts/browser-verify-utils.test.mjs`](../../scripts/browser-verify-utils.test.mjs) (ci.yml 배선)
> 근거: [#846](https://github.com/coseo12/astro-simulator/issues/846) (전수 감사 2026-07-18)

## 왜 필요했나 (현행 실측 2026-07-26)

| 항목                        | 감사 시점 (07-18) | 현행 (#844 고아 스크립트 34개 삭제 후) |
| --------------------------- | ----------------- | -------------------------------------- |
| `chromium.launch` 포함 파일 | 73                | **44**                                 |
| `localhost:3000` 하드코딩   | 40                | **27**                                 |
| console 에러 수집 인라인    | 43                | **19**                                 |
| `__solarScene` 부트스트랩   | 36                | **28**                                 |
| `--use-angle=metal` 사용    | 7                 | **6**                                  |
| swiftshader 사용            | 3                 | **10**                                 |

핵심 문제는 줄 수가 아니라 **재현 조건 drift** 였다. launch 인자가 파일별로 제각각이라
(`--use-angle=metal` / `--use-angle=swiftshader` / 무인자) 같은 가드를 로컬과 CI 에서 돌렸을 때
어느 렌더러로 측정됐는지 호출부를 열어봐야 알 수 있었다. 픽셀 측정 가드에서 이 축은 결과를 바꾼다.

또 인라인 console 수집본 상당수가 `pageerror` 리스너를 빠뜨려 **미포착 예외를 놓쳤다**.

## 헬퍼 6종

```js
import {
  launchBrowser, // chromium.launch + 렌더러 축(gpu) 단일 선언 + HEADFUL/HEADED 흡수
  withBrowser, // launch → try fn → finally close (에러 경로 잔존 차단, #927)
  bootstrapScene, // goto + window.__solarScene 등 dev 전역 노출 대기 + settle
  collectConsoleErrors, // console.error + pageerror 두 채널 동시 등록 (라이브 배열 반환)
  saveCapture, // mkdir -p + writeFile
  resolveBaseUrl, // BASE_URL 정규화 (후행 슬래시 제거)
} from '../../../scripts/browser-verify-utils.mjs'; // apps/web/scripts 기준 상대 경로
```

### 클릭 헬퍼 — 조용한 실패 금지 ([#1209](https://github.com/coseo12/astro-simulator/issues/1209))

`page.click(sel).catch(() => {})` 는 **셀렉터가 사라져도 스크립트를 통과시킨다**. 그러면 이후 측정은
「직전 화면」을 새 시나리오 이름으로 재게 되고, 그 값이 baseline 과 비교돼 정상 판정으로 흐른다.

| 헬퍼                             | 규약                                                                                            |
| -------------------------------- | ----------------------------------------------------------------------------------------------- |
| `clickTestId(page, id, opts)`    | pre-assert 후 클릭. 부재 시 throw. `skipIfAbsent: true` 는 **상태 의존 셀렉터 전용**             |
| `pressTimePlay(page, opts)`      | `clickTestId(page, 'time-play', …)` 의 얇은 래퍼 (#210 계약·에러 문구 불변)                      |
| `setTimePlayback(page, mode)`    | 셀렉터가 아니라 **상태**를 단언 (`'paused'` / `'playing'`). 토글 쌍이 **둘 다 부재면 throw**     |

`time-controls.tsx` 는 한 버튼의 testid 를 상태로 갈아 끼우므로(`isPaused ? 'time-play' : 'time-pause'`)
한쪽 부재가 「이미 그 상태」일 수 있다. `setTimePlayback` 은 그 허용을 **형제 셀렉터의 존재**로
가둬서, 「없으면 건너뛴다」가 컨트롤 소실까지 통과시키는 것을 막는다.

⚠️ `clickTestId` 기본 타임아웃은 `2_000ms`(`pressTimePlay` 승계)다. **메인 스레드가 포화되는
측정 구간**(N-sweep 등)에서는 클릭 디스패치 자체가 늦어지므로 호출부가 `timeout` 을 명시한다
(`bench-scene.mjs` 의 `PREP_CLICK_TIMEOUT_MS` 참조 — `N=10000` 에서 `9_377ms` 실측).

렌더러 축은 `GPU_LAUNCH_ARGS` 가 SSoT다.

| `gpu` 값      | chromium 인자             | 용도                           |
| ------------- | ------------------------- | ------------------------------ |
| `default`     | (없음)                    | 플랫폼 기본 백엔드             |
| `swiftshader` | `--use-angle=swiftshader` | CI 결정성 우선 (GPU 편차 제거) |
| `metal`       | `--use-angle=metal`       | macOS 로컬 실 GPU 재현         |

오타난 축(`swiftshadre` 등)은 **조용히 `default` 로 흡수되지 않고 즉시 throw** 한다 — 픽셀 가드가
다른 백엔드로 측정하고도 PASS 하는 사고를 막기 위한 fail-fast다
(CLAUDE.md §가드 설계 원칙 — drift 가드는 fail-fast 만, fallback 분기 금지).

## `bootstrapScene` 부팅 계측 `[boot]` ([#1234](https://github.com/coseo12/astro-simulator/issues/1234))

`bootstrapScene` 은 호출마다 **진단 2줄**을 stdout 에 찍는다. 판정·임계·타임아웃과 무관하고,
예외는 **원본 그대로** 다시 던진다 (계측이 실패를 삼키지 않는다).

```
[boot] browser-verify-1226-night-lights.mjs #5 P1b — ok goto 1043ms · handles 2455ms · settle 2801ms · total 6299ms · ctx 5/page 5 · t0 62.4s
[boot] {"guard":"browser-verify-1226-night-lights.mjs","seq":5,"label":"P1b",...}
```

- 두 줄 다 `[boot] ` 로 시작한다 — `grep '^\[boot\]'` 가 전건, `grep '^\[boot\] {'` 가 **JSON 만** 모은다.
- `seq` 는 그 프로세스의 N 번째 호출이다 (가드 1개 = node 프로세스 1개). 호출부가 `label` 을 주면
  요약·JSON 에 함께 실린다 — 한 가드가 페이지를 여럿 여는 경우 `P1` ↔ `P1b` 를 가르는 축이다.
- **실패 시**에만 채워지는 필드: `failedPhase`(`goto`/`handles`/`settle`) · `failedPhaseMs` ·
  `state`(`readyState` / `__simCore`·`__solarScene` 의 `typeof` / `performance.now()`) ·
  `server`(node 측 `fetch` 로 잰 dev server 응답 — 「서버가 느린가 ↔ 페이지가 멈췄나」를 가른다) ·
  `consoleErrors` · `pagesAtFail`.
- 완주 소요(`gotoMs`/`handlesMs`/`settleMs`)는 **완주한 구간만** 채운다. 실패 구간의 소비 시간을
  같은 필드에 넣으면 「완주 소요」 분포에 타임아웃 상수가 섞이므로 `failedPhaseMs` 로 분리한다.
- 셀 수 없는 축(`contexts`/`pages`)은 `0` 이 아니라 `null` + `countError` 다 — 「0 개」와
  「못 셌다」가 같은 값이면 이 축으로 원인을 가르려는 쪽이 거짓 분포를 읽는다.

### 단계 계측 `bootPhases` (C2-H3)

`state` 가 「`__simCore` 는 있고 `__solarScene` 만 없다」 까지 좁힌 **그 안쪽**을 가르는 축이다.
성공·실패 **양쪽**에서 채운다 (실패 표본만 있으면 기준선이 없다).

```
… · phases 17 last scene:orbit-lines@2481ms · top engine:webgl2-ctor 980ms, scene:body-meshes 412ms, web:effect-start 388ms
```

- 출처는 apps/web `src/core/boot-phases.ts` 가 **dev 빌드에서만** 노출하는 `window.__bootPhases`
  (`__solarScene` 과 같은 게이트 계약). prod 서버(`next start`) 대조군에서는 `null` 이 **정상**이다.
- 각 항목은 `{ name, atMs, deltaMs }` — `atMs` 는 네비게이션 기준 경과, `deltaMs` 는 **직전 구간과의
  차**(= 그 구간 소요)다. 첫 항목의 `atMs` 가 곧 「초기화 effect 진입까지 걸린 시간」이다.
- 이름 접두는 구간 소유자다: `web:`(sim-canvas 배선) · `engine:`(어댑터/컨텍스트) ·
  `core:`(Scene 생성·렌더 루프) · `scene:`(장면 구축 내부).
- probe 가 실패하면 `null` 이 아니라 `{ phasesError }` 다 — 「전역이 없다」와 「못 읽었다」를 가른다.
- 성공 경로의 읽기 비용은 `phasesProbeMs` 로 분리돼 있다 (`totalMs` 에 포함된 몫).
- **`-timeout` 으로 끝나는 마크는 C3-A 상한 발화다** (`gpu:adapter-timeout` ·
  `gpu:adapter-info-timeout` · `engine:probe-adapter-timeout` · `engine:features-adapter-timeout`).
  건강한 부팅에는 **하나도 없어야 정상**이다 — 하나라도 보이면 그 페이지에서 GPU 어댑터 조회가
  `GPU_ADAPTER_TIMEOUT_MS`(12 s) 를 넘겼다는 뜻이고, 앱은 WebGL2 로 폴백해 계속 돈다
  (`packages/core/src/gpu/adapter-timeout.ts` §상한 값 근거). 반대로 `gpu:adapter-call` 이
  **마지막 마크인 채로** 12 s 를 넘겼다면 상한 자체가 안 걸린 것이므로 (타이머 큐가 막혔다)
  어댑터가 아니라 호스트 쪽을 본다.

## 리뷰 체크리스트 (신규 verify 스크립트)

신규 `browser-verify-*.mjs` 가 PR 에 포함되면 아래를 확인한다.

- [ ] `chromium.launch(...)` 직접 호출 대신 `launchBrowser()` — 렌더러는 `gpu` 옵션으로 명시
- [ ] **위 1·2 조합**: 렌더러 옵션을 쓰면서 에러 경로 보장도 필요하면
      `withBrowser(buildLaunchOptions({ gpu: 'swiftshader' }), fn)` — `withBrowser` 는 인자를
      **가공 없이 `launch` 로 전달**하므로 `withBrowser({ gpu: … })` 는 조용히 무시된다
      (`buildLaunchOptions` 의 렌더러 fail-fast 를 우회하게 되므로 금지)
- [ ] `launch → … → close` 를 일직선으로 나열하지 말고 `withBrowser(launchOptions, fn)` — `page.goto`
      실패 등 **에러 경로에서도 `close()` 도달**을 보장한다 (#927). 콜백 안에서 `process.exit()` 를
      부르면 finally 가 실행되지 않으므로, 조기 종료는 값을 반환해 호출부에서 처리한다
- [ ] `page.goto` + `waitForFunction(window.__solarScene …)` 수기 조합 대신 `bootstrapScene()` —
      한 프로세스에서 페이지를 여럿 열면 `label` 을 넘긴다 (§`[boot]` 부팅 계측)
- [ ] `page.on('console', …)` 인라인 대신 `collectConsoleErrors()` — `pageerror` 누락 방지
- [ ] `mkdir` + `writeFile` 수기 조합 대신 `saveCapture()`
- [ ] `process.env.BASE_URL ?? 'http://localhost:3000'` 대신 `resolveBaseUrl()`
- [ ] `page.click(sel).catch(() => {})` 금지 — `clickTestId()` / `setTimePlayback()` (§클릭 헬퍼).
      「없으면 건너뛴다」를 남기려면 **무엇이 그 부재를 정상으로 만드는지**를 코드로 표현한다
      (형제 셀렉터 존재 등). 그냥 삼키면 다른 화면을 잰 값이 판정까지 흘러간다 (#1209)
- [ ] `locator('canvas').screenshot()` 으로 픽셀을 재면 캡처 전에 `hideDomOverlays(page)` — element
      캡처는 캔버스 **위에 겹친 DOM** (HUD · 토스트) 을 함께 찍는다. #1219 (glow-marker 가 UI 글리프를
      세던 사고) · #1228 (토스트 소멸이 주입 전후 diff 에 섞여 결함 판 `exit 0`) 두 번 실사고가 났다
      (`visibility` 사용 — `display:none` 은 캡처 박스가 `0×0` 이 된다)
- [ ] ci.yml 에 배선한다면 **dev 서버를 새로 띄우지 않는다** — 공용 `:3002` 를 `BASE_URL` 로 받는다
      (§아래 "ci.yml 배선 규약")

## 기존 스크립트 전환 정책

**전면 전환은 비목표다** (#846 스프린트 계약 명시). 목표는 신규 유입 차단이다.

- 기존 파일은 다른 이유로 손대는 김에 점진 전환하되, **동작 불변이 확인된 범위에서만** 바꾼다
- 전환 시 변환 전후 출력을 대조하고 PR 에 박제한다
- 판정 로직·임계값은 전환 대상이 아니다 — 부트스트랩 보일러플레이트만 위임한다

> **"출력 바이트 동일" 은 조건부 주장이다** (#885). #846 은 `browser-verify-627-satellite-orbit.mjs`
> 전환에서 전후 출력 바이트 동일을 실측했지만, 그 전환은 진단용 `collectConsoleErrors` 도입을
> 동반했다. 즉 (a) `[진단] 콘솔 에러 N건` 라인은 **콘솔 에러 ≥ 1건일 때만** 출력되고,
> (b) `--json` 모드에는 `consoleErrors` 필드가 **추가**된다. 바이트 동일은 **콘솔 에러 0 +
> 비-json 출력** 조건에서만 성립한다.
>
> 전환 검증에서 대조해야 할 불변량은 바이트가 아니라 **종료 코드 + 판정(PASS/FAIL) + 판정 근거
> 라인**이다 (#933 이 7종 전환에서 채택한 기준 — "종료 코드 + 출력 구조 대조"). 바이트 동일이
> 관측되면 보너스로 박제하되, **불변 계약으로 승격하지 말 것** — 진단 라인 하나만 늘어도
> 깨지는 과잉 제약이고, 깨졌을 때 판정 회귀로 오독된다.

## ci.yml 배선 규약 (#846)

브라우저 회귀 가드는 **dev 서버를 각자 띄우지 않는다.** `ci.yml` 이
[`scripts/ci-dev-server.sh`](../../scripts/ci-dev-server.sh) 로 `:3002` 에 1회 기동하고,
배선된 가드 전부가 이를 직렬 공용한다. 정리는 맨 아래 `if: always()` step 이 단독 책임진다.

> **가드 개수는 표기하지 않는다** (#935). `ci.yml` / `ci-dev-server.sh` / 본 문서 3곳에 박힌
> "가드 N종" 표기가 가드 추가 PR 마다 손 갱신을 요구했고, 실제로 2회 연속 누락돼 drift 했다
> (`#848` 도입 시 11번째 가드 추가 → 표기 10 잔존 → PR #934 가 그 오차를 승계).
> 개수는 주석의 장식이고 정확성 유지 비용이 정보 가치를 넘는다 — 배선 이력이 필요하면
> CHANGELOG (시점 기록 SSoT) 를 본다.
>
> **예외 — 명시 열거를 동반한 개수는 유지**한다 (예: p7d 헤더의 "스크립트 7종(A / B / …)").
> 열거가 곧 자기검증이라 drift 하면 즉시 눈에 띈다. 후속 PR 이 이런 표기까지 일괄 제거하지 말 것.

readiness 는 **HTTP 200 으로만 통과**한다 (#885). `curl -sf` 는 3xx 에서 exit 0 을 내므로
(리다이렉트를 따라가지 않는다) ready path 가 리다이렉트면 **대상 라우트를 한 줄도 컴파일하지
않은 채** READY 로 통과한다. `ci-dev-server.sh` 는 상태 코드를 직접 읽어 200 만 인정하고 3xx 는
즉시 exit 1 한다. 현행 라우팅(#908 i18n 제거 후)에서 실제 페이지는 `/` 이고 `/ko` 는 308 → `/` 다.

개별 step 안에 `kill` 을 두지 말 것 — Actions run step 기본 셸은 `bash -e {0}` 라
**가드가 실패하면 그 줄에서 step 이 즉시 종료되어 뒤따르는 `kill` 이 실행되지 않는다.**
이것이 #846 이 걷어낸 "GUARD_EXIT 죽은 코드" 패턴이다.

> **예외 — `set +e` 로 판정 구간을 감싼 형태는 허용한다** (#885). 금지 대상은 kill 자체가
> 아니라 **`bash -e` 하에서 실패 시 도달하지 못하는 kill** 이다. `ci.yml` 의 r1-guard 4/4 step
> (`set +e` → 가드 실행 → `GUARD_EXIT=$?` → `set -e` → `kill` → `exit $GUARD_EXIT`) 은
> 성공/실패 양쪽에서 정리에 도달하므로 위 실패 모드가 없다 — #846 이 죽은 코드를 **이 형태로
> 고친** 것이다. 이 예외가 없으면 문서(무조건 금지)와 `ci.yml`(inline kill 유지)이 자기 불일치다.
>
> 다만 신규 step 의 **기본값은 정리를 `if: always()` step 에 위임**하는 쪽이다. r1 은 자기
> `next start`(:3001) 를 소유하는 특수 케이스이고, 공용 dev 서버(:3002)를 쓰는 가드는 애초에
> 정리할 프로세스가 없다.

```yaml
# ✅ 권장
- name: '#NNN 회귀 가드'
  run: BASE_URL=http://localhost:3002 node apps/web/scripts/browser-verify-NNN.mjs

# ❌ 금지 — 실패 시 kill 미도달(서버 잔존) + next cold-boot 중복
- name: '#NNN 회귀 가드'
  run: |
    pnpm --filter @astro-simulator/web exec next dev -p 30XX &
    WEB_PID=$!
    ...
    node apps/web/scripts/browser-verify-NNN.mjs
    GUARD_EXIT=$?
    kill $WEB_PID || true
    exit $GUARD_EXIT
```
