---
description: 페르소나별 작업 큐 + 라벨 무결성 대시보드 (이슈/PR을 stage:* 라벨 기준으로 집계)
argument-hint: [--stale-days N | --owner owner/repo]
allowed-tools: [Bash, Read]
---

# /team-status — 팀 대시보드

GitHub 이슈/PR을 `stage:*` 라벨 기준으로 집계해 페르소나별 작업 큐를 보여준다.
별도 상태 파일 없음 — 라벨이 SSoT.

## 사용자 입력
`$ARGUMENTS`

## 절차

1. **저장소 결정**: `--owner` 인자 없으면 현재 저장소.

2. **이슈 + PR 수집**:
   ```bash
   gh issue list --state open --limit 100 --json number,title,labels,updatedAt,assignees,url
   gh pr list --state open --limit 100 --json number,title,labels,updatedAt,isDraft,url
   ```

3. **stage:* 라벨별 분류**:

   | 라벨 | 다음 페르소나 | 의미 |
   |---|---|---|
   | `stage:planning` | `/pm` | 스프린트 계약 작성 중 |
   | `stage:design` | `/architect` | 설계 + ADR 대기 |
   | `stage:dev` | `/dev` | 구현 대기 |
   | `stage:review` | `/review` | 정적 리뷰 대기 |
   | `stage:qa` | `/qa` | 동적 검증 대기 |
   | `stage:done` | (사용자 머지) | 머지 대기 |

4. **이상 상태 감지**:
   - 다중 stage:* 라벨 동시 부여 → 라벨 무결성 깨짐 (경고)
   - stage:* 라벨 없는 open 이슈/PR → 분류 미정 (안내: `/pm` 또는 `/next`)
   - `--stale-days N` (기본 7) 보다 오래 갱신 안 된 항목 → stale 표시

5. **출력 포맷**:
   ```
   ## /team-status — <owner/repo> (UTC <시각>)

   ### 작업 큐 (페르소나별)
   /pm        (planning) : 2건  #12 #15
   /architect (design)   : 1건  #11
   /dev       (dev)      : 3건  #8 #9 #10  ← stale: #8 (10일)
   /review    (review)   : 1건  PR#22
   /qa        (qa)       : 0건
   사용자 머지 (done)    : 2건  PR#19 PR#21

   ### 이상 상태 ⚠
   - PR#23: stage:* 라벨 없음 — `/next 23` 권장
   - 이슈#7: stage:dev + stage:review 동시 부여 → 정리 필요

   ### 권장 다음 액션
   - 사용자 머지 가능: PR#19, PR#21
   - stale 검토: 이슈#8 (10일 미갱신)
   - 분류 미정: PR#23
   ```

6. **정책 통합**: 정책이 `auto`인 페르소나에 대기 큐가 있으면 "자동 호출 가능" 표시.

## 한계 / 주의

- gh 미인증 / 원격 미설정 → 분명한 오류 메시지 + exit
- 100건 초과 저장소는 페이징 미지원 (필요 시 후속 PR)
- 페르소나가 동시에 처리 가능한 항목 수는 표시하지 않음 — *사용자 검토 대역폭이 진짜 병목*

## 사용 예

```
/team-status                    # 현재 저장소, 7일 stale 기준
/team-status --stale-days 3     # 3일 미갱신을 stale로
/team-status --owner foo/bar    # 다른 저장소
```
