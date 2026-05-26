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
2. **수정 파일 첫 줄 (shebang/DOCTYPE 직후 1줄 허용) 에 HARNESS-DRIFT 데코레이터 주석 박제** — Amendment 8 (cross-validate trustless 영속화 권고). 형식: 파일 형식별 분기 (`.md` = HTML 주석 / `.json` = sidecar `.HARNESS-DRIFT.md` / `.ts|mjs|js|yml` = line comment). 본문 형식: `HARNESS-DRIFT: Z-PATTERN [upstream-link-or-TODO]`. upstream PR 미생성 시 `[TODO]` 허용 (Phase 2 머지 직후 실제 링크로 교체 의무). 자동 가드: `scripts/verify-harness-drift-decorator.mjs` (PR check + 로컬 사전 검증). 자세한 SSoT regex: §Amendment 8
3. `.harness/manifest.json` 은 **수정하지 않음** — `harness doctor` 가 일시적으로 warn (drift) 상태로 표시
4. PR 본문에 "**harness upstream 기여 동시 진행 중**: [upstream PR 링크 또는 TODO]" 명시
5. 머지 후 본 프로젝트 D2 검증 가시화 (후속 첫 일상 PR 에서 reviewer/qa/dev sub-agent 출력 확인)

#### Phase 2 — upstream 기여 (X 경로)

1. coseo12/harness-setting 레포에 동일 변경 PR 제출
2. 본 프로젝트 PR 본문에 upstream PR 번호 박제 (cross-link) + Phase 1 데코레이터 주석의 `[upstream-link]` 필드를 실제 URL 로 교체 (Phase 1 단계 2 의 `[TODO]` 해소)
3. **upstream 리뷰 피드백 반영 시 즉시 로컬 프로젝트 파일 동기화 의무** (Amendment 5)
4. **자동 정적 비교 가드** — Amendment 8 (cross-validate Phase 2 중도 변경 추적 권고). `scripts/verify-z-pattern-health.mjs` 의 `verifyPhase2Sync()` 함수가 월 cron 시점에 upstream open PR head SHA 와 로컬 drift 파일 SHA 를 비교. 차이 발견 시 [Phase 2 Sync Required] 라벨 부착 + 자동 코멘트 (soft-warn, hard-block 아님 — Amendment 2/6 1인 운영 트레이드오프 정합)
5. upstream 머지 + 신규 릴리스 (MINOR — 행동 규칙 추가) 대기

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
5. **Phase 2 (upstream 기여) N=10 회 연속 미진행 OR Z 패턴 첫 적용 후 90일 경과** — Y (영구 fork) 회귀 신호로 간주. 트리거 발화 시 후속 행동: 3 영업일 내 [ADR Trigger] 라벨 discussion 이슈 생성 의무 (Phase 2 일괄 처리 vs 패턴 폐기 vs N 임계값 재조정 결정 분기). **2026-05-16 Amendment 2 로 N=3→10, 30일→90일 완화** (1인 운영 현실 대응, silent 가드 약화 트레이드오프 수용 — §Amendment 2 참조). **2026-05-25 Amendment 7 로 Phase 1 카운트 측정 식 정정** — ADR 자체 진화 PR (Amendment 박제 / hotfix / release) 제외하여 자기참조 인플레이션 회피 (§Amendment 7 참조). **2026-05-26 Amendment 8 로 Phase 1 드리프트 가시화 + Phase 2 중도 변경 정적 비교 가드 박제** — HARNESS-DRIFT 데코레이터 주석 의무 (`<!-- HARNESS-DRIFT: Z-PATTERN [upstream-link] -->`) + Phase 2 중도 drift 자동 비교 (Amendment 5 보완, soft-warn 라벨 부착) — silent 가드 강화 방향. 측정 식 / N 임계 / 90일 임계 변경 없음 (§Amendment 8 참조).
6. **동시 활성 drift 파일 수 ≥ N=10** — 본 ADR Z 패턴이 반복 적용되어 `.harness/manifest.json` 의 sha256 과 불일치하는 활성 drift 파일이 N=10 개를 동시에 초과하면 경고 피로감 (Alert Fatigue) 위험으로 간주. 트리거 발화 시 후속 행동: 3 영업일 내 [Alert Fatigue Trigger] 라벨 discussion 이슈 생성 의무 (Phase 2 가속 / 일부 Phase 1 revert / N 임계값 재조정 결정 분기). **2026-05-26 Amendment 9 박제** — drift 카운트 차원 (활성 drift 파일 수) 은 본 #6 / Phase 2 진행률 시간/누적 차원은 #5. 둘은 직교 (서로 다른 축으로 silent 회귀 신호 포착). soft-warn (라벨 + 자동 이슈, CI hard-block 아님) — Amendment 8 §결정점 3b 옵션 A 정합 답습. 측정 식 / N 임계 / 90일 임계 (#5) 변경 없음 (§Amendment 9 참조).

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

## Amendment 7 — 2026-05-25

- **발의**: [#554](https://github.com/coseo12/astro-simulator/issues/554) ([ADR Trigger] 자동 박제 2026-05-25, deadline 2026-05-28 KST)
- **트리거 발화 사유**: Amendment 1+2 정합 3중 OR 중 **단일 발화** — Phase 1 회차 12 ≥ N=10 임계. 단, Phase 2 진행률은 33.3% ≥ 33% 충족 (Amendment 1 미발화), 시간 경과 10일 (Amendment 2 미발화).
- **사용자 결정 (2026-05-25)**: **옵션 D — 측정 방법 정정** (메타 옵션). CLAUDE.md §스프린트 계약 #10 "수치 DoD 미달 시 측정 방법 검증 우선" 원칙 직접 적용. silent 가드 추가 약화 (옵션 C) 또는 Phase 2 강제 진행 (옵션 A) 대신 **측정 식의 자기참조 인플레이션 결함** 정정 우선.

### 측정 결함 forensic

기존 측정 식 (`scripts/verify-z-pattern-health.mjs:53`):

```javascript
const phase1Count = Math.max(amendmentCount, adrCitations);
```

여기서 `adrCitations` 는 본 ADR 의 파일명 (`20260515-harness-managed-divergent-pattern`) 을 인용한 모든 머지된 PR 카운트. 그러나 ADR 본문 자체를 변경하는 메타 PR (Amendment 박제 / 자동화 hotfix / 릴리스) 도 동일 파일명을 인용하므로 카운트 인플레이션 발생.

**Phase 1 = 12 PR 분류 실측** (2026-05-25):

| 분류 | PR 수 | PR 번호 | Z 패턴 적용? |
|---|---|---|---|
| **실제 Z 패턴 적용** | **6** | #468 #472 #475 #478 #481 #482 | ✓ Phase 1 |
| ADR Amendment 박제 | 4 | #486 #489 #490 #501 | ✗ ADR 자체 진화 |
| 자동화 hotfix | 1 | #491 | ✗ ADR 자체 진화 |
| 릴리스 PR (v0.16.0) | 1 | #494 | ✗ ADR 자체 진화 |

→ 실제 Z 적용 회차 = **6** (< N=10, 임계 미달)

### 변경 사항

#### 자동화 스크립트 정정 — `scripts/verify-z-pattern-health.mjs` (2단 정정)

1. **`isAdrEvolutionPr(title)` 신규 함수** — PR title 에서 `Amendment N` / `hotfix` / `release vX.Y.Z` 패턴 식별. `adrCitations` 계산 시 `isAdrEvolutionPr` 통과 PR 만 카운트 → PR citations 자기참조 회피
2. **`phase1Count = adrCitations`** (기존 `Math.max(amendmentCount, adrCitations)` 폐기) — Amendment 7 박제 직후 D1 검증에서 발견: `amendmentCount` 도 Amendment N 박제 자체로 +1 증가 (Amendment 7 박제 → amendmentCount 6→7) → Math.max 가 인플레된 amendmentCount 채택 → 자기참조 인플레이션 재발생 (66.7% → 57.1% 하락 관찰). 정정: amendmentCount 는 console.log 정보 출력에만 활용, 임계 비교 SSoT 는 adrCitations 단일

> **D1 검증 시점의 메타 학습** — 측정 식 정정의 1차 효과 (isAdrEvolutionPr 필터) 만 박제 후 산출값 검증에서 2차 자기참조 (amendmentCount 인플레) 발견. CLAUDE.md §스프린트 계약 #10 "수치 DoD 미달 시 측정 방법 검증 우선" 원칙의 반복 적용 사례 — 측정 식 변경 후 즉시 재검증 의무.

#### ADR §재검토 조건 #5 본문 갱신

- "ADR 자체 진화 PR (Amendment 박제 / hotfix / release) 은 Z 적용 회차로 카운트하지 않음" 명시
- §측정 지표에 정정 식 산출 결과 박제 (Phase 1 = 6, Phase 2 = 4, 진행률 66.7%)

### 정정 후 실측 (2026-05-25, 본 PR 머지 직후)

- **Phase 1 카운트** (정정): 12 → **6** (자기참조 6 제외)
- **Phase 2 카운트**: 4 (변경 없음, upstream PR 4건 모두 머지)
- **Phase 2 진행률** (정정): 33.3% → **66.7%** (Amendment 1 임계 33% 대비 2배 초과)
- **임계 발화**: 3중 OR 모두 미발화 → exit 0 ✅
- **다음 트리거 회피**: Phase 1 회차가 N=10 도달까지 추가 4 Z 적용 PR 여유

### silent 가드 무력화 위험 점검 (메타 검증)

옵션 D 가 silent 가드 무력화 (옵션 C 변형) 인지 자기점검:

- ❌ **옵션 C와 무관**: N 임계값 (10) 변경 없음. silent 가드 본래 의도 보존
- ❌ **회피 트릭 아님**: 측정 식이 자기참조로 인플레된 false-positive 제거 — 실제 회차 (6) 가 임계 (10) 미만이라는 사실은 정확한 측정의 결과
- ✓ **CLAUDE.md §스프린트 계약 #10 정합**: "수치 DoD 미달 시 측정 방법 검증 우선" — DoD 가 미달이 아니라 임계 *초과* 였으나 동일 원칙 (측정 식 검증 우선) 적용
- ✓ **다운스트림 부담 제거**: workflow 가 매주 false-positive 발화하면 alert fatigue → 진짜 트리거 발화 시 사용자 무시 위험. 정확한 측정이 silent 가드의 효과 자체를 보호

### 측정 식 정정 회귀 가드

- **자기점검 단위 검증**: 정정 후 스크립트 실행 → 6/4/66.7% 산출 + exit 0 확인 (본 PR 머지 전 D1/D2 통과)
- **회귀 가드**: workflow_dispatch 수동 트리거 1회 (default branch 반영 후, volt #69 함정 회피) → CI 환경에서도 exit 0 확인 의무
- **미래 Amendment 박제 시 카운트 동작**: 새 Amendment (예: Amendment 8) 박제 PR 은 자동으로 `isAdrEvolutionPr` 필터 통과 → 자기참조 회피 (정정 식 영구 보존)

### 트레이드오프

- **장점**: false-positive 제거 + 다음 트리거 시점 정확화 + silent 가드 본래 효과 강화 + Phase 2 강제 부담 제거
- **단점 (잠재)**: PR title 컨벤션 의존 — 향후 Amendment PR title 에 `Amendment N` 명시 누락 시 카운트 인플레 재현 가능. 회피: 본 ADR §운영 절차에 "Amendment 박제 PR title 컨벤션 의무" 박제 (후속 분리 검토)

### cross-link

- 본 Amendment, [#554](https://github.com/coseo12/astro-simulator/issues/554) [ADR Trigger] discussion
- 자동화 스크립트: `scripts/verify-z-pattern-health.mjs`
- 직전 Amendment: [#500](https://github.com/coseo12/astro-simulator/issues/500) Amendment 6
- 측정 방법 원칙: CLAUDE.md §스프린트 계약 #10 (volt [#32](https://github.com/coseo12/volt/issues/32) — 측정 방법 검증 우선)

### 교차검증 반영 사항 (agy Antigravity, 2026-05-25)

- **outcome**: `applied` (exit 0) — log `.claude/logs/cross-validate-architecture-20260525-134600.log`
- **합의** (Claude 설계와 일치): Amendment 7 의 자기참조 회피 정정 = 모범 사례 평가 ("측정 식 자체에 대한 포렌식 및 결함 분석 적용은 이 시스템이 자생적으로 동작하고 있음을 입증")
- **이견**: 0건 (4 검증 포인트 모두에 대해 agy 반박 없음)
- **본 PR 반영 (즉시)**: 0건 (agy 발견 모두 본 PR 비-범위 영역)
- **고유 발견 (후속 분리, volt #29 3단 프로토콜)**: 4건 — 모두 본 Amendment 7 비-범위 (측정 식 정정 단일 목표) 와 직교
  1. **Phase 1 드리프트 가시화** (medium 후보) — Phase 1 임시 수정 파일에 데코레이터 주석 의무 (`<!-- HARNESS-DRIFT: Z-PATTERN [upstream-link] -->`) + Phase 2 중도 변경 정적 비교 가드 (Amendment 5 보완)
  2. **경고 피로감 (Alert Fatigue) 가드** (medium 후보) — 동시 드리프트 최대 N개 상한 박제
  3. **CI exit code 계약 명시** (low 후보) — `.github/workflows/adr-z-pattern-health-v2.yml` 의 block vs warn 동작 박제
  4. **신규 진입 인지 부하 완화** (low 후보) — CLAUDE.md TL;DR 3단계 요약 카드 + markdownlint 등 다른 린터 정합성 통합 박제
- **Claude 편향 셀프 체크 4종**:
  - (a) 낙관적 일정 → ✓ 측정 식 정정 1단 박제 후 D1 재검증으로 2차 자기참조 (amendmentCount 인플레) 발견 + 즉시 정정. CLAUDE.md §스프린트 계약 #10 반복 적용 사례
  - (b) 결합 간과 → ✓ `Math.max(amendmentCount, adrCitations)` 의 2축 자기참조 결합 발견. 1단 (isAdrEvolutionPr) 만으론 2축 중 1축 (adrCitations) 만 해소 — Math.max 폐기로 2축 (amendmentCount) 자기참조도 SSoT 에서 제거
  - (c) 폐기 프레이밍 → ✓ 옵션 D 가 옵션 B (Z 패턴 폐기) 또는 옵션 C (silent 약화) 변형 아님 — §결정 본문 / N 임계 / Phase 2 의무 모두 보존 (자기점검 통과)
  - (d) 순수주의 → ✓ "정직한 측정" 도그마 아님 — Phase 2 진행률 33.3% vs 66.7% 차이 실측이 사용자 의사결정 정확화에 직접 기여

### Z 패턴 적용 카운트 (정정 후, 2026-05-25)

- 회차 정정 후 = **6** (#468/#472/#475/#478/#481/#482)
- Phase 2 진행률 정정 후 = 4/6 = **66.7%** ✅ Amendment 1 임계 (33%) 2배 초과
- Amendment 7 박제 자체는 ADR 자체 진화 PR 이므로 정정 식상 Phase 1 카운트 +0 — 의도된 자기참조 회피 동작

## Amendment 8 — 2026-05-26

상태: Accepted (cross-validate 2026-05-26 통합 완료)

- **발의**: [#556](https://github.com/coseo12/astro-simulator/issues/556) (Amendment 7 PR [#555](https://github.com/coseo12/astro-simulator/pull/555) cross-validate agy Antigravity 고유 발견 #1, 2026-05-25)
- **근거** (cross-validate 원문 — log `.claude/logs/cross-validate-architecture-20260525-134600.log`):
  1. **Phase 2 중도 변경 추적의 공백** — Amendment 5 (upstream 리뷰 피드백 즉시 로컬 동기화 의무) 는 개발자 수동 기억력 의존. 정적 비교 장치 보완 필요
  2. **Trustless 영속화 (보안/무결성)** — Phase 1 임시 수정 파일에 식별 가능한 데코레이터 주석 의무화로 정적 분석 도구 / 보안 검수자가 "승인받은 임시 드리프트" 즉시 식별 가능

### 변경 사항

#### 1. HARNESS-DRIFT 데코레이터 주석 의무 (Phase 1 운영 절차 단계 2 신설)

- **적용 대상**: Phase 1 단계에서 직접 수정하는 모든 harness-managed 파일 (`.claude/agents/*.md` / `.claude/skills/*/SKILL.md` / `.claude/commands/*.md` / `.claude/settings.json` / 기타 `.harness/manifest.json` 의 `files` 키 포함)
- **본문 형식 SSoT**:
  ```text
  HARNESS-DRIFT: Z-PATTERN [<upstream-link-or-TODO>]
  ```
  - `upstream-link`: Phase 2 PR URL (예: `https://github.com/coseo12/harness-setting/pull/N`). Phase 1 단독 머지 시 `TODO` 허용 (Phase 2 머지 직후 실제 URL 로 교체 의무)
- **파일 형식별 분기 (결정점 1)**:
  - `.md`: `<!-- HARNESS-DRIFT: Z-PATTERN [upstream-link-or-TODO] -->` (HTML 주석, GitHub 렌더 시 비표시)
  - `.ts` / `.tsx` / `.js` / `.mjs` / `.cjs`: `// HARNESS-DRIFT: Z-PATTERN [upstream-link-or-TODO]` (line comment)
  - `.yml` / `.yaml`: `# HARNESS-DRIFT: Z-PATTERN [upstream-link-or-TODO]` (line comment)
  - `.json` (예: `.claude/settings.json`): JSON 표준 주석 미지원 → **sidecar 파일** `<filename>.HARNESS-DRIFT.md` 동일 디렉토리 박제. 본문은 `# HARNESS-DRIFT: Z-PATTERN [upstream-link-or-TODO]\n원 파일: <filename>\n변경 사유: <한 줄 요약>` 형식. 적용 빈도 낮음 (실측 0건) 으로 운영 부담 최소
  - **sidecar 라이프사이클 계약** (cross-validate agy 이견 수용 — orphan 방지): `<filename>.HARNESS-DRIFT.md` 존재 시 동일 디렉토리에 매칭되는 `<filename>` 반드시 존재 + `harness doctor` 상 drift 감지 상태 의무. orphan sidecar (본 파일 삭제/이름 변경 후 sidecar 잔존) 발견 시 verify 스크립트가 CI fail (exit 1). Phase 3 자동 동기화 후 drift 해소 시 sidecar 도 함께 삭제 의무 (developer 단계 verify 스크립트 구현 시 박제)
- **위치 SSoT (결정점 2)**: **파일 첫 줄 의무** + shebang (`#!/usr/bin/env node` 등) / DOCTYPE (`<!DOCTYPE html>` 등) / YAML frontmatter (`---\n...\n---\n`) 1블록 직후 1줄 허용. regex SSoT (verify 스크립트 의무 패턴):
  ```regex
  ^(?:#![^\n]*\n|<!DOCTYPE[^>]*>\n|---\n(?:[\s\S]*?\n)?---\n)?(?:<!--|//|#) HARNESS-DRIFT: Z-PATTERN \[(?:https?://[^\]]+|TODO)\](?: -->)?
  ```
  - **developer 단계 보완 (2026-05-26, PR #556)**: architect 박제값 regex 는 shebang/DOCTYPE 만 허용했으나 적용 대상 `.claude/agents/*.md` 의 컨벤션 (YAML frontmatter) 미커버. YAML frontmatter 1블록 prefix 허용 추가 — 의미는 동일 (파일 메타 헤더 직후 첫 컨텐츠 라인).
- **자동 가드 (결정점 3 — verify 스크립트 분리)**: `scripts/verify-harness-drift-decorator.mjs` 신규 (Node ESM). `harness doctor` 가 drift 감지한 파일 (= `.harness/manifest.json` 의 sha256 과 실제 파일 sha256 불일치 + Phase 1 PR 컨벤션 의도된 drift) 에 대해 데코레이터 존재 검증 — 누락 시 exit 1 (CI hard-fail). 로컬 사전 검증 비용 < 1초 (gh API 호출 없음, 파일 grep 만)
- **CI 통합**: `.github/workflows/harness-guards.yml` 또는 `.github/workflows/pr-template-checklist-guard.yml` 에 step 추가 (developer 단계 결정)
- **선택 근거 (대안 비교)**:
  - 형식 A (HTML 주석 단일) 거부: `.json` 적용 불가능 (JSON 주석 표준 미지원)
  - 형식 C (별도 SSoT 위치, 예: manifest 메타 필드) 거부: cross-validate 원문의 "trustless 영속화" 의도와 충돌 — 보안 검수자가 파일 내부에서 즉시 식별 불가능
  - 위치 B (regex 매치만, 파일 어디든) 거부: 정적 분석 비용 증가 + "어디부터 봐야 하는지" 불확정. 위치 A (첫 줄) 가 O(1)

#### 2. Phase 2 중도 변경 정적 비교 가드 (Amendment 5 보완)

- **통합 위치 (결정점 3 후보 B)**: 기존 `scripts/verify-z-pattern-health.mjs` 에 `verifyPhase2Sync()` 함수 추가 (별도 스크립트/workflow 분리 거부 — 운영 부담 2배 회피)
- **측정 방식**:
  - `gh pr list --repo coseo12/harness-setting --state open --search "ADR 20260515" --json number,headRefOid,files` 로 진행 중 upstream PR 식별
  - 각 upstream PR 의 변경 파일 (`files[].path`) 과 로컬 drift 파일 (`harness doctor` 가 warn 한 파일) 매칭
  - 매칭된 파일 쌍의 sha256 비교 (upstream blob SHA via gh API + 로컬 파일 SHA)
  - 차이 발견 시 drift 파일명 / upstream PR 번호 / diff URL 박제
- **트리거 주기**: 월 cron (UTC 00:00 = KST 09:00 월요일) — 기존 `adr-z-pattern-health-v2.yml` workflow 와 동일 trigger 사용
- **후속 행동 (결정점 3 옵션 A 채택)**: **soft-warn** — [Phase 2 Sync Required] 라벨 (priority:medium) 자동 부착 + 자동 코멘트 (drift 파일 목록 + upstream PR head SHA + diff URL). CI hard-block 아님
- **선택 근거 (대안 비교)**:
  - 옵션 B (hard-block CI fail) 거부: Amendment 2/6 의 silent 가드 약화 트레이드오프 (1인 운영 현실) 와 충돌. Phase 2 drift 는 upstream 리뷰 라운드에서 자연 정합되는 시점이 많음 — 즉시 차단은 false-positive 비용 과대
  - 옵션 C (Hybrid 임계 초과 시 block) 거부: 임계 정의 복잡도 증가 + 의식적 silent 약화 사이클 재발 위험
- **measurement-first 원칙 정합** (CLAUDE.md §"가드 설계 원칙"): broad 권고 (drift 즉시 block) 가 아닌 precision 정정 (라벨 부착 + 사용자 인지 강화) 채택

#### 3. ADR §운영 절차 갱신 (Phase 1 4→5단계 / Phase 2 3→5단계)

- Phase 1: 데코레이터 박제 단계 (단계 2 신설) — 본 §Amendment 8 본문 변경 사항 1 박제 형식 답습
- Phase 2: 데코레이터 link 교체 단계 (단계 2 보강) + 자동 정적 비교 가드 단계 (단계 4 신설) — 본 §Amendment 8 본문 변경 사항 2 박제 형식 답습
- Amendment 5 (upstream 리뷰 즉시 동기화 의무) Phase 2 단계 3 유지 + 본 가드 단계 4 가 보완

### silent 가드 강화 vs 약화 자기점검 (결정점 4)

본 Amendment 8 의 방향 검증 (CLAUDE.md §"가드 설계 원칙" §의식적 silent 약화):

- ✓ **silent 가드 강화 방향** — Amendment 2 (N 임계 완화 = 약화) 의 정반대. 가시성 추가 + 새로운 행동 규칙 추가
- ✓ **§결정 본문 / N 임계 / 90일 임계 변경 0** — 기존 silent 가드 본래 의도 보존
- ✓ **데코레이터 누락 = CI hard-fail (fail-fast 원칙)** vs **drift 비교 = soft-warn (1인 운영 트레이드오프)** — 비대칭 의도적. 데코레이터 누락은 *컨벤션 강제* (예방 비용 < 1줄), drift 비교는 *예방 권고* (upstream 리뷰로 자연 해소 가능)
- ✓ **measurement-first 원칙 정합** — broad 권고 (drift 즉시 block) 가 아닌 precision 정정 (라벨 부착)
- ⚠ **발화 빈도 ≥ 1/주 예상 잠재 위험** — 월 cron + PR check 누적 시 alert fatigue 가능. 회피 전략: cross-validate 후속 발견 #2 (경고 피로감 가드, 동시 drift N개 상한) 가 별도 이슈 #557 로 분리 박제됨

### 트레이드오프

- **장점**: trustless 영속화 (보안 검수자 즉시 식별) + Phase 2 중도 drift 가시화 (Amendment 5 수동 의존 제거) + silent 가드 강화 일관성
- **단점 (잠재)**:
  - 데코레이터 누락 PR → 즉시 CI fail. developer 페르소나에 데코레이터 박제 의무 추가 (행동 변화 = MINOR 릴리스) — 본 Amendment 머지 후 첫 Phase 1 PR 부터 적용
  - 데코레이터 link 의 `TODO → URL` 교체 누락 시 검증 통과 (regex 가 `TODO` 허용). 회피: Phase 2 PR 머지 직후 후속 커밋 1회 의무. 검증 강화는 Amendment 9 후보로 보류 (현재 적용 빈도 낮음)
  - `.json` sidecar 파일 (`.HARNESS-DRIFT.md`) 분리로 GitHub 파일 트리 noise 1건 증가. 적용 빈도 < 5건 예상 (`.claude/settings.json` 등)

### Concrete Prediction (developer 단계 변경 예측 박제)

- 신규 파일: `scripts/verify-harness-drift-decorator.mjs` (~80-120 라인 예상)
- 기존 파일 수정: `scripts/verify-z-pattern-health.mjs` 에 `verifyPhase2Sync()` 함수 추가 (~60-100 라인 예상)
- CI workflow: `.github/workflows/harness-guards.yml` 또는 `pr-template-checklist-guard.yml` 에 step 추가 (1 step ~10 라인) — developer 단계 결정
- 기존 harness-managed 파일 데코레이터 추가: 현재 drift 0건 가정 시 0 파일 (`harness doctor` 실행 결과로 발견 시 N 파일). developer 단계 `harness doctor` 실행 후 확정
- 본 ADR Amendment 8 자체: ~110-130 라인 박제 (본 §섹션)
- 단위 테스트: regex 패턴 정합성 unit test (`scripts/__tests__/verify-harness-drift-decorator.test.mjs` 또는 인라인 self-test) ~40-60 라인 예상
- **총 예상 라인 수**: 250-450 라인 (신규 + 기존 + 테스트)
- 행동 변화 (CHANGELOG `### Behavior Changes` 후보 — developer 단계 박제): "Phase 1 PR 머지 전 HARNESS-DRIFT 데코레이터 주석 의무화" (MINOR 릴리스 후보) — 단, 본 PR 은 ADR Amendment 만 박제 (CHANGELOG 미터치, developer 단계에서 추가)

### 회귀 가드

- **자기점검 단위 검증**: regex SSoT 패턴 + 형식별 분기 표 self-test (`.md` / `.ts` / `.yml` / `.json` 각 1건 positive + 1건 negative)
- **3중 시뮬레이션** (positive → negative → recovery): 데코레이터 박제 → 누락 → 추가 → CI fail/pass 시퀀스 검증
- **회귀 가드 (CLAUDE.md §"가드 도입 PR DoD")**: 본 가드 도입 PR 자체에 4축 검증 의무 — (1) 격리 동적 테스트 (2) 3중 시뮬레이션 (3) 5 페르소나 self-consistency (4) 메타 측정 도구 자기 적용 안정성

### cross-link

- 본 Amendment, [#556](https://github.com/coseo12/astro-simulator/issues/556) 이슈 본문
- cross-validate 원본: `.claude/logs/cross-validate-architecture-20260525-134600.log` (Amendment 7 PR #555)
- 직전 Amendment: [#554](https://github.com/coseo12/astro-simulator/issues/554) Amendment 7 (측정 식 정정), [#488](https://github.com/coseo12/astro-simulator/issues/488) Amendment 5 (upstream 리뷰 즉시 동기화 의무)
- 후속 분리: [#557](https://github.com/coseo12/astro-simulator/issues/557) (경고 피로감 가드, 동시 drift N개 상한 — Amendment 8 의 발화 빈도 잠재 위험 회피 전략)
- 자동화 스크립트: `scripts/verify-harness-drift-decorator.mjs` (신규), `scripts/verify-z-pattern-health.mjs` (기존, `verifyPhase2Sync()` 추가)
- 가드 설계 원칙: CLAUDE.md §"가드 설계 원칙 — measurement-first / 의식적 silent 약화 / fail-fast" (volt [#101](https://github.com/coseo12/volt/issues/101) / [#106](https://github.com/coseo12/volt/issues/106) / [#107](https://github.com/coseo12/volt/issues/107))

### 교차검증 반영 사항 (agy Antigravity, 2026-05-26)

- **outcome**: `applied` (exit 0) — log `.claude/logs/cross-validate-architecture-20260526-150418.log`, outcome JSON `.claude/logs/cross-validate-architecture-20260526-150418-outcome.json` (plan_bypass=false, rollback_failed=false, reminder_issue="none")
- **합의** (Claude 설계와 일치 — 5건):
  1. Z-Pattern 의 즉시성 vs SSoT 트레이드오프 합리성
  2. Amendment 2/7 의 1인 운영 현실 반영 + forensic 정정 모범 사례
  3. Phase 1→2→3 + upstream 반려 폴백 경로 구조적 완성도
  4. Amendment 8 의 trustless 영속화 (CI hard-fail) + 데코레이터 mechanical contract
  5. regex 단일 일반화로 신규 확장자 (`.toml` / `.py` 등) 대응 용이
- **이견 수용 (본 PR 즉시 반영 — 1건)**:
  - **agy 제안 1 — Sidecar 라이프사이클 계약 강화**: Claude 원안은 sidecar 박제만 명시 + 라이프사이클 미명시. agy 근거 합리적 — orphan sidecar (본 파일 삭제/이름 변경 후 잔존) 가 정적 검사 false-positive / false-negative 발생. **반영**: §변경 사항 1 의 `.json` 분기에 sidecar 라이프사이클 계약 추가 — orphan 발견 시 verify 스크립트 CI fail (exit 1) + Phase 3 동기화 후 sidecar 동시 삭제 의무. developer 단계 verify 스크립트 구현 시 박제.
- **Claude 재분석으로 기각한 외부 모델 제안**: 0건 (3 제안 모두 합리적, 단 본 PR 범위 분류만 차이)
- **고유 발견 (후속 분리, volt #29 3단 프로토콜)**:
  1. **agy 제안 2 — Phase 2 PR URL `TODO` 해소 자동화** (medium 후보, 후속 분리 [#569](https://github.com/coseo12/astro-simulator/issues/569)): 자동 치환 CLI 도우미 스크립트 제안. 본 PR §단점 "TODO → URL 교체 누락" 자리에 Amendment 9 후보로 보류 명시됨 — agy 가 자동화 도구 구체 제안. 본 PR 비-범위 (단순 컨벤션 + 사후 커밋 1회 충분, 자동화는 운영 부담 증가). 후속 이슈 #569 박제 완료
  2. **agy 제안 3 — 동시 drift Hard Limit 구체값 (N=3)** (medium 후보, 기존 분리 #557 본문 갱신 영역): 본 PR §단점 "발화 빈도 ≥ 1/주 잠재 위험" 자리에 #557 cross-link 박제됨. agy 가 N=3 구체값 + Hard Limit exit 1 제안. 본 PR 비-범위 (#557 영역). #557 architect 단계 SSoT 갱신 시 인용 박제 의무
  3. **agy 누락 검증 1 — Phase 3 harness doctor 3-way merge** (low 후보, harness-setting 레포 후보): `harness update --apply-all-safe` 가 데코레이터 주석 보존 vs 덮어쓰기 시 유실 검증 누락. 본 PR 비-범위 (Phase 3 동작 = ADR §결정 본문 영역). 후속 분리 — harness-setting 레포 issue 후보 (다운스트림 verify 가능 영역 아님)
- **호출 전 Claude 편향 셀프 체크 4종 (모두 통과)**:
  - (a) 낙관적 일정 → ✓ developer 단계 라인 수 예측 250-450 라인 박제 + 회귀 가드 4축 검증 의무 박제 (단순 추가 작업 가정 회피)
  - (b) 결합 간과 → ✓ Phase 1 데코레이터 가드 (별도 verify 스크립트) + Phase 2 중도 비교 가드 (기존 verify-z-pattern-health.mjs 통합) 분리 — 의존성 결합 회피
  - (c) 폐기 프레이밍 → ✓ Amendment 5 (수동 동기화 의무) 폐기 아님. 보완 (자동 정적 비교 추가) — 양립
  - (d) 순수주의 → ✓ ".json sidecar 가 보기 싫다" 도그마 회피 — 적용 빈도 < 5건 실측 기반 수용. fail-fast (데코레이터) vs soft-warn (drift 비교) 비대칭 의도적 유지

## Amendment 9 — 2026-05-26

상태: Accepted (cross-validate 2026-05-26 통합 완료)

- **발의**: [#557](https://github.com/coseo12/astro-simulator/issues/557) (Amendment 7 PR [#555](https://github.com/coseo12/astro-simulator/pull/555) cross-validate agy Antigravity 고유 발견 #2, 2026-05-25)
- **근거** (cross-validate 원문 — log `.claude/logs/cross-validate-architecture-20260525-134600.log`):
  - **경고 피로감 (Alert Fatigue)**: Z 패턴 적용 빈도가 높을수록 프로젝트는 상시 `harness doctor` 경고 (Drift) 상태에 놓이게 됨. 이는 개발자가 '진짜 치명적인 다른 드리프트나 파일 오염' 마저 무시하게 만드는 심리적 부작용을 낳을 수 있음. 경고 상태의 임계 수치나 활성화된 드리프트 파일 개수의 상한선 (예: 동시 드리프트 최대 3개 이하) 을 기술 결정 제약에 추가할 것을 권장.
- **PR [#556](https://github.com/coseo12/astro-simulator/pull/556) Amendment 8 cross-validate 후속 인용** (2026-05-26): agy 가 동일 권고를 N=3 구체값 + Hard Limit (exit 1) 제안으로 재발화. 본 Amendment 9 가 그 후속 분리 영역 (#557) — agy 제안 3 인용 의무 박제.

### 변경 사항

#### 1. §재검토 조건 #6 신설 — 동시 활성 drift 파일 수 ≥ N=10

- **위치**: §재검토 조건 #5 (Phase 2 진행률 시간/누적 차원) 와 직교한 **drift 파일 수 차원** 추가
- **임계값 SSoT**: `N=10` (활성 drift 파일 수 = `.harness/manifest.json` sha256 과 실제 파일 sha256 불일치 + manifest 등록된 파일만 카운트, orphan sidecar 제외)
- **트리거 발화 시 후속 행동**: 3 영업일 내 [Alert Fatigue Trigger] 라벨 discussion 이슈 생성 의무 — Phase 2 가속 (점진 drift 해소) / 일부 Phase 1 revert (긴급 정리) / N 임계값 재조정 (Amendment 2/7 silent 약화 사이클 답습 — 신중)

#### 2. 측정 결함 baseline 박제 — 2026-05-26 실측

본 Amendment 9 박제 직전 `node scripts/verify-harness-drift-decorator.mjs` 실측 (develop tip c6ea749):

```text
harness drift files: 6
decorator PASS: 6
decorator FAIL: 0
orphan sidecars: 0
```

- 활성 drift 파일 수 = **6** (N=10 임계 buffer 4)
- 모든 drift 파일에 Amendment 8 데코레이터 정합 박제 (FAIL 0)
- 본 baseline 이 N 임계 결정의 결정적 근거 — N=3/5 채택 시 본 가드 도입이 즉시 발화하는 자기 모순 회피

#### 3. 4축 결정 박제값

##### 결정점 1 — N 임계값

| N | 즉시 발화? | 운영 영향 | 정합성 |
|---|---|---|---|
| 3 | ✓ (6 > 3 즉시 발화) | 6→3 revert 강제 → 운영 부담 폭증 | Amendment 1 N=3 정합 |
| 5 | ✓ (6 > 5 즉시 발화) | buffer 0 → 1 PR 머지 시 발화 | 중간 |
| **10** | ✗ (6 < 10) | buffer 4 → 4 PR 적용 buffer | **Amendment 2 N=10 정합** |

**결정: N=10**. 근거:
- baseline 6 이 N=10 임계 buffer 내. 본 가드 도입이 즉시 위반 상태로 PR 들어가는 자기 모순 회피
- Amendment 1 (N=3) / Amendment 2 (N=10) 사이클 정합 — Amendment 2 의 silent 가드 약화 트레이드오프 (1인 운영) 수용 결정과 **동일 N=10** 차원만 다름 (Phase 1 회차 ↔ 활성 drift 파일 수)
- Amendment 1/2 SSoT N=10 인용으로 임계 정의 복잡도 증가 회피
- agy 제안 N=3 거부 근거 박제: agy 가 N=3 구체값 제시했으나 본 프로젝트 실측 baseline=6 검증 후 거부. **measurement-first 원칙** (CLAUDE.md §"가드 설계 원칙" + §스프린트 계약 #10) 정합 — 외부 모델 broad 권고 → 다운스트림 실측 precision 정정 답습 (volt #51 외부 툴 주장 실측 가드 + Amendment 7 의 측정 식 forensic 답습)

##### 결정점 2 — 후속 행동

| 옵션 | 동작 | 정합성 |
|---|---|---|
| **A: 사용자 결정 분기 자동 이슈** | drift 초과 시 [Alert Fatigue Trigger] 라벨 자동 이슈 (Phase 2 가속 / 일부 Phase 1 revert / N 재조정) | Amendment 3 의 [ADR Trigger] 자동 이슈 패턴 답습 + Amendment 8 §결정점 3b 옵션 A soft-warn 정합 |
| B: CI fail (hard-block) | drift 초과 시 모든 PR CI fail | Amendment 7 의 silent 가드 약화 사이클 차단 정합 — 단 1인 운영 부담 폭증 |
| C: Hybrid | 임계 N 초과 시 block + 자동 이슈 생성 | 임계 정의 복잡도 증가 + Amendment 8 결정점 3b 옵션 A "soft-warn" 정합 위반 |

**결정: 옵션 A (사용자 결정 분기 자동 이슈)** + soft-warn 라벨 부착.
- 근거: Amendment 8 §결정점 3b 옵션 A (Phase 2 sync drift → soft-warn 라벨 부착) 정합. silent 가드 강화 (Amendment 8 방향) vs 약화 (Amendment 2/7) 트레이드오프 통합 — **데코레이터 누락 = fail-fast / drift 카운트 초과 = soft-warn** 비대칭 의도적 (Amendment 8 §결정점 4 답습)
- Amendment 3 의 `.github/workflows/adr-z-pattern-health-v2.yml` `[ADR Trigger]` 자동 이슈 패턴 답습 — 중복 방지 (gh issue list `--search`) + 3 영업일 결정 분기 의무 박제

##### 결정점 3 — 통합 위치

| 후보 | 비용 | 정합성 |
|---|---|---|
| 신규 스크립트 (`verify-drift-count.mjs`) | 별도 파일 + CI step 추가 | 운영 부담 2배 — Amendment 8 §단점 회피 정합 위반 |
| `verify-z-pattern-health.mjs` 확장 | 기존 cron + main flow 통합 | Phase 2 진행률 + drift 카운트 차원 혼재 — 책임 결합 |
| **`verify-harness-drift-decorator.mjs` 통합** | 이미 `detectDriftFiles()` 보유 + drift 카운트 산출 | **drift 검증 + 카운트 동일 입력 단일 스크립트** |

**결정: `verify-harness-drift-decorator.mjs` 통합**.
- 근거: 본 스크립트의 `detectDriftFiles()` 가 이미 drift 카운트 산출 — N=10 비교 추가 = ~30 라인. self-test 인라인 3중 시뮬레이션 패턴 답습 가능
- **트리거 시점 분기 (developer 단계 구현 의무)**: PR check 시점 (decorator FAIL = exit 1 hard-fail) vs 월 cron 시점 (drift 카운트 > N = soft-warn). 단일 스크립트 내 CLI 플래그 (`--mode=count-warn` 또는 `--check-count-only`) 로 분기
- CI workflow: `.github/workflows/adr-z-pattern-health-v2.yml` 의 cron step 추가 (verify-z-pattern-health 직후 `verify-harness-drift-decorator.mjs --mode=count-warn` 호출 + `[Alert Fatigue Trigger]` 자동 이슈)

##### 결정점 4 — silent 가드 방향

**결정: soft-warn (라벨 + 자동 이슈)** — Amendment 8 §결정점 3b 옵션 A 답습.
- 데코레이터 누락 (Phase 1 PR check) = **fail-fast (hard-block)** — 컨벤션 강제, 예방 비용 < 1줄
- drift 카운트 초과 (월 cron) = **soft-warn (라벨 부착 + 자동 이슈)** — 사용자 결정 분기 (Phase 2 가속 / Phase 1 revert / N 재조정), 자동 차단 false-positive 비용 과대
- 비대칭 의도적 — Amendment 8 §결정점 4 silent 가드 강화 vs 약화 트레이드오프 통합 답습

##### 결정점 5 (추가) — 임계 비교 대상

**활성 drift 파일 수 (`detectDriftFiles().length`) 만** vs **drift + orphan sidecar 수**:
- **결정: 활성 drift 파일 수만** (orphan 제외)
- 근거: orphan sidecar 는 Amendment 8 hard-fail 가드가 이미 처리 (exit 1). 본 가드는 "Z 패턴 활성 적용 누적" 측정이 본질 — drift 파일 수가 정합. orphan 포함 시 측정 의미 혼재 (Phase 3 정리 누락 ≠ Z 패턴 누적)

### silent 가드 강화 vs 약화 자기점검

본 Amendment 9 의 방향 검증 (CLAUDE.md §"가드 설계 원칙" §의식적 silent 약화):

- ✓ **silent 가드 강화 방향** — Amendment 2 (N 임계 완화 = 약화) 의 정반대. 새로운 차원 (drift 파일 수) silent 회귀 신호 가시화
- ✓ **§결정 본문 / Amendment 2 N=10 / 90일 임계 변경 0** — 기존 silent 가드 본래 의도 보존
- ✓ **fail-fast (Amendment 8 데코레이터) vs soft-warn (본 가드) 비대칭 의도적** — Amendment 8 §결정점 4 답습. 데코레이터 누락 = 컨벤션 강제 (예방 < 1줄), drift 카운트 초과 = 예방 권고 (1인 운영 트레이드오프)
- ✓ **measurement-first 원칙 정합** — agy broad 권고 (N=3 hard-limit) 가 아닌 baseline 실측 (drift=6) 기반 precision 정정 (N=10 soft-warn) 채택
- ✓ **§재검토 조건 #5 와 직교** — 시간/누적 차원 (Phase 2 진행률 33% / N=10 회차 / 90일) vs drift 파일 수 차원 (활성 drift ≥ N=10). 둘 다 발화 시 우선순위는 #5 (Phase 2 강제 우위) — discussion 이슈 본문에 명시

### 트레이드오프

- **장점**: agy cross-validate 고유 발견 #2 영구 박제 (Alert Fatigue 위험 인식 명문화) + drift 차원 silent 회귀 신호 가시화 + Amendment 8 의 발화 빈도 ≥ 1/주 잠재 위험 회피 전략 제도화
- **단점 (잠재)**:
  - N=10 의 baseline=6 buffer 4 가 향후 Phase 1 4 PR 누적 시 즉시 발화 가능. 회피: Amendment 8 데코레이터 가드와 동시에 발화 시 사용자 인지 부하 증가 — discussion 이슈 본문에 동시 발화 처리 우선순위 박제 의무
  - soft-warn 라벨 + 자동 이슈가 alert fatigue 자체를 추가 발생시킬 잠재 — 중복 방지 (gh issue list `--search`) + 월 cron 빈도 제한 (Amendment 3 패턴 답습) 으로 완화

### Concrete Prediction (developer 단계 변경 예측 박제)

- 신규 코드:
  - `scripts/verify-harness-drift-decorator.mjs` 확장: CLI 플래그 (`--mode=count-warn`) 분기 + drift 카운트 N=10 비교 + soft-warn stdout 출력 — **~40-60 라인** (기존 함수 재사용 가능)
  - self-test 확장: `--mode=count-warn` positive (drift=5, N=10 → exit 0) / negative (drift=11, N=10 → exit 0 + warn) / boundary (drift=10, N=10 → exit 0) 3건 — **~30-50 라인**
- CI workflow 변경: `.github/workflows/adr-z-pattern-health-v2.yml` 에 step 추가 (verify-harness-drift-decorator `--mode=count-warn` 호출 + `[Alert Fatigue Trigger]` 자동 이슈) — **~30-50 라인** (Amendment 3 `[ADR Trigger]` step 답습)
- ADR Amendment 9 자체: ~140-180 라인 박제 (본 §섹션)
- harness-managed 파일 변경: 0 (정책 + 가드만, 기존 파일 무영향)
- **총 예상 라인 수**: 240-340 라인 (스크립트 + workflow + ADR + 테스트)
- 행동 변화 (CHANGELOG `### Behavior Changes` 후보 — developer 단계 박제): "월 cron 시점 활성 drift 파일 ≥ N=10 발화 시 [Alert Fatigue Trigger] 자동 이슈 생성" (MINOR 릴리스 후보) — 단, 본 PR 은 ADR Amendment 만 박제 (CHANGELOG 미터치, developer 단계에서 추가)

### 회귀 가드 (CLAUDE.md §"가드 도입 PR DoD" 4축)

- **(1) 격리 동적 테스트**: developer 단계에서 `node scripts/verify-harness-drift-decorator.mjs --self-test` + `--mode=count-warn` 인라인 시뮬레이션 PASS 의무
- **(2) 3중 시뮬레이션** (positive → negative → recovery): drift=5 (정상) → drift=11 (warn) → drift=8 (recovery) 시퀀스 self-test
- **(3) 5 페르소나 self-consistency**: 본 ADR 박제 직후 cross-validate (architect 단계 의무) + 후속 developer/reviewer/qa 단계 페르소나가 동일 결론 (N=10 / 옵션 A / verify-harness-drift-decorator 통합 / soft-warn) 도출 검증
- **(4) 메타 측정 도구 자기 적용 안정성**: 본 가드 도입 PR 자체가 자기 가드를 통과 (drift=6 < N=10 → exit 0 / soft-warn 미발화) — developer 단계 자기 검증 의무

### cross-link

- 본 Amendment, [#557](https://github.com/coseo12/astro-simulator/issues/557) 이슈 본문
- cross-validate 원본: `.claude/logs/cross-validate-architecture-20260525-134600.log` (Amendment 7 PR #555)
- Amendment 8 cross-validate 후속 (agy 제안 3 N=3 hard-limit 인용): `.claude/logs/cross-validate-architecture-20260526-150418.log` (PR #570)
- 직전 Amendment: [#556](https://github.com/coseo12/astro-simulator/issues/556) Amendment 8 (Phase 1 드리프트 가시화 + Phase 2 중도 비교)
- 자동화 스크립트: `scripts/verify-harness-drift-decorator.mjs` (확장, `--mode=count-warn` 플래그 추가 — developer 단계)
- CI workflow: `.github/workflows/adr-z-pattern-health-v2.yml` (확장, `[Alert Fatigue Trigger]` step 추가 — developer 단계)
- 가드 설계 원칙: CLAUDE.md §"가드 설계 원칙 — measurement-first / 의식적 silent 약화 / fail-fast" (volt [#101](https://github.com/coseo12/volt/issues/101) / [#106](https://github.com/coseo12/volt/issues/106) / [#107](https://github.com/coseo12/volt/issues/107))
- 측정 방법 검증 원칙: CLAUDE.md §스프린트 계약 #10 (volt [#32](https://github.com/coseo12/volt/issues/32) — 수치 DoD 미달 시 측정 방법 검증 우선)
- 외부 모델 실측 가드: volt [#51](https://github.com/coseo12/volt/issues/51) (외부 툴 주장 실측 가드 — agy N=3 제안 baseline=6 실측 후 N=10 정정 패턴)

### 교차검증 반영 사항 (agy Antigravity, 2026-05-26)

- **outcome**: `applied` (exit 0) — log `.claude/logs/cross-validate-architecture-20260526-161511.log`, outcome JSON `.claude/logs/cross-validate-architecture-20260526-161511-outcome.json` (plan_bypass=false, rollback_failed=false, reminder_issue="none")
- **합의** (Claude 설계와 일치 — 5건):
  1. Fallback 경로 (Z→Y 회귀) 선제 설계 = "프로세스 고착 상태 예방"
  2. 1인 운영 임계 완화 (Amendment 2 N=10/90일) + 자동 이슈 보완 (Amendment 3) 트레이드오프 분석 = "모범 사례"
  3. SSoT decorator regex 정교함 + YAML frontmatter prefix 확장 (Amendment 8) = "오차 없는 정적 분석 가능"
  4. verifyPhase2Sync upstream-downstream 정합성 강제 = "단순 체크박스 확인을 넘어 기술적 실질 정합"
  5. **Amendment 9 N=10 alert fatigue 가드 = "훌륭한 아키텍처 확장성 통제 장치, 시스템 복잡도 임계 제어"** (본 §Amendment 9 핵심 평가)
- **이견 수용 (본 PR 즉시 반영)**: 0건 (agy 4 발견 모두 본 PR 비-범위 영역 또는 거부 영역)
- **Claude 재분석으로 기각한 외부 모델 제안 (1건)**:
  - **agy 잠재 위험 — Soft-warn 60일 초과 시 Hard-block 에스컬레이션**: agy 가 "Soft-warn 방치 시 보안 불감증" 우려로 60일 임계 도입 제안. **기각 근거**:
    - 본 §Amendment 9 §결정점 4 (silent 가드 방향) 가 의도적으로 "fail-fast vs soft-warn 비대칭" 박제 — Amendment 8 (데코레이터 hard-fail) ↔ Amendment 9 (drift 카운트 soft-warn) 차원 분리가 핵심 설계
    - 60일 임계 추가 = silent 가드 약화↔강화 차원에 **시간 차원** 신규 도입 → Amendment 2 (N=10/90일) + Amendment 9 (N=10 drift 카운트) 직교 박제 본질 훼손
    - drift 카운트 누적 차단은 본 가드 자체 (N=10) 가 이미 수행 — 시간 차원 보조 가드는 누적 차단 본질 무관
    - measurement-first 원칙: 60일 임계의 baseline 실측 (현재 0건 Soft-warn 발화) 부재 — 추측 기반 보조 가드 도입은 silent 가드 사이클 (Amendment 2/7 약화 패턴) 재발 위험
- **고유 발견 (후속 분리, volt #29 3단 프로토콜 — 3건, 모두 박제 완료)**:
  1. **agy 발견 1 — Phase 3 sidecar 자동 삭제 메커니즘** (medium 후보, 후속 분리 [#572](https://github.com/coseo12/astro-simulator/issues/572)): Amendment 8 §변경 사항 1 sidecar 라이프사이클 계약은 박제 있으나 Phase 3 (`harness update --apply-all-safe`) 진입 시 drift 해소 → sidecar 자동 삭제 메커니즘 미명시. agy 권고: `verify-harness-drift-decorator.mjs` 내부에 자동 삭제 또는 CI 에러 강제 로직 확장. 본 PR 비-범위 (Amendment 9 #557 = drift 카운트 차원 단일 목표, Amendment 8 sidecar 라이프사이클 보강은 별개 영역).
  2. **agy 발견 2 — Y-회귀 시 harness doctor mute (Ignore List 프로토콜)** (medium 후보, 후속 분리 [#573](https://github.com/coseo12/astro-simulator/issues/573) — upstream harness-setting 영역): upstream 반려 시 영구 Y-fork 전환 시나리오에서 `harness doctor` 가 지속 drift 경고 → CI 로그 오염 + alert fatigue 가속. agy 권고: `.harness/ignored-drifts: [...]` 명시적 허용 목록 인터페이스 정의 + doctor 가 이를 파싱하여 정상 상태 (Exit 0) 인지하는 "영구 예외 등록 절차" 수립. 본 PR 비-범위 (ADR §결정 본문 / harness 도구 자체 영역).
  3. **agy 발견 3 — PR 타이틀 린팅 (Commitlint) 통합** (low 후보, 후속 분리 [#574](https://github.com/coseo12/astro-simulator/issues/574)): Amendment 7 `isAdrEvolutionPr(title)` 필터의 PR 제목 명명 규칙 묵시적 의존 (`Amendment N` / `hotfix` / `release vX`). 개발자 실수로 다른 형태 제목 작성 시 자기참조 인플레이션 재발. agy 권고: Semantic PRs Linter 등 CI 수준 강제. 본 PR 비-범위 (Amendment 7 영역).
- **호출 전 Claude 편향 셀프 체크 4종 (모두 통과)**:
  - (a) 낙관적 일정 → ✓ developer 단계 라인 수 예측 240-340 라인 박제 + 회귀 가드 4축 검증 의무 박제 (단순 추가 작업 가정 회피)
  - (b) 결합 간과 → ✓ Phase 2 진행률 차원 (#5) ↔ drift 파일 수 차원 (#6) 직교 박제. 동시 발화 시 우선순위 명시 (Phase 2 강제 우위)
  - (c) 폐기 프레이밍 → ✓ Amendment 8 (데코레이터 fail-fast) 폐기 아님. 보완 (drift 카운트 soft-warn 추가 차원) — 양립
  - (d) 순수주의 → ✓ "alert fatigue 가드가 alert fatigue 만든다" 도그마 회피 — N=10 baseline buffer 4 실측 + 중복 방지 + 월 cron 빈도 제한으로 완화 박제

## Amendment 10 — 2026-05-26

상태: Accepted (cross-validate 2026-05-26 통합 완료)

- **발의**: [#569](https://github.com/coseo12/astro-simulator/issues/569) (Amendment 8 PR [#570](https://github.com/coseo12/astro-simulator/pull/570) cross-validate agy Antigravity 고유 발견 #1 후속 분리, 2026-05-26)
- **근거** (cross-validate 원문 — log `.claude/logs/cross-validate-architecture-20260526-150418.log`):
  - Phase 1에서 파일을 수정해 머지할 때 `TODO` 주석을 허용하지만, Phase 2 PR을 열어야만 생성되는 URL을 Phase 1 브랜치에 사후 업데이트하는 과정에서 **추가 커밋/PR 로 인한 CI 낭비 및 관리 오버헤드**가 생긴다.
  - agy 구체 권고: 로컬 PR 머지 시 자동 코멘트를 달아주는 봇이나 혹은 `verifyPhase2Sync()` 과정에서 upstream PR 제목에 기재된 `[astro-simulator#이슈번호]` 정보를 감지하여, 로컬 파일의 `TODO` 를 자동으로 치환하는 가벼운 CLI 도우미 스크립트 제공.
- **baseline 실측 (develop tip 7051dda, 2026-05-26)**:

  ```text
  HARNESS-DRIFT: Z-PATTERN [TODO] 잔존 파일: 6
    - CLAUDE.md
    - .claude/agents/pm.md
    - .claude/agents/architect.md
    - docs/phases/roadmap-v3-incremental.md
    - .github/workflows/harness-guards.yml
    - scripts/verify-z-pattern-health.mjs
    (+ scripts/verify-harness-drift-decorator.mjs — 본 파일도 잠재 갱신 대상)
  ```

  - **systemic 누락 관찰**: Phase 2 PR (`coseo12/harness-setting` #248/#254/#257/#260) 가 이미 머지되었으나 다운스트림 `[TODO]` 갱신은 0건. Amendment 8 §단점 "사후 커밋 1회 의무" 가 1인 운영에서 자연 leak — 자동화 가치 검증된 사례

### 변경 사항

#### 1. `[TODO]` → upstream PR URL 자동 해소 메커니즘 (Phase 2 운영 절차 단계 2 보강)

- **자동화 방식 (결정점 1 후보 A 채택)**: 기존 `scripts/verify-z-pattern-health.mjs` 의 `verifyPhase2Sync()` 확장. upstream open + merged PR 식별 + 다운스트림 `[TODO]` 잔존 파일 매칭 + PR URL 자동 갱신 (또는 stdout 안내) 통합
  - **결정 근거**: Amendment 8 §단점 회피 정합 (운영 부담 2배 회피) + Amendment 9 §결정점 3 패턴 답습 (단일 스크립트 통합 = drift 검증 + 카운트 동일 입력)
  - 후보 B (별도 신규 `scripts/resolve-harness-drift-todo.mjs`) 거부: 운영 부담 2배 + 스크립트 책임 분산
  - 후보 C (CI 단계 자동 이슈 생성) 거부: Amendment 9 의 [Alert Fatigue Trigger] 자동 이슈가 이미 존재 — 동일 패턴 중복 발화 (alert fatigue 가속)
- **매칭 휴리스틱 (결정점 2 후보 다 채택)**: upstream PR title prefix (`[#N]` 또는 `astro-simulator#N`) **AND** PR 변경 파일 경로 (`.claude/agents/reviewer.md` 등) 둘 다 매칭 시에만 자동 갱신
  - **결정 근거**: false-positive 회피 — title 만 매칭하면 동일 이슈번호의 다른 영역 PR 오탐. 파일 경로만 매칭하면 동일 파일 변경의 다른 이슈 PR 오탐. 두 조건 AND 결합으로 precision ↑
  - 후보 가 (title 만) 거부: upstream `.claude/agents/reviewer.md` 변경이 본 이슈와 무관한 PR 일 가능성
  - 후보 나 (파일 경로 만) 거부: 동일 파일 변경 PR 이 N 개 존재 시 자동 매칭 불가능
- **발화 형태 (결정점 3 채택)**: **soft-warn (Amendment 8/9 비대칭 정합 답습)** — 자동 갱신 PR 생성 (옵션 A) 또는 stdout 안내 (옵션 B). hard-fail 거부 (Phase 2 머지 직후 1~3 사이클 내 자연 해소 가능 + 1인 운영 부담 가속)
  - **CLI 모드 분기**:
    - `--mode=resolve-todo` (신규): `[TODO]` 잔존 파일 + upstream 매칭 PR 식별 → stdout 안내 + (CI 모드 시) PR 자동 생성
    - `--mode=resolve-todo --dry-run` (기본 안전): stdout 만 (사용자 수동 확인 후 갱신)
- **통합 위치 (결정점 4 채택)**: **기존 `verify-z-pattern-health.mjs` 의 `verifyPhase2Sync()` 확장 + 신규 wrapper CLI 도우미** (혼합 채택)
  - `verifyPhase2Sync()` 에 `--include-todo-resolution` 옵션 추가 → upstream PR title/files 매칭 + `[TODO]` 매핑 결과 반환
  - 신규 `scripts/resolve-harness-drift-todo.mjs` (60-100 라인) — 위 함수 호출 + 자동 갱신 또는 stdout 안내 (사용자 친화 인터페이스)
  - **결정 근거**: `verifyPhase2Sync()` 코어 로직 재사용 (DRY) + wrapper CLI 가 사용자 직접 호출 인터페이스 제공 (개발자가 `pnpm verify:z-pattern` 으로 진단 가능)

#### 2. ADR §운영 절차 갱신 (Phase 2 단계 2 보강)

- Phase 2 단계 2 (데코레이터 link 교체) 에 자동 해소 도구 안내 박제 — `node scripts/resolve-harness-drift-todo.mjs --dry-run` 우선 실행 + 매칭 결과 확인 후 적용 명시
- Amendment 8 §변경 사항 1 의 `[TODO]` 허용 사유 박제값 유지 — 본 가드는 사후 해소 자동화만, 사전 허용은 보존

### silent 가드 강화 vs 약화 자기점검 (결정점 5 — 추가)

본 Amendment 10 의 방향 검증 (CLAUDE.md §"가드 설계 원칙" §의식적 silent 약화):

- ✓ **silent 가드 강화 방향** — Amendment 8 §단점 "사후 커밋 1회 의무 leak" 가 systemic 으로 관찰됨 (baseline 6 파일 잔존). 자동화로 leak 차단 = 가시화 강화
- ✓ **§결정 본문 / N 임계 / 90일 임계 변경 0** — 기존 silent 가드 본래 의도 보존. Amendment 8 의 `[TODO]` 허용 (Phase 1 단독 머지 시) 도 보존
- ✓ **fail-fast (데코레이터) vs soft-warn (drift 카운트) vs soft-warn (TODO 해소) 3축 비대칭 의도적** — Amendment 8/9 답습. TODO 해소는 사후 행동이므로 hard-block 불가 (시점 차이 — Phase 1 PR 시점엔 upstream PR 미생성)
- ✓ **measurement-first 원칙 정합** — agy broad 권고 (자동 봇 + CLI 도우미 둘 다) 가 아닌 baseline 실측 (6 파일 systemic leak) 기반 precision 정정 (단일 wrapper CLI + verifyPhase2Sync 확장)
- ⚠ **발화 빈도 잠재** — `[TODO]` 매칭 알림이 월 cron 시점 매번 발화 시 alert fatigue 가속. 회피: 중복 방지 (이전 cron 의 stdout 마커 비교) + soft-warn 단발성 (PR 자동 생성 시 중복 방지)

### 트레이드오프

- **장점**:
  - Amendment 8 §단점 "TODO → URL 교체 누락" systemic leak 차단 (baseline 6 파일 자동 해소 후보)
  - upstream PR 식별 휴리스틱 (title AND 파일 경로) 정합성 강제 → false-positive 회피
  - 기존 `verifyPhase2Sync()` 재사용 (DRY) + CLI wrapper 사용자 인터페이스 추가 — 운영 부담 최소화
- **단점 (잠재)**:
  - upstream PR 식별이 PR title 컨벤션 (`[#N]` / `astro-simulator#N`) 의존 — 컨벤션 위반 PR 자동 매칭 불가 (수동 fallback). 회피: #574 (PR title commitlint) 후속 분리 영역과 직교
  - 자동 PR 생성 모드 (`--mode=resolve-todo` non-dry-run) 가 false-positive 갱신 시 revert 필요. 회피: 기본값 `--dry-run` + 사용자 수동 확인 후 적용
  - `verifyPhase2Sync()` 의 git blob SHA (SHA-1) ≠ sha256 한계 (기존 박제) 상속 — 본 가드는 매칭만 수행, 실제 비교는 사용자에게 diff URL 안내

### Concrete Prediction (developer 단계 변경 예측 박제)

- 신규 코드:
  - `scripts/resolve-harness-drift-todo.mjs` (신규 wrapper CLI, ~60-100 라인) — `verifyPhase2Sync()` 호출 + 매칭 결과 stdout 안내 / 자동 PR 생성 (dry-run 기본)
  - `verifyPhase2Sync()` 확장 (`scripts/verify-z-pattern-health.mjs` 내): `--include-todo-resolution` 옵션 + upstream PR title/files 매칭 로직 추가 — ~30-50 라인
  - self-test 확장: positive (title+파일 매칭) / negative (title 만 매칭 거부) / boundary (다중 PR 매칭) 3 cases — ~30-50 라인
- CI workflow 변경: `.github/workflows/adr-z-pattern-health-v2.yml` 의 cron step 추가 (`resolve-harness-drift-todo.mjs --mode=resolve-todo` 호출 + 매칭 결과 자동 이슈/코멘트) — ~20-30 라인. **단** Amendment 9 의 [Alert Fatigue Trigger] 와 중복 방지 — 본 가드는 별도 마커 (`[TODO Resolution]`) + 중복 방지 (gh issue list `--search`) 박제 의무
- ADR Amendment 10 자체: 본 §섹션 ~150-180 라인 박제 완료
- 기존 6 파일 `[TODO]` 갱신: 본 가드 도입 후 첫 실행으로 자연 해소 예상 (baseline → 0 buffer 회복)
- **총 예상 라인 수**: 290-410 라인 (스크립트 + workflow + ADR + 테스트)
- 행동 변화 (CHANGELOG `### Behavior Changes` 후보 — developer 단계 박제): "월 cron 시점 다운스트림 `[TODO]` 잔존 파일 + upstream 머지 PR 매칭 → 자동 해소 PR 생성 또는 stdout 안내 박제" (MINOR 릴리스 후보) — 단, 본 PR 은 ADR Amendment 만 박제 (CHANGELOG 미터치, developer 단계에서 추가)

### 회귀 가드 (CLAUDE.md §"가드 도입 PR DoD" 4축)

- **(1) 격리 동적 테스트**: developer 단계에서 `node scripts/resolve-harness-drift-todo.mjs --dry-run --self-test` PASS 의무
- **(2) 3중 시뮬레이션** (positive → negative → recovery): TODO=6 (baseline) → upstream 매칭 4건 갱신 → TODO=2 잔존 (recovery) → 다음 cron 시 잔존 2건 재발화 시퀀스 self-test
- **(3) 5 페르소나 self-consistency**: 본 ADR 박제 직후 cross-validate (architect 단계 의무) + 후속 developer/reviewer/qa 단계 페르소나가 동일 결론 (후보 A / 휴리스틱 다 / soft-warn / verifyPhase2Sync 확장) 도출 검증
- **(4) 메타 측정 도구 자기 적용 안정성**: 본 가드 도입 PR 자체는 ADR Amendment 만 박제 (코드 변경 0) — developer 단계 자기 검증 의무 (실제 baseline 6 파일 → wrapper CLI 호출 후 매칭 결과 자기 적용 안정)

### cross-link

- 본 Amendment, [#569](https://github.com/coseo12/astro-simulator/issues/569) 이슈 본문
- cross-validate 원본 (Amendment 8 발의): `.claude/logs/cross-validate-architecture-20260526-150418.log` (PR #570 — 본 #569 발의 cross-validate)
- 직전 Amendment: [#557](https://github.com/coseo12/astro-simulator/issues/557) Amendment 9 (경고 피로감 가드, 활성 drift ≥ N=10 soft-warn)
- 자동화 스크립트: `scripts/resolve-harness-drift-todo.mjs` (신규 wrapper — developer 단계), `scripts/verify-z-pattern-health.mjs` (확장 `verifyPhase2Sync()` — developer 단계)
- CI workflow: `.github/workflows/adr-z-pattern-health-v2.yml` (확장, `[TODO Resolution]` step 추가 — developer 단계)
- 가드 설계 원칙: CLAUDE.md §"가드 설계 원칙 — measurement-first / 의식적 silent 약화 / fail-fast" (volt [#101](https://github.com/coseo12/volt/issues/101) / [#106](https://github.com/coseo12/volt/issues/106) / [#107](https://github.com/coseo12/volt/issues/107))
- 외부 모델 실측 가드: volt [#51](https://github.com/coseo12/volt/issues/51) (외부 툴 주장 실측 가드 — agy 자동 봇 + CLI 도우미 둘 다 권고 → baseline 실측 후 단일 wrapper CLI + verifyPhase2Sync 확장 정정 패턴 답습)
- 후속 분리 영역 (본 PR 비-범위): [#572](https://github.com/coseo12/astro-simulator/issues/572) (Phase 3 sidecar 자동 삭제), [#573](https://github.com/coseo12/astro-simulator/issues/573) (Y-회귀 시 doctor mute — upstream 영역), [#574](https://github.com/coseo12/astro-simulator/issues/574) (PR title commitlint — Amendment 7 영역), [#577](https://github.com/coseo12/astro-simulator/issues/577) (TODO Aging Guard — agy cross-validate 제안 B, 시간 누적 차원), [#578](https://github.com/coseo12/astro-simulator/issues/578) (Prettier 정합성 교차 검증 — agy cross-validate 제안 C)

### 교차검증 반영 사항 (agy Antigravity, 2026-05-26)

- **outcome**: `applied` (exit 0) — log `.claude/logs/cross-validate-architecture-20260526-180552.log`, outcome JSON `.claude/logs/cross-validate-architecture-20260526-180552-outcome.json` (plan_bypass=false, rollback_failed=false, reminder_issue="none")
- **합의** (Claude 설계와 일치 — 4건, ADR 전반 평가):
  1. 구조적 완성도 "우수" — Phase 1/2/3 + 폴백 경로 (Y 회귀) closed-loop 설계
  2. 기술 결정 타당성 "매우 타당함" — Z 패턴 채택 / 1인 운영 임계 완화 (Amendment 2/7) / JSON sidecar 도입 / 비대칭 가드 정책 (fail-fast vs soft-warn)
  3. 확장성 "매우 우수" — regex 형식별 무관 + Amendment 단위 진화적 아키텍처
  4. 보안 "우수" — HARNESS-DRIFT 식별자 박제로 정적 분석 도구 / 보안 검수자 즉시 식별 가능 (trustless 영속화 정합)
- **이견 수용 (본 PR 즉시 반영)**: 0건 — agy 3 제안 모두 본 PR 비-범위 영역 (인접 가드 보완책)
- **Claude 재분석으로 기각한 외부 모델 제안**: 0건 — agy 제안 A/B/C 모두 합리적이나 본 PR (#569 Amendment 10 = TODO 해소 자동화 단일 목표) 범위 밖 → 후속 분리
- **고유 발견 (후속 분리, volt #29 3단 프로토콜 — 3건)**:
  1. **agy 제안 A — Stale Sidecar Clean-up Guard** (medium 후보, **기존 분리 [#572](https://github.com/coseo12/astro-simulator/issues/572) 영역 인접**): `verify-harness-drift-decorator.mjs` 에 역방향 검증 추가 — `*.HARNESS-DRIFT.md` 존재하지만 원본 파일 sha256 가 manifest 일치 (drift 해소) 또는 원본 부재 시 exit 1. 본 PR 비-범위 (#569 = TODO 해소 자동화 단일 목표). #572 (Phase 3 sidecar 자동 삭제) architect 단계 SSoT 갱신 시 본 제안 인용 박제 의무
  2. **agy 제안 B — TODO Aging Guard (시간 누적 가드)** (medium 후보, **신규 후속 분리 [#577](https://github.com/coseo12/astro-simulator/issues/577)**): `[TODO]` 토큰 발견 + develop/main 포함 + 최초 발견 7일 이상 경과 시 빌드 경고/실패. **본 PR Amendment 10 (매칭 자동화 차원) 과 차원 직교** — 시간 누적 차원 추가. 본 PR 비-범위 (단일 목표 + Amendment 9 silent 약화 사이클 답습 위험 회피).
  3. **agy 제안 C — Prettier 포맷터 정합성 교차 검증** (low 후보, **신규 후속 분리 [#578](https://github.com/coseo12/astro-simulator/issues/578)**): `verify-harness-drift-decorator.mjs` 가 drift 판별 파일이 `.prettierignore` 패턴 내 포함되는지 교차 검증. 본 PR 비-범위 (`20260419-prettier-harness-conflict.md` ADR 별도 영역).
- **호출 전 Claude 편향 셀프 체크 4종 (모두 통과)**:
  - (a) 낙관적 일정 → ✓ developer 단계 라인 수 예측 290-410 라인 박제 + 회귀 가드 4축 검증 의무 박제 (단순 추가 작업 가정 회피)
  - (b) 결합 간과 → ✓ `verifyPhase2Sync()` 확장 (코어) + wrapper CLI (인터페이스) 책임 분리 박제. Amendment 9 [Alert Fatigue Trigger] 와 별도 마커 [TODO Resolution] 분리 — 동시 발화 시 중복 차단 박제
  - (c) 폐기 프레이밍 → ✓ Amendment 8 의 `[TODO]` 허용 (Phase 1 단독 머지) 폐기 아님. 보완 (사후 해소 자동화 추가) — 양립
  - (d) 순수주의 → ✓ "자동 봇 + CLI 도우미 둘 다 도입" agy 광범위 권고 도그마 회피 — baseline 6 파일 systemic leak 실측 + 단일 wrapper CLI + verifyPhase2Sync 확장 (precision 정정) 채택

## Amendment 11 — 2026-05-26

상태: Accepted (cross-validate 2026-05-26 통합 완료)

- **발의**: [#572](https://github.com/coseo12/astro-simulator/issues/572) (Amendment 9 PR [#575](https://github.com/coseo12/astro-simulator/pull/575) cross-validate agy Antigravity 고유 발견 #1 후속 분리, 2026-05-26)
- **근거** (cross-validate 원문 인용):
  > Amendment 8에서 orphan sidecar를 방지하기 위한 계약을 명시했으나, Phase 3에서 `harness update --apply-all-safe`가 실행되어 drift가 해소될 때, sidecar 파일(`<filename>.HARNESS-DRIFT.md`)이 자동으로 삭제되는 메커니즘이 구체적으로 정의되어 있지 않습니다. 수동 삭제에 의존할 경우 orphan sidecar가 남을 확률이 높습니다.
- **추가 근거** (Amendment 10 §교차검증 반영 사항 §고유 발견 1 인용 의무 박제값 — 본 Amendment 자리에서 해소):
  > **agy 제안 A — Stale Sidecar Clean-up Guard**: `verify-harness-drift-decorator.mjs` 에 역방향 검증 추가 — `*.HARNESS-DRIFT.md` 존재하지만 원본 파일 sha256 가 manifest 일치 (drift 해소) 또는 원본 부재 시 exit 1. ... #572 (Phase 3 sidecar 자동 삭제) architect 단계 SSoT 갱신 시 본 제안 인용 박제 의무

### baseline 실측 (architect 박제 시점, develop tip db0ceca)

`node scripts/verify-harness-drift-decorator.mjs` 실측:

```
harness drift files: 6
decorator PASS: 6
decorator FAIL: 0
orphan sidecars: 0

[OK] 모든 drift 파일에 데코레이터 정합 박제
```

`find . -name "*.HARNESS-DRIFT.md" -not -path "./node_modules/*"` 실측: **0건** (sidecar 파일 자체 부재 — Amendment 8 §변경 사항 1 의 "적용 빈도 < 5건 예상" 박제값 정합).

- **현재 가드 상태**: `detectOrphanSidecars()` (라인 175~217) 가 이미 박제 — orphan 발견 시 exit 1 (verify 모드 fail-fast). 본 Amendment 11 는 **사용자 시점 자동화 (opt-in dry-run + --apply)** 영역 추가 (수동 정리 강제 vs 자동 정리 사이의 사용자 선택권 박제).

### 변경 사항

#### 1. `--mode=sidecar-cleanup` 신규 CLI 모드 (verify 스크립트 확장)

- **위치 SSoT (결정점 1)**: `scripts/verify-harness-drift-decorator.mjs` 의 `parseMode()` 헬퍼에 `sidecar-cleanup` 옵션 추가 (Amendment 9 §결정점 3 단일 스크립트 통합 패턴 답습).
  - 후보 A (`harness update --apply-all-safe` 후속 hook 통합) 거부: upstream harness-setting 영역 (#573) 의존 + 다운스트림 단독 해결 불가
  - 후보 C (별도 신규 스크립트 `cleanup-orphan-sidecars.mjs`) 거부: 운영 부담 2배 — Amendment 8 §단점 / Amendment 9 §결정점 3 / Amendment 10 §결정점 1 답습 위반
  - 후보 D (NO-OP — manual cleanup 권고) 거부: agy 발견 #1 의 "Phase 3 동기화 누적 시 자연 leak" 위험 박제값 무효화 + Amendment 10 §"systemic 누락 관찰" baseline 6 파일 leak 패턴 답습 위험 (1인 운영 매뉴얼 정리 누락 systemic)
- **CLI 시그니처 SSoT**:
  ```text
  node scripts/verify-harness-drift-decorator.mjs --mode=sidecar-cleanup [--apply]
  ```
- **모드 동작 분기**:
  - `--mode=verify` (기본, 무변경): orphan 발견 시 exit 1 (CI hard-fail) — Amendment 8 컨벤션 강제 정합 보존
  - `--mode=count-warn` (Amendment 9, 무변경): drift 카운트 N=10 임계 soft-warn
  - `--mode=sidecar-cleanup` **신규**: orphan 목록 stdout 출력 + `--apply` 미명시 시 exit 0 (dry-run) / `--apply` 명시 시 실제 삭제 + exit 0

#### 2. 감지 휴리스틱 SSoT (결정점 2 — 기존 `detectOrphanSidecars()` 재사용)

- **휴리스틱 무변경 보존**: 기존 `detectOrphanSidecars()` (라인 175~217) 가 검사 1+2 결합 박제 완료:
  - 검사 1: `<filename>.HARNESS-DRIFT.md` 가 존재하나 원본 파일 부재 (`base file missing`)
  - 검사 2: 원본 파일 존재하나 `harness doctor` drift 미감지 (`base file not in drift state (Phase 3 cleanup needed)`)
- **단일화 박제**: `verify` 모드 / `sidecar-cleanup` 모드 양쪽이 동일 헬퍼 호출 — 휴리스틱 SSoT 단일화 (Amendment 8 §결정점 1 형식별 분기 SSoT 답습 패턴).
- **신규 휴리스틱 추가 거부 근거**: cross-validate 권고는 sidecar 라이프사이클 자동화 영역으로 한정. 새 휴리스틱 (예: sidecar 본문 내 [TODO] 검사 등) 은 별 영역 (Amendment 10 / #577 TODO Aging Guard) 와 직교 — 본 PR 범위 밖.

#### 3. 발화 형태 (결정점 3 — 옵션 C: --dry-run 기본 + --apply 분리)

- **결정**: 옵션 C 채택. **Amendment 10 §결정점 3 패턴 답습** (사용자 인지 우선 + 부수효과 회피).
- **dry-run 출력 형식 SSoT** (`--mode=sidecar-cleanup` 단독, `--apply` 미명시):
  ```text
  [Sidecar Cleanup — Dry Run] orphan sidecars detected: N
    - <path/to/sidecar1.HARNESS-DRIFT.md> — base file missing
    - <path/to/sidecar2.HARNESS-DRIFT.md> — base file not in drift state (Phase 3 cleanup needed)

  조치 (ADR 20260515 §Amendment 11 §결정점 3):
    --apply 명시 시 실제 삭제. 미명시 시 본 출력만 (exit 0).
    수동 정리: rm <sidecar path>
  ```
- **--apply 실제 삭제 형식 SSoT** (`--mode=sidecar-cleanup --apply`):
  ```text
  [Sidecar Cleanup — Apply] orphan sidecars deleted: N
    - <path/to/sidecar1.HARNESS-DRIFT.md> (base file missing)
    - <path/to/sidecar2.HARNESS-DRIFT.md> (base file not in drift state)
  ```
- **옵션 A (자동 즉시 삭제, hard-action) 거부**: `--apply` 분리 없으면 사용자가 의도치 않은 sidecar 삭제 회수 불가. Amendment 10 §결정점 3 dry-run 기본 패턴 위반.
- **옵션 B (soft-warn 라벨 + 자동 코멘트, [Phase 2 Sync Required] 패턴) 거부**: sidecar 라이프사이클은 PR 자동 코멘트보다 **로컬 사전 정리 (Phase 3 동기화 직후 사용자 1회 호출)** 가 효율적. CI workflow 추가 운영 부담 회피.
- **verify 모드 fail-fast 보존 근거**: orphan 발견 = Amendment 8 §sidecar 라이프사이클 계약 위반 = silent leak 차단 시점 사용자 인지 강제. fail-fast 유지가 컨벤션 강제 정합.

#### 4. silent 가드 방향 (결정점 4 — fail-fast + opt-in 자동화 이중 박제)

- **결정**: 비대칭 이중 박제. **verify 모드 = fail-fast / sidecar-cleanup 모드 = opt-in 자동화**.
- **Amendment 8/9/10/11 비대칭 패턴 명문화 (SSoT)**:

  | Amendment | 차원 | 가드 방향 | 동기 |
  |---|---|---|---|
  | 8 (#556) | 데코레이터 누락 | **fail-fast** (verify 모드) | 컨벤션 강제 (예방 비용 < 1줄) |
  | 9 (#557) | drift 카운트 ≥ N=10 | **soft-warn** (count-warn 모드) | 1인 운영 alert fatigue 회피 |
  | 10 (#569) | TODO 해소 | **soft-warn + opt-in 자동화** (resolve-todo wrapper) | 사후 행동 + Phase 2 머지 대기 |
  | **11 (#572)** | **sidecar 라이프사이클** | **fail-fast (verify) + opt-in 자동화 (sidecar-cleanup)** | **silent leak 차단 (fail-fast) + 사용자 시점 정리 자동화 (opt-in)** |

- **비대칭 의도적 — "silent leak 차단은 fail-fast, 사용자 시점 자동화는 opt-in dry-run 기본"**: Amendment 11 가 본 SSoT 박제 (이전 Amendment 들의 비대칭 박제값 통합).

### silent 가드 강화 vs 약화 자기점검

본 Amendment 11 의 방향 검증 (CLAUDE.md §"가드 설계 원칙" §의식적 silent 약화):

- ✓ **silent 가드 강화 방향** — verify 모드 fail-fast 동작 보존 + opt-in 자동화 신규 추가 (가시성 + 행동 규칙 강화)
- ✓ **§결정 본문 / N 임계 / 90일 임계 변경 0** — 기존 silent 가드 본래 의도 보존. 측정 식 (Amendment 7) 변경 없음
- ✓ **fail-fast (데코레이터 / verify 모드) vs soft-warn (drift 카운트 / TODO 해소) vs opt-in 자동화 (sidecar-cleanup) 3축 비대칭 의도적** — Amendment 8/9/10 답습. sidecar 라이프사이클은 본질적으로 "silent leak 차단 (즉시) + 사용자 시점 정리 (지연)" 이원 차원이므로 이중 박제 정합
- ✓ **measurement-first 원칙 정합** — broad 권고 (자동 즉시 삭제 / hard-action) 가 아닌 precision 정정 (dry-run 기본 + --apply 명시) 채택. cross-validate 시점 baseline 실측 (sidecar 0 / orphan 0) 박제값 정합
- ⚠ **발화 빈도 잠재 위험 최소** — 현재 sidecar 0 / Phase 3 동기화 빈도 < 월 1회 예상. opt-in 호출이므로 자동 발화 0 (사용자 명시 호출만)

### 트레이드오프

- **장점**:
  - agy cross-validate 고유 발견 #1 의 "Phase 3 동기화 누적 시 자연 leak" 위험 영구 박제 해소
  - Amendment 10 §교차검증 §고유 발견 1 의 "Stale Sidecar Clean-up Guard" 인용 의무 박제값 해소
  - verify 모드 fail-fast 보존으로 silent leak 차단 정합 유지
  - `--dry-run` 기본 + `--apply` 분리로 사용자 회수 가능성 확보 (Amendment 10 패턴 답습)
  - 단일 스크립트 통합 (Amendment 9/10 정합) — 운영 부담 2배 회피
- **단점 (잠재)**:
  - 사용자 명시 호출 의존 — Phase 3 동기화 직후 호출 누락 시 orphan 누적 가능. 회피: verify 모드 fail-fast 가 다음 CI 시점 차단 (silent leak 차단 정합 보존). 자동화 강화는 미래 Amendment 후보로 보류 (현재 baseline 0 — 자동화 가치 미확보)
  - `--apply` 실수 사용 시 의도치 않은 sidecar 삭제. 회피: orphan 휴리스틱이 매우 정확 (검사 1+2 결합), 정상 sidecar 는 삭제 대상 아님

### Concrete Prediction (developer 단계 변경 예측 박제)

- 신규 코드:
  - `parseMode()` 헬퍼 확장 (`sidecar-cleanup` value 추가) — ~3-5 라인
  - `mainSidecarCleanup()` 신규 함수 (`runVerify()` 호출 + orphans 분기 + `--apply` 분기 + stdout 박제) — ~30-50 라인
  - `main()` 분기 추가 (`mode === 'sidecar-cleanup'`) — ~3-5 라인
  - self-test 확장 (3중 시뮬레이션 — orphan 0 / orphan N dry-run / orphan N apply) — ~50-80 라인
- CI workflow 변경: **0건** (sidecar-cleanup 는 opt-in CLI 모드 — CI 자동 실행 안 함). verify 모드 fail-fast 동작은 기존 workflow 정합 유지.
- 데이터: 현재 develop sidecar 0건 / orphan 0건 (실측) → 본 Amendment 11 도입 시점 즉시 적용 가능한 cleanup 대상 0건. 미래 sidecar 추가 시점부터 가드 작동.
- ADR Amendment 11 자체: 본 §섹션 ~140-180 라인 박제 완료
- **총 예상 라인 수**: 220-320 라인 (스크립트 확장 + self-test + ADR)
- 행동 변화 (CHANGELOG `### Behavior Changes` 후보 — developer 단계 박제): "verify 스크립트 `--mode=sidecar-cleanup` 신규 — orphan sidecar 자동 정리 (dry-run 기본 / --apply 명시 시 실제 삭제)" (MINOR 릴리스 후보) — 단, 본 PR 은 ADR Amendment 만 박제 (CHANGELOG 미터치, developer 단계에서 추가)

### 회귀 가드 (CLAUDE.md §"가드 도입 PR DoD" 4축)

- **(1) 격리 동적 테스트**: developer 단계에서 `node scripts/verify-harness-drift-decorator.mjs --self-test` PASS 의무. sidecar-cleanup 모드 self-test 케이스 추가 의무.
- **(2) 3중 시뮬레이션** (positive → negative → recovery):
  - positive: orphan 0 → `--mode=sidecar-cleanup` 호출 → "no orphans" 출력 + exit 0
  - negative: orphan 2 (base file missing / drift 해소) → `--mode=sidecar-cleanup` 호출 (dry-run) → 목록 출력 + 파일 잔존 + exit 0
  - recovery: 동일 baseline → `--mode=sidecar-cleanup --apply` 호출 → 파일 삭제 확인 + exit 0 + 후속 verify 모드 호출 → orphan 0 + exit 0
- **(3) 5 페르소나 self-consistency**: 본 ADR 박제 직후 cross-validate (architect 단계 의무) + 후속 developer/reviewer/qa 단계 페르소나가 동일 결론 (verify 스크립트 확장 / 휴리스틱 무변경 / opt-in dry-run / fail-fast + opt-in 이중 박제) 도출 검증
- **(4) 메타 측정 도구 자기 적용 안정성**: 본 가드 도입 PR 자체는 ADR Amendment 만 박제 (코드 변경 0) — developer 단계 자기 검증 의무 (현재 sidecar 0 → CLI 호출 시 "no orphans" 자기 적용 안정 검증). 인공 sidecar 생성 후 dry-run / apply 안정성 self-test 박제 의무

### cross-link

- 본 Amendment, [#572](https://github.com/coseo12/astro-simulator/issues/572) 이슈 본문
- cross-validate 원본 (Amendment 9 발의): `.claude/logs/cross-validate-architecture-20260526-161511.log` (PR #575 cross-validate agy 고유 발견 #1)
- 직전 Amendment: [#569](https://github.com/coseo12/astro-simulator/issues/569) Amendment 10 (TODO 해소 자동화)
- 인접 박제 의무 인용: Amendment 10 §교차검증 §고유 발견 1 (Stale Sidecar Clean-up Guard, agy 제안 A) — 본 Amendment 11 가 해소 자리
- 자동화 스크립트: `scripts/verify-harness-drift-decorator.mjs` (`--mode=sidecar-cleanup` 신규 — developer 단계)
- 휴리스틱 SSoT: 기존 `detectOrphanSidecars()` (라인 175~217 무변경)
- 가드 설계 원칙: CLAUDE.md §"가드 설계 원칙 — measurement-first / 의식적 silent 약화 / fail-fast" (volt [#101](https://github.com/coseo12/volt/issues/101) / [#106](https://github.com/coseo12/volt/issues/106) / [#107](https://github.com/coseo12/volt/issues/107))
- 비대칭 가드 패턴 SSoT (Amendment 8/9/10/11 통합): 본 §결정점 4 표
- 후속 분리 영역 (본 PR 비-범위): [#573](https://github.com/coseo12/astro-simulator/issues/573) (Y-회귀 시 doctor mute — upstream 영역), [#577](https://github.com/coseo12/astro-simulator/issues/577) (TODO Aging Guard — 시간 누적 차원), [#578](https://github.com/coseo12/astro-simulator/issues/578) (Prettier 정합성 교차 검증)

### 교차검증 반영 사항 (agy Antigravity, 2026-05-26)

- **outcome**: `applied` (exit 0) — log `.claude/logs/cross-validate-architecture-20260526-184439.log`, outcome JSON `.claude/logs/cross-validate-architecture-20260526-184439-outcome.json` (plan_bypass=false, rollback_failed=false, reminder_issue="none")
- **합의** (Claude 설계와 일치 — 6건, ADR 전반 + 본 Amendment 11 정당성 확인):
  1. 구조적 완성도 "매우 우수" — Phase 1/2/3 closed-loop + 폴백 경로 (Y 회귀)
  2. 기술 결정 타당성 "매우 합리적" — Z 패턴 + 1인 운영 임계 완화 + 측정 식 정정 + CI 가드 이원화 (fail-fast vs soft-warn)
  3. 인터페이스 명확성 "우수" — 형식별 정적 계약 + regex SSoT
  4. 확장성 "매우 유연" — regex 헤더 prefix (shebang / DOCTYPE / YAML frontmatter) 신규 stack 무수정 적용
  5. 보안 "매우 안전" — trustless 영속화 (HARNESS-DRIFT 식별자 박제로 SAST/검수자 즉시 식별)
  6. **§1 §보완 누락 구조 "사후 청소(Post-Cleanup) 자동화"** — agy 직접 인용: *"Phase 3가 완료되어 로컬 파일이 업스트림 버전으로 안전하게 덮어써지면 기존 로컬 파일에 삽입했던 `HARNESS-DRIFT` 데코레이터 주석이나 sidecar 파일(`.HARNESS-DRIFT.md`)은 무용지물이 됩니다. ... 사후 라이프사이클 단계가 모호합니다."* — **본 Amendment 11 정확히 해소 영역**. agy 가 §종합 결론에서 "제안한 세부 개선 사항(사후 청소 및 주석 유출 방지)만 보완된다면 프로덕션 환경에서 즉시 신뢰하고 적용할 수 있는 매우 강력한 아키텍처" 라고 본 Amendment 11 의 영구 박제 가치 직접 인정
- **이견 수용 (본 PR 즉시 반영)**: 0건 — agy §3 §개선 (sidecar 라이프사이클 경계 명확화 — Phase 3 직후 찰나 CI 검증 타이밍) 가 본 §결정점 3 + §회귀 가드 4축 §(2) 3중 시뮬레이션 recovery 단계에 이미 박제됨 (sidecar-cleanup --apply 후 verify 모드 호출 → orphan 0 + exit 0). 추가 박제 불필요 (이미 영속화)
- **Claude 재분석으로 기각한 외부 모델 제안**: 0건 — agy §6 누락 요소 1/2/3 모두 합리적이나 본 PR (Amendment 11 = sidecar 라이프사이클 자동화 단일 목표) 범위 밖 → 후속 분리 또는 이미 분리됨
- **고유 발견 (후속 분리, volt #29 3단 프로토콜 — 3건)**:
  1. **agy §6 누락 요소 1 — Upstream PR 데코레이터 오염 방지** (medium 후보, **신규 후속 분리 [#581](https://github.com/coseo12/astro-simulator/issues/581) 박제 예정 — 본 PR 비-범위**): Phase 2 (Upstream PR 제출) 시 다운스트림 로컬 데코레이터 (`HARNESS-DRIFT: Z-PATTERN [TODO]`) 가 upstream 레포에 오염 전파 위험. agy 권고: 자동 pre-commit filter 또는 PR 가이드라인 박제. 본 PR 비-범위 (#572 = sidecar 라이프사이클 단일 목표 + upstream 영역 인접 #573). **현재 영향도 측정 필요** (Phase 2 PR #248/#254/#257/#260 의 데코레이터 누출 여부 — developer 단계 또는 후속 분리 시 실측 박제 의무).
  2. **agy §6 누락 요소 2 — Merge Conflict Runbook** (low 후보, **Amendment 5 영역**): Phase 3 `harness update --apply-all-safe` 실행 시 upstream 리뷰 피드백 반영으로 인한 자동 머지 충돌 대응 Runbook 부재. agy 권고: `harness doctor` + Git 3-way merge 결합 절차 박제. 본 PR 비-범위 (Amendment 5 upstream 리뷰 동기화 영역, sidecar 라이프사이클 직교). 후속 분리 검토 (현재 실측 빈도 0 — 우선순위 low).
  3. **agy §6 누락 요소 3 — Linter (ESLint/markdownlint) 정합성 충돌** (low 후보, **기존 분리 [#578](https://github.com/coseo12/astro-simulator/issues/578) 영역 인접**): 데코레이터 주석 (`HARNESS-DRIFT: Z-PATTERN [TODO]`) 의 첫 줄 위치가 ESLint / markdownlint 의 autofix 규칙과 충돌 위험. agy 권고: CLAUDE.md Linter 정합성 통합 예외 처리 컨벤션 박제. 본 PR 비-범위 (#578 Prettier 정합성 영역 인접 — Amendment 10 §교차검증 §고유 발견 3 에서 이미 분리). 후속 #578 SSoT 갱신 시 본 제안 인용 박제 가능.
- **호출 전 Claude 편향 셀프 체크 4종 (모두 통과)**:
  - (a) 낙관적 일정 → ✓ developer 단계 라인 수 예측 220-320 라인 박제 + 회귀 가드 4축 검증 의무 박제 (단순 추가 작업 가정 회피). agy §3 §개선 (Phase 3 직후 찰나 CI 검증 타이밍) 박제 완료 (§회귀 가드 §(2) 3중 시뮬레이션 recovery 단계)
  - (b) 결합 간과 → ✓ `verify` 모드 fail-fast (silent leak 차단) + `sidecar-cleanup` 모드 opt-in 자동화 (사용자 시점 정리) 책임 분리 박제. Amendment 8/9/10/11 비대칭 패턴 SSoT 통합표 박제로 미래 Amendment 와의 결합 위험 차단
  - (c) 폐기 프레이밍 → ✓ Amendment 8 §sidecar 라이프사이클 계약 (fail-fast verify 모드) 폐기 아님. 보완 (opt-in 자동화 사용자 시점 정리 추가) — 양립
  - (d) 순수주의 → ✓ "자동 즉시 삭제 (옵션 A) / soft-warn 라벨 + 자동 코멘트 (옵션 B) 둘 다 도입" agy 광범위 권고 도그마 회피 — baseline sidecar 0 / orphan 0 실측 + `--dry-run` 기본 + `--apply` 분리 (precision 정정) 채택. agy §종합 결론 직접 인정 가치 박제
- **cross-validate 후속 분리 박제 의무 (volt #29 §3)**: 본 §고유 발견 1 (#581 박제 예정) 은 본 PR 머지 직후 즉시 후속 이슈 생성 의무. PM 단계로 전달 (architect → PM 인계 보고에 명시 박제)
