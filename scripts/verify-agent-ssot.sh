#!/usr/bin/env bash
# verify-agent-ssot.sh
# 5개 에이전트 파일의 `## 마무리 체크리스트 JSON 반환 (필수)` 섹션이
# CLAUDE.md 의 공통 JSON 스키마 SSoT (코어 필드 7개) 를 모두 포함하는지 + 선언 순서대로
# 나열되는지 검증한다. drift 발견 시 상세 원인과 함께 exit 1.
#
# SSoT 선언 위치: CLAUDE.md `### sub-agent 검증 완료 ≠ GitHub 박제 완료`
# 의 "공통 JSON 스키마 (SSoT)" 블록 (commit_sha / pr_url / pr_comment_url /
# labels_applied_or_transitioned / auto_close_issue_states / blocking_issues /
# non_blocking_suggestions / spawned_bg_pids / bg_process_handoff).
#
# 호출 예:
#   ./scripts/verify-agent-ssot.sh
#     → 통과: exit 0, "✅ agent SSoT drift 없음 (5 files × 9 fields)"
#     → 실패: exit 1, 누락/순서 이탈 파일·필드 상세 출력
#
# 관련 이슈: #145 (Z 옵션 — drift 자동 감지 게이트). volt #46/#52 — spawned_bg_pids / bg_process_handoff 2필드 확장

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"
# 테스트 격리용 — 기본 프로젝트의 .claude/agents 외 경로를 검사하려면 AGENT_DIR override
AGENT_DIR="${AGENT_DIR:-${PROJECT_DIR}/.claude/agents}"

AGENTS=(architect developer pm qa reviewer)

# SSoT 선언 순서 (CLAUDE.md 기준 고정) — 이 순서가 에이전트 JSON 블록에서도 유지되어야 한다
CORE_FIELDS=(
  commit_sha
  pr_url
  pr_comment_url
  labels_applied_or_transitioned
  auto_close_issue_states
  blocking_issues
  non_blocking_suggestions
  spawned_bg_pids
  bg_process_handoff
)

errors=0
checked_fields=0

# "마무리 체크리스트 JSON 반환" 문구가 등장한 이후의 첫 `json ... ` 코드블록을 추출.
# 헤더 형태가 파일마다 다르다 — 일부는 `## 마무리 체크리스트 JSON 반환 (필수)` 의 독립 섹션,
# 일부는 번호 리스트 항목 (`12. **마무리 체크리스트 JSON 반환** — ...`) 형태.
# 따라서 섹션 헤더 정규식이 아닌 "키 문구 등장 + 이후 첫 json 블록" 으로 식별한다.
# 리스트 항목 형태는 json fence 가 들여쓰기된 경우도 있어 leading whitespace 를 허용.
extract_json_block() {
  local file="$1"
  awk '
    # 1. "마무리 체크리스트 JSON 반환" 키워드가 나올 때까지 무시
    !seen && /마무리 체크리스트 JSON 반환/ { seen = 1; next }
    # 2. 키워드 발견 후, 첫 ```json 코드블록 시작점을 찾음 (들여쓰기 허용)
    seen && !in_json && /^[[:space:]]*```json[[:space:]]*$/ { in_json = 1; next }
    # 3. 코드블록 내부에서 닫는 ``` 를 만나면 즉시 처리 종료
    in_json && /^[[:space:]]*```[[:space:]]*$/ { exit }
    # 4. 코드블록 내부에 있으면 해당 라인 수집
    in_json { print }
  ' "${file}"
}

check_agent() {
  local agent="$1"
  local file="${AGENT_DIR}/${agent}.md"

  if [ ! -f "${file}" ]; then
    echo "❌ [${agent}] 파일 없음 — ${file}" >&2
    errors=$((errors + 1))
    return
  fi

  local block
  block=$(extract_json_block "${file}")

  if [ -z "${block}" ]; then
    echo "❌ [${agent}] '## 마무리 체크리스트 JSON 반환' 섹션의 \`\`\`json 블록 추출 실패 — ${file}" >&2
    errors=$((errors + 1))
    return
  fi

  # 각 CORE_FIELD 가 JSON 블록에 등장하는 라인 번호 수집
  # "key": ... 형태만 매칭 (extends 내부 하위 키 오인 방지 위해 단순 grep)
  local -a line_numbers=()
  local missing=0
  local idx=0
  for field in "${CORE_FIELDS[@]}"; do
    local line_no
    line_no=$(echo "${block}" | grep -nE "^\s*\"${field}\"\s*:" | head -1 | cut -d: -f1 || true)
    if [ -z "${line_no}" ]; then
      echo "❌ [${agent}] 누락 필드: \"${field}\"" >&2
      errors=$((errors + 1))
      missing=1
    else
      line_numbers+=("${line_no}")
      idx=$((idx + 1))
    fi
    checked_fields=$((checked_fields + 1))
  done

  # 순서 검증 — line_numbers 가 오름차순이어야 함
  if [ "${missing}" -eq 0 ]; then
    local prev=0
    local i=0
    for ln in "${line_numbers[@]}"; do
      if [ "${ln}" -le "${prev}" ]; then
        echo "❌ [${agent}] 필드 순서 이탈: \"${CORE_FIELDS[${i}]}\" (line ${ln}) 가 이전 필드 이후에 와야 하지만 line ${prev} 이전에 위치" >&2
        errors=$((errors + 1))
      fi
      prev="${ln}"
      i=$((i + 1))
    done
  fi
}

for agent in "${AGENTS[@]}"; do
  check_agent "${agent}"
done

if [ "${errors}" -gt 0 ]; then
  echo "" >&2
  echo "agent SSoT drift 감지: ${errors} 건. CLAUDE.md '### sub-agent 검증 완료 ≠ GitHub 박제 완료' 의 공통 JSON 스키마와 5개 에이전트 파일을 재동기화." >&2
  exit 1
fi

echo "✅ agent SSoT drift 없음 (${#AGENTS[@]} files × ${#CORE_FIELDS[@]} fields = ${checked_fields} checks)"
