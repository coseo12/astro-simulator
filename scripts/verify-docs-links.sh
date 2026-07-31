#!/usr/bin/env bash
# verify-docs-links.sh
# docs 전체 상대 링크 무결성 가드 wrapper — CI `bash scripts/...` 호출 일관성 유지용.
#
# #842: upstream lib/verify-docs-links.js 가 배포되지 않아 (v3.6.0 lib 배포 누락,
# #338 임시 hashFiles skip) 본 wrapper 가 로컬 MODULE_NOT_FOUND + CI silent skip
# 상태였다. 다운스트림 자체 체커 scripts/verify-docs-links.mjs 로 교체 (Z 패턴) —
# 검사 범위가 CLAUDE.md 단일에서 docs/**/*.md + 루트 md 전체로 확장됨.
# 범위/제외 계약은 verify-docs-links.mjs 헤더 주석이 SSoT.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"

exec node "${SCRIPT_DIR}/verify-docs-links.mjs" "$@"
