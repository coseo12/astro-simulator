/**
 * #1347 — 시간 이벤트 종류 표 (ADR `docs/decisions/20261016-1347-event-markers.md` 결정 D1 · D5).
 *
 * 종류를 늘릴 때 고칠 곳은 이 표 한 행이다 — 계산 함수 (`compute-events.ts`) 는 **계산 유형**으로만 분기하고 종류 id 를
 * 모른다 (ADR §Concrete Prediction). web 쪽 눈금 색은 `Record<EventKindId, …>` 라 행을 더하면 타입 검사가 누락을 잡는다.
 *
 * 포함 근거는 ADR 축 K 표 — 「고른 시각에 화면에서 사건이 보이고, 실제 날짜와 며칠 이내인가」. 일식 · 월식 · 지구 근일점 ·
 * 엥케 · 핼리 1910/2061 · 화성 근일점은 넣지 않는다 (사용자 결정 K1 (a) · K2 (a) · K3 (a)).
 */

/** 계산 유형 — 계산 함수의 유일한 분기 축. */
export type EventComputation =
  /**
   * 일심 황경 일치 (`λ_subject − λ_reference = 0`, 같은 쪽). 외행성이면 충, 내행성이면 내합이다 — 지심 충/합과 같은 정의
   * (광행차 · 광시간 보정 없음). 반대쪽 일치 (`±π` — 외행성 합 · 내행성 외합) 는 사건이 아니다.
   */
  | { type: 'heliocentric-alignment'; referenceId: string }
  /** 근일점 통과 — 모체 기준 궤도의 평균근점이각 `M ≡ 0 (mod 2π)`. */
  | { type: 'perihelion' };

export type EventKindId =
  | 'mars-opposition'
  | 'venus-inferior-conjunction'
  | 'jupiter-opposition'
  | 'saturn-opposition'
  | 'halley-perihelion'
  | 'swift-tuttle-perihelion';

/** 패널 필터 칩 — 혜성 근일점 2종은 한 칩이다 (결정 D7). */
export type EventFilterId =
  | 'mars-opposition'
  | 'venus-inferior-conjunction'
  | 'jupiter-opposition'
  | 'saturn-opposition'
  | 'comet-perihelion';

export interface EventKindDef {
  id: EventKindId;
  /** 사건의 주체 천체 — 선택 시 `focusOn` 대상 (결정 D6). */
  subjectId: string;
  computation: EventComputation;
  /** 목록 · 스크린리더에 쓰는 사건명 (「화성 충」). */
  labelKo: string;
  filter: EventFilterId;
  /**
   * 사건을 찾는 창 (UTC ISO 날짜, 시작 포함 · 끝 제외). `null` 이면 호출자가 준 범위 전체 (스크러버 1900~2100).
   * 핼리는 1986 회귀만 넣는다 — 1910 · 2061 은 모델 시각이 실제와 계절이 다르다 (ADR 1-A `+192.5` · `−49.5` 일).
   */
  window: { start: string; end: string } | null;
  /**
   * 선택 시 거리 자 기준점을 지구로 자동 설정하는가 (사용자 결정 S3 (b) — 충 · 내합만, 혜성 근일점은 (a)).
   * 지구–행성 선이 그려지고 줌아웃하면 태양–지구–행성 정렬이 보인다.
   */
  autoRulerAnchorEarth: boolean;
}

export const EVENT_KINDS: readonly EventKindDef[] = [
  {
    id: 'mars-opposition',
    subjectId: 'mars',
    computation: { type: 'heliocentric-alignment', referenceId: 'earth' },
    labelKo: '화성 충',
    filter: 'mars-opposition',
    window: null,
    autoRulerAnchorEarth: true,
  },
  {
    id: 'venus-inferior-conjunction',
    subjectId: 'venus',
    computation: { type: 'heliocentric-alignment', referenceId: 'earth' },
    labelKo: '금성 내합',
    filter: 'venus-inferior-conjunction',
    window: null,
    autoRulerAnchorEarth: true,
  },
  {
    id: 'jupiter-opposition',
    subjectId: 'jupiter',
    computation: { type: 'heliocentric-alignment', referenceId: 'earth' },
    labelKo: '목성 충',
    filter: 'jupiter-opposition',
    window: null,
    autoRulerAnchorEarth: true,
  },
  {
    id: 'saturn-opposition',
    subjectId: 'saturn',
    computation: { type: 'heliocentric-alignment', referenceId: 'earth' },
    labelKo: '토성 충',
    filter: 'saturn-opposition',
    window: null,
    autoRulerAnchorEarth: true,
  },
  {
    id: 'halley-perihelion',
    subjectId: 'halley',
    computation: { type: 'perihelion' },
    labelKo: '핼리 혜성 근일점',
    filter: 'comet-perihelion',
    window: { start: '1980-01-01', end: '1993-01-01' },
    autoRulerAnchorEarth: false,
  },
  {
    id: 'swift-tuttle-perihelion',
    subjectId: 'swift-tuttle',
    computation: { type: 'perihelion' },
    labelKo: '스위프트-터틀 혜성 근일점',
    filter: 'comet-perihelion',
    window: null,
    autoRulerAnchorEarth: false,
  },
];

/**
 * 종류별 허용 오차 [일] — 모델 사건 시각과 외부 기준값 (JPL Horizons) 의 차 상한 (결정 D5). UI 배지 「±N일」 과 단위 테스트
 * (DoD M3 (i)) 가 **이 상수 하나**를 쓴다.
 *
 * 값 = #1349 (태양 GM IAU 교정) 머지 후 develop 에서 다시 잰 표본 최대 `|오차|` 를 0.1일 올림 + 0.2일. 표본 · 기준값 ·
 * 조회 조건은 `__test-utils__/external-reference-fixture.ts`, 표본별 측정값은 같은 파일의 `recordedErrorDays`. ADR 1-A 의 값은 교정 전 μ
 * 기준이라 쓰지 않는다 (ADR 재검토 트리거 1).
 */
export const EVENT_KIND_TOLERANCE_DAYS: Readonly<Record<EventKindId, number>> = {
  // 표본 최대 |오차| (일): 화성 0.403 · 금성 0.487 · 목성 1.263 · 토성 0.147 · 핼리 7.838 · 스위프트-터틀 0.316
  'mars-opposition': 0.7,
  'venus-inferior-conjunction': 0.7,
  'jupiter-opposition': 1.5,
  'saturn-opposition': 0.4,
  'halley-perihelion': 8.1,
  'swift-tuttle-perihelion': 0.6,
};

export function getEventKind(id: EventKindId): EventKindDef {
  const def = EVENT_KINDS.find((d) => d.id === id);
  if (!def) throw new Error(`[event-kinds] 알 수 없는 사건 종류: ${id}`);
  return def;
}
