/**
 * #782 — `?rotate=` URL 파라미터 → 행성 self-rotation (자전) 초기 활성 파싱 순수 함수.
 *
 * 선례: `parse-surface-mode.ts` / `parse-stars-mode.ts` / `parse-marker-mode.ts` 동일 구조
 * (기본 ON + `?x=off` 옵트아웃).
 *
 * 정책 (ADR `docs/decisions/20260628-756-procedural-planet-surface.md` §Amendment 2 §A2.3 결정 7):
 *  - 미지정 / `on`: 자전 표시 (**기본 ON** — 트랙 A 몰입, 자전이 기본 경험)
 *  - `off`: 자전 정지 — `?rotate=off` 진입 시 자전 도입 전 픽셀 100% 복귀 (snapshot 가드 격리)
 *  - 대소문자 무시 (URL 사용자 편의)
 *  - 알 수 없는 값 → 기본값 `true` (ON) 폴백 + `console.warn`
 *    (parse-surface-mode 등 "unknown → 기본 동작" 패턴 정합)
 *
 * 반환은 `boolean` (enabled) — scene `createSolarSystemScene({ selfRotation: enabled })` 옵션과
 * 직접 정합. URL 초기값만 결정하며, 런타임 토글 UI 는 비-범위 (#756 surface / #738 stars 와 동일).
 */

export function parseRotateEnabled(urlParam: string | null | undefined): boolean {
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
  // 알 수 없는 값 — 기본값 true (ON) 폴백 + warn (parse-surface-mode "unknown → 기본 동작" 패턴).

  console.warn(`[parse-rotate-mode] 알 수 없는 ?rotate=${urlParam} — ON (기본) 으로 폴백`);
  return true;
}
