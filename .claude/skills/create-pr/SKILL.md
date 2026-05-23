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

## Strict Assertion 동적 읽기 (drift 0 가드)

**원칙**: PR 본문 생성 시 PR 템플릿 (`.github/PULL_REQUEST_TEMPLATE.md`) 의 `### 체크리스트` 섹션 (또는 동등한 표준 섹션) 을 **반드시 직접 읽어** 본문에 포함한다. 위 예시 코드 블록의 체크박스 base 는 **참고용 snapshot** 일 뿐이며, 실제 PR 본문 생성 시점에는 템플릿 파일을 SSoT 로 동적 읽기한다. 하드코딩 fallback 금지 — drift 자기모순 (다운스트림 [astro-simulator#469](https://github.com/coseo12/astro-simulator/issues/469) 폐기 패턴 재현).

**1차 — 파일 존재 검증 (Strict Assertion)**:

```bash
test -f .github/PULL_REQUEST_TEMPLATE.md || (echo "FAIL: PR 템플릿 파일 부재 (.github/PULL_REQUEST_TEMPLATE.md). 작업 차단." && exit 1)
```

**2차 — 섹션 추출 (A1 단순 grep)**:

```bash
# `### 체크리스트` 섹션을 sed 로 위치 기반 추출 (다음 ### 헤더 직전까지)
sed -n '/^### 체크리스트$/,/^### /p' .github/PULL_REQUEST_TEMPLATE.md | sed '$d'
```

추출 결과가 비어 있으면: `echo "FAIL: ### 체크리스트 섹션 부재 또는 깨짐. PR 템플릿 SSoT 점검 필요." && exit 1`

**3차 — checkbox 라인 검증**:

```bash
sed -n '/^### 체크리스트$/,/^### /p' .github/PULL_REQUEST_TEMPLATE.md | grep -c "^- \[ \]"
```

0 hit 시: `echo "FAIL: ### 체크리스트 섹션에 - [ ] 항목 0건. PR 템플릿 SSoT 깨짐." && exit 1`

**4차 — PR 본문 생성**: 위 2차에서 추출한 결과를 PR 본문 `### 체크리스트` 섹션에 그대로 박제한다. 충족 여부에 따라 `[ ]` → `[x]` 갱신만 허용 (라인 자체 변경·삭제 금지). 다른 base 섹션 (변경 사항 / 브랜치 Base 확인 / 스프린트 계약 / 테스트 / 브라우저 3단계 / 마일스톤 회고 등 PR 템플릿이 정의한 표준 섹션) 도 동일 절차로 처리 (해당 섹션이 N/A 인 경우 `### <섹션명>` 헤더 + `- [x] N/A — <사유>` 1줄 유지, 섹션 자체 삭제 금지).

**Fallback 금지 (CRITICAL)**: 위 1~3차 중 어느 단계 FAIL 시 작업 차단. 하드코딩 또는 default 본문 사용 금지 — drift 자기모순 (다운스트림 [astro-simulator#469](https://github.com/coseo12/astro-simulator/issues/469) 폐기 패턴 재현). 템플릿이 깨졌으면 먼저 `.github/PULL_REQUEST_TEMPLATE.md` 를 수리한 뒤 PR 본문 생성을 재개한다.

근거: 다운스트림 [astro-simulator#471](https://github.com/coseo12/astro-simulator/issues/471) PR [#478](https://github.com/coseo12/astro-simulator/pull/478) 박제. ADR `20260515-harness-managed-divergent-pattern.md` Z 패턴 Phase 2 upstream 기여. volt [#107](https://github.com/coseo12/volt/issues/107) (Strict Assertion vs Fallback 자기모순).

## 측정 방법 C (혼합) — PR 본문 가시성 자기 검증

PR 본문 작성 후 거버넌스 체크 항목 (예: "ADR 호환성 체크") 의 가시성을 다음 두 grep 의 **AND** 로 판정한다 (다운스트림 architect cross-validate 합의):

```bash
# 1차 구조 grep — 체크박스 prefill 보존 확인
gh pr view <PR> --json body --jq .body | grep -c "<체크박스 항목명>"
# 기대: ≥ 1 hit (체크박스 항목명 그대로)

# 2차 phrase grep — 별도 위치 박제까지 포괄 확인 (대소문자 무시)
gh pr view <PR> --json body --jq .body | grep -c -i "<핵심 키워드>"
# 기대: ≥ 1 hit (체크박스 + prose 중 어디든)
```

- **양쪽 ≥ 1 hit** → PASS (구조 + phrase 둘 다 가시성 확보)
- **체크박스 0 + phrase ≥ 1** → non-blocking 권고 (체크박스 prefill 누락. 동일 권고 시 위 7 체크박스 base 코드 블록 동봉 권장)
- **양쪽 동시 0 hit** → FAIL (가시성 0 — PR 본문 재작성 또는 reviewer 가 차단)

> 참고: 동일 측정 방법이 `.claude/agents/developer.md` 에도 박제됨 (cross-link SSoT). 한쪽만 갱신하면 drift 발생 — **동시 수정 의무**. 다운스트림 1차 사례: astro-simulator [#469](https://github.com/coseo12/astro-simulator/issues/469) PR [#472](https://github.com/coseo12/astro-simulator/pull/472).

> 참고: PR 템플릿 신규 항목 양가성 가드 (체크박스 prefill 0 hit + phrase 0 hit 시 발화) 는 `.claude/agents/developer.md` §메타 규칙 (다운스트림 [astro-simulator#470](https://github.com/coseo12/astro-simulator/issues/470) PR [#475](https://github.com/coseo12/astro-simulator/pull/475) 동기화) 에 박제됨. reviewer.md §절차 6번 + qa.md §검증 단계 backstop 양쪽이 방어의 깊이.

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
