#!/bin/bash
# 세션 시작 시점 dev 서버 / cargo / pnpm 좀비 검출 (incident #440 가드 C)
#
# 동작:
#   - ETIME 30분 이상 next dev / next-server / cargo test / pnpm dev 프로세스 식별
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

# 검출 대상 패턴
PATTERN="next dev|next-server|cargo .*test|pnpm.*dev"

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
