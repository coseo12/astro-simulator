---
name: cross-validate
description: |
  외부 검증 모델 (Antigravity `agy`) 을 활용하여 코드, 설계, 스킬, 구조를 교차검증하는 스킬.
  Phase 1A (#269, 2026-06-18 Gemini CLI 종료 대응) 부터 gemini-cli → agy 교체.
  TRIGGER when: 교차검증이 필요할 때, "검증해줘", "cross-validate", "교차 리뷰",
  "agy로 확인", "gemini로 확인" (alias), "다른 시각", "두 번째 의견", 설계 리뷰, PR의 독립적 검토,
  스킬 품질 검증, 프레임워크 구조 점검이 필요할 때.
  ALSO TRIGGER (루틴): 정책·규약·ADR·CRITICAL DIRECTIVE 박제 직후 1회 — 단일 모델 편향 노출 효율이 박제 직후에 가장 높다 (volt #23).
  DO NOT TRIGGER when: 일반 코드 리뷰, 테스트 실행,
  외부 검증 모델과 무관한 작업일 때.
---

# 교차검증

외부 검증 모델 (Antigravity `agy`) 을 활용하여 산출물을 독립적으로 검증한다.
Claude 와 외부 모델의 이중 시각으로 단일 모델 편향을 방지한다.

## 사전 조건

```bash
# agy (Antigravity CLI) 설치 확인
command -v agy || echo "agy 미설치 — https://antigravity.google/docs/cli-overview 참조"

# 인증 + 응답성 확인
agy -p "hello" 2>&1 | head -3
```

## 권장 호출 경로 — `cross_validate.sh` (자동 가드)

자동화 검증은 아래 스크립트를 사용한다. 본 스크립트는 **L1 prompt strict prefix** (도구 호출 차단) + **L3 워킹트리 snapshot 가드** (사후 자동 롤백, #479) 를 자동 적용한다.

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

스크립트는 다음을 자동 처리:
- L1: prompt 에 strict prefix 자동 prepend (`STRICT INSTRUCTION: Do NOT execute any tool...`)
- L3: 워킹트리 snapshot pre/post 비교 + 도구 호출로 인한 파일 수정 자동 롤백
- capacity 폴백 (stderr `^Error: ` 패턴 매칭) + 재시도 + claude-only fallback
- outcome JSON 자동 생성 (`{LOG_DIR}/cross-validate-<type>-<timestamp>-outcome.json`)

## 검증 유형 (직접 호출 예제 — 디버깅용)

> ⚠ 직접 호출 시 L1/L3 가드가 자동 적용되지 않음. 자동화는 위 `cross_validate.sh` 권장.

### 1. 설계 검증 (architecture)

Architect 산출물을 검증한다.

```bash
# 직접 호출 — L1 strict prefix 수동 포함 권고
agy -p "$(cat <<'PROMPT'
STRICT INSTRUCTION: You are performing read-only code review and analysis. Do NOT execute any shell command or tool. Do NOT modify any file. Respond ONLY with text-based analysis.

---

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
)"
```

### 2. 코드 검증 (code)

PR의 변경 사항을 검증한다.

```bash
DIFF=$(gh pr diff <PR번호>)

agy -p "$(cat <<PROMPT
STRICT INSTRUCTION: You are performing read-only code review. Do NOT execute any shell command or tool. Do NOT modify any file. Respond ONLY with text-based analysis.

---

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
)"
```

### 3. 스킬 검증 (skill)

스킬의 형식과 트리거 정확도를 검증한다.

```bash
SKILL_CONTENT=$(cat .claude/skills/<스킬명>/SKILL.md)

agy -p "$(cat <<PROMPT
STRICT INSTRUCTION: Read-only analysis. Do NOT execute any tool. Respond with text only.

---

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
)"
```

### 4. 구조 검증 (structure)

프로젝트 전체 구조를 검증한다.

```bash
agy -p "$(cat <<'PROMPT'
STRICT INSTRUCTION: Read-only architecture analysis. Do NOT execute any tool or modify any file. Respond with text only.

---

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
)"
```

## 결과 분석

외부 검증 모델 (agy) 응답을 받은 후 Claude 가 수행하는 분석:

0. **(선행) 수용 전 실측 sanity check (volt #66)** — 외부 모델이 제안한 **수치 DoD 재정의·물리/환경 제약·완료 기준 강화** 는 ADR/계약 박제 전 1회 실 환경 실행 또는 단위 테스트 snippet 으로 **자가모순 확인** 선행. "이 조건이 정상 동작에서 실현 가능한가?" 를 현존 시스템에서 직접 확인한다. **30분 실측 > 2차 수정 비용**. AI (Claude + 외부 모델 공유) 는 "엄격한 DoD = 안전" 편향으로 self-contradiction 을 간과하는 경향 — 실측이 유일한 가드.
1. **합의 항목 식별**: 두 모델이 동의하는 문제 → 높은 신뢰도
2. **이견 항목 식별**: 두 모델이 다른 의견 → 양쪽 근거 제시
3. **외부 모델 고유 발견**: Claude 가 놓친 문제 → 추가 검토
4. **오탐 필터링**: 외부 모델의 잘못된 지적 → 근거와 함께 기각

## 수용 vs 후속 분리 3단 프로토콜 (volt #29)

고유 발견을 현재 PR 에 즉시 반영할지 후속 이슈로 분리할지의 판단 절차. 스프린트 계약(특히 **비목표**)이 외부 모델 제안보다 우선한다.

1. **합의 선별** — Claude 설계와 일치하는 외부 모델 지적은 현재 PR 에 즉시 반영. 이견은 근거 비교 후 취사.
2. **고유 발견의 범위 체크** — 외부 모델만의 제안이면 현재 스프린트 계약의 **비목표** 와 대조:
   - 범위 내 → 현재 PR 에 반영
   - 범위 밖 (비목표와 상충) → **후속 이슈로 분리**
   - 판단 질문: "이 변경이 현재 PR 의 `Behavior Changes` 에 원 완료 기준과 직교하는 항목을 추가하는가?"
3. **분리 시 박제 규칙** — 후속 이슈를 **즉시 생성**해 맥락 유실 방지:
   - 본문에 외부 모델 제안의 설계 스케치 인용
   - 원 PR 과 링크 (`Builds on: #원PR`)
   - 우선순위 초안 명시 (high / medium / low)

### 금지

- 스프린트 비목표를 "외부 모델 제안이 타당하다" 는 이유만으로 무시 (CRITICAL #6 침범)
- 분리 판단 없이 현재 PR 로 수용하여 스코프 팽창
- 분리 후 이슈 생성을 미루어 맥락 유실

### 참고 사례

harness #89 (post-apply 게이트) 교차검증에서 Gemini (당시 백엔드) 가 `previousSha256` 매니페스트 스키마 확장을 제안. 비목표 "매니페스트 스키마 변경 없음"과 상충 → 후속 이슈 #92 로 분리 → 3 PR / 3 릴리스로 자연 분할되어 각 단계 위험 독립. 고유 발견 안에서도 비용/범위에 따라 취사한다.

## 결과 보고 형식

```markdown
## 교차검증 보고서

### 검증 대상
- 유형: [architecture/code/skill/structure]
- 대상: [파일 또는 PR 번호]

### 외부 모델 (agy) 피드백 요약
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

- 외부 검증 모델 (agy) 호출 시 **L1 strict prompt prefix** 자동 prepend (`cross_validate.sh` 경유 시 자동, 직접 호출 시 수동 포함 권고)
- L3 워킹트리 snapshot 가드 (#479) 가 사후 검증 + 자동 롤백 수행 — 직접 호출 시 워킹트리 변경 가능성 인지
- 외부 모델 출력을 맹목적으로 수용하지 않는다. Claude 가 반드시 재분석한다.
- 검증 결과는 로그 파일에 기록한다 (`${LOG_DIR}/cross-validate-<type>-<timestamp>.log`)
- **로그 rotation (#858)**: `${LOG_DIR}` 의 cross-validate 로그/outcome 은 30일 초과분을 정리한다 — `find .claude/logs -name 'cross-validate-*' -mtime +30 -delete`. `cv-*` snapshot 임시파일은 정상 종료 시 스크립트가 자동 삭제하며, 잔존분 (비정상 종료 run) 은 발견 시 수동 정리한다
- 민감한 정보(시크릿, 인증 토큰)가 포함된 파일은 외부 모델에 전달하지 않는다 (`is_sensitive()` 자동 필터).
- 두 모델의 합의된 문제는 우선적으로 해결한다.
- capacity 실패 시 cross_validate.sh 가 자동 폴백 (재시도 → claude-only fallback exit 77). stderr 패턴: `^Error: (timed out|rate limit|quota|not logged|unauthorized|forbidden)`

## 환경변수 (cross_validate.sh)

| 변수 | 기본 | 설명 |
|---|---|---|
| `EXTERNAL_VALIDATOR_RETRY_SLEEP_SECONDS` | 5 | 재시도 sleep 단위 (테스트는 0) |
| `EXTERNAL_VALIDATOR_RETRY_SLEEP_CAP` | 300 | sleep 상한 (지수 backoff cap) |
| `EXTERNAL_VALIDATOR_PRINT_TIMEOUT` | 300s | agy `--print-timeout` 값 |
| `SKIP_CAPACITY_PROBE` | 0 | 1 이면 capacity probe 생략 (free tier quota 보존) |
| `LOG_DIR` | `${PROJECT_DIR}/.claude/logs` | 로그 출력 디렉토리 (테스트 격리) |
| `CROSS_VALIDATE_ANCHOR` | (없음) | 폴백 시 reminder 이슈 생성 트리거 |
| `REMINDER_ISSUE_DRYRUN` | 1 | 0 이면 실제 reminder 이슈 생성 |

### backward-compat alias (Phase 4 #272 부터 제거)
Phase 1A ~ Phase 4 사이 deprecation 기간 동안 인식되던 `GEMINI_MODEL` / `GEMINI_RETRY_SLEEP_SECONDS` / `GEMINI_RETRY_SLEEP_CAP` alias 는 **Phase 4 (#272) 부터 제거** (fail-fast 원칙). 다운스트림은 `EXTERNAL_VALIDATOR_*` 로 마이그레이션 필수.
