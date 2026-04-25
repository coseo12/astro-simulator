#!/usr/bin/env bash
# verify-claudemd-size.sh
# CLAUDE.md 의 char 수를 측정하여 "각인 예산" 게이트를 강제한다.
#
# 본 스크립트는 #203 에서 Node 포트 (`lib/verify-claudemd-size.js`) 로 이동했고,
# 호환성 유지를 위해 thin wrapper 로 잔존. shell 호출 인터페이스 + 환경변수 override 는 동일.
#
# 포트 근거 (#203):
#   - `LC_ALL=en_US.UTF-8 wc -m` 가 self-hosted runner 에서 locale 미설치 시 POSIX 로 폴백 →
#     바이트 수 (62% 부풀림, 실측: 70,500 vs 43,305) 로 오탐 발생
#   - JS 의 `[...str].length` 는 locale 영향 없이 Unicode code point 단위 측정
#   - 임계값 SSoT 추출 (lib/claudemd-size-constants.js) — shell / doctor.js / 가이드 문서
#     3곳 drift 위험 제거
#
# 3단 게이트:
#   - 35k 미만    : pass (조용)
#   - 35k ~ 40k   : 경계 경보 (stdout, exit 0)
#   - 40k ~ 45k   : PR warn (exit 0)
#   - 45k 이상    : fail (stderr, exit 1)
#
# 환경변수 override (Node 구현이 그대로 인식):
#   CLAUDEMD_FILE                     : 검사 대상 파일 (기본 PROJECT_ROOT/CLAUDE.md)
#   CLAUDEMD_SIZE_LIMIT_WARN_BOUNDARY : 경계 경보 임계 (기본 35000)
#   CLAUDEMD_SIZE_LIMIT_WARN_PR       : PR warn 임계 (기본 40000)
#   CLAUDEMD_SIZE_LIMIT_FAIL          : fail 임계 (기본 45000)

set -euo pipefail

SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
PROJECT_DIR="$(cd "${SCRIPT_DIR}/.." && pwd)"

exec node "${PROJECT_DIR}/lib/verify-claudemd-size.js" "$@"
