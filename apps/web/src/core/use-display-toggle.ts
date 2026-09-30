'use client';

/**
 * #1265 — 표시 토글 공용 훅 (ADR `20260927-1265` 결정 5). 표시 패널과 단축 바 궤도선 버튼(Q4)이 함께 쓴다.
 *
 * URL 쓰기는 사용자 토글 이벤트에서만 한다. UrlSync 의 store→URL effect 로 옮기지 말 것 — 그 effect 는 마운트 직후에도 돌아 store 기본값(true)이 `?x=off` 를 scene 이 읽기 전에 지울 수 있다 (ADR `20260927-1265` 축 3).
 *
 * `toggle(id)` 한 호출이 store → core command → URL(`history: 'replace'`) 을 순서대로 갱신한다. 셋 중 하나만
 * 갱신되는 경로가 없어야 패널 · 단축 바 · 북마크 URL · scene 이 어긋나지 않는다 (계약 D3 · D11).
 */

import { parseAsString, useQueryStates } from 'nuqs';
import { useCallback } from 'react';
import { useSimStore } from '@/store/sim-store';
import { getDisplayToggle, serializeDisplayToggle, type DisplayToggleId } from './display-toggles';
import { useSimCommand } from './sim-context';

/**
 * 쓰기 대상 URL 키 4종. 값은 읽지 않는다 — 초기값 파싱은 sim-canvas 가 기존 파서로 이미 했다 (#850 계약:
 * 새 URL 읽기 0). 파서는 nuqs 가 키를 다루는 데 필요한 형식일 뿐이다.
 */
const DISPLAY_URL_KEYS = {
  orbits: parseAsString,
  stars: parseAsString,
  clouds: parseAsString,
  nightlights: parseAsString,
};

export function useDisplayToggle(): (id: DisplayToggleId) => void {
  const sendCommand = useSimCommand();
  // `history: 'replace'` — 토글이 뒤로 가기 항목을 만들지 않는다 (사용자 결정 Q2, 계약 D11).
  const [, setUrl] = useQueryStates(DISPLAY_URL_KEYS, { history: 'replace' });

  return useCallback(
    (id: DisplayToggleId) => {
      const def = getDisplayToggle(id);
      // 렌더 시점 값이 아니라 호출 시점 store 를 읽는다 — 같은 틱의 연속 클릭에서도 반전 기준이 최신이다.
      const state = useSimStore.getState();
      // 가용성 검사 — 소프트웨어 렌더의 별 · `?surface=off` 의 구름·불빛 · 장면 미준비를 막는 **유일한** 지점이다.
      // 버튼은 `aria-disabled` 라 포커스·클릭을 그대로 받는다 (D9 · D10 해석 — `display-toggles.ts` 사유 상수 주석).
      // core 는 렌더러 종류를 모르므로 (ADR 결정 1) 여기서 거르지 않으면 소프트웨어 렌더에서 별이 생성된다.
      if (def.disabledReason(state.displayCapabilities) !== null) return;
      const next = !state[def.intentKey];
      state[def.setterKey](next);
      sendCommand(def.command(next));
      void setUrl({ [def.urlKey]: serializeDisplayToggle(next) });
    },
    [sendCommand, setUrl],
  );
}
