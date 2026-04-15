#!/usr/bin/env bash
# 페르소나 핸드오프용 stage 라벨을 GitHub 저장소에 생성한다.
# 멱등: 이미 존재하면 스킵.

set -e

REPO=${1:-$(gh repo view --json nameWithOwner -q .nameWithOwner)}

declare -a LABELS=(
  "stage:planning|FEF2C0|pm 단계 — 요구사항 명료화 및 스프린트 계약"
  "stage:design|C5DEF5|architect 단계 — 설계/ADR"
  "stage:dev|BFD4F2|developer 단계 — 구현"
  "stage:review|FBCA04|reviewer 단계 — 정적 리뷰"
  "stage:qa|D4C5F9|qa 단계 — 동적 검증"
  "stage:done|0E8A16|완료 — 사용자 머지 대기"
)

for entry in "${LABELS[@]}"; do
  IFS='|' read -r name color desc <<< "$entry"
  if gh label create "$name" --repo "$REPO" --color "$color" --description "$desc" 2>/dev/null; then
    echo "  [생성] $name"
  else
    echo "  [존재] $name (스킵)"
  fi
done

echo "✅ stage:* 라벨 셋업 완료 ($REPO)"
