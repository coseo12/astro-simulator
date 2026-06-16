/**
 * #688 — `?orbits=` URL 파라미터 → 궤도선 초기 가시성 파싱 순수 함수.
 *
 * 선례: `parse-marker-mode.ts` 동일 구조 (기본 ON + `?x=off` 옵트아웃 패턴).
 *
 * 정책 (PM 확정 2026-06-13 — Q1 기본 ON):
 *  - 미지정 / `on`: 궤도선 표시 (**기본 ON** — 현행 동작 100% 보존)
 *  - `off`: 궤도선 숨김 — `?orbits=off` 진입 시 OFF 로 시작 (glow `?marker=off` 패턴 동일)
 *  - 대소문자 무시 (URL 사용자 편의)
 *  - 알 수 없는 값 → 기본값 `true` (ON) 폴백 + `console.warn`
 *    (parse-marker-mode 등 "unknown → 기본 동작" 패턴 정합)
 *
 * 반환은 `boolean` (visible) — scene `setOrbitLinesVisible(visible)` / command `visible` 필드와
 * 직접 정합. URL 초기값만 결정하며, 런타임 토글은 UI 버튼이 command 로 별도 발행한다.
 */
export function parseOrbitsVisible(urlParam: string | null | undefined): boolean {
  // 미지정 → true (기본 ON — 현행 동작 보존).
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return true;
  }
  const normalized = urlParam.toLowerCase();
  if (normalized === 'off') {
    return false;
  }
  if (normalized === 'on') {
    return true;
  }
  // 알 수 없는 값 — 기본값 true (ON) 폴백 + warn (parse-marker-mode "unknown → 기본 동작" 패턴).

  console.warn(`[parse-orbits-mode] 알 수 없는 ?orbits=${urlParam} — ON (기본) 으로 폴백`);
  return true;
}
