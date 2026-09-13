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

/**
 * #1226 D1 (Phase 1 임시) — `?nightlightsCandidate=<id>` → 불빛 파라미터 후보 id.
 *
 * 사용자 육안 비교 (계약 D1) 전용이다. 승인 뒤 후보 표가 승인값 1벌로 접히면 이 파라미터도 함께
 * 정리한다. id 의 유효성은 core (`NIGHT_LIGHT_CANDIDATES`) 가 판정한다 — web 이 core 상수를 import
 * 하면 babylon 이 SSR import 그래프에 들어오므로 여기서는 정규화만 한다.
 *
 * @returns 소문자로 정규화한 id, 미지정·빈 문자열이면 `undefined` (core 기본 후보)
 */
export function parseNightLightCandidate(urlParam: string | null | undefined): string | undefined {
  if (urlParam === null || urlParam === undefined) return undefined;
  const normalized = urlParam.trim().toLowerCase();
  return normalized === '' ? undefined : normalized;
}
