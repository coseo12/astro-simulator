# 세션 중단 dead-wait 방지 — 스케줄러 heartbeat 3계층 가드

> **요지**: CLAUDE.md 실전 교훈 "세션 중단 dead-wait 방지" 블록 상세. 본문 요약은 CLAUDE.md `## 실전 교훈` 의 포인터 참조.
>
> **근거**: volt [#121](https://github.com/coseo12/volt/issues/121) — astro-simulator #817 (PR #819) 에서 구현·검증, harness upstream 기여(Z-패턴 Phase 2) 대상.

---

## 문제 — 무인지 대기(dead-wait)

AI 에이전트 세션(Conductor 등)이 중단·재시작될 때, 메인 오케스트레이터 컨텍스트에는 "대기 중" 만 남고 실제 waiter 는 소멸한다.

- **근본 원인 (실측 확정)**: background watch·sub-agent 는 세션의 자식 프로세스 → 세션 재시작 시 SIGKILL 동반 사망(exit 137). 그 결과 **아무것도 모델을 재호출하지 않아 무기한 침묵**하고, 사용자는 진행 중으로 오인한다.
- **작업 유실보다 이 "무인지 대기" 가 더 치명적** — 실패는 재시도할 수 있으나, 침묵은 아무 신호도 남기지 않는다.
- **dead-man's switch 후보**: 스케줄러 기반 지연 재호출(Claude Code `ScheduleWakeup`)은 **세션 재시작에도 지속 발화**(실측). 자식 프로세스가 아니므로 세션이 죽어도 살아남아, 침묵을 깨는 유일한 신호가 될 수 있다.

## 3계층 직교 방어 (우선순위 순)

1. **fallback heartbeat (1차, 하드 보증)** — 모든 background 대기 진입 시 장기 `ScheduleWakeup`(1200~1800s)을 병행 예약. notification 이 먼저 오면 no-op(저비용 상태 재확인), 세션이 죽었다 재개되면 이 wakeup 이 **유일한 재호출 신호**가 된다. **단발성이므로 대기 해소 시 재예약하지 않음(자연 종료)** — 명시적 취소 API 불필요.
2. **SessionStart 복구 훅 (2차, 결정적 노출)** — 세션 시작 시 미해소 대기 잔존을 stdout 경고로 노출(exit 0, 블로킹 금지). 모델이 대기 재개 대신 즉시 상태 재확인하도록 유도. 좀비 프로세스 검출 훅과 동형 구조.
3. **대기 상태 파일 (3차, 맥락 상세)** — `.context/pending-waits.json` 등에 `{id: "<kind>:<식별자>", kind: sub-agent|ci-run, description, created_at}` 목록화. 2차 훅이 읽어 노출할 데이터 소스. **파일 write 는 best-effort(크리티컬 패스 밖)** — 누락돼도 1차 heartbeat 가 침묵을 깬다.

## 행동 규약 (메인 오케스트레이터)

- **기록**: 대기 진입 = `ScheduleWakeup 예약 + 상태파일 append` 를 **하나의 원자 단위**로 처리.
- **제거**: 대기 해소 시 해당 id 항목 제거.
- **복구 프로토콜 (훅 경고를 본 뒤)**: `(1) 대상 상태 조회(라벨/메시지) → (2) 생사·완료 판단 → (3) 항목 제거 또는 작업 재개`. **대기를 그대로 재개하지 말 것 — waiter 는 이미 소멸했을 수 있다.**

## 설계 결정 (트레이드오프)

- **별도 훅 파일 채택** (기존 좀비-검출 훅 확장 아님): 단일 책임 분리 + harness update clobber 면역(로직은 non-managed 신규 파일) + 회귀 격리(자체 verify).
- **heartbeat 우선 / 파일 보조**: "모델이 매번 파일 write 를 성실히 하리란 보장이 약하다" 는 근본 취약점을, 침묵 방지 크리티컬 패스를 스케줄러에 두어 완화.
- **훅은 검출만, 자동 정리 안 함** (masking 방지, fail-visible).

## 방어적 처리 (cross-validate 반영)

- **Grace Period**: `created_at` 기준 최소 유예(예: 60s) 경과 항목만 경고 → 세션 종료 직후 재시작 시 방금 진입한 대기 오탐 방지(좀비 검출 훅의 ETIME 임계값과 동형).
- **비정상 timestamp 대칭 노출**: 파싱불가 OR 미래 timestamp = 보수적 노출(은닉 금지).
- **방어적 JSON**: 빈/whitespace 파일 = 정상 초기 상태로 조용히 통과, 진짜 invalid 만 손상 경고. 어떤 입력에도 **exit 0 불변**(SessionStart 블로킹 절대 금지) + shell injection 미해석.

## harness 반영 상태

**A안(문서·행동 규약)** + **B안(실제 구현)** 모두 반영 완료 (#311, volt #121).

- **hook**: `.claude/hooks/session-start-dead-wait-check.sh` — SessionStart 훅. `.context/pending-waits.json` 을 읽어 Grace Period(기본 60s, `DEAD_WAIT_GRACE_SECONDS` override) 초과 미해소 대기만 stdout 경고. exit 0 불변. 경로는 `PENDING_WAITS_PATH` override 가능(testability).
- **등록**: `.claude/settings.json` `SessionStart` 배열에 `bash .claude/hooks/session-start-dead-wait-check.sh` 추가. (이 저장소는 harness upstream 이므로 다운스트림용 Z-패턴 sidecar 불필요 — settings.json 이 곧 SSoT.)
- **verify**: `scripts/verify-dead-wait-check.mjs` — 기본 모드는 SSoT 박제 회귀 정적 검증, `--self-test` 는 실제 hook 을 fixture 로 구동하는 3중 시뮬(positive → negative → recovery) + 방어 케이스(Grace Period / 비정상·미래 timestamp / 빈·whitespace·손상 JSON / 파일 부재 / shell injection 면역) = 17 assertion. `harness-guards` CI 에서 실행.
- **상태 파일**: `.context/` 는 `.gitignore` 등록(런타임 생성, best-effort). 메인 오케스트레이터가 대기 진입 시 append / 해소 시 제거.
- **행동 규약**: CLAUDE.md `### 세션 중단 dead-wait 방지 — 스케줄러 heartbeat 3계층 가드` 블록. heartbeat(1차) + 훅(2차) + 상태 파일(3차) 직교 방어.

좀비 검출 훅이 있는 harness 라면 "프로세스 라이프사이클 가드의 직교 확장 = 대기 라이프사이클 가드" 로 위치한다.

## 관련

- 상태 원자성 3계층 방어: [docs/architecture/state-atomicity-3-layer-defense.md](../architecture/state-atomicity-3-layer-defense.md) — 도중/사후/안내 3계층 직교 방어 패턴 (본 가드와 동형 구조)
- 구현 원본: astro-simulator #817 / PR #819 / ADR `20260710-817-dead-wait-guard.md`
