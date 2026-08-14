#!/bin/bash
# 세션 시작 시점 dev 서버 / cargo / pnpm 좀비 검출 (incident #440 가드 C)
#
# 동작:
#   - ETIME 30분 이상 next dev / next-server / cargo (next)test / pnpm dev 프로세스 식별
#     (`dev` `test` 는 **공백 구분 토큰**으로만 매칭 — 아래 PATTERN 주석, #1066)
#   - 발견 시 stdout 에 경고 메시지 + PID/ETIME/command 출력 → Claude 가 사용자에게 보고
#   - exit 0 (세션 블록 안 함, 경고만)
#
# 근거:
#   - CLAUDE.md `## 프로젝트 고유 보강 교훈` `### sub-agent 이탈의 프로세스 레벨 확장`
#   - docs/reports/20260510-419-dev-server-zombie-recurrence.md
#   - 이전 세션 좀비 (sub-agent 추적 단위 외) 검출 — 가드 A/B 의 직교 보강

set -uo pipefail

# ETIME 임계값 (분) — 본 세션 시작 이전 추정. 30분 = qa/dev 사이클 1회 이상 경과
THRESHOLD_MINUTES=30

# 검출 대상 패턴 (#1066 — 무경계 `.*` 제거)
#
#   구 패턴 `next dev|next-server|cargo .*test|pnpm.*dev` 는 `.*` 가 명령행 뒷부분까지
#   이어져, 하네스 래퍼가 **모든** 명령에 덧붙이는 `< /dev/null` 의 `dev` 에 도달했다
#   → `pnpm` 을 포함한 임의 명령이 매칭 (`cargo .*test` 도 동종 구조).
#   교정 원리: `dev` / `test` 를 **공백 구분 토큰**으로만 인정한다 (앞은 공백, 뒤는 공백 또는 EOL).
#   `/dev/null` 의 `dev` 는 앞이 `/` 라 배제되고, `pnpm --filter <pkg> dev` 는 그대로 검출된다.
#
#   ⚠️ `nextest` 는 `next`+`test` 가 아니라 `nex`+`test` 다 — `(next)?test` 로는 흡수되지 않아
#      `(nextest|test)` 로 명시 열거한다 (실측: `cargo (next)?test` 는 `cargo nextest run` 미검출).
#   ⚠️ 단일 인용부호 의무 — 패턴에 `$` 가 있어 확장 차단이 필요하다.
#
#   실측 (2026-08-14, `exec -a` 위장 프로세스 19건 = 실 형태 11 + 무관 8):
#   거짓 양성 구 8 → 신 0, 거짓 음성 구 0 → 신 0 (검출 능력 손실 없이 오탐만 제거).
#   회귀 가드 = scripts/verify-zombie-check.mjs (같은 코퍼스를 hook PATTERN 으로 재판정)
PATTERN='next dev|next-server|cargo( [^ ]+)* (nextest|test)( |$)|pnpm( [^ ]+)* dev( |$)'

# ps 로 PID/ETIME/command 추출. ETIME 형식 (분 단위) 추출 후 임계값 비교
ZOMBIES=$(ps -axww -o pid=,etime=,command= 2>/dev/null \
  | grep -E "$PATTERN" \
  | grep -v "session-start-zombie-check\|grep -E\|verify-zombie-check" \
  | awk -v threshold=$THRESHOLD_MINUTES '
    {
      # ETIME 형식 파싱: [[dd-]hh:]mm:ss
      etime = $2
      n = split(etime, parts, /[-:]/)
      if (n == 2) { mins = parts[1] + parts[2]/60 }
      else if (n == 3) { mins = parts[1]*60 + parts[2] + parts[3]/60 }
      else if (n == 4) { mins = parts[1]*1440 + parts[2]*60 + parts[3] + parts[4]/60 }
      else { mins = 0 }

      if (mins >= threshold) {
        # PID + ETIME + command 출력 (command 는 $3 부터 끝까지)
        cmd = ""
        for (i = 3; i <= NF; i++) cmd = cmd $i (i < NF ? " " : "")
        printf "  PID %s | ETIME %s | %s\n", $1, etime, cmd
      }
    }
  '
)

if [[ -n "$ZOMBIES" ]]; then
  echo "WARN: 세션 시작 시점 dev/test 좀비 의심 프로세스 (ETIME ≥${THRESHOLD_MINUTES}분):"
  echo "$ZOMBIES"
  echo ""
  echo "정리 권고: kill -TERM <PID> (사용자 확인 후). 좀비 잔존 시 dev 서버 spawn 시 EADDRINUSE → ERR_PNPM_RECURSIVE_RUN_FIRST_FAIL (incident #440)."
fi

exit 0
