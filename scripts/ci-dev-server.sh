#!/usr/bin/env bash
# CI 용 next dev 서버 기동/정리 SSoT (#846).
#
# ## 배경 (전수 감사 2026-07-18)
#
# `ci.yml` 의 브라우저 회귀 가드 10종이 아래 4행 세트를 포트만 3002~3013 으로 바꿔 복제했다.
#
#   pnpm --filter @astro-simulator/web exec next dev -p 30XX &
#   WEB_PID=$!
#   for i in {1..60}; do curl -sf .../ && break; sleep 2; done
#   ... ; GUARD_EXIT=$?; kill $WEB_PID || true; exit $GUARD_EXIT
#
# 결과 (1) PR 1건당 next dev cold-boot 이 10회 발생, (2) `kill` 이 pnpm 래퍼만 종료해 next
# 자식 프로세스가 job 내내 누적, (3) readiness 루프가 타임아웃 후에도 단언 없이 폴스루.
# 본 스크립트로 기동/정리 블록을 추출하고 `ci.yml` 은 **1회만** 호출한다 (가드 10종 직렬 공용).
#
# ## readiness fail-fast 계약
#
# 기존 루프 10곳 중 8곳은 60회 폴링을 모두 소진해도 `exit 1` 단언이 없어, 서버가 뜨지 않은
# 경우에도 그대로 verify 로 진입해 "connection refused" 로 죽었다 — 실패 원인이 가드 회귀로
# 오도된다. 본 스크립트는 타임아웃 시 서버 로그를 덤프하고 `exit 1` 로 즉시 중단한다
# (CLAUDE.md §가드 설계 원칙 — drift 가드는 fail-fast 만, fallback 분기 금지).
#
# ## stop 이 best-effort 인 이유 (fail-fast 계약의 적용 경계)
#
# 정리 실패는 "검증 판정" 이 아니다. stop 은 `if: always()` 스텝에서 호출되므로 여기서
# non-zero 를 내면 **원래 실패 원인을 덮어쓴다**. fail-fast 는 판정 경로(start readiness)에만
# 적용하고 정리 경로는 exit 0 을 보장한다.
#
# ## 사용
#
#   bash scripts/ci-dev-server.sh start <port> <pid-file> [ready-path]
#   bash scripts/ci-dev-server.sh stop  <port> <pid-file>
#
# 호출부: `.github/workflows/ci.yml` (가드 10종 공용, 포트 3002) /
#         `.github/actions/setup-and-build/action.yml` (start-dev-server=true, 포트 3001)

set -euo pipefail

# readiness 폴링 상한 — 60 × 2s = 120s (기존 ci.yml 루프 `{1..60}` + `sleep 2` 승계).
READY_MAX_ATTEMPTS="${CI_DEV_SERVER_READY_ATTEMPTS:-60}"
READY_POLL_SEC="${CI_DEV_SERVER_POLL_SEC:-2}"
# 개별 curl 상한 — 포트를 점유했지만 응답하지 않는 프로세스(좀비/EADDRINUSE squatter)를 만나면
# `curl -sf` 는 기본적으로 무기한 대기해 폴링 상한이 무의미해진다. 명시 상한으로 차단.
READY_CURL_MAX_TIME_SEC="${CI_DEV_SERVER_CURL_MAX_TIME_SEC:-10}"

usage() {
  echo "usage: $0 start <port> <pid-file> [ready-path]" >&2
  echo "       $0 stop  <port> <pid-file>" >&2
  exit 2
}

start_server() {
  local port="$1" pid_file="$2" ready_path="${3:-/}"
  local log_file="/tmp/ci-dev-server-${port}.log"
  local ready_url="http://localhost:${port}${ready_path}"

  pnpm --filter @astro-simulator/web exec next dev -p "${port}" > "${log_file}" 2>&1 &
  local server_pid=$!
  echo "${server_pid}" > "${pid_file}"
  echo "[ci-dev-server] start pid=${server_pid} port=${port} ready=${ready_url} log=${log_file}"

  local attempt
  for ((attempt = 1; attempt <= READY_MAX_ATTEMPTS; attempt++)); do
    if curl -sf --max-time "${READY_CURL_MAX_TIME_SEC}" "${ready_url}" > /dev/null; then
      echo "[ci-dev-server] READY after ${attempt}x${READY_POLL_SEC}s"
      return 0
    fi
    sleep "${READY_POLL_SEC}"
  done

  echo "::error::[ci-dev-server] readiness 타임아웃 — ${ready_url} 가 $((READY_MAX_ATTEMPTS * READY_POLL_SEC))s 내 미응답"
  echo "--- ${log_file} ---"
  cat "${log_file}" 2>/dev/null || true
  return 1
}

stop_server() {
  local port="$1" pid_file="$2"

  if [[ -f "${pid_file}" ]]; then
    local pid
    pid="$(cat "${pid_file}")"
    kill "${pid}" 2> /dev/null || true
    rm -f "${pid_file}"
    echo "[ci-dev-server] stop pid=${pid} port=${port}"
  else
    echo "[ci-dev-server] stop — pid 파일 부재 (${pid_file}), 포트 기준 정리만 수행"
  fi

  # `pnpm exec` 래퍼가 SIGTERM 을 next 자식에 전달하지 못하는 경우가 있어 포트 기준 2차 정리.
  # bracket `[ ]` 은 pkill 자기 명령행 self-match 방어 관용구 (docs/ops/operational-friction.md §3).
  pkill -f "next[ ]dev -p ${port}" 2> /dev/null || true

  return 0
}

main() {
  local action="${1:-}"
  case "${action}" in
    start)
      [[ $# -ge 3 ]] || usage
      start_server "$2" "$3" "${4:-/}"
      ;;
    stop)
      [[ $# -ge 3 ]] || usage
      # 정리 경로는 항상 성공 — `if: always()` 스텝이 원래 실패 원인을 덮어쓰지 않도록.
      stop_server "$2" "$3" || true
      ;;
    *)
      usage
      ;;
  esac
}

main "$@"
