/**
 * #400 ADR `20260512-au-slider-semantics.md` 결정 A — tier-aware AU 환산 + 단위 분기 유틸.
 *
 * 본 모듈은 ScaleControl 의 표시 라벨 산출 로직만 격리한다 (순수 함수). 단위 테스트 용이.
 *
 * SSoT 의존:
 *  - `@astro-simulator/core/scene` `renderScaleForTier(tier)` — m → scene unit 배수
 *  - `@astro-simulator/shared` `AU = 149_597_870_700 m` — IAU 2012 정의
 *
 * 단위 분기 (ADR 결정 A expected behavior #5, Gemini cross-validate Q3 고유 발견 수용):
 *  - `< 1e-3 AU` (< 149,597 km) → `{value} km` (T3 body 진입 시)
 *  - `1e-3 AU ≤ value < 1 AU` → `{value} mAU`
 *  - `1 AU ≤ value < 1000 AU` → `{value} AU`
 *  - `≥ 1000 AU` → `{value} kAU` (T1 solar 극단 줌아웃)
 */

import { renderScaleForTier, type Tier } from '@astro-simulator/core/scene';

/**
 * scene unit → AU 환산 입력. tier 와 AU 상수를 DI 로 받아 테스트 용이성 확보.
 */
export interface SceneUnitToAUDeps {
  /** 슬라이더가 표시하는 scene unit 값 (= `camera.radius`, log10 변환 전). */
  sceneUnit: number;
  /** 현재 active tier — `solar.getTier()` snapshot. */
  tier: Tier;
  /** AU 상수 (m). DI 로 받아 테스트가 mock 가능. 실 사용 시 `@astro-simulator/shared` AU 전달. */
  AU: number;
}

/**
 * scene unit → AU 환산 (tier-aware).
 *
 * 식: `radiusMeters = sceneUnit / renderScaleForTier(tier)`, `radiusAU = radiusMeters / AU`
 *
 * ADR 결정 A expected behavior:
 *  1. T1 solar / free-fly 진입: ± 1% 이내 일치 (Gemini Q2 이견 수용 — ± 5% → ± 1%)
 *  2. T3 body / focus venus 진입: ± 1% 이내 일치
 *  3. tier transition 순간 1 프레임 한정 ± 5% drift 허용 (Babylon 60fps ↔ React render 1~2 프레임 stale read)
 */
export function sceneUnitToAU(deps: SceneUnitToAUDeps): number {
  const metersPerSceneUnit = 1 / renderScaleForTier(deps.tier);
  const radiusMeters = deps.sceneUnit * metersPerSceneUnit;
  return radiusMeters / deps.AU;
}

/** 단위 분기 경계값 (AU). ADR 결정 A expected behavior #5 박제. */
export const UNIT_BOUNDARY = {
  /** < 이 값 (km, T3 body 일상 단위) */
  km: 1e-3,
  /** < 이 값 (mAU, T2 inner 단위) */
  mAU: 1,
  /** < 이 값 (AU, T1 solar 표준) */
  AU: 1000,
  // ≥ 1000 AU 는 kAU
} as const;

/**
 * AU 값 → 표시 라벨 텍스트.
 *
 * 자동 단위 분기:
 *  - 음수 / NaN / Infinity → "-- AU" fallback (방어적)
 *  - < 1e-3 AU → km (소수점 0~2자리 자동)
 *  - < 1 AU → mAU (정수 또는 1자리)
 *  - < 1000 AU → AU (2자리)
 *  - ≥ 1000 AU → kAU (2자리)
 *
 * 자릿수 정책: 단위 경계 부근에서 가독성 우선. ADR §expected behavior #5 의 "경계에서 어색하지
 * 않게 자동 포맷팅" 사양.
 */
export function formatScaleLabel(radiusAU: number): string {
  if (!Number.isFinite(radiusAU) || radiusAU < 0) return '-- AU';

  if (radiusAU < UNIT_BOUNDARY.km) {
    // < 1e-3 AU = < 149,597 km. AU → m → km.
    const km = (radiusAU * 149_597_870.7).toFixed(0); // AU × (149597870700 / 1000) = AU × 149_597_870.7
    return `${km} km`;
  }
  if (radiusAU < UNIT_BOUNDARY.mAU) {
    // 1e-3 ~ 1 AU = 1 ~ 1000 mAU. 정수 자리수면 충분.
    const mau = (radiusAU * 1000).toFixed(0);
    return `${mau} mAU`;
  }
  if (radiusAU < UNIT_BOUNDARY.AU) {
    // 1 ~ 1000 AU. 소수점 2자리.
    return `${radiusAU.toFixed(2)} AU`;
  }
  // ≥ 1000 AU. kAU 변환 후 소수점 2자리.
  const kau = (radiusAU / 1000).toFixed(2);
  return `${kau} kAU`;
}
