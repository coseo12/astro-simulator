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

/**
 * [preview iteration 2] `?ratio=` → glow marker 모행성:위성 비율 파싱.
 *
 * 사용자 피드백 "2:1 or 3:1" 두 비율을 URL 비교 프리뷰 가능하게:
 *  - 미지정 → 2 (기본 2:1 — parent 4.5px / satellite 2.25px)
 *  - `?marker=glow&ratio=3` → 3 (3:1 — parent 4.5px / satellite 1.5px)
 *  - 프리뷰 유연성: 1~10 범위의 유한 수 허용 (예: 2.5)
 *  - 범위 밖 / 비수치 → 2 폴백 + `console.warn`
 *
 * marker=glow 가 아닐 때는 호출 결과가 미사용 (scene 옵션이 무시).
 */
export const GLOW_MARKER_RATIO_DEFAULT = 2;

export function parseGlowMarkerRatio(urlParam: string | null | undefined): number {
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return GLOW_MARKER_RATIO_DEFAULT;
  }
  const parsed = Number(urlParam);
  if (Number.isFinite(parsed) && parsed >= 1 && parsed <= 10) {
    return parsed;
  }

  console.warn(
    `[parse-marker-mode] 유효하지 않은 ?ratio=${urlParam} — ${GLOW_MARKER_RATIO_DEFAULT} 로 폴백`,
  );
  return GLOW_MARKER_RATIO_DEFAULT;
}
