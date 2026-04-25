#!/usr/bin/env bash
# verify-lessons-readme.sh
# docs/lessons/*.md (README.md 제외) 전체가 docs/lessons/README.md 의 "파일 목록" 표에 등장하는지 검증.
# 신규 레슨 파일 추가 시 README 동기화 누락을 구조적으로 차단 (드리프트 방지).
#
# 호출 예:
#   ./scripts/verify-lessons-readme.sh
#     → 동기화 정합: exit 0
#     → 누락 (파일 존재 but README 미등록): exit 1, 누락 파일명 stderr 출력
#
# 관련 이슈: harness #213 (Phase 3-A 후속, Gemini cross-validate 고유 발견)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

# LESSONS_DIR 환경변수로 오버라이드 가능 (테스트 격리용)
LESSONS_DIR="${LESSONS_DIR:-${PROJECT_DIR}/docs/lessons}"
README="${LESSONS_DIR}/README.md"

# docs/lessons/ 자체가 없는 다운스트림은 본 가드 대상 외
if [ ! -d "${LESSONS_DIR}" ]; then
  echo "ℹ️  ${LESSONS_DIR} 부재 — 본 가드 대상 아님 (skip)"
  exit 0
fi

if [ ! -f "${README}" ]; then
  echo "❌ ${README} 부재 — 디렉토리에 레슨 파일이 있으면 README 가 있어야 한다" >&2
  exit 1
fi

missing=()
# README.md 제외한 모든 .md 파일을 순회
while IFS= read -r f; do
  base=$(basename "${f}")
  [ "${base}" = "README.md" ] && continue
  # README 내 링크 패턴 `(${base})` 또는 `](${base})` 존재 확인
  # (상대 경로 기준 — README 와 같은 디렉토리이므로 basename 이 링크 타깃)
  if ! grep -qF "(${base})" "${README}"; then
    missing+=("${base}")
  fi
done < <(find "${LESSONS_DIR}" -maxdepth 1 -type f -name '*.md' | sort)

if [ ${#missing[@]} -eq 0 ]; then
  echo "✅ docs/lessons/ README 동기화 정합 (모든 .md 파일이 README 에 등록됨)"
  exit 0
fi

cat <<EOF >&2
❌ docs/lessons/README.md 에 누락된 파일 ${#missing[@]}건:
EOF
for m in "${missing[@]}"; do
  echo "    - ${m}" >&2
done
cat <<EOF >&2

수정 안내:
  1. docs/lessons/README.md "파일 목록" 표에 위 파일들의 행을 추가 (파일 / 요지 / 관련 볼트 이슈)
  2. 재실행: bash scripts/verify-lessons-readme.sh
EOF
exit 1
