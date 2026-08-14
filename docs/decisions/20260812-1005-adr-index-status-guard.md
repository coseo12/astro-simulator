# ADR: ADR 인덱스 상태 열 ↔ ADR 실물 기계 대조 — 계약 (2) 의 강제 지점 (#1005)

- 일자: 2026-08-12
- **상태**: **Accepted** (cross-validate agy 2026-08-12 — §교차검증 반영 사항 4축 통합 완료. `Provisional` 에서 전이). ⚠️ 본 라인은 §재검토 조건의 **어순 제약** 대상이다 — 현재 상태 토큰이 최선두여야 하며 그 앞에 다른 상태 어휘를 두지 않는다.
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
| self-test | 기존 11 단언에 혼재 | F1~F16 **23 단언** (PR #1018 시점) 독립 (경계 고정 F10 포함) |
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
| 1. 격리 동적 테스트 | `--self-test` 픽스처 F1~F16 / **23 단언** (**PR #1018 시점** — 현재값은 §Amendment 1). tmpdir 격리, 네트워크 비의존 |
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

**cross-validate (agy, 2026-08-12, `cross_validate.sh code 1018`) — 결론 승인** (_"Approve (권고사항 반영 후 머지)"_). 메인 오케스트레이터 수행 (`developer.md` [#479](https://github.com/coseo12/astro-simulator/issues/479) 로 developer 페르소나 직접 호출 금지).

- **합의 항목** — 4축 **양호**: ① 로직 정확성(어휘 기반 토큰 추출 + 3원 일치 제외 로직) ② 보안(`child_process` import **0**, `gh api …` 문자열은 출력 전용) ③ 성능 ④ 설계 준수(SSoT, DoD 4축, Provisional 인계). 총평 _"3원 일치·DoD 4축·격리 픽스처 덕분에 코드 정합성과 안정성이 매우 높다"_.
- **이견 항목** — **없음.**
- **고유 발견** — **마크다운 링크 앵커(`#…`) 미처리.** 링크에 앵커가 붙으면 파일명 추출 정규식이 실패해 **링크가 있는데도** _"ADR 링크 부재"_ 라는 **거짓 진단으로 FAIL** 한다. 실 저장소에서 재현 후 정규식에 `(?:[#?][^)\s]*)?` 를 추가하고 **회귀 픽스처 `F16`** 으로 고정했다 (self-test 21 → 23). fail-fast 라 조용히 통과하진 않지만 **진단이 틀리는** 형태라 반영 가치가 컸다.
- **Claude 편향 셀프 체크** — ⚠️ **본 PR 에서 메인 커밋이 4회 차단을 만들었고, 네 번 다 _로컬 가드 전건 PASS_ 상태였다.** 매번 잡은 것은 독립 sweep · 릴리스 태그 대조 · 라이브 API GET 이다. 특히 두 건이 **거울상 오류**였다 — BLOCK-1 은 _"`pr-template-checklist` 는 required 아님"_(참)을 `verify-adr-index` 에, BLOCK-3 는 _"`project-guards` 는 required 임"_(참)을 `verify-pr-template-checklist` 에 잘못 붙였다. **워크플로 ↔ job id ↔ required 컨텍스트의 3자 관계를 주어별로 확인하지 않으면 required 서술이 양방향으로 틀린다.** BLOCK-3 는 그 위에 **릴리스된 `[0.67.0]` 섹션 소급 편집**까지 겹쳐 태그 원문 복원으로 되돌렸다. 부수 경로도 실측됐다 — reviewer 가 5분류 표에서 파일명을 축약해 한 hit 을 누락했고, 메인은 _"열거에 없는 hit"_ 을 미처리 거짓으로 판단했다. **5분류 표는 축약 없이 전 hit 을 위치까지 열거해야** 이 경로가 닫힌다.

## Amendment 1 (2026-08-13) — 마커 fork 종결 + 잔여 3항 반영 후 현재값

### 배경

본 ADR §범위 경계 (i) 근거 5 가 _"precision 1.0 대안은 신규 규약이다 … **별도 이슈로 분리**한다"_
로 남긴 fork 가 이슈 [#1020](https://github.com/coseo12/astro-simulator/issues/1020) 에서 닫혔다.
같은 이슈가 PR [#1018](https://github.com/coseo12/astro-simulator/pull/1018) 리뷰의 잔여 권고 3건
(`main()` 커버리지 / 표 앵커 중복 / 어순 픽스처)도 함께 처리해 **본 ADR 이 기록한 픽스처·단언 수가
이동**했다. 본문 §결정 2 표와 §가드 도입 PR DoD 4축 표의 `F1~F16 23 단언` 은 **PR #1018 시점
측정값**이므로 덮어쓰지 않고 시점을 명시했고 (Amendment B 형식 — 본문은 이력), 현재값을 본 절이
싣는다 ([`20260808-983`](20260808-983-measurement-recording-convention.md) §(i) 부분 재측정 금지 —
최종값 1회 일괄 도출).

### 변경 사항

**(i) 마커 fork 종결 — 자기 선언 마커는 기각됐다.**
[`20260813-1020-adr-index-membership-marker-rejected.md`](20260813-1020-adr-index-membership-marker-rejected.md)
가 정본이다. 근거는 _"의미론적이라 불가"_ 가 아니라 **네 점 측정**이다 — 참조 휴리스틱 precision
**26.3%** / 도입 커밋 co-change **16.7%** / AND **36.4%** / OR **15.8%** (rev `fda9475`, recall 분모
= 로컬 등재 8). 네 점 중 어느 것도 1.0 모서리에 닿지 않고, 그 뒤에 남는 **선언**은 base rate
8/98 = 8.2% 에서 저마찰 답(`비대상`)이 91.8% 맞는 구조라 **원하는 행동의 반대로 비용 기울기**를
만든다. ⚠️ **영구 기각이 아니다** — 미등재 재발 **누적 2건째**(현재 1건 = #1015)에서 재도입하며,
그때 실행할 설계(cutoff 상수 `MARKER_REQUIRED_FROM` + 등재 8건만 retrofit)는 1020 §재검토 조건 1 에
완성 형태로 박제됐다. 마커 대신 **작성 시점 개입 1줄**이 `record-adr` 스킬 §절차에 들어갔다
(1020 §결정 5 — 강제 지점이 아니라 **청중** 개선).

**(ii) `F10` 경계 픽스처는 유지된다.**
본 ADR §재검토 조건 1항(_"미등재 검출 이슈가 **채택되면** … `F10` 경계 픽스처를 검출 케이스로
전환한다"_)은 **조건부**이고 그 조건이 성립하지 않았으므로 **발화하지 않는다**. 따라서
`docs/decisions/README.md` 계약 (2) ⚠️ ① / [`scripts/verify-adr-index.mjs`](../../scripts/verify-adr-index.mjs)
§범위 경계 (i) / 본 ADR §범위 경계 (i) 의 기존 서술은 **전부 참으로 남는다**.

**(iii) 현재 픽스처·단언 수 — `F1~F19` / `47` 단언** (2026-08-13, 이슈 #1020 + PR #1036 리뷰 반영 후).
`23 → 47`. 신규분은 `F17` 어순 3(negative 2 + recovery 1) · `F18` 앵커 중복 4(negative 3 +
recovery 1) · `F19a`~`F19o` CLI 표면 17(순수 술어 4 + `main()` 종료 코드 **8** + `dispatch()`
실행 1 + 배선 정적 4).
신규 합계 `3 + 4 + 17 = 24` 이고 `23 + 24 = 47` 으로 총계와 닫힌다. ⚠️ `main()` 축은 **6 경로 /
8 단언**이다 — PASS·FAIL 두 경로만 종료 코드와 **출력 문자열**을 각각 단언하기 때문이며(배선이
끊겨 조용히 0 을 반환하는 경로 차단), 경로 수를 단언 수로 적으면 합계가 2 어긋난다.
술어 자기 검증: `grep -c 'assert(' scripts/verify-adr-index.mjs` == `--self-test` 출력의 `N passed`
== **47**.

⚠️ **의존성 유입 검사는 denylist 가 아니라 allowlist 다** (PR [#1036](https://github.com/coseo12/astro-simulator/pull/1036)
reviewer Y-1). 금지 모듈명을 적는 denylist 는 ① 그 낱말이 소스에 들어가 사람의 `grep` 감사 술어를
오염시키고 ② 오염을 피하려 이름을 조각 합성하면 **그 관용구가 곧 우회 경로**가 된다 (실측: 합성 +
동적 로더 3줄로 모듈이 실제 로드되는데 self-test·`grep` 이 **동시에 침묵**). allowlist 는 금지
낱말을 적을 필요가 없어 두 문제를 함께 없애고 **allowlist 밖 모든 유입**을 잡는다.

고정 범위는 _"자식 프로세스 모듈 import 0"_ 이라는 일반 명제가 아니라 **① 단일 라인
`import … '…';` 선언 집합 == allowlist ∧ ② `^import` 시작 줄 수 == allowlist 길이 ∧ ③ 동적
모듈 로드 표현 0** 이다 — 전자를 함의하지만 같지 않다. ②가 필요한 이유는 ①의 수집 정규식이
**한 줄로 끝나는 선언만** 보기 때문이다: 다중행·세미콜론 누락 선언은 ①에 잡히지 않아 새 유입이
조용히 통과한다 (PR [#1036](https://github.com/coseo12/astro-simulator/pull/1036) reviewer N-1,
dev 재현 — 두 형태 `47 passed, 0 failed` exit 0). 두 형태 모두 `^import` **줄 수**를 늘리므로
②가 함께 닫는다 (재현 후 `46/1`). ⚠️ 적대적 시나리오가 아니다 — prettier 가 `printWidth: 100`
초과 시 **스스로** 다중행으로 쪼개며, 본 가드의 `node:fs` 선언은 현재 **98자(여유 2자)** 라
명명 export 하나만 더해도 그 형태가 된다 (dev 실측).

⚠️ **①③의 스캔 범위는 다르다.** ③은 파일 **전문**을 훑어 주석·단언 메시지까지 검사하므로
_"금지 토큰이 산문에도 등장할 수 없다"_ 가 ③에만 참이고, ①은 `^import` 줄만 보므로 산문에
모듈명을 적어도 무해하다. 이 성질은 설계라기보다 텍스트 전수 검사의 **승격된 부작용**이며
정당한 대가로 수용한 것이다 (reviewer B 판정). 갱신 지점은 `verify-adr-index.mjs` 호출 예시 주석 · self-test 섹션 헤더 ·
`project-guards.yml` 주석 **3곳**이며, `CHANGELOG.md` 의 `[0.68.0]` 섹션과 agy 발화 인용은
**계급 ② 이력 기록**이라 무접촉이다 (1020 §결정 3 편집 금지 표).

**검사 계약 1항이 넓어졌다.** 표 앵커는 _"부재 시 FAIL"_ 에서 **_"발생 수 != 1 이면 FAIL"_** 이 됐다
— 같은 헤더 표가 2개면 첫 표만 파싱되고 나머지가 **조용히 미검사**로 남던 경로(`findIndex`)를 닫은
것이고, 진단은 _"부재"_ 와 _"중복"_ 을 구분한다. **fallback 분기는 없다** (CLAUDE.md §가드 설계 원칙).

### 영향 범위

- **상태 라인·인덱스 표 행 불변** — 본 ADR 은 여전히 `Accepted` 이고 인덱스 표 행도 그대로다.
  따라서 `node scripts/verify-adr-index.mjs` 는 계속 PASS 한다 (Amendment 자신이 가드의 검사 대상).
- **자식 프로세스 모듈 import 0 불변** — 본 ADR §교차검증 반영 사항 의 보안 축 통과 근거가
  유지된다. `main()` 커버리지는 spawn 이 아니라 **인자 기본값 주입**으로 얻었다.
- 본 ADR §결정 2 표 / §가드 도입 PR DoD 4축 표의 수치는 **PR #1018 시점** 이력으로 읽는다.

## Amendment 2 (2026-08-14) — 수집 정규식을 선언 앵커로 넓혀 "코드 무변경 FAIL" 경로 제거 (#1037)

### 배경

Amendment 1 §변경 사항이 못 박은 고정 범위 **①** 은 _"**단일 라인** `import … '…';` 선언 집합 ==
allowlist"_ 였고, 같은 절이 그 대가를 이미 예고했다 — _"prettier 가 `printWidth: 100` 초과 시
**스스로** 다중행으로 쪼개며, 본 가드의 `node:fs` 선언은 현재 **98자(여유 2자)** 라 명명 export
하나만 더해도 그 형태가 된다"_. 예고는 적중했다: PR [#1036](https://github.com/coseo12/astro-simulator/pull/1036)
qa 가 `statSync` 추가(108자) → `prettier --write` → 9줄 분할 → `46 passed, 1 failed` exit `1` 을
실측했다. **allowlist 는 불변인데 FAIL** 한다 — 가드가 겨눈 것(유입)이 아니라 **선언의 형태**를
차단한 것이고, 이 가드는 `main` 의 required check 라 그 상태에서 후속 PR 이 전부 하드 블록된다.

[#1037](https://github.com/coseo12/astro-simulator/issues/1037) 은 *처방 안내 추가* 와 *다중행 수집으로
근본 해소* 를 선택지로 제시했다. **후자를 채택한다** — 안내는 형태 제약을 존치한 채 우회법만
가르치는데, 그 제약은 애초에 설계 의도가 아니라 수집 정규식의 **부작용**이었기 때문이다.

### 변경 사항

고정 범위 **①** 을 _"**컬럼 0 의 `^import` 로 시작하는** 정적 import 선언 집합 == allowlist"_ 로
넓힌다 (② `^import` 시작 줄 수 ==
allowlist 길이 · ③ 동적 모듈 로드 표현 0 은 **불변**).

⚠️ **앵커 수식어를 문언에서 빼지 않는다** (PR [#1077](https://github.com/coseo12/astro-simulator/pull/1077)
reviewer 🟡-3). 초판 Amendment 2 는 ①을 그냥 _"정적 import 선언 집합 == allowlist"_ 라 적었는데,
그 표현은 `[0.68.0]` 섹션이 _"방향은 옳았으나 **한 단계 덜 좁혔다**"_ 로 **두 라운드에 걸쳐 기각한
바로 그 문언**이다. 당시 기각 사유는 둘이었고 — (a) 다중행 선언 미수집 (b) `^import` **컬럼 0 앵커**
— 본 Amendment 가 해소한 것은 **(a) 뿐**이다. (b) 는 구현에 그대로 남아 있으므로, 문언만 넓히면
계약 ↔ 구현 drift 가 **새로 생긴다**. 그래서 넓힌 것은 _"단일 라인"_ 제약 하나이고 앵커는 명시한다.

수집 정규식은 시작을 `^import` 로, 종료를
`';` **+ 줄 끝**으로 앵커하고 그 사이에 `[^;]` 만 허용한다 — 사이에 줄바꿈이 와도 되므로 prettier
가 쪼갠 다중행 선언이 **선언 1건 = 매치 1건**으로 수집된다.

**②를 함께 걷어내지 않는 것이 핵심이다.** 넓힌 뒤에도 두 조건은 독립이다: 세미콜론 누락 선언은
종료 앵커가 없어 여전히 수집되지 않고, 한 줄에 선언 2건을 이어 쓰면 앞 선언의 `;` 뒤가 줄 끝이
아니라 그 줄이 통째로 수집에서 빠진다. 두 형태 다 `^import` **줄 수**로는 드러나므로 ②가 닫는다.
Amendment 1 이 ②의 존재 이유로 든 근거는 **그대로 유효**하며, 본 Amendment 는 ①이 ②에 떠넘기던
몫 중 *다중행* 하나만 ①으로 되가져온다.

신규 픽스처 `F19p`(다중행 수집 성립) · `F19q`(세미콜론 누락·한 줄 2선언은 ②로만 드러남) 가 이
경계를 **합성 소스 문자열**로 고정한다 — 실물 파일이 아니라 문자열에 적용하므로 이 파일의 선언
형태가 앞으로 어떻게 바뀌든 판정이 결정적이고, `\n` 이 escape 라 물리적 줄 시작이 아니므로
`^import` 앵커 단언들에 유입되지 않는다 (자기-매칭 4표면 중 ① 재발 방지).

### 실측 — 주입 매트릭스 (rev `38b6c8a` 기준 격리 사본, `scripts/` 전체 복사 후 self-test)

baseline `49 passed, 0 failed` exit `0` 대비:

| 주입 | 결과 | 귀속 |
|---|---|---|
| **없음**(사본 건전성) | `49/0` exit `0` | — |
| **`node:fs` 에 `statSync` 추가 → `prettier --write` 실분할(9줄)** | **`49/0` exit `0`** | **— (구 판정본은 `46/1` exit `1`)** |
| allowlist 밖 모듈 — 단일 라인 | `48/1` exit `1` | `F19n` |
| allowlist 밖 모듈 — **다중행** | `48/1` exit `1` | `F19n` |
| 세미콜론 누락 유입 | `48/1` exit `1` | `F19n` |
| **한 줄 2선언** 유입 | `48/1` exit `1` | `F19n` |
| 동적 모듈 로드 (합성 모듈명) | `48/1` exit `1` | `F19o` |
| 배선 한 줄 제거 | `48/1` (프로세스 exit `0`) | `F19l` |
| `main()` 전역 직접 참조 되돌림 | `44/5` exit `1` | `F19i`·`F19j`·`F19m` |
| recovery (유입 되돌림 → 원본과 바이트 동일) | `49/0` exit `0` | — |

2행이 본 Amendment 의 목적이고, 3~6행이 **넓힌 수집이 검출력을 잃지 않았다**는 증거다. 특히
5·6행은 ②가 없으면 통과하는 형태라 ②의 존치 근거를 직접 재현한다. 8행의 프로세스 exit `0` 은
오탐이 아니라 `F19l` 의 존재 이유 그 자체다 — 배선을 지우면 종료 코드가 **조용히** 0 이 된다.

### `F19o` 는 손대지 않는다 (#1037 N-2 판정 — 기각)

되돌림은 #1037 §비목표가 금지한다 (PR #1036 에서 근거와 함께 수용된 대가). 안내 추가도 하지
않는다 — `F19o` 메시지는 이미 *원인*(스캔 범위가 파일 전문) · *표지*(_"코드 무변경인데 실패하면
이 경로다"_) · *처방*(서술형으로 바꿔 쓸 것) 3요소를 갖췄고, 덧붙일 것은 안내가 아니라 중복이다.

⚠️ **초판이 여기에 적었던 _"저 표지 문장이 배타적으로 참이 됐다"_ 는 거짓이다** (PR
[#1077](https://github.com/coseo12/astro-simulator/pull/1077) reviewer 🟡-4 반증). `F19n` 에서
소멸한 것은 **prettier 분할 경로 하나**일 뿐이고, "코드 무변경 FAIL" 경로 자체는 남아 있다 —
컬럼 0 에서 import 키워드로 시작하는 줄을 **블록 주석**에 넣으면 `^import` 앵커가 그것을 세어
FAIL 한다. 실측(head): 그런 주석 **3줄** 주입 시 주석·공백을 제거한 **실행 코드가 607행 바이트
동일**인데 `48 passed, 1 failed`. 따라서 두 단언은 이 클래스를 **공유**하며(`F19o` 는 파일 전문
스캔, `F19n` 은 컬럼 0 앵커), `F19n` 메시지에도 **산문 분기 1절**을 넣었다.

**이 오류는 형태가 나쁘다** — 같은 커밋이 ADR `20260806-962` §9-3 에 _"전칭 단정을 쓸 때는
술어의 사각을 함께 적으라"_ 는 부기를 넣으면서, **바로 그 커밋 안에서 새 전칭 단정을 박제**했다.
`[0.68.0]` 이후 이 저장소가 반복 지적해 온 **반증 가능한 단정** 클래스의 자기모순 재현이다.

"같은 안내 체계로 묶는다" 를 기각한 결론 자체는 유지된다 — 다만 근거는 _"모집단이 1"_ 이 아니라
_"`F19o` 메시지가 이미 3요소를 갖췄고 되돌림은 §비목표"_ 다. 모집단은 실은 **2** 였다.

### 범위 경계 — 닫지 않은 우회 2건과 그 근거 (#1077 reviewer 🟡-2)

reviewer 가 본 Amendment 를 검증하며 `^import` 앵커를 비껴가는 정적 형태 **2건**을 실측했다.
**둘 다 `origin/develop`(base `38b6c8a`)에서도 똑같이 통과**하므로 본 Amendment 의 회귀가 아니다
(head `49/0` · base `47/0` — **패리티**).

| 형태 | 백스톱 | 성격 |
|---|---|---|
| `export { x } from '<모듈>';` (re-export — 모듈을 **실제로 로드**한다) | **없음** | 진성 미검출 |
| 컬럼 0 이 아닌 **들여쓴** `import` | `prettier --check` 가 최상위 들여쓰기를 정규화 | 부분 백스톱 |

**본 PR 에서 닫지 않는다.** 근거 셋:

1. **직교성** — #1037 의 계약은 _"코드 무변경 FAIL 경로 제거"_ 다. 우회 차단은 **유입 검출력을
   넓히는 반대 방향 축**이라 같은 PR 에 섞으면 스프린트 계약이 사후 확장된다 (CLAUDE.md §이슈
   범위만 구현).
2. **1줄 패치가 아니다** — `export … from` 을 제대로 닫으려면 조건 ②(`^import` 줄 수)도
   `^export … from` 을 세야 하고, allowlist 의 의미가 _"import 대상"_ → _"정적 모듈 참조 대상"_
   으로 넓어진다. 이는 본 §고정 범위의 **재정의**이지 정규식 한 줄 수정이 아니다.
3. **충돌 표면** — 본 Amendment 가 이미 단언 수를 `47` → `49` 로 옮겼고, 동시 진행 이슈가 같은
   `selfTest()` 에 픽스처를 추가할 예정이라 `:415` 헤더가 이미 2-way 다. 여기서 픽스처를 더 늘리면
   **3-way** 가 된다.

⚠️ **후속 이슈 분리를 권고한다** — 이 표를 ADR 본문에 적는 이유가 그것이다.
[`20260812-970`](20260812-970-pr-base-rule-guard.md) §9 가 _"표에만 있는 후속은 유실된다"_ 를
실증했고([#1030](https://github.com/coseo12/astro-simulator/issues/1030) 이 그 회수였다), 본 항이
같은 경로를 밟지 않도록 **성격·백스톱·비용**을 여기에 남긴다. 단 PR [#1036](https://github.com/coseo12/astro-simulator/pull/1036)
reviewer 가 이슈화를 명시 반대한 _"런타임 주입 전역 / allowlist 내 모듈 경유 간접 실행"_ 과는
**구분된다** — 그쪽은 정적 텍스트 검사로 **원리적으로** 닫을 수 없는 클래스지만, 위 2건은
정적 형태라 **닫을 수 있다.** 판단이 갈리는 것은 가능성이 아니라 **우선순위**다.

### 단언 수 — 최종값 1회 일괄 (ADR 20260808-983 §(i))

[`20260813-1020`](20260813-1020-adr-index-membership-marker-rejected.md) §결정 3 절차를 그대로
적용했다. 술어 자기 검증 `grep -c 'assert(' scripts/verify-adr-index.mjs` == `--self-test` 출력의
`N passed` == **49** (`47` → `49`, 차분 `+2`. 절대값·차분을 한 번의 출력에서 함께 도출했다).
`F19p`·`F19q` 는 기존 `F19` 아래로 들어가므로 **범위 라벨 `F1~F19` 는 불변**이고, 갱신 대상은
`verify-adr-index.mjs` self-test 섹션 헤더 **1곳**뿐이다 (호출 예시 주석 `:80` · `project-guards.yml:78`
은 범위 라벨만 싣는다). Amendment 1 §변경 사항의 `47` 및 `단일 라인` 서술은 **PR #1036 시점
이력**이라 치환하지 않는다 — 본 Amendment 가 승계한다 (1020 §결정 3 편집 금지 계급 ②).

### 영향 범위

- **상태 라인·인덱스 표 행 불변** — 본 ADR 은 여전히 `Accepted` 이고 인덱스 표 행도 그대로다.
- **본검사 거동 불변** — `node scripts/verify-adr-index.mjs` 는 계속 PASS (`상태 불일치 0`).
  변경은 `--self-test` 의 자기 배선 검사에 한정되며 ADR 인덱스 대조 로직은 무접촉이다.
- **자식 프로세스 모듈 import 0 불변** — allowlist 자체는 6항목 그대로다.
