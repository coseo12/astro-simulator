/**
 * #1226 — `?nightlights=` URL 파라미터 → 지구 야간 도시 불빛 초기 활성 파싱 순수 함수.
 *
 * 선례: `parse-cloud-mode.ts` 와 동형 (기본 ON + `?nightlights=off` 옵트아웃).
 *
 * 정책 (ADR `docs/decisions/20260628-756-procedural-planet-surface.md` §A11.6 결정 4):
 *  - 미지정 / `on`: 불빛 표시 (**기본 ON**)
 *  - `off`: 불빛 끔 — 같은 셰이더 프로그램에서 `nightLightStrength = 0` (합성이 정확한 no-op)
 *  - 대소문자 무시
 *  - 알 수 없는 값 → 기본값 `true` (ON) 폴백 + `console.warn`
 *
 * ⚠️ 유효 조건은 core 쪽에서 `nightLights && surfaceDetail` 이다 — `?surface=off` 면 이 값과 무관하게
 * 꺼진다. `?clouds=` 와는 **독립**이다 (서로를 읽지 않는다). URL 초기값만 결정하며 런타임 토글 UI 는 비-범위다.
 */

export function parseNightLightsVisible(urlParam: string | null | undefined): boolean {
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

  console.warn(
    `[parse-night-lights-mode] 알 수 없는 ?nightlights=${urlParam} — ON (기본) 으로 폴백`,
  );
  return true;
}
