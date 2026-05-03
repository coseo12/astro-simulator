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
 * R4~R10 추가 시 본 룩업에 1줄 추가만으로 처리 (Concrete Prediction —
 * `docs/decisions/20260425-r1-sun-visualization.md` §결과·재검토 조건 +
 * `docs/decisions/20260428-r2-mercury-visualization.md` §결과·재검토 조건 +
 * `docs/decisions/20260429-r3-venus-visualization.md` §결과·재검토 조건).
 */
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 50, // Amendment 2026-05-01 — 75 → 50 (R3 D-T2 가드 발견 #1, 옵션 a). 라운드 1/2/3 보존
  mercury: 700, // Amendment 2026-05-03 라운드 3 — 900 → 700 (옵션 c D-1, 사실 비율 강화, sun 대비 px 비 ~4.71%)
  venus: 800, // Amendment 2026-05-03 라운드 3 — 650 → 800 (옵션 c D-1, 사실 비율 강화, sun 대비 px 비 ~13.58%)
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
