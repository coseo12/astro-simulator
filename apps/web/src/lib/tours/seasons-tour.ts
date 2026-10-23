import {
  APHELION_2024_JD,
  DECEMBER_SOLSTICE_2024_JD,
  JUNE_SOLSTICE_2024_JD,
  PERIHELION_2025_JD,
  SEPTEMBER_EQUINOX_2024_JD,
} from './season-dates';
import type { TourDef } from './types';

/**
 * 태양에서 본 지구 단계 (3 ~ 5) 의 표시. 종료 시 스냅샷으로 되돌아간다 (엔진 `planDisplayRestore`).
 * - 구름 끔 — 원반 중심 (태양 직하점) 둘레의 대륙 윤곽이 보여야 「어느 반구가 태양을 향하나」 가 읽힌다.
 * - 궤도선 끔 — 태양 쪽에서 지구를 가까이 보면 다른 천체의 궤도선이 원반을 가로지른다 (일식 투어 시점 단계와 같은 이유).
 * - 이름 라벨 끔 — 「지구」 라벨이 원반 한가운데 (= 태양 직하점) 에 붙어 이 장면이 보이려는 점을 가린다 (1280 실측 스크린샷).
 */
const SUN_VIEW_DISPLAY = { clouds: false, orbits: false, labels: false } as const;

/**
 * 근원일점 단계 (1 · 2) 의 시점 — 앱 첫 화면과 같은 「황도 위 비스듬히」 (절대 시점). 시점을 두지 않으면 진입 경로가 화면을 정한다
 * (#1390 Amendment 1 과 같은 기전) — 특히 3 단계 (`from-sun`) 에서 「이전」 으로 오면 카메라가 태양 → 지구 선 위에 남아 거리 자 선이
 * 카메라를 관통해 보이지 않는다.
 */
const DISTANCE_VIEW = 'ecliptic-oblique';

/**
 * #1390 T3 — 계절은 왜 바뀌나 (ADR `20261021-1390` §첫 릴리스 투어 T3 · 1-F · Amendment 2).
 *
 * 1 · 2 는 거리 자 (기준점 태양 · B = 선택 지구) 로 근원일점 거리를 보인다 — 화면 값은 장면 궤도 모델의 실제 거리다 (T2-1 의 지구–달
 * 선과 같은 거리 자). 3 ~ 5 는 `from-sun` (태양 → 지구 직선, 기울기 없음) 이라 원반 중심이 태양 직하점이다.
 *
 * 문안 수치 — 근일점 0.983 · 원일점 1.017 AU 는 앱 지구 궤도 요소 (`packages/shared/data/solar-system.json` — a 1.00000261 AU,
 * e 0.01671123) 의 a(1 ∓ e) 와 같다 (0.98329 · 1.01671). 거리 차 3% 는 2e = 3.34 % (평균 거리 a 대비), 햇빛 세기 차 7% 는 거리
 * 제곱 반비례로 ((1 + e) / (1 − e))² − 1 = 6.91 % 다. 자전축 기울기 23.4° 는 같은 데이터의 `axialTiltDeg` (23.44) 다.
 * `tours-content.test.ts` 가 이 수치들을 데이터에서 셈해 문안과 대조한다.
 *
 * 3 → 4 → 5 는 하지 → 동지 → 그 「사이」 의 추분이다 (5단계 시각이 3 · 4 사이 — 문안 「하지와 동지 사이」 가 문자 그대로 참).
 *
 * ⚠️ 전 단계가 같은 천체 (지구) 다 — 단계마다 `view` 로 카메라를 다시 잡는다 (`types.ts` `TourCamera.view`).
 */
export const SEASONS_TOUR = {
  id: 'seasons',
  title: '계절은 왜 바뀌나',
  shortTitle: '계절',
  summary: '태양과의 거리가 아니라 기울어진 자전축이 계절을 만드는 까닭',
  steps: [
    {
      id: 'aphelion',
      title: '7월, 가장 먼 때',
      body: '2024년 7월 5일, 지구는 태양에서 가장 먼 원일점에 있습니다. 거리 자가 실제 거리 약 1.017 AU를 보여 줍니다. 그런데 북반구는 이때 여름입니다. 지구는 보기 쉽게 실제보다 크게 그렸습니다.',
      camera: { focus: 'earth', view: DISTANCE_VIEW },
      time: { julianDate: APHELION_2024_JD },
      ruler: 'sun',
    },
    {
      id: 'perihelion',
      title: '1월, 가장 가까운 때',
      body: '반년 뒤 2025년 1월 4일, 가장 가까운 근일점에서는 약 0.983 AU입니다. 태양에 가장 가까운 이때 북반구는 겨울이니, 거리는 계절의 원인이 아닙니다. 거리 차 3%쯤은 햇빛 세기로 7%쯤 차이일 뿐입니다.',
      camera: { focus: 'earth', view: DISTANCE_VIEW },
      time: { julianDate: PERIHELION_2025_JD },
      ruler: 'sun',
    },
    {
      id: 'june-solstice',
      title: '6월 하지 — 북반구가 태양 쪽',
      body: '태양에서 지구를 봅니다(화면 위가 북쪽). 원반 한가운데가 해가 머리 위에 있는 곳입니다. 자전축이 23.4° 기울어 있어 6월에는 북반구가 태양 쪽으로 기울고, 해가 북위 23.4° 머리 위에 옵니다.',
      camera: { focus: 'earth', view: 'from-sun' },
      time: { julianDate: JUNE_SOLSTICE_2024_JD },
      display: SUN_VIEW_DISPLAY,
    },
    {
      id: 'december-solstice',
      title: '12월 동지 — 남반구가 태양 쪽',
      body: '반년 뒤 지구가 궤도 반대편에 와도 자전축은 같은 방향을 가리킵니다. 그래서 이번엔 남반구가 태양 쪽으로 기울고, 해가 머리 위에 오는 곳은 남위 23.4°입니다.',
      camera: { focus: 'earth', view: 'from-sun' },
      time: { julianDate: DECEMBER_SOLSTICE_2024_JD },
      display: SUN_VIEW_DISPLAY,
    },
    {
      id: 'september-equinox',
      title: '9월 추분 — 두 반구가 똑같이',
      body: '하지와 동지 사이, 9월 추분에는 해가 적도 머리 위에 옵니다(3월 춘분도 같습니다). 두 반구가 햇빛을 똑같이 받고, 낮과 밤의 길이가 거의 같습니다.',
      camera: { focus: 'earth', view: 'from-sun' },
      time: { julianDate: SEPTEMBER_EQUINOX_2024_JD },
      display: SUN_VIEW_DISPLAY,
    },
  ],
} as const satisfies TourDef;
