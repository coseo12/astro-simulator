# #379 Depth Sorting 검증 — DoD-Depth-1

**측정 일시**: 2026-05-02 (forensic 매트릭스 직후)
**baseline 박제값**: PR #384 1f0c369

## 결론 (실측 후)

**Depth sorting 은 본 회귀의 1차 메커니즘이 아니다.** 사용자 D-T2 보고 "데스크톱에서 행성 겹침 시 사각형" 은 forensic 매트릭스 (`docs/reports/379-forensic/`) 측정 결과 **행성 겹침 여부 무관, 모든 body 가 항상 billboard plane (low LOD) 으로 fallback** 함이 확인됨.

즉 사용자가 본 사각형은 LOD billboard fallback 의 시각화 그 자체이며, 행성 겹침은 트리거가 아니라 **눈에 잘 띄는 시점** 일 뿐이다 (배경에서 다른 mesh 와 겹치지 않을 때 단일 사각형이 두드러지게 보임).

## 검증 절차 — 무엇을 점검했는가

### 1. Z-fighting 검증 (transparent material order)

`createBodyBillboard` 의 material:

- `mat.diffuseColor = c` + `mat.emissiveColor = c.scale(0.3)` (sun 은 emissive only)
- `mat.alpha` 는 cross-fade 중에만 0~1, 정착 시 1
- `useAlphaFromDiffuseTexture = false`

billboard plane (`MeshBuilder.CreatePlane({sideOrientation: 2 /* DOUBLESIDE */})`) 은 양면 렌더로 Z-fighting 가능성 낮음. 사용자 보고 사각형은 Z-fighting 패턴 (얼룩말 줄무늬) 이 아니라 **단일 색 평면** 이므로 Z-fighting 메커니즘 기각.

### 2. Front face culling

billboard plane 은 양면 렌더 (`DOUBLESIDE`) 라 culling 무관.

### 3. Transparent material order

LOD cross-fade 중 (200ms) 에는 from/to variant 둘 다 `material.alpha` interp. 정착 후 `from.isVisible=false` (parent-child 전파 차단을 위해 `setEnabled` 미사용 — 라인 1008-1018 주석). 정착 상태에서는 단일 variant 만 렌더되므로 transparent ordering 이슈 없음.

### 4. 행성 겹침 시 sorting 변화

forensic 매트릭스 모든 cell 에서 body 위치는 default T1 진입 시점 J2000.0 epoch 기준 동일 — sun(원점) + mercury(0.387 AU 궤도 점) + venus(0.723 AU 궤도 점). 카메라가 ArcRotate radius=35 (강제 조정 시도했으나 controller 가 즉시 reset 한 것으로 보임).

forensic 결과는 **행성 위치 변화 없이 모든 cell 에서 동일하게 sun 포함 23 body 가 low** — 즉 행성 겹침 없는 상태에서도 회귀 발생.

## 결론

- **DoD-Depth-1 결과**: depth sorting / Z-fighting / transparent material order 점검 결과 **본 회귀 메커니즘 아님**
- **fix decision ADR (`docs/decisions/20260502-379-fix-decision.md`) 후보 비교에서 (d) depth sorting 정책 변경은 우선순위 하위로 평가됨** — 본 회귀 fix 효과 0
- **본 회귀 1차 메커니즘은 LOD coverage 계산 로직** (forensic README 가설 1, 2 — `screenCoverageRadius` 또는 camera distance 산출 bug 의심)

## 비-범위 (본 점검에서 제외)

- 일반 transparent rendering 정책 검토 (별도 후속 이슈 후보, 본 회귀와 직교)
- ring shader 의 transparent ordering (행성 고리 — P11-B 범위 내 simple 처리, 본 회귀와 무관)
- gravitational lensing PostProcess 의 sorting (`bh=1/2` 옵트인 경로, default 진입 무관)
