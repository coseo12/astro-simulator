#!/usr/bin/env node
/**
 * verify-adr-index.mjs
 *
 * `docs/decisions/README.md` §현재 ADR 인덱스 표의 **상태 열** ↔ ADR 실물 `상태:` 메타데이터
 * 대조 가드 (#1005).
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────────
 * 인덱스 계약 **(2) 상태 열 갱신 책임** — _"ADR 상태를 전이시키는 PR 이 같은 PR 에서 본 표를
 * 갱신한다"_ — 은 PR [#1004](https://github.com/coseo12/astro-simulator/pull/1004) 에서
 * 명문화됐으나 **강제 지점이 0** 이었다 (PR 템플릿 0건 / 에이전트 파일 0건 / 가드 0건).
 * 규범만 있고 발화 지점이 없으면 다음 전이 PR 에서 그대로 재현되며, 실제로 **두 번 실측**됐다:
 *
 *   - #993 — ADR `971` 전이 PR 의 변경 파일이 **정확히 2개** (`CHANGELOG.md` + 해당 ADR).
 *     계약 (2) 는 그 PR 이 **정의상 열지 않는 파일** 안에 있어 표가 `Provisional` 로 남았다.
 *     → 본 가드가 잡는 클래스. (self-test F2)
 *   - #1015 — 신규 ADR `20260811-1010` **미등재**. 계약 명문화 **바로 다음 PR** 에서 재발.
 *     → 본 가드 **범위 밖** (아래 §범위 경계). 미검출을 self-test F10 이 경계로 고정한다.
 *
 * 두 재발 모두 사람이 잡았다. 사람이 수동으로 맞춘 상태를 **다시 어긋나지 않게** 하는 것이
 * 본 가드의 목적이며, 그래서 도입 시점의 drift 는 0 이다 (positive PASS 는 작동 증거가 아니다
 * — 증거는 negative 픽스처다. `docs/lessons/guard-pr-dod.md`).
 *
 * ── 검사 계약 ───────────────────────────────────────────────────────────────
 *   1. 표 앵커 — `| 날짜 | 주제 | 상태 | 상하 관계 |` 헤더 + 구분선. 부재 시 FAIL
 *      (마크다운 표 파손 = 인덱스 자체 소실. PR #1009 헤딩 파손 클래스).
 *   2. 행 well-formedness — 데이터 셀 정확히 4개 / 주제 셀에 `.md` 링크 1건 이상 /
 *      날짜 셀 `YYYY-MM-DD` ↔ 파일명 `YYYYMMDD` 접두 일치 / 같은 파일 중복 등재 0.
 *   3. **상태 대조 (본체)** — 표 상태 셀의 상태 토큰 == ADR 실물 첫 `상태:` 메타데이터 라인의
 *      상태 토큰. 불일치 시 FAIL. **fallback 분기 없음** — 상태 라인 부재 / 어휘 밖 토큰은
 *      "판정 불가" 를 통과로 흘리지 않고 그 자체를 FAIL 로 보고한다
 *      (CLAUDE.md §가드 설계 원칙 — drift 가드는 fail-fast 만).
 *   4. **upstream-only 제외** — 로컬 파일이 없는 행은 대조 대상에서 제외하되 **제외 사실과
 *      제외 근거를 매 실행 stdout 에 명시** (silent skip 금지). 제외 판정은 3원 일치를 요구한다:
 *        (a) 로컬 파일 부재 ⟺ (b) 주제 셀 `(upstream-only)` 표기 ⟺ (c) allowlist 등록
 *      셋이 갈리면 FAIL. (c) 의 목록은 `scripts/upstream-only-allowlist.mjs` 로,
 *      `verify-docs-links.mjs` 와 **같은 객체를 import** 한다 — 두 가드의 제외 집합이
 *      구조적으로 갈릴 수 없다 (사본 금지 · volt #120).
 *      upstream 실물 상태 대조는 네트워크 의존이라 CI 범위 밖이다 (이슈 #1005 §비목표).
 *      README 계약 (3) 의 1줄 `gh api` GET 이 그 수동 절차이며, 본 가드는 제외 행마다
 *      그 명령을 stdout 에 재출력해 "봉인" 이 아니라 **인계**임을 남긴다.
 *
 * ── 상태 토큰 규칙 ──────────────────────────────────────────────────────────
 * 표와 ADR 실물의 상태 서술은 형식이 다르다 (`Accepted` vs
 * `**Accepted** (cross-validate agy 2026-08-11 — …)`). 그래서 문자열 동일성이 아니라
 * **상태 토큰** 을 비교한다:
 *   - 링크 `[t](u)` → `t`, 강조/코드 마커(`*`, `_`, `` ` ``) 제거 후
 *   - 어휘 {Accepted, Provisional, Proposed, Superseded, Deprecated, Rejected} 중
 *     **가장 먼저 등장하는** 토큰이 정본 (대소문자 무시, `\b` 경계).
 *   - `NO-OP` 은 상태가 아니라 **결정 성격 수식어** 라 어휘에 넣지 않는다. 덕분에 표
 *     `Accepted (NO-OP)` ↔ 실물 `**NO-OP** (Accepted, 2026-05-11)` 이 정합 판정된다.
 *   - `Supersedes`(능동, 이 ADR 이 무엇을 대체하는가) 는 `Superseded`(수동, 상태) 와 다른
 *     낱말이라 `\b` 경계에서 매칭되지 않는다 — 상하 관계 열은 애초에 파싱 대상도 아니다.
 * 어휘·순서 규칙을 바꾸면 판정이 바뀐다. 바꿀 때 본 헤더 계약을 같이 갱신할 것.
 *
 * ── 범위 경계 (의도적 미검출) ───────────────────────────────────────────────
 *   (i) **미등재 검출 — 범위 밖** (이슈 #1005 완료 기준 1항이 상태 대조만 규정).
 *       등재 기준(계약 1)이 _"이 결정을 모른 채 무관한 작업을 하면 그 작업이 규약을
 *       위반하는가?"_ 라는 **의미론적 판정**이라, 기계가 등재 대상 여부를 precision 1.0 으로
 *       결정할 수 없다. 실측 근거 2건: ① ADR 실물 **95건 중 인덱스 등재 로컬 5건** — 전수
 *       등재를 강제하면 오탐 90건. ② _"CLAUDE.md/.claude/scripts 에서 참조되면 횡단"_
 *       휴리스틱은 **precision 3/17 · recall 3/5** (2026-08-12 실측) 로 1.0 미달.
 *       precision 1.0 대안은 ADR 자기 선언 마커(예: `- 인덱스: 등재|비대상`) 인데 이는
 *       **신규 규약 신설**이라 cross-validate 발동 앵커 + `record-adr` 스킬·템플릿 동시
 *       개정을 요구한다 → 별도 이슈로 분리. self-test **F10** 이 이 경계를 픽스처로 고정해,
 *       미래 관찰자가 미검출을 _"가드 결함"_ 으로 오인하지 않게 한다.
 *   (ii) **산문 역참조 — 범위 밖** (이슈 #1005 완료 기준 4항 / 비목표). 본문 안의 상태 서술
 *       (예: 다른 문서가 `20260701-779` 를 _"Provisional"_ 로 적는 문장) 은 표 셀이 아니라
 *       자연어라 별개 난이도다. 계약 (2) 도 이 클래스를 덮지 않는다.
 *
 * 종료 코드:
 *   0 — 위반 0
 *   1 — 위반 발견 (README 라인 번호 + 사유 출력)
 *   2 — 실행 에러 (스캔 루트 / README 부재, 잉여 인자 등)
 *
 * 호출:
 *   node scripts/verify-adr-index.mjs               # 검사 (CI 기본)
 *   node scripts/verify-adr-index.mjs --self-test   # 격리 픽스처 F1~F16 (positive/negative/recovery)
 *   ADR_INDEX_ROOT=<dir> node scripts/verify-adr-index.mjs   # 스캔 루트 override (self-test 용)
 *
 * 관련: 이슈 #1005 / PR #1004 (계약 명문화) / #998 축 B / ADR
 *       `docs/decisions/20260812-1005-adr-index-status-guard.md` /
 *       CLAUDE.md §가드 설계 원칙 · §가드 도입 PR DoD 4축 / docs/lessons/guard-pr-dod.md
 */

import { existsSync, mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

import { ADR_INDEX_UPSTREAM_ONLY_TARGETS } from './upstream-only-allowlist.mjs';

const SCRIPT_DIR = path.dirname(fileURLToPath(import.meta.url));
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');

/** 인덱스 표가 위치한 문서 (repo-relative) — allowlist 의 source 키와 같은 표기 */
const README_REL = 'docs/decisions/README.md';
/** ADR 실물 디렉토리 (repo-relative) */
const DECISIONS_DIR_REL = 'docs/decisions';

/** 표 앵커 — 이 헤더 라인이 없으면 인덱스 자체가 파손된 것으로 본다 */
const TABLE_HEADER = '| 날짜 | 주제 | 상태 | 상하 관계 |';
/** 표 열 수 (날짜 / 주제 / 상태 / 상하 관계) */
const TABLE_COLUMNS = 4;
/** 주제 셀의 upstream-only 표기 (계약 3) */
const UPSTREAM_ONLY_MARK = '(upstream-only)';

/**
 * 상태 어휘 (§상태 토큰 규칙). `NO-OP` 은 상태가 아니라 결정 성격 수식어라 제외한다.
 * 순서는 판정에 영향을 주지 않는다 — 텍스트에서 **가장 먼저 등장한** 토큰이 이긴다.
 */
const STATUS_VOCABULARY = [
  'Accepted',
  'Provisional',
  'Proposed',
  'Superseded',
  'Deprecated',
  'Rejected',
];

/** ADR 실물의 상태 메타데이터 라인 — `- 상태:` / `- **상태**:` / `> **상태**:` / `상태:` */
const STATUS_LINE_RE = /^\s*(?:>\s*)?(?:[-*+]\s+)?\*{0,2}상태\*{0,2}\s*:\s*(.*)$/;

/** upstream 실물 상태 대조 명령 (README 계약 3 의 1줄 GET — 쓰기 계열 금지) */
const upstreamCheckCommand = (file) =>
  `gh api repos/coseo12/harness-setting/contents/docs/decisions/${file} --jq .content | base64 -d | grep -m1 '상태'`;

// ── 파싱 ────────────────────────────────────────────────────────────────────

/**
 * 마크다운 표 행을 셀 배열로 분해. 이스케이프된 파이프(`\|`) 는 셀 구분자가 아니다.
 * `| a | b |` → ['a', 'b']
 */
function splitRow(line) {
  const trimmed = line.trim().replace(/^\|/, '').replace(/\|$/, '');
  return trimmed.split(/(?<!\\)\|/).map((c) => c.trim().replace(/\\\|/g, '|'));
}

/** 구분선 행인가 (`|---|---|---|---|`) */
const isSeparatorRow = (line) => /^\s*\|(?:\s*:?-{3,}:?\s*\|)+\s*$/.test(line);

/**
 * README 에서 인덱스 표를 추출.
 * 반환: { rows: [{ lineNo, cells }] } 또는 { error } (앵커/구분선 부재 = 표 파손)
 */
function parseIndexTable(content) {
  const lines = content.split('\n');
  const headerIdx = lines.findIndex((l) => l.trim() === TABLE_HEADER);
  if (headerIdx === -1) {
    return {
      error: `인덱스 표 앵커 부재 — 헤더 라인 '${TABLE_HEADER}' 를 찾지 못했습니다. 표가 파손됐거나 열 구성이 바뀌었습니다 (바뀐 것이 의도라면 verify-adr-index.mjs 의 TABLE_HEADER 를 같이 갱신).`,
    };
  }
  if (!isSeparatorRow(lines[headerIdx + 1] ?? '')) {
    return {
      error: `인덱스 표 구분선 부재 — README ${headerIdx + 2}행이 '|---|...' 형식이 아닙니다.`,
    };
  }
  const rows = [];
  for (let i = headerIdx + 2; i < lines.length; i += 1) {
    const line = lines[i];
    if (!line.trim().startsWith('|')) break;
    rows.push({ lineNo: i + 1, cells: splitRow(line) });
  }
  if (rows.length === 0) return { error: '인덱스 표에 데이터 행이 0건입니다.' };
  return { rows };
}

/** 주제 셀에서 ADR 파일명 추출 (첫 `.md` 링크) */
function extractAdrFileName(topicCell) {
  // 앵커(`#…`)·쿼리를 허용한다 — 없으면 링크가 **있는데도** "링크 부재" 라는
  // 거짓 진단으로 FAIL 한다 (cross-validate agy 2026-08-12 권고, 실측 재현).
  const m = /\[[^\]]*\]\(\s*([^)\s#?]+\.md)(?:[#?][^)\s]*)?\s*\)/.exec(topicCell);
  return m ? m[1] : null;
}

/** 링크/강조/코드 마커 제거 — 토큰 추출 전 정규화 */
function normalizeStatusText(raw) {
  return raw
    .replace(/\[([^\]]*)\]\([^)]*\)/g, '$1')
    .replace(/[*_`]/g, '')
    .trim();
}

/**
 * 상태 토큰 추출 — 어휘 중 **가장 먼저 등장하는** 토큰. 없으면 null (호출부가 FAIL 처리).
 */
function extractStatusToken(text) {
  const normalized = normalizeStatusText(text);
  let best = null;
  for (const token of STATUS_VOCABULARY) {
    const m = new RegExp(`\\b${token}\\b`, 'i').exec(normalized);
    if (m && (best === null || m.index < best.index)) best = { token, index: m.index };
  }
  return best ? best.token : null;
}

/** ADR 실물의 첫 상태 메타데이터 라인 — { lineNo, text } 또는 null */
function readAdrStatusLine(filePath) {
  const lines = readFileSync(filePath, 'utf8').split('\n');
  for (let i = 0; i < lines.length; i += 1) {
    const m = STATUS_LINE_RE.exec(lines[i]);
    if (m) return { lineNo: i + 1, text: m[1] };
  }
  return null;
}

// ── 검사 ────────────────────────────────────────────────────────────────────

/**
 * 메인 검사. 반환: { rows, compared, excluded, violations }
 *   compared  — 로컬 대조 수행 행 [{ file, token }]
 *   excluded  — upstream-only 제외 행 [{ file, tableToken }]
 *   violations— [{ lineNo, file, reason }]
 */
function runCheck(root) {
  const readmePath = path.join(root, README_REL);
  if (!existsSync(readmePath)) {
    const err = new Error(`인덱스 문서 부재: ${README_REL}`);
    err.exitCode = 2;
    throw err;
  }
  const violations = [];
  const compared = [];
  const excluded = [];
  const { rows, error } = parseIndexTable(readFileSync(readmePath, 'utf8'));
  if (error) {
    violations.push({ lineNo: 0, file: README_REL, reason: error });
    return { rows: [], compared, excluded, violations };
  }

  const seen = new Map();
  for (const { lineNo, cells } of rows) {
    if (cells.length !== TABLE_COLUMNS) {
      violations.push({
        lineNo,
        file: README_REL,
        reason: `표 열 수 불일치 — ${TABLE_COLUMNS}개 기대, ${cells.length}개 발견: ${cells.join(' ┃ ')}`,
      });
      continue;
    }
    const [dateCell, topicCell, statusCell] = cells;
    const file = extractAdrFileName(topicCell);
    if (!file) {
      violations.push({
        lineNo,
        file: README_REL,
        reason: `주제 셀에 ADR 링크(.md) 부재: ${topicCell}`,
      });
      continue;
    }
    if (seen.has(file)) {
      violations.push({
        lineNo,
        file,
        reason: `중복 등재 — 같은 ADR 이 ${seen.get(file)}행에도 있습니다. 상태 열이 두 벌이면 어느 쪽이 정본인지 결정할 수 없습니다.`,
      });
      continue;
    }
    seen.set(file, lineNo);

    // 날짜 셀 ↔ 파일명 접두 (파일명 규약 `<YYYYMMDD>-<topic>.md`)
    if (!/^\d{4}-\d{2}-\d{2}$/.test(dateCell)) {
      violations.push({ lineNo, file, reason: `날짜 셀 형식 오류 (YYYY-MM-DD 기대): ${dateCell}` });
    } else if (!file.startsWith(dateCell.replace(/-/g, ''))) {
      violations.push({
        lineNo,
        file,
        reason: `날짜 셀 ↔ 파일명 접두 불일치 — 셀 ${dateCell} vs 파일 ${file}`,
      });
    }

    // upstream-only 3원 일치 (로컬 부재 ⟺ 표기 ⟺ allowlist 등록)
    const localPath = path.join(root, DECISIONS_DIR_REL, file);
    const localMissing = !existsSync(localPath);
    const marked = topicCell.includes(UPSTREAM_ONLY_MARK);
    const allowlisted = ADR_INDEX_UPSTREAM_ONLY_TARGETS.includes(file);
    if (!(localMissing === marked && marked === allowlisted)) {
      violations.push({
        lineNo,
        file,
        reason:
          `upstream-only 제외 판정 3원 불일치 — 로컬 파일 부재=${localMissing} / ` +
          `'(upstream-only)' 표기=${marked} / allowlist 등록=${allowlisted}. ` +
          `셋은 같아야 합니다 (README 계약 3 + scripts/upstream-only-allowlist.mjs).`,
      });
      continue;
    }

    const tableToken = extractStatusToken(statusCell);
    if (!tableToken) {
      violations.push({
        lineNo,
        file,
        reason: `표 상태 셀에서 상태 토큰을 인식하지 못했습니다 (어휘: ${STATUS_VOCABULARY.join(' / ')}): "${statusCell}"`,
      });
      continue;
    }

    if (localMissing) {
      excluded.push({ file, tableToken });
      continue;
    }

    const statusLine = readAdrStatusLine(localPath);
    if (!statusLine) {
      violations.push({
        lineNo,
        file,
        reason: `ADR 실물에 상태 메타데이터 라인 부재 (${DECISIONS_DIR_REL}/${file}) — '- 상태: <상태>' 형식 필요.`,
      });
      continue;
    }
    const adrToken = extractStatusToken(statusLine.text);
    if (!adrToken) {
      violations.push({
        lineNo,
        file,
        reason: `ADR 실물 상태 토큰 인식 실패 (${DECISIONS_DIR_REL}/${file}:${statusLine.lineNo}, 어휘: ${STATUS_VOCABULARY.join(' / ')}): "${statusLine.text.trim()}"`,
      });
      continue;
    }
    if (adrToken !== tableToken) {
      violations.push({
        lineNo,
        file,
        reason:
          `상태 불일치 — 인덱스 표 '${tableToken}' vs ADR 실물 '${adrToken}' ` +
          `(${DECISIONS_DIR_REL}/${file}:${statusLine.lineNo}). ` +
          `인덱스 계약 (2): 상태를 전이시키는 PR 이 **같은 PR 에서** 표를 갱신합니다.`,
      });
      continue;
    }
    compared.push({ file, token: adrToken });
  }
  return { rows, compared, excluded, violations };
}

function main() {
  const args = process.argv.slice(2);
  if (args.length > 0) {
    console.error(
      `[ERROR] 잉여 인자: ${args.join(' ')}\n` +
        '        사용법: node scripts/verify-adr-index.mjs [--self-test]',
    );
    return 2;
  }
  const root = process.env.ADR_INDEX_ROOT ? path.resolve(process.env.ADR_INDEX_ROOT) : DEFAULT_ROOT;
  if (!existsSync(root)) {
    console.error(`[adr-index] 스캔 루트 부재: ${root}`);
    return 2;
  }
  let result;
  try {
    result = runCheck(root);
  } catch (e) {
    console.error(`[adr-index] 실행 에러: ${e.message}`);
    return e.exitCode ?? 2;
  }
  const { rows, compared, excluded, violations } = result;
  console.log(
    `[adr-index] ${README_REL} 인덱스 행 ${rows.length}건 / 로컬 상태 대조 ${compared.length}건 / upstream-only 제외 ${excluded.length}건`,
  );
  for (const c of compared) {
    console.log(`  대조 OK  ${c.file} — 표 '${c.token}' == 실물 '${c.token}'`);
  }
  // 제외는 조용한 skip 이 아니다 — 제외 사실 + 근거 + 수동 대조 절차를 매 실행 노출한다.
  for (const e of excluded) {
    console.log(
      `  제외     ${e.file} (표 '${e.tableToken}') — 로컬 파일 부재 = upstream-only.` +
        ` 표기·allowlist 3원 일치 확인됨. upstream 실물 상태는 아래 1줄 GET 으로 수동 대조 (네트워크 의존이라 CI 범위 밖):\n` +
        `           ${upstreamCheckCommand(e.file)}`,
    );
  }
  console.log(
    '[adr-index] 범위 밖 (의도적 미검출): 인덱스 미등재 검출 / 산문 역참조 상태 서술 — 헤더 §범위 경계 + self-test F10',
  );
  if (violations.length > 0) {
    console.error(`\n[adr-index] FAIL — 위반 ${violations.length}건:`);
    for (const v of violations) {
      console.error(`  ${README_REL}:${v.lineNo} (${v.file})\n    ${v.reason}`);
    }
    return 1;
  }
  console.log('[adr-index] PASS — 상태 불일치 0');
  return 0;
}

// ── --self-test: 격리 픽스처 F1~F16 (가드 도입 PR DoD 축 1~3) ───────────────
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
  const tmp = mkdtempSync(path.join(tmpdir(), 'adr-index-selftest-'));
  const decisions = path.join(tmp, DECISIONS_DIR_REL);
  mkdirSync(decisions, { recursive: true });

  const writeAdr = (file, statusLine) =>
    writeFileSync(
      path.join(decisions, file),
      ['# ADR: fixture', '', statusLine, '', '## 배경', '내용', ''].join('\n'),
    );
  const writeIndex = (rows) =>
    writeFileSync(
      path.join(decisions, 'README.md'),
      [
        '# ADR',
        '',
        '## 현재 ADR 인덱스',
        '',
        TABLE_HEADER,
        '|---|---|---|---|',
        ...rows,
        '',
        '> 범례',
        '',
      ].join('\n'),
    );
  // upstream-only 행은 실제 allowlist 에 등록된 target 을 써야 3원 일치가 성립한다
  const UPSTREAM_FILE = ADR_INDEX_UPSTREAM_ONLY_TARGETS[0];
  const upstreamRow = `| 2026-04-19 | [gitflow](${UPSTREAM_FILE}) **(upstream-only)** | Accepted | 상위 |`;
  const localRow = (status) => `| 2026-08-06 | [local](20260806-local-adr.md) | ${status} | 세부 |`;
  const anchoredRow = (status) =>
    `| 2026-08-06 | [local](20260806-local-adr.md#결정) | ${status} | 세부 |`;

  try {
    // F1 positive — 로컬 1행(일치) + upstream-only 1행
    writeAdr('20260806-local-adr.md', '- 상태: **Accepted** (cross-validate agy 2026-08-06)');
    writeIndex([upstreamRow, localRow('Accepted')]);
    let r = runCheck(tmp);
    assert(r.violations.length === 0, 'F1 positive: 정합 인덱스 → 위반 0');
    assert(r.compared.length === 1, 'F1 positive: 로컬 대조 1건');
    assert(
      r.excluded.length === 1 && r.excluded[0].file === UPSTREAM_FILE,
      'F1 positive: upstream-only 1건 제외 (silent skip 아님 — 목록 반환)',
    );

    // F2 negative — #993 재발 형태: 실물은 Accepted 로 전이됐는데 표는 Provisional
    writeIndex([upstreamRow, localRow('Provisional')]);
    r = runCheck(tmp);
    assert(
      r.violations.length === 1 && /상태 불일치/.test(r.violations[0].reason),
      `F2 negative(#993 형태): 표 Provisional vs 실물 Accepted → FAIL (실측 ${r.violations.length}건)`,
    );
    assert(
      /'Provisional' vs ADR 실물 'Accepted'/.test(r.violations[0].reason),
      'F2 negative: 양쪽 토큰을 사유에 명시',
    );
    assert(r.compared.length === 0, 'F2 negative: 불일치 행은 대조 성공으로 계상하지 않음');

    // F3 recovery — 표를 실물에 맞춰 갱신 → PASS 복원
    writeIndex([upstreamRow, localRow('Accepted')]);
    r = runCheck(tmp);
    assert(r.violations.length === 0, 'F3 recovery: 표 갱신 후 위반 0 복원');

    // F4 negative — 역방향(#993 거울): 표는 Accepted 인데 실물이 Superseded 로 전이
    writeAdr(
      '20260806-local-adr.md',
      '- **상태**: Superseded by [신규](20260901-x.md) (2026-09-01)',
    );
    r = runCheck(tmp);
    assert(
      r.violations.length === 1 &&
        /'Accepted' vs ADR 실물 'Superseded'/.test(r.violations[0].reason),
      'F4 negative: 실물 → Superseded 전이 미반영 검출',
    );

    // F5 unit — Supersedes(능동) 는 Superseded(상태) 로 오인되지 않는다
    writeAdr(
      '20260806-local-adr.md',
      '- 상태: **Accepted** (2026-08-06). Supersedes: `20260101-old.md`',
    );
    r = runCheck(tmp);
    assert(r.violations.length === 0, 'F5 unit: "Supersedes" 오탐 없음 (Accepted 로 판정)');

    // F6 unit — NO-OP 은 상태가 아니라 수식어: 표 `Accepted (NO-OP)` ↔ 실물 `NO-OP (Accepted…)`
    writeAdr('20260806-local-adr.md', '- **상태**: **NO-OP** (Accepted, 2026-08-06)');
    writeIndex([upstreamRow, localRow('Accepted (NO-OP)')]);
    r = runCheck(tmp);
    assert(r.violations.length === 0, 'F6 unit: NO-OP 수식어 정규화 — 양쪽 Accepted 로 정합');

    // F7 negative — 상태 메타데이터 라인 부재
    writeFileSync(
      path.join(decisions, '20260806-local-adr.md'),
      '# ADR: 상태 라인이 없는 문서\n\n본문에 상태: 라는 말이 제목에만 있다.\n',
    );
    writeIndex([upstreamRow, localRow('Accepted')]);
    r = runCheck(tmp);
    assert(
      r.violations.length === 1 && /상태 메타데이터 라인 부재/.test(r.violations[0].reason),
      `F7 negative: 상태 라인 부재 → FAIL (판정 불가를 통과로 흘리지 않음, 실측 ${r.violations.length}건)`,
    );

    // F8 negative — 어휘 밖 토큰 (표 측)
    writeAdr('20260806-local-adr.md', '- 상태: Accepted');
    writeIndex([upstreamRow, localRow('미정')]);
    r = runCheck(tmp);
    assert(
      r.violations.length === 1 &&
        /표 상태 셀에서 상태 토큰을 인식하지 못했/.test(r.violations[0].reason),
      'F8 negative: 어휘 밖 상태 토큰 → FAIL (fallback 없음)',
    );

    // F9 negative — upstream-only 표기 없이 로컬 파일 부재 (3원 불일치)
    writeIndex([upstreamRow, `| 2026-09-09 | [ghost](20260909-ghost.md) | Accepted | 세부 |`]);
    r = runCheck(tmp);
    assert(
      r.violations.length === 1 && /3원 불일치/.test(r.violations[0].reason),
      'F9 negative: 로컬 부재 + 표기/allowlist 없음 → FAIL',
    );

    // F10 경계 고정 — #1015 재발 형태(신규 ADR 미등재)는 **의도적 미검출** (헤더 §범위 경계 (i))
    writeAdr('20260812-unregistered.md', '- 상태: Accepted');
    writeIndex([upstreamRow, localRow('Accepted')]);
    r = runCheck(tmp);
    assert(
      r.violations.length === 0 && r.compared.length === 1,
      'F10 경계: 미등재 ADR 은 검출하지 않는다 (범위 밖 — 누락 아님. 별도 이슈 분리 대상)',
    );
    rmSync(path.join(decisions, '20260812-unregistered.md'));

    // F11 negative — 표 앵커 부재 (마크다운 파손, PR #1009 클래스)
    writeFileSync(
      path.join(decisions, 'README.md'),
      '# ADR\n\n## 현재 ADR 인덱스\n\n표가 통째로 사라졌다.\n',
    );
    r = runCheck(tmp);
    assert(
      r.violations.length === 1 && /인덱스 표 앵커 부재/.test(r.violations[0].reason),
      'F11 negative: 표 앵커 소실 → FAIL (조용한 0행 통과 금지)',
    );

    // F12 negative — 열 수 파손
    writeIndex([upstreamRow, `| 2026-08-06 | [local](20260806-local-adr.md) | Accepted |`]);
    r = runCheck(tmp);
    assert(
      r.violations.length === 1 && /표 열 수 불일치/.test(r.violations[0].reason),
      'F12 negative: 셀 3개 행 → FAIL',
    );

    // F13 negative — 중복 등재
    writeIndex([upstreamRow, localRow('Accepted'), localRow('Provisional')]);
    r = runCheck(tmp);
    assert(
      r.violations.length === 1 && /중복 등재/.test(r.violations[0].reason),
      'F13 negative: 같은 ADR 2행 → FAIL',
    );

    // F14 negative — 날짜 셀 ↔ 파일명 접두 불일치
    writeIndex([upstreamRow, `| 2026-08-07 | [local](20260806-local-adr.md) | Accepted | 세부 |`]);
    r = runCheck(tmp);
    assert(
      r.violations.length === 1 && /날짜 셀 ↔ 파일명 접두 불일치/.test(r.violations[0].reason),
      'F14 negative: 날짜 셀 오기 → FAIL',
    );

    // F16 앵커 허용 — 링크에 `#…` 가 붙어도 파일명을 추출한다.
    //  회귀 시 링크가 **있는데도** "ADR 링크 부재" 라는 거짓 진단으로 FAIL 한다
    //  (cross-validate agy 2026-08-12 권고, 실 저장소에서 재현 후 수정).
    {
      writeAdr('20260806-local-adr.md', '- 상태: **Accepted** (cross-validate agy 2026-08-06)');
      writeIndex([upstreamRow, anchoredRow('Accepted')]);
      const r = runCheck(tmp);
      assert(r.violations.length === 0, 'F16 앵커 링크: 파일명 추출 성공 → 위반 0');
      assert(r.compared.length === 1, 'F16 앵커 링크: 대조 1건 (링크 부재 오진 아님)');
    }

    // F15 self-consistency — 제외 판정 근거가 verify-docs-links 와 같은 SSoT 를 쓰는가.
    //  사본을 다시 인라인하면 두 가드의 제외 집합이 갈릴 수 있으므로 정적으로 못 박는다.
    const docsLinksSrc = readFileSync(path.join(SCRIPT_DIR, 'verify-docs-links.mjs'), 'utf8');
    assert(
      docsLinksSrc.includes("from './upstream-only-allowlist.mjs'"),
      'F15 self-consistency: verify-docs-links 가 공유 allowlist 모듈을 import',
    );
    assert(
      !/const UPSTREAM_ONLY_ALLOWLIST\s*=\s*\[/.test(docsLinksSrc),
      'F15 self-consistency: verify-docs-links 에 allowlist 인라인 사본 재유입 0',
    );
    assert(
      ADR_INDEX_UPSTREAM_ONLY_TARGETS.length > 0,
      'F15 self-consistency: 인덱스 README source 의 allowlist target 이 1건 이상 (제외 판정 근거 존재)',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}

// 모드 디스패치 — `--self-test` 는 **단독 인자일 때만**. `--self-test foo` 처럼 잉여 인자가
// 붙으면 main() 의 잉여 인자 검사(exit 2)로 떨어진다 (두 모드를 한 호출로 합쳐 한쪽 검사가
// 조용히 무시되는 경로 차단 — verify-pr-template-checklist.mjs 의 MODE_ARITY 와 같은 취지).
const CLI_ARGS = process.argv.slice(2);
process.exit(CLI_ARGS.length === 1 && CLI_ARGS[0] === '--self-test' ? selfTest() : main());
