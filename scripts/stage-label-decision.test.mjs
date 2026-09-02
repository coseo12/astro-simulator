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
 * **순서까지** 비교한다. 변이 M2(제거 루프를 `decide()` 앞으로 이동)를 주입하면 `decide()` 만
 * 검사하는 **U1~U4 는 전건 PASS** 한다 (라운드 1·2 실측) — 순서는 실행기의 성질이지 결정 함수의
 * 성질이 아니기 때문이다. 즉 M2 를 갈라내는 것은 **실행기 테스트뿐**이고 그 최소 표본이 U5 다.
 * ⚠️ 갈리는 테스트의 **정확한 집합은 주입 지점에 따라 달라진다** — 라운드 1 의 「루프 이동」은
 * `U5` 단독이었고, 라운드 2 가 쓴 「`decide()` 앞에 제거 루프 **추가**」 변형은 중복 제거 때문에
 * `U5, U6, U7` 이 갈렸다. 두 경우 모두 U1~U4 는 PASS 다.
 *
 * 변이 ↔ 테스트 대응 — D10 **계약 원문은 M1~M4 `4` 종**이다 (이슈 #1184 architect 설계 §6):
 *   M1 스킵 목록에서 `stage:qa` 삭제         → U1, U5
 *   M2 제거 루프를 `decide()` 앞으로 이동     → U5 단독 (주입 지점 의존 — 위 ⚠️ 참조)
 *   M3 `pr.remove` 를 `[]` 로 고정             → U2, U6
 *   M4 이슈 축 스킵 판정 삭제                  → U4, U7
 *
 * 리뷰 라운드 2 가 추가한 변이 `3` 종 (PR #1187 — 신규 테스트·단언의 판별력 실증. 전건 단독 사살):
 *   M5 `applyOps` 의 `if (e?.status !== 404) throw e;` 1행 삭제
 *      (= 초판의 무제한 `catch` 복원)          → U10 단독
 *   M6 모호성 임계 `>= 2` 를 `>= 999`(도달 불가)로 → U11 단독
 *   M7 `countDistinctLinkedIssues` 의 dedup 제거
 *      (`new Set(...).size` → 매치 수)          → U11 단독 (R-d 단언)
 *
 * 그 변이가 겨냥하는 신규 테스트:
 *   U10 `removeLabel` 의 404 **이외** 실패가 전파되는지 (B1 — 무제한 `catch` 는 D1 위반을
 *       신호 0으로 재생산했다. reviewer 가 `403` 주입으로 재현)
 *   U11 close 키워드가 **서로 다른 이슈**를 가리킬 때 모호성 로그 (R2 — 파서 의미론은 불변 /
 *       R-d — 같은 이슈 중복 인용은 모호하지 않으므로 세지 않는다)
 *
 * #1190 이 추가한 변이 `5` 종 (코드 영역 전처리 — 전건 단독 사살. dev 가 실제 주입해 측정한
 * 값이며 재현 로그는 PR 본문. 「auto-close」 열은 `auto-close-issue-parser.mjs --self-test`):
 *   M8  양쪽 파서에서 `stripCodeRegions(body)` → `body`
 *       (= 현행 결함판 복원)          → U12-1·U12-2·U12-3·U12-4·U13 FAIL / auto-close FAIL
 *   M9  공유 모듈에서 인라인 스팬 `.replace(...)`
 *       **한 항만** 삭제 (fenced 만 제거) → U12-1·U12-3·U12-4·U13 FAIL / **U12-2 PASS** / auto-close FAIL
 *   M10a `parseCloseTargets` **에만** 미적용 → 본 suite 전건 PASS / **auto-close 단독** FAIL
 *   M10b `parseLinkedIssue` **에만** 미적용  → 본 suite 5건 FAIL / **auto-close PASS**
 *   M11 공유 모듈에 이스케이프 인식 처방 주입 → **U13 단독** FAIL / auto-close PASS
 *   M12 공유 모듈의 치환 문자 `' '` → `''`      → 본 suite 단독 FAIL / auto-close PASS
 *       ⤷ 단, `M12` 만 주입하면 U13 의 **단언 1** 이 먼저 걸려 신규 단언(번호 합성)은
 *         실행되지 않는다. 그 단언의 판별력은 단언 1 을 임시 제거한 판에서만 관측된다.
 *
 * ⚠️ M8·M9 가 U13 까지 깨는 것은 의도된 결과다 (설계 단계 예측표에는 U12 만 적혀 있었다) —
 * U13 은 **전처리가 존재한다는 전제 위에서** 그 한계를 고정하므로 전처리를 걷어내면 함께
 * 무너진다. M8↔M9 판별은 U13 이 아니라 **U12-2 의 PASS** 가 한다.
 *
 * ⚠️ **U12 를 통짜 1 케이스로 묶지 말 것.** `assert` 는 첫 실패에서 중단하므로 묶으면 M8 과 M9 가
 * **구분 불가능해진다** — 두 변이는 auto-close 쪽에서 같은 케이스에 걸리므로, 판별 신호는
 * 「fenced 축은 살아 있고 인라인 축만 죽었다」는 **`U12-2` 의 PASS 하나뿐**이다.
 *
 * ⚠️ **M10a/M10b 의 탐지는 두 suite 가 「각각」 실행됨에 의존한다** (한쪽 열이 전건 PASS 인 것이
 * 곧 다른 쪽이 유일한 탐지자라는 뜻이다). 그래서 교차 파서 합의 테스트를 신설하지 **않았다** —
 * 그것만이 잡는 변이가 `0` 이라 판별력이 `0` 이기 때문이다. 대신 두 suite 의 CI 배선 `4` 곳
 * (`ci.yml` 2 step + `auto-close-issues.yml` · `harness-pr-review.yml` 사용 직전 각 1 step)이
 * 유지돼야 한다 — 하나라도 빠지면 그 열의 변이가 미검출로 돌아간다.
 *
 * 실행: node scripts/stage-label-decision.test.mjs
 */
import assert from 'node:assert/strict';

import {
  REVIEW_STAGE,
  SKIP_REATTACH_STAGES,
  countDistinctLinkedIssues,
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
function fakeApi({ issueLabels = [], missingLabels = [], errorLabels = {} } = {}) {
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
      // 404 **이외**의 실패 주입 — `{ 'stage:dev': 403 }` 형태 (U10).
      if (errorLabels[name]) {
        const err = new Error(`HTTP ${errorLabels[name]}`);
        err.status = errorLabels[name];
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

await run('U10 — removeLabel 이 404 아닌 실패(403)면 전파된다 (조용한 D1 위반 금지)', async () => {
  const api = fakeApi({ issueLabels: [], errorLabels: { 'stage:dev': 403 } });
  await assert.rejects(
    () =>
      runLabelSync(
        syncArgs({ prNumber: 900, prLabels: ['stage:dev'], prBody: 'Closes #1184', api }),
      ),
    (e) => e.status === 403,
    '404 이외의 실패는 삼키지 않는다',
  );
  // 부착까지 진행하면 「제거 실패 + 부착 성공」 = `stage:*` 다중 잔존이 신호 0으로 재생산된다.
  assert.deepEqual(api.calls, [], '전파 시 후속 변이는 일어나지 않는다');
});

await run('U11 — 서로 다른 이슈 2개 이상이면 ambiguous 로그 (결정은 첫 매치 불변)', async () => {
  const lines = [];
  const body = 'Closes #A, #B 는 자리표시자다\n\nCloses #4242\nFixes #7';
  assert.equal(countDistinctLinkedIssues(body), 2, '자리표시자는 숫자가 아니라 매치되지 않는다');

  const decision = await runLabelSync(
    syncArgs({ prLabels: ['stage:dev'], prBody: body, api: fakeApi(), log: (m) => lines.push(m) }),
  );
  const hits = lines.filter((l) => l.includes('[ambiguous]'));
  assert.equal(hits.length, 1, '모호성 1건이 로그로 남아야 한다');
  assert.ok(hits[0].includes('2개'));
  // ⚠️ 파서 의미론 불변 — 로그는 결정을 바꾸지 않는다 (설계 §9-1 비-범위).
  assert.equal(decision.issue.number, 4242);

  // 후보 1개면 남지 않는다 (정상 PR 본문에서 상시 경고하지 않는다).
  const single = [];
  await runLabelSync(
    syncArgs({ prBody: 'Closes #1184', api: fakeApi(), log: (m) => single.push(m) }),
  );
  assert.equal(single.filter((l) => l.includes('[ambiguous]')).length, 0);

  // R-d — 같은 이슈를 두 번 인용한 본문은 어느 이슈가 전이되는지 모호하지 않다. 매치 수로 세면
  // `2` 라 경고가 남았다 (PR #1187 reviewer 실측). 고유 번호 수로 세므로 `1` 이고 로그도 없다.
  const dup = [];
  assert.equal(countDistinctLinkedIssues('Closes #1184\n\nCloses #1184'), 1);
  await runLabelSync(
    syncArgs({ prBody: 'Closes #1184\n\nCloses #1184', api: fakeApi(), log: (m) => dup.push(m) }),
  );
  assert.equal(dup.filter((l) => l.includes('[ambiguous]')).length, 0);
});

// --- #1190 코드 영역 전처리 (A2 4형태 — 개별 케이스 필수, 헤더 ⚠️ 참조) --------

await run('U12-1 — 코드 스팬 안 예시 단독은 연결 지시가 아니다 (인라인 축)', () => {
  const body = '예시: `Closes #8801` 처럼 쓰지 말 것';
  assert.equal(parseLinkedIssue(body), null, '인라인 스팬 안은 매치되지 않는다');
  assert.equal(countDistinctLinkedIssues(body), 0, '모호성 계수도 같은 전처리를 거친다');
});

await run('U12-2 — fenced block 안 예시 단독은 연결 지시가 아니다 (fenced 축)', () => {
  // ⚠️ 이 케이스의 **PASS 여부**가 M8(전처리 전삭제) ↔ M9(인라인 항만 삭제) 의 유일한 판별
  // 신호다. M9 는 fenced 축을 살려 두므로 여기만 PASS 한다 (헤더 변이 대응표).
  const body = '설명 문단\n\n```text\nCloses #8802\n```\n\n마감 문단';
  assert.equal(parseLinkedIssue(body), null, 'fenced block 안은 매치되지 않는다');
  assert.equal(countDistinctLinkedIssues(body), 0);
});

await run('U12-3 — 스팬 안 예시 + 코드 밖 진짜 링크 병존 → 코드 밖이 선택된다', () => {
  // 실피해 재현 방향: 전처리가 없으면 **첫 매치**라 예시(8803)가 진짜 링크(8804)를 이긴다.
  const body = '예시는 `Closes #8803` 형태다\n\n### 관련 이슈\n\nCloses #8804';
  assert.equal(parseLinkedIssue(body), 8804, '코드 밖 진짜 링크가 선택돼야 한다');
  // 코드 스팬 후보를 세면 `2` 가 되어 모호성 경고가 남는다 — 결정은 그 후보를 보지도 않는다.
  assert.equal(countDistinctLinkedIssues(body), 1, '코드 스팬 후보는 세지 않는다');
});

await run('U12-4 — fenced + 인라인 혼합이 유일 매치면 결과는 null', () => {
  const body = '```md\nCloses #8805\n```\n\n인라인도 `Fixes #8806` 뿐이다';
  assert.equal(parseLinkedIssue(body), null);
  assert.equal(countDistinctLinkedIssues(body), 0);
});

await run('U13 — 전처리의 알려진 한계를 현행 동작으로 고정 (주석 계약 ↔ 구현 drift 차단)', () => {
  // 이 테스트는 **결함을 겨누지 않는다.** `pr-body-code-regions.mjs` §알려진 한계가
  // 서술한 동작을 못 박아, 누가 한계를 「고치면」 빨개져서 **주석의 수치도 함께 갱신**하도록
  // 강제하는 것이 목적이다 (CLAUDE.md §주석 계약 vs 구현 drift).

  // 한계 1 — 백슬래시 이스케이프. 렌더링상 리터럴 백틱이지만 본 함수는 코드 스팬으로 오인한다.
  // ⚠️ 이 기대값을 뒤집는 처방(이스케이프 인식)은 머지 PR 690 건 실측에서 **엄격히 나쁘다**
  //    — #422 의 정정을 잃고 #1070 의 진짜 링크 3행을 파괴한다. 기대값을 바꾸려면 그 측정을
  //    다시 뜨고 주석 수치를 함께 갱신할 것.
  assert.equal(
    parseLinkedIssue('baseline 갱신 PR 본문 \\`Closes #8807\\` 를 적는다'),
    null,
    '한계 1: 이스케이프된 백틱도 코드 스팬으로 취급된다 (현행 동작)',
  );

  // 한계 2 — 문단 경계 미준수. 홀수 백틱이 문단을 건너 짝지어 사이의 진짜 링크를 삼킨다.
  const oddTicks = '백틱이 하나 열린 `채 문단이 끝난다\n\nCloses #8808\n\n다시 백틱 `이 온다';
  assert.equal(
    parseLinkedIssue(oddTicks),
    null,
    '한계 2: 문단을 건너 짝지어 사이의 진짜 링크를 삼킨다 (현행 동작)',
  );

  // 한계 3 — fence 짝짓기는 비탐욕 쌍 단위. 마커가 홀수면 마지막 하나는 짝을 못 찾는다.
  // (노출 0/690 이라 실제 표본이 없어 합성 입력으로 고정한다.)
  assert.equal(
    parseLinkedIssue('```\nCloses #8809\n```\n\nCloses #8810\n\n```\n꼬리 fence'),
    8810,
    '한계 3: 짝지어진 첫 쌍만 제거되고 그 뒤 진짜 링크는 살아남는다',
  );

  // 한계 4 — 치환이 공백 1개라 「키워드 + 공백 + #N」이 합성될 수 있다. 빈 문자열 치환이
  // 만드는 **번호 변조**(다른 이슈를 가리키게 됨)를 피하려고 택한 거래다.
  assert.equal(
    parseLinkedIssue('Closes`주석`#8811'),
    8811,
    '한계 4: 공백 치환이 없던 매치를 만든다 (택한 오탐 1종)',
  );
  // ⚠️ 입력에 close 키워드가 **있어야** 판별력이 생긴다. 초판은 키워드 없는 `참조 #88…` 이라
  //    develop 판 · 공백 치환 · 빈 문자열 치환 세 판이 전부 null 이어서 주석이 주장하는
  //    「번호 합성 방지」를 하나도 고정하지 못했다 (PR #1191 reviewer B3).
  //    아래 형태는 빈 문자열 치환에서만 8811 로 **번호가 변조**되므로 결정 3(원안 '' 이탈)이
  //    근거로 든 바로 그 현상을 고정한다. 실측: develop=88 / ' '=88 / ''=8811.
  assert.equal(
    parseLinkedIssue('Closes #88`무관`11'),
    88,
    '한계 4의 대가로 얻은 것: 번호 조각이 이어붙어 다른 번호(8811)로 합성되지 않는다',
  );

  // 한계 5 — tilde fence 미지원. 확장 시 이득 0/690 · GFM 취소선과 충돌하므로 확장하지 않는다.
  assert.equal(
    parseLinkedIssue('~~~\nCloses #8812\n~~~'),
    8812,
    '한계 5: ~~~ 는 코드 블록으로 인식되지 않는다 (현행 동작)',
  );
});

console.log(`\n  ${passed} passed${process.exitCode ? ' — FAIL 있음' : ''}\n`);
