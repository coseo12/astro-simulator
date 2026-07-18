---
description: Developer 페르소나로 이슈 구현 (sub-agent 격리)
argument-hint: <이슈번호 | 미지정 시 stage:dev 라벨 이슈>
allowed-tools: [Bash, Read, Grep, Agent]
---

# /dev — 이슈 구현

developer 페르소나를 sub-agent 로 호출. 설계안(있는 경우)을 기반으로 feature 브랜치에서 구현 + 테스트 + PR 생성까지.

## 사용자 입력

`$ARGUMENTS`

## 절차

1. **이슈 결정** — 인자의 이슈번호. 미지정 시 `stage:dev` 라벨 이슈 목록을 제시하고 사용자 선택
2. **정책 확인** — `.harness/policy.json` 의 `developer` 정책 (기본: manual). 파일 부재 시 전 페르소나 manual 기본 (upstream `lib/policy.js` DEFAULT_POLICY 동형)
3. **사전 조건**: 라벨이 `stage:dev` 인지 확인. 아니면 architect 미통과 → 경고 후 중단(또는 강제 옵션)
4. **sub-agent 디스패치** — developer.md 페르소나 로드, 이슈 본문 + 설계안(architect 산출물) + 스프린트 계약 전달
5. **결과 처리** — sub-agent 가 `feature/<이슈번호>-<설명>` 브랜치 커밋 + `create-pr` 스킬로 PR 생성 (`stage:review` 부착)
6. **다음 단계 안내**: `/review <PR>` (reviewer 디스패치)

## 금지

- 메인 컨텍스트에서 직접 구현 금지 (페르소나 격리)
- develop/main 직접 커밋 금지 — feature 브랜치 강제 (CRITICAL #1)
- 머지 자동화 금지 — 머지는 reviewer/qa 게이트 통과 후
