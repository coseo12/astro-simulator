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

## 테스트
- [ ] 단위 테스트 추가/수정
- [ ] 기존 테스트 통과 확인

## 체크리스트
- [ ] 설계 문서의 인터페이스 준수
- [ ] 커밋 컨벤션 준수
- [ ] 불필요한 변경 없음

Closes #이슈번호
EOF
)" \
  --label "status:review"
```

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

## 규칙

- PR 제목은 반드시 `[#이슈번호]`를 포함한다.
- PR 본문의 `Closes #이슈번호`로 이슈와 연결한다.
- 변경 파일 10개 이하를 목표로 한다. 초과 시 PR을 분할한다.
- 테스트가 통과하는 상태에서만 PR을 생성한다.
- WIP 상태라면 Draft PR로 생성한다: `gh pr create --draft`
- `--force-with-lease` 를 `--force` 대신 사용 (CRITICAL #5 파괴적 작업 원칙)
