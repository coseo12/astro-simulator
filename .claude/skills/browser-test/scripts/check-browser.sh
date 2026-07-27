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

# Chrome for Testing 확인 — 실기 스모크 (agent-browser v0.21.0 에 doctor 서브커맨드 없음: 상시 WARN 오탐 원인, astro-simulator#856)
if agent-browser open about:blank > /dev/null 2>&1; then
  agent-browser close > /dev/null 2>&1 || true
  echo "  [OK] Chrome 기동 스모크 통과"
else
  agent-browser close > /dev/null 2>&1 || true
  echo "  [WARN] Chrome 기동 실패. 'agent-browser install' 실행 필요"
fi

echo ""
echo "=== 검사 완료 ==="
