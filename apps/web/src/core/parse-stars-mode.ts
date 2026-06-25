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
 * #738 Amendment (PR #742) / #745 Amendment 2 — starfield 최종 가시성 결정.
 *
 * **소프트웨어 렌더 (swiftshader/llvmpipe/swrast) 에서는 별 배경을 생성하지 않는다** (fill-rate
 * graceful degradation). 전체화면 절차 fragment shader 가 소프트웨어 렌더에서 fill-rate 치명타
 * (CI desktop ~13fps, baseline 49.9 대비 진짜 회귀 — ADR §Amendment 1).
 *
 * #745 정정 (ADR §Amendment 2): Amendment 1 은 비활성 기준을 GPU tier-c 로 잡았으나, tier-c 가
 * "WebGPU 미지원 데스크톱 전부" (소프트웨어 + WebGL2 **하드웨어** 가속 무구분) 라 하드웨어 가속
 * PC 에서도 별이 사라지는 과잉 비활성 회귀 (v0.35.0). 비활성 진짜 기준은 **소프트웨어 렌더** 이므로
 * tier 결합을 제거하고 `allowStarfield: boolean` 로 일반화 — 호출부(sim-canvas)가
 * `!isSoftwareRenderer` 를 전달한다. tier 의 LOD 억제 등 다른 graceful degradation 은 불변.
 *
 * 부수 효과: 소프트웨어 렌더 (CI 항상 swiftshader) 에서 반투명 UI (shortcut-bar) 뒤 별 비침이
 * 사라져 r1-guard baseline 일치. `?stars=off` 옵트아웃은 starsVisible 로 직교 보존.
 *
 * @param starsVisible `parseStarsVisible(?stars=)` 결과 (URL 기반 1차 의향)
 * @param allowStarfield GPU 환경이 별 배경 생성을 허용하는가 (`!isSoftwareRenderer`)
 * @returns 최종 starfield 가시성 — 소프트웨어 렌더면 항상 false, 그 외엔 starsVisible 그대로
 */
export function resolveStarfieldVisible(starsVisible: boolean, allowStarfield: boolean): boolean {
  return starsVisible && allowStarfield;
}
