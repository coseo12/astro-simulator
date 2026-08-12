# ADR: ADR 인덱스 상태 열 ↔ ADR 실물 기계 대조 — 계약 (2) 의 강제 지점 (#1005)

- 일자: 2026-08-12
- **상태**: **Provisional** (cross-validate 발동 앵커 2건 — ADR 신규 / 가드 규약 신설. 메인 오케스트레이터가 cross-validate 수행 후 §교차검증 반영 사항 통합 → `Accepted` 전이. 전이 시 [`README.md`](README.md) 인덱스 표의 상태 열을 **같은 커밋에서** 갱신할 것 — 본 ADR 이 강제하는 계약 (2) 의 자기 적용이며, 누락하면 본 가드가 CI 에서 FAIL 시킨다)
- 관련: 이슈 [#1005](https://github.com/coseo12/astro-simulator/issues/1005) / PR [#1004](https://github.com/coseo12/astro-simulator/pull/1004) (계약 (2) 명문화, [#998](https://github.com/coseo12/astro-simulator/issues/998) 축 B) / PR [#993](https://github.com/coseo12/astro-simulator/pull/993) · [#1015](https://github.com/coseo12/astro-simulator/pull/1015) (재발 실측 2건)
- 자매 규약: [`20260808-983-measurement-recording-convention.md`](20260808-983-measurement-recording-convention.md) (iii) — _"CHANGELOG ↔ ADR 상태 동시 갱신"_. 같은 조항이고 **대상만 다르다**
- 계보: [`20260806-962-branch-name-guard.md`](20260806-962-branch-name-guard.md) — _"산문 규약의 정본을 실행 가능한 가드로 이전"_ 의 두 번째 사례

## 배경

`docs/decisions/README.md` §인덱스 계약 **(2) 상태 열 갱신 책임** 은 _"ADR 상태를 전이시키는 PR 이
같은 PR 에서 본 표를 갱신한다"_ 를 명문화했다 (PR #1004). 그런데 **강제 지점이 0** 이었다 — PR 템플릿
0건 / 에이전트 파일 0건 / 가드 0건. 규범만 있고 발화 지점이 없으면 다음 전이 PR 에서 그대로 재현되며,
실제로 **두 번 실측**됐다.

| # | 재발 형태 | 왜 규범이 못 막았는가 | 본 가드 |
|---|---|---|---|
| [#993](https://github.com/coseo12/astro-simulator/pull/993) | ADR `971` 이 `Provisional → Accepted` 로 전이됐는데 표는 `Provisional` 잔존 | 전이 PR 의 변경 파일이 **정확히 2개** (`CHANGELOG.md` + 해당 ADR) — 계약 (2) 는 그 PR 이 **정의상 열지 않는 파일** 안에 있다 | **검출** (self-test `F2` + 라이브 재현) |
| [#1015](https://github.com/coseo12/astro-simulator/pull/1015) | 신규 ADR `20260811-1010` 미등재 | 계약 명문화 **바로 다음 PR** 에서 발생. reviewer BLOCK-2 로 사람이 잡음 | **미검출 — 의도된 범위 밖** (아래 §범위 경계, self-test `F10` 이 경계 고정) |

**현 시점 drift 는 0 이다.** 위 두 건을 사람이 수동으로 맞췄기 때문이다 (#998 축 B / #1015). 즉 본
결정은 _"지금 틀린 것을 고치기"_ 가 아니라 **_"수동으로 맞춘 것이 다시 어긋나지 않게 하기"_** 이며,
그래서 **positive PASS 는 작동 증거가 아니다** — 증거는 negative 픽스처 쪽에 있다
([`docs/lessons/guard-pr-dod.md`](../lessons/guard-pr-dod.md)).

## 결정

### 1. 신규 가드 [`scripts/verify-adr-index.mjs`](../../scripts/verify-adr-index.mjs) 를 신설한다

표 상태 셀의 **상태 토큰** 과 ADR 실물 첫 `상태:` 메타데이터 라인의 상태 토큰을 대조하고, 불일치 시
`exit 1` (`project-guards.yml` 2 스텝 — 본검사 + `--self-test`). **fallback 분기 없음**: 상태 라인
부재 / 어휘 밖 토큰 / 표 파손은 _"판정 불가라서 통과"_ 가 아니라 **그 자체를 FAIL** 로 보고한다
(CLAUDE.md §가드 설계 원칙 — drift 가드는 fail-fast 만).

문자열 동일성이 아니라 **토큰** 을 비교하는 이유는 두 자리의 서술 형식이 애초에 다르기 때문이다
(표 `Accepted` vs 실물 `**Accepted** (cross-validate agy 2026-08-11 — …)`). 토큰 규칙:

- 링크·강조·코드 마커 제거 후, 어휘 {`Accepted`, `Provisional`, `Proposed`, `Superseded`,
  `Deprecated`, `Rejected`} 중 **가장 먼저 등장하는** 토큰이 정본 (대소문자 무시, `\b` 경계)
- **`NO-OP` 은 어휘에 넣지 않는다** — 상태가 아니라 **결정 성격 수식어**다. 덕분에 표
  `Accepted (NO-OP)` ↔ 실물 `**NO-OP** (Accepted, 2026-05-11)` 이 정합 판정된다 (self-test `F6`)
- `Supersedes`(능동 — 이 ADR 이 무엇을 대체하는가) 는 `Superseded`(수동 — 상태) 와 다른 낱말이라
  `\b` 경계에서 매칭되지 않는다 (self-test `F5`)

부수 불변식 3종도 같은 패스에서 검사한다 — **중복 등재 0** (상태 열이 두 벌이면 정본이 결정 불가),
**날짜 셀 ↔ 파일명 접두 일치**, **표 앵커·열 수 보존** (마크다운 표 파손 = 인덱스 소실. PR
[#1009](https://github.com/coseo12/astro-simulator/pull/1009) 헤딩 파손 클래스).

### 2. `verify-docs-links.mjs` 확장이 아니라 **신규 가드**로 뺀다

| 축 | (a) `verify-docs-links.mjs` 확장 | (b) **신규 가드** (채택) |
|---|---|---|
| 책임 | 링크 무결성 계약 8항에 _"표 셀 의미(상태 토큰) 대조"_ 라는 이질 도메인 9항 추가 | 인덱스 정합이라는 단일 책임. 이름이 검사 대상을 정확히 서술 |
| 실패 메시지 | `[docs-links] FAIL` 로 뭉뚱그려짐 | `[adr-index] FAIL — 표 'Provisional' vs 실물 'Accepted'` 로 actionable |
| self-test | 기존 11 단언에 혼재 | F1~F16 **23 단언** 독립 (경계 고정 F10 포함) |
| 배선 비용 | 0 | `project-guards.yml` 2 스텝 + `package.json` 1 스크립트 |
| 제외 판정 SSoT | allowlist 가 같은 파일에 있음 | **모듈 분리로 해결** (아래 3) |

(b) 의 유일한 실질 비용은 배선인데, 그 대가로 얻는 것이 _"실패 메시지가 무엇을 고치라고 말하는가"_
라 지불한다. 이슈 본문이 짚은 _"새 파서가 필요 없다"_ 는 **파싱 능력**에 대한 진술이고 (실제로 재사용
가능한 지식이 있어 파서는 100줄 미만), **책임 배치**에 대한 진술이 아니다.

### 3. upstream-only 제외 판정은 **3원 일치**를 요구하고, 근거 목록은 두 가드가 공유한다

제외 판정의 1차 근거는 이슈 지정대로 **로컬 파일 부재**다. 다만 그것만 보면 _"방금 실수로 지운 ADR"_
과 _"upstream 유래라 원래 없는 ADR"_ 이 구분되지 않으므로, 세 신호가 **모두 같을 때만** 제외한다.

```text
로컬 파일 부재  ⟺  주제 셀 '(upstream-only)' 표기  ⟺  allowlist 등록
```

셋이 갈리면 FAIL (self-test `F9`). 세 번째 신호의 목록은
[`scripts/upstream-only-allowlist.mjs`](../../scripts/upstream-only-allowlist.mjs) 로 분리해
`verify-docs-links.mjs` 와 **같은 객체를 import** 한다 — 사본을 두면 두 가드의 제외 집합이 갈릴 수
있고, 그건 _"drift 를 감지"_ 하기 전에 **drift 원을 새로 만드는** 짓이다 (volt
[#120](https://github.com/coseo12/volt/issues/120) — 중복 출처 제거 > 매칭 가드). 인라인 사본 재유입은
self-test `F15` 가 정적으로 막는다.

**제외는 silent skip 이 아니다.** 매 실행 stdout 에 제외 행 + 제외 근거 + README 계약 (3) 의 **수동
1줄 GET 명령**을 그대로 출력한다. upstream 실물 상태 대조는 네트워크 의존이라 CI 범위 밖이지만
(#1005 §비목표), _"대조 불가"_ 가 아니라 **인계**임을 매 실행 노출한다 (PR #1004 BLOCK-2 — _"실물이
없어 원리적으로 대조 불가"_ 라는 서술이 재확인 시도 자체를 봉인했던 전례).

## 범위 경계 (의도적 미검출)

### (i) 미등재 검출 — 범위 밖, 별도 이슈 분리

#1015 의 실제 재발이 이 클래스라 실효성 질문이 정당하다. 그럼에도 본 PR 범위에 넣지 않는 근거:

1. **등재 기준(계약 1)이 의미론적 판정이다** — _"이 결정을 모른 채 무관한 작업을 하면 그 작업이
   규약을 위반하는가?"_ 는 기계가 결정할 수 없다.
2. **전수 등재 강제는 오탐 90건** — 실측 2026-08-12: `docs/decisions/*.md` 중 ADR 실물 **95건**
   (`README.md`/`_amendment-template.md` 제외), 인덱스 등재 **로컬 5건**. 재현:
   `ls docs/decisions/*.md | grep -v -E '/(README|_amendment-template)\.md$' | wc -l`
3. **참조 휴리스틱은 precision 1.0 미달** — _"`CLAUDE.md`·`.claude/**`·`scripts/**` 에서 참조되면
   횡단 거버넌스"_ 가설을 전수 대조한 결과 **precision 3/17 · recall 3/5** (후보 17건 중 등재 3건만
   적중, `971`·`1010` 은 미포착). 오탐 14건은 R-Phase 시각화·forensic ADR 이 CLAUDE.md 에 _"모범
   사례"_ 로 링크된 것들이다. measurement-first 원칙상 이 정밀도로는 가드를 세울 수 없다
   ([`docs/lessons/guard-design-principles.md`](../lessons/guard-design-principles.md)).
4. **PR diff 기반 알림은 alert fatigue** — 신규 ADR 대부분이 비등재 대상이라 _"ADR 추가했는데 README
   미변경"_ 알림은 거의 매번 발화한다 ([#766](https://github.com/coseo12/astro-simulator/issues/766)
   계보).
5. **precision 1.0 대안은 신규 규약이다** — ADR 자기 선언 마커 (예: `- 인덱스: 등재 | 비대상`) 를
   `record-adr` 스킬·템플릿·계약에 신설하면 기계 판정이 가능해진다. 그러나 이는 **ADR 작성 계약의
   신설**이라 cross-validate 발동 앵커이며, 본 이슈(#1005)의 완료 기준 1항(상태 대조)과 다른 결정이다.
   **별도 이슈로 분리**한다.

미검출은 self-test **`F10`** 이 픽스처로 고정한다 — 경계를 산문이 아니라 **테스트**로 못 박아, 미래
관찰자가 미검출을 _"가드 결함"_ 으로 오인하거나 반대로 조용히 범위를 넓히지 못하게 한다.

### (ii) 산문 역참조 — 범위 밖

본문 안의 상태 서술 (`20260701-779:5` 같은 자연어 문장) 은 표 셀이 아니라 자연어라 별개 난이도다.
**계약 (2) 자체도 이 클래스를 덮지 않는다** (#1005 완료 기준 4항).

## 가드 도입 PR DoD 4축

| 축 | 이행 |
|---|---|
| 1. 격리 동적 테스트 | `--self-test` 픽스처 F1~F16 / **23 단언**. tmpdir 격리, 네트워크 비의존 |
| 2. 3중 시뮬레이션 | **픽스처**: positive `F1` → negative `F2`(#993 형태) → recovery `F3`. **라이브(실 저장소)**: 971 행을 `Provisional` 로 되돌려 `exit 1` → 복구 `exit 0`, 역방향(실물만 `Superseded` 전이)도 `exit 1`. 두 negative 는 서로 다른 방향의 drift 다 |
| 3. self-consistency | 제외 판정 근거가 `verify-docs-links.mjs` 와 **같은 모듈**임을 `F15` 가 정적 단언 (인라인 사본 재유입 0). 실 저장소 실행에서 제외 3행 == README source allowlist 3쌍 |
| 4. 메타 측정 자기 적용 | 변경된 가드를 **현재 저장소**에 적용 — 도입 전 `8행 / 대조 5 / 제외 3` PASS, 본 ADR 등재 후 `9행 / 대조 6 / 제외 3` PASS (6번째가 본 ADR 자신의 `Provisional`) |

## 결과 · 재검토 조건

**결과**

1. 계약 (2) 가 규범에서 **CI 발화 지점**을 얻는다. ADR 상태를 전이시키면서 표를 잊은 PR 은 머지 전
   빨간 X 로 드러난다. ⚠️ **본 가드는 `main` 의 required status check 다** — 라이브 실측
   `GET /branches/main/protection` = `["project-guards","branch-name","label-pr"]` 이고, 본 가드는
   그 job id (`project-guards`) 에 배선된다. 따라서 `base=main` PR(release/hotfix)에서 `exit 1` 은
   **머지 하드 블록**이다. (초판이 [`20260807-971`](20260807-971-required-status-checks.md) 결정 9-1 을
   인용해 _"required 아님 · 차단 아니라 신호"_ 라 적었으나 **거짓**이다 — 결정 9-1 은
   `pr-template-checklist` 를 **제외**하는 조항이고, 같은 ADR §Phase 1 이 `project-guards` 를
   required 3개로 **직접 열거**한다. PR #1018 리뷰 BLOCK-1 실측 반증.)
2. 본 ADR 자신이 첫 자기 적용 사례다 — `Provisional` 로 박제하고 같은 PR 에서 인덱스 표에 등재했다.
   cross-validate 후 `Accepted` 전이 시 **표를 같이 갱신하지 않으면 본 가드가 FAIL** 한다.
3. upstream-only 3건의 제외가 **매 실행 가시화**되어, 로컬 부재가 _"모르는 상태"_ 가 아니라
   _"알려진 부재 + 수동 대조 절차 인계"_ 로 남는다.

**재검토 조건**

> ⚠️ **상태 라인 어순 제약 (PR [#1018](https://github.com/coseo12/astro-simulator/pull/1018) 리뷰 Y-1).**
> 본 가드는 상태 라인의 **최선두 어휘 토큰**을 현재 상태로 읽는다. 전이를 기록할 때
> **현재 상태 토큰보다 앞에 다른 상태 어휘를 두지 않는다.** 실측: `**Accepted** (… — Provisional 에서 전이)`
> → `exit 0` / `Provisional → **Accepted**` → `exit 1` **에 진단까지 반전**된다 (표가 맞는데 실물이 틀렸다고 보고).
> 전이 PR 은 `node scripts/verify-adr-index.mjs` 로 **PASS 를 확인한 뒤** 커밋한다.

1. **미등재 검출 이슈가 채택되면** — ADR 자기 선언 마커 도입 시 §범위 경계 (i) 을 Amendment 로
   갱신하고 `F10` 경계 픽스처를 검출 케이스로 전환한다.
2. **상태 어휘 확장 시** — `Rejected`/`Deprecated` 외 새 상태어가 등장하면
   `STATUS_VOCABULARY` + 본 §결정 1 + 스크립트 헤더 계약을 **동시** 갱신 (한쪽만 바꾸면 어휘 밖 토큰이
   FAIL 로 떨어져 즉시 드러난다 — silent 실패 경로 없음).
3. **표 열 구성 변경 시** — `TABLE_HEADER`/`TABLE_COLUMNS` 상수 동시 갱신. 미갱신 시 앵커 부재 FAIL
   로 드러난다 (조용한 0행 통과 없음).
4. **upstream-only 3건이 정리되면** (upstream 저장소 archive 등) — allowlist 모듈과 계약 (3) 을 같이
   정리한다. `verify-docs-links.mjs` 의 stale allowlist warn 이 그 신호다.

## 교차검증 반영 사항

> **미수행.** 본 ADR 은 `Provisional` 이다. developer 페르소나는 cross-validate 직접 호출이 금지돼
> 있어 (`.claude/agents/developer.md` — [#479](https://github.com/coseo12/astro-simulator/issues/479))
> 메인 오케스트레이터에게 인계한다. 수행 후 4축 분류 (합의 / 이견 / 고유 발견 / Claude 편향 셀프 체크)
> 를 이 절에 채우고 상태를 `Accepted` 로 전이하며, **같은 커밋에서**
> [`README.md`](README.md) 인덱스 표의 상태 열을 `Provisional → Accepted` 로 갱신한다.
