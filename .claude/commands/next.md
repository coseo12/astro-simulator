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
   - **`strip-stage-labels.yml` 도입 이후 머지된 PR** 에 `stage:*` 잔존 → **조사 대상** (#1178 / #1182). 원인이 **두 갈래**이므로 `gh run list --workflow=strip-stage-labels.yml` 로 먼저 가른다:
     - **run 없음 / `failure`** → workflow 미발동. run 로그를 조사한다
     - **run `success`** → 머지 **이후** 부착된 라벨이다. 그 workflow 는 `types: [closed]` 만 청취하고 `labeled` 를 청취하지 않으므로 사후 부착분은 정상 발화에도 잔존한다. 이 경우 조사할 결함이 없으니 **라벨을 제거**하면 된다 (`gh api --method DELETE .../issues/<N>/labels/<enc>`). 판정은 timeline 의 `labeled` 이벤트 시각이 `mergedAt` 보다 뒤인지로 한다
     - **탐색 윈도우**: `mergedAt >= 2026-09-01T02:41:56Z` (PR #1179 머지 시각) 인 PR 만 대상 — **경계 포함**이다. 배제(`>`)로 잡으면 배선의 첫 실발화를 증명하는 #1179 자신이 윈도우 밖으로 빠진다. 경계를 「최근 N일」이 아니라 **자동화의 사거리**로 잡는 이유는 시간 임계가 또 하나의 추정값이 되기 때문이다 (CLAUDE.md §`deferred:no-incident` 수명주기와 같은 논거)
     - **윈도우 밖(레거시) 잔존은 지적하지 않는다** — 자동 제거는 미래 머지에만 발동하므로 도입 이전 머지분의 `stage:*` 는 영구 잔존이 정상이다. 지적하면 매 실행마다 같은 목록이 반복된다 (#1182 실측: 윈도우 없이 `98` 건)
     - `stage:done` 여부는 판정 기준이 **아니다** — `stage:done` = "완료 — 사용자 머지 대기" 는 머지 **전** 상태다

6. **결과 보고**: 호출한 명령(또는 안내한 다음 명령) + 라벨 전이 결과.

## 금지
- 머지 자동화 금지 (`stage:done` 도달해도 머지는 사용자)
- 라벨을 무시하고 임의 페르소나 호출 금지
- 페르소나 컨텍스트 오염 — `/next`는 *디스패처*일 뿐, 직접 작업 안 함
