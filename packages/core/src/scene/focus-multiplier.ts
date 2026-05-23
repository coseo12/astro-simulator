/**
 * Focus user-trigger radius multiplier — SSoT (R4 #539 Amendment 3).
 *
 * `controller.focusOn` 의 `desiredRadius = max(meshRadius × N, meshRadius + padding)` 식에서
 * 사용되는 multiplier 의 **satellite 분기 정책** 박제. body 별 mesh-카메라 거리 산식의 단일 진실원.
 *
 * ## 배경 — LOD × visual scale 결합 결함 (R4 Amendment 3, #539)
 *
 * Amendment 2 의 `EARTH_MOON_ORBIT_VISUAL_SCALE = 30` + `moonScale = 800` 결합으로 moon high variant
 * 의 `wsRadius` 가 커져 (300000+ scene unit), 기존 식 `meshRadius × 5` 가 mesh **표면 안쪽** 0.01
 * 단위에 카메라 박힘 (`cameraRadius / moonScaling ≈ 1.011`). 결과:
 *
 *   1. screenCoverage ≈ 0 → LOD 단계 `low` 판정
 *   2. moon high variant `isVisible=false` 토글
 *   3. moon-lod-low (1 px billboard) 만 가시 → 사용자 시각 회귀 ("화면 중앙에 안 보임")
 *
 * Amendment 3 결정 (옵션 a — cameraRadius 자동 조정): focus 진입 식에 satellite 분기 도입.
 * satellite 의 multiplier 를 ×20 으로 확대해 mesh 외각에 카메라 보장. LOD 시스템 / visual scale=30 /
 * 박제값 무수정.
 *
 * ## 식 후보 선택 — 식 후보 2 (satellite 일괄 정책)
 *
 * ADR §Amendment 3 §식 후보 1~3 중 **후보 2** 우선 권장 채택:
 *   - body.parentId 가 null 또는 'sun' 이 아닐 때 satellite 로 판정 (R5+ phobos/deimos/io/europa/titan 자동 수용)
 *   - 신규 박제값 0 (R-Phase 진입마다 kind 박제 부담 회피)
 *   - 후보 3 (visual scale 인지 식) 은 mesh.scaling 이 visual scale 적용 안 됨 → 식 검증 실패 위험
 *
 * ## 박제값 산출 근거 (D3.3 cameraRadius/moonScaling > 1.5 보장)
 *
 *   - moon high variant wsRadius ≈ 60426 scene unit (R4 본 진입 측정)
 *   - moon scaling ≈ 298810 scene unit (Amendment 2 visual scale 적용 후)
 *   - 기존 식 (×5): cameraRadius = wsRadius × 5 ≈ 302130 → cameraRadius/moonScaling ≈ 1.011 (mesh-안쪽)
 *   - 신규 식 (×20): cameraRadius = wsRadius × 20 ≈ 1208520 → cameraRadius/moonScaling ≈ 4.04 (mesh-외각 PASS)
 *   - D3.3 임계 1.5 통과 +2.54 margin
 *
 * D-T2 미통과 시 fallback: 20 → 30 → 40 단계 (ADR §재검토 #10). 40 미통과 시 Amendment 4 (옵션 e
 * defense-in-depth) 발동.
 *
 * ## R5+ satellite 일반화 (식 후보 2 자동 수용)
 *
 *   - R5 mars/phobos/deimos — phobos 의 parentId='mars' → satellite 분기 자동
 *   - R6 jupiter/galilean (io/europa/ganymede/callisto) — 동일
 *   - R7 saturn/titan — 동일
 *
 * mars/jupiter/saturn 등 parent body 자체는 parentId='sun' 이라 기본 multiplier (×5) 유지.
 *
 * ## 참고 ADR
 *
 *   - `docs/decisions/20260520-r4-earth-moon-visualization.md` §Amendment 3 §결정 — 옵션 (a) 선택
 *   - §Amendment 3 §식 후보 2 — satellite 일괄 정책
 *   - §Concrete Prediction §예측 2 D3.3 — cameraRadius/moonScaling > 1.5
 */

import { FOCUS_USER_RADIUS_MULTIPLIER } from './camera-controller.js';

/**
 * Satellite (parent ≠ sun + parent ≠ null) focus 진입 시 multiplier.
 *
 * `desiredRadius = max(meshRadius × 20, meshRadius + padding)` 적용 → mesh 외각 보장.
 *
 * D-T2 미통과 시 fallback: 20 → 30 → 40 단계 (ADR §재검토 #10).
 */
export const FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE = 20;

/**
 * body parentId 기반 focus multiplier 분기 (식 후보 2 — satellite 일괄 정책).
 *
 * @param parentId body 의 parent body id. null (root body, 예: sun) 또는 'sun' 이면 비-satellite.
 * @returns satellite 면 ×20, 비-satellite 면 ×5 (기존 FOCUS_USER_RADIUS_MULTIPLIER).
 *
 * @example
 *   resolveFocusMultiplier('earth')    // moon 의 parentId='earth' → 20 (satellite)
 *   resolveFocusMultiplier('jupiter')  // io/europa 의 parentId='jupiter' → 20 (R6+ satellite)
 *   resolveFocusMultiplier('sun')      // earth/mercury 의 parentId='sun' → 5 (비-satellite)
 *   resolveFocusMultiplier(null)       // sun 의 parentId=null → 5 (root)
 */
export function resolveFocusMultiplier(parentId: string | null | undefined): number {
  // R5+ satellite 일반화: parentId 가 sun 이 아니고 null 도 아니면 satellite.
  if (parentId !== null && parentId !== undefined && parentId !== 'sun') {
    return FOCUS_USER_RADIUS_MULTIPLIER_SATELLITE;
  }
  return FOCUS_USER_RADIUS_MULTIPLIER;
}
