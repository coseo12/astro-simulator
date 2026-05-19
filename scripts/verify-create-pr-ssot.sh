#!/usr/bin/env bash
# verify-create-pr-ssot.sh
# 5 페르소나 .md (architect / developer / pm / qa / reviewer) 에 박제된
# "PR 생성 시 반드시 `create-pr` 스킬 사용" SSoT 문구가 5/5 모두 존재하고
# 동일 라인 내용인지 검증한다. drift 발견 시 누락/차이 파일 보고 + exit 1.
#
# 박제 위치: `.claude/agents/{architect,developer,pm,qa,reviewer}.md`
# SSoT 키: '**PR 생성 시 반드시 `create-pr` 스킬 사용**'
#
# 호출 예:
#   ./scripts/verify-create-pr-ssot.sh
#     → 통과: exit 0, "✅ create-pr SSoT drift 없음 (5 files)"
#     → 실패: exit 1, 누락/drift 파일 stderr
#
# 관련 이슈: #477 (5 페르소나 SSoT 박제) / #480 (자동 가드 분리) / #471 (create-pr Strict Assertion)
# 패턴 참조: scripts/verify-agent-ssot.sh (#145, 9 코어 필드 JSON 스키마 가드)
#
# 호환성 메모: macOS 시스템 bash 3.2 호환 위해 associative array 미사용 — parallel index array + sort -u 로 동일성 검증.

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# 테스트 격리용 — 기본 .claude/agents 외 경로 검사 시 AGENT_DIR override
AGENT_DIR="${AGENT_DIR:-${PROJECT_DIR}/.claude/agents}"

AGENTS=(architect developer pm qa reviewer)

# SSoT 키 문구 — 5 파일 동일 박제 검증 (grep -F 고정 문자열 매치)
SSOT_KEY='**PR 생성 시 반드시 `create-pr` 스킬 사용**'

errors=0
# parallel arrays (bash 3.2 호환) — index i 가 AGENTS[i] 와 1:1 대응
captured_content=()
captured_lineno=()

for agent in "${AGENTS[@]}"; do
  file="${AGENT_DIR}/${agent}.md"
  if [ ! -f "${file}" ]; then
    echo "❌ [${agent}] 파일 없음 — ${file}" >&2
    errors=$((errors + 1))
    captured_content+=("__MISSING__")
    captured_lineno+=("0")
    continue
  fi

  # SSoT 키 문구 포함 라인 grep — 첫 매치만 사용
  match=$(grep -nF "${SSOT_KEY}" "${file}" | head -1 || true)
  if [ -z "${match}" ]; then
    echo "❌ [${agent}] SSoT 문구 누락: '${SSOT_KEY}'" >&2
    errors=$((errors + 1))
    captured_content+=("__MISSING__")
    captured_lineno+=("0")
    continue
  fi

  lineno="${match%%:*}"
  content="${match#*:}"
  captured_content+=("${content}")
  captured_lineno+=("${lineno}")
done

# 모든 5 파일이 SSoT 가졌으면 — sort -u 로 unique 개수가 1 인지 검증
if [ "${errors}" -eq 0 ]; then
  unique_count=$(printf '%s\n' "${captured_content[@]}" | sort -u | wc -l | tr -d ' ')
  if [ "${unique_count}" -ne 1 ]; then
    echo "❌ SSoT drift 감지 — ${unique_count} 개의 다른 버전 존재:" >&2
    i=0
    for agent in "${AGENTS[@]}"; do
      echo "  [${agent}] line ${captured_lineno[$i]}:" >&2
      echo "    ${captured_content[$i]}" >&2
      i=$((i + 1))
    done
    errors=$((errors + 1))
  fi
fi

if [ "${errors}" -gt 0 ]; then
  echo "" >&2
  echo "create-pr SSoT drift 감지: ${errors} 건." >&2
  echo "5 페르소나 .md (architect/developer/pm/qa/reviewer) 의 '${SSOT_KEY}' SSoT 문구를 재동기화." >&2
  exit 1
fi

echo "✅ create-pr SSoT drift 없음 (${#AGENTS[@]} files — architect/developer/pm/qa/reviewer)"
