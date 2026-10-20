import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { isFocusInExpandedPopup } from './expanded-popup';

/**
 * #1380 — 캔버스 refocus 보호 판정 (`sim-canvas.tsx` `shouldPreserveFocus`) 의 「펼쳐진 비모달 팝업」 축.
 * 대상 팝업 넷 중 blur 로 닫히는 셋 (사건 패널 · 표시 패널 · 천체 메뉴) 이 실제로 이 ARIA 계약을 갖는지는 각 컴포넌트 테스트가
 * 단언한다. 상단 「⋯」 오버플로는 blur 로 닫히지 않아 (#1380 결함 없음) 계약 단언을 두지 않았다.
 */
describe('isFocusInExpandedPopup (#1380)', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    root.remove();
  });

  /** 트리거 + (본문 끝 portal 과 같은 위치의) 팝업. 팝업은 열렸을 때만 존재한다 (세 컴포넌트와 같다). */
  function mount(expanded: boolean) {
    root.innerHTML = `
      <button id="trigger" aria-expanded="${expanded}" ${expanded ? 'aria-controls="popup"' : ''}>열기</button>
      <button id="outside">밖</button>
      ${expanded ? '<div id="popup"><button id="chip">화성 충</button><ul tabindex="0" id="list"></ul></div>' : ''}
    `;
    const get = (id: string) => document.getElementById(id)!;
    return { get };
  }

  it('열린 팝업 안의 컨트롤 (필터 칩 · 목록) — 보존', () => {
    const { get } = mount(true);
    expect(isFocusInExpandedPopup(get('chip'))).toBe(true);
    expect(isFocusInExpandedPopup(get('list'))).toBe(true);
  });

  it('열린 팝업의 트리거 자신 — 보존 (트리거에서 팝업으로 포인터가 캔버스를 지나가도 닫히지 않게)', () => {
    const { get } = mount(true);
    expect(isFocusInExpandedPopup(get('trigger'))).toBe(true);
  });

  it('팝업 밖 컨트롤 — 보존하지 않는다 (#699 마우스 포커스 회수 유지)', () => {
    const { get } = mount(true);
    expect(isFocusInExpandedPopup(get('outside'))).toBe(false);
  });

  it('닫힌 트리거 — 보존하지 않는다 (팝업이 닫혀 있으면 캔버스가 포커스를 회수한다)', () => {
    const { get } = mount(false);
    expect(isFocusInExpandedPopup(get('trigger'))).toBe(false);
  });

  it('`aria-controls` 는 공백 구분 id 목록 — 두 번째 id 의 팝업 안도 보존', () => {
    root.innerHTML = `
      <button aria-expanded="true" aria-controls="other popup">열기</button>
      <div id="other"></div>
      <div id="popup"><button id="chip">칩</button></div>
    `;
    expect(isFocusInExpandedPopup(document.getElementById('chip')!)).toBe(true);
  });

  it('펼쳐진 트리거가 없으면 `id` 가 같은 컨테이너 안이어도 보존하지 않는다 (트리거 상태가 판정 축)', () => {
    root.innerHTML = `
      <button aria-expanded="false" aria-controls="popup">열기</button>
      <div id="popup"><button id="chip">칩</button></div>
    `;
    expect(isFocusInExpandedPopup(document.getElementById('chip')!)).toBe(false);
  });
});
