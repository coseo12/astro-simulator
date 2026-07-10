#!/usr/bin/env node
// 세션 중단 dead-wait 가드 (가드 D, 이슈 #817) 회귀 가드 + self-test.
//
// 기본 모드 (인자 없음) — SSoT 박제 정적 검증:
//   박제(hook / settings.json 등록 / CLAUDE.md 가드 D / ADR)가 PR 머지 후에도
//   유지되는지 검증. 의도치 않게 제거/대체되면 exit 1 로 CI 차단.
//
// --self-test 모드 — 실제 hook 을 fixture 로 구동하는 3중 시뮬(가드 도입 PR DoD):
//   positive(해소→clean→경고0) → negative(유예 초과 미해소→경고 발화 exit0)
//   → recovery(제거→경고0). + Grace Period 필터 + 방어적 JSON 케이스.
//   선례: scripts/verify-harness-drift-decorator.mjs --self-test 인라인 시뮬.
//
// 근거: docs/decisions/20260710-817-dead-wait-guard.md §결과·재검토 조건 (DoD 4축)
// 관련 ADR/이슈: #817, 가드 A/B/C(#440)

import { readFileSync, statSync, mkdtempSync, writeFileSync, rmSync } from 'node:fs';
import { resolve, join } from 'node:path';
import { tmpdir } from 'node:os';
import { execFileSync } from 'node:child_process';

const ROOT = process.cwd();
const HOOK_PATH = resolve(ROOT, '.claude/hooks/session-start-dead-wait-check.sh');

// =============================================================================
// 기본 모드 — SSoT 박제 정적 검증
// =============================================================================

const checks = [
  {
    name: 'CLAUDE.md 가드 D sub-section',
    path: 'CLAUDE.md',
    type: 'contains',
    needle: '#### 가드 D — 세션 중단 dead-wait',
  },
  {
    name: 'settings.json dead-wait hook 등록',
    path: '.claude/settings.json',
    type: 'contains',
    needle: 'session-start-dead-wait-check.sh',
  },
  {
    name: 'session-start-dead-wait-check.sh hook 파일',
    path: '.claude/hooks/session-start-dead-wait-check.sh',
    type: 'executable',
  },
  {
    name: 'ADR 20260710-817 dead-wait 가드',
    path: 'docs/decisions/20260710-817-dead-wait-guard.md',
    type: 'exists',
  },
  {
    name: 'settings.json Z-패턴 sidecar',
    path: '.claude/settings.json.HARNESS-DRIFT.md',
    type: 'exists',
  },
];

function runStaticChecks() {
  let failed = 0;
  for (const check of checks) {
    const fullPath = resolve(ROOT, check.path);
    let pass = false;
    let detail = '';

    try {
      if (check.type === 'exists') {
        statSync(fullPath);
        pass = true;
      } else if (check.type === 'executable') {
        const stat = statSync(fullPath);
        pass = (stat.mode & 0o111) !== 0;
        if (!pass) detail = `mode=${(stat.mode & 0o777).toString(8)} (executable bit 없음)`;
      } else if (check.type === 'contains') {
        const content = readFileSync(fullPath, 'utf8');
        pass = content.includes(check.needle);
        if (!pass) detail = `"${check.needle}" 미발견`;
      }
    } catch (err) {
      detail = err.message;
    }

    const status = pass ? 'PASS' : 'FAIL';
    console.log(`[${status}] ${check.name} (${check.path})${detail ? ' — ' + detail : ''}`);
    if (!pass) failed++;
  }

  if (failed > 0) {
    console.error(
      `\n❌ ${failed} / ${checks.length} 항목 실패. dead-wait 가드 SSoT 박제 회귀 의심 — 직전 변경 검토 필요.`,
    );
    console.error('근거: docs/decisions/20260710-817-dead-wait-guard.md, 이슈 #817');
    process.exit(1);
  }

  console.log(
    `\n✅ ${checks.length} / ${checks.length} 항목 PASS — #817 dead-wait 가드 SSoT 박제 정합.`,
  );
}

// =============================================================================
// --self-test 모드 — 실제 hook 을 fixture 로 구동하는 3중 시뮬
// =============================================================================

// hook 을 지정한 pending-waits fixture + grace 로 실제 구동, stdout 반환.
function runHook(pendingPath, graceSeconds) {
  return execFileSync('bash', [HOOK_PATH], {
    encoding: 'utf8',
    env: {
      ...process.env,
      PENDING_WAITS_PATH: pendingPath,
      DEAD_WAIT_GRACE_SECONDS: String(graceSeconds),
    },
  });
}

// created_at 을 (now - offsetSeconds) ISO 문자열로 생성.
function isoAgo(offsetSeconds) {
  return new Date(Date.now() - offsetSeconds * 1000).toISOString();
}

function runSelfTest() {
  const results = [];
  let pass = 0;
  let fail = 0;

  const expect = (label, cond, detail = '') => {
    if (cond) {
      pass++;
      results.push(`  [PASS] ${label}`);
    } else {
      fail++;
      results.push(`  [FAIL] ${label}${detail ? ' — ' + detail : ''}`);
    }
  };

  const tmp = mkdtempSync(join(tmpdir(), 'dead-wait-selftest-'));
  const pending = join(tmp, 'pending-waits.json');

  try {
    // --- (1) positive: 대기 정상 해소 → 파일 clean(waits []) → 경고 0 ---
    writeFileSync(pending, JSON.stringify({ version: 1, waits: [] }));
    let out = runHook(pending, 60);
    expect('positive: clean 파일 → 경고 0', !out.includes('WARN'), JSON.stringify(out.trim()));

    // --- (2) negative: 유예 초과 미해소 항목 잔존 → 경고 발화 + 목록 노출 ---
    writeFileSync(
      pending,
      JSON.stringify({
        version: 1,
        waits: [
          {
            id: 'sub-agent:developer:817',
            kind: 'sub-agent',
            description: 'developer sub-agent — #817 구현',
            created_at: isoAgo(7200), // 2시간 전 (grace 60s 초과)
            wakeup_scheduled: true,
          },
          {
            id: 'ci-run:99999999',
            kind: 'ci-run',
            description: 'PR CI 완료 대기',
            created_at: isoAgo(3600),
            wakeup_scheduled: true,
          },
        ],
      }),
    );
    out = runHook(pending, 60);
    expect(
      'negative: 미해소 2건 → WARN 발화',
      out.includes('WARN: 이전 세션 미해소 대기 2건'),
      out.trim(),
    );
    expect(
      'negative: 목록에 sub-agent id 노출',
      out.includes('sub-agent:developer:817'),
      out.trim(),
    );
    expect('negative: 목록에 ci-run id 노출', out.includes('ci-run:99999999'), out.trim());
    expect('negative: 복구 프로토콜 안내 노출', out.includes('복구 프로토콜'), out.trim());

    // --- (3) recovery: 항목 제거 → 재실행 시 경고 0 ---
    writeFileSync(pending, JSON.stringify({ version: 1, waits: [] }));
    out = runHook(pending, 60);
    expect('recovery: 제거 후 → 경고 0', !out.includes('WARN'), JSON.stringify(out.trim()));

    // --- (4) Grace Period 필터: 방금 진입한 항목(now)은 유예 미경과 → 경고 0 ---
    writeFileSync(
      pending,
      JSON.stringify({
        version: 1,
        waits: [
          {
            id: 'sub-agent:fresh:1',
            kind: 'sub-agent',
            description: '방금 진입한 대기',
            created_at: isoAgo(1), // 1초 전 (grace 60s 미경과)
            wakeup_scheduled: true,
          },
        ],
      }),
    );
    out = runHook(pending, 60);
    expect('grace filter: 유예 미경과 항목 → 경고 0', !out.includes('WARN'), out.trim());

    // --- (5) 방어적 JSON: 비어있지 않은 진짜 손상 → 크래시 없이 손상 경고 + exit 0 ---
    writeFileSync(pending, '{ this is not valid json ');
    out = runHook(pending, 60); // execFileSync 는 non-zero exit 시 throw — exit 0 이면 통과
    expect(
      'defensive JSON: 비어있지 않은 진짜 손상 → 손상 경고 + exit 0',
      out.includes('손상'),
      out.trim(),
    );

    // --- (6) 미래 timestamp: created_at 이 미래 → 파싱불가와 대칭으로 보수 노출(WARN) (reviewer 권고 1) ---
    writeFileSync(
      pending,
      JSON.stringify({
        version: 1,
        waits: [
          {
            id: 'sub-agent:future:1',
            kind: 'sub-agent',
            description: '미래 timestamp 항목(시계 왜곡)',
            created_at: isoAgo(-3600), // 1시간 후 (미래)
            wakeup_scheduled: true,
          },
        ],
      }),
    );
    out = runHook(pending, 60);
    expect('future timestamp: 미래 created_at → 보수 노출(WARN)', out.includes('WARN'), out.trim());

    // --- (7) 빈 파일: 0-byte → 손상 아님, 조용히 exit 0 (reviewer 권고 2, rename 전이 상태) ---
    writeFileSync(pending, '');
    out = runHook(pending, 60);
    expect(
      'empty file: 0-byte → 손상 경고 없이 조용 exit 0',
      out.trim() === '' && !out.includes('손상'),
      JSON.stringify(out),
    );

    // --- (8) whitespace-only: 공백만 → 손상 아님, 조용히 exit 0 (reviewer 권고 2) ---
    writeFileSync(pending, '   \n\t  \n');
    out = runHook(pending, 60);
    expect(
      'whitespace-only: 공백만 → 손상 경고 없이 조용 exit 0',
      out.trim() === '' && !out.includes('손상'),
      JSON.stringify(out),
    );

    // --- (9) 파일 부재: pending-waits.json 없음 → 조용히 exit 0 ---
    rmSync(pending, { force: true });
    out = runHook(pending, 60);
    expect('missing file: 파일 없음 → stdout 조용, exit 0', out.trim() === '', JSON.stringify(out));
  } catch (err) {
    fail++;
    results.push(`  [FAIL] hook 실행 예외 — ${err.message}`);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // --- SSoT needle 정적 체크도 self-test 에 포함 (배선 회귀 조기 감지) ---
  for (const check of checks) {
    const fullPath = resolve(ROOT, check.path);
    let ok = false;
    try {
      if (check.type === 'contains') {
        ok = readFileSync(fullPath, 'utf8').includes(check.needle);
      } else if (check.type === 'executable') {
        ok = (statSync(fullPath).mode & 0o111) !== 0;
      } else {
        statSync(fullPath);
        ok = true;
      }
    } catch {
      ok = false;
    }
    expect(`SSoT needle: ${check.name}`, ok, check.path);
  }

  console.log(results.join('\n'));
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}

// =============================================================================
// CLI entrypoint
// =============================================================================

if (process.argv.includes('--self-test')) {
  process.exit(runSelfTest());
} else {
  runStaticChecks();
}
