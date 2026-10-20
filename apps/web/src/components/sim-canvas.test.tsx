import { afterEach, beforeEach, describe, expect, it } from 'vitest';
import { shouldPreserveFocus } from './sim-canvas';

/**
 * #1380 — 캔버스 `pointerenter` refocus 보호 판정의 **배선** 단언 (PR #1384 리뷰 권고 1).
 *
 * 판정 함수 `isFocusInExpandedPopup` 는 `lib/expanded-popup.test.ts` 가 따로 본다. 여기서는 그 판정이 `shouldPreserveFocus`
 * 에 실제로 연결돼 있는지만 본다 — 연결 줄을 지우면 (리뷰어 변이 M3) 첫 케이스가 FAIL 한다. 대조 케이스는 같은 버튼을 팝업이
 * 닫힌 상태로 두어, 「버튼이라서」 가 아니라 「펼쳐진 팝업 안이라서」 보존됨을 가른다 (마우스 포커스 = `:focus-visible` 거짓).
 */
describe('shouldPreserveFocus — 펼쳐진 팝업 (#1380)', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    root.remove();
  });

  function mount(expanded: boolean): HTMLButtonElement {
    root.innerHTML = `
      <button id="trigger" aria-expanded="${expanded}" aria-controls="popup">열기</button>
      <div id="popup"><button id="chip" type="button">화성 충</button></div>
    `;
    return document.getElementById('chip') as HTMLButtonElement;
  }

  it('`aria-expanded="true"` 트리거의 `aria-controls` 대상 안 일반 버튼 (`:focus-visible` 거짓) — 보존한다', () => {
    const chip = mount(true);
    expect(chip.matches(':focus-visible')).toBe(false);
    expect(shouldPreserveFocus(chip)).toBe(true);
  });

  it('대조 — 같은 버튼이라도 팝업이 닫혀 있으면 보존하지 않는다 (#699 마우스 포커스 회수 유지)', () => {
    const chip = mount(false);
    expect(chip.matches(':focus-visible')).toBe(false);
    expect(shouldPreserveFocus(chip)).toBe(false);
  });
});
