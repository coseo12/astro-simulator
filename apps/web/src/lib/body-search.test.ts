import { describe, expect, it } from 'vitest';
import { ephemeris } from '@astro-simulator/core';
import { normalizeQuery, searchBodies, type SearchableBody } from './body-search';

/** 실데이터 SSoT — 계약 D2 의 1순위 판정은 실제 32 body 위에서 본다. */
const bodies = ephemeris.getSolarSystem().bodies;
const ids = (query: string) => searchBodies(bodies, query).map((b) => b.id);

describe('#1293 D2 — 실데이터 1순위', () => {
  it.each([
    ['목성', 'jupiter'],
    ['jup', 'jupiter'],
    ['Halley', 'halley'],
    ['타이탄', 'titan'],
  ])('「%s」 → %s 가 결과 1순위', (query, expected) => {
    expect(ids(query)[0]).toBe(expected);
  });

  it('대소문자 무시 · 앞뒤 공백 무시 — 「  JUP  」 = 「jup」', () => {
    expect(ids('  JUP  ')).toEqual(ids('jup'));
    expect(ids('HALLEY')[0]).toBe('halley');
  });

  it('nameEn 부분 일치 — 「halley」 는 id 접두이고 「1P/Halley」 의 부분이다 (결과는 핼리 1개)', () => {
    expect(ids('halley')).toEqual(['halley']);
    expect(ids('1p/')).toEqual(['halley']);
  });

  it('동률은 데이터 순 — 「tit」 은 titan · titania 둘 다 접두 일치, 데이터 순서대로', () => {
    expect(ids('tit')).toEqual(['titan', 'titania']);
  });

  it('한국어 부분 일치 — 「혜성」 은 혜성 3개를 데이터 순서대로', () => {
    expect(ids('혜성')).toEqual(['halley', 'encke', 'swift-tuttle']);
  });

  it('일치 없음 → 빈 배열', () => {
    expect(ids('zzz-no-such-body')).toEqual([]);
  });

  it('빈 검색어 · 공백만 → 전체를 데이터 순서대로 (32개)', () => {
    expect(ids('')).toEqual(bodies.map((b) => b.id));
    expect(ids('   ')).toHaveLength(32);
  });
});

describe('#1293 — 순위 규칙 (합성 데이터)', () => {
  const synthetic: SearchableBody[] = [
    { id: 'x-sub', nameKo: '가나다', nameEn: 'Abcfoo' }, // 「foo」 부분 일치 (데이터 순서 앞)
    { id: 'y-pre', nameKo: '라마바', nameEn: 'Foobar' }, // 「foo」 접두 일치
    { id: 'foo-id', nameKo: '사아자', nameEn: 'Zzz' }, // id 접두 일치
    { id: 'z-none', nameKo: '차카타', nameEn: 'Qqq' }, // 불일치
  ];

  it('접두 일치 > 부분 일치 — 데이터 순서가 앞선 부분 일치보다 뒤의 접두 일치가 먼저', () => {
    expect(searchBodies(synthetic, 'foo').map((b) => b.id)).toEqual(['y-pre', 'foo-id', 'x-sub']);
  });

  it('입력 배열을 바꾸지 않는다', () => {
    const before = synthetic.map((b) => b.id);
    searchBodies(synthetic, 'foo');
    expect(synthetic.map((b) => b.id)).toEqual(before);
  });

  it('normalizeQuery — trim + 소문자', () => {
    expect(normalizeQuery('  Jup \t')).toBe('jup');
  });

  it('리뷰 R4 — NFD(자모 분해형) 한글 검색어도 완성형 데이터와 일치', () => {
    const nfd = '목성'.normalize('NFD');
    expect(nfd).not.toBe('목성'); // 전제 — 분해형이 실제로 다른 코드포인트열이다
    expect(normalizeQuery(nfd)).toBe('목성');
  });
});
