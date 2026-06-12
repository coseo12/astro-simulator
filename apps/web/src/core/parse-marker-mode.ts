/**
 * [preview] `?marker=` URL 파라미터 → marker 모드 파싱 순수 함수.
 *
 * 선례: `parse-gpu-tier.ts` / `parse-lod-level.ts` 동일 구조.
 *
 * 정책 (프리뷰 — 정식 라운드에서 ADR 박제 대상):
 *  - `glow`: sub-pixel body 글로우 픽셀 마커 활성 (화면 고정 크기 billboard 역보정)
 *  - 미지정 / `off`: 기존 동작과 100% 동일 (glow 분기 연산 0)
 *  - 대소문자 무시 (URL 사용자 편의)
 *  - 알 수 없는 값 → `'off'` 폴백 + `console.warn`
 *
 * 런타임 핫스왑은 비지원 — 초기 hydration 시점 1회만 호출된다.
 */
export type MarkerMode = 'off' | 'glow';

export function parseMarkerMode(urlParam: string | null | undefined): MarkerMode {
  // 미지정 → 'off' (기존 동작).
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return 'off';
  }
  const normalized = urlParam.toLowerCase();
  if (normalized === 'off') {
    return 'off';
  }
  if (normalized === 'glow') {
    return 'glow';
  }
  // 알 수 없는 값 — 기존 parse-* 패턴과 동일한 폴백 + warn.

  console.warn(`[parse-marker-mode] 알 수 없는 ?marker=${urlParam} — 'off' 로 폴백`);
  return 'off';
}
