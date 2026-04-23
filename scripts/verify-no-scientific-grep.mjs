#!/usr/bin/env node
/**
 * P12-C #298 — 단일 모드 전환 회귀 가드 (R1 DoD).
 *
 * 목적: `packages/` + `apps/` 범위 내 **활성 코드 경로** 에서 `scientific` 식별자 / 리터럴
 *       재도입을 차단한다. 주석(역사 맥락) 과 `docs/` (ADR/원칙/회고) 는 의도적으로 허용.
 *
 * 규칙:
 *   - 스캔 대상: `packages/**`, `apps/**` 의 `.ts` / `.tsx` / `.js` / `.jsx` / `.mjs`
 *   - **단일 라인 주석 `//` 로 시작하는 라인은 스킵** (역사 맥락 유지)
 *   - **JSDoc / 블록 주석 `/* ... *\/` 내부 라인도 스킵** — 단순 구현: 라인 앞이 ` *` 로 시작하면 스킵
 *   - 대소문자 구분 (Scientific / SCIENTIFIC 등 대문자 변형도 히트)
 *   - 1건이라도 발견되면 exit 1 + 파일·라인·컨텍스트 출력
 *
 * 왜 주석을 허용하는가:
 *   - P10 시절 scientific 모드의 float32 jitter 가 왜 해결되었는지 추적 가능해야 함
 *     (ADR §주석 계약 원칙의 반대가 아니라, 삭제 맥락을 박제하는 용도)
 *   - 역사 주석은 `"과거 scientific 모드"`, `"P12-C #298 이전"` 등 명시적으로 삭제 사실을 표기
 *   - 활성 식별자 / 문자열 리터럴 / UI 텍스트는 주석 외에 위치하므로 본 스크립트가 감지 가능
 *
 * ## 한계 (cross-validate Gemini 지적 수용, 2026-04-23)
 *
 * 본 스크립트는 **텍스트 단위 token matching** 기반이므로 다음 edge case 에서 false positive /
 * false negative 가 발생할 수 있다:
 *
 *   1. 템플릿 리터럴 내 `/*` 토큰 — 현재 구현은 블록 주석으로 오인 가능
 *   2. 문자열 리터럴 (single/double/backtick) 내부의 `//` — 현재 구현은 인라인 주석으로 오인
 *   3. 문자열 리터럴 내부의 `"scientific"` — 현재 구현은 주석 외부로 판단해 hit 으로 계산
 *   4. JSX / TSX 속성값 내부의 특수 케이스
 *
 * 현 저장소에서는 위 edge case 가 현재 0건 (실측 157 파일 hit 0). 향후 AST 기반 ESLint
 * 커스텀 규칙으로 전환하면 정확성 ↑ — 후속 이슈 [#308] 로 분리.
 *
 * 사용:
 *   node scripts/verify-no-scientific-grep.mjs
 *
 * CI:
 *   `detect-and-test` 잡의 web/core 테스트 후 실행 예정 (ci.yml "R1 회귀 가드" step).
 */

import { readdirSync, readFileSync, statSync } from 'node:fs';
import { join } from 'node:path';

const ROOTS = ['packages', 'apps'];
const EXTENSIONS = new Set(['.ts', '.tsx', '.js', '.jsx', '.mjs']);
const SKIP_DIRS = new Set([
  'node_modules',
  '.next',
  'dist',
  'build',
  'out',
  'coverage',
  '.turbo',
  '.cache',
]);

/** 단일 파일 검사. `scientific` 식별자 / 리터럴 가 활성 코드 라인에 있으면 위반 목록에 추가. */
function scanFile(path) {
  const content = readFileSync(path, 'utf8');
  const lines = content.split(/\r?\n/);
  const violations = [];
  let inBlockComment = false;
  for (let i = 0; i < lines.length; i += 1) {
    const raw = lines[i];
    const trimmed = raw.trim();

    // 블록 주석 진입/유지/종료 — 단순 토큰 매칭 (템플릿 리터럴 내 `/*` 는 무시. 본 저장소 코드에선 이슈 없음).
    if (inBlockComment) {
      if (/\*\//.test(trimmed)) {
        inBlockComment = false;
      }
      continue;
    }
    if (/^\/\*/.test(trimmed)) {
      // 한 줄 블록 주석 `/* ... */` 전체 건너뛰기
      if (!/\*\//.test(trimmed)) {
        inBlockComment = true;
      }
      continue;
    }

    // 단일 라인 주석 전체
    if (/^\s*\/\//.test(raw)) continue;
    // JSDoc 내부 (라인 앞 ` *` 또는 `*`)
    if (/^\s*\*/.test(raw)) continue;

    // 라인 코드 부분만 분리 — 인라인 주석 (`code; // comment`) 의 코드 부분은 `scientific` 가 있으면 hit.
    // 인라인 주석 이후 부분은 잘라낸다. 문자열 리터럴 안의 `//` 는 현재 저장소에서 발생 안 함 (단순화).
    const inlineCommentIdx = raw.indexOf('//');
    const codePart = inlineCommentIdx >= 0 ? raw.slice(0, inlineCommentIdx) : raw;
    if (/scientific/i.test(codePart)) {
      violations.push({
        line: i + 1,
        text: raw.trimEnd(),
      });
    }
  }
  return violations;
}

/** 디렉토리 재귀 수집. `.ts/.tsx/.js/.jsx/.mjs` 만 반환. */
function walk(dir, out = []) {
  let entries;
  try {
    entries = readdirSync(dir);
  } catch {
    return out;
  }
  for (const name of entries) {
    if (SKIP_DIRS.has(name)) continue;
    const full = join(dir, name);
    let st;
    try {
      st = statSync(full);
    } catch {
      continue;
    }
    if (st.isDirectory()) {
      walk(full, out);
    } else if (st.isFile()) {
      // 확장자 매칭
      const dot = name.lastIndexOf('.');
      if (dot < 0) continue;
      const ext = name.slice(dot);
      if (EXTENSIONS.has(ext)) out.push(full);
    }
  }
  return out;
}

function main() {
  const files = [];
  for (const root of ROOTS) {
    walk(root, files);
  }
  let totalViolations = 0;
  const report = [];
  for (const file of files) {
    const v = scanFile(file);
    if (v.length > 0) {
      totalViolations += v.length;
      report.push({ file, hits: v });
    }
  }
  if (totalViolations === 0) {
    process.stdout.write(
      `[verify-no-scientific-grep] PASS — ${files.length} 파일 스캔, 활성 코드 hit 0 건.\n`,
    );
    return 0;
  }
  process.stderr.write(
    `[verify-no-scientific-grep] FAIL — 활성 코드 라인에 \`scientific\` ${totalViolations} 건 발견:\n\n`,
  );
  for (const { file, hits } of report) {
    process.stderr.write(`  ${file}\n`);
    for (const { line, text } of hits) {
      process.stderr.write(`    L${line}: ${text}\n`);
    }
    process.stderr.write('\n');
  }
  process.stderr.write(
    '힌트: 주석(//, /* */, JSDoc) 은 허용됩니다. 식별자/리터럴 사용이면 제거해주세요.\n' +
      '     ADR `docs/decisions/20260423-display-relative-scale-unification.md` §Amendment 참조.\n',
  );
  return 1;
}

process.exit(main());
