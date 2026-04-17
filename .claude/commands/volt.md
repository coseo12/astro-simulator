---
description: 재사용 가능한 지식/경험/결정을 coseo12/volt 레포에 이슈로 캡처 (RAG 원천)
argument-hint: [주제 힌트 — 생략 시 최근 대화에서 가치 있는 것을 제안]
allowed-tools: [Bash, Read, Skill]
---

# /volt — Volt 캡처

coseo12/volt 레포에 GitHub Issue로 지식/경험을 캡처한다. AGENTS.md 규약(라벨·제목 접두사·본문 헤더명)을 따른다.

상세 절차는 **`capture-volt` 스킬**에 정의돼 있으니 먼저 그 스킬을 호출한다.

## 사용자 입력

`$ARGUMENTS`

## 실행 절차

1. **스킬 호출** — 먼저 `capture-volt` 스킬을 실행해 규약·템플릿·민감정보 경고를 로드한다.

2. **대상 선정**:
   - `$ARGUMENTS`에 주제 힌트가 있으면 그 범위에서 최근 대화를 뒤져 1건 선정.
   - 비어있으면 최근 대화에서 캡처 가치가 있는 후보(1~3건)를 bullet로 제시하고 사용자에게 선택 요청.
   - 후보는 재사용 가능한 형태여야 함 — 프로젝트 세부 구현보다 **교차 프로젝트에서 유효한 교훈·패턴·결정**.

3. **분류 결정**:
   - 시간·맥락 독립 개념/패턴/도구 사용법 → `knowledge`
   - 특정 작업의 경험/결정/회고 → `report` + 세부 유형(troubleshooting/retrospective/research/decision/feedback/pattern)
   - 애매 시 `report` + `research` 폴백.

4. **민감정보 스캔** — 본문에 비밀키·내부 URL·고객 데이터 없는지 확인. public 레포.

5. **중복 확인**:

   ```bash
   gh issue list --repo coseo12/volt --search "<키워드>" --state all
   ```

6. **이슈 생성** — capture-volt 스킬의 템플릿(`gh issue create --repo coseo12/volt --title "[knowledge|report] ..." --label "capture,knowledge|report" --body ...`)을 그대로 사용. 헤더명은 절대 바꾸지 않는다 (볼트 관리자의 수동 정제가 이 문자열을 기준으로 `notes/` 또는 `meta/*`로 이동한다).

7. **결과 보고** — 생성된 이슈 URL을 사용자에게 표시. 2건 이상이면 표로 정리.

## 자주 놓치는 규약

- 라벨은 **반드시 두 개**: `capture` + (`knowledge` 또는 `report`). 누락 시 이슈 생성 실패.
- 제목 접두사 `[knowledge] ` 또는 `[report] ` (대괄호, 소문자, 뒤 공백 1칸).
- 본문 헤더는 `### 출처 레포` / `### 태그` / `### 요약` / `### 본문` / `### 관련 노트/링크` (knowledge) 또는 `### 리포트 유형` / `### 출처 레포` / `### 태그` / `### 배경/상황` / `### 내용` / `### 교훈 / 다음에 적용할 점` (report). 공백·기호 포함 정확히.
- 선택 필드에 내용 없으면 `_No response_` 또는 섹션 생략.

## 금지

- 민감정보(비밀키, 토큰, 내부 URL, 고객 데이터) 포함.
- 헤더명 임의 변경.
- 여러 주제를 한 이슈에 묶기 — 1건 1주제 원칙.
- 사용자가 명시 요청하지 않은 캡처를 한꺼번에 대량 생성.
