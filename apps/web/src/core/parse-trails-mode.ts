/**
 * #1341 — `?trails=` URL 파라미터 → 궤적 trail 초기 상태 파싱 순수 함수
 * (ADR `docs/decisions/20261015-1341-trail-ruler.md` 결정 T10 · 사용자 결정 Q-T5 (a)).
 *
 * 다른 표시 토글과 달리 **기본 꺼짐 · 옵트인** 이다:
 *  - 미지정 (빈 값 포함) / `off` (대소문자 무시): 꺼짐
 *  - `on` (대소문자 무시): 켜짐
 *  - 그 외: 꺼짐 (기본) + `console.warn` — 「모르는 값 → 기본 동작」 관례
 *
 * 소프트웨어 렌더 게이트는 없다 — 1 px 선이고 기본 꺼짐이라 옵트인이다 (결정 T10). 그래서 `force` 어휘도 없다.
 * 쓰는 쪽은 `serializeDisplayToggle(visible, defaultVisible=false)` — 켜짐 = `on`, 꺼짐 = 키 삭제.
 */

/** URL 초기값 → trail 표시 의도. */
export function parseTrailsVisible(urlParam: string | null | undefined): boolean {
  if (urlParam === null || urlParam === undefined || urlParam.trim() === '') return false;
  const normalized = urlParam.trim().toLowerCase();
  if (normalized === 'on') return true;
  if (normalized === 'off') return false;
  console.warn(`[parse-trails-mode] 알 수 없는 ?trails=${urlParam} — OFF (기본) 으로 폴백`);
  return false;
}
