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
//   8. .claude/agents/qa.md 카나리아 패턴 리터럴 ↔ hook PATTERN 축자 일치 + 사본 수 (#1066/#1086)
//   9. docs/ops/zombie-process-guards.md 정본 리터럴 ↔ hook PATTERN 축자 일치 + 사본 수 (#1066/#1086)
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
// ⚠️ 항목 8·9 는 #1086 에서 **사본 수 pin** 으로 바뀌었다. 그전에는 `grep -E '<PATTERN>'`
// **형태 하나만** 찾았고, 그래서 같은 파일 안의 다른 형태(zombie-process-guards.md §10 의
// bare 코드펜스)는 대조 밖이었다 — reviewer 실증: **§10 펜스만 구 패턴으로 되돌려도 9/9 PASS**.
// 사본을 기계로 묶겠다는 항목 9 자신의 취지에 난 구멍이었다.
//   교정 = 형태를 넓히는 대신 **축자 사본 개수를 못박는다**. 「어느 펜스가 정본인가」를
//   판정할 필요가 없어지므로 설명용 펜스·반례 인용은 **구조적으로 오탐 0** 이다 — 그것들은
//   정의상 hookPattern 과 **다른 문자열**이라 축자 계수에 애초에 걸리지 않는다. 형태 확장안
//   (펜스 추출 정규식 확대) 을 기각한 이유가 이것이다: 같은 문서의 §1 동결 인용 펜스가
//   `next dev` 를 싣고 §10 산문이 구 패턴을 반례로 인용하므로, 내용 기반 추출은 **정상 문서에서
//   즉시 오탐**을 낸다.
//   ⚠️ 잔여 한계 (명시) — 「처음부터 hook 과 다른 값으로 **새 사본을 추가**」하는 경우는
//   개수가 그대로라 통과한다. 이 축의 커버는 PR diff 리뷰이며 기계 가드가 아니다.
//   사본을 의도적으로 늘리거나 줄이면 아래 EXPECTED_PATTERN_COPIES 를 **같은 PR 에서** 갱신한다.
//
// 항목 5 는 #894 에서 추가됐다. 이전에는 hook **파일 존재 + 실행권한**만 검사하고
// settings.json 등록 여부는 미검사였다 — 파일이 멀쩡해도 등록 1줄이 빠지면 가드 C 는
// 실행되지 않는데 본 가드는 초록이었다. 자매 가드 verify-dead-wait-check.mjs 는 동일
// 등록 검사를 이미 수행하고 있었으므로 **비대칭**이었고, 그 비대칭이 #893 에서 가드 C 가
// "silent 소실될 뻔" 한 정확한 이유다 (#894 §0-3 실측).
//
// 근거: docs/reports/20260510-419-dev-server-zombie-recurrence.md
// 관련 ADR/이슈: #440, #894, #1054, #1066, #1086

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
  // --- #1086 추가 ---
  // 공백 2개. ps 는 argv 를 공백 1개로 잇지만 `sh -c '…'` 는 한 argv 원소라 내부 공백이 보존된다.
  // 구분자를 ` ` 로 못박은 #1066 채택안은 이걸 놓쳤다 (구 1 → 신 0 — "손실 0" 전칭 단정의 반례).
  '/bin/sh -c pnpm  dev',
  // `[^ &|;]` 좁힘의 **안전 대조군** — 분리자가 아닌 중간 토큰은 그대로 넘어야 한다.
  'cargo +nightly test --lib',
];

// 하네스 래퍼 접두/접미. **모든** Bash 도구 호출에 `< /dev/null` 이 붙는 것이 #1066 의 1차 매개다.
// ⚠️ 매개는 `<` 하나가 아니다 — 명령이 스스로 붙이는 `> /dev/null` · `2>/dev/null` 도 같은
// `/dev` 를 명령행에 올린다 (PR #1077 dev 교차 관측). 아래 FP 코퍼스가 양방향을 모두 싣는다.
const W_PRE =
  "/bin/zsh -c source /Users/seo/.claude/shell-snapshots/snapshot-zsh-1786687667281-uiooar.sh 2>/dev/null || true && setopt NO_EXTENDED_GLOB NO_BARE_GLOB_QUAL 2>/dev/null || true && { \\builtin unalias -- 'unsetenv'; \\builtin unset -f -- 'unsetenv'; } >/dev/null 2>&1 || true && eval '";
const W_POST = "' < /dev/null && pwd -P >| /tmp/claude-cb83-cwd";

// 미검출 **의무** 형태 — 구 패턴은 이 목록 전건에 거짓 양성을 냈다 (2026-08-14 실측 11/11).
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
  // --- 출력 리다이렉션 축 (PR #1077 dev 교차 관측 — 실측 hit 1, ETIME 00:04) ---
  `${W_PRE}cd /Users/seo/project/space/.claude/worktrees/agent-infra1060 && pnpm --filter @astro-simulator/web typecheck > /dev/null 2>&1${W_POST}`,
  // 위 케이스는 래퍼의 `< /dev/null` 도 함께 실어 축이 섞인다 — 아래 2건이 `>` 축을 **단독 격리**한다.
  '/bin/sh -c pnpm --filter @astro-simulator/web typecheck > /dev/null 2>&1',
  '/bin/sh -c pnpm run lint 2>/dev/null',
  // --- #1086 추가: 명령 분리자 횡단 축 (`[^ &|;]` 세 문자를 1건씩 격리 고정) ---
  // 실행된 건 `cargo build` 인데 뒤의 bare `pnpm test` 까지 이어져 **cargo 축으로 오귀속**됐다.
  // 위 `pnpm test:unit` 케이스가 통과했던 건 `:` 가 우경계를 깬 덕이라 bare 형태는 미커버였다.
  // bare `test` 스크립트는 워크스페이스 4곳에 실재한다 (apps/web · core · physics-wasm · shared).
  'cargo build --release && pnpm test',
  '/bin/sh -c cargo build; pnpm test',
  '/bin/sh -c cargo build | tee log && pnpm test',
  // --- #1086 추가: `next dev` 우경계 축 (#1066 이 자기 원칙을 이 분기에 적용하지 않았다) ---
  '/bin/sh -c next development',
  'node x.mjs --mode next dev-preview',
];

/** hook PATTERN 을 실제 `grep -E` 에 먹여 매칭된 줄 집합을 돌려준다. */
function grepMatches(pattern, lines) {
  const r = spawnSync('grep', ['-E', pattern], {
    input: lines.join('\n') + '\n',
    encoding: 'utf8',
  });
  // grep 종료 코드: 0 = 매칭 있음 / 1 = 매칭 없음 / 2+ = 오류
  // ⚠️ 미채택 기록 (#1086, PR #1080 cross-validate 제안) — `ENOENT`/`EACCES` 를 분기해
  // "시스템 grep 을 찾을 수 없습니다" 류 안내로 바꾸자는 제안은 **기각**했다. `r.error.message`
  // 가 이미 errno 와 원인을 그대로 싣고(`spawnSync grep ENOENT`), 어느 분기든 결과는 동일하게
  // 항목 7~9 전건 FAIL + exit 1 이라 **실해 0** 이다. 분기 추가는 사본만 늘린다.
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

// 파일별 hook PATTERN 축자 사본 **기대 개수** (#1086 — 형태 무관 계수 pin).
//   qa.md                     1 = 카나리아 항목 산문 안 `grep -E '<PATTERN>'` 명령
//   zombie-process-guards.md  2 = §9 검출 명령 정본 + §10 「교정 원리」 bare 코드펜스
// 사본을 늘리거나 줄이는 변경은 이 값을 **같은 PR 에서** 갱신해야 한다 (그 순간이 곧
// "중복 출처를 하나 더 두는 게 맞는가" 를 사람이 판정해야 하는 지점이다 — volt #120).
// ⚠️ `CHANGELOG.md` 도 패턴 리터럴을 1건 싣지만 **의도적으로 대조 밖**이다. 확정 릴리스
// 섹션의 기술은 *그 시점 사실* 이라 소급 편집이 금지되므로(CLAUDE.md §릴리스), 여기에
// 넣으면 패턴을 바꿀 때마다 가드가 **금지된 편집을 강요**하게 된다. 같은 이유로 CLAUDE.md
// §가드 B 도 대상이 아니다 (그쪽은 의도적으로 다른 검출 범위 — 위 #1065 판정).
const EXPECTED_PATTERN_COPIES = {
  '.claude/agents/qa.md': 1,
  'docs/ops/zombie-process-guards.md': 2,
};

/** 문자열 안 needle 의 비중첩 출현 횟수 + 각 출현의 1-based 행 번호. */
function locateOccurrences(haystack, needle) {
  const lineNumbers = [];
  let from = 0;
  for (;;) {
    const idx = haystack.indexOf(needle, from);
    if (idx === -1) break;
    lineNumbers.push(haystack.slice(0, idx).split('\n').length);
    from = idx + needle.length;
  }
  return lineNumbers;
}

/**
 * 항목 8·9 — 문서 사본이 hook PATTERN 을 축자 그대로 싣고 있는가.
 *
 * 두 축을 함께 본다. (a) **개수** — 축자 사본 수가 기대치와 같은가 (형태 무관. 사본 하나가
 * 조용히 stale 해지면 개수가 줄어 잡힌다) / (b) **정본 명령 형태** — `grep -E '<PATTERN>'`
 * 형태의 사본이 최소 1개 남아 있는가 (에이전트가 복사해 쓰는 실행 가능한 형태의 생존).
 * (a) 만으로는 명령 껍데기가 벗겨진 채 패턴만 남는 변형을 못 잡고, (b) 만으로는 #1086 이
 * 고친 그 사각(bare 펜스)이 그대로다. 두 축은 직교하며 어느 하나도 다른 하나를 함의하지 않는다.
 */
function checkPatternCopy(path) {
  if (!hookPattern) return { pass: false, detail: `hook PATTERN 추출 실패 — ${hookPatternError}` };
  const expected = EXPECTED_PATTERN_COPIES[path];
  const content = readFileSync(resolve(ROOT, path), 'utf8');
  const lines = locateOccurrences(content, hookPattern);
  const where = lines.length ? ` (L${lines.join(', L')})` : '';

  const problems = [];
  if (lines.length !== expected) {
    problems.push(`hook PATTERN 축자 사본 ${lines.length}개${where} — 기대 ${expected}개`);
  }
  if (!content.includes(`grep -E '${hookPattern}'`)) {
    problems.push(`정본 명령 형태 미발견 — 기대 리터럴: grep -E '${hookPattern}'`);
  }
  return problems.length > 0
    ? { pass: false, detail: problems.join(' / ') }
    : { pass: true, detail: `축자 사본 ${lines.length}/${expected}${where} + 정본 명령 형태 생존` };
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
    name: 'qa.md 카나리아 패턴 ↔ hook PATTERN 축자 일치 (사본 수 pin)',
    path: '.claude/agents/qa.md',
    type: 'custom',
    run: () => checkPatternCopy('.claude/agents/qa.md'),
  },
  {
    name: 'zombie-process-guards.md 정본 패턴 ↔ hook PATTERN 축자 일치 (사본 수 pin)',
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
