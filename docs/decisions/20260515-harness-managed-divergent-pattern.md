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
5. **Phase 2 (upstream 기여) N=3 회 연속 미진행 OR Z 패턴 첫 적용 후 30일 경과** — Y (영구 fork) 회귀 신호로 간주. 트리거 발화 시 후속 행동: 3 영업일 내 [ADR Trigger] 라벨 discussion 이슈 생성 의무 (Phase 2 일괄 처리 vs 패턴 폐기 vs N 임계값 재조정 결정 분기). Amendment 1 (2026-05-16) 박제.

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
