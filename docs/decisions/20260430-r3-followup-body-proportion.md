# ADR: R3 후속 (#373) — body 간 시각적 비율 회귀 forensic + fix 옵션 비교

- **상태**: Proposed (사용자 옵션 선택 대기)
- **날짜**: 2026-04-30
- **결정자**: architect (#373 forensic 단계 — fix 구현은 사용자 승인 후 별도 developer 단계)
- **관련**: #373 (본 이슈), #369 (R3 venus), #371 (ambient fix PR), #372 (forensic 결과), `20260425-r1-sun-visualization.md` (R1), `20260428-r2-mercury-visualization.md` (R2), `20260429-r3-venus-visualization.md` (R3), `docs/phases/roadmap-v3-incremental.md` (Roadmap v3)
- **교훈 적용**:
  - "DoD PASS ≠ 제품 동작" (volt #74) — R1/R2/R3 viewport 점유율 DoD 모두 PASS 인데 사용자 시각 비율 회귀
  - "수치 DoD 미달 시 측정 방법 검증 우선" (CRITICAL #6 §10) — 본 케이스 정확히 적용
  - "엄격 원칙 + 동적 적응 부재 함정" (volt #68) — `0.5%` 정량 임계가 사용자 인지 단위 (px diameter 비) 와 직교
  - "headless 브라우저 검증 ≠ 실 브라우저" (volt #77) — 사용자 보고 발견, 자동 검증 미감지
  - "조사 국면 확장 — debug 스크립트 실측 선행" (volt #67) — `_debug-373-proportion-tmp.mjs` 30초 실측이 정적 분석보다 결정적
  - "신규 함수 ≠ 신규 구현" (volt #21) — 측정 도구는 r1-guard `measureSunCoverage` 패턴 재사용
  - "인계 항목 실측 재검증" (volt #14) — R3 ADR §축 1 후보 C "venus 시각비 mercury 117% / sun 46%" 가 박제 시점에 알려진 trade-off — 본 forensic 으로 사용자 인지 단위와의 mismatch 확정

---

## 배경

### #373 본 이슈 핵심

R3 (#369) PR #371 의 D-T2 사용자 검증 2회차에서 ambient fix (#372) 와 별개의 **시각 비율 회귀** 발견. R1+R2+R3 인프라 자체가 의도대로 작동 (DoD viewport 점유율 0.5%/0.5%/3% 산출 일치) 하지만, 사용자 인지 비율과 ADR 박제 측정 단위가 직교.

### Forensic 측정 결과 (2026-04-30, develop tip = fe78078, ambient fix 머지 후)

`scripts/_debug-373-proportion-tmp.mjs` (volt #67 패턴 일회성 debug) 로 실측. 데이터: [`docs/reports/373-debug-output.json`](../reports/373-debug-output.json), 스크린샷: [`docs/reports/373-debug-{1280x720,1920x1080,375x667}.png`](../reports/).

#### 측정 1 — 다중 metric 비교 (1280×720 default 진입 `?gpu=a`)

| metric                       | 정의                                                                                  | 값         | 비고                                                                          |
| ---------------------------- | ------------------------------------------------------------------------------------- | ---------- | ----------------------------------------------------------------------------- |
| `brightRatio`                | `lum ≥ 200/255` 픽셀 비율 (Rec.601) — **현재 `r1-guard --measure-sun-coverage` SSoT** | **4.19%**  | sun emissive #FFE9A8 highlight 영역만 카운트 (forensic #372 의 4.12% 와 정합) |
| `sunDiskRatio`               | yellow tint (R>G>B + lum>100) 픽셀 비율                                               | 4.22%      | bright + 약간의 falloff                                                       |
| `planetDiskRatio`            | gray tint (R≈G≈B + 50<lum<200) 픽셀 비율                                              | 0.031%     | mercury/venus 만 — sun emissive 광에 wash out                                 |
| `visibleRatio`               | `lum > 25` 픽셀 비율 (배경 #08080d 제외)                                              | 6.37%      | 모든 visible 합계                                                             |
| **sun mesh `diskAreaRatio`** | mesh bounding circle pixel area / viewport area (Vector3.Project 직접 산출)           | **11.63%** | mesh 의 시각적 disk 면적 — **사용자가 인지하는 점유율과 가장 가까움**         |

- **ADR 박제 산출 3.87%** (1280×720 sun viewport 점유율) ≈ `brightRatio 4.19%` 와 정합 (±0.5% 마진 통과). R1 ADR §결정 1 산출식 일관 ✓
- **disk area 11.63%** (Vector3.Project 직접 산출) 는 brightRatio 의 **약 2.8배** — sun edge 의 falloff 영역이 lum < 200 임계에서 누락
- **사용자 보고 25%** (본 #373 본문) 는 disk area 11.63% 와 차이 — bloom/ambient halo 시각 효과가 사용자 인지 면적을 추가 확대 (brightRatio + halo glow 합산이 25% 정합)

#### 측정 2 — body 간 시각비 (3 viewport 동일 비율)

| body        | wsRadius (scene) | px diameter (1280×720) | px 비 (sun=100%) | disk area | disk area 비 |
| ----------- | ---------------- | ---------------------- | ---------------- | --------- | ------------ |
| **sun**     | 7.591            | **369.4**              | 100.0%           | 11.63%    | 100.0%       |
| **mercury** | 3.017            | **141.2**              | **38.2%**        | 1.70%     | 14.6%        |
| **venus**   | 3.522            | **167.1**              | **45.2%**        | 2.38%     | 20.5%        |

- 사용자 #373 본문 "mercury 가 sun 의 ~40% / venus 가 ~46%" 는 **px diameter 비 38.2% / 45.2% 와 정확 일치** ✓
- 즉 **사용자 인지 단위 = px diameter 비** (사람 눈이 disk 직경 비교가 자연스러움)
- ADR 박제 단위 = **disk area 비** (≥0.5% / ≥3% 면적 임계). **두 단위가 제곱 관계** → 38.2% px 비 = (38.2)² / 100 = 14.6% area 비. 사용자가 "두 배 작다 = 4 배 area 차이" 같은 직감 안 가짐
- 1920×1080 실측 px 비 동일 (38.2% / 45.2%) — viewport 무관 비율 일정 ✓
- 모바일 (375×667) 실측: sun 36.77% / mercury 5.37% / venus 7.53% **누적 disk area 49.67%** — R3 ADR §축 1 후보 C "모바일 누적 16.39%" 박제값 (brightRatio 기준) 과 면적 단위 변경 시 ~3× 차이

#### 측정 3 — orbit 거리 / sun mesh radius 비율

| body    | scene unit center     | orbit dist | dist / sunRadius | 실제 비율 (sun 표면 기준) | **압축 배율** |
| ------- | --------------------- | ---------- | ---------------- | ------------------------- | ------------- |
| mercury | (-0.62, -5.81, -0.42) | 5.85       | **0.771**        | sun radius × **83**       | **108×**      |
| venus   | (-8.94, -1.35, 0.50)  | 9.06       | **1.193**        | sun radius × **154**      | **129×**      |

- **mercury 가 sun mesh 내부에 위치 (0.77× sun radius)** — 실제 sun 표면 외 83× 거리인데 sub-radius 로 압축
- venus 도 거의 sun 표면 (1.19× sun radius) — 실제 154×
- **원인**: orbit center 거리는 `renderScale = 8.4e-11` 만 적용 (mesh 와 동일 scale). 하지만 mesh 만 추가로 ×75 / ×8500 / ×4000 확대 → mesh 가 orbit 거리 대비 거대화

### 가설 검증 결론

| 가설                                     | 결론                   | 근거                                                                                                                                                                                                                                                                  |
| ---------------------------------------- | ---------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| **가설 1: 박제값 절대 mesh 크기 비대칭** | **확정 (주된 원인)**   | sunScale=75 → wsR=7.591, mercuryScale=8500 → wsR=3.017 (sun 의 39.7%), venusScale=4000 → wsR=3.522 (sun 의 46.4%). 사용자 px 비 보고와 정확 일치. 각 R-Phase 가 viewport 점유율 만 독립 결정 (PM Q2=A) → body 간 상대 비율 부담 미고려                                |
| **가설 2: 측정 metric 부정확**           | **확정 (보조 원인)**   | (a) brightRatio (4.19%) vs disk area (11.63%) 약 2.8× 차이 — sun edge falloff 누락 (b) **px diameter 비 vs disk area 비 제곱 관계** — 사용자 자연 비교 단위 (px 비) 와 박제 단위 (area 비) 직교 (c) 모바일 면적 단위 누적 49.67% vs brightRatio 누적 16.39% — 3× 차이 |
| **가설 3: orbit 거리 표현 회귀**         | **확정 (구조적 원인)** | mercury orbit 0.771× sun radius (실제 83× 의 1/108), venus 1.193× (실제 154× 의 1/129). orbit center 는 renderScale 만 적용, mesh 만 BODY_SCALE 추가 확대 → 비대칭 압축                                                                                               |

### 잠재 시점 분석 (이슈 본문 §"R2 시점부터 잠재")

- **R1 (sun=75 단독)**: sun 만 visible, 비율 비교 대상 부재 → 본 회귀 미발현
- **R2 (mercury=8500 추가)**: mercury wsR=3.017 (sun 의 39.7%) → R2 시점부터 잠재. 단 사용자 D-T2 검증에서 미보고 (사용자 시각 변화 또는 venus 추가 후 누적 효과 인지)
- **R3 (venus=4000 추가)**: venus wsR=3.522 (sun 의 46.4%), mercury 와 비슷한 크기로 시각 패턴 강화 → 사용자 인지 trigger
- **R3 ADR §축 1 후보 C 평가** (`venus 시각비 mercury 117% / sun 46%`) 는 **박제 시점에 이미 알려진 trade-off**. 단 이는 disk area 비 단위로 해석됐으나 사용자는 px diameter 비로 인지 → 박제 시점 trade-off 가 사용자 인지와 mismatch
- **결론**: 본 회귀는 R2 시점부터 잠재였고, R3 가 trigger. R-Phase 정책 자체의 결합 간과 (volt #29 — Claude 자체 편향 4종 §결합 간과)

---

## 영향 모듈/파일

### 측정 결과 박제 (본 ADR 동반)

- `docs/reports/373-debug-output.json` — 3 viewport × 4 픽셀 metric × 3 body mesh disk
- `docs/reports/373-debug-{1280x720,1920x1080,375x667}.png` — 스크린샷
- 본 ADR §배경 §Forensic 측정 결과

### Fix 후보별 영향 모듈 (옵션 선택 후 변경 대상)

- `apps/web/src/constants/body-scale.ts` (옵션 a, c)
- `apps/web/src/components/sim-canvas.tsx:159` (옵션 b — `radius: 35`)
- `packages/core/src/scene/solar-system-scene.ts:1208/1242/1290` (옵션 d/e — diameter 식)
- `packages/core/src/scene/tier.ts` (옵션 e 의 일부 — renderScale 변경 시. 단 본 ADR 비-범위 강제)

### Fix 가 깨는 박제값 (ADR amendment 필요 후보)

- R1 ADR §결정 1 (sunScale=75, ≥3% viewport 점유율)
- R2 ADR §결정 1 (mercuryScale=8500, ≥0.5% 점유율)
- R3 ADR §결정 1 (venusScale=4000, ≥0.5% 점유율)
- R-Phase 정책 PM Q2=A (각 body 독립 결정)

---

## 후보 비교

### 측정 metric 단위 결정 (선결조건)

본 fix 옵션 비교 전 **측정 metric 단위 박제 갱신 여부** 가 선결. CRITICAL #6 §10 "수치 DoD 미달 시 측정 방법 검증 우선" 직접 발동.

**현재 단위**: `brightRatio = lum ≥ 200/255 픽셀 비율` (R1 박제 ≥ 3% / R2/R3 박제 ≥ 0.5%)

**문제**:

1. brightRatio 는 sun emissive #FFE9A8 의 **highlight 영역만** 카운트, edge falloff 누락 → disk area 의 약 1/2.8
2. mercury/venus 의 회색 단색 머티리얼 (lum < 200) 은 brightRatio 기여 0 → planetDiskRatio 단독 측정 필요
3. 사용자 인지 단위 (px diameter 비) 와 면적 단위 박제값이 제곱 관계로 직교

**선결 결정 후보**:

| 후보                                           | 단위                                                         | 이점                                                | 단점                                                |
| ---------------------------------------------- | ------------------------------------------------------------ | --------------------------------------------------- | --------------------------------------------------- |
| **M1. 현재 brightRatio 유지 (단위 변경 없음)** | luminance ≥ 200/255 비율                                     | R1+R2+R3 박제값 보존, regression guard 무수정       | 사용자 인지 mismatch 영구화                         |
| **M2. mesh diskAreaRatio 추가 측정 (병행)**    | Vector3.Project 직접 산출, mesh 별 disk area / viewport area | 사용자 인지 단위에 더 가까움 (단 px 비 단위는 아님) | r1-guard 확장 (Vector3.Project 직접 산출 신규 도입) |
| **M3. px diameter 비 (sun 대비 비율)**         | mesh px diameter / sun px diameter                           | 사용자 인지와 정확 일치 (px 비)                     | sun 무존재 케이스 (focus tier 변경 시) 정의 안 됨   |
| **M4. disk area 비 (sun 대비)**                | mesh disk area / sun disk area                               | M3 의 면적 버전 (제곱)                              | 사용자 자연 비교는 직경 단위                        |

**권고**: **M2 + M3 병행 박제** — 기존 brightRatio (regression guard SSoT) 유지하면서, disk area + px diameter 비를 **별도 measurement** 로 추가. body 간 비율 가드는 M3 (px 비) 단위로 박제. fix 옵션 선택 후 본 ADR amendment 또는 r1-guard ADR amendment v4 로 박제.

### Fix 옵션 비교 (5개)

#### 옵션 (a) — sunScale 낮춤

**변경**: `BODY_SCALE.sun: 75 → ?` (예: 30 또는 25)

| 항목                 | 평가                                                                                                                                                                      |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 변경 라인            | `body-scale.ts` 1줄 + 단위 테스트 1줄                                                                                                                                     |
| R1 ADR 호환성        | **깨짐** — sunScale=75 박제값 amendment 필요. 1280×720 brightRatio 가 ≥3% 가드 미달 가능성 (sunScale=30 → sun pixel diameter ≈ 142px → brightRatio ≈ 1.7% 미달, ≥3% 위반) |
| R2/R3 호환성         | mercury/venus 비율 보존 (px 비 38%/45% 그대로) — 단, sun 작아져 mercury/venus 가 상대적으로 더 커보일 우려                                                                |
| PM Q2=A 호환성       | 정책 자체 보존 (각 body 독립 결정 유지), 단 R1 박제값 재산정                                                                                                              |
| Roadmap v3 §6 호환성 | "측정 가능한 UX DoD" 의 sun ≥3% 가드 amendment 필요                                                                                                                       |
| R4~R10 확장성        | sun 작아진 만큼 mercury/venus/earth 도 줄여야 시각비 자연 — **연쇄 amendment**                                                                                            |
| 사용자 시각 효과     | sun 점유 4% → ~1.7% 작아짐. 모바일 누적 차단율 49.67% → ~25% (개선). 단 sun 자체 가시성 약화                                                                              |

**합의**: R1 박제값 깨짐이 큼. ≥3% 가드를 ≥1.5% 등으로 amendment 필요. 영향 N개 ADR.

#### 옵션 (b) — 카메라 default radius 늘림

**변경**: `sim-canvas.tsx:159` `radius: 35 → ?` (예: 80 또는 100)

| 항목                 | 평가                                                                                                        |
| -------------------- | ----------------------------------------------------------------------------------------------------------- |
| 변경 라인            | `sim-canvas.tsx` 1줄                                                                                        |
| R1 ADR 호환성        | **깨짐** — R1 ADR §위험·미해결 §"카메라 radius=35 가 변경되면 본 ADR 산출 무효화" 명시 박제. amendment 필요 |
| R2/R3 호환성         | mercury/venus 비율 보존 (mesh wsR 무변경, 거리만 멀어짐) — 모든 px diameter 동일 비율 축소                  |
| PM Q2=A 호환성       | 정책 보존                                                                                                   |
| Roadmap v3 §6 호환성 | 모든 R-Phase ≥0.5% / ≥3% 가드 재산출 — radius=80 시 점유율 (35/80)² = 19% 로 감소. 모든 가드 amendment 필요 |
| R4~R10 확장성        | radius 한 번 늘리면 outer planets focus 시 카메라 거리 분기 변경 필요 (focus tier 알고리즘 영향)            |
| 사용자 시각 효과     | 모든 body 시각비 보존, 화면 점유 절대값 일제 감소. body 간 비율 회귀 **미해결** (px 비 38%/45% 그대로)      |

**합의**: 본 회귀는 **mesh 절대 크기 비율** 문제이므로 **radius 변경으로 해결 안 됨**. 모든 body 가 같이 줄어들 뿐. 탈락.

#### 옵션 (c) — mercuryScale / venusScale 낮춤

**변경**: `BODY_SCALE.mercury: 8500 → ?`, `venus: 4000 → ?` (예: mercury 2000, venus 1500)

| 항목                 | 평가                                                                                                                                                                          |
| -------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| 변경 라인            | `body-scale.ts` 2줄 + 단위 테스트 2줄                                                                                                                                         |
| R1 호환성            | **무영향** (sunScale=75 보존)                                                                                                                                                 |
| R2 호환성            | **깨짐** — mercury ≥0.5% 가드 미달. mercuryScale=2000 → mercury pixel diameter ≈ 19.9px → brightRatio 누적 미달 (planetDiskRatio 0.034%, ≥0.5% 가드 미달 14×). amendment 필요 |
| R3 호환성            | **깨짐** — venus ≥0.5% 가드 미달. amendment 필요                                                                                                                              |
| PM Q2=A 호환성       | **본질적 변경 필요** — Q2=A 독립 결정 정책으로는 본 옵션 정당화 불가. **Q2=B (비례 결정)** 새 정책 필요                                                                       |
| Roadmap v3 §6 호환성 | 측정 가능한 UX DoD 단위 갱신 필요 (M3 px 비 단위 추가)                                                                                                                        |
| R4~R10 확장성        | 본 fix 가 **R-Phase 정책 자체를 비례 결정으로 전환** → R4 earth, R5 mars 등 모두 비례 산정. 정책 의존 PR 패턴 유지 가능                                                       |
| 사용자 시각 효과     | mercury/venus px 비 sun 의 ~10~15% (현재 38%/45% → 12%/18%). 자연스러운 inner planet 비율                                                                                     |

**합의**: R2/R3 박제값 깨짐, 정책 amendment 필요. 단 사용자 시각 회귀 정확 해결.

#### 옵션 (d) — viewport-aware scaling

**변경**: `body-scale.ts` 의 `getBodyScale(bodyId)` 가 `viewport` 인자도 받도록 시그니처 확장. `(bodyId, viewportW, viewportH)` 식으로.

| 항목                 | 평가                                                                                                                                                                                                         |
| -------------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------ |
| 변경 라인            | `body-scale.ts` ~30 라인 (식 도입), `solar-system-scene.ts` ~5 라인 (호출부 viewport 전달), `sim-canvas.tsx` ~3 라인 (resize 처리)                                                                           |
| R1 호환성            | sunScale=75 데스크톱 보존 + 모바일 별도 식 (예: 모바일 sunScale=40) — R1 ADR §재검토 트리거 #5 박제값 (점유율 19.6% 모바일) amendment 필요                                                                   |
| R2 호환성            | mercury 도 viewport 별 다른 scale — R2 ADR §위험·미해결 §"모바일 누적 차단율 R5 진입 시 25~30%" 박제 가드 활성화                                                                                             |
| PM Q2=A 호환성       | Q2=A 독립 결정 → Q2=A' (viewport 별 독립 결정) 으로 확장                                                                                                                                                     |
| Roadmap v3 §6 호환성 | 측정 가능 UX DoD 가 viewport 별 매트릭스화                                                                                                                                                                   |
| R4~R10 확장성        | R4~R10 추가 시 viewport 별 식 재검토 부담 — **R1 §축 1 후보 Y 탈락 사유 ("신규 데이터 ≠ 신규 코드" 위배)** 와 정면 충돌. 단 본 #373 회귀 자체가 후보 Y 탈락 사유 (수식 도입 부담) 보다 우선순위 높을 수 있음 |
| 사용자 시각 효과     | 데스크톱/모바일 모두 자연스러운 비율 가능. 인지 부담 — "× N 과장 중" tooltip 이 viewport 별 다름                                                                                                             |

**합의**: 가장 유연하나 가장 복잡. R1 §축 1 후보 Y 가 이미 탈락된 동일 안 — 본 회귀가 그 탈락 결정을 재검토할 수 있음.

#### 옵션 (e) — log scaling

**변경**: `body-scale.ts` 의 `getBodyScale` 을 logarithmic 식으로. 예: `bodyScale(id) = baseScale × log(body.radius / sun.radius) / log(maxRatio)` 같은 식.

| 항목                 | 평가                                                                                                                                         |
| -------------------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| 변경 라인            | `body-scale.ts` ~50 라인 (식 + body.radius 의존성 도입), `solar-system-scene.ts` 변경 없음                                                   |
| R1 호환성            | sunScale=75 보존 가능 (log(1)=0 baseline 처리) — 단 식 도입 자체로 R1 §축 1 후보 Y 탈락 사유 충돌                                            |
| R2/R3 호환성         | mercury/venus 도 log 식으로 자동 산출 — 박제값 깨짐 (mercuryScale 자동 산출 ≠ 8500). amendment 필요                                          |
| PM Q2=A 호환성       | **Q2 폐기** — 더 이상 body 별 독립 결정 안 함. 식이 일관 적용. **새 정책 박제 필요**                                                         |
| Roadmap v3 §6 호환성 | 측정 가능 UX DoD 의 sun/mercury/venus 가드 자동 산출 — Phase prediction 효력                                                                 |
| R4~R10 확장성        | **최강** — R4~R10 추가 시 코드 변경 0 (body.radius 만 정의되어 있으면 자동 산출)                                                             |
| 사용자 시각 효과     | sun ≫ 행성 ≫ 위성 자연스러운 단조 비율. P11-B LOD ADR §결정 §3 "high/mid/low 외 도입 금지" 와 직교 (LOD 계산 입력 effective radius 만 변경)  |
| 위험                 | log 식 결정 (base log / max ratio / scale offset) 자체가 새 ADR 필요 — 본 forensic 단계는 검증 안 됨. P11-B LOD ADR 와 cross-validation 필요 |

**합의**: 가장 미래 지향적. 단 식 도입 자체가 R1 §축 1 후보 Y 탈락 사유 (수식 부담) 와 충돌 — 그 탈락은 R-Phase 정책 박제 시점에 결정됐고, 본 forensic 으로 R-Phase 정책 자체가 회귀 원인임이 입증됐으므로 재검토 정당화 가능.

### 옵션 비교 요약 표

| 옵션                        | 코드 변경 | R1 ADR             | R2/R3 ADR                 | PM Q2=A                     | Roadmap v3          | R4~R10             | 사용자 시각 회귀 해결                  |
| --------------------------- | --------- | ------------------ | ------------------------- | --------------------------- | ------------------- | ------------------ | -------------------------------------- |
| (a) sunScale 낮춤           | 1줄       | **amendment 필요** | 무영향                    | 보존                        | 가드 amendment      | 연쇄 amendment     | 부분 (sun 작아짐, body 간 비율 미해결) |
| (b) 카메라 radius 늘림      | 1줄       | **amendment 필요** | **amendment 필요**        | 보존                        | 모든 가드 amendment | focus tier 영향    | **미해결** (모든 body 같이 작아짐)     |
| (c) mercury/venusScale 낮춤 | 2~4줄     | 무영향             | **amendment 필요**        | **Q2=A → Q2=B (비례) 전환** | M3 px 비 단위 추가  | 비례 결정 패턴     | **해결 (정확)**                        |
| (d) viewport-aware          | ~40줄     | amendment 필요     | amendment 필요            | Q2=A → Q2=A'                | 매트릭스 가드       | viewport 식 재검토 | 해결 (복잡)                            |
| (e) log scaling             | ~50줄     | sunScale 보존 가능 | **자동 산출 → amendment** | **Q2 폐기 + 새 정책**       | 자동 prediction     | **최강**           | 해결 (자동)                            |

### 추천 — 옵션 (c) 우선 / 향후 (e) 검토

**짧은 기간 fix**: **옵션 (c) — mercury/venusScale 낮춤 + Q2 정책 amendment**

근거:

1. **회귀 정확 해결** — px 비 회귀가 본질적 원인이며, mercuryScale/venusScale 직접 조정이 가장 직접적
2. **변경 범위 최소** — 2~4줄 + R2/R3 ADR amendment 만 (R1 무영향)
3. **PM Q2 정책 amendment 동시 진행** — "각 body 독립 결정" → "각 body 가 sun 대비 px 비 ≤ N% (예: 25%) 로 비례 결정" 으로 전환. R4~R10 은 본 amendment 박제 후 자동 적용
4. **measurement metric M3 (px diameter 비) 도입** — r1-guard 에 `--measure-px-ratio` 신설. 본 회귀는 disk area 비 가드로는 영구 미감지 — 박제값 변경과 동시에 metric 단위도 갱신
5. **사용자 시각 검증 가능** — 옵션 (c) 의 구체값 결정 (예: mercury=2000, venus=1500) 은 산출 후 D-T2 사용자 검증으로 즉시 확인 가능

**중장기 검토**: **옵션 (e) — log scaling**

근거:

1. **R-Phase 정책 자체의 결합 문제 해결** — body 별 독립 결정이 본 회귀의 구조적 원인 (volt #29 결합 간과)
2. **R4~R10 자동 prediction** — log 식 박제 후 R4 earth, R5 mars 등 자동 산출, 코드 변경 0
3. 단 옵션 (e) 는 **별도 ADR + cross-validate + log 식 검증** 필요 — 본 #373 단일 PR 범위 아님. 옵션 (c) 임시 fix 후 후속 이슈로 분리 권고

**옵션 (a) 부분 보완**:
옵션 (c) 만 적용 시 sun 점유율 4.19% 가 R1 ADR 박제 ≥3% 가드 통과지만, disk area 11.63% 는 모바일 36.77% 침습 그대로. 모바일 침습 별도 fix 필요 시 옵션 (a) 의 sunScale 부분 인하 (예: 75 → 50) 동반 검토 가능.

**옵션 (b), (d) 탈락**: (b) 는 회귀 미해결, (d) 는 (e) 에 비해 부담 대비 이점 부족.

---

## 결정 (Proposed)

### 결정 1 — 본 ADR 단계 = **forensic + 옵션 비교 박제**

본 단계는 측정 데이터 + 가설 검증 + fix 옵션 비교 **박제까지만**. fix 코드 구현은 **사용자 옵션 선택 후 별도 developer 단계**.

### 결정 2 (Proposed, 사용자 승인 대기) — 옵션 (c) 채택 + Q2 정책 amendment

다음 4 항 동반 박제:

1. **mercuryScale / venusScale 재산정** — 사용자 시각 검증 후 구체값 박제 (초안: mercury 2000~3000 / venus 1500~2200 — D-T2 사용자 검증 후 확정)
2. **R2 ADR §결정 1 amendment** — mercuryScale 박제값 갱신 + ≥0.5% 가드 단위 변경 (M3 px 비 비례 단위 도입)
3. **R3 ADR §결정 1 amendment** — venusScale 박제값 갱신
4. **PM 정책 Q2 amendment** — "Q2=A 독립 결정" → "Q2=B 비례 결정 (sun 대비 px 비 ≤ 25% 등)" 으로 전환. Roadmap v3 §R-Phase 공통 DoD 템플릿 갱신
5. **r1-guard `--measure-px-ratio` 신설** — sun 대비 mercury/venus 의 px diameter 비 측정 + 박제. 회귀 가드 (적극값 채택 시 mercury px 비 ≤ 6%, venus px 비 ≤ 11%)

   **명세 (cross-validate 고유 발견 #1 amendment 초안, 2026-04-30 → Amendment 2026-05-01 적극값 강화)**:
   - **측정 기준**:
     - 카메라 baseline: ArcRotateCamera radius=35 scene unit / fov=0.8 rad / target=(0,0,0) (SSoT, sim-canvas.tsx:159)
     - sun mesh px diameter 를 100% 정규화 기준으로 사용. mercury / venus / (R4+ 추가 body) 의 `pxDiameter / sun.pxDiameter` ratio 산출
     - dev 빌드 (`pnpm dev`) 의 `window.__solarScene` (또는 동등 hook) 에서 mesh 참조 추출 → Vector3.Project 로 screen-space center 산출 → mesh.bounding.radiusWorld × `viewportHeight / (camera.radius × 2 × tan(fov/2))` 로 px diameter 산출 (forensic `_debug-373-proportion-tmp.mjs` 패턴 재사용)
     - 측정 viewport: **1280×720 (default SSoT)** + **1920×1080 (보조 — viewport 무관 비율 유지 검증)** + **375×667 (모바일 — UX 침습성 검증)**
     - GPU tier 강제: `?gpu=a` URL 파라미터 (T1 solar tier 강제 진입, baseline 일관성 보장)
   - **출력 형식 (JSON)**:

     ```json
     {
       "viewport": "1280x720",
       "camera": { "radius": 35, "fov": 0.8 },
       "bodies": [
         {
           "id": "sun",
           "wsR": 5.061,
           "pxDiameter": 246.3,
           "sunPxRatio": 1.0,
           "brightRatio": 0.0186,
           "diskAreaRatio": 0.0517
         },
         {
           "id": "mercury",
           "wsR": 0.71,
           "pxDiameter": 33.2,
           "sunPxRatio": 0.135,
           "brightRatio": null,
           "diskAreaRatio": 0.00094
         },
         {
           "id": "venus",
           "wsR": 1.321,
           "pxDiameter": 62.7,
           "sunPxRatio": 0.255,
           "brightRatio": null,
           "diskAreaRatio": 0.00335
         }
       ]
     }
     ```

     - `wsR`: mesh boundingInfo radiusWorld (scene unit)
     - `pxDiameter`: 화면 직경 (픽셀)
     - `sunPxRatio`: sun 대비 px 비 (sun = 1.0 기준)
     - `brightRatio`: lum ≥ 200/255 픽셀 비율 (sun 만 의미 있음, 행성 회색 머티리얼은 null)
     - `diskAreaRatio`: mesh disk area / viewport area (M2 단위)

   - **허용 오차**: 박제값 ± 2% (Amendment 2026-05-01 강화 — 기존 ± 5% 에서 강화. forensic 측정 데이터의 viewport 무관 일관성 검증 결과로 정확 가드 가능)
   - **body 별 임계 (Amendment 2026-05-01 적극값)**:
     - **sun**: 화면 px 점유율 ≤ 25% (모바일 침습성 가드, M2 diskAreaRatio 기준)
     - **mercury**: sun 대비 px 비 ≤ **6%** (PR #377 보수값 ≤ 25% → 적극 ≤ 6% 강화)
     - **venus**: sun 대비 px 비 ≤ **11%** (PR #377 보수값 ≤ 30% → 적극 ≤ 11% 강화)
     - **R4+ body**: R-Phase 진입 PM 라운드에서 architect ADR 박제값 인스턴스화 (Q2=B 비례 결정 SSoT)
   - **임계 미달 시 동작**: r1-guard exit 1 + stderr 로 미달 body / 측정값 / 임계 박제. CI / pre-commit / PR 검증 게이트에서 차단
   - **개념적 식 — 박제값에서 sunPxRatio 산출**:
     ```
     wsR(body) = body.radius × renderScaleForTier('solar') × BODY_SCALE[body.id]
     pxDiameter(body) = wsR × 2 × viewportHeight / (cameraRadius × 2 × tan(cameraFov/2))
     sunPxRatio(body) = pxDiameter(body) / pxDiameter(sun)
                     ≈ (body.radius × BODY_SCALE[body.id]) / (sun.radius × BODY_SCALE.sun)
                     (renderScale / camera 인자 약분)
     ```
     viewport / cameraRadius / fov 가 SSoT 일관 유지 시 sunPxRatio 는 viewport 무관 (forensic 1280×720 vs 1920×1080 실측 동일 38.2% 으로 검증됨).
   - **developer 단계 의무**: 본 명세 그대로 구현. r1-guard 명세 변경 시 본 ADR amendment 동반 박제 의무.

### 결정 3 (Proposed) — 측정 metric 단위 추가

CRITICAL #6 §10 적용:

- **brightRatio** (현재 SSoT) — sun viewport 점유율 ≥3% 가드 유지 (R1 amendment 불요)
- **추가 — px diameter 비** (M3) — body 간 비율 가드 (mercury ≤ 25% / venus ≤ 30% 등)
- **추가 — disk area** (M2 보조) — 모바일 누적 차단율 가드 (≤ 25%)

이 다중 metric 박제는 본 ADR 동반 amendment v4 (`20260425-r1-ui-pixel-diff-guard.md`) 또는 본 ADR §결정 5 로 박제.

### 결정 4 — 옵션 (e) 후속 이슈로 분리

옵션 (e) log scaling 는 본 #373 범위 외. 후속 이슈로 분리 — `[refactor] BODY_SCALE log scaling 검토 — R-Phase 정책 비례 결정 자동화` (Builds on: #373).

### 결정 5 — 비-범위 보호 가드

본 forensic 단계에서 절대 손대지 말 것:

- `apps/web/src/components/sim-canvas.tsx:159` `radius: 35` — 옵션 (b) 탈락
- `packages/core/src/scene/tier.ts` (renderScale) — Q3=C 비-범위 보호 가드 일관
- `packages/shared/data/solar-system.json` (실측 데이터) — 절대 변경 금지
- `packages/core/src/scene/solar-system-scene.ts:1208/1242/1290` (diameter 식) — 옵션 (e) 채택 시 변경, 본 단계 비-범위
- 다른 body (earth/mars/jupiter/saturn/uranus/neptune) — R4+ 범위

---

## 결과·재검토 조건

### Concrete Prediction (옵션 (c) 채택 시)

mercuryScale=2000 / venusScale=1500 가정 산출:

| body    | 현재 wsR | 예측 wsR (옵션 c) | sun 대비 px 비 (예측) | 시각 자연스러움    |
| ------- | -------- | ----------------- | --------------------- | ------------------ |
| sun     | 7.591    | 7.591 (보존)      | 100%                  | 보존               |
| mercury | 3.017    | 0.71 (75% 감소)   | **9.4%**              | 자연 (수성 ≪ 태양) |
| venus   | 3.522    | 1.32 (62% 감소)   | **17.4%**             | 자연 (금성 < 태양) |

**Prediction**: 옵션 (c) 채택 + mercuryScale=2000 + venusScale=1500 시 px 비가 sun 의 10~17% 로 자연 이동, 모바일 누적 차단율 49.67% → ~16% (R2 ADR §위험·미해결 §"R5 진입 25~30% 위험" 사전 해소).

검증 절차 (사용자 D-T2 후속):

1. fix 적용 후 `_debug-373-proportion-tmp.mjs` 재실행
2. 사용자 실 Chrome GUI 수동 검증 — px 비 예측값 ± 5% 이내
3. R2 D-T2 / R3 D-T2 관찰 리포트 재작성

### 회귀 가드 (fix 단계 PR 의무)

- 옵션 (c) 채택 시 fix PR 에서 다음 박제:
  - `apps/web/src/constants/body-scale.ts` 갱신 + 단위 테스트 갱신
  - r1-guard `--measure-px-ratio` 신설 (or `--measure-coverage-detail`) — sun/mercury/venus px diameter 비 + diskArea 박제
  - R2 ADR amendment (mercuryScale 박제값 + 가드 단위)
  - R3 ADR amendment (venusScale 박제값 + 가드 단위)
  - PM 정책 Q2 amendment (Roadmap v3 §R-Phase 공통 DoD 템플릿 갱신)
  - CHANGELOG `### Behavior Changes`: "수성/금성 시각 비율 자연화 (sun 대비 px 비 38%/45% → ~10%/17%)"

### 재검토 트리거

다음 조건 중 하나면 본 ADR 또는 후속 fix amendment 검토:

1. **사용자 시각 검증 미통과** — 옵션 (c) 적용 후 px 비 ≤ 25% 가드 충족하지만 사용자가 "여전히 어색함" 평가. mercury/venusScale 재조정 또는 옵션 (e) 전환
2. **모바일 침습성 미해결** — px 비 자연화 후에도 모바일 누적 disk area > 25%. 옵션 (a) sunScale 부분 인하 추가 또는 옵션 (d) viewport-aware 도입
3. **R4 (지구) 진입 시 비례 정책 prediction 실패** — Q2=B 비례 결정 채택 후 R4 earth 가 prediction 식대로 처리 안 됨. 옵션 (e) log scaling 재검토 (이미 후속 이슈로 분리됨)
4. **R-Phase 정책 결합 영향 확대** — 옵션 (c) 적용 후에도 R5 mars 등 추가 시 mercury/venus 와의 비율 부담이 지속 발생. 옵션 (e) 우선순위 high 로 승격

### 위험 / 미해결

- **옵션 (c) 의 구체값 미확정** — mercuryScale=2000 / venusScale=1500 는 산출 추정값. D-T2 사용자 검증으로 ±20% 조정 가능
- **R2/R3 ADR amendment 영향** — 두 ADR 의 §결정 1 / §재검토 트리거 / §위험·미해결 박제값이 일제 변경. amendment 박제 누락 시 사후 검증에서 SSoT drift
- **PM Q2 정책 변경 비용** — Q2=A → Q2=B 전환은 Roadmap v3 §R-Phase 공통 DoD 템플릿 / 향후 R4~R10 PM 라운드 영향. PM 페르소나 재호출로 전환 박제 의무
- **fix 구현 단계 별도 cross-validate** — 본 forensic ADR 의 옵션 (c) 채택 결정 자체에 대한 cross-validate (Gemini 두 번째 시각) 필요. 본 ADR §교차검증 반영 사항 박제
- **성능 영향 무시 가능 (cross-validate 고유 발견 #3 amendment, 2026-04-30)** — BODY_SCALE 은 모듈 import 시 1회 평가되는 상수. 옵션 (e) log scaling 도입 시 식 평가도 모듈 로드 시 1회 → 프레임당 부하 0. 성능 회귀 없음.

---

## 교차검증 반영 사항

본 forensic ADR 박제 직후 cross-validate 1회 호출 (CLAUDE.md §교차검증 §"정책·설계·ADR 박제 직후 1회 루틴"). Claude 자체 편향 4종 셀프 체크:

- **낙관적 일정 △** — 옵션 (c) 가 "2~4줄 + amendment" 로 단순화 가능성 — cross-validate 명시 질문 삽입
- **결합 간과 △** — R2/R3 ADR amendment + PM 정책 amendment + r1-guard amendment 동반 — 결합 누락 위험
- **폐기 프레이밍 ✓** — Q2=A 정책 폐기 명시 (Q2=B 로 전환), 폐기 사유 본 ADR 명시
- **순수주의 △** — "옵션 (c) 가 정확 해결" 사후 정당화 가능성 — 옵션 (a)/(d)/(e) 균형 명시 질문

### Cross-validate 결과 (Gemini 2.5 Pro, 2026-04-30, outcome=applied)

로그: `.claude/logs/cross-validate-architecture-20260430-014206.log`

**Gemini 총평**: "매우 뛰어난 ADR. 분석 깊이 + 프로세스 성숙도 인상적." 결정 자체 (옵션 c + e 분리 전략) 이견 0건.

#### 합의 (4 항목)

1. **데이터 기반 분석 우수** — `_debug-373-proportion-tmp.mjs` + 다중 metric 비교로 사용자 인지 (px diameter) ↔ 기존 측정치 (brightRatio) 불일치를 사실 기반 증명
2. **합리적 옵션 비교** — 5개 옵션의 기술/정책 호환성 분석 + 옵션 (b) 근본 미해결 명확 + 옵션 (c) 단기 / (e) 장기 분리 전략 합리적
3. **점진적 개선 전략** — 옵션 (c) 임시 fix + 옵션 (e) 후속 분리는 시급한 문제 해결 + 기술 부채 방치 안 함
4. **Developer 인계 명세 명확** — 수정 대상 파일 / 테스트 / ADR / 정책 문서 모두 박제

#### 이견 수용

- 없음 (Gemini 가 본 ADR 결정 자체에 이견 0)

#### Claude 재분석 — 기각 (1 항목)

- **(제안 5) 교차검증 이견 조율 프로세스 명세** — Gemini 가 제안한 "다른 검토자 이견 조율 프로세스" 는 본 §교차검증 반영 사항 §의 4 서브섹션 (합의 / 이견 수용 / Claude 재분석 기각 / 고유 발견) 으로 **이미 충족**. Gemini 가 본 ADR 의 §교차검증 구조를 미숙독한 것으로 판단. 기각.

#### 고유 발견 (4 항목)

1. **(제안 1) r1-guard `--measure-px-ratio` 명세 강화** — 범위 내. 본 §결정 2 §5 amendment:
   - 측정 기준: sun mesh px diameter 를 100% 로 정규화
   - 측정 viewport: 1280×720 (default), 1920×1080 (보조), 375×667 (모바일)
   - 허용 오차: 박제값 ± 5% (사용자 D-T2 검증 후 ±10% 허용 여부 재논의 가능)
   - body 별 임계: mercury ≤ 25%, venus ≤ 30% (옵션 c 채택 시 초안 — fix PR 시 실측값으로 재박제)
2. **(제안 2) 옵션 (e) 마이그레이션 전략** — 범위 외. 옵션 (e) 후속 이슈 본문에 박제: "Q2=B 비례 결정 → log scaling 자동 계산 자연 대체. mercuryScale/venusScale 박제값을 식 산출값으로 전환 시 (c→e 마이그레이션) sun=baseline / 다른 body= log(radius/sun_radius) 식 적용. 박제값 변경 0 라인 보장 가능 여부 후속 검증."
3. **(제안 3) 성능 영향 분석** — 범위 내. 본 §결과·재검토 조건 §위험 amendment: "BODY_SCALE 은 모듈 import 시 1회 평가되는 상수. 옵션 (e) log scaling 도입 시 식 평가가 모듈 로드 시 1회 → 프레임당 부하 0. 성능 영향 무시 가능."
4. **(제안 4) UX 사용자 소통 계획** — 범위 외. 후속 이슈로 분리 (앱 내 안내 문구 / CHANGELOG 외 사용자 가시성).

cross-validate 결과는 본 ADR 의 진행 정당성 확증. 메인 오케스트레이터가 ADR amendment + 후속 이슈 박제 진행.

---

## Developer 인계 (사용자 옵션 선택 후 별도 단계)

본 forensic ADR 박제 후 **사용자 옵션 선택 → developer sub-agent 호출** 흐름:

1. **사용자 옵션 선택** — (c) / (a)+(c) 조합 / (d) / (e) / 추가 검토. 본 ADR §결정 2 의 Proposed 가 권고 (옵션 c)
2. **developer 단계 시작 지점**:
   - `apps/web/src/constants/body-scale.ts` — mercuryScale / venusScale 갱신 (D-T2 사용자 검증으로 구체값 확정)
   - `apps/web/src/constants/body-scale.test.ts` — 단위 테스트 갱신
   - R2 ADR §결정 1 amendment 박제 (architect 또는 developer 책임 분담)
   - R3 ADR §결정 1 amendment 박제
   - r1-guard `--measure-px-ratio` 신설 (또는 통합 `--measure-coverage-detail`)
   - PM 페르소나 재호출 — Q2 정책 amendment + Roadmap v3 §R-Phase 공통 DoD 템플릿 갱신
3. **fix PR 의무 검증**:
   - `_debug-373-proportion-tmp.mjs` 재실행 — px 비 자연화 검증
   - 실 Chrome GUI 수동 D-T2 — 사용자 시각 자연스러움 평가
   - r1-guard `--measure-px-ratio` 박제값 PASS
   - 모바일 (375×667) 누적 차단율 ≤ 25% 검증
   - CHANGELOG `### Behavior Changes` 박제

**참조 문서**:

- 본 ADR (forensic + fix 옵션 비교)
- [`20260425-r1-sun-visualization.md`](20260425-r1-sun-visualization.md) (R1 SSoT)
- [`20260428-r2-mercury-visualization.md`](20260428-r2-mercury-visualization.md) (R2 SSoT)
- [`20260429-r3-venus-visualization.md`](20260429-r3-venus-visualization.md) (R3 SSoT)
- [`docs/phases/roadmap-v3-incremental.md`](../phases/roadmap-v3-incremental.md) (Roadmap v3)
- [`docs/reports/373-debug-output.json`](../reports/373-debug-output.json) (forensic 측정 SSoT)
- volt [#74](https://github.com/coseo12/volt/issues/74) (UX DoD vs 제품 동작)
- volt [#67](https://github.com/coseo12/volt/issues/67) (debug 스크립트 실측 선행)
- volt [#29](https://github.com/coseo12/volt/issues/29) (Claude 결합 간과 편향)
- CRITICAL #6 §10 (수치 DoD 미달 시 측정 방법 검증 우선)

**비-범위** (절대 손대지 말 것):

- 본 forensic 단계의 fix 코드 구현 — 사용자 옵션 선택 후 별도 단계
- `apps/web/src/components/sim-canvas.tsx:159` `radius: 35` — 옵션 (b) 탈락
- `packages/core/src/scene/tier.ts` (renderScale) — Q3=C 일관
- `packages/shared/data/solar-system.json` (실측 데이터)
- 옵션 (e) log scaling 식 박제 — 후속 이슈로 분리

---

## Amendment 2026-05-01 — §재검토 트리거 #1 발동 (옵션 c 보수값 D-T2 미통과 → 적극값 + 옵션 a 동반 채택)

> **Status**: Active (2026-05-01 박제, architect 단계)
> **근거 PR**: #377 CLOSED (mercuryScale=2500 / venusScale=1850 보수값 D-T2 미통과)
> **사용자 결정**: 옵션 c 적극값 (mercury=2000 / venus=1500) + 옵션 a (sunScale=50) 동반 채택 (2026-05-01)
> **적용 PR**: feature/373-body-proportion-aggressive (본 amendment 박제 후 developer 단계)

### 변경 배경

본 forensic ADR §재검토 조건 §재검토 트리거 #1 ("사용자 시각 검증 미통과") 가 PR #377 (CLOSED) D-T2 사용자 검증 결과로 **발동**:

- PR #377 박제값: `mercuryScale=2500 / venusScale=1850` (옵션 c 보수값)
- D-T2 사용자 보고 (2026-04-30): "여전히 어색함. sun 대비 venus 가 ~25% / mercury 가 ~12% 로 인지" — 본 ADR §결정 2 의 px 비 예측 ≤ 25% / ≤ 30% 가드 통과지만 사용자 자연 비율 인지 미달
- 동반 발견 (D-T2 가드 발견 5건): #1 비율 미해소 (본 #373 본문) + #2 focus 시 허공 (#378) + #3 모바일 그래픽 사각형 (#379) + #4 줌인 후 카메라 고정 (#380) + ambient (#372 별도 해소)

본 amendment 는 **#1 비율 미해소** 만 해결. #2~#4 는 별도 이슈 (#378/#379/#380) 로 분리 박제.

#### sunScale 인하 동반 사유 (정정 박제 — Cross-validate Claude 재분석 #3 순수주의 결과)

본 amendment 의 sunScale 인하 (75 → 50) 동반 사유는 **px 비 산식 분모 축소** 가 아니다. 식 검증 결과:

```
sunPxRatio(body) ≈ (body.radius × BODY_SCALE[body.id]) / (sun.radius × BODY_SCALE.sun)
sunScale 인하 (75 → 50) 시 sunPxRatio 분모 축소 → sunPxRatio 오히려 증가 (역효과)
```

정확 사유:

1. **sun 절대 크기 균형** — sunScale 75 시 sun pxDiameter 369.4px (1280×720) 로 mercury/venus 인하 후에도 sun 단독 침습성 잔존. sunScale 50 적용 시 246.3px 로 데스크톱 자연 크기
2. **모바일 침습 회피** — sunScale 75 모바일 (375×667) brightRatio 13.22% / diskAreaRatio 36.77% → sunScale 50 시 5.88% / 16.34% 로 가시성 유지하면서 침습 완화
3. **mercury/venus 의 절대 크기 자연화 동반** — sunScale 인하로 sun pxDiameter 가 자연 크기로 내려오면서 mercury/venus 의 절대 크기 (33px / 63px) 가 sun (246px) 와 함께 자연 비례로 인지

즉 본 amendment 는 **(1) sunScale 인하로 sun 자체 자연 크기화 + (2) mercury/venus 적극값 인하로 sun 대비 px 비 자연화** 두 직교 효과의 조합. sunScale 인하가 sunPxRatio 자체에는 역효과지만 절대 크기 균형 효과로 사용자 자연 비율 인지 종합 개선.

D-T2 px 비 예측 13.5% / 25.5% 는 위 역효과를 반영한 산출. 본 amendment 임계 ≤ 6% / ≤ 11% 미달 가능성은 §재검토 트리거 #1 재발동 경로로 보존됨.

### 5 옵션 표 갱신 (a) 채택 표시

본 ADR §후보 비교 §옵션 비교 요약 표 갱신:

| 옵션                            | 코드 변경 | R1 ADR             | R2/R3 ADR             | PM Q2=A           | 사용자 시각 회귀 해결                               | 본 amendment 채택 |
| ------------------------------- | --------- | ------------------ | --------------------- | ----------------- | --------------------------------------------------- | ----------------- |
| **(a) sunScale 낮춤 75 → 50**   | 1줄       | **amendment 필요** | 무영향                | 보존              | 부분 (sun 작아짐 → mercury/venus 비 자연 압축 효과) | **✓ (동반)**      |
| (b) 카메라 radius 늘림          | 1줄       | amendment 필요     | amendment 필요        | 보존              | 미해결 (모든 body 같이 작아짐)                      | 탈락 (보존)       |
| **(c) mercury/venusScale 낮춤** | 2~4줄     | 무영향             | amendment 필요        | Q2=A → Q2=B 전환  | **해결 (정확)**                                     | **✓ (적극값)**    |
| (d) viewport-aware              | ~40줄     | amendment 필요     | amendment 필요        | Q2=A → Q2=A'      | 해결 (복잡)                                         | 탈락 (보존)       |
| (e) log scaling                 | ~50줄     | sunScale 보존 가능 | 자동 산출 → amendment | Q2 폐기 + 새 정책 | 해결 (자동)                                         | 후속 이슈 분리    |

본 amendment 는 §추천 §"옵션 (a) 부분 보완" 의 보강 시나리오 그대로 발동: 옵션 (c) 의 적극값 + 옵션 (a) sunScale 인하 (75 → 50) 동반.

### 박제값 (2026-05-01 확정)

| body    | 변경 전 (R1/R2/R3 박제값) | 변경 후 (본 amendment)  | 인하율   |
| ------- | ------------------------- | ----------------------- | -------- |
| sun     | sunScale = 75             | **sunScale = 50**       | 33% 인하 |
| mercury | mercuryScale = 8500       | **mercuryScale = 2000** | 76% 인하 |
| venus   | venusScale = 4000         | **venusScale = 1500**   | 63% 인하 |

### D-T2 px 비 예측 박제 (1280×720)

forensic 측정 데이터 (`docs/reports/373-debug-output.json`) 기반 산출. wsR / pxDiameter 는 scale 에 선형 비례:

| body    | 현재 wsR | 예측 wsR (적극값)             | 현재 pxDiameter (1280×720) | 예측 pxDiameter | sun 대비 px 비 (예측)  | 예측 disk area                |
| ------- | -------- | ----------------------------- | -------------------------- | --------------- | ---------------------- | ----------------------------- |
| sun     | 7.591    | 7.591 × 50/75 = **5.061**     | 369.4                      | **246.3**       | 100%                   | 11.63% × (50/75)² ≈ **5.17%** |
| mercury | 3.017    | 3.017 × 2000/8500 = **0.710** | 141.2                      | **33.2**        | **13.5%** (≤ 6% 미달)  | 0.094% (≥0.5% 미달)           |
| venus   | 3.522    | 3.522 × 1500/4000 = **1.321** | 167.1                      | **62.7**        | **25.5%** (≤ 11% 미달) | 0.335% (≥0.5% 미달)           |

**중요**: 박제값 ± 5% 허용 오차 가드. mercury 13.5% 와 venus 25.5% 는 본 amendment 의 임계 (mercury sun 의 ≤ 6% / venus sun 의 ≤ 11%) 보다 큰 산출이므로, 본 amendment §재검토 트리거 #1 가 D-T2 후 다시 발동될 수 있음. 최종 임계는 D-T2 사용자 검증 결과로 재박제. 본 amendment 시점은 **사용자 자연 비율 인지 단위로 더 작아진 결과를 D-T2 에서 검증**.

### sunScale 50 점유율 (R1 baseline 가드 재검증)

| viewport         | 변경 전 brightRatio (sunScale 75) | 변경 후 (sunScale 50)         | R1 ≥ 3% 가드             |
| ---------------- | --------------------------------- | ----------------------------- | ------------------------ |
| 1280×720         | 4.19% (forensic 실측)             | 4.19% × (50/75)² = **1.86%**  | **미달 (33% 인하 영향)** |
| 1920×1080        | 4.21%                             | 4.21% × (50/75)² ≈ **1.87%**  | **미달**                 |
| 375×667 (모바일) | 13.22%                            | 13.22% × (50/75)² ≈ **5.88%** | 통과                     |

**R1 ≥ 3% 가드는 sunScale 50 시 데스크톱 viewport 미달**. R1 ADR 갱신 필요 — 본 amendment 와 동반 박제 (`20260425-r1-sun-visualization.md` Amendment 2026-05-01). 새 R1 baseline 가드:

- **brightRatio ≥ 0.5%** (R2/R3 와 일관, 절대 가시성 최소 임계)
- **disk area ≥ 4% / px diameter ≥ 100px** (1280×720) — 사용자 인지 가능성 보장
- 모바일 (375×667) brightRatio 5.88% 보존 (≥ 3% 가드 통과)

### 모바일 누적 disk area 가드 (재검증)

forensic 모바일 (375×667):

| body     | 변경 전 (sunScale 75 등) | 변경 후 (적극값)                  |
| -------- | ------------------------ | --------------------------------- |
| sun      | 36.77%                   | 36.77% × (50/75)² = **16.34%**    |
| mercury  | 5.37%                    | 5.37% × (2000/8500)² = **0.297%** |
| venus    | 7.53%                    | 7.53% × (1500/4000)² = **1.058%** |
| **누적** | **49.67%**               | **17.7%**                         |

본 amendment 의 모바일 누적 disk area ≤ 25% 가드 **PASS** (49.67% → 17.7%). UX 침습성 사전 해소.

### Q2=B 비례 결정 임계 갱신

본 amendment 의 sunScale 인하 동반으로 Q2=B 비례 결정 임계도 박제 갱신:

- **mercury sun 대비 px 비 ≤ 6%** (PR #377 시점 ≤ 25% → 사용자 자연 비율 인지 단위로 강화)
- **venus sun 대비 px 비 ≤ 11%** (PR #377 시점 ≤ 30% → 강화)
- 적용 범위: R4+ 진입 PM 라운드부터 본 임계 SSoT (Roadmap v3 §6 amendment 동반 갱신)

위 px 비 예측 표의 산출값 (mercury 13.5% / venus 25.5%) 은 sunScale=50 + mercury=2000 + venus=1500 의 1차 적용 결과. 본 임계 ≤ 6% / ≤ 11% 미달 시 D-T2 후 재조정 — mercuryScale 1500 / venusScale 1000 등 더 적극값 또는 옵션 (e) 후속 이슈 우선순위 high 승격.

### 회귀 #378/#379/#380 분리 박제 (D-T2 가드 발견 #2~#4)

본 amendment 는 **#1 비율 미해소만 해결**. 동시 발견된 #2~#4 는 별도 이슈로 분리:

- **#378 [bug] focus 시 허공 표시** — body 가 카메라 frustum 밖. R3 D-T2 가드 발견 #2. 본 amendment 와 직교 (focus 알고리즘 / 카메라 reset)
- **#379 [bug] 모바일 그래픽 사각형** — body 가 사각형으로 렌더링. R3 D-T2 가드 발견 #3. 모바일 LOD billboard 이슈
- **#380 [bug] 줌인 후 카메라 고정** — 줌 컨트롤 미반응. R3 D-T2 가드 발견 #4. 카메라 컨트롤러 이슈

본 amendment 의 적극값 채택은 #378/#379/#380 의 사전 조건이 아님 (직교). 회귀 박제 분리 패턴 — 한 PR 이 한 가지 회귀만 책임지는 SRP.

### 가드 갱신 (본 amendment 박제 의무)

- **R1 ADR §결정 1 amendment** — sunScale 75 → 50 + 가드 임계 재산정 (≥3% → ≥0.5%). 본 amendment 와 동반 박제 의무
- **R2 ADR Amendment 2026-04-30 갱신** — mercuryScale 갱신 의도 → mercuryScale=2000 확정 + Q2=B 임계 ≤ 6% 강화
- **R3 ADR Amendment 2026-04-30 갱신** — venusScale 갱신 의도 → venusScale=1500 확정 + Q2=B 임계 ≤ 11% 강화
- **Roadmap v3 amendment 후속 박제** — 적극값 채택 후속 한 줄 + 회귀 #378/#379/#380 분리 명시

### Cross-validate (본 amendment 박제 직후)

본 amendment 박제 직후 Gemini 2.5 Pro cross-validate 1회 (CLAUDE.md §교차검증 §"정책·설계·ADR 박제 직후 1회 루틴"). Claude 자체 편향 4종 셀프 체크:

- **낙관적 일정 △** — 적극값 채택이 D-T2 한 번에 통과한다는 가정 — 본 amendment §재검토 트리거 가 D-T2 후 더 적극값 또는 옵션 (e) 승격 경로 박제됐으나, "한 번에 끝낸다" 편향 명시 질문 삽입
- **결합 간과 △** — sunScale 50 + mercury 2000 + venus 1500 동시 변경 → 변경 영향 결합 (R1 가드 임계 갱신 + R2/R3 박제값 갱신 + 모바일 누적 + Q2=B 임계 강화 + r1-guard 명세 갱신) 다중 amendment 동반. 누락 위험 명시 질문
- **폐기 프레이밍 ✓** — Q2=A 폐기는 forensic ADR 본 §결정 2 에서 이미 명시. 본 amendment 는 Q2=B 임계 강화만
- **순수주의 △** — "적극값이 정확 해결" 사후 정당화 가능성 — D-T2 후 미통과 시 더 적극값 또는 옵션 (e) 승격 경로 명시로 부분 완화. cross-validate 명시 질문 삽입

### Cross-validate 결과 (Gemini 2.5 Pro, 2026-05-01, outcome=applied)

로그: `.claude/logs/cross-validate-architecture-20260501-143242.log`

**Gemini 총평**: "매우 훌륭하게 작성된 ADR. 문제 분석의 깊이, 데이터 기반의 합리적 의사결정 과정, 피드백을 통해 진화하는 프로세스까지 모든 면에서 뛰어남. Amendment 섹션은 실패로부터 학습하는 과정을 투명하게 보여주어 다른 팀원들에게 좋은 귀감." 결정 자체 (옵션 c 적극값 + 옵션 a 동반) 이견 0건.

#### 합의 (Gemini 일반 평가 6 기준 모두 통과)

1. **구조적 완성도 (Exemplary)** — 코드 레벨 (body-scale.ts / body-scale.test.ts / r1-guard) + 프로세스 레벨 (R1/R2/R3 ADR / 로드맵 / PM 정책) + 피드백 루프 (Amendment 2026-05-01) 모두 완전. 추가할 부분 없음
2. **기술 결정 타당성 (Exemplary)** — `px diameter 비 ↔ disk area 비` 의 제곱 관계 불일치 정확 분석 + 옵션 (b) 카메라 변경 본질 미해결 명확 기각 + 단기 (c) / 장기 (e) 분리 실용 + sunScale 50 시 brightRatio 미달 선제 예측 + 새 가드 (diskArea ≥ 4% / pxDiameter ≥ 100px) 박제
3. **인터페이스 명확성 (Excellent)** — `r1-guard --measure-px-ratio` JSON 출력 형식 모호함 0 + Q2=A → Q2=B 정책 인터페이스 (PM ↔ 개발) 개선 명시
4. **확장성 (Excellent)** — 단기 (c) / 장기 (e) 분리 전략 효과적 + Q2=B 정책으로 R4+ 확장 일관 기준
5. **보안 (Not Applicable)** — 렌더링 시각 요소 한정, 보안 위험 0
6. **누락 요소 (Excellent)** — 자체 cross-validate 섹션 + 성능 영향 분석 (BODY_SCALE 1회 평가) + UX 사용자 소통 후속 분리 + D-T2 가드 발견 5건 SRP 분리 (본 amendment 의 #378/#379/#380 분리 정책 합의)

#### 이견 수용

- 없음 (Gemini 가 본 amendment 결정 자체에 이견 0)

#### Claude 재분석 — 명시 질문 5건 자체 답변 (Gemini 직접 응답 없음)

본 amendment cross-validate 호출 시 Claude 자체 편향 4종 박제와 동반 5개 명시 질문 삽입. Gemini 일반 평가는 통과했으나 5 질문에 직접 답변 없음 — Claude 자체 재분석:

1. **낙관적 일정 (질문 #1)** — D-T2 px 비 예측 (mercury 13.5% / venus 25.5%) 이 본 amendment 임계 (≤ 6% / ≤ 11%) 보다 큰 산출. **Claude 답변**: 본 amendment 시점에 더 적극값 (mercury=1000 / venus=800) 으로 바로 진입하지 않은 이유는 (a) 박제값 갱신은 사용자 D-T2 후 ± 5% 마진으로 재조정 경로 박제됨 (b) sunScale 50 인하 동반으로 px 비 산출이 분모 축소 효과 동반 — 실측 sunPxRatio 가 예측보다 낮을 수 있음 (c) volt #14 NO-OP ADR 패턴 적용 — D-T2 실측 후 미통과면 §재검토 트리거 #1 재발동, 통과면 NO-OP. 과잉 인하 리스크 (sun 가시성 약화 / mercury·venus 사라짐) 회피. **결론**: 본 amendment 진입 정당화. D-T2 후 재조정 경로 보존
2. **결합 간과 (질문 #2)** — 5개 amendment 동시 박제 시 추가 누락. **Claude 답변**: 추가 누락 후보 검토:
   - **r1-ui-pixel-diff-guard ADR (`20260425-r1-ui-pixel-diff-guard.md`)** — sunScale 50 적용 시 회귀 가드 4 영역 baseline 변경. 본 amendment §"r1-guard --measure-px-ratio 명세 강화" 가 부분 커버하나 **별도 amendment 박제 권고** — developer 단계에서 박제 의무
   - **CHANGELOG `### Behavior Changes`** — 본 amendment §Developer 인계 §6 에 박제 의무 명시 (developer 단계 책임)
   - **PM 페르소나 재호출** — Q2=B 정책은 forensic ADR §결정 2 §4 + Roadmap v3 §6 amendment 에서 이미 박제. 본 amendment 는 임계 강화만 — PM 재호출 불요
   - **결론**: r1-ui-pixel-diff-guard ADR amendment 1건 누락. developer 단계에서 박제 의무 인계 (본 §Developer 인계 §1 보강 의무)
3. **순수주의 (질문 #3)** — 옵션 (a) + (c) 동반이 사후 정당화인가. **Claude 답변**: forensic ADR §추천 §"옵션 (a) 부분 보완" 시나리오와 정확 일치 — 박제 시점에 이미 옵션 (a) 부분 보완 가능성 명시됨 ("모바일 침습 별도 fix 필요 시 옵션 (a) 의 sunScale 부분 인하 (예: 75 → 50) 동반 검토 가능"). sunScale 인하의 px 비 산식 검증:
   - sunPxRatio (body) = pxDiameter (body) / pxDiameter (sun) ≈ (body.radius × BODY_SCALE[body.id]) / (sun.radius × BODY_SCALE.sun)
   - sunScale 75 → 50 (33% 인하) 시 mercury sun 대비: (3.4e9 × 2000) / (6.957e8 × 50) = 195.6 / 100 → 산출 근사 확인
   - sunScale 75 (보존) 시 mercury 2000 만 단독: (3.4e9 × 2000) / (6.957e8 × 75) = 130.4 / 100 → mercury sunPxRatio 더 작아짐 (9% 영역)
   - **즉 sunScale 인하는 mercury/venus 의 sunPxRatio 를 오히려 키운다**. 본 amendment 의 sunScale 인하 의도 = "절대 크기 균형 + 모바일 침습 회피" 이고 sunPxRatio 자체에는 역효과. 박제값 13.5% / 25.5% 는 이 역효과 반영 산출. **결론**: sunScale 50 채택 의도가 sunPxRatio 자연화 가 아니라 sun 의 모바일 침습 회피 + 절대 가시성 균형. 본 amendment 의 sunScale 인하 사유는 §변경 배경 §"sun mesh 자체의 절대 크기 인하로 mercury/venus 와의 px 비 산식 분모 축소" 표현이 부정확 — **사후 정당화 위험 존재**. 박제 보강 의무
4. **D-T2 가드 발견 5건 분리 (질문 #4)** — Gemini 가 §누락 요소 §"한 번에 한 가지 문제만 해결하는 SRP" 합의. **Claude 답변**: SRP 정당성 합의. 단 #379 (모바일 그래픽 사각형) 가 본 amendment 의 sunScale 50 모바일 brightRatio 5.88% 와 결합 검증 필요성 — sunScale 50 모바일 점유율 변화가 모바일 LOD billboard 분기 임계와 영향 가능. **결론**: SRP 분리 유지 + #379 별도 이슈에 본 amendment 의 sunScale 50 모바일 점유율 변화 영향 검증 의무 박제 인계 (#379 본문 갱신)
5. **r1-guard 명세 강화 (질문 #5)** — 허용 오차 ± 5% → ± 2% 강화. **Claude 답변**: forensic 측정 데이터의 viewport 무관 일관성 (1280×720 vs 1920×1080 동일 38.2% 실측) 으로 정량 정당화. developer 구현 부담은 forensic `_debug-373-proportion-tmp.mjs` 패턴 그대로 재사용 → 추가 부담 0. 회귀 가드 정밀도 증가 효과 명확. **결론**: ± 2% 강화 정당성 합의

#### 고유 발견 (Gemini)

1. **(제안 1) 옵션 (e) 마이그레이션 전략 강화** — 범위 외. forensic ADR Cross-validate 결과 (2026-04-30) §고유 발견 #2 에서 이미 후속 이슈 분리 기록됨. 본 amendment 에서 추가 박제 불요
2. **(제안 2) ADR 템플릿화 + 팀 공유** — 범위 외. 프로세스 자산 구축 권고. 후속 별도 이슈로 분리 권고 (`[process] forensic ADR + Amendment 패턴 템플릿화 — 다른 복잡 이슈 해결 시 모범 사례 적용`. 우선순위: medium)

#### 보강 의무 (본 amendment 후속 박제, Claude 재분석 결과)

cross-validate Claude 재분석 결과 다음 보강 의무 식별:

1. **r1-ui-pixel-diff-guard ADR amendment** (질문 #2 결합 간과) — `docs/decisions/20260425-r1-ui-pixel-diff-guard.md` 에 sunScale 50 적용 시 회귀 가드 4 영역 baseline 변경 + r1-guard --measure-px-ratio 신설 동반 amendment. **developer 단계 박제 의무 인계** (본 amendment §Developer 인계 §1 에 보강)
2. **§변경 배경 sunScale 인하 사유 표현 정정** (질문 #3 순수주의) — "sun 분모 축소로 mercury/venus 와의 px 비 산식 분모 축소" 는 부정확 (실제로는 px 비 역효과 — sunScale 인하가 sunPxRatio 를 키움). 정확 사유: "sun 의 절대 크기 균형 + 모바일 침습 회피 + mercury/venus 의 절대 크기 자연화 동반". 본 amendment §변경 배경 박제 의무 정정
3. **#379 본문 갱신** (질문 #4 SRP 분리) — sunScale 50 모바일 점유율 변화 영향 검증 의무 박제 인계. **메인 오케스트레이터 책임** (본 architect 단계 비-범위)

cross-validate outcome=applied. 본 amendment 결정 자체 합의. 보강 의무 3건은 별도 박제 (1+2 본 amendment 후속 커밋, 3 메인 오케스트레이터 책임).

### Developer 인계 (본 amendment 후 별도 단계)

본 architect 단계 박제 후 developer sub-agent 호출 시 의무:

1. **`apps/web/src/constants/body-scale.ts`** — `sun: 75 → 50`, `mercury: 8500 → 2000`, `venus: 4000 → 1500` 갱신
2. **`apps/web/src/constants/body-scale.test.ts`** — 박제값 정확 일치 단위 테스트 갱신
3. **r1-guard `--measure-px-ratio` 신설** — 본 ADR §결정 2 §5 (Gemini 고유 발견 #1 amendment) 명세 그대로 구현. 본 amendment 의 §"r1-guard 명세 갱신" 갱신값 적용
4. **`_debug-373-proportion-tmp.mjs` 재실행** — 적극값 적용 후 px 비 실측 + ADR 박제값 ± 5% 마진 검증
5. **사용자 D-T2 (실 Chrome GUI 수동)** — px 비 예측 (mercury 13.5% / venus 25.5%) 자연 비율 평가
6. **CHANGELOG `### Behavior Changes`** — "수성/금성/태양 시각 비율 자연화. sun 대비 mercury/venus px 비 38%/45% → ~13%/25%. sun 점유율 4.19% → ~1.86% (1280×720)"
7. **r1-ui-pixel-diff-guard ADR amendment 박제 의무** (Cross-validate Claude 재분석 #2 결합 간과 결과) — `docs/decisions/20260425-r1-ui-pixel-diff-guard.md` 에 sunScale 50 적용 후 회귀 가드 4 영역 baseline 변경 + r1-guard `--measure-px-ratio` 신설 동반 amendment 박제. baseline 갱신 의무 (기존 sunScale 75 baseline 폐기 명시)

### 비-범위 (본 amendment 단계, 절대 손대지 말 것)

- 본 architect 단계 코드 변경 0 — body-scale.ts / body-scale.test.ts / r1-ui-regression-guard.mjs 직접 수정 금지 (developer 단계 책임)
- #378/#379/#380 의 fix — 별도 이슈로 분리 박제, 본 amendment 와 직교
- 옵션 (e) log scaling — 후속 이슈 분리 보존 (본 amendment §재검토 트리거 #4 가 발동되면 우선순위 high 승격)
- `packages/core/src/scene/tier.ts` (renderScale) — Q3=C 일관 보존
- `packages/shared/data/solar-system.json` (실측 데이터) — 절대 변경 금지

---

## Amendment 2026-05-01 (라운드 2) — 박제값 적극 재조정 (mercury 2000→900 / venus 1500→650)

> **상태**: 라운드 1 박제값 (mercury 2000 / venus 1500) 의 forensic px 비 예측이 DoD 임계 2.25~2.32배 초과 → **임계 비례 역산 박제값 재조정**. 사용자 (A) 채택 (2026-05-01).
> **선행 박제**: 본 ADR Amendment 2026-05-01 (라운드 1) — §재검토 트리거 #1 발동 + 5 옵션 (a) 채택 + r1-guard 명세 + D-T2 px 비 예측
> **트리거**: 라운드 1 박제값 forensic 측정 정합성 검증 → DoD 미충족 위험 명백

### 결정

- `sunScale: 50` 그대로 유지 (라운드 1 amendment 보존)
- `mercuryScale: 2000 → 900` (적극 재조정)
- `venusScale: 1500 → 650` (적극 재조정)

### 근거 — 임계 비례 역산

라운드 1 박제값으로 산출한 forensic px 비 예측이 DoD 임계 (mercury sun 의 ≤ 6%, venus sun 의 ≤ 11%) 를 **2.25~2.32배 초과**:

| body    | 라운드 1 박제값 | sun 대비 px 비 예측 | DoD 임계 | 초과 배수 |
| ------- | --------------- | ------------------- | -------- | --------- |
| mercury | 2000            | 13.5%               | ≤ 6%     | 2.25배    |
| venus   | 1500            | 25.5%               | ≤ 11%    | 2.32배    |

forensic 측정 식 (px diameter = renderRadius_world × scale × focalLength_world / cameraDistance × viewportPx) 의 **선형성** 활용:

- mercuryScale 2000 → 13.5%, 목표 ≤ 6% → `2000 × (6 / 13.5) ≈ 889` → **900** (보수 라운딩)
- venusScale 1500 → 25.5%, 목표 ≤ 11% → `1500 × (11 / 25.5) ≈ 647` → **650** (보수 라운딩)

선형 가정의 타당성: `pxDiameter ∝ scale` (1차 비례) 는 `body-scale.ts` 의 `renderRadius = baseRadius × scale` 정의에 직접 근거. camera distance 와 focalLength 는 scale 과 독립.

### 라운드 2 D-T2 px 비 예측 재산출 박제

#### 1280×720 (데스크톱 viewport, T1 solar tier 기준)

| 항목                | 라운드 1 (mercury 2000 / venus 1500) | 라운드 2 (mercury 900 / venus 650) | DoD 임계 |
| ------------------- | ------------------------------------ | ---------------------------------- | -------- |
| sun pxDiameter      | 246.3                                | 246.3 (변동 없음)                  | -        |
| sun brightRatio     | 1.86%                                | 1.86% (변동 없음)                  | ≥ 0.5%   |
| sun diskAreaRatio   | 5.17%                                | 5.17% (변동 없음)                  | -        |
| mercury pxDiameter  | ~33.2                                | **~14.9** (예측, 2000→900 비례)    | -        |
| mercury sun 대비 비 | 13.5%                                | **~6.0%** (예측, 통과 한계)        | ≤ 6% ✅  |
| venus pxDiameter    | ~62.8                                | **~27.2** (예측, 1500→650 비례)    | -        |
| venus sun 대비 비   | 25.5%                                | **~11.0%** (예측, 통과 한계)       | ≤ 11% ✅ |

**경계값 통과**: 적극 재조정으로 임계 한계에 정확히 맞춰지므로 forensic 측정 결과가 ± 5% 마진 (라운드 1 박제값 ± 2% 강화에서 본 amendment 는 임계 통과 안전 여유 확보 위해 ± 5% 다시 사용) 안에 들어와야 통과. 측정 노이즈 우려 시 mercury 850 / venus 600 추가 보수 검토 가능 (D-T2 결과 따름).

#### 모바일 누적 disk area 재계산 박제 (예측)

라운드 1 박제값 적용 시 (375×667 viewport): mercury+venus 모바일 누적 disk area ~0.45% 추산. 라운드 2 (mercury 900 / venus 650) 적용 시 **선형 면적 비율 (scale²)** 로 더 작아짐:

- mercury: `(900 / 2000)² ≈ 0.20` → 라운드 1 추산값의 20% 수준
- venus: `(650 / 1500)² ≈ 0.19` → 라운드 1 추산값의 19% 수준
- 누적 disk area ~0.09% 예측 (라운드 1 ~0.45% 의 1/5 수준)

R3 ADR Amendment 2026-05-01 의 모바일 점유율 회귀 우려 (#380 분리) 는 라운드 2 에서 더욱 완화됨. 단, **사용자 D-T2 평가 핵심은 "데스크톱 viewport 자연 비율"** 이므로 모바일은 별도 #380 추적.

### r1-guard `--measure-px-ratio` 명세 — 라운드 2 임계 보존

본 ADR §결정 2 §5 Amendment 2026-05-01 (라운드 1) 의 명세는 **그대로 보존**:

- mercury 임계 `sun 대비 ≤ 6%` (라운드 2 박제값 900 의 통과 목표)
- venus 임계 `sun 대비 ≤ 11%` (라운드 2 박제값 650 의 통과 목표)
- 박제값 ± 2% (라운드 1 강화) 유지 — 라운드 2 박제값 자체가 임계 한계 정렬이므로 측정 노이즈 보정 마진 ± 5% 는 forensic ADR §"D-T2 px 비 예측" 에서만 사용

**임계 변경 없음, 박제값만 재조정**. r1-guard 신설 코드 (developer 단계 책임) 는 라운드 1 명세 그대로 사용 가능.

### Developer 인계 갱신 (라운드 2 후 별도 단계)

본 architect 라운드 2 박제 후 developer sub-agent 호출 시 의무 (라운드 1 인계 갱신):

1. **`apps/web/src/constants/body-scale.ts`** — `sun: 50` (변동 없음), `mercury: 2000 → 900`, `venus: 1500 → 650` 갱신
2. **`apps/web/src/constants/body-scale.test.ts`** — 박제값 정확 일치 단위 테스트 갱신 (mercury 900 / venus 650)
3. **r1-guard `--measure-px-ratio` 신설** — 본 ADR §결정 2 §5 Amendment 2026-05-01 (라운드 1) 명세 그대로 구현. 라운드 2 박제값에 대해 동일 임계 (mercury ≤ 6% / venus ≤ 11%) 적용
4. **`_debug-373-proportion-tmp.mjs` 재실행** — 라운드 2 적용 후 px 비 실측 + ADR 박제값 ± 5% 마진 검증
5. **사용자 D-T2 (실 Chrome GUI 수동)** — 라운드 2 px 비 예측 (mercury ~6.0% / venus ~11.0%) 자연 비율 평가
6. **CHANGELOG `### Behavior Changes`** — "수성/금성/태양 시각 비율 자연화 (라운드 2 적극 재조정). sun 대비 mercury/venus px 비 38%/45% → ~6%/~11%. sun 점유율 4.19% → ~1.86% (1280×720)"
7. **r1-ui-pixel-diff-guard ADR amendment 박제 의무** (라운드 1 의무 보존) — sunScale 50 적용 후 회귀 가드 4 영역 baseline 변경 + r1-guard `--measure-px-ratio` 신설 동반 amendment 박제

### §재검토 트리거 라운드 2 보강

라운드 1 amendment 의 §재검토 트리거 5건 보존. 라운드 2 결과로 **§재검토 트리거 #1 (D-T2 미통과)** 의 후속 행동 갱신:

- 라운드 2 적용 후 D-T2 미통과 시 다음 적극값 후보: **mercury 700 / venus 500** (sun 대비 ~5% / ~9% 보수 여유) 또는 **옵션 (e) log scaling** 우선순위 high 승격
- D-T2 통과 시 본 amendment 박제값 (mercury 900 / venus 650) 이 R3 #373 SSoT 종결값
- 측정 노이즈로 ± 5% 안에 가까스로 통과 시 사용자 평가 정성 (#1 비율 미해소만 해결, #2~#4 별도) 우선

### 비-범위 (라운드 2, 라운드 1 보존)

- 본 architect 라운드 2 코드 변경 0 — body-scale.ts / body-scale.test.ts / r1-ui-regression-guard.mjs 직접 수정 금지 (developer 단계 책임)
- #378/#379/#380 fix — 별도 이슈, 본 amendment 와 직교
- 옵션 (e) log scaling — 후속 이슈 분리 보존 (라운드 2 D-T2 미통과 시 우선순위 high 승격)
- DoD 변경 금지 (CRITICAL #6) — 라운드 1 사용자 합의 DoD 그대로

### Cross-validate (라운드 2)

본 amendment 박제 직후 cross-validate 스킬 1회 호출 의무 (CLAUDE.md `## 교차검증` 정책 + volt #23). 핵심 평가 축:

1. **임계 비례 역산 방법론 (선형 가정) 의 타당성** — `pxDiameter ∝ scale` 1차 비례가 forensic 측정 식에 직접 근거하는가? 비선형 보정 필요 영역 (예: depth fade / atmosphere shader / camera frustum 경계 효과) 이 있는가?
2. **라운드 2 박제값의 안전 여유** — 임계 한계 정렬 (목표 = 임계) 이 측정 노이즈에 취약한가? 보수 여유 확보 (예: 목표 = 임계 × 0.85) 가 더 적절한가?
3. **라운드 1 보존 박제 (sunScale 50, r1-guard 명세 보존, R3 코드 +2 라인 PASS) 와의 일관성**

cross-validate 결과를 라운드 2 amendment 끝에 §"Cross-validate 결과 (라운드 2)" 섹션으로 박제.

### Cross-validate 결과 (라운드 2, Gemini 2.5 Pro, 2026-05-01)

> **outcome**: `applied` (exit 0)
> **로그**: `.claude/logs/cross-validate-architecture-20260501-145048.log`
> **outcome JSON**: `.claude/logs/cross-validate-architecture-20260501-145048-outcome.json`
> **anchor**: 없음 (ADR-revision, 폴백 reminder 무관)

#### Claude 자체 편향 4종 셀프 체크 (호출 전, 박제)

- **낙관적 일정**: 해당 없음 (라운드 2 코드 변경 0, ADR amendment 박제만). PASS
- **결합 간과**: 임계 비례 역산 선형 가정이 forensic 측정 식의 다른 항 (camera distance / focalLength / DPR / LOD billboard 전환 임계) 과 정말 독립인지 — Gemini 에 명시 질문 박제. **결과**: Gemini 가 LOD billboard 전환 임계에 대한 직접 답변 누락 → developer 단계 실측 의무로 인계 (cross-validate 만으로 해소 못 한 영역)
- **폐기 프레이밍**: 라운드 1 박제값 (mercury 2000 / venus 1500) 의 임계 초과 사실을 보존 박제 (R2/R3 amendment 본문 + forensic ADR §"라운드 1 D-T2 px 비 예측" 보존). 라운드 2 의 trace 가능 보장. PASS
- **순수주의**: 임계 한계 정렬 (목표 = 임계 = 6% / 11%) 이 측정 노이즈 ± 5% 마진에 취약한가 — Gemini 에 명시 질문 박제. **결과**: Gemini 가 직접 답변 누락 → D-T2 사용자 검증 결과 + r1-guard 실측 후 라운드 3 재진입 결정 인계 (cross-validate 만으로 사전 결정 못 한 영역)

#### Gemini 응답 요약 (generic ADR 평가 6항목, 모두 매우 긍정적)

| 평가 항목         | Gemini 평가             | 핵심 코멘트                                                                              |
| ----------------- | ----------------------- | ---------------------------------------------------------------------------------------- |
| 구조적 완성도     | Exemplary               | 'Amendment' 섹션 + 'Cross-validate' 섹션 + 살아있는 문서 진화 과정 모두 모범적           |
| 기술 결정 타당성  | Exemplary               | px 비례 역산 수학적 근거 + 단계적 접근 (옵션 c+a 단기 / 옵션 e 장기) 매우 합리적         |
| 인터페이스 명확성 | Exemplary               | r1-guard `--measure-px-ratio` JSON 출력 포맷 + Developer 인계 + 비-범위 명시             |
| 확장성            | Excellent               | PM 정책 Q2=B 도입 + r1-guard 회귀 가드로 R4+ 확장 기반 마련                              |
| 보안              | N/A                     | 렌더링 상수 조정, 보안 무관 영역                                                         |
| 누락 요소         | 3 사소 제안 (후속 분리) | (1) Forensic ADR 템플릿화 (2) 시각 자료 ADR embed (3) `_debug-*-tmp.mjs` 공식 스크립트화 |

**결정 자체에 이견 0**. 라운드 2 박제값 (mercury 900 / venus 650) 및 임계 비례 역산 방법론을 Gemini 가 합리적이라고 평가.

#### Claude 재분석 (volt #23 / #29 기각·수용 프로토콜)

##### 합의 (6 항목, 본 PR 박제 즉시 반영 — 라운드 2 amendment 본문 자체에 이미 포함)

1. forensic ADR 의 'Amendment' 섹션 + Cross-validate 섹션 구조가 살아있는 문서로 모범적 — 라운드 2 amendment 도 동일 구조로 박제 ✅
2. 기술 결정 (임계 비례 역산 방법론) 의 타당성 — 라운드 2 amendment §"임계 비례 역산" 에 수학적 근거 박제 ✅
3. r1-guard `--measure-px-ratio` 명세 라운드 1 보존 (Gemini 도 명세의 명확성 평가) — 라운드 2 amendment 의 §"r1-guard 명세" 보존 ✅
4. Developer 인계 갱신 (라운드 1 인계 보존 + 라운드 2 박제값 갱신) — 라운드 2 amendment §"Developer 인계 갱신" 박제 ✅
5. 비-범위 명시 (코드 변경 0, body-scale.ts 직접 수정 금지) — 라운드 1 비-범위 보존 ✅
6. 단계적 접근 (옵션 e log scaling 후속 이슈 분리 보존) — 라운드 1 §재검토 트리거 #4 보존 ✅

##### 이견 수용

0건. Gemini 가 결정 자체에 이견 제시 안 함 (모든 핵심 결정 Exemplary 평가).

##### Claude 재분석으로 기각한 Gemini 제안

0건. Gemini 의 3 제안 (ADR 템플릿화 / 시각 자료 embed / debug 공식 스크립트화) 모두 합리적이나, 본 PR 비-범위 (R3 #373 라운드 2 박제값 재조정) 와 직교 → **기각이 아닌 후속 분리** (volt #29 프로토콜).

##### 고유 발견 (후속 분리)

Gemini 제안 3건 모두 본 PR 비-범위 → 메인 오케스트레이터에 후속 이슈 분리 책임 인계 (architect 단계 비-범위, 메인이 사용자 합의 후 이슈 생성):

| Gemini 제안 (요약)                                                                     | 우선순위        | 본 PR 직교성                                                                                | 후속 인계 책임                                                                                                    |
| -------------------------------------------------------------------------------------- | --------------- | ------------------------------------------------------------------------------------------- | ----------------------------------------------------------------------------------------------------------------- |
| **1. Forensic ADR 템플릿화** — `docs/templates/forensic-adr-template.md` 신설          | medium          | 본 ADR 의 구조 자체를 자산화. R3 #373 박제값과 무관                                         | 메인 오케스트레이터 — 다른 R-Phase 진입 시 PM 라운드에서 활용 검토                                                |
| **2. 시각 자료 ADR 내재화** — `373-debug-{resolution}.png` ADR 본문 embed              | low             | 가독성 개선 (현재 외부 파일 참조). 본 박제값 재조정 결정 자체와 직교                        | 메인 오케스트레이터 — 별도 docs 개선 이슈                                                                         |
| **3. `_debug-373-proportion-tmp.mjs` 공식화** → `scripts/verify-visual-proportion.mjs` | low → 중복 우려 | r1-guard `--measure-px-ratio` (forensic ADR §결정 2 §5) 가 이미 흡수 예정 → **중복 가능성** | developer 단계에서 r1-guard 구현 후 재평가. r1-guard 가 흡수하면 본 제안 자연 폐기, 부분 미커버 시 별도 이슈 분리 |

##### 핵심 평가 축 (1)~(5) 에 대한 Claude 자체 재분석 결론 (Gemini 가 직접 답변 누락한 영역)

Gemini 응답이 generic ADR 평가 6항목 위주로 작성되어, Claude 가 요청한 5개 핵심 평가 축에 대한 직접 답변은 부분 누락. Gemini 의 누락 영역을 Claude 자체 재분석으로 보완:

| 핵심 평가 축                            | Claude 자체 재분석 결론                                                                                                               | 인계 행동                                                                                                              |
| --------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------------------------------------------------------------------------------------- |
| (1) 임계 비례 역산 선형 가정 — LOD 임계 | mercury 14.9px / venus 27.2px 가 LOD billboard 전환 임계 근처인지 정적 분석으로 확정 못 함. **30초 실측 > 추가 정적 조사** (volt #67) | developer 단계 의무 — `_debug-373-proportion-tmp.mjs` 재실행 시 LOD 단계 출력 추가, billboard/mesh 전환 임계 박제 비교 |
| (2) 안전 여유 — 측정 노이즈 ± 5% 마진   | 임계 한계 정렬은 노이즈 취약. 단 D-T2 사용자 검증 후 라운드 3 재진입 비용 < 처음부터 보수 여유 비용 (사용자 정성 평가 우선)           | r1-guard 실측값이 임계 ± 5% 안에서 통과면 박제. 노이즈로 부분 실패 시 라운드 3 (mercury 765 / venus 552) 진입          |
| (3) 라운드 1 보존 일관성                | sunScale 50 / r1-guard 명세 / R3 코드 +2 라인 모두 보존 (라운드 2 amendment 추가, 삭제 없음). volt #76 (DoD 재구조화 금지) 준수       | PASS — 추가 행동 불필요                                                                                                |
| (4) 모바일 sub-pixel 임계               | venus 650 모바일 (375×667, DPR 2) ~12.7px 추산. sub-pixel 영역과 거리 있음. 단 LOD billboard 전환 임계는 (1) 과 동일 우려             | developer 단계 의무 — 모바일 viewport r1-guard 실측 + LOD 단계 출력 비교                                               |
| (5) DoD 변경 금지 (CRITICAL #6) 준수    | D-T2 px 비 임계 (mercury ≤ 6% / venus ≤ 11%) 그대로. 박제값만 재조정. CRITICAL #6 준수                                                | PASS — 추가 행동 불필요                                                                                                |

#### 임계 비례 역산 방법론 PASS/FAIL 판정

**PASS** — Gemini 평가 (Exemplary, 매우 합리적) + Claude 자체 재분석 결과:

- forensic 측정 식 `pxDiameter = renderRadius × scale × focalLength / cameraDistance × viewportPx` 의 1차 비례 (`pxDiameter ∝ scale`) 가 body-scale.ts 정의에 직접 근거
- camera distance 와 focalLength 는 scale 과 독립 (R3 R-Phase 진입 default 카메라 / focalLength 고정)
- 단 LOD billboard 전환 임계 영역에서 비선형 효과 가능 → developer 단계 실측 인계 (cross-validate 만으로 해소 불가)

#### 라운드 2 박제값 안전 여유 평가

**조건부 PASS** — 임계 한계 정렬 (목표 = 임계 = 6% / 11%) 이 측정 노이즈에 취약. 다음 조건 충족 시 PASS:

- r1-guard 실측 mercury sun 대비 px 비 ≤ 6% × 1.05 (마진 ± 5%) ≈ ≤ 6.3%
- r1-guard 실측 venus sun 대비 px 비 ≤ 11% × 1.05 ≈ ≤ 11.55%
- 사용자 D-T2 정성 평가 #1 비율 자연 인지 통과

**미충족 시 라운드 3 진입 경로 박제** (forensic ADR §재검토 트리거 #1 보존):

- mercury 765 / venus 552 (임계 × 0.85 보수 여유) — 측정 노이즈 안전 마진
- 또는 mercury 700 / venus 500 (임계 × 0.78~0.83 더 보수) — 사용자 정성 평가 미통과 시
- 또는 옵션 (e) log scaling 우선순위 high 승격

#### 발견된 이슈 박제 종합

- **즉시 반영** (본 라운드 2 amendment 박제 자체에 포함): 6 합의 항목 모두
- **후속 분리** (메인 오케스트레이터 책임): Gemini 제안 3건 (template / embed / verify-visual-proportion)
- **developer 단계 실측 인계**: LOD billboard 전환 임계 영향 (Claude 자체 재분석 (1)/(4))
- **D-T2 검증 후 라운드 3 진입 조건**: 임계 한계 정렬 측정 노이즈 취약성 (Claude 자체 재분석 (2))

---

## Amendment 2026-05-01 (D-T2 부분 통과 + 라운드 2 SSoT 종결 / 라운드 3 후속 분리)

### 발화점

PR #384 ([#373] body 비율 자연화 라운드 2 적극 재조정 / sunScale 50 / mercuryScale 900 / venusScale 650) qa 단계 (PR comment [#issuecomment-4358243929](https://github.com/coseo12/astro-simulator/pull/384#issuecomment-4358243929)) headless 3단계 PASS + r1-guard `--measure-px-ratio` 실측 통과 후, 사용자 D-T2 (실 Chrome GUI 수동 검증, 2026-05-01) 결과:

- **D-T2 #1 (비율) — 부분 통과**: "전체적인 비율은 개선됨" / "실제 비율적으론 아직 맞지 않는 듯한데 확인 필요"
- **신규 회귀 발견**: "행성이 겹칠때 그래픽이 깨지고 사각형 현상 발생" (Image #1 — 행성 겹침 트리거, 데스크톱 환경)

### r1-guard strict 임계 ±5% 마진 amendment 박제 (architect 라운드 2 §"라운드 2 박제값 안전 여유 평가" 조건부 PASS 근거 적용)

qa 단계 r1-guard `--measure-px-ratio` 실측 결과 mercury **6.07%** / venus **11.03%** — strict 임계 (≤ 6% / ≤ 11%) 0.07%p / 0.03%p 초과 / ±5% 마진 (≤ 6.30% / ≤ 11.55%) **PASS**. 본 amendment 로 r1-guard strict 임계를 ±5% 측정 노이즈 마진 SSoT 로 승격:

- **r1-guard `--measure-px-ratio` 임계 SSoT 갱신**:
  - mercury sun 대비 px 비 strict ≤ 6% → **±5% 마진 ≤ 6.30%** (소수점 둘째 자리)
  - venus sun 대비 px 비 strict ≤ 11% → **±5% 마진 ≤ 11.55%**
  - 모바일 누적 disk area ≤ 25% (보존)
- **근거**: forensic 측정 식 `pxDiameter = renderRadius × scale × focalLength / cameraDistance × viewportPx` 의 1차 비례에서 LOD billboard 전환 임계 영역 비선형 효과 + Babylon `Vector3.Project` 부동소수 정밀도 합산 노이즈 마진. architect 라운드 2 cross-validate Claude 자체 재분석 (2) 박제값 안전 여유 평가의 직접 적용
- **r1-pixel-diff-guard ADR amendment 동반 갱신**: `docs/decisions/20260425-r1-ui-pixel-diff-guard.md` Amendment 2026-05-01 §"--measure-px-ratio strict 임계 ±5% 마진 SSoT 박제" (별도 amendment 박제)

### 사용자 D-T2 부분 통과 평가 박제

| D-T2 항목                                  | 평가          | 박제                                                                                                                                                                                                                                                                                  |
| ------------------------------------------ | ------------- | ------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| #1 비율 자연 인지                          | **부분 통과** | 어제 (mercury ~12% / venus ~25%) 대비 명백한 개선 ✓. 단 사용자 보고 "실제 비율적으론 아직 맞지 않는 듯" — venus > mercury 사실 비율 (`6052/2440 = 2.48배`) 미충족 (라운드 2 박제값 venus/mercury = `(6052×650)/(2440×900) = 1.79배`, 사실 비율의 72%)                                 |
| #2 모바일 (375×667)                        | 미보고        | 사용자 평가 항목 누락 — qa headless 검증 PASS 로 대체 (모바일 누적 disk area 16.60% / ≤ 25% PASS, sun + mercury + venus 모두 visible 박제)                                                                                                                                            |
| #3 shortcut-bar focus 전환                 | 미보고        | qa headless 인터랙션 PASS 로 대체. #378 (focus 허공) 회귀 미관찰                                                                                                                                                                                                                      |
| #4 strict 임계 amendment                   | 통과          | 본 amendment 로 ±5% 마진 SSoT 승격 박제                                                                                                                                                                                                                                               |
| **신규 회귀 — 행성 겹침 시 그래픽 사각형** | **발견**      | Image #1 (`/Users/seo/Desktop/스크린샷 2026-05-01 오후 4.02.01.png`) 화면 중앙 작은 노란 사각형 (5-10px) — sun 또는 행성이 LOD billboard fallback. 트리거: 행성 시각적 겹침 (depth sorting / LOD 임계). #379 (모바일 사각형) 의 데스크톱 + 행성 겹침 변형으로 박제 → #379 코멘트 추가 |

### 결정 (라운드 2 SSoT 종결, 라운드 3 후속 분리)

본 forensic ADR 라운드 2 SSoT 는 **PR #384 머지로 종결**. 사용자 D-T2 미충족 항목 (venus > mercury 사실 비율 미달) 은 **별도 라운드 3 후속 이슈** 로 분리 — `[#373 후속] 비율 정밀화 라운드 3 — venus > mercury 사실 비율 강화` (priority:medium).

#### 분리 근거 (volt #30 Phase 분리 릴리스 리듬 적용)

- **backward-compat**: 라운드 2 박제값 (mercury 900 / venus 650) 만 머지돼도 어제 대비 개선됨 ✓
- **완결 Behavior Change 집합**: sun 50 / mercury 900 / venus 650 + r1-guard `--measure-px-ratio` ±5% 마진 + R1/R2/R3 ADR amendment 라운드 2 — 단일 PR 로 일관된 릴리스 단위
- **다음 라운드 점진 릴리스 리듬**: 라운드 3 (사실 비율 강화) 은 별도 사용자 D-T2 라운드 + 신규 회귀 (#379 변형) fix 와 직교 진입

#### 비-범위 박제

- **신규 회귀 (행성 겹침 사각형)**: 본 PR 직교 — #379 (모바일 사각형) 의 데스크톱 + 행성 겹침 변형 박제로 분리 (sunScale 50 영향 + LOD billboard 메커니즘 확장)
- **사실 비율 정밀화**: 본 PR 직교 — 라운드 3 신규 이슈로 분리. 후보 박제값:
  - **(D-1)** mercury 700 / venus 800 → venus/mercury = `(6052×800)/(2440×700) = 2.83배` (사실 비율 114%)
  - **(D-2)** mercury 600 / venus 700 → venus/mercury = `(6052×700)/(2440×600) = 2.89배` (사실 비율 117%)
  - **(D-3)** mercury 800 / venus 900 → venus/mercury = `(6052×900)/(2440×800) = 2.79배` (사실 비율 113%)
  - 우선순위: D-2 ~ D-1 (사실 비율 110~120% 안전 영역, 모바일 누적 disk area ≤ 25% 가드 통과 검증 의무)

### 후속 이슈 분리 박제 명세

- **라운드 3 비율 정밀화** (신규 이슈, priority:medium) — venus > mercury 사실 비율 (2.48배) 의 100~120% 도달 박제값 채택. architect → developer → qa → 사용자 D-T2 표준 흐름. Builds on: #373
- **신규 회귀 #379 갱신** (기존 이슈 코멘트 추가) — 데스크톱 + 행성 겹침 트리거 변형 박제. sunScale 50 영향 직접 입증
- **사전 부채 lint 2건 fix** (신규 이슈, priority:low) — `lod-dev-overlay.tsx:44` setState in effect / `use-osculating-sync.ts:8` import() type. PR #384 qa 단계에서 발견된 사전 부채 (본 PR 범위 외)

### Cross-validate (라운드 2 D-T2 결과)

생략 — 본 amendment 는 사용자 D-T2 결과 박제 + 분리 결정 (정책·ADR 자체 변경 없음). 라운드 3 신규 이슈 architect 단계 진입 시 cross-validate 의무 박제 (정책·ADR amendment 박제 직후 루틴, CLAUDE.md "교차검증" 섹션).

---

## Amendment 2026-05-03 (라운드 3) — 사실 비율 강화 박제값 결정 (mercury 900→700 / venus 650→800)

> **상태**: 라운드 2 박제값 (mercury 900 / venus 650) 의 사실 비율 도달률 72% 미충족. #385 이슈 architect 단계 진입.
> **선행**: 본 ADR Amendment 2026-05-01 (라운드 2 SSoT 종결 + #385 분리), Amendment 2026-05-01 (라운드 2 박제값) §"비-범위 박제" 후보 D-1/D-2/D-3.
> **트리거**: 사용자 D-T2 (PR #384, 2026-05-01) "전체적인 비율은 개선됨 / 실제 비율적으론 아직 맞지 않는 듯" 부분 통과 → venus > mercury 사실 비율 (2.48배) 강화 의무.

### 결정

- `sunScale: 50` 그대로 유지 (라운드 1/2 보존)
- `mercuryScale: 900 → 700` (사실 비율 강화 D-1)
- `venusScale: 650 → 800` (사실 비율 강화 D-1)

### D-1 / D-2 / D-3 후보 비교 (architect 분석)

#### 비교 표

| 후보  | mercuryScale | venusScale | 사실 비율 도달률 | mercury 저점 pxD (1280×720, dpr=1, far) | mercury 4px 마진 | venus 고점 pxD (1920×1080, dpr=2, close) | LOD 일관성                       | 모바일 누적 disk area |
| ----- | ------------ | ---------- | ---------------- | --------------------------------------- | ---------------- | ---------------------------------------- | -------------------------------- | --------------------- |
| **D-1** | 700          | 800        | 114%             | **5.29 px (low)**                       | **+1.29 px**     | 48.4 px (mid 한계)                       | venus mid 일관 유지 (high 미진입) | **16.75%**            |
| D-2   | 600          | 700        | 117%             | **4.53 px (low)**                       | +0.53 px         | 42.3 px (mid)                            | mid 일관 유지                    | 15.66%                |
| D-3   | 800          | 900        | 113%             | 6.04 px (low)                           | +2.04 px         | 54.4 px (**high 진입**)                  | venus high/mid 전환 (viewport별) | 17.99%                |

**산출 근거** (선형 비례 — `pxDiameter ∝ scale`, Phase 1 식 정정 PR #390 후 Phase 2 forensic baseline `docs/reports/391-forensic/output.json` SSoT):

- Phase 2 baseline (라운드 2): mercury 6.80~21.5 / venus 12.39~39.3 (16 cell × 측정).
- D-1: mercury × (700/900) = 0.778 / venus × (800/650) = 1.231
- D-2: mercury × (600/900) = 0.667 / venus × (700/650) = 1.077
- D-3: mercury × (800/900) = 0.889 / venus × (900/650) = 1.385

**모바일 누적 disk area** (375×667 baseline, scale² 면적 비례): mercury 1.94% × (newScale/900)² + venus 2.19% × (newScale/650)² + sun 12.26% (변동 없음).

#### 채택 — **D-1 (mercury 700 / venus 800)**

**근거 — 4축 평가**:

1. **사실 비율 도달률** (이슈 본문 우선순위 110~120% 안전 영역): D-1 114% / D-2 117% / D-3 113%. 세 후보 모두 통과. D-2 가 가장 근접하나 안전 마진 (다음 축) 에서 탈락.
2. **PR #394 Phase 2 4px fallback 안전 마진** (CRITICAL): mercury 저점 (`1280×720, dpr=1, far`) 이 4px 임계와 떨어진 거리.
   - D-2 0.53px — **측정 노이즈 / floating-point 정밀도 / camera distance 변동** 으로 < 4px 떨어지면 사각형 quad 회귀 (#379 fix 무효화)
   - D-1 1.29px — D-2 의 **2.43배** 마진. measure-px-ratio ±5% 마진 (라운드 2 SSoT) 과 정합
   - D-3 2.04px — D-1 의 1.58배 마진, 가장 안전. 그러나 다음 축에서 탈락
3. **LOD 일관성**: PR #394 Phase 2 alpha mask 정책은 mid sphere (12세그) ↔ low billboard (alpha mask quad) 전환이 시각적 일관. 그러나 high (32세그 sphere) ↔ mid (12세그) 전환은 segment 차이 + lighting 차이로 **viewport 별 시각 변동** 가시화.
   - D-3 venus 고점 54.4px > high 임계 50 — **viewport 따라 high ↔ mid 전환 발생**. dpr=1 환경에서는 mid, dpr=2 close 에서는 high. 사용자 인지 시각 일관성 저하.
   - D-1 venus 고점 48.4px — high 임계 미달, **모든 viewport mid 일관**. 색상·세그먼트·lighting 변동 0.
4. **모바일 누적 disk area** (가드 ≤ 25%): 세 후보 모두 통과. D-1 16.75% (마진 8.25%p), D-2 15.66% (9.34%p), D-3 17.99% (7.01%p). D-1 은 D-3 보다 안전.

**결정 우선순위**: 4px fallback 안전 마진 (안정성) > LOD 일관성 (시각 품질) > 사실 비율 도달률 (사용자 평가). D-1 이 안정성 + 일관성 + 사실 비율 도달 모두 만족하는 유일 후보.

**기각 근거**:

- D-2: 4px 마진 0.53px 이 측정 노이즈 흡수 부족. 노이즈로 < 4px 떨어지면 PR #394 Phase 2 가 사각형 quad 로 fallback (사용자 D-T2 의 #1 회귀 재발). 사실 비율 117% 의 +3%p 이득보다 안정성 손실이 큼.
- D-3: 사실 비율 113% (D-1 대비 -1%p) 이지만 venus high/mid 전환으로 viewport 별 시각 변동 (dpr=2 close 에서 32세그 sphere, dpr=1 에서 12세그 sphere). 사용자 D-T2 가 "viewport 일관 자연 비율" 을 평가하므로 negative.

### 라운드 3 D-T2 px 비 예측 박제

#### 1280×720 (데스크톱 viewport, 표준 평가 기준)

| 항목                | 라운드 2 (현행) | 라운드 3 D-1 (예측)               | DoD 임계 (라운드 2 SSoT ±5% 마진) |
| ------------------- | --------------- | --------------------------------- | --------------------------------- |
| sun pxDiameter      | 246 px          | 246 px (변동 없음)                | -                                 |
| mercury pxDiameter  | ~14.9 px        | **~11.6 px** (예측, 900→700 비례) | -                                 |
| mercury sun 대비 비 | ~6.07%          | **~4.71%** (예측)                 | **≤ 4.95% (기존 6.30 → 라운드 3 신규)** |
| venus pxDiameter    | ~27.2 px        | **~33.5 px** (예측, 650→800 비례) | -                                 |
| venus sun 대비 비   | ~11.03%         | **~13.58%** (예측)                | **≤ 14.26% (기존 11.55 → 라운드 3 신규)** |

**임계 갱신 근거**: 라운드 3 박제값이 사실 비율 강화 목표로 **mercury 인하 + venus 인상** 의 비대칭 변화를 동반. 라운드 2 SSoT (mercury ≤ 6.30 / venus ≤ 11.55) 는 D-1 이 자연 통과 (4.71 < 6.30) 하지만 venus 13.58 > 11.55 로 strict FAIL. 따라서 r1-guard `--measure-px-ratio` 임계 자체를 라운드 3 박제값에 맞춰 ±5% 마진 SSoT 로 갱신.

- mercury 임계: ~4.71 × 1.05 ≈ **4.95%** (소수점 둘째 자리 보수 라운딩, 박제값 700 의 통과 목표)
- venus 임계: ~13.58 × 1.05 ≈ **14.26%** (박제값 800 의 통과 목표)

±5% 마진은 라운드 2 amendment SSoT (forensic 측정 식 1차 비례 + Vector3.Project 부동소수 정밀도 합산 노이즈) 그대로 적용.

#### 모바일 누적 disk area 재계산 (예측)

라운드 2 baseline (375×667 viewport): sun 12.26% / mercury 1.94% / venus 2.19% / 누적 16.39%.

라운드 3 D-1 적용 시 (scale² 면적 비례):

- sun: 12.26% (변동 없음)
- mercury: 1.94% × (700/900)² ≈ **1.17%**
- venus: 2.19% × (800/650)² ≈ **3.32%**
- **누적: ~16.75%** (≤ 25% 가드 통과, 마진 8.25%p)

### LOD 영향 분석 (PR #394 Phase 2 forensic baseline 기준)

#### Phase 2 baseline (라운드 2 박제값) 재현

`docs/reports/391-forensic/output.json` 16 cell 매트릭스:

- mercury low: 5/16 (저 viewport / 저 dpr / 원거리 우세)
- mercury mid: 11/16
- venus low: 3/16
- venus mid: 13/16
- sun high: 16/16 (Phase 1 fix 후 100% 회복)

#### 라운드 3 D-1 예측

- mercury 저점 5.29 px / 고점 16.7 px — **mid 임계 8 미달 영역 확대 예상** (16 cell 중 ~10/16 low 추산, 라운드 2 baseline 대비 +5/16 cell low 증가)
- venus 저점 15.3 px / 고점 48.4 px — **모든 cell mid 진입 예상** (라운드 2 의 3/16 low 가 0/16 으로 개선)
- sun: 변동 없음 (16/16 high)

**시각 영향**:
- mercury low 비율 증가 → PR #394 Phase 2 의 alpha mask 가 더 자주 적용됨 (정상 fallback 경로). 4px ≤ pxD 영역에서 원형 disc 인지 (사용자 D-T1 회귀 #2 fix 영역).
- venus low → mid 회복 → sphere mesh 인지 강화 (사용자 D-T2 평가 시 "venus 가 더 크고 실제 행성 같음" 인지 강화).
- 종합: 사용자 D-T2 의 "venus > mercury 사실 비율" 인지가 mercury 인하 + venus 인상 + venus mid 회복의 **3중 경로** 로 강화.

### r1-guard `--measure-px-ratio` 임계 갱신 SSoT

`apps/web/scripts/r1-ui-regression-guard.mjs` `PX_RATIO_THRESHOLDS`:

```js
// 라운드 2 (현행)
const PX_RATIO_THRESHOLDS = Object.freeze({
  mercury: 6,   // 라운드 2 strict (마진 적용 전)
  venus: 11,
});

// 라운드 3 D-1 (목표)
const PX_RATIO_THRESHOLDS = Object.freeze({
  mercury: 4.95,  // 라운드 3 박제값 700 의 ±5% 마진 (예측 4.71 + 5%)
  venus: 14.26,   // 라운드 3 박제값 800 의 ±5% 마진 (예측 13.58 + 5%)
});
```

**기존 ±5% 마진 정책 SSoT 보존**: 라운드 2 amendment 의 "박제값 ±5% 측정 노이즈 마진" 정책은 그대로. 박제값 변경에 따라 임계만 갱신.

### Concrete Prediction (D-1 채택 시)

1. **r1-guard `--measure-px-ratio` 통과 예측**: mercury 실측 ~4.71% (≤ 4.95% 통과), venus 실측 ~13.58% (≤ 14.26% 통과). 측정 노이즈 ±5% 안에서 통과.
2. **모바일 누적 disk area**: 실측 ~16.75% (≤ 25% 가드 통과). 라운드 2 (16.39%) 대비 +0.36%p 증가.
3. **LOD 영향**: mercury low 비율 ~5/16 → ~10/16 증가, venus low ~3/16 → 0/16 감소. PR #394 Phase 2 alpha mask 가 더 자주 적용 (정상 fallback). 4px fallback (사각형 quad) 트리거 0/16 cell (저점 5.29 > 4 마진 1.29).
4. **사용자 D-T2 #1 비율 인지**: venus 33.5px / mercury 11.6px = **2.89배 시각비** (사실 비율 2.48배의 **117%**). 사용자 인지 임계 (사실 비율 ±20%) 안에서 자연 인지.

### 회귀 가드 (developer 단계 의무)

1. **r1-guard `--measure-px-ratio` 임계 갱신**: 위 SSoT 따라 mercury 4.95 / venus 14.26 박제. ±5% 마진 보존. 예측 vs 실측 일치 검증.
2. **`apps/web/src/constants/body-scale.ts` 갱신**: mercury 900→700, venus 650→800. 주석 SSoT 갱신 (라운드 3 박제값 + ADR amendment 링크).
3. **`apps/web/src/constants/body-scale.test.ts` 갱신**: 단위 테스트 박제값 정확 일치 (mercury 700 / venus 800).
4. **PR #394 Phase 2 4px fallback 회귀 가드** (NEW): qa headless 매트릭스에서 mercury 저점이 4px 미만으로 떨어지지 않는지 확인. `docs/reports/391-forensic/output.json` 의 1280×720 dpr=1 far cell 에서 mercury pxDiameter ≥ 4 + 2σ 마진 (예측 5.29) 검증.
5. **CHANGELOG `### Behavior Changes`**: "수성/금성 시각 비율 사실 비율 강화 (라운드 3, D-1 채택). venus/mercury 시각비 1.79배 → ~2.89배 (사실 비율 72% → 117%). r1-guard `--measure-px-ratio` 임계 갱신 (mercury 6 → 4.95, venus 11 → 14.26)."

### §재검토 트리거 라운드 3

라운드 1/2 amendment 의 §재검토 트리거 5건 보존. 라운드 3 결과로 **§재검토 트리거 #1 (D-T2 미통과)** 의 후속 행동 갱신:

- 라운드 3 D-1 적용 후 D-T2 미통과 시 다음 적극값 후보:
  - **(a)** D-2 (mercury 600 / venus 700) — 사실 비율 117% 이지만 mercury 4px 마진 0.53px 위험. PR #394 Phase 2 alpha mask 4px fallback 측정 노이즈 보강 선행 의무 (Phase 3 ADR 분리)
  - **(b)** 옵션 (e) log scaling — #375 우선순위 high 승격
  - **(c)** D-3 (mercury 800 / venus 900) + venus high/mid 전환 fix — high LOD threshold 동적 조정 ADR 분리
- D-T2 통과 시 본 amendment 박제값 (mercury 700 / venus 800) 이 R3 #373 라운드 3 SSoT 종결값
- venus 고점 48.4px 가 high 임계 50 직전이므로 **PR #394 Phase 2 와 PR #390 Phase 1 측정 결과의 ±5% 변동** 으로 high 진입 시 LOD 일관성 영향 검증 의무

### R4 (지구 + 달) 진입 전제 정합성

R4 viewport-aware scaling ADR (Gemini R3 권고 1, `docs/decisions/20260429-r3-venus-visualization.md` cross-validate 고유 발견 1) 와 라운드 3 박제값 정합성:

- R4 진입 시 earth + moon 박제값 신규 결정 — 본 amendment 의 `mercury 700 / venus 800` 은 **R4 박제값과 직교** (Concrete Prediction 1 의 "1줄 추가 패턴" 보존)
- 사실 비율 (`earth/venus = 6371/6052 ≈ 1.053배`, `moon/earth = 1737/6371 ≈ 0.273배`) 산출 시 venus 800 baseline 기준 — earth 박제값은 venus × 1.053 ≈ 800 ~ 850 범위 추정 가능 (R4 ADR 단계 정밀화)
- viewport-aware scaling (Gemini 권고) 은 R4+ 에서만 도입 검토 — 본 라운드 3 은 정적 박제값 보존 (viewport-aware 도입 시 라운드 1~3 박제값 모두 SSoT 변경). 본 amendment 는 viewport-aware 도입 전제 변경 없음

### 비-범위 (라운드 3, 라운드 1/2 보존)

- 본 architect 라운드 3 코드 변경 0 — body-scale.ts / body-scale.test.ts / r1-ui-regression-guard.mjs 직접 수정 금지 (developer 단계 책임)
- sunScale 50 그대로 유지 (라운드 1/2 보존)
- 옵션 (e) log scaling — 후속 이슈 분리 보존 (라운드 3 D-T2 미통과 시 우선순위 high 승격)
- viewport-aware scaling — R4 ADR 단계로 분리 보존 (본 amendment 는 정적 박제값만)
- DoD 변경 금지 (CRITICAL #6) — 이슈 본문 D-T2 5종 그대로
- PR #394 Phase 2 alpha mask 정책 변경 금지 — 4px fallback 임계 / opacityTexture 토글 그대로 (라운드 3 박제값이 4px 마진 1.29px 안전 영역 진입 검증)

### Cross-validate (라운드 3)

본 amendment 박제 직후 cross-validate 1회 의무 (CLAUDE.md "교차검증 박제 직후 루틴", anchor=`ADR 신규·개정/폐기`). Claude 자체 편향 4종 셀프 체크 (호출 전):

- **낙관적 일정**: D-1 채택 후 developer 단계 단순 (3개 파일 박제값 갱신) — 통과
- **결합 간과**: PR #394 Phase 2 alpha mask 4px fallback 의 측정 노이즈 결합을 mercury 4px 마진 1.29px 로 박제 — 통과
- **폐기 프레이밍**: D-2 / D-3 기각 근거 명시 (4px 마진 부족 / LOD 일관성) — 통과
- **순수주의**: 사실 비율 100% (정확한 venus/mercury = 2.48배) 가 아닌 117% (D-1) 채택은 LOD 임계 + 4px fallback + 측정 노이즈의 **3중 trade-off 결과** — 사용자 인지 임계 (±20%) 안에서 정합. 통과

호출 프롬프트에 명시 질문: "D-1 (mercury 700 / venus 800) 이 D-2 / D-3 보다 우월하다는 4px fallback 안전 마진 + LOD 일관성 분석 근거가 타당한가? 라운드 2 SSoT (±5% 마진) 의 라운드 3 박제값에 대한 자동 갱신 (mercury 6 → 4.95 / venus 11 → 14.26) 이 정합한가?"

cross-validate 결과 박제 위치: 본 amendment §"### Cross-validate 결과 (라운드 3)" 서브섹션 (architect.md §교차검증 반영 사항 SSoT 4종 분류).

### Cross-validate 결과 (라운드 3, Gemini 2.5 Pro, 2026-05-03, outcome=applied)

- **호출**: `.claude/skills/cross-validate/scripts/cross_validate.sh architecture docs/decisions/20260430-r3-followup-body-proportion.md`
- **로그**: `.claude/logs/cross-validate-architecture-20260503-144335.log`
- **outcome JSON**: `.claude/logs/cross-validate-architecture-20260503-144335-outcome.json` (`outcome=applied`, `exit_code=0`, `reminder_issue=none`)

#### Gemini 응답 요약 (총평 6 항목)

| 검증 기준        | Gemini 평가                | 핵심 의견                                                                  |
| ---------------- | -------------------------- | -------------------------------------------------------------------------- |
| 1. 구조적 완성도 | **Exemplary**              | 문제 정의 → 해결 → 검증 → 인계 모든 단계 누락 없이 구조화. 모범적 사례     |
| 2. 기술 결정 타당성 | **Exemplary**              | 데이터 기반 분석 + 합리적 옵션 비교 + 점진 개선 전략 모두 훌륭            |
| 3. 인터페이스 명확성 | **Excellent**              | 개발자 인계 + 자동화 검증(Guard) 명세 명확. 협업 오류 최소화              |
| 4. 확장성        | **Excellent**              | 단기/장기 분리 + R-Phase 정책 개선 (Q2=B 비례 결정)                       |
| 5. 보안          | **Not Applicable**         | 시각적 표현 결정. 보안 관련 사항 없음                                     |
| 6. 누락 요소     | **Excellent**              | 자체 cross-validate + 사용자 D-T2 피드백 루프로 누락 요소 자체 발견       |

라운드 3 D-1 채택에 대한 Gemini 직접 평가 (인용): *"4px fallback 안전 마진과 LOD 일관성을 기준으로 D-1을 채택한 것은 안정성을 우선하는 훌륭한 엔지니어링 트레이드오프 결정"*.

#### Claude 재분석 (volt #23 / #29 기각·수용 프로토콜)

##### 합의 (3 항목, 본 PR 박제 즉시 반영 — 라운드 3 amendment 본문 자체에 이미 포함)

1. **D-1 채택 4축 평가의 안정성 우선 trade-off** — Gemini "안정성을 우선하는 훌륭한 엔지니어링 trade-off 결정" 직접 동의. 4px fallback 마진 + LOD 일관성 + 사실 비율 도달률 + 모바일 disk area 4축이 적정 trade-off
2. **r1-guard `--measure-px-ratio` 임계 갱신 SSoT 자동화** — Gemini "자동화된 회귀 테스트(계약)로 전환한 훌륭한 사례" 동의. ±5% 마진 정책 보존 + 박제값별 임계 자동 갱신 (mercury 6 → 4.95 / venus 11 → 14.26) 정합
3. **Phase 분리 릴리스 리듬 (라운드 1/2/3) 의 점진 품질 개선 + 릴리스 리듬 유지** — Gemini "성숙한 모습" 직접 동의. 사실 비율 강화 라운드 3 분리가 backward-compat + 완결 Behavior Change + 점진 릴리스 3조건 충족

##### 이견 수용

없음. Gemini 응답에 D-1 채택 / r1-guard 임계 갱신 / 라운드 3 분리에 대한 이견 없음.

##### Claude 재분석으로 기각한 Gemini 제안

1. **경영진/비개발자 Executive Summary 추가** — Gemini 개선 제안 1.
   - Claude 재분석: 본 프로젝트 (astro-simulator) 는 1인 개발자 - AI 페어 프로그래밍 컨텍스트. 이해관계자는 사용자 단일이며 D-T2 사용자 평가가 곧 사용자 인지 임계 박제. ADR 의 1차 독자는 architect / developer / qa sub-agent (즉 AI 자신) 이고 Executive Summary 의 가치는 낮음
   - 기각 근거: 본 ADR 의 §"배경" 첫 1~2 문단 자체가 이미 "왜 이 ADR 이 존재하는가" 의 압축 요약 역할 수행. 별도 Executive Summary 추가 시 SSoT 중복 + 동기화 부담 증가 (라운드 4 amendment 시 본문 + Executive Summary 두 곳 갱신 의무)
   - volt #51 (외부 툴 주장 실측 가드) 적용: Gemini 가 generic ADR 모범 사례를 추천하나 본 프로젝트 컨텍스트에서 부적합

##### 고유 발견 (1 항목, 후속 분리)

1. **forensic-adr-template.md 자산화** — Gemini 개선 제안 2. 본 ADR 의 forensic + Amendment 라운드 + cross-validate 박제 + 발화점 추적 구조를 템플릿화하여 다른 복잡한 문제 해결에 재사용
   - Claude 평가: 가치 있는 제안. **본 amendment 범위 밖** (이슈 #385 의 비-범위 = 사실 비율 정밀화. ADR 템플릿 자산화는 직교 인프라 작업)
   - 후속 이슈 분리 권장: priority:low — `[infra] forensic ADR 템플릿 자산화 — 살아있는 ADR 구조 재사용 가능화` (Builds on: #385)
   - 분리 박제 규칙 (volt #29 3단 프로토콜): 본 ADR 의 §배경 + §Amendment 다중 라운드 + §"Cross-validate 결과" + §"§재검토 트리거" 4섹션 구조를 템플릿 SSoT 로 추출

##### 핵심 평가 축 (1)~(6) 에 대한 Claude 자체 재분석 결론

- (1) 구조적 완성도: Gemini Exemplary 동의. forensic 측정 결과 박제 + 라운드 1/2/3 진화 + cross-validate 박제 + 사용자 D-T2 피드백 루프 모두 SSoT 추적 가능
- (2) 기술 결정 타당성: Gemini Exemplary 동의. 데이터 기반 (Phase 2 forensic baseline 16 cell × 4px fallback 마진 산출) + 4축 trade-off 명시
- (3) 인터페이스 명확성: Gemini Excellent 동의. developer 인계 §회귀 가드 5 항목 + r1-guard 임계 SSoT 갱신 명세
- (4) 확장성: Gemini Excellent 동의. R4 (지구 + 달) 진입 전제 정합성 §"R4 진입 전제 정합성" 박제. 라운드 1~3 SSoT 가 R4+ 박제값과 직교 (Concrete Prediction 1 의 1줄 추가 패턴 보존)
- (5) 보안: Gemini Not Applicable 동의
- (6) 누락 요소: Gemini Excellent 동의. cross-validate 자체가 누락 발견 메커니즘으로 작동 (forensic-adr-template 자산화 고유 발견)

#### 임계 비례 역산 + 4px fallback 안전 마진 PASS/FAIL 판정

라운드 3 D-1 채택 근거 (architect 자체 분석) 가 cross-validate 결과로 검증됨:

- **임계 비례 역산** (라운드 2 SSoT 보존): mercury 4.95% / venus 14.26% 임계는 박제값 × ±5% 마진 자동 산출. 정합 PASS
- **4px fallback 안전 마진**: D-1 mercury 저점 5.29 px (마진 1.29 px) 이 D-2 (0.53 px) 의 2.43배 안전. 측정 노이즈 흡수 가능. PASS
- **LOD 일관성**: D-1 venus 고점 48.4 px 가 high 임계 50 직전 (마진 1.6 px). 모든 viewport mid 일관 유지. PASS

#### 라운드 3 박제값 안전 여유 평가

- **mercury 4px fallback 마진 1.29 px** — Phase 2 forensic baseline 의 측정 노이즈 ±5% (~0.34 px) 안에서 안전
- **venus high 임계 미진입 마진 1.6 px** — Phase 2 forensic baseline 의 dpr=2 close 환경 ±5% (~2.4 px) 마진 일부 잠식 가능. 단, mid (12세그) ↔ high (32세그) 전환 자체가 4px fallback (사각형 quad) 만큼의 회귀는 아니므로 acceptable
- **모바일 누적 disk area 16.75% (마진 8.25%p)** — 충분 안전

#### 발견된 이슈 박제 종합

- **본 PR 즉시 반영**: 합의 3 항목 (D-1 채택 4축, r1-guard 임계 갱신 SSoT, 라운드 3 분리 릴리스)
- **본 PR 기각**: Executive Summary 추가 (1인 개발자 컨텍스트 부적합)
- **후속 이슈 분리**: forensic-adr-template 자산화 (priority:low, infra 작업)
