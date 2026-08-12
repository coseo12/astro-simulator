#!/usr/bin/env node
/**
 * verify-pr-base-rule.mjs
 *
 * #970 (#962 축 B 후속 F1) — **PR base 선택 규칙**의 기계 SSoT.
 *
 * 축 B (`verify-branch-name.mjs`) 가 CLAUDE.md §금지 사항의 **브랜치 *명명*** 절반을 강제했고,
 * 본 스크립트가 나머지 절반인 **base *선택***을 강제한다.
 *
 *   > `<type>/*`·`release/*-prep` PR 의 `base=main` 금지 —
 *   > `base=main` 은 release PR(head=develop)/hotfix 전용
 *
 * 계약 SSoT: docs/decisions/20260812-970-pr-base-rule-guard.md §5
 *
 * ── 축 B 와의 관계: 상수를 복제하지 않고 **판정기를 import 한다** ──────────────────
 * 브랜치 *종류* 판정에 필요한 리터럴 (`develop` / `main` / type 열거 / 봇 패턴) 은 전부
 * `verify-branch-name.mjs` 의 export 에서 가져온다. 봇 판정은 아예 그쪽 `classifyBranch`
 * 를 호출한다 — CLAUDE.md 가 "숨은 상수" 로 이름 붙인 drift 클래스를 구조적으로 배제한다.
 * 본 스크립트가 새로 정의하는 정본은 **`BASE_RULES` 매트릭스 하나뿐**이다.
 *
 * ── 세 소비처 + 로컬 ────────────────────────────────────────────────────────────
 *   --pr base=<ref> head=<ref>  → CI 런타임 검사 (.github/workflows/branch-name-guard.yml)
 *                                 로컬 pre-flight 도 동일 명령 (create-pr 스킬, PR 생성 전)
 *   --verify-ssot               → guide §base 선택 규칙 표 양방향 대조 (project-guards.yml)
 *   --self-test                 → 격리 픽스처 매트릭스 (project-guards.yml)
 *   --check-corpus <json>       → 머지 PR 전수 실측 (1회성 증거. CI 미배선 — 네트워크 의존)
 *
 * 종료 코드:
 *   0 — PASS
 *   1 — 위반 (base 선택 위반 / 판정 보류 **둘 다**. 아래 "판정 보류" 참조)
 *   2 — 실행 에러 (인자 오류 / 대상 파일 부재)
 *
 * ── 판정 3종과 "판정 보류" 의 정확한 의미 ───────────────────────────────────────
 * `pass` / `violation` / `unresolved` 3종이나, **종료 코드는 뒤 둘이 동일하게 1** 이다.
 * `unresolved` 는 fallback 이 아니다 — 통과로 흘리지 않으며(fail-closed), 다른 것은
 * **귀속과 교정 지시뿐**이다. 분리 근거는 §귀속 규칙 주석 참조. 이 분리가 없으면
 * head 이름만 고치면 되는 PR 에 "base 를 고쳐라" 는 **틀린 교정 지시**가 나간다.
 *
 * fail-fast 계약 (CLAUDE.md §가드 설계 원칙): 판정 불가·파일 부재·locator 미발견은
 * silent pass 로 흡수하지 않는다. fallback 분기 금지.
 *
 * 관련: 이슈 #970 / #962 / #971(required status check — 본 가드의 폭발 반경) /
 *       docs/lessons/guard-pr-dod.md (4축) / docs/lessons/guard-design-principles.md
 */
import { readFileSync, existsSync, realpathSync, mkdtempSync, symlinkSync, rmSync } from 'node:fs';
import { resolve, dirname, join } from 'node:path';
import { tmpdir } from 'node:os';
import { fileURLToPath } from 'node:url';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import process from 'node:process';

import { BRANCH_TYPES, HOTFIX_TYPE, GITFLOW_HEADS, classifyBranch } from './verify-branch-name.mjs';

const SCRIPT_PATH = fileURLToPath(import.meta.url);
const ROOT = resolve(dirname(SCRIPT_PATH), '..');

// =============================================================================
// shape 판정 — "이름이 규약에 맞는가" 가 아니라 "어떤 **종류**의 브랜치인가"
// =============================================================================

/**
 * base 규칙이 묻는 것은 브랜치 *이름의 적합성* 이 아니라 *종류* 다. 그래서 shape 는
 * 축 B 의 엄격 정규식(`RE_WORK` 등)이 아니라 **접두사 수준**으로 판정한다.
 *
 * 이 완화는 의도적이며 **관할 분리**의 핵심이다. 예: `fix/webgl-fallback` (이슈번호 없음)
 * 은 축 B 가 FAIL 시키지만 shape 는 `work` 이므로, 본 가드는 "base=develop 은 맞다,
 * 고칠 것은 이름뿐" 이라고 정확히 말할 수 있다. 여기서 엄격 정규식을 재사용하면 축 B 의
 * 판정을 **중복 재판**하게 되고, 교정 지시가 두 갈래로 갈라져 진단 품질이 떨어진다.
 *
 * 예외는 `bot` 하나 — 봇은 "종류" 가 아니라 **정체**라 정확 매칭이어야 한다.
 * `chore/` 로 시작하기만 하면 봇으로 쳐 주면 사람이 만든 `chore/970-x` 가 봇 특권
 * (임의 base) 을 얻는다. 그래서 축 B 의 `classifyBranch` 를 그대로 호출한다.
 *
 * 순서 의존: `bot` → `hotfix` → `work`. 봇 브랜치는 `chore/` 접두사라 `work` 보다 먼저
 * 걸러야 하고, `hotfix` 는 `BRANCH_TYPES` 에 없으므로 (축 B `HOTFIX_TYPE` 별도) 독립 행이다.
 */
const SHAPES = [
  { role: 'develop', test: (n) => n === GITFLOW_HEADS[0] },
  { role: 'main', test: (n) => n === GITFLOW_HEADS[1] },
  { role: 'bot', test: (n) => classifyBranch(n).rule === 'bot' },
  { role: 'hotfix', test: (n) => n.startsWith(`${HOTFIX_TYPE}/`) },
  { role: 'release', test: (n) => n.startsWith('release/') },
  { role: 'work', test: (n) => BRANCH_TYPES.some((t) => n.startsWith(`${t}/`)) },
];

/**
 * 브랜치 shape 판정. 순수 함수 — I/O 없음.
 * @param {string} name
 * @returns {'develop'|'main'|'bot'|'hotfix'|'release'|'work'|null} null = shape 불명
 */
export function branchShape(name) {
  if (typeof name !== 'string' || name.length === 0) return null;
  for (const { role, test } of SHAPES) {
    if (test(name)) return role;
  }
  return null;
}

// =============================================================================
// SSoT — 본 스크립트가 새로 정의하는 **유일한** 정본
// =============================================================================

/**
 * `base shape` → 허용되는 `head shape` 집합. CLAUDE.md §브랜치 전략 표의 "진입 경로" 열과
 * §금지 사항의 base 규칙을 기계로 옮긴 것이다.
 *
 * - `develop` ← `work`(일상 개발) / `release`(릴리스 준비) / `bot` / `main`(hotfix merge-back)
 * - `main`    ← `develop`(release PR) / `hotfix`(prod 긴급 패치)
 * - `work`    ← `bot` **전용**. 봇이 원 작업 브랜치를 base 로 여는 실사용 (아래 근거)
 *
 * **`work` 를 base 로 받는 행의 근거 (실측 2026-08-12, 머지 PR 594 전수)**:
 * base 가 `develop`·`main` 둘 다 아닌 PR 은 **17건**이며 **17/17 전부 `app/github-actions`
 * 가 연 `chore/r1-baseline-linux-<run_id>` PR** 이다 — 사람이 연 stacked PR 은 **0건**.
 * 원인은 구조적이다: `r1-baseline-bootstrap.yml` 이 `base: ${{ inputs.target_branch }}` 로
 * **`workflow_dispatch` 입력**을 그대로 쓰므로, 운영자가 원 작업 브랜치를 지정하면 그 브랜치가
 * base 가 된다 (baseline 을 그 PR 안에서 갱신하는 것이 목적이므로 develop 이면 안 된다).
 * 따라서 이 행은 "stacked PR 관행의 승인" 이 아니라 **봇 1종의 구조적 동작 수용**이다.
 * 사람 head 에는 열지 않으므로 `work → work` 는 계속 위반이다.
 *
 * **봇의 base 를 무제한으로 열지 않은 이유**: 실측 28건(= develop 11 + work 17) 이 전부
 * 이 두 shape 안에 있고, `target_branch` 는 dispatch 시점에 사람이 손으로 넣는 값이라
 * 오타·오지정이 표면화되는 편이 낫다. "봇이면 통과" 는 축 B 가 명시적으로 기각한
 * 한 클래스 통째 skip 과 같은 구조다.
 */
export const BASE_RULES = {
  develop: ['work', 'release', 'bot', 'main'],
  main: ['develop', 'hotfix'],
  work: ['bot'],
};

/** 판정 3종 (종료 코드는 violation·unresolved 둘 다 1 — 파일 상단 주석 참조) */
export const VERDICTS = ['pass', 'violation', 'unresolved'];

// =============================================================================
// 판정 — 순수 함수
// =============================================================================

/**
 * base × head 판정.
 *
 * ── 귀속 규칙 (`violation` vs `unresolved`) ─────────────────────────────────────
 * head shape 가 불명일 때 "어느 가드가 이 PR 을 막았는가" 를 정하는 기준은
 * **"무엇을 고쳐야 통과하는가"** 다. 자의적 배분이 아니라 각 base 의 허용 집합이
 * shape 불명을 받을 수 있는지에서 결정된다:
 *
 * - `base=develop` + shape 불명 → **unresolved (귀속: branch-name)**.
 *   develop 의 허용 집합은 `work` 를 포함하고, shape 불명 브랜치는 거의 예외 없이
 *   **이름만 규약에 맞추면 `work` 가 된다** (`architect/594-x` → `feature/594-x`).
 *   즉 head 이름만 고치면 base 변경 없이 통과하므로, 교정 지시는 축 B 것이 옳다.
 * - `base=main` + shape 불명 → **violation (확정)**.
 *   main 의 허용 head 는 `develop` **리터럴**과 `hotfix/` **접두사** 둘뿐이고, 둘 다
 *   이름 규약 적합성과 **무관하게** shape 만으로 판정된다. shape 불명 = 둘 다 아님이
 *   확정이므로, head 를 어떻게 고쳐도 `base=main` 은 틀렸다.
 * - `base` shape 불명 / 허용 base 밖 → **violation (확정)**. base 자체가 규칙 밖이다.
 *
 * @param {string} base
 * @param {string} head
 * @returns {{verdict: 'pass'|'violation'|'unresolved', baseShape: string|null, headShape: string|null, reason: string}}
 */
export function classifyPair(base, head) {
  const bs = branchShape(base);
  const hs = branchShape(head);

  if (bs === null || !Object.hasOwn(BASE_RULES, bs)) {
    return {
      verdict: 'violation',
      baseShape: bs,
      headShape: hs,
      reason:
        bs === null
          ? `base '${base}' 는 어떤 브랜치 shape 에도 해당하지 않습니다.`
          : `base 로 '${base}' (shape: ${bs}) 를 쓸 수 없습니다. base 가 될 수 있는 shape 는 ${Object.keys(BASE_RULES).join(' / ')} 뿐입니다.`,
    };
  }

  const allowed = BASE_RULES[bs];

  if (hs === null) {
    // 위 귀속 규칙 참조. develop 만 "이름을 고치면 통과할 수 있다" 가 성립한다.
    if (bs === 'develop') {
      return {
        verdict: 'unresolved',
        baseShape: bs,
        headShape: hs,
        reason:
          `head '${head}' 의 shape 를 판정할 수 없습니다 — 브랜치명 규약 위반입니다.\n` +
          `         base='${base}' 자체는 정정할 것이 없습니다. head 이름을 규약에 맞추면 그대로 통과합니다.\n` +
          `         관할: branch-name 가드 (scripts/verify-branch-name.mjs).`,
      };
    }
    return {
      verdict: 'violation',
      baseShape: bs,
      headShape: hs,
      reason:
        `head '${head}' 는 base='${base}' 가 받는 shape (${allowed.join(' / ')}) 중 어느 것도 아닙니다.\n` +
        `         이 판정은 head 이름의 규약 적합성과 **무관**합니다 — 허용 head 가 전부 shape 만으로 판정되기 때문입니다.`,
    };
  }

  if (allowed.includes(hs)) {
    return {
      verdict: 'pass',
      baseShape: bs,
      headShape: hs,
      reason: `${hs} → ${bs}`,
    };
  }

  return {
    verdict: 'violation',
    baseShape: bs,
    headShape: hs,
    reason: `head shape '${hs}' 는 base='${base}' (shape: ${bs}) 로 PR 을 열 수 없습니다. 허용: ${allowed.join(' / ')}.`,
  };
}

/** CI 어노테이션 / 로컬 출력 공통 — 허용 집합을 에러 메시지에 노출한다 */
function allowSummary() {
  return [
    `허용 집합 (정본: scripts/verify-pr-base-rule.mjs 의 BASE_RULES):`,
    `  base=develop  ← 일상 개발 <type>/* | release/* | 봇 | main(hotfix merge-back)`,
    `  base=main     ← develop(release PR) | hotfix/*`,
    `  base=<type>/* ← 봇 전용 (r1-baseline-bootstrap 의 workflow_dispatch target_branch)`,
    ``,
    `가장 흔한 오류: 일상 개발 PR 을 base=main 으로 여는 것 (dual PR — #942 gitflow 이전 관행).`,
    `교정: PR 의 base 브랜치를 develop 으로 바꾸면 됩니다 (PR 재생성 불요 — GitHub UI 의 Edit).`,
    `상세: docs/guides/branch-strategy-workflow.md §base 선택 규칙`,
  ].join('\n');
}

// =============================================================================
// --pr base=<ref> head=<ref> — CI 런타임 검사 + 로컬 pre-flight
// =============================================================================

/**
 * **라벨 필수 인자**. 위치 인자 2개 (`--pr <base> <head>`) 를 쓰지 않는 이유:
 * 순서를 뒤바꾸면 `develop→main` (release PR) 과 `main→develop` (merge-back) 이 **둘 다
 * 허용 셀**이라 스왑이 판정에 아무 흔적을 남기지 않는다 — 최고 위험 경로에서 정확히
 * **조용한 오답**이 된다. 라벨을 요구하면 스왑이 구조적으로 불가능하다.
 * 순서는 무관하며 (`head=` 를 먼저 써도 된다), 중복·누락은 exit 2 로 거부한다.
 */
function parsePrArgs(args) {
  const got = {};
  for (const raw of args) {
    const at = raw.indexOf('=');
    if (at === -1) {
      return { error: `인자 '${raw}' 에 '=' 가 없습니다. 형태: base=<ref> head=<ref>` };
    }
    const label = raw.slice(0, at);
    const value = raw.slice(at + 1);
    if (label !== 'base' && label !== 'head') {
      return { error: `알 수 없는 라벨 '${label}'. 'base' 또는 'head' 여야 합니다.` };
    }
    if (Object.hasOwn(got, label)) {
      return { error: `라벨 '${label}' 이 중복됐습니다.` };
    }
    got[label] = value;
  }
  if (!Object.hasOwn(got, 'base') || !Object.hasOwn(got, 'head')) {
    return { error: `'base=' 와 'head=' 를 둘 다 지정해야 합니다.` };
  }
  return { base: got.base, head: got.head };
}

function runPrCheck(args) {
  const parsed = parsePrArgs(args);
  if (parsed.error) {
    console.error(`[ERROR] ${parsed.error}`);
    console.error(USAGE);
    return 2;
  }
  const { base, head } = parsed;
  const { verdict, reason } = classifyPair(base, head);

  if (verdict === 'pass') {
    console.log(`[PASS] base='${base}' ← head='${head}'  (${reason})`);
    return 0;
  }

  const title =
    verdict === 'violation' ? 'PR base 선택 규칙 위반 (#970)' : 'head 브랜치명 규약 위반 (#962)';
  const body =
    verdict === 'violation'
      ? `base='${base}' ← head='${head}' 는 허용되지 않습니다.\n\n${reason}\n\n${allowSummary()}`
      : `base='${base}' ← head='${head}' 는 base 규칙으로 판정할 수 없습니다.\n\n${reason}`;

  // GitHub Actions 어노테이션 — 멀티라인은 %0A 로 인코딩해야 한 줄로 접히지 않는다.
  console.log(`::error title=${title}::${body.replace(/\n/g, '%0A')}`);
  console.error(`[FAIL] ${body}`);
  return 1;
}

// =============================================================================
// --verify-ssot — guide §base 선택 규칙 표 양방향 대조
// =============================================================================

/**
 * 산문 사본 검증. 축 B 의 guide 표 검사와 **같은 기법** — 별도 파서를 만들지 않고
 * **런타임 판정기 자신**(`classifyPair` / `branchShape`)을 표의 셀에 돌린다.
 *
 * 양방향:
 *   (→) 표의 각 행이 선언한 base shape 가 `BASE_RULES` 의 키로 실재하는가
 *   (←) `BASE_RULES` 의 모든 키가 표에 **정확히 한 행씩** 등장하는가
 * 한 방향만 검사하면 정본에 base shape 를 추가했을 때 표가 조용히 뒤처진다.
 *
 * locator 미발견 / 행 부재 / 예시 토큰 부족은 전부 즉시 FAIL — fallback 없음.
 */
const GUIDE_TABLE = {
  path: 'docs/guides/branch-strategy-workflow.md',
  locator: '### base 선택 규칙',
  rows: ['1', '2', '3'],
};

function verifyGuideTable() {
  const { path, locator, rows } = GUIDE_TABLE;
  const abs = resolve(ROOT, path);
  if (!existsSync(abs)) return [{ ok: false, msg: `대상 파일 부재: ${path}` }];

  const lines = readFileSync(abs, 'utf8').split('\n');
  const start = lines.findIndex((l) => l.includes(locator));
  if (start === -1) {
    return [
      {
        ok: false,
        msg:
          `locator 미발견: ${path} 에 고정 문자열 "${locator}" 가 없습니다.\n` +
          `         표를 옮기거나 제목을 바꿨다면 GUIDE_TABLE 도 함께 갱신해야 합니다.`,
      },
    ];
  }

  const out = [];
  const seenBaseShapes = [];

  for (const n of rows) {
    const idx = lines.findIndex((l, i) => i > start && l.startsWith(`| ${n} |`));
    if (idx === -1) {
      out.push({ ok: false, msg: `${path} §base 선택 규칙 표에 ${n}행이 없습니다.` });
      continue;
    }
    // 마크다운 표 셀: ['', '#', 'base', '허용 head', '예 (head → base)', '비고', '']
    const cells = lines[idx].split('|').map((c) => c.trim());
    const example = [...`${cells[4] ?? ''}`.matchAll(/`([^`]+)`/g)].map((m) => m[1]);

    if (example.length !== 2) {
      out.push({
        ok: false,
        msg:
          `${path}:${idx + 1} — ${n}행 '예' 열의 백틱 토큰이 ${example.length}개입니다 (기대 2: head → base).\n` +
          `         대조 가능한 구체 예시가 없으면 표만 남고 검증은 사라집니다 (fail-fast).`,
      });
      continue;
    }

    const [exHead, exBase] = example;
    const { verdict, baseShape: bs, reason } = classifyPair(exBase, exHead);
    if (verdict !== 'pass') {
      out.push({
        ok: false,
        msg:
          `${path}:${idx + 1} — ${n}행 예시 '${exHead}' → '${exBase}' 가 판정기에서 ${verdict} 입니다.\n` +
          `         ${reason}\n` +
          `         정본 BASE_RULES 를 바꿨다면 표의 예시도 함께 갱신해야 합니다.`,
      });
      continue;
    }

    // (→) 행이 선언한 base shape 가 정본 키로 실재하는가
    const declared = [...`${cells[2] ?? ''}`.matchAll(/`([^`]+)`/g)].map((m) => m[1]);
    if (declared.length === 0) {
      out.push({ ok: false, msg: `${path}:${idx + 1} — ${n}행 'base' 열에 백틱 토큰이 없습니다.` });
      continue;
    }
    seenBaseShapes.push(bs);
    out.push({
      ok: true,
      msg: `${path}:${idx + 1} — ${n}행 [base ${declared.join(' ')}] 예시 '${exHead}' → '${exBase}' pass (shape: ${bs})`,
    });
  }

  // (←) 정본의 모든 키가 표에 정확히 한 행씩 등장하는가
  const want = Object.keys(BASE_RULES).sort();
  const got = [...seenBaseShapes].sort();
  if (want.join(',') !== got.join(',')) {
    out.push({
      ok: false,
      msg:
        `${path} §base 선택 규칙 표가 정본 BASE_RULES 를 전부 덮지 않습니다.\n` +
        `         표 (예시 base 의 shape): [${got.join(', ')}]\n` +
        `         정본 (BASE_RULES 키)   : [${want.join(', ')}]\n` +
        `         → base shape 를 추가·제거했다면 표에도 행을 추가·제거하세요.`,
    });
  } else {
    out.push({ ok: true, msg: `표 ↔ BASE_RULES 양방향 일치 — [${got.join(', ')}]` });
  }

  return out;
}

function runVerifySsot() {
  let failed = 0;
  console.log('verify-pr-base-rule --verify-ssot');
  console.log(`  정본 BASE_RULES:`);
  for (const [b, heads] of Object.entries(BASE_RULES)) {
    console.log(`    base=${b.padEnd(8)} ← ${heads.join(' | ')}`);
  }
  console.log('');

  for (const { ok, msg } of verifyGuideTable()) {
    if (ok) {
      console.log(`  [PASS] ${msg}`);
    } else {
      console.error(`  [FAIL] ${msg}`);
      failed++;
    }
  }

  console.log(`\n--verify-ssot: ${failed === 0 ? 'PASS' : `FAIL (${failed}건)`}`);
  return failed === 0 ? 0 : 1;
}

// =============================================================================
// --self-test — 격리 픽스처 매트릭스 (가드 도입 PR DoD 축 1)
// =============================================================================

/**
 * `[base, head, 기대 verdict, 설명]`.
 *
 * **최고 리스크 4종을 맨 앞에 고정한다.** 본 가드는 `branch-name` job 에 배선되고
 * 그 job 은 `main` 의 **required status check** 이며 `enforce_admins: true` 다 (#971 Phase 1).
 * 즉 아래 4셀에서 오차단이 나면 **릴리스·핫픽스가 하드 블록**되고 우회로가 없다
 * (탈출구는 #971 §9-R1 롤백 1줄뿐). 이 셀들은 실환경 negative 실증이 불가능하므로
 * (release PR 을 일회용으로 만들 수 없다) 픽스처가 유일한 상시 방어선이다.
 */
const FIXTURES = [
  // --- 최고 리스크 4종 (오차단 시 릴리스/핫픽스 하드 블록) ---
  ['main', 'develop', 'pass', '최고 리스크 — release PR (실측 65건)'],
  ['develop', 'main', 'pass', '최고 리스크 — hotfix merge-back'],
  ['main', 'hotfix/970-critical', 'pass', '최고 리스크 — hotfix PR'],
  ['develop', 'release/0.67.0-prep', 'pass', '최고 리스크 — 릴리스 준비 (실측 42건)'],
  // --- 일상 경로 ---
  ['develop', 'feature/970-pr-base-rule-guard', 'pass', '본 PR 자신 (메타 측정 자기 적용)'],
  ['develop', 'fix/952-format-backstop', 'pass', 'fix'],
  ['develop', 'docs/942-branch-convention', 'pass', 'docs'],
  ['develop', 'chore/933-verify-rest-finally', 'pass', 'chore'],
  ['develop', 'test/943-selector-static-guard', 'pass', 'test'],
  ['develop', 'refactor/850-phase1-core-tail', 'pass', 'refactor'],
  ['develop', 'release/v0.53.0-prep', 'pass', '릴리스 v 접두 (표기 진동 수용)'],
  ['develop', 'release/v0.28.0', 'pass', '-prep 없음 — 이름은 축 B 위반이나 base 는 정상'],
  ['develop', 'fix/webgl-fallback', 'pass', '이슈번호 없음 — 동상 (관할 분리 실증)'],
  // --- 봇 (오차단 시 자동화 파손) ---
  ['develop', 'chore/r1-baseline-linux-30725438161', 'pass', '봇 → develop (실측 11건)'],
  ['develop', 'chore/baseline-remeasure-24846477523', 'pass', '봇 remeasure → develop'],
  [
    'feature/532-r4-earth-moon-impl',
    'chore/r1-baseline-linux-26201980306',
    'pass',
    '봇 → 원 작업 브랜치 (실측 17건)',
  ],
  [
    'fix/887-css-reset-layer',
    'chore/r1-baseline-linux-30725438161',
    'pass',
    '봇 → fix 브랜치 (실측)',
  ],
  // --- violation: dual PR (이슈 #970 의 85건 클래스) ---
  ['main', 'feature/970-x', 'violation', 'dual PR — 일상 개발이 base=main (실측 50건)'],
  ['main', 'docs/970-x', 'violation', 'dual PR — DoD 2 의 live negative 와 동일 셀'],
  ['main', 'fix/887-css-reset-layer', 'violation', 'dual PR — fix'],
  ['main', 'release/0.67.0-prep', 'violation', '릴리스 준비는 develop 경유 (head=develop 만 main)'],
  ['main', 'chore/r1-baseline-linux-30725438161', 'violation', '봇도 main 은 못 연다'],
  [
    'main',
    'architect/594-r5-mars-adr',
    'violation',
    'shape 불명 + base=main → 확정 위반 (실측 35건 클래스)',
  ],
  // --- violation: 사람 stacked (실사용 0건) ---
  ['feature/970-x', 'feature/971-y', 'violation', '사람 stacked — 실측 0건이므로 금지'],
  ['fix/887-css-reset-layer', 'docs/970-x', 'violation', '사람 stacked (type 교차)'],
  ['feature/970-x', 'develop', 'violation', 'develop 을 작업 브랜치로 머지'],
  // --- violation: 역방향 / 자기참조 ---
  ['develop', 'hotfix/970-critical', 'violation', 'hotfix 는 main 으로 (merge-back 은 head=main)'],
  ['main', 'main', 'violation', '자기참조'],
  ['develop', 'develop', 'violation', '자기참조'],
  // --- violation: base 자체가 규칙 밖 ---
  ['release/0.67.0-prep', 'feature/970-x', 'violation', 'release 브랜치는 base 가 될 수 없다'],
  ['hotfix/970-critical', 'feature/970-x', 'violation', 'hotfix 브랜치는 base 가 될 수 없다'],
  ['chore/r1-baseline-linux-1', 'feature/970-x', 'violation', '봇 브랜치는 base 가 될 수 없다'],
  ['architect/594-x', 'feature/970-x', 'violation', 'shape 불명 base'],
  // --- unresolved: 귀속이 branch-name 인 셀 ---
  ['develop', 'architect/594-r5-mars-adr', 'unresolved', '#942 폐기 접두사 → develop (실측 11건)'],
  [
    'develop',
    'dev/404-scenario-presets-impl',
    'unresolved',
    '#942 폐기 접두사 → develop (실측 2건)',
  ],
  ['develop', 'my-branch', 'unresolved', '슬래시 없는 임의 이름'],
  // --- 입력 위생 ---
  ['develop', '', 'unresolved', 'head 빈 문자열 (shape 불명 → develop 귀속 규칙 적용)'],
  ['', 'feature/970-x', 'violation', 'base 빈 문자열'],
  ['main', 'develop\nfeature/970-x', 'violation', '개행 주입 — 리터럴 비교라 develop 이 아니다'],
  ['main', ' develop', 'violation', '선행 공백 (미trim 입력)'],
  ['main', 'Develop', 'violation', '대문자 — gitflow 리터럴 오탐 방지'],
  ['develop', 'main-backup', 'unresolved', 'gitflow 유사 이름은 main 이 아니다'],
  ['develop2', 'feature/970-x', 'violation', 'gitflow 접미 base'],
];

function runSelfTest() {
  console.log('self-test: verify-pr-base-rule.mjs (격리 픽스처)\n');
  let pass = 0;
  let fail = 0;
  for (const [base, head, expected, note] of FIXTURES) {
    const { verdict } = classifyPair(base, head);
    const display = `${JSON.stringify(head)} → ${JSON.stringify(base)}`;
    if (verdict === expected) {
      pass++;
      console.log(`  [OK]   ${expected.padEnd(10)} ${display} — ${note}`);
    } else {
      fail++;
      console.error(`  [MISS] 기대 ${expected} / 실제 ${verdict} ${display} — ${note}`);
    }
  }

  // 정본 자체의 무결성 (규약 축소·오타 회귀 차단)
  const relCell = classifyPair('main', 'develop').verdict === 'pass';
  const backCell = classifyPair('develop', 'main').verdict === 'pass';
  const hotCell = classifyPair('main', 'hotfix/1-x').verdict === 'pass';
  const invariants = [
    ['릴리스 셀 develop→main 통과 (required check — 막히면 릴리스 하드 블록)', relCell],
    ['merge-back 셀 main→develop 통과', backCell],
    ['hotfix 셀 hotfix/*→main 통과', hotCell],
    [
      'BASE_RULES 키 == [develop, main, work]',
      Object.keys(BASE_RULES).sort().join(',') === 'develop,main,work',
    ],
    [
      'base=main 허용 head 는 develop·hotfix 뿐',
      BASE_RULES.main.slice().sort().join(',') === 'develop,hotfix',
    ],
    ['base=<work> 는 봇 전용 (사람 stacked 금지)', BASE_RULES.work.join(',') === 'bot'],
    ['일상 개발의 base=main 은 위반', classifyPair('main', 'feature/1-x').verdict === 'violation'],
    ['픽스처 30 케이스 이상', FIXTURES.length >= 30],
    ['픽스처가 3 verdict 를 모두 포함', VERDICTS.every((v) => FIXTURES.some(([, , e]) => e === v))],
  ];
  console.log('');
  for (const [label, ok] of invariants) {
    if (ok) {
      pass++;
      console.log(`  [OK]   불변식 — ${label}`);
    } else {
      fail++;
      console.error(`  [MISS] 불변식 — ${label}`);
    }
  }

  // --- DoD 4 (이슈 명시): 가드 자신이 silent skip 가능한지 자기 적용 검사 ---
  // 축 B 가 실측으로 발견한 3종 (진입점 realpath / 모드 플래그가 값으로 위장 / 두 모드 병합)
  // 에 본 가드 고유의 4종째 (라벨 스왑·중복·누락) 를 더한다.
  if (IS_PROBE_CHILD) {
    // 프로브가 띄운 자식이다 (재진입 가드 — 무한 재귀 차단).
    // **skip 이 아니라 fail** 이다: `PROBE_ENV` 가 CI env 로 누출되면 최상위 실행이 이 분기를
    // 타서 프로브 전건이 통째로 사라진 채 exit 0 초록이 된다 (축 B reviewer 2차 🟡1 과 동형).
    fail++;
    console.error(
      `  [MISS] 자식 프로세스 프로브 — 최상위 실행인데 ${PROBE_ENV}=1 이다 (env 누출 시 프로브 소실)`,
    );
  } else {
    const probes = [probeSymlinkedInvocation(), ...probeArgvParsing()];
    for (const p of probes) {
      if (p.ok) {
        pass++;
        console.log(`  [OK]   자기 적용 — ${p.detail}`);
      } else {
        fail++;
        console.error(`  [MISS] 자기 적용 — ${p.detail}`);
      }
    }
  }

  console.log(`\nself-test: ${pass} passed, ${fail} failed (픽스처 ${FIXTURES.length}건)`);
  // 축 3 (5 페르소나 self-consistency) 대조용 3-tuple — 각 페르소나가 계산하지 않고 이 줄을 읽는다.
  console.log(
    `self-consistency 3-tuple (총 검사, PASS, 비-pass 픽스처 지문) = (${pass + fail}, ${pass}, ${nonPassFixtureFingerprint()})`,
  );
  return fail === 0 ? 0 : 1;
}

/**
 * 페르소나 간 self-consistency 대조 지문 (DoD 축 3).
 *
 * **직렬화 규약** (명시하지 않으면 셀 값이 재현 불가능해 축 3 의 증거력이 사라진다 — 축 B 전례):
 *   1. `pass` 가 아닌 픽스처만 취한다 (violation + unresolved).
 *   2. `JSON.stringify([base, head, expected])` 로 인용한다 — 빈 문자열·개행 주입·선행 공백
 *      케이스가 구분 가능해야 한다.
 *   3. 기본 `Array#sort` (UTF-16 코드유닛 오름차순).
 *   4. `'\n'` join → SHA-256 → hex 앞 12자.
 *
 * 다섯 페르소나는 이 값을 **직접 계산하지 않고 `--self-test` 출력에서 읽는다**.
 */
export function nonPassFixtureFingerprint() {
  const quoted = FIXTURES.filter(([, , e]) => e !== 'pass').map(([b, h, e]) =>
    JSON.stringify([b, h, e]),
  );
  quoted.sort();
  return createHash('sha256').update(quoted.join('\n')).digest('hex').slice(0, 12);
}

const PROBE_ENV = 'VERIFY_PR_BASE_RULE_PROBE';
const IS_PROBE_CHILD = process.env[PROBE_ENV] === '1';
const PROBE_SPAWN_OPTS = {
  encoding: 'utf8',
  timeout: 30_000,
  env: { ...process.env, [PROBE_ENV]: '1' },
};

/**
 * 심링크된 경로로 본 스크립트를 자식 프로세스로 실행해, 위반 입력에 대해 정말로
 * exit 1 + 진단 출력을 내는지 확인한다 (진입점 silent no-op 회귀 차단 — 축 B 실측 재현).
 */
function probeSymlinkedInvocation() {
  const dir = mkdtempSync(join(tmpdir(), 'verify-pr-base-rule-link-'));
  const link = join(dir, 'linked-verify-pr-base-rule.mjs');
  try {
    symlinkSync(SCRIPT_PATH, link);
    const r = spawnSync(
      process.execPath,
      [link, '--pr', 'base=main', 'head=feature/970-x'],
      PROBE_SPAWN_OPTS,
    );
    const emitted = `${r.stdout ?? ''}${r.stderr ?? ''}`.trim();
    if (r.status === 1 && emitted.includes('허용되지 않습니다')) {
      return {
        ok: true,
        detail: '심링크 경로 직접 실행 — exit 1 + 진단 출력 확인 (silent skip 없음)',
      };
    }
    return {
      ok: false,
      detail:
        `심링크 경로 직접 실행이 no-op — exit=${r.status}, 출력 ${emitted.length}자. ` +
        `진입점 가드가 realpath 를 정규화하지 않으면 가드 전체가 조용히 통과한다.`,
    };
  } catch (e) {
    return { ok: false, detail: `심링크 프로브 실패: ${e.message}` };
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

/**
 * CLI 인자 파싱 회귀 — **자식 프로세스여야 한다**. 같은 프로세스에서 `classifyPair` 를
 * 직접 부르면 순수 함수는 언제나 정상이라 `main()` 의 파싱 순서라는 실제 결함 지점을
 * 전혀 건드리지 못한다 (축 B reviewer B1 교훈).
 */
function probeArgvParsing() {
  const cases = [
    {
      args: ['--pr', 'base=main', 'head=--self-test'],
      status: 1,
      text: '허용되지 않습니다',
      label: "head 값이 '--self-test' 여도 모드가 가로채이지 않고 base 검사가 돈다",
    },
    {
      args: ['--pr', 'base=main', 'head=feature/970-x', '--self-test'],
      status: 2,
      text: '잉여 인자',
      label: '두 모드 병합 호출 — 한쪽을 조용히 버리지 않고 exit 2 로 거부',
    },
    {
      args: ['--pr', 'base=main', 'base=develop'],
      status: 2,
      text: '중복',
      label: '라벨 중복 — 조용히 뒤 값으로 덮어쓰지 않고 exit 2',
    },
    {
      args: ['--pr', 'develop', 'main'],
      status: 2,
      text: "'=' 가 없습니다",
      label: '위치 인자 거부 — base/head 스왑이 구조적으로 불가능하다',
    },
    {
      args: ['--pr', 'head=feature/970-x'],
      status: 2,
      text: '둘 다 지정',
      label: 'base 누락 — 기본값으로 흘리지 않고 exit 2',
    },
    {
      args: ['--pr'],
      status: 2,
      text: '둘 다 지정',
      label: '인자 0개 — exit 2 (인자 없는 호출이 통과가 되지 않는다)',
    },
    {
      args: ['--constructor'],
      status: 2,
      text: '알 수 없는 인자',
      label: '프로토타입 오염 시도 — Object.hasOwn 으로 모드 조회를 자기 소유 키에 한정',
    },
  ];
  return cases.map((c) => {
    const r = spawnSync(process.execPath, [SCRIPT_PATH, ...c.args], PROBE_SPAWN_OPTS);
    const emitted = `${r.stdout ?? ''}${r.stderr ?? ''}`;
    const ok = r.status === c.status && emitted.includes(c.text);
    return {
      ok,
      detail: ok
        ? c.label
        : `${c.label} — 기대 exit ${c.status} + "${c.text}", 실제 exit ${r.status} / 출력 ${emitted.trim().length}자`,
    };
  });
}

// =============================================================================
// --check-corpus <json> — 머지 PR 전수 실측 (1회성 증거, CI 미배선)
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
    rows = JSON.parse(readFileSync(jsonPath, 'utf8'));
  } catch (e) {
    console.error(`[ERROR] JSON 파싱 실패: ${e.message}`);
    return 2;
  }
  if (!Array.isArray(rows)) {
    console.error('[ERROR] 코퍼스는 gh pr list --json 배열이어야 합니다.');
    return 2;
  }

  const buckets = { pass: [], violation: [], unresolved: [] };
  const cells = new Map();
  for (const r of rows) {
    const { verdict, baseShape: bs, headShape: hs } = classifyPair(r.baseRefName, r.headRefName);
    buckets[verdict].push(r);
    const key = `${hs ?? '(shape 불명)'} → ${bs ?? '(shape 불명)'}`;
    if (!cells.has(key)) cells.set(key, { verdict, rows: [] });
    cells.get(key).rows.push(r);
  }

  const span = (list) => {
    if (list.length === 0) return '—';
    const d = list.map((r) => (r.mergedAt ?? '').slice(0, 10)).sort();
    return `${d[0]} ~ ${d[d.length - 1]}`;
  };

  console.log(`--check-corpus: ${jsonPath}`);
  console.log(
    `  전체 ${rows.length}  PASS ${buckets.pass.length}  ` +
      `base 규칙 위반 ${buckets.violation.length}  판정 보류 ${buckets.unresolved.length}\n`,
  );
  console.log('  셀 분해 (head shape → base shape):');
  for (const [key, v] of [...cells.entries()].sort((a, b) => b[1].rows.length - a[1].rows.length)) {
    console.log(
      `    ${v.verdict.padEnd(10)} ${key.padEnd(34)} ${String(v.rows.length).padStart(4)}   ${span(v.rows)}`,
    );
  }

  console.log('\n  base 규칙 위반 (본 가드 관할):');
  console.log(`    건수 ${buckets.violation.length}   머지 시점 ${span(buckets.violation)}`);
  console.log('  판정 보류 (귀속: branch-name / #962):');
  console.log(`    건수 ${buckets.unresolved.length}   머지 시점 ${span(buckets.unresolved)}`);

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
  'usage: verify-pr-base-rule.mjs (--pr base=<ref> head=<ref> | --verify-ssot | --self-test | --check-corpus <json>)';

/**
 * 모드별 기대 인자 개수 (모드 플래그 자신 포함). 초과분은 즉시 거부한다 — 두 모드를 한
 * 호출로 합치면 한쪽 검사가 **조용히 무시**되기 때문이다 (축 B reviewer B1 실측).
 * 조회는 반드시 `Object.hasOwn` — `'constructor' in {}` 는 true 라 단순 `in` 검사는
 * 임의 문자열을 모드로 통과시킨다.
 */
const MODE_ARITY = { '--self-test': 1, '--verify-ssot': 1, '--pr': 3, '--check-corpus': 2 };

/**
 * CLI — **모드는 `args[0]` 로만 판정한다.** `args.includes(...)` 로 배열 전체를 훑으면
 * 모드 플래그가 값으로 왔을 때 (`head=--self-test`) 본 검사가 통째로 건너뛰어지고 exit 0
 * 이 난다 (축 B B1 결함과 동일 클래스). 회귀 가드는 `--self-test` 의 인자 파싱 프로브 7건.
 *
 * **인자 없는 호출은 지원하지 않는다.** 축 B 는 현재 브랜치로 pre-flight 가 가능했지만
 * base 는 로컬 상태에서 도출할 수 없다 — 추측하면 그것이 곧 fallback 이다. exit 2.
 */
function main(argv) {
  const args = argv.slice(2);
  const mode = args[0];

  if (mode === undefined) {
    console.error(
      '[ERROR] 인자가 필요합니다. base 는 로컬 상태에서 도출할 수 없으므로 추측하지 않습니다.',
    );
    console.error(USAGE);
    return 2;
  }

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
        `        합치면 한쪽 검사가 조용히 무시되므로, CI 스텝을 나눠 각각 호출하세요.`,
    );
    console.error(USAGE);
    return 2;
  }

  switch (mode) {
    case '--self-test':
      return runSelfTest();
    case '--verify-ssot':
      return runVerifySsot();
    case '--check-corpus':
      return runCheckCorpus(args[1]);
    case '--pr':
      return runPrCheck(args.slice(1));
    default:
      // MODE_ARITY 를 통과했는데 여기 도달 = 모드 테이블과 분기의 drift. 조용히 통과시키지 않는다.
      console.error(
        `[ERROR] 내부 오류: 모드 '${mode}' 에 대응하는 분기가 없습니다 (MODE_ARITY drift).`,
      );
      return 2;
  }
}

/**
 * 진입점 가드 — import 시 CLI 가 돌지 않게 하되, **직접 실행이 조용히 스킵되지 않게** 한다.
 *
 * 순진한 `import.meta.url === pathToFileURL(process.argv[1]).href` 비교는 호출 경로와
 * realpath 가 다를 때 (macOS `/tmp` → `/private/tmp`, 심링크된 체크아웃) **거짓이 되어
 * 스크립트 전체가 no-op exit 0** 이 된다 — 축 B 가 격리 픽스처로 실제 재현한 결함이다.
 * 따라서 argv[1] 을 realpath 로 정규화해 비교한다. 회귀 가드: `--self-test` 심링크 프로브.
 *
 * `catch` 는 **fail-loud** 다 — realpath 실패는 정상 경로가 아니므로 직접 실행으로 간주해
 * 판정을 강행한다. 가드가 조용히 사라지는 쪽보다 오발화가 언제나 낫다.
 */
function isDirectRun() {
  if (!process.argv[1]) return false;
  try {
    return realpathSync(process.argv[1]) === realpathSync(SCRIPT_PATH);
  } catch (e) {
    console.error(
      `[WARN] 진입점 realpath 정규화 실패 (${e.message}) — 직접 실행으로 간주하고 판정을 강행합니다.\n` +
        `       조용한 스킵(exit 0)은 본 가드가 금지하는 실패 모드이므로 fail-loud 로 처리합니다.`,
    );
    return true;
  }
}

if (isDirectRun()) {
  process.exit(main(process.argv));
}
