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
 * R1 baseline (Amendment 2026-05-01 — sunScale 50, T1 solar / camera radius=35 / fov=0.8 rad):
 *   sun = 50 → pixel diameter ≈ 246px (1280×720), brightRatio ≈ 1.86%, diskAreaRatio ≈ 5.17%
 *             pixel diameter ≈ 246px (1920×1080) viewport 무관 (renderScale × camera 고정)
 *             pixel diameter ≈ 228px (375×667), brightRatio ≈ 5.88% (모바일 인지 가능)
 *
 * R2 baseline (Amendment 2026-05-01 라운드 2 — mercuryScale 900):
 *   mercury = 900 → wsR ≈ 0.32 (sun 의 ~6%), pxDiameter ≈ 14.8px (1280×720)
 *                  sun 대비 px 비 ≈ 6.0% (DoD 임계 ≤ 6% 통과 목표)
 *                  ADR: docs/decisions/20260428-r2-mercury-visualization.md Amendment 2026-05-01 (라운드 2)
 *
 * R3 baseline (Amendment 2026-05-01 라운드 2 — venusScale 650):
 *   venus = 650 → wsR ≈ 0.572 (sun 의 ~11%), pxDiameter ≈ 27.1px (1280×720)
 *                sun 대비 px 비 ≈ 11.0% (DoD 임계 ≤ 11% 통과 목표)
 *                ADR: docs/decisions/20260429-r3-venus-visualization.md Amendment 2026-05-01 (라운드 2)
 *
 * R4~R10 추가 시 본 룩업에 1줄 추가만으로 처리 (Concrete Prediction —
 * `docs/decisions/20260425-r1-sun-visualization.md` §결과·재검토 조건 +
 * `docs/decisions/20260428-r2-mercury-visualization.md` §결과·재검토 조건 +
 * `docs/decisions/20260429-r3-venus-visualization.md` §결과·재검토 조건).
 */
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 50, // Amendment 2026-05-01 — 75 → 50 (R3 D-T2 가드 발견 #1, 옵션 a)
  mercury: 900, // Amendment 2026-05-01 라운드 2 — 8500 → 2000 → 900 (옵션 c 적극 재조정, sun 대비 px 비 ~6%)
  venus: 650, // Amendment 2026-05-01 라운드 2 — 4000 → 1500 → 650 (옵션 c 적극 재조정, sun 대비 px 비 ~11%)
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
