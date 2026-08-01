#!/usr/bin/env node
/**
 * #915 — CI diff-scope 분류기 (docs-only 판별 SSoT).
 *
 * ci.yml / ci-physics-wasm.yml 의 `diff-scope` 선행 job 이 변경 파일 목록을 넘기면
 * docs-only 여부를 분류해 GITHUB_OUTPUT 으로 반환한다. 무거운 job (빌드 + 브라우저 가드 /
 * Rust + vitest) 은 `code_changed == 'true'` 일 때만 실행된다.
 *
 * 분류 계약 (#915 PR-1 범위 1 — 경계 명시):
 *   docs = `docs/**` ∪ `*.md` (경로 무관 .md 전부) ∪ `.claude/**`
 *   code = 그 외 전부 (fail-safe 기본값 — 미지 확장자/경로는 코드 취급)
 *   경계: `scripts/**` · `.github/**` 은 **검증 인프라 자체 변경** 이므로 항상 코드 취급.
 *         (docs 패턴보다 우선 — 예: `.github/workflows/README.md` 도 코드로 분류)
 *
 * fail-safe 원칙 (CLAUDE.md §가드 설계 원칙 정합): 판별이 불확실하면 (빈 목록 / 미지 파일)
 * 항상 code_changed=true → 전 가드 실행. 스킵 방향으로 조용히 기우는 분기 없음.
 *
 * 사용법:
 *   node scripts/ci-diff-scope.mjs --files-from <path>   # 개행 구분 파일 목록 분류
 *   node scripts/ci-diff-scope.mjs --self-test           # 결정적 자기 검증 (CI 사용 직전 실행)
 *
 * 출력 (GITHUB_OUTPUT 존재 시 append + stdout 로그):
 *   code_changed      — docs-only 가 아니면 true (빈 목록도 true — fail-safe)
 *   app_code_changed  — apps/** | packages/** | scripts/** 변경 존재 (CHANGELOG soft-warn 용)
 *   changelog_touched — 루트 CHANGELOG.md 포함 여부
 */

import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

/** 검증 인프라 경로 — docs 패턴보다 우선하는 코드 취급 (#915 경계 계약). */
const INFRA_PREFIXES = ['scripts/', '.github/'];

/** docs 분류 패턴 — 접두사 또는 확장자. */
const DOCS_PREFIXES = ['docs/', '.claude/'];

/** CHANGELOG soft-warn 의 "코드 변경" 범위 (#915 범위 5 계약). */
const APP_CODE_PREFIXES = ['apps/', 'packages/', 'scripts/'];

/** 단일 파일 분류: true = docs, false = code. */
export function isDocsFile(file) {
  // 경계 우선 규칙: 검증 인프라 (scripts/, .github/) 는 .md 여도 코드 취급
  if (INFRA_PREFIXES.some((p) => file.startsWith(p))) return false;
  if (DOCS_PREFIXES.some((p) => file.startsWith(p))) return true;
  if (file.endsWith('.md')) return true;
  // fail-safe 기본값: 미지 경로/확장자 = 코드
  return false;
}

/**
 * 파일 목록 → 분류 결과.
 * 빈 목록은 판별 불능 (force-push / before 미해석 등) 으로 보고 code_changed=true (fail-safe).
 */
export function classify(files) {
  const list = files.map((f) => f.trim()).filter(Boolean);
  const codeFiles = list.filter((f) => !isDocsFile(f));
  const emptyList = list.length === 0;
  return {
    code_changed: emptyList || codeFiles.length > 0,
    app_code_changed: list.some((f) => APP_CODE_PREFIXES.some((p) => f.startsWith(p))),
    changelog_touched: list.includes('CHANGELOG.md'),
    codeFiles,
    emptyList,
  };
}

function writeOutputs(result) {
  const lines = [
    `code_changed=${result.code_changed}`,
    `app_code_changed=${result.app_code_changed}`,
    `changelog_touched=${result.changelog_touched}`,
  ];
  for (const line of lines) console.log(`[ci-diff-scope] ${line}`);
  if (result.emptyList) {
    console.log('[ci-diff-scope] 변경 목록 비어 있음 — fail-safe: 전체 코드 취급 (전 가드 실행)');
  } else if (result.code_changed) {
    console.log(
      `[ci-diff-scope] 코드 분류 파일 ${result.codeFiles.length}건 (선두 5): ${result.codeFiles.slice(0, 5).join(', ')}`,
    );
  } else {
    console.log('[ci-diff-scope] docs-only — 무거운 job 스킵 대상 (가드 약화 아님: 코드 경로 0)');
  }
  if (process.env.GITHUB_OUTPUT) {
    fs.appendFileSync(process.env.GITHUB_OUTPUT, lines.join('\n') + '\n');
  }
}

/** 결정적 자기 검증 — CI 에서 분류 사용 직전 실행 (#897 교훈: CI 미배선 self-test = 0회 실행). */
function selfTest() {
  const cases = [
    // [설명, 입력, code, app_code, changelog]
    [
      'docs-only (docs/ + 루트 md + .claude md)',
      ['docs/a.md', 'README.md', '.claude/agents/qa.md'],
      false,
      false,
      false,
    ],
    ['docs-only (.claude 비-md — settings.json)', ['.claude/settings.json'], false, false, false],
    ['docs-only (하위 md — apps 내부 README)', ['apps/web/README.md'], false, true, false],
    ['CHANGELOG 단독 (md 이므로 docs)', ['CHANGELOG.md'], false, false, true],
    ['code (apps ts)', ['apps/web/src/x.ts'], true, true, false],
    ['code (packages)', ['packages/core/src/y.ts'], true, true, false],
    ['경계: scripts/** 는 코드 (#915 계약)', ['scripts/verify-x.mjs'], true, true, false],
    ['경계: scripts/** 하위 md 도 코드 (인프라 우선)', ['scripts/README.md'], true, true, false],
    ['경계: .github/** 는 코드 (#915 계약)', ['.github/workflows/ci.yml'], true, false, false],
    ['혼합 (docs + code) → code', ['docs/a.md', 'packages/core/src/y.ts'], true, true, false],
    [
      '혼합 (code + CHANGELOG) → code + changelog',
      ['apps/web/src/x.ts', 'CHANGELOG.md'],
      true,
      true,
      true,
    ],
    ['빈 목록 → fail-safe code', [], true, false, false],
    ['공백/개행 노이즈 → fail-safe code', ['  ', ''], true, false, false],
    ['미지 루트 파일 → fail-safe code', ['.node-version'], true, false, false],
  ];
  for (const [desc, input, code, appCode, changelog] of cases) {
    const r = classify(input);
    assert.equal(
      r.code_changed,
      code,
      `${desc}: code_changed 기대 ${code}, 실제 ${r.code_changed}`,
    );
    assert.equal(
      r.app_code_changed,
      appCode,
      `${desc}: app_code_changed 기대 ${appCode}, 실제 ${r.app_code_changed}`,
    );
    assert.equal(
      r.changelog_touched,
      changelog,
      `${desc}: changelog_touched 기대 ${changelog}, 실제 ${r.changelog_touched}`,
    );
  }
  console.log(`[ci-diff-scope] self-test PASS — ${cases.length} cases`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    return;
  }
  const fromIdx = args.indexOf('--files-from');
  if (fromIdx === -1 || !args[fromIdx + 1]) {
    console.error('사용법: ci-diff-scope.mjs --files-from <path> | --self-test');
    process.exit(2);
  }
  const files = fs.readFileSync(args[fromIdx + 1], 'utf8').split('\n');
  writeOutputs(classify(files));
}

// 직접 실행 시에만 main (테스트에서 import 가능하도록).
// 주의: `file://${argv[1]}` 문자열 비교는 symlink 경로 (macOS /tmp 등) 에서 조용히 불일치
// → main 미실행 silent no-op (#840 클래스). realpath 기반 URL 비교로 결정적 판별.
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main();
}
