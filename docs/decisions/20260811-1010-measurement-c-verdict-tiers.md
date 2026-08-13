# ADR: 측정 방법 C 3계급 판정 + 판정식 SSoT 를 가드 스크립트로 수렴 (#1010)

- 일자: 2026-08-11
- **상태**: **Accepted** (cross-validate agy 2026-08-11 — §교차검증 반영 사항 4축 통합 완료). 원 박제: `Provisional` (발동 앵커 2건 — ADR 신규 / MINOR Behavior Changes)
- 관련: 이슈 [#1010](https://github.com/coseo12/astro-simulator/issues/1010) / 후속 [#1014](https://github.com/coseo12/astro-simulator/issues/1014) (release PR 클래스) · [#1013](https://github.com/coseo12/astro-simulator/issues/1013) (문서 예시 명령줄)
- 계보: [#469](https://github.com/coseo12/astro-simulator/issues/469) (측정 방법 C 원안) → [#470](https://github.com/coseo12/astro-simulator/issues/470) / [#473](https://github.com/coseo12/astro-simulator/issues/473) (D4 CI backstop) / [#471](https://github.com/coseo12/astro-simulator/issues/471) (스킬 사전 차단) / [#475](https://github.com/coseo12/astro-simulator/pull/475) (메타 규칙) / [#855](https://github.com/coseo12/astro-simulator/issues/855) (템플릿↔가드 정합)
- 필수 cross-link: [20260807-971-required-status-checks.md](20260807-971-required-status-checks.md) **결정 9-1** (본 가드 required 제외 — WARN 을 exit 0 로 두는 근거의 절반)

---

## 배경

### 이슈가 제기한 전제 2건이 실측으로 반박됐다

이슈 #1010 은 *"문서는 AND, 가드는 OR — 느슨한 쪽이 실행돼 여태 안 드러났다"* 로 문제를 제기했다. 착수 시 실측한 결과 **두 전제가 모두 틀렸다.**

| 전제 | 실측 | 판정 |
| --- | --- | --- |
| *"AND 가 원 의도"* | #469 채택안 원문은 **_"체크박스 0 hit + phrase 0 hit **동시 만족 시 FAIL**"_** = OR-pass. 신설 커밋 `a1c1373` 메시지 / #473 종결 코멘트 / 코드 `:120` 출력 문자열이 전부 **OR**. AND 를 boolean AND 로 의도했다는 근거는 이슈·PR·커밋 어디에도 없다 | **반박** — 가드가 맞고 *"AND"* 라는 **단어가 오기**다 |
| *"여태 안 드러났다"* | workflow run **719건 중 failure 76건** (10.6%). 최초 failure 2026-05-17, 최근 2026-08-06. `--limit 50` 으로 조회하면 최근 구간이 전부 success 라 0건으로 보인다 | **반박** — 실발화했다 |

문서 측 자기모순도 **선천적**이다. `developer.md` 의 *"AND 로 판정한다"* 와 그 아래 3계급 bullet 은 **같은 커밋 `f576770` (PR #472) 의 인접 6줄**에서 동시에 태어났다 (`git log -S` 양쪽 모두 단일 커밋 반환). 사후 drift 가 아니다.

### 진짜 결함 — `structureHits` 는 판정에 0 기여했고, 그래서 침식이 무신호였다

종전 판정식은 `pass = phraseHits >= 1 || structureHits >= 1` 이다. 그런데 `structureHits` 를 세는 라인은 **반드시 phrase 를 포함**하고 그 라인은 body 의 부분문자열이므로

```text
structureHits ≥ 1  ⟹  phraseHits ≥ 1
∴ (phraseHits ≥ 1 ∨ structureHits ≥ 1)  ≡  (phraseHits ≥ 1)
```

즉 **"1차 구조 grep" 은 판정에 0 기여**했고, 에러 메시지 장식으로만 쓰였다. *"AND 냐 OR 냐"* 는 **애초에 판정을 가르지 않는 축**이었다. (실측 보강: 최근 머지 PR 60건 × 7 kw = 420 셀에서 `structureHits≥1 ∧ phraseHits=0` 반례 **0건**.)

그 결과 문서가 선언한 **3계급 중 중간 계급(WARN)이 가드에 미구현**이었고, 그 계급이 비어 있는 동안 **템플릿 체크박스가 `###` 헤더로 대체되는 침식**이 진행됐다.

- **21 셀 / 420** (5.0%), **10 PR / 60** (16.7%) — 전부 kw3(보안)·kw4(SSoT)·kw5(cross-validate)
- 10 PR 중 **8건이 release PR**, 2건이 #971 계보 문서 PR. 발생 시점 **#964 (2026-08-05) 이후**
- 종전 2계급 가드는 이 21 셀을 **전부 초록**으로 통과시켰다

**침식은 작성자 일탈이 아니라 가드가 만든 균형점이다.** PR #964 에 남은 가드 자동 코멘트가 *"수동: 누락 항목 **체크박스** 추가"* 를 안내했는데, 작성자는 `### 보안` **헤더 절**을 추가했고 OR 가드는 통과시켰다. `docs/ops/operational-friction.md` 는 이 관행을 이미 *"7 체크박스 원문 **문구** 전부 필요"* (**문구**이지 체크박스가 아님) 로 규약화해 두었다.

### 같은 규칙이 4가지 독립 판정식으로 갈려 있었다

| 위치 | 형태 | 계급 수 | 대상 키워드 |
| --- | --- | --- | --- |
| `.claude/agents/developer.md` §측정 방법 C | 문서 전문 | 3 | 명시 없음 |
| `.claude/skills/create-pr/SKILL.md` | 문서 전문 (near-identical) | 3 | 명시 없음 |
| `scripts/verify-pr-template-checklist.mjs` | 구현 | 2 | 7 |
| `.claude/agents/reviewer.md` §절차 6 | 하드코딩 2-grep | 2 (non-blocking) | 1 |
| `.claude/agents/qa.md` §4 | 하드코딩 1-grep | — | 1 |

`developer.md` 는 *"한쪽만 갱신하면 drift 발생 — **동시 수정 의무**"* 라는 **규약형 방어**를 이미 걸어 뒀으나, 실제 drift 는 그 규약이 커버하지 않는 **reviewer/qa 축과 가드 축**에서 났다. 규약형 방어의 한계 실증이다.

---

## 후보 비교 (축별)

**모집단**: 최근 머지 PR 60건 (#918~#1012), 420 셀. **판정 기준**: *"규약을 지킨 PR 이 FAIL 하면 탈락"* — 여기서 규약 = `create-pr/SKILL.md` 의 *"`[ ]` → `[x]` 갱신만 허용 (라인 자체 변경·삭제 금지)"*.

| 안 | 판정식 | FAIL PR | 오검출 (규약 준수인데 FAIL) | 미검출 |
| --- | --- | --- | --- | --- |
| **A. 가드를 AND 로** (이슈 1안, structure=체크박스) | `ph≥1 ∧ cb≥1` | **60/60** | **60** | — |
| **B. 문서를 OR 로** (이슈 2안, 현행 유지) | `ph≥1 ∨ cb≥1` ≡ `ph≥1` | 2/60 (둘 다 bot) | 0 | **침식 21 셀 전량** |
| **C. 키워드별 분리** (이슈 3안) | `kw1~5 → ph∧cb` / `kw6~7 → ph` | 12/60 | **10** | 산문 언급 |
| **D. 계급별 structure (blocking)** | `ph≥1 ∧ 계급별 struct≥1` | 12/60 | **10** | 산문 언급 |
| **D2. 계급 합집합** | `ph≥1 ∧ (cb+hd)≥1` | 2/60 (bot) | 0 | 침식 21 셀 **무신호** |
| **★ E. 3계급 (채택)** | FAIL `ph=0` / WARN `계급별 struct=0` / PASS | **2/60** (bot) | **0** | 산문 언급은 WARN 으로 포착 |

- **A 기각** — **템플릿 원문 자기 적용에서 kw6·kw7 이 FAIL** 한다 (템플릿에서 이 둘은 체크박스가 아니라 `###` 헤더로만 존재). *"라인 변경 금지"* 규약과 **동시 성립 불가**. 도달 가능하게 하려면 템플릿에 중복 체크박스를 넣어야 하는데, **오기 하나 때문에 모든 미래 PR 에 영향하는 개정**을 감행하는 것이다
- **B 기각 (단독으로는)** — 원 의도와는 맞으나 침식이 계속 무신호로 진행된다
- **C·D 기각 (blocking 으로는)** — 오검출 10건이 전부 진짜 규약 이탈이긴 하나, 그 이탈은 `operational-friction.md` 가 **규약으로 처방한 관행**이다. blocking 화는 문서 개정 없이 release 절차를 사후 무효화하고, **8/10 이 release PR** 이라 매 릴리스마다 빨간 X 가 뜬다 (alert fatigue — #766 계보)
- **D2 기각** — 오검출 0 으로 B 를 지배하지만 헤더를 구조로 인정하므로 **침식 21 셀이 전부 PASS** 가 되어 신호가 사라진다. phrase-only 셀 = 0/420 실측상 B 대비 실효 이득도 현 시점 0

### 계급 구분이 실측상 비대칭적으로 유효하다

- 헤더 계급(kw6·7)이 **체크박스로만** 존재하는 셀 = **0 / 420**
- 체크박스 계급(kw1~5)이 **헤더로만** 존재하는 셀 = **21 / 420**

한 방향으로만 침식이 일어난다. 그래서 계급별 정의는 **AND 를 살리는 도구가 아니라 WARN 계급을 정의하는 도구**다.

---

## 결정

### 1. "AND" 는 오기다 — 6곳 전부 정정하되 blocking 경계는 무변경

`developer.md` / `create-pr/SKILL.md` ×2 / 워크플로 주석 / 스크립트 헤더 주석 ×2 의 6 hit 을 원 의도(OR-pass) 문언으로 정정한다. 판정 로직의 **blocking 경계는 건드리지 않는다**.

### 2. 템플릿(`.github/PULL_REQUEST_TEMPLATE.md`)은 고치지 않는다

원 의도가 OR 인 이상 개정 근거가 소멸한다. 모든 미래 PR 영향 대비 이득 0.

### 3. 3계급 판정 — 문서가 선언만 하고 구현이 없던 중간 계급을 채운다

```text
FAIL (exit 1)  : phraseHits = 0                          → 코멘트 + 빨간 X
WARN (exit 0)  : phraseHits ≥ 1  ∧  structureHits = 0    → ::warning:: 어노테이션 + step summary
PASS (exit 0)  : phraseHits ≥ 1  ∧  structureHits ≥ 1
```

**blocking 경계가 종전과 수학적으로 동일하다** (§배경의 함의). ⇒ **회귀 0 이 실측이 아니라 증명으로 보장**되고, 76건 historical failure 도 전건 재현된다.

### 4. `structureHits` 를 판정에 실제로 참여시킨다 — WARN 축으로

잉여 항을 버리지 않고 승격한다.

### 5. 구조 정의는 계급별

| 계급 | 키워드 | 구조 hit 조건 |
| --- | --- | --- |
| `checkbox` | 1~5 (커밋 컨벤션 / 불필요 / 보안 / SSoT / cross-validate) | 같은 라인에 `- [ ]`/`- [x]` + phrase |
| `header` | 6~7 (ADR 호환성 / Test plan) | 같은 라인에 ATX 헤더 + phrase |

**헤더는 ATX 레벨을 가리지 않는다** (`#`~`######`). 템플릿이 쓰는 레벨은 `###` 이지만 묻는 것은 *"섹션 헤더로 존재하는가"* 이지 레벨이 아니다. 실측 민감도 (420 셀):

| HEADER_PATTERN | PASS | WARN | FAIL |
| --- | --- | --- | --- |
| `#{1,6}` (채택) | 387 | 21 | 12 |
| `#{3}` 엄격 | 385 | 23 | 12 |
| `#{2,4}` | 387 | 21 | 12 |

`#{3}` 엄격은 release PR 의 `## Test plan` 2셀을 거짓 WARN 으로 만든다. 구조 축은 WARN 전용이라 **느슨한 쪽이 거짓 WARN 을 줄이고 blocking 경계에는 어떤 영향도 없다**.

### 6. 코드 펜스 안의 구조 hit 은 세지 않는다 — 단 현 시점 영향 0

PR 본문·ADR 이 템플릿 조각을 코드 펜스 블록으로 인용하는 관행이 있어 잠재 오탐 경로가 실재한다. 단 **실측 영향은 0** 이다:

> 펜스 **안** 구조 hit **0건** (술어: 최근 머지 PR 60건 본문 전수, 라인이 계급 패턴 ∧ 해당 kw phrase 를 동시 만족한 hit 수 — 체크박스 계급 펜스 밖 **328** / 헤더 계급 펜스 밖 **118**, 닫히지 않은 펜스를 가진 PR 0건)

*"펜스 오탐을 잡았다"* 는 과대 주장을 금지한다 (volt #101 measurement-first). **phrase 축은 펜스를 제외하지 않는다** — 제외하면 blocking 경계가 움직여 결정 3 의 동치 증명이 깨진다.

### 7. 판정식 SSoT 를 가드 스크립트 1곳으로 수렴

**중복 자체가 결함이 아니라, 파생본이 _독립 판정식_ 을 갖는 것이 결함이다.**

- **정본** = `scripts/verify-pr-template-checklist.mjs`
- `developer.md` / `create-pr/SKILL.md` = **3계급 표 전문 유지** (사람이 읽는 계약) + *"정본은 스크립트"* 명시. 두 파일은 **바이트 동일** 의무
- `reviewer.md` §절차 6 / `qa.md` §4 = 판정식을 **재서술하지 않고 가드를 호출**. WARN 은 `non_blocking_suggestions` 로 승격, FAIL 은 `blocking_issues`

파생본이 독립 판정식을 가질 수 없으므로 **drift 클래스가 구조적으로 소멸**한다 (volt [#120](https://github.com/coseo12/volt/issues/120) — *"drift 감지보다 중복 출처 제거"*). 선례: `verify-branch-name.mjs` 의 `failFixtureFingerprint()` — *"다섯 페르소나는 이 값을 직접 계산하지 않고 `--self-test` 출력에서 읽는다"*.

### 8. WARN 은 fallback 이 아니다 — fail-fast 원칙과의 정합

`docs/lessons/guard-design-principles.md` 는 *"drift 가드는 fail-fast 만 — fallback 분기 절대 금지"* 를 규정한다.

- fallback = **판정 불가 시 통과로 흘리는** 분기. WARN 은 **판정 성공 후의 명시적 제3 결론**이며 조건이 결정적이다
- FAIL 경로는 그대로 fail-fast (exit 1, 경계 불변)
- WARN 이 없을 때 침식이 PASS 로 흘러가던 것이 **오히려 silent fallback** 이었다 — 본 개정은 fallback 을 **제거**한다

구현에도 fallback 분기를 두지 않았다: 미등록 `structureClass` 는 0 을 반환하지 않고 **throw**, 미등록 CLI 모드·잉여 인자는 **exit 2**, 픽스처 앵커 부재는 **throw** 한다.

### 9. required status check 편입은 하지 않는다

ADR [20260807-971](20260807-971-required-status-checks.md) **결정 9-1** 이 명시 제외한다. `exit 1` 은 **빨간 X + actionable 코멘트이지 머지 차단이 아니다.** 본 ADR 은 그 결정을 변경하지 않으며, WARN 을 exit 0 으로 두는 근거의 절반이 여기에 있다 (나머지 절반은 결정 8 — 판정 성공 후의 제3 결론이므로 차단 사유가 아니다).

---

## 결과

### 가드 도입 PR DoD 4축

#### 축 1 — 격리 동적 테스트 (`--self-test`, F1~F9)

`node scripts/verify-pr-template-checklist.mjs --self-test` — 네트워크 비의존, `project-guards.yml` 에 배선 (#897 교훈 — CI 미배선 self-test 는 0회 실행).

| # | 픽스처 | 2계급 | 3계급 | 갈림 |
| --- | --- | --- | --- | --- |
| F1 | 템플릿 원문 그대로 | PASS ×7 | PASS ×7 | — |
| **F2** | kw3 체크박스를 `### 보안` 헤더 절로 (#964 실물 재현) | PASS | **WARN** | ✅ |
| **F3** | kw3 을 산문 1줄로만 | PASS | **WARN** | ✅ |
| F4 | kw3 완전 삭제 | FAIL | FAIL | — (경계 불변) |
| **F5** | kw6 을 체크박스로만 | PASS | **WARN** | ✅ (계급 비대칭) |
| F6 | kw7 헤더 + 체크박스 동시 | PASS | PASS | — |
| F7 | 본문 전체 삭제 | FAIL ×7 | FAIL ×7 | — |
| **F8** | 체크박스가 코드 펜스 **안**에만 | PASS | **WARN** | ✅ |
| F9 | phrase 부분문자열 과매칭 (`보안` ⊂ `정보안내`) | PASS | WARN | — (현행 고정) |

`phraseHits` / `structureHits` **수치까지** 단언한다 — verdict 만 단언하면 §배경의 잉여 회귀를 못 잡는다. 여기에 **불변식 단언** (`structureHits ≥ 1 ⟹ phraseHits ≥ 1` 반례 0 / 9 픽스처 × 7 kw) 과 **인자 파싱 프로브 6건** (자식 프로세스 — `verify-branch-name.mjs` B1 결함 답습 회피) 을 더해 **28 단언**이 돈다.

> **F1 은 live 템플릿을 base 로 쓴다.** 하드코딩 스냅샷은 #855 클래스(템플릿이 키워드 phrase 를 잃어 전 PR 이 FAIL) 를 원리적으로 못 잡는다 — 그 사고는 실제로 일어났고 아래 §축 2-4 전수에서 failure 76건 중 **40건의 원인**이다.

#### 축 2 — 3중 시뮬레이션 (positive → negative → recovery)

본 PR 자신으로 실행한다 (`types: [edited]` 가 초 단위 재검사를 제공). 결과 run URL 은 PR 통합 코멘트 1건으로 박제한다 (#766 alert fatigue 계보 — negative 단계가 남긴 가드 코멘트는 정리).

#### 축 3 — 5 페르소나 self-consistency (역할별 기대값)

본 설계는 문언 복제를 **줄이는** 방향이므로 대조표는 *"모든 파일이 같은 문장"* 이 아니라 **"파일별 역할에 맞는 값"** 이다. **미래 관찰자가 0 hit 을 누락으로 오인하지 않도록 여기 박제한다.**

| 파일 | 3계급 bullet ×3 | 가드 호출 | 역할 |
| --- | --- | --- | --- |
| `.claude/agents/developer.md` | 1 / 1 / 1 | 1 | 표 전문 보유 (사람이 읽는 계약) |
| `.claude/skills/create-pr/SKILL.md` | 1 / 1 / 1 | 1 | 〃 (바이트 동일 의무) |
| `.claude/agents/reviewer.md` | 0 / 0 / 0 | 1 | 호출만 |
| `.claude/agents/qa.md` | 0 / 0 / 0 | 1 | 호출만 |
| `.claude/agents/architect.md` | 0 / 0 / 0 | 0 | **비보유가 정답** |
| `.claude/agents/pm.md` | 0 / 0 / 0 | 0 | **비보유가 정답** |

6 파일 × 4 셀 = **24 셀 결정적 일치**. 재현: `grep -cF -- '<bullet 원문>' <파일>`.

#### 축 4 — 메타 측정 도구 자기 적용

- 변경된 가드를 **본 PR 자신**에 적용 → PASS + WARN 0
- `--check-corpus` 로 60 PR 전수 재현 → **PASS 387 / WARN 21 / FAIL 12** (술어: 최근 머지 PR 60건 × 7 kw = 420 셀, 구조는 `structureClass` 계급별, 코드 펜스 안 구조 hit 제외). FAIL 집합 = `{#924, #925}` — 둘 다 `github-actions[bot]` PR 이라 CI 에서 job 스킵 대상
- **base(2계급) 스크립트를 같은 코퍼스에 적용한 결과도 FAIL 셀 12 / FAIL PR `{#924, #925}` 로 동일** — 결정 3 의 동치가 증명뿐 아니라 실측으로도 재현

### §2-4 전수 승격 — 가드가 실제로 잡아온 것

설계 시점 분포는 18/76 샘플 기반 `[가정]` 이었다. **76 run 전수** 로 승격한다 (술어: workflow run 719건 중 `conclusion=failure` 76건 전수, 각 run 의 `gh run view <id> --log-failed` 파싱).

| 분류 | run | 고유 PR |
| --- | --- | --- |
| (a) 가드 스텝 미실행 — 인프라 실패 | 1 | 0 |
| (b) 의도적 negative 실증 (dogfood) | 6 | 3 — #497 #967 #968 |
| **(c) kw7 단독 — 템플릿에 영문 `Test plan` phrase 부재 (가드 자체 결함, #855 `e57c60d` 이전)** | **40** | **30** |
| **(d) release PR 클래스 미스매치** (head = `develop` / `release/*`) | **11** | **10** |
| (e) 봇 생성 PR (baseline) | 2 | 1 — #600 |
| (f) 일상 개발 PR — prefill 부분·전량 누락 | 16 | 14 |
| **합계** | **76** | 57 (고유, 분류 간 1건 중복 — #605 가 run 별로 (c)(f) 양쪽) |

- **(c) 는 `e57c60d` (2026-07-19, #855) 이후 0건** — 템플릿을 가드에 정합시킨 fix 가 완전히 해소했다. 그 이후 failure 는 전체 7 run
- *"prefill 통째 삭제"* (7/7 전부 누락) = **10 run / 8 PR**, 그중 2건(#967 #968)은 일회용 dogfood ⇒ **진성 6 PR**

> **판정 (설계 §2-4 가 [가정] 으로 세웠던 것을 전수로 확인)**: 가드가 실제로 잡아온 것은 *"prefill 말소"* 가 아니라 **(a) 가드 자신의 템플릿 부정합 + (b) PR 클래스 미스매치** 다 — (c)+(d) = **51/76 run (67.1%)** vs 진성 prefill 말소 **6/76 run (7.9%)**. 원 목적을 *"통째로 지웠는가"* 로 가정하는 것은 **설계 의도로도 실적으로도 지지되지 않는다.**

### 개정 표면

| 파일 | 내용 |
| --- | --- |
| `scripts/verify-pr-template-checklist.mjs` | `structureClass` + `HEADER_PATTERN` + 펜스 인식 + 3계급 `verdict` + `main()` 분기 + `--self-test` / `--check-corpus` + `MODE_ARITY` 엄격 파싱 + 헤더 주석 전면 재작성 |
| `.github/workflows/pr-template-checklist-guard.yml` | 주석 자기모순 해소 (3계급 서술 + 경계 동치 + required 아님 명시) |
| `.github/workflows/project-guards.yml` | `--self-test` step 배선 |
| `.claude/agents/developer.md` / `.claude/skills/create-pr/SKILL.md` | 3계급 + 계급별 구조 정의 + *"정본은 스크립트"* (바이트 동일) |
| `.claude/agents/reviewer.md` / `.claude/agents/qa.md` | 하드코딩 grep 삭제 → 가드 호출 + WARN 승격 |
| `.claude/skills/volt-review/SKILL.md` | reviewer §6 참조 정합 (dead reference 해소) |
| `docs/ops/operational-friction.md` | release 절에 WARN 신설 사실 1줄 |

**고치지 않은 것**: `.github/PULL_REQUEST_TEMPLATE.md` (결정 2) / `docs/decisions/20260515-*` · CHANGELOG 의 기존 "측정 방법 C" 인용 (**이력 기록** — 소급 편집은 기록 위조).

### 부수 정정

가드 헤더 주석의 *"`### 체크리스트` **6 항목** + 상위 Test plan 1 항목"* 은 stale 이었다. 템플릿 실측은 **체크박스 5 항목 + `###` 헤더 2 항목**이다 (재현: `sed -n '/^### 체크리스트$/,/^### /p' .github/PULL_REQUEST_TEMPLATE.md | grep -c "^- \[ \]"` → 5).

---

## 재검토 조건

1. **WARN 이 영구 배경음이 되면 그 자체가 silent 약화다.** WARN 이 **연속 3 릴리스에서 release PR 클래스에 지속 발화**하면 (a) 템플릿 개정 또는 (b) release PR 예외 정식화 중 **택일한다 — 무기한 WARN 방치 금지**. 실측 base rate: 최근 60 PR 중 release PR **8건 WARN**. 추적 이슈 [#1014](https://github.com/coseo12/astro-simulator/issues/1014)

   > **Amendment 1 (2026-08-13, [#1014](https://github.com/coseo12/astro-simulator/issues/1014)) — 본 항은 대체됐다.** 정본은 [20260813-1014-release-pr-class-no-op.md](20260813-1014-release-pr-class-no-op.md) **§재검토 조건 1-A / 1-B** 다.
   >
   > 위 원문은 (ㄱ) *"지속 발화"* 의 술어가 미정의이고 (ㄴ) base rate 를 *"최근 60 PR 중 8건"* 이라는 **창 종속 표본**으로만 적었다. 그 결과 **침묵을 소멸로 오독**할 여지가 있었고, 실제로 #1014 처리 중 *"연속 6 릴리스 소멸"* 판단으로 발현했다. 릴리스 클래스 **107 PR / 54 사이클 전수 재측정** 결과 WARN 사이클은 **19 (35.2%)** 이고 **최장 WARN=0 연속이 17 사이클** (#792~#956) 이었으며 그 직후 **#965 에서 재발**했다 — 6 사이클 침묵은 잡음 대역 안이다.
   >
   > 대체 문언은 모집단을 구조 조건(`base=main ∨ head^="release/"`)으로, 판정을 `--check-corpus` 실행으로 고정하고, **WARN 축(1-A)과 FAIL 축(1-B)을 분리**한다. 본 ADR 의 상태(`Accepted`)와 결정 1~9 는 불변이다.
2. **`structureHits ≥ 1 ∧ phraseHits = 0` 반례가 1건이라도 실측되면** 결정 3 의 동치 증명이 깨진 것이다 — `--self-test` 의 불변식 단언이 즉시 FAIL 하며, 그때는 blocking 경계 변경 여부를 재결정한다
3. **코드 펜스 안 구조 hit 이 실 PR 에서 발생하면** (현 시점 0) 결정 6 의 *"영향 0"* 서술을 실측으로 갱신한다
4. **required status check 재론**은 본 ADR 이 아니라 [20260807-971](20260807-971-required-status-checks.md) §재검토 조건 경로로만 한다 (결정 9)
5. `CHECKLIST_KEYWORDS` 에 키워드가 추가되면 `structureClass` 를 **반드시 함께 판정**한다. 계급 없는 키워드는 `countStructureHits` 가 throw 하므로 조용히 통과할 수 없다

---

## 교차검증 반영 사항

**cross-validate (agy, 2026-08-11, `cross_validate.sh code 1015`) — 결론 승인** (_"코드 품질·테스트 설계·수학적 검증·문서화 수준 모두 매우 뛰어나며 즉시 머지하기에 적합"_). 메인 오케스트레이터 수행 (`developer.md` #479 로 developer 페르소나 직접 호출 금지).

- **합의 항목** — ① **SSoT 수렴이 근본 처방**임을 인정: 파편화된 하드코딩 grep(`grep -c "ADR 호환성"`)을 제거하고 `node scripts/verify-pr-template-checklist.mjs <PR>` 호출로 단일화해 _"파생 문서가 독자 판정식을 가질 수 없도록 차단"_ 한 것이 문서↔가드 drift 의 **근본 원인 제거**라는 평가. ② **DoD 4축 충족** 확인 (격리 동적 `--self-test` 28 단언 / 3중 시뮬레이션 / 5 페르소나 self-consistency 표 / 메타 도구 자기 적용 `--check-corpus` 60 PR). ③ **변경 11파일 범위 타당** — _"SSoT 수렴 특성상 전 파생 지점을 동시 변경하지 않으면 오히려 drift 창이 열린다"_.
- **이견 항목** — **없음.** agy 가 제기한 2건은 모두 반대 의견이 아니라 **후속 이행 사항**이었다 (아래 고유 발견).
- **고유 발견** — ① **ADR Status 전이 인계 확인** 요구. 본 절이 그 이행이다. ② **release PR 클래스 WARN 모니터링** — 최근 60 PR 중 release PR **8건**이 체크박스 대신 `###` 헤더 절을 써 WARN 대상을 형성하므로, §재검토 조건 1항(_"WARN 이 3 릴리스 연속 발생 시"_)에 걸리면 [#1014](https://github.com/coseo12/astro-simulator/issues/1014) 로 release 템플릿 예외를 정식화하라는 권고. **두 건 다 코드 변경 없이 이행 절차**이므로 본 PR 에 반영할 diff 가 없다.
- **Claude 편향 셀프 체크** — ⚠️ **이슈 #1010 을 연 것이 메인 자신이고, 그 이슈의 전제 2건이 설계 단계에서 실측 반박됐다** (_"원 의도는 AND"_ → 실제 **OR**, 문서의 "AND" 가 오기 / _"느슨한 쪽이 실행돼 여태 안 드러났다"_ → 실제 **719 run 중 76건 FAIL 실발화**). 메인은 `--limit 50` 표본이 최근 success 구간에 몰린 것을 모르고 *"안 드러났다"* 로 단정했다. **자기가 세운 프레이밍을 검증 없이 설계 입력으로 넘긴 편향**이며, architect 의 measurement-first 가 이를 차단했다. 본 ADR 이 채택한 3계급도 메인 가설(_"계급별 structure 정의로 AND 를 살린다"_)의 **절반만** 수용한 것이다 — 계급별 정의는 옳았으나 **AND 를 살리는 도구가 아니라 WARN 계급을 정의하는 도구**였다.

