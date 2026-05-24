/**
 * Satellite zoom tooltip onboarding 영속 박제 SSoT — #534 R4 cross-validate 후속.
 *
 * earth focus 등 satellite-parent body 진입 시 "확대하여 달의 위치를 확인하세요" tooltip 을
 * **per-body 1회만** 표시하기 위한 localStorage helper. R5 mars (phobos/deimos) / R6 jupiter
 * (galilean) 진입 시 각 satellite system 의 다른 학습 경험 보장 — 글로벌 1회 키 대신
 * per-body 키 박제 (architect 결정 2).
 *
 * ## 키 형식
 *
 *   `r4.satellite-zoom-tooltip-shown.<bodyId>` (예: `.earth`, `.mars`, `.jupiter`)
 *
 *   - `r4.` prefix — R-Phase scope (현재 R4 진입 시점 박제)
 *   - per-body suffix — Q5 일반화 정합 (satellite-parent body 모두 자동 적용)
 *
 * ## SSR / localStorage 차단 환경 안전
 *
 *   - `typeof window === 'undefined'` 가드 (Next.js SSR 단계)
 *   - try/catch (private mode / 사용자 차단 / quota exceeded)
 *   - 두 fallback 모두 `getSatelliteZoomTooltipShown` → false 반환 (default = "안 보여줬음")
 *   - mark 실패 시 silent — 다음 세션에서 다시 표시 (영구 학습 기회 박탈 회피)
 *
 * ## 관련 ADR / 이슈
 *
 *   - 이슈 #534 — R4 cross-validate Gemini 권고 1 후속 (satellite focus tooltip)
 *   - Architect 결정 2 (이슈 #534 코멘트, 2026-05-24) — per-body 키 선택
 */

const KEY_PREFIX = 'r4.satellite-zoom-tooltip-shown.';

/**
 * `<bodyId>` 에 해당하는 tooltip 이 이미 표시되었는지 검사.
 *
 * @param bodyId satellite-parent body id (예: 'earth', 'mars', 'jupiter')
 * @returns 박제되어 있으면 true, 아니면 false. SSR / localStorage 차단 시 false.
 */
export function getSatelliteZoomTooltipShown(bodyId: string): boolean {
  if (typeof window === 'undefined') return false;
  try {
    return window.localStorage.getItem(KEY_PREFIX + bodyId) === '1';
  } catch {
    // private mode / 사용자 차단 / quota 등 — silent fallback.
    return false;
  }
}

/**
 * `<bodyId>` 에 해당하는 tooltip 표시 완료 박제.
 *
 * @param bodyId satellite-parent body id (예: 'earth', 'mars', 'jupiter')
 */
export function markSatelliteZoomTooltipShown(bodyId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.setItem(KEY_PREFIX + bodyId, '1');
  } catch {
    // mark 실패 시 silent — 다음 세션에서 재표시 (영구 학습 기회 박탈 회피).
  }
}

/**
 * 테스트 / 디버그 helper — per-body 키 박제 제거.
 *
 * 단위 테스트 정합 박제 + dev tools 에서 사용자가 "다시 보고 싶다" 요청 시 활용 가능.
 */
export function clearSatelliteZoomTooltipShown(bodyId: string): void {
  if (typeof window === 'undefined') return;
  try {
    window.localStorage.removeItem(KEY_PREFIX + bodyId);
  } catch {
    // silent.
  }
}
