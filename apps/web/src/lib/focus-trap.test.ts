import { describe, expect, it, beforeEach, afterEach } from 'vitest';
import { FOCUSABLE_SELECTOR, getFocusableElements, resolveFocusTrapTarget } from './focus-trap';

/**
 * #848 — focus trap 순수 로직 단위 테스트.
 *
 * `Modal` 컴포넌트 통합 테스트(modal.test.tsx)가 실제 Tab 거동을 검증한다면, 여기서는 **경계
 * 계산** 만 격리 검증한다: 비활성/숨김 요소 제외, 첫/마지막 순환, 포커스가 모달 밖일 때의 회수.
 */
describe('focus-trap (#848)', () => {
  let container: HTMLDivElement;

  beforeEach(() => {
    container = document.createElement('div');
    document.body.appendChild(container);
  });
  afterEach(() => {
    container.remove();
  });

  describe('getFocusableElements', () => {
    it('표준 포커서블을 DOM 순서로 수집', () => {
      container.innerHTML = `
        <button data-id="b1">1</button>
        <a href="#x" data-id="a1">link</a>
        <input data-id="i1" />
        <span data-id="s1" tabindex="0">custom</span>
        <div data-id="d1">비포커서블</div>
      `;
      expect(getFocusableElements(container).map((el) => el.dataset.id)).toEqual([
        'b1',
        'a1',
        'i1',
        's1',
      ]);
    });

    it('disabled / tabindex=-1 / hidden / aria-hidden / display:none 제외', () => {
      container.innerHTML = `
        <button data-id="ok">ok</button>
        <button data-id="dis" disabled>disabled</button>
        <button data-id="neg" tabindex="-1">tabindex -1</button>
        <button data-id="hid" hidden>hidden</button>
        <button data-id="ariah" aria-hidden="true">aria-hidden</button>
        <button data-id="none" style="display:none">display none</button>
        <button data-id="invis" style="visibility:hidden">visibility hidden</button>
      `;
      expect(getFocusableElements(container).map((el) => el.dataset.id)).toEqual(['ok']);
    });

    it('inert 컨테이너 내부 요소 제외', () => {
      container.innerHTML = `
        <button data-id="ok">ok</button>
        <div inert><button data-id="inert-child">inert</button></div>
      `;
      expect(getFocusableElements(container).map((el) => el.dataset.id)).toEqual(['ok']);
    });

    it('Radix Slider 형태의 role=slider + tabindex=0 위젯을 포함', () => {
      container.innerHTML = `
        <button data-id="b">b</button>
        <span data-id="thumb" role="slider" tabindex="0"></span>
      `;
      expect(getFocusableElements(container).map((el) => el.dataset.id)).toEqual(['b', 'thumb']);
      // 셀렉터 SSoT 회귀 — `[tabindex]` 절이 커스텀 위젯을 흡수하는지.
      expect(FOCUSABLE_SELECTOR).toContain('[tabindex]:not([tabindex="-1"])');
    });
  });

  describe('resolveFocusTrapTarget', () => {
    beforeEach(() => {
      container.innerHTML = `
        <button data-id="first">first</button>
        <button data-id="mid">mid</button>
        <button data-id="last">last</button>
      `;
    });

    const byId = (id: string) => container.querySelector<HTMLElement>(`[data-id="${id}"]`)!;

    it('마지막 요소에서 Tab → 첫 요소로 순환', () => {
      expect(resolveFocusTrapTarget(container, byId('last'), false)).toBe(byId('first'));
    });

    it('첫 요소에서 Shift+Tab → 마지막 요소로 순환', () => {
      expect(resolveFocusTrapTarget(container, byId('first'), true)).toBe(byId('last'));
    });

    it('중간 요소에서는 개입하지 않음 (브라우저 기본 Tab 유지)', () => {
      expect(resolveFocusTrapTarget(container, byId('mid'), false)).toBeNull();
      expect(resolveFocusTrapTarget(container, byId('mid'), true)).toBeNull();
    });

    it('첫 요소에서 Tab / 마지막 요소에서 Shift+Tab 도 개입 없음', () => {
      expect(resolveFocusTrapTarget(container, byId('first'), false)).toBeNull();
      expect(resolveFocusTrapTarget(container, byId('last'), true)).toBeNull();
    });

    it('포커스가 모달 밖(body/배경 버튼)이면 방향에 맞는 경계로 회수', () => {
      const outside = document.createElement('button');
      document.body.appendChild(outside);
      expect(resolveFocusTrapTarget(container, outside, false)).toBe(byId('first'));
      expect(resolveFocusTrapTarget(container, outside, true)).toBe(byId('last'));
      expect(resolveFocusTrapTarget(container, null, false)).toBe(byId('first'));
      outside.remove();
    });

    it('포커서블이 0개면 컨테이너 자신으로 회수 (배경 탈출 차단)', () => {
      container.innerHTML = '<p>본문만 있는 모달</p>';
      expect(resolveFocusTrapTarget(container, document.body, false)).toBe(container);
    });

    it('disabled 요소는 경계 계산에서 제외', () => {
      byId('last').setAttribute('disabled', '');
      // 이제 마지막 포커서블은 mid.
      expect(resolveFocusTrapTarget(container, byId('mid'), false)).toBe(byId('first'));
    });
  });
});
