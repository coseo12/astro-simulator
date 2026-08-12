---
name: create-pr
description: |
  구현 완료 후 GitHub PR을 생성하는 스킬.
  TRIGGER when: 기능 구현이 완료되어 PR을 올려야 할 때, "PR 만들어", "PR 생성",
  "풀 리퀘스트", "리뷰 요청" 등의 요청, 브랜치 작업이 끝났을 때.
  DO NOT TRIGGER when: PR을 리뷰하거나 머지할 때, 이슈 생성일 때.
---

# PR 생성

구현 완료된 작업 브랜치 (`<type>/*`) 에서 develop 브랜치로의 PR을 생성한다.

## Base 선택 + 머지 방식 (gitflow)

| PR 타입 | base | head | 머지 방식 | 비고 |
|---|---|---|---|---|
| 일반 개발 PR | `develop` | `<type>/*` (type = 커밋 컨벤션 type — `feature`(feat) / `fix` / `refactor` / `chore` / `docs` / `test`) | `--squash` | **기본값** — 99% 의 PR 이 이 형태 |
| Release PR | `main` | `develop` | **`--merge` (merge commit)** | `--squash` 금지. merge-back 원천 방지 (ADR [20260419-release-merge-strategy](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-release-merge-strategy.md) — upstream) |
| Hotfix PR | `main` | `hotfix/*` | `--squash` 또는 `--merge` | prod 긴급 패치. 머지 직후 merge-back PR 별도 생성 의무 |
| Hotfix merge-back | `develop` | `main` | `--merge` | hotfix 머지 직후 동기화 전용 |

**금지**:
- 일반 개발 PR (`<type>/*`) 의 `base=main` — 과거 dual PR drift 재발 방지 (ADR [20260419-gitflow-main-develop](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-gitflow-main-develop.md) — upstream)
- Release PR 의 `--squash` 머지 — develop drift 유발 (v2.13.0 에서 관찰, v2.14.0 에서 merge commit 으로 전환)

## 절차

1. 현재 브랜치와 변경 사항을 확인한다.
2. 커밋이 컨벤션에 맞는지 검증한다.
3. 리모트에 브랜치를 푸시한다. **푸시 전 `node scripts/verify-branch-name.mjs` 필수** — 브랜치명 규약 위반은 PR 생성 후에는 브랜치·PR 재생성으로만 교정되므로 CI (`branch-name-guard`) 도달 전에 차단한다.
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
git push -u origin <type>/<이슈번호>-<설명>

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

### Test plan (테스트)
- [ ] 단위 테스트 추가/수정
- [ ] 기존 테스트 통과 확인

## 체크리스트
- [ ] 설계 문서의 인터페이스 준수
- [ ] 커밋 컨벤션 준수
- [ ] 불필요한 변경 없음

Closes #이슈번호
EOF
)" \
  --label "stage:review"
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

**4차 — PR 본문 생성**: 위 2차에서 추출한 결과를 PR 본문 `### 체크리스트` 섹션에 그대로 박제한다. 충족 여부에 따라 `[ ]` → `[x]` 갱신만 허용 (라인 자체 변경·삭제 금지). 다른 base 섹션 (변경 사항 / 브랜치 Base 확인 / 스프린트 계약 / Test plan / 브라우저 3단계 / 마일스톤 회고 등 PR 템플릿이 정의한 표준 섹션) 도 동일 절차로 처리 (해당 섹션이 N/A 인 경우 `### <섹션명>` 헤더 + `- [x] N/A — <사유>` 1줄 유지, 섹션 자체 삭제 금지).

**Fallback 금지 (CRITICAL)**: 위 1~3차 중 어느 단계 FAIL 시 작업 차단. 하드코딩 또는 default 본문 사용 금지 — drift 자기모순 (다운스트림 [astro-simulator#469](https://github.com/coseo12/astro-simulator/issues/469) 폐기 패턴 재현). 템플릿이 깨졌으면 먼저 `.github/PULL_REQUEST_TEMPLATE.md` 를 수리한 뒤 PR 본문 생성을 재개한다.

근거: 다운스트림 [astro-simulator#471](https://github.com/coseo12/astro-simulator/issues/471) PR [#478](https://github.com/coseo12/astro-simulator/pull/478) 박제. ADR `20260515-harness-managed-divergent-pattern.md` Z 패턴 Phase 2 upstream 기여. volt [#107](https://github.com/coseo12/volt/issues/107) (Strict Assertion vs Fallback 자기모순).

## 측정 방법 C (혼합) — PR 본문 가시성 자기 검증

PR 본문 작성 후 거버넌스 체크 항목 (예: "ADR 호환성 체크") 의 가시성은 **3계급**으로 판정한다. 판정 정본은 `scripts/verify-pr-template-checklist.mjs` 이며, 본 표는 사람이 읽는 계약이다 — 두 곳이 갈리면 스크립트가 옳다 (#1010).

```bash
# 정본 — 7 키워드 전건을 3계급으로 판정 (CI `pr-template-checklist-guard.yml` 과 동일 코드)
node scripts/verify-pr-template-checklist.mjs <PR>
# exit 0 = PASS 또는 WARN / exit 1 = FAIL. WARN 은 stdout 표에 계급별 구조 hit 이 0 으로 찍힌다
```

- **phrase ≥ 1 hit ∧ 구조 ≥ 1 hit** → PASS (구조 + phrase 둘 다 가시성 확보)
- **phrase ≥ 1 hit ∧ 구조 0 hit** → WARN / non-blocking 권고 (템플릿 원 구조 소실 — reviewer 가 `non_blocking_suggestions` 로 승격)
- **phrase 0 hit** → FAIL (가시성 0 — PR 본문 재작성 또는 reviewer 가 차단). 구조 hit 은 phrase hit 을 함의하므로 이 조건이 곧 "양쪽 0" 이다

**구조 hit 의 정의는 키워드 계급마다 다르다** — 템플릿에서 그 항목이 갖는 원래 형태를 보존했는지를 묻기 때문이다.

- 키워드 1~5 (커밋 컨벤션 / 불필요 / 보안 / SSoT / cross-validate): `### 체크리스트` 절의 **체크박스 항목** → 같은 라인에 `- [ ]` 또는 `- [x]` + phrase
- 키워드 6~7 (ADR 호환성 / Test plan): 템플릿에서 **`###` 섹션 헤더로만 존재** → 같은 라인에 `###` + phrase

> 구조 판정의 헤더는 **ATX 레벨을 가리지 않는다** (`#`~`######`) — 템플릿이 쓰는 레벨은 `###` 이지만 묻는 것은 "섹션 헤더로 존재하는가"이지 레벨이 아니다. 구조 축은 WARN 전용이라 느슨한 쪽이 거짓 WARN 을 줄이고 blocking 경계에는 영향이 없다 (#1010).

⚠️ WARN 을 피하려고 `[ ]` → `[x]` 외의 편집 (체크박스를 `###` 헤더 절로 옮기기 등) 을 하지 않는다. 위 4차 절차의 *"라인 자체 변경·삭제 금지"* 가 그대로 구조 보존 규약이다 — 최근 머지 PR 60건 중 10건이 이 침식을 겪었고 (술어: 60 PR × 7 kw = 420 셀 중 WARN 21 셀), 종전 2계급 가드는 그것을 전부 초록으로 통과시켰다.

> 참고: 위 **3계급 bullet 3줄 + 계급별 구조 정의 2줄**이 `.claude/agents/developer.md` 에도 **바이트 동일**하게 박제됨 (cross-link SSoT). 한쪽만 갱신하면 drift 발생 — **동시 수정 의무**. 다운스트림 1차 사례: astro-simulator [#469](https://github.com/coseo12/astro-simulator/issues/469) PR [#472](https://github.com/coseo12/astro-simulator/pull/472).

> 참고: PR 템플릿 신규 항목 양가성 가드 (구조 0 hit → WARN / phrase 0 hit → FAIL 발화, #1010) 는 `.claude/agents/developer.md` §메타 규칙 (다운스트림 [astro-simulator#470](https://github.com/coseo12/astro-simulator/issues/470) PR [#475](https://github.com/coseo12/astro-simulator/pull/475) 동기화) 에 박제됨. reviewer.md §절차 6번 + qa.md §검증 단계 backstop 양쪽이 방어의 깊이.

## 라벨 업데이트

**PR 의 `stage:review` 부착 주체는 본 스킬이다** — PR 생성 시 `--label "stage:review"` 를 포함해 reviewer 디스패치 사슬 (reviewer 는 `stage:review` 제거로 시작) 을 연결한다.

```bash
# 연결 이슈 단계 전환: dev → review (stage:* 일원화 체계, harness #127)
gh issue edit <이슈번호> --remove-label "stage:dev" --add-label "stage:review"
```

## Stack PR (base ≠ main/develop) 주의 (volt #17)

PR의 base가 다른 feature 브랜치인 경우(= stack PR), 중간 PR이 머지된 후 상위 PR은 **반드시 rebase + force-push** 필요. `gh pr edit --base` 만으로는 `mergeStateStatus=CONFLICTING`.

절차 (예: base 였던 `feature/123-a` 가 develop 에 머지된 직후):

```bash
# 1. head 브랜치 체크아웃
git checkout feature/123-b

# 2. 최신 main 기준 rebase
git fetch origin
git rebase origin/develop
# → "skipped previously applied commit" 정상 (develop 에 이미 머지된 커밋)
# → 실제 conflict 시 수동 해결 + git rebase --continue

# 3. force-push — --force-with-lease (원격이 내가 본 커밋과 일치할 때만)
git push --force-with-lease origin feature/123-b

# 4. base 갱신 + 머지
gh pr edit <PR> --base develop
gh pr merge <PR> --squash
```

### 충돌 다발 영역
`package.json` scripts 목록, `CHANGELOG.md`, `MEMORY.md` 같은 **append-heavy 파일**은 stack PR 간 충돌 거의 확실. 같은 섹션을 여러 PR이 수정하면 하위 PR은 rebase 필수.

### 대안 — 독립 브랜치
stack 대신 각 PR 을 develop 기반 독립 브랜치로 만들고, 의존성은 **기능 플래그/옵트인 import** 로 해결. rebase 지옥 회피.

### PR 생성 시 체크
- `--base` 가 `main`/`develop` 이 아니면 경고 + 머지 순서/rebase 필요성 사용자에게 고지
- `gh pr edit --base <main|develop>` 후 `gh pr view --json mergeStateStatus` 확인, DIRTY/CONFLICTING이면 로컬 rebase 유도
- `--base main` 인 경우 release/hotfix PR 인지 재확인 — 일반 개발 PR (`<type>/*`) 은 base=main 금지 (위 "Base 선택" 표)

## 규칙

- PR 제목은 반드시 `[#이슈번호]`를 포함한다.
- PR 본문에 `### Test plan` 섹션 (영문 phrase) 을 반드시 포함한다 — `verify-pr-template-checklist.mjs` keyword 7 이 영문 `Test plan` phrase 를 매칭하며, 구조 계급이 **헤더**라 `###` 없이 산문으로만 쓰면 WARN 이다 (템플릿 동적 읽기 시 자동 충족).
- PR 본문의 `Closes #이슈번호`로 이슈와 연결한다. 단 **base=develop 머지는 GitHub 네이티브 auto-close 미발동** (default branch 머지만 발동) — 대신 [`.github/workflows/auto-close-issues.yml`](../../../.github/workflows/auto-close-issues.yml) (#915) 이 PR **본문**의 close 키워드를 파싱해 자동 close 한다. 머지 후 메인은 `gh issue view <이슈번호> --json state` 로 **결과만 확인**하고, `OPEN` 이면 폴백으로 수동 close 한다 (운영 마찰 규약 [§1 / §1-1 미발동 조건](../../../docs/ops/operational-friction.md)).
  - ⚠️ 키워드는 **PR 본문**에 있어야 한다 — 커밋 메시지 / PR 제목에만 쓰면 workflow 가 파싱하지 못한다.
- 머지 시 `--delete-branch` 를 사용하지 않는다 — 멀티 워크스페이스 (Conductor worktree) 브랜치 점유와 충돌 (운영 마찰 규약 §2). 원격 삭제는 `git push origin --delete <브랜치>` 로 분리 수행한다.
- 변경 파일 10개 이하를 목표로 한다. 초과 시 PR을 분할한다.
- 테스트가 통과하는 상태에서만 PR을 생성한다.
- WIP 상태라면 Draft PR로 생성한다: `gh pr create --draft`
- `--force-with-lease` 를 `--force` 대신 사용 (CRITICAL #5 파괴적 작업 원칙)
