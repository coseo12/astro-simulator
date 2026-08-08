# ADR 20260701-779 — CI 알림 alert fatigue 완화 (이중 트리거 concurrency + flake 안정화)

- 상태: **Accepted** (cross-validate 2026-07-01 — agy, §교차검증 반영 사항 4축 박제 완료. group 식은 sha 유지 + Phase 1 branch-cross 가드 브랜치 무관성 실측 의무)
  - **§Amendment 1 (Phase 2/3 구체 설계): Accepted** (cross-validate 2026-07-04 — agy, §A1 교차검증 반영 사항 통합)
  - **§Amendment 2 (재검토 조건 1·2 회수 + 결정 1 적용 범위 축소): Accepted (파생)** — 결정 실체는 ADR [20260807-971-required-status-checks](20260807-971-required-status-checks.md) 이며 그 ADR 이 cross-validate 2회 + reviewer 1회를 통과했다. 본 Amendment 는 **신규 결정을 만들지 않고** 그 실측·범위 변경을 선행 ADR 쪽에 회수 박제하는 것이라 별도 cross-validate 를 발동하지 않는다. (단 ADR 971 자체는 저장소 설정 미적용 상태라 **Provisional** 이다 — 본 Amendment 가 기술하는 concurrency 코드 변경만 #971 Phase 0 로 적용됐다.)
- 날짜: 2026-07-01
- 이슈: [#779](https://github.com/coseo12/astro-simulator/issues/779)
- 관련: #766 (alert fatigue 개념 — Z 패턴 health), #728 (step retry vs job rerun), #709 (fps retry 도입), #626 (paths-ignore docs skip), ADR [20260421-workflows-responsibility-split](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260421-workflows-responsibility-split.md) (frozen vs user-owned 경계)
- 용어: [glossary.md](../glossary.md) — alert fatigue / flake / dual-trigger / concurrency / ff-sync

> **범위 주의**: 본 ADR 은 **설계 결정 박제** 다. 코드/워크플로 `.yml` 변경은 사용자 검토 후 별도 developer 가 수행한다 (architect 는 설계 결정만).

---

## 배경

CI/배포 실패 알림(GitHub Actions 메일)이 **alert fatigue** 수준으로 많고, **메일이 와도 실제로는 정상(flake)인 경우가 빈번**해 진짜 실패 판단이 무력화됐다. #766 의 alert fatigue 개념이 CI 알림 차원에서 재현된 것이다.

### 실측 근거 (measurement-first, 2026-06-30 run history)

같은 sha 에 대한 **이중 트리거** 와 **branch-cross 중복** 을 run history 로 실측 확정:

**(1) 한 develop merge sha `d0f26b21` 의 전체 워크플로 run (실측)**

| event        | 워크플로                                                                                                       | 결과 |
| ------------ | -------------------------------------------------------------------------------------------------------------- | ---- |
| pull_request | CI / CI(physics-wasm) / Harness Guards / Harness PR review / PR Template / a11y / bench / fps / prettierignore | 9개  |
| push         | CI / CI(physics-wasm) / Harness Guards / a11y / fps / prettierignore                                           | 6개  |

→ **같은 코드 1 커밋에 15 run**. 이 중 **6개 워크플로 (CI / CI-physics / Harness Guards / a11y / fps / prettierignore)** 가 PR+push 양쪽에서 **2번** 실행. 메일·flake 노출 ×2.

**(2) release merge sha `af2cb8a3` (v0.40.0) — branch-cross 중복 (실측)**

merge commit 직후 `git push origin main:develop` (ff-sync) 로 **같은 sha 가 develop + main 양쪽에 push** → push-triggered 6개 워크플로가 **develop 에서 6 run + main 에서 6 run = 12 push run**. 동일 코드인데 `b989c21b` 는 **develop=failure / main=success** (같은 sha, 같은 코드, 결과 불일치 = flake 의 정의).

**(3) 이슈 본문 사례 `d0f26b21` fps-baseline**: push run=success / PR run=fail→rerun success. 동일 sha 인데 PR run 만 runner 부하 spike 로 fail → **fail 메일** (진짜 회귀 아님).

### 근본 원인 3가지

1. **이중 트리거** — 6개 워크플로가 `pull_request:[develop,main]` + `push:[develop,main]` 둘 다 가짐 → 같은 sha 2 run + (release ff-sync 시) branch-cross 로 추가 중복. 메일 N배 + flake 노출 N배.
2. **detect-and-test 18분 single job + retry 0** — `ci.yml` 의 `detect-and-test` 가 헤드리스 브라우저 타이밍 가드 9종(verify:378/408/627/629/631/675/693/699/704) + r1-guard 를 **직렬 단일 job** 으로 실행. retry 없음. verify:699(deltaTime 비례)·r1-guard(Playwright) 등 타이밍 가드가 flake 시 18분 전체 fail.
3. **fps-baseline 부하 spike** — 이미 step 내 2회 재시도(#709)가 있으나 **같은 머신 attempt 1·2** 라 부하 지속 시 둘 다 fail. 새 머신 rerun 은 수동(#728: step retry 는 transient 만, job rerun 이 새 머신).

### 핵심 환경 사실 — required check 부재 (실측)

```
gh api repos/coseo12/astro-simulator/branches/develop/protection → 404 Branch not protected
gh api repos/coseo12/astro-simulator/branches/main/protection     → 404 Branch not protected
```

develop·main 둘 다 **branch protection 미설정 = required status check 없음**. 따라서 이슈가 우려한 _"cancel 이 required check 를 cancelled 로 만들어 PR 머지를 막는가"_ 문제는 **현재 구조에선 발생하지 않는다** (머지 게이트가 check 결과에 묶여 있지 않음). 단, **사용자 검토 기준 + team-status 대시보드 + 메일 신뢰도** 차원에서 cancelled run 은 여전히 노이즈이므로 cancel 동작 설계는 신중해야 한다. (장래 branch protection 도입 시 §재검토 조건 참조)

### 워크플로별 트리거/retry/flake 매핑표 (실측 전수)

| 워크플로                          |      pull_request       |        push        | 소유       | retry               | flake 이력                                | 비고                                       |
| --------------------------------- | :---------------------: | :----------------: | ---------- | ------------------- | ----------------------------------------- | ------------------------------------------ |
| `ci.yml` (detect-and-test)        |    ✅ [develop,main]    | ✅ [develop,main]  | user       | **0**               | verify:699 deltaTime, r1-guard Playwright | 18분 single job, 가드 9종 직렬             |
| `ci-physics-wasm.yml`             |           ✅            |         ✅         | user       | 0 (Rust 결정적)     | 낮음                                      | verify:test-coverage/iau-data + cargo test |
| `fps-baseline-guard.yml`          |   ✅ (+paths-ignore)    | ✅ (+paths-ignore) | user       | **step 2회** (#709) | 부하 spike (같은 머신 무력)               | 25분 timeout                               |
| `a11y-baseline-guard.yml`         |   ✅ (+paths-ignore)    | ✅ (+paths-ignore) | user       | 0                   | 낮음 (axe 결정적)                         | 20분 timeout                               |
| `prettierignore-drift.yml`        |           ✅            |         ✅         | user       | 0 (정적)            | 없음                                      | 경량 (수초)                                |
| `harness-guards.yml`              |           ✅            |         ✅         | **FROZEN** | 0 (정적)            | 없음                                      | 경량, upstream 소유 (Z-pattern 대상)       |
| `harness-pr-review.yml`           |    ✅ (opened/sync)     |         ❌         | **FROZEN** | —                   | —                                         | PR 전용, 이중 아님                         |
| `pr-template-checklist-guard.yml` | ✅ (opened/edited/sync) |         ❌         | user       | —                   | —                                         | PR 전용, 이중 아님                         |
| `bench.yml`                       |       ✅ (+paths)       |         ❌         | user       | 0                   | 낮음                                      | PR 전용, 이중 아님                         |
| `agent-dispatch.yml`              |    issues/PR labeled    |         —          | user       | —                   | —                                         | 이벤트 기반, 무관                          |
| `adr-z-pattern-health-v2.yml`     |    schedule/dispatch    |         —          | user       | —                   | —                                         | 주간 cron, 무관                            |
| `r1-baseline-bootstrap.yml`       |        dispatch         |         —          | user       | —                   | —                                         | 수동, 무관                                 |
| `bench-baseline-remeasure.yml`    |        dispatch         |         —          | user       | —                   | —                                         | 수동, 무관                                 |

**이중 트리거 = 6개** (ci / ci-physics / fps / a11y / prettierignore / **harness-guards[FROZEN]**). 이 중 user-owned 5개는 직접 수정 가능, harness-guards 1개는 Z-pattern 또는 upstream 기여 필요.

---

## 후보 비교 (축별)

본 ADR 은 **노이즈 0 + 진짜 회귀 100% 포착** 이 목표다 (메일 0 이 아님). 가드 약화 절대 금지 ([guard-design-principles.md](../lessons/guard-design-principles.md) §3 fail-fast).

### 축 1 — 이중 트리거 중복 (가장 효과적, 저비용)

| 옵션                                                | 설명                                          | 진짜 회귀 포착                                                       | 비용           | 평가                                                    |
| --------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------------- | -------------- | ------------------------------------------------------- |
| **(A) concurrency (sha group, cancel-in-progress)** | 같은 sha 의 push+PR run 중 후행이 선행을 취소 | 살아남는 1 run 이 동일 코드 검증 → 포착 100%                         | 워크플로당 3줄 | **채택**                                                |
| (B) push 트리거 제거 (PR 트리거만)                  | 6개 워크플로에서 `push:` 삭제                 | develop/main **직접 push** (release ff-sync, merge) 시 검증 0 — 위험 | 6줄 삭제       | **기각** — ff-sync push·hotfix 직접 머지 경로 검증 누락 |
| (C) push 트리거만 (PR 제거)                         | PR 단계 검증 사라짐                           | PR 단계 fail-fast 손실 (머지 전 차단 불가)                           | —              | **기각** — PR 게이트가 1차 방어                         |
| (D) paths-ignore 확대                               | docs PR 등 skip 확대                          | 범위 밖 (이미 #626 적용, 중복 자체는 미해결)                         | —              | 보조만 (직교)                                           |

**(A) 채택 근거**: 중복의 본질은 "같은 sha 가 두 event 로 2번 검증" 이다. concurrency 가 그 sha 단위로 묶어 후행이 선행을 취소하면, **남은 1 run 이 동일 코드를 검증**하므로 회귀 포착력 손실 0. cancel 된 run 은 "검증을 안 한" 것이 아니라 "더 최신/동일한 run 이 대신함". 이것이 §축1 의 핵심: **concurrency cancel 은 가드 약화가 아니다** (중복 제거이지 검증 제거가 아님).

### 축 1 의 핵심 설계 난점 — concurrency group 식 (정밀 분석 필수)

이슈가 지적한 난점: PR run 과 push run 의 ref·sha 표현이 다르다.

| 컨텍스트     | `github.sha`                                                       | `github.event.pull_request.head.sha` | `github.ref`         |
| ------------ | ------------------------------------------------------------------ | ------------------------------------ | -------------------- |
| **PR run**   | **merge commit** (PR head 를 base 에 가상 병합한 임시 sha)         | **PR head sha** (실제 커밋)          | `refs/pull/N/merge`  |
| **push run** | **pushed commit sha** (= 머지 후 develop/main tip = 그 PR 의 head) | (null)                               | `refs/heads/develop` |

따라서 **이슈 초안의 `${{ github.event.pull_request.head.sha || github.sha }}` 가 정확히 옳다**:

- PR run → `pull_request.head.sha` = PR head 커밋 sha
- push run → (pull_request null) → `github.sha` = pushed 커밋 sha

PR 이 머지되면 push 되는 커밋 sha = 그 PR 의 head sha 이므로 **두 식이 같은 값으로 수렴** → 같은 group → 중복 취소 성립. (PR 이 아직 open 상태에서 동시에 push 가 일어나는 경우는 드물고, 그 경우에도 head sha 가 같으면 정상적으로 묶임.)

단, **group 에 `github.workflow` 를 반드시 포함**해야 한다. 그렇지 않으면 ci 와 fps 가 같은 group 에 묶여 서로를 취소한다. 또한 **PR 트리거를 살리는 게 1순위 인지 push 인지**는 cancel-in-progress 특성상 _"나중에 시작된 run 이 먼저 시작된 run 을 취소"_ 한다 — 즉 **둘 중 어느 쪽이 살아남는지를 명시 지정할 수 없다** (시작 시각 순). 이것이 문제가 되지 않는 이유: **둘 다 같은 sha = 같은 코드** 이므로 어느 쪽이 살아남아도 검증 동일. required check 부재(위 §환경 사실)라 살아남은 run 의 event 종류가 머지 게이트에 영향 없음.

**구체 YAML 스케치** (각 이중 트리거 워크플로 `name:` 직후, `on:` 위에 삽입):

```yaml
# 같은 sha 의 push+PR 중복 run 제거 (#779). group 에 github.workflow 포함 →
# 워크플로 간 교차 취소 방지. PR head sha == 머지 후 push sha 로 수렴 → 같은 sha 묶임.
# cancel 은 가드 약화 아님 — 동일 코드를 검증하는 중복 run 중 하나만 남김 (포착 100%).
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.head.sha || github.sha }}
  cancel-in-progress: true
```

**cancel 동작 검증** (DoD 로 실증 의무):

- 같은 sha PR+push → 2 run 중 1개 cancelled, 1개 완주
- cancelled run 은 conclusion=`cancelled` (≠ success, ≠ failure) → **메일 미발송** (GitHub 은 cancelled 에 메일 안 보냄, failure 에만 보냄)
- **다른 sha** (새 커밋 push) → group 식 값이 달라 **취소 안 됨** (이전 sha run 은 계속, 신규 sha run 별도) → 진짜 회귀가 다른 커밋에 있으면 그대로 검출

### 축 2 — detect-and-test flake 안정화

| 옵션                                                        | 설명                                                                                                  | 진짜 회귀 포착                                             | 비용                         | 평가                                                                                              |
| ----------------------------------------------------------- | ----------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ---------------------------- | ------------------------------------------------------------------------------------------------- |
| **(A) 타이밍 가드 step 내 2회 재시도** (fps #709 패턴 답습) | verify:699 등 flake-prone 가드를 `for attempt in 1 2` 루프로 감쌈. **2회 연속 fail 이어야 step fail** | **진짜 회귀는 매 시도 fail → 은폐 불가** (§fail-fast 정합) | 가드당 ~10줄                 | **채택 (1순위)** — #709 선례로 검증된 패턴                                                        |
| (B) flake-prone 가드를 별도 non-blocking job 분리           | verify:699 등을 `continue-on-error` job 으로                                                          | continue-on-error = **진짜 회귀 silent skip** → 가드 약화  | job 분할                     | **기각** — §3 fail-fast 위반 (non-blocking = validation 흉내)                                     |
| (C) 가드 자체 허용폭 완화 (verify:699 deltaTime ratio 폭 ↑) | 임계값을 느슨하게                                                                                     | 임계 완화 = 회귀 민감도 손실                               | 1줄                          | **기각** — measurement-first 없이 임계 완화는 silent 약화. 단 #779 범위 밖 측정 후 별건 검토 가능 |
| (D) 18분 single job 을 병렬 matrix job 분할                 | 가드 9종을 N job 병렬                                                                                 | 포착 동일, 피드백 단축                                     | matrix 설계 (포트 충돌 회피) | **후속 분리** — 효과 크나 위험·비용 높음. Phase 3                                                 |

**(A) 채택 근거 — 재시도가 가드 약화가 아닌 이유** (핵심): fps #709 가 이미 입증한 패턴. `for attempt in 1 2` 루프에서 **2회 모두 fail 해야 step 이 fail** 한다. 진짜 회귀는 코드가 결정적으로 깨진 것이므로 **매 시도 fail → 절대 은폐 불가**. flake 는 1회 spike 후 정상화되므로 2회차 pass → 메일 미발송. 이것이 [guard-design-principles.md](../lessons/guard-design-principles.md) §3 의 "진짜 회귀는 매 시도 fail 하므로 은폐 불가" 정합. (B) `continue-on-error` 와의 결정적 차이: (A) 는 **여전히 fail-fast** (2연속 fail → block), (B) 는 **silent skip** (fail 무시).

**적용 대상 선별 (measurement-first 의무)**: 전 가드에 retry 를 다는 것은 과잉. developer 단계에서 **각 가드의 flake 이력을 run history 로 실측** → flake-prone 가드(verify:699 deltaTime, r1-guard)에만 선별 적용. 결정적 가드(verify:378 등 좌표 단언, verify:no-scientific-grep 정적)는 retry 불필요 (오히려 retry 가 진짜 fail 을 2배 시간 지연시킴).

### 축 3 — fps-baseline 부하 spike (새 머신)

| 옵션                                                     | 설명                                                 | 진짜 회귀 포착                             | 비용                   | 평가                                                                                     |
| -------------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------ | ---------------------- | ---------------------------------------------------------------------------------------- |
| (A) 현행 유지 (step 2회, 같은 머신)                      | #709 현재 상태                                       | 포착 OK but 부하 지속 spike 흡수 불가      | 0                      | baseline                                                                                 |
| **(B) workflow_run on failure → 새 머신 자동 1회 rerun** | fps fail 시 별도 워크플로가 `gh run rerun` (새 머신) | rerun 도 fail 이어야 최종 fail → 포착 유지 | 신규 워크플로 + gh API | **조건부 채택 (후속, Phase 3)** — 새 머신이 부하 spike 의 유일 해결                      |
| (C) margin 재검토 (30% → ?)                              | 임계 완화                                            | 회귀 민감도 손실                           | 1줄                    | **기각** — silent 약화. 단 variance 진단(#709 `--diagnose-variance`) 재실측 후 별건 검토 |
| (D) self-hosted runner                                   | 부하 격리                                            | 포착 동일                                  | 운영 비용 큼           | **기각** — 1인 운영 과잉                                                                 |

**(B) 의 신중성**: 자동 rerun 은 "진짜 회귀가 2회 다 fail" 일 때만 메일이 와야 한다. workflow_run on failure 트리거 + `gh run rerun --failed` 로 **새 머신**에서 1회 재실행하되, **rerun 결과가 fail 이면 그제서야 최종 fail 메일**. 단 workflow_run 트리거는 **default branch 반영 후에만 발화** ([workflow-dispatch-pitfalls.md](../lessons/workflow-dispatch-pitfalls.md)) → 도입 PR DoD 에 명시. 비용·복잡도가 있어 **Phase 3** 로 분리.

### 축 4 — 알림 정책 (메일 발송 조건)

| 옵션                                           | 설명                                                            | 평가                                                                |
| ---------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------- |
| (A) GitHub notification 설정 (개인)            | "Actions: Only notify for failed workflows I'm involved in" 등  | 보조 — 코드 변경 아님, 사용자 계정 설정. 권장하되 ADR 범위 밖       |
| (B) 워크플로 구조로 우회 (concurrency + retry) | cancelled·flake-2회차-pass 는 애초에 fail 이 안 됨 → 메일 안 옴 | **본 ADR 의 (축1+축2+축3) 합** = 구조적으로 "최종 실패만 메일" 달성 |

**핵심**: GitHub 메일은 **job conclusion=`failure`** 시 발송 (cancelled·success 는 미발송). 따라서 (축1) cancelled 로 중복 제거 + (축2/3) retry 로 flake 흡수 = **"rerun 후에도 fail = 진짜 실패만 메일"** 이 워크플로 구조만으로 달성된다. 별도 알림 정책 코드 불필요.

---

## 결정

**우선순위 순 3개 축 (Phase 분리)**:

### 결정 1 — concurrency 중복 제거 (1순위, Phase 1)

이중 트리거 6개 워크플로에 concurrency 블록 추가 (group=`${{ github.workflow }}-${{ github.event.pull_request.head.sha || github.sha }}`, cancel-in-progress=true).

- user-owned 5개(ci / ci-physics / fps / a11y / prettierignore): **직접 수정** (Y-path)
- frozen 1개(harness-guards): **Z-pattern** — Phase 1 본 프로젝트 선반영 + `HARNESS-DRIFT: Z-PATTERN [TODO]` 데코레이터(이미 line 1 존재) 유지 + Phase 2 upstream 기여. (concurrency 는 upstream 에도 유익하므로 X-path 기여 적합)

### 결정 2 — detect-and-test flake-prone 가드 step 내 2회 재시도 (2순위, Phase 2)

developer 가 run history 로 flake 이력 실측 → flake-prone 가드(verify:699, r1-guard 등)에만 `for attempt in 1 2` 재시도 적용. **2연속 fail = step fail** (fail-fast 유지). 결정적 가드는 미적용.

### 결정 3 — fps 새 머신 자동 rerun + detect-and-test 병렬 분할 (3순위, Phase 3, 후속 검토)

축3(B) workflow_run rerun + 축2(D) matrix 병렬 분할. 비용·위험 높아 Phase 1/2 안정화 실측 후 별건 이슈로 분리 가능.

### CRITICAL — 가드 약화 금지 정합

- concurrency cancel = **중복 제거** (동일 sha 다른 run 취소, 검증 자체는 1회 보존). 가드 약화 아님.
- retry = **fail-fast 유지** (2연속 fail block). silent skip(continue-on-error) 절대 금지.
- 임계 완화(margin/ratio) = silent 약화 → 본 ADR 에서 **기각**. 필요 시 measurement-first 별건.
- **목표는 메일 0 이 아니라 노이즈 0 + 진짜 회귀 100% 포착.**

---

## 결과·재검토 조건

### Phase 분리 가능 판정 (CLAUDE.md §Phase 분리 릴리스 리듬 3조건 충족)

- **backward-compat**: Phase 1(concurrency)만 배포돼도 시스템 정상 — 중복만 사라짐
- **완결 Behavior Change 집합**: 각 Phase 가 독립 관찰 단위 (Phase 1=중복 run 0, Phase 2=flake 메일 감소, Phase 3=부하 spike 흡수)
- **점진 릴리스 동의**: 사용자 결정

→ **3 Phase 독립 릴리스 가능**. 단 Phase 2/3 은 Phase 1 안정화 실측 후 착수 권장 (의존 아님, 리듬).

### DoD (측정 가능 — developer 인수인계 시 스프린트 계약화)

**Phase 1 (concurrency)**:

- [ ] 같은 sha 에 push+PR 동시 발생 시 **중복 run 0** (1개 cancelled, 1개 완주) — run history 실측
- [ ] cancelled run 은 conclusion=`cancelled` (≠failure) → 메일 미발송 실증
- [ ] **다른 sha** push 시 이전 run 취소 안 됨 (group 값 분리 확인) — 진짜 회귀 미은폐 실증
- [ ] 워크플로 간 교차 취소 0 (ci 가 fps 를 취소하지 않음 — group 에 github.workflow 포함 검증)
- [ ] **default branch 반영 후 실측** (workflow_dispatch 2단계 함정 — concurrency 는 dispatch 아니나 동작 확인은 develop 머지 후 후속 PR 에서)
- [ ] harness-guards Z-pattern: `[TODO]` 데코레이터 유지 + upstream PR cross-link 박제

**Phase 2 (retry)**:

- [ ] flake-prone 가드 실측 선별 근거 박제 (run history N건)
- [ ] 1회차 fail → 2회차 pass 시 step pass (flake 흡수) 실증
- [ ] **2회 연속 fail 시 step fail** (진짜 회귀 미은폐) — 고의 fail 주입 실증
- [ ] 결정적 가드에 retry 미적용 확인 (불필요 지연 회피)

**Phase 3 (후속, 분리 가능)**:

- [ ] fps fail → 새 머신 rerun → rerun 도 fail 이어야 최종 fail 메일 (포착 유지)
- [ ] (선택) detect-and-test matrix 병렬 — 피드백 시간 < 기존 18분 + 포트 충돌 0

### 재검토 조건

1. **branch protection 도입 시**: required status check 가 생기면 concurrency cancel 이 required check 를 cancelled 로 만들어 PR 머지를 막을 수 있다. 그 시점에 **required check 를 PR 트리거에만 연결** + cancelled→재실행 또는 cancel-in-progress 를 PR 에 한정하는 재설계 필요. (현재는 protection 부재로 무관)
   → **발동 (2026-08-07, [#971](https://github.com/coseo12/astro-simulator/issues/971))**: 예고대로 발동했고 여기 적힌 두 제안은 실측 후 **둘 다 기각**됐다 (`cancel-in-progress` 를 PR 한정 = 무효, cancelled 자동 재실행 = 증상 되돌리기). 채택된 것은 세 번째 경로인 **group 키에 `github.ref` 추가**다. §Amendment 2 참조.
2. **concurrency 가 release ff-sync 의 develop/main branch-cross 중복을 못 잡는 경우**: group 식이 sha 기준이라 같은 sha 가 develop+main 양쪽 push 시 group 값은 같으나 **ref 가 달라** 별도 group 으로 동작할 수 있음 — Phase 1 실측에서 branch-cross 중복 잔존 시 group 에 ref 미포함 확인 또는 별건 분리.
   → **해소 (2026-08-07, [#971](https://github.com/coseo12/astro-simulator/issues/971))**: 여기 남긴 진단 지시 ("group 에 ref 미포함 확인") 를 그대로 수행한 결과 **가설은 반증됐다** — ref 는 별도 group 을 만들지 않으며, branch-cross 중복은 "못 잡은" 게 아니라 **잡되 유해한 방향으로** 잡고 있었다. §Amendment 2 참조.
3. **Phase 1 후에도 flake 메일 잔존**: Phase 2 착수 트리거.
4. **retry 가 진짜 회귀를 2회 다 통과시키는 경우 발견**: 즉시 §fail-fast 위반 — retry 제거 + 가드 결정성 복원.

### 교차검증 반영 사항 (cross-validate 2026-07-01 — agy Antigravity, architecture 모드)

> cross-validate 발동 사유: CI 가드 구조 변경 + 프로젝트 전반 CI 패턴(concurrency) 채택. outcome: applied (exit 0), 워킹트리 snapshot diff empty.

#### 합의 (높은 신뢰도)

- concurrency 중복 제거 방향 + step retry fail-fast(2연속 fail이어야 fail) + 알림 정책(conclusion=failure만 발송 → 구조적으로 "최종 실패만 메일") + 가드 약화 금지 원칙 — agy 전부 타당 평가.

#### 이견 (양쪽 근거 — Claude 재판단)

- **agy: detect-and-test matrix 분할을 Phase 1.5로 상향**(18분 직렬 피드백 병목). **Claude 판단: Phase 3 유지**. 근거 — matrix 분할은 포트 충돌 회피/가드 간 의존 설계가 필요해 리스크·비용이 concurrency(3줄)와 격차가 큼. 단 18분 병목은 인정 → §재검토 조건에 "Phase 2 후 피드백 시간 측정해 matrix 우선순위 재평가" 추가.

#### 기각 (agy 지적 재검토 후 반려)

- **agy: group 식 SHA 수렴 결함(merge commit은 새 sha라 수렴 안 함)** → **이중 트리거 시나리오엔 부적용**. 본 ADR의 이중 트리거는 `prep squash 머지 → develop tip` 이 곧 `release PR head` 라 **같은 sha**(실측 d0f26b21 = PR run + push run). agy 는 release PR이 main에 **merge commit 머지될 때**(=branch-cross, 이중 트리거 아님)를 혼동. 이중 트리거 group 식(`head.sha || github.sha`)은 정상 작동.
- **agy: group 에 `github.ref` 추가(branch-cross 분리)** → **기각**. ref 추가 시 PR run(`refs/pull/N`) vs develop push(`refs/heads/develop`)가 **다른 group → 이중 트리거 중복 제거 자체가 실패**(주 목적 붕괴). branch-cross(ff-sync로 main/develop 같은 sha)는 **같은 merge commit = 같은 코드 = 검증 동일**이라 한 run 으로 충분(이 프로젝트 가드는 코드/렌더 검증이라 브랜치 컨텍스트 무관). **단 전제 명시**: §결정 1 에 "가드가 브랜치 의존이 아님" 전제 박제 + Phase 1 DoD 에 branch-cross cancel 시 가드 브랜치 무관성 실측 확인 의무 추가(§재검토 조건 2 강화).

#### 고유 발견 (수용 — Phase 별 DoD 보강)

- **workflow_run rerun 권한/보안(Phase 3)**: `GITHUB_TOKEN: actions: write` + Run ID 추출은 `github.event.workflow_run.id` 로 **엄격 한정**(임의 주입 차단). Phase 3 DoD 박제.
- **Playwright retries 옵션 대안(Phase 2)**: r1-guard 등 자체 retry 보유 도구는 도구 내부 `retries` 사용을 shell `for attempt` 대비 우선 검토(로그 가독성). Phase 2 구현 시 도구별 대안 비교 의무.
- **CD 연계**: 이 프로젝트 production 배포는 Vercel(브랜치 push 자동 배포)로 **GitHub Actions 외부** → concurrency cancel 이 CD 누락 유발 안 함(명시). hotfix 직접 머지 경로는 §결정 1(B 기각)에서 push 트리거 보존으로 커버.

#### Claude 편향 셀프 체크 (4종)

- **낙관 편향**(concurrency "자명하게 옳다"?): agy 가 group 식 복잡성 부각 → 메인 재분석으로 "이중 트리거 작동 ✓ + branch-cross는 가드 브랜치 무관 전제" 정밀화. Phase 1 실측 의무로 자명 가정 제거. **통과**
- **branch protection 없음 의존**: §환경 사실 + §재검토 1 에 장래 도입 위험 박제. **통과**
- **가드 약화 자기점검**: cancel=중복 제거(같은 sha), retry=2연속 fail이어야 fail → 진짜 회귀 은폐 0. **통과**
- **확증 편향**(저비용 1순위 결론 정당화?): run history 15 run 실측 + branch protection 404 실측 기반. agy 이견(matrix)도 §재검토로 반영. **통과**

#### 결론: 조건부 통과 → group 식(sha) 유지 + Phase 1 branch-cross 가드 브랜치 무관성 실측 의무 추가 후 Accepted

---

## Amendment 1 (2026-07-04) — Phase 2/3 구체 설계 확정 (상태: Accepted — cross-validate 2026-07-04)

> Phase 1 (concurrency, v0.41.0) 안정화 실측 완료 후 Phase 2/3 착수 설계. 결정 2 는 **선별 결과 정정**, 결정 3 은 **메커니즘 개정** (workflow_run rerun → 동일 워크플로 2-job escalation). 개정이므로 cross-validate 발동 대상 — 통합 전까지 Provisional.

### A1 배경 — Phase 1 이후 flake 반복 비용 실측 (measurement-first)

| 릴리스          | flake 지점                                  | 처리       |
| --------------- | ------------------------------------------- | ---------- |
| v0.39.0         | verify:699 deltaTime (detect-and-test)      | 수동 rerun |
| v0.40.0         | fps 부하 spike                              | 수동 rerun |
| v0.43.0 prep    | verify:699 deltaTime (**16m 실행 후** fail) | 수동 rerun |
| v0.43.0 release | fps 부하 spike (5m fail)                    | 수동 rerun |
| v0.44.0         | flake 0 (한 번에 그린)                      | —          |

거의 매 릴리스 1~2회 수동 개입 고정 비용. #709 진단 확립 사실: 정상 run cv 0~3.8%, fail = **전역 부하 spike** (scenario-내 noise 아님) → same-runner step retry 는 지속 부하에 무력 (설계 시점 예견이 v0.40.0/v0.43.0 에서 재확인).

### A1 결정 2 정정 — Phase 2 retry 대상은 verify:699 단독

원 결정 2 의 후보 "verify:699, r1-guard 등" 을 run history 실측으로 확정:

- **verify:699 — 적용** (flake 2회: v0.39.0 / v0.43.0 prep). S3b 가 100ms vs 200ms hold 이동 비율 ≈2.0 을 단언하는 부하 민감 타이밍 측정.
- **r1-guard — 미적용**. flake 원천은 #606 Playwright install extract deadlock 이었고 Node 22 핀(#663/#666) + 바이너리 캐시(#684) 로 해소. v0.39.0~v0.44.0 창에서 verify 단계 flake 0 → 결정적 가드로 분류.
- 나머지 8종 (verify:378/408/627/629/631/675/693/704) — flake 이력 0, retry 미적용 (원 결정 2 "결정적 가드 retry 금지 — 진짜 fail 2배 지연" 유지).

**방식**: `ci.yml` verify:699 step 내부에서 dev server 는 유지한 채 guard 스크립트 호출만 `for attempt in 1 2` + 실패 시 `sleep 15` (#709 동일 패턴). 2연속 fail = step fail (fail-fast). flake 원인이 runner 전역 부하이므로 server 재기동 불요 — 단 §A1 재검토 1 참조.

**agy 고유 발견 (Playwright retries 옵션 대안) 비교 의무 이행**: `browser-verify-699-freefly-unified.mjs` / `verify-fps-baseline.mjs` 모두 `import { chromium } from 'playwright'` 인 plain node 스크립트 (`@playwright/test` runner 아님) → 도구 내부 `retries` 옵션 부재 → shell for-loop 가 유일 경로 (실측 확인).
*(각주 — #933/PR #939: 두 스크립트는 이후 `withBrowser()` 헬퍼 경유로 전환되어 `import { chromium }` 직접 호출 형태는 아니다. 다만 `@playwright/test` runner 가 아니라는 사실은 불변이므로 위 결론(retries 부재 → shell for-loop)은 그대로 유효하다.)*

**기각 재확인**: (b) 분리 job — non-blocking 은 원 ADR 기각 유지 + blocking 분리 job 도 wasm/Playwright/build setup ~10분 중복으로 가드 1종 대비 비용 과잉. (c) S3b 측정 강건화 — verify:699 전용 variance 진단 데이터 부재 상태의 선행 착수는 오진 위험 (CLAUDE.md 스프린트 계약 §10 "측정 방법 검증 우선" — 진단이 먼저). §A1 재검토 1 로 이연.

### A1 결정 3 개정 — fps 새 머신 rerun 은 (B) workflow_run 이 아니라 (B') 동일 워크플로 2-job escalation

| 축              | (B) workflow_run + `gh run rerun --failed`                                                                     | **(B') 2-job fresh-runner escalation (채택)**                                                                               | (C) margin 재검토                                                                        |
| --------------- | -------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------- |
| 메일 (핵심)     | attempt 1 이 conclusion=`failure` 로 **확정된 후** 트리거 → **fail 메일 1통 구조적 잔존** (노이즈 0 목표 미달) | flake 시 workflow conclusion=`success` → **메일 0**. 진짜 회귀만 최종 failure 메일                                          | —                                                                                        |
| 검증 가능 시점  | workflow_run 은 default branch 반영 후에만 발화 — PR 단계 실검증 **불가** (2단계 함정 전면)                    | pull_request run 이 **PR 의 워크플로 파일을 사용** → PR 단계 실검증 가능. dispatch `--ref` 경로도 기존 등록(#663) 활용 가능 | —                                                                                        |
| 무한 rerun 방지 | `run_attempt` 상한 체크 코드 필요                                                                              | **구조적 불가** (job 2개 고정 — 상한이 토폴로지에 내장)                                                                     | —                                                                                        |
| 권한/보안       | `GITHUB_TOKEN: actions: write` + Run ID 엄격 한정 (원 §고유 발견 DoD)                                          | 추가 권한 **불필요** — 원 §고유 발견의 보안 DoD 는 대상 소멸 (supersede, cross-validate 라운드에서 재확인 예정)             | —                                                                                        |
| 새 머신 여부    | rerun = 새 runner ✓                                                                                            | job B = 새 runner ✓ (GitHub hosted job 은 job 단위 fresh VM)                                                                | ✗ (머신 무관)                                                                            |
| 평가            | **기각** — 메일 잔존이 결정타                                                                                  | **채택**                                                                                                                    | **기각** — cv 0~3.8% 정상 대비 spike 는 35~47% 하락. margin 은 원인과 무관 (silent 약화) |

**구조 스케치** (`fps-baseline-guard.yml`):

```yaml
jobs:
  measure: # 기존 job — guard step 만 soft-fail 화
    timeout-minutes: 25
    outputs:
      guard_outcome: ${{ steps.guard.outcome }}
    steps:
      # ... 기존 setup 동일 (checkout/pnpm/node/rust/wasm-pack/playwright cache/build/dev server) ...
      - id: guard
        continue-on-error: true # step-level — outcome=failure 보존, job 은 success
        run: | # 기존 #709 for attempt in 1 2 루프 그대로
      - if: steps.guard.outcome == 'failure'
        run: echo "::warning::fps 측정 실패 — fresh-runner escalation job 으로 이관"
      # 회귀 보고서 업로드 step 의 if 를 failure() → steps.guard.outcome == 'failure' 로 교체
      #   (continue-on-error 로 job failure() 가 false 가 되므로 — 필수 배선)
  retry-fresh-runner:
    needs: measure
    if: needs.measure.outputs.guard_outcome == 'failure'
    timeout-minutes: 25
    steps:
      # measure 와 동일 setup 복제 (⚠ 주석 마커로 동기 유지 — YAML anchor 미지원)
      # 측정 step 은 hard-fail (continue-on-error 없음) → 여기서 fail = workflow failure = 메일
```

**동작 매트릭스** (fail-fast 정합 증명):

| 시나리오          | job A (머신 1)            | job B (머신 2)                    | workflow conclusion | 메일                        |
| ----------------- | ------------------------- | --------------------------------- | ------------------- | --------------------------- |
| 정상              | guard pass                | skipped (`guard_outcome≠failure`) | success             | 0                           |
| 부하 spike flake  | guard 2회 fail (soft)     | pass                              | **success**         | **0**                       |
| 진짜 회귀         | guard 2회 fail (soft)     | **2회 fail (hard)**               | **failure**         | 1 (최종 실패만)             |
| setup 결정적 실패 | guard 이전 step hard fail | skipped (needs failure)           | failure             | 1 (즉시 — 낭비 재시도 없음) |
| diagnose dispatch | guard step skipped        | skipped (`outcome=skipped`)       | 진단 결과대로       | —                           |

**continue-on-error 금지 원칙과의 정합 (CRITICAL)**: 원 ADR 이 기각한 것은 _non-blocking_ continue-on-error (= fail 무시, silent skip) 다. (B') 는 step-level soft-fail 을 **필수 blocking escalation job** 으로 라우팅 — fail 은 무시되지 않고 새 머신 재검증으로 승격되며, 진짜 회귀는 2 머신 × 2 attempt = 4회 전부 fail 해야만 그린이 될 수 없다 (은폐 불가). 가드 약화 아님 — [guard-design-principles.md](../lessons/guard-design-principles.md) §3 fail-fast 유지.

**부수 결정 — `simulate` dispatch input (test hook)**: workflow_dispatch 에 `simulate: none|flake|regression` choice input 추가 (기본 none, #709 `diagnose_variance` 선례). `flake` = job A guard 강제 fail + job B 정상 → recovery 실증. `regression` = 양 job 강제 fail → negative 실증. dispatch `--ref feature/*` 가 ref 브랜치 워크플로 정의를 따르므로 (#709 실측 박제) **머지 전 PR 단계에서 3중 시뮬레이션이 결정적으로 가능**. 잔존 위험 (수동 오발사 시 red run 1회) 은 default none + 수동 전용으로 수용.

### A1 축 4 종결 — 알림 정책 별도 조치 불필요 확정

GitHub 메일 = conclusion=`failure` 만 발송. Phase 2 (flake 시 step retry 로 job 성공 유지) + Phase 3 (flake 시 escalation 흡수로 workflow 성공) → **"최종 실패만 메일" 이 워크플로 구조만으로 완성**. 별도 알림 코드/설정 0. — (B) 를 채택했다면 attempt 1 메일이 잔존해 이 축이 미완이었음 (기각 근거와 표리).

### A1 Concrete Prediction (무침범 예측 — `git diff --stat` 실측 재현 의무)

- `.github/workflows/ci.yml` — verify:699 step **내부만** 수정 (+15줄 내외). 다른 가드 step / job 구조 0줄
- `.github/workflows/fps-baseline-guard.yml` — 1 job → 2 job 재편 (+80~95줄: setup 복제 ~55 + simulate input ~12 + escalation 배선 ~15)
- **앱/가드 스크립트 무침범**: `apps/**`, `packages/**`, `scripts/verify-fps-baseline.mjs`, `apps/web/scripts/browser-verify-*.mjs` **0줄** (워크플로 지휘부만 변경, 측정 로직 불변 = 가드 본질 보존의 구조적 증거)
- 예측 실패 (측정 스크립트 수정 필요 발생) 시 = simulate hook 설계 결함 신호 → 본 Amendment 재검토

### A1 DoD — PR 단계 vs 머지 후 실측 분리 (workflow_dispatch 2단계 함정 대응)

**PR 단계 (머지 전 검증 가능)**:

- [ ] Phase 2 retry 루프 3중 시뮬레이션 — 로컬 stub 스크립트로 positive (1회차 pass→즉시 exit 0) / negative (2연속 fail→exit 1) / recovery (1차 fail→2차 pass→exit 0) 결정적 재현 (#709 선례)
- [ ] PR 자체의 detect-and-test run 이 수정된 verify:699 step 으로 그린 (ci.yml 은 paths filter 없음 → PR 단계 실행 보장)
- [ ] Phase 3 — `gh workflow run fps-baseline-guard.yml --ref feature/*` dispatch 3회: `simulate=none` (A pass + B skipped) / `flake` (A soft-fail → B pass → conclusion=success, **메일 0**) / `regression` (양 job fail → conclusion=failure, 메일 정확 1통). run link 3개 PR 박제
  - 주의: fps 워크플로는 `paths-ignore: '.github/**'` 라 워크플로만 바꾼 PR 에서 pull_request 트리거 자체가 발화 안 함 → dispatch `--ref` 가 PR 단계 유일 실검증 경로 (설계에 반영됨)
- [ ] setup 복제 구간 동기 주석 마커 (`⚠ measure job 과 동기 유지`) 양쪽 박제
- [ ] 가드 도입 PR DoD 4축 명시 — 축 1(격리 동적)=stub 시뮬레이션+dispatch, 축 2(3중)=simulate 3종, 축 3(5 페르소나 self-consistency)=N/A (판정이 exit code 결정적 — verify-\*.sh 텍스트 매칭 가드 아님) 사유 박제, 축 4(메타 자기 적용)=N/A 사유 박제

**머지 후 실측 의무 (후속 관찰 — 이슈 #779 에 박제 후 종결)**:

- [ ] push 트리거 (develop push) 경로에서 2-job 구조 정상 1회 (PR 단계는 dispatch/pull_request 경로만 실측됨)
- [ ] 다음 자연 flake 발생 시: verify:699 attempt 2 흡수 warning annotation 또는 fps A-fail→B-pass→메일 0 실측 박제 (현 빈도 릴리스당 1~2회 → 대기 짧음)
- [ ] 릴리스 2회 창에서 수동 rerun 횟수 0 (baseline: 4/4 릴리스 → 목표 0)

### A1 재검토 조건 (원 §재검토 1~4 에 추가)

5. **verify:699 이 step retry 후에도 2연속 fail flake 재발**: (0) 측정 방법 검증 우선 — verify:699 전용 variance 진단 (fps `--diagnose-variance` 패턴 이식) 으로 S3b ratio 분포 실측 → 그 후에만 측정 강건화 (median-of-N hold 등) 검토. 임계 완화는 여전히 금지
6. **retry-fresh-runner 도 fail 하는 지속 부하가 반복** (2 머신 연속 spike): GitHub hosted runner 전역 이벤트 가능성 — matrix 분할/시간대 회피가 아니라 발생 빈도 실측 후 판단 (현재 관찰 0건)
7. **setup 복제 구간 drift 발생** (한쪽만 수정): composite action 추출로 SSoT 화 — 첫 drift 발견 시점이 착수 트리거
   → **종결 (2026-07-08, [#802](https://github.com/coseo12/astro-simulator/issues/802) / PR [#813](https://github.com/coseo12/astro-simulator/pull/813))**: drift 발생 전 rule-of-three 도달 (3번째 복제 = shader-pixel-guard, #759) 로 착수 트리거 승격 — #759 cross-validate (agy 2026-07-05) 동일 권고 2회 누적 수용 (ADR 20260705-759 §후속 분리, 단 #759 PR 자체는 검증 표면 최소화로 비목표 유지). `.github/actions/setup-and-build` composite 추출 — ci.yml r1-guard 구간 / fps-baseline-guard 2 job / shader-pixel-guard 1 job 치환 + 동기 주석 마커 제거 (A1 DoD "동기 주석 마커 양쪽 박제" 항목은 본 composite SSoT 로 대체됨)
8. **simulate input 오발사로 인한 red run 이 노이즈화**: input 제거 + 검증은 scratch 브랜치 dispatch 로 대체
9. **branch protection 도입 시** (현재 미설정 — 실측 404): `measure` job 은 soft-fail 구조라 항상 success — required check 로 부적합. 두 job 결과를 취합하는 gatekeeper job (`needs: [measure, retry-fresh-runner]` + `if: always()`) 신설 후 그것만 required 등록 (cross-validate 고유 발견 — 도입 시점이 착수 트리거)

### A1 교차검증 반영 사항 (agy 2026-07-04 — 로그 `.claude/logs/cross-validate-architecture-779-a1.log`)

**합의 (설계 유지)**: Q1 verify:699 단독 한정 — 이력 기반 선별이 fail-fast 정합, 균일 retry 는 진짜 회귀 시 전체 지연 + 오진 확률 확대 (동적 옵트인 = 재검토 조건 5 와 동일 구조). Q3 simulate hook — dispatch 는 write 권한자 전용이라 fork 우회 불가, 분기 검증 가치 > 비용. Q4 workflow_run 보안 DoD supersede 타당 (PR 컨텍스트 read-only 유지로 위험 도메인 소멸 — cache poisoning 잔존은 일반 PR 빌드와 동일 범위, 무조치). **Phase 3 전제 확증**: GitHub hosted runner 는 job 단위 fresh VM 100% 보장 (needs 직렬이어도 별도 머신).

**고유 발견 (수용)**: (1) **escalation 흡수 이력 관찰 가능성** — 2차 job 성공 (= flake 흡수) 시 `$GITHUB_STEP_SUMMARY` 에 "A-fail→B-pass 흡수" 기록 의무 (경계 회귀 — 2차 머신 성능 편차로 우연 통과 — 추적용. 100% 포착 원칙의 수용된 트레이드오프를 가시화). (2) **gatekeeper job** — 재검토 조건 9 로 박제 (현재 branch protection 부재라 즉시 구현은 YAGNI).

**이견 (기각)**: composite action 즉시 추출 (Phase 3 병합 동시) — 재검토 조건 7 의 "첫 drift 발견 시 착수" 유지. 근거: 워크플로 구조 변경 PR 은 검증 창이 좁아 (2단계 함정) 변경 표면 최소화가 우선, 동기 주석 마커 + reviewer 대조가 1차 방어. **기각 (조치 불요)**: 공통 인프라 실패 (레지스트리 다운 등) 시 양 job fail → 메일 발송은 정당한 알림 (구제 대상 아님). escalation 경로의 스케줄링 지연은 실패 경로 한정 트레이드오프.

---

## Amendment 2 (2026-08-07) — 재검토 조건 1·2 회수 + 결정 1 의 적용 범위 축소 (상태: Accepted (파생))

> **회수 트리거**: [#971](https://github.com/coseo12/astro-simulator/issues/971) branch protection required status check 도입 설계. 본 ADR 이 §재검토 조건 1 로 예고한 바로 그 시점이다.
> **결정 실체**: ADR [20260807-971-required-status-checks](20260807-971-required-status-checks.md) §2-7 / §2-10 / §5 (b) / 결정 3. 본 Amendment 는 그 결과를 **선행 ADR 쪽에 회수 박제**하는 것이며 신규 결정을 만들지 않는다.
> **코드 적용**: #971 Phase 0 (결정 6-1) — 7개 워크플로의 concurrency 그룹 키에 `${{ github.ref }}` 삽입.

### A2-1 프레이밍 — "사실 오류의 정정" 이 아니라 "예고된 가설의 실측 해소"

본 ADR 의 §재검토 조건 2 는 단정이 아니었다. 원문은 hedge (*"별도 group 으로 동작할 **수 있음**"*) 를 달았고, 거기서 그치지 않고 **정확한 진단 지시**까지 남겼다 — *"group 에 ref 미포함 확인 또는 별건 분리"*. #971 은 그 절차를 그대로 수행해 답을 채운 것이다.

즉 선행 저자가 남긴 것은 **오판이 아니라 미해소 가설 + 검증 절차**이며, 본 Amendment 는 그 절차의 산출물이다. 이 구분은 미래 회수자에게 중요하다 — 후속 ADR 이 선행 ADR 을 "정정" 하는 서사를 반복하면, 실제로는 정직하게 hedge 를 단 기록이 사후적으로 오류처럼 읽힌다.

### A2-2 (i) 재검토 조건 2 — 가설 반증 (실측)

**가설**: 같은 sha 가 develop + main 양쪽에 push 될 때, group 문자열 값은 같으나 **ref 가 달라 별도 group 으로 동작할 수 있음**.

**실측 결과 — 반증.** GitHub 의 concurrency group 은 **평가된 문자열 그 자체**이고 ref 는 암묵적으로 포함되지 않는다.

| 경로 | 실측 SHA | 관측 |
| --- | --- | --- |
| release PR 생성 (develop push ↔ PR) | `c2732ae` | `CI` / `CI (physics-wasm)` / `a11y` / `fps` / `shader` 의 `event=push, head_branch=develop` run 이 전부 `cancelled`. 생존자는 `event=pull_request` run |
| ff-sync (`git push origin main:develop`) | `58ccfcf` (main tip) | `CI` / `CI (physics-wasm)` / `Project Guards` 의 `head_branch=main` run 3개가 `cancelled`. 생존자는 `head_branch=develop` run |

따라서 branch-cross 중복은 **별도 group 이 아니었고**, "못 잡은" 것도 아니었다 — **잡되 유해한 방향으로** 잡고 있었다.

**위 표의 두 경로(push↔PR / ff-sync)는 릴리스 경로의 SHA 에서만 발생한다** — 일상 feature PR 에서는 push 이벤트가 `branches: [develop, main]` 필터에 걸러지기 때문이다. 단 이것을 *"교차 취소는 릴리스 경로에서만 일어난다"* 로 일반화하면 **틀린다**: 한 SHA 가 여러 PR 의 head 가 되면 `refs/pull/N/merge` 가 PR 마다 달라 **일상 PR 사이에서도** 교차 취소가 일어난다 (실측 — §A2-3 분류표 B2). 세 클래스 전부 `github.ref` 삽입으로 분리된다.

### A2-3 (ii) 결정 1 의 적용 범위 축소 — 릴리스 SHA 에서 push↔PR dedup 을 **철회**한다

이것이 본 Amendment 의 실질이다. #971 Phase 0 이 `github.ref` 를 group 키에 넣으면서, **§결정 1 이 정의한 dedup 의 본질 — *"같은 sha 가 두 event 로 2번 검증"* — 이 바로 그 지점에서 사라진다.**

| 축 | 결정 1 (2026-07-01 ~ 2026-08-07) | Amendment 2 이후 |
| --- | --- | --- |
| 같은 ref · 같은 sha 재트리거 | 취소 (dedup) | **유지 (불변)** |
| 같은 sha · push ↔ PR (release PR 생성 시점) | 취소 | **취소 안 함 — 양쪽 완주** |
| 같은 sha · develop ↔ main (ff-sync) | 취소 | **취소 안 함 — 양쪽 완주** |
| 같은 sha · PR ↔ PR (한 sha 가 여러 PR 의 head) | 취소 | **취소 안 함 — 각자 완주** |
| 다른 sha (새 커밋 push) | 취소 안 함 | 취소 안 함 (불변) |

**왜 축소가 정당한가**: §결정 1 의 CRITICAL 은 *"concurrency cancel = 중복 제거, 가드 약화 아님"* 이었고 이는 **사람이 판정하는 한 여전히 참**이다. 그러나 required status check 를 켜는 순간 **판정 주체가 GitHub 으로 바뀌고**, GitHub 이 통과로 인정하는 결론은 `success` / `skipped` / `neutral` **3종뿐**이다 — `cancelled` 는 여기 없다. 즉 종전에는 코스메틱이던 취소가 **머지 하드 블록**이 된다. 그리고 그 취소는 release PR **6/6 전건**에서 재현되므로 확률적 위험이 아니라 확정 사고다.

**대가 (의도적 수용)**: 릴리스 경로 SHA 에서 무거운 워크플로가 **2회 완주**한다 (월 수 회).

**남는 dedup 은 "같은 ref·같은 SHA 의 재트리거" 뿐이며, 그 빈도는 실측 0 이다.**

#### A2-3 분류표 — `cancelled` 전수 분류 (**run 레벨**)

> **단위 라벨 (2026-08-07 신설)**: 본 표의 건수는 전부 **run 레벨** (`gh run list` = workflow run) 이다. 아래 본문의 *"각 7건씩"* 은 **check-run (job) 레벨**이라 단위가 다르다. 두 단위는 같은 SHA 에서도 값이 다르다 — `c2732ae` 실측: **run 5 / job 7**. **required check 의 판정 단위는 job** 이므로, 정책 판정에는 job 레벨을, 취소 **원인 분류** (event / head_branch) 에는 run 레벨을 쓴다.
>
> **창 (window) 경계 박제** (ADR 971 §10-1 한계 10): `--limit N` 은 날짜 범위가 아니라 **개수 cap** 이라 창 시작 경계가 **측정 시각마다 이동한다**. 아래 두 표본은 재현 시각과 창을 명시한다.
>
> ```text
> 측정 시각 2026-08-07T11:51Z  --limit 1000 → 창 2026-08-01T08:19:08Z ~ 2026-08-07T11:48:08Z (6.15일, 162.7 run/일)
> 측정 시각 2026-08-07T11:54Z  --limit 2000 → 창 2026-07-18T13:03:48Z ~ 2026-08-07T11:48:08Z (19.95일, 100.3 run/일)
> ```

`(headSha, workflow name)` 로 묶어 peer run 의 `event` / `head_branch` 가 갈리는 축으로 분류했다. 6.15일 창의 `cancelled` 총 **72건 (run 레벨)**:

| 클래스                                                | 건수     | 갈리는 축                                       | 대표 SHA                              | `github.ref` 삽입이 분리하는가          |
| ----------------------------------------------------- | -------- | ----------------------------------------------- | ------------------------------------- | --------------------------------------- |
| **A** push ↔ pull_request                            | 35       | `refs/heads/develop` vs `refs/pull/N/merge`     | `c2732ae` `370d1c6` `5479837`         | **예**                                  |
| **B1** push ↔ push, 다른 branch (ff-sync)            | 21       | `refs/heads/main` vs `refs/heads/develop`       | `58ccfcf` `a4b43c8` `9452339`         | **예**                                  |
| **B2** PR ↔ PR, 한 SHA 가 여러 PR 의 head            | 16       | `refs/pull/967/merge` vs `refs/pull/969/merge`  | `4f7366e` `995b8b5`                   | **예**                                  |
| **C** 동일 ref 재트리거 (= 잔존 dedup)                | **0** | 없음 (동일 ref·동일 event)                      | —                                     | 아니오 — **유지되는 것이 이 클래스다** |

**20일 확장 표본 (`--limit 2000`) 재확인** — 결론 불변:

| 클래스 | 6.15일 창 (run 1,000) | 19.95일 창 (run 2,000) |
| --- | --- | --- |
| **A** push ↔ pull_request | 35 | 62 |
| **B1** push ↔ push (ff-sync) | 21 | 40 |
| **B2** PR ↔ PR | 16 | **16 (증가 0)** |
| **C** 동일 ref 재트리거 | **0** | **0** |
| 합계 | **72** | **118** |

**핵심 세 가지.** ① 관측된 `cancelled` **72/72 · 118/118 (100%)** 가 A/B1/B2 이며 전부 `github.ref` 삽입으로 분리된다. ② Phase 0 가 **보존**하는 C 클래스는 두 창 모두 **발화 0건**이다. ③ **B2 는 단일 사건이다** (아래).

**B2 는 본 Amendment 초안이 놓쳤던 클래스다.** `4f7366e` 는 세 PR (#967 `release/9.99.9-prep` / #968 `feat/962-guard-negative` / #969 `feature/962-branch-name-guard`) 의 head 였고, `pull_request` run 의 `github.ref` 는 `refs/pull/<번호>/merge` 라 PR 마다 다르다. 구 group 키에는 ref 가 없어 셋이 한 group 으로 붕괴해 서로를 취소했다. **push 이벤트가 0인 일상 PR 경로에서도 교차 취소가 발생한다는 직접 증거**이며, Phase 0 의 이득이 릴리스 경로에 국한되지 않음을 보인다.

> **B2 의 base rate — ∃ 주장은 유효하나 상시 현상은 아니다** (2026-08-07 신설). 20일 창의 B2 16건은 **전부 2026-08-06 하루**, **SHA 2개** (`4f7366e` 9건 + `995b8b5` 7건) 에서 나왔다 — #962 축 B 작업에서 한 커밋을 세 브랜치가 공유한 **단일 사건**이다. 창을 6일 → 20일로 넓혀도 B2 가 **16 → 16 (증가 0)** 인 것이 그 증거다.
>
> 따라서 정확한 서술은 두 방향 모두 필요하다: **(a)** *"교차 취소는 릴리스 경로에서만 일어난다"* 는 **거짓** — 일상 PR 경로에서 실제로 일어났다. **(b)** *"일상 PR 에서도 상시 일어난다"* 도 **거짓** — 한 SHA 가 여러 PR 의 head 가 되는 조건부이며 20일에 1회다. 한쪽만 쓰면 반대 방향으로 과장하게 된다.

머지 시점 head SHA 층위에서도 C 클래스는 최근 머지 PR 25건 중 **0건**이다 (`base=main` 5건이 **각 7건씩** — 이 7 은 **check-run (job) 레벨**이다, 위 72 와 단위가 다름 — 보유하나 전부 A 클래스라 Phase 0 가 제거한다).

**단 이 잔존분을 "보존한 이득" 으로만 읽으면 안 된다 (양면).** required check 체제에서 이것은 **Phase 0 이후 head SHA 위에 `cancelled` 를 남길 수 있는 유일한 잔여 경로** — 즉 Phase 0 가 없애려던 바로 그 조건의 잔재다. 실측 0건이라 현재 위험은 없지만 **"0 이므로 안전" 이 아니라 "0 인지 매번 확인" 이 옳은 자세**이며, 그 확인 절차가 §A2-6 재검토 조건 13 이다.

> **⚠️ C=0 의 원인을 오독하지 말 것 — "재트리거가 드물어서" 가 아니다** (2026-08-07 신설, ADR 971 §2-12 실측 4).
>
> **동일 ref 재트리거 자체는 드물지 않다**: 같은 `(headSha, name, event, headBranch)` 가 2회 이상 등장한 group 이 **6.15일에 23개 / 50 run** (19.95일에 54개) 관측된다. 그럼에도 `cancelled` C 클래스가 0인 이유는 **그 재트리거를 겪는 워크플로에 concurrency 블록이 없어 취소가 일어나지 않았기 때문**이다 — 6일 창의 23 group 은 **전부 `PR Template Checklist Guard`** 이고, 이 워크플로는 concurrency 미보유다 (그 group 안 run 의 conclusion: `success` 48 / `failure` 2 / `cancelled` **0**).
>
> 이 사실은 §A2-6 조건 13 과 ADR 971 결정 9-2 의 *"concurrency 추가 금지"* 를 **원리 주장에서 실측 주장으로 격상**시킨다: 넣었다면 취소가 실제로 발생했을 것이다. **단 규모는 23 이 아니라 5 다** — `cancel-in-progress` 는 *진행 중인* run 만 취소하므로, 연속 쌍 27 중 시간이 겹치는 **5쌍**만 발화한다 (겹침 1~9초). 그리고 실제 관측된 불일치 사례 (`ee64871`) 는 **run 레벨** 여유가 10분 28초·**2초**라 **겹침 0 → concurrency 를 넣었어도 결과가 동일**하다. 상세는 ADR 971 결정 9-2 / §2-12 실측 1-b.

**§축 4 (알림 정책) 영향 0**: GitHub 메일은 conclusion=`failure` 에만 발송되고 `cancelled`·`success` 는 미발송이다. 취소가 완주로 바뀌어도 **성공 run 은 메일을 만들지 않는다** — "최종 실패만 메일" 은 유지된다.

### A2-4 2026-07-01 교차검증 §기각 항목의 재평가 — 기각은 **당시 제약 하에서 옳았다**

§교차검증 반영 사항 §기각 에 다음이 있다:

> **agy: group 에 `github.ref` 추가(branch-cross 분리)** → **기각**. ref 추가 시 PR run(`refs/pull/N`) vs develop push(`refs/heads/develop`)가 **다른 group → 이중 트리거 중복 제거 자체가 실패**(주 목적 붕괴).

#971 Phase 0 은 정확히 이 기각된 변경을 채택한다. **그러나 이는 "agy 가 옳았고 Claude 가 틀렸다" 가 아니다.**

- **기각의 *기술적 서술*은 100% 정확했다** — ref 추가 시 이중 트리거 dedup 이 붕괴한다는 예측 그대로다. Phase 0 이후 실제로 붕괴하며, 위 A2-3 표가 그 붕괴를 명시 박제한 것이다.
- **바뀐 것은 판정 기준이지 사실이 아니다.** 2026-07-01 당시 목적 함수는 "alert fatigue 절감" 단독이었고 required check 는 **부재 실측 (404)** 이었다 (§핵심 환경 사실). 그 제약 하에서 "주 목적 붕괴" 는 정당한 기각 사유다. #971 은 required check 라는 **새 제약**을 도입하며, 그 제약 하에서는 붕괴 자체가 **지불 의사가 있는 비용**이 된다.
- **교훈**: 기각 기록은 *결론* 이 아니라 *결론 + 그때의 제약* 으로 읽어야 한다. 제약이 바뀌면 같은 근거가 반대 결론을 지지할 수 있다. 본 ADR 이 §핵심 환경 사실에 "required check 부재" 를 명시 실측 박제해 둔 덕분에 이 재평가가 가능했다 — **전제를 박제하지 않았다면 기각만 남아 후속 회수를 막았을 것이다.**

### A2-5 잔존 미해소 — 동명 체크런은 Phase 0 로 사라지지 않으며, 결론 불일치 원인은 **2종**이다

Phase 0 가 제거하는 것은 **`cancelled` 결론**이지 **동명 체크런**이 아니다. 오히려 교차 취소가 사라지며 양쪽이 완주해 **동명 완주 쌍이 3 → 7 로 늘어난다** (ADR 971 §2-11 실측). 안전한 이유는 동명 N개가 **전부 통과 결론**이면 어떤 해석 규칙에서도 통과하기 때문이다.

**결론 불일치를 만드는 원인은 하나가 아니라 둘이다.** 초판 Amendment 는 이를 *"flake 하나로 좁혀진다"* 로 적었으나 **본 #971 Phase 0 PR 자신의 데이터로 반증됐다** — 두 번째 원인은 확률적이지 않고 **결정론적**이며, Phase 1 required 후보 위에서 **이미 발화한 이력**이 있다.

| 원인                                                                  | 성격                | 관측 게이트                | Phase 0 가 해소하는가                             |
| --------------------------------------------------------------------- | ------------------- | -------------------------- | ------------------------------------------------- |
| ① flake 발 `failure`+`success` 혼재                                   | 확률적              | ADR 971 §8-P0 `G2`         | 아니오 (직교 — retry 설계가 담당)                 |
| ② **다중 `types:` + concurrency 부재 워크플로의 동일 SHA 누적** | **결정론적** | 동일 `G2` (원인만 다름) | **아니오** — Phase 0 는 이 축을 건드리지 않는다 |

**② 의 메커니즘**: `pr-template-checklist-guard.yml` 은 `types: [opened, edited, synchronize]` 인데 **concurrency 블록이 없다**. PR 본문을 편집(`edited`)할 때마다 **같은 SHA 에 체크런이 누적**되고, 처음 실패했다가 고쳐서 통과하면 `failure` + `success` 가 그 SHA 에 **영구히** 공존한다. 이것은 본 ADR 과 ADR 971 이 분석한 **event 축(`push` × `pull_request`)이 아니라 event *type* 축**이라 두 ADR 어디에도 기술돼 있지 않았다.

**실측 (measurement-first)**:

```
# ② 의 실발화 — PR #964 (release/0.60.0-prep, base=develop) 머지 시점 head SHA
$ gh api ".../commits/ee6487178ec590663cd25368750efa5b29b472b7/check-runs?per_page=100" \
    -q '.check_runs[] | select(.name=="pr-template-checklist") | "\(.started_at)\t\(.conclusion)"'
2026-08-05T12:50:51Z    failure
2026-08-05T13:01:35Z    failure
2026-08-05T13:01:59Z    success        ← 통과/미통과 혼재. flake 0 — 가드가 설계대로 유도한 정상 루프의 결과다

# concurrency 블록 보유 여부 (Phase 1 required 후보)
pr-template-checklist-guard.yml   없음   types: [opened, edited, synchronize]
harness-pr-review.yml (label-pr)  없음   types: [opened, synchronize, ready_for_review]
branch-name-guard.yml             있음   group: ${{ github.workflow }}-pr-${{ ...number }}

# 최근 머지 PR 25건 head SHA 의 동명 누적 (n>1)
pr-template-checklist  4건 (#964 n=3 혼재 / #959 #957 #944 는 n=2 전부 success)
label-pr               0건
branch-name            0건
```

**후보별 노출도 차이 (혼동 주의)**: `label-pr` 은 concurrency 가 없으나 `types` 에 **`edited` 가 없어** 본문 편집으로 누적되지 않는다 (`ready_for_review` 는 draft→ready 1회성) — 실측 n>1 0건. `branch-name` 은 **concurrency 를 갖고** 있고 `edited` 도 없다. 즉 ② 의 실질 노출은 **`pr-template-checklist` 단독**이며, 이 워크플로가 하필 *"본문을 고치라고 요구하는 가드"* 라 편집 루프가 설계상 유도된다는 점이 위험을 키운다.

**Phase 1 착수 전 점검 항목**: Phase 1 은 *"Phase 0 머지 직후 — 릴리스 대기 없음"* 이라 **관찰 게이트가 없고**, 그 면제 근거는 *"release PR 6/6 에서 cancel 0 + 롤백 2초"* 였다. 그러나 ② 는 `cancelled` 가 아니라 `failure`+`success` 혼재이므로 **그 근거가 원리적으로 커버하지 못한다**. 따라서 `pr-template-checklist` 를 required 로 올리기 전에 위 `G2` 식을 **후보 SHA 에 직접** 1회 실행해 빈 출력을 확인해야 한다.

> ⚠️ **해소책으로 `pr-template-checklist-guard.yml` 에 concurrency 를 추가하지 말 것.** 근거가 두 겹이며, 둘은 **배타적 케이스 분할** (겹침 0 / 겹침 >0) 이라 **합쳐야 전체를 덮는다**. **1차 (27쌍 중 22쌍)** — 관측된 사례에서 concurrency 는 **발화하지 않는다**: `ee64871` 의 세 run 은 **run 레벨** (`created_at → updated_at` — concurrency 의 실동작 단위) 여유가 10분 28초 / **2초**로 **겹침이 0** 이다. `cancel-in-progress` 는 진행 중인 run 만 취소하므로 `{failure, failure, success}` 가 **한 글자도 바뀌지 않는다**. **2차 (27쌍 중 5쌍)** — 겹쳐서 발화하는 경우엔 같은 head SHA 위에 `cancelled` 를 남기고, `cancelled` 는 GitHub 의 통과 3종에 없으므로 required check 하에서 **더 나쁘다** (`{failure, success}` → `{cancelled, success}`). 어느 경로든 `G2` 는 계속 발화한다.
>
> **단위 주의 (2026-08-07 정정, ADR 971 PR [#979](https://github.com/coseo12/astro-simulator/pull/979) 리뷰 🟡-1)**: 초판은 이 여유를 *"간격 10분 31초 / 12초"* 로 적었는데 그것은 **job (check-run) 레벨** (`started_at → completed_at`) 이라 러너 픽업 지연이 빠져 있었다 — §A2-3 이 신설한 단위 라벨 (*"run 5 ≠ job 7, 혼용 금지"*) 의 자기 위반이다. **run 레벨 정본은 2초**이며, 이는 관측된 겹침 분포 (1~9초) **안쪽** 값이다. 따라서 1차 근거는 *"발화할 수 없다"* 가 아니라 *"이 사례에서는 발화하지 않았다"* 로 읽어야 하고, 그래서 2차 근거가 불필요해지지 않는다. 실측 원문은 ADR 971 §2-12 실측 1-b.
>
> **[2026-08-07 회수 완료]** 본 Amendment 는 *"사실 박제까지만"* 하고 결정을 ADR 971 로 넘겼다. 그 결정이 내려졌다 — **ADR [20260807-971](20260807-971-required-status-checks.md) 결정 9**: (9-1) `pr-template-checklist` 를 required 에서 **제외**, (9-2) 본 워크플로에 **concurrency 추가 금지** (위 2겹 근거), (9-3) `label-pr` 은 `edited` 부재라 **조건부 유지** + 재검토 트리거 신설. `edited` 트리거 제거안은 §10-3 후속 5 로 분리됐다 (복구 경로 비대칭과의 교환).

### A2-6 재검토 조건 (원 §재검토 1~4 / §A1 5~9 에 추가)

10. **`github.ref` 삽입 후에도 릴리스 SHA 에 `cancelled` 잔존**: Phase 0 가 의도대로 동작하지 않은 것 — required check 도입 (ADR 971 Phase 2) 진입 금지. ADR 971 §8-P0 `G1` 이 게이트다.
    - **`G1` 발화 시 선분류 의무 (오차단 방지)**: `cancelled` 를 발견하면 즉시 Phase 0 실패로 판정하지 말고 **각 `cancelled` run 의 `event` 와 `head_branch` 를 먼저 분류**한다 (§A2-3 분류표 A / B1 / B2 / C). Phase 0 가 보존하기로 한 **C 클래스(동일 ref 재트리거)는 Phase 0 실패가 아니다** — 이 경우 `G1` 은 붉어져도 Phase 2 진입을 막지 않는다. A / B1 / B2 가 잔존할 때만 Phase 0 실패다.

      **[1/2] 어떤 이름이 취소됐는가** (check-run = job 레벨. required 판정 단위와 동일):
      ```bash
      gh api "repos/<owner>/<repo>/commits/<full-sha>/check-runs?per_page=100" \
        -q '.check_runs[]|select(.conclusion=="cancelled")|.name' | sort -u
      ```

      **[2/2] 그 취소가 어느 클래스인가** (run 레벨. `event` / `head_branch` 로 A/B1/B2/C 분류):
      ```bash
      gh api "repos/<owner>/<repo>/actions/runs?head_sha=<full-sha>&per_page=100" \
        -q '.workflow_runs[]|"\(.event)\t\(.head_branch)\t\(.name)\t\(.conclusion)"'
      ```

      > ⚠️ **[2/2] 는 2026-08-07 에 `gh run list --limit 200` 에서 위 API 로 교체됐다** (PR [#978](https://github.com/coseo12/astro-simulator/pull/978) qa 발견). 근거·주의 3가지:
      >
      > 1. **옛 명령은 오통과 방향으로 틀렸다.** `--limit 200` 은 날짜 범위가 아니라 **개수 cap** 이고, 이 저장소의 run 생성률 (실측 100~163 run/일) 에서 **약 1.2~1.9일**만 덮는다. 조건 10 은 **릴리스 SHA** 판정 절차인데 릴리스는 월 수 회라, 며칠 지나 확인하면 **빈 출력**이 나온다 — 그리고 빈 출력은 *"cancelled 0"* 과 형태가 같아 **Phase 0 성공으로 오독**된다. 조건 10 이 막으려는 것의 정반대다.
      > 2. **실측 (2026-08-07T11:53Z)**: `--limit 200` 이 덮은 창은 `2026-08-05T14:43:32Z ~ 2026-08-07T11:48:08Z` (1.88일). 같은 시각에 세 release PR 을 두 방식으로 조회한 결과 —
      >    ```text
      >    PR #974 merged 2026-08-06  c2732ae : run list  15건 | API 15건 (cancelled 5)
      >    PR #965 merged 2026-08-05  370d1c6 : run list   0건 | API 15건 (cancelled 5)   ← 오통과
      >    PR #956 merged 2026-08-04  5479837 : run list   0건 | API 15건 (cancelled 5)   ← 오통과
      >    ```
      >    창 안에 있는 `c2732ae` 에서는 두 방식이 **15건으로 완전 일치**한다 — 즉 교체는 동치성을 유지한 채 창 종속만 제거한다.
      > 3. **`head_sha` 는 full SHA 필수.** 축약형 (`c2732ae`) 은 에러가 아니라 조용히 `total_count: 0` 을 반환해 **같은 오독을 재생산**한다. `SHA=$(gh pr view <PR> --json headRefOid -q .headRefOid)` 는 full SHA 를 주므로 그대로 쓰면 된다.
      >
      > 창 종속 조회가 불가피한 경우 (SHA 를 모르는 전수 분류) 는 여전히 `gh run list` 를 쓰되, **결론을 인용할 때 창 경계를 함께 인용**한다 (ADR 971 §10-1 한계 10).
11. **릴리스 경로 2회 완주가 러너 비용/대기 문제로 부상**: 현재는 월 수 회 × ~13분이라 수용. 문제화되면 §5 (c) (push 트리거 제거) 를 **관측 손실을 감수하고** 재검토하거나, 릴리스 전용 경로만 분리한다. 임계 완화·가드 스킵은 여전히 금지.
12. **required check 자체를 철회하는 경우**: 본 Amendment 의 범위 축소 근거가 소멸하므로 §결정 1 원안 (ref 미포함) 복원을 검토한다 — 단 복원은 자동이 아니라 **재측정 후 결정**이다 (그 사이 워크플로 구성이 바뀌었을 수 있다).
13. **C 클래스(동일 ref 재트리거) 발화 관측**: 현재 실측 0건이나 (§A2-3 분류표) 0 이 구조적 보장은 아니다. PR reopen 등으로 C 가 관측되면 **그 SHA 가 required check 대상일 때만** 문제이며, 이때는 ① 해당 SHA 에 새 커밋을 얹어 head 를 넘기거나 ② 취소된 체크를 rerun 해 `cancelled` 를 덮는다. 상시 확인 지점은 위 조건 10 의 `G1` 선분류다.
14. **[인계 — Phase 1 적용 PR 범위]** `CLAUDE.md` §반복 운영 마찰 4 의 *"concurrency CANCELLED = 코스메틱"* 은 **무조건문**이라 required check 도입 후에는 각인층에서 오독을 만든다. 현재는 required check 부재라 참이므로 본 PR 차단 사유가 아니다 — **Phase 1 (실제 required 적용) PR 에서** `docs/ops/operational-friction.md` §4-1 로 향하는 포인터 1줄을 추가한다.
