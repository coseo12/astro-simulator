# 20260503 — #378 focus 회귀 forensic + fix 옵션 비교 (architect 단계)

- 상태: Accepted (2026-07-21 소급 박제 #842 — 원 박제 시 상태 필드 누락. #378 CLOSED, fix 구현 완주)

## 배경

R3 (#369) PR #371 머지 + R3 fix PR #377 D-T2 (2026-04-30) 사용자 검증에서 focus 인터랙션 시 **focus 대상 body 가 화면 중앙에 표시되지 않고 허공만 보이는** 회귀 5건 중 #2 발견. 이슈 [#378](https://github.com/coseo12/astro-simulator/issues/378) 박제. 라운드 3 (PR #396 머지, 2026-05-03) D-T2 에서 다음과 같이 매트릭스 좁혀짐:

- **재현 케이스**: 상단 shortcut bar **금성 (venus) 버튼 focus** → 화면 중앙 허공
- **분리 회귀 패턴**:
  - 관찰 모드 (default 진입) focus venus → 허공 (재현)
  - 연구 모드 focus venus → 정상 표시 (회귀 없음)
- 박제값 영향 가설: 라운드 2 (mercury 900 / venus 650) → 라운드 3 (mercury 700 / venus 800) 변경 후 venus 만 명시 회귀

본 ADR 은 architect 단계 forensic 결과 박제 + 후속 fix 옵션 4개 비교. 구현은 developer 단계에서 진행.

## Forensic 데이터

- **매트릭스 SSoT**: [`docs/reports/378-forensic/output.json`](../reports/378-forensic/output.json) (정적 분석 12 cells. 본 PR 단계에서는 dev 환경 빌드 비용으로 정적 매트릭스만 박제. 실측 매트릭스는 developer 단계에서 fix 검증과 함께 첨부)
- **재현 매트릭스 요약**:

| body    | 모드     | T1 desiredRadius (raw) |      T1 후 clamp | tier 결정 | T3 mesh 직경 | tier-transition radius | 정적 예측        | 사용자 D-T2 보고 |
| ------- | -------- | ---------------------: | ---------------: | --------- | -----------: | ---------------------: | ---------------- | ---------------- |
| sun     | observe  |                  14.61 | 14.61 (no clamp) | T1 유지   |          n/a |                    n/a | PASS             | (회귀 미보고)    |
| mercury | observe  |                 0.0107 |  **0.5 (clamp)** | T1→T3     |         85.7 |                 214.25 | PASS             | (회귀 미보고)    |
| venus   | observe  |                 0.0104 |  **0.5 (clamp)** | T1→T3     |        243.0 |                  607.5 | **FAIL 후보**    | **FAIL — 허공**  |
| venus   | research |                 0.0104 |  **0.5 (clamp)** | T1→T3     |        243.0 |                  607.5 | (코드상 동일)    | **PASS — 정상**  |
| earth   | observe  |                   0.01 |  **0.5 (clamp)** | T1→T3     |        0.319 |                    0.8 | PASS (mesh 작음) | (미보고)         |
| jupiter | observe  |                   0.01 |  **0.5 (clamp)** | T1→T3     |         3.51 |                   8.78 | PASS             | (미보고)         |
| neptune | observe  |                   0.01 |  **0.5 (clamp)** | T1→T3     |        1.236 |                   3.09 | PASS             | (미보고)         |

> 정적 예측 컬럼은 코드 분석 + 수치 계산 기반. 실측 매트릭스는 developer 단계에서 dev 환경 빌드 후 brower-test 스킬로 보강.

### 핵심 식 + 상수

- focus 식 (camera-controller.ts:56): `desiredRadius = max(meshRadius * 5, meshRadius + 0.01)` where `meshRadius = boundingSphere.radiusWorld`
- tier-transition 식 (tier-transition.ts:174-176): focusMesh 분기에서 동일 `max(meshRadius_newTier * 5, meshRadius_newTier + 0.01)`
- ArcRotateCamera 기본 (camera.ts:31): `lowerRadiusLimit = 0.5`, `minZ = 0.01`, `maxZ = 1e14`, `fov` Babylon 기본 ≈ 0.8 rad
- T1 solar renderScale = 8.4e-11, T3 body renderScale = 2.51e-5 (scale ratio ~3e5)
- venus.radius_m = 6.0518e6, venus.bodyScale = 800 (라운드 3, 2026-05-03)

### 분리 회귀 메커니즘 핵심 분석

1. **모든 planet focus 가 T1 시점 lowerRadiusLimit clamp 발동**: 정적 매트릭스가 입증. T1 에서 desiredRadius 가 0.0107 ~ 0.0104 unit 인데 ArcRotateCamera 의 `lowerRadiusLimit=0.5` 로 clamp → 카메라가 venus 의 0.5 unit 떨어진 곳에 정착
2. **이후 매 프레임 onBeforeRender 가 tier 재판정 → T3 'body' 전환** (cameraFromFocus = 0.5 × renderScale 역수 = 5.95e9 m = 0.04 AU < 0.1 AU)
3. **tier-transition 이 boundingSphere.radiusWorld × 5 로 새 radius 계산**: venus T3 = 121.5 → targetRadius=607.5
4. **`mesh.computeWorldMatrix(true)` 누락 가설** (tier-transition.ts:174 직전): tier 전환 시 mesh.scaling 은 setTier 가 갱신하지만 boundingSphere 는 다음 frame world matrix 갱신 후 정확. radiusWorld 가 잔존 값 (T1 기준 작음) 으로 읽히면 targetRadius 가 작아짐 → lowerRadiusLimit clamp 재발동 → 카메라 mesh 내부 박힘. **venus 만 명시 회귀** 의 이유는 venus 의 박제값 800 + radius 조합이 boundingSphere 잔존 timing 에서 가장 민감

5. **연구 모드 회귀 없음** 메커니즘: side-panels expand → ResizeObserver fire → engine.resize() 가 다수 frame 에 걸쳐 호출. 이 사이 onBeforeRender 도 함께 fire 되어 mesh.computeWorldMatrix 가 implicit 갱신 → boundingSphere.radiusWorld 가 정확. 결과적으로 tier-transition 이 정상 targetRadius 를 산출. 코드상 mode 분기 0 인데 실 동작 차이가 발생하는 이유.

> 본 메커니즘은 **가설 (정적 분석 + 코드 추적 기반)** 이며 fix 단계 실측 매트릭스로 확정 필요. ADR §결과·재검토 조건 참조.

### #397 (focus 시 다른 body 잔존) 통합/분리 결정

- **결정**: **통합 진단, 분리 fix**
- 근거: focus 후 카메라 위치 + mesh radius \* 5 산식 + T3 origin shift 후 다른 body 의 frustum 내 잔존이 동일 카메라 로직 회귀의 다른 발현. fix 옵션 1, 2 (radius 식 정정 / lowerRadiusLimit 동적 완화) 가 #378 해결 시 #397 의 일부 케이스도 자동 해결될 가능성. 단 #397 의 "다른 body 가 화면에 점으로 잔존" 은 별도 frustum culling / occlusion 이슈일 수 있어 #378 fix PR 머지 후 #397 재검증 → NO-OP 가능성 또는 별도 fix 진행.

## 후보 비교 (4 옵션)

### 옵션 A — focus 식의 lowerRadiusLimit 동적 적응

**변경**: `camera-controller.ts` 의 `focusOn()` 에서 `desiredRadius < camera.lowerRadiusLimit` 일 때 `camera.lowerRadiusLimit = max(camera.minZ, desiredRadius * 0.5)` 로 임시 완화. tier-transition.ts:189 와 동일 패턴.

| 축        | 평가                                                                                                                                                                                           |
| --------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 효과      | T1 시점 clamp 차단 → cam-radius animation 이 진짜 0.0107 로 향함. 그러나 0.0107 unit ≈ 1.27e8 m ≈ 0.85 백만 km 거리에서 venus radius 6051 km 가 viewport 어떻게 보일지 viewport 의존 검증 필요 |
| 위험      | T1 시점 카메라가 venus 표면 가까이 가면 다른 body / sun glow 등 시각 충돌. mid LOD billboard 와의 transition 도 같은 frame 에 발동                                                             |
| 비용      | 5줄. tier-transition.ts 로직과 일관                                                                                                                                                            |
| 회귀 가드 | 기존 lowerRadiusLimit 가드는 사용자가 manual zoom 시 너무 가까이 못 가게 막는 안전망 — 본 변경은 focus 트리거 한정 완화라 안전                                                                 |

### 옵션 B — tier-transition 의 boundingInfo 갱신 강제

**변경**: `tier-transition.ts:174` 직전에 `focusMesh.computeWorldMatrix(true); focusMesh.refreshBoundingInfo();` 명시 호출 → boundingSphere.radiusWorld 가 새 tier scaling 으로 즉시 정확.

| 축        | 평가                                                                                                     |
| --------- | -------------------------------------------------------------------------------------------------------- |
| 효과      | 가설 4 (boundingSphere stale) 가 주원인이면 venus 회귀 즉시 해소. 다른 planet 회귀 가능성도 사전 차단    |
| 위험      | computeWorldMatrix(true) 강제는 비용 (O(scene tree depth)). 매 tier transition 1회 이므로 무시 가능 수준 |
| 비용      | 2줄                                                                                                      |
| 회귀 가드 | 기존 동작에 영향 없음. boundingInfo 가 이미 최신이면 no-op                                               |

### 옵션 C — focus 식 자체 변경 (mesh radius 의존 폐기)

**변경**: focusOn 의 desiredRadius 산식을 viewport 점유율 목표 기반으로 재설계.

```
desiredRadius = body.radius * renderScale_currentTier / tan(fov / 2 * targetCoverageRatio)
```

- targetCoverageRatio = 0.4 (mesh 가 viewport 세로 40% 차지)
- viewport 변화 자동 적응

| 축        | 평가                                                                                                                                   |
| --------- | -------------------------------------------------------------------------------------------------------------------------------------- |
| 효과      | mode 무관 동일 viewport 점유 보장. R3 박제값 변경에도 강건                                                                             |
| 위험      | 산식 검증 필요. T3 body / T2 inner / T1 solar 별 다른 시각적 의도 (sun 은 전체 태양계 보여야 / planet 은 body 자체 보여야) 와의 정합성 |
| 비용      | 20+줄. tier-transition.ts 동일 산식 적용 + 기존 mesh radius \* 5 산식 동시 폐기                                                        |
| 회귀 가드 | 기존 sun focus 동작이 변할 가능성. 라운드 R1~R3 박제값 baseline 재측정 필요 (cross-check ROI 큼)                                       |
| 보류 사유 | 본 회귀의 단일 원인이 명확해지기 전 산식 전체 재설계는 과도. 옵션 A/B 가 효과 없을 때 검토                                             |

### 옵션 D — 옵션 A + 옵션 B 동시 (defense-in-depth)

**변경**: 옵션 A (focus 진입 시 lowerRadiusLimit 동적 완화) + 옵션 B (tier-transition boundingInfo 강제 갱신) 결합.

| 축        | 평가                                                                    |
| --------- | ----------------------------------------------------------------------- |
| 효과      | 두 가설 (H2 lowerRadiusLimit clamp + H4 boundingSphere stale) 모두 차단 |
| 위험      | 코드 7줄. 둘 중 하나만 주원인이라도 다른 하나는 no-op 안전망            |
| 비용      | 7줄                                                                     |
| 회귀 가드 | 두 가드 모두 기존 동작 비-침습                                          |

## 결정

**옵션 D (A + B defense-in-depth) 채택**.

근거:

1. 정적 forensic 만으로 H2 (lowerRadiusLimit clamp 시 카메라 mesh 내부 박힘) 와 H4 (boundingSphere stale) 둘 중 어느 것이 주원인인지 결정 불가 — 둘 다 그럴듯
2. 두 옵션 모두 비-침습적 (기존 동작 영향 0). 옵션 D 의 합산 비용 7줄 vs A 또는 B 단독의 잘못된 베팅 비용 (다음 라운드 D-T2 재현 시 추가 PR) 대비 우월
3. **연구 모드 정상 작동의 메커니즘** (panel resize → engine.resize() → 자연 boundingInfo 갱신 → H4 회피) 이 옵션 B 가 맞다는 강한 정황 — 옵션 B 단독으로 fix 가능성 큼. 옵션 A 는 안전망
4. **#397 (다른 body 잔존) 와의 연결**: 옵션 D 가 카메라 위치를 더 정확하게 만들어 #397 의 "frustum 내 작은 점 잔존" 일부 케이스도 자동 해결 가능 — 별도 fix PR 에서 #397 재검증

### Behavior Changes

- focus 트리거 시 카메라 lowerRadiusLimit 가 desiredRadius 미만으로 일시 완화 (focus 트리거 한정, manual zoom 영향 0)
- tier 전환 시 focusMesh 의 boundingInfo 가 명시 갱신되어 새 tier 의 정확한 boundingSphere.radiusWorld 사용

## 결과·재검토 조건

### 즉시 재검토 (developer 단계)

- developer 가 옵션 D 구현 후 brower-test 스킬로 12 cells 매트릭스 실측 수집 (sun / mercury / venus / earth / jupiter / neptune × 관찰 + 연구)
- 각 cell 의 PASS/FAIL 박제 + camera.radius / mesh.absolutePosition / camera.isInFrustum(mesh) 데이터 첨부 → 본 ADR §Forensic 데이터 매트릭스 보강
- venus 관찰 모드 PASS 가 옵션 B 만으로 달성됐다면 옵션 A 는 안전망으로 유지 (회귀 가드)
- venus 관찰 모드 여전히 FAIL 이면 옵션 C (focus 식 viewport 점유율 기반) 검토 진입

### R2 박제값 rollback 진단 (재발 시)

- 라운드 2 (venus 650) 임시 rollback 후 venus focus 회귀 재현 안 되면 박제값-tier transition timing 결합 가설 강화
- 회귀 재현되면 박제값과 무관한 카메라 로직 자체 회귀 → 옵션 C 우선

### #397 재평가

- 옵션 D 머지 후 #397 (다른 body 잔존) 매트릭스 재실측. **종료 조건 (정량)**: #397 본문 박제 재현 케이스 (mercury / venus 외 6 body focus 시 다른 body 잔존) 를 6 body × 2 모드 = 12 cells 로 재실측, **모든 cell 에서 "focus body 외 다른 body 의 viewport 점유율 ≤ 0.1%" (점 수준 잔존도 허용 안 함) 충족** 시 close. 미충족 시 별도 fix (frustum culling / occlusion / LOD billboard alpha) 진행. (cross-validate G4 반영)

#### Amendment 2026-05-03 — R-Phase 정합 종료 조건 재정의

PR #399 머지 후 12 cells 매트릭스 재실측 결과 (`docs/reports/397-residual/matrix.json`):

- **10/12 PASS** (mercury / venus / earth / jupiter / neptune × observe + research)
- **2/12 FAIL** (sun-observe / sun-research): venus 잔재 0.198% / mercury 잔재 0.025% — viewport 의 0.1% threshold 초과

R-Phase v3 incremental build 정책 정합 분석 결과, **sun focus 화면의 mercury/venus 잔재는 R3 까지 구현된 visible body 의 자연 귀결로 expected behavior**. strict "12/12 ≤ 0.1%" 적용 시 옵션 C (focus 식 viewport coverage 기반 재설계) 또는 sun focus 시 mercury/venus 강제 hide 가 강요되는데, 둘 다 R-Phase 의도 ("사용자가 실제로 보이는 body 를 매 R-Phase DoD 에 포함") 와 상충.

**갱신된 종료 조건**: 12 cells 각각 — focus body 외 다른 body 의 viewport 점유율이 (a) 0.1% 이하 OR (b) 현재 R-Phase 까지 구현된 body 의 자연 visible 결과 인 경우 PASS. 후자는 R-Phase ADR 박제 시점에 expected list 명시 (R3 시점: `sun-observe`/`sun-research`: mercury/venus expected). R4+ 진입 시 expected list 갱신 의무.

상세 분석 + NO-OP 결정: [`20260503-397-residual-no-op.md`](20260503-397-residual-no-op.md). 회귀 가드 `apps/web/scripts/browser-verify-397-residual.mjs` 는 **#602 (2026-06-04) 로 폐기** — CI 미통합(수동 전용) + R-Phase 갱신 부담 > 가치 + focus 동작은 `browser-verify-378-focus.mjs`(CI) 가 커버. 상세: 397 ADR §회귀 가드 §Amendment 1. "R-Phase 정합 종료 조건" 원칙(위 갱신된 종료 조건)은 R-Phase 공통 DoD 로 유지.

### 회귀 가드

- `apps/web/scripts/browser-verify-378-focus.mjs` (기존 `browser-verify-floating-origin.mjs` 패턴 재사용) **필수 신규 추가** — venus 관찰 + 연구 모드 focus 후 `camera.isInFrustum(venusMesh) === true` + `camera.radius > venusMesh.boundingSphere.radiusWorld * 1.5` 단언. **CI `detect-and-test` 또는 prebuild 검증에 필수 통합** (cross-validate G3 반영 — 사용자 D-T2 재발견 비용 > CI 시간 비용 ROI 명백, 본 ADR 원안의 "선택, ROI 검토 후" 표기 폐기)

## 참고

- 발화점: PR #377 D-T2 (2026-04-30) 5건 회귀 #2
- 라운드 3 D-T2 (2026-05-03): venus 명시 회귀 + 분리 회귀 패턴 (관찰 vs 연구) 박제 — 이슈 [#378 코멘트](https://github.com/coseo12/simulator/issues/378#issuecomment-4365671020)
- 관련 이슈: [#373](https://github.com/coseo12/astro-simulator/issues/373) (옵션 c, R3 D-T2 #1), [#397](https://github.com/coseo12/astro-simulator/issues/397) (다른 body 잔존, 동일 D-T2 라운드 3 발견), [#380](https://github.com/coseo12/astro-simulator/issues/380) (줌 고정)
- 관련 ADR: [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) Amendment 2026-05-03 라운드 3
- 코드 SSoT: `packages/core/src/scene/camera-controller.ts`, `packages/core/src/scene/tier-transition.ts`, `packages/core/src/scene/tier.ts`, `apps/web/src/constants/body-scale.ts`
- volt 교훈: [#67](https://github.com/coseo12/volt/issues/67) (정적 분석 미결정 시 debug 스크립트 실측 선행 — 본 ADR 은 dev 환경 빌드 비용으로 정적 매트릭스만 박제, developer 단계 실측으로 보강), [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작), [#68](https://github.com/coseo12/volt/issues/68) (엄격 원칙 + 동적 적응 부재)

## 교차검증 반영 사항

cross-validate 1회 수행 (2026-05-03, type=architecture, outcome=`applied`). Gemini 의 6항 평가 중 §6 "누락 요소" 4개 제안에 대한 Claude 재분석:

### 합의

- **G1 실측 데이터 수집 유틸리티 (Gemini §6.1)**: developer 단계 매트릭스 측정 효율화를 위해 dev overlay 에 `camera.radius` / `focusMesh.boundingSphere.radiusWorld` / `camera.target` 실시간 표시 옵션 추가 권고. 본 ADR 의 `developer_handoff.M1` 보강 — `apps/web/src/components/layout/lod-dev-overlay.tsx` 의 상세 모드 (#388 LOD overlay) 와 같은 패턴으로 focus debug overlay 추가 (별도 짧은 PR 또는 fix PR 동반). developer 단계 진입 시 결정.
- **G2 연구 모드 가설 검증 (Gemini §6.2)**: ResizeObserver 콜백 + onBeforeRender 호출 순서 측정으로 H4 (boundingSphere stale) 확증. 본 ADR `developer_handoff.M4` 강화 — 단순 측정이 아닌 호출 순서 추적 (timestamp + counter) 박제.
- **G4 #397 해결 판정 기준 구체화 (Gemini §6.4)**: "잔존 cells 0" 만으로는 모호. `결과·재검토 조건 §#397 재평가` 보강 — "#397 본문에 박제된 재현 케이스 (mercury / venus 외 6 body focus 시 다른 body 잔존) 를 6 body × 2 모드 = 12 cells 로 재실측, 모든 cell 에서 'focus body 외 다른 body 의 viewport 점유율 ≤ 0.1%' (점 수준 잔존도 허용 안 함) 충족" 으로 정량화.

### 이견 수용

- **G3 회귀 테스트 CI 통합 (Gemini §6.3)**: ADR 원안은 "선택, ROI 검토 후 결정" 으로 보수적 표기. Gemini 가 "사용자 경험 치명적 회귀 가드는 ROI 무관 필수" 강조. **수용** — 본 케이스는 5건 D-T2 회귀 중 #2 + 라운드 3 재현 (사용자 경험 차단) 로 ROI 검토 자체가 시간 낭비. ADR `결과·재검토 조건 §회귀 가드` 갱신: "**필수 통합** — `apps/web/scripts/browser-verify-378-focus.mjs` 신규 추가, CI `detect-and-test` 또는 prebuild 검증에 포함. venus 관찰 모드 + 연구 모드 focus 후 `camera.isInFrustum(venusMesh) === true` 단언". 원안의 "선택" 표기는 sprint 계약의 "테스트 ROI 5문 체크" 패턴을 본 케이스에 잘못 적용한 결과. fix 후 재발 방지 가드는 **사용자 D-T2 재발견 비용** > **CI 시간 비용** 라 ROI 명백.

### Claude 재분석으로 기각한 Gemini 제안

해당 없음 (4개 제안 전부 합의 또는 수용). Gemini 가 ADR 의 "옵션 D 선택 근거" / "Defense-in-depth 전략" / "옵션 C 보류 합리성" 등 핵심 결정에 대해 모두 "매우 합리적" 평가 — 단일 모델 편향 신호 미감지.

### 고유 발견 (후속 분리)

- **focus debug overlay 분리 가능**: G1 의 dev overlay 확장은 본 fix 와 직교 — focus 회귀 진단 도구. 별도 이슈로 분리 가능. **현재는 fix PR 동반 동시 진행** 으로 결정 (developer 가 직접 측정에 활용 → ROI 가장 큼). fix PR 내부에 포함하지 않으면 분리 이슈 박제.

### 호출 전 Claude 편향 셀프 체크 (4종)

- 낙관적 일정: PASS (옵션 D 7줄 단순성 강조하면서 12 cells 매트릭스 실측 + #397 재검증 후속 비용 명시)
- 결합 간과: PASS (H2 + H4 결합 가능성 박제, 옵션 D 가 둘 다 차단)
- 폐기 프레이밍: PASS (옵션 C "보류" 분리, "폐기" 처리 안 함)
- 순수주의: PASS (옵션 D 를 "defense-in-depth" 로 정직 박제, 단일 정답 단정 회피)

### 적용 결과

- ADR §결과·재검토 조건 §회귀 가드: "**필수 통합** — browser-verify-378-focus.mjs 신규 추가, CI 통합" 으로 갱신
- ADR §결과·재검토 조건 §#397 재평가: 정량 종료 조건 추가
- ADR §developer_handoff.M1 / M4: 측정 정밀도 보강 명시 (호출 순서 timestamp 추적)
- 후속 분리 이슈 박제 결정: focus debug overlay 분리 보류 (fix PR 동반 진행 → ROI 우월)
