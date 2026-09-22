#!/usr/bin/env node
/**
 * #1247 — 머지된 PR 의 head 브랜치 정리 계획 SSoT.
 *
 * 배경 (`docs/ops/operational-friction.md` §2): 2026-07-15 #824 에서 `gh pr merge --delete-branch`
 * 가 Conductor 워크트리 점유와 충돌한 뒤, 표준 절차를 *"`--delete-branch` 생략 + `git push origin
 * --delete <branch>` 분리"* 로 정했다. 그 충돌 서술은 **여전히 참**이나, 분리된 삭제 단계에는
 * **집행 주체가 없었다** — 2026-09-22 실측에서 원격 브랜치 110 개 중 **머지된 PR 의 head 가 90 개**
 * 잔존했고 101 개를 손으로 지웠다. [#1201](https://github.com/coseo12/astro-simulator/issues/1201)
 * 의 *"집행 주체 없는 트리거 조건은 무한 유예"* 와 같은 구조이며, 대상이 가드가 아니라 운영 절차다.
 *
 * ⚠️ **ancestor 판정을 쓰지 않는다.** 이 저장소는 squash 머지라 머지된 브랜치의 커밋 sha 는
 * `develop` 의 조상이 **아니다**. `git branch --merged` / `git merge-base --is-ancestor` 로 재면
 * 위 90 개가 전부 「미머지」로 나온다 — 판정 기준은 **PR 상태**다.
 *
 * ## 삭제 술어 (한 줄)
 *
 *   삭제 = (같은 저장소의 **머지된** PR 이 그 브랜치를 head 로 가짐)
 *          ∧ (**브랜치의 현재 sha 가 그 PR 이 머지한 head sha 와 같음**)
 *          ∧ (열린 PR 없음) ∧ (상태 미상 PR 없음)
 *          ∧ (`develop`·`main` 아님) ∧ (보호 브랜치 아님) ∧ (40자 sha 확보)
 *
 * 「PR 없음」·「닫힌(미머지) PR 만 있음」은 **삭제 대상이 아니다** — 판단이 필요한 대역이라
 * 자동화 범위 밖이다 (#1247 비목표).
 *
 * ## 머지 시점 sha 대조 (`advanced-past-merge`) — 왜 필요한가
 *
 * 초판에는 이 대조가 **없었다**. 「그 브랜치를 head 로 가진 머지된 PR 이 있다」만 보고 지웠으므로,
 * **머지 뒤 같은 브랜치에 쌓인 새 커밋이 조용히 삭제**됐다 (PR #1248 reviewer B1 — 주입 재현에서
 * `삭제 1 · 치명 0 · ok:true · exit 0`, 즉 이 함수의 모든 신호 채널이 정상을 가리켰다).
 *
 * 이 저장소는 **squash 머지**라 머지해도 head 브랜치는 그대로 남는다 — 손대지 않은 브랜치는
 * `branch.commit.sha == pr.head.sha` 가 **상시 참**이다. 그 전제인 *"닫힌 PR 의 `head.sha` 는
 * 머지 시점에 동결된다"* 는 실측으로 확인했다 (2026-09-22): `head.ref=="develop"` 인 머지된 PR
 * **89 건**의 `head.sha` 가 **전부 서로 다르고**(distinct 89) 현재 `develop` tip 과는 **0 건**
 * 일치한다 — 살아 있는 값이라면 89 건 전부 같은 현재 sha 를 보고했을 것이다.
 *
 * 그래서 두 sha 가 갈리는 것은 곧 「머지 이후 누군가 그 브랜치에 커밋했다」이고,
 * 그 브랜치는 **미머지 내용을 보유**한다 —
 * 「PR 없음」·「닫힌 PR 만 있음」과 정확히 같은 *판단이 필요한 대역* 이라 보존한다.
 *
 * 대조가 **불가능**한 경우(머지된 PR 의 head sha 를 읽지 못함)는 판정이 아니라 **측정 실패**이므로
 * `keep` 이 아니라 `unresolved` 로 보낸다 ([#1201](https://github.com/coseo12/astro-simulator/issues/1201)
 * 클래스 — 「재지 못했다」를 「지울 게 없다」로 읽지 않는다). 브랜치 쪽 `sha-unknown` 과 대칭이다.
 *
 * ## fail-closed 경로 (F4) — 「상태를 모르니 지운다」 금지
 *
 * 두 층으로 나뉜다. **치명(fatal)** 은 표본 전체를 의심하므로 삭제 목록을 **전량 비우고**,
 * **브랜치 단위(unresolved)** 는 그 브랜치만 빼고 나머지는 진행한다. 둘 다 `ok:false` 다.
 *
 *   fatal      브랜치 표본이 비었다 / PR 표본이 배열이 아니다 / PR 표본이 비었다
 *              / 페이지네이션 누락 (기대 총계 > 수집 건수) / head 브랜치명을 읽지 못한 PR
 *              / 이름 없는 브랜치 레코드
 *   unresolved PR 상태 미상 (`open`·`merged`·`closed` 중 어느 것도 아님)
 *              / 보호 여부가 boolean 이 아님 / 40자 sha 를 확보하지 못함
 *              / 머지된 PR 의 head sha 를 확보하지 못함 (머지 시점 대조 불가)
 *
 * 「PR 표본이 비었다」를 치명으로 두는 것이 [#1201](https://github.com/coseo12/astro-simulator/issues/1201)
 * 클래스 차단이다 — 표본이 비면 모든 브랜치가 「머지된 PR 없음」으로 **조용히 보존**되어 통과하는데,
 * 그 통과는 「지울 게 없다」가 아니라 「재지 못했다」다. 두 상태는 출력이 같으므로 구분해서 실패시킨다.
 *
 * 외부 저장소(fork) PR 은 **비대칭**으로 다룬다: `merged` 는 삭제 근거로 **세지 않고**(동명 브랜치가
 * 우리 쪽에 있어도 남의 PR 이 우리 브랜치를 지우게 하지 않는다), `open` 은 보존 근거로 **센다**.
 * 양쪽 다 보존 방향이다.
 *
 * ## 사용
 *
 *   node scripts/branch-cleanup-plan.mjs                    # dry-run (기본) — 목록만
 *   node scripts/branch-cleanup-plan.mjs --apply            # 실삭제
 *   node scripts/branch-cleanup-plan.mjs --input plan.json  # 오프라인 주입 (판별력 실증용)
 *   node scripts/branch-cleanup-plan.mjs --json             # 기계 판독 출력
 *
 * 회귀 가드: `scripts/branch-cleanup-plan.test.mjs` (변이 ↔ 테스트 대응은 그 파일 헤더).
 * 배선: `.github/workflows/branch-cleanup.yml` 사용 직전 + `ci.yml detect-and-test` 상시 이중화
 * (#897 교훈 — CI 미배선 self-test 는 0회 실행).
 */

import { spawnSync } from 'node:child_process';
import { appendFileSync, readFileSync } from 'node:fs';

/**
 * 항상 보존 — gitflow 장수 브랜치. 기본 브랜치 보호 설정과 독립으로 둔다 (설정은 바뀔 수 있다).
 *
 * ⚠️ `main` 과 `develop` 은 방어 층수가 **비대칭**이다 (PR #1248 reviewer R1). `main` 은
 * `protected:true` + default branch 라 이 목록이 없어도 `protected` 분기가 잡지만, `develop` 은
 * `protected:false` 이고 릴리스 PR(head=develop)이 **진짜 머지되므로** 이 문자열 하나가 빠지면
 * 삭제 1순위다.
 *
 * 위 **머지 시점 sha 대조가 `develop` 의 두 번째 층**이 된다. 릴리스가 `--merge`(squash 아님) 후
 * `git push origin main:develop` 으로 ff 동기화하는 구조라, 머지 후 `develop` 은 **항상 머지 커밋
 * 쪽으로 앞서** 릴리스 PR 의 `head.sha` 와 갈린다 — 우연이 아니라 워크플로 구조다
 * ([branch-strategy-workflow](../docs/guides/branch-strategy-workflow.md) §워크플로 3단계 2항).
 * 실측 (2026-09-22, dev 독립 재현): PR 전수 **750 건** 중 `head.ref=="develop"` 이 **89 건**,
 * 그 어느 `head.sha` 도 현재 `develop`(`61bc264…`)과 **불일치 (hit 0)**.
 *
 * 그래도 이 목록을 유지한다 — 2층은 *구조적으로 참인 관측* 이지 *불변식* 이 아니고, 삭제는
 * 되돌리기 어렵다.
 */
export const ALWAYS_KEEP = Object.freeze(['develop', 'main']);

export const PR_OPEN = 'open';
export const PR_MERGED = 'merged';
export const PR_CLOSED = 'closed';
/** 위 셋 중 어느 것도 아님 — 삭제를 막고 실패로 보고한다 (fail-closed 트리거). */
export const PR_UNKNOWN = 'unknown';

const KNOWN_STATUSES = [PR_OPEN, PR_MERGED, PR_CLOSED];
const SHA_RE = /^[0-9a-f]{40}$/;

/**
 * 40자 커밋 sha 로 읽히면 소문자로, 아니면 `null`.
 *
 * 「없음」·「빈 문자열」·「길이가 다름」·「16진수가 아님」을 **하나의 sentinel 로 접는** 것이 요점이다.
 * 접지 않으면 `''` 같은 값이 `=== sha` 비교에서 조용히 불일치가 되어, *측정 실패* 가 *판정* 으로
 * 둔갑한다 (#1201 클래스).
 */
const asSha = (v) => {
  if (typeof v !== 'string') return null;
  const s = v.toLowerCase();
  return SHA_RE.test(s) ? s : null;
};

/**
 * GraphQL `totalCount` 응답(문자열) → 기대 PR 총계. 읽지 못하면 `null`.
 *
 * ⚠️ 구판은 `Number(raw)` 만 `Number.isInteger` 로 검사했다. 그런데 `Number('') === 0` 이고
 * `Number.isInteger(0) === true` 라 **빈 출력이 검사를 통과**했고, 그 뒤 `prList.length < 0` 은
 * 항상 false 라 **페이지네이션 검사 자체가 사라졌다** (PR #1248 reviewer R2, #1201 클래스).
 *
 * `>= 1` 은 **새 임계가 아니다** — PR 0 건인 저장소는 이미 「PR 표본이 비었다」 치명으로 잡히므로,
 * 기대 총계가 0 이하라는 것은 「PR 이 없다」가 아니라 「총계를 읽지 못했다」의 재진술이다.
 */
export function parseExpectedPrCount(raw) {
  const n = Number(String(raw ?? '').trim());
  return Number.isInteger(n) && n >= 1 ? n : null;
}

/**
 * REST `GET /repos/{repo}/pulls?state=all` 레코드 1건 → 판정 입력으로 정규화.
 *
 * 상태 매핑: `state=open` → open / `state=closed` ∧ `merged_at != null` → merged /
 * `state=closed` ∧ `merged_at == null` → closed / 그 외 → unknown.
 * `merged_at` 이 `undefined` (필드 자체가 없음) 인 경우도 unknown 이다 — `null`(미머지)과
 * 구분해야 「응답 스키마가 바뀌었다」를 「머지 안 됐다」로 읽지 않는다.
 *
 * `head.sha` 를 **버리지 않는다** — 이것이 「그 PR 이 머지한 내용」과 「브랜치의 현재 내용」을
 * 잇는 유일한 고리다. 구판은 여기서 이 필드를 떨어뜨렸고, 그래서 머지 시점 대조 술어가
 * 판정부에 **존재할 수 없었다** (PR #1248 reviewer B1).
 */
export function normalizePullRequest(raw, { repo = null } = {}) {
  const pr = raw && typeof raw === 'object' ? raw : {};
  const number = Number.isInteger(pr.number) ? pr.number : null;
  const head = pr.head && typeof pr.head === 'object' ? pr.head : {};
  const headRefName = typeof head.ref === 'string' && head.ref.length > 0 ? head.ref : null;
  const headRepo = head.repo && typeof head.repo === 'object' ? head.repo : null;
  // repo 미지정이면 판별 불가 → 외부로 간주 (보존 방향).
  const sameRepo = repo === null ? false : headRepo?.full_name === repo;

  let status = PR_UNKNOWN;
  if (pr.state === 'open') {
    status = PR_OPEN;
  } else if (pr.state === 'closed') {
    if (typeof pr.merged_at === 'string' && pr.merged_at.length > 0) status = PR_MERGED;
    else if (pr.merged_at === null) status = PR_CLOSED;
  }

  return { number, headRefName, status, sameRepo, headSha: asSha(head.sha) };
}

/** REST `GET /repos/{repo}/branches` 레코드 1건 → 판정 입력으로 정규화. */
export function normalizeBranch(raw) {
  const b = raw && typeof raw === 'object' ? raw : {};
  const commit = b.commit && typeof b.commit === 'object' ? b.commit : {};
  return {
    name: typeof b.name === 'string' ? b.name : null,
    sha: typeof commit.sha === 'string' ? commit.sha : null,
    // boolean 이 아니면 그대로 넘긴다 — 판정부가 unresolved 로 잡는다 (여기서 false 로 접지 않는다).
    protected: b.protected,
  };
}

const fmtNums = (nums) => nums.map((n) => (n === null ? '#?' : `#${n}`)).join(', ');

/**
 * 삭제 계획 산출 — 순수 함수. 네트워크·파일·환경을 읽지 않는다.
 *
 * @param {object} input
 * @param {Array<{name:string, sha:string, protected:boolean}>} input.branches 정규화된 브랜치 목록
 * @param {Array<{number:number|null, headRefName:string|null, status:string, sameRepo:boolean, headSha:string|null}>} input.prs
 * @param {number|null} input.expectedPrCount 기대 PR 총계 (GraphQL `totalCount`). 수집 건수가 이보다
 *        적으면 페이지네이션 누락으로 치명 처리한다. `null` 이면 검사하지 않는다.
 * @param {string[]} input.alwaysKeep 무조건 보존할 브랜치명
 */
export function planBranchCleanup({
  branches,
  prs,
  expectedPrCount = null,
  alwaysKeep = ALWAYS_KEEP,
} = {}) {
  /** 표본 전체를 의심하게 하는 사유 — 삭제 목록을 전량 비운다. */
  const errors = [];
  /** 브랜치 단위 판정 불가 — 그 브랜치만 제외한다. */
  const unresolved = [];
  const del = [];
  const keep = [];

  const branchList = Array.isArray(branches) ? branches : [];
  const prList = Array.isArray(prs) ? prs : [];

  if (!Array.isArray(branches) || branchList.length === 0) {
    errors.push('브랜치 표본이 비었다 — 「없다」와 「못 읽었다」가 구분되지 않는다 (fail-closed)');
  }
  if (!Array.isArray(prs)) {
    errors.push('PR 표본이 배열이 아니다 (fail-closed)');
  } else if (prList.length === 0) {
    errors.push(
      'PR 표본이 비었다 — 조회 실패 시 전 브랜치가 조용히 보존되어 통과한다 (fail-closed)',
    );
  }
  if (expectedPrCount !== null && Array.isArray(prs) && prList.length < expectedPrCount) {
    errors.push(
      `PR 페이지네이션 누락 — 기대 총계 ${expectedPrCount} > 수집 ${prList.length} (fail-closed)`,
    );
  }

  // 브랜치명 → 신호 집계. 귀속 불가(head 브랜치명 없음)는 치명이다 — 그 PR 이 어느 브랜치의
  // 열린 PR 인지 알 수 없으므로, 보존해야 할 브랜치를 삭제 대상으로 놓칠 수 있다.
  const byBranch = new Map();
  for (const raw of prList) {
    const pr = raw && typeof raw === 'object' ? raw : {};
    const status = KNOWN_STATUSES.includes(pr.status) ? pr.status : PR_UNKNOWN;
    const name =
      typeof pr.headRefName === 'string' && pr.headRefName.length > 0 ? pr.headRefName : null;
    if (name === null) {
      errors.push(
        `PR ${pr.number === undefined || pr.number === null ? '#?' : `#${pr.number}`} 의 head 브랜치명을 읽지 못했다 — 귀속 불가 (fail-closed)`,
      );
      continue;
    }
    const e = byBranch.get(name) ?? { open: [], merged: [], unknown: [] };
    if (status === PR_UNKNOWN) e.unknown.push(pr.number ?? null);
    else if (status === PR_OPEN)
      e.open.push(pr.number ?? null); // fork 여부 무관 — 보존 방향
    // 머지 신호만 sha 를 동반한다 — 머지 시점 대조는 삭제 근거에만 필요하고, 보존 근거(open)는
    // sha 와 무관하게 발화해야 한다 (sha 를 못 읽어도 보존은 보존이다).
    else if (status === PR_MERGED && pr.sameRepo === true)
      e.merged.push({ number: pr.number ?? null, headSha: asSha(pr.headSha) });
    // 그 외(닫힌 미머지 PR / 외부 저장소의 머지된 PR)는 삭제 근거도 보존 근거도 아니다.
    byBranch.set(name, e);
  }

  for (const raw of branchList) {
    const b = raw && typeof raw === 'object' ? raw : {};
    const name = typeof b.name === 'string' && b.name.length > 0 ? b.name : null;
    if (name === null) {
      errors.push('이름 없는 브랜치 레코드 — 판정 불가 (fail-closed)');
      continue;
    }
    if (alwaysKeep.includes(name)) {
      keep.push({ name, reason: 'always-keep', detail: 'gitflow 장수 브랜치' });
      continue;
    }
    if (typeof b.protected !== 'boolean') {
      unresolved.push({ name, reason: 'protected-unknown', detail: '보호 여부를 읽지 못했다' });
      continue;
    }
    if (b.protected === true) {
      keep.push({ name, reason: 'protected', detail: '보호 브랜치' });
      continue;
    }

    const e = byBranch.get(name);
    if (e && e.unknown.length > 0) {
      unresolved.push({
        name,
        reason: 'pr-state-unknown',
        detail: `PR ${fmtNums(e.unknown)} 상태 미상`,
      });
      continue;
    }
    if (e && e.open.length > 0) {
      keep.push({ name, reason: 'open-pr', detail: `열린 PR ${fmtNums(e.open)}` });
      continue;
    }
    if (!e || e.merged.length === 0) {
      keep.push({ name, reason: 'no-merged-pr', detail: '머지된 PR 없음 — 자동화 범위 밖' });
      continue;
    }

    const sha = typeof b.sha === 'string' ? b.sha.toLowerCase() : '';
    if (!SHA_RE.test(sha)) {
      unresolved.push({
        name,
        reason: 'sha-unknown',
        detail: '복구 단서(40자 sha)를 확보하지 못했다 — 삭제하지 않는다',
      });
      continue;
    }
    // 머지 시점 대조 — squash 머지라 손대지 않은 브랜치는 `branch.sha == pr.head.sha` 가 상시 참.
    // 갈렸다면 머지 이후 새 커밋이 쌓인 것이고, 그 브랜치는 미머지 내용을 보유한다.
    const atMerge = e.merged.filter((m) => m.headSha !== null && m.headSha === sha);
    if (atMerge.length === 0) {
      // 일치가 하나라도 있으면 그것으로 충분하다 (다른 PR 의 sha 를 못 읽어도 「머지 시점 그대로」는
      // 이미 증명됐다). 일치가 없을 때만 「대조 불가」와 「앞서 나갔다」를 구분한다.
      const unmeasured = e.merged.filter((m) => m.headSha === null);
      if (unmeasured.length > 0) {
        unresolved.push({
          name,
          reason: 'merge-sha-unknown',
          detail: `머지된 PR ${fmtNums(unmeasured.map((m) => m.number))} 의 head sha 를 읽지 못했다 — 머지 시점 대조 불가`,
        });
        continue;
      }
      keep.push({
        name,
        reason: 'advanced-past-merge',
        detail: `머지 이후 새 커밋 — 머지된 PR ${fmtNums(e.merged.map((m) => m.number))} 의 head sha 와 불일치. 자동화 범위 밖`,
      });
      continue;
    }
    del.push({ name, sha, prNumbers: atMerge.map((m) => m.number) });
  }

  const fatal = errors.length > 0;
  return {
    ok: !fatal && unresolved.length === 0,
    fatal,
    /** 치명 사유가 있으면 전량 비운다 — 표본 자체를 믿을 수 없다. */
    del: fatal ? [] : del,
    /** 치명 때문에 버려진 삭제 후보 수 (침묵 방지용 계수). */
    suppressed: fatal ? del.length : 0,
    keep,
    unresolved,
    errors,
  };
}

/** 사람이 읽는 계획 출력. `mode` 는 `dry-run` / `apply` — 어느 모드로 돌았는지 항상 박는다. */
export function renderPlan(plan, { mode, repo }) {
  const lines = [];
  lines.push(`# 브랜치 정리 계획 — ${repo}`);
  lines.push(`모드: ${mode === 'apply' ? 'APPLY (실삭제)' : 'DRY-RUN (목록만, 삭제하지 않음)'}`);
  lines.push(
    `판정: 삭제 ${plan.del.length} / 보존 ${plan.keep.length} / 판정 불가 ${plan.unresolved.length} / 치명 ${plan.errors.length}`,
  );
  lines.push('');

  lines.push(`## 삭제 대상 (${plan.del.length})`);
  if (plan.del.length === 0) lines.push('(없음)');
  for (const t of plan.del)
    lines.push(`- ${t.name}  sha=${t.sha}  머지된 PR ${fmtNums(t.prNumbers)}`);
  lines.push('');

  if (plan.unresolved.length > 0) {
    lines.push(`## 판정 불가 — 삭제하지 않음 (${plan.unresolved.length})`);
    for (const u of plan.unresolved) lines.push(`- ${u.name}  [${u.reason}] ${u.detail}`);
    lines.push('');
  }
  if (plan.errors.length > 0) {
    lines.push(`## 치명 — 삭제 목록 전량 폐기 (${plan.errors.length})`);
    for (const e of plan.errors) lines.push(`- ${e}`);
    if (plan.suppressed > 0) lines.push(`- 폐기된 삭제 후보: ${plan.suppressed} 건`);
    lines.push('');
  }

  const byReason = new Map();
  for (const k of plan.keep) byReason.set(k.reason, (byReason.get(k.reason) ?? 0) + 1);
  lines.push(`## 보존 (${plan.keep.length})`);
  for (const [reason, n] of byReason) lines.push(`- ${reason}: ${n}`);
  // 이름까지 박는 보존 사유 — 「지워질 뻔했는데 안 지워진」 것들. `no-merged-pr` 은 상시 다수라 계수만.
  const NOTABLE_KEEP = ['open-pr', 'protected', 'advanced-past-merge'];
  const notable = plan.keep.filter((k) => NOTABLE_KEEP.includes(k.reason));
  for (const k of notable) lines.push(`  - ${k.name}  [${k.reason}] ${k.detail}`);

  return lines.join('\n');
}

// ─────────────────────────────────────────────────────────────────────────────
// CLI
// ─────────────────────────────────────────────────────────────────────────────

function gh(args) {
  const r = spawnSync('gh', args, { encoding: 'utf8', maxBuffer: 256 * 1024 * 1024 });
  if (r.error) throw new Error(`gh 실행 실패: ${r.error.message}`);
  if (r.status !== 0) {
    throw new Error(`gh ${args.join(' ')} → exit ${r.status}\n${(r.stderr ?? '').trim()}`);
  }
  return r.stdout;
}

/**
 * `--paginate --slurp` 은 **페이지 배열의 배열**을 준다. `--jq` 와 병용 불가이므로
 * (strip-stage-labels.yml 이 박제한 `gh 2.88.1` 실측) 평탄화는 여기서 한다.
 */
function ghPaginate(path) {
  const pages = JSON.parse(gh(['api', '--paginate', '--slurp', path]));
  if (!Array.isArray(pages)) throw new Error(`예상 밖 응답 형태: ${path}`);
  return pages.flat();
}

function fetchState(repo) {
  const [owner, name] = repo.split('/');
  // 기대 총계를 **먼저** 잡는다. 뒤에 잡으면 수집 도중 생긴 PR 이 총계를 늘려 정상 수집도
  // 누락으로 보인다. 먼저 잡으면 그 반대(수집 > 기대)만 생기고 그건 통과 방향이다.
  const rawCount = gh([
    'api',
    'graphql',
    '-f',
    `query=query{repository(owner:"${owner}",name:"${name}"){pullRequests{totalCount}}}`,
    '--jq',
    '.data.repository.pullRequests.totalCount',
  ]);
  const expectedPrCount = parseExpectedPrCount(rawCount);
  if (expectedPrCount === null) {
    throw new Error(
      `PR 기대 총계를 읽지 못했다 (원문: ${JSON.stringify(String(rawCount).trim())})`,
    );
  }

  const branches = ghPaginate(`repos/${repo}/branches?per_page=100`).map(normalizeBranch);
  const prs = ghPaginate(`repos/${repo}/pulls?state=all&per_page=100`).map((p) =>
    normalizePullRequest(p, { repo }),
  );
  return { branches, prs, expectedPrCount };
}

function resolveRepo(argRepo) {
  if (argRepo) return argRepo;
  if (process.env.GITHUB_REPOSITORY) return process.env.GITHUB_REPOSITORY;
  return gh(['repo', 'view', '--json', 'nameWithOwner', '--jq', '.nameWithOwner']).trim();
}

function main(argv) {
  const apply = argv.includes('--apply');
  const asJson = argv.includes('--json');
  const inputIdx = argv.indexOf('--input');
  const repoIdx = argv.indexOf('--repo');
  const inputFile = inputIdx >= 0 ? argv[inputIdx + 1] : null;

  if (apply && inputFile) {
    console.error('--apply 와 --input 은 함께 쓸 수 없다 (주입 입력으로 실삭제 금지)');
    return 2;
  }

  const repo = inputFile ? '(주입 입력)' : resolveRepo(repoIdx >= 0 ? argv[repoIdx + 1] : null);
  const state = inputFile ? JSON.parse(readFileSync(inputFile, 'utf8')) : fetchState(repo);

  const plan = planBranchCleanup({
    branches: state.branches,
    prs: state.prs,
    expectedPrCount: state.expectedPrCount ?? null,
  });

  const mode = apply ? 'apply' : 'dry-run';
  const text = renderPlan(plan, { mode, repo });
  console.log(text);

  const deleted = [];
  const failed = [];
  if (apply) {
    console.log('');
    for (const t of plan.del) {
      // 삭제 **전** 에 이름과 sha 를 남긴다 — 삭제는 되돌리기 어렵고, 이 한 줄이 복구 단서다
      // (`git push origin <sha>:refs/heads/<name>` 으로 되살릴 수 있다).
      console.log(`[delete] ${t.name} sha=${t.sha} 머지된 PR ${fmtNums(t.prNumbers)}`);
      try {
        gh(['api', '--method', 'DELETE', `repos/${repo}/git/refs/heads/${t.name}`]);
        deleted.push(t);
        console.log(`[deleted] ${t.name}`);
      } catch (e) {
        failed.push({ ...t, error: e.message });
        console.error(`[failed] ${t.name} — ${e.message}`);
      }
    }
    // ⚠️ `plan.ok` 가 false 여도 나머지 브랜치는 삭제된다 — F4 조문(*"그 브랜치를 삭제 대상에서
    // 빼고 실패로 보고"*)대로이나, 결과물이 「빨간 run + 부분 삭제」라 로그를 안 읽으면
    // 「실패했으니 안 지워졌겠지」로 오독된다 (PR #1248 reviewer R3). 마지막 줄에 병기해 닫는다.
    console.log(
      `\n삭제 완료 ${deleted.length} / 실패 ${failed.length} / 판정 불가 ${plan.unresolved.length} (건드리지 않음)` +
        (plan.fatal
          ? ` / 치명 ${plan.errors.length} → 삭제 후보 ${plan.suppressed} 건 전량 폐기`
          : ''),
    );
    if (!plan.ok) {
      console.log('⚠ run 은 실패로 끝나지만 위 삭제 완료 건은 이미 반영됐다 — 부분 삭제다.');
    }
  }

  if (process.env.GITHUB_STEP_SUMMARY) {
    const md = [
      `## 브랜치 정리 — ${mode === 'apply' ? '**APPLY (실삭제)**' : 'DRY-RUN (삭제하지 않음)'}`,
      '',
      '```',
      text,
      '```',
    ];
    if (apply) {
      md.push(
        '',
        `### 삭제 결과 — 성공 ${deleted.length} / 실패 ${failed.length} / 판정 불가 ${plan.unresolved.length} (건드리지 않음)`,
        '',
      );
      if (!plan.ok) {
        md.push('> ⚠ run 은 실패로 끝나지만 아래 삭제 건은 이미 반영됐다 — **부분 삭제**다.', '');
      }
      for (const t of deleted) md.push(`- \`${t.name}\` sha \`${t.sha}\` (복구 단서)`);
      for (const t of failed) md.push(`- ❌ \`${t.name}\` sha \`${t.sha}\` — ${t.error}`);
    }
    appendFileSync(process.env.GITHUB_STEP_SUMMARY, `${md.join('\n')}\n`);
  }

  if (asJson) console.log(JSON.stringify({ mode, repo, plan, deleted, failed }, null, 2));

  // 실패 신호는 두 축 — 판정 fail-closed(plan.ok) 와 삭제 실패. 어느 쪽도 조용히 넘기지 않는다.
  return plan.ok && failed.length === 0 ? 0 : 1;
}

const isDirectRun = process.argv[1] && process.argv[1].endsWith('branch-cleanup-plan.mjs');
if (isDirectRun) {
  try {
    process.exit(main(process.argv.slice(2)));
  } catch (e) {
    // 조회 실패는 전량 보존 + 실패 보고 — 「상태를 모르니 지운다」 금지 (F4).
    console.error(`[fail-closed] ${e.message}`);
    console.error('브랜치를 하나도 삭제하지 않았다.');
    process.exit(1);
  }
}
