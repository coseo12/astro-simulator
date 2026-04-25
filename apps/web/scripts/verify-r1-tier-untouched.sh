#!/usr/bin/env bash
# R1 #329 — Q3=C 비-범위 가드.
#
# 본 스크립트는 R1 PR 에서 tier 시스템 (`tier.ts` / `tier-transition.ts` / `lod-body-thresholds.ts`)
# 변경이 0 라인인지 검증한다. PM 합의 (#329 라운드 2 Q3=C):
#   "Body tier 전환 시 sunScale 동작 정의는 R1 비-범위. tier 변경 자체에 손대지 않음."
#
# 사용법:
#   bash apps/web/scripts/verify-r1-tier-untouched.sh                    # develop 대비
#   BASE=origin/develop bash apps/web/scripts/verify-r1-tier-untouched.sh
#
# ADR `docs/decisions/20260425-r1-sun-visualization.md` §결정 5.
# CLAUDE.md "주석 계약 vs 구현 drift" 교훈 — 비-범위 자동 검증.

set -euo pipefail

BASE="${BASE:-origin/develop}"
TIER_FILES=(
  "packages/core/src/scene/tier.ts"
  "packages/core/src/scene/tier-transition.ts"
  "packages/core/src/render/lod-body-thresholds.ts"
)

cd "$(git rev-parse --show-toplevel)"

echo "[verify-r1-tier-untouched] base=${BASE}"
echo "[verify-r1-tier-untouched] tier 파일 변경 라인 검사:"

FAIL=0
for f in "${TIER_FILES[@]}"; do
  # numstat: <added> <deleted> <path>
  STAT=$(git diff --numstat "${BASE}"...HEAD -- "$f" 2>/dev/null | head -1)
  if [ -z "$STAT" ]; then
    echo "  ✓ $f — 변경 없음"
    continue
  fi
  ADDED=$(echo "$STAT" | awk '{print $1}')
  DELETED=$(echo "$STAT" | awk '{print $2}')
  if [ "$ADDED" = "0" ] && [ "$DELETED" = "0" ]; then
    echo "  ✓ $f — 변경 없음 (binary 또는 동일)"
    continue
  fi
  echo "  ✗ $f — added=${ADDED} deleted=${DELETED} (R1 비-범위 위배)"
  FAIL=1
done

if [ $FAIL -ne 0 ]; then
  echo ""
  echo "[verify-r1-tier-untouched] FAIL — Q3=C 비-범위 가드 위배."
  echo "  PM 합의에 따라 R1 PR 은 tier 시스템에 손대지 않아야 한다."
  echo "  변경이 의도되었다면 PM 재합의 (이슈 #329 갱신) 후 ADR Amendment 박제 필요."
  exit 1
fi

echo ""
echo "[verify-r1-tier-untouched] PASS — Q3=C 비-범위 가드 만족."
