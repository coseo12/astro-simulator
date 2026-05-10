#!/usr/bin/env node
// dev 서버 좀비 incident (#440) 회귀 가드.
//
// SSoT 박제가 PR 머지 후에도 유지되는지 정적 검증.
// 박제가 의도치 않게 제거되거나 대체되면 exit 1 로 CI 차단.
//
// 검증 항목:
//   1. CLAUDE.md `#### 가드 A — 메인 spawn 시점 lsof 선행` sub-section 헤더 존재
//   2. CLAUDE.md `#### 가드 B — sub-agent-confirmed-done 카나리아` sub-section 헤더 존재
//   3. .claude/agents/qa.md "이전 세션 좀비 카나리아" 항목 존재
//   4. .claude/hooks/session-start-zombie-check.sh 파일 존재 + executable
//   5. docs/reports/20260510-419-dev-server-zombie-recurrence.md forensic 보고서 존재
//
// 근거: docs/reports/20260510-419-dev-server-zombie-recurrence.md
// 관련 ADR/이슈: #440

import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();

const checks = [
  {
    name: 'CLAUDE.md 가드 A sub-section',
    path: 'CLAUDE.md',
    type: 'contains',
    needle: '#### 가드 A — 메인 spawn 시점 lsof 선행',
  },
  {
    name: 'CLAUDE.md 가드 B sub-section',
    path: 'CLAUDE.md',
    type: 'contains',
    needle: '#### 가드 B — sub-agent-confirmed-done 카나리아',
  },
  {
    name: 'qa.md 이전 세션 좀비 카나리아',
    path: '.claude/agents/qa.md',
    type: 'contains',
    needle: '이전 세션 좀비 카나리아',
  },
  {
    name: 'session-start-zombie-check.sh hook 파일',
    path: '.claude/hooks/session-start-zombie-check.sh',
    type: 'executable',
  },
  {
    name: 'forensic 보고서 (#440 incident)',
    path: 'docs/reports/20260510-419-dev-server-zombie-recurrence.md',
    type: 'exists',
  },
];

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
      // mode & 0o111 — 실행 권한 (owner/group/other 중 하나라도)
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
    `\n❌ ${failed} / ${checks.length} 항목 실패. SSoT 박제 회귀 의심 — 직전 변경 검토 필요.`,
  );
  console.error('근거: docs/reports/20260510-419-dev-server-zombie-recurrence.md, 이슈 #440');
  process.exit(1);
}

console.log(
  `\n✅ ${checks.length} / ${checks.length} 항목 PASS — #440 좀비 incident SSoT 박제 정합.`,
);
