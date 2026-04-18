---
description: Architect 페르소나로 이슈에 설계안 + (필요 시) ADR 작성 (sub-agent 격리)
argument-hint: <이슈번호 | 미지정 시 현재 브랜치 연결 이슈>
allowed-tools: [Bash, Read, Grep, Glob, Agent]
---

# /architect — 설계 결정

architect 페르소나를 sub-agent로 호출. 이슈의 스프린트 계약을 기반으로 설계안 + (트리거 시) ADR 생성. 라벨을 `stage:design` → `stage:dev` 로 전이.

## 사용자 입력
`$ARGUMENTS`

## 절차

1. **이슈 번호 결정**:
   ```bash
   ISSUE=${ARG:-$(gh issue list --search "in:title $(git branch --show-current)" --json number -q '.[0].number')}
   ```
   또는 사용자에게 명시 요청.

2. **사전 조건 확인**: 이슈 라벨이 `stage:design`인지 (또는 처음 호출 시 `stage:planning`에서 진입 가능).

3. **정책 확인**: `.harness/policy.json` 의 `architect` 정책. 기본은 `manual` — sub-agent 호출 전 사용자 승인.

4. **sub-agent 디스패치**: Agent tool로 architect 페르소나 호출. 입력으로 다음 전달:
   - `gh issue view <번호> --json title,body,labels` 결과
   - 코드베이스 구조 요약 (사용자가 영역 힌트 줄 수 있음)

5. **결과 처리**: sub-agent가 이슈 코멘트 + ADR 파일 + 라벨 전이를 직접 수행. 메인 컨텍스트는 결과 요약만 보고:
   - 작성된 ADR 경로 (있다면)
   - 이슈 코멘트 링크
   - 다음 단계: `/dev <이슈번호>` 안내

6. **force_review 트리거**: ADR 생성된 경우, 후속 PR의 `/review` 호출 시 정책 `force_review_on: ["architect-decision"]` 발동을 사용자에게 미리 안내.

## 금지
- 페르소나 컨텍스트 오염 금지 — sub-agent 호출 외에 architect 역할을 메인 컨텍스트에서 흉내내지 않음
- 코드 직접 수정 — architect는 설계만, 구현은 developer
- 라벨 전이 누락 시 경고
