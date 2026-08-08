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

### 한계

`main` branch protection 에 `required_status_checks` 가 **부재**하고 `develop` 은 보호 자체가 **없다** (2026-08-06 실측). 본 가드는 붉은 X 를 띄우지만 GitHub 이 머지를 기계적으로 막지는 **않는다**. 전 워크플로 공통 상태이며 보호 정책 전반의 별건이다.

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

# R3 — R1 이 듣지 않을 때만 (보호 전량 해제). ⚠️ 릴리스 완주 직후 §8-A1 로 반드시 재적용
gh api -X DELETE "repos/$REPO/branches/main/protection"
```

### 시나리오별 1차 대응 (ADR §10-6)

| # | 증상 | 1차 대응 |
|---|---|---|
| A | 일시적 실패 | rerun. **반복되면 R1** |
| B | 느린 체크 대기 | 대기 |
| C | flake | rerun. **회복 안 되면 즉시 R1** |
| **D** | 동일 SHA 가 **복수 PR 의 head** | **R1** — rerun 불가 |
| **E** | 영구 **Pending** | **R1** — ⚠️ **rerun 할 대상이 자체가 없다.** 누를 버튼을 찾지 말 것 |

**D 와 E 는 rerun 이 원리적으로 듣지 않는다.** D 는 `branch-name` 판정이 브랜치 *이름*의 함수라 한 SHA 위에 **둘 다 정당한 모순 결론**이 공존하고, E 는 체크런이 생성조차 안 돼 재실행 대상이 없다.

> **D 는 롤백해도 흔적이 남는다** — 갈린 `failure` 체크런은 그 SHA 에 **영구 기록**된다. R1 은 *머지를 뚫을 뿐* 기록을 지우지 않는다. 기록까지 깨끗해지는 유일한 경로는 **새 head SHA 로 릴리스를 재생성**하는 것이고, 그 비용이 ADR 이 말하는 *"릴리스 1주기"* 다.

### 사전 확인 — A1 직전 / 릴리스 머지 직전 1줄

```bash
REPO=coseo12/astro-simulator
FULL=$(git rev-parse <ref>)          # ⚠️ full SHA 필수 — 축약형은 조용히 0 을 반환한다
gh api "repos/$REPO/actions/runs?head_sha=$FULL&per_page=100" \
  -q '[.workflow_runs[]|select(.event=="pull_request")|.head_branch] | unique | "n=\(length)  \(join(","))"'
```

| 출력 | 의미 |
|---|---|
| `n=1  develop` | ✅ 정상 — 진행 |
| `n=0` | ⚠️ **안전 신호가 아니다.** 이 SHA 는 **PR head 가 아니라** 판정 대상 부적격이다 (축약 SHA 를 넣었거나 잘못된 ref) |
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
