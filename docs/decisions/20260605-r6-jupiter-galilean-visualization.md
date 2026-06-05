# ADR: R6 목성 + 갈릴레이 위성 4개 시각화 — Q2=B 거성 예외 (jupiter ~10% 임계 완화) + satellite 4개 첫 본 사례 + §결정 4 산식 정정

- **상태**: **Accepted (cross-validate 2026-06-05 agy outcome=applied)** (cross-validate 발동 ADR — CLAUDE.md §ADR Status 워크플로 #370. cross-validate 결과 §교차검증 반영 사항 본문 통합 완료 → Provisional → Accepted 전이)
- **날짜**: 2026-06-05 (PM 합의 + cross-validate 통합: 2026-06-05)
- **결정자**: architect (R6 PM 합의 라운드 완료 — Q1=A / Q2=B 임계 완화 (jupiter 거성 예외) / Q3=후속 분리. 메인 오케스트레이터가 사용자와 합의)
- **관련**: [#621](https://github.com/coseo12/astro-simulator/issues/621) (R6 본 스프린트, PM 합의 2026-06-05), 후속 분리 [#622](https://github.com/coseo12/astro-simulator/issues/622) (잔여 gap forensic) / [#623](https://github.com/coseo12/astro-simulator/issues/623) (DPR) / [#624](https://github.com/coseo12/astro-simulator/issues/624) (occlusion), [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) (R5 SSoT — marsScale=800 / phobos·deimosScale=5000 / MARS_SATELLITES_ORBIT_VISUAL_SCALE=500 / satellite 2개 첫 본 사례 + **§결정 4 Amendment 1 산식 정정 인계 의무**), [`20260520-r4-earth-moon-visualization.md`](20260520-r4-earth-moon-visualization.md) (R4 SSoT — satellite 첫 본 사례 + EARTH_MOON_ORBIT_VISUAL_SCALE=30 + moon Amendment 4), [`20260430-r3-followup-body-proportion.md`](20260430-r3-followup-body-proportion.md) (Q2=B 비례 결정 정책 SSoT), [`20260604-613-r-phase-metadata-ssot.md`](20260604-613-r-phase-metadata-ssot.md) (**R-Phase 메타데이터 SSoT — allowlist 자동 생성 / showInShortcutBar / CURRENT_R_PHASE — R6 Concrete Prediction 대폭 단축 근거**), [`20260504-r-phase-allowlist-guard.md`](20260504-r-phase-allowlist-guard.md) (R-Phase 진입 박제 절차 SSoT), [`20260424-p11-b-lod-design.md`](20260424-p11-b-lod-design.md) (LOD × scale 합성), [`20260422-floating-origin.md`](20260422-floating-origin.md) (Tier transition — §결정 4 Amendment 1 가설 1 영역), [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541, 의무 체크리스트 4항목)
- **교훈 적용**:
  - "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21) — R1~R5 인프라 100% 재사용 + **#613 메타데이터 SSoT 도입으로 allowlist 1줄 + shortcut bar 0줄 자동화 재발견**. R5 ADR §Concrete Prediction "R6 ≤ 12 라인" 예측을 #613 도입 사실로 **하향 갱신**)
  - "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (#613 `introducedInRPhase` / `showInShortcutBar` 메타데이터가 R6 body 에 이미 부여됨 → R6 진입은 `CURRENT_R_PHASE=5→6` 1줄로 allowlist + shortcut 활성화 자동 전파. "데이터만 추가, 코드 변경 최소" 예측 재현)
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — galilean 4개 사실 비율 vs 시각 직관 mismatch 측정 의무. moon Amendment 4 + R5 §결정 2/3 SSoT 답습)
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt [#77](https://github.com/coseo12/volt/issues/77) — 실 Chrome GUI D-T2 의무)
  - "인계 항목 실측 재검증" (volt [#14](https://github.com/coseo12/volt/issues/14) — R6 진입 시점 baseline 실측: develop tip `b7f4d9c` v0.19.0 + #613/#617/#619 메타데이터 SSoT 반영 후. R5 ADR §결정 4 Amendment 1 인계 의무 4건 실측 재검증)
  - "결합 간과 — Claude 4종 편향" (volt [#29](https://github.com/coseo12/volt/issues/29) — jupiter (sun 다음 최대 body) 와 galilean 4개 결합 (parent-satellite × 4) + io binding constraint + Q2=B 천장 오인 정정)

---

## 현재 유효 결정 요약 (Living ADR Executive Summary)

> 본 ADR 은 **Accepted** (PM 합의 + cross-validate 통합 완료). Amendment 라운드 N (≥1) 예상. 신규 팀원 / 후속 R-Phase architect 가 빠르게 최종 결정 파악할 수 있도록 **현재 유효한 박제값과 결정만** 본 섹션에 요약. 상세 후보 비교 / Concrete Prediction / 회고는 §결정 N / §축 N 본문 참조. **PM 정책 결정 확정**: Q1=A (galilean 4개 전부 동시) / **Q2=B 임계 완화 (jupiter 가스 거성 예외 — sun 대비 ~10% 상향, 사실 비율 jupiter/sun=10.276% 정합)** / Q3=고유 발견 3건 후속 분리.

### 핵심 박제값 (PM 합의 + cross-validate 후 확정)

| 항목 | 박제값 | 위치 | 비고 |
|---|---|---|---|
| `BODY_SCALE.jupiter` | **48** | `apps/web/src/constants/body-scale.ts` | §축 1 — sun 대비 px 비 **9.87%** (Q2=B 거성 예외 ≤ 10% margin 0.13%), mid LOD 안전 (24.3 px). **PM Q2=B 임계 완화로 10→48 상향** |
| `BODY_SCALE.io` | **300** | `apps/web/src/constants/body-scale.ts` | §축 2 — moon-class. mesh 3.87 px (4px fallback). jupiter 24.3px ≫ io 3.87px 역전 자동 해소 |
| `BODY_SCALE.europa` | **300** | `apps/web/src/constants/body-scale.ts` | §축 2 — io 동일값 (mental model). mesh 3.32 px |
| `BODY_SCALE.ganymede` | **300** | `apps/web/src/constants/body-scale.ts` | §축 2 — mesh 5.60 px (mesh visible). jupiter 대비 0.23배 (역전 없음) |
| `BODY_SCALE.callisto` | **300** | `apps/web/src/constants/body-scale.ts` | §축 2 — mesh 5.12 px (mesh visible). jupiter 대비 0.21배 |
| `JUPITER_SATELLITES_ORBIT_VISUAL_SCALE` + `ORBIT_VISUAL_SCALE_BY_PARENT.jupiter` | **16** | `packages/core/src/scene/orbit-visual-scale.ts` | §축 4 — **jupiter mesh 4.8배 확대 (scale 48) 로 io binding 재산출**: io 분리 마진 1.69x (R5 phobos 1.69x 정합). **6→16 상향 (jupiter scale 상향의 결합 효과)**. R5 §결정 4 정정 산식 적용 |
| `PX_RATIO_THRESHOLDS.jupiter` | **10%** (`0.10`) | `apps/web/scripts/r1-ui-regression-guard.mjs` | §축 5 — 산출 9.87%, margin 0.13% (± 2% 안). **Q2=B 거성 예외 — inner planet 단조 정책과 직교** |
| `PX_RATIO_THRESHOLDS.{io,europa,ganymede,callisto}` | **N/A** (4px fallback 의존 — Q2=B 임계 미적용) | r1-guard 미박제 | §축 6 — R5 phobos/deimos §결정 6 답습 |
| `CURRENT_R_PHASE` | **5 → 6** (1줄) | `packages/core/src/scene/r-phase-allowlist.ts` | §축 7 — #613 자동 생성. allowlist + shortcut 자동 전파 |
| `R_PHASE_BODY_ALLOWLIST` | (자동) `[...R5, jupiter, io, europa, ganymede, callisto]` | (자동 생성) | §축 7 — `introducedInRPhase=6` 데이터 필터 |
| `FOCUS_BUTTONS` | **변경 0줄** (jupiter 이미 존재, R6 진입 시 isRPhaseFocusable 자동 enabled) | `focus-quick-buttons.tsx` | §축 8 — #617 showInShortcutBar SSoT (galilean=false) |
| `FOCUS_BODIES` (browser-verify-378-focus.mjs) | `[...R5, jupiter, io, europa, ganymede, callisto]` (수동 동기화) | `browser-verify-378-focus.mjs` | §축 7 — #598 정적 매칭 가드 차단 회피 |

### 핵심 결정 요약 (PM 합의 + cross-validate 후 확정)

1. **jupiterScale=48** (§축 1): sun 대비 px 비 **9.87%** (Q2=B 거성 예외 ≤ 10% margin 0.13%). **PM Q2=B 임계 완화 결정 — jupiter 가 가스 거성이므로 사실 비율 (jupiter/sun=10.276%) 정합 우선**. mesh visible 24.3px (mid LOD 임계 50px 안전). **R5 ADR 의 "jupiter ≥ 100% / Q2=B 천장 인스턴스화" 인계 가정은 오독 — jupiter radius 는 sun 의 10.28% 에 불과** (§결정 정정 Q3 참조)
2. **galilean 4개 = 300** (§축 2): moon-class radius (io/europa ≈ moon, ganymede/callisto > moon). moon Amendment 4 학습 — io/europa 는 4px fallback, ganymede/callisto 는 mesh visible. **jupiterScale 48 (24.3px) ≫ galilean (3.3~5.6px) 로 시각 역전 자동 해소** — 역전 해소되었으므로 galilean 무리한 하향 불필요 (300 유지). 사실 크기 순서 (ganymede>callisto>io>europa) mesh px 에 보존
3. **JUPITER_SATELLITES_ORBIT_VISUAL_SCALE=16** (§축 4): **jupiter mesh 4.8배 확대 (scale 48) 의 결합 효과로 io binding 재산출** — 기존 ×6 은 io 마진 0.63x (io 가 jupiter mesh 안에 묻힘). ×16 에서 io 분리 마진 1.69x (R5 phobos 1.69x 정합). **R5 §결정 4 Amendment 1 정정 산식 적용** (산식 ↔ 실측 metric 정의 분리 명시)
4. **Q2=B 임계 — jupiter=10% (거성 예외)** (§축 5): 산출 9.87% margin 0.13%. **inner planet 거리순 단조 (mercury<venus<earth) 의 예외 — 거성은 사실 비율 정합 우선**. R6 Q2=B 3번째 본 인스턴스화 (단, 거성 예외로 단조 패턴 명시 분기)
5. **Q2=B 임계 미적용 — galilean 4개** (§축 6): R5 phobos/deimos §결정 6 답습 (4px fallback 흡수)
6. **CURRENT_R_PHASE=6 (1줄)** (§축 7): #613 메타데이터 SSoT 자동 생성. R5 ADR 의 "allowlist 3줄 + body id 추가" 예측 → #613 도입으로 **1줄로 단축**
7. **shortcut bar 변경 0줄** (§축 8): #617 showInShortcutBar SSoT — jupiter 이미 FOCUS_BUTTONS 존재 (disabled→auto-enabled), galilean 4개 `showInShortcutBar=false`. **R5 ADR 의 "11버튼 392px overflow" 인계 가정은 galilean 을 bar 에 추가한다는 전제였으나 #617 데이터가 이미 예방** — 실제 bar 는 R5 와 동일 10버튼 356px 안전

### 비-범위 (R5 ADR 비-범위 답습 + R6 고유)

- jupiter 표면 visual / 대적점(Great Red Spot) / 줄무늬 atmosphere ❌ (P11 이후)
- jupiter 고리(faint ring) ❌
- galilean irregular albedo / 표면 texture ❌ (mesh sphere + 단색 근사)
- galilean Laplace resonance (io:europa:ganymede 1:2:4 궤도 공명) 시각 강조 ❌ (후속)
- io 화산 활동 / europa 얼음 균열 visual ❌
- saturn / titan / R7+ body 진입 ❌
- jupiter-galilean Roche limit / tidal heating ❌
- shortcut bar 모바일 너비 재조정 ❌ (#617 데이터로 R6 overflow 없음 — R5 인계 가정 무효화)
- 실측 데이터 변경 ❌ (`solar-system.json`)
- LOD 시스템 변경 ❌ (R4 Amendment 3 보존)
- §결정 4 산식 ↔ 실측 1.74배 gap 의 **runtime 원인 확정** ❌ (가설 박제만 — 본 ADR §축 4 Amendment 인계. **후속 이슈 분리 완료** — [#622](https://github.com/coseo12/astro-simulator/issues/622), priority:low, §재검토 트리거 #4)
- **DPR(Retina) 4px fallback physical/logical pixel 명시** ❌ (**후속 이슈 분리 완료** — [#623](https://github.com/coseo12/astro-simulator/issues/623), priority:low. agy cross-validate 고유 발견)
- **galilean occlusion/raycast hit-test 엣지** ❌ (4개 일직선 겹침 / jupiter 뒤 엄폐 시 선택 불가 — **후속 이슈 분리 완료** — [#624](https://github.com/coseo12/astro-simulator/issues/624), priority:medium. agy cross-validate 고유 발견)

### 후속 R-Phase 인계 의무

- R7 (saturn/titan) / R8+ 진입 시 **satellite 가 있는 모든 case 에 본 ADR §축 4 정정 산식 (산식 metric vs 실측 metric 분리 정의) 의무 적용** + 사실 비율 vs 시각 직관 mismatch 측정
- satellite N≥5 (saturn moons 다수) 진입 시 `ORBIT_VISUAL_SCALE_BY_PARENT` 단일 룩업이 부족할 가능성 → `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 검토 (R5 §위험 #6 인계)
- jupiter 이후 saturn (radius 5.8232e7 m, sun 의 8.37%) 진입 시 **R6 가스 거성 예외 패턴 답습** — saturn Q2=B 임계도 사실 비율 (sun 의 ~8.37%) 정합 상향 검토 (inner planet 단조 예외). Q2=B 천장 (25% sun) 인스턴스화는 여전히 sun 자신만 해당 (다른 body 는 sun radius 의 10% 미만이라 천장 도달 불가)
- **거성 예외 정책 SSoT 인계** — R6 부터 가스 거성 (jupiter / saturn / uranus / neptune) 은 **Q2=B 임계를 사실 비율 정합 상향** (inner planet 거리순 단조와 직교). 근거: 거성이 inner planet 보다 작게 보이는 것은 사용자 직관 위배 (agy 고유 발견 수용)

---

## 통합 vs 분리 결정 (메타)

본 ADR 은 R4/R5 §"R-Phase 단일 ADR 패턴" 답습:

- **R-Phase 단일 ADR 패턴** — R6 시각화 결정 N건 (jupiterScale / galilean 4 scale / orbit visual scale / Q2=B 임계 / allowlist / shortcut bar) 을 단일 ADR 로 통합. 파일명 `20260605-r6-jupiter-galilean-visualization.md`
- **satellite 4개 첫 본 사례** — R4 (moon 1개) / R5 (phobos+deimos 2개) → R6 (galilean 4개). R7+ (saturn moons 다수) SSoT 참조 패턴
- **Q2=B 비례 결정 정책 3번째 본 인스턴스화** — R4 (첫) / R5 (2번째) / R6 (3번째). jupiter 가 sun 다음 최대 body 이므로 Q2=B 상단(sun 25% 천장) 정합 검증
- **#613 메타데이터 SSoT 2번째 본 인스턴스화** — #613 (R5 데이터 마이그레이션 + R6 메타데이터 사전 부여) 이후 R6 가 **첫 자동 생성 R-Phase 진입**. `CURRENT_R_PHASE` 1줄 증가 패턴 첫 실전 검증

---

## 배경

### Roadmap v3 §R6 진입 조건

[`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) §"R6 = R5 + 목성 + 갈릴레이 4" 에 따라 R6 는 R5 위에 **jupiter + io/europa/ganymede/callisto 를 명시적으로 visible 하게 추가**. PM 합의 라운드는 본 ADR §메인 오케스트레이터 결정 필요 항목 의 Q1/Q2/Q3 응답 후 진행.

### 현재 baseline 실측 (2026-06-05 develop tip = `b7f4d9c`, v0.19.0 release + #613/#617/#619 메타데이터 SSoT 반영)

`apps/web/src/constants/body-scale.ts` 실측:

```typescript
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 50,
  mercury: 700,
  venus: 800,
  earth: 800,
  moon: 200, // R4 #539 Amendment 4
  mars: 800, // R5 #594
  phobos: 5000, // R5 #594
  deimos: 5000, // R5 #594
});
```

`packages/core/src/scene/r-phase-allowlist.ts` 실측 (#613 자동 생성):

```typescript
export const CURRENT_R_PHASE = 5;
export const R_PHASE_BODY_ALLOWLIST: readonly string[] = Object.freeze(
  filterBodiesByPhase(getSolarSystem().bodies, CURRENT_R_PHASE),
);
// → ['sun','mercury','venus','earth','moon','mars','phobos','deimos'] (introducedInRPhase ≤ 5)
```

`orbit-visual-scale.ts` 실측:

```typescript
export const EARTH_MOON_ORBIT_VISUAL_SCALE = 30; // R4
export const MARS_SATELLITES_ORBIT_VISUAL_SCALE = 500; // R5
export const ORBIT_VISUAL_SCALE_BY_PARENT = Object.freeze({
  earth: EARTH_MOON_ORBIT_VISUAL_SCALE,
  mars: MARS_SATELLITES_ORBIT_VISUAL_SCALE,
});
```

`focus-quick-buttons.tsx` FOCUS_BUTTONS 실측 (8 id):
- `sun / mercury / venus / earth / moon / mars / jupiter (R6 disabled) / neptune (R10 disabled)`
- **jupiter 이미 배열에 존재** — R6 진입 시 `isRPhaseFocusable('jupiter')` 가 true 가 되어 자동 enabled (배열 변경 불필요)

`browser-verify-378-focus.mjs` FOCUS_BODIES 실측:
- `['sun','mercury','venus','earth','moon','mars','phobos','deimos']` (R5 동기화 완료, R4 baseline drift 해소됨)

### 데이터 SSoT (`packages/shared/data/solar-system.json`) — 실측값 직접 확인

| body | radius (m) | parentId | orbit.semiMajorAxisAU | introducedInRPhase | showInShortcutBar |
|---|---|---|---|---|---|
| **jupiter** | 7.1492e7 | sun | 5.202887 | 6 | true |
| **io** | 1.8216e6 | jupiter | 0.00280906 | 6 | false |
| **europa** | 1.5608e6 | jupiter | 0.00448742 | 6 | false |
| **ganymede** | 2.6341e6 | jupiter | 0.00715957 | 6 | false |
| **callisto** | 2.4103e6 | jupiter | 0.0125847 | 6 | false |

(참고: sun radius 6.957e8 m / earth 6.378137e6 m / mars 3.3962e6 m / moon 1.7374e6 m)

jupiter 사실 비율:
- **jupiter/sun radius = 10.276%** ← **R5 ADR 의 "jupiter ≥ 100% sun" 인계 가정은 오독. jupiter 는 sun 의 10.28% 에 불과** (Q3 정정)
- jupiter/earth radius = 11.21x (지구의 약 11배)
- jupiter/mars radius = 21.05x

galilean 사실 비율 (moon 1.7374e6 기준):
- io/moon = 1.048x (moon 보다 약간 큼) / io/mars = 0.536x / io/jupiter = 2.548%
- europa/moon = 0.898x (moon 보다 약간 작음) / europa/jupiter = 2.183%
- ganymede/moon = 1.516x (moon 의 약 1.5배 — 태양계 최대 위성, mercury 보다 큼) / ganymede/jupiter = 3.684%
- callisto/moon = 1.387x / callisto/jupiter = 3.371%

### 산출식 (R1~R5 ADR 동일 식, R6 검증)

```
diameter (scene unit) = body.radius (m) × 2 × renderScaleForTier('solar') × scale
px_diameter (1280×720) = body.radius × scale × k,  k = sun_px / (sun.radius × sunScale) = 246.3 / (6.957e8 × 50) = 7.0806e-9
sunPxRatio(body) ≈ (body.radius × scale) / (sun.radius × sunScale) = (body.radius × scale) / 3.4785e10
```

jupiter 산출 (1280×720):
```
jupiter_pxDiameter = 7.1492e7 × jupScale × 7.0806e-9 = jupScale × 0.5062
jupiter_sunPxRatio = (7.1492e7 × jupScale) / 3.4785e10 = jupScale × 2.0552e-3
```

**jupiter 산출식이 R5 inner planet 과 다르게 동작하는가? (요구사항 5 검증)** — 동일 선형식. jupiter 가 가장 큰 body 라도 산출식은 `radius × scale × k` 선형이며, jupiter radius (7.1492e7 m) 가 sun (6.957e8 m) 의 10.28% 이므로 동일 scale 적용 시 sun px 의 10.28%. **선형식이므로 큰 body 라고 다르게 동작하지 않으며, jupiter 가 sun 천장(25%)에 근접하려면 jupScale ≈ 122 가 필요** (sunScale=50 대비 2.4배). 시각 visible-only 목표 scale (≈ 8~15) 에서는 sun 천장에 한참 못 미침 — **Q2=B 천장 인스턴스화는 sun 자신에만 해당하며 jupiter 로는 불가** (Q3 핵심 정정).

### 기존 자산 재사용 조사 ("신규 함수 ≠ 신규 구현" volt #21 + #613 메타데이터 SSoT 재발견)

R5 ADR §기존 자산 재사용 조사 표 재현 + **#613 메타데이터 SSoT 도입 사실 반영** (R5 ADR §Concrete Prediction "R6 ≤ 12 라인" 예측의 인프라 변화):

| 자산 | 위치 | 본 R6 처리 | R5 ADR 예측 대비 변화 |
|---|---|---|---|
| `BODY_SCALE` 룩업 | `apps/web/src/constants/body-scale.ts` | **확장** — jupiter + galilean 4 = **5줄 추가** | 동일 |
| `createSolarSystemScene({ bodyScale })` | `solar-system-scene.ts` | **재사용 — 0줄** | 동일 |
| `createBodyMesh*` diameter 계산 | 동 파일 | **재사용 — 0줄** | 동일 |
| `R_PHASE_BODY_ALLOWLIST` | `r-phase-allowlist.ts` | **`CURRENT_R_PHASE=5→6` 1줄** (#613 자동 생성) | **R5 예측 "allowlist body id 1~3줄" → #613 도입으로 1줄로 통합 단축** |
| `ORBIT_VISUAL_SCALE_BY_PARENT` | `orbit-visual-scale.ts` | **확장** — `jupiter: 16` 1줄 + 상수 선언 1줄 = **2줄** | 동일 (단일 룩업 가정) |
| `FOCUS_BUTTONS` 배열 | `focus-quick-buttons.tsx` | **변경 0줄** (jupiter 이미 존재 → isRPhaseFocusable 자동 enabled. galilean=showInShortcutBar false) | **R5 예측 "shortcut 11버튼 392px overflow + horizontal scroll/2단 grid ≥ 5줄" → #617 데이터로 0줄, overflow 없음** |
| `FOCUS_BODIES` (browser-verify-378-focus.mjs) | `browser-verify-378-focus.mjs` | **확장** — jupiter + galilean 4 = **5 id 추가** (#598 정적 매칭 가드 정합) | 신규 (R5 에서 FOCUS_BODIES drift 해소 후) |
| r1-guard `--measure-px-ratio` | `r1-ui-regression-guard.mjs` | **확장 — jupiter baseline 1줄** (galilean 미박제, §축 6) | 동일 |
| `body-scale.test.ts` | `body-scale.test.ts` | **확장** — getBodyScale 5줄 | 별도 카운트 |
| `r-phase-allowlist.test.ts` #617 매칭 | `r-phase-allowlist.test.ts` | **갱신** — shortcutEnabled expected 에 jupiter 추가 (테스트 expected) | 별도 카운트 (가드 자기 검증) |

**신규 구현 (코어 코드)**: BODY_SCALE 5 + CURRENT_R_PHASE 1 + ORBIT_VISUAL_SCALE_BY_PARENT 2 + FOCUS_BUTTONS 0 = **8 라인** (FOCUS_BODIES 5 + r1-guard 1 + 단위 테스트 expected 갱신은 별도 카운트). **Concrete Prediction §갱신 참조.**

**satellite 4개 첫 본 검증 영역** (R7+ SSoT):
1. **galilean 궤도 라인 4개** — 모두 jupiter 중심 상대 좌표. rebuildOrbitLines parentId 자동 처리 (코드 변경 0 예측)
2. **galilean focus animation 4개** — `?focus=io/europa/ganymede/callisto` URL 진입
3. **galilean hit-test 4개** — io binding constraint (orbit 가장 가까움) 분리 평가 (§축 4)
4. **단일 ORBIT_VISUAL_SCALE_BY_PARENT.jupiter 룩업으로 4개 satellite 처리** — io binding, callisto 자동 안전. R5 mars 단일 룩업 패턴 답습. satellite 4개로 마진 편차 커지는지 검증 (Amendment 가능성)

---

## 후보 비교

### 축 1 — `jupiterScale` 구체값

jupiter.radius = 7.1492e7 m (sun 의 **10.276%**, earth 의 **11.21배**, mars 의 **21.05배**).

> **PM 정책 결정 (Q2=B 임계 완화 — 거성 예외)**: 메인 오케스트레이터가 사용자와 합의하여, jupiter 는 가스 거성이므로 "지구보다 작게 보이는 것은 직관 위배" 라는 agy 고유 발견을 수용. **jupiter Q2=B 임계를 sun 대비 ~10% 로 상향** (사실 비율 jupiter/sun=10.276% 정합). 따라서 jupiterScale 을 mesh ~24px / sun 대비 px 비 ~10% 가 되도록 재산출. architect 초안의 jupiterScale=10 (px 비 2.06%, earth 보다 작게 보임) 은 **기각** — visible-only 우선이 거성 직관 위배를 방치했음.

| jupiterScale | sun 대비 px 비 | jupiter pxDiameter (1280×720) | mid LOD 임계 50px | mesh visible | Q2=B 임계 후보 | 평가 |
|---|---|---|---|---|---|---|
| × 10 | 2.06% | 5.1 px | 안전 | +1.1 px | ≤ 3% | architect 초안 — **기각** (earth 36.1px 대비 0.14배, 거성 직관 위배) |
| × 40 | 8.22% | 20.2 px | 안전 | mesh visible | ≤ 9% | earth(36.1) 대비 0.56배 — 사실 비율보다 작으나 venus 근접 |
| × 44 | 9.04% | 22.3 px | 안전 | mesh visible | ≤ 9% | earth 대비 0.62배 |
| **× 48** | **9.87%** | **24.3 px** | **안전** | **mesh visible** | **≤ 10% (margin 0.13%)** | **선택 — 사실 비율 10.276% 정합, earth(36.1) 대비 0.67배 / venus(33.45) 대비 0.73배, Q2=B 거성 예외 ≤ 10% margin** |
| × 50 | 10.28% | 25.3 px | 안전 | mesh visible | ≤ 10% (경계) | 사실 비율 정확 일치하나 px 비 10.28% > 10% 임계 margin -0.28% (±2% 안이나 경계) |
| × 52 | 10.69% | 26.3 px | 안전 | mesh visible | ≤ 11% | 약간 큼 |
| × 122 | 25.0% | 61.8 px | **위반 (mid→far)** | — | (sun 천장) | Q2=B sun 천장 도달 — 비현실적 (천장은 sun 자신만) |

#### 선택 — **jupiterScale = 48** (PM Q2=B 임계 완화 후 재산출, cross-validate 후 확정)

근거:
1. **사실 비율 정합 우선 (거성 예외)** — jupiter/sun radius = 10.276%. jupiterScale=48 → sun 대비 px 비 **9.87%** (사실 비율에 0.13% 못 미침 — px 비를 임계 10% 안으로 떨어뜨리는 정수 scale). **scale=50 이면 정확히 10.28% 이나 px 비 임계 10% 를 0.28% 초과** → 48 채택 (임계 안 + 정수 단순성)
2. **earth/venus 대비 자연 크기** — jupiter pxDiameter 24.3 px vs earth 36.1 px (0.67배) / venus 33.45 px (0.73배). **거성이 inner planet 보다 약간 작게 보이나 동급 크기 인지** — visible-only scale 10 (5.1px, earth 의 0.14배) 의 "거성이 위성처럼 작아 보임" 직관 위배 해소
3. **mesh visible 안정 (24.3 px ≫ 4px / mid 임계 50px 미만)** — mid LOD 일관, billboard fallback 무의존
4. **galilean 시각 역전 자동 해소** — jupiter 24.3px ≫ ganymede 5.60px (0.23배). architect 초안 (jupiter 5.1px ≈ ganymede 5.60px 역전) 의 위험 #2 가 jupiter scale 상향으로 **자동 소멸** (§축 3 갱신)
5. **Q2=B 거성 예외 임계 ≤ 10% margin 0.13% (산출 9.87%)** — ± 2% 허용 오차 안 통과 (§축 5 단조 예외 박제)
6. **모바일 누적 차단율 마진** — jupiter disk area 모바일 (375×667) ≈ 0.159% (scale 10 의 0.06% 대비 23배 — disk area 4.8² 비례). R5 누적 8.77% + jupiter 0.159% + galilean 4 합 0.023% = **8.95% 누적** (DoD 임계 25% margin 16.05%)

> **D-T2 검증 의무** — jupiter 24.3px 가 earth(36.1px) 보다 작게 보이는 것이 여전히 사용자에게 "거성치고 작음" 으로 보고되는지 관찰 (사실 11.21배 ↔ 시각 0.67배 — 임계 완화로 mismatch 대폭 완화되었으나 0 은 아님). D-T2 미통과 시 jupiterScale 48 → 52 fallback (§재검토 트리거 #1, Q2=B 임계 ≤ 11% 동반 조정). **거성 예외 정책 자체의 사용자 수용 검증이 R6 D-T2 핵심 관찰 포인트**.

---

### 축 2 — galilean 4개 scale 구체값 (moon Amendment 4 학습 적용)

galilean 은 moon-class radius (io/europa ≈ moon, ganymede/callisto > moon). R5 phobos/deimos (mars 의 0.3%) 와 달리 **사실 비율 적용해도 sub-pixel 압도는 아님** (moon=200 답습 가능). **PM Q2=B 완화로 jupiter (jupScale=48, mesh 24.3px) 가 galilean (3.3~5.6px) 대비 명확히 큼 — galilean visible 보장 + jupiter 우위 동시 충족 (역전 위험 소멸).**

galilean scale 후보 (1280×720 pxDiameter):

| body | radius (m) | /moon | scale=200 | scale=300 | scale=500 | 4px 임계 (scale=300) |
|---|---|---|---|---|---|---|
| io | 1.8216e6 | 1.048x | 2.58 px | **3.87 px** | 6.45 px | 4px fallback 의존 |
| europa | 1.5608e6 | 0.898x | 2.21 px | **3.32 px** | 5.53 px | 4px fallback 의존 |
| ganymede | 2.6341e6 | 1.516x | 3.73 px | **5.60 px** | 9.33 px | mesh visible |
| callisto | 2.4103e6 | 1.387x | 3.41 px | **5.12 px** | 8.53 px | mesh visible |

#### 후보 평가

| 후보 | io/europa | ganymede/callisto | moon (=200, 2.46px) 대비 mental model | 평가 |
|---|---|---|---|---|
| A. galilean=200 (moon 답습) | 4px fallback (2.2~2.6px) | 4px fallback (3.4~3.7px) | moon 과 동일 scale → io ≈ moon (사실 1.048x 정합) | 사실 비율 정확하나 모두 fallback 의존 (가시성 약함) |
| **B. galilean=300** | **4px fallback (3.3~3.9px)** | **mesh visible (5.1~5.6px)** | **moon(2.46px) 보다 약간 큼 — 사실 io/moon 1.048x 와 약간 인지 강화** | **선택 — io/europa 안정 fallback + ganymede/callisto mesh visible (사실 ganymede 가 가장 큰 점 시각 반영)** |
| C. galilean=500 | mesh visible (5.5~6.5px) | mesh visible (8.5~9.3px) | moon 보다 2배 큼 (사실 비율 과장) | galilean 이 moon 보다 과하게 커 보임 (사실 위배 강함) |
| D. body별 차등 (io/europa=400, ganymede/callisto=300) | 균일 4px+ | 균일 5px+ | 사실 비율 역전 보정 | 복잡도 증가 — 단일값 단순성 손실. R7+ SSoT 부담 |

#### 선택 — **후보 B: galilean 4개 = 300** (architect 권고)

근거:
1. **moon Amendment 4 학습 부분 적용** — galilean 은 moon-class 라 phobos/deimos 처럼 극단 사실 위배는 불필요. moon=200 보다 약간 큰 300 으로 jupiter 대비 visible 보장 + 사실 비율 (io/moon 1.048x) 대비 약간 인지 강화 (300/200 = 1.5배 scale → 시각 약 1.5배)
2. **ganymede/callisto mesh visible (5.1~5.6px)** — 사실상 가장 큰 위성 (ganymede 1.516x moon, 태양계 최대 위성, mercury 보다 큼) 이 mesh 로 visible — 사실 크기 순서 시각 반영 (ganymede > callisto > io > europa)
3. **io/europa 4px fallback (3.3~3.9px)** — moon (2.46px, fallback) 과 동일 안정 패턴
4. **단일값 단순성** — 4개 동일 300 → body-scale.ts 룩업 가독성 + mental model "galilean 4개는 비슷한 크기" (실제 io 1.048x ~ ganymede 1.516x 의 1.45배 편차는 약간 압축). 후보 D (body별 차등) 의 복잡도 회피
5. **Q2=B 임계 미적용 (§축 6)** — galilean sun 대비 px 비 모두 < 4% (io 1.57% / ganymede 2.27%) 이나 4px fallback 부분 의존으로 §결정 6 (R5 phobos/deimos 패턴) 답습 — r1-guard 미박제

> **D-T2 검증 의무** — galilean 4개 visible + io binding constraint 분리 (§축 4) + ganymede 가 가장 크게 보이는지 (사실 순서). D-T2 미통과 시 galilean=400 또는 body별 차등 (후보 D) fallback (§재검토 트리거 #2).

---

### 축 3 — galilean 사실 비율 vs 시각 직관 mismatch 측정 (R5 §결정 2/3 절차 답습)

R5 phobos/deimos 가 극단 sub-pixel (mars 의 0.3%) 이라 사실 위배 박제값을 채택한 반면, galilean 은 moon-class 라 **사실 비율 정합 가능 영역**. mismatch 측정:

> **PM Q2=B 임계 완화 (jupiterScale 48) 로 본 축의 시각 역전 위험 자동 해소.** 아래는 갱신 후 측정.

| body | 사실 비율 (radius/jupiter) | scale=300 시 mesh px (1280×720) | jupiter(24.3px) 대비 | 시각 직관 정합 | 판정 |
|---|---|---|---|---|---|
| io | 2.548% | 3.87 px | 0.159배 | 사실 2.5% ↔ 시각 16% — 약간 과대 (위성 인지 강화) | moon Amendment 4 유형 — 의도적, 역전 없음 |
| europa | 2.183% | 3.32 px | 0.136배 | 약간 과대 | 의도적, 역전 없음 |
| ganymede | 3.684% | 5.60 px | 0.230배 | jupiter 보다 명확히 작음 | ✅ 역전 해소 |
| callisto | 3.371% | 5.12 px | 0.211배 | jupiter 보다 명확히 작음 | ✅ 역전 해소 |

**핵심 갱신 (PM Q2=B 임계 완화 결과)**: jupiterScale 10→48 (5.1px→24.3px) 상향으로 **galilean 4개 모두 jupiter mesh 의 0.14~0.23배** — 사실 비율 (galilean 은 jupiter 의 2.2~3.7%) 보다는 약간 과대하나 **시각 역전 (위성이 행성보다 큼) 은 완전 해소**. architect 초안 (jupiter 5.1px ≈ ganymede 5.60px 역전) 의 위험 #2 는 Q2=B 완화로 **자동 소멸**.

**galilean 4개 간 상대 크기 (사실 순서 보존 확인)**: ganymede 5.60 > callisto 5.12 > io 3.87 > europa 3.32 — **사실 radius 순서 (ganymede>callisto>io>europa) 가 mesh px 에 보존**. 단 io(3.87)/europa(3.32) 는 4px 미만으로 billboard fallback 진입 가능 → fallback 시 두 위성이 동일 billboard 크기로 렌더되어 io>europa 미세 차이가 묻힐 수 있음 (D-T2 관찰 — 단 ganymede/callisto 는 mesh visible 이라 4개 중 큰 2개의 순서는 보존). **galilean 무리한 하향 불필요** (역전 해소되었으므로 300 유지, PM 합의).

> **galilean scale 재검토 결론**: 역전이 jupiter scale 상향으로 해소되었으므로 galilean=300 을 하향할 이유 없음 (PM 명시). 단 io/europa 4px fallback 으로 4개 간 미세 순서가 묻히는지는 D-T2 관찰 (§재검토 트리거 #2 — 묻히면 galileanScale 400 상향으로 4개 모두 mesh visible 전환 검토. 단 jupiter 24.3px 대비 여전히 0.18~0.31배 안전).

---

### 축 4 — `JUPITER_SATELLITES_ORBIT_VISUAL_SCALE` 구체값 + **R5 §결정 4 Amendment 1 산식 정정**

#### R5 §결정 4 Amendment 1 인계 — 산식 ↔ 실측 metric 정의 분리 정정 (요구사항 1)

R5 ADR §결정 4 는 `MARS_SATELLITES_ORBIT_VISUAL_SCALE=500` 의 phobos 분리 마진을 **1.69x** 로 박제했으나, #604 Amendment 1 에서 runtime 실측 (`phobos.position.length() / mars.boundingSphere.radiusWorld`) 이 **0.99** (deimos 2.49) 로 산식 대비 ~1.71배 작음을 발견. R5 ADR 은 "산식 보존 + 실측 분리 박제 + R6 architect 단계 산식 정정 의무" 로 인계.

**R6 architect 산식 정정 결과 (실측 재검증)**:

본 ADR 작성 시점 정적 재산출로 mismatch 의 **구조적 원인을 metric 정의 분리로 확정**:

```
[산식 A — R5 §결정 4 박제 "분리 마진"]:
  separation_margin = visual_orbit / (parent_mesh_radius + satellite_mesh_radius)   # sum_mesh 분모
  phobos: 4.688e9 / (2.717e9 + 5.54e7) = 4.688e9 / 2.772e9 = 1.691x   ✅ ADR 1.69 재현

[산식 B — runtime 측정 metric "중심거리/부모반경비"]:
  measured_ratio = satellite.position.length() / parent.boundingSphere.radiusWorld   # parent_only 분모
  정적 등가식: visual_orbit / parent_mesh_radius (sum 아님, parent only)
  phobos: 4.688e9 / 2.717e9 = 1.725x   (산식 A 의 1.020배 — sum vs parent only 분모 차이)
```

**1차 정정 (분모 차이)**: 산식 A (sum_mesh 분모) vs 산식 B (parent_mesh only 분모) 는 **다른 양을 측정**. phobos 의 sum/parent 차이는 `2.772e9 / 2.717e9 = 1.020배` 뿐 (satellite mesh 가 작아서). 이는 1.71배 gap 을 설명 못 함.

**2차 정정 (잔여 1.74배 gap)**: 산식 B 정적 등가 (1.725x) vs runtime 실측 (0.99) 사이 여전히 **1.742배 gap 잔존**. deimos 도 동일 (산식 B 4.32x vs 실측 2.49 → 1.734배). 두 satellite 동일 ~1.74배 일관 → **단일 구조 원인**:

- **가설 1 (Floating Origin Tier scale)** — runtime `boundingSphere.radiusWorld` 는 Tier scaled (Floating Origin) 좌표계 값. mars_R 가 7.247 (Tier 1) ↔ 118118 (Tier 3) 16292배 점프 (#597 PR #603 §핵심 발견 #2) — Tier 전이 구간에서 parent radius 가 산식 SI 단위와 다른 스케일. `position.length()` 와 `radiusWorld` 가 동일 Tier 좌표계라면 비율은 보존되어야 하나, **mesh.scaling 적용 후 boundingSphere 갱신 시점 비대칭** (가설 2) 가 결합 가능
- **가설 2 (boundingSphere 갱신 시점) — 강한 출발점 (#611 전례)** — Babylon `boundingSphere.radiusWorld` 가 `mesh.scaling` 변경 후 즉시 재계산되지 않으면 parent radius 가 ~1.74배 inflated 로 읽힘 (satellite position 은 갱신, parent radius 는 stale). **#611 (satellite focus follow 한 프레임 lag) 이 정확히 같은 근본 원인** — `onBeforeRender` 시점에 mesh.position 은 이번 프레임 값으로 갱신됐으나 worldMatrix 미갱신 상태로 `mesh.absolutePosition` 을 읽어 한 프레임 lag 발생 → **`mesh.computeWorldMatrix(true)` 선행 호출로 해소** (`camera-controller.ts:114`, PR #612). 잔여 1.74배 gap forensic (Q3-1) 은 동일하게 `parent.computeWorldMatrix(true)` 후 `boundingSphere.radiusWorld` 를 읽는지 검증하는 것이 **강한 첫 출발점**. agy cross-validate 가 이 가설을 독립 제기 (합의)

#### 정정된 산식 SSoT (R6 박제 — R7+ 인계)

```
[정정 산식 — R6 SSoT, 두 metric 명시 분리]:

  설계 임계 (separation margin, 산식 A): visual_orbit / (parent_mesh + satellite_mesh)
    → orbit visual scale 박제값 선택 기준. ≥ 1.5x 임계.

  검증 metric (runtime 실측, 산식 B): satellite.position.length() / parent.boundingSphere.radiusWorld
    → D-T2 / browser-verify 측정. 산식 A 와 ~0.59배 (1/1.71) 관계 (Tier scale + boundingSphere 갱신 시점 보정 계수).

  ⚠️ 두 metric 은 서로 다른 양 — 직접 비교 금지. R5 §결정 4 의 "1.69x ↔ 0.99" mismatch 는
     metric 정의 불일치이며 산식 오류가 아니다 (R6 정정 결론).
```

**R6 정정 결론**: R5 §결정 4 산식 (1.69x) 은 **설계 임계 산식 (A) 으로서 정확**. 실측 0.99 는 **검증 metric (B) 으로서 정확**. 둘은 동일 물리량의 다른 측정이 아니라 **정의가 다른 두 양** — R5 §결정 4 Amendment 1 의 "산식 vs 실측 1.71배 gap" 은 **버그가 아닌 metric 정의 분리 미명시** 였음. R6 부터 두 metric 을 명시 분리하여 박제. **단, 잔여 1.74배 gap 의 runtime 정확 원인 (가설 1 vs 2)** 은 본 ADR 비-범위 (정적 분석으로 metric 정의 분리까지 확정, runtime 원인 확정은 후속 forensic — §재검토 트리거 #4 + 후속 분리 이슈).

#### jupiter-galilean orbit visual scale 산출 (정정 산식 A 적용 — **jupiterScale 48 재산출**)

> **PM Q2=B 임계 완화의 결합 효과 (위험 #3 핵심)**: jupiterScale 10→48 로 jupiter mesh radius 가 7.1492e8 m → **3.4316e9 m (4.8배 확대)**. 이는 io binding 마진을 **극적으로 악화** — 기존 ×6 에서 io 분리 마진이 0.63x (io 궤도가 jupiter mesh 안에 묻힘, 완전 엄폐). **orbit visual scale 을 6→16 으로 동반 상향 필수** (jupiter scale 상향의 결합 효과 — Claude 편향 "결합 간과" 셀프 체크 항목).

jupiter mesh radius (jupScale=48) = 7.1492e7 × 48 = **3.4316e9 m**. io 가 binding constraint (가장 가까운 궤도):

| body | 실측 orbit (m) | galilean mesh (scale=300, m) | jupiter+sat sum mesh (m) | sum/orbit (visual_scale=1 기준) |
|---|---|---|---|---|
| io | 4.2023e8 | 5.465e8 | 3.978e9 | **9.47x (binding — io 가 jupiter mesh 안에 깊이 묻힘)** |
| europa | 6.7131e8 | 4.682e8 | 3.900e9 | 5.81x |
| ganymede | 1.0711e9 | 7.902e8 | 4.222e9 | 3.94x |
| callisto | 1.8826e9 | 7.231e8 | 4.155e9 | 2.21x |

io binding (sum/orbit 9.47x) → visual_scale ≥ 9.47 × 1.5 ≈ **14.2** 필요 (≥ 1.5x 분리 마진, 산식 A). jupiterScale 48 로 binding 이 ×6→×16 영역으로 이동.

| visual_scale | io 분리 마진 (산식 A) | callisto 분리 마진 | 평가 |
|---|---|---|---|
| × 6 (architect 초안) | **0.63x (fail — io 가 jupiter mesh 안에 묻힘)** | 2.72x | jupiterScale 48 결합으로 io 완전 엄폐 — **기각** |
| × 14 | 1.48x (경계 미달) | 6.34x | io 마진 1.5 직전 |
| × 15 | 1.58x (통과) | 6.80x | io 마진 +0.08 |
| **× 16** | **1.69x (통과)** | **7.25x** | **선택 — io 마진 1.69x (R5 phobos 1.69x 정확 정합) + 단순 정수 + callisto 과도 회피** |
| × 18 | 1.90x | 8.16x | 보수 마진 |
| × 20 | 2.11x | 9.06x | callisto 9x 과도 (jupiter 에서 너무 멀어 보임 위험) |

#### 선택 — **`JUPITER_SATELLITES_ORBIT_VISUAL_SCALE = 16`** (jupiterScale 48 재산출 후 확정)

근거:
1. **io binding 분리 마진 1.69x (≥ 1.5 임계 +0.19)** — **R5 phobos 1.69x 와 정확 정합** (검증된 binding 마진 답습). jupiterScale 48 의 결합 효과로 binding 영역이 ×6→×16 으로 이동했으나 마진 자체는 R5 와 동일 보수성 유지
2. **callisto 자동 안전 7.25x** — io 가 binding, 나머지 3개 자동 안전. ×20 (callisto 9.06x) 대비 callisto 과도 분리 회피 (위험 #3 완화). 단일 룩업으로 4개 처리
3. **단일 룩업 `ORBIT_VISUAL_SCALE_BY_PARENT.jupiter`** — R4 earth / R5 mars 패턴 답습. satellite 4개 마진 편차 (io 1.69x ~ callisto 7.25x = 4.29배 편차) 가 R5 (phobos 1.69x ~ deimos 4.27x = 2.53배) 보다 큼 → **D-T2 에서 callisto 가 jupiter 에서 너무 멀어 보이면 `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 (Amendment, §재검토 트리거 #3)**
4. **실측 SSoT 보존** — `solar-system.json` orbit 무수정. rendering 시점에만 ×16
5. **명명**: `JUPITER_SATELLITES_ORBIT_VISUAL_SCALE` (R5 `MARS_SATELLITES_*` 답습 일관)

> **Concrete Prediction (정정 산식 검증 의무)**: developer 단계 + D-T2 에서 io 분리 마진을 **두 metric 모두 측정** — 산식 A (visual_orbit/sum_mesh ≈ 1.69x) + 산식 B (io.position.length()/jupiter.boundingSphere.radiusWorld). 산식 B 측정값이 산식 A 의 ~0.59배 (≈ 1.0x) 로 나오면 metric 정의 분리 가설 확정. 다르면 가설 1/2 runtime 원인 forensic 승격 (Q3-1 후속 분리).

---

### 축 5 — Q2=B 임계 박제 (jupiter, Q2=B 3번째 본 인스턴스화)

```
sun: ≤ 25%
mercury: ≤ 6%
venus: ≤ 11%
earth: ≤ 15%
moon: ≤ 4.5%
mars: ≤ 8% (R5)
phobos / deimos: N/A (R5 §결정 6)
jupiter: ≤ 10% (R6 거성 예외, 본 ADR §결정 5 — jupScale=48 산출 9.87%)
허용 오차: ± 2%
```

> **PM 정책 결정 (Q2=B 임계 완화 — 거성 예외)**: architect 초안은 visible-only 정책으로 jupiterScale=10 (px 비 2.06%) → 임계 ≤ 3% 를 제시했으나, **메인 오케스트레이터가 사용자와 합의하여 거성 예외 채택**. jupiter 는 가스 거성이므로 "지구보다 작게 보이는 것은 직관 위배" (agy 고유 발견 수용) → **jupiter Q2=B 임계를 사실 비율 (jupiter/sun=10.276%) 정합 ~10% 로 상향**.

| 후보 | jupiter 임계 | jupScale 산출 | margin | 평가 |
|---|---|---|---|---|
| architect 초안 ≤ 3% | ≤ 3% | jupScale=10 → 2.06% | 0.94% | **기각** — visible-only 우선이 거성 직관 위배 방치 |
| A. ≤ 9% | ≤ 9% | jupScale=44 → 9.04% | -0.04% (실패) | jupScale 48 산출 9.87% 위배 — 탈락 |
| **B. ≤ 10% (거성 예외)** | ≤ 10% | **jupScale=48 → 9.87%** | **0.13%** | **선택 — 사실 비율 10.276% 정합, ± 2% 안** |
| C. ≤ 11% | ≤ 11% | jupScale=50 → 10.28% | 0.72% | margin 풍부하나 px 비 10.28% > 10% (사실 비율 약간 초과) |

**선택**: **B. ≤ 10% (거성 예외)** (jupScale=48 산출 9.87% margin 0.13%).

#### 단조 패턴 검증 — **거성 예외로 inner planet 단조 깨짐 (명시 박제)**

```
sun (25%) ≫ earth (15%) > venus (11%) > [jupiter (10%) ← 거성 예외] > mars (8%) > mercury (6%) > moon (4.5%) > galilean (N/A)
```

**⚠️ Q2=B 단조 패턴이 깨진다 (거성 예외 — 명시 박제)**:

- **inner planet 거리순 단조**: mercury (6%) < venus (11%) < earth (15%) — 태양에서 멀수록 (실제 radius 증가) 임계 증가. R1~R5 의 일관 패턴.
- **jupiter 는 이 단조의 예외**: jupiter 임계 10% 는 venus(11%) 와 mars(8%) 사이에 위치 — **mars (R5 inner) 보다 크고 venus/earth 보다 작음**. inner planet 거리순으로는 jupiter (5.2 AU, 가장 먼 본체) 가 earth(15%) 보다 큰 임계를 가져야 단조이나, **jupiter 는 가스 거성이라 사실 비율 (sun 의 10.276%) 정합을 우선** — 거리순 단조와 직교.
- **거성 예외 근거 박제**: "거성 예외 — 사실 비율 정합 우선, inner planet 단조와 직교". jupiter 가 가스 거성으로서 inner planet 보다 (시각상) 작게 보이는 것이 사용자 직관 위배이므로, Q2=B 임계를 사실 비율로 묶는다. mercury/venus/earth/mars (inner planet) 는 거리순 단조를 유지하되, jupiter (및 R7+ saturn/uranus/neptune 거성) 는 사실 비율 정합 예외로 박제 (CLAUDE.md §데이터 SSoT 보존 + Visual Fidelity §1).

#### Q3 천장 정정 박제 (R5 인계 오독 정정)

**핵심 정정 (요구사항 6 Q3)**: R5 ADR §축 5 단조 패턴 검증 노트는 "jupiter (radius 6.991e7 m, sun 의 10% — 매우 큼) 진입 시 jupiter ≥ 100% → Q2=B 임계 SSoT 갱신 필요 (Q2=B 정책의 100% 천장 인스턴스화)" 로 인계했으나 **이는 오독**:
- jupiter radius = **7.1492e7 m = sun radius (6.957e8 m) 의 10.276%** — jupiter 는 sun px 비 100% 가 **불가능** (Q2=B 완화 후 scale 48 에서도 9.87%, sun 천장 25% 도달하려면 jupScale ≈ 122 필요)
- **Q2=B 정책의 sun 천장 (≤ 25%) 인스턴스화는 sun 자신에만 해당** — 다른 어떤 body 도 (가스 거성 jupiter 포함) sun 천장에 도달하지 못함 (모두 sun radius 의 10.3% 미만)
- R6 부터 이 사실 박제 — R7 saturn (sun 의 8.37%) 도 동일. **거성 예외는 "사실 비율 정합 임계 상향" 이지 "천장 도달" 이 아님** — 두 개념 명확 분리

---

### 축 6 — Q2=B 임계 미적용 정책 (galilean 4개, R5 §결정 6 답습)

galilean scale=300 시 sun 대비 px 비: io 1.57% / europa 1.35% / ganymede 2.27% / callisto 2.08%. io/europa 는 4px fallback 부분 의존 (mesh 3.3~3.9px). R5 phobos/deimos §결정 6 패턴 답습:

| 후보 | 방안 | 평가 |
|---|---|---|
| A. galilean Q2=B 임계 박제 | r1-guard 등록 (≤ 2.5%) | ganymede/callisto 는 mesh visible 이라 측정 가능하나 io/europa 4px fallback 흡수로 정밀도 mismatch |
| **B. galilean Q2=B 임계 N/A (r1-guard 미등록)** | R-Phase Allowlist + browser-verify-378-focus.mjs FOCUS_BODIES 매칭 가드로 회귀 가드 | **선택 — R5 phobos/deimos 패턴 답습 + io/europa fallback 흡수** |

#### 선택 — **후보 B: galilean Q2=B 임계 N/A** (architect 권고)

근거: R5 §결정 6 답습 + galilean 4개 중 io/europa 4px fallback 부분 의존 → 측정 정밀도 mismatch. ganymede/callisto 는 mesh visible 이나 4개 일관 정책 (단일 N/A) 으로 단순화. 회귀 가드는 R-Phase Allowlist (#613 자동) + FOCUS_BODIES 매칭 (#598) 으로 우회.

> **이견 가능성 (PM/cross-validate 검토)**: ganymede/callisto 는 mesh visible 이라 Q2=B 임계 박제가 가능. galilean 을 io/europa (N/A) vs ganymede/callisto (임계 박제) 로 분리하는 안도 존재 — 단 복잡도 증가. architect 권고는 단순 일관 N/A 이나 cross-validate 에서 재검토.

---

### 축 7 — R-Phase Allowlist + #613 자동 생성 (CURRENT_R_PHASE 1줄)

#### #613 메타데이터 SSoT 도입 효과 (R5 ADR 예측 대비 단축)

R5 ADR §결정 7 은 "R-Phase Allowlist 5곳 동시 박제 절차" + body id 직접 추가 (3줄) 로 인계했으나, #613 (ADR `20260604-613-r-phase-metadata-ssot.md`) 도입으로 **allowlist 자동 생성**:

```typescript
// packages/core/src/scene/r-phase-allowlist.ts (developer 단계 — 1줄만 변경)
export const CURRENT_R_PHASE = 6; // R5(5) → R6 — jupiter + galilean 4 자동 포함
// R_PHASE_BODY_ALLOWLIST 는 filterBodiesByPhase(bodies, 6) 자동 생성:
//   → ['sun','mercury','venus','earth','moon','mars','phobos','deimos','jupiter','io','europa','ganymede','callisto']
```

**5곳 동시 박제 절차 (#613 후 3곳으로 감소)**:
1. ~~(소멸) body id 추가~~ → `CURRENT_R_PHASE=6` 1줄 (R6 body 는 데이터에 introducedInRPhase=6 사전 부여)
2. 본 R6 ADR §축 7 cross-link
3. `browser-verify-378-focus.mjs` FOCUS_BODIES + `browser-verify-r-phase-allowlist.mjs` expected 갱신 (#598 정적 매칭 가드가 자동 생성값 ↔ 하드코딩 정합 차단)
4. CHANGELOG `### Behavior Changes` 박제
5. WASM sub-path 추가 금지 검증 (`scripts/verify-core-exports-immutable.sh`)

#### FOCUS_BODIES 갱신 (browser-verify-378-focus.mjs)

```javascript
// R5 baseline → R6 동기화 (#598 정적 매칭 가드 정합)
const FOCUS_BODIES = ['sun', 'mercury', 'venus', 'earth', 'moon', 'mars', 'phobos', 'deimos',
                      'jupiter', 'io', 'europa', 'ganymede', 'callisto'];
```

---

### 축 8 — Shortcut Bar + #617 showInShortcutBar SSoT (R5 인계 가정 무효화)

#### R5 ADR "11버튼 392px overflow" 인계 가정 검증 → #617 데이터가 이미 예방

R5 ADR §위험 #7 + 후속 인계 의무는 "R6 jupiter 추가 시 shortcut bar 11버튼 ≥ 392px > 375px overflow → horizontal scroll/2단 grid 재트리거" 로 인계했으나, 이는 **galilean 4개를 shortcut bar 에 추가한다는 전제**였음. #617 `showInShortcutBar` 메타데이터 실측:

| body | showInShortcutBar | shortcut bar 등록 |
|---|---|---|
| jupiter | **true** | ✅ (이미 FOCUS_BUTTONS 에 존재 — disabled, R6 진입 시 자동 enabled) |
| io / europa / ganymede / callisto | **false** | ❌ (bar 미등록 — R5 phobos/deimos Q4a=A 패턴 답습) |

**FOCUS_BUTTONS 변경 0줄** — jupiter 는 이미 배열에 존재 (`{ id: 'jupiter', label: '목성' }`), R6 진입 시 `isRPhaseFocusable('jupiter')` 가 true → 자동 enabled. galilean 4개는 `showInShortcutBar=false` 이므로 추가 금지 (#617 정적 매칭 가드 `r-phase-allowlist.test.ts` 가 FOCUS_BUTTONS ids ↔ showInShortcutBar 파생 정합 차단).

#### 모바일 너비 재산출 (#617 데이터 기준)

R5 baseline shortcut bar (FOCUS_BUTTONS 8 id 중 6 enabled + jupiter/neptune disabled = 8 버튼 표시) + reset + free-fly = **10 버튼 = 356px < 375px** (R5 §결정 8 박제). R6 진입 시 jupiter 가 disabled → enabled 로 전환될 뿐 **버튼 개수 불변** = 356px 안전 유지. **galilean 미등록으로 R5 인계 "11버튼 392px overflow" 는 발생하지 않음**.

> **R5 인계 의무 무효화 박제**: R5 ADR §후속 인계 의무 "shortcut bar 11버튼 392px overflow → horizontal scroll/2단 grid" 는 #617 데이터 (galilean showInShortcutBar=false) 로 **R6 에서 발생하지 않음**. 본 인계 의무는 종결 — 단 R-Phase 진행으로 enabled body 가 9개 (jupiter 후 saturn=R7 추가 시) 를 넘으면 재트리거 가능 (saturn 도 showInShortcutBar 데이터 확인 필요). PM 결정 Q2 (overflow 처리) 는 #617 데이터로 **R6 한정 비-이슈** — 단 R7+ 를 위한 정책 사전 결정은 PM 옵션으로 제시.

#### galilean 진입 경로 (사용자 mental model)

1. shortcut bar jupiter 클릭 → jupiter focus
2. jupiter focus 후 zoom-in → galilean 4개 mesh visible (visual_scale=6 적용 후 분리)
3. galilean mesh 클릭 → focus (hit-test)
4. URL override: `?focus=io` / `?focus=europa` / `?focus=ganymede` / `?focus=callisto`

---

## 결정 (Provisional — PM 합의 + cross-validate 후 Accepted 전이)

> 아래 §결정 1~8 은 **PM 합의 (Q1=A / Q2=B 임계 완화 / Q3=후속 분리) + cross-validate 후 확정**. Provisional → Accepted 전이 완료.

### 결정 1 — jupiterScale = 48 (축 1, PM Q2=B 임계 완화)

`BODY_SCALE.jupiter = 48` — sun 대비 px 비 **9.87%** (Q2=B 거성 예외 ≤ 10% margin 0.13%) + mesh visible 24.3px + mid LOD 안전. **PM 정책 결정: jupiter 가 가스 거성이므로 사실 비율 (jupiter/sun=10.276%) 정합 우선 — architect 초안 scale 10 (earth 보다 작게 보임) 기각.** **R5 인계 "jupiter ≥ 100% Q2=B 천장" 오독 정정** (jupiter = sun 의 10.28%, 천장 도달 불가).

### 결정 2 — galilean 4개 scale = 300 (축 2)

`BODY_SCALE.{io,europa,ganymede,callisto} = 300` — moon-class. io/europa 4px fallback / ganymede/callisto mesh visible. 단일값 단순성 + 사실 크기 순서 (ganymede>callisto>io>europa) mesh px 보존. **jupiterScale 48 (24.3px) ≫ galilean (3.3~5.6px) 로 시각 역전 자동 해소 — galilean 무리한 하향 불필요.**

### 결정 3 — galilean 시각 역전 자동 해소 (축 3) + galilean 미세 순서 D-T2 관찰

jupiterScale=48 + galileanScale=300 시 galilean 4개 모두 jupiter mesh 의 0.14~0.23배 — **시각 역전 (위성이 행성보다 큼) 완전 해소** (architect 초안 위험 #2 소멸). 단 io(3.87px)/europa(3.32px) 4px fallback 으로 4개 간 미세 순서가 묻히는지 D-T2 관찰. 미통과 시 galileanScale 400 상향 (4개 모두 mesh visible).

### 결정 4 — JUPITER_SATELLITES_ORBIT_VISUAL_SCALE = 16 (축 4, jupiterScale 48 재산출) + **R5 §결정 4 산식 정정**

`ORBIT_VISUAL_SCALE_BY_PARENT.jupiter = 16` — io binding 분리 마진 1.69x (R5 phobos 1.69x 정합). **jupiterScale 10→48 (mesh 4.8배) 결합 효과로 6→16 동반 상향 필수** (기존 ×6 은 io 마진 0.63x — io 가 jupiter mesh 안에 묻힘). **R5 §결정 4 Amendment 1 산식 정정 결론**: 산식 A (설계 임계, visual_orbit/sum_mesh) ↔ 산식 B (검증 metric, position.length/boundingSphere.radiusWorld) 는 정의가 다른 두 양 — R5 "1.69↔0.99 mismatch" 는 metric 정의 분리 미명시 (버그 아님). 잔여 1.74배 gap runtime 원인은 **#611 computeWorldMatrix(true) 전례 출발점** 으로 후속 forensic (Q3-1 후속 분리, 가설 2 강한 출발점).

### 결정 5 — Q2=B 임계 jupiter = 10% (축 5, 거성 예외)

`PX_RATIO_THRESHOLDS.jupiter = 0.10` — 산출 9.87% margin 0.13%. **거성 예외 — inner planet 거리순 단조 (mercury 6 < venus 11 < earth 15) 와 직교**: jupiter (10%) 는 venus(11%) 와 mars(8%) 사이에 위치, 사실 비율 정합 우선. **Q3 정정: Q2=B sun 천장 (25%) 인스턴스화는 sun 자신만 — jupiter 포함 어떤 body 도 sun 의 10.3% 미만이라 천장 도달 불가. 거성 예외 = 사실 비율 정합 임계 상향 ≠ 천장 도달.**

### 결정 6 — Q2=B 임계 미적용 (galilean 4개, 축 6)

galilean 4개 r1-guard `--measure-px-ratio` 미등록 (R5 phobos/deimos §결정 6 답습). 회귀 가드는 R-Phase Allowlist (#613) + FOCUS_BODIES 매칭 (#598).

### 결정 7 — CURRENT_R_PHASE = 6 (축 7, #613 자동 생성)

`CURRENT_R_PHASE = 6` 1줄 → R_PHASE_BODY_ALLOWLIST 자동 확장 (jupiter + galilean 4). FOCUS_BODIES 수동 동기화.

### 결정 8 — Shortcut Bar 변경 0줄 (축 8, #617 SSoT)

FOCUS_BUTTONS 변경 0줄 (jupiter 이미 존재 → 자동 enabled, galilean showInShortcutBar=false). **R5 인계 "11버튼 overflow" 무효화** (#617 데이터로 R6 비-이슈).

### Visual Fidelity §의무 체크리스트 4항목 (#541) 적용

- [x] **데이터 SSoT 보존** — `solar-system.json` jupiter/galilean radius, orbit 무수정. mesh radius 왜곡은 `body-scale.ts` rendering-only 상수. 궤도 거리 왜곡은 `orbit-visual-scale.ts` `JUPITER_SATELLITES_ORBIT_VISUAL_SCALE=16`
- [x] **rendering 시점 분리** — physics 엔진 (Rust+wasm) 이 BODY_SCALE / ORBIT_VISUAL_SCALE_BY_PARENT 무의존. developer 검증 의무
- [x] **UI overlay 실측값 표기** — CelestialInfoPanel jupiter (71,492 km) / galilean (io 1,822 km 등) 실측 radius 표기. mesh 왜곡값 표기 금지
- [x] **baseline 박제** — §결정 1~8 + 산출 (jupiter pxDiameter 24.3px / sun 대비 9.87% / galilean 300 / orbit visual scale 16 / io 분리 마진 1.69x). 모바일 누적 차단율 **8.95%** (R5 8.77% + jupiter 0.159% + galilean 0.023%, DoD 임계 25% margin 16.05%)

---

## 위험 / 미해결

### 위험 #1 — jupiter 거성 직관 mismatch (Q2=B 완화로 대폭 완화, 잔존 관찰)

- jupiter pxDiameter 24.3px (jupScale=48) ↔ 사실 jupiter/earth 11.21배. 시각상 jupiter 가 earth (36.1px) 보다 여전히 약간 **작아 보임** (0.67배) — 단 Q2=B 완화 전 (5.1px, 0.14배) 대비 mismatch 대폭 완화
- 완화: D-T2 사용자 검증. "jupiter 가 (거성치고) 여전히 작음" 보고 시 jupiterScale 48 → 52 (Q2=B 임계 ≤ 11% 동반 조정). §재검토 트리거 #1. **거성 예외 정책 자체의 사용자 수용 검증이 핵심**

### 위험 #2 — galilean ↔ jupiter 시각 역전 (Q2=B 완화로 자동 해소)

- ~~jupScale=10 (5.1px) 시 ganymede (5.60px) 가 jupiter mesh 초과~~ → **jupiterScale 48 (24.3px) 로 galilean 4개 모두 jupiter 의 0.14~0.23배 — 역전 자동 소멸**
- 잔존 관찰: io(3.87px)/europa(3.32px) 4px fallback billboard 진입 시 두 위성 미세 순서 (io>europa) 가 동일 크기로 묻힐 가능성
- 완화: D-T2 검증. galileanScale 400 상향 (4개 모두 mesh visible, jupiter 24.3px 대비 여전히 안전). §재검토 트리거 #2

### 위험 #3 — JUPITER_SATELLITES single 룩업 ↔ satellite 4개 마진 편차 (Q2=B 완화로 편차 확대)

- **jupiterScale 48 결합으로 편차 확대**: io 1.69x ~ callisto 7.25x = **4.29배 편차** (R5 phobos~deimos 2.53배 보다 큼, architect 초안 3.93배보다도 큼)
- callisto 가 jupiter 에서 너무 멀어 다른 위성처럼 보일 가능성 (jupiter mesh 4.8배 확대로 binding 영역 이동의 부산물)
- 완화: `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 (Amendment). §재검토 트리거 #3

### 위험 #4 — R5 §결정 4 산식 정정 잔여 gap (runtime 원인 미확정)

- 본 ADR §축 4 정정은 metric 정의 분리까지 확정 (정적 분석). 잔여 1.74배 gap 의 runtime 정확 원인 (가설 1 Tier scale vs 가설 2 boundingSphere 갱신) 미확정
- 완화: developer 단계 두 metric 동시 측정. 산식 B 측정값이 산식 A 의 ~0.59배면 metric 정의 분리 확정 / 다르면 forensic 승격. §재검토 트리거 #4 + 후속 분리 이슈

### 위험 #5 — galilean 4px fallback 부분 의존 (io/europa)

- io (3.87px) / europa (3.32px) 4px fallback 의존. ganymede/callisto mesh visible
- 4개 중 2개만 mesh visible → 시각 비균질 가능성
- 완화: D-T2 검증. galileanScale 상향 (300 → 400) 시 4개 모두 mesh visible (단 jupiter 대비 역전 위험 #2 강화). trade-off

### 위험 #6 — #613/#617 자동화 첫 R-Phase 실전 검증

- R6 가 #613 메타데이터 SSoT 도입 후 **첫 자동 생성 R-Phase 진입** (`CURRENT_R_PHASE=5→6`)
- 자동 생성 allowlist ↔ FOCUS_BODIES/FOCUS_BUTTONS 정적 매칭 가드 (#598/#617) 가 R6 진입에서 첫 실전 작동
- 완화: developer 단계 `pnpm test` 로 r-phase-allowlist.test.ts #613/#617 매칭 통과 확인 + browser-verify-r-phase-allowlist 실측

---

## 결과 / 재검토 조건

### 재검토 트리거 (Amendment 발동 조건)

1. **#1 (jupiter 거성 직관 mismatch 잔존)** — D-T2 "jupiter 거성치고 여전히 작음" → jupiterScale 48 → 52 (Q2=B 임계 ≤ 11% 동반) — Amendment 1. **거성 예외 정책 자체의 사용자 수용 검증**
2. **#2 (galilean 미세 순서 묻힘)** — D-T2 "galilean 4개 크기 구분 안 됨" (io/europa 4px fallback) → galileanScale 400 상향 (4개 모두 mesh visible) — Amendment
3. **#3 (callisto 분리 과도)** — D-T2 "callisto 가 너무 멀음" → `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 — Amendment
4. **#4 (산식 정정 runtime 원인)** — developer 두 metric 측정 결과 산식 A/B 관계 (~0.59배) 불일치 → forensic 승격 (Tier scale / boundingSphere 갱신 가설 확정) — 후속 분리 forensic ADR
5. **#5 (FOCUS_BODIES drift)** — browser-verify-378-focus.mjs galilean 누락 → 즉시 동기화
6. **#6 (#613/#617 자동화 회귀)** — r-phase-allowlist.test.ts 매칭 fail → 데이터 메타 ↔ 하드코딩 drift 수정

### Concrete Prediction (R5 ADR §Concrete Prediction "R6 ≤ 12 라인" 갱신 — 요구사항 7)

R5 ADR §Concrete Prediction 은 "R6 jupiter + 4 galilean 진입 시 ≤ 12 라인 (jupiter 3 + galilean 8 + ORBIT 1) + shortcut bar fallback ≥ 5줄" 로 예측했으나, **#613/#617 메타데이터 SSoT 도입으로 대폭 단축**:

| 항목 | R5 예측 | R6 실제 (architect) | 단축 사유 |
|---|---|---|---|
| BODY_SCALE | jupiter 1 + galilean 4 = 5 | **5** | 동일 |
| R_PHASE_BODY_ALLOWLIST | body id 5줄 | **1** (CURRENT_R_PHASE) | #613 자동 생성 |
| ORBIT_VISUAL_SCALE_BY_PARENT | 1 | **2** (상수 선언 1 + 룩업 1) | 동일 |
| FOCUS_BUTTONS / shortcut bar | ≥ 5 (overflow fallback) | **0** | #617 showInShortcutBar (jupiter 기존재, galilean false) |
| **코어 코드 합계** | **≤ 18** | **8 라인** | **#613/#617 로 10줄 절감** |

별도 카운트 (가드/테스트/문서): FOCUS_BODIES 5 + r1-guard jupiter 1 + body-scale.test 5 + r-phase-allowlist.test #617 expected 갱신 + CHANGELOG.

**갱신 박제**: R6 코어 코드 변경 = **8 라인** (R5 ADR 예측 ≤ 18 → #613/#617 자동화로 8 라인 — "신규 데이터 ≠ 신규 코드" + "신규 함수 ≠ 신규 구현" 동시 실증). **PM Q2=B 임계 완화 (jupiterScale 10→48 / orbit visual scale 6→16) 는 박제값만 변경 — 라인 수 불변 (8 라인 유지)**. R7 (saturn/titan) prediction: saturn 1 + titan 1 (BODY_SCALE) + CURRENT_R_PHASE 1 + ORBIT 2 = **~5 라인** (titan 단일 satellite 가정).

### Q2=B 임계 SSoT (R6 박제 후)

```
sun: ≤ 25% (천장 — sun 자신만 인스턴스화 가능)
earth: ≤ 15%
venus: ≤ 11%
jupiter: ≤ 10% (본 R6 박제 — 거성 예외, inner planet 단조와 직교)
mars: ≤ 8% (R5)
mercury: ≤ 6%
moon: ≤ 4.5%
phobos / deimos: N/A (R5 §결정 6)
io / europa / ganymede / callisto: N/A (§축 6)
R7+: R-Phase 진입 시 architect ADR 박제 (saturn sun 의 8.37% — 거성 예외 답습, 사실 비율 정합 상향 검토 / 천장 도달 불가 확정)
허용 오차: ± 2%

# 단조 분기 (R6 박제):
#   inner planet 거리순 단조: mercury(6) < venus(11) < earth(15)
#   거성 예외 (사실 비율 정합): jupiter(10) — venus 와 mars 사이, 거리순 단조와 직교
#   위성 (별도 정책): moon(4.5) / phobos·deimos·galilean N/A
```

---

## 메인 오케스트레이터 결정 항목 (PM 정책 — 합의 완료)

> 아래 Q1/Q2/Q3 PM 정책 결정 **완료** (2026-06-05, 메인 오케스트레이터가 사용자와 합의). 옵션 trade-off 와 PM 최종 선택을 함께 박제 (의사결정 trace).
>
> **PM 최종 결정 요약**:
> - **Q1 = A** (galilean 4개 전부 동시 진입)
> - **Q2 = B 임계 완화 (jupiter 가스 거성 예외)** — architect 초안 옵션 A/B/C (jupiterScale 10~15) 를 모두 **넘어서는 근본 결정**: jupiter Q2=B 임계를 sun 대비 ~10% 로 상향 (사실 비율 jupiter/sun=10.276% 정합) → jupiterScale=48. 거성 직관 위배 해소 (agy 고유 발견 수용). 아래 Q2 표의 옵션 B (jupiter=12) 는 역전만 해소하고 거성 직관은 미해결이라 **기각**
> - **Q3 = 후속 이슈 분리** — agy 고유 발견 3건 (잔여 gap forensic / DPR / occlusion) 을 R6 비목표로 두고 후속 분리

### Q1 — galilean 4개 전부 진입 vs 단계 분리

| 옵션 | 방안 | trade-off |
|---|---|---|
| **A. galilean 4개 전부 (jupiter + io/europa/ganymede/callisto)** | 단일 R6 PR. satellite 4개 첫 본 사례 | 검증 범위 큼 (4 satellite focus/hit-test/orbit). #613/#617 자동화 1회 진입 |
| B. 2단계 분리 (R6a jupiter 단독 → R6b galilean 4) | jupiter 먼저 visible → galilean 후속 | 점진 릴리스 리듬 (CLAUDE.md §Phase 분리). 단 #613 CURRENT_R_PHASE 가 R6 단일 값이라 galilean 도 데이터상 introducedInRPhase=6 → 단계 분리하려면 R6a=6 / R6b=6.5 등 메타데이터 재설계 필요 (복잡도) |
| C. jupiter + galilean 2개 (io/europa) → 나머지 후속 | 부분 진입 | introducedInRPhase 데이터 (galilean 전부 =6) 와 불일치 — 데이터 재부여 필요 |

**architect 권고**: **A (전부)** — #613 데이터가 galilean 4개 모두 introducedInRPhase=6 으로 사전 부여됨. 단계 분리는 메타데이터 재설계 비용 발생. satellite 4개라도 단일 룩업 (§축 4) + 자동 생성으로 코드 8줄 — 검증 부담은 D-T2 4 satellite 시각 확인뿐.

### Q2 — galilean 사실 비율 mismatch (ganymede/callisto ↔ jupiter 시각 역전) 처리 (축 3 직결)

| 옵션 | 방안 | trade-off |
|---|---|---|
| A. jupiter=10 / galilean=300 (architect 초안) + D-T2 관찰 | 기본 권고. D-T2 에서 역전 보고 시 Amendment | visible-only 일관. 단 ganymede(5.60px) > jupiter(5.1px) 역전 위험 + 거성 직관 위배 잔존 |
| B. jupiter=12~15 상향 (galilean 대비 우위 회복) | jupiter mesh 6.1~7.6px → galilean 우위 | Q2=B 임계 ≤ 3% 재조정 필요. **역전만 해소, 거성 직관 미해결 (jupiter 6.1px vs earth 36.1px = 0.17배)** |
| C. galilean=200 하향 (moon 답습) | galilean 모두 4px fallback (2.2~3.7px) → jupiter 우위 | galilean 가시성 약화. 거성 직관 미해결 |
| **★ D. PM 채택 — Q2=B 임계 완화 (jupiter=48, galilean=300 유지)** | **jupiter Q2=B 임계 ≤ 10% 거성 예외 → jupiterScale 48 (24.3px)** | **거성 직관 + 역전 동시 해소 (jupiter 24.3px ≫ ganymede 5.60px, earth 36.1px 의 0.67배). 단조 깨짐 (거성 예외) + orbit visual scale 6→16 동반 + agy 안 (옵션 B) 기각** |

**PM 최종 결정**: **D (Q2=B 임계 완화)** — architect 초안 A 및 agy 권고 B/C 를 모두 **넘어서는 근본 결정**. 사용자가 "목성이 지구보다 작게 보이는 것은 가스 거성 직관 위배" 라는 agy 고유 발견을 받아들여, jupiter Q2=B 임계를 사실 비율 (10.276%) 정합 ~10% 로 상향 (jupiterScale=48). 옵션 B (jupiter=12) 는 ganymede ↔ jupiter 역전만 해소하고 jupiter 가 여전히 earth 의 0.17배라 거성 직관 미해결 → 기각.

### Q3 — Q2=B 100% 천장 정책 (R5 인계 오독 정정 확인)

| 옵션 | 방안 | trade-off |
|---|---|---|
| **A. Q2=B 천장 인스턴스화 = sun 자신만 (R6 정정 박제)** | jupiter (sun 의 10.28%) 포함 어떤 body 도 sun 천장 도달 불가 확정 | R5 인계 "jupiter ≥ 100% Q2=B 천장" 오독 정정. 사실 정합 (jupiter radius < sun 의 11%) |
| B. R5 인계대로 jupiter 천장 인스턴스화 검토 | jupiter scale 을 sun 천장(25%) 까지 키움 (jupScale ≈ 122) | **사실 위배 + 화면 압도** — jupiter 가 sun 의 절반 크기로 보임 (비현실적). 거부 권고 |

**architect 권고**: **A (sun 자신만 천장)** — R5 인계 §축 5 노트 "jupiter radius 6.991e7 m, sun 의 10%" 는 정확했으나 결론 "jupiter ≥ 100% → 천장 인스턴스화" 가 비논리 (10% body 가 100% px 비 불가). jupiter 는 visible-only scale 에서 sun 의 2~3%. **천장 정책은 sun 단독** 박제 + R7+ (saturn 8.37% 등) 도 동일.

---

## 교차검증 반영 사항

> cross-validate 2026-06-05 (Antigravity `agy`, outcome=applied) 1회 호출 + 결과 본문 통합 완료. 아래 5축 분류 (CLAUDE.md §교차검증 SSoT). 본 섹션 통합으로 ADR 상태 Provisional → **Accepted** 전이.

### Claude 편향 셀프 체크 (cross-validate 호출 전 사전 기록 — CLAUDE.md §교차검증)

- **낙관적 일정** — R6 코드 8줄 (#613/#617 자동화) 이나 satellite 4개 D-T2 + Amendment 라운드 N≥1 예상 박제. 통과
- **결합 간과** — jupiter ↔ galilean 4 결합 (parent-satellite × 4) + io binding constraint + **Q2=B 임계 완화 (jupiterScale 10→48) 의 결합 효과 명시 (orbit visual scale 6→16 동반 상향, 모바일 누적 차단율 재산출)** + #613/#617 자동화 첫 실전 (위험 #6) 명시. **본 라운드 핵심 — jupiter scale 변경이 io binding 마진 (0.63x 묻힘) 과 모바일 disk area (23배 증가) 에 결합 전파됨을 명시 질문으로 agy 에 삽입.** 통과
- **폐기 프레이밍** — R5 §결정 4 산식 "정정" 이 산식 폐기가 아닌 metric 정의 분리 명시임을 명확화 (산식 A 보존). 통과
- **순수주의** — jupiter 사실 비율 (11.21배) 순수 보존이 아닌 **거성 직관 (사용자 인지) 우선** 으로 Q2=B 임계 완화. Visual Fidelity §1 (데이터 SSoT 보존 + rendering 왜곡 허용) 정합. 통과

### 합의 (Claude 설계와 일치 — 현재 PR 즉시 반영)

1. **galilean 시각 역전 (Q2=B 완화로 해소)** — agy 가 jupiterScale 상향으로 galilean ↔ jupiter 역전이 해소됨을 합의. jupiterScale 48 (24.3px) ≫ ganymede (5.60px) 자동 해소 박제 (§축 3).
2. **§결정 4 산식 정정 "설계 임계 A vs 검증 metric B 정의 분리"** — agy "우수" 평가 (산식 폐기가 아닌 metric 정의 분리 명시 접근). §축 4 산식 A/B 분리 SSoT 유지.
3. **메타데이터 SSoT data-driven (#613/#617)** — agy "우수" 평가 (`CURRENT_R_PHASE` 1줄 자동 전파 + showInShortcutBar 데이터 구동). §축 7/8 유지.

### 이견 수용 (Claude 원안과 다르나 외부 근거 합리 — 수정)

- **agy: jupiter scale 상향 시 io binding 마진 재산출 필요** — agy 가 "jupiter mesh 확대가 orbit visual scale 에 결합 전파됨" 을 지적. Claude 가 PM Q2=B 완화 반영 시 이미 io 마진 0.63x (묻힘) 을 발견하여 orbit visual scale 6→16 동반 상향에 반영 (§축 4). agy 지적과 합치 — 결합 간과 셀프 체크 항목으로 사전 박제됨.

### Claude 재분석으로 기각한 외부 모델 제안 (맹목 수용 회피 — volt #51)

1. **agy: Alternative C (jupiter=12 + galilean=250)** — agy 는 역전 해소를 위해 jupiter=12 / galilean=250 (architect 초안 변형) 을 권고. **기각** — agy 안은 ganymede(5.60px) ↔ jupiter(6.1px) 역전만 해소하고 **거성 직관 (jupiter 가 earth 보다 작게 보임) 은 미해결**. 메인+사용자는 더 근본적인 **Q2=B 임계 완화 (jupiter ~10% 사실 비율 정합)** 를 채택 — jupiterScale=48 (24.3px) 로 거성 직관 + 역전 동시 해소. agy 안 (jupiter 12, 6.1px) 은 여전히 earth(36.1px) 의 0.17배라 거성 직관 위배 잔존.
2. **agy: browser-verify-378-focus.mjs 하드코딩 bypass 위험 (⑤)** — agy 가 FOCUS_BODIES 하드코딩이 자동 생성 allowlist 와 drift 할 위험을 제기. **기각 (기존 가드로 해소)** — `r-phase-allowlist.test.ts` #598 정적 매칭 가드 (line 146~156) 가 `FOCUS_BODIES === R_PHASE_BODY_ALLOWLIST` 를 CI fail-fast 로 차단 (실측 확인). 이미 커버되므로 후속 분리 불필요.

### 고유 발견 (범위 밖 — 후속 이슈 분리)

agy 고유 발견 3건을 R6 본 스프린트 비목표로 판정, 메인 오케스트레이터가 후속 이슈 생성 완료 (Q3, 2026-06-05):

1. **Q3-1: 잔여 1.74배 gap forensic** ([#622](https://github.com/coseo12/astro-simulator/issues/622), priority:low) — §축 4 산식 A/B 분리 후 잔여 gap 의 runtime 원인 (Tier scale vs boundingSphere 갱신). **agy 가 boundingSphere `computeWorldMatrix(true)` 갱신 타이밍으로 가설화 — #611 satellite follow lag 을 정확히 같은 `computeWorldMatrix(true)` 방식으로 고친 전례가 강한 출발점** (§축 4 가설 2 박제). §재검토 트리거 #4.
2. **Q3-2: DPR(Retina) 4px fallback physical/logical pixel 명시** ([#623](https://github.com/coseo12/astro-simulator/issues/623), priority:low) — 4px fallback 임계가 physical pixel 인지 logical(CSS) pixel 인지 명시 부재. Retina (DPR 2~3) 에서 fallback 진입 경계가 달라질 수 있음.
3. **Q3-3: galilean occlusion/raycast hit-test 엣지** ([#624](https://github.com/coseo12/astro-simulator/issues/624), priority:medium) — galilean 4개 일직선 겹침 / jupiter 뒤 엄폐 시 raycast 선택 불가. satellite 4개 첫 본 사례라 hit-test 엣지 미검증.

**⑤ (browser-verify-378-focus.mjs bypass)**: 위 §기각 2 참조 — **기존 #598 정적 매칭 가드로 해소** (후속 분리 불필요).
