#!/usr/bin/env bash
# verify-agent-ssot.sh
# 5개 에이전트 파일의 `## 마무리 체크리스트 JSON 반환 (필수)` 섹션이
# CLAUDE.md 의 공통 JSON 스키마 SSoT (코어 필드 9개) 를 모두 포함하는지 + 선언 순서대로
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
#
# ─────────────────────────────────────────────────────────────────────────────
# #1125 — 왜 키워드 매칭만으로는 뚫렸는가 (구조 검사 2종 추가 근거)
# ─────────────────────────────────────────────────────────────────────────────
# 이 가드의 섹션 추출기(extract_json_block)는 `^## ` 앵커가 아니라 **키 문구가 라인
# 어딘가에 등장하는지**로 섹션 시작을 식별한다 (그 이유는 아래 extract_json_block 주석
# 참조 — 5파일의 앵커 형태가 실제로 균일하지 않다). 그런데 이 관용성은 "앵커가 라인
# 선두에 있는가" 를 **아무도 검사하지 않는다** 는 뜻이기도 했다.
#
# PR #1124 에서 `.claude/agents/*.md` 5파일 전건의 마크다운 헤더가 앞 불릿 꼬리에 붙어
# 헤딩으로 파싱되지 않는 상태가 만들어졌는데도 이 가드는 초록이었다. 손상 형태:
#
#   - 상세: [`docs/lessons/x.md`](../../docs/lessons/x.md)## 마무리 체크리스트 JSON 반환 (필수)
#
# 키워드는 그대로 라인 안에 있으므로 추출기는 정상 동작했고, 9필드도 전건 통과했다.
# 실피해 1건 + dead reference 4곳이 CI 전 구간 초록 상태로 통과했다.
#
# 그래서 아래 두 검사를 추가한다 (신규 스크립트 · 신규 CI step · 신규 npm script 없이
# 이 가드 안에서 술어만 늘린다 — 검사 표면 증가 0):
#
#   [검사 1] 앵커 헤딩성 — 앵커 라인이 `^## …` **또는** `^<숫자>. …` 여야 한다.
#            두 형태 모두 정당한 현행 계약이다 (실측: architect/pm/qa/reviewer 는 헤딩,
#            developer 는 번호 리스트 항목). `^## ` 로 전면 교체하면 developer 오탐이다.
#
#   [검사 2] 헤딩 글루 라인 — 코드펜스(``` / ~~~) 와 인라인 코드 스팬 제거 후, **라인
#            선두가 아닌 위치**에 `##`~`######` + 공백 이 나타나면 FAIL.
#            #1124 손상은 두 형태였다: 4파일은 **앵커 헤딩**이 글루됐고 developer 는
#            **`## 규칙`** 이 글루됐다(developer 의 앵커는 무손상). 즉 검사 1 은 5/5 를
#            못 덮으며, developer 형태를 잡는 것은 검사 2 뿐이다.
#
# 술어 작성 시 주의 (실측으로 한 번 틀린 지점):
#   - 제외 문자류에 `#` 을 반드시 포함한다. 초판 `[^[:space:]]#{2,6}[[:space:]]` 는
#     `###` 자신의 첫 `#` 이 「비공백 문자」에 매칭되어 정상 헤딩을 전부 오탐했다
#     (`.claude/**` 64,414 hit). 올바른 형태는 `[^[:space:]#]##+[[:space:]]`.
#   - 인터벌 `{n,m}` 에 의존하지 않는다 (macOS BWK awk 호환) — `##+` 를 쓴다.
#
# ⚠️ 명시된 범위 경계 (조용한 미검출이 아니라 계약된 한계):
#   인라인 코드 제거가 **단일 백틱 스팬만** 처리하므로, 이중 백틱(`` ``…`` ``) 스팬
#   안의 `## ` 는 검사 2 가 검출하지 못한다. 현행 5파일에서 실피해 0 임을 실측했고,
#   필요해지면 별도 이슈로 확장한다.
#
# 모집단은 이 가드의 기존 5파일로 고정한다 (`.claude/**` · `docs/**` 확대는 #1125 비-범위).
#
# 관련 이슈: #1125 (앵커 헤딩성 + 글루 라인 검사 추가). 손상 원인 PR: #1124

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

# 앵커 문구 — 이 문구 1개가 섹션 추출(extract_json_block)과 헤딩성 검사(check_anchor_form)의
# 공통 기준점이다. 두 곳이 갈리지 않도록 변수 1개로 고정한다.
ANCHOR_KEYWORD="마무리 체크리스트 JSON 반환"

errors=0
checked_fields=0
checked_structure=0

# "마무리 체크리스트 JSON 반환" 문구가 등장한 이후의 첫 `json ... ` 코드블록을 추출.
# 헤더 형태가 파일마다 다르다 — 일부는 `## 마무리 체크리스트 JSON 반환 (필수)` 의 독립 섹션,
# 일부는 번호 리스트 항목 (`12. **마무리 체크리스트 JSON 반환** — ...`) 형태.
# 따라서 섹션 헤더 정규식이 아닌 "키 문구 등장 + 이후 첫 json 블록" 으로 식별한다.
# 리스트 항목 형태는 json fence 가 들여쓰기된 경우도 있어 leading whitespace 를 허용.
#
# ⚠️ #1125 정정 — 이 관용성은 "두 형태를 모두 받는다" 는 뜻이지 "어떤 위치든 받는다" 는
# 뜻이 아니다. 문구가 앞 문장 꼬리에 붙어도(= 헤딩으로 파싱되지 않아도) 이 추출기는
# 그대로 통과하므로, **앵커의 위치 계약은 별도 검사(check_anchor_form)가 진다.**
# 추출기 자체는 아래 그대로 두고, 뚫린 축만 구조 검사 2종으로 막는다 (상단 주석 참조).
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

# [검사 1] 앵커 헤딩성 — 앵커 라인이 `^## …` (헤딩) 또는 `^<숫자>. …` (번호 리스트 항목)
# 이어야 한다. 그 밖의 위치(문장/불릿 꼬리에 글루)면 FAIL.
# awk 로 첫 등장 라인만 뽑는다 — grep 은 미발견 시 exit 1 이라 `|| true` 가 필요해지고,
# 그 우회로는 가드 설계 원칙(fail-fast, soft-exit 0건)에 어긋난다.
check_anchor_form() {
  local agent="$1"
  local file="$2"

  local anchor
  anchor=$(awk -v kw="${ANCHOR_KEYWORD}" 'index($0, kw) { printf "%d:%s", FNR, $0; exit }' "${file}")

  checked_structure=$((checked_structure + 1))

  if [ -z "${anchor}" ]; then
    echo "❌ [${agent}] 앵커 문구 '${ANCHOR_KEYWORD}' 없음 — ${file}" >&2
    errors=$((errors + 1))
    return
  fi

  local line_no="${anchor%%:*}"
  local text="${anchor#*:}"

  if [[ "${text}" =~ ^##[[:space:]] ]] || [[ "${text}" =~ ^[0-9]+\.[[:space:]] ]]; then
    return
  fi

  echo "❌ [${agent}] 앵커가 헤딩/번호 리스트 항목이 아님 (line ${line_no}) — ${file}" >&2
  echo "     기대: '## ${ANCHOR_KEYWORD} …' 또는 '<숫자>. …${ANCHOR_KEYWORD}…'" >&2
  echo "     실제: ${text:0:120}" >&2
  errors=$((errors + 1))
}

# [검사 2] 헤딩 글루 라인 — 코드펜스/인라인 코드 스팬 제거 후, 라인 선두가 아닌 위치에
# `##`~`######` + 공백 이 나타나면 FAIL. #1124 의 developer `## 규칙` 손상은 이 검사만 잡는다.
# 범위 경계(이중 백틱 스팬 미처리) 는 상단 주석에 명시.
check_glue_lines() {
  local agent="$1"
  local file="$2"

  local flagged
  flagged=$(awk '
    # 코드펜스 토글 — 펜스 내부는 마크다운 헤딩 문법이 적용되지 않으므로 검사 제외
    /^[[:space:]]*(```|~~~)/ { fence = !fence; next }
    fence { next }
    # 정상 헤딩 라인 (선두 `#`) 은 검사 대상이 아니다
    /^[[:space:]]*#+[[:space:]]/ { next }
    {
      line = $0
      gsub(/`[^`]*`/, " ", line)     # 인라인 코드 스팬 제거 (단일 백틱 한정 — 범위 경계)
      # `#` 을 제외 문자류에 포함해야 `###` 의 첫 `#` 이 「비공백 문자」로 오탐되지 않는다.
      # 인터벌 {n,m} 미사용 — macOS BWK awk 호환.
      if (match(line, /[^[:space:]#]##+[[:space:]]/)) printf "%d: %s\n", FNR, substr($0, 1, 120)
    }
  ' "${file}")

  checked_structure=$((checked_structure + 1))

  if [ -n "${flagged}" ]; then
    while IFS= read -r hit; do
      echo "❌ [${agent}] 마크다운 헤더가 앞 텍스트에 글루됨 (헤딩으로 파싱되지 않음) — ${hit}" >&2
      errors=$((errors + 1))
    done <<< "${flagged}"
  fi
}

check_agent() {
  local agent="$1"
  local file="${AGENT_DIR}/${agent}.md"

  if [ ! -f "${file}" ]; then
    echo "❌ [${agent}] 파일 없음 — ${file}" >&2
    errors=$((errors + 1))
    return
  fi

  # 구조 검사 2종 (#1125) — 9필드 검사보다 먼저. 앵커가 글루돼도 추출기는 통과하므로
  # 필드 검사 결과와 무관하게 독립적으로 판정한다.
  check_anchor_form "${agent}" "${file}"
  check_glue_lines "${agent}" "${file}"

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
echo "✅ 구조 검사 통과 (${#AGENTS[@]} files × 2 checks = ${checked_structure} checks — 앵커 헤딩성 / 헤딩 글루 라인)"
