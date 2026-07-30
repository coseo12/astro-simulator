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
  matchTodoResolutions,
  mergeDecoratorUrls,
  parseDecoratorUrls,
  DECORATOR_CONTENT_REGEX,
  TODO_LINE_REGEX,
} from './verify-z-pattern-health.mjs';

/** self-test 헬퍼 — 데코레이터 라인에서 URL 목록 추출 */
const parseUrlsOf = (lineOrContent) => {
  const m = DECORATOR_CONTENT_REGEX.exec(lineOrContent);
  return m ? parseDecoratorUrls(m[2]) : [];
};

const TODO_RESOLUTION_MARKER = '[TODO Resolution Suggested]';
const TODO_HELD_MARKER = '[TODO Resolution Held — 다중 후보]';

/**
 * 단일 데코레이터 라인에 upstream PR URL 을 **append**.
 *
 * Amendment 17 §(α) (#894) — 종전 구현은 대괄호 안을 통째로 교체했으므로, 이미 URL 이
 * 박제된 파일(다중 사유 drift)에 다른 PR 이 매칭되면 **기존 사유가 소실**됐다.
 * `mergeDecoratorUrls()` 는 기존 집합을 보존한 채 신규만 덧붙이므로 그 사고가 소멸한다.
 * 동일 URL 재적용은 무동작 (멱등).
 *
 * @param {string} absPath
 * @param {number} lineNumber 1-based
 * @param {string} upstreamPrUrl
 * @returns {boolean} 갱신 여부 (변화 없으면 false)
 */
function applyTodoReplacement(absPath, lineNumber, upstreamPrUrl) {
  const content = readFileSync(absPath, 'utf-8');
  const lines = content.split('\n');
  if (lineNumber < 1 || lineNumber > lines.length) {
    return false;
  }
  const target = lines[lineNumber - 1];
  const replaced = target.replace(
    DECORATOR_CONTENT_REGEX,
    (_match, p1, inner, p3) => `${p1}${mergeDecoratorUrls(inner, [upstreamPrUrl])}${p3}`,
  );
  if (replaced === target) {
    // 데코레이터 라인이 아니거나 이미 동일 URL 보유 — 무동작
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
    console.log(
      `  - upstream PR title 에 본 프로젝트 이슈 ref 부재 (#574 영역 — PR title commitlint)`,
    );
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

  // Amendment 17 §(β) (#894) — 후보 ≥2 파일은 자동 적용 보류 (비결정적 승자 선정 차단)
  const applicable = resolutions.filter((r) => !r.held);
  const held = resolutions.filter((r) => r.held);

  if (held.length > 0) {
    console.log(`${TODO_HELD_MARKER}`);
    for (const r of held) {
      console.log(
        `  ${r.file}:${r.line} — 후보 ${r.candidates.length}건 (자동 적용 보류, 사람 판정)`,
      );
      for (const c of r.candidates) {
        console.log(`      PR #${c.upstreamPrNumber} — ${c.upstreamPrTitle}`);
      }
    }
    console.log('');
    console.log('  보류 사유: 어떤 upstream PR 이 이 파일의 drift 사유인지 자동 판정 불가.');
    console.log('  조치: 해당 파일의 데코레이터를 직접 편집해 다중 URL 문법으로 박제');
    console.log('        형식: [<url> + <url>]  (Amendment 17 §α)');
    console.log('');
  }

  // 매칭 발견 — dry-run vs apply 분기
  if (applicable.length > 0) {
    console.log(`${TODO_RESOLUTION_MARKER}`);
    for (const r of applicable) {
      console.log(
        `  ${r.file}:${r.line}: [TODO] → [${r.upstreamPrUrl}] (matched: PR #${r.upstreamPrNumber}, issue #${r.downstreamIssue})`,
      );
    }
    console.log('');
  }

  if (opts.dryRun) {
    console.log('모드: --dry-run (file write 없음)');
    console.log('실제 갱신: node scripts/resolve-harness-drift-todo.mjs --apply');
    // soft-warn — exit 1 (CI workflow grep 으로 매칭 발견 감지)
    process.exit(1);
  }

  if (applicable.length === 0) {
    console.log(`적용 완료: 0건 (보류 ${held.length}건 — 사람 판정 대기)`);
    process.exit(0);
  }

  // --apply: 실제 갱신 (보류분 제외)
  let applied = 0;
  const failed = [];
  for (const r of applicable) {
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
    JSON.stringify(
      extractIssueRefsFromTitle('feat: [coseo12/astro-simulator#123] hello').sort(),
    ) === JSON.stringify([123]),
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
  // 다중 ref — Set 으로 정렬 ([#N] brackets + cross-repo 패턴 매칭)
  expect(
    'extractIssueRefs: multi (Amendment 10 §결정점 2 정정 후 — brackets 필수)',
    JSON.stringify(
      extractIssueRefsFromTitle('fix: [#100] closes [#200] astro-simulator#300').sort(
        (a, b) => a - b,
      ),
    ) === JSON.stringify([100, 200, 300]),
  );
  // 빈 title
  expect('extractIssueRefs: empty', extractIssueRefsFromTitle('').length === 0);
  // ref 없음 (3 패턴 모두 미일치)
  expect(
    'extractIssueRefs: no refs',
    extractIssueRefsFromTitle('chore: regular work without issue ref').length === 0,
  );

  // --- Amendment 10 §결정점 2 정정 (#581) cross-repo false-positive boundary cases ---
  // brackets 강제로 false-positive 회피 검증
  expect(
    'extractIssueRefs: cross-repo volt false-positive 회피 (#581 정정)',
    extractIssueRefsFromTitle(
      'docs(harness): real-lessons 박제 2건 — volt #114 (spawnSync stdin) + volt #115',
    ).length === 0,
    JSON.stringify(extractIssueRefsFromTitle('docs(harness): real-lessons 박제 2건 — volt #114')),
  );
  expect(
    'extractIssueRefs: 단순 #N (brackets 없음) skip (#581 정정)',
    extractIssueRefsFromTitle('fix: #100 description without brackets').length === 0,
    JSON.stringify(extractIssueRefsFromTitle('fix: #100 description')),
  );
  expect(
    'extractIssueRefs: PR squash merge suffix (#583) skip (brackets 없음)',
    JSON.stringify(extractIssueRefsFromTitle('feat: [#572] Amendment 11 (#583)').sort()) ===
      JSON.stringify([572]),
  );
  // upstream repo 자기 ref 패턴 회피 (harness-setting #190 등)
  expect(
    'extractIssueRefs: upstream 자기 ref (harness-setting #190) skip',
    extractIssueRefsFromTitle('chore: harness-setting #190 자기 ref').length === 0,
  );
  // brackets 정합 ref 매칭 정상
  expect(
    'extractIssueRefs: [#N] brackets 매칭 정상 (본 프로젝트 PR title 컨벤션)',
    JSON.stringify(extractIssueRefsFromTitle('feat(z-pattern): [#577] ADR Amendment 12').sort()) ===
      JSON.stringify([577]),
  );

  // --- (2) applyTodoReplacement 단위 검증 (positive / negative / boundary) ---
  const tmp = mkdtempSync(join(tmpdir(), 'todo-resolve-test-'));
  try {
    // positive — .md HTML 주석
    const mdPath = join(tmp, 'mock.md');
    writeFileSync(mdPath, '<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\nbody line\n');
    const okMd = applyTodoReplacement(
      mdPath,
      1,
      'https://github.com/coseo12/harness-setting/pull/248',
    );
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
    writeFileSync(
      mjsPath,
      '#!/usr/bin/env node\n// HARNESS-DRIFT: Z-PATTERN [TODO]\nconst x = 1;\n',
    );
    const okMjs = applyTodoReplacement(
      mjsPath,
      2,
      'https://github.com/coseo12/harness-setting/pull/260',
    );
    expect('apply .mjs line-slash', okMjs === true);
    const mjsContent = readFileSync(mjsPath, 'utf-8');
    expect(
      'apply .mjs content updated',
      mjsContent.includes(
        '// HARNESS-DRIFT: Z-PATTERN [https://github.com/coseo12/harness-setting/pull/260]',
      ) && !mjsContent.includes('[TODO]'),
      mjsContent,
    );

    // positive — .yml line-hash
    const ymlPath = join(tmp, 'mock.yml');
    writeFileSync(ymlPath, '# HARNESS-DRIFT: Z-PATTERN [TODO]\nname: foo\n');
    const okYml = applyTodoReplacement(
      ymlPath,
      1,
      'https://github.com/coseo12/harness-setting/pull/257',
    );
    expect('apply .yml line-hash', okYml === true);

    // --- Amendment 17 §(α) (#894) — append 전환 3중 시뮬레이션 ---
    // positive: 이미 URL 이 있는 라인에 신규 URL 이 오면 **append** (기존 소실 없음)
    const alreadyResolvedPath = join(tmp, 'resolved.md');
    writeFileSync(
      alreadyResolvedPath,
      '<!-- HARNESS-DRIFT: Z-PATTERN [https://github.com/coseo12/harness-setting/pull/100] -->\n',
    );
    const appended = applyTodoReplacement(
      alreadyResolvedPath,
      1,
      'https://github.com/coseo12/harness-setting/pull/200',
    );
    const appendedContent = readFileSync(alreadyResolvedPath, 'utf-8');
    expect('α positive: 기존 URL 보유 라인에 append 수행', appended === true);
    expect(
      'α positive: 기존 URL 보존 + 신규 append (교체 아님)',
      appendedContent.includes('pull/100 + https://github.com/coseo12/harness-setting/pull/200'),
      appendedContent,
    );
    // negative(멱등): 동일 URL 재적용 무동작
    const noOpDup = applyTodoReplacement(
      alreadyResolvedPath,
      1,
      'https://github.com/coseo12/harness-setting/pull/200',
    );
    expect('α negative: 동일 URL 재적용 무동작 (멱등)', noOpDup === false);
    // recovery: 3번째 URL 도 누적
    applyTodoReplacement(
      alreadyResolvedPath,
      1,
      'https://github.com/coseo12/harness-setting/pull/300',
    );
    expect(
      'α recovery: 3중 URL 누적 유지',
      parseUrlsOf(readFileSync(alreadyResolvedPath, 'utf-8')).length === 3,
      readFileSync(alreadyResolvedPath, 'utf-8'),
    );

    // 회귀 차단: 종전 교체 동작이 되살아나면 기존 URL 이 사라진다 → 위 assertion 이 FAIL

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

  // --- Amendment 17 §(β) (#894) — 결정적 매칭 + 다중 후보 보류 3중 시뮬레이션 ---
  {
    const todoFiles = [
      { file: '.github/workflows/harness-guards.yml', line: 1 },
      { file: '.claude/agents/qa.md', line: 6 },
    ];
    const prs = [
      { number: 322, title: '[#868] qa 정리', files: [{ path: '.claude/agents/qa.md' }] },
      {
        number: 315,
        title: '[#817] dead-wait',
        files: [{ path: '.github/workflows/harness-guards.yml' }],
      },
      {
        number: 309,
        title: '[#842] docs links',
        files: [{ path: '.github/workflows/harness-guards.yml' }],
      },
    ];
    // positive: 단일 후보 파일은 자동 적용 대상
    const res = matchTodoResolutions(todoFiles, prs);
    const qa = res.find((r) => r.file === '.claude/agents/qa.md');
    expect(
      'β positive: 단일 후보 → held=false',
      qa && qa.held === false && qa.upstreamPrNumber === 322,
    );
    // negative: 다중 후보 파일은 보류
    const wf = res.find((r) => r.file === '.github/workflows/harness-guards.yml');
    expect(
      'β negative: 후보 2건 → held=true (자동 적용 제외)',
      wf && wf.held === true && wf.candidates.length === 2,
      JSON.stringify(wf && wf.candidates),
    );
    // 결정성: 입력 순서를 뒤집어도 동일 결과 (gh pr list 정렬 비의존)
    const shuffled = matchTodoResolutions(todoFiles, [...prs].reverse());
    expect(
      'β 결정성: PR 조회 순서 무관 동일 결과 (seen first-wins 제거)',
      JSON.stringify(shuffled) === JSON.stringify(res),
    );
    // recovery: 후보가 1건으로 줄면 다시 자동 적용 대상
    const single = matchTodoResolutions(
      todoFiles,
      prs.filter((p) => p.number !== 309),
    );
    const wf2 = single.find((r) => r.file === '.github/workflows/harness-guards.yml');
    expect('β recovery: 후보 1건 복귀 → held=false', wf2 && wf2.held === false);
  }

  // --- mergeDecoratorUrls / parseDecoratorUrls 단위 ---
  {
    expect('parseDecoratorUrls: TODO → 빈 배열', parseDecoratorUrls('TODO').length === 0);
    expect(
      'parseDecoratorUrls: 다중 URL 분해',
      parseDecoratorUrls('https://a/1 + https://b/2').length === 2,
    );
    expect(
      'parseDecoratorUrls: URL 아닌 토큰 배제',
      parseDecoratorUrls('https://a/1 + 메모').length === 1,
    );
    expect(
      'mergeDecoratorUrls: TODO + 신규 → 단일 URL',
      mergeDecoratorUrls('TODO', ['https://a/1']) === 'https://a/1',
    );
    expect(
      'mergeDecoratorUrls: 기존 보존 + append 순서',
      mergeDecoratorUrls('https://a/1', ['https://b/2']) === 'https://a/1 + https://b/2',
    );
    expect(
      'mergeDecoratorUrls: 신규 없음 → 원본 유지',
      mergeDecoratorUrls('https://a/1', []) === 'https://a/1',
    );
    expect('mergeDecoratorUrls: 전부 비면 TODO 복귀', mergeDecoratorUrls('TODO', []) === 'TODO');
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
