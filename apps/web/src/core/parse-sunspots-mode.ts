/**
 * #1412 — `?sunspots=` URL 파라미터 → 태양 흑점 초기 상태 파싱 순수 함수
 * (ADR `docs/decisions/20261025-1412-sunspots.md` 결정 5 · 사용자 결정 Q6 · Q9).
 *
 * 어휘 (`parse-corona-mode.ts` 의 `off` 부분만 — `force` 없음):
 *  - 미지정 / `on`: 켜짐 (소프트웨어 렌더 게이트 대상 — 결정 5 · Q9)
 *  - `off` (대소문자 무시): 꺼짐
 *  - 그 외: 켜짐 (기본) + `console.warn` — 「모르는 값 → 기본 동작」 관례
 *
 * `force` 를 두지 않는 이유: CI (swiftshader) 에서 흑점 셰이더 경로를 강제로 켜는 셀을 만들지 않는다 (신규 가드 0 — 결정 5).
 * URL 초기값만 결정한다. 런타임 토글 (PR2) 은 표시 패널이 발행하며 그때 URL 은 ON = 키 삭제 / OFF = `off` (ADR 1265 결정 5).
 */

/** 흑점 표시 의도 (`DisplayToggleDef.parse` 형태 — PR2 표시 토글 표가 그대로 쓴다). */
export function parseSunspotsVisible(urlParam: string | null | undefined): boolean {
  if (urlParam === null || urlParam === undefined || urlParam.trim() === '') return true;
  const normalized = urlParam.trim().toLowerCase();
  if (normalized === 'off') return false;
  if (normalized === 'on') return true;
  console.warn(`[parse-sunspots-mode] 알 수 없는 ?sunspots=${urlParam} — ON (기본) 으로 폴백`);
  return true;
}

/**
 * 흑점을 로드 시 켤지 — 소프트웨어 렌더 게이트 (결정 5 · Q9). 판정은 web 이 하고 core 에는 결과 boolean 만 넘긴다
 * (`resolveCoronaAtLoad` 와 같은 레이어 분리 — core 는 렌더러를 모른다).
 *
 * @param visible URL 의도
 * @param allowSunspots 렌더러가 흑점을 허용하는가 (`!isSoftwareRenderer`)
 */
export function resolveSunspotsAtLoad(visible: boolean, allowSunspots: boolean): boolean {
  return visible && allowSunspots;
}
