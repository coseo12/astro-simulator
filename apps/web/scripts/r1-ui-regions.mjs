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

/** mismatchedPixels / totalPixels 영역 단위 임계값 (0.5%). ADR §축 2. */
export const MISMATCH_RATIO_LIMIT = 0.005;
