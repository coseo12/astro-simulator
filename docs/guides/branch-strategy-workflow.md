# 브랜치 전략 워크플로 (gitflow) 상세

> CLAUDE.md `## 브랜치 전략 (classic gitflow)` 의 워크플로 3단계 + drift 감지 가지치기 위임 (이슈 #266 / PR #287). CLAUDE.md 본문은 브랜치 표 + 1줄 포인터만 유지 (각인층 원칙).

## 워크플로 3단계

### 1. 일상 개발

```
<type>/123-xxx    (develop 에서 분기. 예: feature/942-…, docs/953-…)
   ↓ PR (base=develop)
develop
```

### 2. 릴리스 (MAJOR/MINOR/PATCH 공통)

> 🔴 **릴리스가 required check 로 막히면** → [§required status check 롤백](#required-status-check-롤백-릴리스가-막혔을-때--971) (R1 한 줄, 약 2초)

```
develop   (충분히 쌓이면)
   ↓ 단일 release PR (base=main, head=develop)
   ↓ merge commit 방식으로 머지 — gh pr merge <PR> --merge
main   (merge commit 이 develop tip 을 부모로 포함)
   ↓ git push origin main:develop   (fast-forward, force 아님)
develop  (main tip 과 완전 동기화)
   ↓ git tag vX.Y.Z + gh release create
```

- release PR 본문에 CHANGELOG 범위, Behavior Changes, 태그 계획 명시
- **release PR 은 반드시 `--merge` (merge commit) 방식으로 머지** — `--squash` 금지. squash 로 머지하면 main 에 새 커밋이 생겨 develop 과 diverge 하며 매 릴리스마다 merge-back PR 이 강제된다. merge commit 은 main tip 이 develop tip 을 직계 조상으로 포함하게 하여 **merge-back 이 불필요**해진다. 결정 근거: [ADR 20260419-release-merge-strategy](../decisions/20260419-release-merge-strategy.md)
- **merge commit 직후 `git push origin main:develop` (fast-forward) 필수** — main 의 merge commit 자체가 develop 에 없으므로 doctor 가 일시적으로 warn (main 이 1 커밋 앞섬). fast-forward push 로 즉시 해소. force-push 가 아니며 (main 이 develop 의 후손), CRITICAL #5 해당 없음
- **dual PR 재발 방지**: 일상 개발 PR 은 `base=main` 을 사용하지 않는다 (PR 템플릿 가드)

### 3. 핫픽스 (prod 이슈)

```
hotfix/99-critical   (main 에서 분기)
   ↓ PR (base=main, squash 또는 merge commit 가능)
main   ← 머지 + 태그 vX.Y.Z+1
   ↓ 즉시 merge-back PR (base=develop, head=main)
develop   ← 동기화 유지 (누락 시 drift)
```

- hotfix 는 release 경로를 우회하므로 main 이 develop 보다 앞서게 되어 **merge-back 필수**. 이 경우만 merge-back PR 로 develop 을 동기화
- merge commit 으로 release 를 해온 정상 운영에서는 hotfix 빈도가 적으므로 merge-back 오버헤드도 최소

## drift 감지

- `git fetch origin` 후 `git merge-base --is-ancestor origin/develop origin/main` + `git rev-list --count origin/main..origin/develop` 로 `origin/main` vs `origin/develop` 커밋 격차를 직접 점검한다 (#907 디커플 이후 도구 아닌 git 직접 명령 — CLAUDE.md §drift 감지와 동일 절차)
- **정상 (pass)**:
  - 동일 커밋 — 릴리스 직후 또는 초기 상태
  - `develop > main` — 다음 릴리스 대기 (정상)
  - `main > develop` 이지만 `git merge-base --is-ancestor develop main` 가 참 — **fast-forward 동기화 대기 중** (release PR merge commit 직후 정상 상태. `git push origin main:develop` 로 해소)
- **경고 (warn)**:
  - `hotfix/*` 브랜치 존재 + `main > develop` — hotfix 진행 중 (머지 후 merge-back PR 필요)
  - develop 이 main 의 조상이 아닌 채 `main > develop` — hotfix merge-back 누락 또는 release PR 을 실수로 `--squash` 로 머지한 가능성. `git show main --format=%P | wc -w` 로 merge commit 여부 확인 (2 이면 merge commit, 1 이면 squash)
  - `git rev-list` 실패 (unrelated histories 등) — `git merge-base origin/main origin/develop` 로 공통 조상 확인

## 브랜치명 가드 (#962 축 B)

브랜치명 규약의 **정본은 `scripts/verify-branch-name.mjs` 의 상수**다. 산문 (CLAUDE.md §브랜치 전략 표 / PR 템플릿 / `developer.md` / `create-pr` 스킬) 은 그 파생이며, `--verify-ssot` 가 drift 를 정적으로 차단한다. 결정 배경: [ADR 20260806-962-branch-name-guard](../decisions/20260806-962-branch-name-guard.md).

### 허용 집합

| # | 형태 | 예 | 비고 |
|---|---|---|---|
| 1 | `develop` / `main` | — | release PR / hotfix merge-back 의 **head** |
| 2 | `<type>/<이슈번호>-<설명>` | `feature/962-branch-name-guard` | type = `feature` `fix` `refactor` `chore` `docs` `test` `hotfix`. 이슈번호·설명 **둘 다 필수**, 소문자 전용, 슬래시 1개 |
| 3 | `release/v?X.Y.Z-prep` | `release/0.60.0-prep`, `release/v0.53.0-prep` | `v` 유무 **양쪽 허용** (표기가 실제로 진동 중 — ADR §2-3). `-prep` 은 필수 |
| 4 | `chore/<봇패턴>-<run_id>` | `chore/r1-baseline-linux-30725438161` | 봇 전용. CI run 이 만들어 이슈번호가 **구조적으로 부재** |

> 이 표는 `node scripts/verify-branch-name.mjs --verify-ssot` 가 **기계 대조**한다 — 각 행의 예시를 런타임 판정기로 분류하고 2행의 type 열거를 정본 상수와 양방향 대조하므로, 표만 고치면 CI 가 차단한다. **정본(스크립트 상수)을 먼저 고치고 표를 맞추는** 순서로 편집할 것.

**가장 흔한 오류**: 커밋 type 은 `feat` 이지만 브랜치 type 은 `feature` 다 (#942). `feat/962-x` 는 차단된다.

`architect/*` · `dev/*` 는 #942 가 폐기한 접두사라 차단된다 (과거 이력 13건은 소급 정리하지 않는다 — rerun 은 트리거 SHA 의 workflow 정의를 재생하므로 신규 가드가 과거 run 에서 실행될 경로 자체가 없다, ADR §2-6).

### 로컬 pre-flight (권장 — 실질적 방어선)

브랜치명은 PR 생성 후 변경 불가라, CI 가 잡으면 **브랜치·PR 재생성**이 유일한 교정 경로다 (~3분). 따라서 push 전에 확인하는 편이 항상 싸다.

```bash
node scripts/verify-branch-name.mjs              # 현재 브랜치 검사
node scripts/verify-branch-name.mjs --branch feature/962-x   # 임의 이름 검사
```

종료 코드: `0` 적합 / `1` 규약 위반 / `2` 실행 에러 / `3` detached HEAD (**위반 아님** — 검사할 브랜치가 없음).

### CI 배선

| 검사 | workflow | 선결 조건 |
|---|---|---|
| 런타임 브랜치명 (`--branch`) | `branch-name-guard.yml` (`pull_request` 전용) | 이벤트 페이로드의 `head.ref` |
| SSoT drift (`--verify-ssot`) + `--self-test` | `project-guards.yml` | 체크아웃된 파일 (이벤트 무관) |

두 검사의 선결 조건이 달라 배선도 갈라진다. 봇 PR 은 `if: github.actor != 'github-actions[bot]'` 로 **통째 스킵하지 않는다** — 그것은 한 클래스 전체의 silent skip 이라 3번째 봇 workflow 가 임의 브랜치명을 써도 아무도 모른다. 패턴을 허용 집합에 명시해 두면 신규 패턴 등장 시 가드가 FAIL 하며 의식적 갱신을 강제한다.

### 한계 — **해소됨** (2026-08-08, 구 기록 회수)

> 본 절은 *"`main` 에 `required_status_checks` 부재 → 붉은 X 는 뜨지만 머지를 막지 못한다"* 고 적고 있었다. **더 이상 참이 아니다.** [#971](https://github.com/coseo12/astro-simulator/issues/971) Phase 1 이 적용돼 `branch-name` 은 `main` 의 **required status check** 이며 `enforce_admins: true` 다 (실측 2026-08-12 `GET /branches/main/protection` → `contexts: ["project-guards", "branch-name", "label-pr"]`). 아래 §required status check 롤백 절이 그 전제 위에 서 있으므로, 구 서술을 남겨두면 같은 문서가 자기모순이었다. 회수 근거: [#970](https://github.com/coseo12/astro-simulator/issues/970).

`main` 대상 PR 에서 본 가드는 **머지를 기계적으로 막는다**. 우회로는 `enforce_admins: true` 때문에 admin 에게도 없으며, 탈출구는 아래 §required status check 롤백 의 R1 한 줄뿐이다. 반면 **`develop` 은 보호 자체가 없으므로** (`GET /branches/develop/protection` → 404, [ADR 20260807-971](../decisions/20260807-971-required-status-checks.md) 결정 2 로 **영구 미채택**) 일상 개발 PR 에서는 여전히 붉은 X 에 그친다. 즉 강제력의 실효 범위는 **release / hotfix PR** 이다.

## base 선택 규칙 가드 (#970 — 축 B 후속 F1)

브랜치명 가드가 CLAUDE.md §금지 사항의 **브랜치 *명명*** 절반을 강제했다면, 본 가드는 나머지 절반인 **base *선택***을 강제한다 — *"`<type>/*`·`release/*-prep` PR 의 `base=main` 금지"*. 정본은 `scripts/verify-pr-base-rule.mjs` 의 `BASE_RULES` 매트릭스이며, 아래 표는 `--verify-ssot` 가 기계 대조하는 **파생**이다. 결정 배경: [ADR 20260812-970-pr-base-rule-guard](../decisions/20260812-970-pr-base-rule-guard.md).

### base 선택 규칙

| # | base | 허용 head | 예 (head → base) | 비고 |
|---|---|---|---|---|
| 1 | `develop` | 일상 개발 / 릴리스 준비 / 봇 / `main` | `feature/970-pr-base-rule-guard` → `develop` | `main` 은 hotfix **merge-back** 의 head |
| 2 | `main` | `develop` / `hotfix/*` | `develop` → `main` | release PR / prod 긴급 패치 **전용** |
| 3 | `<type>/*` | **봇 전용** | `chore/r1-baseline-linux-30725438161` → `fix/887-css-reset-layer` | `r1-baseline-bootstrap` 의 `workflow_dispatch` 입력이 원 작업 브랜치를 base 로 지정한다. **사람 stacked PR 은 금지** |

> 이 표는 `node scripts/verify-pr-base-rule.mjs --verify-ssot` 가 **양방향 대조**한다 — 각 행의 예시를 런타임 판정기(`classifyPair`)에 그대로 돌리고, `BASE_RULES` 의 모든 키가 표에 정확히 한 행씩 등장하는지도 함께 본다. **정본(스크립트 상수)을 먼저 고치고 표를 맞추는** 순서로 편집할 것.

**가장 흔한 오류**: 일상 개발 PR 을 `base=main` 으로 여는 것 (#942 gitflow 이전의 dual PR 관행). 교정 비용은 브랜치명 위반보다 훨씬 싸다 — **PR 재생성 없이 GitHub UI 의 base 드롭다운만 바꾸면 된다.**

### 판정 3종과 관할 분리

base 규칙은 브랜치 *이름의 적합성* 이 아니라 *종류*(shape)를 본다. 그래서 `fix/webgl-fallback` (이슈번호 없음) 은 브랜치명 가드가 FAIL 시키더라도 base 판정에서는 `work` shape 로 통과한다 — **중복 재판을 피하고 교정 지시를 한 갈래로 유지**하기 위함이다.

| 판정 | 종료 코드 | 의미 | 교정 |
|---|---|---|---|
| `pass` | 0 | 허용 셀 | — |
| `violation` | 1 | base 선택이 틀렸다 | PR 의 base 를 바꾼다 |
| `unresolved` | 1 | head shape 불명 + `base=develop` | **head 이름**을 고친다 (관할: 브랜치명 가드). base 는 정정할 것이 없다 |

`unresolved` 는 fallback 이 **아니다** — 통과로 흘리지 않으며(종료 코드 1) 다른 것은 귀속과 교정 지시뿐이다. 귀속 기준은 *"무엇을 고쳐야 통과하는가"* 다: `base=main` + shape 불명은 head 를 어떻게 고쳐도 통과하지 못하므로 `violation` 확정이고 (main 의 허용 head 는 `develop` 리터럴 · `hotfix/` 접두사 둘뿐이라 이름 규약과 무관하게 판정된다), `base=develop` + shape 불명은 이름만 고치면 통과하므로 `unresolved` 다.

### 실측 (머지 PR 594 전수, 2026-08-12)

```bash
gh pr list --state merged --limit 3000 --json number,headRefName,baseRefName,mergedAt,author > /tmp/corpus.json
node scripts/verify-pr-base-rule.mjs --check-corpus /tmp/corpus.json
```

| 항목 | 값 |
|---|---|
| 전체 | 594 |
| PASS | 496 |
| **base 규칙 위반** | **85** — 전부 `2026-04-14 ~ 2026-04-19` (dual PR 시대) |
| 판정 보류 | 13 — `architect/*`·`dev/*` 폐기 접두사, 전부 `2026-05-04 ~ 2026-05-29` |
| 마지막 위반 이후 | **472 PR 연속 위반 0** |

즉 본 가드는 실사용 괴리를 해소하는 것이 아니라 **회귀를 방지**한다 (축 B 가 "24.1% 괴리 해소" 였던 것과 성격이 다르다).

### 로컬 pre-flight

base 는 로컬 상태에서 도출할 수 없으므로 **추측하지 않는다** (인자 없는 호출은 exit 2). PR 을 열기 전 의도한 base 를 직접 넣어 확인한다.

```bash
node scripts/verify-pr-base-rule.mjs --pr base=develop head="$(git branch --show-current)"
```

인자는 **라벨 필수**다 (`--pr <base> <head>` 같은 위치 인자는 거부). 순서를 뒤바꾸면 `develop→main`(release PR)과 `main→develop`(merge-back)이 **둘 다 허용 셀**이라 스왑이 아무 흔적도 남기지 않기 때문이다 — 최고 위험 경로에서 정확히 조용한 오답이 된다.

### CI 배선

| 검사 | workflow | job | 선결 조건 |
|---|---|---|---|
| 런타임 base × head (`--pr`) | `branch-name-guard.yml` | `branch-name` (**main 의 required check**) | 이벤트 페이로드의 `base.ref` · `head.ref` |
| SSoT drift (`--verify-ssot`) + `--self-test` | `project-guards.yml` | `project-guards` | 체크아웃된 파일 (이벤트 무관) |

런타임 검사는 브랜치명 스텝 **뒤에** 둔다. `unresolved` 는 head 이름 위반에서 파생되므로 브랜치명이 먼저 판정돼야 진단이 정확하고, 실제로는 그 스텝이 먼저 실패해 base 스텝이 실행되지 않는다 (`unresolved` 는 CI 에서 구조적으로 도달 불가 — 그럼에도 fail-closed 로 구현한다).

⚠️ **폭발 반경**: 같은 job 에 넣는다는 것은 본 가드가 `main` 의 required check 강제력을 **상속**한다는 뜻이다. 오차단이 나면 릴리스가 하드 블록되고 `enforce_admins: true` 라 우회로가 없다. 그래서 릴리스·핫픽스 4셀(`develop→main` / `main→develop` / `hotfix/*→main` / `release/*-prep→develop`)은 `--self-test` 픽스처 **맨 앞에 불변식으로 고정**돼 있다. 막혔을 때의 탈출구는 아래 §required status check 롤백 R1.

## required status check 롤백 (릴리스가 막혔을 때 — #971)

> **적용 여부부터 확인** — 아래는 `main` 에 required status check 가 **적용된 뒤에만** 의미가 있다.
>
> ```bash
> REPO=coseo12/astro-simulator
> gh api "repos/$REPO/branches/main/protection" -q '.required_status_checks | tojson'
> # null  = 미적용 (현재 상태)    /    {...} = 적용 중
> ```
>
> ⚠️ `| tojson` **필수**. `-q '.required_status_checks'` 만 쓰면 미적용 시 **빈 줄**이 나와 *"명령이 조용히 실패한 것"* 과 구분되지 않는다 (실측 2026-08-07).

릴리스 도중 required check 가 오차단하면 **릴리스를 인질로 잡고 디버깅하지 말 것.** 걷어내고 완주시킨 뒤 원인을 분석한다. `enforce_admins: true` 는 규칙의 **우회**만 막고 **편집**은 막지 않으므로 admin 토큰으로 즉시 동작한다 (약 2초 — R1 은 아직 실 발동 이력이 없어 추정치다).

```bash
REPO=coseo12/astro-simulator

# R1 — required check 만 제거 (1차 대응. 나머지 보호는 유지)
gh api -X DELETE "repos/$REPO/branches/main/protection/required_status_checks"
gh api "repos/$REPO/branches/main/protection" -q '.required_status_checks | tojson'   # 기대: null
# ⚠️ R1 실행 = Phase 1 이 조용히 롤백된 상태. 원인 해소 후 §8-A1 로 **재적용**해야 한다

# R3 — R1 이 듣지 않을 때만 (보호 전량 해제). ⚠️ 릴리스 완주 직후 §8-A1 로 반드시 재적용
gh api -X DELETE "repos/$REPO/branches/main/protection"
```

### 시나리오별 1차 대응 (ADR §10-6 축자)

> ⚠️ **letter 는 load-bearing** — ADR·PR·CHANGELOG 가 *"시나리오 D"* 처럼 letter 로 참조한다. 아래는 [ADR §10-6](../decisions/20260807-971-required-status-checks.md) 을 **그대로 옮긴 것**이며, 재해석하지 말 것.

| # | 시나리오 | 증상 | 대응 |
|---|---|---|---|
| **A** | `project-guards` 가 **`cancelled`** 로 남음 (Phase 0 미작동) | 회색 취소 + *"Required statuses must pass"* | **rerun** → `success` 면 진행. **반복되면 §9-R1** |
| **B** | 세 체크 중 하나가 **flake `failure`** | 빨간 X + 머지 차단 | **rerun** (같은 머신 재시도로 충분한 클래스) |
| **C** | **동명 쌍 결론 불일치** (`{failure, success}`) | GitHub 이 어느 쪽을 채택하는지 **미문서화** — 초록인데 차단되거나 `mergeStateStatus=BLOCKED` 가 **이유 없이** 붙은 것처럼 보인다 | rerun 으로 회복 안 되면 **즉시 §9-R1** |
| **D** | **PR 다중성** — release head SHA 가 다른 PR 의 head 이기도 해 `branch-name` 이 `{failure, success}` | rerun 해도 **`failure` 가 사라지지 않는다** (다른 PR 의 브랜치명은 그대로) | **§9-R1 필수** |
| **E** | Actions 장애 / 외부 지연 | 체크가 **영구 Pending** — 빨강도 초록도 아님 | **§9-R1** — ⚠️ **Pending 은 rerun 대상이 없다.** 누를 버튼을 찾지 말 것 |

**자가 진단이 원리적으로 불가능한 건 C 다** — 증상이 *"이유 없이 BLOCKED"* 라 원인 분석 모드로 진입하기 쉽다. **초록인데 막히면 C 를 먼저 의심**하고 R1 로 넘어간다.

> **정상 경로와 혼동하지 말 것**: 머지 버튼이 10~15초 늦게 활성화되는 것은 오차단이 아니라 required check 대기다. 위 표는 **빨강·회색·영구 Pending** 이 뜬 경우다.

> **D 는 롤백해도 흔적이 남는다** — 갈린 `failure` 체크런은 그 SHA 에 **영구 기록**된다. R1 은 *머지를 뚫을 뿐* 기록을 지우지 않는다. 기록까지 깨끗해지는 유일한 경로는 **새 head SHA 로 릴리스를 재생성**하는 것이고, 그 비용이 ADR 이 말하는 *"릴리스 1주기"* 다.

### 사전 확인 — A1 직전 / 릴리스 머지 직전 1줄

```bash
REPO=coseo12/astro-simulator
SHA=$(gh pr view <PR번호> --json headRefOid -q .headRefOid)   # ADR §10-4 정본. full SHA 반환
# ⚠️ `git rev-parse <ref>` 로 대체하지 말 것 — 로컬 stale / merge-back 커밋을 집어 조용히 n=0 을 낸다 (실측)
gh api "repos/$REPO/actions/runs?head_sha=$SHA&per_page=100" \
  -q '[.workflow_runs[]|select(.event=="pull_request")|.head_branch] | unique | "n=\(length)  \(join(","))"'
```

| 출력 | 의미 |
|---|---|
| `n=1  develop` | ✅ 정상 — 진행 |
| `n=0` | ⚠️ **안전 신호가 아니다.** 이 SHA 는 **PR head 가 아니라** 판정 대상 부적격이다. 원인: 축약 SHA / 잘못된 ref(로컬 stale·merge-back 커밋) / run 보존기간 90일 만료 / `paths-ignore` 로 run 미생성. **어느 쪽이든 결론은 같다 — A1 연기** |
| `n≥2` | 🔴 **D 시나리오 성립** — A1 을 연기하거나 head SHA 를 교체한다 |

⚠️ **A1 직전 실행은 본 축약본이 아니라 ADR [§8-P1-G](../decisions/20260807-971-required-status-checks.md) 원문**(전제 확인 S1~S4 포함)으로 한다.

전체 롤백 절차(R2 `develop` 보호 해제 / R4)와 적용 payload 는 **ADR [§8·§9](../decisions/20260807-971-required-status-checks.md)** 가 정본이다.

## 커밋 컨벤션 / PR 규칙

PR #290 reviewer 권고 3 (PR #293) 부터 단독 분리. 상세: [docs/guides/pr-conventions.md](pr-conventions.md).

## 관련

- [docs/guides/pr-conventions.md](pr-conventions.md) — 커밋 컨벤션 + PR 규칙 (closing keyword 함정 + 머지 후 검증 루틴)
- [docs/decisions/20260419-gitflow-main-develop.md](../decisions/20260419-gitflow-main-develop.md) — gitflow 복원 ADR (v2.13.0)
- [docs/decisions/20260419-release-merge-strategy.md](../decisions/20260419-release-merge-strategy.md) — release PR `--merge` 의무 ADR
- [docs/deployment-patterns.md](../deployment-patterns.md) — PaaS 자동 배포 vs 수동 tag 비교
