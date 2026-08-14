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
//   5. .claude/settings.json 에 가드 C hook 등록 (SessionStart 배선)
//   6. docs/reports/20260510-419-dev-server-zombie-recurrence.md forensic 보고서 존재
//   7. hook PATTERN 정밀도 — 실측 픽스처 코퍼스에 거짓 양성 0 + 거짓 음성 0 (#1066)
//   8. .claude/agents/qa.md 카나리아 패턴 리터럴 ↔ hook PATTERN 축자 일치 (#1066)
//   9. docs/ops/zombie-process-guards.md 카나리아 정본 리터럴 ↔ hook PATTERN 축자 일치 (#1066)
//
// 항목 7 은 **정적 형태 검사가 아니라 동적 판정**이다 — hook 에서 PATTERN 을 그대로 뽑아
// 실제 `grep -E` 에 먹인다. `.*` 무경계 확장 같은 결함은 "금지 문자열 목록" 으로는
// 못 막지만(우회 형태가 무한하다) 코퍼스 판정으로는 즉시 드러난다. 부수 효과로
// ERE 방언 차이(로컬 macOS BSD grep ↔ CI ubuntu GNU grep)도 같은 검사가 걸러낸다.
//
// 항목 8·9 는 **문서 사본이 hook 과 갈리는 것**을 차단한다. 사본이 살아 있던 근거는
// qa.md 산문의 "축자 일치" 선언뿐이었고 기계 검증이 없어, #1065 가 qa.md 를 hook 에
// 정렬시킬 때까지 두 곳이 실제로 갈려 있었다. ⚠️ CLAUDE.md §가드 B 는 **검사 대상이 아니다** —
// `physics_wasm-` 를 포함한 의도적으로 다른 검출 범위이며, 3곳이 공유하는 SSoT 는
// ETIME 30분 임계뿐이다 (#1065 판정). 여기에 §가드 B 를 끼우면 통일 오독 → 커버리지 소실.
//
// 항목 5 는 #894 에서 추가됐다. 이전에는 hook **파일 존재 + 실행권한**만 검사하고
// settings.json 등록 여부는 미검사였다 — 파일이 멀쩡해도 등록 1줄이 빠지면 가드 C 는
// 실행되지 않는데 본 가드는 초록이었다. 자매 가드 verify-dead-wait-check.mjs 는 동일
// 등록 검사를 이미 수행하고 있었으므로 **비대칭**이었고, 그 비대칭이 #893 에서 가드 C 가
// "silent 소실될 뻔" 한 정확한 이유다 (#894 §0-3 실측).
//
// 근거: docs/reports/20260510-419-dev-server-zombie-recurrence.md
// 관련 ADR/이슈: #440, #894, #1054, #1066

import { spawnSync } from 'node:child_process';
import { readFileSync, statSync } from 'node:fs';
import { resolve } from 'node:path';

const ROOT = process.cwd();
const HOOK_PATH = '.claude/hooks/session-start-zombie-check.sh';

// --- #1066: hook PATTERN 추출. 아래 항목 7~9 전부가 이 값 하나에서 파생된다 (SSoT) ---
let hookPattern = null;
let hookPatternError = '';
try {
  const hookSrc = readFileSync(resolve(ROOT, HOOK_PATH), 'utf8');
  const m = hookSrc.match(/^PATTERN='([^']*)'$/m);
  if (m) hookPattern = m[1];
  else hookPatternError = "PATTERN='...' 단일 인용부호 할당 행 미발견";
} catch (err) {
  hookPatternError = err.message;
}

// 검출 **의무** 형태 — 2026-08-14 실측 argv (앞 4건은 실제 `pnpm dev` 프로세스 트리에서 채취).
// 경로는 측정 당시 그대로 둔다. 픽스처는 문자열이라 실재 여부와 무관하며 증거 보존이 우선이다.
const TP_FIXTURES = [
  'node /Users/seo/.nvm/versions/node/v24.14.0/bin/pnpm dev',
  'node /Users/seo/.nvm/versions/node/v24.14.0/bin/pnpm --filter @astro-simulator/web dev',
  'node /Users/seo/project/space/.claude/worktrees/agent-canary1066/apps/web/node_modules/.bin/../next/dist/bin/next dev',
  'next-server (v16.2.12)',
  'node /Users/seo/.nvm/versions/node/v24.14.0/bin/pnpm run dev',
  'node /Users/seo/.nvm/versions/node/v24.14.0/bin/pnpm dev --port 3001',
  'cargo test',
  'cargo test --lib',
  'cargo test --lib --release',
  '/Users/seo/.cargo/bin/cargo test --workspace',
  // `nextest` 는 `next`+`test` 가 아니라 `nex`+`test` 다 — `(next)?test` 로는 미검출 (#1066 실측)
  'cargo nextest run',
];

// 하네스 래퍼 접두/접미. **모든** Bash 도구 호출에 `< /dev/null` 이 붙는 것이 #1066 의 핵심이다.
const W_PRE =
  "/bin/zsh -c source /Users/seo/.claude/shell-snapshots/snapshot-zsh-1786687667281-uiooar.sh 2>/dev/null || true && setopt NO_EXTENDED_GLOB NO_BARE_GLOB_QUAL 2>/dev/null || true && { \\builtin unalias -- 'unsetenv'; \\builtin unset -f -- 'unsetenv'; } >/dev/null 2>&1 || true && eval '";
const W_POST = "' < /dev/null && pwd -P >| /tmp/claude-cb83-cwd";

// 미검출 **의무** 형태 — 구 패턴은 여기 전건에 거짓 양성을 냈다 (2026-08-14 실측 8/8).
const FP_FIXTURES = [
  `${W_PRE}cd /Users/seo/project/space && pnpm store path && sleep 200${W_POST}`,
  `${W_PRE}pnpm install --frozen-lockfile${W_POST}`,
  `${W_PRE}pnpm build${W_POST}`,
  `${W_PRE}pnpm format:check${W_POST}`,
  // `cargo .*test` 축 — 실행된 건 `cargo build` 인데 뒤의 `pnpm test:unit` 까지 `.*` 가 이어졌다
  `${W_PRE}cargo build --release && pnpm test:unit${W_POST}`,
  'cargo install cargo-nextest',
  'cargo build --tests',
  // 실 dev 서버의 **래퍼 셸**. 신 패턴은 이걸 보고하지 않는다 (`dev'` 뒤가 공백/EOL 이 아님).
  // 검출 능력 손실 0 — 같은 트리의 자식 4건(pnpm 2 · next · next-server)이 전부 잡힌다.
  `${W_PRE}cd /Users/seo/project/space && pnpm dev${W_POST}`,
];

/** hook PATTERN 을 실제 `grep -E` 에 먹여 매칭된 줄 집합을 돌려준다. */
function grepMatches(pattern, lines) {
  const r = spawnSync('grep', ['-E', pattern], {
    input: lines.join('\n') + '\n',
    encoding: 'utf8',
  });
  // grep 종료 코드: 0 = 매칭 있음 / 1 = 매칭 없음 / 2+ = 오류
  if (r.error) throw new Error(`grep 실행 실패: ${r.error.message}`);
  if (r.status !== 0 && r.status !== 1) {
    throw new Error(`grep exit ${r.status}: ${(r.stderr || '').trim()}`);
  }
  return new Set(r.stdout.split('\n').filter(Boolean));
}

/** 항목 7 — 코퍼스 판정. fail-fast: PATTERN 을 못 뽑으면 통과시키지 않는다. */
function checkPatternPrecision() {
  if (!hookPattern) return { pass: false, detail: `hook PATTERN 추출 실패 — ${hookPatternError}` };
  const matched = grepMatches(hookPattern, [...TP_FIXTURES, ...FP_FIXTURES]);
  const falseNegatives = TP_FIXTURES.filter((l) => !matched.has(l));
  const falsePositives = FP_FIXTURES.filter((l) => matched.has(l));
  if (falseNegatives.length === 0 && falsePositives.length === 0) {
    return {
      pass: true,
      detail: `TP ${TP_FIXTURES.length}/${TP_FIXTURES.length} 검출 · FP 0/${FP_FIXTURES.length}`,
    };
  }
  const parts = [];
  if (falseNegatives.length)
    parts.push(`거짓 음성 ${falseNegatives.length}건 (예: ${falseNegatives[0]})`);
  if (falsePositives.length)
    parts.push(`거짓 양성 ${falsePositives.length}건 (예: ${falsePositives[0]})`);
  return { pass: false, detail: parts.join(' / ') };
}

/** 항목 8·9 — 문서 사본이 hook PATTERN 을 축자 그대로 싣고 있는가. */
function checkPatternCopy(path) {
  if (!hookPattern) return { pass: false, detail: `hook PATTERN 추출 실패 — ${hookPatternError}` };
  const content = readFileSync(resolve(ROOT, path), 'utf8');
  const needle = `grep -E '${hookPattern}'`;
  return content.includes(needle)
    ? { pass: true, detail: '' }
    : { pass: false, detail: `hook PATTERN 과 축자 불일치 — 기대 리터럴: ${needle}` };
}

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
  {
    name: 'hook PATTERN 정밀도 (실측 코퍼스 FP 0 / FN 0)',
    path: HOOK_PATH,
    type: 'custom',
    run: checkPatternPrecision,
  },
  {
    name: 'qa.md 카나리아 패턴 ↔ hook PATTERN 축자 일치',
    path: '.claude/agents/qa.md',
    type: 'custom',
    run: () => checkPatternCopy('.claude/agents/qa.md'),
  },
  {
    name: 'zombie-process-guards.md 정본 패턴 ↔ hook PATTERN 축자 일치',
    path: 'docs/ops/zombie-process-guards.md',
    type: 'custom',
    run: () => checkPatternCopy('docs/ops/zombie-process-guards.md'),
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
    } else if (check.type === 'custom') {
      const r = check.run();
      pass = r.pass;
      detail = r.detail;
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
