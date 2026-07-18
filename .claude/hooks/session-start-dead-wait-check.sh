#!/bin/bash
# 세션 시작 시점 dead-wait (미해소 background 대기) 검출 훅.
#
# 동작:
#   - .context/pending-waits.json 을 읽어 이전 세션의 미해소 대기 항목 검출
#   - Grace Period(기본 60s) 초과한 항목만 stdout 경고 → 모델이 상태 재확인 유도
#   - exit 0 (세션 블록 안 함, 경고만)
#
# 왜 필요한가:
#   - 세션 재시작 시 background watch / sub-agent 는 세션의 자식 프로세스라 SIGKILL 로 소멸(exit 137)
#     하지만 메인 오케스트레이터 컨텍스트에는 "대기 중"만 남아 무기한 침묵(dead-wait) → 사용자 진행 오인
#   - 작업 유실보다 이 "무인지 대기"가 더 치명적 (실패는 재시도되나 침묵은 신호가 없음)
#
# 근거:
#   - docs/lessons/dead-wait-guard.md (3계층 직교 방어 상세)
#   - CLAUDE.md `### 세션 중단 dead-wait 방지 — 스케줄러 heartbeat 3계층 가드`
#   - volt #121
#
# testability:
#   - PENDING_WAITS_PATH       : pending-waits.json 경로 override (기본 <repo-root>/.context/pending-waits.json)
#   - DEAD_WAIT_GRACE_SECONDS  : Grace Period 초 override (기본 60)
#   scripts/verify-dead-wait-check.mjs --self-test 가 fixture 를 주입해 본 hook 을 실제 구동한다.

set -uo pipefail

# repo root 를 스크립트 위치 기준으로 계산 (cwd 무관)
SCRIPT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
ROOT="$(cd "$SCRIPT_DIR/../.." && pwd)"

PENDING="${PENDING_WAITS_PATH:-$ROOT/.context/pending-waits.json}"
# Grace Period — 세션 종료 직후 재시작 시 방금 정상 진입한 대기를 오탐하지 않도록 최소 유예.
# 진입 직후 항목 억제. 대기는 좀비 프로세스보다 짧게 살아있으므로 60s.
GRACE_SECONDS="${DEAD_WAIT_GRACE_SECONDS:-60}"

# 파일 없으면 조용히 종료 (미해소 대기 없음 = 정상)
if [[ ! -f "$PENDING" ]]; then
  exit 0
fi

# JSON 파싱은 node 로 위임 — 방어적 처리(parse 실패 시 크래시 금지, 손상 경고 후 exit 0).
# node 는 프로젝트 필수 런타임이므로 jq 미설치 환경에서도 안전.
node -e '
const fs = require("fs");
// node -e 모드는 argv 에 스크립트 경로가 없어 argv[1] 부터 인자다.
const [ , pendingPath, graceArg ] = process.argv;
const graceSeconds = Number(graceArg) || 0;

let raw;
try {
  raw = fs.readFileSync(pendingPath, "utf8");
} catch {
  process.exit(0); // 파일 접근 실패 = 미해소 대기 없음 취급
}

// 빈 파일(또는 whitespace-only)은 원자적 rename 전이/초기 상태 — 파일 부재와 동일하게 조용히 종료.
// "손상" 경고는 진짜 parse 실패(비어있지 않은데 JSON invalid)에만 한정(false-positive 노이즈 제거).
if (raw.trim() === "") {
  process.exit(0);
}

let data;
try {
  data = JSON.parse(raw);
} catch {
  console.log("WARN: .context/pending-waits.json 손상 — JSON parse 실패. 수동 확인 후 파일 정리 권고.");
  process.exit(0); // 손상돼도 세션 블록 안 함
}

const waits = Array.isArray(data && data.waits) ? data.waits : [];
const now = Date.now();

// Grace Period 필터 — created_at 이 유예 초과한 항목만.
// 비정상 timestamp(파싱불가 OR 미래)는 대칭적으로 보수 노출 — 시계 왜곡/오염 항목을 조용히 숨기지 않음.
const stale = waits.filter((w) => {
  const t = Date.parse(w && w.created_at);
  if (Number.isNaN(t)) return true; // 파싱불가 = 비정상 → 보수 노출
  if (t > now) return true; // 미래 timestamp = 비정상 → 보수 노출 (파싱불가와 대칭)
  return (now - t) / 1000 >= graceSeconds;
});

if (stale.length > 0) {
  console.log(`WARN: 이전 세션 미해소 대기 ${stale.length}건 (grace ${graceSeconds}s 초과):`);
  for (const w of stale) {
    const kind = (w && w.kind) || "?";
    const id = (w && w.id) || "?";
    const desc = (w && w.description) || "";
    const created = (w && w.created_at) || "?";
    console.log(`  - [${kind}] ${id} — ${desc} (created ${created})`);
  }
  console.log("");
  console.log("복구 프로토콜: (1) 대상 상태 조회(gh pr/issue 라벨 또는 sub-agent SendMessage) → (2) 생사·완료 판단 → (3) pending-waits 항목 제거 또는 작업 재개.");
  console.log("대기를 그대로 재개하지 말 것 — waiter 는 이미 소멸했을 수 있음(dead-wait).");
}
' "$PENDING" "$GRACE_SECONDS"

exit 0
