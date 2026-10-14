/**
 * #1335 — `?corona=` URL 파라미터 → 태양 코로나 초기 상태 파싱 순수 함수
 * (ADR `docs/decisions/20261014-1335-sun-corona.md` 결정 5 · 6 · 사용자 결정 Q6 · Q7).
 *
 * 어휘 (`parse-comet-tails-mode.ts` 와 같은 3함수 · 같은 어휘):
 *  - 미지정 / `on`: 켜짐 · 강제 아님 (소프트웨어 렌더 게이트 대상 — 결정 5)
 *  - `off` (대소문자 무시): 꺼짐
 *  - `force`: 켜짐 + **게이트 우회** (소프트웨어 렌더에서도 만든다 — CI 가 코로나 셰이더를 컴파일·실행하는 경로, Q7)
 *  - 그 외: 켜짐 (기본) + `console.warn` — 「모르는 값 → 기본 동작」 관례
 *
 * URL 초기값만 결정한다. 런타임 토글 (PR2) 은 표시 패널이 발행하며 그때 URL 은 ON = 키 삭제 / OFF = `off`
 * (ADR 1265 결정 5) 로 쓴다 — `force` 는 그 왕복 대상이 아니다 (로드 경로 전용).
 */

export interface CoronaParam {
  /** 코로나 표시 의도. */
  visible: boolean;
  /** 소프트웨어 렌더 게이트를 우회해 생성한다 (`?corona=force`). */
  forced: boolean;
}

const CORONA_DEFAULT: CoronaParam = { visible: true, forced: false };
const CORONA_OFF: CoronaParam = { visible: false, forced: false };
const CORONA_FORCED: CoronaParam = { visible: true, forced: true };

export function parseCoronaParam(urlParam: string | null | undefined): CoronaParam {
  if (urlParam === null || urlParam === undefined || urlParam.trim() === '') {
    return CORONA_DEFAULT;
  }
  const normalized = urlParam.trim().toLowerCase();
  if (normalized === 'off') return CORONA_OFF;
  if (normalized === 'on') return CORONA_DEFAULT;
  if (normalized === 'force') return CORONA_FORCED;
  console.warn(`[parse-corona-mode] 알 수 없는 ?corona=${urlParam} — ON (기본) 으로 폴백`);
  return CORONA_DEFAULT;
}

/** 표시 토글 표의 역방향 파서 (`DisplayToggleDef.parse`, PR2) — 의도만. */
export function parseCoronaVisible(urlParam: string | null | undefined): boolean {
  return parseCoronaParam(urlParam).visible;
}

/**
 * 코로나 메시를 로드 시 만들지 — 소프트웨어 렌더 게이트 (결정 5). 판정은 web 이 하고 core 에는 결과 boolean 만 넘긴다
 * (`resolveCometTailsAtLoad` 와 같은 레이어 분리).
 *
 * @param visible URL 의도
 * @param forced `?corona=force` (소프트웨어에서도 생성)
 * @param allowCorona 렌더러가 코로나 생성을 허용하는가 (`!isSoftwareRenderer`)
 */
export function resolveCoronaAtLoad(
  visible: boolean,
  forced: boolean,
  allowCorona: boolean,
): boolean {
  return visible && (forced || allowCorona);
}
