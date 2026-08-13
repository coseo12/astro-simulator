#!/usr/bin/env node
/**
 * verify-md-tilde.mjs
 *
 * prettier 소유 markdown 에서 **bare `~~`** (코드 펜스 밖 ∧ 인라인 코드 스팬 밖의 물결 2개) 를
 * 금지하는 diff 스코프 가드 (#982).
 * ADR: docs/decisions/20260814-982-changelog-tilde-guard.md (Accepted, 2026-08-14)
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────────
 * 손상은 작성자가 타이핑하지 않는다 — **포맷터가 쓴다.** `prettier --write` 는 인라인 코드
 * **밖**의 단일 `~` 를 GFM 취소선 delimiter 로 정규화하므로, 작성자가 `R1~R4` 라고 쓴 범위
 * 표기가 `lint-staged` 안에서 `R1` + 물결 2개 + `R4` 로 바뀐다. 렌더링하면 취소선이 된다.
 *
 * 그리고 이 손상은 `prettier --check` 로 탐지되지 않는다 — `--write` 가 만든 형태는 prettier
 * 기준으로 **정답**이라 이후 `--check` 도 초록이다. 즉 CI 포맷 백스톱이 구조적으로 못 잡는다
 * (`docs/ops/operational-friction.md` §7-1). 규약(_"범위·구간 표기는 반드시 인라인 코드로
 * 감싼다"_)은 §7-1 에 이미 있었으나 **강제 지점이 0** 이었고, 본 스크립트가 그 지점이다.
 *
 * ── 검사 계약 ───────────────────────────────────────────────────────────────
 *   1. **모집단** — `prettier --file-info` 가 `ignored: false` 로 판정하는 `*.md` 파일.
 *      목록을 하드코딩하지 않는다 (`.prettierignore` 와 두 번째 출처가 생기면 조용히 갈린다
 *      — volt #120). `.md` 확장자 선별은 ADR §재검토 조건 1 의 관측 술어
 *      (`git ls-files '*.md'`) 와 같은 경계다.
 *   2. **술어** — 코드 펜스 밖 ∧ 인라인 코드 스팬 밖의 `~~` (ADR 채택 술어 C).
 *      의도된 취소선도 함께 금지한다 — 손상과 의도를 가르는 **구문적 판별자가 없기** 때문이다
 *      (ADR §결정 2). 정밀도의 출처는 술어가 아니라 **모집단**이다: prettier 소유 5 파일의
 *      의도된 취소선은 실측 0 발생이고, 의도분 48 발생은 전부 prettier 미소유 `docs/**` 에 있다.
 *   3. **스코프** — diff 의 **추가 라인** ∩ post-image 의 위반 라인. 전수 스캔이 아니다.
 *      확정 구간 존량 21줄은 #1040 판정 전까지 손댈 수 없으므로, 전수 스캔은 "고칠 수 없는
 *      것을 매번 보고하는 가드" 가 된다 (#766 alert fatigue 계보 — ADR §후보 비교 (a)(b)).
 *   4. **fail-fast** — `|| true` · soft-exit · allowlist · 예외 경로를 두지 않는다
 *      (CLAUDE.md §가드 설계 원칙). base 미해석도 통과가 아니라 exit 1 이다.
 *
 * ── 범위 경계 (의도적 미검출 / 과보고) ──────────────────────────────────────
 *   (i)   **확정 구간 존량** — diff 밖이라 보고하지 않는다. 회수 가부는 #1040 소관.
 *   (ii)  **prettier 미소유 md** (`docs/**` · `.claude/**` · `CLAUDE.md` 등) — 포맷터가
 *         건드리지 않으므로 손상이 애초에 생기지 않고, 그쪽 `~~` 는 전부 의도된 취소선이다.
 *   (iii) **인라인 코드 스팬은 라인 단위로 판정한다.** CommonMark 는 코드 스팬이 줄바꿈을
 *         넘을 수 있게 허용하지만 본 가드는 한 줄 안에서 열고 닫힌 것만 스팬으로 본다.
 *         편차의 방향은 **과보고**(위반을 더 많이 세는 쪽)라 fail-loud 다.
 *   (iv)  **4칸 들여쓰기 코드 블록은 해석하지 않는다.** 모집단 5 파일 전수 실측에서 해당
 *         형태가 0건이라 현 시점 영향이 0 이고, 도입하면 리스트 연속 라인을 코드로 오인해
 *         **과소보고**(fail-quiet) 방향으로 기운다.
 *   (v)   **모집단 계수는 차단하지 않는다** — 아래 §모집단 감시 참조.
 *
 * ── 모집단 감시 (ADR §재검토 조건 1) ────────────────────────────────────────
 * ADR §재검토 조건 1 은 술어가 아니라 **모집단 크기**(`ignored: false` 계수, 박제값 `5`) 를
 * 감시 대상으로 삼는다. 그 값은 **기계로 확인 가능**하며 `--population` 모드가 그 관측 술어다
 * (ADR 본문의 셸 루프를 손으로 다시 쓰지 않아도 되도록 스크립트에 넣었다).
 *
 * 다만 **계수를 차단 조건으로 걸지 않는다.** 근거:
 *   - 모집단이 늘어나는 사건(예: 신규 패키지 `README.md` 추가)은 그 자체로 결함이 아니다.
 *     기대값 `5` 를 상수로 박고 차단하면 **정당한 PR 이 반드시 FAIL** 한다 — 그 사건 클래스에
 *     대해 precision 0 이다.
 *   - ADR 이 규정한 트리거 동작은 _"즉시 재측정한다"_ 라는 **사람의 행위**이지 차단이 아니다.
 *   - 기대 계수 상수는 ADR §후보 비교 (g) 가 기각한 매직 넘버 baseline 과 같은 클래스다
 *     (통과시키려고 올리면 그만이고, 어디가 늘었는지 국소화하지 못한다).
 * 즉 판정은 **관측은 기계 · 판단은 사람**이다. `--population` 은 항상 exit 0 이며 계수와
 * 소유 파일 목록을 stdout 에 출력한다.
 *
 * ── 종료 코드 ───────────────────────────────────────────────────────────────
 *   0 — 위반 0 (또는 `--population` / `--self-test` 성공)
 *   1 — 위반 발견, 또는 base 미해석 등 **판정 불가** (조용한 통과 없음)
 *   2 — 실행 에러 (잉여/누락 인자, prettier 바이너리 부재 등 환경 오류)
 *
 * ── 호출 ────────────────────────────────────────────────────────────────────
 *   node scripts/verify-md-tilde.mjs --staged        # .husky/pre-commit (index ↔ HEAD)
 *   node scripts/verify-md-tilde.mjs --base <sha>    # ci.yml pull_request (<sha> ↔ HEAD)
 *   node scripts/verify-md-tilde.mjs --self-test     # 격리 픽스처 + 3중 시뮬레이션
 *   node scripts/verify-md-tilde.mjs --population    # 모집단 관측 (ADR §재검토 조건 1)
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync, spawnSync } from 'node:child_process';
import { fileURLToPath, pathToFileURL } from 'node:url';

/** 처방 문구 — §7-1 규약과 **같은 낱말**을 쓴다 (ADR §결정 3). 우회로는 출력에 넣지 않는다. */
const PRESCRIPTION = '범위·구간 표기는 반드시 인라인 코드로 감싼다';
const ADR_PATH = 'docs/decisions/20260814-982-changelog-tilde-guard.md';
const TAG = '[md-tilde]';

/** 코드 펜스 — 3개 이상의 백틱 또는 물결. 들여쓰기는 CommonMark 상 최대 3칸. */
const FENCE_PATTERN = /^ {0,3}(`{3,}|~{3,})(.*)$/;

/** 스크립트 위치 기준 prettier 바이너리 (cwd 무관 — self-test 가 임시 저장소에서 돈다). */
const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const PRETTIER_BIN = path.resolve(SCRIPT_DIR, '..', 'node_modules', '.bin', 'prettier');

const EXEC_OPTS = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };

// ────────────────────────────────────────────────────────────────────────────
// 분류기 (순수 함수 — 파일/깃 무의존, self-test 픽스처가 직접 호출)
// ────────────────────────────────────────────────────────────────────────────

/**
 * 한 줄의 인라인 코드 스팬 구간 목록 `[start, end)` (0-기반 컬럼).
 *
 * CommonMark 규칙: 길이 N 의 백틱 런으로 열고 **정확히 같은 길이 N** 의 런으로 닫는다.
 * 짝을 못 찾은 여는 런은 리터럴 텍스트이므로 그 다음 런부터 다시 개폐를 시도한다.
 */
export function codeSpanRanges(line) {
  const runs = [];
  const runPattern = /`+/g;
  let match;
  while ((match = runPattern.exec(line)) !== null) {
    runs.push({ start: match.index, len: match[0].length });
  }
  const ranges = [];
  let i = 0;
  while (i < runs.length) {
    const open = runs[i];
    let closeIdx = -1;
    for (let j = i + 1; j < runs.length; j++) {
      if (runs[j].len === open.len) {
        closeIdx = j;
        break;
      }
    }
    if (closeIdx === -1) {
      // 닫히지 않은 런 — 리터럴. 다음 런부터 재시도 (라인 단위 판정, §범위 경계 (iii))
      i++;
      continue;
    }
    const close = runs[closeIdx];
    ranges.push([open.start, close.start + close.len]);
    i = closeIdx + 1;
  }
  return ranges;
}

/**
 * 한 줄에서 인라인 코드 밖의 `~~` 컬럼 목록 (0-기반, 비겹침 계수).
 * 비겹침은 `grep -oF -- '~~' | wc -l` 과 같은 계수 규약이다 (ADR 실측값과 대조 가능).
 */
export function findBareTildes(line) {
  const ranges = codeSpanRanges(line);
  const columns = [];
  let idx = line.indexOf('~~');
  while (idx !== -1) {
    const inSpan = ranges.some(([start, end]) => idx >= start && idx < end);
    if (!inSpan) columns.push(idx);
    idx = line.indexOf('~~', idx + 2);
  }
  return columns;
}

/**
 * 파일 전체 내용 → 위반 라인 목록 `[{ lineNo, line, columns }]` (lineNo 는 1-기반).
 *
 * 펜스는 **문자 종류 + 길이**를 들고 간다. 단순 토글로 처리하면 백틱 펜스 안에 인용된
 * 물결 펜스가 블록을 잘못 닫고, 물결 펜스 delimiter 자신이 위반으로 계수된다
 * (ADR §Developer 인계 self-test 3항이 지목한 케이스).
 */
export function scanContent(content) {
  const violations = [];
  const lines = content.split('\n');
  let fence = null; // { char, len }
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const fenceMatch = FENCE_PATTERN.exec(line);
    if (fenceMatch) {
      const char = fenceMatch[1][0];
      const len = fenceMatch[1].length;
      const info = fenceMatch[2];
      if (fence) {
        // 닫는 펜스: 같은 문자 · 여는 길이 이상 · info string 없음
        if (char === fence.char && len >= fence.len && info.trim() === '') fence = null;
        // 그 밖의 delimiter 유사 라인은 펜스 **안**의 본문이므로 어느 쪽이든 미검사
        continue;
      }
      // 여는 펜스 후보. 백틱 펜스의 info string 에는 백틱이 올 수 없다 (CommonMark).
      if (!(char === '`' && info.includes('`'))) {
        fence = { char, len };
        continue;
      }
      // 펜스가 아니다 → 아래 본문 검사로 진행
    }
    if (fence) continue; // 펜스 안 (닫히지 않은 펜스는 EOF 에서 닫힌다 — CommonMark)
    const columns = findBareTildes(line);
    if (columns.length > 0) violations.push({ lineNo: i + 1, line, columns });
  }
  return violations;
}

/**
 * `git diff -U0` 출력 → 추가 라인 번호 집합 (post-image 기준, 1-기반).
 * hunk 헤더만 읽는다 — 추가 본문 라인이 `+@@ …` 형태로 위장해도 `^@@` 에 걸리지 않는다.
 */
export function addedLineNumbers(diffText) {
  const set = new Set();
  const hunkPattern = /^@@ -\d+(?:,\d+)? \+(\d+)(?:,(\d+))? @@/;
  for (const line of diffText.split('\n')) {
    const match = hunkPattern.exec(line);
    if (!match) continue;
    const start = Number(match[1]);
    const count = match[2] === undefined ? 1 : Number(match[2]);
    for (let k = 0; k < count; k++) set.add(start + k);
  }
  return set;
}

// ────────────────────────────────────────────────────────────────────────────
// 실행 계층 (git · prettier — 셸 미경유. volt #114 계보)
// ────────────────────────────────────────────────────────────────────────────

function git(args, opts = {}) {
  return execFileSync('git', args, { ...EXEC_OPTS, ...opts });
}

function requirePrettierBin() {
  if (!fs.existsSync(PRETTIER_BIN)) {
    console.error(
      `${TAG} prettier 바이너리 부재: ${PRETTIER_BIN}\n` +
        `${TAG} 모집단 판정이 불가능하다. \`pnpm install --frozen-lockfile\` 선행 필요.`,
    );
    process.exit(2);
  }
  return PRETTIER_BIN;
}

/**
 * 모집단 판정 — prettier 가 소유하는 markdown 인가.
 * 판정 출처는 prettier 단일이며 파일 목록을 하드코딩하지 않는다 (ADR §결정 1).
 */
export function isPrettierOwnedMarkdown(file, prettierBin = requirePrettierBin()) {
  if (!file.endsWith('.md')) return false;
  const raw = execFileSync(prettierBin, ['--file-info', file], EXEC_OPTS);
  let info;
  try {
    info = JSON.parse(raw);
  } catch {
    throw new Error(`prettier --file-info 출력 파싱 실패 (${file}): ${raw}`);
  }
  if (typeof info.ignored !== 'boolean') {
    throw new Error(`prettier --file-info 에 ignored 필드 없음 (${file}): ${raw}`);
  }
  if (info.ignored) return false;
  if (info.inferredParser !== 'markdown') {
    // `.md` 인데 markdown 파서가 아니다 = prettier 설정 drift. 조용히 통과시키지 않는다.
    throw new Error(
      `${file} 은 .md 이지만 inferredParser 가 '${info.inferredParser}' 다 (prettier 설정 drift)`,
    );
  }
  return true;
}

/** NUL 구분 목록 파싱 (`git … -z`). */
function parseNulList(text) {
  return text.split('\0').filter(Boolean);
}

/**
 * 변경 파일 × 추가 라인 ∩ post-image 위반 라인.
 * @param {'staged'|'base'} mode
 * @param {string|null} baseSha
 */
function collectViolations(mode, baseSha) {
  const prettierBin = requirePrettierBin();
  const diffArgs = mode === 'staged' ? ['diff', '--cached'] : ['diff', baseSha, 'HEAD'];
  const nameArgs = [...diffArgs, '--name-only', '-z', '--diff-filter=ACMR'];
  const files = parseNulList(git(nameArgs)).filter((f) => f.endsWith('.md'));

  const targets = files.filter((f) => isPrettierOwnedMarkdown(f, prettierBin));
  const findings = [];
  for (const file of targets) {
    const diffText = git([...diffArgs, '-U0', '--no-color', '--', file]);
    const added = addedLineNumbers(diffText);
    if (added.size === 0) continue;
    const spec = mode === 'staged' ? `:${file}` : `HEAD:${file}`;
    const content = git(['show', spec]);
    for (const violation of scanContent(content)) {
      if (added.has(violation.lineNo)) findings.push({ file, ...violation });
    }
  }
  return { files, targets, findings };
}

function report({ files, targets, findings }) {
  console.log(
    `${TAG} 검사 대상 — 변경된 .md ${files.length}건 중 prettier 소유 ${targets.length}건` +
      (targets.length > 0 ? `: ${targets.join(', ')}` : ''),
  );
  if (findings.length === 0) {
    console.log(`${TAG} PASS — 추가 라인의 bare \`~~\` 0건`);
    return 0;
  }
  const lineCount = new Set(findings.map((f) => `${f.file}:${f.lineNo}`)).size;
  const occurrences = findings.reduce((sum, f) => sum + f.columns.length, 0);
  console.error(`${TAG} FAIL — bare \`~~\` ${occurrences}건 (${lineCount}줄)`);
  for (const finding of findings) {
    for (const col of finding.columns) {
      console.error(`  ${finding.file}:${finding.lineNo}:${col + 1}  ${finding.line.trim()}`);
    }
  }
  console.error(`${TAG} ${PRESCRIPTION}`);
  console.error(`${TAG} 근거: ${ADR_PATH} / docs/ops/operational-friction.md §7-1`);
  return 1;
}

// ────────────────────────────────────────────────────────────────────────────
// 모드
// ────────────────────────────────────────────────────────────────────────────

function runStaged() {
  return report(collectViolations('staged', null));
}

function runBase(baseSha) {
  // base 미해석은 판정 불가다 — 조용한 통과 분기를 두지 않는다 (ADR §결정 3).
  const resolved = spawnSync('git', ['rev-parse', '--verify', `${baseSha}^{commit}`], EXEC_OPTS);
  if (resolved.status !== 0) {
    console.error(
      `${TAG} base 미해석: '${baseSha}' — 판정 불가로 FAIL 한다 (조용한 통과 없음).\n` +
        `${TAG} CI 라면 \`git fetch --no-tags --depth=1 origin <base sha>\` 선행 여부를 확인한다.`,
    );
    return 1;
  }
  return report(collectViolations('base', resolved.stdout.trim()));
}

/** 모집단 관측 — 항상 exit 0. 판단은 사람이 한다 (§모집단 감시). */
function runPopulation() {
  const prettierBin = requirePrettierBin();
  const all = git(['ls-files', '-z', '*.md']);
  const files = parseNulList(all);
  const owned = files.filter((f) => isPrettierOwnedMarkdown(f, prettierBin));
  console.log(`${TAG} 모집단 관측 (ADR ${ADR_PATH} §재검토 조건 1)`);
  console.log(`${TAG}   tracked *.md            : ${files.length}`);
  console.log(`${TAG}   prettier ignored: false : ${owned.length}`);
  for (const file of owned) console.log(`${TAG}     - ${file}`);
  console.log(
    `${TAG} ADR 박제값은 5 다. 계수가 늘었으면 **차단이 아니라 재측정** 이 트리거다 —\n` +
      `${TAG} 늘어난 파일에 의도된 취소선이 있는지 확인하고 ADR §재검토 조건 1 을 갱신한다.`,
  );
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────
// self-test — (A) 분류기 격리 픽스처 (B) 임시 저장소 3중 시뮬레이션
// ────────────────────────────────────────────────────────────────────────────

/** 물결 2개 리터럴. 픽스처 가독성을 위해 상수로 뺀다. */
const TT = '~~';

function selfTestClassifier() {
  // [설명, 입력 라인, 기대 위반 발생 수]
  const lineCases = [
    ['백틱 1개 런이 감싼 물결쌍 — 인라인 코드', `\`a${TT}b\``, 0],
    ['백틱 2개 런', `\`\`a${TT}b\`\``, 0],
    ['백틱 3개 런', `\`\`\`a${TT}b\`\`\``, 0],
    ['런 길이 불일치 (2개로 열고 1개로 닫음) — 스팬 아님', `\`\`a${TT}b\``, 1],
    ['한 줄 다중 스팬 — 가운데 하나만 위반', `\`a${TT}b\` 산문 c${TT}d \`e${TT}f\``, 1],
    ['미닫힌 백틱 — 뒤따르는 물결쌍은 인라인 코드가 아니다', `\`unclosed a${TT}b`, 1],
    ['물결 4개는 비겹침 2건으로 센다', `x${TT}${TT}y`, 2],
    ['의도된 취소선도 금지 (ADR §결정 2)', `${TT}철회된 항목${TT} 잔여`, 2],
    ['물결 없음', '- 평범한 항목 `code` 포함', 0],
    ['백슬래시 이스케이프는 해석하지 않음 (과보고 방향)', `a\\${TT}b`, 1],
  ];
  for (const [desc, line, expected] of lineCases) {
    const actual = findBareTildes(line).length;
    assert.equal(actual, expected, `[라인] ${desc}: 기대 ${expected}, 실제 ${actual}`);
  }

  // [설명, 파일 내용 라인 배열, 기대 위반 라인 번호 배열]
  const fileCases = [
    ['백틱 펜스 안은 미검사', ['서두', '```text', `R1${TT}R4`, '```', `본문 R1${TT}R4`], [5]],
    [
      '물결 펜스 — delimiter 자신을 위반으로 세지 않는다',
      ['서두', `${TT}~text`, `R1${TT}R4`, `${TT}~`, `본문 R1${TT}R4`],
      [5],
    ],
    [
      '백틱 펜스 안의 물결 펜스는 블록을 닫지 않는다',
      ['```text', `${TT}~`, `R1${TT}R4`, '```', `본문 R1${TT}R4`],
      [5],
    ],
    [
      '물결 펜스 안의 백틱 펜스는 블록을 닫지 않는다',
      [`${TT}~text`, '```', `R1${TT}R4`, `${TT}~`, `본문 R1${TT}R4`],
      [5],
    ],
    ['닫는 펜스는 여는 펜스보다 길어도 된다', ['```', `R1${TT}R4`, '````', `본문 R1${TT}R4`], [4]],
    [
      'info string 이 붙은 라인은 닫는 펜스가 아니다',
      ['```text', `R1${TT}R4`, '```js', `여전히 안 R1${TT}R4`],
      [],
    ],
    [
      '닫히지 않은 펜스는 EOF 에서 닫힌다 (CommonMark) — 이후 전 라인 미검사',
      ['```text', `R1${TT}R4`, `본문 R1${TT}R4`],
      [],
    ],
    ['펜스 밖 다중 라인', [`a${TT}b`, '평범', `c${TT}d`], [1, 3]],
  ];
  for (const [desc, lines, expected] of fileCases) {
    const actual = scanContent(lines.join('\n')).map((v) => v.lineNo);
    assert.deepEqual(actual, expected, `[파일] ${desc}: 기대 ${expected}, 실제 ${actual}`);
  }

  // ADR §Developer 인계 §negative 실증 — 세 커밋의 **해당 라인 문자열**이 결정적 픽스처다.
  // git 상태를 재현할 필요가 없다 (가드의 입력은 커밋이 아니라 라인).
  const adrFixtures = [
    [
      '4f4544d — 링크 경계 (하한 술어 A 가 놓치는 형태)',
      `- harness-setting#320${TT}#324 / [#852](…/issues/852)${TT}[#858](…)`,
      2,
    ],
    ['909c55c — 산문 범위 2건', `Amendment 7${TT}12 누적 + R1${TT}R3 후속`, 2],
    [
      'aeb6c07 — 인라인 코드 안의 정규식 인용 (오검출 후보)',
      '술어: `[0-9A-Za-z]+' + TT + '[0-9A-Za-z]+`',
      0,
    ],
  ];
  for (const [desc, line, expected] of adrFixtures) {
    const actual = findBareTildes(line).length;
    assert.equal(actual, expected, `[ADR 픽스처] ${desc}: 기대 ${expected}, 실제 ${actual}`);
  }

  // 추가 라인 교집합 (diff 스코프) — hunk 헤더 파싱
  const diffCases = [
    ['단일 라인 추가 (count 생략)', '@@ -10 +11 @@\n+foo', [11]],
    ['범위 추가', '@@ -0,0 +1,3 @@\n+a\n+b\n+c', [1, 2, 3]],
    ['순수 삭제 hunk (count 0)', '@@ -5,2 +4,0 @@\n-x\n-y', []],
    ['본문이 hunk 헤더로 위장해도 무시', '@@ -1 +1 @@\n+@@ -9,9 +9,9 @@', [1]],
    ['헤더 없음', 'diff --git a/x b/x', []],
  ];
  for (const [desc, diffText, expected] of diffCases) {
    const actual = [...addedLineNumbers(diffText)].sort((a, b) => a - b);
    assert.deepEqual(actual, expected, `[diff] ${desc}: 기대 ${expected}, 실제 ${actual}`);
  }

  const total = lineCases.length + fileCases.length + adrFixtures.length + diffCases.length;
  console.log(`${TAG} self-test (A) 분류기 PASS — ${total} cases`);
}

/** 임시 저장소에서 스크립트 자신을 실행 (격리 동적 테스트). */
function runSelfInRepo(repoDir, args) {
  const result = spawnSync(process.execPath, [fileURLToPath(import.meta.url), ...args], {
    cwd: repoDir,
    encoding: 'utf8',
  });
  return { status: result.status, out: `${result.stdout || ''}${result.stderr || ''}` };
}

/**
 * (B) 3중 시뮬레이션 — positive(위반 없음) → negative(위반 주입 시 FAIL) → recovery(수정 후 PASS).
 * `docs/lessons/guard-pr-dod.md` 4축 중 ①격리 동적 테스트 · ②3중 시뮬레이션.
 */
function selfTestIntegration() {
  const repoDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-tilde-selftest-'));
  const changelog = path.join(repoDir, 'CHANGELOG.md');
  const ignored = path.join(repoDir, 'IGNORED.md');
  const g = (args) => git(args, { cwd: repoDir });
  try {
    g(['init', '-q', '-b', 'main']);
    g(['config', 'user.email', 'selftest@example.com']);
    g(['config', 'user.name', 'selftest']);
    // 사전 손상 1줄 — diff 밖이라 보고되면 안 된다 (스코프 계약 3)
    fs.writeFileSync(changelog, `# CHANGELOG\n\n- 기존 손상 R1${TT}R4 (확정 구간 모사)\n`);
    fs.writeFileSync(ignored, `- 무시 대상 R1${TT}R4\n`);
    fs.writeFileSync(path.join(repoDir, '.prettierignore'), 'IGNORED.md\n');
    g(['add', '-A']);
    g(['commit', '-q', '-m', 'base']);
    const baseSha = g(['rev-parse', 'HEAD']).trim();

    // (1) positive — 스테이지 비었음
    let r = runSelfInRepo(repoDir, ['--staged']);
    assert.equal(r.status, 0, `(1) 변경 없음 → PASS 기대, 실제 ${r.status}\n${r.out}`);

    // (2) 사전 손상은 diff 밖이라 무보고 — 무관한 라인만 추가
    fs.appendFileSync(changelog, '- 무해한 추가 라인\n');
    g(['add', 'CHANGELOG.md']);
    r = runSelfInRepo(repoDir, ['--staged']);
    assert.equal(r.status, 0, `(2) 사전 손상은 diff 밖 → PASS 기대, 실제 ${r.status}\n${r.out}`);

    // (3) negative — 추가 라인에 위반 주입
    fs.appendFileSync(changelog, `- 신규 범위 표기 7${TT}12 라운드\n`);
    g(['add', 'CHANGELOG.md']);
    r = runSelfInRepo(repoDir, ['--staged']);
    assert.equal(r.status, 1, `(3) 위반 주입 → FAIL 기대, 실제 ${r.status}\n${r.out}`);
    assert.match(r.out, /CHANGELOG\.md:5:/, `(3) 파일:줄 국소화 실패\n${r.out}`);
    assert.ok(r.out.includes(PRESCRIPTION), `(3) 처방 문구 누락\n${r.out}`);

    // (4) recovery — 인라인 코드로 감싸면 통과 (= 규약 준수가 최저 마찰 대응)
    fs.writeFileSync(changelog, fs.readFileSync(changelog, 'utf8').replace(`7${TT}12`, '`7~12`'));
    g(['add', 'CHANGELOG.md']);
    r = runSelfInRepo(repoDir, ['--staged']);
    assert.equal(r.status, 0, `(4) 수정 후 PASS 기대, 실제 ${r.status}\n${r.out}`);

    // (5) prettier 미소유 파일은 위반이 있어도 무보고 (모집단 계약 1)
    fs.appendFileSync(ignored, `- 추가 손상 R5${TT}R8\n`);
    g(['add', 'IGNORED.md']);
    r = runSelfInRepo(repoDir, ['--staged']);
    assert.equal(r.status, 0, `(5) prettier 무시 파일 → PASS 기대, 실제 ${r.status}\n${r.out}`);

    // (6) --base 모드 — 커밋 후 base 대비 검사
    g(['commit', '-q', '-m', 'clean commit']);
    fs.appendFileSync(changelog, `- 커밋된 위반 92k${TT}122.5k km\n`);
    g(['add', 'CHANGELOG.md']);
    g(['commit', '-q', '-m', 'dirty commit']);
    r = runSelfInRepo(repoDir, ['--base', baseSha]);
    assert.equal(r.status, 1, `(6) --base 위반 → FAIL 기대, 실제 ${r.status}\n${r.out}`);

    // (7) --base 미해석 → 판정 불가 FAIL (조용한 통과 없음)
    r = runSelfInRepo(repoDir, ['--base', 'deadbeefdeadbeefdeadbeefdeadbeefdeadbeef']);
    assert.equal(r.status, 1, `(7) base 미해석 → FAIL 기대, 실제 ${r.status}\n${r.out}`);
    assert.match(r.out, /판정 불가/, `(7) 판정 불가 사유 누락\n${r.out}`);

    // (8) recovery (--base) — 위반 라인을 되돌리면 통과
    fs.writeFileSync(
      changelog,
      fs.readFileSync(changelog, 'utf8').replace(`92k${TT}122.5k`, '`92k~122.5k`'),
    );
    g(['add', 'CHANGELOG.md']);
    g(['commit', '-q', '-m', 'fix commit']);
    r = runSelfInRepo(repoDir, ['--base', baseSha]);
    assert.equal(r.status, 0, `(8) --base 수정 후 PASS 기대, 실제 ${r.status}\n${r.out}`);

    console.log(`${TAG} self-test (B) 3중 시뮬레이션 PASS — 8 단계 (격리 저장소: 임시 디렉토리)`);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

function selfTest() {
  selfTestClassifier();
  selfTestIntegration();
  console.log(`${TAG} self-test PASS`);
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────

function usage() {
  console.error('사용법: verify-md-tilde.mjs --staged | --base <sha> | --self-test | --population');
  return 2;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length === 0) process.exit(usage());

  // 저장소 루트 기준으로 동작한다 (git 출력 경로 · prettier ignore 해석 기준을 일치시킨다).
  const toplevel = git(['rev-parse', '--show-toplevel']).trim();
  process.chdir(toplevel);

  if (args[0] === '--self-test' && args.length === 1) process.exit(selfTest());
  if (args[0] === '--population' && args.length === 1) process.exit(runPopulation());
  if (args[0] === '--staged' && args.length === 1) process.exit(runStaged());
  if (args[0] === '--base' && args.length === 2) process.exit(runBase(args[1]));
  process.exit(usage());
}

// 직접 실행 시에만 main (테스트에서 import 가능하도록).
// symlink 경로 (macOS /tmp 등) 에서 조용히 불일치하지 않도록 realpath 기반 URL 비교 (#840 클래스).
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main();
}
