#!/usr/bin/env bash
#
# verify-core-exports-immutable.sh
#
# #402 라운드 2 — turbopack `__dirname` SSR 회귀 가드 (자동화 hook).
#
# ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §Amendment 결정 D2.
#
# 검증:
#   `packages/core/package.json` 의 exports field 에 WASM 의존 도메인
#   (scene / physics / render / gpu) sub-path 추가 금지.
#
#   라운드 1 회귀 메커니즘:
#     wasm-pack `--target nodejs` 출력의 `${__dirname}/physics_wasm_bg.wasm` 가
#     turbopack module dep graph 변경 시 `/ROOT/...` 가상 path 로 ENOENT → SSR 500.
#
# 허용 entry (SSoT — 라운드 2 머지 시점 기준):
#   . / ./coords / ./physics / ./scene / ./gpu / ./ephemeris
#
# WASM 도메인 sub-path 의 새 entry 가 추가되면 exit 1.
# coords / ephemeris / time 등 순수 데이터 도메인은 영향 없음 (Gemini cross-validate Q3 권고).
#
# 의존: jq (스크립트 환경 표준).
#
# 사용법:
#   bash scripts/verify-core-exports-immutable.sh
#   (CI 통합: detect-and-test step 또는 pnpm run verify:core-exports)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT_DIR="$(cd "$SCRIPT_DIR/.." && pwd)"
PKG_JSON="$ROOT_DIR/packages/core/package.json"

if [ ! -f "$PKG_JSON" ]; then
  echo "ERROR: $PKG_JSON 미존재" >&2
  exit 1
fi

if ! command -v jq >/dev/null 2>&1; then
  echo "ERROR: jq 미설치 — 본 스크립트는 jq 필수" >&2
  exit 1
fi

# 허용 entry 화이트리스트 (라운드 2 시점 SSoT).
# 새 entry 추가는 본 스크립트 갱신 + ADR Amendment 동시 박제 의무.
ALLOWED_ENTRIES=(
  "."
  "./coords"
  "./physics"
  "./scene"
  "./gpu"
  "./ephemeris"
)

# 현재 entry 추출 (key 만).
CURRENT_ENTRIES=$(jq -r '.exports | keys[]' "$PKG_JSON")

violations=()

while IFS= read -r entry; do
  if [ -z "$entry" ]; then
    continue
  fi

  # 화이트리스트 통과?
  match=0
  for allowed in "${ALLOWED_ENTRIES[@]}"; do
    if [ "$entry" = "$allowed" ]; then
      match=1
      break
    fi
  done

  if [ "$match" -eq 0 ]; then
    # WASM 도메인 sub-path 인지 검사 — scene / physics / render / gpu 의 sub-path.
    case "$entry" in
      ./scene/*|./physics/*|./render/*|./gpu/*)
        violations+=("$entry (WASM 의존 도메인 sub-path 추가 금지)")
        ;;
      *)
        # 그 외 entry 도 허용 화이트리스트 외이면 경고 (단, 비-WASM 도메인은 ADR 갱신 후 허용 가능).
        echo "WARN: 화이트리스트 외 entry — $entry (비-WASM 도메인이면 ADR 갱신 후 화이트리스트 추가)" >&2
        ;;
    esac
  fi
done <<< "$CURRENT_ENTRIES"

if [ "${#violations[@]}" -gt 0 ]; then
  echo "" >&2
  echo "FAIL: packages/core/package.json exports field 에 WASM 도메인 sub-path 위반:" >&2
  for v in "${violations[@]}"; do
    echo "  - $v" >&2
  done
  echo "" >&2
  echo "근거: ADR docs/decisions/20260504-r-phase-allowlist-guard.md §Amendment 결정 D1" >&2
  echo "      turbopack \\\${__dirname} SSR 500 회귀 (라운드 1 PR #407 closed)" >&2
  echo "" >&2
  echo "해결책 (ADR §Amendment 2026-05-04 §결정 D1 라운드 2 정정):" >&2
  echo "  1. sub-path entry 제거" >&2
  echo "  2. SSoT 는 \\\`packages/core/src/<도메인>/<파일>.ts\\\` 에 박제 + \\\`packages/core/src/index.ts\\\` 에 named export 직접 박제" >&2
  echo "     (예: \\\`export { isRPhaseFocusable, R_PHASE_BODY_ALLOWLIST } from './scene/r-phase-allowlist.js'\\\`)" >&2
  echo "  3. \\\`packages/core/src/<도메인>/index.ts\\\` 에서는 의도적으로 re-export 회피 (turbopack chain evaluation 차단)" >&2
  echo "  4. apps/web 에서 named import 직접 사용 (namespace 경유 금지)" >&2
  echo "     (예: \\\`import { isRPhaseFocusable } from '@astro-simulator/core'\\\`)" >&2
  echo "  사유: namespace 경유 (\\\`import { scene as sceneApi } from ...\\\`) 도 turbopack 이 \\\`scene/index.ts\\\` re-export chain 을 평가 → solar-system-scene → nbody-engine → physics_wasm.js \\\${__dirname} ENOENT 로 SSR 500 재발현 (PR #414 실측)" >&2
  exit 1
fi

echo "PASS: packages/core/package.json exports field WASM 도메인 sub-path 추가 0건"
echo "      현재 entry: $CURRENT_ENTRIES" | tr '\n' ' '
echo ""
exit 0
