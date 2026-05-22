# sub-agent 검증 완료 ≠ GitHub 박제 완료 — 공통 SSoT 9 필드 + 인계 책임

> **근거**: harness #256 가지치기 PR 에서 CLAUDE.md `## 실전 교훈` 의 "sub-agent 검증 완료 ≠ GitHub 박제 완료" 블록을 추출. 원천: volt [#24](https://github.com/coseo12/volt/issues/24) — astro-simulator P6-B~E 에서 dev/qa sub-agent 마무리 단계 누락 4회 연속 관찰. 파생: volt [#46](https://github.com/coseo12/volt/issues/46) / [#52](https://github.com/coseo12/volt/issues/52) (background 프로세스 인계 누락) / [#77](https://github.com/coseo12/volt/issues/77) (메인 오케스트레이터 단계 게이트) / [#115](https://github.com/coseo12/volt/issues/115) / [#117](https://github.com/coseo12/volt/issues/117) (closing keyword base=develop 함정).

## 패턴

sub-agent(dev/qa 페르소나 등)는 빌드·테스트·브라우저 검증은 수행하면서도 **커밋/푸시/PR 생성/`gh pr comment` 박제** 같은 외부 가시성 단계에서 이탈하는 패턴이 반복된다. sub-agent 관점 "작업 완료" 와 harness 관점 "외부 가시성 있음" 이 어긋나 메인 오케스트레이터가 매번 수동 보완해야 했다.

원칙: **"검증" 까지는 신뢰하되 "박제" 는 신뢰하지 말 것** — sub-agent 의 보고는 *의도* 이고 실제 외부 가시성은 별도.

## 메인이 직접 확인할 GitHub 명령 세트

sub-agent 보고 수신 직후 메인 컨텍스트가 다음을 실행:

- `git log --oneline -1` — 커밋이 실제 반영됐는지
- `gh pr list` / `gh pr view <번호> --json comments` — PR·코멘트 박제 여부
- `gh issue view <auto-close 대상> --json state` — auto-close 실제 성공 여부

## closingIssuesReferences=[] 함정 — gitflow base=develop 변형

GitHub closing keyword (`Closes #N` / `Fixes #N` / `Resolves #N`) 는 **PR 의 base 가 default branch (보통 main) 일 때만 발화**. gitflow 운영 (base=develop) PR 머지 시 정확 문법이어도 100% 미발화 — 통계 증거 13/13 PR.

**메커니즘 분리** (두 함정 독립):
- **함정 A — 콜론 문법** (`Closes: #N` — base 무관 미인식, volt [#93](https://github.com/coseo12/volt/issues/93))
- **함정 B — base 함정** (정확 문법이어도 base=develop 시 미발화, volt [#115](https://github.com/coseo12/volt/issues/115) / [#117](https://github.com/coseo12/volt/issues/117))

함정 A 우회해도 함정 B 면 미작동.

**메인 오케스트레이터 의무**:
- base=develop PR 머지 후 **무조건 수동 close** (`gh issue close <N> --reason completed --comment "..."`). auto-close 가정 폐기
- release PR (`develop → main`) 의 closing keyword 는 작동 → release PR 본문에 누적된 sub-PR 의 `Closes #N` 명시 박제 권고 (sub-PR base=develop 함정 우회)

auto-close 검증은 PR 규칙 keyword 문법 가드와 연결 — `Closes: #A, #B` 같은 콜론 문법은 #B 미인식. 문법이 틀려도 sub-agent 는 "close 완료" 로 보고하므로 메인이 state 를 직접 확인.

## 공통 JSON 스키마 (SSoT 9 필드)

모든 외부 가시성 박제 에이전트(developer / qa / reviewer / architect / pm)가 공통으로 반환하는 **코어 필드**. 에이전트별 특수 필드는 `extends` 형태로 덧붙인다. **키 순서는 아래 선언 순서대로 고정** (diff 리뷰 가독성 + grep 기반 회귀 검사를 위해):

```json
{
  "commit_sha": "abc1234 | null",
  "pr_url": "https://github.com/.../pull/123 | null",
  "pr_comment_url": "https://github.com/.../pull/123#issuecomment-... | null",
  "labels_applied_or_transitioned": ["stage:qa"] ,
  "auto_close_issue_states": {"#118": "CLOSED", "#114": "CLOSED"},
  "blocking_issues": ["..."],
  "non_blocking_suggestions": ["..."],
  "spawned_bg_pids": [85117],
  "bg_process_handoff": "main-cleanup | sub-agent-confirmed-done | none"
}
```

누락 field 는 `null` 또는 빈 배열/객체로 **명시** (생략 금지). 공통 필드 검증 이후 에이전트별 `extends` 영역을 검증한다. 각 에이전트 파일의 `## 마무리 체크리스트 JSON 반환 (필수)` 섹션은 이 코어를 포함하고 특수 필드만 추가한다.

### `spawned_bg_pids` / `bg_process_handoff` 의도 (volt [#46](https://github.com/coseo12/volt/issues/46) / [#52](https://github.com/coseo12/volt/issues/52))

sub-agent 가 `run_in_background=true` 로 띄운 로컬 프로세스(dev 서버 / `cargo test` / 장시간 빌드 등) 의 **정리 책임 인계** 를 명시. sub-agent 세션 종료 후에도 시스템 프로세스가 살아있어 포트 점유 / target 락 경쟁 / CPU 좀비 누적을 일으키는 패턴이 반복됨(astro-simulator P8/P9 에서 관찰).

**값 규약**:
- `spawned_bg_pids`: 반환 전까지 sub-agent 가 시작해 **아직 살아있는** PID 배열. 이미 kill/완주한 프로세스는 제외. 띄운 적 없으면 `[]`
- `bg_process_handoff`:
  - `"main-cleanup"` — 메인 오케스트레이터가 `ps`/`lsof` 로 확인 후 정리 책임
  - `"sub-agent-confirmed-done"` — sub-agent 가 반환 전 완주 확인 완료 (PID 배열이 `[]` 여야 정합)
  - `"none"` — 백그라운드 프로세스 시작 안 함

**메인 오케스트레이터 책임**: `bg_process_handoff="main-cleanup"` 이고 `spawned_bg_pids` 가 비어있지 않으면 sub-agent 반환 직후 `ps auxww | grep -E '<PID 패턴>'` 또는 `lsof -i :<port>` 로 독립 확인 + 필요 시 kill. 다음 sub-agent 호출 전 포트/경로 경쟁 해소.

**중복 브랜치 dev 서버 오진 방지**: feature 브랜치별 worktree 에서 띄운 dev 서버가 이후 브랜치에서 동일 포트를 점유하면 HMR 이 낡은 번들을 서빙한다. 메인이 새 dev 서버 띄우기 전 `lsof -i :<port>` 선행 확인.

## SSoT 동기화 자동 가드 (#145, v2.23.0~)

위 공통 JSON 스키마 9개 필드는 **5개 에이전트 파일** (`.claude/agents/architect.md` / `developer.md` / `pm.md` / `qa.md` / `reviewer.md`) 의 체크리스트 JSON 블록에도 그대로 등장해야 한다 (sub-agent 가 system prompt 만 보고 반환할 수 있도록).

동기화 보장은 수동 체크박스가 아닌 **`scripts/verify-agent-ssot.sh`** 자동 검사로 강제된다 — 9개 필드 존재 + 선언 순서 준수를 검증하며, drift 시 누락 파일/필드와 순서 이탈 지점을 stderr 에 보고하고 exit 1. CI `detect-and-test` 에 통합되어 PR 머지 전 drift 차단.

**이 SSoT 블록을 수정하는 PR 은 반드시 5개 에이전트 파일의 `## 마무리 체크리스트 JSON 반환` 섹션을 함께 갱신하고 `bash scripts/verify-agent-ssot.sh` 로 사전 확인한다.**

## 메인 오케스트레이터 단계 게이트 (volt [#77](https://github.com/coseo12/volt/issues/77))

`developer → reviewer → qa → 사용자/머지` 순서 강제. developer sub-agent 의 self-compare 자명 PASS 함정을 reviewer/qa 단계가 차단. 예외: docs only / chore.

상세: [headless-browser-verification.md](headless-browser-verification.md)

## 누락 감지 시 대응

누락 감지 시 메인이 직접 보완 박제 (커밋/PR/코멘트). **sub-agent 를 재호출해 같은 누락을 반복시키지 않는다** — 같은 sub-agent 가 같은 누락을 반복할 확률이 높음.

## 근거

- volt [#24](https://github.com/coseo12/volt/issues/24) — astro-simulator P6-B~E 에서 dev/qa sub-agent 마무리 단계 누락 4회 연속 관찰
- volt [#46](https://github.com/coseo12/volt/issues/46) / [#52](https://github.com/coseo12/volt/issues/52) — background 프로세스 인계 누락 (stale dev 서버 포트 점유 오진 + `cargo test` 좀비 4개 누적)
- volt [#77](https://github.com/coseo12/volt/issues/77) — 메인 오케스트레이터 단계 게이트 (self-compare 자명 PASS 함정 차단)
- volt [#93](https://github.com/coseo12/volt/issues/93) — closing keyword 콜론 문법 함정 (함정 A)
- volt [#115](https://github.com/coseo12/volt/issues/115) / [#117](https://github.com/coseo12/volt/issues/117) — closing keyword base=develop 함정 (함정 B)
- 인접 패턴: [sub-agent-multiturn-drift.md](sub-agent-multiturn-drift.md) (multi-turn 매트릭스 이탈) / [headless-browser-verification.md](headless-browser-verification.md) (검증 단계 게이트)
