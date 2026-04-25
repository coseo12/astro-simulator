# ADR: R1 태양 가시성 — sunScale 기본값 + 상수 위치 + LOD × SUN_SCALE 합성 순서

- **상태**: Accepted
- **날짜**: 2026-04-25
- **결정자**: architect (#329 R1 PM 합의 라운드 2 후 위임)
- **관련**: #329 (본 R1 스프린트), #328 (Roadmap Reset PR), volt [#74](https://github.com/coseo12/volt/issues/74) (UX 가시성 회귀 교훈), ADR `20260424-p11-b-lod-design.md` (LOD 3단), ADR `20260424-tier-preset-design.md` (Tier Preset / GPU tier), ADR `20260422-floating-origin.md` (좌표 불변식), ADR `../deprecated/decisions/20260423-display-relative-scale-unification.md` (P12 §결정 폐기 — 본 ADR 의 sunScale 도입은 P12 §원칙 §1 "상대 비율 = 실측 고정" 폐기 결정의 첫 적용)
- **교훈 적용**: "신규 함수 ≠ 신규 구현" (`createBodyMesh` 재사용, 새 sun-mesh-component 미신설), "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (`BODY_SCALE` 데이터 구조로 R2~R10 코드 변경 0 박제), "주석 계약 vs 구현 drift" (P12 폐기 후 신 계약 명시 박제), "headless 브라우저 검증 ≠ 실 브라우저" (실 Chrome 수동 검증 R1 DoD 명시), "인계 항목 실측 재검증" (현재 baseline = 흰 점 sub-pixel, 6.957e8 m × 2 × 8.4e-11 ≈ 0.117 scene unit, pixel ≈ 2.85px 실측 산출), "sub-agent 검증 완료 ≠ GitHub 박제 완료" (3개 viewport 점유율 측정값 ADR §결과·재검토 조건 박제 의무)

---

## 통합 vs 분리 결정

**본 ADR 은 시각화 결정 3건 (sunScale / 상수 위치 / LOD 합성 순서) 통합**, 회귀 가드 인프라는 별도 ADR (`20260425-r1-ui-pixel-diff-guard.md`) 분리.

근거:

- 3건은 **동일 시각 결과를 결정** — sunScale 값 / 적용 지점 / LOD 와의 곱셈 순서가 모두 "기본 진입 시 태양이 화면에서 어떻게 보이는가" 를 함께 결정. 분리하면 "왜 이 값이 안전한가" 의 근거가 ADR 간 흩어짐
- **결정 의존성** — sunScale 값 선택은 LOD 합성 순서가 mesh radius 에 어떻게 영향하는지에 따라 달라짐. 한 ADR 안에서 의존성 가시화 우선
- 회귀 가드 (pixel diff 임계) 는 **R1+ 모든 R-Phase 가 공통 사용** 하는 인프라 — sunScale 값 변경 없이 임계만 조정하는 후속 변경이 가능. 따라서 책임 직교

---

## 배경

### 현재 상태 (2026-04-25 develop tip 실측)

[`docs/baselines/2026-04-25-current-ui-default.png`](../baselines/2026-04-25-current-ui-default.png) 기본 진입:

- T1 solar tier (`renderScaleForTier('solar') = 8.4e-11`), 카메라 `radius = 35` scene unit
- 태양 mesh diameter = `body.radius × 2 × renderScale` = `6.957e8 × 2 × 8.4e-11 ≈ 0.117` scene unit
- 카메라 fov = `0.8 rad` (Babylon ArcRotateCamera default), 1280×720 viewport 기준 pixel diameter ≈ `2.85 px`
- 결과: **중앙 흰 점 (sub-pixel)** — 사용자가 태양으로 인식 불가 (volt #74 회귀)

P12 폐기 결정 (`docs/deprecated/decisions/20260423-display-relative-scale-unification.md`) 으로 **§원칙 §1 "상대 비율 = 실측 고정"** 은 무효화. 본 ADR 은 폐기된 원칙 자리에 **시각화 과장 배수** 를 박제.

### PM 합의 입력 (#329 라운드 2)

- **Q1**: 가시성 측정 = **viewport 점유율 ≥ 3%** (해상도 무관)
- **Q3**: tier 전환 시 sunScale 동작 = **R1 비-범위** (현재 동작 유지, tier 변경 자체에 손대지 않음)

### 기존 자산 재사용 조사 ("신규 함수 ≠ 신규 구현")

| 자산                                                | 위치                                                 | 본 ADR 처리                                                                          |
| --------------------------------------------------- | ---------------------------------------------------- | ------------------------------------------------------------------------------------ |
| `createBodyMesh(body, scene, tier)`                 | `packages/core/src/scene/solar-system-scene.ts:1140` | **확장** — `diameter` 계산 라인에 sunScale (일반화: bodyScale) 곱셈 추가             |
| `createBodyMeshMid` / `createBodyBillboard`         | 동 파일 1169 / 1206                                  | **동일 패턴 확장** — 동일 계산식이 3변형 모두에 일관 적용 (LOD variant 간 비율 보존) |
| `renderScaleForTier(tier)`                          | `packages/core/src/scene/tier.ts`                    | **읽기 전용** — tier 변경 없이 LOD-radius 계산만 추가                                |
| `LOD_BODY_THRESHOLDS.star`                          | `packages/core/src/render/lod-body-thresholds.ts:64` | **수정 불요** — `mode='absolute-distance', highMaxDistanceMeters=AU` 그대로 적용     |
| `body.radius` (`solar-system.json`, 6.957e8 m 태양) | `packages/shared/data/solar-system.json:7`           | **읽기 전용** — 실측 데이터 그대로 (P12 폐기 원칙 §3 참조)                           |

**신규 구현**:

- `apps/web/src/constants/body-scale.ts` (신규 파일, ~30 라인) — `BODY_SCALE` 룩업 + `getBodyScale(bodyId)` 헬퍼
- `apps/web/src/constants/body-scale.test.ts` (신규, ~20 라인) — 룩업 무결성 + default fallback 테스트
- HUD tooltip 텍스트 변경 (info 패널) — `apps/web/src/components/panels/info-panel.tsx` 또는 동등 위치에 "× N 과장 중" 표시 (구현 위치 detail 은 developer 책임)

---

## 후보 비교

### 축 1 — `sunScale` 기본값

**기준** (PM 합의 + architect 추가):

1. 3개 viewport (1280×720 / 1920×1080 / 375×667) 에서 viewport 점유율 ≥ 3% 동시 만족
2. 시각적 자연스러움 — 큰 viewport 에서 침습적이지 않음 (≤ 25% 권고)
3. R2~R10 (수성 0.1 AU / 금성 0.72 AU / 지구 1 AU / ... / 해왕성 30 AU) 의 다른 body 와의 상대 비율 부담 최소화
4. 단순 정수 (사용자가 URL 또는 dev 콘솔에서 읽기 쉬움)

**점유율 산출식** (1280×720 viewport, 카메라 radius=35 scene unit, fov=0.8 rad 기준):

```
diameter (scene unit) = body.radius (m) × 2 × renderScaleForTier('solar') × sunScale
                      = 6.957e8 × 2 × 8.4e-11 × s
                      = 0.1169 × s

pixel diameter ≈ diameter × viewportHeight / (radius × 2 × tan(fov / 2))
              = 0.1169 × s × viewportHeight / (35 × 2 × 0.4228)
              = s × 0.00395 × viewportHeight

점유율 (원 면적 / viewport 면적) = π × (pixel_d / 2)² / (W × H)
```

3개 viewport 점유율 실산 (%):

| sunScale | 1280×720 (px d) | 1280×720 (점유율) | 1920×1080 (px d) | 1920×1080 (점유율) | 375×667 (px d) | 375×667 (점유율) | 평가                                 |
| -------- | --------------- | ----------------- | ---------------- | ------------------ | -------------- | ---------------- | ------------------------------------ |
| × 50     | 142             | 1.72%             | 213              | 2.74%              | 132            | 8.69%            | 1280×720 / 1920×1080 미달 — **탈락** |
| × 75     | 213             | 3.87%             | 320              | 6.18%              | 197            | 19.6%            | 모바일 19.6% 침습 가능               |
| × 100    | 285             | 6.91%             | 427              | 11.0%              | 263            | 34.7%            | **모바일 34.7% 과도 — 탈락**         |
| × 150    | 427             | 15.5%             | 640              | 24.7%              | 395            | 78.3%            | **모바일 화면 거의 차단 — 탈락**     |
| × 200    | 570             | 27.6%             | 854              | 44.0%              | 526            | 가시 영역 초과   | **탈락**                             |

**관찰**: 모바일 (375×667) 은 데스크톱 대비 카메라가 동일 radius=35 라도 viewport 짧은 변이 작아 동일 sunScale 에서 점유율이 **약 5배 가파르게 증가**. 위 표의 후보 중 어느 값도 3개 viewport 동시 만족 + 자연스러움 (≤ 25%) 양립 불가.

**해결책 — 후보 X (viewport-aware fixed): × 75 + 모바일 점유율 cap 19.6% 인정**:

- 데스크톱 1280×720 (3.87%) / 1920×1080 (6.18%) 은 3% 임계 통과 + 자연스러움 (< 7%)
- 모바일 19.6% 는 3% 임계 통과 + 인지 가능 + 화면 차단 안 함 (< 25%)
- **단순 정수 75 = 1.5 × 50 직관적**, R2 추가 시 BODY_SCALE 데이터 구조에 단순 박제 가능

**해결책 — 후보 Y (DPR / viewport-relative scaling)**:

- `sunScale = baseScale × max(1, 800 / Math.min(viewportW, viewportH))` 같은 동적 식
- 3개 viewport 모두 균질 점유율 (예: 5%) 달성 가능
- **탈락 사유**:
  - 데이터 1줄 추가가 아닌 **수식 도입** — "신규 데이터 ≠ 신규 코드" 교훈 위배 (R2~R10 추가 시마다 식 재검토)
  - 사용자가 "× N 과장 중" 표시값을 viewport 마다 다르게 봄 — 인지 부담 증가
  - viewport resize 시 mesh diameter 변경 → tier 전환과 직교성 깨짐

**해결책 — 후보 Z (LOD radius-multiple 활용)**:

- LOD `star` rule 을 `mode='radius-multiple'` 로 바꾸고 sunScale 효과를 `body.radius` 자체에 곱셈
- **탈락 사유**: LOD ADR §결정 §3 "high/mid/low 이외의 값 도입 금지" 와 직교성 — `lod-body-thresholds.ts` 의 star rule 변경은 본 R1 비-범위. 그리고 LOD 는 "얼마나 섬세하게 그릴까" 책임이고 "얼마나 크게 그릴까" 와 분리 (LOD ADR §배경 명시)

**선택**: **후보 X — `BODY_SCALE.sun = 75`** + 모바일 점유율 19.6% 인정 (R1 DoD viewport 점유율 ≥ 3% 만족, ≤ 25% 자연스러움 만족)

### 축 2 — 단일 상수 파일 위치

**후보**:

| 후보                                           | 거리 (sun-mesh 호출 지점)                                                       | R2~R10 확장성                              | 평가                                                                                                      |
| ---------------------------------------------- | ------------------------------------------------------------------------------- | ------------------------------------------ | --------------------------------------------------------------------------------------------------------- |
| **A. `apps/web/src/constants/body-scale.ts`**  | `apps/web/src/components/sim-canvas.tsx` 에서 props 주입 → core scene 으로 전달 | ✓ — 데이터 1줄 추가만으로 R2~R10 가능      | **선택**                                                                                                  |
| B. `apps/web/src/config/body-scale.ts`         | 동일 (apps/web 레벨)                                                            | ✓                                          | `config/` 가 현재 미존재 + 의미상 "런타임 설정" 보다 "정적 데이터"                                        |
| C. `packages/core/src/constants/body-scale.ts` | 동일 패키지 내 (가까움)                                                         | ✓ + 다른 패키지 (예: physics) 도 사용 가능 | **탈락** — sunScale 은 **시각 과장 배수** 로 physics 와 직교, core 노출 시 추후 physics 가 잘못 의존 가능 |
| D. `packages/shared/data/body-scale.json`      | JSON 데이터로 박제                                                              | ✓ — 데이터-주도 패턴                       | **탈락** — JSON 은 zod schema 정의가 추가 필요, 코드 1 라인 (TS 객체 리터럴) 대비 부담                    |

**선택 근거 (A)**:

1. **현재 위치 컨벤션** — `apps/web/src/constants/` 디렉토리는 미존재이나 `apps/web/src/core/parse-*.ts` 와 같은 레벨에서 정적 데이터를 두는 자연스러운 위치. `apps/web/src/config/` 도 미존재이며 `config` 는 일반적으로 "런타임 설정" 의미. body-scale 은 **컴파일 시점 정적 데이터** 로 `constants/` 가 정확
2. **물리 엔진 격리** — `packages/core/src/scene/tier.ts` 의 `renderScale` 은 m → scene unit 변환 (실측 기반), `BODY_SCALE` 은 **시각 과장** (의도적 비율 왜곡). 두 책임을 분리하기 위해 `packages/core` 가 아닌 `apps/web` 에 둬야 함. 미래에 physics 엔진 (Rust wasm) 이 BODY_SCALE 에 잘못 의존하면 적분기가 왜곡된 거리로 계산 (P11-A `Rust engine 좌표는 heliocentric 절대 m` 계약 위배)
3. **천체 물리 상수와의 분리** — `body.radius` 등 실측 상수는 `packages/shared/data/solar-system.json` 에 박제됨. body-scale 은 그것의 **렌더 시각 변형** 이며 분리 위치가 의도 명확
4. **R2~R10 확장 패턴 일관성** — 다른 미래 시각 변형 (orbit-line-color, body-emission-multiplier 등) 도 동일 위치에 추가될 수 있는 구심점 마련

### 축 3 — LOD × SUN_SCALE 곱셈 순서

**문제**: 3개 변형이 mesh diameter 에 동시 작용한다:

- (1) `body.radius` × 2 (실측 직경)
- (2) `renderScaleForTier(tier)` (m → scene unit 변환)
- (3) `BODY_SCALE[bodyId]` (R1 신규 — 시각 과장)
- (4) LOD variant 선택 (high segments=32 / mid=12 / low billboard) — geometry 정밀도만 변경, **diameter 자체는 동일**

`createBodyMesh` / `createBodyMeshMid` / `createBodyBillboard` 3 함수 모두 `body.radius × 2 × renderScaleForTier(tier)` 동일 식 사용. `BODY_SCALE` 곱셈 위치 후보:

**후보 P (선택)**: `diameter = body.radius × 2 × renderScaleForTier(tier) × BODY_SCALE[bodyId]`

- LOD variant 3종 모두 동일 식 — diameter 비율 보존 (high 와 mid/low 가 같은 크기 유지, 사용자가 LOD 전환 인지 못 함이 ADR `20260424-p11-b-lod-design.md` §결정 §4 의 sub-context)
- BODY_SCALE 은 **mesh diameter 계산의 마지막 단계** — `body.radius × 2 × renderScale` 이 "실측 → scene 좌표" 변환이고, BODY_SCALE 은 그 위에 시각 보정 layer
- LOD 분기 이전에 적용되므로 `screenCoverageRadius` 가 **확대된** mesh 의 화면 점유 픽셀을 계산 → LOD 결정이 시각적으로 의도와 일치 (예: 태양 × 75 가 high LOD 진입 조건 `< 1 AU` 와 호응)

**후보 Q**: `diameter = body.radius × BODY_SCALE[bodyId] × 2 × renderScaleForTier(tier)`

- 수학적으로 후보 P 와 결과 동일 (곱셈 교환법칙)
- **탈락** — 의도가 "body radius 자체를 키운다" 로 보임 → 실측 데이터를 왜곡한다는 인식. P 는 "mesh diameter 의 마지막 시각 보정" 의도가 명확

**후보 R**: `mesh.scaling = BODY_SCALE[bodyId]` (BodyScale 을 Babylon scaling 으로 표현)

- ADR `../deprecated/decisions/20260423-display-relative-scale-unification.md` §주석 계약 §2 가 폐기됐으므로 가능
- **탈락 사유**:
  - LOD ADR `20260424-p11-b-lod-design.md` 의 mid variant `parent = high`, billboard `parent = high` 패턴 — `mesh.scaling` 으로 sunScale 을 표현하면 **parent 상속** 으로 mid/low variant 도 자동 확대되지만, LOD `screenCoverageRadius` 는 `body.radius` 실측값을 입력으로 받음 (lod.ts:163). 따라서 **LOD 분기 결정이 sunScale 무시** 한 결과로 나오고, sunScale × LOD 의 시각적 inconsistency 발생
  - tier 전환 시 `mesh.scaling.scaleInPlace` 호출이 BODY_SCALE 영향을 받게 되어 P12-B Phase B 의 "apparent size 불변" 수식 (`radius_old / oldScale == radius_new / newScale`, tier-transition.ts) 이 sunScale 보정을 추가로 요구 → tier 전환 알고리즘에 손대게 됨 → **Q3 합의 (tier 변경 자체에 손대지 않음) 위배**
- **결론**: `mesh.scaling` 은 `1` 유지 (P12-A Phase A 잔여 계약, 폐기되지 않음), BODY_SCALE 은 **diameter 계산식에만 박제**

**선택**: **후보 P — `body.radius × 2 × renderScaleForTier(tier) × BODY_SCALE[bodyId]`** 3변형 모두 동일 식

### 축 4 — `screenCoverageRadius` LOD 입력 정합

축 3 후보 P 선택 시, `screenCoverageRadius(bodyLocalPos, body.radius, renderScale, ...)` 의 두 번째 인자 `bodyRadiusMeters` 를 **확대된 effective radius** 로 전달할지 **실측 radius** 로 전달할지 결정 필요:

- **후보 α (선택)**: `screenCoverageRadius(localPos, body.radius × BODY_SCALE[bodyId], renderScale, ...)` — LOD 가 시각적으로 보이는 크기 기반으로 high/mid/low 결정
- 후보 β: 실측 radius 그대로 — LOD 가 실세계 크기 기반으로 결정 → 태양은 sunScale 적용 후에도 sub-pixel 시점에서 low billboard 로 분류될 가능성

**선택 (α) 근거**:

- LOD 의 목적 = "얼마나 섬세하게 그릴까" — 화면 점유 픽셀이 결정 기준 (`LOD_PIXEL_THRESHOLDS = { high: 50, mid: 8 }`)
- 태양이 BODY_SCALE × 75 적용 후 화면에 285px 차지하면 high LOD 가 자연스럽고 사용자 의도와 일치
- LOD `star` rule (`absolute-distance < 1 AU`) 이 별도 강제 규칙이라 카메라가 1 AU 안이면 어차피 high 강제 — α/β 차이는 1 AU 밖 케이스에서만 발생, 영향 범위 작음

---

## 결정

### 결정 1 — `BODY_SCALE.sun = 75`

`apps/web/src/constants/body-scale.ts` 에 박제:

```typescript
/**
 * R1 #329 — body 별 시각 과장 배수.
 *
 * P12 §원칙 §1 "상대 비율 = 실측 고정" 폐기 결정
 * (`docs/deprecated/decisions/20260423-display-relative-scale-unification.md`) 의 첫 적용.
 *
 * 적용 지점: `createBodyMesh*` 에서 `diameter = body.radius × 2 × renderScale × scale`.
 * 실측 데이터 (body.radius, solar-system.json) 자체는 변경 없음.
 *
 * 1.0 = 실측 그대로. > 1 = 시각 과장. < 1 은 R1 비-범위.
 *
 * R1 baseline: T1 solar / camera radius=35 scene unit / fov=0.8 rad 기준
 * sun = 75 → pixel diameter ≈ 213px (1280×720), 점유율 3.87%
 *           pixel diameter ≈ 263px (375×667), 점유율 19.6% (모바일 인지 가능, 화면 차단 없음)
 */
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 75,
} as const);

const DEFAULT_BODY_SCALE = 1.0;

/**
 * body id 의 시각 과장 배수 조회. 미정의 시 1.0 (실측).
 *
 * R2~R10 에서 다른 body 추가 시 본 룩업에 1줄 추가만으로 처리. 호출 코드 변경 0 (Concrete Prediction).
 */
export function getBodyScale(bodyId: string): number {
  return BODY_SCALE[bodyId] ?? DEFAULT_BODY_SCALE;
}
```

### 결정 2 — 위치 `apps/web/src/constants/body-scale.ts`

축 2 선택 (A). 디렉토리 신규 생성. `apps/web/src/core/` 와 같은 레벨 (formatter / parser / 정적 데이터 의 자연스러운 형제 관계).

### 결정 3 — diameter 계산식

`packages/core/src/scene/solar-system-scene.ts` 의 `createBodyMesh`, `createBodyMeshMid`, `createBodyBillboard` 3 함수 모두:

```typescript
// 변경 전 (현재):
const diameter = body.radius * 2 * renderScaleForTier(tier);

// 변경 후 (R1):
const bodyScale = getBodyScale(body.id); // import from apps/web/src/constants/body-scale
const diameter = body.radius * 2 * renderScaleForTier(tier) * bodyScale;
```

**중요한 모듈 경계**: `apps/web` 에 박제된 BODY_SCALE 을 `packages/core` 가 직접 import 하면 **레이어 의존 역전** (apps → packages 가 정상). 해결책 **2가지 후보**:

- **후보 a (권고)**: `createSolarSystemScene` 의 옵션에 `bodyScale: (bodyId: string) => number` 콜백 주입 — apps/web 의 sim-canvas.tsx 에서 `getBodyScale` 을 옵션으로 전달. core 는 콜백 호출만 하고 데이터 모름
- 후보 b: `packages/shared/data/body-scale.json` 으로 박제 → core/web 모두 import — 단 zod schema 추가 필요 (위 축 2 D 탈락 사유)

**developer 인계**: 후보 a 를 기본 채택. `createSolarSystemScene` 옵션 시그니처에 `bodyScale?: (bodyId: string) => number` 추가, default 는 `() => 1.0`. 옵션 미주입 시 현재 동작과 동일 (테스트 회귀 0).

### 결정 4 — `screenCoverageRadius` 입력

축 4 선택 (α). `solar-system-scene.ts:850` 의 `screenCoverageRadius` 호출 라인:

```typescript
// 변경 전 (현재):
const coverage = screenCoverageRadius(
  [localX, localY, localZ],
  body.radius,
  sceneUnitPerMeter,
  vpArr,
  viewportHeight,
);

// 변경 후 (R1):
const effectiveRadius = body.radius * (bodyScaleFn?.(body.id) ?? 1.0);
const coverage = screenCoverageRadius(
  [localX, localY, localZ],
  effectiveRadius,
  sceneUnitPerMeter,
  vpArr,
  viewportHeight,
);
```

`bodyScaleFn` 은 결정 3 의 옵션 콜백 (`createSolarSystemScene` options).

### 결정 5 — Q3 합의 비-범위 보호 가드

`tier.ts` / `tier-transition.ts` / `tierFromFocus` / `tierFromCameraDistance` **수정 금지**. R1 PR 에서 이 4 파일에 대한 git diff 라인 변화 0 을 자동 검증 (`scripts/verify-r1-tier-untouched.sh` 신설 권고).

`packages/core/src/scene/solar-system-scene.ts` 의 변경은 **`createBodyMesh*` 의 diameter 계산 라인 + `screenCoverageRadius` 호출 라인 + `createSolarSystemScene` 옵션 시그니처 추가** 3 부분만. tier 관련 모든 함수의 본체는 무변경.

---

## 결과·재검토 조건

### Concrete Prediction (R2~R10 코드 변경 0 박제)

ADR `20260419-satellite-orbit-hybrid.md` §Concrete Prediction 패턴 적용:

> **Prediction**: R2 (수성) 추가 시 `apps/web/src/constants/body-scale.ts` 에 `mercury: <N>` 1줄 추가만으로 시각화 처리 완료. `solar-system-scene.ts` / `sim-canvas.tsx` / `tier.ts` / `lod*.ts` 의 **코드 라인 변화 0**.

검증 절차 (R2 PR 에서 자동 재현):

```bash
# R2 PR 에서 실행:
git diff develop...HEAD --stat \
  packages/core/src/scene/solar-system-scene.ts \
  packages/core/src/scene/tier.ts \
  packages/core/src/render/lod.ts \
  apps/web/src/components/sim-canvas.tsx
# 위 4 파일의 변경 라인 합계 = 0 이어야 Prediction 성공
```

Prediction 실패 시 두 갈래:

- (a) 추상화 부족 — `BODY_SCALE` 룩업이 부족. ADR Amendment 박제 후 리팩토링
- (b) 예외 케이스 — 수성 특수 시각 효과 (transit / 1AU 내) 가 별도 분기 필요. R2 ADR 에서 예외 인정 박제

### 회귀 가드

- 본 ADR 의 R1 구현 PR 에서 **3개 viewport 점유율 실측값 박제** (1280×720 / 1920×1080 / 375×667) — 본 ADR §결정 1 표의 예측값 (3.87% / 6.18% / 19.6%) ± 0.5% 이내
- 측정 도구는 별도 ADR `20260425-r1-ui-pixel-diff-guard.md` 의 회귀 가드 인프라와 통합 (sun viewport 점유율 측정도 같은 playwright 스크립트에서 수행)

### 재검토 트리거

다음 조건 중 하나면 본 ADR 재검토 (Amendment 또는 신 ADR):

1. R2 추가 시 BODY_SCALE 룩업 1줄 추가로 처리 불가 (Concrete Prediction 실패)
2. 모바일 (375×667) 에서 점유율 19.6% 가 사용자 피드백에서 침습적이라고 평가됨 — viewport-aware scaling (후보 Y) 재검토
3. P12 폐기 결정이 재해석되어 "실측 비율 고정" 원칙이 부분 복원될 경우
4. tier 전환 알고리즘 변경 (R-Phase 후속) 으로 sunScale 적용 시점이 달라져야 할 경우 (Q3=C 합의 무효화)
5. **카메라 거리 동적 배율 검토** (Gemini 교차검증 개선 제안 3) — 사용자가 태양에 가까이 다가갈수록 sunScale 을 1 (실측) 에 가깝게 줄이는 방식. 극단적 줌인에서 시각 어색함 발생 시 검토
6. **#333 Phase 2 처리 시점 도래** — billboard variant 의 `bodyScale` 효과 분리 결정 시 본 ADR §결정 3 ("3 변형 모두 동일 식") amendment 필요. R2 진입 전 처리 권고

### 위험 / 미해결

- **모바일 점유율 19.6%** — 모바일 터치 인터랙션에서 태양이 화면 1/5 차지하면 그 뒤 행성 (수성 등 R2+) focus 가 어려울 수 있음. R2 진입 시 재평가 필요. 본 R1 단독에서는 "태양만 보이면 OK" 단계라 허용
- **카메라 radius=35 가 미래 카메라 reset 변경 시 점유율 변경** — `apps/web/src/components/sim-canvas.tsx:158` 의 `radius: 35` 가 변경되면 본 ADR §결정 1 의 점유율 표가 무효화. 재검토 트리거 #4 에 해당
- **tier 전환 시 sunScale 동작 비-범위 (Q3=C)** — Solar tier 진입 시는 sunScale 적용, Inner/Body tier 진입 시 동작 미정의. 현재 구현은 모든 tier 에서 동일 식 적용 → 모든 tier 에서 sunScale 영향. R2+ 에서 "Solar tier 만 sunScale 적용" 또는 "tier 별 sunScale 차등" 결정 가능

#### Phase 2 결정 ([#333](https://github.com/coseo12/astro-simulator/issues/333)) — billboard 에서 bodyScale 제거 (후보 A 채택)

**날짜**: 2026-04-25 (architect 결정 — #333 단계)
**관련**: PR #332 (R1 본 구현), #336 (Phase 2 분리 박제), reviewer #332 §D-1, #339 (Phase 2 분리 사유 박제)

##### 결정 (Amendment to §결정 3)

`createBodyBillboard` 의 `diameter` 계산식에서 `bodyScale` 곱셈을 **제거** 한다.

```typescript
// 변경 전 (R1 본 구현):
function createBodyBillboard(...) {
  const diameter = body.radius * 2 * renderScaleForTier(tier) * bodyScale(body.id);
  // ...
}

// 변경 후 (R1.x #333 Phase 2):
function createBodyBillboard(...) {
  // billboard 는 sub-pixel body 의 draw call 절감 책임 (P11-B ADR §축 4).
  // 가시 과장 (bodyScale) 은 sphere variant (high/mid) 만 책임 — 책임 직교화.
  const diameter = body.radius * 2 * renderScaleForTier(tier);
  // ...
}
```

**§결정 3 의 "3 변형 모두 동일 식" 계약은 본 amendment 로 변경**. 새 계약:

- `createBodyMesh` (high) / `createBodyMeshMid` (mid) — `body.radius × 2 × renderScale × bodyScale(id)` (§결정 3 그대로)
- `createBodyBillboard` (low) — `body.radius × 2 × renderScale` (bodyScale 제외)

##### 후보 비교 결과 (4 후보안 — #333 본문)

| 후보                                         | 채택 여부 | 핵심 사유                                                                                                                                                |
| -------------------------------------------- | --------- | -------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. billboard 에서 bodyScale 제거**         | **선택**  | billboard 의 본래 의도 (P11-B §축 4 sub-pixel draw call 절감) 보존. 가시성은 sphere 가 책임 — 책임 직교화                                                |
| B. star kind threshold 를 75 AU 로 확장      | 탈락      | LOD 분기 자체 변경 (정적 상수 → 동적 함수). P11-B §주석 계약 §2 위배. tier-c sub-pixel 강제와 정면 충돌                                                  |
| C. billboard 자체 폐기 (star 한정)           | 탈락      | P11-B §결정 §3 "high/mid/low 외 도입 금지" 위배. star 만 variant 가짓수 분리는 "신규 데이터 ≠ 신규 코드" 위배. sphere segments=32 강제 시 draw call 회귀 |
| D. bodyScale cap (`LOD_BILLBOARD_MAX_SCALE`) | 탈락      | 매직 넘버 도입. R10 추가 시 cap 값 재산정 부담. A 가 cap 없이 더 단순                                                                                    |

##### 픽셀 경계 자연 정합 분석 (A 채택의 정량 근거)

**핵심 논리**: billboard 진입 = `screenCoverage < 8px` (P11-B §결정 §5 픽셀 경계). billboard 가 등장한다는 건 화면 점유가 이미 sub-pixel 영역. 이 영역에서 bodyScale ×75 곱셈 효과는 user perception 측면에서 **zero gain**.

LOD 분기 입력 `effectiveRadius` (`solar-system-scene.ts:871`) 는 `body.radius × bodyScale(id)` 으로 이미 확대된 값을 `screenCoverageRadius` 에 전달. 따라서 sun ×75 효과는 LOD 분기 _결정_ 에 충분히 반영. `screenCoverage >= 8px` 면 mid/high LOD 로 진입하여 sphere 가 그려지고, `< 8px` 면 billboard 가 등장하지만 그 시점엔 이미 sub-pixel 이라 bodyScale 적용 여부가 사용자 인지에 영향 없음.

**거대 quad 회귀 시나리오 재검증**:

1. focus 강제 해제 (`isFocused=false`)
2. 카메라가 1 AU 외부 (`star` kind 의 `< 1 AU` 강제 규칙 미적용)
3. `effectiveRadius = body.radius × 75` 가 `screenCoverageRadius` 입력
4. coverage 결과가 픽셀 경계 부족 (예: 7.5px) → low billboard 분기
5. **변경 전**: `diameter = body.radius × 2 × renderScale × 75` → 화면 ~213px quad (회귀)
6. **변경 후 (A)**: `diameter = body.radius × 2 × renderScale` → 화면 ~2.85px quad (sub-pixel, 정상 의도)

##### Concrete Prediction (R10 호환성 박제)

R10 혜성 / 소행성 / dwarf-planet 이 추가될 때:

- **bodyScale = 1.0 (실측 그대로)** 인 body 는 본 amendment 영향 없음 (sphere = billboard = 동일 식)
- bodyScale > 1.0 (가시 과장) 인 body 가 미래에 추가되면 — sphere variant 만 과장, billboard variant 는 실측 → **billboard 진입 시점 (sub-pixel) 에서 사용자 인지 zero gain 일관성**

**Prediction**: R2~R10 추가 시 본 amendment 효과는 자동 적용. `apps/web/src/constants/body-scale.ts` 에 `<body>: <N>` 1줄 추가만으로 처리. `createBodyBillboard` 무수정.

검증 절차 (각 R-Phase PR 에서):

```bash
# R-Phase PR 머지 후 회귀 확인:
git diff develop...HEAD --stat \
  packages/core/src/scene/solar-system-scene.ts
# createBodyBillboard 함수 본체 변경 라인 = 0 이어야 Prediction 성공
```

##### 결과·재검토 조건

- 본 amendment 의 implementer PR 에서 **R1 회귀 가드 4 영역 mismatch ≤ 0.5% 유지** 검증 (`r1-ui-regression-guard.mjs`)
- `p329-qa-focus-lod-guard.mjs` PASS — 새 식 적용 후에도 Phase 1 fix 의 sphere 시그니처 유지
- DoD #333: focus 강제 해제 + 1 AU+ 카메라 거리 + 픽셀 경계 부족 케이스에서 sun billboard quad 가 화면 점유 ≤ 5% (이론값 ≈ 0.04%, 마진 충분)

##### 재검토 트리거 (Amendment 무효화)

다음 중 하나면 본 amendment 재검토:

1. R10 혜성 dust tail 같이 billboard variant 자체가 가시 효과 핵심인 케이스가 등장 — billboard 가 가시 효과를 책임지는 새 정책 필요
2. 미래 Phase 에서 sub-pixel body 에 시각 마커 (예: glyph / icon) 가 합성되어 billboard 가 sub-pixel 이상 크기를 의도적으로 가져야 할 경우
3. P11-B LOD ADR §축 4 의 "sub-pixel draw call 절감" 책임이 다른 메커니즘 (impostor, instancing 등) 으로 대체될 경우

##### Cross-validate (Phase 2 박제 직후)

본 amendment 박제 직후 Gemini 2.5 Pro cross-validate 1회. 합의/이견/고유발견은 본 ADR 의 [§교차검증 반영 사항](#교차검증-반영-사항) 의 **#333 Phase 2 추가** 서브섹션에 기록.

---

### 교차검증 반영 사항

본 ADR 박제 직후 cross-validate 1회 (Gemini 2.5 Pro, 2026-04-25). Claude 자체 편향 4종 셀프 체크 통과 후 호출 (낙관적 일정 ✓ / 결합 간과 △ / 폐기 프레이밍 ✓ / 순수주의 △). outcome=applied.

**합의** — Claude 설계와 일치 + 본 PR 에 반영:

- **callback 옵션 주입 패턴 (§결정 3 후보 a)** — Gemini 가 "의존성 역전 문제를 인지하고 의존성 주입으로 해결한 점이 훌륭" 으로 합의. 결합 간과 우려 완화
- **시각/물리 계층 분리 (§축 2 선택 A)** — Gemini 가 "물리 엔진이 시각적 과장 값을 잘못 참조하여 계산 오류를 일으킬 위험을 원천 차단" 으로 강하게 합의
- **`mesh.scaling = 1` 유지 + diameter 계산 마지막 곱셈 (§축 3 후보 P)** — Gemini 가 "기존 LOD 및 tier 전환 로직과의 상호작용을 깊이 있게 분석한 결과로 타당성이 매우 높음" 으로 합의

**이견 수용** — Claude 원안 보강:

- **Tier 별 `bodyScale` 차등 가능성 (Gemini 개선 제안 1)** — Claude 원안의 callback 시그니처는 `(bodyId: string) => number`. Gemini 가 "Body tier 처럼 특정 행성에 매우 가깝게 접근했을 때 멀리 있는 태양이 비정상적으로 크게 보이는 문제" 를 지적. **수용** — 본 R1 구현에서는 tier 무인자 callback 그대로 진행하되 (Q3=C 비-범위 가드), 본 ADR §위험·미해결 에 "tier 별 sunScale 차등이 R2+ 에서 필요할 가능성" 을 명시 (이미 §결정 5 에서 부분 박제됨). developer 가 callback 시그니처 확장 여지를 열어두도록 인계 메모 추가
- **카메라 거리 동적 배율 (Gemini 개선 제안 3)** — 사용자가 태양에 가까이 다가갈수록 sunScale 을 1 (실측) 에 가깝게 줄이는 방식. **부분 수용** — §재검토 트리거 에 추가 (현재 R1 범위 밖, 재검토 트리거 #5 로 박제)
- **HUD tooltip UX 가이드라인 (Gemini 개선 제안 2)** — "× 75 과장 중" 이 일반 사용자에게 혼란. **수용** — Developer 인계에 "사용자 친화 표현 우선 (예: '가시성을 위해 75배 확대')" 추가

**Claude 재분석으로 기각한 Gemini 제안**: 없음 (Gemini 제안 모두 합리적, 본 ADR 은 모두 합의 또는 부분 수용으로 처리)

**고유 발견 (후속 분리)**: 없음 (모두 본 PR 범위 내 처리 가능)

#### #333 Phase 2 추가 — billboard bodyScale 분리

본 amendment 박제 직후 cross-validate 1회 (Gemini 2.5 Pro, 2026-04-25). Claude 자체 편향 4종 셀프 체크: 낙관적 일정 ✓ (스프린트 추가 없음) / 결합 간과 △ (billboard vs sphere 식 분리 인지 부담) / 폐기 프레이밍 ✓ (책임 직교화 명확) / 순수주의 △ ("책임 직교화" 가 회귀 회피 사후 정당화 가능성). △ 2개를 명시 질문으로 삽입. outcome=applied (exit 0).

**합의** — Claude 설계와 일치 + 본 PR 에 반영:

- **Q2 결정 (책임 직교화 vs cap)** — Gemini 가 "후보 A (현재 결정) 가 LOD 의 본질적 목적 (가시성 vs 성능) 에 맞춰 책임을 명확히 분리하는 것이 장기적 부작용 적음. 후보 D (Cap) 는 향후 천체 추가 시마다 'Cap 값이 적절한가' 재검증 부채" 로 강하게 합의. 순수주의 △ 우려 해소
- **Q3 결정 (미래 재검토 정상성)** — Gemini 가 "현재의 요구사항으로 결정, 미래 책무 변경 시 재검토 트리거 발동 = 애자일 아키텍처의 올바른 작동" 으로 합의. 본 amendment 의 §재검토 트리거 #1 (R10 dust tail) 정당성 확보
- **Q4 결정 (amendment vs 신규 ADR)** — Gemini 가 "기존 ADR §결정 3 의 엣지 케이스 교정 + 50라인 규모 = amendment 적합. 신규 ADR 분리 시 맥락 파편화" 로 합의. 분리 결정 정당성 확보

**이견 수용** — Claude 원안 보강:

- **Q1 (drift 방어)** — Claude 원안은 "주석 계약" 만 박제했으나 Gemini 가 **1순위로 단위 테스트** 를 강하게 추천 ("LOD 분기 로직에서 동일 body 주입 시 Sphere 빌더는 bodyScale 반영 직경 / Billboard 빌더는 미반영 직경 assert"). **수용** — implementer PR 에서 단위 테스트 추가 의무 박제 (developer 인계 항목). Linter rule 은 Gemini 도 "도메인 특화 단일 수식 차이는 유지보수 비용 과다" 로 비추천 → 채택 안 함

**Claude 재분석으로 기각한 Gemini 제안**: 없음

**고유 발견 (후속 분리)**: 없음 (Gemini 모든 제안이 amendment 범위 내 처리 가능)

##### Developer 인계 (Phase 2 implementer)

본 amendment 의 implementer PR 에서 다음 의무:

1. `createBodyBillboard` 의 `diameter` 계산식에서 `* bodyScale(body.id)` 제거. 식: `body.radius * 2 * renderScaleForTier(tier)`
2. `createBodyBillboard` 함수 본체 위 또는 `diameter` 계산 라인 위에 **drift 방어 주석 계약 박제**:
   ```typescript
   // R1.x #333 Phase 2 — billboard 는 sub-pixel body 의 draw call 절감 책임 (P11-B ADR §축 4).
   // 가시 과장 (bodyScale) 은 sphere variant (createBodyMesh / createBodyMeshMid) 만 책임.
   // ADR `docs/decisions/20260425-r1-sun-visualization.md` §"Phase 2 결정 (#333)" amendment 참조.
   // 향후 본 식을 `createBodyMesh*` 와 동일하게 변경하기 전 ADR 재검토 필수.
   ```
3. **단위 테스트 추가 의무** (Gemini Q1 1순위 권고 수용) — `packages/core/src/scene/solar-system-scene.test.ts` 또는 신규 `body-mesh-builder.test.ts` 에:
   - sphere variant: bodyScale `getBodyScale('sun') === 75` 주입 시 `createBodyMesh` 가 `bodyScale=1` 대비 75배 큰 diameter 생성 assert
   - billboard variant: 동일 입력에 `createBodyBillboard` 가 `bodyScale=1` 와 동일 diameter 생성 assert (× 75 미적용)
   - 회귀 시 즉시 fail — 향후 작업자가 두 식을 동기화 변경하면 본 테스트가 차단
4. R1 회귀 가드 4 영역 mismatch ≤ 0.5% 유지 검증 (`pnpm verify:r1-guard`)
5. `p329-qa-focus-lod-guard.mjs` PASS — `?focus=sun` 정상 sphere 시그니처 유지

**비-범위** (절대 손대지 말 것):

- `LOD_BODY_THRESHOLDS` (`lod-body-thresholds.ts`) — 0 라인 변경 (후보 B 탈락)
- `lodFromScreenCoverage` 본체 — 0 라인 변경 (후보 C 탈락)
- `createBodyMesh` / `createBodyMeshMid` 의 diameter 식 — 0 라인 변경 (sphere 는 §결정 3 그대로)
- `effectiveRadius` 계산 (`solar-system-scene.ts:871`) — 0 라인 변경 (LOD 분기는 sun ×75 효과 그대로 반영)
- 다른 body 의 bodyScale (R2~R10 범위)

---

## Developer 인계

**시작 지점**:

1. `apps/web/src/constants/body-scale.ts` 신규 작성 (위 §결정 1 코드 그대로)
2. `apps/web/src/constants/body-scale.test.ts` — `getBodyScale('sun') === 75`, `getBodyScale('unknown') === 1.0` 단위 테스트
3. `packages/core/src/scene/solar-system-scene.ts` 의 `CreateSolarSystemSceneOptions` 인터페이스에 `bodyScale?: (bodyId: string) => number` 추가, default 처리
4. `createBodyMesh` / `createBodyMeshMid` / `createBodyBillboard` 의 `diameter` 계산 라인에 `× bodyScale(body.id)` 추가
5. `solar-system-scene.ts:850` 의 `screenCoverageRadius` 호출에 effectiveRadius 적용
6. `apps/web/src/components/sim-canvas.tsx` 의 `sceneApi.createSolarSystemScene` 호출에 `bodyScale: getBodyScale` 옵션 추가
7. info-panel 또는 동등 위치에 tooltip 추가 (#329 DoD) — **사용자 친화 표현 우선** (Gemini 교차검증 개선 제안 2 반영). 예: "가시성을 위해 75배 확대" 또는 "실제 크기의 75배" — 기술적 정확성 (× 75 과장 중) 만 박제 시 일반 사용자 혼란 가능
8. **callback 시그니처 확장 여지** (Gemini 교차검증 개선 제안 1 부분 수용) — 현재 R1 은 `(bodyId: string) => number` 단일 인자로 진행 (Q3=C 비-범위 가드). 단, R2+ 에서 tier 차등 필요 가능성을 인지하고 차후 `(bodyId: string, tier?: Tier) => number` 로 확장 시 호출부 변경 최소화하도록 콜백 호출부에서 `bodyScaleFn(body.id)` 형태로 깔끔히 호출 (인자 위치 보존)

**참조 문서**:

- 본 ADR (시각화 결정)
- `20260425-r1-ui-pixel-diff-guard.md` (회귀 가드)
- `20260424-p11-b-lod-design.md` §결정 §4 (LOD variant geometry)
- 폐기 ADR `../deprecated/decisions/20260423-display-relative-scale-unification.md` §원칙 §1 (sunScale 도입 근거)

**비-범위** (절대 손대지 말 것):

- `packages/core/src/scene/tier.ts` — 0 라인 변경
- `packages/core/src/scene/tier-transition.ts` — 0 라인 변경
- `packages/core/src/render/lod.ts` 의 `lodFromScreenCoverage` 본체 — 0 라인 변경 (LOD 입력만 effective radius 로 변경, 계산식은 무수정)
- `packages/core/src/render/lod-body-thresholds.ts` — 0 라인 변경
- 다른 body (mercury / venus / ... ) — R2+ 범위
- `body.radius` 실측 데이터 (`solar-system.json`) — 절대 변경 금지
