---
description: Reviewer 페르소나로 PR 정적 리뷰 (sub-agent 격리 호출, 라벨 전이)
argument-hint: <PR번호 | 미지정 시 현재 브랜치 PR>
allowed-tools: [Bash, Read, Grep, Agent]
---

# /review — PR 정적 리뷰

reviewer 페르소나를 sub-agent로 호출. developer와 격리된 컨텍스트에서 5축 검토(로직/보안/일관성/단순성/추적성) 수행.

## 사용자 입력
`$ARGUMENTS`

## 절차

1. **PR 번호 결정**:
   ```bash
   PR=${ARG:-$(gh pr view --json number -q .number)}
   ```
2. **정책 확인**: `.harness/policy.json` 의 `reviewer` 정책이 `auto`면 자동 진행, `manual`이면 사용자 확인 후.
3. **sub-agent 디스패치**: Agent tool로 `subagent_type: reviewer`(또는 일반 agent + reviewer.md 페르소나 로드) 호출. 입력으로 `gh pr view`/`gh pr diff` 결과 + 연결 이슈 본문 전달.
4. **결과 처리**: sub-agent가 PR 코멘트 작성 + 라벨 전이를 직접 수행. 이 명령은 결과 요약만 보고.
5. **다음 단계 안내**: 통과 시 `/qa <PR>`, 차단 시 `/dev <PR>` 안내.

## 정책 적용 (force_review_on)

`.harness/policy.json`의 `force_review_on` 에 `architect-decision` 등이 있으면, architect가 만든 ADR 변경이 포함된 PR은 정책 무관 사용자 확인 강제.

## 금지
- 페르소나 컨텍스트 오염 금지 — sub-agent 호출 외에 reviewer 역할을 메인 컨텍스트에서 흉내내지 않음
- 라벨 전이 누락 시 경고
