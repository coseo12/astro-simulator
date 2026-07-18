# 신규 데이터 ≠ 신규 코드 — ADR 예측 재현

> **요지**: CLAUDE.md 실전 교훈의 ADR Concrete Prediction 박제 블록 상세. 본문 요약은 CLAUDE.md `## 실전 교훈` 의 포인터 참조.
>
> **근거**: harness [#199](https://github.com/coseo12/harness-setting/issues/199) Phase 3-A 에서 추출.

---

## 개요

레이어/플러그인/스키마 구조 하에서 기능 확장이 "데이터만 추가, 코드 변경 0" 으로 가능한지 ADR 에 **Concrete Prediction** 으로 박제하면, 구현 시 추상화 건강성을 실증할 수 있다. "신규 함수 ≠ 신규 구현" 의 데이터 버전.

## 박제 형식

ADR 작성 시 예측 박제 형식:

```
{신규 엔티티/라우트/핸들러} 추가로 {핵심 모듈 경로} 의 코드 라인 변화 **0**
```

## 실측 재현 절차

- 실구현 PR 에서 `git diff --stat <추상화 계층 경로>` 로 재현 확인 — 예측 성공 시 기존 추상화가 올바르게 설계됐다는 **구체 증거**
- 예측 실패(= 계층 수정 필요) 시 두 갈래:
  1. 추상화가 부족하다는 신호 → 먼저 리팩토링 후 ADR 구현 재개
  2. 예외 케이스 인정 → ADR Amendment 박제

## 적용 시나리오

parentId 체인 / 플러그인 레지스트리 / 라우팅 테이블 / 스키마-주도 UI (form builder, dashboard) / i18n 번역 테이블 — **데이터로 확장하는 계층적 구조** 전반. 새 모듈/레이어를 만드는 결정에는 적용 불가 (확장이 이미 데이터로 흡수 가능한 상태가 전제).

## 근거

- volt [#47](https://github.com/coseo12/volt/issues/47) — astro-simulator P8 ADR `20260419-satellite-orbit-hybrid.md` 에 "포보스/데이모스 JSON 추가 → sim-canvas 코드 변경 0 줄" 예측 박제. PR-3 (#252) 에서 실측 재현 성공 — parentId 3계층 (scene graph / sidebar / camera) 이 모두 데이터로만 참조됨을 실증

## 흩어진 동일 상수 drift — 자동 생성 vs 정적 가드 구분 (volt #120)

같은 논리적 목록(예: 천체 body id)이 여러 파일에 하드코딩 사본으로 흩어지면 한 곳만 갱신하고 나머지를 누락하는 **drift 가 반복** 발생한다. "drift 를 감지"(매칭 가드)보다 **"drift 가 발생할 수 있는 중복 출처 자체를 제거"**(데이터 메타 SSoT + 자동 생성)가 근본 해결이다. 이는 위 "신규 데이터 ≠ 신규 코드" 의 drift 제거 측면 — 목록을 코드에 복제하지 않고 데이터 메타에서 파생한다.

### 해결 — 데이터 메타 SSoT

각 항목의 정적 속성을 **데이터 파일(JSON)에 메타로 부여**하고, 목록을 그 메타에서 파생한다.

- `introducedInRPhase: number` → `allowlist = bodies.filter(b => b.introducedInRPhase <= CURRENT_PHASE)` 자동 생성
- 진입 시 **상수 1줄**(`CURRENT_PHASE`)만 증가 → 목록 자동 확장. "신규 데이터 ≠ 신규 코드" Concrete Prediction 으로 다음 진입의 git diff 가 1줄임을 예측·실증.

### 핵심 설계 판단 — 모든 사본을 자동 생성하면 안 된다

두 부류로 갈린다:

1. **자동 생성 가능** — 단일 메타로 파생되고, 소비처가 SUT 모듈을 import 해도 되는 경우(예: allowlist). drift 표면 0.
2. **정적 가드로 묶어야 함** —
   - (a) **격리성 위반**: 검증 도구가 SUT 를 import 하면 테스트 더블이 SUT 에 의존 → 격리 깨짐.
   - (b) **직교 축**: 단일 메타로 안 풀리는 별개 차원. 예 — "focus 가능"(`introducedInRPhase`) ≠ "shortcut bar 노출"(`showInShortcutBar`). 위성은 focus 가능하나 모바일 너비 정책상 shortcut 미등록. 한 메타로 안 풀리므로 **별도 boolean 메타** 추가 + 정적 가드.
   - 이 경우 하드코딩은 유지하되 "데이터 파생 == 하드코딩" 단위 테스트로 drift 를 빌드 fail 로 차단.

### 안티패턴 — 중복 하드코딩으로 SSoT 위배

타입 안전성을 위해 union literal 을 별도 const 튜플로 추출하려다 데이터와 **중복 하드코딩**이 생기면 drift 제거 취지에 역행한다. 소비처가 그 타입을 실제로 쓰는지(`grep` 실측) 확인하고, 안 쓰면 `string` 으로 약화 + 런타임 가드로 방어하는 게 SSoT 정합상 우월할 수 있다.

### 구현 함정 — JSON 데이터 편집 시 포맷 보존

`python json.load` → `json.dump` round-trip 은 값은 보존하나 **원본 compact 포맷을 파괴**한다(`6.957e8` → `695700000.0`, inline 객체를 다중 줄로 펼침). diff 가 수백 줄 노이즈로 오염된다. **텍스트 기반 삽입**(특정 키 줄 다음에 새 줄 삽입)으로 원본 포맷을 보존하고, 별도로 `json.load` deep-compare 로 값 무손실을 검증하라.

### 가드 도입 시 3중 시뮬레이션

정적 매칭 가드를 추가할 때 positive(현재 정합 PASS)만 확인하면 가드가 실제로 동작하는지 모른다. **positive → negative(일부러 drift 주입 → FAIL 확인) → recovery(복원 → PASS)** 3중 시뮬레이션으로 가드 작동을 실증한다([guard-pr-dod.md](guard-pr-dod.md) §3 참조).

### 근거 (#120)

- volt [#120](https://github.com/coseo12/volt/issues/120) — astro-simulator #613(introducedInRPhase 자동 생성) / #617(showInShortcutBar 직교 축 정적 가드) / #619(targetIds 은닉 상수 가드). 선행 교훈 "은닉 상수 변형"(volt [#69](https://github.com/coseo12/volt/issues/69))의 근본 제거 진화형.

## 관련

- 스킬 절차: [.claude/skills/record-adr/SKILL.md](../../.claude/skills/record-adr/SKILL.md) "Concrete Prediction" 섹션 — ADR `## 결과·재검토 조건` 에 박제하는 포맷 템플릿
