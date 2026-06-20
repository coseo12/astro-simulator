# ADR: R11 토성계 위성 확장 3개 (Rhea / Iapetus / Enceladus) — body scale + orbit visual scale binding 재산출 (enceladus 최내곽 binding + `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 첫 발동)

- **상태**: **Provisional** (신규 ADR — cross-validate 발동 대상. CLAUDE.md §ADR Status 워크플로 #370: cross-validate 결과 §교차검증 반영 사항 본문 통합 전까지 Provisional. 통합 후 Accepted 전이)
- **날짜**: 2026-06-20
- **결정자**: architect (R11 토성계 위성 확장 — 사용자 합의 범위 2026-06-20: Rhea/Iapetus/Enceladus 3개 / showInShortcutBar=false / 모천체 saturn 기존). 메인 오케스트레이터가 사용자와 합의한 범위 위에서 scale/orbit/allowlist 결정.
- **관련**:
  - [#721](https://github.com/coseo12/astro-simulator/issues/721) (본 스프린트)
  - 선례 SSoT (위성 추가 표준 패턴 — **반드시 답습**):
    - [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) (R6 — **satellite 4개 첫 본 사례** / satellite scale 산출 표준 (사실 비율 vs 시각 직관 trade-off) / **§축 4 산식 A(설계 임계) vs B(검증 metric) 분리 SSoT** / §재검토 트리거 #3 — **`ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 인계**)
    - [`20260610-r7-saturn-titan-rings-visualization.md`](20260610-r7-saturn-titan-rings-visualization.md) (R7 — **모천체 saturn / titan / ring 박제 SSoT** / **§축 4 binding constraint = F ring outer mesh (parent mesh 아님 — R7 신규 유형) — 본 ADR 답습 핵심**)
    - [`20260610-r8-uranus-titania-rings-visualization.md`](20260610-r8-uranus-titania-rings-visualization.md) (R8 — ice giant scale / titania=500 / ring binding 2번째 인스턴스 / §축 3 세로 궤도 사전 등록)
    - [`20260610-r9-neptune-triton-rings-visualization.md`](20260610-r9-neptune-triton-rings-visualization.md) (R9 — triton scale (비율이 SSoT, 값 답습 기각) / ring binding 3번째 인스턴스 / §축 3 역행 사전 등록)
    - [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) (R5 — **§위험 #6 + §재검토 트리거 #4 — `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 인계 원천** / satellite 2개 첫 본 사례)
  - 인프라 SSoT:
    - [`20260604-613-r-phase-metadata-ssot.md`](20260604-613-r-phase-metadata-ssot.md) (**R-Phase 메타데이터 SSoT — `CURRENT_R_PHASE` 1줄 + `introducedInRPhase` 데이터 필터 자동 생성. Concrete Prediction 근거**)
    - [`20260620-713-click-body-select.md`](20260620-713-click-body-select.md) (#713 클릭/터치 선택 — picking predicate `metadata.bodyId + allowlist`. **신규 mesh 자동 포함 근거**)
    - [`20260620-719-overlap-cycle.md`](20260620-719-overlap-cycle.md) (#719 겹침 cycle — `scene.multiPick` predicate 동일 SSoT. **위성↔ring↔saturn disk 겹침 cycle 자동 포함 근거**)
    - [`20260609-622-orbit-scale-gap-no-op.md`](20260609-622-orbit-scale-gap-no-op.md) (산식 A vs B metric 정의 차이 NO-OP SSoT — 재오인 분석 금지)
  - 횡단 원칙: [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541, 의무 체크리스트 4항목)
  - 용어: [`docs/glossary.md`](../glossary.md) (R-Phase / Floating Origin / binding constraint / 산식 A·B / orbit visual scale)
- **교훈 적용**:
  - "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (#613 메타데이터 SSoT — `introducedInRPhase=12` 데이터 부여 + `CURRENT_R_PHASE=11→12` 1줄로 allowlist 자동 전파. R6/R7~R10 Concrete Prediction 재현 — 단 본 라운드는 **orbit visual scale 단일 룩업 한계로 코드 0 보장 불가 축** 존재)
  - "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21) — picking predicate (#713/#719) / `ORBIT_VISUAL_SCALE_BY_PARENT` 룩업 / ring×bodyScale (R7) 100% 재사용. `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 는 신규지만 R5 §위험 #6 에서 이미 인터페이스 설계 인계)
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — 4 위성 (titan+3) 사실 비율 vs 시각 직관 mismatch 측정 의무. moon Amendment 4 / R6 §결정 2 답습)
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt [#77](https://github.com/coseo12/volt/issues/77) — 실 Chrome GUI D-T2 의무. ring + 위성 4개 occlusion/cycle 시각 효과 포함)
  - "수치 DoD 미달 시 측정 방법 검증 우선 / measurement-first" (volt [#32](https://github.com/coseo12/volt/issues/32) — body scale px 직관은 **developer 가 `scripts/_debug-721-*-tmp.mjs` (즉시 rm) runtime 실측 후 확정**. architect 는 산식 + 후보 범위만 제시)
  - "결합 간과 — Claude 4종 편향" (volt [#29](https://github.com/coseo12/volt/issues/29) — **본 라운드 핵심**: enceladus (최내곽) 추가가 binding constraint 를 titan → enceladus 로 이동 + iapetus (최외곽, a 편차 15배) 과분리 동시 발생. 두 극단이 단일 visual scale 로 양립 불가 → `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 첫 발동 후보)

---

## 현재 유효 결정 요약 (Living ADR Executive Summary)

> 본 ADR 은 **Provisional** (cross-validate 통합 전). Amendment 라운드 N (≥1) 예상. 후속 위성 확장 architect 가 빠르게 결정 파악할 수 있도록 **현재 유효한 박제값과 결정만** 본 섹션에 요약. 상세 후보 비교 / Concrete Prediction 은 §축 N 본문 참조.

### 핵심 박제값 (architect 권고 — body scale 은 developer 실측 후 확정)

| 항목                                       | 박제값 (권고)                                                | 위치                                            | 비고                                                                                                                                                                                                                                                            |
| ------------------------------------------ | ------------------------------------------------------------ | ----------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BODY_SCALE.rhea`                          | **250** (후보 [200, 300], developer 실측)                    | `apps/web/src/constants/body-scale.ts`          | §축 1 — mesh 비율 0.066 (moon/earth 0.068 수렴대), sub-pixel (식 1.35px) → 4px fallback billboard 의존 (titan 1.82px 선례 동형)                                                                                                                                 |
| `BODY_SCALE.iapetus`                       | **250** (rhea 동일값)                                        | 동                                              | §축 1 — radius 734.5km ≈ rhea 764km (0.961배). mesh 비율 0.064. 단일값 mental model "rhea ≈ iapetus" + 사실 비율 0.961 자동 보존                                                                                                                                |
| `BODY_SCALE.enceladus`                     | **250** (rhea/iapetus 동일값) 또는 **500** (차등)            | 동                                              | §축 1 — **결정 포인트**: enceladus radius 252km = rhea 의 0.33배. 동일 250 시 mesh 비율 0.0218 (수렴대 미달, 4px fallback 흡수) vs 차등 500 시 0.0436 (rhea 와 시각 차이 명확). developer D-T2 관찰로 확정                                                      |
| `ORBIT_VISUAL_SCALE_BY_PARENT.saturn`      | **10 유지 (titan)** + **`BY_PARENT_AND_BODY` 신규 per-body** | `packages/core/src/scene/orbit-visual-scale.ts` | §축 2 — **본 ADR 핵심 결정**. enceladus binding (×10 마진 0.35x 묻힘) ↔ iapetus 과분리 (×47 시 saturn mesh 의 55배) 가 단일 visual scale 로 양립 불가 → **`ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 도입** (R5 §위험 #6 / R6 §재검토 트리거 #3 첫 발동) |
| `SATURN_MOON_ORBIT_VISUAL_SCALE.enceladus` | **47** (마진 1.64x, 후보 [45, 50])                           | 동 (신규 per-body 룩업)                         | §축 2 — enceladus binding (최내곽). 마진 1.64x (titania/triton 1.65x 정합)                                                                                                                                                                                      |
| `SATURN_MOON_ORBIT_VISUAL_SCALE.rhea`      | **20** (마진 1.52x, 후보 [18, 22])                           | 동                                              | §축 2 — rhea a=527108km (titan 의 0.43배). ×10 시 0.76x 묻힘 → ×20 분리                                                                                                                                                                                         |
| `SATURN_MOON_ORBIT_VISUAL_SCALE.titan`     | **10** (기존 유지, 마진 1.74x)                               | 동                                              | §축 2 — R7 박제값 보존 (회귀 0). 기존 titan 사용자 인지 유지                                                                                                                                                                                                    |
| `SATURN_MOON_ORBIT_VISUAL_SCALE.iapetus`   | **10** (기존 답습, 마진 5.13x)                               | 동                                              | §축 2 — iapetus a=3560820km (titan 의 2.9배). ×10 으로도 자동 안전 (마진 5.13x). 과분리 회피 위해 titan 동일값                                                                                                                                                  |
| `introducedInRPhase` (3 위성)              | **12**                                                       | `packages/shared/data/solar-system.json`        | §축 3 — 로드맵 v3 (R10b, phase 11) 전 데이터 소진 후 신규 콘텐츠 라운드                                                                                                                                                                                         |
| `CURRENT_R_PHASE`                          | **11 → 12** (1줄)                                            | `packages/core/src/scene/r-phase-allowlist.ts`  | §축 3 — #613 자동 생성. allowlist 자동 전파                                                                                                                                                                                                                     |
| JPL 데이터 frame                           | **Saturn-centric J2000 Ecliptic (osculating)**               | `solar-system.json` 각 위성 orbit + `$comment`  | §축 4 — titan §위험 #6 답습. **Laplace plane 혼입 금지** 명시                                                                                                                                                                                                   |
| picking predicate (#713/#719)              | **변경 0줄** (데이터 추가만으로 자동 포함)                   | `packages/core/src/scene/body-picking.ts`       | §축 5 — `metadata.bodyId + allowlist` 가 데이터 driven. cycle 자동 포함                                                                                                                                                                                         |

### 핵심 결정 요약

1. **3 위성 scale = 250 (rhea/iapetus) + enceladus 250 또는 500** (§축 1): mesh 비율 0.05~0.09 수렴대 (moon/earth 0.068 / titan/saturn 0.089) 기준. titan=100 직접 답습 시 rhea/iapetus 가 0.026 (과소) → ~250 으로 수렴대 진입. **enceladus 는 radius 가 rhea 의 0.33배라 단일값(250) 시 수렴대 미달** — 차등(500) vs 단일(250) 은 developer D-T2 실측 확정 (산식 + 후보 범위만 박제)
2. **orbit visual scale — `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 첫 발동** (§축 2): **본 ADR 핵심**. saturn 단일 visual scale ×10 (titan 기준) 은 enceladus (최내곽, a 0.43배) 를 묻고 (마진 0.35x), enceladus binding 충족 위해 ×47 로 상향하면 iapetus (최외곽, a 15배) 가 saturn mesh 의 55배로 과분리. **R5 §위험 #6 / R6 §재검토 트리거 #3 에서 인계한 per-body 룩업이 첫 발동** — titan ×10 유지 (회귀 0) + enceladus ×47 + rhea ×20 + iapetus ×10
3. **CURRENT_R_PHASE=11→12 (1줄)** (§축 3): #613 메타데이터 SSoT 자동 생성. 로드맵 v3 (phase 11, R10b) 전 데이터 소진 후 **신규 콘텐츠 라운드 (R11)**. `introducedInRPhase=12` 데이터 부여
4. **JPL frame = Saturn-centric J2000 Ecliptic (osculating)** (§축 4): titan §위험 #6 답습. a/e 는 NASA Fact Sheet, 각도 요소는 JPL Horizons (2026-01-01 TDB epoch). **Laplace plane 혼입 금지** (P10-D galilean frame 통일 선례)
5. **picking/cycle 자동 포함 — 코드 0** (§축 5): #713 predicate (`metadata.bodyId + allowlist`) + #719 `multiPick` 동일 SSoT 가 데이터 driven. 신규 mesh 가 metadata.bodyId 부여 + allowlist 통과로 자동 포함

### 비-범위 (사용자 합의 2026-06-20 + R-Phase 답습)

- 다른 거성 위성 (천왕성 Oberon/Miranda, 해왕성 Proteus/Nereid) ❌ — 후속 라운드
- 토성 추가 위성 (Dione/Tethys/Mimas/Hyperion) ❌ — 후속
- 위성 표면 텍스처/디테일/albedo (iapetus 명암 대비 양면, enceladus 간헐천 분사 visual) ❌
- saturn ring 변경 ❌ (R7 박제 보존)
- titan scale/orbit 변경 ❌ (R7 박제 보존 — orbit visual scale ×10 유지로 회귀 0)
- 실측 데이터 변경 ❌ (`solar-system.json` orbit/radius SSoT 보존 — rendering 시점에만 visual scale)
- LOD 시스템 변경 ❌
- showInShortcutBar=true 승격 ❌ (사용자 합의 — URL/클릭 진입만. 3 위성 모두 false)

### 후속 라운드 인계 의무

- **`ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 SSoT** — 본 ADR 이 per-body 룩업 첫 도입. saturn 추가 위성 (Dione/Tethys 등) / 천왕성·해왕성 다중 위성 진입 시 동일 per-body 룩업 답습. parent 단일 룩업 (`ORBIT_VISUAL_SCALE_BY_PARENT`) 은 **단일 위성 또는 a 편차 ≤ 5배** parent 에만 적용 (titan 단독 R7 / galilean 4 편차 4.5배 R6)
- satellite N (a 편차) 가 큰 parent 진입 시 binding constraint 가 ring 보유 여부 + 최내곽 위성 a 로 결정됨 — **최내곽 위성이 binding, 최외곽이 과분리** 패턴 답습
- 4px fallback 의존 위성 (rhea/iapetus/enceladus 모두 sub-pixel) 의 D-T2 시각 식별은 billboard marker (#675 glow) + focus mesh 관찰 경로 (R5~R10 선례) 답습

---

## 통합 vs 분리 결정 (메타)

본 ADR 은 R6~R10 §"R-Phase 단일 ADR 패턴" 답습:

- **단일 ADR 통합** — 토성계 위성 확장 결정 N건 (3 위성 scale / per-body orbit visual scale / allowlist / JPL frame / picking 자동 포함) 을 단일 ADR 로 통합. 파일명 `20260620-721-saturn-moons-rhea-iapetus-enceladus.md`
- **로드맵 v3 외 신규 콘텐츠 라운드 (R11)** — R10b (phase 11) 가 로드맵 v3 의 마지막 라운드 (27 body 전 데이터 소진). 본 라운드는 v3 완주 후 **위성 탐색 인프라 (#713 클릭 / #719 cycle) 위에 콘텐츠 확장**. phase 정수 12 로 진행 (로드맵 v3 라벨 매핑 외 — 본 ADR 이 R11 신규 박제)
- **per-body 룩업 첫 본 인스턴스화** — R5 §위험 #6 (2026-05-28) 에서 인터페이스 설계 인계 → R6 §재검토 트리거 #3 (2026-06-05) 에서 발동 조건 정밀화 → **본 ADR 첫 실전 도입** (2026-06-20). 1.5개월 인계 후 첫 발동

---

## 배경

### 진입 조건

[#721](https://github.com/coseo12/astro-simulator/issues/721) — 토성은 현재 위성이 **titan 1개**(R7)뿐. #713 클릭/터치 선택 + #719 겹침 cycle 로 위성 탐색 인프라가 완성됐으므로, 그 위에 토성계 주요 위성 3개 (천문학적 명성/크기 기준 사용자 선정) 를 확장한다.

- **Rhea** (radius 764km) — 토성 2번째 큰 위성
- **Iapetus** (734.5km) — 양면 명암 대비("두 얼굴") 위성, 명성 높음
- **Enceladus** (252km) — 간헐천 분사(생명 탐사 관심) 위성

사용자 합의 (2026-06-20): 3개 / showInShortcutBar=false (URL·클릭 진입) / 모천체 saturn 기존.

### 현재 baseline 실측 (2026-06-20 develop tip = `5092c19`)

`body-scale.ts` 위성 scale 실측 (수렴값 패턴):

```typescript
// satellite mesh 비율 (sat_radius×sat_scale)/(parent_radius×parent_scale) 수렴대 [0.05~0.09]:
moon: 200,    // moon/earth mesh 비율 0.068 (수렴 기준)
titan: 100,   // titan/saturn mesh 비율 0.089 (ganymede-class, R7 #641)
io/europa/ganymede/callisto: 100,  // galilean (R6 #627 옵션 D, moon 0.068 근접)
titania: 500, // titania/uranus mesh 비율 0.062 (R8 — uranus=250 이 gas giant 48 의 5.2배라 scale 상향)
triton: 300,  // triton/neptune mesh 비율 0.066 (R9 — 비율 SSoT, titania 값 답습 기각)
```

`orbit-visual-scale.ts` 실측 (`SATURN_SATELLITES_ORBIT_VISUAL_SCALE = 10`, binding = F ring outer):

```
titan 분리 마진 (산식 A) = (1.22187e9 × 10) / (F_ring_outer_mesh 6.7526e9 + titan_mesh 2.575e8) = 1.74x
binding constraint = F ring outer mesh (1.4018e8 × 48 = 6.7526e9 m, saturn mesh 2.8929e9 의 2.334배) — R7 신규 유형
```

`r-phase-allowlist.ts` 실측:

```typescript
export const CURRENT_R_PHASE = 11; // R10b #664 — 전 데이터 소진 (27 body, 로드맵 v3 최종 라운드)
// 데이터 introducedInRPhase 값 존재 범위: [1..11] (phase 12 미사용 — 본 ADR 이 첫 사용)
```

picking predicate 실측 (`body-picking.ts`): `scene.pick` 1차 / `scene.multiPick` (#719 cycle) 모두 predicate = `활성 LOD variant + metadata.bodyId 존재 + allowlist (isRPhaseFocusable)`. **궤도선/ring/배경 mesh 는 metadata.bodyId 가 없어 조기 필터** — 신규 위성 mesh 가 metadata.bodyId 부여 + allowlist 통과로 자동 포함.

### 데이터 출처 (NASA Fact Sheet — radius / a / e)

| 위성             | radius (km) | a (km)    | a (AU)   | e      | i (Saturn Ecliptic, °)                    | 출처                                                      |
| ---------------- | ----------- | --------- | -------- | ------ | ----------------------------------------- | --------------------------------------------------------- |
| **Enceladus**    | 252.1       | 238,040   | 0.001591 | 0.0047 | ~28.05                                    | NASA Enceladus Fact Sheet + JPL Horizons (developer 쿼리) |
| **Rhea**         | 764.0       | 527,108   | 0.003523 | 0.0013 | ~28.24                                    | NASA Rhea Fact Sheet + JPL Horizons                       |
| **Titan** (기존) | 2575.0      | 1,221,870 | 0.008168 | 0.0288 | 27.709                                    | (R7 박제 — 참조용)                                        |
| **Iapetus**      | 734.5       | 3,560,820 | 0.023803 | 0.0286 | ~17.28 (Saturn 적도 ~7.6°, Ecliptic 변환) | NASA Iapetus Fact Sheet + JPL Horizons                    |

> ⚠️ 위 a/e/i 는 architect 참조용 NASA Fact Sheet 근사. **각도 요소 (i / OM / W / MA → ϖ / L)** 는 developer 가 **JPL Horizons API 직접 쿼리** (titan §comment 패턴 답습 — Saturn-centric J2000 Ecliptic, osculating, 2026-01-01 00:00 TDB epoch). a/e 는 NASA Fact Sheet 박제. **Laplace plane 값 혼입 금지** (§축 4).

### a 편차 — 단일 룩업 한계의 근본 원인

```
enceladus a = 0.001591 AU (최내곽)
iapetus  a = 0.023803 AU (최외곽)
편차 = iapetus / enceladus = 14.96배   ← R6 galilean 4.5배 / R5 phobos-deimos 2.5배 대비 3.5배 큼
```

이 15배 편차가 **단일 visual scale 로 binding (enceladus) 과 과분리 (iapetus) 를 양립 불가**하게 만든다 (§축 2 핵심).

---

## 후보 비교

### 축 1 — 3 위성 body scale (satellite mesh 비율 수렴대 [0.05~0.09])

satellite scale 산출 표준 (R4~R10 SSoT): `mesh 비율 = (sat_radius × sat_scale)/(parent_radius × parent_scale)` 를 수렴대 [0.05~0.09] (moon/earth 0.068 / titan/saturn 0.089) 안으로. saturn_scale=48, parent_mesh = 60268000 × 48 = 2.8929e9 m.

산식 (1280×720): `px_diameter = sat_radius × scale × k`, k = 7.0806e-9.

| 위성      | radius (m) | scale=100 (titan 답습) mesh 비율 | scale=200 | scale=250                | scale=300 | scale=500                | scale=250 시 px          |
| --------- | ---------- | -------------------------------- | --------- | ------------------------ | --------- | ------------------------ | ------------------------ |
| rhea      | 764,000    | 0.0264 (과소)                    | 0.0528    | **0.0660**               | 0.0792    | 0.1320 (과대)            | 1.35 px (sub-4 fallback) |
| iapetus   | 734,500    | 0.0254 (과소)                    | 0.0508    | **0.0635**               | 0.0762    | 0.1270 (과대)            | 1.30 px (sub-4 fallback) |
| enceladus | 252,100    | 0.0087                           | 0.0174    | **0.0218** (수렴대 미달) | 0.0261    | **0.0436** (수렴대 진입) | 0.45 px (sub-4 fallback) |

#### 후보 평가

| 후보                                                                 | rhea/iapetus                       | enceladus                              | mental model                | 평가                                                                                                                                                                                                                           |
| -------------------------------------------------------------------- | ---------------------------------- | -------------------------------------- | --------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| A. titan=100 직접 답습 (3개 모두 100)                                | 0.026 (과소, titan 0.089 의 0.3배) | 0.009                                  | "토성 위성 = 100" 단순      | **기각** — rhea/iapetus 가 titan 의 1/3.4 로 너무 작음. 사실 rhea/titan radius=0.30 이나 mesh 비율 0.026/0.089=0.30 정합이지만 **수렴대 [0.05~0.09] 이탈로 시각 인지 약함**                                                    |
| **B. 3개 모두 250 (단일값)**                                         | **0.066/0.064 (수렴대 중앙)**      | **0.022 (수렴대 미달, fallback 흡수)** | "토성 추가 위성 = 250" 단일 | **권고 1순위** — rhea/iapetus 수렴대 정합 + 사실 radius 비 (iapetus/rhea 0.961) 자동 보존. enceladus 는 수렴대 미달이나 4px fallback billboard 흡수 (phobos/deimos §결정 6 동형 — 사실 radius 0.33배 정직 반영). 단일값 단순성 |
| C. rhea/iapetus=250 + enceladus=500 (차등)                           | 0.066/0.064                        | 0.044 (수렴대 진입)                    | "enceladus 만 보정"         | **권고 2순위** — enceladus 가 수렴대 진입해 rhea 와 시각 차이 명확. 단 사실 radius (enceladus=rhea 의 0.33배) 를 의도적 위배 (moon Amendment 4 / phobos 유형). developer D-T2 에서 enceladus 가 "안 보임"이면 채택             |
| D. body별 사실 비율 정밀 차등 (rhea=250, iapetus=260, enceladus=750) | 미세 보정                          | —                                      | 복잡                        | **기각** — 단일값 단순성 손실. R10a/R10b 단일값 그룹 정책 (서열 가드 전제) 역행                                                                                                                                                |

#### 선택 — **후보 B (3개 모두 250) 권고. enceladus 는 developer D-T2 실측으로 250↔500 확정** (measurement-first)

근거:

1. **수렴대 정합 (rhea/iapetus)** — scale 250 에서 mesh 비율 0.066/0.064 (moon 0.068 / titan 0.089 사이). titan=100 직접 답습 (0.026) 은 수렴대 이탈로 기각
2. **사실 radius 비 자동 보존** — rhea(764km) ≈ iapetus(734.5km) (0.961배) 가 동일 scale 250 으로 mesh 비율 0.066/0.064 = 0.964 정합. R5 mars=earth / R7 saturn=jupiter 동형 단일값 패턴
3. **enceladus 4px fallback 흡수** — enceladus radius 252km 는 rhea 의 0.33배. scale 250 시 mesh 0.022 (수렴대 미달) 이나 **모든 토성 위성이 어차피 sub-pixel (rhea 1.35px / enceladus 0.45px)** → billboard fallback 전면 의존 (phobos/deimos / titan / galilean 선례 동형). billboard 는 실반경 무관 최소 marker 라 enceladus 가 안 보이지는 않음
4. **enceladus 250↔500 measurement-first** — developer 가 `scripts/_debug-721-scale-tmp.mjs` (즉시 rm) 로 billboard marker 실측 + D-T2 에서 "enceladus 가 rhea 대비 식별 가능한가" 관찰. 식별 불가 시 차등 500 (후보 C). architect 는 산식 + 후보 [250, 500] 만 박제
5. **단일값 mental model** — "토성 추가 위성 = 250" (단 enceladus 예외 시 명시 주석). R10a dwarf=800 / R10b comet=5000 단일값 그룹 정책 답습

> **D-T2 검증 의무** — 4 위성 (titan 기존 + 3 신규) 이 saturn focus 에서 식별 + 사실 크기 순서 (titan ≫ rhea ≈ iapetus > enceladus) 시각 반영. billboard fallback 으로 4개가 동일 marker 크기면 #675 glow marker 패턴 의존 (정상 — sub-pixel 위성 공통).

---

### 축 2 — orbit visual scale: `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 (본 ADR 핵심)

#### binding constraint 재산출 (titan → enceladus 이동)

R7 binding = F ring outer mesh (`1.4018e8 × 48 = 6.7526e9 m`). 4 위성 각각 ×10 (saturn 기존) 분리 마진 (산식 A = `visual_orbit / (F_ring_outer + sat_mesh)`):

| 위성          | a (m)   | visual_orbit (×10) | sum_mesh (m) | 마진 (×10) | 판정                                                     |
| ------------- | ------- | ------------------ | ------------ | ---------- | -------------------------------------------------------- |
| **enceladus** | 2.380e8 | 2.380e9            | 6.816e9      | **0.35x**  | **묻힘 (binding — 최내곽)**                              |
| rhea          | 5.271e8 | 5.271e9            | 6.944e9      | 0.76x      | 묻힘                                                     |
| titan (기존)  | 1.222e9 | 1.222e10           | 7.010e9      | 1.74x      | ✅ (R7 박제 — ×10 으로 충분했던 이유 = titan 이 ring 밖) |
| iapetus       | 3.561e9 | 3.561e10           | 6.936e9      | 5.13x      | ✅ 자동 안전 (최외곽)                                    |

**핵심 발견**: titan (R7) 은 a 가 ring outer 밖이라 ×10 으로 1.74x 충족. 하지만 **enceladus (a 0.43배)/rhea 는 ring 안쪽 영역**이라 ×10 으로 ring 에 묻힌다. enceladus 가 새 binding constraint.

#### enceladus binding 충족 visual scale + iapetus 과분리

enceladus 마진 1.5 충족 = ×43, 1.65 (titania/triton 선례) = ×47.

| visual_scale           | enceladus 마진 | rhea 마진    | titan 마진 | iapetus 마진 | iapetus visual orbit (AU) |
| ---------------------- | -------------- | ------------ | ---------- | ------------ | ------------------------- |
| × 10 (saturn 기존)     | 0.35x (fail)   | 0.76x (fail) | 1.74x      | 5.13x        | 0.238                     |
| × 47 (enceladus 1.64x) | **1.64x**      | 3.57x        | 8.19x      | 24.13x       | **1.119 (과분리)**        |
| × 50                   | 1.75x          | 3.80x        | 8.72x      | 25.67x       | 1.190                     |

**문제**: 단일 visual scale 로 enceladus 를 충족 (×47) 하면 iapetus visual orbit = 1.119 AU (지구-태양 거리보다 큼) → saturn mesh 의 55배 거리로 과분리. titan(×10, 기존)이 saturn mesh 의 19배였던 것 대비 비정상. **enceladus binding (×47) ↔ iapetus 과분리가 a 15배 편차로 양립 불가**.

#### 후보 평가

| 후보                                                              | 방식                                               | 코드 영향                                | 평가                                                                                                                                            |
| ----------------------------------------------------------------- | -------------------------------------------------- | ---------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------- |
| A. saturn 단일 ×47 (전체 상향)                                    | `ORBIT_VISUAL_SCALE_BY_PARENT.saturn = 10→47`      | 1줄 (코드 0 유지)                        | **기각** — enceladus 충족하나 iapetus 55배 과분리 (화면 밖) + **titan ×10→×47 회귀** (기존 사용자 인지 4.7배 변화, R7 박제 파괴)                |
| B. saturn 단일 ×20 (절충)                                         | `= 10→20`                                          | 1줄                                      | **기각** — enceladus 0.70x 여전히 묻힘 + titan ×2 회귀. 양극단 모두 미충족                                                                      |
| **C. `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 per-body 룩업** | enceladus ×47 / rhea ×20 / titan ×10 / iapetus ×10 | **코어 ~10줄 (신규 룩업 + getter 분기)** | **선택** — 각 위성 binding 독립 충족. titan ×10 유지 (회귀 0) + enceladus/rhea 만 상향 + iapetus 자동 안전. R5 §위험 #6 인터페이스 설계 첫 실전 |

#### per-body visual scale 박제값 (후보 C — 각 위성 마진 ≥ 1.5)

| 위성          | a (m)   | sum_mesh (m) | visual scale (권고)   | 마진 (산식 A) | 근거                                                  |
| ------------- | ------- | ------------ | --------------------- | ------------- | ----------------------------------------------------- |
| **enceladus** | 2.380e8 | 6.816e9      | **47** (후보 [45,50]) | 1.64x         | binding (최내곽). titania/triton 1.65x 정합           |
| **rhea**      | 5.271e8 | 6.944e9      | **20** (후보 [18,22]) | 1.52x         | ×10 시 0.76x 묻힘 → ×20 분리 (마진 1.52x, ≥1.5 +0.02) |
| **titan**     | 1.222e9 | 7.010e9      | **10** (기존 유지)    | 1.74x         | **R7 박제 보존 (회귀 0)**. 기존 사용자 인지 유지      |
| **iapetus**   | 3.561e9 | 6.936e9      | **10** (titan 답습)   | 5.13x         | 자동 안전 (최외곽). 과분리 회피 위해 최소값 ×10       |

#### 선택 — **후보 C: `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 per-body 룩업**

근거:

1. **단일 룩업 한계 첫 발동** — R5 §위험 #6 (2026-05-28) → R6 §재검토 트리거 #3 (2026-06-05) 에서 인계한 per-body 룩업이 **a 15배 편차 (enceladus↔iapetus) 로 처음 필요**. R6 galilean (4.5배) / R5 phobos-deimos (2.5배) 는 단일 룩업으로 충분했으나 토성계 4 위성 (titan 포함) 편차가 임계 초과
2. **각 위성 binding 독립 충족** — enceladus ×47 (1.64x) / rhea ×20 (1.52x) / titan ×10 (1.74x, 기존) / iapetus ×10 (5.13x). 모두 ≥ 1.5 임계
3. **titan 회귀 0** — R7 박제 ×10 유지. 단일 룩업 상향 (후보 A/B) 의 titan 인지 파괴 회피. 기존 사용자가 본 titan 궤도 위치 보존
4. **iapetus 과분리 회피** — iapetus 는 a 가 이미 크므로 (titan 의 2.9배) ×10 으로 자동 안전. 단일 ×47 (후보 A) 의 55배 과분리 회피 — iapetus 를 ×10 으로 두면 saturn mesh 의 5.5배 거리 (자연스러움)
5. **fallback `ORBIT_VISUAL_SCALE_BY_PARENT` 호환** — 신규 per-body 룩업 미정의 시 기존 parent 룩업으로 fallback (earth/mars/jupiter/uranus/neptune 위성은 per-body 룩업 미사용 — 코드 0 회귀). titan 은 per-body 에 명시 (saturn parent 룩업과 동시 존재 시 per-body 우선)

> **Concrete Prediction 영향**: 본 축이 **"코드 0 보장 불가 축"** (R10b 혜성 chord 조건부 축 패턴 동형). 신규 per-body 룩업 + getter 분기 = **코어 ~10줄 신규**. 나머지 축 (scale/allowlist/picking) 은 코드 0. §결과·재검토 §Concrete Prediction 참조.

> **D-T2 검증 의무** — 4 위성 궤도선이 saturn focus 에서 ring 밖으로 분리 + iapetus 가 화면 안 (×10) + enceladus 가 ring 바로 밖 (×47). 산식 A (설계 임계) 와 산식 B (runtime 실측) 직접 비교 금지 (#622 NO-OP SSoT). 궤도선-ring 시각 간섭 보고 시 enceladus ×47→×50 fallback.

---

### 축 3 — `introducedInRPhase` / `CURRENT_R_PHASE` (R11 신규 콘텐츠 라운드)

로드맵 v3 는 R10b (phase 11, #664) 에서 27 body 전 데이터 소진 = 마지막 라운드. 본 위성 확장은 **v3 완주 후 신규 콘텐츠**.

| 후보                              | introducedInRPhase | CURRENT_R_PHASE   | 평가                                                                                                              |
| --------------------------------- | ------------------ | ----------------- | ----------------------------------------------------------------------------------------------------------------- |
| A. 기존 phase 11 편입             | 11                 | 11 (변경 0)       | **기각** — phase 11 = R10b 혜성. 토성 위성을 혜성과 같은 라운드로 묶으면 의미 불명확 + R10b ADR 매핑 주석과 drift |
| **B. 신규 phase 12 (R11 라운드)** | **12**             | **11 → 12** (1줄) | **선택** — #613 자동 생성. 신규 콘텐츠 라운드 명시. allowlist 자동 전파                                           |

#### 선택 — **후보 B: `introducedInRPhase=12` + `CURRENT_R_PHASE=11→12`**

근거:

1. **#613 메타데이터 SSoT 자동 생성** — `CURRENT_R_PHASE=12` 1줄 증가로 `filterBodiesByPhase` 가 신규 3 위성 자동 포함. allowlist 하드코딩 0
2. **신규 콘텐츠 라운드 명시** — 로드맵 v3 (R1~R10b, phase 1~11) 완주 후 첫 확장. phase 12 = "R11 토성계 위성 확장"
3. **매핑 동시 박제 의무** — `solar-system.json` 신규 위성 `$introducedInRPhaseComment` + `r-phase-allowlist.ts` 주석 + (선택) roadmap 문서 R11 행. R10b 매핑 박제 3곳 패턴 답습
4. **FOCUS_BODIES 정합** — `browser-verify-378-focus.mjs` + `browser-verify-r-phase-allowlist.mjs` 의 `FOCUS_BODIES` 하드코딩에 3 위성 추가 (#598 정적 매칭 가드 — 자동 생성값 ↔ FOCUS_BODIES drift 차단)

---

### 축 4 — JPL Horizons 데이터 명세 (Saturn-centric J2000 Ecliptic — titan §위험 #6 답습)

titan 데이터 (`$comment`) 가 SSoT 패턴:

```
Query Frame: Saturn-centric J2000 Ecliptic (osculating).  ← 동일 frame 답습
Epoch: 2026-01-01 00:00 TDB                                ← 동일 epoch
a/e: NASA Fact Sheet 박제값                                ← 동일 출처
각도 (i / OM / W / MA): JPL Horizons API 직접 쿼리          ← developer 실제 쿼리
  → ϖ = OM + W,  L = (ϖ + MA) mod 360                      ← 동일 변환
Laplace plane 값 혼입 금지                                  ← P10-D galilean frame 통일 선례
```

| 후보                                              | frame          | 평가                                                                                                                                                   |
| ------------------------------------------------- | -------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------ |
| **A. Saturn-centric J2000 Ecliptic (titan 답습)** | titan 동일     | **선택** — 토성계 내부 일관성. titan 과 같은 frame 으로 4 위성 궤도 정합                                                                               |
| B. Laplace plane                                  | 위성 고유 평면 | **기각** — galilean (P10-D) / titan (R7 §위험 #6) 에서 frame 혼입 금지 박제. 토성 위성은 Laplace plane 경사가 크나 (특히 iapetus) Ecliptic 통일이 SSoT |

#### 선택 — **후보 A: Saturn-centric J2000 Ecliptic (osculating), 2026-01-01 TDB epoch**

근거:

1. **titan frame 답습** — 토성계 4 위성 동일 frame 으로 궤도 정합. 혼입 시 위성끼리 평면 불일치
2. **a/e = NASA Fact Sheet** — 각도는 Horizons (시변), a/e 는 안정 박제값 (titan Q4 패턴)
3. **iapetus 경사 주의** — iapetus 는 Saturn 적도면 경사 ~7.6° 이나 Laplace plane (적도↔Ecliptic 사이) 경사가 크고 가변. **Ecliptic 변환값을 Horizons 에서 직접 취득** (수동 계산 금지 — frame 혼입 위험). developer 가 `$comment` 에 Horizons 원시값 (IN/OM/W/MA) 박제
4. **frame 혼입 금지 명시** — 각 위성 `$comment` 에 "Laplace plane 값 혼입 금지" 박제 (titan / galilean 선례)

> **developer 의무** — 3 위성 각각 JPL Horizons API 쿼리 (2026-01-01 TDB). `$comment` 에 Horizons 원시값 + 변환 공식 + frame 박제 (titan 항목 L? `$comment` 형식 답습).

---

### 축 5 — picking / cycle 자동 포함 (#713 / #719 — 코드 0)

#713 picking predicate + #719 multiPick cycle 이 데이터 driven:

```
predicate = 활성 LOD variant (isVisible && isEnabled) + metadata.bodyId 존재 + allowlist (isRPhaseFocusable)
```

| 검증 항목                  | 자동 포함 메커니즘                                                                              | 코드 영향           |
| -------------------------- | ----------------------------------------------------------------------------------------------- | ------------------- |
| 신규 mesh 클릭 선택 (#713) | mesh 생성 시 `metadata.bodyId` 부여 (기존 createBodyMesh 경로) + allowlist (CURRENT_R_PHASE=12) | **0줄**             |
| 신규 mesh cycle (#719)     | `scene.multiPick` predicate 동일 SSoT. 위성↔ring↔saturn disk 겹침 시 ray 깊이순 cycle           | **0줄**             |
| ring/궤도선 오선택 방지    | ring/궤도선 mesh 는 metadata.bodyId 없음 → predicate 조기 필터                                  | **0줄** (기존 가드) |

#### 자동 포함 확인

1. **신규 mesh metadata.bodyId** — `createBodyMesh*` 가 모든 body 에 `mesh.metadata.bodyId` 부여 (3 variant). 신규 위성도 동일 경로 → O(1) 역매핑 자동
2. **allowlist** — CURRENT_R_PHASE=12 로 3 위성 allowlist 진입 → predicate 통과
3. **cycle 겹침 대상** — saturn focus 에서 위성 4개 + ring + saturn disk 가 같은 화면 영역 → 같은 위치 반복 클릭 시 ray 뒤 body 순환 (#719). enceladus (ring 안쪽 영역, ×47 분리) 가 saturn disk/ring 과 겹칠 가능성 높음 → cycle 실효 타겟
4. **occlusion** — multiPick depth 정렬 + bodyId dedup (첫 등장) + 직전 id 앵커 wrap (#719 §결정). 신규 위성 자동 포함

> **D-T2 검증 의무** — saturn 위 겹친 위성 반복 클릭 시 cycle 동작 (enceladus↔rhea↔titan↔saturn). #719 회귀 0 확인.

---

## 결과·재검토 조건

### 기대 효과 (측정 가능)

- **3 위성 렌더** — saturn focus 에서 titan + rhea + iapetus + enceladus 4개 위성 billboard/mesh 가시 (D-T2 실 Chrome)
- **클릭/URL 선택** — `?focus=rhea` / `?focus=iapetus` / `?focus=enceladus` URL + 클릭/터치 (#713) focus 전환. cycle (#719) 동작
- **궤도 분리** — 4 위성 궤도선이 ring 밖으로 분리 (per-body visual scale). 각 위성 분리 마진 ≥ 1.5x (산식 A): enceladus 1.64x / rhea 1.52x / titan 1.74x / iapetus 5.13x
- **JPL frame 정합** — 4 위성 동일 Saturn-centric Ecliptic. iapetus 경사 사실 정합 (버그 오인 금지)
- **R-Phase allowlist** — CURRENT_R_PHASE=12 로 3 위성 focus 가능. FOCUS_BODIES 정합 (#598 가드)

### 트레이드오프로 받아들인 비용

- **`ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 = 코어 ~10줄** — Concrete Prediction "코드 0" 깨짐 (단 R5 §위험 #6 에서 인터페이스 인계된 의도적 확장. 추상화 건강성 신호로서 "a 편차 15배가 단일 룩업 한계 초과" 를 실증)
- **enceladus scale 단일값 (250) 시 수렴대 미달** — 사실 radius 0.33배 정직 반영 (billboard fallback 흡수). D-T2 에서 식별 불가 시 차등 500
- **iapetus visual scale ×10 (titan 동일)** — iapetus 가 실제로 멀어 (a 2.9배) ×10 으로도 자연스러우나, 사실 a 비율 (iapetus/titan 2.9배) 이 visual 에서 과장 안 됨 (per-body 라 각자 독립 scale)

### 재검토 트리거

1. **#1 (body scale D-T2 미통과)** — developer/D-T2 에서 "enceladus 가 rhea 와 구별 안 됨" → enceladus scale 250 → 500 (후보 C, Amendment)
2. **#2 (orbit per-body 마진 부족)** — D-T2 "enceladus 가 ring 에 묻힘" → enceladus ×47 → ×50 (마진 1.75x). "rhea 가 묻힘" → rhea ×20 → ×22
3. **#3 (iapetus 과분리 보고)** — D-T2 "iapetus 가 너무 멀어 다른 행성 위성처럼 보임" → iapetus ×10 → ×8 (단 binding 미달 위험). 또는 화면 viewport 재조정 (후속 분리)
4. **#4 (산식 A vs B mismatch)** — runtime 측정 (산식 B) 이 산식 A 와 다름 → #622 NO-OP SSoT 재확인 (metric 정의 차이 — 버그 아님, 재오인 분석 금지)
5. **#5 (per-body 룩업 일반화)** — 후속 토성 위성 (Dione/Tethys) 또는 천왕성·해왕성 다중 위성 진입 시 per-body 룩업 재사용. 본 ADR 이 인터페이스 SSoT

### Concrete Prediction

본 라운드는 **혼합 예측** — 데이터/allowlist/picking 은 코드 0, orbit visual scale 만 신규 코드.

- **scale 추가 시 (§축 1)**: `body-scale.ts` BODY_SCALE 룩업 **3줄 추가** (rhea/iapetus/enceladus). 호출 코드 변경 0
  - 검증: `git diff --stat apps/web/src/constants/body-scale.ts` — BODY_SCALE 3줄 외 변경 0
- **allowlist 진입 시 (§축 3)**: `r-phase-allowlist.ts` `CURRENT_R_PHASE` **1줄** (11→12). 필터 로직 0. `solar-system.json` 위성 3항목 추가 (데이터)
  - 검증: `git diff --stat packages/core/src/scene/r-phase-allowlist.ts` — CURRENT_R_PHASE 1줄 외 변경 0
- **picking/cycle 자동 포함 시 (§축 5)**: `body-picking.ts` **변경 0줄** (predicate 데이터 driven)
  - 검증: `git diff --stat packages/core/src/scene/body-picking.ts` — `*.ts` 변경 0건이면 예측 성공
- **⚠️ orbit visual scale (§축 2) — 코드 0 보장 불가 축**: `orbit-visual-scale.ts` **신규 ~10줄** (`ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 룩업 + `getOrbitVisualScale` per-body 분기). `solar-system-scene.ts` resolveWorld / rebuildOrbitLines 의 getter 호출 변경 0~2줄 (per-body 인자 전달 시)
  - 검증: `git diff --stat packages/core/src/scene/orbit-visual-scale.ts` — 신규 룩업 + getter 분기 (10±5줄). 호출처 변경 최소
  - 실패 시 대응: getter 인자 변경이 호출처 다수 전파 → (a) `getOrbitVisualScale(parentId, bodyId?)` optional 2번째 인자로 호환 (b) Amendment 박제

---

## 재도입 트리거

> 본 ADR 은 Accepted 예정 (Provisional). 폐기/보류 결정 아님. 단 **후보 A/B (saturn 단일 룩업 상향) 를 본 라운드에 채택하지 않음** — per-body 룩업 (후보 C) 채택. 단일 룩업 재도입 조건:

- **단일 룩업 재도입 검토 조건**: 후속 라운드에서 토성 위성이 **a 편차 ≤ 5배 부분집합만** 추가되거나, 위성 데이터 재정의로 enceladus/iapetus 극단이 제거되면 per-body 룩업 불필요 → `ORBIT_VISUAL_SCALE_BY_PARENT` 단일 룩업 회귀 검토. 단 본 ADR per-body 룩업이 이미 SSoT 라 회귀 비용 > 유지 비용 (현실적으로 per-body 유지)
- **Graceful Degradation**: per-body 룩업 미정의 위성은 `ORBIT_VISUAL_SCALE_BY_PARENT` parent 룩업 fallback → `DEFAULT_ORBIT_VISUAL_SCALE` (1.0) 자동 안전
- **재도입 시 선행 작업**: 단일 룩업 회귀 시 per-body 박제값 (enceladus 47 / rhea 20 / iapetus 10) 을 parent 단일값으로 통합 가능한지 binding 재산출 필요

---

## 참고

- 이슈: [#721](https://github.com/coseo12/astro-simulator/issues/721)
- 선례 ADR: R5 [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) §위험 #6 (per-body 룩업 인계 원천) / R6 [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) §재검토 트리거 #3 / R7 [`20260610-r7-saturn-titan-rings-visualization.md`](20260610-r7-saturn-titan-rings-visualization.md) §축 4 (ring outer binding) / R8 / R9
- 인프라: #613 메타데이터 SSoT / #713 클릭 선택 / #719 겹침 cycle / #622 산식 A·B NO-OP
- 외부: NASA Saturn Moon Fact Sheets (Rhea/Iapetus/Enceladus) / JPL Horizons API (Saturn-centric J2000 Ecliptic)
- 횡단: [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity / [`docs/glossary.md`](../glossary.md)
