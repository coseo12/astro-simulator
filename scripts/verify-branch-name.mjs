#!/usr/bin/env node
/**
 * verify-branch-name.mjs
 *
 * #962 축 B — 브랜치명 규약의 **기계 SSoT**.
 *
 * 배경: #942 가 브랜치 접두사 규약을 `<type>/<이슈번호>-<설명>` 으로 일반화했으나
 * 강제 수단이 0 이었고, type 열거는 산문 3곳에 **축자 복제**돼 있었다 (정본 부재).
 * 본 스크립트의 상수가 정본이고, 산문 3곳은 `--verify-ssot` 가 검증하는 **파생**이다.
 * 사본 수는 4 로 같지만 "검증되지 않은 사본" 이 3 → 0 이 된다.
 *
 * 계약 SSoT: docs/decisions/20260806-962-branch-name-guard.md §5
 *
 * 네 소비처 (하나의 스크립트):
 *   --branch <name>          → CI 런타임 검사 (.github/workflows/branch-name-guard.yml)
 *   --verify-ssot            → 산문 3곳 + workflow `branch:` 리터럴 대조 (project-guards.yml)
 *   --self-test              → 격리 픽스처 매트릭스 (project-guards.yml)
 *   --check-corpus <json>    → 머지 PR head 전수 실측 (1회성 증거. CI 미배선 — 네트워크 의존)
 *   (인자 없음)               → 로컬 pre-flight (developer / create-pr 스킬, push 전)
 *
 * 종료 코드:
 *   0 — PASS
 *   1 — 규약 위반 (FAIL)
 *   2 — 실행 에러 (git 부재 / 대상 파일 부재 / 인자 오류)
 *   3 — detached HEAD (판정 불가 — **규약 위반 아님**. ADR §5-4 / cross-validate 이견 (a-2))
 *
 * fail-fast 계약 (CLAUDE.md §가드 설계 원칙): locator 미발견·대상 파일 부재는
 * silent pass 로 흡수하지 않고 즉시 exit 한다. fallback 분기 금지.
 *
 * 관련: 이슈 #962 / #942 / docs/lessons/guard-pr-dod.md (4축) /
 *       docs/lessons/guard-design-principles.md (measurement-first / fail-fast)
 */
import {
  readFileSync,
  existsSync,
  readdirSync,
  realpathSync,
  mkdtempSync,
  symlinkSync,
  rmSync,
} from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath, pathToFileURL } from 'node:url';
import { spawnSync } from 'node:child_process';
import process from 'node:process';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), '..');

// =============================================================================
// SSoT 상수 — **정본**. 산문 3곳(§--verify-ssot 대상)이 이것의 파생이다.
// 커밋 컨벤션 type 이 추가·제거되면 여기 1곳만 고치고, --verify-ssot 가 산문을 강제한다.
// =============================================================================

/** `<type>/<이슈번호>-<설명>` 의 type 열거 (커밋 컨벤션 type 과 동일) */
export const BRANCH_TYPES = ['feature', 'fix', 'refactor', 'chore', 'docs', 'test'];

/** prod 긴급 패치 전용. 실사용 0건이나 CLAUDE.md §브랜치 전략 표의 규약이므로 포함 (규약 우선) */
export const HOTFIX_TYPE = 'hotfix';

/** PR head 로 허용되는 gitflow 브랜치 — release PR(head=develop) / merge-back(head=main) */
export const GITFLOW_HEADS = ['develop', 'main'];

/**
 * 봇이 생성하는 브랜치 패턴 (`chore/<pattern>-<run_id>`).
 * CI run 이 만드는 브랜치라 이슈번호가 **구조적으로 존재할 수 없다**.
 * `github.actor != 'github-actions[bot]'` 통째 스킵을 쓰지 않는 이유: 그것은 한 클래스
 * 전체의 silent skip 이라 3번째 봇 workflow 가 임의 브랜치명을 써도 아무도 모른다.
 * 패턴을 명시하면 신규 패턴 등장 시 --verify-ssot 가 FAIL 하며 의식적 갱신을 강제한다.
 */
export const BOT_BRANCH_PATTERNS = ['r1-baseline-linux', 'baseline-remeasure'];

// =============================================================================
// 허용 집합 정규식 — 전부 위 상수에서 파생 (인라인 축자 사본 금지)
// =============================================================================

const ALL_TYPES = [...BRANCH_TYPES, HOTFIX_TYPE];

/** ^(develop|main)$ */
const RE_GITFLOW = new RegExp(`^(?:${GITFLOW_HEADS.join('|')})$`);

/** ^(feature|fix|refactor|chore|docs|test|hotfix)/[0-9]+-[a-z0-9][a-z0-9._-]*$ */
const RE_WORK = new RegExp(`^(?:${ALL_TYPES.join('|')})/[0-9]+-[a-z0-9][a-z0-9._-]*$`);

/** ^release/v?[0-9]+\.[0-9]+\.[0-9]+-prep$  ( `v?` 는 실측된 표기 진동 수용 — ADR §2-3 ) */
const RE_RELEASE = /^release\/v?[0-9]+\.[0-9]+\.[0-9]+-prep$/;

/** ^chore/(r1-baseline-linux|baseline-remeasure)-[0-9]+$ */
const RE_BOT = new RegExp(`^chore/(?:${BOT_BRANCH_PATTERNS.join('|')})-[0-9]+$`);

const RULES = [
  { name: 'gitflow', re: RE_GITFLOW },
  { name: 'work', re: RE_WORK },
  { name: 'release', re: RE_RELEASE },
  { name: 'bot', re: RE_BOT },
];

/**
 * 브랜치명 판정. 순수 함수 — I/O 없음.
 * @param {string} name
 * @returns {{ok: boolean, rule: string|null}}
 */
export function classifyBranch(name) {
  if (typeof name !== 'string' || name.length === 0) return { ok: false, rule: null };
  for (const { name: rule, re } of RULES) {
    if (re.test(name)) return { ok: true, rule };
  }
  return { ok: false, rule: null };
}

/** CI 어노테이션 / 로컬 출력 공통 — 허용 집합 요약 (에러 메시지에 규약을 노출) */
function allowSummary() {
  return [
    `허용 집합 (정본: scripts/verify-branch-name.mjs):`,
    `  1. gitflow  : ${GITFLOW_HEADS.join(' | ')}                (release PR / merge-back 의 head)`,
    `  2. 일상 개발 : <type>/<이슈번호>-<설명>   type = ${ALL_TYPES.join(' | ')}`,
    `                 이슈번호 필수 / 설명 필수 / 소문자 전용 / 슬래시 1개`,
    `  3. 릴리스   : release/v?X.Y.Z-prep        (예: release/0.60.0-prep, release/v0.53.0-prep)`,
    `  4. 봇       : chore/(${BOT_BRANCH_PATTERNS.join('|')})-<run_id>`,
    ``,
    `주의: 커밋 type 은 'feat' 이지만 브랜치 type 은 'feature' 다 (#942).`,
    `상세: docs/guides/branch-strategy-workflow.md §브랜치명 가드`,
  ].join('\n');
}

// =============================================================================
// --branch <name> — CI 런타임 검사
// =============================================================================

function runBranchCheck(name) {
  const { ok, rule } = classifyBranch(name);
  if (ok) {
    console.log(`[PASS] 브랜치명 '${name}' — 규약 적합 (rule: ${rule})`);
    return 0;
  }
  const detail = allowSummary();
  // GitHub Actions 어노테이션 — 멀티라인은 %0A 로 인코딩해야 한 줄로 접히지 않는다.
  const encoded = `브랜치명 '${name}' 이 규약 위반입니다.\n\n${detail}`.replace(/\n/g, '%0A');
  console.log(`::error title=브랜치명 규약 위반 (#962)::${encoded}`);
  console.error(`[FAIL] 브랜치명 '${name}' 이 규약 위반입니다.\n\n${detail}`);
  console.error(
    `\n교정: 브랜치명은 PR 생성 후 변경 불가입니다. 규약에 맞는 브랜치를 새로 만들고 PR 을 재생성하세요.\n` +
      `      push 전 'node scripts/verify-branch-name.mjs' 로 미리 확인하면 이 비용이 들지 않습니다.`,
  );
  return 1;
}

// =============================================================================
// (인자 없음) — 로컬 pre-flight
// =============================================================================

function runPreflight() {
  const r = spawnSync('git', ['rev-parse', '--abbrev-ref', 'HEAD'], {
    cwd: ROOT,
    encoding: 'utf8',
  });
  if (r.error || r.status !== 0) {
    console.error(`[ERROR] git rev-parse 실패 — git 저장소가 아니거나 git 이 없습니다.`);
    if (r.stderr) console.error(r.stderr.trim());
    return 2;
  }
  const branch = r.stdout.trim();

  // detached HEAD 전용 처리 (ADR §5-4 / cross-validate 이견 (a-2)).
  // `git rev-parse --abbrev-ref HEAD` 는 detached 상태에서 리터럴 'HEAD' 를 반환한다.
  // 이를 브랜치명으로 검사하면 "규약 위반" 이라는 **오도하는 실패**가 난다.
  // 격리 worktree sub-agent 가 특정 커밋을 체크아웃하는 실제 경로가 있어 구분이 필요하다.
  if (branch === 'HEAD') {
    console.log(
      `[SKIP] detached HEAD — 검사할 브랜치명이 없습니다 (**규약 위반 아님**, exit 3).\n` +
        `       브랜치를 체크아웃한 뒤 다시 실행하세요: git switch -c <type>/<이슈번호>-<설명>`,
    );
    return 3;
  }
  return runBranchCheck(branch);
}

// =============================================================================
// --verify-ssot — 산문 3곳 + workflow `branch:` 리터럴 대조
// =============================================================================

/**
 * 산문 SSoT 사본의 위치 계약 (ADR §5-4 추출 계약 1단계).
 * locator 는 **고정 문자열**. 미발견 = 즉시 FAIL (fallback 없음).
 */
const PROSE_SOURCES = [
  { path: '.github/PULL_REQUEST_TEMPLATE.md', locator: 'type = 커밋 컨벤션 type —' },
  { path: '.claude/skills/create-pr/SKILL.md', locator: 'type = 커밋 컨벤션 type —' },
  { path: '.claude/agents/developer.md', locator: 'type 은 커밋 컨벤션 type 과 동일' },
];

/**
 * 열거 구간 파서 (ADR §5-4 추출 계약 2단계 — **D1 실측 정정분 반영**).
 *
 * 원안은 "해당 라인에서 백틱 인용 토큰만 추출" 이었으나, D1 실측 (2026-08-06) 결과
 * **라인 전체** 백틱 토큰을 취하면 규약과 무관한 잉여 토큰이 유입돼 3파일 전부에서
 * 양방향 대조가 **상시 false-fire** 한다:
 *   - PULL_REQUEST_TEMPLATE.md : `base=develop`, `head=<type>/*`      (+2)
 *   - create-pr/SKILL.md       : `develop`, `<type>/*`, `--squash`    (+3)
 *   - developer.md             : `develop`, `<type>/<이슈번호>-<설명>` (+2)
 *
 * 정정: 추출 범위를 **locator 이후의 열거 구간**으로 한정한다. 열거는
 * `` `type` `` + 선택적 `(alias)` + ` / ` 반복이라는 고정 구조를 가지므로, 그 구조의
 * **최장 선두 run** 만 소비하면 잉여 토큰이 구조적으로 배제된다.
 *
 * 원안의 의도(백틱 범위 한정이 `feat` 를 배제)는 실측으로 **확인됨** — 3파일 전부
 * 산문 표기가 `` `feature`(feat) `` 라 `feat` 는 백틱 밖이다. 그 부분은 원안 그대로다.
 * (3중 박제: 본 주석 / project-guards.yml step 주석 / ADR §5-4)
 */
const ENUM_RE = /^[^`\n]*`([a-z]+)`(?:\([a-z]+\))?(?:\s*\/\s*`[a-z]+`(?:\([a-z]+\))?)*/;

function extractProseTypes(filePath, locator) {
  const abs = resolve(ROOT, filePath);
  if (!existsSync(abs)) {
    return { error: `대상 파일 부재: ${filePath}` };
  }
  const lines = readFileSync(abs, 'utf8').split('\n');
  const idx = lines.findIndex((l) => l.includes(locator));
  if (idx === -1) {
    return {
      error:
        `locator 미발견: ${filePath} 에 고정 문자열 "${locator}" 가 없습니다.\n` +
        `         산문을 고쳤다면 본 스크립트의 PROSE_SOURCES locator 도 함께 갱신해야 합니다.`,
    };
  }
  const line = lines[idx];
  const after = line.slice(line.indexOf(locator) + locator.length);
  const m = after.match(ENUM_RE);
  if (!m) {
    return {
      error: `열거 구간 파싱 실패: ${filePath}:${idx + 1} — locator 뒤에 \`type\` / \`type\` 형태의 열거가 없습니다.`,
    };
  }
  const tokens = [...m[0].matchAll(/`([^`]+)`/g)].map((x) => x[1]);
  return { line: idx + 1, tokens };
}

/** workflow YAML 의 `branch:` 리터럴 수집 (peter-evans/create-pull-request 의 브랜치 생성 지점) */
function collectWorkflowBranchLiterals() {
  const dir = resolve(ROOT, '.github/workflows');
  if (!existsSync(dir)) return { error: '.github/workflows 디렉토리 부재' };
  const out = [];
  for (const f of readdirSync(dir).filter((n) => n.endsWith('.yml') || n.endsWith('.yaml'))) {
    const lines = readFileSync(join(dir, f), 'utf8').split('\n');
    lines.forEach((line, i) => {
      // `^\s*branch:` — `branches:` (트리거 필터) / `delete-branch:` / `target_branch:` 는 미매칭
      const m = line.match(/^\s*branch:\s*(\S.*?)\s*$/);
      if (m) out.push({ file: `.github/workflows/${f}`, line: i + 1, literal: m[1] });
    });
  }
  return { literals: out };
}

function runVerifySsot() {
  let failed = 0;
  const expected = [...BRANCH_TYPES].sort();
  console.log('verify-branch-name --verify-ssot');
  console.log(`  정본 BRANCH_TYPES: [${expected.join(', ')}]\n`);

  // --- 1~3단계: 산문 3곳 양방향 대조 ---
  for (const { path, locator } of PROSE_SOURCES) {
    const r = extractProseTypes(path, locator);
    if (r.error) {
      console.error(`  [FAIL] ${path}\n         ${r.error}`);
      failed++;
      continue;
    }
    const got = [...new Set(r.tokens)].sort();
    const missing = expected.filter((t) => !got.includes(t));
    const extra = got.filter((t) => !expected.includes(t));
    if (missing.length === 0 && extra.length === 0) {
      console.log(`  [PASS] ${path}:${r.line} — [${got.join(', ')}]`);
    } else {
      console.error(
        `  [FAIL] ${path}:${r.line}\n` +
          `         추출: [${got.join(', ')}]\n` +
          `         정본: [${expected.join(', ')}]\n` +
          (missing.length ? `         누락: [${missing.join(', ')}]\n` : '') +
          (extra.length ? `         잉여: [${extra.join(', ')}]\n` : '') +
          `         → 산문을 정본에 맞추거나, 규약을 바꿨다면 BRANCH_TYPES 를 먼저 고치세요.`,
      );
      failed++;
    }
  }

  // --- 4단계: workflow `branch:` 리터럴이 전부 허용 집합으로 설명되는가 ---
  console.log('');
  const wf = collectWorkflowBranchLiterals();
  if (wf.error) {
    console.error(`  [FAIL] ${wf.error}`);
    failed++;
  } else if (wf.literals.length === 0) {
    console.error(
      `  [FAIL] workflow 에 \`branch:\` 리터럴이 0건입니다.\n` +
        `         봇 브랜치 생성 지점이 사라졌다면 BOT_BRANCH_PATTERNS 도 정리해야 합니다 (fail-fast).`,
    );
    failed++;
  } else {
    for (const { file, line, literal } of wf.literals) {
      // `${{ github.run_id }}` 등 표현식을 숫자 샘플로 치환해 **런타임 판정기 자신**으로 검사한다.
      // ADR §5-4 4단계(= `chore/` 리터럴이 BOT_BRANCH_PATTERNS 로 설명되는지)의 강화형:
      // 3번째 봇 workflow 가 `chore/` 아닌 접두사를 써도 여기서 잡힌다.
      const sample = literal.replace(/\$\{\{[^}]*\}\}/g, '1234567890');
      const { ok, rule } = classifyBranch(sample);
      const isBotShaped = literal.startsWith('chore/');
      const explained =
        isBotShaped && BOT_BRANCH_PATTERNS.some((p) => literal.startsWith(`chore/${p}-`));
      if (ok && (rule !== 'bot' || explained)) {
        console.log(`  [PASS] ${file}:${line} — ${literal}  (rule: ${rule})`);
      } else {
        console.error(
          `  [FAIL] ${file}:${line} — \`branch:\` 리터럴 '${literal}' 이 허용 집합 밖입니다.\n` +
            `         치환 샘플: '${sample}'\n` +
            `         봇이 새 브랜치 패턴을 쓰기 시작했다면 BOT_BRANCH_PATTERNS 에 **명시적으로** 추가하세요.\n` +
            `         (통째 스킵으로 무마하지 말 것 — 한 클래스 전체가 사각지대가 됩니다)`,
        );
        failed++;
      }
    }
  }

  console.log(`\n--verify-ssot: ${failed === 0 ? 'PASS' : `FAIL (${failed}건)`}`);
  return failed === 0 ? 0 : 1;
}

// =============================================================================
// --self-test — 격리 픽스처 매트릭스 (가드 도입 PR DoD 축 1)
// =============================================================================

/**
 * 픽스처 = ADR §7-1 전 케이스 + 경계 보강.
 * 전 코퍼스 513 브랜치명을 박아넣지 않는다 (~15KB 부피 + 네트워크 의존).
 * 전수 실측은 --check-corpus 의 1회성 증거로 분리한다.
 *
 * **최고 리스크 3종** (develop / main / release/*-prep `v` 유무 양쪽) 은 오차단 시
 * 릴리스·merge-back 이 전면 차단되므로 필수 케이스로 고정한다.
 */
const FIXTURES = [
  // --- 최고 리스크 3종 (오차단 시 릴리스/merge-back 전면 차단) ---
  ['develop', true, '최고 리스크 — release PR 의 head'],
  ['main', true, '최고 리스크 — hotfix merge-back 의 head'],
  ['release/0.60.0-prep', true, '최고 리스크 — v 없음 (실측 2026-08-05)'],
  ['release/v0.53.0-prep', true, '최고 리스크 — v 있음 (실측 2026-07-30)'],
  // --- 릴리스 경계 ---
  ['release/0.34.1-prep', true, 'patch 버전'],
  ['release/v10.20.30-prep', true, '2자리 이상 세그먼트'],
  // --- 일상 개발 (전 type 커버) ---
  ['feature/962-branch-name-guard', true, '본 PR 자신 (메타 측정 자기 적용)'],
  ['fix/952-format-backstop', true, 'fix'],
  ['chore/933-verify-rest-finally', true, 'chore'],
  ['docs/942-branch-convention', true, 'docs'],
  ['test/943-selector-static-guard', true, 'test'],
  ['refactor/850-phase1-core-tail', true, 'refactor'],
  ['hotfix/99-critical', true, 'hotfix (실사용 0건이나 규약상 허용)'],
  ['chore/851-babylon-9-19', true, '설명 안에 숫자·하이픈'],
  ['feature/915-ci-bundle-pr1', true, '설명 끝 숫자'],
  // --- 봇 (오차단 시 자동화 파손) ---
  ['chore/r1-baseline-linux-30725438161', true, '봇 — r1 baseline (실측)'],
  ['chore/baseline-remeasure-24846477523', true, '봇 — bench remeasure (실측)'],
  // --- FAIL: type 오류 ---
  ['feat/962-x', false, '커밋 type != 브랜치 type — 가장 헷갈리는 오류'],
  ['architect/594-r5-mars-adr', false, '#942 폐기 접두사'],
  ['dev/404-scenario-presets-impl', false, '#942 폐기 접두사'],
  // --- FAIL: 구조 오류 ---
  ['feature/962', false, '설명 없음'],
  ['feature/branch-name-guard', false, '이슈번호 없음'],
  ['feature/962-', false, '설명 빈 문자열'],
  ['Feature/962-X', false, '대문자'],
  ['feature//962-x', false, '빈 세그먼트'],
  ['feature/962-x/y', false, '슬래시 2개'],
  ['feature/962-branch name', false, '공백 포함'],
  // --- FAIL: 릴리스 오류 ---
  ['release/0.60.0', false, '-prep 없음'],
  ['release/prep', false, '버전 없음'],
  ['release/v0.60-prep', false, '2-segment 버전'],
  ['release/v0.53.0-prep-extra', false, '접미 잉여'],
  // --- FAIL: 봇 오류 ---
  ['chore/r1-baseline-linux-abc', false, 'run_id 가 숫자 아님'],
  ['chore/r1-baseline-windows-123', false, '미등록 봇 패턴'],
  ['chore/baseline-remeasure-', false, 'run_id 없음'],
  // --- FAIL: gitflow 유사 오탐 방지 ---
  ['main-backup', false, 'gitflow 이름 유사'],
  ['develop2', false, 'gitflow 접미'],
  ['Main', false, 'gitflow 대문자'],
  // --- FAIL: 입력 위생 ---
  ['', false, '빈 문자열'],
  [' develop', false, '선행 공백 (미trim 입력)'],
  ['develop\nmain', false, '개행 주입 — JS ^$ 는 비-multiline 에서 엄격'],
];

function runSelfTest() {
  console.log('self-test: verify-branch-name.mjs (격리 픽스처)\n');
  let pass = 0;
  let fail = 0;
  for (const [name, expected, note] of FIXTURES) {
    const { ok, rule } = classifyBranch(name);
    const display = JSON.stringify(name);
    if (ok === expected) {
      pass++;
      console.log(
        `  [OK]   ${expected ? 'PASS' : 'FAIL'} ${display}${rule ? ` (${rule})` : ''} — ${note}`,
      );
    } else {
      fail++;
      console.error(
        `  [MISS] 기대 ${expected ? 'PASS' : 'FAIL'} / 실제 ${ok ? 'PASS' : 'FAIL'} ${display} — ${note}`,
      );
    }
  }

  // 정본 상수 자체의 무결성 (규약 축소·오타 회귀 차단)
  const invariants = [
    ['BRANCH_TYPES 에 feature 포함 (feat 아님)', BRANCH_TYPES.includes('feature')],
    ['BRANCH_TYPES 에 feat 미포함', !BRANCH_TYPES.includes('feat')],
    ['GITFLOW_HEADS == [develop, main]', GITFLOW_HEADS.join(',') === 'develop,main'],
    ['BOT_BRANCH_PATTERNS 비어있지 않음', BOT_BRANCH_PATTERNS.length > 0],
    ['픽스처 24 케이스 이상 (ADR §7-1 하한)', FIXTURES.length >= 24],
  ];
  console.log('');
  for (const [label, ok] of invariants) {
    if (ok) {
      pass++;
      console.log(`  [OK]   불변식 — ${label}`);
    } else {
      fail++;
      console.error(`  [MISS] 불변식 — ${label}`);
    }
  }

  // 진입점 가드 회귀 — 심링크 경로로 직접 실행해도 **실제로 판정이 돈다** 는 것을 실증.
  // 순진한 URL 비교였을 때 아무 출력 없이 exit 0 이 나던 silent skip 을 pin 한다 (#962).
  const linkResult = probeSymlinkedInvocation();
  if (linkResult.ok) {
    pass++;
    console.log(`  [OK]   진입점 — ${linkResult.detail}`);
  } else {
    fail++;
    console.error(`  [MISS] 진입점 — ${linkResult.detail}`);
  }

  console.log(`\nself-test: ${pass} passed, ${fail} failed (픽스처 ${FIXTURES.length}건)`);
  return fail === 0 ? 0 : 1;
}

/**
 * 심링크된 경로로 본 스크립트를 자식 프로세스로 실행해, 규약 위반 입력에 대해
 * 정말로 exit 1 + 진단 출력을 내는지 확인한다 (silent no-op 회귀 차단).
 */
function probeSymlinkedInvocation() {
  const dir = mkdtempSync(join(tmpdir(), 'verify-branch-name-link-'));
  const link = join(dir, 'linked-verify-branch-name.mjs');
  try {
    symlinkSync(SCRIPT_PATH, link);
    const r = spawnSync(process.execPath, [link, '--branch', 'feat/962-x'], { encoding: 'utf8' });
    const emitted = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    if (r.status === 1 && emitted.includes('규약 위반')) {
      return {
        ok: true,
        detail: '심링크 경로 직접 실행 — exit 1 + 진단 출력 확인 (silent skip 없음)',
      };
    }
    return {
      ok: false,
      detail:
        `심링크 경로 직접 실행이 no-op — exit=${r.status}, 출력 ${emitted.length}자. ` +
        `진입점 가드가 realpath 를 정규화하지 않으면 가드 전체가 조용히 통과한다.`,
    };
  } catch (e) {
    return { ok: false, detail: `심링크 프로브 실패: ${e.message}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

// =============================================================================
// --check-corpus <json> — 머지 PR head 전수 실측 (1회성 증거, CI 미배선)
// =============================================================================

function runCheckCorpus(jsonPath) {
  if (!jsonPath) {
    console.error('[ERROR] --check-corpus <파일> 인자가 필요합니다.');
    return 2;
  }
  if (!existsSync(jsonPath)) {
    console.error(`[ERROR] 코퍼스 파일 부재: ${jsonPath}`);
    return 2;
  }
  let rows;
  try {
    rows = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] JSON 파싱 실패: ${e.message}`);
    return 2;
  }
  if (!Array.isArray(rows)) {
    console.error('[ERROR] 코퍼스는 gh pr list --json 배열이어야 합니다.');
    return 2;
  }

  const failures = [];
  let passCount = 0;
  const byRule = new Map();
  for (const r of rows) {
    const name = r.headRefName;
    const { ok, rule } = classifyBranch(name);
    if (ok) {
      passCount++;
      byRule.set(rule, (byRule.get(rule) ?? 0) + 1);
    } else {
      failures.push(name);
    }
  }

  // FAIL 을 ADR §6-1 오차단 리스크 표의 행으로 분류
  const classes = [
    ['architect/* · dev/* (#942 폐기 접두사 — 의도된 차단)', (n) => /^(architect|dev)\//.test(n)],
    ['release/* (-prep 없음 — 마지막 2026-06-16)', (n) => /^release\//.test(n)],
    ['이슈번호 없는 <type>/* (사람)', (n) => new RegExp(`^(?:${ALL_TYPES.join('|')})/`).test(n)],
  ];
  const buckets = classes.map(([label]) => ({ label, items: [] }));
  const other = [];
  for (const n of failures) {
    const i = classes.findIndex(([, pred]) => pred(n));
    if (i === -1) other.push(n);
    else buckets[i].items.push(n);
  }

  console.log(`--check-corpus: ${jsonPath}`);
  console.log(`  전체 ${rows.length}  PASS ${passCount}  FAIL ${failures.length}\n`);
  console.log('  PASS 분해 (rule):');
  for (const [rule, n] of [...byRule.entries()].sort((a, b) => b[1] - a[1])) {
    console.log(`    ${rule.padEnd(10)} ${n}`);
  }
  console.log('\n  FAIL 분해 (ADR §6-1 표 행 매핑):');
  for (const b of buckets) console.log(`    ${b.label} — ${b.items.length}`);
  if (other.length) console.log(`    분류 밖 — ${other.length}: ${[...new Set(other)].join(', ')}`);

  console.log(
    `\n  참고: --check-corpus 는 CI 에 배선하지 않는다 (네트워크·시간 의존 → 비결정적).\n` +
      `        결정적 회귀 가드는 --self-test 가 담당한다.`,
  );
  return 0;
}

// =============================================================================
// CLI
// =============================================================================

function main(argv) {
  const args = argv.slice(2);
  if (args.includes('--self-test')) return runSelfTest();
  if (args.includes('--verify-ssot')) return runVerifySsot();

  const corpusIdx = args.indexOf('--check-corpus');
  if (corpusIdx !== -1) return runCheckCorpus(args[corpusIdx + 1]);

  const branchIdx = args.indexOf('--branch');
  if (branchIdx !== -1) {
    const name = args[branchIdx + 1];
    if (name === undefined) {
      console.error('[ERROR] --branch <이름> 인자가 필요합니다.');
      return 2;
    }
    return runBranchCheck(name);
  }

  if (args.length > 0) {
    console.error(`[ERROR] 알 수 없는 인자: ${args.join(' ')}`);
    console.error(
      'usage: verify-branch-name.mjs [--branch <name> | --verify-ssot | --self-test | --check-corpus <json>]',
    );
    return 2;
  }
  return runPreflight();
}

/**
 * 진입점 가드 — import 시 CLI 가 돌지 않게 하되, **직접 실행이 조용히 스킵되지 않게** 한다.
 *
 * 순진한 `import.meta.url === pathToFileURL(process.argv[1]).href` 비교는
 * 호출 경로와 realpath 가 다를 때 (macOS `/tmp` → `/private/tmp` 심볼릭 링크,
 * 심링크된 체크아웃 디렉토리 등) **거짓이 되어 스크립트 전체가 no-op exit 0** 이 된다.
 * 격리 픽스처 실측 (2026-08-06, #962 D-negative) 에서 실제로 재현됐다 — 가드가
 * 아무 출력 없이 초록을 반환하는, 본 설계가 금지하는 silent skip 그 자체다.
 *
 * 따라서 양쪽을 realpath 로 정규화해 비교한다. `import.meta.url` 은 Node 가 이미
 * 실경로로 해석하므로 argv[1] 만 정규화하면 충분하다.
 * 회귀 가드: --self-test 의 "심링크 경로 직접 실행" 케이스.
 */
function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH);
  } catch {
    // realpath 실패 시에도 조용히 스킵하지 않는다 — 원시 경로로 한 번 더 비교
    return pathToFileURL(process.argv[1]).href === import.meta.url;
  }
}

if (isDirectRun()) {
  process.exit(main(process.argv));
}
