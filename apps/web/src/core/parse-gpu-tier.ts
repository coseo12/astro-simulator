/**
 * P11-C #290 — `?gpu=` URL 파라미터 → `GpuTier | 'auto'` 파싱 순수 함수.
 *
 * 선례: `parse-integrator.ts` / `parse-gr-mode.ts` / `parse-lod-level.ts` 동일 구조.
 *
 * 정책 (ADR `20260424-tier-preset-design.md` §결정 §3):
 *  - 공식값: `a` · `b` · `c` — GPU tier 강제 override (자동 감지 우회)
 *  - `auto` (또는 미지정): `detectGpuTier()` 자동 감지 경로로 위임 — 디폴트
 *  - 대소문자 무시 (URL 사용자 편의)
 *  - 알 수 없는 값 → `'auto'` 폴백 + `console.warn` (DoD #3)
 *
 * 런타임 핫스왑은 비지원 — 초기 hydration 시점 1회만 호출된다 (ADR §미해결 1).
 */
import type { GpuTier } from './detect-gpu-tier';

const VALID_GPU_TIERS: ReadonlySet<string> = new Set(['a', 'b', 'c']);

export function parseGpuTier(urlParam: string | null | undefined): GpuTier | 'auto' {
  // 미지정 → 'auto' (자동 감지).
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return 'auto';
  }
  const normalized = urlParam.toLowerCase();
  if (normalized === 'auto') {
    return 'auto';
  }
  if (VALID_GPU_TIERS.has(normalized)) {
    return normalized as GpuTier;
  }
  // 알 수 없는 값 — 기존 parse-* 패턴과 동일한 폴백 + warn.

  console.warn(`[parse-gpu-tier] 알 수 없는 ?gpu=${urlParam} — 'auto' 로 폴백`);
  return 'auto';
}
