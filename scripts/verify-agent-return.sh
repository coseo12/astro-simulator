#!/usr/bin/env bash
# verify-agent-return.sh
# sub-agent 반환 JSON 의 9 코어 필드 런타임 검증 (#184) — Node 포트의 thin wrapper.
#
# 정적 가드 `scripts/verify-agent-ssot.sh` 는 에이전트 파일 drift 만 감지한다.
# 본 도구는 **런타임 반환값** variance (필드 누락 / null 기본값 이탈 / 타입 불일치) 를 감지.
#
# 호출:
#   bash scripts/verify-agent-return.sh --json '<JSON>'
#   bash scripts/verify-agent-return.sh --file path/to/return.json
#   echo '<JSON>' | bash scripts/verify-agent-return.sh --stdin
#
# Exit: 0 정합 / 1 variance / 2 입력 오류.
#
# 근거: ADR docs/decisions/20260422-subagent-runtime-variance-defense.md

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

exec node "${PROJECT_DIR}/lib/verify-agent-return.js" "$@"
