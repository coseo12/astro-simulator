/**
 * #1329 — `?comettails=` URL 파라미터 → 혜성 꼬리 · 코마 초기 상태 파싱 순수 함수
 * (ADR `docs/decisions/20261010-1329-comet-tail-coma.md` 결정 4 · 5 · 사용자 결정 Q7).
 *
 * 어휘 (기존 `parse-*-mode.ts` 의 on/off 에 `force` 하나를 더한다):
 *  - 미지정 / `on`: 켜짐 · 강제 아님 (소프트웨어 렌더 게이트 대상 — 결정 4)
 *  - `off` (대소문자 무시): 꺼짐
 *  - `force`: 켜짐 + **게이트 우회** (소프트웨어 렌더에서도 만든다 — CI 가 꼬리 셰이더를 컴파일·실행하는 경로,
 *    ADR §교차검증 수용 2. `?belt=N` 강제와 같은 구조)
 *  - 그 외: 켜짐 (기본) + `console.warn` — 「모르는 값 → 기본 동작」 관례
 *
 * URL 초기값만 결정한다. 런타임 토글 (PR2) 은 표시 패널이 발행하며 그때 URL 은 ON = 키 삭제 / OFF = `off`
 * (ADR 1265 결정 5) 로 쓴다 — `force` 는 그 왕복 대상이 아니다 (로드 경로 전용).
 */

export interface CometTailsParam {
  /** 꼬리 · 코마 표시 의도. */
  visible: boolean;
  /** 소프트웨어 렌더 게이트를 우회해 생성한다 (`?comettails=force`). */
  forced: boolean;
}

const COMET_TAILS_DEFAULT: CometTailsParam = { visible: true, forced: false };
const COMET_TAILS_OFF: CometTailsParam = { visible: false, forced: false };
const COMET_TAILS_FORCED: CometTailsParam = { visible: true, forced: true };

export function parseCometTailsParam(urlParam: string | null | undefined): CometTailsParam {
  if (urlParam === null || urlParam === undefined || urlParam.trim() === '') {
    return COMET_TAILS_DEFAULT;
  }
  const normalized = urlParam.trim().toLowerCase();
  if (normalized === 'off') return COMET_TAILS_OFF;
  if (normalized === 'on') return COMET_TAILS_DEFAULT;
  if (normalized === 'force') return COMET_TAILS_FORCED;
  console.warn(`[parse-comet-tails-mode] 알 수 없는 ?comettails=${urlParam} — ON (기본) 으로 폴백`);
  return COMET_TAILS_DEFAULT;
}

/** 표시 토글 표의 역방향 파서 (`DisplayToggleDef.parse`, PR2) — 의도만. */
export function parseCometTailsVisible(urlParam: string | null | undefined): boolean {
  return parseCometTailsParam(urlParam).visible;
}

/**
 * 꼬리 메시를 로드 시 만들지 — 소프트웨어 렌더 게이트 (결정 4). 판정은 web 이 하고 core 에는 결과 boolean 만 넘긴다
 * (`resolveBeltAtLoad` 와 같은 레이어 분리).
 *
 * @param visible URL 의도
 * @param forced `?comettails=force` (소프트웨어에서도 생성)
 * @param allowCometTails 렌더러가 꼬리 생성을 허용하는가 (`!isSoftwareRenderer`)
 */
export function resolveCometTailsAtLoad(
  visible: boolean,
  forced: boolean,
  allowCometTails: boolean,
): boolean {
  return visible && (forced || allowCometTails);
}
