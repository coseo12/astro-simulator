---
name: volt-review
description: |
  coseo12/volt 에 축적된 knowledge/report 이슈를 읽고, 이를 harness_setting(CLAUDE.md·agents·skills·docs)에
  어떻게 반영할지 개선안을 제시하는 수동 리뷰 스킬. 사용자 승인 후에만 feature 브랜치에서 변경하고 PR로 올린다.
  TRIGGER when: 사용자가 "/volt-review", "볼트 리뷰해줘", "볼트 반영", "harness 개선안 뽑아줘",
  "volt에서 하네스로 반영" 등을 요청할 때. 인자로 이슈 번호·라벨·기간이 올 수 있다.
  DO NOT TRIGGER when: 사용자가 볼트에 기록만 요청할 때(capture-volt), 다른 레포 작업일 때,
  자동/주기 실행이 요구될 때(schedule 스킬 별도).
---

# Volt → Harness 반영 리뷰

`coseo12/volt`는 harness 개선을 위한 RAG 원천. 이 스킬은 **읽기 + 제안 + 승인 + PR** 의 4단계로
volt 이슈를 harness_setting 변경으로 연결한다. 자동 PR 금지 — 항상 사용자 승인을 거친다.

## 입력 인자 (선택)

- `#7 #6` — 특정 이슈 번호만
- `--label knowledge` / `--label report` — 라벨 필터
- `--since 2026-04-01` — 해당 날짜 이후 업데이트된 이슈만
- 인자가 없으면: 최근 10개 이슈 중 harness 관련성 높은 것 자동 선별

## 절차

### 1. 이슈 수집

```bash
gh issue list -R coseo12/volt --state all --limit 20 \
  --json number,title,labels,updatedAt,body
```

필요 시 `--search` 로 키워드 필터. 특정 번호 지정 시 `gh issue view <n> -R coseo12/volt --json title,body,labels`.

### 2. 매핑 (volt 이슈 → harness 변경 후보)

각 이슈를 아래 harness 구성요소 중 어디에 반영할지 판정한다:

| harness 위치 | 반영 조건 |
|---|---|
| `CLAUDE.md` (프로젝트) | 워크플로 규칙/금지사항/원칙 추가·수정 |
| `CLAUDE.md` CRITICAL DIRECTIVES | 재발 위험이 크고 세션 초기에 각인이 필요한 규칙 |
| `~/.claude/CLAUDE.md` (글로벌) | 언어·스타일 등 전 프로젝트 공통 취향 |
| `.claude/agents/*` | 에이전트의 역할·체크리스트·출력 포맷 |
| `.claude/skills/*/SKILL.md` | 스킬 트리거·절차·금지사항 |
| `.claude/commands/*.md` | 슬래시 커맨드 |
| `docs/*` | 배경·사례·튜토리얼 (규칙은 CLAUDE.md로) |
| 신규 스킬/에이전트 | 기존에 없는 반복 패턴이 관찰된 경우에만 |

판정 기준:
- **knowledge** 이슈는 주로 `docs/` 또는 스킬 본문 보강에 쓰인다.
- **report(retrospective/feedback/pattern)** 는 주로 CLAUDE.md 규칙·에이전트 체크리스트로 승격된다.
- **report(decision/research)** 는 `docs/` 기록 + 필요 시 기본값 변경.

반영 불필요/정보성 이슈는 "스킵" 으로 분류하고 이유를 명시한다.

### 3. 개선안 제시 (사용자 승인 대기)

다음 포맷으로 요약해 사용자에게 보여준다. **이 단계에서 파일을 수정하지 않는다.**

```
## Volt → Harness 개선안 (N건)

### [#7] 스프린트 계약 + 마일스톤 회고 루틴의 효과
- 분류: report/retrospective
- 제안: CLAUDE.md "스프린트 계약" 섹션에 회고 루틴 2줄 추가
- 근거: 이슈 본문의 "마일스톤마다 회고 없이 다음 단계 진입 시 같은 실수 반복"
- 영향 파일: CLAUDE.md (line ~45 부근)

### [#3] 브라우저 3단계 검증 자동화 스크립트 패턴
- 분류: report/pattern
- 제안: skills/browser-test/SKILL.md 에 해당 패턴 스니펫 추가
- 영향 파일: /Users/seo/.claude/skills/browser-test/SKILL.md

### [#6] Velocity-Verlet 시간 역행 대칭성
- 분류: knowledge (물리 수치 적분 도메인)
- 판정: 스킵 — harness 범위 밖 도메인 지식
```

각 항목에 대해 사용자가 **채택/수정/드롭** 결정 가능. 사용자 응답 전 다음 단계 진행 금지.

### 4. 브랜치 생성 + 변경 + PR

승인된 항목만 반영한다. 절차:

1. `git checkout -b feature/volt-review-YYYYMMDD` — main 직접 수정 금지 (CLAUDE.md CRITICAL DIRECTIVE).
2. Edit 툴로 변경. 한국어 포함 파일은 저장 후 `grep -rn '�' <파일>` 으로 U+FFFD 검증.
3. 커밋 컨벤션: `docs(harness): volt #7 스프린트 계약 회고 루틴 반영` 형태로 스코프·이슈번호 포함.
4. `create-pr` 스킬에 위임하여 PR 생성. PR 본문에 반영한 volt 이슈 번호 전부 링크.
5. PR URL 보고.

## 금지/주의

- **자동 반영 금지** — 항상 3단계(제안) 후 사용자 승인을 받는다.
- **main 직접 푸시 금지** — 반드시 feature 브랜치 + PR.
- **범위 확장 금지** — 승인된 이슈 이외의 "겸사겸사" 수정은 별도 PR.
- 동일 volt 이슈를 여러 번 반영하지 않도록, 제안 단계에서 harness git log / CLAUDE.md 를 grep 해 **중복 반영 여부를 확인**한다 (예: `git log --all --grep="volt #7"`).
- 스킵 판정한 이슈는 사용자에게 이유를 함께 제시 — 반영/스킵 결정의 투명성이 다음 리뷰의 기준이 된다.

## 컴파일 규약

승격(volt → CLAUDE.md/스킬) 판단은 `docs/knowledge-compilation.md` 의 결정 트리/승격 기준을 따른다.
요지: **3회 이상 관찰 또는 재발 시 손실 큰 종류만 행위 규칙으로 박제**. 1회 관찰을 즉시 규칙화 금지.

## 참고

- volt 저장소: https://github.com/coseo12/volt
- 캡처는 `capture-volt` 스킬, 반영은 이 스킬로 역할 분리.
- 컴파일 규약: `docs/knowledge-compilation.md`
