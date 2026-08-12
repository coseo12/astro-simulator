# ADR: PR base 선택 규칙 CI 가드 — shape 기반 판정 + 관할 분리 (#970)

- **상태**: **Provisional** — CLAUDE.md §ADR Status 워크플로. 본 ADR 은 cross-validate 발동 앵커(ADR 신규)이며, `developer` 페르소나는 cross-validate 호출이 금지돼 있다 (#479). 결과 통합 후 메인이 Accepted 로 전이한다.
- **이슈**: [#970](https://github.com/coseo12/astro-simulator/issues/970) — [#962](https://github.com/coseo12/astro-simulator/issues/962) 축 B 후속 F1
- **선행 ADR**:
  - [20260806-962-branch-name-guard](20260806-962-branch-name-guard.md) — 브랜치 *명명* 절반. 본 ADR 은 그 §11-1 이 후속으로 분리한 base *선택* 절반이다
  - [20260807-971-required-status-checks](20260807-971-required-status-checks.md) — 본 가드가 배선되는 `branch-name` job 이 `main` 의 required check 인 근거. 폭발 반경의 출처

---

## §1 배경

CLAUDE.md §금지 사항은 두 문장으로 나뉜다.

> `<type>/*`·`release/*-prep` PR 의 `base=main` 금지 — `base=main` 은 release PR(head=develop)/hotfix 전용

축 B (PR [#969](https://github.com/coseo12/astro-simulator/pull/969)) 가 **브랜치명** 절반을 기계 SSoT 로 옮겼고, 나머지 **base 선택** 절반은 산문 텍스트로만 남아 있었다.

성격이 다르다는 점을 먼저 못박는다. 축 B 는 *"24.1% 실사용 괴리"* 를 해소하는 가드였다. 본 가드는 **회귀 방지**다 — 아래 §2 가 보이듯 위반은 2026-04-19 이후 0 이다. 따라서 positive PASS 는 아무것도 증명하지 못하며 **negative 가 유일한 작동 증거**다 (§7).

---

## §2 실측 (2026-08-12)

**술어**: `gh pr list --state merged --limit 3000 --json number,headRefName,baseRefName,mergedAt,author` 로 얻은 **머지된** PR 전수 594건. 판정은 `scripts/verify-pr-base-rule.mjs --check-corpus` (본 ADR 이 결정하는 규칙 그 자체 — 자기 적용).

### 2-1 `baseRefName` 분포와 "stacked PR" 의 정체

| base | 건수 |
|---|---|
| `develop` | 427 |
| `main` | 150 |
| 그 외 (작업 브랜치) | **17** |

이슈 #970 의 허용 집합 초안에는 `base=<type>/*` 가 **없었다**. 그런데 17건이 실재하고, [`docs/ops/operational-friction.md`](../ops/operational-friction.md) §1-1 은 이 17건을 *"stacked PR (`base=<type>/*`) 이 여기 해당한다"* 며 auto-close 미발동 조건으로 박제해 두었다. 표면적으로는 **명세가 실사용과 어긋나는** #962 축 B 와 같은 구도로 보인다.

**실측은 그 읽기를 반박한다.**

| 축 | 값 |
|---|---|
| base 가 `develop`·`main` 둘 다 아닌 머지 PR | 17 |
| 그중 author `app/github-actions` | **17 (100%)** |
| 그중 head 가 `chore/r1-baseline-linux-<run_id>` | **17 (100%)** |
| **사람이 연 stacked PR** | **0** |

원인은 구조적이다. [`r1-baseline-bootstrap.yml`](../../.github/workflows/r1-baseline-bootstrap.yml) 은 PR 생성 시 `base: ${{ inputs.target_branch }}` 로 **`workflow_dispatch` 입력**을 그대로 쓴다. baseline 12장을 *그 PR 안에서* 갱신하는 것이 목적이므로 base 는 `develop` 이 아니라 원 작업 브랜치여야 한다.

봇 head PR 을 전수로 다시 세면 **28건 = `develop` 11 + 작업 브랜치 17** 이고, 두 shape 밖으로 나간 사례는 0 이다.

> **결론**: 17건은 *"stacked PR 이라는 실사용 관행"* 이 아니라 **봇 1종의 구조적 동작**이다. 따라서 허용 집합에 넣되 **봇 head 에 한정**한다. 사람 head 의 stacked 를 금지해도 실사용 괴리는 **0** 이다 (§4 결정 3).

### 2-2 위반 85건의 술어 — 그리고 102 와의 차이

이슈 원문은 *"위반 85건, 전부 ≤ 2026-04-19"* 라 적었고, 착수 시 메인의 즉석 규칙은 **102** 를 냈다. 두 수치를 술어와 함께 재측정했다.

| 술어 | 값 | 마지막 위반 |
|---|---|---|
| P-A: `base=main` ∧ head ∉ {`develop`, `hotfix/*`} — **base=main 축 단독** | **85** | 2026-04-19 |
| P-B: P-A ∪ (base 가 `develop`·`main` 둘 다 아님) | **102** | 2026-08-02 |
| 차 (P-B − P-A) | **17** | — |

**차이는 정확히 봇 stacked 17건이다.** 이슈의 85 는 과소 계상이 아니라 *base=main 축만 보는* 다른 술어였고, 메인의 102 는 봇 17건을 위반으로 셌기 때문에 *"이후 위반 0"* 이 깨진 것처럼 보였다. §2-1 에 따라 17건은 허용이므로 **85 가 옳다.**

### 2-3 본 ADR 이 채택한 규칙으로 재실측

```
전체 594  PASS 496  base 규칙 위반 85  판정 보류 13
  pass       work → develop      351   2026-04-14 ~ 2026-08-12
  violation  work → main          78   2026-04-14 ~ 2026-04-18
  pass       develop → main       65   2026-04-14 ~ 2026-08-12
  pass       release → develop    52   2026-05-27 ~ 2026-08-12
  pass       bot → work           17   2026-05-21 ~ 2026-08-02
  unresolved (shape 불명) → develop 13  2026-05-04 ~ 2026-05-29
  pass       bot → develop        11   2026-04-19 ~ 2026-05-30
  violation  release → main        7   2026-04-15 ~ 2026-04-19
```

- **위반 85 = 78 + 7**, 전부 `2026-04-14 ~ 2026-04-19` — **이슈의 85 를 술어 명시로 재현**했다.
- 마지막 위반(2026-04-19T05:17:58Z) **이후 머지 PR 472건에서 위반 0** (이슈 원문 *"~400 PR"* 의 실측값).
- 판정 보류 13 = `architect/*` 11 + `dev/*` 2 — 전부 #942 가 폐기한 접두사이며 **브랜치명 가드 관할**이다 (§4 결정 2).

### 2-4 폭발 반경 실측 — `branch-name` 은 이미 required check 다

`GET /repos/coseo12/astro-simulator/branches/main/protection` (2026-08-12):

| 축 | 값 |
|---|---|
| `required_status_checks.contexts` | `["project-guards", "branch-name", "label-pr"]` |
| `enforce_admins` | `true` |
| `develop` 보호 | **404 Branch not protected** |

[20260806-962](20260806-962-branch-name-guard.md) §6-2 와 [`branch-name-guard.yml`](../../.github/workflows/branch-name-guard.yml) 헤더 §한계, [`docs/guides/branch-strategy-workflow.md`](../guides/branch-strategy-workflow.md) §한계 는 전부 *"`required_status_checks` 부재"* (2026-08-06 실측) 라고 적고 있었다. [#971](https://github.com/coseo12/astro-simulator/issues/971) Phase 1 이 2026-08-08 에 적용되면서 **셋 다 거짓이 됐다**. 본 PR 이 회수한다 (§6-3).

---

## §3 결정 1 — 판정 대상은 **shape** 이지 이름 적합성이 아니다

### 3-1 문제

base 규칙을 "허용 (base, head) 쌍" 으로 적으면, head 를 어떤 기준으로 분류할지가 곧 관할 경계를 정한다. 두 후보가 있다.

| 후보 | head 분류 기준 | 코퍼스 결과 |
|---|---|---|
| (a) 축 B 의 엄격 판정기 재사용 (`classifyBranch`) | 이름이 규약에 **완전 적합**해야 종류 인정 | 판정 불가 **102건** (이름 위반 전건이 유입) |
| (b) **shape (접두사 수준)** | `feature/` `fix/` … `release/` `hotfix/` 접두사 + `develop`/`main` 리터럴 + 봇 정확 매칭 | 판정 불가 **13건** |

### 3-2 결정 — (b) shape

(a) 는 `fix/webgl-fallback` (이슈번호 없음) 같은 PR 에 대해 *"base 를 고쳐라"* 라는 **틀린 교정 지시**를 낸다. base 는 `develop` 으로 옳고 고칠 것은 이름뿐이다. 즉 (a) 는 축 B 의 판정을 **중복 재판**하면서 진단 품질을 떨어뜨린다.

(b) 는 브랜치의 *종류* 만 읽으므로 두 가드의 관할이 겹치지 않는다. 완화의 대가는 "이름이 틀린 브랜치도 base 판정은 통과한다" 인데, 이는 손실이 아니다 — 같은 job 의 앞 스텝이 이미 그 PR 을 FAIL 시킨다.

**예외 하나: `bot`.** 봇은 "종류" 가 아니라 **정체**이므로 정확 매칭이어야 한다. `chore/` 접두사만으로 봇 취급하면 사람이 만든 `chore/970-x` 가 봇 특권(임의 base)을 얻는다. 그래서 이 한 줄만 축 B 의 `classifyBranch(n).rule === 'bot'` 를 그대로 호출한다.

---

## §4 결정 2 — 판정 3종과 귀속 규칙

`pass` / `violation` / `unresolved`. **종료 코드는 뒤 둘이 동일하게 1** 이며, `unresolved` 는 fallback 이 아니다 — 통과로 흘리지 않고(fail-closed) 다른 것은 **귀속과 교정 지시뿐**이다. ([20260811-1010](20260811-1010-measurement-c-verdict-tiers.md) 의 WARN 이 *"판정 성공 후의 명시적 제3 결론"* 이었던 것과 같은 구조이며, 여기서는 blocking 경계조차 움직이지 않는다.)

**귀속 기준은 자의적 배분이 아니라 *"무엇을 고쳐야 통과하는가"* 다.**

| head shape 불명 + | 판정 | 근거 |
|---|---|---|
| `base=develop` | `unresolved` (귀속: branch-name) | develop 의 허용 집합이 `work` 를 포함하므로, head 이름만 규약에 맞추면 base 변경 없이 통과한다 (`architect/594-x` → `feature/594-x`) |
| `base=main` | **`violation` 확정** | main 의 허용 head 는 `develop` **리터럴**과 `hotfix/` **접두사** 둘뿐이고 **둘 다 이름 규약과 무관하게 shape 만으로 판정된다**. shape 불명 = 둘 다 아님이 확정이므로 head 를 어떻게 고쳐도 base 가 틀렸다 |
| base 가 허용 shape 밖 | **`violation` 확정** | base 자체가 규칙 밖 |

이 비대칭이 §2-3 의 `78 + 7 = 85` 와 `13` 을 가른다.

---

## §5 결정 3 — 허용 집합 (정본: `BASE_RULES`)

```js
export const BASE_RULES = {
  develop: ['work', 'release', 'bot', 'main'],
  main: ['develop', 'hotfix'],
  work: ['bot'],
};
```

| base | 허용 head shape | 실측 | 근거 |
|---|---|---|---|
| `develop` | `work` / `release` / `bot` / `main` | 351 / 52 / 11 / 0 | 일상 개발 · 릴리스 준비 · 봇 · hotfix **merge-back** |
| `main` | `develop` / `hotfix` | 65 / 0 | release PR · prod 긴급 패치. **이것이 규칙의 본체다** |
| `work` | `bot` **전용** | 17 | §2-1 — 봇의 `workflow_dispatch` target_branch. **사람 stacked 는 금지** |

- `main` ← `develop`, `hotfix` ← 실측 0 이나 **CLAUDE.md §브랜치 전략 표의 규약이므로 포함** (규약 우선 — 축 B 가 `hotfix` 를 같은 논리로 포함한 전례).
- **봇의 base 를 무제한으로 열지 않았다.** 실측 28건이 전부 `develop`·`work` 두 shape 안에 있고, `target_branch` 는 dispatch 시점에 사람이 손으로 넣는 값이라 오타·오지정은 표면화되는 편이 낫다. *"봇이면 통과"* 는 축 B 가 명시적으로 기각한 **한 클래스 통째 skip** 과 같은 구조다.
- **`BASE_RULES` 가 본 스크립트의 유일한 신규 정본이다.** 브랜치 종류 판정에 필요한 리터럴(`develop`/`main`/type 열거/봇 패턴)은 전부 `verify-branch-name.mjs` 에서 **import** 한다 — CLAUDE.md 가 "숨은 상수" 로 이름 붙인 drift 클래스를 구조적으로 배제한다.

---

## §6 결정 4 — 배선

### 6-1 `branch-name` job 의 **스텝**으로 (별도 job 아님)

| 후보 | 강제력 | 비용 |
|---|---|---|
| (a) 기존 `branch-name` job 에 스텝 추가 | **required check 상속** — 저장소 설정 변경 0 | 폭발 반경 상속 |
| (b) 새 job | 새 컨텍스트라 required 아님 → 붉은 X 만 | required 등록에 `PUT /branches/main/protection` 필요 |

**(a) 채택.** (b) 는 강제력을 얻으려면 저장소 보호 설정을 바꿔야 하는데, 그것은 [20260807-971](20260807-971-required-status-checks.md) 이 단계적 도입으로 관리하는 별건 결정이다. (a) 는 기존 컨텍스트를 그대로 쓰므로 **설정 변경 0 으로 강제력을 얻는다**.

**스텝 순서는 브랜치명 뒤**다. `unresolved` 는 head 이름 위반에서 파생되므로 브랜치명이 먼저 판정돼야 진단이 정확하고, 실제로는 앞 스텝이 실패하면 뒤 스텝이 실행되지 않아 **`unresolved` 는 CI 에서 구조적으로 도달 불가**다. 그럼에도 스크립트는 fail-closed 로 구현한다 — 도달 불가를 근거로 통과시키지 않는다.

### 6-2 폭발 반경 (CRITICAL)

§2-4 대로 `branch-name` 은 `main` 의 required check 이고 `enforce_admins: true` 다. 릴리스·핫픽스 셀에서 오차단이 나면 **머지가 하드 블록되고 admin 우회로가 없다.** 대응:

1. **픽스처 맨 앞 4셀 고정** — `develop→main` / `main→develop` / `hotfix/*→main` / `release/*-prep→develop`. 추가로 **불변식 3건**이 같은 셀을 별도로 단언한다 (픽스처 배열을 지워도 불변식이 남는다).
2. **탈출구 명시** — [`docs/guides/branch-strategy-workflow.md`](../guides/branch-strategy-workflow.md) §required status check 롤백 R1 (1줄, 2초).
3. **live 실증은 base=main 축에서 양방향** (§7-2) — `hotfix/*→main` PASS + `docs/*→main` FAIL.

### 6-2-b `.claude/**` 는 손대지 않는다 — 교정 비용이 축 B 와 **정반대**다

축 B 는 `developer.md` / `create-pr/SKILL.md` 에 push 전 pre-flight 1줄을 심었다. 근거는 §6-3 의 비대칭 — **브랜치명은 PR 생성 후 변경 불가**라 CI 가 잡으면 브랜치·PR 재생성(~3분)이 유일한 교정 경로였다.

base 는 **PR 생성 후에도 바꿀 수 있다** (GitHub UI 의 base 드롭다운, ~10초). 즉 축 B 가 pre-flight 를 *본체*로 삼게 만든 전제가 여기서는 성립하지 않는다. 에이전트 규칙을 늘리는 비용(CLAUDE.md 예산 · `verify-agent-ssot.sh` 9 필드 SSoT 접촉 · 5 에이전트 동시 갱신)이 얻는 것보다 크다. 명령 자체는 [`branch-strategy-workflow.md`](../guides/branch-strategy-workflow.md) §로컬 pre-flight 에 두되 **의무화하지 않는다**.

부수 효과: 본 PR 은 `.claude/**` 무접촉이므로 SSoT 9 필드 가드가 그대로 PASS 다.

### 6-3 구 기록 회수 (동시 의무)

*"`main` 에 `required_status_checks` 부재"* 라는 2026-08-06 실측이 **3곳**에 살아 있었고, 그중 2곳은 본 PR 이 손대는 파일이다. 남겨두면 본 가드의 강제력 서술과 정면 모순한다.

| 위치 | 조치 |
|---|---|
| [`.github/workflows/branch-name-guard.yml`](../../.github/workflows/branch-name-guard.yml) 헤더 §한계 | §강제력 으로 **교체** + 폭발 반경 경고 |
| [`docs/guides/branch-strategy-workflow.md`](../guides/branch-strategy-workflow.md) §한계 | *"해소됨"* 으로 **교체**. 같은 파일 40줄 뒤 §required status check 롤백 절과 자기모순이었다 |
| [20260806-962](20260806-962-branch-name-guard.md) §6-2 | **Amendment 주석 추가** (ADR 본문은 이력이므로 덮어쓰지 않고 회수 표시) |

---

## §7 DoD 4축 적용 판정 ([guard-pr-dod.md](../lessons/guard-pr-dod.md))

| 축 | 적용 | 근거 |
|---|---|---|
| (1) 격리 동적 테스트 | **적용** | `--self-test` 픽스처 43 + 불변식 19 + 자기 적용 프로브 8 = **70 검사**. 판정 대상이 순수 문자열 2개라 격리가 자명 |
| (2) 3중 시뮬레이션 | **적용 (필수)** | §7-2 — 입력이 파일이 아니라 **ref 쌍**이라 일회용 PR 필요 |
| (3) 5 페르소나 self-consistency | **적용 (경량)** | N = `--self-test` 출력 3-tuple. 각 페르소나가 계산하지 않고 **읽는다** (직렬화 해석차가 곧 불일치로 오인되는 것 방지 — 축 B 전례) |
| (4) 메타 도구 자기 적용 | **적용 (강)** | §7-3 |

### 7-1 격리 픽스처 구성

**43 픽스처**를 두 축으로 센다 (술어가 다르므로 병기한다 — [20260808-983](20260808-983-measurement-recording-convention.md) §수치 박제 규약).

- **소스 배열의 주석 구획별** (43) — 최고 리스크 4 / 일상 경로 9 / 봇 4 / violation·dual PR 6 / violation·사람 stacked 3 / violation·역방향·자기참조 3 / violation·base 자체 규칙 밖 4 / unresolved 3 / 입력 위생 7.
- **기대 verdict 별** (43) — `pass` **17** / `violation` **21** / `unresolved` **5**. 두 축이 어긋나는 이유는 "입력 위생" 구획 7건이 verdict 로는 `violation` 5 + `unresolved` 2 로 갈리기 때문이다 (`""`→`develop` 과 `main-backup`→`develop` 이 후자).

전 코퍼스 594쌍을 박아넣지 않는다 (부피 + 네트워크 의존). 전수 실측은 `--check-corpus` 의 1회성 증거로 분리한다 — 축 B 와 동일 구조.

### 7-2 3중 시뮬레이션 — 형태 변형

입력이 **base × head ref 쌍**이고 둘 다 PR 생성 시 확정되므로, 파일 한 글자를 고치는 방식의 negative 가 성립하지 않는다.

| 단계 | 행위 | 기대 |
|---|---|---|
| positive | 본 PR (`feature/970-pr-base-rule-guard` → `develop`) 의 첫 run | SUCCESS |
| **positive (base=main 축)** | `hotfix/970-*` → `base=main` **일회용** PR | SUCCESS — base=main 이 통째로 막히지 않음을 실증 |
| negative | `docs/970-*` → `base=main` **일회용** PR (DoD 2 원문) | FAILURE + `::error::` 에 허용 집합 노출 |
| recovery | 일회용 PR close 후 본 PR 에 커밋 push (`synchronize`) | SUCCESS 유지 |

> **`develop→main` (release PR) 은 live 실증 대상에서 제외한다.** head=develop, base=main 인 PR 은 정의상 **실제 release PR** 이며, 일회용으로 만들면 develop 전체 diff 가 열려 오머지 위험이 생긴다. 대체 근거: (i) 픽스처 + 불변식 이중 고정, (ii) 판정이 순수 함수라 `hotfix/*→main` 이 통과하면 base=main 경로의 기계는 동일하게 동작하고 남는 변수는 head shape 하나뿐, (iii) 코퍼스 65건 소급 PASS. **이 재조정은 스프린트 계약 §7 대로 코드 주석(픽스처 헤더) / PR 본문 / CHANGELOG 세 곳에 박제한다.**
>
> 일회용 브랜치는 **본 feature 브랜치에서 잘라낸다** — `pull_request` 이벤트는 merge ref 의 workflow 정의를 쓰므로, `main` 에서 자르면 신규 스텝이 아예 존재하지 않아 negative 가 성립하지 않는다. 정리는 [`docs/ops/operational-friction.md`](../ops/operational-friction.md) §2 대로 `gh pr merge --delete-branch` 를 쓰지 않고 close + `git push origin --delete` 로 분리한다.

### 7-2-b live 실증 결과 (developer, 2026-08-12 — 일회용 PR 2건, 정리 완료)

| 단계 | PR | head → base | `branch-name` 결론 |
|---|---|---|---|
| positive | [#1023](https://github.com/coseo12/astro-simulator/pull/1023) (본 PR) | `feature/970-pr-base-rule-guard` → `develop` | **SUCCESS** |
| **negative** | [#1024](https://github.com/coseo12/astro-simulator/pull/1024) *(일회용)* | `docs/970-guard-negative` → `main` | **FAILURE** |
| **positive (base=main 축)** | [#1025](https://github.com/coseo12/astro-simulator/pull/1025) *(일회용)* | `hotfix/970-guard-positive` → `main` | **SUCCESS** |
| recovery | [#1023](https://github.com/coseo12/astro-simulator/pull/1023) 에 후속 커밋 push (`synchronize`) | 동상 | **SUCCESS 유지** |

**negative run `31597835456` 이 결정적 증거다** — 두 스텝의 결론이 갈렸다:

```
[PASS] 브랜치명 'docs/970-guard-negative' — 규약 적합 (rule: work)
##[error]base='main' ← head='docs/970-guard-negative' 는 허용되지 않습니다.
head shape 'work' 는 base='main' (shape: main) 로 PR 을 열 수 없습니다. 허용: develop / hotfix.
… 허용 집합 3행 + "교정: PR 의 base 브랜치를 develop 으로 바꾸면 됩니다 (PR 재생성 불요)"
```

앞 스텝이 **PASS 한 채로** 뒤 스텝만 FAIL 했다. 즉 차단의 주체가 신규 스텝임이 실증되며, 기존 브랜치명 가드가 우연히 잡은 것이 아니다. positive run `31597839434` 은 `[PASS] base='main' ← head='hotfix/970-guard-positive' (hotfix → main)` 으로 **base=main 이 통째로 막히지 않음**을 함께 실증한다.

**정리 확인**: 두 PR 모두 `state=CLOSED` / `mergedAt=null` (**머지 0**), 원격·로컬 브랜치 삭제 완료 (`git push origin --delete` 분리 실행 — [`operational-friction.md`](../ops/operational-friction.md) §2). 각 PR 에 close 사유 코멘트 박제.

> **부수 실측 — 일회용 브랜치는 각자 다른 SHA 여야 한다.** 세 브랜치가 같은 커밋을 가리키면 한 SHA 가 3개 PR 의 head 가 되어 `branch-name` 체크런이 `{success, failure, success}` 로 공존한다 — [20260807-971](20260807-971-required-status-checks.md) §2-12 원인 ③ (PR 다중성 축) 이 `4f7366e` 에서 실측한 바로 그 형태이고, **required check 위에서 본 PR 자신의 판정이 오염된다**. 그래서 일회용 브랜치마다 `--allow-empty` 커밋 1개씩을 얹어 SHA 를 분리했다 (`201ca1c` / `74b6a5c` / `a246ece`).

### 7-3 메타 측정 도구 자기 적용 (이슈 DoD 4)

이슈가 명시적으로 요구한 축이다 — 축 B 의 `MODE_ARITY` / `Object.hasOwn` / 재진입 가드 교훈 반영 + **가드 자신이 silent skip 가능한지** 검사.

| 자기 적용 프로브 | 봉인 대상 |
|---|---|
| 심링크 경로 직접 실행 | 진입점 realpath 미정규화 → 전체 no-op exit 0 (축 B 가 실측 재현한 결함) |
| `head=--self-test` | 모드 플래그가 **값**으로 위장해 검사를 가로채는 경로 (축 B reviewer B1) |
| 두 모드 병합 호출 | 한쪽 검사가 조용히 무시되는 경로 → `MODE_ARITY` 초과분 exit 2 |
| 라벨 중복 / 누락 / 위치 인자 | **본 가드 고유 4종째** — 아래 |
| `--constructor` | 프로토타입 오염으로 임의 문자열이 모드가 되는 경로 → `Object.hasOwn` |
| 재진입 가드가 **skip 이 아니라 fail** | `PROBE_ENV` 가 CI env 로 누출되면 프로브 전건이 사라진 채 초록이 되는 3층째 |

**고유 4종째 — 라벨 필수 인자.** `--pr <base> <head>` 같은 위치 인자를 쓰지 않는다. 순서를 뒤바꾸면 `develop→main`(release PR)과 `main→develop`(merge-back)이 **둘 다 허용 셀**이라 스왑이 판정에 아무 흔적을 남기지 않는다 — 최고 위험 경로에서 정확히 **조용한 오답**이다. `base=` / `head=` 라벨을 요구하면 스왑이 구조적으로 불가능하고, 중복·누락·`=` 없는 인자는 전부 exit 2 다.

**같은 실패 모드가 상수 쪽에서 재현된다 — 자기 적용이 잡아낸 결함 1건 (구현 중 실측).** 초판은 gitflow 2행을 `GITFLOW_HEADS[0]` / `[1]` 위치 인덱스로 참조했다. 축 B 가 배열 순서를 바꾸면 `develop` 과 `main` 의 shape 가 뒤바뀌는데, **릴리스 셀과 merge-back 셀이 서로의 판정을 받아도 양쪽 다 허용 셀이라 여전히 `pass`** 다 — 라벨 필수 인자가 막은 것과 **정확히 같은 무흔적 스왑**이다. 실측(격리 사본에 순서 반전 주입):

| 판정 | 초판(위치 인덱스) + 순서 반전 | 정정판(이름 파생) + 순서 반전 |
|---|---|---|
| `develop` → `main` (release PR) | `pass` — 스왑이 흔적을 남기지 않음 | `pass` |
| `main` → `develop` (merge-back) | `pass` — 동상 | `pass` |
| **`feature/970-x` → `main` (dual PR)** | **`pass`** ← 가드의 존재 이유가 무력화 | **`violation`** |
| `--self-test` | 36 passed / **34 failed** | **70 passed / 0 failed** |

self-test 는 잡았지만 **런타임 판정 자체가 틀렸다**. 정정: gitflow 2행을 `GITFLOW_HEADS.map((h) => ({ role: h, ... }))` 로 **이름에서 파생**해 순서 의존을 구조적으로 제거했다 (위 표 오른쪽 열 — 반전해도 무해). 더해 **불변식 2건**(`BASE_RULES` 의 키·허용 head 가 전부 `SHAPES` 가 실제로 생산하는 role 인가)과 **축 B 판정기 정합 대조 8건**을 추가했다. 후자는 `release/` 접두사 때문에 필요하다 — 축 B 가 **상수로 export 하지 않는 유일한 접두사**(`RE_RELEASE` 안에 인라인)라 본 대조가 **유일한 방어선**이다.

**3종 upstream drift 주입 실측** (격리 사본, `--self-test` 종료 코드):

| 주입 | 결과 |
|---|---|
| `HOTFIX_TYPE` → `'urgentfix'` 리네임 | **exit 1** (5 failed — hotfix 최고 리스크 셀 + 신규 불변식 `BASE_RULES 허용 head`) |
| `GITFLOW_HEADS` 순서 반전 | **exit 0** (0 failed) — **정정 후에는 실제로 무해**하므로 이것이 정답이다 |
| `RE_RELEASE` 접두사 `release/` → `rel/` | **exit 1** (2 failed — **축 B 정합 대조만이** 잡는다) |

부수로 **본 PR 의 (base, head) 자신이 가드의 첫 검사 대상**이다 (`feature/970-pr-base-rule-guard` → `develop`). 회피 불가능한 자기참조이며, 픽스처에도 같은 쌍이 들어 있다.

### 7-4 운영 비용 ([guard-design-principles.md](../lessons/guard-design-principles.md) §2 의무)

| 항목 | 추정 |
|---|---|
| 예상 발화 빈도 | **≈ 0/년** — 마지막 위반 이후 472 PR 연속 0. 회귀 방지 목적 |
| 발화 시 결정 시간 | **~10초** — PR base 드롭다운 변경 (브랜치명 위반의 ~3분 대비 훨씬 싸다) |
| 판정 | *"무시 가능 — 임계값 유지"*. silent 약화 불요 |
| CI 비용 | 기존 job 에 스텝 1개 (~1초). 신규 run 0 |

---

## §8 결과 / 한계 / 재검토 조건

### 8-1 한계

1. **`develop` 대상 PR 에서는 여전히 권고**다. `develop` 은 보호 자체가 없고 ([20260807-971](20260807-971-required-status-checks.md) 결정 2 로 **영구 미채택**), 실효 강제 범위는 release/hotfix PR 뿐이다. 다만 본 규칙이 막으려는 것이 정확히 `base=main` 오지정이므로 **위험 표면과 강제 범위가 일치**한다.
2. **`unresolved` 는 CI 에서 도달 불가**라 실환경 발화 증거를 남기지 않는다. 픽스처 3건이 유일한 증거다.
3. **`develop→main` 셀의 live 실증 부재** (§7-2 재조정).
4. **`main→develop` merge-back 과 `hotfix/*→main` 은 실측 0건**이다. 규약 우선으로 허용했으나 실사용 근거가 없어, 첫 hotfix 발생 시가 사실상의 첫 실증이 된다.
5. 봇 허용은 **패턴 열거**에 의존한다 (`BOT_BRANCH_PATTERNS` — 축 B 정본). 3번째 봇 workflow 가 새 패턴을 쓰면 축 B 의 `--verify-ssot` 가 먼저 FAIL 하며 의식적 갱신을 강제한다.

### 8-2 재검토 조건

1. **사람 stacked PR 이 실제로 필요해지면** — §5 `work: ['bot']` 을 넓히기 전에 auto-close 미발동([`operational-friction.md`](../ops/operational-friction.md) §1-1)과 라벨 흐름을 함께 판단할 것. 현재 근거는 *"실사용 0건"* 하나뿐이라 반증이 나오면 즉시 재론 대상이다.
2. **`branch-name` 이 required 에서 내려가거나** ([20260807-971](20260807-971-required-status-checks.md) §9 롤백 실행 등) **job 이름이 바뀌면** — §6-1 의 "설정 변경 0 으로 강제력" 전제가 무너진다.
3. **`r1-baseline-bootstrap` 이 폐지되면** `work: ['bot']` 행은 즉시 제거 대상이다 (실사용 0 이 되므로).
4. `release/*` shape 를 접두사로 판정하므로 `release/v0.28.0` (`-prep` 없음) 도 base=develop 통과다. `-prep` 강제는 축 B 관할이며, [#962](https://github.com/coseo12/astro-simulator/issues/962) 후속 F3 (`v` 표기 통일) 과 함께 다룰 항목이다.

---

## §9 후속

| # | 항목 | 근거 |
|---|---|---|
| 1 | [`operational-friction.md`](../ops/operational-friction.md) §1-1 의 *"stacked PR"* 서술 정밀화 — 17건이 **100% 봇**이라는 구성 사실이 빠져 있어 *"사람의 stacked 관행"* 으로 오독된다 (본 PR 착수 시 실제로 오독이 발생했다) | §2-1 |
| 2 | 봇 PR 의 auto-close 경로 — base 가 작업 브랜치라 `auto-close-issues.yml` 도 네이티브도 미발동. 봇 PR 은 이슈를 닫지 않으므로 실해는 없으나 §1-1 표의 유일한 실사례가 봇이라는 점은 명시 가치가 있다 | §2-1 |

> cross-validate 는 본 ADR 박제 직후 **메인**이 1회 수행한다 (`developer` 페르소나 금지 — #479). 결과 통합 후 §교차검증 반영 사항 4축을 추가하고 Accepted 로 전이한다.
