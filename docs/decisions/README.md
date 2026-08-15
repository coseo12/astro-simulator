# Architecture Decision Records (ADR)

코어 기술 결정의 **배경 / 후보 비교 / 결정 / 재검토 조건**을 박제하는 디렉토리.

## 규약

- 파일명: `<YYYYMMDD>-<kebab-case-topic>.md`
- **같은 날짜에 여러 ADR 이 발생할 경우 topic 접미사로 관계 표현**: 상위 결정은 `<topic>` (예: `-gitflow-main-develop`), 세부 결정은 `<topic>-<하위범위>` (예: `-release-merge-strategy`). 상위 ADR 은 하위 ADR 에서 "선행 ADR" 로 인용
- 본문 구조와 작성 절차는 `record-adr` 스킬을 참조 (또는 호출).
- 결정이 무효화/대체될 때는 **삭제하지 않고** 상태를 `Superseded by [신규 ADR]`로 갱신한다.
- 1 ADR = 1 결정. 여러 결정을 묶지 않는다.

## 현재 ADR 인덱스

### 인덱스 계약

본 표는 `docs/decisions/` **전체의 아카이브 목록이 아니다.** 아래 3조항이 등재·유지의 정본이며,
[#998](https://github.com/coseo12/astro-simulator/issues/998) 이전에는 **de facto 관행으로만** 존재했다
(재현은 가능했으나 README 자신에 적혀 있지 않아, 등재 판단마다 과거 등재를 역추적해야 했다 — ADR
[`20260808-983`](20260808-983-measurement-recording-convention.md) §결과 4 가 절반만 닫은 나머지).

1. **등재 기준 — 횡단 거버넌스·프로세스 ADR 의 현행 정본 목록.** 저장소 전체 / 전 에이전트 / 전 PR 에
   **상시** 적용되는 결정 (브랜치 전략 · 릴리스 절차 · 하네스 정책 · 가드/기록 규약) 만 등재한다. 단일
   기능 · Phase · 회귀에 국한된 ADR (R-Phase 시각화 / forensic / NO-OP 등) 은 **등재 대상이 아니다** —
   그쪽 카탈로그는 `docs/decisions/` 디렉토리 자체다. 판정 질문: _"이 결정을 모른 채 무관한 작업을 하면
   그 작업이 규약을 위반하는가?"_ **예 → 등재.**
2. **상태 열 갱신 책임 — ADR 상태를 전이시키는 PR 이 _같은 PR 에서_ 본 표를 갱신한다.**
   `Provisional → Accepted` / `→ Superseded` 어느 방향이든 ADR 실물 헤더와 본 표는 **같은 커밋에서**
   움직인다. ADR [`20260808-983`](20260808-983-measurement-recording-convention.md) (iii) 의
   _"CHANGELOG ↔ ADR 상태 동시 갱신"_ 과 같은 조항이고 **대상만 다르다** — 다만 CHANGELOG 는 릴리스마다
   밀려나는 반면 **본 표는 항구적이라 drift 가 더 오래 산다.** 실제 위반 1건이 #998 에서 발각됐다:
   `971-required-status-checks` 가 2026-08-08 에 Accepted 로 전이됐는데 (PR
   [#993](https://github.com/coseo12/astro-simulator/pull/993)) 본 표는 `Provisional` 로 남아 있었다.
   - **강제 지점 — [`scripts/verify-adr-index.mjs`](../../scripts/verify-adr-index.mjs)**
     ([#1005](https://github.com/coseo12/astro-simulator/issues/1005)). 본 표의 상태 열과 ADR 실물
     첫 `상태:` 라인의 **상태 토큰**을 대조해 불일치 시 CI 를 FAIL 시킨다 (`project-guards.yml`).
     로컬 재현: `node scripts/verify-adr-index.mjs` (`pnpm verify:adr-index`). 본 조항이 명문화
     ([#998](https://github.com/coseo12/astro-simulator/issues/998) 축 B) 된 뒤에도 **강제 지점이
     0** 이라 drift 가 **두 번** 실측됐다 — 위 #993 (전이 PR 의 변경 파일이 정확히 2개라 본 표를
     **정의상 열지 않음**) + PR [#1015](https://github.com/coseo12/astro-simulator/pull/1015)
     (신규 ADR `20260811-1010` 미등재, 명문화 **바로 다음 PR**). 둘 다 사람이 잡았고, 본 가드는
     그 수동 정정이 **다시 어긋나지 않게** 한다.
   - ⚠️ **가드가 덮지 않는 2건** (범위 밖 — "없어서 안 잡히는 것" 이 아니라 **의도된 경계**):
     ① **미등재 검출** — 등재 기준(조항 1)이 _"이 결정을 모른 채 …"_ 라는 **의미론적 판정**이라
     기계가 precision 1.0 으로 결정할 수 없다 (실측 2026-08-12: ADR 실물 **95건 중 인덱스 등재
     로컬 5건** → 전수 등재 강제 시 오탐 90건 / _"`CLAUDE.md`·`.claude`·`scripts` 에서 참조되면
     횡단"_ 휴리스틱은 **precision 3/17 · recall 3/5**). ADR 자기 선언 마커가 precision 1.0
     대안이나 **신규 규약 신설**이라 별도 이슈로 분리했다. 미검출은 가드 self-test `F10` 이
     경계로 고정한다 (미래 관찰자가 _"누락"_ 으로 오인하지 않도록).
     ② **산문 역참조** — 본문 안의 상태 서술 (예: 다른 문서가 어떤 ADR 을 `Provisional` 로 적는
     문장) 은 표 셀이 아니라 자연어라 별개 난이도다. **본 조항 자체도 이 클래스를 덮지 않는다.**
3. **upstream-only 항목 — `(upstream-only)` 표기 의무 + 상태는 upstream GET 으로 대조.** 이 저장소에
   **로컬 파일이 없는** upstream `harness-setting` 유래 ADR 은 주제 셀에 표기를 달고
   [`scripts/upstream-only-allowlist.mjs`](../../scripts/upstream-only-allowlist.mjs) 의
   `UPSTREAM_ONLY_ALLOWLIST` 에 `(source, target)` 쌍으로 등록한다 (#1005 이전에는 이 목록이
   `verify-docs-links.mjs` 안에 있었다 — 두 가드가 같은 목록을 쓰게 되면서 모듈로 분리했다).
   (아래 범례). 표기가 없으면 **링크가 깨진 것인지 로컬에 없는 것인지 구분할 수 없다.** #907 하네스
   디커플 이후 **신규 등재는 원칙적으로 없다** — 기존 3건은 이력 보존 목적으로만 잔존한다.
   **표기 · 로컬 파일 부재 · allowlist 등록 3원 일치**는 위 조항 2 의 가드가 기계 검사한다 — 셋 중
   하나만 바꾸면 FAIL 이라, 표기를 빠뜨린 채 등록만 하는 경로가 막힌다.
   - ⚠️ **로컬 파일 부재는 _"대조 불가"_ 가 아니다.** 상태 열은 아래 **1줄 GET** 으로 upstream 실물과
     직접 대조된다 (쓰기 계열 `-X PUT/PATCH/DELETE` 금지, GET 전용):
     ```bash
     gh api repos/coseo12/harness-setting/contents/docs/decisions/<파일>.md --jq .content | base64 -d | grep -m1 '상태'
     ```
     upstream 이 이 3건 중 하나를 `Superseded` 로 전이시키면 본 표는 조용히 틀리므로, 등재 항목 전수
     대조 시 **로컬 행은 파일 헤더로 · upstream 3행은 위 명령으로** 대조한다 (로컬 쪽은 #1005 이후
     [`verify-adr-index.mjs`](../../scripts/verify-adr-index.mjs) 가 기계화 — 위 조항 2. 종전 이
     자리에 있던 _"로컬 4행"_ 은 1010 등재로 이미 5행이 됐던 **stale 수치**라 개수 표기를 걷어냈다.
     upstream 3 은 _"신규 등재는 원칙적으로 없다"_ 로 고정된 수라 유지). _"실물이 없어 원리적으로
     대조 불가"_ 라는 서술은 **재확인 시도 자체를 봉인**하므로 쓰지 않는다 (PR
     [#1004](https://github.com/coseo12/astro-simulator/pull/1004) reviewer 라운드 1 BLOCK-2 — 초판이
     정확히 그 서술을 썼고 실측으로 반증됐다).

| 날짜 | 주제 | 상태 | 상하 관계 |
|---|---|---|---|
| 2026-04-19 | [gitflow-main-develop](20260419-gitflow-main-develop.md) **(upstream-only)** | Accepted | **상위** — `main=배포 / develop=개발` 브랜치 전략 결정 |
| 2026-04-19 | [release-merge-strategy](20260419-release-merge-strategy.md) **(upstream-only)** | Accepted | **세부** — 위 gitflow 의 release PR merge 방식 결정 (`--merge` + fast-forward). 선행 ADR: `20260419-gitflow-main-develop` |
| 2026-04-20 | [jq-based-parsing-no-op](20260420-jq-based-parsing-no-op.md) **(upstream-only)** | Accepted (NO-OP) | cross-validate outcome JSON 파싱의 jq 전환 **기각** — grep/sed 파이프라인 유지 + 경계 가드 테스트 추가 |
| 2026-07-31 | [907-harness-decouple](20260731-907-harness-decouple.md) | Accepted | 하네스 동기화 디커플 — 주기 동기화 중단 + upstream 읽기 전용 강등 + 기계장치 청산. Supersedes: `20260515-harness-managed-divergent-pattern`, `20260419-prettier-harness-conflict` |
| 2026-08-06 | [962-branch-name-guard](20260806-962-branch-name-guard.md) | Accepted | 브랜치명 규약의 정본을 산문 3곳에서 실행 가능한 가드 상수로 이전 — CI 런타임 검사 + 산문 파생 정적 대조. #942 규약의 강제 수단 |
| 2026-08-07 | [971-required-status-checks](20260807-971-required-status-checks.md) | Accepted | branch protection required status check 정책 — `main` 한정 3단계 도입 + `develop` 은 최소 보호(force-push·삭제 차단)만 하고 required check **영구 미채택** (ff-sync 보호). 선행 ADR: `20260806-962-branch-name-guard` §6-2 인계 |
| 2026-08-08 | [983-measurement-recording-convention](20260808-983-measurement-recording-convention.md) | Accepted | 수치 박제 규약 — 일괄 도출 / 부분 재측정 금지 / **술어 명시**. **원조**: `20260515-harness-managed-divergent-pattern` §Amendment 19 (`Superseded` + _"불변 유지"_ 선언이라 **편집하지 않고** 본 ADR 로 승격). 자매 규약: 전수 grep (`.claude/agents/reviewer.md` §절차 4) |
| 2026-08-11 | [1010-measurement-c-verdict-tiers](20260811-1010-measurement-c-verdict-tiers.md) | Accepted | 측정 방법 C **3계급 판정**(PASS / WARN / FAIL) + 판정식 SSoT 를 가드 스크립트로 수렴 — 파생 5곳이 독립 판정식을 갖던 drift 제거. blocking 경계는 종전과 **수학적으로 동일**. 선행 ADR: [`20260807-971`](20260807-971-required-status-checks.md) 결정 9-1 (본 가드는 required check **아님**) |
| 2026-08-12 | [970-pr-base-rule-guard](20260812-970-pr-base-rule-guard.md) | Accepted | PR `base` 선택 규칙의 기계 SSoT — `base=main` 은 release PR(head=develop)/hotfix 전용. head 를 **shape(접두사 수준)** 로 분류해 브랜치명 가드와 **관할을 분리**하고, `base=<type>/*` 는 **봇 전용**으로 한정 (실측: 그 17건이 100% 봇). 선행 ADR: [`20260806-962`](20260806-962-branch-name-guard.md) §11-1 후속 F1 / [`20260807-971`](20260807-971-required-status-checks.md) (배선 job 이 required check 인 근거) |
| 2026-08-12 | [1005-adr-index-status-guard](20260812-1005-adr-index-status-guard.md) | Accepted | 인덱스 계약 (2) **상태 열 갱신 책임의 강제 지점** — 본 표 상태 열 ↔ ADR 실물 `상태:` 토큰을 CI 에서 기계 대조. 미등재·산문 역참조는 명시적 범위 밖. 선행 ADR: [`20260808-983`](20260808-983-measurement-recording-convention.md) (자매 규약 — CHANGELOG ↔ ADR 상태 동시 갱신) |
| 2026-08-13 | [1014-release-pr-class-no-op](20260813-1014-release-pr-class-no-op.md) | **Accepted** (cross-validate agy 2026-08-13 — `Provisional` 에서 전이) | release PR 클래스 미스매치 **NO-OP** — 릴리스 클래스 107 PR / 54 사이클 전수 재측정으로 (a)~(d) 전건 기각, (c) 는 2026-05-16 부터 이미 이행 중. 선행 ADR [`20260811-1010`](20260811-1010-measurement-c-verdict-tiers.md) §재검토 조건 1항을 **기계 판정 가능한 1-A(WARN 축) / 1-B(FAIL 축)** 로 대체 |
| 2026-08-14 | [982-changelog-tilde-guard](20260814-982-changelog-tilde-guard.md) | **Accepted** (cross-validate agy 2026-08-14 — `Provisional` 에서 전이) | prettier 소유 markdown (실측 5 파일) 에서 **bare `~~` 전면 금지** + diff 스코프 fail-fast 가드 채택 — 예외·우회로 없음. 209 커밋 시뮬레이션 발화 2 / 오검출 0. 선행 ADR [`20260811-1010`](20260811-1010-measurement-c-verdict-tiers.md) (WARN 축을 **채택하지 않는** 근거 비교) |
| 2026-08-14 | [960-worktree-typecheck-recipe](20260814-960-worktree-typecheck-recipe.md) | **Accepted** (cross-validate agy 2026-08-14) | 격리 worktree typecheck 선행 조건 — **정본은 기존 `pnpm install --frozen-lockfile` + `pnpm build` 2 명령** (CI `setup-and-build` 와 동일 경로). `apps/web/next-env.d.ts` **tracked 화 기각** = #210 재확인 (동일 rev·동일 Next 에서 `next dev` ↔ `next typegen` 산출 md5 상이 실측). 신규 스크립트·`postinstall` 미도입. 선행 ADR: `20260808-983` (수치 박제 규약) |
| 2026-08-14 | [958-prettier-live-docs-scope](20260814-958-prettier-live-docs-scope.md) | **Accepted** (cross-validate agy 2026-08-14 — `Provisional` 에서 전이) | live 문서 prettier 소유 경계 — `docs/**` 구조를 유지한 채 **디렉토리 재포함 + markdown 한정** 재포함으로 죽은 `!` negation 수리 (편입 40 파일 전건 `.md`, 기계 생성 JSON 제외). [`20260731-907`](20260731-907-harness-decouple.md) §결정 4 의 **기전 정정** (의도는 유지) / [`20260814-982`](20260814-982-changelog-tilde-guard.md) §재검토 조건 1 감시값 `5` → `45` (편입 40 파일) |
| 2026-08-14 | [1031-1064-committed-claim-guard-rejected](20260814-1031-1064-committed-claim-guard-rejected.md) | **Accepted** (cross-validate agy 2026-08-14 — `Provisional` 에서 전이) | 커밋된 산출물의 「검증 가능한 거짓」 기계 대조 — **인용 식별자 축**(#1031, 정밀도 `0/17`)·**박제 술어 재실행 축**(#1064, `0/2`) 양축 **기각** + 표기 규약 신설 기각 + `verify-adr-index` 확장 기각. 대조 주체 = **사람**을 명시 결정으로 승격하고, 감시값 SSoT 를 가드 스크립트 상수 1곳으로 수렴시키는 것만 채택. 선행 ADR: [`20260808-983`](20260808-983-measurement-recording-convention.md) §기각 2 · §Amendment 2 (동일 클래스 2연속 기각) / [`20260814-982`](20260814-982-changelog-tilde-guard.md) §재검토 조건 1 |
| 2026-08-14 | [1040-changelog-tilde-recovery](20260814-1040-changelog-tilde-recovery.md) | Provisional | **소급 편집 금지의 기계 판정 가능한 예외** — 릴리스 확정 CHANGELOG 구간의 GFM 취소선 손상(21 줄 / 44 발생) 1회 회수. 예외 경계는 사람의 _"의미는 안 바뀌니까"_ 선언이 아니라 **4항 술어**(손상 보유 라인 한정 · 백틱/물결 정규화 후 문자열 동일 · 잔존 0). 상설 가드는 **미채택**(신규 유입이 이미 0 → precision 0). 선행 ADR [`20260814-982`](20260814-982-changelog-tilde-guard.md) 의 위임 행을 닫는다 / [`20260808-983`](20260808-983-measurement-recording-convention.md) §Amendment 1 (_"금지 대상은 소급 **무흔** 편집"_) 이 해석 정본 |
| 2026-08-14 | [1060-packages-test-typecheck](20260814-1060-packages-test-typecheck.md) | **Accepted** (cross-validate agy 2026-08-15) | `packages/{shared,core}` 테스트 파일 58 개의 타입 검사 강제 지점 — `ci-physics-wasm.yml` `verify-and-rust` 에 스텝 1 개. **다중 `--filter` 단일 호출 금지**가 pnpm 기반 CI 가드 전반의 규약 (한쪽 스크립트 소실 시 exit `0` silent no-op 실측 — #840 클래스) → 패키지별 분리 호출 + `--fail-if-no-match`. 저장소 설정 무접촉 ([`20260807-971`](20260807-971-required-status-checks.md) 결정 1 관할). `next build` 가 `*.test.*` 를 검사하지 않음을 실측 (이슈 전제 반증) → `apps/web` 45 + `physics-wasm` 1 은 후속 분리 |

> **범례 — `(upstream-only)`**: 이 저장소에 **로컬 파일이 없다.** 링크 대상은 upstream
> [`harness-setting/docs/decisions/`](https://github.com/coseo12/harness-setting/tree/main/docs/decisions)
> 의 동명 ADR 이며 (2026-08-10 GET 실측: 3건 전부 upstream 에 실재하고 **상태 열도 전건 일치** —
> 위 계약 (3) 의 1줄 명령), **이 저장소의 GitHub 렌더에서
> 클릭하면 404** 다. `scripts/verify-docs-links.mjs` 는
> [`upstream-only-allowlist.mjs`](../../scripts/upstream-only-allowlist.mjs) 의
> `UPSTREAM_ONLY_ALLOWLIST` 로 이 3쌍을
> 통과시키되 **조용한 skip 이 아니라** 발동 건수를 매 실행 stdout 에 보고한다. 즉 링크 검사 PASS 는
> _"파일이 있다"_ 가 아니라 **_"부재가 알려져 있다"_** 를 뜻한다. 표기 없는 항목은 로컬 파일이 있다.
> `verify-adr-index.mjs` 도 **같은 목록을 import** 해 제외를 판정하고, 제외 3행 각각에 대해 위
> 1줄 GET 명령을 매 실행 stdout 에 재출력한다 (제외가 곧 인계임을 매번 노출).

## 언제 작성하는가

- 코어 언어/런타임/프레임워크 도입·교체
- 주요 외부 의존성 추가 (DB, 메시지 큐, 인증 등)
- 프로젝트 전반 영향 패턴 채택 (상태 관리, 빌드 도구, 모노레포 구조)

일회성 코드 결정은 ADR 대상이 아니다 (PR 본문/커밋 메시지로 충분).

## 참고

- harness CLAUDE.md "아키텍처 결정 기록 (ADR)" 절
- ADR 원형: https://adr.github.io
