# monorepo dist stale — core 패키지 수정이 dev 서버에 미반영

> **근거**: harness #256 가지치기 PR 에서 CLAUDE.md `## 실전 교훈` 의 "빌드 성공 ≠ 동작하는 앱" sub-bullet 을 추출. 원천: volt [#70](https://github.com/coseo12/volt/issues/70) — astro-simulator P9 에서 QA 재검증이 결정적 동일 실패 재현 → "수정 효과 없음" 으로 오판한 사례.

## 패턴

pnpm workspace 등 monorepo 환경에서 core 패키지 `src/` 수정 후 앱 dev 서버가 **기존 `dist/` 아티팩트를 참조** 해 수정 미반영. QA 재검증이 **결정적으로 동일 실패** 를 재현해 "수정 효과 없음" 으로 오판하기 쉽다.

## 증상 (3 신호)

1. dev 재시작 없이 새로고침만 한 경우
2. **결정적 재현** (flaky 아님) — 같은 입력 → 같은 실패
3. vitest/CI 는 PASS (src 직접 import 라 dist 우회)

세 신호가 동시에 나타나면 코드 결함이 아닌 **dist stale** 가설 우선 검증.

## 방어

- monorepo core 수정 시 `pnpm --filter <pkg> build` 선행 + dev 재기동
- 또는 `--watch` 병행 (core build 가 변경 감지)
- 또는 tsconfig `paths` 로 src 직접 매핑 (dist 우회)

## 변형 — `clean` 이 stale 의 **치료제가 아니라 생성원**이었던 경우 ([#1166](https://github.com/coseo12/astro-simulator/issues/1166))

위 방어 1번(`build` 선행)을 **정확히 따랐는데도** dist stale 이 나는 갈래가 있었다. `packages/{core,shared}` 의
`clean` 이 `rm -rf dist .tsbuildinfo` 였는데 `tsconfig.build.json` 이 `composite: true` 라 실재 파일명은
`tsconfig.build.tsbuildinfo` 였다. 즉 `clean` 은 **존재하지 않는 경로**를 지웠고, 살아남은 빌드 정보를 본
`tsc` 는 up-to-date 로 판정해 아무것도 emit 하지 않았다 — `dist` 는 방금 지워졌는데 **exit `0`**.

**이 변형이 위험한 이유는 신호의 방향이 뒤집히기 때문이다.** 서버를 재기동하면 `500` 으로 즉시 드러나지만,
재기동하지 않으면 stale 을 계속 서빙하면서 **하필 stale 을 치료하려고 밟은 절차 때문에 더 안심하게 된다.**
"3 신호" 중 1번(dev 재시작 여부)이 이 갈래에서는 무력하다 — 재시작을 했어도 재빌드가 없었기 때문이다.

**처방** (#1166 에서 적용):

1. `clean` 은 경로를 손으로 적지 않는다 — `rm -rf dist *.tsbuildinfo` (글로브가 설정 파일명 변경을 흡수).
2. `build` 뒤에 **선언된 진입점이 실제로 emit 됐는지** 단언한다 — `test -f dist/index.js`. 「빈 dist + exit `0`」
   이라는 침묵을 exit `1` + 메시지로 바꾼다. 원인이 무엇이든(수동 `rm -rf dist`, 부분 삭제) 발화한다.
3. ⚠️ `tsc --build --clean` 은 **대안이 못 된다** — 실측(#1166) 결과 `tsbuildinfo` 는 지우지만 `dist` 안의
   비-emit 잔재는 남긴다. 즉 src 에서 삭제된 파일의 산출물이 영구 잔존해 **같은 stale 클래스를 재생산**한다.

## QA 에이전트 선행 조건 체크리스트

브라우저 검증 (CLAUDE.md `### 빌드 성공 ≠ 동작하는 앱` 3단계) 시작 **전에** dev 서버가 최신 src 를 서빙하는지 확인:

1. core 패키지가 마지막 수정 시점 이후 build 됐는가? (`ls -la packages/<core>/dist/`)
2. dev 서버 PID 가 최근 재시작 됐는가? (`ps -o lstart= -p <pid>`)
3. tsconfig `paths` 매핑 또는 `--watch` 가 설정됐는가?

세 조건 중 하나라도 미충족 시 "검증 전 dist 빌드 + dev 재기동" 선행.

## 근거

- volt [#70](https://github.com/coseo12/volt/issues/70) — astro-simulator P9 QA 재검증 결정적 동일 실패. dist stale 가설 후 `pnpm --filter <core> build` + dev 재기동으로 즉시 해소
- CLAUDE.md `### 빌드 성공 ≠ 동작하는 앱` (각인층 3단계 브라우저 검증) 의 monorepo 환경 변형
- 인접 패턴: `.claude/agents/qa.md` §2 "전 선행 조건" (QA 에이전트 브라우저 검증 진입 가드)
