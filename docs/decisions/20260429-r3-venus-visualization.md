# ADR: R3 금성 가시성 — venusScale + shortcut-bar 항목 + orbit 라인 + Concrete Prediction 첫 검증

- **상태**: Accepted
- **날짜**: 2026-04-29
- **결정자**: architect (#369 R3 PM 합의 라운드 1+2 후 위임)
- **관련**: #369 (본 R3 스프린트), `20260428-r2-mercury-visualization.md` (R2 SSoT — Concrete Prediction "≤ 2 라인" + 단서 조항 §(b) 예외 분류 박제), `20260425-r1-sun-visualization.md` (R1 시각화 SSoT — sunScale=75 + bodyScale 인프라), `20260425-r1-store-scene-sync-unification.md` (focus sync 단일 경로), `20260425-r1-ui-pixel-diff-guard.md` (회귀 가드 인프라), `20260424-p11-b-lod-design.md` (LOD × scale 합성 순서), `20260424-tier-naming-policy.md`, `20260422-floating-origin.md`
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (volt #21 — R1+R2 인프라 100% 재사용 검증), "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (R2 §결과·재검토 조건 §Concrete Prediction "R3 추가 시 코드 변경 ≤ 2 라인" 첫 외부 검증 사례), "headless 브라우저 검증 ≠ 실 브라우저" (volt #77 — 실 Chrome GUI 수동 검증 R3 D-T2 명시), "DoD PASS ≠ 제품 동작" (volt #74 — 모바일 누적 차단율 14.2+α% 침습성 별도 검증), "엄격 원칙 + 동적 적응 부재 함정" (volt #68 — 0.5% 정량 임계가 모바일 viewport 에서 인지 가능한지 별도 검증), "다중 body 첫 race 검증" (R2 D-F3 → R3 3-body 첫 검증 — Q4=A r2-focus-race-guard body-agnostic 신뢰)

---

## 통합 vs 분리 결정 (메타)

본 ADR 은 R2 ADR §통합 vs 분리 결정 §"R3~R10 의 ADR 박제 패턴 SSoT" 를 그대로 따름:

- **R2 ADR 패턴 = R3~R10 표준 SSoT** — 단일 body 의 시각화 결정 4건 (scale / shortcut / orbit / focus race) 을 단일 ADR 로 통합. 파일명 `<YYYYMMDD>-r<N>-<body>-visualization.md`
- **회귀 가드 인프라 amendment** — sentinel / baseline 갱신 절차 변경은 `20260425-r1-ui-pixel-diff-guard.md` amendment 누적 (현재 v3 — R2 가 v3 박제). R3 가 신규 amendment 박제 필요 시 v4 추가
- **store-scene-sync 무수정** — R1 §Concrete Prediction "R2~R10 코드 변경 0" 검증 — **R2 가 첫 검증 (PASS)**, R3 는 두 번째 검증

본 R3 는 R2 ADR §결과·재검토 조건 §Concrete Prediction (R2 ADR 박제 시점의 미래 예측) 의 **첫 외부 검증 사례**. R1 → R2 도 R1 ADR Concrete Prediction 의 검증이었으나 R2 ADR §결과·재검토 조건 §재검토 트리거 #4 + §단서 조항 (Gemini cross-validate Q3) 박제로 예측 정밀도 한 단계 상승. 본 R3 는 그 정밀화된 예측의 검증.

---

## 배경

### Roadmap v3 §R3 진입 조건

[`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) §R-Phase 공통 DoD 템플릿 + §"R3: R2 + 금성" 에 따라 R3 는 R2 위에 **금성을 명시적으로 visible 하게 추가**. PM 합의 (#369 라운드 1+2):

- **Q1** (가시성 측정): 옵션 A — **mercury 와 동일 임계 viewport 점유율 ≥ 0.5%** (R2 패턴 100% 일치). inner 행성 통합 임계 정책은 R5 (mars) 진입 시 architect 별도 결정 가능
- **Q2** (머티리얼 처리): 옵션 A — **단색 머티리얼** (mercury 패턴, 기본 머티리얼). R2 ADR §단서 조항 §(b) 예외 미발동
- **Q3** (자전 / 위상 처리): 옵션 A — **자전 정지** (R2 비-범위 정합)
- **Q4** (focus race E2E): 옵션 A — **r2-focus-race-guard 그대로 재사용 (body-agnostic 신뢰)**

### 현재 baseline 실측 (2026-04-29 develop tip = main = 12119f3)

R2 박제 상태 (`apps/web/src/constants/body-scale.ts`):

```typescript
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 75,
  mercury: 8500, // R2 #361
});
```

R2 박제 상태 (`apps/web/src/components/layout/focus-quick-buttons.tsx`):

```typescript
const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' }, // R2 #361
  { id: 'earth', label: '지구' },
  { id: 'jupiter', label: '목성' },
  { id: 'neptune', label: '해왕성' },
];
```

금성 (`packages/shared/data/solar-system.json`):

- `id: "venus"`, `radius: 6.0518e6` m (mercury 의 **2.480배**, sun 의 0.870%)
- `mass: 4.8675e24` kg
- `parentId: "sun"`

금성은 현재 BODY_SCALE 룩업 미정의 → `getBodyScale('venus') === 1.0` (실측 그대로) → mesh diameter ≈ `6.0518e6 × 2 × 8.4e-11 × 1 = 1.017e-3` scene unit → 1280×720 viewport 에서 pixel diameter ≈ `0.025px` (sub-pixel, 사용자 인지 불가).

### 산출식 (R1 + R2 ADR 동일 식 — m → scene unit → pixel)

```
diameter (scene unit) = body.radius (m) × 2 × renderScaleForTier('solar') × scale
                      = body.radius × 1.68e-10 × scale

px_diameter = diameter × viewportH / (cameraRadius × 2 × tan(fov / 2))
            = body.radius × 1.68e-10 × scale × viewportH / (35 × 2 × 0.4228)

coverage = π × (px_diameter / 2)² / (W × H)
```

### 기존 자산 재사용 조사 ("신규 함수 ≠ 신규 구현")

R2 ADR §기존 자산 재사용 조사 표 100% 재현. **본 R3 는 신규 자산 0** — 모두 R1+R2 박제 인프라:

| 자산                                                     | 위치                                                                    | 본 R3 처리                                                                                                 |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------- |
| `BODY_SCALE` 룩업 + `getBodyScale`                       | `apps/web/src/constants/body-scale.ts`                                  | **확장** — `venus: <N>` 1줄 추가 (R2 ADR §결과·재검토 조건 §Concrete Prediction 검증)                      |
| `createSolarSystemScene({ bodyScale })` 옵션 콜백        | `packages/core/src/scene/solar-system-scene.ts`                         | **재사용 — 코드 변경 0** (`getBodyScale` 자동 일반화)                                                      |
| `createBodyMesh*` diameter 계산식                        | 동 파일 (R1 §결정 3 박제)                                               | **재사용 — 코드 변경 0** (`bodyScale(body.id)` 자동 일반화)                                                |
| `screenCoverageRadius` effective radius 입력             | 동 파일 (R1 §결정 4 박제)                                               | **재사용 — 코드 변경 0**                                                                                   |
| `syncFocusToScene` helper                                | `apps/web/src/components/sim-canvas.tsx` (store-scene-sync ADR §결정 4) | **재사용 — 코드 변경 0** (venus id 도 동일 path)                                                           |
| `FOCUS_BUTTONS` 배열                                     | `apps/web/src/components/layout/focus-quick-buttons.tsx`                | **확장** — `{ id: 'venus', label: '금성' }` 1줄 추가                                                       |
| `CelestialInfoPanel` (venus 데이터 표시)                 | `apps/web/src/components/panels/celestial-info-panel.tsx`               | **재사용 — 코드 변경 0** (selectedBodyId 일반화)                                                           |
| 궤도 라인 `MeshBuilder.CreateLineSystem`                 | `solar-system-scene.ts:358-378`                                         | **재사용 — 코드 변경 0** (`rebuildOrbitLines` 가 모든 body 자동 일괄 처리, `Color3(0.25, 0.28, 0.4)` 일관) |
| `Animation.CreateAndStartAnimation` (camera focus tween) | `camera-controller.ts:52`                                               | **재사용 — 코드 변경 0** (R2 §결정 4 후보 A "Babylon 자동 폐기 신뢰" 의 3-body 첫 검증 사례)               |
| r1-guard 4 sentinel × 3 viewport 매트릭스                | `apps/web/scripts/r1-ui-regression-guard.mjs`                           | **재사용 + baseline 갱신** (shortcut-bar 6→7 버튼 변동 영역만)                                             |
| r2-focus-race-guard.mjs (3 시나리오)                     | `apps/web/scripts/` (R2 #361 박제)                                      | **재사용 — body-agnostic** (Q4=A 합의, 3-body 신규 시나리오 추가 없음)                                     |
| `body-scale.test.ts` 단위 테스트                         | `apps/web/src/constants/body-scale.test.ts`                             | **확장** — `getBodyScale('venus') === <N>` 1줄 추가                                                        |

**신규 구현**: BODY_SCALE 룩업 1줄 + FOCUS_BUTTONS 1줄 = **총 2줄** (R2 ADR §결과·재검토 조건 §Concrete Prediction "R3 추가 시 코드 변경 ≤ 2 라인" 정확 충족 예상). 단위 테스트 1줄은 별도 카운트.

---

## 후보 비교

### 축 1 — `venusScale` 구체값 (D-V2)

#### 산출 — 11 candidates × 3 viewport

R2 ADR §축 1 산출식 그대로 적용. venus.radius = 6.0518e6 m (mercury.radius=2.4397e6 의 **2.480배**).

mercuryScale=8500 일 때 mercury pixel diameter = 84.76px (1280×720), 점유율 0.612% (R2 ADR §결정 1 박제값) 을 기준으로 비례 계산:

```
venus_px_d (1280×720) = 84.76 × 2.480 × (venusScale / 8500) = 0.02473 × venusScale
venus_coverage (1280×720) = π × (venus_px_d/2)² / (1280 × 720)
```

| scale                  | 1280×720 (px / %)    | 1920×1080 (px / %)    | 375×667 (px / %)     | sun 시각비 (1280×720) | mercury 시각비 |
| ---------------------- | -------------------- | --------------------- | -------------------- | --------------------- | -------------- |
| × 2000                 | 49.45px / **0.211%** | 74.18px / 0.211%      | 45.81px / 0.667%     | 23.2%                 | 58.3%          |
| × 2200                 | 54.40px / **0.255%** | 81.60px / 0.255%      | 50.39px / 0.806%     | 25.5%                 | 64.2%          |
| × 2500                 | 61.81px / **0.330%** | 92.72px / 0.330%      | 57.27px / 1.043%     | 29.0%                 | 72.9%          |
| × 3000                 | 74.18px / **0.475%** | 111.27px / 0.475%     | 68.72px / 1.502%     | 34.8%                 | 87.6%          |
| × 3400 (DoD 정확 임계) | 84.07px / **0.500%** | 126.10px / 0.500%     | 77.88px / 1.580%     | 39.4%                 | 99.2%          |
| × 3500                 | 86.54px / **0.530%** | 129.81px / 0.530%     | 80.17px / 1.673%     | 40.6%                 | 102.2%         |
| **× 4000**             | **98.91px / 0.692%** | **148.36px / 0.692%** | **91.62px / 2.190%** | **46.4%**             | **116.8%**     |
| × 4500                 | 111.27px / 0.876%    | 166.91px / 0.876%     | 103.07px / 2.770%    | 52.2%                 | 131.4%         |
| × 5000                 | 123.64px / 1.082%    | 185.46px / 1.082%     | 114.53px / 3.422%    | 58.0%                 | 146.0%         |
| × 6000                 | 148.36px / 1.557%    | 222.55px / 1.557%     | 137.43px / 4.928%    | 69.6%                 | 175.2%         |
| × 8500 (mercury 동일)  | 210.18px / 3.123%    | 315.27px / 3.123%     | 194.71px / 9.881%    | 98.6%                 | 248.0%         |

**0.5% DoD 동시 만족 최소 scale**: 1280×720 / 1920×1080 둘 다 3,400 (16:9 동일 종횡비 + 동일 fov + 동일 카메라 거리 → coverage 동일). 모바일 (375×667) 은 종횡비 9:16 + viewport 짧은 변이 짧아 동일 scale 에서 더 큰 coverage → mobile 최소 = 1,910.

**3 viewport 동시 만족 = 3,400+** (안전 margin 포함 ≈ 3,400~4,000).

#### 후보 평가

| 후보                          | 점유율 (1280×720) | 점유율 (모바일) | sun 시각비 | mercury 시각비 | 평가                                                                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------- | ----------------- | --------------- | ---------- | -------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. × 3,400 (DoD 정확)**     | 0.500%            | 1.58%           | 39.4%      | 99.2%          | DoD 정확 임계, 산출 오차 ±0.5% 마진 부족 시 회귀 위험. **mercury 시각비 99.2% — 과학적 사실 (venus > mercury) 위반 risque** (mercury 의 5% 작게 보임). **탈락** (margin 부족 + 과학적 사실 위반)                                                                                                                                                                                                                                   |
| **B. × 3,500 (margin 1.06×)** | 0.530%            | 1.67%           | 40.6%      | 102.2%         | DoD margin 6% (R2 mercury 22% 대비 작음). mercury 시각비 102% — 과학적 사실 (venus 가 mercury 보다 약간 큼) 만족 시작점. **margin 부족** (R2 패턴 22% 와 비교 시 4배 좁음). **탈락**                                                                                                                                                                                                                                               |
| **C. × 4,000 (margin 1.38×)** | 0.692%            | 2.19%           | 46.4%      | 116.8%         | **DoD margin 38% — R2 mercury 22% 보다 풍부 (16% 추가 margin)** + mercury 시각비 117% (venus 가 mercury 보다 17% 큼 — 과학적 사실 정합) + sun 시각비 46% (sun 의 약 1/2 — 단조 감소 패턴 만족: sun 100% → mercury 40% → venus 46%? — _주의: venus 가 mercury 보다 시각비 큼_). 모바일 2.19% (sun 12.26 + mercury 1.94 + venus 2.19 = 16.39% 누적 — 한계 25% 까지 8.6%p margin). 단순 정수 + R4~R10 비율 부담 적정. **선택 후보 1** |
| **D. × 4,500**                | 0.876%            | 2.77%           | 52.2%      | 131.4%         | DoD margin 풍부 (75%). mercury 시각비 131% — 과학적 사실 정합 + 적정. 모바일 2.77% — 누적 16.97% (한계까지 8%p margin). **선택 후보 2** (보수적 margin 선호 시)                                                                                                                                                                                                                                                                    |
| E. × 5,000                    | 1.082%            | 3.42%           | 58.0%      | 146.0%         | mercury 시각비 146% — venus 가 mercury 보다 거의 1.5배 시각비. 모바일 3.42% — 누적 17.62%. R4 (지구) earthScale 결정 시 **단조 감소 패턴 (sun 75 / mercury 8500 / venus 5000 / earth M)** 의 M 도 5000 미만으로 강제. earth.radius=6.371e6 m (venus 의 1.053배 — 거의 동등) → earthScale 도 5000 비슷 권장. 부담 가중. **탈락**                                                                                                    |
| F. × 8,500 (mercury 동일)     | 3.123%            | 9.88%           | 98.6%      | 248.0%         | **모바일 9.88% — sun + mercury + venus 누적 24.08% — 한계 25% 거의 도달**. mercury 시각비 248% (venus 가 mercury 의 2.48배 — body 면적비 정확 반영, 그러나 너무 침습적). **탈락** (모바일 누적 한계 + 시각 침습)                                                                                                                                                                                                                   |
| G. viewport-aware 동적 식     | (varies)          | (varies)        | (varies)   | (varies)       | R1 §축 1 후보 Y / R2 §축 1 후보 E 와 동일 사유 탈락 ("신규 데이터 ≠ 신규 코드" 위배 + R3~R10 식 재검토 부담)                                                                                                                                                                                                                                                                                                                       |
| H. venus 단독 별도 LOD rule   | —                 | —               | —          | —              | LOD ADR §결정 §3 "high/mid/low 외 도입 금지" + LOD 책임 ("얼마나 섬세하게") 과 시각 과장 책임 분리 위배                                                                                                                                                                                                                                                                                                                            |

#### 선택: **후보 C — `venusScale = 4000`**

근거:

1. **DoD 0.5% margin 38%** — R2 mercury margin 22% 대비 **16%p 추가 여유** — venus 가 첫 3-body 사례라 산출식이 카메라 fov / radius / renderScale 에 의존하는 ±5% 노이즈 흡수 + 모바일 누적 차단율 변동 흡수 필요. margin 1.38× 가 안전
2. **과학적 사실 정합 (venus > mercury)** — 시각비 mercury 116.8% (17% 큼) — venus.radius 가 mercury 의 2.48배라 body 면적비는 6.15배지만 sub-pixel 환경에서 17% 시각비 차이로 충분히 인지. 사용자가 "금성이 수성보다 약간 더 크다" 자연 인지 (mass 도 venus 14.7배 → 직관 일치)
3. **단조 감소 패턴 부담 분배** — sun 75 → mercury 8500 → **venus 4000** → earth M? — venus.radius=6.0518e6 m, earth.radius=6.371e6 m (venus 의 1.053배). earthScale ≈ 4000 / 1.053² ≈ **3,600** 권장 (R4 위임). single 단조 감소 (8500 > 4000 > 3600?) 만족 + earth 가 venus 보다 시각비 약간 큼 (실측 비례)
4. **모바일 누적 차단율 16.39%** — 현재 (R2 종료) sun 12.26% + mercury 1.94% = 14.20% → R3 추가 후 16.39% (한계 25% 까지 **8.6%p margin**, 즉 **R4~R5 까지 추가 누적 약 8% 흡수 가능**). R5 (mars) 진입 전 사전 발동 검토 가능 (본 ADR §재검토 트리거 #2 박제)
5. **단순 정수** — 4,000 = 8,500 / 2.125 직관적 (mercury 의 약 절반 scale 으로 venus 의 큰 radius 가 보상되는 자연 배치)
6. **R4~R10 비율 부담 minimum** — venusScale=4,000 채택 시 향후 단조 감소 패턴 가능 영역:
   - R4 earth: 3,600 (venus 의 0.9배 — earth.radius/venus.radius=1.053 비례 보상)
   - R5 mars: ~6,500 (mars.radius=3.3895e6 m, venus 의 0.560배 — 시각비 보존하려면 venusScale × (venus_r/mars_r)² = 4000 × 3.18 ≈ 12,700 — mercury 8500 와 비교 시 큰 영향, R5 architect 단계 별도 결정)
   - R6+ outer planets: jupiter/saturn 은 inner 대비 radius 가 10~12배 크므로 scale 작아도 visible — 단조 감소 자연

#### Concrete Prediction — R3 의 본 검증 + R4~R10 확장 박제

R2 ADR §결과·재검토 조건 §Concrete Prediction "R3 추가 시 코드 변경 ≤ 2 라인" 의 본 R3 검증 실측은 본 ADR §결과·재검토 조건 §Concrete Prediction 실측 보고 에 박제 (developer 단계).

**R4 추가 prediction (R3 박제 시점)**: R4 (지구+달) 추가 시:

- earth: BODY_SCALE 룩업 1줄 + FOCUS_BUTTONS 1줄 = 2 라인
- moon: parentId="earth" satellite — `solar-system.json` 의 moon 데이터 자동 활용 + BODY_SCALE 룩업 1줄 (선택). FOCUS_BUTTONS 추가 여부는 R4 PM 결정 (default body 가 아닐 가능성 — R4 핵심은 earth)
- 예상 코드 변경: earth 만 ≤ 2 라인 / earth + moon 둘 다 shortcut bar 진입 시 ≤ 4 라인

본 R3 ADR 의 Concrete Prediction 결과 (D-X1 검증) 가 R4 prediction 정밀도를 결정.

#### 모바일 인지 가능성 별도 검증 (D-V4) — volt #68 / #74 적용

본 ADR §축 1 후보 C 채택 시 모바일 점유율 2.19% (5,475px² disk) → 사용자 인지 가능. 단 **headless 검증만으로는 부족** (volt #68 — 단일 축 원칙 + 동적 적응 부재 함정 + volt #74 — DoD PASS ≠ 제품 동작). developer 가 R3 PR 에서 실 모바일 Chrome (375×667) 으로 수동 확인 의무 (D-T2). 추가로 sun (12.26%) + mercury (1.94%) + venus (2.19%) = 16.39% 누적 차단율 → 사용성 한계 25% 까지 **8.6%p margin** — 양호하나 R4 (지구) 진입 시 earth.radius=6.371e6 m → earthScale=3,600 가정 시 모바일 점유율 2.55% 추가 → 누적 18.94% (한계까지 6.06%p) — R5 (mars) 진입 전 viewport-aware scaling 검토 트리거 발동 가능성 높음.

### 축 2 — shortcut-bar venus 항목 키바인딩 / aria (D-S1)

#### 현재 R2 박제 상태 (#361)

```typescript
const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' }, // R2 #361
  { id: 'earth', label: '지구' },
  { id: 'jupiter', label: '목성' },
  { id: 'neptune', label: '해왕성' },
];
```

R2 ADR §축 2 후보 A 박제: **키바인딩 무박제 / aria 자연 라벨 (button 텍스트) / 천체 거리 순서**.

#### 후보 비교

| 후보                                                                                                 | 키바인딩    | aria                      | 위치                 | 평가                                                                                                                  |
| ---------------------------------------------------------------------------------------------------- | ----------- | ------------------------- | -------------------- | --------------------------------------------------------------------------------------------------------------------- |
| **A. R1+R2 패턴 그대로 (키바인딩 없음, aria 무박제, label="금성")**                                  | 없음        | 텍스트 라벨 (button 본문) | mercury 다음 (3번째) | R1+R2 정합성 100%. 신규 키바인딩 도입 시 R3~R10 까지 N개 키 정합성 부담. 천체 거리 순 자연 정렬. **선택**             |
| B. 숫자 키 (1=sun / 2=mercury / 3=venus / ...)                                                       | 1~9 + 0     | `aria-keyshortcuts="3"`   | 동일                 | R3~R10 까지 10 body 매핑 가능하지만, input 필드 (date-time, 검색) 와 충돌 가능 + R1+R2 회귀 (키바인딩 부재 계약 깨짐) |
| C. 단축 한글/영문 (V=venus)                                                                          | 단일 알파벳 | `aria-keyshortcuts="v"`   | 동일                 | 한국어 label 과 직관 불일치 + R2 도 mercury="m" 미박제. R3 만 도입 시 일관성 깨짐                                     |
| D. 7번째 버튼 (sun / mercury / venus / earth / jupiter / neptune / reset) — 위치 6번째 (reset 7번째) | A 와 동일   | A 와 동일                 | mercury 다음         | A 와 동일 결정 (위치만 명시). **A 와 동일 결정 — 위치만 명시 차원**                                                   |

#### 선택: **후보 A — 키바인딩 무박제, label="금성", 위치 mercury 다음 (3번째)**

근거:

1. **R1+R2 패턴 100% 일치** — R1 PR #332 / R2 PR #363 모두 키바인딩 미박제로 머지됨. R3 가 신규 키바인딩 도입 시 R1+R2 회귀 + R4~R10 매핑 강제
2. **단순성** — 키바인딩은 별도 스프린트 (UX 개선 R-Phase 또는 후속 이슈) 에서 일괄 도입이 ROI 높음. 현재는 클릭만으로 충분 (PM Q1 합의 = 가시성 임계만, UX 향상 비-목표)
3. **aria 자연 라벨** — button 텍스트 "금성" 이 Screen Reader 에 그대로 읽힘 (axe 0 위반 통과 — R1+R2 사례 일반화)
4. **충돌 검증 0** — 현재 keydown 핸들러 부재 (R2 #361 grep 검증 완료). 키바인딩 무박제 = 충돌 검증 자체 불요
5. **7번째 버튼 (reset 포함) 접근성** — 7개 버튼이 `data-r1-region="shortcut-bar"` 한 영역에 표시. 현재 6개 (sun / mercury / earth / jupiter / neptune + reset) 에서 7개 (venus 추가) 로 확장. 가로 너비 영향: 각 버튼 약 28~40px (text "금성" 2자 + padding) → +35px 정도 width 증가. 1280×720 viewport 의 TopBar 중앙 영역에서 충돌 없음 (R2 baseline 의 6 버튼 width 측정 시 약 270px → R3 +35px = 305px, TopBar 중앙 영역 여유 충분)

#### Developer 박제 의무

`focus-quick-buttons.tsx` 의 `FOCUS_BUTTONS` 배열에 다음 1줄 추가 — **mercury 다음 위치 (천체 거리 순)**:

```typescript
const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' }, // R2 #361
  { id: 'venus', label: '금성' }, // R3 #369
  { id: 'earth', label: '지구' },
  { id: 'jupiter', label: '목성' },
  { id: 'neptune', label: '해왕성' },
];
```

**위치**: mercury 다음 (천체 거리 순서 자연 정렬). 기존 earth/jupiter/neptune 위치 보존. 6→7 버튼 확장.

### 축 3 — venus 궤도 라인 렌더 (D-O1)

#### 현재 R1+R2 박제 상태 (`solar-system-scene.ts:358-378`)

R2 ADR §축 3 후보 A 박제: **변경 안 함**. 색상 `Color3(0.25, 0.28, 0.4)` / 두께 default / 투명도 default. `rebuildOrbitLines` 가 모든 body 자동 일괄 처리.

#### 후보 비교

| 후보                                           | 사양                                            | 평가                                                                                                          |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------- |
| **A. 변경 안 함 (현재 색상/투명도/두께 유지)** | `Color3(0.25, 0.28, 0.4)`, `LineSystem` default | R1 §결정 5 + R2 §결정 3 비-범위 보호 가드 (line 렌더 무수정) 정합. PM 비-목표 §"baseline 동일" 일치. **선택** |
| B. venus 궤도 강조 (focus 진입 색상)           | 다른 색상 (예: yellow/cream)                    | "현재 활성 R-Phase body" 식별 시각 보조. R1+R2 도 sun/mercury 궤도 강조 미적용 → 회귀. **탈락**               |
| C. 두께 차별 (venus 1.5×)                      | `linesThickness` 별도                           | LineSystem default 가 1px 인데 두께 변경은 GPU LineThickness 분기 도입 = 신규 인프라. **탈락**                |
| D. Q2=A 단색 머티리얼 색상 venus 황백색 매핑   | venus body mesh 머티리얼만 황백색 (orbit 무관)  | Q2=A "기본 머티리얼" 박제 — body mesh 머티리얼은 default (회색조). **탈락** (Q2=A 위반)                       |

#### 선택: **후보 A — 변경 안 함**

근거:

1. **PM 비-목표 §"baseline 동일" 정합** — 본 ADR §결정 3 은 비-범위 가드만 박제
2. **R1+R2 회귀 0 보장** — `solar-system-scene.ts:358-378` line 0 변경 (R2 ADR §결과·재검토 조건 §Concrete Prediction 핵심 6 파일 SSoT 의 1번 파일)
3. **rebuildOrbitLines 자동 일반화** — 신규 body 데이터 (venus 는 이미 `solar-system.json` 에 박제됨) 추가 = 자동 포함. 코드 변경 0
4. **Q2=A "단색 머티리얼" 박제와 직교** — 궤도 라인 색상 (orbit-lines LineSystem) 과 body mesh 머티리얼 (StandardMaterial diffuseColor) 은 별도 객체. orbit 라인은 R1+R2 와 동일 `Color3(0.25, 0.28, 0.4)` 유지, venus body mesh 도 default StandardMaterial (회색조) — Q2=A 정확 충족

#### Developer 박제 의무

`solar-system-scene.ts` 의 orbit 관련 코드 **무수정**. body mesh 머티리얼도 무수정 (기본 StandardMaterial 자동 일반화). 본 결정 검증은 R3 prediction 의 일부 — git diff stat 으로 0 라인 변경 자동 검증.

### 축 4 — focus 전환 race E2E (D-F3)

#### 현재 R2 박제 상태 (`r2-focus-race-guard.mjs`)

R2 #361 박제 시나리오 3개:

1. sun → mercury race (lerp 절반 진행 중 mercury 클릭)
2. mercury 진행 중 reset (focus 해제)
3. Animation tween 카운트 (이중 호출 방지)

R2 ADR §축 4 후보 A 박제: **Babylon 자동 폐기 신뢰 (변경 안 함)**.

#### Q4=A PM 합의 적용

PM 라운드 1+2 에서 Q4=A 채택: **r2-focus-race-guard body-agnostic 그대로 재사용 (시나리오 추가 없음)**.

#### 후보 비교

| 후보                                                                      | 처리 방식                                                                                     | 평가                                                                                                                                                                                   |
| ------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. r2-focus-race-guard body-agnostic 신뢰 (Q4=A) — 시나리오 추가 없음** | R2 #361 박제 3 시나리오 그대로. sun↔mercury / mercury↔reset / Animation 카운트 — body id 무관 | PM Q4=A 합의. R2 §축 4 후보 A "Babylon 자동 폐기 신뢰" body-agnostic 동작 확증. R3~R10 자동 호환. **선택**                                                                             |
| B. 3-body 신규 시나리오 추가 (sun → mercury → venus)                      | r2-focus-race-guard 에 시나리오 4번 추가                                                      | PM Q4=A 위반. body-agnostic 신뢰 시 시나리오 N body 마다 추가는 불필요 (R2 Q4 분석 결과). 단 시각 jitter 발견 시 R2 §재검토 트리거 #3 발동 후 추가 가능 (현재 R3 PR 범위 외). **탈락** |
| C. 명시적 `getAnimatableByTarget` 취소 도입 (R2 §축 4 후보 B)             | R2 §축 4 후보 B 와 동일 — focus 전환 시 명시 취소                                             | R2 §재검토 트리거 #3 (시각 jitter 발견 시) 미발동 상태에서 선제 도입 = YAGNI. R2 cross-validate 에서도 기각됨. **탈락**                                                                |

#### 선택: **후보 A — r2-focus-race-guard 그대로 재사용**

근거:

1. **PM Q4=A 합의** — 사용자 명시 동의 (CLAUDE.md §우선순위 §"사용자 명시적 지시 > 프레임워크 기본 원칙")
2. **R2 §축 4 후보 A body-agnostic 동작 확증** — Babylon `Animation.CreateAndStartAnimation` 동일 property name (`cam-target`, `cam-radius`) 자동 폐기 + 재시작 동작은 body id 와 무관. R3 venus 추가 = 새 body id "venus" 가 등장하지만 동일 property 호출이라 자동 폐기 동작 동일
3. **3-body 첫 자연 검증** — R3 가 3-body 첫 사례지만 r2-focus-race-guard 시나리오 1 (sun→mercury) 의 body 가 (sun, mercury) → R3 진입 후 focus_buttons 가 7개 인데 시나리오 자체는 변경 없음. R3 에서 시나리오 1 이 그대로 PASS 하면 body-agnostic 확증
4. **시각 jitter 발견 시 amendment 경로 박제됨** — R2 §재검토 트리거 #3 발동 시 후보 C (명시 취소) 도입 — 현재 R3 PR 은 그 경로 사전 차단 (PM Q4=A)

#### Developer 박제 의무

`r2-focus-race-guard.mjs` **무수정**. R3 PR 의 D-G2 검증으로 r2-focus-race-guard 3 시나리오 PASS 확인. 시각 jitter 발견 시 R2 §재검토 트리거 #3 발동 + 후속 이슈 분리 (R3 PR 범위 외).

수동 검증 (D-T2 의무): 실 Chrome GUI 에서 sun ↔ mercury ↔ venus focus 빠른 전환 1회 — 부드러운 전환 확인.

### 축 5 — info 패널 / R1+R2 부산물 자동 일반화 (D-I1)

#### `CelestialInfoPanel` 자동 일반화 (R2 §축 5 일관)

`apps/web/src/components/panels/celestial-info-panel.tsx` 가 `selectedBodyId` 를 store 에서 읽어 `solar-system.json` 의 body 데이터를 표시. venus 도 이미 데이터 박제됨 (`id: "venus"`, `mass: 4.8675e24`, `radius: 6.0518e6`, `nameKo: "금성"`) → **코드 변경 0** 자동 일반화. PM D-I2 "코드 변경 0" 박제와 일치.

#### tooltip "× N 과장 중" 표시

R1 ADR Developer 인계 §7 — info-panel 의 "가시성을 위해 N배 확대" 표시. R2 #361 에서 mercury 도 자동 표시됨 (`getBodyScale('mercury') === 8500`). R3 venus 도 동일 컴포넌트 일반화 — `getBodyScale('venus') === 4000` 자동 표시 (코드 변경 0).

#### 자전 / 위상 — Q3=A 자전 정지 (R2 §축 5 일관)

PM Q3=A 박제. info 패널의 자전 주기 텍스트 표시 (역행 자전 정보 포함 — venus 자전 주기 ≈ -243.0185일, retrograde) 는 D-I1 자동 포함 (코드 변경 0). 자전 애니메이션 / 영점 위상 정확도는 visual-quality R-Phase 또는 별도 이슈 (R3 비-범위).

**Developer 의무**: 실 Chrome 으로 venus focus 진입 시 info 패널에 "× 4000 과장 중" 또는 "가시성을 위해 4000배 확대" 표시 + venus 자전 주기 표시 (retrograde 표기 포함) 확인 (수동 검증).

---

## 결정

### 결정 1 — `venusScale = 4000` (축 1 후보 C)

`apps/web/src/constants/body-scale.ts` 에 venus 1줄 추가:

```typescript
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 75,
  mercury: 8500, // R2 #361
  venus: 4000, // R3 #369 — viewport 점유율 1280×720 0.69% / 모바일 2.19% / mercury 시각비 117% / sun 시각비 46%
});
```

**박제값 산출 근거** (본 ADR §축 1):

- viewport 점유율 (1280×720): 0.692% (DoD 0.5% + 마진 38%)
- viewport 점유율 (1920×1080): 0.692%
- viewport 점유율 (375×667 모바일): 2.19% (인지 가능 + 화면 차단 없음)
- mercury 시각비: 116.8% (venus 가 mercury 보다 17% 큼 — 과학적 사실 정합)
- sun 시각비: 46.4% (sun 의 약 1/2)
- 픽셀 직경 (1280×720): **98.91px**
- 모바일 누적 차단율: sun 12.26% + mercury 1.94% + venus 2.19% = **16.39%** (한계 25% 까지 8.6%p margin)

### 결정 2 — shortcut-bar `FOCUS_BUTTONS` 1줄 추가 (축 2 후보 A)

`apps/web/src/components/layout/focus-quick-buttons.tsx` 의 `FOCUS_BUTTONS` 배열에 venus 항목을 mercury 다음 (천체 거리 순) 에 1줄 추가:

```typescript
const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' }, // R2 #361
  { id: 'venus', label: '금성' }, // R3 #369
  { id: 'earth', label: '지구' },
  { id: 'jupiter', label: '목성' },
  { id: 'neptune', label: '해왕성' },
];
```

**키바인딩 / aria 변경 없음** — R1+R2 패턴 100% 정합. button 텍스트 "금성" 이 자연 라벨 (axe 0 위반 통과 — R1+R2 사례 일반화).

### 결정 3 — 궤도 라인 렌더 무수정 (축 3 후보 A)

`solar-system-scene.ts:358-378` 의 `rebuildOrbitLines` / `orbit-lines` LineSystem **무수정**. 색상 `Color3(0.25, 0.28, 0.4)` / 두께 default / 투명도 default 모두 R1+R2 박제값 보존. venus 궤도는 `solar-system.json` 데이터 자동 일괄 처리. body mesh 머티리얼도 default StandardMaterial (Q2=A 단색 박제 정확 충족).

### 결정 4 — focus 전환 race r2-focus-race-guard 자동 일반화 (축 4 후보 A)

`r2-focus-race-guard.mjs` **무수정**. body-agnostic 동작 신뢰 (Q4=A). 회귀 가드는 R3 PR 의 D-G2 로 검증. 시각 jitter 가 발견되면 R2 §재검토 트리거 #3 발동 + 후속 이슈 분리.

### 결정 5 — info 패널 / orbit / sync 자동 일반화 (축 5)

`CelestialInfoPanel` / `syncFocusToScene` / `rebuildOrbitLines` / `body mesh material` 모두 R1+R2 박제 인프라 자동 일반화 — **코드 변경 0**. `solar-system.json` 의 venus 데이터 (이미 박제됨) 가 자동 사용.

### 결정 6 — 비-범위 보호 가드

다음은 본 ADR 범위 외 — developer 가 "R3 visible 통합" 명목으로 손대지 않음 (R2 ADR §결과·재검토 조건 §Concrete Prediction 핵심 6 파일 SSoT):

1. **`packages/core/src/scene/solar-system-scene.ts`** — 0 라인 변경 (orbit / mesh / sync 인프라 모두 R1+R2 박제 자동 일반화)
2. **`packages/core/src/scene/tier.ts`** — 0 라인 변경 (R1+R2 비-범위 일관)
3. **`packages/core/src/render/lod.ts`** (또는 lod\*.ts) — 0 라인 변경 (R1+R2 비-범위 일관)
4. **`apps/web/src/components/sim-canvas.tsx`** — 0 라인 변경 (`syncFocusToScene` 자동 일반화)
5. **`apps/web/src/components/panels/celestial-info-panel.tsx`** — 0 라인 변경 (selectedBodyId 일반화)
6. **`packages/core/src/scene/camera-controller.ts`** — 0 라인 변경 (Q4=A — Babylon 자동 폐기 신뢰)

추가 비-범위:

- `packages/shared/data/solar-system.json` — 0 라인 변경 (venus 데이터 이미 박제됨)
- 다른 행성 (earth / mars / jupiter / saturn / uranus / neptune) — R4+ 범위
- venus 표면 텍스처 / 대기 셰이더 / 자전 애니메이션 / 영점 위상 정확도 / PBR — 후속 R-Phase 또는 별도 이슈
- venus 역행 자전 (Q3=A 자전 정지 박제) — info 패널 자전 주기 텍스트 표시는 D-I1 자동 포함

---

## 결과·재검토 조건

### Concrete Prediction (R3 본 검증) — D-X1 SSoT

R2 ADR §결과·재검토 조건 §Concrete Prediction 의 첫 외부 검증. R2 박제 SSoT 인용:

> R3 (금성) 추가 시 본 ADR 결정 1~5 의 자동 일반화 검증:
>
> ```bash
> # R3 PR 머지 후 자동 재현:
> git diff develop...HEAD --stat \
>   apps/web/src/constants/body-scale.ts \
>   apps/web/src/components/layout/focus-quick-buttons.tsx \
>   packages/core/src/scene/solar-system-scene.ts \
>   packages/core/src/scene/tier.ts \
>   packages/core/src/render/lod.ts \
>   apps/web/src/components/sim-canvas.tsx \
>   apps/web/src/components/panels/celestial-info-panel.tsx \
>   packages/core/src/scene/camera-controller.ts
>
> # 예상: body-scale.ts +1 (venus 룩업) / focus-quick-buttons.tsx +1 (FOCUS_BUTTONS 항목)
> # 나머지 6 파일 변경 0 (R1 + R2 인프라 자동 일반화)
> ```

**본 ADR 의 R3 실측 박제 절차**:

1. developer 가 R3 PR 본문에 위 명령 출력 박제
2. 결과 분류:
   - **성공 (예상대로)**: BODY_SCALE +1 / FOCUS_BUTTONS +1 = 2 라인 / 핵심 6 파일 변경 0 / 단위 테스트 1줄 추가 별도 카운트
   - **실패 (a) 추상화 부족**: 핵심 6 파일 중 어느 하나가 변경 발생 + 변경 사유가 인프라 누락 (예: `BODY_SCALE` 룩업 콜백이 venus id 처리 못 함). R2 §재검토 트리거 #4 발동 + 본 ADR amendment 박제 + 일반화 리팩토링
   - **실패 (b) 예외 케이스**: 핵심 6 파일 중 어느 하나가 변경 발생 + 변경 사유가 venus 고유 효과 (예: 머티리얼 분기 — 황백색 알베도, 두꺼운 대기 셰이더, retrograde rotation 시각). R2 §단서 조항 §(b) 예외 케이스 발동 + 본 ADR §재검토 조건 §단서 조항 amendment 박제. **PM Q2=A 단색 박제로 본 케이스 발동 가능성 낮음** — 발동 시 PM Q2 합의 위반 의심 (PM 라운드 재진입 검토)
3. 성공 시 R2 ADR §결과·재검토 조건 §Concrete Prediction 의 정확성 검증 — R4 prediction (earth: ≤ 2 라인, moon 추가 시 ≤ 4 라인) 박제 정밀도 상승

### Concrete Prediction (R4 추가 시 본 R3 인프라 검증)

R3 venusScale=4000 박제 + R4 earth 추가 시:

```bash
# R4 PR 머지 후 자동 재현:
git diff develop...HEAD --stat \
  apps/web/src/constants/body-scale.ts \
  apps/web/src/components/layout/focus-quick-buttons.tsx \
  packages/core/src/scene/solar-system-scene.ts \
  packages/core/src/scene/tier.ts \
  packages/core/src/render/lod.ts \
  apps/web/src/components/sim-canvas.tsx \
  apps/web/src/components/panels/celestial-info-panel.tsx \
  packages/core/src/scene/camera-controller.ts

# 예상: body-scale.ts +1 (earth 룩업) / focus-quick-buttons.tsx 변경 0 (earth 이미 R1 시점에 박제됨)
# 나머지 6 파일 변경 0
# 즉 R4 earth 단독 = 1 라인 (BODY_SCALE 만)
```

**핵심 차이 (R3 vs R4)**: R3 는 FOCUS_BUTTONS 에 venus 신규 추가가 필요했지만, R4 의 earth 는 R1 시점부터 이미 FOCUS_BUTTONS 에 박제되어 있음 (`{ id: 'earth', label: '지구' }`). **R4 = 1 라인** (BODY_SCALE.earth 만).

R4 moon (지구의 위성, parentId="earth") 추가 시:

- moon FOCUS_BUTTONS 진입 여부는 R4 PM 결정 (default body 가 아닐 가능성)
- moon BODY_SCALE 룩업 1줄 (선택)
- 예상: 0~2 라인

본 R3 ADR 의 D-X1 결과 (성공/실패 (a)/실패 (b)) 가 R4 prediction 정밀도를 결정.

### 단서 조항 (R2 §단서 조항 §(b) 예외 분류 본 R3 적용)

R2 ADR §결과·재검토 조건 §단서 조항 (Gemini cross-validate Q3 권고 수용) 박제 인용:

> 금성의 고유 시각 효과 (예: 황백색 알베도 색상, 두꺼운 대기 셰이더) 부여를 위해 `solar-system-scene.ts` 또는 머티리얼 정의 파일에 분기 처리가 필요한 경우 **(b) 예외 케이스로 인정**. R3 ADR 에서 별도 결정 박제 + 본 ADR §결과·재검토 조건 §재검토 트리거 #4 (Concrete Prediction 실패) 가 (a) 추상화 부족이 아닌 (b) 예외로 분류됨을 명시. 머티리얼 분기 처리는 BODY_SCALE 룩업과 직교하므로 R2 의 인프라 재사용 패턴 자체는 유효 (BODY_SCALE / FOCUS_BUTTONS / syncFocusToScene / r1-guard 매트릭스 모두 보존).

**본 R3 PM Q2=A 박제 (단색 머티리얼) 로 (b) 예외 미발동 의도**. D-X1 검증에서 머티리얼 분기 처리 발생 시 PM Q2 합의 위반 의심 — PM 라운드 재진입 또는 본 ADR §재검토 트리거 #2 발동.

### 회귀 가드 (R3 PR DoD)

- **D-V1 / D-V4 검증** — `r1-ui-regression-guard.mjs --measure-coverage` 확장 (또는 `--measure-venus-coverage` 신설) 으로 3 viewport venus 점유율 실측. 1280×720 ≥ 0.5%, 모바일 ≥ 0.5% (산출 예측: 0.69% / 0.69% / 2.19%) ± 0.1% 마진
- **D-F1 / D-F2 / D-F3 회귀 가드** — `r2-focus-race-guard.mjs` 3 시나리오 PASS (body-agnostic 신뢰)
- **D-O1 / D-O2 회귀 가드** — `r1-ui-regression-guard.mjs` (4 영역 mismatch ≤ 0.5%) 통과. 단 shortcut-bar 영역은 baseline 갱신 (별도 r1-guard ADR amendment 절차 — 이미 R2 v3 박제, R3 는 v3 그대로 사용 가능 또는 v4 amendment 박제)
- **D-G1** R1 회귀 — `p329-qa-focus-lod-guard.mjs` 통과 (sun focus 동작 + LOD 시그니처 보존)
- **D-G2** R2 회귀 — r2-focus-race-guard 3 시나리오 PASS (Q4=A body-agnostic 확증)
- **D-G3 60fps** — bench 측정 (R2 baseline 대비 < 5% 회귀)
- **D-G4 모바일 누적 차단율** — sun 12.26% + mercury 1.94% + venus 2.19% = 16.39% (한계 25% 까지 8.6%p margin 유지 박제)
- **D-T1** CI green — r1-guard step 5 통과 + r2-focus-race-guard PASS
- **D-T2** 실 Chrome 수동 검증 — sun ↔ mercury ↔ venus focus 전환 + 모바일 (375×667) 인지 가능 확인 (volt #77 + volt #74)
- **D-T3** axe 0 위반 — shortcut-bar 7 항목 접근성 회귀 없음
- **D-T4** U+FFFD (한글 인코딩 손상 sentinel) 0건 — `grep -rn` 으로 U+FFFD 검증, CLAUDE.md §한글 인코딩 검증 가드

### 재검토 트리거

다음 조건 중 하나면 본 ADR 재검토 (Amendment 또는 신 ADR):

1. **R3 구현 PR 의 실측 viewport 점유율 ± 0.1% 마진 초과** — 산출 예측 (1280×720 0.69% / 1920×1080 0.69% / 모바일 2.19%) 와 실측이 마진 이상 차이. venusScale 재조정 amendment
2. **D-X1 Concrete Prediction 실패** — 핵심 6 파일 중 어느 하나가 변경 발생. 본 ADR §결과·재검토 조건 §Concrete Prediction §실측 박제 절차 §결과 분류 적용:
   - (a) 추상화 부족 — 본 ADR amendment + R2 ADR amendment (R3 가 검증 실패 신호)
   - (b) 예외 케이스 — R2 §단서 조항 발동, 본 ADR §단서 조항 박제. PM Q2 합의 위반 의심 시 PM 라운드 재진입
3. **모바일 2.19% / 누적 16.39% 사용자 피드백 침습성** — D-T2 수동 검증에서 사용자가 "금성이 모바일에서 너무 크다" 또는 "화면이 너무 차단된다" 평가. venusScale 3,000 ~ 3,500 으로 하향 또는 viewport-aware scaling (R1 §축 1 후보 Y 재검토). **Gemini cross-validate 발견 2 (R2 ADR §재검토 트리거 #2 박제)**: 모바일 누적 차단율 R5 (화성) 진입 시 25~30% 도달 위험. 본 R3 가 16.39% 도달 → R4 (지구 추가 시 약 18.94% 예상) → R5 (mars 추가 시 21~22% 예상) → 한계 도달 임박. **R3 cross-validate 권고 1 (Gemini 2026-04-29 강도 상승) 수용**: "R5 진입 전 검토" → **R4 ADR 박제 시점에 viewport-aware scaling 도입 여부를 명시적으로 결정** (능동적 기술 부채 관리 — R5 임박 후 급결정 위험 회피). R4 architect 가 결정을 미루는 경우 본 R3 ADR 의 §재검토 트리거 #3 강제 트리거로 발동 (R4 ADR §결과·재검토 조건 에 viewport-aware scaling 도입 결정 박제 의무)
4. **focus 전환 race 시각 jitter (3-body 첫 사례)** — D-G2 / D-T2 에서 sun ↔ mercury ↔ venus 빠른 전환 시 jitter 발견. R2 §재검토 트리거 #3 발동 (`getAnimatableByTarget` 명시 취소 도입 amendment 후보 B)
5. **카메라 거리 / fov / cameraRadius 변경** — `sim-canvas.tsx:158` 의 `radius: 35` 또는 fov 변경 시 본 ADR §축 1 산출표 무효화. R1+R2 §재검토 트리거 동일
6. **shortcut-bar 7 항목 가로 너비 초과** — 7개 버튼이 TopBar 중앙 영역을 초과하면 layout 변경 또는 dropdown 도입 amendment. R4 (지구 이미 박제) → R5+ (8개+) 진입 시 사전 발동 가능

### 위험 / 미해결

- **모바일 누적 차단율 한계 접근 가속** — 본 R3 16.39% 도달. R4 (지구) 진입 후 약 18.94% → R5 (mars) 진입 후 21~22% → 한계 25% 도달 임박. **R4 ADR 박제 시점에 viewport-aware scaling 인프라 도입 결정 필수** (R3 cross-validate 권고 1 수용 — Gemini 2026-04-29). R4 architect 단계에서 도입 / 미도입 / 부분 도입 (모바일 only) 3 후보 비교 후 결정 박제 의무. 미결정 또는 미루기 금지 (R5 임박 후 급결정 위험 회피)
- **earth scale 단조 감소 패턴 부담** — venusScale=4000 채택으로 R4 earthScale 가 venus 의 0.9배 (3,600 권장). earth.radius=6.371e6 m (venus 의 1.053배) → 시각비 보존 시 earthScale ≈ 4000 / 1.053² ≈ 3,602. 자연 단조 감소 (8500 > 4000 > 3602) 만족 + earth 가 venus 보다 시각비 약간 큼 (실측 비례 자연)
- **Concrete Prediction "≤ 2 라인" 첫 검증 결과 의존** — 본 R3 가 R2 ADR §Concrete Prediction 의 첫 외부 검증. PASS 시 R4~R10 prediction 정밀도 상승 / FAIL 시 (a) 추상화 부족 또는 (b) 예외 케이스 분류 후 amendment. PM Q2=A 단색 박제로 (b) 발동 가능성 낮음
- **3-body focus race 첫 검증** — R3 가 sun + mercury + venus 3-body 첫 사례. r2-focus-race-guard body-agnostic 동작이 3-body 환경에서도 유효함을 D-G2 + D-T2 로 검증. 시각 jitter 발견 시 R2 §재검토 트리거 #3 발동
- **shortcut-bar 7 항목 가로 너비** — 1280×720 TopBar 중앙 영역 약 540px (전체 1280 - 좌측 로고/메뉴 + 우측 HUD). 7개 버튼 + reset = 8 버튼 약 360px → 여유 충분. 단 모바일 (375×667) 에서 TopBar 중앙 영역 좁아 layout overflow 위험 — D-T2 수동 검증 의무
- **R10 누적 시 BODY_SCALE 룩업 비대화 (R2 §위험 일관)** — 10 body × 평균 100자 주석 = 룩업 파일 ~1000 라인. 별도 데이터 파일 분리 검토 가능 (R5+ 에서)

---

## 교차검증 반영 사항

본 ADR 박제 직후 cross-validate 1회 호출 (Gemini 2.5 Pro, 2026-04-29 14:47 KST). outcome=applied (exit 0). 로그: `.claude/logs/cross-validate-architecture-20260429-144713.log` / outcome JSON: `.claude/logs/cross-validate-architecture-20260429-144713-outcome.json`.

Claude 자체 편향 4종 셀프 체크 (호출 전):

- **낙관적 일정 ✓** — R3 는 R1+R2 인프라 100% 재사용으로 코드 변경 ≤ 2 라인. 일정 추가 리스크 매우 낮음 (R1: 코드 수십 라인 / R2: 2 라인 / R3: 2 라인 — 단조 감소 패턴 검증)
- **결합 간과 △** — venusScale=4000 결정과 R4 earthScale 단조 감소 패턴 + 모바일 누적 차단율 한계 접근이 결합. cross-validate 호출 프롬프트에 명시 질문 삽입
- **폐기 프레이밍 ✓** — R1+R2 비-범위 보호 가드 명시 (핵심 6 파일 무수정), 폐기 항목 없음
- **순수주의 △** — "Babylon 자동 폐기 신뢰 = 충분 안전" 사후 정당화 가능성 + venusScale=4000 의 mercury 시각비 117% 가 "과학적 사실 정합" 으로 정당화되지만, 실제로는 모바일 누적 차단율 + DoD margin 38% + 단조 감소 패턴 의 trade-off 결과. cross-validate 호출 프롬프트에 명시 질문 삽입

### 합의 — Claude 설계와 일치 + 본 PR 에 반영

- **6개 검증 영역 모두 우수 평가** — 구조적 완성도 / 기술 결정 타당성 / 인터페이스 명확성 / 확장성 / 보안 / 누락 요소. Gemini 가 "대단히 훌륭한 설계 문서" + "단 2줄의 코드 변경으로 목표 달성 = 시스템 확장성의 증명서" 로 강하게 합의. 결합 간과 △ 우려 해소
- **venusScale=4000 산출 정합 + 다각도 고려** — Gemini 가 "단순히 DoD 만족 최소값이 아닌 안전 마진 (38%) + 과학적 사실 정합성 (수성보다 커 보임) + 미래 확장성 (지구·화성 scale 영향) + 모바일 제약 (누적 차단율) 종합 고려한 매우 합리적 결정" 으로 합의. 순수주의 △ 우려 해소
- **인터페이스 명확성 (모듈 간 계약)** — Gemini 가 "수정되는 부분은 설정 값에 한정 + 핵심 로직 인터페이스 전혀 변경 없음 = 매우 낮은 결합도" 로 강하게 합의. R2 §결정 4 후보 A "Babylon 자동 폐기 신뢰" 의 3-body 환경 유효성 별도 이견 없음
- **위험 요소 식별 (R5 진입 전 viewport-aware scaling)** — Gemini 가 "선제적 대응 통찰력" 으로 합의

### 이견 수용 — Claude 원안 보강

- **권고 1: viewport-aware scaling 도입 결정 시점 구체화** (Gemini 확장성 §개선 제안) — Gemini 권고: "R5 진입 전 검토" 를 **"R4 설계 (ADR) 시점에 도입 여부 결정"** 으로 구체화하여 능동적 기술 부채 관리 + R5 임박 후 급결정 위험 회피. **수용** — 본 ADR §재검토 트리거 #3 + §위험·미해결 §"모바일 누적 차단율 한계 접근 가속" 본문 강화 박제 (cross-validate 직후 amendment):
  - §재검토 트리거 #3: "R5 진입 전 사전 발동 가능" → "R4 ADR 박제 시점에 viewport-aware scaling 도입 여부 명시적 결정 박제 의무" 로 강도 상승
  - §위험·미해결: "R4 ADR 박제 시점에 viewport-aware scaling 인프라 도입 결정 필요" → "필수 + 3 후보 비교 의무 + 미결정/미루기 금지" 로 강도 상승

- **권고 2: Developer 인계 §6 CHANGELOG 파일 경로 명시** (Gemini 누락 요소 §개선 제안) — 다른 파일들처럼 전체 경로 (`CHANGELOG.md`) 명시. **수용** — Developer 인계 §6 박제 강화 (cross-validate 직후 amendment)

### Claude 재분석으로 기각 또는 부분 수용

- **권고 3: ADR Status workflow (Provisional → Accepted)** (Gemini 누락 요소 §개선 제안) — Gemini 권고: "ADR 머지 직후 amendment" 대신 "Provisional 상태로 cross-validate 후 Accepted 로 변경" 워크플로우 도입.
  - **부분 수용 — 본 R3 PR 범위 외**: Gemini 권고 자체는 합리적이나 **현재 R3 ADR 의 §교차검증 반영 사항 섹션은 cross-validate 결과를 박제 직후 amendment 로 박제 (현재 PR 범위 내)** 로 충분 (본 ADR 자체가 그 amendment 박제 사례). ADR Status workflow 일반화는 본 R3 범위 외 — **고유 발견 (후속 분리)** 으로 분류
  - 기각 사유: 현재 모든 R-ADR (R1/R2/R3) 이 "Accepted" 단일 상태 박제 패턴 + workflow 변경은 별도 메타 ADR 또는 harness 결정. 본 R3 PR 에서 workflow 자체 변경은 CRITICAL #6 (스프린트 비-범위) 침범

### 고유 발견 (후속 분리)

#### 발견 1 — ADR Status workflow 표준 박제 (Provisional → Accepted)

**Gemini 분석**: "ADR 이 최종 승인되기 전에 교차검증 결과가 ADR 본문에 통합되고 검토되는 것이 더 바람직. ADR 을 'Provisional (잠정적)' 상태로 두고 교차검증 완료 후 'Accepted (승인)' 상태로 변경하는 워크플로우 고려"

**범위 체크**: 본 R3 PR 의 §"통합 vs 분리 결정 (메타)" 또는 CLAUDE.md §"아키텍처 결정 기록 (ADR)" 섹션의 status 분류 표준화는 **R3 비-범위** (CRITICAL #6 — PM 합의 §비-범위 §"신규 데이터 모델 변경" 정합 + workflow 변경은 별도 메타 ADR). 현재 모든 R-ADR (R1/R2/R3) 이 "Accepted" 단일 상태 박제 패턴.

**후속 이슈 분리** (즉시 생성 의무 — CLAUDE.md §교차검증 §"분리 시 박제 규칙"): 우선순위 medium-low (수치 박제 동작 영향 없음, 프로세스 개선). 후속 이슈 본문에 Gemini 권고 인용 + 본 R3 PR 링크 + 후보 비교 안 (A. 현재 패턴 유지 / B. Provisional → Accepted workflow 도입 / C. 부분 도입 — cross-validate 미수행 ADR 만 Provisional 박제) 박제.

---

## Developer 인계

**시작 지점**:

1. **`apps/web/src/constants/body-scale.ts`** — `BODY_SCALE` 객체에 `venus: 4000` 1줄 추가. 주석 형식 R2 mercury 와 일관 ("R3 #369 — viewport 점유율 ... / mercury 시각비 117% / sun 시각비 46%"). `body-scale.test.ts` 에 `getBodyScale('venus') === 4000` 단위 테스트 1줄 추가
2. **`apps/web/src/components/layout/focus-quick-buttons.tsx`** — `FOCUS_BUTTONS` 배열에 mercury 다음 위치에 `{ id: 'venus', label: '금성' }, // R3 #369` 1줄 추가
3. **회귀 가드 — D-G2 r2-focus-race-guard 3 시나리오 PASS 확인**:
   - `apps/web/scripts/r2-focus-race-guard.mjs` (R2 #361 박제) **무수정**, R3 PR CI step 에서 PASS 확인
4. **r1-guard venus coverage 측정** (D-V1 / D-V4 검증):
   - `apps/web/scripts/r1-ui-regression-guard.mjs` 의 `--measure-mercury-coverage` 패턴 확장 — `--measure-venus-coverage` 신설 또는 통합 (`--measure-coverage` 가 sun/mercury/venus 셋 다 측정)
   - PR 본문에 3 viewport 실측 결과 박제 (예측: 0.69% / 0.69% / 2.19% ± 0.1%)
5. **r1-guard shortcut-bar baseline 갱신** (D-T1):
   - 6→7 버튼 영역 변동 → `r1-ui-regression-guard.mjs --update --viewport=<id>` 로 3 viewport shortcut-bar baseline 갱신 + R3 PR 본문 사유 명시
   - 별도 r1-guard ADR amendment 박제 여부는 R3 architect 또는 reviewer 판단 (현재 R2 v3 amendment 가 "shortcut-bar baseline 갱신 절차" 를 일반화 박제했다면 amendment 추가 불요, 새 절차 추가 시 v4 amendment)
6. **`CHANGELOG.md` `### Behavior Changes`** (Gemini cross-validate 권고 2 — 파일 전체 경로 명시) — R3 visible 진입 항목 박제:
   - "금성 가시성 진입 — `venus: 4000` BODY_SCALE 추가"
   - "shortcut-bar 6→7 항목 (태양 / 수성 / 금성 / 지구 / 목성 / 해왕성)"
   - 분류: **MINOR** (기능 추가 + 행동 변화 — 새 body 가시화)
7. **수동 브라우저 검증 (D-T2 의무 — volt #77 + volt #74)**:
   - 실 Chrome GUI 에서 default 진입 → venus visible 확인 (3 viewport 모두)
   - sun → mercury → venus → reset focus 전환 빠른 클릭 race 확인 (3-body 첫 검증)
   - 모바일 viewport (375×667) 인지 가능성 확인 (2.19% 침습성 평가 + 누적 16.39% 화면 차단 평가)
   - R1+R2 회귀 0 확인 (sun / mercury focus 정상)
   - venus info 패널: "× 4000 과장 중" 또는 "가시성을 위해 4000배 확대" 표시 확인 + 자전 주기 (retrograde 표기 포함) 표시 확인
   - PR 본문에 manual checklist + 스크린샷 첨부
8. **D-X1 Concrete Prediction 실측 박제 (PR 본문)**:
   ```bash
   git diff develop...HEAD --stat \
     apps/web/src/constants/body-scale.ts \
     apps/web/src/components/layout/focus-quick-buttons.tsx \
     packages/core/src/scene/solar-system-scene.ts \
     packages/core/src/scene/tier.ts \
     packages/core/src/render/lod.ts \
     apps/web/src/components/sim-canvas.tsx \
     apps/web/src/components/panels/celestial-info-panel.tsx \
     packages/core/src/scene/camera-controller.ts
   ```
   결과 PR 본문에 박제 + 본 ADR §결과·재검토 조건 §Concrete Prediction §실측 박제 절차 §결과 분류 적용 (성공 / 실패 (a) / 실패 (b))

**참조 문서**:

- 본 ADR (R3 시각화)
- [`20260428-r2-mercury-visualization.md`](20260428-r2-mercury-visualization.md) (R2 SSoT — Concrete Prediction "≤ 2 라인" + 단서 조항 §(b) 예외 분류 박제)
- [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) (R1 sunScale + bodyScale 인프라 SSoT)
- [`20260425-r1-store-scene-sync-unification.md`](20260425-r1-store-scene-sync-unification.md) (focus sync 단일 경로)
- [`20260425-r1-ui-pixel-diff-guard.md`](20260425-r1-ui-pixel-diff-guard.md) (회귀 가드 인프라)
- [`20260424-p11-b-lod-design.md`](20260424-p11-b-lod-design.md) (LOD × scale 합성 순서)
- [`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) (R-Phase 공통 DoD 템플릿)
- 이슈 #369 (R3 PM 합의 본문)
- 이슈 #361 (R2 SSoT 본문)
- volt [#74](https://github.com/coseo12/volt/issues/74) (UX 가시성 회귀 — DoD PASS ≠ 제품 동작)
- volt [#77](https://github.com/coseo12/volt/issues/77) (메인 오케스트레이터 단계 게이트 — 실 브라우저 수동 검증)
- volt [#68](https://github.com/coseo12/volt/issues/68) (엄격 원칙 + 동적 적응 부재 함정)

**비-범위** (절대 손대지 말 것 — R2 §결과·재검토 조건 §Concrete Prediction 핵심 6 파일 SSoT):

1. `packages/core/src/scene/solar-system-scene.ts` — 0 라인 변경
2. `packages/core/src/scene/tier.ts` — 0 라인 변경
3. `packages/core/src/render/lod.ts` (또는 lod\*.ts) — 0 라인 변경
4. `apps/web/src/components/sim-canvas.tsx` — 0 라인 변경
5. `apps/web/src/components/panels/celestial-info-panel.tsx` — 0 라인 변경
6. `packages/core/src/scene/camera-controller.ts` — 0 라인 변경 (Q4=A — Babylon 자동 폐기 신뢰)

추가 비-범위:

- `packages/core/src/scene/tier-transition.ts` — 0 라인 변경 (R1+R2 비-범위 일관)
- `packages/shared/data/solar-system.json` — 0 라인 변경 (venus 데이터 이미 박제)
- `apps/web/scripts/r2-focus-race-guard.mjs` — 0 라인 변경 (Q4=A body-agnostic 신뢰)
- 다른 행성 (earth / mars / jupiter / saturn / uranus / neptune) — R4+ 범위
- venus 표면 텍스처 / 대기 셰이더 / 자전 / 영점 위상 / PBR — 후속 R-Phase
- venus 역행 자전 (Q3=A 박제) — info 패널 자전 주기 텍스트 표시는 D-I1 자동 포함

---

## Amendment 2026-04-30 — Q2=B 비례 결정 전환 (#373 후속)

### 변경 배경

#373 forensic 결과 + 사용자 옵션 (c) 채택 + Gemini cross-validate (outcome=applied):

- R3 박제 시점 (Q2=A 독립 결정) 의 venusScale=4000 이 sun 대비 px 비 45.2% 로 비현실적 비율 형성
- D-T2 사용자 검증 2회차에서 venus + mercury 비율 회귀 발견 (사용자 인지: "달이 너무 커서 어색하다" 류)
- 사용자 인지 단위 = px diameter 비 (현재 area 단위 brightRatio 가드 직교)

### 박제값 갱신 의도

- **venusScale: 4000 → 1500~2200 범위** (구체값 D-T2 검증 후 developer 단계 확정)
- **시각비 박제 갱신**: sun 대비 px 비 45.2% → ~15~20% 자연화

### 가드 단위 갱신

- **(보존)** brightRatio 점유율 ≥ 0.5% (R1 ADR §결정 1 SSoT 일관)
- **(신규)** sun 대비 px diameter 비 ≤ 30% (Q2=B 비례 결정 가드 — venus 는 mercury 보다 큰 본체이므로 ≤ 30% 범위)
- **(신규)** 모바일 (375×667) 누적 disk area ≤ 25%

### 정책 변경

- **폐기**: PM Q2=A "각 body 독립 결정. R3+ 도 각자 독립"
- **신규**: PM Q2=B "각 body 가 sun 대비 px 비 ≤ N% 로 비례 결정" (R-Phase 공통, R4+ 적용)
- 본 amendment 시점부터 R3 도 Q2=B 정책 SSoT 따름

### D-X1 Concrete Prediction 영향

본 amendment 는 박제값 갱신 의도만 박제. **D-X1 (R3 코드 +2 라인 + 핵심 6 파일 변경 0) PASS 결과는 보존** — fix PR 의 변경은 R3 핵심 6 파일과 직교 (`apps/web/src/constants/body-scale.ts` 만). R2 ADR §결과·재검토 조건 §Concrete Prediction 핵심 6 파일 SSoT 회귀 0 유지.

### 후속 검증

- D-T2 사용자 검증 (px 비 자연화 확증)
- r1-guard `--measure-px-ratio` 박제값 PASS
- 모바일 누적 차단율 ≤ 25%

### 교차검증 반영 사항

본 amendment 는 #373 forensic ADR (커밋 `aade809`) 의 cross-validate (Gemini outcome=applied) 커버리지 안 — 별도 cross-validate skip. forensic ADR §교차검증 반영 사항 §고유 발견 4 (R2/R3 ADR amendment 동반 박제 의무) 가 본 amendment 의 의도까지 포괄.

### 재검토 트리거 #4 발동 박제

R3 ADR §재검토 조건 §재검토 트리거 #4 (body 간 비율 회귀 관찰) 가 본 amendment 로 발동. 향후 R4+ body 추가 시 동일 트리거 재발동 시 Q2=B 정책 SSoT 재검토.

### 참조

- #373 forensic ADR [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) §결정 2
- R2 ADR amendment [`20260428-r2-mercury-visualization.md`](20260428-r2-mercury-visualization.md) §Amendment 2026-04-30 (동반 박제)
- Roadmap v3 §6 + §R-Phase 공통 DoD 템플릿 amendment 2026-04-30 (커밋 `20c60c8`)
- volt [#74](https://github.com/coseo12/volt/issues/74) (UX DoD vs 제품 동작), volt [#29](https://github.com/coseo12/volt/issues/29) (결합 간과 편향)

---

## Amendment 2026-05-01 — venusScale 4000 → 1500 확정 (적극값) + Q2=B 임계 강화

> **Status**: Active (2026-05-01 박제, architect 단계)
> **근거 ADR**: [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) Amendment 2026-05-01
> **R1/R2 동반 amendment**: [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) (sunScale 75 → 50) + [`20260428-r2-mercury-visualization.md`](20260428-r2-mercury-visualization.md) (mercuryScale 8500 → 2000)
> **근거 PR**: #377 CLOSED (venusScale=1850 보수값 D-T2 미통과)
> **사용자 결정**: 옵션 c 적극값 (venus=1500) + 옵션 a (sunScale=50) + mercury=2000 동반 채택 (2026-05-01)
> **적용 PR**: feature/373-body-proportion-aggressive (본 amendment 박제 후 developer 단계)

### 확정 박제값 (Amendment 2026-04-30 의 "갱신 의도 → 확정" 전환)

본 ADR §Amendment 2026-04-30 §박제값 갱신 의도 의 "**venusScale 갱신 의도: 4000 → 1500~2200 범위**" 가 사용자 D-T2 검증 결과로 **확정**:

| 항목                   | Amendment 2026-04-30 (의도)      | Amendment 2026-05-01 (확정)              |
| ---------------------- | -------------------------------- | ---------------------------------------- |
| venusScale             | 4000 → **1500~2200 범위** (의도) | 4000 → **1500 (적극값 확정)**            |
| sun 대비 px 비 (목표)  | ~15~20% 자연화                   | sun 대비 ≤ **11%** (강화)                |
| Q2=B 임계              | sun 대비 px 비 ≤ 30%             | sun 대비 px 비 ≤ **11%** (강화)          |
| sunScale 동반 변경     | (보존 — 75)                      | **75 → 50** (R1 amendment 동반 박제)     |
| mercuryScale 동반 변경 | (보존 — 8500)                    | **8500 → 2000** (R2 amendment 동반 박제) |

### D-T2 px 비 예측 (sunScale 50 + venusScale 1500)

forensic 측정 데이터 (`docs/reports/373-debug-output.json`) 기반 산출. wsR / pxDiameter 는 scale 에 선형 비례:

| viewport         | sun pxDiameter (50) | venus pxDiameter (1500)        | sun 대비 venus px 비 | venus disk area | 가드 통과 여부       |
| ---------------- | ------------------- | ------------------------------ | -------------------- | --------------- | -------------------- |
| **1280×720**     | 246.3               | 167.1 × (1500/4000) = **62.7** | **25.5%**            | **0.335%**      | px 비 ≤ 11% **미달** |
| 1920×1080        | 369.4               | **94.0**                       | **25.5%**            | **0.335%**      | 미달 (동일)          |
| 375×667 (모바일) | 228.1               | **58.1**                       | **25.5%**            | **1.058%**      | 미달                 |

**중요**: sun 대비 venus px 비 25.5% 는 본 amendment 의 임계 ≤ 11% 보다 큰 산출이므로 D-T2 사용자 검증 결과에 따라 **forensic ADR §재검토 트리거 #1 가 다시 발동될 수 있음**. 그 경우 venusScale 1000 / 800 등 더 적극값 또는 옵션 (e) log scaling 우선순위 high 승격 경로 박제됨.

### 가드 갱신 (Amendment 2026-04-30 의 갱신값 → Amendment 2026-05-01 적극값)

- **(폐기)** ≥ 0.5% brightRatio 가드 (venus 회색 머티리얼이 sun emissive 대비 sub-임계라 brightRatio 무의미. venus disk area 0.335% 가 ≥ 0.5% 가드 대체)
- **(보존)** Q2=B 비례 결정 가드 — sun 대비 px diameter 비. 임계 강화: **≤ 30% → ≤ 11%**
- **(보존)** 모바일 (375×667) 누적 disk area ≤ 25% — sun 16.34% + mercury 0.297% + venus 1.058% = 17.7% **PASS**
- **(신규)** venus disk area ≥ 0.1% (1280×720) — 절대 가시성 최소 임계. venus 0.335% **PASS**

### D-X1 Concrete Prediction 보존 (R3 ADR §결정 §3 핵심 6 파일 회귀 0)

본 amendment 는 venusScale 박제값 갱신만 — **R3 ADR §결정 3 §D-X1 Concrete Prediction (R3 코드 +2 라인 + 핵심 6 파일 변경 0) PASS 결과 보존**:

- 본 amendment 변경 파일: `apps/web/src/constants/body-scale.ts` 만 (1줄 갱신, R3 §결정 3 의 +2 라인 무영향)
- 핵심 6 파일 (`solar-system-scene.ts` / `tier.ts` / `tier-transition.ts` / `lod.ts` / `lod-body-thresholds.ts` / `sim-canvas.tsx`) 0 라인 변경 — D-X1 Concrete Prediction 효력 유지

### 후속 검증 (본 amendment 의 fix PR 의무)

본 amendment 적용 PR (developer 단계) 에서 다음 박제:

1. `apps/web/src/constants/body-scale.ts` — `venus: 1500` (4000 갱신) + 단위 테스트 갱신
2. `r1-guard --measure-px-ratio` 신설 — forensic ADR §결정 2 §5 Amendment 2026-05-01 명세 그대로 구현 (`venus sunPxRatio ≤ 11%` 가드)
3. `_debug-373-proportion-tmp.mjs` 재실행 — px 비 실측 + 본 amendment 박제값 ± 2% 마진 검증
4. 사용자 D-T2 (실 Chrome GUI 수동) — px 비 자연 비율 평가 (예측 25.5%, 본 amendment 임계 ≤ 11% 미달 가능성 인지)
5. CHANGELOG `### Behavior Changes`: "금성 시각 비율 자연화 (venusScale 4000 → 1500). sun 대비 venus px 비 45.2% → ~25.5% (1280×720)"

### 교차검증 반영 사항

본 amendment 는 forensic ADR Amendment 2026-05-01 의 cross-validate (Gemini 2.5 Pro, 2026-05-01) 커버리지 안 — 별도 cross-validate skip. forensic ADR §Cross-validate 결과 (Gemini 2.5 Pro, 2026-05-01) 가 본 amendment 의 의도까지 포괄.

### 참조

- forensic ADR [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) Amendment 2026-05-01 — 본 amendment 의 근거 SSoT
- R1 ADR [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) Amendment 2026-05-01 (sunScale 75 → 50 동반 박제)
- R2 ADR [`20260428-r2-mercury-visualization.md`](20260428-r2-mercury-visualization.md) Amendment 2026-05-01 (mercuryScale 8500 → 2000 확정)
- Roadmap v3 §6 + §R-Phase 공통 DoD 템플릿 amendment 갱신 (적극값 채택 후속)

---

## Amendment 2026-05-01 (라운드 2) — venusScale 1500 → 650 확정 (적극 재조정)

> **상태**: 라운드 1 박제값 venusScale 1500 의 forensic px 비 예측 25.5% 가 DoD 임계 ≤ 11% 를 **2.32배 초과** → **임계 비례 역산 재조정**. 사용자 (A) 채택 (2026-05-01).
> **선행 박제**: 본 ADR Amendment 2026-05-01 (라운드 1) — venusScale 4000 → 1500 (적극값) 박제 보존
> **근거 ADR**: [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) Amendment 2026-05-01 (라운드 2) §"임계 비례 역산"
> **R2 동반 amendment**: [`20260428-r2-mercury-visualization.md`](20260428-r2-mercury-visualization.md) Amendment 2026-05-01 (라운드 2) (mercuryScale 2000 → 900)

### 결정

`venusScale: 1500 → 650` 적극 재조정 확정.

### 근거 — 라운드 1 박제값 D-T2 임계 초과

라운드 1 박제값 1500 으로 산출한 forensic px 비 예측 25.5% 가 DoD 임계 ≤ 11% 를 2.32배 초과 (forensic ADR §"라운드 1 D-T2 px 비 예측" 박제 보존). 어제 사용자 시각 보고 (venus ~25%) 와 정합 → DoD 미충족 위험 명백. forensic 측정 식 `pxDiameter ∝ scale` 1차 비례로 임계 정렬값 산출:

`venusScale = 1500 × (11 / 25.5) ≈ 647` → **650** (보수 라운딩 + 임계 한계 정렬)

| 항목                     | Amendment 2026-05-01 (라운드 1) | Amendment 2026-05-01 (라운드 2)         |
| ------------------------ | ------------------------------- | --------------------------------------- |
| venusScale               | 1500 (적극값)                   | **650 (적극 재조정)**                   |
| sun 대비 px 비 예측      | 25.5% (1280×720)                | **~11.0% (1280×720)** (예측, 임계 한계) |
| 라운드 1 → 라운드 2 차이 | -                               | **2.32배 축소** (임계 비례 역산)        |

### 라운드 1 박제값 1500 의 D-T2 임계 초과 박제 보존

본 amendment 는 라운드 1 박제값 `venusScale 1500` 의 임계 초과 사실을 **삭제하지 않고 보존**. forensic ADR §"라운드 1 D-T2 px 비 예측" 의 25.5% 산출이 trace 가능하도록 라운드 1 amendment 본문 유지. 라운드 2 결정의 trace = "왜 라운드 1 (1500) 에서 라운드 2 (650) 으로 재조정했는가" → forensic ADR Amendment 2026-05-01 (라운드 2) §"임계 비례 역산" SSoT.

### D-T2 px 비 예측 갱신 (라운드 2)

- venus sun 대비 ≤ 11% 통과 예측 (목표 = 임계 한계, 임계 비례 역산 정렬)
- venus pxDiameter ~27.2 (라운드 1 ~62.8 의 ~43% 수준)
- 측정 노이즈 ± 5% 마진 안에 들어와야 통과

### 가드 갱신 — 라운드 1 임계 보존

본 ADR Amendment 2026-05-01 (라운드 1) §"가드 갱신" 의 brightRatio + sun 대비 px 비 ≤ 11% 임계는 **그대로 보존**. 박제값만 650 으로 갱신:

1. r1-ui-regression-guard 의 brightRatio 가드 — 라운드 1 명세 그대로 유지 (sunScale 50 baseline 변경 없음)
2. `r1-guard --measure-px-ratio` 신설 — forensic ADR §결정 2 §5 Amendment 2026-05-01 (라운드 1) 명세 그대로 구현. **venus 임계 sun 대비 ≤ 11%** (라운드 2 박제값 650 의 통과 목표)
3. venus 색감/명도 (R3 라운드 1 채택값) 그대로 유지
4. `body-scale.test.ts` 박제값 단위 테스트 — `venus: 650` 정확 일치 검증 (라운드 1 의 1500 단위 테스트 갱신)

### D-X1 (R3 코드 +2 라인) PASS 결과 보존

본 ADR Amendment 2026-05-01 (라운드 1) 의 R3 코드 +2 라인 PASS 결과 (R3 #369 PR #371 박제) 는 **그대로 보존**. 라운드 2 박제값 갱신은 `body-scale.ts` 의 venus 상수값만 변경 (+0 라인). R3 코드 변동 영역 (`body-scale.ts` venus 항목 1라인 + R3 PR #371 의 shortcut-bar venus 항목 1라인 = +2 라인) 은 라운드 2 에서도 누적 +2 라인 유지.

### 모바일 누적 disk area 라운드 2 갱신

라운드 1 박제값 1500 적용 시 (375×667 viewport) venus 모바일 점유율 추산보다 라운드 2 (venusScale 650) 가 더 작음:

- venus disk area 비율: `(650 / 1500)² ≈ 0.19` → 라운드 1 추산값의 19% 수준
- #380 분리 회귀 우려 (모바일 점유율) 는 라운드 2 에서 더욱 완화

### Cross-validate (라운드 2)

본 amendment 는 forensic ADR Amendment 2026-05-01 (라운드 2) §Cross-validate 결과 의 cross-validate (Gemini 2.5 Pro, 2026-05-01) 커버리지 안 — 별도 cross-validate skip. forensic ADR 라운드 2 cross-validate 결과가 본 amendment 의 의도까지 포괄.

### 참조 (라운드 2)

- forensic ADR Amendment 2026-05-01 (라운드 2) — 본 amendment 의 근거 SSoT
- R1 ADR Amendment 2026-05-01 §"라운드 2 결정" (sunScale 50 그대로 유지)
- R2 ADR Amendment 2026-05-01 (라운드 2) — mercuryScale 2000 → 900 동반 박제

---

## Amendment 2026-05-03 (라운드 3) — venusScale 650 → 800 (사실 비율 강화 D-1)

> **상태**: 라운드 2 박제값 (venus 650) 의 사실 비율 도달률 72% 미충족. forensic ADR `20260430-r3-followup-body-proportion.md` Amendment 2026-05-03 (라운드 3) §"D-1 / D-2 / D-3 후보 비교" 채택 D-1 결과.
> **선행**: 본 ADR Amendment 2026-05-01 (라운드 2) — venusScale 1500 → 650.
> **트리거**: 사용자 D-T2 (PR #384, 2026-05-01) "전체적인 비율은 개선됨 / 실제 비율적으론 아직 맞지 않는 듯" 부분 통과 → venus > mercury 사실 비율 (`6052/2440 = 2.48배`) 강화 라운드 3 진입.

### 결정

- `venusScale: 650 → 800` (사실 비율 강화 D-1, 라운드 3)
- mercury 동반 박제: `900 → 700` (R2 ADR Amendment 2026-05-03 라운드 3 SSoT)
- sun 보존: `50` (R1 ADR Amendment 2026-05-01 라운드 1)

### 근거 (forensic ADR D-1 채택 4축)

forensic ADR `20260430-r3-followup-body-proportion.md` Amendment 2026-05-03 (라운드 3) §"D-1 / D-2 / D-3 후보 비교" 의 4축 평가에서 D-1 (mercury 700 / venus 800) 채택. **venus/mercury 시각비 = `(6052×800)/(2440×700) = 2.83배`** (사실 비율 2.48배의 **114%**).

본 amendment 는 venus 측 박제값 갱신 — 라운드 2 와 동일하게 `body-scale.ts` 의 venus 상수값만 변경 (+0 라인). R3 코드 변동 영역 (PR #371 의 shortcut-bar venus 항목 1라인 + body-scale.ts venus 1라인 = +2 라인) 은 라운드 3 에서도 누적 +2 라인 유지.

### 라운드 3 venus 영향 박제

| 항목                                          | 라운드 2 (venus 650) | 라운드 3 D-1 (venus 800) | 변동           |
| --------------------------------------------- | -------------------- | ------------------------ | -------------- |
| pxDiameter (1280×720, dpr=1, T1 default)      | ~27.2 px             | **~33.5 px** (예측)      | +6.3 px (+23%) |
| pxDiameter 저점 (1280×720, dpr=1, far)        | 12.39 px (low/mid경계) | **15.27 px (mid)** (예측) | +2.88 px       |
| pxDiameter 고점 (1920×1080, dpr=2, close)     | 39.26 px (mid)       | **48.4 px (mid 한계)** (예측) | +9.14 px       |
| sun 대비 px 비 (1280×720)                     | ~11.03%              | **~13.58%** (예측)       | +2.55%p        |
| 모바일 disk area (375×667, baseline)          | ~2.19%               | **~3.32%** (예측)        | +1.13%p        |
| LOD 분포 (16 cell)                            | low 3 / mid 13       | **low 0 / mid 16** (예측) | low -3 (전부 mid) |
| sphere mesh 인지 강화                         | viewport별 변동      | **모든 viewport mid 일관** | 시각 일관성 향상 |

**LOD 일관성**: D-1 venus 고점 48.4px 가 high 임계 50 직전 (마진 1.6px). **모든 viewport 에서 mid 일관 유지** (high 미진입). 사용자 D-T2 평가 시 "venus 가 viewport 무관하게 일관되게 더 큰 행성으로 보임" 인지.

**D-3 (venus 900) 기각 근거**: 고점 54.4 px > high 임계 50 → viewport 별 high (32세그) ↔ mid (12세그) 전환 발생. dpr=1 환경에서 mid, dpr=2 close 에서 high 로 LOD 변동 시 segment / lighting 차이로 viewport 별 시각 불일치.

### r1-guard `--measure-px-ratio` venus 임계 갱신

라운드 2 amendment §"가드 갱신" 의 venus 임계 (sun 대비 ≤ 11%) 는 strict 박제. 라운드 3 박제값 (venus 800) 의 ±5% 마진 (라운드 2 SSoT 정책 보존) 적용:

- 라운드 2 strict: venus sun 대비 ≤ 11%
- 라운드 3 D-1 ±5% 마진: venus sun 대비 ≤ **14.26%** (예측 13.58% × 1.05, 소수점 둘째 자리 보수 라운딩)

`apps/web/scripts/r1-ui-regression-guard.mjs` `PX_RATIO_THRESHOLDS.venus` 갱신 의무 (developer 단계). ±5% 마진 정책 SSoT 보존.

### 가드 갱신 — 라운드 2 패턴 보존

본 amendment 는 라운드 2 amendment §"가드 갱신" 의 4종 가드 (brightRatio / px 비 / 색감 / 단위 테스트) 패턴 그대로 유지:

1. `r1-guard --measure-px-ratio` venus 임계 — `14.26%` 갱신 (위 SSoT)
2. venus 색감/명도 (R3 라운드 1 채택값) 그대로 유지 — 색상은 `body-scale` 과 직교
3. `body-scale.test.ts` 박제값 단위 테스트 — `venus: 800` 정확 일치 검증 (라운드 2 의 650 단위 테스트 갱신)
4. 모바일 누적 disk area 가드 (≤ 25%) — D-1 누적 16.75% 통과 검증 (라운드 2 16.39% 대비 +0.36%p 증가)

### D-X1 (R3 코드 +2 라인) PASS 결과 보존

본 ADR Amendment 2026-05-01 (라운드 1) 의 R3 코드 +2 라인 PASS 결과 (R3 #369 PR #371 박제) 는 **그대로 보존**. 라운드 3 박제값 갱신은 `body-scale.ts` 의 venus 상수값만 변경 (+0 라인). R3 코드 변동 영역 (`body-scale.ts` venus 항목 1라인 + R3 PR #371 의 shortcut-bar venus 항목 1라인 = +2 라인) 은 라운드 3 에서도 누적 +2 라인 유지.

### 모바일 누적 disk area 라운드 3 갱신

라운드 2 박제값 650 → 라운드 3 D-1 800 적용 시 (375×667 viewport):

- venus disk area 비율: `(800 / 650)² ≈ 1.515` → 라운드 2 추산값의 152% 수준 (mercury 인하분 -0.77%p 동반)
- 모바일 누적: 16.39% (라운드 2) → **~16.75%** (라운드 3 D-1, 마진 +8.25%p)
- ≤ 25% 가드 통과 안전 영역 보존

#380 분리 회귀 우려 (모바일 점유율) 는 라운드 3 에서도 가드 안에 머물지만 라운드 2 대비 **+0.36%p 증가 trend** 박제 — venus 사실 비율 강화 trade-off 의 일부.

### Cross-validate (라운드 3)

본 amendment 는 forensic ADR `20260430-r3-followup-body-proportion.md` Amendment 2026-05-03 (라운드 3) §"Cross-validate 결과 (라운드 3)" 의 cross-validate 커버리지 안 — 별도 cross-validate skip. forensic ADR 라운드 3 cross-validate 결과가 본 amendment 의 의도까지 포괄.

### 참조 (라운드 3)

- forensic ADR Amendment 2026-05-03 (라운드 3) — 본 amendment 의 근거 SSoT (D-1 채택 4축)
- R1 ADR (sunScale 50 그대로 유지, 라운드 1/2/3 보존)
- R2 ADR Amendment 2026-05-03 (라운드 3) — mercuryScale 900 → 700 동반 박제 (D-1 채택)
- 이슈 #385 — 라운드 3 architect → developer → qa → 사용자 D-T2 표준 흐름
- PR #394 Phase 2 (#391) — 4px fallback alpha mask 정책. 라운드 3 venus 저점 15.27 px 가 4px 마진 11.27 px 안전 영역
