# ADR: R8 천왕성 + 고리 + 티타니아 시각화 — ice giant 정책 신설 (uranus=250, 사실 비율 명시 위배 + earth 직관 우선) + axial tilt 인프라 (97.77° 세로 고리, saturn 26.73° 동반) + 모바일 diskArea off-screen 제외

- **상태**: **Accepted (cross-validate 2026-06-10 agy outcome=applied)** — §교차검증 반영 사항 통합 완료 (densityProfile zod max(16) + titania frame 의무 + tilt 방위 D-T2 확인 수용)
- **날짜**: 2026-06-10
- **결정자**: architect (R8 PM 합의 라운드 완료 — Q1=A / Q2=ice giant 별도 판단 (제약: 천왕성 > 지구 시각 직관) / Q3=ring tilt 인프라 R8 범위 포함 + saturn 동반 / Q4=uranus shortcut bar 진입. 메인 오케스트레이터가 사용자와 합의 2026-06-10. **PM 합의 그대로 박제 — 재구조화 금지**)
- **관련**: [#647](https://github.com/coseo12/astro-simulator/issues/647) (R8 본 스프린트), [`20260610-r7-saturn-titan-rings-visualization.md`](20260610-r7-saturn-titan-rings-visualization.md) (R7 SSoT — §R8 인계 5건 + Amendment 1 ③ 본 ADR 이 전부 이행), [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) (거성 예외 첫 인스턴스 + guard 이원화), [`20260606-627-satellite-orbit-structure-forensic.md`](20260606-627-satellite-orbit-structure-forensic.md) (satellite 궤도선 일반화 — titania 자동 확장), [`20260609-622-orbit-scale-gap-no-op.md`](20260609-622-orbit-scale-gap-no-op.md) (산식 A/B 측정-정의 분리), [`20260604-613-r-phase-metadata-ssot.md`](20260604-613-r-phase-metadata-ssot.md) (CURRENT_R_PHASE 1줄 자동 전파), [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541 의무 체크리스트 4항목)
- **교훈 적용**:
  - "신규 데이터 ≠ 신규 코드" — **R7 §Concrete Prediction "R8 ring 축 코드 0" 예측의 재현 검증이 본 ADR 의 핵심 산출물 중 하나** (§Concrete Prediction). ring 렌더 경로 (결합/colorHint/ringAlphaHint) 는 uranus.rings 데이터만 추가
  - "이슈 전제 코드 전수 확인" (#624 NO-OP 교훈) — axialTilt/obliquity/rotationQuaternion **저장소 전수 grep 0건 실측** (2026-06-10, #641 cross-validate 실측 재확인). tilt 는 신규 인프라가 맞음 — "있을 것" 가정 없음
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74)) — titania 궤도가 ecliptic 기준 ~98° 기울어 **세로 궤도로 보이는 것이 정상** 임을 사전 등록 (§축 3 — D-T2 "버그?" 오인 방지)
  - "수치 DoD 미달 시 측정 방법 검증 우선" (volt [#32](https://github.com/coseo12/volt/issues/32)) — uranus 19.19 AU 는 saturn w=5.13 artifact (R7 Amendment 1 ①) 보다 극단 예상. px-ratio 임계는 구현 실측 ×1.05 이원화 + 측정 불안정 시 N/A fallback 결정 트리 사전 박제 (§축 1)

---

## 현재 유효 결정 요약 (Living ADR Executive Summary)

> **PM 정책 결정 확정 (2026-06-10, 사용자 권장안 승인 — 그대로 박제)**: Q1=A (uranus + 고리 + titania 3요소 동시, 나머지 위성 R9+) / Q2=ice giant 별도 판단 (거성 예외 48 기계 답습 금지 — 후보 비교 재평가, **제약: 천왕성이 지구보다 크게 보여야 함** — 실반경 4.007배 직관) / Q3=ring tilt 인프라 R8 범위 포함 (uranus 97.77° 세로 고리 + saturn 26.73° 동반 적용 — R7 비-범위 해소) / Q4=uranus showInShortcutBar true + FOCUS_BUTTONS.

### 핵심 박제값 표

| 항목                                                                           | 박제값                                                          | 위치                                                          | 비고                                                                                                                                                                                                 |
| ------------------------------------------------------------------------------ | --------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BODY_SCALE.uranus`                                                            | **250**                                                         | `apps/web/src/constants/body-scale.ts`                        | §축 1 — **ice giant 정책 신설 (3번째 scale 그룹)**: 사실 비율 (sun 의 3.67%) 명시 위배 + earth 대비 직관 우선 (PM 제약). px 45.24 / sunPxRatio 식 18.37% / uranus/earth px 비 1.25                   |
| `BODY_SCALE.titania`                                                           | **500**                                                         | `apps/web/src/constants/body-scale.ts`                        | §축 3 — titania/uranus mesh 비 0.0617 (moon/earth 0.068 근접). mesh 2.79 px → 4px fallback billboard 의존                                                                                            |
| `solar-system.json` titania body                                               | 신규 (§축 3 데이터 표)                                          | `packages/shared/data/solar-system.json`                      | mass 3.42e21 / radius 7.884e5 m / a=2.91388e-3 AU (435,910 km) / parentId=uranus / introducedInRPhase=8 / showInShortcutBar=false. dev 단계 JPL Horizons **Uranus-centric J2000 Ecliptic** 쿼리 의무 |
| `solar-system.json` uranus.rings                                               | 신규 **1 composite layer** (41,837~51,149 km — §축 2 데이터 표) | `packages/shared/data/solar-system.json`                      | 9 narrow rings (6/5/4/α/β/η/γ/δ/λ/ε) 를 densityProfile 15점 피크로 합성 표현 — narrow ring 폭 (20~100 km) 이 sub-pixel 이라 개별 층 분리 시 비가시 (§축 2b 후보 비교). ν/μ dust ring 비-범위         |
| **`axialTiltDeg` (스키마 신규 — R8 유일 코어 인프라 확장)**                    | uranus **97.77** / saturn **26.73** (NASA obliquity to orbit)   | loader `CelestialBodyRawSchema` + scene → `ring-shader.ts`    | §축 2a — ring disc `rotation.x = π/2 + tiltRad`. **ring-only tilt (후보 A)** — 본체 자전/텍스처 미구현 (#641 실측) 이라 host 통합 tilt 불필요. jupiter 3.13° 비-범위                                 |
| uranus `ringAlphaHint`                                                         | **0.8**                                                         | `solar-system.json`                                           | §축 2c — 어두운 고리 (albedo ~0.05) 지만 R8 showcase (세로 고리) 가시성 우선. saturn 0.9 / jupiter 0.15 사이                                                                                         |
| uranus ring layer `colorHint`                                                  | `#5A5E66` (observed — dark gray)                                | `solar-system.json`                                           | §축 2b — R7 스키마 (optional) 재사용, 코드 0                                                                                                                                                         |
| `URANUS_SATELLITES_ORBIT_VISUAL_SCALE` + `ORBIT_VISUAL_SCALE_BY_PARENT.uranus` | **50**                                                          | `packages/core/src/scene/orbit-visual-scale.ts`               | §축 4 — binding = **ring outer mesh (R7 신규 유형 답습)**. titania 분리 마진 산식 A **1.65x** (≥ 1.5 통과 +0.15)                                                                                     |
| `PX_RATIO_THRESHOLDS.uranus`                                                   | **구현 실측 ×1.05 박제 / 측정 불안정 시 N/A** (결정 트리 §축 1) | `apps/web/scripts/r1-ui-regression-guard.mjs`                 | 정책 식 18.37%. 19.19 AU — saturn w=5.13 artifact (실측 56.89%) 초과 극단 예상. 3 viewport 비결정적이면 N/A + Allowlist/FOCUS_BODIES 우회 가드 (phobos §결정 6 패턴)                                 |
| `PX_RATIO_THRESHOLDS.titania`                                                  | **N/A** (4px fallback 의존)                                     | r1-guard 미박제                                               | §축 3 — titan/galilean 답습                                                                                                                                                                          |
| **모바일 diskArea off-screen 제외**                                            | projected center 가 viewport/NDC 밖 → cumulative 합산 제외      | `r1-ui-regression-guard.mjs` (`runPxRatioMeasurement` 합산부) | §축 6 — R7 Amendment 1 ③ 이행 (옵션 a). saturn artifact ~13%p 제거 → baseline ≈ 9.96% 예상 (구현 실측 박제). 제외 body 는 `offScreen: true` 플래그로 계속 보고 (관찰성)                              |
| `CURRENT_R_PHASE`                                                              | **7 → 8** (1줄)                                                 | `packages/core/src/scene/r-phase-allowlist.ts`                | #613 자동 생성 4번째 실전 — allowlist `[...R7, uranus, titania]` 자동 확장                                                                                                                           |
| uranus `showInShortcutBar`                                                     | **false → true** (데이터 1값)                                   | `solar-system.json`                                           | §축 5 — 거성 본체 bar 노출 정합 (jupiter/saturn/neptune=true). #617 가드가 FOCUS_BUTTONS 동기화 강제                                                                                                 |
| `FOCUS_BUTTONS`                                                                | **uranus 1줄 추가** (saturn 다음, neptune 앞 — 거리순)          | `apps/web/src/components/layout/focus-quick-buttons.tsx`      | §축 5 — 모바일 12버튼은 기존 `overflow-x-auto` 흡수 (R7 11버튼 선례)                                                                                                                                 |
| `FOCUS_BODIES` (browser-verify-378-focus.mjs) + r1-guard `targetIds`           | `[...R7, uranus, titania]` 수동 동기화                          | `browser-verify-378-focus.mjs` / `r1-ui-regression-guard.mjs` | #598 정적 매칭 가드 차단 회피                                                                                                                                                                        |

### 핵심 결정 요약

1. **uranusScale=250 — ice giant 정책 신설 (3번째 scale 그룹)** (§축 1): 거성 예외 48 답습 시 px 8.69 (uranus/earth 0.24) 로 PM 제약 위반 — R7 §R8 인계 #1 예고 적중. 사실 비율 (3.67%) 정합 정책 (거성 예외) 을 **의식적으로 미적용**하고 moon Amendment 4 / phobos 5000 계보 (사실 비율 명시 위배 + 사용자 직관 우선) 를 행성에 첫 적용. uranus/earth px 비 1.25 + mid LOD 임계 50px 미만 (45.24, margin 4.76px)
2. **uranus > jupiter 시각 역전의 의식적 수용** (§축 1 + §위험 #1): PM 제약 (uranus > earth 36.1px) 충족 시 jupiter (24.3px)/saturn (20.5px) 역전은 **수학적 필연** (earth 가 이미 거성보다 큼 — R6 수용 상태의 연장). D-T2 회귀 보고 시 uranus 하향은 PM 제약과 충돌 → **PM 재합의 라운드 필요** 를 사전 박제 (architect 단독 Amendment 불가)
3. **uranus.rings = 1 composite layer + densityProfile 피크 합성** (§축 2b): 13 narrow rings 의 개별 폭 (20~734 km) 이 화면에서 sub-pixel → 개별/그룹 층 분리 시 전부 비가시. 9 main rings 를 단일 layer (41,837~51,149 km — 실측 경계) 에 담고 **각 ring 의 실측 반경을 정규화 위치로 박제한 densityProfile 15점** 으로 표현 (ε ring @1.0 최대 밀도). saturn A ring Encke gap dip 패턴의 역방향 적용
4. **axial tilt 인프라 — ring-only (후보 A), R8 유일 코어 확장** (§축 2a): body `axialTiltDeg` (optional) + ring disc `rotation.x = π/2 + tiltRad`. uranus 97.77° (세로 고리 — R8 핵심 showcase) + saturn 26.73° 동반 (R7 §위험 #4 해소). host 통합 tilt (후보 B) 는 본체 자전/텍스처 미구현 (#641 grep 실측 0건) 이라 시각 효과 0 + tier 전환/syncToHost 결합 위험 → 기각
5. **titaniaScale=500** (§축 3): titania/uranus mesh 비 0.0617 (moon/earth 0.068 근접). titan=100 답습 시 비 0.0123 과소 — uranus(250) 가 gas giant(48) 의 5.2배라 satellite scale 동반 상향 필요. mesh 2.79px → 4px fallback billboard 의존
6. **URANUS_SATELLITES_ORBIT_VISUAL_SCALE=50** (§축 4): binding = ring outer mesh (1.2787e10 m — R7 신규 유형 답습, uranus mesh 의 2.001배). 마진 1.65x (×45 는 1.49 경계 미달 함정값)
7. **모바일 diskArea off-screen 제외 (옵션 a)** (§축 6): R7 Amendment 1 ③ 이행 — projected center 가 viewport 밖/카메라 뒤인 body 를 cumulative 에서 제외해 "모바일 화면 차단율" 본래 의미 복원. saturn artifact ~13%p 해소로 R8 spurious FAIL 차단
8. **CURRENT_R_PHASE=8 (1줄)**: #613 자동 생성 4번째 실전

### 비-범위 (R8)

- miranda / ariel / umbriel / oberon 등 uranus 추가 위성 ❌ (R9+ — PM Q1. titania 만)
- ν (66,100~69,900 km) / μ (86,000~103,000 km) 외곽 dust ring ❌ — 2003 발견 극미광, 포함 시 ring outer 4.03배로 orbit binding 전면 재산출. main rings (6~ε) 까지로 확정
- ζ (1986U2R) 내측 dust sheet ❌ — Voyager/Keck 관측치 불일치 (37,000~41,350 km 범위 논쟁) — 데이터 SSoT 출처 단일화 불가
- jupiter `axialTiltDeg` (3.13°) ❌ — 시각 변별 불가 수준, D-T2 회귀 검증 비용만 추가
- 본체 mesh 자전축 표현 / 자전 애니메이션 ❌ — 텍스처 없는 단색 구는 회전 시각 불변 (#641 실측). tilt 인프라는 ring 한정
- ring tilt 방위각 (pole RA/Dec) 정밀 표현 ❌ — `rotation.x` 축 고정 근사 (§위험 #6)
- ring shadow / titania 표면 특징 ❌
- neptune / R9+ body 진입 ❌
- 실측 데이터 변경 ❌ — uranus 기존 필드 (radius/mass/orbit) 무수정. 신규 추가만 (titania body / uranus.rings / axialTiltDeg / showInShortcutBar / ringAlphaHint)
- LOD 시스템 변경 ❌ (R4 Amendment 3 보존)

---

## 배경

### Roadmap v3 §R8 진입 조건 + R7 인계 이행 (5건 + Amendment 1 ③)

[`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) — R8 = R7 + 천왕성. R7 ADR §R8 인계 5건 + Amendment 1 ③ 을 본 ADR 이 전부 이행:

1. **ice giant scale 재평가** — §축 1 (거성 48 답습 기각 — 인계 참고치 px 3.52%/mesh 8.7px 그대로 재현 확인 후 기각)
2. **ring 축 코드 0 예측 검증** — §Concrete Prediction (uranus.rings 데이터만 추가 — R7 generic 결합 적중 여부 dev 단계 `git diff --stat` 재현 의무)
3. **ring tilt** — §축 2a (R8 범위 격상 — PM Q3)
4. **showInShortcutBar true 전환** — §축 5
5. **satellite N≥5 단일 룩업 한계** — titania 단일 satellite 라 미발동. R9+ 인계 유지
6. **Amendment 1 ③ 모바일 diskArea off-screen 오염 (마진 2.04%p)** — §축 6 에서 off-screen 제외 (옵션 a) 결정

### 현재 baseline 실측 (2026-06-10 develop tip = `ace9ca2`)

- `BODY_SCALE`: sun 50 / mercury 700 / venus 800 / earth 800 / moon 200 / mars 800 / phobos·deimos 5000 / jupiter·saturn 48 / galilean·titan 100
- `ORBIT_VISUAL_SCALE_BY_PARENT`: earth 30 / mars 500 / jupiter 16 / saturn 10
- `CURRENT_R_PHASE = 7`
- `solar-system.json` 실측: **uranus 기존재** (radius 2.5559e7 equatorial, introducedInRPhase=8, **showInShortcutBar=false**, rings 없음, axialTilt 류 필드 없음). **titania 부재 — 유일한 신규 body**
- `FOCUS_BUTTONS` 9 id (sun~saturn + neptune) — **uranus 부재**
- **tilt 코드 전수 확인 (#624 교훈)**: `axialTilt` / `obliquity` / `rotationQuaternion` 저장소 grep **0건** — 행성 자전축/자전 미구현 확정 (#641 cross-validate 실측과 일치). ring disc 는 `ring-shader.ts:318` `disc.rotation.x = Math.PI / 2` (XZ 공전면) 고정 + fallback 경로 `:362` 동일 + 층간 `position.y = idx × 1e-4` z-offset
- **ring 렌더 경로 실측**: `solar-system-scene.ts:452~492` — rings 보유 body 에 generic 으로 ① `× getBodyScale(body.id)` 결합 (R7 §축 2a) ② 층별 colorHint ③ body ringAlphaHint 전달. **uranus.rings 데이터 추가 시 이 경로 코드 변경 0** (R7 예측 — 본 ADR 검증 대상)
- **r1-guard 실측**: `PX_RATIO_THRESHOLDS` = mercury 4.95 / venus 14.26 / earth 17 / moon 5.0 / mars 8 / jupiter 16.3 / saturn 59.7. `targetIds` 11 body (uranus/titania 부재). 모바일 누적 diskArea: line 274 `π r²/(w×h)` 가 **off-screen 무관 합산** — R7 실측 22.96% (saturn perspective artifact ~13%p 포함, 잔여 마진 2.04%p)

### 데이터 사실 비율 (NASA Planetary Fact Sheet / JPL Ring-Moon Systems Node)

| 항목                 | 값                              | 비고                                                                                                                           |
| -------------------- | ------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| uranus radius        | 2.5559e7 m (equatorial)         | sun 의 **3.67%** / earth 의 **4.007배** (equatorial 비 — PM 제약 근거) / saturn 의 0.424배                                     |
| uranus 자전축 기울기 | **97.77°** (obliquity)          | 옆으로 누움 — 고리/위성계가 공전면에 거의 수직                                                                                 |
| titania radius       | 7.884e5 m (788.4 km)            | uranus 최대 위성 / moon 의 0.454배 / 태양계 8위                                                                                |
| titania orbit a      | 4.3591e8 m = 2.91388e-3 AU      | titan (1.22187e9 m) 의 0.357배                                                                                                 |
| main rings 범위      | 41,837 (ring 6) ~ 51,149 km (ε) | uranus 반경의 **1.637 ~ 2.001배**. 개별 ring 폭 20~100 km (ε 19.7~96.4 km) — saturn B ring (25,580 km 폭) 의 1/250 수준 narrow |
| saturn 자전축 기울기 | **26.73°**                      | R7 비-범위 → R8 동반 적용 (PM Q3)                                                                                              |

### 산출식 (R1~R7 동일)

```
px_diameter (1280×720) = body.radius × scale × k,  k = 7.0806e-9
sunPxRatio(body) = (body.radius × scale) / 3.4785e10
uranus:  2.5559e7 × 250 → pxDiameter 45.24 px / sunPxRatio 18.37% / uranus/earth 1.254
titania: 7.884e5 × 500  → pxDiameter 2.79 px (sub-4px → billboard fallback)
```

---

## 축별 설계 (후보 비교)

### 축 1 — `BODY_SCALE.uranus` (ice giant 정책 신설 — 거성 예외 기계 답습 금지, PM Q2)

PM Q2 합의: 거성 예외 (48) 기계 답습 금지 + **제약: uranus > earth 시각 직관** (실반경 4.007배). earth mesh = 36.08 px 이므로 제약 충족 하한 scale ≈ 200.

| 후보                                     | scale   | px (1280×720) | uranus/earth px 비 | sunPxRatio | 평가                                                                                       |
| ---------------------------------------- | ------- | ------------- | ------------------ | ---------- | ------------------------------------------------------------------------------------------ |
| A. 거성 예외 답습                        | 48      | 8.69          | 0.24               | 3.53%      | **PM 제약 위반** (R7 인계 #1 참고치 3.52%/8.7px 재현 일치). 기각                           |
| B. earth 동률 하한                       | 200     | 36.19         | 1.00               | 14.70%     | "크게" 불충족 (동률 — 노이즈로 역전 가능). 기각                                            |
| **C. ice giant 정책 (선택)**             | **250** | **45.24**     | **1.25**           | **18.37%** | **선택 — 제약 충족 (+25% 가독 마진) + mid LOD 임계 50px 미만 (margin 4.76px)**             |
| D. 직관 마진 확대                        | 280     | 50.67         | 1.40               | 20.57%     | **mid LOD 임계 50px 초과** — default view LOD 단계 변화 (R4 Amendment 3 일관성 파괴). 기각 |
| E. inner planet 동일 (earth 사실비 보존) | 800     | 144.78        | 4.01               | 58.78%     | 사실 비 4.007 정확 보존하나 sun (246px) 의 59% — 화면 압도 + 모바일 차단율 폭증. 기각      |

#### 선택 — **uranusScale = 250 (후보 C, ice giant 정책 신설)**

근거:

1. **scale 정책 3그룹 체계 확정** — ① inner planets (700~800): 사실 비율 정합 (Q2=B 본 인스턴스) ② gas giants (48): 거성 예외 — sun 대비 사실 비율 정합 상향 ③ **ice giants (250): 사실 비율 명시 위배 + earth 대비 직관 우선** — moon Amendment 4 (200) / phobos·deimos (5000) 계보의 **행성 첫 적용**. uranus 사실 sunPxRatio 3.67% 를 정합 상향하면 mars 임계 (8%) 보다 작아지는 모순 (R7 인계 #1) 을 정책 분리로 해소
2. **PM 제약의 수학적 귀결 명시** — uranus(45.2) > earth(36.1) > jupiter(24.3) > saturn(20.5): **uranus > jupiter/saturn 시각 역전 발생**. 이는 earth 가 이미 거성보다 크게 보이는 R6 수용 상태 (2그룹 scale 의 기존 artifact) 의 연장이며 PM 제약 충족의 필연. §위험 #1 에 D-T2 대응 경로 박제
3. **mid LOD 일관성** — 45.24 px < 50 px (venus 고점 48.4 px 선례와 동일하게 mid 유지)
4. **earth 인접성** — uranus/earth 1.25 는 "지구보다 크다" 를 읽기에 충분하되 (venus/mercury 사실 비율 강화 라운드의 가독 임계 경험), 거성 역전 폭을 최소화하는 하한권 값

#### r1-guard 임계 — 결정 트리 (정책 식 ≠ guard 실측 이원화 + 측정 불안정 fallback)

- **정책 식값**: 18.37% (wsRadius 비 — perspective foreshortening 무시)
- **예상 실측**: uranus 19.19 AU — saturn (9.54 AU, w=5.13, 식 8.32% → 실측 56.89%, ×6.8) 보다 카메라 측면 평면에 더 근접해 perspective division artifact **극단 또는 projection 실패 (w≈0 / off-screen) 가능**
- **결정 트리 (구현 qa 단계)**:
  1. `--measure-px-ratio` 3 viewport 실측 → **결정적** (3 viewport 편차 노이즈 범위) 이면 `PX_RATIO_THRESHOLDS.uranus = 실측 × 1.05` 박제 (earth 17 / jupiter 16.3 / saturn 59.7 패턴. ⚠️ 퍼센트 정수 표기)
  2. projection 실패 / viewport 간 비결정적이면 **N/A 박제 + 주석** — 회귀 가드는 R-Phase Allowlist (#613) + FOCUS_BODIES (#598) 우회 (phobos R5 §결정 6 패턴)
- titania 는 N/A 확정 (4px fallback 의존 — titan/galilean 답습)

---

### 축 2 — axial tilt 인프라 + uranus.rings 데이터

#### 축 2a — axial tilt 인프라 (R8 유일 코어 인프라 확장 — PM Q3)

**문제 실측**: ring disc 는 `ring-shader.ts:318` `disc.rotation.x = Math.PI / 2` (XZ 공전면) **고정**. uranus 실제 자전축 97.77° — tilt 없으면 고리가 수평으로 렌더되어 "명백히 틀린 모습" (PM Q3). 본체 자전축 표현은 코드 전수 grep 0건 (미구현) — #641 cross-validate 실측.

| 후보                                         | 방안                                                                                                                                                         | 평가                                                                                                                                                                                                                    |
| -------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. ring-only tilt (선택)**                 | body `axialTiltDeg` (optional) → scene → `CreateRingShaderOptions.axialTiltRad` → disc `rotation.x = π/2 + tiltRad` (shader/fallback/placeholder 3경로 동일) | **선택 — 코어 ~10~12 라인. 본체는 텍스처 없는 단색 구라 회전 시각 불변 (tilt 미적용 무손실). tier 전환 (host.scaling)/syncToHost 무간섭 — rotation 은 scaling 과 직교**                                                 |
| B. host 통합 tilt (equatorial TransformNode) | host 와 ring 을 equatorial frame node 아래로 재구성                                                                                                          | 본체 시각 효과 0 (미구현 자전) + satellite 궤도는 Horizons ecliptic 실측 데이터 기반이라 equatorial node 불필요 (이중 적용 위험) + R7 syncToHost/tier 전환 재배선 위험. 기각 — **본체 텍스처/자전 도입 시 승격 재검토** |
| C. rings 데이터에 tilted 좌표 직박제         | 기울인 3D 평면 좌표를 데이터에 기록                                                                                                                          | 데이터 SSoT 파괴 (실측 km 반경 + 각도가 합성값으로 오염). 기각                                                                                                                                                          |

구현 계약 (dev 인수인계):

- 스키마: `axialTiltDeg: z.number().min(0).max(180).optional()` — NASA Fact Sheet "obliquity to orbit" 그대로 (uranus 97.77 / saturn 26.73). 미지정 시 scene 전달 생략 → tilt 0 (하위 호환 — jupiter 무회귀)
- 적용: `disc.rotation.x = Math.PI / 2 + axialTiltRad` — 회전축 방위각은 world X 고정 **근사** (pole RA/Dec 미사용 — §위험 #6). fallback InstancedMesh `source.rotation.x` 동일 + placeholder 경로 동일 (3경로 일관 — 회귀 검증 모드 정합)
- 층간 z-offset (`position.y = idx × 1e-4`): tilt 후 world Y offset 잔존은 ring 법선 방향과 cos 편차 — 1e-4 scene unit 스케일이라 무시 (주석 계약, 테스트 불요 — ROI 5문)
- **saturn 동반 적용 = r1-guard pixel-diff baseline 변경 (의도된 Behavior Change)** — saturn ring 타원 외형 변화로 기존 baseline FAIL 예상 → `--update` 갱신 의무 + CHANGELOG Behavior Changes 박제 (§위험 #2)

#### 축 2b — uranus.rings 데이터 (1 composite layer — narrow ring sub-pixel 문제의 설계 해소)

**핵심 제약 실측**: uranus 의 13 rings 는 전부 narrow (ε 폭 19.7~96.4 km, 6/5/4 그룹 폭 합산 ~734 km). uranus ring 영역 px 반경 ≈ 37~45 px (scale 250) 에서 ε ring 개별 폭 = 45 × (100/51,149) ≈ **0.09 px — 비가시**. saturn (B ring 폭 25,580 km) 와 달리 **실측 폭 그대로의 개별 층 분리는 구조적으로 렌더 불가**.

| 후보                                                     | 방안                                                            | 평가                                                                                                                                                    |
| -------------------------------------------------------- | --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------- |
| (i) 13층 전부 개별                                       | ring 별 1 layer                                                 | 전 층 sub-pixel 비가시 + PM "전부는 과다" 합의 위반. 기각                                                                                               |
| (ii) 그룹 층 분리 (654 / αβ / ηγδ / ε)                   | 그룹별 4 layer                                                  | 그룹 폭 (734 km 최대) 도 sub-pixel (0.65 px) — DoD "고리 visible" 미충족. 기각                                                                          |
| **(iii) 1 composite layer + densityProfile 피크 (선택)** | 41,837~51,149 km 단일 layer, 9 rings 를 정규화 위치 피크로 표현 | **선택 — band 폭 ≈ 8 px visible. 각 피크의 r 위치는 실측 반경 정규화값 (데이터 SSoT 보존). saturn A ring Encke gap dip (실측 위치 박제) 패턴의 역방향** |
| (iv) ring 폭 인위 확대 (예: ε 를 50,600~51,700 으로)     | 가공 반경 직박제                                                | **데이터 SSoT 파괴** (실측 km 가 아니게 됨) — Visual Fidelity §1 위반. 기각                                                                             |

박제 데이터 (R7 스키마 그대로 — 코드 0):

| id   | innerRadiusKm | outerRadiusKm | densityProfile (15점 ≤ MAX 16)                                                                                                                                                     | colorHint | 근거                                         |
| ---- | ------------- | ------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------- | -------------------------------------------- |
| main | 41,837        | 51,149        | `[[0,0.35],[0.04,0.40],[0.08,0.38],[0.13,0.05],[0.28,0.05],[0.31,0.35],[0.41,0.40],[0.46,0.05],[0.55,0.05],[0.57,0.30],[0.69,0.35],[0.74,0.05],[0.88,0.15],[0.93,0.08],[1.0,1.0]]` | `#5A5E66` | JPL Ring-Moon Systems Node / NASA Fact Sheet |

- 피크 ↔ 실측 ring 정규화 위치 (span 9,312 km): **6/5/4 그룹** @0.000/0.043/0.079 → 피크 0.00~0.08 / **α/β** @0.309/0.411 → 피크 0.31~0.41 / **η/γ/δ** @0.573/0.622/0.694 → 피크 0.57~0.69 / **λ** @0.879 → 미세 피크 0.88 / **ε** @1.000 → **최대 밀도 1.0** (광학 깊이 0.5~2.3 — 우라누스계 지배 ring)
- 피크 간 baseline 0.05 — 실제는 거의 빈 공간이나 densityProfile 선형 보간 + 가시성 위해 극미 채움 (rendering 근사 — 주석 계약 박제)
- colorHint `#5A5E66` (observed — 우라누스 고리 albedo ~0.05 dark gray). `ringAlphaHint: 0.8`
- dataSource: `JPL Ring-Moon Systems Node / NASA Uranus Fact Sheet` — `$ringsComment` 에 composite 합성 근거 + 9 rings 정규화 위치 표 박제 의무

#### 축 2c — ringAlphaHint = 0.8

saturn 0.9 (prominent) / jupiter 0.15 (faint) 사이. 우라누스 고리는 어두우나 (albedo 토성의 1/10) R8 핵심 showcase (세로 고리) 가시성이 PM DoD — 0.8 로 가시 우선, 색 (#5A5E66 dark gray) 으로 어두움 표현 분리. D-T2 "과하게 밝음" 보고 시 0.8 → 0.5 (§재검토 트리거 #3).

---

### 축 3 — titania 데이터 신규 + `BODY_SCALE.titania`

#### titania body 데이터 (solar-system.json 신규 — R8 유일 신규 body)

| 필드                                                        | 값                                        | 근거                                                                                                                                                                    |
| ----------------------------------------------------------- | ----------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| id / kind                                                   | `titania` / `moon`                        | —                                                                                                                                                                       |
| nameKo / nameEn                                             | 티타니아 / Titania                        | —                                                                                                                                                                       |
| mass                                                        | 3.42e21 kg                                | JPL SSD (GM ≈ 228.2 km³/s²)                                                                                                                                             |
| radius                                                      | 7.884e5 m                                 | NASA (788.4 km — uranus 최대 위성)                                                                                                                                      |
| parentId                                                    | `uranus`                                  | —                                                                                                                                                                       |
| introducedInRPhase                                          | **8**                                     | #613 allowlist 자동 포함                                                                                                                                                |
| showInShortcutBar                                           | **false**                                 | galilean/titan 패턴 (위성은 URL `?focus=titania` / command 진입)                                                                                                        |
| colorHint                                                   | `#8E8275` (observed)                      | Voyager 2 관측 회갈색 근사                                                                                                                                              |
| orbit.semiMajorAxisAU                                       | 2.91388e-3 (= 435,910 km)                 | NASA Fact Sheet                                                                                                                                                         |
| orbit.eccentricity                                          | 0.0011                                    | NASA Fact Sheet                                                                                                                                                         |
| orbit 각도 요소 (inclination/node/perihelion/meanLongitude) | **dev 단계 JPL Horizons API 쿼리로 박제** | R7 §축 3 답습 — **Uranus-centric J2000 Ecliptic frame 통일 의무** (dataSource 에 "Query Frame: Uranus-centric J2000 Ecliptic" + epoch 명시). Laplace plane 값 혼입 금지 |

> **⚠️ 사전 등록 — titania 세로 궤도는 정상**: titania 는 uranus 적도면 (자전축 97.77° 기울어진 평면) 을 공전 → **ecliptic frame inclination ≈ 98°** 로 박제됨 → 궤도선이 공전면에 거의 수직인 **세로 궤도** 로 렌더된다. 이는 세로 고리와 정합하는 **사실 그대로의 모습** (uranus 계 전체가 누워 있음) — D-T2 에서 "궤도선 버그" 로 오인 금지. 본 사전 등록이 measurement-first 가설 정정 비용 (volt #32) 을 선제 차단

#### `BODY_SCALE.titania` 후보 비교

| 후보                         | scale   | titania px  | titania/uranus mesh 비 (사실 3.08%) | baseline 대조                                    | 평가                                                                                                        |
| ---------------------------- | ------- | ----------- | ----------------------------------- | ------------------------------------------------ | ----------------------------------------------------------------------------------------------------------- |
| A. 100 (titan/galilean 답습) | 100     | 0.56 px     | 0.0123                              | moon/earth 0.068 의 1/5.5                        | uranus(250) 가 gas giant(48) 의 5.2배라 동일 scale 답습 시 비 과소 — focus view 에서 위성 존재감 상실. 기각 |
| B. 300                       | 300     | 1.67 px     | 0.0370                              | —                                                | 중간값 — 비 0.05 미만 (R4~R7 수렴대 0.05~0.09 이탈). 기각                                                   |
| **C. 500 (선택)**            | **500** | **2.79 px** | **0.0617**                          | **moon/earth 0.068 / titan/saturn 0.089 수렴대** | **선택 — R4~R7 D-T2 수렴 비율대 (0.05~0.09) 정중앙. mesh sub-4px → billboard 의존**                         |
| D. 800                       | 800     | 4.47 px     | 0.0987                              | titan 0.089 상회                                 | 수렴대 상한 초과 + mesh 가 4px fallback 경계 (4.47px) 로 LOD 경계 진동 위험. 기각                           |

- titania mesh 2.79 px → **4px fallback billboard 전면 의존** (galilean/titan 동일 — LOD Phase 2 #391 흡수). Q2=B 임계 N/A
- D-T2 iteration 경로 사전 박제: "작다/크다" 보고 시 500 → 650 / 350 단계 조정 (dev 임시변경 → HMR → 합의값 일괄 박제 — R6 학습 3 패턴)

---

### 축 4 — `URANUS_SATELLITES_ORBIT_VISUAL_SCALE` (binding = ring outer — R7 유형 답습)

산식 A (설계 임계, real-meter — #622 NO-OP SSoT: 산식 B 와 직접 비교 금지):

```
separation_margin = visual_orbit / (binding_outer + satellite_mesh) ≥ 1.5

binding_outer 가 ring outer mesh (R7 신규 유형의 2번째 인스턴스):
  uranus mesh radius (×250)       = 2.5559e7 × 250 = 6.3898e9 m
  ε ring outer mesh (×250, §축 2a) = 5.1149e7 × 250 = 1.2787e10 m  ← uranus mesh 의 2.001배 — binding
  titania mesh radius (×500)       = 7.884e5 × 500 = 3.942e8 m
  titania 실측 orbit               = 4.3591e8 m  ← ring outer mesh 의 0.034배 (미적용 시 고리 깊숙이 묻힘)
```

| visual_scale | titania 분리 마진 (vs ring outer + titania mesh = 1.3171e10 m) | vs uranus mesh 만 (참고) | 평가                                                                       |
| ------------ | -------------------------------------------------------------- | ------------------------ | -------------------------------------------------------------------------- |
| × 30         | **0.99x (fail — 고리 안)**                                     | 2.05x                    | ring 미고려 시 통과로 오판하는 함정값 — 기각                               |
| × 45         | 1.49x (**경계 미달**)                                          | 3.07x                    | 임계 1.5 에 -0.01 미달 — 기각                                              |
| **× 50**     | **1.65x (통과 +0.15)**                                         | **3.41x**                | **선택 — R5 phobos 1.69x 근접 + 정수 단순 (반올림 50)**                    |
| × 55         | 1.82x                                                          | 3.75x                    | R4 moon 1.78x 근접하나 비정수성 이득 없음                                  |
| × 60         | 1.98x                                                          | 4.10x                    | 과분리 — titania visual orbit 이 ring outer 의 2.0배 초과 (화면 이탈 경향) |

#### 선택 — **`URANUS_SATELLITES_ORBIT_VISUAL_SCALE = 50`** + `ORBIT_VISUAL_SCALE_BY_PARENT.uranus = 50`

근거:

1. **binding = ring outer mesh (R7 유형 답습 — R7 §R8 인계 #2 이행)**: ε ring outer 가 uranus mesh 의 2.001배까지 확장 — ring 미고려 ×30 이 2.05x 로 통과처럼 보이는 함정 명시
2. 마진 1.65x — 검증된 binding 마진대 (R5/R6 1.69x, R7 1.75x, R4 1.78x) 하한 근접. titania visual orbit = ring outer 의 1.70배 (R7 titan 1.82배 와 동급 — 궤도선·고리 시각 간섭 경험 범위 내)
3. 명명 `URANUS_SATELLITES_ORBIT_VISUAL_SCALE` — R5~R7 컨벤션 답습 (titania 단일이어도 R9+ oberon 등 확장 전제 복수형)
4. 궤도선: #627 옵션 A 일반화가 parent 별 LineSystem `.scaling` 자동 처리 — **코드 변경 0** (titania 궤도선이 uranus 추적 + ×50 자동). 단 **세로 궤도** (ecliptic inclination ~98° — §축 3 사전 등록) 로 렌더됨

> **검증 metric (산식 B) 주의**: runtime scene-unit 측정값을 산식 A 와 직접 비교 금지 (#622 측정-정의 분리). D-T2 는 시각 분리 (titania billboard 가 세로 고리 바깥 명확) 로 검증.

---

### 축 5 — Shortcut Bar (uranus showInShortcutBar false → true)

R7 §R8 인계 #4 이행 — 실측: uranus=**false** (jupiter/saturn/neptune=true 와 비정합).

| 후보                                             | 방안                      | 평가                                                                                                                      |
| ------------------------------------------------ | ------------------------- | ------------------------------------------------------------------------------------------------------------------------- |
| **A. uranus true 전환 + FOCUS_BUTTONS 1줄 추가** | 거성 본체 정합 (bar 노출) | **선택 — R8 핵심 showcase (세로 고리) 진입 경로가 URL 뿐이면 사용자 visible 원칙 (roadmap v3) 위배 (R7 §축 5 동일 논리)** |
| B. false 유지 (URL-only)                         | 데이터 무변경             | "사용자가 실제로 보이는 body" DoD 충돌. 기각                                                                              |

- **#617 가드 강제 동기화**: true 전환 시 `focus-quick-buttons.tsx` 에 `{ id: 'uranus', label: '천왕성' }` 을 **saturn 다음·neptune 앞** (json 거리순) 추가 의무 + `r-phase-allowlist.test.ts` expected 갱신
- **모바일 너비**: 12버튼 — bar 컨테이너 `overflow-x-auto` 기존재 (R7 11버튼 선례) → horizontal scroll graceful degradation. 신규 코드 0. D-T2 모바일 확인 의무
- titania = false (galilean/titan 패턴 답습)

---

### 축 6 — 모바일 diskArea off-screen 오염 결정 (R7 Amendment 1 ③ 이행 의무)

**문제 실측**: `r1-ui-regression-guard.mjs:274` `diskAreaRatio = π r²/(w×h)` 가 **projected center 의 on-screen 여부 무관 합산**. saturn 은 default solar view 에서 화면 밖 (x≈14k) + perspective artifact 로 ~13%p 를 모바일 cumulative 에 오염 — 실측 22.96% / 25% (잔여 마진 2.04%p). uranus (19.19 AU, artifact 더 극단 예상) 추가 시 **spurious FAIL 확실시**.

| 후보                           | 방안                                                                                                                          | 평가                                                                                                                                                                  |
| ------------------------------ | ----------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **(a) off-screen 제외 (선택)** | projected center 가 viewport 밖 (`x<0‖x>w‖y<0‖y>h`) 또는 NDC z 범위 밖 → cumulative 합산 제외 + `offScreen: true` 플래그 보고 | **선택 — "모바일 화면 차단율" metric 본래 의미 복원. ~8 라인 (guard 스크립트). saturn ~13%p 해소 → baseline ≈ 9.96% 예상. 관찰성 보존 (제외 body 도 diskAreas 보고)** |
| (b) viewport 클리핑 교차 면적  | 원-사각형 교차 면적 정밀 산출                                                                                                 | 정확하나 구현 복잡 — ROI 5문 (보호 대상 = 가드 metric 1개) 역전. 기각                                                                                                 |
| (c) 임계 상향 (25% → 40%)      | artifact 수용                                                                                                                 | metric 의미 상실 (실 화면 차단 25% 정책의 silent 약화 — 가드 설계 원칙 위배). 기각                                                                                    |

- **경계 케이스 계약**: center on-screen + disk 일부 화면 밖 → **전체 면적 합산 유지** (보수 상한 — 기존 의미론 보존). 주석 계약 박제
- **metric 재정의 = guard baseline 변경**: 구현 단계 3 viewport 재실측 후 신규 baseline 수치를 PR 본문 + 본 ADR Amendment 로 박제 의무
- guard 스크립트 변경이므로 **코어 코드 라인 카운트와 분리** (§Concrete Prediction 별도 카운트)

---

## 점유율 산출 + Visual Fidelity §의무 체크리스트 4항목 (#541)

### 모바일 누적 차단율 (375×667 — §축 6 off-screen 제외 재정의 후)

| 항목                                   | 산출                                                                                              | 기여                                                                                                                                                           |
| -------------------------------------- | ------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 재정의 후 baseline (R7 까지)           | 22.96% − saturn off-screen artifact ~13.0%p                                                       | **≈ 9.96% (구현 실측 박제 의무)**                                                                                                                              |
| uranus disk (on-screen 가정 보수 상한) | mesh 직경 ≈ 45.24 × 0.927 ≈ 41.9 px → π×20.97² ≈ 1,381 px²                                        | **+0.55%** (off-screen 이면 0)                                                                                                                                 |
| uranus ring (정면 환형 보수 상한)      | outer px r = 20.97 × 2.001 ≈ 41.97 / inner = 20.97 × 1.637 ≈ 34.33 → π(41.97²−34.33²) ≈ 1,831 px² | **+0.73% 상한** — 실제는 tilt 97.77° 로 측면 타원 (실효 ≪ 상한). guard cumulative 는 mesh sphere 만 합산 (ring mesh 는 targetIds 밖) — 본 행은 DoD 정책 산출용 |
| titania                                | billboard 4px ≈ 12.6 px²                                                                          | +0.005%                                                                                                                                                        |
| **누적 (보수 상한)**                   | 9.96 + 0.55 + 0.73 + 0.005                                                                        | **≈ 11.25% (DoD 임계 25% margin 13.75%p)**                                                                                                                     |

### Visual Fidelity §의무 체크리스트 (4항목)

- [x] **데이터 SSoT 보존** — uranus 기존 필드 (radius/mass/orbit) 무수정. titania/uranus.rings/axialTiltDeg 는 NASA·JPL **실측값 신규 추가** (composite layer 의 inner/outer 도 실측 ring 6/ε 경계 — §축 2b 후보 (iv) 가공 반경 기각). mesh/ring/궤도 왜곡은 전부 rendering-only (`body-scale.ts` / tilt 회전 / `orbit-visual-scale.ts`)
- [x] **rendering 시점 분리** — physics 엔진 (Rust+wasm) 이 BODY_SCALE / axialTiltDeg / ORBIT_VISUAL_SCALE 무의존 (developer 검증 의무). tilt 는 ring disc rotation 한정
- [x] **UI overlay 실측값 표기** — CelestialInfoPanel uranus (25,559 km) / titania (788.4 km) 실측 radius 표기. mesh 왜곡값 표기 금지. uranus "× 250 과장 중" tooltip 자동 (getBodyScale 기존 경로)
- [x] **baseline 박제** — 핵심 박제값 표 + 산출 (uranus 45.24 px / 18.37% / uranus/earth 1.25 / ring outer 2.001배 / titania 2.79 px / orbit ×50 마진 1.65x / 모바일 누적 ≈ 11.25% 상한)

---

## Concrete Prediction (R7 "R8 ring 축 코드 0" 예측 재현 검증 + R8 예측 박제)

R7 §Concrete Prediction 의 R8 예측: "uranus = BODY_SCALE 1 + CURRENT_R_PHASE 1 + (위성 미정) — **ring 축 코드 0**". 본 ADR 검증 계획 + R8 자체 예측:

| 항목                                          | R7 예측       | R8 본 ADR 예측 | 사유                                                                                                                                                |
| --------------------------------------------- | ------------- | -------------- | --------------------------------------------------------------------------------------------------------------------------------------------------- |
| **ring 렌더 경로 (결합/colorHint/alphaHint)** | **0**         | **0**          | **R7 §축 2a generic 결합 + 스키마 적중 검증 대상** — uranus.rings 는 데이터만. 적중 시 추상화 건강성의 구체 증거 (재현 박제)                        |
| BODY_SCALE (uranus + titania)                 | 1 (위성 미정) | **2**          | titania 확정 (PM Q1)                                                                                                                                |
| CURRENT_R_PHASE 7→8                           | 1             | **1**          | #613 자동 생성 4번째 실전                                                                                                                           |
| ORBIT_VISUAL_SCALE (상수 + 룩업)              | (미예측)      | **2**          | §축 4                                                                                                                                               |
| FOCUS_BUTTONS uranus                          | (미예측)      | **1**          | §축 5                                                                                                                                               |
| **axialTilt 인프라 (신규 — R7 비-범위 격상)** | (미예측)      | **~10~12**     | §축 2a — 스키마 1 + loader 타입/매핑 2 + scene 전달 1~2 + ring-shader 옵션/적용 (shader/fallback/placeholder 3경로) 5~7                             |
| **코어 코드 합계**                            | ~2            | **≤ 18 라인**  | tilt 는 PM Q3 의 범위 격상 (R7 예측 시점의 비-범위) — 예측 실패가 아닌 **범위 변경으로 격리 카운트** (정직 박제). ring 축 자체의 0 예측은 독립 검증 |

별도 카운트 (데이터/가드/테스트): titania body json ~25줄 + uranus.rings json ~30줄 + axialTiltDeg 2값 + showInShortcutBar 1값 + ringAlphaHint 1값 / guard 스크립트 (off-screen 제외 ~8 + targetIds 2 + PX_RATIO_THRESHOLDS.uranus 1) / FOCUS_BODIES 2 id / body-scale.test 2 + r-phase-allowlist.test expected 갱신 + loader axialTiltDeg optional 하위 호환 테스트 / CHANGELOG.

**예측 검증 의무 (dev 단계)**: `git diff --stat` 으로 ① ring 렌더 경로 (`solar-system-scene.ts` ring 생성부 + `ring-shader.ts` — tilt diff 제외) 변경 0 ② 코어 합계 ≤ 18 라인 실측 재현. ① 적중 시 R7 예측 적중 박제, 초과 시 ring 추상화 리팩토링 신호 회고. **R9 prediction**: neptune (rings 보유 + tilt 28.32°) = BODY_SCALE 1~2 + CURRENT_R_PHASE 1 + ORBIT 룩업 (triton 시) 2 + **ring 축 코드 0 + tilt 축 코드 0** (R8 인프라 완비 — 데이터 2값만. 이 이중 0 예측 적중이 R8 tilt 추상화 건강성의 구체 증거)

---

## DoD (수치 — 검증 가능 완료 기준)

1. **uranus mesh visible + 제약 충족** — 1280×720 식 45.24 px (mid LOD 50 px 미만, 4px fallback 무의존). **uranus/earth px 비 1.25 ± 0.05** (PM 제약 "천왕성 > 지구" 정량화). 실측은 perspective 보정 허용
2. **세로 고리 가시** — uranus focus 에서 ring 이 궤도면 대비 거의 수직 (tilt 97.77°) 환형으로 명확 식별 (D-T2 실 Chrome). ring outer/uranus mesh 비 **2.001 ± 0.05** (사실 비율). ε ring 영역 (band 외곽) 최대 밝기 피크 식별
3. **saturn tilt 26.73° 동반 + R7 무회귀** — saturn focus 에서 ring 타원 기울어짐 식별. r1-guard pixel-diff 는 **baseline `--update` 갱신 후** 3 viewport 결정적 PASS (의도된 Behavior Change — CHANGELOG 박제). 갱신 전 FAIL 은 회귀 아님
4. **jupiter ring 무변화** — axialTiltDeg 미지정 (tilt 0 폴백) — jupiter focus D-T2 회귀 보고 0 (하위 호환 검증)
5. **titania 가시 + 분리** — `?focus=titania` 진입 성공 + billboard 가 고리 바깥 (visual orbit ×50, 산식 A 마진 1.65x ≥ 1.5). titania 궤도선이 uranus 추적 (#627 일반화 — 태양 원점 오렌더 0). **세로 궤도 (ecliptic ~98°) 는 정상 — 사전 등록 (§축 3)**
6. **r1-guard PASS** — `PX_RATIO_THRESHOLDS.uranus` 결정 트리 (§축 1) 수행 (실측 ×1.05 박제 또는 N/A 박제). 기존 body (sun~titan) 무회귀
7. **모바일 diskArea off-screen 제외 구현 + 재실측** — saturn `offScreen: true` 분류 확인 + 재정의 후 cumulative ≤ 25% (산출 상한 11.25%) + 신규 baseline 수치 박제
8. **단위 테스트 PASS** — r-phase-allowlist.test (#613/#617 uranus/titania 갱신) + body-scale.test + loader 스키마 (axialTiltDeg optional 하위 호환 — 미지정 body 폴백) 전체 green
9. **가드 동기화** — FOCUS_BODIES (#598) / RPHASE_EXPECTED_ENABLED (#617) / FOCUS_BUTTONS / r1-guard targetIds 정합 — CI `detect-and-test` green
10. **D-T2 실 Chrome GUI 수동 검증 ≥ 1회** (headless 만으로 종결 금지 — volt #77). headless 검증 URL 은 `?gpu=a&lod=auto` 필수 (R7 학습)

---

## 위험 / 미해결

### 위험 #1 — uranus > jupiter/saturn 시각 역전 (PM 제약의 수학적 귀결)

- uranus(45.2px) 가 jupiter(24.3)/saturn(20.5) 보다 크게 보임 — 사실 (jupiter 가 uranus 의 2.8배) 역전. PM 제약 (uranus > earth 36.1px) 충족의 필연 (earth > 거성 의 기존 수용 artifact 연장)
- 완화: D-T2 에서 사용자가 "천왕성이 목성보다 큼" 회귀 보고 시 — uranus 하향 (250→200대) 은 PM 제약과 충돌하므로 **architect 단독 Amendment 불가, PM 재합의 라운드 필수** (제약 완화 vs 거성 상향 재측정 trade-off 재상정)

### 위험 #2 — saturn tilt 동반의 r1-guard baseline 변경

- saturn ring 외형 변화 (수평 → 26.73° 타원) 로 pixel-diff baseline FAIL 예상 — **의도된 Behavior Change** 이지 회귀 아님
- 완화: dev 단계 `--update` 갱신 + 갱신 전후 스크린샷 비교를 PR 본문 박제 (의도 변화 시각 증거) + CHANGELOG Behavior Changes. 갱신 후 R7 무회귀 판별은 ring 외 영역 (본체/궤도선) pixel-diff 로 격리

### 위험 #3 — composite layer 의 시각 품질 (densityProfile 근사 한계)

- 9 narrow rings 를 15점 보간으로 합성 — 실제의 "빈 공간 + 가는 선" 대비 "연속 faint band + 피크" 근사. ε 피크 (0.93~1.0) 가 disc 해상도 (DISC_TESSELLATION 96 + fragment 보간) 에서 뭉개질 가능성
- 완화: D-T2 관찰. 피크 미식별 시 densityProfile 피크 폭 조정 (데이터만 — 실측 위치 보존) 또는 ringAlphaHint 0.8 → 1.0. 근본 개선 (텍스처 기반 ring) 은 후속 분리

### 위험 #4 — uranus px-ratio 측정 불안정 (19.19 AU 극단 artifact)

- saturn (9.54 AU) 이미 w=5.13 / x≈14k off-screen artifact (R7 Amendment 1 ①). uranus 는 projection 실패 (w≈0) 또는 viewport 간 비결정 가능
- 완화: §축 1 결정 트리 사전 박제 (실측 ×1.05 vs N/A fallback) — 측정 방법 검증 우선 (volt #32) 절차 내장

### 위험 #5 — titania 세로 궤도의 D-T2 오인

- ecliptic inclination ~98° 궤도선은 기존 body (전부 공전면 근처) 와 시각적으로 이질 — "버그" 오인 위험
- 완화: §축 3 사전 등록 + qa/D-T2 안내문에 "세로 궤도 = 사실 정합 (uranus 계 전체 누움)" 명시. 고리 평면 (tilt 97.77°) 과 titania 궤도 평면이 시각적으로 **대략 정렬**되어야 정상 — 불일치 시가 오히려 버그 신호 (frame 혼입 의심)

### 위험 #6 — tilt 방위각 근사 (pole RA/Dec 미사용)

- `rotation.x = π/2 + tiltRad` 는 회전축 방위각을 world X 로 고정 — 실제 uranus 자전축 방향 (RA 77.3°/Dec 15.2°) 미반영. 고리 기울기 _크기_ 는 정확, _방향_ 은 근사
- 완화: 주석 계약 박제. titania 궤도 (Horizons ecliptic 실측 각도) 와 고리 평면의 시각 정렬이 어긋나 보일 수 있음 — D-T2 관찰 후 필요 시 후속 이슈 (pole orientation 정밀화) 분리

### 위험 #7 — 12버튼 모바일 스크롤 UX (R7 §위험 #5 연장)

- `overflow-x-auto` 잘림 방지 유지 — 스크롤 인지 문제 잔존
- 완화: D-T2 모바일 확인. 불편 보고 시 후속 이슈 (bar 재설계는 R8 비-범위)

---

## 결과 / 재검토 조건 (Amendment 발동 트리거)

1. **#1 (uranus 크기 역전 회귀 보고)** — PM 재합의 라운드 발동 (architect 단독 조정 금지 — §위험 #1)
2. **#2 (titania 크기)** — D-T2 보고 → titaniaScale 500 → 650 / 350
3. **#3 (ring 밝기/피크)** — ringAlphaHint 0.8 → 1.0 (어두움) / 0.5 (과밝음), densityProfile 피크 폭 조정 (실측 위치 보존)
4. **#4 (궤도선-고리 간섭)** — ×50 → ×55 (마진 1.82x)
5. **#5 (guard 실측 편차)** — uranus 실측 px-ratio 결정 트리 (§축 1) — 측정 방법 검증 우선 (volt #32) 후 임계 또는 N/A 박제
6. **#6 (saturn tilt 회귀 판별 불가)** — pixel-diff 가 ring/본체 미분리 시 region 분리 측정 후속
7. **#7 (FOCUS_BODIES/#617 drift)** — 정적 매칭 가드 fail → 즉시 동기화
8. **#8 (off-screen 제외 후 cumulative 재실측 괴리)** — 예상 9.96% ± 3%p 초과 괴리 → 측정 방법 검증 우선

---

## R9 인계 (neptune — ice giant 2번째)

1. **ice giant 정책 답습** — neptune radius 2.4764e7 m = uranus 의 0.969배. **uranusScale=250 동일값 답습 시 px 43.8 — neptune < uranus 사실 서열 자동 보존** (R5 mars=earth / R7 saturn=jupiter 동형 패턴). ice giant 그룹 = 250 단일 mental model 완성
2. **ring 축 + tilt 축 이중 코드 0 예측** — neptune rings (Galle/Le Verrier/Lassell/Arago/Adams 5개) 데이터 + axialTiltDeg 28.32 데이터만 (§Concrete Prediction R9 예측). 단 **Adams ring arcs (각도 방향 비균질 — Liberté/Égalité/Fraternité)** 는 방사 densityProfile 로 표현 불가 — shader 한계 비-범위 예고 (균질 ring 근사 또는 후속 인프라)
3. **neptune narrow ring composite 재사용** — neptune rings 도 narrow (Adams 폭 ~35 km) — §축 2b composite layer 패턴 답습
4. **triton 역행 궤도** — inclination ~157° (역행) — 궤도선 방향 + Horizons frame (Neptune-centric J2000 Ecliptic) 주의. 위성 scale 은 titania 비율 패턴 (satellite/parent 0.05~0.09 수렴대) 산출
5. **neptune showInShortcutBar 이미 true (실측)** + FOCUS_BUTTONS 이미 존재 (R-Phase disabled) — **CURRENT_R_PHASE=9 1줄로 자동 enabled, FOCUS_BUTTONS 변경 0** (#613 Concrete Prediction)
6. **satellite N≥5 단일 룩업 한계** — 인계 유지 (uranus 5대 위성 / neptune 위성 추가 진입 시 `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 검토)
7. **모바일 diskArea off-screen 제외 신규 baseline** — R8 재실측값 기준으로 R9 산출 (22.96% 구버전 수치 사용 금지)

---

## 교차검증 반영 사항 (cross-validate 2026-06-10 agy outcome=applied)

agy 가 본 설계를 "R6/R7 교훈·제약을 정확히 반영한 완성도 높은 문서 — 보완 3건 전제 Accepted 권장" 으로 지지. 4축 분류:

- **합의 (4)**: ① ice giant 정책 신설 (사실 비율 의식적 미적용 + PM 직관 제약 — moon Amendment 4 계보) ② composite ring layer (개별 ring sub-pixel 구조적 비가시 → 데이터 SSoT 보존하며 rendering 근사 — Visual Fidelity 정합) ③ axialTiltDeg optional 스키마 하위 호환 (zod 0~180 범위 가드로 NaN 전파 차단) ④ ring-only tilt 의 한계 박제 ("본체 자전/텍스처 도입 시 host 통합 승격 재검토" — 마이그레이션 부담 시점 명확).
- **합의 — 기박제 확인 (1)**: saturn tilt → r1-guard baseline 갱신 의무 (§위험 #2 사전 박제와 agy WARNING 일치. 구현 dev 에게 "--update 갱신은 회귀 아님" 지침 전달).
- **고유 발견 수용 (2, 구현 단계 반영 의무)**: ① **densityProfile zod `.max(16)` 스키마 가드** — composite 15점이 shader `MAX_DENSITY_POINTS=16` 상한에 1점 여유뿐 → 파싱 레벨에서 초과 차단 (uniform overflow/컴파일 실패 방지). ② **titania 궤도 frame "Uranus-centric J2000 Ecliptic" 의무** — uranus 계는 적도면(Laplace plane) 좌표 혼입 시 고리(97.77°)와 궤도선이 비정렬 교차하는 버그. R7 titan frame 선례 답습 + dataSource 주석 박제 (§축 3 강조 격상).
- **고유 발견 — D-T2 확인 항목 (1)**: **tilt 의 rotation.x 단축 근사** — pole RA/Dec 방위각 미정의라 기울임 방향이 임의 → 시각 정합 (공전 궤도와의 논리 정합) 을 구현 D-T2 에서 육안 확인 (§DoD 추가).
- **이견 (0)** / architect 권고 질문 4건 (composite 경계 / 시각 역전 / tilt 잠복 결합 / off-screen 경계) 에 대한 agy 별도 이의 없음 — 설계 박제 유지.

### Claude 편향 셀프 체크 (architect 사전 기록 — cross-validate 호출 전)

- **낙관적 일정** — 코어 ≤ 18 라인이나 tilt 3경로 (shader/fallback/placeholder) + guard metric 재정의 + saturn baseline 갱신 + D-T2 iteration 으로 Amendment 라운드 N≥1 예상 박제. 통과
- **결합 간과** — 본 라운드 핵심 4중 결합 전부 명시: (a) PM 제약 (uranus>earth) → 거성 시각 역전 전파 (§위험 #1 — PM 재합의 경로 사전 박제), (b) saturn tilt 동반 → r1-guard baseline 전파 (§위험 #2), (c) ring outer × uranusScale 250 → orbit binding 전파 (§축 4 ×30 함정값), (d) off-screen 제외 → guard baseline 수치 전면 갱신 전파 (§축 6). 통과
- **폐기 프레이밍** — R7 "R8 ring 축 코드 0" 예측을 tilt 격상에도 불구하고 폐기하지 않고 **범위 변경 격리 카운트** 로 독립 검증 유지. Q2=B 거성 예외도 폐기가 아닌 적용 범위 한정 (gas giant 한정) 으로 보존. 통과
- **순수주의** — 사실 비율 (3.67%) 순수 보존 대신 PM 직관 제약 우선 (ice giant 정책) + composite ring 의 rendering 근사 수용 — Visual Fidelity §1 (SSoT 보존 + rendering 왜곡 허용) 정합. 통과
