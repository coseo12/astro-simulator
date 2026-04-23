/**
 * P12-A #298 — Tier 엔진 (Display-Relative Scale Unification)
 *
 * ADR: `docs/decisions/20260423-display-relative-scale-unification.md`
 *
 * ## 계약 (ADR §결정 §주석 계약)
 *
 *  1. **renderScale 은 tier 함수** — `SCENE_UNIT_PER_METER` 하드코딩 금지. 모든 렌더 레이어는
 *     현재 tier 를 인자로 받아 `renderScaleForTier(tier)` 를 호출한다.
 *  2. **body mesh / orbit line / 거리** 모두 동일 renderScale 적용 (원칙 #4).
 *  3. **body kind 차등 없음** — 과거 `maxScaleForKind` (star=20 / planet=500 / moon=500 / dwarf=2000 /
 *     comet=20000) 은 상대 비율 왜곡 (원칙 #1 위배). 모든 body 는 `mesh.scaling = 1` 실측 유지.
 *  4. **Rust engine 경계 유지** — engine 좌표는 heliocentric 절대 m. tier 변환은 렌더 레이어 책임.
 *
 * ## Tier 3단 (Q6=6A)
 *
 * | Tier | 이름  | 관찰 대상                       | renderScale        | 1 unit ≈                |
 * | ---- | ----- | ------------------------------- | ------------------ | ----------------------- |
 * | T1   | solar | 해왕성 원일점 (30.3 AU) 궤도선  | 8.4e-11            | 1.19e10 m ≈ 0.08 AU     |
 * | T2   | inner | 화성 원일점 (1.666 AU) 궤도선   | 1.54e-9            | 6.50e8 m ≈ 0.0043 AU    |
 * | T3   | body  | focus body (지구 직경 1.275e7m) | 2.51e-5            | 3.98e4 m ≈ 40 km        |
 *
 * 기준 viewport: 1280×800. 좁은 축 95% / 가로 60% / 세로 40% DoD (V1/V3/V5).
 *
 * ## 하이브리드 트리거 (Q7=7-d2)
 *
 *  - focus body 있음 → `tierFromFocus(focusKind, cameraDistMeters)`:
 *    - star (태양) focus → T1 solar
 *    - planet focus → T2 inner (또는 카메라 거리가 매우 가까우면 T3 body)
 *    - moon / dwarf / comet focus → T3 body (세부 관찰 의도)
 *  - focus 없음 (free-fly) → `tierFromCameraDistance(cameraFromSunMeters, currentTier)`:
 *    - 카메라가 원점(태양) 에서 얼마나 떨어져 있는가로 판정
 *    - **히스테리시스 ±15%** — 현 tier 에서 경계의 115% 초과 시 outer tier, 85% 미만 시 inner tier
 *    - 왕복 flicker 방지 (A2 DoD ≥15%)
 */

import { AU } from '@astro-simulator/shared';

/** P12-A Tier 3단 (Q6=6A). */
export type Tier = 'solar' | 'inner' | 'body';

/**
 * Tier 별 renderScale (m → scene unit 배수).
 *
 * ADR §1 §4 수식 유도 (1280×800 viewport 기준):
 *  - T1 solar: 해왕성 30.3 AU (4.53e12 m) → 380 unit (800×0.95÷2) → 380 / 4.53e12 ≈ 8.4e-11
 *  - T2 inner: 화성 1.666 AU (2.49e11 m) → 384 unit (1280×0.60÷2) → 384 / 2.49e11 ≈ 1.54e-9
 *  - T3 body: 지구 직경 1.275e7 m → 320 unit (800×0.40) → 320 / 1.275e7 ≈ 2.51e-5
 */
const RENDER_SCALE: Record<Tier, number> = {
  solar: 8.4e-11,
  inner: 1.54e-9,
  body: 2.51e-5,
};

/**
 * Tier 경계 — free-fly 에서 카메라-원점 거리로 판정.
 * 단위: m. 경계값은 "tier 에 진입하는 하한" (상위 tier 경계 = 하위 tier 진입 하한).
 *
 *  - cameraFromSun < BOUNDARY.innerUpper → T3 body
 *  - BOUNDARY.innerUpper ≤ cameraFromSun < BOUNDARY.solarUpper → T2 inner
 *  - BOUNDARY.solarUpper ≤ cameraFromSun → T1 solar
 *
 * 히스테리시스 ±15% 는 `tierFromCameraDistance` 가 currentTier 를 받아 개별 적용.
 */
const BOUNDARY = {
  /** T3 → T2 경계 (m). 화성 궤도 반경 1.52 AU 근처 */
  innerUpper: 0.3 * AU,
  /** T2 → T1 경계 (m). 소행성대 바깥 ~3 AU 근처 */
  solarUpper: 3 * AU,
};

/** 히스테리시스 대역폭 (A2 DoD ≥15%). */
export const TIER_HYSTERESIS = 0.15;

/**
 * Tier 별 렌더 스케일 배수 (m → scene unit).
 *
 * @example
 *   const mesh_x = world_x_m * renderScaleForTier('solar'); // 해왕성 30 AU → 3.8 scene unit
 */
export function renderScaleForTier(tier: Tier): number {
  return RENDER_SCALE[tier];
}

/**
 * Focus body kind + 카메라 거리 기반 tier 판정 (Q7 focus 경로).
 *
 *  - star focus (태양) → T1 solar
 *  - planet focus → 카메라 거리로 T2 inner / T3 body 판정 (가까우면 body, 멀면 inner)
 *  - moon / dwarf-planet / comet focus → T3 body (세부 관찰 의도)
 *
 * @param focusKind focus body 의 kind ('star' | 'planet' | 'moon' | 'dwarf-planet' | 'comet' 등)
 * @param cameraDistanceMeters focus body 로부터 카메라까지 거리 (m)
 */
export function tierFromFocus(focusKind: string, cameraDistanceMeters: number): Tier {
  if (focusKind === 'star') {
    // 태양 focus — 전체 태양계 뷰.
    return 'solar';
  }
  if (focusKind === 'planet') {
    // planet focus — 카메라 거리로 세부 관찰 vs 궤도 맥락 구분.
    // 0.1 AU 미만은 body 세부 관찰, 그 이상은 inner tier 로 궤도 맥락 표시.
    if (cameraDistanceMeters < 0.1 * AU) return 'body';
    return 'inner';
  }
  // moon / dwarf-planet / comet / asteroid → 세부 관찰 의도로 해석.
  return 'body';
}

/**
 * 카메라-원점(태양) 거리 기반 tier 판정 (Q7 free-fly 경로).
 *
 * 히스테리시스 ±15% 적용 — 현 tier 에서 outer 경계의 `1 + TIER_HYSTERESIS` 초과 시 upshift,
 * inner 경계의 `1 - TIER_HYSTERESIS` 미만 시 downshift. 경계값 왕복 flicker 방지 (A2 DoD).
 *
 * @param cameraFromSunMeters 카메라 위치에서 원점까지 거리 (m)
 * @param currentTier 현재 tier — 히스테리시스 적용 기준
 */
export function tierFromCameraDistance(cameraFromSunMeters: number, currentTier: Tier): Tier {
  const d = cameraFromSunMeters;
  // body 에서 inner 로 upshift: innerUpper × (1 + hysteresis) 초과 시
  // inner 에서 body 로 downshift: innerUpper × (1 - hysteresis) 미만 시
  // inner 에서 solar 로 upshift: solarUpper × (1 + hysteresis) 초과 시
  // solar 에서 inner 로 downshift: solarUpper × (1 - hysteresis) 미만 시
  const hiInner = BOUNDARY.innerUpper * (1 + TIER_HYSTERESIS);
  const loInner = BOUNDARY.innerUpper * (1 - TIER_HYSTERESIS);
  const hiSolar = BOUNDARY.solarUpper * (1 + TIER_HYSTERESIS);
  const loSolar = BOUNDARY.solarUpper * (1 - TIER_HYSTERESIS);

  switch (currentTier) {
    case 'body':
      // body 에서는 innerUpper 의 115% 초과해야 inner 로 업시프트
      if (d > hiInner) {
        // 더 멀면 solar 까지 한 번에 업시프트 가능
        return d > hiSolar ? 'solar' : 'inner';
      }
      return 'body';
    case 'inner':
      // inner 에서는 solarUpper 의 115% 초과 시 solar, innerUpper 의 85% 미만 시 body
      if (d > hiSolar) return 'solar';
      if (d < loInner) return 'body';
      return 'inner';
    case 'solar':
      // solar 에서는 solarUpper 의 85% 미만 시 inner (두 단계는 한번에 내려가지 않음 —
      // 시야 단절 방지. 카메라가 급히 근접하면 inner 에서 다음 프레임에 body 로 추가 downshift)
      if (d < loSolar) return 'inner';
      return 'solar';
  }
}

/**
 * 현재 tier 판정 — 하이브리드 트리거 (Q7=7-d2).
 *
 * ADR §2 알고리즘:
 *  - focusBodyId 존재 → focus 경로 (`tierFromFocus`)
 *  - focusBodyId 없음 → free-fly 경로 (`tierFromCameraDistance`)
 *
 * @param currentTier 현재 tier (히스테리시스 적용 기준). 초기값 `'solar'` 권장.
 * @param focusBodyInfo focus body 정보 또는 null (free-fly)
 * @param cameraFromSunMeters 카메라 위치에서 원점(태양)까지 거리 (m)
 * @param cameraFromFocusMeters focus body 에서 카메라까지 거리 (m). focusBodyInfo 있을 때만 사용
 */
export function currentTier(
  currentTier: Tier,
  focusBodyInfo: { kind: string } | null,
  cameraFromSunMeters: number,
  cameraFromFocusMeters: number,
): Tier {
  if (focusBodyInfo) {
    return tierFromFocus(focusBodyInfo.kind, cameraFromFocusMeters);
  }
  return tierFromCameraDistance(cameraFromSunMeters, currentTier);
}

/**
 * 초기 tier 결정 — 씬 생성 직후 호출. 기본은 'solar' (전체 태양계 뷰).
 * 테스트 / Storybook 에서 override 하고 싶으면 options.initialTier 사용.
 */
export function initialTier(): Tier {
  return 'solar';
}
