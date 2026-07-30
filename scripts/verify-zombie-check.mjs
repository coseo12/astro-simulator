#!/usr/bin/env node
// dev 서버 좀비 incident (#440) 회귀 가드.
//
// ※ HARNESS-DRIFT 데코레이터 없음 (#894 PR-B, reviewer R7) — 본 파일은 upstream
//    harness-setting 에 **존재하지 않는** 다운스트림 고유 가드다. Amendment 8 데코레이터는
//    "harness-managed 파일의 upstream 대비 divergence" 표식이므로 범주가 맞지 않고,
//    Amendment 10 자동 해소(upstream PR URL 매칭)도 원리적으로 불가능해 `[TODO]` 가
//    영구 잔존한다. 종전 데코레이터는 carry-over 로 매니페스트에 등록돼 drift 로 잡히면서
//    붙은 것이며, `.harnessignore` 도입으로 등록 자체가 사라져 근거를 잃었다.
//    (`verify-z-pattern-health.mjs` 등 `scanTodoFiles()` 명시 후보 4종은 Phase-2 기여
//     의도 표식으로 데코레이터를 **유지**한다 — 본 파일은 그 목록에 없다.)
//
// SSoT 박제가 PR 머지 후에도 유지되는지 정적 검증.
// 박제가 의도치 않게 제거되거나 대체되면 exit 1 로 CI 차단.
//
// 검증 항목:
//   1. CLAUDE.md `#### 가드 A — 메인 spawn 시점 lsof 선행` sub-section 헤더 존재
//   2. CLAUDE.md `#### 가드 B — sub-agent-confirmed-done 카나리아` sub-section 헤더 존재
//   3. .claude/agents/qa.md "이전 세션 좀비 카나리아" 항목 존재
//   4. .claude/hooks/session-start-zombie-check.sh 파일 존재 + executable
//   5. .claude/settings.json 에 가드 C hook 등록 (SessionStart 배선)
//   6. docs/reports/20260510-419-dev-server-zombie-recurrence.md forensic 보고서 존재
//
// 항목 5 는 #894 에서 추가됐다. 이전에는 hook **파일 존재 + 실행권한**만 검사하고
// settings.json 등록 여부는 미검사였다 — 파일이 멀쩡해도 등록 1줄이 빠지면 가드 C 는
// 실행되지 않는데 본 가드는 초록이었다. 자매 가드 verify-dead-wait-check.mjs 는 동일
// 등록 검사를 이미 수행하고 있었으므로 **비대칭**이었고, 그 비대칭이 #893 에서 가드 C 가
// "silent 소실될 뻔" 한 정확한 이유다 (#894 §0-3 실측).
//
// 근거: docs/reports/20260510-419-dev-server-zombie-recurrence.md
// 관련 ADR/이슈: #440, #894

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
    name: 'settings.json zombie-check hook 등록',
    path: '.claude/settings.json',
    type: 'contains',
    needle: 'bash .claude/hooks/session-start-zombie-check.sh',
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
