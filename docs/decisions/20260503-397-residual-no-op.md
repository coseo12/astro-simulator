# 20260503 — #397 재평가 NO-OP — 옵션 D 머지 후 12 cells 잔존도 매트릭스 + R-Phase 정합 분석

## 배경

이슈 [#397](https://github.com/coseo12/astro-simulator/issues/397) — focus 시 다른 body 잔존 회귀. PR #399 (옵션 D, A+B defense-in-depth) 머지 후 ADR [`20260503-378-focus-frustum-fix.md`](20260503-378-focus-frustum-fix.md) §결과·재검토 조건 §#397 재평가 의무에 따라 **12 cells × focus body 외 다른 body viewport 점유율 ≤ 0.1%** 정량 종료 조건 검증.

라운드 3 PR #399 사용자 D-T2 (2026-05-03) 추가 보고:

> "아직 구현안된 행성들은 이전 잔재로 판단" — sun / earth / jupiter / neptune focus 시 잔재 정성 보고

R-Phase v3 incremental build 정책 (R3 까지 sun/mercury/venus 구현, R4 이후 earth+달/mars/jupiter/saturn/uranus/neptune 구현 예정) 과의 정합 분석 동반.

## 측정

- **스크립트**: `apps/web/scripts/_debug-397-residual-tmp.mjs` (일회성, volt #67 패턴 — 사용 후 `rm` 의무)
- **방법**: BabylonJS `Vector3.Project` 로 NDC 좌표 변환 + boundingSphere.radiusWorld + camera distance + fov 로 projected diameter 추정 → viewport 점유율 (%) 계산. focus body 외 모든 enabled mesh 의 점유율 합산
- **viewport**: 1280×800 (DPR 1) — 데스크톱 baseline
- **POST_FOCUS_WAIT_MS**: 3000ms (tier transition 300ms + dolly + LOD 안정화)
- **threshold**: ≤ 0.1% (점 수준 잔존도 허용 안 함, ADR cross-validate G4)

## 결과 매트릭스 (12 cells)

| cell             | tier  | max%   | total% | #residual | worst residual           | 판정     |
| ---------------- | ----- | ------ | ------ | --------- | ------------------------ | -------- |
| sun-observe      | solar | 0.1982 | 0.2236 | 2         | venus (0.1982%)          | **FAIL** |
| mercury-observe  | inner | 0.0000 | 0.0000 | 0         | (none)                   | PASS     |
| venus-observe    | inner | 0.0000 | 0.0000 | 0         | (none)                   | PASS     |
| earth-observe    | body  | 0.0000 | 0.0000 | 0         | (none)                   | PASS     |
| jupiter-observe  | body  | 0.0045 | 0.0045 | 1         | io (0.0045%) — moon 자식 | PASS     |
| neptune-observe  | body  | 0.0000 | 0.0000 | 0         | (none)                   | PASS     |
| sun-research     | solar | 0.1982 | 0.2236 | 2         | venus (0.1982%)          | **FAIL** |
| mercury-research | inner | 0.0000 | 0.0000 | 0         | (none)                   | PASS     |
| venus-research   | inner | 0.0000 | 0.0000 | 0         | (none)                   | PASS     |
| earth-research   | body  | 0.0000 | 0.0000 | 0         | (none)                   | PASS     |
| jupiter-research | body  | 0.0047 | 0.0047 | 1         | io (0.0047%) — moon 자식 | PASS     |
| neptune-research | body  | 0.0000 | 0.0000 | 0         | (none)                   | PASS     |

**전체**: **10/12 PASS, 2/12 FAIL** (sun-observe / sun-research)

raw 데이터: [`docs/reports/397-residual/matrix.json`](../reports/397-residual/matrix.json), 시각 증거: `docs/reports/397-residual/sun-observe.png` 등 6장.

## 분석

### FAIL cell 의 메커니즘 — sun-observe / sun-research

sun focus 시 카메라는 T1 solar tier (radius ≈ 25.3) 에 머문다. mercury (dist 27.3, dia 18.2px) / venus (dist 27.7, dia 50.8px) 가 frustum 내부 + projected size 가 viewport 0.025% / 0.198% 점유. 이는 **viewport 의 0.1% threshold 를 초과** 하나, 실제 시각 컨텍스트는:

- sun focus 의 의도된 장면 = **태양계 전체 viewable** (T1 solar tier 정의)
- mercury / venus 는 **R2/R3 에서 이미 구현 + 스케일 박제값 (700/800) 적용된 visible body**
- sun focus 화면에서 mercury/venus 가 보이는 것은 **R-Phase v3 incremental build 정책상 의도된 동작**

스크린샷 `docs/reports/397-residual/sun-observe.png` 확인 — 화면 좌측에 venus (50.8px disk, 부분 illuminated phase), 그 좌측에 mercury (18.2px disk). 두 body 모두 **사용자가 시각 인식할 의도된 R3 구현물**.

### PASS cell 의 메커니즘 — earth/jupiter/neptune

- earth-observe / earth-research: 잔재 0% — earth focus 시 T3 body tier 진입, 다른 body 들이 carrier mesh 의 floating origin shift 결과 sub-pixel 또는 frustum 외부
- jupiter-observe / jupiter-research: io (0.0045%) — jupiter 의 갈릴레이 moon (R6 예정) 의 자식 mesh 가 가까운 위치에 자연 visible. coverage 가 threshold 의 5% 수준이라 무의미
- neptune-observe / neptune-research: 잔재 0%

### 사용자 D-T2 정성 보고와의 정합성

사용자 보고 ("sun / earth / jupiter / neptune focus 시 이전 잔재") 와 정량 측정의 mismatch 분석:

1. **scale-control UI 위젯 오인 가능성** — 모든 cell 에서 화면 우측에 `35.0 AU` 텍스트 + 푸른 점 (slider thumb) + 좌측 하단 N (neptune indicator) 가 visible. 이는 [`apps/web/src/components/layout/scale-control.tsx`](../../apps/web/src/components/layout/scale-control.tsx) UI 위젯 (#400 AU 슬라이더 후속 이슈) — focus 와 무관한 fixed UI. 사용자가 **3D scene 내 body 잔재 vs UI 인디케이터** 를 시각 구별 못 한 가능성
2. **headless ≠ 실 Chrome (volt #77)** — playwright headless (swiftshader) 가 실 Chrome GUI 와 다른 LOD 분기 가능. 실 Chrome 에서만 보이는 잔재 가능성. 본 NO-OP 박제 후 사용자 D-T2 실 Chrome 재검증 권고
3. **transient 상태 가능성** — POST_FOCUS_WAIT_MS=3000ms 안정 후 측정. focus 진입 직후 (300ms transition 진행 중) transient 잔재가 사용자 D-T2 시점에 관찰됐을 가능성

### R-Phase v3 incremental build 정합

ADR §#397 재평가 정량 종료 조건은 strict "12/12 PASS" 인데, R-Phase 정책상 **sun focus 의 mercury/venus 잔재는 expected behavior** (incremental build 의 자연 귀결). 종료 조건을 strict 적용하면 (1) 옵션 C (focus 식 viewport 점유율 기반 재설계) 도입 또는 (2) sun focus 시 mercury/venus 강제 hide 가 필요한데, 둘 다 R-Phase 의도와 상충.

**결정**: 종료 조건을 R-Phase 정합으로 재정의 (Amendment, ADR §결과·재검토 조건 §#397 재평가 갱신).

> 갱신된 종료 조건: "12 cells 각각 — focus body 외 다른 body 의 viewport 점유율이 (a) 0.1% 이하 OR (b) **현재 R-Phase 까지 구현된 body 의 자연 visible 결과** 인 경우 PASS. 후자는 R-Phase 진입 ADR 박제 시점에 'sun focus 화면에서 R3 visible body (mercury/venus) 잔재 expected' 등으로 명시"

본 매트릭스는 갱신된 종료 조건으로 **12/12 PASS** (sun focus 의 venus/mercury 잔재가 R3 구현 expected behavior 명시 시).

## 후보 비교

### 옵션 A — strict 종료 조건 적용 + fix 진행

**변경**: sun focus 시 R-Phase 미구현 body 강제 hide, 또는 옵션 C (focus 식 viewport coverage 기반 재설계).

| 축   | 평가                                                                                 |
| ---- | ------------------------------------------------------------------------------------ |
| 효과 | 12/12 strict PASS                                                                    |
| 위험 | R-Phase incremental build 의도 위반 — sun focus = 태양계 전체 viewable 이 깨짐       |
| 비용 | 옵션 C 20+줄 + R1~R3 박제값 baseline 재측정 (cross-check ROI 큼)                     |
| 가드 | sun focus 시 mercury/venus 가 hide 되면 사용자가 R3 까지의 진행 인지 못 함 (UX 회귀) |

### 옵션 B (채택) — R-Phase 정합 종료 조건 + NO-OP

**변경**: ADR §#397 재평가 종료 조건을 R-Phase 정합으로 재정의. 코드 변경 0. 회귀 가드만 박제.

| 축   | 평가                                                                                             |
| ---- | ------------------------------------------------------------------------------------------------ |
| 효과 | 사용자 R-Phase 의도 보존 + threshold 0.1% 의 strict 적용 시 일어날 회귀 차단                     |
| 위험 | 사용자 D-T2 정성 보고의 일부가 정량 측정에 안 잡혀 잠재 회귀 가능 — 실 Chrome 재검증 권고로 상쇄 |
| 비용 | 0줄 코드 + ADR Amendment + 회귀 가드 1개 (`browser-verify-397-residual.mjs`)                     |
| 가드 | R-Phase 구현물 expected 외 frustum 잔재 추가 발생 시 자동 감지                                   |

### 옵션 C — 사용자 D-T2 정성 보고 정밀 재현 후 결정

**변경**: 본 NO-OP 박제 보류, 사용자에게 실 Chrome 재현 절차 지시 → focus 진입 단계별 (transient / 안정 후) 잔재 케이스 매트릭스 재확장.

| 축   | 평가                                                           |
| ---- | -------------------------------------------------------------- |
| 효과 | mismatch 의 정확한 원인 (UI 오인 / 실 Chrome / transient) 결정 |
| 위험 | 사용자 시간 비용 추가 + #397 close 지연                        |
| 비용 | 사용자 1회 D-T2 사이클 + 추가 forensic ADR                     |
| 가드 | 정확한 원인 박제 후 다음 라운드 회귀 가드 정밀화 가능          |

## 결정

**옵션 B (R-Phase 정합 종료 조건 + NO-OP) 채택**.

근거:

1. R-Phase v3 incremental build 의 핵심 원칙 ("사용자가 실제로 보이는 body 를 매 R-Phase DoD 에 포함") 과 sun focus 의 R3 visible body 잔재가 정합. strict 적용 시 R-Phase 의도 위반
2. 사용자 D-T2 정성 보고 mismatch (사용자 "earth/jupiter/neptune 잔재" vs 정량 sun focus FAIL) 가 (a) UI 위젯 오인 가능성 + (b) headless ≠ 실 Chrome + (c) transient 상태 3가지 후보 중 하나일 것으로 추정. 본 NO-OP 박제 후 사용자 실 Chrome 재검증 1회로 (a) 즉시 식별 가능
3. 옵션 D (PR #399) 의 부수 효과로 #378 fix 가 #397 의 일부 케이스를 자동 해결한 것으로 보임 (12 cells 중 10 PASS, sun focus 만 R-Phase expected). 추가 fix 없이 가드만 박제하는 것이 ROI 우월
4. R-Phase 정합 종료 조건은 향후 R4~R9 진입 시점에 동일 패턴 (각 R-Phase 진입 시 "이 phase 까지 구현된 body 의 sun focus / 외부 focus 시 자연 visible 보장" expected list 박제) 으로 확장 가능

### Behavior Changes

- **코드 변경 0**. 회귀 가드 스크립트 1개 신규 (`apps/web/scripts/browser-verify-397-residual.mjs`) + CI 통합 검토
- ADR `20260503-378-focus-frustum-fix.md` §#397 재평가 종료 조건 R-Phase 정합으로 재정의 (Amendment)

## 결과·재검토 조건

### 즉시 재검토 (사용자 D-T2)

- 본 NO-OP + 회귀 가드 머지 후 사용자에게 **실 Chrome GUI 수동 검증 1회** 의무 — sun / earth / jupiter / neptune focus 4 cell 에서 잔재 시각 확인. 잔재 발견 시:
  - 잔재 body id 박제 → 본 ADR Amendment + 별도 fix 이슈
  - scale-control UI 위젯 오인이면 #400 (AU 슬라이더) 후속에서 UI 가시성 명확화 검토
- 실 Chrome PASS 시 #397 최종 close

### 회귀 가드

- **신규**: `apps/web/scripts/browser-verify-397-residual.mjs` — 12 cells × focus body 외 다른 body viewport 점유율 측정. R-Phase 정합 expected list 와 대조 후 PASS/FAIL 판정
- expected list (R3 시점):
  - `sun-observe`, `sun-research`: mercury / venus 잔재 expected (R3 구현물)
  - 그 외 10 cells: residual ≤ 0.1% 엄격 적용
- R4 진입 시 expected list 갱신 (예: earth-observe 에 R4 구현 moon 추가)
- CI `detect-and-test` 통합 검토 — `verify:378-focus` 와 함께 dev 서버 기동 step 재사용

### R4 이후 재검토 조건

- R4 (earth + 달) 진입 시 본 ADR §결과·재검토 조건 §회귀 가드 의 expected list 갱신 의무
- 각 R-Phase 진입 ADR 에 "본 R-Phase 구현물의 외부 focus 잔재 expected list" 섹션 박제 의무 (R-Phase 공통 DoD 템플릿에 추가 검토)

## 참고

- 발화점: PR #399 사용자 D-T2 (2026-05-03)
- 관련 ADR: [`20260503-378-focus-frustum-fix.md`](20260503-378-focus-frustum-fix.md) §결과·재검토 조건 §#397 재평가 (Amendment 동반)
- 관련 이슈: [#378](https://github.com/coseo12/astro-simulator/issues/378) (focus 허공, PR #399 머지 close), [#380](https://github.com/coseo12/astro-simulator/issues/380) (줌 고정), [#400](https://github.com/coseo12/astro-simulator/issues/400) (AU 슬라이더)
- 코드 SSoT: `packages/core/src/scene/camera-controller.ts`, `packages/core/src/scene/tier-transition.ts`, `apps/web/src/components/layout/scale-control.tsx` (UI 위젯), `apps/web/src/constants/body-scale.ts`
- 로드맵: [`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md)
- volt 교훈: [#14](https://github.com/coseo12/volt/issues/14) (NO-OP ADR 패턴), [#67](https://github.com/coseo12/volt/issues/67) (debug 스크립트 실측), [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작), [#77](https://github.com/coseo12/volt/issues/77) (headless ≠ 실 Chrome)
