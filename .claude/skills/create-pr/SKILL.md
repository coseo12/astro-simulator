---
name: create-pr
description: |
  구현 완료 후 GitHub PR을 생성하는 스킬.
  TRIGGER when: 기능 구현이 완료되어 PR을 올려야 할 때, "PR 만들어", "PR 생성",
  "풀 리퀘스트", "리뷰 요청" 등의 요청, 브랜치 작업이 끝났을 때.
  DO NOT TRIGGER when: PR을 리뷰하거나 머지할 때, 이슈 생성일 때.
---

# PR 생성

구현 완료된 feature 브랜치에서 develop 브랜치로의 PR을 생성한다.

## Base 선택 + 머지 방식 (gitflow)

| PR 타입 | base | head | 머지 방식 | 비고 |
|---|---|---|---|---|
| 일반 feature/fix | `develop` | `feature/*` 또는 `fix/*` | `--squash` | **기본값** — 99% 의 PR 이 이 형태 |
| Release PR | `main` | `develop` | **`--merge` (merge commit)** | `--squash` 금지. merge-back 원천 방지 (ADR 20260419-release-merge-strategy) |
| Hotfix PR | `main` | `hotfix/*` | `--squash` 또는 `--merge` | prod 긴급 패치. 머지 직후 merge-back PR 별도 생성 의무 |
| Hotfix merge-back | `develop` | `main` | `--merge` | hotfix 머지 직후 동기화 전용 |

**금지**:
- 일반 feature/fix PR 의 `base=main` — 과거 dual PR drift 재발 방지 (ADR 20260419-gitflow-main-develop)
- Release PR 의 `--squash` 머지 — develop drift 유발 (v2.13.0 에서 관찰, v2.14.0 에서 merge commit 으로 전환)

## 절차

1. 현재 브랜치와 변경 사항을 확인한다.
2. 커밋이 컨벤션에 맞는지 검증한다.
3. 리모트에 브랜치를 푸시한다.
4. PR 템플릿에 맞게 PR을 생성한다.
5. 관련 이슈의 상태 라벨을 업데이트한다.

## 사전 확인

```bash
# 변경 사항 확인
git status
git diff --stat develop...HEAD

# 커밋 히스토리 확인
git log develop..HEAD --oneline
```

## PR 생성

```bash
# 브랜치 푸시
git push -u origin feature/<이슈번호>-<설명>

# PR 생성
gh pr create \
  --base develop \
  --title "[#이슈번호] 변경 설명" \
  --body "$(cat <<'EOF'
## 변경 사항
- 변경 1
- 변경 2

## 설계 참조
- docs/architecture/관련문서.md

## 브랜치 / Base 확인 (gitflow)
- [x] **일반 feature/fix**: `base=develop`, `head=feature/*` 또는 `fix/*`

## 스프린트 계약
- [ ] 구현 전 완료 기준 합의 완료
- [ ] 모든 완료 기준 충족

## 테스트
- [ ] 단위 테스트 추가/수정
- [ ] 기존 테스트 통과 확인
- [ ] 모노레포: 신규/변경 워크스페이스에 `scripts.test` 존재 확인

## 체크리스트
- [ ] 커밋 컨벤션 준수
- [ ] 불필요한 변경 없음
- [ ] 보안 취약점 없음
- [ ] CLAUDE.md SSoT 코어 필드 9개 동기화 (스키마 변경 시) + verify-agent-ssot.sh (#145)
- [ ] 정책·규약·ADR·CRITICAL DIRECTIVE 박제 변경 시 cross-validate (volt #23) outcome 박제
- [ ] **ADR 호환성 체크**: 본 PR 의 변경이 기존 ADR (docs/decisions/*.md) 의 결정과 충돌하지 않음

Closes #이슈번호
EOF
)" \
  --label "status:review"
```

> **PR 본문 7 체크박스 base 보존 의무** — 위 예시의 `## 체크리스트` 7 항목 (커밋 컨벤션 / 불필요 변경 / 보안 / SSoT / cross-validate / ADR 호환성 + 상위 Test plan) 은 `.github/PULL_REQUEST_TEMPLATE.md` 의 `### 체크리스트` 섹션 SSoT 와 일치한다. `gh pr create --body` 로 본문을 수동 작성할 때 GitHub 의 템플릿 자동 prefill 이 우회되므로, 7 체크박스 base 를 변경 없이 포함하고 충족 여부에 따라 `[x]` / `[ ]` 만 갱신한다. N/A 항목도 체크박스를 삭제하지 않고 `[x] N/A — <사유>` 로 유지 (PR [#468](https://github.com/coseo12/astro-simulator/pull/468) reviewer/qa 발견 → 이슈 [#469](https://github.com/coseo12/astro-simulator/issues/469)).

## 측정 방법 C (혼합) — PR 본문 가시성 자기 검증

PR 본문 작성 후 거버넌스 체크 항목 (예: "ADR 호환성 체크") 의 가시성을 다음 두 grep 의 **AND** 로 판정한다 (이슈 [#469](https://github.com/coseo12/astro-simulator/issues/469) architect cross-validate 합의):

```bash
# 1차 구조 grep — 체크박스 prefill 보존 확인
gh pr view <PR> --json body --jq .body | grep -c "ADR 호환성 체크"
# 기대: ≥ 1 hit (체크박스 항목명 그대로)

# 2차 phrase grep — 별도 위치 박제까지 포괄 확인 (대소문자 무시)
gh pr view <PR> --json body --jq .body | grep -c -i "ADR 호환성"
# 기대: ≥ 1 hit (체크박스 + prose 중 어디든)
```

- **양쪽 ≥ 1 hit** → PASS (구조 + phrase 둘 다 가시성 확보)
- **체크박스 0 + phrase ≥ 1** → non-blocking 권고 (체크박스 prefill 누락. 동일 권고 시 위 7 체크박스 base 코드 블록 동봉 권장)
- **양쪽 동시 0 hit** → FAIL (가시성 0 — PR 본문 재작성 또는 reviewer 가 차단)

> 참고: 동일 측정 방법이 `.claude/agents/developer.md` 에도 박제됨 (cross-link SSoT). 한쪽만 갱신하면 drift 발생 — 동시 수정 의무. harness-managed 파일 운영은 ADR [`20260515-harness-managed-divergent-pattern.md`](../../../docs/decisions/20260515-harness-managed-divergent-pattern.md) Z 패턴 (Phase 1 = 본 프로젝트 선반영 / Phase 2 = upstream 기여 / Phase 3 = 동기화) 적용.

## 라벨 업데이트

```bash
# 이슈 상태 전환: in-progress → review
gh issue edit <이슈번호> --remove-label "status:in-progress" --add-label "status:review"
```

## Stack PR (base ≠ main/develop) 주의 (volt #17)

PR의 base가 다른 feature 브랜치인 경우(= stack PR), 중간 PR이 머지된 후 상위 PR은 **반드시 rebase + force-push** 필요. `gh pr edit --base` 만으로는 `mergeStateStatus=CONFLICTING`.

절차 (예: base였던 `feature/p4-d` 가 main에 머지된 직후):

```bash
# 1. head 브랜치 체크아웃
git checkout feature/p4-a

# 2. 최신 main 기준 rebase
git fetch origin
git rebase origin/main
# → "skipped previously applied commit" 정상 (main에 이미 머지된 커밋)
# → 실제 conflict 시 수동 해결 + git rebase --continue

# 3. force-push — --force-with-lease (원격이 내가 본 커밋과 일치할 때만)
git push --force-with-lease origin feature/p4-a

# 4. base 갱신 + 머지
gh pr edit <PR> --base main
gh pr merge <PR> --squash
```

### 충돌 다발 영역
`package.json` scripts 목록, `CHANGELOG.md`, `MEMORY.md` 같은 **append-heavy 파일**은 stack PR 간 충돌 거의 확실. 같은 섹션을 여러 PR이 수정하면 하위 PR은 rebase 필수.

### 대안 — 독립 브랜치
stack 대신 각 PR을 main 기반 독립 브랜치로 만들고, 의존성은 **기능 플래그/옵트인 import** 로 해결. rebase 지옥 회피.

### PR 생성 시 체크
- `--base` 가 `main`/`develop` 이 아니면 경고 + 머지 순서/rebase 필요성 사용자에게 고지
- `gh pr edit --base main` 후 `gh pr view --json mergeStateStatus` 확인, DIRTY/CONFLICTING이면 로컬 rebase 유도
- `--base main` 인 경우 release/hotfix PR 인지 재확인 — 일반 feature/fix PR 은 base=main 금지 (위 "Base 선택" 표)

## 규칙

- PR 제목은 반드시 `[#이슈번호]`를 포함한다.
- PR 본문의 `Closes #이슈번호`로 이슈와 연결한다.
- 변경 파일 10개 이하를 목표로 한다. 초과 시 PR을 분할한다.
- 테스트가 통과하는 상태에서만 PR을 생성한다.
- WIP 상태라면 Draft PR로 생성한다: `gh pr create --draft`
- `--force-with-lease` 를 `--force` 대신 사용 (CRITICAL #5 파괴적 작업 원칙)
