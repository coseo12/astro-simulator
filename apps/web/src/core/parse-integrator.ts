/**
 * P7-B #207 — `?integrator=` URL 파라미터 → `IntegratorKind` 파싱 순수 함수.
 *
 * 선례: `apps/web/src/components/sim-canvas.tsx`의 `?gr=` IIFE 파서 (P6-C).
 *
 * 정책:
 * - 공식값: `velocity-verlet` · `yoshida4`
 * - 별칭(정확히 1개): `verlet` → `velocity-verlet`
 *   (약어 `vv`/`yo4` 는 도입하지 않음 — 문서화 비용/사용자 혼란 최소화)
 * - 미지정(null/undefined/'') → `'velocity-verlet'` (기본값)
 * - 알 수 없는 값 → `'velocity-verlet'` 폴백 + `console.warn`
 * - 대소문자 무시 (URL 사용자 편의)
 *
 * 런타임 핫스왑은 비지원. 이 파서는 초기화 시점에 1회만 호출된다.
 */
import type { physics } from '@astro-simulator/core';

type IntegratorKind = physics.IntegratorKind;

export function parseIntegratorKind(urlParam: string | null | undefined): IntegratorKind {
  if (urlParam === null || urlParam === undefined || urlParam === '') {
    return 'velocity-verlet';
  }
  const normalized = urlParam.toLowerCase();
  if (normalized === 'velocity-verlet' || normalized === 'verlet') {
    return 'velocity-verlet';
  }
  if (normalized === 'yoshida4') {
    return 'yoshida4';
  }
  // 알 수 없는 값 — GrMode 패턴과 동일한 폴백 + warn.
  // eslint-disable-next-line no-console
  console.warn(`[parse-integrator] 알 수 없는 ?integrator=${urlParam} — 'velocity-verlet'로 폴백`);
  return 'velocity-verlet';
}
