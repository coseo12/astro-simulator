import { isRPhaseFocusable } from '@astro-simulator/core';

/**
 * #1341 PR2 — `?ruler=<기준점 id>` URL 파라미터 → 거리 자 기준점 A (ADR `docs/decisions/20261015-1341-trail-ruler.md`
 * 결정 R7 · 사용자 결정 Q-R7 (a)). B 는 기존 `?focus=` 가 정한다.
 *
 *  - 키 없음 (`null` · `undefined`): 기준점 없음 (warn 없음)
 *  - 빈 값 · 공백: 무시 + `console.warn`
 *  - R-Phase allowlist (`isRPhaseFocusable` — 선택 · 포커스가 허용되는 천체 집합) 밖 · 미등록 id: 무시 + `console.warn`
 *  - 그 외: 앞뒤 공백을 뗀 id
 *
 * warn 은 프로덕션에서도 낸다 — `parse-trails-mode.ts` 와 같은 「모르는 값 → 기본 동작 + 경고」 관례 (DoD E6 은 prod 빌드에서 잰다).
 */
export function parseRulerAnchor(urlParam: string | null | undefined): string | null {
  if (urlParam === null || urlParam === undefined) return null;
  const id = urlParam.trim();
  if (id === '') {
    console.warn('[parse-ruler-anchor] 빈 ?ruler= — 무시 (기준점 없음)');
    return null;
  }
  if (!isRPhaseFocusable(id)) {
    console.warn(`[parse-ruler-anchor] 알 수 없는 ?ruler=${urlParam} — 무시 (기준점 없음)`);
    return null;
  }
  return id;
}
