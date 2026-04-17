---
name: capture-volt
description: |
  재사용 가능한 지식/경험/의사결정을 coseo12/volt 레포의 GitHub Issue로 캡처하여
  RAG 원천 데이터로 축적하는 스킬. AGENTS.md 규약(라벨·제목 접두사·본문 헤더명)을 따른다.
  TRIGGER when: 세션 중 agent/skill 개선에 유용한 교훈·패턴·결정이 발생했을 때,
  회고를 남겼을 때, 사용자가 "볼트에 남겨", "volt 캡처", "knowledge 기록", "volt에 넘겨" 등을 요청했을 때.
  DO NOT TRIGGER when: 프로젝트 내부 이슈/PR 생성일 때(create-issue 사용), 민감정보 포함 콘텐츠일 때.
---

# Volt 캡처

`coseo12/volt`는 Claude Code agent/skill 개선용 RAG 원천 데이터 저장소(공개).
이 스킬은 AGENTS.md 규약에 맞춰 `gh issue create`로 이슈를 생성한다.

## 사전 조건

1. 레포는 public — **민감정보(비밀키, 내부 URL, 고객 데이터) 절대 금지**.
2. 라벨이 없으면 실패. 첫 사용 시 아래 명령 실행:

```bash
gh label create capture   --repo coseo12/volt --color "0E8A16" --description "캡처된 이슈" || true
gh label create knowledge --repo coseo12/volt --color "1D76DB" --description "재사용 가능한 지식" || true
gh label create report    --repo coseo12/volt --color "5319E7" --description "작업 리포트" || true
```

## 분류 결정 트리

```
캡처할 내용이 무엇인가?
│
├─ 시간·맥락 독립, 재사용 가능 개념/패턴/도구 사용법
│   → knowledge
│
└─ 특정 작업의 경험·결과·결정
    → report + report_type 중 하나:
        ├─ troubleshooting : 문제 해결 기록
        ├─ retrospective   : 회고
        ├─ research        : 조사/리서치
        ├─ decision        : 도구/접근법 선택 근거  (→ meta/decisions/)
        ├─ feedback        : AI 동작 피드백        (→ meta/feedback/)
        └─ pattern         : 반복 관찰된 워크플로 패턴 (→ meta/patterns/)
```

판단 애매 시 폴백: `report` + `research`.

## 중복 방지

이슈 생성 전 반드시 유사 이슈 확인:

```bash
gh issue list --repo coseo12/volt --search "키워드" --state all
```

## 본문 구조 (헤더명 고정 — 볼트 규약)

### knowledge 타입

```markdown
### 출처 레포

{owner}/{repo} (또는 생략)

### 태그

tag1, tag2

### 요약

한 문단 핵심 요약.

### 본문

상세 내용.

### 관련 노트/링크

- URL 또는 노트명
```

### report 타입

```markdown
### 리포트 유형

troubleshooting | retrospective | research | decision | feedback | pattern

### 출처 레포

{owner}/{repo}

### 태그

tag1, tag2

### 배경/상황

어떤 작업 중 어떤 문제/결정이 있었는가.

### 내용

시도·관찰·결론·교훈.

### 교훈 / 다음에 적용할 점

agent/skill 개선에 반영할 포인트.
```

선택 필드에 내용이 없으면 `_No response_` 또는 섹션 생략.

## 제목 규약

- 접두사 고정: `[knowledge] ` 또는 `[report] ` (대괄호 포함, 소문자, 뒤 공백 1칸)
- 본체: 핵심을 한 문장으로, 가급적 60자 이내

## gh 명령 템플릿

### knowledge

```bash
gh issue create \
  --repo coseo12/volt \
  --title "[knowledge] {핵심 요약}" \
  --label "capture,knowledge" \
  --body "$(cat <<'EOF'
### 출처 레포

{owner}/{repo}

### 태그

{comma-separated}

### 요약

{한 문단}

### 본문

{상세}

### 관련 노트/링크

- {URL or note}
EOF
)"
```

### report

```bash
gh issue create \
  --repo coseo12/volt \
  --title "[report] {핵심 요약}" \
  --label "capture,report" \
  --body "$(cat <<'EOF'
### 리포트 유형

{troubleshooting|retrospective|research|decision|feedback|pattern}

### 출처 레포

{owner}/{repo}

### 태그

{comma-separated}

### 배경/상황

{배경}

### 내용

{시도·관찰·결론}

### 교훈 / 다음에 적용할 점

{takeaway}
EOF
)"
```

## 절차

1. **분류 결정**: knowledge / report + 세부 유형 확정.
2. **민감정보 스캔**: 본문에 비밀키·내부 URL·고객 데이터 없는지 확인.
3. **중복 검색**: `gh issue list ... --search`로 유사 이슈 확인.
4. **이슈 생성**: 위 템플릿으로 `gh issue create` 실행.
5. **생성 URL 사용자에게 보고**.

## 금지/주의

- 헤더명(`### 리포트 유형` 등) 변경 금지 — 볼트 관리자(수동 정제)가 이 문자열을 기준으로 `notes/` 또는 `meta/*`로 이동한다.
- 라벨·제목 접두사 생략 금지.
- 민감정보 포함 금지 (public 레포).
- 본 스킬은 **이슈 생성까지만** 책임짐. 파일 변환·정제는 볼트 측 워크플로 몫.

## 참고

- [volt README](https://github.com/coseo12/volt/blob/main/README.md)
- [volt AGENTS.md](https://github.com/coseo12/volt/blob/main/AGENTS.md) — 이 스킬의 원본 규약
- [volt CONTRIBUTING.md](https://github.com/coseo12/volt/blob/main/CONTRIBUTING.md)
