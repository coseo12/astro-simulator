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

렌더러 축은 `GPU_LAUNCH_ARGS` 가 SSoT다.

| `gpu` 값      | chromium 인자             | 용도                           |
| ------------- | ------------------------- | ------------------------------ |
| `default`     | (없음)                    | 플랫폼 기본 백엔드             |
| `swiftshader` | `--use-angle=swiftshader` | CI 결정성 우선 (GPU 편차 제거) |
| `metal`       | `--use-angle=metal`       | macOS 로컬 실 GPU 재현         |

오타난 축(`swiftshadre` 등)은 **조용히 `default` 로 흡수되지 않고 즉시 throw** 한다 — 픽셀 가드가
다른 백엔드로 측정하고도 PASS 하는 사고를 막기 위한 fail-fast다
(CLAUDE.md §가드 설계 원칙 — drift 가드는 fail-fast 만, fallback 분기 금지).

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
- [ ] `page.goto` + `waitForFunction(window.__solarScene …)` 수기 조합 대신 `bootstrapScene()`
- [ ] `page.on('console', …)` 인라인 대신 `collectConsoleErrors()` — `pageerror` 누락 방지
- [ ] `mkdir` + `writeFile` 수기 조합 대신 `saveCapture()`
- [ ] `process.env.BASE_URL ?? 'http://localhost:3000'` 대신 `resolveBaseUrl()`
- [ ] ci.yml 에 배선한다면 **dev 서버를 새로 띄우지 않는다** — 공용 `:3002` 를 `BASE_URL` 로 받는다
      (§아래 "ci.yml 배선 규약")

## 기존 스크립트 전환 정책

**전면 전환은 비목표다** (#846 스프린트 계약 명시). 목표는 신규 유입 차단이다.

- 기존 파일은 다른 이유로 손대는 김에 점진 전환하되, **동작 불변이 확인된 범위에서만** 바꾼다
- 전환 시 변환 전후 출력이 동일한지 실측하고 PR 에 박제한다
  (#846 은 `browser-verify-627-satellite-orbit.mjs` 를 전환하고 전후 출력 바이트 동일을 실측했다)
- 판정 로직·임계값은 전환 대상이 아니다 — 부트스트랩 보일러플레이트만 위임한다

## ci.yml 배선 규약 (#846)

브라우저 회귀 가드는 **dev 서버를 각자 띄우지 않는다.** `ci.yml` 이
[`scripts/ci-dev-server.sh`](../../scripts/ci-dev-server.sh) 로 `:3002` 에 1회 기동하고,
가드 13종이 이를 직렬 공용한다 (#888/#932 배선으로 11 → 13). 정리는 맨 아래 `if: always()` step 이 단독 책임진다.

개별 step 안에 `kill` 을 두지 말 것 — Actions run step 기본 셸은 `bash -e {0}` 라
**가드가 실패하면 그 줄에서 step 이 즉시 종료되어 뒤따르는 `kill` 이 실행되지 않는다.**
이것이 #846 이 걷어낸 "GUARD_EXIT 죽은 코드" 패턴이다.

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
