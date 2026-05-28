# gh CLI 마크다운 본문 발송 — execSync shell metachar 함정

> CLAUDE.md `### gh CLI 마크다운 본문 발송 — execSync shell metachar 함정` 가지치기 위임 (이슈 #266 / PR #290). CLAUDE.md 본문은 1줄 포인터만 유지. **근거**: volt [#114](https://github.com/coseo12/volt/issues/114).

Node.js 에서 `execSync('gh pr comment N --body "..."')` 로 마크다운 본문 (백틱 / `$` / `!` / `;` 등 특수 문자 포함) 발송 시 **shell metachar 가 명령 치환·변수 확장으로 해석**되어 syntax error 발생. 자동 코멘트 / actionable 보고 발송이 silent fail.

## 증상

`/bin/sh: 1: Syntax error: end of file unexpected` 또는 `unbound variable` 등 shell 단계 에러. exit non-zero 인데 코멘트 박제 안 됨.

## 원인

`execSync(string)` 는 `/bin/sh -c <string>` 으로 실행 → shell 이 본문의 `` ` `` 백틱을 명령 치환으로 해석. `JSON.stringify` 의 백슬래시 이스케이프는 shell parser 에 도달 시 무력화.

## 해결 — `spawnSync` + stdin (3축 우회)

1. `spawnSync('gh', [...args])` — args 배열로 분리 (shell 미사용)
2. `--body-file -` — stdin 으로 본문 전달 (OS arg limit 회피)
3. `{ input: body, stdio: ['pipe', 'inherit', 'inherit'] }` — Node.js 가 child stdin 에 자동 pipe

## 선택 가이드

본문이 사용자/template 생성이면 `spawnSync` + stdin **의무**. `execSync` 는 고정 문자열 + 환경 변수 없는 명령에만 사용.

## 근거

volt [#114](https://github.com/coseo12/volt/issues/114) — astro-simulator PR #497 (D4 회귀 가드 시뮬레이션 negative case) 에서 실측 발견 + fix `a75aa20`.
