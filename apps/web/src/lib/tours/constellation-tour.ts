import { time as timeApi } from '@astro-simulator/core';
import type { TourDef } from './types';

/**
 * 2024 년 지점 (至點) [JD, TT≈UT 구분 없이 장면 시각]. 출처: USNO Astronomical Applications Dept., 「Earth's Seasons —
 * Equinoxes, Solstices, Perihelion, and Aphelion」 2024 — June Solstice 06-20 20:51 UT · December Solstice 12-21 09:20 UT.
 * 사건 파일 (`time-events.json`) 에 지점 종류가 없어 상수로 둔다 (ADR `20261021-1390` §Visual Fidelity 1 — 하드코딩 + 출처).
 * ADR 실측 1-F 가 이 두 시각에서 별자리 장면을 쟀다.
 */
export const JUNE_SOLSTICE_2024_JD = 2460482.3688;
export const DECEMBER_SOLSTICE_2024_JD = 2460665.8889;

/**
 * 공전 재생 단계 (T4-4) 의 재생 구간 [일] — 하지부터 12월 말 (2024-12-27) 까지. 30 일/초면 실시간 약 6 초.
 *
 * 재생 중에는 카메라 방향이 고정된다 (시점 요청은 단계 시작 1회 — 실측: 재생 중 alpha · beta 불변). 그래서 이 장면은 「한밤의 하늘이
 * 돈다」 가 아니라 「별자리는 제자리이고 태양이 그쪽으로 온다」 이다 (사용자 결정 2026-10-22 — ADR T4 표 요지에서 바뀐 점). 태양은
 * 화면 세로선을 따라 아래에서 올라와 약 200 일 뒤 지구 뒤를 지난다 (1280 · 375 실측). 190 일이면 지구 바로 아래 · 카드 위에서 멈춘다.
 *
 * 사실 근거 — 태양이 궁수자리 (IAU 경계) 에 머무는 기간은 약 12월 18일 ~ 1월 18일이다 (Wikipedia 「Sagittarius (constellation)」,
 * 2002 년 기준 — 세차로 수십 년에 하루쯤 늦어진다). 동지 (태양 황경 270°) 가 그 안에 있다.
 */
const SUN_APPROACH_WINDOW_DAYS = 190;

/**
 * 전 단계 공통 표시 — 별자리 · 별 배경 · 이름 라벨 켬, 궤도선 끔.
 * - 별 배경 — 별자리 토글은 별 배경 의도와 독립이라 (ADR `20261018-1373` 결정 T3) 별 배경을 끈 사용자에게는 선만 보인다. 별자리
 *   투어는 별이 함께 보여야 하므로 켠다.
 * - 이름 라벨 — 별자리 이름은 별자리 ∧ 이름 라벨이 둘 다 켜졌을 때 보인다 (같은 ADR 결정 T2).
 * - 궤도선 — 지구 근처에서 다른 천체의 궤도선이 별 하늘을 가로지른다 (ADR 1-F).
 * 소프트웨어 렌더에서는 별 배경 · 별자리가 불가하다 (ADR 738 Amendment 2) — 카드가 사유를 보인다 (엔진 `unavailable`).
 */
const SKY_DISPLAY = {
  constellations: true,
  stars: true,
  labels: true,
  orbits: false,
} as const;

/**
 * #1390 T4 — 계절의 별자리 (ADR `20261021-1390` §첫 릴리스 투어 T4). 지구 `facing-parent` (카메라가 지구의 태양 쪽 → 지구 뒤
 * 배경이 태양 반대편 = 한밤의 하늘) 하나로 장면이 선다 (새 코드 0 — 1-F 실측: 동지 오리온 235 px, 하지 방패 · 궁수 180 · 214 px).
 *
 * 계절 · 별자리 서술은 북반구 기준이다 (요약 · 2 · 3 단계 문안이 명시한다).
 *
 * ⚠️ 전 단계가 같은 천체 (지구) 다 — 단계마다 `view` 로 카메라를 다시 잡는다 (`types.ts` `TourCamera.view`).
 */
export const CONSTELLATION_TOUR = {
  id: 'constellations',
  title: '계절의 별자리',
  shortTitle: '별자리',
  summary: '한밤에 보이는 별자리가 계절마다 바뀌는 까닭 (북반구 기준)',
  steps: [
    {
      id: 'fixed-stars',
      title: '움직이지 않는 그림',
      body: '별자리는 아주 먼 별들을 이어 그린 그림입니다. 별이 너무 멀어서 지구가 태양을 돌아도 별자리의 모양은 그대로입니다. 계절에 따라 바뀌는 것은 밤에 우리가 바라보는 방향입니다.',
      // 시점 각을 지정해 진입 경로와 무관한 화면을 둔다 (#1390 Amendment 1). 카메라가 황도 북쪽 위에 있어 지구 너머 배경은
      // 황도 남극 쪽 하늘이다 (실측 — 테이블산 · 카멜레온 · 남십자자리). 문안은 특정 별자리를 가리키지 않는다.
      camera: { focus: 'earth', view: 'ecliptic-oblique' },
      time: { julianDate: DECEMBER_SOLSTICE_2024_JD },
      display: SKY_DISPLAY,
    },
    {
      id: 'winter-sky',
      title: '겨울밤 — 오리온자리',
      body: '2024년 12월 21일(동지), 지구 너머로 태양 반대쪽 — 한밤의 하늘을 봅니다. 북반구의 겨울밤에는 오리온자리와 마차부자리 같은 겨울철 별자리가 높이 뜹니다.',
      camera: { focus: 'earth', view: 'facing-parent' },
      time: { julianDate: DECEMBER_SOLSTICE_2024_JD },
      display: SKY_DISPLAY,
    },
    {
      id: 'summer-sky',
      title: '여름밤 — 궁수자리',
      body: '반년 뒤 2024년 6월 20일(하지)에는 지구가 태양 반대편으로 옮겨 가, 한밤의 하늘도 반대쪽을 향합니다. 북반구의 여름밤에는 우리 은하 중심 쪽의 궁수자리와 방패자리가 보입니다.',
      camera: { focus: 'earth', view: 'facing-parent' },
      time: { julianDate: JUNE_SOLSTICE_2024_JD },
      display: SKY_DISPLAY,
    },
    {
      id: 'sun-approach',
      title: '겨울엔 왜 안 보일까',
      body: '시점을 그대로 두고 1초에 30일씩 반년을 흘려 봅니다. 별자리는 제자리인데 지구가 공전하면서 태양이 이 별자리들 쪽으로 옵니다. 12월 말에는 궁수자리가 태양과 같은 쪽, 낮 하늘에 있어 밤에는 보이지 않습니다.',
      camera: { focus: 'earth', view: 'facing-parent' },
      time: { julianDate: JUNE_SOLSTICE_2024_JD },
      timeScale: timeApi.TimeScalePreset.MONTH_PER_SEC,
      windowDays: SUN_APPROACH_WINDOW_DAYS,
      display: SKY_DISPLAY,
    },
  ],
} as const satisfies TourDef;
