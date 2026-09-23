#!/usr/bin/env node
/**
 * verify-waitforfunction-args.mjs
 *
 * #1256 — `waitForFunction` 옵션 인자 오배치 가드.
 *
 * ── 왜 필요한가 ─────────────────────────────────────────────────────────────
 * playwright 의 시그니처는 `page.waitForFunction(pageFunction, arg, options)` 다. 옵션 객체를
 * **두 번째** 인자로 넘기면 그것은 `arg` 로서 페이지 컨텍스트에 직렬화되어 들어가고, 선언한
 * `timeout` 은 **한 번도 적용되지 않는다**. 실제 상한은 playwright 기본값 `30_000 ms` 가 된다.
 *
 * 이 오배치는 **예외도 경고도 내지 않는다** — 타입 검사도 없고(`.mjs`), 대기가 성공하는 한
 * 관측 가능한 차이가 0 이다. 그래서 저장소에 **34곳**이 쌓일 때까지 조용했다 (#1256 §0 재계수).
 * 드러난 것은 #1239 에서 실패 변이의 대기 시간이 선언 `15_000` 이 아니라 `30004 ms` 로 찍힌
 * 단 한 번의 관측이었다. 즉 **사람이 우연히 본** 것이고, 같은 우연을 두 번 기대할 수 없다.
 *
 * 피해는 "대기가 길어진다" 가 아니라 **선언이 거짓 진단을 만든다** 는 쪽이다. 실측 2건:
 *   - `scripts/verify-fps-baseline.mjs` — 상수 `LOD_SETTLE_TIMEOUT_MS = 8_000` 이 이름·주석으로
 *     "LOD 정착 대기 상한" 을 선언하는데 실제 상한은 `30_000` 이었다.
 *   - `apps/web/scripts/r1-ui-regression-guard.mjs` — diag 문자열이 매 viewport 마다 `10s` 를
 *     출력했고 실제 상한은 `30_000` 이었다. 로그를 읽는 사람이 3배 틀린 값을 본다.
 *
 * 교정(#1256)은 1회성이다. 본 가드는 **재유입**을 막는다 — 신규 browser-verify 스크립트는
 * 기존 파일을 복사해서 시작하므로, 가드가 없으면 오배치가 그대로 번식한다.
 *
 * ── 검사 계약 (술어) ────────────────────────────────────────────────────────
 * 소스에서 **메서드 호출** `<expr>.waitForFunction( … )` 를 찾아 인자를 top-level 로 분해하고,
 * **두 번째 인자**가 아래 둘을 모두 만족하면 위반으로 보고한다:
 *
 *   (1) 객체 리터럴이다 — 주석 제거 후 `{` 로 시작하고 `}` 로 끝난다.
 *   (2) 그 객체의 **top-level 키**에 옵션 키가 있다. 키 표기는 축약형(`{ timeout }`),
 *       `timeout:`, `'timeout':` / `"timeout":`, `['timeout']:` 를 인정한다.
 *
 * 옵션 키 집합은 `OPTION_KEYS` = { `timeout`, `polling`, `signal` } 이다.
 *   ⚠️ 이슈 #1256 스프린트 계약 §3 항목 4 가 명명한 키는 `timeout` **하나**이고, 나머지 둘은
 *   **의도적 확장**이다. 근거 — 셋은 옵션이 `arg` 로 조용히 흘러가는 **정확히 같은 기전**을
 *   공유하므로, 하나만 재면 가드의 술어가 그 가드가 이름으로 내건 결함 클래스보다 좁아진다
 *   (저장소가 반복해 밟은 «가드 술어 < 계약» 클래스). 확장은 **판정을 바꾸지 않는다** —
 *   도입 시점 저장소 전수 스캔에서 `polling`·`signal` 을 두 번째 인자로 넘긴 호출은 각각
 *   0건이라 세 술어의 위반 집합이 동일하다 (2026-09-23 실측 — 계약 §3 완료 기준 1·2 의
 *   수치는 불변).
 *
 *   ⚠️ **이 열거는 드리프트 표면이다.** 셋은 `playwright-core@1.62.1` 의
 *   `PageWaitForFunctionOptions` 를 2026-09-23 에 읽어 옮긴 것이고 (`Page`·`Frame` 의
 *   `waitForFunction` 이 같은 인터페이스를 쓴다), **그 시점 그 판본의 전부**다. playwright
 *   업그레이드가 키를 추가하면 이 문장과 `OPTION_KEYS` 는 그 순간 다시 좁아진다 —
 *   **그것을 감지하는 자동 장치는 없다.** 런타임 도출을 하지 않는 이유는 CI 의
 *   `project-guards` job 이 `actions/checkout@v4` 뿐이라 `node_modules` 가 없기 때문이다.
 *   거기서 타입을 읽으면 CI 에서 죽거나, 더 나쁘게는 「못 읽으면 통과」라는 fallback 분기를
 *   만들게 된다 (CLAUDE.md §가드 설계 원칙 — fallback 분기 금지). 그래서 **재도출 절차를
 *   수동 인계**로 남긴다 — playwright 메이저·마이너 업그레이드 PR 에서 아래 1줄을 돌려
 *   결과가 `OPTION_KEYS` 와 같은지 확인할 것:
 *     awk '/interface PageWaitForFunctionOptions/,/^}/' \
 *       node_modules/.pnpm/playwright-core@*\/node_modules/playwright-core/types/types.d.ts \
 *       | grep -oE '^  [a-zA-Z]+\?:' | tr -d ' ?:'
 *   (초판은 「`polling` 이 나머지 전부다」라고 **단정**했고 `signal` 이 빠져 있었다. PR
 *   [#1257](https://github.com/coseo12/astro-simulator/pull/1257) reviewer 가 격리 픽스처로
 *   미검출을 실증해 적발했다. 완전성을 단정하지 않고 **출처·시점·드리프트 표면**을 적는
 *   것이 그 재발을 막는 형태다.)
 *
 * ── 범위 경계 (의도적 미검출) ───────────────────────────────────────────────
 *   (i) **두 번째 인자가 객체 리터럴이 아닌 형태로 옵션을 넘기는 경우** — 변수 경유
 *       (`const OPTS = { timeout: 1 }; page.waitForFunction(fn, OPTS);`) 와 spread
 *       (`page.waitForFunction(fn, { ...opts });`) 가 여기 속한다. 둘 다 검출하지 않는다.
 *       구문만으로는 `OPTS` / `...opts` 가 옵션인지 진짜 `arg` 인지 판정할 수 없고, 식별자
 *       이름 휴리스틱(`/opt/i` 등)으로는 그 판정을 정확히 할 수 없다. 자료형 추론은 파서·타입
 *       정보를 요구하는데 검사 대상이 `.mjs` 라 타입이 없다. self-test 픽스처 **F16** 이 이
 *       경계를 고정해 미래 관찰자가 «누락» 으로 오인하지 않게 한다. 저장소 발생 `0`.
 *   (ii) **옵션 키가 없는 객체 `arg`** — `page.waitForFunction(fn, {})` 나
 *       `page.waitForFunction((a) => a.id, { id: 'earth' }, { timeout: 1 })` 처럼 두 번째
 *       인자가 옵션 키를 하나도 갖지 않는 경우. 이것은 **유효한 호출**이고 술어 (2) 가
 *       배제한다. 픽스처 **F6** 이 고정한다. (spread 는 여기가 아니라 (i) 다 — 형태만
 *       객체이지 키를 읽을 수 없어 «옵션이 아님» 을 확인한 것이 아니다.)
 *   (iii) **인자 자리를 넘어선 정합성** — 세 번째 인자가 옵션으로서 well-formed 한지
 *       (예: `timeout` 이 음수인지) 는 보지 않는다. 그것은 값 정책이지 인자 위치가 아니다.
 *   (iv) **메서드 호출 구문이 아닌 호출** — 구조분해
 *       (`const { waitForFunction } = page; waitForFunction(fn, { timeout: 1 });`) 와 계산된
 *       멤버 접근 (`page['waitForFunction'](fn, { timeout: 1 });`) 은 검출하지 않는다.
 *       §검사 계약이 대상을 `<expr>.waitForFunction(` 로 한정하는 데서 따라 나오지만, (i)~(iii)
 *       처럼 **명시**해 둔다. 전자는 앵커가 `.` 이 아니고, 후자는 토큰이 문자열 리터럴이라
 *       어휘 스캐너가 `KIND_LITERAL` 로 분류한다 — 즉 F4(문자열 안 리터럴 오탐 배제)와 같은
 *       기전의 대가다. 픽스처 **F21** 이 고정한다. 저장소 발생 `0` (전 hit 이 문자열·주석·
 *       `browser-verify-utils.test.mjs` 의 mock **정의부**이고 정의부는 F13 이 고정한다).
 *
 *   ⚠️ **precision 은 1.0 이 아니다.** `page.waitForFunction(fn, { timeout: 5 }, { timeout: 1 })`
 *   처럼 **3-인자이면서 두 번째가 진짜 `arg`** 인데 그 `arg` 가 옵션 키를 갖는 경우를 위반으로
 *   보고한다 (계약 술어와는 정합 — 술어가 인자 개수를 보지 않는다). 저장소 발생 `0` 이고,
 *   오탐 방향이 **fail-loud**(초록을 만드는 쪽이 아니라 빨강을 만드는 쪽)라 결함이 숨지
 *   않는다. 위 (i) 을 배제한 근거는 「precision 1.0 을 줄 수 없다」가 아니라 **판정 자체가
 *   불가능하다**는 것이다 — 그쪽은 오탐·미탐 중 어느 쪽인지도 말할 수 없다.
 *
 * ── 검사 범위 계약 (SSoT — 본 헤더) ─────────────────────────────────────────
 * 스캔 루트는 저장소 루트(`WAITFORFUNCTION_SCAN_ROOT` 로 override — self-test 전용)이고,
 * 확장자 `SCAN_EXTENSIONS` = { `.mjs`, `.js`, `.cjs`, `.ts`, `.tsx` } 파일을 재귀 수집한다.
 *
 * 제외 디렉토리(`SKIP_DIR_NAMES`) — 이름이 일치하면 하위 전체를 건너뛴다:
 *   `node_modules` `.git` `.next` `dist` `build` `coverage` `target` `pkg` `pkg-bundler` `pkg-node`
 *   → 전부 **생성물 또는 외부 코드**다. 커밋 대상이 아니므로 교정 주체가 없다.
 *   (wasm-pack 출력 3 종의 배제 근거는 상수 옆 주석 참조 — `pkg-node` 는 루트 `.gitignore` 에
 *    안 보여 초판에서 빠졌고, 그 결과 로컬 스캔이 CI 보다 많았다.)
 * 제외 경로(`SKIP_REL_PATHS`) — 루트 기준 상대 경로가 일치하면 건너뛴다:
 *   `.claude/worktrees`
 *   → Conductor 멀티 워크스페이스가 만드는 **형제 체크아웃**이고 `.git/info/exclude` 로
 *     git 추적 밖이다. 스캔하면 가드의 판정이 개발자 로컬의 스크래치 상태(어느 브랜치를
 *     언제 체크아웃해 뒀는가)에 의존해 «로컬 FAIL / CI PASS» 가 된다 — 이는 작은 사각보다
 *     나쁘다. 그 트리의 파일은 자기 브랜치의 CI 에서 검사된다.
 * 그 외 `.` 로 시작하는 디렉토리는 건너뛰되 `.claude` · `.github` 는 스캔한다 (에이전트·CI
 * 자산에도 스크립트가 들어올 수 있다).
 *
 * ── fail-fast 계약 (CLAUDE.md §가드 설계 원칙) ───────────────────────────────
 * 스캔 루트 부재 / 잉여 인자 / 괄호가 닫히지 않은 호출은 **exit 2** 다. "판정 불가" 를 통과로
 * 흘리는 fallback 분기를 두지 않는다.
 *
 * 종료 코드:
 *   0 — 위반 0
 *   1 — 위반 발견 (파일:줄 + 두 번째 인자 원문 출력)
 *   2 — 실행 에러 (스캔 루트 부재 / 잉여 인자 / 파싱 실패)
 *
 * 호출:
 *   node scripts/verify-waitforfunction-args.mjs               # 검사 (CI 기본)
 *   node scripts/verify-waitforfunction-args.mjs --self-test   # 격리 픽스처 F1~F21
 *   WAITFORFUNCTION_SCAN_ROOT=<dir> node scripts/verify-waitforfunction-args.mjs
 *
 * 관련: 이슈 #1256 / PR #1255 (#1239 — 오배치가 처음 관측된 자리, 교정 선례
 *       `apps/web/scripts/browser-verify-glow-marker.mjs`) /
 *       CLAUDE.md §가드 설계 원칙 · §가드 도입 PR DoD 4축 / docs/lessons/guard-pr-dod.md
 */

import {
  existsSync,
  mkdtempSync,
  mkdirSync,
  readFileSync,
  readdirSync,
  rmSync,
  statSync,
  writeFileSync,
} from 'node:fs';
import { spawnSync } from 'node:child_process';
import { tmpdir } from 'node:os';
import path from 'node:path';
import process from 'node:process';
import { fileURLToPath } from 'node:url';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const SCRIPT_DIR = path.dirname(SCRIPT_PATH);
const DEFAULT_ROOT = path.resolve(SCRIPT_DIR, '..');

/** 검사 대상 확장자 (§검사 범위 계약) */
const SCAN_EXTENSIONS = new Set(['.mjs', '.js', '.cjs', '.ts', '.tsx']);
/** 이름이 일치하면 하위 전체 제외 (§검사 범위 계약) */
const SKIP_DIR_NAMES = new Set([
  'node_modules',
  '.git',
  '.next',
  'dist',
  'build',
  'coverage',
  'target',
  // wasm-pack 출력 3 종. `pkg` · `pkg-bundler` 는 `packages/physics-wasm/.gitignore` 가,
  // `pkg-node` 는 그 디렉토리가 스스로 들고 있는 `.gitignore`(`*`) 가 배제한다 — 후자는
  // 저장소 루트 `.gitignore` 에 안 보여 초판에서 빠졌고, 그 결과 로컬 스캔이 CI 보다
  // 4 파일 많았다 (2026-09-23 실측 `347` ↔ `343`. 차액은 이 3 파일 + 생성물 `next-env.d.ts`).
  // 판정에는 영향이 없었으나(그 안에 대상 호출 0건) §검사 범위 계약의 "전부 생성물" 서술과
  // 어긋나 있었다. 타깃이 더 생기면(`pkg-web` 등) 여기 같이 추가한다.
  'pkg',
  'pkg-bundler',
  'pkg-node',
]);
/** 루트 기준 상대 경로가 일치하면 제외 (§검사 범위 계약) */
const SKIP_REL_PATHS = new Set([path.join('.claude', 'worktrees')]);
/** `.` 로 시작해도 스캔하는 디렉토리 */
const DOT_DIR_ALLOWLIST = new Set(['.claude', '.github']);

/** 검출 대상 메서드명 */
const METHOD_NAME = 'waitForFunction';
/**
 * 옵션 키 집합 (§검사 계약).
 *
 * `playwright-core@1.62.1` 의 `PageWaitForFunctionOptions` 를 2026-09-23 에 읽어 옮긴 것이고,
 * `polling`·`signal` 은 이슈 계약(`timeout` 만 명명) 대비 **의도적 확장**이다.
 * ⚠️ 이 열거는 드리프트 표면이다 — playwright 업그레이드가 키를 추가해도 자동 감지가 없다.
 * 재도출 절차(수동 인계)와 런타임 도출을 안 하는 이유는 헤더 §검사 계약 참조.
 */
const OPTION_KEYS = ['timeout', 'polling', 'signal'];

/** 출력 마커 — self-test 가 stdout/stderr 대조에 사용하는 계약 문자열 */
const MARK_PASS = '[PASS]';
const MARK_FAIL = '[FAIL]';

// 문자 분류 — 코드 / 주석 / 리터럴
const KIND_CODE = 0;
const KIND_COMMENT = 1;
const KIND_LITERAL = 2;

const IDENT_RE = /[A-Za-z0-9_$]/;
/** 이 토큰 **뒤**의 `/` 는 나눗셈이 아니라 정규식 리터럴의 시작이다 */
const REGEX_PRECEDING_KEYWORDS = new Set([
  'return',
  'typeof',
  'case',
  'in',
  'of',
  'do',
  'else',
  'yield',
  'await',
  'new',
  'delete',
  'void',
  'instanceof',
  'throw',
]);
/** 이 문자 **뒤**의 `/` 는 정규식 리터럴의 시작이다 (식별자·`)`·`]`·숫자 뒤는 나눗셈) */
const REGEX_PRECEDING_CHARS = new Set([
  '(',
  ',',
  '=',
  ':',
  '[',
  '!',
  '&',
  '|',
  '?',
  '{',
  '}',
  ';',
  '+',
  '-',
  '*',
  '%',
  '^',
  '~',
  '<',
  '>',
]);

// ── 어휘 스캔 ────────────────────────────────────────────────────────────────

/**
 * 소스를 1회 훑어 문자별 분류 배열을 만든다.
 *
 * 이 단계가 본 가드의 오탐 축 2종(문자열 안 / 주석 안 `waitForFunction(` 리터럴)을 닫는다.
 * 저장소에 실제 회귀 표본이 있다 — `apps/web/scripts/r1-ui-regression-guard.mjs` 의 diag
 * 템플릿 문자열과 `scripts/browser-verify-utils.mjs` 의 JSDoc 주석이 둘 다 그 토큰을 담는다.
 *
 * 템플릿 리터럴은 `${ … }` 안이 다시 코드이므로 스택으로 처리한다. 정규식 리터럴은 직전
 * 유효 토큰으로 나눗셈과 구별한다 (표준 휴리스틱 — `REGEX_PRECEDING_*` 참조).
 */
function classifySource(src) {
  const n = src.length;
  const kind = new Uint8Array(n); // 기본값 KIND_CODE
  /** 모드 스택 — 바닥은 코드, 템플릿 진입 시 push */
  const stack = [{ template: false, brace: 0 }];
  let i = 0;
  /** 직전 유효 코드 문자 (공백 제외) */
  let lastChar = '';
  /** 직전 식별자 토큰 (키워드 판별용) */
  let lastWord = '';

  const fill = (from, to, value) => {
    for (let k = from; k < to && k < n; k += 1) kind[k] = value;
  };

  while (i < n) {
    const top = stack[stack.length - 1];

    if (top.template) {
      const c = src[i];
      if (c === '\\') {
        fill(i, i + 2, KIND_LITERAL);
        i += 2;
        continue;
      }
      if (c === '`') {
        kind[i] = KIND_LITERAL;
        i += 1;
        stack.pop();
        lastChar = '`';
        lastWord = '';
        continue;
      }
      if (c === '$' && src[i + 1] === '{') {
        fill(i, i + 2, KIND_LITERAL);
        i += 2;
        stack.push({ template: false, brace: 0 });
        lastChar = '';
        lastWord = '';
        continue;
      }
      kind[i] = KIND_LITERAL;
      i += 1;
      continue;
    }

    const c = src[i];
    const c2 = src[i + 1];

    // 라인 주석
    if (c === '/' && c2 === '/') {
      let j = i;
      while (j < n && src[j] !== '\n') j += 1;
      fill(i, j, KIND_COMMENT);
      i = j;
      continue;
    }
    // 블록 주석
    if (c === '/' && c2 === '*') {
      let j = i + 2;
      while (j < n && !(src[j] === '*' && src[j + 1] === '/')) j += 1;
      j = Math.min(j + 2, n);
      fill(i, j, KIND_COMMENT);
      i = j;
      continue;
    }
    // 단순 문자열
    if (c === "'" || c === '"') {
      let j = i + 1;
      while (j < n) {
        if (src[j] === '\\') {
          j += 2;
          continue;
        }
        if (src[j] === c) {
          j += 1;
          break;
        }
        if (src[j] === '\n') break; // 미종결 — 줄 끝에서 끊는다 (실제 JS 라면 문법 오류)
        j += 1;
      }
      fill(i, j, KIND_LITERAL);
      i = j;
      lastChar = 'x';
      lastWord = '';
      continue;
    }
    // 템플릿 리터럴 진입
    if (c === '`') {
      kind[i] = KIND_LITERAL;
      i += 1;
      stack.push({ template: true, brace: 0 });
      continue;
    }
    // 정규식 리터럴
    if (
      c === '/' &&
      (lastChar === '' ||
        REGEX_PRECEDING_CHARS.has(lastChar) ||
        REGEX_PRECEDING_KEYWORDS.has(lastWord))
    ) {
      let j = i + 1;
      let inClass = false;
      while (j < n) {
        const d = src[j];
        if (d === '\\') {
          j += 2;
          continue;
        }
        if (d === '\n') break; // 미종결
        if (inClass) {
          if (d === ']') inClass = false;
        } else if (d === '[') {
          inClass = true;
        } else if (d === '/') {
          j += 1;
          while (j < n && IDENT_RE.test(src[j])) j += 1; // 플래그
          break;
        }
        j += 1;
      }
      fill(i, j, KIND_LITERAL);
      i = j;
      lastChar = 'x';
      lastWord = '';
      continue;
    }
    // 식별자 — 통째로 소비해 키워드 추적
    if (/[A-Za-z_$]/.test(c)) {
      let j = i;
      while (j < n && IDENT_RE.test(src[j])) j += 1;
      lastWord = src.slice(i, j);
      lastChar = src[j - 1];
      i = j;
      continue;
    }
    // `${ … }` 를 닫는 중괄호는 템플릿 구문이지 코드가 아니다
    if (c === '}' && top.brace === 0 && stack.length > 1) {
      kind[i] = KIND_LITERAL;
      i += 1;
      stack.pop();
      lastChar = '`';
      lastWord = '';
      continue;
    }
    if (c === '{') top.brace += 1;
    else if (c === '}') top.brace -= 1;

    if (!/\s/.test(c)) {
      lastChar = c;
      lastWord = '';
    }
    i += 1;
  }

  return kind;
}

// ── 호출 분해 ────────────────────────────────────────────────────────────────

/** 주석만 제거한 원문 (문자열은 보존 — 따옴표 친 키를 읽어야 한다) */
function textWithoutComments(src, kind, from, to) {
  let out = '';
  for (let i = from; i < to; i += 1) {
    if (kind[i] !== KIND_COMMENT) out += src[i];
  }
  return out;
}

/**
 * `openIdx` 위치의 여는 괄호부터 짝이 맞는 닫는 괄호까지를 top-level 콤마로 분해.
 * 반환 `{ args: [[start, end], …], endIdx }` — 실패(미종결) 시 `null`.
 */
function splitTopLevelArgs(src, kind, openIdx) {
  const n = src.length;
  let depth = 0;
  let start = openIdx + 1;
  const args = [];
  for (let i = openIdx; i < n; i += 1) {
    if (kind[i] !== KIND_CODE) continue;
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') {
      depth += 1;
    } else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) {
        args.push([start, i]);
        return { args, endIdx: i };
      }
    } else if (c === ',' && depth === 1) {
      args.push([start, i]);
      start = i + 1;
    }
  }
  return null;
}

/** 직전 유효 코드 문자 (공백·주석·리터럴 건너뜀) */
function prevSignificantChar(src, kind, from) {
  for (let i = from; i >= 0; i -= 1) {
    if (kind[i] !== KIND_CODE) continue;
    if (/\s/.test(src[i])) continue;
    return src[i];
  }
  return '';
}

/** 객체 리터럴 텍스트의 top-level 키 중 옵션 키가 있는가 */
function hasOptionKey(src, kind, objStart, objEnd) {
  // objStart = `{` 의 인덱스, objEnd = 짝이 맞는 `}` 의 인덱스
  let depth = 0;
  let segStart = objStart + 1;
  const segments = [];
  for (let i = objStart; i <= objEnd; i += 1) {
    if (kind[i] !== KIND_CODE) continue;
    const c = src[i];
    if (c === '(' || c === '[' || c === '{') {
      depth += 1;
    } else if (c === ')' || c === ']' || c === '}') {
      depth -= 1;
      if (depth === 0) {
        segments.push([segStart, i]);
        break;
      }
    } else if (c === ',' && depth === 1) {
      segments.push([segStart, i]);
      segStart = i + 1;
    }
  }
  for (const [a, b] of segments) {
    const seg = textWithoutComments(src, kind, a, b).trim();
    if (seg === '') continue;
    for (const key of OPTION_KEYS) {
      // 축약형 `{ timeout }` / `timeout:` / `'timeout':` / `"timeout":` / `['timeout']:`
      const patterns = [
        new RegExp(`^${key}\\s*$`),
        new RegExp(`^${key}\\s*:`),
        new RegExp(`^(['"])${key}\\1\\s*:`),
        new RegExp(`^\\[\\s*(['"])${key}\\1\\s*\\]\\s*:`),
      ];
      if (patterns.some((re) => re.test(seg))) return key;
    }
  }
  return null;
}

/** 인덱스 → 1-based 줄 번호 */
function lineOf(src, index) {
  let line = 1;
  for (let i = 0; i < index; i += 1) if (src[i] === '\n') line += 1;
  return line;
}

/**
 * 한 파일의 위반 목록. 반환 `{ violations, error }`.
 * `error` 는 fail-fast 대상 (괄호 미종결 등) — 통과로 흘리지 않는다.
 */
export function findViolations(src) {
  const kind = classifySource(src);
  const violations = [];
  let from = 0;
  for (;;) {
    const idx = src.indexOf(METHOD_NAME, from);
    if (idx === -1) break;
    from = idx + METHOD_NAME.length;

    // 토큰 전체가 코드 영역이어야 한다 (문자열·주석 안 리터럴 배제)
    let allCode = true;
    for (let i = idx; i < idx + METHOD_NAME.length; i += 1) {
      if (kind[i] !== KIND_CODE) {
        allCode = false;
        break;
      }
    }
    if (!allCode) continue;
    // 식별자 경계
    if (idx > 0 && IDENT_RE.test(src[idx - 1])) continue;
    const afterChar = src[idx + METHOD_NAME.length];
    if (afterChar !== undefined && IDENT_RE.test(afterChar)) continue;
    // 메서드 호출만 대상 — 정의부(`async waitForFunction(fn, arg, opts) {}`) 배제
    if (prevSignificantChar(src, kind, idx - 1) !== '.') continue;
    // 여는 괄호
    let j = idx + METHOD_NAME.length;
    while (j < src.length && kind[j] === KIND_CODE && /\s/.test(src[j])) j += 1;
    if (src[j] !== '(' || kind[j] !== KIND_CODE) continue;

    const split = splitTopLevelArgs(src, kind, j);
    if (!split) {
      return {
        violations,
        error: `줄 ${lineOf(src, idx)}: '.${METHOD_NAME}(' 의 괄호가 닫히지 않았습니다 (파싱 실패).`,
      };
    }
    const { args } = split;
    if (args.length < 2) continue;
    const [a, b] = args[1];
    const argText = textWithoutComments(src, kind, a, b).trim();
    if (!argText.startsWith('{') || !argText.endsWith('}')) continue;

    // 원문 인덱스 기준으로 `{` 위치를 찾아 top-level 키를 본다
    let objStart = -1;
    for (let i = a; i < b; i += 1) {
      if (kind[i] === KIND_CODE && src[i] === '{') {
        objStart = i;
        break;
      }
    }
    if (objStart === -1) continue;
    const key = hasOptionKey(src, kind, objStart, b);
    if (!key) continue;

    violations.push({
      line: lineOf(src, idx),
      key,
      argText: argText.replace(/\s+/g, ' '),
    });
  }
  return { violations, error: null };
}

// ── 파일 수집 ────────────────────────────────────────────────────────────────

function collectFiles(root) {
  const files = [];
  const walk = (dir, rel) => {
    let entries;
    try {
      entries = readdirSync(dir, { withFileTypes: true });
    } catch (err) {
      console.error(`실행 에러: 디렉토리 열기 실패 — ${dir} (${err.message})`);
      process.exit(2);
    }
    for (const entry of entries.sort((x, y) => (x.name < y.name ? -1 : 1))) {
      const childRel = rel === '' ? entry.name : path.join(rel, entry.name);
      const childAbs = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (SKIP_DIR_NAMES.has(entry.name)) continue;
        if (SKIP_REL_PATHS.has(childRel)) continue;
        if (entry.name.startsWith('.') && !DOT_DIR_ALLOWLIST.has(entry.name)) continue;
        walk(childAbs, childRel);
        continue;
      }
      if (!entry.isFile()) continue;
      if (!SCAN_EXTENSIONS.has(path.extname(entry.name))) continue;
      files.push({ abs: childAbs, rel: childRel });
    }
  };
  walk(root, '');
  return files;
}

// ── 본검사 ───────────────────────────────────────────────────────────────────

function runCheck() {
  const root = process.env.WAITFORFUNCTION_SCAN_ROOT ?? DEFAULT_ROOT;
  // fail-fast: 스캔 루트 부재 시 silent pass 금지
  if (!existsSync(root) || !statSync(root).isDirectory()) {
    console.error(`실행 에러: 스캔 루트 부재 또는 디렉토리 아님 — ${root}`);
    process.exit(2);
  }

  const files = collectFiles(root);
  const found = [];
  for (const file of files) {
    const src = readFileSync(file.abs, 'utf8');
    if (!src.includes(METHOD_NAME)) continue;
    const { violations, error } = findViolations(src);
    if (error) {
      console.error(`실행 에러: ${file.rel} — ${error}`);
      process.exit(2);
    }
    for (const v of violations) found.push({ ...v, rel: file.rel });
  }

  if (found.length > 0) {
    console.error(
      `${MARK_FAIL} ${METHOD_NAME} 옵션 인자 오배치 ${found.length}건 — ` +
        `옵션은 **세 번째** 인자입니다 (\`${METHOD_NAME}(pageFunction, arg, options)\`). ` +
        `두 번째 자리에 넘긴 옵션은 \`arg\` 로 전달되어 선언한 timeout 이 적용되지 않고 ` +
        `playwright 기본값 30_000 ms 가 실제 상한이 됩니다.`,
    );
    for (const v of found) {
      console.error(`  ${v.rel}:${v.line}  두 번째 인자 = ${v.argText}   (옵션 키: ${v.key})`);
    }
    console.error(
      `교정: \`arg\` 가 필요 없으면 두 번째 인자를 \`undefined\` 로 두고 옵션을 세 번째로 옮깁니다. ` +
        `선례 — apps/web/scripts/browser-verify-glow-marker.mjs (#1239 / #1256).`,
    );
    process.exit(1);
  }

  console.log(
    `${MARK_PASS} ${METHOD_NAME} 옵션 인자 오배치 0건 — 스캔 ${files.length} 파일 (루트 ${root}).`,
  );
  process.exit(0);
}

// =============================================================================
// --self-test — 격리 픽스처 F1~F21 (positive / negative / recovery + 경계 고정)
// =============================================================================

function runSelfTest() {
  const dir = mkdtempSync(path.join(tmpdir(), 'waitforfunction-args-selftest-'));
  let pass = 0;
  let fail = 0;

  const assert = (name, cond, detail = '') => {
    if (cond) {
      pass += 1;
      console.log(`  ok   ${name}`);
    } else {
      fail += 1;
      console.error(`  FAIL ${name}${detail ? ` — ${detail}` : ''}`);
    }
  };

  /** 격리 루트를 만들고 파일들을 쓴 뒤, 자식 프로세스로 본 스크립트를 실제 CLI 경로로 실행 */
  const runFixture = (name, files) => {
    const rootDir = path.join(dir, name);
    mkdirSync(rootDir, { recursive: true });
    for (const [rel, content] of Object.entries(files)) {
      const abs = path.join(rootDir, rel);
      mkdirSync(path.dirname(abs), { recursive: true });
      writeFileSync(abs, content, 'utf8');
    }
    const res = spawnSync(process.execPath, [SCRIPT_PATH], {
      encoding: 'utf8',
      env: { ...process.env, WAITFORFUNCTION_SCAN_ROOT: rootDir },
    });
    return { ...res, rootDir, out: `${res.stdout ?? ''}${res.stderr ?? ''}` };
  };

  const FN = '() => typeof window.__solarScene !== "undefined"';

  // ── F1 위반 — 여러 줄 호출
  {
    const r = runFixture('f1', {
      'a.mjs': `await page.waitForFunction(\n  ${FN},\n  { timeout: 15_000 },\n);\n`,
    });
    assert('F1 위반(여러 줄) → exit 1', r.status === 1, `status=${r.status}`);
    assert('F1 보고에 a.mjs:1 포함', /a\.mjs:1\b/.test(r.out), r.out.trim());
  }

  // ── F2 위반 — 한 줄 호출
  {
    const r = runFixture('f2', {
      'a.mjs': `await page.waitForFunction(${FN}, { timeout: 15_000 });\n`,
    });
    assert('F2 위반(한 줄) → exit 1', r.status === 1, `status=${r.status}`);
  }

  // ── F3 정상 — 3-인자 (교정 형태)
  {
    const r = runFixture('f3', {
      'a.mjs': `await page.waitForFunction(\n  ${FN},\n  undefined,\n  { timeout: 20_000 },\n);\n`,
    });
    assert('F3 정상 3-인자 → exit 0', r.status === 0, r.out.trim());
  }

  // ── F4 오탐 축 (c) — 문자열 안 리터럴
  //    회귀 표본: apps/web/scripts/r1-ui-regression-guard.mjs 의 diag 템플릿 문자열
  {
    const r = runFixture('f4', {
      'a.mjs':
        'const id = 1;\n' +
        'diag(`goto done → page.waitForFunction(__gpuTier, { timeout: 10_000 }) id=${id}`);\n' +
        "log('page.waitForFunction(fn, { timeout: 15_000 })');\n" +
        'log("page.waitForFunction(fn, { timeout: 15_000 })");\n',
    });
    assert('F4 문자열 안 리터럴 → exit 0 (오탐 축 c)', r.status === 0, r.out.trim());
  }

  // ── F5 오탐 축 (d) — 주석 안 리터럴
  //    회귀 표본: scripts/browser-verify-utils.mjs:31 의 JSDoc
  {
    const r = runFixture('f5', {
      'a.mjs':
        '/**\n' +
        ' * page.waitForFunction(fn, { timeout: 15_000 }) 대신 bootstrapScene() 을 쓴다.\n' +
        ' */\n' +
        '// page.waitForFunction(fn, { timeout: 15_000 });\n' +
        'export const x = 1;\n',
    });
    assert('F5 주석 안 리터럴 → exit 0 (오탐 축 d)', r.status === 0, r.out.trim());
  }

  // ── F6 오탐 축 (e) — `arg` 가 실제로 쓰이는 객체 (옵션 키 없음) + 빈 객체 (경계 ii)
  {
    const r = runFixture('f6', {
      'a.mjs':
        `await page.waitForFunction((a) => a.id, { id: 'earth', retries: 3 }, { timeout: 20_000 });\n` +
        `await page.waitForFunction(() => true, {});\n`,
    });
    assert('F6 옵션 키 없는 객체 arg → exit 0 (오탐 축 e / 경계 ii)', r.status === 0, r.out.trim());
  }

  // ── F7 오탐 축 (e) — `arg` 가 식별자
  {
    const r = runFixture('f7', {
      'a.mjs':
        'const handles = ["__simCore"];\n' +
        'await page.waitForFunction((names) => names.every((n) => n), handles, { timeout: 20_000 });\n',
    });
    assert('F7 식별자 arg + 3-인자 → exit 0', r.status === 0, r.out.trim());
  }

  // ── F8 위반 — 축약형 `{ timeout }`
  {
    const r = runFixture('f8', {
      'a.mjs': 'const timeout = 5;\nawait page.waitForFunction(() => true, { timeout });\n',
    });
    assert('F8 축약형 { timeout } → exit 1', r.status === 1, r.out.trim());
  }

  // ── F9 위반 — 따옴표 친 키
  {
    const r = runFixture('f9', {
      'a.mjs': `await page.waitForFunction(() => true, { 'timeout': 5 });\n`,
      'b.mjs': `await page.waitForFunction(() => true, { ["timeout"]: 5 });\n`,
    });
    assert('F9 따옴표/계산 키 → exit 1', r.status === 1, r.out.trim());
    assert('F9 두 파일 모두 보고', /a\.mjs:1/.test(r.out) && /b\.mjs:1/.test(r.out), r.out.trim());
  }

  // ── F10 경계 — top-level 이 아닌 `timeout`
  {
    const r = runFixture('f10', {
      'a.mjs':
        'await page.waitForFunction(() => true, { opts: { timeout: 5 } }, { timeout: 20_000 });\n',
    });
    assert('F10 중첩 timeout(= top-level 아님) → exit 0', r.status === 0, r.out.trim());
  }

  // ── F11 스캐너 회귀 — 정규식 리터럴 / 나눗셈 혼재 뒤 정상 호출
  {
    const r = runFixture('f11', {
      'a.mjs':
        'const re = /page\\.waitForFunction\\(fn, \\{ timeout: 1 \\}\\)/g;\n' +
        'const half = (10 + 2) / 2 / 3;\n' +
        'await page.waitForFunction(() => half > 0, undefined, { timeout: 20_000 });\n',
    });
    assert('F11 정규식/나눗셈 혼재 → exit 0', r.status === 0, r.out.trim());
  }

  // ── F12 스캐너 회귀 — 템플릿 보간 복귀 후 위반 검출
  {
    const r = runFixture('f12', {
      'a.mjs':
        'const n = 1;\n' +
        'log(`before ${n + 1} after`);\n' +
        'await page.waitForFunction(() => true, { timeout: 15_000 });\n',
    });
    assert('F12 템플릿 보간 뒤 위반 검출 → exit 1', r.status === 1, r.out.trim());
    assert('F12 줄 번호 3 보고', /a\.mjs:3\b/.test(r.out), r.out.trim());
  }

  // ── F13 경계 — 메서드 **정의**는 호출이 아니다
  //    회귀 표본: scripts/browser-verify-utils.test.mjs 의 page mock
  {
    const r = runFixture('f13', {
      'a.mjs':
        'const page = {\n' +
        '  async waitForFunction(fn, arg, opts) {\n' +
        '    return { fn, arg, opts };\n' +
        '  },\n' +
        '};\n' +
        'export default page;\n',
    });
    assert('F13 메서드 정의부 → exit 0', r.status === 0, r.out.trim());
  }

  // ── F14 위반 — `timeout` 외 옵션 키 2종 (계약 대비 의도적 확장)
  //    `PageWaitForFunctionOptions` 의 세 키가 같은 기전을 공유하므로 셋을 같게 잡는다.
  //    ⚠️ `signal` 은 초판에서 빠져 있었고 (헤더가 「polling 이 나머지 전부」라고 단정했다)
  //    PR #1257 reviewer 가 격리 픽스처로 미검출을 실증해 적발했다. 이 두 단언은 상시 참이
  //    아니다 — `OPTION_KEYS` 에서 해당 원소를 빼면 각각 즉시 FAIL 한다.
  {
    const r = runFixture('f14', {
      'a.mjs': `await page.waitForFunction(() => true, { polling: 'raf' });\n`,
    });
    assert('F14a polling 키 → exit 1', r.status === 1, r.out.trim());
    const r2 = runFixture('f14b', {
      'a.mjs':
        'const ac = new AbortController();\n' +
        'await page.waitForFunction(() => true, { signal: ac.signal });\n',
    });
    assert('F14b signal 키 → exit 1', r2.status === 1, r2.out.trim());
    assert('F14b 보고에 옵션 키 signal 명시', /옵션 키: signal/.test(r2.out), r2.out.trim());
  }

  // ── F15 다건 — 한 파일 2건 전건 보고
  {
    const r = runFixture('f15', {
      'a.mjs':
        'await page.waitForFunction(() => true, { timeout: 15_000 });\n' +
        'await frame.waitForFunction(() => true, { timeout: 20_000 });\n',
    });
    assert('F15 2건 → exit 1', r.status === 1, r.out.trim());
    assert('F15 전건 보고 (2건)', /오배치 2건/.test(r.out), r.out.trim());
    assert('F15 두 줄 모두 보고', /a\.mjs:1/.test(r.out) && /a\.mjs:2/.test(r.out), r.out.trim());
  }

  // ── F16 경계 (i) — 두 번째 인자가 객체 리터럴이 아닌 형태의 옵션 전달은 의도적 미검출
  //    이 픽스처는 «가드가 못 잡는 것» 을 고정한다. exit 0 은 결함이 아니라 결정이다.
  {
    const r = runFixture('f16', {
      'a.mjs': 'const OPTS = { timeout: 15_000 };\nawait page.waitForFunction(() => true, OPTS);\n',
    });
    assert('F16a 변수 경유 옵션 → exit 0 (경계 i)', r.status === 0, r.out.trim());
    const r2 = runFixture('f16b', {
      'a.mjs':
        'const opts = { timeout: 15_000 };\nawait page.waitForFunction(() => true, { ...opts });\n',
    });
    assert('F16b spread 경유 옵션 → exit 0 (경계 i)', r2.status === 0, r2.out.trim());
  }

  // ── F17 검사 범위 계약 — 제외 디렉토리는 스캔하지 않는다
  {
    const viol = 'await page.waitForFunction(() => true, { timeout: 15_000 });\n';
    const r = runFixture('f17', {
      'node_modules/x.mjs': viol,
      'dist/x.mjs': viol,
      '.claude/worktrees/w/x.mjs': viol,
      '.claude/skills/x.mjs': 'export const ok = 1;\n',
      'src/x.mjs': 'export const ok = 1;\n',
    });
    assert('F17 제외 디렉토리 미스캔 → exit 0', r.status === 0, r.out.trim());
    const r2 = runFixture('f17b', { '.claude/skills/x.mjs': viol });
    assert('F17b .claude 하위(worktrees 밖)는 스캔 → exit 1', r2.status === 1, r2.out.trim());
  }

  // ── F18 3중 시뮬레이션 — positive → negative → recovery
  {
    const bad = `await page.waitForFunction(\n  ${FN},\n  { timeout: 15_000 },\n);\n`;
    const good = `await page.waitForFunction(\n  ${FN},\n  undefined,\n  { timeout: 20_000 },\n);\n`;
    const p = runFixture('f18-positive', { 'a.mjs': bad });
    assert('F18 positive (오배치 주입) → exit 1', p.status === 1, p.out.trim());
    const nres = runFixture('f18-negative', { 'a.mjs': good });
    assert('F18 negative (교정) → exit 0', nres.status === 0, nres.out.trim());
    // recovery — negative 루트에 오배치를 재주입해 같은 루트에서 판정이 뒤집히는지 본다
    writeFileSync(path.join(nres.rootDir, 'b.mjs'), bad, 'utf8');
    const rec = spawnSync(process.execPath, [SCRIPT_PATH], {
      encoding: 'utf8',
      env: { ...process.env, WAITFORFUNCTION_SCAN_ROOT: nres.rootDir },
    });
    const recOut = `${rec.stdout ?? ''}${rec.stderr ?? ''}`;
    assert('F18 recovery (재주입) → exit 1', rec.status === 1, recOut.trim());
    assert(
      'F18 recovery 가 b.mjs 만 보고',
      /b\.mjs:1/.test(recOut) && !/a\.mjs:/.test(recOut),
      recOut.trim(),
    );
  }

  // ── F19 fail-fast — 실행 에러 경로 (exit 2). exit 1 과 구분해 단언한다
  {
    const missing = path.join(dir, 'does-not-exist');
    const r = spawnSync(process.execPath, [SCRIPT_PATH], {
      encoding: 'utf8',
      env: { ...process.env, WAITFORFUNCTION_SCAN_ROOT: missing },
    });
    assert('F19a 스캔 루트 부재 → exit 2', r.status === 2, `status=${r.status}`);
    const r2 = spawnSync(process.execPath, [SCRIPT_PATH, '--unknown-flag'], { encoding: 'utf8' });
    assert('F19b 잉여 인자 → exit 2', r2.status === 2, `status=${r2.status}`);
    const r3 = runFixture('f19c', {
      'a.mjs': 'await page.waitForFunction(() => true, { timeout: 1 }\n',
    });
    assert('F19c 괄호 미종결 → exit 2', r3.status === 2, r3.out.trim());
  }

  // ── F20 배선 단언 (#897 — 미배선 self-test 는 0회 실행)
  //    CI 스텝 2개 + package.json 스크립트가 실제로 존재하는지 **저장소 실물**에서 확인한다.
  {
    const rel = path.relative(DEFAULT_ROOT, SCRIPT_PATH).split(path.sep).join('/');
    const wfPath = path.join(DEFAULT_ROOT, '.github/workflows/project-guards.yml');
    const wf = existsSync(wfPath) ? readFileSync(wfPath, 'utf8') : '';
    assert('F20a CI 본검사 스텝 배선', wf.includes(`node ${rel}\n`), `${rel} 본검사 스텝 부재`);
    assert(
      'F20b CI self-test 스텝 배선',
      wf.includes(`node ${rel} --self-test`),
      `${rel} self-test 스텝 부재`,
    );
    const pkgPath = path.join(DEFAULT_ROOT, 'package.json');
    const pkg = existsSync(pkgPath) ? JSON.parse(readFileSync(pkgPath, 'utf8')) : { scripts: {} };
    assert(
      'F20c package.json verify:waitforfunction-args 등록',
      pkg.scripts?.['verify:waitforfunction-args'] === `node ${rel}`,
      `현재값=${pkg.scripts?.['verify:waitforfunction-args']}`,
    );
  }

  // ── F21 경계 (iv) — 메서드 호출 구문이 아닌 호출은 의도적 미검출
  //    전자는 앵커가 `.` 이 아니고, 후자는 토큰이 문자열 리터럴이라 F4(문자열 안 리터럴 오탐
  //    배제)와 **같은 기전**의 대가다. 둘 다 저장소 발생 0. exit 0 은 결함이 아니라 결정이다.
  {
    const r = runFixture('f21', {
      'a.mjs':
        'const { waitForFunction } = page;\n' +
        'await waitForFunction(() => true, { timeout: 15_000 });\n',
    });
    assert('F21a 구조분해 호출 → exit 0 (경계 iv)', r.status === 0, r.out.trim());
    const r2 = runFixture('f21b', {
      'a.mjs': `await page['waitForFunction'](() => true, { timeout: 15_000 });\n`,
    });
    assert('F21b 계산된 멤버 호출 → exit 0 (경계 iv)', r2.status === 0, r2.out.trim());
  }

  rmSync(dir, { recursive: true, force: true });
  console.log(`\nself-test: ${pass} passed, ${fail} failed`);
  process.exit(fail === 0 ? 0 : 1);
}

// ── 진입점 ───────────────────────────────────────────────────────────────────

const args = process.argv.slice(2);
if (args.length === 0) {
  runCheck();
} else if (args.length === 1 && args[0] === '--self-test') {
  runSelfTest();
} else {
  // fail-fast: 알 수 없는 인자를 조용히 무시하면 CI 가 본검사 대신 no-op 을 돌 수 있다
  console.error(`실행 에러: 알 수 없는 인자 — ${JSON.stringify(args)}. 사용: [--self-test]`);
  process.exit(2);
}
