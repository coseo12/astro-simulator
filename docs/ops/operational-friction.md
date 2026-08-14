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
| `base` 가 `develop`·`main` **둘 다 아님** | ⚠️ **양쪽 다 미발동 — 폴백이 유일 경로.** 단 **실사례는 전건 봇**이고 **실해는 0** 이다 (아래 §1-2). `develop` / `main` 이분법으로 읽지 말 것 |
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

### 1-2. `base` 가 제3 브랜치인 PR — *"stacked PR"* 이 아니라 봇이다 (#1030)

위 **트리거 축** 표의 `` `base` 가 `develop`·`main` 둘 다 아님 `` 행에 대한 상세다.

⚠️ **초판은 그 행을 _"stacked PR (`base=<type>/*`)"_ 로만 적었고, 그 낱말이 사람의 stacked 관행을
함의했다.** 실해가 이미 발생했다 — [#970](https://github.com/coseo12/astro-simulator/issues/970) 착수
시 메인이 정확히 그렇게 오독해 *"허용 집합에 stacked 를 넣어야 하는가"* 라는 전제 갭이 생겼고, dev 가
head 저자 구성을 실측해서야 해소됐다. **이 저장소에 사람이 만든 stacked PR 은 0 건이다.**

**구성 실측** (rev `38b6c8a` / 2026-08-14. 아래 술어를 그대로 실행하면 재현된다):

```bash
# ① base 분포 — 머지된 PR 전수
gh pr list --state merged --limit 2000 --json baseRefName --jq '.[].baseRefName' | sort | uniq -c | sort -rn
# ② 제3 브랜치 PR 의 저자·head 구성
gh pr list --state merged --limit 2000 --json number,baseRefName,headRefName,author \
  --jq '.[] | select(.baseRefName != "develop" and .baseRefName != "main") | [.number, .headRefName, .author.login] | @tsv'
# ③ 교차 확인 (총계)
gh api -X GET search/issues -f q='repo:coseo12/astro-simulator is:pr is:merged' --jq '.total_count'
```

| 축 | 실측값 |
| --- | --- |
| ① base 분포 | `develop` **445** / `main` **155** / 그 외 **17** |
| ③ 총계 교차 | `617` (= `445 + 155 + 17`) |
| ② 저자 | **`app/github-actions` 17 / 17 = 100%** |
| ② head 접두 | **`chore/r1-baseline-linux-<runId>` 17 / 17 = 100%** |

**구조 원인**: [`r1-baseline-bootstrap.yml`](../../.github/workflows/r1-baseline-bootstrap.yml) 의
PR 생성 스텝이 `base: ${{ inputs.target_branch }}` 를 쓴다. 이 workflow 는 R1 UI 회귀 가드 baseline 을
**작업 브랜치에 되돌려 주는** 것이 목적이라 base 가 `<type>/*` 인 것이 **설계대로**다. 즉 제3 브랜치
base 는 예외적 사람 관행이 아니라 **봇 파이프라인의 정상 산출물**이다.
(이전 스냅샷 `2026-08-09` 는 `416 / 146 / 17` / 총 `579` 였다 — **그 외 17 은 불변**이고 앞 둘만
증가했다. 봇 PR 은 R-Phase 종료마다 1건씩 늘므로 이 값도 고정은 아니다.)

**봇 PR 의 auto-close 는 미발동 조건에 넣지 않는다 — 실해 0 이기 때문이다.** 봇 PR 은 base 가 제3
브랜치라 `auto-close-issues.yml` 도 GitHub 네이티브도 발동하지 않지만, **애초에 닫을 대상이 없다**:

```bash
# 17건 전수 — PR 본문의 close 키워드 hit
for n in $(gh pr list --state merged --limit 2000 --json number,baseRefName \
             --jq '.[] | select(.baseRefName != "develop" and .baseRefName != "main") | .number'); do
  printf '#%s hits=%s\n' "$n" \
    "$(gh pr view "$n" --json body --jq '.body' | grep -icE '\b(close[sd]?|fix(e[sd])?|resolve[sd]?)[[:space:]]*:?[[:space:]]*#[0-9]+')"
done
```

실측: **17 / 17 이 `hits=0`**. 위 workflow 의 `body:` 가 close 키워드 없는 **고정 템플릿**이므로 이
`0` 은 우연이 아니라 구조적이다. 따라서 *"봇 PR 은 이슈를 닫지 않는다"* 는 결손이 아니라 **의도**이며,
미발동 조건 표에 올리면 **폴백이 필요한 것처럼 오독**된다. 대신 트리거 축 표의 해당 행에 본 절
포인터만 두었다.

- 근거: [#1030](https://github.com/coseo12/astro-simulator/issues/1030) — ADR
  [`20260812-970`](../decisions/20260812-970-pr-base-rule-guard.md) §9 후속 표의 항목 2·3.
  *"표에만 있는 후속은 유실된다"* 는 전례(#962 축 B → #970 재발견)에 따라 이슈로 분리된 건이다.

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

⚠️ **기전 정정 (#1054, 2026-08-14)** — 위 **관측은 맞으나 기전 설명이 불완전**하다. "형제 셸의 명령행에 패턴 문자열이 포함" 은 필요조건일 뿐이고, **왜 그 프로세스가 매칭 후보에 들어왔는가**가 빠져 있다. 답은 **직교 2축**이며, 어느 한쪽만으로는 설명도 방어도 되지 않는다.

| 축 | 기전 | `-a` 제거로 해소? | bracket 로 해소? | `grep -v grep` 로 해소? |
| --- | --- | :---: | :---: | :---: |
| **① 조상 셸** | macOS `pgrep -a` 가 조상을 매칭 풀에 유입 | ✅ | ⚠️ **argv 순도 조건부** | ✅ |
| **② 형제 subshell** | 비-exec fork 가 부모 argv 를 상속. pgrep 의 **조상이 아니라 형제**라 기본 제외 대상이 아니다 | ❌ | ⚠️ **argv 순도 조건부** | ✅ |

**두 축은 같은 argv 문자열을 본다** (형제가 조상 argv 를 상속하므로). 다른 것은 **매칭 풀 소속**뿐이다. 따라서 bracket 의 효력은 축과 무관하고 오직 **argv 순도** — _명령행 어디에도 un-bracketed 리터럴이 없을 것_ — 에만 걸린다. 4케이스 격리 실측 (각 케이스를 **별도 스크립트 파일**로 분리 — 같은 tool call 에 넣으면 heredoc 리터럴이 조상 argv 를 오염시켜 측정 자체가 무효가 된다):

| | 조상 argv | 패턴 | `-a` | 결과 |
| --- | --- | --- | :---: | --- |
| C1 | un-bracketed 리터럴 | un-bracketed | ✓ | **hit** |
| C2 | **bracketed 만 (순수)** | bracketed | ✓ | **exit 1** — bracket 이 **축 ①도 막는다** |
| C3 | **un-bracketed 리터럴 있음 (불순)** | bracketed | ✓ | **hit** — 조건은 축이 아니라 **argv 순도** |
| C4 | un-bracketed 리터럴 | un-bracketed | ✗ | exit 1 — **단 형제 부재 전제** |
| C5 | un-bracketed 리터럴 | un-bracketed | ✗ | **hit** — C4 와 동일 조건 + **형제 subshell 생존**. `-a` 제거는 **축 ① 만** 죽인다 |

⚠️ **C1~C4 는 「형제 부재」 전제 위의 측정이다** — 표를 단독 인용할 때 C5 가 없으면 _"`-a` 만 빼면 exit 1"_ → _"`-a` 제거로 충분"_ 이라는 오독이 나온다(그것이 정확히 본 절이 정정한 오류다). C5 실측에서 hit 한 PID 는 fork 된 형제 subshell 자신이었다.

⚠️ 따라서 _"bracket 을 걸었는데도 뚫렸다"_ 는 관찰은 **C3** 이지 bracket 무력화가 아니다 — 같은 줄 **다른 명령**의 un-bracketed 리터럴이 argv 를 오염시킨 것이다. 반면 `grep -v grep` 은 **argv 순도와 무관하게** 두 축을 막는다. 이것이 정확한 차별점이며 채택 근거다.

**축 ①** — macOS `man pgrep` 축자: _"`-a` Include process ancestors in the match list. **By default, the current pgrep or pkill process and all of its ancestors are excluded** (unless `-v` is used)."_ 기본값이 자기 + 조상 전건 제외라 조상 축 self-match 는 구조적으로 불가능한데, `-a` 가 그 방어를 **되살린다**. 실측 (rev `90fa2a6`, 명령행에 un-bracketed 리터럴 노출):

```
pgrep -af 'zzz1054-canary[-]'   → 12938(조상 셸) 12946(실 프로세스) 12950(일시 subshell)
pgrep  -f 'zzz1054-canary[-]'   → 12946(실 프로세스만)
```

**축 ②** — 기본 제외 범위는 **자기 + 조상**이지 **형제가 아니다**. 셸이 fork 한 비-exec subshell 은 부모 argv 를 그대로 상속하므로, `-a` 를 떼도 매칭된다. 실측 (형제 subshell 을 살려 둔 상태, **bracket 을 건 채로**):

```
self=25244  형제 subshell=25250 (부모 argv 상속)
pgrep -f "next[ ]dev|next-serve[r]|cargo.*tes[t]|pnpm.*de[v]"        → 25250   exit=0   ← -a 없는데 hit
ps -axww -o pid=,etime=,command= | grep -E … | grep -v grep          →         exit=1   ← 정상
```

따라서 **본 절 서두의 _"매 호출 다른 PID + 즉시 소멸"_ 중 변동 PID 성분이 바로 축 ②** 이고, `-a` 제거만으로는 **사라지지 않는다**. 위 "간헐 재현" 을 _"`-a` 사용 여부의 결정론적 귀결"_ 로 환원해 읽으면 **역방향 오진**이 된다 — 실제로는 형제 subshell 의 동시 생존 여부가 회차별 변동을 만든다. `-a` 가 남기는 별개의 해악은 macOS 에서 **명령행을 찍지 않는다**는 것이다 (Linux procps 의 `-a` = `--list-full` 과 이름만 같다) — 오탐이 늘면서 **무엇이 잡혔는지 볼 수단도 사라진다**.

**bracket 표준**: 패턴의 한 글자를 문자 클래스로 감싼다 — `pgrep -f "agent-browser-chrome[-]"`.

⚠️ **보호 범위 단서 (#1054)** — bracket 이 지키는 것은 **그 패턴 문자열 자신**이며, 명령행 **전체**가 아니다. 따라서 상속 argv 안에 un-bracketed 리터럴이 하나라도 있으면 뚫린다: 같은 command line 의 **형제 명령**이 평문 리터럴을 노출하는 경우(실측: `ps … | grep -E "…next dev…"` 와 같은 줄에 둔 `next[ ]dev` 술어가 hit), 그리고 패턴 안에 `.*` 가 있어 bracket 앞의 un-bracketed 조각이 명령행의 **무관한 뒷부분**과 이어지는 경우(실측: `pnpm.*de[v]` 가 자기 패턴의 `pnpm` 과 래퍼가 모든 명령에 덧붙이는 `< /dev/null` 의 `dev` 를 잇는다). **그럼에도 pgrep 을 쓸 수밖에 없는 경로에서는 bracket 이 축 ② 를 막는 유일한 수단이므로 제거 대상이 아니다** — 아래 **pkill 은 안전 이슈** 항이 규정하듯 자기-kill 차단까지 겸한다.

반면 `grep -v grep` 은 **명령행 전체**를 필터링해 **두 축을 동시에** 막으므로 카나리아 정본이다. 패턴 리터럴을 실은 셸은 그 자신이 `grep` 파이프라인이라 걸러지고, 명령을 더 이어 붙여도 그 줄에서 `grep` 이라는 낱말이 사라지지 않는다. ⚠️ 다만 _"항상"_ 은 **이 구성에 한정된 진술**이다 — 필터가 거르는 것은 `grep` 문자열이지 "자기 자신" 이라는 신원이 아니므로, `grep` 을 포함하지 않는 경로(별도 프로세스가 패턴 리터럴만 들고 있는 경우 등)까지 덮지는 못한다. 대가는 명령행에 `grep` 을 포함한 **실 프로세스를 놓치는 것**(false negative)이고, dev 서버 / cargo 계열에는 해당 사례가 없어 #440 이래 hook 이 이 형태로 운용돼 왔다.

⚠️ **패턴 자체의 선행 결함 (#1054 비차단)** — `pnpm.*dev` 는 `.*` 가 래퍼의 `< /dev/null` 까지 이으므로 **`pnpm` 을 포함한 임의 명령**을 매칭한다 (본 절 축 ② 와 독립인 **패턴 정밀도** 문제라 카나리아 형태 교체로는 해소되지 않는다). 후속 분리: [#1066](https://github.com/coseo12/astro-simulator/issues/1066).

- `[-]` 는 정규식상 `-` 문자와 동일하게 매칭하지만, pgrep 자신의 명령행 문자열은 리터럴 `agent-browser-chrome[-]` 이라 정규식 `agent-browser-chrome[-]` 이 `agent-browser-chrome[`(대괄호)로 이어지는 자기 명령행과 매칭되지 않아 **self-match 제거**.

**pkill 은 안전 이슈 (cosmetic 아님)**: `pkill -TERM -f "agent-browser-chrome-"` 는 자기 명령을 감싼 셸을 매칭하면 그 셸에 SIGTERM 을 보내 **정리 도중 자기 셸을 kill 할 위험**이 있다. bracket `[-]` 은 이 자기-kill 을 차단한다 — 단순 오탐 방지가 아닌 **안전 개선**.

**적용 완료 (본 PR)**: `.claude/agents/qa.md`, `CLAUDE.md`(프로젝트 고유 보강 섹션)의 pgrep/pkill 명령을 `agent-browser-chrome[-]` 로 정정.

**hook 은 이미 안전**: `.claude/hooks/session-start-zombie-check.sh` 는 pgrep 이 아닌 `ps -axww | grep -E "$PATTERN" | grep -v "session-start-zombie-check\|grep -E\|verify-zombie-check"` 구조로, **`grep -v` 제외**가 이미 self-match 를 방어한다. 별도 bracket 불요(변경 없음).

⚠️ **hook 필터를 그대로 복사하지 말 것 (#1054)** — hook 이 안전한 이유는 **스크립트 파일 안에서 실행되기 때문**이다. 패턴이 `PATTERN` 변수에 있어 호출 셸 argv 에 리터럴이 실리지 않고, 위 `grep -v` 목록이 파이프라인 자신의 `grep -E` 프로세스를 거른다. 이 조건은 **에이전트가 셸에 직접 치는 카나리아에는 성립하지 않는다**: 그 환경에서 `grep` 은 셸 스냅샷이 `ugrep -G` 로 재작성한 **셸 함수**라(실측 `type grep` → _"grep is a shell function from …/shell-snapshots/…"_) 실행 프로세스 argv 에 `grep -E` **연속 문자열이 남지 않아** hook 필터가 헛돈다. 그래서 `qa.md` · CLAUDE.md §가드 B 의 카나리아는 필터를 `grep -v grep` 으로 **의도적으로 더 강하게** 잡았다 — `ugrep` 은 `grep` 을 부분문자열로 포함하므로 재작성 후에도 걸러진다.

**공유 범위를 정확히**: 세 위치가 공유하는 SSoT 는 **ETIME 30분 임계뿐**이다 (§8 _"3곳 정합 SSoT"_ 참조). **패턴 리터럴의 축자 일치는 hook ↔ `qa.md` 2곳의 사실**이고, CLAUDE.md §가드 B 는 `physics_wasm-` 를 포함한 **의도적으로 다른 검출 범위**를 쓴다 — 이를 3곳으로 확대 기술하면 _"통일하라"_ 는 오독을 낳고 그 통일은 `physics_wasm-` **커버리지 소실**로 이어진다. 필터 형태는 셋 다 공유 대상이 아니다.

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
  - ⚠️ **본문 생성은 `create-pr` 스킬 경로로 한다 (#1014)**: prep PR 도 예외가 아니다. `gh pr create --body`/`--body-file` 직접 호출은 스킬의 템플릿 동적 읽기 + pre-flight 를 통째로 우회해 체크리스트 누락 → `pr-template-checklist` **FAIL** 로 릴리스 흐름이 끊긴다. 실측: #912 · #964 · #1032 의 첫 run `failure` **3건이 전부 prep PR** 이고 (13일 창, 같은 창 prep PR 17건 중 **17.6%**), #1032 는 FAIL 6/7 로 체크리스트가 통째로 빠져 있었다. 판정 근거는 [ADR 20260813-1014](../decisions/20260813-1014-release-pr-class-no-op.md) §잔여 갭.
- **release PR 도 pr-template-checklist 가드 대상**: 7 체크박스 원문 문구("ADR 호환성"/"Test plan"/"SSoT" 등) 전부 필요 — release 전용 섹션만으론 FAIL. 로컬 사전검증: `node scripts/verify-pr-template-checklist.mjs <PR번호>`.
  - ⚠️ **문구만으로는 WARN 이 남는다 (#1010)**: 3계급 판정에서 phrase 는 blocking 축이고 **구조**(`kw1~5` 체크박스 / `kw6~7` `###` 헤더)는 WARN 축이다. 체크박스 항목을 `### 보안` 같은 헤더 절로 옮기면 FAIL 은 면해도 WARN 이 뜬다 — 실측으로 최근 머지 PR 60건 중 **release PR 8건이 이 경로**였다 (술어: 60 PR × 7 kw = 420 셀 중 WARN 21 셀, WARN PR 10건 중 8건이 release). 체크박스는 `[ ] → [x]` 갱신만 하고 라인 형태를 유지한다.
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

### 7-1. 버전이 맞아도 손상된다 — 인라인 코드 **밖**의 `~` 범위 표기 (#1013)

§7 은 **버전 skew** 가 원인이지만, **lockfile 정본 버전(3.9.6)에서도** 마크다운이 손상되는 직교 경로가 하나 더 있다. `prettier --write` 는 인라인 코드 **밖**의 `~` 를 GFM 취소선 문법으로 정규화한다 — 한 문단에 `~` 가 2개 있으면 짝지어 버린다.

```bash
# 실측 (prettier 3.9.6 = lockfile 버전, --parser markdown)
# 입력:  kw1~5 체크박스 / kw6~7 헤더
# 출력:  kw1~~5 체크박스 / kw6~~7 헤더     ← 렌더링 시 "5 체크박스 / kw6" 이 취소선
# 인라인 코드로 감싸면 불변: `kw1~5` / `kw6~7`
```

**표준 절차 — 범위·구간 표기는 반드시 인라인 코드로 감싼다** (`` `kw1~5` `` / `` `1~5` `` / `` `v0.67~0.69` ``). 같은 뿌리의 규약이 이미 `verify-pr-template-checklist.mjs` 의 PR 코멘트 문자열 주석에 있다 — *"한 문단에 `~` 가 2개 있으면 GFM 이 strikethrough 로 페어링하므로 범위 표기는 반드시 인라인 코드로 감싼다"*. 차이는 **누가 깨뜨리는가**다: 거기서는 GitHub 렌더러, 여기서는 **포맷터가 소스를 직접 고쳐 쓴다**.

- **왜 조용한가** — `--write` 가 통과시킨 뒤에는 `--check` 도 초록이다(정규화된 형태가 prettier 기준으로는 **정답**). 즉 **CI 백스톱이 구조적으로 못 잡는다.**
- ⚠️ **그러므로 `prettier --check` 는 이 손상의 탐지 술어가 될 수 없다** — *"통과했으니 잔여 0"* 은 **무능한 술어로 부재를 증명**하는 것이다(이 절의 초판이 실제로 그렇게 적었다가 리뷰에서 차단됐다). **탐지 술어는 문자열 검색**이다.

- **정본 술어 (#982 확정)** — *prettier 소유 markdown 에서 **코드 펜스 밖 ∧ 인라인 코드 스팬 밖의 `~~`***. 이것이 [ADR 20260814-982](../decisions/20260814-982-changelog-tilde-guard.md) 가 채택한 술어이며, 아래 두 grep 은 **이력용 하한/상한**이다(초판이 판정 술어로 실었던 것이 위쪽 정규식이다).

  ```bash
  # ★ 정본 — 가드가 곧 술어다 (아래 §강제 지점). 판정은 이 명령이 한다.
  node scripts/verify-md-tilde.mjs --staged           # index ↔ HEAD 추가 라인
  # 이력 ① 하한 — `~~` 양쪽이 영숫자인 형태만. 줄 단위 recall 19/21 (경계가 `#`·`(`·공백이면 놓친다)
  git grep -nE --untracked '[0-9A-Za-z]+~~[0-9A-Za-z]+' -- '*.md'
  # 이력 ② 상한 — 넓은 그물. 인라인 코드 안의 `~~` 인용까지 잡아 오검출이 생긴다
  git grep -nF --untracked -- '~~' -- '*.md'
  ```

  ⚠️ **"여는 `~~` 앞이 공백이면 의도된 취소선" 이라는 대조 규칙은 쓰지 마라** — ` ~~345px` 같은 실손상을 의도분으로 분류한다. **손상과 의도를 가르는 구문적 판별자는 없다**(같은 토큰 두 개다). 정밀도의 출처는 술어가 아니라 **모집단**이다 — prettier `ignored: false` 인 md 는 **5개**(`CHANGELOG.md` + README 4)이고 그 안의 의도된 취소선은 실측 **0 발생**인 반면, 의도분 **23 줄 / 48 발생**은 전부 prettier 미소유 `docs/**` 에 있다(= 포맷터가 건드리지 않으므로 손상 자체가 불가능). ADR §재검토 조건 1 이 이 **모집단 크기**를 감시 대상으로 삼는 이유다. ⚠️ 이 계수는 **시점 의존**이므로 rev 를 병기한다 — rev `dce7279` / 술어: 위 정본 가드의 `scanContent` 를 미소유 md 전수에 적용 (ADR `20260808-983` §수치 박제 규약 4항).

- **강제 지점 (#982)** — `scripts/verify-md-tilde.mjs`. 규약이 **문서에만** 있으면 다음 entry 에서 그대로 재현되므로 발화 지점을 둔다.

  | 호출 지점 | 모드 | 성격 |
  | --- | --- | --- |
  | `.husky/pre-commit` (`pnpm lint-staged` **다음 줄**) | `--staged` | 손상이 **생성되는** 지점 직후 = 가장 이른 검출 |
  | `.github/workflows/ci.yml` (`pull_request` 한정) | `--base <sha>` | 훅 우회(`--no-verify`) backstop |
  | 상시 (CI) | `--self-test` | 분류기 격리 픽스처 + 3중 시뮬레이션 |
  | 수동 | `--population` | ADR §재검토 조건 1 전수 관측 (계수는 **차단하지 않는다** — 관측은 기계, 판단은 사람) |

  exit `0` = 위반 0 / `1` = 위반 또는 **판정 불가**(base 미해석 포함 — 조용한 통과 없음) / `2` = 실행 에러(인자 오류·prettier 바이너리 부재 등 환경 오류. **`--self-test` 포함 전 모드 동일**). 예외·allowlist·`|| true` 없음. FAIL 을 만나면 **범위 표기를 인라인 코드로 감싸는 것**이 최저 마찰 대응이고 그것이 곧 위 표준 절차다.

  ⚠️ **"차단하지 않는다" 와 "관측하지 않는다" 는 다르다.** `--population` 만 두면 ADR §재검토 조건 1 의 트리거가 **무관측**으로 남는다 — 규범만 있고 발화 지점이 0 이라는, 이 절이 닫으려던 바로 그 형태가 한 단계 위에서 재현된다([#897](https://github.com/coseo12/astro-simulator/issues/897) *"CI 미배선 self-test = 0회 실행"* 의 관측 모드 변형). 그래서 `--staged` / `--base` 가 diff 안에서 **prettier 소유 md 의 신규 추가**를 발견하면 통지 2줄을 낸다. **exit code 는 바뀌지 않는다.**

- **실측 — 모집단은 `CHANGELOG.md` 로 한정한다.** 손상형 **19 줄 / 33 발생 / 31 고유 종**, **전부 코드 펜스 밖**(= 실제 렌더링 손상)이며 **19 줄 전건이 릴리스 확정 구간**이다(`[Unreleased]` 내 **0**). ⚠️ **이 값은 하한이다** — 위 술어는 `~~` 양쪽이 영숫자인 경우만 잡으므로 경계가 `#`·`(`·**공백**인 손상을 놓친다(예: `:623` 의 `#320~~#324`, `:1219` 의 `#2~~#4`, `:786` 의 ` ~~345px`). `~~` 전량으로 재면 **22 줄 / 45 발생**이고, 그중 의도된 취소선을 걸러낸 회수 후보는 **21 줄 / 44 발생**이다. **"여는 `~~` 앞이 공백이면 의도된 취소선" 이라는 대조 규칙은 쓰지 마라** — ` ~~345px` 같은 실손상을 의도분으로 분류한다. 술어 확정은 [ADR 20260814-982](../decisions/20260814-982-changelog-tilde-guard.md) 가 마쳤고(위 §정본 술어), [#1040](https://github.com/coseo12/astro-simulator/issues/1040) 에 남은 것은 **존량 회수 가부** 판정이다. 예: `` R1~~R4 `` · `` 7~~12 `` · `` 92k~~122 `` — 원래 `R1~R4` 등 단일 `~` 범위 표기였다. 술어 rev `42e9618` 과 본 커밋에서 **같은 값**이다(본 라운드 편집이 `CHANGELOG.md` 에 손상형을 더하지 않았음을 실측 확인).
- ⚠️ **넓은 그물(`-F -- '~~'`)의 hit 수와 _본 문서 자신의_ 손상형 계수는 고정값으로 싣지 않는다 — 자기 참조 계수다.** 위 예시·시연 문자열이 그대로 모집단에 들어가므로 이 절을 고칠 때마다 값이 움직인다(초판이 `47` 로 적었다가 본 문단을 추가하자 `53` 이 됐다). 재측정 시 **본 문서의 예시는 모집단에서 뺀다.** 판정에 쓰는 값은 위 `CHANGELOG.md` 한정 계수이고, 그쪽은 자기 참조가 아니라 안정적이다.
- **회수는 본 절의 범위가 아니다** — 19 줄 전건이 릴리스 확정 구간이라 *"기록 위조 금지"* 와 *"렌더링 결함 정정"* 중 무엇인지 **별도 판정**이 필요하다. 후속 [#1040](https://github.com/coseo12/astro-simulator/issues/1040) 으로 분리했고, 본 절은 **작성 시점 예방**만 담당한다.
  - ⚠️ **[2026-08-14 — 판정 완료, `#1040`]** 위 두 문단의 계수(`19 줄 / 33 발생` · `21 줄 / 44 발생`)와 _"판정이 필요하다"_ 는 **그 시점 서술이라 보존한다**(소급 편집은 기록 위조 — [`20260808-983`](../decisions/20260808-983-measurement-recording-convention.md) §결과 3). 판정 결과는 [ADR `20260814-1040`](../decisions/20260814-1040-changelog-tilde-recovery.md) 이며 **회수 채택**이다 — 예외 경계는 사람의 선언이 아니라 그 ADR §결정 2 의 **4항 기계 술어**(손상 보유 라인 한정 / 백틱·물결 정규화 후 문자열 동일 / 잔존 0)다. 회수 후 `CHANGELOG.md` 의 술어 C 위반은 **0 줄 / 0 발생**(rev `fe922bb` 기준 회수분 `21 줄 / 44 발생`)이고, **본 절의 담당 범위는 그대로 작성 시점 예방**이다.
- 근거: [#1013](https://github.com/coseo12/astro-simulator/issues/1013) — PR [#1038](https://github.com/coseo12/astro-simulator/pull/1038) 작성 중 CHANGELOG 산문의 `kw1~5` 가 실제로 이 경로로 손상됐고(커밋 전 발견), reviewer 가 격리 재현(`printf … | prettier --parser markdown`)으로 독립 확인했다. 강제 지점·정본 술어는 [#982](https://github.com/coseo12/astro-simulator/issues/982) / [ADR 20260814-982](../decisions/20260814-982-changelog-tilde-guard.md).

### 7-2. `.prettierignore` negative-test 의 `--ignore-path` 거짓 PASS (#1063)

`.prettierignore` 를 변형해 실험할 때 **변형본을 리포 밖(`/tmp` 등)에 두고 `--ignore-path` 로 넘기면
안 된다.** prettier 의 ignore 패턴은 **그 ignore 파일이 놓인 디렉토리** 를 기준으로 해석되므로, 리포 밖에
두면 `/` 를 포함한 **앵커된 패턴이 통째로 무효**가 된다. 대상이 전부 `ignored: false` 로 보이고, 그것이
곧 *"negation 이 작동한다"* 는 **거짓 PASS** 다.

실측 (rev `38b6c8a`, prettier `3.9.6` = lockfile 정본. **같은 `.prettierignore` 내용**을 두 위치에 두고
`--file-info` 대조):

| 대상 파일 | 매칭 패턴 | 리포 루트 배치 | `/tmp` 배치 |
| --- | --- | --- | --- |
| `docs/decisions/20260814-982-….md` | `docs/**` (앵커) | `true` | **`false`** ← 무효화 |
| `.claude/agents/developer.md` | `.claude/**` (앵커) | `true` | **`false`** ← 무효화 |
| `.github/PULL_REQUEST_TEMPLATE.md` | `.github/PULL_REQUEST_TEMPLATE.md` (앵커) | `true` | **`false`** ← 무효화 |
| `CLAUDE.md` | `CLAUDE.md` (**베어 이름**) | `true` | `true` ← **살아남는다** |

⚠️ **대조군을 잘못 고르면 함정이 숨는다.** 슬래시가 없는 **베어 이름 패턴**(`CLAUDE.md` ·
`node_modules` · `dist`)은 gitignore 문법상 **모든 깊이에 매칭**되므로 위치를 옮겨도 계속 `true` 다.
`CLAUDE.md` 하나만 대조군으로 두면 *"대조군이 살아 있으니 측정은 정상"* 이라는 결론이 나온다.
**대조군은 반드시 앵커된 패턴(`/` 포함)에서 고른다.**

**표준 절차** — 변형본을 **리포 루트에 임시 파일명으로** 두고 `--ignore-path` 로 가리킨 뒤 즉시 지운다:

```bash
# trap 을 먼저 건다 — 중간 실패·중단에도 잔존 0 (cross-validate agy 2026-08-14 채택)
trap 'rm -f .prettierignore.trial' EXIT
sed 's#^!docs/x/\*\*/\*-old\.md$#!docs/x/**/*.md#' .prettierignore > .prettierignore.trial
pnpm exec prettier --ignore-path .prettierignore.trial --file-info <대상>   # 앵커 패턴 유효
```

⚠️ **`rm` 을 마지막 줄에 두면 부족하다** — 가운데 줄이 실패하거나 사람이 중단하면 `.prettierignore.trial`
이 **untracked 로 남는다**. 실측: `git check-ignore -v .prettierignore.trial` → **NOT ignored**
(`.gitignore` 에 해당 패턴 **`0` 건**), `git status --porcelain` 에 `??` 로 뜬다. 이 저장소는 그
잔존물 목록을 **sub-agent 반환 게이트**로 쓰므로 다음 에이전트가 정체불명 untracked 를 물려받는다.
그래서 `trap … EXIT` 로 **획득 즉시 해제를 예약**한다.

⚠️ **`.gitignore` 에 `.prettierignore.trial` 을 추가하는 처방은 기각한다** — 그 파일은 **존재 자체가
이상 신호**(정리 누락)라서 무시 대상으로 만들면 신호가 사라진다. 잔존을 *"보이게 두되 생기지 않게"*
하는 것이 맞고, `trap` 이 정확히 그 형태다.

- **감지 신호**: 대조군까지 `ignored: false` 로 뒤집히면 측정 자체를 의심한다. 실제로 PR
  [#1061](https://github.com/coseo12/astro-simulator/pull/1061) qa 가 **자기 측정에서 이 신호로 거짓
  PASS 를 적발**하고 리포 루트 배치로 재측정했다.
- **정본 계수 술어는 따로 있다** — 모집단 계수는 `node scripts/verify-md-tilde.mjs --population`
  (기본 `.prettierignore` 를 그대로 쓰므로 본 함정에 노출되지 않는다). `--ignore-path` 는 **변형 실험
  전용**이다.
- 근거: [#1063](https://github.com/coseo12/astro-simulator/issues/1063) — PR #1061 qa 동적 검증에서
  자기 적발. 본 절은 `.prettierignore` 를 negative-test 하는 **모든 후속 작업**에 재발하므로 §7 인접에 둔다.

## 8. 격리 worktree 의 워크스페이스 의존 명령 결손 — `pnpm build` 선행 (#960, #1062)

**1순위 — 기존 명령 2개.** 격리 worktree 에서 **워크스페이스 패키지(`@astro-simulator/*`)를 해석하는
명령**을 돌려야 하면, §7 이 의무화한 `pnpm install --frozen-lockfile` **다음에 `pnpm build` 를 한 번 더**
돌린다. **신규 스크립트를 만들지 않는다** — 이미 있는 명령이다.

```bash
pnpm install --frozen-lockfile     # exit 0          (§7 의 1순위)
pnpm build                         # exit 0          ← §7 에 없던 부분
pnpm test:unit                     # exit 0          ┐ 의존 집합 — 아래 매트릭스
pnpm typecheck                     # exit 0          ┘
```

세 단계 모두 exit `0` 이며, **추가되는 것은 `pnpm build` 한 줄뿐**이다. 소요는 `install` 과 **같은
자릿수**라 절차를 늘릴 이유가 되지 못한다 — 절대 수치는 아래 §측정 조건 불릿의 스냅샷을 본다.

⚠️ **트리거는 `typecheck` 가 아니다** (#1062). 본 절 초판과 `developer.md` 사본은 *"`typecheck` 를
돌리려면"* 이라고 적었는데 **좁다** — 아래 축 (ii) 는 `test:unit` 도, `pnpm dev` 도 똑같이 깨뜨린다.
`test:unit` 만 돌리는 에이전트는 레시피에 **도달하지 못한 채** 화면의 *"테스트 30개 실패"* 를 자기
변경 탓으로 오진한다. PR [#1061](https://github.com/coseo12/astro-simulator/pull/1061) 이 실제로 그
직전까지 갔고, 메인이 디스패치 프롬프트에 본 절을 통째로 넣어서 피했을 뿐이다 — #960 이 인용한
*"2회 반복 오진"* 과 같은 형태다.

CI 의 `setup-and-build` composite (워크플로 8개가 소비) 이 수행하는 것과 **같은 2 명령**이다 — 로컬
절차가 CI 를 미러링하므로 절차의 두 번째 출처가 생기지 않는다 (volt [#120](https://github.com/coseo12/volt/issues/120)).

**증상은 오진 유발형이다.** `install` 만 하고 typecheck 를 돌리면 exit `2` 이고, 그때 화면에 보이는
토큰이 **`TS2882`** 와 **`TS2307`** 이다. 실제 결손은 레시피 부재가 아니라 **오진**이므로 (원인을
`next-env.d.ts` 하나로 지목한 보고가 2회 있었다) 이 절은 그 두 리터럴로 검색돼야 한다.

**결손 2축** — 실측 (rev `8e230e3`, `install` 직후 baseline = exit `2` / `error TS` **76 행**):

| 축 | 결손 (둘 다 gitignored 빌드 산출물) | 증상 토큰 | 행 | 닫는 명령 |
| --- | --- | --- | --- | --- |
| (i) | `apps/web/next-env.d.ts` 부재 | **`TS2882`** — `app/layout.tsx` 의 CSS side-effect import | `2` | `next build` (= `pnpm build` 내부) |
| (ii) | `packages/{shared,core}/dist` + `packages/physics-wasm/{pkg,pkg-bundler}` 부재 | **`TS2307`** — `Cannot find module '@astro-simulator/shared'` · `'@astro-simulator/core'` · `'@astro-simulator/physics-wasm'` | `52` + 파생 `22` | `-r build` (= `pnpm build` 내부) |

⚠️ **축 (ii) 의 결손 대상은 셋이다** (#1062 재측정에서 추가). 초판 표는 `dist` 둘만 적었으나
`packages/core` 는 `@astro-simulator/physics-wasm` 도 못 찾는다 — 루트 `typecheck` 의 `TS2307` `28`
행은 `shared` `24` + `physics-wasm` `4` 로 갈린다. 세 번째는 `wasm-pack` 산출물이라 `dist` 가 아니고
(`pkg` / `pkg-bundler`), `pnpm build` 는 셋을 모두 만든다. ⚠️ **`packages/physics-wasm` 의 `test` 는
`prebuild-test` 훅으로 `pkg` 를 자가 생성**하므로, `test:unit` 을 먼저 돌린 뒤 `typecheck` 를 돌리면
`TS2307` 이 `28` 이 아니라 `24` 로 관측된다 — 아래 매트릭스가 **측정 순서**를 병기하는 이유다.

⚠️ **축 (ii) 는 baseline 부터 존재한다** — 축 (i) 을 고쳐야 "드러나는" 것이 아니다. `TS2882` 가
헤드라인이라 그렇게 보일 뿐이고, `next-env.d.ts` 만 채우면 **74 행이 남는다**. 파생 `22` 행은
`TS2307` 로 타입이 유실되며 생기는 implicit-any 계열이다 (`TS7006` 13 / `TS18048` 4 / `TS2339` 4 / `TS7031` 1).

⚠️ **왜 `install` 만으로는 안 되는가** — §7 의 `pnpm install` 은 `node_modules` 를 세울 뿐
**빌드 산출물을 만들지 않는다**. 두 축은 모두 빌드 산출물이고 모두 gitignored 다. 본 절은 §7 의
**확장이지 대체가 아니다** (`install` 은 여전히 1순위 선행 단계다).

### 8-1. 어느 명령이 의존 집합인가 — 전수 매트릭스 (#1062)

**측정 조건**: rev `38b6c8a` / macOS / `git worktree add` 직후 `pnpm install --frozen-lockfile` 만
수행한 상태에서 **아래 표 순서대로** 1회씩 호출 (`pnpm build` 는 최후). 순서를 병기하는 이유는 위
`prebuild-test` 자가 생성 때문이다. exit code 는 파이프 없이 `$?` 로 채취했다.

**모집단 = 루트 `package.json` 의 `scripts` 전건 `47` 개** (술어: `node -e "console.log(Object.keys(require('./package.json').scripts).length)"`).
아래 4 분류가 `47` 을 **덮는다** (`4 + 14 + 24 + 5 = 47`). ⚠️ *"전건 실측"* 은 **47 개를 다 실행했다는
뜻이 아니다** — 실행한 것은 아래 두 표의 `18` 개(의존 `4` + 비의존 `14`)이고, 나머지 `29` 개는
**분류 술어로 귀속**시킨 뒤 각 분류의 **대표 1~3 개만 실행해 확인**했다. 무엇이 실측이고 무엇이
귀속인지 아래 표가 구분한다.

| 분류 | 계수 | 판정 근거 |
| --- | ---: | --- |
| **의존 집합** | `4` | `dev` · `build` · `typecheck` · `test:unit` — **전건 실행** |
| **비의존 집합** | `14` | `lint` · `lint:core` · `lint:shared` · `format:check` · `check-encoding` · `verify:{test-coverage,iau-data,no-scientific-grep,zombie-check,dead-wait-check,docs-links,adr-index,r1-tier-untouched,md-tilde}` — **전건 실행**, 전부 exit `0` |
| **브라우저/서버 계열** | `24` | 스크립트 본문이 `browser-verify-utils` 또는 `localhost:` 를 참조 (술어: 아래 코드블록). `bench:scene` · `bench:scene:mobile` · `bench:scene:sweep` · `bench:tier-guard-cost` · `bench:webgpu` **5 종이 여기 속한다**. 대표 `3` 개 실행 → 전부 exit `1` / `ERR_CONNECTION_REFUSED` |
| **기타** | `5` | `clean` · `prepare` · `format` (파괴적·부수효과라 미실행) · `verify:all` (위 계열들의 합성) · `bench:scene:set-baseline` |

```bash
# 브라우저/서버 계열 귀속 술어 — scripts 값에서 .mjs 경로를 뽑아 본문을 검사
node -e '
const s=require("./package.json").scripts, fs=require("fs");
for (const n of Object.keys(s)) {
  const m=(s[n].match(/(?:apps\/web\/)?scripts\/[a-z0-9-]+\.mjs/)||[])[0]; if(!m) continue;
  try { if(/browser-verify-utils|localhost:/.test(fs.readFileSync(m,"utf8"))) console.log(n); } catch {}
}' | wc -l      # → 24
```

⚠️ **`bench:scene:set-baseline` 은 세 집합 어디에도 넣지 않는다.** 실행하면 exit `1` 이지만 사유가
**선행 bench 리포트 부재**(`리포트 없음. 먼저 bench를 실행하세요.`)라 축 (ii) 와도 서버 부재와도
무관한 **제3 사유**다. *"exit 1 이니 의존 집합"* 으로 묶으면 분류가 거짓이 된다 — 브라우저 계열의
`ERR_CONNECTION_REFUSED` 를 (ii) 로 세지 않는 것과 같은 이유다.

**의존 집합 — `install` 만으로는 깨진다:**

| 명령 | `install` 만 | `install` + `build` | 축 |
| --- | --- | --- | --- |
| `pnpm typecheck` | exit `2` / `error TS` **`29`** 행 (`TS2307` 28 · `TS2322` 1). **`packages/core` 에서 중단** | exit `0` | (ii) |
| `pnpm --filter web typecheck` | exit `2` / `error TS` **`76`** 행 (`TS2307` 52 · `TS7006` 13 · `TS2339` 4 · `TS18048` 4 · **`TS2882` 2** · `TS7031` 1) | exit `0` | (i) + (ii) |
| `pnpm test:unit` (= `pnpm -r test`) | exit `1` / `packages/core` **`Test Files 30 failed \| 26 passed (56)`**. **거기서 중단** | exit `0` (`1,370` passed) | (ii) |
| `pnpm --filter web test` | exit `1` / `12 failed \| 33 passed` (45 파일) | exit `0` (`527` passed) | (ii) |
| `pnpm --filter web build` | exit `1` / `Module not found` **`19`** 건. `next-env.d.ts` **미생성** (typegen 이전에 실패) | exit `0` | (ii) |
| `pnpm dev` (`next dev`) | ⚠️ **exit code 로 드러나지 않는다** — 서버는 `✓ Ready` 로 뜨고 종료하지 않는다. `GET /` 가 **HTTP `500`** (`Module not found: Can't resolve '@astro-simulator/core'`) | `GET /` = HTTP `200` | (ii) |
| 브라우저 계열 `verify:*` (`verify:a11y-baseline` · `verify:hud-contrast` · `verify:fps-baseline` …) | exit `1` / `ERR_CONNECTION_REFUSED` — **서버 부재라는 직교 사유**. 서버를 띄워도 위 500 때문에 무의미 | — | (ii) 경유 |

**비의존 집합 — `install` 만으로 exit `0`:**

| 명령 | `install` 만 |
| --- | --- |
| `pnpm lint` · `lint:core` · `lint:shared` | exit `0` (eslint 는 cross-package 타입 해석을 하지 않는다) |
| `pnpm format:check` | exit `0` |
| `pnpm check-encoding` | exit `0` |
| `verify:test-coverage` · `verify:iau-data` · `verify:no-scientific-grep` · `verify:zombie-check` · `verify:dead-wait-check` · `verify:docs-links` · `verify:adr-index` · `verify:r1-tier-untouched` | exit `0` |
| `verify:md-tilde --population` | exit `0` (인자 없이 부르면 exit `2` — **사용법 오류**이지 결손이 아니다) |

⚠️ **`pnpm -r` 는 첫 실패에서 멈춘다** (`ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`). 그래서 루트
`typecheck` / `test:unit` 은 `packages/core` 에서 끊겨 **`apps/web` 에 도달하지 못하고**, 축 (i)(`TS2882`)
이 루트 명령에서는 **아예 보이지 않는다**. 위 표의 `29` 와 `76` 이 갈리는 이유이며, 본 절의 baseline
스냅샷이 `--filter web` 기준인 이유이기도 하다. **두 축은 독립적으로 발화한다** — 축 (i) 을 닫아도
축 (ii) 는 남고(`74` 행), 축 (ii) 만 걸리는 명령(위 표의 나머지 전부)은 축 (i) 을 영영 노출하지 않는다.

⚠️ **`test` 축은 독립 재현 2건이 있다 — 그리고 계수를 인용할 때 단위를 밝혀야 한다.**
PR [#1061](https://github.com/coseo12/astro-simulator/pull/1061) dev 보고와 PR
[#1070](https://github.com/coseo12/astro-simulator/pull/1070) dev 의 부수 관찰(2026-08-14, 격리
worktree)이 각각 독립적으로 같은 결손을 재현했고, 본 절 실측과 **파일 계수가 정확히 일치**한다
(`30 / 56`). ⚠️ **`pnpm -r test` 와 `test:unit` 은 다른 결손이 아니다** — 루트 `package.json` 의
`"test:unit": "pnpm -r test"` 이므로 **문자 그대로 같은 명령**이다.

그런데 같은 실행에서 **두 개의 다른 계수**가 나온다. 둘 다 참이며 **단위가 다르다**:

| 계수 | 값 | 무엇을 세는가 |
| --- | ---: | --- |
| 실패 **스위트(파일)** | **`30`** | Vitest `Failed Suites` 헤드라인 · `Test Files 30 failed` |
| 출력된 **에러 블록** | **`28`** | `Failed to resolve entry for package "@astro-simulator/shared"` 문자열 등장 수 |

차이 `2` 는 **Vitest 가 연속한 스위트의 동일 에러를 한 블록으로 묶기 때문**이다 (실측: `long-term-drift` ↔
`time-reversal`, `log-depth-glsl` ↔ `ring-shader-arcs` 두 쌍이 `FAIL` 라인 2개에 `Error:` 블록 1개를
공유한다). 원인은 `30` 건 전부 동일하다. **인용할 때는 단위를 붙인다** — *"28 건"* 만 적으면 다음
관찰자가 `30` 을 보고 불일치로 오인한다 (본 라운드에 실제로 그 대조가 발생했고, 단위 규명으로 해소됐다).

⚠️ **가장 위험한 항목은 `pnpm dev` 다.** 나머지는 전부 non-zero exit 로 자기를 신고하지만 dev 서버는
`✓ Ready` 를 찍고 살아 있는다. 브라우저 검증을 붙이면 *"서버는 떴는데 화면이 비어 있다"* 로 보여
**앱 코드 회귀로 오진**하기 가장 쉬운 형태다 (CLAUDE.md §빌드 성공 ≠ 동작하는 앱 의 격리 worktree 변형).

**⚠️ `next-env.d.ts` 를 "표준 2줄" 로 손수 쓰지 마라.** 축 (i) 만 닫고 (ii) 를 남기는 것이 첫 번째
이유이고, 더 근본적으로 **그 2줄은 표류하는 산출물의 한 스냅샷**이다. 실제 파일은 6줄이며 생성
명령에 따라 내용이 갈린다 (동일 worktree · 동일 rev · 동일 Next `16.2.12` 실측):

| 생성 명령 | import 행 | md5 |
| --- | --- | --- |
| `next build` / `next typegen` | `import "./.next/types/routes.d.ts";` | `2a74d3909800ca5467fa83b0ab4a4890` |
| `next dev` | `import "./.next/dev/types/routes.d.ts";` | `d0f8375ae1199dc7acd3977fc33b78b8` |

`next dev` 를 띄우면 **기동 직후** (실측 `1~2s` — 관측 폴링 간격이 `1s` 라 이 값이 곧 해상도 하한이다)
덮어써진다. 상한이 `1s` 든 `2s` 든 논지는 같다. 가변 산출물을 절차 문서에
하드코딩하는 것은 이 파일을 tracked 로 만드는 것(옵션 B)과 **같은 실패 클래스**를 문서로 옮기는
것에 불과하다 — 둘 다 ADR [`20260814-960`](../decisions/20260814-960-worktree-typecheck-recipe.md) §B-1 이 기각했다. 폴백이 필요하면 아래 first-party 서브커맨드를 쓴다.

**폴백 — Rust 툴체인(`wasm-pack`)이 없어 `pnpm build` 가 불가할 때**:

```bash
pnpm --filter web exec next typegen                                            # 축 (i)  exit 0 / 1s 미만
pnpm --filter @astro-simulator/shared --filter @astro-simulator/core -r build  # 축 (ii) exit 2 ← 예상된 것
pnpm --filter web typecheck                                                    # exit 0  error TS 0 행
```

⚠️ **두 번째 줄의 exit `2` 는 예상된 것이다.** `packages/core` 가 `@astro-simulator/physics-wasm` 을
못 찾아 `TS2307` `4` 건을 내지만, `tsc` 는 `noEmitOnError` 기본값에서 **전량 방출**하므로 `dist` 는
완전하다 — 실측 `core` 의 `.d.ts` **`58` 개** (= `tsconfig.build.json` 이 `exclude` 하는
`__test-utils__` 를 뺀 의도 대상 전량) / `shared` **`11` 개**. 공개 `.d.ts` 의 `physics-wasm` 참조는
**`0` 건**이라 (wasm 핸들이 `private wasm;` 으로 캡슐화) 세 번째 줄이 exit `0` 이 된다.
**exit `2` 를 보고 절차가 실패했다고 판단하지 말 것** — 다만 `&&` 로 체이닝하면 세 번째 줄이
실행되지 않으므로 줄을 나눠 돌린다.

**⚠️ `.tsbuildinfo` 함정 — `rm -rf dist` 만으로는 재빌드가 안 된다.** 레시피를 검증하거나 `dist` 를
강제로 다시 만들 때 걸린다. `packages/*/tsconfig.build.json` 이 `composite: true` 라 남기는
`tsconfig.build.tsbuildinfo` 를 `tsc` 가 보고 up-to-date 로 판정하기 때문이다.

```bash
# 실측 — dist 만 지우면 tsc 가 exit 0 을 내고 아무것도 emit 하지 않는다
rm -rf packages/shared/dist
pnpm --filter @astro-simulator/shared build   # exit 0 인데 dist 미생성 ⚠️

# 완전 초기화 = .tsbuildinfo 까지 지운다
rm -rf packages/shared/dist packages/shared/tsconfig.build.tsbuildinfo
pnpm --filter @astro-simulator/shared build   # exit 0 / dist 재생성 (.d.ts 11개)
```

- **본 건은 정확성 결손이 아니라 개발자 경험 마찰이다 — 단 예외가 하나 있다.** `setup-and-build` 가
  도는 `pnpm build` 안의 `next build` 가 TypeScript 검사를 수행하고 (`apps/web/next.config.*` 에
  `ignoreBuildErrors` **없음**), `packages/{shared,core}` 의 `build` 는 `tsc -p tsconfig.build.json`
  자체라, **앱·라이브러리 소스**의 타입 오류는 CI 를 빠져나가지 않는다. 그래서 처방이 자동화(루트
  `postinstall` / `typecheck` 스크립트 체이닝)가 아니라 **레시피 + 발견가능성**이다 — 기각 근거는
  ADR §D · §E.
  ⚠️ **예외 — `packages/{shared,core}` 의 `*.test.ts` 는 CI 타입 검사 밖이다.** 근거로 든 바로 그
  `tsconfig.build.json` 이 `**/*.test.ts` 를 `exclude` 하고, CI 에는 `typecheck` 를 직접 호출하는
  스텝이 **없다** (`detect-and-test` 의 vitest 는 esbuild 트랜스파일이라 타입 검사가 아니다). 강제
  지점이 없다는 뜻이며 후속 [#1060](https://github.com/coseo12/astro-simulator/issues/1060) 으로
  분리돼 있다. 위 *"빠져나가지 않는다"* 를 무조건형으로 읽지 말 것.
- **측정 조건 (스냅샷)** — 소요는 pnpm store / cargo registry 캐시가 **warm** 한 동일 머신 기준이며,
  `git worktree add` 직후 (`node_modules` 부재) 순차 측정한 값이다. 콜드 머신에서는 특히
  `physics-wasm` (Rust) 이 더 걸린다.

  | rev | `install` | `pnpm build` | `typecheck` (build 후) |
  | --- | --- | --- | --- |
  | `7ca1cd1` (ADR §E) | `4.5s` | `17s` | `3s` |
  | `8e230e3` (본 절) | `4s` | `27s` | `3s` |

  두 값은 **드리프트가 아니라 둘 다 참인 두 사실**이다 (rev·머신 조건이 각각 명시돼 있다). 그래서
  규범면 (위 1순위 코드블록 · `developer.md` 행동 규칙) 에는 절대 수치를 두지 않고 **관계**로만 적는다
  — ADR [`20260808-983`](../decisions/20260808-983-measurement-recording-convention.md) §수치 박제
  규약 (i) 부분 재측정 금지 · (ii) 규범면 관계 표현.

  ⚠️ **#1062 라운드(rev `38b6c8a`)는 이 표에 행을 추가하지 않았다.** 매트릭스를 채취하는 과정에서
  `cargo` · `next` 캐시가 이미 warm 해졌으므로, 같은 세션에서 잰 소요는 위 두 행과 **측정 조건이
  다르다**. 부분 재측정을 섞지 않는다는 같은 규약의 적용이다. 반면 **결손 계수는 재현됐다** —
  `pnpm --filter web typecheck` 의 `error TS` **`76`** 행과 코드별 분해가 rev `8e230e3` 스냅샷과
  **일치**한다 (위 §8-1 매트릭스 2행).

- **에이전트 행동 규칙 사본**: `.claude/agents/developer.md` §규칙 (§7 규약 바로 다음 줄). 본 절이 절차 SSoT 다.
  ⚠️ 트리거 조건은 **두 곳이 같은 낱말이어야 한다** — 초판이 양쪽 다 *"`typecheck` 를 돌리려면"* 으로
  좁게 적었고 #1062 가 양쪽을 동시에 넓혔다. 한쪽만 고치면 사본이 SSoT 를 좁히는 형태가 된다.
- 근거: [#960](https://github.com/coseo12/astro-simulator/issues/960) — 증상 2회 독립 보고
  (PR [#941](https://github.com/coseo12/astro-simulator/pull/941) · [#959](https://github.com/coseo12/astro-simulator/pull/959)).
  판정은 ADR [`20260814-960-worktree-typecheck-recipe.md`](../decisions/20260814-960-worktree-typecheck-recipe.md)
  (옵션 `A~E` 비교 — C 채택, B·D·E 기각). 선행은 §7 [#952](https://github.com/coseo12/astro-simulator/issues/952) 의 `install` 규약.
  트리거 조건 확장과 §8-1 전수 매트릭스는 [#1062](https://github.com/coseo12/astro-simulator/issues/1062)
  — #960 DoD 3 검증(PR [#1061](https://github.com/coseo12/astro-simulator/pull/1061) dev 보고) 에서
  축 (ii) 가 `test:unit` 을 깨뜨린다는 것이 처음 실증됐다.
