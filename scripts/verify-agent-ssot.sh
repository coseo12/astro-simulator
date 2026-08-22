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
#   [검사 2] 헤딩 글루 라인 — 코드펜스 밖에서 인라인 코드 스팬을 비공백 placeholder 로
#            치환한 뒤, **라인 선두가 아닌 위치**에 `#`~`######` + 공백 이 나타나면 FAIL.
#            #1124 손상은 두 형태였다: 4파일은 **앵커 헤딩**이 글루됐고 developer 는
#            **`## 규칙`** 이 글루됐다(developer 의 앵커는 무손상). 즉 검사 1 은 5/5 를
#            못 덮으며, developer 형태를 잡는 것은 검사 2 뿐이다.
#
# 두 검사의 분담 — 검사 1 은 **존재 계약**("정상 형태의 앵커가 최소 1개 있는가"),
# 검사 2 는 **무결성 계약**("어떤 라인도 헤더가 글루되지 않았는가")이다. 검사 1 을
# 「첫 등장 라인」에 묶으면 양방향으로 샌다(상세는 check_anchor_form 주석). 대신 검사 1 이
# 공허 통과하는 구성(앞쪽에 번호 리스트 언급 + 뒤쪽 앵커 글루)은 **검사 2 가 받아낸다** —
# 실측: 그 픽스처에서 검사 1 무발화 / 검사 2 발화 1건 / exit 1.
#
# 술어 작성 시 주의 (실측으로 틀렸던 지점 — 전부 재현 후 정정):
#   - 제외 문자류에 `#` 을 반드시 포함한다. 초판 `[^[:space:]]#{2,6}[[:space:]]` 는
#     `###` 자신의 첫 `#` 이 「비공백 문자」에 매칭되어 **h3 이상 헤딩을 자기 매칭**했다
#     (`## h2` 는 매칭되지 않는다 — 격리 픽스처 4줄로 재현). 규모는 술어·도구·모집단에
#     따라 두 자릿수 이상 갈린다: `grep -rE '[^[:space:]]#{2,6} ' .claude --include='*.md'`
#     = 64,414 hit 이지만 그 모집단은 **on-disk 19,351 md** 로 gitignored
#     `.claude/worktrees/` 사본이 지배적이고, tracked 기준
#     `git grep -E '[^[:space:]]#{2,6} ' -- .claude` = **178 hit / tracked 23 md** 다.
#     올바른 형태는 `[^[:space:]#]#+[[:space:]]`.
#   - 인터벌 `{n,m}` 에 의존하지 않는다 (macOS BWK awk 호환) — `#+` 를 쓴다.
#   - 코드 스팬 치환 문자는 **비공백**이어야 한다 (check_glue_lines 주석 (1) 참조).
#
# ⚠️ 명시된 범위 경계 (조용한 미검출이 아니라 계약된 한계 — 전부 실측):
#   a) **표 셀 구분자 오탐** — `| ## 헤더` 가 아닌 `|## 헤더` 형태는 `|` 가 비공백이라
#      글루로 잡힌다. tracked 245 md 전수에서 현행 발생 0건.
#   b) **`C# ` / `F# ` 류 언어명 오탐** — `#+` 확장(h1 글루 검출)이 새로 들여온 형태다.
#      tracked 245 md 전수 리터럴 `[CF]# ` **0건**이라 확장을 택했으나, 위험 자체는
#      실재하므로 미래에 걸리면 이 줄을 근거로 `##+` 로 되돌리거나 예외를 논하라.
#   c) 위 두 형태를 뺀 오탐은 tracked 245 md 전수에서 **1건**뿐이며
#      (`docs/decisions/20260430-r3-followup-body-proportion.md:1153`, 큰따옴표 안 정당
#      인용) 이 가드의 모집단(5파일) 밖이다.
#   d) **검사 1·2 의 공동 사각** — 「앞쪽에 정상 형태의 앵커 언급(번호 리스트 등)이 있고
#      + 뒤쪽 진짜 앵커가 `#` **없는 평문**으로 강등」된 조합은 양쪽 다 무발화라 exit 0 이다.
#      검사 1 은 존재 계약이라 앞쪽 언급으로 만족되고, 검사 2 는 `#` 이 없어 글루로 안 본다.
#      검사 2 가 검사 1 의 backstop 이라는 서술은 **`#` 이 남아 있는 형태에 한정**된다.
#      #1124 실사고는 `#` 이 남는 형태였고, 이 조합은 현재 발생 0건이다.
#   e) **검사 1 은 `^## ` (h2) 만 수용한다** — `### 마무리 체크리스트 JSON 반환` 은 FAIL 이다.
#      이는 **의도된 계약**이다: 이 섹션은 5파일 전건에서 최상위 절이며 (실측: 4파일이
#      `## `, developer 만 번호 리스트 항목), 절 레벨이 내려가면 문서 구조 자체가 바뀐 것이라
#      가드가 붙잡아야 한다. 현재 `### ` 사례는 0건이다.
#   ⚠️ 초판 주석이 경계를 「이중 백틱 스팬 **안**」으로 적었던 것은 **거짓이었다** —
#      실제로는 치환 문자가 공백이라 **코드 스팬 직후 글루 전부**가 백틱 개수와 무관하게
#      미탐이었다. placeholder 수정으로 해소됐고, 3형태(링크 직후 / 단일 백틱 직후 /
#      이중 백틱 직후) 전건 exit 1 을 실증했다.
#
# 모집단은 이 가드의 기존 5파일로 고정한다 (`.claude/**` · `docs/**` 확대는 #1125 비-범위).
#
# 관련 이슈: #1125 (앵커 헤딩성 + 글루 라인 검사 추가). 손상 원인 PR: #1124.
#            리뷰 라운드 1 (PR #1133) 에서 B1(치환 문자) · B2(SSoT 리터럴) · 펜스 추적 ·
#            검사 1 누수 · 수치 술어 4건을 실측 반증받아 정정.

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
# ⚠️ 이 주장은 **양쪽이 실제로 이 변수를 소비할 때만** 참이다 — extract_json_block 이
# 리터럴을 들고 있으면 여기만 바꿔도 갈린다 (#1125 리뷰 B2 에서 실제로 그 상태였다).
# 소비처를 늘리거나 옮길 때 `grep -n 'ANCHOR_KEYWORD'` 로 전수 확인할 것.
ANCHOR_KEYWORD="마무리 체크리스트 JSON 반환"

# 파일당 구조 검사 횟수 — check_agent 가 호출하는 check_*_form/lines 함수 개수와 일치해야 한다.
# 최종 요약에서 곱수로 쓰이며, 실제 누적값(checked_structure)과 대조 검증한다 (#1125 리뷰 권고 7 —
# 하드코딩 곱수가 조용히 drift 하는 것을 막는다).
STRUCTURE_CHECKS_PER_FILE=2

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
  awk -v kw="${ANCHOR_KEYWORD}" '
    # 1. 앵커 키워드가 나올 때까지 무시 — 리터럴이 아니라 ANCHOR_KEYWORD 를 소비한다
    #    (#1125 리뷰 B2: 리터럴이면 변수와 갈려 "변수 1개로 고정" 주석이 거짓이 된다)
    !seen && index($0, kw) { seen = 1; next }
    # 2. 키워드 발견 후, 첫 ```json 코드블록 시작점을 찾음 (들여쓰기 허용)
    seen && !in_json && /^[[:space:]]*```json[[:space:]]*$/ { in_json = 1; next }
    # 3. 코드블록 내부에서 닫는 ``` 를 만나면 즉시 처리 종료
    in_json && /^[[:space:]]*```[[:space:]]*$/ { exit }
    # 4. 코드블록 내부에 있으면 해당 라인 수집
    in_json { print }
  ' "${file}"
}

# [검사 1] 앵커 헤딩성 — 앵커 키워드를 담은 라인 중 **최소 1개**가 `^## …` (헤딩) 또는
# `^<숫자>. …` (번호 리스트 항목) 형태여야 한다. 하나도 없으면 FAIL.
#
# ⚠️ 「첫 등장 라인만 본다」로 쓰면 안 된다 (#1125 리뷰 권고 2 — 양방향 누수):
#   - 오탐 축: 같은 파일 다른 절에 이 문구를 언급하는 **정당한 상호참조 불릿**을 앞에
#     추가하는 것만으로 FAIL 이 난다. 문서를 정상적으로 늘리는 행위가 가드를 깨면
#     가드가 회피 대상이 된다.
#   - 공허 통과 축: 앞쪽에 번호 리스트 언급이 먼저 있으면 진짜 앵커가 글루돼도 통과한다.
# 그래서 검사 1 은 **존재 계약**("정상 형태의 앵커가 있는가")만 지고, 개별 라인의
# **무결성 계약**("어떤 라인도 헤더가 글루되지 않았는가")은 검사 2 가 전담한다.
# 두 계약의 곱이 #1124 손상 2형태를 덮는다 — 실증은 PR 본문의 negative 픽스처 참조.
#
# awk 로 훑는다 — grep 은 미발견 시 exit 1 이라 `|| true` 가 필요해지고,
# 그 우회로는 가드 설계 원칙(fail-fast, soft-exit 0건)에 어긋난다.
check_anchor_form() {
  local agent="$1"
  local file="$2"

  # occurrences = 키워드를 담은 전체 라인 수 / valid = 그중 정당 형태 라인 수 / first = 첫 등장(진단용)
  local scan
  scan=$(awk -v kw="${ANCHOR_KEYWORD}" '
    index($0, kw) {
      total++
      if ($0 ~ /^##[[:space:]]/ || $0 ~ /^[0-9]+\.[[:space:]]/) valid++
      if (total == 1) first = FNR ": " substr($0, 1, 120)
    }
    END { printf "%d\t%d\t%s", total + 0, valid + 0, first }
  ' "${file}")

  checked_structure=$((checked_structure + 1))

  local total="${scan%%$'\t'*}"
  local rest="${scan#*$'\t'}"
  local valid="${rest%%$'\t'*}"
  local first="${rest#*$'\t'}"

  if [ "${total}" -eq 0 ]; then
    echo "❌ [${agent}] 앵커 문구 '${ANCHOR_KEYWORD}' 없음 — ${file}" >&2
    errors=$((errors + 1))
    return
  fi

  if [ "${valid}" -gt 0 ]; then
    return
  fi

  echo "❌ [${agent}] 정상 형태의 앵커가 0개 (키워드 등장 ${total}회, 전부 헤딩/번호 리스트 항목 아님) — ${file}" >&2
  echo "     기대: '## ${ANCHOR_KEYWORD} …' 또는 '<숫자>. …${ANCHOR_KEYWORD}…'" >&2
  echo "     첫 등장: ${first}" >&2
  errors=$((errors + 1))
}

# [검사 2] 헤딩 글루 라인 — 코드펜스 밖에서, 인라인 코드 스팬을 비공백 placeholder 로
# 치환한 뒤, 라인 선두가 아닌 위치에 `##`~`######` + 공백 이 나타나면 FAIL.
# #1124 의 developer `## 규칙` 손상은 이 검사만 잡는다 (그 파일의 앵커는 무손상이었다).
#
# 설계상 유의점 2가지 — 둘 다 리뷰에서 실측으로 반증된 초판의 결함이다 (#1125 리뷰):
#
#  (1) 코드 스팬 치환 문자는 **비공백**이어야 한다. 초판은 공백(" ")으로 치웠는데
#      술어가 `[^[:space:]#]` 로 **비공백** 선행 문자를 요구하므로, 코드 스팬 **직후**의
#      글루(`` `docs/x.md`## 규칙 ``)가 백틱 개수와 무관하게 전량 미탐이었다.
#      placeholder `\001` 은 마크다운 본문에 나타나지 않는 제어문자다.
#
#  (2) 펜스는 **여는 마커의 문자 종류와 길이를 기억**해야 한다 (CommonMark). 초판은
#      `fence = !fence` 단순 토글이라 4-백틱 펜스 안의 3-백틱 펜스에서 상태가 반전됐다
#      (`architect.md:115~121` / `pm.md:114~120` 실재). 그 구간은 안쪽 토글이 짝수라
#      우연히 복구됐지만, **홀수가 되면 그 뒤 파일 전체가 조용히 검사에서 빠진다** —
#      가드가 눈머는 경로라 fail-fast 원칙상 허용 불가.
#      여는 펜스는 백틱/틸드 3개 이상, 닫는 펜스는 **같은 문자 · 같은 길이 이상 · info
#      string 없음** 일 때만 성립시킨다.
#
#  (3) 선두 헤딩 라인을 **skip 하지 않는다** — 마커만 떼고 나머지를 계속 검사한다.
#      #1124 의 기전은 「헤딩 앞 개행 1개 소실」인데, **선행 라인이 헤딩이면** 글루 결과가
#      `## 사용 스킬## 금지` 처럼 헤딩 형태로 시작한다. 라인 통째 skip 이면 같은 사고의
#      인접 변형이 그대로 통과했다 (실측: 불릿→헤딩 글루 exit 1 / 헤딩→헤딩 글루 exit 0).
#      `## 금지` 처럼 **빈 줄 하나로 인접한 헤딩 쌍**이 5파일에 실재하므로 가상이 아니다.
#
#  (4) 미종료 펜스는 **오류로 올린다** (fallback 금지). 닫히지 않은 펜스는 그 지점부터
#      EOF 까지 전 라인을 조용히 검사에서 뺀다 — (2) 가 「가드가 눈머는 경로」라고 선언한
#      바로 그 결과가 다른 문(門)으로 남아 있었다. `END { if (fence) … }` 로 차단한다.
#      실측: 현행 5파일은 전건 EOF `fence=0` 이라 오탐 0.
#
# ⚠️ 절대 들여쓰기 `≤3` 규칙(CommonMark 여는 펜스 조건)은 **의도적으로 넣지 않았다.**
#   이 5파일에는 번호 리스트 안에 들여쓴 펜스가 실재하고 (indent≥4 가 **6줄** —
#   `architect.md:124,126` / `developer.md:28,47` / `reviewer.md:43,45`), 그중
#   `developer.md:28` 은 **앵커 섹션의 JSON 블록 자체**다. 절대 규칙을 넣으면 이 6줄이
#   펜스로 인식되지 않아 블록 내용이 검사 대상이 되며, 이는 검출 이득 없이 오탐 표면만
#   넓힌다 (CommonMark 의 `≤3` 은 **컨테이닝 블록 상대** 값이라 절대 비교가 애초에 부정확).
#   들여쓴 스트레이 펜스로 인한 침묵은 (4) 의 미종료 검사가 대신 막는다.
#   ⚠️ 잔여 — 스트레이 펜스가 뒤의 진짜 펜스로 **짝수 상쇄**되면 END 는 발화하지 않는다.
#      (2) 의 문자·길이 매칭이 그 범위를 줄이지만 0 은 아니다. 알려진 한계로 남긴다.
#
# 범위 경계(표 셀 `|##` / `C# ` 류 / 확장 근거 수치)는 파일 상단 주석에 일괄 박제.
check_glue_lines() {
  local agent="$1"
  local file="$2"

  local flagged
  flagged=$(awk '
    {
      s = $0
      sub(/^[[:space:]]+/, "", s)
      ch = substr(s, 1, 1)
      if (ch == "`" || ch == "~") {
        n = 0
        while (substr(s, n + 1, 1) == ch) n++
        if (n >= 3) {
          if (!fence) {
            # 여는 펜스 — 마커 문자와 길이, 그리고 위치를 기억한다 (미종료 진단용)
            fence = 1; fchar = ch; flen = n; fline = FNR
            next
          } else if (ch == fchar && n >= flen) {
            # 닫는 펜스 후보 — 뒤에 info string 이 없어야 실제로 닫힌다
            tail = substr(s, n + 1)
            gsub(/[[:space:]]/, "", tail)
            if (tail == "") { fence = 0; next }
          }
          # 그 밖(다른 마커 문자 / 더 짧은 길이)은 코드블록 "내용" 이다 — 닫지 않는다
        }
      }
      if (fence) next

      line = $0
      # 선두 헤딩 마커는 **떼기만** 하고 라인을 계속 검사한다 (위 유의점 3).
      # 라인 전체를 skip 하면 헤딩→헤딩 글루(`## A## B`)가 통째로 빠진다.
      sub(/^[[:space:]]*#+[[:space:]]+/, "", line)
      # 인라인 코드 스팬 → 비공백 placeholder (위 유의점 1)
      gsub(/`[^`]*`/, "\001", line)
      # `#` 을 제외 문자류에 포함해야 `###` 의 첫 `#` 이 「비공백 문자」로 자기 매칭되지 않는다.
      # 인터벌 {n,m} 미사용 — macOS BWK awk 호환 (`#+` 를 쓴다).
      if (match(line, /[^[:space:]#]#+[[:space:]]/)) printf "GLUE\t%d: %s\n", FNR, substr($0, 1, 120)
    }
    END {
      # 미종료 펜스 = 그 지점부터 EOF 까지 전 라인이 조용히 검사에서 빠졌다는 뜻이다.
      # 「검사 계속」으로 흡수하지 않고 오류로 올린다 (위 유의점 4 — fallback 분기 금지).
      if (fence) printf "FENCE\t%d: 여기서 열린 펜스(%s×%d)가 EOF 까지 닫히지 않았다\n", fline, fchar, flen
    }
  ' "${file}")

  checked_structure=$((checked_structure + 1))

  if [ -n "${flagged}" ]; then
    while IFS= read -r hit; do
      local kind="${hit%%$'\t'*}"
      local detail="${hit#*$'\t'}"
      if [ "${kind}" = "FENCE" ]; then
        echo "❌ [${agent}] 미종료 코드펜스 — 이후 전 라인이 검사에서 빠졌다 — ${detail}" >&2
      else
        echo "❌ [${agent}] 마크다운 헤더가 앞 텍스트에 글루됨 (헤딩으로 파싱되지 않음) — ${detail}" >&2
      fi
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

# 요약 곱수 자기 검증 — 리터럴이 실제 누적값과 갈리면 fail-fast (fallback 분기 금지)
expected_structure=$((${#AGENTS[@]} * STRUCTURE_CHECKS_PER_FILE))
if [ "${checked_structure}" -ne "${expected_structure}" ]; then
  echo "❌ 구조 검사 횟수 불일치 — 기대 ${expected_structure} (${#AGENTS[@]} files × ${STRUCTURE_CHECKS_PER_FILE}), 실제 ${checked_structure}." >&2
  echo "   STRUCTURE_CHECKS_PER_FILE 이 check_agent 의 구조 검사 호출 수와 갈렸다. 상수를 갱신하라." >&2
  exit 1
fi

echo "✅ agent SSoT drift 없음 (${#AGENTS[@]} files × ${#CORE_FIELDS[@]} fields = ${checked_fields} checks)"
echo "✅ 구조 검사 통과 (${#AGENTS[@]} files × ${STRUCTURE_CHECKS_PER_FILE} checks = ${checked_structure} checks — 앵커 헤딩성 / 헤딩 글루 라인)"
