# ADR: R2 수성 가시성 — mercuryScale + shortcut-bar 항목 + orbit 라인 + focus 전환 race condition

- **상태**: Accepted
- **날짜**: 2026-04-28
- **결정자**: architect (#361 R2 PM 합의 라운드 2 후 위임)
- **관련**: #361 (본 R2 스프린트), #357 (sentinel 정책 amendment — Q3=B 통합), `20260425-r1-sun-visualization.md` (R1 시각화 SSoT — Concrete Prediction "R2 추가 시 코드 변경 ≤ 3 라인"), `20260425-r1-store-scene-sync-unification.md` (focus sync 단일 경로), `20260425-r1-ui-pixel-diff-guard.md` (회귀 가드 인프라 + 본 R2 동반 amendment v3), `20260424-p11-b-lod-design.md` (LOD × scale 합성 순서), `20260424-tier-naming-policy.md`, `20260422-floating-origin.md`
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (volt #21, R1 인프라 100% 재사용 — `BODY_SCALE` 룩업 / `syncFocusToScene` helper / r1-guard 매트릭스), "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (R1 §결과·재검토 조건 의 Concrete Prediction R2 코드 변경 ≤ 3 라인 검증), "headless 브라우저 검증 ≠ 실 브라우저" (volt #77 — 실 Chrome GUI 수동 검증 R2 DoD 명시), "DoD PASS ≠ 제품 동작" (volt #74 — 0.5% 점유율 PASS 자체로는 모바일 인지 가능 보장 안 됨 — D-V4 별도), "엄격 원칙 + 동적 적응 부재 함정" (volt #68 — 0.5% 정량 임계가 모바일 viewport 1250px² 에서 인지 가능한지 별도 검증)

---

## 통합 vs 분리 결정 (메타)

본 ADR 은 R2 시각화 결정 4건 통합. sentinel 정책 amendment (Q3=B 통합 결정) 는 별도 — `20260425-r1-ui-pixel-diff-guard.md` 의 **Amendment v3** 로 박제 (인프라 SSoT 응집).

### R3~R10 의 ADR 박제 패턴 SSoT

R1 은 3개 ADR 분리 (visualization / store-scene-sync / ui-pixel-diff-guard) 였다. R2~R10 은 동일 분리 비효율 — 시각화 + sync + guard 3 인프라가 R1 에서 박제된 후 R2+ 는 단일 body 추가의 **데이터 + 미세 결정** 만 담당. 따라서:

- **R2 본 ADR 패턴 = R3~R10 표준 SSoT** — 단일 body 의 시각화 결정 4건 (scale / shortcut / orbit / focus race) 을 단일 ADR 로 통합. 파일명 `<YYYYMMDD>-r<N>-<body>-visualization.md`
- **회귀 가드 인프라 amendment** — sentinel 정책 / baseline 갱신 절차 변경은 `20260425-r1-ui-pixel-diff-guard.md` 의 amendment 누적 (v3 / v4 / ...) — guard SSoT 의 응집을 보호
- **store-scene-sync 무수정** — R1 §Concrete Prediction "R2~R10 코드 변경 0" 검증 — R2 가 검증해야 할 첫 케이스 (본 ADR §결정 4 의 검증)

근거:

1. **결정 의존성** — mercuryScale (시각비) 과 shortcut-bar / orbit / focus race 는 모두 "수성을 어떻게 보여줄까" 에 응집. 분리 시 ADR 간 cross-link 부담 R3~R10 에서 N배 증폭
2. **R1 인프라 재사용 명시** — 본 ADR 은 R1 ADR 들의 SSoT 를 **참조만** 하고 변경 안 함 (변경 없음 = 본 ADR 본문이 짧음 = 통합 비용 낮음)
3. **롤백 독립성** — mercuryScale 만 amendment 로 조정 가능 (시각비 재조정), shortcut/orbit/focus race 는 결정 후 변경 빈도 매우 낮음. 단일 ADR 의 amendment 분기로 충분

---

## 배경

### Roadmap v3 §R2 진입 조건

[`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) §R-Phase 공통 DoD 템플릿 + §"R2: R1 + 수성" 에 따라 R2 는 R1 위에 **수성을 명시적으로 visible 하게 추가**. PM 합의 (#361):

- **Q1**: 가시성 측정 = **별도 임계값** (수성 viewport 점유율 ≥ 0.5%, R1 sun 의 ≥ 3% 보다 작음 — 수성 inner 행성 본질)
- **Q2**: 수성-태양 비율 = **독립 결정** (sunScale=75 유지, mercuryScale 만 독립 측정)
- **Q3**: r1-guard `shortcut-bar` baseline 갱신 절차 = **#357 amendment 와 통합** (별도 r1-guard ADR amendment v3)

### 현재 baseline 실측 (2026-04-28 develop tip)

R1 박제 상태 (`apps/web/src/constants/body-scale.ts`):

```typescript
export const BODY_SCALE = Object.freeze({
  sun: 75,
});
```

수성 (`packages/shared/data/solar-system.json`):

- `id: "mercury"`, `radius: 2.4397e6` m (sun 의 0.351%, 즉 **1/285** 비율)
- `mass: 3.3011e23` kg

수성은 현재 BODY_SCALE 룩업 미정의 → `getBodyScale('mercury') === 1.0` (실측 그대로) → T1 solar tier (`renderScale = 8.4e-11`) 에서 mesh diameter ≈ `2.4397e6 × 2 × 8.4e-11 × 1 = 4.10e-4` scene unit → 1280×720 viewport 에서 pixel diameter ≈ `0.01px` (sub-pixel, 사용자 인지 불가). LOD 분기는 `effectiveRadius = body.radius × 1` 입력 → `screenCoverage` < 8px → `createBodyBillboard` (low LOD) 로 분류 (#333 Phase 2 amendment 에 의해 billboard 는 bodyScale 미적용 — 하지만 본 amendment 는 R2 mercury 도 자동 호환).

### R1 ADR §결정 1 의 산출식 + R2 적용

본 ADR §"mercuryScale 결정" 은 R1 ADR §결정 1 의 점유율 산출식을 그대로 적용:

```
diameter (scene unit) = body.radius (m) × 2 × renderScaleForTier('solar') × scale
                      = body.radius × 1.68e-10 × scale

px_diameter = diameter × viewportH / (cameraRadius × 2 × tan(fov / 2))
            = body.radius × 1.68e-10 × scale × viewportH / (35 × 2 × 0.4228)

coverage = π × (px_diameter / 2)² / (W × H)
```

### 기존 자산 재사용 조사 ("신규 함수 ≠ 신규 구현")

| 자산                                                     | 위치                                                                    | 본 ADR 처리                                                                                                     |
| -------------------------------------------------------- | ----------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------- |
| `BODY_SCALE` 룩업 + `getBodyScale`                       | `apps/web/src/constants/body-scale.ts`                                  | **확장** — `mercury: <N>` 1줄 추가 (Concrete Prediction R1 §결과 검증)                                          |
| `createSolarSystemScene({ bodyScale })` 옵션 콜백        | `packages/core/src/scene/solar-system-scene.ts`                         | **재사용 — 코드 변경 0** (`getBodyScale` 자동 일반화)                                                           |
| `createBodyMesh*` diameter 계산식                        | 동 파일 (R1 §결정 3 박제)                                               | **재사용 — 코드 변경 0** (`bodyScale(body.id)` 자동 일반화)                                                     |
| `screenCoverageRadius` effective radius 입력             | 동 파일 (R1 §결정 4 박제)                                               | **재사용 — 코드 변경 0**                                                                                        |
| `syncFocusToScene` helper                                | `apps/web/src/components/sim-canvas.tsx` (store-scene-sync ADR §결정 4) | **재사용 — 코드 변경 0** (mercury id 도 동일 path)                                                              |
| `FOCUS_BUTTONS` 배열                                     | `apps/web/src/components/layout/focus-quick-buttons.tsx`                | **확장** — `{ id: 'mercury', label: '수성' }` 1줄 추가                                                          |
| `CelestialInfoPanel` (수성 데이터 표시)                  | `apps/web/src/components/panels/celestial-info-panel.tsx`               | **재사용 — 코드 변경 0** (selectedBodyId 일반화)                                                                |
| 궤도 라인 `MeshBuilder.CreateLineSystem`                 | `solar-system-scene.ts:373`                                             | **재사용 — 코드 변경 0** (`rebuildOrbitLines` 가 모든 body 자동 일괄 처리, 색상 `Color3(0.25, 0.28, 0.4)` 일관) |
| `Animation.CreateAndStartAnimation` (camera focus tween) | `camera-controller.ts:52`                                               | **재사용 — 코드 변경 0** (동일 property 이름 `cam-target` / `cam-radius` 자동 폐기·재시작)                      |
| r1-guard 4 sentinel × 3 viewport 매트릭스                | `apps/web/scripts/r1-ui-regression-guard.mjs`                           | **재사용 + baseline 갱신** (shortcut-bar 만 — 별도 r1-guard ADR amendment v3)                                   |

**신규 구현**: BODY_SCALE 룩업 1줄 + FOCUS_BUTTONS 1줄 = **총 2줄** (R1 Concrete Prediction "R2 추가 시 코드 변경 ≤ 3 라인" 만족).

---

## 후보 비교

### 축 1 — `mercuryScale` 구체값 (D-V2)

#### 점유율 산출 — 11 candidates × 3 viewport

R1 ADR §결정 1 산출식 적용. mercury.radius = 2.4397e6 m, sun=75 baseline (213.3px / 1280×720) 비교.

| scale                  | 1280×720 (px / %)    | 1920×1080 (px / %)    | 375×667 (px / %)     | sun 시각비 (1280×720) |
| ---------------------- | -------------------- | --------------------- | -------------------- | --------------------- |
| × 1500                 | 14.96px / **0.019%** | 22.44px / 0.019%      | 13.86px / 0.060%     | 7.0%                  |
| × 2000                 | 19.94px / **0.034%** | 29.91px / 0.034%      | 18.47px / 0.107%     | 9.4%                  |
| × 2500                 | 24.93px / **0.053%** | 37.39px / 0.053%      | 23.09px / 0.167%     | 11.7%                 |
| × 3000                 | 29.91px / **0.076%** | 44.87px / 0.076%      | 27.71px / 0.241%     | 14.0%                 |
| × 4000                 | 39.89px / **0.136%** | 59.83px / 0.136%      | 36.95px / 0.429%     | 18.7%                 |
| × 5000                 | 49.86px / **0.212%** | 74.78px / 0.212%      | 46.19px / 0.670%     | 23.4%                 |
| × 6000                 | 59.83px / **0.305%** | 89.74px / 0.305%      | 55.42px / 0.965%     | 28.1%                 |
| **× 7500**             | **74.78px / 0.477%** | **112.18px / 0.477%** | **69.28px / 1.507%** | **35.1%**             |
| × 7700 (DoD 정확 임계) | 76.77px / 0.500%     | 115.16px / 0.500%     | 71.13px / 1.582%     | 36.0%                 |
| × 10000                | 99.71px / **0.847%** | 149.57px / 0.847%     | 92.37px / 2.679%     | 46.8%                 |
| × 15000                | 149.57px / 1.906%    | 224.35px / 1.906%     | 138.56px / 6.028%    | 70.1%                 |
| × 20000                | 199.43px / 3.389%    | 299.14px / 3.389%     | 184.75px / 10.717%   | 93.5%                 |

**0.5% DoD 동시 만족 최소 scale**: 1280×720 / 1920×1080 둘 다 7,682 (16:9 동일 종횡비 + 동일 fov + 동일 카메라 거리 → coverage 동일). 모바일 (375×667) 은 종횡비 9:16 으로 viewport 짧은 변이 짧아 동일 scale 에서 더 큰 coverage → mobile 최소 = 4,320.

**3 viewport 동시 만족 = 7,700+** (안전 margin 포함 ≈ 7,700~10,000).

#### 후보 평가

| 후보                          | 점유율 (1280×720) | 점유율 (모바일) | 시각비 (sun 대비) | 평가                                                                                                                                                                       |
| ----------------------------- | ----------------- | --------------- | ----------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. × 7,500**                | 0.477%            | 1.51%           | 35.1%             | DoD 0.5% **0.023%p 미달** — 스프린트 §5 재조정 트리거 가능. 시각비 35% 자연스러움 양호. **탈락** (PM 계약 침범)                                                            |
| **B. × 7,700 (DoD 정확)**     | 0.500%            | 1.58%           | 36.0%             | DoD 정확 임계. 산출 오차 ±0.5% 마진 부족 시 회귀 위험. **탈락** (margin 부족)                                                                                              |
| **C. × 8,500 (margin 1.5×)**  | 0.612%            | 1.94%           | 39.9%             | DoD 0.612% (margin +0.112%p, 약 22% 여유) — pixel diff / coverage 측정 노이즈 흡수. 시각비 40% (sun 의 약 1/2.5) — "수성이 태양보다 작다" 자연스러움 만족. **선택 후보 1** |
| **D. × 10,000**               | 0.847%            | 2.68%           | 46.8%             | DoD 마진 풍부. 시각비 47% — sun 의 거의 1/2 크기, 모바일 2.68% 침습 심함. **탈락** (시각비 과도)                                                                           |
| E. viewport-aware 동적 식     | (varies)          | (varies)        | (varies)          | R1 §축 1 후보 Y 와 동일 사유 탈락 (수식 도입 = "신규 데이터 ≠ 신규 코드" 위배 + R3~R10 식 재검토 부담)                                                                     |
| F. mercury 단독 별도 LOD rule | —                 | —               | —                 | LOD ADR §결정 §3 "high/mid/low 외 도입 금지" + LOD 책임 ("얼마나 섬세하게") 과 시각 과장 책임 분리 위배                                                                    |

#### 선택: **후보 C — `mercuryScale = 8500`**

근거:

1. **DoD 0.5% 마진 22%** — 산출식이 카메라 fov / radius / renderScale 에 의존하므로 ±5% 노이즈 흡수 필요 (sun 사례에서 R1 ADR §결정 1 표 1920×1080 6.18% 박제값과 본 산출 3.88% 차이 가능성 — 둘 중 하나가 검증 오류). margin 1.5× 가 안전
2. **시각비 40%** — sun 의 절반 미만, 사용자가 "수성이 태양보다 작다" 직관 만족 (R3 금성 → R4 지구 → ... 진행 시 비율 단조 증가 부담 분담)
3. **모바일 1.94%** — DoD 0.5% 의 약 4배. 모바일 viewport 면적 250,125px² 에서 4,852px² (수성 disk 면적) → 사용자 인지 가능 + 화면 차단 없음 (sun 12.26% 와 합쳐도 약 14%, < 25% 자연스러움 임계)
4. **단순 정수** — 8,500 은 직관적 (75 × 113.3 ≈ 8,500, 사용자가 dev 콘솔에서 읽기 쉬움)
5. **R3~R10 비율 부담 minimum** — 향후 venus/earth/mars 가 mercury 보다 visible 하려면 mercuryScale × 비율 부담을 가져야 함. mercuryScale=8500 은 mercury 가 sun 의 47% 시각비. R3 venus 를 mercury 보다 약간 크게 (viewport 점유율 0.6%~0.8%) 잡으려면 venusScale ≈ 5,500~7,000 (venus.radius=6.0518e6 m, mercury 의 2.48배). 단조 감소 패턴 가능

#### Concrete Prediction (R3 추가 시)

**Prediction**: R3 (금성) 추가 시 `apps/web/src/constants/body-scale.ts` 에 `venus: <N>` 1줄 추가만으로 시각화 처리 완료. `solar-system-scene.ts` / `sim-canvas.tsx` / `tier.ts` / `lod*.ts` / `focus-quick-buttons.tsx` 의 **코드 변경 라인 합계 = 2** (BODY_SCALE 1줄 + FOCUS_BUTTONS 1줄).

검증 절차 (R3 PR 자동 재현):

```bash
git diff develop...HEAD --stat \
  apps/web/src/constants/body-scale.ts \
  apps/web/src/components/layout/focus-quick-buttons.tsx \
  packages/core/src/scene/solar-system-scene.ts \
  packages/core/src/scene/tier.ts \
  packages/core/src/render/lod.ts \
  apps/web/src/components/sim-canvas.tsx
# body-scale.ts +1 / focus-quick-buttons.tsx +1 / 나머지 4 파일 변경 0
```

#### 모바일 인지 가능성 별도 검증 (D-V4) — volt #68 적용

PM 본문 §위험 §1 "≥ 0.5% 가 모바일 (375×667 = 1250px²) 에서 사용자 인지 가능한가" — 본 ADR §축 1 후보 C 채택 시 모바일 점유율 1.94% (4,852px² disk) → 사용자 인지 가능. 단 **headless 검증만으로는 부족** (volt #68 — 단일 축 원칙 + 동적 적응 부재 함정 + volt #74 — DoD PASS ≠ 제품 동작). developer 가 R2 PR 에서 실 모바일 Chrome (375×667) 으로 수동 확인 의무 (D-T2).

### 축 2 — shortcut-bar 수성 항목 키바인딩 / aria (D-S1)

#### 현재 R1 의 sun 항목 패턴 실측

`apps/web/src/components/layout/focus-quick-buttons.tsx` 발췌:

```typescript
const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'earth', label: '지구' },
  { id: 'jupiter', label: '목성' },
  { id: 'neptune', label: '해왕성' },
];
// ...
<button
  key={b.id}
  type="button"
  data-testid={`focus-${b.id}`}
  onClick={() => sendCommand({ type: 'focusOn', bodyId: b.id })}
  className="..."
>
  {b.label}
</button>
```

**관찰**:

- 키바인딩 자체가 **현재 부재** — 클릭만 지원. R1 도 sun 항목에 키바인딩 박제 없음
- aria 속성: 명시적 `aria-label` 없음 (button 텍스트가 직접 라벨 역할). `data-testid` 만 박제
- Korean label 사용 (`태양`, `지구`, `목성`, `해왕성`) — `nameKo` 자연 사용

#### 후보 비교

| 후보                                                             | 키바인딩    | aria                         | 평가                                                                                                                                              |
| ---------------------------------------------------------------- | ----------- | ---------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. R1 패턴 그대로 (키바인딩 없음, aria 무박제, label="수성")** | 없음        | 텍스트 라벨 (button 본문)    | R1 정합성 100%. 신규 키바인딩 도입 시 R3~R10 까지 N개 키 정합성 부담. **선택**                                                                    |
| B. 숫자 키 (1=sun / 2=mercury / ...)                             | 1~9 + 0     | `aria-keyshortcuts="1"`      | R3~R10 까지 10 body 매핑 가능하지만, 사용자 입력 input 필드 (date-time-picker, 검색 등) 와 충돌 가능. 컨텍스트 가드 (포커스 input 무시) 추가 필요 |
| C. 단축 한글 (M=mercury)                                         | 단일 알파벳 | `aria-keyshortcuts="m"`      | 한국어 label 과 직관 불일치 (사용자가 "수성=M" 매핑 인지 학습 필요). 단어 시작 영문이 한글 제목이라 매핑 임의적                                   |
| D. Cmd/Ctrl + 숫자 (Cmd+2=mercury)                               | 수정자 키   | `aria-keyshortcuts="Meta+2"` | 브라우저 단축키 (Cmd+2 = 두 번째 탭) 와 충돌                                                                                                      |

#### 선택: **후보 A — 키바인딩 무박제, label="수성"**

근거:

1. **R1 패턴 100% 일치** — R1 PR #332 가 키바인딩 미박제로 머지됨. R2 가 신규 키바인딩 도입 시 R1 회귀 (ESC 외 키바인딩 부재 계약 깨짐 + R3~R10 매핑 강제)
2. **단순성** — 키바인딩은 별도 스프린트 (UX 개선 R-Phase 또는 후속 이슈) 에서 일괄 도입이 ROI 높음. 현재는 클릭만으로 충분 (PM Q1 합의 = 가시성 임계만, UX 향상 비-목표)
3. **aria 자연 라벨** — button 텍스트 "수성" 이 Screen Reader 에 그대로 읽힘 (axe 0 위반 통과 — 이미 R1 #332 검증 완료). 추가 `aria-label` 도입 시 텍스트와 중복 (axe `aria-label-redundant` 경고 가능)
4. **충돌 검증 0** — 현재 about-modal 의 ESC 외 키 핸들러 부재 (`grep keydown` 결과 confirmed). 키바인딩 무박제 = 충돌 검증 자체 불요

#### Developer 박제 의무

`focus-quick-buttons.tsx` 의 `FOCUS_BUTTONS` 배열에 다음 1줄 추가:

```typescript
const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' }, // R2 #361
  { id: 'earth', label: '지구' },
  // ...
];
```

**위치**: sun 다음 (천체 거리 순서 자연 정렬). 기존 earth/jupiter/neptune 위치 보존.

### 축 3 — 수성 궤도 라인 렌더 (D-O1)

#### 현재 baseline 실측 (`solar-system-scene.ts:358-378`)

```typescript
let orbitLines: ReturnType<typeof MeshBuilder.CreateLineSystem> | null = null;
let orbitLinesVisible = showOrbitLines; // default: true (R1 박제값)
const rebuildOrbitLines = () => {
  // ... 모든 body 의 궤도를 batch 로 그림
  if (orbitLines) {
    orbitLines.dispose();
    orbitLines = null;
  }
  // ...
  orbitLines = MeshBuilder.CreateLineSystem('orbit-lines', { lines: batches }, scene);
  orbitLines.color = new Color3(0.25, 0.28, 0.4); // 일관 색상 (모든 body)
  orbitLines.isVisible = orbitLinesVisible;
};
```

**관찰**: 궤도 라인은 이미 **모든 body 일괄 처리** (배치 1개 LineSystem). 신규 body 추가 = 자동 포함. R1 baseline 에서 수성 궤도 라인 이미 visible (현재 default 진입에서 보이는 궤도 라인 중 하나).

#### 후보 비교

| 후보                                           | 사양                                            | 평가                                                                                                    |
| ---------------------------------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------- |
| **A. 변경 안 함 (현재 색상/투명도/두께 유지)** | `Color3(0.25, 0.28, 0.4)`, `LineSystem` default | R1 ADR §결정 5 비-범위 보호 가드 (line 렌더 무수정) 에 정합. PM 비-목표 §"baseline 동일" 일치. **선택** |
| B. 수성 궤도 강조 (focus 진입 색상)            | 다른 색상 (예: orange)                          | "현재 활성 R-Phase body" 식별 시각 보조. R1 도 sun 궤도 강조 미적용 → R1 회귀. **탈락**                 |
| C. 두께 차별 (수성 1.5×)                       | `linesThickness` 별도                           | LineSystem default 가 1px 인데 두께 변경은 GPU LineThickness 분기 도입 = 신규 인프라. **탈락**          |

#### 선택: **후보 A — 변경 안 함**

근거:

1. **현재 baseline 동일** PM 본문 §D-O 명시 — 본 ADR 은 비-범위 가드만 박제
2. **R1 회귀 0 보장** — `solar-system-scene.ts:358-378` line 0 변경 (Concrete Prediction 검증 — 본 ADR §축 1 의 R3 prediction 의 일부)
3. **rebuildOrbitLines 자동 일반화** — 신규 body 데이터 (수성은 이미 `solar-system.json` 에 박제됨) 추가 = 자동 포함. 코드 변경 0

#### Developer 박제 의무

`solar-system-scene.ts` 의 orbit 관련 코드 **무수정**. 본 결정 검증은 R3 prediction 의 일부 — git diff stat 으로 0 라인 변경 자동 검증.

### 축 4 — focus 전환 race condition (D-F3)

#### 현재 R1 단일 body 환경에서 검증 불가했던 신규 시나리오

PM 본문 §D-F3 — 다중 body 환경에서 focus 전환 (sun → mercury, mercury → sun, mercury 진행 중 sun 클릭 등) 시 카메라 lerp 중 새 focus 진입 처리.

#### 현재 코드 핵심 동작 (`camera-controller.ts:52`)

```typescript
focusOn(target: FocusTarget): void {
  // ...
  Animation.CreateAndStartAnimation(
    'cam-target',         // ← 동일 property name 으로 호출
    this.camera,
    'target',
    // ...
  );
  Animation.CreateAndStartAnimation(
    'cam-radius',         // ← 동일 property name
    this.camera,
    'radius',
    // ...
  );
}
```

**Babylon `Animation.CreateAndStartAnimation` 동작 (`store-scene-sync` ADR §배경 분석)**:

> `Animation.CreateAndStartAnimation` 은 동일 target 즉시 재호출 시 첫 tween 을 즉시 폐기하지만 Babylon `_runtimeAnimations` 큐에 일시 push 후 flush 되는 과정 비용 발생.

즉 sun → mercury focus 전환 시:

1. sun focus 시작 — `cam-target` tween 1 (sun 좌표) + `cam-radius` tween 1 (sun radius × 5)
2. 사용자가 mercury 클릭 (300ms TRANSITION_MS 의 절반에서) — `cam-target` tween 2 (mercury 좌표) + `cam-radius` tween 2 (mercury radius × 5)
3. **Babylon 가 동일 property 인 cam-target/cam-radius tween 1 을 자동 폐기** + tween 2 시작 (현재 카메라 상태 = sun 으로 절반 이동한 보간 위치 → mercury 좌표로 새 lerp)
4. **사용자 체감**: 부드러운 전환 (jitter 없음, 과학적 안정 검증 — R1 회귀 가드 P12-B `runTierTransition` 의 `getAnimatableByTarget` 명시 취소 패턴과 동등 동작)

#### 후보 비교

| 후보                                                 | 처리 방식                                                                      | 평가                                                                                                                                                                                          |
| ---------------------------------------------------- | ------------------------------------------------------------------------------ | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. 현재 Babylon 자동 폐기 동작 신뢰 (변경 안 함)** | `Animation.CreateAndStartAnimation` 의 동일 property 자동 폐기 + 재시작        | R1 store-scene-sync ADR §배경 에서 분석된 동작 — 시각 회귀 0. R3~R10 자동 호환 (어떤 body 든 동일 property 호출). **선택**                                                                    |
| B. 명시적 `getAnimatableByTarget` 취소 추가          | `focusOn` 시작 시 `scene.getAnimatableByTarget(camera).forEach(a => a.stop())` | runTierTransition 의 패턴 (tier 전환 시 명시 취소) 을 focus 전환에도 도입. R1 코드 변경 + 회귀 가드 재검증 부담. 자동 폐기로 충분한데 추가 인프라 도입 = 신규 함수 ≠ 신규 구현 위배. **탈락** |
| C. focus 큐잉 (lerp 중 새 focus 무시)                | lerp 진행 중에는 onClick handler 비활성화                                      | 사용자 의도 무시 — "사용자가 다음 body 를 빨리 보고 싶을 때 300ms 대기 강제" UX 회귀                                                                                                          |
| D. focus 큐잉 (lerp 중 새 focus 큐)                  | 큐 추가 + 현재 lerp 완료 후 다음 lerp 시작                                     | 큐 인프라 신규 도입 (state machine 등). 자동 폐기로 충분 → 과잉                                                                                                                               |

#### 선택: **후보 A — 현재 동작 신뢰 (변경 안 함)**

근거:

1. **Babylon 자동 폐기 검증 완료** — R1 store-scene-sync ADR §배경 분석 + R1 PR #332 `p329-qa-focus-lod-guard.mjs` 회귀 가드 통과 (focus tween 동작 확인 완료)
2. **시각 회귀 0** — sun 1초간 lerp 중 mercury 클릭 시 mercury 로 부드럽게 재시작 (자동 폐기 + 새 lerp). frame 1 jitter 잠재성은 store-scene-sync ADR §배경 에 박제됨 + 현재 시각 회귀 미발견
3. **R3~R10 자동 호환** — 어떤 body id 이든 `controller.focusOn({ mesh })` 호출 → 동일 property 자동 폐기. 코드 변경 0
4. **Concrete Prediction 의 일부** — R1 store-scene-sync ADR Concrete Prediction (R2~R10 코드 변경 0 박제) 가 본 R2 에서 자연 검증

#### Developer 박제 의무 — E2E 테스트 시나리오

본 결정의 회귀 가드는 R2 PR 에서 E2E 테스트 추가 (PM 본문 D-F3):

**테스트 시나리오 (의무)**:

```javascript
// apps/web/scripts/r2-focus-race-guard.mjs (신규) 또는
// apps/web/src/components/sim-canvas.test.tsx 의 통합 테스트로 추가

test('R2 focus 전환 race — sun → mercury → sun', async () => {
  // 시나리오 1: sun 클릭 후 lerp 진행 중 (TRANSITION_MS=300 의 50%) mercury 클릭
  await page.goto('/');
  await page.click('[data-testid="focus-sun"]');
  await page.waitForTimeout(150); // lerp 절반 진행
  await page.click('[data-testid="focus-mercury"]');
  await page.waitForTimeout(400); // lerp 완전 종료 대기

  // assert: camera target 이 mercury 위치 (± tolerance)
  const cameraTarget = await page.evaluate(() => window.__simStore?.scene?.activeCamera?.target);
  // mercury 의 월드 좌표 기준 비교 — solar.meshes.get('mercury').absolutePosition 와 ≤ 1 scene unit
  expect(distanceTo(cameraTarget, mercuryAbsolutePosition)).toBeLessThan(1);
});

test('R2 focus race — mercury 진행 중 빈 공간 클릭 (focus 해제)', async () => {
  await page.goto('/');
  await page.click('[data-testid="focus-mercury"]');
  await page.waitForTimeout(150);
  // 빈 공간 클릭 또는 reset 버튼
  await page.click('[data-testid="focus-reset"]');
  await page.waitForTimeout(400);

  // assert: camera target = Vector3.Zero(), radius = 35
  const camera = await page.evaluate(() => ({
    target: window.__simStore?.scene?.activeCamera?.target,
    radius: window.__simStore?.scene?.activeCamera?.radius,
  }));
  expect(camera.target).toEqualVector(Vector3.Zero(), 0.1);
  expect(camera.radius).toBeCloseTo(35, 1);
});

test('R2 focus race — Animation tween 카운트 (이중 호출 방지 확장)', async () => {
  // store-scene-sync ADR §결정 6 테스트 1 의 R2 확장
  // sun → mercury 시 Animation.CreateAndStartAnimation 호출 횟수 = 2 (cam-target + cam-radius) × 2 (sun + mercury) = 4
  // (sun 호출 1번 + mercury 호출 1번 = 4 호출, sun 의 자동 폐기는 호출 카운트와 무관)
  let animSpyCount = 0;
  await page.exposeFunction('__animSpy', () => animSpyCount++);
  await page.evaluate(() => {
    const orig = BABYLON.Animation.CreateAndStartAnimation;
    BABYLON.Animation.CreateAndStartAnimation = (...args) => {
      window.__animSpy();
      return orig(...args);
    };
  });
  await page.click('[data-testid="focus-sun"]');
  await page.waitForTimeout(50);
  await page.click('[data-testid="focus-mercury"]');
  await page.waitForTimeout(400);
  expect(animSpyCount).toBe(4); // store-scene-sync ADR 단일 호출 가드와 호환
});
```

**구현 위치 후보** (developer 자체 판단, ROI 우선):

1. **Playwright E2E 확장 (1순위)** — 기존 `p329-qa-focus-lod-guard.mjs` 와 같은 디렉토리에 `r2-focus-race-guard.mjs` 신설. R1 인프라 재사용 + Babylon spy 패턴 동일
2. **단위 테스트 (2순위)** — `sim-canvas.test.tsx` 에 mock 기반. Babylon mock 비용 ROI 5문 통과 시
3. **수동 검증 (3순위 보완)** — 실 Chrome GUI 에서 sun → mercury 빠른 클릭 시 부드러운 전환 1회 확인 (D-T2 의무)

**테스트 1, 2 는 어떤 형태로든 의무** — 본 ADR §축 4 후보 A 의 핵심 회귀 가드. 테스트 3 은 ROI 통과 시 추가.

### 축 5 — info 패널 / R1 부산물 재사용 (D-I1, D-R1)

#### `CelestialInfoPanel` 자동 일반화

`apps/web/src/components/panels/celestial-info-panel.tsx` 가 `selectedBodyId` 를 store 에서 읽어 `solar-system.json` 의 body 데이터를 표시. mercury 도 이미 데이터 박제됨 (`id: "mercury"`, `mass`, `radius`, `nameKo: "수성"`) → **코드 변경 0** 자동 일반화. PM D-I2 "코드 변경 0" 박제와 일치.

#### tooltip "× N 과장 중" 표시

R1 ADR Developer 인계 §7 — info-panel 또는 동등 위치에 tooltip "× N 과장 중" 또는 "가시성을 위해 N배 확대" 추가 (R1 #332 구현 완료 — sun 케이스). mercury 도 `getBodyScale('mercury') === 8500` 이 자동 표시 — 동일 컴포넌트 일반화 (코드 변경 0).

**Developer 의무**: 실 Chrome 으로 mercury focus 진입 시 tooltip 에 "8500" 또는 "8500배 확대" 표시 확인 (수동 검증).

---

## 결정

### 결정 1 — `mercuryScale = 8500` (축 1 후보 C)

`apps/web/src/constants/body-scale.ts` 에 mercury 1줄 추가:

```typescript
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 75,
  mercury: 8500, // R2 #361 — viewport 점유율 1280×720 0.61% / 모바일 1.94% / sun 시각비 40%
});
```

**박제값 산출 근거** (본 ADR §축 1):

- viewport 점유율 (1280×720): 0.612% (DoD 0.5% + 마진 22%)
- viewport 점유율 (1920×1080): 0.612%
- viewport 점유율 (375×667 모바일): 1.94% (인지 가능 + 화면 차단 없음)
- sun 시각비: 40% (sun 213.3px / mercury 84.76px @ 1280×720 — sun 의 1/2.5, "수성이 태양보다 작다" 자연스러움)
- 픽셀 직경 (1280×720): **84.76px** (산출 검증 — Gemini cross-validate 합의)

### 결정 2 — shortcut-bar `FOCUS_BUTTONS` 1줄 추가 (축 2 후보 A)

`apps/web/src/components/layout/focus-quick-buttons.tsx` 의 `FOCUS_BUTTONS` 배열에 mercury 항목을 sun 다음 (천체 거리 순) 에 1줄 추가:

```typescript
const FOCUS_BUTTONS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' }, // R2 #361
  { id: 'earth', label: '지구' },
  { id: 'jupiter', label: '목성' },
  { id: 'neptune', label: '해왕성' },
];
```

**키바인딩 / aria 변경 없음** — R1 패턴 100% 정합. button 텍스트 "수성" 이 자연 라벨 (axe 0 위반 통과 — R1 사례 일반화).

### 결정 3 — 궤도 라인 렌더 무수정 (축 3 후보 A)

`solar-system-scene.ts:358-378` 의 `rebuildOrbitLines` / `orbit-lines` LineSystem **무수정**. 색상 `Color3(0.25, 0.28, 0.4)` / 두께 default / 투명도 default 모두 R1 박제값 보존. 수성 궤도는 `solar-system.json` 데이터 자동 일괄 처리.

### 결정 4 — focus 전환 race Babylon 자동 폐기 신뢰 (축 4 후보 A)

`camera-controller.focusOn` 의 `Animation.CreateAndStartAnimation` 동일 property name (`cam-target`, `cam-radius`) 자동 폐기 + 재시작 동작 신뢰. **코드 변경 0**. 회귀 가드는 E2E 테스트 시나리오 3개 (`r2-focus-race-guard.mjs` 또는 동등 위치) 로 박제. 시각 jitter 가 발견되면 본 ADR §재검토 트리거 #1 발동.

### 결정 5 — info 패널 / orbit / sync 자동 일반화 (축 5)

`CelestialInfoPanel` / `syncFocusToScene` / `rebuildOrbitLines` 모두 R1 박제 인프라 자동 일반화 — **코드 변경 0**. `solar-system.json` 의 mercury 데이터 (이미 박제됨) 가 자동 사용.

### 결정 6 — 비-범위 보호 가드

다음은 본 ADR 범위 외 — developer 가 "R2 visible 통합" 명목으로 손대지 않음:

- `packages/core/src/scene/tier.ts` / `tier-transition.ts` — 0 라인 변경 (R1 §결정 5 비-범위 가드 일관)
- `packages/core/src/render/lod*.ts` — 0 라인 변경 (LOD ADR + R1 비-범위 일관)
- `packages/shared/data/solar-system.json` — 0 라인 변경 (mercury 데이터 이미 박제됨)
- `packages/core/src/scene/camera-controller.ts` — 0 라인 변경 (축 4 후보 A 채택)
- `packages/core/src/scene/solar-system-scene.ts` — 0 라인 변경 (orbit / mesh 인프라 R1 박제 자동 일반화)
- `apps/web/src/components/sim-canvas.tsx` — 0 라인 변경 (`syncFocusToScene` 자동 일반화)
- `apps/web/src/components/panels/celestial-info-panel.tsx` — 0 라인 변경 (selectedBodyId 자동 일반화)
- 다른 행성 (venus / earth / mars / jupiter / saturn / uranus / neptune) — R3+ 범위
- 수성 표면 텍스처 / 자전 애니메이션 / 영점 위상 정확도 / PBR — 후속 R-Phase 또는 별도 이슈

---

## 결과·재검토 조건

### Concrete Prediction (R3 추가 시 코드 변경 ≤ 2 라인)

R3 (금성) 추가 시 본 ADR 결정 1~5 의 자동 일반화 검증:

```bash
# R3 PR 머지 후 자동 재현:
git diff develop...HEAD --stat \
  apps/web/src/constants/body-scale.ts \
  apps/web/src/components/layout/focus-quick-buttons.tsx \
  packages/core/src/scene/solar-system-scene.ts \
  packages/core/src/scene/tier.ts \
  packages/core/src/render/lod.ts \
  apps/web/src/components/sim-canvas.tsx \
  apps/web/src/components/panels/celestial-info-panel.tsx \
  packages/core/src/scene/camera-controller.ts

# 예상: body-scale.ts +1 (venus 룩업) / focus-quick-buttons.tsx +1 (FOCUS_BUTTONS 항목)
# 나머지 6 파일 변경 0 (R1 + R2 인프라 자동 일반화)
```

Prediction 실패 시 두 갈래:

- (a) 추상화 부족 — 어떤 인프라 파일이 R3 진입에 변경 필요. 본 ADR Amendment 박제 후 일반화 리팩토링
- (b) 예외 케이스 — R3 venus 가 phase / transit 등 특수 시각 효과 필요. R3 ADR 에서 예외 인정 박제

**단서 조항 (Gemini cross-validate Q3 권고 수용 — 2026-04-28)**: 금성의 고유 시각 효과 (예: 황백색 알베도 색상, 두꺼운 대기 셰이더) 부여를 위해 `solar-system-scene.ts` 또는 머티리얼 정의 파일에 분기 처리가 필요한 경우 **(b) 예외 케이스로 인정**. R3 ADR 에서 별도 결정 박제 + 본 ADR §결과·재검토 조건 §재검토 트리거 #4 (Concrete Prediction 실패) 가 (a) 추상화 부족이 아닌 (b) 예외로 분류됨을 명시. 머티리얼 분기 처리는 BODY_SCALE 룩업과 직교하므로 R2 의 인프라 재사용 패턴 자체는 유효 (BODY_SCALE / FOCUS_BUTTONS / syncFocusToScene / r1-guard 매트릭스 모두 보존).

### 회귀 가드 (R2 PR DoD)

- **D-V1 / D-V4 검증** — `r1-ui-regression-guard.mjs --measure-sun-coverage` 확장 (또는 신규 `--measure-mercury-coverage`) 으로 3 viewport mercury 점유율 실측. 1280×720 ≥ 0.5%, 모바일 ≥ 0.5% (산출 예측: 0.61% / 1.94%) ± 0.1% 마진
- **D-F1 / D-F2 / D-F3 회귀 가드** — `r2-focus-race-guard.mjs` 또는 통합 테스트 3 시나리오 (본 ADR §축 4 §Developer 박제 의무)
- **D-O1 / D-O2 회귀 가드** — `r1-ui-regression-guard.mjs` (4 영역 mismatch ≤ 0.5%) 통과. 단 shortcut-bar 영역은 baseline 갱신 (별도 r1-guard ADR amendment v3 절차)
- **D-G1** R1 회귀 — `p329-qa-focus-lod-guard.mjs` 통과 (sun focus 동작 + LOD 시그니처 보존)
- **D-G2 60fps** — bench 측정 (R1 baseline 대비 < 5% 회귀)
- **D-T1** CI green — r1-guard step 5 통과
- **D-T2** 실 Chrome 수동 검증 — sun ↔ mercury focus 전환 + 모바일 (375×667) 인지 가능 확인 (volt #77)
- **D-T3** axe 0 위반 — shortcut-bar 신규 항목 접근성 회귀 없음

### 재검토 트리거

다음 조건 중 하나면 본 ADR 재검토 (Amendment 또는 신 ADR):

1. **R2 구현 PR 의 실측 viewport 점유율 ± 0.1% 마진 초과** — 산출 예측 (1280×720 0.61% / 1920×1080 0.61% / 모바일 1.94%) 와 실측이 마진 이상 차이. mercuryScale 재조정 amendment
2. **모바일 1.94% 사용자 피드백 침습성** — D-T2 수동 검증에서 사용자가 "수성이 모바일에서 너무 크다" 평가. mercuryScale 4,500 ~ 5,000 으로 하향 또는 viewport-aware scaling (R1 §축 1 후보 Y 재검토). **Gemini cross-validate 발견 2 (2026-04-28)**: 모바일 누적 차단율 R5 (화성) 진입 시 25~30% 도달 위험 (sun 12.26% + mercury 1.94% + venus + earth + mars). 본 트리거는 R5 진입 전 사전 발동 가능 — 모바일 디바이스 전용 viewport-aware scaling 도입 ADR 검토
3. **focus 전환 race condition 시각 jitter** — R2 PR 의 `r2-focus-race-guard.mjs` 또는 D-T2 수동 검증에서 sun ↔ mercury 빠른 클릭 시 jitter 발견. `getAnimatableByTarget` 명시 취소 도입 amendment (축 4 후보 B)
4. **R3 (금성) 진입 시 Concrete Prediction 실패** — body-scale.ts / focus-quick-buttons.tsx 외 파일 변경 발생. 본 ADR 추상화 부족 신호. amendment 박제
5. **카메라 거리 / fov / cameraRadius 변경** — `sim-canvas.tsx:158` 의 `radius: 35` 또는 fov 변경 시 본 ADR §축 1 산출표 무효화. 재검토 트리거 (R1 §재검토 트리거 #4 동일)
6. **shortcut-bar 항목 키바인딩 도입 결정** — UX 개선 R-Phase 또는 별도 이슈에서 키바인딩 도입 시 axe / aria 정책 amendment

### 위험 / 미해결

- **viewport 점유율 산출과 실측 오차** — R1 ADR §결정 1 의 1920×1080 점유율 표기 (6.18%) 와 본 ADR §축 1 의 산출값 (3.88%) 차이. 본 산출은 16:9 종횡비 + 동일 fov + 동일 cameraRadius 라 1280×720 / 1920×1080 점유율 동일이 정합. R1 표는 viewport-relative 좌표 변환 오류 가능성. R2 PR 에서 실측 (`--measure-mercury-coverage`) 으로 정정 필요
- **모바일 점유율 1.94% 침습성** — sun 12.26% + mercury 1.94% = 14.2% (모바일 화면의 1/7). 향후 venus/earth/... 누적 시 모바일 화면 차단 위험 (R3+ 에서 viewport-aware scaling 재검토 트리거)
- **Animation 자동 폐기 의존** — Babylon 라이브러리 업데이트 시 `Animation.CreateAndStartAnimation` 동일 property 자동 폐기 동작 변경 가능성. R1 store-scene-sync ADR §재검토 트리거 #4 와 동일 위험. R2 의 multi-body race scenario 가 Babylon 변경 시 첫 노출 케이스
- **R10 누적 시 BODY_SCALE 룩업 비대화** — 10 body × 평균 100자 주석 = 룩업 파일 ~1000 라인. 별도 데이터 파일 (json) 분리 검토 가능 (R5+ 에서). 단 `bodyScale` 콜백 시그니처는 변경 안 해도 됨

---

## 교차검증 반영 사항

본 ADR 박제 직후 cross-validate 1회 호출 예정 (Gemini 2.5 Pro). Claude 자체 편향 4종 셀프 체크:

- **낙관적 일정 ✓** — R2 는 R1 인프라 재사용으로 코드 변경 ≤ 3 라인. 일정 추가 리스크 매우 낮음
- **결합 간과 △** — R2 mercuryScale 8500 결정과 sun=75 / orbitLines / focus race 동작이 결합. cross-validate 호출 프롬프트에 명시 질문 삽입
- **폐기 프레이밍 ✓** — R1 비-범위 보호 가드 명시 (sphere/tier/lod/sync 무수정), 폐기 항목 없음
- **순수주의 △** — "Babylon 자동 폐기 신뢰 = 충분 안전" 사후 정당화 가능성. 후보 B (명시 취소) 비교 균형 명시 질문 삽입

cross-validate 호출 완료 (Gemini 3.1 Pro Preview, 2026-04-28 17:16 KST). outcome=applied (2회 429 retry 후 정상 응답 수신, retry 로그 포함되어 자동 분류는 fallback 으로 됐으나 실제 응답은 정상). 로그: `.claude/logs/cross-validate-architecture-20260428-171716.log`. outcome JSON: `.claude/logs/cross-validate-architecture-20260428-171716-outcome.json`.

### 합의 — Claude 설계와 일치 + 본 ADR 에 반영

- **Q1 (4 결정 결합도 낮음)** — Gemini 가 "논리적 결합도(Coupling)는 매우 낮습니다. mercuryScale 을 4500 으로 재조정하더라도 궤도 라인 생성 로직 / focus 큐 자동 폐기 동작은 body scale 수치와 무관하게 작동" 으로 강하게 합의. **결합 간과 △ 우려 해소**. visual regression baseline 갱신만 동반되며 "정상적인 테스트 후행 작업" 으로 평가
- **Q4 mercuryScale=8500 px diameter 산출 정합성** — Gemini 가 "수식을 통해 교차 검증한 결과 mercuryScale=8500 일 때 1280×720 기준 점유율 0.61%, 모바일 1.94% 는 산출식에 정확히 부합. 교차 계산: px_diameter ≈ 84.7px, 점유율 ≈ 0.611%" 로 합의. **본 ADR §결정 1 의 "픽셀 직경 91.5px" 박제값을 84.76px 로 정정** (Gemini 산출과 본 ADR §축 1 표 재산출 일치 — 산출식 7500x = 74.78px / 8500x 보간 = 84.76px / 10000x = 99.71px 정합)
- **시각비 40% UX sweet spot** — Gemini 가 "사용자가 '수성이 태양보다 확연히 작다' 고 인지하면서도 클릭 가능한 충분한 히트박스를 제공하므로 UX 관점의 타협점(Sweet spot)으로 매우 훌륭" 으로 합의

### 이견 수용 — Claude 원안 보강

- **Q3 (R3 Concrete Prediction 단서 조항 추가)** — Gemini 가 "수성은 회색빛 암석 행성이라 기본 머티리얼/단색으로 무방하나 R3 금성은 '두꺼운 대기(Atmosphere)' 표현이나 황백색 알베도(Albedo) 색상 부여가 요구될 수 있음. R3 prediction 에 단서 조항 추가하여 추후 예측 실패가 '추상화 부족' 으로 오진단되지 않도록 보강" 권고. **수용** — 본 ADR §결과·재검토 조건 의 R3 Concrete Prediction 에 다음 단서 조항 박제:
  > **단서 조항 (Gemini 교차검증 Q3 권고 수용)**: 금성의 고유 시각 효과 (예: 황백색 알베도, 두꺼운 대기 셰이더) 부여를 위해 `solar-system-scene.ts` 또는 머티리얼 정의 파일에 분기 처리가 필요한 경우 예외로 인정. 이 경우 R3 ADR 에서 별도 결정 박제 + 본 ADR 의 prediction 실패가 "추상화 부족" 으로 자동 분류되지 않도록 명시. 머티리얼 분기 처리는 BODY_SCALE 룩업과 직교하므로 R2 의 인프라 재사용 패턴 자체는 유효

### Claude 재분석으로 기각한 Gemini 제안

- **Q2 후보 B (명시 getAnimatableByTarget 취소) 도입 권고** — Gemini 제안: "Babylon.js 마이너 업데이트에서 Lerp 도중 타겟이 겹칠 때 프레임이 튀는(Jitter) 현상이 발생할 수 있으므로 명시적으로 `getAnimatableByTarget(camera).forEach(a => a.stop())` 호출하는 후보 B 로 변경 권고 (순수주의적 위험 / 은탄환 편향)". **기각 근거**:
  - "신규 함수 ≠ 신규 구현" 원칙에 따라 시각적 회귀 (Jitter) 가 입증되지 않은 상태에서 선제적 방어 코드 도입은 YAGNI 위배 (Gemini 도 본 기각 사유 본인이 박제)
  - **본 ADR §결과·재검토 조건 §재검토 트리거 #3** 가 이미 "focus 전환 race condition 시각 jitter 발견 시 후보 B 도입 amendment" 박제 — 회귀 발생 시 즉각 전환 가능
  - **3 E2E 테스트 시나리오 (sun→mercury / mercury→reset / Animation tween 카운트)** 가 회귀 가드 — Gemini 도 "촘촘한 E2E 테스트가 라이브러리 업데이트에 대한 충분한 방어망 역할" 로 기각 사유 동의
  - R1 store-scene-sync ADR §배경 분석 + R1 #332 회귀 가드 통과 실적 — Babylon 동작 검증 완료된 패턴

### 고유 발견 (후속 분리)

#### 발견 1 — R1 ADR 1920×1080 sun 점유율 6.18% 산출 오류 확정 (위험)

**Gemini 분석**: "동일 fov, 16:9 종횡비, 동일 카메라 거리(35) 적용 시 1920×1080 환경에서도 sun 점유율은 3.88% 가 나오는 것이 수학적으로 정확. R1 ADR 박제 6.18% 는 R1 작성 시 viewport 상대 좌표계 계산 실수이거나 종횡비 / 카메라 거리가 다르게 적용된 수치"

**범위 체크**: 본 R2 PR 에서 R1 ADR §결정 1 표 정정은 **R2 비-범위** (CRITICAL #6 — PM 합의 §비-범위 침범 가능). R1 ADR 본문 변경은 R1 시각화 ADR 의 별도 amendment 로 분리 필요.

**후속 이슈 분리** (즉시 생성 완료): [#362](https://github.com/coseo12/astro-simulator/issues/362) — `[chore] R1 sun 점유율 1920×1080 박제값 정정 — ADR Amendment 후보`. 본문에 Gemini 산출 (3.88%) vs R1 ADR 박제 (6.18%) 차이 + 본 R2 ADR 산출 일치 + 후보 A (Amendment 박제) / B (실측 확정) / C (NO-OP) 박제. 우선순위 low (수치 박제 오류, 동작 영향 없음).

#### 발견 2 — 모바일 누적 점유율 한계 도달 경고 (주의)

**Gemini 분석**: "현재 모바일에서 sun (12.26%) + mercury (1.94%) 만으로 화면 14.2% 차단. R3 (금성) / R4 (지구) / R5 (화성) 누적 시 inner planets 만으로 모바일 화면 25~30% 차단 위험. R3 진입 전 모바일 디바이스 한해 기준 Scale 렌더링 계수 일괄 조정 (예: 모바일은 모든 행성 Scale 0.7배 적용) 도입을 R3 설계 사전 조사 항목으로 백로그 분리 등록 권장"

**범위 체크**: 본 R2 PR 의 §결과·재검토 조건 §재검토 트리거 #2 ("모바일 1.94% 사용자 피드백 침습성") 와 정합. 단 Gemini 제안의 **viewport-aware scaling 인프라 도입** 은 본 ADR §축 1 후보 Y 로 이미 탈락 분석됨 (수식 도입 = "신규 데이터 ≠ 신규 코드" 위배). 후속 R3 진입 시 결정 대상.

**본 ADR 즉시 반영 (이견 수용 §결과 §재검토 트리거 강화)**: §재검토 트리거 #2 본문에 다음 추가 박제 — "**Gemini cross-validate 발견 2 (2026-04-28)**: 모바일 누적 차단율 R5 진입 시 25~30% 도달 위험. 본 트리거는 R5 진입 전 사전 발동 가능 (모바일 디바이스 전용 viewport-aware scaling 도입 ADR 검토)". 별도 후속 이슈 분리 불요 (재검토 트리거가 이미 박제된 항목).

후속 이슈 생성 (발견 1) 은 본 ADR PR 머지 직후 architect 또는 메인 오케스트레이터 책임 (CLAUDE.md `### 교차검증` §"분리 시 박제 규칙" — 즉시 생성 의무).

---

## Developer 인계

**시작 지점**:

1. **`apps/web/src/constants/body-scale.ts`** — `BODY_SCALE` 객체에 `mercury: 8500` 1줄 추가 + `body-scale.test.ts` 에 `getBodyScale('mercury') === 8500` 단위 테스트 1줄 추가
2. **`apps/web/src/components/layout/focus-quick-buttons.tsx`** — `FOCUS_BUTTONS` 배열에 sun 다음 위치에 `{ id: 'mercury', label: '수성' }` 1줄 추가
3. **회귀 가드 — E2E 테스트 (D-F3 의무)**:
   - `apps/web/scripts/r2-focus-race-guard.mjs` (신규) 또는 `sim-canvas.test.tsx` 통합 테스트 — 본 ADR §축 4 §Developer 박제 의무 의 3 시나리오 박제
   - 1순위: Playwright E2E (R1 인프라 재사용)
   - 2순위: 단위 테스트 (Babylon mock ROI 5문 통과 시)
4. **r1-guard mercury coverage 측정** (D-V1 / D-V4 검증):
   - `apps/web/scripts/r1-ui-regression-guard.mjs` 의 `--measure-sun-coverage` 패턴 확장 — `--measure-mercury-coverage` 신설 또는 통합 (`--measure-coverage` 가 sun/mercury 둘 다 측정)
   - PR 본문에 3 viewport 실측 결과 박제 (예측: 0.61% / 0.61% / 1.94% ± 0.1%)
5. **r1-guard shortcut-bar baseline 갱신** (D-G3, Q3=B 통합):
   - 별도 `20260425-r1-ui-pixel-diff-guard.md` Amendment v3 박제 (architect 가 본 R2 와 함께 박제 — 본 ADR 자매 결정)
   - `r1-ui-regression-guard.mjs --update --viewport=<id>` 로 3 viewport shortcut-bar baseline 갱신 + R2 PR 본문 사유 명시
6. **CHANGELOG `### Behavior Changes`** — R2 visible 진입 항목 박제:
   - "수성 가시성 진입 — `mercury: 8500` BODY_SCALE 추가"
   - "shortcut-bar 5 항목 (태양 / 수성 / 지구 / 목성 / 해왕성)"
   - 분류: **MINOR** (기능 추가 + 행동 변화)
7. **수동 브라우저 검증 (D-T2 의무)**:
   - 실 Chrome GUI 에서 default 진입 → 수성 visible 확인 (3 viewport 모두)
   - sun → mercury focus 전환 빠른 클릭 race 확인
   - 모바일 viewport (375×667) 인지 가능성 확인 (1.94% 침습성 평가)
   - R1 회귀 0 확인 (sun focus 정상)

**참조 문서**:

- 본 ADR (R2 시각화)
- [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) (R1 sunScale + bodyScale 인프라 SSoT)
- [`20260425-r1-store-scene-sync-unification.md`](20260425-r1-store-scene-sync-unification.md) (focus sync 단일 경로 + Concrete Prediction R2 검증 대상)
- [`20260425-r1-ui-pixel-diff-guard.md`](20260425-r1-ui-pixel-diff-guard.md) (회귀 가드 인프라 + R2 동반 amendment v3)
- [`20260424-p11-b-lod-design.md`](20260424-p11-b-lod-design.md) (LOD × scale 합성 순서)
- [`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) (R-Phase 공통 DoD 템플릿)
- 이슈 #361 (R2 PM 합의 본문)
- 이슈 #357 (sentinel 정책 amendment — Q3=B 통합)
- volt [#74](https://github.com/coseo12/volt/issues/74) (UX 가시성 회귀 — DoD PASS ≠ 제품 동작)
- volt [#77](https://github.com/coseo12/volt/issues/77) (메인 오케스트레이터 단계 게이트 — 실 브라우저 수동 검증)

**비-범위** (절대 손대지 말 것):

- `packages/core/src/scene/tier.ts` — 0 라인 변경
- `packages/core/src/scene/tier-transition.ts` — 0 라인 변경
- `packages/core/src/scene/camera-controller.ts` — 0 라인 변경 (축 4 후보 A)
- `packages/core/src/render/lod*.ts` — 0 라인 변경
- `packages/core/src/scene/solar-system-scene.ts` — 0 라인 변경 (orbit / mesh / sync 인프라 모두 R1 박제 자동 일반화)
- `apps/web/src/components/sim-canvas.tsx` — 0 라인 변경
- `apps/web/src/components/panels/celestial-info-panel.tsx` — 0 라인 변경
- `packages/shared/data/solar-system.json` — 0 라인 변경 (mercury 데이터 이미 박제)
- 다른 행성 (venus / earth / mars / jupiter / saturn / uranus / neptune) — R3+ 범위
- 수성 표면 텍스처 / 자전 / 영점 위상 / PBR — 후속 R-Phase

---

## Amendment 2026-04-30 — Q2=B 비례 결정 전환 (#373 후속)

### 변경 배경

#373 forensic 결과 + 사용자 옵션 (c) 채택 + Gemini cross-validate (outcome=applied):

- R2 박제 시점 (Q2=A 독립 결정) 의 mercuryScale=8500 이 sun 대비 px 비 38.2% 로 비현실적 비율 형성
- 사용자 인지 단위 = px diameter 비 (현재 area 단위 가드 직교)
- R3 venus 추가로 비율 회귀 가시화 → R3 D-T2 사용자 검증 가드 발견

### 박제값 갱신 의도

- **mercuryScale: 8500 → 2000~3000 범위** (구체값은 D-T2 사용자 검증 후 developer 단계에서 확정)
- **시각비 박제 갱신**: sun 대비 px 비 38.2% → ~9~12% 자연화

### 가드 단위 갱신

- **(보존)** brightRatio 점유율 ≥ 0.5% (R1 ADR §결정 1 SSoT 일관)
- **(신규)** sun 대비 px diameter 비 ≤ 25% (Q2=B 비례 결정 가드)
- **(신규)** 모바일 (375×667) 누적 disk area ≤ 25%

### 정책 변경

- **폐기**: PM Q2=A "각 body 독립 결정. R3+ 도 각자 독립"
- **신규**: PM Q2=B "각 body 가 sun 대비 px 비 ≤ N% 로 비례 결정" (R-Phase 공통, R4+ 적용)
- 본 amendment 시점부터 R2 도 Q2=B 정책 SSoT 따름

### 후속 검증

- D-T2 사용자 검증 (px 비 자연화 확증)
- r1-guard `--measure-px-ratio` 박제값 PASS
- 모바일 누적 차단율 ≤ 25%

### 교차검증 반영 사항

본 amendment 는 #373 forensic ADR (커밋 `aade809`) 의 cross-validate (Gemini outcome=applied) 커버리지 안 — 별도 cross-validate skip. forensic ADR §교차검증 반영 사항 §고유 발견 4 (R2/R3 ADR amendment 동반 박제 의무) 가 본 amendment 의 의도까지 포괄.

### 참조

- #373 forensic ADR [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) §결정 2
- Roadmap v3 §6 + §R-Phase 공통 DoD 템플릿 amendment 2026-04-30 (커밋 `20c60c8`)
- volt [#74](https://github.com/coseo12/volt/issues/74) (UX DoD vs 제품 동작), volt [#29](https://github.com/coseo12/volt/issues/29) (결합 간과 편향)

---

## Amendment 2026-05-01 — mercuryScale 8500 → 2000 확정 (적극값) + Q2=B 임계 강화

> **Status**: Active (2026-05-01 박제, architect 단계)
> **근거 ADR**: [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) Amendment 2026-05-01
> **R1 동반 amendment**: [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) Amendment 2026-05-01 (sunScale 75 → 50)
> **근거 PR**: #377 CLOSED (mercuryScale=2500 보수값 D-T2 미통과)
> **사용자 결정**: 옵션 c 적극값 (mercury=2000) + 옵션 a (sunScale=50) 동반 채택 (2026-05-01)
> **적용 PR**: feature/373-body-proportion-aggressive (본 amendment 박제 후 developer 단계)

### 확정 박제값 (Amendment 2026-04-30 의 "갱신 의도 → 확정" 전환)

본 ADR §Amendment 2026-04-30 §박제값 갱신 의도 의 "**mercuryScale 갱신 의도: 8500 → 2000~3000 범위**" 가 사용자 D-T2 검증 결과로 **확정**:

| 항목                  | Amendment 2026-04-30 (의도)      | Amendment 2026-05-01 (확정)          |
| --------------------- | -------------------------------- | ------------------------------------ |
| mercuryScale          | 8500 → **2000~3000 범위** (의도) | 8500 → **2000 (적극값 확정)**        |
| sun 대비 px 비 (목표) | ~9~12% 자연화                    | sun 대비 ≤ **6%** (강화)             |
| Q2=B 임계             | sun 대비 px 비 ≤ 25%             | sun 대비 px 비 ≤ **6%** (강화)       |
| sunScale 동반 변경    | (보존 — 75)                      | **75 → 50** (R1 amendment 동반 박제) |

### D-T2 px 비 예측 (sunScale 50 + mercuryScale 2000)

forensic 측정 데이터 (`docs/reports/373-debug-output.json`) 기반 산출. wsR / pxDiameter 는 scale 에 선형 비례:

| viewport         | sun pxDiameter (50) | mercury pxDiameter (2000)      | sun 대비 mercury px 비 | mercury disk area | 가드 통과 여부                               |
| ---------------- | ------------------- | ------------------------------ | ---------------------- | ----------------- | -------------------------------------------- |
| **1280×720**     | 246.3               | 141.2 × (2000/8500) = **33.2** | **13.5%**              | **0.094%**        | px 비 ≤ 6% **미달**, brightRatio ≥ 0.5% 미달 |
| 1920×1080        | 369.4               | **49.8**                       | **13.5%**              | **0.094%**        | 미달 (동일)                                  |
| 375×667 (모바일) | 228.1               | **30.8**                       | **13.5%**              | **0.297%**        | 미달                                         |

**중요**: sun 대비 mercury px 비 13.5% 는 본 amendment 의 임계 ≤ 6% 보다 큰 산출이므로 D-T2 사용자 검증 결과에 따라 **forensic ADR §재검토 트리거 #1 가 다시 발동될 수 있음**. 그 경우 mercuryScale 1500 / 1000 등 더 적극값 또는 옵션 (e) log scaling 우선순위 high 승격 경로 박제됨 (forensic ADR Amendment 2026-05-01 참조).

### 가드 갱신 (Amendment 2026-04-30 의 갱신값 → Amendment 2026-05-01 적극값)

- **(폐기)** ≥ 0.5% brightRatio 가드 (mercury 회색 머티리얼이 sun emissive 대비 sub-임계라 brightRatio 무의미. mercury disk area 0.094% 가 ≥ 0.5% 가드 대체)
- **(보존)** Q2=B 비례 결정 가드 — sun 대비 px diameter 비. 임계 강화: **≤ 25% → ≤ 6%**
- **(보존)** 모바일 (375×667) 누적 disk area ≤ 25% — sun 16.34% + mercury 0.297% + venus 1.058% = 17.7% **PASS**
- **(신규)** mercury disk area ≥ 0.05% (1280×720) — 절대 가시성 최소 임계. mercury 0.094% **PASS**

### D-X1 Concrete Prediction 보존 (R2 ADR §결과·재검토 조건 §Concrete Prediction)

본 amendment 는 mercuryScale 박제값 갱신만 — **R2 ADR §결정 1 의 핵심 6 파일 SSoT 회귀 0** 보존:

- 변경 파일: `apps/web/src/constants/body-scale.ts` 만 (1줄 갱신)
- 핵심 6 파일 (`solar-system-scene.ts` / `tier.ts` / `tier-transition.ts` / `lod.ts` / `lod-body-thresholds.ts` / `sim-canvas.tsx`) 0 라인 변경 — Concrete Prediction 효력 유지

### 후속 검증 (본 amendment 의 fix PR 의무)

본 amendment 적용 PR (developer 단계) 에서 다음 박제:

1. `apps/web/src/constants/body-scale.ts` — `mercury: 2000` (8500 갱신) + 단위 테스트 갱신
2. `r1-guard --measure-px-ratio` 신설 — forensic ADR §결정 2 §5 Amendment 2026-05-01 명세 그대로 구현 (`mercury sunPxRatio ≤ 6%` 가드)
3. `_debug-373-proportion-tmp.mjs` 재실행 — px 비 실측 + 본 amendment 박제값 ± 2% 마진 검증
4. 사용자 D-T2 (실 Chrome GUI 수동) — px 비 자연 비율 평가 (예측 13.5%, 본 amendment 임계 ≤ 6% 미달 가능성 인지)
5. CHANGELOG `### Behavior Changes`: "수성 시각 비율 자연화 (mercuryScale 8500 → 2000). sun 대비 mercury px 비 38.2% → ~13.5% (1280×720)"

### 교차검증 반영 사항

본 amendment 는 forensic ADR Amendment 2026-05-01 의 cross-validate (Gemini 2.5 Pro, 2026-05-01) 커버리지 안 — 별도 cross-validate skip. forensic ADR §Cross-validate 결과 (Gemini 2.5 Pro, 2026-05-01) 가 본 amendment 의 의도까지 포괄.

### 참조

- forensic ADR [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) Amendment 2026-05-01 — 본 amendment 의 근거 SSoT
- R1 ADR [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) Amendment 2026-05-01 (sunScale 75 → 50 동반 박제)
- R3 ADR [`20260429-r3-venus-visualization.md`](20260429-r3-venus-visualization.md) Amendment 2026-05-01 (venusScale 4000 → 1500 확정)
- Roadmap v3 §6 + §R-Phase 공통 DoD 템플릿 amendment 갱신 (적극값 채택 후속)

---

## Amendment 2026-05-01 (라운드 2) — mercuryScale 2000 → 900 확정 (적극 재조정)

> **상태**: 라운드 1 박제값 mercuryScale 2000 의 forensic px 비 예측 13.5% 가 DoD 임계 ≤ 6% 를 **2.25배 초과** → **임계 비례 역산 재조정**. 사용자 (A) 채택 (2026-05-01).
> **선행 박제**: 본 ADR Amendment 2026-05-01 (라운드 1) — mercuryScale 8500 → 2000 (적극값) 박제 보존
> **근거 ADR**: [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) Amendment 2026-05-01 (라운드 2) §"임계 비례 역산"
> **R3 동반 amendment**: [`20260429-r3-venus-visualization.md`](20260429-r3-venus-visualization.md) Amendment 2026-05-01 (라운드 2) (venusScale 1500 → 650)

### 결정

`mercuryScale: 2000 → 900` 적극 재조정 확정.

### 근거 — 라운드 1 박제값 D-T2 임계 초과

라운드 1 박제값 2000 으로 산출한 forensic px 비 예측 13.5% 가 DoD 임계 ≤ 6% 를 2.25배 초과 (forensic ADR §"라운드 1 D-T2 px 비 예측" 박제 보존). forensic 측정 식은 `pxDiameter ∝ scale` (1차 비례) 이므로 임계 정렬값 산출:

`mercuryScale = 2000 × (6 / 13.5) ≈ 889` → **900** (보수 라운딩 + 임계 한계 정렬)

| 항목                     | Amendment 2026-05-01 (라운드 1) | Amendment 2026-05-01 (라운드 2)        |
| ------------------------ | ------------------------------- | -------------------------------------- |
| mercuryScale             | 2000 (적극값)                   | **900 (적극 재조정)**                  |
| sun 대비 px 비 예측      | 13.5% (1280×720)                | **~6.0% (1280×720)** (예측, 임계 한계) |
| 라운드 1 → 라운드 2 차이 | -                               | **2.25배 축소** (임계 비례 역산)       |

### 라운드 1 박제값 2000 의 D-T2 임계 초과 박제 보존

본 amendment 는 라운드 1 박제값 `mercuryScale 2000` 의 임계 초과 사실을 **삭제하지 않고 보존**. forensic ADR §"라운드 1 D-T2 px 비 예측" 의 13.5% 산출이 trace 가능하도록 라운드 1 amendment 본문 유지. 라운드 2 결정의 trace = "왜 라운드 1 (2000) 에서 라운드 2 (900) 으로 재조정했는가" → forensic ADR Amendment 2026-05-01 (라운드 2) §"임계 비례 역산" SSoT.

### D-T2 px 비 예측 갱신 (라운드 2)

- mercury sun 대비 ≤ 6% 통과 예측 (목표 = 임계 한계, 임계 비례 역산 정렬)
- mercury pxDiameter ~14.9 (라운드 1 ~33.2 의 ~45% 수준)
- 측정 노이즈 ± 5% 마진 안에 들어와야 통과

### 가드 갱신 — 라운드 1 임계 보존

본 ADR Amendment 2026-05-01 (라운드 1) §"가드 갱신" 의 brightRatio + sun 대비 px 비 ≤ 6% 임계는 **그대로 보존**. 박제값만 900 으로 갱신:

1. r1-ui-regression-guard 의 brightRatio 가드 — 라운드 1 명세 그대로 유지 (sunScale 50 baseline 변경 없음)
2. `r1-guard --measure-px-ratio` 신설 — forensic ADR §결정 2 §5 Amendment 2026-05-01 (라운드 1) 명세 그대로 구현. **mercury 임계 sun 대비 ≤ 6%** (라운드 2 박제값 900 의 통과 목표)
3. `mercury` 색감/명도 (#A89888) 라운드 1 그대로 유지
4. `body-scale.test.ts` 박제값 단위 테스트 — `mercury: 900` 정확 일치 검증 (라운드 1 의 2000 단위 테스트 갱신)

### Cross-validate (라운드 2)

본 amendment 는 forensic ADR Amendment 2026-05-01 (라운드 2) §Cross-validate 결과 의 cross-validate (Gemini 2.5 Pro, 2026-05-01) 커버리지 안 — 별도 cross-validate skip. forensic ADR 라운드 2 cross-validate 결과가 본 amendment 의 의도까지 포괄.

### 참조 (라운드 2)

- forensic ADR Amendment 2026-05-01 (라운드 2) — 본 amendment 의 근거 SSoT
- R1 ADR Amendment 2026-05-01 §"라운드 2 결정" (sunScale 50 그대로 유지)
- R3 ADR Amendment 2026-05-01 (라운드 2) — venusScale 1500 → 650 동반 박제

---

## Amendment 2026-05-03 (라운드 3) — mercuryScale 900 → 700 (사실 비율 강화 D-1)

> **상태**: 라운드 2 박제값 (mercury 900) 의 사실 비율 도달률 72% 미충족. forensic ADR `20260430-r3-followup-body-proportion.md` Amendment 2026-05-03 (라운드 3) §"D-1 / D-2 / D-3 후보 비교" 채택 D-1 결과.
> **선행**: 본 ADR Amendment 2026-05-01 (라운드 2) — mercuryScale 2000 → 900.
> **트리거**: 사용자 D-T2 (PR #384, 2026-05-01) "전체적인 비율은 개선됨 / 실제 비율적으론 아직 맞지 않는 듯" 부분 통과 → venus > mercury 사실 비율 강화 라운드 3 진입.

### 결정

- `mercuryScale: 900 → 700` (사실 비율 강화 D-1, 라운드 3)
- venus 동반 박제: `650 → 800` (R3 ADR Amendment 2026-05-03 라운드 3 SSoT)
- sun 보존: `50` (R1 ADR Amendment 2026-05-01 라운드 1)

### 근거 (forensic ADR D-1 채택 4축)

forensic ADR `20260430-r3-followup-body-proportion.md` Amendment 2026-05-03 (라운드 3) §"D-1 / D-2 / D-3 후보 비교" 의 4축 평가 (사실 비율 도달률 / 4px fallback 안전 마진 / LOD 일관성 / 모바일 누적 disk area) 에서 D-1 (mercury 700 / venus 800) 채택. 본 amendment 는 mercury 측 박제값 갱신 — 라운드 2 와 동일하게 `body-scale.ts` 의 mercury 상수값만 변경 (+0 라인).

### 라운드 3 mercury 영향 박제

| 항목                                       | 라운드 2 (mercury 900) | 라운드 3 D-1 (mercury 700) | 변동           |
| ------------------------------------------ | ---------------------- | -------------------------- | -------------- |
| pxDiameter (1280×720, dpr=1, T1 default)   | ~14.9 px               | **~11.6 px** (예측)        | -3.3 px (-22%) |
| pxDiameter 저점 (1280×720, dpr=1, far)     | 6.80 px (low)          | **5.29 px (low)** (예측)   | -1.51 px       |
| sun 대비 px 비 (1280×720)                  | ~6.07%                 | **~4.71%** (예측)          | -1.36%p        |
| 모바일 disk area (375×667, baseline)       | ~1.94%                 | **~1.17%** (예측)          | -0.77%p        |
| LOD 분포 (16 cell)                         | low 5 / mid 11         | **low ~10 / mid ~6** (예측) | low +5/16 증가 |
| 4px fallback 마진 (저점)                   | +2.80 px               | **+1.29 px** (예측)        | -1.51 px       |

**4px fallback 안전성**: D-1 mercury 저점 5.29 px 가 PR #394 Phase 2 의 4px fallback 임계와 1.29 px 마진. D-2 (mercury 600) 의 0.53 px 마진 대비 **2.43배 안전**. 측정 노이즈 / floating-point 정밀도 변동 흡수 가능.

### r1-guard `--measure-px-ratio` mercury 임계 갱신

라운드 2 amendment §"가드 갱신" 의 mercury 임계 (sun 대비 ≤ 6%) 는 strict 박제. 라운드 3 박제값 (mercury 700) 의 ±5% 마진 (라운드 2 SSoT 정책 보존) 적용:

- 라운드 2 strict: mercury sun 대비 ≤ 6%
- 라운드 3 D-1 ±5% 마진: mercury sun 대비 ≤ **4.95%** (예측 4.71% × 1.05, 소수점 둘째 자리 보수 라운딩)

`apps/web/scripts/r1-ui-regression-guard.mjs` `PX_RATIO_THRESHOLDS.mercury` 갱신 의무 (developer 단계). ±5% 마진 정책 SSoT 보존.

### 가드 갱신 — 라운드 2 패턴 보존

본 amendment 는 라운드 2 amendment §"가드 갱신" 의 4종 가드 (brightRatio / px 비 / 색감 / 단위 테스트) 패턴 그대로 유지:

1. `r1-guard --measure-px-ratio` mercury 임계 — `4.95%` 갱신 (위 SSoT)
2. `mercury` 색감/명도 (#A89888) 라운드 1 그대로 유지 — 색상은 `body-scale` 과 직교
3. `body-scale.test.ts` 박제값 단위 테스트 — `mercury: 700` 정확 일치 검증 (라운드 2 의 900 단위 테스트 갱신)
4. 모바일 누적 disk area 가드 (≤ 25%) — D-1 누적 16.75% 통과 검증

### Cross-validate (라운드 3)

본 amendment 는 forensic ADR `20260430-r3-followup-body-proportion.md` Amendment 2026-05-03 (라운드 3) §"Cross-validate 결과 (라운드 3)" 의 cross-validate 커버리지 안 — 별도 cross-validate skip. forensic ADR 라운드 3 cross-validate 결과가 본 amendment 의 의도까지 포괄.

### 참조 (라운드 3)

- forensic ADR Amendment 2026-05-03 (라운드 3) — 본 amendment 의 근거 SSoT (D-1 채택 4축)
- R1 ADR (sunScale 50 그대로 유지, 라운드 1/2/3 보존)
- R3 ADR Amendment 2026-05-03 (라운드 3) — venusScale 650 → 800 동반 박제 (D-1 채택)
- 이슈 #385 — 라운드 3 architect → developer → qa → 사용자 D-T2 표준 흐름
