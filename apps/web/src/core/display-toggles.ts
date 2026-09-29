/**
 * #1265 — 표시 패널 토글 4종의 데이터 테이블 (ADR `20260927-1265` 결정 7 — 4 토글의 SSoT).
 *
 * 패널 (`display-panel.tsx`) · 공용 훅 (`use-display-toggle.ts`) · 단위 테스트가 모두 이 표를 읽는다.
 * 행을 늘릴 때 고칠 곳은 이 파일 하나다 — URL 키 · 라벨 · 역방향 파서 · core 명령 · 가용성 · 비활성 사유가
 * 한 행에 모여 있다.
 *
 * URL 어휘는 기존 `parse-*-mode.ts` 4종을 그대로 쓴다 — 새 URL 파라미터 0, 새 파서 0 (결정 5). 쓰는 쪽은
 * `serializeDisplayToggle` 하나이고 그 역방향이 각 행의 `parse` 다.
 */

import type { CoreCommand } from '@astro-simulator/shared';
import type { SimStoreState } from '@/store/sim-store';
import { parseCloudsVisible } from './parse-cloud-mode';
import { parseNightLightsVisible } from './parse-night-lights-mode';
import { parseOrbitsVisible } from './parse-orbits-mode';
import { parseStarsVisible, resolveStarfieldVisible } from './parse-stars-mode';

export type DisplayToggleId = 'orbits' | 'stars' | 'clouds' | 'nightLights';

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
  surfaceOff: '표면 표시가 꺼져 있어 사용할 수 없습니다 (?surface=off)',
  sceneNotReady: '장면을 준비하는 중입니다',
} as const;

/** store 에 보관하는 사용자 의도 (URL 의도) 필드. 궤도선은 기존 필드를 그대로 쓴다 (Q4). */
type IntentKey = 'orbitLinesVisible' | 'starsVisible' | 'cloudsVisible' | 'nightLightsVisible';
type IntentSetterKey =
  'setOrbitLinesVisible' | 'setStarsVisible' | 'setCloudsVisible' | 'setNightLightsVisible';

export interface DisplayToggleDef {
  id: DisplayToggleId;
  /** URL 쿼리 키 — 기존 파라미터 (`?orbits=` · `?stars=` · `?clouds=` · `?nightlights=`). */
  urlKey: 'orbits' | 'stars' | 'clouds' | 'nightlights';
  label: string;
  /** URL → 의도. `serializeDisplayToggle` 의 역방향 (기존 파서 재사용). */
  parse: (urlParam: string | null | undefined) => boolean;
  command: (visible: boolean) => CoreCommand;
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

export const DISPLAY_TOGGLES: readonly DisplayToggleDef[] = [
  {
    id: 'orbits',
    urlKey: 'orbits',
    label: '궤도선',
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
    id: 'clouds',
    urlKey: 'clouds',
    label: '구름',
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
    parse: parseNightLightsVisible,
    command: (visible) => ({ type: 'setNightLightsVisible', visible }),
    intentKey: 'nightLightsVisible',
    setterKey: 'setNightLightsVisible',
    disabledReason: surfaceReason,
    pressed: surfacePressed,
  },
];

export function getDisplayToggle(id: DisplayToggleId): DisplayToggleDef {
  const def = DISPLAY_TOGGLES.find((d) => d.id === id);
  // 유니온 타입이라 도달 불가 — 표에서 행이 빠지는 drift 는 조용히 넘기지 않는다.
  if (!def) throw new Error(`[display-toggles] 알 수 없는 토글 id: ${id}`);
  return def;
}

/**
 * 의도 → URL 값. ON 은 키 삭제 (`null`), OFF 는 `'off'` (사용자 결정 Q2). 역방향은 각 행의 `parse` —
 * `parse(serializeDisplayToggle(v)) === v` 가 성립한다 (단위 테스트가 고정).
 */
export function serializeDisplayToggle(visible: boolean): 'off' | null {
  return visible ? null : 'off';
}
