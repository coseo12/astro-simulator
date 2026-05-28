/**
 * Parent-Satellite Orbit Visual Scale — SSoT.
 *
 * 실측 궤도 거리(`solar-system.json` 의 semi-major axis 등) 와 박제값 (BODY_SCALE) 만으로는
 * satellite mesh radius 가 parent-satellite 거리를 능가하여 시각적 fusion 이 발생한다.
 * 본 모듈은 **rendering 시점에만** parent 기준 satellite local orbit 좌표에 visual scale 을
 * 곱해 시각 분리를 보장한다 — 실측 데이터 SSoT (`solar-system.json`) / BODY_SCALE 박제값
 * (`apps/web/src/constants/body-scale.ts`) 은 변경 없음.
 *
 * ## 적용 위치
 *
 *   - `solar-system-scene.ts` 의 `resolveWorld` — parent + (local × visual_scale) 산출
 *   - `solar-system-scene.ts` 의 `rebuildOrbitLines` — moon orbit LineSystem.scaling 적용
 *
 * ## 박제값 산출 근거 (R4 #539 Amendment 2 forensic, 2026-05-21)
 *
 * earth-moon:
 *   - earth-moon 실측 거리 = 3.847e8 m (NASA/JPL Fact Sheet)
 *   - earth mesh radius (earthScale=800) = 5.103e9 m
 *   - moon mesh radius (moonScale=800) = 1.390e9 m
 *   - sum mesh radius = 6.493e9 m → 실측 거리의 **16.9배** (mesh > distance → fusion)
 *   - visual_scale=30 적용 시 visual 거리 = 1.154e10 m → sum mesh / visual 거리 = **1.78배** 분리 마진
 *     (분리 임계 ≥ 1.5x 통과 +0.28)
 *
 * 후보 비교 (8개, ADR §결정 6 §Visual scale 후보 비교):
 *   ×10 (0.59x fail) / ×15 (0.89x fail) / ×20 (1.18x 통과 한계) / ×25 (1.48x 경계)
 *   / **×30 (1.78x 선택)** / ×40 (2.37x 보수) / ×50 (2.96x fallback 1) / ×75 (4.45x fallback 2)
 *
 * ## R5+ satellite SSoT 패턴
 *
 * R5 (mars/phobos/deimos) / R6 (jupiter/galilean) / R7 (saturn/titan) 진입 시 동일 패턴.
 * 각 parent-satellite 쌍별로 박제값 추가 (forensic 측정 후 확정).
 *
 * ## 참고 ADR
 *
 *   - `docs/decisions/20260520-r4-earth-moon-visualization.md` §Amendment 2 — forensic 박제
 *   - §결정 6 §Visual scale 후보 비교 — 8개 후보 분리 마진 비교
 *   - §Concrete Prediction §예측 1~4 — D2.1~D2.6 검증 의무
 */

/**
 * Earth-Moon 궤도 visual scale 배수.
 *
 * `moon world position = earth world position + (moon local orbit × 30)` 로 산출.
 * 실측 거리 3.847e8 m 는 보존되며 rendering 단계에서만 ×30 적용.
 *
 * D-T2 미통과 시 fallback: 30 → 50 (1단계) → 75 (2단계). 75 미통과 시 Amendment 3 발동.
 */
export const EARTH_MOON_ORBIT_VISUAL_SCALE = 30;

/**
 * parent body id 별 satellite orbit visual scale 룩업.
 *
 * R5+ 진입 시 parent-satellite 쌍별로 박제값 추가. 미정의 parent 는 1.0 (실측 그대로).
 */
export const ORBIT_VISUAL_SCALE_BY_PARENT: Readonly<Record<string, number>> = Object.freeze({
  earth: EARTH_MOON_ORBIT_VISUAL_SCALE, // R4 #539 Amendment 2 — moon visual fusion 해결
});

/** 기본값 (parent 가 룩업에 없거나 visual scale 미적용 — 실측 그대로). */
const DEFAULT_ORBIT_VISUAL_SCALE = 1.0;

/**
 * parent body id 에 해당하는 satellite orbit visual scale 조회.
 *
 * @param parentId satellite 의 parent body id (예: 'earth' → moon 의 parent)
 * @returns visual scale 배수. 미정의 시 1.0 (실측 그대로).
 */
export function getOrbitVisualScale(parentId: string | null | undefined): number {
  if (parentId === null || parentId === undefined) return DEFAULT_ORBIT_VISUAL_SCALE;
  return ORBIT_VISUAL_SCALE_BY_PARENT[parentId] ?? DEFAULT_ORBIT_VISUAL_SCALE;
}
