/**
 * P7-E #210 — `?gr=` URL 파라미터 → `GrMode` 파싱 순수 함수.
 *
 * 선례: `parseIntegratorKind` (apps/web/src/core/parse-integrator.ts).
 * 기존: `sim-canvas.tsx` 내부 IIFE 파서 (P5-A/P6-C 도입).
 *
 * 정책:
 * - 공식값: `off` · `single-1pn` · `eih`
 * - URL 별칭:
 *   - `1`   → `single-1pn` (P5-A 호환 유지)
 *   - `1pn` → `single-1pn`
 * - 미지정(null/undefined/'') → `'off'` (기본값)
 * - 알 수 없는 값 → `'off'` 폴백 + `console.warn`
 * - 대소문자 무시 (volt #21 — `?integrator` 와 정책 정렬; EIH / 1PN / Off 등 사용자 입력 허용)
 *
 * 런타임 핫스왑은 비지원. 이 파서는 초기화 시점에 1회만 호출된다.
 */
export type GrMode = 'off' | 'single-1pn' | 'eih';

export function parseGrMode(urlParam: string | null | undefined): GrMode {
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return 'off';
  }
  const normalized = urlParam.toLowerCase();
  if (normalized === 'off') return 'off';
  if (normalized === '1' || normalized === '1pn' || normalized === 'single-1pn') {
    return 'single-1pn';
  }
  if (normalized === 'eih') return 'eih';
  // 알 수 없는 값 — parseIntegratorKind 와 동일한 폴백 + warn.
  // eslint-disable-next-line no-console
  console.warn(`[parse-gr-mode] 알 수 없는 ?gr=${urlParam} — 'off'로 폴백`);
  return 'off';
}
