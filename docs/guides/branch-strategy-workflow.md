# 브랜치 전략 워크플로 (gitflow) 상세

> CLAUDE.md `## 브랜치 전략 (classic gitflow)` 의 워크플로 3단계 + drift 감지 가지치기 위임 (이슈 #266 / PR #287). CLAUDE.md 본문은 브랜치 표 + 1줄 포인터만 유지 (각인층 원칙).

## 워크플로 3단계

### 1. 일상 개발

```
feature/123-xxx   (develop 에서 분기)
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
- **dual PR 재발 방지**: feature/fix PR 은 `base=main` 을 사용하지 않는다 (PR 템플릿 가드)

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

- `harness doctor` 의 "gitflow 브랜치 정합성" 항목이 `origin/main` vs `origin/develop` 커밋 격차를 점검한다 (v2.15.0 에서 `--is-ancestor` / hotfix 문맥 / unrelated histories 분류 추가)
- **정상 (pass)**:
  - 동일 커밋 — 릴리스 직후 또는 초기 상태
  - `develop > main` — 다음 릴리스 대기 (정상)
  - `main > develop` 이지만 `git merge-base --is-ancestor develop main` 가 참 — **fast-forward 동기화 대기 중** (release PR merge commit 직후 정상 상태. `git push origin main:develop` 로 해소)
- **경고 (warn)**:
  - `hotfix/*` 브랜치 존재 + `main > develop` — hotfix 진행 중 (머지 후 merge-back PR 필요)
  - develop 이 main 의 조상이 아닌 채 `main > develop` — hotfix merge-back 누락 또는 release PR 을 실수로 `--squash` 로 머지한 가능성. `git show main --format=%P | wc -w` 로 merge commit 여부 확인 (2 이면 merge commit, 1 이면 squash)
  - `git rev-list` 실패 (unrelated histories 등) — `git merge-base origin/main origin/develop` 로 공통 조상 확인

## 커밋 컨벤션 / PR 규칙

PR #290 reviewer 권고 3 (PR #293) 부터 단독 분리. 상세: [docs/guides/pr-conventions.md](pr-conventions.md).

## 관련

- [docs/guides/pr-conventions.md](pr-conventions.md) — 커밋 컨벤션 + PR 규칙 (closing keyword 함정 + 머지 후 검증 루틴)
- [docs/decisions/20260419-gitflow-main-develop.md](../decisions/20260419-gitflow-main-develop.md) — gitflow 복원 ADR (v2.13.0)
- [docs/decisions/20260419-release-merge-strategy.md](../decisions/20260419-release-merge-strategy.md) — release PR `--merge` 의무 ADR
- [docs/deployment-patterns.md](../deployment-patterns.md) — PaaS 자동 배포 vs 수동 tag 비교
