# ADR: branch protection required status check 정책 — main 한정 단계적 도입, develop 은 required check 미채택 (#971)

- **상태**: **Provisional** (cross-validate agy 2026-08-07 2회 반영 완료 — §11 / reviewer 정적 리뷰 1회 반영 — 아래) — 교차검증·리뷰는 통합했으나 **저장소 설정이 미변경**이라 Accepted 로 올리지 않는다. 본 ADR 은 설계·근거·절차만 확정하며, 적용은 사용자 승인 후 메인 오케스트레이터가 §8 로 수행한다. Accepted 전이 조건은 §10-2.
- **reviewer 반영** (2026-08-07, PR [#977](https://github.com/coseo12/astro-simulator/pull/977)): 초판의 *"Phase 0 이 동명 체크런 조건을 소멸시킨다"* 서술이 **실측과 반대**임이 독립 재현으로 드러났다. §2-2 / §5 (b) / §6-2 / §10-1 한계 3 을 정정하고 **§2-11 (동명 체크런 전수 집계) 신설** + **§8-P0 `G2` 게이트 (동명 결론 불일치 검출) 신설**. 설계 자체 (단계 구성 / required 집합 / develop 보호 수준 / `enforce_admins` 판정) 는 **무변경** — reviewer 가 판정 6건을 전부 정합으로 확인했다.
- **날짜**: 2026-08-07
- **결정자**: architect (실측 기반 설계). 적용 권한은 사용자
- **관련**:
  - [#971](https://github.com/coseo12/astro-simulator/issues/971) (본 이슈)
  - [20260806-962-branch-name-guard](20260806-962-branch-name-guard.md) §6-2 — "물리적 차단은 required check 없이는 절반만 성립" 인계 원문. §6-4 재검토 조건 3
  - upstream ADR [20260419-gitflow-main-develop](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-gitflow-main-develop.md) — **상위** 브랜치 전략
  - upstream ADR [20260419-release-merge-strategy](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-release-merge-strategy.md) — release PR `--merge` + fast-forward 의무. 본 ADR 의 develop 결정이 보호하는 대상
  - [`docs/guides/branch-strategy-workflow.md`](../guides/branch-strategy-workflow.md) — 릴리스 의례 3단계
  - [20260701-779-ci-alert-fatigue-concurrency](20260701-779-ci-alert-fatigue-concurrency.md) — **직접 선행**. 본 ADR 은 그 §재검토 조건 1 을 발동시키고 §재검토 조건 2 의 사실 가정을 실측으로 정정한다 (§2-10)
  - [`docs/ops/operational-friction.md`](../ops/operational-friction.md) §4 — CANCELLED 코스메틱 판별법. 본 ADR 이 그 "코스메틱" 전제가 required check 하에서 무너지는 조건을 규명
  - [`docs/lessons/guard-pr-dod.md`](../lessons/guard-pr-dod.md) / [`docs/lessons/guard-design-principles.md`](../lessons/guard-design-principles.md) — 가드 도입 DoD·설계 원칙
- **교훈 적용**: "가드 설계 원칙 — measurement-first". 후보를 산문에서 추론하지 않고 **release PR 6건 × 후보 9개 = 54셀 소급 대조** + **workflow 13개 트리거 전수 분류** + **취소 메커니즘 run 단위 역추적**으로 확정했다.

---

## §1 배경

#962 축 B (PR [#969](https://github.com/coseo12/astro-simulator/pull/969)) 가 `branch-name` 가드를 만들었으나, required status check 가 없으면 GitHub 은 붉은 X 를 표시할 뿐 **머지를 기계적으로 막지 않는다**. 이는 축 B 만의 문제가 아니라 전 워크플로 공통 상태다.

그러나 required check 는 **비대칭 위험**을 갖는다. 켜지 않으면 가드가 권고에 머무를 뿐이지만, **잘못 켜면 릴리스가 하드 블록**된다. 본 저장소는 1인 개발자–AI 페어 환경이라 "다른 관리자에게 부탁" 이라는 우회로가 없고, `enforce_admins: true` 라 규칙 자체를 우회할 수도 없다.

따라서 본 ADR 의 1차 목표는 "무엇을 required 로 올릴까" 가 아니라 **"어떤 조건에서 오차단이 발생하는가" 를 먼저 실측으로 소진하는 것**이다.

---

## §2 실측 (2026-08-07)

### 2-1 현재 보호 상태

| 브랜치 | 상태 |
|---|---|
| `main` | 보호 있음. `required_status_checks: null` / `enforce_admins: true` / `required_pull_request_reviews` 존재 (`required_approving_review_count: 0`) / `allow_force_pushes: false` / `allow_deletions: false` |
| `develop` | **404 Branch not protected** — 보호 자체 없음 |

토큰: `gh auth status` scope 에 `repo` 포함, repo permission `admin: true`. 즉 **보호 규칙의 편집·삭제는 언제든 가능**하다 (§6 결정 5 의 핵심 전제).

저장소: `visibility: public` / `owner.type: User` / `default_branch: main` / 현재 열린 PR **0건**.

### 2-2 GitHub 공식 의미론 (문서 근거)

| 항목 | 사실 | 출처 |
|---|---|---|
| 통과로 인정되는 상태 | `success`, `skipped`, `neutral` **3종만** | GitHub Docs "About protected branches" / "Troubleshooting required status checks" |
| `cancelled` | 위 3종에 **없음 → 미통과** | 동상 (부재로 확인) |
| **workflow 단위** 스킵 (`paths` / `paths-ignore` / `branches` 필터 / 커밋 메시지) | 체크가 **아예 생성되지 않음** → 영구 `Pending` → **머지 영구 차단**. 공식 권고는 *"Avoid requiring workflows that can be skipped"* | GitHub Docs "Troubleshooting required status checks" |
| **job 단위** 스킵 (`if:` 조건 false, 또는 `needs` 실패로 인한 스킵) | 체크런이 `skipped` 로 **보고됨 → 통과** | 동상 |
| 동명 체크가 여럿일 때의 **해소 규칙** | *"If a check and a commit status have the same name, both must pass"* 만 기술. **동명 체크런 N개 중 어느 것이 채택되는지는 미기술** | 동상 (미기술 확인) |
| 동명 체크가 여럿일 때의 **위험** | **미기술이 아니라 명시 경고**다 — *"Using the same job name in multiple workflows can cause ambiguous status check results and **block pull requests from being merged**."* 즉 회색지대가 아니라 GitHub 이 문서화한 위험이며, 침묵하는 것은 *해소 규칙*이지 *위험의 존재*가 아니다 | GitHub Docs "About protected branches" (2026-08-07 원문 대조) |
| 직접 push (PR 아님) | required check 가 있으면 **push 되는 커밋의 required context 가 전부 통과해야** 하며, 아니면 `Protected branch update failed` 로 거부 | GitHub Docs / community discussion #170641 |

### 2-3 workflow 13개 트리거 전수 분류

required 후보 자격은 **"모든 대상 PR 에서 반드시 체크런을 보고하는가"** 하나로 갈린다.

| 클래스 | 체크 이름 (워크플로) | 실측 소요 (PR #969) | 판정 |
|---|---|---|---|
| **A — workflow 단위 path 필터 보유** | `a11y-baseline-guard` (a11y) / `measure`·`retry-fresh-runner` (fps) / `verify` (shader-pixel) / `bench` (bench) | 140s / 156s·— / 363s / — | **required 절대 금지**. docs-only PR 에서 workflow 자체가 스킵 → 체크 미생성 → 영구 pending. `bench` 는 positive `paths:` 라 더 좁다 |
| **B — path 필터 없음 + `pull_request` 전용** | `branch-name` (branch-name-guard) / `label-pr` (harness-pr-review) / `pr-template-checklist` (pr-template-checklist-guard) | 9s / 5s / 10s | **main required 가능**. 단 **push 커밋에는 영원히 미보고** → develop 직접 push 와 구조적 비호환 (§6 결정 2). 셋 다 job 단위 `if:` 보유 — `label-pr` = `github.event.pull_request.draft == false` / `pr-template-checklist` = `github.actor != 'github-actions[bot]'` / `branch-name` = 없음. **전부 `skipped` = 통과라 안전** (§2-2 job 단위 스킵 행) |
| **C — path 필터 없음 + `pull_request`·`push` 양쪽** | `project-guards` (project-guards) / `diff-scope` (ci) / `detect-and-test` (ci) / `diff-scope`·`verify-and-rust`·`long-integration-rust`·`duplicate-function-guard` (ci-physics-wasm) | 6s / 9s / 779s / 8s·113s·514s·12s | **required 가능**. `verify-and-rust`·`long-integration-rust`·`duplicate-function-guard` 는 job 단위 `if: code_changed == 'true'` → 미해당 시 `skipped` = 통과 |
| **D — 구조적 부적격** | `close-linked-issues` (PR `closed` 이벤트 전용) / `bootstrap` (`workflow_dispatch` 전용) / `plan`·`bench`·`aggregate` (bench-baseline-remeasure, `workflow_dispatch` 전용) / `Vercel Preview Comments` (외부 앱) / `GitGuardian Security Checks` (외부 앱) | — | **required 절대 금지**. 앞 셋은 대상 PR 에서 미보고, 뒤 둘은 외부 서비스 장애가 릴리스 하드 블록으로 직결 |

> 클래스 A 가 그대로 **본 정책의 최대 손실**이다. 실행 시간 상위 4개 중 3개 (`verify` 363s / `measure` 156s / `a11y-baseline-guard` 140s) 가 여기 속해 required 화가 불가능하다. 회복 경로는 §10-3 후속 1.

### 2-4 `needs` 스킵 구멍 — `detect-and-test` 단독 required 는 무의미

`ci.yml` 의 `detect-and-test` 는 `needs: diff-scope` 이고 **job 단위 `if:` 가 없다** (게이트는 step 단위). 따라서:

```
diff-scope 실패 → detect-and-test 는 conclusion=skipped → GitHub 은 통과로 인정
```

즉 `detect-and-test` 만 required 로 올리면 **상류 실패가 그대로 통과한다**. `ci-physics-wasm.yml` 의 3개 job 도 동일 구조 (`needs: diff-scope`). 구멍을 닫으려면 `diff-scope` 자체를 required 로 올려야 한다 — 그런데 §2-5 의 이름 충돌이 걸린다.

### 2-5 동명 체크런은 **축이 2개**다 — workflow 축 × event 축

`ci.yml` 과 `ci-physics-wasm.yml` 이 **둘 다 job id `diff-scope`** 를 쓴다. 여기에 이벤트 2종 (`pull_request` + `push`) 이 겹쳐 release PR head SHA 마다 **`diff-scope` 체크런이 4개** 생성된다 (실측: release PR 6/6 전건 `pass=4`).

| 축 | 원인 | 배수 | 제거 수단 |
|---|---|---|---|
| **workflow 축** | 서로 다른 워크플로가 같은 job id 사용 | ×2 (`diff-scope` 한정) | 결정 6-2 리네임 (`diff-scope-wasm`) |
| **event 축** | 같은 워크플로가 `pull_request` + `push` 양쪽 트리거 보유 | ×2 (**push 트리거를 가진 모든 컨텍스트**) | **없음** — 제거하려면 §5 (c) (push 트리거 삭제) 인데 기각됨 |

**결정 6-2 의 리네임은 workflow 축만 없앤다 (4→2). event 축은 그대로 남는다.** 그리고 event 축은 `diff-scope` 만의 문제가 아니라 클래스 C 전체 (`project-guards` / `detect-and-test` / `verify-and-rust` / `long-integration-rust` / `duplicate-function-guard`) 에 해당한다 — 셋 다 `on: {pull_request, push}` `branches: [develop, main]` 이다.

§2-2 대로 동명 체크런 N개의 **해소 규칙**은 GitHub 이 문서화하지 않았고, 그 **위험**은 명시 경고돼 있다. 전수 집계와 Phase 0 이후 투영은 §2-11.

> **부수 발견 — `diff-scope` 는 유일한 동명 쌍이 아니다.** `bench.yml` 의 job id `bench` (L40) 와 `bench-baseline-remeasure.yml` 의 job id `bench` (L51) 도 동명이다. 양쪽 다 required 절대 금지 목록 (클래스 A / 클래스 D) 이라 **정책 영향 0** 이고, 결정 8 의 가드는 *선언된 context 가 실재하는가* 를 대조하므로 오탐도 없다. 다만 "동명은 `diff-scope` 하나뿐" 이라는 인상을 남기지 않기 위해 박제한다.

### 2-6 CANCELLED — release PR 6/6 에서 100% 재현되는 구조적 현상

`gh api commits/{sha}/check-runs` 로 최근 release PR 6건의 head SHA 를 전수 대조했다.

| release PR | `project-guards` | `branch-name` | `pr-template-checklist` | `label-pr` | `diff-scope` | `detect-and-test` | `verify-and-rust` | `long-integration-rust` | `duplicate-function-guard` |
|---|---|---|---|---|---|---|---|---|---|
| #974 (v0.61.0) | pass 2 | pass 1 | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |
| #965 (v0.60.0) | pass 2 | **부재** | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |
| #956 | pass 2 | **부재** | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |
| #948 | pass 2 | **부재** | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |
| #938 | pass 2 | **부재** | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |
| #930 | pass 2 | **부재** | pass 1 | pass 1 | pass 4 | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 1 / **cancel 1** | pass 2 |

읽는 법:
- `branch-name` **부재 5건** = 가드가 2026-08-06 에 신설돼 그 이전 release PR 에는 존재하지 않음. 소급 근거는 `n=1` 뿐 (#974). 현재 열린 PR 0건이라 "옛 PR 이 영구 pending 으로 남는" 리스크는 없다.
- 무거운 3개 (`detect-and-test` / `verify-and-rust` / `long-integration-rust`) 는 **6/6 전건에서 cancelled 쌍둥이 보유**. 우연이 아니라 구조다.
- Phase 1 후보 4개 (`project-guards` / `branch-name` / `pr-template-checklist` / `label-pr`) 는 **cancel 0 / 부재 0** (branch-name 은 존재하는 1건 기준).

### 2-7 취소 메커니즘 확정 — concurrency 그룹 키에 **ref 가 없다**

7개 워크플로가 전부 아래 키를 쓴다 (`branch-name-guard.yml` 만 PR 번호 키로 예외).

```yaml
concurrency:
  group: ${{ github.workflow }}-${{ github.event.pull_request.head.sha || github.sha }}
  cancel-in-progress: true
```

**ref 가 키에 없으므로, 같은 SHA 가 다른 ref 로 등장하면 서로를 취소한다.** run 단위 역추적으로 두 경로가 확인됐다.

1. **release PR 생성 시** — `develop` push run 과 release PR 의 `pull_request` run 이 같은 SHA. 실측 (SHA `c2732ae`): `CI` / `CI (physics-wasm)` / `a11y` / `fps` / `shader` 의 `event=push, head_branch=develop` run 이 전부 `cancelled`, 생존자는 `event=pull_request` run.
2. **ff-sync 시** — `git push origin main:develop` 이 **main 과 동일한 SHA** 를 develop 에 올려 두 번째 push run 을 만든다. 실측 (main tip `58ccfcf`): `CI` / `CI (physics-wasm)` / `Project Guards` 의 `head_branch=main` run 3개가 `cancelled`, 생존자는 `head_branch=develop` run.

즉 현재 concurrency 설정의 **실질 효과 대부분이 이 유해한 교차 취소**다. 일상 feature PR 에서는 push 이벤트가 `branches: [develop, main]` 로 걸러져 발생하지 않고, PR 에 새 커밋을 올리면 SHA 가 바뀌어 키도 달라지므로 취소가 일어나지 않는다. 남는 정당한 dedup 은 "같은 ref·같은 SHA 의 재트리거" 뿐이다.

**그리고 이 취소는 정확히 릴리스 경로의 SHA 에서만 발생한다** — 즉 required check 가 가장 위험한 지점과 정확히 겹친다.

### 2-8 동명 cancelled/success 해석은 **사전 실증이 불가능하다**

“cancelled 쌍둥이가 있어도 최신 success 가 채택된다” 는 가설은 다음 이유로 **검증할 수 없다**:

- GitHub 이 동명 체크런 해석 규칙을 문서화하지 않았다 (§2-2).
- 임의 conclusion 의 체크런을 합성하려면 Checks API `POST /check-runs` 가 필요한데, 이는 **GitHub App 토큰 전용**이다. PAT 로는 403 → 일회용 브랜치로도 재현 불가.
- ruleset `enforcement: evaluate` (dry-run) 은 **organization 소유 저장소 전용**이고 본 저장소는 `owner.type: User` → 사용 불가 (§3-3).

따라서 **가정에 기대지 않고 구조적으로 제거**하는 것 외에 안전한 선택지가 없다 (§6 결정 3).

### 2-9 봇 PR 실측

`peter-evans/create-pull-request` 가 생성한 PR 20건 조회 결과:

- **최근 17건이 `base=feature/*` 또는 `base=fix/*`** (예: #925 `base=fix/887-css-reset-layer`, 2026-08-02). `main`/`develop` 보호의 적용 대상이 아니다.
- #925 의 체크런은 GitGuardian·Vercel 뿐 — Actions 체크 0. 원인은 다른 워크플로의 `branches: [develop, main]` 필터 (base 가 feature 브랜치) + `branch-name` 가드가 아직 없던 시점.
- `base=develop` 이던 과거 봇 PR **#600 (2026-05-30) 에서는 `event=pull_request` 워크플로가 정상 트리거됐다**. 즉 "`GITHUB_TOKEN` 으로 만든 PR 은 워크플로가 트리거되지 않는다" 는 일반 제약이 **본 저장소에서는 발현하지 않았다** (`n=1` 실측). 단 이를 정책의 전제로 삼지는 않는다 — §6 결정 4 는 이 사실에 의존하지 않는 방향으로 결정한다.
- #600 당시 `pr-template-checklist` 는 **failure** 였다. 현재는 job 단위 `if: github.actor != 'github-actions[bot]'` 로 `skipped` = 통과.

### 2-10 선행 ADR #779 와의 결합 — 예고된 조건의 발동 + 사실 가정 1건 정정

[20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) 이 concurrency 를 도입하면서 **재검토 조건 2개를 미리 박제**했다. 본 ADR 이 그 회수 시점이다.

**재검토 조건 1 (발동 확인)**

> "branch protection 도입 시: required status check 가 생기면 concurrency cancel 이 required check 를 cancelled 로 만들어 PR 머지를 막을 수 있다. 그 시점에 **required check 를 PR 트리거에만 연결** + cancelled→재실행 또는 **cancel-in-progress 를 PR 에 한정**하는 재설계 필요."

정확한 예고였다. 본 ADR §5 는 그 두 제안을 후보 (c)/(e) 로 실제 비교했고 (e) 는 §5 의 사유로 기각된다.

**재검토 조건 2 (사실 가정 정정)**

> "group 식이 sha 기준이라 같은 sha 가 develop+main 양쪽 push 시 group 값은 같으나 **ref 가 달라 별도 group 으로 동작할 수 있음**"

**실측이 반증한다.** GitHub 의 concurrency group 은 **평가된 문자열 그 자체**이며 ref 는 암묵적으로 포함되지 않는다. main tip `58ccfcf` 실측 (§2-7): `head_branch=main` 의 `CI`·`CI (physics-wasm)`·`Project Guards` run 3개가 `head_branch=develop` run 에 의해 **실제로 취소됐다**. 즉 별도 group 이 아니라 **동일 group** 이었고, ff-sync 의 branch-cross 중복은 "못 잡은" 게 아니라 **잡되 유해한 방향으로 잡았다**.

이 정정은 #779 의 §CRITICAL ("concurrency cancel = 중복 제거, 가드 약화 아님") 을 뒤집지 않는다 — **사람이 판정하는 한** 여전히 참이다. 다만 **판정 주체가 GitHub 으로 바뀌는 순간** (required check) 그 전제가 무효가 된다는 경계가 추가된다.

### 2-11 동명 체크런 전수 집계 — **Phase 0 은 동명을 없애지 않고 늘린다**

> 본 절은 초판의 사실 오류를 정정한 결과다. 초판은 §10-1 한계 3 / §5 (b) / §6-2 에서 *"Phase 0 이 동명 조건을 소멸시킨다"* 고 서술했으나 **실측이 반대를 가리킨다**. 정정 근거를 재현 명령 + 출력 원문으로 박제한다 (reviewer 독립 재현과 대조 가능).

**재현 명령** (release PR [#974](https://github.com/coseo12/astro-simulator/pull/974) head `c2732ae`):

```bash
gh api "repos/coseo12/astro-simulator/commits/c2732ae/check-runs?per_page=100" \
  -q '[.check_runs[] | {name, conclusion}] | group_by(.name)[]
      | "\(.[0].name)\tn=\(length)\t\(map(.conclusion) | sort | join(","))"'
```

**출력 원문** (2026-08-07 실측, 15 이름 / 26 체크런):

```text
GitGuardian Security Checks	n=1	success
Vercel Preview Comments	n=1	success
a11y-baseline-guard	n=2	cancelled,success
branch-name	n=1	success
detect-and-test	n=2	cancelled,success
diff-scope	n=4	success,success,success,success
duplicate-function-guard	n=2	success,success
label-pr	n=1	success
long-integration-rust	n=2	cancelled,success
measure	n=2	cancelled,success
pr-template-checklist	n=1	success
project-guards	n=2	success,success
retry-fresh-runner	n=2	cancelled,skipped
verify	n=2	cancelled,success
verify-and-rust	n=2	cancelled,success
```

**세 가지가 동시에 참이다.**

1. **동명 다중은 미래 조건이 아니라 현재 상태다.** `project-guards` 는 **Phase 0 이전인 지금도 동명 2개**이고 (6초짜리라 push run 과 PR run 이 교차 취소 전에 둘 다 완주한다), 이것이 바로 **Phase 1 의 required 후보**다. `duplicate-function-guard` (2), `diff-scope` (4) 도 마찬가지다.
2. **Phase 0 는 동명을 줄이는 게 아니라 늘린다.** 교차 취소가 사라지면 위 `cancelled` 7건이 전부 완주로 바뀐다.
3. **결정 6-2 리네임은 workflow 축만 없앤다** (§2-5). `diff-scope` 4 → `diff-scope` 2 + `diff-scope-wasm` 2 이며, event 축 ×2 는 남는다.

**Phase 0 이후 투영** (required 후보 10개):

| 단계 | context | 트리거 축 | 현재 (`c2732ae`) | Phase 0 이후 |
|---|---|---|---|---|
| 1 | `project-guards` | push + PR | n=2 `success,success` | n=2 (불변 — 이미 양쪽 완주) |
| 1 | `branch-name` | PR 전용 | n=1 | **n=1** (동명 없음) |
| 1 | `pr-template-checklist` | PR 전용 | n=1 | **n=1** (동명 없음) |
| 1 | `label-pr` | PR 전용 | n=1 | **n=1** (동명 없음) |
| 2 | `diff-scope` | push + PR (× workflow 2) | n=4 | n=2 (workflow 축 제거) |
| 2 | `diff-scope-wasm` | push + PR | 미존재 | n=2 (신설) |
| 2 | `detect-and-test` | push + PR | n=2 `cancelled,success` | n=2 **양쪽 완주로 전환** |
| 3 | `verify-and-rust` | push + PR | n=2 `cancelled,success` | n=2 **양쪽 완주로 전환** |
| 3 | `long-integration-rust` | push + PR | n=2 `cancelled,success` | n=2 **양쪽 완주로 전환** |
| 3 | `duplicate-function-guard` | push + PR | n=2 `success,success` | n=2 (불변) |

즉 **required 후보 10개 중 7개가 동명 쌍을 갖고**, 동명 쌍이 전부 완주하는 이름은 **3개 (`project-guards` / `diff-scope` / `duplicate-function-guard`) → 7개**로 **증가**한다. 동명이 원천적으로 없는 것은 `pull_request` 전용인 클래스 B 3개뿐이다.

**그럼에도 안전한 이유 — 잔여 위험의 정확한 위치.** 동명 N개가 **전부 `success` 면 어떤 해석 규칙에서도 통과한다** (latest 채택 / all-must-pass / first 채택 무관). 따라서 위험은 "동명이 여럿인 것" 자체가 아니라 **오직 결론이 갈리는 경우**다. Phase 0 가 실제로 사기는 것은 "동명 소멸" 이 아니라 **결론 불일치 확률의 하락**이다 — `cancelled` (미통과 결론) 을 구조적으로 제거하므로 불일치의 **가장 빈번하고 100% 재현되던 원인 (6/6)** 이 사라진다. 남는 불일치 원인은 **flake** 뿐이며, 이것이 본 정책의 실질 잔여 위험이다 (§10-1 한계 3).

---

## §3 후보 비교 — 관리 방식

### 3-1 후보 (a) `.github/settings.yml` (Probot Settings App)

| 축 | 평가 |
|---|---|
| 재현성 | 높음 (파일이 SSoT) |
| 권한 비용 | **서드파티 GitHub App 에 `administration: write` 상시 부여**. 1인 저장소에서 공급망 노출 > 이득 |
| 자기 무력화 | **치명적** — default branch 의 `settings.yml` 을 신뢰 근거로 삼으므로, 그 파일을 약화시키는 PR 이 머지되면 보호가 조용히 사라진다. 가드가 자기 자신을 끌 수 있는 구조는 CLAUDE.md §가드 설계 원칙 (fail-fast / silent 약화 금지) 위반 |
| 커버리지 | rulesets 미지원 |

### 3-2 후보 (b) repo 내 JSON 선언 + `gh api` 스크립트

| 축 | 평가 |
|---|---|
| 재현성 | 높음 (payload 전문이 저장소에 박제) |
| 권한 비용 | **0** — 신규 앱·시크릿 없음. 사람이 실행 |
| 자기 무력화 | 없음 — 파일 변경만으로는 아무 일도 일어나지 않고, 적용은 명시적 실행이 필요 |
| 한계 | **CI 자동 드리프트 검사 불가** — Actions `GITHUB_TOKEN` 에 `administration: read` 가 없어 워크플로가 보호 상태를 읽을 수 없다. PAT 시크릿 도입은 비목표 (§7). 따라서 검증 스크립트는 **로컬/메인 전용** |

### 3-3 후보 (c) Repository rulesets

| 축 | 평가 |
|---|---|
| 가용성 | 공개 저장소 + Free 라 **사용 가능** |
| 매력 | bypass actor 지정 (classic protection 의 이진 `enforce_admins` 보다 세밀), JSON export/import |
| 치명적 결함 1 | `enforcement: evaluate` (dry-run) 은 **organization 소유 전용**. 본 저장소는 `owner.type: User` → **안전한 사전 관측 모드를 쓸 수 없다** (rulesets 채택의 최대 유인이 사라짐) |
| 치명적 결함 2 | 지정 가능한 bypass actor 중 본 저장소에 존재하는 것은 사실상 **repository admin = 사용자 본인 = 에이전트가 쓰는 토큰**. 즉 bypass 를 켜면 규칙이 대상에게 항상 열려 있어 실효 0 |
| 이전 비용 | classic protection 과 병존 시 평가 규칙이 합집합으로 복잡해짐 |

**→ (b) 채택.** (a) 기각 (권한 + 자기 무력화), (c) 기각 (dry-run 불가 + bypass 실효 0).

---

## §4 후보 비교 — `develop` 보호 수준

`git push origin main:develop` (fast-forward, force 아님) 은 릴리스 의례의 **필수 단계**다 ([release-merge-strategy ADR](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-release-merge-strategy.md) — merge-back PR 을 없애기 위해 도입된 구조).

| 후보 | `required_pull_request_reviews` | `required_status_checks` | ff-sync 영향 | 판정 |
|---|---|---|---|---|
| (a) 무보호 유지 | — | — | 없음 | 안전하나 **force-push·삭제로 develop 이력을 잃을 수 있음** (현재 상태) |
| (b) **최소 보호** | `null` | `null` | **없음** — ff push 는 non-force 일반 push 라 통과 | **채택** |
| (c) 클래스 B·C 체크 required | `null` | 클래스 B·C | **영구 차단** — `branch-name`·`label-pr`·`pr-template-checklist` 는 `pull_request` 전용이라 push 커밋에 **영원히 미보고**. 클래스 C 만 걸어도 main push run 완료까지 13분+ 거부되고, ff-sync push 자체가 §2-7 의 교차 취소를 새로 만든다 | 기각 |
| (d) PR 필수 (`required_pull_request_reviews` 존재) | 존재 | — | **즉사** — 모든 직접 push 금지 | 기각 |
| (e) (d) + 릴리스 의례를 merge-back PR 로 변경 | 존재 | 선택 | 의례 자체 변경 | 기각 — [release-merge-strategy ADR](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-release-merge-strategy.md) 이 명시적으로 제거한 매 릴리스 merge-back PR 비용을 되살린다. 정책을 위해 상위 결정을 뒤집는 역전 |

---

## §5 후보 비교 — CANCELLED 대응

| 후보 | 내용 | 판정 |
|---|---|---|
| (a) 무대응 — "최신 success 가 채택될 것" 가정 | 현행 concurrency 유지 | **기각**. §2-8 대로 검증 불가한 가정이고, 틀리면 **모든 release PR 이 하드 블록**된다 (6/6 재현이므로 확률적 사고가 아니라 확정 사고) |
| (b) **concurrency 키에 `github.ref` 추가** | `group: ${{ github.workflow }}-${{ github.ref }}-${{ ...sha }}` | **채택**. `pull_request` 는 `refs/pull/N/merge`, push 는 `refs/heads/*` 로 분리 → **교차 *취소* 의 소멸**. ⚠️ **동명 체크런 자체는 소멸하지 않는다 — 오히려 완주 쌍이 3→7 로 늘어난다** (§2-11). 정확히는 **#779 결정 1 의 적용 범위를 릴리스 SHA 에서 철회**하는 것이다: #779 가 정의한 중복의 본질이 *"같은 sha 가 두 event 로 2번 검증"* 이었고 Phase 0 가 없애는 것이 바로 그 dedup 이다. 잔존 dedup (같은 ref·같은 SHA 재트리거) 은 #779 스스로 *"다른 sha (새 커밋 push) → group 식 값이 달라 취소 안 됨"* 이라 명시했듯 실무상 거의 발생하지 않는 잔여분이다. 대가: 릴리스 경로 SHA 에서 무거운 워크플로가 2회 완주 (월 수 회) |
| (c) push 트리거 제거 | `on.push` 를 무거운 워크플로에서 삭제 | 기각 — 통합 브랜치의 머지 후 신호를 잃는다. 취소 문제는 해결되나 관측 손실이 대가 |
| (d) cancelled 를 required 대상에서 빼기 | 무거운 체크를 영구 비-required 로 | 기각 — `detect-and-test` (13분, 최대 커버리지) 를 영원히 포기하게 된다 |
| (e) **`cancel-in-progress` 를 PR 에 한정** (#779 §재검토 조건 1 의 자체 제안) | `cancel-in-progress: ${{ github.event_name == 'pull_request' }}` | **기각 — 효과가 없다.** `cancel-in-progress` 는 *새로 들어오는* run 의 속성이라, 뒤늦게 도착한 `pull_request` run (값 `true`) 이 진행 중인 push run 을 **여전히 취소한다**. release PR 실측 (§2-7 경로 1) 이 정확히 이 순서다. 취소를 막으려면 PR run 쪽을 `false` 로 해야 하는데 그러면 dedup 자체가 사라진다 |
| (f) cancelled 감지 시 자동 재실행 (#779 §재검토 조건 1 의 다른 제안) | 별도 워크플로가 cancelled 를 감시해 rerun | 기각 — CLAUDE.md §가드 설계 원칙의 "drift 가드에 fallback 분기 금지" 와 같은 구조. 취소의 **원인**을 두고 증상만 되돌리며, 재실행 자체가 또 취소될 경합을 만든다 |

---

## §6 결정

### 결정 1 — required 체크 집합 (main 전용, 단계적)

`strict: false` (= "Require branches to be up to date before merging" **미사용**) 고정. `strict: true` 는 release PR 머지 직전마다 develop 이 main tip 을 포함할 것을 요구해 릴리스 직후 상태와 순환 교착을 만든다.

| 단계 | 추가 컨텍스트 | 누적 대기 | 진입 게이트 | 근거 |
|---|---|---|---|---|
| **Phase 1** | `project-guards`, `branch-name`, `pr-template-checklist`, `label-pr` | ~10s | **Phase 0 머지 직후 — 릴리스 대기 없음** | 전부 클래스 B/C, path 필터 0, release PR 6/6 에서 cancel 0. 실패 시 원인이 즉시 자명하고 롤백이 2초 |
| **Phase 2** | `diff-scope`, `diff-scope-wasm`, `detect-and-test` | ~13분 | **release PR 1회 관찰 통과 후** | §2-4 의 `needs` 스킵 구멍을 닫으려면 `diff-scope` 계열이 필수. 이 3개가 정확히 cancelled 쌍둥이 6/6 을 갖던 대상이라 관찰 게이트를 여기에 집중한다 |
| **Phase 3** (선택) | `verify-and-rust`, `long-integration-rust`, `duplicate-function-guard` | ~13분 (병렬) | release PR 1회 관찰 통과 후 | job 단위 `if` 로 코드 무변경 PR 에서는 `skipped` = 통과. Phase 2 관찰 후 판단 |

> **관찰 게이트를 Phase 2 앞에만 두는 이유** (cross-validate 이견 수용, §11): 원안은 Phase 0→1 사이에도 release PR 1회 관찰을 요구해 도입에 릴리스 3주기가 필요했다. 그러나 위험은 **cancelled 쌍둥이를 실제로 갖던 무거운 3개** 에 집중돼 있고 (§2-6), Phase 1 후보 4개는 cancel 0 + 롤백 2초다. 관찰 비용을 위험이 있는 곳에만 지출한다.

**required 절대 금지 목록** (ADR 로 박제 — 미래에 "왜 안 넣었지?" 재발 방지):
`a11y-baseline-guard` / `measure` / `retry-fresh-runner` / `verify` (shader-pixel) / `bench` (`bench.yml`) — **workflow 단위 path 필터** 보유 (docs-only PR 에서 영구 pending).
`close-linked-issues` / `bootstrap` / `plan`·`bench`·`aggregate` (`bench-baseline-remeasure.yml`) — 대상 PR 에서 미보고 (각각 PR `closed` 이벤트 전용 / `workflow_dispatch` 전용).
`Vercel Preview Comments` / `GitGuardian Security Checks` — 외부 서비스 장애 = 릴리스 하드 블록.

> `bench` 가 두 줄에 등장하는 것은 오기가 아니다 — `bench.yml` 과 `bench-baseline-remeasure.yml` 이 **동명 job id `bench`** 를 쓴다 (§2-5 부수 발견). 금지 사유는 서로 다르지만 (path 필터 / `workflow_dispatch` 전용) 양쪽 다 금지다.

### 결정 2 — `develop` 보호: **최소 보호 채택, required check 는 미채택 (영구)**

`allow_force_pushes: false` + `allow_deletions: false` 만 걸고 `required_status_checks: null` / `required_pull_request_reviews: null` 로 둔다. ff-sync 는 non-force 일반 push 라 영향 0이며, 이력 파괴 (force-push·브랜치 삭제) 만 차단된다.

"develop 직접 push 금지" 라는 CLAUDE.md 산문 규약은 **기계적으로 강제하지 않는다**. 강제하면 §4 (c)/(d) 대로 릴리스 의례가 깨지기 때문이다. 이 격차는 은폐하지 않고 §10-1 에 한계로 명시한다.

부수 효과 (수용): develop 의 긴급 force-push 복구가 불가능해진다. 대체 경로는 revert 커밋이며, 정말 필요하면 §8-R2 롤백으로 5초 내 해제 가능.

### 결정 3 — CANCELLED: **가정하지 않고 구조적으로 제거**

§5 (b) 채택. concurrency 그룹 키에 `${{ github.ref }}` 를 추가해 교차 취소를 소멸시킨다. 이것을 **Phase 1 을 포함한 모든 단계의 선행 조건 (Phase 0)** 으로 둔다.

> ⚠️ **제거 대상은 `cancelled` 결론이지 동명 체크런이 아니다.** Phase 0 이후에도 동명 쌍은 남으며 오히려 **완주 쌍이 3 → 7 로 는다** (§2-11). 이 결정이 사는 것은 "결론 불일치의 100% 재현되던 원인" 이고, flake 발 불일치는 §10-1 한계 3 의 잔여 위험으로 남아 §8-P0 `G2` 게이트가 관측한다.

Phase 1 후보 4개는 실측상 cancel 0 이지만, 그것은 "짧아서 두 번째 이벤트 run 이 시작되기 전에 끝났다" 는 **경합 결과**일 뿐 보장이 아니다 (#974 실측: push run 09:34:29 종료, PR run 09:35:26 시작 — 57초 여유가 우연히 있었을 뿐). 하드 블록의 비대칭 비용을 감안하면 PR 1건의 선행 비용이 훨씬 싸다.

`docs/ops/operational-friction.md` §4 의 "CANCELLED = 코스메틱" 판별법은 **사람이 눈으로 판정할 때만** 유효하다. required check 하에서는 GitHub 이 판정하며 그 규칙은 문서화돼 있지 않다 — 같은 문서를 갱신해 이 경계를 박제한다 (§8-P0 산출물).

### 결정 4 — 봇 PR: **정책적으로 영향 0, 단 방어적으로 고정**

develop 에 required check 를 도입하지 않고 (결정 2) 봇 PR 은 main 을 대상으로 하지 않으므로 영향은 0이다. 추가로:

- 봇 PR 의 `base` 는 **feature 브랜치 유지** (현행). `base=develop` 으로 되돌리지 않는다 — 되돌릴 경우 `GITHUB_TOKEN` 워크플로 미트리거 제약이 발현하면 required check 가 영구 pending 이 될 수 있다 (#600 에서는 미발현했으나 `n=1` 이라 전제로 삼지 않는다).
- 만약 향후 봇 PR 을 develop 대상으로 되돌린다면, 그 PR 의 DoD 에 "체크런 실보고 확인" 을 넣는다 (§10-3 후속 3).

### 결정 5 — `enforce_admins`: **`true` 유지 (낮추지 않음)**

`enforce_admins` 는 **규칙의 우회**를 통제할 뿐 **규칙의 편집·삭제**를 막지 않는다. 토큰이 `repo` scope + repo `admin: true` 이므로 (§2-1) §8-R1 의 한 줄로 **약 2초 만에** required check 를 걷어낼 수 있다. 즉 탈출구는 이미 존재한다.

반대로 `false` 로 낮추면 "빨간 체크인 채로 실수 머지" 라는 **새로운 사고 클래스**가 열린다. 이 저장소는 자기 자신을 머지하는 1인 환경이라 그 실수를 잡아 줄 관찰자가 없다 — `enforce_admins: true` 야말로 유일한 관찰자다.

**추가 논거 (cross-validate 이견 수용, §11)**: 두 선택지는 "우회 가능 여부" 가 아니라 **흔적이 남는가**에서 갈린다. `enforce_admins: false` 의 우회 머지는 아무 기록도 남기지 않는 반면, `true` 를 유지한 채 §8-R1 로 규칙을 걷어내면 보호 규칙 변경이 **계정 보안 로그와 API 상태에 남는다**. 즉 `true` 유지는 탈출구를 없애는 게 아니라 **탈출을 관찰 가능하게 만든다**. (Organization 수준 audit log 만큼 상세하지는 않다 — 개인 계정은 security log 범위다.)

**전제 (성립 조건)**: 본 결정은 **작업 토큰이 해당 저장소의 admin 권한을 갖는다**는 사실에 의존한다. fine-grained PAT 로 전환해 `Administration` 권한이 빠지면 §8-R1 이 `403` 으로 실패하고 **탈출구가 실제로 사라진다**. 따라서 §8 의 사전 확인 1줄 (`.permissions.admin == true`) 은 선택이 아니라 **적용 전 필수 게이트**이며, 토큰 정책 변경은 §10-5 재검토 조건 6 에 걸어 둔다.

**단 조건부 결정이다**: 탈출구가 문서화되지 않으면 존재하지 않는 것과 같다. §8-R1/R2/R3 롤백 명령 원문을 본 ADR 과 이슈 #971 코멘트 양쪽에 박제하고, 릴리스 런북 (`docs/guides/branch-strategy-workflow.md`) 에서 링크하는 것을 Phase 1 의 산출물로 고정한다.

### 결정 6 — Phase 0 (코드 선행 작업, 설정 변경 0)

| # | 변경 | 대상 | 이유 |
|---|---|---|---|
| 6-1 | concurrency 그룹 키에 `${{ github.ref }}` 삽입 | `ci.yml`, `ci-physics-wasm.yml`, `project-guards.yml`, `a11y-baseline-guard.yml`, `fps-baseline-guard.yml`, `shader-pixel-guard.yml`, `bench.yml` (7개. `branch-name-guard.yml` 은 PR 번호 키라 제외) | 결정 3 |
| 6-2 | `ci-physics-wasm.yml` 의 `diff-scope` job 에 `name: diff-scope-wasm` 부여 | `ci-physics-wasm.yml` | §2-5 **workflow 축** 제거 (`diff-scope` 4 → `diff-scope` 2 + `diff-scope-wasm` 2). ⚠️ **event 축 ×2 는 남으므로 동명 "해소" 가 아니라 "축소"** 다. job id 는 유지하고 `name:` 만 추가하면 `needs:` 참조 3곳을 건드리지 않는다 |
| 6-3 | `ci.yml` 상단 주석의 *"required check 도입 시 본 전제 재검토"* 를 본 ADR 링크로 갱신 | `ci.yml` | 이미 있는 예고 주석의 회수 |
| 6-4 | `docs/ops/operational-friction.md` §4 에 "required check 하에서는 코스메틱 전제가 무효" 경계 박제 | 동 문서 | 결정 3 후단 |
| 6-5 | [20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) 에 Amendment 추가 — **(i)** §재검토 조건 2 의 "ref 가 달라 별도 group" **가설을 실측으로 해소** + **(ii) 결정 1 (push+PR 교차 dedup) 의 적용 범위가 릴리스 SHA 에서 축소됨을 박제** + 본 ADR 역링크 | 동 ADR | §2-10 / §5 (b). **"사실 오류" 가 아니라 "예고된 가설의 실측 해소"** 다 — #779 원문은 hedge (*"별도 group 으로 동작할 **수 있음**"*) 에 더해 정확한 진단 지시 (*"group 에 ref 미포함 확인"*) 까지 남겼고, 본 ADR 은 그 절차를 그대로 수행해 답을 채웠다. 선행 저자가 남긴 것은 오판이 아니라 **미해소 가설 + 검증 절차**다. (ii) 를 함께 박제해야 다음 회수자가 "왜 concurrency 가 릴리스 경로에서 안 먹지?" 를 추적할 수 있다 |

Phase 0 은 일반 dev PR (base=develop) 이며 저장소 설정을 만지지 않는다. **머지 직후 Phase 1 로 진행한다** (release PR 대기 없음 — 결정 1 의 관찰 게이트 표 참조). Phase 0 의 효과 실측 (release PR 에서 cancelled 0) 은 **Phase 2 의 진입 게이트**다.

### 결정 7 — 선언적 관리: repo 내 JSON + 스크립트 (§3-2 (b))

- SSoT: `.github/branch-protection/main.json` / `develop.json` (payload 전문). 본 ADR §8 이 그 초판 원문이다.
- 적용: `scripts/apply-branch-protection.sh <branch> [--dry-run]`
- 드리프트 검사: `scripts/verify-branch-protection.sh` — **로컬/메인 전용** (§3-2 한계). CI 배선 안 함.
- 구현은 developer 후속 (§10-3 후속 2). Phase 1/2 는 §8 의 heredoc 명령으로 선행 가능하다 — 스크립트 부재가 정책 도입을 막지 않도록 순서를 분리한다.

### 결정 8 — required 컨텍스트 이름의 정적 가드 (신설, cross-validate 이견 수용)

required 목록은 **job 이름 문자열**로 저장되므로, 훗날 누군가 `.github/workflows/**` 의 job 이름을 바꾸면 GitHub 은 사라진 옛 이름을 **영구 `Expected`** 로 기다린다. 보호 설정과 워크플로가 서로를 모르는 채 drift 하는 구조다.

이 구멍은 **admin 권한 없이 CI 에서 닫을 수 있다**. §3-2 의 한계는 "보호 상태를 *읽는* 것" 에 관한 것이고, 반대 방향 — **repo 안의 required 목록 선언이 실재하는 job 이름과 일치하는가** — 는 워크플로 YAML 만으로 검사 가능하기 때문이다.

- SSoT: `.github/branch-protection/main.json` (결정 7) 의 `required_status_checks.checks[].context` 배열.
- 가드: 각 context 가 `.github/workflows/**` 의 job id 또는 job `name:` 으로 **실재**하는지 대조. 불일치 시 exit 1.
- 배선: `project-guards` 워크플로 (path 필터 0 — 자기 자신이 required 후보라 항상 돈다).
- fail-fast — fallback 분기 금지 (CLAUDE.md §가드 설계 원칙). 파일 부재는 "배포 시나리오" 가 아니라 가드 삭제 회귀다.

이 가드가 있어야 결정 7 의 JSON 선언이 장식이 아니라 **강제력**을 갖는다. 구현은 §10-3 후속 2 에 포함.

---

## §7 비목표 (이번 범위에서 절대 손대지 않음)

1. `required_approving_review_count` 상향 — 1인 저장소에서 자기 PR 승인이 불가하므로 즉시 교착.
2. `develop` 의 required status check / PR 필수화 — 결정 2 에서 **영구 미채택**.
3. 클래스 A 워크플로의 `paths-ignore` → job 단위 `if:` 전환 — 별건 (§10-3 후속 1).
4. Repository rulesets 전환 — §3-3 기각.
5. `strict: true` (up-to-date 요구) — 결정 1.
6. 외부 앱 체크 (Vercel / GitGuardian) 의 required 화 — 결정 1.
7. 보호 상태의 **CI 자동 검증** — PAT 시크릿이 필요하고 그 자체가 새로운 자격증명 노출.
8. 릴리스 의례 변경 (merge-back PR 도입 등) — §4 (e) 기각.
9. 봇 PR 의 `base` 를 develop 으로 되돌리기 — 결정 4.

---

## §8 적용 절차 (사용자 승인 후 메인이 실행)

> 전부 복붙 가능한 원문. **`REPO` 를 한 번만 export** 하고 나머지는 그대로 붙여 넣는다.
>
> **필수 사전 게이트 (결정 5 의 성립 조건)** — `true` 가 아니면 **어떤 단계도 적용하지 않는다**. admin 권한 없이 required check 를 켜면 §9 롤백이 `403` 으로 실패해 탈출구가 사라진다.
> ```bash
> gh api repos/coseo12/astro-simulator -q '.permissions.admin'   # 기대: true
> ```
> **이 게이트의 정밀도 한계 — 그리고 왜 무해한가**: `.permissions.admin` 은 **사용자의 저장소 역할**을 반환하므로, fine-grained PAT 로 전환해 `Administration` 권한만 빠진 경우에도 `true` 를 반환할 수 있다. 즉 §10-5 재검토 조건 6 이 걱정하는 바로 그 시나리오를 못 잡을 수 있다. **그러나 위험은 구조적으로 자기 제한된다** — GitHub REST 문서상 `PUT .../branches/{b}/protection` (§8-A1) 과 `DELETE .../protection/required_status_checks` (§9-R1) 은 **동일한 admin/owner 권한 클래스**다. 따라서 **A1 이 성공하면 R1 은 반드시 허용된다**: 적용과 롤백 사이에 토큰을 교체하지 않는 한 탈출구를 잃을 수 없다. 게이트의 정밀도 부족이 하드 블록으로 이어지는 경로가 없다. (부수: §2-1 의 `GET .../protection` 성공 자체가 admin 을 요구하므로 `.permissions` 조회보다 강한 신호다.)

```bash
export REPO=coseo12/astro-simulator
```

### P0 — Phase 0 (코드 PR. 설정 변경 없음)

developer 디스패치. 결정 6 의 6-1~6-5. 머지 후 **바로 A1 로 진행**한다.

아래 **게이트 2개**가 **Phase 2 (A3) 의 진입 조건**이다 — 다음 release PR 1건에서 **둘 다 빈 출력**이어야 한다. SHA 를 한 번만 잡아 둔다:

```bash
SHA=$(gh pr view <releasePR> --json headRefOid -q .headRefOid)
```

**G1 — `cancelled` 체크런 0** (Phase 0 의 직접 효과 확인):

```bash
gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  -q '.check_runs[] | select(.conclusion=="cancelled") | .name'
```

**G2 — 동명 체크런의 결론 불일치 0** (§2-11 의 실질 잔여 위험 확인):

```bash
gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
  -q '[.check_runs[] | {name, conclusion}] | group_by(.name)[]
      | select((map(.conclusion) | unique | length) > 1) | .[0].name'
```

> **G1 과 G2 는 직교다 — 어느 쪽도 다른 쪽을 포함하지 않는다.**
> - **G1 만 잡는 것**: 동명 N개가 *전부* `cancelled` 인 경우 — 결론이 일치하므로 G2 는 침묵한다.
> - **G2 만 잡는 것**: **`failure` + `success` 혼재** — flake 발 결론 불일치이며 §10-1 한계 3 이 지목하는 실질 잔여 위험이다. `cancelled` 가 하나도 없으므로 **G1 은 이를 원리적으로 검출하지 못한다.**
>
> **게이트 발화 확인 (negative baseline)**: Phase 0 *이전* 상태인 `c2732ae` 에 G2 를 돌리면 7개 이름이 출력된다 (§2-11 의 `cancelled,success` 7건 + `cancelled,skipped` 1건 = `a11y-baseline-guard` / `detect-and-test` / `long-integration-rust` / `measure` / `retry-fresh-runner` / `verify` / `verify-and-rust`). 게이트가 침묵하는 가드가 아님을 확인한 값이며, **Phase 0 이후 이 출력이 비는 것**이 진입 조건이다.

### A1 — Phase 1 적용 (main: 초 단위 체크 4개)

현재 보호값을 그대로 보존하고 `required_status_checks` 만 추가하는 **전체 PUT** 이다 (부분 PATCH 는 기존 필드를 잃을 수 있다). `app_id: 15368` 은 GitHub Actions — 다른 앱이 동명 체크로 요구를 만족시키는 경로를 막는다.

> **실행 전 준비**: §9-R1 명령 한 줄을 손 닿는 곳 (다른 터미널 탭) 에 띄워 둔다. Phase 1 의 첫 실전은 구조상 어차피 release PR 이므로 (§10-2 조건 3), 오차단이 나는 순간은 **릴리스가 진행 중인 상태**다.

```bash
gh api -X PUT "repos/$REPO/branches/main/protection" --input - <<'JSON'
{
  "required_status_checks": {
    "strict": false,
    "checks": [
      { "context": "project-guards",        "app_id": 15368 },
      { "context": "branch-name",           "app_id": 15368 },
      { "context": "pr-template-checklist", "app_id": 15368 },
      { "context": "label-pr",              "app_id": 15368 }
    ]
  },
  "enforce_admins": true,
  "required_pull_request_reviews": {
    "dismiss_stale_reviews": false,
    "require_code_owner_reviews": false,
    "require_last_push_approval": false,
    "required_approving_review_count": 0
  },
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
```

적용 직후 확인:

```bash
gh api "repos/$REPO/branches/main/protection" \
  -q '{strict: .required_status_checks.strict, contexts: .required_status_checks.contexts, admins: .enforce_admins.enabled, force: .allow_force_pushes.enabled}'
```

### A2 — `develop` 최소 보호 (결정 2)

```bash
gh api -X PUT "repos/$REPO/branches/develop/protection" --input - <<'JSON'
{
  "required_status_checks": null,
  "enforce_admins": true,
  "required_pull_request_reviews": null,
  "restrictions": null,
  "required_linear_history": false,
  "allow_force_pushes": false,
  "allow_deletions": false,
  "block_creations": false,
  "required_conversation_resolution": false,
  "lock_branch": false,
  "allow_fork_syncing": false
}
JSON
```

### A3 — Phase 2 확대 (Phase 0 + Phase 1 관찰 통과 후)

```bash
gh api -X PATCH "repos/$REPO/branches/main/protection/required_status_checks" --input - <<'JSON'
{
  "strict": false,
  "checks": [
    { "context": "project-guards",        "app_id": 15368 },
    { "context": "branch-name",           "app_id": 15368 },
    { "context": "pr-template-checklist", "app_id": 15368 },
    { "context": "label-pr",              "app_id": 15368 },
    { "context": "diff-scope",            "app_id": 15368 },
    { "context": "diff-scope-wasm",       "app_id": 15368 },
    { "context": "detect-and-test",       "app_id": 15368 }
  ]
}
JSON
```

> `diff-scope-wasm` 은 Phase 0 6-2 가 머지·1회 실행된 뒤에만 존재한다. **존재 확인 전 추가 금지** — 없는 컨텍스트를 요구하면 영구 pending 이다.
> ```bash
> gh api "repos/$REPO/commits/develop/check-runs?per_page=100" -q '[.check_runs[].name] | index("diff-scope-wasm")'
> ```
> 출력이 `null` 이 아니어야 한다.

### A4 — Phase 3 확대 (선택)

A3 의 `checks` 배열에 `verify-and-rust` / `long-integration-rust` / `duplicate-function-guard` (전부 `app_id: 15368`) 를 추가해 동일 PATCH.

---

## §9 롤백 절차

각 명령은 **단독으로 완결**되며 사전 상태 조회가 필요 없다. 실행 시간 2~3초.

### R1 — required check 만 제거 (Phase 1/2/3 공통, **1차 대응**)

```bash
gh api -X DELETE "repos/$REPO/branches/main/protection/required_status_checks"
```

보호의 나머지 (PR 필수 / force-push 차단 / enforce_admins) 는 그대로 유지된다. **릴리스가 막혔을 때 최우선으로 이것만 실행**하고, 원인 분석은 릴리스 완료 후에 한다.

검증: `gh api "repos/$REPO/branches/main/protection" -q '.required_status_checks'` → `null`.

### R2 — `develop` 보호 전체 제거 (A2 롤백)

```bash
gh api -X DELETE "repos/$REPO/branches/develop/protection"
```

검증: `gh api "repos/$REPO/branches/develop/protection"` → `404 Branch not protected`.

### R3 — `main` 보호 전체 제거 (**최후 수단**)

R1 로도 머지가 불가할 때만. 실행 후 **반드시 §8-A1 로 재적용**해야 한다 (보호 공백 상태를 방치하면 안 됨).

```bash
gh api -X DELETE "repos/$REPO/branches/main/protection"
```

### R4 — Phase 2/3 → Phase 1 부분 축소

§8-A1 의 `checks` 배열 4개짜리로 §8-A3 형식의 PATCH 재실행.

> **런북 배치**: R1/R2/R3 원문을 `docs/guides/branch-strategy-workflow.md` 의 릴리스 절차 옆에 링크로 노출하는 것이 Phase 1 산출물이다 (결정 5 조건).

---

## §10 결과 / 한계 / 재검토 조건

### 10-1 한계

1. **클래스 A 가드 5종은 required 화 불가** — 실행 시간 상위 4개 중 3개 (`verify` / `measure` / `a11y-baseline-guard`) 가 여기 속한다. 즉 본 정책이 커버하는 것은 "빠르고 항상 도는 가드" 이지 "무거운 시각·성능 회귀 가드" 가 아니다.
2. **`develop` 직접 push 는 기계적으로 막히지 않는다** — 산문 규약과 기계 강제 사이의 격차가 남는다 (결정 2). ff-sync 를 지키기 위한 의도적 선택이다.
3. **동명 체크런은 상존한다 — Phase 0 는 조건을 없애지 않고 완주 쌍을 늘린다** (초판 서술 정정). 초판은 *"Phase 0 이 그 조건을 소멸시켜 회피한다"* 고 썼으나 **실측이 반증했다** (§2-11). `push` + `pull_request` 양 트리거를 가진 required context — `project-guards` / `diff-scope` / `diff-scope-wasm` / `detect-and-test` (+ Phase 3 의 `verify-and-rust` / `long-integration-rust` / `duplicate-function-guard`) — 는 release PR SHA 에서 **항상 동명 2개**를 내고, `project-guards` 는 **Phase 0 이전인 지금 이미 그렇다** (`n=2 success,success`). 동명이 원천적으로 없는 것은 `pull_request` 전용 클래스 B 3개 (`branch-name` / `label-pr` / `pr-template-checklist`) 뿐이다. 나아가 Phase 0 는 `cancelled` 를 완주로 바꾸므로 **완주 동명 쌍을 3 → 7 로 늘린다**.
   - **그럼에도 안전한 이유 (calibration — 이 정정이 공포 조장이 아닌 근거)**: 동명 N개가 **전부 `success` 면 어떤 해석 규칙에서도 통과한다** (latest 채택 / all-must-pass / first 채택 무관). 따라서 위험은 "동명이 여럿" 자체가 아니라 **결론 불일치** 하나로 국한된다. Phase 0 가 실제로 사는 것은 "동명 소멸" 이 아니라 **불일치 확률의 하락**이다 — 100% 재현되던 불일치 원인 (`cancelled`, release PR 6/6) 을 구조적으로 제거한다.
   - **실질 잔여 위험 = flake 발 `failure` + `success` 혼재.** Phase 0 는 flake 를 제거하지 못한다. 본 저장소는 flake 전례를 보유한다 (`verify:699 deltaTime` / r1-guard Playwright / fps 부하 spike — #779 §매핑표에 자체 박제). 무거운 required check 의 **push run 만** flake 로 `failure` 가 되면 GitHub 의 해소 규칙은 미규정이고 (§2-2) 릴리스가 `BLOCKED` 될 수 있다. **이것이 본 정책의 최종 잔여 위험이며 설계로 제거되지 않는다.**
   - **관측 수단**: §8-P0 의 **G2 게이트**가 이 조건을 직접 검사한다 (G1 의 `cancelled` 검사로는 원리적으로 검출 불가). 발생 시 대응은 §9-R1 (2초) 로 required 를 걷어내고 릴리스를 완주시킨 뒤, 재실행으로 결론을 수렴시키는 순서다 — **릴리스를 인질로 잡고 디버깅하지 않는다** (§10-4).
   - **잔존 미검증**: GitHub 의 동명 **해소 규칙 자체**는 여전히 모른다 (§2-8 대로 사전 실증이 불가능하다). 본 정책은 규칙을 알아낸 것이 아니라 **불일치가 잘 일어나지 않게 만들고, 일어나면 잡히게** 한 것이다.
4. **`branch-name` 의 소급 근거는 `n=1`** (#974) — release PR 에서의 보고 안정성 표본이 1건이다.
5. **보호 상태 드리프트를 CI 가 감시하지 못한다** — 사람이 스크립트를 돌려야 한다 (§3-2). 반대 방향 (선언 ↔ job 이름 실재) 은 결정 8 이 CI 로 닫는다. 실행 절차는 §10-3 후속 2 에서 릴리스 런북 체크리스트로 편입한다 (cross-validate 보완 제안 ① 수용).
6. **가드가 없던 시절 열린 PR 을 reopen 하면 영구 pending 이 될 수 있다** — `branch-name` 은 `types: [opened, synchronize]` 라 reopen 으로 재실행되지 않는다 (#962 ADR §5-2 의 **의도된** 설계). 현재 열린 PR 이 0건이라 노출은 없으나, 장수 PR 이 생기면 해당된다. **완화**: 빈 커밋 1개 push (`git commit --allow-empty` → `synchronize` 발화) 또는 Actions UI 재실행. required check 를 켠 뒤에는 이 절차를 알고 있어야 한다.
   - **복구 경로는 체크마다 다르다 (비대칭)** — `types` 에 `edited` 를 가진 것은 `pr-template-checklist` (`[opened, edited, synchronize]`) **하나뿐**이라 **PR 본문 수정만으로 즉시 재실행**되어 초 단위로 복구된다. 반면 `branch-name` (`[opened, synchronize]`) 과 `label-pr` (`[opened, synchronize, ready_for_review]`) 은 본문 편집으로 재실행되지 않아 **빈 커밋 또는 Actions 재실행**이 필요하다. 릴리스 중 대응 속도가 갈리는 지점이므로 "어느 체크가 막혔는가" 를 먼저 확인해야 한다.
7. **GitHub Actions 장애 시 릴리스가 멈춘다** — 체크가 보고되지 않으면 required 는 pending 이다. 대응은 §9-R1 (2초) 후 릴리스 완주.
8. **fork PR 이 `main` 을 대상으로 하면 차단된다** — `label-pr` 은 `pull-requests: write` 가 필요한데 fork PR 의 `GITHUB_TOKEN` 은 read-only 라 실패한다. 단 **본 정책의 영향은 0** 이다: fork PR 은 `develop` 을 대상으로 하고 develop 에는 required check 가 없다 (결정 2). `main` 은 release/hotfix 전용이라 fork PR 이 도달할 경로가 정책상 존재하지 않으며, 도달한다면 차단이 옳은 동작이다.
9. **hotfix 경로는 실측 표본이 0건이다** — 정적으로는 통과한다 (`hotfix` 는 `branch-name` 허용 type, base=main 이라 클래스 B/C 전부 트리거). 그러나 소급 대조에 쓸 실제 hotfix PR 이 없다 → §10-4 단계 4 에서 확인.

### 10-2 Accepted 전이 조건

아래 **전건** 충족 시 상태를 `Accepted` 로 갱신한다.

1. 사용자가 §8 적용을 승인.
2. Phase 0 머지 + release PR 1건에서 §8-P0 의 **G1 (`cancelled` 0) 과 G2 (동명 결론 불일치 0) 동시** 실측.
3. Phase 1 적용 후 **release PR 1건** (+ 가능하면 hotfix PR 1건 — §10-1 한계 9) 에서 오차단 0 실증 (§10-4 판정 기준). ⚠️ **일상 PR 은 검증력이 0 이라 조건에서 제외한다** — 일상 개발 PR 은 `base=develop` 이고 develop 에는 required check 를 영구 미채택하므로 (결정 2) **main 의 required check 를 한 번도 통과하지 않는다**. *"일상 PR 이 통과했으니 안전"* 은 거짓 확신이다. `main` 을 대상으로 하는 PR 은 release PR 과 hotfix PR 뿐이며, 그래서 Phase 1 의 첫 실전은 어차피 release PR 이다.
4. §9 롤백 명령이 릴리스 런북에 링크됨.

### 10-3 후속 이슈 (분리 필요 — 본 ADR 범위 밖)

1. **클래스 A 가드의 required 화 경로** — `paths-ignore` (workflow 단위) 를 `dorny/paths-filter` 등 job 단위 게이트로 전환하면 스킵이 `skipped` = 통과로 보고돼 required 화가 가능해진다. 다만 이는 5개 워크플로의 트리거 재설계라 별건.
2. **선언적 관리 구현 + 이름 정적 가드** — `.github/branch-protection/*.json` + `apply`/`verify` 스크립트 2종 (결정 7) + **결정 8 의 context↔job 이름 대조 가드** (`project-guards` 배선). 릴리스 런북 (`docs/guides/branch-strategy-workflow.md`) 에 `verify` 수동 실행 체크리스트 항목 추가 포함.
3. **봇 PR base 정책** — 봇 PR 을 develop 대상으로 되돌릴 필요가 생기면 `GITHUB_TOKEN` 워크플로 트리거를 먼저 실증 (결정 4).
4. **작업 토큰 권한 분리 검토** (cross-validate 고유 발견) — 일상 에이전트 토큰에서 `Administration` 권한을 제거하고 비상용 admin 토큰을 분리하면 보호의 실효 강제력이 오른다. 단 §9 롤백이 "토큰 교체" 를 거치게 되어 **탈출 경로가 2초에서 수 분으로 늘어난다** — 강제력 ↔ 복구 속도의 정면 교환이라 별도 결정이 필요하다. 본 ADR 은 현 토큰 상태를 전제로만 유효하다 (§10-5 재검토 조건 6).

### 10-4 릴리스 리허설 계획 — "오차단 0" 판정 기준

> **설계 단계에서 실행하지 않는다.** 아래는 절차 정의다.

**단계 1 — 소급 리허설 (무위험, §2-6 에서 이미 수행 완료)**
최근 release PR 6건 × 후보 9개 전수 대조. 결과: Phase 1 후보 4개는 cancel 0 / 부재 0 (`branch-name` 은 존재 1건 기준). 무거운 3개는 cancel 6/6 → Phase 0 필요성의 근거.

**단계 2 — push 의미론 리허설 (일회용 브랜치. `main`/`develop` 무접촉)**
`develop` 최소 보호(§8-A2)가 ff-sync 를 막지 않음을 **실제 push 로** 확인한다. 대조군으로 required check 를 건 변형이 직접 push 를 거부하는 것까지 확인해 §4 (c) 기각 근거를 실증한다.

```bash
export REPO=coseo12/astro-simulator
git push origin origin/develop:refs/heads/chore/971-protection-probe     # 일회용 브랜치 생성

# (1) 최소 보호 적용 — §8-A2 와 동일 payload, 대상만 probe 브랜치
gh api -X PUT "repos/$REPO/branches/chore%2F971-protection-probe/protection" --input - <<'JSON'
{ "required_status_checks": null, "enforce_admins": true, "required_pull_request_reviews": null,
  "restrictions": null, "required_linear_history": false, "allow_force_pushes": false,
  "allow_deletions": false, "block_creations": false, "required_conversation_resolution": false,
  "lock_branch": false, "allow_fork_syncing": false }
JSON

# (2) ff push 시도 — 통과해야 정상 (main tip 은 develop tip 의 후손)
git push origin origin/main:refs/heads/chore/971-protection-probe        # 기대: 성공

# (3) force push 시도 — 거부돼야 정상
git push --force origin origin/develop:refs/heads/chore/971-protection-probe   # 기대: 거부

# (4) 대조군 — required check 를 걸면 직접 push 가 거부되는가 (§4 (c) 실증)
gh api -X PATCH "repos/$REPO/branches/chore%2F971-protection-probe/protection/required_status_checks" \
  --input - <<'JSON'
{ "strict": false, "checks": [ { "context": "branch-name", "app_id": 15368 } ] }
JSON
git push origin origin/develop:refs/heads/chore/971-protection-probe     # 기대: 거부 (branch-name 은 push 커밋에 미보고)

# (5) 정리 — 규칙 먼저, 브랜치 나중
gh api -X DELETE "repos/$REPO/branches/chore%2F971-protection-probe/protection"
git push origin --delete chore/971-protection-probe
```

> probe 브랜치명은 `chore/971-protection-probe` — `branch-name` 가드의 허용 집합 (`<type>/<이슈번호>-<설명>`) 을 만족시켜 리허설 자체가 규약을 위반하지 않게 한다.
> **required check 의 "동명 cancelled 쌍둥이" 거동은 이 리허설로 재현할 수 없다** (§2-8: 임의 conclusion 체크런 합성은 GitHub App 토큰 전용). 그래서 Phase 0 로 조건 자체를 없앤다.

**단계 3 — Phase 1 적용 직후 라이브 관찰**

대상은 **release PR 또는 hotfix PR** 이다 (일상 PR 은 `base=develop` 이라 main 의 required check 를 통과하지 않는다 — §10-2 조건 3).

```bash
gh pr view <release 또는 hotfix PR> --json mergeable,mergeStateStatus,statusCheckRollup \
  -q '{mergeable, state: .mergeStateStatus, required: [.statusCheckRollup[] | {name, conclusion}]}'
```

**오차단 0 판정 기준** (전건 충족):
- `mergeStateStatus` 가 **`BLOCKED` 이 아님** (`CLEAN` 또는 `UNSTABLE` — `UNSTABLE` 은 비-required 체크 실패라 머지 가능).
- required 4개 컨텍스트가 전부 `SUCCESS` 또는 `SKIPPED`.
- release PR 에서 §8-P0 **G1 + G2 가 동시에 빈 출력** (`cancelled` 0 **그리고** 동명 결론 불일치 0).
- ff-sync `git push origin main:develop` 가 거부 없이 완료.

**단계 4 — hotfix 경로 정적 확인 (§10-1 한계 9)**
hotfix PR 은 실측 표본이 0건이다. Phase 1 적용 후 **hotfix 가 실제로 필요해지는 시점 이전에** 아래로 확인한다 — 긴급 상황에서 처음 마주치면 안 된다.

```bash
node scripts/verify-branch-name.mjs --branch hotfix/999-probe    # 기대: 통과 (허용 type)
# 클래스 B/C 워크플로가 base=main PR 에서 트리거되는지: on.pull_request.branches 에 main 포함 확인
grep -A3 "^on:" .github/workflows/harness-pr-review.yml .github/workflows/pr-template-checklist-guard.yml \
  .github/workflows/project-guards.yml .github/workflows/ci.yml | grep -c "main"
```

**미달 시**: 즉시 §9-R1 실행 → 릴리스 완주 → 원인 분석 후 재설계. **릴리스를 인질로 잡고 디버깅하지 않는다.**

### 10-5 재검토 조건

1. 릴리스 1회라도 오차단 발생 → Phase 후퇴 + 본 ADR Amendment.
2. 클래스 A 후속 (§10-3 후속 1) 완료 → required 집합 확대 재검토.
3. GitHub 이 동명 체크런 해석 규칙을 문서화 → §2-8 의 회피 구조 재검토.
4. 저장소가 organization 소유로 이전 → ruleset `enforcement: evaluate` 사용 가능해지므로 §3-3 기각 재검토.
5. 봇 PR 의 base 가 develop 으로 환원 → 결정 4 재검토.
6. **작업 토큰이 저장소 admin 권한을 잃음** (fine-grained PAT 전환 등) → 결정 5 의 전제가 깨지므로 **required check 를 즉시 §9-R1 로 내리고** 재설계. 판정 1줄: `gh api repos/coseo12/astro-simulator -q '.permissions.admin'`.
7. 저장소가 organization 으로 이전 → classic `restrictions` (push allowance) 가 사용 가능해져 §11 기각-5 의 전제가 바뀐다. develop 직접 push 의 기계적 강제가 릴리스 의례를 깨지 않고 가능해지므로 결정 2 재검토.

---

## §11 교차검증 반영 사항

> 수행: architect, 2026-08-07. **2회 호출**.
> 1차: `cross_validate.sh architecture docs/decisions/20260807-971-required-status-checks.md` — outcome `applied` (exit 0) / `plan_bypass: false` / `rollback_failed: false` / `reminder_issue: none`. 로그: `.claude/logs/cross-validate-architecture-20260807-130621.log`
> 2차: 1차가 전 항목 5/5 동의로 수렴해 반증 산출이 0이었다. `cross_validate.sh` 는 프롬프트가 고정이라 편향 셀프 체크 질문을 주입할 수 없으므로, 스킬 문서가 명시한 **직접 호출 경로** (`agy -p`, L1 strict prefix 수동 포함) 로 **반증 전용 프롬프트** 를 재호출했다. L3 등가 검증: 호출 전후 `git status --porcelain` 동일 (워킹트리 변경 0).

### 합의

외부 모델이 독립적으로 지지 — 추가 변경 없음.

1. **클래스 A required 금지** — workflow 단위 path 스킵이 영구 pending 을 만든다는 §2-3 판정.
2. **Phase 0 (`github.ref` 추가)** — 교차 취소의 구조적 원인 규명과 해법.
3. **`develop` required check 미채택** — fast-forward 릴리스 전략과의 호환이 상위라는 §4 판정.
4. **Rulesets 기각** — User 소유라 `evaluate` 미지원 + bypass actor 무력화.
5. **Probot Settings App 기각** — 서드파티 `administration: write` 상시 부여 회피.
6. **`app_id: 15368` 명시** — 외부 앱의 동명 체크런 주입 차단.

### 이견 수용

| # | 원안 | 수정안 | 수용 근거 |
|---|---|---|---|
| 1 | Phase 0→1→2 각 단계마다 release PR 1회 관찰 (릴리스 3주기) | **관찰 게이트를 Phase 2 앞에만** 배치. Phase 0 머지 직후 Phase 1 적용 | 위험이 균등하지 않다. cancelled 쌍둥이 6/6 은 **Phase 2 대상 3개에만** 관측됐고 Phase 1 후보 4개는 cancel 0 + 롤백 2초다. 관찰 비용을 위험이 있는 곳에만 지출하는 것이 옳다 (결정 1 표) |
| 2 | 결정 5 논거 = "DELETE 한 줄이 탈출구" | **감사 궤적 논거 추가** — `false` 의 우회 머지는 무흔적, `true` + DELETE 는 기록이 남는다. 즉 `true` 는 탈출을 **관찰 가능하게** 만든다 | 같은 결론의 더 강한 근거. 단 개인 계정은 org audit log 가 아닌 security log 범위임을 calibration 으로 명시 |
| 3 | 결정 5 의 토큰 전제 암묵 | **전제 명시 + §8 필수 사전 게이트** (`.permissions.admin == true`) + §10-5 재검토 조건 6 신설 | fine-grained PAT 로 `Administration` 이 빠지면 §9-R1 이 403 → **탈출구가 실제로 사라진다**. 원안은 현 토큰 상태에 암묵 의존하고 있었다 |
| 4 | job 이름 변경 시 영구 `Expected` 위험에 대한 가드 없음 (§8-A3 의 `diff-scope-wasm` 존재 확인 1건뿐) | **결정 8 신설** — in-repo required 목록 선언 ↔ `.github/workflows/**` job 이름 정적 대조 가드, `project-guards` 배선 | 본 ADR 최대 수확. §3-2 의 "CI 는 admin 권한이 없어 검증 불가" 한계는 *보호 상태를 읽는* 방향에만 적용된다. **반대 방향은 YAML 만으로 검사 가능**하다는 것을 놓치고 있었다 — 결정 7 의 JSON 선언에 강제력을 부여한다 |
| 5 | reopen/draft·GHA 장애·fork PR·hotfix 경로 미기술 | **§10-1 한계 6~9 신설** + §10-4 단계 4 (hotfix 정적 확인) | 각각 실재하는 경로다. 특히 한계 6 (reopen 시 `branch-name` 미재실행 → 영구 pending) 은 #962 §5-2 의 **의도된** 설계와 required check 가 충돌하는 지점이라 완화 절차 (빈 커밋) 를 알고 있어야 한다 |

### Claude 재분석으로 기각한 외부 모델 제안

| # | 제안 | 기각 근거 |
|---|---|---|
| 1 | "과거 release PR 의 check-runs 를 정적 조회하면 100% 검증되므로 **Phase 0/1/2 를 단일 적용으로 통합**하라" | 과거 데이터가 증명하는 것은 **컨텍스트의 존재**뿐이다. 미지수는 "cancelled 쌍둥이가 있을 때 GitHub 이 required 를 어떻게 판정하는가" 이고, **required check 가 없던 시절의 데이터로는 원리적으로 알 수 없다** (§2-8). Phase 2 앞 관찰 게이트는 유지 — 부분 수용에 그친다 |
| 2 | "`branch-name` 이 release PR 의 head=`develop` 에서 실패·스킵할 수 있다" | **실측 반증.** #974 (head=develop) 에서 `branch-name` = `success`. 정본 상수 `GITFLOW_HEADS = ['develop', 'main']` 이 허용 집합 1행이다. 외부 모델이 문서만 보고 추정한 오류 |
| 3 | "모든 PR 워크플로의 `types` 에 `[opened, synchronize, reopened, ready_for_review]` 를 필수 명시하라" | **#962 ADR §5-2 를 되돌리는 제안.** `reopened` 제외는 실수가 아니라 "과거 PR reopen 이라는 유일한 잔여 노출을 닫는" 명시적 결정이었다. 무비판 수용 시 그 구멍이 재개방된다. 잔여 위험 (한계 6) 은 가드를 약화하는 대신 **완화 절차 박제**로 처리 |
| 4 | "required 대상 워크플로에서 workflow 단위 `paths`/`paths-ignore` 를 전면 제거하라" | 방향은 옳으나 **본 ADR 범위 밖**이다. 이미 §10-3 후속 1 로 분리돼 있다 (5개 워크플로 트리거 재설계). 정책 도입 PR 에 끼워 넣으면 오차단 원인 분리가 불가능해진다 |
| 5 | "**`develop` 에 push allowance (직접 push 제한) 를 걸고 릴리스 주체만 bypass 로 등록**하면 의례 변경 없이 100% 기계적 강제가 가능하다 — 설계안의 '강제 0' 주장은 허위 대립이다" | **두 축 모두 본 저장소에서 불성립.** (a) classic branch protection 의 `restrictions` (push allowance) 는 **organization 소유 저장소 전용**이다 (GitHub Docs). 본 저장소는 `owner.type: User` — 현재 보호 응답에 `restrictions` 키가 아예 없는 것과 정합한다. (b) rulesets 로 우회하려 해도 지정 가능한 bypass actor 는 사실상 repository admin = **사용자 본인 = 에이전트가 쓰는 동일 토큰**이라, 릴리스 스크립트와 일상 push 를 구분할 신원이 존재하지 않는다 (§3-3 결함 2). 별도 릴리스 봇 신원을 만들면 성립하나 그것은 §10-3 후속 4 의 토큰 분리 결정에 종속된다. 다만 지적 자체는 **조건부로 옳으므로** §10-5 재검토 조건 7 (org 이전 시) 로 박제 |
| 6 | "fork PR 이 secret 부재로 실패해 릴리스가 블록된다" | fork PR 은 `develop` 을 대상으로 하고 **develop 에는 required check 가 없다** (결정 2). `main` 은 release/hotfix 전용이라 fork PR 이 도달할 정책 경로가 없다. 영향 0 — 근거는 §10-1 한계 8 에 명시 |

### 고유 발견 (후속 분리)

1. **작업 토큰 권한 분리** — 일상 에이전트 토큰에서 `Administration` 을 제거하고 비상용 admin 토큰을 분리. 강제력은 오르지만 §9 롤백이 2초 → 수 분으로 늘어나는 **정면 교환**이라 별도 결정이 필요하다 → §10-3 후속 4.
2. **릴리스 런북에 보호 상태 수동 검증 체크리스트** (1차 호출 보완 제안 ①) → §10-3 후속 2 에 편입.

### 호출 전 Claude 편향 셀프 체크 (architect, 2026-08-07)

| 축 | 판정 | 조치 |
|---|---|---|
| 낙관적 일정 | **미통과** — 3단계 × release 주기 = 3주 소요를 ADR 이 정량화하지 않았다 | 2차 호출 Q1 로 명시 질문 삽입 → 이견 수용 1 (관찰 게이트 1개 제거) |
| 결합 간과 | **미통과** — 선행 ADR 20260701-779 (concurrency) 와의 결합을 초안 작성 후 자체 점검에서야 발견 | §2-10 신설 + 2차 호출 Q4 로 잔여 결합 질문 → 이견 수용 4·5 |
| 폐기 프레이밍 | 통과 — rulesets / settings.yml 기각이 전부 문서·실측 근거 기반이며, 외부 반박 (Q5) 도 문서로 재검증 후 기각 | — |
| 순수주의 | **미통과** — "가정에 의존 금지" 를 이유로 Phase 0 를 release 관찰 게이트로 승격한 것이 과잉일 가능성 | 2차 호출 Q2 로 명시 질문 삽입 → Phase 0 는 선행 유지하되 **release 대기 게이트에서 같은 세션 선행으로 완화** |
