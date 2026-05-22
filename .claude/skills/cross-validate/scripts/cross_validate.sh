#!/usr/bin/env bash
# 외부 검증 모델 (Antigravity `agy`) 를 활용한 교차검증 스크립트
# Phase 1A (#269) 부터 gemini-cli → agy 교체. ADR: docs/decisions/20260521-gemini-to-antigravity.md
# 보호 모델 — L1 (prompt strict prefix) + L3 (snapshot diff + 자동 롤백, #479)
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
# LOG_DIR 환경변수로 오버라이드 가능 (테스트 격리용)
LOG_DIR="${LOG_DIR:-${PROJECT_DIR}/.claude/logs}"
TIMESTAMP=$(date +%Y%m%d-%H%M%S)

mkdir -p "${LOG_DIR}"

usage() {
  echo "사용법: $0 <유형> [대상]"
  echo ""
  echo "유형:"
  echo "  structure              - 프로젝트 전체 구조 검증"
  echo "  code <PR번호>          - PR 코드 교차 리뷰"
  echo "  architecture <파일>    - 설계 문서 검증"
  echo "  skill <스킬명>         - 스킬 SKILL.md 검증"
  echo ""
  echo "예시:"
  echo "  $0 structure"
  echo "  $0 code 12"
  echo "  $0 architecture docs/architecture/auth.md"
  echo "  $0 skill create-issue"
  exit 1
}

# 외부 검증 모델 CLI 확인 (Antigravity `agy`)
if ! command -v agy &> /dev/null; then
  echo "에러: agy (Antigravity CLI) 가 설치되어 있지 않습니다. https://antigravity.google/docs/cli-overview 참조."
  exit 1
fi

if [ $# -lt 1 ]; then
  usage
fi

TYPE="$1"
TARGET="${2:-}"
LOG_FILE="${LOG_DIR}/cross-validate-${TYPE}-${TIMESTAMP}.log"
# outcome JSON 파일 — architect 등 호출 측이 extends.cross_validate_outcome 자동 매핑
# 가능한 구조화된 결과 요약. Phase 3 (#131) 에서 도입.
OUTCOME_FILE="${LOG_DIR}/cross-validate-${TYPE}-${TIMESTAMP}-outcome.json"

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "${LOG_FILE}"
}

# JSON 문자열 이스케이프 — outcome JSON 생성 시 환경변수 값 안전 인젝션
# 처리 대상: \ → \\, " → \", 줄바꿈(\n) / 캐리지리턴(\r) / 탭(\t) 만 JSON 이스케이프.
# 그 외 제어문자(0x00~0x1F) 는 처리하지 않음 — 환경변수/파일경로/timestamp 가
# 주 입력이라 실측 범위 밖. 필요 시 향후 확장.
# RS="" 는 awk 가 입력 전체를 한 레코드로 처리하도록 강제 (멀티라인 안전).
json_escape() {
  local input="${1:-}"
  printf '%s' "${input}" | awk '
    BEGIN { RS = "" }
    {
      gsub(/\\/, "\\\\");
      gsub(/"/, "\\\"");
      gsub(/\n/, "\\n");
      gsub(/\t/, "\\t");
      gsub(/\r/, "\\r");
      printf "%s", $0
    }
  '
}

# reminder 이슈 생성 결과 추적 — create_reminder_issue 가 저장, write_outcome_json 이 소비
# 초기값 "none" — 호출 자체가 없었음
REMINDER_ISSUE_RESULT="none"

# plan-mode 우회 감지 결과 추적 (#479) — snapshot_pre / snapshot_post_and_rollback 이 저장
# write_outcome_json 이 소비. 초기값은 호출 전 false / 빈 배열 / false (정상 상태).
#   PLAN_BYPASS:     외부 검증 모델 (agy) 호출 전후 워킹트리 변경 감지 여부
#   BYPASS_FILES:    감지된 파일 경로 배열 (bash 배열)
#   ROLLBACK_FAILED: 자동 롤백 시도 중 실패한 파일이 있는지 (CRITICAL — 수동 개입 필요)
# Phase 1A (#269): agy 는 --print mode 에서 도구 자동 실행 + --approval-mode plan 등가 부재 (PoC).
#   사후 snapshot diff + 자동 롤백이 L3 핵심 보호. L1 (prompt strict prefix) 과 이중 가드.
# 과거 (gemini 시점) reviewer 권고 박제: Q1 tracked + untracked 모두 추적, Q2 롤백 실패 케이스 분리
PLAN_BYPASS=false
BYPASS_FILES=()
ROLLBACK_FAILED=false
# snapshot 임시 파일 경로 — snapshot_pre 가 설정, snapshot_post_and_rollback 이 소비
PRE_TRACKED_HASHES=""
PRE_UNTRACKED=""

# JSON 배열 문자열 생성 헬퍼 (#479) — bash 배열 → JSON string array.
# bypass_files 가 비어있으면 "[]" 반환. 각 요소는 json_escape 적용.
# NOTE: `set -u` 환경에서 빈 배열 expansion 은 unbound 오류 발생 — 호출 측은
# `${ARR[@]+"${ARR[@]}"}` 또는 본 함수 내부에서 빈 배열 케이스 분기로 회피.
json_array_from_bash_array() {
  # $# 으로 인자 수 직접 확인 — `local -a arr=("$@")` 는 빈 인자에서 정상 작동하지만
  # 호출 측 `"${ARR[@]}"` 가 unbound 인 경우 호출 자체가 실패하므로 본 함수 진입 전에 차단됨
  if [ "$#" -eq 0 ]; then
    printf '[]'
    return
  fi
  local out="["
  local first=1
  local item
  for item in "$@"; do
    if [ "${first}" = "1" ]; then
      first=0
    else
      out+=","
    fi
    out+="\"$(json_escape "${item}")\""
  done
  out+="]"
  printf '%s' "${out}"
}

# outcome JSON 파일 출력
# architect.md step 8 규약: 이 파일을 읽어 extends.cross_validate_outcome 에 매핑
# outcome 값 규약 (backward-compat 유지 — 5 agents `parse-cross-validate-outcome.sh` 와 정합성):
#   "applied"                  — 외부 검증 모델 (agy) 정상 응답 수신 (exit 0)
#   "429-fallback-claude-only" — capacity 최종 실패 폴백 (exit 77). Phase 1A 부터 agy 의
#                                timeout / rate limit / quota / not logged 모두 본 sentinel
#                                로 통합. 명칭 일반화는 별도 PR (sentinel 변경 시 5 agents 동기화 필수)
#   "fatal-error"              — 비-capacity 치명적 오류 (exit 1)
#
# Phase 4 (#479) 확장 — plan-mode 우회 가드 3 필드:
#   plan_bypass:     boolean — 외부 검증 모델 (agy) 호출 전후 워킹트리 변경 감지 여부
#   bypass_files:    string[] — 감지된 파일 경로 배열
#   rollback_failed: boolean — 자동 롤백 시도 중 실패가 있었는지 (true 면 수동 개입)
# backward compat: 기존 8 필드 (outcome / exit_code / anchor / pr_ref / context /
#   log_file / reminder_issue / timestamp) 미변경. parse-cross-validate-outcome.sh
#   헬퍼가 신규 필드 옵션 처리.
write_outcome_json() {
  local outcome="$1"
  local exit_code="$2"
  local anchor_esc pr_ref_esc log_file_esc reminder_esc context_esc
  anchor_esc=$(json_escape "${CROSS_VALIDATE_ANCHOR:-}")
  pr_ref_esc=$(json_escape "${GH_PR_CONTEXT:-}")
  log_file_esc=$(json_escape "${LOG_FILE}")
  context_esc=$(json_escape "${TYPE:-unknown}${TARGET:+:${TARGET}}")

  # reminder_issue 값은 create_reminder_issue() 가 설정한 전역 REMINDER_ISSUE_RESULT 를 그대로 사용
  # 값 규약: "none" (호출 없음) / "dryrun" / "created" (실제 생성 성공) / "create-failed" (gh 실패)
  # reviewer 차단 반영: 이전에는 REMINDER_ISSUE_DRYRUN 환경변수만 보고 "created" 를 가정했음 — 실측으로 교정
  reminder_esc=$(json_escape "${REMINDER_ISSUE_RESULT}")

  # Phase 4 (#479): bypass_files 배열은 JSON array 로 직접 생성
  # `set -u` 안전 expansion — 빈 배열일 때 `${ARR[@]}` 가 unbound 발생하므로
  # `${ARR[@]+"${ARR[@]}"}` 패턴으로 빈 배열을 인자 0개로 전달
  local bypass_files_json
  bypass_files_json=$(json_array_from_bash_array ${BYPASS_FILES[@]+"${BYPASS_FILES[@]}"})

  cat > "${OUTCOME_FILE}" <<EOF
{
  "outcome": "${outcome}",
  "exit_code": ${exit_code},
  "anchor": "${anchor_esc}",
  "pr_ref": "${pr_ref_esc}",
  "context": "${context_esc}",
  "log_file": "${log_file_esc}",
  "reminder_issue": "${reminder_esc}",
  "plan_bypass": ${PLAN_BYPASS},
  "bypass_files": ${bypass_files_json},
  "rollback_failed": ${ROLLBACK_FAILED},
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# plan-mode 우회 가드 — 호출 전 워킹트리 snapshot (#479)
# 결정점 1: D 방식 (porcelain + hash-object 혼합)
#   - tracked 파일은 hash-object 로 정확 검증 (성능 부담 < 100ms)
#   - untracked 는 porcelain ?? 프리픽스로 별도 식별
# git 저장소가 아닌 경로에서 호출되면 silent skip (가드 비활성).
# 비-범위: .gitignore 이용 무시 파일 동시 수정 완전 방어는 후속 분리.
# Phase 1A (#269): agy 는 --print mode 에서 도구 자동 실행 → L3 (본 가드) 가 최종 안전망.
snapshot_pre() {
  if ! git rev-parse --is-inside-work-tree >/dev/null 2>&1; then
    log "plan-bypass 가드: git 저장소가 아닌 경로 — 가드 비활성"
    return 0
  fi
  PRE_TRACKED_HASHES="${LOG_DIR}/cv-pre-tracked-${TIMESTAMP}.txt"
  PRE_UNTRACKED="${LOG_DIR}/cv-pre-untracked-${TIMESTAMP}.txt"
  # tracked 파일 해시 (정확). git ls-files 가 staged + tracked 모두 포함.
  # hash-object 는 동일 내용이면 동일 해시 → 라인 변경이든 추가든 모두 검출.
  git ls-files 2>/dev/null | while read -r f; do
    if [ -f "${f}" ]; then
      printf '%s\t%s\n' "$(git hash-object "${f}" 2>/dev/null)" "${f}"
    fi
  done > "${PRE_TRACKED_HASHES}"
  # untracked 파일 (?? 프리픽스만) — porcelain 으로 식별.
  # 'git status --porcelain' 의 untracked 라인은 "?? path" 형식.
  git status --porcelain 2>/dev/null | grep "^?? " | sed 's/^?? //' > "${PRE_UNTRACKED}" || true
  log "plan-bypass 가드: 사전 snapshot 완료 (tracked=$(wc -l < "${PRE_TRACKED_HASHES}" | tr -d ' ') / untracked=$(wc -l < "${PRE_UNTRACKED}" | tr -d ' '))"
}

# plan-mode 우회 가드 — 호출 후 diff 검증 + 자동 롤백 (#479)
# 결정점 2: R4 (자동 롤백 + 사용자 사후 알림)
# 결정점 1: tracked 는 hash-object 비교, untracked 는 신규 라인 비교
# Q2 (과거 gemini 시점 reviewer 권고) 수용: 롤백 실패 케이스를 ROLLBACK_FAILED 로 분리
# .gitignore 변경 시 CRITICAL 격상
snapshot_post_and_rollback() {
  # snapshot_pre 가 skip 된 경우 (git 저장소 아님) 본 함수도 skip
  if [ -z "${PRE_TRACKED_HASHES}" ] || [ ! -f "${PRE_TRACKED_HASHES}" ]; then
    return 0
  fi
  local post_tracked="${LOG_DIR}/cv-post-tracked-${TIMESTAMP}.txt"
  local post_untracked="${LOG_DIR}/cv-post-untracked-${TIMESTAMP}.txt"
  # 사후 snapshot — 사전과 동일 방식
  git ls-files 2>/dev/null | while read -r f; do
    if [ -f "${f}" ]; then
      printf '%s\t%s\n' "$(git hash-object "${f}" 2>/dev/null)" "${f}"
    fi
  done > "${post_tracked}"
  git status --porcelain 2>/dev/null | grep "^?? " | sed 's/^?? //' > "${post_untracked}" || true

  # tracked diff — 해시가 달라진 파일 식별
  # `diff` 출력 중 '>' (post 에만 있음) 또는 '<' (pre 에만 있음) 라인의 두 번째 필드 = 파일 경로
  # 동일 경로의 해시가 변경되면 양쪽에 나옴 → uniq 로 중복 제거
  local tracked_changed
  tracked_changed=$(diff "${PRE_TRACKED_HASHES}" "${post_tracked}" 2>/dev/null \
    | grep -E "^[<>] " \
    | awk -F'\t' '{print $2}' \
    | sort -u || true)

  # untracked 신규 파일 — post 에만 있는 라인
  local untracked_new
  untracked_new=$(comm -13 \
    <(sort "${PRE_UNTRACKED}") \
    <(sort "${post_untracked}") 2>/dev/null || true)

  # 변경이 없으면 정상 — PLAN_BYPASS 기본값 (false) 유지하고 종료
  if [ -z "${tracked_changed}" ] && [ -z "${untracked_new}" ]; then
    log "plan-bypass 가드: 사후 snapshot diff empty — 정상"
    return 0
  fi

  # plan-mode 우회 감지 — CRITICAL
  PLAN_BYPASS=true
  local gitignore_modified=false

  # tracked 파일 자동 롤백 (git checkout --)
  if [ -n "${tracked_changed}" ]; then
    while IFS= read -r f; do
      [ -z "${f}" ] && continue
      BYPASS_FILES+=("${f}")
      if [ "${f}" = ".gitignore" ]; then
        gitignore_modified=true
      fi
      if ! git checkout -- "${f}" 2>/dev/null; then
        ROLLBACK_FAILED=true
        log "plan-bypass 가드: 자동 롤백 실패 — ${f}"
      fi
    done <<< "${tracked_changed}"
  fi

  # untracked 신규 파일 자동 삭제 (Gemini Q1 수용)
  # git checkout -- 는 untracked 를 건드리지 않으므로 rm 이 필요
  if [ -n "${untracked_new}" ]; then
    while IFS= read -r f; do
      [ -z "${f}" ] && continue
      BYPASS_FILES+=("${f}")
      if ! rm -f "${f}" 2>/dev/null; then
        ROLLBACK_FAILED=true
        log "plan-bypass 가드: untracked 신규 파일 삭제 실패 — ${f}"
      fi
    done <<< "${untracked_new}"
  fi

  # stderr 경고 (CRITICAL 위반 즉시 차단 시각화)
  echo "WARN: external validator (agy) plan-mode bypass detected — ${#BYPASS_FILES[@]} files modified, auto-rollback applied" >&2
  # `${ROLLBACK_FAILED:+...}` 는 변수가 비어있지 않으면 (값이 'true' 또는 'false' 어느 쪽이든)
  # 텍스트를 출력하므로 실제 실패 여부와 무관. 명시적 비교로 교체.
  local rollback_status="성공"
  [ "${ROLLBACK_FAILED}" = "true" ] && rollback_status="일부 실패"
  log "plan-bypass 가드: ${#BYPASS_FILES[@]}개 파일 감지 — 자동 롤백 (${rollback_status})"

  # .gitignore 변경은 CRITICAL — 별도 경고
  # 무시 대상 파일 동시 수정 false negative 위험. 사용자 수동 검증 권고.
  if [ "${gitignore_modified}" = "true" ]; then
    echo "CRITICAL: .gitignore modified by external validator (agy) — 무시 파일 동시 수정 false negative 위험. 수동 검증 필요." >&2
    log "plan-bypass 가드 CRITICAL: .gitignore 변경 감지 — 사용자 수동 검증 의무"
  fi

  # 롤백 실패 시 추가 경고 (Gemini Q2 수용)
  if [ "${ROLLBACK_FAILED}" = "true" ]; then
    echo "CRITICAL: 자동 롤백 실패 — 수동 개입 필요. outcome.rollback_failed=true" >&2
  fi
}

# 외부 검증 모델 (agy) 설정
# Phase 1A (#269) 부터: agy 는 모델 선택 옵션 부재 — 백엔드 자동 결정
# Phase 4 (#272) 부터: GEMINI_MODEL / GEMINI_RETRY_* alias 분기 완전 제거 (fail-fast 원칙)
# CLAUDE.md `### 가드 설계 원칙` §의식적 silent 약화 — 1 릴리스 deprecation 사전 안내 (PR #280, #276) 후 제거

MAX_EXTERNAL_VALIDATOR_RETRIES=2
# 재시도 간 sleep 단위 (초). 테스트에서는 0 으로 설정해 실행 시간 단축.
EXTERNAL_VALIDATOR_RETRY_SLEEP_SECONDS="${EXTERNAL_VALIDATOR_RETRY_SLEEP_SECONDS:-5}"
# sleep 상한 (초). 지수 backoff 가 MAX_RETRIES 증설 시 폭증하는 것을 방지.
# reviewer non-blocking (#137, v2.21.0~ #131 Phase B): MIN(cap, 2^attempt * BASE)
EXTERNAL_VALIDATOR_RETRY_SLEEP_CAP="${EXTERNAL_VALIDATOR_RETRY_SLEEP_CAP:-300}"
# capacity probe 옵트아웃. 기본 0 (수행). 권고 4 (#131 Phase B): probe (`agy -p "hello"`)
# 자체가 free tier quota 를 소모하므로 capacity 부족이 이미 감지된 상황에선 생략이 유리할 수 있다.
SKIP_CAPACITY_PROBE="${SKIP_CAPACITY_PROBE:-0}"

# L1 가드 — agy 가 도구 호출을 수행하지 않도록 prompt 에 자동 prepend (#269 Phase 0 PoC)
# agy --print mode 는 도구 호출을 silent 자동 승인 → prompt 레벨 차단 필수
# PoC T10/T11 실측: agy 가 "DO NOT execute" 지시를 순순히 따름 (효과 확인)
EXTERNAL_VALIDATOR_STRICT_PREFIX="STRICT INSTRUCTION: You are performing read-only code review and analysis. Do NOT execute any shell command or tool. Do NOT modify any file. Respond ONLY with text-based analysis. If you would have used a tool, describe in text what you would have done.

---

"

# agy --print-timeout 기본값 (초). 응답 대기 한계. agy 의 default 는 5m (300s).
EXTERNAL_VALIDATOR_PRINT_TIMEOUT="${EXTERNAL_VALIDATOR_PRINT_TIMEOUT:-300s}"

# Exit code 규약 (CLAUDE.md API capacity 폴백 프로토콜)
# 0  = Gemini 정상 응답 수신
# 77 = claude-only fallback (Gemini 429/timeout 최종 실패, 단일 모델 편향 노출 미확보)
# 1  = 그 외 실패 (인자 오류 / 파일 부재 / 민감 파일 등)
EXIT_CLAUDE_ONLY_FALLBACK=77

# check_external_capacity 반환 코드 규약 (reviewer 권고 2, #131 Phase A — gemini 시점부터 유지)
# 0 = capacity 복구 (probe 성공)
# 2 = 여전히 429/503/500 — capacity 부족 (재시도 의미 낮음)
# 1 = 비-429 probe 실패 (네트워크/인증 등 — 기타 오류와 구분)
# 호출 측은 0 vs 2 vs 1 을 구분해 로그와 재시도 정책을 차별화한다.
CAPACITY_OK=0
CAPACITY_EXHAUSTED=2
CAPACITY_OTHER_ERROR=1

# 외부 검증 모델 (agy) capacity 체크 — `agy -p "hello"` 로 빠른 응답성 확인
# CLAUDE.md `## 교차검증` API capacity 폴백 프로토콜 단계 1
# Phase 1A (#269): agy 는 timeout/capacity 실패 시에도 exit 0 반환 (PoC T2 실측) —
# stderr 의 `^Error: ` 패턴 매칭으로 판정. exit code 는 보조 신호.
check_external_capacity() {
  local probe_stdout probe_stderr probe_rc
  local probe_stderr_file
  probe_stderr_file=$(mktemp)
  # agy 권고 제안 1 수용 (PR #275 dogfooding): SIGINT/SIGTERM 또는 set -e 조기 이탈 시 임시 파일 누수 차단
  # RETURN trap 은 함수 종료 시점에 호출되며 호출자로 전파 안 됨 (bash 기본 INHERITRC 비활성)
  trap "rm -f '${probe_stderr_file}'" RETURN
  # capacity probe — 빠른 응답 (30s) timeout, 정상 응답은 1~3s 안에 옴
  probe_stdout=$(agy --print-timeout 30s -p "hello" 2>"${probe_stderr_file}") && probe_rc=0 || probe_rc=$?
  probe_stderr=$(cat "${probe_stderr_file}")

  # 정상 응답: 비어있지 않은 stdout + stderr Error 없음 (exit code 무관 — agy 는 항상 0)
  # agy 권고 제안 2 수용: echo "${var}" 는 `-e/-n` 시작 문자열에서 옵션 파싱 오동작 가능 → printf '%s\n' 사용
  if [ -n "${probe_stdout}" ] && ! printf '%s\n' "${probe_stderr}" | grep -qE "^Error: "; then
    return "${CAPACITY_OK}"
  fi

  # capacity 실패 패턴 매칭 — PoC T2 발견 + 추정 패턴 (rate limit/quota/not logged)
  if printf '%s\n' "${probe_stderr}" | grep -qE "^Error: (timed out|rate limit|quota|not logged|unauthorized|forbidden)"; then
    log "capacity 체크 결과: agy capacity 부족 또는 인증 문제 (code=${CAPACITY_EXHAUSTED}) — $(printf '%s\n' "${probe_stderr}" | head -1)"
    return "${CAPACITY_EXHAUSTED}"
  fi

  # 그 외: 알 수 없는 probe 실패
  log "capacity 체크 결과: 비-capacity probe 실패 (code=${CAPACITY_OTHER_ERROR}) — stdout=$(printf '%s\n' "${probe_stdout}" | head -1) stderr=$(printf '%s\n' "${probe_stderr}" | head -1)"
  return "${CAPACITY_OTHER_ERROR}"
}

# reminder 이슈 생성 (dry-run 모드 기본)
# CLAUDE.md 폴백 프로토콜 단계 3: 노출 효율 최대 앵커 해당 시 reminder 이슈 박제
# 환경변수 REMINDER_ISSUE_DRYRUN=0 로 설정해야 실제 생성. 기본은 stderr 에 초안 출력.
create_reminder_issue() {
  local context="${1:-cross-validate}"
  local anchor="${2:-MINOR-behavior-change}"
  # 호출 측이 GH_PR_CONTEXT 를 설정하면 본문에 원 PR 링크 추적성 보강
  local pr_ref="${GH_PR_CONTEXT:-}"
  local body
  body=$(cat <<BODY
## 배경

cross-validate 스킬 실행 중 외부 검증 모델 (agy) capacity 소진 또는 인증 문제로 **claude-only fallback** 발생. CLAUDE.md \`## 교차검증\` API capacity 폴백 프로토콜 단계 3 (노출 효율 최대 앵커 해당 시 reminder 이슈 박제) 에 따라 복구 후 재검증용 이슈 박제.

## 맥락

- 원 호출 컨텍스트: ${context}
- 앵커 유형: ${anchor}
- 원 PR/ADR 참조: ${pr_ref:-"(GH_PR_CONTEXT 미설정 — 호출 측이 수동 링크 필요)"}
- 호출 시각: $(date -u +%Y-%m-%dT%H:%M:%SZ)
- 로그 파일: ${LOG_FILE}

## 재시도 시 확인 범주

- 범주 오류 (categorical error)
- 암묵 전제 누락 (unstated assumption)
- 비목표 대조 (non-goal consistency check)

## 완료 기준

- [ ] agy 응답성 복구 확인 (\`agy -p "hello"\`)
- [ ] 원 컨텍스트에 대해 cross-validate 재실행
- [ ] 결과를 원 PR / ADR / CHANGELOG 해당 위치에 박제
- [ ] 재시도 성공 시 본 이슈 close
BODY
)
  local title="[cross-validate reminder] ${context} — agy 응답성 복구 후 재시도 (${anchor})"
  if [ "${REMINDER_ISSUE_DRYRUN:-1}" = "0" ]; then
    log "reminder 이슈 생성 (실제)"
    # gh issue create 의 성공/실패를 실측해 REMINDER_ISSUE_RESULT 에 반영 (reviewer 차단 반영)
    if gh issue create --title "${title}" --body "${body}" --label "enhancement" 2>&1 | tee -a "${LOG_FILE}"; then
      REMINDER_ISSUE_RESULT="created"
    else
      REMINDER_ISSUE_RESULT="create-failed"
      log "경고: gh issue create 실패 — REMINDER_ISSUE_RESULT=create-failed"
    fi
  else
    log "reminder 이슈 dry-run — 실제 생성하지 않음 (REMINDER_ISSUE_DRYRUN=0 으로 설정 시 실제 생성)"
    {
      echo "[reminder-issue-dryrun] 제목: ${title}"
      echo "[reminder-issue-dryrun] 본문 요약: ${context} / ${anchor} / 로그 ${LOG_FILE}"
    } >&2
    REMINDER_ISSUE_RESULT="dryrun"
  fi
}

# 외부 검증 모델 (agy) 실행 (L1 prompt-level read-only)
# CLAUDE.md `## 교차검증` API capacity 폴백 프로토콜:
#   1. 1차 capacity 실패 → capacity 체크 + 지연 후 1회 재시도
#   2. 2차 실패 → claude-only analysis completed 프리픽스 + exit 77
#   3. 앵커 해당 시 reminder 이슈 박제
# 앵커 컨텍스트는 호출 측에서 CROSS_VALIDATE_ANCHOR 환경변수로 전달 가능
#
# Phase 1A (#269) 변경:
#   - L1: prompt 에 EXTERNAL_VALIDATOR_STRICT_PREFIX 자동 prepend (도구 호출 차단)
#   - capacity 판정: stderr `^Error: ` 패턴 매칭 (agy exit code 는 timeout 도 0 — PoC T2)
#   - stdout/stderr 분리 처리 (이전: 2>&1 합쳐서 처리)
run_external_validator() {
  local prompt="$1"
  local attempt=1
  local fatal=0
  # Phase B (reviewer #140 권고 3): 루프 내 사용 변수를 함수 스코프에 local 선언해 전역 유출 방지
  local raw_sleep=0
  local capacity_rc=0
  # L1: prompt 에 strict prefix 자동 prepend (호출 측 PROMPT 변경 없이 일괄 적용)
  local guarded_prompt="${EXTERNAL_VALIDATOR_STRICT_PREFIX}${prompt}"

  # agy 권고 제안 1 수용 (PR #275 dogfooding): mktemp 임시 파일 누수 차단 (SIGINT/SIGTERM 또는 set -e 조기 이탈)
  # 루프 안에서 새 mktemp 가 생성되므로 trap 의 변수 참조는 RETURN 시점의 최종 값을 사용 (마지막 루프 반복의 파일만 cleanup)
  # 이를 보강하기 위해 루프 안에서 명시적 rm 도 유지 (이중 안전망)
  local stdout_file=""
  local stderr_file=""
  trap "rm -f \"\${stdout_file:-}\" \"\${stderr_file:-}\"" RETURN

  while [ "${attempt}" -le "${MAX_EXTERNAL_VALIDATOR_RETRIES}" ]; do
    log "외부 검증 모델 (agy) 실행 중 (시도: ${attempt}/${MAX_EXTERNAL_VALIDATOR_RETRIES}, timeout: ${EXTERNAL_VALIDATOR_PRINT_TIMEOUT})..."
    local stdout_content stderr_content
    stdout_file=$(mktemp)
    stderr_file=$(mktemp)
    # agy 호출 — stdout/stderr 분리, --print-timeout 으로 wait 한계 설정
    # `|| true` 는 set -e 회피 (agy 는 exit code 신뢰 불가 — stderr 패턴으로 판정)
    agy --print-timeout "${EXTERNAL_VALIDATOR_PRINT_TIMEOUT}" -p "${guarded_prompt}" >"${stdout_file}" 2>"${stderr_file}" || true
    stdout_content=$(cat "${stdout_file}")
    stderr_content=$(cat "${stderr_file}")
    rm -f "${stdout_file}" "${stderr_file}"

    # 정상 응답 판정: 비어있지 않은 stdout + stderr Error 패턴 없음
    # agy 권고 제안 2 수용: echo "${var}" 는 `-e/-n` 시작 문자열에서 옵션 파싱 오동작 가능 → printf '%s\n' 사용
    if [ -n "${stdout_content}" ] && ! printf '%s\n' "${stderr_content}" | grep -qE "^Error: "; then
      printf '%s\n' "${stdout_content}" | tee -a "${LOG_FILE}"
      # stderr 가 비어있지 않으면 (정상 경로의 부수 메시지) 로그에만 남김
      if [ -n "${stderr_content}" ]; then
        printf '%s\n' "${stderr_content}" >> "${LOG_FILE}"
      fi
      return 0
    fi

    # capacity 실패 패턴 매칭 — PoC T2 (`Error: timed out`) + 추정 패턴
    if printf '%s\n' "${stderr_content}" | grep -qE "^Error: (timed out|rate limit|quota|not logged|unauthorized|forbidden)"; then
      log "경고: agy capacity/인증 실패 (시도 ${attempt}/${MAX_EXTERNAL_VALIDATOR_RETRIES}) — $(printf '%s\n' "${stderr_content}" | head -1)"
      if [ "${attempt}" -lt "${MAX_EXTERNAL_VALIDATOR_RETRIES}" ]; then
        # 폴백 프로토콜 단계 1: 지연 후 (선택적으로) capacity 체크 + 재시도
        # sleep 공식: MIN(SLEEP_CAP, 2^attempt * BASE) — Phase A 의 지수 공식에
        #   Phase B (reviewer non-blocking) 상한 cap 을 추가.
        # 테스트 환경에서는 EXTERNAL_VALIDATOR_RETRY_SLEEP_SECONDS=0 으로 sleep 생략
        if [ "${EXTERNAL_VALIDATOR_RETRY_SLEEP_SECONDS}" -gt 0 ]; then
          raw_sleep=$(( (1 << attempt) * EXTERNAL_VALIDATOR_RETRY_SLEEP_SECONDS ))
          if [ "${raw_sleep}" -gt "${EXTERNAL_VALIDATOR_RETRY_SLEEP_CAP}" ]; then
            log "sleep cap ${EXTERNAL_VALIDATOR_RETRY_SLEEP_CAP}s 적용 (원시 ${raw_sleep}s, attempt=${attempt})"
            raw_sleep="${EXTERNAL_VALIDATOR_RETRY_SLEEP_CAP}"
          fi
          sleep "${raw_sleep}"
        fi
        # 권고 4 (#131 Phase B) — probe 옵트아웃
        if [ "${SKIP_CAPACITY_PROBE}" = "1" ]; then
          log "capacity probe 생략 (SKIP_CAPACITY_PROBE=1) — 바로 재시도"
        else
          # 반환 코드 3값 분기 (reviewer 권고 2, #131 Phase A)
          capacity_rc=0
          check_external_capacity || capacity_rc=$?
          case "${capacity_rc}" in
            "${CAPACITY_OK}")
              log "capacity 복구 감지 — 재시도 진행"
              ;;
            "${CAPACITY_EXHAUSTED}")
              log "capacity 여전히 부족 — 재시도 진행하되 조기 포기 가능성 높음"
              ;;
            "${CAPACITY_OTHER_ERROR}")
              log "capacity probe 실패 (비-capacity) — 재시도는 진행 (probe 자체 이슈일 수 있음)"
              ;;
            *)
              log "알 수 없는 capacity_rc (${capacity_rc}) — 재시도 진행 (방어적 분기)"
              ;;
          esac
        fi
      fi
      attempt=$((attempt + 1))
    else
      # agy 권고 제안 2 수용: printf '%s\n' 사용
      log "경고: agy 실패 (비-capacity 오류) — stdout=$(printf '%s\n' "${stdout_content}" | head -1) stderr=$(printf '%s\n' "${stderr_content}" | head -1)"
      printf 'stdout:\n%s\nstderr:\n%s\n' "${stdout_content}" "${stderr_content}" >> "${LOG_FILE}"
      fatal=1
      break
    fi
  done

  # 폴백 프로토콜 단계 2: claude-only analysis completed 박제
  local fallback_msg="claude-only analysis completed — 단일 모델 편향 노출 미확보"
  log "${fallback_msg}"
  echo "${fallback_msg}" >&2
  # stdout 헤더 (reviewer 권고 1, #131 Phase A) — 호출 측이 stdout 만으로 fallback 모드 감지 가능
  # 정상 경로 stdout 에는 agy 응답 본문이 출력됨. fallback 경로는 본문이 없으므로 이 프리픽스가 signal.
  # NOTE (qa non-blocking, #131 Phase B): fatal 경로 (비-capacity 오류, exit 1) 도 이 헤더를
  #   동일하게 출력한다. fatal vs capacity 정확 구분은 outcome JSON 의 "outcome" 필드를 참조해야 하며
  #   (scripts/parse-cross-validate-outcome.sh 헬퍼 사용 권장), stdout 헤더 단독으로는 구분 불가.
  echo "[claude-only-fallback] agy (Antigravity CLI) 응답 없음 — Claude 단독 분석 (교차검증 미확보)"
  echo "⚠ 교차검증 불가 — Claude 단독 분석. agy (Antigravity CLI) 응답 없음." | tee -a "${LOG_FILE}"

  # 폴백 프로토콜 단계 3: 앵커 컨텍스트 있으면 reminder 이슈 (dry-run 기본)
  if [ -n "${CROSS_VALIDATE_ANCHOR:-}" ]; then
    create_reminder_issue "${TYPE}${TARGET:+:${TARGET}}" "${CROSS_VALIDATE_ANCHOR}"
  else
    log "앵커 컨텍스트 없음 (CROSS_VALIDATE_ANCHOR 미설정) — reminder 이슈 생략"
  fi

  # capacity 실패가 아닌 fatal 오류면 1, 그 외엔 claude-only 시그널 77
  if [ "${fatal}" = "1" ]; then
    return 1
  fi
  return "${EXIT_CLAUDE_ONLY_FALLBACK}"
}

# 민감 파일 필터링
is_sensitive() {
  local file="$1"
  case "${file}" in
    *.env|*.env.*|*credentials*|*secret*|*token*|*.key|*.pem)
      return 0
      ;;
  esac
  return 1
}

# plan-mode 우회 가드 — 호출 전 워킹트리 snapshot (#479)
# 외부 검증 모델 호출 (run_external_validator) 직전에 실행해 사전 상태를 박제.
# 사후 비교는 case 분기 후 snapshot_post_and_rollback 으로 수행.
snapshot_pre

case "${TYPE}" in
  structure)
    log "=== 구조 교차검증 시작 ==="

    PROMPT="$(cat <<'PROMPT_END'
당신은 소프트웨어 아키텍처 리뷰어입니다.
이 저장소는 AI 에이전트 기반 자동화 개발 프레임워크입니다.

아래 항목을 기준으로 전체 구조를 교차검증하고 개선점을 제시해주세요:

1. **구조적 완성도**: 에이전트 정의, 스킬, 스크립트, CI/CD가 빠짐없이 연결되어 있는지
2. **워크플로우 일관성**: 에이전트 간 상태 전이, 라벨 체계, 통신 방식에 모순이 없는지
3. **실행 가능성**: 스크립트가 실제로 동작할 수 있는지, 빠진 의존성이 없는지
4. **확장성**: 새 에이전트나 스킬을 추가할 때 구조가 유연한지
5. **보안/안전성**: 위험한 패턴이나 보안 취약점이 없는지
6. **누락된 요소**: 빠진 것이 있다면 무엇인지

모든 파일을 읽고 분석한 뒤, 구체적인 개선 제안을 해주세요.
한국어로 답변해주세요.
PROMPT_END
)"
    run_external_validator "${PROMPT}" || RC=$?
    ;;

  code)
    if [ -z "${TARGET}" ]; then
      echo "에러: PR 번호를 지정하세요."
      echo "사용법: $0 code <PR번호>"
      exit 1
    fi

    log "=== PR #${TARGET} 코드 교차검증 시작 ==="

    # PR diff 수집
    DIFF=$(gh pr diff "${TARGET}" 2>/dev/null)
    if [ -z "${DIFF}" ]; then
      echo "에러: PR #${TARGET}의 diff를 가져올 수 없습니다."
      exit 1
    fi

    # diff 크기 제한 (Gemini 컨텍스트 보호)
    # `head` 는 2000 라인 읽은 뒤 종료해 producer 에 SIGPIPE 를 전달한다.
    # `set -euo pipefail` 하에서 파이프 버퍼(64KB) 초과 입력 시 exit 141 로 조기 종료.
    # awk 는 EOF 까지 소비하여 SIGPIPE 를 회피한다 (이슈 #207).
    DIFF_LINES=$(printf '%s\n' "${DIFF}" | wc -l)
    if [ "${DIFF_LINES}" -gt 2000 ]; then
      log "경고: diff가 ${DIFF_LINES}줄로 큼. 처음 2000줄만 전달합니다."
      DIFF=$(printf '%s\n' "${DIFF}" | awk 'NR<=2000')
    fi

    PR_INFO=$(gh pr view "${TARGET}" --json title,body,labels --template '제목: {{.title}}
라벨: {{range .labels}}{{.name}} {{end}}
본문: {{.body}}' 2>/dev/null || echo "PR 정보 조회 실패")

    PROMPT="$(cat <<PROMPT_END
당신은 시니어 코드 리뷰어입니다.
아래 PR의 변경사항을 교차 리뷰해주세요.

PR 정보:
${PR_INFO}

검증 기준:
1. 로직 정확성 — 버그, 오프바이원 에러, 경쟁 조건
2. 보안 — 인젝션, XSS, 하드코딩된 시크릿, 경로 순회
3. 성능 — 불필요한 루프, 메모리 누수, N+1 문제
4. 엣지 케이스 — 빈 입력, null, 경계값 처리
5. 설계 준수 — 기존 코드 패턴과의 일관성

변경 내용:
\`\`\`diff
${DIFF}
\`\`\`

한국어로 항목별 평가(양호/주의/위험)와 구체적 개선 제안을 해주세요.
PROMPT_END
)"
    run_external_validator "${PROMPT}" || RC=$?
    ;;

  architecture)
    if [ -z "${TARGET}" ]; then
      echo "에러: 설계 문서 경로를 지정하세요."
      echo "사용법: $0 architecture <파일경로>"
      exit 1
    fi

    if [ ! -f "${TARGET}" ]; then
      echo "에러: 파일이 존재하지 않습니다: ${TARGET}"
      exit 1
    fi

    if is_sensitive "${TARGET}"; then
      echo "에러: 민감한 파일은 외부 도구에 전달할 수 없습니다."
      exit 1
    fi

    log "=== 설계 문서 교차검증: ${TARGET} ==="

    DOC_CONTENT=$(cat "${TARGET}")

    PROMPT="$(cat <<PROMPT_END
당신은 소프트웨어 아키텍처 리뷰어입니다.
아래 설계 문서를 검증해주세요.

검증 기준:
1. 구조적 완성도 — 빠진 컴포넌트가 없는지
2. 기술 결정 타당성 — 선택의 근거가 합리적인지
3. 인터페이스 명확성 — 모듈 간 계약이 명확한지
4. 확장성 — 향후 변경에 유연한지
5. 보안 — 위험한 설계 패턴이 없는지
6. 누락 요소 — 고려하지 못한 사항

설계 문서:
${DOC_CONTENT}

한국어로 항목별 평가와 개선 제안을 해주세요.
PROMPT_END
)"
    run_external_validator "${PROMPT}" || RC=$?
    ;;

  skill)
    if [ -z "${TARGET}" ]; then
      echo "에러: 스킬 이름을 지정하세요."
      echo "사용법: $0 skill <스킬명>"
      exit 1
    fi

    SKILL_DIR="${PROJECT_DIR}/.claude/skills/${TARGET}"
    SKILL_FILE="${SKILL_DIR}/SKILL.md"

    if [ ! -f "${SKILL_FILE}" ]; then
      echo "에러: 스킬을 찾을 수 없습니다: ${SKILL_FILE}"
      exit 1
    fi

    log "=== 스킬 교차검증: ${TARGET} ==="

    SKILL_CONTENT=$(cat "${SKILL_FILE}")

    # 평가 셋이 있으면 함께 전달
    EVALS_INFO=""
    if [ -f "${SKILL_DIR}/evals/evals.json" ]; then
      EVALS_INFO="

평가 셋:
$(cat "${SKILL_DIR}/evals/evals.json")"
    fi

    PROMPT="$(cat <<PROMPT_END
당신은 Claude Code 스킬 품질 검증자입니다.
아래 스킬을 검증해주세요.

검증 기준:
1. frontmatter 형식 — name(kebab-case), description 존재 여부
2. description 품질 — TRIGGER when/DO NOT TRIGGER when 패턴, 구체적 키워드 나열
3. 트리거 정확도 — description만으로 과소/과다 트리거 가능성 분석
4. 본문 완성도 — 절차가 실행 가능한지, 명령어가 정확한지
5. 규칙의 명확성 — 모호하거나 모순되는 규칙이 없는지
6. 500줄 이하 여부
${EVALS_INFO:+7. 평가 셋 적절성 — 양성/음성 케이스의 품질과 커버리지}

스킬 내용:
${SKILL_CONTENT}
${EVALS_INFO}

한국어로 항목별 평가와 개선 제안을 해주세요.
PROMPT_END
)"
    run_external_validator "${PROMPT}" || RC=$?
    ;;

  *)
    echo "에러: 알 수 없는 검증 유형 '${TYPE}'"
    usage
    ;;
esac

log ""
log "=== 교차검증 완료 ==="
log "로그: ${LOG_FILE}"

# plan-mode 우회 가드 — 호출 후 diff 검증 + 자동 롤백 (#479)
# 외부 검증 모델 호출 직후 워킹트리 변경이 있는지 검증. 변경 발견 시 자동 롤백 + PLAN_BYPASS=true.
# 결과는 write_outcome_json 이 outcome JSON 의 plan_bypass / bypass_files / rollback_failed 필드에 박제.
snapshot_post_and_rollback

# outcome JSON 출력 (Phase 3, #131) — 호출 측이 extends.cross_validate_outcome 자동 매핑
FINAL_RC="${RC:-0}"
case "${FINAL_RC}" in
  0)  OUTCOME="applied" ;;
  77) OUTCOME="429-fallback-claude-only" ;;
  *)  OUTCOME="fatal-error" ;;
esac
write_outcome_json "${OUTCOME}" "${FINAL_RC}"
log "outcome: ${OUTCOME} (exit ${FINAL_RC}) — ${OUTCOME_FILE}"
# architect 에이전트가 bash 스니펫으로 쉽게 잡을 수 있도록 경로를 stdout 에 명시 출력
# stdout 파싱 편의용 prefix — 호출 측은 grep '^\[outcome-file\] ' 로 추출
echo "[outcome-file] ${OUTCOME_FILE}"

# run_external_validator 가 77 (claude-only fallback) 또는 1 (fatal) 을 반환한 경우 스크립트도 동일 코드로 종료
exit "${FINAL_RC}"
