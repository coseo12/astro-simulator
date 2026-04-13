---
name: create-issue
description: |
  GitHub 이슈를 생성하고 라벨을 할당하는 스킬.
  TRIGGER when: 에이전트가 새 작업 이슈를 생성해야 할 때, 요구사항을 이슈로 분해할 때,
  버그를 보고할 때, 기술 부채를 추적할 때, "이슈 만들어", "이슈 생성", "task 생성" 등의 요청.
  DO NOT TRIGGER when: 이슈를 조회하거나 수정만 할 때, PR 관련 작업일 때.
---

# 이슈 생성

GitHub 이슈를 프레임워크의 라벨 체계에 맞게 생성한다.

## 절차

1. 이슈 내용을 아래 템플릿에 맞게 구성한다.
2. 라벨 가이드를 참고하여 적절한 라벨을 결정한다.
3. `gh issue create` 로 이슈를 생성한다.
4. 의존성이 있으면 관련 이슈에 코멘트로 연결한다.

## 이슈 템플릿

```markdown
## 설명
[작업 내용 요약 — 한 문단 이내]

## 배경
[왜 이 작업이 필요한지]

## 완료 조건
- [ ] 조건 1
- [ ] 조건 2

## 의존성
- 선행: #이슈번호 (없으면 "없음")
- 후행: #이슈번호 (없으면 "없음")

## 기술 참고
[Architect가 참고할 기술적 맥락. 없으면 생략]
```

## 명령어

```bash
# 이슈 생성
gh issue create \
  --title "[타입] 제목" \
  --body "$(cat <<'EOF'
## 설명
...

## 완료 조건
- [ ] ...

## 의존성
- 선행: 없음
EOF
)" \
  --label "agent:developer,priority:medium,status:todo,size:m,type:feature"

# 의존성 연결
gh issue comment <이슈번호> --body "의존성: #<선행이슈번호> 완료 후 착수"
```

## 라벨 가이드

| 카테고리 | 값 | 설명 |
|----------|-----|------|
| **에이전트** | `agent:planner` `agent:pm` `agent:architect` `agent:developer` `agent:frontend-developer` `agent:backend-developer` `agent:reviewer` `agent:qa` `agent:auditor` `agent:integrator` `agent:skill-creator` `agent:cross-validator` `agent:releaser` | 담당 에이전트 |
| **범위** | `scope:frontend` `scope:backend` `scope:fullstack` | FE/BE 구분 |
| **우선순위** | `priority:critical` `priority:high` `priority:medium` `priority:low` | 처리 긴급도 |
| **크기** | `size:s` `size:m` `size:l` `size:xl` | s=1-2h, m=반나절, l=1일, xl=2일+ |
| **타입** | `type:feature` `type:bug` `type:refactor` `type:infra` | 작업 분류 |
| **상태** | `status:todo` `status:in-progress` `status:review` `status:audit-passed` `status:qa` `status:qa-passed` `status:done` `status:blocked` | 진행 상태 |

## 규칙

- 하나의 이슈는 하나의 책임만 가진다. 너무 크면 분해한다.
- 모든 이슈에 최소 에이전트, 우선순위, 상태, 타입 라벨을 할당한다.
- 의존성이 순환하지 않도록 한다.
- 완료 조건은 검증 가능한 형태로 작성한다 ("~를 구현한다" X → "~가 동작한다" O).
