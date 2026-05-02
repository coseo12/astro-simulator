# #379 Forensic 측정 리포트 — body 사각형 회귀

**측정 일시**: 2026-05-02 (PR #384 머지 후, sunScale 50 / mercuryScale 900 / venusScale 650 SSoT)
**측정 도구**: `scripts/_debug-379-forensic-tmp.mjs` (volt #67 일회성 debug 스크립트, 측정 후 삭제)
**baseline 박제값**: PR #384 1f0c369 (#373 라운드 2 머지)

## 측정 매트릭스

- viewport 5종 × DPR 2종 × 카메라 거리 4종 = **40 cell** (모두 OK)
- viewport: 320×568 (mobile-narrow) / 375×667 (mobile) / 414×896 (mobile-wide) / 1440×900 (desktop) / 1920×1080 (desktop-wide)
- DPR: 1.0 / 2.0
- 카메라 거리: close (radius=15) / mid (radius=35, T1 default) / far (radius=70) / overview (radius=150)

## DoD-Forensic-1 결과 요약 (40/40)

| viewport  | DPR | 거리      | sun variant | mercury variant | venus variant | lodStats                |
| --------- | --- | --------- | ----------- | --------------- | ------------- | ----------------------- |
| 320×568   | 1.0 | 모든 거리 | **low**     | **low**         | **low**       | high=1 / mid=0 / low=23 |
| 320×568   | 2.0 | 모든 거리 | **low**     | **low**         | **low**       | high=1 / mid=0 / low=23 |
| 375×667   | 1.0 | 모든 거리 | **low**     | **low**         | **low**       | high=1 / mid=0 / low=23 |
| 375×667   | 2.0 | 모든 거리 | **low**     | **low**         | **low**       | high=1 / mid=0 / low=23 |
| 414×896   | 1.0 | 모든 거리 | **low**     | **low**         | **low**       | high=1 / mid=0 / low=23 |
| 414×896   | 2.0 | 모든 거리 | **low**     | **low**         | **low**       | high=1 / mid=0 / low=23 |
| 1440×900  | 1.0 | 모든 거리 | **low**     | **low**         | **low**       | high=1 / mid=0 / low=23 |
| 1440×900  | 2.0 | 모든 거리 | **low**     | **low**         | **low**       | high=1 / mid=0 / low=23 |
| 1920×1080 | 1.0 | 모든 거리 | **low**     | **low**         | **low**       | high=1 / mid=0 / low=23 |
| 1920×1080 | 2.0 | 모든 거리 | **low**     | **low**         | **low**       | high=1 / mid=0 / low=23 |

**핵심 발견**: 24개 body 중 23개가 `low` (billboard plane), 단 1개만 `high`. 즉 거의 모든 body 가 사각형 fallback.

## DoD-Forensic-2 — Trigger 분류

- **Trigger A (모바일)**: 24/24 cell (mobile-narrow + mobile + mobile-wide × DPR 2 × 거리 4) **재현률 100%**
- **Trigger B (데스크톱)**: 16/16 cell (desktop + desktop-wide × DPR 2 × 거리 4) **재현률 100%**
- 사용자 D-T2 보고 (모바일 사각형 + 데스크톱 행성 겹침 사각형) **forensic 으로 완전 재현**

## 메커니즘 분석 — sun 도 low 로 떨어지는 원리

### LOD 분기 식 (`packages/core/src/render/lod.ts`)

```
lodFromScreenCoverage(input):
  1. URL override 우선 (auto 면 자동 판정)
  2. focus body 면 high 강제
  3. body-kind 강제 규칙 (LOD_BODY_THRESHOLDS):
     - star (sun): cameraDistanceMeters < 1 AU 이면 high 강제
     - planet-terrestrial (mercury/venus): cameraDistanceMeters < 5 × R_body 이면 high 강제
  4. screenCoverage 픽셀 경계: ≥50 → high, 8~50 → mid, <8 → low (billboard)
```

### sun 의 사례 분석 (T1 default 환경)

T1 renderScale = 8.4e-11 (m → scene unit). 카메라 ArcRotate radius=35 (scene unit).
카메라 → sun 실세계 거리 = `35 / 8.4e-11 ≈ 4.17e11 m ≈ 2.79 AU` ⇒ **kind 강제 (`<1 AU`) 실패**.

이론값 (#373 라운드 2 박제값 sunScale=50, R=6.96e8 m):

- `wsRadius = R × renderScale × bodyScale = 6.96e8 × 8.4e-11 × 50 ≈ 2.92 unit`
- `pxDiameter ≈ wsRadius × 2 × focalLengthPx / cameraDistanceSceneUnit`
  - viewport=720, fov=0.8 rad → focalLengthPx = 720 × 1.182 ≈ 851
  - pxDiameter ≈ 2.92 × 2 × 851 / 35 ≈ 142 (coverage radius ≈ 71)
- → 이론적으로 high (≥50) 분기 진입 **예상**.

그러나 forensic 측정값: sun = `low` 일관 (40/40). **이론과 실측의 큰 괴리**.

#### 예상 원인 (architect 가설 — developer 단계 재검증 필요)

1. **카메라 globalPosition 기반 distance 계산이 scene unit → m 환산에서 잘못 환산**: `solar-system-scene.ts:868` `metersPerSceneUnit = 1 / sceneUnitPerMeter` 식이 T1 인 경우 매우 큰 값. body 거리 계산이 floating origin 적용된 local 좌표 + origin 합산이라 origin 의 m 단위가 정확해야 함. T3 body tier 진입 시 origin 전환에서 float32 잘림 가능
2. **screenCoverageRadius 의 ArrayLike viewProjMatrix 인덱싱 잘못**: `mulMat4Point` 가 m[col*4+row] 가정인데 Babylon `scene.getTransformMatrix().m` 의 row-major 여부 (라인 207-209 주석에서도 "혼동 주의" 명시) — 실제 Babylon `.m` 의 메모리 레이아웃과 indexing 식의 정합성 재확인 필요. 잘못 indexing 시 ndcEdgeY-ndcCenterY 차이가 0 근처 → **coverage = 0 → 항상 low**
3. **screenCoverageRadius 가 effective_radius 로 `body.radius × bodyScale × renderScale` 을 받는데, 라인 169-176 의 sx/sy/sz 계산이 또 한번 renderScale 을 곱함**: `bodyLocalPos[0] * renderScale` — 이게 body local 좌표가 이미 m 단위이므로 sceneUnit 환산용. 하지만 `bodyRadiusMeters * renderScale` 도 같은 전제 → ok 일 듯 (이중 곱셈은 아님)

가설 1, 2 가 가장 유력. **developer 단계에서 일회성 debug 로그 (per-body coverage 출력) 로 실측 값 확정 필요**.

### lodStats high=1 의 정체

24 body 중 1개만 high. **focus body** 가설:

- `lodFromScreenCoverage` 의 `isFocused=true` 가 coverage 무관 high 강제 (ADR §미해결 3)
- default 진입 시 focus body 가 sun 또는 다른 body 일 수 있음 — sun_focus 면 sun 이 high 여야 하는데 forensic 결과 sun=low. 모순.

다른 해석: **billboard plane 의 parent (high mesh)** 가 `setEnabled(true)` 인데 `isVisible=false` 로 세팅된 상태. lodStats 집계가 어떤 body 를 high 로 인식하는지 — `runLodPass` 의 `bodyCurrentLod` 와 `lodStats` 집계는 **결정 결과 (nextLevel)** 기준이므로 24 body 중 1개만 high 결정. 어떤 body 인지는 데이터에 별도 노출 안 됨 — developer 단계에서 추가 측정 필요.

## 결론 — Fix 결정의 forensic 근거

1. **사용자 D-T2 보고 100% 재현** — 모든 viewport / DPR / 거리에서 sun 포함 거의 모든 body 가 billboard plane fallback
2. **PR #384 머지 (#373 라운드 2) 직후 박제 — sunScale 50 / mercuryScale 900 / venusScale 650 환경에서 발생**
3. **이론값 (sun pxDiameter≈142, mercury≈12.5, venus≈22) 과 실측 LOD 결정 (모두 low) 의 괴리** — `screenCoverageRadius` 또는 카메라 거리 계산에 bug 가능성 의심
4. **fix 결정 ADR 의 후보 비교에서 (a) LOD 임계 재조정 만으로는 불충분** — 임계가 8/50 인데 measure 가 0 근처면 임계만 낮춰도 효과 없음. **(b) billboard 비활성화 또는 (e) LOD 정책 자체 재설계 + screenCoverage 식 검증** 이 우선

## 산출물

- `output.json` — 40 cell 매트릭스 raw data + trigger 분류
- `<viewport>_dpr<n>_<distance>.png` × 40 — 각 cell 스크린샷 (사각형 회귀 시각 박제)
- `README.md` (본 문서)

## 후속 단계 (developer 단계 인계)

- `runLodPass` 진입 시 첫 5 frame 동안 sun/mercury/venus 의 `screenCoverageRadius` 결과값 + cameraDistanceMeters 를 console.log 박제하는 일회성 debug 추가
- 실측 결과로 **bug 가설 1, 2 확정 또는 기각** 후 fix decision ADR 의 결정 재확인
