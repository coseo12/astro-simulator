#!/usr/bin/env bash
# Gemini CLI를 활용한 교차검증 스크립트
set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/../../../.." && pwd)"
LOG_DIR="${PROJECT_DIR}/.claude/logs"
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

log() {
  echo "[$(date -u +%Y-%m-%dT%H:%M:%SZ)] $*" | tee -a "${LOG_FILE}"
}

# Gemini 모델 설정 — 경량 모델 폴백 없음 (교차검증 품질 보존)
GEMINI_MODEL="${GEMINI_MODEL:-gemini-2.5-pro}"
MAX_GEMINI_RETRIES=2

# Gemini 실행 (읽기 전용, 실패 시 스킵)
run_gemini() {
  local prompt="$1"
  local attempt=1

  while [ "${attempt}" -le "${MAX_GEMINI_RETRIES}" ]; do
    log "Gemini 실행 중 (모델: ${GEMINI_MODEL}, 시도: ${attempt}/${MAX_GEMINI_RETRIES})..."
    local output
    output=$(gemini -m "${GEMINI_MODEL}" -p "${prompt}" --approval-mode plan 2>&1) && {
      echo "${output}" | tee -a "${LOG_FILE}"
      return 0
    }

    if echo "${output}" | grep -qE "RESOURCE_EXHAUSTED|429|503|500"; then
      log "경고: ${GEMINI_MODEL} 용량 부족 (시��� ${attempt}/${MAX_GEMINI_RETRIES})"
      attempt=$((attempt + 1))
      sleep $((attempt * 5))
    else
      log "경고: ${GEMINI_MODEL} 실패 — $(echo "${output}" | head -3)"
      echo "${output}" >> "${LOG_FILE}"
      break
    fi
  done

  log "교차검증 스킵: Gemini API 사용 불가. Claude 단독 분석으로 전환합니다."
  echo "⚠ 교차검증 불가 — Claude 단독 분석. Gemini ${GEMINI_MODEL} 응답 없음." | tee -a "${LOG_FILE}"
  return 1
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
    run_gemini "${PROMPT}"
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
    run_gemini "${PROMPT}"
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
    run_gemini "${PROMPT}"
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
    run_gemini "${PROMPT}"
    ;;

  *)
    echo "에러: 알 수 없는 검증 유형 '${TYPE}'"
    usage
    ;;
esac

log ""
log "=== 교차검증 완료 ==="
log "로그: ${LOG_FILE}"
