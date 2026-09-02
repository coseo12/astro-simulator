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
 * 이 모듈의 형태는 그 불변식을 **지키기 쉽게** 만든다: `runLabelSync` 는 `decide()` 로 결정
 * 객체를 먼저 확정한 뒤에만 변이 API 를 호출하고, 스킵은 실행기의 `if` 가 아니라
 * **빈 배열**(`remove: [], add: []`)로 표현되므로 실행기에 스킵 분기를 따로 둘 필요가 없다.
 *
 * ⚠️ **다만 「구조상 표현 불가능」은 아니다.** 제거 루프를 `decide()` 앞으로 옮기는 구현(변이 M2)은
 * 문법·타입 오류 `0` 으로 작성·로드·실행되며, `stage:*` 가 하나도 남지 않는 바로 그 피해를 낸다
 * (PR #1187 reviewer 가 직접 주입해 재현). 초판 주석의 「표현 자체가 불가능」은 **거짓이었다**.
 * 그 거짓은 아래 M2/U5 를 불필요한 중복으로 보이게 해 **가드 삭제를
 * 유도하는 방향**이라 위험하다. 실제 보장은 둘의 합이다:
 *   (1) **규율** — 위 형태를 깨는 리팩토링(실행기에 스킵 분기 재도입 / `decide()` 호출을 변이
 *       뒤로 이동)은 금지다.
 *   (2) **결정적 탐지** — 그 이탈을 변이 테스트 M2 ↔ **U5** 가 갈라낸다. 순서는 실행기의 성질이라
 *       `decide()` 단위 테스트(U1~U4)로는 M2 가 잡히지 않는다 (전건 PASS 실측).
 *
 * 읽기(`listLabelsOnIssue`)는 불변식 대상이 아니다. 변이가 아니라서 스냅샷을 오염시키지 못하므로
 * 이슈 라벨은 `decide()` 호출 **전에 무조건** 조회한다. 얻는 것은 「모든 변이가 단일 순수 함수의
 * 출력으로 결정된다」는 성질이고, 대가는 **둘**이다 (초판 JSDoc 은 (1) 만 적었다 — PR #1187 R1):
 *   (1) PR 스킵 경로의 GET 1회 낭비.
 *   (2) ⚠️ **연결 이슈 조회가 실패하면 PR 축 라벨링까지 죽는다.** 조회가 모든 변이보다 앞에 있으므로
 *       `listLabelsOnIssue` 가 던지면 PR 은 라벨을 받지 못한 채 run 이 빨갛게 실패한다. 종전
 *       workflow 는 PR 부착이 먼저였으므로 이것은 **행동 변화**이며 CHANGELOG `[Unreleased]`
 *       행동 변화 3번 항에 박제했다.
 *       ⚠️ **발화 조건은 그 호출이 실패하는 모든 경우다.** 본문의 이슈 번호가 존재하지 않는
 *       경우(오탈자 / 예시 번호)는 그중 하나일 뿐이고, 이슈가 **실재해도** `500`·`502`·
 *       `403`·`401` 이 같은 경로로 PR 축 변이를 `0` 건으로 만든다 (PR #1187
 *       reviewer 가 4경로 주입으로 재현). 이 workflow 의 `actions/github-script@v7` 은
 *       `retries:` 를 지정하지 않으므로(`origin/develop` 시점과 같은 선재 상태 — 본 건에서
 *       바꾸지 않았다) 일시 실패를 코드가 회수하지도 않는다.
 *       그럼에도 삼키지 않는 쪽을 유지한 근거: 실패가 **보이고**(fail-visible — B1 과 같은 방향),
 *       삼키면 미검증 분기가 하나 늘어난다.
 *
 * ## 연결 이슈 파서를 `auto-close-issue-parser.mjs` 와 공유하지 않는 이유 (의도적 비재사용)
 *
 * `parseCloseTargets` 는 GitHub 공식 키워드 **9종** + **전 매치** + dedup 이고, 본 모듈의
 * `parseLinkedIssue` 는 `Closes|Fixes|Resolves` **3종** + **첫 매치 1개**다. 재사용하면 어느
 * 이슈가 전이되는지가 조용히 바뀌므로 **현행 workflow 의미론을 그대로 보존**한다.
 * ⤷ 파생 한계: `Closes #A, #B` 처럼 PR 이 이슈 여러 개를 닫을 때 **첫 이슈만 전이**되고 나머지는
 *   이전 단계에 방치된다. 현행 동작 그대로이며 본 건에서 바꾸지 않는다.
 * ⤷ ⚠️ 위 예시를 PR 본문에 **숫자 그대로** 쓰지 말 것. **첫 매치**라 본문 하단의 진짜
 *   `Closes #<이슈>` 보다 먼저 잡히기 때문이다. 본 모듈을 도입한 PR #1187 의 초판이 이 함정을
 *   그대로 밟아, 예시로 적은 번호의 이슈에 `stage:review` 가 부착됐다 (수동 원복).
 *   예시는 숫자가 아닌 자리표시자로 쓴다.
 *   ⤷ #1190 이후 이 규약은 **유지하되 단독 방어선이 아니다** — 코드 스팬/블록 안의 close
 *     지시는 아래 전처리가 파서 단계에서 걸러낸다. 규약이 남는 이유는 전처리가 마크다운
 *     파서가 아니어서 한계 5종이 있고(그 목록과 실측 수치는 `pr-body-code-regions.mjs`
 *     가 정본), 코드 영역 **밖**의 예시는 전처리가 손대지 않기 때문이다.
 *
 * ## 코드 영역 전처리는 공유한다 (#1190 — 위 「공유하지 않는다」의 사거리 정정)
 *
 * ⚠️ 위 절의 「공유하지 않는다」는 **파서 본체**에 대한 서술이다. #1190 이후
 * **전처리 함수 1개는 공유한다** (`./pr-body-code-regions.mjs` 의 `stripCodeRegions`).
 * 공유 범위는 거기까지다 — 키워드 집합(3종 vs 9종) · 매치 수(첫 매치 vs 전 매치) ·
 * dedup 유무는 여전히 각자이고, 그것이 위 비재사용 판정이 계속 유효한 이유다.
 *
 * 전처리를 **양쪽에** 붙이는 것이 본 건 범위인 근거: 머지 PR 전수 690 건 실측에서 두 파서의
 * 델타가 **동일한 3 건**(#660 · #431 · #422)이라 같은 결함을 공유함이 확인됐고, 한쪽만 고치면
 * *「라벨은 미전이인데 이슈는 닫히는」* 신규 비대칭이 생긴다 — 그 비대칭은 본 수정이 만드는
 * 표면이므로 별건으로 미룰 수 없다.
 * ⤷ 별도 한계: 1 이슈 : N PR 인 경우 어느 PR 의 push 든 같은 이슈를 `stage:review` 로 끈다.
 *   되돌려도 유지해도 모순이라 「뒷단계를 앞으로 끌지 않는다」를 차악으로 택했다 (아래 이슈 축 규칙).
 *
 * 실행: node scripts/stage-label-decision.test.mjs  (단위 테스트 = self-test)
 */

import { stripCodeRegions } from './pr-body-code-regions.mjs';

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
 *
 * ⚠️ **D7 계약 재조정 — 술어는 「활성 코드 참조 `0`」이다** (사용자 결정 2026-09-02,
 * CLAUDE.md §스프린트 계약 5·7항). 원 계약은 구 이름의 **리터럴 개수 `0`** 을 요구했으나 그 개수는
 * **안정 불변식이 될 수 없다** — 재조정 사실을 박제하는 문단(본 블록 / CHANGELOG Notes / PR 본문)이
 * 구 이름을 **인용해야만** 성립하므로, 제대로 기록할수록 리터럴 수가 **늘어난다**. 실제로 리뷰
 * 라운드 2 에서 `2` (reviewer 실측 시점) → `4` (본 블록과 CHANGELOG Notes 추가 후) 로 증가했고,
 * 그 증가분은 전부 이 재조정 기록 자신이다.
 *
 * 그래서 검산 대상은 개수가 아니라 **안정 불변식 2개**다:
 *   (a) **활성 코드 참조 `0`** — 아래 술어가 빈 결과. 계약 작성 시점의 참조처
 *       (`harness-pr-review.yml`)는 소멸했다.
 *         git grep -n --untracked 'postReviewStages' -- ':(exclude)*.md' \
 *           | grep -vE '^[^:]+:[0-9]+:[[:space:]]*(\*|//|#)'
 *       ⚠️ 이 술어는 **선별(screen)** 이지 주석 파서가 아니다. 제외하는 것은 `path:line:` 접두
 *       **직후가 주석 마커(`*` `//` `#`)로 시작하는 라인**뿐이므로 트레일링 주석이 붙은 활성 코드는
 *       남고, `#` 로 시작하는 산문은 빠진다. 초판 술어(`-vE ':[0-9]+: \*| //'`)는 이 두 방향이
 *       모두 반대였다 — 활성 코드를 지우고(거짓 음성) 산문을 통과시켰다 (PR #1187 reviewer R-a,
 *       합성 입력으로 재현). 잔여 한계는 방향이 둘이고 처방이 서로 다르다 —
 *       **거짓 양성**(주석인데 남음, 예: 블록 주석 연속행)은 hit 로 드러나므로 **그 라인을 눈으로
 *       대조**하면 된다. **거짓 음성**(활성 코드인데 빠짐, 예: 문자열·템플릿 리터럴 안의 마커)은
 *       hit 자체가 사라져 **육안 대조로 잡히지 않는다** — 이 술어로는 못 막는다.
 *   (b) **잔존 hit 전건이 산문** — 주석 라인 또는 `.md`. 실행되는 식별자가 아니다.
 * (reviewer 독립 실측: 표기 변형 5종 × `--untracked` × 경로 무제한에서 **추가 hit `0`**.)
 *
 * 산문의 구 이름은 **의도적으로 남긴다**: 구 이름으로 검색하는 사람이 새 이름에 도달하지 못하면
 * rename 자체가 추적 불가능해지므로 이 문자열이 **grep 회수 키**다. 같은 클래스의 저장소 선례 —
 * `scripts/verify-no-scientific-grep.mjs` 헤더가 _"주석(역사 맥락) 과 `docs/` 는 의도적으로 허용"_.
 * 재조정 근거는 PR 본문에, 미래 관찰자용 기록은 CHANGELOG Notes 에 동시 박제했다.
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
  // #1190 — 코드 스팬/블록 안의 예시는 연결 지시가 아니다 (위 §코드 영역 전처리는 공유한다).
  const match = stripCodeRegions(body).match(/(?:Closes|Fixes|Resolves)\s+#(\d+)/i);
  return match ? Number(match[1]) : null;
}

/**
 * 같은 정규식이 잡는 **서로 다른 이슈 번호의 개수** — 결정에는 쓰지 않고 모호성 로깅에만 쓴다 (R2).
 *
 * `parseLinkedIssue` 의 의미론(3 키워드 + 첫 매치 1개)은 그대로 두는 것이 설계 §9-1 의 결정이므로
 * **어느 이슈가 전이되는지는 한 글자도 바뀌지 않는다.** 다만 초판이 밟은 함정(본문 예시 번호가
 * 진짜 링크보다 먼저 잡힘)의 재발을 막는 것이 「JSDoc 을 읽었는지」뿐이었으므로, 후보가 `2` 개
 * 이상일 때 사후 추적용 로그 1행만 남긴다.
 *
 * 매치 수가 아니라 **고유 번호 수**를 세는 이유: 같은 이슈를 두 번 인용한 본문은 어느 이슈가
 * 전이되는지가 모호하지 않은데 매치 수로 세면 경고가 남는다 (PR #1187 reviewer R-d).
 * 번호는 `Number` 로 정규화하므로 `#7` 과 `#007` 은 같은 후보다.
 *
 * @param {string|null|undefined} body
 * @returns {number}
 */
export function countDistinctLinkedIssues(body) {
  if (!body) return 0;
  // #1190 — `parseLinkedIssue` 와 **같은 전처리**를 거쳐야 한다. 한쪽만 전처리하면 모호성
  // 로그가 결정과 다른 모집단을 세게 되고, 그 불일치는 로그를 사후 조사자에게 오도한다
  // (코드 스팬 안 예시를 후보로 세면 「모호」 경고가 뜨는데 결정은 애초에 그 후보를 안 본다).
  const matches = stripCodeRegions(body).matchAll(/(?:Closes|Fixes|Resolves)\s+#(\d+)/gi);
  return new Set([...matches].map((m) => Number(m[1]))).size;
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

/**
 * 한 축의 연산을 적용한다. 분기 없는 순회 — **주어진 `ops` 의 두 배열이 비면 이 함수의 API 호출은
 * 0회**이므로 스킵을 위한 `if` 가 여기 필요 없다. 국소 명제이며, 호출부가 `applyOps` **밖**에서
 * 변이를 추가하는 것까지 막지는 않는다 (그 이탈은 변이 M2 ↔ 테스트 U5 가 갈라낸다).
 */
async function applyOps({ api, owner, repo, issueNumber, ops, log }) {
  for (const name of ops.remove) {
    try {
      await api.removeLabel({ owner, repo, issue_number: issueNumber, name });
      log(`[stage-label-sync] #${issueNumber} 제거: ${name}`);
    } catch (e) {
      // 404 = 이미 없음. 제거는 멱등이므로 **404 만** 삼킨다.
      // ⚠️ 404 이외(403·5xx 등)는 전파한다 — 삼키면 제거가 실패한 채 부착만 성공해
      // `stage:*` 다중 잔존(D1 위반)이 **신호 0으로** 재생산되고, 로그가 검증하지 않은
      // 원인(「부재」)을 단정해 사후 조사자를 오도하며, 결정 JSON 의 `"remove"` 가
      // **결정**일 뿐인데 **결과**로 읽히는 실행 증거 오염까지 겹친다. 아래 부착 경로의
      // fail-visible 원칙과 같은 방향이다 (PR #1187 reviewer B1 — `403` 주입 재현).
      if (e?.status !== 404) throw e;
      log(`[stage-label-sync] #${issueNumber} 제거 스킵 (404 부재): ${name}`);
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

  // R2 — 의미론은 불변(첫 매치 1개)이고 **모호성만 사후 추적**한다. 어느 이슈가 전이되는지는
  // 이 로그가 있든 없든 같다. 실피해가 1회 관측됐으므로(본 모듈 도입 PR 초판) 남긴다.
  const linkedCandidates = countDistinctLinkedIssues(prBody);
  if (linkedCandidates >= 2) {
    log(
      `[stage-label-sync][ambiguous] close 키워드가 가리키는 이슈 ${linkedCandidates}개 — ` +
        `첫 매치 #${issueNumber} 를 사용 (본문에 예시로 적은 번호가 아닌지 확인할 것)`,
    );
  }

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
