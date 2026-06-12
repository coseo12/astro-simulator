/**
 * #675 — `?marker=` URL 파라미터 → marker 모드 파싱 순수 함수.
 *
 * 선례: `parse-gpu-tier.ts` / `parse-lod-level.ts` 동일 구조.
 * ADR `docs/decisions/20260613-675-glow-pixel-marker.md` §축 1/§축 7.
 *
 * 정책 (PM 확정 2026-06-13 — 기본 ON):
 *  - 미지정 / `glow`: glow pixel marker 활성 (**기본 ON** — web 레이어 결정. core
 *    `glowMarker` 옵션 기본값은 false 유지, ADR §축 1 레이어 분리)
 *  - `off`: 옵트아웃 — 기존 동작과 100% 동일 (glow 분기 연산 0)
 *  - 대소문자 무시 (URL 사용자 편의)
 *  - 알 수 없는 값 → 기본값 `'glow'` 폴백 + `console.warn` (parse-gpu-tier 등
 *    "unknown → 기본 동작" 패턴 정합)
 *  - `?marker=glow` 명시 지정은 기본값과 동일 — 하위 호환 (프리뷰 공유 URL 보존)
 *
 * 런타임 핫스왑은 비지원 — 초기 hydration 시점 1회만 호출된다.
 */
export type MarkerMode = 'off' | 'glow';

export function parseMarkerMode(urlParam: string | null | undefined): MarkerMode {
  // 미지정 → 'glow' (기본 ON — ADR §축 1: default 진입 화면의 sub-pixel body 비식별 gap 해소).
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return 'glow';
  }
  const normalized = urlParam.toLowerCase();
  if (normalized === 'off') {
    return 'off';
  }
  if (normalized === 'glow') {
    return 'glow';
  }
  // 알 수 없는 값 — 기본값 'glow' 폴백 + warn (기존 parse-* "unknown → 기본 동작" 패턴).

  console.warn(`[parse-marker-mode] 알 수 없는 ?marker=${urlParam} — 'glow' (기본) 로 폴백`);
  return 'glow';
}

/**
 * #675 — `?ratio=` → glow marker 모행성:위성 비율 파싱.
 *
 * PM 확정 기본 2:1 (parent 4.5px / satellite 2.25px). 파라미터는 디버그/후속 PM 튜닝용
 * 유지 (ADR §축 7 — 기본 2 가 확정값이므로 default 경로 무영향):
 *  - 미지정 → 2 (기본 2:1)
 *  - `?ratio=3` → 3 (3:1 — parent 4.5px / satellite 1.5px, 프리뷰에서 비채택된 비교값)
 *  - 1~10 범위의 유한 수 허용 (예: 2.5)
 *  - 범위 밖 / 비수치 → 2 폴백 + `console.warn`
 *
 * marker=off 일 때는 호출 결과가 미사용 (scene 옵션이 무시).
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
