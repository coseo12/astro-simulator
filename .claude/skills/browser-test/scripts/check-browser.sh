#!/usr/bin/env bash
# agent-browser 설치 여부를 확인하고 안내하는 스크립트
set -euo pipefail

echo "=== agent-browser 환경 검사 ==="

if command -v agent-browser &> /dev/null; then
  VER=$(agent-browser --version 2>&1 | head -1)
  echo "  [OK] agent-browser: ${VER}"
else
  echo "  [MISSING] agent-browser 미설치"
  echo ""
  echo "  설치 방법:"
  echo "    npm install -g agent-browser"
  echo "    agent-browser install"
  echo ""
  echo "  또는 npx로 즉시 실행:"
  echo "    npx agent-browser open https://example.com"
  echo ""
  echo "  자세한 정보: https://github.com/vercel-labs/agent-browser"
  exit 1
fi

# Chrome for Testing 확인
if agent-browser doctor &> /dev/null 2>&1; then
  echo "  [OK] Chrome for Testing 설치됨"
else
  echo "  [WARN] Chrome for Testing 미설치. 'agent-browser install' 실행 필요"
fi

echo ""
echo "=== 검사 완료 ==="
