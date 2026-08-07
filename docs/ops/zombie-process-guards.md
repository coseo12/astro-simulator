# 좀비 프로세스 가드 — 계층 구조 + incident 서사 (#440 / volt #24·#46·#52·#79)

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

**왜 "완주 못 함"이 핵심인가**: 실패가 아니라 **미완주**라서 아무도 신호를 받지 못한다. 테스트는 실패 보고를 하지 않고 그냥 느려지며, 에이전트는 "테스트가 원래 오래 걸린다"로 해석해 대기를 늘린다. 정상 4~5분 대비 10배+ 지연은 그 해석을 강화하는 방향으로만 작용한다 — 그래서 사람이 개입할 때까지 자체 교정되지 않는다.

`cargo test --lib` 호출 시간이 길수록 위 경쟁이 발생할 창이 넓어진다. 위 "cargo test 호출 규범"이 `#[ignore]` 로 장기 적분 테스트를 일상 경로에서 떼어내는 이유가 이것이다.

---

## 2. agent-browser Chrome 좀비 변형 (volt #79)

> - **agent-browser Chrome 좀비 변형** (volt [#79](https://github.com/coseo12/volt/issues/79)): qa / browser-test sub-agent 가 `agent-browser` 도구로 real Chrome 사용 후 세션 종료 시 정리 누락. 식별자 `agent-browser-chrome-<UUID>` user-data-dir (사용자 본 Chrome 영향 0). 본 세션 (2026-04-28) 실측 6 세션 / 52 좀비 / 3일치 누적 → 800%+ CPU 관찰. **메인 루틴** (sub-agent 복귀 직후 의무): `pgrep -af "agent-browser-chrome[-]"` 검사 + 좀비 확인 시 `bash scripts/cleanup-browser.sh --all` (병행 브라우저 작업 부재 확인 후 — 메인 전용). **sub-agent 루틴** (반환 직전 의무): `bash scripts/cleanup-browser.sh` 기본 모드 (전량 pkill 금지 — 병행 오살 방지, #926). agent-browser 도구 자체 cleanup 이 정상 case 에선 작동하나 sub-agent 비정상 종료 (timeout / SIGKILL / panic) 시 lineage 끊긴 좀비 잔존. cargo/next dev 의 `spawned_bg_pids` SSoT 가 직접 spawn 한 PID 만 커버하므로 도구 wrapper 가 spawn 한 child process 는 별도 검증 의무

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

> - **세션 시작 시점 좀비 검출 hook**: `.claude/hooks/session-start-zombie-check.sh` 가 SessionStart hook 으로 등록되어 (`.claude/settings.json`) Claude Code 세션 시작 시 자동 실행. ETIME 30분 이상 `next dev` / `next-server` / `cargo .*test` / `pnpm.*dev` 프로세스 발견 시 stdout 으로 PID/ETIME/command 출력 → Claude 가 사용자에게 정리 권고. exit 0 (블록 안 함, 경고만). 가드 A/B 가 **본 세션 안의 spawn 시점** 가드라면 가드 C 는 **세션 시작 진입 시점** 가드 — 사용자가 인지하기 전 자동 검출. SSoT 박제 회귀 차단은 `scripts/verify-zombie-check.mjs` (CI 통합) 가 담당.

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

상세는 [`operational-friction.md`](operational-friction.md) §3 ([#795](https://github.com/coseo12/astro-simulator/issues/795)).
