#!/bin/bash
# 세션 시작 시점 dev 서버 / cargo / pnpm 좀비 검출 (incident #440 가드 C)
#
# 동작:
#   - ETIME 30분 이상 next dev / next-server / cargo test / cargo nextest / pnpm dev 프로세스 식별
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

# 검출 대상 패턴 (#1066 무경계 `.*` 제거 → #1086 경계 자기적용 · 분리자 · 공백 보정)
#
#   구 패턴 `next dev|next-server|cargo .*test|pnpm.*dev` 는 `.*` 가 명령행 뒷부분까지
#   이어져 `/dev/null` 의 `dev` 에 도달했다 → `pnpm` 을 포함한 임의 명령이 매칭
#   (`cargo .*test` 도 동종 구조). ⚠️ 매개는 하나가 아니다 — 하네스 래퍼가 모든 명령에
#   덧붙이는 `< /dev/null` 과 명령이 스스로 붙이는 `> /dev/null` · `2>/dev/null` 이
#   **양방향으로** 같은 `/dev` 를 명령행에 올린다 (후자는 PR #1077 dev 교차 관측).
#   교정 원리: `dev` / `test` 를 **공백 구분 토큰**으로만 인정한다 (앞은 공백, 뒤는 공백 또는 EOL).
#   `/dev/null` 의 `dev` 는 방향과 무관하게 앞이 `/` 라 배제되고, `pnpm --filter <pkg> dev` 는 남는다.
#
#   ⚠️ `nextest` 는 `next`+`test` 가 아니라 `nex`+`test` 다 — `(next)?test` 로는 흡수되지 않아
#      `(nextest|test)` 로 명시 열거한다 (실측: `cargo (next)?test` 는 `cargo nextest run` 미검출).
#   ⚠️ 경계는 **양쪽 다** 필요하다. 한쪽(앞)만 거는 `pnpm( |$).*( dev|dev )` 형태는 이 코퍼스에서는
#      동률이지만 ` development` / ` dev-preview` 를 흘린다 (구조 차이 — zombie-process-guards.md §10).
#   ⚠️ 단일 인용부호 의무 — 패턴에 `$` 가 있어 확장 차단이 필요하다.
#
#   #1086 보정 3건 (#1066 채택안의 잔여. 전부 코퍼스 실측 판정 — zombie-process-guards.md §10):
#     (1) `next dev( |$)` — 바로 위 "경계는 양쪽 다" 원칙이 **`next dev` 분기에는 자기적용되지
#         않았다**. 우경계가 없어 `next development` · `next dev-preview` 가 매칭됐다(실측 hit 1
#         → 0). 좌경계는 붙이지 않는다 — 실 argv 가 `…/bin/next dev` 라 앞이 `/` 다.
#     (2) `[^ &|;]` — 중간 토큰이 `&&` · `;` · `|` 를 넘어 `cargo build --release && pnpm test` 를
#         **cargo 축으로 오귀속**했다. bare `test` 스크립트는 워크스페이스 4곳에 실재하므로
#         (apps/web · packages/{core,physics-wasm,shared}) 가상 형태가 아니다.
#     (3) `( +…)* +` — 구분자를 공백 **1개**로 못박아 `pnpm  dev`(공백 2개)를 놓쳤다(구 1 → 신 0).
#         ⚠️ 중간 토큰만 `( +[^ ]+)*` 로 넓히면 **안 고쳐진다**(측정 0) — 마지막 구분자의 ` ` 를
#         ` +` 로 바꾸는 것이 실제 교정이다. ps 는 argv 를 공백 1개로 잇지만 `sh -c '…'` 처럼
#         한 argv 원소 안에 들어간 공백은 그대로 보존된다.
#
#   실측 (2026-08-16, `exec -a` 위장 프로세스 형태 29건 = 검출 의무 13 + 미검출 의무 16):
#   거짓 양성 구 11 → 신 0, 거짓 음성 0 → 0. ⚠️ "검출 능력 손실 0" 은 **본 코퍼스 한정**이며
#   전칭 주장이 아니다 — 하네스 래퍼 셸 자신(`eval '… pnpm dev' < /dev/null`)은 의도적 미검출이다.
#   회귀 가드 = scripts/verify-zombie-check.mjs (같은 코퍼스를 hook PATTERN 으로 재판정)
PATTERN='next dev( |$)|next-server|cargo( +[^ &|;]+)* +(nextest|test)( |$)|pnpm( +[^ &|;]+)* +dev( |$)'

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
