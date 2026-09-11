/**
 * #1215 — `?clouds=` URL 파라미터 → 지구 구름 레이어 초기 가시성 파싱 순수 함수.
 *
 * 선례: `parse-surface-mode.ts` 와 동형 (기본 ON + `?clouds=off` 옵트아웃).
 *
 * 정책 (ADR `docs/decisions/20260628-756-procedural-planet-surface.md` §A10.9 결정 8):
 *  - 미지정 / `on`: 구름 표시 (**기본 ON**)
 *  - `off`: 구름 숨김 — mesh 미생성 + 정렬 함수 미설치 (develop tip 과 같은 코드 경로)
 *  - 대소문자 무시
 *  - 알 수 없는 값 → 기본값 `true` (ON) 폴백 + `console.warn`
 *
 * ⚠️ 유효 조건은 core 쪽에서 `clouds && surfaceDetail` 이다 — `?surface=off` 면 이 값과 무관하게 꺼진다.
 * URL 초기값만 결정하며, 런타임 토글 UI 는 비-범위다.
 */

export function parseCloudsVisible(urlParam: string | null | undefined): boolean {
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

  console.warn(`[parse-cloud-mode] 알 수 없는 ?clouds=${urlParam} — ON (기본) 으로 폴백`);
  return true;
}
