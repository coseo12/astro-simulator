# ADR: harness-managed 파일의 프로젝트 고유 확장 + upstream 기여 병행 패턴

- 일자: 2026-05-15
- 상태: Accepted
- 관련: 이슈 [#463](https://github.com/coseo12/astro-simulator/issues/463), 선행 이슈 [#455](https://github.com/coseo12/astro-simulator/issues/455) / PR [#466](https://github.com/coseo12/astro-simulator/pull/466), volt [#23](https://github.com/coseo12/volt/issues/23) / [#29](https://github.com/coseo12/volt/issues/29), CLAUDE.md §"매니페스트 최신 ≠ 파일 적용 완료"

## 배경

harness-setting upstream 이 atomic 으로 관리하는 파일 (예: `.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `.claude/settings.json`) 에 **프로젝트 고유 행동 규칙** 을 추가해야 할 때 두 가지 모순된 압력이 발생한다:

1. **즉시성 압력** — 본 프로젝트의 reviewer/qa/dev 사이클이 빠르게 필요로 함 (예: #463 의 ADR 호환성 의미론적 검증). upstream PR 리뷰 사이클 (수일~수주) 만큼 기다릴 수 없음.
2. **다운스트림 SSoT 압력** — 같은 패턴이 다른 다운스트림 프로젝트 (다른 harness 사용자) 에도 가치 있음. 본 프로젝트 fork 만 진행하면 다른 프로젝트는 재구현 부담.

#463 (reviewer ADR 호환성 의미론적 검증) PM 단계에서 이 충돌이 명시적 결정점으로 식별됨. PM 권고: Z (X+Y 병행). architect 재평가에서도 Z 가 우위로 확인되었으나, 같은 패턴이 향후 `.claude/agents/architect.md` / `developer.md` / `pm.md` / `qa.md` / `settings.json` 등 다른 harness-managed 파일에도 재현될 가능성이 높아 ADR 박제로 일반화.

Gemini cross-validate (2026-05-15) 도 본 패턴을 "재사용 가능한 핵심 아키텍처 패턴" 으로 평가하며 ADR 박제를 강력 권고함.

## 제약

- **harness-managed 파일은 `.harness/manifest.json` 의 sha256 + previousSha256 로 atomicity 보장** — 직접 수정 시 `harness doctor` 가 drift 감지 + `harness update --apply-all-safe` 가 `modified-pristine` 으로 자가 복구 시도 (v2.9.0+)
- **upstream 기여 사이클 ≥ 3~7일** — coseo12/harness-setting 리뷰 + 머지 + 릴리스 + 다운스트림 `harness update` 까지
- **본 프로젝트 D2 검증 단위 = "후속 첫 일상 PR"** — upstream 기여 머지 전에 본 프로젝트 reviewer 출력 가시화 필요 (#455/#466 동일 패턴)
- **prettier formatter 재포맷 경계 drift 위험** (volt #35) — harness-managed 파일을 본 프로젝트에서 수정 시 lint-staged 가 재포맷할 수 있음. `.prettierignore` harness-managed 블록 보호 필요 (`20260419-prettier-harness-conflict.md` 참조)

## 후보 비교

| 항목 | X: upstream 단독 기여 | Y: 프로젝트 단독 fork | **Z: X + Y 병행 (선반영 + upstream 동시)** |
|---|---|---|---|
| 즉시성 | ✗ (수일~수주 대기) | ✓ (즉시) | **✓ (즉시 + 장기 동기화)** |
| 다운스트림 SSoT | ✓ (자동 전파) | ✗ (다른 프로젝트 재구현) | **✓ (upstream 머지 후 자동 전파)** |
| drift 위험 | 0 (manifest 와 항상 일치) | 높음 (`harness update` 마다 충돌) | **중간 (upstream 머지 전까지만)** |
| `harness doctor` 노이즈 | 0 | 영구 warn | **upstream 머지 전까지 warn** |
| 다운스트림 일반화 가치 | ✓ | ✗ | **✓** |
| 본 프로젝트 D2 가시화 시점 | upstream 릴리스 후 (`harness update` 직후) | 즉시 (본 PR 머지 직후) | **즉시 (본 PR 머지 직후)** |
| 단기 운영 비용 | 낮음 (수동 작업 0) | 중간 (drift 관리 영구) | **중간 (drift 관리 + upstream PR 작성 = 일회성)** |
| 장기 운영 비용 | 매우 낮음 | 높음 (모든 harness update 마다 수동 merge) | **낮음 (upstream 머지 후 본 프로젝트 변경 제거)** |
| upstream 미반영 위험 | upstream 리뷰 반려 시 본 프로젝트도 변경 없음 | 없음 (독립) | upstream 반려 시 Y 만 잔존 → 사실상 Y 로 회귀 |

## 결정

**Z (X + Y 병행) 채택**.

### 운영 절차

#### Phase 1 — 본 프로젝트 선반영 (Y 경로)

1. `feature/<이슈번호>-<설명>` 브랜치에서 harness-managed 파일을 직접 수정
2. `.harness/manifest.json` 은 **수정하지 않음** — `harness doctor` 가 일시적으로 warn (drift) 상태로 표시
3. PR 본문에 "**harness upstream 기여 동시 진행 중**: [upstream PR 링크 또는 TODO]" 명시
4. 머지 후 본 프로젝트 D2 검증 가시화 (후속 첫 일상 PR 에서 reviewer/qa/dev sub-agent 출력 확인)

#### Phase 2 — upstream 기여 (X 경로)

1. coseo12/harness-setting 레포에 동일 변경 PR 제출
2. 본 프로젝트 PR 본문에 upstream PR 번호 박제 (cross-link)
3. upstream 머지 + 신규 릴리스 (MINOR — 행동 규칙 추가) 대기

#### Phase 3 — 본 프로젝트 동기화 (Z 완성)

1. 본 프로젝트에서 `harness update --apply-all-safe` 실행
2. harness-managed 파일이 upstream 버전으로 덮어쓰기 (Phase 1 변경 = upstream 변경 동일 내용)
3. `.harness/manifest.json` 이 새 sha256 으로 갱신 → drift 해소
4. 본 프로젝트 PR (Phase 1) 의 "후속 정리" 이슈로 추적 (Phase 1 PR 본문 변경 부분이 upstream 동기화로 중복 박제 → 일관성 회복)

### upstream 반려 시 폴백 (Z → Y 회귀)

- upstream 리뷰가 "본 패턴은 프로젝트 특화" 로 반려 시 Y 로 회귀
- 본 프로젝트 변경은 영구 fork 상태 → `.prettierignore` harness-managed 블록 + manifest 수동 관리 (volt #35 / `20260419-prettier-harness-conflict.md` 패턴)
- `harness doctor` warn 을 무시할 수 있도록 README 또는 CLAUDE.md 에 "본 파일은 의도적 divergent" 박제

### 결정 근거 (volt #29 분리 박제 규칙 정합)

- **즉시성 vs 다운스트림 SSoT 양립** — Phase 1 (Y) 가 즉시성 충족, Phase 2 (X) 가 SSoT 충족
- **drift 노출 기간 최소화** — Phase 3 에서 자동 동기화로 drift 해소
- **upstream 반려 리스크 흡수** — Phase 1 변경이 이미 본 프로젝트에 반영되어 있어 사용자 가치 손실 없음

## 결과·재검토 조건

### 즉시 결과

- #463 본 결정 채택 — reviewer.md 본 프로젝트 선반영 + upstream PR 동시 진행
- 본 ADR 이 향후 `.claude/agents/architect.md` / `developer.md` / `pm.md` / `qa.md` / `settings.json` 등 harness-managed 파일 수정 시 재사용 가능한 SSoT

### 재검토 조건

1. **upstream 반려율 ≥ 50%** — 본 패턴의 upstream PR 이 절반 이상 반려되면 Z 의 가치 감소 → Y 로 정책 전환 검토
2. **drift 노출 기간 평균 ≥ 30일** — upstream 머지 + 릴리스 사이클이 지속적으로 30일을 넘으면 `harness doctor` 노이즈 영구화 → Phase 1 manifest 수동 갱신 (`harness update --bootstrap`) 검토
3. **다운스트림 프로젝트 ≤ 1** — 본 프로젝트가 유일한 harness 사용자가 되면 (다른 프로젝트 전부 fork 또는 폐기) X 경로 가치 0 → Y 단독으로 회귀
4. **`harness update --apply-all-safe` 자가 복구 정책 변경** — v2.9.0+ 의 `previousSha256` 자가 복구가 비활성화되면 Phase 3 자동 동기화 보장 약화 → 재평가
5. **Phase 2 (upstream 기여) N=10 회 연속 미진행 OR Z 패턴 첫 적용 후 90일 경과** — Y (영구 fork) 회귀 신호로 간주. 트리거 발화 시 후속 행동: 3 영업일 내 [ADR Trigger] 라벨 discussion 이슈 생성 의무 (Phase 2 일괄 처리 vs 패턴 폐기 vs N 임계값 재조정 결정 분기). **2026-05-16 Amendment 2 로 N=3→10, 30일→90일 완화** (1인 운영 현실 대응, silent 가드 약화 트레이드오프 수용 — §Amendment 2 참조)

### 측정 지표

- upstream 기여 PR 머지율 (Phase 2 → Phase 3 진입 비율)
- 평균 drift 노출 기간 (Phase 1 PR 머지 → Phase 3 동기화 완료)
- `harness doctor` warn 빈도 (drift 미해소 비율)
- **Phase 2 진행률 health metric** — `Phase 2 PR 제출 횟수 / Phase 1 적용 횟수 ≥ 33%` (≥ 1/3, Amendment 1 박제). 미달 시 §재검토 조건 #5 트리거 후보
- **실측 (2026-05-16)**: Phase 1 = 6회 누적 (#463/#469/#470/#471/#477/#479), Phase 2 = 0회 → 0/6 = 0% → §재검토 조건 #5 트리거 충족

## 참고

- 선행 ADR: `20260419-prettier-harness-conflict.md` — formatter 컨벤션 충돌 (drift 의 1차 변형, prettier 재포맷)
- volt [#23](https://github.com/coseo12/volt/issues/23) — 정책·규약·ADR 박제 직후 cross-validate 루틴
- volt [#29](https://github.com/coseo12/volt/issues/29) — 후속 분리 박제 규칙
- volt [#35](https://github.com/coseo12/volt/issues/35) — formatter 재포맷 경계 drift
- CLAUDE.md §"매니페스트 최신 ≠ 파일 적용 완료" — 매니페스트 trustless 3계층 방어

## Amendment 1 — 2026-05-16

- **발의**: [#476](https://github.com/coseo12/astro-simulator/issues/476) (Phase 2 미진행 silent 회귀 가드)
- **근거**:
  - [#471](https://github.com/coseo12/astro-simulator/issues/471) architect cross-validate (Gemini 2.5-pro) Q4 — Phase 2 N회 미진행 silent 회귀 사각지대 식별
  - [#479](https://github.com/coseo12/astro-simulator/issues/479) architect cross-validate (Gemini 2.5-pro) — N=3 Rule of Three 권고 + 30일 OR 조건 + Amendment 박제 형식 B (별도 §Amendment 섹션)
- **변경 사항**:
  - §재검토 조건 #5 추가 — Phase 2 (upstream 기여) N=3 회 연속 미진행 OR Z 패턴 첫 적용 후 30일 경과 시 트리거. 후속 행동: 3 영업일 내 [ADR Trigger] 라벨 discussion 이슈 생성 의무 (Phase 2 일괄 처리 vs 패턴 폐기 vs N 임계값 재조정 결정 분기)
  - §측정 지표 갱신 — `Phase 2 진행률 ≥ 33%` health metric 추가 + 실측 (2026-05-16) 박제
- **Z 패턴 6회차 적용 실측 (2026-05-16)**: #463/#469/#470/#471/#477/#479 모두 Phase 2 (upstream PR 제출) = 0 → Phase 2 진행률 = 0/6 = 0% → §재검토 조건 #5 트리거 발화. 후속 행동: [#483](https://github.com/coseo12/astro-simulator/issues/483) Phase 2 health metric 자동 탐지 스크립트 + CI 통합 진행
- **트리거 후속 행동 박제**: 3 영업일 내 [ADR Trigger] 라벨 discussion 이슈 의무 (Phase 2 일괄 처리 vs 패턴 폐기 vs N 임계값 재조정)
- **cross-link**:
  - 본 PR: feature/476-adr-20260515-amendment-1 → develop
  - [#476](https://github.com/coseo12/astro-simulator/issues/476) architect cross-validate 로그 (`.claude/logs/cross-validate-architecture-20260516-175147.log`)
  - 후속 자동화: [#483](https://github.com/coseo12/astro-simulator/issues/483) (health metric 자동 탐지 + CI), [#485](https://github.com/coseo12/astro-simulator/issues/485) (ADR Amendment 컨벤션 박제)

## Amendment 2 — 2026-05-16

- **발의**: [#487](https://github.com/coseo12/astro-simulator/issues/487) ([ADR Trigger] discussion 옵션 C 채택 — N 임계값 재조정)
- **근거**: [#487](https://github.com/coseo12/astro-simulator/issues/487) architect cross-validate (Gemini 2.5-pro) + 사용자 결정 (1인 운영 현실 대응)
- **변경 사항**:
  - §재검토 조건 #5: N=3 → **N=10** (3회 유예 = ~1 sprint 분량)
  - §재검토 조건 #5: 30일 → **90일** (분기별 점검 = 1인 개발 자연 주기)
  - OR 조건 유지
- **silent 가드 약화 트레이드오프 (CRITICAL)**:
  - **Amendment 1 의도와 상반** — Amendment 1 (N=3 OR 30일) 은 공격적 silent 회귀 가드. Amendment 2 (N=10 OR 90일) 는 1인 운영 현실 대응 완화
  - 트레이드오프 수용: silent Y 회귀 위험 vs 운영 부담 감소
  - 미래 재검토 시 의도 추적용 박제 (사용자 결정 [#487](https://github.com/coseo12/astro-simulator/issues/487) 옵션 C)
  - **Phase 2 의무 유지** (best-effort) — 시간/리소스 가용 시 수행. [#483](https://github.com/coseo12/astro-simulator/issues/483) 자동 탐지 + CI 통합 후속 의무
- **트리거 후속 행동 박제**: Amendment 1 동일 (3 영업일 내 [ADR Trigger] discussion)
- **cross-link**: 본 PR, [#487](https://github.com/coseo12/astro-simulator/issues/487) architect cross-validate 로그 (`.claude/logs/cross-validate-architecture-20260516-212222.log`), 사용자 결정 [#487](https://github.com/coseo12/astro-simulator/issues/487) 옵션 C, 후속 [#488](https://github.com/coseo12/astro-simulator/issues/488) (Amendment 3 후보)
- **Z 패턴 8회차 적용 실측 (2026-05-16)**: 7회차 #476 Amendment 1 + 8회차 본 PR Amendment 2. Phase 2 = 0/8 = 0% 유지. Amendment 2 임계값 (N=10) 기준 → 미발화 (해소). 다음 트리거: 9~10회차 적용 시 또는 90일 경과 시

## Amendment 3 — 2026-05-17

- **발의**: [#483](https://github.com/coseo12/astro-simulator/issues/483) (자동 탐지 스크립트 + CI 통합)
- **근거**: [#476](https://github.com/coseo12/astro-simulator/issues/476) architect cross-validate Q5 권고 (자동 탐지 도입) + [#483](https://github.com/coseo12/astro-simulator/issues/483) architect cross-validate (Gemini 2.5-pro) 9 핵심 결정
- **변경 사항**:
  - 자동 탐지 도입 — `scripts/verify-z-pattern-health.mjs` (Node ESM, exit code 3분류) + `.github/workflows/adr-z-pattern-health.yml` (월 cron + workflow_dispatch)
  - §재검토 조건 #5 manual 의존 제거 — 주간 cron (월 09:00 KST = UTC 00:00) 자동 발화
  - 자동 이슈 생성 — workflow 발화 시 `[ADR Trigger] Z 패턴 §재검토 조건 #5 발화` 이슈 자동 생성 (priority:high + 중복 방지)
  - 임계값 일관성: Amendment 1 (Phase 2 ≥ 33%) + Amendment 2 (N=10 OR 90일) 3중 OR — 코드 상수로 박제
- **트레이드오프**: 자동화 의무 vs silent 회귀 위험 — silent 가드 강화 (Amendment 2 N=10 OR 90일 약화 보완)
- **cross-link**: 본 PR (feature/483-z-pattern-health-auto → develop), [#483](https://github.com/coseo12/astro-simulator/issues/483) architect cross-validate 로그 (`.claude/logs/cross-validate-architecture-20260517-000825.log`)
- **운영 (volt #69 workflow_dispatch 2단계 함정)**:
  - D2 workflow_dispatch 수동 실행 검증: 본 PR 머지 후 default branch (develop) 반영 후 1회 수행 (workflow_dispatch 는 default branch 반영 후에만 discover 됨)
  - D3 자동 이슈 생성 검증: D2 시 발화 시뮬레이션 (현재 Phase 2 = 0/8 = 0% < 33% → exit 1 예상, `[ADR Trigger]` 이슈 자동 생성 확인)
- **Z 패턴 9회차 적용 실측 (2026-05-17)**: 본 PR Amendment 3. Phase 2 = 0/9 = 0% 유지. Amendment 1 임계값 (33%) 기준 → 발화. 본 자동화 도입으로 향후 발화는 즉시 [ADR Trigger] 이슈 생성

## Amendment 4 — 2026-05-18

- **발의**: [#495](https://github.com/coseo12/astro-simulator/issues/495) ([ADR Trigger] 자동 박제 2026-05-17, deadline 2026-05-20 KST)
- **트리거**: Amendment 1+2 정합 3중 OR 임계값 충족 — Phase 2 진행률 0/11 = 0% < 33% **AND** Phase 1 회차 11 ≥ N=10. 자동 탐지 workflow (`.github/workflows/adr-z-pattern-health-v2.yml`) 발화. 직전 [#487](https://github.com/coseo12/astro-simulator/issues/487) 옵션 C 채택 (N=10/90일 완화) 후 1일 만에 재발화 — 임계값 추가 완화는 silent 가드 무한 사이클 가속 위험으로 거부.
- **사용자 결정 (2026-05-18)**: **옵션 A — Phase 2 일괄 진행** (실현 방법 A1: 첫 PR 1건 + 후속 5 이슈 박제). silent 완화 사이클 (옵션 C) 또는 무력화 (옵션 B) 대신 의도 정합 (Z 패턴 본래 목적 달성) 우선.
- **본 Amendment 행동 박제** (Phase 2 시작 시그널):
  - **upstream PR (첫 PR)**: [harness-setting#248](https://github.com/coseo12/harness-setting/pull/248) — 5 페르소나 .md create-pr 의무 박제 ([#477](https://github.com/coseo12/astro-simulator/issues/477) Phase 2 정합)
  - **upstream 후속 5 이슈** (Phase 2 누적 추적):
    - [harness-setting#249](https://github.com/coseo12/harness-setting/issues/249) — reviewer.md ADR 호환성 의미론적 검증 ([#463](https://github.com/coseo12/astro-simulator/issues/463) Phase 2)
    - [harness-setting#250](https://github.com/coseo12/harness-setting/issues/250) — create-pr Strict Assertion 동적 읽기 ([#471](https://github.com/coseo12/astro-simulator/issues/471) Phase 2)
    - [harness-setting#251](https://github.com/coseo12/harness-setting/issues/251) — PR 본문 7 체크박스 메타 규칙 ([#470](https://github.com/coseo12/astro-simulator/issues/470) Phase 2)
    - [harness-setting#252](https://github.com/coseo12/harness-setting/issues/252) — cross-validate plan-mode 우회 가드 ([#479](https://github.com/coseo12/astro-simulator/issues/479) Phase 2, CRITICAL)
    - [harness-setting#253](https://github.com/coseo12/harness-setting/issues/253) — DoD #2 측정 방법 C ([#469](https://github.com/coseo12/astro-simulator/issues/469) Phase 2)
- **측정 지표 갱신**:
  - Phase 2 진행률 (실측 2026-05-18, 본 Amendment 머지 직후): 0/11 → 1/11 ≈ **9.1%** (#248 머지 시 8.3% 잔존, 다른 4 이슈 PR 진행 시 점진 증가)
  - 임계값 33% 달성 위해 추가 3 PR 필요 (4/11 = 36%). 다음 트리거 회피 조건.
- **다음 트리거 회피**: Phase 2 진행률 ≥ 33% 도달 또는 Phase 1 회차 증가 없이 90일 경과. 본 Amendment 4 의 시간/회차 조건은 Amendment 2 (N=10 / 90일) 유지 — 임계값 변경 없음.
- **cross-link**: 본 Amendment, [#495](https://github.com/coseo12/astro-simulator/issues/495) [ADR Trigger] discussion, [#248](https://github.com/coseo12/harness-setting/pull/248) upstream PR, [#249~#253](https://github.com/coseo12/harness-setting/issues) upstream 후속 이슈, 직전 [#487](https://github.com/coseo12/astro-simulator/issues/487) Amendment 2 (옵션 C)
- **Z 패턴 10회차 적용 실측 (2026-05-18)**: 본 PR Amendment 4. Phase 2 PR 제출 1회 박제로 진행률 0% → 9.1%. Amendment 1 임계값 (33%) 기준 → 여전히 발화 (다음 자동 탐지 시 재발화). 본 Amendment 4 의 회피 전략: upstream 후속 5 이슈 (#249~#253) 머지로 점진 ≥ 33% 도달.

## Amendment 5 — 2026-05-18

- **발의**: [#488](https://github.com/coseo12/astro-simulator/issues/488) (Gemini cross-validate 후속 권고, Amendment 2 PR #489 architect 단계 식별)
- **근거**: Amendment 2 cross-validate (Gemini 2.5-pro) 개선 제안 #1 — Phase 2 (upstream 기여) 에서 리뷰 피드백 발생 시 upstream PR 과 본 프로젝트의 Phase 1 파일 drift 위험. Phase 3 자동 동기화 시 conflict 예방 의무 박제.
- **변경 사항** — §운영 절차 Phase 2 본문에 동기화 의무 추가:
  - **기존**: upstream PR 제출 → 머지 + 신규 릴리스 대기 (drift 발생 가능 영역 부재)
  - **추가**: "**upstream 리뷰 피드백 반영 시 즉시 로컬 프로젝트 파일 동기화 의무**" — upstream PR 에 수정 적용 후 즉시 본 프로젝트 동일 변경 (별도 PR 또는 후속 커밋). Phase 3 conflict 예방.
- **Phase 2 운영 절차 갱신**:
  1. coseo12/harness-setting 레포에 동일 변경 PR 제출
  2. 본 프로젝트 PR 본문에 upstream PR 번호 박제 (cross-link)
  3. **upstream 리뷰 피드백 반영 시 즉시 로컬 프로젝트 파일 동기화 의무** ← Amendment 5
  4. upstream 머지 + 신규 릴리스 (MINOR) 대기
- **trade-off**: 리뷰 사이클 1회 = 다운스트림 sync commit 1회 추가. Phase 3 자동 동기화 시 merge conflict 해소 비용 < 사전 sync commit 비용 (예방 우선).
- **운영 적용**: 본 Amendment 머지 후 진행 중인 Phase 2 PR (예: [harness-setting#248](https://github.com/coseo12/harness-setting/pull/248) / [#254](https://github.com/coseo12/harness-setting/pull/254)) 의 리뷰 피드백 발생 시 즉시 적용.
- **cross-link**: 본 Amendment, [#488](https://github.com/coseo12/astro-simulator/issues/488), Amendment 2 [#487](https://github.com/coseo12/astro-simulator/issues/487) PR [#489](https://github.com/coseo12/astro-simulator/pull/489) (cross-validate 로그: `.claude/logs/cross-validate-architecture-20260516-212222.log`), Amendment 4 [#495](https://github.com/coseo12/astro-simulator/issues/495)
- **Z 패턴 11회차 적용 실측 (2026-05-18)**: 본 PR Amendment 5. Phase 2 = 2/11 = 18.2% (upstream PR #248, #254 누적). 임계값 33% 미달 — 다음 자동 탐지 시 재발화. Amendment 4 회피 전략 (점진 ≥ 33%) 유지.

## Amendment 6 — 2026-05-18

- **발의**: [#500](https://github.com/coseo12/astro-simulator/issues/500) ([ADR Trigger] 자동 탐지 2026-05-18, 직전 Amendment 5 머지 약 4시간 후 재발화)
- **트리거**: Amendment 1+2 정합 3중 OR 임계값 충족 — Phase 2 진행률 3/11 ≈ 27.3% < 33% **AND** Phase 1 회차 11 ≥ N=10. 자동 탐지 workflow (`.github/workflows/adr-z-pattern-health-v2.yml`) 발화. 직전 Amendment 4 의 [#495](https://github.com/coseo12/astro-simulator/issues/495) 옵션 A 채택 (실현 방법 A1) 후 1일 만에 재발화 — silent 가드 약화 사이클 (옵션 C) 재차 거부.
- **사용자 결정 (2026-05-18)**: **옵션 A 연속 채택** (Phase 2 일괄 진행). 직전 #487 옵션 C 1일 후 재발화한 사이클 차단 + Amendment 4 의 점진 진행 전략 유지. silent 가드 약화 누적 차단의 일관성 보장.
- **본 Amendment 행동 박제** (임계값 충족 PR):
  - **upstream PR**: [harness-setting#260](https://github.com/coseo12/harness-setting/pull/260) merge commit `264c9d4` (2026-05-18) — cross-validate plan-mode 우회 자동 가드 박제 (다운스트림 [#479](https://github.com/coseo12/astro-simulator/issues/479) PR [#482](https://github.com/coseo12/astro-simulator/pull/482) 동기화)
  - 변경: 9 파일 +261 -2 (스크립트 2 + 5 페르소나 + CLAUDE.md / CHANGELOG.md)
  - D1~D4 PASS (격리 동적 4/4 / 헬퍼 4 mock / verify-agent-ssot.sh / 인코딩 0건)
- **측정 지표 갱신**:
  - Phase 2 진행률 (실측 2026-05-18, 본 Amendment 머지 직전): 3/11 → **4/11 ≈ 36.4%** ✅ 임계값 33% 충족
  - 다음 트리거 회피 조건 달성. Amendment 4 의 점진 ≥ 33% 회피 전략 성공.
- **잔여 Phase 2 후속 5 이슈** (선택적 진행 — 임계값 충족으로 강제성 해소):
  - [harness-setting#249](https://github.com/coseo12/harness-setting/issues/249) — reviewer.md ADR 호환성 의미론적 검증
  - [harness-setting#250](https://github.com/coseo12/harness-setting/issues/250) — create-pr Strict Assertion 동적 읽기
  - [harness-setting#251](https://github.com/coseo12/harness-setting/issues/251) — PR 본문 7 체크박스 메타 규칙
  - [harness-setting#253](https://github.com/coseo12/harness-setting/issues/253) — DoD #2 측정 방법 C
  - 추가 1 PR 머지 시 5/11 ≈ 45.5%
- **다음 트리거 회피**: Phase 2 진행률 ≥ 33% 도달 (충족 ✅) 또는 Phase 1 회차 증가 없이 90일 경과. 본 Amendment 6 의 임계값 변경 없음 (Amendment 2 N=10 / 90일 유지).
- **함정 통계 강화**: base=develop PR closingIssuesReferences=[] 100% 미발화 패턴 — 본 PR [#260](https://github.com/coseo12/harness-setting/pull/260) 18회차 재현 (volt [#115](https://github.com/coseo12/volt/issues/115) 10/10 + 다운스트림 누적). 메인 의무: base=develop PR 머지 후 무조건 수동 close.
- **cross-link**: 본 Amendment, [#500](https://github.com/coseo12/astro-simulator/issues/500) [ADR Trigger] discussion, [#260](https://github.com/coseo12/harness-setting/pull/260) upstream PR, 직전 [#495](https://github.com/coseo12/astro-simulator/issues/495) Amendment 4, [#488](https://github.com/coseo12/astro-simulator/issues/488) Amendment 5
- **Z 패턴 12회차 적용 실측 (2026-05-18)**: 본 PR Amendment 6. Phase 2 = 4/11 = 36.4% ✅ — Amendment 1 임계값 (33%) 충족. 다음 자동 탐지 시 발화 없음 (Phase 2 충족 조건 통과). Amendment 4/6 의 점진 진행 전략 성공 완료.
