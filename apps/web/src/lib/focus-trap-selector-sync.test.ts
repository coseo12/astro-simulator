import { describe, expect, it } from 'vitest';
import { existsSync, readFileSync } from 'node:fs';
import { dirname, join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import { FOCUSABLE_SELECTOR } from './focus-trap';

/**
 * #943 — 포커서블 셀렉터 3사본 정적 가드.
 *
 * `FOCUSABLE_SELECTOR` 는 SSoT(`focus-trap.ts`)이지만, 브라우저 컨텍스트에 주입되는 두 `.mjs`
 * 가드 스크립트는 TS 모듈을 import 할 수 없어 **문자열 사본**이 불가피하다. #889(PR #941)이
 * 양방향 역참조 주석으로 결속했으나 주석 계약은 사람이 지키는 한 유지된다 — volt #120
 * ("drift 감지보다 중복 출처 제거가 근본")상 최소한 **실행 가능한 단언**으로 승격한다.
 *
 * ## 비교 방식 근거 (현행 3파일 실물 대조 후 결정)
 *
 * - **SSoT 는 파일 파싱이 아니라 import** — `FOCUSABLE_SELECTOR` 는 선언 시점에 `.join(', ')`
 *   된 **런타임 문자열**이라 그대로 import 하면 사본과 같은 형태다. "배열 원소 단위" 비교는
 *   사본이 join 된 단일 리터럴이라 애초에 성립하지 않는다.
 * - **substring 이 아니라 "문자열 리터럴 전체와 equality"** — `source.includes(SSoT)` 는 사본이
 *   절을 **추가**한 drift(`'…(SSoT 전체), [contenteditable]'`)를 그대로 통과시킨다. 리터럴 단위
 *   equality 는 절 추가·삭제·순서 변경을 전부 잡는다.
 * - **주석 줄 제외** — 두 사본에는 #889 역참조 주석이 이미 있다. 미래에 그 주석이 셀렉터 원문을
 *   인용하면 실행 코드가 drift 해도 주석에 **자기-매칭**되어 가드가 공허해진다.
 *
 * fail-fast(#945 정책 동형): 파일 부재 / 리터럴 추출 0건은 조용히 스킵하지 않고 FAIL 한다.
 */

const currentDir = dirname(fileURLToPath(import.meta.url));
// `apps/web/src/lib` 에서 4단계 상위가 저장소 루트 (packages/core 의 REPO_ROOT 선례와 동형).
const REPO_ROOT = resolve(currentDir, '../../../..');

/** SSoT 셀렉터를 문자열 사본으로 들고 있는 독립 실행 가드 스크립트들. */
const COPIES = [
  {
    label: '사본 1 — scripts/browser-verify-a11y.mjs (focusable 개수 집계)',
    path: join(REPO_ROOT, 'scripts/browser-verify-a11y.mjs'),
  },
  {
    label: '사본 2 — apps/web/scripts/browser-verify-848-modal-focus.mjs (S3 모달 경계)',
    path: join(REPO_ROOT, 'apps/web/scripts/browser-verify-848-modal-focus.mjs'),
  },
];

/**
 * 소스에서 **실행 코드에 있는** 작은따옴표 문자열 리터럴만 추출한다.
 * 주석 줄(`//` 시작 / 블록 주석 시작 / JSDoc 연속 `*`)은 제외한다.
 */
function extractCodeStringLiterals(source: string): string[] {
  return source
    .split('\n')
    .filter((line) => {
      const trimmed = line.trimStart();
      return !trimmed.startsWith('//') && !trimmed.startsWith('*') && !trimmed.startsWith('/*');
    })
    .flatMap((line) => [...line.matchAll(/'([^'\n]*)'/g)].map((m) => m[1]))
    .filter((literal): literal is string => literal !== undefined);
}

describe('#943 — FOCUSABLE_SELECTOR 3사본 정적 가드', () => {
  it('SSoT 셀렉터가 공허하지 않다 (가드 성립 전제)', () => {
    // 빈 문자열이면 아래 equality 단언이 무의미해진다 — 가드의 비공허성을 먼저 고정한다.
    // 절 개수를 수치로 못박지는 않는다 (그 자체가 4번째 사본이 된다).
    expect(FOCUSABLE_SELECTOR.trim().length).toBeGreaterThan(0);
    const clauses = FOCUSABLE_SELECTOR.split(', ');
    expect(clauses.length).toBeGreaterThan(1);
    expect(clauses.every((clause) => clause.trim().length > 0)).toBe(true);
  });

  it.each(COPIES)('$label — 파일이 존재한다', ({ path }) => {
    expect(existsSync(path), `사본 경로가 존재하지 않는다: ${path}`).toBe(true);
  });

  it.each(COPIES)('$label — 실행 코드에서 문자열 리터럴을 추출할 수 있다', ({ path }) => {
    // 추출 0건 = 파일 구조가 예상과 다름(파싱 실패). 조용한 스킵 대신 FAIL 시킨다.
    const literals = extractCodeStringLiterals(readFileSync(path, 'utf-8'));
    expect(
      literals.length,
      `문자열 리터럴 추출 실패 (파일 구조 변경 의심): ${path}`,
    ).toBeGreaterThan(0);
  });

  it.each(COPIES)('$label — SSoT 셀렉터와 완전 일치 (drift 0)', ({ path }) => {
    const literals = extractCodeStringLiterals(readFileSync(path, 'utf-8'));
    expect(
      literals,
      `실행 코드에 SSoT 셀렉터와 동일한 리터럴이 없다 — focus-trap.ts 의 FOCUSABLE_SELECTOR 와 동기화 필요: ${path}`,
    ).toContain(FOCUSABLE_SELECTOR);
  });
});
