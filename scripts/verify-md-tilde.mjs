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
 *      의도된 취소선은 실측 0 발생이고, 의도분은 전부 prettier 미소유 `docs/**` 에 있다
 *      (rev `5651980` / 술어: 본 파일의 `scanContent` 를 미소유 md 전수에 적용 → 23 줄 / 48 발생.
 *      **시점 의존 값이므로 rev 를 병기한다** — ADR `20260808-983` §수치 박제 규약 4항).
 *   3. **스코프** — diff 의 **추가 라인** ∩ post-image 의 위반 라인. 전수 스캔이 아니다.
 *      확정 구간 존량 21줄은 #1040 판정 전까지 손댈 수 없으므로, 전수 스캔은 "고칠 수 없는
 *      것을 매번 보고하는 가드" 가 된다 (#766 alert fatigue 계보 — ADR §후보 비교 (a)(b)).
 *   4. **fail-fast** — `|| true` · soft-exit · allowlist · 예외 경로를 두지 않는다
 *      (CLAUDE.md §가드 설계 원칙). base 미해석도 통과가 아니라 exit 1 이다.
 *
 * ── 범위 경계 (의도적 미검출 / 과보고) ──────────────────────────────────────
 *   (i)   **확정 구간 존량** — diff 밖이라 보고하지 않는다. 회수 가부는 #1040 소관.
 *   (ii)  **prettier 미소유 md** (`docs/**` · `.claude/**` · `CLAUDE.md` 등) — 포맷터가
 *         건드리지 않으므로 손상이 애초에 생기지 않고, 그쪽 `~~` 는 (rev `5651980` 실측)
 *         전부 의도된 취소선이다 — 폐기 표기 / errata / 해소 표기. 시점 의존 판정이라
 *         모집단이 넓어지면 재확인 대상이다 (§모집단 감시).
 *   (iii) **인라인 코드 스팬은 라인 단위로 판정한다.** CommonMark 는 코드 스팬이 줄바꿈을
 *         넘을 수 있게 허용하지만 본 가드는 한 줄 안에서 열고 닫힌 것만 스팬으로 본다.
 *         편차의 방향은 **과보고**(위반을 더 많이 세는 쪽)라 fail-loud 다.
 *   (iv)  **들여쓰기 4칸 이상은 코드로 인정하지 않는다** — 두 형태가 여기 걸린다.
 *         ① 4칸 들여쓰기 코드 블록 ② 리스트 항목 안에서 4칸 이상 들여쓴 **코드 펜스**
 *         (`FENCE_PATTERN` 의 ` {0,3}` 은 문서 최상위 기준이라 3칸까지만 인정한다).
 *         둘 다 해당 라인을 **검사하는** 쪽이므로 편차 방향은 **과보고** = fail-loud 다.
 *         모집단 5 파일 실측 0 건 (rev `dce7279` / 술어: `grep -cE '^ {4,}(```|~~~)'` 를
 *         `CHANGELOG.md` · `README.md` · 각 패키지 `README.md` 에 적용).
 *         ①을 도입하면 리스트 연속 라인을 코드로 오인해 **과소보고**로 뒤집히므로 도입하지
 *         않는다 — 즉 이 경계는 방향을 fail-loud 쪽으로 고정하기 위한 선택이다.
 *   (v)   **이스케이프된 백틱은 여는 delimiter 가 아니다** (CommonMark). `codeSpanRanges`
 *         가 직전 연속 역슬래시 개수를 세어 홀수면 그 백틱을 리터럴로 처리한다. 이 처리가
 *         없으면 가짜 코드 스팬이 생겨 그 안의 위반이 **조용히 통과**한다 — fail-fast 를
 *         표방하는 가드에 과소보고 경로를 남기지 않으려고 문서화가 아니라 **수정**을 택했다.
 *         잔여 편차: 닫는 런에는 이 규칙을 적용하지 않는다. CommonMark 상 코드 스팬 **안**
 *         에서는 백슬래시가 이스케이프로 동작하지 않아 `` `foo\` `` 가 정상 스팬이기 때문이다.
 *   (vi)  **모집단 계수는 차단하지 않는다** — 아래 §모집단 감시 참조.
 *
 * ── 모집단 감시 (ADR §재검토 조건 1) ────────────────────────────────────────
 * ADR §재검토 조건 1 은 술어가 아니라 **모집단 크기**(`ignored: false` 계수) 를 감시 대상으로
 * 삼는다. 그 값은 **기계로 확인 가능**하며 `--population` 모드가 그 관측 술어다
 * (ADR 본문의 셸 루프를 손으로 다시 쓰지 않아도 되도록 스크립트에 넣었다).
 *
 * ⚠️ **박제값 자체를 여기 복제하지 않는다.** 감시값의 SSoT 는 ADR §재검토 조건 1 (+ 그 §Amendment)
 * 이고, 여기 숫자를 적으면 갱신 때마다 두 곳을 고쳐야 하는 drift 원을 새로 만든다 — 실제로
 * 초판이 `5` 를 하드코딩했고 #958(`5`→`45`) · #1063(`45`→`49`) 두 번 연속 누락됐다
 * (volt #120 — "drift 감지" 보다 "중복 출처 제거"가 근본 해결). 대조는 사람이 ADR 을 열어서 한다.
 *
 * 다만 **계수를 차단 조건으로 걸지 않는다.** 근거:
 *   - 모집단이 늘어나는 사건(예: 신규 패키지 `README.md` 추가)은 그 자체로 결함이 아니다.
 *     기대값 `5` 를 상수로 박고 차단하면 **정당한 PR 이 반드시 FAIL** 한다 — 그 사건 클래스에
 *     대해 precision 0 이다.
 *   - ADR 이 규정한 트리거 동작은 _"즉시 재측정한다"_ 라는 **사람의 행위**이지 차단이 아니다.
 *   - 기대 계수 상수는 ADR §후보 비교 (g) 가 기각한 매직 넘버 baseline 과 같은 클래스다
 *     (통과시키려고 올리면 그만이고, 어디가 늘었는지 국소화하지 못한다).
 * 즉 판정은 **관측은 기계 · 판단은 사람**이다. `--population` 은 **관측이 가능한 한** exit 0 이며
 * 계수와 소유 파일 목록을 stdout 에 출력한다.
 *
 * ⚠️ **「차단하지 않는다」 는 「관측 불가를 통과시킨다」 가 아니다** (#1075). 인덱스에 미해결
 * (unmerged) 엔트리가 있으면 `git ls-files` 가 그 경로를 **stage 1/2/3 으로 각각 한 줄씩**
 * 반환해 같은 파일이 stage 수만큼 중복 계수된다 — PR #1074 작업 중 `CHANGELOG.md` 하나가
 * 미해결인 상태에서 계수가 **`+2` 부풀려진 채** exit `0` · 경고 `0` 으로 통과했다 (절대값은
 * 감시값이라 여기 적지 않는다 — 그 관측의 dated 기록은 #1075 의 CHANGELOG entry 에 있다).
 * 이 산출값은 **계수가 아니라 잡음**이므로 `--population` 은 그 상태를 **exit 2 로 fail-fast**
 * 한다 (`--deduplicate` 로 숫자만 맞추는 우회는 fallback 분기라 채택하지 않았다 — 게다가
 * 미해결 상태에서는 `.prettierignore` 자신이 충돌 마커를 품을 수 있어 모집단 판정의 전제가
 * 오염된다).
 *
 * ⚠️ **"차단하지 않는다" 가 "관측하지 않는다" 는 아니다.** `--population` 은 수동 호출뿐이라
 * 그것만 두면 §재검토 조건 1 의 트리거가 **무관측**으로 남는다 — 이 PR 이 닫으려는 결함
 * (_"규범은 있는데 발화 지점이 0"_) 이 한 단계 위에서 재현되는 형태이고, [#897] _"CI 미배선
 * self-test = 0회 실행"_ 의 관측 모드 변형이다. 그래서 `--staged` / `--base` 가 diff 안에서
 * **prettier 소유 md 의 신규 추가**(`--diff-filter=A`)를 발견하면 **통지 2줄을 출력한다.**
 * 통지는 exit code 를 바꾸지 않는다 — 차단 기각 근거 3항이 그대로 유효하므로, 관측 지점만
 * 붙이고 판단은 사람에게 남긴다. 전수 스캔 18초도 필요 없다 (diff 안에서 공짜로 관측된다).
 *
 * ── 종료 코드 ───────────────────────────────────────────────────────────────
 *   0 — 위반 0 (또는 `--population` / `--self-test` 성공)
 *   1 — 위반 발견, 또는 base 미해석 등 **판정 불가** (조용한 통과 없음)
 *   2 — 실행 에러 (잉여/누락 인자, prettier 바이너리 부재, **미해결(unmerged) 인덱스** 등
 *       환경·상태 오류). `--population` 의 미해결 인덱스가 여기 속하는 이유는 `1` 이 본
 *       스크립트에서 «위반 발견» 을 뜻해 진단이 섞이기 때문이다 (#1075)
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
 *
 * **이스케이프 비대칭** (§범위 경계 (v)) — 여는 쪽만 역슬래시를 해석한다.
 *   - 여는 후보: 직전 연속 역슬래시가 **홀수**면 첫 백틱이 리터럴이라 delimiter 에서 뺀다.
 *     (`\` + 백틱 1개` 는 여는 런이 아니다. 이 처리가 없으면 **가짜 스팬**이 생겨 그 안의
 *      위반이 조용히 통과한다 — 실제로 리뷰가 재현한 결함이다.)
 *   - 닫는 쪽: 해석하지 않는다. 코드 스팬 **안**에서는 백슬래시가 이스케이프로 동작하지
 *     않으므로 `` `foo\` `` 는 정상 스팬이다 (CommonMark).
 */
export function codeSpanRanges(line) {
  const runs = [];
  const runPattern = /`+/g;
  let match;
  while ((match = runPattern.exec(line)) !== null) {
    const start = match.index;
    let backslashes = 0;
    for (let k = start - 1; k >= 0 && line[k] === '\\'; k--) backslashes++;
    runs.push({ start, len: match[0].length, escapedFirst: backslashes % 2 === 1 });
  }
  const ranges = [];
  let i = 0;
  while (i < runs.length) {
    const open = runs[i];
    // 이스케이프된 첫 백틱은 delimiter 가 아니다 — 나머지 길이만 여는 런으로 쓴다.
    const openStart = open.escapedFirst ? open.start + 1 : open.start;
    const openLen = open.escapedFirst ? open.len - 1 : open.len;
    if (openLen === 0) {
      i++;
      continue;
    }
    let closeIdx = -1;
    for (let j = i + 1; j < runs.length; j++) {
      if (runs[j].len === openLen) {
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
    ranges.push([openStart, close.start + close.len]);
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
 * 미해결(unmerged) 인덱스 엔트리의 경로 목록 (중복 제거 · 정렬).
 * `git ls-files -u -z` 의 레코드는 `<mode> <object> <stage>\t<path>` 형식이라 탭 뒤가 경로다.
 */
function unmergedPaths() {
  const records = parseNulList(git(['ls-files', '-u', '-z']));
  const paths = records.map((r) => {
    const tab = r.indexOf('\t');
    // 탭이 없으면 형식 가정이 깨진 것이다. 조용히 버리지 않고 레코드 원문을 그대로 올린다.
    return tab < 0 ? r : r.slice(tab + 1);
  });
  return [...new Set(paths)].sort();
}

/**
 * 모집단 관측의 **선행 조건** — 인덱스에 미해결 엔트리가 없어야 한다.
 *
 * `git ls-files` 는 충돌 중인 경로를 **stage 1/2/3 으로 각각 한 줄씩** 반환하므로 같은 파일이
 * stage 수만큼 중복 계수된다 (#1075 — PR #1074 작업 중 `CHANGELOG.md` 하나가 미해결인 상태에서
 * 계수가 **`+2`** 부풀려진 채 exit `0` · 경고 `0` 으로 통과했다. **절대값은 감시값이라 여기
 * 복제하지 않는다** — §모집단 감시 의 사본 금지 규약과 같은 이유다).
 * 이 상태의 산출값은 **「계수가 늘었다」가 아니라 「관측할 수 없다」**
 * 이므로 통과로 흘리지 않는다 — `--population` 의 유일한 소비자는 ADR §재검토 조건 1 의 대조이고,
 * 오계수를 흘리면 사람이 **없는 이탈**을 재측정 트리거로 오독한다.
 *
 * `--deduplicate` 로 계수만 맞추는 우회는 채택하지 않았다. 그건 fallback 분기(판정 불가를
 * 그럴듯한 값으로 덮기)이고, 게다가 미해결 상태에서는 워킹트리 파일이 충돌 마커를 포함해
 * `.prettierignore` 조차 신뢰할 수 없어 **모집단 판정 자체**가 오염된다
 * (CLAUDE.md §가드 설계 원칙 — drift 가드는 fail-fast 만, fallback 분기 절대 금지).
 *
 * 종료 코드는 **2** 다 — 형제 선행 조건인 `requirePrettierBin()` 과 같은 «환경/상태 오류» 계급이고,
 * `1` 은 이 스크립트에서 «위반 발견» 을 뜻하므로 재사용하면 진단이 섞인다.
 */
function requireResolvedIndex() {
  const conflicted = unmergedPaths();
  if (conflicted.length === 0) return;
  console.error(
    `${TAG} 미해결(unmerged) 인덱스 엔트리 ${conflicted.length}건 — 모집단 관측 불가로 FAIL 한다.\n` +
      `${TAG} git ls-files 는 충돌 경로를 stage 1/2/3 으로 각각 한 줄씩 반환해 같은 파일이 최대\n` +
      `${TAG} 3회 계수된다. 이 상태의 산출값은 계수가 아니라 잡음이므로 통과시키지 않는다.\n` +
      `${TAG} 충돌을 해소(또는 \`git merge --abort\`)한 뒤 다시 실행하라.`,
  );
  for (const file of conflicted) console.error(`${TAG}   - ${file}`);
  process.exit(2);
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
  // 모집단 확대 관측 지점 (§모집단 감시) — 신규 추가된 소유 md. 별도 git 호출 1회로
  // 상태 문자 파싱 없이 얻는다 (`--name-status -z` 의 R/C 다중 경로 파싱 회피).
  const addedArgs = [...diffArgs, '--name-only', '-z', '--diff-filter=A'];
  const addedFiles = new Set(parseNulList(git(addedArgs)));
  const newlyOwned = targets.filter((f) => addedFiles.has(f));
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
  return { files, targets, findings, newlyOwned };
}

function report({ files, targets, findings, newlyOwned }) {
  console.log(
    `${TAG} 검사 대상 — 변경된 .md ${files.length}건 중 prettier 소유 ${targets.length}건` +
      (targets.length > 0 ? `: ${targets.join(', ')}` : ''),
  );
  if (newlyOwned.length > 0) {
    // 차단하지 않는다 — exit code 에 영향 없음 (§모집단 감시).
    console.log(
      `${TAG} 통지 — 이 변경이 prettier 소유 md 를 새로 추가한다 (${newlyOwned.length}건): ${newlyOwned.join(', ')}`,
    );
    console.log(
      `${TAG} ADR ${ADR_PATH} §재검토 조건 1(모집단 확대) 재측정 대상이다. 차단 아님 —` +
        ` --population 으로 계수를 다시 재고 ADR 갱신 여부를 사람이 판단한다.`,
    );
  }
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

/** 모집단 관측 — 관측 가능하면 항상 exit 0. 판단은 사람이 한다 (§모집단 감시). */
function runPopulation() {
  const prettierBin = requirePrettierBin();
  // 선행 조건 — 미해결 인덱스는 「관측 불가」다 (exit 2). 계수로 흘리지 않는다 (#1075).
  requireResolvedIndex();
  const all = git(['ls-files', '-z', '*.md']);
  const files = parseNulList(all);
  const owned = files.filter((f) => isPrettierOwnedMarkdown(f, prettierBin));
  console.log(`${TAG} 모집단 관측 (ADR ${ADR_PATH} §재검토 조건 1)`);
  console.log(`${TAG}   tracked *.md            : ${files.length}`);
  console.log(`${TAG}   prettier ignored: false : ${owned.length}`);
  for (const file of owned) console.log(`${TAG}     - ${file}`);
  console.log(
    `${TAG} 위 계수를 ADR §재검토 조건 1 (+ 그 §Amendment) 의 박제값과 대조하라 — 박제값은\n` +
      `${TAG} 그쪽이 SSoT 라 여기 복제하지 않는다. 이탈했으면 **차단이 아니라 재측정** 이\n` +
      `${TAG} 트리거다 — 늘어난 파일에 의도된 취소선이 있는지 확인하고 ADR 을 갱신한다.`,
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
    ['물결 앞 백슬래시는 해석하지 않음 (과보고 방향)', `a\\${TT}b`, 1],
    // §범위 경계 (v) — 이스케이프된 백틱이 가짜 스팬을 만들면 위반이 조용히 통과한다.
    // 리뷰가 재현한 결함 그대로를 픽스처로 고정한다 (수정 전 기대값은 0 이었다).
    ['이스케이프된 백틱은 여는 런이 아니다 — 가짜 스팬 금지', `\\\` 코드 아님 R1${TT}R4 \``, 1],
    ['역슬래시 2개 뒤 백틱은 정상 여는 런 (짝수 = 이스케이프 아님)', `a\\\\\`b${TT}c\``, 0],
    [
      '닫는 런에는 이스케이프를 적용하지 않는다 (코드 스팬 안 백슬래시는 리터럴)',
      `\`foo\\\` ${TT}`,
      1,
    ],
    ['이스케이프된 백틱 뒤 진짜 스팬은 정상 판정', `\\\` \`a${TT}b\``, 0],
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
    // §범위 경계 (iv) — 들여쓰기 3칸까지는 펜스, 4칸부터는 미인지(= 검사 = 과보고).
    // 현행 동작을 픽스처로 **고정**해 두어야 무단 변경이 드러난다 (경계는 방향 선택이다).
    ['3칸 들여쓴 펜스는 인지한다', ['- 항목', '   ```text', `   R1${TT}R4`, '   ```'], []],
    [
      '4칸 들여쓴 펜스는 미인지 — 리스트 안 펜스가 과보고된다 (fail-loud 방향 고정)',
      ['- 항목', '', '    ```text', `    R1${TT}R4`, '    ```'],
      [4],
    ],
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

    // (9) 모집단 확대 관측 — 소유 md 신규 추가 시 통지하되 **차단하지 않는다** (§모집단 감시)
    fs.writeFileSync(path.join(repoDir, 'NEW-README.md'), '- 신규 소유 md (위반 없음)\n');
    g(['add', 'NEW-README.md']);
    r = runSelfInRepo(repoDir, ['--staged']);
    assert.equal(
      r.status,
      0,
      `(9) 신규 소유 md 통지는 차단 아님 → PASS 기대, 실제 ${r.status}\n${r.out}`,
    );
    assert.match(
      r.out,
      /통지 — 이 변경이 prettier 소유 md 를 새로 추가한다 \(1건\): NEW-README\.md/,
      `(9) 모집단 통지 누락\n${r.out}`,
    );
    assert.match(r.out, /재검토 조건 1/, `(9) 통지에 ADR 트리거 참조 누락\n${r.out}`);

    // (10) 통지는 무시 파일에는 발화하지 않는다 (모집단 계약이 통지에도 적용)
    fs.writeFileSync(path.join(repoDir, 'NEW-IGNORED.md'), '- 신규 무시 md\n');
    fs.writeFileSync(path.join(repoDir, '.prettierignore'), 'IGNORED.md\nNEW-IGNORED.md\n');
    g(['add', '-A']);
    r = runSelfInRepo(repoDir, ['--staged']);
    assert.equal(r.status, 0, `(10) 무시 파일 신규 추가 → PASS 기대, 실제 ${r.status}\n${r.out}`);
    assert.ok(!r.out.includes('NEW-IGNORED.md'), `(10) 무시 파일이 통지에 등장\n${r.out}`);

    // (11) --population positive — 미해결 엔트리 0 이면 관측 가능 → exit 0 + 계수 출력
    g(['add', '-A']);
    g(['commit', '-q', '--allow-empty', '-m', 'population baseline']);
    r = runSelfInRepo(repoDir, ['--population']);
    assert.equal(
      r.status,
      0,
      `(11) 정상 인덱스 --population → exit 0 기대, 실제 ${r.status}\n${r.out}`,
    );
    assert.match(r.out, /prettier ignored: false : \d+/, `(11) 계수 출력 누락\n${r.out}`);

    // (12) negative — 미해결(unmerged) 인덱스는 「계수」가 아니라 「관측 불가」다 (#1075).
    //  git ls-files 가 충돌 경로를 stage 1/2/3 으로 각각 반환해 같은 파일이 최대 3회 계수되는
    //  경로를 실제 충돌로 재현한다. `--deduplicate` 로 숫자만 맞추는 우회는 fallback 분기라
    //  채택하지 않았으므로, 여기서 요구하는 것은 «정확한 계수» 가 아니라 «exit 2 + 경로 지목» 이다.
    const conflictBranch = spawnSync('git', ['checkout', '-q', '-b', 'conflict-side'], {
      cwd: repoDir,
      encoding: 'utf8',
    });
    assert.equal(conflictBranch.status, 0, `(12) 충돌 브랜치 생성 실패\n${conflictBranch.stderr}`);
    fs.appendFileSync(changelog, '- side 변경\n');
    g(['commit', '-q', '-am', 'side']);
    g(['checkout', '-q', 'main']);
    fs.appendFileSync(changelog, '- main 변경\n');
    g(['commit', '-q', '-am', 'main']);
    const merge = spawnSync('git', ['merge', '--no-edit', 'conflict-side'], {
      cwd: repoDir,
      encoding: 'utf8',
    });
    assert.notEqual(
      merge.status,
      0,
      `(12) 충돌이 발생하지 않았다 — 픽스처 전제 붕괴\n${merge.stdout}`,
    );
    r = runSelfInRepo(repoDir, ['--population']);
    assert.equal(
      r.status,
      2,
      `(12) 미해결 인덱스 --population → exit 2 기대(관측 불가), 실제 ${r.status}\n${r.out}`,
    );
    assert.match(r.out, /미해결\(unmerged\) 인덱스 엔트리 1건/, `(12) 미해결 진단 누락\n${r.out}`);
    assert.match(r.out, /- CHANGELOG\.md/, `(12) 충돌 경로 지목 누락 (중복 제거 후 1건)\n${r.out}`);
    assert.ok(
      !/prettier ignored: false/.test(r.out),
      `(12) 관측 불가인데 계수를 출력했다 — 통과로 흘리는 경로\n${r.out}`,
    );

    // (13) recovery — 충돌을 되돌리면 관측이 다시 가능해진다 (exit 0 복원)
    const abort = spawnSync('git', ['merge', '--abort'], { cwd: repoDir, encoding: 'utf8' });
    assert.equal(abort.status, 0, `(13) merge --abort 실패\n${abort.stderr}`);
    r = runSelfInRepo(repoDir, ['--population']);
    assert.equal(r.status, 0, `(13) 충돌 해소 후 exit 0 복원 기대, 실제 ${r.status}\n${r.out}`);
    assert.match(r.out, /prettier ignored: false : \d+/, `(13) 복원 후 계수 출력 누락\n${r.out}`);

    console.log(`${TAG} self-test (B) 3중 시뮬레이션 PASS — 13 단계 (격리 저장소: 임시 디렉토리)`);
  } finally {
    fs.rmSync(repoDir, { recursive: true, force: true });
  }
}

function selfTest() {
  // 환경 전제를 assertion **앞에서** 거른다 (§종료 코드 계약). 이 줄이 없으면 node_modules
  // 부재 트리에서 (B) 의 자식 프로세스가 exit 2 를 내고, 부모의 assert 가 그것을
  // AssertionError → uncaught → **exit 1** 로 바꿔 "환경 오류 = 2" 계약을 이 경로만 어긴다.
  requirePrettierBin();
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
