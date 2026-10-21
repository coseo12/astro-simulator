import type { TourDef } from './types';

/**
 * 2024-03-10 삭 (일식 한 달 전) [JD, TT≈UT 구분 없이 장면 시각]. 출처: USNO Astronomical Applications Dept., 「Phases of the
 * Moon 2024」 — New Moon 2024 Mar 10 09:00 UT → JD 2460379.875. 사건 파일 (`time-events.json`) 에는 식이 아닌 삭이 없어
 * 이 한 값만 상수로 둔다 (ADR `20261021-1390` §Visual Fidelity 1 — 하드코딩 1개 + 출처). 장면 위치 모델의 삭 정밀도는 #1354
 * 범위 (±0.76 h) 라 단계 장면 (그림자가 지구를 비껴감) 에는 영향이 없다.
 */
export const NEW_MOON_2024_03_10_JD = 2460379.875;

/** 그림자 재생 단계 (T2-5) 배속 — 10 분/초 [초/초]. */
const SHADOW_SWEEP_TIME_SCALE = 600;

/**
 * #1390 T2 — 일식은 왜 생기나 (ADR `20261021-1390` §첫 릴리스 투어 T2). 단계 필드 — 사건 id · 시점 · 거리 자 · 배속 연출 · 재생
 * 구간 — 를 가장 많이 덮는 투어라 엔진 계약을 첫 PR 에서 실증한다 (Q8).
 *
 * ⚠️ 2 → 3 은 같은 천체 (지구) 연속 단계다 — 카메라를 다시 잡으려면 `view` 가 있어야 한다 (`types.ts` `TourCamera.view`).
 * 1 은 `view` 를 두지 않는다 (지구를 어느 쪽에서 보든 일직선 장면이 성립 — 시점 각 유지).
 *
 * 표시 — 시점 방향 단계 (2~5) 는 궤도선을 끈다. 태양 쪽에서 지구 · 달을 가까이 보면 다른 천체의 궤도선이 화면을 가로질러
 * 그림자 장면을 가린다 (PR1 실 GPU 스크린샷 — ADR T4 가 별자리 단계에서 궤도선을 끄는 것과 같은 이유). 1 은 달 궤도 원이
 * 「일직선」 을 보이는 데 쓰이므로 켠 채 (스냅샷 값) 둔다. ADR T2 표의 표시 열 「—」 에서 바뀐 점이다 — PR 본문에 적는다.
 */

/** 시점 방향 단계의 표시 — 궤도선 끔 (위 주석). */
const SHADOW_VIEW_DISPLAY = { orbits: false } as const;
export const ECLIPSE_TOUR = {
  id: 'eclipse',
  title: '일식은 왜 생기나',
  shortTitle: '일식',
  summary: '달 그림자가 지구에 떨어지는 순간과, 매달 일식이 일어나지 않는 이유',
  steps: [
    {
      id: 'alignment',
      title: '일식의 순간',
      body: '2024년 4월 8일, 달이 태양과 지구 사이에 거의 일직선으로 들어왔습니다. 거리 자가 지구와 달 사이 거리를 보여 줍니다. 화면의 달은 보기 쉽게 실제보다 크고 멀리 그렸습니다.',
      camera: { focus: 'earth' },
      time: { eventId: 'solar-eclipse:2024-04-08' },
      ruler: 'moon',
    },
    {
      id: 'shadow',
      title: '달 그림자',
      body: '태양 쪽에서 지구를 봅니다. 달의 그림자가 북아메리카에 떨어졌습니다. 그 아래에서는 한낮인데도 하늘이 어두워지고 태양이 가려졌습니다.',
      camera: { focus: 'earth', view: 'facing-parent' },
      display: SHADOW_VIEW_DISPLAY,
      time: { eventId: 'solar-eclipse:2024-04-08' },
    },
    {
      id: 'new-moon-miss',
      title: '한 달 전에는 왜 없었을까',
      body: '2024년 3월 10일에도 달은 태양과 지구 사이(삭)에 있었지만, 그림자는 지구를 비껴갑니다. 달의 궤도가 지구 궤도면에서 약 5° 기울어 있어 삭마다 일식이 일어나지는 않습니다.',
      camera: { focus: 'earth', view: 'facing-parent' },
      display: SHADOW_VIEW_DISPLAY,
      time: { julianDate: NEW_MOON_2024_03_10_JD },
    },
    {
      id: 'lunar-eclipse',
      title: '반대의 경우 — 월식',
      body: '2025년 3월 14일에는 지구가 태양과 달 사이에 들어갔습니다. 이번에는 지구의 그림자가 달을 덮습니다. 달의 지구 쪽 면에서 개기 월식을 봅니다.',
      camera: { focus: 'moon', view: 'facing-parent' },
      display: SHADOW_VIEW_DISPLAY,
      time: { eventId: 'lunar-eclipse:2025-03-14' },
    },
    {
      id: 'shadow-sweep',
      title: '그림자가 지나간다',
      body: '다시 2024년 4월 8일, 일식 3시간 전부터 10분/초로 흘려 봅니다. 달 그림자가 지표를 가로질러 지나가고, 6시간 뒤에 멈춥니다.',
      camera: { focus: 'earth', view: 'facing-parent' },
      display: SHADOW_VIEW_DISPLAY,
      time: { eventId: 'solar-eclipse:2024-04-08', offsetHours: -3 },
      timeScale: SHADOW_SWEEP_TIME_SCALE,
      windowDays: 0.25,
    },
  ],
} as const satisfies TourDef;
