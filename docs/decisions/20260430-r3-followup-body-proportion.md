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
5. **r1-guard `--measure-px-ratio` 신설** — sun 대비 mercury/venus 의 px diameter 비 측정 + 박제. 회귀 가드 (예: mercury px 비 ≤ 25%, venus px 비 ≤ 30%)

   **명세 (cross-validate 고유 발견 #1 amendment, 2026-04-30)**:
   - 측정 기준: sun mesh px diameter 를 100% 로 정규화. mercury / venus / (R4+ 추가 body) 의 px diameter / sun px diameter ratio 산출
   - 측정 viewport: 1280×720 (default SSoT), 1920×1080 (보조 — viewport 무관 비율 유지 검증), 375×667 (모바일 — UX 침습성 검증)
   - 허용 오차: 박제값 ± 5% (사용자 D-T2 검증 후 ±10% 허용 여부 재논의 가능)
   - body 별 임계 (옵션 c 채택 시 초안): mercury ≤ 25%, venus ≤ 30%. fix PR 시 `_debug-373-proportion-tmp.mjs` 재실행 결과로 실측값 박제 (gerald 동반 amendment v5)
   - 출력 형식: r1-guard JSON 의 `pxRatios: { mercury: <value>, venus: <value>, ... }` 필드 추가

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
