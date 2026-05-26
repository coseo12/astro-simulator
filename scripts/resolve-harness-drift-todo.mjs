#!/usr/bin/env node
// HARNESS-DRIFT: Z-PATTERN [TODO]
/**
 * resolve-harness-drift-todo.mjs
 *
 * ADR 20260515 Amendment 10 (#569) — [TODO] → upstream PR URL 자동 해소 wrapper CLI.
 *
 * Phase 2 머지된 upstream PR (coseo12/harness-setting) 을 식별하여
 * 다운스트림 HARNESS-DRIFT 데코레이터의 `[TODO]` 플레이스홀더를 실제 PR URL 로 교체.
 *
 * 매칭 휴리스틱 (ADR §Amendment 10 §결정점 2 후보 다 — AND 결합):
 *   - (a) upstream PR title 에 본 프로젝트 이슈 번호 ref
 *        (`#N` / `astro-simulator#N` / `coseo12/astro-simulator#N`)
 *   - (b) upstream PR 변경 파일 경로 = 다운스트림 [TODO] 잔존 파일 경로
 *   - (a) AND (b) 둘 다 충족 시에만 자동 매칭 (precision ↑)
 *
 * 발화 형태 (ADR §Amendment 10 §결정점 3 — soft-warn):
 *   기본 동작 --dry-run (file write 없음, stdout 안내).
 *   --apply 명시 시에만 실제 갱신.
 *
 * 호출:
 *   node scripts/resolve-harness-drift-todo.mjs [--dry-run | --apply] [--file=<path>] [--self-test]
 *
 *   --dry-run (기본): 매칭 결과만 stdout 출력.
 *     → 매칭 0 → exit 0
 *     → 매칭 N≥1 → exit 1 (soft-warn — CI workflow 감지 트리거)
 *     → 실행 에러 → exit 2
 *   --apply: 매칭된 [TODO] 라인을 실제 upstream PR URL 로 교체 (file write).
 *     → 갱신 N건 → exit 0
 *     → 매칭 0 → exit 0 (정상 — 잔존 사유 박제)
 *     → 실행 에러 → exit 2
 *   --file=<path>: 특정 파일만 대상 (테스트 용이성).
 *   --self-test: 인라인 단위 검증 (3중 시뮬레이션 + boundary cases).
 *
 * 출력 형식:
 *   <file>:<line>: [TODO] → [<URL>] (matched: PR #<N>, issue #<M>)
 *
 * 관련:
 *   - ADR docs/decisions/20260515-harness-managed-divergent-pattern.md §Amendment 10
 *   - 코어 로직: scripts/verify-z-pattern-health.mjs §computeTodoResolutions / §scanTodoFiles
 *   - CI workflow: .github/workflows/adr-z-pattern-health-v2.yml ([TODO Resolution Suggested] step)
 */
import { readFileSync, writeFileSync, existsSync, mkdtempSync, rmSync, mkdirSync } from 'node:fs';
import { join } from 'node:path';
import { tmpdir } from 'node:os';
import {
  computeTodoResolutions,
  scanTodoFiles,
  extractIssueRefsFromTitle,
  TODO_LINE_REGEX,
} from './verify-z-pattern-health.mjs';

const TODO_RESOLUTION_MARKER = '[TODO Resolution Suggested]';

/**
 * 단일 파일의 [TODO] 라인을 upstream PR URL 로 교체.
 * @param {string} absPath
 * @param {number} lineNumber 1-based
 * @param {string} upstreamPrUrl
 * @returns {boolean} 교체 성공 여부
 */
function applyTodoReplacement(absPath, lineNumber, upstreamPrUrl) {
  const content = readFileSync(absPath, 'utf-8');
  const lines = content.split('\n');
  if (lineNumber < 1 || lineNumber > lines.length) {
    return false;
  }
  const target = lines[lineNumber - 1];
  const replaced = target.replace(TODO_LINE_REGEX, (_match, p1, _p2, p3) => `${p1}${upstreamPrUrl}${p3}`);
  if (replaced === target) {
    // [TODO] 라인이 아니거나 이미 교체됨 — 무동작
    return false;
  }
  lines[lineNumber - 1] = replaced;
  writeFileSync(absPath, lines.join('\n'));
  return true;
}

/**
 * CLI 인자 파싱.
 * @param {string[]} argv
 */
function parseArgs(argv) {
  const args = argv.slice(2);
  const opts = {
    dryRun: true, // 기본 안전
    apply: false,
    file: null,
    selfTest: false,
  };
  for (const a of args) {
    if (a === '--dry-run') {
      opts.dryRun = true;
      opts.apply = false;
    } else if (a === '--apply') {
      opts.dryRun = false;
      opts.apply = true;
    } else if (a.startsWith('--file=')) {
      opts.file = a.slice('--file='.length);
    } else if (a === '--self-test') {
      opts.selfTest = true;
    } else {
      console.error(`ERROR: unknown argument: ${a}`);
      process.exit(2);
    }
  }
  return opts;
}

/**
 * 메인 진행 (dry-run / apply 공통 흐름).
 */
function main(opts) {
  let resolutions;
  try {
    resolutions = computeTodoResolutions('.');
  } catch (e) {
    console.error(`ERROR: ${e.message}`);
    process.exit(2);
  }

  // --file 옵션 — 특정 파일만 필터
  if (opts.file) {
    resolutions = resolutions.filter((r) => r.file === opts.file);
  }

  // baseline 박제 — 다운스트림 [TODO] 잔존 파일 수 (전체)
  const allTodoFiles = scanTodoFiles('.');
  console.log(`다운스트림 [TODO] 잔존 파일: ${allTodoFiles.length}`);
  console.log(`매칭된 upstream PR resolutions: ${resolutions.length}`);
  console.log('');

  if (resolutions.length === 0) {
    // 잔존 사유 박제 — Amendment 10 §단점 "title 컨벤션 위반 PR 매칭 불가" 진단
    console.log(`매칭 0건 사유 (참고):`);
    console.log(`  - upstream PR title 에 본 프로젝트 이슈 ref 부재 (#574 영역 — PR title commitlint)`);
    console.log(`  - 또는 변경 파일 경로 불일치`);
    console.log(`  - 또는 upstream PR 미생성 (Phase 2 진행 중)`);
    // 잔존 파일 목록 박제 (사용자 수동 확인 fallback)
    if (allTodoFiles.length > 0) {
      console.log('');
      console.log(`잔존 [TODO] 파일 (수동 매칭 후보):`);
      for (const t of allTodoFiles) {
        console.log(`  - ${t.file}:${t.line}`);
      }
    }
    process.exit(0);
  }

  // 매칭 발견 — dry-run vs apply 분기
  console.log(`${TODO_RESOLUTION_MARKER}`);
  for (const r of resolutions) {
    console.log(
      `  ${r.file}:${r.line}: [TODO] → [${r.upstreamPrUrl}] (matched: PR #${r.upstreamPrNumber}, issue #${r.downstreamIssue})`,
    );
  }
  console.log('');

  if (opts.dryRun) {
    console.log('모드: --dry-run (file write 없음)');
    console.log('실제 갱신: node scripts/resolve-harness-drift-todo.mjs --apply');
    // soft-warn — exit 1 (CI workflow grep 으로 매칭 발견 감지)
    process.exit(1);
  }

  // --apply: 실제 갱신
  let applied = 0;
  const failed = [];
  for (const r of resolutions) {
    const abs = `./${r.file}`;
    const ok = applyTodoReplacement(abs, r.line, r.upstreamPrUrl);
    if (ok) {
      applied++;
      console.log(`APPLIED ${r.file}:${r.line} → [${r.upstreamPrUrl}]`);
    } else {
      failed.push(r);
    }
  }

  console.log('');
  console.log(`적용 완료: ${applied}건`);
  if (failed.length > 0) {
    console.error(`실패: ${failed.length}건`);
    for (const f of failed) {
      console.error(`  - ${f.file}:${f.line} (TODO 패턴 불일치 또는 라인 범위 초과)`);
    }
    process.exit(2);
  }
  process.exit(0);
}

// =============================================================================
// Self-test (인라인 단위 검증 — ADR §Amendment 10 §회귀 가드 (2) 3중 시뮬레이션)
// =============================================================================

function runSelfTest() {
  let pass = 0;
  let fail = 0;
  const results = [];

  function expect(name, cond, detail = '') {
    if (cond) {
      pass++;
      results.push(`  PASS  ${name}`);
    } else {
      fail++;
      results.push(`  FAIL  ${name}${detail ? ' — ' + detail : ''}`);
    }
  }

  // --- (1) extractIssueRefsFromTitle 단위 검증 ---
  expect(
    'extractIssueRefs: full path',
    JSON.stringify(extractIssueRefsFromTitle('feat: [coseo12/astro-simulator#123] hello').sort()) ===
      JSON.stringify([123]),
  );
  expect(
    'extractIssueRefs: cross-repo',
    JSON.stringify(extractIssueRefsFromTitle('docs: astro-simulator#456 박제').sort()) ===
      JSON.stringify([456]),
  );
  expect(
    'extractIssueRefs: simple #N',
    JSON.stringify(extractIssueRefsFromTitle('chore: [#789] auto fix').sort()) ===
      JSON.stringify([789]),
  );
  // 다중 ref — Set 으로 정렬
  expect(
    'extractIssueRefs: multi',
    JSON.stringify(extractIssueRefsFromTitle('fix: #100 closes #200 astro-simulator#300').sort((a, b) => a - b)) ===
      JSON.stringify([100, 200, 300]),
  );
  // 빈 title
  expect(
    'extractIssueRefs: empty',
    extractIssueRefsFromTitle('').length === 0,
  );
  // ref 없음 (3 패턴 모두 미일치)
  expect(
    'extractIssueRefs: no refs',
    extractIssueRefsFromTitle('chore: regular work without issue ref').length === 0,
  );

  // --- (2) applyTodoReplacement 단위 검증 (positive / negative / boundary) ---
  const tmp = mkdtempSync(join(tmpdir(), 'todo-resolve-test-'));
  try {
    // positive — .md HTML 주석
    const mdPath = join(tmp, 'mock.md');
    writeFileSync(mdPath, '<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\nbody line\n');
    const okMd = applyTodoReplacement(mdPath, 1, 'https://github.com/coseo12/harness-setting/pull/248');
    expect('apply .md HTML 주석', okMd === true);
    const mdContent = readFileSync(mdPath, 'utf-8');
    expect(
      'apply .md content updated',
      mdContent.includes('[https://github.com/coseo12/harness-setting/pull/248]') &&
        !mdContent.includes('[TODO]'),
      mdContent.slice(0, 100),
    );

    // positive — .mjs line-slash
    const mjsPath = join(tmp, 'mock.mjs');
    writeFileSync(mjsPath, '#!/usr/bin/env node\n// HARNESS-DRIFT: Z-PATTERN [TODO]\nconst x = 1;\n');
    const okMjs = applyTodoReplacement(mjsPath, 2, 'https://github.com/coseo12/harness-setting/pull/260');
    expect('apply .mjs line-slash', okMjs === true);
    const mjsContent = readFileSync(mjsPath, 'utf-8');
    expect(
      'apply .mjs content updated',
      mjsContent.includes('// HARNESS-DRIFT: Z-PATTERN [https://github.com/coseo12/harness-setting/pull/260]') &&
        !mjsContent.includes('[TODO]'),
      mjsContent,
    );

    // positive — .yml line-hash
    const ymlPath = join(tmp, 'mock.yml');
    writeFileSync(ymlPath, '# HARNESS-DRIFT: Z-PATTERN [TODO]\nname: foo\n');
    const okYml = applyTodoReplacement(ymlPath, 1, 'https://github.com/coseo12/harness-setting/pull/257');
    expect('apply .yml line-hash', okYml === true);

    // negative — 이미 URL 박제된 라인 (재적용 무동작)
    const alreadyResolvedPath = join(tmp, 'resolved.md');
    writeFileSync(
      alreadyResolvedPath,
      '<!-- HARNESS-DRIFT: Z-PATTERN [https://github.com/coseo12/harness-setting/pull/100] -->\n',
    );
    const noOpResolved = applyTodoReplacement(
      alreadyResolvedPath,
      1,
      'https://github.com/coseo12/harness-setting/pull/200',
    );
    expect('apply skip already-resolved', noOpResolved === false);

    // negative — TODO 패턴 없는 라인
    const plainPath = join(tmp, 'plain.md');
    writeFileSync(plainPath, '# Regular markdown\n');
    const noOpPlain = applyTodoReplacement(plainPath, 1, 'https://github.com/x/y/pull/1');
    expect('apply skip non-TODO line', noOpPlain === false);

    // boundary — 라인 범위 초과
    const shortPath = join(tmp, 'short.md');
    writeFileSync(shortPath, '<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\n');
    const noOpOverflow = applyTodoReplacement(shortPath, 99, 'https://x/');
    expect('apply skip line overflow', noOpOverflow === false);

    // boundary — 라인 번호 0
    const noOpZero = applyTodoReplacement(shortPath, 0, 'https://x/');
    expect('apply skip line=0', noOpZero === false);
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  // --- (3) computeTodoResolutions 3중 시뮬레이션 ---
  // ADR §Amendment 10 §회귀 가드 (2) — positive (매칭) → negative (미매칭) → recovery (적용 후)
  // 의존성: gh CLI 가 mock 불가능하므로 본 self-test 는 매칭 휴리스틱 (extractIssueRefs + AND 결합)
  // 단위 검증으로 대체. computeTodoResolutions 통합 검증은 develop 실측 (D4) 으로 보완.
  // boundary cases — AND 결합 조건 검증
  const titleMatchOnly = extractIssueRefsFromTitle('feat: [astro-simulator#999] hello').length > 0;
  expect('title 매칭 (a 조건)', titleMatchOnly === true);

  // title 매칭 + 파일 매칭 AND 결합 의도 — 본 검증은 boundary 패턴 단위만 수행
  expect('AND 결합 — title 0건이면 매칭 0', extractIssueRefsFromTitle('no refs here').length === 0);

  console.log(results.join('\n'));
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}

// =============================================================================
// CLI entrypoint
// =============================================================================

if (import.meta.url === `file://${process.argv[1]}`) {
  const opts = parseArgs(process.argv);
  if (opts.selfTest) {
    process.exit(runSelfTest());
  }
  main(opts);
}

export { applyTodoReplacement, parseArgs, TODO_RESOLUTION_MARKER };
