/**
 * R1 #329 — body 별 시각 과장 배수.
 *
 * P12 §원칙 §1 "상대 비율 = 실측 고정" 폐기 결정
 * (`docs/deprecated/decisions/20260423-display-relative-scale-unification.md`) 의 첫 적용.
 *
 * 적용 지점: `createBodyMesh*` 에서 `diameter = body.radius × 2 × renderScale × scale`.
 * 실측 데이터 (body.radius, solar-system.json) 자체는 변경 없음.
 *
 * 1.0 = 실측 그대로. > 1 = 시각 과장. < 1 은 R1 비-범위.
 *
 * Amendment 2026-05-01 (#373 D-T2 가드 발견 #1, 라운드 2 적극 재조정):
 *   - sunScale 75 → 50 (옵션 a 채택, R1 ADR Amendment 2026-05-01)
 *   - mercuryScale 8500 → 900 (옵션 c 적극 재조정 라운드 2, R2 ADR Amendment 2026-05-01 라운드 2)
 *   - venusScale 4000 → 650 (옵션 c 적극 재조정 라운드 2, R3 ADR Amendment 2026-05-01 라운드 2)
 *   - 근거 SSoT: docs/decisions/20260430-r3-followup-body-proportion.md Amendment 2026-05-01 (라운드 2)
 *
 * Amendment 2026-05-03 (#385 라운드 3 — venus > mercury 사실 비율 강화 D-1):
 *   - sunScale 50 (변동 없음, 라운드 1/2/3 보존)
 *   - mercuryScale 900 → 700 (옵션 c D-1, 사실 비율 강화)
 *   - venusScale 650 → 800 (옵션 c D-1, 사실 비율 강화)
 *   - venus/mercury 시각비 1.79배 → 2.83배, 사실 비율 도달률 72% → 114%
 *   - 4축 평가 (사실 비율 도달률 / 4px fallback 안전 마진 / LOD 일관성 / 모바일 누적 disk area) D-1 채택
 *   - 근거 SSoT: docs/decisions/20260430-r3-followup-body-proportion.md Amendment 2026-05-03 (라운드 3)
 *
 * R1 baseline (Amendment 2026-05-01 — sunScale 50, T1 solar / camera radius=35 / fov=0.8 rad):
 *   sun = 50 → pixel diameter ≈ 246px (1280×720), brightRatio ≈ 1.86%, diskAreaRatio ≈ 5.17%
 *             pixel diameter ≈ 246px (1920×1080) viewport 무관 (renderScale × camera 고정)
 *             pixel diameter ≈ 228px (375×667), brightRatio ≈ 5.88% (모바일 인지 가능)
 *
 * R2 baseline (Amendment 2026-05-03 라운드 3 — mercuryScale 700):
 *   mercury = 700 → sun 대비 px 비 ≈ 4.71% (DoD 임계 ≤ 4.95% 통과 목표, ±5% 마진 정책 보존)
 *                  저점 pxDiameter ≈ 5.29 px (4px fallback 마진 +1.29 px)
 *                  ADR: docs/decisions/20260428-r2-mercury-visualization.md Amendment 2026-05-03 (라운드 3)
 *
 * R3 baseline (Amendment 2026-05-03 라운드 3 — venusScale 800):
 *   venus = 800 → sun 대비 px 비 ≈ 13.58% (DoD 임계 ≤ 14.26% 통과 목표, ±5% 마진 정책 보존)
 *                고점 pxDiameter ≈ 48.4 px (mid 임계 50 미만 → mid 일관 유지)
 *                ADR: docs/decisions/20260429-r3-venus-visualization.md Amendment 2026-05-03 (라운드 3)
 *
 * R4 baseline (#532 — earthScale 800 / moonScale 800, Q2=B SSoT 첫 본 인스턴스화):
 *   earth = 800 → sun 대비 px 비 ≈ 14.67% (DoD 임계 ≤ 15% margin 0.33%, ±2% 마진 정책 보존)
 *                예상 pxDiameter ≈ 36.1 px (1280×720)
 *                ADR: docs/decisions/20260520-r4-earth-moon-visualization.md §결정 1
 *   moon  = 800 → sun 대비 px 비 ≈ 3.99% (DoD 임계 ≤ 4.5% margin 0.51%, ±2% 마진 정책 보존)
 *                예상 pxDiameter ≈ 9.84 px (1280×720), moon/earth 비 27.2% 사실 정합
 *                ADR: docs/decisions/20260520-r4-earth-moon-visualization.md §결정 2
 *
 * R5 baseline (#594 — marsScale 800 / phobosScale 5000 / deimosScale 5000, Q2=B 2번째 본 인스턴스화):
 *   mars   = 800 → sun 대비 px 비 ≈ 7.81% (DoD 임계 ≤ 8% margin 0.19%, ±2% 마진 정책 보존)
 *                예상 pxDiameter ≈ 11.10 px (1280×720), mars/earth 비 53.2% 사실 정합 (53.3% 정확 일치)
 *                ADR: docs/decisions/20260528-r5-mars-visualization.md §결정 1
 *   phobos = 5000 → 사실 비율 (radius 0.326%) 명시 위배. moon Amendment 4 학습 적용 —
 *                  사실 비율 깨고 사용자 천문 직관 우선. mesh pxDiameter ≈ 0.226 px (4px fallback
 *                  billboard 100% 의존, LOD Phase 2 #391). Q2=B 임계 미적용 (§결정 6).
 *                  ADR: docs/decisions/20260528-r5-mars-visualization.md §결정 2
 *   deimos = 5000 → 사실 비율 (radius 0.185%) 명시 위배. phobos 와 동일값 (단순 + mental model
 *                  "phobos ≈ deimos"). mesh pxDiameter ≈ 0.128 px (4px fallback 의존).
 *                  ADR: docs/decisions/20260528-r5-mars-visualization.md §결정 3
 *
 * R8 baseline (#647 — uranusScale 250 / titaniaScale 500, ice giant 정책 신설 — 3번째 scale 그룹):
 *   uranus  = 250 → 사실 비율 (sun 의 3.67%) 명시 위배 + earth 대비 직관 우선 (PM 제약
 *                  "천왕성 > 지구" — 실반경 4.007배). 거성 예외 48 답습 시 px 8.69 (earth 의
 *                  0.24배) 로 제약 위반. 예상 pxDiameter ≈ 45.24 px (1280×720, mid LOD 50px
 *                  미만 margin 4.76px) / sunPxRatio 식 18.37% / uranus/earth px 비 1.25.
 *                  ⚠️ uranus > jupiter(24.3px)/saturn(20.5px) 시각 역전은 PM 제약의 수학적
 *                  필연 (ADR §위험 #1 — 회귀 보고 시 PM 재합의 라운드 필수, 단독 조정 금지).
 *                  ADR: docs/decisions/20260610-r8-uranus-titania-rings-visualization.md §축 1
 *   titania = 500 → titania/uranus mesh 비 0.0617 (moon/earth 0.068 / titan/saturn 0.089
 *                  수렴대 0.05~0.09 정중앙). titan=100 답습 시 0.0123 과소 — uranus(250) 가
 *                  gas giant(48) 의 5.2배라 satellite scale 동반 상향. mesh 2.79 px →
 *                  4px fallback billboard 의존 (LOD Phase 2 #391 흡수). ADR §축 3
 *
 * R6~R10 추가 시 본 룩업에 1줄 추가만으로 처리 (Concrete Prediction —
 * `docs/decisions/20260425-r1-sun-visualization.md` §결과·재검토 조건 +
 * `docs/decisions/20260428-r2-mercury-visualization.md` §결과·재검토 조건 +
 * `docs/decisions/20260429-r3-venus-visualization.md` §결과·재검토 조건 +
 * `docs/decisions/20260520-r4-earth-moon-visualization.md` §Concrete Prediction +
 * `docs/decisions/20260528-r5-mars-visualization.md` §Concrete Prediction).
 */
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 50, // Amendment 2026-05-01 — 75 → 50 (R3 D-T2 가드 발견 #1, 옵션 a). 라운드 1/2/3 보존
  mercury: 700, // Amendment 2026-05-03 라운드 3 — 900 → 700 (옵션 c D-1, 사실 비율 강화, sun 대비 px 비 ~4.71%)
  venus: 800, // Amendment 2026-05-03 라운드 3 — 650 → 800 (옵션 c D-1, 사실 비율 강화, sun 대비 px 비 ~13.58%)
  earth: 800, // R4 #532 — venus 동일값 (radius 1.054배 사실 비율 정합, sun 대비 px 비 ~14.67%)
  moon: 200, // R4 #539 Amendment 4 (2026-05-23) — 사실 비율 (×800) D-T2 시각 인지 mismatch ("비정상적으로 큼"). earth 의 6.8% (mesh radius 3.475e8 m) 로 축소 — 사실 비율 깨지지만 사용자 천문 직관 정합. moon sun 대비 px 비 ~1.12% (Amendment 1 임계 5% 안)
  mars: 800, // R5 #594 — earth 와 동일값 (radius 53.3% 사실 비율 정합 시각 53.2% 정확 일치, sun 대비 px 비 ~7.81%, Q2=B 임계 ≤ 8% margin 0.19%)
  phobos: 5000, // R5 #594 — 사실 비율 (radius 0.326%) 명시 위배. moon Amendment 4 학습 — 사용자 천문 직관 우선. 4px fallback billboard 의존 (mesh 0.226 px sub-pixel, LOD Phase 2 #391)
  deimos: 5000, // R5 #594 — 사실 비율 (radius 0.185%) 명시 위배. phobos 동일값 (mental model "phobos ≈ deimos"). 4px fallback 의존 (mesh 0.128 px)
  jupiter: 48, // R6 #621 — PM Q2=B 임계 완화 (거성 예외). sun 대비 px 비 ~9.87% (≤ 10% margin 0.13%), mesh visible 24.3px. 사실 비율 jupiter/sun=10.276% 정합 우선
  io: 100, // R6 #627 옵션 D (사용자 D-T2 합의 2026-06-06: 300→200→100). galilean/jupiter 비율 0.053 (moon/earth 0.068 정합). 4px fallback billboard 의존 (mesh sub-pixel, LOD Phase 2 #391 흡수)
  europa: 100, // R6 #627 옵션 D — 비율 0.046 (io 동일값, mental model "galilean 균일")
  ganymede: 100, // R6 #627 옵션 D — 비율 0.077 (태양계 최대 위성, moon 0.068 의 1.13배). 사실 크기 순서 보존
  callisto: 100, // R6 #627 옵션 D — 비율 0.070. galilean 4개 moon 비율 근접 — 사용자 "목성 대비 적당" 합의
  saturn: 48, // R7 #641 — jupiter 동일값 (거성 예외 2번째 인스턴스, "가스 거성 = scale 48" 단일 mental model). saturn/jupiter mesh 비 0.843 = 사실 radius 비 정확 보존 (R5 mars=earth=800 선례 동형). sun 대비 px 비 ~8.32% (식, Q2=B 거성 임계 ≤ 8.5% margin 0.18%), mesh visible 20.5px. ADR 20260610-r7 §축 1
  titan: 100, // R7 #641 — galilean 최종값 (R6 Amendment 2) 답습 (300→200→100 iteration 건너뛰고 수렴값 시작). titan/saturn 비 0.089 (moon/earth 0.068 근접, ganymede-class 0.978배). 4px fallback billboard 의존 (mesh 1.82px). ADR 20260610-r7 §축 3
  uranus: 250, // R8 #647 — ice giant 정책 신설 (3번째 scale 그룹). 사실 비율 (sun 3.67%) 명시 위배 + earth 대비 직관 우선 (PM 제약 "천왕성 > 지구", 실반경 4.007배). px 45.24 / uranus/earth 비 1.25 / mid LOD 50px 미만 (margin 4.76px). jupiter/saturn 시각 역전은 의식적 수용 (ADR 20260610-r8 §축 1 + §위험 #1)
  titania: 500, // R8 #647 — titania/uranus mesh 비 0.0617 (moon/earth 0.068 수렴대). titan=100 답습 시 0.0123 과소 (uranus 250 이 gas giant 48 의 5.2배). 4px fallback billboard 의존 (mesh 2.79px). ADR 20260610-r8 §축 3
});

/** 미정의 body id 의 기본 배수. 1.0 = 실측 그대로. */
const DEFAULT_BODY_SCALE = 1.0;

/**
 * body id 의 시각 과장 배수 조회. 미정의 시 1.0 (실측).
 *
 * R2~R10 에서 다른 body 추가 시 본 룩업에 1줄 추가만으로 처리. 호출 코드 변경 0
 * (Concrete Prediction — ADR `20260425-r1-sun-visualization.md` §결과·재검토 조건).
 *
 * **사용처**:
 *   - `apps/web/src/components/sim-canvas.tsx` 의 `createSolarSystemScene` 옵션 `bodyScale` 콜백
 *   - `apps/web/src/components/panels/celestial-info-panel.tsx` 의 "× N 과장 중" tooltip
 */
export function getBodyScale(bodyId: string): number {
  return BODY_SCALE[bodyId] ?? DEFAULT_BODY_SCALE;
}
