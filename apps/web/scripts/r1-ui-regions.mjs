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

/**
 * 실행 모드 식별자 (#1258). `resolveRunDisposition` 의 입력 도메인 SSoT.
 *
 * 이 배열은 **집합**으로만 쓰인다 — `resolveRunDisposition` 의 화이트리스트와 전수 표
 * 테스트의 셀 열거. 순서는 어느 쪽에도 영향을 주지 않는다 (PR #1261 reviewer 변이 M-d
 * 실증). guard 의 `runMode` 파생 순서는 별개이고 그쪽 주석이 SSoT 다.
 */
export const R1_RUN_MODES = Object.freeze(['measure-px-ratio', 'update', 'measure-sun', 'verify']);

/**
 * 비-SSoT 환경(macOS) 실행 처분 판정 (#1258).
 *
 * r1-guard 의 회귀 판정 SSoT 는 **CI Linux** 다 — baseline 12 PNG 가 ubuntu 캡처본이기 때문이다
 * (ADR `20260425-r1-ui-pixel-diff-guard.md` §Amendment 2026-04-26 §결정 1). 4 영역이 모두 텍스트를
 * 담고 있어 macOS 폰트 렌더 차이만으로 전 영역이 어긋나고, 그래서 darwin verify 의 **PASS/FAIL
 * 판정에는 정보가 없다**.
 *
 * ⚠️ 판정에 정보가 없다는 것과 **출력 전체가 쓸모없다**는 것은 다르다. dimension mismatch 의
 * `current=` 는 DOM 측정값이라 결정적이고, 두 판본을 같은 환경에서 상대 대조하는 용도로는
 * 실제로 쓰인다 — #1258 의 근거표 자체가 그렇게 만들어졌다. 그래서 `R1_FORCE_LOCAL` 탈출구를
 * 둔다 (§Amendment 3 §결정 4).
 *
 * 종전에는 세 경로가 전부 판정 결과를 사칭했다 — `SKIP_LOCAL` 미설정은 `exit 1`(회귀가 있다),
 * `SKIP_LOCAL=1` 은 **출력 0 바이트 `exit 0`**(검증을 통과했다), 그리고 강제 실행 경로는 아예
 * 없었다. 네 처분으로 분리한다.
 *
 * 순수 함수로 뽑은 이유는 이 판정이 `platform × env 2종 × mode` 4축이라 조용히 drift 하기
 * 때문이다. 표 기반 단위 테스트(`r1-run-disposition.test.mjs`)가 32 셀을 전수로 고정한다.
 *
 * @param {object} input
 * @param {NodeJS.Platform|string} input.platform - `process.platform`
 * @param {boolean} input.skipLocal - `process.env.SKIP_LOCAL === '1'`
 * @param {boolean} input.forceLocal - `process.env.R1_FORCE_LOCAL === '1'`
 * @param {string} input.mode - `R1_RUN_MODES` 중 하나. 아니면 throw (fail-closed)
 * @returns {'run'|'run-not-ssot'|'skip'|'not-ssot'}
 *   `run` = 종전대로 실행 / `run-not-ssot` = 실행하되 판정 대신 exit 2 /
 *   `skip` = 명시적 미수행 후 exit 0 / `not-ssot` = 판정 불가, 실행 없이 exit 2
 */
export function resolveRunDisposition({ platform, skipLocal, forceLocal, mode }) {
  // fail-closed 화이트리스트. `mode` 는 외부 입력이 아니라 guard 의 `flags` 파생이라 오타가
  // 도달하는 경로는 없다 — 막는 것은 **모드 추가 drift** 다. 새 모드를 guard 의 파생에만 더하고
  // 여기 빠뜨리면 아래 마지막 `return 'run'` 이 darwin 에서 조용히 통과시키고, 전수 표 테스트는
  // 이 배열을 순회하므로 그 셀을 **아예 만들지 않는다**.
  if (!R1_RUN_MODES.includes(mode)) {
    throw new TypeError(
      `[r1-guard] 알 수 없는 mode: ${JSON.stringify(mode)} (허용: ${R1_RUN_MODES.join(' / ')})`,
    );
  }
  // Linux CI 가 판정 SSoT — 어떤 조합에서도 경로를 바꾸지 않는다.
  if (platform !== 'darwin') return 'run';
  // px ratio 는 baseline PNG 를 쓰지 않는다 (renderScale 결합 기반, viewport 무관) → 폰트 축 무관.
  if (mode === 'measure-px-ratio') return 'run';
  // 호출부에서 명시적으로 켠 강제 실행이 ambient env(`SKIP_LOCAL`) 를 이긴다. verify 에만 의미가
  // 있다 — 나머지 모드는 애초에 막힌 적이 없어 여기서 force 는 정의상 no-op 이다.
  if (forceLocal && mode === 'verify') return 'run-not-ssot';
  if (skipLocal) return 'skip';
  // baseline 대비 픽셀 판정을 실제로 수행하는 모드만 차단한다. `--update` 는 baseline 을 쓰는 게
  // 아니라 만드는 쪽이고, `--measure-sun` 은 baseline 비교 전에 반환한다 — 둘 다 종전 경로 유지.
  if (mode === 'verify') return 'not-ssot';
  return 'run';
}

/**
 * 이 처분에서 baseline PNG 를 **써도 되는가** (#1258 / PR #1261 reviewer R2-B2).
 *
 * `run-not-ssot`(강제 실행) 은 안 된다. `runForViewport` 의 부트스트랩 분기는 baseline 이
 * 없으면 **현재 캡처를 그대로 baseline 으로 기록**하는데, darwin 에서 그 캡처는 macOS 폰트다.
 * tracked 파일로 들어가면 다음 CI(ubuntu) PR check 에서 즉시 회귀하고, 이것은 forensic ADR
 * `20260504-411-r1-guard-shortcut-bar-forensic.md` §옵션 C 가 **금지**로 박제한 경로다.
 *
 * §결정 4 의 계약이 「측정만, 판정하지 않는다」이므로 **쓰기도 하지 않는다**. 계약을 코드
 * 한 곳이 아니라 테스트되는 SSoT 에 두려고 함수로 뽑았다 — 조건식을 호출부에 인라인하면
 * 32 셀 표가 그 계약을 덮지 못한다.
 *
 * @param {'run'|'run-not-ssot'|'skip'|'not-ssot'} disposition
 * @returns {boolean}
 */
export function allowsBaselineWrite(disposition) {
  return disposition !== 'run-not-ssot';
}
