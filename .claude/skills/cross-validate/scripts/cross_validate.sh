#!/usr/bin/env bash
# Gemini CLI를 활용한 교차검증 스크립트
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

# Gemini CLI 확인
if ! command -v gemini &> /dev/null; then
  echo "에러: gemini CLI가 설치되어 있지 않습니다."
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

# outcome JSON 파일 출력
# architect.md step 8 규약: 이 파일을 읽어 extends.cross_validate_outcome 에 매핑
# outcome 값 규약:
#   "applied"                  — Gemini 정상 응답 수신 (exit 0)
#   "429-fallback-claude-only" — 429 최종 실패 폴백 (exit 77)
#   "fatal-error"              — 비-capacity 치명적 오류 (exit 1)
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

  cat > "${OUTCOME_FILE}" <<EOF
{
  "outcome": "${outcome}",
  "exit_code": ${exit_code},
  "anchor": "${anchor_esc}",
  "pr_ref": "${pr_ref_esc}",
  "context": "${context_esc}",
  "log_file": "${log_file_esc}",
  "reminder_issue": "${reminder_esc}",
  "timestamp": "$(date -u +%Y-%m-%dT%H:%M:%SZ)"
}
EOF
}

# Gemini 모델 설정 — 경량 모델 폴백 없음 (교차검증 품질 보존)
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-pro}"
MAX_GEMINI_RETRIES=2
# 재시도 간 sleep 단위 (초). 테스트에서는 0 으로 설정해 실행 시간 단축.
GEMINI_RETRY_SLEEP_SECONDS="${GEMINI_RETRY_SLEEP_SECONDS:-5}"
# sleep 상한 (초). 지수 backoff 가 MAX_RETRIES 증설 시 폭증하는 것을 방지.
# reviewer non-blocking (#137, v2.21.0~ #131 Phase B): MIN(cap, 2^attempt * BASE)
GEMINI_RETRY_SLEEP_CAP="${GEMINI_RETRY_SLEEP_CAP:-300}"
# capacity probe 옵트아웃. 기본 0 (수행). 권고 4 (#131 Phase B): probe (`gemini -p "hello"`)
# 자체가 free tier quota 를 소모하므로 429 가 이미 감지된 상황에선 생략이 유리할 수 있다.
SKIP_CAPACITY_PROBE="${SKIP_CAPACITY_PROBE:-0}"

# Exit code 규약 (CLAUDE.md API capacity 폴백 프로토콜)
# 0  = Gemini 정상 응답 수신
# 77 = claude-only fallback (Gemini 429/timeout 최종 실패, 단일 모델 편향 노출 미확보)
# 1  = 그 외 실패 (인자 오류 / 파일 부재 / 민감 파일 등)
EXIT_CLAUDE_ONLY_FALLBACK=77

# check_gemini_capacity 반환 코드 규약 (reviewer 권고 2, #131 Phase A)
# 0 = capacity 복구 (probe 성공)
# 2 = 여전히 429/503/500 — capacity 부족 (재시도 의미 낮음)
# 1 = 비-429 probe 실패 (네트워크/인증 등 — 기타 오류와 구분)
# 호출 측은 0 vs 2 vs 1 을 구분해 로그와 재시도 정책을 차별화한다.
CAPACITY_OK=0
CAPACITY_EXHAUSTED=2
CAPACITY_OTHER_ERROR=1

# Gemini capacity 체크 — `gemini -p "hello"` 로 빠른 응답성 확인
# CLAUDE.md `## 교차검증` API capacity 폴백 프로토콜 단계 1
check_gemini_capacity() {
  local probe_output
  probe_output=$(gemini -m "${GEMINI_MODEL}" -p "hello" --approval-mode plan 2>&1) && return "${CAPACITY_OK}"
  if echo "${probe_output}" | grep -qE "RESOURCE_EXHAUSTED|429|503|500"; then
    log "capacity 체크 결과: 여전히 용량 부족 (code=${CAPACITY_EXHAUSTED})"
    return "${CAPACITY_EXHAUSTED}"
  fi
  log "capacity 체크 결과: 비-capacity probe 실패 (code=${CAPACITY_OTHER_ERROR}) — $(echo "${probe_output}" | head -1)"
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

cross-validate 스킬 실행 중 Gemini API capacity 소진으로 **claude-only fallback** 발생. CLAUDE.md \`## 교차검증\` API capacity 폴백 프로토콜 단계 3 (노출 효율 최대 앵커 해당 시 reminder 이슈 박제) 에 따라 API 복구 후 재검증용 이슈 박제.

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

- [ ] Gemini API 복구 확인 (\`gemini -p "hello"\`)
- [ ] 원 컨텍스트에 대해 cross-validate 재실행
- [ ] 결과를 원 PR / ADR / CHANGELOG 해당 위치에 박제
- [ ] 재시도 성공 시 본 이슈 close
BODY
)
  local title="[cross-validate reminder] ${context} — Gemini capacity 복구 후 재시도 (${anchor})"
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

# Gemini 실행 (읽기 전용)
# CLAUDE.md `## 교차검증` API capacity 폴백 프로토콜:
#   1. 1차 429/timeout → capacity 체크 + 지연 후 1회 재시도
#   2. 2차 실패 → claude-only analysis completed 프리픽스 + exit 77
#   3. 앵커 해당 시 reminder 이슈 박제
# 앵커 컨텍스트는 호출 측에서 CROSS_VALIDATE_ANCHOR 환경변수로 전달 가능
run_gemini() {
  local prompt="$1"
  local attempt=1
  local fatal=0
  # Phase B (reviewer #140 권고 3): 루프 내 사용 변수를 함수 스코프에 local 선언해 전역 유출 방지
  local raw_sleep=0
  local capacity_rc=0

  while [ "${attempt}" -le "${MAX_GEMINI_RETRIES}" ]; do
    log "Gemini 실행 중 (모델: ${GEMINI_MODEL}, 시도: ${attempt}/${MAX_GEMINI_RETRIES})..."
    local output
    output=$(gemini -m "${GEMINI_MODEL}" -p "${prompt}" --approval-mode plan 2>&1) && {
      echo "${output}" | tee -a "${LOG_FILE}"
      return 0
    }

    if echo "${output}" | grep -qE "RESOURCE_EXHAUSTED|429|503|500"; then
      log "경고: ${GEMINI_MODEL} 용량 부족 (시도 ${attempt}/${MAX_GEMINI_RETRIES})"
      if [ "${attempt}" -lt "${MAX_GEMINI_RETRIES}" ]; then
        # 폴백 프로토콜 단계 1: 지연 후 (선택적으로) capacity 체크 + 재시도
        # sleep 공식: MIN(SLEEP_CAP, 2^attempt * BASE) — Phase A 의 지수 공식에
        #   Phase B (reviewer non-blocking) 상한 cap 을 추가. MAX_RETRIES=10 이상에서도
        #   sleep 이 GEMINI_RETRY_SLEEP_CAP (기본 300s) 이하로 보장됨.
        # 테스트 환경에서는 GEMINI_RETRY_SLEEP_SECONDS=0 으로 sleep 생략
        if [ "${GEMINI_RETRY_SLEEP_SECONDS}" -gt 0 ]; then
          raw_sleep=$(( (1 << attempt) * GEMINI_RETRY_SLEEP_SECONDS ))
          if [ "${raw_sleep}" -gt "${GEMINI_RETRY_SLEEP_CAP}" ]; then
            log "sleep cap ${GEMINI_RETRY_SLEEP_CAP}s 적용 (원시 ${raw_sleep}s, attempt=${attempt})"
            raw_sleep="${GEMINI_RETRY_SLEEP_CAP}"
          fi
          sleep "${raw_sleep}"
        fi
        # 권고 4 (#131 Phase B) — probe 옵트아웃
        # SKIP_CAPACITY_PROBE=1 설정 시 probe 호출 생략 → free tier quota 보존
        # 호출 측이 "429 이면 재시도도 어차피 429" 를 확신할 때 비용 절약 경로
        if [ "${SKIP_CAPACITY_PROBE}" = "1" ]; then
          log "capacity probe 생략 (SKIP_CAPACITY_PROBE=1) — 바로 재시도"
        else
          # 반환 코드 3값 분기 (reviewer 권고 2, #131 Phase A)
          # Gemini 교차검증 (#137) 고유 발견 반영: CAPACITY_OTHER_ERROR 케이스 명시 +
          # `*)` 는 알 수 없는 code 방어용 (향후 반환 코드 추가 시 조용한 오분기 방지)
          capacity_rc=0
          check_gemini_capacity || capacity_rc=$?
          case "${capacity_rc}" in
            "${CAPACITY_OK}")
              log "capacity 복구 감지 — 재시도 진행"
              ;;
            "${CAPACITY_EXHAUSTED}")
              log "capacity 여전히 부족 — 재시도 진행하되 조기 포기 가능성 높음"
              ;;
            "${CAPACITY_OTHER_ERROR}")
              log "capacity probe 실패 (비-429) — 재시도는 진행 (probe 자체 이슈일 수 있음)"
              ;;
            *)
              log "알 수 없는 capacity_rc (${capacity_rc}) — 재시도 진행 (방어적 분기)"
              ;;
          esac
        fi
      fi
      attempt=$((attempt + 1))
    else
      log "경고: ${GEMINI_MODEL} 실패 (비-capacity 오류) — $(echo "${output}" | head -3)"
      echo "${output}" >> "${LOG_FILE}"
      fatal=1
      break
    fi
  done

  # 폴백 프로토콜 단계 2: claude-only analysis completed 박제
  local fallback_msg="claude-only analysis completed — 단일 모델 편향 노출 미확보"
  log "${fallback_msg}"
  echo "${fallback_msg}" >&2
  # stdout 헤더 (reviewer 권고 1, #131 Phase A) — 호출 측이 stdout 만으로 fallback 모드 감지 가능
  # 정상 경로 stdout 에는 Gemini 응답 본문이 출력됨. fallback 경로는 본문이 없으므로 이 프리픽스가 signal.
  # NOTE (qa non-blocking, #131 Phase B): fatal 경로 (비-capacity 오류, exit 1) 도 이 헤더를
  #   동일하게 출력한다. fatal vs 429 정확 구분은 outcome JSON 의 "outcome" 필드를 참조해야 하며
  #   (scripts/parse-cross-validate-outcome.sh 헬퍼 사용 권장), stdout 헤더 단독으로는 구분 불가.
  echo "[claude-only-fallback] Gemini ${GEMINI_MODEL} 응답 없음 — Claude 단독 분석 (교차검증 미확보)"
  echo "⚠ 교차검증 불가 — Claude 단독 분석. Gemini ${GEMINI_MODEL} 응답 없음." | tee -a "${LOG_FILE}"

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
    run_gemini "${PROMPT}" || RC=$?
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
    DIFF_LINES=$(echo "${DIFF}" | wc -l)
    if [ "${DIFF_LINES}" -gt 2000 ]; then
      log "경고: diff가 ${DIFF_LINES}줄로 큼. 처음 2000줄만 전달합니다."
      DIFF=$(echo "${DIFF}" | head -2000)
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
    run_gemini "${PROMPT}" || RC=$?
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
    run_gemini "${PROMPT}" || RC=$?
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
    run_gemini "${PROMPT}" || RC=$?
    ;;

  *)
    echo "에러: 알 수 없는 검증 유형 '${TYPE}'"
    usage
    ;;
esac

log ""
log "=== 교차검증 완료 ==="
log "로그: ${LOG_FILE}"

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

# run_gemini 가 77 (claude-only fallback) 또는 1 (fatal) 을 반환한 경우 스크립트도 동일 코드로 종료
exit "${FINAL_RC}"
