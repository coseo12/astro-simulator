#!/usr/bin/env bash
#
# harness-update-safe.sh — `harness update` 원자적 래퍼 (#894 PR-B)
#
# ## 왜 필요한가
#
# `harness update --apply-*` 는 그 자체로 **매니페스트를 오염시킨다**. upstream
# `lib/update.js` apply() 4단계가 `buildManifest(cwd)` 로 프로젝트 디스크를 재해싱하므로,
# 적용되지 않은 divergent 파일의 로컬 해시가 다음 회차 baseline 으로 **세탁**되고,
# 그 파일들은 `modified-pristine` ("사용자 미수정") 으로 오분류돼 자동 덮어쓰기 대상이 된다
# (ADR 20260515 §Amendment 17, #894 §0-2 실측).
#
# 그래서 update 직후 **반드시** 위생 복원 + 재생성 + 가드 검증이 따라야 한다. Amendment 17
# §결정 5 는 이를 `.claude/commands/harness-update.md` §7 절차로 박제했으나, **사람이
# 기억해서 실행하는 구조는 재발한다** — PR #893 이 정확히 그 절차 누락으로 baseline 6건을
# 세탁했다. cross-validate(agy) 고유 발견 1 이 이 지점을 지적했고, 설계의 비목표
# ("래핑 스크립트 불필요 — 커맨드 문서 절차로 충분") 를 실측이 반박했다.
#
# 본 스크립트는 update → 위생 복원 → 재생성 → 가드 검증을 **1-step 원자 실행**한다.
#
# ## fail-fast + 복구 가능성 (CLAUDE.md §가드 설계 원칙 — fallback 분기 금지)
#
# 어느 단계든 실패하면 즉시 중단한다. "일단 진행하고 나중에 고친다" 분기를 두지 않는다 —
# 그 분기가 바로 #893 의 실패 모드다.
#
# 다만 **본 래퍼는 롤백하지 않는다**. `harness update --apply-*` 가 트리를 바꾼 뒤 후속
# 단계가 실패하면 변경분이 남는다. cross-validate(agy) 가 지적한 위험이 이것이다 —
# *"1-step 이니 안심"* 심리가 오히려 사고 규모를 키울 수 있다. 그래서 **복구 가능성을
# 구조적으로 보장**한다:
#
#   1. **실행 전 clean working tree 강제** — dirty 면 fail-fast. 사전 변경분과 apply
#      결과가 섞이면 `git checkout .` 이 사용자 작업까지 날려 복구가 불가능해진다.
#   2. **실행 직전 HEAD sha 출력** — 복구 앵커. 중간 실패 시 stderr 로 복구 명령을 안내한다.
#
# 우회 플래그 `--allow-dirty` 를 둔다 (근거: `harness update` 는 릴리스 준비/충돌 해결
# 도중 반복 실행되는 경우가 있어 무조건 차단은 실용성을 해친다). 단 **기본값은 차단**이고,
# 우회 시 복구 불가 위험을 stderr 로 경고한다 — silent 약화가 아니라 명시적 opt-in.
#
# ## bash 3.2 호환 의무 (#894 reviewer 차단 실측)
#
# macOS 기본 `/bin/bash` 는 **3.2.57** 이고, bash 4.4 미만은 `set -u` 하에서 빈 배열의
# `"${arr[@]}"` 확장을 **unbound variable 로 처리해 즉사**한다. 본 스크립트에서 이 사고가
# 치명적인 이유는 크래시 지점이 **step 1(`harness update --apply-*`) 이 트리를 이미 변경한
# 뒤**라서다 — 남는 상태가 정확히 "apply 됐는데 위생 복원·재생성·가드 검증 미실행",
# 즉 **이 래퍼가 존재하는 이유 그 자체**다.
#
# 따라서 optional flag 는 배열로 모으지 않고 **명시적 분기**로 호출한다 (빈 확장 자체를
# 만들지 않는다). `--self-test` 의 정적 가드가 본 규약의 회귀를 차단한다.
# 참고: `${#arr[@]}` 와 비어있지 않은 배열의 확장은 3.2 에서도 안전하다.
#
# ## 사용
#
#   bash scripts/harness-update-safe.sh --check              # 비파괴 확인만 (기본)
#   bash scripts/harness-update-safe.sh --apply-all-safe     # 적용 + 후속 5단계
#   bash scripts/harness-update-safe.sh --apply-frozen       # (그 외 --apply-* 동일)
#   bash scripts/harness-update-safe.sh --apply-all-safe --dry-run-followup
#                                                            # 후속 단계를 dry-run 으로만 (진단)
#   bash scripts/harness-update-safe.sh --apply-all-safe --allow-dirty
#                                                            # clean tree 검사 우회 (복구 불가 위험)
#   bash scripts/harness-update-safe.sh --self-test          # 부작용 0 인라인 검증
#
# `--apply-* --dry-run` 조합은 CLI 가 시뮬레이션만 하므로 **후속 단계를 통째로 건너뛴다**
# (트리 미변경 = 위생 절차 불필요. 후속만 `--apply` 로 돌면 dry-run 계약 위반).
#
# `--interactive` 는 지원하지 않는다 — 대화형 입력은 래퍼의 원자성과 상충하며,
# 파일별 결정은 사람이 직접 `npx ... update --interactive` 로 수행한 뒤
# `.claude/commands/harness-update.md` §7-1 수동 절차를 따른다.
#
# ## 관련
#   - ADR docs/decisions/20260515-harness-managed-divergent-pattern.md §Amendment 17/18
#   - 절차 SSoT (수동 절차 참조용 보존): .claude/commands/harness-update.md §7-1
#   - 이슈: coseo12/astro-simulator#894

set -euo pipefail

UPSTREAM_PKG="github:coseo12/harness-setting"

# 전역 파싱 결과 — parse_args() 가 설정 (self-test 가 부작용 없이 재사용)
FOLLOWUP_APPLY=1     # 0 이면 후속 단계를 dry-run 으로만 수행 (진단 전용)
IS_APPLY=0           # 1 이면 트리 변경 발생 → 후속 위생 절차 의무
DRY_RUN_PASSTHROUGH=0
ALLOW_DIRTY=0
REJECT_REASON=''     # 비면 정상, 아니면 거부 사유
UPDATE_ARGS=()

# 인자 파싱 — **부작용 없음** (exit 하지 않는다. 호출자가 REJECT_REASON 을 보고 판단).
parse_args() {
  FOLLOWUP_APPLY=1
  IS_APPLY=0
  DRY_RUN_PASSTHROUGH=0
  ALLOW_DIRTY=0
  REJECT_REASON=''
  UPDATE_ARGS=()

  for arg in "$@"; do
    case "$arg" in
      --dry-run-followup)
        FOLLOWUP_APPLY=0
        ;;
      --allow-dirty)
        ALLOW_DIRTY=1
        ;;
      --interactive | -i)
        REJECT_REASON='interactive'
        return 0
        ;;
      --dry-run)
        DRY_RUN_PASSTHROUGH=1
        UPDATE_ARGS+=("$arg")
        ;;
      --apply-*)
        IS_APPLY=1
        UPDATE_ARGS+=("$arg")
        ;;
      *)
        UPDATE_ARGS+=("$arg")
        ;;
    esac
  done

  if [ ${#UPDATE_ARGS[@]} -eq 0 ]; then
    UPDATE_ARGS=(--check)
  fi

  # `--apply-* --dry-run` — CLI 는 **시뮬레이션만** 하므로 트리가 변하지 않는다.
  # 후속 단계를 `--apply` 로 돌리면 step 1 은 dry-run 인데 step 2~5 만 실제 write 하는
  # **dry-run 계약 위반**이 된다 (#894 reviewer 비차단 1). 트리 미변경 = 위생 절차 불필요.
  if [ "$DRY_RUN_PASSTHROUGH" -eq 1 ]; then
    IS_APPLY=0
  fi
}

step() {
  echo ""
  echo "──────────────────────────────────────────────────────────────"
  echo "▶ $1"
  echo "──────────────────────────────────────────────────────────────"
}

# 중간 실패 시 복구 경로 안내 (cross-validate agy 수용 1).
# EXIT trap 으로 걸어 어느 step 에서 죽든 앵커가 남게 한다.
PRE_SHA=''
on_failure() {
  local code=$?
  [ "$code" -eq 0 ] && return 0
  {
    echo ""
    echo "──────────────────────────────────────────────────────────────"
    echo "FAILED (exit $code) — 본 래퍼는 롤백하지 않는다."
    echo "  \`harness update --apply-*\` 가 트리를 이미 변경했을 수 있다."
    echo ""
    echo "복구 경로:"
    echo "  1. 변경 확인 :  git status --porcelain && git diff"
    echo "  2. 전체 되돌림:  git checkout . && git clean -fd    # 신규 파일까지 제거"
    if [ -n "$PRE_SHA" ]; then
      echo "  3. 커밋까지 되돌림: git reset --hard $PRE_SHA   # 실행 직전 HEAD"
    fi
    echo ""
    echo "  실패 원인 해소 후 재실행하거나 .claude/commands/harness-update.md §7-1"
    echo "  수동 절차로 나머지 단계를 이어서 수행한다."
    echo "──────────────────────────────────────────────────────────────"
  } >&2
}

# =============================================================================
# --self-test — 부작용 0 (npx / node / git write 미호출)
# =============================================================================
#
# CLAUDE.md §가드 도입 PR DoD 4축 §(2). #894 reviewer 차단이 "3중 시뮬에 그 경로가
# 없어서" 통과한 결함이므로, **모든 인자 조합의 분기 결정표**와 **bash 3.2 위험 패턴
# 정적 금지**를 여기서 고정한다.

SELF_TEST_PASS=0
SELF_TEST_FAIL=0

_expect() {
  # $1 = 이름, $2 = 조건 결과(0=pass), $3 = 상세
  if [ "$2" -eq 0 ]; then
    SELF_TEST_PASS=$((SELF_TEST_PASS + 1))
    echo "  PASS  $1"
  else
    SELF_TEST_FAIL=$((SELF_TEST_FAIL + 1))
    echo "  FAIL  $1${3:+ — $3}"
  fi
}

# 분기 결정표 1행: 인자 → IS_APPLY/FOLLOWUP/DRYPASS/DIRTY/REJECT/UPDATE_ARGS
_case() {
  local name="$1" expect="$2"
  shift 2
  parse_args "$@"
  # `${arr[*]:-}` — `:-` 기본값이 있어 빈 배열에서도 bash 3.2 안전 (거부 경로는 빈 배열)
  local got="${IS_APPLY}/${FOLLOWUP_APPLY}/${DRY_RUN_PASSTHROUGH}/${ALLOW_DIRTY}/${REJECT_REASON:-none}/${UPDATE_ARGS[*]:-}"
  if [ "$got" = "$expect" ]; then
    _expect "$name" 0
  else
    _expect "$name" 1 "기대=$expect 실제=$got"
  fi
}

run_self_test() {
  echo "=== harness-update-safe self-test (bash ${BASH_VERSION}) ==="

  # --- 정적 가드: bash 3.2 빈 배열 확장 위험 패턴 금지 (본 파일 자기 검사) ---
  #
  # `${VAR[@]}` / `${VAR[*]}` 는 VAR 이 빈 배열일 때 bash < 4.4 + set -u 에서 **즉사**한다.
  # 정규식은 그 두 형태만 잡고 안전 변형은 구조적으로 배제한다:
  #   `${#VAR[@]}`  — 이름 앞 `#` 이라 미매칭 (원소 수, 안전)
  #   `${VAR[*]:-}` — `]` 뒤 `:-` 라 미매칭 (기본값 제공, 안전)
  # 의도적으로 안전이 보장된 라인은 **`# bash32-safe:` 마커 + 근거**로 면제한다
  # (allowlist 를 변수명으로 하드코딩하면 다른 변수에 같은 사고가 재발한다).
  # 주석 라인(`^N:  #`)은 문법 설명이므로 제외.
  local hazards
  hazards=$(grep -nE '\$\{[A-Za-z_][A-Za-z0-9_]*\[[@*]\]\}' "$SELF_TEST_TARGET" \
    | grep -vE '^[0-9]+:[[:space:]]*#' \
    | grep -v 'bash32-safe' || true)
  if [ -z "$hazards" ]; then
    _expect "정적 가드: bash 3.2 빈 배열 확장 위험 패턴 0건" 0
  else
    _expect "정적 가드: bash 3.2 빈 배열 확장 위험 패턴 0건" 1 "$(echo "$hazards" | tr '\n' '|')"
  fi

  # 탐지기 자체가 작동하는지 (가드의 negative self-check — "항상 초록인 가드" 차단)
  local probe safe_probe
  probe=$(printf 'node x "${REPAIR_FLAG[@]}"\n' | grep -cE '\$\{[A-Za-z_][A-Za-z0-9_]*\[[@*]\]\}' || true) # bash32-safe: grep 입력 리터럴 (실행 아님)
  _expect "정적 가드 탐지기: 위험 패턴 샘플 검출" \
    "$([ "$probe" -eq 1 ] && echo 0 || echo 1)" "probe=$probe"
  safe_probe=$(printf 'n=${#A[@]}\nm=${A[*]:-}\n' | grep -cE '\$\{[A-Za-z_][A-Za-z0-9_]*\[[@*]\]\}' || true) # bash32-safe: grep 입력 리터럴
  _expect "정적 가드 탐지기: 안전 변형 오탐 0 (\${#A[@]} / \${A[*]:-})" \
    "$([ "$safe_probe" -eq 0 ] && echo 0 || echo 1)" "safe_probe=$safe_probe"

  # --- 런타임: 빈 확장이 실제 이 셸에서 죽는지 (차단 근거 재현) ---
  if /bin/bash -c 'set -euo pipefail; A=(); echo "${A[@]}"' >/dev/null 2>&1; then # bash32-safe: 하위 셸 리터럴 (의도적 크래시 재현)
    echo "  SKIP  런타임: 현재 /bin/bash 는 빈 배열 확장 허용 (>= 4.4) — 정적 가드가 주 방어"
  else
    _expect "런타임: /bin/bash 가 빈 배열 확장에서 즉사 (차단 근거 재현)" 0
  fi

  # --- 분기 결정표 (부작용 0) ---
  #      이름                                    IS_APPLY/FOLLOWUP/DRYPASS/DIRTY/REJECT/ARGS
  _case "인자 없음 → --check 기본값"              "0/1/0/0/none/--check"
  _case "--check → 비파괴"                        "0/1/0/0/none/--check"            --check
  _case "--apply-all-safe → 후속 절차 의무"       "1/1/0/0/none/--apply-all-safe"   --apply-all-safe
  _case "--apply-frozen → 동상"                   "1/1/0/0/none/--apply-frozen"     --apply-frozen
  _case "--interactive → 거부"                    "0/1/0/0/interactive/"            --interactive
  _case "-i → 거부"                               "0/1/0/0/interactive/"            -i
  # ↓ reviewer 차단 재현 경로 (종전 크래시 지점 — 빈 배열 확장)
  _case "--apply-all-safe --dry-run-followup → 후속 dry-run" \
    "1/0/0/0/none/--apply-all-safe"               --apply-all-safe --dry-run-followup
  _case "--dry-run-followup 단독 → apply 아님"    "0/0/0/0/none/--check"            --dry-run-followup
  # ↓ reviewer 비차단 1 재현 경로 (dry-run 계약 위반)
  _case "--apply-all-safe --dry-run → 후속 전체 스킵 (계약 준수)" \
    "0/1/1/0/none/--apply-all-safe --dry-run"     --apply-all-safe --dry-run
  _case "--dry-run 단독 → 후속 스킵"              "0/1/1/0/none/--dry-run"          --dry-run
  # ↓ cross-validate 수용 1 (clean tree 우회 플래그)
  _case "--allow-dirty → 우회 플래그 인식 + passthrough 제외" \
    "1/1/0/1/none/--apply-all-safe"               --apply-all-safe --allow-dirty
  _case "미지 인자 passthrough"                   "0/1/0/0/none/--bootstrap"        --bootstrap

  # --- clean tree 게이트 (cross-validate agy 수용 1) — 부작용 0, 판정 함수만 검증 ---
  _expect "clean tree: dirty 입력 → 차단 (ALLOW_DIRTY=0)" \
    "$(tree_gate_blocks ' M foo.ts' 0 && echo 0 || echo 1)"
  _expect "clean tree: dirty 입력 + --allow-dirty → 통과" \
    "$(tree_gate_blocks ' M foo.ts' 1 && echo 1 || echo 0)"
  _expect "clean tree: clean 입력 → 통과" \
    "$(tree_gate_blocks '' 0 && echo 1 || echo 0)"
  _expect "clean tree: untracked 도 dirty 로 판정 (apply 결과와 혼동 차단)" \
    "$(tree_gate_blocks '?? new.mjs' 0 && echo 0 || echo 1)"

  # --- 3중 시뮬레이션: positive → negative → recovery (분기 결정 자체) ---
  parse_args --apply-all-safe
  _expect "3중 positive: apply → IS_APPLY=1 (후속 절차 진입)" \
    "$([ "$IS_APPLY" -eq 1 ] && echo 0 || echo 1)"
  parse_args --apply-all-safe --dry-run
  _expect "3중 negative: apply+dry-run → IS_APPLY=0 (write 차단)" \
    "$([ "$IS_APPLY" -eq 0 ] && echo 0 || echo 1)"
  parse_args --apply-all-safe
  _expect "3중 recovery: dry-run 제거 → IS_APPLY=1 복귀" \
    "$([ "$IS_APPLY" -eq 1 ] && echo 0 || echo 1)"

  echo ""
  echo "총 $((SELF_TEST_PASS + SELF_TEST_FAIL)) — PASS ${SELF_TEST_PASS} / FAIL ${SELF_TEST_FAIL}"
  [ "$SELF_TEST_FAIL" -eq 0 ]
}

# clean tree 게이트 판정 (순수 함수 — git 미호출, self-test 주입 가능).
# $1 = `git status --porcelain` 출력, $2 = ALLOW_DIRTY (0/1)
# 반환 0 = 차단해야 함 / 1 = 통과
tree_gate_blocks() {
  local porcelain="$1" allow="$2"
  [ "$allow" -eq 1 ] && return 1
  [ -n "$porcelain" ] && return 0
  return 1
}

# =============================================================================
# main
# =============================================================================

SELF_TEST_TARGET="${BASH_SOURCE[0]}"

if [ "${1:-}" = "--self-test" ]; then
  run_self_test
  exit $?
fi

parse_args "$@"

if [ -n "$REJECT_REASON" ]; then
  {
    echo "ERROR: --interactive 는 본 래퍼에서 지원하지 않는다 (대화형 입력 ↔ 원자성 상충)."
    echo "       npx $UPSTREAM_PKG update --interactive 를 직접 실행한 뒤"
    echo "       .claude/commands/harness-update.md §7-1 수동 절차를 따른다."
  } >&2
  exit 2
fi

# --- 사전 게이트: clean working tree (cross-validate agy 수용 1) ---
# `--apply-*` 경로에서만 강제한다. 비파괴 실행(--check/--dry-run)은 트리를 건드리지
# 않으므로 dirty 여도 무해하며, 여기서 막으면 일상 확인이 불필요하게 차단된다.
if [ "$IS_APPLY" -eq 1 ]; then
  PORCELAIN="$(git status --porcelain 2>/dev/null || true)"
  if tree_gate_blocks "$PORCELAIN" "$ALLOW_DIRTY"; then
    {
      echo "ERROR: working tree 가 clean 하지 않다 — --apply-* 차단."
      echo ""
      echo "  사전 변경분과 \`harness update\` 결과가 섞이면 중간 실패 시"
      echo "  \`git checkout .\` 이 **사용자 작업까지 되돌려** 복구가 불가능해진다."
      echo "  (본 래퍼는 롤백하지 않는다 — 복구는 사람의 git 조작에 의존한다)"
      echo ""
      echo "  현재 변경:"
      echo "$PORCELAIN" | sed 's/^/    /'
      echo ""
      echo "  조치: 커밋 또는 stash 후 재실행"
      echo "    git stash -u && bash scripts/harness-update-safe.sh $*"
      echo "  우회(비권장): --allow-dirty"
    } >&2
    exit 2
  fi
  if [ "$ALLOW_DIRTY" -eq 1 ] && [ -n "$PORCELAIN" ]; then
    {
      echo "WARN: --allow-dirty — clean tree 검사를 우회한다."
      echo "      중간 실패 시 사전 변경분과 apply 결과가 섞여 복구가 어려울 수 있다."
    } >&2
  fi
fi

PRE_SHA="$(git rev-parse --short HEAD 2>/dev/null || true)"
trap on_failure EXIT

if [ "$IS_APPLY" -eq 1 ]; then
  echo "복구 앵커 — 실행 직전 HEAD: ${PRE_SHA:-(git 저장소 아님)}"
fi

# bash32-safe: parse_args() 가 빈 배열이면 `UPDATE_ARGS=(--check)` 기본값을 넣으므로
# 이 지점에서 UPDATE_ARGS 는 **항상 원소 ≥ 1** 이다 (거부 경로는 위에서 이미 exit).
step "1/6  harness update ${UPDATE_ARGS[*]}" # bash32-safe: 위 근거
npx --yes "$UPSTREAM_PKG" update "${UPDATE_ARGS[@]}" # bash32-safe: 위 근거

if [ "$IS_APPLY" -eq 0 ]; then
  echo ""
  if [ "$DRY_RUN_PASSTHROUGH" -eq 1 ]; then
    echo "[OK] --dry-run 시뮬레이션 — 트리 미변경이므로 후속 위생 절차를 건너뛴다."
    echo "     (후속만 --apply 로 돌리면 step 1 은 시뮬레이션인데 step 2~5 만 실제"
    echo "      write 하는 dry-run 계약 위반이 된다)"
  else
    echo "[OK] 비파괴 실행 — 후속 단계 불필요 (--apply-* 시에만 수행)."
  fi
  exit 0
fi

# --- 이하 --apply-* 이후 의무 절차 (Amendment 17 §결정 5) ---

if [ "$FOLLOWUP_APPLY" -eq 0 ]; then
  echo ""
  echo "WARN: --dry-run-followup — 후속 단계를 dry-run 으로만 수행한다."
  echo "      step 1 이 트리를 이미 변경했는데 위생 복원은 하지 않는 상태다."
  echo "      **이 상태를 커밋하지 말 것** — 진단 목적 전용."
fi

# reviewer R6 (#894): repair 는 **dry-run 선행**이 원칙이다. 자동 경로에서도 무엇이
# 바뀌는지 먼저 stdout 에 남겨 사후 감사가 가능하게 한다.
step "2/6  manifest 위생 복원 — dry-run (변경 예정 목록)"
node scripts/verify-harness-upstream-baseline.mjs --mode=repair

step "3/6  manifest 위생 복원 — 적용"
# 빈 배열 확장 금지 (bash 3.2) — optional flag 는 명시적 분기로 전달
if [ "$FOLLOWUP_APPLY" -eq 1 ]; then
  node scripts/verify-harness-upstream-baseline.mjs --mode=repair --apply
else
  echo "  (--dry-run-followup — 2/6 과 동일 판정, write 없음)"
fi

step "4/6  .harnessignore 재생성 + carry-over 정리"
node scripts/sync-harnessignore.mjs
if [ "$FOLLOWUP_APPLY" -eq 1 ]; then
  node scripts/sync-harnessignore.mjs --prune-manifest --apply
else
  node scripts/sync-harnessignore.mjs --prune-manifest
fi

step "5/6  .prettierignore 재생성"
node scripts/sync-prettierignore.mjs

step "6/6  가드 생존 검증 (하나라도 FAIL 이면 커밋 금지)"
node scripts/verify-harness-upstream-baseline.mjs
node scripts/verify-harness-drift-decorator.mjs
node scripts/verify-zombie-check.mjs
node scripts/verify-dead-wait-check.mjs
node scripts/sync-harnessignore.mjs --check
node scripts/sync-prettierignore.mjs --check

trap - EXIT

echo ""
echo "──────────────────────────────────────────────────────────────"
echo "[OK] harness update + 후속 5단계 완료 — 전 가드 PASS"
echo "──────────────────────────────────────────────────────────────"
echo ""
echo "다음 단계 (사람 판단):"
echo "  1. git diff 로 적용 내용 확인 (복구 앵커: ${PRE_SHA:-N/A})"
echo "  2. Z 패턴 Phase 3 정리:"
echo "       node scripts/verify-harness-drift-decorator.mjs --mode=sidecar-cleanup --apply"
echo "       node scripts/resolve-harness-drift-todo.mjs            # dry-run 확인 후 --apply"
echo "  3. 데코레이터 잔존 파일의 Phase 2 기여 여부 판단"
