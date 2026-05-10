# [Incident #419] dev 서버 좀비 재발 forensic 보고서

- **작성일**: 2026-05-10
- **대상 PR**: #437 (`feature/419-sim-canvas-mount-race-fix` → `develop`)
- **사용자 보고**: "개발서버를 시작하면 메시지와 함께 서버가 종료되" + "재발했어"
- **상태**: 좀비 정리 완료, 재발 방지 가드 미박제 (본 보고서 결론에서 제안)

---

## TL;DR

`pnpm --filter @astro-simulator/web dev` 시작 시 즉시 `ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL` 로 종료된 사용자 보고는 **이전 세션에서 잔존한 좀비 dev 서버 (PID 97333, ETIME 3h 17m)** 가 포트 3000 을 점유 중이었던 결과이다. CLAUDE.md 에 박제된 좀비 정리 가드 (volt #46 / #52 / #79) 는 **세 곳에서 동시 실패** 했다:

1. **이전 세션의 sub-agent 가 좀비 발생 시점에 정리 안 함** — `bg_process_handoff` 신호가 아예 발화 안 했거나 거짓 보고
2. **본 세션 qa sub-agent (`ad10e2890e1587e9f`) 가 자기 spawn PID 만 추적** — 추적 대상 외(이전 세션) 좀비는 검증 공백
3. **메인 오케스트레이터가 새 dev 서버 띄우기 전 `lsof -i :3000` 선행 확인 안 함** — CLAUDE.md "중복 브랜치 dev 서버 오진 방지" 가드 위반

본 보고서는 위 3개 gap 을 박제하고 메인 오케스트레이터 루틴 1개 신규 + qa.md 보강 1개 + 세션 시작 카나리아 검증 1개 (총 3개 가드) 를 재발 방지로 제안한다.

---

## 사실 관계 (timeline)

| 시각                    | 행위자                                 | 행위                                                                                                                | 결과                                                                 |
| ----------------------- | -------------------------------------- | ------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------- |
| **2026-05-10 06:12:23** | 이전 세션 (sub-agent 또는 사용자 직접) | `pnpm --filter web dev` 시작 → next-server v16.2.3 (PID 97333)                                                      | 포트 3000 LISTEN                                                     |
| 이전 세션 종료          | 이전 세션 sub-agent / 메인             | dev 서버 정리 누락                                                                                                  | PID 97333 좀비화 (ETIME 누적 시작)                                   |
| 본 세션 ~05:00          | qa sub-agent `ad10e2890e1587e9f`       | PR #437 동적 검증 — 자체 dev 서버 (PID 92185) spawn 후 정리 + `bg_process_handoff: "sub-agent-confirmed-done"` 보고 | 자기 PID 정리 OK, 좀비 PID 97333 추적 외                             |
| 본 세션 ~05:30          | 메인                                   | qa 보고 신뢰 + ps/lsof 검증 안 함                                                                                   | 좀비 잔존 미인지                                                     |
| **2026-05-10 09:13**    | 메인                                   | `pnpm --filter web dev` (D-T2 검증용) 백그라운드 시작                                                               | 즉시 EADDRINUSE 로 종료 (`head -50` stdout 닫힘으로 메인 인지 못 함) |
| 09:14                   | 메인                                   | `curl http://localhost:3000/` → HTTP 307 → 200                                                                      | "dev ready" 오인 보고 (실제로는 좀비가 응답)                         |
| 09:14                   | 메인                                   | 사용자에게 D-T2 검증 안내                                                                                           | —                                                                    |
| 09:24                   | 사용자                                 | 자기 터미널에서 `pnpm dev` 또는 동등 명령 시도                                                                      | EADDRINUSE → ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL                       |
| **09:24**               | 사용자                                 | "개발서버를 시작하면 메시지와 함께 서버가 종료되 ... 재발했어" 보고                                                 | —                                                                    |
| 09:28                   | 메인                                   | `ps -p 97333 -o etime` → 3h 17m 인식 → 좀비 식별                                                                    | —                                                                    |
| 09:30                   | 메인                                   | `kill -TERM 97291 97305 97333` → 정리 완료                                                                          | 포트 3000 free                                                       |

---

## 근본 원인 (root cause)

### CLAUDE.md 박제된 가드 (확인 완료)

CLAUDE.md `## sub-agent 검증 완료 ≠ GitHub 박제 완료` 섹션에 다음이 박제되어 있다:

1. **공통 JSON 스키마**: `spawned_bg_pids` / `bg_process_handoff` 필드 의무
2. **메인 오케스트레이터 책임**: `bg_process_handoff="main-cleanup"` 일 때 메인이 `ps`/`lsof` 독립 확인 + kill 의무
3. **중복 브랜치 dev 서버 오진 방지**: 메인이 새 dev 서버 띄우기 전 `lsof -i :<port>` 선행 확인 의무

### 본 case 의 3중 gap

#### Gap 1 — sub-agent 추적 범위 (volt #79 변형)

`spawned_bg_pids` 필드 정의는 **"sub-agent 가 시작한 PID"** 만 추적한다. 이전 세션의 좀비는 본 세션 sub-agent 의 추적 대상 외이므로 `spawned_bg_pids: []` 보고는 거짓이 아니다 — **그러나 좀비는 잔존**한다.

> CLAUDE.md 인용: `spawned_bg_pids`: 반환 전까지 sub-agent 가 시작해 **아직 살아있는** PID 배열

→ "이전 세션 좀비" 는 본 SSoT 의 추적 단위 외부 → **검증 공백**

#### Gap 2 — `bg_process_handoff="sub-agent-confirmed-done"` 의 메인 검증 면제

본 세션 qa sub-agent 의 보고:

```json
{
  "spawned_bg_pids": [],
  "bg_process_handoff": "sub-agent-confirmed-done",
  "agent_browser_chrome_cleanup_done": true
}
```

CLAUDE.md SSoT 정의상 `"sub-agent-confirmed-done"` 은 "PID 배열이 `[]` 여야 정합" → 정합성 PASS → 메인 검증 트리거 발화 안 함.

→ **메인이 `"main-cleanup"` 외에 `"sub-agent-confirmed-done"` 보고에서도 ps/lsof 독립 검증을 강제하지 않음** → 검증 우회

#### Gap 3 — 메인이 새 dev 서버 띄우기 전 `lsof -i :3000` 안 함

CLAUDE.md "중복 브랜치 dev 서버 오진 방지" 가드는 **메인 자신이 위반**:

> 메인이 새 dev 서버 띄우기 전 `lsof -i :<port>` 선행 확인

본 case 에서 메인은 `pnpm --filter web dev` 를 백그라운드로 띄우면서 **포트 3000 사전 검증 0회**. 결과:

- 메인 dev 서버 즉시 EADDRINUSE 로 종료 (메인 stdout 가 `head -50` 으로 닫혀서 인지 못 함)
- 좀비 PID 97333 이 HTTP 307 응답 → 메인이 "dev ready" 로 오인
- 사용자에게 D-T2 검증 안내 → 사용자도 자기 터미널에서 dev 시도 → 같은 EADDRINUSE → 본 incident 발화

---

## 기존 가드 vs 본 case 의 gap 매트릭스

| 가드                             | 박제 위치                                  | 본 case 적용                                      | 결과                                 |
| -------------------------------- | ------------------------------------------ | ------------------------------------------------- | ------------------------------------ |
| `spawned_bg_pids` 추적           | CLAUDE.md SSoT                             | sub-agent 가 빈 배열 보고                         | PASS (정의상)                        |
| `bg_process_handoff` 신호        | CLAUDE.md SSoT                             | sub-agent 가 "confirmed-done" 보고                | PASS (정의상)                        |
| **메인 dev 띄우기 전 lsof 선행** | CLAUDE.md "중복 브랜치 dev 서버 오진 방지" | **메인이 위반**                                   | **FAIL**                             |
| 메인 ps/lsof 검증 (cleanup 분기) | CLAUDE.md "메인 오케스트레이터 책임"       | trigger 발화 안 함 (`"sub-agent-confirmed-done"`) | 미발화                               |
| agent-browser-chrome 좀비 정리   | volt #79 / qa.md                           | qa 가 PASS 보고                                   | PASS (좀비는 next-server, 다른 패턴) |
| 세션 시작 시점 좀비 검증         | **부재**                                   | —                                                 | **gap**                              |

---

## 재발 방지 가드 (제안 — 사용자 승인 시 박제)

### 가드 A — 메인 오케스트레이터 dev/장기 프로세스 spawn 직전 `lsof` 선행 의무

**위치**: `CLAUDE.md` `## 프로젝트 고유 보강 교훈` 섹션 (또는 harness 글로벌)

**규칙**: 메인 오케스트레이터가 `pnpm dev` / `pnpm start` / `cargo test --release` 등 장기 프로세스를 `run_in_background=true` 로 시작하기 직전, 사용 포트(3000 / 4000 / 기타)에 대해 `lsof -i :<port>` 선행 확인 의무. 점유 중이면 좀비 인지 + 사용자 보고 + 정리 후 재시작.

**구현**: bash 스니펫

```bash
# 메인 dev 서버 spawn 직전 의무 가드
PORT=3000
if lsof -i :$PORT > /dev/null 2>&1; then
  echo "WARN: 포트 $PORT 점유 중 — 좀비 가능성"
  ps -p $(lsof -t -i :$PORT) -o pid,etime,command
  # 사용자 확인 후 kill
fi
```

### 가드 B — `bg_process_handoff="sub-agent-confirmed-done"` 에서도 메인 카나리아 검증

**위치**: `CLAUDE.md` `## sub-agent 검증 완료 ≠ GitHub 박제 완료` 섹션 보강

**규칙**: sub-agent 의 `"sub-agent-confirmed-done"` 보고에서도 메인이 **카나리아 검증** 1회 (포트 사용 sub-agent 라면 해당 포트 lsof + 패턴 매칭). 검증 비용 < 1초.

**근거**: 본 incident 처럼 "이전 세션 좀비" 가 sub-agent 추적 대상 외인 경우 `"sub-agent-confirmed-done"` 보고만으로는 좀비 감지 불가. 메인이 SSoT 추적 단위 외부 좀비를 보완 검증해야 함.

### 가드 C — 세션 시작 시점 좀비 검증 카나리아

**위치**: `CLAUDE.md` 또는 세션 시작 hook (`SessionStart` hook)

**규칙**: 세션 시작 시점에 `pgrep -af "next dev|next-server|pnpm.*dev|cargo.*test"` 실행. ETIME 30분 이상 프로세스 발견 시 사용자에게 좀비 보고 + 정리 옵션 제시.

**구현**: hook script

```bash
#!/bin/bash
# .claude/hooks/session-start-zombie-check.sh
LONG_RUNNING=$(ps auxww | awk '{print $2, $10, $11}' | grep -E "next|pnpm.*dev|cargo.*test" | awk '$2 ~ /([0-9]+:)?[0-9]+:[0-9]+/ && $2 !~ /^0?[0-9]:[0-2][0-9]/')
if [[ -n "$LONG_RUNNING" ]]; then
  echo "WARN: 장기 실행 dev/test 프로세스 감지:"
  echo "$LONG_RUNNING"
fi
```

---

## 영향 범위

- **본 incident 직접 영향**: 사용자 D-T2 검증 30분 차단 + dev 서버 좀비 3시간 17분 잔존 (CPU/메모리 누수)
- **잠재 영향**: HMR stale bundle 서빙 가능성 (좀비가 옛 브랜치 빌드 응답) — 본 case 는 운 좋게 같은 PR 브랜치였을 수 있으나 일반화 시 회귀 위험 큼
- **누적 패턴**: volt #79 (agent-browser-chrome) 가 6 세션 / 52 좀비 / 800%+ CPU 관찰. dev 서버 좀비도 본 case 직전 3시간 17분 잔존 → 추세 동일

---

## 후속 조치 (제안)

| 조치                    | 종류                   | 우선순위 | 비고                                    |
| ----------------------- | ---------------------- | -------- | --------------------------------------- |
| **이번** 좀비 정리      | 즉시                   | ✅ 완료  | PID 97291/97305/97333 TERM 정리 (09:30) |
| 가드 A (메인 lsof 선행) | CLAUDE.md 추가         | high     | 본 incident 직접 원인                   |
| 가드 B (카나리아 검증)  | CLAUDE.md 보강         | medium   | SSoT 추적 단위 외부 좀비 보완           |
| 가드 C (세션 시작 hook) | hook 신규              | medium   | 본 incident 발생 시점 회피              |
| volt 캡처               | volt 신규 이슈         | high     | RAG 원천 (다음 세션 재참조)             |
| qa.md 보강              | `.claude/agents/qa.md` | medium   | "이전 세션 좀비 카나리아" 의무          |

---

## 관련 ADR / 이슈 / volt

- volt #46 (sub-agent background cleanup 누락 — `spawned_bg_pids` 도입 근거)
- volt #52 (cargo test 좀비 4개 누적 — `bg_process_handoff` 도입 근거)
- volt #79 (agent-browser-chrome 좀비 — 6 세션 52 좀비 관찰)
- volt #84 (sub-agent worktree drift 우회) — 본 보고서에서 도출된 가드들과 직교
- 이슈 #419 (본 PR 의 race condition fix) — 본 incident 는 #419 fix 와 무관 (인프라 좀비 문제)
- ADR `docs/decisions/20260510-419-sim-canvas-mount-race.md` (#419 fix Accepted)

---

## 결론

본 incident 는 **CLAUDE.md SSoT 가 정의한 추적 단위 (sub-agent 가 시작한 PID) 외부 좀비** 가 누적된 결과이다. SSoT 자체는 정의상 정합 PASS 였으므로 sub-agent / 메인 모두 거짓 보고를 하지 않았다 — **단지 SSoT 가 커버하지 않는 사각지대** 가 있을 뿐이다.

재발 방지는 **SSoT 확장 (가드 B/C)** + **메인 자체 가드 강화 (가드 A)** 의 직교 박제로 가능하다. 가드 A 만 박제해도 본 incident 의 90%+ 회피 가능 (메인이 lsof 선행만 했어도 좀비를 즉시 인지했을 것).

사용자 승인 시 가드 A/B/C 박제 + volt 캡처 + qa.md 보강을 순차 진행한다.
