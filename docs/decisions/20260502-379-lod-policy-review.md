# ADR: #379 LOD 정책 재검토 — sunScale 50 baseline 영향 분석

- **상태**: Accepted (architect 단계)
- **날짜**: 2026-05-02
- **결정자**: architect (#379)
- **관련**:
  - 선행 ADR: `20260424-p11-b-lod-design.md` (LOD 3단 + 거리 하이브리드 임계, P11-B #289)
  - 선행 ADR: `20260430-r3-followup-body-proportion.md` (#373 라운드 2 박제 sun=50/mercury=900/venus=650)
  - 선행 ADR: `20260425-r1-sun-visualization.md` (sunScale 도입 + Phase 2 #333 billboard 에서 bodyScale 제거)
  - 본 ADR 의 fix decision: `20260502-379-fix-decision.md` (후속)
- **교훈 적용**:
  - "DoD PASS ≠ 제품 동작" (volt #74) — r1-guard `--measure-px-ratio` PASS 였음에도 사용자 D-T2 신규 회귀
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt #77) — qa headless PASS 였음에도 실 환경 사각형
  - "조사 국면 확장 — Explore 미결정 시 debug 스크립트 실측 선행" (volt #67) — 본 forensic 매트릭스가 적용 사례
  - "주석 계약 vs 구현 drift" (volt #49) — LOD coverage 계산 식의 실측 괴리 (forensic 가설)

---

## 배경

#373 라운드 2 (PR #384, 1f0c369) 머지 직후 사용자 D-T2 (2026-05-01) 가 발견:

- **모바일** (375×667 인근) — body 가 sphere 가 아니라 평면 사각형
- **데스크톱 + 행성 겹침** — sun 또는 행성이 LOD billboard fallback 으로 작은 노란 사각형

본 ADR 은 **LOD 정책 (`20260424-p11-b-lod-design.md`) 자체가 #373 라운드 2 박제값 (sunScale 50 / mercuryScale 900 / venusScale 650) 에서 어떻게 동작하는지** 를 forensic 측정으로 분석하고 정책 재검토 의무를 박제한다.

본 ADR 은 **분석 + 정책 영향 박제만 수행**, 실제 fix 후보 비교는 별도 ADR `20260502-379-fix-decision.md` 가 담당.

---

## Forensic 측정 결과 (`docs/reports/379-forensic/`)

| 항목                    | 측정값                                | 의미                              |
| ----------------------- | ------------------------------------- | --------------------------------- |
| 매트릭스 크기           | 40 cell (5 viewport × 2 DPR × 4 거리) | DoD-Forensic-1 완비               |
| sun=low 비율            | 40/40 (100%)                          | sun 이 항상 billboard fallback    |
| mercury=low 비율        | 40/40 (100%)                          | 동일                              |
| venus=low 비율          | 40/40 (100%)                          | 동일                              |
| 모바일 trigger 재현률   | 24/24 (100%)                          | DoD-Forensic-2                    |
| 데스크톱 trigger 재현률 | 16/16 (100%)                          | DoD-Forensic-2                    |
| lodStats (전체 24 body) | high=1 / mid=0 / low=23               | 거의 모든 body 가 billboard plane |

**결론**: 사용자 D-T2 보고 "사각형" 은 viewport / 거리 / 행성 겹침 여부 무관 **항상 발생**. 라운드 2 박제값 환경에서 LOD policy 가 사실상 모든 body 를 billboard 로 보내고 있다.

## LOD 정책 영향 분석 — sunScale 50 baseline

### 이론값 vs 실측값 괴리

#### sun (kind=star, R=6.96e8 m)

T1 default (renderScale=8.4e-11, camera radius=35) 에서:

- 카메라 → sun 실세계 거리 ≈ 35 / 8.4e-11 ≈ **2.79 AU** (4.17e11 m)
- ⇒ kind 강제 (`< 1 AU`) **실패** (LOD_BODY_THRESHOLDS.star = 1 AU)
- coverage 분기 진입

이론 coverage 계산:

- `wsRadius = R × renderScale × bodyScale = 6.96e8 × 8.4e-11 × 50 ≈ 2.92 unit`
- viewport=720 / fov=0.8 rad → focalLengthPx ≈ 851
- `pxDiameter ≈ wsRadius × 2 × focalLengthPx / cameraDistanceSceneUnit = 2.92 × 2 × 851 / 35 ≈ 142 px`
- coverage radius ≈ 71 px → **이론적으로 high (≥50) 진입 예상**

실측 결과: 모든 cell sun=low (40/40). **이론과 실측 괴리 큼**.

#### mercury (kind=planet, mass=3.30e23 < 5e25 → planet-terrestrial, R=2.44e6 m, mercuryScale=900)

- 카메라 → mercury 거리 ≈ 2.79 AU (mercury 궤도 0.387 AU 가 sun 대비 작음)
- 5R 임계 = 1.22e7 m ≈ 0.0001 AU ⇒ kind 강제 **실패**
- 이론 pxDiameter: `2.44e6 × 8.4e-11 × 900 × 2 × 851 / 35 ≈ 8.96 px → coverage ≈ 4.5 px → mid 미달 → low` ✓
- 실측 mercury=low ✓ (이론 일치)

#### venus (kind=planet, mass=4.87e24, planet-terrestrial, R=6.05e6 m, venusScale=650)

- 5R 임계 = 3.025e7 m ⇒ kind 강제 **실패**
- 이론 pxDiameter: `6.05e6 × 8.4e-11 × 650 × 2 × 851 / 35 ≈ 16.0 px → coverage ≈ 8.0 px → mid 경계 ±` (마진 5% 이내)
- 실측 venus=low (이론은 mid 경계지만 실측은 low — coverage 계산 noise 또는 식 bug)

### 가설 (developer 단계 재검증 필요)

1. **`screenCoverageRadius` 의 viewProj matrix indexing 식 bug** — `mulMat4Point` 의 m[col*4+row] 가정이 Babylon `scene.getTransformMatrix().m` 의 실 메모리 레이아웃과 어긋날 가능성. 라인 207-209 의 이전 주석 ("row-major 표기로 오해 유발") 이 이미 한 번 정정된 이력 있음. 정정이 부분적이었거나 다른 시점에 추가 회귀 가능
2. **카메라 globalPosition → m 환산 bug** — `metersPerSceneUnit = 1 / sceneUnitPerMeter` 식 (라인 870) 이 T1 (sceneUnit=8.4e-11) 일 때 metersPerSceneUnit ≈ 1.19e10. body world 좌표는 m 단위 (e.g., sun=[0,0,0]), camera scene unit × metersPerSceneUnit + origin 이 정합인지 floating origin 의 origin 단위와 결합 검증 필요
3. **bodyScale × renderScale 의 적용 시점 mismatch** — `effectiveRadius = body.radius × bodyScale(body.id)` (라인 896) 와 `screenCoverageRadius` 내 `bodyRadiusMeters * renderScale` (라인 176) 사이 — bodyScale 이 m 단위가 아닌 배수임에도 m 처럼 계산되면 coverage 가 매우 작아질 가능성 (100배 스케일은 일반적이지만 식 dim 불일치 시 결과 무관)

가설 1 또는 2 가 가장 유력. fix 결정 ADR (`20260502-379-fix-decision.md`) 후보 (e) "LOD 정책 자체 재설계" 의 하위 작업으로 **debug 측정 우선** 정책 박제.

## 정책 재검토 결정

### 1. LOD 임계값 (high≥50, mid≥8) 자체는 유지

이론 분석상 임계값 (50/8) 은 sunScale 50 / venusScale 650 환경에서도 적정. mercury 만 8 미달이며 이는 venusScale 600~700 으로 인하될 라운드 3 (#385) 에서 동일 영향 — 임계 인하만으로는 venus 가 여전히 ±2px 마진에 있어 viewport / DPR 변화에 따라 flaky.

**결정**: 임계값 변경은 본 fix 가 직접 채택하지 않음. 대신 fix decision ADR 에서 **`screenCoverageRadius` 측정 값의 실측 검증** 을 우선 후보로 고정.

### 2. body-kind 강제 규칙 (`LOD_BODY_THRESHOLDS`) 의 sun 임계 재검토

**문제**: T1 default (camera radius=35, sceneUnit=8.4e-11) 환경에서 카메라-sun 실세계 거리 ≈ 2.79 AU. 이는 sun 의 `< 1 AU` 임계를 초과 → coverage 분기. coverage 식이 정상 작동해도 sun 이 mid/low 로 강등될 가능성이 baseline 에 존재.

**옵션**:

- **(a) sun 의 highMaxDistanceMeters 를 1 AU → 5 AU 로 확대** — T1 default 카메라 위치까지 포함해 sun 항상 high 강제. 단, 명왕성 focus 등 매우 먼 카메라에서도 sun=high 유지 → 의도된 fallback (멀면 sun 도 low) 이 안 됨. 본 회귀 fix 의 stable defense 로는 가치 있으나 LOD 정책 본래 의도 위배 가능
- **(b) screen-space coverage 가 정상 작동하도록 식 검증/수정** — 1차 fix. 이게 가장 깨끗한 해결
- **(c) sun 의 default 진입을 `isFocused=true` 로 강제** — focus body 면 high. sun 이 default focus 라면 자연 해결 (현재 default focus 가 무엇인지 확인 필요)

**결정**: 본 ADR 은 옵션 비교 박제. 결정은 `20260502-379-fix-decision.md` 가 담당.

### 3. billboard plane 의 시각 디테일 — 미해결 1 (P11-B ADR §"미해결 1") 의 부상

P11-B ADR `20260424-p11-b-lod-design.md` §미해결 1:

> low billboard 는 body 색상만 albedo 단색 평면 — sphere 느낌이 아닌 disk 느낌. 본 Phase 비-범위, 후속에서 "circular alpha mask" 적용 검토.

본 회귀가 이 미해결 1 의 시각 영향을 **PR #384 라운드 2 환경에서 결정적으로 가시화**. 박제값 인하로 mercury/venus 가 mid → low 진입하면서 disk 느낌이 사용자 인지 임계 진입. 단순 alpha mask 만으론 본 회귀 fix 안 됨 (사각형 → 원형 변환은 mid 의 12세그 sphere 보다도 단순) — 1차 fix 는 LOD 정책 자체 재정의.

## 결과·재검토 조건

- **재검토 #1**: fix decision ADR 의 1차 후보 (`screenCoverageRadius` 측정 식 검증) 가 실측 결과 정상 작동임으로 판명되면, sun 의 5R / 5 AU / always-high 강제 등 kind 임계 재조정 안 채택
- **재검토 #2**: LOD 정책 자체 재설계 (옵션 e) 가 채택되면 본 ADR 도 deprecated 표기. P11-B ADR Amendment 형태로 새 정책 박제
- **재검토 #3**: #385 라운드 3 (mercury 700-800 / venus 800-900) 진입 시 본 회귀 영향 평가 — 비율 인상으로 mercury coverage 가 이론 ≈ 7→6 → 더 악화. fix 선행 의무

## Cross-validate (Gemini)

본 ADR 은 fix decision ADR (`20260502-379-fix-decision.md`) 와 통합 cross-validate. 본 ADR 단독 박제 직후 cross-validate 의무 없음 (fix decision ADR 이 1차 의사결정 ADR — 본 ADR 은 분석/정책 영향 박제). **CLAUDE.md "교차검증 박제 직후 루틴" 의 정책·ADR 박제 1회는 fix decision ADR 에서 수행**.
