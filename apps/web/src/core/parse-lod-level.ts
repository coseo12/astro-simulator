/**
 * P11-B #289 — `?lod=` URL 파라미터 → `LodOverride` 파싱 순수 함수.
 *
 * 선례: `parse-integrator.ts` / `parse-gr-mode.ts` 동일 구조.
 *
 * 정책:
 *  - 공식값: `high` · `mid` · `low` — 전 body LOD 강제 (디버그/개발 용도)
 *  - `auto` (또는 미지정): 거리 자동 판정 — 기본값
 *  - 대소문자 무시 (URL 사용자 편의)
 *  - 알 수 없는 값 → `'auto'` 폴백 + `console.warn`
 *
 * 런타임 핫스왑은 비지원 — 이 파서는 초기화 시점에 1회만 호출된다.
 *
 * ADR: `docs/decisions/20260424-p11-b-lod-design.md` §축 5
 */
import type { render } from '@astro-simulator/core';

type LodOverride = render.LodOverride;

const VALID_LOD_LEVELS: ReadonlySet<string> = new Set(['high', 'mid', 'low']);

export function parseLodLevel(urlParam: string | null | undefined): LodOverride {
  // 미지정 → 'auto' (거리 자동 판정).
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return 'auto';
  }
  const normalized = urlParam.toLowerCase();
  if (normalized === 'auto') {
    return 'auto';
  }
  if (VALID_LOD_LEVELS.has(normalized)) {
    return normalized as LodOverride;
  }
  // 알 수 없는 값 — parse-integrator 패턴과 동일한 폴백 + warn.
   
  console.warn(`[parse-lod-level] 알 수 없는 ?lod=${urlParam} — 'auto' 로 폴백`);
  return 'auto';
}
