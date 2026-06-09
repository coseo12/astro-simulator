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
 *   - `solar-system-scene.ts` 의 `resolveWorld` — parent + (local × visual_scale) 산출 (mesh 경로)
 *   - `solar-system-scene.ts` 의 `rebuildOrbitLines` — #627 부터 **모든 satellite orbit LineSystem**
 *     (parent 별 `Map<string, LineSystem>`) 의 `.scaling` 적용. R5 까지 moon LineSystem 만 적용되어
 *     phobos/deimos/galilean 궤도선이 visual scale 미적용 + parent 미추적으로 태양 원점에 잘못
 *     렌더됐던 결함을 옵션 A (moon 패턴 일반화) 로 해소 (ADR `20260606-627-satellite-orbit-structure-forensic.md`).
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
 * ## R5 박제 (#594, 2026-05-28) — satellite 2개 첫 본 사례
 *
 * mars-phobos (binding constraint):
 *   - mars-phobos 실측 거리 = 9.376e6 m (JPL SSD, semiMajorAxisAU 6.26752e-5)
 *   - mars mesh radius (marsScale=800) = 2.717e9 m
 *   - phobos mesh radius (phobosScale=5000) = 5.54e7 m
 *   - sum mesh radius = 2.772e9 m → 실측 거리의 **295.6배** (R4 moon 16.9배 의 17.5배 더 극단)
 *   - visual_scale=500 적용 시 visual 거리 = 4.688e9 m → sum mesh / visual 거리 = **1.69배** 분리 마진
 *     (분리 임계 ≥ 1.5x 통과 +0.19, R4 1.78배 와 거의 동등 안정)
 *   - ⚠️ **위 산식 A(설계 real-meter 비)와 런타임 산식 B(scene-unit `satellite.dist / parent.bsRadius`,
 *     실측 phobos≈0.99)의 ~1.7배 gap 은 측정-정의 차이이지 버그가 아니다** (#622 NO-OP ADR
 *     `docs/decisions/20260609-622-orbit-scale-gap-no-op.md`). boundingSphere 타이밍(#611 패턴) 아님이
 *     실측 확정 (stale/fresh=1.0) — scale(BODY/ORBIT_VISUAL/render) 합성 정의 차이. 재오인 분석 금지.
 *
 * mars-deimos (자동 안전):
 *   - mars-deimos 실측 거리 = 23.463e6 m (JPL SSD, semiMajorAxisAU 1.5684e-4)
 *   - sum mesh radius = 2.748e9 m (mars 2.717e9 + deimos 3.135e7) → 실측 거리의 117.1배
 *   - visual_scale=500 적용 시 visual 거리 = 1.173e10 m → sum mesh / visual 거리 = **4.27배** 분리 마진
 *     (phobos 가 binding constraint 이고 deimos 는 자동 안전 — 단일 룩업으로 둘 다 처리)
 *
 * 후보 비교 (8개, R5 ADR §결정 4 §축 4 후보 비교):
 *   ×100 (0.34x fail) / ×200 (0.68x fail) / ×300 (1.02x ε통과 — 마진 부족) / ×400 (1.35x 미통과)
 *   / **×500 (1.69x 선택)** / ×600 (2.03x 보수) / ×750 (2.54x fallback) / ×1000 (3.38x 과도)
 *
 * 명명 결정 (cross-validate 이견 수용 #1, 2026-05-28): `MARS_SATELLITES_ORBIT_VISUAL_SCALE`
 * — deimos 도 포함하므로 `MARS_PHOBOS_*` 보다 정확. R6+ 다중 satellite (galilean 4 / titan +
 * saturn moons 다수) 일관성 우선. R4 `EARTH_MOON_*` 답습 무시 (R4 가 단일 satellite 특수 사례).
 *
 * ## 참고 ADR
 *
 *   - `docs/decisions/20260520-r4-earth-moon-visualization.md` §Amendment 2 — forensic 박제 (earth-moon)
 *   - §결정 6 §Visual scale 후보 비교 — 8개 후보 분리 마진 비교
 *   - §Concrete Prediction §예측 1~4 — D2.1~D2.6 검증 의무
 *   - `docs/decisions/20260528-r5-mars-visualization.md` §결정 4 — mars-satellites 박제
 *   - §축 4 후보 비교 — 8개 후보 분리 마진 비교 (mars-phobos binding constraint)
 *   - §위험 #6 + §재검토 트리거 #4 — `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 Amendment 가능성
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
 * Mars-Satellites 궤도 visual scale 배수 (phobos + deimos 둘 다 적용).
 *
 * `phobos world position = mars world position + (phobos local orbit × 500)` 로 산출.
 * `deimos world position = mars world position + (deimos local orbit × 500)` 동일.
 * 실측 거리 (phobos 9.376e6 m / deimos 23.463e6 m) 는 보존되며 rendering 단계에서만 ×500 적용.
 *
 * 분리 마진: phobos 1.69x (binding constraint) / deimos 4.27x (자동 안전).
 *
 * D-T2 미통과 시 fallback: 500 → 600 → 750. 750 미통과 시 Amendment 1 (deimos 별도 룩업 도입).
 * `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY` 신규 룩업 가능성 (R5 ADR §위험 #6).
 *
 * R6+ SSoT: galilean (io/europa/ganymede/callisto) / titan 등 satellite 진입 시
 * 동일 단일 룩업 (`ORBIT_VISUAL_SCALE_BY_PARENT.jupiter` 등) 우선. 사실 비율 편차 큰 satellite
 * (예: io vs callisto) 는 Amendment 1 가능.
 */
export const MARS_SATELLITES_ORBIT_VISUAL_SCALE = 500;

/**
 * Jupiter-Galilean 궤도 visual scale 배수 (io/europa/ganymede/callisto 4개 적용).
 *
 * `io world position = jupiter world position + (io local orbit × 16)` (나머지 3개 동일).
 * 실측 거리 (io 4.2023e8 m ~ callisto 1.8826e9 m) 는 보존되며 rendering 단계에서만 ×16 적용.
 *
 * 분리 마진 (산식 A, 설계 임계): io 1.69x (binding constraint) / callisto 7.25x (자동 안전).
 * jupiterScale=48 (mesh 4.8배 확대) 의 결합 효과로 R5 ×6 → ×16 동반 상향 (기존 ×6 은 io 0.63x
 * 묻힘). io 마진 1.69x 는 R5 phobos 1.69x 와 정확 정합 (검증된 binding 마진 답습).
 *
 * D-T2 미통과 시 fallback: callisto 분리 과도 (4.29배 편차) → `ORBIT_VISUAL_SCALE_BY_PARENT_AND_BODY`
 * 신규 룩업 (R6 ADR §위험 #3 + §재검토 트리거 #3).
 *
 * R6 ADR `20260605-r6-jupiter-galilean-visualization.md` §결정 4 — 산식 A(설계 임계) / B(검증 metric)
 * 정의 분리 박제 (R5 §결정 4 Amendment 1 정정 적용).
 */
export const JUPITER_SATELLITES_ORBIT_VISUAL_SCALE = 16;

/**
 * parent body id 별 satellite orbit visual scale 룩업.
 *
 * R5+ 진입 시 parent-satellite 쌍별로 박제값 추가. 미정의 parent 는 1.0 (실측 그대로).
 */
export const ORBIT_VISUAL_SCALE_BY_PARENT: Readonly<Record<string, number>> = Object.freeze({
  earth: EARTH_MOON_ORBIT_VISUAL_SCALE, // R4 #539 Amendment 2 — moon visual fusion 해결
  mars: MARS_SATELLITES_ORBIT_VISUAL_SCALE, // R5 #594 — phobos + deimos 단일 룩업 (binding constraint=phobos)
  jupiter: JUPITER_SATELLITES_ORBIT_VISUAL_SCALE, // R6 #621 — galilean 4 단일 룩업 (binding constraint=io, 마진 1.69x)
});

/**
 * 기본값 (parent 가 룩업에 없거나 visual scale 미적용 — 실측 그대로).
 *
 * #627 (agy 보강 ②) — `getOrbitVisualScale` 의 fallback 계약. parentId null / undefined /
 * 미매핑 시 1.0 반환 보장으로 satellite 궤도 LineSystem.scaling 이 항상 안전한 값을 받는다
 * (rebuildOrbitLines 의 미매핑 parent 예외 안정성). 단위 테스트 `satellite-orbit-structure.test.ts`
 * 가 본 계약을 가드.
 */
export const DEFAULT_ORBIT_VISUAL_SCALE = 1.0;

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
