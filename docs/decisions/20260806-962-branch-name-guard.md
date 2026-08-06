# ADR: 브랜치명 규약의 정본을 산문에서 실행 가능한 가드로 이전 (#962 축 B)

- **상태**: **Accepted (cross-validate agy 2026-08-06)** — §7 교차검증 반영 사항 4축 통합 완료. Provisional 박제 → 통합 → 전이 (CLAUDE.md §ADR Status 워크플로, #370 옵션 C)
- **날짜**: 2026-08-06
- **결정자**: architect (실측 기반 설계) + developer (구현·D1 정정) + cross-validate (외부 검증)
- **관련**:
  - [#962](https://github.com/coseo12/astro-simulator/issues/962) (본 이슈 — 축 B. 축 A 는 PR [#966](https://github.com/coseo12/astro-simulator/pull/966) 머지 완료)
  - [#942](https://github.com/coseo12/astro-simulator/issues/942) / PR [#961](https://github.com/coseo12/astro-simulator/pull/961) — 브랜치 접두사 규약 일반화. 본 ADR 이 강제하는 규약의 원천
  - [`docs/guides/branch-strategy-workflow.md`](../guides/branch-strategy-workflow.md) — 규약 산문 상세
  - [`docs/lessons/guard-pr-dod.md`](../lessons/guard-pr-dod.md) / [`docs/lessons/guard-design-principles.md`](../lessons/guard-design-principles.md) — 가드 도입 DoD·설계 원칙
  - upstream ADR [20260419-gitflow-main-develop](https://github.com/coseo12/harness-setting/blob/main/docs/decisions/20260419-gitflow-main-develop.md) — 브랜치 전략 상위 결정
- **교훈 적용**: "가드 설계 원칙 — measurement-first / fail-fast" — 허용 집합을 산문에서 추론하지 않고 **머지 PR head 560건 전수 + 원격 브랜치 109건**을 실측해 후보 4개를 비교 확정했다.

---

## §1 배경

PR [#961](https://github.com/coseo12/astro-simulator/pull/961) (#942) 의 cross-validate (agy, 2026-08-05) 가 권고했다:

> **강제력을 CI 로 위임** — 브랜치명 같은 물리적 차단은 CLAUDE.md 텍스트가 아니라 GitHub Actions 정규식으로 격리. LLM 에이전트는 블랙리스트보다 화이트리스트를 잘 지키지만, **문서 규약은 컨텍스트가 길어지면 잊히는 실패 모드**가 있다.

#942 는 브랜치 접두사 규약을 `<type>/<이슈번호>-<설명>` 으로 일반화했으나 **강제 수단이 0** 이었다. 규약은 4곳의 산문에만 존재하고, 그중 type 열거는 **축자 3중 복제** 상태다:

| 파일:라인 | 내용 |
|---|---|
| `.github/PULL_REQUEST_TEMPLATE.md:8` | `` `feature`(feat) / `fix` / `refactor` / `chore` / `docs` / `test` `` |
| `.claude/agents/developer.md:18` | 동일 문자열 |
| `.claude/skills/create-pr/SKILL.md:18` | 동일 문자열 |
| `CLAUDE.md:32` | 열거 없이 "§커밋 컨벤션 의 type 과 동일" 로 위임 |

세 사본 중 어느 것도 정본이 아니다. 이 저장소가 반복해서 경계해 온 **"주석 계약 vs 구현 drift"** 의 규약 버전이며, #942 자체가 그 drift 를 뒤늦게 발견해 정정한 사례였다.

축 A (CLAUDE.md 34,980 → 27,209, −22.2%) 가 선행 조건이었고 완료됐다 (여유 7,791자).

---

## §2 실측 (2026-08-06)

전수 코퍼스: 머지 PR head **560** / 열린 PR **0** / 원격 브랜치 **109** / 고유 브랜치명 **513**.

### 2-1 접두사 분포 (머지 PR head 560)

```
306 feature/*   60 fix/*   60 chore/*   57 develop   51 release/*
 11 docs/*      11 architect/*   2 dev/*   1 test/*   1 refactor/*
```

`main` 을 head 로 한 PR **0건** (hotfix merge-back 미발생). `hotfix/*` **0건**.

### 2-2 후보 정규식 비교 — FAIL 건수 / 560

| 후보 | 명세 | FAIL | 판정 |
|---|---|---|---|
| A | 이슈번호 필수 + `release/X.Y.Z-prep` (`v` 불허) + 봇 예외 없음 | 142 | 기각 — `v` 불허가 릴리스 브랜치 29건 오차단 |
| B | A + `v?` 허용 | 130 | 기각 — 봇 브랜치 28건 오차단 = **자동화 파손** |
| **C** | **B + 봇 패턴 예외 (채택안)** | **102** | **채택** |
| D | C 에서 이슈번호 요구 제거 (접두사만) | 13 | 기각 — 규약의 절반만 강제 |

### 2-3 릴리스 브랜치 명명은 최근 1개월에도 진동한다

```
2026-07-18 release/0.50.0-prep      ← v 없음
2026-07-22 release/v0.51.0-prep     ← v 있음
2026-07-30 release/v0.53.0-prep     ← v 있음
2026-07-31 release/0.54.0-prep      ← v 없음
2026-08-05 release/0.60.0-prep      ← v 없음
```

`-prep` 은 2026-06-18 이후 **24회 연속** 부착 (미부착 16건은 전부 ≤2026-06-16).

### 2-4 봇이 규약 밖 브랜치를 살아있는 채로 생산 중

| workflow | `branch:` 리터럴 | PR | 최신 |
|---|---|---|---|
| `r1-baseline-bootstrap.yml:80` | `chore/r1-baseline-linux-${{ github.run_id }}` | 24 | 2026-08-02 (#925) |
| `bench-baseline-remeasure.yml:149` | `chore/baseline-remeasure-${{ github.run_id }}` | 3 | 2026-04-23 (#316) |

봇 PR 27건 중 **10건이 `base=develop`**. 이슈번호가 **구조적으로 존재할 수 없다** (CI run 이 만드는 브랜치).

### 2-5 이슈번호 강제의 운영 비용

| 창 | 사람 `<type>/*` PR (base∈{develop,main}) | 이슈번호 없음 |
|---|---|---|
| 30일 | 62 | **1** (#893 `chore/phase3-harness-v450` — #907 디커플로 종료된 클래스) |
| 60일 | 121 | 6 |
| 90일 | 218 | 24 |

30일 기준 발화 빈도 **< 1/월** → [guard-design-principles](../lessons/guard-design-principles.md) §2 운영 비용 표의 "무시 가능 — 임계값 유지" 구간.

### 2-6 rerun 은 과거 workflow 정의를 재생한다 (오차단 리스크의 핵심 반증)

| run | 시점 | step 목록 특징 |
|---|---|---|
| `26403979191` | 2026-05-25 | `Node.js 프로젝트 감지` / `yarn test` / `Python 프로젝트 감지` — #915 가 2026-08-01 에 **제거**한 분기 |
| `31076723828` | 2026-08-06 | `#952 포맷 백스톱` / `#915 auto-close 파서 self-test` — 5월에는 **없던** step |

두 run 의 step 집합이 다르다 ⇒ run 은 **트리거 SHA 의 workflow 파일에 고정**된다. 따라서 과거 560 run 을 rerun 해도 신규 가드는 실행 자체가 불가능하다.

### 2-7 부수 실측 (설계 경계 확정)

- 대문자 포함 브랜치 **0건** / 슬래시 2개 이상 **0건** → 문자 집합 가정 검증
- `<type>/<번호>` (설명 없음) **0건** → "설명 필수" 강화 비용 0
- `main` branch protection 에 `required_status_checks` **부재**, `develop` 은 **보호 없음 (404)**

---

## §3 후보 비교 — 배선 위치

| 후보 | 런타임 브랜치명 검사 | SSoT drift 정적 검사 |
|---|---|---|
| `ci.yml detect-and-test` step | ✗ `push:[develop,main]` 에서 `head_ref` 부재 → 이벤트 분기 필요. pnpm install 뒤라 실패까지 수분 | ✗ 무거운 job 에 둘 이유 없음 |
| `project-guards.yml` step | ✗ 동일한 push 이벤트 분기 문제. 현 step 이 전부 **이벤트 무관** 검사라는 불변식이 깨진다 | **✓ 정확히 이 워크플로의 계약** (`verify-agent-ssot` / `verify-create-pr-ssot` 의 이웃), 의존성 0 유지 |
| 신규 `branch-name-guard.yml` | **✓** `pull_request` 전용 → `head_ref` 항상 존재 → 분기 0. <30s 즉시 실패 | ✗ push 경로 미검사 |
| `pr-template-checklist-guard.yml` 확장 + rename | 체크 이름 이력 단절 + 두 가드의 실패 모드 결합 + 불필요한 `pull-requests: write` 상속 | ✗ |

**#952 전례 대조** — #952 는 `format:check` 를 `project-guards.yml` 이 아니라 `ci.yml` 에 배선했다. 근거는 "project-guards.yml 은 의존성 0 워크플로라 lockfile 이 고정한 prettier 를 쓰려면 **세 번째 버전 출처**가 필요하다" 였다. 즉 판정 기준은 *"선결 조건이 이미 충족된 곳으로 간다"* 이지 *"project-guards.yml 을 쓰지 마라"* 가 아니다. 본 가드는 선결 조건이 두 개로 갈라지므로 (**이벤트 페이로드** vs **체크아웃된 파일**) 배선도 갈라진다. 두 검사 모두 의존성이 0 이라 #952 의 버전 출처 문제는 애초에 발생하지 않는다.

---

## §4 후보 비교 — SSoT 방향

| 후보 | 형태 | 검증되지 않은 사본 수 | 판정 |
|---|---|---|---|
| (a) 정규식을 workflow YAML 인라인 | 4번째 축자 사본 | 4 | 기각 — drift 재생산, 테스트 불가 |
| (b) `PULL_REQUEST_TEMPLATE.md:8` 런타임 파싱 | 산문이 정본 | 2 | 기각 — 산문 문구를 다듬을 때마다 가드가 깨짐. #471 "PR 템플릿 동적 읽기" 는 **구조**(`- [ ]` prefix) 파싱이라 전례 미이전 |
| (c) 신규 데이터 파일 + 4곳 대조 | 데이터가 정본 | 0 | 차선 — (d) 대비 이점 없이 파일 1개 추가 |
| **(d) 스크립트 상수가 정본 + 산문 3곳 정적 대조** | **실행 가능한 정의가 정본** | **0** | **채택** |

(d) 에서 가드는 **4번째 출처가 아니라 유일한 정본**이고, 기존 3곳을 *검증된 파생*으로 강등한다. 사본 수는 4 로 같지만 **type 열거의 검증되지 않은 사본이 3 → 0** 이 된다.

> **범위 한정 (reviewer 권고 R1, 2026-08-06)** — 위 "3 → 0" 은 **type 열거** 기준의 진술이다. `--verify-ssot` 가 강제하는 범위는 type 열거(산문 3곳) + workflow `branch:` 리터럴 + guide 허용 집합 표(§5-4 5단계에서 추가)이며, CLAUDE.md §브랜치 전략 표의 `release/*-prep` · `hotfix` 서술은 **기존 미검증 사본으로 남는다**. 허용 집합 *전체* 기준의 "0" 이 아니다 — 서사가 이 표면을 가리지 않도록 명시한다.

---

## §5 결정

### 5-1 허용 집합 (정본은 `scripts/verify-branch-name.mjs` 의 상수)

```
^(develop|main)$
^(feature|fix|refactor|chore|docs|test|hotfix)/[0-9]+-[a-z0-9][a-z0-9._-]*$
^release/v?[0-9]+\.[0-9]+\.[0-9]+-prep$
^chore/(r1-baseline-linux|baseline-remeasure)-[0-9]+$
```

- `feature`(≠`feat`) 유지 — #942 결정. 실측 `feature/` 306 / `feat/` 0
- `hotfix` 는 실사용 0건이나 CLAUDE.md §브랜치 전략 표의 규약이므로 포함 (규약 우선)
- `release` 의 `v?` **허용** — §2-3 진동 실측. 강제 시 릴리스 오차단
- `release` 의 `-prep` **필수** — §2-3 24회 연속
- 봇 패턴 **명시 허용** — 봇 PR 통째 스킵(`github.actor != 'github-actions[bot]'`)을 쓰지 않는다. 그것은 한 클래스 전체의 silent skip 이라, 3번째 봇 workflow 가 임의 브랜치명을 써도 아무도 모른다. 패턴을 명시하면 신규 패턴 등장 시 가드가 FAIL 하며 의식적 갱신을 강제한다 (fail-fast 정합)

### 5-2 검증 대상 — PR head 단독

`pull_request` 이벤트의 `head.ref` 만 검사한다. push ref 검사 미채택:
- PR 없이 develop 에 도달하는 경로가 없으므로 **추가 차단력 0**
- "더 일찍 알려준다" 는 이득은 **로컬 pre-flight** (비용 0) 로 더 싸게 얻는다
- 두 이벤트를 함께 처리하면 `if: github.event_name == ...` 분기가 필요한데, 이는 CLAUDE.md §가드 설계 원칙이 금지하는 fallback 분기와 구조가 같다

이벤트 types = `[opened, synchronize]`. **`reopened` 의도적 제외** — `head_ref` 는 PR 생성 후 변경 불가라 `opened` 로 충분하고, 제외가 §2-6 의 유일한 잔여 노출(과거 PR reopen)을 닫는다. `branches:` 필터 **미사용** (모든 base) — 봇 PR 17건이 `base=feature/*` 로 열리므로 base 필터는 정확히 봇 브랜치를 사각지대로 만든다.

### 5-3 배선 — 두 워크플로 분할

```
런타임: .github/workflows/branch-name-guard.yml (신규)
        on: pull_request, types: [opened, synchronize]
        permissions: contents: read
        env 간접 후 node scripts/verify-branch-name.mjs --branch "$HEAD_REF"

정적:   .github/workflows/project-guards.yml (step 2개 추가)
        node scripts/verify-branch-name.mjs --verify-ssot
        node scripts/verify-branch-name.mjs --self-test
```

**CRITICAL — script injection 회피**: `${{ github.event.pull_request.head.ref }}` 를 `run:` 본문에 직접 보간하면 브랜치명이 셸로 해석된다. 반드시 `env:` 로 받아 `"$HEAD_REF"` 로 인용 전달한다.

**CRITICAL — `pull_request_target` 금지**: 트리거는 반드시 `pull_request` 다. `pull_request_target` 은 base 리포 컨텍스트에서 쓰기 가능 토큰과 함께 실행되므로, fork 가 제어하는 브랜치명을 다루는 본 가드에서는 권한 상승 경로가 된다. 본 가드는 secret 도 write 권한도 필요 없다 (§7 이견-b).

**#945/#950 정책 준수**: 전 step `if: hashFiles(...)` **미사용**. 스크립트 부재는 배포 시나리오가 아니라 **가드가 삭제된 회귀**이므로 node ENOENT 즉시 FAIL 이 유일한 정상 동작이다. `--if-present` 미사용. 런타임 산출물이 없어 `if-no-files-found` 예외도 해당 없음.

**self-test 동시 배선** — #897 교훈 (CI 미배선 self-test 는 0회 실행).

**concurrency 키는 sha 가 아니라 PR 번호** (developer 실측 정정, 2026-08-06): 저장소의 다른 워크플로는 concurrency group 을 `head.sha` 로 묶는다. 그것은 검사 대상이 **내용**인 가드에는 옳지만 본 가드에는 **틀리다** — 본 가드의 검사 대상은 내용이 아니라 **ref(브랜치명)** 다. 서로 다른 두 브랜치가 같은 커밋을 가리키는 일은 정상적으로 발생하며(develop 과 같은 sha 에서 잘라낸 `release/*-prep`, 재생성된 브랜치 등), sha 로 묶으면 한쪽 PR 의 브랜치명 판정이 `cancel-in-progress` 로 **취소되어 아무 판정도 남지 않는다**. CANCELLED 는 관례상 코스메틱으로 취급되므로([operational-friction](../ops/operational-friction.md) §4) 아무도 눈치채지 못한다 — 본 설계가 금지하는 silent skip 이다. §7-2 live 실증에서 실제로 재현됐다(run `31079932693` CANCELLED). group 키를 `pr-${{ github.event.pull_request.number }}` 로 고정한다 — 같은 PR 안의 연속 push 만 supersede 되고 서로 다른 PR 은 교차 취소되지 않으며, `pull_request` 전용 트리거라 번호가 항상 존재해 fallback 분기가 불필요하다.

### 5-4 하나의 스크립트, 네 소비처

```
scripts/verify-branch-name.mjs
  ├─ --branch <name>   → CI 런타임 검사 (branch-name-guard.yml)
  ├─ --verify-ssot     → 산문 3곳 + workflow branch: 리터럴 2곳 + guide 허용 집합 표 대조
  │                       (project-guards.yml)
  ├─ --self-test       → 픽스처 매트릭스 ≥24 케이스 + 자식 프로세스 프로브 4건
  │                       (project-guards.yml)
  └─ (인자 없음)        → git rev-parse --abbrev-ref HEAD 로컬 pre-flight (developer / create-pr 스킬)
```

**`--verify-ssot` 추출 계약** (§7 이견-a 반영 — "D1 실측에 위임" 에서 계약 고정으로 강화):

1. 대상 3파일에서 **고정 문자열 locator** 로 SSoT 라인을 찾는다 (`PULL_REQUEST_TEMPLATE.md` / `create-pr/SKILL.md` = `type = 커밋 컨벤션 type —`, `developer.md` = `type 은 커밋 컨벤션 type 과 동일`). **locator 미발견 = 즉시 exit 1** (fallback 없음).
2. 해당 라인에서 **백틱으로 인용된 토큰만** 추출해 집합으로 만든다. 이 범위 한정이 `feat` 오탐을 구조적으로 배제한다 — 산문의 표기가 `` `feature`(feat) `` 라 `feature` 만 백틱 안이고 `feat` 는 밖이다 (2026-08-06 3파일 실측).
3. 추출 집합 == `BRANCH_TYPES` 를 **누락·잉여 양방향**으로 대조한다.
4. `.github/workflows/*.yml` 의 `branch:` 리터럴 중 `chore/` 로 시작하는 값이 전부 `BOT_BRANCH_PATTERNS` 로 설명되는지 검사 — 3번째 봇 패턴 등장 시 강제 발화.

**D1 실측 정정 (developer, 2026-08-06) — 추출 범위를 "라인 전체" 가 아니라 "열거 구간" 으로 한정**

위 2단계의 백틱 범위 한정이 실제로 `feat` 를 배제하는지 3파일에 1회 실측했다 (guard-design-principles §1 measurement-first):

| 파일 | (A) 라인 전체 백틱 토큰 | (B) locator 이후 열거 구간 |
|---|---|---|
| `.github/PULL_REQUEST_TEMPLATE.md:8` | `base=develop` · `head=<type>/*` + 6 type | 정확히 6 type |
| `.claude/skills/create-pr/SKILL.md:18` | `develop` · `<type>/*` · `--squash` + 6 type | 정확히 6 type |
| `.claude/agents/developer.md:18` | `develop` · `<type>/<이슈번호>-<설명>` · `node scripts/verify-branch-name.mjs` · `branch-name-guard` + 6 type | 정확히 6 type |

> **수치 주석 (reviewer 권고 R8, 2026-08-06)** — `developer.md` 행의 (A) 는 최초 박제 시점에 잉여 2개였으나, 본 PR 이 **같은 라인에 pre-flight 호출 문장을 추가**해 현재 실측은 **4개**다 (위 표는 현재 값으로 갱신). 결론 방향은 오히려 강화된다 — 라인 전체 해석의 false-fire 폭이 커졌다.

- **원안의 의도는 확인됨** — 3파일 전부 산문 표기가 `` `feature`(feat) `` 라 `feat` 가 백틱 **밖**이다. 백틱 범위 한정이 `feat` 오탐을 구조적으로 배제한다는 주장은 그대로 성립한다.
- **그러나 "해당 라인에서" 를 라인 전체로 구현하면** 규약과 무관한 잉여 토큰(열 A)이 유입돼 3단계 양방향 대조가 **3파일 전부에서 상시 FAIL** 한다. 원안대로 구현했다면 가드가 첫 실행부터 영구 false-fire 했을 것이다.
- **정정**: 추출 범위를 locator 이후의 **열거 구간** — `` `type` `` + 선택적 `(alias)` + ` / ` 반복이라는 고정 구조의 **최장 선두 run** — 으로 한정한다. 열 B 가 3파일 전부 정확히 `BRANCH_TYPES` 6개다.
- **대가 — 잔여 false-negative 1건 (의도적 미대응)** (reviewer 권고 R2, 주입 실측 13종 중 #7): 범위를 좁힌 결과 **열거 구간 밖**(닫는 괄호 뒤 등)에 추가된 type 토큰은 **미검출**이다. 하드닝하려면 "열거 뒤 잔여 백틱 토큰 중 `^[a-z]+$` 금지" 같은 규칙이 필요한데, `create-pr/SKILL.md` 의 `` `develop` `` 이 정확히 그 패턴이라 **D1 이 제거한 상시 false-fire 가 즉시 재유입**된다. 즉 값싼 하드닝 수단이 없다. 반면 실제 drift 편집 경로(열거의 확장·축소·오타 — 주입 #1~#4·#8)는 전부 검출되므로, **이 대가는 지불할 값어치가 있다**는 판단으로 미대응을 택한다. 정정의 이득만 적고 대가를 적지 않으면 그 자체가 완결 서사 편향이다.
- 3중 박제: `scripts/verify-branch-name.mjs` 의 `ENUM_RE` 주석 / `.github/workflows/project-guards.yml` 스텝 주석 / 본 절.

**5단계 추가 (reviewer 권고 R1, 2026-08-06) — guide 허용 집합 표를 검증 대상에 편입**

본 PR 은 `docs/guides/branch-strategy-workflow.md` §허용 집합에 표를 **신설**했는데, 이 표는 산문 3곳과 달리 type 열거만이 아니라 허용 집합 **4행 전체**(gitflow head / type 열거 / 릴리스 형태 / 봇 리터럴)를 축자 재기술한다. 검증 대상 밖에 두면 `BOT_BRANCH_PATTERNS` 나 `RE_RELEASE` 를 고쳤을 때 이 표가 **조용히 drift** 한다 — CLAUDE.md 가 "숨은 상수 drift" 로 이름 붙인 클래스이고, "정본을 스크립트로 이전한다" 는 본 PR 의 서사와 정면 충돌한다.

- **택일 근거** — reviewer 는 (a) 문구를 "type 열거 한정" 으로 좁히기 (비용 0) 와 (b) 표를 검증 대상에 추가 (파서 비용) 를 제시했다. **(b) 를 택한다**: 본 PR 의 명제 자체가 *"검증되지 않은 산문 사본이 문제"* 인데, 그 PR 이 새 미검증 사본을 만들고 문구만 좁히는 것은 명제의 자기 적용 실패다. 다만 (b) 만으로는 CLAUDE.md §브랜치 전략 표의 **기존** 사본(`release/*-prep` · `hotfix`)이 남으므로, 문구도 함께 "type 열거 사본 3 → 0" 으로 정밀화한다 (a 와 b 는 배타가 아니다).
- **구현 — 별도 파서를 만들지 않는다.** workflow `branch:` 리터럴 검사와 동일하게 **런타임 판정기 자신**(`classifyBranch`)을 재사용한다: `형태`·`예` 열의 백틱 토큰 중 형태 자리표시자(`<...>` / `v?` / `X.Y.Z`)가 아닌 **구체 브랜치명**은 전부 그 행의 rule 로 분류돼야 한다. 2행 비고의 `type = ` 열거만 `ALL_TYPES` 와 양방향 대조한다 (이 표는 산문 3곳과 달리 `hotfix` 까지 적는다).
- **fail-fast**: locator 미발견 / 행 부재 / 행당 대조 가능 토큰 0건은 전부 즉시 FAIL. 표만 남고 대조는 사라지는 상태를 허용하지 않는다.
- **negative 실증 5종** (2026-08-06, 격리 편집 후 원복): `BOT_BRANCH_PATTERNS` 이름 변경 → 4행 FAIL ✓ / 2행에서 `hotfix` 제거 → 누락 검출 ✓ / 3행 예시를 `release/0.60.0` 으로 훼손 → FAIL ✓ / locator 훼손 → FAIL ✓ / 4행 삭제 → FAIL ✓. 원복 시 PASS 복귀 ✓.

**D-negative 실측 (developer, 2026-08-06) — 진입점 가드의 silent no-op**

격리 픽스처(`/tmp` 사본)에서 negative 시뮬을 돌렸을 때 **아무 출력 없이 exit 0** 이 반환됐다. 원인은 관용적 진입점 가드 `import.meta.url === pathToFileURL(process.argv[1]).href` 로, macOS `/tmp` → `/private/tmp` 심볼릭 링크처럼 **호출 경로와 realpath 가 다르면 거짓이 되어 스크립트 전체가 no-op** 이 된다 — 본 설계가 금지하는 silent skip 그 자체이며, 심링크된 체크아웃 디렉토리에서는 CI 도 동일하게 조용히 초록이 된다. 양쪽을 realpath 로 정규화해 정정하고, `--self-test` 에 "심링크 경로 직접 실행 시 exit 1 + 진단 출력" 회귀 케이스를 추가했다. **격리 동적 테스트(DoD 축 1)가 없었으면 발견 불가능했던 결함**이다.

**B1 실측 (reviewer, 2026-08-06) — CLI 인자 파싱이 같은 silent skip 을 CLI 계층에서 재현했다**

진입점 D-negative 를 고친 뒤에도 **한 계층 아래**에 동일 증상이 남아 있었다. `main()` 이 모드를 `args.includes('--self-test')` 로 **배열 전체를 훑어** 판정했기 때문에, 모드 플래그가 `--branch` 의 **값**으로 오면 브랜치 검사가 통째로 건너뛰어지고 **exit 0** 이 났다:

| 입력 | 수정 전 | 수정 후 |
|---|---|---|
| `--branch '--self-test'` | **exit 0** (브랜치 미검사, self-test 초록) | exit 1 |
| `--branch '--verify-ssot'` | **exit 0** (브랜치 미검사) | exit 1 |
| `--branch 'feat/962-x'` | exit 1 | exit 1 |
| `--branch 'feature/962-x' --self-test` | exit 0 (self-test 만 실행, 브랜치 검사 소실) | **exit 2** (잉여 인자 거부) |

- **격하하지 않은 이유** — 도달 경로가 둘인데 하나는 **적대자가 필요 없다**. 브랜치명이 `--self-test` 인 입력 경로(경로 2)는 희귀하지만, 누군가 두 CI 스텝을 `--branch "$HEAD_REF" --self-test` 로 합치는 유지보수 경로(경로 1)는 자연스러운 유혹이고, 그 순간 브랜치 검사가 **조용히 사라지면서 스텝은 SUCCESS** 다. 본 ADR 이 D-negative 를 "본 설계가 금지하는 silent skip 그 자체" 로 분류해 놓고 같은 증상을 CLI 계층에서 넘기면 자기모순이다.
- **정정 (2축)**: ① 모드를 `args[0]` **로만** 판정한다 — 네 소비처 전부 첫 인자로 진입하므로 호출부 변경 0. ② **잉여 인자를 거부**한다 (`MODE_ARITY` 초과 시 exit 2). ①만으로는 병합 호출에서 브랜치 검사는 살아나지만 이번엔 `--self-test` 가 조용히 무시되는데, 그것도 같은 클래스다. 모드별 인자 개수가 전부 고정이라 병합 자체를 불가능하게 만드는 편이 정직하다. 모드 조회는 `Object.hasOwn` 으로 한다 — `'constructor' in {}` 가 `true` 라 단순 `in` 검사는 임의 문자열을 모드로 통과시켜 같은 결함을 되살린다.
- **회귀 가드**: `classifyBranch` 단위 테스트로는 잡히지 않는다 (순수 함수는 언제나 정상이고, 결함은 `main()` 의 파싱 순서에 있다). 따라서 `--self-test` 에 **자식 프로세스 프로브 3케이스**를 추가했다 (위 표의 1·2·4행). 진입점 프로브와 합쳐 자식 프로세스 프로브는 총 4건이며, `project-guards.yml` 의 self-test 스텝 로그에 남는다.
- **부수 발견 — 프로브 재진입에 의한 무한 재귀**: negative 시뮬(결함 재도입)에서 `--branch --self-test` 가 self-test 로 라우팅되자 프로브가 프로브를 낳아 자식이 **지수적으로 증식**했다. 결함의 신호가 깨끗한 `[MISS]` 가 아니라 **CI 행(job timeout)** 이 되면 진단 품질이 떨어지므로, 자식에게 `VERIFY_BRANCH_NAME_PROBE=1` 을 넘겨 프로브 깊이를 1 로 묶었다 (+ `spawnSync` `timeout` 이중 방어). 재측정 결과 결함 상태에서 **재귀 없이 3 MISS / exit 1** 로 드러난다.

**진입점 `catch` 폴백의 fail-loud 전환** (reviewer 권고 R3): 종전 폴백은 realpath 실패 시 **결함 이전의 순진한 URL 비교**로 되돌아갔다. 그 비교가 거짓이면 결국 같은 silent no-op 이므로, *"조용히 스킵하지 않는다"* 는 주석이 사실과 어긋났다 — 이 저장소가 버그 생성원으로 박제한 **주석↔구현 drift** 다. realpath 실패는 정상 경로가 아니므로 stderr 경고 후 **직접 실행으로 간주해 판정을 강행**하도록 바꿨다. import 문맥에서 오발화하면 잡음이 나지만, 가드가 조용히 사라지는 쪽보다 언제나 낫다.

**self-consistency 지문의 직렬화 규약** (reviewer 권고 R4): §7-3 축 3 의 3-tuple 중 해시 성분이 *"FAIL 브랜치명 정렬 목록의 SHA-256 앞 12자"* 로만 서술돼 **직렬화 규약이 미명시**였고, reviewer 가 8종 형태를 시도해 전부 불일치했다. 대조가 목적인 값이 재현 불가능하면 축 3 의 증거력이 사라진다. 근본 해결로 **`--self-test` 가 3-tuple 을 직접 출력**하게 했다 — 다섯 페르소나가 값을 각자 계산하지 않고 같은 줄을 읽으므로 직렬화 해석 차이가 불일치로 오인될 여지가 구조적으로 없다. 규약도 함께 고정했다: FAIL 기대 픽스처명을 `JSON.stringify` 로 인용(빈 문자열·개행 주입 케이스가 구분돼야 한다) → 기본 `Array#sort` → `'\n'` join → SHA-256 → 앞 12자.

**로컬 pre-flight 의 detached HEAD 처리** (§7 이견-a 반영): `git rev-parse --abbrev-ref HEAD` 는 detached 상태에서 리터럴 `HEAD` 를 반환한다. 이를 브랜치명으로 검사하면 "규약 위반" 이라는 **오도하는 실패**가 난다. detached 를 별도로 감지해 전용 메시지와 함께 종료하고, 규약 위반과 구분한다. 격리 worktree sub-agent 가 특정 커밋을 체크아웃한 상태에서 실제로 발생 가능한 경로다.

### 5-5 CLAUDE.md 순증 0

브랜치명 규약은 §브랜치 전략 표가 이미 정확히 서술하고 있고, "가드가 존재한다"는 사실을 몰라도 에이전트의 브랜치 생성 행동은 달라지지 않는다 (표대로 만들면 통과한다) — CLAUDE.md §예산 규칙 ②의 판정. 가드 고지는 `docs/guides/branch-strategy-workflow.md` (CLAUDE.md 가 이미 링크 중) 와 실제 행위자인 `developer.md` / `create-pr/SKILL.md` 에 둔다. **순감도 시도하지 않는다** — 표를 "가드 참조" 로 대체하면 CLAUDE.md 만 읽는 에이전트가 규약을 알 수 없게 되어 각인층 원칙을 정면 위반한다.

---

## §6 결과 / 한계 / 재검토 조건

### 6-1 오차단 리스크

| 형태 | 실측 | 판정 | 오차단 시 영향 |
|---|---|---|---|
| `develop` / `main` (head) | 57 / 0 | PASS | **릴리스·merge-back 전면 차단** |
| `release/0.60.0-prep` · `release/v0.53.0-prep` | 22 / 13 | PASS | **릴리스 전면 차단** |
| `release/v0.28.0` (`-prep` 없음) | 16 | FAIL | 잔여 위험 0 — 마지막 2026-06-16, §2-6 로 rerun 불가 |
| 봇 2패턴 | 27 | PASS | 자동화 파손 |
| 정상 `<type>/<번호>-<설명>` | 458 | PASS | 일상 개발 차단 |
| `architect/*` · `dev/*` | 13 | FAIL | **의도된 차단** (#942 폐기 결정 집행) |
| 이슈번호 없는 `<type>/*` (사람) | 73 | FAIL | 30일 기준 1/62 |

### 6-1-b live 실증 결과 (developer, 2026-08-06 — 일회용 PR 2건, 정리 완료)

브랜치명은 PR 생성 후 변경 불가라 파일 수정식 negative 가 불가능하다. 일회용 PR 로 변형해 수행했다 (§7-2).

| 단계 | 브랜치 / PR | 기대 | 실측 run | 결과 |
|---|---|---|---|---|
| positive (릴리스 안전 — **최고 리스크**) | `release/9.99.9-prep` / [#967](https://github.com/coseo12/astro-simulator/pull/967) | SUCCESS | [31080065158](https://github.com/coseo12/astro-simulator/actions/runs/31080065158) | ✅ `[PASS] ... (rule: release)` |
| negative | `feat/962-guard-negative` / [#968](https://github.com/coseo12/astro-simulator/pull/968) | FAILURE | [31080068444](https://github.com/coseo12/astro-simulator/actions/runs/31080068444) | ✅ exit 1 + 허용 집합 노출 |
| positive (본 PR) · recovery | `feature/962-branch-name-guard` / [#969](https://github.com/coseo12/astro-simulator/pull/969) | SUCCESS 유지 | `opened` / `synchronize` | ✅ |

일회용 PR 2건은 검증 후 **close + 원격 브랜치 삭제** 완료 (운영 마찰 §2 대로 `--delete-branch` 가 아니라 `git push origin --delete` 분리 실행). `develop`/`main` head PR 은 실환경 재현 시 릴리스 경로를 건드리므로 live 실증에서 **의도적으로 제외**하고 `--self-test` 픽스처 + §7-5 코퍼스 전수로 대체했다.

코퍼스 실측은 설계 예측과 **정확히 일치**했다 (merged 560 / PASS 458 / FAIL 102). `--state all` 기준(569/465/104)과의 차이 9건은 전부 CLOSED(미머지) PR 이며 판정 로직 차이가 아니다.

### 6-2 한계 — "물리적 차단" 은 required check 없이는 절반만 성립

실측 (2026-08-06): `main` branch protection 에 `required_status_checks` **부재**, `develop` 은 **보호 자체 없음**. 본 가드는 붉은 X 를 띄우지만 GitHub 이 머지를 기계적으로 막지는 않는다. 이는 본 가드만의 문제가 아니라 **전 워크플로 공통 상태**이며 (#915 가 동일 사실을 박제), 브랜치 보호 정책 전반의 별건이다 → 후속 이슈로 분리.

### 6-3 교정 비용의 비대칭 — 그래서 pre-flight 가 본체다

브랜치명은 PR 생성 후 변경 불가이므로, CI 가 잡으면 **브랜치·PR 재생성**이 유일한 교정 경로다 (~3분). 따라서 실질적 방어선은 `developer.md` / `create-pr` 의 **push 전 pre-flight** 이고, CI 가드는 그것이 잊혔을 때의 backstop 이다 — 이는 agy 가 지적한 실패 모드("문서 규약은 컨텍스트가 길어지면 잊힌다")의 정확한 대응 구조다.

### 6-4 재검토 조건

1. **발화 빈도가 ≥ 1/주** 로 관측되면 guard-design-principles §2 에 따라 임계 완화를 ADR Amendment 로 검토 (현재 추정 < 1/월)
2. **3번째 봇 브랜치 패턴**이 필요해지면 `BOT_BRANCH_PATTERNS` 갱신 — `--verify-ssot` 가 강제 발화하므로 조용한 누락은 불가
3. **required status check 정책**이 도입되면 본 가드를 required 로 승격 (§6-2). 정책 수립 자체는 후속 이슈이며, **그 이슈 생성을 본 PR 의 DoD 항목으로 고정**해 유실을 막는다 (§7 기각-3)
4. `release/*-prep` 의 `v` 표기가 통일되면 `v?` 를 좁힌다
5. 커밋 컨벤션 type 이 추가·제거되면 정본 상수 1곳만 고치고 `--verify-ssot` 가 산문 3곳을 강제한다 (본 ADR 이 만든 구조의 첫 회수 시점)

---

## §7 교차검증 반영 사항

> 수행: architect, 2026-08-06. `cross_validate.sh architecture docs/decisions/20260806-962-branch-name-guard.md`
> outcome `applied` (exit 0) / `plan_bypass: false` / `reminder_issue: none`
> 로그: `.claude/logs/cross-validate-architecture-20260806-154303.log`

### 합의

외부 모델이 독립적으로 지지한 항목 — 본 ADR 에 이미 반영돼 있어 추가 변경 없음.

1. **후보 C 채택** — 이슈번호 필수 대원칙을 유지하되 봇 브랜치 28건 오차단과 릴리스 `v?`/`-prep` 진동을 정규식이 포용한 것을 "자동화 파손 방지" 로 평가.
2. **배선 분할** — 런타임은 `head_ref` 가 확실히 존재하는 `pull_request` 전용 신규 워크플로 (fail-fast <30s), 정적 검사는 의존성 0 워크플로 유지.
3. **script injection 차단** — `env:` 간접 전달을 "완벽한 차단" 으로 평가.
4. **봇 통째 skip 기각** — `github.actor != 'github-actions[bot]'` 포괄 예외가 검증되지 않은 봇 브랜치를 사각지대로 만든다는 §5-1 논거를 fail-closed 원칙 준수로 지지.
5. **rerun 분석 (§2-6)** — 신규 가드가 과거 run 의 rerun 에 영향을 주지 않음을 논리적 입증으로 인정.
6. **SSoT 단일 정본 구조 (§4-d)** — 신규 type 추가 시 상수 1곳 수정 + `--verify-ssot` 가 산문 drift 를 원천 차단하는 확장성 평가.

### 이견 수용

| 항목 | 원안 | 수정안 | 수용 근거 |
|---|---|---|---|
| (a-1) `--verify-ssot` 파싱 계약 | "백틱 인용 토큰만 대상. `feat` 오탐 경계는 **dev D1 실측으로 확인**" — 메커니즘을 구현 단계에 위임 | §5-4 **추출 계약 4단계를 ADR 에 고정** (locator 고정 문자열 / 백틱 범위 한정 / 양방향 대조 / locator 미발견 hard FAIL) | 외부 모델이 "파싱 메커니즘이 모호하다" 고 지적. measurement-first 는 *수치* 를 실측으로 확정하라는 원칙이지 *계약* 을 미정으로 남기라는 게 아니다. 계약을 ADR 에 고정하고 D1 은 그 계약의 실측 확인으로 역할을 좁혔다 |
| (a-2) detached HEAD 처리 | 로컬 pre-flight 를 "인자 없으면 현재 브랜치" 로만 서술 | detached 감지 + **전용 메시지로 규약 위반과 구분** 을 §5-4 에 명시 | 외부 모델 고유 지적. `git rev-parse --abbrev-ref HEAD` 가 detached 에서 리터럴 `HEAD` 를 반환해 **오도하는 "규약 위반"** 을 낸다. 격리 worktree sub-agent 가 특정 커밋을 체크아웃하는 실제 경로가 있어 유효 |
| (b) `pull_request_target` 금지 명시 | 트리거를 `pull_request` 로 적기만 함 | §5-3 에 **`pull_request_target` 금지 + 근거** 를 CRITICAL 로 박제 | 외부 모델의 fork PR 우려는 §7 기각-2 대로 이미 커버되나, 그 우려가 현실이 되는 **유일한 경로가 `pull_request_target` 오용** 이다. 우려 자체는 기각하되 그 경로를 명시적으로 봉인하는 보강은 수용 |

### Claude 재분석으로 기각한 외부 모델 제안

1. **husky 등 git hook (`pre-push`) 연동 권고 — 기각.** 이 저장소에는 정확히 반대 방향의 실측이 있다: 격리 worktree 기반 sub-agent 는 `node_modules` 부재로 lint-staged 훅을 실행할 수 없어 `--no-verify` 를 **상시** 사용한다 (#877 / #945 / #950 / #951 전례). **#952 가 CI 백스톱을 만든 이유가 바로 "훅은 이 프로젝트에서 신뢰할 수 없는 방어선" 이라는 실측**이다. hook 을 방어선으로 추가하면 실제로는 지켜지지 않는 가드를 하나 더 만들면서 "이중 방어" 라는 잘못된 안전감만 준다. 외부 모델은 이 프로젝트 고유 운영 실측을 알 수 없다.
2. **fork PR 권한·특수문자 예외 처리 필요 — 기각 (이미 커버).** ① 실측상 fork PR 0건 (머지 PR 560건 = `coseo12` 533 + `app/github-actions` 27). ② 트리거가 `pull_request` 이므로 fork 에서는 read-only 토큰으로 실행되고 본 가드는 secret·write 권한을 쓰지 않는다. ③ 브랜치명 특수문자는 `env:` 간접 전달이 셸 해석을 차단하고, 정규식이 문자 집합을 화이트리스트로 좁힌다. 다만 이 우려가 현실이 되는 단일 경로(`pull_request_target`)는 이견-(b) 로 봉인했다.
3. **required status check 를 본 PR 에서 동시 등록 — 부분 기각 (후속 유지).** 실측상 `develop` 은 **branch protection 자체가 없고** `main` 은 `required_status_checks` 가 부재다. 즉 체크 하나를 등록하는 작업이 아니라 **보호 정책 전반을 새로 세우는 결정**이며, 잘못 세우면 릴리스 경로를 막는다 (본 설계 최대 리스크와 동일 클래스). 본 PR 범위 밖 유지. 단 외부 모델 지적대로 **"후속 이슈 생성" 을 DoD 항목으로 고정** 해 유실을 막는다 (§6-4-3 강화).

### 고유 발견 (후속 분리)

**없음.** 외부 모델이 제기한 3건(§기각)과 2건(§이견)은 전부 본 설계의 기존 범위 안에서 해소·봉인됐고, 범위 밖으로 분리해야 할 신규 발견은 산출되지 않았다. 기존 후속 항목(base 선택 규칙 가드 / required check 정책 / `release` `v` 표기 통일)은 cross-validate 이전에 architect 가 이미 분리한 것이며 외부 모델 기여분이 아니다 — 이 구분을 명시해 기여 귀속을 정직하게 유지한다.

### 호출 전 Claude 편향 셀프 체크 (architect 단계, 2026-08-06)

| 축 | 판정 |
|---|---|
| 낙관적 일정 | 통과 — 3중 시뮬레이션에 일회용 PR 2건 + CI run 4회 명시 계상 |
| 결합 간과 | **부분 미통과 → 보정** — 봇 workflow 2곳·릴리스 경로 결합을 초기에 놓쳤다가 실측으로 발견 (§2-3 / §2-4) |
| 폐기 프레이밍 | 통과 — 산문 3곳을 폐기하지 않고 검증된 파생으로 유지 (§4) |
| 순수주의 | **부분 미통과 → 보정** — "이슈번호 100% 강제" 가 봇 자동화를 깬다는 사실을 실측 후 봇 예외를 명시 허용으로 전환 |

미통과 2축은 cross-validate 호출 프롬프트에 명시 질문으로 삽입한다: *"봇 생성 브랜치·릴리스 prep 브랜치 외에, 이슈번호 필수화가 깨뜨릴 수 있는 자동화 경로가 더 있는가?"*
