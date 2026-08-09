# 반복 운영 마찰 — 원인 박제 + 절차 표준 (#795)

매 세션·릴리스마다 반복되던 저비용 운영 마찰의 **구조 원인**과 **표준 절차**를 박제한다. 개별론 사소하나 누적되며, 원인 미박제 시 매 세션 "이력상 그렇더라"로만 전승되어 회수 불가능해진다.

근거: 2026-07-04 프로젝트 회고 + [#795](https://github.com/coseo12/astro-simulator/issues/795). 실측 보강: 2026-07-14~15 세션(#822/#823/#826/v0.48.0)에서 1~4 전부 재현.

---

## 1. squash auto-close 매회 미발동 → workflow 자동 close (#915)

**증상 (구 상태)**: 일상 개발 PR 에 `Closes #N` 을 박제해도 머지 후 이슈가 자동 close 되지 않았다. 매 세션 수동 `gh issue close` 가 필요했다.

**구조 원인 (여전히 참)**: GitHub 의 **네이티브** auto-close 는 **default branch(main) 로 머지될 때만** closing keyword(`Closes`/`Fixes`/`Resolves`)를 처리한다. 본 프로젝트 gitflow 는 일상 개발 PR 의 `base=develop` 이므로 **네이티브 auto-close 는 구조적으로 미발동**. 버그가 아니라 GitHub 사양이며, 이 사양은 바뀌지 않았다.

**처방 갱신 (2026-08-09, [#999](https://github.com/coseo12/astro-simulator/issues/999))**: [#915](https://github.com/coseo12/astro-simulator/issues/915) 범위 4 가 [`.github/workflows/auto-close-issues.yml`](../../.github/workflows/auto-close-issues.yml) 을 도입해 그 공백을 메웠다. 이 workflow 가 `base=develop` 머지 이벤트에서 PR **본문**의 close 키워드를 파싱해 이슈를 close 하고 PR 링크 코멘트를 박제한다. 따라서 **수동 close 는 규약이 아니라 폴백**이다.

**표준 절차**:

- 일상 개발 PR(`<type>/*` → `base=develop`) 머지 후 메인은 `gh issue view <N> --json state` 로 **결과만 확인**한다. `CLOSED` 가 정상이며, 실측상 머지 후 수 초 내에 반영된다 (PR [#997](https://github.com/coseo12/astro-simulator/pull/997) 머지 → 11초 후 `github-actions[bot]` close).
- `OPEN` 이 남아 있으면 아래 **미발동 조건**에 해당하는지 확인한 뒤 폴백으로 수동 close — `gh issue close <N> --reason completed` (근거 코멘트 동반 권장).
- 릴리스 PR(develop→main)에서 번들된 이슈들은 이미 각 sub-PR 머지 시점에 close 됨 (release PR 은 개별 이슈 close 대상 아님).
- 실측 (구 상태): 2026-07-15 세션에서 #822/#823/#826 전부 develop 머지 → 자동 미발동 → 수동 close ×3. **이 실측은 workflow 도입 이전의 사실**이다.

### 1-1. auto-close 미발동 조건 — 폴백이 언제 필요한가

아래는 [`auto-close-issues.yml`](../../.github/workflows/auto-close-issues.yml) 과 파싱 SSoT [`scripts/auto-close-issue-parser.mjs`](../../scripts/auto-close-issue-parser.mjs) 에서 도출한 조건이다. **여기 없는 사유로 OPEN 이 남았다면 workflow run 로그를 직접 확인**한다 (`gh run list --workflow=auto-close-issues.yml`).

**트리거 축** (`on: pull_request: types: [closed]`, `branches: [develop]`):

| 조건                             | 결과                                                                                                                      |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| `base` 가 `main`                  | 본 workflow 미발동. default branch 머지라 GitHub **네이티브** auto-close 가 대신 발동                                       |
| `base` 가 `develop`·`main` **둘 다 아님** | ⚠️ **양쪽 다 미발동 — 폴백이 유일 경로.** stacked PR (`base=<type>/*`) 이 여기 해당한다. 실측 (술어: 2026-08-09 기준 **머지된** PR 전수, `gh pr list --state merged --limit 2000` 의 `baseRefName` 집계 = `develop` 416 / `main` 146 / 그 외 17. `search/issues is:pr is:merged` total_count **579** 와 교차 확인): **579건 중 17건**. `develop` / `main` 이분법으로 읽지 말 것 |
| 머지 없이 close (`merged=false`) | 미발동 — `if: github.event.pull_request.merged == true` (의도된 설계. 반려 PR 이 이슈를 닫으면 안 된다)                   |

**정의 로드 축 — 미발동 조건이 아니다** (PR [#1002](https://github.com/coseo12/astro-simulator/pull/1002) 리뷰 실측으로 반증). 본 절 초판은 workflow 헤더 주석을 따라 _"본 workflow·파서를 수정하는 PR 자신의 머지에서는 개정판이 발동하지 않는다 → 폴백 수동 close 를 기본값으로"_ 라고 적었으나 **거짓**이다.

| 반증                                                            | 실측                                                                                                                                        |
| --------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- |
| 본 workflow 를 **신설한** PR [#917](https://github.com/coseo12/astro-simulator/pull/917) | 자신의 머지에서 run `30695395893` 생성 + self-test PASS. **파일이 그 머지로 처음 생겼으므로**, 정의가 로드되지 않았다면 run 자체가 존재할 수 없다 (구성적 증명) |
| workflow + 파서를 **둘 다 수정한** PR [#961](https://github.com/coseo12/astro-simulator/pull/961) | 자신의 머지 run `31007305890` 이 `#942` / `#953` 을 실제 close (`gh issue view 942` timeline actor = `github-actions[bot]`)                        |

**틀린 것은 결론뿐이고 전제는 맞았다.** *"`pull_request` closed 트리거는 base 브랜치에 반영된 정의를 사용한다"* 는 전제는 run checkout 로그가 **오히려 입증**한다 — run `30695395893` 은 `+5bbb1bd…:refs/remotes/origin/develop` → `git checkout -B develop`, run `31007305890` 은 `+3b3b97c…` 로 각각 **그 PR 의 squash 머지 커밋(= 당시 `develop` head)** 을 체크아웃했다 (PR head 도 `refs/pull/N/merge` 도 아니다 — squash 라 세 SHA 가 달라 판별된다). 전제에서 결론이 **도출되지 않을** 뿐이다: `closed(merged == true)` 는 머지 커밋이 base 에 올라간 **뒤** 발화하므로, "base 의 정의" 가 이미 개정판이다. `workflow_dispatch` 2단계 함정은 **default branch** 반영을 요구하는 별개 조건이고 `base=develop` 은 `main` 에 닿지 않으므로 **동형이 아니다**. 원출처인 workflow 헤더 주석도 함께 정정했다.

**파싱 축** (`parseCloseTargets`, 정규식 `\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?:\s*:\s*|\s+)#(\d+)`):

| 조건                                                       | 결과                                                                                                 |
| ---------------------------------------------------------- | ---------------------------------------------------------------------------------------------------- |
| 키워드가 PR **본문 밖**에만 있음                            | **미발동.** 파서 입력은 `github.event.pull_request.body` 뿐 — 커밋 메시지 / PR 제목 / 코멘트는 미파싱 |
| 공식 키워드 9종 외 표기 (오타 / 한글 *"해결 #N"* 등)         | 미발동. 인식 대상은 `close`/`closes`/`closed`/`fix`/`fixes`/`fixed`/`resolve`/`resolves`/`resolved`  |
| 비-close 참조 (`Part of #N` / `Builds on #N`)               | 미발동 (의도 — 초과 매칭 금지)                                                                        |
| `Closes #90001, #90002` 처럼 **번호 나열**                   | 앞 번호만 발동, `#90002` 미발동. 각 번호 **직전**에 키워드가 인접해야 한다. 올바른 형식은 **줄 분리** — `` `Closes` #90001 `` 개행 `` `Closes` #90002 `` ([§PR 규칙](../guides/pr-conventions.md) 문법 가드와 동일 원리) |
| cross-repo 표기 (`Closes owner/repo#N`)                     | 미발동. 키워드 **직후**가 `#` 여야 하므로 `owner/` 에서 매칭이 끊긴다 (본 저장소 이슈만 대상)          |
| PR 본문 비어 있음                                           | no-op (파서 빈 배열 → workflow 조기 종료)                                                             |
| ⚠️ **마크다운·HTML 구조 내부 전부**                          | **파싱된다 — 유일한 초과 발동 방향.** 파서는 마크다운·HTML 을 **전혀 해석하지 않고** raw 텍스트에 정규식을 건다. 실측(20 벡터, PR [#1002](https://github.com/coseo12/astro-simulator/pull/1002) 리뷰): 코드펜스 / 인용 / 표 셀 / 인라인 코드 스팬 / HTML 주석 / `<details>` 접힘 / 이미지 alt / 링크 텍스트가 전부 매칭된다. 이 중 **HTML 주석 · `<details>` 접힘 · 이미지 alt** 3종은 **렌더링에서 보이지 않아 육안 검출이 불가능**하다 (링크 텍스트는 보인다). ↔ 아래 blockquote 의 *"안전 표기"* 와 모순이 아니다 — **해석하지 않기 때문에** 강조·태그가 키워드와 `#` **사이에** 끼면 오히려 구분자 자리를 차지해 매칭이 끊긴다. **본 문서를 PR 본문에 인용하면 예시 번호가 실제 close 대상이 된다** (실측: 본 PR 본문이 `[13, 999]` 로 파싱돼 무관 이슈 `#13` 에 close 시도. `#13` 이 이미 closed 라 `skip:` 으로 무해했을 뿐이다) |

> **close 문법을 예시로 적는 법** — ⚠️ *"키워드와 `#` 사이를 띄운다"* 는 **틀렸다**. 정규식 구분자가 `\s+` 라 공백은 몇 개든 흡수된다 (`Closes` + 공백 2개 + `#90001` → `[90001]` 실측). **비-공백 문자를 끼워야** 한다. 실측 확인된 안전 표기 3종: `` `Closes` #90001 `` (코드 스팬 분리) / `**Closes** #90001` (강조 분리) / `Closes → #90001` (화살표) — 전부 `[]`. **예시 번호는 존재 불가 대역(`#90001` 이상)을 쓴다** — 표기를 잘못 짚어 파싱되더라도 `gh api` 404 로 `skip:` 되어 **구조적으로 무해**하다. 실재 번호를 쓰면 _"우연히 이미 닫혀 있어서"_ 무해할 뿐이다. 전각 `＃` 도 미매칭이나 혼동 소지가 있어 권하지 않는다.

**실행 축** (파싱은 됐으나 close 하지 않는 경우). 아래 5행 중 **앞 3행은 run 로그에 `skip:` 으로 남고, 뒤 2행은 step 실패**로 표면화된다 — 특히 self-test 실패는 파싱 **이전** 단계라 `skip:` 이 아예 찍히지 않는다:

| 조건                             | 결과                                                                                     |
| -------------------------------- | ------------------------------------------------------------------------------------------ |
| 대상 번호가 **PR**               | 스킵 — REST 응답의 `pull_request` 키로 판별 (오발동 close 차단)                            |
| 대상 번호 미존재                 | 스킵 — `gh api` 404                                                                        |
| 대상 이슈가 이미 `open` 아님     | 스킵                                                                                        |
| 파서 self-test 실패              | **step 실패 → close 전체 중단** (fail-fast. 파서 회귀 시 오발동 close 대신 멈춘다)         |
| close 자체 실패 (권한 등)        | step 실패로 표면화 (fail-visible — 조용한 미발동이 아니므로 Actions 탭에서 빨간 체크로 보임) |

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

### 4-1. ⚠️ 경계 — required status check 하에서는 위 "코스메틱" 전제가 무효 (#971)

위 판별법은 **판정 주체가 사람일 때만** 유효하다. 눈으로 볼 때는 "동일 이름의 SUCCESS 가 있으니 안전" 이 성립하지만, **required status check 를 켜는 순간 판정 주체가 GitHub 으로 바뀐다** — 그리고 GitHub 의 동명 체크런 해소 규칙은 **문서화돼 있지 않다**.

- **`cancelled` 는 통과 결론이 아니다**: GitHub 이 통과로 인정하는 것은 `success` / `skipped` / `neutral` **3종뿐**이고 `cancelled` 는 여기에 없다. 즉 required 로 등록된 이름이 `cancelled` 로 남으면 **머지가 실제로 막힌다**.
- **동명 다중은 명시된 위험이다**: GitHub Docs "About protected branches" 원문 — *"Using the same job name in multiple workflows can cause ambiguous status check results and **block pull requests from being merged**."* 어느 체크런이 채택되는지는 미기술이며, **미기술인 것은 해소 규칙이지 위험의 존재가 아니다**.
- **사전 실증이 불가능하다**: 임의 conclusion 의 체크런 합성은 Checks API `POST /check-runs` = GitHub App 토큰 전용 (PAT 403), ruleset `enforcement: evaluate` (dry-run) 은 organization 소유 저장소 전용 — 본 저장소는 `owner.type: User`. 따라서 "최신 success 가 채택될 것" 이라는 가정은 **검증할 수 없다**.
- **릴리스 경로에 집중되나 거기서만 나는 것은 아니다**: 이 CANCELLED 는 무작위가 아니라 구조적이다. release PR 6/6 전건에서 무거운 3개 (`detect-and-test` / `verify-and-rust` / `long-integration-rust`) 가 cancelled 쌍둥이를 가졌다. 즉 "코스메틱" 이 하드 블록으로 바뀌는 지점이 **주로 릴리스 순간**이다. 다만 **한 SHA 가 여러 PR 의 head 가 되면 일상 PR 사이에서도** 교차 취소가 난다 (`refs/pull/N/merge` 가 PR 마다 다름 — 실측 `4f7366e` 가 PR #967/#968/#969 세 곳의 head 였다).

**표준 절차**: required check 를 켜기 전에 **가정하지 말고 구조적으로 제거**한다 — concurrency 그룹 키에 `${{ github.ref }}` 를 넣어 `pull_request`(`refs/pull/N/merge`) 와 `push`(`refs/heads/*`) 를 별도 group 으로 분리하면 교차 취소 자체가 소멸한다 (#971 Phase 0 적용 완료). 실측 근거 — 2026-08-01 ~ 08-07 run 1,000건의 `cancelled` **72건 전수가** 교차 ref 클래스(push↔PR 35 / ff-sync 21 / PR↔PR 16)라 **72/72 가 이 한 줄로 분리**된다. 보존되는 "동일 ref 재트리거" 클래스는 같은 window 에서 **0건**이었다.

> 단 Phase 0 는 **`cancelled` 결론을 없애는 것이지 동명 체크런을 없애는 게 아니다**. 오히려 교차 취소가 사라지면서 양쪽이 완주해 **동명 완주 쌍이 3 → 7 로 늘어난다**.

**남는 잔여 위험은 하나가 아니라 2종이다** (초판은 flake 하나로 적었으나 실측 반증됨):

| 원인                                                                            | 성격                | Phase 0 가 해소하는가 |
| ------------------------------------------------------------------------------- | ------------------- | --------------------- |
| ① flake 발 `failure`+`success` 혼재                                             | 확률적              | 아니오 (직교)         |
| ② 다중 `types:` + **concurrency 부재** 워크플로의 동일 SHA 누적            | **결정론적** | 아니오 (축 자체가 다름) |

②는 **event 축(push × PR)이 아니라 event `types` 축**이다. `pr-template-checklist-guard.yml` 은 `types: [opened, edited, synchronize]` 인데 concurrency 블록이 **없어서**, PR 본문을 편집할 때마다 같은 SHA 에 체크런이 누적된다. 처음 실패했다가 고쳐 통과하면 `failure`+`success` 가 그 SHA 에 영구 공존한다 — 실측 PR #964 `ee64871` 에서 `failure`/`failure`/`success`(flake 0, 가드가 설계대로 유도한 정상 루프). 최근 머지 PR 25건 중 이 가드가 n>1 인 것이 4건, 통과/미통과 혼재가 1건이다.

**concurrency 블록이 없는 PR 워크플로 (6-1 적용 제외 사유 = 넣을 블록 자체가 없음)**:

| 워크플로                             | concurrency | `types`                                     | 동일 SHA 누적 노출              |
| ------------------------------------ | ----------- | ------------------------------------------- | ------------------------------- |
| `pr-template-checklist-guard.yml`    | **없음**    | `opened, edited, synchronize`               | **높음** — `edited` 로 반복 누적 |
| `harness-pr-review.yml` (`label-pr`) | **없음**    | `opened, synchronize, ready_for_review`     | 낮음 — `edited` 없음 (실측 n>1 0건) |
| `branch-name-guard.yml`              | 있음 (PR 번호 키) | `opened, synchronize`                  | 없음 (실측 n>1 0건)             |

> ⚠️ **해소책으로 이 둘에 concurrency 를 추가하지 말 것.** `cancel-in-progress` 는 같은 head SHA 에 `cancelled` 를 남기고 `cancelled` 는 통과 3종에 없으므로 required check 하에서 **더 나쁘다** (`{failure, success}` → `{cancelled, success}`). 대응은 Phase 1 구성 조정(required 제외 또는 `edited` 트리거 제거)이며 ADR 개정 범위다.

**`G1` 발화 시 선분류 1줄**: `cancelled` 발견 시 즉시 Phase 0 실패로 판정하지 말고 각 run 의 `event`·`head_branch` 를 먼저 분류한다 — 보존하기로 한 "동일 ref 재트리거" 클래스는 **Phase 0 실패가 아니다**. 절차: ADR [`20260701-779`](../decisions/20260701-779-ci-alert-fatigue-concurrency.md) §A2-6 재검토 조건 10.

- 상세 + 적용/롤백 절차: ADR [`20260807-971-required-status-checks`](../decisions/20260807-971-required-status-checks.md) §2-2 / §2-6 / §2-8 / §2-11 / 결정 3. 잔여 위험 2종 + `cancelled` 전수 분류표: ADR [`20260701-779`](../decisions/20260701-779-ci-alert-fatigue-concurrency.md) §A2-3 / §A2-5.

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

`docs/lessons/` 와 `docs/` 루트(deployment-guide 등)는 **upstream harness-setting 이 관리하는 managed 디렉토리였다** (#907 디커플로 전체 프로젝트 소유 전환 — ADR 20260731-907-harness-decouple). 당시 프로젝트 고유 문서를 여기 두면 이중 가드 캐스케이드가 발생했다:

- `docs/lessons/*.md` 신규 → `verify-lessons-readme.sh` 가 README 등록 요구 → README 편집 → README 가 managed 라 `verify-harness-drift-decorator` 가 데코레이터 요구 → Z-패턴 진입.

**표준**: 프로젝트 고유 운영 문서는 `docs/ops/` 에 두고 CLAUDE.md 프로젝트 고유 보강 섹션에서 링크한다. 본 문서(#795)도 `docs/lessons/` → `docs/ops/` 로 이동해 캐스케이드를 회피했다(리뷰 라운드 1회 소요 — 본 문서가 다루는 "마찰"의 자기 재현). #907 디커플 이후 managed 제약은 소멸했으나, `docs/ops/`(운영) vs `docs/lessons/`(일반화 교훈) 문서 분류 원칙은 유지한다.

## 5. 신규 verify 스크립트 보일러플레이트 복붙 → 재현 조건 drift (#846)

`browser-verify-*.mjs` 신규 작성 시 기존 파일을 복붙하면서 launch 인자(`--use-angle=metal` /
swiftshader / 무인자)가 제각각 따라붙어, **같은 가드를 로컬과 CI 에서 돌렸을 때 렌더러가 달라지는**
drift 가 누적됐다. `pageerror` 리스너 누락으로 미포착 예외를 놓치는 사본도 다수.

**표준**: [`docs/ops/browser-verify-helpers.md`](browser-verify-helpers.md) 의 헬퍼 5종
(`launchBrowser` / `bootstrapScene` / `collectConsoleErrors` / `saveCapture` / `resolveBaseUrl`)
사용 + 동 문서 §리뷰 체크리스트로 신규 유입 차단. 기존 파일 전면 전환은 비목표.

---

또한 ci.yml 브라우저 가드는 **dev 서버를 각자 띄우지 않는다** — 공용 `:3002` 를 `BASE_URL` 로
받고 정리는 `if: always()` step 이 단독 책임. 개별 step 의 `kill` 은 Actions 기본 셸이
`bash -e {0}` 라 실패 시 도달하지 않는 죽은 코드다.

## 6. CI 소요 시간 표기 기준 = job-level API (#885)

**증상**: CI 시간 개선을 PR 본문/코멘트에 박제할 때 같은 run 을 두고 수치가 몇 초씩 어긋난다.
실측: PR [#882](https://github.com/coseo12/astro-simulator/pull/882) 에서 job 전체 절감폭이
코멘트 −81s / 리뷰 재현 −78s 로 **3초** 갈렸다 (before 를 1,116s 로 잡느냐 1,113s 로 잡느냐 차이).

**구조 원인**: 시간을 세는 방법이 두 가지다. (a) **job-level** — `jobs[].started_at` ~
`completed_at`. (b) **스텝 파생** — 각 step 의 `started_at/completed_at` 차를 합산하거나 로그
타임스탬프에서 눈으로 딴 값. (b) 는 step 사이 간격 (러너 오버헤드 · post 액션 · 반올림) 을
흘리므로 (a) 와 항상 몇 초 어긋난다. 둘을 한 문서에서 섞으면 재현자가 차이를 회귀로 오독한다.

**표준**: **총 소요 시간은 job-level 값만 인용**한다. 개별 step 수치는 "가드 합계" 처럼
**step 단위 비교**에만 쓰고, 두 축을 한 표에 섞지 않는다 (섞을 땐 열 이름에 기준 명시).

```bash
# job-level (총 소요 시간 인용 기준)
gh api repos/coseo12/astro-simulator/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[] | {name, started_at, completed_at}'

# step 단위 (가드별 비교 전용)
gh api repos/coseo12/astro-simulator/actions/runs/<RUN_ID>/jobs \
  --jq '.jobs[].steps[] | {name, started_at, completed_at}'
```

- 단일 run 대조는 러너 편차가 섞이므로 **한계를 함께 적는다** (#882 본문이 이 부분은 정직했다).
- **같은 클래스 — PR 본문 판정표 셀도 기억이 아니라 실측 출력을 인용한다**: #882 본문의
  harness-managed 판정표가 `CHANGELOG.md` 를 "등재" 로 적었으나 실측은 미등재였다
  ([리뷰 권고 8](https://github.com/coseo12/astro-simulator/pull/882#issuecomment-5082085880)).
  보수적 방향 오기라 실害 0 이었지만 이런 표는 다음 PR 의 참조 근거로 **승계**된다
  (#935 "가드 N종" 표기가 2회 연속 승계 drift 한 것과 동형).
- 근거: PR [#882 리뷰 권고 8·9](https://github.com/coseo12/astro-simulator/pull/882#issuecomment-5082085880).

## 7. 격리 worktree 의 `npx prettier` 버전 skew → 코드 스팬 손상 (#952)

**1순위 — 구조적 해소**: 격리 worktree 작업 시작 시 `pnpm install --frozen-lockfile` 을 먼저 돌린다 (실측 **4.6초**). `node_modules` 가 서면 pre-commit 훅이 정상 동작해 `--no-verify` 자체가 불필요해지고 `pnpm exec prettier` 가 lockfile 버전으로 고정돼 아래 skew 가 소멸한다. cross-validate (agy, 2026-08-04) 판정: *"문서에 주의사항을 쓰는 것은 보조 수단이어야 하며, 시스템 구조가 실수 자체를 불가능하게 만들어야 한다"* — 규약은 컨텍스트가 길어지면 잊히는 실패 모드가 있다.

**2순위 규약 (install 이 불가능할 때)**: **맨손 `npx prettier` 금지** — `pnpm exec prettier`
(node_modules 있을 때) 또는 **`npx prettier@3.9.6` 처럼 lockfile 버전을 명시**해서 부른다.

**증상**: 격리 worktree 는 `node_modules` 가 없어 sub-agent 가 `npx prettier` 로 우회한다. `npx` 는
로컬 해석에 실패하면 **캐시에 있는 아무 버전**을 쓴다 — 실측(2026-08-04) `~/.npm/_npx/` 3개 캐시 중
하나가 **3.8.2** 였고(나머지 2개와 lockfile 은 3.9.6), 3.8.2 로 `CHANGELOG.md --write` 하면 마크다운
**코드 스팬 내부**를 건드려 `` `…/__diff__/r1/**/*.png` `` → `` `…/**diff**/r1/**/\*.png` `` 로 **손상**된다
(3.9.6 에서 수정된 버그). 즉 "포맷을 맞추려는 행위 자체가 본문을 깨뜨린다".

**구조 원인**: 버전 출처가 셋이다 — `package.json`(`^3.9.6`, 범위) / `pnpm-lock.yaml`(3.9.6, 확정) /
**npx 캐시**(임의). 앞의 둘은 정합인데 세 번째가 worktree 에서만 지배권을 갖는다. 훅(lint-staged)이
정상 동작하는 일반 체크아웃에서는 이 경로가 열리지 않으므로 "정상 개발자" 는 재현하지 못한다.

**표준 절차**:

```bash
# lockfile 확정 버전 확인 (인용 근거)
grep -m1 'prettier@' pnpm-lock.yaml     # → prettier@3.9.6:

pnpm exec prettier --check .            # node_modules 있을 때 (1순위)
npx prettier@3.9.6 --check .            # 격리 worktree (버전 명시 필수)
npx prettier --check .                  # 금지 — 캐시 버전이 지배
```

- `--write` 후에는 **의도 밖 파일이 안 바뀌었는지 `git diff --stat` 로 확인**하고, 특히 마크다운
  코드 스팬(`` `__diff__` `` 등)이 온전한지 `grep` 한다. 손상 클래스는 조용해서 리뷰에서도 잘 안 보인다.
- CI 백스톱은 `ci.yml` `#952 포맷 백스톱 (format:check)` 스텝이며 **`pnpm run format:check`** 를 쓴다 —
  install 된 lockfile 바이너리라 버전 출처가 하나로 유지된다. 워크플로에 `npx prettier@<버전>` 을
  하드핀하면 네 번째 출처가 생겨 같은 클래스를 재생산한다.
- 근거: [#952](https://github.com/coseo12/astro-simulator/issues/952) (PR [#951](https://github.com/coseo12/astro-simulator/pull/951) 리뷰 권고 4-i/4-ii).
