/**
 * R1 #329 — UI 회귀 가드 영역 정의 (SSoT).
 *
 * CSS selector 우선, 없으면 좌표 fallback. R2~R10 에서 영역 추가 시 본 파일에만 박제.
 *
 * 좌표 fallback 은 1280×720 viewport 기준. 다른 viewport 는 selector 가 우선이어야 함
 * (selector 미발견 시 viewport-relative 좌표 변환은 신규 ADR 필요 — 현재 R1 범위 밖).
 *
 * ADR `docs/decisions/20260425-r1-ui-pixel-diff-guard.md` §결정 2.
 */

export const R1_UI_REGIONS = Object.freeze([
  {
    id: 'top-nav',
    selector: '[data-r1-region="top-nav"]',
    fallback1280x720: { x: 0, y: 0, width: 1280, height: 56 },
  },
  {
    id: 'shortcut-bar',
    selector: '[data-r1-region="shortcut-bar"]',
    // fallback null 의도: 이 영역은 동적으로 위치가 결정될 가능성이 높아 CSS Selector 사용을 강력 권장.
    // selector 가 실제로 작동 불가능한 경우에만 (developer 가 R1 PR 시점에 검증) 좌표 측정 후 기입.
    // null 유지 = "selector 가 항상 작동" 보장, 좌표 fallback 자체를 차단 (CRITICAL #6 비-범위 가드).
    fallback1280x720: null,
  },
  {
    id: 'hud-top-right',
    selector: '[data-r1-region="hud-top-right"]',
    fallback1280x720: { x: 1024, y: 56, width: 256, height: 144 },
  },
  {
    id: 'hud-bottom-right',
    selector: '[data-r1-region="hud-bottom-right"]',
    fallback1280x720: { x: 1024, y: 600, width: 256, height: 120 },
  },
]);

export const R1_VIEWPORTS = Object.freeze([
  { id: '1280x720', width: 1280, height: 720 },
  { id: '1920x1080', width: 1920, height: 1080 },
  { id: '375x667', width: 375, height: 667 },
]);

/** pixelmatch 임계값 (per-pixel color distance). ADR §축 2. */
export const PIXELMATCH_THRESHOLD = 0.1;

/**
 * mismatchedPixels / totalPixels 영역 단위 임계값 (viewport 별).
 * - desktop (1280×720 / 1920×1080): 0.5% (ADR §축 2 기본값 유지)
 * - mobile (375×667): **1.5%** (ADR §Amendment 2 — PR #506/#508 deep dive 결과)
 *
 * mobile 만 완화한 근거: 작은 viewport (375×48 / 139×50) 의 noise floor 가 systemic 0.55%/1.11%
 * 위에 결정적으로 존재. step 구조 통일 가설 기각 (PR #508 frame timing 로깅 + ci.yml step 분리
 * 실험에서 mismatch ratio 완전 동일 0.550% / 1.108% 재현). 잔여 후보: chromium 빌드 차이 /
 * rendering pipeline systemic difference. 정확한 원인은 추가 deep dive 필요 (낮은 ROI 로 보류),
 * 우선 임계 완화로 develop CI 정상화. 상세: ADR `20260425-r1-ui-pixel-diff-guard.md` §Amendment 2.
 */
export const MISMATCH_RATIO_LIMIT_DESKTOP = 0.005;
export const MISMATCH_RATIO_LIMIT_MOBILE = 0.015;

/** viewport id → 임계값 매핑 헬퍼. 알 수 없는 viewport 는 desktop 기본값 반환 (보수적). */
export function getMismatchRatioLimit(viewportId) {
  if (viewportId === '375x667') return MISMATCH_RATIO_LIMIT_MOBILE;
  return MISMATCH_RATIO_LIMIT_DESKTOP;
}

/** @deprecated viewport 별 임계값 도입 (Amendment 2) 이전 SSoT. 후방 호환용 export. */
export const MISMATCH_RATIO_LIMIT = MISMATCH_RATIO_LIMIT_DESKTOP;
