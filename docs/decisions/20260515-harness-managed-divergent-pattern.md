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

| 항목                       | X: upstream 단독 기여                         | Y: 프로젝트 단독 fork                      | **Z: X + Y 병행 (선반영 + upstream 동시)**        |
| -------------------------- | --------------------------------------------- | ------------------------------------------ | ------------------------------------------------- |
| 즉시성                     | ✗ (수일~수주 대기)                            | ✓ (즉시)                                   | **✓ (즉시 + 장기 동기화)**                        |
| 다운스트림 SSoT            | ✓ (자동 전파)                                 | ✗ (다른 프로젝트 재구현)                   | **✓ (upstream 머지 후 자동 전파)**                |
| drift 위험                 | 0 (manifest 와 항상 일치)                     | 높음 (`harness update` 마다 충돌)          | **중간 (upstream 머지 전까지만)**                 |
| `harness doctor` 노이즈    | 0                                             | 영구 warn                                  | **upstream 머지 전까지 warn**                     |
| 다운스트림 일반화 가치     | ✓                                             | ✗                                          | **✓**                                             |
| 본 프로젝트 D2 가시화 시점 | upstream 릴리스 후 (`harness update` 직후)    | 즉시 (본 PR 머지 직후)                     | **즉시 (본 PR 머지 직후)**                        |
| 단기 운영 비용             | 낮음 (수동 작업 0)                            | 중간 (drift 관리 영구)                     | **중간 (drift 관리 + upstream PR 작성 = 일회성)** |
| 장기 운영 비용             | 매우 낮음                                     | 높음 (모든 harness update 마다 수동 merge) | **낮음 (upstream 머지 후 본 프로젝트 변경 제거)** |
| upstream 미반영 위험       | upstream 리뷰 반려 시 본 프로젝트도 변경 없음 | 없음 (독립)                                | upstream 반려 시 Y 만 잔존 → 사실상 Y 로 회귀     |

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
5. **Phase 2 (upstream 기여) N=10 회 연속 미진행 OR Z 패턴 첫 적용 후 90일 경과** — Y (영구 fork) 회귀 신호로 간주. 트리거 발화 시 후속 행동: 3 영업일 내 [ADR Trigger] 라벨 discussion 이슈 생성 의무 (Phase 2 일괄 처리 vs 패턴 폐기 vs N 임계값 재조정 결정 분기). **2026-05-16 Amendment 2 로 N=3→10, 30일→90일 완화** (1인 운영 현실 대응, silent 가드 약화 트레이드오프 수용 — §Amendment 2 참조). **2026-05-25 Amendment 7 로 Phase 1 카운트 측정 식 정정** — ADR 자체 진화 PR (Amendment 박제 / hotfix / release) 제외하여 자기참조 인플레이션 회피 (§Amendment 7 참조). **2026-05-26 Amendment 8 로 Phase 1 드리프트 가시화 + Phase 2 중도 변경 정적 비교 가드 박제** — HARNESS-DRIFT 데코레이터 주석 의무 (`<!-- HARNESS-DRIFT: Z-PATTERN [upstream-link] -->`) + Phase 2 중도 drift 자동 비교 (Amendment 5 보완, soft-warn 라벨 부착) — silent 가드 강화 방향. 측정 식 / N 임계 / 90일 임계 변경 없음 (§Amendment 8 참조). **2026-07-14 Amendment 14 로 계약 원문 ("N=10 회 연속 미진행") 충실 구현** — 조건 2 측정을 절대 누적 회차 (`phase1Count >= N`) → **직전 Phase-2 기여 이후 연속 Phase-1 회차** (`consecutiveSinceLastPhase2 >= N`) 로 정정. 절대 누적은 단조 증가하여 Phase-2 진행 여부와 무관하게 영구 false-fire (계약의 "연속" 리셋 의미 탈락). N=10 임계 불변 — 측정 정밀화 (Amendment 7/13 동일 계열), 임계 완화 (옵션 C) 아님 (§Amendment 14 참조). **2026-07-14 Amendment 15 로 Phase-2 카운트에 substantiality (경로 denylist) 퀄리파이어 3조건 일관 적용** — 조건 1 (ratio 분자) / 조건 2 (연속 리셋 앵커) / 조건 3 (90일 클록 앵커) 을 substantive **머지** Phase-2 (모든 변경 파일이 trivial denylist 매칭이면 배제) 기준으로 정밀화. 머지된 사소 PR (README/오타 1줄) 로 조건 우회 (리셋 게이밍) 차단 + 조건 3 `ADR_FIRST_APPLY_DATE` 고정 절대 앵커 잠복 버그 (day 90 이후 영구 false-fire, #822 조건 2 와 동일 클래스) 를 substantive Phase-2 max 앵커 (없으면 firstApply fallback) 로 해소. N=10/33%/90일 임계 불변 — 모수/앵커 정밀화 (Amendment 7/13/14 동일 계열), 4건 실측 전부 substantive → backward-compat (§Amendment 15 참조).
6. **동시 활성 drift 파일 수 ≥ N=10** — 본 ADR Z 패턴이 반복 적용되어 `.harness/manifest.json` 의 sha256 과 불일치하는 활성 drift 파일이 N=10 개를 동시에 초과하면 경고 피로감 (Alert Fatigue) 위험으로 간주. 트리거 발화 시 후속 행동: 3 영업일 내 [Alert Fatigue Trigger] 라벨 discussion 이슈 생성 의무 (Phase 2 가속 / 일부 Phase 1 revert / N 임계값 재조정 결정 분기). **2026-05-26 Amendment 9 박제** — drift 카운트 차원 (활성 drift 파일 수) 은 본 #6 / Phase 2 진행률 시간/누적 차원은 #5. 둘은 직교 (서로 다른 축으로 silent 회귀 신호 포착). soft-warn (라벨 + 자동 이슈, CI hard-block 아님) — Amendment 8 §결정점 3b 옵션 A 정합 답습. 측정 식 / N 임계 / 90일 임계 (#5) 변경 없음 (§Amendment 9 참조). **2026-06-30 Amendment 13 — 첫 발화 ([#766](https://github.com/coseo12/astro-simulator/issues/766), drift 10 = N=10 경계) 결정 분기 이행**: 옵션 3′ (영구 divergent allowlist — 구조적 기여 불가능 자산 카운트 모수 제외) + 부분 옵션 1 채택. N=10 임계 불변 — 카운트 **모수** 정제 (측정 정밀화, orphan 제외 §결정점 5 동일 계열) ≠ 임계 완화 (옵션 3 silent 약화 거부). 자세히는 §Amendment 13. **2026-07-14 Amendment 15 (§재검토 조건 #5 substantiality 모수/앵커 정밀화) 는 본 #6 Amendment 13 (drift 카운트 모수 정제) 와 동일 계열** — 서로 다른 축 (#5 Phase-2 카운트 substantiality vs #6 drift 파일 카운트 allowlist) 이나 둘 다 "임계 불변 + 카운트 모수 정밀화" 접근 (§Amendment 15 참조).

### 측정 지표

- upstream 기여 PR 머지율 (Phase 2 → Phase 3 진입 비율)
- 평균 drift 노출 기간 (Phase 1 PR 머지 → Phase 3 동기화 완료)
- `harness doctor` warn 빈도 (drift 미해소 비율)
- **Phase 2 진행률 health metric** — `Phase 2 PR 제출 횟수 / Phase 1 적용 횟수 ≥ 33%` (≥ 1/3, Amendment 1 박제). 미달 시 §재검토 조건 #5 트리거 후보
- **실측 (2026-05-16)**: Phase 1 = 6회 누적 (#463/#469/#470/#471/#477/#479), Phase 2 = 0회 → 0/6 = 0% → §재검토 조건 #5 트리거 충족

### CI exit code 계약 (workflow 동작 SSoT, [#558](https://github.com/coseo12/astro-simulator/issues/558))

자동 탐지 workflow `.github/workflows/adr-z-pattern-health-v2.yml` 가 발화하는 가드 스크립트 (`verify-z-pattern-health.mjs`, `verify-harness-drift-decorator.mjs --mode={count-warn|sidecar-cleanup|todo-aging}`, `resolve-harness-drift-todo.mjs`) 의 exit code → CI 동작 매핑 SSoT:

| 가드 스크립트 exit | 의미                                            | workflow 동작                                                                          | CI 결과                                |
| ------------------ | ----------------------------------------------- | -------------------------------------------------------------------------------------- | -------------------------------------- |
| **0**              | 정상 (모든 임계값 미발화)                       | warn 없음, 자동 이슈 생성 없음                                                         | **PASS**                               |
| **1**              | 트리거 발화 (임계값 도달/초과 — soft-warn)      | `[<Trigger>] issue` 자동 생성 (중복 방지 `gh issue list --search`) + workflow `exit 0` | **PASS** (soft-warn 옵션 A 채택)       |
| **2**              | 실행 에러 (gh CLI 실패 / 파일 부재 / 환경 문제) | `exit 1`                                                                               | **FAIL** (hard-block — 환경 진단 의무) |

**결정: 옵션 A (Soft-warn)** 채택. 근거:

- **현재 운영 사실 답습** — 2026-05-25 Amendment 7 (PR #555) 시점부터 옵션 A 사실상 운영 중 (workflow 가 자동 이슈 생성 후 CI `exit 0` 박제). 본 §섹션은 **운영 사실의 SSoT 명시 박제** (행동 변화 0)
- **Amendment 2 silent 가드 약화 SSoT 정합** — 1인 운영 현실 (silent 가드 약화 트레이드오프 수용) 답습. Hard-block (옵션 B) 시 Phase 2 머지 압력 폭증 → Amendment 2/9/10/11/12 §결정점 4 silent 가드 약화 vs 강화 비대칭 정합 위반
- **Amendment 1 점진적 진화 SSoT 정합** — Phase 2 (upstream 기여) 누적 단계적 진화 답습. Hybrid (옵션 C, 90일 hard-block 에스컬레이션) 는 Amendment 11 §교차검증 §기각한 외부 모델 제안 (agy 60일 hard-block) 답습 거부 패턴 정합
- **Silent 가드 비대칭 의도적** (Amendment 8/9/10/11/12 SSoT 답습) — 데코레이터 누락 (Amendment 8) = fail-fast, 그 외 (drift 카운트 / TODO 해소 / sidecar-cleanup / TODO Aging) = soft-warn

**예외 (Hard-block 유지)**: exit 2 (실행 에러) 는 환경 진단 의무 차원으로 hard-block 유지 — 가드 자체 작동 보장 차원 (Amendment 8 §결정점 3a 정합).

**Amendment 9/10/11/12 발화 마커 일관성** (자동 이슈 생성 트리거 stdout 마커 SSoT):

- `[ADR Trigger]` — Amendment 7 §재검토 조건 #5 발화 (Phase 2 진행률)
- `[Alert Fatigue Trigger]` — Amendment 9 §재검토 조건 #6 발화 (drift 카운트)
- `[Phase 2 Sync Required]` — Amendment 8 §결정점 3b 발화 (Phase 2 중도 변경)
- `[TODO Resolution Suggested]` — Amendment 10 §결정점 3 발화 (TODO 해소 매칭)
- `[Sidecar Cleanup — Dry Run]` / `[Sidecar Cleanup — Apply]` — Amendment 11 §결정점 3 발화 (sidecar 라이프사이클)
- `[TODO Aging Trigger]` — Amendment 12 §결정점 4 발화 (TODO 시간 누적)

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

| 분류                 | PR 수 | PR 번호                       | Z 패턴 적용?    |
| -------------------- | ----- | ----------------------------- | --------------- |
| **실제 Z 패턴 적용** | **6** | #468 #472 #475 #478 #481 #482 | ✓ Phase 1       |
| ADR Amendment 박제   | 4     | #486 #489 #490 #501           | ✗ ADR 자체 진화 |
| 자동화 hotfix        | 1     | #491                          | ✗ ADR 자체 진화 |
| 릴리스 PR (v0.16.0)  | 1     | #494                          | ✗ ADR 자체 진화 |

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
- ✓ **CLAUDE.md §스프린트 계약 #10 정합**: "수치 DoD 미달 시 측정 방법 검증 우선" — DoD 가 미달이 아니라 임계 _초과_ 였으나 동일 원칙 (측정 식 검증 우선) 적용
- ✓ **다운스트림 부담 제거**: workflow 가 매주 false-positive 발화하면 alert fatigue → 진짜 트리거 발화 시 사용자 무시 위험. 정확한 측정이 silent 가드의 효과 자체를 보호

### 측정 식 정정 회귀 가드

- **자기점검 단위 검증**: 정정 후 스크립트 실행 → 6/4/66.7% 산출 + exit 0 확인 (본 PR 머지 전 D1/D2 통과)
- **회귀 가드**: workflow_dispatch 수동 트리거 1회 (default branch 반영 후, volt #69 함정 회피) → CI 환경에서도 exit 0 확인 의무
- **미래 Amendment 박제 시 카운트 동작**: 새 Amendment (예: Amendment 8) 박제 PR 은 자동으로 `isAdrEvolutionPr` 필터 통과 → 자기참조 회피 (정정 식 영구 보존)

### 트레이드오프

- **장점**: false-positive 제거 + 다음 트리거 시점 정확화 + silent 가드 본래 효과 강화 + Phase 2 강제 부담 제거
- **단점 (잠재 — [#574](https://github.com/coseo12/astro-simulator/issues/574) 후속 분리 박제)**: PR title 컨벤션 의존 — 향후 Amendment PR title 에 `Amendment N` 명시 누락 시 카운트 인플레 재현 가능. **운영 컨벤션 박제 의무 (옵션 C, 본 트레이드오프 영역)**: Amendment 박제 PR title 은 다음 regex 중 1건 정합 의무 (`isAdrEvolutionPr()` SSoT 정합 — `scripts/verify-z-pattern-health.mjs`):
  - `Amendment N` (Amendment 박제 PR — N 정수)
  - `hotfix` (Amendment 박제 후 hotfix PR)
  - `release vX.Y.Z` (release PR)

  **옵션 비교 결과 (#574 architect, 2026-05-27)**:

  | 옵션                                                                   | 동작                                                            | 운영 비용                                       | 정합성                                                               |
  | ---------------------------------------------------------------------- | --------------------------------------------------------------- | ----------------------------------------------- | -------------------------------------------------------------------- |
  | A: Semantic PRs Linter CI 통합 (`amannn/action-semantic-pull-request`) | 외부 GitHub Action 의존 + PR title 강제                         | 외부 service 의존 추가                          | 본 프로젝트 외부 의존 회피 패턴 위반                                 |
  | B: `verify-pr-title-convention.mjs` 신규 가드                          | 본 프로젝트 가드 답습 (`verify-pr-template-checklist.mjs` 정합) | CI step 추가 + 운영 부담 +1                     | 위반 빈도 < 1건 (Amendment 7 정정 후 baseline 정상) — ROI marginal   |
  | **C: 컨벤션 박제만 (가드 신규 X)**                                     | 본 ADR §단점 영역에 컨벤션 의무 명시 박제                       | **운영 비용 0** + 미래 위반 시 옵션 B 승격 가능 | **measurement-first 정합 (volt #51) + Amendment 2 silent 약화 답습** |

  **결정: 옵션 C** 채택 (#574, 2026-05-27). 근거: 현재 위반 빈도 0 (Amendment 7 정정 후 baseline) + 1인 운영 부담 회피 (Amendment 2 SSoT 답습) + 위반 발생 시점에 옵션 B 승격 경로 보존. 우선순위 low — 자기참조 인플레이션 재발 0건 (Amendment 7 정정 후 baseline 정상 유지). 미래 1+ 위반 발생 시 옵션 B 승격 후속 이슈 분리 의무.

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
- ✓ **데코레이터 누락 = CI hard-fail (fail-fast 원칙)** vs **drift 비교 = soft-warn (1인 운영 트레이드오프)** — 비대칭 의도적. 데코레이터 누락은 _컨벤션 강제_ (예방 비용 < 1줄), drift 비교는 _예방 권고_ (upstream 리뷰로 자연 해소 가능)
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

| N      | 즉시 발화?          | 운영 영향                        | 정합성                    |
| ------ | ------------------- | -------------------------------- | ------------------------- |
| 3      | ✓ (6 > 3 즉시 발화) | 6→3 revert 강제 → 운영 부담 폭증 | Amendment 1 N=3 정합      |
| 5      | ✓ (6 > 5 즉시 발화) | buffer 0 → 1 PR 머지 시 발화     | 중간                      |
| **10** | ✗ (6 < 10)          | buffer 4 → 4 PR 적용 buffer      | **Amendment 2 N=10 정합** |

**결정: N=10**. 근거:

- baseline 6 이 N=10 임계 buffer 내. 본 가드 도입이 즉시 위반 상태로 PR 들어가는 자기 모순 회피
- Amendment 1 (N=3) / Amendment 2 (N=10) 사이클 정합 — Amendment 2 의 silent 가드 약화 트레이드오프 (1인 운영) 수용 결정과 **동일 N=10** 차원만 다름 (Phase 1 회차 ↔ 활성 drift 파일 수)
- Amendment 1/2 SSoT N=10 인용으로 임계 정의 복잡도 증가 회피
- agy 제안 N=3 거부 근거 박제: agy 가 N=3 구체값 제시했으나 본 프로젝트 실측 baseline=6 검증 후 거부. **measurement-first 원칙** (CLAUDE.md §"가드 설계 원칙" + §스프린트 계약 #10) 정합 — 외부 모델 broad 권고 → 다운스트림 실측 precision 정정 답습 (volt #51 외부 툴 주장 실측 가드 + Amendment 7 의 측정 식 forensic 답습)

##### 결정점 2 — 후속 행동

| 옵션                              | 동작                                                                                                 | 정합성                                                                                          |
| --------------------------------- | ---------------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------- |
| **A: 사용자 결정 분기 자동 이슈** | drift 초과 시 [Alert Fatigue Trigger] 라벨 자동 이슈 (Phase 2 가속 / 일부 Phase 1 revert / N 재조정) | Amendment 3 의 [ADR Trigger] 자동 이슈 패턴 답습 + Amendment 8 §결정점 3b 옵션 A soft-warn 정합 |
| B: CI fail (hard-block)           | drift 초과 시 모든 PR CI fail                                                                        | Amendment 7 의 silent 가드 약화 사이클 차단 정합 — 단 1인 운영 부담 폭증                        |
| C: Hybrid                         | 임계 N 초과 시 block + 자동 이슈 생성                                                                | 임계 정의 복잡도 증가 + Amendment 8 결정점 3b 옵션 A "soft-warn" 정합 위반                      |

**결정: 옵션 A (사용자 결정 분기 자동 이슈)** + soft-warn 라벨 부착.

- 근거: Amendment 8 §결정점 3b 옵션 A (Phase 2 sync drift → soft-warn 라벨 부착) 정합. silent 가드 강화 (Amendment 8 방향) vs 약화 (Amendment 2/7) 트레이드오프 통합 — **데코레이터 누락 = fail-fast / drift 카운트 초과 = soft-warn** 비대칭 의도적 (Amendment 8 §결정점 4 답습)
- Amendment 3 의 `.github/workflows/adr-z-pattern-health-v2.yml` `[ADR Trigger]` 자동 이슈 패턴 답습 — 중복 방지 (gh issue list `--search`) + 3 영업일 결정 분기 의무 박제

##### 결정점 3 — 통합 위치

| 후보                                          | 비용                                               | 정합성                                              |
| --------------------------------------------- | -------------------------------------------------- | --------------------------------------------------- |
| 신규 스크립트 (`verify-drift-count.mjs`)      | 별도 파일 + CI step 추가                           | 운영 부담 2배 — Amendment 8 §단점 회피 정합 위반    |
| `verify-z-pattern-health.mjs` 확장            | 기존 cron + main flow 통합                         | Phase 2 진행률 + drift 카운트 차원 혼재 — 책임 결합 |
| **`verify-harness-drift-decorator.mjs` 통합** | 이미 `detectDriftFiles()` 보유 + drift 카운트 산출 | **drift 검증 + 카운트 동일 입력 단일 스크립트**     |

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
  - **#581 정정 (2026-05-27, developer 단계 후속) — title 매칭 패턴 3 정정 (`[#N]` brackets 필수)**: PR #580 reviewer 단계 false-positive 발견 (PR #254 `volt #114` → astro-simulator #114 단순 `#N` 오탐). 정정: `extractIssueRefsFromTitle()` 의 패턴 3 단순 `#N` → `\[#(\d+)\]` brackets 필수. 본 프로젝트 PR title 컨벤션 (`feat(scope): [#N] description`) 표준 답습으로 cross-repo `volt #N` / 단순 `#N` 인용 회피.
  - **#581 한계 (옵션 B/C 후속 분리 가치 박제)**: 본 정정 (옵션 A)으로 `volt #N` 같은 명백한 cross-repo 단순 인용 차단. 단 `[#252]` 같은 brackets 형식 cross-repo issue number 우연 충돌 (upstream harness-setting #252 ↔ astro-simulator #252) 잔존 — 옵션 B (PR body `volt #N` / `<owner>/<repo>#N` 형식 명시 감지 skip) 또는 옵션 C (다운스트림 OPEN 이슈 state 조회) 후속 분리 가치 보존. 현재 자동 갱신 안전망 (`--dry-run` 기본 + `--apply` 분리) 으로 file write 위험 0 → 후속 분리 우선순위 low.
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

  | Amendment     | 차원                     | 가드 방향                                                | 동기                                                                |
  | ------------- | ------------------------ | -------------------------------------------------------- | ------------------------------------------------------------------- |
  | 8 (#556)      | 데코레이터 누락          | **fail-fast** (verify 모드)                              | 컨벤션 강제 (예방 비용 < 1줄)                                       |
  | 9 (#557)      | drift 카운트 ≥ N=10      | **soft-warn** (count-warn 모드)                          | 1인 운영 alert fatigue 회피                                         |
  | 10 (#569)     | TODO 해소                | **soft-warn + opt-in 자동화** (resolve-todo wrapper)     | 사후 행동 + Phase 2 머지 대기                                       |
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
  6. **§1 §보완 누락 구조 "사후 청소(Post-Cleanup) 자동화"** — agy 직접 인용: _"Phase 3가 완료되어 로컬 파일이 업스트림 버전으로 안전하게 덮어써지면 기존 로컬 파일에 삽입했던 `HARNESS-DRIFT` 데코레이터 주석이나 sidecar 파일(`.HARNESS-DRIFT.md`)은 무용지물이 됩니다. ... 사후 라이프사이클 단계가 모호합니다."_ — **본 Amendment 11 정확히 해소 영역**. agy 가 §종합 결론에서 "제안한 세부 개선 사항(사후 청소 및 주석 유출 방지)만 보완된다면 프로덕션 환경에서 즉시 신뢰하고 적용할 수 있는 매우 강력한 아키텍처" 라고 본 Amendment 11 의 영구 박제 가치 직접 인정
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

## Amendment 12 — 2026-05-26

상태: Provisional (cross-validate 결과 본문 통합 전)

- **발의**: [#577](https://github.com/coseo12/astro-simulator/issues/577) (Amendment 10 PR [#580](https://github.com/coseo12/astro-simulator/pull/580) cross-validate agy Antigravity 고유 발견 #2 후속 분리, 2026-05-26)
- **근거** (cross-validate 원문 인용 — log `.claude/logs/cross-validate-architecture-20260526-180552.log`, agy 제안 B):
  > Phase 1에서 임시 변경을 가하며 `[TODO]` 상태로 PR을 머지한 뒤, 개발자가 업스트림 PR 생성을 영구히 잊어버려 로컬 드리프트가 고착화될 위험이 있습니다.
  >
  > 대책: `verify-harness-drift-decorator.mjs` 에서 `TODO` 토큰을 발견하고 해당 변경이 주 브랜치(`develop`/`main`)에 포함되어 있으며, 최초 발견 시점으로부터 일정 기간(예: 7일 이상) 경과했다면 빌드를 경고 혹은 실패 처리하는 단순 시간 누적 가드(Aging Guard) 도입을 검토할 가치가 있습니다.

### baseline 실측 (architect 박제 시점, develop tip ff24995)

> **developer 단계 정정 (2026-05-27, PR Amendment 12 구현)**: architect 단계 실측은 "파일 첫 박제 commit 시점" 을 사용 → 본 §결정점 6 §정의 ("`[TODO]` 토큰 라인의 git blame 최초 commit 시점") 와 불일치. developer 단계 `node scripts/verify-harness-drift-decorator.mjs --mode=todo-aging` 실측 결과 모든 6 drift 파일 [TODO] 라인이 #556 (Amendment 8 PR #571, 2026-05-26 commit `c6ea749`) 에서 박제됨 = **공통 1일 경과** (오늘 2026-05-27 기준). **결정점 2 §결정 (30일) 영향 없음** — agy 원안 7일 채택 시도도 baseline 위반 0 (모든 파일 1일). 정정 사유: ADR architect 단계 "파일 첫 박제" vs "[TODO] 라인 첫 박제" 측정 식 차이 (CLAUDE.md §스프린트 계약 #10 "수치 DoD 미달 시 측정 방법 검증 우선" 답습).

| 파일                                    | [TODO] 박제 시점 (실측 git blame)        | 경과 일수 (오늘 2026-05-27 기준) | 분류                                                                                                                                                                                                                                                                 |
| --------------------------------------- | ---------------------------------------- | -------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `CLAUDE.md`                             | 2026-05-26 (#571 Amendment 8, `c6ea749`) | **1일**                          | Phase 1 (다운스트림 분기 영역)                                                                                                                                                                                                                                       |
| `.claude/agents/architect.md`           | 2026-05-26 (#571 Amendment 8)            | **1일**                          | Phase 1 (다운스트림 분기 영역)                                                                                                                                                                                                                                       |
| `.claude/agents/pm.md`                  | 2026-05-26 (#571 Amendment 8)            | **1일**                          | Phase 1 (다운스트림 분기 영역)                                                                                                                                                                                                                                       |
| `.github/workflows/harness-guards.yml`  | 2026-05-26 (#571 Amendment 8)            | **1일**                          | Phase 1 (architect 단계 분류 "harness-managed" 는 파일 자체 출처가 #338 harness update 였음에 근거했으나, **[TODO] 라인** 자체는 #556 다운스트림 분기 commit `feat(z-pattern):` 박제 — 본 §결정점 3 §식별 휴리스틱 `chore(harness):` prefix 매칭에서 **제외 안 됨**) |
| `scripts/verify-z-pattern-health.mjs`   | 2026-05-26 (#571 Amendment 8)            | **1일**                          | Phase 1 (다운스트림 분기 영역)                                                                                                                                                                                                                                       |
| `docs/phases/roadmap-v3-incremental.md` | 2026-05-26 (#571 Amendment 8)            | **1일**                          | Phase 1 (다운스트림 분기 영역)                                                                                                                                                                                                                                       |

**식별 휴리스틱 정합성 (developer 단계 추가 발견)**: `.github/workflows/harness-guards.yml` 의 [TODO] 라인이 commit prefix `feat(z-pattern):` (Amendment 8 도입 PR) 박제 — `chore(harness):` 매칭 안 됨. 즉 본 가드 §결정점 3 §식별 휴리스틱에서 **Phase 1 다운스트림 분기로 분류**. architect 단계 §baseline 실측 표의 "harness-managed (다운스트림 해소 불가)" 분류는 **파일 출처 (manifest 등록 = harness update 박제)** 기준이었으며, **[TODO] 라인 출처 (commit prefix)** 기준 정합과 차원이 다름. 본 가드는 후자 (commit prefix) 만 사용 — 발화 시 사용자가 `.github/workflows/harness-guards.yml` 에 대한 후속 조치 (Phase 2 PR 제출 vs upstream 영역 위임) 분기 결정 의무 (architect 분류 의도 유지 측면).

추가 잔존 (텍스트 박제용 — 본 가드 휴리스틱 대상): Amendment 10 자동 해소 (`resolve-harness-drift-todo.mjs`) 가 첫 cron 시 매칭 후 갱신 예정 (`CLAUDE.md`/`.claude/agents/pm.md`/`.claude/agents/architect.md` 3건 upstream PR #254/#260 매칭). 따라서 본 baseline 시점에서 **Amendment 10 해소 후 잔존 가능 파일**은 `scripts/verify-z-pattern-health.mjs` + `.github/workflows/harness-guards.yml` + `docs/phases/roadmap-v3-incremental.md` (4 파일).

**임계 후보별 즉시 발화 검증** (measurement-first 원칙, agy 제안 임계 7일 baseline 검증):

| 임계 후보          | 위반 파일 수 (Phase 1 영역)       | 위반율        | 평가                                                                                                                                        |
| ------------------ | --------------------------------- | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------- |
| **7일 (agy 원안)** | 1건 (verify-z-pattern-health 9일) | **25%** (1/4) | **즉시 발화 위험** — baseline 1건 위반 = 가드 도입 PR 자체가 즉시 위반 상태 진입 (Amendment 9 §결정점 1 self-test 자기 모순 회피 패턴 위반) |
| 14일               | 0건                               | 0%            | buffer 5일 (verify-z-pattern-health 9일 → 14일까지 5일 여유)                                                                                |
| **30일**           | 0건                               | 0%            | **buffer 21일** (verify-z-pattern-health 9일 → 30일까지 21일 여유) — Amendment 2 N=10 / 90일 / Amendment 1 ~1 sprint 정합                   |
| 60일               | 0건                               | 0%            | buffer 51일 — 가시화 효과 약함                                                                                                              |
| 90일               | 0건                               | 0%            | Amendment 2 SSoT 동일 임계 — 차원 식별 약화 (시간 차원 중복)                                                                                |

**harness-managed 파일 카테고리 분리 의무** (결정점 3): `.github/workflows/harness-guards.yml` 은 harness update 가 frozen 파일로 박제 — 다운스트림 자체로 [TODO] 해소 불가 (upstream PR coseo12/harness-setting 영역). 본 가드는 **Phase 1 다운스트림 분기 영역** 에 한정, harness-managed 카테고리 제외 휴리스틱 필수.

### 변경 사항

#### 1. §재검토 조건 #7 신설 — TODO Aging (시간 누적 차원, Phase 1 다운스트림 분기 한정)

- **위치**: §재검토 조건 #5 (Phase 2 진행률 시간/누적 차원) + #6 (drift 파일 수 차원, Amendment 9) 와 직교한 **TODO 시간 누적 차원** 추가
- **임계값 SSoT (결정점 2)**: `TODO_AGING_THRESHOLD_DAYS = 30` — baseline 위반 0 + buffer 21일 + Amendment 2 ~1 sprint (3 PR / 30일 분량) 정합
- **시점 추적 방식 SSoT (결정점 1)**: **git blame** 채택 (메타파일 거부) — 후보 비교는 §결정점 1 참조
- **harness-managed 카테고리 분리 SSoT (결정점 3)**: 본 가드는 **Phase 1 다운스트림 분기 파일** 에 한정 — `.github/workflows/harness-guards.yml` 등 harness update 가 박제하는 frozen 파일은 제외 (휴리스틱: `.harness/manifest.json` 의 `harness-managed` 경로 매트릭스 매칭)
- **발화 형태 (결정점 4)**: **soft-warn (라벨 + 자동 이슈)** — Amendment 9/10 답습 (sidecar 라이프사이클 fail-fast 비대칭 의도적). 트리거 발화 시 후속 행동: 3 영업일 내 `[TODO Aging Trigger]` 라벨 discussion 이슈 생성 의무 — Phase 2 가속 (upstream PR 제출 강제) / 해당 [TODO] 박제 revert (Phase 1 임시 변경 폐기) / 임계값 재조정 (Amendment 2/7 silent 약화 사이클 답습 — 신중)

#### 2. 4축 결정 박제값

##### 결정점 1 — 시점 추적 방식

| 방식                                            | 장점                                                  | 단점                                                                         | 정합성                                                                    |
| ----------------------------------------------- | ----------------------------------------------------- | ---------------------------------------------------------------------------- | ------------------------------------------------------------------------- |
| **git blame** (TODO 토큰 라인 최초 commit 시점) | 신규 메타파일 0 + 운영 부담 0 + git history 신뢰 가능 | rebase / squash 시 시점 변형 위험                                            | **Amendment 8/9/10/11 단일 스크립트 통합 패턴 답습 (운영 부담 2배 회피)** |
| 별도 메타파일 (`.harness/todo-discovery.json`)  | rebase 영향 0 + 추적 명시적                           | 신규 파일 추가 + 동기화 의무 + Amendment 9 §결정점 3 단일 스크립트 통합 위반 | 운영 부담 2배                                                             |

**결정: git blame** 채택. 근거:

- rebase / squash 시점 변형 위험은 **본 프로젝트 운영 현실** 에서 marginal — 1인 운영 develop merge 정책 (gitflow squash 금지, merge commit 답습) + 본 가드는 develop tip 만 검사 (rebase 빈도 0)
- 신규 메타파일 추가 = `.harness/manifest.json` SSoT 와 분리된 트러스트 상태 — Amendment 8 §sidecar 라이프사이클 (단일 SSoT) 정합 위반
- Amendment 9/10/11 의 "단일 스크립트 통합 + 단일 SSoT" 패턴 답습
- 운영 부담 2배 회피 (메타파일 동기화 의무 + 동기화 누락 시 self-leak 위험)

##### 결정점 2 — 임계 기간

| 임계 후보      | 즉시 발화?        | 운영 영향                                   | 정합성                                                                   |
| -------------- | ----------------- | ------------------------------------------- | ------------------------------------------------------------------------ |
| 7일 (agy 원안) | ✓ (1/4 즉시 발화) | self-leak — 가드 PR 자체가 위반 상태 진입   | Amendment 9 §결정점 1 self-test 자기 모순 회피 위반                      |
| 14일           | ✗ (buffer 5일)    | 1 PR 머지 시 위반 가능 (편차 흡수 부족)     | 중간                                                                     |
| **30일**       | ✗ (buffer 21일)   | 3 PR 누적 + 1 sprint buffer                 | **Amendment 2 ~1 sprint 정합 + 30일 ≪ 90일 ≪ 시간 차원 우선순위 명확화** |
| 60일           | ✗ (buffer 51일)   | 가시화 효과 약함                            | Amendment 2 90일 비대칭 약함                                             |
| 90일           | ✗ (buffer 81일)   | Amendment 2 SSoT 중복 (시간 차원 식별 약화) | Amendment 2 SSoT 정합 — 단 차원 식별 약화                                |

**결정: 30일** 채택. 근거:

- baseline 위반 0 + buffer 21일 — Amendment 9 §결정점 1 self-test 자기 모순 회피 정합 (가드 도입 PR 자체가 즉시 위반 상태로 진입하는 자가-fail 패턴 차단)
- Amendment 2 ~1 sprint (3 PR 누적 / 30일) 정합 — `N=10 회차` (Phase 1 회차) ↔ `30일 경과` (TODO Aging) 두 시간 차원 비대칭 (회차 누적 더 빠른 임계, 시간 누적 더 느린 임계)
- agy 원안 7일 거부 근거 박제: agy 가 "예: 7일 이상" 제시했으나 본 프로젝트 baseline 실측 (verify-z-pattern-health.mjs 9일 경과) 검증 후 거부. **measurement-first 원칙** (CLAUDE.md §"가드 설계 원칙" + §스프린트 계약 #10) 정합 — 외부 모델 broad 권고 → 다운스트림 실측 precision 정정 답습 (volt #51 외부 툴 주장 실측 가드 + Amendment 7/9/10 답습)
- 90일 거부 근거: Amendment 2 §재검토 조건 #5 의 90일 SSoT 와 중복 — 시간 차원 식별 약화 (사용자가 본 가드 발화 시 #5 vs #7 차원 혼동 위험)

##### 결정점 3 — harness-managed 카테고리 분리

| 옵션                                                   | 동작                                                                            | 정합성                                                                                                                                     |
| ------------------------------------------------------ | ------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **A: harness-managed 제외 휴리스틱**                   | `.harness/manifest.json` 의 managed 경로 매트릭스 매칭 → 본 가드 검사 대상 제외 | **다운스트림 분기 영역 한정 (본 가드 본질 정합) + Y-회귀 영역 (#573) 직교**                                                                |
| B: 모든 [TODO] 검사 (구분 없음)                        | harness-managed 파일도 30일 경과 시 발화                                        | false-positive 폭증 — `.github/workflows/harness-guards.yml` 31일 경과 즉시 발화, 다운스트림 해소 불가 (upstream 영역) — 본 가드 발화 무용 |
| C: 별도 임계 (harness-managed = 90일 / Phase 1 = 30일) | 카테고리별 임계 분리                                                            | 임계값 정의 복잡도 증가 + Y-회귀 (#573) 영역 침범                                                                                          |

**결정: 옵션 A (harness-managed 제외 휴리스틱)** 채택. 근거:

- 본 가드는 **Phase 1 다운스트림 분기 영역** silent leak 차단 본질 — harness-managed (upstream 영역) 은 #573 (Y-회귀 doctor mute) 영역
- `.github/workflows/harness-guards.yml` (31일 경과) 은 harness update v3.6.0 → v3.7.x 등 upstream 릴리스 대기 영역 — 다운스트림 해소 불가
- Amendment 5 (upstream 리뷰 피드백 동기화 의무) 와 직교 — harness-managed 파일의 [TODO] 갱신은 upstream PR 영역
- **식별 휴리스틱 (developer 단계 정정)**: TODO 박제 line 의 `git blame` commit message prefix 가 `chore(harness):` 매칭 시 harness-managed 영역으로 분류 (예: `chore(harness): v2.29.1 → v3.6.0 업데이트 (#338)`). 그 외 prefix (`feat`/`fix`/`docs`/`refactor`/`chore` 그 외) 는 Phase 1 다운스트림 분기. **architect 단계 원안 (`.harness/manifest.json` 의 `apply.*` 키 매트릭스 매칭) 은 실제 manifest 구조 (`harnessVersion`/`installedAt`/`files` 만 존재, `apply.*` 키 부재) 와 불일치 — developer 단계 실측 후 정정**. 정합 정정 근거: harness update 자동화 commit 만이 upstream 영역 박제 시그널이며, manifest 키 의존 회피 (manifest 스키마 변경 시 SSoT drift 위험)

##### 결정점 4 — 발화 형태

| 옵션                                   | 동작                                                                  | 정합성                                                                                                        |
| -------------------------------------- | --------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| A: hard-fail (Amendment 8 답습)        | 30일 경과 시 CI fail                                                  | 1인 운영 부담 폭증 (Phase 2 강제 머지 압력) — Amendment 9 §결정점 4 silent 가드 강화 vs 약화 비대칭 정합 위반 |
| **B: soft-warn (Amendment 9/10 답습)** | 30일 경과 시 `[TODO Aging Trigger]` 자동 이슈 + 라벨 부착 (CI exit 0) | **Amendment 9/10 답습 — sidecar 라이프사이클 fail-fast 비대칭 의도적**                                        |
| C: Hybrid                              | 30일 → soft-warn / 60일 → hard-fail (에스컬레이션)                    | Amendment 11 §교차검증 §기각한 외부 모델 제안 (agy 60일 hard-block 에스컬레이션) 답습 거부                    |

**결정: 옵션 B (soft-warn)** 채택. 근거:

- Amendment 9 (drift 카운트) / Amendment 10 (TODO 해소) silent 가드 약화 vs 강화 비대칭 트레이드오프 답습 — **TODO 시간 누적 = 사후 행동 (Phase 2 PR 제출 또는 Phase 1 revert) → hard-block 불가 (시점 차이)**
- Amendment 11 §교차검증 §기각 (agy 60일 hard-block 에스컬레이션 거부 — silent 가드 약화↔강화 차원에 시간 차원 신규 도입 = Amendment 2 (N=10/90일) + Amendment 9 (N=10 drift 카운트) 직교 박제 본질 훼손) 답습
- 1인 운영 현실 (Amendment 2 옵션 C SSoT) — hard-fail 시 Phase 2 PR 머지 압력 폭증

##### 결정점 5 — 통합 위치

| 후보                                          | 비용                                                                             | 정합성                                                                                                                              |
| --------------------------------------------- | -------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------- |
| 신규 스크립트 (`verify-todo-aging.mjs`)       | 별도 파일 + CI step 추가                                                         | Amendment 9 §결정점 3 / Amendment 10 §결정점 1 / Amendment 11 §결정점 1 단일 스크립트 통합 패턴 답습 위반                           |
| `verify-z-pattern-health.mjs` 확장            | Phase 2 진행률 + TODO Aging 차원 혼재                                            | 책임 결합 — Phase 2 진행률 (회차 누적) vs TODO Aging (시간 누적) 다른 차원                                                          |
| **`verify-harness-drift-decorator.mjs` 통합** | 이미 [TODO] 토큰 탐지 보유 (`detectDriftFiles()`) + git blame 추가 = ~40-60 라인 | **drift 검증 + drift 카운트 (Amendment 9) + sidecar-cleanup (Amendment 11) + TODO Aging (본 Amendment 12) 단일 입력 단일 스크립트** |

**결정: `verify-harness-drift-decorator.mjs` 통합** 채택. 근거:

- 본 스크립트의 `detectDriftFiles()` 가 이미 drift 파일 + [TODO] 토큰 검색 — git blame 호출 추가 = ~40-60 라인. self-test 인라인 3중 시뮬레이션 패턴 답습 가능
- **CLI 모드 분기 SSoT 확장**: 기존 `--mode=verify` (Amendment 8) / `--mode=count-warn` (Amendment 9) / `--mode=sidecar-cleanup` (Amendment 11) + 신규 **`--mode=todo-aging`** (Amendment 12)
- Amendment 9/10/11 의 "단일 스크립트 통합 + 단일 SSoT" 패턴 답습

##### 결정점 6 (추가) — git blame 시점 정의

**TODO 박제 시점 = `[TODO]` 토큰 라인의 git blame 최초 commit 시점** (해당 라인이 처음 추가된 commit) — 라인 수정 시 git blame 이 새 commit 으로 갱신되는 표준 동작 답습.

- **rebase / squash 시점 변형 회피**: 본 프로젝트 운영 정책 (develop merge commit, squash 금지) 답습 — rebase 빈도 0 가정
- **`[TODO]` → upstream PR URL 교체 (Amendment 10)** 발생 시 라인 수정 = git blame 시점 갱신 → 자연 해소 (TODO 해소된 라인은 본 가드 검사 대상 아님)
- **신규 [TODO] 박제 = 새 line 추가** → git blame 시점 = 박제 commit 시점

### silent 가드 강화 vs 약화 자기점검

본 Amendment 12 의 방향 검증 (CLAUDE.md §"가드 설계 원칙" §의식적 silent 약화):

- ✓ **silent 가드 강화 방향** — Amendment 10 §단점 "사후 커밋 1회 의무 leak" + 영구 망각 위험 차단 = 새 차원 (TODO 시간 누적) silent 회귀 신호 가시화
- ✓ **§결정 본문 / Amendment 2 N=10 / 90일 임계 / Amendment 9 N=10 drift 카운트 변경 0** — 기존 silent 가드 본래 의도 보존
- ✓ **fail-fast (Amendment 8 데코레이터 / Amendment 11 verify) vs soft-warn (Amendment 9 drift 카운트 / Amendment 10 TODO 해소 / 본 Amendment 12 TODO Aging) 비대칭 의도적** — Amendment 8/9/10/11 답습. TODO Aging 은 사후 행동이므로 hard-block 불가 (시점 차이 — 30일 경과 시점엔 upstream PR 미제출 또는 망각 상태)
- ✓ **measurement-first 원칙 정합** — agy broad 권고 (7일 hard-block) 가 아닌 baseline 실측 (verify-z-pattern-health 9일 경과 1건) 기반 precision 정정 (30일 soft-warn) 채택. agy 권고 거부 근거 박제 (volt #51 외부 툴 주장 실측 가드)
- ✓ **§재검토 조건 #5 / #6 와 직교** — 시간/누적 차원 (#5 Phase 2 진행률) vs drift 파일 수 차원 (#6 활성 drift) vs **TODO 시간 누적 차원 (#7 본 Amendment 12)**. 셋 다 발화 시 우선순위 명시 (#5 > #6 > #7 — Phase 2 강제 우위, drift 카운트 차원 다음, TODO Aging 가장 후순위 — discussion 이슈 본문에 박제 의무)

### 트레이드오프

- **장점**:
  - agy cross-validate 고유 발견 #2 (TODO Aging) 영구 박제 — Amendment 10 §단점 "사후 커밋 1회 의무 leak" + 영구 망각 위험 차단
  - Amendment 8/9/10/11 비대칭 패턴 통합 — fail-fast vs soft-warn vs opt-in 자동화 3축 + **시간 누적 차원 신규** (Amendment 9 drift 카운트 / Amendment 10 매칭 자동화 / 본 Amendment 12 시간 누적) 직교 박제
  - harness-managed 카테고리 분리로 false-positive 회피 — #573 (Y-회귀 doctor mute) 영역 직교 보존
  - 단일 스크립트 통합 (Amendment 9/10/11 정합) — 운영 부담 2배 회피
- **단점 (잠재)**:
  - git blame 의존 — CI 환경에서 `git log --follow` 또는 `git blame` 호출 비용 (다운스트림 [TODO] 잔존 파일 ~7 파일 기준 < 1초 예상, 무시 가능)
  - rebase / squash 시점 변형 위험 (운영 정책상 현재 marginal, 미래 운영 변경 시 재검토)
  - 30일 임계 buffer 21일 — verify-z-pattern-health 9일 경과 파일이 21일 후 위반 → 본 가드 도입 PR 머지 + 21일 시점 첫 발화 가능. **이는 본 가드 본질 (Amendment 10 자동 해소 21일 cron 안 매칭 시 발화)** — 정상 동작

### Concrete Prediction (developer 단계 변경 예측 박제)

- 신규 코드:
  - `scripts/verify-harness-drift-decorator.mjs` 확장: CLI 플래그 (`--mode=todo-aging`) 분기 + git blame 호출 + 30일 임계 비교 + harness-managed 카테고리 제외 휴리스틱 + soft-warn stdout 출력 — **~40-60 라인**
  - self-test 확장: `--mode=todo-aging` positive (29일 경과 — exit 0) / negative (31일 경과 — exit 0 + warn) / boundary (30일 정확 — exit 0) / harness-managed 제외 (90일 경과해도 제외) — **~50-80 라인**
- CI workflow 변경: `.github/workflows/adr-z-pattern-health-v2.yml` 에 step 추가 (`Verify TODO Aging Threshold` + `Create [TODO Aging Trigger] issue`) — **~30-50 라인** (Amendment 9 `[Alert Fatigue Trigger]` / Amendment 10 `[TODO Resolution Suggested]` step 답습)
- ADR Amendment 12 자체: 본 §섹션 ~180-220 라인 박제 완료
- harness-managed 파일 변경: 0 (정책 + 가드만, 기존 파일 무영향)
- **총 예상 라인 수**: 250-360 라인 (스크립트 + workflow + ADR + 테스트)
- 행동 변화 (CHANGELOG `### Behavior Changes` 후보 — developer 단계 박제): "월 cron 시점 다운스트림 `[TODO]` 박제 시점 + 30일 경과 + Phase 1 다운스트림 분기 영역 매칭 → `[TODO Aging Trigger]` 자동 이슈 생성" (MINOR 릴리스 후보) — 단, 본 PR 은 ADR Amendment 만 박제 (CHANGELOG 미터치, developer 단계에서 추가)

### 회귀 가드 (CLAUDE.md §"가드 도입 PR DoD" 4축)

- **(1) 격리 동적 테스트**: developer 단계에서 `node scripts/verify-harness-drift-decorator.mjs --self-test` PASS 의무. todo-aging 모드 self-test 케이스 추가 의무.
- **(2) 3중 시뮬레이션** (positive → negative → recovery):
  - positive: TODO 박제 29일 경과 → `--mode=todo-aging` 호출 → "OK" 출력 + exit 0
  - negative: TODO 박제 31일 경과 → `--mode=todo-aging` 호출 → `[TODO Aging Trigger]` 마커 + 파일 목록 + exit 0 (soft-warn)
  - recovery: 31일 경과 파일의 [TODO] → upstream PR URL 교체 (Amendment 10 자동 해소) → 다음 cron `--mode=todo-aging` 호출 → "OK" + exit 0
- **(3) 5 페르소나 self-consistency**: 본 ADR 박제 직후 cross-validate (architect 단계 의무) + 후속 developer/reviewer/qa 단계 페르소나가 동일 결론 (git blame / 30일 / harness-managed 제외 / soft-warn / verify-harness-drift-decorator 통합) 도출 검증
- **(4) 메타 측정 도구 자기 적용 안정성**: 본 가드 도입 PR 자체는 ADR Amendment 만 박제 (코드 변경 0) — developer 단계 자기 검증 의무 (현재 baseline verify-z-pattern-health.mjs 9일 < 30일 → 본 가드 PR 자체가 즉시 위반 상태로 진입하는 자기 모순 회피, 결정점 2 SSoT 정합)

### cross-link

- 본 Amendment, [#577](https://github.com/coseo12/astro-simulator/issues/577) 이슈 본문
- cross-validate 원본 (Amendment 10 발의): `.claude/logs/cross-validate-architecture-20260526-180552.log` (PR #580 cross-validate agy 고유 발견 #2)
- 직전 Amendment: [#572](https://github.com/coseo12/astro-simulator/issues/572) Amendment 11 (Phase 3 sidecar 라이프사이클 자동화)
- 인접 박제 의무 인용: Amendment 10 §교차검증 §고유 발견 2 (TODO Aging Guard, agy 제안 B) — 본 Amendment 12 가 해소 자리
- 자동화 스크립트: `scripts/verify-harness-drift-decorator.mjs` (`--mode=todo-aging` 신규 — developer 단계)
- CI workflow: `.github/workflows/adr-z-pattern-health-v2.yml` (확장, `[TODO Aging Trigger]` step 추가 — developer 단계)
- 가드 설계 원칙: CLAUDE.md §"가드 설계 원칙 — measurement-first / 의식적 silent 약화 / fail-fast" (volt [#101](https://github.com/coseo12/volt/issues/101) / [#106](https://github.com/coseo12/volt/issues/106) / [#107](https://github.com/coseo12/volt/issues/107))
- 외부 모델 실측 가드: volt [#51](https://github.com/coseo12/volt/issues/51) (외부 툴 주장 실측 가드 — agy 7일 임계 권고 → baseline 실측 후 30일 정정 패턴 답습)
- 비대칭 가드 패턴 SSoT (Amendment 8/9/10/11/12 통합): 본 §silent 가드 강화 vs 약화 자기점검 + Amendment 11 §결정점 4 표 갱신 (developer 단계 의무)
- 후속 분리 영역 (본 PR 비-범위): [#573](https://github.com/coseo12/astro-simulator/issues/573) (Y-회귀 시 doctor mute — upstream 영역, harness-managed 카테고리 직교), [#578](https://github.com/coseo12/astro-simulator/issues/578) (Prettier 정합성 교차 검증), [#581](https://github.com/coseo12/astro-simulator/issues/581) (Upstream PR 데코레이터 오염 방지 — Amendment 11 §고유 발견 1)

### 교차검증 반영 사항 (agy Antigravity, 2026-05-26)

> **본 §섹션은 Provisional 상태 — cross-validate 결과 본문 통합 완료. 사용자 승인 후 Accepted 전이** (CLAUDE.md §"ADR Status 워크플로 (Provisional → Accepted, 부분 도입 — #370 옵션 C)" §전이 절차, #566 PR #584 머지 사례 답습).

- **outcome**: `applied` (exit 0) — log `.claude/logs/cross-validate-architecture-20260526-234223.log`, outcome JSON `.claude/logs/cross-validate-architecture-20260526-234223-outcome.json` (plan_bypass=false, rollback_failed=false, reminder_issue="none")
- **합의** (Claude 설계와 일치 — 5건, ADR 전반 평가 + 본 Amendment 12 영역 정당성 간접 확인):
  1. **구조적 완성도 우수** — Phase 1/2/3 closed-loop + 폴백 (Z → Y 회귀) 라이프사이클 정교
  2. **1인 개발 임계 조정 (Amendment 2) 매우 현실적** — 지나치게 엄격한 규제는 프로세스 우회 + 피로감 유발
  3. **자기참조 인플레이션 제거 (Amendment 7) 매우 정확** — 포렌식 분석 + `isAdrEvolutionPr` 필터 정합성 높음
  4. **데코레이터 + 사이드카 (Amendment 8) 추적성 탁월** — JSON 사이드카 합리적 차선책
  5. **인터페이스 명확성 — 하드블록 vs 소프트워닝 분리 = 엔지니어링 모범 사례** (Amendment 8/9/10/11/12 silent 가드 비대칭 SSoT 답습 정합)
- **Amendment 12 직접 검증 간접 확인 (핵심)**:
  - agy §6 §누락 요소 §CRITICAL VULNERABILITY 가 본 Amendment 12 영역을 정확히 식별: _"개발자가 `[TODO]` 상태로 머지한 후 업스트림 PR 생성을 잊어버리면, CI 가드는 데코레이터가 존재하므로 통과시키고 결과적으로 시스템은 영구 포크(Y) 상태로 조용히 전락"_
  - agy 가 본 ADR 의 Amendment 12 자체 본문을 직접 평가하지 않고 (ADR 본문 통째 입력의 토큰 제한 영향 추정) 누락 요소로 동일 영역 지적 — **본 Amendment 12 의 영역 정당성 간접 확인** (agy ≈ Claude 합의)
- **이견 수용 (본 PR 즉시 반영)**: 0건 — agy CRITICAL 권고 (hard-fail) 와 Claude 정정 (30일 soft-warn) 의 차원이 다르며 (즉시 차원 vs 시간 누적 차원), Claude 정정이 Amendment 10 §결정점 3 SSoT 정합. 본 §교차검증 §기각 항목 참조
- **Claude 재분석으로 기각한 외부 모델 제안 (2건)**:
  1. **agy CRITICAL §6 — `develop`/`main` 머지 PR 검증 단계 `[TODO]` 포함 시 CI Hard-fail**:
     - agy 권고: PR 검증 스크립트 (`verify-harness-drift-decorator.mjs`) 에 브랜치 컨텍스트 검증 추가. feature/\* 에서는 [TODO] 허용, develop/main 대상 머지 PR 에서는 [TODO] = CI Hard-fail (실제 PR URL 만 허용)
     - **기각 근거 1 (차원 정합)**: agy 권고는 **머지 시점 차원** (브랜치 컨텍스트 즉시 차단), 본 Amendment 12 는 **시간 누적 차원** (30일 경과 시 soft-warn). 둘은 차원이 다르며 **본 Amendment 12 시간 누적 차원이 Amendment 10 SSoT 정합** — 머지 시점 즉시 차단 = Phase 1 작업 자체 차단 (Amendment 10 자동 해소 의도 무효화)
     - **기각 근거 2 (Amendment 10 §결정점 3 §발화 형태 SSoT 정합 위반)**: Amendment 10 §결정점 3 가 "hard-fail 거부 — Phase 2 머지 직후 1~3 사이클 내 자연 해소 가능 + 1인 운영 부담 가속" 명시. agy hard-fail 권고는 Amendment 10 SSoT 직접 위반. 본 Amendment 12 의 soft-warn 채택이 정합
     - **기각 근거 3 (1인 운영 트레이드오프, Amendment 2 SSoT 정합)**: 머지 시점 hard-fail = upstream PR 제출 강제 압력 폭증 → Amendment 2 §"silent 가드 약화 트레이드오프 (CRITICAL)" §"1인 운영 현실 대응 완화" SSoT 위반
     - **기각 근거 4 (Amendment 11 §교차검증 §기각 답습)**: Amendment 11 가 이미 agy 의 "60일 hard-block 에스컬레이션" 권고를 _"silent 가드 약화↔강화 차원에 시간 차원 신규 도입 → Amendment 2 (N=10/90일) + Amendment 9 (N=10 drift 카운트) 직교 박제 본질 훼손"_ 근거로 기각. 본 Amendment 12 의 agy hard-fail 권고 기각이 답습 (시간 차원 신규 도입 자체는 본 Amendment 12 본질 — 단 hard-fail 형태가 아닌 soft-warn 형태)
     - **양립 가치 박제**: agy hard-fail 권고는 본 PR 비-범위로 거부했으나 **머지 시점 차원** 자체는 별도 후속 분리 가치 있음 (low 우선순위 — Amendment 12 30일 buffer 가 1인 운영에서 충분한지 운영 사이클 1~3 회 측정 후 정정 가능). 후속 분리 영역 박제
  2. **agy §6 §누락 요소 §2 — Prettier 무시 설정 강제화**:
     - agy 권고: ADR 배경에 `.prettierignore` 블록 보호 명시했으나 Phase 1 운영 절차에 ".prettierignore 임시 등록" 의무화 부재. lint-staged / prettier 가 데코레이터 박제 파일을 변조하여 해시 불일치 충돌 가속 위험
     - **기각 근거 (이미 분리됨)**: 본 PR 비-범위 — Amendment 10 §교차검증 §고유 발견 3 (agy 제안 C) 에서 이미 [#578](https://github.com/coseo12/astro-simulator/issues/578) 로 분리 박제. agy 가 본 ADR 의 후속 분리 영역 미인지 (Amendment 10 §교차검증 본문 입력 토큰 제한 추정)
- **고유 발견 (후속 분리, volt #29 3단 프로토콜 — 2건)**:
  1. **agy §1 §구조적 공백 §1 — Phase 3 사이드카 정리 스크립트 부재** (이미 박제됨, **#572 → PR #582/#583 Amendment 11**): agy 권고 "스크립트나 가이드 명령 (예: `npm run harness:drift-clean`)" — **Amendment 11 §1 (`--mode=sidecar-cleanup` CLI) 가 정확히 해소 완료**. agy 가 본 ADR 의 Amendment 11 영역 미인지 — 본 Amendment 12 §교차검증 §고유 발견 1 박제값이 미래 reviewer 단계 답습 가능 (인접 박제)
  2. **agy §1 §구조적 공백 §2 — 로컬 도구 지원 (개발자 CLI 헬퍼)** (low 후보, **신규 후속 분리 박제 예정 — 본 PR 비-범위**): 개발자가 직접 수동으로 각 언어 규칙에 맞춰 데코레이터 주석 / 사이드카 파일을 생성하는 과정 인지 부하 크다. CLI 헬퍼 (예: `pnpm harness:drift add <file>` — 파일 형식 자동 감지 + 데코레이터 자동 박제 + sidecar 자동 생성) 가치. 본 PR 비-범위 (#577 = TODO Aging Guard 단일 목표 + 시간 누적 차원). 후속 분리 시 사용자 결정 (Phase 2 가속 / 별도 이슈 분리 / 우선순위 low — 현재 박제 빈도 < 5건 marginal, agy §1 §우수한 점 §"인지 부하" 자체는 시인 가능). 후속 분리 사용자 승인 시 PM 단계 위임.
- **호출 전 Claude 편향 셀프 체크 4종 (모두 통과)**:
  - (a) 낙관적 일정 → ✓ developer 단계 라인 수 예측 250-360 라인 박제 + 회귀 가드 4축 검증 의무 박제 (단순 추가 작업 가정 회피). agy §1 §구조적 공백 (사이드카 / 도구 지원) 박제 완료 (§고유 발견 후속 분리)
  - (b) 결합 간과 → ✓ §재검토 조건 #5 (Phase 2 진행률) ↔ #6 (drift 파일 수) ↔ #7 (TODO 시간 누적) 직교 박제. 동시 발화 시 우선순위 명시 (#5 > #6 > #7). harness-managed 카테고리 (#573 영역) 분리 박제로 Y-회귀 영역 결합 차단. agy CRITICAL (머지 시점 차원) vs 본 Amendment 12 (시간 누적 차원) 결합 분리 박제 (§기각 §1)
  - (c) 폐기 프레이밍 → ✓ Amendment 10 (TODO 해소 자동화) 폐기 아님. 보완 (시간 누적 차원 — 매칭 실패 + 시간 경과 시 발화) — 양립. agy hard-fail 권고도 Amendment 10 폐기 프레이밍 위반으로 기각 (§기각 §1 §기각 근거 2)
  - (d) 순수주의 → ✓ "agy 제안 7일 hard-block" broad 권고 도그마 회피 — baseline 실측 (verify-z-pattern-health 9일 경과) + 30일 soft-warn + harness-managed 제외 (precision 정정) 채택. agy CRITICAL hard-fail 권고도 동일 도그마 회피 패턴으로 기각 (§기각 §1)
- **cross-validate 후속 분리 박제 의무 (volt #29 §3)**: 본 §고유 발견 2 (CLI 헬퍼) 는 본 PR 머지 직후 즉시 후속 이슈 생성 의무 여부 사용자 결정 — PM 단계 위임 가능 (architect → PM 인계 보고에 명시 박제). 우선순위 low — 1인 운영 박제 빈도 < 5건 marginal.

## Amendment 13 — 2026-06-30

상태: Accepted (cross-validate 2026-06-30 — agy Antigravity, §교차검증 반영 사항 4축 분류 + Claude 편향 셀프 체크 본문 통합 완료)

> **forensic 변형 채택**: 본 Amendment 는 일반 Amendment 형식을 따르되 forensic ADR 변형 (§Forensic ADR 변형, CLAUDE.md) 의 측정 데이터 박제 + 가설 비교 + 5±2 옵션 비교를 강화한다. forensic 5조건 판정은 §forensic 판정 참조.

- **발의**: [#766](https://github.com/coseo12/astro-simulator/issues/766) ([Alert Fatigue Trigger] 자동 탐지 2026-06-29 — §재검토 조건 #6 / §Amendment 9 §결정점 2 옵션 A 가 규정한 결정 분기 의무 이행)
- **트리거**: Amendment 9 §재검토 조건 #6 단일 발화 — 활성 drift 파일 수 = N=10 도달 (경계 발화). §재검토 조건 #5 (Phase 2 진행률) 는 미발화 (실측 §forensic 측정 참조) → 본 Amendment 13 은 #6 차원 단독 결정 분기.
- **forensic 변형 사유**: §재검토 조건 #6 발화는 단순 임계 도달이 아니라 **카운트 모수 자체의 구성 (구조적 기여 가능 vs 불가능 자산 혼재)** 이 핵심 쟁점 — runtime 측정 (manifest 분류 실측) 없이 옵션 결정 불가. Amendment 4/6 (§재검토 조건 #5 발화 후속 결정) 의 단순 "Phase 2 진행" 답습으로는 본 발화의 40~50% 구조적 divergent 자산을 영구 해소 불가능.

### forensic 판정 (5조건 중 4개 충족 → forensic 측정 데이터 박제)

| 조건                        | 충족     | 근거                                                                                                                                                                                        |
| --------------------------- | -------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 1. 가설 N≥2                 | ✓        | "drift 10 = Z 패턴 과누적" (가설 A) vs "drift 10 = 카운트 모수에 구조적 divergent 자산 혼재" (가설 B). 실측으로 가설 B 확정 (§forensic 측정 §가설 검증)                                     |
| 2. Runtime 측정 데이터 필수 | ✓        | `--mode=count-warn` / `--mode=verify` + `.harness/manifest.json` 277 파일 분류 실측이 옵션 결정의 결정적 근거. 정적 코드 리뷰만으로 "어느 4~5개가 구조적 기여 불가능한지" 판별 불가         |
| 3. DoD PASS 인데 회귀       | △ (부분) | `decorator PASS: 10 / FAIL: 0` (Amendment 8 가드 통과) 인데 `[Alert Fatigue Trigger]` 발화 (Amendment 9 가드 신호). "데코레이터 정합인데 카운트 임계 도달" = 측정 통과 ↔ 운영 신호 mismatch |
| 4. 5±2 옵션 비교            | ✓        | 옵션 1 / 2 / 3 / 3′ + 조합 (3′+1) — §옵션 비교 참조                                                                                                                                         |
| 5. Amendment 라운드 N 예상  | ✓        | (1) 본 Amendment cross-validate 후속 갱신 예상 (2) N=10 의 baseline 정제 후 buffer 재발화 가능 (3) allowlist 진입 조건의 운영 1~3 사이클 후 정정 가능                                       |

→ 4개 충족 (1/2/4/5 명확, 3 부분) ≥ 3 → forensic 측정 데이터 박제 의무. 단 본 건은 §Amendment 9 §재검토 조건 #6 의 결정 분기 이행이므로 **Amendment 섹션 구조** 를 유지 (신규 forensic ADR 파일 분리 시 §재검토 조건 #6 ↔ 결정이 다른 문서로 흩어져 추적성 손실 — §Amendment vs 신규 ADR 판정 참조).

### Amendment vs 신규 ADR 판정 → Amendment 13 채택

- **판정: 동일 ADR 의 Amendment 13**. 근거:
  1. **§Amendment 9 §재검토 조건 #6 의 결정 분기 이행** — Amendment 9 가 "트리거 발화 시 3 영업일 내 결정 분기 의무" 를 규정. 그 이행은 같은 ADR 의 Amendment 가 정합 (Amendment 4/6 이 §재검토 조건 #5 발화 후속 결정을 같은 ADR Amendment 로 박제한 선례 답습)
  2. **결정이 기존 §재검토 조건 #6 / §Amendment 9 §결정점 5 (임계 비교 대상) 를 직접 갱신** — 옵션 3′ (영구 divergent allowlist) 채택 시 카운트 모수 정의 (`detectDriftFiles().length` → allowlist 제외 후 카운트) 가 변경됨. 이는 Amendment 9 §결정점 5 SSoT 갱신이므로 동일 ADR 내 박제가 추적성 보장
  3. **신규 ADR 분리 거부 근거** — Z 패턴 / drift 가드 라이프사이클은 본 ADR 단일 SSoT. 분리 시 "왜 카운트 모수가 정제됐는가" 가 §Amendment 9 와 분리되어 미래 관찰자가 재구성 불가

### 변경 사항

#### 1. §재검토 조건 #6 결정 분기 결과 — 옵션 3′ + 부분 옵션 1 (조합 채택)

- **결정 요약**: (3′) 영구 divergent allowlist 도입으로 카운트 모수 정제 (구조적 기여 불가능 자산 제외) + (1) allowlist 비대상 텍스트 파일 5개의 Phase 2 (upstream 기여) 점진 진행. 옵션 2 (revert) / 옵션 3 (N 재조정) 거부.
- **옵션 3′ 가 silent 약화 (옵션 3) 가 아니라 측정 정밀화인 핵심 논거**: N=10 임계는 **변경 없이 유지**. 변경되는 것은 **카운트 모수** (무엇을 "활성 Z 패턴 적용 drift" 로 셀 것인가). 구조적으로 upstream 기여 불가능한 자산 (천체 시뮬 README 스크린샷) 은 §Amendment 9 §결정점 5 가 정의한 측정 본질 ("Z 패턴 활성 적용 누적") 의 모수가 **아니다**. 이미 §Amendment 9 §결정점 5 가 orphan sidecar 를 동일 논거 (측정 의미 혼재 회피) 로 제외한 선례와 같은 계열 — orphan 제외가 silent 약화가 아니듯, 구조적 divergent 제외도 측정 정밀화. 자세한 구분 기준은 §변경 사항 3 박제.

#### 2. 영구 divergent allowlist 설계 (옵션 3′ 채택분)

- **자료 구조 SSoT**: `scripts/verify-harness-drift-decorator.mjs` 내부 상수 `PERMANENT_DIVERGENT_ALLOWLIST` — `{ path, reason, structuralProof }` 객체 배열. 별도 JSON 파일 분리 거부 (Amendment 9 §결정점 5 단일 스크립트 통합 패턴 답습 — 측정 SSoT 와 모수 정의가 같은 파일에 있어야 추적성 보장)
- **카운트 적용 지점**: `runCountWarn()` 의 `detectDriftFiles()` 결과에서 allowlist `path` 매칭 파일 제외 후 `count` 산출. `runVerify()` (Amendment 8 데코레이터 가드) 는 **영향 없음** — 데코레이터 의무는 모든 drift 파일에 유지 (allowlist 자산도 데코레이터 면제 아님. PNG binary 는 기존대로 `unknown` 포맷 면제, 단 manifest 등록 자산이므로 카운트 모수에서만 제외)
- **(a) allowlist 항목별 사유 박제 의무**: 각 항목에 `reason` (1줄 요약) + `structuralProof` (구조적 기여 불가능 입증 — 아래 진입 조건 충족 근거) 필드 필수. 빈 사유 항목 박제 시 self-test FAIL (회귀 가드)
- **(b) allowlist 자체 회귀 가드** (4중 — cross-validate 2026-06-30 으로 4번 Forbidden Path 추가):
  1. **항목 schema 검증** — self-test 에서 모든 항목이 `path` / `reason` / `structuralProof` non-empty string 보유 검증. 누락 시 FAIL
  2. **진입 조건 입증 검증 (positive — allow-list 매칭)** — 각 항목의 `structuralProof` 가 진입 조건 (§아래) 식별자 중 1건 이상 매칭 검증. 임의 사유 박제 차단. `structuralProof` 는 진입 조건 식별자 (`content-asset` / `domain-doc` / `perpetual-rewrite`) 의 Enum 배열로 관리 — `includes()` 부분 문자열이 아닌 정확 매칭 (cross-validate agy 고유 발견 2 수용 — 매칭 인터페이스 규격 명시)
  3. **stale 항목 검증** — allowlist `path` 가 실제 manifest 에 등록되어 있고 + 현재 drift 상태인지 검증. manifest 미등록 OR drift 해소 항목은 stale → self-test WARN (Amendment 11 orphan sidecar 정리 패턴 답습 — allowlist 무한 잔존 방지). **stale WARN → FAIL 에이징 (PR=WARN / 릴리스=FAIL 이원화) 은 후속 분리** (cross-validate agy 고유 발견 3 — Amendment 12 TODO Aging Guard 동일 패턴, 운영 데이터 1~3 사이클 축적 후)
  4. **Forbidden Path 차단 검증 (negative — deny-list 하드 가드)** — allowlist `path` 가 범용 harness 가드/페르소나 deny-list 패턴 (`FORBIDDEN_ALLOWLIST_PATH_PATTERNS` SSoT — `scripts/(서브디렉토리/)verify-*.{mjs,cjs,js,sh}`, `(루트/중첩)CLAUDE.md`, `.claude/agents/*.md`, `.claude/skills/**`, `.github/workflows/*.yml`) 에 매칭되면 **self-test FAIL** (WARN 아님 — 우회 차단은 hard-fail). 진입 조건 매칭 (positive 2번) 을 통과해도 deny-list 매칭 시 무조건 FAIL. **근거**: cross-validate agy 보안 고유 발견 1 — allowlist 가 옵션 1 (Phase 2 upstream 기여) 회피의 우회로로 악용될 위험 (개발자가 CI 통과 위해 범용 가드를 `reason`/`structuralProof` 허위 작성으로 위장 등록) 을 기계적으로 차단. **deny-list 완전성 확장 (reviewer 권고 1, 2026-06-30 본 PR 반영)**: 초기 `scripts/verify-*.mjs` 만 매칭하던 패턴을 `.sh` 가드 (`verify-agent-ssot.sh` 등) + 서브디렉토리 (`scripts/sub/verify-*.mjs`) + 중첩 `CLAUDE.md` 까지 확장 — 의도 ("범용 가드 진입 불가") 와 구현 매칭 정합. §변경 사항 2 (d) 진입 금지 자산 목록의 _설명_ 을 _기계 검증_ 으로 승격 (positive 진입 조건과 직교 보강)
- **(c) "측정 정밀화 vs 약화" 구분 기준 (ADR 명문화)**:

  | 구분        | 측정 정밀화 (allowlist 정당)                                  | silent 약화 (금지 — 옵션 3)                          |
  | ----------- | ------------------------------------------------------------- | ---------------------------------------------------- |
  | 변경 대상   | 카운트 **모수** (무엇을 셀 것인가)                            | 카운트 **임계** (N 값)                               |
  | 정당화 근거 | 구조적 기여 불가능 **입증** (객관)                            | 발화 빈도 부담 (주관)                                |
  | 측정 본질   | §Amendment 9 §결정점 5 "Z 패턴 활성 적용 누적" 모수 정합 보존 | 측정 본질 훼손 (적용 누적인데 임계만 완화)           |
  | 선례        | orphan sidecar 제외 (§결정점 5)                               | Amendment 2 N=3→10 (의식적 silent 약화 트레이드오프) |
  - **판정 질문 (allowlist 진입 전 의무)**: "이 자산을 카운트에서 빼는 이유가 (A) 구조적으로 upstream 기여가 불가능함을 입증할 수 있어서인가, (B) 단지 발화가 잦아 부담스러워서인가?" → A 만 allowlist 정당. B 는 옵션 3 (silent 약화) 이므로 Amendment 2/7 §결정 CRITICAL 절차 (의식적 약화 박제) 경유 의무

- **(d) allowlist 진입 조건 (구조적 기여 불가능 입증 — 무한 팽창 차단)**: 아래 식별자 중 **1건 이상** 충족 + `structuralProof` 에 명시 의무:
  1. **콘텐츠 자산 (`content-asset`)** — manifest 에 harness 데모/플레이스홀더 자산으로 등록됐으나 프로젝트가 자기 도메인 콘텐츠로 영구 교체. 범용 harness 템플릿에 기여 시 부적절 (예: 천체 시뮬 스크린샷). 추가 입증: 프로젝트 문서 (README 등) 직접 참조 + 도메인 고유성
  2. **도메인 고유 문서 (`domain-doc`)** — 프로젝트 도메인 전용 로드맵/기획/회고 등. harness 가 빈 템플릿/예시로 제공했으나 프로젝트 고유 내용으로 영구 교체. 범용성 0 (예: `roadmap-v3-incremental.md` 천체 시뮬 전용)
  3. **재교체 영속성 (`perpetual-rewrite`)** — 정기 운영 (릴리스마다 README 스크린샷 갱신 등) 으로 sha 가 영구 재변경되어 upstream 기여로 1회 해소 불가능. 보조 입증 — 위 1/2 와 AND 결합 가능
- **진입 조건 미충족 자산 (allowlist 금지)**: `.claude/agents/*.md`, `CLAUDE.md`, `scripts/verify-*.mjs`, `.claude/skills/**`, `.github/workflows/*.yml` 등 **범용 harness 가드/페르소나** 는 진입 불가 — 이들은 옵션 1 (Phase 2 upstream 기여) 의 정당한 대상. allowlist 로 빼면 진짜 silent 약화. **이 목록은 §변경 사항 2 (b) 4번 Forbidden Path 회귀 가드 (negative deny-list hard-fail) 로 기계 검증** — 설명에 그치지 않고 self-test 가 deny-list 매칭 시 무조건 FAIL (cross-validate 2026-06-30 수용)

#### 3. orphan 제외 로직과의 정합성

- **동일 계열 입증**: §Amendment 9 §결정점 5 가 orphan sidecar 를 "측정 의미 혼재 회피 — Phase 3 정리 누락 ≠ Z 패턴 누적" 논거로 카운트에서 제외했다. allowlist 는 같은 논거의 확장 — "구조적 divergent 자산 ≠ Z 패턴 활성 적용 누적". 둘 다 **N 임계 불변 + 모수 정제**
- **구현 정합**: `runCountWarn()` 에서 orphan 제외 (이미 `detectDriftFiles()` 가 orphan 미포함) 와 동일 지점에 allowlist 제외 추가. 측정 의미 SSoT 단일화

#### 4. Z-패턴 재귀 처리 (가드가 자기 자신의 카운트 모수를 바꿈)

- **재귀 구조 명시**: 옵션 3′ 구현은 `scripts/verify-harness-drift-decorator.mjs` (이미 `[TODO]` drift 상태) 를 수정한다. 이 파일은 manifest 등록 + 현재 drift 상태 + Amendment 9 카운트 모수의 일부 (= 10개 중 1개 아님 — 확인: 본 파일은 현재 drift 10 목록에 **미포함**. §forensic 측정 참조). 단 옵션 3′ 가 본 파일을 추가 수정하면 sha 가 manifest 와 더 멀어진다 (drift 심화). 그러나 **새 drift 파일 수 증가는 0** (이미 drift 상태 파일의 sha 변경일 뿐)
- **재귀 안전성 박제**:
  1. **카운트 모수 자기 참조 회피** — allowlist 에 `verify-harness-drift-decorator.mjs` 자신을 넣지 **않는다**. 본 파일은 범용 harness 가드 (옵션 1 대상) 이지 구조적 divergent 아님. 자기 자신을 모수에서 빼면 Amendment 7 의 자기참조 인플레이션 (측정 식이 자기 진화를 카운트) 의 역방향 변형 (측정 식이 자기를 카운트에서 누락) 발생 → 금지
  2. **수정 후 즉시 재발화 여부 실측 의무** — developer 단계에서 옵션 3′ 구현 후 `--mode=count-warn` 재실행. allowlist 제외로 count 가 N 미만 (예: 10 → 6, 스크린샷 4 제외) 으로 떨어지는지 실측. 만약 모수 정제 후에도 여전히 ≥ N 이면 옵션 1 (Phase 2) 병행이 카운트 해소의 주 경로임을 박제
  3. **가드가 자기 카운트를 바꾸는 것의 정당성** — Amendment 7 forensic (측정 식이 자기 진화 PR 을 카운트하는 인플레이션 정정) 과 동일 패턴. 측정 도구가 측정 대상의 일부일 때, 모수 정의를 명시적으로 정제하는 것은 self-reference 결함의 **해소** 이지 도입이 아님. 단 §재귀 안전성 1 (자기 자신 미포함) 로 역방향 결함 차단

### 옵션 비교 (§재검토 조건 #6 결정 분기 — 5±2 옵션 축별 trade-off)

| 축                                           | 옵션 1 (Phase 2 가속)           | 옵션 2 (Phase 1 부분 revert)     | 옵션 3 (N 임계 재조정)               | **옵션 3′ (영구 divergent allowlist)** |
| -------------------------------------------- | ------------------------------- | -------------------------------- | ------------------------------------ | -------------------------------------- |
| **drift 10 해소 범위**                       | 텍스트 5개만 (upstream 머지 시) | revert 한 만큼                   | 즉시 (임계만 올림)                   | 스크린샷 4 + roadmap 1 = 5개 모수 제외 |
| **구조적 divergent (스크린샷/roadmap) 처리** | ✗ 영구 해소 불가 (기여 부적절)  | revert 시 프로젝트 자산 손실     | 카운트만 회피 (모수 그대로)          | ✓ 모수 정제로 영구 정합                |
| **silent 약화 여부**                         | 약화 0 (정공법)                 | 약화 0 (단 자산 손실)            | **약화 (Amendment 2/7 사이클 답습)** | **약화 0 (모수 정제 = 측정 정밀화)**   |
| **measurement-first 정합**                   | —                               | —                                | ✗ (주관적 부담 기반)                 | ✓ (구조적 입증 기반)                   |
| **운영 부담**                                | upstream PR 5건 제출 (점진)     | 프로젝트 교훈/가드 손실 (부적절) | 0 (임계 변경)                        | allowlist 박제 + 회귀 가드 (~1회)      |
| **§Amendment 9 §결정점 5 정합**              | —                               | —                                | 임계 변경 (결정점 1 위반)            | ✓ orphan 제외 동일 계열                |
| **무한 팽창 위험**                           | —                               | —                                | 임계 무한 완화 사이클                | 진입 조건 (구조적 입증) 으로 차단      |

- **옵션 2 거부**: 스크린샷/roadmap revert = 천체 시뮬 README/로드맵 손실 (프로젝트 정체성 손실, 부적절). 텍스트 5개 revert = 프로젝트 고유 교훈/가드 손실. CLAUDE.md §"인계 항목 실측 재검증" / 본 ADR 의 Z 패턴 (Phase 1 선반영 가치) 자체를 부정. 거부
- **옵션 3 거부**: N=10 → 더 큰 N 은 Amendment 2 (N=3→10) / Amendment 7 (측정 식 정정) 이 경고한 silent 약화 사이클 답습. 게다가 모수 (구조적 divergent 자산 포함) 를 그대로 둔 채 임계만 올리면 진짜 Z 패턴 누적 (텍스트 5개) 까지 함께 가려져 측정 본질 훼손. 거부
- **옵션 3′ + 부분 옵션 1 조합 채택**: 모수 정제 (구조적 divergent 제외) 로 카운트가 정직해지고 (10 → ~6), 잔여 5개 텍스트 파일은 옵션 1 (upstream 기여) 의 정당한 대상으로 남겨 Phase 2 진행률 (#5 차원) 로 자연 해소. 두 축 직교 보존

### forensic 측정 데이터 박제 (2026-06-30, develop tip 907df88)

#### 가설 검증

- **가설 A (기각)**: "drift 10 = Z 패턴이 10회 과도하게 적용된 누적" → 만약 참이면 10개 전부 upstream 기여 가능한 Z 패턴 적용분이어야 함. **반증**: 4개 (스크린샷) 는 manifest 데모 자산을 도메인 콘텐츠로 교체한 것으로 Z 패턴 (harness 가드/페르소나 선반영) 과 무관. 1개 (roadmap) 도 도메인 전용 문서
- **가설 B (확정)**: "drift 10 = 카운트 모수에 구조적 divergent 자산이 혼재" → manifest 분류 실측으로 확정 (아래 표)

#### 측정 1 — `--mode=count-warn` (활성 drift 카운트)

```text
harness drift files: 10
alert fatigue threshold (N): 10
[Alert Fatigue Trigger] drift 10 >= N=10
```

#### 측정 2 — `--mode=verify` (데코레이터 정합)

```text
harness drift files: 10
decorator PASS: 10
decorator FAIL: 0
orphan sidecars: 0
```

→ 데코레이터는 전부 정합. 순수하게 "drift 파일 수 도달" 이 발화 원인 (데코레이터 누락 문제 아님). DoD PASS ↔ 운영 신호 mismatch (forensic 조건 3 부분 충족).

#### 측정 3 — drift 10개 카테고리 분류 (`.harness/manifest.json` 277 파일 교차)

| #   | 파일                                    | manifest 등록 | 데코레이터 | 카테고리              | upstream 기여                           |
| --- | --------------------------------------- | ------------- | ---------- | --------------------- | --------------------------------------- |
| 1   | `CLAUDE.md`                             | ✓             | `[TODO]`   | 범용 harness 워크플로 | ✓ 옵션 1 대상                           |
| 2   | `.claude/agents/architect.md`           | ✓             | `[TODO]`   | 범용 페르소나         | ✓ 옵션 1 대상                           |
| 3   | `.claude/agents/pm.md`                  | ✓             | `[TODO]`   | 범용 페르소나         | ✓ 옵션 1 대상                           |
| 4   | `.github/workflows/harness-guards.yml`  | ✓             | `[TODO]`   | 범용 CI 가드          | ✓ 옵션 1 대상                           |
| 5   | `scripts/verify-z-pattern-health.mjs`   | ✓             | `[TODO]`   | 범용 Z 패턴 가드      | ✓ 옵션 1 대상                           |
| 6   | `docs/phases/roadmap-v3-incremental.md` | ✓             | `[TODO]`   | **도메인 전용 문서**  | ✗ `domain-doc`                          |
| 7   | `docs/screenshots/01-solar-system.png`  | ✓             | (PNG 면제) | **콘텐츠 자산**       | ✗ `content-asset` + `perpetual-rewrite` |
| 8   | `docs/screenshots/02-earth-focus.png`   | ✓             | (PNG 면제) | **콘텐츠 자산**       | ✗ `content-asset` + `perpetual-rewrite` |
| 9   | `docs/screenshots/03-neptune.png`       | ✓             | (PNG 면제) | **콘텐츠 자산**       | ✗ `content-asset` + `perpetual-rewrite` |
| 10  | `docs/screenshots/04-mobile.png`        | ✓             | (PNG 면제) | **콘텐츠 자산**       | ✗ `content-asset` + `perpetual-rewrite` |

- **구조적 기여 불가능 자산**: 5개 (#6 roadmap + #7~10 스크린샷) = **N=10 의 50%**. 메인 분석 (스크린샷 4 = 40%) 보다 roadmap 포함 시 50% — 옵션 1 (upstream 기여) 로 영구 해소 불가능한 비중이 절반
- **스크린샷 영속성 입증**: README.md line 9 / 31 직접 참조 (천체 시뮬 데모 이미지). git log 상 `v0.35.1 prep (#745)` 등 릴리스마다 README 스크린샷 갱신 — `perpetual-rewrite` (정기 sha 재변경) 확정. upstream 1회 기여로 해소 불가능
- **`verify-harness-drift-decorator.mjs` 자기 참조 확인**: 본 파일은 현재 drift 10 목록에 **미포함** (sha 정합 상태). 옵션 3′ 구현으로 본 파일 수정 시 drift 상태 진입 가능하나 — allowlist 에 자신을 넣지 않음 (§재귀 안전성 1). 본 파일은 범용 가드 (옵션 1 대상)

#### 측정 4 — §재검토 조건 #5 (Phase 2 진행률) 동시 발화 여부

- 본 Amendment 13 은 #6 (drift 파일 수) 단독 발화. §재검토 조건 #5 (Phase 2 진행률 < 33% OR 90일 경과) 와 동시 발화 시 §재검토 조건 #6 본문 SSoT 상 **#5 우선** (Phase 2 강제 우위). 본 결정 (옵션 3′ + 부분 1) 은 #5 우위와 충돌 없음 — 부분 옵션 1 (Phase 2 진행) 이 #5 차원도 함께 진전시킴

### silent 가드 강화 vs 약화 자기점검

본 Amendment 13 의 방향 검증 (CLAUDE.md §"가드 설계 원칙" §의식적 silent 약화):

- ✓ **silent 가드 강화 방향** — N 임계 변경 0. 카운트 모수 정제는 측정 정밀화 (측정 본질 정합 보존). orphan 제외 (§결정점 5) 동일 계열
- ✓ **§결정 본문 / N=10 / 90일 임계 변경 0** — Amendment 2/9 SSoT 보존. 옵션 3 (N 재조정) 명시 거부
- ✓ **allowlist 자체에 회귀 가드 3중 박제** — 무한 팽창 (진입 조건) + 임의 사유 (structuralProof 검증) + stale (manifest/drift 상태 검증) 차단. silent 약화 우회 경로 차단
- ✓ **measurement-first 원칙 정합** — "발화 잦아 부담" (주관) 이 아닌 "구조적 기여 불가능 입증" (객관) 기반. §변경 사항 2 (c) 판정 질문으로 약화 우회 차단
- ✓ **fail-fast vs soft-warn 비대칭 보존** — Amendment 8 데코레이터 (fail-fast) 영향 0 (allowlist 자산도 데코레이터 의무 유지). Amendment 9 카운트 (soft-warn) 모수만 정제

### 트레이드오프

- **장점**: 카운트 모수가 측정 본질 (Z 패턴 활성 적용 누적) 에 정직해짐 + 구조적 divergent 자산 (스크린샷/roadmap) 의 영구 정합 경로 확보 + 옵션 1 (텍스트 5개 upstream 기여) 의 진짜 Z 패턴 누적 신호 보존 (가려지지 않음)
- **단점 (잠재)**:
  - allowlist 진입 판정의 주관성 — `content-asset` / `domain-doc` 경계가 애매한 자산 발생 가능. 회피: 진입 조건 식별자 + `structuralProof` 명시 의무 + 판정 질문 (A/B) 박제. 애매 시 **allowlist 미진입** (보수적 — 카운트에 남겨 옵션 1 검토)
  - allowlist 무한 팽창 잠재 — 회피: 진입 조건 (구조적 입증) + stale 검증 (manifest/drift 상태). 박제 빈도 모니터링 (현재 5개 후보, 운영 1~3 사이클 후 정정)
  - 가드가 자기 카운트 모수를 바꾸는 재귀 — 회피: §재귀 안전성 (자기 자신 미포함 + 구현 후 재발화 실측 + Amendment 7 self-reference 해소 패턴 답습)

### Concrete Prediction (developer 단계 변경 예측 박제)

- 신규 코드 (`scripts/verify-harness-drift-decorator.mjs`):
  - `PERMANENT_DIVERGENT_ALLOWLIST` 상수 (`{ path, reason, structuralProof }` 배열, 초기 5 항목) — **~30-50 라인**
  - `runCountWarn()` 에 allowlist 제외 필터 추가 + 제외 내역 stdout 박제 (투명성) — **~15-25 라인**
  - allowlist 회귀 가드 4중 (schema / 진입 조건 positive Enum 매칭 / stale / **Forbidden Path negative deny-list hard-fail**) self-test — **~65-100 라인** (cross-validate 2026-06-30 으로 Forbidden Path 추가)
- CI workflow 변경: `.github/workflows/adr-z-pattern-health-v2.yml` — count-warn 출력에 "allowlist 제외 N건" 가시화 (선택, ~5-10 라인). 본질 변경은 스크립트 — developer 단계 결정
- ADR Amendment 13 자체: ~본 §섹션 (forensic 측정 포함 ~250-300 라인)
- harness-managed 파일 변경: `verify-harness-drift-decorator.mjs` (drift 심화, 새 drift 파일 0) — 본 파일 데코레이터 `[TODO]` 유지 (옵션 1 대상, allowlist 미진입)
- **총 예상 라인 수**: 350-450 라인 (스크립트 + workflow + ADR + 테스트)
- 행동 변화 (CHANGELOG `### Behavior Changes` 후보 — developer 단계 박제): "월 cron 활성 drift 카운트에서 영구 divergent allowlist (구조적 기여 불가능 자산) 제외 — 카운트 모수 정제 (N=10 임계 불변)" (MINOR 릴리스 후보) — 단, 본 PR (architect) 은 ADR Amendment 만 박제 (코드/CHANGELOG 미터치, developer 단계 추가)

### 회귀 가드 (CLAUDE.md §"가드 도입 PR DoD" 4축)

- **(1) 격리 동적 테스트**: developer 단계에서 `node scripts/verify-harness-drift-decorator.mjs --self-test` — allowlist schema / 진입 조건 / stale 검증 + count-warn allowlist 제외 시뮬레이션 PASS 의무
- **(2) 3중 시뮬레이션** (positive → negative → recovery):
  - positive: drift=6 (allowlist 제외 후) < N=10 → exit 0 "OK"
  - negative-1: allowlist 임의 사유 박제 (structuralProof 진입 조건 미매칭) → self-test FAIL
  - negative-2 (Forbidden Path, cross-validate 추가): 범용 가드 경로 위장 등록 (예: `scripts/verify-z-pattern-health.mjs` 를 `content-asset` 로 허위 박제) → deny-list 매칭 self-test FAIL (positive 통과해도 무조건 FAIL)
  - recovery: 진입 조건 매칭 + deny-list 비매칭 사유로 정정 → self-test PASS
- **(3) 5 페르소나 self-consistency**: 본 ADR 박제 직후 cross-validate (architect → 메인 단계 의무) + 후속 developer/reviewer/qa 가 동일 결론 (옵션 3′+1 / allowlist 진입 조건 3종 / N=10 불변 / 모수 정제 = 측정 정밀화) 도출 검증
- **(4) 메타 측정 도구 자기 적용 안정성**: 옵션 3′ 구현 후 본 가드가 자기 가드를 통과 — allowlist 제외로 count-warn 이 N 미만으로 떨어지는지 (또는 잔여가 옵션 1 대상임을 박제) developer 단계 자기 검증 의무. `verify-harness-drift-decorator.mjs` 자신은 allowlist 미진입 (자기참조 결함 차단)

### cross-link

- 본 Amendment, [#766](https://github.com/coseo12/astro-simulator/issues/766) 이슈 본문
- 직전 Amendment: Amendment 12 (TODO Aging Guard, 시간 누적 차원 #7)
- 발화 가드 SSoT: `scripts/verify-harness-drift-decorator.mjs` (`--mode=count-warn` — Amendment 9), `.github/workflows/adr-z-pattern-health-v2.yml`
- §재검토 조건 #6 (Amendment 9) / §Amendment 9 §결정점 2 옵션 A (결정 분기 의무) / §Amendment 9 §결정점 5 (임계 비교 대상 = orphan 제외 — 본 Amendment 13 allowlist 의 동일 계열 선례)
- 측정 정밀화 vs silent 약화 SSoT: Amendment 7 (측정 식 forensic 정정) — 자기참조 인플레이션 해소 패턴 답습
- 가드 설계 원칙: CLAUDE.md §"가드 설계 원칙 — measurement-first / 의식적 silent 약화 / fail-fast" (volt [#101](https://github.com/coseo12/volt/issues/101) / [#106](https://github.com/coseo12/volt/issues/106) / [#107](https://github.com/coseo12/volt/issues/107)), [docs/lessons/guard-design-principles.md](../lessons/guard-design-principles.md)
- 가드 도입 PR DoD: [docs/lessons/guard-pr-dod.md](../lessons/guard-pr-dod.md) (4축 검증)
- 외부 모델 실측 가드: volt [#51](https://github.com/coseo12/volt/issues/51) (메인 분석 "40% 스크린샷" → architect 실측 "50% (roadmap 포함)" 정정 답습)

### 교차검증 반영 사항 (cross-validate 2026-06-30 — agy Antigravity, architecture 모드)

> **cross-validate 발동 사유**: ADR 신규/개정 (Amendment 13 박제) — §교차검증 박제 직후 1회 루틴 대상 (4 앵커 중 "ADR 신규·개정/폐기"). 메인 오케스트레이터가 `.claude/skills/cross-validate/scripts/cross_validate.sh architecture` 로 Amendment 13 섹션 + 명시 질문 3종 전달. 결과 outcome: applied (exit 0), 워킹트리 snapshot diff empty (도구 호출 없음).

#### 합의 (높은 신뢰도 — 두 모델 일치)

- **옵션 3′ + 부분 옵션 1 조합 타당** — agy: "기여 불가능 정적 자산과 기여해야 하는 공통 가드 자산을 정밀하게 발라내는 접근은 매우 타당". 옵션 3 (N 재조정) silent 약화 거부에도 동의 (**폐기 프레이밍 축 명시 질문 → agy 동의**: N 단순 증가 = silent 약화 방지가 정당)
- **단일 ADR Amendment 13 추적성** — agy: "Z-패턴/drift 가드 단일 SSoT 유지로 맥락 파편화 방지 논거는 대단히 합리적"
- **인라인 상수 (`PERMANENT_DIVERGENT_ALLOWLIST`) 응집도** — agy: "도구 동작과 설정의 괴리를 줄이는 방향은 합리적"
- **회귀 가드 다중 구조** — agy: "allowlist 무한 증식 방지 가드가 구체적으로 명시되어 논리적 결함 최소화"

#### 이견 (양쪽 근거 — Claude 재판단)

- **인라인 상수 vs JSON/모듈 분리**: agy 는 이식성 (다른 프로젝트 이식 시 가드 코드 sha 변경 누적) 을 들어 `allowlist.js` 모듈 분리 / JSON 구조 재검토 권고. **Claude 판단: 인라인 유지**. 근거 — (1) 측정 SSoT 와 모수 정의가 같은 파일에 있어야 추적성 보장 (Amendment 9 §결정점 5 단일 스크립트 통합 패턴 답습) (2) allowlist 항목은 진입 조건 (구조적 입증) 으로 무한 팽창이 차단되어 sha 변경 빈도가 낮음 (현재 5개, 운영 1~3 사이클당 0~1건). 단 **이식성 일리는 인정** → §아래 고유 발견 5 (upstream allowlist 인터페이스) 후속 분리로 흡수

#### 고유 발견 (Claude 가 놓친 것 — 수용/분리/기각 분류)

1. **⭐ Forbidden Path deny-list 하드 가드 (수용 — 본 PR 반영)**: agy 보안 지적이 **결합 간과 축 명시 질문 (allowlist 가 옵션 1 회피 우회로로 악용) 을 정확히 포착** — "개발자가 CI 통과 위해 범용 가드를 `reason`/`structuralProof` 허위 작성으로 위장 등록". 현 ADR 은 진입 조건 매칭 (positive) 만 기계 검증, 금지 경로 (negative) 는 _설명만_. → §변경 사항 2 (b) 4번 회귀 가드 (Forbidden Path negative deny-list hard-fail) 로 승격 반영. **결합 간과 축 답: allowlist ↔ 옵션 1 은 직교하나, 진입 판정이 우회로가 될 수 있어 deny-list 로 기계 차단 필요** (직교성 보존 + 우회 차단)
2. **`structuralProof` 매칭 규격 (경미 수용 — 본 PR 반영)**: agy — "`includes()` 부분 문자열인지 Enum 배열인지 검증 인터페이스 규격 미비". → §변경 사항 2 (b) 2번에 "진입 조건 식별자 Enum 배열 정확 매칭" 명시
3. **stale WARN → FAIL 에이징 (후속 분리)**: agy — "WARN 은 무시되기 쉬움, PR=WARN / 릴리스=FAIL 이원화 또는 에이징 가드". Amendment 12 (TODO Aging Guard) 와 동일 패턴 — 운영 데이터 1~3 사이클 축적 후 별건. §변경 사항 2 (b) 3번에 후속 분리 명시
4. **Emergency Break (`DISABLE_HARNESS_DRIFT_GUARD`) (기각)**: agy — "무한 재귀/CI 막힘 시 일시 비활성화 환경변수". **기각 근거**: CLAUDE.md §"가드 설계 원칙" §fail-fast — "drift 가드는 fail-fast 만, fallback 분기 절대 금지". count-warn 은 이미 soft-warn (CI hard-block 아님) 이라 CI 를 막지 않음 → Emergency Break 불필요. 환경변수 비활성화 = 가드 무력화 우회 경로 도입 (자기모순). self-test 격리 검증이 무한 재귀를 사전 차단
5. **upstream allowlist 인터페이스 / 범용성 (후속 분리)**: agy — "harness 가 다른 프로젝트로 이식 시 프로젝트 고유 allowlist 가 가드 스크립트에 묶이면 이식성 저하, `.harnessrc` 등 주입 인터페이스 고려". → 이는 Z-패턴 본질 (Phase 1 프로젝트 선반영) 의 정당한 형태이며, allowlist 메커니즘의 upstream 기여 (Phase 2) 는 별건. 후속 분리 (이견 항목 이식성 우려도 함께 흡수)
6. **CI 시각화 / 예외 흐름 상세화 (developer 흡수)**: agy — "제외 항목 stdout 출력 / PR 피드백 세부 명세, allowlist 파일 물리 삭제·manifest 스키마 오류 예외 흐름". → §Concrete Prediction 의 "제외 내역 stdout 박제 (투명성)" + §회귀 가드 stale 검증에 이미 부분 포함. developer 단계 구현 디테일로 흡수

#### Claude 편향 셀프 체크 (4종)

- **순수주의 편향** ("정밀화" 긍정 프레이밍 과잉?): agy 도 allowlist 타당성에 동의하나 오용 차단 보강을 요구 → Forbidden Path 수용으로 보완. 도그마 회피 입증 (orphan 제외 §결정점 5 동일 계열 + deny-list 기계 검증). **통과**
- **폐기 프레이밍 편향** (옵션 3 너무 쉽게 기각?): agy 동의. 셀프 체크 — 미래에 _진짜_ Z-패턴 누적 (텍스트 가드/페르소나) 이 10 초과 시 답은 옵션 1 (Phase 2 가속) 이지 N 완화 아님. 1인 운영 N 완화 정당 시나리오 부재 확인. **통과**
- **결합 간과 편향** (allowlist ↔ 옵션 1 직교 가정?): agy 가 우회로 악용 위험 포착 (고유 발견 1). 직교는 맞으나 우회 차단 가드 누락 → Forbidden Path 로 해소. **셀프 체크가 가장 큰 가치 — 수용**
- **확증 편향** (자기 결정 정당화 위해 측정 선택?): manifest 분류 실측 (50% 구조적 divergent) 은 재현 가능한 객관 측정. 가설 A 기각도 반증 기반. **통과**

#### 결론: 조건부 통과 → Forbidden Path 가드 반영 후 통과

cross-validate 가 핵심 안전장치 (Forbidden Path deny-list) 1건을 보강. 후속 분리 2건 ([#768](https://github.com/coseo12/astro-simulator/issues/768) stale 에이징 / [#769](https://github.com/coseo12/astro-simulator/issues/769) upstream allowlist 인터페이스) 박제 완료 (`Builds on: #766`). 상태: Provisional → **Accepted** 전이 (본 §섹션 통합 완료).

##### #769 (allowlist upstream 인터페이스) 실측 재검증 — 유예 유지 (2026-07-17)

[#769](https://github.com/coseo12/astro-simulator/issues/769) (`.harnessrc` 범용 allowlist 인터페이스) 착수 전 measurement-first 재검증 (CLAUDE.md §"인계 항목 실측 재검증 — NO-OP ADR 패턴"): **#769 의 전제("이식성 긴장 = allowlist 갱신마다 가드 sha 변경")가 실측상 미발생**. `scripts/verify-harness-drift-decorator.mjs` 는 #766 도입 커밋 (`406a801`, 2026-06-30) 이후 **allowlist 상수 변경 0회** (17일간), 항목 수 **5개 고정** (진입 조건이 팽창 차단, #766 예측대로). 즉 `.harnessrc` 인터페이스는 현재 speculative (YAGNI) — 해소할 sha-change 빈도가 0 이고, Amendment 9 §결정점 5 의 의도적 단일-스크립트 통합(추적성) 을 운영 근거 없이 되돌림. 또한 #769 는 Z-패턴 **Phase 2 (upstream 기여)** 영역으로 harness-setting repo 협의가 전제 (미착수).

**재검토 트리거 (하나라도 발화 시 #769 재활성화)**:

1. **allowlist 상수 변경 ≥ 3회 누적** — sha-change 빈도가 실증되어 추적성 vs 이식성 trade-off 재평가 근거 확보.
2. **2번째 다운스트림 프로젝트가 본 harness 채택** — 프로젝트 고유 allowlist 가 가드 스크립트에 묶이는 이식성 문제가 실수요로 발현 (`다운스트림 ≤ 1` §재검토 조건 #3 과 동형 축).
3. **harness-setting upstream 인터페이스 설계 협의 개시** — Phase 2 전제 충족.

#769 는 **유예 유지 (open)** — 위 트리거 발화 시 재활성화. 트리거 미발화 상태에서 인터페이스 구축은 하지 않는다 (measurement-first + YAGNI).

## Amendment 14 — 2026-07-14

상태: Accepted (cross-validate 2026-07-14 — §교차검증 반영 사항 통합 완료. CLAUDE.md §ADR Status 워크플로 — cross-validate 앵커 "ADR 신규·개정/폐기")

- **발의**: [#822](https://github.com/coseo12/astro-simulator/issues/822) ([ADR Trigger] 자동 탐지 2026-07-13 — §재검토 조건 #5 발화. Amendment 1 규정 3 영업일 내 결정 분기 의무 이행)
- **트리거 발화 사유**: Amendment 1+2 정합 3중 OR 중 **조건 2 단일 발화** — `phase1Count = 10 >= N=10`. 조건 1 (Phase 2 진행률 40.0% ≥ 33%, Amendment 1 미발화) / 조건 3 (경과 60일 < 90일, Amendment 2 미발화) 는 미발화.
- **결정 (2026-07-14, 메인 오케스트레이터 forensic 실측 확정)**: **옵션 D — 측정 정밀화** (메타 옵션). Amendment 7 (자기참조 인플레 정정) / Amendment 13 (카운트 모수 정제) 와 **동일 계열**. **N=10 임계 불변** — 옵션 C (임계 완화) 는 Amendment 4 §트리거 ("임계값 추가 완화는 silent 가드 무한 사이클 가속 위험으로 거부") 답습으로 명시 거부. CLAUDE.md §스프린트 계약 #10 "수치 DoD 미달 시 측정 방법 검증 우선" 직접 적용.

### 계약 ↔ 구현 drift forensic (핵심 쟁점)

§재검토 조건 #5 원문 계약과 자동 탐지 스크립트 구현 사이의 **의미 drift**:

| 구분                                         | 내용                                                                                                                 |
| -------------------------------------------- | -------------------------------------------------------------------------------------------------------------------- |
| **ADR §재검토 조건 #5 계약 원문**            | "Phase 2 (upstream 기여) **N=10 회 연속 미진행**" (Amendment 1 박제, Amendment 2 로 N=3→10)                          |
| **구현** (`verify-z-pattern-health.mjs:374`) | `phase1Count >= N_THRESHOLD` — Phase 1 **절대 누적 회차** (isAdrEvolutionPr 필터 후)                                 |
| **drift**                                    | "연속 미진행" (직전 Phase-2 이후 리셋되는 **상대** 카운터) 의미가 "생애 누적 회차" (**절대**) 로 구현됨. 리셋점 부재 |

**결정적 논점 (영구 false-fire)**: `phase1Count` (= `adrCitations`) 는 **단조 증가**한다. 정정하지 않으면 **앞으로 모든 Phase-1 PR 마다 영구 false-fire** — §재검토 조건 #6 (Amendment 9) 이 경고한 alert fatigue 그 자체. 옵션 A (Phase 2 일괄 기여) 로도 해소 불가능 — Phase-2 를 아무리 진행해도 `phase1Count` (절대 누적) 는 계속 ≥ 10 이라 조건 2 는 계속 발화. 즉 **측정식 정정이 유일한 근본 해소 경로** (옵션 A 는 조건 1 (ratio) 만 개선, 조건 2 미해소).

### Forensic 측정 데이터 (2026-07-14, develop tip 27453fb)

#### 측정 1 — 자동 탐지 발화 출력 ([#822](https://github.com/coseo12/astro-simulator/issues/822) 이슈 본문)

```text
Phase 1 (본 프로젝트): 10 (Amendment 13, PR citations 10)
Phase 2 (upstream harness-setting): 4
Phase 2 진행률: 40.0%
ADR 적용 후 경과 일수: 59일

[ADR Trigger] ADR 20260515 Z 패턴 §재검토 조건 #5 발화:
  - Phase 1 회차 10 >= N=10 임계값
```

→ **조건 2 (Phase 1 회차 10 ≥ N=10) 단독 발화**. 조건 1 (진행률 40% ≥ 33%) / 조건 3 (경과 59~60일 < 90일) 은 미발화.

#### 측정 2 — Phase-2 (upstream 기여) 시간 분포

| Phase-2 upstream PR                                                        | 기여일     | 인용         |
| -------------------------------------------------------------------------- | ---------- | ------------ |
| [harness-setting#248](https://github.com/coseo12/harness-setting/pull/248) | 2026-05-17 | ADR 20260515 |
| [harness-setting#254](https://github.com/coseo12/harness-setting/pull/254) | 2026-05-18 | ADR 20260515 |
| [harness-setting#257](https://github.com/coseo12/harness-setting/pull/257) | 2026-05-18 | ADR 20260515 |
| [harness-setting#260](https://github.com/coseo12/harness-setting/pull/260) | 2026-05-18 | ADR 20260515 |

→ Phase-2 기여 4건 전부 **2026-05-17~18 단일 버스트** (Amendment 4/5/6 일괄 진행 결과). **마지막 Phase-2 기여일 = 2026-05-18**.

#### 측정 3 — 직전 Phase-2 (2026-05-18) 이후 연속 Phase-1 회차

| Phase-1 PR (isAdrEvolutionPr 필터 후) | 머지일     | 직전 Phase-2 (05-18) 이후? |
| ------------------------------------- | ---------- | -------------------------- |
| #587                                  | 2026-05-26 | ✓                          |
| #588                                  | 2026-05-26 | ✓                          |
| #770                                  | 2026-06-30 | ✓                          |
| #819                                  | 2026-07-10 | ✓                          |

→ **직전 Phase-2 이후 연속 Phase-1 = 4회** (< N=10). 계약 원문 ("N=10 회 연속 미진행") 대로 측정하면 **4 < 10 → 미발화**. 현재 발화는 순수하게 **절대 누적 (10) ↔ 연속 (4) 측정 차원 불일치** 가 원인.

#### 가설 검증

- **가설 A (기각)**: "Phase-2 가 10 sprint 연속 미진행되어 Y (영구 fork) 회귀 신호" → 참이면 직전 Phase-2 이후 연속 Phase-1 ≥ 10 이어야 함. **반증**: 연속 4회 (측정 3) + Phase 2 진행률 40% (측정 1) = health 정상. Y 회귀 신호 아님.
- **가설 B (확정)**: "구현이 계약의 '연속' 의미를 '절대 누적' 으로 측정 → 단조 증가로 영구 false-fire" → 측정 1~3 으로 확정. 조건 2 는 Phase-2 진행 여부와 무관하게 `phase1Count` 증가만으로 영구 발화.

### 변경 사항

#### 1. 자동화 스크립트 정정 — `scripts/verify-z-pattern-health.mjs` 조건 2

- **기존** (`:374`): `if (phase1Count >= N_THRESHOLD)` — Phase 1 절대 누적 회차 (isAdrEvolutionPr 필터 후)
- **정정**: `if (consecutiveSinceLastPhase2 >= N_THRESHOLD)` — **직전 Phase-2 기여 이후 연속 Phase-1 회차**
- **`consecutiveSinceLastPhase2` 산출 로직** (cross-validate 정정 반영 — `merged`-only):
  1. Phase-2 PR (upstream, "ADR 20260515" 검색) 중 **`state == MERGED` 이며 `mergedAt != null`** 인 것만 수집 (미머지 / 반려 / open 제외). 이들의 `mergedAt` epoch (`new Date(x).getTime()`) 중 **max** = 직전 Phase-2 기여일 (`lastPhase2Date`). **`createdAt` fallback 금지** — 반려된 PR 이 카운터를 잘못 리셋하는 사각 차단 (§교차검증 고유 발견 Q3-1)
  2. Phase-1 PR (isAdrEvolutionPr 필터 후) 중 `mergedAt` epoch `> lastPhase2Date` 인 것의 개수 = `consecutiveSinceLastPhase2` (동일 타임스탬프 경계는 ms epoch 비교로 결정 — §교차검증 고유 발견 Q3-2)
  3. **머지된 Phase-2 가 0 건이면 `consecutiveSinceLastPhase2 = phase1Count`** (backward-compat — 아래 §변경 사항 2)
- **stdout 메시지 정정**: "Phase 1 회차 N >= N=10" → "직전 Phase-2 이후 연속 Phase-1 N회 >= N=10". 정보 출력에 절대 누적 (`phase1Count`) 도 병기하여 두 차원 가시화.

#### 2. backward-compat 보장 (과거 Phase-2=0 레짐 동작 불변)

- Amendment 1~3 시점 (2026-05-16~17) 은 Phase-2 = 0 레짐. 이 구간에서 "직전 Phase-2 이후" = "전체 Phase-1" 이므로 `consecutiveSinceLastPhase2 = phase1Count` — **과거 발화 이력 (Amendment 4/6 트리거) 재현 불변**.
- Phase-2 ≥ 1 인 현재 레짐부터 리셋 의미가 활성화 → 계약 원문 충실 구현. 즉 정정은 **과거 동작 파괴 없이 최근 레짐에만 의미 부여** (순수 확장).

#### 3. 조건 1 (생애 평균 ratio) 과의 직교성 — 조건 2 부활

- 조건 1 (`phase2Count / phase1Count < 33%`) 은 **생애 누적 평균** — 오래된 Phase-2 버스트가 분자에 영구 잔존하여 최근 drift 를 희석한다.
- 조건 2 (정정 후) 는 **직전 Phase-2 이후 최근 구간** 신호 — 생애 평균이 가리는 최근 정체를 포착. 두 축이 **직교 부활** (기존 조건 2 는 조건 1 과 강상관인 단조 증가라 독립 신호 가치 상실).
- 현재 연속 4건은 sub-threshold (조건 2 미발화). 향후 Phase-2 없이 연속 Phase-1 이 10 도달 시 조건 2 가 **정직하게** Y 회귀 신호로 작동.

### 비목표 — 후속 분리 (옵션 A)

- **잔여 Phase-1 upstream 일괄 기여 (옵션 A) 는 본 Amendment 범위 밖** — Phase 2 진행률 40% (health 정상) 이라 강제 아님. [#769](https://github.com/coseo12/astro-simulator/issues/769) (upstream allowlist 인터페이스) 가 일부 커버 + 90일 클록 (backstop 2026-08-13 = 2026-05-15 + 90일) 자연 재점검. 본 정정 (측정식) 과 직교 — CLAUDE.md §교차검증 후속 분리 3단 프로토콜 정합 (비목표를 "타당하다"는 이유로 현재 PR 에 끌어들이지 않음).

### silent 가드 강화 vs 약화 자기점검

본 Amendment 14 의 방향 검증 (CLAUDE.md §"가드 설계 원칙" §의식적 silent 약화):

- ✓ **silent 가드 강화 방향** — N 임계 변경 0. 측정 차원 정정 (절대 누적 → 연속) 은 계약 원문 충실화 (측정 본질 정합 보존). Amendment 7 (자기참조 인플레 정정) / 13 (모수 정제) 동일 계열.
- ✓ **§결정 본문 / N=10 / 90일 임계 변경 0** — Amendment 2 SSoT 보존. 옵션 C (N 재조정) 명시 거부.
- ✓ **false-fire 제거 = 진짜 트리거 보호** — 매주 false-fire 는 alert fatigue → 진짜 Y 회귀 신호 발화 시 무시 위험. 정확한 측정이 silent 가드의 효과 자체를 보호 (Amendment 7 §silent 가드 무력화 위험 점검 답습).
- ✓ **measurement-first 원칙 정합** — "발화 잦아 부담" (주관) 이 아닌 "계약 원문 (연속) ↔ 구현 (절대) 불일치" (객관) 기반 정정.

### 트레이드오프

- **장점**: 계약 원문 충실 구현 + 영구 false-fire 제거 + 조건 2 를 조건 1 과 직교하는 최근-drift 신호로 부활 + backward-compat (과거 레짐 불변).
- **단점 (잠재)**:
  - **리셋 게이밍 잠재** — 형식적 Phase-2 기여 1건으로 `consecutiveSinceLastPhase2` 를 0 으로 리셋해 조건 2 를 무한 지연 가능. **1차 방어 (본 Amendment 반영)**: `merged`-only 필터로 미머지 PR 리셋 차단 + 실질 upstream 머지 강제 (사소 PR 게이밍 문턱 상승). **잔여 위험 (cross-validate 고유 발견 — 후속 분리)**: agy 가 조건 1 (생애 ratio) 의 **볼륨 둔감성** 을 지적 — 볼륨이 커질수록 생애 평균이 최근 정체를 희석하여, 머지된 사소 PR 1건으로 조건 1+2 동시 우회 가능. 조건 1 직교 보증만으로는 불충분함이 확인됨. Phase-2 기여 substantiality 하한 (min LoC / 경로 / label) 은 별도 설계 필요 → **[#823](https://github.com/coseo12/astro-simulator/issues/823) 후속 분리** (Builds on #822).
  - PR title / mergedAt 데이터 의존 — gh API 조회 실패 시 보수적 fallback (Phase-2 조회 실패 → count=0 → 전체 Phase-1 = 기존 동작). 기존 try/catch 패턴 답습.

### Concrete Prediction (developer 단계 변경 예측 박제)

- 신규/변경 코드 (`scripts/verify-z-pattern-health.mjs`):
  - `adrCitationPrs` 조회에 `mergedAt` 필드 추가 (현재 `number,title` → `number,title,mergedAt`) — **~1 라인**
  - Phase-2 조회를 `--jq 'length'` (count only) → `number,mergedAt,createdAt` (날짜 포함) 로 확장 후 count 는 배열 길이로 산출 — **~5-10 라인**
  - `computeConsecutiveSinceLastPhase2(phase1Prs, phase2Prs)` **순수 함수 추출 + export** (기존 `isAdrEvolutionPr` export 컨벤션 답습, self-test 주입 가능하도록) — **~15-25 라인**
  - 조건 2 정정 (`phase1Count >=` → `consecutiveSinceLastPhase2 >=`) + stdout 메시지 정정 — **~5-10 라인**
  - `--self-test` 모드 추가 (3중 시뮬 a/b/c, 아래 §회귀 가드) — **~30-50 라인**
- ADR Amendment 14 자체: 본 §섹션 (forensic 포함 ~150-200 라인)
- harness-managed 파일 변경: `verify-z-pattern-health.mjs` (이미 `[TODO]` drift 상태 — 데코레이터 `// HARNESS-DRIFT: Z-PATTERN [TODO]` 2번째 줄 **유지**, 새 drift 파일 0)
- **총 예상 라인 수**: 55-95 라인 (스크립트) + ADR ~150-200 라인
- 행동 변화 (CHANGELOG `### Behavior Changes` 후보 — developer 단계 박제): "월 cron §재검토 조건 #5 조건 2 를 절대 누적 회차 → 직전 Phase-2 기여 이후 연속 Phase-1 회차로 정정 (계약 원문 충실 구현, N=10 임계 불변, 과거 Phase-2=0 레짐 backward-compat)" (MINOR 릴리스 후보) — 단 본 PR (architect) 은 ADR Amendment 만 박제 (코드/CHANGELOG 미터치, developer 단계 추가).

### 회귀 가드 (CLAUDE.md §"가드 도입 PR DoD" 4축)

- **(1) 격리 동적 테스트**: developer 단계에서 `node scripts/verify-z-pattern-health.mjs --self-test` — `computeConsecutiveSinceLastPhase2` 순수 함수에 주입 fixture 로 3중 시뮬 PASS 의무.
- **(2) 3중 시뮬레이션** (positive → negative → recovery):
  - **(a) positive**: 직전 Phase-2 이후 연속 Phase-1 ≥ 10 (Phase-2 count ≥ 1) → 조건 2 발화 (exit 1)
  - **(b) negative**: 연속 Phase-1 < 10 (예: 4) **AND** ratio ≥ 33% → 조건 2 미발화 (현재 실측 재현). exit 0
  - **(c) recovery**: Phase-2 기여 직후 (새 Phase-2 의 mergedAt 이 max) → `consecutiveSinceLastPhase2` 리셋 (0 또는 이후 Phase-1 소수) → 조건 2 미발화
  - **추가 backward-compat 케이스**: Phase-2 count = 0 → `consecutiveSinceLastPhase2 = phase1Count` (과거 Amendment 4 트리거 재현)
- **(3) 5 페르소나 self-consistency**: 본 ADR 박제 직후 cross-validate (메인 단계 의무) + 후속 developer/reviewer/qa 가 동일 결론 (옵션 D / 절대→연속 정정 / N=10 불변 / backward-compat) 도출 검증.
- **(4) 메타 측정 도구 자기 적용 안정성**: 정정 후 스크립트 실 실행 → 현재 데이터 (연속 4, ratio 40%, 60일) 에서 exit 0 (전 조건 미발화) 확인. `verify-z-pattern-health.mjs` 자신은 데코레이터 `[TODO]` 유지 (drift 심화 없음, sha 변경만).

### cross-link

- 본 Amendment, [#822](https://github.com/coseo12/astro-simulator/issues/822) 이슈 본문
- 직전 Amendment: Amendment 13 (drift 카운트 모수 정제 — §재검토 조건 #6 차원)
- 발화 가드 SSoT: `scripts/verify-z-pattern-health.mjs` (`:374` 조건 2), `.github/workflows/adr-z-pattern-health-v2.yml`
- 측정 정밀화 vs silent 약화 SSoT: Amendment 7 (측정 식 자기참조 인플레 forensic 정정) / Amendment 13 (카운트 모수 정제) — 동일 계열 (N 임계 불변 + 측정 차원 정정)
- 직전 [ADR Trigger] 결정: Amendment 7 [#554](https://github.com/coseo12/astro-simulator/issues/554) (옵션 D 선례), Amendment 4 [#495](https://github.com/coseo12/astro-simulator/issues/495) (옵션 A) / Amendment 2 [#487](https://github.com/coseo12/astro-simulator/issues/487) (옵션 C — 거부 답습)
- 측정 방법 원칙: CLAUDE.md §스프린트 계약 #10 (volt [#32](https://github.com/coseo12/volt/issues/32) — 측정 방법 검증 우선)
- 가드 설계 원칙: CLAUDE.md §"가드 설계 원칙 — measurement-first / 의식적 silent 약화 / fail-fast" ([docs/lessons/guard-design-principles.md](../lessons/guard-design-principles.md))

### 교차검증 반영 사항 (cross-validate 2026-07-14 완료 — Accepted 전이)

> **상태**: Accepted. cross-validate (agy, `cross_validate.sh architecture`) 로 본 Amendment 14 설계 + 3 명시 질문 (Q1 측정 정정 타당성 / Q2 리셋 게이밍 / Q3 사각지대) 전달. 로그: `.claude/logs/cross-validate-architecture-20260715-000231.log`. 아래 4종 분류 통합 후 Accepted 전이 (Amendment 13 §교차검증 반영 사항 형식 답습).

**4종 분류 (Claude 재분석 — 맹목 수용 금지):**

- **합의 (수용)**: (Q1) 조건 2 를 절대 누적 → 연속 측정으로 정정하는 방향은 "적극 타당" — 무상태 누적값은 프로젝트 수명 증가로 영구 참(alert fatigue)이 되는 구조적 버그이며, 임계 상향(옵션 C) 미봉책이 아닌 측정 차원 정정이 계약 본질 충실. Claude 설계와 일치.
- **고유 발견 A (수용 — 범위 내, critical)**: (Q3-1) `mergedAt ?? createdAt` fallback 결함 — 미머지/반려 Phase-2 PR 의 `createdAt` 이 `lastPhase2Date` 를 잘못 갱신해 실 upstream 반영 없이 카운터 리셋. **정정**: `merged` 상태 + `mergedAt != null` 만 수집, `createdAt` fallback 제거 (§변경 사항 1 반영 완료).
- **고유 발견 B (수용 — 범위 내, minor)**: (Q3-2) 타임스탬프 정밀도 — 밀접 머지 시 순서 왜곡 가능 → ms epoch (`getTime()`) 비교로 정정 (§변경 사항 1 반영 완료).
- **고유 발견 C (후속 분리 — 범위 밖)**: (Q2) 조건 1 (생애 ratio) 직교 보증의 **볼륨 둔감성** — 볼륨 증가 시 생애 평균이 최근 정체 희석 → 머지된 사소 PR 1건으로 조건 1+2 동시 우회 가능. `merged`-only 로 1차 문턱은 상승하나 "머지된 사소 PR" 게이밍은 잔존. substantiality 하한(min LoC/경로/label)은 직교 정책 설계 필요 → **[#823](https://github.com/coseo12/astro-simulator/issues/823)** 분리 (CLAUDE.md §후속 분리 3단 프로토콜 — 비목표를 "타당하다"는 이유로 현재 PR 에 끌어들이지 않음. 1인 운영 self-gaming 특성상 priority medium).
- **오탐 필터링**: 없음 (agy 지적 전부 유효).
- **Claude 편향 셀프 체크 결과**: §순수주의 편향 축에서 사전 식별한 "리셋 게이밍 우회로" 잠재 미통과를 cross-validate 가 확증 (고유 발견 C) — 셀프 체크의 명시 질문 삽입이 실제 사각 노출로 이어짐 (measurement-first 정합).

#### Claude 편향 셀프 체크 (4종 — cross-validate 호출 전)

- **낙관적 일정 편향**: 해당 없음 (본 Amendment 는 일정/공수 추정 항목 없음 — 측정식 정정 단일 목표). N/A
- **결합 간과 편향**: 조건 2 정정이 조건 1 (ratio) / 조건 3 (90일) 과 직교하는지 — 세 축 독립 확인 (§변경 사항 3). backward-compat 로 과거 레짐 동작 불변. **통과**
- **폐기 프레이밍 편향**: 옵션 C (임계 완화) 를 너무 쉽게 기각? — Amendment 2/4/7/13 이 일관되게 거부한 silent 약화 사이클 답습이며, 절대 누적 단조 증가는 N 완화로 해소 불가 (계속 초과) 이므로 정정이 유일 경로. **통과**
- **순수주의 편향** ("측정 정밀화" 긍정 프레이밍 과잉?): 계약 원문 ("연속") 충실 구현이라 measurement-first 정합. **단 미통과 잠재 축** — 리셋 의미 도입이 조건 2 를 형식적 Phase-2 1건으로 무한 지연시킬 우회로가 되지 않는가? → **cross-validate 명시 질문 삽입 대상**: "직전 Phase-2 이후 연속 카운트 리셋이 조건 2 를 게이밍 가능하게 하는가? 조건 1 (ratio ≥ 33%) 직교 보증으로 충분한가, 아니면 리셋에 최소 실질 기여 조건 (예: PR 머지 상태 필수) 이 필요한가?"

## Amendment 15 — 2026-07-14

상태: Accepted (cross-validate 2026-07-14 — §교차검증 반영 사항 4종 통합 완료. CLAUDE.md §ADR Status 워크플로 — cross-validate 앵커 "ADR 신규·개정/폐기").

- **발의**: [#823](https://github.com/coseo12/astro-simulator/issues/823) (Builds on [#822](https://github.com/coseo12/astro-simulator/issues/822) — Amendment 14 cross-validate (agy) §고유 발견 C 후속 분리). #822 스코프 (조건 2 측정 차원 정정) 와 직교하는 substantiality 정책이라 CLAUDE.md §후속 분리 3단 프로토콜로 분리됨.
- **트리거 발화 사유**: 자동 탐지 트리거가 아닌 **cross-validate 고유 발견 후속** (Amendment 14 §교차검증 반영 사항 §고유 발견 C). 조건 2 리셋 의미 도입 (Amendment 14) 의 잔여 사각 (리셋 게이밍) 을 조건 1 (생애 ratio) 직교 보증에 의존했으나, agy 가 그 보증의 **볼륨 둔감성** 을 지적.
- **결정 (2026-07-14, 메인 오케스트레이터 measurement-first 실측 확정)**: **옵션 1 — 경로 기반 substantiality 퀄리파이어 (denylist), 통합 스코프 A (3조건 일관 적용)**. Amendment 7 (자기참조 인플레 정정) / Amendment 13 (drift 카운트 모수 정제) / Amendment 14 (연속 측정 차원 정정) 와 **동일 계열 — 모수/앵커 정밀화, 임계값 불변**. N=10 / 33% / 90일 수치 변경 0.

### 문제 forensic (핵심 쟁점)

Amendment 14 는 조건 2 를 "직전 **머지된** Phase-2 이후 연속 Phase-1" (`consecutiveSinceLastPhase2 >= N`) 로 정정하고, 리셋 게이밍 방어를 조건 1 (생애 ratio ≥ 33%) 의 직교 보증에 의존했다. cross-validate 가 남은 사각을 지적:

| 구분                         | 내용                                                                                                                                                                                                  |
| ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **잔여 게이밍 벡터**         | `merged`-only 필터는 "미머지 PR" 게이밍은 막았으나 "머지된 **사소** PR" (오타/README 1줄) 게이밍은 잔존                                                                                               |
| **조건 1 볼륨 둔감성**       | 조건 1 은 생애 누적 평균이라 볼륨이 커질수록 감도 급락. 오래된 Phase-2 버스트가 분자에 영구 잔존 → 최근 정체 희석                                                                                     |
| **동시 우회 시나리오** (agy) | 정체기에 사소 PR 1건 머지 → `consecutiveSinceLastPhase2` 를 0 리셋 (조건 2 우회) **AND** `phase2Count` +1 (조건 1 ratio 유지 우회) 동시 성립. 실질 기여 없이 형식 머지 1건으로 두 조건 무한 우회 가능 |

즉 조건 1 직교 보증만으로는 "머지된 사소 PR" 게이밍을 막지 못함이 확인됨.

### 착수 중 추가 발견 — 조건 3 잠복 버그 (통합 대상)

조건 3 (`daysSinceFirstApply >= 90`) 는 `ADR_FIRST_APPLY_DATE = '2026-05-15'` **고정 절대 시각** 을 기준으로 한다. 이는 **day 90 (2026-08-13) 이후 영구 발화** — #822 에서 고친 조건 2 "단조 증가 영구 false-fire" 와 **동일 클래스 잠복 버그** (리셋점 없는 절대 기준). 계약 원문 ("90일 경과") 의 의도는 **주기적 재검토** (분기별 점검, Amendment 2) 이지 "박제 90일 후 영구 경고" 가 아니다. 리셋 앵커 정정으로 함께 해소.

### Measurement 실측 (2026-07-14, develop tip 74bbc94)

기존 Phase-2 4건 diff 규모 + 변경 경로 (`gh pr view <n> --json files` 실측):

| Phase-2 upstream PR                                                        | diff 규모 | 변경 경로 (요약)                                                    | denylist 판정   |
| -------------------------------------------------------------------------- | --------- | ------------------------------------------------------------------- | --------------- |
| [harness-setting#248](https://github.com/coseo12/harness-setting/pull/248) | **+5/-0** | `.claude/agents/*.md` ×5 (각 +1)                                    | **substantive** |
| [harness-setting#254](https://github.com/coseo12/harness-setting/pull/254) | +14/-0    | `CLAUDE.md`                                                         | **substantive** |
| [harness-setting#257](https://github.com/coseo12/harness-setting/pull/257) | +45/-0    | `.claude/agents/developer.md` + `.claude/skills/create-pr/SKILL.md` | **substantive** |
| [harness-setting#260](https://github.com/coseo12/harness-setting/pull/260) | +261/-2   | agents ×5 + scripts + CLAUDE.md + CHANGELOG + skill (×9)            | **substantive** |

**핵심 발견 (임계값 설계 근거)**:

1. **LoC 하한 (agy 제안 1) 기각** — #248 은 **+5줄** 인데 정당한 실질 기여 (5개 에이전트 SSoT 동시 갱신). diff 라인 수 하한 (예: ≥ 10줄) 을 두면 #248 이 **정당 PR 오탈락** → measurement 근거로 기각.
2. **경로 기반이 옳은 신호** — 4건 전부 실질 경로 자산 (`.claude/`, `CLAUDE.md`, `scripts/`) 을 터치. 라인 수와 무관하게 경로가 substantiality 를 정직하게 판별.
3. **label 방식 (agy 제안 2) 기각** — upstream (harness-setting) 라벨 체계 결합 + 수동 라벨 누락 시 정당 PR 오탈락. 결합도 위험.
4. **backward-compat 확정** — 4건 전부 substantive → 조건 1 ratio 분자 = 4 불변, 조건 2 리셋 앵커 = 2026-05-18 (max mergedAt) 불변. 정정은 **과거 동작 파괴 없이 미래 사소-PR 게이밍만 차단** (순수 확장).

### 후보 비교 (substantiality 퀄리파이어 — 축별 trade-off)

| 옵션                  | false-negative (정당 PR 오탈락 → spurious 발화) | false-positive (게이밍 PR 통과) | upstream 결합 | measurement 근거        | 판정                 |
| --------------------- | ----------------------------------------------- | ------------------------------- | ------------- | ----------------------- | -------------------- |
| **1a. 경로 denylist** | **최소** (모든 파일 trivial 매칭 시에만 배제)   | 소폭 허용 (trivial 조합 게이밍) | 없음          | #248 (+5) 정상 통과     | **채택 (권고)**      |
| 1b. 경로 allowlist    | 높음 (신규 substantive 경로 도입 시 오탈락)     | 최소                            | 없음          | 신규 경로 미대응 위험   | 기록 (denylist 채택) |
| 2. LoC 하한           | **높음** (#248 +5 오탈락 실측)                  | 소폭 허용                       | 없음          | **#248 반증**           | 기각                 |
| 3. label 기반         | 높음 (수동 라벨 누락 시)                        | 최소                            | **높음**      | upstream 라벨 체계 의존 | 기각                 |

**denylist 채택 근거 = 위험 비대칭**: false-negative (정당 PR 오탈락 → 조건 spurious 발화 → alert fatigue, Amendment 9 §재검토 조건 #6 이 경고한 그 피로) 가 false-positive (게이밍 PR 통과) 보다 나쁘다. 1인 self-gaming 은 adversarial 이 아닌 자기 가드 무력화라 **저위험** (#823 priority medium). 따라서 denylist 로 false-negative 최소화가 옳다 — allowlist 는 신규 substantive 경로 도입 시마다 목록 갱신 부채 + 오탈락 위험을 진다. (allowlist 대안은 본 표에 기록하되 채택 안 함. cross-validate 에서 denylist 초안 커버리지 stress 예정.)

**trivial denylist** (cross-validate 정제 반영): `README*`, `LICENSE*`, `.gitignore`, `.prettierignore`, `.editorconfig`, `*.png|*.jpg|*.jpeg|*.svg|*.gif`, `*.txt`, 그리고 lock 파일 변종 (`*.lock`, `package-lock.json`, `pnpm-lock.yaml`, `yarn.lock`, `bun.lockb`). (판정 규칙: PR 의 **모든** 변경 파일이 denylist 매칭이면 non-substantive. 비-trivial 파일 ≥ 1 터치 시 substantive.)

> **⚠ markdown 을 denylist 하지 말 것 (cross-validate 역방향 오류 방어)**: cross-validate (agy) 는 일반 프로젝트 직관 (`*.md` / `docs/**` = 문서 = trivial) 으로 이들을 denylist 에 추가 권고했으나 **본 하네스에서는 기각**한다. 이 하네스는 **markdown 이 곧 substantive 자산** (`.claude/agents/*.md`, `.claude/skills/*/SKILL.md`, `CLAUDE.md`, `docs/lessons/`, `docs/decisions/` 이 harness 행동 계약 SSoT). 실측 Phase-2 4건 (#248/#254/#257/#260) 이 **전부 markdown** — `*.md` / `docs/**` / `.github/workflows/**` 를 denylist 하면 정당 기여 4건 전부 non-substantive 오판 → spurious 발화 + 실 기여 거부 (denylist 도입 목적 자체 붕괴). 미래 유지보수자가 일반 직관으로 markdown 을 denylist 에 추가하는 회귀를 **명시 금지**.

### 변경 사항 — substantiality 퀄리파이어 3조건 일관 적용 (통합 스코프 A)

하나의 `isSubstantivePhase2(pr, denylist)` 퀄리파이어로 3조건 동시 보호:

#### 1. 조건 1 (생애 ratio) — 분자 정밀화

- **기존**: `phase2Count` = 전체 Phase-2 PR 개수 (state=all length)
- **정정**: substantive **merged** Phase-2 카운트 (`filterSubstantiveMergedPhase2(phase2Prs).length`) → ratio 분자
- 현재 데이터 4건 전부 substantive → 값 4 불변 (backward-compat). 미래 사소 PR 은 분자에 안 잡혀 ratio 유지 우회 차단.

#### 2. 조건 2 (연속 카운트) — 리셋 앵커 정밀화

- **기존** (Amendment 14): `lastPhase2Date` = merged Phase-2 의 max(mergedAt)
- **정정**: **substantive** merged Phase-2 의 max(mergedAt). 사소 PR (README-only 등) 은 리셋 앵커가 되지 못함 → `consecutiveSinceLastPhase2` 를 0 으로 리셋 불가.
- `computeConsecutiveSinceLastPhase2` 의 merged 필터를 substantive 필터로 교체 (또는 substantive 배열 주입).

#### 3. 조건 3 (90일 경과) — 리셋 앵커 정밀화 + 잠복 버그 해소

- **기존**: `daysSinceFirstApply` = today − `ADR_FIRST_APPLY_DATE` (**고정 2026-05-15**) → day 90 이후 영구 발화
- **정정**: `daysSinceLastSubstantive` = today − max(substantive merged Phase-2 mergedAt). **substantive Phase-2 가 0 건이면 `ADR_FIRST_APPLY_DATE` fallback** (backward-compat).
- 리셋 앵커 정정으로 **영구 false-fire 해소 (#822 조건 2 와 동일 클래스 잠복 버그)** + **사소 PR 로는 조건 3 클록도 리셋 불가** (게이밍 이중 차단). 계약 "90일 경과" 의도 (주기 재검토) 충실.

**임계값 불변**: N=10 / 33% / 90일 수치 변경 0. **모수** (무엇을 Phase-2 로 셀지) + **앵커** (언제부터 셀지) 정밀화만. Amendment 13 "모수 정제" / Amendment 14 "측정 차원 정정" 동일 계열.

### silent 가드 강화 vs 약화 자기점검 (CLAUDE.md §"가드 설계 원칙" §의식적 silent 약화)

- ✓ **silent 가드 강화 방향** — 게이밍 우회로 3종 (사소 PR 리셋 / ratio 분자 오염 / 90일 클록 리셋) 차단. N 임계 변경 0.
- ✓ **§결정 본문 / N=10 / 33% / 90일 임계 변경 0** — Amendment 1/2 SSoT 보존. 옵션 2/3 (LoC/label) 은 measurement 근거로 기각 (silent 약화 아님).
- ✓ **조건 3 영구 false-fire 제거 = 진짜 트리거 보호** — 절대 시각 고정 잠복 버그 (day 90 이후 매주 false-fire) 해소로 alert fatigue 차단. Amendment 14 §false-fire 제거 답습.
- ✓ **measurement-first 정합** — "게이밍이 우려됨" (주관) 이 아닌 "생애 ratio 볼륨 둔감성 + 조건 3 절대 앵커 잠복 버그" (객관 구조) + #248 실측 (LoC 하한 반증) 기반.

### 트레이드오프

- **장점**: 게이밍 우회로 3종 차단 (사소 PR 리셋 / ratio 분자 / 90일 클록) + 조건 3 잠복 버그 (영구 false-fire) 동시 해소 + backward-compat (4건 전부 substantive → 현재 동작 불변) + 하나의 퀄리파이어로 3조건 일관 보호 (SSoT 단일화).
- **단점 (잠재)**:
  - **denylist 커버리지 한계** — 초안 목록에 없는 trivial 파일 유형 (예: `*.txt`, `docs/` 순수 오타 수정) 은 substantive 로 오판 가능. denylist 확장은 발견 시 후속. (allowlist 대비 false-negative 최소 우선 — 위험 비대칭 판단. cross-validate stress 대상.)
  - **trivial 조합 게이밍 잔존** — README + LICENSE 만 동시에 담은 PR 은 non-substantive 로 정확 판별하나, README + 무의미 1줄 `.claude/` 주석 오타를 섞으면 substantive 오판. 1인 self-gaming 저위험 + 조건 1 (ratio) 이중 방어로 medium 수용.
  - **gh API `files` 필드 의존** — 조회 실패 시 보수적 fallback (Phase-2 조회 실패 → substantive 0 건 → 조건 1 분자 0 / 조건 2·3 firstApply fallback = 기존 동작). 기존 try/catch 패턴 답습.

### Concrete Prediction (developer 단계 변경 예측 박제)

- 신규/변경 코드 (`scripts/verify-z-pattern-health.mjs`):
  - Phase-2 조회에 `files` 필드 추가 (`--json number,state,mergedAt` → `+files`) — **~1 라인** (`gh pr list --json files` 지원 실측 확인됨, per-PR fallback 불요)
  - `isSubstantivePhase2(pr, denylist)` **순수 함수 추출 + export** (모든 변경 파일이 denylist 매칭이면 false) — **~10-15 라인**
  - `filterSubstantiveMergedPhase2(phase2Prs)` **순수 함수 추출 + export** (state=MERGED && mergedAt!=null && isSubstantivePhase2) — **~5-10 라인**
  - `computeConsecutiveSinceLastPhase2` 의 merged 필터 → substantive 필터 교체 (또는 substantive 배열 주입) — **~3-5 라인**
  - 조건 1 ratio 분자 `phase2Count` → substantive merged count — **~3-5 라인**
  - 조건 3 `daysSinceFirstApply` → `daysSinceLastSubstantive` (substantive 0 건 시 firstApply fallback) + stdout 메시지 정정 — **~8-12 라인**
  - `--self-test` 확장 케이스 (f)(g)(h) — **~30-40 라인**
  - 헤더 요약 주석 (`:9~12`) 조건 1/3 정정 동기화 (주석-구현 drift 차단 — #822 reviewer 교훈) — **~4 라인**
- **총 예상 라인 수**: 65-100 라인 (스크립트) + ADR ~180-220 라인 (본 §섹션)
- harness-managed 파일 변경: `verify-z-pattern-health.mjs` (`// HARNESS-DRIFT: Z-PATTERN [TODO]` 2번째 줄 **유지**, 새 drift 파일 0)
- 행동 변화 (CHANGELOG `### Behavior Changes` 후보 — developer 단계 박제): "월 cron §재검토 조건 #5 의 Phase-2 카운트에 substantiality (경로 denylist) 퀄리파이어를 3조건 (ratio 분자 / 연속 리셋 앵커 / 90일 클록 앵커) 일관 적용. 머지된 사소 PR (README/오타) 로 조건 우회 차단 + 조건 3 절대 앵커 잠복 버그 (day 90 영구 발화) 해소. 임계값 N=10/33%/90일 불변, 4건 실측 substantive backward-compat" (MINOR 릴리스 후보) — 단 본 PR (architect) 은 ADR Amendment 만 박제 (코드/CHANGELOG 미터치, developer 단계 추가).

### 회귀 가드 (CLAUDE.md §"가드 도입 PR DoD" 4축)

- **(1) 격리 동적 테스트**: developer 단계에서 `node scripts/verify-z-pattern-health.mjs --self-test` — `isSubstantivePhase2` / `filterSubstantiveMergedPhase2` / `computeConsecutiveSinceLastPhase2` 순수 함수에 주입 fixture 로 PASS 의무.
- **(2) 3중 시뮬레이션 + 신규 케이스** (기존 a~e 회귀 유지 + f/g/h 확장):
  - **(f) 사소 PR 리셋 불인정**: README-only 머지 Phase-2 (denylist 전부 매칭) → non-substantive → `consecutiveSinceLastPhase2` 리셋 안 됨 (직전 substantive 앵커 유지)
  - **(g) #248 형 substantive 인정**: `.claude/agents/*.md` ×5 (+5줄) 머지 PR → substantive 인정 (LoC 무관, 경로 기반) → 리셋 앵커 인정
  - **(h) 조건 3 리셋 앵커**: 사소 PR 로는 조건 3 클록 리셋 안 됨 (substantive Phase-2 max 유지) + substantive 0 건 시 firstApply fallback 확인
  - **기존 a~e** (Amendment 14): positive / negative / recovery / backward-compat / merged-only 사각 방어 전부 유지
- **(3) 5 페르소나 self-consistency**: 본 ADR 박제 직후 cross-validate (architect → 메인 단계 의무) + 후속 developer/reviewer/qa 가 동일 결론 (옵션 1 denylist / 3조건 일관 적용 / LoC·label 기각 / 임계 불변 / backward-compat 4건 substantive) 도출 검증.
- **(4) 메타 측정 도구 자기 적용 안정성**: 정정 후 스크립트 실 실행 → 현재 데이터 (substantive 4, 연속 4, ratio 40%, substantive 앵커 2026-05-18 기준 경과 일수) 에서 exit 0 (전 조건 미발화) 확인. `verify-z-pattern-health.mjs` 자신은 데코레이터 `[TODO]` 유지 (drift 심화 없음, sha 변경만).

### Claude 편향 셀프 체크 (4종 — cross-validate 호출 전)

- **낙관적 일정 편향**: 해당 없음 (본 Amendment 는 일정/공수 추정 항목 없음 — 모수/앵커 정밀화 단일 목표). N/A
- **결합 간과 편향**: substantiality 퀄리파이어가 3조건 (ratio 분자 / 연속 앵커 / 90일 앵커) 에 일관 적용되고 하나의 denylist SSoT 를 공유하는지 — 3 적용 지점 독립 확인 (§변경 사항 1/2/3). backward-compat (4건 substantive) 로 과거 동작 불변. **통과**
- **폐기 프레이밍 편향**: LoC 하한 (옵션 2) / label (옵션 3) 을 너무 쉽게 기각? — #248 (+5줄) 실측 반증 + upstream 라벨 결합도 위험 **객관 근거** 기반 기각 (measurement-first). 주관적 폐기 아님. **통과**
- **순수주의 편향** ("경로 기반이 옳은 신호" 긍정 프레이밍 과잉?): measurement 4건 전부 실질 경로 근거라 정합. **단 미통과 잠재 축** — (1) denylist 초안이 실제 게이밍 벡터를 다 커버하는가 (trivial 조합 게이밍 / `*.txt` 등 누락 유형)? (2) denylist vs allowlist 선택의 위험 비대칭 판단이 1인 운영 self-gaming 가정에 과의존하지 않는가? → **cross-validate 명시 질문 삽입 대상**: "경로 denylist 초안 (`README*`/`LICENSE*`/`.gitignore`/`.prettierignore`/이미지/`*.lock`) 이 substantiality 판별에 충분한가? allowlist 대비 false-negative 최소 우선 (위험 비대칭) 이 1인 운영 가정에서 타당한가? 3조건 일관 적용 (통합 스코프 A) 이 조건별 개별 적용보다 나은가?"

### cross-link

- 본 Amendment, [#823](https://github.com/coseo12/astro-simulator/issues/823) 이슈 본문 (Builds on #822)
- 직전 Amendment: Amendment 14 (조건 2 절대→연속 측정 차원 정정 — 본 Amendment 가 그 §고유 발견 C 후속)
- 발화 가드 SSoT: `scripts/verify-z-pattern-health.mjs` (조건 1 ratio 분자 = `filterSubstantiveMergedPhase2().length` / 조건 2 `computeConsecutiveSinceLastPhase2` / 조건 3 `daysSinceLastSubstantive`, Amendment 15 substantive 앵커), `.github/workflows/adr-z-pattern-health-v2.yml`
- 모수/앵커 정밀화 vs silent 약화 SSoT: Amendment 7 (자기참조 인플레) / Amendment 13 (drift 카운트 모수) / Amendment 14 (측정 차원) — 동일 계열 (임계 불변 + 모수 정밀화)
- 측정 방법 원칙: CLAUDE.md §스프린트 계약 #10 (volt [#32](https://github.com/coseo12/volt/issues/32) — 측정 방법 검증 우선. LoC 하한 → #248 실측 반증)
- 가드 설계 원칙: CLAUDE.md §"가드 설계 원칙 — measurement-first / 의식적 silent 약화 / fail-fast" ([docs/lessons/guard-design-principles.md](../lessons/guard-design-principles.md))

### 교차검증 반영 사항 (cross-validate 2026-07-14 완료 — Accepted 전이)

> **상태**: Accepted. cross-validate (agy, `cross_validate.sh architecture`) 로 본 Amendment 15 설계 + §순수주의 미통과 축 명시 질문 3개 (Q1 denylist 커버리지 / Q2 위험 비대칭·threat model / Q3 통합 스코프 A·edge case) 전달. 로그: `.claude/logs/cross-validate-architecture-20260715-020342.log`. 아래 4종 분류 통합 후 Accepted 전이.

**4종 분류 (Claude 재분석 — 맹목 수용 금지):**

- **합의 (수용)**: (Q3) 단일 `isSubstantivePhase2` 퀄리파이어를 3조건에 일관 적용 (통합 스코프 A) 은 "매우 훌륭한 아키텍처적 결정" — 조건별 실질성 정의가 다르면 "리셋됐는데 ratio 엔 미합산" 모순 + 유지보수 비용. substantive 0 건 시 3조건 동시 발화 = Defense-in-Depth 정상 (오랜 기간 + 다수 Phase-1 + 실 기여 0 = 세 경고 모두 타당). Claude 설계와 일치.
- **이견 수용 (범위 내)**: (Q1) `*.lock` 이 `package-lock.json` (`.json` 확장자) 미매칭 — 실제 커버리지 결함. lock 파일명 변종 (`package-lock.json` / `pnpm-lock.yaml` / `yarn.lock` / `bun.lockb`) + `*.txt` + `.editorconfig` denylist 추가 (§후보 비교 §trivial denylist 반영 완료).
- **Claude 재분석 기각 (근거 명시)**:
  - (Q1) agy 의 `**/*.md` / `docs/**/*` / `.github/workflows/**` denylist 추가 권고 **기각** — agy 는 일반 프로젝트 직관 (markdown = 문서 = trivial) 으로 판단했으나, **본 하네스는 markdown 이 곧 substantive 자산**이다. 실측 Phase-2 4건 전부 markdown → `*.md` denylist 시 정당 기여 4건 전부 non-substantive 오판 (denylist 목적 자체 붕괴). §trivial denylist ⚠ 경고로 회귀 명시 차단. **cross-validate 가 오히려 denylist-narrow 를 역강화** (일반 직관의 위험 노출).
  - (Q3) div-by-zero (`phase1Count===0` → `0/0` NaN) / alert 3배 스팸 우려 **기각 (이미 처리됨)** — 기존 구현에 `phase1Count > 0 ? ... : 0` 가드 + `triggers[]` 단일 `[ADR Trigger]` 헤더 취합 + workflow 이슈 dedup 이 이미 존재. developer 는 이 가드/취합 구조 보존 의무 (신규 도입 불요).
  - (종합) gh API 캐싱 (`.z-pattern-cache.json`) 제안 **기각 (YAGNI)** — 월 cron 이 Phase-2 4건 + Phase-1 ~10건 조회 = rate limit 무관 (조기 최적화). 현 스케일 불필요.
- **고유 발견 (기존 §재검토 조건 연결 — 후속 분리 불요)**: (Q2) 다수 다운스트림 배포 시 Goodhart's Law 로 denylist 게이밍 우회 비용 급락 (무의미 주석 1줄로 리셋) → 그 경우 allowlist/label 하이브리드 필요. **유효하나 본 하네스는 1인 운영 전제** (CLAUDE.md §개요 "1인 개발자-AI 페어"). 이 threat model 전환은 **기존 §재검토 조건 #3 (다운스트림 ≤ 1)** 에 자연 매핑 — 다운스트림 증가 시 본 Amendment 15 denylist 접근을 allowlist/label 로 재평가하는 트리거로 §재검토 조건 #3 를 재사용. 신규 이슈/코드 변경 불요, 재검토 조건 문서화로 충분.
- **오탐 필터링**: (Q1 markdown 확장) — 위 기각 참조. 그 외 agy 지적은 유효.
- **Claude 편향 셀프 체크 결과**: §순수주의 축에서 사전 식별한 "denylist 커버리지 / 위험 비대칭 과의존" 미통과 잠재를 cross-validate 가 검증 — Q1 커버리지 결함 (lock 변종) 은 실재 확인·수정, Q2 위험 비대칭은 1인 운영 전제에서 타당 확증 (+ 다운스트림 확장 재검토 조건 연결). markdown-substantive 역방향 발견은 오히려 설계 강화.

## Amendment 16 — 2026-07-22

상태: Accepted (cross-validate 2026-07-22 — §교차검증 반영 사항 4축 통합 완료. CLAUDE.md §ADR Status 워크플로, 앵커 "ADR 신규·개정/폐기")

- **발의**: [#868](https://github.com/coseo12/astro-simulator/issues/868) (§재검토 조건 #5 자동 탐지 2026-07-20) + [#869](https://github.com/coseo12/astro-simulator/issues/869) (§재검토 조건 #6 Amendment 9 동시 발화) — §Amendment 9 규정 "#5/#6 동시 발화 시 #5 우선 (Phase 2 강제 우위)" 에 따라 단일 Amendment 통합 처리.
- **트리거**: 3중 OR 중 3건 발화 보고 (진행률 26.7% < 33% / 연속 10 ≥ N=10 / 63일 경과) + drift 19 ≥ N=10 (실측 시점 27). 단 아래 §forensic 측정이 발화 전제 일부를 정정.
- **결정 요약**: **#5 → 옵션 A (Phase 2 일괄/가속)** / **#6 → 옵션 1 (Phase 2 가속) + carry-over 모수 위생**. 옵션 B(폐기)/C·3(임계 재조정)/2(revert) 기각. **N=10 / 33% / 90일 임계값 변경 0** — Amendment 7/13/14/15 동일 계열 (측정 계약 이행 + 모수 정직화).

### forensic 판정 (5조건 중 4 충족 → forensic 변형)

1. 가설 N≥2 ✓ — "제출 부족" vs "머지 정체" vs "측정 결함" (실측: 복합 — 머지 정체가 주인, 측정 결함이 증폭)
2. Runtime 측정 필수 ✓ — gh 실측 없이는 "매칭 0건" 모순·carry-over 클래스 판별 불가
3. DoD PASS 인데 회귀 ✓ — [Phase 2 Sync] OK 출력과 open PR 7건 공존 (측정 통과 ↔ 운영 실태 mismatch)
4. 5±2 옵션 비교 ✓ / 5. Amendment 라운드 예상 ✓ (cross-validate 후 갱신 가능)

### forensic 측정 (2026-07-22, develop tip c8873ca)

1. **[Phase 2 Sync] "매칭 0건" 모순 확정** — `verifyPhase2Sync()` 의 `--search "ADR 20260515"` 가 open PR 7건 (#309/#318/#320~#324) 에서 0건 반환. 7건 전수 제목·본문에 리터럴 부재 [실측]. 스크립트 주석의 "PR 본문/제목 ADR ID 박제 컨벤션" (D1 실측 결정, Amendment 3 계열) 이 07-06 이후 제출분에서 이행 누락.
2. **Phase-2 분자 과소계상** — 동일 검색식이 분자 카운트에도 사용되어 (a) open 7건은 머지돼도 분자 불변, (b) merged [harness-setting#315](https://github.com/coseo12/harness-setting/pull/315) (2026-07-10, dead-wait 가드 — CLAUDE.md 데코레이터가 Phase-2 로 자기 인용, substantive) 가 이미 누락. **직전 substantive Phase-2 는 2026-05-18 이 아니라 2026-07-10** — 조건 2 (연속 10)·조건 3 (63일) 은 부분 false-fire, 조건 1 은 5/15~16 = 31~33% 경계로 실질 발화 유지.
3. **drift 27 구성 분해** — A. open PR 커버 15 / B. merged 대기 (CLAUDE.md) 1 / C. 신규 번들 대상 3 (verify-docs-links.sh, harness-guards.yml, settings.json delta) / **D. manifest carry-over 8** (`.claude/scheduled_tasks.lock`(gitignored runtime lock!), `.claude/commands/volt.md`, `scripts/browser-verify.mjs`, `docs/glossary.md`, `docs/ops/operational-friction.md`, `docs/phases/product-spec.md`, `docs/phases/roadmap-v1-cosmic-scale.md`, `docs/phases/ui-architecture.md`) — 8건 전부 upstream 저장소에 파일 부재 [gh api 404 실측] = Phase 2 구조적 불가능.

### 변경 사항

#### 1. §재검토 조건 #5 결정 분기 — 옵션 A (Phase 2 일괄/가속)

- 실행: (i) 소급 마킹 (open 7 + #315 본문에 `ADR 20260515` 리터럴 추가), (ii) 사용자 머지 요청 7건 (제출순 순차) + upstream 릴리스, (iii) 신규 번들 U1(verify-docs-links.sh)/U2(harness-guards.yml 범용 delta)/U3(zombie-check hook)/U4(carry-over 결함 보고 이슈), (iv) Phase 3 (harness update + Amendment 10/11 자동 해소).
- 옵션 B 기각 — 제출 7건 존재 = 패턴 작동 중, 폐기 시 15파일 영구 fork. 옵션 C 기각 — 직전 #487 C 채택 후 1일 만에 재발화한 실측 이력 + 이번 병목 (머지 정체/측정 누락/carry-over) 중 임계값이 원인인 것이 0건.

#### 2. §재검토 조건 #6 결정 분기 — 옵션 1 + carry-over 모수 위생

- D 클래스 8건은 Amendment 13 allowlist 가 아니라 **manifest 등재 제거**로 해소 — allowlist 는 "upstream 배포 파일의 영구 교체" 용, D 는 "등재 자체가 결함" (구분 기준 신설, 아래 표). 제거 전 `harness update` 무해성 dry-run 실측 의무.

| 구분          | Amendment 13 allowlist | 본 Amendment carry-over 위생        |
| ------------- | ---------------------- | ----------------------------------- |
| upstream 파일 | 존재 (템플릿/데모)     | **부재** (404)                      |
| 결함 위치     | 없음 (정당 divergent)  | manifest 등재 자체                  |
| 조치          | 카운트 모수 제외       | entry 제거 + upstream CLI 보고 (U4) |

#### 3. Phase-2 식별 컨벤션의 ADR 본문 승격 (§운영 절차 Phase 2 갱신)

- 신규 의무: **Phase 2 upstream PR 은 제목 또는 본문에 리터럴 `ADR 20260515` 포함** (스크립트 주석 → ADR 계약 승격). 소급 마킹은 게이밍 아님 — 데코레이터 SSoT 가 이미 인용하는 substantive PR 의 사실 정정 (Amendment 15 게이밍 방어는 trivial PR 대상, 본 건 무관).
- **소급 마킹 허용 조건 명문화 (cross-validate 고유 발견 1 수용)**: 사후 마킹에 의한 분자 산입은 **(a) 머지 시점에 데코레이터 SSoT 상 해당 PR 의 Phase-2 지정이 이미 존재** + **(b) Amendment 15 substantive 필터 통과** — 두 조건 동시 충족 시에만 허용. 마킹 시점의 주장이 아닌 머지 시점의 기록이 근거여야 한다 (타임스탬프 검증 가드).

#### 4. 측정 보강 3건

- (a) `verifyPhase2Sync()` `--search` 제거 (파일 경로 교집합이 곧 필터) + unmarked-PR 괴리 WARN, (b) `isAdrEvolutionPr` regex 보강 (`chore(release):` / `[#822]`형 Amendment 구현 PR 누수 [실측 #829/#838/#824/#825]), (c) workflow 이슈 템플릿 stale 파일명 (`-v2` 미반영) 문자열 정정. 전부 self-test 케이스 동반.
- 각주 (Accepted 전이 시 정정): 초안은 "(후속 dev)" 로 표기했으나 실제로는 결정 실행 라운드 (PR #873) 에서 **동시 이행** 됨 — Concrete Prediction 의 "조건 1 경계 잔존" 이 55.6% 해소로 초과 달성된 이유 (분모 정정 × 소급 마킹 복합 효과).

### silent 가드 강화 vs 약화 자기점검

- ✓ N=10/33%/90일 임계 변경 0. 옵션 C/3 명시 기각.
- ✓ 소급 마킹·carry-over 위생 = 측정 계약 이행 + 모수 정직화 (Amendment 7/13/14/15 계열) — 발화 부담 (주관) 아닌 gh api 404 ×8 / 본문 리터럴 부재 ×7 (객관) 근거.
- ✓ 조건 1 경계 잔존 (5/16=31%) 을 은폐하지 않음 — 머지 완주 전까지 재발화 가능성 명시 수용.

### Concrete Prediction

- 소급 마킹 직후: 조건 2 연속 10→≤3, 조건 3 63일→12일 (해소), 조건 1 31~33% (경계 잔존)
- 7건 머지 + 마킹 후: 분자 12 → 조건 1 ≥ 75% (해소)
- manifest 위생 후 drift 27→19, Phase 3 완주 후 ≤ 3, U1~U3 후 0~1

### Claude 편향 셀프 체크 (4종)

- 낙관적 일정: 머지·릴리스는 사용자 권한 — 일정 약속 없음, 요청 목록으로 한정. **통과**
- 결합 간과: 동일 파일 다중 PR (qa.md ×3 등) 순차 머지 충돌 리스크 명시. **통과**
- 폐기 프레이밍: 옵션 B/C 기각을 실측 이력 (#487→#495 1일 재발화, 병목 원인 0건) 근거로 수행. **통과**
- 순수주의: **미통과 잠재 축** — (1) #315 소급 인정 기준이 "데코레이터 인용" 에 과의존하는가 (Phase-2 정의 경계)? (2) carry-over 를 allowlist 아닌 manifest 제거로 푸는 판단이 harness update 동작 미실측 상태에서 성급한가? → cross-validate 명시 질문 삽입 대상.

### cross-link

- 발의: #868 / #869, 결정 코멘트: [5-A (#868)](https://github.com/coseo12/astro-simulator/issues/868#issuecomment-5037605745) / [5-B (#869)](https://github.com/coseo12/astro-simulator/issues/869#issuecomment-5037605940) — 재실측 박제: [#868 재실측](https://github.com/coseo12/astro-simulator/issues/868#issuecomment-5037609528) / [#869 위생 실측](https://github.com/coseo12/astro-simulator/issues/869#issuecomment-5037612063)
- 직전 결정 분기 이력: #487(C) → #495(A, Amendment 4) → #500(A 연속, Amendment 6) → #554(측정 정정, Amendment 7) → #766(3′, Amendment 13)
- upstream: open #309/#318/#320~#324, merged #315, 이슈 #319/#325, U4 (생성 후 박제)
- 측정 SSoT: `scripts/verify-z-pattern-health.mjs` / `scripts/verify-harness-drift-decorator.mjs` / `.github/workflows/adr-z-pattern-health-v2.yml`

### 교차검증 반영 사항 (cross-validate 2026-07-22 완료 — Accepted 전이)

agy (architecture 모드, L1/L3 가드) 판정: **승인 적극 권장** — 명시 질문 2건 모두 타당 확인. 로그: `.claude/logs/cross-validate-architecture-20260722-040046.log`

- **합의 (즉시 신뢰)**: (1) #315 소급 마킹 = "부풀리기가 아닌 측정 데이터의 사실 관계 복원" — Amendment 15 substantive 필터가 독립 차단층으로 유효. (2) manifest carry-over 는 "존재하지 않는 대상을 allowlist 로 관리하면 거버넌스 모수 오염 — 등재 제거가 논리적으로 유일하게 올바른 조치". (3) 옵션 C 기각 근거 (#487 1일 재발화 실측) 타당. (4) `--search` → 파일 경로 교집합 전환은 내구성 개선.
- **고유 발견 1 — 수용 (본 PR 반영)**: 소급 마킹 허용 조건의 타임스탬프 검증 가드 명문화 — §변경 3 에 2조건 (머지 시점 데코레이터 지정 + substantive) 동시 충족 규칙 추가. 마킹 시점 주장이 아닌 머지 시점 기록이 근거.
- **고유 발견 2 — 기각 (관찰 유지)**: upstream PR 생성 시 ADR 리터럴 부재를 경고하는 CI Linter 추가 제안 — 다운스트림 c-1 unmarked-PR WARN 이 동일 회귀를 사후 감지로 이미 커버하고, upstream CI 는 별도 저장소 관할 (U 번들 스코프 팽창). 발생 빈도 실측 (7건/6주) 대비 유지 비용 — unmarked WARN 재발 시 재평가.
- **고유 발견 3 — 기존 반영 확인**: 다중 PR 순차 머지 런북 / 재발화 수용 표기 — Amendment 16 §위험 (Track 1 순서 명시) + §자기점검 (조건 1 경계 은폐 없음) 에 기박제. 추가 조치 불요.
- **편향 셀프 체크 해소**: 순수주의 "미통과 잠재 축" 2건이 명시 질문으로 전달되어 모두 타당 판정 — 축 해소. 나머지 3종 (낙관 일정/결합 간과/폐기 프레이밍) 은 agy 6대 기준 평가에서 반증 없음.

---

## Amendment 17 — 2026-07-28

**baseline SSoT 를 manifest 에서 upstream 원본으로 전환 (#894 PR-A)**

- 상태: **Accepted** (cross-validate 2026-07-28 — §교차검증 반영 사항 4축 통합 완료. CLAUDE.md §ADR Status 워크플로, 앵커 "ADR 신규·개정/폐기")
- 관련: 이슈 [#894](https://github.com/coseo12/astro-simulator/issues/894), 선행 PR [#893](https://github.com/coseo12/astro-simulator/pull/893) (회귀 유발), volt [#123](https://github.com/coseo12/volt/issues/123)

### 배경

Amendment 8 이 정의한 drift 판정은 `.harness/manifest.json` 의 `sha256` 을 baseline 으로 삼는다.
그러나 upstream `lib/update.js` 의 apply() 4단계가 `buildManifest(cwd)` 로 프로젝트 디스크를
재해싱해 매니페스트를 재구성하므로 (`lib/manifest.js::walkTracked()`), **적용되지 않은 divergent
파일의 로컬 해시가 baseline 으로 세탁**된다. 다음 회차 `diffAgainstPackage()` 는 이를
`modified-pristine` ("안전 업데이트 — 사용자 미수정") 으로 분류하고 `--apply-all-safe` 가
**자동으로 덮어쓴다**.

결과적으로 Amendment 8 가드는 **초록인 채로** divergent 파일이 drift 집합에서 이탈한다.
`verify-harness-drift-decorator.mjs` 는 drift → 데코레이터 단방향만 검증하므로, baseline 이
세탁되어 이탈한 파일의 **stale 데코레이터가 남아도 PASS** 한다. 이것이 본 Amendment 의 구조적
시그니처다 — **가드가 초록인 채로 P0 가 열려 있다**.

### 실측 (2026-07-28, `origin/develop` = `6431877`, upstream `v4.5.0`)

세탁 경로는 2종이고 대상은 **6건**이다 (이슈 본문 서술 2건 / 설계 단계 추정 4건에서 정정 — dev 단계
전수 대조로 `.github/workflows/harness-guards.yml` / `scripts/verify-docs-links.sh` 2건 추가 발견):

| 파일                                   | 경로                            | manifest `sha256`                   | upstream v4.5.0 | 세탁 시 손실                        |
| -------------------------------------- | ------------------------------- | ----------------------------------- | --------------- | ----------------------------------- |
| `.claude/agents/qa.md`                 | C1 (baseline 세탁)              | `bffdaa7a` (= 로컬)                 | `30aedb41`      | 가드 B 좀비 카나리아 bullet 전체    |
| `.claude/skills/browser-test/SKILL.md` | C1                              | `368c7de5` (= 로컬)                 | `587c5349`      | 셰이더 검증 SSoT 주석               |
| `.github/workflows/harness-guards.yml` | C1                              | `2d056f6d` (= 로컬)                 | `19108a4b`      | #779 concurrency / #480 / #842 누적 |
| `scripts/verify-docs-links.sh`         | C1                              | `b1e12770` (= 로컬)                 | `eb8eac1e`      | #842 다운스트림 체커 배선           |
| `.claude/agents/architect.md`          | C2 (`previousSha256` 롤백 오탐) | `621bbcb7` (prev `f7d50bbf` = 로컬) | `621bbcb7`      | Z 패턴 Phase 1 변경 전체            |
| `.claude/agents/pm.md`                 | C2                              | `997c8c07` (prev `df781fc4` = 로컬) | `997c8c07`      | 동상                                |

`harness update --check` 실측 — 복원 전 `안전 업데이트 (사용자 미수정): 6` (= `--apply-all-safe`
자동 덮어쓰기 대상), 복원 후 **0** / `사용자 변경 보존: 2 → 8`. 자매 가드 drift 집합은 5 → **11** 로
복원되고 데코레이터 전건 PASS.

> **정정 (reviewer 권고 R1, 2026-07-28)**: 본 절 초안은 "drift 9 / alert fatigue 9 < N=10 불변" 이라
> 기록했으나 **사실 오류**다. 머지 전 재실측 결과 **`[Alert Fatigue Trigger] drift 11 >= N=10` 발화**
> (`.claude/scheduled_tasks.lock` 이 세션마다 갱신되는 runtime lock 이라 10~11 사이에서 진동 —
> reviewer 실측 시점은 10). 즉 본 결정은 **alert fatigue 트리거를 발화시킨다**.
>
> **이는 은폐할 사항이 아니라 정직화다.** 종전 카운트가 낮았던 것은 baseline 세탁이 divergent 파일을
> drift 집합에서 이탈시켜 **억제하고 있었기 때문**이며 (§0-2), 복원으로 실제 divergence 가 드러난
> 결과다. 임계값 N=10 은 불변이며 (Amendment 9 SSoT 보존), 발화에 대한 §Amendment 9 §결정점 2
> 옵션 A 의 "3 영업일 내 결정 분기 의무" 는 정상 이행 대상이다 — **해소 경로는 Phase 2 upstream
> 기여**(옵션 1)이며 임계 재조정(옵션 3)은 기각한다.
>
> 또한 발화 모수 11 중 2건은 artifact 다 (reviewer 권고 R2): `CLAUDE.md` 는 자매 가드가 plain
> sha 로 로컬을 해싱해 managed-block 의 categorical manifest 와 비교하는 **선행 결함**으로 영구
> drift 이고, `verify-zombie-check.mjs` 는 upstream 부재 carry-over 다. 신규 가드의 `divergent: 8`
> 이 의미상 정확하며, Amendment 9 모수 정밀화는 후속(PR-B)으로 분리한다.

### 결정

1. **baseline SSoT 는 upstream 원본(태그된 릴리스)이다.** `.harness/manifest.json` 은 CLI 가 쓰는
   **작업 상태**이지 Z 패턴의 진실 원천이 아니다.
2. 신규 가드 `scripts/verify-harness-upstream-baseline.mjs` 가 upstream 태그 tarball 을 baseline 으로
   3 불변식을 **fail-fast** 검증한다:
   - **(A)** upstream 과 다른 managed 파일 → HARNESS-DRIFT 데코레이터 필수 (Amendment 8 정본화)
   - **(B)** 데코레이터 보유 파일 → upstream 과 **실제로 달라야** 함 (stale 데코레이터 차단, 역방향 사각 해소)
   - **(C)** 로컬 ≠ upstream 이면서 CLI 가 `modified-pristine` 으로 판정할 상태 → 즉시 FAIL
     (**C1** `sha256 == 로컬` / **C2** `previousSha256 == 로컬`)
3. **(A)(B) 와 (C) 는 서로 다른 divergence 개념을 쓴다.** (A)(B) 는 Amendment 8 데코레이터 계약이
   지시하는 **파일 전체** divergence (plain sha256), (C) 는 CLI 분류 동형성이 목적이므로
   `categoricalSha256` 을 쓴다. 두 개념이 갈라지는 유일한 카테고리는 `managed-block` (`CLAUDE.md`) 인데,
   하나로 통일하면 본 가드 (B) 가 "데코레이터 제거" 를, 자매 가드가 "데코레이터 박제" 를 동시에
   요구하는 **가드 간 교착**이 발생한다 (dev 단계 실측 — 통일안에서 실제 재현).
4. exit 코드는 `0` 정상 / `1` 불변식 위반 / **`2` 판정 불가** (네트워크 실패·태그 부재·manifest 부재).
   exit 2 는 fallback 이 아니라 명시적 구분이며, 판정 불가를 PASS 로 흡수하지 않는다
   (CLAUDE.md §가드 설계 원칙 — fail-fast, fallback 분기 금지).
5. **CRITICAL**: `harness update --apply-*` 이후 `--mode=repair --apply` 로 manifest baseline 을
   복원하지 않은 채 커밋하는 것을 **금지**한다. 절차 SSoT 는 `.claude/commands/harness-update.md` §7.
6. **가드 생존 검증의 비대칭 해소** — `verify-zombie-check.mjs` 에 `settings.json` hook 등록 체크를
   추가한다 (`verify-dead-wait-check.mjs` check#2 와 동형). (A)(B)(C) 는 **파일 단위** 불변식이라
   "파일은 divergent 인 채로 특정 조항만 사라지는 부분 손실" 을 원리적으로 볼 수 없다. 두 축은 직교다.
7. 비-harness-managed 디렉토리 선택 (#795 `docs/ops/`) 은 **`.harnessignore` 등록과 쌍으로** 성립한다.
   등록 없이는 `TRACKED_DIRS` 순회로 매니페스트에 재편입된다 (PR-B 에서 이행).

### 결과·재검토 조건

- upstream 이 `buildManifest` 결함을 수정하면 (미적용 divergent 의 `sha256` 보존, 또는 baseline/local
  분리 필드) (C) 불변식과 repair 모드는 **중복**이 되므로 폐기 후보. upstream 이슈 종결 시 재검토.
- tarball 다운로드 실패가 CI 에서 유의미해지면 (월 1회 이상) 캐시 전략 재설계. 현재는 버전 키
  프로세스 외 캐시 (`$HARNESS_UPSTREAM_CACHE_DIR` > `$RUNNER_TEMP` > tmpdir) 로 job 내 1회 다운로드.
- 데코레이터 다중 URL 문법 정식화 + Amendment 10 append 전환 (α/β) 은 **PR-B** 로 분리한다.
  본 Amendment 는 baseline 정의 전환과 P0 차단에 한정한다.

### 미해결 / 이월 (PR-B)

- `.harnessignore` 자동 생성 + carry-over 264 entry 정리 (`removed-upstream` = `--interactive`
  **[d]elete 삭제 후보** 상시 노출 — 잠재 파괴 경로)
- `.prettierignore` 재생성 + `docs/ops/` prettier 대상 복귀
- Amendment 10 정밀화 (α 다중 URL / β 다중 후보 시 자동 적용 보류) + `verify-z-pattern-health.mjs`
  주석↔구현 drift 2건 정정
- `qa.md` 양방향 divergence 해소 (로컬 가드 B bullet ↔ upstream bracket 근거 문장 — 어느 쪽도
  superset 아님) 는 별도 후속 이슈
- upstream 신규 이슈 (`buildManifest` 세탁 + `previousSha256` 롤백 오탐 + `TRACKED_DIRS` 통째 등록)

### cross-link

- 발의: [#894](https://github.com/coseo12/astro-simulator/issues/894) — 설계 코멘트
  [#894 architect](https://github.com/coseo12/astro-simulator/issues/894#issuecomment-5093544727)
- 회귀 유발: PR [#893](https://github.com/coseo12/astro-simulator/pull/893) (Phase 3 동기화 시 §7 절차 부재)
- 선행 관찰: volt [#123](https://github.com/coseo12/volt/issues/123) (`--apply-all-safe` 가 안전하지 않음)
- 측정 SSoT: `scripts/verify-harness-upstream-baseline.mjs` (`--self-test` 40 assertion)
- 절차 SSoT: `.claude/commands/harness-update.md` §7 / CI: `.github/workflows/harness-guards.yml`

### 교차검증 반영 사항

**수행 완료 (agy architecture 모드, L1/L3 가드, 2026-07-28)** — 로그
`.claude/logs/cross-validate-architecture-20260728-030926.log`. 명시 질문 2건 (설계 §Claude 편향
셀프 체크의 미통과 소지 2축) 을 전달했고 **양쪽 모두 "판단 타당"** 판정을 받았다.

**합의 (즉시 신뢰)**

- **명시 질문 1 (낙관적 일정 축)** — upstream PR 머지·릴리스 일정은 다운스트림이 통제 못 하는 외부
  변수이고, P0 사각이 열린 상태에서 upstream 수정을 블로킹 의존으로 두는 것은 불가능하므로
  **다운스트림 가드 우선 도입이 정답**. 병행 보고(비-블로킹) 판단 타당.
- **명시 질문 2 (순수주의 축)** — plain / categorical 해시 분리는 "두 가드의 검증 목적이 서로 다르다"
  (Amendment 8 전체 파일 divergence vs CLI 분류 동형성) 는 점에서 **불가피하며 합리적**. 봉합이 아님.
- 임계값 N=10 불변 + 발화 정직화 방향 (§실측 정정 박스) 도 이견 없음.

**고유 발견 1 — 수용, 단 PR-B 로 분리** : _"`--mode=repair --apply` 를 인간이 기억해서 실행하는
구조(§7 절차)는 PR #893 처럼 반드시 재발한다. `harness update` 호출을 래퍼로 감싸
update → repair --apply → verify 를 **원자적 1-step** 으로 만들라."_

- **설계는 "래핑 스크립트 불필요 — 커맨드 문서 절차로 충분" 을 명시적 비목표로 뒀으나, #893 이
  실제로 그 절차 누락으로 baseline 을 세탁한 실측**이 agy 편이다. 절차 문서화만으로는 동일 실패가
  재현된다는 지적이 옳다.
- 다만 스프린트 계약의 **비목표를 뒤집는 변경**이므로 CLAUDE.md §교차검증 수용/분리 3단 프로토콜에
  따라 **PR-B 로 분리** (즉시 반영 시 PR-A 스코프 팽창 + P0 차단 머지 지연). PR-B 완료 조건에
  `scripts/harness-update-safe.sh` (원자적 래퍼) 를 추가한다.

**고유 발견 2 — 수용 (본 절 박제로 이행)**: categorical 사용 이유와 managed-block 도메인 특성을
계약으로 명시하라 → §결정 3 + 본 절이 그 계약이며, 가드 소스 헤더 주석에도 동일 근거가 박제돼 있다.

**Claude 편향 셀프 체크 (4종) — agy 반증 반영**

- **낙관적 일정: 미통과 → 정정 수용.** 설계의 PR-A 코드량 추정 **~250줄은 과소**였고 agy 가
  400~500줄 이상을 예측했다. **실측 1,231줄 (+18/−0 제외)** 로 agy 가 맞았다. 팽창 요인 지목
  (tarball 3단 캐시 fallback / categorical 슬라이싱 / self-test 40 assertion) 도 정확.
- **순수주의: 통과** — 네트워크 의존은 exit 2 (판정 불가) 로 조용한 PASS 를 차단하므로 과잉 설계
  아님. 단 agy 의 **오프라인 대안 2안** (A: local git object/`git archive` 로 태그 추출, B:
  `.harness/upstream-baseline.json` 해시맵 pinning) 은 **재검토 조건으로 박제** — CI 에서 exit 2 가
  월 1회 이상 관측되면 대안 A 를 우선 검토한다.
- 결합 간과: 통과 (가드 간 교착을 구현 중 실측해 §결정 3 으로 해소).
- 폐기 프레이밍: 통과 (upstream `buildManifest` 수정 대기는 "블로킹 의존" 근거로 기각, 병행 보고 유지).

**기각 0건** — agy 지적 중 근거 부족으로 반려한 항목은 없다.
