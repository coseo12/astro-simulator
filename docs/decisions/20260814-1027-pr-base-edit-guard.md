# ADR: PR base 편집 우회 봉인 — 신규 비-required 컨텍스트로 분리, required 3개의 event 축 불변식 보존 (#1027)

- **상태**: **Provisional** — cross-validate **미수행**. CLAUDE.md §ADR Status 워크플로의 "cross-validate 발동 ADR" 에 해당하므로 (ADR 신규 + [20260807-971](20260807-971-required-status-checks.md) 개정 동반), 결과를 §11 에 4축으로 통합한 뒤 **메인**이 `Accepted` 로 전이한다. architect 는 cross-validate 를 직접 호출하지 않는다 ([#479](https://github.com/coseo12/astro-simulator/issues/479)).
- **날짜**: 2026-08-14
- **결정자**: architect (실측 기반 설계). 저장소 보호 설정 변경 권한은 사용자
- **관련**:
  - [#1027](https://github.com/coseo12/astro-simulator/issues/1027) (본 이슈)
  - [20260812-970-pr-base-rule-guard](20260812-970-pr-base-rule-guard.md) **§8-1 한계 0** (본 결함의 원 박제) / **§9 후속 1** (본 이슈로의 위임)
  - [20260807-971-required-status-checks](20260807-971-required-status-checks.md) **결정 9-1** / **Phase 1 면제 근거** / **§2-5 event _type_ 축** / **§10-5 재검토 조건 8·9** — 본 ADR 이 직접 상호작용하는 결정 조항
  - [20260806-962-branch-name-guard](20260806-962-branch-name-guard.md) §5-2 (트리거 설계) — `reopened` 제외 근거가 base 에 전이되지 않는다는 것이 본 결함의 뿌리
  - [`docs/guides/branch-strategy-workflow.md`](../guides/branch-strategy-workflow.md) §알려진 우회 — 본 결정 적용 시 동시 갱신 대상
  - [`docs/lessons/guard-pr-dod.md`](../lessons/guard-pr-dod.md) / [`docs/lessons/guard-design-principles.md`](../lessons/guard-design-principles.md)
- **교훈 적용**: "가드 설계 원칙 — measurement-first". 이슈 본문이 준 전제 2개와 후보 4개를 산문으로 판정하지 않고 **PR 전 상태 640건 전수 timeline 조회** + **#1026 내장 대조군 독립 재현** + **base 편집 5건의 SSoT 스크립트 재판정**으로 확정했다.

---

## §1 배경

[#970](https://github.com/coseo12/astro-simulator/issues/970) (PR [#1023](https://github.com/coseo12/astro-simulator/pull/1023)) 이 base 선택 규칙 가드를 `branch-name` job 의 스텝으로 배선했고, 그 job 은 `main` 의 required status check 이므로 `exit 1` 은 머지 하드 블록이다.

그러나 **PR 을 연 뒤 base 를 바꾸면 가드가 발화하지 않는다.** `branch-name-guard.yml` 의 트리거는 `types: [opened, synchronize]` 이고, base 변경은 `pull_request` 의 `edited` 액션이며 head SHA 를 바꾸지 않아 `synchronize` 도 아니다. 결과는 **stale green** — 열 때의 초록이 그대로 남고 GitHub 은 그 초록으로 머지를 허용한다.

자명한 수정 (`types` 에 `edited` 추가) 은 한 줄이지만, 그 순간 `branch-name` 은 [20260807-971](20260807-971-required-status-checks.md) **결정 9-1** 이 `pr-template-checklist` 를 required 에서 제외한 바로 그 성질 (**event _type_ 축**) 을 얻는다. 동 ADR **Phase 1 면제 근거**는 _"required 3개 중 `edited` 처럼 SHA 를 바꾸지 않는 반복 이벤트로 통과 3종 밖 결론을 만들 수 있는 것은 하나도 없다"_ 는 **정적 전수 확인** 위에 서 있고, `edited` 추가는 그 전제를 **문자 그대로 깬다**.

따라서 본 ADR 의 1차 목표는 "어떻게 막을까" 가 아니라 **"이 경로가 실제로 실현된 적 있는가, 그리고 봉인 비용이 릴리스 하드 블록 위험에 값하는가" 를 실측으로 소진하는 것**이다.

---

## §2 실측 (2026-08-14)

> 측정 도구: `gh` 2.88.1 / `jq` 1.7.1-apple / `node` v24.14.0. `gh` 는 **GET 계열 전용** (쓰기 `-X PUT/PATCH/DELETE` 미사용). 모든 절대수에 재현 술어를 동반하며, **계수 단위** (줄 / PR / occurrence) 를 항목마다 먼저 고정한다 ([20260808-983](20260808-983-measurement-recording-convention.md)).

### 2-1 전제 A 재확인 — `types` 에 `edited` 가 없다 (정적, 줄 단위)

```bash
awk '/^on:/{f=1} f{print NR": "$0} f&&/^permissions:/{exit}' .github/workflows/branch-name-guard.yml
grep -c 'edited' .github/workflows/branch-name-guard.yml; echo "rc=$?"
```

```text
106: on:
107:   pull_request:
108:     types: [opened, synchronize]
109:
110: permissions:
0
rc=1
```

⚠️ **계수 단위 = 줄이다.** `grep -c` 는 매칭 **줄 수**이지 occurrence 수가 아니다. `0` + `rc=1` 은 "해당 낱말을 가진 줄이 하나도 없다" 를 뜻한다. **전제 A 참.**

### 2-2 전제 B 재확인 — base 변경은 `edited` 이고 head SHA 를 바꾸지 않는다 (#1026 **내장 대조군**)

이슈 본문의 전제 B 는 GitHub 문서만으로는 확정되지 않는다 — `pull_request` `edited` 의 `changes` 객체 상세는 [webhook 이벤트 문서](https://docs.github.com/en/webhooks/webhook-events-and-payloads) 본문에 없고 (2026-08-14 대조), `synchronize` 설명은 _"head 브랜치가 갱신됨"_ 이라 base 변경 포함 여부가 산문상 애매하다. 그러나 **일회용 PR [#1026](https://github.com/coseo12/astro-simulator/pull/1026) 안에 대조군이 내장돼 있어 저장소 데이터만으로 결정된다.**

```bash
REPO=coseo12/astro-simulator
gh api graphql -f query='{repository(owner:"coseo12",name:"astro-simulator"){pullRequest(number:1026){timelineItems(itemTypes:[BASE_REF_CHANGED_EVENT],first:10){totalCount nodes{... on BaseRefChangedEvent{createdAt previousRefName currentRefName}}}}}}' \
  --jq '.data.repository.pullRequest.timelineItems | "totalCount(필터 무시)=\(.totalCount)", (.nodes[] | "\(.createdAt)  \(.previousRefName) -> \(.currentRefName)")'
SHA=$(gh api "repos/$REPO/pulls/1026" --jq .head.sha)
gh api "repos/$REPO/actions/runs?head_sha=$SHA&per_page=100" \
  --jq '.workflow_runs | sort_by(.created_at) | .[] | "\(.created_at)  \(.event)  \(.name)  \(.conclusion)"'
```

```text
totalCount(필터 무시)=20
2026-08-12T13:00:45Z  develop -> main

2026-08-12T13:00:13Z  pull_request  CI                            success
2026-08-12T13:00:13Z  pull_request  shader-pixel-guard            success
2026-08-12T13:00:13Z  pull_request  CI (physics-wasm)             success
2026-08-12T13:00:13Z  pull_request  Branch Name Guard             success
2026-08-12T13:00:13Z  pull_request  PR Template Checklist Guard   failure
2026-08-12T13:00:13Z  pull_request  Project Guards                success
2026-08-12T13:00:13Z  pull_request  Harness PR 자동 리뷰 트리거      success
2026-08-12T13:00:13Z  pull_request  a11y-baseline-guard           success
2026-08-12T13:00:13Z  pull_request  fps-baseline-guard            success
2026-08-12T13:00:47Z  pull_request  PR Template Checklist Guard   failure   ← base 변경 2초 후
```

**대조군의 구조.** `PR Template Checklist Guard` 는 `types: [opened, edited, synchronize]` 를 갖고, `Branch Name Guard` 는 `[opened, synchronize]` 를 갖는다. 같은 PR · 같은 head SHA 위에서 base 변경 (`13:00:45Z`) 직후 **전자만 재발화** (`13:00:47Z`) 하고 후자는 `n=1` 로 멈춘다.

- 두 run 이 **같은 `head_sha` 쿼리로 반환**되므로 head SHA 불변이 확정 → `synchronize` 아님.
- PR 은 이미 `13:00:10Z` 에 열려 있었고 `opened` 는 `13:00:13Z` 에 이미 발화 → `opened` 아님.
- ⇒ 남는 것은 `edited` 뿐. **전제 B 참** — 산문 인용이 아니라 **저장소 내 배타 소거**로 확정된다.

부수로, `changes.base` 의 존재는 [octokit 페이로드 스키마](https://github.com/octokit/webhooks/blob/main/payload-schemas/api.github.com/pull_request/edited.schema.json) 에서 `changes.base.ref.from` / `changes.base.sha.from` 로 확인된다 (`changes` 하위 3속성 `body` / `title` / `base` 전부 optional). ⚠️ **다만 GitHub Actions 의 `github.event.changes.base` 표현식이 실제로 그 값을 받는지는 본 ADR 에서 실측하지 않았다** — §4 결정 3 가 이 미실증 전제를 설계에서 제거한다.

> ⚠️ **재현 시 함정 — `timelineItems.totalCount` 는 `itemTypes` 필터를 무시한다.** 위 출력의 `20` 은 base 변경 횟수가 아니라 그 PR 의 **전체 timeline 항목 수**다. 계수는 반드시 `nodes` 배열 길이로 한다. 이 함정에 걸리면 아래 2-3 이 "640 PR 전건이 base 를 바꿨다" 는 거짓을 낸다 (초회 실행에서 실제로 발생).

### 2-3 base 편집의 **실현 이력** — 전 상태 PR 640건 전수

모집단 술어: `states: [OPEN, CLOSED, MERGED]` 전 상태 PR. GraphQL `pullRequests` 를 25건씩 페이지네이션하고 **`totalCount` 와 수집 노드 수가 일치**함을 assertion 한다 (`gh pr list --limit` 창 절단 클래스 회피).

```bash
cat > /tmp/baseref.graphql <<'EOF'
query($owner:String!, $name:String!, $cursor:String) {
  repository(owner:$owner, name:$name) {
    pullRequests(first: 25, after: $cursor, states: [OPEN, CLOSED, MERGED], orderBy: {field: CREATED_AT, direction: ASC}) {
      totalCount
      pageInfo { hasNextPage endCursor }
      nodes {
        number state createdAt baseRefName headRefName
        timelineItems(itemTypes: [BASE_REF_CHANGED_EVENT], first: 20) {
          nodes { ... on BaseRefChangedEvent { createdAt previousRefName currentRefName actor { login } } }
        }
      }
    }
  }
}
EOF
: > /tmp/baseref-pages.jsonl
CURSOR=""; PAGE=0
while :; do
  PAGE=$((PAGE+1))
  for attempt in 1 2 3; do
    if [ -z "$CURSOR" ]; then OUT=$(gh api graphql -f owner=coseo12 -f name=astro-simulator -F query=@/tmp/baseref.graphql 2>&1) && break
    else OUT=$(gh api graphql -f owner=coseo12 -f name=astro-simulator -f cursor="$CURSOR" -F query=@/tmp/baseref.graphql 2>&1) && break; fi
    OUT=""
  done
  # ⚠️ HTTP 504 는 이 쿼리에서 실제로 발생한다 (first:100 은 전건 타임아웃). 조용한 누락 금지
  [ -n "$OUT" ] || { echo "FAIL: page $PAGE 3회 재시도 실패 — 전건 재실행"; exit 1; }
  echo "$OUT" >> /tmp/baseref-pages.jsonl
  HAS=$(echo "$OUT" | jq -r '.data.repository.pullRequests.pageInfo.hasNextPage')
  CURSOR=$(echo "$OUT" | jq -r '.data.repository.pullRequests.pageInfo.endCursor')
  [ "$HAS" = "true" ] || break
done
echo "totalCount=$(head -1 /tmp/baseref-pages.jsonl | jq -r '.data.repository.pullRequests.totalCount')"
echo "fetched_nodes=$(jq -s '[.[].data.repository.pullRequests.nodes[]] | length' /tmp/baseref-pages.jsonl)"
jq -s -r '[.[].data.repository.pullRequests.nodes[]]
  | map(select((.timelineItems.nodes | length) > 0)) as $h
  | "보유 PR 수 (PR 단위) = \($h|length)",
    "총 이벤트 수 (occurrence 단위) = \([$h[].timelineItems.nodes[]]|length)",
    "first:20 포화 PR (있으면 절단) = \([$h[]|select((.timelineItems.nodes|length) >= 20)]|length)",
    ($h[] | "PR #\(.number) [\(.state)] head=\(.headRefName) 최종base=\(.baseRefName)",
      (.timelineItems.nodes[] | "    \(.createdAt)  \(.previousRefName) -> \(.currentRefName)   by \(.actor.login)"))' \
  /tmp/baseref-pages.jsonl
```

```text
totalCount=640
fetched_nodes=640
보유 PR 수 (PR 단위) = 5
총 이벤트 수 (occurrence 단위) = 5
first:20 포화 PR (있으면 절단) = 0
PR #170  [MERGED] head=feature/p4-a-asteroid-nbody              최종base=main
    2026-04-16T05:18:20Z  feature/p4-d-gpu-timer -> main   by coseo12
PR #212  [MERGED] head=feature/206-yoshida-integrator           최종base=main
    2026-04-18T07:27:57Z  develop -> main   by coseo12
PR #217  [MERGED] head=feature/208-p7-c-ray3d                   최종base=main
    2026-04-18T10:40:26Z  develop -> main   by coseo12
PR #356  [CLOSED] head=experiment/348-meta-gate-positive-control 최종base=develop
    2026-04-26T13:29:15Z  feature/348-r1-guard-ci-step-integration -> develop   by coseo12
PR #1026 [CLOSED] head=docs/970-guard-baseedit                  최종base=main
    2026-08-12T13:00:45Z  develop -> main   by coseo12
```

**보유 PR `5` 건 전부 이벤트가 정확히 1회씩**이다 (PR 단위 `5` = occurrence 단위 `5`). 즉 **한 PR 에서 base 를 두 번 이상 바꾼 사례는 `0` 건**이며, 이 사실이 §3-1 후보 1 의 위험 평가를 직접 결정한다.

### 2-4 실현 이력의 **규칙 판정** — 5/5 가 현행 규칙 FAIL, 3건은 `main` 에 머지됨

```bash
while IFS='|' read -r N B H; do
  out=$(node scripts/verify-pr-base-rule.mjs --pr base="$B" head="$H" 2>&1); rc=$?
  printf "#%-5s rc=%s  base=%-8s head=%s\n" "$N" "$rc" "$B" "$H"
done <<'EOF'
170|main|feature/p4-a-asteroid-nbody
212|main|feature/206-yoshida-integrator
217|main|feature/208-p7-c-ray3d
356|develop|experiment/348-meta-gate-positive-control
1026|main|docs/970-guard-baseedit
EOF
```

```text
#170   rc=1  base=main     head=feature/p4-a-asteroid-nbody
#212   rc=1  base=main     head=feature/206-yoshida-integrator
#217   rc=1  base=main     head=feature/208-p7-c-ray3d
#356   rc=1  base=develop  head=experiment/348-meta-gate-positive-control
#1026  rc=1  base=main     head=docs/970-guard-baseedit
```

`#170` `#212` `#217` `#1026` 은 `violation` (`base='main'` ← work shape), `#356` 은 `unresolved` (`experiment/` 는 허용 type 밖 · 귀속 `branch-name`) 이다. 판정 3종은 [20260812-970](20260812-970-pr-base-rule-guard.md) §4.

**머지 여부** (`gh api repos/coseo12/astro-simulator/pulls/<N>`):

| PR | 머지 | 머지 시각 | 비고 |
| --- | --- | --- | --- |
| `#170` | **예** | `2026-04-16T05:19:03Z` | base 변경 **43초** 후 머지 |
| `#212` | **예** | `2026-04-18T08:11:24Z` | base 변경 44분 후 |
| `#217` | **예** | `2026-04-18T11:35:00Z` | base 변경 55분 후 |
| `#356` | 아니오 | — | DRAFT, close 예정 명시 |
| `#1026` | 아니오 | — | 본 결함 실증용 일회용 PR (close + 브랜치 삭제 완료) |

⚠️ **소급 판정임을 명시한다 (과장 금지).** `#170` `#212` `#217` 은 **`2026-04-16 ~ 04-18`** 이고, 이 저장소가 dual PR 변형을 폐기하고 정석 gitflow 로 복원한 것은 **`2026-04-19`** (upstream ADR [20260419-gitflow-main-develop](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-gitflow-main-develop.md), [`docs/deployment-patterns.md`](../deployment-patterns.md) §채택 배경) 이다. 즉 세 건은 **당시 정책상 적법**했고 위 `rc=1` 은 오늘의 규칙을 소급 적용한 값이다. 남는 사실은 규범 판정이 아니라 **행동 이력**이다 — _"PR 을 연 뒤 base 를 `main` 으로 바꿔 머지한다"_ 는 이 저장소 작성자의 실행 레퍼토리 안에 있고, 그 경로를 오늘 막는 것은 `branch-name` 의 `opened` 판정뿐이며 그것이 정확히 우회된다.

**현행 체제 base rate.** gitflow 복원 (`2026-04-19`) 이후 organic base 편집은 `#356` **1건** (`2026-04-26`, `→ develop` 방향, 미머지) 이 마지막이고, 이후 **`110일` 무발생**이다 (`#1026` 은 본 결함 실증용 인위 PR 이라 organic 계수에서 제외). 술어는 위 2-3 출력의 `createdAt` 열이며 별도 조회가 필요 없다.

### 2-5 자동 base 변경 (auto-retarget) — `0` 건

base 는 사람 조작 없이도 바뀔 수 있다 (base 브랜치가 머지·삭제될 때 GitHub 이 자식 PR 을 자동 retarget). 이 저장소는 봇 PR 이 `base=<type>/*` 로 열리는 실측 17건이 있어 ([20260812-970](20260812-970-pr-base-rule-guard.md) §2-1) 발현 가능 구조를 갖는다. 2-3 과 동일한 페이지네이션에 `itemTypes: [AUTOMATIC_BASE_CHANGE_SUCCEEDED_EVENT, AUTOMATIC_BASE_CHANGE_FAILED_EVENT]` 를 넣어 전수 조회한 결과:

```text
pages=26  fetched=640  totalCount=640
자동 base 변경 보유 PR (PR 단위) = 0
이벤트 (occurrence 단위) = 0
```

⇒ 신규 가드가 **사람 조작 없는 발화**로 노이즈를 만들 경로는 현재 `0` 이다.

### 2-6 `edited` 발화 빈도 — 후보 1 이 required 컨텍스트에 얹을 누적량

`branch-name` 은 `(opened + synchronize)`, `pr-template-checklist` 는 `(opened + edited + synchronize)` 에서 발화하므로 (양쪽 다 path 필터 `0`), 같은 head SHA 위 두 체크런 수의 차이가 **그 PR 의 `edited` 발화 횟수**다. 모집단 = 최근 머지 PR 40건.

```bash
REPO=coseo12/astro-simulator
gh pr list --repo "$REPO" --state merged --limit 40 --json number,headRefOid,baseRefName,headRefName \
  -q '.[] | "\(.number)\t\(.headRefOid)\t\(.baseRefName)\t\(.headRefName)"' > /tmp/recent40.tsv
[ "$(wc -l < /tmp/recent40.tsv)" -eq 40 ] || { echo "FAIL: 40건 미확보"; exit 1; }
TOT=0; N_PR=0; NZ=0
while IFS=$'\t' read -r N SHA BASE HEAD; do
  # ⚠️ `| jq` 는 GitHub 이 check-run output 에 넣는 raw 제어문자에 파싱 실패한다 → gh 내장 --jq 사용
  # ⚠️ jq 는 `,` 가 `|` 보다 강하게 묶으므로 두 집계는 각각 괄호로 감싼다
  R=$(gh api "repos/$REPO/commits/$SHA/check-runs?per_page=100" \
       --jq '([.check_runs[]|select(.name=="branch-name")]|length|tostring) + "\t" + ([.check_runs[]|select(.name=="pr-template-checklist")]|length|tostring)') \
    || { echo "FAIL: #$N 조회 실패 — 전건 재실행"; exit 1; }
  BN=$(printf '%s' "$R" | cut -f1); PTC=$(printf '%s' "$R" | cut -f2); D=$((PTC-BN))
  TOT=$((TOT+D)); N_PR=$((N_PR+1)); [ "$D" -gt 0 ] && NZ=$((NZ+1))
  printf "#%-6s %-8s bn_n=%s ptc_n=%s delta=%s %s\n" "$N" "$BASE" "$BN" "$PTC" "$D" "$HEAD"
done < /tmp/recent40.tsv
echo "모집단 = 최근 머지 PR $N_PR 건 / delta 총합 (occurrence 단위) = $TOT / delta >= 1 인 PR 수 = $NZ"
```

```text
모집단 = 최근 머지 PR 40 건 / delta 총합 (occurrence 단위) = 10 / delta >= 1 인 PR 수 = 8
```

핵심은 두 가지다.

1. **`branch-name` 은 40/40 전건 `n=1`.** 현재 required 컨텍스트 중 이 이름은 동명 누적이 전혀 없다 (§2-6 실측 3 의 event _type_ 축 `0` 이 오늘도 유지된다).
2. **후보 1 채택 시 그 `n=1` 이 `8/40` (`20%`) 의 PR 에서 `n>=2` 로 바뀐다.** delta 는 `1` 또는 `2` (`#1036` `#1018` 이 `2`).

### 2-7 게이팅 경로 (`base=main`) 한정 — 155 PR 전건

required check 가 실제로 머지를 막는 것은 `base=main` PR 뿐이다 (`develop` 은 required 영구 미채택 — [20260807-971](20260807-971-required-status-checks.md) 결정 2). 2-3 의 640건에서 `baseRefName == "main" and state == "MERGED"` 를 추출하면 **155 PR** 이고, 전건에 대해 위와 같은 집계를 돌렸다.

```text
모집단 base=main ∧ MERGED = 155 PR
pr-template-checklist 체크런 0건 (해당 가드 도입 이전) = 96 PR
ptc_n >= 2 (edited 누적 발생) = 3 PR
그중 통과/미통과 결론이 갈린 PR = 3 PR
  #519  ptc_n=2  conclusions=[success,failure]
  #668  ptc_n=2  conclusions=[success,failure]
  #829  ptc_n=2  conclusions=[success,failure]
```

즉 게이팅 경로에서 `edited` 가 누적을 만든 비율은 **`3 / 59`** (가드 도입 이후 모집단 기준, `155 - 96 = 59`) 다.

⚠️ **이 `3` 을 후보 1 의 위험량으로 그대로 읽으면 안 된다 — 판정 입력이 다르다.** `pr-template-checklist` 의 판정 입력은 **PR 본문**이고 `edited` 가 바꾸는 것이 정확히 그 본문이라 결론이 갈리는 것이 **설계상 유도**된다 (§2-6 원인 ②). 반면 `branch-name` 의 판정 입력은 **`(base, head)` 두 ref** 뿐이므로 제목·본문 편집으로는 결론이 바뀌지 않는다 — `{success, success}` 누적일 뿐이고, 전건 통과 누적이 머지를 막지 않는다는 것은 [20260807-971](20260807-971-required-status-checks.md) §10-2 조건 3 (`project-guards` `n=2` 둘 다 `success` → `mergeStateStatus=CLEAN`) 에서 이미 실증됐다.

**후보 1 에서 결론이 갈리는 유일한 경로는 「base 를 나쁜 값으로 바꿨다가 되돌리는 것」** (`{success, failure, success}`) 이고, 그 base rate 는 2-3 이 이미 준다 — **한 PR 에서 base 를 2회 이상 바꾼 사례 `0 / 640`**.

---

## §3 후보 비교

축은 **① 강제력 / ② required 3개 event 축 불변식 (971 Phase 1 면제 근거) / ③ 저장소 설정 변경 / ④ 오차단 최악 시나리오와 복구 / ⑤ 기술적 실현 가능성**이다.

| 후보 | ① 강제력 | ② 불변식 | ③ 설정 변경 | ④ 최악 시나리오 | ⑤ 실현 |
| --- | --- | --- | --- | --- | --- |
| **1. `types` 에 `edited` 추가** | **하드 블록** | **파괴** — required 컨텍스트가 SHA 불변 반복 이벤트로 통과 3종 밖 결론 생성 가능 | 0 | `{success, failure, success}` 영구 공존 → 해석 규칙이 all-must-pass 면 릴리스 하드 블록. 복구는 §9-2 (2초) 또는 head SHA 교체 | 가능 |
| **2. 별도 비-required 컨텍스트** | 붉은 X (가시성 `0 → 1`) | **보존** — required 3개의 `types:` 무변경 | 0 | 새 컨텍스트가 오탐해도 **머지 차단 없음** | 가능 |
| **3. 머지 시점 검사 (`closed(merged)`)** | 없음 (사후) | 보존 | 0 | 없음 | 가능하나 **가치가 술어로 대체된다** (아래) |
| **4. GitHub ruleset** | — | — | **필요 (PUT)** | — | **불가능 — 규칙 타입이 없다** |

### 3-1 후보 1 — `types` 에 `edited` 추가

**깨지는 것이 무엇인지 정확히.** [20260807-971](20260807-971-required-status-checks.md) Phase 1 면제 근거는 4개의 직교한 다리로 서 있고 (소급 리허설 / `G2` 1회 실행 / **`types:` 전수 정적 확인** / `S4` 사전 확인), 후보 1 이 부러뜨리는 것은 **세 번째 다리 하나**다. 그 다리의 문장은 _"required 3개 중 `edited` 처럼 SHA 를 바꾸지 않는 반복 이벤트로 **통과 3종 밖 결론을 만들 수 있는 것은 하나도 없다**"_ 이고, `edited` 를 넣으면 `branch-name` 이 `edited` 로부터 `failure` 를 낼 수 있게 되어 **문자 그대로 거짓이 된다**.

**그런데 위험량은 이슈 본문이 가정한 것보다 작다** (§2-6 · §2-7 · §2-3):

- 제목·본문 편집으로는 결론이 갈리지 않는다 (판정 입력이 ref 뿐).
- 전건 통과 누적 (`n>=2`, all `success`) 은 required 하에서 머지를 막지 않음이 이미 실증됐다 (971 §10-2 조건 3).
- 결론이 갈리는 유일한 경로 (base 2회 변경) 의 base rate 는 **`0 / 640 PR`**.

**그럼에도 채택하지 않는 근거 3항** (기각이 아니라 **명시적 유예** — §6 · §재도입 트리거):

1. **971 이 스스로 정한 안전 확인 절차를 사전에 수행할 수 없다.** §10-5 재검토 조건 9 는 required 축에 SHA 불변 반복 이벤트가 들어올 때 _"`G2` 를 그 컨텍스트를 포함한 목록으로 1회 실행"_ 하되 _"대상 SHA 가 그 컨텍스트에 대해 `n >= 2` 인지 먼저 확인"_ 하라고 요구한다. `branch-name` 은 오늘 **40/40 전건 `n=1`** (§2-6) 이므로 그런 표본이 **구조적으로 존재하지 않는다.** 즉 후보 1 의 안전은 971 의 판정식으로 **사전 확정 불가**이며, 확정하려면 일회용 PR 로 그 상태를 **먼저 만들어야** 한다. 그것이 곧 본 이슈 DoD 3 의 negative 실증이고, 본 ADR 은 그 실험을 후보 2 채택의 **부산물**로 확보한다 (§7).
2. **`if:` 로 좁히는 변형은 이 저장소가 명시 금지한 구조다.** `github.event.changes.base` 유무로 job 을 좁히면 (a) `opened` / `synchronize` 에서도 `changes` 가 없어 함께 스킵되므로 `github.event.action != 'edited' || …` 형태의 **이벤트 분기**가 필수인데, 이는 `branch-name-guard.yml` 헤더가 스스로 _"CLAUDE.md §가드 설계 원칙이 금지하는 fallback 분기와 구조가 같다 (한쪽 이벤트에서 조용히 스킵)"_ 며 배제한 형태다. (b) 게다가 스킵된 job 도 `skipped` 체크런을 만들므로 (`#1026` 의 `retry-fresh-runner -> skipped` 실측) required 컨텍스트의 누적 자체는 사라지지 않는다. (c) `github.event.changes.base` 가 Actions 표현식으로 실제 전달되는지는 **미실측**이다 (§2-2 말미).
3. **비대칭 비용.** 971 §1 이 세운 원칙 — _"켜지 않으면 가드가 권고에 머무를 뿐이지만, 잘못 켜면 릴리스가 하드 블록된다"_ — 하에서, base rate `0 / 110일` (§2-4) 인 사건을 막기 위해 릴리스 경로의 하드 블록 표면을 넓히는 것은 **아직 근거가 서지 않는다**. 후보 2 는 같은 사건을 `0` 비용으로 **관측 가능**하게 만들고, 관측이 쌓이면 후보 1 로 승격할 근거가 생긴다.

### 3-2 후보 2 — 별도 비-required 컨텍스트 (**채택**)

`edited` 를 required 컨텍스트에 들이는 대신, **동일 판정을 새 비-required 컨텍스트에 복제**한다. required 3개의 `types:` 는 한 글자도 바뀌지 않으므로 971 Phase 1 면제 근거의 세 번째 다리가 **문자 그대로 보존**된다.

- 판정 로직은 `scripts/verify-pr-base-rule.mjs` **단일 SSoT 재사용** — 축자 사본 `0` ([20260812-970](20260812-970-pr-base-rule-guard.md) §5 의 `BASE_RULES` 원칙 유지).
- 새 체크 이름이므로 required 목록 (`["project-guards", "branch-name", "label-pr"]`, 2026-08-14 GET 실측) 과 무관하고, 저장소 보호 설정 변경이 **`0`** 이다.
- 대가: **강제력이 붉은 X 에 머문다.** 이 저장소에서 붉은 X 를 단 채 머지한 escape 는 릴리스 클래스에서 **4건** 관측된 이력이 있고 (전부 `2026-06-08~10`), 최근 `63일` 은 **`0`** 이다 ([20260807-971](20260807-971-required-status-checks.md) §10-5 항 13 기준선). 즉 붉은 X 는 이 저장소에서 **대체로 존중되지만 보장은 아니다** — 그래서 §9-2 가 escape 를 세는 술어를 함께 박제한다.

### 3-3 후보 3 — 머지 시점 검사 (`pull_request` `closed(merged)`)

**기각.** 차단력이 `0` 인 것은 이슈 본문도 인정하므로 남는 가치는 _"회귀 이력이 남는다"_ 하나인데, **그 이력은 workflow 없이 사후 전수 재구성이 가능하다.** 본 ADR §2-3 + §2-4 가 그것을 이미 수행했다 — `BaseRefChangedEvent` 는 PR timeline 에 영구 보존되고, 최종 `(base, head)` 는 PR 객체에 있으며, 판정은 `verify-pr-base-rule.mjs` 로 언제든 재현된다. 즉 후보 3 이 주는 것은 _"이력"_ 이 아니라 **_"알림의 적시성"_** 하나이고, 그 알림이 붙는 곳은 **이미 닫힌 PR** 이라 아무도 보지 않는다. 상시 CI job 을 하나 늘리는 비용에 값하지 않는다.

대신 그 가치를 **§9-2 재검토 조건의 기계 술어**로 흡수한다 (971 §10-5 항 13 이 escape 를 workflow 가 아니라 술어로 센 것과 같은 형태).

### 3-4 후보 4 — GitHub ruleset

**기각 — 기술적으로 표현 불가능하다.** [ruleset 규칙 목록](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets) (2026-08-14 대조) 에는 _"이 base 로는 이런 head 만 PR 을 열 수 있다"_ 는 **base/head 쌍 제약 규칙이 없다**. PR 계열 규칙은 `Require a pull request before merging` / `Require status checks` 등이고, 브랜치 이름 패턴 규칙 (`Restrict creations` / `Restrict updates` / `Restrict deletions`) 은 **브랜치 조작**에 걸리지 브랜치 **쌍**에 걸리지 않는다.

기술적 불가만으로 기각이 확정되므로 SSoT 논쟁 ([#962](https://github.com/coseo12/astro-simulator/issues/962) §11-2 _"리포 밖 두 번째 출처"_ / [20260807-971](20260807-971-required-status-checks.md) §3-3) 은 **판정에 필요하지 않다** — 다만 두 선행 기각과 결론이 일치하므로 재론 근거도 없다.

### 3-5 검토 후 기각한 변형 2건 (실제 검토분 — 목록 채우기 아님)

| 변형 | 내용 | 기각 근거 |
| --- | --- | --- |
| **5. 동명 체크런 재사용** | 새 workflow 의 job `name:` 을 **`branch-name`** 으로 두어, 설정 변경 없이 required 컨텍스트에 `failure` 를 얹는다 | **미문서화 동작에 의존한다.** GitHub 은 동명 체크런 N개의 해소 규칙을 문서화하지 않았고 (971 §2-2), 오히려 _"Using the same job name in multiple workflows can cause ambiguous status check results and **block pull requests from being merged**"_ 라고 **명시 경고**한다. 971 이 3라운드에 걸쳐 축소하려 애쓴 동명 노출을 **의도적으로 제조**하는 셈이라 방향이 정반대다 |
| **6. 봇의 `REQUEST_CHANGES` 리뷰** | base 위반 시 `github-actions[bot]` 이 변경 요청 리뷰를 남겨 머지를 막는다. `main` 은 `required_pull_request_reviews` 를 보유 (`required_approving_review_count: 0`, 2026-08-14 GET) | **차단 성립 여부가 미실증**이다 (`count: 0` 조건에서 changes-requested 가 머지를 막는지 실측 없음). 성립한다면 `pull-requests: write` 권한을 가드에 부여해야 하는데, `branch-name-guard.yml` 이 `contents: read` 만으로 설계된 근거 (971 · 962 의 권한 최소화) 와 충돌한다. 새 사회기술 메커니즘을 도입하면서 그 반경을 실측 없이 여는 것은 measurement-first 위반. **후속 판단 대상으로도 열지 않는다** — 후보 1 이 같은 목적을 문서화된 메커니즘으로 달성하므로 이 변형은 지배당한다 |

---

## §4 결정

### 결정 1 — 후보 2 채택: `edited` 는 **신규 비-required 컨텍스트**로 받는다

새 workflow `.github/workflows/pr-base-edit-guard.yml` 을 추가하고, job id 겸 체크 이름을 **`pr-base-edit`** 으로 둔다.

**이름 충돌 확인 (2026-08-14 전수).** 체크런 이름은 job 레벨 `name:` 이 있으면 그것, 없으면 job id 다. 두 집합을 모두 훑어 `pr-base-edit` 이 **미충돌**임을 확인했다.

```bash
# (1) job id 전수 — ⚠️ `on:` 하위 이벤트 키(`pull_request` / `push` / `workflow_dispatch`)가
#     같은 들여쓰기라 함께 걸리므로 명시 제외한다. 이 제외를 빼면 계수가 21 로 부풀고
#     "job id 21개" 라는 거짓이 된다
grep -rhE '^  [a-zA-Z0-9_-]+:$' .github/workflows/*.yml | tr -d ' :' | sort -u \
  | grep -vxE 'pull_request|push|workflow_dispatch' > /tmp/jobids.txt
wc -l < /tmp/jobids.txt                      # 줄 단위 계수 — 기대 18
grep -cx 'branch-name'  /tmp/jobids.txt      # 양성 대조군 — 기대 1
grep -cx 'pr-base-edit' /tmp/jobids.txt      # 기대 0 (rc=1)
# (2) job 레벨 name: 오버라이드 전수
grep -rnE '^    name: ' .github/workflows/*.yml
```

```text
      18
1
0
.github/workflows/ci-physics-wasm.yml:59:    name: diff-scope-wasm
```

job id 18개: `a11y-baseline-guard` `aggregate` `bench` `bootstrap` `branch-name` `close-linked-issues` `detect-and-test` `diff-scope` `duplicate-function-guard` `label-pr` `long-integration-rust` `measure` `plan` `pr-template-checklist` `project-guards` `retry-fresh-runner` `verify` `verify-and-rust`. 오버라이드는 `diff-scope-wasm` 하나 ([20260807-971](20260807-971-required-status-checks.md) 결정 6-2). ⇒ 체크 이름 모집단 19개 어디에도 `pr-base-edit` 은 없다.

> ⚠️ **양성 대조군을 함께 돌리는 이유.** `grep -cx` 는 술어가 어긋나도 (예: 들여쓰기를 지우지 않아 앞에 공백이 남으면) **항상 `0`** 을 내므로, `0` 하나만으로는 _"없다"_ 와 _"술어가 틀렸다"_ 가 구분되지 않는다. 실재하는 이름으로 `1` 이 나오는 것을 같은 실행에서 확인해야 `0` 이 의미를 갖는다.

### 결정 2 — 트리거는 `types: [edited]` **단독**, `branches:` 필터 **미사용**

- **`opened` / `synchronize` 를 넣지 않는다.** 그 두 이벤트는 `branch-name` 의 base 스텝이 이미 required 로 덮고 있다 (`opened` = 최초 판정 / `synchronize` = base 편집 후 push 하면 새 head SHA 에서 재판정). 넣으면 같은 판정이 두 이름으로 중복 발화해 alert fatigue ([20260701-779](20260701-779-ci-alert-fatigue-concurrency.md) 계보) 를 만든다.
- **`branches:` 필터 미사용** — `branch-name-guard.yml` 과 같은 근거다. 봇 PR 17건이 `base=<type>/*` 로 열리므로 필터를 걸면 정확히 그 브랜치가 사각지대가 된다 ([20260806-962](20260806-962-branch-name-guard.md) §5-2).

### 결정 3 — `if:` 조건을 **두지 않는다** (미실증 전제의 구조적 제거)

`github.event.changes.base` 로 발화를 좁히지 않는다. 근거 3항:

1. **좁힐 이유가 사라졌다.** 좁히기의 목적은 required 컨텍스트의 누적 억제였는데 (§3-1 (b)), `pr-base-edit` 은 required 가 아니므로 누적이 **무해**하다. 남는 비용은 제목·본문 편집당 CI `~12초` 이며 발화 빈도는 `10 occurrence / 40 PR` (§2-6) 이다.
2. **미실증 전제를 설계에서 제거한다.** `changes.base` 가 Actions 표현식으로 실제 전달되는지는 실측되지 않았다 (§2-2). 그 값에 의존하지 않으면 **틀릴 수 있는 전제 자체가 없다** — 전달되지 않는 경우 `if` 가 상시 false 가 되어 가드가 **조용히 아무것도 안 하는** 최악의 실패 모드가 열리는데, 조건을 두지 않으면 그 모드가 구조적으로 불가능하다.
3. **fallback 분기 금지 준수** — `branch-name-guard.yml` 헤더 · CLAUDE.md §가드 설계 원칙.

부수 대가 (명시): 제목·본문만 편집해도 판정이 돌아, head 이름이 규약 밖인 PR 은 `pr-base-edit` 에서도 `unresolved` (exit 1) 를 받아 **붉은 X 가 두 개**가 된다. 진단 메시지는 정확하고 (`귀속: branch-name` — [20260812-970](20260812-970-pr-base-rule-guard.md) §4) 새로 막히는 PR 은 `0` 이므로 수용한다.

### 결정 4 — `concurrency` 를 **추가하지 않는다**

[20260807-971](20260807-971-required-status-checks.md) 결정 9-2 의 논리를 그대로 계승한다. `edited` 는 사람 페이스 이벤트라 재트리거 연속 쌍의 대다수가 겹치지 않고 (저장소 전체 `27` 쌍 중 겹침 `5`), 겹치는 경우 `cancel-in-progress` 는 `cancelled` 를 제조해 코스메틱 CANCELLED run 을 늘린다 ([`operational-friction.md`](../ops/operational-friction.md) §4). `branch-name-guard.yml` 이 concurrency 를 **보유**하는 근거는 `synchronize` 연타 dedup 인데, 본 workflow 에는 `synchronize` 가 없다.

### 결정 5 — `permissions: contents: read`

어노테이션 (`::error::`) 만 사용하므로 write 권한 불요. 변형 6 (봇 리뷰) 을 기각한 결과이기도 하다 (§3-5).

### 결정 6 — [20260807-971](20260807-971-required-status-checks.md) **§10-5 재검토 조건 14 신설** (본 PR 동시 반영)

후보 1 을 유예한 사실과 그 해제 조건을 **971 안에** 착지시킨다. 결정 9-1 이 사는 문서에 두지 않으면 _"escape 가 재발하면 971 이 다룬다"_ 가 참이 아니었던 [#1035](https://github.com/coseo12/astro-simulator/issues/1035) 의 재생산이 된다.

- 971 의 **상태는 `Accepted` 유지** (항 13 을 신설한 PR [#1069](https://github.com/coseo12/astro-simulator/pull/1069) 와 동일 처리 — §10-5 는 additive).
- **항 13 무접촉.**
- 신설 조항 본문은 §9-2 재검토 조건 1 과 동일 술어를 쓴다 (두 문서가 같은 판정식을 갖도록).

---

## §5 관할 경계 — 무엇을 건드리고 무엇을 건드리지 않는가

| 대상 | 본 결정의 접촉 | 근거 |
| --- | --- | --- |
| `main` required 목록 (저장소 설정) | **무접촉** — `gh api -X PUT` 계열 미사용 | 결정 1 (새 이름은 required 가 아님) |
| 971 **결정 1** (Phase 표) | **무접촉** | 새 컨텍스트를 required 에 넣지 않음 |
| 971 **결정 9-1** (`pr-template-checklist` 제외) | **무접촉** | 대상 워크플로가 다름 |
| 971 **Phase 1 면제 근거** 세 번째 다리 (`types:` 전수) | **무접촉 — 문자 그대로 보존** | required 3개의 `types:` 무변경 |
| 971 **§10-5** | **항 14 신설 (additive)** | 결정 6 |
| 971 **§10-5 항 13** | **무접촉** | #1069 의 산출물 |
| `.github/workflows/branch-name-guard.yml` | **무접촉** | 결정 1·2 |
| `scripts/verify-pr-base-rule.mjs` | **무접촉** (재사용만) | 결정 1 |
| `.claude/**` | **무접촉** | [20260812-970](20260812-970-pr-base-rule-guard.md) §6-2-b — base 는 PR 생성 후 변경 가능하므로 pre-flight 의무화의 전제가 성립하지 않는다 |

⚠️ **후보 1 은 이 경계 안쪽이다** (설정 변경 `0`). 후보 1 이 관할을 넘는 지점은 저장소 설정이 아니라 **971 결정 조항의 전제** 다 — 즉 "권한" 이 아니라 "결정 재개봉" 이 비용이다. 반대로 후보 4 는 `PUT /repos/.../rulesets` 가 필요해 **경계 밖**이고, 기술적으로도 불가능하다 (§3-4).

---

## §6 후보 1 은 기각이 아니라 **유예**다 (침묵 기각 금지)

이슈 본문의 요구 — _"기각도 결론이다. 기각 시 «base 편집 우회는 열려 있으며 어떤 가드도 막지 않는다» 를 ADR 971 에 명시하라"_ — 에 대한 본 ADR 의 답은 다음과 같다.

**전면 기각은 하지 않았다.** 후보 2 채택으로 _"어떤 가드도 막지 않는다"_ 는 상태는 해소되고, **탐지는 100% · 차단은 0%** 라는 정확한 상태로 이동한다. 이 상태를 흐리지 않기 위해 세 곳에 같은 문장을 박제한다 (§8 산출물):

> `pr-base-edit` 은 **required 가 아니다.** base 편집으로 규칙을 위반하면 붉은 X 가 뜨지만 **머지는 기계적으로 막히지 않는다.**

**후보 1 로의 승격 조건은 §9-2 재검토 조건 1 · 2 (= 971 §10-5 항 14)** 이며, 승격은 자동이 아니다 — 971 결정 1 Phase 표 개정 + 사용자 승인 + 저장소 설정 변경을 요구한다.

---

## §7 DoD 4축 적용 판정 ([guard-pr-dod.md](../lessons/guard-pr-dod.md))

본 ADR 은 설계 결정이고 구현은 후속 (`stage:dev`) 이다. 구현 PR 이 충족해야 하는 4축을 여기서 고정한다.

| 축 | 요구 | 비고 |
| --- | --- | --- |
| **1. 격리 동적 테스트** | 로컬에서 `node scripts/verify-pr-base-rule.mjs --pr base=… head=…` 를 `pass` / `violation` / `unresolved` 3셀에 대해 실행. **신규 픽스처 불요** — 판정 로직 무변경이므로 [20260812-970](20260812-970-pr-base-rule-guard.md) §7-1 픽스처가 그대로 유효하다 | 회귀 표면 `0` |
| **2. 3중 시뮬레이션 (positive → negative → recovery)** | **일회용 PR 1건**으로 라이브 재현: (P) `<type>/*` → `base=develop` 로 open → `pr-base-edit` **미발화** (트리거에 `opened` 없음) + `branch-name` `success` → (N) `gh pr edit --base main` → **`pr-base-edit` 이 새로 생성되고 `failure`** → (R) `gh pr edit --base develop` → `pr-base-edit` **`success`**. ⚠️ **본 이슈 DoD 3 의 negative 실증이 정확히 (N) 이며, #1026 실측의 역재현이다.** 검증 후 **close + 브랜치 삭제 필수 (머지 금지)** | (N) 이 실패하면 결정 2·3 이 무효 |
| **3. 5 페르소나 self-consistency** | **해당 없음** — `.claude/**` 무접촉 (§5). `scripts/verify-agent-ssot.sh` 는 그대로 PASS | |
| **4. 메타 측정 도구 자기 적용** | 구현 PR 자신이 `pr-base-edit` 체크런을 갖는지 확인. ⚠️ **자기 적용이 자동으로 되지 않는다** — 트리거가 `edited` 단독이라 PR 본문을 한 번 편집해야 첫 체크런이 생긴다. 그 사실 자체를 PR 본문에 박제할 것 | |

**추가 실측 의무 (구현 PR)**: 위 (N) 단계에서 **required 3개의 체크런 수가 변하지 않았음**을 같은 SHA 에서 확인한다 (`branch-name` `n=1` 유지). 이것이 §5 의 "불변식 보존" 주장에 대한 라이브 증거이며, 정적 주장만으로 두지 않는다.

```bash
gh api "repos/coseo12/astro-simulator/commits/<head-sha>/check-runs?per_page=100" \
  --jq '[.check_runs[].name] | group_by(.) | map({name: .[0], n: length}) | .[] | "\(.name)  n=\(.n)"'
```

시연 (`<head-sha>` = `#1026` 의 `7c34c497…`, 2026-08-14 실행) — §2-2 의 주장이 이 한 출력에 그대로 보인다:

```text
branch-name            n=1     ← base 를 편집했는데도 1
pr-template-checklist  n=2     ← 같은 SHA · 같은 PR. 차이는 `types` 의 `edited` 하나뿐
(외 14개 이름 전부 n=1)
```

---

## §8 비목표 (이번 범위에서 손대지 않음)

1. `branch-name-guard.yml` 의 `types:` 변경 — §6 유예.
2. `main` 의 required 목록 변경 — 사용자 관할 + 971 결정 1 관할.
3. `develop` 의 required check 도입 — 971 결정 2 로 **영구 미채택**.
4. `BASE_RULES` 확장·수정 — [20260812-970](20260812-970-pr-base-rule-guard.md) §5 관할. 본 결정은 판정 시점만 늘린다.
5. `.claude/**` 에 base pre-flight 의무 추가 — [20260812-970](20260812-970-pr-base-rule-guard.md) §6-2-b.
6. 봇 리뷰 / 동명 체크런 재사용 — §3-5 기각.
7. 971 §10-5 항 13 및 escape 대장 — #1069 산출물, 무접촉.

**구현 PR 의 동시 갱신 의무 (산출물)**: (a) [`docs/guides/branch-strategy-workflow.md`](../guides/branch-strategy-workflow.md) §알려진 우회 — _"미해결"_ → _"탐지는 봉인, 차단은 미봉인"_ 으로 갱신 + §6 의 문장 박제. (b) [20260812-970](20260812-970-pr-base-rule-guard.md) §8-1 한계 0 에 **Amendment 주석** (본문은 이력이므로 덮어쓰지 않고 회수 표시 — 동 ADR §6-3 이 쓴 것과 같은 형식). (c) CHANGELOG `[Unreleased]` — ⚠️ **`[0.72.0]` 이하 릴리스 구간의 동일 서술은 이력이므로 무접촉.** (d) 새 workflow 헤더에 §6 문장.

---

## §9 결과 / 한계 / 재검토 조건

### 9-1 한계

1. **차단력 `0`.** §6 · §3-2. 이것이 본 결정의 1차 비용이며 축소해 적지 않는다.
2. **`opened` 시점의 base 위반은 여전히 `branch-name` 단독 관할이다.** `pr-base-edit` 은 `edited` 에만 발화하므로, 처음부터 잘못된 base 로 연 PR 에는 체크런을 만들지 않는다. 설계상 의도이나 (결정 2), 훗날 `branch-name` 이 required 에서 내려가면 (970 §8-2 재검토 조건 2) 두 층이 동시에 약해진다.
3. **`pr-base-edit` 은 현재 형태로 required 화가 원리적으로 불가능하다.** `types: [edited]` 단독이라 편집 없는 PR 에서는 체크런이 **아예 생성되지 않고**, required 로 올리면 **영구 `Pending` → 머지 영구 차단**이 된다 (971 §2-2 workflow 단위 스킵 행 / GitHub 공식 권고 _"Avoid requiring workflows that can be skipped"_). 승격 시에는 `types` 에 `opened` 를 함께 넣는 **2줄 변경**이 동반돼야 하며, 그 순간 후보 1 과 **기술적 위험이 동일**해진다 (이름만 다르다). 승격 판단에서 이 사실을 잊지 말 것.
4. **base rate 표본이 얇다.** 전 상태 640 PR 에서 base 편집 `5` 건, 그중 organic 은 `4` 건 (`#1026` 제외) 이고 gitflow 복원 이후로는 `1` 건뿐이다. `0 / 640` 으로 관측된 "base 2회 변경" (§3-1 위험 경로) 은 **작은 모집단 위의 0** 이다.
5. **`edited` 는 base 이외의 편집에도 발화한다.** 결정 3 의 의도적 수용. 발화당 CI `~12초` · 관측 빈도 `10 occurrence / 40 PR`.
6. **auto-retarget 은 미발현일 뿐 불가능하지 않다** (§2-5 `0`건). 발현하면 `pr-base-edit` 이 **사람 조작 없이** 발화한다. 방향은 안전하나 (봇 PR 의 base 가 `<type>/*` → `develop` 으로 옮겨가는 것은 `bot → develop` 허용 셀) 첫 발현 시 오탐으로 오인될 수 있다.

### 9-2 재검토 조건

1. **base 편집 escape 재발** → **후보 1 (required 편입) 재검토.** 971 §10-5 항 14 와 **같은 술어**다.

   **escape 정의 (기계 판정, 머지 시점 앵커)** — 머지 PR 중 `BaseRefChangedEvent` 를 보유하고 (§2-3 술어), 그 **최종 `(base, head)`** 가 `verify-pr-base-rule.mjs` 로 `exit != 0` 인 것. 관측 창은 **90일 rolling, 하한은 본 항 신설일 `2026-08-15`** 이며, 실효 창 = `[max(2026-08-15T00:00:00Z, now-90d), now]` 다 (971 항 13 형식 승계 — _"본 ADR 머지일"_ 같은 **미확정 앵커를 쓰지 않는다**. 리뷰가 971 항 14 와의 이중 명세를 적발했고, 정본은 **본 절**이며 971 은 값을 복제하지 않는다). 하한을 두는 이유는 971 항 13 과 같다 — 소급 3건 (`#170` `#212` `#217`) 은 발화 입력이 아니라 **기준선**이고 (dual PR 시기, §2-4), 하한이 없으면 **신설 당일 자동 발화**한다.

   ```bash
   REPO=coseo12/astro-simulator
   # (1) 창 안의 머지 PR 중 base 편집 보유분 — §2-3 의 페이지네이션 결과를 재사용한다
   jq -s -r --arg since "2026-08-15T00:00:00Z" \
     '[.[].data.repository.pullRequests.nodes[]]
      | .[] | select(.state=="MERGED")
      | select([.timelineItems.nodes[] | select(.createdAt > $since)] | length > 0)
      | "\(.number)\t\(.baseRefName)\t\(.headRefName)"' /tmp/baseref-pages.jsonl > /tmp/base-edited-merged.tsv
   # (2) 최종 (base, head) 재판정 — exit != 0 이면 escape
   ESC=0
   while IFS=$'\t' read -r N B H; do
     node scripts/verify-pr-base-rule.mjs --pr base="$B" head="$H" >/dev/null 2>&1 || { echo "ESCAPE #$N ($B <- $H)"; ESC=$((ESC+1)); }
   done < /tmp/base-edited-merged.tsv
   echo "escape = $ESC"
   ```

   ⚠️ **(1) 은 반드시 §2-3 의 완결성 assertion (`totalCount == fetched_nodes`) 을 통과한 파일 위에서 돌린다.** 통과하지 않은 파일 위의 `0 hit` 은 "escape 없음" 이 아니라 **모집단 절단**이다 — 이 술어는 틀릴 때 **거짓 음성 방향으로만** 틀린다.

   **술어 검증 — 양성·음성 대조군을 같은 실행에서 확인했다 (2026-08-14).** 하한을 `2026-04-01T00:00:00Z` 로 낮추면 모집단 `3` 행 (`#170` `#212` `#217`) 에 **`escape = 3`** 이 나와 §2-4 를 전건 재현하고, 실효 하한 (`2026-08-14T00:00:00Z`) 에서는 모집단 `0` 행 · **`escape = 0`** 이다. ⚠️ **양성 대조군이 없으면 `escape = 0` 은 _"없다"_ 와 _"술어가 어긋났다"_ 를 구분하지 못한다** — 이 술어는 틀릴 때 거짓 음성 방향으로만 틀리므로 음성만 보는 검증은 무의미하다.

   **임계 2단** — **T1 `escape >= 1`**: 사례를 아래 대장에 박제하고 그 PR 을 `main` 에서 revert 할지 판단 (결정 1 **유지**). **T2 `escape >= 2`**: **후보 1 재개봉** — 971 결정 1 Phase 표 · 결정 9-1 · 본 ADR §3-1 3항을 입력으로 옵션 비교를 다시 연다. ⚠️ **T2 는 재개봉이지 편입 승인이 아니다.**

   #### base 편집 escape 대장 (T1 착지점)

   | # | PR | 편집 시각 | 이전 base | 최종 base | head | `pr-base-edit` 결론 | 머지 시각 | 원인 분류 |
   | --- | --- | --- | --- | --- | --- | --- | --- | --- |
   | — | _(현재 0행)_ | | | | | | | |

   > 소급 3건 (`#170` `#212` `#217`) 은 본 대장에 넣지 않는다 — dual PR 시기라 **당시 정책상 적법**했고 (§2-4), 하한 이전이므로 기준선이다.

2. **`pr-base-edit` 이 `failure` 를 냈는데 그 PR 이 머지됨** → 조건 1 의 escape 와 **부분 중복이나 더 이르다** (조건 1 은 최종 base 만 보므로, 위반 상태로 머지된 경우에만 잡는다). 본 조건은 붉은 X 가 존중되는지를 직접 재는 축이며, 발화 시 971 §10-5 항 13 의 escape 대장과 같은 형식으로 기록한다.
3. **`branch-name` 이 required 에서 내려가거나 job 이름이 바뀜** → 한계 2 가 발현한다. [20260812-970](20260812-970-pr-base-rule-guard.md) §8-2 재검토 조건 2 와 동시 발화.
4. **auto-retarget 이 실제로 발생** (§2-5 가 `0` 에서 벗어남) → 한계 6. 사람 조작 없는 발화의 오탐 여부를 판정하고, 필요하면 결정 3 (조건 미부여) 을 재론한다.
5. **GitHub 이 동명 체크런 해석 규칙을 문서화** → 변형 5 (§3-5) 의 기각 근거가 소멸하고, 동시에 후보 1 의 최악 시나리오 (§3-1) 가 계산 가능해진다. 971 §10-5 조건 3 과 동시 발화.
6. **`pr-base-edit` 이 릴리스 경로에서 오탐** (`base=main` ← `head=develop` 인 PR 에서 `failure`) → 즉시 workflow 를 되돌린다. 비-required 라 머지는 막히지 않으므로 긴급도는 낮으나, 릴리스 의례에 붉은 X 를 상시화하면 alert fatigue 로 조건 2 의 감시력이 죽는다.

### 9-3 Concrete Prediction

- **`BASE_RULES` 에 새 셀을 추가할 때**: `.github/workflows/**` 변경 **`0` 줄**.
  - 검증: 그 구현 PR 에서 `git diff --stat .github/workflows/` 가 `0` 이면 예측 성공.
  - 근거: 본 결정이 workflow 에 판정 리터럴을 복제하지 않고 `verify-pr-base-rule.mjs` 를 호출만 하기 때문. 실패하면 workflow 에 판정 지식이 샌 것이므로 **먼저 리팩토링 후 재개**한다.

---

## §재도입 트리거 (후보 1 — `types` 에 `edited` 추가)

본 ADR 은 후보 1 을 **현 시점에 채택하지 않는다**. 죽은 부채로 고정되지 않도록 재도입 조건을 시간·관측 함수로 명시한다.

- **재도입 검토 조건** (하나라도 충족):
  1. §9-2 조건 1 의 **T2** (`escape >= 2`) 도달.
  2. §9-2 조건 2 (붉은 X 를 단 채 머지) 가 **2회** 관측.
  3. GitHub 이 동명 체크런 해소 규칙을 문서화 (§9-2 조건 5) — 후보 1 최악 시나리오가 **계산 가능**해지므로, 그 계산 결과가 "latest 채택" 이면 §3-1 근거 3 (비대칭 비용) 이 크게 약해진다.
  4. `main` 대상 PR 에서 `branch-name` 의 `n >= 2` 표본이 자연 발생 — 971 §10-5 조건 9 가 요구하는 `G2` 사전 실행이 **비로소 가능**해진다 (§3-1 근거 1 소멸).
- **재도입 전까지의 경로** (graceful degradation): base 편집은 `pr-base-edit` 붉은 X 로 **즉시 가시화**되며, 놓친 경우에도 §9-2 조건 1 술어로 **사후 전수 재구성**이 가능하다. 즉 "보이지 않는 우회" 상태는 본 결정 적용 시점에 끝난다.
- **재도입 시 선행 작업** (순서 구속):
  1. 971 §10-5 조건 9 절차 수행 — 대상 SHA 가 `branch-name` 에 대해 `n >= 2` 임을 확인한 뒤 `G2` 1회 실행.
  2. 971 **Phase 1 면제 근거 세 번째 다리 재작성** — `types:` 전수 확인이 더 이상 참이 아니므로, 그 자리를 대체할 근거 (예: "base 를 2회 이상 바꾼 PR `0 / N`" 의 갱신값) 를 박제.
  3. 971 **결정 9-1 과의 정합 진술** — `pr-template-checklist` 는 제외인데 `branch-name` 은 유지하는 비대칭의 근거 (판정 입력이 본문 vs ref — §2-7) 를 971 본문에 명시.
  4. 그다음에야 `types` 1줄 + `pr-base-edit` workflow 철거 여부 판단.

---

## §10 Forensic 변형 판정 — **일반 ADR 채택**

CLAUDE.md §Forensic ADR 변형 의 5조건을 항목별로 판정한다 (3개 이상이면 8섹션 템플릿).

| # | 조건 | 판정 | 근거 |
| --- | --- | --- | --- |
| 1 | 가설 `N >= 2` — 단일 원인 미확정 | **✗** | 원인은 확정돼 있다 (`types` 에 `edited` 부재). [20260812-970](20260812-970-pr-base-rule-guard.md) §8-1 한계 0 이 이미 단일 원인으로 박제했고 본 ADR 이 §2-1 · §2-2 로 재확인했다. 비교 대상은 **가설**이 아니라 **해법 후보**이며 그것은 일반 ADR 의 §후보 비교 관할이다 |
| 2 | Runtime 측정 데이터 필수 | **✓** | 정적 분석만으로는 §2-3 (실현 이력) · §2-6 (누적 빈도) 이 나오지 않는다. 이 두 값이 §3-1 의 판정을 뒤집을 수 있었다 |
| 3 | DoD PASS 인데 사용자/제품 회귀 | **✗** | 회귀가 아니라 **처음부터 커버 범위 밖**이었다. #970 은 이 갭을 §8-1 한계 0 으로 **선언**하고 머지했으므로 "DoD 는 통과인데 제품이 회귀" 구조가 아니다 |
| 4 | `5±2` 옵션 비교 | **✓** | 후보 4 + 검토 후 기각한 변형 2 = **6** |
| 5 | Amendment 라운드 `N` 예상 | **✗** | cross-validate 통합 + `Provisional → Accepted` 전이는 이 저장소의 **모든** cross-validate ADR 이 거치는 표준 절차이지 Amendment 가 아니다. 이것을 ✓ 로 세면 조건 5 가 항상 참이 되어 판정력이 `0` 이 된다 |

**`2 / 5` → 일반 ADR.** CLAUDE.md 의 명시 tie-breaker (_"판정 애매하면 일반 ADR 로 시작 후 Amendment 1회 필요해지면 forensic 으로 승격 — 양방향 cross-link 박제"_) 도 같은 방향이다.

---

## §11 교차검증 반영 사항 — **미수행**

본 ADR 은 `Provisional` 로 박제된다. cross-validate 는 **메인 오케스트레이터가 수행**하며 (architect 직접 호출 금지 — [#479](https://github.com/coseo12/astro-simulator/issues/479)), 결과를 CLAUDE.md §교차검증 의 4축 (합의 / 이견 수용 / Claude 재분석 기각 / 고유 발견) 으로 본 절에 통합한 뒤 `Accepted` 로 전이한다. 전이 시 [`docs/decisions/README.md`](README.md) 인덱스 표의 상태 열도 **같은 커밋**에서 갱신한다 ([20260812-1005](20260812-1005-adr-index-status-guard.md) 가 강제).

**호출 전 Claude 편향 셀프 체크** ([cross-validate-protocol.md](../guides/cross-validate-protocol.md) §5 4종):

| 축 | 통과 | 자기 진단 |
| --- | --- | --- |
| 낙관적 일정 | **통과** | 구현을 이번 범위에서 하지 않고 `stage:dev` 로 넘겼다. DoD 축 2 의 일회용 PR 실험을 "선택" 이 아니라 **필수**로 고정했다 |
| 결합 간과 | **미통과 → 프롬프트 삽입 대상** | 본 ADR 의 핵심 주장이 정확히 "971 과의 결합" 이라 자기 검증이 순환이다. 특히 **§2-7 의 «판정 입력이 다르므로 `pr-template-checklist` 의 `3/59` 를 `branch-name` 에 전이하면 안 된다»** 가 후보 1 위험을 낮추는 방향의 논증인데, 그 논증을 만든 주체가 후보 1 을 유예하려는 주체와 같다. cross-validate 호출 시 **"§2-7 의 판정 입력 비대칭 논증이 후보 1 위험을 과소평가하는가"** 를 명시 질문으로 삽입할 것 |
| 폐기 프레이밍 | **통과** | 후보 1 을 기각이 아니라 유예로 두고 §재도입 트리거를 4조건으로 명시했다. 후보 3·4 는 기각이나 각각 **대체 수단 존재** / **기술적 불가**라는 확정 근거를 댔다 |
| 순수주의 | **미통과 → 프롬프트 삽입 대상** | 결정 3 (`if:` 미부여) 의 근거 중 하나가 _"fallback 분기 금지 원칙"_ 인데, 원칙 준수를 위해 **불필요한 CI 발화를 감수**하는 구조다. 실용 비용 (`~12초 × 10 occurrence / 40 PR`) 이 작다는 계산을 함께 댔으나, 원칙이 결론을 끌었을 가능성을 배제하지 못한다. cross-validate 에 **"결정 3 이 원칙 준수를 위해 실용 비용을 과소평가했는가"** 를 명시 질문으로 삽입할 것 |

---

## §12 참고

- [#1027](https://github.com/coseo12/astro-simulator/issues/1027) — 본 이슈 (본문 + 부수 실측 코멘트)
- [#1026](https://github.com/coseo12/astro-simulator/pull/1026) — stale green 최초 실측 (일회용, close + 브랜치 삭제 완료)
- GitHub Docs — [About protected branches](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-protected-branches/about-protected-branches) / [Available rules for rulesets](https://docs.github.com/en/repositories/configuring-branches-and-merges-in-your-repository/managing-rulesets/available-rules-for-rulesets)
- [octokit/webhooks — `pull_request/edited.schema.json`](https://github.com/octokit/webhooks/blob/main/payload-schemas/api.github.com/pull_request/edited.schema.json) — `changes.base.ref.from` / `changes.base.sha.from`
