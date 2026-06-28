/**
 * #756 — `?surface=` URL 파라미터 → 절차적 행성 표면 셰이더 초기 가시성 파싱 순수 함수.
 *
 * 선례: `parse-stars-mode.ts` / `parse-orbits-mode.ts` / `parse-marker-mode.ts` 동일 구조
 * (기본 ON + `?x=off` 옵트아웃).
 *
 * 정책 (ADR `docs/decisions/20260628-756-procedural-planet-surface.md` §결정 4):
 *  - 미지정 / `on`: 표면 디테일 표시 (**기본 ON** — 트랙 A 몰입, 절차 표면이 기본 경험)
 *  - `off`: 표면 디테일 숨김 — `?surface=off` 진입 시 OFF (StandardMaterial 현행 단색 복귀)
 *  - 대소문자 무시 (URL 사용자 편의)
 *  - 알 수 없는 값 → 기본값 `true` (ON) 폴백 + `console.warn`
 *    (parse-stars-mode 등 "unknown → 기본 동작" 패턴 정합)
 *
 * 반환은 `boolean` (visible) — scene `createSolarSystemScene({ surfaceDetail: visible })` 옵션과
 * 직접 정합. URL 초기값만 결정하며, 런타임 토글 UI 는 비-범위 (#675 marker / #738 stars 와 동일).
 */

export function parseSurfaceVisible(urlParam: string | null | undefined): boolean {
  // 미지정 → true (기본 ON — 트랙 A 몰입 기본 경험).
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
  // 알 수 없는 값 — 기본값 true (ON) 폴백 + warn (parse-stars-mode "unknown → 기본 동작" 패턴).

  console.warn(`[parse-surface-mode] 알 수 없는 ?surface=${urlParam} — ON (기본) 으로 폴백`);
  return true;
}
