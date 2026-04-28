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
 * R1 baseline (T1 solar / camera radius=35 scene unit / fov=0.8 rad 기준):
 *   sun = 75 → pixel diameter ≈ 213px (1280×720), 점유율 3.87%
 *             pixel diameter ≈ 263px (375×667), 점유율 19.6% (모바일 인지 가능, 화면 차단 없음)
 *
 * R2 baseline (T1 solar / camera radius=35 scene unit / fov=0.8 rad 기준):
 *   mercury = 8500 → pixel diameter ≈ 84.76px (1280×720), 점유율 0.612%
 *                   pixel diameter ≈ 69.28px (375×667), 점유율 1.94% (모바일 인지 가능)
 *                   sun 시각비 약 40% (sun 의 1/2.5 — "수성 < 태양" 자연스러움)
 *   ADR: docs/decisions/20260428-r2-mercury-visualization.md §결정 1
 *
 * R3~R10 추가 시 본 룩업에 1줄 추가만으로 처리 (Concrete Prediction —
 * `docs/decisions/20260425-r1-sun-visualization.md` §결과·재검토 조건 +
 * `docs/decisions/20260428-r2-mercury-visualization.md` §결과·재검토 조건).
 */
export const BODY_SCALE: Readonly<Record<string, number>> = Object.freeze({
  sun: 75,
  mercury: 8500, // R2 #361 — viewport 점유율 1280×720 0.61% / 모바일 1.94% / sun 시각비 40%
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
