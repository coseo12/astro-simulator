#!/usr/bin/env bash
# parse-cross-validate-outcome.sh
# cross_validate.sh 종료 시 생성되는 outcome JSON 파일을 파싱해 에이전트가
# consume 가능한 KEY=value 라인으로 출력하는 공통 헬퍼.
#
# Phase B (#131) — architect 에 국한됐던 파싱 스니펫을 헬퍼화 해 qa / reviewer
# 등 다른 에이전트도 동일 방식으로 outcome 분기 가능하도록 SSoT 제공.
#
# 사용 1 — outcome JSON 경로 직접 지정:
#   eval "$(./scripts/parse-cross-validate-outcome.sh /path/to/outcome.json)"
#
# 사용 2 — cross_validate.sh stdout 에서 [outcome-file] 프리픽스 자동 추출:
#   CV_OUT=$(./.claude/skills/cross-validate/scripts/cross_validate.sh code 137)
#   eval "$(echo "${CV_OUT}" | ./scripts/parse-cross-validate-outcome.sh --from-stdout)"
#
# 출력 (stdout, KEY="value" 라인):
#   CROSS_VALIDATE_OUTCOME="applied|429-fallback-claude-only|fatal-error|missing|parse-error"
#   CROSS_VALIDATE_EXIT_CODE=<정수>
#   CROSS_VALIDATE_REMINDER="none|dryrun|created|create-failed"
#   CROSS_VALIDATE_LOG_FILE="..."
#   CROSS_VALIDATE_ANCHOR="..."
#
# 예외 분기:
#   - 파일 없음 → OUTCOME="missing", EXIT_CODE=1, stderr 경고
#   - stdin 에서 [outcome-file] 프리픽스 부재 → OUTCOME="missing"
#   - JSON 필드 추출 실패 → OUTCOME="parse-error"
#
# NOTE: cross_validate.sh 의 fatal 경로(exit 1) 도 stdout 에 [claude-only-fallback]
#       헤더를 출력하므로 stdout 헤더 단독으로는 fatal vs 429 를 구분할 수 없다.
#       정확한 구분은 반드시 이 헬퍼가 읽는 outcome JSON 의 "outcome" 필드를 사용한다.

set -euo pipefail

usage() {
  cat <<USAGE >&2
사용법: $0 <outcome.json 경로> | --from-stdout

옵션:
  <경로>            outcome JSON 파일을 직접 지정
  --from-stdout     stdin 에서 [outcome-file] 프리픽스를 자동 추출
USAGE
  exit 1
}

if [ $# -lt 1 ]; then
  usage
fi

OUTCOME_FILE=""
MODE="$1"

# 기본 fallback 값 — 정상 경로에서 재정의됨
print_defaults() {
  local outcome="$1"
  local exit_code="$2"
  printf 'CROSS_VALIDATE_OUTCOME="%s"\n' "${outcome}"
  printf 'CROSS_VALIDATE_EXIT_CODE=%s\n' "${exit_code}"
  printf 'CROSS_VALIDATE_REMINDER="none"\n'
  printf 'CROSS_VALIDATE_LOG_FILE=""\n'
  printf 'CROSS_VALIDATE_ANCHOR=""\n'
}

if [ "${MODE}" = "--from-stdout" ]; then
  # stdin 에서 "[outcome-file] <경로>" 프리픽스 라인 추출
  OUTCOME_FILE=$(grep '^\[outcome-file\] ' | head -1 | cut -d' ' -f2- || true)
  if [ -z "${OUTCOME_FILE}" ]; then
    echo "경고: stdin 에서 [outcome-file] 프리픽스를 찾지 못함" >&2
    print_defaults "missing" 1
    exit 0
  fi
else
  OUTCOME_FILE="${MODE}"
fi

if [ ! -f "${OUTCOME_FILE}" ]; then
  echo "경고: outcome 파일 없음 — ${OUTCOME_FILE}" >&2
  print_defaults "missing" 1
  exit 0
fi

# JSON 문자열 필드 추출 (cross_validate.sh 의 write_outcome_json 스키마 기준)
#
# 파싱 계약 (reviewer #140 권고 1): 이 헬퍼는 cross_validate.sh 가 생성한 outcome JSON
# 만 consume 한다. write 측 `json_escape()` 가 `\` / `"` / 개행 / 탭 / 캐리지리턴을
# 이스케이프하므로 grep + sed 가 안전하게 작동한다. **호출 측이 직접 JSON 을 편집하거나
# 외부 도구가 생성한 outcome JSON 을 이 헬퍼에 흘려넣지 말 것** — escaped quote 경계에서
# 조기 종료 가능성 있음. 장기 안정성을 위한 jq 기반 전환은 #141 후속 분리.
extract_string() {
  local key="$1"
  grep -o "\"${key}\": *\"[^\"]*\"" "${OUTCOME_FILE}" 2>/dev/null | head -1 | sed 's/.*"\([^"]*\)"$/\1/' || true
}

extract_number() {
  local key="$1"
  grep -o "\"${key}\": *-\?[0-9]\+" "${OUTCOME_FILE}" 2>/dev/null | head -1 | sed 's/.*: *//' || true
}

OUTCOME=$(extract_string "outcome")
REMINDER=$(extract_string "reminder_issue")
LOG_FILE=$(extract_string "log_file")
ANCHOR=$(extract_string "anchor")
EXIT_CODE=$(extract_number "exit_code")

# 최소 필수 필드(outcome / exit_code) 부재 시 parse-error 로 표기
if [ -z "${OUTCOME}" ] || [ -z "${EXIT_CODE}" ]; then
  echo "경고: outcome JSON 필수 필드 추출 실패 — ${OUTCOME_FILE}" >&2
  print_defaults "parse-error" "${EXIT_CODE:-1}"
  exit 0
fi

# 옵션 필드 기본값
REMINDER="${REMINDER:-none}"
LOG_FILE="${LOG_FILE:-}"
ANCHOR="${ANCHOR:-}"

printf 'CROSS_VALIDATE_OUTCOME="%s"\n' "${OUTCOME}"
printf 'CROSS_VALIDATE_EXIT_CODE=%s\n' "${EXIT_CODE}"
printf 'CROSS_VALIDATE_REMINDER="%s"\n' "${REMINDER}"
printf 'CROSS_VALIDATE_LOG_FILE="%s"\n' "${LOG_FILE}"
printf 'CROSS_VALIDATE_ANCHOR="%s"\n' "${ANCHOR}"
