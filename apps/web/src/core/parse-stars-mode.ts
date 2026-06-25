/**
 * #738 — `?stars=` URL 파라미터 → 별 배경 (starfield) 초기 가시성 파싱 순수 함수.
 *
 * 선례: `parse-orbits-mode.ts` / `parse-marker-mode.ts` 동일 구조 (기본 ON + `?x=off` 옵트아웃).
 *
 * 정책 (ADR `docs/decisions/20260624-738-procedural-starfield.md` §결정 7):
 *  - 미지정 / `on`: 별 배경 표시 (**기본 ON** — 트랙 A1 몰입 핵심, 별 배경이 기본 경험)
 *  - `off`: 별 배경 숨김 — `?stars=off` 진입 시 OFF 로 시작 (orbits `?orbits=off` 패턴 동일)
 *  - 대소문자 무시 (URL 사용자 편의)
 *  - 알 수 없는 값 → 기본값 `true` (ON) 폴백 + `console.warn`
 *    (parse-orbits-mode 등 "unknown → 기본 동작" 패턴 정합)
 *
 * 반환은 `boolean` (visible) — scene `createSolarSystemScene({ starfield: visible })` 옵션과
 * 직접 정합. URL 초기값만 결정하며, 런타임 토글 UI 는 비-범위 (#675 marker 와 동일 — 초기 옵트아웃만).
 */
import type { GpuTier } from './detect-gpu-tier';

export function parseStarsVisible(urlParam: string | null | undefined): boolean {
  // 미지정 → true (기본 ON — 트랙 A1 몰입 기본 경험).
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
  // 알 수 없는 값 — 기본값 true (ON) 폴백 + warn (parse-orbits-mode "unknown → 기본 동작" 패턴).

  console.warn(`[parse-stars-mode] 알 수 없는 ?stars=${urlParam} — ON (기본) 으로 폴백`);
  return true;
}

/**
 * #738 Amendment (PR #742) — GPU tier 를 반영한 starfield 최종 가시성 결정.
 *
 * **GPU tier-c (swiftshader/저성능) 에서는 별 배경을 생성하지 않는다** (fill-rate graceful
 * degradation). 전체화면 절차 fragment shader 가 tier-c 에서 fill-rate 치명타 (CI desktop
 * ~13fps, baseline 49.9 대비 진짜 회귀 — ADR §Amendment 1). `detect-gpu-tier.ts §계약 6` 의
 * tier-c 자동 억제 (파티클 0 / post-proc OFF) 철학의 starfield 확장.
 *
 * 부수 효과: tier-c 에서 반투명 UI (shortcut-bar) 뒤 별 비침이 사라져 r1-guard baseline 일치.
 * `?gpu=b|a` URL override 로 tier-c 환경에서도 강제 ON 가능 (gpuTier 가 'b'/'a' 로 전달됨).
 *
 * @param starsVisible `parseStarsVisible(?stars=)` 결과 (URL 기반 1차 의향)
 * @param gpuTier 감지된 GPU tier ('a' | 'b' | 'c')
 * @returns 최종 starfield 가시성 — tier-c 면 항상 false, 그 외엔 starsVisible 그대로
 */
export function resolveStarfieldVisible(starsVisible: boolean, gpuTier: GpuTier): boolean {
  return starsVisible && gpuTier !== 'c';
}
