---
description: QA 페르소나로 PR 동적 검증 (빌드/테스트/3단계 브라우저, sub-agent 격리)
argument-hint: <PR번호 | 미지정 시 현재 브랜치 PR>
allowed-tools: [Bash, Read, Grep, Agent]
---

# /qa — PR 동적 검증

qa 페르소나를 sub-agent로 호출. CRITICAL #3 (브라우저 3단계 검증) + 빌드/테스트 + 스프린트 계약 동적 항목 검증.

## 사용자 입력
`$ARGUMENTS`

## 절차

1. **PR 번호 결정** — `/review`와 동일 패턴
2. **정책 확인** — `.harness/policy.json` 의 `qa` 정책 (기본: manual)
3. **사전 조건**: 라벨이 `stage:qa`인지 확인. 아니면 reviewer 미통과 → 경고 후 중단(또는 강제 옵션).
4. **sub-agent 디스패치** — qa.md 페르소나 로드, PR diff + 이슈 본문 + 검증 환경(개발 서버 기동 가능 여부) 전달
5. **결과 처리** — sub-agent가 PR 코멘트(증거 포함) + 라벨 전이 수행
6. **다음 단계 안내**:
   - 통과(`stage:done`): "사용자 머지 대기" — 머지는 항상 사용자 (CRITICAL #1)
   - 차단(`stage:dev` 되돌림): 원인 + 수정점 표시

## 금지
- 머지 자동화 금지 — qa 통과해도 머지는 사용자
- 페르소나 메인 컨텍스트 오염 금지
