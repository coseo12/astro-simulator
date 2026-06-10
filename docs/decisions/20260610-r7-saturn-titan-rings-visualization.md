# ADR: R7 토성 + 고리 + 타이탄 시각화 — 거성 예외 2번째 인스턴스 (saturn=jupiter 동일 scale 48) + ring × bodyScale 결합 (코어 인프라 1회 확장) + titan 단일 satellite

- **상태**: **Accepted (cross-validate 2026-06-10 agy outcome=applied)** — §교차검증 반영 사항 통합 완료 (tilt 위험 실측 해소 + z-fighting 구현 DoD 추가 + titan frame 명시 의무)
- **날짜**: 2026-06-10
- **결정자**: architect (R7 PM 합의 라운드 완료 — Q1=A / Q2=거성 예외 답습 / Q3=고리 실비율+prominent / Q4=titan 신규. 메인 오케스트레이터가 사용자와 합의 2026-06-10)
- **관련**: [#641](https://github.com/coseo12/astro-simulator/issues/641) (R7 본 스프린트), [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) (R6 SSoT — 거성 예외 첫 인스턴스 + §후속 R-Phase 인계 의무 + Amendment 1 guard 이원화 + Amendment 2 galilean=100), [`20260606-627-satellite-orbit-structure-forensic.md`](20260606-627-satellite-orbit-structure-forensic.md) (satellite 궤도선 moon 패턴 일반화 — R7 자동 확장), [`20260609-622-orbit-scale-gap-no-op.md`](20260609-622-orbit-scale-gap-no-op.md) (산식 A/B 측정-정의 분리 — 설계는 산식 A), [`20260420-p9-galilean-laplace-rings.md`](20260420-p9-galilean-laplace-rings.md) (ring 3층 densityProfile 인프라 — P10 토성 재사용 전제 명시), [`20260604-613-r-phase-metadata-ssot.md`](20260604-613-r-phase-metadata-ssot.md) (CURRENT_R_PHASE 1줄 자동 전파), [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541 의무 체크리스트 4항목)
- **교훈 적용**:
  - "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21) — ring shader/loader 스키마 (P9 #254) 가 "P10 토성 재사용 전제" 로 이미 박제되어 있음을 재발견. saturn.rings 는 jupiter.rings 동일 스키마 데이터만 추가)
  - "신규 데이터 ≠ 신규 코드" — body 진입 축은 데이터+상수 라인만. 단 **ring × bodyScale 결합은 인프라 1회 확장** (코어 코드 신규 — §축 2a 에서 정직 박제, R6 의 "R7 ~5 라인" 예측 정정)
  - "이슈 전제 코드 전수 확인" (#624 NO-OP 교훈 — ring 렌더 경로를 grep/실측: `solar-system-scene.ts:447~464` ring disc 가 **bodyScale 미결합** 임을 구현 전 확정. "있을 것" 가정 금지)
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — titan scale 은 R6 galilean 300→200→100 D-T2 2차 iteration 전례를 전제로 100 시작 + iteration 합의 경로 사전 박제)
  - "수치 DoD 미달 시 측정 방법 검증 우선" (volt [#32](https://github.com/coseo12/volt/issues/32) — px-ratio 정책 식 ≠ guard 실측 이원화, R6 Amendment 1 선례 답습)

---

## 현재 유효 결정 요약 (Living ADR Executive Summary)

> **PM 정책 결정 확정 (2026-06-10)**: Q1=A (saturn + 고리 + titan 3요소 동시 진입, enceladus 등 추가 위성 R8+ 보류) / Q2=거성 예외 답습 (saturn = Q2=B 거성 예외 **2번째 인스턴스**, jupiter 대비 비례 산출) / Q3=고리 실비율 (saturn 반경 ~2.3배) + prominent 강조 (jupiter faint 대조) / Q4=titan 신규 데이터 + galilean(100) scale 패턴 답습.

### 핵심 박제값 표

| 항목                                                                           | 박제값                                                                 | 위치                                                                     | 비고                                                                                                                                                                                             |
| ------------------------------------------------------------------------------ | ---------------------------------------------------------------------- | ------------------------------------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| `BODY_SCALE.saturn`                                                            | **48**                                                                 | `apps/web/src/constants/body-scale.ts`                                   | §축 1 — **jupiter 동일값** (R5 mars=earth=800 선례 패턴). saturn/jupiter mesh 비 0.843 = 사실 radius 비 정확 보존. sun 대비 px 비 8.32% (식), mesh 20.5 px                                       |
| `BODY_SCALE.titan`                                                             | **100**                                                                | `apps/web/src/constants/body-scale.ts`                                   | §축 3 — galilean=100 (R6 Amendment 2 최종값) 답습. titan/saturn 비 0.089 (moon/earth 0.068 근접). mesh 1.82 px → 4px fallback billboard 의존                                                     |
| `solar-system.json` titan body                                                 | 신규 (§축 3 데이터 표)                                                 | `packages/shared/data/solar-system.json`                                 | mass 1.345e23 / radius 2.575e6 m / a=8.1677e-3 AU (1,221,870 km) / parentId=saturn / introducedInRPhase=7 / showInShortcutBar=false. NASA Fact Sheet + dev 단계 JPL Horizons 각도 요소 쿼리 의무 |
| `solar-system.json` saturn.rings                                               | 신규 5층 (D/C/B/A/F — §축 2 데이터 표)                                 | `packages/shared/data/solar-system.json`                                 | jupiter.rings 동일 스키마 (`innerRadiusKm/outerRadiusKm/densityProfile`). Cassini Division 은 B-A 층간 gap 으로 자연 표현. F ring outer 140,180 km = saturn 반경 **2.326배** (PM "~2.3배" 정합)  |
| **ring × bodyScale 결합**                                                      | host `getBodyScale(body.id)` 를 ring 반경에 곱 (rendering 시점)        | `packages/core/src/scene/solar-system-scene.ts` (ring 생성부)            | §축 2a — **R7 유일 코어 인프라 확장**. 미결합 시 ring 실반경 1.4e8 m ≪ saturn mesh 반경 2.89e9 m (×48) → 고리가 mesh 안에 완전히 묻힘 (코드 전수 확인으로 실측 확정)                             |
| ring layer `colorHint` (스키마 optional 확장)                                  | 층별 hex (§축 2 데이터 표)                                             | `solar-system-loader.ts` `RingLayerRawSchema` + scene `layerColors` 전달 | §축 2b — body `colorHint` 패턴 정합. jupiter.rings 는 미지정 → DEFAULT `#887766` 보존 (무회귀)                                                                                                   |
| body-level `ringAlphaHint` (스키마 optional 확장)                              | saturn **0.9** / jupiter **0.15**                                      | `solar-system-loader.ts` + scene `ringAlpha` 전달                        | §축 2c — prominent vs faint 대조 (PM Q3). 미지정 기본 0.6 보존                                                                                                                                   |
| `SATURN_SATELLITES_ORBIT_VISUAL_SCALE` + `ORBIT_VISUAL_SCALE_BY_PARENT.saturn` | **10**                                                                 | `packages/core/src/scene/orbit-visual-scale.ts`                          | §축 4 — **binding constraint = ring outer (F ring) — parent mesh 아님 (R7 신규 유형)**. titan 분리 마진 산식 A **1.75x** (R4 moon 1.78x 근접)                                                    |
| `PX_RATIO_THRESHOLDS.saturn`                                                   | **정책 식 8.32% / guard 실측 보정 전제 (예상 ~13.1%, 임계 실측×1.05)** | `apps/web/scripts/r1-ui-regression-guard.mjs`                            | §축 1 — R6 Amendment 1 이원화 선례. perspective foreshortening 9.54 AU 거리라 jupiter (×1.57) 이상 편차 예상. ⚠️ 퍼센트 정수 표기                                                                |
| `PX_RATIO_THRESHOLDS.titan`                                                    | **N/A** (4px fallback 의존)                                            | r1-guard 미박제                                                          | §축 3 — R5 phobos/deimos / R6 galilean §결정 6 답습                                                                                                                                              |
| `CURRENT_R_PHASE`                                                              | **6 → 7** (1줄)                                                        | `packages/core/src/scene/r-phase-allowlist.ts`                           | #613 자동 생성 — allowlist `[...R6, saturn, titan]` 자동 확장                                                                                                                                    |
| saturn `showInShortcutBar`                                                     | **false → true** (데이터 1값)                                          | `solar-system.json`                                                      | §축 5 — jupiter=true 정합 (거성 본체는 bar 노출). #617 가드가 FOCUS_BUTTONS 동기화 강제                                                                                                          |
| `FOCUS_BUTTONS`                                                                | **saturn 1줄 추가** (jupiter 다음, neptune 앞 — 거리순)                | `apps/web/src/components/layout/focus-quick-buttons.tsx`                 | §축 5 — #617 정적 매칭 가드 정합 의무. 모바일 11버튼은 기존 `overflow-x-auto` 가 흡수                                                                                                            |
| `FOCUS_BODIES` (browser-verify-378-focus.mjs)                                  | `[...R6, saturn, titan]` 수동 동기화                                   | `browser-verify-378-focus.mjs`                                           | #598 정적 매칭 가드 차단 회피                                                                                                                                                                    |

### 핵심 결정 요약

1. **saturnScale=48 (jupiter 동일값)** (§축 1): PM "jupiter 대비 비례 산출" 의 가장 단순한 해석 — **동일 scale 적용 시 mesh 비율 = 사실 radius 비율 (0.843) 자동 보존**. R5 mars=earth=800 선례와 동형. 거성 예외 2번째 인스턴스 (Q2=B 임계 ≤ 8.5%, 식 8.32%)
2. **ring × bodyScale 결합 — 코어 인프라 1회 확장** (§축 2a): ring disc 반경이 bodyScale 미결합 (실측 확정) → saturn 고리가 mesh 안에 묻힘. host bodyScale 을 ring 반경에 곱해 **ring/body 비율 = 사실 비율 (2.326배)** 보존. 부수효과: jupiter ring 도 가시화 → `ringAlphaHint` (jupiter 0.15 faint) 로 PM "faint 대조" 동시 충족
3. **saturn.rings 5층 (D/C/B/A/F)** (§축 2): NASA/JPL 실측 반경. Cassini Division 은 B(~117,580 km)-A(122,170 km~) **층간 gap 으로 자연 표현** (별도 층 불필요 — 스키마가 비연속 층 허용). Encke gap 은 A ring densityProfile 내부 dip
4. **titanScale=100 + titan 데이터 신규** (§축 3): galilean 최종값 (R6 Amendment 2) 직접 답습 — R6 의 300→200→100 D-T2 2차 iteration 을 건너뛰고 수렴값에서 시작. titan/saturn 비 0.089 (ganymede/jupiter 0.077 동급)
5. **SATURN_SATELLITES_ORBIT_VISUAL_SCALE=10** (§축 4): **binding constraint 가 parent mesh 가 아닌 ring outer mesh (R4/R5/R6 과 다른 신규 유형)** — ring 미고려 시 ×4 로 충분했으나 F ring outer (6.73e9 m, ×48) 가 titan 궤도 (1.22e9 m) 를 5.5배 능가. ×10 에서 산식 A 마진 1.75x
6. **saturn shortcut bar 진입 (showInShortcutBar true + FOCUS_BUTTONS 1줄)** (§축 5): jupiter (거성 본체 true) 정합. titan 은 false (galilean 패턴 — URL/명령 진입)
7. **CURRENT_R_PHASE=7 (1줄)**: #613 자동 생성 3번째 실전

### 비-범위 (R7)

- enceladus / rhea / iapetus 등 saturn 추가 위성 ❌ (R8+ — PM Q1)
- E ring (180,000~480,000 km, 극히 faint·범위 8배) ❌ — PM "~2.3배" 합의가 F ring 까지로 확정
- **saturn 자전축 기울기 26.73° (ring tilt)** ❌ — 현 ring 인프라가 공전면 (XZ, `disc.rotation.x=π/2`) 고정. tilt 는 후속 분리 (§위험 #4)
- ring shadow (본체→고리 / 고리→본체 그림자) ❌
- titan 대기 헤이즈 visual ❌ (단색 colorHint 근사)
- uranus / R8+ body 진입 ❌
- 실측 데이터 변경 ❌ — saturn 기존 필드 (radius/mass/orbit) 무수정. 신규 추가만 (titan body / saturn.rings / showInShortcutBar / ringAlphaHint)
- LOD 시스템 변경 ❌ (R4 Amendment 3 보존)
- jupiter.rings densityProfile 수정 ❌ — P9 박제 보존. faint 대조는 `ringAlphaHint` (rendering hint) 로만 (§축 2c)

---

## 배경

### Roadmap v3 §R7 진입 조건 + R6 인계 이행

[`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) — R7 = R6 + 토성 + 고리 + 타이탄. R6 ADR §후속 R-Phase 인계 의무 3건을 본 ADR 이 이행:

1. **거성 예외 답습** — saturn Q2=B 임계 사실 비율 정합 상향 (§축 1). 단 R6 인계의 "saturn sun 의 8.37%" 는 **mean radius (5.8232e7) 기준 — 현 데이터 SSoT 는 equatorial 6.0268e7 (P10-B-2 보정) 이므로 8.66% 로 정정** 박제
2. **산식 A/B 정의 분리 의무 적용** — §축 4 는 산식 A (설계 real-meter) 로만 산출. 산식 B (runtime scene-unit) 와 직접 비교 금지 (#622 NO-OP SSoT — `orbit-visual-scale.ts` WARNING 주석)
3. **satellite N≥5 단일 룩업 한계** — R7 은 titan 단일 satellite 라 미발동. R8+ 인계 유지

### 현재 baseline 실측 (2026-06-10 develop tip = `6572325`)

- `BODY_SCALE` (R6 Amendment 2 후): sun 50 / mercury 700 / venus 800 / earth 800 / moon 200 / mars 800 / phobos·deimos 5000 / jupiter 48 / **galilean 4개 = 100**
- `ORBIT_VISUAL_SCALE_BY_PARENT`: earth 30 / mars 500 / jupiter 16
- `CURRENT_R_PHASE = 6`
- `solar-system.json` 실측: **saturn 기존재** (radius 6.0268e7 equatorial, introducedInRPhase=7, **showInShortcutBar=false**, rings 없음). **titan 부재 — 유일한 신규 body**
- `FOCUS_BUTTONS` 8 id (sun~jupiter + neptune) — **saturn 부재**
- ring 인프라 (P9 #254): `RingLayerRawSchema` = `{id, innerRadiusKm, outerRadiusKm, densityProfile[[r,d]≥2]}` (loader km→m 환산, `MAX_DENSITY_POINTS=16`). loader 주석에 "P10 토성(카시니 간극 등) 재사용 전제 — 층 수·배열 길이는 행성별로 유연" 박제 기존재
- **ring 렌더 경로 실측 (구현 전 코드 전수 확인 — #624 교훈)**: `solar-system-scene.ts:1659` body mesh `diameter = radius × 2 × renderScaleForTier × bodyScale` (생성 시점 bake) ↔ `ring-shader.ts:272` ring disc `radiusScene = outerRadius × sceneUnitPerMeter` — **bodyScale 미결합**. host.scaling 은 tier 전환 배수만 (bodyScale 은 scaling 에 없음 → 자식 ring 에 미전파)

### 데이터 사실 비율 (NASA Planetary Fact Sheet / JPL)

| 항목                     | 값                         | 비고                                                                                |
| ------------------------ | -------------------------- | ----------------------------------------------------------------------------------- |
| saturn radius            | 6.0268e7 m (equatorial)    | sun 의 **8.663%** / jupiter 의 **0.843배** / earth 의 9.45배                        |
| titan radius             | 2.575e6 m                  | moon 의 1.482배 / ganymede (2.6341e6) 의 0.978배 — ganymede-class (태양계 2위 위성) |
| titan orbit a            | 1.22187e9 m = 8.1677e-3 AU | callisto (1.8826e9 m) 의 0.65배                                                     |
| 주요 고리 (A ring outer) | 136,780 km                 | saturn 반경의 2.269배                                                               |
| F ring outer             | 140,180 km                 | saturn 반경의 **2.326배** — PM "~2.3배" 정합 상한                                   |

### 산출식 (R1~R6 동일)

```
px_diameter (1280×720) = body.radius × scale × k,  k = 7.0806e-9
sunPxRatio(body) = (body.radius × scale) / 3.4785e10
saturn: 6.0268e7 × 48 → pxDiameter 20.48 px / sunPxRatio 8.316%
titan:  2.575e6 × 100 → pxDiameter 1.82 px (sub-4px → billboard fallback)
```

---

## 축별 설계 (후보 비교)

### 축 1 — `BODY_SCALE.saturn` (거성 예외 2번째 인스턴스, jupiter 대비 비례 산출)

PM Q2 합의: R6 jupiter(48) 거성 예외 답습 + "jupiter 대비 비례 산출". 해석 후보:

| 후보                                  | scale  | saturn px (1280×720) | sunPxRatio | saturn/jupiter mesh 비 (사실 0.843)                          | 평가                                                                                     |
| ------------------------------------- | ------ | -------------------- | ---------- | ------------------------------------------------------------ | ---------------------------------------------------------------------------------------- |
| A. px 동급 환산 (jupiter 24.3px 맞춤) | 57     | 24.3 px              | 9.88%      | 1.000 — **사실 비율 파괴** (saturn=jupiter 동일 크기로 보임) | 기각 — "비례 산출" 의도 위배                                                             |
| **B. jupiter 동일 scale**             | **48** | **20.48 px**         | **8.32%**  | **0.843 — 사실 radius 비 정확 보존**                         | **선택 — R5 mars=earth=800 선례와 동형 (동일 scale = 비율 자동 보존)**                   |
| C. 사실 비율 상한 경계                | 50     | 21.34 px             | 8.66%      | 0.878                                                        | 사실 비율 정확 일치하나 임계 margin 0 (경계) + jupiter 와 scale 상이 (mental model 복잡) |
| D. 보수 하향                          | 44     | 18.77 px             | 7.62%      | 0.773                                                        | saturn 과소 — mars (11.1px) 와 격차 줄어 거성 직관 약화                                  |

#### 선택 — **saturnScale = 48 (후보 B, jupiter 동일값)**

근거:

1. **사실 비율 자동 보존** — 동일 scale 적용 시 saturn/jupiter mesh 비 = radius 비 (0.843) 정확 일치. R5 가 mars 를 earth 와 동일 800 으로 두어 mars/earth 53.2% 를 정확 보존한 선례와 동형 패턴
2. **거성 그룹 mental model** — "가스 거성 = scale 48" 단일값 (R8+ uranus/neptune 검토 시 출발점). inner planet (700~800) / 거성 (48) / 위성 (100~5000) 3그룹 가독성
3. **Q2=B 거성 예외 임계 ≤ 8.5%** — 식 8.32% margin 0.18% (±2% 안). 사실 비율 8.663% 대비 0.35%p 아래 (jupiter 선례: 사실 10.276% ↔ 식 9.87% 동일 방향)
4. **mesh visible 20.5 px** — 4px fallback 무의존 + mid LOD 임계 50px 안전. 시각 서열 earth(36.1) > jupiter(24.3) > saturn(20.5) > mars(11.1) — 거성 직관 유지 (R6 Amendment 1 실측 기준으로는 jupiter 38px → saturn 예상 ~32px, 서열 동일)

#### r1-guard 임계 — 정책 식 ≠ guard 실측 이원화 (R6 Amendment 1 선례 사전 박제)

- **정책 식값**: 8.32% (wsRadius 비 — perspective foreshortening 무시)
- **예상 실측**: jupiter 가 5.2 AU 에서 ×1.573 편차 (식 9.87% → 실측 15.52%). saturn 은 9.54 AU 로 더 멀어 **편차 ≥ ×1.57 예상 → 실측 ~13.1%+ 예상**
- **guard 박제 절차**: 구현(qa D-T2) 단계 `--measure-px-ratio` 실측 후 **실측 × 1.05** 로 `PX_RATIO_THRESHOLDS.saturn` 박제 (earth 17 / venus 14.26 / jupiter 16.3 동일 패턴). 식값 8.32 를 guard 에 직박제 금지 (영구 FAIL 함정). ⚠️ 퍼센트 단위 정수 표기
- titan 은 N/A (4px fallback 의존 — R5 §결정 6 / R6 §축 6 답습)

---

### 축 2 — saturn.rings 데이터 + ring × bodyScale 결합

#### 축 2a — ring × bodyScale 결합 (R7 유일 코어 인프라 확장 — 결합 간과 방지 핵심)

**문제 실측** (코드 전수 확인 — #624 교훈): body mesh 는 생성 시점 `× bodyScale` bake (`solar-system-scene.ts:1659`), ring disc 는 `outerRadius × renderScale` 만 (`ring-shader.ts:272`). host.scaling 은 tier 전환 배수 전용이라 bodyScale 이 자식 ring 에 전파되지 않음.

```
saturn mesh radius (×48) = 6.0268e7 × 48 = 2.8929e9 m
F ring outer (실반경)    = 1.4018e8 m  ← mesh 반경의 4.8% — 고리가 mesh 안에 완전히 묻힘
```

| 후보                                                        | 방안                                                                    | 평가                                                                                                                                         |
| ----------------------------------------------------------- | ----------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. ring 반경 × host bodyScale (rendering 시점, generic)** | scene ring 생성부에서 `innerRadius/outerRadius × getBodyScale(body.id)` | **선택 — ring/body 비율 = 사실 비율 (2.326배) 자동 보존. 데이터 SSoT 무수정 (Visual Fidelity §1). 코드 ~2줄. data-driven (행성 특수분기 0)** |
| B. RING_VISUAL_SCALE 별도 상수 룩업                         | saturn 전용 배수 신설                                                   | bodyScale 변경 시 이중 갱신 필요 (drift 생성원 — 숨은 상수 변형 volt #69). 기각                                                              |
| C. rings 데이터에 scaled 반경 직박제                        | innerRadiusKm 을 mesh 비율로 환산해 기록                                | **데이터 SSoT 파괴** (실측 km 가 아니게 됨) — Visual Fidelity §1 위반. 기각                                                                  |

**부수효과 — jupiter ring 가시화**: 결합은 generic 이므로 jupiter.rings (outer 226,000 km = jupiter 반경 3.16배) 도 가시화된다. R6 비-범위 "jupiter 고리 ❌" 가 결합으로 해제됨 — **Behavior Change 로 명시 박제** + §축 2c `ringAlphaHint` 로 faint 처리 (PM "jupiter faint ring 과 대조" 정합). D-T2 에서 jupiter ring 가시화 회귀 여부 관찰 의무 (§위험 #2).

#### 축 2b — saturn.rings 5층 데이터 (NASA/JPL 실측 반경)

층 구성 후보: (i) 6층 (Cassini Division 을 density~0 층으로 명시) vs **(ii) 5층 — Cassini 는 B-A 층간 gap 으로 자연 표현 (선택)**. 스키마가 비연속 층을 허용 (loader 검증은 층별 독립) 하므로 데이터 생략이 가장 단순 + 시각적으로 동일. Encke gap (A ring 내부 133,589 km) 은 A ring densityProfile dip 으로 표현 — 정규화 위치 (133589−122170)/14610 = **0.782**.

박제 데이터 (jupiter.rings 동일 스키마 + colorHint optional 확장):

| id  | innerRadiusKm | outerRadiusKm | densityProfile                                            | colorHint | 근거                              |
| --- | ------------- | ------------- | --------------------------------------------------------- | --------- | --------------------------------- |
| d   | 66,900        | 74,510        | `[[0,0.02],[1,0.06]]`                                     | `#5C5147` | very faint dust (Voyager/Cassini) |
| c   | 74,658        | 92,000        | `[[0,0.10],[1,0.25]]`                                     | `#8A7A66` | translucent (Crepe ring)          |
| b   | 92,000        | 117,580       | `[[0,0.85],[0.5,1.0],[1,0.9]]`                            | `#D8C9A8` | 최대 광학 깊이 — 가장 밝음        |
| a   | 122,170       | 136,780       | `[[0,0.7],[0.75,0.65],[0.782,0.15],[0.81,0.65],[1,0.55]]` | `#C9B894` | Encke gap dip @0.782              |
| f   | 140,180       | 140,680       | `[[0,0.3],[0.5,0.7],[1,0.3]]`                             | `#B0A48E` | narrow shepherd ring (~500 km 폭) |

- 반경 출처: NASA Saturn Fact Sheet / JPL Ring-Moon Systems Node (구현 단계 dataSource 필드에 동일 명시)
- B(117,580)–A(122,170) 사이 4,590 km 공백 = **Cassini Division** 자연 렌더
- densityProfile 5점 (A ring) ≤ MAX_DENSITY_POINTS 16 — shader 무수정
- **colorHint 스키마 확장** (optional): `RingLayerRawSchema` 에 body colorHint 동형 필드 추가 + loader 매핑 + scene 에서 `layerColors` 전달 (기존 `CreateRingShaderOptions.layerColors` 옵션 기존재 — 전달부만 신규). jupiter.rings 미지정 → DEFAULT `#887766` 폴백 보존 (무회귀)

#### 축 2c — prominent vs faint 대조: body-level `ringAlphaHint` (optional)

| 후보                                               | 방안                                               | 평가                                                                                                                                                           |
| -------------------------------------------------- | -------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. jupiter densityProfile 하향                     | P9 박제 데이터 수정                                | P9 ADR 결정 변경 + densityProfile 은 "상대 밀도 분포" 데이터 성격 — 전역 밝기와 책임 혼합. 기각                                                                |
| **B. body-level `ringAlphaHint` (rendering hint)** | saturn **0.9** / jupiter **0.15**, 미지정 기본 0.6 | **선택 — colorHint 패턴 정합 (데이터 SSoT 직교 rendering hint). 기존 `CreateRingShaderOptions.ringAlpha` 옵션 기존재 — 전달부만 신규. P9 densityProfile 보존** |
| C. saturn 만 결합 (jupiter gating)                 | 행성 특수분기                                      | data-driven 위배 + 분기 코드 = drift 생성원. 기각                                                                                                              |

---

### 축 3 — titan 데이터 신규 + `BODY_SCALE.titan`

#### titan body 데이터 (solar-system.json 신규 — R7 유일 신규 body)

| 필드                                                        | 값                                        | 근거                                                                                                                             |
| ----------------------------------------------------------- | ----------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------- |
| id / kind                                                   | `titan` / `moon`                          | —                                                                                                                                |
| nameKo / nameEn                                             | 타이탄 / Titan                            | —                                                                                                                                |
| mass                                                        | 1.345e23 kg                               | NASA Titan Fact Sheet (PM Q4 박제)                                                                                               |
| radius                                                      | 2.575e6 m                                 | NASA (2,575 km)                                                                                                                  |
| parentId                                                    | `saturn`                                  | —                                                                                                                                |
| introducedInRPhase                                          | **7**                                     | R7 진입 — #613 allowlist 자동 포함                                                                                               |
| showInShortcutBar                                           | **false**                                 | galilean 패턴 (위성은 bar 미등록 — URL `?focus=titan` / command 진입)                                                            |
| colorHint                                                   | `#E8A33D` (observed)                      | 대기 헤이즈 오렌지 (Cassini 관측 근사)                                                                                           |
| orbit.semiMajorAxisAU                                       | 8.1677e-3 (= 1,221,870 km)                | NASA Fact Sheet. PM Q4 "~0.008168" 정합                                                                                          |
| orbit.eccentricity                                          | 0.0288                                    | NASA Fact Sheet                                                                                                                  |
| orbit 각도 요소 (inclination/node/perihelion/meanLongitude) | **dev 단계 JPL Horizons API 쿼리로 박제** | P10-D #261 galilean 선례 — Saturn-centric J2000 **ecliptic frame 통일** 의무 (Laplace plane 금지). dataSource 에 쿼리 epoch 명시 |

#### `BODY_SCALE.titan` 후보 비교

| 후보                                      | scale   | titan px    | titan/saturn mesh 비 (사실 4.27%) | baseline 대조                                  | 평가                                                                                              |
| ----------------------------------------- | ------- | ----------- | --------------------------------- | ---------------------------------------------- | ------------------------------------------------------------------------------------------------- |
| A. 300 (R6 §결정 2 원안)                  | 300     | 5.47 px     | 0.267                             | —                                              | R6 Amendment 2 에서 사용자 D-T2 2차 기각된 출발값 — 동일 실패 재현 위험. 기각                     |
| **B. 100 (galilean 최종값 답습 — PM Q4)** | **100** | **1.82 px** | **0.0890**                        | moon/earth 0.068 / ganymede/jupiter 0.077 동급 | **선택 — R6 2차 iteration 수렴값에서 시작. titan 이 ganymede-class (0.978배) 라 동일 scale 정합** |
| C. 200 (중간값)                           | 200     | 3.64 px     | 0.178                             | R6 1차 iteration 에서 "아직 큼" 기각된 비율대  | 기각                                                                                              |

- titan mesh 1.82 px → **4px fallback billboard 전면 의존** (galilean 4개와 동일 — LOD Phase 2 #391 흡수). Q2=B 임계 N/A
- D-T2 iteration 경로 사전 박제: 사용자 "작다/크다" 보고 시 100 → 150 / 75 단계 조정 (dev 임시변경 → HMR → 합의값 일괄 박제 — R6 학습 3 패턴)

---

### 축 4 — `SATURN_SATELLITES_ORBIT_VISUAL_SCALE` (binding = ring outer — R7 신규 유형)

산식 A (설계 임계, real-meter — #622 NO-OP SSoT: 산식 B 와 직접 비교 금지):

```
separation_margin = visual_orbit / (binding_outer + satellite_mesh) ≥ 1.5

[R4/R5/R6 과의 차이] binding_outer 가 parent mesh 가 아니라 ring outer mesh:
  saturn mesh radius (×48)        = 2.8929e9 m
  F ring outer mesh (×48, §축 2a) = 1.4018e8 × 48 = 6.7286e9 m   ← saturn mesh 의 2.326배 — binding
  titan mesh radius (×100)        = 2.575e8 m
  titan 실측 orbit                 = 1.22187e9 m  ← ring outer mesh 의 0.18배 (미적용 시 고리 안에 묻힘)
```

| visual_scale | titan 분리 마진 (vs ring outer + titan mesh = 6.9861e9 m) | vs saturn mesh 만 (참고) | 평가                                                                         |
| ------------ | --------------------------------------------------------- | ------------------------ | ---------------------------------------------------------------------------- |
| × 4          | **0.70x (fail — titan 이 고리 안)**                       | 1.55x                    | ring 미고려 시 통과로 오판하는 함정값 — 기각                                 |
| × 9          | 1.57x (경계 통과)                                         | 3.49x                    | 마진 +0.07 박빙                                                              |
| **× 10**     | **1.75x (통과 +0.25)**                                    | **3.88x**                | **선택 — R4 moon 1.78x 와 근접 정합 + 정수 단순**                            |
| × 12         | 2.10x                                                     | 4.66x                    | titan 이 saturn 계에서 과도 분리 (jupiter callisto 7.25x 전례의 과분리 위험) |

#### 선택 — **`SATURN_SATELLITES_ORBIT_VISUAL_SCALE = 10`** + `ORBIT_VISUAL_SCALE_BY_PARENT.saturn = 10`

근거:

1. **binding constraint = ring outer (신규 유형 명시 박제)** — R4(earth mesh)/R5(mars mesh)/R6(jupiter mesh) 는 모두 parent mesh 가 분모. R7 은 §축 2a 결합으로 ring 이 mesh 의 2.326배까지 확장되므로 **ring outer 가 분모**. R8+ uranus (ring 보유) 인계 SSoT
2. 마진 1.75x — R4 moon 1.78x 근접 (검증된 단일 satellite 마진 답습)
3. 명명 `SATURN_SATELLITES_ORBIT_VISUAL_SCALE` — R5/R6 컨벤션 답습 (titan 단일이어도 R8+ enceladus 등 확장 전제 복수형)
4. 궤도선: #627 옵션 A (moon 패턴 Map 일반화) 가 parent 별 LineSystem `.scaling` 을 자동 처리 — **코드 변경 0 예측** (titan 궤도선이 saturn 추적 + ×10 적용 자동)

> **검증 metric (산식 B) 주의**: runtime `titan.position.length() / saturn.boundingSphere.radiusWorld` 는 산식 A 와 측정-정의가 다름 (#622 — scale 합성 차이, 버그 아님). D-T2 는 시각 분리 (titan 이 고리 바깥 명확) 로 검증, 산식 B 수치를 산식 A 와 직접 비교 금지.

---

### 축 5 — Shortcut Bar (saturn showInShortcutBar false → true)

R6 ADR §축 8 인계 "saturn 도 showInShortcutBar 데이터 확인 필요" 이행 — 실측: saturn=**false** (jupiter=true, neptune=true 와 비정합).

| 후보                                             | 방안                                | 평가                                                                                                                                                                                                                  |
| ------------------------------------------------ | ----------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. saturn true 전환 + FOCUS_BUTTONS 1줄 추가** | jupiter 정합 (거성 본체 = bar 노출) | **선택 — #624 NO-OP 에서 박제된 "galilean URL-only discoverability gap (accepted tradeoff)" 은 위성 한정. 본체 행성이 bar 부재면 R7 핵심 showcase (고리) 진입 경로가 URL 뿐 — 사용자 visible 원칙 (roadmap v3) 위배** |
| B. false 유지 (URL-only)                         | 데이터 무변경                       | R7 의 "사용자가 실제로 보이는 body" DoD 와 충돌. 기각                                                                                                                                                                 |

- **#617 가드 강제 동기화**: `r-phase-allowlist.test.ts` 가 `FOCUS_BUTTONS` ids == `showInShortcutBar` 파생 배열 (json 순서) 일치를 검사 — true 전환 시 `focus-quick-buttons.tsx` 에 `{ id: 'saturn', label: '토성' }` 을 **jupiter 다음·neptune 앞** (json 거리순) 에 추가 의무 + 테스트 expected (`shortcutBodies`/`shortcutEnabled`) 갱신
- **모바일 너비**: 11버튼 (body 9 + reset + 탐색) ≈ 392px > 375px — 단 bar 컨테이너에 `overflow-x-auto whitespace-nowrap` **기존재** (실측 `focus-quick-buttons.tsx:62`) → horizontal scroll graceful degradation. 신규 코드 0. R5 인계 "overflow 시 2단 grid" 는 불발동 (스크롤 수용) — D-T2 모바일 확인 의무 (§위험 #5)
- titan = false (galilean 패턴 답습)

---

## 점유율 산출 + Visual Fidelity §의무 체크리스트 4항목 (#541)

### 모바일 누적 차단율 (375×667, R6 Amendment 2 후 baseline ≈ 8.95%)

| 항목                                        | 산출                                                                                                    | 기여                                                       |
| ------------------------------------------- | ------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------- |
| saturn disk                                 | mesh 직경 ≈ 20.48 × 0.927 (모바일 k 비) ≈ 19.0 px → area π×9.49² ≈ 283 px²                              | **+0.113%**                                                |
| saturn rings (환형, alpha 미가중 보수 상한) | outer 반경 px = 9.49 × 2.326 ≈ 22.1 / inner (D ring) = 9.49 × 1.110 ≈ 10.5 → π(22.1²−10.5²) ≈ 1,186 px² | **+0.47% (상한 — alpha 0.9 × density 가중 시 실효 ~0.3%)** |
| titan                                       | 1.82 px → billboard 4px ≈ 12.6 px²                                                                      | +0.005%                                                    |
| **누적**                                    | 8.95 + 0.113 + 0.47 + 0.005                                                                             | **≈ 9.54% (DoD 임계 25% margin 15.46%)**                   |

### Visual Fidelity §의무 체크리스트 (4항목)

- [x] **데이터 SSoT 보존** — saturn 기존 필드 (radius/mass/orbit) 무수정. titan/saturn.rings 는 NASA/JPL **실측값 신규 추가** (왜곡값 직박제 0). mesh/ring/궤도 왜곡은 전부 rendering-only 상수 (`body-scale.ts` / ring × bodyScale 결합 / `orbit-visual-scale.ts`). `ringAlphaHint`/`colorHint` 는 colorHint 선례와 동일한 rendering hint (실측과 직교)
- [x] **rendering 시점 분리** — physics 엔진 (Rust+wasm) 이 BODY_SCALE / ring 결합 / ORBIT_VISUAL_SCALE 무의존 (developer 검증 의무). ring 결합은 scene 생성부 한정
- [x] **UI overlay 실측값 표기** — CelestialInfoPanel saturn (60,268 km) / titan (2,575 km) 실측 radius 표기. mesh 왜곡값 표기 금지
- [x] **baseline 박제** — 핵심 박제값 표 + 산출 (saturn 20.48 px / 8.32% / ring outer 2.326배 / titan 1.82 px / orbit ×10 마진 1.75x / 모바일 누적 9.54%)

---

## Concrete Prediction (R6 "R7 ~5 라인" 예측 정정 + R7 예측 박제)

R6 ADR §Concrete Prediction 은 "R7 (saturn/titan): BODY_SCALE 2 + CURRENT_R_PHASE 1 + ORBIT 2 = **~5 라인**" 으로 예측했으나, **ring 축을 모르는 예측**이었다 (R6 시점엔 R7 고리 범위 미확정). 정직 정정:

| 항목                                             | R6 예측  | R7 본 ADR 예측 | 사유                                                                                                                                                                |
| ------------------------------------------------ | -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BODY_SCALE (saturn + titan)                      | 2        | **2**          | 동일                                                                                                                                                                |
| CURRENT_R_PHASE 6→7                              | 1        | **1**          | #613 자동 생성 3번째 실전                                                                                                                                           |
| ORBIT_VISUAL_SCALE (상수 + 룩업)                 | 2        | **2**          | 동일                                                                                                                                                                |
| FOCUS_BUTTONS saturn                             | (미예측) | **1**          | §축 5 showInShortcutBar true 전환 동반                                                                                                                              |
| **ring × bodyScale 결합**                        | (미예측) | **~2**         | §축 2a — scene ring 생성부 반경 × getBodyScale                                                                                                                      |
| **스키마 확장 (ring colorHint + ringAlphaHint)** | (미예측) | **~8**         | loader zod 2필드 + LoadedRingLayer/Body 타입 + 매핑 + scene layerColors/ringAlpha 전달                                                                              |
| **코어 코드 합계**                               | ~5       | **≤ 16 라인**  | ring 인프라 1회 확장 (+11). body 진입 축 자체는 6 라인 — "신규 데이터 ≠ 신규 코드" 는 **body 진입 축에서 유지**, ring 축은 P9 인프라의 bodyScale 결합 누락 1회 보수 |

별도 카운트 (데이터/가드/테스트): titan body json ~25줄 + saturn.rings json ~60줄 + showInShortcutBar 1값 + jupiter ringAlphaHint 1값 / FOCUS_BODIES 2 id / r1-guard saturn 1줄 (실측 후) / body-scale.test 2 + r-phase-allowlist.test expected 갱신 / CHANGELOG.

**예측 검증 의무 (dev 단계)**: `git diff --stat` 으로 코어 코드 변경이 ≤ 16 라인인지 실측 재현. 초과 시 ring 추상화 리팩토링 신호로 회고 박제. **R8 prediction**: uranus (ring 보유, ring 인프라 R7 에서 완비) = BODY_SCALE 1 + CURRENT_R_PHASE 1 + (위성 미정) — **ring 축 코드 0 예측** (R7 결합이 generic 이므로 uranus.rings 는 데이터만. 이 예측 적중이 §축 2a 추상화 건강성의 구체 증거)

---

## DoD (수치 — 검증 가능 완료 기준)

1. **saturn mesh visible** — 1280×720 기준 pxDiameter 식 20.48 px (mid LOD 임계 50 px 미만, 4px fallback 무의존). 실측은 perspective 보정 (~32 px 예상) 허용
2. **saturn/jupiter 시각 비율 = 사실 비율** — mesh 비 0.843 ± 0.02 (동일 scale 48 자동 보존)
3. **고리 가시** — 기본 진입 + saturn focus 에서 ring 이 mesh 바깥 환형으로 명확 식별 (D-T2 실 Chrome). ring outer/saturn mesh 비 **2.326 ± 0.05** (사실 비율). Cassini Division (B-A gap) 시각 식별
4. **jupiter ring faint 대조** — jupiter focus 시 ring 이 saturn 대비 명확히 흐림 (ringAlphaHint 0.15 vs 0.9). jupiter D-T2 회귀 보고 0
5. **titan 가시 + 분리** — `?focus=titan` 진입 성공 + titan billboard 가 고리 바깥 (visual orbit ×10, 산식 A 마진 1.75x ≥ 1.5). titan 궤도선이 saturn 추적 (#627 일반화 — 태양 원점 오렌더 0)
6. **r1-guard PASS** — `PX_RATIO_THRESHOLDS.saturn` 실측 × 1.05 박제 후 3 viewport 결정적 PASS. 기존 body (sun~galilean) 무회귀
7. **단위 테스트 PASS** — r-phase-allowlist.test (#613/#617 매칭 saturn/titan 갱신) + body-scale.test + loader 스키마 (rings colorHint/ringAlphaHint optional 하위 호환 — jupiter 미지정 폴백) 포함 전체 green
8. **가드 동기화** — FOCUS_BODIES (#598) / RPHASE_EXPECTED_ENABLED (#617) / FOCUS_BUTTONS 정합 — CI `detect-and-test` green
9. **모바일** — 375×667 shortcut bar 11버튼 horizontal scroll 동작 (잘림 없이 접근 가능) + 누적 차단율 ≤ 25% (산출 9.54%)
10. **D-T2 실 Chrome GUI 수동 검증 ≥ 1회** (headless 만으로 종결 금지 — volt #77)

---

## 위험 / 미해결

### 위험 #1 — ring × bodyScale 결합의 jupiter 부수 가시화 (R6 비-범위 해제)

- generic 결합으로 jupiter ring (outer = jupiter mesh 의 3.16배) 이 R7 부터 보임. P9 densityProfile (main 0.8~1.0) 은 검증용 과장값이라 `ringAlphaHint=0.15` 없이는 prominent 하게 보일 위험
- 완화: ringAlphaHint 0.15 박제 + D-T2 jupiter focus 회귀 관찰. 그래도 과하면 0.15 → 0.08 하향 (Amendment). **Behavior Change 로 CHANGELOG 박제 의무**

### 위험 #2 — titanScale=100 D-T2 iteration (R6 galilean 전례)

- galilean 수렴값 100 에서 시작하나 saturn (20.5px) 은 jupiter (24.3px) 보다 작아 titan/saturn 비 0.089 가 "큼" 으로 보일 가능성 잔존
- 완화: dev 임시변경 → HMR → 사용자 합의값 일괄 박제 경로 (R6 학습 3). fallback 100 → 75

### 위험 #3 — ORBIT ×10 의 titan 궤도선 ↔ 고리 시각 간섭

- titan visual orbit (1.22e10 m) 이 ring outer (6.73e9 m) 의 1.82배 — 궤도선과 고리 외곽이 같은 화면 영역. 궤도선 색/고리 색 유사 시 혼동
- 완화: D-T2 관찰. 혼동 보고 시 ×10 → ×12 (마진 2.10x) Amendment

### 위험 #4 — ring tilt 부재 (비-범위 박제)

- 실제 saturn 고리는 자전축 26.73° 기울어짐. 현 인프라는 공전면 disc 고정 — top-down 근접 시 위화감 가능
- 완화: R7 비-범위 명시. D-T2 에서 사용자 요구 시 후속 이슈 분리 (ring 인프라 tilt 파라미터)

### 위험 #5 — shortcut bar 11버튼 모바일 스크롤 UX

- `overflow-x-auto` 가 잘림은 방지하나 스크롤 가능함을 사용자가 인지 못할 수 있음 (R5 인계 "2단 grid" 대안 잔존)
- 완화: D-T2 모바일 확인. 불편 보고 시 후속 이슈 (bar 재설계는 R7 비-범위)

### 위험 #6 — titan orbit 각도 요소 미확정 (dev 단계 JPL Horizons 쿼리 의무)

- 본 ADR 은 a/e 만 박제 (NASA Fact Sheet). inclination/node/perihelion/meanLongitude 는 dev 가 Horizons (Saturn-centric J2000 **ecliptic**) 쿼리로 채움 — galilean P10-D #261 frame 통일 선례. Laplace plane 값 혼입 금지
- 완화: dataSource 에 쿼리 epoch 명시 + reviewer 가 frame 검증

---

## 결과 / 재검토 조건 (Amendment 발동 트리거)

1. **#1 (jupiter ring 과시인)** — D-T2 "jupiter 고리가 saturn 급으로 보임" → ringAlphaHint 0.15 → 0.08
2. **#2 (titan 크기)** — D-T2 보고 → titanScale 100 → 75 (또는 150)
3. **#3 (궤도선-고리 간섭)** — ×10 → ×12
4. **#4 (guard 실측 편차)** — saturn 실측 px-ratio 가 예상 (~13.1%) 과 ±3%p 이상 괴리 → 측정 방법 검증 우선 (volt #32) 후 임계 박제
5. **#5 (FOCUS_BODIES/#617 drift)** — 정적 매칭 가드 fail → 즉시 동기화
6. **#6 (ring 결합 회귀)** — 기존 body (R1~R6) r1-guard pixel-diff fail → ring 결합 코드가 ring 없는 body 경로에 영향 없는지 격리 검증

---

## R8 인계 (uranus — 거성 예외 3번째)

1. **uranus 거성 예외 검토 주의** — uranus radius 2.5559e7 m = sun 의 **3.67%** — jupiter (10.28%) / saturn (8.66%) 와 달리 **inner planet (earth 15% / venus 11% 임계) 보다 사실 비율이 작음**. "거성 예외 = 사실 비율 정합 상향" 을 기계 답습하면 uranus 임계 ≤ 4% 가 되어 mars (8%) 보다 작아짐 — **ice giant 는 별도 판단 필요** (R8 architect 가 사실 비율 vs 거성 직관 trade-off 재평가. scale 48 답습 시 px 비 3.52% / mesh 8.7px)
2. **ring 축 코드 0 예측 검증** — uranus.rings (13개 narrow ring, ε ring 주요) 는 §축 2a generic 결합 + 스키마로 **데이터만 추가** 예측. 적중 시 Concrete Prediction 재현 박제
3. **ring tilt** — uranus 자전축 97.77° (옆으로 누움) — ring tilt 부재 (§위험 #4) 가 uranus 에서 치명적 (실제는 세로 고리). R8 진입 전 tilt 인프라 후속 이슈 우선 검토 권장
4. **showInShortcutBar** — uranus 현재 false (실측). R8 에서 true 전환 + FOCUS_BUTTONS 동반 (본 ADR §축 5 절차 답습)
5. **satellite N≥5 단일 룩업 한계** — R5 §위험 #6 인계 유지 (titania/oberon 등 5위성 진입 시 `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 검토)

---

## 교차검증 반영 사항 (cross-validate 2026-06-10 agy outcome=applied)

agy 가 본 설계를 "R6 실패 패턴(임계 이원화/scale 수렴값)을 피드백한 완성도 높은 문서" 로 지지. 4축 분류:

- **합의 (4)**: ① ring×bodyScale generic 결합 — R8 uranus "ring 축 코드 0" 예측 타당성 입증 ② optional 스키마(colorHint/ringAlphaHint) 하위 호환 폴백 설계 ③ px-ratio 임계 이원화(정책 식 ≠ guard 실측 ×1.05) ④ ORBIT_VISUAL_SCALE_BY_PARENT.saturn 맵 등록으로 R8+ 위성 자동 상속.
- **고유 발견 — 실측 해소 (1)**: **자전축 tilt ↔ ring 불일치 위험** — 코드 전수 grep (axialTilt/obliquity/rotationQuaternion/mesh.rotate 0건) 으로 **행성 자전축 기울기/자전 자체가 미구현** 확정 → agy 제시 시나리오 (b) "둘 다 기울기 0 이므로 비-범위 합의가 시각 위화감 없이 성립". §비-범위 ring tilt 후속 분리 유지.
- **고유 발견 — 구현 단계 검증 항목 수용 (2)**: ① **ring z-fighting (depthWrite/renderingGroupId)** — ring-shader.ts 실측: `backFaceCulling=false` 만 명시, depthWrite 미설정. saturn prominent(alpha 0.9) 는 jupiter faint 보다 z-fighting 가시 위험 큼 → **구현 DoD 에 "ring↔본체 limb z-fighting 무발생 (D-T2 육안 + 얕은 각도 시나리오)" 추가, 발생 시 `material.disableDepthWrite=true` 또는 alphaIndex 보정** (§위험 #5 신규). ② **titan 궤도 frame 명시** — `solar-system.json` titan orbit 에 dataSource 주석으로 "Query Frame: Saturn-centric J2000 Ecliptic" 명시 의무 (Laplace plane 좌표 혼입 방지). §축 3 JPL Horizons 쿼리 의무에 frame 파라미터 추가.
- **이견 (0)**: 없음.

### 사전 셀프 체크 (architect 기록 보존)

### Claude 편향 셀프 체크 (cross-validate 호출 전 사전 기록 — CLAUDE.md §교차검증)

- **낙관적 일정** — 코어 ≤ 16 라인이나 ring 결합 + 스키마 확장 + D-T2 iteration 으로 Amendment 라운드 N≥1 예상 박제. 통과
- **결합 간과** — **본 라운드 핵심**: (a) ring × bodyScale 결합이 jupiter ring 가시화로 전파 (§위험 #1), (b) ring outer 가 titan orbit binding constraint 로 전파 (§축 4 — ring 미고려 시 ×4 함정값 명시), (c) showInShortcutBar true 가 #617 가드 → FOCUS_BUTTONS → 모바일 너비로 전파 (§축 5). 3중 결합 전부 명시. 통과
- **폐기 프레이밍** — R6 "R7 ~5 라인" 예측을 폐기가 아닌 "ring 축 미인지 예측" 으로 정정 (body 진입 축 6 라인은 유지 확인). 통과
- **순수주의** — 고리 사실 비율 (2.326배) 보존 + prominent 강조 (ringAlphaHint) 의 균형 — 사실 순수 보존이 아닌 Visual Fidelity §1 (SSoT 보존 + rendering 강조) 정합. 통과
