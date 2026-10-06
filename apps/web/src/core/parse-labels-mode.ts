/**
 * #1293 — `?labels=` URL 파라미터 → 3D 이름 라벨 초기 가시성 파싱 순수 함수.
 *
 * 선례: `parse-cloud-mode.ts` 와 동형 (기본 ON + `?labels=off` 옵트아웃 — 사용자 결정 2026-10-06).
 *  - 미지정 / `on`: 라벨 표시 (**기본 ON**)
 *  - `off`: 라벨 숨김 (오버레이 미렌더)
 *  - 대소문자 무시
 *  - 알 수 없는 값 → 기본값 `true` (ON) 폴백 + `console.warn`
 *
 * URL 초기값만 결정한다. 런타임 토글은 표시 패널이 `useDisplayToggle` 로 발행하며, 그때 URL 은 이 함수의
 * 역방향 `serializeDisplayToggle` 로 쓴다 (round-trip 은 `display-toggles.test.ts` 가 고정).
 */
export function parseLabelsVisible(urlParam: string | null | undefined): boolean {
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

  console.warn(`[parse-labels-mode] 알 수 없는 ?labels=${urlParam} — ON (기본) 으로 폴백`);
  return true;
}
