#!/usr/bin/env node
/**
 * verify-pr-template-checklist.mjs
 *
 * PR 본문이 `.github/PULL_REQUEST_TEMPLATE.md` 의 `### 체크리스트` 7 키워드 base 를
 * 보존하는지 검증한다 (측정 방법 C — 1차 구조 grep + 2차 phrase grep AND).
 *
 * #471 (create-pr 스킬 사전 차단) 의 CI 측 backstop. 사용자가 수동
 * `gh pr create --body "..."` 로 prefill 우회 시 본 가드가 차단.
 *
 * 호출:
 *   node scripts/verify-pr-template-checklist.mjs <PR번호>
 *     → 통과: exit 0
 *     → 실패: exit 1, 누락 키워드 stderr + (CI 환경에서) PR 코멘트로 actionable 보고
 *
 * 환경 변수:
 *   GH_TOKEN — gh CLI 인증 토큰 (CI 자동 주입)
 *   POST_COMMENT — "true" 시 실패 PR 에 자동 코멘트 (CI 에서 활성)
 *
 * 관련 이슈: #473 (D4 CI backstop, #470 분리) / #471 (스킬 측 사전 차단)
 */

import { execSync, spawnSync } from 'node:child_process';

// 7 키워드 base — `.github/PULL_REQUEST_TEMPLATE.md` 의 `### 체크리스트` 6 항목 + 상위 Test plan 1 항목
// 측정 방법 C: 각 항목 1차 구조 (`- [x]` / `- [ ]`) + 2차 phrase (키워드) AND 매칭
// 1차 구조와 2차 phrase 중 하나만이라도 hit 하면 PASS (둘 다 0 → FAIL)
const CHECKLIST_KEYWORDS = [
  { id: '1', name: '커밋 컨벤션', phrase: '커밋 컨벤션' },
  { id: '2', name: '불필요한 변경', phrase: '불필요' },
  { id: '3', name: '보안', phrase: '보안' },
  { id: '4', name: 'SSoT (sub-agent JSON 스키마)', phrase: 'SSoT' },
  { id: '5', name: 'cross-validate (정책·규약·ADR 박제 시)', phrase: 'cross-validate' },
  { id: '6', name: 'ADR 호환성', phrase: 'ADR 호환성' },
  { id: '7', name: 'Test plan (단위 테스트)', phrase: 'Test plan' },
];

// 1차 구조 — 체크박스 prefix
const CHECKBOX_PATTERN = /^\s*-\s*\[[ xX]\]/m;

function fetchPRBody(prNumber) {
  const cmd = `gh pr view ${prNumber} --json body --jq .body`;
  return execSync(cmd, { encoding: 'utf-8' });
}

function checkKeyword(body, keyword) {
  // 2차 phrase: 단순 문자열 포함 (case-insensitive 일부 — 한국어는 case 무관)
  const phraseLower = keyword.phrase.toLowerCase();
  const bodyLower = body.toLowerCase();
  const phraseHits = bodyLower.split(phraseLower).length - 1;

  // 1차 구조: 같은 라인에 체크박스 + phrase 동시 등장
  const lines = body.split('\n');
  let structureHits = 0;
  for (const line of lines) {
    if (CHECKBOX_PATTERN.test(line) && line.toLowerCase().includes(phraseLower)) {
      structureHits++;
    }
  }

  return {
    keyword,
    phraseHits,
    structureHits,
    pass: phraseHits >= 1 || structureHits >= 1,
  };
}

function postComment(prNumber, missing) {
  const body = [
    '## PR 템플릿 체크리스트 가드 (#473)',
    '',
    `**누락 항목 ${missing.length}/7** — PR 본문에 \`.github/PULL_REQUEST_TEMPLATE.md\` 의 \`### 체크리스트\` 7 키워드 base 가 보존되어야 합니다.`,
    '',
    '### 누락 키워드',
    '',
    ...missing.map(
      (m) =>
        `- **[${m.keyword.id}] ${m.keyword.name}** — phrase "\`${m.keyword.phrase}\`" 매칭 0 hit (1차 구조 ${m.structureHits} / 2차 phrase ${m.phraseHits})`,
    ),
    '',
    '### 해결',
    '',
    '1. **권장**: `create-pr` 스킬 사용 (#471) — PR 본문 7 체크박스 base 를 PR 템플릿에서 동적 읽기',
    '2. **수동**: PR 본문에 누락 항목 체크박스 추가 (`- [ ] <키워드>` 형식) — N/A 항목도 `[x] N/A — <사유>` 로 유지 (#469)',
    '',
    `근거: [#473](https://github.com/coseo12/astro-simulator/issues/473) (D4 CI backstop, #470 분리) / [#471](https://github.com/coseo12/astro-simulator/issues/471) (스킬 사전 차단)`,
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

function main() {
  const prNumber = process.argv[2];
  if (!prNumber || !/^\d+$/.test(prNumber)) {
    console.error('사용법: node scripts/verify-pr-template-checklist.mjs <PR번호>');
    process.exit(2);
  }

  let body;
  try {
    body = fetchPRBody(prNumber);
  } catch (err) {
    console.error(`PR #${prNumber} 본문 조회 실패: ${err.message}`);
    process.exit(2);
  }

  const results = CHECKLIST_KEYWORDS.map((kw) => checkKeyword(body, kw));
  const missing = results.filter((r) => !r.pass);

  if (missing.length === 0) {
    console.log(`✅ PR #${prNumber} 7 체크박스 base 모두 보존 (1차 + 2차 OR 매칭)`);
    process.exit(0);
  }

  console.error(`❌ PR #${prNumber} 7 체크박스 base 누락 ${missing.length}/7:`);
  for (const m of missing) {
    console.error(
      `  - [${m.keyword.id}] ${m.keyword.name}: phrase "${m.keyword.phrase}" → 1차 구조 ${m.structureHits} / 2차 phrase ${m.phraseHits}`,
    );
  }

  if (process.env.POST_COMMENT === 'true') {
    postComment(prNumber, missing);
  }

  process.exit(1);
}

main();
