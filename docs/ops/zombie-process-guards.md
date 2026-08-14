# 좀비 프로세스 가드 — 계층 구조 + incident 서사 (#440 / volt #24·#46·#52·#79)

> ⚠️ **본 문서의 인용 블록은 이관 시점(2026-08-07, #980)의 동결 스냅샷이다.** 행동 규칙의 **정본은 CLAUDE.md** 이며, CLAUDE.md 잔여가 갱신되면 여기 인용은 조용히 stale 해진다 (PR [#981](https://github.com/coseo12/astro-simulator/pull/981) 리뷰 🟡-2). 인용과 정본이 어긋나 보이면 **CLAUDE.md 를 신뢰**하고 본 문서를 갱신하라. ⚠️ **`ETIME 30분` 에 대한 자동 정합은 없다** — `verify-zombie-check.mjs` 의 항목 1~6 은 **헤더 문자열 pin + 파일 존재 확인**이고 `ETIME`/`30` 을 검사하는 assertion 은 **0건**이다 (PR [#981](https://github.com/coseo12/astro-simulator/pull/981) 2차 리뷰 🔴-A — 초판이 반대로 서술했다). **범위 한정 (#1066)**: 항목 7~9 가 추가돼 **패턴 리터럴**은 이제 기계 검증된다(hook `PATTERN` 을 실제 `grep -E` 로 코퍼스 판정 + `qa.md`·본 문서 사본과 축자 대조 — §10). 자동화된 것은 그 축뿐이고 임계값 축은 그대로다. `ETIME 30분` 은 §8 표대로 **4곳을 사람이 동시에 갱신**해야 하며, 그 값은 `scripts/cleanup-browser.sh` 가 프로세스를 실제로 kill 하는 판정 기준이다.

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

**회귀 차단 범위**: `scripts/verify-zombie-check.mjs` 는 6 항목을 정적 검사한다 — CLAUDE.md 가드 A/B sub-section 헤더 2건 / `.claude/agents/qa.md` "이전 세션 좀비 카나리아" 항목 / hook 파일 존재+실행권한 / `settings.json` hook **등록** 1줄 / forensic 보고서 존재. 등록 검사는 [#894](https://github.com/coseo12/astro-simulator/issues/894) 에서 추가됐다 — 그전에는 파일이 멀쩡해도 등록 1줄이 빠지면 가드 C 가 실행되지 않는데 가드는 초록이었다.

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

따라서 검출 명령의 의무는 — ① **좀비 카나리아 정본은 두 축을 동시에 막는** `ps -axww -o pid=,etime=,command= | grep -E 'next dev|next-server|cargo( [^ ]+)* (nextest|test)( |$)|pnpm( [^ ]+)* dev( |$)' | grep -v grep` (dev/test 계열. 패턴 리터럴의 근거는 아래 §10, 인용부호가 홑따옴표인 것은 `$` 확장 차단 의무다. 메인 §가드 B 는 `physics_wasm-` 를 포함한 **다른 검출 범위**를 쓴다 — 패턴은 위치마다 의도적으로 다르며 3곳이 공유하는 SSoT 는 **ETIME 30분 임계**다. 필터가 `grep -v grep` 인 것도 hook 과의 **의도적 차이**다 — 근거는 [`operational-friction.md`](operational-friction.md) §3 _"hook 필터를 그대로 복사하지 말 것"_) ② `pgrep`/`pkill` 을 쓸 때는 **`-a` 금지** ③ **bracket 은 유지** — 강등이 아니다. `-a` 를 뗀 뒤 pgrep 경로에서 형제 축을 막는 것은 bracket 뿐이고, 위 §_"pkill 은 안전 이슈"_ 대로 자기-kill 차단까지 겸한다. 덧붙여 `pgrep -af` 는 macOS 에서 명령행을 출력하지 않아 **무엇이 잡혔는지 볼 수단조차 없다**.

상세는 [`operational-friction.md`](operational-friction.md) §3 ([#795](https://github.com/coseo12/astro-simulator/issues/795) / 기전 정정 [#1054](https://github.com/coseo12/astro-simulator/issues/1054)).

## 10. 패턴 정밀도 — `.*` 무경계 확장 제거 (#1066)

§9 가 **누가 매칭 풀에 들어오는가**(자기 오탐 2축)를 다룬다면, 본 절은 **패턴이 무엇을 잡는가**를 다룬다. 두 축은 직교하며 `grep -v grep` 으로는 본 절의 결함이 해소되지 않는다 — 그 필터는 *패턴 리터럴을 실은 셸*을 거르는데, 여기서 잡히는 것은 셸이 아니라 **실제 무관한 프로세스**다.

**결함**: 구 패턴 `next dev|next-server|cargo .*test|pnpm.*dev` 의 `.*` 는 명령행 뒷부분까지 이어진다. 하네스 래퍼는 **모든** Bash 도구 호출 뒤에 `< /dev/null` 을 덧붙이므로, `pnpm.*dev` 의 `.*` 가 그 `/dev/null` 의 `dev` 에 도달해 **`pnpm` 을 포함한 임의 명령**이 좀비로 보고됐다. `cargo .*test` 도 동종 구조다 (`cargo build --release && pnpm test:unit` 이 걸린다). [#440](https://github.com/coseo12/astro-simulator/issues/440) 이래 hook `PATTERN` 에 선행했고 [#1065](https://github.com/coseo12/astro-simulator/pull/1065) 는 `qa.md` 를 이 패턴에 **정렬**시켰을 뿐 정밀도를 바꾸지 않았다.

**교정 원리**: `dev` / `test` 를 **공백 구분 토큰**으로만 인정한다 — 앞은 공백, 뒤는 공백 또는 EOL. `/dev/null` 의 `dev` 는 앞이 `/` 라 배제되고, 실제 인자로 등장하는 `dev` 는 그대로 남는다.

```
next dev|next-server|cargo( [^ ]+)* (nextest|test)( |$)|pnpm( [^ ]+)* dev( |$)
```

**기각된 후보 2건** (이슈 본문이 제시했으나 실측이 뒤집었다):

- `pnpm( run)? dev` — **거짓 음성**. 실 dev 서버 트리의 중간 프로세스가 `node …/bin/pnpm --filter @astro-simulator/web dev` 라 잡히지 않는다 (실측 argv).
- `pnpm [^|]*dev` — **결함 미해소**. 문제의 구간(`pnpm store path && sleep 200' < /dev/null`)에 `|` 가 없어 그대로 매칭된다. 경계로 삼아야 할 문자는 `|` 가 아니라 **공백/`/`** 였다.

⚠️ **`nextest` 는 `next`+`test` 가 아니라 `nex`+`test` 다.** `(next)?test` 로 흡수하려던 초안이 `cargo nextest run` 을 놓쳤고(실측), `(nextest|test)` 명시 열거로 교정했다. 문자열 겹침을 눈으로 세지 말고 코퍼스로 판정해야 하는 사례다.

**실측** (2026-08-14, `exec -a` 위장 프로세스 **19건** = 실 형태 11 + 무관 8):

| 축 | 구 패턴 | 신 패턴 |
| --- | --- | --- |
| 거짓 양성 (무관 8건 중) | **8** | **0** |
| 거짓 음성 (실 형태 11건 중) | 0 | 0 |

검출 능력 손실 없이 오탐만 사라졌다. 실 `pnpm dev` 프로세스 트리에 대한 대조에서도 구 5 hit → 신 4 hit 으로, 줄어든 1건은 **하네스 래퍼 셸 자신**이다 (`eval '… pnpm dev' < /dev/null` — 뒤가 `'` 라 토큰 경계를 만족하지 않는다). 같은 트리의 자식 4건(`pnpm` 2 · `next` · `next-server`)이 전부 남으므로 **포트를 쥔 프로세스는 여전히 검출**되며, 사라진 것은 중복 노이즈뿐이다.

**회귀 가드**: `scripts/verify-zombie-check.mjs` 항목 7~9. 위 코퍼스를 hook 의 `PATTERN` 으로 **재판정**하고(정적 형태 검사가 아니라 실제 `grep -E` 호출 — `.*` 우회 형태는 무한하므로 금지 문자열 목록으로는 못 막는다), `qa.md` · 본 문서의 사본이 hook 과 **축자 일치**하는지 대조한다. 부수로 ERE 방언 차이(로컬 macOS BSD grep ↔ CI ubuntu GNU grep)도 같은 검사가 걸러낸다.

⚠️ **CLAUDE.md §가드 B 는 변경 대상이 아니다** — 실측 판정이다. 그 패턴 `cargo|next dev|physics_wasm-` 에는 `.*` 가 **없고**, `cargo` 는 리터럴 부분문자열이라 `< /dev/null` 로 이어질 경로 자체가 성립하지 않는다. 폭이 넓은 것은 결함이 아니라 **의도**다 (복귀 직후 정리는 `cargo build` 를 포함한 cargo 프로세스 전부를 봐야 하고, hook 이 보지 않는 `physics_wasm-` 테스트 바이너리가 그쪽 범위에 있다). #1065 판정 — *3곳이 공유하는 SSoT 는 ETIME 30분 임계뿐* — 을 유지하며, 통일은 목표가 아니다. 위 회귀 가드가 §가드 B 를 축자 일치 대상에서 **의도적으로 제외**하는 이유도 같다.

---

## 잔여 계약의 근거 (PR #981 리뷰)

CLAUDE.md 잔여 블록 상단의 **잔여 계약**은 실패 전례에서 나왔다. #980 1차 이관은 **인간-루프 의무를 원본 8회 → 1회로 강등**시켰다:

- **가드 A** — `점유 시 ps -p $(...)` 로 문장이 끝나 **조건절만 있고 귀결절이 없었다**. 좀비를 탐지하라고만 하고 **사용자에게 보고하라는 지시가 사라졌다**
- **`--all`** — *"병행 브라우저 작업 부재 확인 후"* 전제가 소실돼 **허가만 남았다**. #926 모드 분리(병행 에이전트 오살 방지)의 존재 이유가 지워진 것
- **가드 B** — 발견 시 대응(사용자 보고 + 정리)이 소실

reviewer 판정: *"잔여만으로 **탐지 절차는 100%, 대응 절차는 0%** 재현된다."* 원인은 메인이 부과한 `≤23,000` 임계였다 — **기계 가드는 당시 35,000 warn 이었는데 자기 부과 목표가 행동 규칙을 축출**하고 있었다. 임계를 완화해 복원했다. (기계 가드 경보 임계는 이후 #980 축 B 에서 **33,000** 으로 하향됐다 — [`claudemd-governance.md`](../guides/claudemd-governance.md) §3.1.1.)

> **미래 다이어트 작업자에게**: 예산이 빠듯하면 **서사를 더 옮기지 행동 규칙을 자르지 마라.** 특히 *"사용자에게 보고/확인"* 류는 CRITICAL #5 (`rm -rf`/force-push/DB drop) 열거가 **프로세스 kill 을 덮지 못하므로** 이 잔여가 유일한 방어선이다.
