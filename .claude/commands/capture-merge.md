---
description: 머지된 PR을 volt 이슈 초안으로 자동 변환 (capture-volt 스킬 호출, 사용자 최종 승인)
argument-hint: [PR번호 | 미지정 시 최근 머지된 PR]
allowed-tools: [Bash, Read, Skill]
---

# /capture-merge — PR 머지 → volt 캡처 초안

Gemini의 "마찰 없는 자동화" 통찰을 1단계 적용. 사용자가 PR 머지 직후 한 번 호출하면 capture-volt 스킬을 자동 초안과 함께 호출. 사용자는 검토 후 승인만.

## 사용자 입력
`$ARGUMENTS`

## 절차

1. **PR 결정**:
   ```bash
   PR=${ARG:-$(gh pr list --state merged --limit 1 --json number -q '.[0].number')}
   ```

2. **PR 정보 수집**:
   ```bash
   gh pr view "$PR" --json number,title,body,mergedAt,author,labels,files,additions,deletions
   gh pr diff "$PR" --name-only
   ```
   연결된 이슈도 `gh pr view --json closingIssuesReferences` 로 확인.

3. **중복 체크** — volt에 이 PR 번호가 이미 캡처됐는지:
   ```bash
   gh issue list --repo coseo12/volt --search "PR #$PR" --state all
   ```
   결과 있으면 사용자에게 보고 + 새 캡처할지 묻기.

4. **분류 자동 판정**:
   - PR 라벨에 `feat:`, `feature` → report/pattern 또는 knowledge (재사용성 높으면)
   - `fix:`, `bug` → report/troubleshooting
   - `docs:`, `chore:` → 캡처 가치 낮음, 사용자에게 "스킵 권장" 안내
   - `refactor:` → 변경량/영향 따라 report/retrospective
   - 기본 폴백: report/research

5. **본문 자동 초안 생성** (capture-volt 스킬의 템플릿 사용):

   ### report 초안 예시
   ```markdown
   ### 리포트 유형
   {분류}

   ### 출처 레포
   {owner}/{repo} (PR #{N})

   ### 태그
   {파일 카테고리/언어/주요 모듈명에서 추출}

   ### 배경/상황
   {PR 본문 요약 — 첫 단락}

   ### 내용
   {변경 파일 카테고리별 요약 + 핵심 hunk 의미}

   ### 교훈 / 다음에 적용할 점
   ⚠ **사용자 검토 필요** — 자동 초안은 "무엇을 했는지"는 잡지만 "왜 / 다음에 어떻게"는
   사람이 채워야 합니다. 빈칸이거나 형식적이면 캡처하지 마세요.
   ```

6. **사용자 검토 단계** (필수, 자동 push 금지):
   - 초안을 화면에 표시
   - "이대로 캡처할까요? (y/edit/skip)"
   - `edit`이면 사용자가 본문 수정 후 다시 호출
   - `skip`이면 종료 (캡처 가치 낮은 PR 인정)
   - `y`면 capture-volt 스킬 호출하여 실제 이슈 생성

7. **결과 보고**: 생성된 volt 이슈 URL.

## 자동 초안의 한계 (사용자에게 항상 표시)

- **"교훈" 섹션은 자동 생성 못 함** — 빈칸 또는 형식 채움말. 사용자가 *왜 이게 미래에 가치 있는지* 1~2문장 추가 필요.
- **민감정보 검사 불완전** — 자동으로 비밀키/내부 URL을 100% 못 잡음. 사용자가 본문 검토 시 확인 필수.
- **재사용성 판단** — knowledge vs report 경계는 사람이 더 잘 봄. 자동 분류는 폴백일 뿐.

## 금지

- 사용자 승인 없이 volt 이슈 생성 금지 (마찰 0이 아니라 *낮은* 마찰이 목표)
- 민감정보 포함 검토 우회 금지
- "교훈" 섹션을 형식적으로 채워 통과시키지 않음 — 비어있으면 사용자에게 명시 요청
- 중복 캡처 우회 금지 — 이미 있으면 사용자에게 알림

## 사용 스킬
- `capture-volt`: 실제 이슈 생성 (이 명령은 초안 + 호출 wrapper)

## 흐름 통합

```
PR 머지
  → /capture-merge <PR>     # 자동 초안 + 사용자 검토
  → capture-volt 스킬       # 실제 volt 이슈 생성
  → (다음 세션) /volt-review # 누적된 지식을 harness 개선으로
```

이 흐름이 **"사용 경험으로 진화하는 도구"** 정체성의 마지막 조각.
