#!/usr/bin/env node
/**
 * verify-md-conflict-marker.mjs
 *
 * 머지 충돌 마커가 커밋물에 남는 것을 금지하는 **전수** 가드 (#1103).
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────────
 * `origin/develop` 에 충돌 마커가 실제로 커밋됐다 (`fa497b6`, PR #1095 머지분의
 * `CHANGELOG.md`). 머지 해소 때마다 마커 `0` 을 육안·`grep` 으로 확인해 왔는데도 통과한
 * 이유는, **커밋 직전에 `lint-staged` 의 `prettier --write` 가 마커를 마크다운 문법으로
 * 정규화**하기 때문이다. 검사 시점의 형태와 커밋물의 형태가 다르다.
 *
 * `verify-md-tilde.mjs` (#982) 와 **뿌리가 같다** — _"손상은 작성자가 타이핑하지 않는다.
 * 포맷터가 쓴다."_ 그리고 `prettier --check` 로도 탐지되지 않는다: `--write` 가 만든 형태는
 * prettier 기준으로 **정답**이라 이후 `--check` 도 초록이다.
 *
 * ── 실측 매트릭스 (rev `0ee0de1` / prettier `3.9.6` / 격리 픽스처) ──────────
 * 변형은 **마커 종류 × 앞줄 상태**의 2축이다. 「`sep` 은 escape 된다」 처럼 한 축만 보면
 * 나머지를 놓친다. (마커는 `open`/`base`/`sep`/`close` 대역 이름으로만 적는다 — §5)
 *
 *   마커            | 앞줄이 빈 줄        | 앞줄에 텍스트 인접 (리스트 lazy continuation)
 *   ----------------|---------------------|---------------------------------------------
 *   open   (7 lt)   | 그대로              | 그대로
 *   base   (7 pipe) | 그대로              | **선행 2칸 들여쓰기**
 *   sep    (7 eq)   | 그대로              | **선행 2칸 + 백슬래시 escape**
 *   close  (7 gt)   | **blockquote 정규화** | **blockquote 정규화**
 *
 * ⚠️ 두 가지가 여기서 나온다:
 *   (1) **선행 공백은 `sep` 만의 문제가 아니다** — `base` 도 들여쓰기가 붙는다. 그래서 원형
 *       술어 전체에 `^\s*` 를 넣는다. 행 선두 앵커만 쓰면 리스트 안 충돌을 통째로 놓친다.
 *   (2) `close` 는 **앞줄 상태와 무관하게** 항상 변형된다 (`> ` 반복). 반대로 `sep` 의 escape
 *       는 **조건부**라, 실사고 형태(빈 줄 분리)에서는 원형 그대로 남아 있었다.
 *
 * ── 검사 계약 ───────────────────────────────────────────────────────────────
 *   1. **모집단** — `git ls-files` 의 tracked 파일 전수. 바이너리는 `git grep -I` 와 같은
 *      기준으로 제외한다 (NUL 바이트 포함 파일).
 *      ⚠️ `verify-md-tilde.mjs` 와 모집단이 **다르다**. 저쪽은 prettier 소유 md 한정인데,
 *      충돌 마커는 prettier 가 손대지 않는 파일에도 (원형 그대로) 남을 수 있어 소유 여부가
 *      경계가 되지 못한다. 이것이 저 스크립트를 확장하지 않고 신설한 첫째 근거다.
 *   2. **술어** — 원형 4형태는 전 파일, prettier 변형 2형태는 `.md` 한정. 변형은 markdown
 *      파서를 거칠 때만 생기므로 `.ts` 주석 등에는 나타나지 않는다.
 *   3. **스코프** — **전수**다. diff 스코프가 아니다.
 *      ⚠️ 이것이 `verify-md-tilde.mjs` 와 갈리는 둘째 근거다. 저쪽이 diff 로 좁힌 이유는
 *      확정 릴리스 구간의 존량 21줄을 #1040 판정 전까지 손댈 수 없어 전수가 alert fatigue
 *      가 되기 때문인데 (#766 계보), **충돌 마커에는 "고칠 수 없는 존량" 이라는 범주가
 *      없다**. 마커는 언제 어디서 발견되든 결함이다. 도입 시점 저장소 존량도 `0` 이다
 *      (rev `0ee0de1`, 6형태 전건 · 같은 실행 양성 대조군 `^## ` 248 파일).
 *   4. **fail-fast** — `|| true` · soft-exit · allowlist · 예외 경로를 두지 않는다
 *      (CLAUDE.md §가드 설계 원칙).
 *   5. **자기 참조 회피** — 이 파일과 문서는 마커를 **리터럴로 적지 않는다**. 술어는
 *      `'<'.repeat(7)` 처럼 조립하고, 설명은 `7 lt` 같은 대역 표기를 쓴다. 가드가 자기
 *      자신을 유일한 hit 으로 잡는 사고의 전례가 있다 (#995 — 그 가드는 12.57배 거짓
 *      근거를 놓친 채 자기 주석만 찾고 있었다).
 *
 * ── 범위 경계 (의도적 미검출) ───────────────────────────────────────────────
 *   (i)   **코드 펜스 안도 검사한다.** 마커를 예시로 보여주려는 문서가 걸릴 수 있으나,
 *         방향이 **과보고**(fail-loud)라 그대로 둔다. 예시가 필요하면 §5 의 대역 표기를
 *         쓴다 — 존재 불가 형태로 적으면 구조적으로 무해하다 (#999 전례).
 *   (ii)  **`.md` 외 파일의 prettier 변형형은 보지 않는다** (§2). prettier 는 md 파서를
 *         거칠 때만 이 정규화를 하므로, 다른 확장자에서 찾는 것은 순수 오탐 표면이다.
 *   (iii) **conflictStyle `zdiff3` 의 축약 마커는 별도로 두지 않는다** — 마커 문자 자체는
 *         `diff3` 와 같은 4종이라 술어가 그대로 덮는다.
 *
 * ── 오탐 축 실측 (rev `0ee0de1`, tracked 744 파일 전수) ──────────────────────
 * 술어별로 "정상 마크다운에 실재할 수 있는가" 를 따로 쟀다. 전건 `0`:
 *   - setext H1 (`eq` 연속) — `={7}` `0` / `={4,}` `0` / **`={2,}` 조차 `0`**
 *   - 표 문법 (`pipe` 7연속) `0` · 부등호 7연속 `0` · blockquote 6중첩 이상 `0`
 * 즉 이 저장소에서 6형태는 **마커 이외의 출처가 없다**. 시점 의존 값이므로 rev 를 병기한다
 * (ADR `20260808-983` §수치 박제 규약 4항).
 *
 * ── 종료 코드 ───────────────────────────────────────────────────────────────
 *   0 — 위반 0 (또는 `--self-test` 성공)
 *   1 — 위반 발견
 *   2 — 실행 에러 (잉여/누락 인자, git 실행 실패 등 환경·상태 오류)
 *
 * ── 호출 ────────────────────────────────────────────────────────────────────
 *   node scripts/verify-md-conflict-marker.mjs              # 전수 (pre-commit / CI)
 *   node scripts/verify-md-conflict-marker.mjs --self-test  # 격리 픽스처 3중 시뮬레이션
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';

/** 처방 문구 — 우회로(`--no-verify` 등)는 출력에 넣지 않는다. */
const PRESCRIPTION = '충돌 해소를 끝내고 마커를 제거한 뒤 다시 커밋한다';
const ISSUE = '#1103';
const TAG = '[md-conflict-marker]';

const EXEC_OPTS = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };

// ────────────────────────────────────────────────────────────────────────────
// 술어 — 마커를 리터럴로 적지 않는다 (§5 자기 참조 회피)
// ────────────────────────────────────────────────────────────────────────────

/** git 충돌 마커의 고정 길이. git 은 마커 문자를 항상 7개 낸다. */
const RUN = 7;

const LT = '<'.repeat(RUN);
const PIPE = '\\|'.repeat(RUN); // 정규식 안에서 이스케이프된 형태로 조립
const EQ = '='.repeat(RUN);
const GT = '>'.repeat(RUN);

/**
 * 6형태.
 *
 * `scope` 가 `md` 인 것은 prettier 가 markdown 파서를 거칠 때만 만드는 형태다 (§2).
 * `^\s*` 는 리스트 lazy continuation 이 붙이는 선행 들여쓰기를 덮는다 (§실측 매트릭스 (1)).
 */
const RULES = [
  { id: 'open', scope: 'all', re: new RegExp(`^\\s*${LT}(?:\\s|$)`) },
  { id: 'base', scope: 'all', re: new RegExp(`^\\s*${PIPE}(?:\\s|$)`) },
  { id: 'sep', scope: 'all', re: new RegExp(`^\\s*${EQ}\\s*$`) },
  { id: 'close', scope: 'all', re: new RegExp(`^\\s*${GT}(?:\\s|$)`) },
  // prettier 변형 — sep 은 백슬래시 escape, close 는 blockquote 정규화.
  { id: 'sep-escaped', scope: 'md', re: new RegExp(`^\\s*\\\\${EQ}\\s*$`) },
  { id: 'close-blockquote', scope: 'md', re: new RegExp(`^(?:> ){${RUN - 1},}`) },
];

/**
 * 한 파일의 내용을 검사한다 (순수 함수 — 파일/깃 무의존, self-test 가 직접 호출).
 *
 * @param {string} content 파일 전문
 * @param {boolean} isMarkdown `.md` 여부 — `scope: 'md'` 술어의 적용 조건
 * @returns {Array<{line: number, id: string, text: string}>}
 */
export function scanContent(content, isMarkdown) {
  const findings = [];
  const lines = content.split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const text = lines[i];
    for (const rule of RULES) {
      if (rule.scope === 'md' && !isMarkdown) continue;
      if (rule.re.test(text)) {
        findings.push({ line: i + 1, id: rule.id, text });
        break; // 한 줄은 한 형태로만 보고한다 (술어는 서로 배타적)
      }
    }
  }
  return findings;
}

// ────────────────────────────────────────────────────────────────────────────
// 수집 (git)
// ────────────────────────────────────────────────────────────────────────────

function git(args, opts = {}) {
  return execFileSync('git', args, { ...EXEC_OPTS, ...opts });
}

/** NUL 바이트가 있으면 바이너리로 본다 (`git grep -I` 와 같은 기준). */
function isBinary(buf) {
  return buf.includes(0);
}

function trackedFiles(cwd) {
  const out = git(['ls-files', '-z'], { cwd });
  return out.split('\0').filter((p) => p.length > 0);
}

function collectViolations(cwd) {
  const findings = [];
  let scanned = 0;
  for (const rel of trackedFiles(cwd)) {
    const abs = path.join(cwd, rel);
    let buf;
    try {
      buf = fs.readFileSync(abs);
    } catch {
      continue; // 인덱스에는 있으나 작업 트리에 없는 경로 (삭제 스테이징 등)
    }
    if (isBinary(buf)) continue;
    scanned += 1;
    const hits = scanContent(buf.toString('utf8'), rel.endsWith('.md'));
    for (const h of hits) findings.push({ file: rel, ...h });
  }
  return { findings, scanned };
}

function report({ findings, scanned }) {
  if (findings.length === 0) {
    console.log(`${TAG} 검사 ${scanned} 파일 — 충돌 마커 0`);
    return 0;
  }
  console.error(`${TAG} 충돌 마커 ${findings.length}건 (검사 ${scanned} 파일)`);
  for (const f of findings) {
    console.error(`  ${f.file}:${f.line}  [${f.id}]  ${JSON.stringify(f.text)}`);
  }
  console.error(`\n${TAG} ${PRESCRIPTION} (${ISSUE})`);
  return 1;
}

// ────────────────────────────────────────────────────────────────────────────
// self-test — 분류기 단위 + 격리 저장소 3중 시뮬레이션
// ────────────────────────────────────────────────────────────────────────────

/** 픽스처 조립용 — 여기서도 리터럴을 쓰지 않는다 (§5). */
const M = {
  open: `${'<'.repeat(RUN)} HEAD`,
  base: `${'|'.repeat(RUN)} base`,
  sep: '='.repeat(RUN),
  close: `${'>'.repeat(RUN)} origin/develop`,
  sepEscaped: `  \\${'='.repeat(RUN)}`,
  closeBlockquote: `${'> '.repeat(RUN)}origin/develop`,
};

function selfTestClassifier() {
  // (1) 6형태 전건 검출
  const positives = [
    ['open', M.open],
    ['base', M.base],
    ['sep', M.sep],
    ['close', M.close],
    ['sep-escaped', M.sepEscaped],
    ['close-blockquote', M.closeBlockquote],
  ];
  for (const [id, line] of positives) {
    const hits = scanContent(`# f\n\n${line}\n`, true);
    assert.equal(hits.length, 1, `positive 미검출: ${id}`);
    assert.equal(hits[0].id, id, `positive 오분류: ${id} → ${hits[0].id}`);
  }

  // (2) 선행 들여쓰기가 붙은 형태 — 행 선두 앵커만 쓰면 여기서 뚫린다 (§실측 (1))
  for (const [id, line] of [
    ['base', `  ${M.base}`],
    ['sep', `  ${M.sep}`],
    ['open', `  ${M.open}`],
    ['close', `  ${M.close}`],
  ]) {
    const hits = scanContent(`# f\n\n${line}\n`, true);
    assert.equal(hits.length, 1, `indented positive 미검출: ${id}`);
    assert.equal(hits[0].id, id, `indented positive 오분류: ${id}`);
  }

  // (3) md 한정 술어가 비-md 에서는 발화하지 않는다 (§2)
  for (const line of [M.sepEscaped, M.closeBlockquote]) {
    assert.equal(scanContent(`x\n${line}\n`, false).length, 0, 'md 한정 술어가 비-md 에서 발화');
  }
  // 원형은 비-md 에서도 발화한다
  assert.equal(scanContent(`x\n${M.open}\n`, false).length, 1, '원형이 비-md 에서 미발화');

  // (4) 오탐 대조군 — 정상 마크다운은 통과
  const negatives = [
    '> 1단계 인용',
    '> > 2단계 중첩',
    '> > > > > 5단계 중첩', // 6중첩 미만
    '| 열 A | 열 B |',
    '| --- | --- |',
    '제목',
    '===', // setext 이되 길이가 다름
    '='.repeat(RUN - 1),
    '='.repeat(RUN + 1),
    '<'.repeat(RUN - 1) + ' HEAD',
    `${'='.repeat(RUN)} 뒤에 텍스트`, // sep 은 단독 행만
    '### 헤딩',
    'a < b 이고 c > d 이다',
  ];
  for (const line of negatives) {
    const hits = scanContent(`# f\n\n${line}\n`, true);
    assert.equal(hits.length, 0, `오탐: ${JSON.stringify(line)} → ${hits.map((h) => h.id)}`);
  }

  console.log(
    `${TAG} self-test(분류기) — positive 10 / md-scope 3 / negative ${negatives.length} PASS`,
  );
}

/**
 * 3중 시뮬레이션 (positive → negative → recovery) — 가드 도입 PR DoD 축 2
 * (CLAUDE.md §가드 도입 PR DoD, docs/lessons/guard-pr-dod.md).
 *
 * 격리 임시 저장소를 만들어 **실제 프로세스로** 돌린다. 분류기 단위 테스트만으로는
 * 수집·종료 코드 경로가 검증되지 않는다.
 */
function selfTestIntegration() {
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-conflict-marker-'));
  try {
    git(['init', '-q'], { cwd: dir });
    git(['config', 'user.email', 'self-test@example.invalid'], { cwd: dir });
    git(['config', 'user.name', 'self-test'], { cwd: dir });

    const clean = '# 픽스처\n\n- 항목 A\n\n> 인용\n>\n> > 중첩\n';
    fs.writeFileSync(path.join(dir, 'a.md'), clean);
    fs.writeFileSync(path.join(dir, 'b.ts'), '// 주석\nexport const x = 1;\n');
    git(['add', '-A'], { cwd: dir });

    const run = () => {
      const script = path.resolve(
        path.dirname(fs.realpathSync(new URL(import.meta.url).pathname)),
        'verify-md-conflict-marker.mjs',
      );
      const r = execFileSync(process.execPath, [script], {
        cwd: dir,
        encoding: 'utf8',
        stdio: ['ignore', 'pipe', 'pipe'],
      });
      return { code: 0, out: r };
    };
    const runAllowFail = () => {
      try {
        return run();
      } catch (e) {
        return { code: e.status, out: `${e.stdout ?? ''}${e.stderr ?? ''}` };
      }
    };

    // ① positive — 깨끗한 저장소는 통과
    let r = runAllowFail();
    assert.equal(r.code, 0, `positive 단계가 exit ${r.code}`);

    // ② negative — 6형태를 각각 단독 주입하면 매번 FAIL
    const injections = [
      ['a.md', M.open],
      ['a.md', M.base],
      ['a.md', M.sep],
      ['a.md', M.close],
      ['a.md', M.sepEscaped],
      ['a.md', M.closeBlockquote],
      ['b.ts', M.open], // 비-md 원형
    ];
    for (const [file, line] of injections) {
      const orig = fs.readFileSync(path.join(dir, file), 'utf8');
      fs.writeFileSync(path.join(dir, file), `${orig}\n${line}\n`);
      const rr = runAllowFail();
      assert.equal(rr.code, 1, `negative 미발화: ${file} ← ${JSON.stringify(line)}`);
      fs.writeFileSync(path.join(dir, file), orig); // 즉시 원복
    }

    // ③ recovery — 원복 후 다시 통과
    r = runAllowFail();
    assert.equal(r.code, 0, `recovery 단계가 exit ${r.code}`);

    console.log(
      `${TAG} self-test(통합) — 3중 시뮬레이션 PASS (positive 1 / negative ${injections.length} / recovery 1)`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function selfTest() {
  selfTestClassifier();
  selfTestIntegration();
  console.log(`${TAG} self-test 전건 PASS`);
  return 0;
}

// ────────────────────────────────────────────────────────────────────────────

function usage() {
  console.error(`usage: node scripts/verify-md-conflict-marker.mjs [--self-test]`);
  return 2;
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 1) return usage();
  if (args.length === 1 && args[0] !== '--self-test') return usage();

  if (args[0] === '--self-test') return selfTest();

  const repoRoot = git(['rev-parse', '--show-toplevel']).trim();
  return report(collectViolations(repoRoot));
}

// 직접 실행일 때만 종료 코드를 낸다 (self-test 가 모듈로 import 할 수 있게).
if (
  process.argv[1] &&
  fs.realpathSync(process.argv[1]) === fs.realpathSync(new URL(import.meta.url).pathname)
) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`${TAG} 실행 에러: ${err.message}`);
    process.exit(2);
  }
}
