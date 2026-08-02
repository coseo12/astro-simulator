#!/bin/bash
# scripts/cleanup-browser.sh — 브라우저 결정적 정리 (#926)
#
# 배경:
#   agent-browser 는 상주 daemon 이 Chrome 을 소유하는 구조라, `open` 이 hang/실패로
#   세션을 점유하면 후속 `close` 가 그 뒤에 줄을 서거나 함께 hang 한다 (정상 경로 무력).
#   실효 경로는 pkill 인데 그 판단이 에이전트 재량에 맡겨져 재발했다
#   (실측: 6세션/52좀비/800%+ CPU — volt #79 / 10일 묵은 daemon 2개 — 2026-08-02).
#   "사람(에이전트)이 기억하는 절차는 재발한다" → 스크립트 1회 호출로 결정화 (#894 래퍼 전례와 동형).
#
# 단계:
#   [1/5] `agent-browser close` 시도 (10s timeout — hang 대비. macOS 에 GNU timeout
#         부재 실측 → bash 내장 폴링 래퍼 run_with_timeout 로 대체. 미설치 시 스킵)
#   [2/5] Chrome 렌더러 정리: pkill -TERM -f "agent-browser-chrome[-]" → 2s → 잔존 -KILL
#         (bracket 패턴 — pgrep/pkill self-match 오탐 방지, #795)
#   [3/5] daemon 정리: agent-browser-darwin 계열 중 ETIME ≥ 30분만 TERM → 2s → 잔존 KILL.
#         임계 30분 + ETIME awk 파싱은 가드 C SSoT 정합
#         (.claude/hooks/session-start-zombie-check.sh 와 동일). 신선한 daemon
#         (동시 진행 중인 정당한 세션 소유 가능) 은 보존.
#   [4/5] 포트 3000 점유 — 검출·경고만 (LISTEN 만 — ESTABLISHED kill 사고 방지).
#         kill 은 --kill-port 명시 플래그 시에만 (dev 서버 오살 방지).
#   [5/5] 요약 출력 + 잔존 재검증 — 잔존 0 이면 exit 0, 잔존 있으면 exit 1 (fail-visible)
#
# 사용:
#   bash scripts/cleanup-browser.sh                # 표준 정리
#   bash scripts/cleanup-browser.sh --kill-port    # 포트 3000 LISTEN 점유도 TERM
#   bash scripts/cleanup-browser.sh --self-test    # mock 프로세스 격리 3중 시뮬
#                                                  # (selftest 접미사 — 실 프로세스 무접촉)
#
# 관련: 이슈 #926 / volt #79 (Chrome 좀비) / #795 (bracket 패턴) / incident #440 가드 C
#
# bash 3.2 호환 (macOS 기본): 배열 미사용 (set -u 빈 배열 "${arr[@]}" 즉사 클래스 — #894 R2 전례)
set -uo pipefail

# ── 상수 ────────────────────────────────────────────────────────────────
CLOSE_TIMEOUT_SECONDS=10           # agent-browser close hang 대비 상한
TERM_GRACE_SECONDS=2               # TERM → KILL escalation 대기
DAEMON_ETIME_THRESHOLD_MINUTES=30  # 가드 C SSoT (session-start-zombie-check.sh 와 동일 임계)
DEV_SERVER_PORT=3000
CHROME_PATTERN="agent-browser-chrome[-]"  # bracket — self-match 방지 (#795)
DAEMON_PATTERN="agent-browser-darwi[n]"   # 실 바이너리: agent-browser-darwin-<arch>

# kill 계열 함수의 결과 보고용 전역 (bash 3.2 — 배열/nameref 미사용)
LAST_KILLED=0
LAST_RESIDUAL=0
LAST_USED_KILL=0
PORT_STATE="skipped"

# ── 공용 함수 ───────────────────────────────────────────────────────────

# run_with_timeout <초> <명령...>
# macOS 에 GNU timeout/gtimeout 부재 (실측 2026-08-02) → 폴링 래퍼로 대체.
# timeout 시 TERM → 1s → KILL 후 124 반환 (GNU timeout 관례와 동일 코드).
run_with_timeout() {
  local limit="$1"
  shift
  "$@" &
  local cmd_pid=$!
  local waited=0
  while kill -0 "$cmd_pid" 2>/dev/null; do
    if [ "$waited" -ge "$limit" ]; then
      # bash job 종료 notice ("Terminated: 15") 는 셸 자체 stderr 로 출력됨 —
      # 에이전트 로그 박제 잡음 억제를 위해 kill~wait 구간만 stderr 임시 우회
      exec 3>&2 2>/dev/null
      kill -TERM "$cmd_pid" 2>/dev/null
      sleep 1
      kill -KILL "$cmd_pid" 2>/dev/null
      wait "$cmd_pid" 2>/dev/null
      exec 2>&3 3>&-
      return 124
    fi
    sleep 1
    waited=$((waited + 1))
  done
  wait "$cmd_pid" 2>/dev/null
  return $?
}

# count_procs <패턴> — 패턴 매칭 프로세스 수 (pgrep 은 자기 자신 자동 제외)
count_procs() {
  pgrep -f "$1" 2>/dev/null | wc -l | tr -d '[:space:]'
}

# kill_by_pattern <패턴> <라벨> — TERM → grace → 잔존 시 KILL escalation.
# 결과 전역 보고: LAST_KILLED / LAST_RESIDUAL / LAST_USED_KILL
kill_by_pattern() {
  local pattern="$1"
  local label="$2"
  LAST_KILLED=0
  LAST_RESIDUAL=0
  LAST_USED_KILL=0
  local before
  before=$(count_procs "$pattern")
  if [ "$before" -eq 0 ]; then
    echo "  ${label}: 대상 없음 (no-op)"
    return 0
  fi
  echo "  ${label}: ${before}개 발견 → TERM"
  pkill -TERM -f "$pattern" 2>/dev/null
  sleep "$TERM_GRACE_SECONDS"
  local remaining
  remaining=$(count_procs "$pattern")
  if [ "$remaining" -gt 0 ]; then
    echo "  ${label}: TERM 후 ${remaining}개 잔존 → KILL escalation"
    LAST_USED_KILL=1
    pkill -KILL -f "$pattern" 2>/dev/null
    sleep 1
  fi
  LAST_RESIDUAL=$(count_procs "$pattern")
  LAST_KILLED=$((before - LAST_RESIDUAL))
  echo "  ${label}: 정리 ${LAST_KILLED}개 / 잔존 ${LAST_RESIDUAL}개"
  return 0
}

# list_stale_pids <패턴> <임계분> — ETIME ≥ 임계분 프로세스 PID 목록 (개행 구분).
# ETIME awk 파싱은 가드 C (.claude/hooks/session-start-zombie-check.sh) 와 정합 (SSoT).
list_stale_pids() {
  local pattern="$1"
  local threshold="$2"
  ps -axww -o pid=,etime=,command= 2>/dev/null \
    | grep -E "$pattern" \
    | grep -v "cleanup-browser" \
    | awk -v threshold="$threshold" '
      {
        # ETIME 형식 파싱: [[dd-]hh:]mm:ss
        etime = $2
        n = split(etime, parts, /[-:]/)
        if (n == 2)      { mins = parts[1] + parts[2]/60 }
        else if (n == 3) { mins = parts[1]*60 + parts[2] + parts[3]/60 }
        else if (n == 4) { mins = parts[1]*1440 + parts[2]*60 + parts[3] + parts[4]/60 }
        else             { mins = 0 }
        if (mins >= threshold) { print $1 }
      }
    '
}

# cleanup_stale_daemons <패턴> <임계분> — ETIME 임계 이상 daemon 만 TERM → grace → 잔존 KILL.
# 결과 전역 보고: LAST_KILLED / LAST_RESIDUAL / LAST_USED_KILL
cleanup_stale_daemons() {
  local pattern="$1"
  local threshold="$2"
  LAST_KILLED=0
  LAST_RESIDUAL=0
  LAST_USED_KILL=0
  local stale_pids
  stale_pids=$(list_stale_pids "$pattern" "$threshold")
  if [ -z "$stale_pids" ]; then
    echo "  daemon: ETIME ≥ ${threshold}분 대상 없음 (no-op — 신선한 daemon 보존)"
    return 0
  fi
  local before=0
  local pid
  for pid in $stale_pids; do
    before=$((before + 1))
    echo "  daemon: PID ${pid} (ETIME ≥ ${threshold}분) → TERM"
    kill -TERM "$pid" 2>/dev/null
  done
  sleep "$TERM_GRACE_SECONDS"
  for pid in $stale_pids; do
    if kill -0 "$pid" 2>/dev/null; then
      echo "  daemon: PID ${pid} TERM 후 잔존 → KILL escalation"
      LAST_USED_KILL=1
      kill -KILL "$pid" 2>/dev/null
    fi
  done
  if [ "$LAST_USED_KILL" -eq 1 ]; then
    sleep 1
  fi
  local residual=0
  for pid in $stale_pids; do
    if kill -0 "$pid" 2>/dev/null; then
      residual=$((residual + 1))
    fi
  done
  LAST_RESIDUAL=$residual
  LAST_KILLED=$((before - residual))
  echo "  daemon: 정리 ${LAST_KILLED}개 / 잔존 ${LAST_RESIDUAL}개"
  return 0
}

# check_port <포트> <kill여부 0|1> — LISTEN 점유 검출·경고. kill 은 명시 플래그 시에만.
check_port() {
  local port="$1"
  local do_kill="$2"
  local pids
  local pid
  pids=$(lsof -t -i :"$port" -sTCP:LISTEN 2>/dev/null | tr '\n' ' ')
  if [ -z "${pids// /}" ]; then
    PORT_STATE="free"
    echo "  포트 ${port}: 점유 없음"
    return 0
  fi
  echo "  포트 ${port} LISTEN 점유 감지:"
  for pid in $pids; do
    ps -p "$pid" -o pid=,etime=,command= 2>/dev/null | sed 's/^/    /'
  done
  if [ "$do_kill" = "1" ]; then
    echo "  --kill-port 지정 — TERM 전송"
    for pid in $pids; do
      kill -TERM "$pid" 2>/dev/null
    done
    PORT_STATE="killed"
  else
    PORT_STATE="occupied-warn"
    echo "  경고만 — dev 서버 오살 방지. 정리가 필요하면 --kill-port 명시 (또는 수동 kill)"
  fi
  return 0
}

# ── self-test (mock 격리 3중 시뮬: positive → negative → recovery) ──────

SELF_TEST_FAILURES=0

# assert_eq <설명> <기대> <실제>
assert_eq() {
  if [ "$2" = "$3" ]; then
    echo "  PASS: $1 (기대=$2, 실제=$3)"
  else
    echo "  FAIL: $1 (기대=$2, 실제=$3)"
    SELF_TEST_FAILURES=$((SELF_TEST_FAILURES + 1))
  fi
}

# spawn_mock <argv0-이름> — self-test 전용 mock (exec -a 로 argv[0] 치환, macOS 실측 검증).
# 서브셸 이중 fork 로 분리 spawn — 본 스크립트의 자식이 아니게 하여 zombie(미회수) 상태가
# kill -0 잔존 검사를 오염하는 것을 방지.
spawn_mock() {
  ( bash -c 'exec -a "$0" sleep 300' "$1" >/dev/null 2>&1 & )
  sleep 1 # ps 등록 대기
}

# spawn_term_immune_mock <이름> — TERM 무시 mock (recovery 단계 — KILL escalation 검증).
# 이름은 bash -c 의 $0 위치로 전달되어 cmdline 에 노출 → pgrep -f 매칭.
spawn_term_immune_mock() {
  ( bash -c 'trap "" TERM; while :; do sleep 1; done' "$1" >/dev/null 2>&1 & )
  sleep 1
}

run_self_test() {
  local suffix="selftest-$$"
  local chrome_pattern="agent-browser-chrome-${suffix}[-]"
  local daemon_pattern="agent-browser-darwin-${suffix}[-]"

  # 오살 방지 하드 가드 — self-test 패턴에 'selftest' 미포함이면 즉시 중단.
  # 실 프로세스 (agent-browser-chrome-<UUID> / agent-browser-darwin-<arch>) 는
  # 'selftest' 문자열을 포함하지 않으므로 매칭 자체가 불가능하다.
  case "${chrome_pattern}+${daemon_pattern}" in
    *selftest*) : ;;
    *)
      echo "FATAL: self-test 패턴 격리 실패 — 실 프로세스 오살 방지 중단"
      exit 99
      ;;
  esac

  # 비정상 종료 시에도 mock 잔존 방지 (suffix 에 \$\$ 포함 — 실 프로세스 매칭 불가)
  trap 'pkill -KILL -f "agent-browser-.*-${suffix}" 2>/dev/null; true' EXIT

  echo "=== cleanup-browser --self-test (suffix: ${suffix}) ==="
  echo "[격리] mock 패턴은 '${suffix}' 접미사 — 실 agent-browser 프로세스와 매칭 불가"

  echo ""
  echo "--- Phase 0: run_with_timeout 래퍼 ---"
  local rc=0
  run_with_timeout 5 true || rc=$?
  assert_eq "정상 종료 명령 rc" 0 "$rc"
  rc=0
  run_with_timeout 1 sleep 30 || rc=$?
  assert_eq "hang 명령 timeout rc (GNU timeout 관례)" 124 "$rc"

  echo ""
  echo "--- Phase 1: positive (mock 정리) ---"
  spawn_mock "agent-browser-chrome-${suffix}-c1"
  spawn_mock "agent-browser-chrome-${suffix}-c2"
  spawn_mock "agent-browser-darwin-${suffix}-d1"
  assert_eq "chrome mock 2개 spawn" 2 "$(count_procs "$chrome_pattern")"
  assert_eq "daemon mock 1개 spawn" 1 "$(count_procs "$daemon_pattern")"

  kill_by_pattern "$chrome_pattern" "chrome(mock)"
  assert_eq "positive: chrome mock 정리 건수" 2 "$LAST_KILLED"
  assert_eq "positive: chrome mock 잔존 0" 0 "$LAST_RESIDUAL"
  assert_eq "positive: TERM 만으로 정리 (KILL 불사용)" 0 "$LAST_USED_KILL"

  # ETIME 임계 게이트 — 신선한 daemon 은 기본 임계 (30분) 에서 보존되어야 한다
  # (실 환경에서 동시 진행 중인 정당한 세션의 daemon 오살 방지 증거)
  cleanup_stale_daemons "$daemon_pattern" "$DAEMON_ETIME_THRESHOLD_MINUTES"
  assert_eq "임계 게이트: 신선 daemon 보존 (정리 0)" 0 "$LAST_KILLED"
  assert_eq "임계 게이트: daemon 생존 확인" 1 "$(count_procs "$daemon_pattern")"

  # 임계 0분 → 즉시 stale 취급되어 정리 (ETIME 파싱 경로 검증)
  cleanup_stale_daemons "$daemon_pattern" 0
  assert_eq "positive: stale daemon 정리 건수" 1 "$LAST_KILLED"
  assert_eq "positive: daemon 잔존 0" 0 "$LAST_RESIDUAL"

  echo ""
  echo "--- Phase 2: negative (무잔존 no-op) ---"
  assert_eq "negative 전제: chrome 대상 0" 0 "$(count_procs "$chrome_pattern")"
  kill_by_pattern "$chrome_pattern" "chrome(mock)"
  assert_eq "negative: no-op 정리 0" 0 "$LAST_KILLED"
  assert_eq "negative: no-op 잔존 0" 0 "$LAST_RESIDUAL"
  cleanup_stale_daemons "$daemon_pattern" 0
  assert_eq "negative: daemon no-op 정리 0" 0 "$LAST_KILLED"

  echo ""
  echo "--- Phase 3: recovery (TERM-immune → KILL escalation) ---"
  spawn_term_immune_mock "agent-browser-chrome-${suffix}-r1"
  assert_eq "recovery: TERM-immune mock spawn" 1 "$(count_procs "$chrome_pattern")"
  kill_by_pattern "$chrome_pattern" "chrome(TERM-immune mock)"
  assert_eq "recovery: KILL escalation 발동" 1 "$LAST_USED_KILL"
  assert_eq "recovery: 정리 건수" 1 "$LAST_KILLED"
  assert_eq "recovery: 잔존 0" 0 "$LAST_RESIDUAL"

  echo ""
  assert_eq "종료: mock 전체 잔존 0" 0 "$(count_procs "agent-browser-.*-${suffix}")"

  echo ""
  if [ "$SELF_TEST_FAILURES" -eq 0 ]; then
    echo "=== self-test PASS (assertion 실패 0) ==="
    exit 0
  else
    echo "=== self-test FAIL (assertion 실패 ${SELF_TEST_FAILURES}건) ==="
    exit 1
  fi
}

# ── main ────────────────────────────────────────────────────────────────

main() {
  echo "=== cleanup-browser (#926) ==="

  local close_result="skipped"
  echo "[1/5] agent-browser close (timeout ${CLOSE_TIMEOUT_SECONDS}s)"
  if command -v agent-browser >/dev/null 2>&1; then
    local rc=0
    run_with_timeout "$CLOSE_TIMEOUT_SECONDS" agent-browser close || rc=$?
    if [ "$rc" -eq 0 ]; then
      close_result="ok"
      sleep 1 # Chrome teardown 정착 대기
    elif [ "$rc" -eq 124 ]; then
      close_result="timeout"
      echo "  close 가 ${CLOSE_TIMEOUT_SECONDS}s 내 미완 — hang 세션 의심, pkill 경로로 진행"
    else
      close_result="fail(rc=${rc})"
      echo "  close 실패 (rc=${rc}) — pkill 경로로 진행"
    fi
  else
    echo "  agent-browser 미설치 — 스킵 (pkill 경로만 수행)"
  fi

  echo "[2/5] Chrome 렌더러 정리 (패턴: ${CHROME_PATTERN})"
  kill_by_pattern "$CHROME_PATTERN" "chrome"
  local chrome_killed=$LAST_KILLED
  local chrome_residual=$LAST_RESIDUAL

  echo "[3/5] daemon 정리 (패턴: ${DAEMON_PATTERN}, ETIME ≥ ${DAEMON_ETIME_THRESHOLD_MINUTES}분 — 신선한 daemon 보존)"
  cleanup_stale_daemons "$DAEMON_PATTERN" "$DAEMON_ETIME_THRESHOLD_MINUTES"
  local daemon_killed=$LAST_KILLED
  local daemon_residual=$LAST_RESIDUAL

  echo "[4/5] 포트 ${DEV_SERVER_PORT} 점검 (검출·경고만 — kill 은 --kill-port 시에만)"
  check_port "$DEV_SERVER_PORT" "$KILL_PORT"

  local residual=$((chrome_residual + daemon_residual))
  echo "[5/5] 요약"
  echo "[cleanup-browser] 요약: close=${close_result} chrome_killed=${chrome_killed} daemon_stale_killed=${daemon_killed} port_${DEV_SERVER_PORT}=${PORT_STATE} 잔존=${residual}"
  if [ "$residual" -eq 0 ]; then
    exit 0
  fi
  echo "[cleanup-browser] 잔존 ${residual}개 — 수동 확인 필요: ps -axww | grep -E 'agent-browse[r]'"
  exit 1
}

# ── 인자 파싱 ───────────────────────────────────────────────────────────

KILL_PORT=0
SELF_TEST=0

usage() {
  cat <<'EOF'
사용: bash scripts/cleanup-browser.sh [--kill-port] [--self-test]
  (기본)       agent-browser close(10s timeout) → Chrome pkill TERM→KILL
               → stale daemon (ETIME ≥ 30분) 정리 → 포트 3000 검출·경고
               → 요약 출력 (잔존 0 이면 exit 0, 잔존 시 exit 1)
  --kill-port  포트 3000 LISTEN 점유 프로세스도 TERM (기본은 검출·경고만)
  --self-test  mock 프로세스 격리 3중 시뮬 (positive → negative → recovery)
               실 agent-browser 프로세스 무접촉 (selftest 접미사 패턴)
EOF
}

for arg in ${1+"$@"}; do
  case "$arg" in
    --kill-port) KILL_PORT=1 ;;
    --self-test) SELF_TEST=1 ;;
    -h | --help)
      usage
      exit 0
      ;;
    *)
      echo "알 수 없는 인자: $arg"
      usage
      exit 2
      ;;
  esac
done

if [ "$SELF_TEST" -eq 1 ]; then
  run_self_test # 내부에서 exit
fi

main
