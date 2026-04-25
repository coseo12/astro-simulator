#!/usr/bin/env bash
# verify-docs-links.sh
# Node.js 기반 wrapper — CLAUDE.md 내 상대 링크의 파일 존재를 검증한다.
# 실제 로직은 lib/verify-docs-links.js 에 있으며, 본 쉘 스크립트는 CI 에서 `bash scripts/...` 호출 일관성을 위해 존재.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

exec node "${PROJECT_DIR}/lib/verify-docs-links.js" "$@"
