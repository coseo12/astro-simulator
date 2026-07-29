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
# ## fail-fast (CLAUDE.md §가드 설계 원칙 — fallback 분기 금지)
#
# 어느 단계든 실패하면 즉시 중단한다. "일단 진행하고 나중에 고친다" 분기를 두지 않는다 —
# 그 분기가 바로 #893 의 실패 모드다. 중단 시 워킹트리는 그대로 남으므로
# `git diff` / `git checkout` 으로 사람이 판단한다.
#
# ## 사용
#
#   bash scripts/harness-update-safe.sh --check              # 비파괴 확인만 (기본)
#   bash scripts/harness-update-safe.sh --apply-all-safe     # 적용 + 후속 4단계
#   bash scripts/harness-update-safe.sh --apply-frozen       # (그 외 --apply-* 동일)
#   bash scripts/harness-update-safe.sh --dry-run-followup --apply-all-safe
#                                                            # 후속 단계를 dry-run 으로만
#
# `--interactive` 는 지원하지 않는다 — 대화형 입력은 래퍼의 원자성과 상충하며,
# 파일별 결정은 사람이 직접 `npx ... update --interactive` 로 수행한 뒤 본 스크립트를
# `--check` 없이 `--apply-frozen` 등으로 재실행하거나 §7 수동 절차를 따른다.
#
# ## 관련
#   - ADR docs/decisions/20260515-harness-managed-divergent-pattern.md §Amendment 17
#   - 절차 SSoT (수동 4단계 참조용 보존): .claude/commands/harness-update.md §7
#   - 이슈: coseo12/astro-simulator#894

set -euo pipefail

UPSTREAM_PKG="github:coseo12/harness-setting"
FOLLOWUP_APPLY=1
UPDATE_ARGS=()
IS_APPLY=0

for arg in "$@"; do
  case "$arg" in
    --dry-run-followup)
      FOLLOWUP_APPLY=0
      ;;
    --interactive | -i)
      echo "ERROR: --interactive 는 본 래퍼에서 지원하지 않는다 (대화형 입력 ↔ 원자성 상충)." >&2
      echo "       npx $UPSTREAM_PKG update --interactive 를 직접 실행한 뒤" >&2
      echo "       .claude/commands/harness-update.md §7 수동 4단계를 따른다." >&2
      exit 2
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

step() {
  echo ""
  echo "──────────────────────────────────────────────────────────────"
  echo "▶ $1"
  echo "──────────────────────────────────────────────────────────────"
}

step "1/6  harness update ${UPDATE_ARGS[*]}"
npx --yes "$UPSTREAM_PKG" update "${UPDATE_ARGS[@]}"

if [ "$IS_APPLY" -eq 0 ]; then
  echo ""
  echo "[OK] 비파괴 실행 — 후속 단계 불필요 (--apply-* 시에만 수행)."
  exit 0
fi

# --- 이하 --apply-* 이후 의무 절차 (Amendment 17 §결정 5) ---

if [ "$FOLLOWUP_APPLY" -eq 1 ]; then
  REPAIR_FLAG=(--apply)
  PRUNE_FLAG=(--apply)
else
  echo ""
  echo "WARN: --dry-run-followup — 후속 단계를 dry-run 으로만 수행한다."
  echo "      매니페스트가 오염된 상태로 남으므로 이 상태를 커밋하지 말 것."
  REPAIR_FLAG=()
  PRUNE_FLAG=()
fi

# reviewer R6 (#894): repair 는 **dry-run 선행**이 원칙이다. 자동 경로에서도 무엇이
# 바뀌는지 먼저 stdout 에 남겨 사후 감사가 가능하게 한다.
step "2/6  manifest 위생 복원 — dry-run (변경 예정 목록)"
node scripts/verify-harness-upstream-baseline.mjs --mode=repair

step "3/6  manifest 위생 복원 — 적용"
node scripts/verify-harness-upstream-baseline.mjs --mode=repair "${REPAIR_FLAG[@]}"

step "4/6  .harnessignore 재생성 + carry-over 정리"
node scripts/sync-harnessignore.mjs
node scripts/sync-harnessignore.mjs --prune-manifest "${PRUNE_FLAG[@]}"

step "5/6  .prettierignore 재생성"
node scripts/sync-prettierignore.mjs

step "6/6  가드 생존 검증 (하나라도 FAIL 이면 커밋 금지)"
node scripts/verify-harness-upstream-baseline.mjs
node scripts/verify-harness-drift-decorator.mjs
node scripts/verify-zombie-check.mjs
node scripts/verify-dead-wait-check.mjs
node scripts/sync-harnessignore.mjs --check
node scripts/sync-prettierignore.mjs --check

echo ""
echo "──────────────────────────────────────────────────────────────"
echo "[OK] harness update + 후속 5단계 완료 — 전 가드 PASS"
echo "──────────────────────────────────────────────────────────────"
echo ""
echo "다음 단계 (사람 판단):"
echo "  1. git diff 로 적용 내용 확인"
echo "  2. Z 패턴 Phase 3 정리:"
echo "       node scripts/verify-harness-drift-decorator.mjs --mode=sidecar-cleanup --apply"
echo "       node scripts/resolve-harness-drift-todo.mjs            # dry-run 확인 후 --apply"
echo "  3. 데코레이터 잔존 파일의 Phase 2 기여 여부 판단"
