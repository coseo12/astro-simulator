# ADR: R12 거성 위성 확장 2개 (Oberon / Proteus) — uranus 단일 룩업 양립 (oberon) + neptune `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` per-body (proteus, 최내곽 binding)

- **상태**: **Accepted** (cross-validate 2026-06-21 agy outcome=applied — §교차검증 반영 사항 합의/고유발견 2/셀프체크 박제, Adams ring 가독성 D-T2 developer/qa 인계)
- **날짜**: 2026-06-21
- **결정자**: architect (R12 거성 위성 확장 — 사용자 합의 범위 2026-06-21: Oberon(천왕성)/Proteus(해왕성) 2개 / showInShortcutBar=false / Proteus 구체 근사. 거성 균형 — 각 2번째 위성 1개). 메인 오케스트레이터가 사용자와 합의한 범위 위에서 scale/orbit/allowlist 결정.
- **관련**:
  - [#725](https://github.com/coseo12/astro-simulator/issues/725) (본 스프린트)
  - **1차 SSoT (직전 라운드 — 반드시 답습)**:
    - [`20260620-721-saturn-moons-rhea-iapetus-enceladus.md`](20260620-721-saturn-moons-rhea-iapetus-enceladus.md) (R11, **직전**) — **`ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` per-body 룩업 첫 발동** (enceladus 최내곽 binding) / body scale 250 단일값 그룹 / `CURRENT_R_PHASE` 1줄 전이 / **JPL `REF_PLANE=ECLIPTIC` 명시 의무** (cross-validate 이견 핵심) / Concrete Prediction (picking/카메라 0줄, 궤도선 per-body scale 곱은 "코드 0 불가 축") / `getOrbitVisualScale(parentId, bodyId?)` optional 시그니처
  - 선례 SSoT (위성 추가 표준 패턴):
    - [`20260610-r8-uranus-titania-rings-visualization.md`](20260610-r8-uranus-titania-rings-visualization.md) (R8 — **모천체 uranus / titania scale 500 / ring binding 2번째 인스턴스** / §축 3 세로 궤도 (ecliptic i ~98°) 사전 등록 — oberon 동일 평면 정합 근거)
    - [`20260610-r9-neptune-triton-rings-visualization.md`](20260610-r9-neptune-triton-rings-visualization.md) (R9 — **모천체 neptune / triton scale 300 (비율이 SSoT, 값 답습 기각)** / ring binding 3번째 인스턴스 / §축 3 역행 (i 129.14°) 사전 등록)
    - [`20260605-r6-jupiter-galilean-visualization.md`](20260605-r6-jupiter-galilean-visualization.md) (R6 — satellite scale 산출 표준 (사실 비율 vs 시각 직관) / §축 4 산식 A(설계 임계) vs B(검증 metric) 분리 SSoT)
    - [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) (R5 — §위험 #6 — `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 룩업 인계 원천 / phobos/deimos sub-pixel billboard fallback 선례)
  - 인프라 SSoT:
    - [`20260604-613-r-phase-metadata-ssot.md`](20260604-613-r-phase-metadata-ssot.md) (**R-Phase 메타데이터 SSoT — `CURRENT_R_PHASE` 1줄 + `introducedInRPhase` 데이터 필터 자동 생성. Concrete Prediction 근거**)
    - [`20260620-713-click-body-select.md`](20260620-713-click-body-select.md) (#713 클릭/터치 선택 — picking predicate `metadata.bodyId + allowlist`. **신규 mesh 자동 포함 근거**)
    - [`20260620-719-overlap-cycle.md`](20260620-719-overlap-cycle.md) (#719 겹침 cycle — `scene.multiPick` predicate 동일 SSoT. **titania↔oberon / triton↔proteus 겹침 cycle 자동 포함 근거**)
    - [`20260609-622-orbit-scale-gap-no-op.md`](20260609-622-orbit-scale-gap-no-op.md) (산식 A vs B metric 정의 차이 NO-OP SSoT — 재오인 분석 금지)
  - 횡단 원칙: [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541, 의무 체크리스트 4항목)
  - 용어: [`docs/glossary.md`](../glossary.md) (R-Phase / Floating Origin / binding constraint / 산식 A·B / orbit visual scale / per-body 룩업)
- **교훈 적용**:
  - "신규 데이터 ≠ 신규 코드 — ADR 예측 재현" (#613 메타데이터 SSoT — `introducedInRPhase=13` 데이터 부여 + `CURRENT_R_PHASE=12→13` 1줄로 allowlist 자동 전파. **본 라운드는 #721 이 solar-system-scene 의 per-body 처리를 이미 완료했으므로 진짜 "데이터만" 라운드 — 코어 코드 0 예측이 가능한 첫 위성 확장**)
  - "신규 함수 ≠ 신규 구현" (volt [#21](https://github.com/coseo12/volt/issues/21) — picking predicate (#713/#719) / `ORBIT_VISUAL_SCALE_BY_PARENT` 룩업 (uranus 50/neptune 75 기존) / `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 룩업 (#721) / `getOrbitVisualScale(parentId, bodyId?)` 시그니처 (#721) / solar-system-scene per-body 처리 (#721) **100% 재사용**. 본 라운드 신규 함수 0)
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74) — proteus 사실 비율 (triton 의 0.155배) vs 시각 직관 mismatch 측정 의무. moon Amendment 4 / enceladus §축 1 답습)
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt [#77](https://github.com/coseo12/volt/issues/77) — 실 Chrome GUI D-T2 의무. ring + 2 위성 occlusion/cycle 시각 효과 포함)
  - "수치 DoD 미달 시 측정 방법 검증 우선 / measurement-first" (volt [#32](https://github.com/coseo12/volt/issues/32) — proteus body scale px 직관은 **developer 가 `scripts/_debug-725-*-tmp.mjs` (즉시 rm) runtime 실측 후 확정**. architect 는 산식 + 후보 범위만 제시)
  - "결합 간과 — Claude 4종 편향" (volt [#29](https://github.com/coseo12/volt/issues/29) — **본 라운드 핵심**: 천왕성·해왕성 두 계가 **비대칭**. oberon (titania 바깥, a 1.34배) 은 uranus 단일 룩업 ×50 으로 양립 (per-body 불필요). proteus (triton 안쪽, a 0.33배 = 3.0배 안쪽) 은 neptune 단일 룩업 ×75 에 묻혀 (마진 0.56x) **per-body 룩업 필요** — #721 enceladus 와 동형 binding shift)

---

## 현재 유효 결정 요약 (Living ADR Executive Summary)

> 본 ADR 은 **Provisional** (cross-validate 통합 전). Amendment 라운드 N (≥0) 예상. 후속 위성 확장 architect 가 빠르게 결정 파악할 수 있도록 **현재 유효한 박제값과 결정만** 본 섹션에 요약. 상세 후보 비교 / Concrete Prediction 은 §축 N 본문 참조.

### 핵심 박제값 (architect 권고 — proteus body scale 은 developer 실측 후 확정)

| 항목                                            | 박제값 (권고)                                          | 위치                                            | 비고                                                                                                                                                                                                                            |
| ----------------------------------------------- | ------------------------------------------------------ | ----------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BODY_SCALE.oberon`                             | **500** (titania 답습)                                 | `apps/web/src/constants/body-scale.ts`          | §축 1 — mesh 비율 0.0596 (수렴대 [0.05~0.09] 정중앙). oberon radius 761.4km ≈ titania 788.4km (0.966배) → 동일 scale 로 사실 radius 비 자동 보존 (R9 mars=earth / titania≈oberon 동형). 실측 px 2.70 sub-4 fallback             |
| `BODY_SCALE.proteus`                            | **300** (triton 답습, 후보 [300, 500])                 | 동                                              | §축 1 — **결정 포인트 (measurement-first)**: proteus radius 210km = triton 의 0.155배. 300 시 mesh 비율 0.0102 (수렴대 미달, enceladus 0.0218 보다 더 작음) → 4px fallback billboard 흡수. developer D-T2 로 300↔500 확정       |
| `ORBIT_VISUAL_SCALE_BY_PARENT.uranus`           | **50 유지 (변경 0)**                                   | `packages/core/src/scene/orbit-visual-scale.ts` | §축 2 — **oberon 은 titania 바깥 (a 1.34배) → 단일 룩업 ×50 으로 자동 양립** (titania 1.65x / oberon 2.22x 둘 다 ≥1.5). per-body 불필요. R8 박제 보존 (titania 회귀 0)                                                          |
| `ORBIT_VISUAL_SCALE_BY_PARENT.neptune`          | **75 유지 (triton, 변경 0)**                           | 동                                              | §축 2 — triton 은 parent 룩업 ×75 유지 (회귀 0, 마진 1.65x). proteus 만 per-body 로 분리 (아래)                                                                                                                                 |
| `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY.proteus` | **220** (마진 1.64x, 후보 [210, 230])                  | 동 (#721 per-body 룩업 — 항목 추가만)           | §축 2 — **본 ADR 핵심**: proteus (최내곽 a 0.000786 AU) 는 neptune ×75 에 묻힘 (마진 0.56x). enceladus 와 동형 binding shift → per-body ×220 (마진 1.64x, titania/triton/enceladus 1.65x 정합). #721 인프라 재사용, 신규 코드 0 |
| `introducedInRPhase` (2 위성)                   | **13**                                                 | `packages/shared/data/solar-system.json`        | §축 3 — R11 (phase 12, #721) 후 신규 콘텐츠 라운드 R12                                                                                                                                                                          |
| `CURRENT_R_PHASE`                               | **12 → 13** (1줄)                                      | `packages/core/src/scene/r-phase-allowlist.ts`  | §축 3 — #613 자동 생성. allowlist 자동 전파                                                                                                                                                                                     |
| JPL 데이터 frame                                | **Uranus/Neptune-centric J2000 Ecliptic (osculating)** | `solar-system.json` 각 위성 orbit + `$comment`  | §축 4 — titania/triton §comment 답습. **`REF_PLANE=ECLIPTIC` 쿼리 파라미터 명시 의무** (#721 이견 — 미지정 시 적도면 28° 어긋남)                                                                                                |
| picking predicate (#713/#719)                   | **변경 0줄** (데이터 추가만으로 자동 포함)             | `packages/core/src/scene/body-picking.ts`       | §축 5 — `metadata.bodyId + allowlist` 가 데이터 driven. cycle 자동 포함                                                                                                                                                         |
| solar-system-scene per-body 처리                | **변경 0줄** (#721 에서 generic 처리 완료)             | `packages/core/src/scene/solar-system-scene.ts` | §축 2 — line 622/1674 `getOrbitVisualScale(body.parentId, body.id)` 가 이미 모든 satellite 에 generic. proteus 자동 적용 (#721 이 코드 처리 완료 → 본 라운드 코어 코드 0)                                                       |

### 핵심 결정 요약

1. **oberon scale 500 (titania 답습) / proteus scale 300 (후보 [300, 500])** (§축 1): mesh 비율 수렴대 [0.05~0.09] 기준. oberon 은 titania 와 radius 0.966배라 동일 scale 500 으로 수렴대 정중앙 (0.0596) + 사실 비율 자동 보존 — **단일 권고 확정**. proteus 는 triton 의 0.155배라 어떤 scale 도 수렴대 미달 → enceladus 동형 4px fallback. 300↔500 은 developer D-T2 실측 확정 (measurement-first)
2. **orbit visual scale — 비대칭: oberon 단일 룩업 양립 + proteus per-body** (§축 2): **본 ADR 핵심**. oberon 은 titania 바깥 (a 1.34배) 이라 uranus ×50 단일 룩업으로 양립 (마진 2.22x, per-body 불필요 — 천왕성 계는 진짜 데이터만). proteus 는 triton 안쪽 (a 0.33배) 이라 neptune ×75 에 묻혀 (마진 0.56x) **#721 `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 에 proteus ×220 항목 추가** (enceladus binding shift 동형). triton ×75 parent 유지 (회귀 0)
3. **CURRENT_R_PHASE=12→13 (1줄)** (§축 3): #613 메타데이터 SSoT 자동 생성. R11 (phase 12, #721) 후 **신규 콘텐츠 라운드 (R12)**. `introducedInRPhase=13` 데이터 부여
4. **JPL frame = Uranus/Neptune-centric J2000 Ecliptic (osculating)** (§축 4): titania/triton §comment 답습. a/e 는 NASA Fact Sheet, 각도 요소는 JPL Horizons (2026-01-01 TDB). **`REF_PLANE=ECLIPTIC` 쿼리 파라미터 명시 의무** (#721 이견 — 미지정 시 모천체 적도면 반환 → 황도면 기준 기존 titania/triton 과 ~28° 어긋남)
5. **picking/cycle/scene per-body 자동 포함 — 코어 코드 0** (§축 5 + §축 2): #713 predicate + #719 multiPick + #721 solar-system-scene generic per-body 처리 모두 데이터 driven. **본 라운드는 코어 `.ts` 변경 0 (orbit per-body 룩업 entry 추가는 상수 객체 항목 1줄 — 함수/scene 코드 변경 아님)**

### 비-범위 (사용자 합의 2026-06-21 + R-Phase 답습)

- 천왕성 추가 위성 (Umbriel/Ariel/Miranda) ❌ — 후속 라운드
- 해왕성 추가 위성 (Nereid/Larissa/Despina) ❌ — 후속
- 위성 표면 텍스처/디테일/albedo ❌
- **Proteus 비구체 형상 (실제 불규칙 다면체)** ❌ — **구체 근사 렌더** (사용자 합의. 표면 디테일 비-범위)
- uranus/neptune ring 변경 ❌ (R8/R9 박제 보존)
- titania scale/orbit 변경 ❌ (R8 박제 보존 — oberon 동일 parent ×50 으로 회귀 0)
- triton scale/orbit 변경 ❌ (R9 박제 보존 — triton parent ×75 유지, proteus 만 per-body → 회귀 0)
- 실측 데이터 변경 ❌ (`solar-system.json` orbit/radius SSoT 보존 — rendering 시점에만 visual scale)
- LOD 시스템 변경 ❌
- showInShortcutBar=true 승격 ❌ (사용자 합의 — URL/클릭 진입만. 2 위성 모두 false)

### 후속 라운드 인계 의무

- **거성 위성 a 비대칭 판정 SSoT** — 본 ADR 이 oberon (바깥 = 단일 룩업 양립) vs proteus (안쪽 = per-body binding) 비대칭 판정을 박제. **신규 위성 a 가 기존 binding 위성보다 안쪽이면 per-body 필요, 바깥이면 단일 룩업 양립 검토** (margin ≥ 1.5 산식 A 로 실측 확정). 천왕성 추가 위성 (Miranda a 0.000868 AU = titania 안쪽 → per-body 필요 예상) / 해왕성 추가 위성 진입 시 동일 판정
- per-body 룩업 (`ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY`) 은 #721 (saturn 4) + 본 ADR (proteus) 누적. parent 단일 룩업은 **단일 위성 또는 추가 위성이 binding 위성보다 바깥일 때만** 유지
- 4px fallback 의존 위성 (oberon 2.70px / proteus 0.45~0.74px 모두 sub-4) D-T2 시각 식별은 billboard marker (#675 glow) + focus mesh 관찰 경로 답습

---

## 통합 vs 분리 결정 (메타)

본 ADR 은 R6~R11 §"R-Phase 단일 ADR 패턴" 답습:

- **단일 ADR 통합** — 거성 위성 확장 결정 N건 (2 위성 scale / orbit visual scale 비대칭 / allowlist / JPL frame / picking 자동 포함) 을 단일 ADR 로 통합. 파일명 `20260621-725-giant-moons-oberon-proteus.md`
- **로드맵 v3 외 신규 콘텐츠 라운드 (R12)** — R10b (phase 11) 가 로드맵 v3 의 마지막 라운드 (27 body 전 데이터 소진). R11 (#721, phase 12) 이 토성 위성 3개 추가 (30 body). 본 라운드는 **위성 탐색 인프라 + per-body 룩업 위에 거성 균형 확장** (32 body). phase 정수 13 으로 진행
- **#721 직접 답습 — 인프라 100% 재사용, 진짜 "데이터만"** — R11 이 `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 룩업 + `getOrbitVisualScale(parentId, bodyId?)` 시그니처 + solar-system-scene generic per-body 처리를 **모두 코드 레벨로 완료**했다. 본 라운드는 그 인프라 위에 데이터 (위성 2항목) + 상수 (scale 2 + orbit per-body 1 entry) 만 추가 → **코어 함수/scene `.ts` 변경 0 예측** (Concrete Prediction §)

---

## 배경

### 진입 조건

[#725](https://github.com/coseo12/astro-simulator/issues/725) — #721 토성계 위성 확장 (Rhea/Iapetus/Enceladus, R11) 으로 토성이 4 위성이 됐다. 천왕성 (titania 1개)·해왕성 (triton 1개) 도 대표 위성 1개씩만 있어 빈약하다. R-Phase 위성 추가 패턴 (R6~R11) 답습으로 두 거성에 2번째 위성을 추가해 거성 균형을 맞춘다.

- **Oberon** (천왕성, radius 761.4km) — 천왕성 2번째 큰 위성 (titania 짝)
- **Proteus** (해왕성, radius ~210km) — 해왕성 2번째 위성 (triton 다음, 불규칙 형태 → 구체 근사 렌더)

사용자 합의 (2026-06-21): 2개 / showInShortcutBar=false (URL·클릭 진입) / Proteus 구체 근사.

### 현재 baseline 실측 (2026-06-21 develop tip = `fc0472f`)

`body-scale.ts` 위성 scale 실측 (수렴값 패턴 — 거성 위성):

```typescript
// satellite mesh 비율 (sat_radius×sat_scale)/(parent_radius×parent_scale) 수렴대 [0.05~0.09]:
titania: 500, // titania/uranus mesh 비율 0.0617 (R8 — uranus=250, gas giant 48 의 5.2배라 scale 상향)
triton: 300,  // triton/neptune mesh 비율 0.0656 (R9 — 비율 SSoT, titania 값 답습 기각)
// R11 saturn 위성 250 (rhea/iapetus/enceladus) — 본 라운드 무관
```

`orbit-visual-scale.ts` 실측 (uranus/neptune parent 룩업 기존 + #721 per-body 룩업 인프라):

```typescript
export const ORBIT_VISUAL_SCALE_BY_PARENT = { uranus: 50, neptune: 75, ... };  // R8/R9 박제 (titania/triton binding = ring outer)
export const ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY = { titan: 10, enceladus: 47, rhea: 20, iapetus: 10 };  // #721 saturn 위성 per-body
export function getOrbitVisualScale(parentId, bodyId?) { ... }  // #721 — per-body 우선 → parent fallback → 1.0
```

**solar-system-scene.ts 실측 (#721 이 generic per-body 처리 완료)**:

```typescript
// line 622 (rebuildOrbitLines): const perBodyScale = getOrbitVisualScale(body.parentId, body.id);  // 점 좌표에 곱
// line 1674 (resolveWorld):     const visualScale  = getOrbitVisualScale(body.parentId, body.id);  // mesh position
```

> ⚠️ **핵심**: #721 이 두 호출처에 이미 `body.id` 2번째 인자를 전달하므로, **신규 위성은 per-body 룩업 entry 만 추가하면 scene 코드 변경 0 으로 자동 적용**된다. 본 라운드는 #721 이 "코드 0 보장 불가 축" 으로 분류했던 orbit 축마저 코드가 이미 처리됨 → **진짜 데이터만 라운드**.

`r-phase-allowlist.ts` 실측:

```typescript
export const CURRENT_R_PHASE = 12; // R11 #721 — saturn 위성 3 (enceladus/rhea/iapetus) 자동 포함 (30 body)
```

### 데이터 출처 (NASA Fact Sheet — radius / a / e)

| 위성               | radius (km) | a (km)  | a (AU)    | e        | i (모천체 Ecliptic, °)               | 출처                                                        |
| ------------------ | ----------- | ------- | --------- | -------- | ------------------------------------ | ----------------------------------------------------------- |
| **Titania** (기존) | 788.4       | 435,910 | 0.0029139 | 0.0011   | 97.7633                              | (R8 박제 — 참조용)                                          |
| **Oberon**         | 761.4       | 583,520 | 0.0039004 | 0.0014   | ~98 (titania 클러스터)               | NASA Uranus Moon Fact Sheet + JPL Horizons (developer 쿼리) |
| **Triton** (기존)  | 1353.4      | 354,759 | 0.0023714 | 0.000016 | 129.1418 (역행)                      | (R9 박제 — 참조용)                                          |
| **Proteus**        | ~210        | 117,647 | 0.0007864 | 0.00053  | ~28 (Neptune 적도 근접 — §축 4 주의) | NASA Neptune Moon Fact Sheet + JPL Horizons                 |

> ⚠️ 위 a/e/i 는 architect 참조용 NASA Fact Sheet 근사. **각도 요소 (i / OM / W / MA → ϖ / L)** 는 developer 가 **JPL Horizons API 직접 쿼리** (titania/triton §comment 패턴 답습 — Uranus/Neptune-centric J2000 Ecliptic, osculating, 2026-01-01 00:00 TDB epoch). a/e 는 NASA Fact Sheet 박제. **`REF_PLANE=ECLIPTIC` 쿼리 파라미터 명시** (§축 4).

### a 위치 — 비대칭의 근본 원인

```
URANUS 계:  titania a = 0.0029139 AU (기존 binding)
            oberon   a = 0.0039004 AU (바깥, titania 의 1.339배) → 단일 룩업 ×50 으로 자동 양립

NEPTUNE 계: triton  a = 0.0023714 AU (기존)
            proteus a = 0.0007864 AU (안쪽, triton 의 0.332배 = 3.015배 더 안쪽) → 새 binding (최내곽)
```

oberon 은 기존 binding 바깥이라 **단일 룩업으로 충분** (천왕성 계 진짜 데이터만). proteus 는 기존 binding 안쪽이라 **per-body 필요** (#721 enceladus 동형 binding shift). 이 비대칭이 §축 2 핵심.

---

## 후보 비교

### 축 1 — 2 위성 body scale (satellite mesh 비율 수렴대 [0.05~0.09])

satellite scale 산출 표준 (R4~R11 SSoT): `mesh 비율 = (sat_radius × sat_scale)/(parent_radius × parent_scale)` 를 수렴대 [0.05~0.09] (moon/earth 0.068 / titan/saturn 0.089 / titania/uranus 0.062 / triton/neptune 0.066) 안으로. uranus_scale=250, neptune_scale=250, parent_mesh = radius × 250.

산식 (1280×720): `px_diameter = sat_radius_m × scale × k`, k = 7.0806e-9.

#### Oberon (천왕성, radius 761.4km — titania 788.4km 의 0.966배)

| scale   | mesh 비율  | px       | 평가                                             |
| ------- | ---------- | -------- | ------------------------------------------------ |
| 400     | 0.0477     | 2.16     | 수렴대 하단 경계 미달                            |
| **500** | **0.0596** | **2.70** | **수렴대 정중앙 (titania 0.0617 정합)**          |
| 600     | 0.0715     | 3.23     | 수렴대 상단 — 사실 radius 비 (0.966) 위배 (과대) |

#### Proteus (해왕성, radius ~210km — triton 1353.4km 의 0.155배)

| scale   | mesh 비율  | px       | 평가                                                                                           |
| ------- | ---------- | -------- | ---------------------------------------------------------------------------------------------- |
| **300** | **0.0102** | **0.45** | **triton 답습 단일값. 수렴대 미달 (enceladus 0.0218 보다 작음) → 4px fallback billboard 흡수** |
| 500     | 0.0170     | 0.74     | enceladus 미달 수준. 여전히 수렴대 미달 + 사실 radius 비 (0.155) 의도적 위배                   |
| 800     | 0.0271     | 1.19     | dwarf 계보 — 사실 비율 더 위배. 수렴대 여전히 미달                                             |

#### 후보 평가

| 후보                                              | oberon               | proteus                             | mental model                 | 평가                                                                                                                                                                                                                    |
| ------------------------------------------------- | -------------------- | ----------------------------------- | ---------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| A. titania=500 / triton=300 각 모천체 답습        | 0.0596 (수렴대 중앙) | 0.0102 (수렴대 미달, fallback 흡수) | "각 거성 위성 = 모천체 답습" | **권고 1순위** — oberon 은 titania 와 radius 0.966배라 동일 scale 500 으로 mesh 비율 0.0596 (titania 0.0617 의 0.966배 = 사실 radius 비 정합). proteus 는 triton 답습 300, 어차피 sub-pixel billboard. 모천체 짝 단순성 |
| B. oberon=500 / proteus=500 (enceladus 수준 상향) | 0.0596               | 0.0170                              | "둘 다 500"                  | **권고 2순위** — proteus 만 500 으로 상향. 단 triton/proteus 모천체 답습 깨짐 + 여전히 수렴대 미달 (0.017). developer D-T2 에서 proteus "안 보임" 이면 채택                                                             |
| C. 사실 radius 비 정밀 차등 (oberon=483 등)       | 미세 보정            | —                                   | 복잡                         | **기각** — 단일값 단순성 손실. R10a/R10b/R11 단일값 그룹 정책 역행                                                                                                                                                      |

#### 선택 — **후보 A (oberon=500 titania 답습 / proteus=300 triton 답습) 권고. proteus 는 developer D-T2 실측으로 300↔500 확정** (measurement-first)

근거:

1. **oberon 단일 권고 확정** — oberon radius 761.4km ≈ titania 788.4km (0.966배). 동일 scale 500 으로 mesh 비율 0.0596 (titania 0.0617 의 0.966배 = 사실 radius 비 정확 보존). 수렴대 정중앙. R9 mars=earth=800 / R7 saturn=jupiter=48 동형 단일값 패턴. oberon 은 px 2.70 으로 titania (2.79) 와 거의 같아 천왕성 두 위성이 시각 동급 (사실 정합)
2. **proteus measurement-first 위임** — proteus radius 210km 는 triton 의 0.155배. **어떤 scale 도 수렴대 [0.05~0.09] 미달** (300=0.0102, 800=0.0271). 모든 거성 위성이 어차피 sub-pixel (oberon 2.70px / proteus 0.45px) → billboard fallback 전면 의존 (enceladus/phobos/deimos 선례 동형). 300↔500 차이가 화면 가시성에 직접 이어지지 않으므로 developer 가 `scripts/_debug-725-scale-tmp.mjs` (즉시 rm) billboard marker 실측 + D-T2 관찰로 확정. architect 는 산식 + 후보 [300, 500] 만 박제
3. **모천체 답습 단순성** — "천왕성 위성 = titania scale 500 답습 / 해왕성 위성 = triton scale 300 답습". 각 거성 내 위성 scale 통일 mental model
4. **사실 radius 비 정직 (proteus)** — proteus 가 triton 의 0.155배인 것이 mesh 비율로 자동 반영 (300 시 0.0102 = triton 0.0656 의 0.156배). enceladus (rhea 의 0.33배) 와 동형 — 사실 radius 정직 반영, billboard fallback 흡수

> **D-T2 검증 의무** — uranus focus 에서 titania + oberon 2개 식별, neptune focus 에서 triton + proteus 2개 식별. 사실 크기 순서 (titania ≈ oberon / triton ≫ proteus) 시각 반영. billboard fallback 으로 동일 marker 크기면 #675 glow marker 패턴 의존 (정상 — sub-pixel 위성 공통).

---

### 축 2 — orbit visual scale: 비대칭 (oberon 단일 룩업 양립 / proteus per-body) — 본 ADR 핵심

#### binding constraint = ring outer mesh (R7~R9 유형 답습)

R8 uranus binding = ε ring outer mesh (`51149 km × 250 = 1.2787e10 m`, uranus mesh 6.3898e9 의 2.001배).
R9 neptune binding = Adams ring outer mesh (`62930 km × 250 = 1.5732e10 m`, neptune mesh 6.1910e9 의 2.541배).

분리 마진 (산식 A = `visual_orbit / (ring_outer_mesh + sat_mesh)`):

#### URANUS 계 — oberon 은 단일 룩업 ×50 으로 양립 (per-body 불필요)

| 위성           | a (m)   | visual (×50) | sat_mesh (m)       | 마진 (×50) | 판정                                     |
| -------------- | ------- | ------------ | ------------------ | ---------- | ---------------------------------------- |
| titania (기존) | 4.359e8 | 2.180e10     | 788400×500=3.942e8 | **1.65x**  | ✅ (R8 박제 — 유지)                      |
| **oberon**     | 5.835e8 | 2.918e10     | 761400×500=3.807e8 | **2.22x**  | ✅ **자동 안전 (titania 바깥 a 1.34배)** |

**핵심 발견**: oberon 은 titania 바깥이라 동일 ×50 으로 마진 2.22x (≥1.5). **uranus 단일 룩업 ×50 그대로 두면 titania (1.65x) + oberon (2.22x) 둘 다 충족** → per-body 불필요. 천왕성 계는 진짜 데이터만 (orbit 상수 변경 0).

#### NEPTUNE 계 — proteus 는 ×75 에 묻힘 → per-body 필요 (#721 enceladus 동형)

| 위성          | a (m)   | visual (×75) | sat_mesh (m)        | 마진 (×75) | 판정                                       |
| ------------- | ------- | ------------ | ------------------- | ---------- | ------------------------------------------ |
| **proteus**   | 1.176e8 | 8.824e9      | 210000×300=6.30e7   | **0.56x**  | **묻힘 (새 binding — 최내곽)**             |
| triton (기존) | 3.548e8 | 2.661e10     | 1353400×300=4.060e8 | **1.65x**  | ✅ (R9 박제 — ×75 으로 충분, proteus 바깥) |

**핵심 발견**: proteus (triton 안쪽 a 0.33배) 는 neptune ×75 에 묻힌다 (마진 0.56x). proteus 가 새 binding constraint. enceladus (#721, titan 안쪽) 와 정확히 동형 binding shift.

#### proteus binding 충족 visual scale + triton 회귀 회피

proteus 마진 1.5 충족 = ×201, 1.64x (titania/triton/enceladus 1.65x 선례) = ×220.

| visual_scale (proteus)    | proteus 마진 | (참고) 단일 ×N 시 triton 마진 | (참고) 단일 ×N 시 triton visual orbit (AU) |
| ------------------------- | ------------ | ----------------------------- | ------------------------------------------ |
| × 75 (neptune parent)     | 0.56x (fail) | 1.65x (정상)                  | 0.178 (현행)                               |
| × 220 (proteus 1.64x)     | **1.64x**    | (per-body 면 triton 무관)     | —                                          |
| × 220 단일 parent 상향 시 | 1.64x        | 4.84x (과분리)                | **0.522 (×2.9 회귀)**                      |

**문제**: neptune 단일 parent 룩업을 ×220 으로 올리면 proteus 충족하나 **triton visual orbit 가 0.178→0.522 AU (×2.9) 회귀** (기존 사용자 인지 파괴, R9 박제 깨짐). #721 의 saturn 단일 ×47 상향이 titan 을 회귀시켰던 것과 동일.

#### 후보 평가

| 후보                                                           | 방식                                            | 코드 영향                                  | 평가                                                                                                                                  |
| -------------------------------------------------------------- | ----------------------------------------------- | ------------------------------------------ | ------------------------------------------------------------------------------------------------------------------------------------- |
| A. neptune 단일 ×220 (전체 상향)                               | `ORBIT_VISUAL_SCALE_BY_PARENT.neptune = 75→220` | 1줄                                        | **기각** — proteus 충족하나 **triton ×75→×220 회귀** (visual orbit ×2.9, R9 박제 파괴) + triton 4.84x 과분리                          |
| B. neptune 단일 ×120 (절충)                                    | `= 75→120`                                      | 1줄                                        | **기각** — proteus 0.89x 여전히 묻힘 + triton ×1.6 회귀. 양극단 모두 미충족                                                           |
| **C. `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 에 proteus 추가** | `proteus: 220` (#721 룩업 entry 1줄)            | **상수 객체 항목 1줄 (함수/scene 코드 0)** | **선택** — proteus binding 독립 충족 (×220, 1.64x). triton ×75 parent 유지 (회귀 0). #721 인프라 100% 재사용 — 신규 함수/scene 코드 0 |

#### per-body visual scale 박제값 (후보 C — proteus 마진 ≥ 1.5)

| 위성          | a (m)   | sum_mesh (m) | visual scale (권고)      | 마진 (산식 A) | 근거                                                         |
| ------------- | ------- | ------------ | ------------------------ | ------------- | ------------------------------------------------------------ |
| **proteus**   | 1.176e8 | 1.5796e10    | **220** (후보 [210,230]) | 1.64x         | binding (최내곽). titania/triton/enceladus 1.65x 정합        |
| triton (기존) | —       | —            | **75 (parent 유지)**     | 1.65x         | **R9 박제 보존 (회귀 0)**. per-body 미정의 → parent fallback |

> oberon 은 per-body 룩업에 추가 안 함 — uranus parent ×50 fallback 으로 충분 (마진 2.22x). titania 도 parent ×50 유지.

#### 선택 — **후보 C: proteus 만 `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` per-body. oberon/titania/triton 은 parent 룩업 유지**

근거:

1. **비대칭의 정확한 처리** — oberon (바깥) 은 단일 룩업 양립, proteus (안쪽) 만 per-body. 두 계를 동일 처리하지 않고 a 위치로 판정 (결합 간과 회피 — Claude 4종 편향 #29)
2. **proteus binding 독립 충족** — ×220 (1.64x). enceladus (#721) 와 동형 binding shift. titania/triton/enceladus 1.65x 선례 정합
3. **triton 회귀 0** — R9 박제 ×75 유지. neptune 단일 상향 (후보 A/B) 의 triton 인지 파괴 (visual orbit ×2.9) 회피. proteus 만 per-body 에 명시 (triton 은 per-body 미정의 → parent ×75 fallback)
4. **oberon 데이터만** — uranus parent ×50 으로 자동 양립 (마진 2.22x). per-body entry 불필요 → 천왕성 계는 진짜 데이터만 (scale 1줄 + 데이터 1항목)
5. **#721 인프라 100% 재사용 — 코어 코드 0** — `getOrbitVisualScale(parentId, bodyId?)` 시그니처 + solar-system-scene line 622/1674 generic per-body 처리가 #721 에서 완료됨. proteus entry 1줄 추가만으로 자동 적용. **함수/scene `.ts` 변경 0** (#721 이 "코드 0 불가 축" 으로 분류했던 orbit 축마저 본 라운드는 코드 0)

> **Concrete Prediction 영향**: 본 축은 #721 과 달리 **코어 코드 0 가능 축으로 강등**. proteus per-body entry 추가 = `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 상수 객체 항목 1줄 (함수/scene 미변경). §결과·재검토 §Concrete Prediction 참조.

> **D-T2 검증 의무** — uranus focus 에서 titania + oberon 궤도선이 ring 밖 분리 (둘 다 ×50). neptune focus 에서 triton (×75) + proteus (×220) 궤도선이 ring 밖 분리. proteus 가 ring 바로 밖 (마진 1.64x). 산식 A (설계 임계) 와 산식 B (runtime 실측) 직접 비교 금지 (#622 NO-OP SSoT). 궤도선-ring 시각 간섭 보고 시 proteus ×220→×235 (마진 1.75x) fallback.

---

### 축 3 — `introducedInRPhase` / `CURRENT_R_PHASE` (R12 신규 콘텐츠 라운드)

R11 (#721, phase 12) 이 토성 위성 3개 추가 (30 body). 본 거성 위성 확장은 **R11 후 신규 콘텐츠**.

| 후보                              | introducedInRPhase | CURRENT_R_PHASE   | 평가                                                                                                           |
| --------------------------------- | ------------------ | ----------------- | -------------------------------------------------------------------------------------------------------------- |
| A. 기존 phase 12 편입             | 12                 | 12 (변경 0)       | **기각** — phase 12 = R11 토성 위성. 거성 위성을 같은 라운드로 묶으면 의미 불명확 + #721 ADR 매핑 주석과 drift |
| **B. 신규 phase 13 (R12 라운드)** | **13**             | **12 → 13** (1줄) | **선택** — #613 자동 생성. 신규 콘텐츠 라운드 명시. allowlist 자동 전파                                        |

#### 선택 — **후보 B: `introducedInRPhase=13` + `CURRENT_R_PHASE=12→13`**

근거:

1. **#613 메타데이터 SSoT 자동 생성** — `CURRENT_R_PHASE=13` 1줄 증가로 `filterBodiesByPhase` 가 신규 2 위성 자동 포함. allowlist 하드코딩 0
2. **신규 콘텐츠 라운드 명시** — R11 (phase 12) 후 첫 확장. phase 13 = "R12 거성 위성 확장 (oberon/proteus)"
3. **매핑 동시 박제 의무** — `solar-system.json` 신규 위성 `$comment` + `r-phase-allowlist.ts` 주석 갱신
4. **FOCUS_BODIES 정합** — `browser-verify-378-focus.mjs` + `browser-verify-r-phase-allowlist.mjs` 의 `FOCUS_BODIES` 하드코딩에 2 위성 추가 (#598 정적 매칭 가드). **데이터 순서 정합 필수**: oberon 은 titania 다음 (neptune 전), proteus 는 triton 다음 (ceres 전). `filterBodiesByPhase` 가 데이터 순서로 반환하므로 FOCUS_BODIES 도 동일 순서여야 #598 통과

---

### 축 4 — JPL Horizons 데이터 명세 (Uranus/Neptune-centric J2000 Ecliptic — titania/triton 답습)

titania/triton 데이터 (`$comment`) 가 SSoT 패턴:

```
Query Frame: Uranus-centric / Neptune-centric J2000 Ecliptic (osculating).  ← 동일 frame 답습
Epoch: 2026-01-01 00:00 TDB                                                  ← 동일 epoch
a/e: NASA Fact Sheet 박제값                                                  ← 동일 출처
각도 (i / OM / W / MA): JPL Horizons API 직접 쿼리                            ← developer 실제 쿼리
  → ϖ = OM + W,  L = (ϖ + MA) mod 360                                        ← 동일 변환
REF_PLANE=ECLIPTIC 명시 (미지정 시 모천체 적도면 반환 → ~28° 어긋남)          ← #721 이견 핵심
```

| 후보                                                               | frame          | 평가                                                                                                             |
| ------------------------------------------------------------------ | -------------- | ---------------------------------------------------------------------------------------------------------------- |
| **A. Uranus/Neptune-centric J2000 Ecliptic (titania/triton 답습)** | 동일           | **선택** — 각 거성계 내부 일관성. titania 와 oberon 동일 frame, triton 과 proteus 동일 frame                     |
| B. Laplace plane / 모천체 적도면                                   | 위성 고유 평면 | **기각** — galilean (P10-D) / titan (R7) / titania (R8) / triton (R9) frame 혼입 금지 박제. Ecliptic 통일이 SSoT |

#### 선택 — **후보 A: Uranus/Neptune-centric J2000 Ecliptic (osculating), 2026-01-01 TDB epoch**

근거:

1. **titania/triton frame 답습** — 각 거성계 위성 동일 frame 으로 궤도 정합. 혼입 시 위성끼리 평면 불일치
2. **a/e = NASA Fact Sheet** — 각도는 Horizons (시변), a/e 는 안정 박제값 (titania/triton Q4 패턴)
3. **oberon 경사 (titania 클러스터)** — oberon 은 천왕성계라 ecliptic inclination ~98° (titania 97.76° 와 클러스터). titania 와 동일 세로 궤도 평면 (천왕성 tilt 97.77° 고리 평면 정렬) — D-T2 세로 궤도 버그 오인 금지 (R8 §축 3 사전 등록 답습)
4. **⚠️ proteus 경사 주의 (Neptune 적도면 근접)** — proteus 는 Neptune 적도면에 매우 가까운 궤도 (i ~28° ecliptic). **`REF_PLANE=ECLIPTIC` 미지정 시 Neptune 적도면 (Neptune Equator) 으로 반환되면 황도면 기준 기존 triton (i 129.14° ecliptic) 궤도와 평면 불일치 → 해왕성계 정합성 붕괴**. developer 는 Horizons 쿼리에 `REF_PLANE=ECLIPTIC` 명시 박제

> **developer 의무** — 2 위성 각각 JPL Horizons API 쿼리 (2026-01-01 TDB). `$comment` 에 Horizons 원시값 (IN/OM/W/MA) + 변환 공식 + frame 박제 (titania/triton 항목 `$comment` 형식 답습).
>
> ⚠️ **`REF_PLANE=ECLIPTIC` 명시 필수 (#721 이견 답습)** — Horizons 쿼리 시 reference plane 을 명시하지 않으면 기본값이 **모천체 적도면 (Uranus/Neptune Equator)** 으로 반환될 수 있다. 이 경우 황도면 기준으로 렌더되는 기존 titania/triton 궤도와 신규 위성 평면이 **~28° 어긋나** 각 거성계 전체 궤도 정합성이 붕괴한다 (심각한 visual 버그). developer 는 Horizons 쿼리 옵션에 `REF_PLANE=ECLIPTIC` (또는 동등 황도면 지정) 을 **명시 박제** + `$comment` 에 frame 기준 평면을 명기. #721 §축 4 의 "REF_PLANE=ECLIPTIC 가드" 직접 답습.

---

### 축 5 — picking / cycle 자동 포함 (#713 / #719 — 코드 0)

#713 picking predicate + #719 multiPick cycle 이 데이터 driven:

```
predicate = 활성 LOD variant (isVisible && isEnabled) + metadata.bodyId 존재 + allowlist (isRPhaseFocusable)
```

| 검증 항목                  | 자동 포함 메커니즘                                                                                           | 코드 영향           |
| -------------------------- | ------------------------------------------------------------------------------------------------------------ | ------------------- |
| 신규 mesh 클릭 선택 (#713) | mesh 생성 시 `metadata.bodyId` 부여 (기존 createBodyMesh 경로) + allowlist (CURRENT_R_PHASE=13)              | **0줄**             |
| 신규 mesh cycle (#719)     | `scene.multiPick` predicate 동일 SSoT. titania↔oberon / triton↔proteus↔neptune disk 겹침 시 ray 깊이순 cycle | **0줄**             |
| ring/궤도선 오선택 방지    | ring/궤도선 mesh 는 metadata.bodyId 없음 → predicate 조기 필터                                               | **0줄** (기존 가드) |

#### 자동 포함 확인

1. **신규 mesh metadata.bodyId** — `createBodyMesh*` 가 모든 body 에 `mesh.metadata.bodyId` 부여 (3 variant). 신규 위성도 동일 경로 → O(1) 역매핑 자동
2. **allowlist** — CURRENT_R_PHASE=13 으로 2 위성 allowlist 진입 → predicate 통과
3. **cycle 겹침 대상** — uranus focus 에서 titania + oberon, neptune focus 에서 triton + proteus 가 같은 화면 영역 → 반복 클릭 시 ray 뒤 body 순환 (#719). proteus (neptune 근접, ×220 분리) 가 neptune disk/ring 과 겹칠 가능성 → cycle 실효 타겟
4. **occlusion** — multiPick depth 정렬 + bodyId dedup (첫 등장) + 직전 id 앵커 wrap (#719 §결정). 신규 위성 자동 포함

> **D-T2 검증 의무** — uranus 위 겹친 위성 반복 클릭 시 cycle 동작 (titania↔oberon↔uranus). neptune 위 cycle (triton↔proteus↔neptune). #719 회귀 0 확인.
>
> **ring 외곽 occlusion 관찰 (#721 이견 답습)** — proteus 는 visual scale ×220 적용 후 visual orbit 가 **Adams ring outer mesh 바로 밖 (마진 1.64x)** 이라 ring 외곽 mesh 와 인접. D-T2 에서 proteus billboard/궤도선이 ring 외곽 alpha mesh 에 가려져 식별 불가한지 관찰. 가려지면 proteus ×220→×235 (마진 1.75x, ring 에서 더 분리) fallback (§재검토 트리거 #2).

---

## 결과·재검토 조건

### 기대 효과 (측정 가능)

- **2 위성 렌더** — uranus focus 에서 titania + oberon, neptune focus 에서 triton + proteus billboard/mesh 가시 (D-T2 실 Chrome)
- **클릭/URL 선택** — `?focus=oberon` / `?focus=proteus` URL + 클릭/터치 (#713) focus 전환. cycle (#719) 동작
- **궤도 분리** — uranus 2 위성 (titania 1.65x / oberon 2.22x, 둘 다 ×50) + neptune 2 위성 (triton 1.65x ×75 / proteus 1.64x ×220) 궤도선이 ring 밖 분리. 각 마진 ≥ 1.5x (산식 A)
- **JPL frame 정합** — oberon 동일 Uranus-centric Ecliptic (titania 클러스터 ~98°). proteus 동일 Neptune-centric Ecliptic (REF_PLANE=ECLIPTIC). 평면 정합 (버그 오인 금지)
- **R-Phase allowlist** — CURRENT_R_PHASE=13 으로 2 위성 focus 가능. FOCUS_BODIES 정합 (#598 가드)

### 트레이드오프로 받아들인 비용

- **proteus body scale 단일값 (300) 시 수렴대 미달** — 사실 radius 0.155배 정직 반영 (billboard fallback 흡수). D-T2 에서 식별 불가 시 500 (후보 B)
- **proteus per-body ×220** — neptune 단일 ×75 대비 proteus 만 2.9배 큰 visual orbit. triton 회귀 회피 위해 per-body 분리 (코어 코드 0 — 상수 entry 1줄)
- **oberon visual scale 단일 룩업 ×50 (titania 동일)** — oberon 이 실제로 멀어 (a 1.34배) ×50 으로도 자연스러우나, 사실 a 비율이 visual 에서 과장 안 됨 (titania 와 동일 parent scale)

### 재검토 트리거

1. **#1 (proteus body scale D-T2 미통과)** — developer/D-T2 에서 "proteus 가 안 보임/너무 작음" → proteus scale 300 → 500 (후보 B, Amendment)
2. **#2 (orbit 마진 부족)** — D-T2 "proteus 가 ring 에 묻힘" → proteus ×220 → ×235 (마진 1.75x). "oberon 이 titania 와 겹쳐 보임" → oberon per-body ×55~60 도입 (단 현재 마진 2.22x 충분)
3. **#3 (oberon 과분리 보고)** — D-T2 "oberon 이 너무 멀어" → 현재 ×50 자연스러움 (마진 2.22x), 보고 시 per-body ×45 도입 검토
4. **#4 (산식 A vs B mismatch)** — runtime 측정 (산식 B) 이 산식 A 와 다름 → #622 NO-OP SSoT 재확인 (metric 정의 차이 — 버그 아님)
5. **#5 (거성 위성 비대칭 판정 일반화)** — 후속 천왕성·해왕성 다중 위성 진입 시 본 ADR 비대칭 판정 (바깥=단일 룩업 / 안쪽=per-body) 재사용

### Concrete Prediction

본 라운드는 **#721 인프라 위에서 진짜 "데이터만" 라운드** — 코어 함수/scene `.ts` 변경 0. (#721 이 "코드 0 불가 축" 으로 분류했던 orbit 축마저 solar-system-scene generic per-body 처리 완료로 코드 0)

- **scale 추가 시 (§축 1)**: `body-scale.ts` BODY_SCALE 룩업 **2줄 추가** (oberon/proteus). 호출 코드 변경 0
  - 검증: `git diff --stat apps/web/src/constants/body-scale.ts` — BODY_SCALE 2줄 외 변경 0
- **orbit per-body 추가 시 (§축 2)**: `orbit-visual-scale.ts` `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 상수 객체에 **proteus 1줄 추가** (entry). **`getOrbitVisualScale` 함수 변경 0 / `ORBIT_VISUAL_SCALE_BY_PARENT` 변경 0** (uranus 50 / neptune 75 유지)
  - 검증: `git diff --stat packages/core/src/scene/orbit-visual-scale.ts` — 상수 객체 entry 1줄 (+ 주석) 외 함수 body 변경 0
- **scene per-body 처리 (§축 2)**: `solar-system-scene.ts` **변경 0줄** (#721 이 line 622/1674 generic 처리 완료)
  - 검증: `git diff --stat packages/core/src/scene/solar-system-scene.ts` — `*.ts` 변경 0건이면 예측 성공 (**#721 대비 핵심 차별점**)
- **allowlist 진입 시 (§축 3)**: `r-phase-allowlist.ts` `CURRENT_R_PHASE` **1줄** (12→13). 필터 로직 0. `solar-system.json` 위성 2항목 추가 (데이터)
  - 검증: `git diff --stat packages/core/src/scene/r-phase-allowlist.ts` — CURRENT_R_PHASE 1줄 외 변경 0
- **picking/cycle 자동 포함 시 (§축 5)**: `body-picking.ts` **변경 0줄** (predicate 데이터 driven)
  - 검증: `git diff --stat packages/core/src/scene/body-picking.ts` — `*.ts` 변경 0건이면 예측 성공
- **종합 git diff --stat 예측**:
  - 데이터: `solar-system.json` (+2 위성 항목)
  - 상수: `body-scale.ts` (+2줄) / `orbit-visual-scale.ts` (+1 entry) / `r-phase-allowlist.ts` (+1줄 CURRENT_R_PHASE + 주석)
  - 가드: `browser-verify-378-focus.mjs` + `browser-verify-r-phase-allowlist.mjs` FOCUS_BODIES (+2줄, #598 정합)
  - **코어 함수/scene `.ts` 변경 0** (solar-system-scene / body-picking / getOrbitVisualScale 함수 body 미변경)
  - 실패 시 대응: solar-system-scene 변경 발생 시 #721 generic 처리 회귀 의심 → Amendment 박제

---

## 재도입 트리거

> 본 ADR 은 Accepted 예정 (Provisional). 폐기/보류 결정 아님. 단 **neptune 단일 룩업 상향 (후보 A/B) 를 본 라운드에 채택하지 않음** — proteus per-body (후보 C) 채택.

- **neptune 단일 룩업 재도입 검토 조건**: 후속 라운드에서 해왕성 위성이 proteus 안쪽 극단 없이 triton 근처/바깥만 추가되면 per-body 불필요 → parent 단일 룩업 회귀 검토. 단 proteus per-body 가 이미 SSoT 라 회귀 비용 > 유지 비용
- **Graceful Degradation**: per-body 룩업 미정의 위성 (oberon/titania/triton) 은 `ORBIT_VISUAL_SCALE_BY_PARENT` parent 룩업 fallback (uranus 50 / neptune 75) → `DEFAULT_ORBIT_VISUAL_SCALE` (1.0) 자동 안전
- **재도입 시 선행 작업**: 단일 룩업 회귀 시 proteus per-body 박제값 (220) 을 parent 단일값으로 통합 가능한지 binding 재산출 필요 (triton 회귀 위험 재검토)

---

## 교차검증 반영 사항 (cross-validate 2026-06-21 agy outcome=applied)

> architect 1차 시도는 agy 2회 비응답(empty fatal-error + 300s timeout hang)으로 미확보 → **메인 오케스트레이터가 agy 복구(probe READY) 후 재시도**(`cross-validate-architecture-20260621-011414`, outcome=applied)하여 외부 시각 확보. agy 평가: **"R11 유산·헬퍼 100% 재사용으로 코어 코드 변경 범위를 0으로 묶은 극도로 안정적 설계, 비대칭 스케일링 정합성 뛰어남"** → Accepted 추천(조건부 — Adams ring 가독성 D-T2 실측 후).
>
> ### 합의 (agy — 핵심 결정 전부)
>
> - **oberon uranus ×50 parent 양립**(마진 2.22x, per-body 불필요 = 미니멀리즘·복잡도 통제 우수) / **proteus ×220 per-body**(neptune ×75 단일 시 0.56x 본체·고리 묻힘, triton 회귀 보존 위해 proteus만 분리 = 가장 합리적 절충) / **scale 이원화**(oberon 500 사실비율, proteus billboard fallback D-T2) / **REF_PLANE=ECLIPTIC**(proteus i~28° Neptune 적도면 근접 — 미지정 시 triton ecliptic 과 28° 비틀림 원천 차단) / **Concrete Prediction 코어 0**(getOrbitVisualScale generic 재사용) — agy 전부 명시 지지.
> - agy 일반화 인정: "기존 binding 위성보다 안쪽 궤도 → per-body, 바깥 → parent 공유+fallback" 아키텍처 확장 표준 수립 (Miranda/Nereid 등 후속 적용).
>
> ### 고유 발견 — 범위 내 수용 (developer/qa 인계)
>
> - **(② Adams ring 가독성 D-T2)** — proteus ×220 마진 1.64x 는 Adams ring 외곽에 궤도선 형성. 고리 mesh opacity/궤도선 두께에 따라 뭉쳐 클릭 피킹 어렵거나 시각 노이즈 가능 → **developer/qa D-T2 필수 체크: Adams ring outer boundary ↔ proteus 궤도선 물리 거리 가독성. 시각 침범 확인 시 ×235(마진 1.75x) scale up Amendment**. #721 enceladus ring occlusion D-T2 와 동형.
>
> ### 기각 / 후속 (범위 밖)
>
> - **(① Proteus 구체 근사 고지 문구)** — agy 가 UI 툴팁에 "불규칙 다면체를 구체 근사" 고지 권고. 그러나 **현재 모든 위성(phobos/deimos 비구체 포함)이 구체 근사**인데 proteus 만 고지하면 비일관 → 전체 위성 비구체 고지 정책은 별도 후속(본 라운드 비-범위 "표면 디테일"과 직교). 기각 — 향후 일괄 정책 시 반영.
>
> ### Claude 편향 셀프 체크 (4종) + 1차 claude-only 자체 재분석
>
> 아래는 architect 1차 claude-only 분석 — agy 재검증으로 **결합 간과(비대칭 판정)·순수주의(billboard) 셀프 통과가 외부 합의로 확인**됨(agy 질문 1·2 명시 지지), 질문 3(REF_PLANE)·4(코어 0)도 agy 합의. (본문의 "외부 검증 미확보" 표현은 1차 시점 기록 — 재시도 applied 로 해소.)

### 호출 전 Claude 편향 셀프 체크

- **낙관적 일정**: N/A (설계 ADR — 일정 추정 없음). 통과
- **결합 간과**: oberon (titania 바깥 → 단일 룩업 양립) vs proteus (triton 안쪽 → per-body binding) 비대칭을 §축 2 에서 명시 분석 — **셀프 통과**. (cross-validate 질문 1 로 삽입했으나 agy 비응답으로 외부 검증 미확보)
- **폐기 프레이밍**: neptune 단일 룩업을 "폐기" 아닌 "triton 유지 + proteus 만 per-body" + §재도입 트리거 박제 — 통과
- **순수주의**: proteus 사실 비율 위배 (triton 의 0.155배, billboard fallback) 를 Visual Fidelity §1 로 정당화 + developer D-T2 위임 — 통과. (cross-validate 질문 2 로 삽입했으나 agy 비응답으로 외부 검증 미확보)

### claude-only 자체 재분석 (외부 모델 미확보 — self-review 한계)

1. **[결합 간과 — 질문 1] a 위치 기반 비대칭 판정의 타당성**: 자체 재검토 결과 **유지**. 두 계를 동일 처리 (둘 다 per-body / 둘 다 단일) 하지 않는 근거는 산식 A 실측 — oberon 은 uranus ×50 으로 마진 2.22x (≥1.5 충족) 이라 per-body entry 추가는 코드/박제 증가만 있고 시각 이득 0 (YAGNI). proteus 는 neptune ×75 로 0.56x (binding 미달) 이라 per-body 불가피. 비대칭은 데이터 (a 위치) 의 비대칭을 정직 반영한 것이지 설계 일관성 결함이 아님. **단 외부 검증 미확보로 "두 계 동일 처리가 mental model 단순성 측면에서 더 나은지" 는 미검증 — D-T2 후 reviewer 재판단 여지 남김**
2. **[순수주의 — 질문 2] proteus scale measurement-first 위임 타당성**: **유지**. proteus 가 어떤 scale 도 수렴대 미달 (300~800 모두 sub-pixel) → billboard fallback 전면 의존이므로 이론 배율 차이가 화면 가시성에 직접 안 이어짐. #721 enceladus 가 정확히 동일 상황에서 D-T2 위임 → 250 확정된 선례 답습. architect 단일값 확정은 화면 미관찰 상태의 과신
3. **[JPL frame — 질문 3] REF_PLANE=ECLIPTIC proteus 위험 분석**: **유지 + 강화 권고**. proteus i ~28° (Neptune 적도면 근접) 라 REF_PLANE 미지정 시 적도면 반환 → 기존 triton (ecliptic 기준 렌더) 과 평면 어긋남 위험은 #721 enceladus (Saturn 적도면 28° 어긋남) 와 정확히 동형. developer 가 Horizons 쿼리에 명시 + `$comment` 박제 의무 (§축 4). oberon 은 titania 클러스터 (~98°) 라 동일 frame 이면 자동 정합
4. **[Concrete Prediction — 질문 4] "코어 코드 0" 예측**: **유지**. solar-system-scene line 622/1674 가 #721 에서 `getOrbitVisualScale(body.parentId, body.id)` generic 호출로 전환됨을 실측 확인 (배경 §). picking (#713 데이터 driven) / LOD (body 무관 거리 기반) / camera (focus 진입은 allowlist 만 참조) 모두 신규 위성 자동 처리. **잠재 변경 지점 점검**: `celestial-info-panel.tsx` "× N 과장 중" tooltip 은 `getBodyScale` 룩업 참조 (데이터 driven, 코드 0) / FOCUS_BODIES 가드 (#598) 는 데이터 순서 동기화 필요 (코드 아닌 리스트 항목). **빠뜨린 코어 `.ts` 변경 지점 없음 — 데이터/상수/가드 리스트만**. 단 외부 검증 미확보로 developer 가 `git diff --stat` 실측으로 예측 재현 의무 (Concrete Prediction 검증)

---

## 참고

- 이슈: [#725](https://github.com/coseo12/astro-simulator/issues/725)
- 1차 SSoT: R11 [`20260620-721-saturn-moons-rhea-iapetus-enceladus.md`](20260620-721-saturn-moons-rhea-iapetus-enceladus.md) (per-body 룩업 + REF_PLANE=ECLIPTIC + solar-system-scene generic 처리)
- 선례 ADR: R8 [`20260610-r8-uranus-titania-rings-visualization.md`](20260610-r8-uranus-titania-rings-visualization.md) (titania/uranus ring binding) / R9 [`20260610-r9-neptune-triton-rings-visualization.md`](20260610-r9-neptune-triton-rings-visualization.md) (triton/neptune ring binding) / R6 §축 4 (산식 A·B) / R5 §위험 #6 (per-body 룩업 인계)
- 인프라: #613 메타데이터 SSoT / #713 클릭 선택 / #719 겹침 cycle / #622 산식 A·B NO-OP
- 외부: NASA Uranus/Neptune Moon Fact Sheets (Oberon/Proteus) / JPL Horizons API (Uranus/Neptune-centric J2000 Ecliptic, REF_PLANE=ECLIPTIC)
- 횡단: [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity / [`docs/glossary.md`](../glossary.md)
