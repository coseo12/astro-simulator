/**
 * #1373 PR2 — `?constellations=` URL 파라미터 → 별자리 선 · 이름 초기 의도 파싱 순수 함수
 * (ADR `docs/decisions/20261018-1373-star-catalog-constellations.md` 결정 T1 · 사용자 결정 Q-D (a)).
 *
 * `?trails=` (ADR 1341 결정 T10) 와 같은 **기본 꺼짐 · 옵트인** 어휘다:
 *  - 미지정 (빈 값 포함) / `off` (대소문자 무시): 꺼짐
 *  - `on` (대소문자 무시): 켜짐
 *  - 그 외: 꺼짐 (기본) + `console.warn` — 「모르는 값 → 기본 동작」 관례
 *
 * 반환값은 **의도**다. 소프트웨어 렌더 게이트 (결정 R5 — 별 배경과 같은 `!isSoftwareRenderer`) 는 호출자가 건다. `force` 류
 * 강제 어휘는 만들지 않는다 (결정 R5). 이름 라벨은 추가로 `?labels=` 가 켜져 있어야 보인다 (결정 T2).
 * 쓰는 쪽은 `serializeDisplayToggle(visible, defaultVisible=false)` — 켜짐 = `on`, 꺼짐 = 키 삭제.
 */

/** URL 초기값 → 별자리 표시 의도. */
export function parseConstellationsVisible(urlParam: string | null | undefined): boolean {
  if (urlParam === null || urlParam === undefined || urlParam.trim() === '') return false;
  const normalized = urlParam.trim().toLowerCase();
  if (normalized === 'on') return true;
  if (normalized === 'off') return false;
  console.warn(
    `[parse-constellations-mode] 알 수 없는 ?constellations=${urlParam} — OFF (기본) 으로 폴백`,
  );
  return false;
}
