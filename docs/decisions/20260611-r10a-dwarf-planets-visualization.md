# ADR: R10a 왜소행성 5 body 시각화 — 첫 비-행성 라운드 + dwarf scale 4번째 그룹 (dwarf=800 inner 답습) + R10a/R10b allowlist 분리 메커니즘 (혜성 phase 11 재박제)

- **상태**: **Accepted (cross-validate 2026-06-11)** — agy 교차검증 완료 (outcome=applied, 조건부 Accept). §교차검증 반영 사항 4축 분류 통합 후 전이 (#370 옵션 C 워크플로)
- **날짜**: 2026-06-11
- **결정자**: architect (R10 PM 합의 라운드 완료 2026-06-11 — Q1=A: **R10a 왜소행성 5 / R10b 혜성 3 분할, 각각 독립 릴리스** / Q2=A: **dwarf=800 (inner 답습)** — cross-group 사실 서열 보존 (pluto visual < mercury visual) + 그룹 내 서열 자동 보존, ceres 등 소형은 billboard 4px fallback 의존 허용 / Q3=A: **shortcut bar pluto 만 true 승격**, 나머지 4 false / Q4 비목표: 혜성 꼬리·코마 ❌ / charon 등 위성 ❌ / 궤도 세차 ❌ / 기존 body 실측 데이터 변경 ❌. **PM 합의 그대로 박제 — 재구조화 금지**)
- **관련**: [#659](https://github.com/coseo12/astro-simulator/issues/659) (R10a 본 스프린트), [`20260610-r9-neptune-triton-rings-visualization.md`](20260610-r9-neptune-triton-rings-visualization.md) (R9 SSoT — §R10 인계 8항목을 본 ADR 이 전부 소화), [`20260610-r8-uranus-titania-rings-visualization.md`](20260610-r8-uranus-titania-rings-visualization.md) (ice giant 정책 / px-ratio 결정 트리 원본), [`20260604-613-r-phase-metadata-ssot.md`](20260604-613-r-phase-metadata-ssot.md) (introducedInRPhase 데이터 SSoT — 본 라운드 분리 메커니즘의 보존 대상), [`20260528-r5-mars-visualization.md`](20260528-r5-mars-visualization.md) (Q2=B 인스턴스 + N/A 임계 선례), [`20260606-627-satellite-orbit-structure-forensic.md`](20260606-627-satellite-orbit-structure-forensic.md) (궤도선 구조 — 본 라운드는 satellite 0 이라 planet batch 만), [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541 의무 체크리스트 4항목)
- **교훈 적용**:
  - "신규 데이터 ≠ 신규 코드" — R9 §Concrete Prediction 의 R10 예측 ("CURRENT_R_PHASE=10 1줄 + BODY_SCALE 신규 그룹 N줄, ring/tilt/satellite 룩업 전부 0") 재현 검증이 본 ADR 산출물. **tierFromFocus `dwarf-planet` 분기 (tier.ts:112) + LOD_BODY_THRESHOLDS `dwarf-planet`/`comet` 항목 (lod-body-thresholds.ts:68) 전부 기존재 실측** — P11-B 시점 선행 인프라의 첫 실전 발동 (§Concrete Prediction)
  - "이슈 전제 코드 전수 확인" (#624 NO-OP 교훈) — R9 인계 #3 의 "궤도선 sampling 이 균등 mean-anomaly 기반이면 근일점 vertex 밀집" 가정을 실측 기각: `sampleOrbitPoints` 는 **진근점각 (true anomaly) 등간격 64 segments** (solar-system-scene.ts:1977). R10a 최대 e=0.436 (eris) 은 기존 mercury e=0.206 동일 코드 경로 — 코드 0. e=0.967 (halley) 실측 의무는 R10b 인계 (§R10b 인계 #1)
  - "DoD PASS ≠ 제품 동작" (volt [#74](https://github.com/coseo12/volt/issues/74)) — eris 궤도선 (aphelion 97.46 AU) 은 default 진입 프레임 밖 — "기본 진입 시 visible" DoD 해석 기준을 사전 박제 (§축 3 — 줌아웃 단일 입력 도달 기준). pluto/eris 식 px 차 0.14px (시각 식별 불가) 도 사전 등록 (§위험 #2)
  - "수치 DoD 미달 시 측정 방법 검증 우선" (volt [#32](https://github.com/coseo12/volt/issues/32)) — 5 body 전부 39~68 AU 대 depth (ceres 만 2.77 AU): px-ratio 실측은 N/A 예상 (R8 Amendment 1 ① 의 depth 투영 축소 방향 — uranus 19 AU 에서 이미 ×0.41) (§축 5)

---

## 현재 유효 결정 요약 (Living ADR Executive Summary)

> **PM 정책 결정 확정 (2026-06-11, 권장안 일괄 승인 — 그대로 박제)**: Q1=A (R10a 왜소행성 5 → R10b 혜성 3, v0.24.0/v0.25.0 독립 릴리스 리듬) / Q2=A (dwarf=800 inner 답습) / Q3=A (pluto 만 shortcut bar 승격) / Q4 비목표 4종.

### 핵심 박제값 표

| 항목                                                | 박제값                                                                                                                                | 위치                                                          | 비고                                                                                                                                                                                                                                                       |
| --------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| `BODY_SCALE.{ceres,pluto,haumea,makemake,eris}`     | **전부 800** (dwarf 그룹 — 4번째 scale 그룹, inner 700~800 계보 답습)                                                                 | `apps/web/src/constants/body-scale.ts`                        | §축 1 — 단일값 800 으로 그룹 내 사실 서열 (pluto > eris > haumea > makemake > ceres) **자동 보존** + cross-group (pluto×800 = 9.5064e8 < mercury×700 = 1.70779e9, 비 0.557) 보존. 식 px: pluto 6.73 / eris 6.59 / haumea 4.42 / makemake 4.05 / ceres 2.66 |
| **혜성 3 body `introducedInRPhase` 10 → 11 재박제** | halley / encke / swift-tuttle (데이터 3값 + `$comment`)                                                                               | `packages/shared/data/solar-system.json`                      | §축 2 — **R10a/R10b allowlist 분리 메커니즘 (옵션 a 채택)**. 로드맵 매핑 **R10a = phase 10 / R10b = phase 11** 박제. #613 데이터 SSoT 보존 — 코드 0                                                                                                        |
| `CURRENT_R_PHASE`                                   | **9 → 10** (1줄)                                                                                                                      | `packages/core/src/scene/r-phase-allowlist.ts`                | #613 자동 생성 6번째 실전 — allowlist `[...R9 19 body, ceres, pluto, haumea, makemake, eris]` = 24 body 자동 확장 (혜성 3 은 phase 11 로 자동 제외)                                                                                                        |
| pluto `showInShortcutBar`                           | **false → true** (데이터 1값) + `FOCUS_BUTTONS` `{ id: 'pluto', label: '명왕성' }` 1줄                                                | `solar-system.json` / `focus-quick-buttons.tsx`               | §축 4 — PM Q3. 거리순 마지막 (39.48 AU > neptune 30.07). 14버튼 — 모바일 overflow-x-auto 흡수 (R8 12 / R9 13 선례). ceres/haumea/makemake/eris 는 false 유지 (URL 진입)                                                                                    |
| `PX_RATIO_THRESHOLDS.{5 body}`                      | **전부 N/A (미박제)**                                                                                                                 | r1-guard 미박제                                               | §축 5 — 4px fallback 의존 + depth 투영 축소 (39~68 AU). 회귀 가드는 Allowlist (#613) + FOCUS_BODIES (#598) + targetIds (#619) 우회 — phobos/deimos §결정 6 답습                                                                                            |
| `FOCUS_BODIES` + r1-guard `targetIds`               | 19 → **24 body** (+ceres, +pluto, +haumea, +makemake, +eris)                                                                          | `browser-verify-378-focus.mjs` / `r1-ui-regression-guard.mjs` | §축 6 — #598/#619 정적 매칭 가드 차단 회피. CURRENT_R_PHASE=10 과 동시 갱신 의무                                                                                                                                                                           |
| negative 케이스 재배치                              | **allowlist 축: pluto → halley** (URL 4-A / tree 5-B·5-C / url-sync·tree·info-panel 테스트) / **bar 미등록 축: ceres** (#617 직교 축) | browser-verify + 단위 테스트 5 파일                           | §축 4 — pluto 가 R10a 진입으로 positive 전환. allowlist negative 는 phase 11 혜성 (halley) 만 가능. PM Q3 "ceres 등 교체" 는 bar 미등록 직교 축에 매핑                                                                                                     |
| scenario preset                                     | **pluto-x10 zero-touch enabled 재현** (5번째) + **halley-x10 신규 negative** (R10b)                                                   | `scenario-presets.tsx`                                        | §축 6 — R6 saturn-x10 / R7 uranus-x10 / R8 neptune-x10 / R9 pluto-x10 선례 답습                                                                                                                                                                            |
| time-reversal 테스트                                | **변경 0 (제외 불필요)**                                                                                                              | `time-reversal.test.ts`                                       | §축 6 — 5 body 는 데이터 기박제라 **이미 테스트에 포함 + green** (2026-04-21 박제 이후). 제외 메커니즘 (단주기 위성 step 누적) 비해당 — 공전 주기 ceres 4.6y ~ eris 559y. dev `--include-ignored` 포함 전체 green 실측 확인만                              |
| 모바일 diskArea baseline                            | **R9 재실측 16.82% 기준** (PR [#655](https://github.com/coseo12/astro-simulator/pull/655) — neptune off-screen 으로 R8 값 유지 적중)  | r1-guard                                                      | §점유율 — 5 body 전부 모바일 off-screen 예상 (최근접 ceres 2.77 AU — uranus 19 AU 도 off-screen 선례). 보수 상한 ≈ 16.88% ≤ 25%                                                                                                                            |

### 핵심 결정 요약

1. **dwarf=800 — 4번째 scale 그룹, inner 계보 답습 (PM Q2=A)** (§축 1): 그룹 단일값 800 으로 그룹 내 상대 비율 = 사실 radius 비 자동 보존 (R5 mars=earth / R7 saturn=jupiter / R9 neptune=uranus 동형 4번째) + cross-group 사실 서열 (pluto < mercury) 보존. scale 정책 4그룹 체계 완성: inner 700~800 / gas giant 48 / ice giant 250 / **dwarf 800**
2. **R10a/R10b allowlist 분리 = 혜성 introducedInRPhase 10→11 재박제 (옵션 a)** (§축 2): 데이터 3값만 변경, 코드 0, #613 데이터 SSoT 보존. sub-phase 필드 신설 (옵션 b — 스키마/필터 코드 변경) 과 kind 필터 (옵션 c — 코드가 phase 지식 보유, #613 역행) 기각. 로드맵 라벨 ↔ phase 정수 매핑 (R10a=10 / R10b=11) 을 데이터 `$comment` + allowlist 주석 + 로드맵 문서 3곳 박제
3. **eris 궤도선 DoD 해석 기준 사전 박제** (§축 3): aphelion 97.46 AU = T1 solar 1224.7 scene unit — default 진입 (camera radius 35) 프레임 밖은 **jupiter~neptune 궤도와 동일한 기존 제품 동작** (결함 아님). PASS 기준 = "기본 진입 후 휠 줌아웃 단일 입력만으로 eris 궤도 폐곡선 전체 프레임 도달" (upperRadiusLimit 1e14 / maxZ 1e14 로 구조 보장 — 필요 radius ≈ 2,900 unit 실측 박제 의무)
4. **shortcut bar pluto 승격 + negative 2 직교 축 재배치** (§축 4): allowlist 미진입 negative 는 halley (phase 11) 로, bar 미등록 negative (#617 직교 축) 는 ceres 로 분리 — pluto 의 negative→positive 전환으로 소멸하는 가드 커버리지를 두 축 모두 보존
5. **px-ratio 전부 N/A** (§축 5): 5 body 모두 4px fallback 의존 (solar view) — phobos/deimos §결정 6 / galilean / titan / titania / triton 선례 7번째. 식 sunPxRatio (pluto 2.73% ~ ceres 1.08%) 는 정책 기록만, guard 미박제
6. **첫 비-행성 라운드인데 코어 코드 ≤ 7 라인** (§Concrete Prediction): tierFromFocus / LOD / 궤도선 / 물리 (N-body 는 이미 24 body 적분 중) 전부 기존 경로 — R9 예측 "ring/tilt/satellite 룩업 0" 재현 검증

### 비-범위 (R10a)

- 혜성 3 body (halley/encke/swift-tuttle) 진입 ❌ — R10b 후행 라운드 (PM Q1). 고이심률 e=0.967 궤도선 실측 검증도 R10b 인계
- 혜성 꼬리 / 코마 ❌ (PM Q4)
- charon 등 왜소행성 위성 ❌ — 데이터 부재 (R9 인계 #6 — satellite N≥5 단일 룩업 한계는 위성 확장 라운드로 재이월)
- 궤도 세차 ❌ — osculating elements 고정 (전 body 동일 정책)
- 기존 19 body 실측 데이터 변경 ❌ — 신규 추가/메타 변경만 (혜성 introducedInRPhase 는 **프로젝트 메타데이터**이며 실측 천문 데이터가 아님 — Q4 비목표 비저촉, §축 2)
- 본체 mesh 자전/텍스처 ❌ / haumea 비구형 (1161×852×513 km) 표현 ❌ — volumetric mean radius 구체 근사 (데이터 `$radiusComment` 기존재)
- LOD 시스템 변경 ❌ (R4 Amendment 3 보존)
- 클릭 raycast 선택 ❌ (#624 — picking 미구현, URL/bar/tree 진입만)

---

## 배경

### Roadmap v3 §R10 + R9 ADR §R10 인계 8항목 이행

[`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) — R10 = 왜소행성 + 혜성 (선택적 라운드, 로드맵 행성 완주 후 첫 비-행성). R9 ADR §R10 인계 8항목의 본 ADR 소화 위치:

1. **8 body 동시 진입 D-T2 비용 → 분할 권장** — PM Q1=A 로 승인 (R10a 5 / R10b 3). §축 2 가 분리 메커니즘 설계
2. **scale 4번째 그룹 필요** — §축 1 (dwarf=800, PM Q2=A. 인계가 예고한 "phobos/deimos 5000 계보 재적용" 은 기각 — 서열 보존 제약과 양립 불가, §축 1 후보 C)
3. **혜성 고이심률 궤도선 실측 의무** — sampling 코드 전수 확인 완료 (true anomaly 등간격 64 seg — mean-anomaly 가정 기각). R10a 는 e≤0.436 으로 기존 경로, e=0.967 실측은 R10b 인계 (§R10b 인계 #1)
4. **a 범위 2.77~67.9 AU / eris 궤도선 가시성** — §축 3 (DoD 해석 기준 + 실측 계획)
5. **shortcut bar 정책 재논의** — PM Q3=A (pluto 만 승격). §축 4
6. **satellite 단일 룩업 한계 이월** — R10a 위성 0 (charon 데이터 부재) — 위성 확장 라운드로 재이월 (§R10b 인계 #5)
7. **모바일 diskArea baseline = R9 재실측값** — 16.82% (PR #655 실측 — neptune off-screen 분류로 R8 값 유지 적중). §점유율
8. **scenario preset negative 재현** — pluto-x10 zero-touch enabled (5번째) + R10b negative 신규 (halley-x10). §축 6

### 현재 baseline 실측 (2026-06-11 develop tip = `dc3c2ab`)

- `BODY_SCALE`: sun 50 / mercury 700 / venus·earth·mars 800 / moon 200 / phobos·deimos 5000 / jupiter·saturn 48 / galilean·titan 100 / uranus·neptune 250 / titania 500 / triton 300 — **R10 8 body 미정의 (default 1.0)**
- `CURRENT_R_PHASE = 9` / allowlist 19 body
- `solar-system.json` 실측: **R10 8 body 전부 기박제** (2026-04-21 lastVerified) — introducedInRPhase=10 / showInShortcutBar=false. 왜소행성 5 는 `kind: 'dwarf-planet'` / parentId=sun / orbit 6 요소 완비 (ceres NASA Dawn·JPL SBDB / pluto New Horizons·JPL SBDB / haumea Ragozzine & Brown 2009·Ortiz 2017 / makemake Ortiz 2012 occultation / eris Sicardy 2011 occultation). **R10a 신규 body 데이터 0 — 메타 변경만**
- **선행 인프라 실측 (#624 교훈 — 이슈 전제 코드 전수 확인)**:
  - `tierFromFocus`: `'dwarf-planet'`/`'comet'` 명시 분기 → T3 body (tier.ts:112~117, P12-A #298 N4) — **focus 경로 코드 0**
  - `LOD_BODY_THRESHOLDS`: `'dwarf-planet'` (radius-multiple ×5) / `'comet'` (×3) 항목 기존재 (lod-body-thresholds.ts:68~69) — **LOD 코드 0**
  - `sampleOrbitPoints`: 진근점각 등간격 64 segments (solar-system-scene.ts:1974~2006) — 궤도선 batch 는 `R_PHASE_BODY_ALLOWLIST` 필터 (line 550, #439 defense-in-depth #5). 5 body 전부 parentId=sun → planet batch (satellite LineSystem 비대상) — **궤도선 코드 0**
  - mesh 생성 (line 416) 은 전 body 무필터 — R10 body 는 현재도 scale 1.0 점 수준 렌더 중. BODY_SCALE 박제 + allowlist 진입이 가시화의 전부
  - 물리: N-body 엔진은 전 24 body 적분 중 (allowlist 는 focus/궤도선 게이트만) — time-reversal.test 도 이미 5 왜소행성 + 3 혜성 포함 green
- **r1-guard 실측**: `targetIds` 19 body / `PX_RATIO_THRESHOLDS` = mercury 4.95 ~ uranus 7.9 + neptune (R9 결정 트리 박제값) — R10 body 부재. 모바일 off-screen 제외 baseline **16.82%** (R9 PR #655 재실측 — R8 값 유지 적중)
- `FOCUS_BUTTONS`: 13 id (sun~neptune) — pluto 부재. #617 가드 3종 (shortcutBodies/FOCUS_BUTTONS/RPHASE_EXPECTED_ENABLED) 이 showInShortcutBar 파생과 정합 차단 중
- negative 케이스 현재 배치 (R9 에서 neptune → pluto 교체): URL 4-A `?focus=pluto` / tree-pluto disabled / preset 6-G pluto-x10 / url-sync·celestial-tree·celestial-info-panel·body-scale 단위 테스트 4종

### 데이터 사실 비율 (기박제 데이터 — 변경 없음)

| body     | radius (m) | a (AU)     | e           | i (deg)   | 공전 주기 (yr) | 비고                                               |
| -------- | ---------- | ---------- | ----------- | --------- | -------------- | -------------------------------------------------- |
| ceres    | 4.696e5    | 2.765      | 0.0785      | 10.59     | 4.60           | 소행성대 — 그룹 내 유일 < 5 AU                     |
| pluto    | 1.1883e6   | 39.48      | 0.2488      | 17.14     | 248.1          | 그룹 최대 radius                                   |
| haumea   | 7.8e5      | 43.13      | 0.1913      | 28.21     | 283.2          | volumetric mean (비구형 — `$radiusComment` 기존재) |
| makemake | 7.15e5     | 45.79      | 0.1559      | 29.00     | 309.9          | —                                                  |
| eris     | 1.163e6    | **67.864** | **0.43607** | **44.04** | 559.1          | 그룹 최대 a/e/i — 궤도선 가시성 축 (§축 3)         |

- 사실 radius 서열: **pluto (1.1883e6) > eris (1.163e6) > haumea (7.8e5) > makemake (7.15e5) > ceres (4.696e5)** — pluto/eris 비 1.0218 (근소)
- cross-group: pluto radius = mercury (2.4397e6) 의 0.487배
- inclination 10.6~44.0° — 기존 코드 경로 (mercury 7° 와 동일 회전 변환, 신규 0). e 0.079~0.436 — mercury e=0.206 동일 경로 (eris 가 기존 최대 e 의 2.1배이나 true-anomaly 등간격 sampling 은 e 무관 동작, §축 3)

### 산출식 (R1~R9 동일)

```
px_diameter (1280×720) = body.radius × scale × k,  k = 7.0806e-9
sunPxRatio(body) = (body.radius × scale) / 3.4785e10
scene_unit (T1 solar) = 거리_m × 8.4e-11

pluto:    1.1883e6 × 800 = 9.5064e8 → px 6.73 / sunPxRatio 2.73%
eris:     1.163e6  × 800 = 9.3040e8 → px 6.59 / sunPxRatio 2.68%
haumea:   7.8e5    × 800 = 6.2400e8 → px 4.42 / sunPxRatio 1.79%
makemake: 7.15e5   × 800 = 5.7200e8 → px 4.05 / sunPxRatio 1.64%
ceres:    4.696e5  × 800 = 3.7568e8 → px 2.66 / sunPxRatio 1.08%
mercury (대조): 2.4397e6 × 700 = 1.70779e9 → px 12.09 — pluto/mercury 비 0.557 (< 1 보존)
```

---

## 축별 설계

### 축 1 — `BODY_SCALE` dwarf 그룹 = 800 (4번째 scale 그룹 — PM Q2=A, 후보 비교는 합의 근거 확인 수준)

PM 라운드가 이미 Q2=A 로 확정 — 본 절은 합의의 수치 근거를 박제하고 단위 테스트 가드를 설계한다.

| 후보                                     | scale   | pluto px | ceres px | cross-group (pluto vs mercury)                       | 평가                                                                                                                                                                                    |
| ---------------------------------------- | ------- | -------- | -------- | ---------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **A. inner 답습 (선택 — PM Q2)**         | **800** | **6.73** | **2.66** | **9.5064e8 < 1.70779e9 (비 0.557) — 사실 서열 보존** | **선택 — 그룹 단일값으로 그룹 내 서열 자동 보존 + venus/earth/mars 와 동일 계보 (왜소행성 = 암석/얼음 소천체, inner 직관 연속). ceres 등 소형은 billboard 4px fallback 의존 (PM 허용)** |
| B. ice giant 답습 (250)                  | 250     | 2.10     | 0.83     | 보존                                                 | 전 body sub-4px — pluto 마저 mesh 비가시. "왜소행성 5개 추가" 의 시각 산출물 부재. 기각                                                                                                 |
| C. phobos/deimos 계보 (5000)             | 5000    | 42.1     | 16.6     | **9.5064e8×6.25 = 5.94e9 > mercury 1.71e9 — 역전**   | pluto visual > mercury·venus·earth visual — cross-group 사실 서열 파괴 (PM Q2 제약 정면 위반). phobos/deimos 는 위성 (parent focus view 전용) 이라 cross-group 비교가 없던 경우. 기각   |
| D. 그룹 내 개별 조정 (예: ceres 만 1600) | 혼합    | —        | 5.32     | 보존                                                 | 그룹 내 서열 산식이 radius 단독에서 radius×scale 로 복잡화 — "단일값 = 서열 자동 보존" 구조 포기. ceres 가시 이득도 5.3px 수준 (4px 경계 진동). 기각                                    |

#### 선택 — **`BODY_SCALE` 5줄 전부 800 (후보 A)**

근거: ① 그룹 단일값이면 그룹 내 상대 비율 = 사실 radius 비 자동 보존 (R5 mars=earth / R7 saturn=jupiter / R9 neptune=uranus 동형 4번째) ② cross-group 서열 (pluto visual < mercury visual) 이 PM Q2 의 명시 제약 — 800 에서 비 0.557 로 보존 ③ scale 4그룹 체계 완성 (inner 700~800 / gas giant 48 / ice giant 250 / dwarf 800) — dwarf 가 inner 와 동일 대역인 것은 우연이 아니라 "사실 비율 보존 그룹" 의 연속.

#### 4px fallback 의존 분류 (식 px 기준 — 실효는 전부 billboard 예상)

- pluto 6.73 / eris 6.59 — 식 px 는 4px 초과이나, **식 k 는 depth 투영 축소 미반영** (R8 Amendment 1 ① — uranus 19 AU 실측 ×0.41). 39~68 AU depth 의 solar view 실효 px 는 sub-4px → **5 body 전부 billboard 4px fallback 의존 예상** (LOD Phase 2 #391 흡수). focus view (T3 body tier) 에서는 mesh 직접 관찰 (DoD 2)
- haumea 4.42 / makemake 4.05 — 식 레벨에서도 4px 경계 진동 대역 (R9 titania 후보 D 기각 사유 동형). billboard 의존 분류로 경계 진동 무위험
- ceres 2.66 — 식 레벨 sub-4px (PM Q2 명시 허용)

#### 서열 정량 가드 (단위 테스트 — body-scale.test.ts 신규)

```
radius × scale 곱 (결정적 — runtime 측정 불요) 기준:
  그룹 내: pluto > eris > haumea > makemake > ceres   (strict 부등호 4개)
  cross-group: pluto×800 < mercury×700                 (pluto visual < mercury visual)
  그룹 동일값: BODY_SCALE 5 body 전부 === 800           (단일값 구조 자체를 가드 — 후보 D 회귀 차단)
```

기존 `getBodyScale('pluto') === 1.0` (R10 진입 전 negative) 테스트는 **halley 로 교체** (§축 4 negative 재배치) 후 `getBodyScale('pluto') === 800` positive 로 전환.

---

### 축 2 — R10a/R10b allowlist 분리 메커니즘 (신규 결정 축 — 혜성 introducedInRPhase 10 → 11 재박제)

**충돌 실측**: `CURRENT_R_PHASE = 10` 단순 적용 시 `filterBodiesByPhase` 가 introducedInRPhase=10 인 **8 body 전부** (혜성 3 포함) 를 allowlist 에 포함 — 혜성 궤도선 (halley e=0.967, 64 seg 다각형 근사 미검증) 이 R10a 에서 무검증 노출된다. PM Q1 분할 합의와 정면 충돌 — 분리 메커니즘 필수.

| 후보                                                     | 메커니즘                                                                               | 변경 표면                                                  | #613 SSoT                                                   | R10b 시점 작업                                | 평가                                                           |
| -------------------------------------------------------- | -------------------------------------------------------------------------------------- | ---------------------------------------------------------- | ----------------------------------------------------------- | --------------------------------------------- | -------------------------------------------------------------- |
| **a. 혜성 phase 11 재박제 (선택)**                       | halley/encke/swift-tuttle `introducedInRPhase` 10 → 11 + 로드맵 매핑 R10a=10 / R10b=11 | **데이터 3값 + `$comment` — 코드 0**                       | **보존** (데이터가 분리도 표현)                             | `CURRENT_R_PHASE=11` 1줄 (기존 패턴 그대로)   | **선택**                                                       |
| b. sub-phase 필드 신설 (`rPhaseSub: 'a'\|'b'` 또는 10.5) | zod 스키마 + `filterBodiesByPhase` 시그니처/비교 로직 + CURRENT 상수 타입 확장         | 스키마 1 + 코어 함수 1 + 소비처 (테스트/가드 파생 다수)    | 보존하나 **모델 복잡화** (정수 phase 단조 증가 불변식 파괴) | sub 비교 로직 영구 잔존                       | 1회성 분할에 영구 스키마 비용 — 기각                           |
| c. kind 필터 (`kind !== 'comet'` 임시 제외)              | `filterBodiesByPhase` 또는 scene 에 kind 예외 코드                                     | 코어 코드 + #617/#598/#619 파생 가드 전부 kind 예외 동기화 | **위배** — 코드가 phase 지식 보유 (#613 취지 역행)          | 예외 코드 **제거** 필요 (임시 코드 수명 관리) | drift 가드 fail-fast 원칙과 충돌하는 임시 fallback 분기 — 기각 |

#### 선택 — **옵션 (a): 혜성 3 body introducedInRPhase = 11 재박제**

근거:

1. **데이터만 변경, 코드 0** — `z.number().int().positive()` 스키마 (loader:87) 가 11 을 무수정 수용 (max 제약 없음 실측). filterBodiesByPhase / 가드 파생 (#617 shortcutEnabled·Disabled / #619 targetIds 매칭) 전부 데이터에서 자동 파생 — 동기화 표면 0
2. **#613 데이터 SSoT 보존** — "어느 라운드에 진입하는가" 라는 분리 정보 자체를 데이터가 보유. 옵션 (c) 처럼 코드가 보유하면 R10b 에서 제거할 임시 코드가 생기고, 제거 누락 시 silent 가드 약화 ([guard-design-principles](../lessons/guard-design-principles.md) — fallback 분기 금지)
3. **Q4 비목표 비저촉** — `introducedInRPhase` 는 실측 천문 데이터가 아닌 프로젝트 메타데이터 (radius/mass/orbit 무변경). "기존 body 실측 데이터 변경 ❌" 의 보호 대상 밖
4. **라벨 ↔ phase 정수 매핑의 명시 박제 (잔여 위험 완화)**: 로드맵 라벨 "R10a/R10b" 와 phase 정수 10/11 의 mismatch 가 유일한 비용. 3곳 동시 박제로 차단 — ① `solar-system.json` 혜성 3 body `$comment` ("R10b — phase 11. 로드맵 R10 분할 (PM 2026-06-11, #659)") ② `r-phase-allowlist.ts` CURRENT_R_PHASE 주석 ("phase 10 = R10a 왜소행성 / phase 11 = R10b 혜성") ③ `roadmap-v3-incremental.md` R10 행에 분할 매핑 1줄
5. **R10b 진입 = CURRENT_R_PHASE 1줄** — 기존 R-Phase 진입 패턴이 그대로 유지 (Concrete Prediction 연속성)

> **대칭 negative**: phase 11 재박제로 halley 가 "최소 미진입 body" 가 되어 §축 4 의 allowlist negative 교체 대상으로 자연 선출 — 분리 메커니즘과 negative 재배치가 동일 결정에서 파생.

---

### 축 3 — eris 67.86 AU 궤도선 가시성 (R9 인계 #4 — DoD 해석 기준 사전 박제)

#### 기하 산출 (T1 solar renderScale 8.4e-11)

| 항목                                | 값 (AU)   | scene unit         | 비고                                                                                                                              |
| ----------------------------------- | --------- | ------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| eris a                              | 67.864    | 852.8              | neptune (30.07 AU, 377.8 unit) 의 2.26배                                                                                          |
| eris aphelion Q                     | **97.46** | **1224.7**         | e=0.436 — 궤도 폐곡선 전체 프레임의 지배 치수                                                                                     |
| eris perihelion q                   | 38.27     | 480.7              | neptune 궤도 바깥 (q > a_neptune — 교차 없음. pluto 는 q 29.66 < 30.07 로 neptune 궤도 안쪽 진입 — 사실 정합, §위험 #4 사전 등록) |
| default 진입 camera radius          | —         | 35                 | `setupArcRotateCamera({ radius: 35 })` + `controller.reset(35)` 실측                                                              |
| eris 폐곡선 전체 프레임 필요 radius | —         | **≈ 2,900 (예측)** | tan(fov/2)=0.423 기준 1224.7/0.423 — **dev 실측 박제 의무** (inclination 44° 투영 + aspect 보정으로 실측은 더 작을 수 있음)       |
| camera `upperRadiusLimit` / `maxZ`  | —         | 1e14 / 1e14        | 실측 (camera.ts:43/63) — 줌아웃 도달 구조 보장. log-depth 활성으로 far-plane 정밀도 무위험                                        |

#### DoD 해석 기준 (사전 박제 — volt #74 "DoD PASS ≠ 제품 동작" 역방향 방어)

1. **default 진입 직후 프레임 내 가시는 비요구** — default framing (radius 35) 은 inner 권역 중심이며, jupiter (5.2 AU = 65 unit) 이후 모든 외행성 궤도가 이미 프레임 밖. 이는 R6~R9 에서 수용된 기존 제품 동작 — eris 만 별도 잣대를 적용하지 않는다 (해석 기준 없이 "기본 진입 시 visible" 을 문자 그대로 읽으면 R10a 가 R6 부터 존재한 동작을 결함으로 오판)
2. **PASS 기준**: 기본 진입 (`/`) 후 **휠 줌아웃 단일 입력만으로** (focus/URL/패닝 없이) eris 궤도 폐곡선 전체가 프레임 내 식별 — headless 캡처 (`?gpu=a&lod=auto`) + 실 Chrome D-T2 각 1회. **도달 camera radius 실측값 박제** (R10b 혜성 aphelion 비교 기준선 — halley Q 35.1 AU 는 eris 보다 안쪽)
3. **5 body 궤도선 동시 가시**: 동일 줌아웃 프레임에서 ceres (34.7 unit — inner 권역) 는 sub-pixel 수렴 가능 — ceres 궤도선은 **중간 줌 레벨 (radius ≈ 80~120 unit) 에서 별도 확인** (두 줌 레벨 캡처 박제). "한 프레임에 5개 동시" 는 비요구 (a 범위 2.77~67.86 AU 의 24.5배 스팬 — 단일 프레임 동시 식별은 기하적으로 ceres 희생 불가피)
4. **off-screen 판정 시**: 줌아웃 도달 불가 (radius clamp / far-plane cull / tier 이탈) 가 실측되면 — 이는 결함 (구조 보장 실측과 모순) → forensic 전환. DoD 재해석으로 흡수 금지

#### tier 유지 검증

줌아웃 중 cameraFromSun > 3 AU (solarUpper) 유지 → tier solar 고정 (#631 tier escalation 은 deep-tier 잔존 시나리오 — 본 경로 비발동). 궤도선은 tier 전환 시 `rebuildOrbitLines` 재샘플 (renderScale 환산) — solar 단일 tier 내 줌아웃은 재샘플 없음, 64 seg 다각형이 eris 같은 대형 타원에서 chord 오차 시각 노출 가능 (§위험 #3).

---

### 축 4 — shortcut bar pluto 승격 + negative 케이스 2 직교 축 재배치 (PM Q3)

#### pluto 승격 (데이터 1값 + FOCUS_BUTTONS 1줄)

- `solar-system.json` pluto `showInShortcutBar: false → true` — #617 가드 3종 (r-phase-allowlist.test `shortcutBodies`/`shortcutEnabled` 파생 + `FOCUS_BUTTONS` 정규식 매칭 + `RPHASE_EXPECTED_ENABLED` 매칭) 이 데이터 파생과의 정합을 강제하므로 **세 위치 동시 갱신 의무**: ① 데이터 ② `FOCUS_BUTTONS` 에 `{ id: 'pluto', label: '명왕성' }` (neptune 다음 — 거리순 39.48 AU 마지막) ③ `RPHASE_EXPECTED_ENABLED` 에 `'pluto'` 추가
- 14버튼 — R7 11 / R8 12 / R9 13 선례의 overflow-x-auto 흡수. 모바일 (375px) D-T2 스크롤 확인 (R9 PR #655 검증 항목 답습)
- ceres/haumea/makemake/eris 는 false 유지 — URL `?focus=` / CelestialTree 진입 (discoverability gap 은 #624 사용자 accepted tradeoff 답습)

#### negative 케이스 재배치 — 2 직교 축 분리

pluto 가 R10a 진입 + bar 승격으로 **기존 negative 커버리지 전체가 positive 전환** — 두 직교 축으로 분리 재배치 (PM Q3 의 "ceres 등으로 교체" 는 ② 축에 매핑):

| 축                                       | 검증 대상                                                    | 기존 negative                      | 신규 negative                                             | 근거                                                                                                                                                                                                                                                                                                                                |
| ---------------------------------------- | ------------------------------------------------------------ | ---------------------------------- | --------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ① allowlist 미진입                       | URL 가드 / tree disabled / preset disabled / info-panel 차단 | pluto (R10)                        | **halley (phase 11 — R10b)**                              | allowlist negative 는 미진입 body 만 가능 — R10a 후 최소 미진입 body 는 혜성 3 (§축 2 파생). 교체 위치 6곳: browser-verify 4-A (`?focus=halley`) / 5-B·5-C (`tree-halley`) / `RPHASE_TREE_EXPECTED_DISABLED` / url-sync.test / celestial-tree.test / celestial-info-panel.test + body-scale.test (`getBodyScale('halley') === 1.0`) |
| ② focus 가능 + bar 미등록 (#617 직교 축) | FOCUS_BUTTONS 비포함 + showInShortcutBar=false 정합          | (구조 소멸 상태 — R9 에서 빈 배열) | **ceres (+ haumea/makemake/eris)**                        | R10a 진입 body 중 bar 미등록 — phobos/deimos/galilean/titan/titania/triton 와 동일 분류이나 **parent=sun 인 첫 bar-미등록 사례**. #617 `shortcutDisabled` 는 여전히 `[]` (혜성도 false) — 가드 주석에 "ceres 등 4 body = focus 가능 + bar 미등록" 명시 박제                                                                         |
| (보존) preset zero-touch                 | pluto-x10 enabled 전환                                       | disabled negative                  | **positive 전환 재현 (5번째)** + halley-x10 신규 negative | §축 6                                                                                                                                                                                                                                                                                                                               |

> **R10b negative 소멸 예고**: R10b (phase 11) 진입 시 halley negative 도 positive 전환 — 그 시점에 미진입 body 가 0 이 되므로 allowlist negative 는 **가상 id (예: 'nonexistent') 또는 phase 12+ 신규 데이터 박제 전까지 구조 소멸**. R10b architect 가 결정 (§R10b 인계 #4).

---

### 축 5 — px-ratio / `PX_RATIO_THRESHOLDS` (5 body 전부 N/A — 결정 트리)

R8 §축 1 결정 트리 (① 3 viewport 결정적 실측 ×1.05 박제 / ② 비결정·projection 실패 시 N/A + 우회 가드) 적용 판정:

| body              | 식 sunPxRatio | depth    | 판정    | 근거                                                                                                                                                                                       |
| ----------------- | ------------- | -------- | ------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| pluto             | 2.73%         | 39.48 AU | **N/A** | 4px fallback 의존 (실효 mesh sub-4px — R8 Amendment 1 ① depth 축소 ×0.41 이 uranus 19 AU 기준, 39 AU 는 추가 축소). billboard 는 px-ratio 측정 대상이 아님 (bodyScale 미곱 — Phase 2 #333) |
| eris              | 2.68%         | 67.86 AU | **N/A** | 동일 + 최심 depth (신호 ≪ 노이즈 — volt #32 상황 선제 회피)                                                                                                                                |
| haumea / makemake | 1.79 / 1.64%  | 43~46 AU | **N/A** | 동일                                                                                                                                                                                       |
| ceres             | 1.08%         | 2.77 AU  | **N/A** | depth 는 얕으나 식 px 2.66 sub-4px — billboard 전면 의존 (phobos/deimos §결정 6 동형)                                                                                                      |

- **선례 정합**: 4px fallback 의존 body 는 전부 미박제 (phobos/deimos R5 §결정 6 → galilean R6 → titan R7 → titania R8 → triton R9) — 본 라운드 5 body 로 7번째 그룹. **임계 박제 0 인 첫 라운드** (R5~R9 는 매 라운드 행성 1개가 박제 대상이었음 — R10a 는 박제 대상 행성 자체가 없음)
- **회귀 가드 우회 경로** (N/A 의 보완 — R9 교차검증 부분 반려 논리 답습): ① pixel-diff baseline 이 전체 화면 커버 (렌더 실패/누락 포착) ② Allowlist (#613) + FOCUS_BODIES (#598) + targetIds (#619) 정적 매칭 ③ `--measure-px-ratio` 는 측정만 수행 (targetIds 24 body 포함으로 found/offScreen 보고는 산출)
- dev 단계 의무: `--measure-px-ratio` 3 viewport 실측 수치를 PR 본문에 기록 (N/A 판정의 실측 근거 박제 — 측정값이 예상 외로 결정적이면 결정 트리 ① 로 전환 가능, 단 billboard 의존 구조상 가능성 낮음)

---

### 축 6 — 가드 동기화 + scenario preset + time-reversal (R9 체계 유지 — 구조 변경 0, 목록 동기화만)

| 가드                             | 변경                                                                                                                                                                                                                | 비고                                                                                                                                                                                                                                                                                                                                 |
| -------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| r1-guard `targetIds`             | 19 → **24 body** (+ceres, +pluto, +haumea, +makemake, +eris)                                                                                                                                                        | #619 정적 매칭 (`targetIds === R_PHASE_BODY_ALLOWLIST`) — CURRENT_R_PHASE=10 과 동시 갱신 의무. 데이터 순서 (solar-system.json 등장 순) 와 일치 필수                                                                                                                                                                                 |
| `FOCUS_BODIES` (#598)            | 19 → 24 body                                                                                                                                                                                                        | browser-verify-378-focus — 5 body focus 진입 검증 자동 확장                                                                                                                                                                                                                                                                          |
| `RPHASE_EXPECTED_ENABLED` (#617) | +pluto                                                                                                                                                                                                              | §축 4. `RPHASE_SHORTCUT_EXPECTED_DISABLED` 는 `[]` 유지                                                                                                                                                                                                                                                                              |
| `RPHASE_TREE_EXPECTED_DISABLED`  | `['pluto']` → `['halley']`                                                                                                                                                                                          | §축 4 negative 재배치 (encke/swift-tuttle 추가는 R10b architect 재량 — 대표 1 body 유지)                                                                                                                                                                                                                                             |
| r-phase-allowlist.test           | shortcutBodies/Enabled expected +pluto / allowlist 24 body / 혜성 phase 11 검증 신규 (`introducedInRPhase === 11` 3 body — §축 2 재박제의 회귀 가드)                                                                | —                                                                                                                                                                                                                                                                                                                                    |
| body-scale.test                  | 서열 정량 가드 신규 (§축 1) + negative halley 교체                                                                                                                                                                  | —                                                                                                                                                                                                                                                                                                                                    |
| pixel-diff baseline              | **변화 예상 0** (5 body 전부 default 프레임 밖 — §축 3) — 변화 시 `--update` + PR 스크린샷 박제                                                                                                                     | R8/R9 절차 답습                                                                                                                                                                                                                                                                                                                      |
| scenario preset                  | **pluto-x10 enabled zero-touch 재현** (preset 코드/데이터 변경 0 — CURRENT_R_PHASE=10 자동, 5번째) + **halley-x10 신규** (R10b negative — `massMultipliers: { halley: 10 }`, description "혜성 진입(R10b) 시 활성") | browser-verify 6-G 를 halley-x10 으로 교체                                                                                                                                                                                                                                                                                           |
| time-reversal.test               | **변경 0 (제외 불필요 — 예측)**                                                                                                                                                                                     | 5 body 는 2026-04-21 데이터 박제 이후 **이미 테스트 포함 + green** (`fullSystem.bodies` 필터는 EXCLUDED_SATELLITES 만). 제외 메커니즘은 단주기 위성 step 누적 (titania 8.71d / triton 5.877d) — 왜소행성 공전 주기 4.6~559 yr 는 1년 적분에서 1주기 미만, 비해당. dev 전체 suite green 실측 확인만 (예측 어긋나면 §재검토 트리거 #7) |
| 모바일 cumulative                | baseline 16.82% (R9 재실측 = R8 값 유지 적중) 기준 ≤ 25%                                                                                                                                                            | §점유율                                                                                                                                                                                                                                                                                                                              |

---

## 점유율 산출 + Visual Fidelity §의무 체크리스트 4항목 (#541)

### 모바일 누적 차단율 (375×667 — off-screen 제외 metric, baseline 16.82%)

| 항목                                  | 산출                                                                                      | 기여                                                                                                                                                         |
| ------------------------------------- | ----------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| R9 재실측 baseline                    | off-screen 제외 후 (PR #655 — neptune off-screen 분류로 R8 값 유지 적중)                  | **16.82%**                                                                                                                                                   |
| 왜소행성 5 (on-screen 가정 보수 상한) | 각 billboard 4px 또는 mesh ≤ 6.73×0.927 ≈ 6.24 px → 최대 π×3.12² ≈ 30.6 px² × 5 ≈ 153 px² | **+0.06% 상한** — 실제는 5 body 전부 모바일 off-screen 예상 (최근접 ceres 2.77 AU — uranus 19 AU 도 off-screen 분류 선례라 default 모바일 프레임 밖. 실효 0) |
| **누적 (보수 상한)**                  | 16.82 + 0.06                                                                              | **≈ 16.88% (DoD 임계 25% margin 8.1%p — 실효 16.82% 유지 예상)**                                                                                             |

- 1280×720 / 1920×1080 cumulative: R9 실측값 + 동일 보수 상한 논리 — 구현 실측 박제
- 재실측 괴리 ±3%p 초과 시 측정 방법 검증 우선 (volt #32 — R8 §재검토 트리거 #8 절차 답습)

### Visual Fidelity §의무 체크리스트 (4항목)

- [x] **데이터 SSoT 보존** — 5 body 의 radius/mass/orbit 전부 기박제 실측값 무수정. 변경은 프로젝트 메타데이터 2종만 (혜성 introducedInRPhase 10→11 / pluto showInShortcutBar true) — 실측 천문값 비저촉. mesh 과장 (×800) 은 rendering-only
- [x] **rendering 시점 분리** — physics 엔진 (Rust+wasm) 은 BODY_SCALE / allowlist 무의존 (이미 24 body 적분 중 — 본 라운드는 물리 변경 0 의 구체 사례). developer 검증 의무
- [x] **UI overlay 실측값 표기** — CelestialInfoPanel 5 body 실측 radius (pluto 1,188.3 km 등) 표기 + "× 800 과장 중" tooltip 자동 (getBodyScale 기존 경로). haumea 는 volumetric mean 임이 데이터 `$radiusComment` 에 기존재
- [x] **baseline 박제** — 핵심 박제값 표 + 산출식 (5 body px / sunPxRatio / 서열 곱 비교 / eris 1224.7 unit / 모바일 16.88% 상한)

---

## Concrete Prediction (R9 "R10 = CURRENT_R_PHASE 1줄 + BODY_SCALE N줄" 예측 재현 검증 + R10a 자체 예측)

R9 §Concrete Prediction 의 R10 예측: "왜소행성+혜성 8 body = CURRENT_R_PHASE=10 1줄 + BODY_SCALE 신규 그룹 N줄 — ring/tilt/satellite 룩업 전부 0 (전 body parent=sun, rings 없음)". 분할 (R10a) 보정 + 본 ADR 예측:

| 항목                                             | R9 예측       | R10a 본 ADR 예측 | 사유                                                                                                                                                          |
| ------------------------------------------------ | ------------- | ---------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| BODY_SCALE                                       | 신규 그룹 N줄 | **5**            | dwarf 그룹 5 body (§축 1)                                                                                                                                     |
| CURRENT_R_PHASE 9→10                             | 1             | **1**            | #613 자동 생성 6번째 실전                                                                                                                                     |
| FOCUS_BUTTONS                                    | (미예측)      | **1**            | pluto 1줄 (§축 4 — R7 saturn / R8 uranus 동형. R9 만 0 이었음)                                                                                                |
| **ring / tilt / satellite orbit 룩업**           | **0**         | **0**            | 전 body parent=sun + rings 없음 — ORBIT_VISUAL_SCALE/룩업 비대상                                                                                              |
| **tierFromFocus / LOD / 궤도선 sampling / 물리** | (미예측)      | **0**            | `dwarf-planet` 분기·임계 기존재 (P11-B 선행 인프라 첫 실전 발동) + true-anomaly sampling e 무관 + N-body 이미 24 body 적분                                    |
| **코어 코드 합계**                               | —             | **≤ 7 라인**     | 첫 비-행성 라운드 + 5 body 동시 진입인데 R9 (5 라인) 동급 — 4그룹 scale 체계 + #613 메타 SSoT 추상화 건강성의 정량 증거. 초과 시 인프라 재사용 실패 신호 회고 |

별도 카운트 (데이터/가드/테스트): solar-system.json 메타 4값 + `$comment` (혜성 phase 11 ×3 / pluto bar true) / guard 동기화 (targetIds 5 + FOCUS_BODIES 5 + RPHASE_EXPECTED_ENABLED 1 + TREE_DISABLED 교체) / negative 교체 6곳 (§축 4 ①) / body-scale.test 서열 가드 + r-phase-allowlist.test expected / preset halley-x10 1 entry / CHANGELOG.

**예측 검증 의무 (dev 단계)**: `git diff --stat` 으로 ① ring/tilt/satellite 룩업 경로 변경 0 ② tier.ts / lod-body-thresholds.ts / sampleOrbitPoints 변경 0 ③ 코어 합계 ≤ 7 라인 실측 재현. **R10b prediction**: 혜성 3 body = CURRENT_R_PHASE=11 1줄 + BODY_SCALE 혜성 그룹 N줄 (5번째 그룹 검토 — radius 2.4~13 km 는 dwarf 800 으로 sub-0.01px, 별도 그룹 불가피) — 단 **궤도선 코드 0 보장 불가** (e=0.967 의 64 seg 다각형 chord 오차 + 근일점 q 0.34 AU (encke) 의 inner 권역 진입 — §R10b 인계 #1 실측 후 확정).

---

## DoD (수치 — 검증 가능 완료 기준, 이슈 #659 12항목과 정합)

1. **5 body 가시성** — 줌아웃/focus 프레임에서 각 body ≥ 4px 명시적 visible (mesh 또는 billboard — §축 1 분류: 5 body 전부 solar view billboard 의존 예상, 식 px 박제 완료). default 진입 직후 프레임 내 존재는 비요구 (§축 3 해석 기준 1 — 전 body a ≥ 2.77 AU)
2. **focus 동작** — `?focus=` 5 body 전부 진입 성공 + 화면 중앙 + ≥ 100px 또는 화면 10% (tierFromFocus `dwarf-planet` → T3 body — desiredRadius 가 mesh boundingSphere 기준이라 자동 충족 예상)
3. **shortcut bar** — pluto 버튼 (14버튼째) 등록 + focus 동작 + 모바일 overflow 스크롤. ceres/haumea/makemake/eris 미등록 (#617 3종 가드 green — §축 4)
4. **궤도선** — 5 body 궤도선 visible: eris 는 §축 3 PASS 기준 (줌아웃 단일 입력 도달 + 도달 radius 실측 박제 + 두 줌 레벨 캡처), ceres 는 중간 줌 (radius 80~120 unit). pluto-neptune 궤도 교차 표현 사실 정합 (§위험 #4 사전 등록)
5. **info 패널** — 5 body focus 시 실측 데이터 (mass/radius/a/e) + "× 800 과장 중" tooltip
6. **scale 정량 가드** — 그룹 내 strict 서열 4 부등호 + cross-group (pluto×800 < mercury×700) + 그룹 동일값 — 단위 테스트 green (§축 1)
7. **R10a/R10b 분리** — 혜성 3 body allowlist 미포함 (R_PHASE_BODY_ALLOWLIST 24 body 정확 — phase 11 재박제 검증 테스트 포함, §축 2). `?focus=halley` 차단 (negative 재배치 ①)
8. **가드 동기화** — FOCUS_BODIES (#598) / targetIds (#619) / RPHASE_EXPECTED_ENABLED (#617) 24 body 정합 — CI `detect-and-test` green
9. **모바일 cumulative ≤ 25%** — R9 재실측 16.82% 기준 (보수 상한 16.88%). off-screen 분류 보고 확인 + 신규 실측값 박제 (R10b 인계용)
10. **기존 19 body 무회귀** — pixel-diff baseline (변화 예상 0) + ring/tilt 데이터 불변 — r1-guard PASS
11. **단위 테스트 전체 green** — time-reversal 변경 0 실측 (§축 6 예측 검증) + negative 교체 6곳 + Concrete Prediction `git diff --stat` 재현
12. **D-T2 실 Chrome GUI 수동 검증 ≥ 1회** (headless 단독 종결 금지 — volt #77). headless URL 은 `?gpu=a&lod=auto` 필수 (R7 학습)

---

## 위험 / 미해결

### 위험 #1 — pluto/eris 시각 차 0.14px (식) — "같은 크기 버그?" D-T2 오인

- 사실 radius 비 1.0218 이 그대로 보존되어 두 body 가 시각상 동일 크기로 보임 — 사실 정합이며 버그 아님. 사전 등록 (info 패널 실측 radius 로 구분 확인 안내)
- 완화: §축 1 단위 테스트가 곱 레벨 strict 서열을 보증 (시각 식별과 무관하게 데이터 서열 회귀 차단)

### 위험 #2 — 4px billboard 5개의 "점 구분 불가" — body 식별 UX

- solar view 줌아웃에서 5 body 전부 4px 동일 quad — colorHint 차이 (ceres #B0A89E ~ makemake #E4A57E) 만으로 식별 한계. 궤도선 + info 패널 + tree 가 식별 경로 (기존 satellite 들과 동일 tradeoff — #624 답습)
- 완화: D-T2 보고 시 라벨/툴팁 인프라는 후속 분리 (R10a 비-범위 — UI 신규 기능)

### 위험 #3 — eris 궤도 64 seg 다각형 chord 오차 (대형 타원 첫 사례)

- segments=64 고정 — eris aphelion 1224.7 unit 에서 인접 vertex chord 간격 ≈ 2π×853/64 ≈ 84 unit (jupiter 궤도 반경 65 unit 초과!) — 줌아웃 프레임에서 다각형 꺾임 시각 노출 가능. 단 e=0.436 의 true-anomaly 등간격은 근일점 측 밀집이 자연 발생해 곡률 큰 구간은 오히려 촘촘 — 꺾임은 원일점 측 (곡률 최소 구간) 이라 시각 영향 제한 예상
- 완화: D-T2 실측 — 꺾임 식별 시 segments 동적 산정 (a 비례) 후속 분리 (R10b 혜성 e=0.967 에서 동일 축 재검증 필수 — §R10b 인계 #1 과 통합 검토)
- **cross-validate 보강 (agy 권장 조치 1)**: eris 원일점 측 줌아웃 프레임 **D-T2 캡처를 구현 PR 본문에 박제 의무** — 시각 허용 여부 판단 근거를 R10b (halley e=0.967 동일 축) 의 기준선으로 재사용

### 위험 #4 — pluto-neptune 궤도 교차 표현 — "충돌 위험?" D-T2 오인

- pluto q 29.66 AU < neptune a 30.07 AU — 궤도선이 화면상 교차 (사실 정합 — 3:2 공명으로 실제 충돌 없음). D-T2 "교차가 버그?" 오인 선제 등록 (R9 triton 역행 선례 동형)
- 완화: 본 사전 등록 인용. 공명 표현/안내는 비-범위

### 위험 #5 — makemake/haumea 4px 경계 진동 (식 px 4.05/4.42)

- 식 레벨 4px 경계 — 실효는 depth 축소로 sub-4px (billboard 안정) 예상이나, focus 직전·중간 줌에서 mesh↔billboard LOD 전환 진동 가능
- 완화: LOD cross-fade 200ms (기존 인프라) 흡수. 진동 보고 시 측정 방법 검증 우선 (volt #32)
- **cross-validate 보강 (agy 위험 #2 — 대상 확대)**: pluto/eris (식 6.73/6.59px) 도 4~8px 대역으로 동일 진동 후보. 기존 완화 인프라 실측 확인 (2026-06-11): tier 전이 히스테리시스 ±15% (`tier.ts` `TIER_HYSTERESIS`) + billboard alpha mask smoothstep 전이 (`lod-billboard-alpha-mask.test.ts`) 기존재 — **qa 단계에서 5 body 줌 조작 popping/flickering 실측 항목 추가** (관측 시 hysteresis margin 후속 분리, R10a 비-범위)

### 위험 #6 — 혜성 phase 11 재박제의 의미 drift (R10b 미진행 시)

- R10b 가 장기 보류되면 "phase 11" 이 무엇인지 데이터만으로 불명 — 3곳 박제 (§축 2 근거 4) 로 완화. R10b 미진행 자체는 무해 (혜성은 R9 까지와 동일한 미진입 상태 유지)

---

## 결과 / 재검토 조건 (Amendment 발동 트리거)

1. **#1 (pluto/eris "같은 크기" 보고)** — §위험 #1 사전 등록 인용. scale 개별 조정은 PM 재합의 필수 (그룹 단일값 구조 파괴 — 단독 조정 금지)
2. **#2 (체감 크기 "작다" 보고)** — dwarf 800 → 상향은 cross-group 서열 (pluto < mercury) 상한 내에서만 (mercury×700 = 1.70779e9 ÷ pluto radius 1.1883e6 = 1,437.2 → **scale < 1,437** 수학 상한). 초과 요구는 PM 재합의
3. **#3 (eris 궤도선 도달 불가/꺾임)** — 도달 불가는 forensic 전환 (§축 3 해석 기준 4). 꺾임은 segments 동적 산정 후속 분리 (§위험 #3)
4. **#4 (px-ratio 실측이 결정적)** — 결정 트리 ① 로 전환 (실측 ×1.05 박제 — §축 5 dev 의무의 역방향)
5. **#5 (모바일 cumulative 괴리)** — 예상 16.82~16.88% ±3%p 초과 → 측정 방법 검증 우선 (volt #32)
6. **#6 (FOCUS_BODIES/#617/#619 drift)** — 정적 매칭 가드 fail → 즉시 동기화
7. **#7 (time-reversal 예측 어긋남 — suite red)** — §축 6 "변경 0" 예측 실패 → 원인 실측 (왜소행성 기여라면 신규 메커니즘 — 단주기 누적이 아니므로 forensic) 후 Amendment
8. **#8 (haumea 비구형 표현 요구)** — 구체 근사 유지 (비-범위) — ellipsoid mesh 인프라는 후속 분리

---

## R10b 인계 (혜성 3 body — halley / encke / swift-tuttle, phase 11)

1. **고이심률 궤도선 실측 검증 의무 (코드 0 보장 불가 축)** — e=0.967 (halley) / 0.963 (swift-tuttle) / 0.848 (encke). 실측 완료분: sampling 은 true-anomaly 등간격 64 seg (mean-anomaly 아님 — 근일점 vertex 밀집 가설 기각). 잔여 검증: ① 64 seg chord 오차 — e=0.967 타원 (a 17.8 AU, q 0.59 AU) 의 원일점 측 꺾임 + 근일점 측 곡률 (true-anomaly 등간격이 근일점 부근을 자동 밀집하나 q 0.34 AU (encke) 는 inner 권역 — sun mesh (1.46 unit 반경) 와의 시각 간섭) ② Kepler 전파 (physics) 의 고이심률 수치 안정성 — 이미 적분 중 (time-reversal green) 이라 신규 위험 낮음
2. **혜성 scale 5번째 그룹 필요** — radius 2.4~13 km: dwarf 800 적용 시 px 0.000014~0.00007 (4px fallback 전면 의존조차 billboard 진입 거리 검증 필요). phobos/deimos 5000 으로도 sub-px — billboard 의존 명시 그룹 or 별도 정책 (PM 라운드)
3. **allowlist negative 구조 소멸** — phase 11 진입 시 미진입 body 0. 대안: 가상 id negative / phase 12+ 데이터 선박제 / negative 축 자체 종료 결정 (R10b architect). **cross-validate (agy 권장 조치 2)**: 가상 ID (예: `nonexistent-body`) 전환을 1순위 후보로 권고 — 테스트 슈트가 실데이터 phase 진행에 종속되지 않는 구조적 해소 (R10b architect 가 최종 결정하되 본 권고를 기본값으로)
4. **위성 0 — satellite N≥5 단일 룩업 한계 재이월** (charon/nereid 등 데이터 박제 라운드로)
5. **모바일 diskArea baseline** — R10a 재실측값 기준 (16.82% 또는 갱신값 — 구버전 금지)
6. **scenario preset negative** — halley-x10 zero-touch enabled 재현 (R10a 신설분)
7. **eris 줌아웃 도달 radius 실측값** — R10a DoD 4 박제값을 혜성 aphelion (swift-tuttle Q ≈ 51.2 AU) 가시성 기준선으로 재사용

---

## 교차검증 반영 사항 (cross-validate 2026-06-11 agy outcome=applied — 조건부 Accept)

> 로그: `.claude/logs/cross-validate-architecture-20260611-163209.log`. agy 종합 판정 "조건부 Accept (Provisional → Accepted)" + 권장 조치 2건. architect 명시 질문 3건 (① phase 정수 의미 drift ② eris DoD 완화 과잉 ③ 64-seg chord) 전부 응답 확보.

### 합의 (3건 — 전부 ADR 기존 박제와 수렴, 보강 통합)

1. **eris 원일점 chord 꺾임** (agy 위험 #1 = §위험 #3 동일 축) — agy 보강: D-T2 캡처 PR 박제 의무 + R10b 기준선 재사용 → §위험 #3 에 통합. 명시 질문 ③ 응답: 64 seg 한계 내 실측 검증 의무로 수렴 (segments 동적 산정은 관측 시 후속 — Claude 기존 입장 유지)
2. **LOD 경계 진동** (agy 위험 #2 = §위험 #5 동일 축) — agy 보강: 대상을 makemake/haumea 에서 pluto/eris (4~8px 대역) 로 확대 + hysteresis 존재 검토 요구. **Claude 실측 응답 (수용 전 sanity check)**: tier 히스테리시스 ±15% + billboard smoothstep alpha mask 기존재 확인 — 신규 구현 불요, qa 줌 조작 실측 항목만 추가 → §위험 #5 에 통합
3. **R10b negative 구조 소멸** (agy 위험 #3 = §R10b 인계 #3 동일 축) — agy 보강: 가상 ID 전환을 의무 권고. Claude 취사: R10b architect 결정권 보존하되 가상 ID 를 1순위 기본값으로 격상 → §R10b 인계 #3 에 통합

### 이견 / 기각 (0건)

- 명시 질문 ① (phase 정수 의미 drift): agy "옵션 (a) 완승" — §위험 #6 의 3곳 박제 완화로 충분 합의, 추가 조치 없음
- 명시 질문 ② (eris DoD 해석 완화 과잉): agy "렌더링 성능과 UI 경험 간 적절한 타협" — §축 3 해석 기준 유지 합의

### 고유 발견 (0건 — 후속 분리 없음)

- agy 3건 전부 ADR 기존 위험/인계 축과 수렴 — 스프린트 비목표와 상충하는 신규 제안 없음 (수용 vs 분리 3단 프로토콜 발동 불요)

### Claude 편향 셀프 체크 결과 대조

- 사전 기록 4항목 (하단) 전부 agy 평가와 모순 없음 — 특히 "결합 간과" 항목의 (b) negative 연쇄 소멸이 agy 위험 #3 과 독립 수렴 (이중 시각 합의 = 높은 신뢰도)

### Claude 편향 셀프 체크 (architect 사전 기록 — cross-validate 호출 전)

- **낙관적 일정** — 코어 ≤ 7 라인 예측이나 negative 재배치 6곳 + eris 줌아웃 실측 + D-T2 iteration (4px 점 식별 UX) 으로 Amendment 라운드 N≥1 예상 박제. "첫 비-행성 라운드 = 코드 0 근접" 의 근거를 전부 코드 실측 (tier.ts:112 / lod-body-thresholds.ts:68 / sampleOrbitPoints) 으로 제시 — 가정 아님. 통과
- **결합 간과** — 본 라운드 핵심 결합 명시: (a) CURRENT_R_PHASE=10 → 혜성 3 자동 포함 충돌 (§축 2 — 본 ADR 의 존재 이유), (b) pluto positive 전환 → negative 커버리지 6곳 연쇄 소멸 (§축 4 2축 재배치), (c) phase 11 재박제 → #617 파생·roadmap 라벨 매핑 3곳 동시 박제 의무, (d) eris a 2.26×neptune → 궤도선 DoD 해석 + chord 오차 (§축 3/§위험 #3). 통과
- **폐기 프레이밍** — R9 §R10 인계의 "phobos/deimos 5000 계보 재적용 검토" 를 검토 후 근거 기각 (cross-group 제약 양립 불가 — §축 1 후보 C), 인계 자체는 전 항목 소화. PM 합의 재구조화 0. 통과
- **순수주의** — haumea 비구형 / pluto-charon barycenter / 궤도 세차의 사실 정밀성 대신 PM 합의 근사 수용 (Visual Fidelity §1 정합). 데이터 실측값은 무수정 (역방향 타협 없음). 통과
