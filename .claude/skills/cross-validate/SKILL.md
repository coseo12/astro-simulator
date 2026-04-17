---
name: cross-validate
description: |
  Gemini CLI를 활용하여 코드, 설계, 스킬, 구조를 교차검증하는 스킬.
  TRIGGER when: 교차검증이 필요할 때, "검증해줘", "cross-validate", "교차 리뷰",
  "gemini로 확인", "다른 시각", "두 번째 의견", 설계 리뷰, PR의 독립적 검토,
  스킬 품질 검증, 프레임워크 구조 점검이 필요할 때.
  ALSO TRIGGER (루틴): 정책·규약·ADR·CRITICAL DIRECTIVE 박제 직후 1회 — 단일 모델 편향 노출 효율이 박제 직후에 가장 높다 (volt #23).
  DO NOT TRIGGER when: 일반 코드 리뷰, 테스트 실행,
  Gemini와 무관한 작업일 때.
---

# 교차검증

Gemini CLI를 외부 검증 도구로 활용하여 산출물을 독립적으로 검증한다.
Claude와 Gemini의 이중 시각으로 단일 모델 편향을 방지한다.

## 사전 조건

```bash
# Gemini CLI 설치 확인
command -v gemini || echo "gemini CLI 미설치"

# 인증 확인
gemini -p "hello" --approval-mode plan 2>&1 | head -3
```

## 검증 유형

### 1. 설계 검증 (architecture)

Architect 산출물을 검증한다.

```bash
# 설계 문서를 Gemini에 전달
gemini -p "$(cat <<'PROMPT'
당신은 소프트웨어 아키텍처 리뷰어입니다.
아래 설계 문서를 검증해주세요.

검증 기준:
1. 구조적 완성도 — 빠진 컴포넌트가 없는지
2. 기술 결정 타당성 — 선택의 근거가 합리적인지
3. 확장성 — 향후 변경에 유연한지
4. 보안 — 위험한 설계 패턴이 없는지
5. 누락 요소 — 고려하지 못한 사항이 있는지

한국어로 항목별 평가와 개선 제안을 해주세요.
PROMPT
)" --approval-mode plan
```

### 2. 코드 검증 (code)

PR의 변경 사항을 검증한다.

```bash
# PR diff를 Gemini에 전달
DIFF=$(gh pr diff <PR번호>)

gemini -p "$(cat <<PROMPT
당신은 시니어 코드 리뷰어입니다.
아래 코드 변경사항을 리뷰해주세요.

검증 기준:
1. 로직 정확성 — 버그, 오프바이원, 경쟁 조건
2. 보안 — 인젝션, XSS, 하드코딩된 시크릿
3. 성능 — 불필요한 루프, 메모리 누수
4. 엣지 케이스 — 빈 입력, null, 경계값
5. 설계 준수 — 기존 패턴과 일관성

변경 내용:
${DIFF}

한국어로 항목별 평가와 구체적 개선 제안을 해주세요.
PROMPT
)" --approval-mode plan
```

### 3. 스킬 검증 (skill)

스킬의 형식과 트리거 정확도를 검증한다.

```bash
SKILL_CONTENT=$(cat .claude/skills/<스킬명>/SKILL.md)

gemini -p "$(cat <<PROMPT
당신은 Claude Code 스킬 검증자입니다.
아래 스킬을 검증해주세요.

검증 기준:
1. frontmatter 형식 — name(kebab-case), description(트리거 조건 명시)
2. description 품질 — TRIGGER when/DO NOT TRIGGER when 패턴 사용 여부
3. 본문 완성도 — 절차, 명령어, 규칙이 실행 가능한지
4. 트리거 정확도 — description으로 과소/과다 트리거 가능성
5. 500줄 이하 여부

스킬 내용:
${SKILL_CONTENT}

한국어로 항목별 평가와 개선 제안을 해주세요.
PROMPT
)" --approval-mode plan
```

### 4. 구조 검증 (structure)

프로젝트 전체 구조를 검증한다.

```bash
gemini -p "$(cat <<'PROMPT'
당신은 소프트웨어 아키텍처 리뷰어입니다.
이 저장소의 전체 구조를 검증해주세요.

검증 기준:
1. 구조적 완성도 — 에이전트, 스킬, 스크립트가 빠짐없이 연결되어 있는지
2. 워크플로우 일관성 — 상태 전이, 라벨, 통신 방식에 모순이 없는지
3. 실행 가능성 — 스크립트가 동작하는지, 빠진 의존성이 없는지
4. 확장성 — 새 에이전트/스킬 추가 시 구조가 유연한지
5. 보안/안전성 — 위험한 패턴이 없는지
6. 누락 요소 — 빠진 것이 있는지

한국어로 답변해주세요.
PROMPT
)" --approval-mode plan
```

## 실행 스크립트

자동화된 검증은 아래 스크립트를 사용한다:

```bash
# 구조 검증
.claude/skills/cross-validate/scripts/cross_validate.sh structure

# PR 코드 검증
.claude/skills/cross-validate/scripts/cross_validate.sh code <PR번호>

# 설계 문서 검증
.claude/skills/cross-validate/scripts/cross_validate.sh architecture <파일경로>

# 스킬 검증
.claude/skills/cross-validate/scripts/cross_validate.sh skill <스킬명>
```

## 결과 분석

Gemini 응답을 받은 후 Claude가 수행하는 분석:

1. **합의 항목 식별**: 두 모델이 동의하는 문제 → 높은 신뢰도
2. **이견 항목 식별**: 두 모델이 다른 의견 → 양쪽 근거 제시
3. **Gemini 고유 발견**: Claude가 놓친 문제 → 추가 검토
4. **오탐 필터링**: Gemini의 잘못된 지적 → 근거와 함께 기각

## 결과 보고 형식

```markdown
## 교차검증 보고서

### 검증 대상
- 유형: [architecture/code/skill/structure]
- 대상: [파일 또는 PR 번호]

### Gemini 피드백 요약
| 항목 | 평가 | 상세 |
|------|------|------|
| ... | 양호/주의/위험 | ... |

### 핵심 발견
1. [발견 — 심각도: 높음/중간/낮음]

### Claude 분석
- 동의: ...
- 이견: ... (근거: ...)

### 권장 조치
- [ ] 조치 1

### 결론
[통과 / 조건부 통과 / 반려]
```

## 규칙

- Gemini는 항상 `--approval-mode plan` (읽기 전용)으로 실행한다. 코드 변경을 허용하지 않는다.
- Gemini 출력을 맹목적으로 수용하지 않는다. Claude가 반드시 재분석한다.
- 검증 결과는 로그 파일에 기록한다.
- 민감한 정보(시크릿, 인증 토큰)가 포함된 파일은 Gemini에 전달하지 않는다.
- 두 모델의 합의된 문제는 우선적으로 해결한다.
