#!/usr/bin/env node
/**
 * verify-branch-name.mjs
 *
 * #962 축 B — 브랜치명 규약의 **기계 SSoT**.
 *
 * 배경: #942 가 브랜치 접두사 규약을 `<type>/<이슈번호>-<설명>` 으로 일반화했으나
 * 강제 수단이 0 이었고, type 열거는 산문 3곳에 **축자 복제**돼 있었다 (정본 부재).
 * 본 스크립트의 상수가 정본이고, 산문 3곳은 `--verify-ssot` 가 검증하는 **파생**이다.
 * 사본 수는 4 로 같지만 **type 열거의** "검증되지 않은 사본" 이 3 → 0 이 된다.
 * (범위 한정에 주의: `--verify-ssot` 가 강제하는 것은 type 열거 + workflow `branch:` 리터럴
 *  + guide 허용 집합 표다. CLAUDE.md §브랜치 전략 표의 `release/*-prep` · `hotfix` 서술은
 *  기존 사본으로 남아 있으며 검증 대상이 아니다 — reviewer 권고 R1, 2026-08-06.)
 *
 * 계약 SSoT: docs/decisions/20260806-962-branch-name-guard.md §5
 *
 * 네 소비처 (하나의 스크립트):
 *   --branch <name>          → CI 런타임 검사 (.github/workflows/branch-name-guard.yml)
 *   --verify-ssot            → 산문 3곳 + workflow `branch:` 리터럴 + guide 허용 집합 표 대조
 *                              (project-guards.yml)
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
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
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

/**
 * **잔여 false-negative (의도적 미대응)** — reviewer 주입 실측 #7, 2026-08-06.
 *
 * 범위를 "최장 선두 run" 으로 좁힌 대가로, **열거 구간 밖**(닫는 괄호 뒤 등)에 추가된
 * type 토큰은 검출되지 않는다. 하드닝하려면 "열거 뒤 잔여 백틱 토큰 중 `^[a-z]+$` 금지"
 * 같은 규칙이 필요한데, `create-pr/SKILL.md` 의 `` `develop` `` 이 정확히 그 패턴이라
 * **false-fire 가 즉시 재유입**된다 — D1 이 제거한 상시 발화가 그대로 돌아온다.
 * 실제 drift 편집 경로(열거 확장·축소·오타)는 전부 잡히므로 대가를 지불한다.
 * (3중 박제: 본 주석 / project-guards.yml step 주석 / ADR §5-4)
 */

/**
 * `docs/guides/branch-strategy-workflow.md` §허용 집합 표 — **본 PR 이 신설한 4번째 사본**.
 *
 * 산문 3곳(`PROSE_SOURCES`)이 type 열거만 복제하는 것과 달리, 이 표는 허용 집합 **4행 전체**
 * (gitflow head / type 열거 / 릴리스 형태 / 봇 리터럴) 를 축자 재기술한다. 검증 대상에 넣지
 * 않으면 `BOT_BRANCH_PATTERNS` 나 `RE_RELEASE` 를 고쳤을 때 이 표가 **조용히 drift** 한다 —
 * CLAUDE.md 가 "숨은 상수 drift" 로 이름 붙인 클래스이고, 정본을 스크립트로 이전한다는 본
 * PR 의 서사와 정면 충돌한다. (reviewer 권고 R1, 2026-08-06)
 *
 * 별도 파서를 만들지 않고 **런타임 판정기 자신**(`classifyBranch`)을 재사용한다 — workflow
 * `branch:` 리터럴 검사와 동일한 기법이다:
 *   - `형태`·`예` 열의 백틱 토큰 중 **구체적 브랜치명**(형태 자리표시자가 아닌 것)은
 *     전부 그 행의 rule 로 분류돼야 한다. 행당 0건이면 fail-fast (표만 남고 대조는 사라지는 상태 차단).
 *   - 2행 비고의 `type = ` 열거는 `ALL_TYPES` 와 양방향 대조한다 (산문 3곳과 달리 이 표는
 *     `hotfix` 까지 적으므로 `BRANCH_TYPES` 가 아니라 `ALL_TYPES` 가 기준이다).
 */
const GUIDE_TABLE = {
  path: 'docs/guides/branch-strategy-workflow.md',
  locator: '### 허용 집합',
  typeEnumLocator: 'type = ',
  rows: [
    { n: '1', rule: 'gitflow' },
    { n: '2', rule: 'work' },
    { n: '3', rule: 'release' },
    { n: '4', rule: 'bot' },
  ],
};

/** 형태 자리표시자 판별 — `<...>` / `v?` / `X.Y.Z` 를 포함하면 구체 브랜치명이 아니다 */
function isFormPlaceholder(token) {
  return /[<>?]/.test(token) || token.includes('X.Y.Z');
}

/**
 * guide 허용 집합 표 대조. `{ok, msg}` 배열을 반환한다 (호출부가 집계).
 * 파일 부재 / locator 미발견 / 행 부재는 전부 즉시 FAIL — fallback 없음.
 */
function verifyGuideTable() {
  const { path, locator, typeEnumLocator, rows } = GUIDE_TABLE;
  const abs = resolve(ROOT, path);
  if (!existsSync(abs)) return [{ ok: false, msg: `대상 파일 부재: ${path}` }];

  const lines = readFileSync(abs, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.includes(locator));
  if (start === -1) {
    return [
      {
        ok: false,
        msg:
          `locator 미발견: ${path} 에 고정 문자열 "${locator}" 가 없습니다.\n` +
          `         표를 옮기거나 제목을 바꿨다면 GUIDE_TABLE 도 함께 갱신해야 합니다.`,
      },
    ];
  }

  const out = [];
  for (const { n, rule } of rows) {
    const idx = lines.findIndex((l, i) => i > start && l.startsWith(`| ${n} |`));
    if (idx === -1) {
      out.push({
        ok: false,
        msg: `${path} §허용 집합 표에 ${n}행이 없습니다 (기대 rule: ${rule}).`,
      });
      continue;
    }
    // 마크다운 표 셀: ['', '#', '형태', '예', '비고', '']
    const cells = lines[idx].split('|').map((c) => c.trim());
    const tokens = [...`${cells[2] ?? ''} ${cells[3] ?? ''}`.matchAll(/`([^`]+)`/g)]
      .map((m) => m[1])
      .filter((t) => !isFormPlaceholder(t));

    if (tokens.length === 0) {
      out.push({
        ok: false,
        msg: `${path}:${idx + 1} — ${n}행의 형태·예 열에 대조 가능한 구체 브랜치명이 0건입니다 (fail-fast).`,
      });
    }
    for (const t of tokens) {
      const { ok, rule: got } = classifyBranch(t);
      out.push(
        ok && got === rule
          ? { ok: true, msg: `${path}:${idx + 1} — ${n}행 '${t}'  (rule: ${got})` }
          : {
              ok: false,
              msg:
                `${path}:${idx + 1} — ${n}행 '${t}' 이 rule '${rule}' 로 분류되지 않습니다 (실제: ${ok ? got : '허용 집합 밖'}).\n` +
                `         정본 상수를 바꿨다면 이 표의 형태·예도 함께 갱신해야 합니다.`,
            },
      );
    }

    if (n !== '2') continue;

    // 2행 비고의 type 열거 — ALL_TYPES 양방향 대조 (ENUM_RE 와 동일하게 최장 선두 run 만 소비)
    const remark = cells[4] ?? '';
    const at = remark.indexOf(typeEnumLocator);
    if (at === -1) {
      out.push({
        ok: false,
        msg: `${path}:${idx + 1} — 2행 비고에 고정 문자열 "${typeEnumLocator}" 로 시작하는 type 열거가 없습니다.`,
      });
      continue;
    }
    const run = remark.slice(at + typeEnumLocator.length).match(/^(?:`[a-z]+`\s*)+/);
    if (!run) {
      out.push({
        ok: false,
        msg: `${path}:${idx + 1} — 2행 type 열거 파싱 실패 ("${typeEnumLocator}" 뒤에 \`type\` 나열이 없습니다).`,
      });
      continue;
    }
    const got = [...new Set([...run[0].matchAll(/`([a-z]+)`/g)].map((m) => m[1]))].sort();
    const want = [...ALL_TYPES].sort();
    const missing = want.filter((t) => !got.includes(t));
    const extra = got.filter((t) => !want.includes(t));
    out.push(
      missing.length === 0 && extra.length === 0
        ? {
            ok: true,
            msg: `${path}:${idx + 1} — 2행 type 열거 [${got.join(', ')}] == BRANCH_TYPES + ${HOTFIX_TYPE}`,
          }
        : {
            ok: false,
            msg:
              `${path}:${idx + 1} — 2행 type 열거 불일치\n` +
              `         추출: [${got.join(', ')}]\n` +
              `         정본: [${want.join(', ')}]\n` +
              (missing.length ? `         누락: [${missing.join(', ')}]\n` : '') +
              (extra.length ? `         잉여: [${extra.join(', ')}]\n` : '') +
              `         → 표를 정본에 맞추거나, 규약을 바꿨다면 BRANCH_TYPES / HOTFIX_TYPE 을 먼저 고치세요.`,
          },
    );
  }
  return out;
}

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

  // --- 5단계: guide 허용 집합 표 (본 PR 신설 사본 — reviewer 권고 R1) ---
  console.log('');
  for (const { ok, msg } of verifyGuideTable()) {
    if (ok) {
      console.log(`  [PASS] ${msg}`);
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
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
  if (IS_PROBE_CHILD) {
    // 프로브가 띄운 자식이다 (재진입 가드). 여기서 다시 프로브를 돌리면 무한 재귀가 된다.
    //
    // 단 **skip 이 아니라 fail 이다** (reviewer 2차 🟡1). 이 분기는 프로브 자식에서만 정당한데,
    // `PROBE_ENV` 가 CI env 로 누출되면 최상위 실행이 이 분기를 타 회귀 프로브 4건이 통째로
    // 사라진 채 exit 0 초록이 된다 — 본 가드가 봉인하려는 silent skip 클래스의 세 번째 층이다.
    // 부모는 자식 종료 코드가 아니라 출력 텍스트로 판정하므로 여기서 fail 을 올려도
    // 재진입 방지(무한 재귀 차단)는 그대로 성립한다.
    fail++;
    console.error(
      `  [MISS] 자식 프로세스 프로브 — 최상위 실행인데 ${PROBE_ENV}=1 이다 (env 누출 시 프로브 4건 소실)`,
    );
  } else {
    const linkResult = probeSymlinkedInvocation();
    if (linkResult.ok) {
      pass++;
      console.log(`  [OK]   진입점 — ${linkResult.detail}`);
    } else {
      fail++;
      console.error(`  [MISS] 진입점 — ${linkResult.detail}`);
    }

    // CLI 인자 파싱 회귀 (reviewer B1) — 규약 위반 입력이 모드 플래그로 위장해 통과하지 못한다.
    for (const p of probeArgvParsing()) {
      if (p.ok) {
        pass++;
        console.log(`  [OK]   인자 파싱 — ${p.detail}`);
      } else {
        fail++;
        console.error(`  [MISS] 인자 파싱 — ${p.detail}`);
      }
    }
  }

  console.log(`\nself-test: ${pass} passed, ${fail} failed (픽스처 ${FIXTURES.length}건)`);
  // 축 3 (5 페르소나 self-consistency) 대조용 3-tuple — 각 페르소나가 계산하지 않고 이 줄을 읽는다.
  console.log(
    `self-consistency 3-tuple (총 검사, PASS, FAIL 픽스처 지문) = (${pass + fail}, ${pass}, ${failFixtureFingerprint()})`,
  );
  return fail === 0 ? 0 : 1;
}

/**
 * 자식 프로세스 프로브의 **재진입 가드**.
 *
 * 프로브는 자기 자신을 자식으로 띄운다. 인자 파싱 결함이 살아 있으면
 * `--branch --self-test` 가 브랜치 검사가 아니라 self-test 로 라우팅되므로 프로브가
 * 프로브를 낳아 **무한 재귀**가 된다 — 되돌린 구현으로 negative 시뮬을 돌렸을 때
 * 실제로 자식이 지수적으로 증식했다 (2026-08-06). 그러면 결함의 신호가 깨끗한 `[MISS]`
 * 가 아니라 **CI 행(job timeout)** 이 되어 진단 품질이 떨어진다.
 * 자식에게 이 환경변수를 넘겨 프로브 깊이를 1 로 묶고, 결함이 `[MISS]` 로 드러나게 한다.
 * (`timeout` 은 그래도 남긴다 — 이중 방어.)
 */
const PROBE_ENV = 'VERIFY_BRANCH_NAME_PROBE';
const IS_PROBE_CHILD = process.env[PROBE_ENV] === '1';
const PROBE_SPAWN_OPTS = {
  encoding: 'utf8',
  timeout: 30_000,
  env: { ...process.env, [PROBE_ENV]: '1' },
};

/**
 * 심링크된 경로로 본 스크립트를 자식 프로세스로 실행해, 규약 위반 입력에 대해
 * 정말로 exit 1 + 진단 출력을 내는지 확인한다 (silent no-op 회귀 차단).
 */
function probeSymlinkedInvocation() {
  const dir = mkdtempSync(join(tmpdir(), 'verify-branch-name-link-'));
  const link = join(dir, 'linked-verify-branch-name.mjs');
  try {
    symlinkSync(SCRIPT_PATH, link);
    const r = spawnSync(process.execPath, [link, '--branch', 'feat/962-x'], PROBE_SPAWN_OPTS);
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

/**
 * CLI 인자 파싱 회귀 — 모드 플래그가 `--branch` 의 **값**으로 왔을 때 브랜치 검사가
 * 건너뛰어지지 않는지, 그리고 두 모드의 병합 호출이 조용히 한쪽을 버리지 않는지 확인한다.
 *
 * 결함 이력은 `main()` 주석 참조 (reviewer B1). **자식 프로세스여야 한다** —
 * 같은 프로세스에서 `classifyBranch` 를 직접 부르면 순수 함수는 언제나 정상이라
 * `main()` 의 인자 파싱 순서라는 실제 결함 지점을 전혀 건드리지 못한다.
 */
function probeArgvParsing() {
  const cases = [
    {
      args: ['--branch', '--self-test'],
      status: 1,
      text: '규약 위반',
      label: "--branch '--self-test' — 모드 플래그가 값으로 와도 브랜치 검사가 돈다",
    },
    {
      args: ['--branch', '--verify-ssot'],
      status: 1,
      text: '규약 위반',
      label: "--branch '--verify-ssot' — 동일",
    },
    {
      args: ['--branch', 'feature/962-x', '--self-test'],
      status: 2,
      text: '잉여 인자',
      label: '두 모드 병합 호출 — 한쪽을 조용히 버리지 않고 exit 2 로 거부',
    },
  ];
  return cases.map((c) => {
    const r = spawnSync(process.execPath, [SCRIPT_PATH, ...c.args], PROBE_SPAWN_OPTS);
    const emitted = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const ok = r.status === c.status && emitted.includes(c.text);
    return {
      ok,
      detail: ok
        ? c.label
        : `${c.label} — 기대 exit ${c.status} + "${c.text}", 실제 exit ${r.status} / 출력 ${emitted.trim().length}자`,
    };
  });
}

/**
 * 페르소나 간 self-consistency 대조 지문 (가드 도입 PR DoD 축 3 — reviewer 권고 R4).
 *
 * **직렬화 규약** — 이것이 명시되지 않으면 셀 값이 재현 불가능해 축 3 의 증거력이 사라진다
 * (reviewer 가 8종 형태를 시도해 전부 불일치, 2026-08-06):
 *   1. FAIL 을 기대하는 픽스처의 브랜치명만 취한다.
 *   2. 각 이름을 `JSON.stringify` 로 인용한다 — 빈 문자열과 개행 주입
 *      (`develop\nmain`) 케이스가 구분 가능해야 한다. 원시 문자열 join 은 둘을 뭉갠다.
 *   3. 인용된 문자열들을 기본 `Array#sort` (UTF-16 코드유닛 오름차순) 로 정렬한다.
 *   4. `'\n'` 으로 join → SHA-256 → hex 앞 12자.
 *
 * 다섯 페르소나는 이 값을 **직접 계산하지 않고 `--self-test` 출력에서 읽는다**.
 * 대조가 목적인 값을 각자 계산하면 직렬화 해석 차이가 곧 불일치로 오인된다.
 */
export function failFixtureFingerprint() {
  const quoted = FIXTURES.filter(([, expected]) => !expected).map(([name]) => JSON.stringify(name));
  quoted.sort();
  return createHash('sha256').update(quoted.join('\n')).digest('hex').slice(0, 12);
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

const USAGE =
  'usage: verify-branch-name.mjs [--branch <name> | --verify-ssot | --self-test | --check-corpus <json>]';

/**
 * 모드별 기대 인자 개수 (모드 플래그 자신 포함). 초과분은 즉시 거부한다.
 * 프로토타입 오염 경로를 막기 위해 조회는 반드시 `Object.hasOwn` 으로 한다.
 * 정확히는 `in` 으로 되돌려도 오염 8종은 `default` 분기가 exit 2 로 잡는다 (reviewer 2차 실측) —
 * 즉 `Object.hasOwn` 과 `default` 는 **각각 독립적으로 fail-closed** 이고, 여기서 `hasOwn` 을 쓰는 건
 * B1 결함(exit 0 우회)의 부활 방지가 아니라 **모드 조회 자체를 자기 소유 키로 한정**하기 위함이다
 * (`'constructor' in {}` 는 true 라, 단순 `in` 검사는 임의 문자열을 모드로 통과시킨다).
 */
const MODE_ARITY = { '--self-test': 1, '--verify-ssot': 1, '--branch': 2, '--check-corpus': 2 };

/**
 * CLI — **모드는 `args[0]` 로만 판정한다.**
 *
 * 결함 이력 (reviewer B1, 2026-08-06): 종전 구현은 `args.includes('--self-test')` 로
 * 배열 **전체**를 훑어 모드를 정했기 때문에, 모드 플래그가 `--branch` 의 **값**으로 오면
 * (`--branch '--self-test'`) 브랜치 검사가 통째로 건너뛰어지고 **exit 0** 이 났다.
 * 규약 위반 입력에 가드가 초록을 반환하는, 진입점 D-negative 와 **동일 클래스**의
 * silent skip 이다. 도달 경로가 둘인데 하나는 적대자가 필요 없다 — 누군가 두 CI 스텝을
 * `--branch "$HEAD_REF" --self-test` 로 합치면 브랜치 검사가 조용히 사라지고 스텝은 초록이다.
 *
 * 추가로 **잉여 인자를 거부**한다 (fail-closed). `args[0]` 판정만으로는 위 병합 호출에서
 * 브랜치 검사는 살아나지만 이번엔 `--self-test` 가 조용히 무시되는데, 그것도 같은 클래스다.
 * 모드별 인자 개수가 전부 고정이므로 초과분은 exit 2 로 끊어 병합 자체를 불가능하게 한다.
 *
 * 회귀 가드: `--self-test` 의 "인자 파싱" 프로브 3케이스 (자식 프로세스 — 같은 프로세스에서
 * `classifyBranch` 를 부르면 순수 함수는 언제나 정상이라 파싱 순서를 전혀 검증하지 못한다).
 */
function main(argv) {
  const args = argv.slice(2);
  const mode = args[0];

  if (mode === undefined) return runPreflight();

  if (!Object.hasOwn(MODE_ARITY, mode)) {
    console.error(`[ERROR] 알 수 없는 인자: ${args.join(' ')}`);
    console.error(USAGE);
    return 2;
  }

  const arity = MODE_ARITY[mode];
  if (args.length > arity) {
    console.error(
      `[ERROR] 잉여 인자: ${args.slice(arity).join(' ')}\n` +
        `        '${mode}' 는 인자 ${arity}개를 받습니다. 두 모드를 한 호출로 합칠 수 없습니다 —\n` +
        `        합치면 한쪽 검사가 조용히 무시되므로, CI 스텝을 나눠 각각 호출하세요.`,
    );
    console.error(USAGE);
    return 2;
  }

  switch (mode) {
    case '--self-test':
      return runSelfTest();
    case '--verify-ssot':
      return runVerifySsot();
    case '--check-corpus':
      return runCheckCorpus(args[1]);
    case '--branch':
      if (args[1] === undefined) {
        console.error('[ERROR] --branch <이름> 인자가 필요합니다.');
        console.error(USAGE);
        return 2;
      }
      return runBranchCheck(args[1]);
    default:
      // MODE_ARITY 를 통과했는데 여기 도달 = 모드 테이블과 분기의 drift. 조용히 통과시키지 않는다.
      console.error(
        `[ERROR] 내부 오류: 모드 '${mode}' 에 대응하는 분기가 없습니다 (MODE_ARITY drift).`,
      );
      return 2;
  }
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
 *
 * `catch` 폴백은 **fail-loud** 다 (reviewer 권고 R3). 종전 폴백은 결함 이전의 순진한
 * URL 비교로 되돌아갔는데, 그것이 거짓이면 결국 같은 silent no-op 이라 "조용히 스킵하지
 * 않는다" 는 주석이 사실과 어긋났다 — 이 저장소가 버그 생성원으로 박제한 주석↔구현 drift다.
 * realpath 실패는 정상 경로가 아니므로, 경고를 남기고 **직접 실행으로 간주해 판정을 강행**한다.
 * (import 문맥에서 오발화하면 잡음이 나지만, 가드가 조용히 사라지는 쪽보다 언제나 낫다.)
 */
function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH);
  } catch (e) {
    console.error(
      `[WARN] 진입점 realpath 정규화 실패 (${e.message}) — 직접 실행으로 간주하고 판정을 강행합니다.\n` +
        `       조용한 스킵(exit 0)은 본 가드가 금지하는 실패 모드이므로 fail-loud 로 처리합니다.`,
    );
    return true;
  }
}

if (isDirectRun()) {
  process.exit(main(process.argv));
}
