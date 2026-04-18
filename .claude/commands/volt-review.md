---
description: coseo12/volt 이슈를 읽고 harness 반영 개선안을 제안 → 승인 → feature 브랜치 PR
argument-hint: [이슈번호 | --label knowledge|report | --since YYYY-MM-DD — 생략 시 최근 10건 자동 선별]
allowed-tools: [Bash, Read, Edit, Grep, Glob, Skill]
---

# /volt-review — Volt → Harness 반영 리뷰

`coseo12/volt` 저장소에 축적된 knowledge/report 이슈를 읽고, harness_setting(CLAUDE.md · agents · skills · docs)에 어떻게 반영할지 개선안을 제시한다. 사용자 승인 후에만 feature 브랜치에서 변경하고 PR로 올린다.

상세 절차는 **`volt-review` 스킬**에 정의돼 있으니 먼저 그 스킬을 호출한다.

## 사용자 입력

`$ARGUMENTS`

## 실행 절차

1. **스킬 호출** — 먼저 `volt-review` 스킬을 실행해 4단계 절차(수집 → 매핑 → 제안 → PR)와 금지사항을 로드한다.

2. **인자 해석**:
   - `#7 #6` 형식 — 해당 이슈만 조회.
   - `--label knowledge` / `--label report` — 라벨 필터.
   - `--since 2026-04-01` — 해당 날짜 이후 업데이트된 이슈만.
   - 비어있으면 최근 10건 조회 후 harness 관련성 높은 이슈만 자동 선별.

3. **이슈 수집**:
   ```bash
   gh issue list -R coseo12/volt --state all --limit 20 \
     --json number,title,labels,updatedAt,body
   ```

4. **매핑** — 각 이슈를 CLAUDE.md / CRITICAL DIRECTIVES / 글로벌 CLAUDE.md / agents / skills / docs 중 어디에 반영할지 판정. 범위 밖이면 "스킵 + 이유" 명시.

5. **중복 반영 체크** — 각 후보에 대해 `git log --all --grep="volt #<n>"` 과 해당 파일을 grep 하여 이미 반영됐는지 확인.

6. **제안 목록 제시** — 이슈별로 분류/제안/근거/영향 파일을 표시하고 **사용자 승인 대기**. 이 단계에서 파일 수정 금지.

7. **승인된 항목만 반영**:
   - `git checkout -b feature/volt-review-$(date +%Y%m%d)` — main 직접 수정 금지.
   - Edit 후 한국어 파일은 `grep -rn '�' <파일>` 으로 U+FFFD 검증.
   - 커밋: `docs(harness): volt #7 <요지>` 형식.
   - `create-pr` 스킬로 PR 생성. PR 본문에 반영한 volt 이슈 번호 전부 링크.

8. **결과 보고** — PR URL 과 반영/스킵된 이슈 요약.

## 금지

- 자동 반영 금지 — 항상 제안 후 사용자 승인.
- main 직접 수정/푸시 금지.
- 승인된 이슈 외 "겸사겸사" 수정 금지 — 별도 PR로.
- 동일 volt 이슈 중복 반영 금지.
