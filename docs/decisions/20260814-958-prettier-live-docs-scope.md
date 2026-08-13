# ADR: live 문서 prettier 소유 경계 — markdown 한정 재포함으로 죽은 negation 수리 (#958)

- 일자: 2026-08-14
- **상태**: **Accepted** (cross-validate agy 2026-08-14 — §교차검증 반영 사항 4축 통합 완료. `Provisional` 에서 전이). ⚠️ 본 라인은 [`20260812-1005`](20260812-1005-adr-index-status-guard.md) §재검토 조건의 **어순 제약** 대상이다 — 현재 상태 토큰이 최선두여야 한다
- 관련: 이슈 [#958](https://github.com/coseo12/astro-simulator/issues/958) / 발견 경로 PR [#957](https://github.com/coseo12/astro-simulator/pull/957) 리뷰 (#952) / 중복 생성 후 종결 [#1053](https://github.com/coseo12/astro-simulator/issues/1053)
- **정정 대상 ADR**: [`20260731-907`](20260731-907-harness-decouple.md) §결정 4 — 그 조항이 규정한 `!` negation 형식이 **도입 시점부터 무효**였음을 본 ADR 이 실측하고 작동하는 형식으로 교체한다 (결정의 **의도**는 유지, **기전**만 정정)
- 선행 ADR: [`20260419-prettier-harness-conflict`](20260419-prettier-harness-conflict.md) §제외 대상 정책 (4경로 원 선언 — `Superseded` + 본문 불변이라 편집하지 않고 본 ADR 이 승계) / [`20260814-982`](20260814-982-changelog-tilde-guard.md) (§모집단 감시값 5 → 44 갱신 대상) / [`20260808-983`](20260808-983-measurement-recording-convention.md) (수치 박제 규약 — 단일 rev 일괄 도출)
- **측정 rev**: `7ca1cd1` (`origin/develop` tip, 2026-08-14). 본 문서의 모든 수치는 이 단일 rev 에서 prettier `3.9.6` (`pnpm exec` = lockfile 정본) 으로 일괄 도출했다. 플랫폼 macOS

---

## 배경

### 선언과 동작이 갈려 있었다

`.prettierignore` 43~47 행은 _"live 문서 예외 4경로 — prettier 포맷 대상 유지"_ 를 선언한다:

```
docs/**
...
# live 문서 예외 4경로 — prettier 포맷 대상 유지 (구 ADR 20260419-prettier-harness-conflict 결정 승계)
!docs/benchmarks/**
!docs/phases/**
!docs/reports/**
!docs/retrospectives/p*-retrospective.md
```

실측 (`pnpm exec prettier --file-info`, 각 경로 tracked `.md` 1건) — **4경로 전건 `ignored: true`**. 선언의 반대다.

| 경로 | 선언 | 실제 |
| --- | --- | --- |
| `docs/benchmarks/**` | 포맷 대상 유지 | **`ignored: true`** |
| `docs/phases/**` | 포맷 대상 유지 | **`ignored: true`** |
| `docs/reports/**` | 포맷 대상 유지 | **`ignored: true`** |
| `docs/retrospectives/p*-retrospective.md` | 포맷 대상 유지 | **`ignored: true`** |

기전은 gitignore 문법이다 — 부모 `docs/**` 가 제외된 뒤에는 하위 파일만 `!` 로 되돌릴 수 없다.

### 이 줄들은 도입 시점부터 죽어 있었다

`git log -S` 로 도입 커밋을 특정했다 — `b474902` (#907 Phase B/C, 2026-07-31). 그 **직전**의 `.prettierignore` 는 매니페스트 파생 **열거 목록**이었고, 4경로는 목록에 **없어서**(= 누락에 의한 예외) 자동으로 포맷 대상이었다. `!` negation 자체가 존재하지 않았다.

`b474902` 는 열거 목록을 `docs/**` 일괄 제외로 바꾸면서 그 예외를 `!` negation 으로 **번역**했고, 그 번역이 구조적으로 무효였다. 같은 커밋의 메시지는 이렇게 적었다 — _"`.prettierignore`: manifest 파생 자동 생성 블록 → 정적 curated 섹션 (live 문서 4경로 `!` negation **유지** — SSoT 원문 매칭 가드 보호)"_.

**즉 의도는 보존이었고 결과는 무효다.** 현재 동작(4경로 전부 제외)은 **결정이 아니라 사고**이며, 발견 시점까지 14일 유지됐다.

⚠️ **#907 의 cross-validate 는 이 전환을 통과시켰다** — ADR `20260731-907` §교차검증 반영 사항 §합의 는 _"`.prettierignore` 정적 curated + `!` negation 전환 (§결정 4) … 전부 '정밀' 평가"_ 라고 적었다. **외부 모델도 Claude 도 실행해 보지 않았다.** 이 ADR 이 남기는 1차 교훈은 판정이 아니라 이것이다 — _설정 파일의 의미론은 읽어서 판정할 수 없고 `--file-info` 한 줄로 판정된다._

### 선언 출처는 둘이고 둘 다 살아 있다

- ADR [`20260419`](20260419-prettier-harness-conflict.md) §제외 대상 정책 — 4경로를 명시 열거하며 _"프로젝트 작업물로 취급 → 로컬 prettier 컨벤션 적용"_. 현재 `Superseded` + _"본문 불변"_ 선언이라 **편집 불가**
- ADR [`20260731-907`](20260731-907-harness-decouple.md) §결정 4 — _"기존 live 문서 예외 4경로 … 는 `!` negation 으로 포맷 대상 유지"_. **`Accepted` (살아 있는 결정)**

따라서 _"주석을 실제 동작에 맞춘다"_ 는 선택지는 **비용 0 이 아니다** — 살아 있는 ADR 결정의 번복이며 그 자체가 ADR 급 행위다.

---

## 후보 비교

이슈 #958 §범위 는 (A)/(B) 택일을 상정했다. 실측 과정에서 **(B) 의 전제가 두 군데 틀렸음**이 드러나 (C) 를 신설했다.

| 축 | (A) 주석 정정 | (B) 개별 경로 열거 전환 | **(C) markdown 한정 재포함** |
| --- | --- | --- | --- |
| 4경로 소유 | 제외 (선언 = 동작) | 포맷 대상 | **포맷 대상** |
| `docs/**` 구조 | 유지 | **해체** — 하위 디렉토리 열거 | **유지** |
| 신규 `docs/<신규디렉토리>/` | 제외 (fail-closed) | **포맷 대상 (fail-open)** — 열거 누락 시 조용히 유입 | **제외 (fail-closed)** |
| 기계 생성 JSON | 제외 | **유입 (H1)** | **제외** |
| 미문서화 매칭 동작 의존 | 없음 | **있음 (H2)** — `p*` 가 `P*` 4건을 case-folding 에 기대어 포함 | **없음** — 리터럴 접미사 매칭 |
| 살아 있는 ADR 결정 | **번복** | 이행 | **이행** |
| 일회성 churn | 0 | 9 파일 | **5 파일 / `13 insertions` / `12 deletions`** |
| 물결 선처리 | 불요 | 10 발생 | **10 발생 / 4 라인 / 3 파일** |

### (B) 의 전제 오류 1 — negation 은 "원리적 불가" 가 아니다

이슈 §배경 은 _"디렉토리가 제외되면 그 하위는 재포함 불가"_ 라고 적었다. gitignore 표준 우회(**디렉토리를 먼저 재포함**)가 실제로 작동한다:

```
docs/**
!docs/benchmarks/
!docs/benchmarks/**
```

실측 — `docs/benchmarks/README.md` `ignored: false` / `docs/lessons/README.md`·`docs/decisions/README.md`·`docs/retrospectives/README.md` `ignored: true` 유지. 즉 **`docs/**` 를 해체하지 않고 4줄 추가만으로 수리된다.** (B) 가 상정한 _"개별 경로 열거 전환"_ 은 불필요하며, 그 전환은 신규 `docs/` 하위 디렉토리가 열거 누락 시 **조용히 포맷 대상이 되는** fail-open 구조를 새로 만든다.

### (B) 의 전제 오류 2 — churn 규모가 실측과 다르다

착수 전 사전 측정은 `git grep -oE '[0-9A-Za-z]+~[0-9A-Za-z]+'` 로 4경로의 bare 물결 **92 발생**을 세고 _"(B) 채택 시 92건이 GFM 취소선으로 일괄 손상"_ 으로 판정했다. **정규식이 아니라 `prettier --write` 로** 재측정한 결과:

| 축 | 사전 측정 (정규식 프록시) | **실측 (`--write`)** |
| --- | ---: | ---: |
| 대상 md 파일 | 44 | **34** |
| 신규 GFM 손상 | **92 발생** | **10 발생 / 4 라인 / 3 파일** |
| 재포맷 diff | _"대량 재포맷"_ | **`13 insertions` / `12 deletions`** |

차이의 출처 둘 — ① 정규식은 **이미 인라인 코드 스팬 안에 있는** 물결(= [`operational-friction.md`](../ops/operational-friction.md) §7-1 이 처방한 안전 형태)을 손상 후보로 센다 ② 같은 문단에 **짝이 없는** 물결은 prettier 가 건드리지 않는데 정규식은 센다. 실제 변환 대상은 문단 내 짝이 맞는 쌍뿐이다. 파일 수 차이는 `docs/retrospectives` 를 디렉토리 전체(19)로 셌기 때문이며 선언 단위는 `p*-retrospective.md`(9)다.

> **이 ADR 의 2차 교훈** — _문자열 계수는 포맷터 동작의 프록시가 될 수 없다._ 프록시는 상한이고, 상한으로 판정하면 **9.2배 과대 추정**이 된다. [`20260808-983`](20260808-983-measurement-recording-convention.md) §술어 명시 의 연장선이다.

### (B) 의 고유 위험 2건 — (C) 가 해소한다

- **H1 — 기계 생성 JSON 유입.** `docs/benchmarks/*.json` (`baseline.json` / `fps-lowend-baseline.json` / `a11y-baseline.json`) 은 `bench-baseline-remeasure.yml` 이 **자동 생성·커밋**하고 `verify-fps-baseline.mjs` 가 소비한다. prettier 소유가 되면 생성기 출력 포맷 ↔ prettier 포맷 사이에 상시 drift 가능하다. 추가로 forensic JSON **4건**은 `docs/**` 를 통째로 되돌리는 순간 이미 `--check` 위반이다
- **H2 — `p*-retrospective.md` 는 문서화되지 않은 case-insensitive 매칭에 의존.** 실측: 이 환경의 prettier ignore 매칭은 **완전 case-insensitive** 다 — `docs/LESSONS/**` 패턴이 실제 `docs/lessons/README.md` 를 재포함시킨다. 그래서 `p*` 는 `P1`·`P2`·`P2-B`·`P2-C-retrospective.md` **4건을 그 동작에 기대어** 포함한다 (실측 계수 `p*` = 13). ⚠️ **초판은 여기서 _"Linux CI 에서는 포함되지 않아 모집단이 로컬 ↔ CI 로 갈린다"_ 고 적었으나 dev 단계 실측에서 반증됐다** — 이 case-folding 은 **순수 문자열 수준**이고 파일시스템과 무관하다 (§Amendment 2026-08-14). 위험의 실체는 플랫폼 분기가 아니라 **미문서화 구현 동작 의존**이다

### 결합 실측 (음성 — 차단 요인 부재)

- **4경로 본문을 문자열 매칭하는 가드 0건.** `verify-zombie-check.mjs` 는 `docs/reports/20260510-419-…md` 를 `type: 'exists'` (**존재만**) 로 보고, `check-encoding.sh` 는 `docs/phases/.*\.md$` 를 U+FFFD 예외 **경로 패턴**으로만 쓴다. 즉 ADR `20260731-907` §결정 4 의 근거인 _"원문 문자열 매칭 SSoT 가드 보호"_ 는 `.claude/**`·`CLAUDE.md` 에는 유효하지만 **이 4경로에는 적용되지 않는다**
- **ADR [`20260814-982`](20260814-982-changelog-tilde-guard.md) 의 정밀도 논거는 유지된다.** 그 ADR 은 가드 정밀도가 _"술어가 아니라 **모집단**에서 온다"_ 는 논증 위에 서 있다. 실측 — (C) 가 편입하는 39 파일의 기존 이중물결은 `git grep -F` **0 hit** 이고, `docs/**` 에서 이중물결을 보유한 파일 집합 ∩ (C) 편입 집합 = **공집합**(전부 `docs/decisions/`·`docs/ops/`·`docs/deprecated/`). 따라서 **감시값**은 `5` → `44` 로 바뀌지만(`44` = 기존 `5` + 편입 `39`) **논거**(소유 모집단 안의 의도된 취소선 0)는 그대로 성립한다. _"의도분과 손상분을 가를 술어가 없다"_ 는 우려도 편입 모집단에 **의도분이 0** 이므로 발생하지 않는다

---

## 결정

**후보 (C) 채택 — `docs/**` 구조를 유지한 채 디렉토리 재포함 + markdown 한정 재포함으로 negation 을 수리한다.**

```
docs/**
...
# live 문서 예외 — markdown **한정** 재포함 (#958, ADR 20260814-958)
# ⚠ 디렉토리 재포함 줄(`!docs/x/`)이 없으면 하위 파일 재포함은 성립하지 않는다 (gitignore 문법).
#   그 줄이 빠진 형식이 #907 에서 14일간 조용히 무효였다.
# ⚠ `**/*.md` 로 한정하는 이유 — bench/forensic JSON 은 생성기가 소유한다 (H1).
!docs/benchmarks/
!docs/benchmarks/**/*.md
!docs/phases/
!docs/phases/**/*.md
!docs/reports/
!docs/reports/**/*.md
!docs/retrospectives/
!docs/retrospectives/*-retrospective.md
```

### 결정 세부

1. **소유 단위는 markdown 뿐이다.** `.json` / `.png` 등 비-markdown 산출물은 `docs/**` 로 제외 유지. 실측 — 편입 **39 파일 전건 `.md`**, JSON·PNG **0건**
2. **죽은 4줄은 주석 처리가 아니라 제거한다.** 주석으로 남긴 죽은 규칙은 미래 관찰자에게 _"주석만 풀면 되는 정상 규칙"_ 으로 오인되며, 그 오인이 바로 #907 의 재현 경로다. 대신 **작동하는 형식**을 남기고 그 형식이 왜 그 모양인지(디렉토리 줄 필수 / md 한정)를 주석 3줄로 박제한다
3. **`p*-retrospective.md` → `*-retrospective.md`.** varying 접두사를 `*` 가 흡수하므로 매칭이 **리터럴 소문자 접미사**만 보게 되고, `P*` 4건의 포함이 case-folding 동작에 의존하지 않게 되어 H2 가 소멸한다. 부수 효과로 선언 단위가 `p*` 실측 **13건** → `-retrospective.md` 전건 **15건**으로 확장되며(차이는 `harness-update-2.2.0` · `r10` 2건), 이는 CLAUDE.md §마일스톤 회고 루틴 이 규정한 위치 규약 `docs/retrospectives/<phase-or-milestone>-retrospective.md` 과 **정합**이다 — `r10` / `harness-update-2.2.0` / `P1` / `P2` 계열도 같은 클래스의 회고다
4. **ADR `20260731-907` §결정 4 는 정정하되 번복하지 않는다.** 그 조항의 **의도**(4경로를 포맷 대상으로 유지)는 유효하고 **기전**(`!` negation 단독)만 무효였다. 해당 §에 본 ADR 로의 정정 포인터 1줄을 추가한다
5. **ADR `20260814-982` §재검토 조건 1 의 감시값을 `5` → `44` 로 갱신**하고, 갱신 사유(편입 모집단의 의도된 취소선 실측 0)를 병기한다. 그 ADR 이 규정한 트리거 동작은 _"즉시 재측정"_ 이며 본 ADR 이 그 재측정이다

### 의도적 비-범위

- `docs/retrospectives/README.md` / `P1-a11y.md` / `P1-browser-compat.md` / `P1-perf.md` — `-retrospective.md` 로 끝나지 않아 편입되지 않는다. 회고 **본문**이 아닌 인덱스·부속 측정이라 선언 단위 밖이며, 편입하려면 별도 판정이 필요하다
- `docs/lessons/` / `docs/decisions/` / `docs/guides/` / `docs/architecture/` / `docs/ops/` — 제외 유지. 여기에 의도된 취소선 **23 줄 / 48 발생**이 있고(`20260814-982` 실측), 편입하면 그 ADR 의 정밀도 논거가 실제로 깨진다
- `docs/**` 전체를 포맷 대상으로 되돌리는 안 — 위 사유로 채택하지 않는다

---

## 결과 · 재검토 조건

### 성공 신호

- `pnpm run format:check` exit `0` — 편입 39 파일 포함
- 4경로 `--file-info` 전건 `ignored: false` (md) / `docs/benchmarks/*.json` 전건 `ignored: true`
- `node scripts/verify-md-tilde.mjs --population` 이 `44` 를 보고하고, 그 계수가 본 ADR §결정 5 의 박제값과 일치 (`44` = 기존 소유 `5` + 편입 `39`)
- 편입 39 파일의 코드 펜스·인라인 코드 스팬 밖 `~~` **0 발생** (물결 선처리 후)

### 재검토 조건

1. **`--population` 계수가 `44` 에서 이탈** — 신규 live 문서 추가는 정상 증가다. 감소는 `.prettierignore` 회귀 신호이므로 즉시 원인 규명
2. **`docs/` 하위에 신규 디렉토리가 생기고 그것이 live 문서 성격일 때** — `docs/**` 는 fail-closed 라 조용히 제외된다. 본 ADR §결정 형식에 2줄(`!docs/<신규>/` + `!docs/<신규>/**/*.md`)을 추가할지 판정
3. **편입 경로에 의도된 취소선이 처음 등장할 때** — `20260814-982` 의 정밀도 논거가 그 시점에 실제로 깨진다. 인라인 코드 회피가 불가능한 사례면 그 ADR §술어를 재검토
4. **bench/forensic JSON 을 포맷 대상으로 삼자는 제안이 나올 때** — H1(생성기 소유) 이 해소됐는지 먼저 확인. 생성기가 prettier 포맷으로 출력하도록 바뀌지 않는 한 재검토 대상 아님

---

## 교차검증 반영 사항 (agy, 2026-08-14)

**호출 전 Claude 편향 셀프 체크** ([cross-validate-protocol.md](../guides/cross-validate-protocol.md) §5) — 낙관적 일정 / 결합 간과 / 순수주의 3축은 통과(비용에 ADR 2건 개정·DoD 4 negative 실증·H1/H2 해소를 모두 포함했고, 결합은 `20260814-982`·`#1040`·bench workflow·가드 4종을 실측 대조했다). **폐기 프레이밍 축은 미통과 의심**이라 판단해 호출 프롬프트 Q1 에 _"(B) 기각이 실질 논거인가 작업 회피의 사후 합리화인가"_ 를 **명시 질문으로 삽입**했다. 그 판단이 옳았다 — 아래 §이견 수용 이 그 결과다.

### 이견 수용 (원안 번복)

**Claude 원안은 (A) 하이브리드(주석 정정 + 측정 근거 박제)였고, cross-validate 반론을 수용해 (C) 로 번복했다.** 원안의 기각 논거 셋이 각각 깨졌다:

| Claude 원안 논거 | agy 반론 | 판정 |
| --- | --- | --- |
| **시퀀싱** — `20260814-982` 후속 [#1040](https://github.com/coseo12/astro-simulator/issues/1040)(존량 손상 21줄 회수 가부)이 미해결인데 손상 **가능** 모집단을 `5` → `39` 로 7.8배 늘리는 것은 순서가 뒤바뀐다 | 편입 39 파일의 기존 이중물결이 **0** 이므로 #1040 존량과 **교집합이 없다**. 늘어나는 것은 모집단 크기이지 **존량**이 아니다 | **수용** — 재확인 결과 #1040 존량은 전부 `CHANGELOG.md` 에 있고 편입 집합과 disjoint. 원안의 시퀀싱 논거는 **성립하지 않는다** |
| **위험 비대칭** — (A) 에서 4경로는 포맷터가 건드리지 않으므로 §7-1 손상 클래스가 구조적으로 발생 불가. (B) 는 34파일을 손상 가능하게 만든 뒤 가드로 잡는 순손실 | 그 논리는 **모든** 파일을 `.prettierignore` 에 넣는 것도 정당화한다(귀류). 제외가 정당한 진짜 경계는 _"포맷터가 **의미론적 무결성**을 훼손하는가"_ 이며 그 경계는 **기계 생성 데이터 / 특수 문법 / 불변 히스토리** 셋이다. live markdown 은 셋 중 어디에도 없다 | **수용** — 원안의 일반형은 과잉 방어. 다만 반론이 제시한 경계 중 **기계 생성 데이터**축이 정확히 H1 이므로, 그 축을 **결정에 편입**(md 한정)해서 살렸다 |
| **원 의도는 한 번도 집행된 적 없다** — `format:check` 배선 자체가 #957(2026-08-04)에 처음 생겼고, 그 전엔 lint-staged 가 편집 파일만 기회적으로 포맷했다(실증: `p3`(2026-04-16)·`p6`(2026-04-18)이 "소유" 기간 내내 비정합) | 아키텍처 **합의는 존재했고 집행 기전만 고장** 나 있었다. _"버그로 규칙이 적용되지 않았으니 규칙을 없앤다"_ 는 부채를 정당화하는 선례다 | **부분 수용** — _"집행된 적 없다"_ 는 **폐기의 근거가 아니라 범위의 단서**다. 그래서 본 ADR 은 이것을 (C) 기각 논거에서 빼되, §배경 에 _"복원이 아니라 최초 집행"_ 이라는 성격 규정으로 남긴다 |

추가 수용 — **(A) 의 숨은 비용 과소평가**. agy 가 지적한 축은 1인 + AI 에이전트 파이프라인 고유다: 에이전트마다 표·들여쓰기·줄바꿈 규칙이 달라 **비본질 diff** 가 매 PR 누적되고, 사람이 서식 변경과 내용 변경을 눈으로 분리하는 비용이 영구화된다. `docs/phases`·`docs/retrospectives` 는 **마일스톤마다 에이전트가 새 항목을 쓰는** 가장 활발한 문서군이라 이 비용이 정확히 거기에 쌓인다. 원안은 이것을 _"심미적"_ 으로 축소 평가했다.

### 합의

- **실측이 정규식 프록시를 대체해야 한다** — `92` → `10` 정정을 _"정규식 허수를 걸러내고 실제 영향도를 정확히 측정"_ 으로 전면 동의
- **H1 / H2 는 실질적이고 치명적인 결함** — Claude 고유 발견으로 인정. (C) 의 `**/*.md` 한정과 case-invariant 패턴이 각각의 해소책이라는 데 합의
- **죽은 4줄은 주석 처리가 아니라 제거** (§결정 2) — _"주석 처리된 죽은 코드는 미래 에이전트가 '주석만 풀면 되는 정상 코드' 로 오인한다"_ 로 합의

### Claude 재분석으로 기각한 agy 제안

- **`!docs/retrospectives/*retrospective.md` 와 `!docs/retrospectives/*Retrospective.md` 병기** (H2 해소책으로 제시) — **기각**. `*Retrospective.md` 에 매칭되는 파일은 저장소에 **0건**이고(`git ls-files` 실측), `*-retrospective.md` 는 varying 접두사를 `*` 가 흡수하므로 **이미 case-invariant** 다. 매칭 대상이 없는 패턴을 넣는 것은 **죽은 설정 줄**이며, 그것이 바로 본 이슈가 제거하는 클래스다 — 해소책이 결함과 같은 형태를 재생산해서는 안 된다
- **2단계 롤아웃 (물결 선처리를 별도 선행 PR 로 분리)** — **기각**. 대상은 **3 파일 4 라인**이고 분리하면 머지 사이클만 1회 늘 뿐 위험이 줄지 않는다. 대신 **동일 PR 내 순서 제약**으로 흡수한다 — 물결을 인라인 코드로 감싼 **뒤** 재포맷하면 손상 형태(`~~`)가 **한 번도 커밋되지 않는다** (§Developer 인계)
- **`verify-prettier-coverage.mjs` 신설** (4경로 `ignored: false` / JSON `ignored: true` 를 CI 에서 검사) — **본 PR 범위 밖으로 분리**. 방향은 타당하나 `20260814-982` 의 `--population` 모드가 이미 소유 계수를 관측하며, 신규 가드 도입은 [guard-pr-dod.md](../lessons/guard-pr-dod.md) §4축 검증(격리 동적 테스트 / 3중 시뮬레이션 / 5 페르소나 self-consistency / 메타 측정 안정성)을 요구해 본 이슈 DoD 를 초과한다. §재검토 조건 1 이 그 관측을 대신하며, 승격 판단은 후속 분리

### 고유 발견 (후속 분리)

- **`--population` 기대값이 문서 박제값으로만 존재한다** — `20260814-982` 는 계수를 **차단하지 않는다**(관측은 기계, 판단은 사람)고 결정했고 본 ADR 은 그 결정을 유지한다. 다만 감시값이 `5` → `39` 로 바뀌면서 _"박제값과 실측의 대조를 누가 언제 하는가"_ 가 처음으로 실질 문제가 된다. agy 의 `verify-prettier-coverage.mjs` 제안과 같은 뿌리이며, 위 §기각 의 4축 검증 비용 때문에 본 PR 에서 다루지 않는다 → **후속 이슈 분리 대상** (우선순위 low)

---

## Developer 인계

### 시작 지점

`.prettierignore` 43~47 행 (죽은 negation 4줄) — §결정 의 블록으로 교체.

### 순서 제약 (필수)

**물결 선처리 → 재포맷** 순서를 지킬 것. 역순이면 손상 형태(`~~`)가 커밋에 한 번 들어갔다 나온다.

1. 아래 3 파일 4 라인의 범위 표기를 **인라인 코드로 감싼다** (`docs/ops/operational-friction.md` §7-1 표준 절차)
2. `.prettierignore` 를 §결정 블록으로 교체
3. `pnpm exec prettier --write` 로 잔여 재포맷 적용 (실측 5 파일 / `13 insertions` / `12 deletions` — 1단계 후에는 더 작아진다)

### 물결 선처리 대상 (실측 10 발생 / 4 라인 / 3 파일)

| 파일 | 감쌀 표기 |
| --- | --- |
| `docs/phases/roadmap-v3-incremental.md` | `P10~P17` · `P10~P12` · `2000~3000` · `1500~2200` |
| `docs/retrospectives/p6-retrospective.md` | `3~5` · `1~2` · `P6-A~D` (2회) · `~223초` (짝 없는 단일 물결이나 예방 차원) |
| `docs/retrospectives/p7-retrospective.md` | `35~42` · `7~9` |

### 동반 갱신 (§결정 4·5)

- `docs/decisions/20260731-907-harness-decouple.md` §결정 4 — 본 ADR 로의 정정 포인터 1줄
- `docs/decisions/20260814-982-changelog-tilde-guard.md` §재검토 조건 1 — 감시값 `5` → `44` + 사유 병기
- `docs/decisions/README.md` — 본 ADR 인덱스 표 등재 (`node scripts/verify-adr-index.mjs` PASS 확인)
- `CHANGELOG.md` `[Unreleased]` — `### Fixed` 신규 entry

### DoD 4 — negative 실증 (본 결정이 (C) = B 계열이므로 **해당됨**)

4경로 중 1곳(예: `docs/phases/P1-solar-system-mvp.md`)에 포맷 위반을 주입 → `pnpm run format:check` **exit 1** 확인 → 원복 → exit `0` 확인. 주입 전에는 해당 파일이 `ignored: false` 임을 `--file-info` 로 선확인할 것 (제외된 파일에 주입하면 위반이 아니라 무보고가 나오고, 그것을 PASS 로 오독하는 것이 이 이슈의 클래스다).

### 명시적 비-범위

- `docs/lessons/` · `docs/decisions/` · `docs/guides/` · `docs/architecture/` · `docs/ops/` 의 소유 상태 — **무접촉**
- `docs/retrospectives/README.md` · `P1-a11y.md` · `P1-browser-compat.md` · `P1-perf.md` — **무접촉**
- bench/forensic JSON·PNG — **무접촉** (H1)
- `verify-prettier-coverage.mjs` 신설 — 후속 분리
- `#1040` 존량 회수 — 별개 판정

---

## Amendment 2026-08-14 — dev 단계 실측 2건 (H2 근거 반증 / 감시값 산술 정정)

> **상태**: Active (2026-08-14 박제, developer 단계)
> **트리거**: 구현 착수 시 §결정 의 두 근거를 재실행한 결과 **초판 서술 2건이 실측과 갈렸다**
> **측정**: prettier `3.9.6` (`pnpm exec` = lockfile 정본) / macOS / 격리 픽스처 `/tmp` + 저장소 rev `chore/958-prettierignore-negation`
> **결정 자체는 불변** — (C) 채택, `*-retrospective.md` 채택, 편입 39 파일 전부 그대로다. 바뀐 것은 **근거의 정확도**다

이 ADR §배경 이 남긴 1차 교훈(_"설정 파일의 의미론은 읽어서 판정되지 않고 `--file-info` 한 줄로 판정된다"_)이
**본 ADR 자신에게 한 번 더 적용된 결과**다. 초판의 H2 서술은 실행이 아니라 추론이었다.

### 정정 1 — H2 의 "macOS ↔ Linux 모집단 분기" 는 반증됐다

**초판 서술**: _"prettier ignore 매칭이 case-insensitive 라 macOS 는 `P1`·`P2` 계열 4건을 추가로 포함하지만
대소문자를 구분하는 Linux CI 에서는 포함되지 않는다 → 모집단이 로컬 ↔ CI 로 갈린다"_

**반증 실측** — 격리 픽스처에서 대조군을 세워 case-folding 의 **출처**를 분리했다:

| 시나리오 | `.prettierignore` | 질의 경로 | 결과 |
| --- | --- | --- | --- |
| 대조군 A | `docs/**` 만 | `docs/lessons/README.md` | `ignored: true` |
| 대조군 B | `!docs/lessons/` + `!docs/lessons/**/*.md` (소문자) | 〃 | `ignored: false` |
| 실험군 C | `!docs/LESSONS/` + `!docs/LESSONS/**/*.md` (**대문자**) | 〃 | **`ignored: false`** |
| **결정적 D** | `!docs/FAKEDIR/` + `!docs/FAKEDIR/**/*.md` | **`docs/fakedir/x.md`** (디렉토리·파일 **전부 디스크에 미존재**) | **`ignored: false`** |

**D 가 결정적이다** — 질의 경로가 디스크에 존재하지 않으므로 파일시스템의 case-folding 이 개입할 수 없다.
그런데도 대문자 패턴이 소문자 경로에 매칭된다. 즉 이 case-insensitivity 는 **prettier 매처의 순수 문자열
동작**이고 **파일시스템 속성이 아니다.** 따라서 **Linux CI 에서도 결과가 같고, 모집단 분기는 일어나지 않는다.**

초판이 근거로 든 _"`docs/LESSONS/**` 가 `docs/lessons/README.md` 를 재포함시킨다"_ 는 관측 **자체는 맞다**
(실험군 C 로 재현). 틀린 것은 그 관측에서 _"그러므로 FS 대소문자 구분 여부에 따라 플랫폼 간 결과가 갈린다"_
를 **추론**한 부분이다. 관측과 추론 사이에 실행이 없었다.

**그래도 `*-retrospective.md` 채택은 유지된다** — 근거만 바뀐다. `p*` 는 `P1`·`P2`·`P2-B`·`P2-C` 4건의 포함이
**문서화되지 않은 구현 동작에 의존**한다(prettier 가 이 동작을 바꾸거나, `.prettierignore` 를 읽는 다른 도구가
case-sensitive 하면 모집단이 조용히 4 줄어든다). `*-retrospective.md` 는 리터럴 소문자 접미사로만 매칭해
그 의존이 **0** 이다. 실측 계수: `p*` = **13 파일** / `*` = **15 파일** (차이는 `harness-update-2.2.0` · `r10`).

> ⚠️ 초판 §후보 비교 표의 _"일회성 churn"_ 행 아래에 있던 `로컬 ↔ CI 모집단` 축과 §결정 3 의
> _"(macOS `==` Linux)"_ 표기는 본 정정으로 교체했다. §교차검증 반영 사항 의 대화 기록
> (agy 가 H2 를 _"치명적 결함"_ 으로 인정한 부분)은 **그 시점의 기록이므로 소급 치환하지 않는다** —
> H2 가 실질 위험인 것은 맞고, **위험의 종류**가 플랫폼 분기가 아니라 미문서화 동작 의존이었다.

### 정정 2 — 감시값은 `39` 가 아니라 `44` 다 (delta ↔ 계수 혼용)

**초판 서술**: 메타데이터 §선행 ADR · §결합 실측 · §결정 5 · §성공 신호 · §재검토 조건 1 · §Developer 인계
**6곳**이 `20260814-982` §재검토 조건 1 의 감시값을 `39` 로 적었다.

**실측** — `node scripts/verify-md-tilde.mjs --population` → **`prettier ignored: false : 44`**.

`20260814-982` §재검토 조건 1 이 감시하는 것은 **모집단 크기**(`ignored: false` 계수)이지 **증가분**이 아니다.
`39` 는 (C) 가 새로 편입한 **delta** 이고, 감시값은 기존 소유 `5` 를 더한 **`44`** 다.

| 축 | 값 |
| --- | ---: |
| 기존 소유 (`CHANGELOG.md` + README 4) | `5` |
| (C) 편입 delta (전건 `.md`) | `39` |
| **감시값 = 모집단 계수** | **`44`** |

초판이 _"편입 39 파일"_ 이라는 **맞는 값**을 감시값 자리에 그대로 옮겨 적으면서 발생했다. `39` 가 등장하는
곳 중 **편입 파일 수**를 뜻하는 서술(§결정 1 · §결합 실측 · §교차검증)은 정확하므로 그대로 두고,
**감시값**을 뜻하던 위 6곳만 `44` 로 정정했다. 단 §교차검증 반영 사항 안의 `39` 2곳(§이견 수용 표의
_"`5` → `39` 로 7.8배"_ / §고유 발견)은 **대화 시점의 기록이므로 정정하지 않았다** — 그 시점에 실제로
그렇게 말했기 때문이다. 감시값의 정본은 본 Amendment 와 §결정 5 다. `20260814-982` 쪽에는 같은 내용을 Amendment 로 부기했다
(그 ADR 은 `v0.72.0` 릴리스분이라 §재검토 조건 1 원문은 **소급 치환하지 않고** 포인터만 추가).

### 검증된 채로 남는 값

아래는 초판 그대로 재현됐다 (dev 단계 재측정):

- 4경로 현행 `ignored: true` 전건 — **재현**
- `--check` 위반 **5 파일** / 재포맷 diff **`13 insertions` / `12 deletions`** — **재현** (docs/ 한정)
- 물결 손상 **10 발생 / 4 라인 / 3 파일** — **재현** (`--write` 스크래치 후 원복으로 확인)
- 편입 39 파일 전건 `.md`, `docs/**` JSON·PNG 소유 **0건** (H1 차단) — **재현**
- 편입 39 파일의 `~~` — 넓은 그물 `git grep -nF '~~'` 로 **0 hit** (물결 선처리 후)
