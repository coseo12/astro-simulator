#!/usr/bin/env node
// HARNESS-DRIFT: Z-PATTERN [TODO]
/**
 * verify-harness-drift-decorator.mjs
 *
 * ADR 20260515 Amendment 8 (#556) Phase 1 드리프트 가시화 가드.
 *
 * `.harness/manifest.json` 의 sha256 와 실제 파일 sha256 를 비교해 drift 감지.
 * drift 파일에 HARNESS-DRIFT 데코레이터 (Z-PATTERN [upstream-link-or-TODO]) 박제
 * 검증. 누락 시 exit 1 (fail-fast — Amendment 8 §결정점 4 silent 가드 강화 방향).
 *
 * 본문 형식 SSoT (ADR §Amendment 8):
 *   HARNESS-DRIFT: Z-PATTERN [<upstream-link-or-TODO>]
 *
 * 파일 형식별 분기 (결정점 1):
 *   - .md            : <!-- HARNESS-DRIFT: Z-PATTERN [...] -->  (HTML 주석)
 *   - .ts/tsx/js/mjs/cjs : // HARNESS-DRIFT: Z-PATTERN [...]
 *   - .yml/yaml/sh   : # HARNESS-DRIFT: Z-PATTERN [...]
 *   - .json          : sidecar 파일 <filename>.HARNESS-DRIFT.md (JSON 주석 미지원)
 *
 * 위치 SSoT (결정점 2):
 *   파일 첫 줄 의무 + shebang (#!) / DOCTYPE (<!DOCTYPE) 직후 1줄 허용.
 *
 * 정합 regex (Amendment 8 SSoT):
 *   ^(?:#![^\n]*\n|<!DOCTYPE[^>]*>\n)?(?:<!--|//|#) HARNESS-DRIFT: Z-PATTERN \[(?:https?://[^\]]+|TODO)\](?: -->)?
 *
 * sidecar 라이프사이클 계약 (cross-validate agy 이견 수용):
 *   - <filename>.HARNESS-DRIFT.md 존재 시 동일 디렉토리에 <filename> 반드시 존재
 *   - <filename> 은 manifest drift 상태여야 함 (Phase 1 의도된 drift)
 *   - orphan sidecar (본 파일 없음 OR drift 해소된 상태) 발견 시 exit 1
 *
 * 호출:
 *   node scripts/verify-harness-drift-decorator.mjs
 *     → drift 0 또는 모든 drift 파일에 데코레이터 정합 박제 → exit 0
 *     → drift N + 데코레이터 누락 K (K > 0) → exit 1 (CI hard-fail)
 *     → manifest 파일 부재 / 실행 에러 → exit 2
 *
 * Self-test:
 *   node scripts/verify-harness-drift-decorator.mjs --self-test
 *     → 인라인 positive/negative/recovery 3중 시뮬레이션 + sidecar/regex 단위 검증
 *
 * 관련: ADR docs/decisions/20260515-harness-managed-divergent-pattern.md §Amendment 8
 */
import { createHash } from 'node:crypto';
import {
  readFileSync,
  existsSync,
  readdirSync,
  writeFileSync,
  rmSync,
  mkdtempSync,
  mkdirSync,
} from 'node:fs';
import { join, dirname, basename, extname } from 'node:path';
import { tmpdir } from 'node:os';

const MANIFEST_PATH = '.harness/manifest.json';

// Amendment 8 SSoT regex — 위치 A (파일 첫 줄 + shebang/DOCTYPE/YAML frontmatter 1블록 허용).
// 형식별 분기: `<!--` (md) / `//` (ts/js/mjs) / `#` (yml/sh)
//
// developer 단계 보완 (#556): architect SSoT regex 는 shebang/DOCTYPE 만 허용했으나
// Amendment 8 적용 대상 `.claude/agents/*.md` 의 컨벤션 (YAML frontmatter 시작) 을 미커버.
// 다중-prefix 허용 케이스: shebang | DOCTYPE | YAML frontmatter (--- ... ---) 1블록.
// 결과: regex 적용 범위 확장만 (의도 동일 — 파일 메타 헤더 직후 첫 컨텐츠 라인).
const DECORATOR_REGEX =
  /^(?:#![^\n]*\n|<!DOCTYPE[^>]*>\n|---\n(?:[\s\S]*?\n)?---\n)?(?:<!--|\/\/|#) HARNESS-DRIFT: Z-PATTERN \[(?:https?:\/\/[^\]]+|TODO)\](?: -->)?/;

/**
 * 파일 확장자별 데코레이터 형식 분기.
 * @returns {'md' | 'line-slash' | 'line-hash' | 'json-sidecar' | 'unknown'}
 */
function decoratorFormatFor(filePath) {
  const ext = extname(filePath).toLowerCase();
  if (ext === '.md') return 'md';
  if (ext === '.ts' || ext === '.tsx' || ext === '.js' || ext === '.mjs' || ext === '.cjs') {
    return 'line-slash';
  }
  if (ext === '.yml' || ext === '.yaml' || ext === '.sh') return 'line-hash';
  if (ext === '.json') return 'json-sidecar';
  return 'unknown';
}

/**
 * sha256 비교로 manifest drift 파일 목록 산출.
 * @param {string} rootDir
 * @returns {Array<{file: string, reason: string}>}
 */
function detectDriftFiles(rootDir = '.') {
  const manifestAbs = join(rootDir, MANIFEST_PATH);
  if (!existsSync(manifestAbs)) {
    throw new Error(`manifest not found: ${MANIFEST_PATH}`);
  }
  const manifest = JSON.parse(readFileSync(manifestAbs, 'utf-8'));
  const files = manifest.files || {};
  const drifts = [];
  for (const [rel, entry] of Object.entries(files)) {
    const abs = join(rootDir, rel);
    if (!existsSync(abs)) {
      // 매니페스트 등록되어 있으나 파일 부재 — drift 의 한 형태이나 데코레이터 대상 아님
      continue;
    }
    const content = readFileSync(abs);
    const sha = createHash('sha256').update(content).digest('hex');
    const expected = entry.sha256 || entry;
    if (typeof expected === 'string' && sha !== expected) {
      drifts.push({ file: rel, reason: 'sha-mismatch' });
    }
  }
  return drifts;
}

/**
 * 단일 파일에 데코레이터가 정합 박제되어 있는지 검증.
 * @returns {{ok: boolean, reason?: string, format: string}}
 */
function verifyDecorator(absPath) {
  const format = decoratorFormatFor(absPath);

  if (format === 'json-sidecar') {
    // sidecar 파일 경로: <filename>.HARNESS-DRIFT.md
    const sidecar = absPath + '.HARNESS-DRIFT.md';
    if (!existsSync(sidecar)) {
      return { ok: false, reason: `sidecar missing: ${basename(sidecar)}`, format };
    }
    const body = readFileSync(sidecar, 'utf-8');
    if (!DECORATOR_REGEX.test(body)) {
      return { ok: false, reason: `sidecar body decorator missing/invalid`, format };
    }
    return { ok: true, format };
  }

  if (format === 'unknown') {
    // 알 수 없는 확장자는 검증 대상 아님 (drift 가도 데코레이터 의무 아님)
    return { ok: true, format };
  }

  // .md / line-slash / line-hash — 파일 첫 줄 (shebang/DOCTYPE 1줄 허용)
  const content = readFileSync(absPath, 'utf-8');
  if (!DECORATOR_REGEX.test(content)) {
    return { ok: false, reason: 'decorator missing or invalid position', format };
  }
  return { ok: true, format };
}

/**
 * orphan sidecar 탐지 (cross-validate agy 이견 수용).
 * <filename>.HARNESS-DRIFT.md 가 있으나 본 파일 부재 OR drift 해소된 경우 orphan.
 * @param {string} rootDir
 * @param {Set<string>} driftSet — manifest drift 파일 절대경로 Set
 * @returns {Array<{sidecar: string, reason: string}>}
 */
function detectOrphanSidecars(rootDir, driftSet) {
  const orphans = [];
  // 매니페스트 등록된 모든 파일들의 디렉토리 집합 + rootDir + .claude/ 하위 (광범위 fs 스캔 회피)
  const manifest = JSON.parse(readFileSync(join(rootDir, MANIFEST_PATH), 'utf-8'));
  const dirsToScan = new Set();
  dirsToScan.add(rootDir);
  for (const rel of Object.keys(manifest.files || {})) {
    dirsToScan.add(dirname(join(rootDir, rel)));
  }
  // 추가: .claude/ 하위 sidecar 도 스캔 (.json 매니페스트 등록 없이도 사용자가 박제 가능)
  const claudeDir = join(rootDir, '.claude');
  if (existsSync(claudeDir)) dirsToScan.add(claudeDir);

  for (const dir of dirsToScan) {
    if (!existsSync(dir)) continue;
    let entries;
    try {
      entries = readdirSync(dir);
    } catch {
      continue;
    }
    for (const name of entries) {
      if (!name.endsWith('.HARNESS-DRIFT.md')) continue;
      const sidecar = join(dir, name);
      // 본 파일 추정: 접미사 제거
      const baseName = name.replace(/\.HARNESS-DRIFT\.md$/, '');
      const baseAbs = join(dir, baseName);
      if (!existsSync(baseAbs)) {
        orphans.push({ sidecar, reason: 'base file missing' });
        continue;
      }
      if (!driftSet.has(baseAbs)) {
        orphans.push({ sidecar, reason: 'base file not in drift state (Phase 3 cleanup needed)' });
      }
    }
  }
  return orphans;
}

/**
 * 메인 검증 — drift 파일 + 데코레이터 + orphan sidecar.
 * @param {string} rootDir
 * @returns {{drifts: number, passed: number, failed: Array, orphans: Array}}
 */
function runVerify(rootDir = '.') {
  const drifts = detectDriftFiles(rootDir);
  const driftSet = new Set(drifts.map((d) => join(rootDir, d.file)));
  const failed = [];
  let passed = 0;

  for (const { file } of drifts) {
    const abs = join(rootDir, file);
    const result = verifyDecorator(abs);
    if (result.ok) {
      passed++;
    } else {
      failed.push({ file, ...result });
    }
  }

  const orphans = detectOrphanSidecars(rootDir, driftSet);

  return { drifts: drifts.length, passed, failed, orphans };
}

// =============================================================================
// Self-test (인라인 단위 검증 — D1 3중 시뮬레이션)
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

  // --- regex 단위 검증 (positive) ---
  const positives = [
    '<!-- HARNESS-DRIFT: Z-PATTERN [https://github.com/coseo12/harness-setting/pull/248] -->',
    '<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->',
    '// HARNESS-DRIFT: Z-PATTERN [TODO]',
    '// HARNESS-DRIFT: Z-PATTERN [https://github.com/coseo12/harness-setting/issues/249]',
    '# HARNESS-DRIFT: Z-PATTERN [TODO]',
    '#!/usr/bin/env node\n// HARNESS-DRIFT: Z-PATTERN [TODO]',
    '<!DOCTYPE html>\n<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->',
    // developer 단계 보완 — YAML frontmatter 1블록 허용 (#556)
    '---\nname: architect\ndescription: "..."\n---\n<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->',
  ];
  positives.forEach((s, i) => {
    expect(`regex positive #${i + 1}`, DECORATOR_REGEX.test(s), JSON.stringify(s.slice(0, 60)));
  });

  // --- regex 단위 검증 (negative) ---
  const negatives = [
    '<!-- HARNESS-DRIFT: WRONG-KEY [TODO] -->', // 키워드 불일치
    '// HARNESS-DRIFT: Z-PATTERN []', // 빈 링크
    '\n<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->', // 첫 줄 빈 줄 (위치 위반)
    '/* HARNESS-DRIFT: Z-PATTERN [TODO] */', // 블록 주석 (미지원 형식)
    'HARNESS-DRIFT: Z-PATTERN [TODO]', // 주석 prefix 누락
  ];
  negatives.forEach((s, i) => {
    expect(`regex negative #${i + 1}`, !DECORATOR_REGEX.test(s), JSON.stringify(s.slice(0, 60)));
  });

  // --- decoratorFormatFor 분기 ---
  expect('format .md', decoratorFormatFor('foo.md') === 'md');
  expect('format .ts', decoratorFormatFor('foo.ts') === 'line-slash');
  expect('format .mjs', decoratorFormatFor('foo.mjs') === 'line-slash');
  expect('format .yml', decoratorFormatFor('foo.yml') === 'line-hash');
  expect('format .sh', decoratorFormatFor('foo.sh') === 'line-hash');
  expect('format .json', decoratorFormatFor('foo.json') === 'json-sidecar');
  expect('format unknown', decoratorFormatFor('foo.bin') === 'unknown');

  // --- 3중 시뮬레이션 (positive → negative → recovery) ---
  const tmp = mkdtempSync(join(tmpdir(), 'harness-drift-test-'));
  try {
    // 가상 manifest 환경 구성
    const harnessDir = join(tmp, '.harness');
    const claudeDir = join(tmp, '.claude');
    writeFileSync(join(tmp, 'mock.md'), '<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\nhello\n');
    writeFileSync(join(tmp, 'mock.json'), '{"k":1}\n');
    writeFileSync(
      join(tmp, 'mock.json.HARNESS-DRIFT.md'),
      '# HARNESS-DRIFT: Z-PATTERN [TODO]\n원 파일: mock.json\n변경 사유: self-test\n',
    );
    // claude dir 도 만들어 orphan 스캔 정상 동작 검증
    mkdirSync(claudeDir, { recursive: true });
    mkdirSync(harnessDir, { recursive: true });

    // 가상 manifest: 둘 다 drift 상태 (expected sha 와 실제 sha 다르게 박제)
    const fakeManifest = {
      files: {
        'mock.md': { sha256: 'a'.repeat(64) }, // 실제 sha 와 불일치 → drift
        'mock.json': { sha256: 'b'.repeat(64) }, // drift
      },
    };
    writeFileSync(join(harnessDir, 'manifest.json'), JSON.stringify(fakeManifest));

    // positive — 데코레이터 박제 정합
    const positive = runVerify(tmp);
    expect(
      'sim positive: drifts=2 passed=2',
      positive.drifts === 2 && positive.passed === 2 && positive.failed.length === 0,
      JSON.stringify(positive),
    );
    expect('sim positive: orphans=0', positive.orphans.length === 0);

    // negative — md 파일 데코레이터 제거
    writeFileSync(join(tmp, 'mock.md'), 'hello\n');
    const negative = runVerify(tmp);
    expect(
      'sim negative: drifts=2 failed>=1',
      negative.drifts === 2 && negative.failed.length === 1,
      JSON.stringify(negative),
    );

    // recovery — 데코레이터 복원
    writeFileSync(join(tmp, 'mock.md'), '<!-- HARNESS-DRIFT: Z-PATTERN [TODO] -->\nhello\n');
    const recovery = runVerify(tmp);
    expect(
      'sim recovery: passed=2 failed=0',
      recovery.drifts === 2 && recovery.passed === 2 && recovery.failed.length === 0,
      JSON.stringify(recovery),
    );

    // orphan sidecar — mock.json 삭제 후 sidecar 잔존
    rmSync(join(tmp, 'mock.json'));
    delete fakeManifest.files['mock.json'];
    writeFileSync(join(harnessDir, 'manifest.json'), JSON.stringify(fakeManifest));
    const orphanScan = runVerify(tmp);
    expect(
      'sim orphan: orphans>=1',
      orphanScan.orphans.length >= 1,
      JSON.stringify(orphanScan.orphans),
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }

  console.log(results.join('\n'));
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}

// =============================================================================
// CLI entrypoint
// =============================================================================

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    process.exit(runSelfTest());
  }

  try {
    const { drifts, passed, failed, orphans } = runVerify('.');
    console.log(`harness drift files: ${drifts}`);
    console.log(`decorator PASS: ${passed}`);
    console.log(`decorator FAIL: ${failed.length}`);
    console.log(`orphan sidecars: ${orphans.length}`);

    if (failed.length > 0) {
      console.error('\n[FAIL] 데코레이터 누락/오류:');
      for (const f of failed) {
        console.error(`  - ${f.file} (${f.format}) — ${f.reason}`);
      }
    }
    if (orphans.length > 0) {
      console.error('\n[FAIL] orphan sidecar:');
      for (const o of orphans) {
        console.error(`  - ${o.sidecar} — ${o.reason}`);
      }
    }

    if (failed.length > 0 || orphans.length > 0) {
      console.error(
        '\n조치: ADR 20260515 §Amendment 8 의 데코레이터 박제 의무 (Phase 1 운영 절차 단계 2) 적용.',
      );
      process.exit(1);
    }
    console.log('\n[OK] 모든 drift 파일에 데코레이터 정합 박제');
    process.exit(0);
  } catch (err) {
    console.error(`ERROR: ${err.message}`);
    process.exit(2);
  }
}

// import 시 자기 실행 회피
if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}

export {
  DECORATOR_REGEX,
  decoratorFormatFor,
  detectDriftFiles,
  verifyDecorator,
  detectOrphanSidecars,
  runVerify,
};
