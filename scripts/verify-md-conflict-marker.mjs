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
 * ── 실측 매트릭스 (rev `b64c66c` / prettier `3.9.6` / 격리 픽스처) ──────────
 * 변형은 **3축**이다 — 마커 종류 × **앞줄 상태**(축 2) × **컨테이너 컨텍스트**(축 3).
 * (마커는 `open`/`base`/`sep`/`close` 대역 이름으로만 적는다 — §5)
 *
 * **축 2 — 앞줄 상태.** 마커가 리스트 항목 바로 밑에 오면 lazy continuation 이 붙는다:
 *
 *   마커            | 앞줄이 빈 줄        | 앞줄에 텍스트 인접
 *   ----------------|---------------------|---------------------------------------------
 *   open   (7 lt)   | 그대로              | 그대로
 *   base   (7 pipe) | 그대로              | **선행 2칸 들여쓰기**
 *   sep    (7 eq)   | 그대로              | **선행 2칸 + 백슬래시 escape**
 *   close  (7 gt)   | **blockquote 정규화** | **blockquote 정규화**
 *
 *   ⚠️ (a) **선행 공백은 `sep` 만의 문제가 아니다** — `base` 도 들여쓰기가 붙는다. 그래서
 *          원형 술어 전체에 `^\s*` 를 넣는다.
 *   ⚠️ (b) `close` 는 **앞줄과 무관하게** 항상 변형된다. 반대로 `sep` 의 escape 는 **조건부**라,
 *          실사고 형태(빈 줄 분리)에서는 원형 그대로 남아 있었다.
 *
 * **축 3 — 컨테이너 컨텍스트.** 마커가 blockquote 나 표 **안**에 놓이면 접두가 붙는다:
 *
 *   원본 문맥                    | prettier 통과 후
 *   -----------------------------|--------------------------------
 *   앞 줄이 blockquote           | `"> "` + 마커  (인용 안으로 흡수)
 *   표 행 안                     | `"| "` + 마커 + `" |"`
 *
 *   ⚠️ **이 축은 `^\s*` 로 못 덮는다** — `>` 와 `|` 는 공백이 아니다. `containerVariants()`
 *      가 접두를 한 겹씩 벗기며 매 단계를 검사한다.
 *   ⚠️ **접두만으로는 부족하다 — 표에는 「닫는」 구분자가 있다.** `sep`/`sep-escaped` 는
 *      6형태 중 유일하게 `\s*$` 로 행 끝을 요구하므로, 여는 `|` 를 벗겨도 뒤의 `|` 때문에
 *      매칭되지 않는다. 그래서 각 단계마다 **닫는 구분자를 뗀 변형도** 후보에 넣는다
 *      (PR #1123 reviewer 라운드 2 B2 — 라운드 1 픽스처가 못 드러낸 하위 케이스였다).
 *      모집단이 작지 않다: prettier 소유 md `50` 중 `45` 가 최상위 표를 갖고, 실사고 파일
 *      `CHANGELOG.md` 자신의 표 행이 `56` 이다.
 *   ⚠️ **인위적 주입이 아니다.** git 은 마커를 항상 컬럼 `0` 에 쓰지만, `CHANGELOG.md` 처럼
 *      blockquote·표를 상시 쓰는 파일에서는 `prettier --write` **1회**로 도달한다 — 실사고
 *      `fa497b6` 과 **같은 파일 클래스**다. 초판은 이 축을 몰라 「2축」이라 단정했고,
 *      PR #1123 reviewer 가 실제 prettier 산출물로 반증했다 (B1). 그 상태에서는 보고된
 *      줄만 지우면 **가드가 초록인 채 마커가 커밋**되는 경로가 열려 있었다.
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
 *      (rev `b64c66c` — 6형태 전건 `0` · 같은 실행 양성 대조군 `git grep -IlE '^## '` 249 파일).
 *      ⚠️ **모집단 계약: 작업 트리 기준**이다 (`fs.readFileSync`). `.husky/pre-commit` 의 자매
 *      가드가 쓰는 `--staged`(인덱스 ↔ HEAD) 와 **모집단이 다르다** — 인덱스에만 마커가 있고
 *      작업 트리가 깨끗하면 이 가드는 통과한다. 그 경로는 CI 의 전수 실행이 백스톱이다.
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
 * ── 오탐 축 실측 (rev `b64c66c`) ────────────────────────────────────────────
 * 술어별로 "정상 마크다운에 실재할 수 있는가" 를 따로 쟀다. 술어는 `git grep -lE '<패턴>' -- .`
 * (tracked `746` 파일 / 검사 `658` — 차 `88` 은 바이너리이고 tracked PNG 전량 `88` 과 일치).
 * 전건 `0`:
 *   - setext H1 (`eq` 연속) — `={7}` `0` / `={4,}` `0` / **`={2,}` 조차 `0`**
 *   - 표 문법 (`pipe` 7연속) `0` · 부등호 7연속 `0` · **`(> ){6}>`(close 정규화형) `0`**
 * 즉 이 저장소에서 6형태는 **마커 이외의 출처가 없다**. 시점 의존 값이므로 rev 를 병기한다
 * (ADR `20260808-983` §수치 박제 규약 4항 — 값과 rev 라벨이 어긋나면 그 자체가 오박제다.
 * 초판이 `0ee0de1` 라벨에 다른 rev 의 값을 적었고 PR #1123 reviewer S3 가 적발했다).
 *
 * ── 종료 코드 ───────────────────────────────────────────────────────────────
 *   0 — 위반 0 (또는 `--self-test` 성공)
 *   1 — 위반 발견
 *   2 — 실행 에러 (잉여/누락 인자, git 실행 실패 등 환경·상태 오류)
 *
 * ── 호출 ────────────────────────────────────────────────────────────────────
 *   node scripts/verify-md-conflict-marker.mjs              # 전수 (pre-commit / CI)
 *   node scripts/verify-md-conflict-marker.mjs --self-test  # 격리 픽스처 3중 시뮬레이션
 *
 * ⚠️ **`--self-test` 는 hermetic 하지 않다** — prettier e2e 단계가
 * `<script>/../node_modules/.bin/prettier` 를 요구하므로 **`pnpm install` 이 선행**돼야 한다
 * (부재 시 exit `2`). 본검사는 prettier 를 쓰지 않으므로 이 제약이 없다. CI 는 install →
 * self-test 순서라 안전하고 pre-commit 은 `--self-test` 를 호출하지 않는다. 격리 worktree 에
 * 스크립트만 복사해 돌리면 이 조건에 걸린다 (실제로 한 번 밟았다 — U3).
 */

import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import assert from 'node:assert/strict';
import { execFileSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';

/** 처방 문구 — 우회로(`--no-verify` 등)는 출력에 넣지 않는다. */
const PRESCRIPTION = '충돌 해소를 끝내고 마커를 제거한 뒤 다시 커밋한다';
const ISSUE = '#1103';
const TAG = '[md-conflict-marker]';

const EXEC_OPTS = { encoding: 'utf8', maxBuffer: 64 * 1024 * 1024 };

/**
 * 이 스크립트의 절대 경로.
 *
 * ⚠️ `new URL(import.meta.url).pathname` 을 쓰면 **경로에 공백이 있을 때 깨진다** — 그 값은
 * 퍼센트 인코딩된 채라 (`/has%20space/...`) `realpathSync` 가 `ENOENT` 로 던진다. 모듈 로드
 * 시점 예외라 `main()` 의 try/catch 밖이고, 종료 코드가 `1` 이라 **「위반 발견」과 구별되지
 * 않는다** — 헤더 §종료 코드 계약(`2` = 환경 오류)을 조용히 어기는 형태다.
 * `fileURLToPath` 는 디코드까지 해 준다 (자매 가드 `verify-md-tilde.mjs` 와 같은 관용구).
 */
const SELF_PATH = fileURLToPath(import.meta.url);

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
 * `^\s*` 는 리스트 lazy continuation 이 붙이는 선행 들여쓰기를 덮는다 (§실측 매트릭스 축 2).
 *
 * ⚠️ **`^\s*` 만으로는 축 3 (컨테이너) 을 덮지 못한다** — blockquote 의 `>` 와 표 셀의 `|` 는
 * 공백이 아니다. 그 축은 술어가 아니라 `containerVariants()` 가 담당한다 (§축 3 참조).
 *
 * `close-blockquote` 의 `(?:> ){RUN-1}>` 는 **`>` 를 정확히 `RUN` 개 요구**하는 형태다.
 * prettier 는 blockquote 를 `"> "` 쌍으로 정규화하므로 마커는 두 모습으로만 나온다:
 *   - 마커 뒤에 텍스트가 있으면 `"> " × 7` + 텍스트  → 앞 6쌍 소비 후 7번째 `>` 가 매칭
 *   - 마커 뒤가 비면 마지막 `>` 에 짝이 없어 `"> " × 6 + ">"` → 같은 술어가 그대로 덮는다
 * ⚠️ **`{RUN-1,}` (`{6,}`) 으로 열어 두면 정상 6중첩 인용이 오탐**된다 — 초판이 그랬고
 * self-test negative `"> " × 6 + 텍스트` 가 그 경계를 고정한다. 위쪽 `close` 와 겹치지 않는
 * 이유는 그쪽이 `>` **연속** 7개(공백 없음)를 요구하기 때문이다.
 * ⚠️ **오탐이 완전히 사라진 것은 아니다 — 정상 `RUN` 중첩 인용은 여전히 hit 이다.** 마커의
 * 정규화 결과와 **구조적으로 구별 불가**해서 원리적으로 불가피하다 (저장소 실측 `0`건).
 * 트레이드오프가 «6중첩 오탐» 에서 «7중첩 오탐» 으로 **이동**했을 뿐임을 적어 둔다.
 * ⚠️ 탭 구분 blockquote(`>` + 탭 반복)는 이 술어가 잡지 않는다. prettier 가 `"> "`(공백)로
 * 정규화하므로 **현재 도달 경로가 없다** — 기록용이다.
 */
const RULES = [
  { id: 'open', scope: 'all', re: new RegExp(`^\\s*${LT}(?:\\s|$)`) },
  { id: 'base', scope: 'all', re: new RegExp(`^\\s*${PIPE}(?:\\s|$)`) },
  { id: 'sep', scope: 'all', re: new RegExp(`^\\s*${EQ}\\s*$`) },
  { id: 'close', scope: 'all', re: new RegExp(`^\\s*${GT}(?:\\s|$)`) },
  // prettier 변형 — sep 은 백슬래시 escape, close 는 blockquote 정규화.
  { id: 'sep-escaped', scope: 'md', re: new RegExp(`^\\s*\\\\${EQ}\\s*$`) },
  { id: 'close-blockquote', scope: 'md', re: new RegExp(`^\\s*(?:> ){${RUN - 1}}>`) },
];

/** 컨테이너 접두를 한 겹씩 벗기는 패턴 — blockquote `>` 와 표 셀 `|`. */
const CONTAINER_PREFIX = /^[ \t]*[>|][ \t]?/;

/**
 * 표 행의 **닫는** 구분자.
 *
 * ⚠️ **접두만 벗기면 끝 앵커 술어가 통과된다.** `sep`/`sep-escaped` 는 6형태 중 유일하게
 * `\s*$` 로 **행 끝**을 요구하므로, 표 셀 안의 마커(`"| " + sep + " |"`)는 여는 `|` 를 벗겨도
 * 뒤에 남은 `|` 때문에 매칭되지 않는다. prettier 가 셀 폭을 맞추며 넣는 패딩까지 더해
 * `sep` 이 **조용히 사라진다** — PR #1123 reviewer 라운드 2 (B2) 가 실제 산출물로 재현했다.
 *
 * ⚠️ **한 겹만 뗀다.** `"| a | (sep) | b |"` 처럼 셀이 여럿인 행은 이 패턴으로 못 잡지만,
 * **git 은 마커를 컬럼 `0` 에 단독으로 쓰므로** 그 줄에는 파이프가 없고 prettier 를 거치면
 * 항상 **단일 셀 행**이 된다 (reviewer 라운드 3 U4 — 30조건 sweep + multipass fixpoint 로
 * 도달 불가 확인). 여러 겹을 떼면 정상 표 행이 오탐 표면으로 들어온다.
 * ⚠️ `\r` 을 포함하는 이유는 CRLF 파일에서 닫는 파이프 뒤에 `\r` 이 남기 때문이다 (U5).
 */
const CONTAINER_SUFFIX = /[ \t\r]*\|[ \t\r]*$/;

/** 벗기기 상한. 실측 최대 깊이는 `close` 의 7 이며, 여유를 둔 무한 루프 방지값이다. */
const MAX_CONTAINER_DEPTH = 16;

/**
 * 한 라인의 **컨테이너 접두를 한 겹씩 벗긴 변형들**을 원본과 함께 돌려준다 (축 3).
 *
 * git 은 마커를 항상 컬럼 `0` 에 쓰지만, `prettier --write` **1회**로 그 마커가 앞 blockquote
 * 안으로 흡수되거나 (`"> " + open`) 표 셀 안에 놓인다 (`"| " + open + " |"`). 그 형태는
 * 행 선두 앵커 술어를 통째로 관통한다 — 인위적 주입이 아니라 **CHANGELOG 가 상시 쓰는 형태**
 * 에서 자연히 나온다 (실사고 `fa497b6` 과 같은 파일 클래스).
 *
 * **한 겹씩** 벗기며 매 단계를 검사 대상에 넣는 이유는 표 셀 때문이다. `|` 를 통째로 잘라
 * 셀 배열로 만들면 `base` 마커(파이프 `RUN` 개) 자체가 쪼개져 **사라진다**. 한 겹만 벗기면
 * `"| " + base` 가 `base` 로 남아 검출된다.
 *
 * @param {string} line
 * @returns {string[]} 원본 + 벗긴 변형들
 */
function containerVariants(line) {
  const variants = [];
  /** 각 단계마다 «그대로» 와 «닫는 구분자를 뗀 것» 을 모두 후보로 넣는다. */
  const push = (s) => {
    variants.push(s);
    const trimmed = s.replace(CONTAINER_SUFFIX, '');
    if (trimmed !== s) variants.push(trimmed);
  };
  push(line);
  let s = line;
  for (let depth = 0; depth < MAX_CONTAINER_DEPTH; depth += 1) {
    const m = CONTAINER_PREFIX.exec(s);
    if (!m || m[0].length === 0) break;
    s = s.slice(m[0].length);
    push(s);
  }
  return variants;
}

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
    // 컨테이너 벗기기는 markdown 에서만 한다 — 다른 확장자에서 `>`/`|` 는 컨테이너가 아니다
    // (셸 리다이렉트 · 파이프 · 비교 연산자). 거기까지 벗기면 순수 오탐 표면이 된다.
    const variants = isMarkdown ? containerVariants(text) : [text];
    for (const rule of RULES) {
      if (rule.scope === 'md' && !isMarkdown) continue;
      // close-blockquote 는 변형 자체가 컨테이너 형태라 원본에만 적용한다 (벗기면 사라진다).
      const targets = rule.id === 'close-blockquote' ? [text] : variants;
      if (targets.some((t) => rule.re.test(t))) {
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

/**
 * prettier 바이너리 — **`--self-test` 전용**이다 (본검사는 prettier 를 쓰지 않는다).
 *
 * 스크립트 위치 기준으로 찾는다 — self-test 가 임시 디렉토리에서 돌기 때문에 `cwd` 로는
 * 못 찾는다 (자매 가드 `verify-md-tilde.mjs` 와 같은 관용구). 부재는 «위반» 이 아니라
 * 환경 오류이므로 exit `2` 다.
 */
function requirePrettierBin() {
  const bin = path.resolve(path.dirname(SELF_PATH), '..', 'node_modules', '.bin', 'prettier');
  if (!fs.existsSync(bin)) {
    console.error(`${TAG} prettier 바이너리 부재: ${bin} — \`pnpm install\` 후 다시 실행한다`);
    process.exit(2);
  }
  return bin;
}

/** NUL 바이트가 있으면 바이너리로 본다 (`git grep -I` 와 같은 기준). */
function isBinary(buf) {
  return buf.includes(0);
}

/**
 * tracked 파일 목록.
 *
 * ⚠️ **중복 제거가 필수다.** 인덱스에 미해결(unmerged) 엔트리가 있으면 `git ls-files` 는 그
 * 경로를 **stage 1/2/3 으로 각각 한 줄씩** 반환한다 — 즉 충돌 해소 중에는 같은 파일이 최대
 * 3번 스캔되어 **위반 건수가 3배로 부풀고 계수도 틀린다**. 하필 이 가드가 가장 자주 도는
 * 상황이 바로 그 상태다 (자매 가드 `verify-md-tilde.mjs` 는 같은 문제를 exit `2` 로 처리한다 —
 * 그쪽은 «계수» 가 산출물이라 오염이 곧 무의미이지만, 여기서는 **중복만 걷으면 판정이 성립**
 * 하므로 차단하지 않는다. 마커를 찾는 것이 목적인데 충돌 중이라고 검사를 거부하면 본말전도다).
 */
function trackedFiles(cwd) {
  const out = git(['ls-files', '-z'], { cwd });
  return [...new Set(out.split('\0').filter((p) => p.length > 0))];
}

function collectViolations(cwd) {
  const findings = [];
  let scanned = 0;
  for (const rel of trackedFiles(cwd)) {
    const abs = path.join(cwd, rel);
    let buf;
    try {
      buf = fs.readFileSync(abs);
    } catch (err) {
      // 흡수하는 것은 **「파일이 아니어서 읽을 수 없다」** 는 두 경우뿐이다:
      //   ENOENT — 인덱스에는 있으나 작업 트리에 없다 (삭제 스테이징 · 깨진 심볼릭 링크)
      //   EISDIR — tracked gitlink(서브모듈). `git ls-files` 는 이걸 경로로 내지만 작업
      //            트리에서는 디렉토리다. ⚠️ 초판은 ENOENT 만 흡수해 **서브모듈이 추가되는
      //            날 CI 가 exit 2 로 hard fail** 했다 (PR #1123 reviewer 라운드 2 T1 —
      //            현재 gitlink `0` 이라 잠복이었고, 격리 저장소에서 재현했다).
      // ⚠️ EACCES 등 나머지는 삼키지 않는다 — **검사되지 않은 파일이 조용히 늘어나는** 형태라
      // 가드가 초록인 채 커버리지만 줄어든다. fail-fast 원칙상 환경 오류(exit 2)로 올린다.
      if (err.code === 'ENOENT' || err.code === 'EISDIR') continue;
      throw err;
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
  const indented = [
    ['base', `  ${M.base}`],
    ['sep', `  ${M.sep}`],
    ['open', `  ${M.open}`],
    ['close', `  ${M.close}`],
  ];
  for (const [id, line] of indented) {
    const hits = scanContent(`# f\n\n${line}\n`, true);
    assert.equal(hits.length, 1, `indented positive 미검출: ${id}`);
    assert.equal(hits[0].id, id, `indented positive 오분류: ${id}`);
  }

  // (2-b) **컨테이너 접두** — 축 3. git 컬럼 0 마커가 `prettier --write` 1회로 앞 blockquote 에
  //       흡수되거나 표 셀에 놓이면 행 선두 앵커가 통째로 관통된다 (PR #1123 reviewer B1).
  //       ⚠️ 이 블록이 비면 회귀가 조용히 재개방된다 — 초판이 정확히 그 상태였다.
  const containers = [
    ['open', `> ${M.open}`], // blockquote 흡수 — 실사고와 같은 파일 클래스에서 자연 발생
    ['open', `> > ${M.open}`], // 중첩 blockquote
    ['open', `  > ${M.open}`], // 들여쓴 blockquote (축 2 × 축 3)
    ['sep', `> ${M.sep}`],
    ['close', `> ${M.close}`], // blockquote 안 bare close (정규화 전)
    ['open', `| ${M.open} |`], // 표 셀
    ['base', `| ${M.base} |`], // 표 셀 안 파이프 마커 — 셀 분리로 자르면 사라진다
    ['open', `> | ${M.open} |`], // 컨테이너 2겹
    ['close-blockquote', `${'> '.repeat(RUN - 1)}>`], // bare close — 뒤가 비면 마지막 `>` 에 짝이 없다
    ['sep', `| ${M.sep} |`], // 표 셀 — 끝 앵커 술어가 닫는 구분자를 넘어야 한다 (B2)
    ['sep-escaped', `| ${M.sepEscaped.trim()} |`],
  ];
  for (const [id, line] of containers) {
    const hits = scanContent(`# f\n\n${line}\n`, true);
    assert.equal(hits.length, 1, `container positive 미검출: ${id} ← ${JSON.stringify(line)}`);
    assert.equal(
      hits[0].id,
      id,
      `container positive 오분류: ${JSON.stringify(line)} → ${hits[0].id}`,
    );
  }

  // (2-c) 컨테이너 벗기기는 **markdown 한정**이다 — 비-md 의 `>`/`|` 는 셸 리다이렉트·파이프다
  assert.equal(
    scanContent(`x\n> ${M.open}\n`, false).length,
    0,
    '비-md 에서 컨테이너 벗기기가 발화 (셸 리다이렉트 오탐 표면)',
  );

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
    // 컨테이너 벗기기가 새로 만드는 오탐 표면의 대조군 (축 3 도입 후 추가)
    '| a | b | c | d | e | f | g | h |', // 파이프 8개이나 연속이 아니다
    '> > > > > > 6중첩이나 뒤가 텍스트', // close-blockquote 는 `> ` 쌍 반복만
    '> | 표를 인용 안에 | 넣은 것 |',
    '  > > 들여쓴 중첩 인용',
    `> ${'='.repeat(RUN - 1)}`, // 인용 안 짧은 등호
    `| ${'<'.repeat(RUN - 1)} HEAD |`, // 표 셀 안 짧은 마커
    '>', // 빈 blockquote
    '|', // 빈 표 구분
  ];
  for (const line of negatives) {
    const hits = scanContent(`# f\n\n${line}\n`, true);
    assert.equal(hits.length, 0, `오탐: ${JSON.stringify(line)} → ${hits.map((h) => h.id)}`);
  }

  console.log(
    `${TAG} self-test(분류기) — positive ${positives.length + indented.length + containers.length}` +
      ` / md-scope 3 / negative ${negatives.length} PASS`,
  );
}

/**
 * prettier e2e — **손으로 쓴 문자열이 아니라 실제 `prettier --write` 산출물**을 검사한다.
 *
 * 손으로 적은 변형형은 «술어가 그 문자열을 잡는다» 는 것만 보이고 **prettier 가 실제로
 * 무엇을 만드는지**는 보이지 않는다 — ADR 자신이 「자기 충족」이라 경고한 형태다. 그래서
 * 여기서는 **git 이 쓰는 컬럼 `0` 마커만** 주입하고 변형은 전적으로 prettier 에 맡긴다.
 *
 * ⚠️ **B2 회귀를 실제로 막는 것은 이 함수가 아니라 위 분류기의 컨테이너 픽스처다.**
 * 초판 e2e 는 표 컨텍스트의 충돌 «내용» 을 리스트 항목으로 썼는데, 그러면 GFM 표가 `sep`
 * 전에 끝나 마커가 표 밖으로 나온다 — **B2 결함 보유판(`b2c83fc`)에서도 14/14 통과**했다
 * (PR #1123 reviewer 라운드 3 U1 이 변이 테스트로 측정). 즉 그 시점의 e2e 는 판별력이 `0`
 * 이었고, «e2e 가 없어서 B2 가 통과했다» 는 서술은 **틀렸다**.
 * 지금은 표 컨텍스트의 내용도 **표 행**으로 맞춰 판별력을 실측 확인했다 (결함판에서 `sep`
 * 소실 → 검출). **두 층을 모두 유지한다** — 분류기 픽스처를 「e2e 와 중복」이라며 지우면
 * B1·B2 보호가 조용히 사라진다.
 *
 * 임시 디렉토리에서 돌리므로 저장소의 `.prettierignore` 영향을 받지 않는다 (리포 안에서
 * 돌리면 `.context/`·`docs/**` 가 `ignored: true` 라 **아무것도 검사하지 않은 채 통과**한다 —
 * 이 함정도 실제로 한 번 밟았다).
 */
function selfTestPrettierE2E() {
  const bin = requirePrettierBin();
  const open = `${'<'.repeat(RUN)} HEAD`;
  const base = `${'|'.repeat(RUN)} base`;
  const sep = '='.repeat(RUN);
  const close = `${'>'.repeat(RUN)} origin/develop`;

  /**
   * 마커를 감싸는 문맥. `%M` 자리에 마커 블록이 컬럼 `0` 으로 들어간다.
   *
   * ⚠️ **`body` 가 컨텍스트와 정합해야 판별력이 생긴다.** 표 안 충돌인데 사이 «내용» 을
   * 리스트 항목으로 쓰면 GFM 표가 그 지점에서 끝나 뒤 마커가 표 밖으로 나온다 — 표 케이스를
   * 돌리는 시늉만 하고 실제로는 평문을 재는 셈이다 (U1 이 이걸 변이 테스트로 잡았다).
   *
   * `table` 플래그는 §U6 용이다: **살아있는 표 안에서 diff3 `base` 는 원리적으로 검출 불가**다.
   * prettier 가 파이프 `RUN` 연속을 빈 셀들로 **분해**해 문자열 자체가 소멸하기 때문이고,
   * 이건 미검출이 아니라 **부재**다 (나머지 3종이 발화해 exit `1` 은 유지된다).
   */
  const CONTEXTS = [
    { name: '평문-빈줄', tmpl: '# f\n\n- 항목 A\n\n%M\n\n- 항목 B\n', body: (i) => `- 변경 ${i}` },
    { name: '평문-인접', tmpl: '# f\n\n- 항목 A\n%M\n- 항목 B\n', body: (i) => `- 변경 ${i}` },
    {
      name: 'blockquote-앞줄',
      tmpl: '# f\n\n> 인용 문장이 앞에 있다.\n%M\n\n- 뒤\n',
      body: (i) => `> 변경 ${i}`,
    },
    {
      name: 'blockquote-중첩',
      tmpl: '# f\n\n> 1단계\n>\n> > 2단계 중첩\n%M\n\n- 뒤\n',
      body: (i) => `> 변경 ${i}`,
    },
    {
      name: '표-안',
      tmpl: '| 항목 | 값 |\n| --- | --- |\n| a | 1 |\n%M\n| b | 2 |\n',
      body: (i) => `| x | 변경 ${i} |`,
      table: true,
    },
    {
      name: '표-헤더직후',
      tmpl: '| 항목 | 값 |\n| --- | --- |\n%M\n| a | 1 |\n',
      body: (i) => `| x | 변경 ${i} |`,
      table: true,
    },
    {
      name: '리스트-중첩',
      tmpl: '# f\n\n- 상위\n  - 하위 항목\n%M\n\n- 뒤\n',
      body: (i) => `  - 변경 ${i}`,
    },
  ];
  const MARKER_SETS = [
    [
      'merge',
      [
        ['open', open],
        ['sep', sep],
        ['close', close],
      ],
    ],
    [
      'diff3',
      [
        ['open', open],
        ['base', base],
        ['sep', sep],
        ['close', close],
      ],
    ],
  ];

  /**
   * 주입한 마커 **종류**가 어떤 검출 id 로 나타날 수 있는지.
   *
   * ⚠️ 판정을 「주입 줄 수 == 검출 줄 수」로 하면 **틀린다.** prettier 가 마커 뒤의 내용까지
   * 같은 blockquote 로 흡수하면 마커 하나가 **여러 줄로 번지고**, 가드는 그 줄들을 전부
   * 보고한다 — 그것은 과보고(fail-loud)이지 결함이 아니다 (사용자는 어차피 다 지워야 한다).
   * 이 self-test 가 물어야 하는 것은 **「주입한 마커 종류가 하나라도 사라졌는가」** 다.
   */
  const ACCEPTS = {
    open: ['open'],
    base: ['base'],
    sep: ['sep', 'sep-escaped'],
    close: ['close', 'close-blockquote'],
  };

  const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-conflict-marker-e2e-'));
  try {
    let cases = 0;
    for (const ctx of CONTEXTS) {
      for (const [setName, markers] of MARKER_SETS) {
        // 마커 사이에 «양쪽 변경분» 을 끼워 실제 충돌 모양을 만든다 — 내용도 컨텍스트에 맞춘다.
        const block = markers
          .map(([, m], i) => (i < markers.length - 1 ? `${m}\n${ctx.body(i)}` : m))
          .join('\n');
        const src = ctx.tmpl.replace('%M', block);
        const file = path.join(dir, `${ctx.name}-${setName}.md`);
        fs.writeFileSync(file, src);
        execFileSync(bin, ['--write', file], { stdio: 'ignore' });
        const after = fs.readFileSync(file, 'utf8');
        const found = new Set(scanContent(after, true).map((h) => h.id));
        for (const [kind] of markers) {
          // §U6 — 살아있는 표 안에서 diff3 base 는 prettier 가 빈 셀로 분해해 «부재» 가 된다.
          if (kind === 'base' && ctx.table) continue;
          assert.ok(
            ACCEPTS[kind].some((id) => found.has(id)),
            `prettier e2e — 마커 종류 '${kind}' 소실 [${ctx.name}/${setName}]\n` +
              `--- prettier 산출물 ---\n${after}\n--- 검출 id ---\n${[...found].join(', ') || '(없음)'}`,
          );
        }
        // 어떤 컨텍스트에서도 «전부 소실» 은 허용하지 않는다 (exit 1 이 유지되는지).
        assert.ok(found.size > 0, `prettier e2e — 검출 0 [${ctx.name}/${setName}]\n${after}`);
        cases += 1;
      }
    }
    console.log(
      `${TAG} self-test(prettier e2e) — ${cases} 조건 전건 「주입 마커 종류 소실 0」 PASS`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
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
      // ⚠️ **자기 자신**을 실행한다. 고정 파일명(`verify-md-conflict-marker.mjs`)을 쓰면
      // 사본·변이본으로 돌려도 자식은 항상 원본을 실행해 **통합 단계가 무엇도 검증하지
      // 못한다** — 변이 테스트가 조용히 초록이 된다 (PR #1123 라운드 3 에서 U2 케이스를
      // 추가하고 변이로 확인하다 실제로 이 사각을 밟았다).
      const r = execFileSync(process.execPath, [fs.realpathSync(SELF_PATH)], {
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

    // ④ tracked gitlink(서브모듈) 가 있어도 exit 0 — T1 회귀 보호.
    //    `git ls-files` 는 gitlink 을 «경로» 로 내지만 작업 트리에서는 디렉토리라
    //    `readFileSync` 가 EISDIR 을 던진다. 흡수 집합에서 EISDIR 을 빼면 여기서 exit 2 가 된다
    //    (라운드 2 T1 이 실제로 그 상태였고, 라운드 3 U2 가 «되돌려도 아무 테스트도 안 잡는다» 를
    //    지적했다 — 이 케이스가 그 사각을 닫는다).
    const subDir = fs.mkdtempSync(path.join(os.tmpdir(), 'md-conflict-marker-sub-'));
    try {
      git(['init', '-q'], { cwd: subDir });
      git(['config', 'user.email', 'self-test@example.invalid'], { cwd: subDir });
      git(['config', 'user.name', 'self-test'], { cwd: subDir });
      git(['commit', '-q', '--allow-empty', '-m', 'init'], { cwd: subDir });
      git(['-c', 'protocol.file.allow=always', 'submodule', 'add', '-q', subDir, 'sub'], {
        cwd: dir,
      });
      git(['add', '-A'], { cwd: dir });
      const gl = runAllowFail();
      assert.equal(
        gl.code,
        0,
        `gitlink 보유 저장소가 exit ${gl.code} (EISDIR 흡수 회귀)\n${gl.out}`,
      );
    } finally {
      fs.rmSync(subDir, { recursive: true, force: true });
    }

    console.log(
      `${TAG} self-test(통합) — 3중 시뮬레이션 PASS (positive 1 / negative ${injections.length} / recovery 1 / gitlink 1)`,
    );
  } finally {
    fs.rmSync(dir, { recursive: true, force: true });
  }
}

function selfTest() {
  selfTestClassifier();
  selfTestPrettierE2E();
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
if (process.argv[1] && fs.realpathSync(process.argv[1]) === fs.realpathSync(SELF_PATH)) {
  try {
    process.exit(main());
  } catch (err) {
    console.error(`${TAG} 실행 에러: ${err.message}`);
    process.exit(2);
  }
}
