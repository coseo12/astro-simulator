<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->

# 반복 운영 마찰 — 원인 박제 + 절차 표준 (#795)

매 세션·릴리스마다 반복되던 저비용 운영 마찰의 **구조 원인**과 **표준 절차**를 박제한다. 개별론 사소하나 누적되며, 원인 미박제 시 매 세션 "이력상 그렇더라"로만 전승되어 회수 불가능해진다.

근거: 2026-07-04 프로젝트 회고 + [#795](https://github.com/coseo12/astro-simulator/issues/795). 실측 보강: 2026-07-14~15 세션(#822/#823/#826/v0.48.0)에서 1~4 전부 재현.

---

## 1. squash auto-close 매회 미발동 → 수동 close 규약

**증상**: feature/fix PR 에 `Closes #N` 을 박제해도 머지 후 이슈가 자동 close 되지 않는다. 매 세션 수동 `gh issue close` 필요.

**구조 원인**: GitHub 는 **default branch(main) 로 머지될 때만** closing keyword(`Closes`/`Fixes`/`Resolves`)를 auto-close 처리한다. 본 프로젝트 gitflow 는 feature PR 의 `base=develop` 이므로 **구조적으로 auto-close 미발동**. 버그가 아니라 GitHub 사양.

**표준 절차**:

- feature/fix PR(base=develop) 머지 직후 **수동 close 가 규약** — `gh issue close <N> --reason completed` (근거 코멘트 동반 권장).
- 릴리스 PR(develop→main)에서 번들된 이슈들은 이미 각 sub-PR 에서 수동 close 됨 (release PR 은 개별 이슈 close 대상 아님).
- 실측: 2026-07-15 세션에서 #822/#823/#826 전부 develop 머지 → 자동 미발동 → 수동 close ×3.

---

## 2. `gh pr merge --delete-branch` worktree 충돌 → 표준 절차 분리

**증상**: `gh pr merge <PR> --squash --delete-branch` 실행 시 `failed to run git: fatal: '<branch>' is already used by worktree at '...'` 에러. **머지 자체는 원격에서 성공**하나 로컬 브랜치 삭제 단계에서 실패.

**구조 원인**: Conductor 멀티 워크스페이스 환경은 여러 워크스페이스가 서로 다른 브랜치(특히 `develop`)를 동시 체크아웃한다. `--delete-branch` 는 머지 후 로컬에서 base 브랜치로 전환하려다 다른 워크스페이스가 점유한 브랜치와 충돌한다.

**표준 절차**:

- 처음부터 `--delete-branch` **생략**하고 머지만: `gh pr merge <PR> --squash`.
- 원격 브랜치 정리는 별도: `git push origin --delete <branch>`.
- 머지 성공 여부는 종료 코드가 아닌 실제 상태로 확인: `gh pr view <PR> --json state,mergeCommit`.
- 실측: 2026-07-15 세션 #824 에서 `--delete-branch` worktree 충돌, 머지는 성공(exit 0) → 이후 PR 은 처음부터 생략.

---

## 3. 좀비 카나리아 pgrep self-match 오탐 → bracket 표준 + pkill 안전

**증상**: `pgrep -af "agent-browser-chrome-"` 가 **매 호출 다른 PID + 즉시 소멸**하는 프로세스를 반환. 실 좀비 0 인데 좀비 있는 것으로 오탐.

**구조 원인**: `pgrep -f "패턴"` 은 프로세스 **전체 명령행**을 매칭한다. 에이전트가 셸에서 `pgrep -f "agent-browser-chrome-"` 를 직접 실행하면, 그 명령을 감싼 형제 셸(`bash -c '...pgrep -f "agent-browser-chrome-"...'`)의 명령행에 패턴 문자열이 포함되어 **자기 자신을 매칭**한다. 셸 래핑/파이프 구성에 따라 **간헐 재현**(2026-07-04 세션 2회 오탐, 2026-07-15 세션 재확인).

**bracket 표준**: 패턴의 한 글자를 문자 클래스로 감싼다 — `pgrep -f "agent-browser-chrome[-]"`.

- `[-]` 는 정규식상 `-` 문자와 동일하게 매칭하지만, pgrep 자신의 명령행 문자열은 리터럴 `agent-browser-chrome[-]` 이라 정규식 `agent-browser-chrome[-]` 이 `agent-browser-chrome[`(대괄호)로 이어지는 자기 명령행과 매칭되지 않아 **self-match 제거**.

**pkill 은 안전 이슈 (cosmetic 아님)**: `pkill -TERM -f "agent-browser-chrome-"` 는 자기 명령을 감싼 셸을 매칭하면 그 셸에 SIGTERM 을 보내 **정리 도중 자기 셸을 kill 할 위험**이 있다. bracket `[-]` 은 이 자기-kill 을 차단한다 — 단순 오탐 방지가 아닌 **안전 개선**.

**적용 완료 (본 PR)**: `.claude/agents/qa.md`, `CLAUDE.md`(프로젝트 고유 보강 섹션)의 pgrep/pkill 명령을 `agent-browser-chrome[-]` 로 정정.

**hook 은 이미 안전**: `.claude/hooks/session-start-zombie-check.sh` 는 pgrep 이 아닌 `ps -axww | grep -E "$PATTERN" | grep -v "session-start-zombie-check\|grep -E\|verify-zombie-check"` 구조로, **`grep -v` 제외**가 이미 self-match 를 방어한다. 별도 bracket 불요(변경 없음).

**upstream 기여 (후속 분리)**: qa.md 의 agent-browser 정리 절차 자체가 upstream harness-setting 에 미기여된 프로젝트 drift(bracket 만 단독 Phase 2 불가). agent-browser 정리 전체의 upstream 기여는 [#830](https://github.com/coseo12/astro-simulator/issues/830) 후속 분리(Z-패턴 Phase 2 대상).

---

## 4. concurrency cancelled push run = checks fail 표기 코스메틱 판별법

**증상**: PR 머지 직전 `gh pr checks <PR>` 또는 GitHub UI 에서 일부 체크가 `CANCELLED`/실패로 표기되고 `mergeStateStatus: UNSTABLE` 이 뜬다. 실제로는 회귀가 아님.

**구조 원인**: `ci.yml` 의 `concurrency: cancel-in-progress: true`(#779)는 같은 sha 의 중복 run(push + PR 이벤트, 또는 재트리거)을 취소한다. 취소된 이전 run 이 `CANCELLED` 로 남아 UNSTABLE 을 유발하나, **각 체크의 최신 run 은 SUCCESS**다.

**판별법 (1줄)**: `CANCELLED` 체크가 **동일 이름의 SUCCESS run 을 갖는지** 확인 — 있으면 superseded 중복(코스메틱, 안전). 없는 `CANCELLED` 만 실제 확인 대상.

```bash
# CANCELLED 중 SUCCESS 대응본 없는 것만 추림 (비면 전부 코스메틱)
gh pr checks <PR> --json name,state --jq \
  '[.[]|select(.state=="CANCELLED").name] - [.[]|select(.state=="SUCCESS").name]'
```

- 조건부 job(`retry-fresh-runner` 등)은 SKIPPED 가 정상(실패 시에만 실행).
- 실측: 2026-07-15 v0.48.0 release PR #829 에서 6 CANCELLED(전부 SUCCESS 대응본 보유) + UNSTABLE → 코스메틱 확인 후 `--merge` 진행, 정상 완료.
- 근거: [#779](https://github.com/coseo12/astro-simulator/issues/779) 코멘트(concurrency 취소 = 가드 약화 아님, 포착 100%).

---

## 릴리스 부수 마찰 (2026-07-15 v0.48.0 실측 — 추가 박제)

3~4 외 릴리스에서 관찰된 마찰:

- **CHANGELOG `[Unreleased]` 누락 전수 대조 의무**: develop 이 main 보다 앞선 커밋이 CHANGELOG 항목보다 많을 수 있다(이전 세션들이 항목 누락). 릴리스 전 `git log origin/main..origin/develop` 로 **포함 PR 전수 대조** → 누락분 소급 문서화. v0.48.0 은 9 커밋 중 6건 CHANGELOG 누락 발견.
- **release prep PR 필수**: version bump + CHANGELOG 확정은 develop 직접 push 금지라 `release/<X>-prep → develop` prep PR 로 선반영 후 release PR(develop→main).
- **release PR 도 pr-template-checklist 가드 대상**: 7 체크박스 원문 문구("ADR 호환성"/"Test plan"/"SSoT" 등) 전부 필요 — release 전용 섹션만으론 FAIL. 로컬 사전검증: `node scripts/verify-pr-template-checklist.mjs <PR>`.
- **`gh release create --target <sha>` 는 태그 기존재 시 HTTP 422**: 태그를 먼저 push 했으면 `--target` 제거(기존 태그 커밋 사용).
- **README 「현재 상태」 갱신 의무 (#842)**: release prep PR 에서 version bump + CHANGELOG 확정과 **동일 커밋**에 README `## 현재 상태` 의 버전/날짜/기능 서술을 현행화한다. 실측: v0.47.0~v0.50.0 3릴리스 연속 누락으로 README 가 v0.46.0 표기로 방치 (전수 감사 2026-07-18 발견).

## workspace 버전 정책 — 루트 단일 버전 (결정 노트, #842)

**결정**: `package.json::version` 릴리스 버전 SSoT 는 **루트 1곳만** 유지한다. private workspace 패키지 (`apps/web`, `packages/core`) 의 `version` 필드는 제거 — 릴리스 버전 미러링 폐지.

- **실측 배경**: v0.46.0 까지는 루트+workspace 동시 bump 였으나 v0.47.0 부터 루트만 bump 되어 apps/web·packages/core 가 0.46.0 에 3릴리스 동안 무기록 방치 (동시 bump 는 이미 사문화된 상태였음).
- **판단 기준 (저비용·재발 방지)**: 전부 `private: true` 미배포 패키지라 npm 상 version 의미 0 + 런타임/빌드에서 workspace version 참조 0 실측 → 동시 bump 복원은 매 릴리스 반복 비용 + 재발 (누락) 여지만 남김. 필드 제거가 drift 클래스 자체를 소멸시킴.
- **예외**: `packages/physics-wasm` (0.18.0) 은 애초에 루트 릴리스 버전을 미러링한 적 없는 독립 카운터 — 본 결정 범위 밖 (유지).
- **가드**: `scripts/verify-release-version-bump.sh` 는 CHANGELOG ↔ 루트 `package.json::version` 일치만 검증 (기존과 동일 — workspace 검증 불요화).

## 문서 배치 마찰 — 프로젝트 고유 lessons 는 docs/lessons/ 아님 (본 문서 자체 사례)

`docs/lessons/` 와 `docs/` 루트(deployment-guide 등)는 **upstream harness-setting 이 관리**하는 managed 디렉토리다(`.harness/manifest.json` 등록, `docs/lessons/` 19개). 프로젝트 고유 문서를 여기 두면 이중 가드 캐스케이드 발생:

- `docs/lessons/*.md` 신규 → `verify-lessons-readme.sh` 가 README 등록 요구 → README 편집 → README 가 managed 라 `verify-harness-drift-decorator` 가 데코레이터 요구 → Z-패턴 진입.

**표준**: 프로젝트 고유 운영/lessons 문서는 **비-managed 위치**(`docs/ops/` 등 manifest 미등록 신규 dir)에 두고 CLAUDE.md 프로젝트 고유 보강 섹션에서 링크한다. 본 문서(#795)도 `docs/lessons/` → `docs/ops/` 로 이동해 캐스케이드를 회피했다(리뷰 라운드 1회 소요 — 본 문서가 다루는 "마찰"의 자기 재현).

## 5. 신규 verify 스크립트 보일러플레이트 복붙 → 재현 조건 drift (#846)

`browser-verify-*.mjs` 신규 작성 시 기존 파일을 복붙하면서 launch 인자(`--use-angle=metal` /
swiftshader / 무인자)가 제각각 따라붙어, **같은 가드를 로컬과 CI 에서 돌렸을 때 렌더러가 달라지는**
drift 가 누적됐다. `pageerror` 리스너 누락으로 미포착 예외를 놓치는 사본도 다수.

**표준**: [`docs/ops/browser-verify-helpers.md`](browser-verify-helpers.md) 의 헬퍼 5종
(`launchBrowser` / `bootstrapScene` / `collectConsoleErrors` / `saveCapture` / `resolveBaseUrl`)
사용 + 동 문서 §리뷰 체크리스트로 신규 유입 차단. 기존 파일 전면 전환은 비목표.

또한 ci.yml 브라우저 가드는 **dev 서버를 각자 띄우지 않는다** — 공용 `:3002` 를 `BASE_URL` 로
받고 정리는 `if: always()` step 이 단독 책임. 개별 step 의 `kill` 은 Actions 기본 셸이
`bash -e {0}` 라 실패 시 도달하지 않는 죽은 코드다.
