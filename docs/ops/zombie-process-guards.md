# 좀비 프로세스 가드 — 계층 구조 + incident 서사 (#440 / volt #24·#46·#52·#79)

> ⚠️ **본 문서의 인용 블록은 이관 시점(2026-08-07, #980)의 동결 스냅샷이다.** 행동 규칙의 **정본은 CLAUDE.md** 이며, CLAUDE.md 잔여가 갱신되면 여기 인용은 조용히 stale 해진다 (PR [#981](https://github.com/coseo12/astro-simulator/pull/981) 리뷰 🟡-2). 인용과 정본이 어긋나 보이면 **CLAUDE.md 를 신뢰**하고 본 문서를 갱신하라. ⚠️ **`ETIME 30분` 에 대한 자동 정합은 없다** — `verify-zombie-check.mjs` 의 항목 1~6 은 **헤더 문자열 pin + 파일 존재 확인**이고 `ETIME`/`30` 을 검사하는 assertion 은 **0건**이다 (PR [#981](https://github.com/coseo12/astro-simulator/pull/981) 2차 리뷰 🔴-A — 초판이 반대로 서술했다). **범위 한정 (#1066 / #1086)**: 항목 7~9 가 추가돼 **패턴 리터럴**은 이제 기계 검증된다(hook `PATTERN` 을 실제 `grep -E` 로 코퍼스 판정 + `qa.md`·본 문서 사본과 축자 대조 — §10). ⚠️ 그 대조는 도입 시점에 **형태 하나만**(`grep -E '…'`) 봐서 본 문서 §10 의 bare 펜스를 놓쳤고, [#1086](https://github.com/coseo12/astro-simulator/issues/1086) 이 **사본 개수 pin** 으로 바꿔 닫았다 (§10-2). 자동화된 것은 그 축뿐이고 임계값 축은 그대로다. `ETIME 30분` 은 §8 표대로 **4곳을 사람이 동시에 갱신**해야 하며, 그 값은 `scripts/cleanup-browser.sh` 가 프로세스를 실제로 kill 하는 판정 기준이다.

sub-agent 가 `run_in_background=true` 로 띄운 장기 프로세스(dev 서버 / cargo test / agent-browser Chrome)가 정리되지 않고 누적되는 클래스의 **원인·실측·가드 계층 SSoT**.

`CLAUDE.md` 에는 **행동 규칙**(명령 리터럴 / 임계값 / 금지)만 남기고, *왜 그 규칙이 지금의 형태인지* 를 재구성할 수 있는 근거(재현 시퀀스 / 실측 수치 / 계층 간 직교성 논증)는 본 문서가 보유한다 — [#980](https://github.com/coseo12/astro-simulator/issues/980) 축 A 이관. **§1~§2·§4~§6 의 인용 블록은 이관 전 CLAUDE.md 원문 그대로**이며(지식 유실 0 계약), 그 바깥 산문이 본 문서에서 보강한 맥락이다.

| 참조 | 위치 |
| --- | --- |
| 행동 규약 (각인층) | [`CLAUDE.md`](../../CLAUDE.md) §sub-agent 이탈의 프로세스 레벨 확장 / 가드 A·B·C·D |
| incident forensic 전문 (timeline / gap 매트릭스) | [`20260510-419-dev-server-zombie-recurrence.md`](../reports/20260510-419-dev-server-zombie-recurrence.md) |
| 가드 D (대기 라이프사이클 — 직교 확장) | [`dead-wait-guard.md`](../lessons/dead-wait-guard.md) / ADR [`20260710-817-dead-wait-guard.md`](../decisions/20260710-817-dead-wait-guard.md) |
| 정적 회귀 가드 / 정리 도구 | `scripts/verify-zombie-check.mjs` (CI) / `scripts/cleanup-browser.sh` / `.claude/hooks/session-start-zombie-check.sh` |
| 인접 운영 마찰 (pgrep bracket 오탐 등) | [`operational-friction.md`](operational-friction.md) §3 |

---

## 1. 원류 — sub-agent 이탈의 프로세스 레벨 확장 (cargo/next dev 좀비 누적)

> 상위 "sub-agent 검증 완료 ≠ GitHub 박제 완료" 교훈의 **프로세스 리크 확장**. volt #24 가 코멘트·라벨 등 외부 가시성 박제 누락을 다룬다면, 본 교훈은 **백그라운드 프로세스 정리 누락** 이다.
>
> - **현상**: sub-agent(dev/reviewer/qa) 가 `run_in_background=true` 로 `cargo test --lib` 또는 `pnpm dev` 를 시작한 뒤, PID 종료 확인 없이 보고서 반환. 메인 오케스트레이터가 복귀 후 프로세스 정리 안 하면 다음 sub-agent 가 동일 타겟 디렉토리에 새 cargo 를 시작 → 테스트 바이너리 4개+ 병렬 경쟁 → 어느 것도 완주 못 함
> - **관찰 사례**: P9 PR-1 (#258) 에서 dev(초기)/dev(재작업)/reviewer/qa 가 각자 cargo test 시작 후 누적. `physics_wasm-<hash>` 바이너리 4개 동시 실행, 각 CPU 94~388% 점유, 30~176분 경과. 정상 4~5분 대비 10배+ 지연 후에도 완주 못 함
> - **메인 루틴** (sub-agent 복귀 직후 의무):
>
> ```bash
> # sub-agent 가 띄웠을 수 있는 장기 프로세스 독립 확인
> ps auxww | grep -E "cargo|next dev|physics_wasm-" | grep -v grep
> # 의도치 않은 좀비 발견 시 kill (시작 시각 비교로 현재 세션 이전 것만 정리)
> ```
>
> - **sub-agent 루틴** (반환 직전 의무):
>   - `run_in_background=true` 로 시작한 프로세스가 있으면 PID 기록 + 마무리 체크리스트 JSON 의 `spawned_bg_pids` 필드에 박제
>   - 완주 확인 못 하고 반환 시 명시적 "프로세스 인계" 플래그 (메인이 정리 책임 인지)
> - **cargo test 호출 규범** (PR-2 에서 도입 예정):
>   - 장기 적분 테스트 (`mercury/yoshida_*_perihelion_*`, `earth/venus_perihelion_eih_*`) 에 `#[ignore]` 어트리뷰트 + CI 전용 `--include-ignored` 경로
>   - 일상 개발에서는 `cargo test --lib` 가 5분 내 완주하도록 재설계
> - **근거**: volt [#24](https://github.com/coseo12/volt/issues/24) 의 프로세스 레벨 확장 (2026-04-20 관찰). volt 캡처 예정

⚠️ **명령 정정 (#1054, 2026-08-14)** — 위 인용 블록은 #980 이관 시점 CLAUDE.md 원문의 **축자 보존**이라 손대지 않는다. 다만 그 안의 `ps auxww | grep -E … | grep -v grep` 은 **`ps -axww -o pid=,etime=,command= | grep -E … | grep -v grep` 으로 읽어야 한다** — `ps auxww` 에는 **ETIME 열이 없어**(START·TIME 만 제공) 바로 아래 가드들이 공유하는 **ETIME 30분 임계 판정을 그 명령만으로 닫을 수 없다**. self-match 방어(`grep -v grep`)는 원문 그대로 유효하며, 바뀌는 것은 출력 열뿐이다. 현행 정본은 CLAUDE.md §가드 B 와 [`operational-friction.md`](operational-friction.md) §3.

**왜 "완주 못 함"이 핵심인가**: 실패가 아니라 **미완주**라서 아무도 신호를 받지 못한다. 테스트는 실패 보고를 하지 않고 그냥 느려지며, 에이전트는 "테스트가 원래 오래 걸린다"로 해석해 대기를 늘린다. 정상 4~5분 대비 10배+ 지연은 그 해석을 강화하는 방향으로만 작용한다 — 그래서 사람이 개입할 때까지 자체 교정되지 않는다.

`cargo test --lib` 호출 시간이 길수록 위 경쟁이 발생할 창이 넓어진다. 위 "cargo test 호출 규범"이 `#[ignore]` 로 장기 적분 테스트를 일상 경로에서 떼어내는 이유가 이것이다.

---

## 2. agent-browser Chrome 좀비 변형 (volt #79)

> - **agent-browser Chrome 좀비 변형** (volt [#79](https://github.com/coseo12/volt/issues/79)): qa / browser-test sub-agent 가 `agent-browser` 도구로 real Chrome 사용 후 세션 종료 시 정리 누락. 식별자 `agent-browser-chrome-<UUID>` user-data-dir (사용자 본 Chrome 영향 0). 본 세션 (2026-04-28) 실측 6 세션 / 52 좀비 / 3일치 누적 → 800%+ CPU 관찰. **메인 루틴** (sub-agent 복귀 직후 의무): `pgrep -af "agent-browser-chrome[-]"` 검사 + 좀비 확인 시 `bash scripts/cleanup-browser.sh --all` (병행 브라우저 작업 부재 확인 후 — 메인 전용). **sub-agent 루틴** (반환 직전 의무): `bash scripts/cleanup-browser.sh` 기본 모드 (전량 pkill 금지 — 병행 오살 방지, #926). agent-browser 도구 자체 cleanup 이 정상 case 에선 작동하나 sub-agent 비정상 종료 (timeout / SIGKILL / panic) 시 lineage 끊긴 좀비 잔존. cargo/next dev 의 `spawned_bg_pids` SSoT 가 직접 spawn 한 PID 만 커버하므로 도구 wrapper 가 spawn 한 child process 는 별도 검증 의무

⚠️ **명령 정정 (#1054, 2026-08-14)** — 위 인용 블록은 #980 이관 시점의 CLAUDE.md 원문을 **축자 보존**한 것이라 손대지 않는다. 다만 그 안의 메인 루틴 명령은 **`pgrep -f "agent-browser-chrome[-]"` 로 읽어야 한다** (`-a` 제거, **bracket 은 유지**) — macOS `pgrep` 의 `-a` 는 _"조상 프로세스를 매칭 대상에 포함"_ 이라(Linux procps 의 _"명령행 출력"_ 과 동명이의) 기본값이 제공하는 자기 + 조상 제외를 되돌려 **조상 셸을 좀비로 보고**한다. 단 `-a` 제거로 없어지는 것은 **조상 축뿐**이고, 부모 argv 를 상속한 **형제 subshell 축은 남는다** — 그 축을 pgrep 경로에서 막는 것이 bracket 이므로 bracket 은 **제거 대상이 아니다**. 상세: [`operational-friction.md`](operational-friction.md) §3 기전 정정 2축 표.

**추가 실측**: 2026-08-02 에 10일 묵은 daemon 2개가 관찰됐다 ([#926](https://github.com/coseo12/astro-simulator/issues/926)) — 종전 가드가 Chrome 렌더러만 보고 상주 daemon 을 방치한 결과다.

**모드 분리의 이유 (#926)**: `scripts/cleanup-browser.sh` 기본 모드는 `agent-browser close`(10s timeout) 후 **stale 만**(ETIME ≥ 30분) 정리하고 신선한 프로세스는 보존한다 — **병행 에이전트 오살 방지**. `--all` 은 ETIME 무관 전량 정리이므로 **병행 브라우저 작업 부재를 아는 메인 오케스트레이터 전용**이며, sub-agent 는 기본 모드만 사용한다.

---

## 3. incident #440 (2026-05-10) — 가드 A/B/C 도출 서사

가드 A/B/C 는 설계로 먼저 나온 게 아니라 **한 건의 사고에서 역산**됐다. 전체 timeline·gap 매트릭스는 [forensic 보고서](../reports/20260510-419-dev-server-zombie-recurrence.md) 가 보유하고, 여기서는 가드 형태를 결정한 시퀀스만 박제한다.

**가드 A 위반 시 발생 시퀀스** (실측 2026-05-10):

1. 좀비(이전 세션 PID `97333`, ETIME **3h 17m**)가 포트 3000 점유
2. 메인이 새 dev spawn 시도 → **EADDRINUSE 로 즉사** (stdout 이 `head -50` 으로 닫혀 메인이 인지 못 함)
3. 좀비가 HTTP 307 → 200 응답 → 메인이 **"dev ready" 오인**
4. 사용자 D-T2 안내
5. 사용자가 자기 터미널에서 `pnpm dev` 시도 → EADDRINUSE → `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL`
6. 사용자 보고 → forensic

핵심은 2·3 이다. **좀비가 HTTP 응답을 하기 때문에 "포트가 살아 있다"는 신호가 곧 "내가 띄운 서버가 살아 있다"로 오독**된다. 이 경로는 curl 로도 브라우저로도 구분되지 않는다 — spawn **직전** 점유 확인만이 구분 지점이다.

---

## 4. 가드 A — 메인 spawn 시점 lsof 선행 (2026-05-10 incident #440 Phase 1)

> - **메인 dev/장기 프로세스 spawn 시점 lsof 선행 의무** ([이슈 #440](https://github.com/coseo12/astro-simulator/issues/440)): 메인 오케스트레이터가 `pnpm dev` / `pnpm start` / `cargo test --release` 등 장기 프로세스를 `run_in_background=true` 로 시작하기 **직전**, 사용 포트(3000 / 4000 / 기타)에 대해 `lsof -i :<port>` 선행 확인 의무. 점유 중이면 좀비 인지 + 사용자 보고 + 정리 후 재시작. **본 가드 위반 시 발생 시퀀스** (실측 2026-05-10): 좀비 (이전 세션 PID 97333, ETIME 3h 17m) 가 포트 3000 점유 → 메인이 새 dev spawn 시도 → EADDRINUSE 로 즉사 → 좀비가 HTTP 응답 → 메인이 "dev ready" 오인 → 사용자 D-T2 안내 → 사용자 자기 터미널 `pnpm dev` 시도 → EADDRINUSE → `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` → 사용자 보고 → forensic. 상세: [`docs/reports/20260510-419-dev-server-zombie-recurrence.md`](../reports/20260510-419-dev-server-zombie-recurrence.md). 위 "메인 루틴" (sub-agent 복귀 직후) 가드와 **직교** — 본 가드는 **메인이 직접 spawn 하는 시점** + **이전 세션 좀비 (sub-agent 추적 단위 외)** 검증.
> - **real-lessons SSoT (volt #24) 와의 관계** (volt [#24](https://github.com/coseo12/volt/issues/24) `중복 브랜치 dev 서버 오진 방지` 가드): 상위 SSoT 는 "feature 브랜치별 worktree 에서 띄운 dev 서버가 이후 브랜치에서 동일 포트를 점유하면 HMR 이 낡은 번들을 서빙" 라는 **HMR drift 시나리오** 박제. 본 가드 A 는 그 SSoT 의 **실측 incident 구체화** — 단순 stale 번들이 아니라 좀비가 HTTP 응답해 "ready" 자체를 오인하게 만드는 변형 + 이전 세션 (sub-agent 추적 단위 외) 좀비까지 검증 범위 확장.
>
> ```bash
> # 메인 dev/장기 프로세스 spawn 직전 의무 가드
> PORT=3000
> if lsof -i :$PORT > /dev/null 2>&1; then
>   echo "WARN: 포트 $PORT 점유 중 — 좀비 가능"
>   ps -p $(lsof -t -i :$PORT) -o pid,etime,command
>   # 사용자 확인 후 kill -TERM <PID> 진행
> fi
> ```

`.claude/skills/run-tests/SKILL.md` 의 dev 서버 기동 절차가 본 가드를 0단계로 인라인 보유한다 (#856 이식).

---

## 5. 가드 B — sub-agent-confirmed-done 카나리아 (incident #440 Phase 2)

> - **`bg_process_handoff="sub-agent-confirmed-done"` 보고에서도 메인 카나리아 검증 의무**: real-lessons SSoT (volt #24) 정의상 `"sub-agent-confirmed-done"` 은 "PID 배열이 `[]` 여야 정합" 이므로 메인 검증 트리거 미발화. 그러나 본 incident 처럼 **이전 세션 좀비** 가 sub-agent 추적 단위 외에 잔존하면 정의상 정합 PASS 임에도 좀비 검출 불가. 메인은 sub-agent 가 어떤 보고를 하든 (`"main-cleanup"` / `"sub-agent-confirmed-done"` / `"none"` 무관) 포트 사용 sub-agent (qa / dev / browser-test) 복귀 직후 **카나리아 1회** (`lsof -i :<port>` + ETIME 패턴 매칭). 검증 비용 < 1초. 좀비 발견 시 사용자 보고 + 정리 후 다음 작업 진행. 가드 A 가 **메인 자신의 spawn 직전** 가드라면 가드 B 는 **sub-agent 복귀 직후** 가드 — 둘 직교.
> - **ETIME 임계값** — 본 세션 시작 이전 추정 임계값으로 **30분** 사용. qa/dev 사이클 1회 이상 경과한 PID 는 본 세션이 spawn 한 게 아닐 가능성이 매우 높음. `.claude/hooks/session-start-zombie-check.sh` (가드 C) + `.claude/agents/qa.md` 좀비 카나리아 항목 모두 동일 임계값 적용 (정합 SSoT).
>
> ```bash
> # sub-agent 복귀 직후 카나리아 (의무 1회, 비용 < 1초)
> PORT=3000
> THRESHOLD_MINUTES=30
> ZOMBIES=$(lsof -t -i :$PORT 2>/dev/null)
> if [[ -n "$ZOMBIES" ]]; then
>   echo "WARN: sub-agent 복귀 후 포트 $PORT 점유 잔존"
>   ps -p $ZOMBIES -o pid,etime,command
>   # ETIME ≥ ${THRESHOLD_MINUTES}분 PID 는 이전 세션 좀비 의심 (정리 필요)
> fi
> ```

**sub-agent 도 메인도 거짓 보고를 하지 않았는데 좀비만 남는다** — 이것이 본 가드가 "보고 내용과 무관하게" 발화해야 하는 이유다. SSoT 자체는 정의상 정합이므로, 정합성 검사를 아무리 강화해도 추적 단위 밖은 보이지 않는다.

---

## 6. 가드 C — 세션 시작 hook (incident #440 Phase 2b)

> - **세션 시작 시점 좀비 검출 hook**: `.claude/hooks/session-start-zombie-check.sh` 가 SessionStart hook 으로 등록되어 (`.claude/settings.json`) Claude Code 세션 시작 시 자동 실행. ETIME 30분 이상 `next dev` / `next-server` / `cargo (nextest|test)` / `pnpm … dev` 프로세스 발견 시 (패턴 리터럴 정본은 hook 의 `PATTERN` 변수 — 아래 §10) stdout 으로 PID/ETIME/command 출력 → Claude 가 사용자에게 정리 권고. exit 0 (블록 안 함, 경고만). 가드 A/B 가 **본 세션 안의 spawn 시점** 가드라면 가드 C 는 **세션 시작 진입 시점** 가드 — 사용자가 인지하기 전 자동 검출. SSoT 박제 회귀 차단은 `scripts/verify-zombie-check.mjs` (CI 통합) 가 담당.

**회귀 차단 범위**: `scripts/verify-zombie-check.mjs` 는 **9 항목**을 검사한다. 앞 **6 항목은 정적** — CLAUDE.md 가드 A/B sub-section 헤더 2건 / `.claude/agents/qa.md` "이전 세션 좀비 카나리아" 항목 / hook 파일 존재+실행권한 / `settings.json` hook **등록** 1줄 / forensic 보고서 존재. 등록 검사는 [#894](https://github.com/coseo12/astro-simulator/issues/894) 에서 추가됐다 — 그전에는 파일이 멀쩡해도 등록 1줄이 빠지면 가드 C 가 실행되지 않는데 가드는 초록이었다. 뒤 **3 항목(7~9)은 [#1066](https://github.com/coseo12/astro-simulator/issues/1066) 에서 추가된 패턴 축**이고 정적 형태 검사가 아니다 — hook 의 `PATTERN` 을 실제 `grep -E` 에 먹이는 코퍼스 판정(7) + 문서 사본 축자 대조(8·9). 상세는 §10.

---

## 7. 가드 D — 세션 중단 dead-wait (직교 확장)

가드 A/B/C 가 **좀비 프로세스**(포트 점유 / CPU 폭주)를 다룬다면, 가드 D 는 **대기 라이프사이클**(세션 재시작으로 waiter 가 소멸하고 대기만 남는 무인지 침묵)을 다룬다. 행동 규약은 `CLAUDE.md` §세션 중단 dead-wait 방지, 상세는 [`dead-wait-guard.md`](../lessons/dead-wait-guard.md).

---

## 8. ETIME 임계값 30분 — 3곳 정합 SSoT

세션 시작 이전 프로세스를 추정하는 임계값으로 **30분**을 쓴다. 근거는 **qa/dev 사이클 1회 이상 경과한 PID 는 본 세션이 spawn 한 것이 아닐 가능성이 매우 높다**는 것이다. 값을 바꾸려면 아래 3곳(+ 파생 1곳)을 **동시에** 바꿔야 한다.

| # | 위치 | 형태 |
| --- | --- | --- |
| 1 | `CLAUDE.md` §가드 B | 규칙 문장 (`ETIME ≥ 30분 = 이전 세션 좀비 의심`) |
| 2 | `.claude/hooks/session-start-zombie-check.sh` (가드 C) | `THRESHOLD_MINUTES=30` |
| 3 | `.claude/agents/qa.md` 좀비 카나리아 항목 | *"ETIME 30분 이상"* |
| (파생) | `scripts/cleanup-browser.sh` | `STALE_ETIME_THRESHOLD_MINUTES=30` — 가드 C SSoT 정합 명시 (#926) |

---

## 9. 검출 명령 — bracket 패턴 의무

`pgrep -f "패턴"` 은 자기 셸의 명령행을 매칭해 **오탐**한다. 좀비 검출 패턴에는 bracket 을 넣는다 (`agent-browser-chrome[-]`). `pkill` 은 자기 셸을 죽일 위험이 있어 bracket 이 안전 개선까지 겸한다. hook 은 `grep -v` 로 이미 안전하다.

⚠️ **보강 (#1054, 2026-08-14)** — 위 3문장은 **맞지만 불완전**하다. self-match 는 **직교 2축**이고 bracket 은 그중 한 축만 담당한다.

| 축 | 기전 | `-a` 제거 | bracket | `grep -v grep` |
| --- | --- | :---: | :---: | :---: |
| **조상 셸** | `pgrep -a` 가 조상을 매칭 풀에 유입 | ✅ | ⚠️ **argv 순도 조건부** | ✅ |
| **형제 subshell** | 비-exec fork 가 부모 argv 상속 (형제는 기본 제외 대상이 **아니다**) | ❌ | ⚠️ **argv 순도 조건부** | ✅ |

두 축은 **같은 argv 문자열**을 보고 **매칭 풀 소속만** 다르다. 그래서 bracket 의 효력은 축과 무관하게 **argv 순도**(명령행 어디에도 un-bracketed 리터럴이 없을 것) 하나에만 걸리고, `grep -v grep` 만 **순도와 무관하게** 두 축을 막는다. 4케이스 격리 실측은 [`operational-friction.md`](operational-friction.md) §3.

따라서 검출 명령의 의무는 — ① **좀비 카나리아 정본은 두 축을 동시에 막는** `ps -axww -o pid=,etime=,command= | grep -E 'next dev( |$)|next-server|cargo( +[^ &|;]+)* +(nextest|test)( |$)|pnpm( +[^ &|;]+)* +dev( |$)' | grep -v grep` (dev/test 계열. 패턴 리터럴의 근거는 아래 §10, 인용부호가 홑따옴표인 것은 `$` 확장 차단 의무다. 메인 §가드 B 는 `physics_wasm-` 를 포함한 **다른 검출 범위**를 쓴다 — 패턴은 위치마다 의도적으로 다르며 3곳이 공유하는 SSoT 는 **ETIME 30분 임계**다. 필터가 `grep -v grep` 인 것도 hook 과의 **의도적 차이**다 — 근거는 [`operational-friction.md`](operational-friction.md) §3 _"hook 필터를 그대로 복사하지 말 것"_) ② `pgrep`/`pkill` 을 쓸 때는 **`-a` 금지** ③ **bracket 은 유지** — 강등이 아니다. `-a` 를 뗀 뒤 pgrep 경로에서 형제 축을 막는 것은 bracket 뿐이고, 위 §_"pkill 은 안전 이슈"_ 대로 자기-kill 차단까지 겸한다. 덧붙여 `pgrep -af` 는 macOS 에서 명령행을 출력하지 않아 **무엇이 잡혔는지 볼 수단조차 없다**.

상세는 [`operational-friction.md`](operational-friction.md) §3 ([#795](https://github.com/coseo12/astro-simulator/issues/795) / 기전 정정 [#1054](https://github.com/coseo12/astro-simulator/issues/1054)).

## 10. 패턴 정밀도 — `.*` 무경계 확장 제거 (#1066) + 경계 자기적용 (#1086)

§9 가 **누가 매칭 풀에 들어오는가**(자기 오탐 2축)를 다룬다면, 본 절은 **패턴이 무엇을 잡는가**를 다룬다. 두 축은 직교하며 `grep -v grep` 으로는 본 절의 결함이 해소되지 않는다 — 그 필터는 *패턴 리터럴을 실은 셸*을 거르는데, 여기서 잡히는 것은 셸이 아니라 **실제 무관한 프로세스**다.

**결함**: 구 패턴 `next dev|next-server|cargo .*test|pnpm.*dev` 의 `.*` 는 명령행 뒷부분까지 이어져 `/dev/null` 의 `dev` 에 도달했다 → **`pnpm` 을 포함한 임의 명령**이 좀비로 보고됐다. `cargo .*test` 도 동종 구조다 (`cargo build --release && pnpm test:unit` 이 걸린다). [#440](https://github.com/coseo12/astro-simulator/issues/440) 이래 hook `PATTERN` 에 선행했고 [#1065](https://github.com/coseo12/astro-simulator/pull/1065) 는 `qa.md` 를 이 패턴에 **정렬**시켰을 뿐 정밀도를 바꾸지 않았다.

⚠️ **`/dev` 를 명령행에 올리는 매개는 하나가 아니다 — 리다이렉션 양방향이다.**

| 방향 | 형태 | 출처 | 적용 범위 |
| --- | --- | --- | --- |
| 입력 | `< /dev/null` | 하네스 래퍼가 자동 부착 | Bash 도구 호출 **전건** |
| 출력 | `> /dev/null` · `2>/dev/null` | 명령 자신이 작성 | 조용한 실행을 원하는 호출 |

출력 축은 [PR #1077](https://github.com/coseo12/astro-simulator/pull/1077) 작업 중 다른 dev 가 **독립 관측**했다 (`pnpm --filter web typecheck > /dev/null 2>&1`, 실측 hit `1` / ETIME `00:04` — 활성 프로세스라 무접촉). **한쪽만 막으면 절반만 닫힌다**는 것이 이 표의 요점이며, 아래 교정은 `/dev` 앞의 `/` 를 보므로 **방향에 무관하게** 두 축을 동시에 닫는다.

**교정 원리**: `dev` / `test` 를 **공백 구분 토큰**으로만 인정한다 — 앞은 공백(1개 이상), 뒤는 공백 또는 EOL. `/dev/null` 의 `dev` 는 앞이 `/` 라 배제되고, 실제 인자로 등장하는 `dev` 는 그대로 남는다. 중간 토큰은 **명령 분리자**(`&` `|` `;`)를 넘지 않는다.

```
next dev( |$)|next-server|cargo( +[^ &|;]+)* +(nextest|test)( |$)|pnpm( +[^ &|;]+)* +dev( |$)
```

**기각된 후보 3건** (이슈 본문 2건 + PR #1077 dev 제안 1건. 전부 실측으로 판정했다):

- `pnpm( run)? dev` — **거짓 음성**. 실 dev 서버 트리의 중간 프로세스가 `node …/bin/pnpm --filter @astro-simulator/web dev` 라 잡히지 않는다 (실측 argv).
- `pnpm [^|]*dev` — **결함 미해소**. 문제의 구간(`pnpm store path && sleep 200' < /dev/null`)에 `|` 가 없어 그대로 매칭된다. 경계로 삼아야 할 문자는 `|` 가 아니라 **공백/`/`** 였다.
- `pnpm( |$).*( dev|dev )` (PR #1077 dev 제안) — 기각. 사유는 **구조**다 — `( dev|dev )` 는 `dev` 의 **한쪽 경계만** 요구하므로 반대쪽이 열려 있다. 아래는 실 프로세스가 아닌 **합성 프로브**이며, 그 열린 쪽을 시연한다:

  > ⚠️ **2026-08-16 정정 (PR [#1095](https://github.com/coseo12/astro-simulator/pull/1095) reviewer).** 종전 이 항목은 *"채택 코퍼스에서는 **동률**이다. 22건 위장 프로세스의 pnpm 축에서 거짓 양성 `0` / 거짓 음성 `0`"* 으로 시작했다. **거짓이다.** 그 형태는 `…/bin/pnpm dev`(EOL)를 놓쳐 pnpm 축 **거짓 음성 `1`** 이며, base 22건·head 29건 **양쪽 코퍼스에서 모두** 그렇다. 기전: `pnpm( |$)` 가 공백을 소비하고 나면 남은 것이 `dev` 뿐이라 `( dev|dev )` 의 좌·우 공백이 **둘 다 부재**한다. #1066 에서 승계된 오기이며, **기각 결론은 유효**할 뿐 아니라 근거가 «구조만» 에서 «구조 + 결과» 로 **강화**된다. 재현:
  >
  > ```bash
  > # 검출 의무 코퍼스의 pnpm 축 (verify-zombie-check.mjs 의 TP_FIXTURES 에서 pnpm 만)
  > #   후보 3     → 4 / 5   ← `…/bin/pnpm dev` 미검출
  > #   채택안     → 5 / 5   ← 양성 대조군 (술어가 살아 있음)
  > ```

  ```bash
  # 앞쪽만 경계 → 통과(=거짓 양성) / 채택안은 뒤쪽 경계까지 요구해 배제
  printf 'pnpm --filter web development\npnpm run dev-preview\n' \
    | grep -cE 'pnpm( |$).*( dev|dev )'                        # 2
  printf 'pnpm --filter web development\npnpm run dev-preview\n' \
    | grep -cE 'pnpm( +[^ &|;]+)* +dev( |$)'                   # 0
  ```

  ⚠️ 프로브 입력에서 `&&` 를 뺀 것은 #1086 이후 의도적이다 — 채택안이 명령 분리자도 막게 되면서, 분리자를 포함한 입력은 **경계 축이 아니라 분리자 축**으로 걸러져 이 시연이 무엇을 보여주는지 흐려진다. 위 두 줄은 분리자가 없어 오직 `dev` 우경계만 판정에 관여한다.

  덧붙여 이 후보는 **pnpm 축만** 다루므로 동종 결함인 `cargo .*test` 가 남는다. 채택안은 두 축을 같은 원리로 닫는다.

⚠️ **`nextest` 는 `next`+`test` 가 아니라 `nex`+`test` 다.** `(next)?test` 로 흡수하려던 초안이 `cargo nextest run` 을 놓쳤고(실측), `(nextest|test)` 명시 열거로 교정했다. 문자열 겹침을 눈으로 세지 말고 코퍼스로 판정해야 하는 사례다.

### 10-1. #1086 보정 — 채택안 잔여 3건

#1066 채택안에는 잔여가 3건 있었고 PR [#1080](https://github.com/coseo12/astro-simulator/pull/1080) 리뷰가 전부 실측으로 짚었다. 셋 다 **같은 뿌리**다 — 위 «교정 원리» 를 패턴 전역에 자기적용하지 않았다.

| # | 잔여 | 증상 | 보정 |
| --- | --- | --- | --- |
| 🟡-3 | 구분자를 공백 **1개**로 못박음 | `pnpm  dev`(공백 2개) 미검출 (구 `1` → #1066 `0`) | `( +…)* +` |
| 🟡-4 | 중간 토큰이 명령 분리자를 넘음 | `cargo build --release && pnpm test` 를 **cargo 축으로 오귀속** | `[^ &\|;]` |
| 🟡-4b | `next dev` 분기에 우경계 없음 | `next development` · `next dev-preview` 매칭 | `next dev( \|$)` |

**🟡-3 — 이슈 제안대로는 안 고쳐진다.** 권고된 `( +[^ ]+)*` 는 **중간 토큰**의 구분자만 넓히고 마지막 구분자는 ` ` 로 남는다. 실측에서 `pnpm  dev` 는 여전히 `0` 이다 (아래 표 3열). 실제 교정은 마지막 ` dev` → ` +dev` 다. 발생 경로도 좁다 — `ps` 는 argv 를 공백 **1개**로 이으므로 셸에 `pnpm··dev` 라 쳐도 자식 프로세스의 명령행은 공백 1개다. 공백이 보존되는 건 `sh -c 'pnpm··dev'` 처럼 **한 argv 원소 안에** 들어갔을 때뿐이다. 그래도 고친 이유는 «검출 능력 손실 `0`» 이라는 **전칭 단정의 반례**였기 때문이고, 아래에서 그 문장도 함께 코퍼스 한정으로 낮췄다.

**🟡-4 — 가상 형태가 아니다.** bare `test` 스크립트는 워크스페이스 **4곳**에 실재한다 (`apps/web` · `packages/core` · `packages/physics-wasm` · `packages/shared`. 계수 술어: git-tracked `package.json` 5개 중 `scripts.test` 보유 수 — 루트만 `test:unit` 이라 미보유). 즉 `pnpm test` 는 실제로 쓰이는 형태다. 다만 이건 **회귀가 아니라 계승된 결함**이다 — 구 패턴도 같은 hit 을 냈다. 종전 FP 코퍼스가 이 축을 못 잡은 이유는 픽스처가 `pnpm test:unit` 이라 `:` 가 우경계를 깨줬기 때문이고, bare 형태는 코퍼스 밖이었다. 보정 후 `&&` · `;` · `|` 를 각 1건씩 픽스처로 고정해 **문자 클래스 세 문자가 개별 판정**되게 했다.

**🟡-4b — 기각 논거의 자기적용 실패.** 후보 3 을 기각한 근거가 *"한쪽 경계만 요구하므로 반대쪽이 열려 있다"* 였는데, 채택안의 `next dev` 분기는 **우경계가 아예 없어** 같은 결함을 갖고 있었다. 좌경계는 붙이지 않는다 — 실 argv 가 `…/next/dist/bin/next dev` 라 앞이 `/` 이므로 좌경계를 걸면 **거짓 음성**이 된다 (그래서 이 분기는 «양쪽 경계» 가 아니라 «우경계만» 이 정답이다).

**실측** (2026-08-16, `exec -a` 위장 프로세스 형태 **29건** = 검출 의무 13 + 미검출 의무 16. 미검출 16건에는 위 표의 입력·출력 리다이렉션이 **양방향 모두** 포함되며 `> /dev/null` 축은 `/bin/sh -c …` 형태로 **단독 격리**한 2건을 따로 두고, #1086 이 명령 분리자 3건 + `next` 우경계 2건을 더했다. 재현 술어: `node scripts/verify-zombie-check.mjs` 의 항목 7 — 코퍼스 정본은 그 스크립트의 `TP_FIXTURES` / `FP_FIXTURES` 다):

| 축 | 구 (#440~) | #1066 채택 | #1066 + `( +[^ ]+)*` (이슈 제안) | **#1086 채택** |
| --- | --- | --- | --- | --- |
| 거짓 양성 (미검출 의무 16건 중) | **16** | 5 | 5 | **0** |
| 거짓 음성 (검출 의무 13건 중) | 0 | 1 | 1 | **0** |

이슈가 권고한 `( +[^ ]+)*` 단독안이 #1066 과 **완전 동률**(5 / 1)인 것이 위 «안 고쳐진다» 의 근거다. grep 소요는 네 패턴 모두 `3.1~3.3 ms/회` (n=50 평균, 위 29건 입력) 로 중첩 수량자에 의한 백트래킹 폭발은 관찰되지 않았다.

⚠️ **«검출 능력 손실 `0`» 은 코퍼스 한정 진술이다** (#1086 정정 — 종전 서술은 전칭 단정이었다). 위 표의 거짓 음성 `0` 은 **검출 의무 13건에 대해서만** 참이고, 코퍼스 밖에는 **의도된 미검출**이 있다: 실 `pnpm dev` 프로세스 트리 대조에서 구 5 hit → 신 4 hit 이며 줄어든 1건은 **하네스 래퍼 셸 자신**이다 (`eval '… pnpm dev' < /dev/null` — 뒤가 `'` 라 토큰 경계를 만족하지 않는다). 같은 트리의 자식 4건(`pnpm` 2 · `next` · `next-server`)이 전부 남으므로 **포트를 쥔 프로세스는 여전히 검출**되며, 사라진 것은 중복 노이즈뿐이다 — 손실이 `0` 인 게 아니라 **손실이 무해한 중복**이라는 것이 정확한 서술이다.

### 10-2. 채택안이 놓치는 형태 — 재검토 트리거

현 패턴은 **현 시점 스크립트 명명 규칙**에 맞춰져 있다. 아래 두 축은 지금 넓히면 **오탐**이므로 넓히지 않되, 명명 규칙이 바뀌면 재검토한다 — 두 축을 하나로 묶는 이유는 트리거가 같기 때문이다: **워크스페이스 스크립트 이름이 패턴의 유효 범위를 정한다.**

| 축 | 현 모집단 | 트리거 | 검토할 확장 |
| --- | --- | --- | --- |
| `dev` 파생 | `dev` **단일 토큰만** 존재 (`dev:web` 형태 없음) | `pnpm dev:<x>` 형태 도입 | `dev(:[^ ]+)?( \|$)` |
| `test` 축 | bare `test` **4곳** 실재하나 pnpm 분기는 `dev` 만 커버 | 장시간 `pnpm test` 를 검출 대상으로 삼기로 결정 | pnpm 분기에 `(dev\|test)` |

`dev:*` 를 지금 배제한 것은 **올바른 판단**이다 (PR #1080 cross-validate) — 존재하지 않는 형태를 위해 넓히면 `dev:` 로 시작하는 무관 토큰까지 열린다. `test` 축도 같다: 현재 `pnpm test` 는 **검출 대상이 아니며**, #1086 이전에 그게 잡히던 것은 커버리지가 아니라 cargo 축 **오귀속**이었다. 둘 중 하나라도 트리거가 발생하면 `verify-zombie-check.mjs` 코퍼스에 픽스처를 먼저 추가하고 실측으로 판정한다.

**회귀 가드**: `scripts/verify-zombie-check.mjs` 항목 7~9. 위 코퍼스를 hook 의 `PATTERN` 으로 **재판정**하고(정적 형태 검사가 아니라 실제 `grep -E` 호출 — `.*` 우회 형태는 무한하므로 금지 문자열 목록으로는 못 막는다), `qa.md` · 본 문서의 사본이 hook 과 **축자 일치**하는지 대조한다. 부수로 ERE 방언 차이(로컬 macOS BSD grep ↔ CI ubuntu GNU grep)도 같은 검사가 걸러낸다.

⚠️ **항목 8·9 의 대조 방식은 #1086 에서 바뀌었다 — 사본 «형태» 가 아니라 «개수» 를 못박는다.** 종전에는 `grep -E '<PATTERN>'` **형태 하나만** 찾았고, 그래서 §9 정본 명령은 보되 바로 위 §10 의 **bare 코드펜스는 못 봤다** — reviewer 실증: 그 펜스만 구 패턴으로 되돌려도 가드는 `9/9 PASS`. 사본을 기계로 묶겠다는 항목 9 자신의 취지에 난 구멍이었다. 교정은 **파일별 축자 사본 수 pin** 이다 (`qa.md` `1` / 본 문서 `2` = §9 명령 + §10 펜스). 「어느 펜스가 정본인가」를 판정할 필요가 없으므로 **설명용 펜스·반례 인용은 구조적으로 오탐 `0`** — 그것들은 정의상 `PATTERN` 과 **다른 문자열**이라 축자 계수에 애초에 걸리지 않는다. 형태 확장안(펜스 추출 정규식 확대)을 기각한 이유가 이것이다: 이 문서는 §1 동결 인용 펜스가 `next dev` 를 싣고 §10 산문이 구 패턴을 반례로 인용하므로, **내용 기반 추출은 정상 문서에서 즉시 오탐**을 낸다. 사본 자체를 없애는 안(§10 펜스 → §9 링크)도 기각했다 — §10 은 패턴을 **도출하는** 절이라 결론 리터럴을 빼면 도출이 읽히지 않고, §9 는 이미 근거를 §10 으로 넘기고 있어 상호 참조만 남는다. ⚠️ **잔여 한계**: 「처음부터 hook 과 다른 값으로 **새 사본을 추가**」하는 경우는 개수가 그대로라 통과한다. 이 축의 커버는 PR diff 리뷰이며 기계 가드가 아니다. 사본을 늘리거나 줄이는 변경은 가드의 `EXPECTED_PATTERN_COPIES` 를 **같은 PR 에서** 갱신해야 한다 — 그 순간이 곧 *"중복 출처를 하나 더 두는 게 맞는가"* 를 사람이 판정하는 지점이다 (volt [#120](https://github.com/coseo12/volt/issues/120)).

⚠️ **CLAUDE.md §가드 B 는 변경 대상이 아니다** — 실측 판정이다. 그 패턴 `cargo|next dev|physics_wasm-` 에는 `.*` 가 **없고**, `cargo` 는 리터럴 부분문자열이라 **리다이렉션 어느 방향으로도** `/dev/null` 로 이어질 경로 자체가 성립하지 않는다 (위 양방향 표의 두 축 모두 비해당). 폭이 넓은 것은 결함이 아니라 **의도**다 (복귀 직후 정리는 `cargo build` 를 포함한 cargo 프로세스 전부를 봐야 하고, hook 이 보지 않는 `physics_wasm-` 테스트 바이너리가 그쪽 범위에 있다). #1065 판정 — *3곳이 공유하는 SSoT 는 ETIME 30분 임계뿐* — 을 유지하며, 통일은 목표가 아니다. 위 회귀 가드가 §가드 B 를 축자 일치 대상에서 **의도적으로 제외**하는 이유도 같다.

---

## 잔여 계약의 근거 (PR #981 리뷰)

CLAUDE.md 잔여 블록 상단의 **잔여 계약**은 실패 전례에서 나왔다. #980 1차 이관은 **인간-루프 의무를 원본 8회 → 1회로 강등**시켰다:

- **가드 A** — `점유 시 ps -p $(...)` 로 문장이 끝나 **조건절만 있고 귀결절이 없었다**. 좀비를 탐지하라고만 하고 **사용자에게 보고하라는 지시가 사라졌다**
- **`--all`** — *"병행 브라우저 작업 부재 확인 후"* 전제가 소실돼 **허가만 남았다**. #926 모드 분리(병행 에이전트 오살 방지)의 존재 이유가 지워진 것
- **가드 B** — 발견 시 대응(사용자 보고 + 정리)이 소실

reviewer 판정: *"잔여만으로 **탐지 절차는 100%, 대응 절차는 0%** 재현된다."* 원인은 메인이 부과한 `≤23,000` 임계였다 — **기계 가드는 당시 35,000 warn 이었는데 자기 부과 목표가 행동 규칙을 축출**하고 있었다. 임계를 완화해 복원했다. (기계 가드 경보 임계는 이후 #980 축 B 에서 **33,000** 으로 하향됐다 — [`claudemd-governance.md`](../guides/claudemd-governance.md) §3.1.1.)

> **미래 다이어트 작업자에게**: 예산이 빠듯하면 **서사를 더 옮기지 행동 규칙을 자르지 마라.** 특히 *"사용자에게 보고/확인"* 류는 CRITICAL #5 (`rm -rf`/force-push/DB drop) 열거가 **프로세스 kill 을 덮지 못하므로** 이 잔여가 유일한 방어선이다.
