/**
 * ⚠️ #1274 D13 프리뷰 **임시** — 사용자 육안 승인 후 같은 PR 에서 삭제한다 (ADR `20260628-756` §A12.10).
 *
 * `?iceGiantCandidate=` URL 파라미터 → 천왕성 · 해왕성 (`IceGiant`) 밴드 파라미터 후보 id 정규화.
 * 선례: #1226 D1 의 `parseNightLightCandidate` (Phase 1 임시, 승인 후 삭제됨 — 커밋 `3dfe672c`).
 *
 * - 미지정 · 빈 문자열 · 공백 → `undefined` (core 테이블 값 = 후보 a)
 * - 대소문자 · 앞뒤 공백 정규화 (`" B "` → `"b"`)
 * - 유효성은 판정하지 않는다 — 미지 id 도 그대로 넘기고 core 가 `console.warn` + 테이블 값으로 폴백한다
 *   (후보 표 `ICE_GIANT_CANDIDATES` 의 SSoT 가 core 라서다).
 */
export function parseIceGiantCandidate(urlParam: string | null | undefined): string | undefined {
  if (urlParam === null || urlParam === undefined) return undefined;
  const normalized = urlParam.trim().toLowerCase();
  return normalized === '' ? undefined : normalized;
}
