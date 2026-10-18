/**
 * #1265 — 표시 패널 토글의 데이터 테이블 (ADR `20260927-1265` 결정 7 — 토글의 SSoT). #1293 이 5번째 행
 * (이름 라벨 — web 전용, `command: null`) 을 더했다.
 *
 * 패널 (`display-panel.tsx`) · 공용 훅 (`use-display-toggle.ts`) · 단위 테스트가 모두 이 표를 읽는다.
 * 행을 늘릴 때 고칠 곳은 이 파일 하나다 — URL 키 · 라벨 · 역방향 파서 · core 명령 · 가용성 · 비활성 사유가
 * 한 행에 모여 있다.
 *
 * URL 어휘는 기존 `parse-*-mode.ts` 4종을 그대로 쓴다 — 새 URL 파라미터 0, 새 파서 0 (결정 5). 예외는 #1293 의
 * `?labels=` (`parse-labels-mode.ts` — 같은 어휘 `off` 옵트아웃) 와 #1319 PR3 의 `?belt=` · `?kuiper=`
 * (`parse-belt-mode.ts` — 같은 `off` 옵트아웃, `?belt=` 는 기존 숫자 의미 유지 — ADR `20261008-1319` 결정 6), #1329 PR2 의
 * `?comettails=` (`parse-comet-tails-mode.ts` — 같은 `off` 옵트아웃 + 로드 전용 `force` — ADR `20261010-1329` 결정 5), #1335 PR2 의
 * `?corona=` (`parse-corona-mode.ts` — 같은 `off` 옵트아웃 + 로드 전용 `force` — ADR `20261014-1335` 결정 6), #1341 PR1 의
 * `?trails=` (`parse-trails-mode.ts` — 기본 꺼짐 행, `on` 옵트인 — ADR `20261015-1341` 결정 T10), #1373 PR2 의 `?constellations=`
 * (`parse-constellations-mode.ts` — 같은 기본 꺼짐 · `on` 옵트인 — ADR `20261018-1373` 결정 T1). 쓰는 쪽은
 * `serializeDisplayToggle(visible, defaultVisible)` 하나이고 그 역방향이 각 행의 `parse` 다.
 */

import type { CoreCommand } from '@astro-simulator/shared';
import type { SimStoreState } from '@/store/sim-store';
import { parseBeltVisible, parseKuiperVisible } from './parse-belt-mode';
import { parseCloudsVisible } from './parse-cloud-mode';
import { parseCometTailsVisible } from './parse-comet-tails-mode';
import { parseEventsVisible } from './parse-events-mode';
import { parseCoronaVisible } from './parse-corona-mode';
import { parseLabelsVisible } from './parse-labels-mode';
import { parseNightLightsVisible } from './parse-night-lights-mode';
import { parseOrbitsVisible } from './parse-orbits-mode';
import { parseStarsVisible, resolveStarfieldVisible } from './parse-stars-mode';
import { parseTrailsVisible } from './parse-trails-mode';
import { parseConstellationsVisible } from './parse-constellations-mode';

export type DisplayToggleId =
  | 'orbits'
  | 'stars'
  | 'constellations'
  | 'clouds'
  | 'nightLights'
  | 'labels'
  | 'belt'
  | 'kuiper'
  | 'cometTails'
  | 'corona'
  | 'trails'
  | 'events';

/**
 * 장면이 준비된 뒤 확정되는 환경 가용성. `null` = 장면 미준비 (sim-canvas 가 핸들러를 등록하기 전 ·
 * 언마운트 뒤). 핸들러가 없으면 command 가 no-op 으로 사라져 store 와 scene 이 어긋나므로, `null` 동안
 * 신규 3종은 불가로 둔다 (결정 5).
 */
export interface DisplayCapabilities {
  /** 별 배경을 만들 수 있는가 — `!isSoftwareRenderer` (#745 fill-rate 계약). */
  starfield: boolean;
  /** 절차 표면이 켜져 있는가 — `?surface=` (구름·불빛의 core 유효 조건). */
  surfaceDetail: boolean;
  /**
   * #1319 PR3 — 띠 입자 (소행성대 · 카이퍼) 를 만들 수 있는가 — `!isSoftwareRenderer || ?belt=N 강제` (ADR `20261008-1319`
   * 결정 3). 명시 수 `?belt=N` 은 소프트웨어 렌더에서도 메시를 만들므로 (bench · verify 호환) 그때는 토글도 연다.
   */
  belt: boolean;
  /**
   * #1329 PR2 — 혜성 꼬리 · 코마를 만들 수 있는가 — `!isSoftwareRenderer || ?comettails=force` (ADR `20261010-1329` 결정 4).
   * `force` 는 소프트웨어 렌더에서도 메시를 만들므로 (CI 강제 셀) 그때는 토글도 연다 — `belt` 의 `?belt=N` 과 같은 규약.
   */
  cometTails: boolean;
  /**
   * #1335 PR2 — 태양 코로나를 만들 수 있는가 — `!isSoftwareRenderer || ?corona=force` (ADR `20261014-1335` 결정 5 · 6).
   * `force` 는 소프트웨어 렌더에서도 메시를 만들므로 (CI 강제 셀) 그때는 토글도 연다 — `cometTails` 와 같은 규약.
   */
  corona: boolean;
  /**
   * #1341 PR1 — 궤적 trail 을 그릴 수 있는가 — 활성 물리 엔진이 Kepler 인가 (ADR `20261015-1341` 결정 T8 · Q-T4 (a)).
   * trail 점은 Kepler 해석해라 N-body 위치와 다르므로 그동안 core 가 메시를 끄고, 토글은 비활성 + 사유를 보인다.
   * 렌더러 축은 없다 (소프트웨어 렌더 게이트 없음 — 결정 T10). sim-canvas 가 엔진 전환마다 갱신한다.
   */
  trails: boolean;
}

/**
 * 비활성 사유 문구 (결정 6 — 문구는 상수). 버튼 `title` 과 `aria-describedby` 가 같은 문자열을 쓴다.
 *
 * ⚠️ 계약 D9 · D10 의 「`disabled`」 는 `aria-disabled="true"` 로 해석한다 (2026-09-27 사용자 확정 —
 * 이슈 #1265 `issuecomment-5852573137`). 네이티브 `disabled` 는 Tab 순서에서 빠져 CI(별 불가) 와
 * `?surface=off` 에서 D14 「Tab 으로 토글 4개 순회」를 구조적으로 막고, 사유가 스크린 리더에 닿지 않는다.
 * 그래서 버튼은 포커스·클릭을 받고, 차단은 `useDisplayToggle` 의 가용성 검사가 **유일하게** 한다.
 */
export const DISPLAY_DISABLED_REASONS = {
  softwareRenderer: '소프트웨어 렌더링 환경에서는 성능 보호를 위해 별 배경을 표시하지 않습니다',
  // #1319 PR3 — 띠 입자 (결정 3). 별 배경과 같은 사유 표현 (ADR 1265 결정 5 선례).
  softwareRendererBelt:
    '소프트웨어 렌더링 환경에서는 성능 보호를 위해 소행성대 · 카이퍼 벨트를 표시하지 않습니다',
  // #1329 PR2 — 혜성 꼬리 (결정 4). 같은 사유 표현.
  softwareRendererCometTails:
    '소프트웨어 렌더링 환경에서는 성능 보호를 위해 혜성 꼬리를 표시하지 않습니다',
  // #1335 PR2 — 태양 코로나 (결정 5). 같은 사유 표현.
  softwareRendererCorona:
    '소프트웨어 렌더링 환경에서는 성능 보호를 위해 태양 코로나를 표시하지 않습니다',
  // #1373 PR2 — 별자리 (결정 R5). 별 배경과 같은 게이트 · 같은 사유 표현.
  softwareRendererConstellations:
    '소프트웨어 렌더링 환경에서는 성능 보호를 위해 별자리를 표시하지 않습니다',
  // #1341 PR1 — 궤적 trail (결정 T8). 렌더러가 아니라 물리 엔진 사유다.
  nbodyTrails: 'N-body 엔진에서는 궤적을 표시하지 않습니다',
  surfaceOff: '표면 표시가 꺼져 있어 사용할 수 없습니다 (?surface=off)',
  sceneNotReady: '장면을 준비하는 중입니다',
} as const;

/** store 에 보관하는 사용자 의도 (URL 의도) 필드. 궤도선은 기존 필드를 그대로 쓴다 (Q4). */
type IntentKey =
  | 'orbitLinesVisible'
  | 'starsVisible'
  | 'constellationsVisible'
  | 'cloudsVisible'
  | 'nightLightsVisible'
  | 'labelsVisible'
  | 'beltVisible'
  | 'kuiperVisible'
  | 'cometTailsVisible'
  | 'coronaVisible'
  | 'trailsVisible'
  | 'eventsVisible';
type IntentSetterKey =
  | 'setOrbitLinesVisible'
  | 'setStarsVisible'
  | 'setConstellationsVisible'
  | 'setCloudsVisible'
  | 'setNightLightsVisible'
  | 'setLabelsVisible'
  | 'setBeltVisible'
  | 'setKuiperVisible'
  | 'setCometTailsVisible'
  | 'setCoronaVisible'
  | 'setTrailsVisible'
  | 'setEventsVisible';

export interface DisplayToggleDef {
  id: DisplayToggleId;
  /** URL 쿼리 키 — 기존 파라미터 (`?orbits=` · `?stars=` · `?clouds=` · `?nightlights=`). */
  urlKey:
    | 'orbits'
    | 'stars'
    | 'constellations'
    | 'clouds'
    | 'nightlights'
    | 'labels'
    | 'belt'
    | 'kuiper'
    | 'comettails'
    | 'corona'
    | 'trails'
    | 'events';
  label: string;
  /**
   * #1341 PR1 — 기본 표시 여부 (ADR `20261015-1341` 결정 T10). URL 직렬화가 이 값과 같은 의도를 키 삭제로 쓴다.
   * `trails` · `constellations` (#1373 PR2) 만 `false` (옵트인) — 나머지 행은 `true` 라 출력이 종전과 같다.
   */
  defaultVisible: boolean;
  /** URL → 의도. `serializeDisplayToggle` 의 역방향 (기존 파서 재사용). */
  parse: (urlParam: string | null | undefined) => boolean;
  /**
   * scene 에 보낼 core 명령. `null` = **web 전용 토글** (#1293 라벨 — DOM 오버레이라 scene 상태가 없다).
   * 그 행은 store 의도만으로 화면이 정해지므로 명령 발행을 건너뛴다 (`use-display-toggle.ts`).
   */
  command: ((visible: boolean) => CoreCommand) | null;
  intentKey: IntentKey & keyof SimStoreState;
  setterKey: IntentSetterKey & keyof SimStoreState;
  /** `null` = 사용 가능 · 문자열 = 비활성 사유. */
  disabledReason: (caps: DisplayCapabilities | null) => string | null;
  /** 화면에 실제로 보이는가 (`aria-pressed`) — 의도 ∧ 환경. */
  pressed: (intent: boolean, caps: DisplayCapabilities | null) => boolean;
}

/** 구름·불빛 공통 — core 유효 조건 `x && surfaceDetail` 동형. */
const surfaceReason = (caps: DisplayCapabilities | null): string | null => {
  if (caps === null) return DISPLAY_DISABLED_REASONS.sceneNotReady;
  return caps.surfaceDetail ? null : DISPLAY_DISABLED_REASONS.surfaceOff;
};
const surfacePressed = (intent: boolean, caps: DisplayCapabilities | null): boolean =>
  intent && caps !== null && caps.surfaceDetail;

/** #1319 PR3 — 소행성대 · 카이퍼 공통. 로드 경로 `resolveBeltAtLoad` 와 같은 결정식 (의도 ∧ 환경). */
const beltReason = (caps: DisplayCapabilities | null): string | null => {
  if (caps === null) return DISPLAY_DISABLED_REASONS.sceneNotReady;
  return caps.belt ? null : DISPLAY_DISABLED_REASONS.softwareRendererBelt;
};
const beltPressed = (intent: boolean, caps: DisplayCapabilities | null): boolean =>
  intent && caps !== null && caps.belt;

export const DISPLAY_TOGGLES: readonly DisplayToggleDef[] = [
  {
    id: 'orbits',
    urlKey: 'orbits',
    label: '궤도선',
    defaultVisible: true,
    parse: parseOrbitsVisible,
    command: (visible) => ({ type: 'setOrbitLinesVisible', visible }),
    intentKey: 'orbitLinesVisible',
    setterKey: 'setOrbitLinesVisible',
    // 궤도선은 장면 준비 전에도 기존대로 항상 누를 수 있다 (Q4 — 현행 유지).
    disabledReason: () => null,
    pressed: (intent) => intent,
  },
  {
    id: 'stars',
    urlKey: 'stars',
    label: '별 배경',
    defaultVisible: true,
    parse: parseStarsVisible,
    command: (visible) => ({ type: 'setStarfieldVisible', visible }),
    intentKey: 'starsVisible',
    setterKey: 'setStarsVisible',
    disabledReason: (caps) => {
      if (caps === null) return DISPLAY_DISABLED_REASONS.sceneNotReady;
      return caps.starfield ? null : DISPLAY_DISABLED_REASONS.softwareRenderer;
    },
    // 로드 경로와 같은 결정식 (`resolveStarfieldVisible`) — 소프트웨어 렌더면 의도와 무관하게 꺼짐.
    pressed: (intent, caps) => caps !== null && resolveStarfieldVisible(intent, caps.starfield),
  },
  {
    // #1373 PR2 — 별자리 선 · 이름 (ADR `20261018-1373` 결정 T1 · T2). **기본 꺼짐** · `?constellations=on` 옵트인. 처음 켤 때
    // 두 파일을 받아 지연 생성, 이후 `setEnabled` (결정 T4). 가용성은 별 배경과 같은 `starfield` (결정 R5 — 별 배경 의도와는 독립,
    // 결정 T3). 이름은 이 행 ∧ 「이름 라벨」 행이 둘 다 켜졌을 때 보인다 (결정 T2 — 오버레이가 건다).
    id: 'constellations',
    urlKey: 'constellations',
    label: '별자리',
    defaultVisible: false,
    parse: parseConstellationsVisible,
    command: (visible) => ({ type: 'setConstellationsVisible', visible }),
    intentKey: 'constellationsVisible',
    setterKey: 'setConstellationsVisible',
    disabledReason: (caps) => {
      if (caps === null) return DISPLAY_DISABLED_REASONS.sceneNotReady;
      return caps.starfield ? null : DISPLAY_DISABLED_REASONS.softwareRendererConstellations;
    },
    pressed: (intent, caps) => intent && caps !== null && caps.starfield,
  },
  {
    id: 'clouds',
    urlKey: 'clouds',
    label: '구름',
    defaultVisible: true,
    parse: parseCloudsVisible,
    command: (visible) => ({ type: 'setCloudsVisible', visible }),
    intentKey: 'cloudsVisible',
    setterKey: 'setCloudsVisible',
    disabledReason: surfaceReason,
    pressed: surfacePressed,
  },
  {
    id: 'nightLights',
    urlKey: 'nightlights',
    label: '야간 불빛',
    defaultVisible: true,
    parse: parseNightLightsVisible,
    command: (visible) => ({ type: 'setNightLightsVisible', visible }),
    intentKey: 'nightLightsVisible',
    setterKey: 'setNightLightsVisible',
    disabledReason: surfaceReason,
    pressed: surfacePressed,
  },
  {
    id: 'labels',
    urlKey: 'labels',
    label: '이름 라벨',
    defaultVisible: true,
    parse: parseLabelsVisible,
    // #1293 — DOM 오버레이 (`body-labels.tsx`) 가 store 를 직접 구독한다. scene 이 모르는 상태라 명령 없음.
    command: null,
    intentKey: 'labelsVisible',
    setterKey: 'setLabelsVisible',
    // 장면 준비 전에는 오버레이 자체가 없어 (SimCommandProvider 가 children 보류) 누를 수 있어도 무해하다 — 궤도선과 같은 처리.
    disabledReason: () => null,
    pressed: (intent) => intent,
  },
  {
    // #1319 PR3 — 소행성대 (주 띠 + 힐다 + 트로이). 처음 켤 때 지연 생성, 이후 `setEnabled` (ADR `20261008-1319` 결정 6).
    id: 'belt',
    urlKey: 'belt',
    label: '소행성대',
    defaultVisible: true,
    parse: parseBeltVisible,
    command: (visible) => ({ type: 'setAsteroidBeltVisible', visible }),
    intentKey: 'beltVisible',
    setterKey: 'setBeltVisible',
    disabledReason: beltReason,
    pressed: beltPressed,
  },
  {
    // #1319 PR3 — 카이퍼 벨트 (고전대 + 플루티노). 줌아웃해야 보인다 (결정 7).
    id: 'kuiper',
    urlKey: 'kuiper',
    label: '카이퍼 벨트',
    defaultVisible: true,
    parse: parseKuiperVisible,
    command: (visible) => ({ type: 'setKuiperBeltVisible', visible }),
    intentKey: 'kuiperVisible',
    setterKey: 'setKuiperVisible',
    disabledReason: beltReason,
    pressed: beltPressed,
  },
  {
    // #1329 PR2 — 혜성 꼬리 · 코마 (핵 · glow marker · 궤도선은 그대로). 처음 켤 때 지연 생성, 이후 `setEnabled`
    // (ADR `20261010-1329` 결정 5). 로드 경로 `resolveCometTailsAtLoad` 와 같은 결정식 (의도 ∧ 환경).
    id: 'cometTails',
    urlKey: 'comettails',
    label: '혜성 꼬리',
    defaultVisible: true,
    parse: parseCometTailsVisible,
    command: (visible) => ({ type: 'setCometTailsVisible', visible }),
    intentKey: 'cometTailsVisible',
    setterKey: 'setCometTailsVisible',
    disabledReason: (caps) => {
      if (caps === null) return DISPLAY_DISABLED_REASONS.sceneNotReady;
      return caps.cometTails ? null : DISPLAY_DISABLED_REASONS.softwareRendererCometTails;
    },
    pressed: (intent, caps) => intent && caps !== null && caps.cometTails,
  },
  {
    // #1335 PR2 — 태양 코로나 (태양 disk 는 그대로 — Amendment 1 로 홍염 항이 삭제돼 코로나만 끈다). 처음 켤 때
    // 지연 생성, 이후 `setEnabled` (ADR `20261014-1335` 결정 6). 로드 경로 `resolveCoronaAtLoad` 와 같은 결정식 (의도 ∧ 환경).
    id: 'corona',
    urlKey: 'corona',
    label: '태양 코로나',
    defaultVisible: true,
    parse: parseCoronaVisible,
    command: (visible) => ({ type: 'setSunCoronaVisible', visible }),
    intentKey: 'coronaVisible',
    setterKey: 'setCoronaVisible',
    disabledReason: (caps) => {
      if (caps === null) return DISPLAY_DISABLED_REASONS.sceneNotReady;
      return caps.corona ? null : DISPLAY_DISABLED_REASONS.softwareRendererCorona;
    },
    pressed: (intent, caps) => intent && caps !== null && caps.corona,
  },
  {
    // #1341 PR1 — 궤적 trail (ADR `20261015-1341`). **기본 꺼짐** · `?trails=on` 옵트인 (결정 T10). 처음 켤 때 지연 생성,
    // 이후 `setEnabled` (결정 T7). N-body 엔진이면 core 가 메시를 끄므로 토글도 비활성 + 사유 (결정 T8).
    id: 'trails',
    urlKey: 'trails',
    label: '궤적',
    defaultVisible: false,
    parse: parseTrailsVisible,
    command: (visible) => ({ type: 'setTrailsVisible', visible }),
    intentKey: 'trailsVisible',
    setterKey: 'setTrailsVisible',
    disabledReason: (caps) => {
      if (caps === null) return DISPLAY_DISABLED_REASONS.sceneNotReady;
      return caps.trails ? null : DISPLAY_DISABLED_REASONS.nbodyTrails;
    },
    pressed: (intent, caps) => intent && caps !== null && caps.trails,
  },
  {
    // #1347 — 타임바 시간 이벤트 마커 (눈금 + 사건 패널 버튼 — ADR `20261016-1347` 결정 D7). 기본 켜짐 · `?events=off` 옵트아웃.
    // web 전용 (타임바 DOM) 이라 core 명령이 없다 — 라벨 행과 같은 처리. N-body 엔진 게이트 (결정 D8) 는 이 행이 아니라
    // 타임바 쪽 (`time-events.tsx`) 이 건다 — 의도는 엔진과 무관하게 보존하고 Kepler 로 돌아오면 다시 보인다.
    id: 'events',
    urlKey: 'events',
    label: '시간 사건 마커',
    defaultVisible: true,
    parse: parseEventsVisible,
    command: null,
    intentKey: 'eventsVisible',
    setterKey: 'setEventsVisible',
    disabledReason: () => null,
    pressed: (intent) => intent,
  },
];

export function getDisplayToggle(id: DisplayToggleId): DisplayToggleDef {
  const def = DISPLAY_TOGGLES.find((d) => d.id === id);
  // 유니온 타입이라 도달 불가 — 표에서 행이 빠지는 drift 는 조용히 넘기지 않는다.
  if (!def) throw new Error(`[display-toggles] 알 수 없는 토글 id: ${id}`);
  return def;
}

/**
 * 의도 → URL 값. 기본값과 같으면 키 삭제 (`null`), 다르면 `'on'` / `'off'` (사용자 결정 Q2 · #1341 결정 T10 일반화).
 * 기본 켜짐 행 (`defaultVisible = true`) 은 종전 그대로 ON = 키 삭제 · OFF = `'off'` 다. `defaultVisible` 은 필수 인자다 —
 * 기본 인자를 두면 기본 꺼짐 행에서 인자를 빠뜨린 호출이 조용히 흡수된다 (PR #1343 리뷰 권고 3). 역방향은 각 행의
 * `parse` — `parse(serializeDisplayToggle(v, def.defaultVisible)) === v` 가 성립한다 (단위 테스트가 고정).
 */
export function serializeDisplayToggle(
  visible: boolean,
  defaultVisible: boolean,
): 'on' | 'off' | null {
  if (visible === defaultVisible) return null;
  return visible ? 'on' : 'off';
}
