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

## 커밋 컨벤션 / PR 규칙

PR #290 reviewer 권고 3 (PR #293) 부터 단독 분리. 상세: [docs/guides/pr-conventions.md](pr-conventions.md).

## 관련

- [docs/guides/pr-conventions.md](pr-conventions.md) — 커밋 컨벤션 + PR 규칙 (closing keyword 함정 + 머지 후 검증 루틴)
- [docs/decisions/20260419-gitflow-main-develop.md](../decisions/20260419-gitflow-main-develop.md) — gitflow 복원 ADR (v2.13.0)
- [docs/decisions/20260419-release-merge-strategy.md](../decisions/20260419-release-merge-strategy.md) — release PR `--merge` 의무 ADR
- [docs/deployment-patterns.md](../deployment-patterns.md) — PaaS 자동 배포 vs 수동 tag 비교
