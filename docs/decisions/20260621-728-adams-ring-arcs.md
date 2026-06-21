# ADR: 해왕성 Adams ring arcs — 각도(azimuthal) density 변조 시각화

- **상태**: **Provisional** (신규 시각 feature ADR — cross-validate 후 §교차검증 반영 사항 통합 시 Accepted 전이. ADR Status 워크플로 #370 옵션 C: cross-validate 발동 ADR 의무)
- **날짜**: 2026-06-21
- **결정자**: architect (#728 설계 라운드. PM 라운드 미수행 — 본 ADR 이 범위/타당성 제안 → 사용자 D-T2 확인)
- **관련**:
  - [#728](https://github.com/coseo12/astro-simulator/issues/728) (본 스프린트 — Adams ring arcs)
  - [`20260610-r9-neptune-triton-rings-visualization.md`](20260610-r9-neptune-triton-rings-visualization.md) (**SSoT — 본 ADR 의 직접 모체**. §위험 #3 + §재검토 트리거 #8 "각도 density 인프라 후속 분리" 를 본 ADR 이 이행. PM Q2 "균질 근사 수용 — 후속 비-범위" 의 후속 라운드)
  - [`20260621-725-giant-moons-oberon-proteus.md`](20260621-725-giant-moons-oberon-proteus.md) (proteus 궤도 = Adams ring outer mesh 바로 밖 마진 1.64x — arc 변조의 무회귀 대상. §축 4 cross-link)
  - [`20260420-p9-galilean-laplace-rings.md`](20260420-p9-galilean-laplace-rings.md) (ring shader 원형 — `densityProfile` uniform + GLSL 선형 보간 §결정 #2)
  - [`20260610-r7-saturn-titan-rings-visualization.md`](20260610-r7-saturn-titan-rings-visualization.md) (composite layer 패턴 + `ringAlphaHint` §축 2c)
  - [`docs/architecture/principles.md`](../architecture/principles.md) §1 Visual Fidelity (#541 의무 체크리스트 4항목 — 데이터 SSoT 보존 + rendering 왜곡 허용)
  - 용어: [`docs/glossary.md`](../glossary.md) (R-Phase / Tier / D-T2 / densityProfile)

---

## 배경

해왕성 Adams ring 은 R9(#653)에서 **연속 full ring (균질 환형)** 으로 렌더되었다. R9 ADR §위험 #3 / §재검토 트리거 #8 은 이를 **의도된 근사 (PM Q2 합의)** 로 명시 박제하고, 실제 Adams ring 의 특징인 5개 밝은 호(arc) — Fraternité / Égalité 1·2 / Liberté / Courage — 의 **각도 방향 density 인프라를 후속 이슈로 분리**했다. #728 이 그 후속이다.

본 ADR 은 **신규 시각 feature 이며 정립된 패턴이 없다** (위성 추가 #721/#725 의 데이터-주도 답습과 다름). 따라서 architect 의 1차 의무는 **타당성 판단** 이다:

1. 현재 ring 이 **shader 인가 mesh 인가** — azimuthal 변조 추가 가능성이 여기에 강하게 의존
2. arc 가 **화면에서 실제로 보이는가** — ring 자체가 작은데 arc 는 그 일부 (measurement-first)
3. 구현 가치 vs 복잡도 — niche feature 이므로 과설계 경계

### 코드 사실 실측 (설계 전제)

| 사실                               | 실측 결과                                                                                                                                                                                          | 출처                                     |
| ---------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | ---------------------------------------- |
| **ring 렌더 방식**                 | **shader (Babylon `ShaderMaterial` + `CreateDisc` mesh)**                                                                                                                                          | `packages/core/src/scene/ring-shader.ts` |
| **fragment shader azimuthal 접근** | **가능** — `varying vec2 vUV` 가 disc UV `[0,1]×[0,1]`. 현재 `r = length(vUV - vec2(0.5))` 로 **방사** 만 사용. azimuthal angle = `atan(vUV.y - 0.5, vUV.x - 0.5)` 로 fragment 에서 직접 계산 가능 | `ring-shader.ts` L103/L141~L154          |
| **alpha 계산 위치**                | fragment shader `gl_FragColor = vec4(color * d, alpha)`, `alpha = clamp(d * ringAlpha, 0, 1)`                                                                                                      | `ring-shader.ts` L153~L154               |
| **disc tessellation**              | `DISC_TESSELLATION = 96` (세그먼트당 3.75°). **단, alpha 변조는 per-fragment 라 tessellation 무관** — geometry 가 아닌 fragment alpha 변조이므로 arc 경계는 atan2 연속값으로 부드러움              | `ring-shader.ts` L50                     |
| **neptune.rings 구조**             | **1 composite layer** (`main`, inner 41,000 ~ outer 62,930 km). Adams = outer 경계 @densityProfile r_norm 1.0 (밀도 1.0 피크)                                                                      | `solar-system.json` L640~L661            |
| **fallback 경로**                  | M1 `InstancedMesh` (rejection sampling, `?ring=fallback`). 본 경로는 각도 균등 (`theta = random × 2π`) — arc 미지원                                                                                | `ring-shader.ts` L348~L421               |
| **proteus 궤도 정합**              | proteus visual orbit = Adams ring outer mesh 의 **마진 1.64x 바로 밖** (×220 per-body). arc 변조는 ring 의 inner/outer/disc 반경을 **불변** 으로 두므로 궤도-ring 분리 마진 **구조적 무영향**      | `20260621-725` §축 4, L210~L234          |

**핵심 발견**: ring 이 **shader-based** 이고 fragment 에서 azimuthal angle 접근이 자유롭다 → arc 변조가 **mesh 추가 없이 fragment alpha 곱셈 1개로 가능**. R9 ADR 이 "방사 densityProfile 은 각도 방향 표현 불가" 라 한 것은 _현재 데이터/shader 가 방사만 쓴다_ 는 의미이지 _shader 구조상 불가능_ 이 아니다. 본 ADR 의 핵심 정정.

### Adams arc 가시성 실측 (measurement-first — `_debug-728-arc-feasibility.mjs`, 즉시 rm)

Voyager 2 (1989) 관측 기준 5 arc 각폭 + R9 ring px 반경 대역(36~44px, 중앙값 40px 가정)으로 화면 arc-length 산출:

| arc               | 각폭(°)                            | 화면 arc-length (ring px반경 40px 가정) | 가시성                 |
| ----------------- | ---------------------------------- | --------------------------------------- | ---------------------- |
| Courage           | ~1                                 | 0.70 px                                 | **sub-pixel (비가시)** |
| Égalité 1         | ~2                                 | 1.40 px                                 | sub-pixel 경계         |
| Liberté           | ~4                                 | 2.79 px                                 | 경계                   |
| Égalité 2         | ~4                                 | 2.79 px                                 | 경계                   |
| Fraternité        | ~10                                | 6.98 px                                 | 가시                   |
| **클러스터 전체** | **~47° span (Courage~Fraternité)** | **~32.8 px (둘레의 13%)**               | **명확히 가시**        |

**판정**: 개별 arc 5개를 각각 해상(resolve)하는 것은 **R9 의 narrow-ring sub-pixel 문제와 동형** — 우라누스 9개 ring / 해왕성 5층을 1 composite 로 합성한 그 논리가 arc 에도 그대로 적용된다. 개별 arc 는 sub-pixel, 그러나 **밝은 arc 클러스터(~47° 호) vs 어두운 나머지(~313°)** 의 대조는 명확히 가시(둘레의 ~13%). → **5 arc 개별 해상이 아닌 "밝은 호 영역 vs 어두운 나머지" 의 azimuthal density bump 로 설계** (R9 composite 철학 일관).

---

## 후보 비교

### 축 1 — arc 구현 방식

| 후보                                                | 장점                                                                                                                                                           | 단점                                                                                                                                          | fps/복잡도                                       |
| --------------------------------------------------- | -------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------ |
| **(a) 기존 shader 에 azimuthal alpha 변조 추가** ✅ | ring 이 shader 라 **fragment 1곳에 azimuthal factor 곱셈** 추가뿐. 신규 mesh 0, draw call 0 증가. R9 composite 철학 일관. arc 경계 per-fragment 연속(부드러움) | shader uniform 추가(arc 중심/폭 배열) + fragment 로직 추가 (코어 ~15~25 라인). fallback(InstancedMesh) 경로는 별도 처리 또는 미지원 명시 필요 | **최저 비용** — per-fragment 1 곱셈, draw 증가 0 |
| (b) 별도 arc mesh 5개 (arc segment)                 | arc 별 독립 제어 (색/밝기)                                                                                                                                     | mesh +5, draw call +5, arc 위치/폭 geometry 생성, ring 과 z-fighting 위험, disc 와 별개 좌표계 관리. 개별 arc sub-pixel 이라 5개 분리 무의미  | 높음 — niche feature 에 과설계                   |
| (c) ring alpha texture (azimuthal LUT)              | 임의 arc 프로파일 표현                                                                                                                                         | 텍스처 생성/바인딩 인프라 신규, 데이터 SSoT 가 텍스처로 이동(JSON 이탈), Adams 외 ring 무영향인데 인프라만 무거움                             | 중간 — 표현력 과잉, SSoT 훼손                    |

**선택: (a)** — ring 이 shader-based 이고 fragment 에서 azimuthal angle 접근이 자유로운 실측 사실이 (a) 를 압도적으로 정당화. (b)/(c) 는 개별 arc 가 sub-pixel 인 가시성 실측과 충돌(분리 해상 무의미) + niche feature 대비 과설계.

### 축 2 — arc density 표현 단위 (개별 5 arc vs 클러스터 bump)

| 후보                                                            | 장점                                                                                                                                  | 단점                                                                                          |
| --------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------- |
| (i) 5 arc 개별 azimuthal 피크                                   | 천문학적 명목 충실 (5 arc 명시)                                                                                                       | 개별 arc 0.7~2.8px sub-pixel → 화면에서 분리 안 됨. R9 narrow-ring 분리 기각 논리와 동일 함정 |
| **(ii) 밝은 arc 클러스터 1~2 bump (Fraternité+나머지 묶음)** ✅ | 가시 단위(~47° span 32.8px)와 정합. R9 composite 철학 일관 (개별 sub-pixel → 가시 aggregate). 데이터 단순(중심 longitude + 폭 + 밝기) | 5 arc 명목이 데이터에 개별 표기 안 됨 → `$comment` 주석 계약으로 5 arc 실측 출처 박제         |

**선택: (ii)** — 가시성 실측이 (i)를 기각. **단 데이터 SSoT 는 5 arc 실측 longitude/폭을 `$comment` 에 전부 박제** 하고, 렌더는 가시 클러스터로 aggregate (R9 의 "12점 densityProfile 에 5 ring 피크 박제 + 가시 합성" 과 동형).

### 축 3 — arc 데이터 출처 / Tier 표기

| 항목               | 값                                                               | Tier / 출처                                          |
| ------------------ | ---------------------------------------------------------------- | ---------------------------------------------------- |
| arc 개수 (명목)    | 5 (Fraternité / Égalité 1·2 / Liberté / Courage)                 | **T1 (관측)** — Voyager 2 (1989) PDS / Hubble / Keck |
| arc 클러스터 span  | ~33~40° (관측에 따라 변동, Courage~Fraternité)                   | T1, 단 **시간 변동** (아래 ⚠️)                       |
| 개별 arc 각폭      | Fraternité ~10° / Liberté ~4° / Égalité 1·2 ~2°/4° / Courage ~1° | T1 (Voyager 2)                                       |
| arc 절대 longitude | corotating frame 기준 — 정적 스냅샷 (J2000 부근)                 | **T2 (시간 변동값 — 정적 근사)**                     |

> ⚠️ **arc 는 시간 진화한다 (fading)** — Liberté 와 Courage 는 1989(Voyager)→2000s(Keck/Hubble) 사이 밝기가 크게 감소(Courage 는 leading 방향으로 ~8° 이동, Liberté 급감). 본 ADR 은 **정적 스냅샷** (단일 시각 arc 위치) 만 표현하며 **arc 시간 진화(공명 역학)는 비-범위**. 데이터 `$comment` 에 "관측 시각 + arc 는 fading 중 — 정적 근사" 명시 박제 의무 (R9 triton 역행 / Adams 균질근사 사전등록 패턴 답습 — D-T2 "왜 5 arc 가 다 안 보임/시간에 안 변함" 오인 선제 차단).

### 축 4 — 가시성 우려 (architect 명시, dev 실측 대상)

- ring px 반경(36~44px, R9 §축 2) 에서 **개별 arc 는 sub-pixel** (위 표). → 클러스터 aggregate 렌더 필수 (축 2 (ii) 결론).
- neptune 은 default solar view(30.07 AU)에서 **off-screen 가능성 높음** (R9 §축 2a 주석). arc 는 **neptune focus(tier=body) 진입 시에만 가시** — DoD 의 가시 시나리오는 focus 한정 명시.
- arc 밝기 대조: `ringAlphaHint 0.7` (dusty 어두운 ring) 에서 arc bump 가 너무 미세하면 비가시 위험. **arc 영역 밝기 배율(예: arc ×1.5~2.0, 나머지 ×0.3~0.5)** 은 dev 가 D-T2 실측으로 조정 (R9 §재검토 #3 ringAlphaHint 조정 패턴 답습).
- **measurement-first 의무**: dev 가 실 neptune focus 에서 (1) ring outer px 반경 (2) arc 클러스터 px arc-length (3) arc bright vs dark 대조 가시 여부를 `_debug-728-tmp.mjs` (즉시 rm) 로 실측 후 밝기 배율 확정. architect 의 40px 가정은 추정이며 실측이 SSoT.

---

## 결정

### 결정 1 — arc 변조 방식: 기존 ring shader 에 azimuthal alpha factor 추가 (축 1 (a))

`ring-shader.ts` FRAGMENT_SHADER 의 alpha 계산에 **azimuthal density factor** 를 곱한다. 신규 mesh / draw call 0.

```
// (구현 스케치 — dev 가 결정, 본 ADR 은 구조만)
float azimuth = atan(vUV.y - 0.5, vUV.x - 0.5);  // [-π, π]
float azFactor = azimuthalDensity(azimuth);       // arc 영역 1.0, 나머지 darkFactor
float alpha = clamp(d * ringAlpha * azFactor, 0.0, 1.0);
gl_FragColor = vec4(color * d * azFactor, alpha);
```

- azimuthal density 는 **layer 단위 opt-in** — 기존 ring 층(jupiter/saturn/uranus + neptune 다른 가상 층 없음)은 azFactor 미적용 시 **1.0 (무회귀)**. neptune `main` 층만 arc 데이터 보유 시 변조.
- **fallback(InstancedMesh) 경로**: arc 미지원 명시 (rejection sampling 의 균등 theta 를 arc 가중으로 바꾸는 것은 별도 작업). `?ring=fallback` 은 회귀 검증용 비주류 경로이므로 **arc 균질 = 의도된 한계** 로 주석 박제 (R9 fallback 무arc 동형).

### 결정 2 — arc density 표현: 밝은 클러스터 aggregate (축 2 (ii))

5 arc 를 개별 해상하지 않고 **밝은 arc 클러스터(~47° span) 1~2개 azimuthal bump** 로 표현. 5 arc 실측 longitude/폭은 **데이터 `$comment` 에 전부 박제** (SSoT 보존), 렌더는 가시 aggregate.

- arc 데이터 스키마: ring layer 에 optional `arcs` 필드 추가 — `[{ centerDeg, widthDeg, brightness }]` 형태(dev 가 zod 스키마 확정). 미지정 층은 균질(무회귀).
- **darkFactor** (arc 밖 밝기 배율) + **arc brightness** 는 D-T2 실측 조정값 (초안: 나머지 0.35, arc 1.0~1.5).

### 결정 3 — Tier 표기 + 시간 진화 비-범위 (축 3)

- 5 arc 명목 = **T1(관측, Voyager 2 1989)**, 절대 longitude = **T2(시간 변동 — 정적 스냅샷 근사)**.
- **비-범위**: arc 시간 진화(fading / 공명 역학 / Galatea 38:39 공명 corotation), 다른 행성 ring arc, fallback 경로 arc.
- 데이터 `$comment` 에 관측 시각 + "arc 는 fading 중 — 정적 근사" + Galatea 공명 출처 박제 의무.

### 결정 4 — 무회귀 (축 4 + #725 정합)

- Adams ring **full 구조(inner/outer/disc 반경) 불변** — arc 는 fragment alpha 곱셈만. ring geometry 무변경 → **proteus(마진 1.64x)/triton 궤도 분리 구조적 무회귀**.
- 다른 ring 층(jupiter faint / saturn / uranus 세로 고리) azFactor 미적용 → alpha 무변경 (r1-guard baseline 무회귀).
- **r1-guard pixel-diff**: neptune 은 default solar view off-screen 가능성 높아 baseline 변화 예상 0. 변화 시 `--update` + PR 본문 스크린샷 박제 (R9 §축 2a 절차 답습).

---

## 결과 / 재검토 조건

### 기대 효과 (측정 가능)

1. neptune focus(tier=body)에서 Adams ring 의 **밝은 호 영역(~47° span)이 어두운 나머지와 명확히 대조** (D-T2 실 Chrome). arc bright/dark 밝기비 ≥ 2:1 (D-T2 조정).
2. 5 arc 실측 데이터(longitude/폭) `$comment` SSoT 박제 — T1/T2 Tier 표기.
3. Adams ring full 구조 / proteus(1.64x)·triton 궤도 / 다른 ring 층 **무회귀** (구조적 — geometry 불변).
4. jupiter/saturn/uranus ring **alpha 무변경** (azFactor 미적용 = 1.0).

### 트레이드오프로 받아들인 비용

- 개별 5 arc 분리 해상 포기(sub-pixel) → 클러스터 aggregate (천문학적 명목은 `$comment` 로 보존).
- arc 시간 진화(fading) 미표현 → 정적 스냅샷 근사 (D-T2 사전 등록).
- fallback(InstancedMesh) 경로 arc 미지원 → 비주류 검증 경로 한계 명시.

### Concrete Prediction

- **arc 변조 추가 시 변경 범위 예측**:
  - **shader 로직** (`ring-shader.ts`): **신규 ~15~30 라인** (fragment azFactor + uniform `arcCenters[]`/`arcWidths[]`/`darkFactor` + material.setFloats). **신규 mesh / draw call 0**.
  - **scene 배선** (`solar-system-scene.ts`): ring layer 의 `arcs` 데이터를 shader 옵션으로 전달 — **~5~10 라인** (조건부 uniform 주입).
  - **데이터** (`solar-system.json`): neptune `main` ring layer 에 `arcs` 필드 + `$comment` — **데이터만**.
  - **loader 스키마** (`solar-system-loader.ts`): optional `arcs` zod 스키마 + `LoadedRingLayer.arcs` — **~10 라인**.
  - **검증 방법**: `git diff --stat packages/` — ring 외 모듈(camera/tier/orbit/picking) 변경 **0** 이면 "arc 가 ring shader 국소 확장으로 흡수됨" 입증. proteus/triton orbit 상수 변경 **0** 이면 무회귀 구조적 확인.
  - **실패 시 대응**: ring 외 모듈 변경 발생 시 azimuthal 변조가 shader 국소화 안 됨 → ADR Amendment 박제 + 구조 재검토.
- **이 ADR 은 Concrete Prediction "코드 0" 이 아니라 "코드 국소화"** — 신규 시각 feature 이므로 shader 로직 추가는 불가피(데이터-주도 위성 추가와 다름). 예측의 핵심은 **변경이 ring shader + 데이터 + 스키마에 국소화** 되고 ring 외 모듈에 누출 안 됨.

### 재검토 트리거 (Amendment 발동)

1. **arc 비가시 / 과미세** (D-T2) — arc brightness/darkFactor 조정 (나머지 0.35→0.5, arc 1.0→1.5). ringAlphaHint 0.7 동반 상향 가능 (R9 §재검토 #3 연계).
2. **arc 가 ring 자체를 깸 / full 구조 손상** (D-T2) — azFactor 적용 범위 정정 (neptune main 층 한정 확인). 다른 ring 층 회귀 시 즉시 azFactor opt-in 격리.
3. **proteus/triton 궤도 회귀** — 구조적 무회귀 예측 실패 → geometry 변경 누출 의심, ring inner/outer 불변 재확인.
4. **r1-guard pixel-diff 회귀** (neptune 외 body) — azFactor 가 다른 ring 에 누출. opt-in 격리 검증.
5. **5 arc 개별 해상 요구** (사용자) — px 반경 충분(고해상 / zoom-in)할 때 클러스터→개별 bump 분리. 단 sub-pixel 실측 재확인 후 (volt #32 측정 우선).
6. **arc 시간 진화 표현 요구** (사용자) — 공명 역학(Galatea corotation) 후속 이슈 분리 (본 ADR 비-범위 불변).

---

## 타당성 결론 (architect 판단)

**진행 권고 (간소화된 범위)** — NO-OP 아님.

- **근거 1 (정당한 후속)**: R9 ADR §위험 #3 + §재검토 #8 이 "각도 density 인프라 후속 분리" 를 명시 박제한 **계획된 후속**. PM Q2 가 R9 에서 균질 근사를 수용하며 후속을 예고했고, #728 이 그 이행. 인계 항목 실측 재검증 결과 **여전히 미해소** (Adams 균질 렌더 현존) → NO-OP 부적격.
- **근거 2 (저비용 — 과설계 아님)**: ring 이 **shader-based** 이고 fragment 에서 azimuthal angle 접근이 자유로운 실측 사실 → arc 변조가 **fragment alpha 곱셈 + 데이터/스키마 국소 확장** 으로 가능(신규 mesh/draw 0). R9 ADR 의 "방사 densityProfile 은 각도 표현 불가" 는 _현재 데이터 한계_ 이지 _shader 구조 한계_ 가 아님 — 본 ADR 의 핵심 정정. mesh-only 였다면 (b)/(c) 가 비싸 간소화/NO-OP 를 권고했을 것이나, **shader 라 저비용 진행이 정당**.
- **근거 3 (간소화)**: 개별 5 arc 는 sub-pixel(0.7~2.8px) → R9 narrow-ring 분리 기각 논리 답습. **5 arc 개별 해상이 아닌 밝은 클러스터 aggregate(~47° span 32.8px) 로 간소화**. 5 arc 실측은 `$comment` SSoT 보존. arc 시간 진화는 비-범위(정적 스냅샷).

**과설계 경계선**: niche feature 이므로 (b) 별도 mesh 5개 / (c) 텍스처 인프라는 명시적으로 기각. arc 시간 진화 / Galatea 공명 역학 / 다른 행성 arc 는 비-범위로 못박음.

---

## 참고

- Adams ring arcs: Voyager 2 (1989) PDS Ring-Moon Systems Node / Hubble·Keck 후속 관측 (arc fading)
- Galatea 42:43(또는 38:39 corotation eccentricity) 공명 — arc 유지 메커니즘
- NASA Neptune Fact Sheet / JPL Ring-Moon Systems Node (ring 반경 SSoT — R9 박제값)
- ring shader 원형: `packages/core/src/scene/ring-shader.ts` (P9 #254 PR-2.5)
