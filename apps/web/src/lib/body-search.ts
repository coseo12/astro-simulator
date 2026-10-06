/**
 * #1293 — 천체 검색 매칭 (순수 함수, React · DOM 비의존).
 *
 * 이름 SSoT 는 `packages/shared/data/solar-system.json` (`nameKo` · `nameEn` · `id`) 이다. 호출부는
 * `ephemeris.getSolarSystem().bodies` 를 그대로 넘긴다 — 여기서 이름 표를 따로 들지 않는다.
 *
 * ## 순위 규칙
 *   1. 검색어를 앞뒤 공백 제거 + 소문자화 + NFC 정규화한다 (한글은 대소문자가 없어 소문자화 영향 0).
 *   2. 세 필드 중 하나라도 검색어로 **시작**하면 접두 일치(0), 그렇지 않고 어딘가에 **포함**하면 부분 일치(1).
 *      어느 쪽도 아니면 결과에서 뺀다.
 *   3. 접두 일치 > 부분 일치. 같은 순위끼리는 **데이터 순서** (안정 정렬 — 원래 인덱스로 동률을 깬다).
 *
 * 빈 검색어(공백만 포함)는 **전체를 데이터 순서대로** 돌려준다 — 대화상자를 연 직후 목록을 훑어 고를 수 있게.
 */

/** 검색 대상이 갖춰야 할 최소 필드 (`LoadedCelestialBody` 의 부분집합). */
export interface SearchableBody {
  id: string;
  nameKo: string;
  nameEn: string;
}

/** 접두 일치 순위. */
const RANK_PREFIX = 0;
/** 부분 일치 순위. */
const RANK_SUBSTRING = 1;

/**
 * 검색어 정규화 — 앞뒤 공백 제거 + 소문자 + NFC. NFC 는 자모 분해형(NFD)으로 들어온 한글(일부 macOS 붙여넣기 등)을
 * 데이터의 완성형과 같은 코드포인트로 맞춘다 (PR #1294 리뷰 R4).
 */
export function normalizeQuery(query: string): string {
  return query.normalize('NFC').trim().toLowerCase();
}

/** 한 body 의 순위. 일치하지 않으면 `null`. `q` 는 정규화된 비어 있지 않은 검색어. */
function rankOf(body: SearchableBody, q: string): number | null {
  const fields = [body.nameKo, body.nameEn, body.id].map((f) => f.toLowerCase());
  if (fields.some((f) => f.startsWith(q))) return RANK_PREFIX;
  if (fields.some((f) => f.includes(q))) return RANK_SUBSTRING;
  return null;
}

/**
 * 검색어로 body 를 거르고 순위대로 정렬한다. 입력 배열은 바꾸지 않는다.
 *
 * @returns 일치한 body (접두 일치 → 부분 일치, 동률은 데이터 순). 빈 검색어면 전체 복사본.
 */
export function searchBodies<T extends SearchableBody>(bodies: readonly T[], query: string): T[] {
  const q = normalizeQuery(query);
  if (q === '') return [...bodies];
  const ranked: { body: T; rank: number; index: number }[] = [];
  bodies.forEach((body, index) => {
    const rank = rankOf(body, q);
    if (rank !== null) ranked.push({ body, rank, index });
  });
  ranked.sort((a, b) => a.rank - b.rank || a.index - b.index);
  return ranked.map((r) => r.body);
}
