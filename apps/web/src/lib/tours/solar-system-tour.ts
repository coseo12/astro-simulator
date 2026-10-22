import { time as timeApi } from '@astro-simulator/core';
import { startOfYearJulianDate } from '@/lib/time-scrubber';
import { TOUR_OVERVIEW, type TourDef } from './types';

/** 투어 장면 시각 — 2026-01-01 0시 UT. 행성 배치에 교육적 의미는 없고, 단계 1 ~ 7 이 같은 배치를 보이도록 고정한다. */
export const SOLAR_SYSTEM_TOUR_JD = startOfYearJulianDate(2026);

/**
 * 전 단계 시점 — 앱 첫 화면과 같은 「황도 위 비스듬히 내려다보기」 (#1390 Amendment 1). 개요 복귀 (`resetCamera`) 와 포커스는
 * target · 거리만 옮기고 시점 각은 직전 경로가 남긴 값이라, 지정하지 않으면 「다음」 으로 순회할 때 7단계가 황도면을 옆에서 보게
 * 된다 (실측 beta 102.6° — 궤도가 세로선으로 겹친다). 천체 단계도 같은 시점으로 둬 진입 경로와 무관하게 같은 화면이 나오게 한다.
 */
const TOUR_VIEW = 'ecliptic-oblique';

/** 공전 재생 단계 (T1-7) 의 재생 구간 [일] — 지구 한 바퀴 (1 년). 30 일/초면 실시간 약 12 초. */
const ORBIT_PLAY_WINDOW_DAYS = 365;

/**
 * #1390 T1 — 태양계 한 바퀴 (ADR `20261021-1390` §첫 릴리스 투어 T1). 포커스 · 개요 · 표시 토글 · 배속만 쓴다 (새 코드 0 —
 * §Concrete Prediction PR2).
 *
 * 문안의 수치는 앱의 천체 데이터 (`packages/shared/data/solar-system.json` — NASA Planetary Fact Sheet) 에서 셈했다:
 * 태양 질량 비율 99.87 % (전 천체 질량 합 대비), 화성 지름 0.53 지구, 목성 질량 317.8 지구 = 나머지 일곱 행성 합 (128.8) 의 2.47 배.
 * 공전 주기 (88 · 365 · 687 일) · 토성 고리 (A 고리 바깥 지름 약 27 만 km, 두께는 대개 1 km 미만) 는 NASA Planetary Fact Sheet ·
 * NASA Science 「Saturn」 기준이다.
 *
 * 2 ~ 6 은 시각을 두지 않는다 (1 의 시각 · 정지가 유지된다). 7 은 시각을 다시 지정한다 — 재생 구간 (`windowDays`) 은 시각을
 * 지정한 단계에서만 성립한다 (`types.ts`). 1 에서 곧장 오면 같은 시각이라 장면이 튀지 않는다.
 */
export const SOLAR_SYSTEM_TOUR = {
  id: 'solar-system',
  title: '태양계 한 바퀴',
  shortTitle: '태양계',
  summary: '태양에서 토성까지 둘러보고, 행성마다 공전 빠르기가 다른 까닭을 봅니다',
  steps: [
    {
      id: 'overview',
      title: '여덟 행성의 무대',
      body: '태양 둘레를 여덟 행성이 모두 같은 방향으로 돕니다. 궤도는 거의 한 평면에 놓여 있고, 이 화면에는 안쪽 행성들의 궤도가 보입니다. 태양과 행성은 보기 쉽게 실제보다 크게 그렸습니다.',
      camera: { focus: TOUR_OVERVIEW, view: TOUR_VIEW },
      time: { julianDate: SOLAR_SYSTEM_TOUR_JD },
      display: { orbits: true, labels: true },
    },
    {
      id: 'sun',
      title: '태양',
      body: '태양계 전체 질량의 99.8 % 이상이 태양에 모여 있습니다. 그 중력이 행성과 소행성, 혜성의 궤도를 모두 붙잡고 있습니다. 둘레로 퍼진 빛은 태양의 바깥 대기인 코로나입니다.',
      camera: { focus: 'sun', view: TOUR_VIEW },
      display: { corona: true },
    },
    {
      id: 'earth',
      title: '지구',
      body: '태양에서 세 번째 행성, 우리가 사는 곳입니다. 곁을 도는 달은 지름이 지구의 약 4분의 1인 큰 위성입니다.',
      camera: { focus: 'earth', view: TOUR_VIEW },
    },
    {
      id: 'mars',
      title: '화성',
      body: '지름이 지구의 절반쯤인 붉은 행성입니다. 표면의 흙에 산화철(녹)이 많아 붉게 보입니다. 포보스와 데이모스, 작은 위성 둘이 곁을 돕니다.',
      camera: { focus: 'mars', view: TOUR_VIEW },
    },
    {
      id: 'jupiter',
      title: '목성',
      body: '가장 큰 행성으로, 질량이 나머지 행성을 모두 합친 것의 2배가 넘습니다. 1610년 갈릴레이가 찾은 큰 위성 넷 — 이오, 유로파, 가니메데, 칼리스토 — 가 곁을 돕니다.',
      camera: { focus: 'jupiter', view: TOUR_VIEW },
    },
    {
      id: 'saturn',
      title: '토성',
      body: '얼음과 암석 조각으로 이루어진 고리를 두른 행성입니다. 고리의 지름은 약 27만 km 이지만, 두께는 대부분 1 km 도 되지 않을 만큼 얇습니다.',
      camera: { focus: 'saturn', view: TOUR_VIEW },
    },
    {
      id: 'orbit-speed',
      title: '안쪽일수록 빠르다',
      body: '1초에 30일씩 1년을 흘려 봅니다. 수성은 88일, 지구는 365일, 화성은 687일에 한 바퀴 돕니다. 태양에서 멀수록 궤도가 길고 느리게 돌아 한 바퀴에 더 오래 걸립니다 — 케플러 제3법칙입니다.',
      camera: { focus: TOUR_OVERVIEW, view: TOUR_VIEW },
      time: { julianDate: SOLAR_SYSTEM_TOUR_JD },
      timeScale: timeApi.TimeScalePreset.MONTH_PER_SEC,
      windowDays: ORBIT_PLAY_WINDOW_DAYS,
      display: { orbits: true, labels: true, trails: true },
    },
  ],
} as const satisfies TourDef;
