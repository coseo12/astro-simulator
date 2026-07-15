# ADR 20260710-817 — 세션 중단 dead-wait 가드 (대기 상태 영속화 + SessionStart 복구 훅 + fallback heartbeat 규약)

- 상태: **Accepted (cross-validate agy 2026-07-10)** — `## 교차검증 반영 사항` 4축 통합 완료. ADR Status 워크플로 #370 (운영 규약 신설 Provisional→Accepted 전이).
- 날짜: 2026-07-10
- 결정자: architect (sub-agent)
- 이슈: [#817](https://github.com/coseo12/astro-simulator/issues/817)
- 관련: 가드 A/B/C (#440, `.claude/hooks/session-start-zombie-check.sh` + `scripts/verify-zombie-check.mjs`), ci-watch-polling-pattern (2026-07-04 forensic — exit 137 실측 5회 / ScheduleWakeup 세션 재시작 지속 발화), #790 (fallback ScheduleWakeup 1800s 첫 실전 적용 — reviewer/qa heartbeat 전부 no-op = 정상), Z-패턴 ADR [20260515](20260515-harness-managed-divergent-pattern.md) §Amendment 8/11
- 용어: [glossary.md](../glossary.md) — ScheduleWakeup / 가드 A·B·C / Floating Origin 등. 본 ADR 이 **가드 D** (대기 라이프사이클) 신설

> **범위 주의**: 본 ADR 은 **설계 결정 박제**다. 훅(`.sh`)·verify(`.mjs`)·CLAUDE.md 박제·CI 배선은 developer 가 수행한다 (architect 는 설계 결정 + 실측 전제 검증만).

---

## 배경

세션(Conductor) 중단 시 **작업 유실보다 치명적인 실패 모드 = dead-wait (무인지 대기)**. 세션 재시작 시 메인 오케스트레이터 컨텍스트에는 "대기 중"만 남고 실제 waiter(background watch / sub-agent task-notification 경로)는 소멸한다. 그러면 **아무것도 모델을 재호출하지 않아 무기한 침묵**하고, 사용자는 진행 중으로 오인한다 (2026-07-09 사용자 직접 진단: "세션의 중단을 인지하지 못하고 대기하는 상황이 가장 큰 문제").

실측 전제(2026-07-04 forensic, 근본 원인 확정):

- background watch·sub-agent 는 세션 자식 프로세스 → Conductor 세션 재시작 시 SIGKILL 동반 사망 (exit 137, 실측 5회)
- **반면 `ScheduleWakeup` 스케줄은 세션 재시작에도 지속 발화** (동일 기간 5회+ 실측) → wakeup 을 dead-man's switch 로 쓸 수 있다

기존 가드 A/B/C (#440) 는 **좀비 프로세스**(포트 점유·CPU 폭주)를 검출하나 **미해소 대기 상태**는 검출하지 않는다. 본 ADR 은 그 직교 확장 — 프로세스 라이프사이클이 아니라 **대기 라이프사이클**을 다루는 **가드 D**를 신설한다.

3계층 방어를 설계한다 (직교, 우선순위 순):

1. **fallback heartbeat (1차, 하드 보증)** — 모든 background 대기에 장기 `ScheduleWakeup`(1200~1800s) 병행. notification 선착 시 no-op, 세션 재시작 시 **유일한 재호출 신호**. 침묵을 깨는 결정적 메커니즘.
2. **SessionStart 복구 훅 (2차, 결정적 노출)** — 세션 시작 시 미해소 대기 잔존을 stdout 경고로 노출 (가드 C 동형, exit 0). 모델이 대기 재개 대신 즉시 상태 재확인하도록 유도.
3. **`.context/pending-waits.json` (3차, 맥락 상세)** — 어떤 대기가 미해소인지 목록화. 2차 훅이 읽어 노출할 데이터.

## 후보 비교

### 축 A — SessionStart hook 통합 방식 (핵심 결정)

`.harness/manifest.json` 실측 결과 (2026-07-10, `git show origin/develop:.harness/manifest.json`):

| 파일                                          | manifest 등재 | category   |
| --------------------------------------------- | ------------- | ---------- |
| `.claude/settings.json`                       | ✅ line 77    | atomic     |
| `.claude/hooks/session-start-zombie-check.sh` | ✅ line 69    | atomic     |
| `scripts/verify-zombie-check.mjs`             | ✅ line 393   | **frozen** |

| 후보                                                                               | Z-패턴 표면                                                                                              | 단일 책임                             | 회귀 격리                                                                                  | harness update clobber 위험                                               | 비고                                    |
| ---------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------- | ------------------------------------- | ------------------------------------------------------------------------------------------ | ------------------------------------------------------------------------- | --------------------------------------- |
| **A1. 별도 훅** `session-start-dead-wait-check.sh` + settings.json 3번째 hook 등록 | settings.json 에 **등록 1줄** → sidecar `.claude/settings.json.HARNESS-DRIFT.md` (JSON 인라인 주석 불가) | ✅ 좀비/대기 직교 분리 (A/B/C→D 정합) | ✅ 자체 `verify-dead-wait-check.mjs`                                                       | 로직은 **non-managed 신규 파일** → 절대 clobber 안 됨                     | 상위 harness 기여도 clean new-file 추가 |
| A2. `zombie-check.sh` 확장                                                         | 훅 **로직 전체**가 managed atomic 파일에 혼입 → 인라인 `# HARNESS-DRIFT:` 데코레이터 + 대규모 drift 표면 | ❌ 좀비+대기 2책임 결합               | ❌ frozen `verify-zombie-check.mjs` 는 대기 needle 추가 불가 → **별도 verify 여전히 필요** | ⚠ managed atomic → `harness update --apply-all-safe` 가 로컬 확장 clobber | settings.json 미수정이 유일 장점        |

실측 근거 (measurement-first):

- `verify-zombie-check.mjs` (frozen, 92줄) 는 `includes(needle)` 정적 체크만 수행 — 확장해도 needle 은 안 깨지나 **대기 로직을 커버할 수 없다** (frozen 이라 needle 추가 불가). 즉 A2 에서도 `verify-dead-wait-check.mjs` 는 어차피 신설해야 한다 → A2 는 verify 를 아끼지 못한다.
- 두 후보 모두 정확히 **managed 파일 1개**를 건드린다. A1 = settings.json(등록 1줄, 안정), A2 = zombie-check.sh(로직 전체, clobber 취약). Z-패턴 표면이 A1 이 압도적으로 작다.

### 축 B — pending-waits 신뢰성 완화 (행동 규약의 신뢰성 한계)

메인이 매번 파일 쓰기를 성실히 하리란 보장이 약하다 (모델 행동 규약의 근본 취약점). "파일이 침묵 방지의 크리티컬 패스"로 두면 취약하다.

| 후보                                          | 침묵 방지 크리티컬 패스                             | 파일 write 누락 시                                          | 판정                       |
| --------------------------------------------- | --------------------------------------------------- | ----------------------------------------------------------- | -------------------------- |
| B1. 파일 우선 (hook 이 파일 읽어 재호출 유도) | `.context/pending-waits.json`                       | **dead-wait 재발** (파일 없으면 hook 이 노출할 것 없음)     | ❌ 취약점 그대로           |
| **B2. heartbeat 우선 (파일은 맥락 보조)**     | `ScheduleWakeup`(코드-인접, ScheduleWakeup 툴 호출) | 침묵은 wakeup 이 깬다. 파일은 "무엇이 대기였나" 맥락만 유실 | ✅ 파일이 크리티컬 패스 밖 |

## 결정

**A1 채택 — 별도 훅 + heartbeat-우선 3계층.**

**A. hook 통합 = A1 (별도 훅).** `.claude/hooks/session-start-dead-wait-check.sh` 신설 + `.claude/settings.json` 의 SessionStart 배열에 3번째 command hook 등록. 근거: (1) Z-패턴 표면이 등록 1줄(sidecar)로 최소, 로직은 non-managed 신규 파일이라 harness update clobber 면역, (2) 단일 책임 — 좀비(A/B/C) 와 대기(D) 직교, (3) 회귀 격리 — 자체 `verify-dead-wait-check.mjs`, (4) A2 도 별도 verify 를 어차피 신설해야 하므로 A2 의 "settings.json 미수정" 장점은 clobber 위험/책임 결합 비용에 비해 열세.

**B. pending-waits 라이프사이클 = B2 (heartbeat 우선, 파일 보조).**

- **스키마** (`.context/pending-waits.json`, workspace 로컬 gitignored):

  ```json
  {
    "version": 1,
    "waits": [
      {
        "id": "sub-agent:developer:817",
        "kind": "sub-agent",
        "description": "developer sub-agent — #817 dead-wait 가드 구현",
        "created_at": "2026-07-10T12:34:56Z",
        "wakeup_scheduled": true
      },
      {
        "id": "ci-run:12345678",
        "kind": "ci-run",
        "description": "PR #820 CI 완료 대기",
        "created_at": "2026-07-10T13:00:00Z",
        "wakeup_scheduled": true
      }
    ]
  }
  ```

  - `kind` ∈ `sub-agent` | `ci-run` (완료 조건 명시 2종). `id` 는 `<kind>:<식별자>` 규약으로 dedup/제거 매칭.

- **누가 언제 쓰고 지우나** (메인 오케스트레이터 행동 규약, CLAUDE.md 박제):
  - **기록**: background 대기 진입 시 (sub-agent 를 background 로 spawn / CI run watch 시작) → `waits[]` 에 항목 append **+ 동시에 fallback ScheduleWakeup 예약**. 두 동작을 **하나의 정신적 원자 단위**로 묶어 규약화("대기 진입 = wakeup 예약 + pending-waits 기록").
  - **제거**: 대기 해소 시 (sub-agent 반환 / CI run 완료 후 처리) → 해당 `id` 항목 제거.
- **신뢰성 완화** (B2): 파일 write 는 best-effort — 누락돼도 heartbeat wakeup 이 침묵을 깨므로 **크리티컬 패스 밖**. 훅은 **검출만** 하고 **자동 정리하지 않는다** (masking 방지, 가드 설계 원칙 fail-visible). 모델이 경고를 보고 실제 상태를 재확인해 해소 항목을 제거 → 다음 세션 시작 시 self-healing 재조정.

**C. fallback heartbeat 규약 제도화.**

- **위치**: CLAUDE.md `## 프로젝트 고유 보강 교훈` → 가드 A/B/C 계열 하위에 **`#### 가드 D — 세션 중단 dead-wait (대기 라이프사이클 + fallback heartbeat)`** 서브섹션 신설. (이 섹션은 harness managed-block **외부**라 Z-패턴 불필요 — CLAUDE.md 는 이미 full-file drift + `[TODO]` 데코레이터 상태이므로 편집 추가 비용 0. 2026-07-10 실측: manifest sha `1216…` ≠ actual sha `4270…`, 1행 `<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->` 존재.)
- **내용**: (1) 모든 background 대기에 fallback `ScheduleWakeup`(1200~1800s) 병행 의무 — notification 선착 시 no-op, 세션 재시작 시 유일 재호출 신호. (2) pending-waits 기록/제거 규약(B2). (3) SessionStart 훅이 미해소 잔존을 경고(exit 0)로 노출 — 모델은 대기 재개 대신 상태 재확인.
- **코드 강제 불가 완화**: 행동 규약(ScheduleWakeup 병행)은 코드로 강제 불가하나, SessionStart 훅(2차) + heartbeat wakeup(1차)이 **탈락을 잡는 결정적 안전망**. 규약 준수 실패가 조용한 dead-wait 로 직결되지 않도록 계층이 겹친다.

## Z-패턴 판정 (manifest 실측 근거)

| 파일                                             | manifest      | category        | 본 작업 수정                                  | Z-패턴                                                                                                                 |
| ------------------------------------------------ | ------------- | --------------- | --------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| `.claude/settings.json`                          | ✅            | atomic          | 3번째 hook 등록 1줄                           | **필요 — sidecar** `.claude/settings.json.HARNESS-DRIFT.md` (`<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->`) + upstream PR |
| `.claude/hooks/session-start-dead-wait-check.sh` | ❌ 신규       | non-managed     | 신규 로직 파일                                | 불필요 (manifest 미등재 = drift 대상 아님)                                                                             |
| `scripts/verify-dead-wait-check.mjs`             | ❌ 신규       | non-managed     | 신규 CI 가드                                  | 불필요                                                                                                                 |
| `CLAUDE.md`                                      | ✅            | managed-block   | 가드 D (managed-block **외부** 프로젝트 섹션) | 이미 drift + `[TODO]` 데코레이터 → **추가 비용 0**                                                                     |
| `.github/workflows/ci.yml`                       | ❌ 미등재     | non-managed     | dead-wait verify step 추가                    | 불필요 (verify-zombie-check.mjs 와 동일 위치·패턴)                                                                     |
| `.gitignore`                                     | ❌ 미등재     | non-managed     | `.context/` 추가(포터빌리티)                  | 불필요                                                                                                                 |
| `.context/pending-waits.json`                    | ❌ gitignored | runtime scratch | 런타임 생성                                   | 불필요                                                                                                                 |

**결론: 전체 Z-패턴 표면 = settings.json sidecar 1개(등록 1줄)** — A1 채택의 직접 산물. Phase 2 upstream 기여(harness-setting) 는 "SessionStart dead-wait check 훅 + 규약" clean 추가로 제출.

**`.context/` gitignore 실측 주의**: 현재 `.context/` 무시는 `.git/info/exclude`(Conductor 공유 `.git`)에만 존재하고 **커밋된 `.gitignore` 에는 없다** (2026-07-10 `git check-ignore -v` 실측). pending-waits.json 은 순수 workspace 로컬 런타임 상태라 다른 클론에 영향 0 이지만, **패턴 포터빌리티(Phase 2 upstream)** 를 위해 커밋된 `.gitignore` 에 `.context/` 추가 권장 (non-managed → 무료).

## 결과·재검토 조건

### 가드 도입 PR DoD 4축 매핑 (CLAUDE.md `### 가드 도입 PR DoD`)

| 축                                        | 본 가드 적용 | DoD                                                                                                                                                                                                                                                                                                                             |
| ----------------------------------------- | ------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (1) 격리 동적 테스트                      | ✅           | `verify-dead-wait-check.mjs` 를 임시 fixture 디렉토리에서 실행 — pending-waits 有/無 케이스 stdout 검증                                                                                                                                                                                                                         |
| (2) 3중 시뮬 (positive→negative→recovery) | ✅ **핵심**  | **positive**: 대기 정상 해소 후 파일 clean → 훅 경고 0. **negative**: 미해소 항목 잔존 상태로 훅 실행 → stdout "이전 세션 미해소 대기 N건 + 목록" 발화 (exit 0). **recovery**: 모델이 상태 재확인 후 항목 제거 → 재실행 시 경고 0. `--self-test` 인라인 3중 시뮬 (verify-harness-drift-decorator.mjs `--self-test` 선례 재사용) |
| (3) 5 페르소나 self-consistency           | ⚠ 부분       | pending-waits 기록/제거 규약이 메인(오케스트레이터) 행동. 페르소나 .md 5종 셀 결정적 일치는 본 가드에 직접 대상 아님 (규약이 메인 전용) — verify-zombie-check.mjs 도 동일 (SSoT needle 만). N/A 명시                                                                                                                            |
| (4) 메타 측정 자기적용 안정성             | ✅           | `verify-dead-wait-check.mjs` 자신을 반복 실행 시 결과 안정 (stateless 정적 체크) — flake 0                                                                                                                                                                                                                                      |

### 기대 효과 (측정 가능)

- 세션 재시작 후 미해소 대기 잔존 시 SessionStart 훅이 **100% stdout 노출** (negative 시뮬 재현).
- fallback ScheduleWakeup 병행 시 세션 재시작 후에도 재호출 신호 **1건 이상 지속 발화** (#790 실전 재현 — heartbeat no-op = 정상).

### 트레이드오프로 받아들인 비용

- settings.json sidecar 1개 유지(Phase 3 upstream 머지 시 `[TODO]`→URL 자동 해소).
- pending-waits 파일 write 가 행동 규약(코드 강제 불가) — heartbeat 1차 방어로 완화하되 파일 정합성은 eventual.

### 재검토 트리거

- fallback heartbeat 병행에도 dead-wait 재발 실측 ≥ 1회 → 대기 진입을 툴 레벨로 강제하는 방안(예: background spawn wrapper) 재검토.
- pending-waits write 누락이 잦아(≥ 2회/월) 훅 경고가 무의미해지면 → 기록을 sub-agent 마무리 JSON `spawned_bg_pids` 계열로 승격 검토.
- ScheduleWakeup 스케줄이 세션 재시작에서 **소멸**하는 환경 변화 관측 시 → 1차 방어 무효화 → 전면 재설계.
- **pending-waits 좀비 항목 ≥ N 누적 관측 시 → TTL/GC 아카이빙 도입** (cross-validate agy #4 강등 항목). Grace Period 필터 + self-healing 재조정으로 1차 대응하되, 실제 누적이 관측되면 오래된 항목 자동 무효화 로직 신설.

## 교차검증 반영 사항 (agy — 2026-07-10, 메인 재분석 통합)

> cross-validate 발동 사유: CLAUDE.md 운영 규약 신설(가드 D) + 프로젝트 전반 대기 라이프사이클 패턴 채택 → `## 교차검증` 박제 직후 1회 루틴 대상. `cross_validate.sh architecture`(L1 strict prefix + L3 스냅샷 가드, diff empty 정상). 로그: `.claude/logs/cross-validate-architecture-20260710-143650.log`.

- **합의**: (1) 축 A(A1 별도 훅) — settings.json 1줄 진입점 + non-managed 로직 파일 분리가 clobber 원천 차단 + SRP 격리로 "매우 타당". (2) 축 B(B2 heartbeat 우선) — 모델 파일-write 신뢰성 한계를 플랫폼 기능(ScheduleWakeup)으로 완화한 복원력 트레이드오프 "훌륭". (3) `kind` 열거형 스키마 확장성 우수. → 설계 유지.
- **이견 수용 (설계/구현 체크리스트 반영)**: agy 고유 발견 3건을 developer 구현 체크리스트에 추가 반영.
  - **[수용] Grace Period 필터** (agy #2): 세션 종료 직후(예: 1초) 재시작 시 방금 정상 진입한 대기를 좀비로 오탐 → hook 이 `created_at` 기준 **최소 유예(권장 60s) 경과 항목만 경고**. **가드 C ETIME 30분 임계값과 동형** 개념이라 정합 — 수용. (verify negative 시뮬은 유예 초과 항목으로 구성.)
  - **[수용] 방어적 JSON 처리** (agy #3/#5 경량화): 병렬 background spawn 시 동시 write 또는 특수문자 직렬화로 JSON 깨짐 가능 → (a) 쓰기는 **임시 파일 + 원자적 rename**, (b) hook 은 **parse 실패 시 크래시 금지**(손상 경고 후 exit 0). 단 무거운 file lock 은 B2 철학(파일=보조, 크리티컬 패스 밖)과 상충 + 메인은 도구를 순차 호출하므로 진성 레이스 드묾 → 경량 대응만.
  - **[수용] 복구 프로토콜 순서 명시** (agy #6): hook 경고 후 메인 행동을 가드 D 에 **인터페이스 수준으로 기술** — `(1) 대상 상태 조회(gh pr/issue 라벨 또는 sub-agent SendMessage) → (2) 생사·완료 판단 → (3) pending-waits 항목 제거 또는 작업 재개`. 이번 세션 #790 heartbeat wakeup 프롬프트("라벨 확인 → 판별 → 행동")가 이 프로토콜의 실전 선례.
- **Claude 재분석 기각/부분수용**:
  - **[순수주의 질문 — 파일 계층 과잉 여부: 기각]** agy 가 "pending-waits.json 3차 레이어를 제거하고 heartbeat + 훅(활성 프로세스 메타 조사)만으로 충분한지" 질의. **재분석 결과 파일 유지 정당**: 죽은 sub-agent/CI run 이 **무엇이었는지**는 프로세스가 이미 소멸해 메타데이터 조사로 복원 불가 → 파일 없이는 hook 이 "무엇이 미해소인지" 노출 불가(heartbeat 는 침묵만 깨고 맥락 없음). 파일은 hook 의 **데이터 소스로 필수**, 단 B2 대로 크리티컬 패스 밖(best-effort). → ADR 근거 강화, 파일 제거 안 함.
  - **[결합성 질문 — 3번째 hook 부작용: 기각(위험 낮음)]** SessionStart hooks 는 배열 순차 독립 command(각 새 셸, 환경 변수 비공유, 각 exit 0 독립 판정) → 3번째 추가는 앞 2개에 부작용 없음. **단 developer 가 실제 등록 후 3 hook 순차 실행 + 각 exit 0 을 검증 항목으로 확인**(잔여 리스크 해소).
  - **[부분수용] ScheduleWakeup no-op 취소** (agy #1): 대기 해소 후 fallback wakeup 이 20~30분 뒤 1회 no-op 발화하는 비용은 ADR 이 이미 "notification 선착 시 no-op = 정상"으로 수용. ScheduleWakeup 은 **단발성**(다음 wakeup 을 예약 안 하면 자연 종료)이라 명시적 취소 API 불필요 → 규약에 **"대기 해소 시 재예약하지 않음(자연 종료)"** 1줄 명시로 갈음.
- **고유 발견 (후속/재검토 트리거 강등)**: **[TTL/GC 아카이빙** (agy #4)] pending-waits 좀비 항목 무한 축적 방지. Grace Period 필터가 오탐을 사실상 차단하고, self-healing 재조정(모델이 경고 보고 해소 항목 제거)이 1차 대응이므로 별도 이슈는 과함 → **재검토 트리거에 "pending-waits 항목 ≥ N 누적 관측 시 TTL 도입"** 추가로 강등.

**Claude 편향 셀프 체크 (호출 前 architect 사전 기록 4종 — 사후 판정)**:

- **낙관적 일정**: 통과 — 일정 추정 없음(단일 PR 가드).
- **결합 간과**: ⚠→해소 — cross-validate 결합성 질문으로 재확인, 순차 독립 command 로 부작용 없음 확정 + developer 검증 항목화.
- **폐기 프레이밍**: 통과 — 가드 신설.
- **순수주의**: ⚠→해소 — cross-validate 순수주의 질문으로 파일 계층 필요성 재검증, hook 데이터 소스로 필수임을 확정(과잉 아님).

## 참고

- 이슈 [#817](https://github.com/coseo12/astro-simulator/issues/817)
- 선례: 가드 A/B/C ADR 맥락 (#440) — `docs/reports/20260510-419-dev-server-zombie-recurrence.md`, `.claude/hooks/session-start-zombie-check.sh`, `scripts/verify-zombie-check.mjs`
- Z-패턴: ADR [20260515-harness-managed-divergent-pattern.md](20260515-harness-managed-divergent-pattern.md) §Amendment 8(데코레이터 fail-fast) / §Amendment 11(sidecar 라이프사이클)
- 메모리: `ci-watch-polling-pattern` (2026-07-04 forensic + 2026-07-09 dead-wait 진단), `session_20260709_790_dead_wait`
