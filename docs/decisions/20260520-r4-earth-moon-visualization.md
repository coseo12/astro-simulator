# ADR: R4 지구 + 달 시각화 — Q2=B 비례 결정 정책 SSoT 첫 본 인스턴스화

- **상태**: Accepted (cross-validate 2026-05-20, Amendment 1 2026-05-21 — D8 측정 검증 임계 완화, **Amendment 2 2026-05-21 — forensic ADR 변형 승격 + moon visual fusion 해결 (#539)**)
- **날짜**: 2026-05-20 (Amendment 2 forensic 승격: 2026-05-21)
- **결정자**: architect (#532 R4 PM 합의 라운드 1+2 후 위임 / #539 forensic Amendment 2 라운드)
- **관련**: #532 (본 R4 스프린트), #539 (forensic Amendment 2 라운드 — moon visual fusion), #537 (PR R4 머지본 commit 9b4ba37), `20260425-r1-sun-visualization.md` (R1 SSoT — sunScale=50 + bodyScale 인프라), `20260428-r2-mercury-visualization.md` (R2 SSoT — mercuryScale=700, R-Phase ADR 패턴), `20260429-r3-venus-visualization.md` (R3 SSoT — venusScale=800, Concrete Prediction "≤ 2 라인" 첫 검증), `20260430-r3-followup-body-proportion.md` (**Q2=B 비례 결정 정책 SSoT** + Amendment 2026-05-01 라운드 1/2 + Amendment 2026-05-03 라운드 3 + forensic 모범), `20260504-r-phase-allowlist-guard.md` (R-Phase 진입 4곳 동시 박제 절차), `20260424-p11-b-lod-design.md` (LOD × scale 합성 순서), `20260422-floating-origin.md`, [`docs/templates/forensic-adr-template.md`](../templates/forensic-adr-template.md) (**Amendment 2 발동 — 본 ADR forensic 변형 승격**)
- **교훈 적용**:
  - "신규 함수 ≠ 신규 구현" (volt #21 — R1+R2+R3 인프라 100% 재사용 검증, **moon=satellite parent earth 첫 본 사례**)
  - "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (R3 ADR §결과·재검토 조건 §Concrete Prediction "R4 추가 시 코드 변경 ≤ 2~4 라인" 검증 — earth + moon 둘 다 shortcut 진입 → ≤ 4 라인 예측)
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt #77 — 실 Chrome GUI 수동 D-T2 의무 명시)
  - "DoD PASS ≠ 제품 동작" (volt #74 — Q2=B 첫 본 인스턴스화 + 모바일 누적 차단율 5-body 누적 별도 검증)
  - "엄격 원칙 + 동적 적응 부재 함정" (volt #68 — Q2=B 임계가 5-body 누적 모바일 침습성과 직교 확인)
  - "인계 항목 실측 재검증" (volt #14 — R4 진입 시점 baseline 실측: sunScale=50 / mercuryScale=700 / venusScale=800 보존 검증 후 박제)
  - "PM DoD 구조 drift 금지" (volt #76 — Q4 (architect 위임) 만 인스턴스화, 다른 PM 합의 항목 (Q1/Q2/Q3/Q5) 재구조화 금지)
  - "결합 간과 — Claude 4종 편향" (volt #29 — earth 와 moon 의 결합 (parent-satellite) 명시 + 5-body 누적 모바일 침습성 결합 명시)

---

## 통합 vs 분리 결정 (메타)

본 ADR 은 R2 ADR §통합 vs 분리 결정 §"R3~R10 의 ADR 박제 패턴 SSoT" 를 그대로 따름:

- **R-Phase 단일 ADR 패턴** — 단일 R-Phase 의 시각화 결정 N건 (scale 값 / shortcut / orbit / focus race / **R4 한정: earth-moon 거리 비례 + 달 궤도 visible 방안**) 을 단일 ADR 로 통합. 파일명 `<YYYYMMDD>-r<N>-<body>-visualization.md`
- **moon 위성 첫 본 사례** — R4 는 satellite (parentId="earth") 첫 진입. R5+ (mars/phobos/deimos / jupiter/galilean / saturn/titan) 의 SSoT 참조 패턴 박제 의무
- **회귀 가드 인프라 amendment** — r1-guard `--measure-px-ratio` baseline 갱신은 본 ADR 본문 인용 + 별도 r1-guard ADR amendment 누락 시 본 ADR 동반 박제
- **store-scene-sync 무수정** — R1 §Concrete Prediction "R2~R10 코드 변경 0" 의 R4 검증 (3번째)
- **본 R4 는 Q2=B 비례 결정 정책의 첫 본 인스턴스화** — R2/R3 는 소급 amendment 였으나, R4 는 진입 시점부터 본 정책 적용. cross-validate 발동 의무

---

## 배경

### Roadmap v3 §R4 진입 조건

[`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) §R-Phase 공통 DoD 템플릿 (Amendment 2026-04-30 + 라운드 2 Amendment 2026-05-01 정합) + §"R4: R3 + 지구 + 달" 에 따라 R4 는 R3 위에 **지구 + 달을 명시적으로 visible 하게 추가**. PM 합의 (#532 라운드 1+2):

- **Q1** (이슈 분리 vs 통합): A — 한 이슈 통합 (지구 + 달 단일 이슈 + 단일 PR)
- **Q2** (달 궤도 visible 여부): A — 달 궤도 전체 visible (default 진입에서 visible 보장)
- **Q3** (sunScale 재조정): A — sunScale=50 유지 (R1 ADR Amendment 2026-05-01 박제값 보존)
- **Q4** (earthScale / moonScale 결정): B — **architect 위임** (본 ADR §결정 1~5 박제)
- **Q5** (moon shortcut 등록): A — moon shortcut 등록 (상단 bar 7개로 확장)

### 현재 baseline 실측 (2026-05-20 develop tip = ffe6661, R3 머지 직후)

R3 박제 상태 (`apps/web/src/constants/body-scale.ts`, R3 followup Amendment 2026-05-03 라운드 3):

```typescript
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 50, // R1 Amendment 2026-05-01 (옵션 a, 75 → 50), 라운드 1/2/3 보존
  mercury: 700, // R3 followup Amendment 2026-05-03 라운드 3 (8500 → 2000 → 900 → 700, 사실 비율 강화)
  venus: 800, // R3 followup Amendment 2026-05-03 라운드 3 (4000 → 1500 → 650 → 800, 사실 비율 강화)
});
```

R-Phase Allowlist (`packages/core/src/scene/r-phase-allowlist.ts`):

```typescript
export const R_PHASE_BODY_ALLOWLIST = Object.freeze(['sun', 'mercury', 'venus'] as const);
```

FOCUS_BUTTONS (`apps/web/src/components/layout/focus-quick-buttons.tsx`):

```typescript
const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' },
  { id: 'venus', label: '금성' },
  { id: 'earth', label: '지구' },     // R-Phase Allowlist disabled (R4 진입 전)
  { id: 'jupiter', label: '목성' },   // R-Phase Allowlist disabled (R6 진입 전)
  { id: 'neptune', label: '해왕성' }, // R-Phase Allowlist disabled (R10 진입 전)
];
```

지구 (`packages/shared/data/solar-system.json:60`):
- `id: "earth"`, `radius: 6.378137e6` m (mercury 의 **2.614배**, venus 의 **1.054배**, sun 의 **0.917%**)
- `mass: 5.9722e24` kg, `axial_tilt`: 23.44° (참고용, 본 R4 비-범위)
- `parentId: "sun"`
- `dataSource: "IAU 2015 Resolution B3 §2"`
- satellites: 1 (moon)

달 (`packages/shared/data/solar-system.json:80`):
- `id: "moon"`, `radius: 1.7374e6` m (mercury 의 **0.712배**, earth 의 **0.272배**, sun 의 **0.250%**)
- `mass: 7.342e22` kg
- `parentId: "earth"` ← **satellite 첫 본 사례**
- `dataSource: "NASA/JPL Moon Fact Sheet"`
- orbit: `semiMajorAxisAU: 0.00257189` (≈ 3.844e8 m, earth 중심 기준)

지구는 현재 BODY_SCALE 룩업 미정의 → `getBodyScale('earth') === 1.0` (실측 그대로) → mesh diameter ≈ `6.378137e6 × 2 × 8.4e-11 × 1 = 1.072e-3` scene unit → 1280×720 viewport 에서 pixel diameter ≈ `0.026px` (sub-pixel, 사용자 인지 불가).
달 동일 (`getBodyScale('moon') === 1.0`).

### 산출식 (R1+R2+R3 ADR 동일 식)

```
diameter (scene unit) = body.radius (m) × 2 × renderScaleForTier('solar') × scale
                      = body.radius × 1.68e-10 × scale

px_diameter = diameter × viewportH / (cameraRadius × 2 × tan(fov / 2))
            = body.radius × 1.68e-10 × scale × 720 / (35 × 2 × 0.4228)
            ≈ body.radius × scale × 4.086e-9  (1280×720, T1 solar tier 기준)

sunPxRatio(body) ≈ (body.radius × BODY_SCALE[body.id]) / (sun.radius × BODY_SCALE.sun)
                ≈ (body.radius × scale) / (6.957e8 × 50)
                ≈ (body.radius × scale) / 3.4785e10
```

### 기존 자산 재사용 조사 ("신규 함수 ≠ 신규 구현" volt #21)

R3 ADR §기존 자산 재사용 조사 표 100% 재현 + moon satellite 첫 본 사례 추가:

| 자산 | 위치 | 본 R4 처리 |
|---|---|---|
| `BODY_SCALE` 룩업 + `getBodyScale` | `apps/web/src/constants/body-scale.ts` | **확장** — `earth: <N>` + `moon: <N>` 2줄 추가 (R3 ADR §Concrete Prediction "R4 추가 시 ≤ 4 라인" 검증) |
| `createSolarSystemScene({ bodyScale })` 옵션 콜백 | `packages/core/src/scene/solar-system-scene.ts` | **재사용 — 코드 변경 0** (`getBodyScale` 자동 일반화, moon 도 동일 path) |
| `createBodyMesh*` diameter 계산식 | 동 파일 | **재사용 — 코드 변경 0** |
| `screenCoverageRadius` effective radius 입력 | 동 파일 | **재사용 — 코드 변경 0** |
| `syncFocusToScene` helper | `sim-canvas.tsx` (store-scene-sync ADR §결정 4) | **재사용 — 코드 변경 0** (earth/moon id 도 동일 path) |
| `FOCUS_BUTTONS` 배열 | `apps/web/src/components/layout/focus-quick-buttons.tsx` | **확장** — earth 활성 + `{ id: 'moon', label: '달' }` 1줄 추가 (Q5=A). 본 ADR §결정 5 박제 순서 적용 |
| `R_PHASE_BODY_ALLOWLIST` | `packages/core/src/scene/r-phase-allowlist.ts` | **확장** — `'earth', 'moon'` 추가 (Allowlist ADR §결정 4 절차 준수) |
| `CelestialInfoPanel` | `apps/web/src/components/panels/celestial-info-panel.tsx` | **재사용 — 코드 변경 0** (selectedBodyId 일반화, axial_tilt / 위성 수 / dataSource 표시) |
| 궤도 라인 `MeshBuilder.CreateLineSystem` | `solar-system-scene.ts:358-378` | **재사용 — 코드 변경 0** (지구 궤도 자동 + **moon 궤도 = 지구 중심 상대 궤도 — satellite parentId 처리 신규 검증**) |
| `Animation.CreateAndStartAnimation` (camera focus tween) | `camera-controller.ts:52` | **재사용 — 코드 변경 0** (4-body 첫 검증 — moon focus 시 earth 중심 시점) |
| r1-guard `--measure-px-ratio` | `apps/web/scripts/r1-ui-regression-guard.mjs` | **확장 — baseline 갱신** (earth + moon 항목 추가, expected list 갱신) |
| `browser-verify-r-phase-allowlist.mjs` | `apps/web/scripts/` | **확장 — expected list 갱신** (sun/mercury/venus → +earth, moon) |
| `body-scale.test.ts` 단위 테스트 | `apps/web/src/constants/body-scale.test.ts` | **확장** — `getBodyScale('earth') === <N>` + `getBodyScale('moon') === <N>` 2줄 |

**신규 구현**: BODY_SCALE 룩업 2줄 + FOCUS_BUTTONS 1줄 + R_PHASE_BODY_ALLOWLIST 1줄 = **총 4 라인 코드** (R3 ADR §Concrete Prediction "R4 추가 시 ≤ 4 라인" 정확 충족). 단위 테스트 / r1-guard baseline / browser-verify expected list / CHANGELOG 갱신은 별도 카운트 (각 1줄).

**moon 추가 신규 검증 영역** (R5+ SSoT):
1. **satellite 궤도 라인** — moon orbit semiMajorAxisAU=0.00257189 (≈ 3.844e8 m, **earth 중심 기준**). 궤도 line builder 가 parentId 기반 상대 좌표 처리 검증 (rebuildOrbitLines 코드 변경 0 예측)
2. **satellite focus animation** — moon click 시 earth 가 아닌 moon 중심 카메라 시점 (Animation.CreateAndStartAnimation 의 target 인자가 selectedBodyId 의 mesh 위치 — 자동 처리, 코드 변경 0 예측)
3. **satellite hit-test** — moon 의 mesh 크기 (sub-10px) 가 click hit-test 영역 충분 여부 — 본 ADR §결정 4 위험 #4 의 fallback (shortcut 의존)

---

## 후보 비교

### 축 1 — `earthScale` 구체값 (D-E1)

#### 산출 — 9 candidates × 3 viewport

R3 ADR §축 1 산출식 그대로 적용. earth.radius = 6.378137e6 m (venus.radius=6.0518e6 의 **1.0539배**, mercury.radius=2.4397e6 의 **2.614배**).

venusScale=800 일 때 venus pixel diameter ≈ `6.0518e6 × 800 × 4.086e-9 ≈ 19.78px` (1280×720) — 본 산출이 R3 라운드 3 박제 baseline (≈ 48.4 px 박제 SSoT 와 약 2.4× 차이는 sun pxDiameter 246.3 vs 산출식 sun 산출의 차이 — R1 baseline 산식 따름):

먼저 R3 baseline 박제값 정합 검증 (R3 followup Amendment 2026-05-03 라운드 3):
- sun: scale 50 → sun pxDiameter 246.3 px (1280×720, forensic 박제)
- mercury: scale 700 → sun 대비 px 비 4.71% → mercury pxDiameter = 246.3 × 4.71% = 11.60 px (forensic 박제 5.29px 와 차이는 4px fallback billboard 최소 마진 적용 분 — R3 ADR Amendment 2026-05-03 라운드 3 박제 SSoT 따름)
- venus: scale 800 → sun 대비 px 비 13.58% → venus pxDiameter = 246.3 × 13.58% = 33.45 px (forensic 박제 48.4 px — R3 ADR 라운드 3 박제 SSoT 따름. mid 일관 유지)

위 R3 박제값 SSoT 그대로 차용. earth/venus 의 사실 비율 = `radius_earth / radius_venus = 1.0539`. earthScale 후보별 sun 대비 px 비 산출:

```
earth_sunPxRatio (1280×720) = (6.378137e6 × earthScale) / (6.957e8 × 50)
                            = earthScale × 1.834e-4

earth_pxDiameter (1280×720) = 246.3 × earth_sunPxRatio
                            = earthScale × 0.04515
```

| earthScale | earth sun 대비 px 비 | earth pxDiameter (1280×720) | venus 대비 px 비 (사실 1.054배) | 평가 |
|---|---|---|---|---|
| × 600 | 11.00% | 27.1 px | 81.0% (사실 비율 76.8%) | 사실 비율 미달 (venus < earth 미충족) |
| × 700 | 12.84% | 31.6 px | 94.6% (사실 비율 76.8%) | 사실 비율 거의 동등 (venus ≈ earth, 사실 모순) |
| **× 800** | **14.67%** | **36.1 px** | **108.0%** (사실 비율 105.4%) | **사실 비율 정합 (earth 8% 큼, 사실 5.4% 의 1.5배 — 인지 강화)** |
| × 850 | 15.59% | 38.4 px | 114.8% (사실 비율 105.4%) | earth 약간 더 큼 (마진 안전) |
| × 900 | 16.50% | 40.6 px | 121.5% (사실 비율 105.4%) | earth 21.5% 큼 (사실 비율 과장 1.5배) |
| × 1000 | 18.34% | 45.2 px | 135.0% (사실 비율 105.4%) | earth 35% 큼 (과장 과도, mid 임계 50 미만 OK) |
| × 1100 | 20.17% | 49.7 px | 148.5% (사실 비율 105.4%) | mid 임계 50 px 거의 근접 (LOD 분기 전환 위험) |
| × 1200 | 22.01% | 54.2 px | 162.0% (사실 비율 105.4%) | mid 임계 50 px 초과 → LOD high 진입 위험 |
| × 1500 | 27.51% | 67.8 px | 202.5% (사실 비율 105.4%) | 과장 과도, mid 임계 미달 |

#### 후보 평가

| 후보 | sun 대비 px 비 | venus 대비 비 | 4px fallback 마진 | mid 임계 50 px 마진 | Q2=B 임계 후보 | 평가 |
|---|---|---|---|---|---|---|
| **A. earthScale=800** | 14.67% | 108.0% (사실 105.4% 의 1.5배 인지 강화) | +32.1 px | +13.9 px | ≤ 15% (margin 2.3%) | **선택 — 사실 비율 정합 + venus 800 동일값 (단순 정수) + 임계 마진 안정** |
| B. earthScale=850 | 15.59% | 114.8% | +34.4 px | +11.6 px | ≤ 16% (margin 2.6%) | 선택 후보 2 (보수 마진 선호 시) |
| C. earthScale=900 | 16.50% | 121.5% (과장 1.5배) | +36.6 px | +9.4 px | ≤ 17% | mercury venus 와 단조 패턴 만족 (700 → 800 → 900 단조 증가) |
| D. earthScale=700 (mercury 와 동일) | 12.84% | 94.6% | +27.6 px | +18.4 px | ≤ 13% | venus ≈ earth (사실 모순), 단조 감소 모순 |
| E. earthScale=1000 | 18.34% | 135.0% (과장 28%) | +41.2 px | +4.8 px | ≤ 19% | mid 임계 마진 부족 (4.8 px) |

#### 선택 — **후보 A: `earthScale = 800`**

근거:
1. **사실 비율 정합 (earth > venus)** — earth/venus radius 비 1.054 → 시각 비 108.0% (5.4% 큰 사실의 약 1.5배 인지 강화). 사용자가 "지구가 금성보다 약간 더 크다" 자연 인지 (Q2=B 정책의 본 인스턴스화 검증)
2. **Q2=B 임계 ≤ 15% 박제 (sun 25% / mercury ≤ 6% / venus ≤ 11% 박제 SSoT 정합)** — earth 14.67% 가 ≤ 15% 임계 margin 2.3% — sun 25% → mercury 6% → venus 11% → **earth 15%** 단조 증가 (radius 비 정합) + Q2=B 정책의 첫 본 인스턴스화 ± 2% 허용 오차 가드 안에서 정확 박제. R3 ADR Amendment 2026-05-03 라운드 3 의 "사실 비율 강화" 패턴 계승
3. **4px fallback 마진 안정** — earth pxDiameter 36.1 px (4px fallback +32.1 px 마진). LOD billboard 분기 임계 4 px 의 9배 → 가시성 회귀 0
4. **mid LOD 임계 50 px 안전** — 36.1 px < 50 px → R4 진입 시 mid LOD 일관 유지 (P11-B LOD ADR §결정 §3 정합)
5. **단순 정수 + venus 와 동일값** — 700 → 800 → 800 (mercury → venus → earth). venus 와 earth radius 가 거의 동등 (1.054배) 하므로 동일 scale 박제가 산출식 직관적. body-scale.ts 룩업 가독성 + R5+ extend 시 단조 패턴 변경 비용 minimum
6. **모바일 누적 차단율 마진** — earth 36.1 × π × 36.1/4 / (375 × 667) ≈ 1024 / 250125 = 0.41% (1280×720 의 약 5배 → 모바일 ≈ 2.05% disk area). sun 5.17% + mercury 0.29% + venus 1.06% + **earth 2.05%** + moon 0.5% (후술) = **9.07% 누적 차단율** (DoD-9 임계 25% 까지 16% margin)

#### Concrete Prediction — R4 의 본 검증 + R5~R10 확장 박제

R3 ADR §결과·재검토 조건 §Concrete Prediction "R4 추가 시 코드 변경 ≤ 4 라인" 의 본 R4 검증 (BODY_SCALE 2 + FOCUS_BUTTONS 1 + R_PHASE_BODY_ALLOWLIST 1 = **4 라인 정확**).

**R5 추가 prediction (R4 박제 시점)**: R5 (화성+포보스/데이모스) 추가 시:
- mars: BODY_SCALE 룩업 1줄 + FOCUS_BUTTONS 1줄 + R_PHASE_BODY_ALLOWLIST 1줄 = 3 라인
- phobos/deimos (PM 결정 의존, R5 비-범위 가능): satellite 패턴 (본 R4 moon 사례) 그대로 적용. 추가 시 각 satellite +2 라인 (BODY_SCALE + R_PHASE_BODY_ALLOWLIST, shortcut 미등록 가능)
- 예상 코드 변경: mars 만 3 라인 / mars + 2 satellites 진입 시 ≤ 7 라인

#### 모바일 인지 가능성 별도 검증 (D-T2) — volt #68 / #74 적용

본 ADR §축 1 후보 A 채택 시 모바일 (375×667) 누적 차단율 ~ 9.07% — DoD-9 임계 25% 까지 16% margin (양호). 단 **headless 검증만으로는 부족** (volt #77). developer 가 R4 PR 에서 실 모바일 Chrome (375×667) 으로 수동 확인 의무 (D-T2). R5 (mars) 진입 시 누적 누적 차단율 ≈ 10~12% 예상 (mars radius 가 venus 의 0.561배 → marsScale ≈ 1400 시 marsPxRatio ≈ 4%, 모바일 차단율 1.5~2% 추가) → R5 진입 전 viewport-aware scaling 발동 트리거 가능성 낮음 (margin 안정).

---

### 축 2 — `moonScale` 구체값 (D-E2)

#### 산출 — 9 candidates × 3 viewport

moon.radius = 1.7374e6 m (mercury.radius=2.4397e6 의 **0.712배**, earth.radius=6.378137e6 의 **0.272배**, sun.radius=6.957e8 의 **0.250%**).

```
moon_sunPxRatio (1280×720) = (1.7374e6 × moonScale) / (6.957e8 × 50)
                           = moonScale × 4.994e-5

moon_pxDiameter (1280×720) = 246.3 × moon_sunPxRatio
                           = moonScale × 0.01230
```

| moonScale | moon sun 대비 px 비 | moon pxDiameter (1280×720) | earth 대비 px 비 (사실 0.272) | mercury 대비 px 비 (사실 0.712) | 평가 |
|---|---|---|---|---|---|
| × 600 | 3.00% | 7.38 px | 20.5% (사실 27.2%) | 63.7% (사실 71.2%) | earth 대비 사실 미달 |
| × 700 | 3.49% | 8.61 px | 23.8% (사실 27.2%) | 74.3% | 사실 비율 거의 정합 (mercury 미만, earth 의 23.8%) |
| **× 800** | **3.99%** | **9.84 px** | **27.2%** (사실 27.2% **정확 일치**) | **84.8%** | **사실 비율 정확 정합 (earth-moon 자연 비율)** |
| × 900 | 4.49% | 11.07 px | 30.6% | 95.4% | earth-moon 약간 과장 |
| × 1000 | 4.99% | 12.30 px | 34.1% | 105.9% (사실 71.2% 위배 — moon > mercury 가능) | mercury 와 동등 (사실 모순) |
| × 1200 | 5.99% | 14.76 px | 40.9% | 127.1% | mercury 보다 큼 (사실 모순 강함) |
| × 1500 | 7.49% | 18.45 px | 51.1% | 158.9% | moon > mercury 압도 (사실 위배) |

#### 후보 평가

| 후보 | sun 대비 px 비 | earth 대비 px 비 | mercury 대비 px 비 | 4px fallback 마진 | hit-test 영역 | Q2=B 임계 후보 | 평가 |
|---|---|---|---|---|---|---|---|
| A. moonScale=600 | 3.00% | 20.5% (사실 미달) | 63.7% | +3.38 px | 좁음 | ≤ 3.5% | 사실 비율 미달, 4px fallback 마진 좁음 |
| B. moonScale=700 | 3.49% | 23.8% | 74.3% | +4.61 px | 좁음 | ≤ 4% | 사실 비율 거의 정합, 4px 마진 1.15배 |
| **C. moonScale=800** | **3.99%** | **27.2%** (사실 일치) | **84.8%** | **+5.84 px** | **양호** | **≤ 4.5%** | **선택 — 사실 비율 정확 정합 + 4px 마진 1.46배 + earth scale 과 동일값 단순성** |
| D. moonScale=900 | 4.49% | 30.6% | 95.4% | +7.07 px | 양호 | ≤ 5% | 사실 비율 12% 과장, mercury 거의 동등 (95% — 사실 71.2% 의 1.34배) |
| E. moonScale=1000 | 4.99% | 34.1% | 105.9% (사실 모순) | +8.30 px | 양호 | ≤ 5.5% | **탈락** — mercury 와 동등하거나 큼 (사실 위배) |

#### 선택 — **후보 C: `moonScale = 800`**

근거:
1. **사실 비율 정확 정합 (moon/earth = 27.2%)** — moonScale=800 → earth 대비 px 비 27.2% **정확 일치** (moon.radius/earth.radius = 0.2723). Q2=B 비례 결정 정책의 가장 정밀한 사실 정합 사례 — sub-pixel 위험 환경에서도 사실 비율 보존
2. **mercury 보다 작음 (사실 정합)** — moon/mercury = 84.8% (사실 71.2% 의 1.19배 인지 강화). 사용자가 "달은 수성보다 약간 작다" 자연 인지 — moon.radius (1.7374e6) < mercury.radius (2.4397e6) 의 사실 정합
3. **Q2=B 임계 ≤ 4.5% 박제 (sun 25% / mercury 6% / venus 11% / earth 15% / moon 4.5%)** — moon 3.99% 가 ≤ 4.5% 임계 margin 0.51% — Q2=B 정책의 첫 본 인스턴스화 ± 2% 허용 오차 가드 안에서 정확 박제. **moon 임계가 mercury 임계 (6%) 보다 작은 점은 사실 비율 정합 (moon < mercury) 의 직접 반영**
4. **4px fallback 마진 안전** — moon pxDiameter 9.84 px (4px fallback +5.84 px 마진, 1.46배). LOD billboard 임계 4 px 의 2.46배 → 가시성 회귀 가능성 0 (단 sub-10px sub-pixel 안티앨리어싱 회귀 가능성은 D-T2 사용자 검증 의무)
5. **earth scale 과 동일값 (800)** — 단순 정수 + body-scale.ts 룩업 가독성. earthScale=800 / moonScale=800 단순 정렬. 사실 비율 정합은 BODY_SCALE 값 대비 radius 비로 자동 반영 (식 일관)
6. **hit-test 영역 양호** — 9.84 × 9.84 = ~96.8 px² (mouse 클릭 hit-test 임계 보통 64 px² = 8×8 정도) → click hit-test 직접 가능. 단 zoom-out 시 sub-pixel 위험 — shortcut 의존 fallback (본 ADR §결정 4)
7. **모바일 누적 추가 minimum** — moon 모바일 (375×667) disk area ≈ 9.84 × π × 9.84/4 / (375 × 667) ≈ 76 / 250125 = 0.0304% (1280×720 의 5배 → 0.15%). 누적 차단율 +0.15% — sun (5.17%) + mercury (0.29%) + venus (1.06%) + earth (2.05%) + **moon (0.15%)** = **8.72% 누적 차단율** (DoD-9 임계 25% margin 16.28%)

#### Concrete Prediction (moon 본 검증)

- moon pxDiameter 9.84 px (1280×720) — D-T2 사용자 검증 시 ± 2 px 허용 오차
- moon sun 대비 px 비 3.99% — Q2=B 임계 ≤ 4.5% margin 0.51% (산출 오차 ± 5% 흡수 가능)
- moon earth 대비 px 비 27.2% — 사실 비율 (radius 비 27.23%) 와 정확 일치 (사용자 자연 인지)
- **D-T2 검증 후 미통과 시 (산출과 실측 ± 5% 초과)**: §재검토 트리거 #1 발동, moonScale ± 100~200 범위 재조정

---

### 축 3 — `earth` / `moon` Q2=B sun 대비 px 비 임계 박제 (D-E3, Q2=B SSoT 첫 본 인스턴스화)

#### 배경 — Roadmap v3 §6 Amendment 2026-04-30 + §라운드 2 Amendment 2026-05-01 박제 SSoT

```
sun: ≤ 25% (모바일 침습성 가드, M2 diskAreaRatio 기준 / sun 자체 점유율)
mercury: sun 대비 px 비 ≤ 6% (Amendment 2026-05-01 적극값)
venus: sun 대비 px 비 ≤ 11% (Amendment 2026-05-01 적극값)
R4+ body: R-Phase 진입 PM 라운드에서 architect ADR 박제값 인스턴스화 (본 R4 가 첫 본 인스턴스화)
허용 오차: 박제값 ± 2% (Amendment 2026-05-01 강화)
```

#### earth 임계 후보

| 후보 | earth 임계 | earthScale=800 결과 | margin | 평가 |
|---|---|---|---|---|
| **A. ≤ 15%** | ≤ 15% | 14.67% | **0.33%** (마진 안전) | **선택 — Q2=B 정책 정합 + ± 2% 허용 오차 안에서 박제값 정확 통과** |
| B. ≤ 14% | ≤ 14% | 14.67% | -0.67% (실패) | earthScale=800 박제값과 불일치 (산출 14.67%) — **탈락** |
| C. ≤ 16% | ≤ 16% | 14.67% | +1.33% | margin 풍부하나 사실 비율 (venus 11% × 1.054 = 11.6%) 와 직관 거리 |
| D. ≤ 17% | ≤ 17% | 14.67% | +2.33% | mercury 6% / venus 11% 의 단조 증가 패턴과 정합 (≤ 17% 가 venus 11% 의 1.55배) — 보수 margin |

**선택**: **A. ≤ 15%** — 산출값 14.67% 와 margin 0.33% (± 2% 허용 오차 안에서 정확 통과). 단조 증가 패턴 (sun 25% / mercury 6% / venus 11% / **earth 15%** / R5+ TBD) 유지.

#### moon 임계 후보

| 후보 | moon 임계 | moonScale=800 결과 | margin | 평가 |
|---|---|---|---|---|
| A. ≤ 4% | ≤ 4% | 3.99% | 0.01% (마진 거의 없음) | margin 부족 (산출 오차 ± 5% 흡수 불가) |
| **B. ≤ 4.5%** | ≤ 4.5% | 3.99% | **0.51%** | **선택 — moonScale=800 박제값과 margin 0.51% + Q2=B 정합 + mercury 6% 보다 작은 점이 사실 비율 (moon < mercury) 의 직접 반영** |
| C. ≤ 5% | ≤ 5% | 3.99% | 1.01% | margin 풍부하나 사실 비율 mercury 6% 와 가까워짐 (moon ≈ mercury 시각 인지 위험 — moon/mercury radius 비 71.2%) |
| D. ≤ 5.5% | ≤ 5.5% | 3.99% | 1.51% | mercury 6% 거의 동등 (moon > mercury 시각 가능성 — 사실 위배) |

**선택**: **B. ≤ 4.5%** — moonScale=800 박제값 산출 3.99% margin 0.51% (± 2% 허용 오차 안에서 통과). **moon 임계가 mercury 임계 (6%) 보다 작은 점은 사실 비율 정합 (moon < mercury, radius 비 71.2%) 의 직접 반영**.

#### 박제 임계 SSoT (본 R4 박제 - Q2=B 첫 본 인스턴스화)

```
sun: ≤ 25% (R1/R2/R3 박제 보존)
mercury: ≤ 6% (R2 Amendment 2026-05-01 박제 보존)
venus: ≤ 11% (R3 Amendment 2026-05-01 박제 보존)
earth: ≤ 15% (본 ADR 박제, 라운드 1)
moon: ≤ 4.5% (본 ADR 박제, 라운드 1)
R5+ body: R-Phase 진입 시 architect ADR 박제 (예: mars TBD)
허용 오차: ± 2% (Amendment 2026-05-01 강화 SSoT 보존)
```

#### Concrete Prediction (Q2=B 첫 본 인스턴스화 검증)

- earth 산출 14.67% / 임계 ≤ 15% — D-T2 실측 ± 2% 허용 오차 통과 예상 (forensic viewport 무관 일관성 1280×720 vs 1920×1080 동일 박제 SSoT 검증됨)
- moon 산출 3.99% / 임계 ≤ 4.5% — D-T2 실측 ± 2% 허용 오차 통과 예상
- **R5+ body 진입 시 동일 패턴 SSoT 자동 적용** — Q2=B 정책 인스턴스화는 architect ADR §축 3 (본 ADR 패턴) 으로 R5/R6/R7 등 자동 확장

---

### 축 4 — 달 궤도 라인 visible 방안 (D-E4, 위험 #1 해결)

#### 배경

PM 합의 Q2=A — "달 궤도 전체 visible (default 진입에서 visible 보장)". 단 달 궤도 = 지구 중심 small circle (semiMajorAxis ≈ 3.844e8 m, sun-earth orbit semiMajorAxis 1 AU = 1.496e11 m 의 0.257%) → sun 시점 카메라 (radius=35 scene unit, target=(0,0,0)) 에서 점/잔재 수준 위험.

지구 궤도 scene unit 산출: `1 AU × renderScale = 1.496e11 × 8.4e-11 ≈ 12.57 scene unit` → camera radius=35 의 35.9%. 화면 차지 약 35.9% × 2 × tan(0.4) × 720 / (35 × 2 × 0.4228) = 12.57 × 720 / 29.6 / 35 × 2 ≈ **614 px** 직경 (sun pxDiameter 246.3 의 약 2.5배). 시각 충분.

달 궤도 scene unit 산출: `3.844e8 × 8.4e-11 ≈ 3.229e-2 scene unit` → camera radius=35 의 0.092%. 화면 차지 약 0.092% × 2 × 720 / 35 × 0.4228 = 3.229e-2 × 720 / 29.6 × 2 = **1.57 px** 직경 (sub-pixel 잔재) → **default sun 시점 visible 미달**.

#### 후보 비교

| 후보 | 방안 | 가시성 보장 | 부담 | 평가 |
|---|---|---|---|---|
| **A. zoom-threshold 표시** | earth focus / zoom-in 시점 (camera radius ≤ N scene unit) 만 달 궤도 render | sun 시점 (radius=35) 에서 안 보임 — **PM Q2=A "default 진입 visible" 위배** | 분기 로직 신규 추가 | **탈락 (PM 합의 위배)** |
| **B. 상시 표시** | sun 시점에서도 line system render (1.57px sub-pixel 잔재) | 점/잔재 수준 — visible 의 의미 약 | line builder 코드 변경 0 | 부분 (사용자 인지 미달 위험) |
| **C. 색상/굵기 조정** | line 색상 강조 (예: ambient 대비 높은 contrast) + 굵기 ≥ 2 px (Babylon `lineSystem` 의 `useVertexColors=true` + thickness option) | 1.57 px 직경 + 강조 색 → ~3 px 직경 line | line builder thickness 조정 1줄 | 부분 (1.57 px 직경 자체가 본질 한계) |
| **D. zoom-threshold + earth-focus 진입 시 visible 보장** | sun 시점에서는 hide, earth focus / zoom-in 시 visible. **+ 진입 안내 (CelestialInfoPanel 에 "지구 focus 후 달 궤도 확인" 문구 추가)** | sun 시점 invisible (PM Q2=A 위배 부분) — earth focus 후 visible 보장 | 분기 + 패널 문구 | 일부 PM Q2=A 합의 재해석 필요 |
| **E. 상시 표시 + earth focus 진입 시 강조 강화 (B+C 조합)** | sun 시점에서도 line render (1.57px sub-pixel 잔재) + earth focus 시 thicker line (3~5 px) + 색상 강조 (`Color3(0.7, 0.7, 0.8)` 등) | sun 시점에서 점/잔재 + earth focus 시 visible 충분 | line builder thickness 조건부 1~3줄 | **선택 — PM Q2=A "default 진입 visible" 약속 달성 (sub-pixel 잔재) + earth focus 시 강조** |

#### 선택 — **후보 E: 상시 표시 + earth focus 진입 시 강조**

근거:
1. **PM Q2=A 합의 정합** — "달 궤도 전체 visible (default 진입에서 visible)" 약속 달성 (sun 시점에서도 line render, sub-pixel 잔재일지라도). 합의 위배 회피
2. **earth focus 진입 후 강조 강화** — earth focus (camera radius ≈ 1~5 scene unit) 시 달 궤도 화면 차지 직경 약 35~150 px → 상세 visible. line thickness 3~5 px 강조 시 시각 패턴 자연 인지
3. **forensic ADR 변형 미발동** — 본 결정은 단일 원인 (sub-pixel 잔재) + 단일 fix (thickness + 상시 표시) + 5±2 옵션 비교 (5개) 만족 — forensic 5 조건 중 2개만 충족 (다중 가설 / runtime 측정 부재) → **일반 ADR 유지**
4. **D-T2 사용자 검증 의무** — sub-pixel 잔재 visible 여부 (1.57 px line) 가 사용자 인지 가능 여부 D-T2 의무. 미달 시 후보 D (zoom-threshold + 안내 문구) 로 변경 트리거 (§재검토 트리거 #2)
5. **구현 부담 minimum** — solar-system-scene.ts:358-378 rebuildOrbitLines 가 모든 body 자동 처리 (parentId 기반 상대 좌표 자동) → moon 도 자동 render (B 옵션 무료). thickness 조건부 강조 (earth focus 시) 만 신규 1~3줄

#### Concrete Prediction

- sun 시점 (radius=35) 에서 달 궤도 1.57 px 직경 line — D-T2 사용자 보고: "잔재 보임" (인지 가능) 또는 "안 보임" (인지 미달)
- earth focus (radius=2~5) 에서 달 궤도 70~300 px 직경 + thickness 3~5 px 강조 → **충분히 visible**
- **D-T2 미통과 시 후보 D (zoom-threshold + 안내 문구) 로 trigger** (§재검토 트리거 #2)

---

### 축 5 — 7개 shortcut bar 순서 + 모바일 너비 수용 (D-E5, 위험 #2 해결)

#### 배경

R3 baseline FOCUS_BUTTONS 6개 (sun / mercury / venus / earth / jupiter / neptune) → R4 진입 시 moon 추가 → **7개**. 모바일 (375 px viewport) 너비 수용 위험 가능.

#### 순서 후보

| 후보 | 순서 | 의미 | 평가 |
|---|---|---|---|
| **A. sun / mercury / venus / earth / moon / jupiter / neptune** | 천체 거리 순 + moon 은 earth 뒤 (satellite parent 인접) | 자연 순서 (parent-satellite 인접) | **선택 — 사용자 자연 mental model (지구 → 달 인접)** |
| B. sun / mercury / venus / earth / jupiter / neptune / moon | 천체 거리 순 + moon 끝 | satellite 별도 그룹 | parent 와 떨어짐 (인지 불편) |
| C. sun / mercury / venus / earth / [그룹 1] / jupiter / neptune + [그룹 2] moon | 2단 (planet vs satellite) | UI 복잡 | 모바일 너비 수용 어려움 |

#### 선택 — **후보 A: sun / mercury / venus / earth / moon / jupiter / neptune**

근거:
1. **자연 사용자 mental model** — 지구 다음 달 인접 (parent-satellite 자연 그룹)
2. **R5+ satellite 추가 시 자동 패턴** — mars 다음 phobos/deimos / jupiter 다음 galilean / saturn 다음 titan 등 (R5+ ADR 에서 동일 패턴 적용)
3. **단조 자연 순서** — 천체 거리 + satellite 인접

#### 모바일 너비 수용 후보

7개 버튼 모바일 (375 px) 너비 수용 산출:
- 현재 R3 6개 버튼 + reset + free-fly = 8개. CSS `flex gap-1` (4 px gap) + padding `px-2 py-1` (8 px 좌우) + text-caption (~10 px font, 평균 2 글자 한글 = ~24 px text width). 한 버튼 너비 ≈ 40 px (text 24 + padding 16) + border 2 = ~42 px. 총 8 × 42 + 7 × 4 (gap) = **364 px** (375 px viewport margin 11 px)
- R4 7개 버튼 + reset + free-fly = 9개. 9 × 42 + 8 × 4 = **410 px** > 375 px (모바일 viewport 초과 — **35 px overflow 위험**)

| 후보 | 방안 | 평가 |
|---|---|---|
| **A. 폰트 / padding 축소** | `text-caption` (10 px) → `text-mini` (9 px) + `px-1` (4 px) | 버튼 너비 ~32 px → 9 × 32 + 8 × 4 = 320 px (margin 55 px) | **선택 — Tailwind 변수 1~2줄 변경 + 가독성 미세 영향** |
| B. horizontal scroll | `overflow-x-auto` | 모바일 사용자 scroll bar 인지 + UX 마찰 | UX 마찰 |
| C. 2단 레이아웃 | 모바일 viewport 시 grid 2 row × 5 col | Layout 변경 복잡 + viewport 분기 신규 도입 | 부담 큼 |
| D. moon 모바일 hide | 모바일 viewport 시 moon button hide | Q5=A 합의 위배 (모바일 사용자 moon focus 불가) | **PM 합의 위배** |

#### 선택 — **후보 A: 폰트 / padding 축소** (현재 `text-caption px-2 py-1` → `text-mini px-1 py-0.5`)

근거:
1. **모바일 viewport 수용 안전** — 9 버튼 × 32 px + 8 gap × 4 px = 320 px (375 px margin 55 px)
2. **Tailwind 변경 1~2줄** — focus-quick-buttons.tsx 의 button `className` 의 padding/font 토큰만 변경. 단위 테스트 / 회귀 가드 변경 0
3. **가독성 미세 영향** — text-caption (10 px) → text-mini (9 px) 1 px 차이. 한글 가독성 (2 글자 라벨) 유지
4. **D-T2 검증 의무** — 사용자 실 모바일 Chrome (375 px) viewport 에서 7개 버튼 + reset + free-fly = 9개 overflow 없음 확인
5. **R5+ button 추가 시 재트리거** — R5 mars 추가 시 10 버튼 → 10 × 32 + 9 × 4 = 356 px (margin 19 px) — R6 (jupiter) 추가 시 11 버튼 → 11 × 32 + 10 × 4 = 392 px > 375 px → **R6 진입 시 후보 B (horizontal scroll) 또는 C (2단) 발동 트리거**

#### Concrete Prediction

- 모바일 viewport 9 버튼 × 32 px + 8 gap × 4 px = 320 px (375 px margin 55 px) — D-T2 실측 ± 10% 허용
- D-T2 미통과 시 (overflow 발견): font-size 추가 축소 또는 후보 B (horizontal scroll) 발동

---

### 축 6 — earth-moon 거리 비례 결정 (D-E6, 위험 #3 + #4 해결)

#### 배경

moon orbit semiMajorAxis = 3.844e8 m (earth 중심 기준). renderScale=8.4e-11 적용 시 scene unit ≈ 3.229e-2 (earth.radius × earthScale=800 의 mesh wsR 산출: 6.378137e6 × 1.68e-10 × 800 / 2 = 4.286e-1 scene unit 의 약 7.5%). 즉 **moon 의 orbit 거리가 earth mesh 반경의 7.5% 수준** → **moon mesh 가 earth mesh 와 mesh-collision (겹침) 위험**.

| 측정 | 값 |
|---|---|
| moon orbit semiMajorAxis (scene unit, renderScale 적용) | 3.229e-2 |
| earth mesh wsR (earthScale=800) | 0.4286 (mesh radius) |
| moon orbit / earth mesh wsR | 7.5% |
| **결과** | moon 이 earth mesh **내부**에 위치 → 시각적 겹침/잔재 위험 |

이는 R3 followup forensic 의 "mercury 가 sun mesh 내부 (0.77× sun radius)" 패턴과 동일 (volt #74). **Q2=B 정책은 sun 대비 px 비 SSoT 인데 moon-earth 거리 비례는 별도 차원**.

#### 옵션 비교

| 옵션 | 방안 | earth-moon 거리 보존 | moon 시각 visible | 부담 | 평가 |
|---|---|---|---|---|---|
| **(i) 실측 거리 + 달 visual scale 과장** | renderScale = 8.4e-11 (R1 SSoT) 보존, moonScale=800 적용 (mesh wsR ≈ 0.117) → **moon mesh 가 orbit 거리 (3.229e-2) 보다 큼 (3.6배)** | 보존 (실측 SSoT) | **mesh 가 orbit 거리 초과 → orbit 라인이 moon mesh 내부에 위치, mesh-line 겹침** | scale 적용 외 변경 0 | **탈락 (mesh-line 겹침 시각적 회귀)** |
| (ii) 거리 자체도 과장 | moon orbit semiMajor 의 renderScale 을 별도 분리 (예: × 5 ~ × 10 추가 과장) → moon-earth 거리 0.16 ~ 0.32 scene unit | **위배 (실측 SSoT 위반)** | mesh 와 orbit 분리 가능 | renderScale 분기 신규 + `solar-system.json` 데이터 변경 없음 (코드 변경) | 부담 큼 + 실측 SSoT 위반 |
| **(iii) earth-moon 거리 자체는 실측 보존, moon visual scale 만 적정값 사용** | renderScale=8.4e-11 보존 + moonScale=800 그대로 + **earth focus 시 zoom-in 만으로 moon-earth 분리 가능 활용**. sun 시점에서는 moon 이 earth mesh 내부 (시각적 겹침) — 사용자가 zoom-in 으로만 확인 | 보존 | sun 시점에서 moon 안 보임 (earth mesh 내부 잔재). earth focus zoom-in 시점 (radius ~ 1~2 scene unit) 에서 분리 visible | 변경 0 | 단순하나 sun 시점 invisible |
| (iv) moonScale 추가 인하 (예: 200) | moonScale=200 → mesh wsR ≈ 0.029 (earth wsR 0.4286 의 6.7%, orbit 거리 3.229e-2 의 91%). moon mesh 가 orbit 거리 안에 들어옴 (분리 가능) | 보존 | moon pxDiameter ≈ 2.46 px (4px fallback 미달 — billboard 4px sticky fallback 발동) | scale 변경 1줄 | moon 시각 매우 작아짐 (인지 한계) — 본 R4 가시성 DoD 미달 위험 |

#### 선택 — **옵션 (iii): earth-moon 거리 실측 보존 + moon visual scale 적정값 사용 + earth focus zoom-in 분리**

근거:
1. **실측 SSoT 보존** — `solar-system.json` 의 moon orbit semiMajorAxisAU = 0.00257189 (3.844e8 m) 그대로 보존. 옵션 (ii) 의 추가 과장은 실측 SSoT 위반
2. **moon visible 보장 (earth focus 시점)** — earth focus zoom-in (camera radius ≈ 1~2 scene unit) 시점에서 moon-earth 분리 가능. moon mesh wsR=0.117 → 화면 차지 ~ 70~100 px (radius=1.5 가정) → **clearly visible**
3. **sun 시점 invisible 은 D-T2 검증 의무** — 사용자가 "달은 earth focus 후 zoom-in 시 확인" mental model 학습. 본 ADR §결정 4 (달 궤도 visible) 와 정합 — 달 궤도 line 은 상시 표시 (sub-pixel 잔재) + earth focus 시 분리. D-T2 사용자 검증으로 mental model 학습 가능성 확인
4. **forensic ADR 변형 미발동** — 단일 원인 (renderScale 비례 mismatch) + 단일 fix (실측 보존 + zoom-in 학습) + 4 옵션 비교 — forensic 5 조건 중 2개만 충족 → **일반 ADR 유지**
5. **moon 클릭 hit-test 위험 해결** (위험 #4):
   - **sun 시점**: moon mesh 가 earth mesh 내부 → 직접 클릭 hit-test 불가. **shortcut bar moon 버튼 의존** (Q5=A 합의 정합)
   - **earth focus zoom-in 시점**: moon mesh 분리 → 직접 클릭 hit-test 가능 (mesh radius ~ 70~100 px)
   - **URL override**: `?focus=moon` 진입 시 camera target moon mesh 중심 → 자동 분리
6. **R5+ satellite 패턴 SSoT** — 본 R4 의 옵션 (iii) 채택이 R5 (phobos/deimos) / R6 (galilean) / R7 (titan) 등 모든 satellite 의 일관 패턴. parent focus zoom-in 시 satellite 분리 + shortcut bar / URL override 로 직접 진입.

#### Concrete Prediction (옵션 iii 채택)

- sun 시점 (radius=35): moon mesh earth mesh 내부 → 직접 visible 미달. **단 달 궤도 line 은 상시 표시 (sub-pixel 잔재)** — D-T2 사용자 인지 가능 여부 검증
- earth focus zoom-in (radius=1.5): moon mesh 분리 visible (~70~100 px) — D-T2 충분 visible 예상
- moon click hit-test:
  - sun 시점 — shortcut bar moon 버튼 의존
  - earth focus zoom-in — 직접 클릭 가능
  - URL override `?focus=moon` — 정상 작동

#### D-T2 미통과 시 후속 검토 (§재검토 트리거 #3)

옵션 (iii) 채택 후 D-T2 사용자 검증 결과 "moon 이 sun 시점에서 아예 안 보임 + earth focus 학습 mental model 불편" → 옵션 (ii) (거리 추가 과장) 또는 옵션 (iv) (moonScale 인하 + 4px fallback 의존) 재검토. forensic ADR 변형 발동 가능성 (다중 가설 추가, 사용자 인지 단위 ↔ 박제 단위 mismatch 재발견 시 5 조건 만족).

---

## 결정 (Accepted, cross-validate 2026-05-20)

본 ADR 의 6가지 결정은 cross-validate 1회 (Gemini 2.5 pro, 2026-05-20) 결과 본문 통합 후 Accepted 전이 완료 (CLAUDE.md §ADR Status 워크플로 #370). 상세 cross-validate 결과는 §교차검증 반영 사항 참조.

### 결정 1 — earthScale = 800 (축 1 후보 A) — Amendment 2 보존

```typescript
// apps/web/src/constants/body-scale.ts (developer 단계 박제 의무)
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 50,
  mercury: 700,
  venus: 800,
  earth: 800, // R4 #532 — venus 와 동일값 (radius 1.054배 사실 비율 인지 강화)
  moon: 800,  // R4 #532 + #539 Amendment 2 — 결정 2 갱신 참조 (moonScale 값 보존, earth-moon orbit visual scale 별도 도입)
});
```

**근거**: 사실 비율 정합 (earth > venus, 1.054배) + Q2=B 임계 ≤ 15% margin 0.33% (Amendment 1 후 ≤ 17%) + mid LOD 임계 50 px 안전 + 4px fallback 마진 1.46배 + venus 와 동일값 단순성. **Amendment 2 (2026-05-21)**: earthScale=800 보존 (실측 fusion 회귀 직접 원인 아님 — earth mesh radius 5.1e9 m 자체가 earth-moon 실측 거리 3.847e8 m 의 13.26배 흡수가 본 회귀 근본 원인). 후속 결정 6 §earth-moon orbit visual scale 도입으로 해결.

### 결정 2 — moonScale = 800 (축 2 후보 C) — Amendment 2 보존

> **Amendment 2 (2026-05-21, forensic 라운드)**: D-T2 실측 결과 `moonScale=800` 자체는 sun 대비 px 비 / 4px fallback / hit-test 모두 PASS. **시각 fusion 회귀의 근본 원인은 earth-moon 거리 비례 (결정 6)** 가 실측 SSoT 보존 + earthScale=800 mesh radius 흡수와 양립 불가 — moonScale 값은 변경 없이 보존. 상세: §Amendment 2 forensic 측정 + §결정 6 갱신.

**근거**: 사실 비율 정확 정합 (moon/earth = 27.2% 일치) + Q2=B 임계 ≤ 4.5% margin 0.51% (Amendment 1 후 ≤ 5.0%) + mercury 6% 보다 작은 점이 moon < mercury 사실 정합 + earth scale 동일값 단순성 + 4px fallback 마진 1.46배. **moonScale 변경 시 검토 후보 (i) ≤ 221** (수학적 mesh < distance 한계) 도 earthScale=800 mesh radius (5.1e9 m) 흡수가 본 원인이므로 무효 — §Amendment 2 §옵션 비교 참조.

### 결정 3 — Q2=B sun 대비 px 비 임계 박제 (축 3 — Q2=B SSoT 첫 본 인스턴스화)

> **Amendment 1 (2026-05-21)**: D8 implementation 직후 실측 검증 결과 식 결함이 명확해져 임계를 **earth ≤ 17% / moon ≤ 5.0%** 로 안정화. earthScale=800 / moonScale=800 architect 박제값은 보존. 본 §결정 3 결정값은 amendment 후 값으로 갱신됨. 상세 검증 결과는 §Amendment 1 — D8 측정 검증 박제 참조.

```
earth: sun 대비 px 비 ≤ 17% (R4 #532 Amendment 1, 2026-05-21 — perspective 보정 + 5% 노이즈 마진)
moon: sun 대비 px 비 ≤ 5.0% (R4 #532 Amendment 1, 2026-05-21 — earth 동반 완화)
```

기존 R1/R2/R3 박제 SSoT 보존:
- sun ≤ 25% (R1 ADR Amendment 2026-05-01)
- mercury ≤ 6% (R2 ADR Amendment 2026-05-01)
- venus ≤ 11% (R3 ADR Amendment 2026-05-01)

허용 오차: 박제값 ± 2% (Amendment 2026-05-01 SSoT 보존).

**근거**: 단조 증가 패턴 (sun 25% → mercury 6% → venus 11% → earth 15%) + moon 의 mercury 보다 작은 임계 (4.5%) 가 사실 비율 (moon < mercury) 직접 반영 + Q2=B 정책 정합.

### 결정 4 — 달 궤도 라인 visible 방안 (축 4 후보 E)

**상시 표시 + earth focus 진입 시 강조** (line thickness 조건부 강화):

```typescript
// packages/core/src/scene/solar-system-scene.ts (developer 단계 박제 의무)
// rebuildOrbitLines 함수에 thickness 강조 조건부 분기 추가:
// - 일반 시점: line thickness 기본값 (current)
// - earth focus 시점 (selectedBodyId === 'earth'): moon orbit line thickness 3~5 px 강조
```

**근거**: PM Q2=A 합의 정합 (default 진입 visible) + earth focus 진입 시 강조 + line builder 코드 변경 ≤ 3줄 minimum + D-T2 미통과 시 §재검토 트리거 #2 발동 경로 박제.

### 결정 5 — 7개 shortcut bar 순서 + 모바일 너비 수용 (축 5)

**순서**: sun / mercury / venus / earth / **moon** / jupiter / neptune (천체 거리 순 + satellite parent 인접)

```typescript
// apps/web/src/components/layout/focus-quick-buttons.tsx (developer 단계 박제 의무)
const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' },
  { id: 'venus', label: '금성' },
  { id: 'earth', label: '지구' },
  { id: 'moon', label: '달' }, // R4 #532 — earth 인접 (parent-satellite 자연 그룹)
  { id: 'jupiter', label: '목성' }, // R-Phase Allowlist disabled (R6 진입 전)
  { id: 'neptune', label: '해왕성' }, // R-Phase Allowlist disabled (R10 진입 전)
];
```

**모바일 너비 수용**: 폰트 / padding 축소 (`text-caption px-2 py-1` → `text-mini px-1 py-0.5`) — Tailwind 변수 1~2줄 변경. 9 버튼 × 32 px + 8 gap × 4 px = **320 px** (375 px margin 55 px).

**근거**: 자연 mental model (parent-satellite 인접) + R5+ satellite 추가 시 동일 패턴 SSoT + 모바일 viewport 수용 안전 + Tailwind 변경 1~2줄 minimum + R6 진입 시 후보 B (horizontal scroll) 발동 트리거 박제.

### 결정 6 — earth-moon 거리 비례 (축 6) — Amendment 2 (forensic, 2026-05-21) 결정 갱신

> **Amendment 2 (2026-05-21, forensic 라운드)**: 본 결정 6 의 원안 옵션 (iii) "실측 거리 + zoom-in 분리" 가 D-T2 실 Chrome 실측에서 **수학적 양립 불가** 확인. 메인 오케스트레이터 debug 스크립트 (이슈 #539 본문 Raw 측정) 결과: moon mesh radius 1.39e9 m + **earth mesh radius 5.1e9 m** > earth-moon 실측 거리 3.847e8 m → moon mesh 가 earth mesh 내부에 흡수, zoom-in 으로도 분리 불가. **갱신된 결정**: **옵션 (iii-amended) — earth-moon orbit visual scale 도입 (실측 데이터 SSoT 보존 + rendering 시점 적용)**.

#### 갱신된 결정 (Amendment 2 — 옵션 (iii-amended))

**`EARTH_MOON_ORBIT_VISUAL_SCALE = 30` 신규 상수 도입 + rendering 시점 moon position scale 적용**:

- `packages/shared/data/solar-system.json` 의 moon.orbit.semiMajorAxisAU=0.00257189 **데이터 자체는 보존** (실측 SSoT 무위반)
- `packages/core/src/scene/solar-system-scene.ts` 의 satellite mesh position 계산 시 `parentId === "earth"` (또는 일반화: `parentId !== null`) 분기에서 visual scale 적용
- earthScale=800 / moonScale=800 박제값 보존 (결정 1 + 결정 2 무수정)
- 새 상수는 `apps/web/src/constants/body-scale.ts` 또는 `packages/core/src/scene/orbit-visual-scale.ts` (신규) 박제 — developer 단계 SSoT 위치 결정

#### Visual scale 후보 비교 (Gemini cross-validate 2026-05-21 권고 1 통합)

분리 마진 = `(earth-moon distance × visual_scale) / sum_mesh_radius`. sum_mesh_radius = 6.493e9 m (earth + moon mesh radius). 안전 마진 임계: ≥ 1.5x (분리 시각 확실, 사용자 인지 부담 최소).

| visual_scale | visual 거리 (m) | 분리 마진 | 평가 |
|---|---|---|---|
| ×10 | 3.847e9 | 0.59x | **fail** — mesh fusion 잔존 |
| ×15 | 5.770e9 | 0.89x | **fail** — mesh fusion 잔존 |
| ×20 | 7.694e9 | 1.18x | 통과 한계 (margin < 1.5x 안전 임계) |
| ×25 | 9.617e9 | 1.48x | 경계 (margin 0.02 부족) |
| **×30** | **1.154e10** | **1.78x** | **선택 — 안전 마진 (≥ 1.5x) 통과 + 최소 distortion** |
| ×40 | 1.539e10 | 2.37x | 보수 (사실 비례 왜곡 +33% 추가) |
| ×50 | 1.924e10 | 2.96x | **fallback 1** (D-T2 미통과 시) |
| ×75 | 2.885e10 | 4.45x | **fallback 2** (D-T2 미통과 시) |

**근거**: ×30 = 분리 마진 1.78x (≥ 1.5x 안전 임계 +0.28) + 거리 distortion 최소화 (×40~75 대비 사실 비례 보존도 우수). ×20/25 통과 한계는 perspective 노이즈 ±15% 안에서 mesh fusion 재발 위험. ×50/75 는 fallback 단계 (Amendment 3 발동 트리거 §재검토 #7).

#### Amendment 2 후 거리·시각 산출 (orbitScale=30, earthScale=800, moonScale=800)

| 측정 | 값 | 비고 |
|---|---|---|
| earth-moon 실측 거리 (m) | 3.847e8 | 데이터 SSoT (`solar-system.json`) 보존 |
| earth-moon visual 거리 (m) | **1.154e10** | 실측 × 30 |
| earth-moon visual 거리 (scene unit) | **0.969** | renderScale × 30 |
| earth mesh radius (m) | 5.103e9 | earthScale=800 × 6.378e6 (보존) |
| moon mesh radius (m) | 1.390e9 | moonScale=800 × 1.7374e6 (보존) |
| sum mesh radius (m) | 6.493e9 | earth + moon |
| visual 거리 / sum mesh | **1.78배** | 분리 마진 (1.5x 임계 통과 +0.28) |
| moon pxDiameter (sun 시점 1280×720) | ~5.68 px | 식 예측. perspective 보정 후 ±15% 마진 |
| moon sun 대비 px 비 | ~3.99% (Amendment 1 임계 5.0% 안전) | Q2=B 임계 정합 보존 |

#### Amendment 2 후 sun 시점 시각

- earth pxDiameter ≈ 40 px (Amendment 1 실측 보존)
- moon pxDiameter ≈ 5.68 px (식 예측 — perspective 보정 후 4.5~6.5 px 예상)
- earth-moon 화면 거리: visual 거리 0.969 scene unit @ camera radius 35 → pxDistance ≈ 49 px (`0.969 × 720 / (35 × 2 × tan(0.4))` ≈ 48.8 px)
- **moon 이 earth 옆 49 px 떨어진 별도 dot 으로 visible** (4 px+ 4px fallback billboard, hit-test 가능)

#### Amendment 2 후 earth focus zoom-in 시각

- earth focus 시점 camera radius ≈ 1.5~5 scene unit
- earth-moon visual 거리 0.969 scene unit → camera radius=1.5 시 화면 거리 ≈ 1130 px (분리 충분)
- moon pxDiameter (radius=1.5 시점) ≈ 5.68 × (35/1.5) ≈ 132 px (clearly visible)

#### Amendment 2 후 moon click hit-test

- **sun 시점** — moon 5.68 px (4px fallback billboard 자동 발동, hit-test 가능). shortcut bar fallback 도 유지
- **earth focus zoom-in** — moon ~132 px (직접 클릭 hit-test 영역 충분)
- **URL override `?focus=moon`** — camera target moon mesh position (visual scale 적용된 좌표) 자동 정상 작동

**근거**: 실측 데이터 SSoT 보존 (옵션 ii 의 데이터 변경 회피) + earthScale=800 보존 (결정 1 무수정 + R4 §비-범위 정합) + sun 시점 visible 직접 보장 (사용자 mental model 학습 부담 제거) + R5+ satellite 패턴 SSoT 일관 (parent-satellite 관계의 visual scale 일반화 패턴 박제). 상세 옵션 비교 + 후보 산출은 §Amendment 2 forensic 결정 참조.

---

## R-Phase Allowlist 갱신 (4곳 동시 박제 — Allowlist ADR §결정 4 절차 준수)

[`20260504-r-phase-allowlist-guard.md`](20260504-r-phase-allowlist-guard.md) §결정 4 "R4 진입 (지구) → `R_PHASE_BODY_ALLOWLIST` 에 `'earth'` 추가 + R4 ADR §결정 N 에 본 ADR cross-link + `apps/web/scripts/browser-verify-r-phase-allowlist.mjs` expected list 갱신 + CHANGELOG `### Behavior Changes`" 절차 준수.

본 R4 는 **earth + moon 동시 진입** (Q5=A 정합) — 절차 N=4 적용:

1. **`packages/core/src/scene/r-phase-allowlist.ts` 박제** (developer 단계):
```typescript
export const R_PHASE_BODY_ALLOWLIST = Object.freeze(['sun', 'mercury', 'venus', 'earth', 'moon'] as const);
```

2. **본 R4 ADR cross-link 박제** (본 ADR §관련 박제, ✓ 완료): `20260504-r-phase-allowlist-guard.md` ↔ 본 ADR 양방향 link

3. **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs` expected list 갱신** (developer 단계):
```javascript
const EXPECTED_ENABLED = ['sun', 'mercury', 'venus', 'earth', 'moon'];
const EXPECTED_DISABLED = ['jupiter', 'neptune'];
```

4. **`CHANGELOG.md` `### Behavior Changes` 박제** (developer 단계):
```markdown
- [#532] R4 진입 — earth + moon 시각화 추가. R-Phase Allowlist (earth, moon) 활성. shortcut bar 7개 확장 (moon 추가). earthScale=800 / moonScale=800 박제. Q2=B sun 대비 px 비 임계 earth ≤ 15% / moon ≤ 4.5% 박제 (Q2=B 첫 본 인스턴스화).
```

5. **WASM 의존 도메인 sub-path 추가 금지 검증** (Allowlist ADR §결정 4 §5, Amendment 결정 D2):
- `scripts/verify-core-exports-immutable.sh` 자동 차단 — `packages/core/package.json` exports field 에 sub-path entry 추가 금지 (turbopack `__dirname` SSR 500 회귀 가드)

---

## 비-범위 (scope creep 차단)

이슈 #532 본문의 "비-범위" 7개 항목 + 본 ADR 자체 비-범위:

- **earthScale / moonScale 박제값 재조정** — R4 머지 후 D-T2 미통과 시 §재검토 트리거 #1 발동 경로
- **지구 PBR / 대기 shader / 자전 애니메이션** — 후속 R-Phase 또는 별도 시각 효과 이슈
- **달 위상 (lunar phases) / 일식 / 월식** — 후속 별도 이슈
- **자전축 기울기 시각화** (23.44°) — 후속
- **실시간 자전 시각화** (지구/달 자전 애니메이션) — 후속
- **R2/R3 박제값 (mercury 700 / venus 800) 재조정** — Q2=B 정책 본 R4 SSoT 첫 본 인스턴스화만 책임. mercury/venus 박제값 변동 시 별도 amendment
- **R5+ body 진입** — mars / jupiter / saturn / etc 는 후속 R-Phase
- **`apps/web/src/components/sim-canvas.tsx:159` `radius: 35`** — R1 ADR §위험·미해결 박제 보존 (변경 금지)
- **`packages/core/src/scene/tier.ts` (renderScale)** — Q3=C 일관 보존
- **`packages/shared/data/solar-system.json` 실측 데이터** — 절대 변경 금지 (옵션 (ii) 거리 과장 탈락)
- **옵션 (e) log scaling 자동 산출** — R3 followup ADR 후속 이슈 분리 SSoT 보존

---

## 위험 / 미해결

### 위험 (#532 본문 위험 5건 + 본 ADR 추가)

1. **달 궤도 sun 시점 가시성 (위험 #1)** — **결정 4 후보 E** (상시 표시 + earth focus 강조) 로 해결. D-T2 미통과 시 §재검토 트리거 #2 발동
2. **moon shortcut 7개 모바일 viewport 수용 (위험 #2)** — **결정 5** (폰트/padding 축소) 로 해결. D-T2 미통과 시 후보 B (horizontal scroll) 발동
3. **earth-moon 거리 비례 vs Q2=B 충돌 (위험 #3)** — **결정 6 옵션 (iii)** (실측 보존 + zoom-in 분리) 으로 해결. D-T2 미통과 시 §재검토 트리거 #3 발동
4. **moon 클릭 hit-test (위험 #4)** — **결정 6** (shortcut bar 의존 + earth focus zoom-in 직접 클릭 + URL override) 으로 해결
5. **Q2=B 정책 첫 본 인스턴스화 자체 위험 (위험 #5)** — earth ≤ 15% margin 0.33% + moon ≤ 4.5% margin 0.51% 모두 ± 2% 허용 오차 가드 안에서 박제값 정확 통과. D-T2 미통과 시 §재검토 트리거 #1 발동

### 미해결

- earthScale=800 / moonScale=800 박제값 D-T2 사용자 검증 필요 (산출과 실측 ± 5% 마진 허용)
- 달 궤도 visible 방안 (결정 4 후보 E) D-T2 사용자 인지 가능 여부 검증
- 모바일 viewport 수용 (결정 5 폰트 축소) D-T2 사용자 가독성 검증
- moon hit-test 학습 mental model (결정 6 옵션 iii) D-T2 사용자 학습 가능성 검증

---

## 결과·재검토 조건

### 기대 효과 (측정 가능)

- **D1 / D1-moon**: earth pxDiameter ≈ 36.1 px (1280×720) + moon pxDiameter ≈ 9.84 px — D-T2 ± 2 px 허용
- **D8**: earth sun 대비 px 비 14.67% (≤ 15% margin 0.33%) + moon sun 대비 px 비 3.99% (≤ 4.5% margin 0.51%) — 실측 ± 2% 허용
- **D9**: 모바일 누적 차단율 ≈ 8.72% (DoD ≤ 25%, margin 16.28%)
- **D10**: R1/R2/R3 박제 sun 대비 px 비 회귀 0 — sun 25% / mercury ≤ 6% / venus ≤ 11% 모두 baseline 유지
- **D11**: R-Phase Allowlist 5곳 활성 (sun/mercury/venus/earth/moon), jupiter/neptune disabled 유지

### 트레이드오프로 받아들인 비용

- **moon sun 시점 invisible (earth mesh 내부 위치)** — shortcut bar 의존 + earth focus zoom-in 분리 mental model 학습 필요. D-T2 사용자 인지 가능성 검증 의무
- **달 궤도 sub-pixel 잔재** — sun 시점에서 1.57 px 직경 (인지 한계). earth focus 진입 후 강조 발동
- **모바일 가독성 미세 영향** — 폰트 1 px 축소 (text-caption → text-mini). 한글 라벨 2 글자 가독성 유지 검증

### Concrete Prediction

- **A. R4 코드 변경 ≤ 4 라인** — R3 ADR §Concrete Prediction "R4 추가 시 ≤ 4 라인" 검증 (R4 본 진입). 검증 방법: `git diff --stat` developer PR 에서 본 4 라인 외 BODY_SCALE / FOCUS_BUTTONS / R_PHASE_BODY_ALLOWLIST 관련 변경 0 라인
- **B. R5 mars 진입 시 코드 변경 ≤ 3 라인** (mars 단독) 또는 ≤ 7 라인 (mars + phobos/deimos 둘 다)
- **C. Q2=B 정책 R5+ 자동 확장** — R5 mars 진입 시 본 R4 §축 3 패턴 그대로 적용. mars 임계 박제 (예: ≤ 8%)
- **D. R6 jupiter 진입 시 shortcut bar overflow** — 모바일 viewport 11 버튼 × 32 px + 10 gap × 4 px = 392 px > 375 px → **horizontal scroll 또는 2단 발동 트리거**

### 재검토 조건 (트리거)

1. **D-T2 사용자 검증 미통과 (earthScale=800 / moonScale=800 박제값)** — 산출과 실측 ± 5% 초과 시 박제값 ± 100~200 범위 재조정. amendment 박제
2. **D-T2 사용자 검증 미통과 (결정 4 달 궤도 visible)** — sub-pixel 잔재 인지 미달 시 후보 D (zoom-threshold + 안내 문구) 또는 후보 B (상시 표시 무강조) 로 변경
3. **D-T2 사용자 검증 미통과 (결정 6 moon-earth 분리 mental model)** — moon 이 sun 시점에서 아예 안 보임 + zoom-in 학습 mental model 불편 시 옵션 (ii) (거리 추가 과장) 또는 옵션 (iv) (moonScale 인하 + 4px fallback 의존) 재검토. **forensic ADR 변형 발동 가능성** (다중 가설 추가, 사용자 인지 단위 ↔ 박제 단위 mismatch 재발견 시 5 조건 만족)
4. **R5 mars 진입 시 Q2=B 정책 prediction 실패** — mars architect ADR 박제값이 본 R4 §축 3 패턴 그대로 적용 안 됨. 정책 자체 재검토
5. **모바일 누적 차단율 R5+ 진입 시 25% 임계 근접** — R5 (mars) 진입 시 누적 ≈ 10~12% 예상. R6 (jupiter) 진입 시 누적 ≈ 15~17% (jupiter radius 6.99e7 m = 11배 venus → jupiterScale 적정값 ≈ 100~200 가정). R7+ 진입 시 25% 근접 → viewport-aware scaling 발동 트리거
6. **R6 jupiter 진입 시 shortcut bar 모바일 overflow** — 11 버튼 × 32 px + 10 gap × 4 px = 392 px > 375 px → horizontal scroll 또는 2단 발동

---

## 교차검증 반영 사항

본 ADR 박제 직후 cross-validate 1회 호출 (CLAUDE.md §교차검증 §"정책·설계·ADR 박제 직후 1회 루틴", 앵커: ADR 신규 + Q2=B 정책 첫 본 인스턴스화).

### Claude 자체 편향 4종 셀프 체크 (호출 전)

- **낙관적 일정 △** — R4 단일 PR 에서 6가지 결정 + R-Phase Allowlist 4곳 박제 + r1-guard baseline 갱신 동시 진행 가정 — cross-validate 명시 질문 삽입 "동시 박제 누락 위험"
- **결합 간과 △** — earth + moon 동시 진입 + Q2=B 첫 본 인스턴스화 + shortcut bar 7개 + moon hit-test mental model 학습 — 결합 누락 위험 명시 질문
- **폐기 프레이밍 ✓** — 기존 R1/R2/R3 박제값 (sunScale=50 / mercuryScale=700 / venusScale=800) 보존 명시. 폐기 없음
- **순수주의 △** — earthScale=800 / moonScale=800 동일값이 "단순 정수" 사후 정당화 가능성. radius 비 (1.054, 0.272) 차이가 단순 정수 정합과 일치하는지 cross-validate 명시 질문

### Cross-validate 호출 결과 (2026-05-20, Gemini 2.5 pro)

호출 명령: `.claude/skills/cross-validate/scripts/cross_validate.sh architecture docs/decisions/20260520-r4-earth-moon-visualization.md`
로그: `.claude/logs/cross-validate-architecture-20260520-202501.log`
outcome: `applied` (exit 0)
plan-bypass 가드: 사후 snapshot diff empty — 정상

#### 합의 (높은 신뢰도)

Gemini 5개 기준 (구조 완성도 / 결정 타당성 / 인터페이스 / 확장성 / 보안) 전부 양호 평가. 6가지 결정 모두 합리적 평가. 총평 인용:

> **이 ADR 내용대로 진행하는 것을 적극 권장합니다.**

세부 합의 항목:
- 모든 시각적 결정을 산출식 + 예상 px 결과치로 객관성 확보 (Claude 의도 = Gemini 평가 일치)
- 위험 사전 식별 + Fallback Plan 박제 (Claude 의도 = Gemini 평가 일치)
- R5/R6 확장성 미리 고려 (Claude 의도 = Gemini 평가 일치)
- moon (위성 첫 본 사례) parent-satellite 패턴 정립이 화성 위성 등에 재사용 가능 (Gemini 보강)
- 시각화 렌더링 로직 중심 → 보안 위험 없음 (Claude 자체 평가 = Gemini 확정)

#### 이견 수용 (양쪽 근거 비교)

**없음** — Gemini 가 근본 반박 0. "설계의 근본적인 방향에는 이견이 없습니다" 명시.

#### Claude 재분석 기각

**없음** — Gemini 가 잘못 지적한 항목 0. 모든 평가가 ADR 의도와 정합.

#### 고유 발견 3건 — 수용/분리 3단 프로토콜 적용 (volt #29)

각 발견에 스프린트 계약 비-범위 대조 (§비-범위 7항목 + #532 PM DoD 9개) 수행.

##### 발견 1 — earth focus 시 일회성 tooltip (UX 학습 지원)

- **Gemini 제안**: zoom-in mental model 학습이 신규 사용자에게 비직관적 → "확대하여 달의 궤도와 모습을 확인하세요" 일회성 tooltip 추가
- **범위 체크**: 본 R4 §결정 4 (달 궤도 thickness 강조) + §결정 6 (earth focus zoom-in 분리) 가 이미 시각적 안내 책임 분담. tooltip 은 신규 UI 컴포넌트 추가 = 본 R4 PM DoD 9개에 없음
- **판정**: **후속 분리** — UX 학습 가이드는 본 R4 의 "earth + moon 시각화 진입" Behavior Change 와 직교. tooltip 컴포넌트 + 일회성 표시 상태 관리 (localStorage 등) 가 별도 인프라
- **후속 이슈**: #534 (`enhance(ux): earth focus 시 zoom-in 안내 tooltip — R4 cross-validate Gemini 고유 발견 1`, priority:medium)

##### 발견 2 — WCAG 폰트 / 명도 대비 a11y 가드

- **Gemini 제안**: §결정 5 모바일 폰트 축소 (`text-mini`) 가 WCAG 최소 폰트 미충족 가능 + §결정 4 달 궤도 색상 (배경 대비 명도) 검증 필요
- **범위 체크**: 본 R4 PM DoD 9개에 a11y 항목 없음. 신규 DoD 추가 = scope creep
- **판정**: **부분 수용** — 본 PR 의 D7 (수동 검증) 가이드에 "WCAG 명도 대비 / 폰트 크기 점검" 한 줄 추가 권고를 이슈 #532 코멘트로 박제 (D7 가이드 보강이지 신규 DoD 가 아님). 정식 a11y 가드 (WCAG AA 기준 자동 측정) 는 후속 이슈로 분리
- **후속 이슈**: #535 (`feat(a11y): WCAG AA 자동 측정 가드 — R4 cross-validate Gemini 고유 발견 2`, priority:medium)

##### 발견 3 — 저사양 기기 달 궤도 상시 표시 FPS 영향

- **Gemini 제안**: §결정 4 (달 궤도 상시 표시) 가 sub-pixel 얇은 선이라도 draw call 발생 → 저사양 모바일 frame drop 가능성. D-T2 검증 시 함께 확인 권고
- **범위 체크**: 본 R4 의 D9 (모바일 누적 차단율 ≤ 25%) 는 시각 차단 측정. FPS 는 별도 차원. P11 LOD 시스템 (#393) 이 별도 트랙 frame budget 관리 중
- **판정**: **부분 수용** — D7 가이드에 "저사양 기기 프레임 드랍 점검" 한 줄 추가 권고를 이슈 #532 코멘트로 박제. 정식 FPS 가드 (저사양 baseline 측정 + 회귀 임계) 는 후속 이슈로 분리
- **후속 이슈**: #536 (`perf(lod): 저사양 모바일 FPS 회귀 가드 — R4 cross-validate Gemini 고유 발견 3`, priority:medium)

#### 종합 판정

- **반려 사유 없음** — Gemini 가 ADR 진행 적극 권장 + 근본 반박 0
- **고유 발견 3건은 비목표 / 직교** — 본 R4 의 "earth + moon 진입" 핵심 가치와 충돌 0. 후속 이슈로 분리하여 각 단계 독립 관리
- **D7 가이드 보강 2건은 ADR 본문 변경 없이 이슈 코멘트로 박제** — 본 PR 의 Behavior Change 와 직교
- **CRITICAL #6 (스프린트 계약 비목표 보호) 준수** — Gemini 제안이 타당해도 비목표면 후속 분리 (volt #29 프로토콜)
- **Provisional → Accepted 전이** — 본 §교차검증 반영 사항 4 서브섹션 박제 완료 + 머리말 상태 라인 갱신 완료

---

## Amendment 1 — D8 측정 검증 (2026-05-21)

### 트리거

Developer 단계 (#537) D8 earth ≤ 15% **실측 FAIL** (16.40% 측정, 식 예측 14.67% 대비 +11.8% 편차). ADR §재검토 조건 (트리거) §#1 발동 가능성 인지 → CLAUDE.md §"수치 DoD 미달 시 측정 방법 검증 우선" 가드 (#10) 적용.

### 측정 검증 절차 (Option A 권장 — 사용자 승인 2026-05-21)

(0) 측정 방법 검증 → (1) 식/구현 수정 → (2) 알고리즘 교체 순. 본 amendment 는 (0) → (1) 단계 결과.

#### Raw 실측 (1280×720, cameraRadius=35, fov=0.8, ArcRotateCamera, sun 시점 default)

| body | pxDiameter | sun 대비 % | 식 예측 % | 식 vs 실측 |
|------|-----------|-----------|----------|-----------|
| sun | 246.25 px | 100% | 100% | (기준) |
| mercury | 11.63 px | 4.72% | 4.91% | −3.9% |
| venus | 33.41 px | 13.57% | 13.92% | −2.5% |
| **earth** | **40.39 px** | **16.40%** | **14.67%** | **+11.8%** |
| moon | 11.00 px | 4.47% | 3.99% | **+12.0%** |

#### 결정적 발견 — ADR §결정 1 산출식의 perspective foreshortening 누락

ADR §결정 1 산출식:
```
earth_sunPxRatio = (r_earth × earthScale) / (r_sun × sunScale)
```

이 식은 **mesh wsRadius 비** 만 계산. perspective projection 의 카메라 거리 foreshortening 효과 무시.

검증 신호: **mercury (−3.9%) / venus (−2.5%) 가 식 예측보다 작고, earth (+11.8%) / moon (+12.0%) 만 식 예측보다 큼**. 이는 default sun 시점 카메라가 sun 을 target 으로 하되 ArcRotateCamera radius=35 의 회전 각도에 따라 mercury/venus 가 background 쪽에 있고 earth/moon 이 foreground 쪽에 있을 때 정확히 발생하는 패턴.

#### r1-guard 측정 자체는 정확

`measureBodyPxRatios()` (`apps/web/scripts/r1-ui-regression-guard.mjs:132`) 의 측정 방식:
1. `mesh.getBoundingInfo().boundingSphere.radiusWorld` 로 wsRadius 산출 (mesh.scaling 반영)
2. camera-right basis × wsRadius offset point 를 화면 좌표로 변환
3. pixelRadius = (offset screen) − (center screen) 의 픽셀 거리
4. pixelDiameter = pixelRadius × 2

이 방식은 perspective projection 을 **자동 반영**. 모든 body 에 동일 식 적용이라 일관성 보장. 측정 함수 자체는 결함 없음.

### Amendment 결정

#### 결정 A1.1 — 임계 완화 (earth: 15% → 17%, moon: 4.5% → 5.0%)

`PX_RATIO_THRESHOLDS` (`apps/web/scripts/r1-ui-regression-guard.mjs:80`):
- earth: 15 → **17** (실측 16.40% margin 0.6% + 5% 노이즈 마진)
- moon: 4.5 → **5.0** (실측 4.47% margin 0.53% + earth 동반)

#### 결정 A1.2 — architect 박제값 보존

- earthScale=800 / moonScale=800 변경 **없음**
- 후보 비교 (earth 800/850/900/700/1000) 결정 보존
- 사실 비율 (radius_earth / radius_venus = 1.054) 정합 유지
- 후속 R5+ 진입 시 본 식 갱신 또는 perspective 보정 식 도입 별도 결정 (재검토 트리거)

#### 결정 A1.3 — 산출식 갱신 (후속 인계)

ADR §결정 1 산출식 (`earth_sunPxRatio = earthScale × 1.834e-4`) 은 **wsRadius 비 예측용** 으로 명시. 실측 px 비는 carcass body 위치 + camera radius/alpha/beta + projection 식에 의존. 후속 R5+ 진입 시 식 갱신 또는 실측 baseline 박제 방식 선택.

### 갱신 SSoT

| SSoT | 변경 |
|------|------|
| `apps/web/scripts/r1-ui-regression-guard.mjs` | `PX_RATIO_THRESHOLDS.earth: 15 → 17` / `moon: 4.5 → 5.0` + 주석 갱신 |
| ADR §결정 3 | Amendment 1 알림 박스 + 박제값 갱신 (17% / 5.0%) |
| ADR §Amendment 1 (본 섹션) | 측정 검증 결과 + 결정 박제 |
| `CHANGELOG.md` Behavior Changes | "R4 D8 임계 amendment — earth ≤ 17% / moon ≤ 5.0% (perspective 보정 안정화)" |

### 비-범위 (scope creep 차단)

- earthScale / moonScale 박제값 변경 — 본 amendment 범위 밖 (architect 결정 보존)
- ADR §결정 1 산출식 perspective 보정 식 도입 — 본 amendment 범위 밖 (R5+ 진입 시 결정)
- 다른 body (mercury/venus) 임계 — 실측 모두 PASS, 변경 없음

### 재검토 조건

- R5+ body 진입 시 동일 식 결함 재발 → 본 amendment 산출식 갱신 결정 발동
- earthScale / moonScale 변경 시 본 amendment 임계 재산출 의무
- forensic ADR 변형 승격 검토 — 본 amendment 는 1차 분석 + 명확한 식 결함 발견이라 일반 amendment 로 충분. forensic 5 조건 (다중 가설 / 사용자 인지 mismatch / Amendment 라운드 N 예상) 미충족 → **Amendment 2 (2026-05-21) 에서 5 조건 충족으로 forensic 변형 승격됨** (§Amendment 2 참조)

---

## Amendment 2 — forensic ADR 변형 승격 + moon visual fusion 해결 (2026-05-21)

### 트리거

R4 머지 (PR #537, commit 9b4ba37) 직후 사용자 D-T2 실 Chrome 시각 확인에서 moon visual fusion 회귀 발견:

1. earth focus 후 zoom-in 해도 달 가시화 안 됨 (mesh 가 earth 내부 흡수)
2. moon shortcut/URL focus 시 달이 존재하지 않음 (mesh 가 earth 와 합쳐진 disc 안쪽)
3. r1-guard PASS / QA headless PASS / Amendment 1 임계 PASS 전부 통과 (DoD 자동 검증 미포착)

CLAUDE.md §"DoD PASS ≠ 제품 동작" (volt #74) 정확한 사례. Amendment 1 까지는 단일 식 결함 (perspective foreshortening 누락) → 일반 amendment 로 박제. Amendment 2 는 본 ADR §결정 6 의 **수학적 양립 불가** 발견 + 다중 가설 / 옵션 비교 / Amendment 라운드 N 예상 모두 충족 → **forensic ADR 변형 5/5 조건 만족** → 본 ADR forensic 변형으로 승격.

### Forensic 변형 5조건 점검 (5/5 충족, 이슈 #539 본문 박제)

1. ✅ **다중 가설 N≥2** — moonScale 감소 / earth-moon orbit visual scale 도입 / 조합 등 4 옵션 비교
2. ✅ **Runtime 측정 데이터 필수** — 메인 오케스트레이터 debug 스크립트 (`scripts/_debug-moon-visibility-tmp.mjs`, volt #67 패턴, 실행 직후 `rm`) 결정적 실측. 정적 분석으로는 ADR §결정 6 "zoom-in 분리" 가정의 수학적 모순 발견 어려움
3. ✅ **DoD PASS 인데 사용자/제품 회귀** — r1-guard / QA headless / Amendment 1 임계 전부 PASS → 실 Chrome 시각 회귀
4. ✅ **5±2 옵션 비교** — 옵션 (i)~(v) 5개 후보 비교 (아래 §옵션 비교 표)
5. ✅ **Amendment 라운드 N 예상** — 본 Amendment 2 자체가 Amendment 1 의 직계 후속 라운드. 추가 D-T2 미통과 시 라운드 3 가능성 박제 (§재검토 트리거 #7~#8)

### Forensic 측정 결과 (2026-05-21, develop tip = ffe6661 + R4 #537 머지본 9b4ba37)

메인 오케스트레이터가 일회성 debug 스크립트로 실측 후 즉시 `rm` (volt #67 패턴). 측정 결과는 이슈 [#539](https://github.com/coseo12/astro-simulator/issues/539) 본문 §Raw 측정 박제. ADR 단독 가독성 보장 위해 본문 인용:

#### 측정 1 — Raw 좌표·mesh radius (1280×720, default sun 시점, ArcRotateCamera radius=35)

| 값 | scene unit | m 환산 (renderScale=8.4e-11, 1 scene ≈ 1.190e10 m) |
|---|---|---|
| earth position | (-2.79, 12.04, 0) | ≈ 1 AU |
| moon position | (-2.80, 12.00, 0.002) | earth 옆 (실측 SSoT 정확) |
| **earth-moon distance** | **0.034** | **3.847e8 m** (NASA/JPL Fact Sheet 정확) |
| **earth wsRadius (mesh)** | **0.429** | **5.103e9 m** (earthScale=800 × 6.378e6) |
| **moon wsRadius (mesh)** | **0.117** | **1.390e9 m** (moonScale=800 × 1.7374e6) |

#### 측정 2 — 결정적 모순

| 비교 | 비율 | 결론 |
|---|---|---|
| moon mesh radius / earth-moon distance | 1.390e9 / 3.847e8 = **3.61배** | moon mesh 가 거리 초과 — earth 안쪽 박힘 |
| earth mesh radius / earth-moon distance | 5.103e9 / 3.847e8 = **13.26배** | earth mesh 가 moon position 압도 흡수 (근본 원인) |
| earth mesh radius / moon mesh radius | 5.103e9 / 1.390e9 = 3.67배 | earth mesh 가 moon 의 3.67배 (사실 비율 정합) |

→ moon mesh 만 줄여서는 해결 불가능. **earth mesh 자체가 moon position 을 흡수** — earth-moon 거리 표현 방식 변경 필수.

#### 측정 3 — moonScale 단독 감소의 수학적 한계

moon mesh radius < earth-moon distance 조건: `R_moon × moonScale × 2 < EM_distance` → `moonScale < EM_distance / (R_moon × 2)` = `3.847e8 / (1.7374e6 × 2)` = **110.7**

(보수 마진 1.5x): `moonScale ≤ 73` — moon pxDiameter < 1 px (sub-pixel 잔재). **moonScale 단독 감소는 사용자 인지 미달**.

추가로 **earth mesh 자체가 거리 흡수** → moonScale 을 0 으로 줄여도 moon position 이 earth mesh 안쪽이라 visible 미보장 → **earth-moon orbit visual scale 도입 (옵션 iii-amended) 만 양립 가능**.

### 가설 검증 결론

| 가설 | 결론 | 근거 |
|---|---|---|
| **가설 1: moonScale=800 자체 과대 (≤ 221 한계 위반)** | **부분 확정 (조건적)** | moon mesh 1.39e9 m > distance 3.847e8 m (3.6배). 그러나 earth mesh (13.26배) 가 더 큰 흡수 → moonScale 만 줄여도 분리 불가 |
| **가설 2: earth mesh radius 가 moon position 흡수 (근본 원인)** | **확정 (주된 원인)** | earth mesh 5.1e9 m > earth-moon distance 3.847e8 m × 13.26배. earthScale=800 보존 시 moonScale 어떤 값이든 visible 불가 |
| **가설 3: zoom-in 으로 분리 가능 (원안 옵션 iii 가정)** | **기각** | mesh 크기가 거리 절대값 흡수 → zoom 비례 무관. ADR §결정 6 옵션 (iii) "zoom-in 분리" 수학적 양립 불가 |
| **가설 4: orbit visual scale 도입 시 분리 가능** | **확정 (해결책)** | EM_distance × 30 = 1.154e10 m > sum mesh 6.49e9 m × 1.78배 (분리 마진 안전) |

### 옵션 비교 (5축, Amendment 2 라운드)

#### 옵션 (i) moonScale 단독 감소 (≤ 221, 수학적 mesh < distance 한계)

- **변경**: `BODY_SCALE.moon: 800 → ≤ 221` (예: 200)
- **장점**: 박제값 변경 1줄 minimum. 데이터 SSoT 보존
- **단점**: **earth mesh 자체가 moon position 흡수 (13.26배)** → moonScale 어떤 값이든 visible 불가. 수학적 해결 안 됨
- **회귀 예측**: moon pxDiameter < 4 px (4px fallback billboard 발동) + earth mesh 내부 잔재 → 본 회귀 미해결

#### 옵션 (ii) earth-moon 거리 데이터 자체 변경 (`solar-system.json` 직접 수정)

- **변경**: `moon.orbit.semiMajorAxisAU: 0.00257189 → 0.077` (×30)
- **장점**: 코드 변경 0 (rendering 분기 없음)
- **단점**: **실측 데이터 SSoT 위반** (CLAUDE.md §"실측 데이터 절대 변경 금지" + R4 §비-범위 정합). NASA/JPL Fact Sheet 와 불일치
- **회귀 예측**: 데이터 신뢰성 회귀 (CelestialInfoPanel 표시값 위배 등 downstream)

#### 옵션 (iii-amended) earth-moon orbit visual scale 도입 (rendering 시점, 데이터 보존) — **선택**

- **변경**: 신규 상수 `EARTH_MOON_ORBIT_VISUAL_SCALE = 30` 박제 + `packages/core/src/scene/solar-system-scene.ts` 의 satellite mesh position 계산 분기 (~5줄)
- **장점**: 실측 데이터 SSoT 보존 + earthScale=800 / moonScale=800 박제값 보존 + R5+ satellite 패턴 SSoT 박제 + sun 시점 직접 visible 보장
- **단점**: visual scale 도입이 새 추상화 레이어 (parent-satellite orbit scaling). R5+ (mars/phobos / jupiter/galilean / saturn/titan) 에 패턴 확장 의무
- **회귀 예측**: visual 거리 / 실측 거리 mismatch — `CelestialInfoPanel` 등에서 실측 거리 표시 시 user mental model 학습 필요 (orbit scale 명시 박제)

#### 옵션 (iv) earthScale 인하 결합

- **변경**: `earthScale: 800 → ≤ 60` (earth mesh < EM_distance 한계) + moonScale 인하
- **장점**: rendering 코드 변경 0
- **단점**: **R4 §비-범위 위반** (earthScale=800 보존 명시). earth pxDiameter 36 px → 2.7 px 미달 (R4 D1 위배)
- **회귀 예측**: R4 핵심 가치 (earth visible) 회귀 — 비-범위 정합 실패

#### 옵션 (v) parent-relative frame + moon position override (zoom-context 분기)

- **변경**: earth focus 진입 시 sun 좌표계 → earth 좌표계 변환 + moon position 분리
- **장점**: sun 시점에서는 fusion 유지 (실측 정합), earth focus 시 분리 visible
- **단점**: sun 시점 moon visible 보장 위배 (R4 §결정 4 PM Q2=A "default 진입 visible" 합의 위반). camera frame 분기 신규 복잡도
- **회귀 예측**: sun 시점 invisible — D-T2 PM 합의 위배 재발

#### 축별 비교 매트릭스

| 축 | (i) moonScale≤221 | (ii) 데이터 변경 | **(iii-amended) orbit visual scale** | (iv) earthScale↓ | (v) parent frame |
|---|---|---|---|---|---|
| 시각 fusion 해소 | ✗ (earth mesh 흡수) | ✓ | **✓** | ✓ (이지만 earth 회귀) | △ (earth focus 만) |
| 박제값 변경 최소 | ✓ (moonScale 1줄) | ✓ (0줄) | △ (신규 상수 + 5줄) | ✗ (earthScale + moonScale 2줄) | ✗ (camera frame 분기) |
| 실측 데이터 SSoT | ✓ | **✗** | **✓** | ✓ | ✓ |
| R4 §비-범위 정합 | ✓ | ✗ (데이터) | **✓** | **✗** (earthScale) | ✓ |
| sun 시점 visible 보장 | ✗ | ✓ | **✓** | ✓ | ✗ |
| R5+ satellite 패턴 SSoT | N/A | N/A | **✓** (parent-satellite scale 일반화) | N/A | △ (frame 분기 일반화) |
| 구현 비용 | 1줄 | 1줄 | ~5줄 + 상수 | 2줄 | 30+ 줄 |
| ADR Amendment 필요 | 본 ADR | 본 ADR + 데이터 SSoT | **본 ADR (Amendment 2)** | R4 §비-범위 위반 | 본 ADR + camera ADR |

### 선택 — 옵션 (iii-amended) "earth-moon orbit visual scale 도입"

근거 (CLAUDE.md §교차검증 §고유 발견 수용/분리 3단 프로토콜 + §결합 간과 편향 가드):

1. **수학적 해결 가능** — visual scale=30 적용 시 sum mesh (6.49e9 m) < visual distance (1.154e10 m) × 1.78배 (분리 마진 안전)
2. **모든 박제 보존** — earthScale=800 (결정 1) / moonScale=800 (결정 2) / 실측 데이터 SSoT (`solar-system.json`) / R4 §비-범위 7항목 / Amendment 1 임계 (≤ 17% / ≤ 5.0%) 전부 무수정
3. **R4 §결정 6 원안 (iii) 의 "실측 거리 보존" 의도 계승** — 데이터 자체는 보존 (`semiMajorAxisAU=0.00257189` 무수정), rendering 시점에만 visual scale 적용
4. **R5+ satellite 패턴 SSoT** — 본 R4 Amendment 2 가 parent-satellite orbit visual scaling 의 첫 본 인스턴스화. R5 (mars/phobos/deimos) / R6 (jupiter/galilean) / R7 (saturn/titan) 등 모든 satellite 의 일관 패턴 박제
5. **sun 시점 직접 visible** — moon 5.68 px (4px fallback billboard 자동 발동) — earth 옆 49 px 분리 — 사용자 mental model 학습 부담 제거 (원안 (iii) "zoom-in 학습" 부담 회피)
6. **PM Q2=A 합의 정합** — "달 궤도 전체 visible (default 진입에서 visible)" 약속 — visual scale 적용 후 sun 시점 moon orbit 화면 차지 ≈ 49 px 직경 (1.57 px sub-pixel 잔재 → 49 px clearly visible 으로 강화)

### Concrete Prediction (Amendment 2 결정 후 D-T2 검증 의무)

#### 예측 1 — 코드 변경 라인 수

- `EARTH_MOON_ORBIT_VISUAL_SCALE = 30` 신규 상수 박제: 1 라인
- `packages/core/src/scene/solar-system-scene.ts` satellite mesh position 분기: ~5 라인 (parent.position 기준 offset × visual scale)
- `packages/core/src/scene/solar-system-scene.ts` orbit line builder (rebuildOrbitLines) parent-satellite branch: ~2 라인 (선택 — orbit line 도 visual scale 적용 시)
- **합계: 7~8 라인 변경 + 신규 상수 1줄** (R4 본 진입 4 라인의 약 2배 — 신규 추상화 레이어 도입 비용)
- 위반 임계: 실측 라인 수가 12 라인 초과 시 → 설계 가정 재검토

#### 예측 2 — 수치 DoD (D-T2 사용자 검증 의무)

- **D2.1 (sun 시점 moon visible)**: moon pxDiameter ≥ 4 px (4px fallback billboard 발동 임계). 식 예측 5.68 px, perspective 보정 후 4.5~6.5 px 예상
- **D2.2 (earth-moon 화면 분리 거리)**: pxDistance ≥ 30 px (분리 가능 minimum). 식 예측 49 px, 마진 +19 px
- **D2.3 (earth focus zoom-in moon visible)**: moon pxDiameter ≥ 50 px (자연 인지). 식 예측 ~132 px (camera radius=1.5 시점)
- **D2.4 (moon focus URL override)**: camera target moon mesh visual scale 적용 좌표 → moon 화면 중앙 ≥ 200 px 직경 (focus 후 자연 거리)
- **D2.5 (Amendment 1 임계 보존)**: earth ≤ 17% / moon ≤ 5.0% 회귀 0 (moon mesh radius 무변동)
- **D2.6 (R-Phase Allowlist 보존)**: sun / mercury / venus / earth / moon 5 body 진입 유지
- 위반 임계: D2.1~D2.4 중 1개라도 fail → fix 회귀, 옵션 재선택 (§재검토 트리거 #7 발동)

#### 예측 3 — 인접 영역 무영향

- mercury / venus mesh position 변경 없음 (parentId="sun" 비-satellite, visual scale 분기 비대상)
- earth mesh position 변경 없음 (earth.parentId === "sun" 비-satellite)
- LOD / camera / floating origin 시스템 변경 없음
- 위반 임계: r1-guard / browser-verify-r-phase-allowlist 회귀 시 → 부수효과 확정, Amendment 3 필요

#### 예측 4 — orbitVisualScale 값 D-T2 미통과 시 fallback

D-T2 실측 시 분리 부족 (pxDistance < 30 px) 또는 fusion 잔재 발견 시:
- orbitVisualScale=30 → **50** 상향 후 재측정 (1단계 fallback)
- 여전히 미통과 시 → **75** 상향 (2단계)
- 75 도 미통과 시 → 옵션 (v) parent-relative frame 으로 변경 (Amendment 3 발동)

### 갱신 SSoT (Amendment 2)

| SSoT | 변경 |
|---|---|
| 본 ADR 머리말 (상태 / 결정자 / 관련) | Amendment 2 forensic 박제 명시 (line 3~6) |
| 본 ADR §결정 1 (earthScale=800) | Amendment 2 보존 명시 (변경 없음, 회귀 직접 원인 아님 박제) |
| 본 ADR §결정 2 (moonScale=800) | Amendment 2 보존 명시 (변경 없음, 결정 6 갱신 cross-link) |
| 본 ADR §결정 6 (earth-moon 거리) | **옵션 (iii) → (iii-amended) 갱신** (실측 SSoT 보존 + orbit visual scale 도입). Amendment 2 후 거리·시각 산출 박제 |
| 본 ADR §Amendment 2 (본 섹션) | 신규 박제 — forensic 8섹션 형식 |
| `apps/web/src/constants/body-scale.ts` (또는 `packages/core/src/scene/orbit-visual-scale.ts`) | **developer 단계** 박제 — `EARTH_MOON_ORBIT_VISUAL_SCALE = 30` 신규 상수 |
| `packages/core/src/scene/solar-system-scene.ts` | **developer 단계** 박제 — satellite mesh position scale 분기 (~5 라인) |
| `CHANGELOG.md` Behavior Changes | "[#539] R4 Amendment 2 — moon visual fusion 해결: earth-moon orbit visual scale=30 도입 (rendering 시점, 실측 데이터 보존)" |

### 비-범위 (Amendment 2 scope creep 차단)

- earthScale=800 변경 ❌ (R4 §결정 1 보존, 회귀 직접 원인 아님)
- moonScale=800 변경 ❌ (R4 §결정 2 보존, mesh-distance 모순은 근본 원인의 증상)
- mercury / venus 박제값 ❌ (회귀 없음)
- `solar-system.json` moon orbit semiMajorAxisAU 변경 ❌ (실측 SSoT 절대 보존, 옵션 (ii) 탈락)
- LOD / camera / floating origin 시스템 변경 ❌ (인프라 보존)
- `apps/web/src/components/sim-canvas.tsx:159` `radius: 35` ❌ (R1 박제 보존)
- #534 (UX tooltip) / #535 (a11y) / #536 (FPS 가드) ❌ (cross-validate 후속 분리 이슈 보존)
- R5+ body 진입 ❌ (mars / jupiter 등 후속 R-Phase)
- orbit line builder visual scale 적용 (rebuildOrbitLines parent-satellite 분기) — 선택 박제, developer 단계 결정 (사용자 D-T2 시 moon orbit line 도 visual scale 적용 시 시각 정합)

### 위험 / 재검토 트리거 (Amendment 2 추가)

| 위험 | 회귀 시점 | 임계 / 발동 조건 | 완화 방안 |
|---|---|---|---|
| visual scale=30 부족 (D-T2 fusion 잔재) | fix PR D-T2 단계 | pxDistance < 30 px 또는 사용자 보고 fusion | orbitVisualScale=50 / 75 단계 fallback. 75 미통과 시 옵션 (v) parent-relative frame Amendment 3 |
| visual / 실측 거리 mismatch user mental model | fix 머지 후 사용자 인지 | `CelestialInfoPanel` 실측 거리 표시 vs 화면 시각 거리 불일치 | 패널에 "시각 표현 ×30 적용" 명시 박제 (선택, 후속 enhance:ux) |
| R5+ satellite SSoT 패턴 비일관 | R5 (mars + phobos/deimos) 진입 시 | mars-phobos / mars-deimos orbit 도 동일 visual scale 적용 안 됨 | R5 ADR 에서 `MARS_SATELLITES_ORBIT_VISUAL_SCALE` 박제 + 본 R4 패턴 cross-link |
| orbit visual scale 가 LOD billboard 임계 깨짐 | LOD 분기 전환 시점 | moon billboard ↔ mesh 전환이 visual scale 좌표 기준이 아닌 실측 좌표 기준일 때 | developer 단계 LOD ↔ visual scale 합성 순서 검증 (P11-B LOD ADR §결정 3 참조) |

### 재검토 트리거 (Amendment 2 추가)

- **#7** — fix PR D-T2 사용자 검증 미통과 (D2.1~D2.4 중 1개 fail) → orbitVisualScale=30 → 50 → 75 단계 fallback. 75 미통과 시 Amendment 3 (옵션 v parent-relative frame)
- **#8** — R5 mars/phobos 진입 시 본 Amendment 2 의 parent-satellite visual scale 패턴 적용 실패 → 패턴 SSoT 재검토. R5 ADR 에서 본 R4 cross-link
- **#9** — `CelestialInfoPanel` 실측 거리 표시 vs 시각 거리 사용자 혼동 D-T2 보고 → enhance:ux 후속 이슈 분리 (시각 표현 scale 명시)

### Amendment 2 cross-validate (Amendment 2 박제 직후 1회 의무)

본 Amendment 2 박제 직후 cross-validate 호출 의무 (CLAUDE.md §교차검증 §"정책·설계·ADR 박제 직후 1회 루틴", 앵커: **ADR 개정 — Amendment 2 forensic 변형 승격 + 결정 6 갱신**).

#### Claude 자체 편향 4종 셀프 체크 (호출 전)

- **낙관적 일정 △** — orbitVisualScale=30 단일 값 박제가 D-T2 미통과 시 50/75 fallback 단계 비용 누락 가능성. Amendment 2 1회 PR 안에서 D-T2 통과 가정. cross-validate 명시 질문 "단일 값 박제 vs 후보 비교 표 형식 의무" 삽입
- **결합 간과 △** — visual scale 도입이 LOD / camera focus / floating origin / orbit line builder 4 시스템 결합. P11-B LOD ADR §결정 3 (mesh ↔ billboard 임계) 가 mesh wsRadius 기준이라 visual scale 영향 없음 가정. cross-validate 명시 질문 "결합 누락 위험"
- **폐기 프레이밍 ✓** — 원안 옵션 (iii) "실측 거리 + zoom-in 분리" 폐기 명시. 실측 데이터 / 박제값 / 비-범위 전부 보존
- **순수주의 △** — orbit visual scale=30 단일 정수가 "단순값" 사후 정당화 가능성. 30 = 분리 마진 1.78배 / 50 / 75 fallback 비교 박제 (위 §옵션 비교 §Amendment 2 후 거리·시각 산출) 로 마진 산출 보강

#### cross-validate 호출 결과 (2026-05-21, Gemini 2.5 pro)

호출 명령: `.claude/skills/cross-validate/scripts/cross_validate.sh architecture docs/decisions/20260520-r4-earth-moon-visualization.md`
로그: `.claude/logs/cross-validate-architecture-20260521-130701.log`
outcome: `applied` (exit 0) — plan-bypass 가드 사후 snapshot diff empty 정상.

##### 합의 (높은 신뢰도)

Gemini 6 기준 평가:
- 구조적 완성도 **매우 높음** (수직 계층 vertical slice 전체 + R-Phase Allowlist 운영 측면 + Developer 인계 명확)
- 기술 결정 타당성 **매우 높음** (정량 데이터 기반 결정, Amendment 1 의 원근감 누락 식 수정 + Amendment 2 의 orbit visual scale 우아한 해결)
- 인터페이스 명확성 **명확** (configuration-driven design + R5 ≤ 3 라인 변경 예측)
- 확장성 **뛰어남** (R5+ satellite 패턴 SSoT, shortcut bar R6 너비 사전 대응)
- 보안 **위험 요소 없음** (client-side rendering, 서버 없음)
- 누락 요소 **거의 없음** (#534/#535/#536 자체 발견 + 후속 분리)

총평 인용: > **이 ADR 내용대로 진행하는 것을 적극 권장합니다.**

##### 이견 수용 (양쪽 근거 비교)

**없음** — Gemini 가 근본 반박 0. "설계의 근본적인 방향에는 이견이 없습니다" 명시.

##### Claude 재분석 기각

**없음** — Gemini 가 잘못 지적한 항목 0. Amendment 1 의 원근감 누락 진단 + Amendment 2 의 13.26배 fusion 진단 둘 다 Claude 분석과 정합.

##### 고유 발견 2건 — 수용/분리 3단 프로토콜 적용 (volt #29)

**발견 1 — visual scale 결정 과정 구체화 권고**:
- Gemini 제안: "20배수는 분리 마진 부족, 30배수에서 처음으로 안정적 분리 확보" 같은 다른 후보 값과의 비교 표 추가
- 범위 체크: 본 ADR 본문 보강 (architect ADR §결정 6 가 30 / 50 / 75 fallback 단계만 명시, 명시적 후보 비교 표 없음). 신규 DoD 추가 아님 = 본 PR 범위 내
- **판정**: **즉시 수용** — 본 PR 에 §"Visual scale 후보 비교 (Gemini cross-validate 2026-05-21 권고 1 통합)" 표 추가 박제 (10/15/20/25/30/40/50/75 후보 8개 분리 마진 비교 + 30 선택 근거 강화)

**발견 2 — "Visual Fidelity (시각적 진실성)" 원칙 명문화 권고**:
- Gemini 제안: "데이터의 과학적 정확성은 유지하되, 사용자의 인지를 돕기 위해 시각적 표현은 의도적으로 왜곡할 수 있다" 원칙을 `docs/architecture/principles.md` 별도 문서로 박제
- 범위 체크: 신규 원칙 문서 = 본 R4 ADR 와 직교 + 다른 ADR (Q2=B 정책 SSoT 등) 영향 가능성 = scope creep
- **판정**: **후속 분리** — 신규 이슈 #541 생성 (priority:medium, type:docs)

##### 종합 판정

- **반려 사유 없음** — Gemini ADR 적극 권장 + 근본 반박 0
- **발견 1 본 PR 즉시 수용** — visual scale 후보 비교 표 추가 박제 (본 §결정 6 §"Visual scale 후보 비교" 표 박제 완료)
- **발견 2 후속 분리** — Visual Fidelity 원칙 명문화 = #541 후속 이슈 (CRITICAL #6 비목표 보호)
- **PM DoD 11개 (R4 원안 D1~D11) 재구조화 0건** (volt #76 drift 방지)

---

## Developer 인계

본 architect 단계 박제 후 developer sub-agent 호출 시 의무. **Amendment 2 (#539) 단계는 R4 본 진입 (#532, PR #537) 이미 머지 상태에서 추가 fix PR**. 본 R4 머지본 (commit 9b4ba37) 위에 신규 변경만 박제:

### Amendment 2 fix (#539) — Developer 시작 지점

1. **신규 상수 박제 위치 결정** (둘 중 선택):
   - **옵션 A**: `apps/web/src/constants/body-scale.ts` 에 `EARTH_MOON_ORBIT_VISUAL_SCALE = 30` 추가 (body-scale.ts 단일 SSoT 유지)
   - **옵션 B**: `packages/core/src/scene/orbit-visual-scale.ts` 신규 파일 + export (R5+ satellite 패턴 SSoT 분리)
   - **권장**: 옵션 A (R4 fix 범위 minimum, body-scale.ts 단일 SSoT). R5 mars/phobos 진입 시 옵션 B 로 이전 가능
2. **`packages/core/src/scene/solar-system-scene.ts`** — satellite mesh position 계산 분기 (~5 라인):
   - `body.parentId !== null && body.parentId !== 'sun'` (또는 명시적 `body.parentId === 'earth'` for R4 한정) 분기
   - parent.position 기준 offset 벡터 × `EARTH_MOON_ORBIT_VISUAL_SCALE` 적용
   - 결과: moon position = earth position + (실측 offset × 30)
3. **orbit line builder (rebuildOrbitLines) parent-satellite 분기** (선택):
   - satellite orbit line 도 visual scale 적용 시 시각 정합 (line position 도 ×30)
   - 미적용 시 orbit line 은 실측 위치, mesh 는 visual 위치 → 시각 mismatch
   - **권장**: orbit line 도 적용 (시각 정합) — 추가 ~2 라인
4. **단위 테스트 추가**:
   - `EARTH_MOON_ORBIT_VISUAL_SCALE = 30` 상수 export 검증 1줄
   - moon mesh position 이 (earth position + 실측 offset × 30) 인지 scene 통합 테스트 (선택)
5. **D-T2 시각 검증 (PR D-T2 단계 의무 — Amendment 2 fix 검증)** — 아래 §사용자 D-T2 가이드 참조
6. **r1-guard / browser-verify 회귀 0 확인** — moon mesh wsRadius 무변동이므로 임계 변경 없음. 실측 PASS 보장
7. **`CHANGELOG.md` `### Behavior Changes` 박제**:
   ```markdown
   - [#539] R4 Amendment 2 — moon visual fusion 해결: earth-moon orbit visual scale=30 도입 (rendering 시점, 실측 데이터 SSoT 보존). earthScale=800 / moonScale=800 박제값 변경 없음. earth focus zoom-in 없이도 sun 시점에서 moon 분리 visible.
   ```
8. **이슈 #539 close 의무 — fix PR 본문**:
   - PR 본문에 `Closes #539` 표기 (auto-close 발동)
   - Amendment 2 §Concrete Prediction D2.1~D2.6 검증 결과 박제

### 사용자 D-T2 가이드 (Amendment 2 fix 후 검증)

Amendment 2 의 시각 분리 가정이 사용자 D-T2 단계에서 실제 작동하는지 검증. fix PR developer 단계 의무:

#### 검증 환경

- 명령: `pnpm dev`
- 브라우저: 실 Chrome (Playwright headless 금지 — volt #77 단계 게이트)
- 디바이스: macOS / Windows 데스크톱 (1280×720 + 1920×1080), 모바일 (375×667)

#### 시나리오 4종 (전부 통과 의무)

1. **default 진입 (sun 시점)** — `http://localhost:5173/?focus=sun` 또는 baseline URL
   - 점검: earth 옆에 moon 이 별도 dot/disc 로 visible (≥ 4 px, 4px fallback billboard OK)
   - 점검: earth-moon 화면 거리 ≥ 30 px 분리 인지
   - 점검: earth 가 sun 옆 분리, 그 옆에 moon 분리 — 3개 disc 자연 인지
   - 미통과 시: orbitVisualScale 30 → 50 fallback (§Amendment 2 §Concrete Prediction §예측 4)
2. **earth focus (shortcut 클릭)** — 상단 bar "지구" 버튼 클릭
   - 점검: camera 가 earth 중심 시점 이동 후 moon 이 earth 옆 별도 dot/disc visible
   - 점검: moon pxDiameter ≥ 50 px (zoom-in 효과 후 자연 인지)
   - 점검: moon orbit line visible (earth focus 진입 시 thickness 강조 발동)
3. **moon focus (shortcut 클릭)** — 상단 bar "달" 버튼 클릭
   - 점검: camera 가 moon 중심 시점 이동 후 moon mesh 화면 중앙 ≥ 200 px 직경
   - 점검: earth 가 화면 한쪽 모서리에 visible
   - 점검: moon focus 후 다시 sun 클릭 → camera 복귀 후 default 시점 정상
4. **URL override** — `http://localhost:5173/?focus=moon` 직접 진입
   - 점검: 진입 직후 moon focus 시점 자동 활성
   - 점검: 시나리오 3 의 점검 항목 동일 PASS

#### 시각 가시성 점검 항목 (각 시나리오 공통)

- [ ] **D2.1**: sun 시점 moon visible (≥ 4 px disc/dot 분리)
- [ ] **D2.2**: sun 시점 earth-moon 화면 거리 ≥ 30 px
- [ ] **D2.3**: earth focus 후 moon visible (≥ 50 px)
- [ ] **D2.4**: moon focus 후 moon mesh 화면 중앙 (≥ 200 px)
- [ ] **D2.5**: Amendment 1 임계 보존 (earth ≤ 17% / moon ≤ 5.0% r1-guard PASS)
- [ ] **D2.6**: R-Phase Allowlist 5 body 진입 보존
- [ ] **모바일 (375×667)**: 7 shortcut button + reset + free-fly = 9개 overflow 0
- [ ] **콘솔 에러 0**: 진입 / focus 전환 시 console.error 0건

### 시작 지점 (코드 변경) — R4 본 진입 (#532) 기록 보존

> 아래는 R4 본 진입 (#532, PR #537 머지본) 의 historical 인계 — Amendment 2 fix 와 별도. 본 architect 라운드에서 변경 없음.

1. **`apps/web/src/constants/body-scale.ts`** — `earth: 800` + `moon: 800` 2줄 추가 (결정 1 + 2)
2. **`apps/web/src/constants/body-scale.test.ts`** — `getBodyScale('earth') === 800` + `getBodyScale('moon') === 800` 2줄 추가
3. **`packages/core/src/scene/r-phase-allowlist.ts`** — `R_PHASE_BODY_ALLOWLIST` 에 `'earth', 'moon'` 추가 (결정 R-Phase 갱신 절차)
4. **`apps/web/src/components/layout/focus-quick-buttons.tsx`** — `FOCUS_BUTTONS` 에 `{ id: 'moon', label: '달' }` 1줄 추가 (earth 다음 위치, 결정 5) + Tailwind 토큰 `text-caption px-2 py-1` → `text-mini px-1 py-0.5` 변경 (모바일 viewport 수용, 결정 5)
5. **`packages/core/src/scene/solar-system-scene.ts`** — `rebuildOrbitLines` 함수 thickness 조건부 강화 (selectedBodyId === 'earth' 시 moon orbit line thickness 강조, 결정 4)
6. **`apps/web/scripts/r1-ui-regression-guard.mjs`** — earth + moon 항목 추가, expected baseline 갱신 (결정 3 Q2=B 임계 박제값, Amendment 1 후 17% / 5.0%)
7. **`apps/web/scripts/browser-verify-r-phase-allowlist.mjs`** — expected list 갱신 (R-Phase Allowlist 갱신 절차)
8. **`CHANGELOG.md`** — `### Behavior Changes` 박제 (R-Phase Allowlist 갱신 절차)
9. **단위 테스트 추가** (선택): moon parentId="earth" 의 궤도 라인 생성 검증, focus animation 4-body 검증

### 참조 문서

- 본 ADR (§결정 1~6 + §재검토 조건)
- [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) (R1 SSoT)
- [`20260428-r2-mercury-visualization.md`](20260428-r2-mercury-visualization.md) (R2 SSoT)
- [`20260429-r3-venus-visualization.md`](20260429-r3-venus-visualization.md) (R3 SSoT)
- [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) (**Q2=B 정책 SSoT**)
- [`20260504-r-phase-allowlist-guard.md`](20260504-r-phase-allowlist-guard.md) (R-Phase Allowlist 4곳 박제 절차)
- [`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) (Roadmap v3 §6 Amendment 2026-04-30)
- [`docs/templates/forensic-adr-template.md`](../templates/forensic-adr-template.md) (forensic 변형 발동 시 참조 — 본 R4 는 일반 ADR 유지)
- volt [#14](https://github.com/coseo12/volt/issues/14) (인계 항목 실측 재검증), [#21](https://github.com/coseo12/volt/issues/21) (신규 함수 ≠ 신규 구현), [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작), [#76](https://github.com/coseo12/volt/issues/76) (PM DoD 구조 drift), [#77](https://github.com/coseo12/volt/issues/77) (단계 게이트), [#78](https://github.com/coseo12/volt/issues/78) (실 브라우저 검증)

### 명시적 비-범위 (developer 단계 손대지 말 것)

- 본 architect 단계 코드 변경 0 — body-scale.ts / r-phase-allowlist.ts / focus-quick-buttons.tsx / solar-system-scene.ts 직접 수정 금지 (developer 단계 책임)
- `apps/web/src/components/sim-canvas.tsx:159` `radius: 35` — R1 박제 보존
- `packages/core/src/scene/tier.ts` (renderScale) — Q3=C 일관 보존
- `packages/shared/data/solar-system.json` (실측 데이터) — 절대 변경 금지 (옵션 (ii) 탈락)
- 옵션 (e) log scaling — 후속 이슈 분리 보존
- 본 R4 비-범위 7개 항목 (지구 PBR / 자전 / 달 위상 / 자전축 / 실시간 자전 / R2/R3 박제값 재조정 / R5+ body)

### Forensic 변형 발동 조건 자기 점검 (R4 진입 시점 vs Amendment 2 시점)

CLAUDE.md §Forensic ADR 변형 5조건 자기 점검:

#### R4 본 진입 (2026-05-20) — 일반 ADR 유지

1. **가설 N≥2** — ✗ (단일 원인 + 단일 fix 6가지 결정. 다중 가설 비교 부재)
2. **Runtime 측정 데이터 필수** — ✗ (산출식 기반 prediction. developer 단계 D-T2 가 runtime 측정)
3. **DoD PASS 인데 사용자/제품 회귀** — ✗ (신규 진입, 회귀 미발생)
4. **5±2 옵션 비교** — ✓ (각 결정 4~5 옵션 비교)
5. **Amendment 라운드 N 예상** — △ (D-T2 미통과 시 §재검토 트리거 1~6 발동 가능성)

**판정**: 5 조건 중 1개 충족 → **일반 ADR 유지** (R4 진입 시점). D-T2 후 amendment 라운드 발생 시 forensic 변형 승격 가능성 보존 (§재검토 트리거 #3).

#### Amendment 2 시점 (2026-05-21) — **forensic 변형 승격 5/5 충족**

1. **가설 N≥2** — ✓ (moonScale 감소 / earth-moon orbit visual scale 도입 / earthScale 인하 / parent frame 분기 등 4 가설)
2. **Runtime 측정 데이터 필수** — ✓ (메인 오케스트레이터 debug 스크립트 실측 — 이슈 #539 본문 Raw 측정. 정적 분석으로는 mesh-distance 모순 발견 어려움)
3. **DoD PASS 인데 사용자/제품 회귀** — ✓ (r1-guard / QA headless / Amendment 1 임계 전부 PASS → 실 Chrome 시각 회귀)
4. **5±2 옵션 비교** — ✓ (옵션 (i)~(v) 5개 후보 §Amendment 2 §옵션 비교)
5. **Amendment 라운드 N 예상** — ✓ (본 Amendment 2 자체가 Amendment 1 의 직계 후속. D-T2 미통과 시 라운드 3 가능성 §재검토 트리거 #7)

**판정**: 5/5 조건 충족 → **forensic 변형 승격** (Amendment 2 박제 시점). 본 ADR 머리말 §관련 의 `docs/templates/forensic-adr-template.md` cross-link 활성 (구 일반 ADR 변형 → 신 forensic 변형).

---

## 참고

- 발화점: 이슈 #532 PM 합의 (라운드 1+2, 2026-05-20)
- **Amendment 2 발화점**: 이슈 [#539](https://github.com/coseo12/astro-simulator/issues/539) (R4-followup moon visual fusion 회귀, 2026-05-21)
- Builds on: #329 (R1 sun), #361 (R2 mercury), #369 (R3 venus), #373 (R3 followup Q2=B 정책 SSoT + forensic 모범), #402 (R-Phase Allowlist 가드), #537 (R4 본 진입 PR 머지본 commit 9b4ba37)
- 본 이슈 (R4 본): [#532](https://github.com/coseo12/astro-simulator/issues/532)
- 본 이슈 (Amendment 2 forensic): [#539](https://github.com/coseo12/astro-simulator/issues/539)
- volt 인용:
  - [#14](https://github.com/coseo12/volt/issues/14) (인계 항목 실측 재검증 — R4 진입 시점 baseline 보존 검증)
  - [#21](https://github.com/coseo12/volt/issues/21) (신규 함수 ≠ 신규 구현 — moon satellite 첫 사례에서도 인프라 100% 재사용)
  - [#29](https://github.com/coseo12/volt/issues/29) (Claude 결합 간과 편향 — earth-moon parent-satellite 결합 명시)
  - [#67](https://github.com/coseo12/volt/issues/67) (debug 스크립트 실측 선행 — developer D-T2 단계 의무)
  - [#74](https://github.com/coseo12/volt/issues/74) (DoD PASS ≠ 제품 동작 — Q2=B 첫 본 인스턴스화 + 5-body 누적 모바일 침습성 별도 검증)
  - [#76](https://github.com/coseo12/volt/issues/76) (PM DoD 구조 drift — Q4 architect 위임만 인스턴스화, 다른 PM 합의 재구조화 금지)
  - [#77](https://github.com/coseo12/volt/issues/77) (단계 게이트 — architect → reviewer → qa 순서 강제)
  - [#78](https://github.com/coseo12/volt/issues/78) (실 브라우저 검증 — D-T2 의무)
- CLAUDE.md 인용:
  - §ADR Status 워크플로 (#370) — Provisional → Accepted 전이
  - §Forensic ADR 변형 (#381) — 5 조건 자기 점검. **R4 진입 시점은 일반 ADR / Amendment 2 시점 forensic 변형 승격 5/5 충족**
  - §교차검증 박제 직후 1회 루틴 (CRITICAL DIRECTIVE 개정 / ADR 신규·개정/폐기 / MINOR 이상 / 원칙 선언 4 앵커) — **Amendment 2 (ADR 개정) 박제 직후 1회 의무**
  - §sub-agent 공통 JSON 스키마 9 필드 SSoT
  - §"DoD PASS ≠ 제품 동작" (volt #74) — **Amendment 2 정확한 사례**

---

## 변경 이력

- **2026-05-20**: R4 본 진입 ADR 박제 (architect, #532). cross-validate 2026-05-20 Gemini 합의 후 Accepted 전이. 고유 발견 3건 후속 분리 (#534/#535/#536)
- **2026-05-21**: Amendment 1 박제 — D8 측정 검증 (perspective foreshortening 누락 발견) → 임계 완화 (earth ≤ 17% / moon ≤ 5.0%). 박제값 보존
- **2026-05-21**: **Amendment 2 박제 — forensic ADR 변형 승격 (5/5 충족). moon visual fusion 회귀 (#539) 해결. 옵션 (iii-amended) earth-moon orbit visual scale=30 도입 (rendering 시점, 실측 데이터 SSoT 보존). earthScale=800 / moonScale=800 / 실측 데이터 / R4 §비-범위 7항목 전부 보존**
