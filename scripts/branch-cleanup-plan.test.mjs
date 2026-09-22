#!/usr/bin/env node
/**
 * #1247 — `branch-cleanup-plan.mjs` 회귀 가드 (F3 판별력 실증 + F4 fail-closed).
 *
 * stand-alone node 테스트 (`stage-label-decision.test.mjs` / `bench-judge.test.mjs` 선례 계승 —
 * 루트 `scripts/` 는 vitest workspace 밖이라 워크플로가 직접 실행한다).
 * 배선: `branch-cleanup.yml` 사용 직전 self-test + `ci.yml detect-and-test` 상시 이중화
 * (#897 교훈 — CI 미배선 self-test 는 0회 실행).
 *
 * ## 왜 워크플로 YAML 안의 인라인 셸이 아니라 스크립트인가
 *
 * 삭제는 되돌리기 어렵고, 판정 술어는 **주입 없이는 검증되지 않는다**. YAML 인라인 셸은 그
 * 주입 지점을 만들 수 없어서 「돌려봤더니 지울 게 없더라」 이상의 증거를 못 만든다. 순수 함수로
 * 빼면 아래처럼 **결함 판본을 실제로 만들어** 테스트가 갈라내는지 볼 수 있다.
 *
 * ## 변이 ↔ 테스트 대응 (전건 사살. dev 가 실제 주입해 **측정한 값**이고 재현 로그는 PR 본문)
 *
 *   M1  열린 PR 검사 삭제 (`e.open.length > 0` 분기 제거)              → U2, U12, U17, U19
 *   M2  `alwaysKeep` 검사 삭제                                         → U3
 *   M3  「PR 표본이 비었다」 치명 검사 삭제                              → U8, U15
 *   M4  상태 미상(`unknown`)을 닫힌 PR 처럼 무시                         → U7
 *   M5  `expectedPrCount` 페이지네이션 검사 삭제                         → U9
 *   M6  보호 브랜치 검사 삭제                                           → U4
 *   M7  fork `merged` 를 삭제 근거로 인정 (`sameRepo` 조건 제거)         → U12, U17
 *   M8  치명 시 `del` 을 비우지 않음 (`fatal ? [] : del` → `del`)       → U9, U13, U20
 *   M9  머지 시점 sha 대조 제거 (일치 조건 → `true`)                    → U16, U17
 *   M10 기대 총계의 `n >= 1` 완화 (`Number.isInteger` 만)               → U18
 *   M11 head 결손의 상태 구분 제거 — 전건 **비**치명화 (`status === PR_CLOSED` → `true`)
 *                                                                      → U13, U20
 *   M12 면제 자체를 제거 — 전건 **치명**화 (구판 복귀)                   → U19
 *
 * ⚠️ 초판은 이 표를 「전건 **단독** 사살」로 적었고 **주입해 보니 절반이 틀렸다**. 실제 값이 위
 * 표이며, 특히 **M8 을 U8 이 잡지 못한다** — U8 의 표본은 PR 이 0 건이라 삭제 후보 자체가 생기지
 * 않아 `del` 이 변이 여부와 무관하게 `[]` 다. 「전량 폐기」 성질을 재는 것은 삭제 후보가 **있는**
 * 치명 표본(U9 의 `suppressed === 1` / U13 의 귀속 불가 PR)뿐이다.
 *
 * ⚠️ **M9·M10 추가 시 M1~M8 을 재측정했고 M1·M7 의 값이 바뀌었다** (각각 `U2,U12` → `U2,U12,U17`
 * / `U12` → `U12,U17`). U17 이 fork·열린 PR 하위 케이스를 함께 재기 때문이다. **변이표는 테스트가
 * 늘면 stale 해진다** — 표를 손으로 고치지 말고 전건 재주입해 나온 값을 적을 것.
 *
 * ⚠️ **M11·M12 추가 시 M1~M10 을 다시 전건 재주입했고 M1·M8 의 값이 또 바뀌었다** (각각
 * `U2,U12,U17` → `+U19` / `U9,U13` → `+U20`). 위 경고가 **두 번째로 실현된 것**이고, 이번에도
 * 손으로 고쳤다면 표가 실제보다 좁게 남았을 것이다. M11·M12 는 **서로 반대 방향**이라 둘 다
 * 필요하다 — M11(전건 비치명화)은 `unknown` 이 면제로 새는 회귀, M12(전건 치명화)는 구판 복귀다.
 */

import assert from 'node:assert/strict';

import {
  ALWAYS_KEEP,
  PR_CLOSED,
  PR_MERGED,
  PR_OPEN,
  PR_UNKNOWN,
  normalizeBranch,
  normalizePullRequest,
  parseExpectedPrCount,
  planBranchCleanup,
  renderPlan,
} from './branch-cleanup-plan.mjs';

let passed = 0;
const run = (name, fn) => {
  try {
    fn();
    passed += 1;
    console.log(`  ✓ ${name}`);
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

const SHA_A = 'a'.repeat(40);
const SHA_B = 'b'.repeat(40);
const SHA_C = 'c'.repeat(40);

const br = (name, over = {}) => ({ name, sha: SHA_A, protected: false, ...over });
/**
 * `headSha` 기본값은 `br()` 의 `sha` 기본값과 **같은 SHA_A** 다 — 즉 기본 표본은 「머지 시점 그대로」
 * 이고, 브랜치 sha 를 바꾸는 케이스는 PR 의 `headSha` 도 함께 지정해야 삭제 대상이 된다.
 */
const pr = (number, headRefName, status, over = {}) => ({
  number,
  headRefName,
  status,
  sameRepo: true,
  headSha: SHA_A,
  ...over,
});

/** 기본 표본 — 치명 조건(빈 표본)을 피하려고 최소 1건의 PR 을 늘 둔다. */
const basePrs = [pr(1, 'feature/1-old', PR_MERGED)];
const names = (list) => list.map((x) => x.name).sort();

// ── F3 (a) 머지된 브랜치를 실제로 잡는가 ──────────────────────────────────────
run('U1 머지된 PR 의 head 브랜치는 삭제 목록에 들어간다 (sha·PR 번호 동반)', () => {
  const plan = planBranchCleanup({
    branches: [br('feature/1-old', { sha: SHA_B })],
    prs: [pr(1, 'feature/1-old', PR_MERGED, { headSha: SHA_B })],
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.del, [{ name: 'feature/1-old', sha: SHA_B, prNumbers: [1] }]);
  assert.deepEqual(plan.keep, []);
});

// ── F3 (b) 열린 PR 의 head 를 제외하는가 ─────────────────────────────────────
run('U2 열린 PR 의 head 는 머지된 PR 이 함께 있어도 제외된다', () => {
  const plan = planBranchCleanup({
    branches: [br('fix/2-live'), br('feature/1-old')],
    // 같은 브랜치에 머지된 PR(#1) 과 열린 PR(#2) 이 동시에 달린 상황 — 재사용 브랜치.
    prs: [pr(1, 'fix/2-live', PR_MERGED), pr(2, 'fix/2-live', PR_OPEN), ...basePrs],
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(names(plan.del), ['feature/1-old'], '열린 PR 의 head 는 삭제 목록에 없다');
  const kept = plan.keep.find((k) => k.name === 'fix/2-live');
  assert.equal(kept.reason, 'open-pr');
  assert.match(kept.detail, /#2/);
});

// ── F3 (c) develop·main 을 제외하는가 ────────────────────────────────────────
run('U3 develop·main 은 머지된 PR 이 head 로 달려 있어도 제외된다', () => {
  // 릴리스 PR(head=develop) 은 실제로 머지되므로 이 조건은 가설이 아니라 상시 참이다.
  const plan = planBranchCleanup({
    branches: [br('develop'), br('main', { protected: true }), br('feature/1-old')],
    prs: [pr(9, 'develop', PR_MERGED), pr(8, 'main', PR_MERGED), ...basePrs],
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(names(plan.del), ['feature/1-old']);
  for (const n of ALWAYS_KEEP) {
    assert.equal(plan.keep.find((k) => k.name === n).reason, 'always-keep');
  }
});

run('U4 보호 브랜치는 머지된 PR 이 있어도 제외된다', () => {
  const plan = planBranchCleanup({
    branches: [br('release/keep', { protected: true }), br('feature/1-old')],
    prs: [pr(3, 'release/keep', PR_MERGED), ...basePrs],
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(names(plan.del), ['feature/1-old']);
  assert.equal(plan.keep.find((k) => k.name === 'release/keep').reason, 'protected');
});

run('U5 PR 이 전혀 없는 브랜치는 삭제 대상이 아니다 (비목표 — 판단 필요 대역)', () => {
  const plan = planBranchCleanup({ branches: [br('scratch/no-pr')], prs: basePrs });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.del, []);
  assert.equal(plan.keep[0].reason, 'no-merged-pr');
});

run('U6 닫힘(미머지) PR 만 있는 브랜치는 삭제 대상이 아니다 (비목표)', () => {
  const plan = planBranchCleanup({
    branches: [br('feature/4-abandoned')],
    prs: [pr(4, 'feature/4-abandoned', PR_CLOSED), ...basePrs],
  });
  assert.equal(plan.ok, true);
  assert.deepEqual(plan.del, []);
  assert.equal(plan.keep[0].reason, 'no-merged-pr');
});

// ── F4 fail-closed ──────────────────────────────────────────────────────────
run('U7 상태 미상 PR 이 달린 브랜치는 제외 + 실패 보고 (다른 브랜치는 진행)', () => {
  const plan = planBranchCleanup({
    branches: [br('feature/5-murky'), br('feature/1-old')],
    prs: [
      pr(5, 'feature/5-murky', PR_MERGED),
      // 응답 스키마 변화 / 부분 실패 — `merged_at` 이 사라져 머지 여부를 읽지 못한 경우.
      pr(6, 'feature/5-murky', PR_UNKNOWN),
      ...basePrs,
    ],
  });
  assert.equal(plan.ok, false, '판정 불가가 있으면 성공으로 보고하지 않는다');
  assert.equal(plan.fatal, false, '브랜치 단위 사유는 표본 전체를 폐기하지 않는다');
  assert.deepEqual(names(plan.del), ['feature/1-old'], '나머지 브랜치는 정상 진행');
  assert.deepEqual(plan.unresolved, [
    { name: 'feature/5-murky', reason: 'pr-state-unknown', detail: 'PR #6 상태 미상' },
  ]);
});

run('U8 PR 표본이 비면 치명 — 삭제 목록 전량 폐기 (#1201 클래스)', () => {
  const plan = planBranchCleanup({ branches: [br('feature/1-old')], prs: [] });
  assert.equal(plan.ok, false);
  assert.equal(plan.fatal, true);
  assert.deepEqual(plan.del, [], '표본이 비면 「지울 게 없다」가 아니라 「재지 못했다」다');
  assert.equal(plan.errors.length, 1);
  assert.match(plan.errors[0], /PR 표본이 비었다/);
});

run('U9 페이지네이션 누락(기대 총계 > 수집)은 치명 — 삭제 목록 전량 폐기', () => {
  const plan = planBranchCleanup({
    branches: [br('feature/1-old')],
    prs: basePrs,
    expectedPrCount: 749,
  });
  assert.equal(plan.ok, false);
  assert.equal(plan.fatal, true);
  assert.deepEqual(plan.del, []);
  assert.equal(plan.suppressed, 1, '폐기된 후보 수를 세어 남긴다 — 침묵 금지');
  assert.match(plan.errors[0], /페이지네이션 누락/);
  // 반대 방향(수집 > 기대)은 수집 도중 생긴 PR 이므로 통과해야 한다.
  const ok = planBranchCleanup({
    branches: [br('feature/1-old')],
    prs: basePrs,
    expectedPrCount: 0,
  });
  assert.equal(ok.ok, true);
  assert.deepEqual(names(ok.del), ['feature/1-old']);
});

run('U10 40자 sha 를 확보하지 못하면 제외 + 실패 보고 (복구 단서 부재)', () => {
  for (const bad of [null, undefined, '', 'abc123', `${SHA_A}ff`, 'z'.repeat(40)]) {
    const plan = planBranchCleanup({
      branches: [br('feature/1-old', { sha: bad })],
      prs: basePrs,
    });
    assert.deepEqual(plan.del, [], `sha=${String(bad)} 는 삭제하지 않는다`);
    assert.equal(plan.unresolved[0].reason, 'sha-unknown');
    assert.equal(plan.ok, false);
  }
});

run('U11 보호 여부가 boolean 이 아니면 제외 + 실패 보고', () => {
  for (const bad of [undefined, null, 'false', 0]) {
    const plan = planBranchCleanup({
      branches: [br('feature/1-old', { protected: bad })],
      prs: basePrs,
    });
    assert.deepEqual(plan.del, [], `protected=${String(bad)} 는 삭제하지 않는다`);
    assert.equal(plan.unresolved[0].reason, 'protected-unknown');
    assert.equal(plan.ok, false);
  }
});

run('U12 fork 는 비대칭 — merged 는 삭제 근거가 아니고 open 은 보존 근거다', () => {
  const forkMerged = planBranchCleanup({
    branches: [br('patch-1')],
    prs: [pr(7, 'patch-1', PR_MERGED, { sameRepo: false }), ...basePrs],
  });
  assert.deepEqual(forkMerged.del, [], '남의 저장소 PR 이 우리 브랜치를 지우게 하지 않는다');
  assert.equal(forkMerged.keep[0].reason, 'no-merged-pr');

  const forkOpen = planBranchCleanup({
    branches: [br('patch-2')],
    prs: [
      pr(10, 'patch-2', PR_MERGED),
      pr(11, 'patch-2', PR_OPEN, { sameRepo: false }),
      ...basePrs,
    ],
  });
  assert.deepEqual(forkOpen.del, [], 'fork 의 열린 PR 도 보존 신호로 센다');
  assert.equal(forkOpen.keep[0].reason, 'open-pr');
});

run('U13 브랜치 표본이 비거나 귀속 불가 PR 이 있으면 치명', () => {
  const noBranches = planBranchCleanup({ branches: [], prs: basePrs });
  assert.equal(noBranches.fatal, true);
  assert.match(noBranches.errors[0], /브랜치 표본이 비었다/);

  const orphanPr = planBranchCleanup({
    branches: [br('feature/1-old')],
    prs: [...basePrs, pr(12, null, PR_OPEN)],
  });
  assert.equal(orphanPr.fatal, true);
  assert.deepEqual(orphanPr.del, [], '어느 브랜치의 열린 PR 인지 모르면 아무것도 지우지 않는다');
  assert.match(orphanPr.errors[0], /귀속 불가/);

  const nonArray = planBranchCleanup({ branches: [br('feature/1-old')], prs: null });
  assert.equal(nonArray.fatal, true);
  assert.deepEqual(nonArray.del, []);
});

// ── 정규화 ──────────────────────────────────────────────────────────────────
run('U14 REST 레코드 정규화 — merged_at 부재는 `closed` 가 아니라 `unknown`', () => {
  const repo = 'coseo12/astro-simulator';
  const mk = (over) => ({
    number: 1,
    state: 'closed',
    merged_at: null,
    head: { ref: 'feature/x', sha: SHA_C, repo: { full_name: repo } },
    ...over,
  });
  assert.equal(normalizePullRequest(mk({ state: 'open' }), { repo }).status, PR_OPEN);
  assert.equal(
    normalizePullRequest(mk({ merged_at: '2026-09-01T00:00:00Z' }), { repo }).status,
    PR_MERGED,
  );
  assert.equal(normalizePullRequest(mk(), { repo }).status, PR_CLOSED);
  // 필드 자체가 없음 — 스키마 변화를 「머지 안 됨」으로 읽지 않는다.
  const { merged_at: _drop, ...noField } = mk();
  assert.equal(normalizePullRequest(noField, { repo }).status, PR_UNKNOWN);
  assert.equal(normalizePullRequest(mk({ state: 'draft' }), { repo }).status, PR_UNKNOWN);
  assert.equal(normalizePullRequest(null, { repo }).status, PR_UNKNOWN);
  assert.equal(normalizePullRequest(null, { repo }).headRefName, null);

  assert.equal(normalizePullRequest(mk(), { repo }).sameRepo, true);
  assert.equal(
    normalizePullRequest(mk({ head: { ref: 'a', repo: null } }), { repo }).sameRepo,
    false,
  );
  assert.equal(
    normalizePullRequest(mk({ head: { ref: 'a', repo: { full_name: 'other/repo' } } }), { repo })
      .sameRepo,
    false,
  );

  // head.sha 보존 — 이 필드가 없으면 머지 시점 대조 술어가 판정부에 존재할 수 없다 (B1).
  assert.equal(normalizePullRequest(mk(), { repo }).headSha, SHA_C);
  assert.equal(
    normalizePullRequest(mk({ head: { ref: 'a', sha: SHA_C.toUpperCase() } }), { repo }).headSha,
    SHA_C,
    '대소문자를 접어 같은 커밋으로 읽는다',
  );
  // 읽지 못한 축은 전부 하나의 sentinel(null) 로 접는다 — `''` 를 남기면 조용한 불일치가 된다.
  for (const bad of [undefined, null, '', 'abc123', `${SHA_C}ff`, 'z'.repeat(40), 42]) {
    assert.equal(
      normalizePullRequest(mk({ head: { ref: 'a', sha: bad } }), { repo }).headSha,
      null,
      `head.sha=${String(bad)} 는 null 로 접힌다`,
    );
  }
  assert.equal(normalizePullRequest(null, { repo }).headSha, null);

  // 브랜치 정규화 — `protected` 를 false 로 접지 않는다 (판정부가 unresolved 로 잡아야 한다).
  const nb = normalizeBranch({ name: 'x', commit: { sha: SHA_C } });
  assert.deepEqual(nb, { name: 'x', sha: SHA_C, protected: undefined });
  assert.deepEqual(normalizeBranch(null), { name: null, sha: null, protected: undefined });
});

run('U15 출력에 모드와 sha 가 항상 박힌다 (사후 복구 단서)', () => {
  const plan = planBranchCleanup({
    branches: [br('feature/1-old', { sha: SHA_B })],
    prs: [pr(1, 'feature/1-old', PR_MERGED, { headSha: SHA_B })],
  });
  const dry = renderPlan(plan, { mode: 'dry-run', repo: 'o/r' });
  assert.match(dry, /DRY-RUN \(목록만, 삭제하지 않음\)/);
  assert.match(dry, new RegExp(`feature/1-old\\s+sha=${SHA_B}`));
  const applied = renderPlan(plan, { mode: 'apply', repo: 'o/r' });
  assert.match(applied, /APPLY \(실삭제\)/);

  const fatalPlan = planBranchCleanup({ branches: [br('feature/1-old')], prs: [] });
  const out = renderPlan(fatalPlan, { mode: 'apply', repo: 'o/r' });
  assert.match(out, /치명 — 삭제 목록 전량 폐기/);
});

// ── B1 (PR #1248) 머지 시점 sha 대조 ─────────────────────────────────────────
run('U16 머지 후 새 커밋이 쌓인 브랜치는 보존된다 (advanced-past-merge) — 양방향 고정', () => {
  // (가) 나아간 브랜치 — 머지 PR head 는 SHA_A, 브랜치 현재 head 는 SHA_B.
  const advanced = planBranchCleanup({
    branches: [br('feature/1-old', { sha: SHA_B })],
    prs: [pr(1, 'feature/1-old', PR_MERGED, { headSha: SHA_A })],
  });
  assert.deepEqual(advanced.del, [], '머지 이후 커밋은 미머지 내용이다 — 지우지 않는다');
  assert.equal(advanced.keep[0].reason, 'advanced-past-merge');
  assert.match(advanced.keep[0].detail, /#1/, '어느 PR 과 갈렸는지 남긴다');
  assert.equal(advanced.ok, true, '판정 불가가 아니라 범위 밖 판정이다 — run 은 초록');
  assert.equal(advanced.fatal, false);

  // (나) 머지 시점 그대로 — 판별력 보존. 이쪽이 죽으면 가드가 아무것도 안 지우게 된다.
  const atMerge = planBranchCleanup({
    branches: [br('feature/1-old', { sha: SHA_B })],
    prs: [pr(1, 'feature/1-old', PR_MERGED, { headSha: SHA_B })],
  });
  assert.deepEqual(atMerge.del, [{ name: 'feature/1-old', sha: SHA_B, prNumbers: [1] }]);

  // (다) 대소문자 차 — REST 는 소문자지만 주입 입력은 그렇지 않을 수 있다. 같은 커밋이다.
  const upper = planBranchCleanup({
    branches: [br('feature/1-old', { sha: SHA_B.toUpperCase() })],
    prs: [pr(1, 'feature/1-old', PR_MERGED, { headSha: SHA_B.toUpperCase() })],
  });
  assert.deepEqual(names(upper.del), ['feature/1-old']);

  // (라) 여러 머지 PR 중 하나만 일치 — 일치한 것만 prNumbers 에 남는다.
  const multi = planBranchCleanup({
    branches: [br('feature/1-old', { sha: SHA_B })],
    prs: [
      pr(1, 'feature/1-old', PR_MERGED, { headSha: SHA_A }),
      pr(2, 'feature/1-old', PR_MERGED, { headSha: SHA_B }),
    ],
  });
  assert.deepEqual(multi.del, [{ name: 'feature/1-old', sha: SHA_B, prNumbers: [2] }]);
});

run('U17 머지 PR 의 head sha 를 읽지 못하면 제외 + 실패 보고 (대조 불가 ≠ 대조 결과)', () => {
  // 측정 실패는 `keep` 이 아니라 `unresolved` 다 — 「재지 못했다」를 「범위 밖이다」로 읽지 않는다.
  for (const bad of [null, undefined, '', 'abc123', `${SHA_A}ff`, 'z'.repeat(40), 42]) {
    const plan = planBranchCleanup({
      branches: [br('feature/1-old', { sha: SHA_B })],
      prs: [pr(1, 'feature/1-old', PR_MERGED, { headSha: bad })],
    });
    assert.deepEqual(plan.del, [], `headSha=${String(bad)} 는 삭제하지 않는다`);
    assert.equal(plan.unresolved[0].reason, 'merge-sha-unknown');
    assert.equal(plan.ok, false);
  }

  // 단, **일치가 하나라도 있으면** 다른 PR 의 sha 를 못 읽어도 「머지 시점 그대로」는 증명됐다.
  const oneMatch = planBranchCleanup({
    branches: [br('feature/1-old', { sha: SHA_B })],
    prs: [
      pr(1, 'feature/1-old', PR_MERGED, { headSha: null }),
      pr(2, 'feature/1-old', PR_MERGED, { headSha: SHA_B }),
    ],
  });
  assert.deepEqual(oneMatch.del, [{ name: 'feature/1-old', sha: SHA_B, prNumbers: [2] }]);
  assert.equal(oneMatch.ok, true);

  // fork 의 머지된 PR 은 애초에 삭제 근거가 아니므로 sha 대조에 닿지 않는다 (U12 의 연장).
  const fork = planBranchCleanup({
    branches: [br('patch-1', { sha: SHA_B })],
    prs: [pr(7, 'patch-1', PR_MERGED, { sameRepo: false, headSha: null }), ...basePrs],
  });
  assert.deepEqual(fork.del, []);
  assert.equal(fork.keep[0].reason, 'no-merged-pr', 'fork 는 merge-sha-unknown 이 아니다');
  assert.equal(fork.ok, true);

  // 열린 PR 은 sha 와 무관하게 보존 신호다 — 대조 불가로 강등되지 않는다.
  const open = planBranchCleanup({
    branches: [br('fix/2-live', { sha: SHA_B })],
    prs: [pr(2, 'fix/2-live', PR_OPEN, { headSha: null }), ...basePrs],
  });
  assert.equal(open.keep.find((k) => k.name === 'fix/2-live').reason, 'open-pr');
  assert.equal(open.ok, true);
});

run('U18 기대 PR 총계 — 빈 출력이 0 으로 퇴화해 통과하지 않는다 (#1201 클래스)', () => {
  assert.equal(parseExpectedPrCount('750'), 750);
  assert.equal(parseExpectedPrCount(' 750\n'), 750);
  assert.equal(parseExpectedPrCount(750), 750);
  // 구판이 통과시키던 축 — `Number('') === 0` ∧ `Number.isInteger(0) === true`.
  for (const bad of ['', '   ', '\n', null, undefined, '0', '-1', 'null', 'abc', '1.5', 'NaN']) {
    assert.equal(parseExpectedPrCount(bad), null, `${JSON.stringify(bad)} 는 총계가 아니다`);
  }
});

// ── cross-validate (PR #1248) head 브랜치명 결손의 치명 범위 ─────────────────
run('U19 닫힘(미머지) PR 의 head 브랜치명 결손은 치명이 아니다 — 계수만 + 나머지 진행', () => {
  const plan = planBranchCleanup({
    branches: [br('feature/1-old', { sha: SHA_B }), br('fix/2-live')],
    prs: [
      pr(1, 'feature/1-old', PR_MERGED, { headSha: SHA_B }),
      pr(2, 'fix/2-live', PR_OPEN),
      // 과거 닫힌 PR — fork 삭제 등으로 head 가 비어 돌아온 레코드. 판정에 기여하지 않는다.
      pr(30, null, PR_CLOSED),
      pr(31, null, PR_CLOSED, { headSha: null }),
    ],
  });
  assert.deepEqual(plan.errors, [], '닫힘(미머지)은 run 을 마비시키지 않는다');
  assert.equal(plan.fatal, false);
  assert.equal(plan.ok, true);
  assert.equal(plan.ignoredClosedNoHeadRef, 2, '조용히 버리지 않는다 — 건수를 센다');
  // 다른 브랜치 판정은 정상 진행 — 삭제도 보존도 평소대로 발화한다.
  assert.deepEqual(plan.del, [{ name: 'feature/1-old', sha: SHA_B, prNumbers: [1] }]);
  assert.equal(plan.keep.find((k) => k.name === 'fix/2-live').reason, 'open-pr');
  // 계수는 사람이 읽는 출력에도 박힌다 (0 건일 때도 줄 자체는 존재한다).
  assert.match(renderPlan(plan, { mode: 'dry-run', repo: 'o/r' }), /head 브랜치명 결손 2 건/);
  const none = planBranchCleanup({ branches: [br('feature/1-old')], prs: basePrs });
  assert.equal(none.ignoredClosedNoHeadRef, 0);
  assert.match(renderPlan(none, { mode: 'dry-run', repo: 'o/r' }), /head 브랜치명 결손 0 건/);
});

run('U20 닫힘 외 상태의 head 브랜치명 결손은 치명 유지 (unknown 포함)', () => {
  // ⚠️ `unknown` 이 핵심이다 — 상태를 모르면 「닫힘인지」도 모르므로 면제 대상이 아니다.
  for (const status of [PR_OPEN, PR_MERGED, PR_UNKNOWN]) {
    const plan = planBranchCleanup({
      branches: [br('feature/1-old')],
      prs: [...basePrs, pr(12, null, status)],
    });
    assert.equal(plan.fatal, true, `status=${status} 의 head 결손은 치명이다`);
    assert.equal(plan.ok, false);
    assert.deepEqual(plan.del, [], '치명이면 삭제 후보를 전량 폐기한다');
    assert.equal(plan.ignoredClosedNoHeadRef, 0, '면제로 새지 않는다');
    assert.match(plan.errors[0], /귀속 불가/);
    assert.match(plan.errors[0], new RegExp(`상태 ${status}`), '어느 상태에서 걸렸는지 남긴다');
  }
  // 상태 문자열이 아예 낯선 값이어도 `unknown` 으로 접혀 치명이다 (KNOWN_STATUSES 밖).
  const weird = planBranchCleanup({
    branches: [br('feature/1-old')],
    prs: [...basePrs, { number: 13, headRefName: null, status: 'draft', sameRepo: true }],
  });
  assert.equal(weird.fatal, true);
  assert.equal(weird.ignoredClosedNoHeadRef, 0);
});

console.log(`\n  ${passed} passed${process.exitCode ? ' — FAIL 있음' : ''}\n`);
