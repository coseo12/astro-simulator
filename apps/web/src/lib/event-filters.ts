// #1347 — 사건 패널 종류 필터 기본값 (ADR `docs/decisions/20261016-1347-event-markers.md` 결정 D7). store 초기값이 쓴다.
// core 는 type import 만 한다 — store 는 거의 모든 컴포넌트가 import 하고, 테스트 다수가 `@astro-simulator/core` 를 부분 mock 한다.
import type { EventFilterId } from '@astro-simulator/core';

/**
 * 목성 · 토성 충은 매년 1회라 눈금이 2.5 px 간격 (ADR 1-D) 이어서 기본 꺼짐. 일식 · 월식은 연 2.3건씩이라 데스크톱 트랙에서 눈금
 * 간격이 `~1` px — 같은 기준으로 둘 다 기본 꺼짐 (#1354 결정 E6 · 사용자 결정 K1 (a)).
 */
export const EVENT_FILTER_DEFAULTS: Readonly<Record<EventFilterId, boolean>> = {
  'mars-opposition': true,
  'venus-inferior-conjunction': true,
  'jupiter-opposition': false,
  'saturn-opposition': false,
  'comet-perihelion': true,
  'solar-eclipse': false,
  'lunar-eclipse': false,
};
