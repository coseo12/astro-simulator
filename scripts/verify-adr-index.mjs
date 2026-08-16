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
 *   1. 표 앵커 — `| 날짜 | 주제 | 상태 | 상하 관계 |` 헤더 + 구분선. 헤더 **발생 수 != 1 이면
 *      FAIL** — 0건은 마크다운 표 파손 = 인덱스 자체 소실 (PR #1009 헤딩 파손 클래스), 2건 이상은
 *      첫 표만 검사되고 나머지가 **조용히 미검사**로 남는 경로다 (#1020 3항). 두 진단은 사유
 *      문자열로 구분한다.
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
 *   (iii) **행 본문의 수치·술어 내용 — 범위 밖** (ADR
 *       `20260814-1031-1064-committed-claim-guard-rejected.md` §결정 4 가 명시한 **세 번째
 *       경계**). 본 가드가 대조하는 것은 **상태 열의 상태 토큰 하나**뿐이다. 주제 셀·상하
 *       관계 셀에 적힌 **수치**(_"측정 대상 N건"_ · 정밀도)나 **술어**(재도달용 `git grep`
 *       한 줄)가 ADR 실물과 어긋나도, 실행 불가능한 술어여도 검출하지 않는다.
 *       확장은 같은 §결정 4 가 **기각**했다 — 행 본문 자기모순은
 *       [`20260808-983`](docs/decisions/20260808-983-measurement-recording-convention.md)
 *       §Amendment 2 가 정밀도 `0/76` 으로 기각한 **술어 비교환** 클래스와 동형이라,
 *       기계가 _"두 수치가 같은 것을 세는가"_ 를 판정할 수 없다. 즉 이 미검출은 결함이
 *       아니라 **결정**이며, self-test **F20** 이 그 경계를 픽스처로 고정해 미래 관찰자가
 *       _"누락"_ 으로 오인하지 않게 한다 (F10 과 같은 취지).
 *   (iv) **들여쓴 모듈 로드 선언 — 범위 밖** (#1084 판정 3 · 기각). ⚠️ 앞 셋과 **축이 다르다**
 *       — (i)~(iii) 은 «인덱스 대조 판정» 의 경계이고, (iv) 는 self-test 가 **자기 소스**를
 *       훑는 배선 단언 `F19n` 의 경계다. `F19n` 은 **컬럼 0** 에서 시작하는 선언만 세므로
 *       `  import { x } from '<allowlist 밖>';` 처럼 **공백을 앞세운** 최상위 선언은 잡히지
 *       않는다 (문법상 유효하고 모듈도 실제로 로드된다).
 *       **기각 근거** — 백스톱이 `0` 이 아니다. 앵커를 공백 허용으로 넓히면 이 파일이 이미 갖고
 *       있는 _"코드 무변경 FAIL"_ 클래스(블록 주석의 컬럼 0 `import` 줄이 세어지는 경로,
 *       `F19n`·`F19o` 주석 참조)가 **들여쓴 산문 전체**로 확대된다 — 본 파일의 주석은 import
 *       규칙을 한국어로 길게 논하므로 표면이 넓다. 반면 들여쓴 선언은 `prettier --check` 가
 *       잡는다: 2026-08-16 실측, lockfile 판본 `prettier@3.9.6` 로 들여쓴 최상위 import 1줄
 *       픽스처 → `[warn]` + **exit 1** (같은 실행의 well-formed 컬럼 0 재수출 픽스처는 exit 0
 *       — 즉 이 백스톱은 «들여쓰기» 에만 반응한다). CI 배선은 `.github/workflows/ci.yml`
 *       §#952 포맷 백스톱(`pnpm run format:check`)이고 `scripts/` 는 `.prettierignore` 대상이
 *       아니다. ⇒ 넓혀서 얻는 것(백스톱 1 → 2)보다 잃는 것(상시 오탐 표면 확대)이 크다.
 *       **재검토 조건**: `format:check` 가 CI 에서 빠지거나 `scripts/` 가 `.prettierignore` 에
 *       들어가면 이 기각의 전제가 무너지므로 그때 앵커를 다시 판정한다.
 *       ⚠️ 반면 **재수출**(`export … from`)은 백스톱이 실제로 `0` 이었고(같은 실측에서 prettier
 *       exit 0 / eslint exit 0) 정규식으로 닫을 수 있어 **채택**했다 — `F19n` 이 두 갈래를 모두
 *       센다. 두 판정이 갈린 이유는 «가능성» 이 아니라 **백스톱 유무**다.
 *
 * 종료 코드:
 *   0 — 위반 0
 *   1 — 위반 발견 (README 라인 번호 + 사유 출력)
 *   2 — 실행 에러 (스캔 루트 / README 부재, 잉여 인자 등)
 *
 * 호출:
 *   node scripts/verify-adr-index.mjs               # 검사 (CI 기본)
 *   node scripts/verify-adr-index.mjs --self-test   # 격리 픽스처 F1~F20 (positive/negative/recovery)
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
  // 전수 스캔 — `findIndex` 로 첫 앵커만 잡으면 같은 헤더 표가 2개일 때 **두 번째가 조용히
  // 미검사**된다 (#1020 3항). 발생 수 != 1 은 전부 FAIL 이고 fallback 분기는 두지 않는다
  // (CLAUDE.md §가드 설계 원칙 — drift 가드는 fail-fast 만). 진단은 "부재" 와 "중복" 을
  // 구분한다 — 같은 사유로 보고하면 어느 쪽을 고칠지 알 수 없다.
  const headerIdxs = [];
  for (let i = 0; i < lines.length; i += 1) {
    if (lines[i].trim() === TABLE_HEADER) headerIdxs.push(i);
  }
  if (headerIdxs.length === 0) {
    return {
      error: `인덱스 표 앵커 부재 — 헤더 라인 '${TABLE_HEADER}' 를 찾지 못했습니다. 표가 파손됐거나 열 구성이 바뀌었습니다 (바뀐 것이 의도라면 verify-adr-index.mjs 의 TABLE_HEADER 를 같이 갱신).`,
    };
  }
  if (headerIdxs.length > 1) {
    return {
      error:
        `인덱스 표 앵커 중복 — 헤더 라인 '${TABLE_HEADER}' 가 ${headerIdxs.length}건 발견됐습니다 ` +
        `(README ${headerIdxs.map((i) => i + 1).join('행 · ')}행). 인덱스 표는 정확히 1개여야 합니다 — ` +
        `2개 이상이면 첫 표만 검사되고 나머지 행은 조용히 미검사로 남습니다. ` +
        `표를 하나로 합치거나, 두 번째가 인덱스가 아닌 다른 표라면 헤더 열 구성을 다르게 하십시오.`,
    };
  }
  const headerIdx = headerIdxs[0];
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

/**
 * CLI 본체. 종료 코드를 **return** 한다 (`process.exit` 호출 없음 — 그래야 self-test 가
 * 순수 호출로 덮는다). 전역 의존(`process.argv` / `process.env`)은 **인자 기본값으로 주입**해
 * **자식 프로세스 spawn 없이** 커버리지를 얻는다 (#1020 2항 / ADR 20260813-1020 §결정 2-1).
 * 본 가드의 **자식 프로세스 모듈 import 0** 성질은 #1018 cross-validate 보안 축 통과 근거라
 * 불변이며, self-test `F19n` 이 정적으로 고정한다.
 */
function main(args = process.argv.slice(2), env = process.env) {
  if (args.length > 0) {
    console.error(
      `[ERROR] 잉여 인자: ${args.join(' ')}\n` +
        '        사용법: node scripts/verify-adr-index.mjs [--self-test]',
    );
    return 2;
  }
  const root = env.ADR_INDEX_ROOT ? path.resolve(env.ADR_INDEX_ROOT) : DEFAULT_ROOT;
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
    '[adr-index] 범위 밖 (의도적 미검출): 인덱스 미등재 검출 / 산문 역참조 상태 서술 / 행 본문의 수치·술어 내용 — 헤더 §범위 경계 + self-test F10·F20',
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

// ── --self-test: 격리 픽스처 F1~F20 / 53 단언 (가드 도입 PR DoD 축 1~3) ──────
//  F19 는 CLI 표면(모드 디스패치 + main() 종료 코드 + 배선)이라 세부 케이스가 많아
//  `F19a`~`F19t` 로 나뉜다 (#1084 에서 `F19r`~`F19t` 추가. 직전까지 이 범위 표기가 `F19o` 에
//  멈춰 있어 `F19p`·`F19q` 를 빠뜨렸던 것을 같이 정정했다 — 범위 라벨 `F1~F20` 은 신규 픽스처가
//  전부 `F19` 아래로 들어가므로 **불변**이다). 단언 수 sweep 술어(자기 검증용 grep 1줄)와 갱신 대상 목록은
//  ADR `20260813-1020-adr-index-membership-marker-rejected.md` §결정 3 이 정본이다.
//  ⚠️ 그 grep 문자열을 **본 파일 안에 인용하지 않는다** — 인용하는 순간 주석 자신이 hit 이 되어
//  `grep 결과 == 'N passed'` 라는 자기 검증 등식이 영구히 1 어긋난다 (실측: 당시 47 vs 46).
//  같은 클래스를 F18·F19l~F19o 가 각각 다른 표면에서 다룬다 (volt #995 자기-매칭 — 패턴
//  리터럴 / 감사 술어 오염 / 우회 관용구 박제 / 단언 메시지·주석 4표면. PR #1036 §Y-1·Y-2).
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

    // F17 negative — 상태 라인 **어순**. 가드는 최선두 어휘 토큰을 현재 상태로 읽으므로
    //  `Provisional → **Accepted**` 표기는 `exit 1` 에 **진단까지 반전**된다 (표가 맞는데 실물이
    //  틀렸다고 보고). #1018 은 이 경계를 ADR 산문에만 박제했고 픽스처는 #1020 4항으로 미뤘다.
    //  FAIL 여부만이 아니라 **반전된 사유 문자열까지** 단언해야 경계가 고정된다.
    {
      writeAdr('20260806-local-adr.md', '- 상태: Provisional → **Accepted** (2026-08-13)');
      writeIndex([upstreamRow, localRow('Accepted')]);
      const r = runCheck(tmp);
      assert(
        r.violations.length === 1 && /상태 불일치/.test(r.violations[0].reason),
        `F17 어순 negative: 'Provisional → **Accepted**' 는 최선두 토큰이 Provisional → FAIL (실측 ${r.violations.length}건)`,
      );
      assert(
        /인덱스 표 'Accepted' vs ADR 실물 'Provisional'/.test(r.violations[0]?.reason ?? ''),
        'F17 어순 negative: 진단이 반전된다 — 표가 맞는데 실물이 틀렸다고 보고 (사유 문자열까지 고정)',
      );

      // F17 recovery — 현재 상태 토큰을 최선두로 되돌리면 PASS. ADR 20260812-1005 §재검토 조건
      //  어순 제약이 요구하는 정본 표기 형태다.
      writeAdr(
        '20260806-local-adr.md',
        '- 상태: **Accepted** (2026-08-13 — `Provisional` 에서 전이)',
      );
      const r2 = runCheck(tmp);
      assert(
        r2.violations.length === 0 && r2.compared.length === 1,
        'F17 recovery: 현재 상태 토큰을 최선두로 두면 위반 0 (전이 이력은 뒤에 적는다)',
      );
    }

    // F18 negative — 표 앵커 **중복**. `findIndex` 시절엔 첫 표만 파싱돼 두 번째 표의 행이
    //  **조용히 미검사**로 남았다 (#1020 3항). 0건은 F11 이 이미 덮으므로 본 픽스처는 2건 이상만
    //  겨눈다. 진단은 "부재" 와 구분돼야 어느 쪽을 고칠지 알 수 있다.
    {
      const brokenRow = `| 2026-08-06 | [second](20260806-local-adr.md) | Provisional | 세부 |`;
      writeFileSync(
        path.join(decisions, 'README.md'),
        [
          '# ADR',
          '',
          '## 현재 ADR 인덱스',
          '',
          TABLE_HEADER,
          '|---|---|---|---|',
          upstreamRow,
          localRow('Accepted'),
          '',
          '## 두 번째 표 (같은 헤더)',
          '',
          TABLE_HEADER,
          '|---|---|---|---|',
          brokenRow,
          '',
        ].join('\n'),
      );
      const r = runCheck(tmp);
      assert(
        r.violations.length === 1 && /인덱스 표 앵커 중복/.test(r.violations[0].reason),
        `F18 앵커 중복 negative: 같은 헤더 표 2개 → FAIL (실측 ${r.violations.length}건)`,
      );
      // ⚠️ **부정형 술어 + 빈 fallback 금지** (PR #1036 reviewer Y-2 — 자기-매칭 클래스의 3번째 멤버).
      //  `!/…/.test(x ?? '')` 는 위반이 0건이면 `''` 를 검사해 **항상 참**이라 vacuous 하게 통과한다
      //  (findIndex 회귀 주입에서 형제 2건은 FAIL 인데 이것만 PASS 로 실증됐다). 존재를 **먼저**
      //  요구해 닫는다. 긍정형(`/…/.test(x ?? '')`)은 빈 문자열에서 안전하게 FAIL 하므로 같은
      //  fallback 을 써도 무해하다 — 위험한 것은 fallback 자체가 아니라 **부정형과의 조합**이다.
      assert(
        r.violations.length === 1 && !/앵커 부재/.test(r.violations[0].reason),
        'F18 앵커 중복 negative: "부재" 와 다른 사유 — 중복/부재를 같은 문자열로 보고하지 않는다',
      );
      assert(
        /5행 · 12행/.test(r.violations[0]?.reason ?? ''),
        'F18 앵커 중복 negative: 두 앵커의 README 라인 번호를 사유에 명시 (actionable)',
      );

      // F18 recovery — 두 번째 표를 제거하면 PASS 복원 (첫 표만 조용히 검사하던 경로 소멸)
      writeIndex([upstreamRow, localRow('Accepted')]);
      const r2 = runCheck(tmp);
      assert(r2.violations.length === 0, 'F18 recovery: 표를 1개로 되돌리면 위반 0 복원');
    }

    // F19 모드 디스패치 + main() 종료 코드 — #840 계보(배선이 끊겨도 테스트가 초록) 차단.
    //  F1~F18 은 전부 runCheck() 를 직접 부르므로 CLI 표면 단언이 0건이었다 (#1020 2항).
    //  `main()` 은 종료 코드를 **return** 하고 전역 의존을 인자로 받으므로 자식 프로세스 없이
    //  순수 호출로 덮는다 — 본 가드의 자식 프로세스 모듈 import 0 성질은 불변이다.
    {
      // main() 은 stdout/stderr 를 쓴다. 미캡처 시 self-test 출력에 `[adr-index] FAIL` 이 섞여
      //  오독을 유발하므로 캡처 후 finally 복원한다.
      const captured = (fn) => {
        const origLog = console.log;
        const origError = console.error;
        const out = [];
        console.log = (...a) => out.push(a.join(' '));
        console.error = (...a) => out.push(a.join(' '));
        try {
          return { code: fn(), output: out.join('\n') };
        } finally {
          console.log = origLog;
          console.error = origError;
        }
      };
      const callMain = (args, env) => captured(() => main(args, env));

      // 술어 4 — self-test 가 `dispatch(['--self-test'])` 를 실행하면 무한 재귀이므로,
      //  그 분기만은 실행이 아니라 **순수 술어**를 단언한다.
      assert(
        isSelfTestMode(['--self-test']) === true,
        'F19a 술어: 단독 --self-test → self-test 모드',
      );
      assert(isSelfTestMode([]) === false, 'F19b 술어: 무인자 → 본검사 모드');
      assert(
        isSelfTestMode(['--self-test', 'foo']) === false,
        'F19c 술어: --self-test + 잉여 인자는 self-test 모드가 아니다 (두 모드 합침 차단)',
      );
      assert(isSelfTestMode(['--bogus']) === false, 'F19d 술어: 미지 플래그 → 본검사 모드');

      // 종료 코드 5경로 — 인자 오류 2 / 루트 부재 2 / README 부재 2 / PASS 0 / FAIL 1
      assert(callMain(['--bogus'], {}).code === 2, 'F19e main(): 잉여 인자 → 2');
      assert(
        callMain(['--self-test', 'foo'], {}).code === 2,
        'F19f main(): --self-test + 잉여 인자도 잉여 인자 검사로 떨어진다 → 2',
      );
      assert(
        callMain([], { ADR_INDEX_ROOT: path.join(tmp, 'no-such-root') }).code === 2,
        'F19g main(): 스캔 루트 부재 → 2',
      );
      const emptyRoot = path.join(tmp, 'empty-root');
      mkdirSync(emptyRoot, { recursive: true });
      assert(
        callMain([], { ADR_INDEX_ROOT: emptyRoot }).code === 2,
        'F19h main(): README 부재 → 2',
      );

      writeAdr('20260806-local-adr.md', '- 상태: **Accepted** (2026-08-13)');
      writeIndex([upstreamRow, localRow('Accepted')]);
      const ok = callMain([], { ADR_INDEX_ROOT: tmp });
      assert(ok.code === 0, 'F19i main(): 정합 인덱스 → 0');
      assert(
        /\[adr-index\] PASS/.test(ok.output),
        'F19i main(): PASS 경로가 실제로 stdout 을 쓴다 (배선 단절 시 조용한 0 차단)',
      );

      writeIndex([upstreamRow, localRow('Provisional')]);
      const ng = callMain([], { ADR_INDEX_ROOT: tmp });
      assert(ng.code === 1, 'F19j main(): 상태 불일치 → 1');
      assert(
        /\[adr-index\] FAIL/.test(ng.output) && /상태 불일치/.test(ng.output),
        'F19j main(): FAIL 경로가 위반 사유를 실제로 출력한다',
      );
      assert(
        captured(() => dispatch(['--bogus'])).code === 2,
        'F19k dispatch(): 비-self-test 인자는 main() 으로 흘러 같은 종료 코드 (배선 실행 경로)',
      );

      // 배선 정적 단언 — 실행 불가능한 마지막 한 줄(process.exit)과 인자 주입 시그니처를
      //  자기 소스 대조로 고정한다 (F15 가 쓰는 골든 벡터 패턴).
      //
      // ⚠️ **자기-매칭 함정** (volt #995 — _"가드가 자기 자신만 찾고 있었음"_). 찾는 문자열을
      //  `includes('…')` 로 그대로 쓰면 **그 리터럴 자신이 소스에 있으므로** 대상 코드를 통째로
      //  지워도 hit 이 남아 단언이 **vacuous** 해진다. 본 PR 의 negative 주입에서 실제로
      //  재현됐다 (배선 한 줄 제거 주입 → `46 passed, 0 failed`). 그래서 셋 다 **정규식**으로
      //  겸용한다: 메타문자 이스케이프(`\(` · `\.`) 때문에 정규식 **소스 텍스트가 자기 패턴과
      //  매칭되지 않고**, `^…$` + `m` 플래그가 들여쓰기 없는 **최상위 라인**만 겨눈다.
      //  (넷 다 아래 주입으로 FAIL 재현 확인 — 배선 제거 / 시그니처 되돌림 / 리터럴·합성 모듈 유입)
      //
      // ⚠️ **자기-매칭의 나머지 표면 — 단언 메시지와 주석**. 정규식 *소스* 만 자기 매칭에서
      //  빼면 부족하다. `F19o` 의 금지 토큰(동적 로더 호출 표기)을 **메시지에 그대로 적으면**
      //  그 문자열이 자기 패턴에 매칭돼 HEAD 에서 false positive 가 난다 (reviewer 자기 고백).
      //  **주석도 같다** — dev 가 이 블록에 우회 관용구를 *설명하려고* 그대로 인용했다가
      //  HEAD 가 `46 passed, 1 failed` 로 떨어지는 것을 실측했다 (hit 2건 전부 주석).
      //  ⇒ **`F19o` 가 금지하는 토큰은 이 파일의 산문에도 등장할 수 없다.** 비용은 우회
      //  관용구를 축자 인용할 수 없다는 것이고, 이득은 주석까지 검사 대상이 된다는 것이다
      //  (주석 안에 남겨둔 실코드를 나중에 주석 해제하는 경로까지 덮는다 — AST 기반이면 놓친다).
      //  그래서 아래 메시지·주석은 전부 `동적 모듈 로드` 같은 **서술형**으로 쓴다.
      //
      //  ⚠️ **두 단언의 스캔 범위는 다르다** (PR #1036 reviewer B 판정). 위 성질은 **`F19o` 에만**
      //  참이다 — `F19o` 는 파일 **전문**을 훑지만 `F19n` 은 `^import` 로 시작하는 **줄만** 본다.
      //  따라서 산문에 모듈명을 적는 것은 `F19n` 에 무해하다 (그래서 이 주석이 `node:module` 을
      //  언급해도 통과한다). 이 성질은 의도된 설계라기보다 텍스트 전수 검사의 **승격된 부작용**이며,
      //  대안(주석 영역 제외 파싱 / 설명 별도 파일 이관)이 더 비싸서 정당한 대가로 수용한 것이다.
      const selfSrc = readFileSync(path.join(SCRIPT_DIR, 'verify-adr-index.mjs'), 'utf8');
      const WIRING_RE = /^process\.exit\(dispatch\(process\.argv\.slice\(2\)\)\);$/gm;
      const MAIN_SIG_RE =
        /^function main\(args = process\.argv\.slice\(2\), env = process\.env\) \{$/gm;
      assert(
        (selfSrc.match(WIRING_RE) ?? []).length === 1,
        'F19l 배선: 최상위 마지막 한 줄이 dispatch() 결과를 그대로 process.exit 에 넘긴다 (정확히 1회)',
      );
      assert(
        (selfSrc.match(MAIN_SIG_RE) ?? []).length === 1,
        'F19m 배선: main() 이 argv/env 를 인자 기본값으로 주입받는다 (전역 직접 참조 회귀 차단)',
      );
      // F19n·F19o — 의존성 유입 차단. **denylist 가 아니라 allowlist 다** (PR #1036 reviewer Y-1).
      //
      //  denylist(금지 모듈명을 적고 없음을 확인)는 두 가지를 동시에 잃는다: ① 금지 낱말을
      //  **소스에 적어야** 하므로 `grep -c <모듈명>` 이라는 사람의 감사 술어가 영구히 오염되고,
      //  ② 그 오염을 피하려 모듈명을 조각에서 합성하면 **그 합성 관용구 자체가 우회 경로**가 된다.
      //  실측 (reviewer 재현 + dev 독립 재현): 모듈명을 조각에서 합성한 뒤 **동적 로더로**
      //  `'node:' + <합성값>` 을 부르는 3줄이면 모듈이 **실제로 로드**되는데도 (`spawnSync`
      //  타입 `function` 확인) self-test 는 `46 passed, 0 failed`, `grep -c` 도 0 —
      //  **가드와 사람이 동시에 침묵**한다. 축자 코드는 인용할 수 없다(위 ⚠️ 참조).
      //
      //  allowlist 로 뒤집으면 금지 낱말을 **적을 필요가 없어져** 두 문제가 함께 소멸한다.
      //  검출 범위도 넓다 — 특정 모듈이 아니라 **allowlist 밖 모든 유입**을 잡는다.
      //  ESM 이라 `require` 경로는 `node:module` 의 `createRequire` 를 거쳐야 하는데 그 import
      //  자체가 allowlist 밖이므로 **구조적으로 닫힌다** (별도 검사 불요).
      const ALLOWED_MODULE_LOADS = [
        './upstream-only-allowlist.mjs',
        'node:fs',
        'node:os',
        'node:path',
        'node:process',
        'node:url',
      ];
      //  ⚠️ **allowlist 의 의미는 «import 하는 모듈» 이 아니라 «로드하는 모듈» 이다** (#1084 판정 2).
      //  정적 ESM 에서 모듈 본문을 실행시키는 구문은 두 갈래다 — `import … from '<m>';`(부수효과
      //  전용 `import '<m>';` 포함) 와 **재수출**(`export … from '<m>';`). 후자는 로컬 바인딩을
      //  만들지 않을 뿐 **모듈을 똑같이 로드**한다. #1084 실측 2축: 재수출 한 줄짜리 모듈을 부르면
      //  대상 모듈의 최상위 `console.log` 가 찍히고, 내장 모듈 축에서도 `process.moduleLoadList`
      //  가 `false → true` 로 뒤집힌다 (자식 프로세스 계열 모듈로 재현).
      //  ⇒ 초판 이름 `ALLOWED_IMPORTS` 는 구문 한 갈래만 가리켜 재수출을 **정의상 배제**했고,
      //     그래서 allowlist 밖 모듈을 재수출로 끌어오면 **백스톱 `0`** 으로 통과했다 (#1077
      //     reviewer 실측 · base 패리티라 선재 결함). 이름과 수집 범위를 함께 «로드» 로 넓혀 닫는다.
      //
      //  `declared` 는 **선언 1건 = 매치 1건**으로 수집한다 (#1037 N-1 근본 해소). 시작을 컬럼 0 의
      //  키워드로, 종료를 `';` **+ 줄 끝**으로 앵커하고 그 사이에 세미콜론을 넘지 못하게 한다.
      //  사이에 줄바꿈이 와도 되므로 prettier 가 `printWidth: 100` 초과로 **스스로 쪼갠**
      //  다중행 선언이 그대로 수집된다.
      //
      //  ⚠️ **직전 판정본은 여기서 "코드 무변경 FAIL" 을 냈다.** 한 줄로 끝나는 선언만 수집해서,
      //  allowlist 가 **불변인데도** `node:fs` 에 명명 export 하나(`, X` = +3자)만 더하면 98자
      //  선언이 임계 `100` 을 넘어 쪼개지고, 수집 목록에서 빠져 FAIL 했다 (PR #1036 qa 실측:
      //  `statSync` 추가 → 9줄 분할 → `46 passed, 1 failed`). 이 가드는 `main` 의 required check
      //  이라 그 상태에서 후속 PR 이 전부 하드 블록됐다. 진단 메시지로 안내하는 대신 **수집
      //  자체를 넓혀** 경로를 없앤다 — 형태를 제약하는 것은 가드의 목적(유입 차단)이 아니다.
      //
      //  ⚠️ **재수출 축의 사전 구간은 따옴표를 넘지 못하게 한다** — 그러지 않으면 모듈 로드가
      //  아닌 정당한 컬럼 0 export 가 오탐된다. `export const X = 'from';` 은 따옴표 **안**에
      //  `from` 을 품으므로, 사전 구간이 따옴표를 통과하면 그 문자열이 명세자로 잡힌다.
      //  따옴표를 배제하면 이 경로가 구조적으로 닫히고, `from` 을 **명세자 따옴표가 곧바로**
      //  뒤따를 것을 함께 요구해 `export const from = 1;` 같은 형태도 걸리지 않는다.
      //  이 오탐 0 은 아래 `F19r` 이 **양성 대조군을 같은 소스에** 넣어 vacuous 하지 않게 고정한다.
      //
      //  ⚠️ **선언 수 조건 ②는 그대로 둔다 — 넓힌 뒤에도 두 조건은 독립이다.** 세미콜론 누락
      //  선언은 종료 앵커가 없어 여전히 수집되지 않고, 한 줄에 선언 2건을 이어 쓰면 앞 선언의
      //  `;` 뒤가 줄 끝이 아니라 그 줄이 통째로 수집에서 빠진다. 두 형태 다 **선언 시작 줄 수**
      //  로는 드러나므로 ②가 닫는다. 계수 대상도 수집과 **같이** 넓혔다 — 한쪽만 넓히면 두 조건이
      //  상시 불일치해 무조건 FAIL 한다 (#1084 §범위 1항 경고). 이 성질을 아래 `F19p`~`F19t` 가
      //  합성 소스로 고정한다.
      //
      //  두 축의 계수는 **정규식을 분리해 각각 센 뒤 더한다.** 하나의 교대(alternation) 정규식으로
      //  합치면 재수출 매치가 소비한 구간에 다음 축의 줄 시작이 묻혀 계수가 **서로를 상쇄**할 수
      //  있다 (사전 구간이 줄바꿈을 넘기 때문). 분리하면 축 간 소비 간섭이 정의상 0 이다.
      const IMPORT_DECL_RE = /^import\b[^;]*?['"]([^'"]+)['"];[ \t]*$/gm;
      const IMPORT_START_RE = /^import\b/gm;
      const EXPORT_FROM_DECL_RE = /^export\b[^;'"]*\bfrom\s*['"]([^'"]+)['"];[ \t]*$/gm;
      const EXPORT_FROM_START_RE = /^export\b[^;'"]*\bfrom\s*['"]/gm;
      /** 컬럼 0 정적 모듈 로드 선언에서 명세자를 수집 (import 축 + 재수출 축) */
      const collectLoads = (src) => [
        ...[...src.matchAll(IMPORT_DECL_RE)].map((m) => m[1]),
        ...[...src.matchAll(EXPORT_FROM_DECL_RE)].map((m) => m[1]),
      ];
      /** 컬럼 0 모듈 로드 **선언 시작** 줄 수 (조건 ② — 수집 실패를 드러내는 독립 방어선) */
      const countLoadStarts = (src) =>
        (src.match(IMPORT_START_RE) ?? []).length + (src.match(EXPORT_FROM_START_RE) ?? []).length;
      const declaredLineCount = countLoadStarts(selfSrc);
      const declared = collectLoads(selfSrc).sort();
      assert(
        declaredLineCount === ALLOWED_MODULE_LOADS.length &&
          JSON.stringify(declared) === JSON.stringify(ALLOWED_MODULE_LOADS),
        `F19n 배선: **컬럼 0 에서 시작하는** 정적 모듈 로드 선언 집합 == allowlist ` +
          `(선언 시작 줄 ${declaredLineCount} / 기대 ${ALLOWED_MODULE_LOADS.length} / 수집 ${JSON.stringify(declared)}). ` +
          `⚠️ **두 갈래를 모두 센다** — import 선언과 재수출(from 절을 가진 컬럼 0 export 선언). ` +
          `⚠️ 다중행 선언도 수집된다 — 줄 수와 수집 목록이 **함께** 어긋나면 allowlist 밖 유입을, ` +
          `줄 수만 어긋나면 세미콜론 누락 또는 한 줄 2선언을 의심하라. ` +
          `⚠️ **산문에도 걸린다** — 컬럼 0 에서 import 키워드로 시작하는 줄은 **블록 주석 안이어도** ` +
          `세어진다 (실행 코드가 무변경이어도 FAIL). 그 줄을 들여쓰거나 다른 낱말로 시작하게 바꿔라`,
      );
      assert(
        (selfSrc.match(/\bimport\s*\(/g) ?? []).length === 0,
        'F19o 배선: 동적 모듈 로드 0 — 합성 모듈명 우회 경로 차단 (Y-1 실측 근거). ' +
          '⚠️ 스캔 범위가 파일 전문이라 **산문(주석·단언 메시지)에 해당 호출 표기를 축자로 적어도 ' +
          '여기서 FAIL** 한다 — 코드 무변경인데 **여기서** 실패했다면 그 경로다 (같은 클래스가 ' +
          'F19n 의 컬럼 0 앵커에도 있다). 서술형으로 바꿔 쓸 것',
      );
      // ⓘ **`F19o` 는 안내를 더하지 않는다** (#1037 N-2 판정 — 기각). 되돌림은 이슈 §비목표가
      //  금지하고(PR #1036 에서 근거와 함께 수용된 대가), 위 메시지는 이미 *원인*(스캔 범위가
      //  파일 전문) · *표지*(_"코드 무변경인데 실패하면"_) · *처방*(서술형으로 바꿔 쓸 것) 3요소를
      //  갖췄다. 덧붙일 것은 안내가 아니라 중복이다.
      //
      //  ⚠️ **초판은 여기서 _"이제 저 문장이 배타적으로 참"_ 이라 적었다 — 거짓이다** (PR #1077
      //  reviewer 🟡-4 반증). 위에서 소멸한 것은 **prettier 분할 경로 하나**일 뿐이고, `F19n` 은
      //  여전히 "코드 무변경 FAIL" 경로를 갖는다: 컬럼 0 에서 import 키워드로 시작하는 줄을
      //  **블록 주석**에 넣으면 `^import` 앵커가 그것을 세어 FAIL 한다. 실측 — 그런 주석 3줄 주입
      //  시 **실행 코드 607행 동일**인데 `48 passed, 1 failed`.
      //  ⚠️ **술어와 rev 를 함께 적는다** (PR #1077 reviewer 라운드 2 — 이 값이 초판에 둘 다
      //  없었다). rev `8cec8bd` / 술어: 블록 주석을 **비탐욕 전역 제거**한 뒤 행 주석·공백 전용
      //  줄을 빼고 계수 (`perl -0777 -pe 's{/\*.*?\*/}{}gs'` + `grep -vE '^\s*//'` + 비공백 계수).
      //  **술어를 바꾸면 결론이 뒤집힌다** — 줄 접두만 보는 나이브 판정(`grep -vE '^\s*(//|/\*|\*|\*/)'`)
      //  은 주입 블록의 가운데 줄이 주석 접두를 갖지 않아 살아남아 `607` → `608` 로 갈리고, 그러면
      //  "코드가 변했다" 는 반대 결론이 나온다. 현 head 는 같은 술어로 `609` 이므로 위 값은
      //  **rev 종속**이다. 저장소 정본(`tsc --removeComments` emit `cmp`)으로도 동일 확인됐다.
      //  ⇒ 두 단언은 "코드 무변경 FAIL" 클래스를 **공유**한다 (F19o 는 파일 전문 스캔, F19n 은
      //  컬럼 0 앵커). 그래서 위 F19n 메시지에도 산문 분기를 적었다. 전칭 단정을 쓸 때 술어의
      //  사각을 함께 적는다는 것이 같은 커밋의 ADR 962 §9-3 부기 요지인데, 초판이 그 부기를
      //  쓰면서 **바로 옆에 새 전칭 단정을 박제**했다 — 자기모순이라 완화한다.

      // F19p~F19t — #1037 N-1 과 #1084 의 경계를 **합성 소스**로 고정한다. 실물 파일이 아니라
      //  문자열에 적용하므로 이 파일의 선언 형태가 앞으로 어떻게 바뀌든 판정이 결정적이다.
      //  (합성 소스는 JS 문자열 리터럴이라 `\n` 이 escape 다 — 물리적 줄 시작이 아니므로 위 컬럼 0
      //  앵커 기반 단언들에 유입되지 않는다. 자기-매칭 4표면 중 ①의 재발 방지.)
      //
      //  ⚠️ 픽스처가 쓰는 **allowlist 밖 sentinel 은 `node:vm` 로 통일**한다 — 자식 프로세스 계열
      //  모듈명을 여기 적으면 `grep -c <모듈명>` 이라는 사람의 감사 술어가 오염돼 위 Y-1 판정이
      //  스스로 무너진다 (현재 이 파일의 해당 모듈명 등장 수는 `0`). #1084 의 우회 실증은 그
      //  모듈로 했으나 **격리 사본에서만** 했고 커밋물에는 남기지 않는다.
      //
      //  ⚠️ 아래 5 픽스처는 **위 F19n 이 쓰는 것과 같은 함수**(`collectLoads` / `countLoadStarts`)를
      //  부른다. 사본을 따로 두면 실물 단언과 픽스처가 갈릴 수 있다 (volt #120).
      const SPLIT_DECL = "import {\n  readFileSync,\n  statSync,\n} from 'node:fs';\n";
      assert(
        countLoadStarts(SPLIT_DECL) === 1 &&
          JSON.stringify(collectLoads(SPLIT_DECL)) === JSON.stringify(['node:fs']),
        'F19p 수집: prettier 가 쪼갠 다중행 선언도 1건으로 수집된다 ' +
          '(#1037 — allowlist 불변인데 FAIL 하던 "코드 무변경 FAIL" 경로가 닫혔다는 증거)',
      );
      const NO_SEMICOLON = "import { x } from 'node:vm'\n";
      const TWO_PER_LINE = "import { a } from 'node:fs'; import { b } from 'node:vm';\n";
      assert(
        collectLoads(NO_SEMICOLON).length === 0 &&
          countLoadStarts(NO_SEMICOLON) === 1 &&
          collectLoads(TWO_PER_LINE).length === 0 &&
          countLoadStarts(TWO_PER_LINE) === 1,
        'F19q 수집: 세미콜론 누락·한 줄 2선언은 수집에서 빠지고 **선언 시작 줄 수**로만 드러난다 ' +
          '— 수집을 넓힌 뒤에도 조건 ②가 독립 방어선으로 남는다는 증거',
      );

      // F19r — **오탐 0 + 양성 대조군을 한 소스·한 단언에** (#1084 완료 기준 3항).
      //  두 대조군을 따로 두면 "오탐 0" 이 vacuous 해진다 — 수집이 통째로 고장 나도 음성 단언은
      //  통과하기 때문이다. 같은 소스에 **잡혀야 하는 것 1건**과 **잡히면 안 되는 것 4종**을 함께
      //  넣고 결과가 정확히 `['node:vm']` · 계수 `1` 임을 요구하면, 어느 쪽이 무너져도 값이 어긋난다.
      //  음성 4종은 전부 «모듈을 로드하지 않는 정당한 컬럼 0 export» 다: 문자열 안에 from 을 품은
      //  상수 / 식별자가 from 으로 시작하는 함수 / default / 로컬 재수출(from 절 없음).
      const MIXED_EXPORTS =
        "export const FROM_LABEL = 'from';\n" +
        'export function fromToken() {\n  return 1;\n}\n' +
        'export default FROM_LABEL;\n' +
        'export { fromToken as reexported };\n' +
        "export { x } from 'node:vm';\n";
      assert(
        JSON.stringify(collectLoads(MIXED_EXPORTS)) === JSON.stringify(['node:vm']) &&
          countLoadStarts(MIXED_EXPORTS) === 1,
        'F19r 오탐 0: 모듈 로드가 아닌 컬럼 0 export 4종은 수집·계수 어디에도 들어가지 않고, ' +
          '같은 소스의 allowlist 밖 재수출 1건만 잡힌다 (양성 대조군 동봉 — 음성만으론 vacuous)',
      );

      // F19s — 재수출도 다중행으로 쪼개진다 (F19p 의 재수출 축 대응). prettier 가 명명 목록을
      //  쪼개면 `from` 절이 **다음 줄로 내려가므로**, 사전 구간이 줄바꿈을 넘지 못하면 여기서 샌다.
      const SPLIT_EXPORT = "export {\n  a,\n  b,\n} from 'node:vm';\n";
      assert(
        countLoadStarts(SPLIT_EXPORT) === 1 &&
          JSON.stringify(collectLoads(SPLIT_EXPORT)) === JSON.stringify(['node:vm']),
        'F19s 수집: 다중행으로 쪼개진 재수출도 1건으로 수집된다 ' +
          '(#1037 이 import 축에서 닫은 "코드 무변경 FAIL" 경로를 재수출 축에도 열어두지 않는다)',
      );

      // F19t — 재수출 축의 조건 ② 독립성 (F19q 의 재수출 축 대응). 세미콜론이 없거나 앞 선언과
      //  같은 줄에 붙으면 수집은 실패하고 **계수만** 어긋난다 = 조용한 통과가 아니라 FAIL 이다.
      const EXPORT_NO_SEMICOLON = "export { x } from 'node:vm'\n";
      const IMPORT_THEN_EXPORT = "import { a } from 'node:fs'; export { b } from 'node:vm';\n";
      assert(
        collectLoads(EXPORT_NO_SEMICOLON).length === 0 &&
          countLoadStarts(EXPORT_NO_SEMICOLON) === 1 &&
          collectLoads(IMPORT_THEN_EXPORT).length === 0 &&
          countLoadStarts(IMPORT_THEN_EXPORT) === 1,
        'F19t 수집: 재수출의 세미콜론 누락·한 줄 혼재(import 뒤 재수출)도 계수로만 드러난다 ' +
          '— 두 번째 선언이 컬럼 0 이 아니어서 계수가 1 에 머물고, 수집 0 과 어긋나 FAIL 한다',
      );
    }

    // F20 경계 고정 — **행 본문의 수치·술어 내용**은 검사 대상이 아니다 (헤더 §범위 경계 (iii)).
    //  ADR `20260814-1031-1064-committed-claim-guard-rejected.md` §결정 4 가 확장을 **기각**하면서
    //  명시한 **세 번째 경계**다. 기존 두 경계(F10 = 미등재 / 산문 역참조)와 같은 형식으로 고정한다.
    //
    //  픽스처는 한 행 안에 두 종류의 거짓을 동시에 심는다 — 주제 셀의 **수치**(표 `999건` /
    //  정밀도 `1.0` vs 실물 `3건` / `0/76`)와 상하 관계 셀의 **실행 불가능한 술어**(존재하지 않는
    //  패턴을 세는 재도달 명령). 상태 토큰은 양쪽 다 `Accepted` 이므로 본 가드는 **위반 0** 을
    //  보고해야 한다. 이 PASS 는 가드가 눈감은 것이 아니라 **범위 밖**이라는 뜻이다:
    //  행 본문 자기모순은 `20260808-983` §Amendment 2 가 정밀도 `0/76` 으로 기각한 술어 비교환
    //  클래스와 동형이라, 기계는 _"두 수치가 같은 것을 세는가"_ 를 판정할 수 없다.
    //  ⚠️ 이 픽스처가 **검출**로 뒤집히면 그것은 개선이 아니라 §결정 4 의 번복이다 — 그때는
    //  ADR 개정이 선행돼야 한다 (F10 이 #1015 미등재에 대해 갖는 관계와 같다).
    writeAdr(
      '20260806-local-adr.md',
      '- 상태: **Accepted** (2026-08-06). 측정 대상 3건 · 정밀도 0/76',
    );
    writeIndex([
      upstreamRow,
      '| 2026-08-06 | [local](20260806-local-adr.md) — 측정 대상 **999건** · 정밀도 `1.0` ' +
        '| Accepted | 재도달: `git grep -c 존재하지-않는-패턴` == 42 |',
    ]);
    r = runCheck(tmp);
    assert(
      r.violations.length === 0 && r.compared.length === 1,
      'F20 경계: 행 본문의 수치·술어 내용은 검사하지 않는다 — 표 999건 vs 실물 3건 + 실행 불가 ' +
        '술어를 심어도 상태 토큰만 대조해 위반 0 (범위 밖 — 누락 아님. 확장은 ADR §결정 4 가 기각)',
    );
  } finally {
    rmSync(tmp, { recursive: true, force: true });
  }
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  return fail === 0 ? 0 : 1;
}

// ── 모드 디스패치 ───────────────────────────────────────────────────────────
// `--self-test` 는 **단독 인자일 때만**. `--self-test foo` 처럼 잉여 인자가 붙으면 main() 의
// 잉여 인자 검사(exit 2)로 떨어진다 (두 모드를 한 호출로 합쳐 한쪽 검사가 조용히 무시되는 경로
// 차단 — verify-pr-template-checklist.mjs 의 MODE_ARITY 와 같은 취지).
//
// 판정을 **순수 술어** `isSelfTestMode` 로 분리한 이유 (#1020 2항): self-test 가
// `dispatch(['--self-test'])` 를 실행하면 무한 재귀이므로, 그 경로만은 실행이 아니라 **술어를
// 단언**한다 (F19). 실행 불가능한 마지막 한 줄은 `F15` 가 쓰는 **정적 자기 참조 단언**이 덮는다.

/** `--self-test` 단독 호출인가 (순수 술어 — 부수효과 0) */
function isSelfTestMode(args) {
  return args.length === 1 && args[0] === '--self-test';
}

/** 모드 선택 후 종료 코드를 return (순수 호출 — `process.exit` 는 아래 한 줄에만) */
function dispatch(args) {
  return isSelfTestMode(args) ? selfTest() : main(args);
}

process.exit(dispatch(process.argv.slice(2)));
