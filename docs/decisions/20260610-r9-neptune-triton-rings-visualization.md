# ADR: R9 해왕성 + 고리 + 트리톤 시각화 — ice giant 정책 2번째 인스턴스 (neptune=250 답습) + ring·tilt 이중 코드 0 검증 (R8 인프라) + 역행 위성 첫 사례 (triton, 태양계 유일 대형 역행 위성)

- **상태**: **Accepted (cross-validate 2026-06-10 agy outcome=applied)** — §교차검증 반영 사항 통합 완료 (Horizons Epoch 의무 수용 + PX_RATIO 대체 가드 부분 반려 + arcs 안내 후속 분리)
- **날짜**: 2026-06-10
- **결정자**: architect (R9 PM 합의 라운드 완료 — Q1=A: neptune + rings + triton 1개 동시, **triton 역행 궤도는 사실 그대로 — D-T2 버그 오인 선제 등록** / Q2=Adams ring arcs 각도 비균질의 **균질 근사 수용** — 후속 인프라 비-범위. 메인 오케스트레이터가 사용자와 합의 2026-06-10. **PM 합의 그대로 박제 — 재구조화 금지**)
- **관련**: [#653](https://github.com/coseo12/astro-simulator/issues/653) (R9 본 스프린트), [`20260610-r8-uranus-titania-rings-visualization.md`](20260610-r8-uranus-titania-rings-visualization.md) (R8 SSoT — §R9 인계 7건 + Amendment 1 을 본 ADR 이 전부 이행), [`20260610-r7-saturn-titan-rings-visualization.md`](20260610-r7-saturn-titan-rings-visualization.md) (composite 이전 단계 — ring outer binding 유형 신설), [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) (거성 예외 + guard 이원화), [`20260606-627-satellite-orbit-structure-forensic.md`](20260606-627-satellite-orbit-structure-forensic.md) (satellite 궤도선 일반화 — triton 자동 확장), [`20260609-622-orbit-scale-gap-no-op.md`](20260609-622-orbit-scale-gap-no-op.md) (산식 A/B 측정-정의 분리), [`20260604-613-r-phase-metadata-ssot.md`](20260604-613-r-phase-metadata-ssot.md) (CURRENT_R_PHASE 1줄 자동 전파), [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541 의무 체크리스트 4항목)
- **교훈 적용**:
  - "신규 데이터 ≠ 신규 코드" — **R8 §Concrete Prediction "R9 ring 축 + tilt 축 이중 코드 0" 예측의 재현 검증이 본 ADR 의 핵심 산출물** (§Concrete Prediction). axialTiltDeg 스키마 (loader:124) + densityProfile `.max(16)` (loader:39) + ring generic 결합 경로 전부 기존재 실측 — neptune 은 데이터만
  - "이슈 전제 코드 전수 확인" (#624 NO-OP 교훈) — inclination > 90° 궤도는 **titania (97.76°) 가 이미 R8 에서 렌더 검증** — triton ~157° 는 신규 코드 경로 0. 역행의 시각 발현은 궤도선 평면이 아닌 **공전 애니메이션 방향** (§축 3 사전 등록)
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74)) — triton 역행 (다른 모든 body 와 공전 방향 반대) + Adams arcs 균질 근사를 **사전 등록** (§위험 #1/#3 — D-T2 "버그?" 오인 방지, PM Q1/Q2 합의 사항)
  - "수치 DoD 미달 시 측정 방법 검증 우선" (volt [#32](https://github.com/coseo12/volt/issues/32)) — neptune 30.07 AU 는 uranus (19.19 AU, 실측 ×0.41 축소 — R8 Amendment 1 ①) 보다 깊은 depth. px-ratio 임계는 R8 결정 트리 (실측 ×1.05 / N/A fallback) 답습 (§축 1)

---

## 현재 유효 결정 요약 (Living ADR Executive Summary)

> **PM 정책 결정 확정 (2026-06-10, 사용자 권장안 승인 — 그대로 박제)**: Q1=A (neptune + rings + **triton** 1개 동시 — R7/R8 패턴. triton **역행 궤도 (inclination ~157°, 태양계 유일 대형 역행 위성) 는 사실 그대로 표현** — D-T2 버그 오인 선제 등록) / Q2=Adams ring arcs (각도 방향 비균질 — Liberté/Égalité/Fraternité/Courage) **균질 근사 수용** — 현 shader 는 방사 density 만, 각도 방향 인프라는 후속 비-범위 (R8 인계 #2 예고 이행).

### 핵심 박제값 표

| 항목                                                                             | 박제값                                                                  | 위치                                                          | 비고                                                                                                                                                                                                                                                                 |
| -------------------------------------------------------------------------------- | ----------------------------------------------------------------------- | ------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BODY_SCALE.neptune`                                                             | **250**                                                                 | `apps/web/src/constants/body-scale.ts`                        | §축 1 — **ice giant 정책 2번째 인스턴스 (uranus=250 답습)**. px 43.84 / sunPxRatio 식 17.80% / neptune/uranus px 비 0.969 (**사실 서열 자동 보존** — R5 mars=earth / R7 saturn=jupiter 동형) / neptune/earth 1.21                                                    |
| `BODY_SCALE.triton`                                                              | **300**                                                                 | `apps/web/src/constants/body-scale.ts`                        | §축 3 — triton/neptune mesh 비 0.0656 (moon/earth 0.068 근접 — 수렴대 0.05~0.09). titania=500 답습은 비 0.109 상한 초과 기각 (**비율이 SSoT, scale 값 답습 아님**). mesh 2.87 px → 4px fallback billboard 의존                                                       |
| `solar-system.json` triton body                                                  | 신규 (§축 3 데이터 표)                                                  | `packages/shared/data/solar-system.json`                      | mass 2.139e22 / radius 1.3534e6 m / a=2.37142e-3 AU (354,759 km) / parentId=neptune / introducedInRPhase=9 / showInShortcutBar=false. dev 단계 JPL Horizons **Neptune-centric J2000 Ecliptic** 쿼리 의무 — **inclination > 90° (역행) 확인 의무** (§축 3 frame 주의) |
| `solar-system.json` neptune.rings                                                | 신규 **1 composite layer** (41,000~62,930 km — §축 2 데이터 표)         | `packages/shared/data/solar-system.json`                      | 5 rings (Galle / Le Verrier / Lassell / Arago / Adams) 를 densityProfile **12점** 피크로 합성 (R8 composite 패턴 답습, zod max(16) margin 4점). Adams arcs 균질 근사 (PM Q2)                                                                                         |
| `solar-system.json` neptune `axialTiltDeg`                                       | **28.32** (NASA obliquity to orbit)                                     | `solar-system.json` (데이터 1값)                              | §축 2 — **R8 tilt 인프라 재사용, 코드 0** (R8 §Concrete Prediction R9 예측 검증 대상). saturn 26.73° 와 유사한 평범한 타원 ring                                                                                                                                      |
| neptune `ringAlphaHint`                                                          | **0.7**                                                                 | `solar-system.json`                                           | §축 2 — dusty 어두운 고리 (광학 깊이 Adams ~0.01 대 — saturn 의 1/100). jupiter 0.15 / uranus 0.8 사이 — 가시 우선이되 R8 showcase (세로 고리) 보다 한 단계 낮춤                                                                                                     |
| neptune ring layer `colorHint`                                                   | `#6F635A` (observed — dark reddish gray)                                | `solar-system.json`                                           | §축 2 — 먼지 지배 고리의 붉은 기 회색. R7/R8 스키마 재사용, 코드 0                                                                                                                                                                                                   |
| `NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE` + `ORBIT_VISUAL_SCALE_BY_PARENT.neptune` | **75**                                                                  | `packages/core/src/scene/orbit-visual-scale.ts`               | §축 4 — binding = **ring outer mesh (Adams 62,930 km — 3번째 인스턴스)**. triton 분리 마진 산식 A **1.65x** (≥ 1.5 통과 +0.15). **×50 (uranus 답습) 은 마진 1.10 함정값** — Adams ring 이 행성 반경의 2.541배까지 확장 (uranus ε 2.001배 대비 큼)                    |
| `PX_RATIO_THRESHOLDS.neptune`                                                    | **구현 실측 ×1.05 박제 / 측정 불안정 시 N/A** (R8 §축 1 결정 트리 답습) | `apps/web/scripts/r1-ui-regression-guard.mjs`                 | 정책 식 17.80%. 30.07 AU — uranus (실측 7.52%, 식 대비 ×0.41 축소 — R8 Amendment 1 ①) 보다 깊은 depth 로 추가 축소 예상. ⚠️ 퍼센트 정수 표기                                                                                                                         |
| `PX_RATIO_THRESHOLDS.triton`                                                     | **N/A** (4px fallback 의존)                                             | r1-guard 미박제                                               | §축 3 — titania/titan/galilean 답습                                                                                                                                                                                                                                  |
| `CURRENT_R_PHASE`                                                                | **8 → 9** (1줄)                                                         | `packages/core/src/scene/r-phase-allowlist.ts`                | #613 자동 생성 5번째 실전 — allowlist `[...R8, neptune, triton]` 자동 확장                                                                                                                                                                                           |
| `FOCUS_BUTTONS` / neptune `showInShortcutBar`                                    | **변경 0** (Concrete Prediction)                                        | —                                                             | §축 5 — neptune 은 FOCUS_BUTTONS 기존재 (R-Phase disabled) + showInShortcutBar **이미 true** (실측) → CURRENT_R_PHASE=9 1줄로 자동 enabled (#613 Concrete Prediction — R8 인계 #5). triton 은 showInShortcutBar=false (galilean/titan/titania 패턴)                  |
| `FOCUS_BODIES` (browser-verify-378-focus.mjs) + r1-guard `targetIds`             | `[...R8 17 body, neptune, triton]` = 19 body 수동 동기화                | `browser-verify-378-focus.mjs` / `r1-ui-regression-guard.mjs` | #598 / #619 정적 매칭 가드 차단 회피                                                                                                                                                                                                                                 |
| 모바일 diskArea baseline                                                         | **R8 재실측 16.82% 기준** 산출 (§점유율)                                | r1-guard                                                      | R8 인계 #7 — 22.96% 구버전 수치 사용 금지. 보수 상한 ≈ 19.3% ≤ 25% (neptune 모바일 off-screen 시 16.82% 유지 예상)                                                                                                                                                   |

### 핵심 결정 요약

1. **neptuneScale=250 — ice giant 정책 답습 (2번째 인스턴스, 후보 비교는 답습 근거 확인 수준)** (§축 1): neptune radius = uranus 의 0.969배 → 동일값 250 답습 시 px 43.84 < uranus 45.24 — **사실 서열 자동 보존** (R5 mars=earth=800 / R7 saturn=jupiter=48 동형 패턴 3번째). "ice giant = 250" 단일 mental model 완성
2. **neptune.rings = 1 composite layer + densityProfile 12점** (§축 2): 5 rings 전부 narrow/faint (Adams 폭 ~35 km — 화면 0.04 px) → R8 §축 2b composite 패턴 답습. Galle/Lassell 의 broad faint band (폭 2,000/4,000 km) 는 baseline 0.15 대역으로, Le Verrier/Arago/Adams narrow 는 피크로 표현. **Adams arcs 균질 근사 (PM Q2)** — 방사 densityProfile 은 각도 방향 표현 불가, 후속 인프라 비-범위
3. **tilt = 데이터 1값 (axialTiltDeg 28.32) — R8 인프라 재사용 코드 0** (§축 2): R8 이 3경로 (shader/fallback/placeholder) threading 을 완료 — neptune 은 zod optional 스키마에 값만 추가. **ring 축 + tilt 축 이중 코드 0 적중이 R8 tilt 추상화 건강성의 구체 증거** (R8 §Concrete Prediction R9 예측)
4. **tritonScale=300** (§축 3): triton/neptune mesh 비 0.0656 — moon/earth 0.068 근접 (수렴대 0.05~0.09). titania 의 scale 값 (500) 이 아닌 **비율 산출 방법론이 SSoT** — triton radius (1,353.4 km) 가 titania (788.4 km) 의 1.72배라 더 작은 scale 로 동일 비율대 도달
5. **triton 역행 궤도 사실 그대로 — D-T2 오인 선제 등록** (§축 3 + §위험 #1, PM Q1): inclination > 90° 렌더 경로는 titania (97.76°) 로 기검증 — 신규 코드 0. 역행의 시각 발현은 **공전 애니메이션 방향 반전** (궤도선 자체는 폐곡선이라 정적 차이 없음). frame 주의: NASA "157°" 는 Neptune 적도면 기준 — Horizons ecliptic osculating 값은 다를 수 있으나 (~130° 가능) **> 90° (역행) 은 frame 무관 보존**
6. **NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE=75** (§축 4): binding = ring outer mesh (1.57325e10 m — neptune mesh 의 2.541배, R7/R8 유형 3번째). 마진 1.65x. **×50 (uranus 답습) 은 1.10 함정값** — Adams ring 의 상대 확장 (2.541 vs uranus ε 2.001) 이 더 커서 visual scale 동반 상향 필요
7. **shortcut bar 변경 0** (§축 5): neptune showInShortcutBar 이미 true + FOCUS_BUTTONS 기존재 — CURRENT_R_PHASE=9 1줄 자동 enabled (#613 Concrete Prediction, R8 인계 #5 이행)

### 비-범위 (R9)

- **Adams ring arcs 각도 비균질** (Liberté / Égalité 1·2 / Fraternité / Courage) ❌ — 방사 densityProfile shader 한계. 균질 환형 근사 (PM Q2 합의). 각도 방향 density 인프라는 후속 분리
- nereid / proteus / larissa 등 neptune 추가 위성 ❌ (triton 만 — PM Q1)
- triton 궤도 세차 (Laplace plane 세차 주기 ~688년) ❌ — osculating elements 고정 (전 body 동일 정책)
- 본체 mesh 자전/텍스처 ❌ — R8 동일 (tilt 는 ring 한정)
- ring tilt 방위각 (pole RA/Dec) 정밀 표현 ❌ — `rotation.x` 축 고정 근사 (R8 §위험 #6 답습)
- R10 body (왜소행성/혜성 — introducedInRPhase=10 기박제 8 body) 진입 ❌
- 실측 데이터 변경 ❌ — neptune 기존 필드 (radius/mass/orbit) 무수정. 신규 추가만 (triton body / neptune.rings / axialTiltDeg / ringAlphaHint)
- LOD 시스템 변경 ❌ (R4 Amendment 3 보존)

---

## 배경

### Roadmap v3 §R9 진입 조건 + R8 인계 이행 (7건 + Amendment 1)

[`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) — R9 = R8 + 해왕성 (**로드맵 마지막 행성**). R8 ADR §R9 인계 7건을 본 ADR 이 전부 이행:

1. **ice giant 정책 답습 (neptuneScale=250)** — §축 1 (px 43.8 — 인계 참고치 그대로 재현 확인, 사실 서열 자동 보존)
2. **ring 축 + tilt 축 이중 코드 0 예측** — §Concrete Prediction (3연속 검증 — R7 saturn 데이터 / R8 uranus 데이터+tilt 인프라 / R9 neptune 데이터만)
3. **composite layer 패턴 재사용** — §축 2 (Galle/Le Verrier/Lassell/Arago/Adams)
4. **triton 역행** — §축 3 (Horizons Neptune-centric J2000 Ecliptic 의무 + scale 수렴대 0.05~0.09 산출)
5. **shortcut bar 변경 0** — §축 5 (#613 Concrete Prediction)
6. **satellite N≥5 단일 룩업 한계** — triton 단일 satellite 라 미발동. R10+ 인계 유지 (단 R10 은 위성 0 — §R10 인계 #6)
7. **모바일 diskArea baseline = R8 재실측 16.82%** — §점유율 (22.96% 구버전 금지)

R8 Amendment 1 반영: ① px-ratio 임계 결정 트리에서 uranus 실측이 **축소 방향** (×0.41) 이었음 — neptune 예상 방향 갱신 (§축 1) ② 모바일 baseline 16.82% (§점유율) ③ tilt threading 은 R8 1회 비용 완료 — R9 tilt 0 예측 유지 ④ triton 의 time-reversal 테스트 제외 검토 의무 (titania 8.71d 제외 선례 — triton 5.877d 더 짧아 제외 예상, dev 실측)

### 현재 baseline 실측 (2026-06-10 develop tip = `7c464de`)

- `BODY_SCALE`: sun 50 / mercury 700 / venus 800 / earth·moon·mars 800 / phobos·deimos 5000 / jupiter·saturn 48 / galilean·titan 100 / **uranus 250 / titania 500**
- `ORBIT_VISUAL_SCALE_BY_PARENT`: earth 30 / mars 500 / jupiter 16 / saturn 10 / uranus 50
- `CURRENT_R_PHASE = 8`
- `solar-system.json` 실측: **neptune 기존재** (radius 2.4764e7 equatorial / mass 1.02413e26 / a 30.06992276 AU / introducedInRPhase=9 / **showInShortcutBar=true 이미** / rings·axialTiltDeg 없음). **triton 부재 — R9 유일 신규 body**
- `FOCUS_BUTTONS`: 10 id (sun~uranus + **neptune 기존재** — "R-Phase Allowlist disabled" 주석, R9 진입 전 negative 케이스)
- **tilt/ring 인프라 실측 (#624 교훈 — 이슈 전제 코드 전수 확인)**: `axialTiltDeg: z.number().min(0).max(180).optional()` (solar-system-loader.ts:124) + `densityProfile ... .max(16)` (loader:39, R8 agy 수용 ①) + rings generic 결합 경로 (solar-system-scene.ts — uranus 추가 시 코드 0 적중 실증, R8 Amendment 1 ③) **전부 기존재** — neptune rings+tilt 는 구조적으로 데이터만
- **r1-guard 실측**: `PX_RATIO_THRESHOLDS` = mercury 4.95 / venus 14.26 / earth 17 / moon 5.0 / mars 8 / jupiter 16.3 / saturn 59.7 / **uranus 7.9**. `targetIds` 17 body (neptune/triton 부재). 모바일 off-screen 제외 baseline **16.82%** (R8 Amendment 1 ②)

### 데이터 사실 비율 (NASA Planetary Fact Sheet / JPL Ring-Moon Systems Node / JPL Horizons)

| 항목                  | 값                                              | 비고                                                                                                                                                                |
| --------------------- | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| neptune radius        | 2.4764e7 m (equatorial)                         | uranus 의 **0.969배** (ice giant 동급) / earth 의 3.883배 / sun 의 3.56%                                                                                            |
| neptune 자전축 기울기 | **28.32°** (obliquity to orbit)                 | saturn 26.73° 와 유사 — 평범한 타원 ring (R8 세로 고리 대비)                                                                                                        |
| triton mass / radius  | 2.139e22 kg / 1.3534e6 m (1,353.4 km)           | moon 의 0.779배 / titania 의 1.72배 — 태양계 7위                                                                                                                    |
| triton orbit a        | 3.54759e8 m = 354,759 km = **2.37142e-3 AU**    | titania (435,910 km) 의 0.814배. e ≈ 0.000016 (사실상 원궤도 — 태양계 대형 위성 중 최소)                                                                            |
| triton inclination    | **~157°** (Neptune 적도면 기준 NASA — **역행**) | **태양계 유일 대형 역행 위성** (포획 기원 가설). Horizons ecliptic osculating 값은 상이 가능 (~130° 대) — **> 90° (역행) 은 frame 무관**. dev 쿼리로 박제           |
| neptune rings 범위    | 41,000 (Galle inner) ~ 62,930 km (Adams)        | neptune 반경의 **1.656 ~ 2.541배** (uranus ε 2.001배 초과 — orbit binding 영향 §축 4). Galle 폭 2,000 / Le Verrier ~113 / Lassell 4,000 / Arago <100 / Adams ~35 km |
| triton 공전 주기      | 5.877 d (역행)                                  | titania 8.71d 보다 짧음 — time-reversal 테스트 제외 예상 (R8 Amendment 1 ④ 선례)                                                                                    |

### 산출식 (R1~R8 동일)

```
px_diameter (1280×720) = body.radius × scale × k,  k = 7.0806e-9
sunPxRatio(body) = (body.radius × scale) / 3.4785e10
neptune: 2.4764e7 × 250 → pxDiameter 43.84 px / sunPxRatio 17.80% / neptune/uranus 0.969 / neptune/earth 1.21
triton:  1.3534e6 × 300 → pxDiameter 2.87 px (sub-4px → billboard fallback)
```

---

## 축별 설계

### 축 1 — `BODY_SCALE.neptune` (ice giant 정책 답습 — R8 인계 #1, 후보 비교는 답습 근거 확인 수준)

R8 §축 1 이 ice giant 정책 (3번째 scale 그룹 — 사실 비율 명시 위배 + earth 직관 우선) 을 신설 — R9 는 **신규 정책 판단 없이 동일값 답습**이 정합인지 확인만 수행:

| 후보                         | scale   | px (1280×720) | neptune/uranus px 비         | 평가                                                                                                                                                                                                             |
| ---------------------------- | ------- | ------------- | ---------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. ice giant 답습 (선택)** | **250** | **43.84**     | **0.969 (= 사실 radius 비)** | **선택 — neptune < uranus 사실 서열 자동 보존 (R5 mars=earth / R7 saturn=jupiter 동형 3번째). "ice giant = 250" 단일 mental model 완성. neptune/earth 1.21 (> 1 직관 유지) + mid LOD 50px 미만 (margin 6.16px)** |
| B. 개별 상향 (260~280)       | 260+    | 45.6+         | > 1.0                        | 사실 서열 역전 (neptune > uranus) — 답습 근거 자체 파괴. 기각                                                                                                                                                    |
| C. 거성 예외 (48)            | 48      | 8.42          | —                            | earth (36.1px) 의 0.23배 — R8 에서 이미 기각된 경로 재현. 기각                                                                                                                                                   |

#### 선택 — **neptuneScale = 250 (후보 A)**

근거: ① 동일 scale 그룹 내 동일값 답습 시 **상대 비율 = 사실 radius 비가 자동 보존** (그룹 내 무가공 원칙 — R5/R7 선례) ② scale 정책 3그룹 체계 (inner 700~800 / gas giant 48 / **ice giant 250**) 의 마지막 행성 편입으로 체계 완성 ③ uranus 대비 모든 DoD 마진이 동반 보존 (px 43.84 < 45.24 — mid LOD/모바일 전부 R8 검증 범위 내부).

#### r1-guard 임계 — R8 결정 트리 답습 (방향 예상만 갱신)

- **정책 식값**: 17.80% (wsRadius 비)
- **예상 실측**: uranus (19.19 AU) 실측 7.52% — 식 대비 **×0.41 축소** (R8 Amendment 1 ① — depth 가 클수록 투영 직경 축소). neptune 30.07 AU 는 더 깊은 depth → **7.5% 미만으로 추가 축소 예상** (R8 §위험 #4 의 "부풀림" 방향이 아님 — Amendment 1 로 방향 확정됨)
- **결정 트리 (구현 qa 단계, R8 §축 1 그대로)**: ① `--measure-px-ratio` 3 viewport 결정적이면 `실측 × 1.05` 박제 (⚠️ 퍼센트 정수 표기 — jupiter 16.3 / uranus 7.9 패턴) ② 비결정적/projection 실패면 N/A 박제 + Allowlist/FOCUS_BODIES 우회 가드
- triton 은 N/A 확정 (4px fallback 의존 — titania/titan/galilean 답습)

---

### 축 2 — neptune.rings 데이터 + axialTiltDeg (ring·tilt 이중 코드 0 — R8 인계 #2/#3)

#### 축 2a — tilt: `axialTiltDeg: 28.32` 데이터 1값 (코드 0)

R8 §축 2a 인프라 (스키마 optional + scene 전달 + ring disc `rotation.x = π/2 + tiltRad` 3경로) 완비 — neptune 은 **값 1개 추가뿐**. saturn 26.73° 과 유사한 기울기로 시각적으로 평범한 타원 ring (R8 세로 고리 같은 showcase 아님). 방위각 world X 고정 근사는 R8 §위험 #6 주석 계약 답습 (`$axialTiltDegComment` 박제).

> **r1-guard pixel-diff 영향**: saturn/uranus 의 tilt 데이터 불변 — 기존 baseline 무회귀. neptune 은 default solar view (30.07 AU) 에서 off-screen 가능성 높음 — baseline 변화 예상 0, 변화 시 `--update` + PR 본문 스크린샷 박제 (R8 §위험 #2 절차 답습).

#### 축 2b — neptune.rings 데이터 (1 composite layer — R8 패턴 답습)

**핵심 제약 실측**: neptune 5 rings 중 narrow 3개 (Le Verrier ~113 km / Arago <100 km / Adams ~35 km) 는 ring 영역 px 반경 ≈ 36~44 px (scale 250) 에서 **0.04~0.13 px — sub-pixel 비가시** (R8 uranus 와 동일 구조). broad 2개 (Galle 2,000 km / Lassell 4,000 km) 는 faint dust band. → 개별 층 분리 기각, **1 composite layer + densityProfile 피크** (R8 후보 (iii) 패턴 답습 — 후보 비교 재수행 생략, 구조 동일).

박제 데이터 (R7/R8 스키마 그대로 — 코드 0):

| id   | innerRadiusKm | outerRadiusKm | densityProfile (12점 ≤ MAX 16)                                                                                                                 | colorHint | 근거                                                 |
| ---- | ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------- | --------- | ---------------------------------------------------- |
| main | 41,000        | 62,930        | `[[0,0.20],[0.05,0.25],[0.09,0.20],[0.14,0.04],[0.51,0.04],[0.56,0.45],[0.60,0.15],[0.70,0.15],[0.74,0.30],[0.79,0.04],[0.95,0.04],[1.0,1.0]]` | `#6F635A` | NASA Neptune Fact Sheet / JPL Ring-Moon Systems Node |

- 피크 ↔ 실측 ring 정규화 위치 (span 21,930 km): **Galle** (41,000~43,000) @0.000~0.091 → broad faint band 0.20~0.25 / **Le Verrier** @0.556 → 피크 0.45 / **Lassell** (53,200~57,200) @0.556~0.739 → faint plateau 0.15 / **Arago** @0.739 → 피크 0.30 / **Adams** @1.000 → **최대 밀도 1.0** (해왕성계 지배 ring — arcs 보유)
- 피크 간 baseline 0.04 — 빈 공간 극미 채움 (R8 동일 rendering 근사 — `$ringsComment` 주석 계약 박제)
- **Adams arcs 균질 근사 (PM Q2)**: 실제 Adams ring 은 5 arcs (Fraternité / Égalité 1·2 / Liberté / Courage — 전체 둘레의 ~10%) 만 밝고 나머지 구간은 극미광. 방사 densityProfile 은 각도 방향 표현 불가 → **균질 환형으로 렌더됨이 의도된 근사** (`$ringsComment` 에 명시 박제 — D-T2 "Adams 가 전부 균일하게 밝음 = 버그?" 오인 방지). 각도 density 인프라는 후속 분리 (§위험 #3)
- 12점 ≤ zod max(16) — margin 4점 (R8 15점 대비 여유. arcs 인프라 후속 도입 시에도 layer 분리로 흡수 가능)
- colorHint `#6F635A` (observed — 먼지 지배 고리의 dark reddish gray). dataSource: `NASA Neptune Fact Sheet / JPL Ring-Moon Systems Node`

#### 축 2c — ringAlphaHint = 0.7

jupiter 0.15 (faint) < **neptune 0.7** < uranus 0.8 < saturn 0.9. 해왕성 고리는 광학 깊이가 우라누스보다 더 낮은 dusty ring (Adams ~0.01 대) 이나 R9 DoD "고리 visible" 충족 위해 가시 우선 — 단 R8 세로 고리 showcase 보다 한 단계 낮춤 (어두움은 colorHint 로 분리 표현, R8 동일 논리). D-T2 "과밝음/안 보임" 보고 시 0.7 → 0.5 / 0.9 (§재검토 트리거 #3).

---

### 축 3 — triton 데이터 신규 + `BODY_SCALE.triton` (역행 위성 첫 사례)

#### triton body 데이터 (solar-system.json 신규 — R9 유일 신규 body)

| 필드                                                        | 값                                        | 근거                                                                                                                                                                                                                                                                                                                                                                               |
| ----------------------------------------------------------- | ----------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id / kind                                                   | `triton` / `moon`                         | —                                                                                                                                                                                                                                                                                                                                                                                  |
| nameKo / nameEn                                             | 트리톤 / Triton                           | —                                                                                                                                                                                                                                                                                                                                                                                  |
| mass                                                        | 2.139e22 kg                               | JPL SSD (GM ≈ 1,427.6 km³/s²)                                                                                                                                                                                                                                                                                                                                                      |
| radius                                                      | 1.3534e6 m                                | NASA (1,353.4 km — neptune 최대 위성, 태양계 7위)                                                                                                                                                                                                                                                                                                                                  |
| parentId                                                    | `neptune`                                 | —                                                                                                                                                                                                                                                                                                                                                                                  |
| introducedInRPhase                                          | **9**                                     | #613 allowlist 자동 포함                                                                                                                                                                                                                                                                                                                                                           |
| showInShortcutBar                                           | **false**                                 | galilean/titan/titania 패턴 (URL `?focus=triton` / command 진입)                                                                                                                                                                                                                                                                                                                   |
| colorHint                                                   | `#D2C2B0` (observed)                      | Voyager 2 — N₂/CH₄ ice 의 pinkish tan                                                                                                                                                                                                                                                                                                                                              |
| orbit.semiMajorAxisAU                                       | 2.37142e-3 (= 354,759 km)                 | NASA Fact Sheet                                                                                                                                                                                                                                                                                                                                                                    |
| orbit.eccentricity                                          | 0.000016                                  | NASA — 태양계 대형 위성 중 최소 (사실상 완전 원)                                                                                                                                                                                                                                                                                                                                   |
| orbit 각도 요소 (inclination/node/perihelion/meanLongitude) | **dev 단계 JPL Horizons API 쿼리로 박제** | **Neptune-centric J2000 Ecliptic frame 통일 의무** (R7 titan / R8 titania 선례 — dataSource 에 "Query Frame: Neptune-centric J2000 Ecliptic" + epoch 명시. Laplace plane 값 혼입 금지). **쿼리 결과 inclination > 90° (역행) 확인 의무** — NASA "157°" 는 적도면 기준이라 ecliptic osculating 값은 ~130° 대로 상이 가능. > 90° 미충족 시 frame 혼입 의심 → 쿼리 재검증 (박제 금지) |

> **⚠️ 사전 등록 — triton 역행은 정상 (PM Q1 합의)**: triton 은 neptune 자전 방향과 **반대로 공전** (태양계 유일 대형 역행 위성 — 카이퍼벨트 포획 기원 가설). 시각 발현 2가지를 D-T2 에 선제 등록:
> ① **궤도선 평면**: ecliptic inclination > 90° — 궤도선 자체는 폐곡선이라 "기울어진 타원" 으로만 보임 (titania 97.76° 세로 궤도보다 덜 극단 — ~130° 는 50° 기울기의 평면과 같은 자세). 평면 렌더 코드 경로는 titania 로 기검증 — 신규 0
> ② **공전 애니메이션 방향**: 시뮬레이션 재생 시 triton 만 **다른 모든 body 와 반대 방향 (시계방향)** 으로 공전 — **버그 아님, 사실 정합**. D-T2 "공전 방향 버그?" 보고 시 본 사전 등록 인용 (measurement-first 가설 정정 비용 선제 차단 — volt #32)

#### `BODY_SCALE.triton` 후보 비교 (수렴대 0.05~0.09 산출 — R8 인계 #4)

| 후보                         | scale   | triton px | triton/neptune mesh 비 (사실 5.47%) | baseline 대조                              | 평가                                                                                                                                |
| ---------------------------- | ------- | --------- | ----------------------------------- | ------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------- |
| A. 100 (titan/galilean 답습) | 100     | 0.96      | 0.0219                              | moon/earth 0.068 의 1/3                    | 과소 — focus view 존재감 상실. 기각                                                                                                 |
| B. 250 (neptune 동일값)      | 250     | 2.40      | 0.0547                              | 수렴대 하한권                              | 가능하나 moon/earth (0.068) 과 거리. 기각                                                                                           |
| **C. 300 (선택)**            | **300** | **2.87**  | **0.0656**                          | **moon/earth 0.068 / titania 0.0617 근접** | **선택 — 수렴대 (0.05~0.09) 중앙 + moon/earth 최근접. mesh sub-4px → billboard 의존**                                               |
| D. 500 (titania 답습)        | 500     | 4.79      | 0.1093                              | 수렴대 상한 초과                           | **scale 값 답습의 함정** — triton radius 가 titania 의 1.72배라 동일 scale 시 비 초과 + mesh 4.79px 가 4px fallback 경계 진동. 기각 |

- **비율 산출 방법론이 SSoT, scale 값 답습 아님** — 후보 D 기각이 이를 실증 (R8 titania 선정 논리의 재적용)
- triton mesh 2.87 px → 4px fallback billboard 전면 의존 (titania 2.79px 동급 — LOD Phase 2 #391 흡수). Q2=B 임계 N/A
- D-T2 iteration 경로: "작다/크다" 보고 시 300 → 400 / 200 단계 조정 (R6 학습 3 패턴)

---

### 축 4 — `NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE` (binding = ring outer — 3번째 인스턴스, uranus ×50 답습 함정)

산식 A (설계 임계, real-meter — #622 NO-OP SSoT: 산식 B 와 직접 비교 금지):

```
separation_margin = visual_orbit / (binding_outer + satellite_mesh) ≥ 1.5

binding_outer 가 ring outer mesh (R7/R8 유형의 3번째 인스턴스):
  neptune mesh radius (×250)          = 2.4764e7 × 250 = 6.191e9 m
  Adams ring outer mesh (×250, §축 2) = 6.293e7 × 250 = 1.57325e10 m  ← neptune mesh 의 2.541배 — binding
  triton mesh radius (×300)           = 1.3534e6 × 300 = 4.0602e8 m
  triton 실측 orbit                   = 3.54759e8 m  ← ring outer mesh 의 0.0226배 (미적용 시 고리 깊숙이 묻힘)
```

| visual_scale       | triton 분리 마진 (vs ring outer + triton mesh = 1.61385e10 m) | vs neptune mesh 만 (참고) | 평가                                                                                                         |
| ------------------ | ------------------------------------------------------------- | ------------------------- | ------------------------------------------------------------------------------------------------------------ |
| × 50 (uranus 답습) | **1.10 (fail — 고리 안)**                                     | 2.69                      | **ice giant 답습 함정값** — Adams ring 상대 확장 (2.541) 이 uranus ε (2.001) 보다 커서 동일 scale 미달. 기각 |
| × 70               | 1.54 (경계 +0.04)                                             | 3.76                      | 통과하나 마진 노이즈 경계. 기각                                                                              |
| **× 75**           | **1.65 (통과 +0.15)**                                         | **4.03**                  | **선택 — R8 titania 1.65x 정확 동률 + R5 1.69x 근접 (검증 마진대)**                                          |
| × 80               | 1.76                                                          | 4.30                      | R4 moon 1.78 근접하나 추가 이득 없음                                                                         |
| × 100              | 2.20                                                          | 5.38                      | 과분리 — visual orbit 이 ring outer 의 2.25배 (화면 이탈 경향)                                               |

#### 선택 — **`NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE = 75`** + `ORBIT_VISUAL_SCALE_BY_PARENT.neptune = 75`

근거:

1. **binding = ring outer mesh 3번째 인스턴스** (R8 인계 — R7 titan / R8 titania 답습): ×50 이 neptune mesh 만 보면 2.69 로 통과처럼 보이는 함정 명시 (R8 ×30 함정값 동형)
2. 마진 1.65x — R8 titania 와 정확 동률 (검증된 binding 마진대 1.65~1.78 하한). triton visual orbit = ring outer 의 1.691배 (R7 titan 1.82 / R8 titania 1.70 동급 — 시각 간섭 경험 범위 내)
3. 명명 `NEPTUNE_SATELLITES_ORBIT_VISUAL_SCALE` — R5~R8 컨벤션 답습 (triton 단일이어도 복수형 — 단 nereid 등 확장은 R10 범위 밖)
4. 궤도선: #627 일반화가 parent 별 LineSystem `.scaling` 자동 처리 — **코드 변경 0** (triton 궤도선이 neptune 추적 + ×75 자동). 역행 평면 (~130° ecliptic) 렌더는 titania 기검증 경로

> **검증 metric (산식 B) 주의**: runtime scene-unit 측정값을 산식 A 와 직접 비교 금지 (#622). D-T2 는 시각 분리 (triton billboard 가 ring 바깥 명확) 로 검증.

---

### 축 5 — Shortcut Bar (변경 0 — Concrete Prediction)

R8 인계 #5 이행 — 실측: neptune `showInShortcutBar=true` 이미 + `FOCUS_BUTTONS` 에 `{ id: 'neptune', label: '해왕성' }` 기존재 (R-Phase Allowlist disabled 주석). **CURRENT_R_PHASE=9 1줄로 자동 enabled — 데이터/배열 변경 0** (#613 Concrete Prediction 의 negative→positive 전환 5번째 실전, R6 jupiter 선례 동형).

- triton = false (galilean/titan/titania 패턴 — URL `?focus=triton` 진입. discoverability gap 은 #624 사용자 accepted tradeoff 답습)
- `RPHASE_EXPECTED_ENABLED` (#617) / `r-phase-allowlist.test.ts` expected 갱신 (neptune enabled + triton allowlist — 테스트 카운트, 코어 아님)
- FOCUS_BUTTONS neptune 주석 1줄 갱신 ("R9 enabled") 은 주석 — 코어 카운트 제외

### 축 6 — 가드 동기화 (R8 체계 유지 — 신규 metric 재정의 없음)

R8 §축 6 (off-screen 제외) 이 metric 을 이미 재정의 — R9 는 **가드 구조 변경 0, 목록 동기화만**:

| 가드                  | 변경                                                                                                                | 비고                                                                                                         |
| --------------------- | ------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------ |
| r1-guard `targetIds`  | 17 → **19 body** (+neptune, +triton)                                                                                | #619 정적 매칭 가드 (`targetIds === R_PHASE_BODY_ALLOWLIST`) 차단 회피 — CURRENT_R_PHASE=9 와 동시 갱신 의무 |
| `PX_RATIO_THRESHOLDS` | neptune 결정 트리 (§축 1) / triton N/A                                                                              | —                                                                                                            |
| `FOCUS_BODIES` (#598) | +neptune, +triton                                                                                                   | browser-verify-378-focus 19 body                                                                             |
| pixel-diff baseline   | 변화 예상 0 (neptune 30 AU off-screen) — 변화 시 `--update` + 스크린샷 박제                                         | saturn/uranus tilt 데이터 불변 — R8 무회귀                                                                   |
| 모바일 cumulative     | baseline 16.82% (R8 실측) 기준 ≤ 25%                                                                                | §점유율                                                                                                      |
| scenario preset       | neptune-x10 zero-touch enabled (4번째 재현 — R8 Amendment 1 ④ 에서 신규됨) + **R10 negative 신규 (pluto-x10 권장)** | R6/R7/R8 선례 답습                                                                                           |

---

## 점유율 산출 + Visual Fidelity §의무 체크리스트 4항목 (#541)

### 모바일 누적 차단율 (375×667 — R8 off-screen 제외 metric, baseline 16.82%)

| 항목                                    | 산출                                                                                    | 기여                                                                                                                      |
| --------------------------------------- | --------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| R8 실측 baseline                        | off-screen 제외 후 (R8 Amendment 1 ②)                                                   | **16.82%**                                                                                                                |
| neptune disk (on-screen 가정 보수 상한) | mesh 직경 ≈ 43.84 × 0.927 ≈ 40.6 px → π×20.3² ≈ 1,295 px²                               | **+0.52%** (30.07 AU — R8 에서 uranus 19 AU 도 모바일 off-screen 분류 → neptune off-screen 가능성 더 높음, 실효 0 예상)   |
| neptune ring (정면 환형 보수 상한)      | outer px r = 20.3×2.541 ≈ 51.6 / inner = 20.3×1.656 ≈ 33.6 → π(51.6²−33.6²) ≈ 4,818 px² | **+1.93% 상한** — 실제는 tilt 28.32° 타원 + off-screen 시 0. guard cumulative 는 mesh sphere 만 합산 (DoD 정책 산출용 행) |
| triton                                  | billboard 4px ≈ 12.6 px²                                                                | +0.005%                                                                                                                   |
| **누적 (보수 상한)**                    | 16.82 + 0.52 + 1.93 + 0.005                                                             | **≈ 19.3% (DoD 임계 25% margin 5.7%p — neptune off-screen 시 16.82% 유지)**                                               |

- 1280×720 / 1920×1080 cumulative: R8 실측 5.45% + neptune 기여 (동일 보수 상한 논리) — 구현 실측 박제
- 재실측 괴리 ±3%p 초과 시 측정 방법 검증 우선 (volt #32 — R8 §재검토 트리거 #8 절차 답습)

### Visual Fidelity §의무 체크리스트 (4항목)

- [x] **데이터 SSoT 보존** — neptune 기존 필드 (radius/mass/orbit) 무수정. triton/neptune.rings/axialTiltDeg 는 NASA·JPL **실측값 신규 추가** (composite inner/outer 도 Galle inner/Adams outer 실측 경계 — 가공 반경 금지). mesh/ring/궤도 왜곡은 전부 rendering-only
- [x] **rendering 시점 분리** — physics 엔진 (Rust+wasm) 이 BODY_SCALE / axialTiltDeg / ORBIT_VISUAL_SCALE 무의존 (developer 검증 의무). triton 역행은 orbit elements (데이터) 가 결정 — 렌더 코드 무관
- [x] **UI overlay 실측값 표기** — CelestialInfoPanel neptune (24,764 km) / triton (1,353.4 km) 실측 radius 표기. neptune "× 250 과장 중" tooltip 자동 (getBodyScale 기존 경로)
- [x] **baseline 박제** — 핵심 박제값 표 + 산출 (neptune 43.84 px / 식 17.80% / neptune/uranus 0.969 / ring outer 2.541배 / triton 2.87 px / orbit ×75 마진 1.65x / 모바일 누적 ≈ 19.3% 상한)

---

## Concrete Prediction (R8 "R9 ring·tilt 이중 코드 0" 예측 재현 검증 + R9 예측 박제)

R8 §Concrete Prediction 의 R9 예측: "neptune (rings 보유 + tilt 28.32°) = BODY_SCALE 1~2 + CURRENT_R_PHASE 1 + ORBIT 룩업 (triton 시) 2 + **ring 축 코드 0 + tilt 축 코드 0** (R8 인프라 완비 — 데이터 2값만)". 본 ADR 검증 계획 + R9 자체 예측:

| 항목                                             | R8 예측  | R9 본 ADR 예측 | 사유                                                                                                                                       |
| ------------------------------------------------ | -------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------ |
| **ring 렌더 경로 (결합/colorHint/alphaHint)**    | **0**    | **0**          | neptune.rings 데이터만 — 적중 시 R7→R8→R9 **3연속** (generic 결합 추상화 건강성)                                                           |
| **tilt 경로 (스키마/loader/scene/shader 3경로)** | **0**    | **0**          | axialTiltDeg 28.32 데이터 1값만 — threading 은 R8 1회 비용 완료 (R8 Amendment 1 ③ 보정 반영). **적중이 R8 tilt 추상화 건강성의 구체 증거** |
| BODY_SCALE (neptune + triton)                    | 1~2      | **2**          | triton 확정 (PM Q1)                                                                                                                        |
| CURRENT_R_PHASE 8→9                              | 1        | **1**          | #613 자동 생성 5번째 실전                                                                                                                  |
| ORBIT_VISUAL_SCALE (상수 + 룩업)                 | 2        | **2**          | §축 4                                                                                                                                      |
| FOCUS_BUTTONS / showInShortcutBar                | (미예측) | **0**          | §축 5 — neptune 기존재 + 이미 true (#613 Concrete Prediction)                                                                              |
| **코어 코드 합계**                               | —        | **≤ 5 라인**   | **R8 실측 23 라인 대비 −78%** — tilt 인프라 (17 라인) 가 R8 1회 비용이었음의 정량 증거. 초과 시 인프라 재사용 실패 신호 회고               |

별도 카운트 (데이터/가드/테스트): triton body json ~28줄 + neptune.rings json ~40줄 + axialTiltDeg 1값+주석 + ringAlphaHint 1값 / guard (targetIds 2 + PX_RATIO_THRESHOLDS.neptune 1) / FOCUS_BODIES 2 id / body-scale.test 2 + r-phase-allowlist.test expected 갱신 (neptune enabled + triton) / time-reversal 제외 검토 (triton 주기 5.877d < titania 8.71d — R8 Amendment 1 ④ 메커니즘상 제외 예상, dev 실측 후 결정) / scenario preset (neptune-x10 zero-touch + R10 negative 신규) / CHANGELOG.

**예측 검증 의무 (dev 단계)**: `git diff --stat` 으로 ① ring 렌더 경로 (`solar-system-scene.ts` ring 생성부 + `ring-shader.ts`) 변경 0 ② tilt 경로 (loader/scene/shader) 변경 0 ③ 코어 합계 ≤ 5 라인 실측 재현. ①② 적중 시 R8 예측 적중 박제, 초과 시 추상화 리팩토링 신호 회고. **R10 prediction**: 왜소행성+혜성 8 body (introducedInRPhase=10 데이터 기박제) = **CURRENT_R_PHASE=10 1줄 + BODY_SCALE 신규 그룹 N줄** — 단 ring/tilt/satellite 룩업 전부 0 (전 body parent=sun, rings 없음). 핵심 변수는 §R10 인계 #2/#3 (왜소행성 scale 4번째 그룹 + 혜성 고이심률 궤도선) — 코드 0 보장은 궤도선 sampling 검증 후 확정

---

## DoD (수치 — 검증 가능 완료 기준)

1. **neptune mesh visible + 사실 서열 보존** — 1280×720 식 43.84 px (mid LOD 50px 미만, 4px fallback 무의존). **neptune/uranus px 비 0.969 ± 0.02** (사실 radius 비 — 단위 테스트 정량 가드) + neptune/earth > 1
2. **고리 가시 (composite + tilt 28.32°)** — neptune focus 에서 ring 이 타원 환형으로 명확 식별 (D-T2 실 Chrome). ring outer/neptune mesh 비 **2.541 ± 0.05** (사실 비율). Adams 피크 (외곽 1.0) + Le Verrier 피크 (0.556 위치) 식별. **Adams 균질 환형은 의도된 근사 (PM Q2) — arcs 미표현이 결함 아님**
3. **triton 가시 + 분리 + 역행 정상** — `?focus=triton` 진입 성공 + billboard 가 ring 바깥 (visual orbit ×75, 산식 A 마진 1.65x ≥ 1.5). triton 궤도선이 neptune 추적 (#627 — 태양 원점 오렌더 0). **공전 방향 반대 (역행) + 기울어진 궤도 평면은 정상 — 사전 등록 (§축 3, PM Q1)**
4. **ring·tilt 이중 코드 0 실측** — `git diff --stat` 재현 (§Concrete Prediction ①②③). 코어 합계 ≤ 5 라인
5. **r1-guard PASS** — `PX_RATIO_THRESHOLDS.neptune` 결정 트리 수행 (실측 ×1.05 또는 N/A 박제). 기존 17 body 무회귀 (saturn/uranus tilt 데이터 불변)
6. **모바일 cumulative ≤ 25%** — R8 baseline 16.82% 기준 (보수 상한 19.3%). off-screen 분류 보고 (`offScreen: true`) 확인 + 신규 실측값 박제 (R10 인계용)
7. **단위 테스트 PASS** — r-phase-allowlist.test (#613/#617 neptune/triton 갱신) + body-scale.test (neptune/uranus 비 0.969 정량) + time-reversal 제외 여부 실측 결정 — 전체 green
8. **가드 동기화** — FOCUS_BODIES (#598) / targetIds (#619) / RPHASE_EXPECTED_ENABLED (#617) 19 body 정합 — CI `detect-and-test` green
9. **jupiter/saturn/uranus ring 무회귀** — 기존 3 body 의 ring/tilt 데이터 불변 — focus D-T2 회귀 보고 0
10. **D-T2 실 Chrome GUI 수동 검증 ≥ 1회** (headless 만으로 종결 금지 — volt #77). headless 검증 URL 은 `?gpu=a&lod=auto` 필수 (R7 학습)

---

## 위험 / 미해결

### 위험 #1 — triton 역행의 D-T2 오인 (PM Q1 사전 등록)

- 공전 애니메이션 방향이 다른 모든 body 와 반대 (시계방향) + 궤도 평면 기울기 (~130° ecliptic 예상) — "버그" 오인 위험
- 완화: §축 3 사전 등록 + qa/D-T2 안내문에 "역행 = 사실 정합 (태양계 유일 대형 역행 위성, 포획 기원)" 명시. **불일치가 오히려 버그 신호인 항목**: triton 이 다른 body 와 **같은 방향**으로 공전하면 inclination frame 혼입 의심 (Horizons 쿼리 재검증)

### 위험 #2 — Horizons ecliptic inclination 값과 통념 "157°" 의 괴리

- NASA "157°" 는 Neptune 적도면 기준 — ecliptic osculating 쿼리값은 ~130° 대 가능. dev 가 "157 이 아니다" 로 쿼리 오류 오인하거나, 반대로 적도면 값을 ecliptic 으로 혼입할 위험
- 완화: §축 3 데이터 표에 frame 주의 박제 — **판정 기준은 "> 90° (역행)" frame 무관 불변량**. `$comment` 에 쿼리 frame + 원시값 박제 (R8 titania 선례)

### 위험 #3 — Adams arcs 균질 근사의 시각 정확성 한계 (PM Q2 수용)

- 실제 Adams ring 은 둘레의 ~10% (arcs) 만 밝음 — 균질 환형 렌더는 의도된 근사
- 완화: `$ringsComment` 주석 계약 + D-T2 사전 등록. 각도 방향 density 인프라 (예: angularProfile) 는 후속 이슈 분리 — densityProfile 12점 (margin 4) 라 layer 분리로도 흡수 가능

### 위험 #4 — neptune px-ratio 측정 (30.07 AU — 최심 depth)

- uranus (19.19 AU) 실측 7.52% (식 ×0.41 축소) — neptune 은 추가 축소로 측정값이 노이즈 대비 작아질 가능성 (신호 약화 — volt #32 의 "측정 대상 ≪ baseline" 상황)
- 완화: R8 결정 트리 답습 (3 viewport 결정성 우선 판정 → 비결정 시 N/A + Allowlist/FOCUS_BODIES 우회)

### 위험 #5 — composite 12점의 faint band 시각 품질

- Galle (0.20~0.25) / Lassell (0.15) faint band 가 alpha 0.7 에서 비가시 가능 — DoD 2 는 Adams/Le Verrier 피크 기준이라 직접 미달은 아니나 "5 rings 표현" 의 충실도 저하
- 완화: D-T2 관찰. 미식별 시 baseline density 상향 (0.15→0.25 — 데이터만, 실측 위치 보존) 또는 ringAlphaHint 0.7 → 0.9

### 위험 #6 — tilt 방위각 근사 (R8 §위험 #6 연장)

- `rotation.x` world X 고정 — triton 궤도 평면 (Horizons 실측) 과 ring 평면 (근사) 의 시각 정렬이 어긋나 보일 수 있음. triton 은 neptune 적도면 근처 (역행) 공전이라 ring 과 대략 정렬이 사실 정합
- 완화: 주석 계약 답습 + D-T2 관찰. R8 에서 분리된 pole orientation 정밀화 후속과 통합 검토

---

## 결과 / 재검토 조건 (Amendment 발동 트리거)

1. **#1 (triton 공전 방향/평면 "버그" 보고)** — §축 3 사전 등록 인용 + frame 검증 (같은 방향 공전이 진짜 버그 신호). 데이터 수정은 Horizons 재쿼리로만
2. **#2 (triton 크기)** — D-T2 보고 → tritonScale 300 → 400 / 200
3. **#3 (ring 밝기/피크)** — ringAlphaHint 0.7 → 0.9 (어두움) / 0.5 (과밝음), densityProfile baseline·피크 조정 (실측 위치 보존)
4. **#4 (궤도선-고리 간섭)** — ×75 → ×80 (마진 1.76x)
5. **#5 (guard 실측 편차)** — neptune px-ratio 결정 트리 (§축 1) — 측정 방법 검증 우선 (volt #32)
6. **#6 (모바일 cumulative 괴리)** — 예상 16.82~19.3% 범위 ±3%p 초과 → 측정 방법 검증 우선
7. **#7 (FOCUS_BODIES/#617/#619 drift)** — 정적 매칭 가드 fail → 즉시 동기화
8. **#8 (Adams arcs 충실도 요구)** — PM 라운드 후 각도 density 인프라 후속 이슈 분리 (R9 비-범위 불변). **➡️ 이행됨**: [#728](https://github.com/coseo12/astro-simulator/issues/728) / [`20260621-728-adams-ring-arcs.md`](20260621-728-adams-ring-arcs.md) — ring shader azimuthal alpha 변조로 후속 분리 설계 (밝은 arc 클러스터 aggregate, "방사 densityProfile 각도 표현 불가" 는 데이터 한계이지 shader 구조 한계 아님으로 정정)

---

## R10 인계 (왜소행성 + 혜성 — introducedInRPhase=10 기박제 8 body, 로드맵 행성 완주 후 첫 비-행성 라운드)

데이터 실측 (2026-06-10): ceres / pluto / haumea / makemake / eris / halley / encke / swift-tuttle **8 body 전부 introducedInRPhase=10 + showInShortcutBar=false 로 기박제** — CURRENT_R_PHASE=10 1줄로 allowlist 자동 확장.

1. **8 body 동시 진입의 D-T2 비용** — R-Phase 최대 동시 진입 (기존 최대 R6 의 5 body). PM 라운드에서 분할 (R10a 왜소행성 5 / R10b 혜성 3) 검토 권장
2. **scale 정책 4번째 그룹 (왜소행성) 필요** — pluto radius 1.1883e6 m: ice giant 250 답습 시 px 2.10 (비가시), inner 800 시 6.73 px. ceres (4.696e5 m) 는 800 에서도 2.66 px. phobos/deimos 5000 계보 (사실 비율 명시 위배) 재적용 검토 — 단 왜소행성 간 사실 서열 (pluto > eris > haumea > makemake > ceres) 보존 제약 권장
3. **혜성 고이심률 궤도선 첫 사례** — halley e=0.96714 / swift-tuttle e=0.963 / encke e=0.848. 궤도선 vertex sampling 이 균등 mean-anomaly 기반이면 근일점 부근 vertex 밀집/원일점 희소 — **렌더 품질 + #627 일반화 경로 실측 검증 의무** (코드 0 보장 불가 축 — R10 architect 가 sampling 코드 전수 확인)
4. **a 범위 2.22~67.9 AU** — eris (67.86 AU) 는 neptune (30.07) 의 2.26배 거리. px-ratio 측정은 전부 N/A 예상 (4px fallback 의존) + 모바일 off-screen. default solar view 에서 orbit line 가시성 (camera radius 대비) 별도 검토
5. **shortcut bar 정책 재논의** — 8 body 전부 false 기박제. "사용자가 실제로 보이는 body" 원칙과 URL-only 진입의 긴장 (#624 tradeoff) — pluto 만 true 승격 등 PM 라운드
6. **satellite 단일 룩업 한계 인계 소멸 조건** — R10 은 위성 0 (charon 데이터 부재) — N≥5 한계는 charon/nereid 등 위성 확장 라운드로 이월
7. **모바일 diskArea baseline** — R9 재실측값 기준 산출 (16.82% 또는 R9 갱신값 — 구버전 금지)
8. **scenario preset negative** — R9 에서 신규한 R10 negative (pluto-x10 권장) 의 zero-touch enabled 재현

---

## 교차검증 반영 사항 (cross-validate 2026-06-10 agy outcome=applied)

agy 가 본 설계를 지지 (orbit scale ×50 함정 회피 / triton 역행 D-T2 선제 등록 / 주석 계약 박제를 우수 평가). 4축 분류:

- **합의 (4)**: ① orbit scale ×75 (×50 답습 시 triton 이 Adams ring 내부에 묻히는 함정 정확 회피) ② ice giant 250 답습 + 사실 서열 자동 보존 ③ zod 스키마 규격 안착 (tilt/max(16)) ④ triton 역행 "정상 동작" 사전 등록 리스크 관리.
- **고유 발견 수용 (1, 구현 의무)**: **JPL Horizons 쿼리 Epoch 명시** — osculating elements 는 시각 가변이므로 frame 외에 기준 시점 박제 의무. R8 titania 선례 (2026-01-01 TDB) 동일 epoch 사용 + dataSource 주석에 명기 (§축 3 격상).
- **부분 반려 (1)**: **PX_RATIO N/A 시 대체 가드** — N/A 가 되어도 r1-guard 의 **pixel-diff baseline 이 전체 화면을 커버**하므로 행성 누락/렌더 실패는 이미 포착 (px-ratio 는 비율 미세 회귀 전용 보조축). 결정 트리 1순위는 실측 박제 (R8 uranus 7.9 선례 — neptune 도 3 viewport 결정적이면 실측×1.05). 추가 어서션 불필요.
- **고유 발견 후속 분리 (1)**: **Adams arcs 균질 근사의 사용자 안내** (info panel 툴팁) — UI 텍스트/i18n 범위라 R9 비-범위 유지. `$ringsComment` 주석 계약 + 본 ADR 박제로 개발자 오해는 차단. 사용자-facing 안내는 ring 표현 정밀화 인프라 (arcs 등) 와 함께 후속 검토.

### Claude 편향 셀프 체크 (architect 사전 기록 — cross-validate 호출 전)

- **낙관적 일정** — 코어 ≤ 5 라인 예측이나 D-T2 iteration (triton scale / ring alpha) + px-ratio 결정 트리 + Horizons 쿼리로 Amendment 라운드 N≥1 예상 박제. R8 23 라인 실측의 threading 과소 추정 교훈을 "1회 비용 완료" 근거로 반영. 통과
- **결합 간과** — 본 라운드 핵심 결합 명시: (a) Adams ring 상대 확장 (2.541) → orbit binding 전파 (§축 4 ×50 함정값), (b) triton radius 1.72×titania → scale 값 답습 함정 (§축 3 후보 D), (c) inclination frame (적도면 157° vs ecliptic ~130°) → D-T2 오인 + 쿼리 혼입 양방향 위험 (§위험 #2), (d) CURRENT_R_PHASE=9 → targetIds/#619 정적 가드 동시 갱신 의무 (§축 6). 통과
- **폐기 프레이밍** — R8 "이중 코드 0" 예측을 그대로 검증 대상으로 유지 (재구조화 0). Adams arcs 는 폐기가 아닌 균질 근사 + 후속 인프라 분리 (PM Q2 합의 보존). 통과
- **순수주의** — arcs 비균질/세차/pole 방위각의 사실 정밀성 대신 PM 합의 근사 수용 — Visual Fidelity §1 (SSoT 보존 + rendering 왜곡 허용) 정합. triton 역행은 근사하지 않고 사실 그대로 (역방향 타협 없음). 통과
