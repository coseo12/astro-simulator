#!/usr/bin/env node
/**
 * verify-docs-links.mjs
 *
 * #842 — docs 전체 상대 링크 무결성 가드 (fail-fast 복구).
 *
 * 배경: 기존 scripts/verify-docs-links.sh 는 upstream lib/verify-docs-links.js 를
 * exec 했으나 lib 배포 누락으로 로컬 MODULE_NOT_FOUND + CI hashFiles 조건 silent skip
 * (#338 임시 패치) 상태가 지속 — CLAUDE.md "drift 가드는 fail-fast 만" 원칙과 모순.
 * 본 스크립트는 upstream lib 대기 대신 다운스트림 자체 체커로 신설 (Z 패턴 판단 —
 * 이슈 #842 가 허용한 경로). 기존 .sh wrapper 는 본 파일을 exec 하도록 수정.
 *
 * 검사 범위 계약 (이슈 #842 스프린트 계약):
 *   1. 스캔 대상: docs/**\/*.md (docs/deprecated/ 제외 — 아래 계약 참조)
 *      + 저장소 루트 md (README.md / CHANGELOG.md / CLAUDE.md / AGENTS.md 존재 시)
 *   2. 검사 대상 링크: inline 마크다운 링크/이미지 `[..](target)` + reference 정의 `[ref]: target`
 *   3. 제외 (검사 안 함):
 *      - http(s):// / mailto: 외부 URL — 네트워크 비결정성으로 CI 검사 부적합
 *      - 페이지 내 앵커 단독 (#...) — 파일 존재 검사 무의미
 *      - fenced code block / inline code span 내 링크 — 예시/플레이스홀더 텍스트
 *      - footnote 정의 (`[^n]: ...`) — 링크 정의가 아닌 각주 본문
 *      - 템플릿 파일 (docs/templates/** + basename `_` 접두) — `[PR](URL)` 등
 *        placeholder 가 본질이라 링크 검사 무의미
 *   4. `path#anchor` 형식 — 파일 존재만 검사 (앵커 유효성은 범위 밖, 이슈 #842 합의)
 *   5. `file://` 스킴 — FAIL 처리 (개인 절대 경로는 비이식 — 상대 링크로 교체 의무)
 *   6. docs/deprecated/** 내부 문서는 스캔 제외 — 폐기 아카이브는 이관 시점 스냅샷
 *      보존이 목적이라 내부 상대 링크 부패를 허용 (수정이 오히려 아카이브 왜곡).
 *      단, 다른 문서 → deprecated 파일로의 링크는 정상 검사 대상 (파일 존재 검증).
 *   7. ADR `상태:` 표기 단일화 가드 — docs/decisions/*.md 메타데이터에 영문 `Status:`
 *      표기 발견 시 FAIL (한글 `상태:` 로 단일화 — #842 ADR 상태 위생).
 *   8. gitignored 대상 참조 — 파일이 로컬에 존재해도 `git check-ignore` 매칭 시 FAIL.
 *      "로컬 PASS = gitignored 산출물 착시" (#840 클래스) 차단 — CI 체크아웃엔 부재해
 *      로컬 PASS / CI FAIL 비대칭이 생긴다 (PR #872 CI 에서 `.claude/logs/` 참조로 실측).
 *
 * upstream-only 참조 allowlist:
 *   upstream harness-setting 유래 문서가 upstream 저장소 전용 파일 (이 저장소에 미배포)
 *   을 참조하는 건 — 이력 보존 문서라 다운스트림 수정 대상이 아니다 (#907 디커플 이후
 *   신규 등록은 원칙적으로 없음). 명시적 allowlist 로 제외하되 조용한 skip 이 아니라
 *   시작 시 allowlist 건수를 stdout 에 보고한다.
 *
 * 종료 코드:
 *   0 — 깨진 링크 0 + 상태 표기 위반 0
 *   1 — 깨진 링크 또는 상태 표기 위반 발견 (파일:라인 출력)
 *   2 — 실행 에러 (스캔 루트 부재 등)
 *
 * 호출:
 *   node scripts/verify-docs-links.mjs               # 검사 (CI 기본)
 *   node scripts/verify-docs-links.mjs --self-test   # 3중 시뮬 (positive/negative/recovery)
 *   DOCS_LINKS_ROOT=<dir> node scripts/verify-docs-links.mjs  # 스캔 루트 override (self-test 용)
 *
 * 관련: 이슈 #842 / CLAUDE.md §가드 설계 원칙 (fail-fast) / docs/lessons/guard-pr-dod.md
 */
import {
  readFileSync,
  readdirSync,
  statSync,
  existsSync,
  mkdirSync,
  writeFileSync,
  rmSync,
} from 'node:fs';
import { mkdtempSync } from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');

// 저장소 루트에서 함께 스캔할 md 파일 (존재하는 것만)
const ROOT_MD_CANDIDATES = ['README.md', 'CHANGELOG.md', 'CLAUDE.md', 'AGENTS.md'];

// 스캔 제외 디렉토리 (repo-relative) — 계약 6항 (deprecated) + 계약 3항 (템플릿)
const EXCLUDED_SCAN_DIRS = ['docs/deprecated', 'docs/templates'];

/**
 * upstream-only 참조 allowlist (#842).
 * upstream harness-setting 유래 문서가 upstream 저장소 전용 파일 (이 저장소에 미배포)
 * 을 참조하는 건. 다운스트림 수정 대상 아님 (#907 디커플 이후 이력 보존 목적만 잔존).
 * 조용한 skip 이 아님: 등록 건수 + 발동 건수를 매 실행 stdout 에 보고한다.
 * source: 참조가 위치한 문서 (repo-relative) / target: 링크 원문 (참조 표기 그대로)
 *
 * 검증 완결성 계약: (source, target) 쌍이 실제로 발동하지 않으면 (참조가 사라지면)
 * stale 항목이므로 주기 점검 대상 — 발동 0건 항목은 제거 후보로 보고된다.
 */
const UPSTREAM_ONLY_ALLOWLIST = [
  // upstream ADR: gitflow 브랜치 전략 (harness-setting docs/decisions/)
  { source: 'docs/decisions/README.md', target: '20260419-gitflow-main-develop.md' },
  { source: 'docs/decisions/README.md', target: '20260419-release-merge-strategy.md' },
  { source: 'docs/decisions/README.md', target: '20260420-jq-based-parsing-no-op.md' },
  { source: 'docs/deployment-patterns.md', target: 'decisions/20260419-gitflow-main-develop.md' },
  { source: 'docs/deployment-patterns.md', target: 'decisions/20260419-release-merge-strategy.md' },
  {
    source: 'docs/guides/branch-strategy-workflow.md',
    target: '../decisions/20260419-gitflow-main-develop.md',
  },
  {
    source: 'docs/guides/branch-strategy-workflow.md',
    target: '../decisions/20260419-release-merge-strategy.md',
  },
  {
    source: 'docs/guides/release-process.md',
    target: '../decisions/20260419-release-merge-strategy.md',
  },
  // (#962: CLAUDE.md 의 두 gitflow ADR 링크는 A1/A2 가지치기로 제거됨 → 발동 0건 stale 방지를 위해
  //  source: 'CLAUDE.md' entry 2건 삭제. 다른 source 의 동일 target entry 4건은 계속 발동하므로 유지)
  // upstream ADR: jq 파싱 / antigravity 마이그레이션
  // (#907: 삭제된 문서를 source 로 갖던 dead entry 는 제거 — "발동 0건 항목은 제거 후보" 계약)
  {
    source: 'docs/guides/cross-validate-protocol.md',
    target: '../decisions/20260420-jq-based-parsing-no-op.md',
  },
  {
    source: 'docs/guides/cross-validate-protocol.md',
    target: '../decisions/20260521-gemini-to-antigravity.md',
  },
  // upstream lib 경로 (harness-setting 저장소 전용)
  { source: 'docs/guides/claudemd-governance.md', target: '../../lib/claudemd-size-constants.js' },
];

const findAllowlistEntry = (sourceRel, rawTarget) =>
  UPSTREAM_ONLY_ALLOWLIST.find((e) => e.source === sourceRel && e.target === rawTarget);

/** docs/ 하위 md 파일 재귀 수집 (제외 디렉토리 스킵) */
function collectMdFiles(root) {
  const files = [];
  const docsDir = path.join(root, 'docs');
  const walk = (dir) => {
    for (const name of readdirSync(dir)) {
      const full = path.join(dir, name);
      const rel = path.relative(root, full);
      if (EXCLUDED_SCAN_DIRS.some((ex) => rel === ex || rel.startsWith(ex + path.sep))) continue;
      const st = statSync(full);
      if (st.isDirectory()) walk(full);
      // 템플릿 제외 (계약 3항): docs/templates/** 는 디렉토리 단위, `_` 접두는 파일 단위
      else if (name.endsWith('.md') && !name.startsWith('_')) files.push(full);
    }
  };
  if (existsSync(docsDir)) walk(docsDir);
  for (const name of ROOT_MD_CANDIDATES) {
    const full = path.join(root, name);
    if (existsSync(full)) files.push(full);
  }
  return files;
}

/**
 * fenced code block + inline code span 을 공백으로 마스킹 (계약 3항).
 * 라인 수를 보존해 라인 번호 보고가 정확하도록 개행은 유지한다.
 */
function maskCode(content) {
  // fenced block (``` 또는 ~~~) — 개행 보존 마스킹
  let masked = content.replace(/^(```|~~~)[^\n]*\n[\s\S]*?^\1[^\n]*$/gm, (m) =>
    m.replace(/[^\n]/g, ' '),
  );
  // inline code span — 단일 라인 내
  masked = masked.replace(/`[^`\n]*`/g, (m) => ' '.repeat(m.length));
  return masked;
}

/** 마크다운 링크 target 추출 — [{ target, line }] */
function extractLinkTargets(content) {
  const masked = maskCode(content);
  const out = [];
  // inline 링크/이미지: [text](target) / ![alt](target "title")
  const inlineRe = /\[[^\]]*\]\(\s*(<[^>]*>|[^)\s]+)(?:\s+"[^"]*")?\s*\)/g;
  let m;
  while ((m = inlineRe.exec(masked)) !== null) {
    let target = m[1];
    if (target.startsWith('<') && target.endsWith('>')) target = target.slice(1, -1);
    const line = masked.slice(0, m.index).split('\n').length;
    out.push({ target, line });
  }
  // reference 정의: [ref]: target — footnote 정의 ([^n]: ...) 는 제외 (계약 3항)
  const refRe = /^\s*\[(?!\^)[^\]]+\]:\s+(\S+)/gm;
  while ((m = refRe.exec(masked)) !== null) {
    const line = masked.slice(0, m.index).split('\n').length;
    out.push({ target: m[1], line });
  }
  return out;
}

/**
 * 링크 1건 검증. 반환: null (통과/제외) 또는 { reason } (위반)
 */
function checkTarget(root, sourceFile, rawTarget) {
  const target = rawTarget.trim();
  if (target === '' || target.startsWith('#')) return null; // 페이지 내 앵커 (계약 3항)
  const scheme = target.match(/^([a-zA-Z][a-zA-Z0-9+.-]*):/);
  if (scheme) {
    const s = scheme[1].toLowerCase();
    if (s === 'file') return { reason: 'file:// 개인 절대 경로 — 상대 링크로 교체 (계약 5항)' };
    return null; // http/https/mailto 등 외부 스킴 제외 (계약 3항)
  }
  // path#anchor → 파일 존재만 검사 (계약 4항)
  const withoutAnchor = target.split('#')[0];
  if (withoutAnchor === '') return null;
  let decoded;
  try {
    decoded = decodeURIComponent(withoutAnchor);
  } catch {
    decoded = withoutAnchor;
  }
  const resolved = decoded.startsWith('/')
    ? path.join(root, decoded) // repo-root 절대 표기 — GitHub blob 렌더 호환
    : path.resolve(path.dirname(sourceFile), decoded);
  if (!existsSync(resolved)) {
    return { reason: `파일 부재: ${path.relative(root, resolved)}` };
  }
  // 존재 확인된 대상은 gitignored 배치 검사 대상으로 반환 (계약 8항)
  return { resolved };
}

/**
 * gitignored 대상 배치 검사 (계약 8항).
 * 존재 확인된 링크 대상 중 `git check-ignore` 매칭 건을 위반으로 반환.
 * git 실행 실패 (repo 아님 등) 는 fail-fast — 조용한 skip 금지.
 */
function detectGitignoredTargets(root, entries) {
  if (entries.length === 0) return [];
  const relPaths = [...new Set(entries.map((e) => path.relative(root, e.resolved)))];
  const res = spawnSync('git', ['-C', root, 'check-ignore', '--stdin'], {
    input: relPaths.join('\n'),
    encoding: 'utf8',
  });
  // exit 0: 일부 ignored / 1: ignored 없음 / 그 외 (128 등): 실행 에러
  if (res.error || (res.status !== 0 && res.status !== 1)) {
    throw new Error(`git check-ignore 실행 실패 (exit ${res.status}): ${res.stderr || res.error}`);
  }
  const ignored = new Set(res.stdout.split('\n').filter(Boolean));
  return entries.filter((e) => ignored.has(path.relative(root, e.resolved)));
}

/**
 * ADR `상태:` 표기 단일화 가드 (계약 7항).
 * docs/decisions/*.md 에서 영문 `Status:` 메타데이터 라인 발견 시 위반.
 * ("ADR Status 워크플로" 같은 고유명사 언급은 콜론이 없어 매칭되지 않음)
 */
function checkAdrStatusNotation(content) {
  const masked = maskCode(content);
  const violations = [];
  const re = /^\s*(?:[->*]\s+)?\*{0,2}Status\*{0,2}\s*:/gm;
  let m;
  while ((m = re.exec(masked)) !== null) {
    const line = masked.slice(0, m.index).split('\n').length;
    violations.push({ line, reason: '영문 `Status:` 표기 — 한글 `상태:` 로 단일화 (#842)' });
  }
  return violations;
}

/** 메인 검사 실행. 반환: { checked, broken: [{file,line,target,reason}], allowlisted, staleAllowlist } */
function runScan(root) {
  const files = collectMdFiles(root);
  const broken = [];
  const existingTargets = [];
  let checked = 0;
  let allowlisted = 0;
  const activated = new Set();
  for (const file of files) {
    const rel = path.relative(root, file);
    const content = readFileSync(file, 'utf8');
    for (const { target, line } of extractLinkTargets(content)) {
      checked += 1;
      const result = checkTarget(root, file, target);
      if (result?.resolved) {
        existingTargets.push({ file: rel, line, target, resolved: result.resolved });
      } else if (result) {
        const entry = findAllowlistEntry(rel, target);
        if (entry) {
          allowlisted += 1;
          activated.add(entry);
          continue;
        }
        broken.push({ file: rel, line, target, reason: result.reason });
      }
    }
    // ADR 상태 표기 가드 — docs/decisions/ 직속 md 만
    if (rel.startsWith('docs/decisions/') && rel.endsWith('.md')) {
      for (const v of checkAdrStatusNotation(content)) {
        broken.push({ file: rel, line: v.line, target: '(상태 표기)', reason: v.reason });
      }
    }
  }
  // gitignored 대상 배치 검사 (계약 8항) — 로컬/CI 판정 비대칭 차단
  for (const e of detectGitignoredTargets(root, existingTargets)) {
    broken.push({
      file: e.file,
      line: e.line,
      target: e.target,
      reason: `gitignored 산출물 참조 — CI 체크아웃 부재 (계약 8항): ${path.relative(root, e.resolved)}`,
    });
  }
  const staleAllowlist = UPSTREAM_ONLY_ALLOWLIST.filter((e) => !activated.has(e));
  return { fileCount: files.length, checked, broken, allowlisted, staleAllowlist };
}

function main() {
  const root = process.env.DOCS_LINKS_ROOT
    ? path.resolve(process.env.DOCS_LINKS_ROOT)
    : DEFAULT_ROOT;
  if (!existsSync(root)) {
    console.error(`[docs-links] 스캔 루트 부재: ${root}`);
    process.exit(2);
  }
  const { fileCount, checked, broken, allowlisted, staleAllowlist } = runScan(root);
  console.log(
    `[docs-links] 스캔 파일 ${fileCount}개 / 링크 ${checked}건 검사 / upstream-only allowlist ${UPSTREAM_ONLY_ALLOWLIST.length}쌍 등록 (${allowlisted}건 발동)`,
  );
  if (staleAllowlist.length > 0) {
    // stale 항목은 soft-warn — 참조가 사라져 발동하지 않는 항목은 제거 후보 (조용한 skip 방지)
    console.log(
      `[docs-links] WARN — 발동 0건 stale allowlist 항목 ${staleAllowlist.length}쌍 (제거 후보):`,
    );
    for (const e of staleAllowlist) console.log(`  ${e.source} → ${e.target}`);
  }
  if (broken.length > 0) {
    console.error(`\n[docs-links] FAIL — 위반 ${broken.length}건:`);
    for (const b of broken) {
      console.error(`  ${b.file}:${b.line} → ${b.target}\n    ${b.reason}`);
    }
    process.exit(1);
  }
  console.log('[docs-links] PASS — 깨진 링크 0 / 상태 표기 위반 0');
  process.exit(0);
}

// --- --self-test: positive → negative → recovery 3중 시뮬 (가드 도입 PR DoD) ---
function selfTest() {
  let pass = 0;
  let fail = 0;
  const assert = (cond, name) => {
    if (cond) {
      pass += 1;
      console.log(`  ok - ${name}`);
    } else {
      fail += 1;
      console.error(`  FAIL - ${name}`);
    }
  };
  const tmp = mkdtempSync(path.join(tmpdir(), 'docs-links-selftest-'));
  try {
    const docsDir = path.join(tmp, 'docs', 'decisions');
    mkdirSync(docsDir, { recursive: true });
    writeFileSync(path.join(tmp, 'docs', 'target.md'), '# target\n');
    // fixture 를 git repo 로 초기화 — 계약 8항 (gitignored 대상) 검사 경로 활성
    spawnSync('git', ['-C', tmp, 'init', '-q']);
    writeFileSync(path.join(tmp, '.gitignore'), '*.log\n');

    // 1. positive — 유효 상대 링크 + 외부 URL + 앵커 + 코드 블록 내 깨진 링크 (제외 대상)
    const good = [
      '# doc',
      '- 상태: Accepted',
      '[ok](../target.md)',
      '[ok-anchor](../target.md#sec)',
      '[ext](https://example.com/x.md)',
      '[self](#local)',
      '```',
      '[broken-in-code](./nope.md)',
      '```',
      '예시 `[inline-code](./nope2.md)` 텍스트',
      '',
    ].join('\n');
    writeFileSync(path.join(docsDir, 'a.md'), good);
    let r = runScan(tmp);
    assert(r.broken.length === 0, 'positive: 유효 문서 → 위반 0');
    assert(r.checked >= 4, 'positive: 링크 4건 이상 검사됨');

    // 2. negative — 깨진 상대 링크 + file:// + 영문 Status:
    const bad = [
      '# bad',
      '> **Status**: Proposed',
      '[broken](./missing-file.md)',
      '[personal](file:///Users/nobody/x.md)',
      '',
    ].join('\n');
    writeFileSync(path.join(docsDir, 'b.md'), bad);
    r = runScan(tmp);
    const reasons = r.broken.map((b) => `${b.file}:${b.line} ${b.reason}`).join('\n');
    assert(r.broken.length === 3, `negative: 위반 3건 검출 (실측 ${r.broken.length})\n${reasons}`);
    assert(
      r.broken.some(
        (b) => b.file.endsWith('b.md') && b.line === 3 && b.reason.includes('파일 부재'),
      ),
      'negative: 깨진 링크 파일:라인 정확 보고 (b.md:3)',
    );
    assert(
      r.broken.some((b) => b.reason.includes('file://')),
      'negative: file:// 스킴 검출',
    );
    assert(
      r.broken.some((b) => b.reason.includes('Status')),
      'negative: 영문 Status: 표기 검출',
    );

    // 3. recovery — 위반 제거 → PASS 복원
    writeFileSync(
      path.join(docsDir, 'b.md'),
      ['# bad-fixed', '- 상태: Accepted', '[fixed](../target.md)', ''].join('\n'),
    );
    r = runScan(tmp);
    assert(r.broken.length === 0, 'recovery: 수정 후 위반 0 복원');

    // 4. 단위 — repo-root 절대 표기 + 앵커 단독 + deprecated 스캔 제외
    writeFileSync(path.join(docsDir, 'c.md'), '[root-abs](/docs/target.md)\n');
    const depDir = path.join(tmp, 'docs', 'deprecated');
    mkdirSync(depDir, { recursive: true });
    writeFileSync(path.join(depDir, 'old.md'), '[archived-broken](./gone.md)\n');
    r = runScan(tmp);
    assert(r.broken.length === 0, 'unit: repo-root 절대 표기 해석 + deprecated 스캔 제외');

    // 5. 단위 — 고유명사 "ADR Status 워크플로" (콜론 없음) 는 비매칭
    writeFileSync(path.join(docsDir, 'd.md'), 'ADR Status 워크플로 참조. 상태: Accepted\n');
    r = runScan(tmp);
    assert(r.broken.length === 0, 'unit: "ADR Status 워크플로" 고유명사 오탐 없음');

    // 6. 단위 — gitignored 대상 참조 (계약 8항, PR #872 CI 실측 클래스):
    //    존재하지만 .gitignore 매칭 → FAIL / 링크 제거 → recovery PASS
    writeFileSync(path.join(tmp, 'docs', 'local-artifact.log'), 'scratch\n');
    writeFileSync(path.join(docsDir, 'e.md'), '[로그](../local-artifact.log)\n');
    r = runScan(tmp);
    assert(
      r.broken.length === 1 && r.broken[0].reason.includes('gitignored'),
      `unit: gitignored 대상 참조 검출 (실측 ${r.broken.length}건)`,
    );
    writeFileSync(path.join(docsDir, 'e.md'), '로그: `docs/local-artifact.log` (경로 표기)\n');
    r = runScan(tmp);
    assert(r.broken.length === 0, 'unit: gitignored 참조 제거 → recovery PASS');
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

if (process.argv.includes('--self-test')) {
  selfTest();
} else {
  main();
}
