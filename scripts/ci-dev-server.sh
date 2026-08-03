#!/usr/bin/env bash
# CI 용 next dev 서버 기동/정리 SSoT (#846).
#
# ## 배경 (전수 감사 2026-07-18)
#
# `ci.yml` 의 브라우저 회귀 가드가 저마다 아래 4행 세트를 포트만 3002~3013 으로 바꿔 복제했다.
#
#   pnpm --filter @astro-simulator/web exec next dev -p 30XX &
#   WEB_PID=$!
#   for i in {1..60}; do curl -sf .../ && break; sleep 2; done
#   ... ; GUARD_EXIT=$?; kill $WEB_PID || true; exit $GUARD_EXIT
#
# 결과 (1) PR 1건당 next dev cold-boot 이 가드 수만큼 발생, (2) `kill` 이 pnpm 래퍼만 종료해 next
# 자식 프로세스가 job 내내 누적, (3) readiness 루프가 타임아웃 후에도 단언 없이 폴스루.
# 본 스크립트로 기동/정리 블록을 추출하고 `ci.yml` 은 **1회만** 호출한다 (가드 전부 직렬 공용).
#
# ## readiness fail-fast 계약
#
# 기존 루프 10곳 중 8곳은 60회 폴링을 모두 소진해도 `exit 1` 단언이 없어, 서버가 뜨지 않은
# 경우에도 그대로 verify 로 진입해 "connection refused" 로 죽었다 — 실패 원인이 가드 회귀로
# 오도된다. 본 스크립트는 타임아웃 시 서버 로그를 덤프하고 `exit 1` 로 즉시 중단한다
# (CLAUDE.md §가드 설계 원칙 — drift 가드는 fail-fast 만, fallback 분기 금지).
#
# ### READY 판정은 `curl -sf` 가 아니라 **HTTP 200** 이다 (#885)
#
# `curl -sf` 는 3xx 에서 **exit 0** 을 낸다 (`-L` 없이 리다이렉트를 따라가지 않으므로 본문도
# 받지 않는다 — 로컬 실측: 308 응답에 `curl -sf … ; echo $?` → `0`). 즉 readiness 경로가
# 리다이렉트면 **페이지를 한 줄도 컴파일하지 않은 채 READY 로 통과**한다 (next dev 는 요청이
# 들어온 라우트만 on-demand 컴파일하므로, 리다이렉트 응답은 대상 라우트를 건드리지 않는다).
# 그래서 여기서는 상태 코드를 직접 읽어 **200 일 때만** READY 로 판정하고, 3xx 를 만나면
# 폴링을 계속하지 않고 즉시 exit 1 한다 (리다이렉트는 설정에서 오는 결정적 응답이라 기다려도
# 바뀌지 않는다 — 대기는 시간만 태우고 원인을 가린다).
#
# 현행 라우팅 (#908 로 i18n 제거 후) 은 `/` 가 실제 페이지(200)이고 `/ko` 가 308 → `/` 이다.
# 즉 ready-path 로 `/ko` 를 넘기면 위 공허 통과가 그대로 재현된다. 기본값 `/` 를 유지한다.
#
# ## stop 이 best-effort 인 이유 (fail-fast 계약의 적용 경계)
#
# 정리 실패는 "검증 판정" 이 아니다. stop 은 `if: always()` 스텝에서 호출되므로 여기서
# non-zero 를 내면 **원래 실패 원인을 덮어쓴다**. fail-fast 는 판정 경로(start readiness)에만
# 적용하고 정리 경로는 exit 0 을 보장한다. `status` 도 같은 이유로 항상 exit 0 이다.
#
# ## status — 공용 서버 SPOF 관측성 (#885)
#
# 서버를 1회만 띄워 가드 전부가 공용하므로, 서버가 중도 사망하면 **잔여 가드가 전부**
# `connection refused` 로 죽는다 (통합 전에는 1 가드만 영향). 이때 각 가드 step 의 로그만
# 보면 "가드 N개가 동시 회귀" 로 오도된다. `status` 는 정리 step (`if: always()`) 에서
# 호출돼 (a) PID 생존 · (b) next dev 프로세스 존재 · (c) HTTP 응답 3축을 찍고 서버 로그를
# tail 한다. 서버가 죽어 있으면 `::error::` annotation 을 남겨 run 요약 최상단에 노출한다
# (step 자체는 exit 0 — 원 실패 원인을 덮어쓰지 않는다).
#
# ## 사용
#
#   bash scripts/ci-dev-server.sh start  <port> <pid-file> [ready-path]
#   bash scripts/ci-dev-server.sh status <port> <pid-file>
#   bash scripts/ci-dev-server.sh stop   <port> <pid-file>
#
# 호출부: `.github/workflows/ci.yml` (브라우저 회귀 가드 전부 공용, 포트 3002) /
#         `.github/actions/setup-and-build/action.yml` (start-dev-server=true, 포트 3001)
#
# 가드 개수는 의도적으로 표기하지 않는다 (#935) — 가드 추가 PR 마다 이 파일 / `ci.yml` /
# docs 를 손으로 갱신해야 하고 누락해도 신호가 없어 실제로 2회 연속 drift 했다.
# 배선 이력이 필요하면 CHANGELOG (시점 기록 SSoT) 를 본다.

set -euo pipefail

# readiness 상한 — **벽시계 기준** 120s (#885).
#
# 구 구현은 `attempt <= 60` + `sleep 2` 의 **횟수 기반**이었고 주석/에러 메시지도 `60 × 2s
# = 120s` 로 표기했다. 그러나 개별 curl 이 `--max-time 10` 까지 잡아먹는 경우 (포트를 점유한
# 채 응답하지 않는 squatter) 실제 상한은 `60 × (10 + 2) = 720s = 12분` 이었다. 호출부
# `ci.yml` 의 `timeout-minutes: 4` 가 먼저 발화해 **스크립트의 로그 덤프가 실행되지 못하는**
# 경로가 생긴다 — 관측성이 가장 필요한 케이스에서 정확히 로그가 사라진다.
# 벽시계 마감으로 바꾸면 최악 상한이 `READY_TIMEOUT_SEC + 마지막 curl 1회 + 마지막 sleep 1회` 로
# 닫힌다 (기본 120 + 10 + 2 = 132s < 240s = timeout-minutes 4). 표기 = 실제 (#885 리뷰 권고 2 —
# 마지막 probe 가 deadline 직전 진입 시 sleep 1회를 더 소진하므로 POLL 을 산식에 포함).
READY_TIMEOUT_SEC="${CI_DEV_SERVER_READY_TIMEOUT_SEC:-120}"
READY_POLL_SEC="${CI_DEV_SERVER_POLL_SEC:-2}"
# 개별 curl 상한 — 포트를 점유했지만 응답하지 않는 프로세스(좀비/EADDRINUSE squatter)를 만나면
# curl 은 기본적으로 무기한 대기해 폴링 상한이 무의미해진다. 명시 상한으로 차단.
READY_CURL_MAX_TIME_SEC="${CI_DEV_SERVER_CURL_MAX_TIME_SEC:-10}"
# status 가 덤프할 서버 로그 tail 줄 수.
STATUS_LOG_TAIL_LINES="${CI_DEV_SERVER_LOG_TAIL_LINES:-40}"

# HTTP 상태 코드만 뽑는다. 연결 실패/타임아웃이면 curl 이 non-zero 로 끝나고 `000` 을 찍는다
# (`-o /dev/null -w '%{http_code}'`). `-f` 를 쓰지 않는 이유: 3xx/4xx 를 "실패" 로 뭉뚱그리지
# 않고 코드를 그대로 보기 위함 (#885 — 3xx 공허 통과 차단).
http_status() {
  local url="$1"
  curl -s -o /dev/null -w '%{http_code}' --max-time "${READY_CURL_MAX_TIME_SEC}" "${url}" 2> /dev/null || true
}

usage() {
  echo "usage: $0 start  <port> <pid-file> [ready-path]" >&2
  echo "       $0 status <port> <pid-file>" >&2
  echo "       $0 stop   <port> <pid-file>" >&2
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

  local deadline=$((SECONDS + READY_TIMEOUT_SEC))
  local attempt=0 status=""
  while ((SECONDS < deadline)); do
    attempt=$((attempt + 1))
    status="$(http_status "${ready_url}")"

    if [[ "${status}" == "200" ]]; then
      echo "[ci-dev-server] READY after ${SECONDS}s (${attempt} probes, HTTP ${status})"
      return 0
    fi

    # 3xx 는 기다린다고 200 이 되지 않는다 (설정 기반 결정적 응답). 즉시 중단해 원인을 드러낸다.
    if [[ "${status}" =~ ^3[0-9][0-9]$ ]]; then
      echo "::error::[ci-dev-server] readiness 경로가 리다이렉트다 — ${ready_url} → HTTP ${status}"
      echo "[ci-dev-server] 리다이렉트 응답은 대상 라우트를 컴파일하지 않으므로 READY 로 인정하지 않는다 (#885)."
      echo "[ci-dev-server] 현행 라우팅에서 실제 페이지는 '/' 다 ('/ko' 는 #908 이후 308 → '/')."
      dump_log "${log_file}"
      return 1
    fi

    sleep "${READY_POLL_SEC}"
  done

  echo "::error::[ci-dev-server] readiness 타임아웃 — ${ready_url} 가 ${READY_TIMEOUT_SEC}s 내 200 미응답 (마지막 HTTP ${status:-000}, ${attempt} probes)"
  dump_log "${log_file}"
  return 1
}

dump_log() {
  local log_file="$1"
  echo "--- ${log_file} ---"
  cat "${log_file}" 2> /dev/null || echo "[ci-dev-server] 로그 파일 없음: ${log_file}"
}

# 공용 서버 생존 여부 + 로그 tail (#885). 항상 exit 0 — `if: always()` 정리 step 에서
# 호출되므로 여기서 non-zero 를 내면 원래 실패 원인을 덮어쓴다.
status_server() {
  local port="$1" pid_file="$2"
  local log_file="/tmp/ci-dev-server-${port}.log"
  local pid="" pid_alive="no" proc="absent" verdict="DEAD"

  if [[ -f "${pid_file}" ]]; then
    pid="$(cat "${pid_file}" 2> /dev/null || true)"
    if [[ -n "${pid}" ]] && kill -0 "${pid}" 2> /dev/null; then
      pid_alive="yes"
    fi
  else
    pid="(pid 파일 부재: ${pid_file})"
  fi

  # bracket `[ ]` 은 pgrep 자기 명령행 self-match 방어 관용구 (docs/ops/operational-friction.md §3).
  if pgrep -f "next[ ]dev -p ${port}" > /dev/null 2>&1; then
    proc="present"
  fi

  # ready-path 인자를 받지 않고 루트 고정 — start 의 readiness 는 "페이지 컴파일 보증" 이 목적이라
  # 경로가 의미를 갖지만, status 는 "서버 프로세스가 HTTP 를 응답하는가" 만 판정하면 충분하다
  # (#885 리뷰 권고 4 — 동형화 대신 목적 차이를 계약으로 박제).
  local status
  status="$(http_status "http://localhost:${port}/")"
  [[ "${status}" == "200" ]] && verdict="ALIVE"

  echo "[ci-dev-server] status port=${port} verdict=${verdict}"
  echo "[ci-dev-server]   pid=${pid} alive=${pid_alive} / next-dev-process=${proc} / http=${status}"

  if [[ "${verdict}" != "ALIVE" ]]; then
    # 정리 시점에 서버가 죽어 있다 = 이 job 의 잔여 가드가 전부 connection refused 로
    # 오도 실패했을 가능성. run 요약 최상단에 노출한다 (step 은 계속 exit 0).
    echo "::error::[ci-dev-server] 공용 dev 서버 (:${port}) 가 살아있지 않다 (http=${status}, pid alive=${pid_alive}, process=${proc}) — 이 job 의 브라우저 가드 실패는 가드 회귀가 아니라 서버 사망이 원인일 수 있다 (#885 SPOF)."
  fi

  echo "::group::[ci-dev-server] ${log_file} (tail -${STATUS_LOG_TAIL_LINES})"
  tail -n "${STATUS_LOG_TAIL_LINES}" "${log_file}" 2> /dev/null || echo "[ci-dev-server] 로그 파일 없음: ${log_file}"
  echo "::endgroup::"

  return 0
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
    status)
      [[ $# -ge 3 ]] || usage
      # 관측 경로도 항상 성공 (#885) — 진단이 원래 실패 원인을 덮어쓰지 않도록.
      status_server "$2" "$3" || true
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
