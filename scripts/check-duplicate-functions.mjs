#!/usr/bin/env node
/**
 * P6-E #193 (E4) — 신규 함수 중복 방지 가드.
 *
 * architect ADR (docs/decisions/20260417-duplicate-function-guard.md) 채택:
 *   - (1) D — pre-commit(로컬) + CI 조합, 동일 스크립트 공유
 *   - (2) D — 정규화(camelCase/snake_case) + 토큰 교집합 ≥ 2 (+ stop list)
 *   - (3) B — warn-only (exit 0 + 출력)
 *
 * 사용법:
 *   node scripts/check-duplicate-functions.mjs --staged        # pre-commit
 *   node scripts/check-duplicate-functions.mjs --base origin/main  # CI
 *
 * 환경변수:
 *   DUPLICATE_GUARD_STRICT=1   → 의심 1건이라도 있으면 exit 1 (회귀 테스트 전용)
 *
 * exit:
 *   0  정상 (기본. warn 있어도 exit 0)
 *   1  STRICT=1 이면서 의심 ≥ 1건, 또는 스크립트 내부 에러
 */
import { execSync } from 'node:child_process';

// ───────────────────────────────────────────────────────────────────────
// 상수
// ───────────────────────────────────────────────────────────────────────

/**
 * 토큰 stop-list — 흔한 접두/접미는 공유해도 중복 신호가 아니다.
 * ADR 결정 그대로.
 */
const STOP_TOKENS = new Set([
  'get',
  'set',
  'at',
  'from',
  'to',
  'of',
  'is',
  'has',
  'new',
  'with',
  'and',
  'or',
  'the',
  'a',
  'an',
  'for',
  'on',
  'off',
  'in',
  'out',
  // 단문자/숫자 토큰 (정규화 부산물)
  '',
]);

/**
 * 토큰 교집합 최소 개수 — 2개 이상이 WARN 발동 조건.
 */
const MIN_SHARED_TOKENS = 2;

/**
 * 테스트 헬퍼 중복은 허용 (ADR 비-범위).
 */
const EXCLUDED_PATH_PATTERNS = [
  /\/tests?\//,
  /\.test\.[a-z]+$/,
  /\/pkg(-node|-bundler)?\//,
  /\/target\//,
  /\/node_modules\//,
];

/**
 * 지원 언어. 동일 언어 내에서만 매칭 — Rust pub fn vs TS export function 교차 비교 안 함.
 */
const LANGS = {
  ts: {
    extensions: ['.ts', '.tsx'],
    // `export function foo` / `export async function foo` / `export const foo = ` (화살표 함수)
    // 주의: diff 라인 선두의 '+'를 optional 로 허용 (--staged/--base 모드 공통 처리).
    newFnPatterns: [
      /^\+?\s*export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/,
      /^\+?\s*export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(?:async\s*)?\(/,
    ],
    // 기존 코드베이스 grep 패턴 (git grep 정규식)
    existingFnPatterns: [
      'export[[:space:]]+(async[[:space:]]+)?function[[:space:]]+[A-Za-z_][A-Za-z0-9_]*',
      'export[[:space:]]+const[[:space:]]+[A-Za-z_][A-Za-z0-9_]*[[:space:]]*=[[:space:]]*(async[[:space:]]*)?\\(',
    ],
    // 기존 코드 라인에서 함수 이름 뽑는 JS 정규식
    existingNameExtractors: [
      /export\s+(?:async\s+)?function\s+([A-Za-z_][A-Za-z0-9_]*)/,
      /export\s+const\s+([A-Za-z_][A-Za-z0-9_]*)\s*=/,
    ],
  },
  rs: {
    extensions: ['.rs'],
    newFnPatterns: [/^\+?\s*pub\s+(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/],
    existingFnPatterns: ['pub[[:space:]]+(async[[:space:]]+)?fn[[:space:]]+[A-Za-z_][A-Za-z0-9_]*'],
    existingNameExtractors: [/pub\s+(?:async\s+)?fn\s+([A-Za-z_][A-Za-z0-9_]*)/],
  },
};

// ───────────────────────────────────────────────────────────────────────
// 유틸
// ───────────────────────────────────────────────────────────────────────

/**
 * camelCase / snake_case / PascalCase 를 lower 토큰 배열로 분해.
 * 예:
 *   orbitalStateAt  → [orbital, state, at]
 *   state_vector_at → [state, vector, at]
 *   NBodyEngine     → [n, body, engine]
 */
export function tokenize(name) {
  // snake_case → space, camelCase/PascalCase 경계 → space
  return name
    .replace(/([a-z0-9])([A-Z])/g, '$1 $2')
    .replace(/([A-Z]+)([A-Z][a-z])/g, '$1 $2')
    .replace(/_/g, ' ')
    .toLowerCase()
    .split(/\s+/)
    .filter((t) => t.length > 0);
}

/**
 * stop-list 제거 + 단문자 토큰 제거 후 Set 으로.
 */
export function meaningfulTokens(name) {
  return new Set(tokenize(name).filter((t) => !STOP_TOKENS.has(t) && t.length >= 2));
}

/**
 * 두 함수 이름이 "중복 후보"인가.
 *   - 완전 동명은 항상 true (가장 강한 신호)
 *   - 아니면 meaningful 토큰 교집합 ≥ MIN_SHARED_TOKENS
 */
export function isDuplicateCandidate(nameA, nameB) {
  if (nameA === nameB) {
    return { duplicate: true, sharedTokens: [...meaningfulTokens(nameA)] };
  }
  const a = meaningfulTokens(nameA);
  const b = meaningfulTokens(nameB);
  const shared = [...a].filter((t) => b.has(t));
  return {
    duplicate: shared.length >= MIN_SHARED_TOKENS,
    sharedTokens: shared,
  };
}

/**
 * 경로가 테스트/빌드 산출물로 간주되어 제외되어야 하는가.
 */
function isExcludedPath(p) {
  return EXCLUDED_PATH_PATTERNS.some((re) => re.test(p));
}

function langForPath(p) {
  for (const [name, lang] of Object.entries(LANGS)) {
    if (lang.extensions.some((ext) => p.endsWith(ext))) return { name, lang };
  }
  return null;
}

// ───────────────────────────────────────────────────────────────────────
// 신규 함수 수집 — staged 모드 / diff 모드
// ───────────────────────────────────────────────────────────────────────

/**
 * git diff 출력에서 "추가된 라인(+...)"만 추출.
 * 각 파일별로 {path, addedLines: string[]} 반환.
 */
function collectAddedLines({ staged, base }) {
  const diffArgs = staged
    ? ['diff', '--cached', '--unified=0']
    : ['diff', '--unified=0', `${base}...HEAD`];
  const out = execSync(`git ${diffArgs.map((a) => JSON.stringify(a)).join(' ')}`, {
    encoding: 'utf-8',
    maxBuffer: 64 * 1024 * 1024,
  });
  const files = [];
  let current = null;
  for (const line of out.split('\n')) {
    const fileMatch = /^\+\+\+ b\/(.+)$/.exec(line);
    if (fileMatch) {
      if (current) files.push(current);
      current = { path: fileMatch[1], addedLines: [] };
      continue;
    }
    if (!current) continue;
    if (line.startsWith('+') && !line.startsWith('+++')) {
      current.addedLines.push(line);
    }
  }
  if (current) files.push(current);
  return files;
}

/**
 * 추가 라인에서 신규 함수 이름 추출.
 * 반환: [{ path, lang, name, line }]
 */
function extractNewFunctions(files) {
  const found = [];
  for (const file of files) {
    if (isExcludedPath(file.path)) continue;
    const lang = langForPath(file.path);
    if (!lang) continue;
    for (const raw of file.addedLines) {
      // diff 선두의 '+' 제거 후 패턴 매칭
      for (const pattern of lang.lang.newFnPatterns) {
        const m = pattern.exec(raw);
        if (m) {
          found.push({
            path: file.path,
            lang: lang.name,
            name: m[1],
            line: raw.replace(/^\+/, '').trim(),
          });
          break;
        }
      }
    }
  }
  return found;
}

// ───────────────────────────────────────────────────────────────────────
// 기존 코드베이스 함수 목록 수집 (git ls-files 기반)
// ───────────────────────────────────────────────────────────────────────

/**
 * 동일 언어의 기존 함수 목록을 git grep 으로 수집.
 * 반환: [{ path, name, line }]
 */
function collectExistingFunctions(langName) {
  const lang = LANGS[langName];
  const results = [];
  for (const pattern of lang.existingFnPatterns) {
    // git grep -n -E 'pattern' -- '*.ts' '*.tsx' …
    const pathspecs = lang.extensions.map((ext) => `'*${ext}'`).join(' ');
    let out = '';
    try {
      out = execSync(`git grep -n -E ${JSON.stringify(pattern)} -- ${pathspecs}`, {
        encoding: 'utf-8',
        maxBuffer: 64 * 1024 * 1024,
      });
    } catch (e) {
      // grep 매치 없음 (exit 1)은 정상.
      if (e.status === 1) continue;
      throw e;
    }
    for (const row of out.split('\n')) {
      if (!row) continue;
      const m = /^([^:]+):(\d+):(.*)$/.exec(row);
      if (!m) continue;
      const [, path, lineNo, body] = m;
      if (isExcludedPath(path)) continue;
      for (const extractor of lang.existingNameExtractors) {
        const nameM = extractor.exec(body);
        if (nameM) {
          results.push({ path, name: nameM[1], line: body.trim(), lineNo: Number(lineNo) });
          break;
        }
      }
    }
  }
  return results;
}

// ───────────────────────────────────────────────────────────────────────
// 메인
// ───────────────────────────────────────────────────────────────────────

/**
 * @param {object} opts
 * @param {boolean} [opts.staged]   pre-commit 모드
 * @param {string}  [opts.base]     diff 모드 base (e.g. 'origin/main')
 * @param {boolean} [opts.silent]   테스트 시 출력 억제
 * @returns {{ warnings: Array, stdout: string }}
 */
export function runGuard(opts = {}) {
  const mode = opts.staged ? 'staged' : `base=${opts.base ?? 'origin/main'}`;
  const lines = [];
  const push = (s) => lines.push(s);

  const files = collectAddedLines({ staged: !!opts.staged, base: opts.base ?? 'origin/main' });
  const newFns = extractNewFunctions(files);

  if (newFns.length === 0) {
    push(`[duplicate-function-guard] (${mode}) 신규 함수 없음 — 통과`);
    return finalize({ warnings: [], lines, silent: opts.silent });
  }

  // 언어별로 기존 함수 캐시.
  const existingByLang = {};
  for (const langName of Object.keys(LANGS)) {
    existingByLang[langName] = null;
  }

  const warnings = [];
  for (const nf of newFns) {
    if (existingByLang[nf.lang] === null) {
      existingByLang[nf.lang] = collectExistingFunctions(nf.lang);
    }
    const existing = existingByLang[nf.lang];
    for (const ex of existing) {
      // 자기 자신(같은 파일·같은 이름) 제외
      if (ex.path === nf.path && ex.name === nf.name) continue;
      const { duplicate, sharedTokens } = isDuplicateCandidate(nf.name, ex.name);
      if (!duplicate) continue;
      warnings.push({
        newPath: nf.path,
        newName: nf.name,
        newLine: nf.line,
        existingPath: ex.path,
        existingName: ex.name,
        existingLine: ex.line,
        existingLineNo: ex.lineNo,
        sharedTokens,
      });
    }
  }

  if (warnings.length === 0) {
    push(`[duplicate-function-guard] (${mode}) 신규 함수 ${newFns.length}건 검사 — 중복 후보 없음`);
  } else {
    push(
      `[duplicate-function-guard] (${mode}) WARN — 신규 함수가 기존과 유사합니다 (${warnings.length}건):`,
    );
    for (const w of warnings) {
      push(`  신규: ${w.newPath}  ${w.newName}`);
      push(`    ${w.newLine}`);
      push(`  기존: ${w.existingPath}:${w.existingLineNo ?? '?'}  ${w.existingName}`);
      push(`    ${w.existingLine}`);
      push(`  공유 토큰: {${w.sharedTokens.join(', ')}}`);
      push(`  → 기존 함수를 재사용하거나 의도적 신규임을 PR 본문에 명시하세요.`);
      push('');
    }
  }

  return finalize({ warnings, lines, silent: opts.silent });
}

function finalize({ warnings, lines, silent }) {
  const stdout = lines.join('\n');
  if (!silent) {
    process.stdout.write(stdout + '\n');
  }
  return { warnings, stdout };
}

// ───────────────────────────────────────────────────────────────────────
// CLI 진입점
// ───────────────────────────────────────────────────────────────────────
function parseArgs(argv) {
  const args = { staged: false, base: 'origin/main' };
  for (let i = 0; i < argv.length; i += 1) {
    const a = argv[i];
    if (a === '--staged') args.staged = true;
    else if (a === '--base') {
      args.base = argv[i + 1];
      i += 1;
    }
  }
  return args;
}

// import.meta.url === main 감지 — Node 20+ 호환 (직접 실행 시에만 CLI 동작)
const isMain = (() => {
  try {
    const mainPath = process.argv[1] && new URL(`file://${process.argv[1]}`).href;
    return mainPath && import.meta.url === mainPath;
  } catch {
    return false;
  }
})();

if (isMain) {
  const args = parseArgs(process.argv.slice(2));
  try {
    const { warnings } = runGuard(args);
    // warn-only 정책 — 기본 exit 0. STRICT 는 회귀 테스트 전용.
    if (process.env.DUPLICATE_GUARD_STRICT === '1' && warnings.length > 0) {
      process.exit(1);
    }
    process.exit(0);
  } catch (e) {
    console.error('[duplicate-function-guard] 내부 에러:', e.message);
    process.exit(1);
  }
}
