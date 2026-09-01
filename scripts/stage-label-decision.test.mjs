#!/usr/bin/env node
/**
 * #1184 — `stage-label-decision.mjs` 회귀 가드 (D9 / D10).
 *
 * stand-alone node 테스트 (`browser-verify-utils.test.mjs` / `bench-aggregate-median.test.mjs`
 * 선례 계승 — 루트 `scripts/` 는 vitest workspace 에 포함되지 않으므로 워크플로가 직접 실행한다).
 * 배선: `harness-pr-review.yml` 사용 직전 self-test + `ci.yml detect-and-test` 상시
 * (#897 교훈 — CI 미배선 self-test 는 0회 실행 / #840 `--if-present` silent no-op 금지).
 *
 * 실행기 테스트는 **호출을 기록하는 페이크 `api`** 를 주입하고 기록 배열을 `deepEqual` 로
 * **순서까지** 비교한다. 변이 M2(제거 루프를 `decide()` 앞으로 이동)는 `decide()` 단위
 * 테스트로 절대 잡히지 않는다 — 순서는 실행기의 성질이지 결정 함수의 성질이 아니므로
 * **U5 만이** 그것을 갈라낸다.
 *
 * 변이 ↔ 테스트 대응 (D10, 이슈 #1184 architect 설계 §6):
 *   M1 스킵 목록에서 `stage:qa` 삭제        → U1, U5
 *   M2 제거 루프를 `decide()` 앞으로 이동    → U5 단독
 *   M3 `pr.remove` 를 `[]` 로 고정            → U2, U6
 *   M4 이슈 축 스킵 판정 삭제                 → U4, U7
 *
 * 실행: node scripts/stage-label-decision.test.mjs
 */
import assert from 'node:assert/strict';

import {
  REVIEW_STAGE,
  SKIP_REATTACH_STAGES,
  decide,
  parseLinkedIssue,
  runLabelSync,
} from './stage-label-decision.mjs';

let passed = 0;
const run = async (name, fn) => {
  try {
    await fn();
    console.log(`  ✓ ${name}`);
    passed += 1;
  } catch (e) {
    console.error(`  ✗ ${name}\n    ${e.message}`);
    process.exitCode = 1;
  }
};

/**
 * `github.rest.issues` 의 최소 계약만 흉내내는 페이크.
 * **변이(add/remove) 만** `calls` 에 기록한다 — 읽기는 순서 불변식 대상이 아니므로
 * 별도 `reads` 에 둔다 (기록 배열이 변이 순서만을 나타내게 유지).
 */
function fakeApi({ issueLabels = [], missingLabels = [] } = {}) {
  const calls = [];
  const reads = [];
  return {
    calls,
    reads,
    async listLabelsOnIssue({ issue_number: n }) {
      reads.push(`listLabelsOnIssue:#${n}`);
      return { data: issueLabels.map((name) => ({ name })) };
    },
    async removeLabel({ issue_number: n, name }) {
      if (missingLabels.includes(name)) {
        const err = new Error('Label does not exist');
        err.status = 404;
        throw err;
      }
      calls.push(`removeLabel:#${n}:${name}`);
    },
    async addLabels({ issue_number: n, labels }) {
      calls.push(`addLabels:#${n}:${labels.join('+')}`);
    },
  };
}

const silent = () => {};
const syncArgs = (over) => ({
  owner: 'coseo12',
  repo: 'astro-simulator',
  prNumber: 900,
  prLabels: [],
  prBody: null,
  log: silent,
  ...over,
});

// --- decide() — 순수 함수 --------------------------------------------------

await run('U1 — PR 이 리뷰 후 단계면 스킵 (라벨 무접촉)', () => {
  for (const stage of SKIP_REATTACH_STAGES) {
    const d = decide({ prLabels: [stage] });
    assert.equal(d.pr.skip, true, `${stage} 는 스킵이어야 한다`);
    assert.deepEqual(d.pr.remove, []);
    assert.deepEqual(d.pr.add, []);
  }
  // 다중 보유 시 스킵이 이긴다 (뒤 단계를 앞으로 끌지 않는 fail-safe).
  const mixed = decide({ prLabels: ['stage:dev', 'stage:qa'] });
  assert.equal(mixed.pr.skip, true);
  assert.deepEqual(mixed.pr.remove, []);
});

await run('U2 — 미스킵 PR 은 다른 stage:* 제거 + stage:review 부착 (단일화)', () => {
  const d = decide({ prLabels: ['stage:dev'] });
  assert.equal(d.pr.skip, false);
  assert.deepEqual(d.pr.remove, ['stage:dev']);
  assert.deepEqual(d.pr.add, [REVIEW_STAGE]);

  // 실피해 재현 — 다중 부착 상태에서 stage:* 가 정확히 {stage:review} 로 수렴 (D5-B).
  const multi = decide({ prLabels: ['stage:dev', 'stage:design', 'type:chore', REVIEW_STAGE] });
  assert.deepEqual(multi.pr.remove, ['stage:dev', 'stage:design']);
  assert.deepEqual(multi.pr.add, [REVIEW_STAGE]);
  const after = ['type:chore', REVIEW_STAGE].filter((l) => !multi.pr.remove.includes(l));
  assert.deepEqual(
    after.filter((l) => l.startsWith('stage:')),
    [REVIEW_STAGE],
  );
});

await run('U3 — 연결 이슈가 없으면 issue === null / parseLinkedIssue 계약 보존', () => {
  assert.equal(decide({ prLabels: ['stage:dev'] }).issue, null);
  assert.equal(decide({ prLabels: ['stage:dev'], issueNumber: null }).issue, null);

  // 현행 workflow 정규식 의미론 — 3 키워드 + 첫 매치 1개 (auto-close 파서와 의도적 비공유).
  assert.equal(parseLinkedIssue('Closes #1184'), 1184);
  assert.equal(parseLinkedIssue('resolves #7'), 7);
  assert.equal(parseLinkedIssue('Fixes #12\nCloses #34'), 12);
  assert.equal(parseLinkedIssue('Closes #1, #2'), 1, '첫 매치 1개만 — 알려진 한계');
  assert.equal(parseLinkedIssue('Part of #915'), null);
  assert.equal(parseLinkedIssue(''), null);
  assert.equal(parseLinkedIssue(null), null);
});

await run('U4 — 이슈 축도 리뷰 후 단계면 스킵 (되돌림 차단) / 전진은 수행', () => {
  // PR 은 미스킵인데 이슈가 stage:qa → 이슈만 무접촉 (비대칭 허용, fail-safe).
  const back = decide({ prLabels: ['stage:dev'], issueNumber: 1184, issueLabels: ['stage:qa'] });
  assert.equal(back.pr.skip, false);
  assert.equal(back.issue.skip, true);
  assert.deepEqual(back.issue.remove, []);
  assert.deepEqual(back.issue.add, []);

  // 전진 방향은 수행.
  const fwd = decide({ prLabels: ['stage:dev'], issueNumber: 1184, issueLabels: ['stage:design'] });
  assert.equal(fwd.issue.skip, false);
  assert.deepEqual(fwd.issue.remove, ['stage:design']);
  assert.deepEqual(fwd.issue.add, [REVIEW_STAGE]);
  assert.equal(fwd.issue.number, 1184);

  // PR 스킵은 이슈로 강제 전파 (현행 return 동작 보존, #915).
  const prop = decide({ prLabels: ['stage:done'], issueNumber: 1184, issueLabels: ['stage:dev'] });
  assert.equal(prop.issue.skip, true);
  assert.deepEqual(prop.issue.remove, []);
  assert.deepEqual(prop.issue.add, []);
});

// --- runLabelSync() — 주입형 실행기 (순서까지 검사) -------------------------

await run('U5 — 스킵 시 변이 API 호출 0회 (순서 불변식: 스킵 판정 → 제거 → 부착)', async () => {
  const api = fakeApi({ issueLabels: ['stage:dev'] });
  const decision = await runLabelSync(
    syncArgs({ prLabels: ['stage:qa'], prBody: 'Closes #1184', api }),
  );
  // 제거가 스킵 판정보다 앞서면 여기에 removeLabel 이 기록된다 (변이 M2).
  assert.deepEqual(api.calls, [], '스킵은 라벨을 일절 건드리지 않는다');
  assert.equal(decision.pr.skip, true);
  assert.equal(decision.issue.skip, true);
});

await run('U6 — 단일화 시 제거 → 부착 순서로 정확히 기록', async () => {
  const api = fakeApi({ issueLabels: ['stage:dev'] });
  await runLabelSync(
    syncArgs({
      prNumber: 900,
      prLabels: ['stage:dev', 'stage:design', 'priority:medium'],
      prBody: 'Closes #1184',
      api,
    }),
  );
  assert.deepEqual(api.calls, [
    'removeLabel:#900:stage:dev',
    'removeLabel:#900:stage:design',
    'addLabels:#900:stage:review',
    'removeLabel:#1184:stage:dev',
    'addLabels:#1184:stage:review',
  ]);
  assert.deepEqual(api.reads, ['listLabelsOnIssue:#1184']);
});

await run('U7 — 이슈가 리뷰 후 단계면 PR 만 전이하고 이슈는 무접촉', async () => {
  const api = fakeApi({ issueLabels: ['stage:qa'] });
  await runLabelSync(
    syncArgs({ prNumber: 900, prLabels: ['stage:dev'], prBody: 'Closes #1184', api }),
  );
  assert.deepEqual(api.calls, ['removeLabel:#900:stage:dev', 'addLabels:#900:stage:review']);
});

await run('U8 — removeLabel 404 (라벨 부재) 는 삼키고 부착까지 진행', async () => {
  const api = fakeApi({ issueLabels: [], missingLabels: ['stage:dev'] });
  await runLabelSync(
    syncArgs({ prNumber: 900, prLabels: ['stage:dev'], prBody: 'Closes #1184', api }),
  );
  assert.deepEqual(api.calls, ['addLabels:#900:stage:review', 'addLabels:#1184:stage:review']);
});

await run('U9 — 비대칭 로그가 남는다 (보드만 보는 사람에게 보이지 않는 상태 추적)', async () => {
  const lines = [];
  const api = fakeApi({ issueLabels: ['stage:qa'] });
  await runLabelSync(
    syncArgs({
      prLabels: ['stage:dev'],
      prBody: 'Closes #1184',
      api,
      log: (m) => lines.push(m),
    }),
  );
  assert.equal(
    lines.filter((l) => l.includes('[asymmetry]')).length,
    1,
    '비대칭 1건이 로그로 남아야 한다',
  );

  // 대칭 케이스에는 남지 않는다.
  const lines2 = [];
  const api2 = fakeApi({ issueLabels: ['stage:dev'] });
  await runLabelSync(
    syncArgs({
      prLabels: ['stage:dev'],
      prBody: 'Closes #1184',
      api: api2,
      log: (m) => lines2.push(m),
    }),
  );
  assert.equal(lines2.filter((l) => l.includes('[asymmetry]')).length, 0);

  // 연결 이슈가 없을 때 undefined 비교로 오탐하지 않는다.
  const lines3 = [];
  await runLabelSync(
    syncArgs({ prLabels: ['stage:dev'], prBody: null, api: fakeApi(), log: (m) => lines3.push(m) }),
  );
  assert.equal(lines3.filter((l) => l.includes('[asymmetry]')).length, 0);
});

console.log(`\n  ${passed} passed${process.exitCode ? ' — FAIL 있음' : ''}\n`);
