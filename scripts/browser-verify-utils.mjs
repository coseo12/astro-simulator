/**
 * P7-E #210 — browser-verify / bench 스크립트 공통 유틸.
 *
 * 목적 (QA 이관 3건 중 2건):
 *   1. `time-play` silent-fail 방지 — `.catch(() => {})` 로 셀렉터 부재 삼키지 말고
 *      pause/play 토글 감지 또는 HUD 진행 확인.
 *   2. NaN 검출 regex 정책 전환 — `consoleErrors.length === 0` 1차 기준 +
 *      상세 regex 보조 (root cause 식별 유지).
 *
 * 선례:
 *   - `scripts/browser-verify.mjs:131` — time-play 성공 assert 패턴
 *   - `scripts/browser-verify-integrator.mjs` — JD Δ 간접 증명
 *
 * 사용:
 *   import { pressTimePlay, hasSimErrors } from './browser-verify-utils.mjs';
 *   await pressTimePlay(page); // 내부 pre-assert + click
 *   if (hasSimErrors(consoleErrors)) { ... }
 */

/**
 * `[data-testid="time-play"]` 버튼을 pre-assert 후 클릭.
 *
 * 셀렉터 부재 시 `Error` throw — 기존 `.catch(() => {})` 로 silent 삼키던 패턴을
 * 대체. `skipIfAbsent: true` 옵션을 주면 부재 시 false 반환 (재생 불필요 케이스).
 *
 * @param page Playwright Page
 * @param options.timeout click 타임아웃 (기본 2000ms)
 * @param options.skipIfAbsent 버튼 부재 시 throw 대신 false 반환
 * @returns click 성공 여부
 */
export async function pressTimePlay(page, options = {}) {
  const timeout = options.timeout ?? 2000;
  const skipIfAbsent = options.skipIfAbsent ?? false;
  const locator = page.locator('[data-testid="time-play"]');
  const count = await locator.count();
  if (count === 0) {
    if (skipIfAbsent) return false;
    throw new Error(
      '[browser-verify-utils] data-testid="time-play" 부재 — 재생 버튼 셀렉터 회귀 가능성',
    );
  }
  await locator.click({ timeout });
  return true;
}

/**
 * consoleErrors 배열을 "시뮬레이션 핵심 에러" 기준으로 판정.
 *
 * 정책 (QA 이관 #2 — 1차/2차 계층화):
 *   1차 (엄격): 콘솔 에러가 1건이라도 있으면 실패.
 *   2차 (관대): architect §결정 5 — 외부 리소스 / 개발 도구 에러를 허용하려면
 *               `allowExternal: true` 로 `NaN/wasm/NBodyEngine/integrator/shader/WebGL/WebGPU`
 *               패턴만 정확 매칭.
 *
 * @param consoleErrors 수집된 에러 메시지 배열
 * @param options.allowExternal true 시 시뮬레이션 핵심 패턴만 검사 (기본 false)
 * @returns true = 에러 있음 (실패), false = 청결
 */
export function hasSimErrors(consoleErrors, options = {}) {
  const allowExternal = options.allowExternal ?? false;
  if (!allowExternal) {
    return consoleErrors.length > 0;
  }
  // architect §결정 5 — 상세 regex 보조.
  const pattern = /NaN|nbody|wasm|NBodyEngine|integrator|shader|compil|wgsl|glsl|WebGL|WebGPU/i;
  return consoleErrors.some((e) => pattern.test(e));
}
