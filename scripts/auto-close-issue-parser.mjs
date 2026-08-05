#!/usr/bin/env node
/**
 * #915 — auto-close 대상 이슈 파서 (auto-close-issues.yml 의 파싱 SSoT).
 *
 * 배경 (docs/ops/operational-friction.md §1): GitHub 의 `Closes #N` auto-close 는
 * **default branch (main) 머지에서만** 발동한다. 본 저장소 일상 개발 PR 은 base=develop 이라
 * 구조적 미발동 → 매 머지마다 수동 close 마찰. `.github/workflows/auto-close-issues.yml`
 * 이 머지 이벤트에서 본 파서로 대상 이슈를 추출해 close 한다.
 *
 * 파싱 계약 (GitHub 공식 close 키워드 미러링 — 초과 매칭 금지):
 *   - 키워드: close / closes / closed / fix / fixes / fixed / resolve / resolves / resolved
 *   - 대소문자 무시, 복수 발생 지원, 중복 번호 dedup (등장 순서 보존)
 *   - 키워드 직후 `#N` 만 매칭 — `Closes #1, #2` 의 `#2` 는 GitHub 과 동일하게 비매칭
 *   - `Part of #N` / `Builds on #N` 등 비-close 참조는 비매칭
 *   - cross-repo (`owner/repo#N`) 는 범위 외 (본 저장소 이슈만)
 *
 * 사용법:
 *   node scripts/auto-close-issue-parser.mjs --body-file <path>   # 이슈 번호를 줄당 1개 출력
 *   node scripts/auto-close-issue-parser.mjs --self-test          # 결정적 자기 검증
 */

import fs from 'node:fs';
import assert from 'node:assert/strict';
import { pathToFileURL } from 'node:url';

// GitHub 공식 키워드 9종. 구분자는 공백 또는 `:` (GitHub 은 `Closes: #1` 도 인정).
const CLOSE_KEYWORD_RE = /\b(?:close[sd]?|fix(?:e[sd])?|resolve[sd]?)(?:\s*:\s*|\s+)#(\d+)/gi;

/** PR 본문 → close 대상 이슈 번호 배열 (등장 순서, dedup). */
export function parseCloseTargets(body) {
  if (!body) return [];
  const seen = new Set();
  const result = [];
  for (const match of body.matchAll(CLOSE_KEYWORD_RE)) {
    const n = Number(match[1]);
    if (!seen.has(n)) {
      seen.add(n);
      result.push(n);
    }
  }
  return result;
}

/** 결정적 자기 검증 — auto-close workflow 가 사용 직전 실행 + ci.yml 상시 배선 (#897 교훈). */
function selfTest() {
  const cases = [
    ['기본형', 'Closes #123', [123]],
    ['소문자/복수 키워드', 'closes #1\nFixes #2\nRESOLVED #3', [1, 2, 3]],
    [
      '전 키워드 9종',
      'close #1 closed #2 fix #3 fixes #4 fixed #5 resolve #6 resolves #7 resolved #8 closes #9',
      [1, 2, 3, 4, 5, 6, 7, 8, 9],
    ],
    ['콜론 구분', 'Closes: #7', [7]],
    ['비-close 참조 비매칭', 'Part of #915 (PR-2 완료 시 close)\nBuilds on: #100', []],
    ['혼합 — close 키워드만', 'Part of #915\n\nCloses #14', [14]],
    ['키워드 없는 나열 비매칭 (GitHub 미러)', 'Closes #1, #2', [1]],
    ['중복 dedup + 순서 보존', 'Closes #5, closes #3, fixes #5', [5, 3]],
    ['빈 본문', '', []],
    ['null 본문', null, []],
    ['키워드-번호 개행 분리 허용 (공백 클래스)', 'Closes\n#42', [42]],
    ['단어 경계 — disclose 비매칭', 'disclose #99', []],
  ];
  for (const [desc, body, expected] of cases) {
    const actual = parseCloseTargets(body);
    assert.deepEqual(actual, expected, `${desc}: 기대 [${expected}], 실제 [${actual}]`);
  }
  console.log(`[auto-close-parser] self-test PASS — ${cases.length} cases`);
}

function main() {
  const args = process.argv.slice(2);
  if (args.includes('--self-test')) {
    selfTest();
    return;
  }
  const fromIdx = args.indexOf('--body-file');
  if (fromIdx === -1 || !args[fromIdx + 1]) {
    console.error('사용법: auto-close-issue-parser.mjs --body-file <path> | --self-test');
    process.exit(2);
  }
  const body = fs.readFileSync(args[fromIdx + 1], 'utf8');
  for (const n of parseCloseTargets(body)) {
    console.log(n);
  }
}

// 직접 실행 시에만 main (테스트에서 import 가능하도록).
// `file://${argv[1]}` 문자열 비교는 symlink 경로에서 조용히 불일치 → silent no-op (#840 클래스).
if (process.argv[1] && import.meta.url === pathToFileURL(fs.realpathSync(process.argv[1])).href) {
  main();
}
