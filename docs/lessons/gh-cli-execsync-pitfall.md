# gh CLI 마크다운 본문 발송 — execSync shell metachar 함정

> CLAUDE.md `### gh CLI 마크다운 본문 발송 — execSync shell metachar 함정` 가지치기 위임 (이슈 #266 / PR #290). CLAUDE.md 본문은 1줄 포인터만 유지. **근거**: volt [#114](https://github.com/coseo12/volt/issues/114).

Node.js 에서 `execSync('gh pr comment N --body "..."')` 로 마크다운 본문 (백틱 / `$` / `!` / `;` 등 특수 문자 포함) 발송 시 **shell metachar 가 명령 치환·변수 확장으로 해석**되어 syntax error 발생. 자동 코멘트 / actionable 보고 발송이 silent fail.

> **사거리 (#996)**: 위험한 것은 **명령의 이름이 아니라 문자열이 셸 파서에 닿는 경로**다. `gh` 계열뿐 아니라 **`git commit -m`** 도 같은 클래스다. 피해 크기를 가르는 것은 명령이 아니라 **어떤 metachar 인가**이며 (아래 §위험 비대칭), 대상 판정은 §사거리.

## 증상

두 갈래이고, **위험한 쪽은 조용한 쪽**이다.

- **시끄러운 실패** — `/bin/sh: 1: Syntax error: end of file unexpected` 등 shell 단계 에러. exit non-zero 라 즉시 드러난다.
- **조용한 성공** — 백틱·`$` 가 치환·확장되어 **exit 0 으로 성공**하고, 본문 일부가 **통째로 사라진 채** 박제된다. 되돌릴 수 없다.

## 원인

`execSync(string)` 는 `/bin/sh -c <string>` 으로 실행 → shell 이 본문의 `` ` `` 백틱을 명령 치환으로 해석. `JSON.stringify` 의 백슬래시 이스케이프는 shell parser 에 도달 시 무력화.

### 리터럴만 위험하다 — 확장 결과는 재파싱되지 않는다

셸은 **변수 확장 결과를 metachar 로 다시 훑지 않는다**. 따라서 위험한 것은 *명령줄에 리터럴로 박힌* metachar 뿐이다.

```sh
body='has `date` and $HOME and <TOK>'
printf 'A|%s|\n' "$body"     # -> A|has `date` and $HOME and <TOK>|   (원문 보존)
/bin/sh -c 'printf "%s" "has `echo GONE` and $HOME"'   # -> has GONE and /Users/...  (exit 0)
```

이 구분이 사거리를 가른다 — `.sh` 스크립트 안의 `--body "${body}"` 는 **안전**하고, 에이전트가 Bash 도구에 **리터럴로 타이핑한** ``--body "... `x` ..."`` 는 **위험**하다.

### 큰따옴표가 막아주는 것과 못 막는 것 (실측)

```sh
for m in '<TOK>' 'a;b' 'a!b' 'a|b' 'a&b' '$VAR' '`cmd`' '$(cmd)'; do
  /bin/sh -c "printf '%s\n' \"pre ${m} post\""
done
```

| 큰따옴표 안 metachar         | 결과                        | 판정                        |
| ---------------------------- | --------------------------- | --------------------------- |
| `<TOK>` `a;b` `a!b` `a\|b` `a&b` | 그대로 출력 (`pre <TOK> post`) | **리터럴 — 안전**           |
| `$VAR`                       | 빈 문자열로 확장            | **조용한 소실**             |
| `` `cmd` `` / `$(cmd)`       | 명령 치환 (stderr 만 남음)  | **조용한 소실**             |

즉 **큰따옴표는 `<` `>` `;` `!` `|` `&` 를 이미 막아준다.** 남는 위험은 `` ` `` 와 `$` **둘뿐**이며, 이 둘은 큰따옴표를 뚫는다. `<` 가 리다이렉트로 터지는 것은 **따옴표가 없거나 앞선 백틱이 따옴표를 깨뜨린 뒤**의 이야기다 (`git commit -q -m fix:\ guard\ <CONST_NAME>` → `syntax error near unexpected token`, exit `2`).

## 해결 — `spawnSync` + stdin (3축 우회)

Node.js 에서 `gh` 를 호출할 때:

1. `spawnSync('gh', [...args])` — args 배열로 분리 (shell 미사용)
2. `--body-file -` — stdin 으로 본문 전달 (OS arg limit 회피)
3. `{ input: body, stdio: ['pipe', 'inherit', 'inherit'] }` — Node.js 가 child stdin 에 자동 pipe

### 변형 — `git commit -m` (#996)

셸에 직접 타이핑하는 경우 (에이전트의 Bash 도구 포함) 는 `spawnSync` 가 없으므로 **`-F` 로 우회**한다.

```sh
git commit -F - <<'EOF'
docs: threshold `n>=3` rule with $VAR and <TOK>
EOF
```

**따옴표 친 heredoc (`<<'EOF'`) 이 핵심**이다 — 구분자를 따옴표로 감싸면 본문이 파라미터 확장·명령 치환 대상에서 빠진다. 위 명령은 `` `n>=3` `` / `$VAR` / `<TOK>` 를 **전부 원문 그대로** 기록한다 (실측). 파일 경로를 쓰는 `git commit -F <file>` 도 동일하게 안전하다.

`-m` 자체가 금지는 아니다. **`-m "$MSG"` 처럼 변수를 넘기는 것은 안전**하고 (위 §리터럴만 위험하다), 위험한 것은 metachar 를 **리터럴로 적어 넣은** `-m` 이다.

### 위험 비대칭 — 시끄러운 실패는 안전하고, 조용한 성공이 영구 기록된다

이 클래스에서 **실패 방식이 두 갈래로 갈리고, 비용이 정반대**다. 갈림은 **명령이 아니라 metachar 종류**로 결정된다 — 같은 `git commit -m` 이 `<` 에서는 시끄럽게 죽고 `` ` `` 에서는 조용히 성공한다.

| 사례                                            | exit | 결과                                              | 비용                     |
| ----------------------------------------------- | ---- | ------------------------------------------------- | ------------------------ |
| `git commit -m` + 따옴표 밖 `<`                 | `2`  | 커밋 자체가 실패                                  | **즉시 드러남** — 재시도 |
| ``git commit -m "... `n>=3` ..."`` (staged 있음) | `0`  | `docs: threshold  rule` 로 기록 (`n>=3` 소실)      | **영구 기록**            |
| `git commit -m "... $CONST_NAME ..."`           | `0`  | `fix: rename  to newName` 로 기록 (`$CONST_NAME` 소실) | **영구 기록**            |
| ``gh issue comment --body "... `n≥3` ..."``     | `0`  | `n≥3` 이 통째로 소실된 채 코멘트 박제              | **영구 기록**            |

이슈 [#996](https://github.com/coseo12/astro-simulator/issues/996) 은 한 세션에서 이 클래스를 2회 밟았다 — `gh issue comment` 의 `n≥3` 소실(마지막 행, **조용한 성공**)과 `git commit` 실패(**시끄러운 실패**). **드러난 것은 후자뿐**이고, 전자는 exit `0` 이라 사람이 눈으로 발견했다. exit code 는 이 함정의 경보가 되지 못한다.

> **이슈 서술의 정밀화 (실측)** — 이슈는 `git commit` 실패를 ``-m "... <CONST_NAME> ..."`` 로 적었으나, **큰따옴표가 온전하면 `<` 는 리터럴이라 실패하지 않는다** (위 표 1행). 따옴표가 없거나 앞선 백틱이 따옴표를 깨뜨린 경우에만 리다이렉트로 해석된다. 실패했다는 사실이 곧 **따옴표가 이미 깨져 있었다**는 뜻이다.

## 선택 가이드

- **Node.js 에서 `gh` 호출** — 본문이 사용자/template 생성이면 `spawnSync` + stdin **의무**. `execSync` 는 고정 문자열 + 환경 변수 없는 명령에만 사용.
- **셸에 직접 타이핑 (에이전트 Bash 도구)** — 본문에 `` ` `` 또는 `$` 가 리터럴로 하나라도 있으면 `--body-file -` / `git commit -F -` + 따옴표 친 heredoc **의무**. `<` `>` `;` 만 있으면 큰따옴표로 충분하다.
- **`.sh` 스크립트 안에서 변수 전달** — `--body "${body}"` 는 그대로 안전. 바꿀 필요 없다.

## 사거리 (#996)

_"셸을 경유해 마크다운·코드를 전달하는 모든 명령"_ 으로 일반화하되, **이 저장소에서 실제로 쓰이는 것만** 나열한다 (`git grep` 실측 — 쓰지 않는 명령을 적으면 잡음).

**대상 (리터럴 타이핑 경로)**

- `git commit -m` — 전 에이전트 상시 사용
- `gh issue create --body` — `.claude/agents/pm.md:109`, 그리고 **라이브 반례** 아래
- `gh issue comment --body` — `.claude/skills/create-issue/SKILL.md:62`

> ⚠️ **라이브 반례 — 자매 문서가 위험 형태를 템플릿으로 싣고 있다.** [`docs/lessons/workflow-dispatch-pitfalls.md`](workflow-dispatch-pitfalls.md) `:74` · `:89` 의 `gh issue create --body "$(cat <<HEREEND` 는 **구분자에 따옴표가 없다**. 위 §변형 이 _"따옴표 친 heredoc 이 핵심"_ 이라고 못박은 바로 그 지점의 반례다. 현재 본문에 metachar 가 없어 무해하지만, 에이전트가 그 템플릿에 실제 내용을 채우면 조용히 손상된다 (`<<'HEREEND'` → `` `n>=3` `` · `$VERSION` 보존 / `<<HEREEND` → `GONE` · `9.9.9` 로 확장 — 실측). **해당 문서 수정은 본 PR 범위 밖이며 후속 [#1045](https://github.com/coseo12/astro-simulator/issues/1045) 가 흡수한다.**

**대상 아님 (실측 근거)**

- `gh pr edit` — **`--body` 사용처 0**. 실사용 플래그는 `--add-label` / `--remove-label` / `--base` / `--title` 이며, `--title` (`docs/skills-guide.md:22`) 은 본문이 아니라 한 줄 제목이라 마크다운 전달 경로가 아니다
- `gh release create --notes` — `--notes` 를 리터럴로 넘기는 사용처 0 (`gh release create <tag>` / `--target` 만)
- `gh pr create --body` — `create-pr` 스킬 경유가 **의무**라 직접 호출 자체가 금지 (에이전트 5개 파일에 박제)
- `scripts/verify-pr-template-checklist.mjs` — 이미 `spawnSync` + `--body-file -` (volt #114 fix 적용분)
- `.claude/skills/cross-validate/scripts/cross_validate.sh` — `--body "${body}"` 변수 확장이라 §리터럴만 위험하다 에 의해 안전
- `.claude/skills/{create-issue,capture-volt,create-pr}/SKILL.md` — 이미 `--body "$(cat <<'EOF'` **따옴표 친 heredoc** (`create-issue:48` / `capture-volt:125`·`:156` / `create-pr:56`)

> 마지막 항목은 단순 제외가 아니라 **처방의 실현성 근거**다 — 본 문서가 §변형 에서 제시한 형태가 저장소 스킬 3종에 **이미 정착해 있었다**. 신규 관행을 요구하는 게 아니라, `git commit` 과 위 반례가 그 관행에서 빠져 있었을 뿐이다.

## 회귀 가드 — 채택 기각 (#996)

_"커밋 메시지에 백틱·`$` 가 있는데 `-F` 를 안 쓴 것"_ 을 정적으로 잡는 가드는 **기각**한다. 선례([ADR 20260808-983](../decisions/20260808-983-measurement-recording-convention.md) §Amendment 2, #1006) 를 따라 **검출**과 **판정**을 분리해 적는다 — _"원리적 불가"_ 단정은 그 선례에서 한 줄의 grep 으로 반증된 적이 있다.

**축 1 — invocation 방식이 어디에도 기록되지 않는다 (기계 재현 가능).** 같은 메시지를 `-F -` 와 `-m` 으로 각각 커밋한 뒤 객체를 비교하면 필드 집합이 **완전히 동일**하다.

```sh
M='docs: rule for `x` and $y'
git commit -F - <<<"$M"   # 그리고
git commit -m "$M"
for h in $(git log -2 --format=%H); do git cat-file -p $h; done
# -> 양쪽 다 tree / parent / author / committer / <message> 뿐. invocation 필드 없음
```

`git log` 이 노출하는 **커밋 객체 필드**는 위 `cat-file` 출력이 전부다 — 즉 _"placeholder 를 못 찾았다"_ 가 아니라 **객체가 닫힌 자료구조라 노출할 대상이 없다**. 커밋 이력에 남은 것은 **이미 셸을 통과한 결과 문자열** 뿐이므로, 사후 검사가 볼 수 있는 입력 자체가 존재하지 않는다.

> ⚠️ **"커밋 객체 필드" 한정이 중요하다.** `git log` 에는 객체 밖을 읽는 placeholder 도 있다 — `git log -g --format='%gs'` 는 **reflog** 를 노출한다 (`reset: moving to HEAD`). 그러나 결론은 그대로다: reflog 도 `commit: <subject>` 형태로 **셸을 통과한 뒤의 메시지만** 기록한다 (실측 — 백틱이 치환된 커밋의 reflog 엔트리는 `commit (initial): docs: threshold rule` 로 **이미 손상된 subject** 를 담는다). 객체든 reflog 든 **post-shell 기록**이라 원본 대조 대상이 되지 못한다.

**축 2 — 훅도 원본을 못 본다.** 손상은 **git 이 메시지를 받기 전에** 셸에서 끝난다. `commit-msg` 훅에 `echo "$(cat "$1")"` 를 걸고 위 백틱 메시지를 커밋하면 훅이 받는 값은 `docs: threshold  rule` — **이미 손상된 문자열**이다. 대조할 원본이 훅의 입력에 없으므로 훅은 _"손상됐다"_ 를 판정할 수 없다.

**축 3 — 검출 신호가 손상과 _반상관_ 이다.** 제안된 가드는 _"메시지에 백틱·`$` 가 남아 있는데 `-F` 를 안 썼다"_ 를 신호로 쓴다. 그런데 **손상은 metachar 를 제거한다** — 백틱이 살아남았다는 것은 그 메시지가 **셸 파서를 건드리지 않았다**는 증거, 즉 안전 경로(변수 전달 / `-F`)를 탔다는 증거다. 신호와 대상이 **반대 방향**이다.

```sh
# 안전 경로 — 원문 보존
git commit -F - <<'EOF'
docs: threshold `n>=3` rule
EOF
git log -1 --format=%s   # -> docs: threshold `n>=3` rule   (백틱 1 → 가드 발화)

# 위험 경로 — 리터럴 -m
/bin/sh -c 'git commit -m "docs: threshold `n>=3` rule"'
git log -1 --format=%s   # -> docs: threshold  rule         (백틱 0 → 가드 침묵)
```

가드는 **안전한 커밋에만 발화하고 손상된 커밋에는 침묵한다**. 정밀도가 낮은 게 아니라 **부호가 뒤집혀 있다** — 임계를 조정해 구제할 수 있는 종류의 실패가 아니다.

> **이 논거는 모집단 선택에 의존하지 않는다** — 의도적으로 그렇게 골랐다. 초판은 _"metachar 는 정상 관행이라 상시 발화한다"_ 는 **base rate 논거**(`%B` 300커밋 백틱 `319`)를 썼는데, PR [#1044](https://github.com/coseo12/astro-simulator/pull/1044) 리뷰가 **모집단이 틀렸음**을 지적했다: `%B` 300커밋의 **97.3%** 는 squash·merge 로 **GitHub 이 조성**한 본문이라 로컬 셸 `-m` 을 통과한 적이 없다. 실제 위험 모집단인 **subject** 로 좁히면 백틱 보유는 rev `9ca671b` 기준 **`0/300`** (`git log -n 300 --format=%s | grep -cF` 백틱)이라 _"상시 발화"_ 가 **뒤집힌다**. 결론은 축 1·2 로 이미 결정적이었으나, **논거 하나가 재측정으로 무너지는 상태를 남기지 않기 위해** 모집단 독립 형태로 교체했다.

### 채택 가능한 부분집합이 있는가 — 없다 (측정으로 기각)

세 축은 _"입력을 못 본다"_ 는 논거다. 그렇다면 **결과에 남은 흔적**으로 역추적할 수 있는가. 유일한 후보는 내용이 사라진 자리의 **연속 공백**이다 (`threshold  rule` / `rename  to`). **필요조건이 아니라서** 실패한다.

- **필요조건 아님 (결정적)** — 손상이 흔적을 **안 남기는 경우가 더 흔하다**. 토큰 경계에 붙으면 공백이 애초에 생기지 않는다.

  | 의도                                 | 기록된 결과              | 연속 공백 |
  | ------------------------------------ | ------------------------ | --------- |
  | ``fix: drop `legacy`path handling``  | `fix: drop path handling`| 0         |
  | `fix: bump to $VERSION`              | `fix: bump to`           | 0         |
  | ``refactor: `helper` split``         | `refactor:  split`       | 1         |

첫 행이 이 판정의 핵심이다 — `fix: drop path handling` 은 **문법적으로 완전하고 자연스러운 커밋 메시지**다. 어떤 검사도 이것을 손상으로 분류할 수 없고, 사람도 원문을 모르면 못 알아본다. **재현율이 구조적으로 `1/3` 로 묶이고, 놓치는 `2/3` 는 축 1 에 의해 다른 어떤 방법으로도 복구 불가능하다** — 정밀도를 아무리 끌어올려도 지배적 실패 모드가 통째로 남는다.

> **정밀도(오탐) 축은 근거로 쓰지 않는다** — 축 3 과 같은 모집단 함정이 있다. `%B` 기준 연속 공백은 rev `9ca671b` 에서 **36줄**(`git log -n 300 --format=%B | grep -cE '[^ ]  +[^ ]'`, 술어 = 매칭 줄 수)이고 표본은 전부 표 정렬 서식이지만, **위험 모집단인 subject 로 좁히면 `0/300`** 이다. 즉 오탐은 실제로 적다. 기각 근거는 오탐이 아니라 **위 재현율 상한**이다.

물리적 흔적은 **하나** 있다. 치환된 명령이 리다이렉트를 포함하면 (`` `n>=3` `` → 명령 `n`, 리다이렉트 `>=3`) 작업 트리에 **`=3` 이라는 untracked 파일**이 남는다 (`git status --porcelain` → `?? =3`). 그러나 이는 (a) 커밋 이력이 아니라 작업 트리에 있고, (b) 정리하면 사라지며, (c) `$VAR` 확장이나 리다이렉트 없는 백틱에는 **생기지 않는다**. 회귀 가드의 기반으로는 부족하다.

**결론** — 방어는 **사후 검출이 아니라 사전 절차**뿐이다. §선택 가이드 의 `-F -` + 따옴표 친 heredoc 이 이 클래스의 유일한 실효 대책이다.

## 근거

- volt [#114](https://github.com/coseo12/volt/issues/114) — astro-simulator PR #497 (D4 회귀 가드 시뮬레이션 negative case) 에서 실측 발견 + fix `a75aa20`.
- [#996](https://github.com/coseo12/astro-simulator/issues/996) — `git commit -m` 변형 / 사거리 판정 / 회귀 가드 기각. PR [#994](https://github.com/coseo12/astro-simulator/pull/994) 리뷰 권고 8 후속.
