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
3. **upstream-only 항목 — `(upstream-only)` 표기 의무.** 이 저장소에 **로컬 파일이 없는** upstream
   `harness-setting` 유래 ADR 은 주제 셀에 표기를 달고 `scripts/verify-docs-links.mjs` 의
   `UPSTREAM_ONLY_ALLOWLIST` 에 `(source, target)` 쌍으로 등록한다 (아래 범례). 표기가 없으면 **링크가
   깨진 것인지 로컬에 없는 것인지 구분할 수 없다.** #907 하네스 디커플 이후 **신규 등재는 원칙적으로
   없다** — 기존 3건은 이력 보존 목적으로만 잔존한다.

| 날짜 | 주제 | 상태 | 상하 관계 |
|---|---|---|---|
| 2026-04-19 | [gitflow-main-develop](20260419-gitflow-main-develop.md) **(upstream-only)** | Accepted | **상위** — `main=배포 / develop=개발` 브랜치 전략 결정 |
| 2026-04-19 | [release-merge-strategy](20260419-release-merge-strategy.md) **(upstream-only)** | Accepted | **세부** — 위 gitflow 의 release PR merge 방식 결정 (`--merge` + fast-forward). 선행 ADR: `20260419-gitflow-main-develop` |
| 2026-04-20 | [jq-based-parsing-no-op](20260420-jq-based-parsing-no-op.md) **(upstream-only)** | Accepted (NO-OP) | cross-validate outcome JSON 파싱의 jq 전환 **기각** — grep/sed 파이프라인 유지 + 경계 가드 테스트 추가 |
| 2026-07-31 | [907-harness-decouple](20260731-907-harness-decouple.md) | Accepted | 하네스 동기화 디커플 — 주기 동기화 중단 + upstream 읽기 전용 강등 + 기계장치 청산. Supersedes: `20260515-harness-managed-divergent-pattern`, `20260419-prettier-harness-conflict` |
| 2026-08-06 | [962-branch-name-guard](20260806-962-branch-name-guard.md) | Accepted | 브랜치명 규약의 정본을 산문 3곳에서 실행 가능한 가드 상수로 이전 — CI 런타임 검사 + 산문 파생 정적 대조. #942 규약의 강제 수단 |
| 2026-08-07 | [971-required-status-checks](20260807-971-required-status-checks.md) | Accepted | branch protection required status check 정책 — `main` 한정 3단계 도입 + `develop` 은 최소 보호(force-push·삭제 차단)만 하고 required check **영구 미채택** (ff-sync 보호). 선행 ADR: `20260806-962-branch-name-guard` §6-2 인계 |
| 2026-08-08 | [983-measurement-recording-convention](20260808-983-measurement-recording-convention.md) | Accepted | 수치 박제 규약 — 일괄 도출 / 부분 재측정 금지 / **술어 명시**. **원조**: `20260515-harness-managed-divergent-pattern` §Amendment 19 (`Superseded` + _"불변 유지"_ 선언이라 **편집하지 않고** 본 ADR 로 승격). 자매 규약: 전수 grep (`.claude/agents/reviewer.md` §절차 4) |

> **범례 — `(upstream-only)`**: 이 저장소에 **로컬 파일이 없다.** 링크 대상은 upstream
> [`harness-setting/docs/decisions/`](https://github.com/coseo12/harness-setting/tree/main/docs/decisions)
> 의 동명 ADR 이며 (2026-08-10 실측: 3건 전부 upstream 에 실재), **이 저장소의 GitHub 렌더에서
> 클릭하면 404** 다. `scripts/verify-docs-links.mjs` 는 `UPSTREAM_ONLY_ALLOWLIST` 로 이 3쌍을
> 통과시키되 **조용한 skip 이 아니라** 발동 건수를 매 실행 stdout 에 보고한다. 즉 링크 검사 PASS 는
> _"파일이 있다"_ 가 아니라 **_"부재가 알려져 있다"_** 를 뜻한다. 표기 없는 항목은 로컬 파일이 있다.

## 언제 작성하는가

- 코어 언어/런타임/프레임워크 도입·교체
- 주요 외부 의존성 추가 (DB, 메시지 큐, 인증 등)
- 프로젝트 전반 영향 패턴 채택 (상태 관리, 빌드 도구, 모노레포 구조)

일회성 코드 결정은 ADR 대상이 아니다 (PR 본문/커밋 메시지로 충분).

## 참고

- harness CLAUDE.md "아키텍처 결정 기록 (ADR)" 절
- ADR 원형: https://adr.github.io
