/**
 * #1347 — 시간 이벤트 종류 표 (ADR `docs/decisions/20261016-1347-event-markers.md` 결정 D1 · D5).
 *
 * 종류를 늘릴 때 고칠 곳은 이 표 한 행이다 — 계산 함수 (`compute-events.ts`) 는 **계산 유형**으로만 분기하고 종류 id 를
 * 모른다 (ADR §Concrete Prediction). web 쪽 눈금 색은 `Record<EventKindId, …>` 라 행을 더하면 타입 검사가 누락을 잡는다.
 *
 * 포함 근거는 ADR 축 K 표 — 「고른 시각에 화면에서 사건이 보이고, 실제 날짜와 며칠 이내인가」. 지구 근일점 · 엥케 ·
 * 핼리 1910/2061 · 화성 근일점은 넣지 않는다 (사용자 결정 K1 (a) · K2 (a) · K3 (a)). 일식 · 월식은 #1354 가 달 궤도 시간 변화
 * 모델 (PR1) 위에서 더했다 (ADR `20261017-1354-lunar-precession-eclipses.md` 결정 E1 ~ E6).
 */

import type { EclipseType } from './eclipse-geometry.js';

/** 계산 유형 — 계산 함수의 유일한 분기 축. */
export type EventComputation =
  /**
   * 일심 황경 일치 (`λ_subject − λ_reference = 0`, 같은 쪽). 외행성이면 충, 내행성이면 내합이다 — 지심 충/합과 같은 정의
   * (광행차 · 광시간 보정 없음). 반대쪽 일치 (`±π` — 외행성 합 · 내행성 외합) 는 사건이 아니다.
   */
  | { type: 'heliocentric-alignment'; referenceId: string }
  /** 근일점 통과 — 모체 기준 궤도의 평균근점이각 `M ≡ 0 (mod 2π)`. */
  | { type: 'perihelion' }
  /**
   * 삭망 식 (#1354 결정 E1) — 주체 = 위성 (달), 중심 = 그 모체 (지구), 광원 = 체인 뿌리 (태양). 삭망 = 지구 중심 황경차
   * `0` (삭 `new` — 일식) · `π` (망 `full` — 월식) 의 근, 사건 시각은 그 근 ±0.4일 안의 **최대식** (일식 γ 최소 · 월식 그림자
   * 중심 이각 최소 — NASA 목록 시각 정의와 같다). 식이 아닌 삭망은 사건이 아니다.
   */
  | { type: 'syzygy-eclipse'; phase: 'new' | 'full' };

export type EventKindId =
  | 'mars-opposition'
  | 'venus-inferior-conjunction'
  | 'jupiter-opposition'
  | 'saturn-opposition'
  | 'halley-perihelion'
  | 'swift-tuttle-perihelion'
  | 'solar-eclipse'
  | 'lunar-eclipse';

/** 패널 필터 칩 — 혜성 근일점 2종은 한 칩이다 (결정 D7). */
export type EventFilterId =
  | 'mars-opposition'
  | 'venus-inferior-conjunction'
  | 'jupiter-opposition'
  | 'saturn-opposition'
  | 'comet-perihelion'
  | 'solar-eclipse'
  | 'lunar-eclipse';

/**
 * #1360 PR2 결정 C3 (ADR 1354 Q-S Amendment) — 선택 시 카메라 시점. `facing-parent` = 포커스 천체의 모체 쪽 반구를 본다 — 월식은
 * 달의 지구 쪽 반구, 일식 (PR3 — 포커스 천체 = 지구 · 모체 = 태양) 은 지구의 태양 쪽 반구 (그림자가 그 반구에 떨어진다). 웹 레이어가
 * 장면 메시에서 방향을 만들어 `FocusTarget.viewDirection` 으로 넘긴다.
 *
 * `from-sun` (#1390 PR3 — 교육 투어 T3 계절) = 태양 → 대상 직선 위에서 대상을 본다 (기울기 없음 — 원반 중심 = 태양 직하점). 화면 위는
 * 황도 북극이다 (`FocusTarget.viewUp` — ADR `20261021-1390` Amendment 2). 상대 시점이라 대상 천체가 있어야 한다.
 */
export type EventFocusView = 'facing-parent' | 'ecliptic-oblique' | 'from-sun';

/**
 * #1390 Amendment 1 — 대상과 무관한 **절대 방향** 시점. `ecliptic-oblique` = 앱 첫 화면과 같은 시점 각 (황도 북쪽 위에서 비스듬히
 * 내려다봄 — 각의 SSoT 는 `scene` 의 `DEFAULT_CAMERA_ALPHA` · `DEFAULT_CAMERA_BETA`). 대상이 없어도 방향이 정해지므로 개요
 * (태양 중심 — `resetCamera`) 에도 쓸 수 있다. 상대 시점 (`facing-parent` · PR3 의 `from-sun`) 은 대상 천체가 있어야 한다.
 */
export const ABSOLUTE_FOCUS_VIEWS: readonly EventFocusView[] = ['ecliptic-oblique'];

export function isAbsoluteFocusView(view: EventFocusView): boolean {
  return ABSOLUTE_FOCUS_VIEWS.includes(view);
}

export interface EventKindDef {
  id: EventKindId;
  /** 사건의 주체 천체 — 선택 시 `focusOn` 대상 (결정 D6). */
  subjectId: string;
  computation: EventComputation;
  /** 목록 · 스크린리더에 쓰는 사건명 (「화성 충」). 식은 종류 접두가 붙는다 — {@link eventLabelKo}. */
  labelKo: string;
  filter: EventFilterId;
  /**
   * 사건을 찾는 창 (UTC ISO 날짜, 시작 포함 · 끝 제외). `null` 이면 호출자가 준 범위 전체 (스크러버 1900~2100).
   * 핼리는 1986 회귀만 넣는다 — 1910 · 2061 은 모델 시각이 실제와 계절이 다르다 (ADR 1-A `+192.5` · `−49.5` 일).
   */
  window: { start: string; end: string } | null;
  /**
   * 선택 시 거리 자 기준점을 지구로 자동 설정하는가 (사용자 결정 S3 (b) — 충 · 내합 · 식, 혜성 근일점은 (a)).
   * 지구–행성 선이 그려지고 줌아웃하면 태양–지구–행성 정렬이 보인다. 식은 지구–달 선 (#1354 사용자 결정 S (a)).
   */
  autoRulerAnchorEarth: boolean;
  /** 선택 시 카메라 시점 ({@link EventFocusView}). 생략 = 시점 각 유지 (ADR 1347 D6 현행). */
  focusView?: EventFocusView;
  /**
   * #1360 PR3 결정 C3 — 선택 시 포커스 천체. 생략 = {@link subjectId} (ADR 1347 D6 현행). 일식은 주체 (계산 대상) 가 달이지만
   * 그림자가 떨어지는 곳은 지구라 지구에 포커스한다. 계산 함수는 이 필드를 읽지 않는다.
   */
  focusBodyId?: string;
}

/** 사건 선택 시 포커스할 천체 — `focusBodyId` 가 있으면 그것, 없으면 주체 (#1360 PR3 결정 C3). */
export function eventFocusBodyId(kind: Pick<EventKindDef, 'subjectId' | 'focusBodyId'>): string {
  return kind.focusBodyId ?? kind.subjectId;
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
  {
    id: 'solar-eclipse',
    subjectId: 'moon',
    computation: { type: 'syzygy-eclipse', phase: 'new' },
    labelKo: '일식',
    filter: 'solar-eclipse',
    window: null,
    autoRulerAnchorEarth: true,
    focusView: 'facing-parent',
    focusBodyId: 'earth',
  },
  {
    id: 'lunar-eclipse',
    subjectId: 'moon',
    computation: { type: 'syzygy-eclipse', phase: 'full' },
    labelKo: '월식',
    filter: 'lunar-eclipse',
    window: null,
    autoRulerAnchorEarth: true,
    focusView: 'facing-parent',
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
  // #1354 결정 E4 — 같은 규칙, 기준은 NASA 최대식 TD 시각 (`__test-utils__/nasa-eclipse-fixture.ts`). 적중 사건의 최대
  // |오차| 는 `eclipse-events.test.ts` E4 가 기록한다 (일식 0.661 h · 월식 0.670 h = 0.028 일 → 0.1 올림 + 0.2).
  'solar-eclipse': 0.3,
  'lunar-eclipse': 0.3,
};

/** 식 종류 접두 — 「개기」 + 「일식」 = 「개기일식」 (사용자 결정 T (a)). 혼성 일식은 개기 / 금환으로 표기된다. */
const ECLIPSE_TYPE_PREFIX_KO: Readonly<Record<EclipseType, string>> = {
  total: '개기',
  annular: '금환',
  partial: '부분',
  penumbral: '반영',
};

/**
 * 사건 하나의 표기명 — 목록 · 스크린리더 (#1354 결정 E3). 식은 종류를 붙인다 (「개기일식」 · 「반영월식」), 그 밖은 종류 표의
 * `labelKo` 그대로.
 */
export function eventLabelKo(event: { kind: EventKindId; eclipseType?: EclipseType }): string {
  const label = getEventKind(event.kind).labelKo;
  return event.eclipseType ? `${ECLIPSE_TYPE_PREFIX_KO[event.eclipseType]}${label}` : label;
}

export function getEventKind(id: EventKindId): EventKindDef {
  const def = EVENT_KINDS.find((d) => d.id === id);
  if (!def) throw new Error(`[event-kinds] 알 수 없는 사건 종류: ${id}`);
  return def;
}
