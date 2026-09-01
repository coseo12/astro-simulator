#!/usr/bin/env node
/**
 * #1184 — `stage:*` 라벨 결정 SSoT (`.github/workflows/harness-pr-review.yml` 의 결정 로직).
 *
 * 배경: PR push (`synchronize`) 마다 `stage:review` 를 **부착만** 하고 기존 `stage:*` 를 떼지
 * 않아 PR·이슈 양쪽에 단계 라벨이 다중 부착됐다 (PR #1183 에서 3회 실피해 관측). 또 이슈 축은
 * `stage:dev` **하나만** 제거하므로 이슈가 `stage:qa` 여도 `stage:review` 가 덧붙어
 * 단계가 뒤로 되돌아갔다.
 *
 * 처방은 사용자 결정 **(B) 부착 시 단일화 / 자동 복귀 유지** 다 (이슈 #1184 코멘트 5495986499):
 * 스킵 대상이 아니면 다른 `stage:*` 를 **제거한 뒤** `stage:review` 를 부착한다.
 *
 * ## 순서 불변식 — 「스킵 판정 → 제거 → 부착」 (D6-B)
 *
 * 제거를 스킵 판정보다 **앞에** 두면 안 된다. 스킵 판정이 읽는 PR 라벨은
 * `context.payload.pull_request.labels`, 즉 **이벤트 시점 스냅샷**이라 선행 제거가 그 값을
 * 바꾸지 못한다. 그래서 스킵이 여전히 걸리고(`stage:qa` 를 보고 중단), 그 시점엔 이미 제거가
 * 끝나 있어 **`stage:*` 가 하나도 남지 않는다.**
 *
 * 이 모듈은 그 불변식을 **규율이 아니라 구조로** 보장한다: `runLabelSync` 는 `decide()` 로
 * 결정 객체를 먼저 확정한 뒤에만 변이 API 를 호출하고, 스킵은 실행기의 `if` 가 아니라
 * **빈 배열**(`remove: [], add: []`)로 표현된다. 「제거를 스킵 판정 앞에 두는」 구현은 표현
 * 자체가 불가능하다. ⚠️ 이 성질을 깨는 리팩토링(실행기에 스킵 분기 재도입 / `decide()` 호출을
 * 변이 뒤로 이동)은 금지다 — 변이 테스트 M2 가 이것만을 검사한다.
 *
 * 읽기(`listLabelsOnIssue`)는 불변식 대상이 아니다. 변이가 아니라서 스냅샷을 오염시키지 못하므로
 * 이슈 라벨은 `decide()` 호출 **전에 무조건** 조회한다. 대가는 PR 스킵 경로의 GET 1회 낭비이고,
 * 얻는 것은 「모든 변이가 단일 순수 함수의 출력으로 결정된다」는 성질이다.
 *
 * ## 연결 이슈 파서를 `auto-close-issue-parser.mjs` 와 공유하지 않는 이유 (의도적 비재사용)
 *
 * `parseCloseTargets` 는 GitHub 공식 키워드 **9종** + **전 매치** + dedup 이고, 본 모듈의
 * `parseLinkedIssue` 는 `Closes|Fixes|Resolves` **3종** + **첫 매치 1개**다. 재사용하면 어느
 * 이슈가 전이되는지가 조용히 바뀌므로 **현행 workflow 의미론을 그대로 보존**한다.
 * ⤷ 파생 한계: `Closes #A, #B` 처럼 PR 이 이슈 여러 개를 닫을 때 **첫 이슈만 전이**되고 나머지는
 *   이전 단계에 방치된다. 현행 동작 그대로이며 본 건에서 바꾸지 않는다.
 * ⤷ ⚠️ 위 예시를 PR 본문에 **숫자 그대로** 쓰지 말 것. 파서는 마크다운을 해석하지 않으므로
 *   코드 스팬 안이어도 매칭되고, **첫 매치**라 본문 하단의 진짜 `Closes #<이슈>` 보다 먼저 잡힌다.
 *   본 모듈을 도입한 PR #1187 의 초판이 이 함정을 그대로 밟아, 예시로 적은 번호의 이슈에
 *   `stage:review` 가 부착됐다 (수동 원복). 예시는 숫자가 아닌 자리표시자로 쓴다.
 * ⤷ 별도 한계: 1 이슈 : N PR 인 경우 어느 PR 의 push 든 같은 이슈를 `stage:review` 로 끈다.
 *   되돌려도 유지해도 모순이라 「뒷단계를 앞으로 끌지 않는다」를 차악으로 택했다 (아래 이슈 축 규칙).
 *
 * 실행: node scripts/stage-label-decision.test.mjs  (단위 테스트 = self-test)
 */

/** `stage:` 접두 — 단계 라벨 판별의 유일한 기준. */
export const STAGE_PREFIX = 'stage:';

/** push 시 부착 대상 단계. */
export const REVIEW_STAGE = 'stage:review';

/**
 * D7 — 구 `postReviewStages`. 역할은 「리뷰 **후** 단계 열거」가 아니라
 * **「`stage:review` 재부착을 건너뛸 상태」** 다. 이름을 역할대로 읽지 않으면
 * `stage:dev` 가 목록에 없는 것이 「버그가 아니라 정의상 당연」해 보인다 — 본 이슈의 결함이
 * 3라운드 동안 발견되지 않은 원인의 일부로 지목됐다 (#1184).
 *
 * #915 가 이 스킵을 넣은 이유: `synchronize` 마다 `stage:review` 를 무조건 재부착하면
 * 이미 qa/done 단계에 간 PR 을 push 가 뒤로 끈다.
 */
export const SKIP_REATTACH_STAGES = ['stage:qa', 'stage:done'];

/**
 * PR 본문 → 연결 이슈 번호 (첫 매치 1개) 또는 `null`.
 * 현행 workflow 정규식 의미론 보존 — 위 §의도적 비재사용 참조.
 *
 * @param {string|null|undefined} body
 * @returns {number|null}
 */
export function parseLinkedIssue(body) {
  if (!body) return null;
  const match = body.match(/(?:Closes|Fixes|Resolves)\s+#(\d+)/i);
  return match ? Number(match[1]) : null;
}

/** 한 축(PR 또는 이슈)의 라벨 연산을 계산한다. 스킵은 빈 배열로 표현된다. */
function decideAxis(labels, reasonPrefix) {
  const hit = labels.filter((l) => SKIP_REATTACH_STAGES.includes(l));
  if (hit.length > 0) {
    // 다중 라벨 동시 보유(`stage:qa` + `stage:dev`)는 **스킵이 이긴다** —
    // 뒤 단계를 앞으로 끌지 않는 방향이 fail-safe.
    return {
      skip: true,
      reason: `${reasonPrefix}: 리뷰 후 단계 라벨 존재 (${hit.join(', ')}) — 라벨 무접촉`,
      remove: [],
      add: [],
    };
  }
  const remove = labels.filter((l) => l.startsWith(STAGE_PREFIX) && l !== REVIEW_STAGE);
  return {
    skip: false,
    reason: `${reasonPrefix}: ${REVIEW_STAGE} 로 단일화 (제거 ${remove.length}건)`,
    remove,
    // `add` 는 **무조건** `[REVIEW_STAGE]` — 현행과 동일(서버측 멱등).
    // 조건 분기를 두지 않는 이유는 미검증 분기를 만들지 않기 위해서다.
    add: [REVIEW_STAGE],
  };
}

/**
 * 라벨 결정 — 순수 함수. 네트워크·시각·난수 의존 없음.
 *
 * ⚠️ **`pr.skip === true` 는 `issue.skip` 으로 강제 전파된다.** 현행 workflow 의 `return` 이
 * 이슈 전이까지 함께 건너뛰는 동작을 그대로 보존하기 위해서다 (#915).
 *
 * 이슈 축 규칙: `planning`/`design`/`dev` → `review` 는 **전진이므로 수행**(자동 복귀의 이슈 축
 * 대응물), `qa`/`done` → `review` 는 **후퇴이므로 차단**. PR 축의 #915 스킵 근거가 이슈 축에
 * 동일하게 적용된다. PR 은 미스킵인데 이슈는 스킵인 **비대칭은 허용**되며 fail-safe 방향이다.
 *
 * @param {{prLabels?: string[], issueNumber?: number|null, issueLabels?: string[]|null}} input
 * @returns {{
 *   pr: { skip: boolean, reason: string, remove: string[], add: string[] },
 *   issue: null | { number: number, skip: boolean, reason: string, remove: string[], add: string[] }
 * }}
 */
export function decide({ prLabels = [], issueNumber = null, issueLabels = null } = {}) {
  const pr = decideAxis(prLabels, 'PR');

  if (issueNumber === null || issueNumber === undefined) {
    return { pr, issue: null };
  }

  if (pr.skip) {
    return {
      pr,
      issue: {
        number: issueNumber,
        skip: true,
        reason: 'ISSUE: PR 스킵 전파 — 라벨 무접촉',
        remove: [],
        add: [],
      },
    };
  }

  const issue = decideAxis(issueLabels ?? [], 'ISSUE');
  return { pr, issue: { number: issueNumber, ...issue } };
}

/** 한 축의 연산을 적용한다. 분기 없는 순회 — 스킵은 호출 0회로 자동 보장된다. */
async function applyOps({ api, owner, repo, issueNumber, ops, log }) {
  for (const name of ops.remove) {
    try {
      await api.removeLabel({ owner, repo, issue_number: issueNumber, name });
      log(`[stage-label-sync] #${issueNumber} 제거: ${name}`);
    } catch {
      // 404 = 이미 없음. 제거는 멱등이므로 삼킨다.
      log(`[stage-label-sync] #${issueNumber} 제거 스킵 (부재): ${name}`);
    }
  }
  if (ops.add.length) {
    // 부착 실패는 삼키지 않는다 (fail-visible) — 조용한 미발동 금지.
    await api.addLabels({ owner, repo, issue_number: issueNumber, labels: ops.add });
    log(`[stage-label-sync] #${issueNumber} 부착: ${ops.add.join(', ')}`);
  }
}

/**
 * 실행기 — API 를 주입받는다. 네트워크 호출이 전부 `api` 를 경유하므로 페이크로 **호출 순서까지**
 * 단위 테스트할 수 있다 (변이 M2 를 갈라내는 유일한 수단 — 순서는 실행기의 성질이지
 * 결정 함수의 성질이 아니다).
 *
 * @param {{
 *   owner: string, repo: string, prNumber: number,
 *   prLabels: string[], prBody: string|null,
 *   api: { listLabelsOnIssue: Function, addLabels: Function, removeLabel: Function },
 *   log?: (msg: string) => void
 * }} input
 * @returns {Promise<ReturnType<typeof decide>>} 결정 전문 (run 로그 박제용)
 */
export async function runLabelSync({
  owner,
  repo,
  prNumber,
  prLabels,
  prBody,
  api,
  log = console.log,
}) {
  const issueNumber = parseLinkedIssue(prBody);

  // 읽기는 순서 불변식 대상이 아니다 (변이가 아니라 스냅샷을 오염시키지 못함) —
  // 결정을 1회로 유지하기 위해 decide() 전에 무조건 조회한다.
  let issueLabels = null;
  if (issueNumber !== null) {
    const res = await api.listLabelsOnIssue({ owner, repo, issue_number: issueNumber });
    issueLabels = (res?.data ?? []).map((l) => l.name);
  }

  // ⚠️ 순서 불변식: 결정이 값으로 확정된 **뒤에만** 변이한다.
  const decision = decide({ prLabels: prLabels ?? [], issueNumber, issueLabels });

  await applyOps({ api, owner, repo, issueNumber: prNumber, ops: decision.pr, log });
  if (decision.issue) {
    await applyOps({
      api,
      owner,
      repo,
      issueNumber: decision.issue.number,
      ops: decision.issue,
      log,
    });
  }

  // 비대칭(PR 은 전이, 이슈는 무접촉)은 의도된 fail-safe 이지만 보드만 보는 사람에게는
  // 보이지 않는다 — 추적 가능하게 로그로 남긴다.
  if (decision.issue && decision.pr.skip !== decision.issue.skip) {
    log(
      `[stage-label-sync][asymmetry] PR=${decision.pr.skip ? 'skip' : 'sync'} ` +
        `ISSUE=${decision.issue.skip ? 'skip' : 'sync'} 사유=${decision.issue.reason}`,
    );
  }

  log(`[stage-label-sync] ${JSON.stringify(decision)}`);
  return decision;
}
