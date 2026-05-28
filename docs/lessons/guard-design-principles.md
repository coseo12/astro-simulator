# 가드 설계 원칙 — measurement-first / silent 약화 트레이드오프 / fail-fast

> **요지**: drift / regression 가드 (`verify-*.sh`, CI step, ADR §재검토 조건 등) 설계 시 (1) architect 권고를 dev 가 D1 실측으로 정확화 (measurement-first), (2) 1인 운영 발화 빈도가 임계값 넘으면 의식적 silent 약화 ADR Amendment 박제, (3) drift 가드는 fail-fast 만 — fallback 분기 절대 금지. 3개 원칙은 가드 무력화 패턴의 보완.
>
> **근거**: volt [#101](https://github.com/coseo12/volt/issues/101) / [#106](https://github.com/coseo12/volt/issues/106) / [#107](https://github.com/coseo12/volt/issues/107). harness `verify-release-version-bump.sh` (v2.28.1) 는 본 §3 fail-fast 원칙 선례.

---

## 1. measurement-first 조정 패턴 (#101)

### 배경

architect 가 권고한 검증 식별자 (multi-OR keyword 매칭 등) 가 **dev 단계 첫 실측에서 false-positive** 발생 → dev 가 정확 식별자로 정정. **architect 결정만으로 박제하지 말고 dev 가 D1 실측으로 검증 후 정확화**.

### 사례 패턴

architect 권고 (broad keyword OR):

```javascript
const PHASE1_KEYWORDS = /(Phase 1|본 프로젝트|astro-simulator)/i;
const PHASE2_KEYWORDS = /(Phase 2|upstream|harness-setting)/i;
```

dev D1 실측 결과:

```
Phase 1: 11
Phase 2: 5  ← false-positive (실제 0)
```

→ "upstream" 키워드가 docstring/주석에서 매칭됨.

dev 정정 (정확 식별자):

```javascript
const PHASE1_PR_PATTERN = /Phase 1[\s\S]{0,80}?#(\d+)/g;
const PHASE2_PR_PATTERN = /Phase 2[\s\S]{0,80}?#(\d+)/g;
// "Phase X" 직후 80 글자 이내의 #N 만 매칭 → docstring noise 제외
```

### 단계 흐름

| 단계 | 권고 | 측정 |
|------|------|------|
| architect | broad keyword OR | 자체 측정 안 함 — 권고만 |
| dev D1 | broad 적용 → 실측 | **false-positive 발견 시 정정 의무** |
| dev D2 | precision 정정 → 재실측 | 0 false-positive 확인 후 박제 |
| reviewer | 정적 검토 | precision 정규식 의미론적 검증 |
| qa | 동적 매트릭스 | 격리 케이스로 false-positive/negative 확인 |

### 3중 박제 위치 (정확 식별자)

1. 스크립트 본문 (정확 정규식)
2. workflow yaml step 주석 (의미 박제)
3. ADR §측정 지표 (스펙 박제)

### 핵심 교훈

- architect 권고를 dev 가 **broad 그대로 박제 금지** — D1 실측 의무
- false-positive 발견 시 dev 가 정확화 (정규식 boundary / lookahead / character class 등)
- 정정 후 3중 박제 위치 동시 갱신
- **"measurement-first" 의 핵심**: 권고는 가설, 실측이 확정

### 관련 패턴

- CLAUDE.md `## 스프린트 계약` §10 "DoD 수치 미달 시 측정 방법 검증 우선" — 본 패턴은 **가드 설계 단계** 의 측정 검증 변형
- 신호가 약할 때 (측정 대상 ≪ baseline) noise 가 이론값 방향으로 pull 되어 우연 성공 기록 → measurement-first 정정 우선

---

## 2. silent 가드 약화 의식적 트레이드오프 (#106)

### 배경

가드 임계값을 강제하면 1인 개발자에게 매주 트리거 발화 + 결정 강요 → 운영 피로 + silent skip 위험. **임계값을 의식적으로 완화** + **silent 가드 약화 트레이드오프 ADR §결정에 CRITICAL 명시** 하는 패턴.

### 운영 비용 추정 — 임계값 설계 시 박제 의무

| 발화 빈도 | 운영 피로 | 권고 |
|-----------|-----------|------|
| < 1/월 | 무시 가능 | 임계값 유지 |
| ~ 1/주 | 1인 운영 ≥ 30분/주 | 임계값 완화 검토 |
| ≥ 1/일 | critical | silent skip 위험 — 즉시 완화 |

가드 도입 PR 의 DoD 에 **"운영 비용 추정"** 명시 — 예상 발화 빈도 + 결정 시간.

### Amendment 박제 — silent 약화는 ADR 결정에 CRITICAL 명시

완화 자체를 ADR §결정에 CRITICAL 명시 → 미래 관찰자가 "왜 완화됐는지" 재발견 가능.

예시:

> Amendment N 은 트리거 발화 빈도를 줄이기 위한 의식적 silent skip 완화. **운영 피로 vs silent drift 검출의 트레이드오프를 1인 운영 현실에 맞게 조정**. silent drift 위험은 best-effort 로 수용 — {보강 메커니즘} 이 보강.

### 대안 비교 (검토 후 미채택 박제)

- **옵션 A (현 정책 유지)**: 운영 피로 누적 → silent skip 자연 발생 위험
- **옵션 B (가드 폐기)**: 가드 자체 폐기는 과잉 — 임계값 조정만 필요

### 일반화

- 가드 임계값은 **운영 비용 + silent drift 위험 + 결정 비용** 3축 최적화
- 1인 운영 / 소규모 팀 / 자동화 부재 도메인에서는 임계값 완화가 의식적 트레이드오프
- 가드 임계값 첫 박제 후 1~2주 실측 → 운영 피로 검출 시 Amendment 박제 (record-adr 스킬 §Amendment B 형식 참조)

---

## 3. Strict Assertion vs Fallback 자기모순 — fail-fast 만 (#107)

### 배경

drift 가드 (`create-pr` 스킬의 PR 템플릿 체크박스 자동 검증 등) 에 fallback 분기를 박제하면 strict assertion 의미가 무력화되는 자기모순. **fail-fast 만 박제** + fallback 제거가 정합.

### 자기모순 사례

초안 (fallback 박제):

```javascript
async function readPRTemplate() {
  try {
    return await readFile('.github/PULL_REQUEST_TEMPLATE.md', 'utf-8');
  } catch (err) {
    console.warn('PR template not found, using fallback base');
    return DEFAULT_TEMPLATE_BASE;  // ← fallback 분기
  }
}
```

자기모순:

- strict assertion 의도: "PR 본문 7 체크박스가 `PULL_REQUEST_TEMPLATE.md` 와 정확 일치하는지 검증"
- fallback 분기: 템플릿 파일 부재/오류 시 `DEFAULT_TEMPLATE_BASE` 로 대체
- → 파일 부재가 **가장 위험한 drift** 인데 fallback 이 그것을 silent skip ⇒ 가드 무력화

### 해결 — fail-fast 만

```javascript
async function readPRTemplate() {
  const content = await readFile('.github/PULL_REQUEST_TEMPLATE.md', 'utf-8');
  // 부재/오류 시 ENOENT 등 native error 가 그대로 throw → CI fail
  return content;
}
```

### 원칙 일반화 — drift 가드 설계 시

- **fallback = silent skip = 가드 무력화** ⇒ 절대 박제 금지
- 가드는 본질적으로 negative test 성격 → "정상 = pass, 비정상 = fail" 의 이분법
- "비정상이지만 fallback 으로 동작" 박제는 **strict assertion 의미 자체를 폐기**
- 운영 비용 (파일 부재 시 즉시 CI fail) 은 운영 측 책임 — 가드 측이 흡수하면 안 됨

### 구분 — strict assertion vs validation

| 구분 | 위치 | 의무 |
|------|------|------|
| **strict assertion** | 가드 측 (drift 감지) | fail-fast |
| **validation** | 사용자 입력 측 | graceful degradation 합리적 |

둘을 혼동하면 가드가 validation 흉내 내며 silent skip.

### 관련 패턴

- [comment-implementation-drift.md](comment-implementation-drift.md) — fallback 이 silent 흡수하는 변형 (주석 계약 vs 구현 drift)
- "fail loud, fail early" (defensive programming 원칙) 의 가드 측 적용
- harness 선례: `scripts/verify-release-version-bump.sh` (v2.28.1) — CHANGELOG 최신 entry ↔ `package.json::version` 불일치 시 즉시 exit 1, fallback 없음

---

## 4. 3개 원칙의 상호 보완

| 원칙 | 단계 | 방어 패턴 |
|------|------|-----------|
| §1 measurement-first | 가드 도입 직전 (architect → dev 핸드오프) | 권고 broad → 실측 precision |
| §3 fail-fast | 가드 구현 시점 | fallback 금지 |
| §2 silent 약화 트레이드오프 | 가드 운영 1~2주 후 | 운영 피로 검출 → Amendment |

3개 원칙은 **시간 축에서 직교** — 설계 / 구현 / 운영 단계 각각의 가드 무력화 패턴 차단.

---

## 근거

- volt [#101](https://github.com/coseo12/volt/issues/101) — astro-simulator PR #490 (ADR Z 패턴 자동 탐지) 에서 architect multi-OR keyword → dev D1 false-positive 5건 → dev D2 precision 정정 → 3중 박제
- volt [#106](https://github.com/coseo12/volt/issues/106) — ADR `20260515-harness-managed-divergent-pattern.md` Amendment 2 (PR #489) silent 약화 (N≥3 → N≥10, 30일 → 90일) 의식적 트레이드오프 박제
- volt [#107](https://github.com/coseo12/volt/issues/107) — astro-simulator PR #478 (`#471` create-pr Strict Assertion) 초안 fallback 분기 → reviewer 지적 → fail-fast 만 박제로 정정
- harness 선례: `scripts/verify-release-version-bump.sh` (v2.28.1) — CHANGELOG/`package.json` 불일치 즉시 exit 1, fallback 없음

## 관련 lessons

- [guard-pr-dod.md](guard-pr-dod.md) — 가드 작동 입증 4축 DoD
- [comment-implementation-drift.md](comment-implementation-drift.md) — fallback silent 흡수 변형
- [verify-script-authoring.md](verify-script-authoring.md) — bash 호환 + 격리 동적 테스트
