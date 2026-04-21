#!/usr/bin/env bash
# verify-release-version-bump.sh
# CHANGELOG.md 의 최신 `## [X.Y.Z]` 엔트리 버전과 package.json 의 version 필드가 일치하는지 검증.
# chore(release) PR 에서 CHANGELOG 는 업데이트했으나 package.json version bump 를 누락하는 회귀를 구조적으로 차단.
#
# 호출 예:
#   ./scripts/verify-release-version-bump.sh
#     → 일치: exit 0, "✅ release version bump 정합 (package.json X.Y.Z == CHANGELOG X.Y.Z)"
#     → 불일치: exit 1, 두 버전 + 수정 안내 stderr 출력
#
# 관련 이슈: 세션 3연속 릴리스 (v2.26.0~v2.28.0) 에서 package.json bump 누락 관찰 → v2.28.1 복구 PR 과 함께 도입
# 참고: CLAUDE.md `### 릴리스` 섹션 + 과거 릴리스 (v2.22.1~v2.25.0) 에서 실제로 bump 되던 암묵 관례를 검증으로 승격

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

PKG_JSON="${PROJECT_DIR}/package.json"
CHANGELOG="${PROJECT_DIR}/CHANGELOG.md"

# package.json 이 없는 다운스트림 프로젝트는 본 가드 대상 외 (CI step 의 hashFiles 조건으로 별도 보호)
if [ ! -f "${PKG_JSON}" ]; then
  echo "ℹ️  package.json 부재 — 본 가드 대상 아님 (skip)"
  exit 0
fi

# CHANGELOG 가 없으면 스킵 (일부 다운스트림은 CHANGELOG 없음)
if [ ! -f "${CHANGELOG}" ]; then
  echo "ℹ️  CHANGELOG.md 부재 — 본 가드 대상 아님 (skip)"
  exit 0
fi

# package.json 의 version 추출 — jq 가 있으면 jq, 없으면 node one-liner
if command -v jq >/dev/null 2>&1; then
  pkg_version=$(jq -r '.version' "${PKG_JSON}")
else
  pkg_version=$(node -e "console.log(require('${PKG_JSON}').version)")
fi

# CHANGELOG 의 첫 `## [X.Y.Z]` 패턴 추출 — 버전 라인의 첫 출현
# Keep a Changelog 포맷: `## [2.28.1] — 2026-04-20` 또는 `## [Unreleased]` 가능
# Unreleased 는 릴리스 전 상태이므로 스킵하고 다음 버전을 찾음
changelog_version=$(grep -oE '^## \[[0-9]+\.[0-9]+\.[0-9]+\]' "${CHANGELOG}" | head -1 | sed -E 's/^## \[([0-9]+\.[0-9]+\.[0-9]+)\]$/\1/')

if [ -z "${changelog_version}" ]; then
  echo "ℹ️  CHANGELOG.md 에 `## [X.Y.Z]` 형식의 버전 엔트리 없음 — 본 가드 대상 아님 (skip)"
  exit 0
fi

if [ "${pkg_version}" = "${changelog_version}" ]; then
  echo "✅ release version bump 정합 (package.json ${pkg_version} == CHANGELOG ${changelog_version})"
  exit 0
fi

# 불일치 — 상세 보고 + 수정 안내
cat <<EOF >&2
❌ release version bump 불일치:
    package.json::version  = ${pkg_version}
    CHANGELOG.md 최신 엔트리 = ${changelog_version}

chore(release) PR 에서 CHANGELOG 를 업데이트할 때는 package.json::version 도 동일 버전으로 bump 해야 한다.

수정 방법 (둘 중 하나):
  A) CHANGELOG 의 최신 버전이 맞다면: package.json 의 version 을 ${changelog_version} 로 변경
     jq '.version = "${changelog_version}"' package.json > package.json.tmp && mv package.json.tmp package.json

  B) package.json 의 버전이 맞다면: CHANGELOG 에 ${pkg_version} 엔트리를 추가하거나 최신 엔트리 버전을 수정

참고: CLAUDE.md `### 릴리스` 섹션
EOF
exit 1
