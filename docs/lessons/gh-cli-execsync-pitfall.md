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
- `gh issue create --body` — `.claude/agents/pm.md`
- `gh issue comment --body` — `.claude/skills/create-issue/SKILL.md`

**대상 아님 (실측 근거)**

- `gh pr edit` — 본 저장소에서는 `--add-label` / `--remove-label` / `--base` 로만 쓰인다. `--body` 사용처 0
- `gh release create --notes` — `--notes` 를 리터럴로 넘기는 사용처 0 (`gh release create <tag>` / `--target` 만)
- `gh pr create --body` — `create-pr` 스킬 경유가 **의무**라 직접 호출 자체가 금지 (에이전트 5개 파일에 박제)
- `scripts/verify-pr-template-checklist.mjs` — 이미 `spawnSync` + `--body-file -` (volt #114 fix 적용분)
- `.claude/skills/cross-validate/scripts/cross_validate.sh` — `--body "${body}"` 변수 확장이라 §리터럴만 위험하다 에 의해 안전

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

`git log` 의 format placeholder 는 **커밋 객체에 있는 것만** 노출할 수 있고, 위 `cat-file` 출력이 곧 그 객체의 전부다 — 즉 _"placeholder 를 못 찾았다"_ 가 아니라 **노출할 대상이 객체에 없다**. 커밋 이력에 남은 것은 **이미 셸을 통과한 결과 문자열** 뿐이므로, 사후 검사가 볼 수 있는 입력 자체가 존재하지 않는다.

**축 2 — 훅도 원본을 못 본다.** 손상은 **git 이 메시지를 받기 전에** 셸에서 끝난다. `commit-msg` 훅에 `echo "$(cat "$1")"` 를 걸고 위 백틱 메시지를 커밋하면 훅이 받는 값은 `docs: threshold  rule` — **이미 손상된 문자열**이다. 대조할 원본이 훅의 입력에 없으므로 훅은 _"손상됐다"_ 를 판정할 수 없다.

**축 3 — base rate 가 가드를 무의미하게 만든다.** 최근 300 커밋 메시지 실측: metachar(`` ` `` / `$X` / `<X`) 포함 **929줄**, 그중 백틱 **319줄**.

```sh
git log -n 300 --format=%B | grep -cE '`|\$[A-Za-z_{(]|<[A-Za-z_]'   # 929
git log -n 300 --format=%B | grep -cF '`'                            # 319
```

**메타문자 존재는 정상 관행**이다 (커밋 메시지에서 식별자를 인라인 코드로 감싸는 것이 본 저장소 컨벤션). 존재만으로 경고하면 상시 발화 — [#766](https://github.com/coseo12/astro-simulator/issues/766) alert fatigue 계보.

### 채택 가능한 부분집합이 있는가 — 없다 (측정으로 기각)

세 축은 _"입력을 못 본다"_ 는 논거다. 그렇다면 **결과에 남은 흔적**으로 역추적할 수 있는가. 유일한 후보는 내용이 사라진 자리의 **연속 공백**이다 (`threshold  rule` / `rename  to`). 필요조건·충분조건 양쪽에서 실패한다.

- **충분조건 아님** — 최근 300 커밋에 연속 공백 **37줄**(`git log -n 300 --format=%B | grep -cE '[^ ]  +[^ ]'`). 표본을 보면 전부 표 정렬·들여쓰기 서식이다.
- **필요조건 아님 (결정적)** — 손상이 흔적을 **안 남기는 경우가 더 흔하다**. 토큰 경계에 붙으면 공백이 애초에 생기지 않는다.

  | 의도                                 | 기록된 결과              | 연속 공백 |
  | ------------------------------------ | ------------------------ | --------- |
  | ``fix: drop `legacy`path handling``  | `fix: drop path handling`| 0         |
  | `fix: bump to $VERSION`              | `fix: bump to`           | 0         |
  | ``refactor: `helper` split``         | `refactor:  split`       | 1         |

첫 행이 이 판정의 핵심이다 — `fix: drop path handling` 은 **문법적으로 완전하고 자연스러운 커밋 메시지**다. 어떤 검사도 이것을 손상으로 분류할 수 없고, 사람도 원문을 모르면 못 알아본다.

물리적 흔적은 **하나** 있다. 치환된 명령이 리다이렉트를 포함하면 (`` `n>=3` `` → 명령 `n`, 리다이렉트 `>=3`) 작업 트리에 **`=3` 이라는 untracked 파일**이 남는다 (`git status --porcelain` → `?? =3`). 그러나 이는 (a) 커밋 이력이 아니라 작업 트리에 있고, (b) 정리하면 사라지며, (c) `$VAR` 확장이나 리다이렉트 없는 백틱에는 **생기지 않는다**. 회귀 가드의 기반으로는 부족하다.

**결론** — 방어는 **사후 검출이 아니라 사전 절차**뿐이다. §선택 가이드 의 `-F -` + 따옴표 친 heredoc 이 이 클래스의 유일한 실효 대책이다.

## 근거

- volt [#114](https://github.com/coseo12/volt/issues/114) — astro-simulator PR #497 (D4 회귀 가드 시뮬레이션 negative case) 에서 실측 발견 + fix `a75aa20`.
- [#996](https://github.com/coseo12/astro-simulator/issues/996) — `git commit -m` 변형 / 사거리 판정 / 회귀 가드 기각. PR [#994](https://github.com/coseo12/astro-simulator/pull/994) 리뷰 권고 8 후속.
