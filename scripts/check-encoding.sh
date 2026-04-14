#!/usr/bin/env bash
# U+FFFD (replacement character) 검사
# 한국어 파일 편집 시 인코딩 깨짐 감지

set -euo pipefail

FILES="${*:-}"

if [ -z "$FILES" ]; then
  # 인자 없으면 git staged 파일 중 텍스트 파일만 검사
  FILES=$(git diff --cached --name-only --diff-filter=ACM | grep -E '\.(ts|tsx|js|jsx|md|json|mjs|cjs|css|yaml|yml|html)$' || true)
fi

if [ -z "$FILES" ]; then
  exit 0
fi

# 인코딩 예시를 문서화하는 파일은 예외 (U+FFFD 문자를 의도적으로 포함)
ALLOWED_PATTERNS=(
  "^CLAUDE.md$"
  "^scripts/check-encoding.sh$"
  "docs/phases/.*\.md$"
  "^\.claude/.*\.md$"
  "^\.github/.*\.md$"
)

is_allowed() {
  local file="$1"
  for pattern in "${ALLOWED_PATTERNS[@]}"; do
    if [[ "$file" =~ $pattern ]]; then
      return 0
    fi
  done
  return 1
}

FOUND=0
for f in $FILES; do
  if [ -f "$f" ] && ! is_allowed "$f"; then
    if LC_ALL=C grep -l $'\xef\xbf\xbd' "$f" 2>/dev/null; then
      echo "❌ U+FFFD 발견: $f"
      FOUND=1
    fi
  fi
done

if [ $FOUND -ne 0 ]; then
  echo ""
  echo "한국어 인코딩이 깨진 파일이 있습니다. 수정 후 다시 커밋하세요."
  exit 1
fi

exit 0
