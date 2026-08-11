#!/usr/bin/env node
/**
 * verify-pr-template-checklist.mjs
 *
 * PR 본문이 `.github/PULL_REQUEST_TEMPLATE.md` 의 7 키워드 base 를 보존하는지 검증한다
 * (측정 방법 C — 2차 phrase grep 이 blocking 축, 1차 구조 grep 이 WARN 축).
 *
 * **본 스크립트가 측정 방법 C 판정식의 정본(SSoT)이다.** `.claude/agents/developer.md`
 * §측정 방법 C / `.claude/skills/create-pr/SKILL.md` 의 3계급 표는 *사람이 읽는 계약* 이고,
 * `.claude/agents/reviewer.md` §절차 6 / `.claude/agents/qa.md` §4 는 판정식을 재서술하지 않고
 * 본 스크립트를 **호출**한다. 두 곳이 갈리면 스크립트가 옳다 (#1010).
 *
 * ── 3계급 판정 (#1010) ──────────────────────────────────────────────────────
 *   FAIL (exit 1) : phraseHits = 0                              → 코멘트 + 빨간 X
 *   WARN (exit 0) : phraseHits ≥ 1 ∧ structureHits = 0          → 어노테이션 + step summary
 *   PASS (exit 0) : phraseHits ≥ 1 ∧ structureHits ≥ 1
 *
 * **blocking 경계는 #1010 이전과 수학적으로 동일하다.** 종전 판정은
 * `pass = phraseHits >= 1 || structureHits >= 1` 이었는데, structureHits 를 세는 라인은
 * 반드시 phrase 를 포함하고 그 라인은 body 의 부분문자열이므로
 *   structureHits ≥ 1 ⟹ phraseHits ≥ 1
 * 이 성립한다. 따라서 `phrase≥1 ∨ structure≥1` ≡ `phrase≥1` 이고, 종전 FAIL 조건
 * `(phrase=0 ∧ structure=0)` 은 `(phrase=0)` 과 동치다. 즉 FAIL 집합 불변이 실측이 아니라
 * **증명으로 보장**된다 (실측 보강: 최근 머지 PR 60건 × 7 kw = 420 셀에서
 * `structureHits≥1 ∧ phraseHits=0` 반례 0건).
 *
 * 종전 구현에서 `structureHits` 는 판정에 0 기여하는 **논리적 잉여**였다. #1010 은 이 항을
 * 버리지 않고 **WARN 축으로 승격**해, 문서(`developer.md`)가 선언만 하고 구현이 없던
 * 중간 계급을 채운다. 이 계급이 비어 있는 동안 템플릿 체크박스가 `###` 헤더로 대체되는
 * 침식이 최근 머지 PR 60건 중 10건에서 **무신호로** 진행됐다.
 *
 * ── 구조(structure) hit 의 정의는 키워드 계급마다 다르다 ─────────────────────
 * 템플릿에서 그 항목이 갖는 **원래 형태**를 보존했는지를 묻기 때문이다.
 *   - 키워드 1~5 → `### 체크리스트` 절의 체크박스 항목. 같은 라인에 `- [ ]`/`- [x]` + phrase
 *   - 키워드 6~7 → 템플릿에서 `###` 섹션 헤더로만 존재. 같은 라인에 `#` 헤더 + phrase
 * 계급을 뭉쳐 합집합(체크박스 ∪ 헤더)으로 재면 위 침식이 전부 PASS 로 흡수돼 신호가 사라진다.
 *
 * ── WARN 은 fallback 이 아니다 ──────────────────────────────────────────────
 * fallback = *판정 불가 시 통과로 흘리는* 분기. WARN 은 **판정 성공 후의 명시적 제3 결론**이며
 * 조건이 결정적이다. FAIL 경로는 그대로 fail-fast (exit 1, 경계 불변). WARN 이 없을 때
 * 침식이 PASS 로 흘러가던 것이 오히려 silent fallback 이었고, 본 구현은 그것을 **제거**한다.
 * (`docs/lessons/guard-design-principles.md` — drift 가드는 fail-fast 만)
 *
 * #471 (create-pr 스킬 사전 차단) 의 CI 측 backstop. 사용자가 수동
 * `gh pr create --body "..."` 로 prefill 우회 시 본 가드가 발화.
 * 단 **required status check 가 아니다** (ADR `20260807-971` 결정 9-1 이 명시 제외) —
 * `exit 1` 은 빨간 X + actionable 코멘트이지 머지 차단이 아니다.
 *
 * 호출:
 *   node scripts/verify-pr-template-checklist.mjs <PR번호>
 *     → PASS/WARN: exit 0 (WARN 은 ::warning:: 어노테이션 + step summary)
 *     → FAIL: exit 1, 누락 키워드 stderr + (CI 환경에서) PR 코멘트로 actionable 보고
 *   node scripts/verify-pr-template-checklist.mjs --self-test
 *     → 격리 픽스처 F1~F9 (가드 도입 PR DoD 축 1). 네트워크 비의존
 *   node scripts/verify-pr-template-checklist.mjs --check-corpus <json>
 *     → `gh pr list --json number,body,author,...` 산출물 전수 재현 (1회성 증거, CI 미배선)
 *
 * 환경 변수:
 *   GH_TOKEN — gh CLI 인증 토큰 (CI 자동 주입)
 *   POST_COMMENT — "true" 시 FAIL PR 에 자동 코멘트 (CI 에서 활성). WARN 은 코멘트하지 않는다
 *                  (release PR 클래스 상습 발화 → alert fatigue, #766 계보)
 *   GITHUB_STEP_SUMMARY — GitHub Actions 가 주입하는 요약 파일 경로 (WARN 표 출력 대상)
 *
 * 관련 이슈: #1010 (3계급 + 판정식 SSoT 수렴) / #473 (D4 CI backstop, #470 분리) /
 *            #471 (스킬 측 사전 차단) / #469 (측정 방법 C 원안) / #855 (템플릿↔가드 정합)
 */

import { execSync, spawnSync } from 'node:child_process';
import { appendFileSync, existsSync, readFileSync } from 'node:fs';
import { dirname, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';

const SCRIPT_DIR = dirname(fileURLToPath(import.meta.url));
const REPO_ROOT = resolve(SCRIPT_DIR, '..');
const TEMPLATE_PATH = resolve(REPO_ROOT, '.github/PULL_REQUEST_TEMPLATE.md');

// 7 키워드 base — `.github/PULL_REQUEST_TEMPLATE.md` 의 `### 체크리스트` **5 항목**
// (커밋 컨벤션 / 불필요 / 보안 / SSoT / cross-validate) + `###` **헤더 2 항목**
// (`### ADR 호환성 체크` / `### Test plan (테스트)`).
//   ⚠️ 종전 주석은 *"`### 체크리스트` 6 항목 + 상위 Test plan 1 항목"* 이라 적었으나
//   템플릿 실측은 체크박스 5 항목이다 (재현:
//   `sed -n '/^### 체크리스트$/,/^### /p' .github/PULL_REQUEST_TEMPLATE.md | grep -c "^- \[ \]"` → 5).
//
// `structureClass` — 구조 hit 판정 계급. 키워드 목록·phrase 문자열은 #1010 범위 밖(불변)이고
// 본 필드만 신설됐다.
const CHECKLIST_KEYWORDS = [
  { id: '1', name: '커밋 컨벤션', phrase: '커밋 컨벤션', structureClass: 'checkbox' },
  { id: '2', name: '불필요한 변경', phrase: '불필요', structureClass: 'checkbox' },
  { id: '3', name: '보안', phrase: '보안', structureClass: 'checkbox' },
  { id: '4', name: 'SSoT (sub-agent JSON 스키마)', phrase: 'SSoT', structureClass: 'checkbox' },
  {
    id: '5',
    name: 'cross-validate (정책·규약·ADR 박제 시)',
    phrase: 'cross-validate',
    structureClass: 'checkbox',
  },
  { id: '6', name: 'ADR 호환성', phrase: 'ADR 호환성', structureClass: 'header' },
  { id: '7', name: 'Test plan (단위 테스트)', phrase: 'Test plan', structureClass: 'header' },
];

// 1차 구조 — 계급별 패턴
const CHECKBOX_PATTERN = /^\s*-\s*\[[ xX]\]/;
// 헤더는 **ATX 레벨을 가리지 않는다** (`#`~`######`). 템플릿이 쓰는 레벨은 `###` 이지만,
// 묻는 것은 *"섹션 헤더로 존재하는가"* 이지 레벨이 아니다. 실측 민감도 (60 PR × 7 kw = 420 셀):
//   `#{1,6}` → PASS 387 / WARN 21 / FAIL 12     ← 채택
//   `#{3}`   → PASS 385 / WARN 23 / FAIL 12     (봇 PR `#924`·`#925` 의 `## Test plan` 2셀 (술어: `--check-corpus` 60 PR 중 `#{3}` 패턴에서만 WARN 으로 갈리는 셀. **release PR 아님** — release 클래스 WARN 집합은 두 패턴에서 불변이고, 두 봇 PR 은 CI 에서 job 스킵이라 **실제 가시 차이 0**)이 WARN 으로 오분류)
// 구조 축은 WARN 전용이라 느슨한 쪽이 오탐(거짓 WARN)을 줄이고, blocking 경계에는 어떤 영향도 없다.
const HEADER_PATTERN = /^\s*#{1,6}\s/;
const STRUCTURE_PATTERNS = { checkbox: CHECKBOX_PATTERN, header: HEADER_PATTERN };

// 코드 펜스 — 펜스 **안**의 체크박스/헤더는 구조 hit 으로 세지 않는다.
//   PR 본문·ADR 이 템플릿 조각을 ```text 블록으로 인용하는 관행이 있어 잠재 오탐 경로가
//   실재한다 (본 PR 본문 자신이 그렇다). 단 **현 시점 영향은 0** 이다 — 펜스 안 구조 hit
//   0건 (술어: 최근 머지 PR 60건 본문 전수, 라인이 계급 패턴 ∧ 해당 kw phrase 를 동시
//   만족한 hit 수 — 체크박스 계급 펜스 밖 328 / 헤더 계급 펜스 밖 118, 닫히지 않은 펜스 0건).
//   "펜스 오탐을 잡았다" 는 과대 주장 금지 (volt #101 measurement-first).
// phrase 축은 펜스를 제외하지 **않는다** — 제외하면 blocking 경계가 움직여
// "FAIL 집합 불변" 증명이 깨진다 (#1010 비목표 2).
const FENCE_PATTERN = /^\s*(?:```|~~~)/;

const VERDICT = { PASS: 'PASS', WARN: 'WARN', FAIL: 'FAIL' };

function fetchPRBody(prNumber) {
  const cmd = `gh pr view ${prNumber} --json body --jq .body`;
  return execSync(cmd, { encoding: 'utf-8' });
}

/**
 * 구조 hit — 코드 펜스 밖에서, 계급별 패턴과 phrase 가 **같은 라인**에 동시 등장한 횟수.
 *
 * 펜스 토글은 단순 in/out 이다. 닫히지 않은 펜스가 있으면 이후 전 라인이 "안" 으로 간주돼
 * 구조 hit 이 줄어드는데, 그 방향은 WARN 증가(= 신호 증가)일 뿐 blocking 경계를 건드리지
 * 않으므로 fail-loud 쪽이다.
 */
function countStructureHits(body, phraseLower, structureClass) {
  const pattern = STRUCTURE_PATTERNS[structureClass];
  if (!pattern) {
    // 키워드 테이블과 패턴 테이블의 drift. 조용히 0 을 반환하면 전 셀이 WARN 으로 흘러
    // 원인이 은폐된다 — fail-fast.
    throw new Error(`알 수 없는 structureClass: '${structureClass}' (STRUCTURE_PATTERNS drift)`);
  }
  let hits = 0;
  let inFence = false;
  for (const line of body.split('\n')) {
    if (FENCE_PATTERN.test(line)) {
      inFence = !inFence;
      continue;
    }
    if (inFence) continue;
    if (pattern.test(line) && line.toLowerCase().includes(phraseLower)) hits++;
  }
  return hits;
}

function checkKeyword(body, keyword) {
  // 2차 phrase: 단순 부분문자열 포함 (case-insensitive — 한국어는 case 무관).
  // 부분문자열 과매칭(예: '보안' ⊂ '정보안내')은 #1010 범위 밖이다 — phrase 축을 조이면
  // blocking 경계가 움직인다. `--self-test` F9 가 현행 동작을 고정해 무단 변경을 잡는다.
  const phraseLower = keyword.phrase.toLowerCase();
  const phraseHits = body.toLowerCase().split(phraseLower).length - 1;
  const structureHits = countStructureHits(body, phraseLower, keyword.structureClass);

  let verdict;
  if (phraseHits === 0) verdict = VERDICT.FAIL;
  else if (structureHits === 0) verdict = VERDICT.WARN;
  else verdict = VERDICT.PASS;

  return { keyword, phraseHits, structureHits, verdict };
}

function analyzeBody(body) {
  const results = CHECKLIST_KEYWORDS.map((kw) => checkKeyword(body, kw));
  return {
    results,
    failed: results.filter((r) => r.verdict === VERDICT.FAIL),
    warned: results.filter((r) => r.verdict === VERDICT.WARN),
  };
}

function structureLabel(keyword) {
  return keyword.structureClass === 'checkbox' ? '체크박스' : '`###` 헤더';
}

// =============================================================================
// 보고 — FAIL 코멘트 / WARN 어노테이션 + step summary
// =============================================================================

function postComment(prNumber, failed) {
  const body = [
    '## PR 템플릿 체크리스트 가드 (#473 / 3계급 #1010)',
    '',
    `**FAIL ${failed.length}/7** — PR 본문에 \`.github/PULL_REQUEST_TEMPLATE.md\` 의 7 키워드 base 가 보존되어야 합니다.`,
    '',
    '### FAIL 키워드 (phrase 0 hit — 가시성 0)',
    '',
    ...failed.map(
      (m) =>
        `- **[${m.keyword.id}] ${m.keyword.name}** — phrase "\`${m.keyword.phrase}\`" 매칭 0 hit (1차 구조 ${m.structureHits} / 2차 phrase ${m.phraseHits})`,
    ),
    '',
    '### 해결',
    '',
    '1. **권장**: `create-pr` 스킬 사용 (#471) — PR 본문 7 체크박스 base 를 PR 템플릿에서 동적 읽기',
    // ⚠️ 본 문자열은 **PR 코멘트로 렌더링되는 마크다운**이다. 한 문단에 `~` 가 2개 있으면
    // GFM 이 strikethrough 로 페어링하므로 범위 표기는 반드시 인라인 코드로 감싼다.
    '2. **수동**: PR 본문에 누락 항목을 **템플릿 원래 형태로** 추가 — 키워드 `1~5` 는 체크박스 (`- [ ] <키워드>`, N/A 항목도 `[x] N/A — <사유>` 로 유지, #469), 키워드 `6~7` (ADR 호환성 / Test plan) 은 `### <키워드>` 섹션 헤더',
    '',
    '> 3계급 판정: `phrase 0` → FAIL(본 코멘트) / `phrase≥1 ∧ 구조 0` → WARN(어노테이션만, 머지 차단 없음) / 둘 다 ≥1 → PASS.',
    '> 본 가드는 required status check 가 **아닙니다** (ADR `20260807-971` 결정 9-1) — 빨간 X 는 머지 차단이 아니라 신호입니다.',
    '',
    `근거: [#1010](https://github.com/coseo12/astro-simulator/issues/1010) (3계급 판정식 SSoT) / [#473](https://github.com/coseo12/astro-simulator/issues/473) (D4 CI backstop, #470 분리) / [#471](https://github.com/coseo12/astro-simulator/issues/471) (스킬 사전 차단)`,
  ].join('\n');

  // shell 우회 (백틱 / 특수 문자 보호) — spawnSync + stdin 전달
  const result = spawnSync('gh', ['pr', 'comment', prNumber, '--body-file', '-'], {
    input: body,
    stdio: ['pipe', 'inherit', 'inherit'],
    encoding: 'utf-8',
  });
  if (result.status !== 0) {
    console.error(`코멘트 발송 실패: exit ${result.status}`);
  }
}

/**
 * WARN 보고 — `::warning::` 어노테이션 + `$GITHUB_STEP_SUMMARY` 표.
 * PR 코멘트는 발송하지 않는다 (release PR 클래스 상습 발화 → alert fatigue, #766 계보).
 */
function reportWarnings(prNumber, warned) {
  for (const w of warned) {
    console.log(
      `::warning title=PR 템플릿 구조 소실 [${w.keyword.id}] ${w.keyword.name}::` +
        `phrase ${w.phraseHits} hit 이지만 ${structureLabel(w.keyword).replace(/`/g, '')} 구조 0 hit — ` +
        `템플릿 원 구조가 소실됐습니다 (non-blocking 권고, #1010).`,
    );
  }

  const summaryPath = process.env.GITHUB_STEP_SUMMARY;
  if (!summaryPath) return;
  const lines = [
    `## PR 템플릿 체크리스트 가드 — WARN ${warned.length}/7 (PR #${prNumber})`,
    '',
    'phrase 는 있으나 **템플릿 원 구조가 소실**된 항목입니다. 머지를 차단하지 않습니다 (non-blocking 권고).',
    '',
    '| kw | 항목 | 기대 구조 | 구조 hit | phrase hit |',
    '| --- | --- | --- | --- | --- |',
    ...warned.map(
      (w) =>
        `| ${w.keyword.id} | ${w.keyword.name} | ${structureLabel(w.keyword)} | ${w.structureHits} | ${w.phraseHits} |`,
    ),
    '',
    '> reviewer 는 이 표를 `non_blocking_suggestions` 로 승격한다 (`.claude/agents/reviewer.md` §절차 6).',
    '',
  ];
  appendFileSync(summaryPath, `${lines.join('\n')}\n`, 'utf-8');
}

function printResults(prNumber, analysis) {
  const { results, failed, warned } = analysis;
  const passed = results.length - failed.length - warned.length;
  console.log(
    `PR #${prNumber} 측정 방법 C 3계급 — PASS ${passed} / WARN ${warned.length} / FAIL ${failed.length}`,
  );
  for (const r of results) {
    console.log(
      `  [${r.keyword.id}] ${r.verdict.padEnd(4)} ${r.keyword.name} — 구조(${r.keyword.structureClass}) ${r.structureHits} / phrase ${r.phraseHits}`,
    );
  }
}

// =============================================================================
// PR 검사 모드
// =============================================================================

function runPrCheck(prNumber) {
  let body;
  try {
    body = fetchPRBody(prNumber);
  } catch (err) {
    console.error(`PR #${prNumber} 본문 조회 실패: ${err.message}`);
    return 2;
  }

  const analysis = analyzeBody(body);
  printResults(prNumber, analysis);

  if (analysis.warned.length > 0) reportWarnings(prNumber, analysis.warned);

  if (analysis.failed.length === 0) {
    console.log(
      `✅ PR #${prNumber} 7 키워드 base phrase 전건 보존 (blocking 경계 = phrase ≥ 1)` +
        (analysis.warned.length > 0 ? ` — 단 WARN ${analysis.warned.length}건 (구조 소실)` : ''),
    );
    return 0;
  }

  console.error(
    `❌ PR #${prNumber} 7 키워드 base FAIL ${analysis.failed.length}/7 (phrase 0 hit):`,
  );
  for (const m of analysis.failed) {
    console.error(
      `  - [${m.keyword.id}] ${m.keyword.name}: phrase "${m.keyword.phrase}" → 1차 구조 ${m.structureHits} / 2차 phrase ${m.phraseHits}`,
    );
  }

  if (process.env.POST_COMMENT === 'true') {
    postComment(prNumber, analysis.failed);
  }

  return 1;
}

// =============================================================================
// --self-test — 격리 픽스처 F1~F9 (가드 도입 PR DoD 축 1)
// =============================================================================

/**
 * 픽스처 base 는 **live 템플릿**이다.
 *
 * 하드코딩 스냅샷을 쓰지 않는 이유: 본 가드가 재는 대상이 *"PR 본문이 템플릿 base 를
 * 보존하는가"* 이므로, 템플릿이 키워드 phrase 를 잃으면 가드는 전 PR 을 FAIL 시킨다.
 * 실제로 그 사고가 있었다 — 템플릿에 영문 `Test plan` phrase 가 없어 kw7 단독 FAIL 이
 * 반복되다가 `e57c60d` (#855) 로 템플릿을 가드에 정합시켜 해소됐다. 스냅샷 픽스처는
 * 그 클래스를 원리적으로 못 잡는다.
 *
 * 파생 픽스처는 `mustReplace` 로 앵커 부재 시 **즉시 throw** 한다 — 앵커가 사라졌는데
 * 변형이 no-op 이 되면 픽스처가 조용히 F1 과 같아져 "갈림" 증거가 위조된다.
 */
function readTemplate() {
  if (!existsSync(TEMPLATE_PATH)) {
    throw new Error(`PR 템플릿 부재: ${TEMPLATE_PATH} — 가드의 픽스처 base 가 소실됐습니다.`);
  }
  return readFileSync(TEMPLATE_PATH, 'utf-8');
}

function mustReplace(text, from, to) {
  if (!text.includes(from)) {
    throw new Error(
      `픽스처 앵커 부재: ${JSON.stringify(from)}\n` +
        `  → 템플릿이 바뀌어 변형이 no-op 이 됩니다. 픽스처를 템플릿에 맞게 갱신하세요.`,
    );
  }
  return text.replace(from, to);
}

const ANCHOR_KW3_CHECKBOX = '- [ ] 보안 취약점 없음';
const ANCHOR_KW6_HEADER =
  '### ADR 호환성 체크 (docs/decisions/ 변경 시 필수, reviewer.md §절차 5 정합)';

/**
 * F1~F9 — 각 픽스처는 `[phraseHits, structureHits, verdict]` 를 **수치까지** 단언한다.
 * verdict 만 단언하면 structureHits 가 다시 잉여로 퇴화해도 못 잡는다.
 *
 * `legacyVerdict` = #1010 이전 2계급 판정 (`phrase≥1 ∨ structure≥1`) 의 결과.
 * 개정 전후가 **갈리는 셀 5**(F2·F3·F5·F8·**F9**)와 **불변 셀 4**(F1·F4·F6·F7)를 같은 표에서 증명한다.
 * (F9 는 `보안` ⊂ `정보안내` 과매칭 고정 픽스처인데 `F9/kw3: PASS → WARN` 으로 갈린다 — 초판 주석이
 *  이를 불변으로 오기했다. PR #1015 리뷰 권고 1: 주석↔구현 drift 는 본 PR 이 겨눈 클래스 그 자체다.)
 */
function buildFixtures() {
  const template = readTemplate();

  return [
    {
      id: 'F1',
      note: '템플릿 원문 그대로 (positive 기준선 + 템플릿↔가드 정합 회귀 가드, #855)',
      body: template,
      expect: CHECKLIST_KEYWORDS.map((kw) => ({ id: kw.id, verdict: VERDICT.PASS })),
    },
    {
      id: 'F2',
      note: 'kw3 체크박스를 `### 보안` 헤더 절로 이동 (#964 실물 재현 — 침식 패턴)',
      body: mustReplace(template, ANCHOR_KW3_CHECKBOX, '### 보안\n취약점 없음'),
      expect: [{ id: '3', verdict: VERDICT.WARN, structureHits: 0, legacyVerdict: 'PASS' }],
    },
    {
      id: 'F3',
      note: 'kw3 을 산문 1줄로만 (`보안 이슈 없음`)',
      body: mustReplace(template, ANCHOR_KW3_CHECKBOX, '보안 이슈 없음'),
      expect: [
        { id: '3', verdict: VERDICT.WARN, phraseHits: 1, structureHits: 0, legacyVerdict: 'PASS' },
      ],
    },
    {
      id: 'F4',
      note: 'kw3 완전 삭제 → FAIL (blocking 경계 불변 실증)',
      body: mustReplace(template, ANCHOR_KW3_CHECKBOX, ''),
      expect: [
        { id: '3', verdict: VERDICT.FAIL, phraseHits: 0, structureHits: 0, legacyVerdict: 'FAIL' },
      ],
    },
    {
      id: 'F5',
      note: 'kw6 을 체크박스로만 (헤더 계급인데 체크박스 → 계급 비대칭 실증)',
      body: mustReplace(template, ANCHOR_KW6_HEADER, '- [ ] ADR 호환성 체크'),
      expect: [{ id: '6', verdict: VERDICT.WARN, structureHits: 0, legacyVerdict: 'PASS' }],
    },
    {
      id: 'F6',
      note: 'kw7 헤더 + 체크박스 동시 (#1002 실물) → 헤더 계급 hit 존재하므로 PASS 불변',
      body: `${template}\n\n### Test plan\n- [x] Test plan 갱신 완료\n`,
      expect: [{ id: '7', verdict: VERDICT.PASS, legacyVerdict: 'PASS' }],
    },
    {
      id: 'F7',
      note: '본문 전체 삭제 (빈 문자열) → 7 kw 전건 FAIL',
      body: '',
      expect: CHECKLIST_KEYWORDS.map((kw) => ({
        id: kw.id,
        verdict: VERDICT.FAIL,
        phraseHits: 0,
        structureHits: 0,
        legacyVerdict: 'FAIL',
      })),
    },
    {
      id: 'F8',
      note: 'kw3 체크박스가 코드 펜스 **안**에만 존재 (현 시점 실 PR 영향 0 — §부록 실측)',
      body: mustReplace(template, ANCHOR_KW3_CHECKBOX, '```text\n- [ ] 보안 취약점 없음\n```'),
      expect: [{ id: '3', verdict: VERDICT.WARN, structureHits: 0, legacyVerdict: 'PASS' }],
    },
    {
      id: 'F9',
      note: 'phrase 부분문자열 과매칭 고정 — `보안` ⊂ `정보안내` (#1010 범위 밖, 무단 변경 감지용)',
      body: '### 정보안내\n일반 문단입니다.\n',
      expect: [
        { id: '3', verdict: VERDICT.WARN, phraseHits: 1, structureHits: 0, legacyVerdict: 'PASS' },
      ],
    },
  ];
}

/** #1010 이전 2계급 판정 재현 — `pass = phraseHits >= 1 || structureHits >= 1` */
function legacyVerdictOf(r) {
  return r.phraseHits >= 1 || r.structureHits >= 1 ? 'PASS' : 'FAIL';
}

/**
 * 인자 파싱 프로브 — 자식 프로세스로 실제 CLI 를 때린다.
 * 같은 프로세스에서 순수 함수를 부르면 파싱 순서를 전혀 검증하지 못한다
 * (`verify-branch-name.mjs` B1 결함 이력 답습 회피).
 */
function runArgParseProbes() {
  const SCRIPT_PATH = fileURLToPath(import.meta.url);
  const cases = [
    {
      args: ['--self-test', '1010'],
      status: 2,
      text: '잉여 인자',
      label: '--self-test 에 PR 번호 병합 — 한쪽을 조용히 버리지 않고 exit 2',
    },
    {
      args: ['1010', '--self-test'],
      status: 2,
      text: '잉여 인자',
      label: 'PR 번호에 모드 병합 — 모드가 조용히 무시되지 않고 exit 2',
    },
    {
      args: ['--unknown-mode'],
      status: 2,
      text: '알 수 없는',
      label: '미등록 모드 — fail-closed',
    },
    { args: [], status: 2, text: 'usage', label: '인자 없음 — usage + exit 2' },
    {
      args: ['not-a-number'],
      status: 2,
      text: 'usage',
      label: '숫자 아닌 위치 인자 — exit 2',
    },
    {
      args: ['--check-corpus'],
      status: 2,
      text: '인자가 필요',
      label: '--check-corpus 파일 누락 — exit 2',
    },
  ];
  return cases.map((c) => {
    const r = spawnSync(process.execPath, [SCRIPT_PATH, ...c.args], {
      encoding: 'utf-8',
      env: { ...process.env, POST_COMMENT: 'false' },
    });
    const emitted = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const ok = r.status === c.status && emitted.toLowerCase().includes(c.text.toLowerCase());
    return {
      ok,
      detail: ok
        ? c.label
        : `${c.label} — 기대 exit ${c.status} + "${c.text}", 실제 exit ${r.status} / 출력 ${emitted.trim().length}자`,
    };
  });
}

function runSelfTest() {
  console.log('self-test: verify-pr-template-checklist.mjs (격리 픽스처 F1~F9)\n');
  let pass = 0;
  let fail = 0;
  const drift = [];

  let fixtures;
  try {
    fixtures = buildFixtures();
  } catch (e) {
    console.error(`[FAIL] 픽스처 구성 실패 — ${e.message}`);
    return 1;
  }

  for (const fx of fixtures) {
    const results = CHECKLIST_KEYWORDS.map((kw) => checkKeyword(fx.body, kw));
    const byId = new Map(results.map((r) => [r.keyword.id, r]));
    const cells = [];
    for (const e of fx.expect) {
      const r = byId.get(e.id);
      const problems = [];
      if (r.verdict !== e.verdict) problems.push(`verdict ${r.verdict} ≠ ${e.verdict}`);
      if (e.phraseHits !== undefined && r.phraseHits !== e.phraseHits)
        problems.push(`phrase ${r.phraseHits} ≠ ${e.phraseHits}`);
      if (e.structureHits !== undefined && r.structureHits !== e.structureHits)
        problems.push(`structure ${r.structureHits} ≠ ${e.structureHits}`);
      const legacy = legacyVerdictOf(r);
      if (e.legacyVerdict !== undefined && legacy !== e.legacyVerdict)
        problems.push(`legacy ${legacy} ≠ ${e.legacyVerdict}`);

      if (problems.length === 0) {
        pass++;
        cells.push(
          `kw${e.id} ${r.verdict}(ph ${r.phraseHits}/st ${r.structureHits}) [2계급: ${legacy}]`,
        );
      } else {
        fail++;
        cells.push(`kw${e.id} ✗ ${problems.join(', ')}`);
      }
      if (legacy !== r.verdict) drift.push(`${fx.id}/kw${e.id}: ${legacy} → ${r.verdict}`);
    }
    console.log(`  ${fail === 0 ? '[PASS]' : '[····]'} ${fx.id} — ${fx.note}`);
    for (const c of cells) console.log(`           ${c}`);
  }

  // 불변식 — structureHits ≥ 1 ⟹ phraseHits ≥ 1 (blocking 경계 동치의 근거).
  // 전 픽스처 × 7 kw 에서 반례가 나오면 위 증명이 깨진 것이므로 즉시 FAIL.
  console.log('\n  불변식 — structureHits ≥ 1 ⟹ phraseHits ≥ 1 (blocking 경계 동치):');
  let counterexamples = 0;
  for (const fx of fixtures) {
    for (const kw of CHECKLIST_KEYWORDS) {
      const r = checkKeyword(fx.body, kw);
      if (r.structureHits >= 1 && r.phraseHits === 0) {
        counterexamples++;
        console.error(`    [FAIL] 반례 ${fx.id}/kw${kw.id}`);
      }
    }
  }
  if (counterexamples === 0) {
    pass++;
    console.log(`    [PASS] 반례 0건 (${fixtures.length} 픽스처 × 7 kw)`);
  } else {
    fail += counterexamples;
  }

  console.log('\n  인자 파싱 프로브 (자식 프로세스):');
  for (const p of runArgParseProbes()) {
    if (p.ok) {
      pass++;
      console.log(`    [PASS] ${p.detail}`);
    } else {
      fail++;
      console.error(`    [FAIL] ${p.detail}`);
    }
  }

  console.log('\n  2계급 → 3계급 판정 변동 (갈리는 셀):');
  if (drift.length === 0) console.log('    (없음)');
  for (const d of drift) console.log(`    ${d}`);

  console.log(`\n--self-test: ${fail === 0 ? 'PASS' : `FAIL (${fail}건)`} — ${pass} 단언 통과`);
  return fail === 0 ? 0 : 1;
}

// =============================================================================
// --check-corpus <json> — 머지 PR 본문 전수 실측 (1회성 증거, CI 미배선)
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
    rows = JSON.parse(readFileSync(jsonPath, 'utf-8'));
  } catch (e) {
    console.error(`[ERROR] JSON 파싱 실패: ${e.message}`);
    return 2;
  }
  if (!Array.isArray(rows)) {
    console.error('[ERROR] 코퍼스는 `gh pr list --json number,body,author,...` 배열이어야 합니다.');
    return 2;
  }

  const tally = { PASS: 0, WARN: 0, FAIL: 0 };
  const warnPrs = [];
  const failPrs = [];
  const botPrs = [];
  const warnByKw = new Map();

  for (const row of rows) {
    // CI 는 `if: github.actor != 'github-actions[bot]'` 로 봇 PR job 을 스킵한다.
    // 스킵 사실을 별도 표기하되, 셀 집계에서 빼지는 않는다 (§3 표와 바이트 일치 유지).
    const isBot = row.author?.is_bot === true || /\[bot\]|^app\//.test(row.author?.login ?? '');
    if (isBot) botPrs.push(row.number);

    const { results, failed, warned } = analyzeBody(row.body ?? '');
    for (const r of results) tally[r.verdict]++;
    for (const w of warned) {
      warnByKw.set(w.keyword.id, (warnByKw.get(w.keyword.id) ?? 0) + 1);
    }
    if (warned.length > 0)
      warnPrs.push(`#${row.number} (${warned.map((w) => `kw${w.keyword.id}`).join(' ')})`);
    if (failed.length > 0)
      failPrs.push(`#${row.number}${isBot ? ' [bot — CI job 스킵]' : ''} × ${failed.length}`);
  }

  const cells = rows.length * CHECKLIST_KEYWORDS.length;
  console.log(`--check-corpus: ${jsonPath}`);
  console.log(
    `  PR ${rows.length} × kw ${CHECKLIST_KEYWORDS.length} = ${cells} 셀 (술어: 코퍼스 JSON 의 PR 본문 현재 스냅샷, 구조는 structureClass 계급별, 코드 펜스 안 구조 hit 제외)\n`,
  );
  console.log(`  PASS ${tally.PASS}  WARN ${tally.WARN}  FAIL ${tally.FAIL}`);
  if (tally.PASS + tally.WARN + tally.FAIL !== cells) {
    console.error('[ERROR] 셀 합계 불일치 — 집계 결함');
    return 2;
  }

  console.log(`\n  WARN 분해 (kw 별):`);
  for (const kw of CHECKLIST_KEYWORDS) {
    const n = warnByKw.get(kw.id) ?? 0;
    if (n > 0) console.log(`    kw${kw.id} ${kw.name.padEnd(34)} ${n}`);
  }
  console.log(`\n  WARN PR ${warnPrs.length}건: ${warnPrs.join(', ') || '(없음)'}`);
  console.log(`  FAIL PR ${failPrs.length}건: ${failPrs.join(', ') || '(없음)'}`);
  console.log(
    `  봇 PR ${botPrs.length}건 (CI 에서 job 스킵): ${botPrs.map((n) => `#${n}`).join(', ') || '(없음)'}`,
  );
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
  'usage: verify-pr-template-checklist.mjs [<PR번호> | --self-test | --check-corpus <json>]';

/**
 * 모드별 기대 인자 개수 (모드 플래그 자신 포함). 초과분은 즉시 exit 2 로 거부한다.
 * 프로토타입 오염 경로 차단을 위해 조회는 `Object.hasOwn` 으로 한다.
 */
const MODE_ARITY = { '--self-test': 1, '--check-corpus': 2 };

/**
 * CLI — **모드는 `args[0]` 로만 판정하고, 잉여 인자를 거부한다.**
 *
 * `verify-branch-name.mjs` B1 결함(2026-08-06) 답습 회피: 배열 전체를 `includes` 로 훑어
 * 모드를 정하면 모드 플래그가 값 위치로 왔을 때 검사가 통째로 스킵되고 exit 0 이 난다.
 * 본 가드는 위치 인자 `<PR번호>` 를 받으므로 `--self-test` 가 PR 번호로 오인되지 않아야 한다 —
 * 현행 `/^\d+$/` 정규식이 *우연히* 막지만 우연에 의존하지 않는다.
 */
function main(argv) {
  const args = argv.slice(2);
  const mode = args[0];

  if (mode === undefined) {
    console.error(USAGE);
    return 2;
  }

  if (mode.startsWith('--')) {
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
          `        합치면 한쪽 검사가 조용히 무시되므로, 호출을 나누세요.`,
      );
      console.error(USAGE);
      return 2;
    }
    switch (mode) {
      case '--self-test':
        return runSelfTest();
      case '--check-corpus':
        return runCheckCorpus(args[1]);
      default:
        // MODE_ARITY 를 통과했는데 여기 도달 = 모드 테이블과 분기의 drift. 조용히 통과 금지.
        console.error(`[ERROR] 내부 오류: 모드 '${mode}' 분기 부재 (MODE_ARITY drift).`);
        return 2;
    }
  }

  // 위치 인자 = PR 번호
  if (args.length > 1) {
    console.error(`[ERROR] 잉여 인자: ${args.slice(1).join(' ')}`);
    console.error(USAGE);
    return 2;
  }
  if (!/^\d+$/.test(mode)) {
    console.error(`[ERROR] PR 번호는 숫자여야 합니다: ${JSON.stringify(mode)}`);
    console.error(USAGE);
    return 2;
  }
  return runPrCheck(mode);
}

process.exit(main(process.argv));
