---
description: Thin orchestrator — 이슈/PR 라벨을 읽고 다음 페르소나를 정책에 따라 추천/호출
argument-hint: <이슈번호 또는 PR번호 | 미지정 시 현재 브랜치 연결>
allowed-tools: [Bash, Read, Agent]
---

# /next — 다음 페르소나로 진행

이슈/PR의 `stage:*` 라벨을 읽고 다음 단계 페르소나를 정책에 따라 자동/수동 호출.
무거운 state는 두지 않음 — 라벨이 SSoT.

## 사용자 입력
`$ARGUMENTS`

## 절차

1. **대상 결정**:
   - 인자가 이슈 번호면 이슈, PR 번호면 PR
   - 미지정: 현재 브랜치의 PR → 없으면 연결 이슈
2. **현재 라벨 읽기**:
   ```bash
   gh issue view <번호> --json labels -q '.labels[].name'
   # 또는 gh pr view ... --json labels -q '.labels[].name'
   ```
3. **다음 페르소나 결정 표**:

   | 현재 라벨 | 다음 명령 | 비고 |
   |---|---|---|
   | (없음 / new) | `/pm` | 스프린트 계약 작성 |
   | `stage:planning` | `/pm` 마무리 → 라벨 전이 → `/architect` | pm이 아직 안 끝났을 가능성 |
   | `stage:design` | `/architect` | 설계 + ADR |
   | `stage:dev` | `/dev` | 구현 (developer.md) |
   | `stage:review` | `/review` | 정적 리뷰 |
   | `stage:qa` | `/qa` | 동적 검증 |
   | `stage:done` | (사용자 머지) | 자동 머지 안 함 (CRITICAL #1) |

4. **정책 적용**: `.harness/policy.json` 의 해당 페르소나 정책.
   - `auto` + `force_review_on` 미발동 → 자동 호출
   - 그 외 → 사용자에게 다음 명령 안내, 사용자 승인 후 호출

5. **이상 상태 감지**:
   - 다중 `stage:*` 라벨 동시 존재 → 경고 (라벨 무결성 깨짐)
   - 알 수 없는 라벨 → 경고 + 스킵
   - PR이 머지되어 있는데 `stage:done` 아님 → 라벨 전이 제안

6. **결과 보고**: 호출한 명령(또는 안내한 다음 명령) + 라벨 전이 결과.

## 금지
- 머지 자동화 금지 (`stage:done` 도달해도 머지는 사용자)
- 라벨을 무시하고 임의 페르소나 호출 금지
- 페르소나 컨텍스트 오염 — `/next`는 *디스패처*일 뿐, 직접 작업 안 함
