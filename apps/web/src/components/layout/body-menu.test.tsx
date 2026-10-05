import { act, fireEvent, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AstroCore from '@astro-simulator/core';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { BODY_MENU_ITEMS, BodyMenu } from './body-menu';

/**
 * #1281 D6 — 「천체 ▾」 메뉴 키보드 조작 (WAI-ARIA APG Menu Button).
 * Tab 도달 → Enter/Space 열기 → 화살표 이동 → Enter 선택 → Esc 닫기. Esc 의 자유시점 비발화는
 * `focus-quick-buttons.test.tsx` (실제 Esc 리스너와 함께 렌더) 가 본다.
 */

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

// R-Phase 미진입 분기 — 현행 데이터에서 12개 전부 활성이라 disabled 경로는 부분 mock 으로만 재현된다
// (`celestial-info-panel.test.tsx` 와 같은 패턴). `BLOCKED` 에 넣은 body 만 미진입으로 본다.
const BLOCKED = new Set<string>();
vi.mock('@astro-simulator/core', async (importOriginal) => {
  const actual = await importOriginal<typeof AstroCore>();
  return {
    ...actual,
    isRPhaseFocusable: (id: string) => !BLOCKED.has(id) && actual.isRPhaseFocusable(id),
  };
});

const trigger = () => screen.getByTestId('body-menu-trigger');
const item = (id: string) => screen.getByTestId(`focus-${id}`);
const FIRST = BODY_MENU_ITEMS[0]!.id;
const LAST = BODY_MENU_ITEMS[BODY_MENU_ITEMS.length - 1]!.id;

/** 트리거 앞 · 뒤에 포커스 가능한 이웃을 둔다 — Tab 도달과 「Tab 으로 닫으면 트리거 다음 요소」 를 보려고. */
function renderWithNeighbors() {
  return render(
    <div>
      <button type="button" data-testid="before">
        before
      </button>
      <BodyMenu />
      <button type="button" data-testid="after">
        after
      </button>
    </div>,
  );
}

beforeEach(() => {
  sentCommands = [];
  BLOCKED.clear();
  useSimStore.setState({ selectedBodyId: null, bodyMenuOpen: false });
});

describe('BodyMenu — 열기 · 닫기 · ARIA', () => {
  it('닫힘: 메뉴 · 항목 언마운트, 트리거 aria-expanded=false · aria-controls 없음', () => {
    renderWithNeighbors();
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).not.toHaveAttribute('aria-controls');
    expect(screen.queryByTestId('body-menu')).toBeNull();
    expect(screen.queryByTestId('focus-earth')).toBeNull();
  });

  it('클릭으로 열림: role=menu · 12 항목 menuitemradio · aria-controls = 메뉴 id · store 열림', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    const menu = screen.getByRole('menu', { name: '천체 선택' });
    expect(menu).toHaveAttribute('data-testid', 'body-menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', menu.id);
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((el) => el.getAttribute('data-testid'))).toEqual(
      BODY_MENU_ITEMS.map((b) => `focus-${b.id}`),
    );
    expect(items.every((el) => el.getAttribute('tabindex') === '-1')).toBe(true);
    expect(useSimStore.getState().bodyMenuOpen).toBe(true);
  });

  it('선택된 천체만 aria-checked=true', () => {
    useSimStore.setState({ selectedBodyId: 'mars' });
    renderWithNeighbors();
    fireEvent.click(trigger());
    expect(item('mars')).toHaveAttribute('aria-checked', 'true');
    expect(item('earth')).toHaveAttribute('aria-checked', 'false');
  });

  it('트리거 재클릭 · 메뉴 밖 pointerdown · resize 로 닫힘', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    fireEvent.click(trigger());
    expect(screen.queryByTestId('body-menu')).toBeNull();

    fireEvent.click(trigger());
    fireEvent.pointerDown(screen.getByTestId('after'));
    expect(screen.queryByTestId('body-menu')).toBeNull();

    fireEvent.click(trigger());
    fireEvent(window, new Event('resize'));
    expect(screen.queryByTestId('body-menu')).toBeNull();
    expect(useSimStore.getState().bodyMenuOpen).toBe(false);
  });

  it('메뉴 안 pointerdown 은 닫지 않는다', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    fireEvent.pointerDown(item('venus'));
    expect(screen.getByTestId('body-menu')).toBeInTheDocument();
  });

  it('열린 채 언마운트되면 store 를 닫는다 (자동 숨김 영구 억제 방지)', () => {
    const { unmount } = renderWithNeighbors();
    fireEvent.click(trigger());
    expect(useSimStore.getState().bodyMenuOpen).toBe(true);
    unmount();
    expect(useSimStore.getState().bodyMenuOpen).toBe(false);
  });
});

describe('BodyMenu — 키보드 (D6)', () => {
  it('Tab 도달 → Enter 열림 + 첫 항목 포커스 → ↓ 이동 → Enter 선택 = focusOn · 닫힘 · 트리거 포커스', async () => {
    const user = userEvent.setup();
    renderWithNeighbors();
    screen.getByTestId('before').focus();
    await user.tab();
    expect(document.activeElement).toBe(trigger());
    await user.keyboard('{Enter}');
    expect(screen.getByTestId('body-menu')).toBeInTheDocument();
    expect(document.activeElement).toBe(item(FIRST));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item(BODY_MENU_ITEMS[1]!.id));
    await user.keyboard('{Enter}');
    expect(sentCommands).toEqual([{ type: 'focusOn', bodyId: BODY_MENU_ITEMS[1]!.id }]);
    expect(screen.queryByTestId('body-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('Space 로 열고 Space 로 선택', async () => {
    const user = userEvent.setup();
    renderWithNeighbors();
    trigger().focus();
    await user.keyboard(' ');
    expect(document.activeElement).toBe(item(FIRST));
    await user.keyboard(' ');
    expect(sentCommands).toEqual([{ type: 'focusOn', bodyId: FIRST }]);
  });

  it('선택된 천체가 있으면 열 때 그 항목에 포커스', async () => {
    useSimStore.setState({ selectedBodyId: 'saturn' });
    const user = userEvent.setup();
    renderWithNeighbors();
    trigger().focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(item('saturn'));
  });

  it('트리거 ↓ = 열고 (선택 · 없으면 첫) 항목 / ↑ = 열고 마지막 항목', async () => {
    const user = userEvent.setup();
    renderWithNeighbors();
    trigger().focus();
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item(FIRST));
    await user.keyboard('{Escape}');
    expect(document.activeElement).toBe(trigger());
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(item(LAST));
  });

  it('↓↑ 순환 · Home / End', async () => {
    const user = userEvent.setup();
    renderWithNeighbors();
    trigger().focus();
    await user.keyboard('{Enter}');
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(item(LAST));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item(FIRST));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(item(LAST));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(item(FIRST));
  });

  it('R-Phase 미진입 항목은 disabled 속성을 유지하고 화살표 이동에서 건너뛴다', async () => {
    BLOCKED.add(BODY_MENU_ITEMS[1]!.id);
    const user = userEvent.setup();
    renderWithNeighbors();
    trigger().focus();
    await user.keyboard('{Enter}');
    const blocked = item(BODY_MENU_ITEMS[1]!.id);
    expect(blocked).toBeDisabled();
    expect(blocked).toHaveAttribute('aria-disabled', 'true');
    expect(blocked).toHaveAttribute('data-r-phase-disabled', 'true');
    expect(blocked).toHaveAttribute('title');
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item(BODY_MENU_ITEMS[2]!.id));
    fireEvent.click(blocked);
    expect(sentCommands).toEqual([]);
  });

  it('Esc → 닫힘 + 트리거 포커스 + 이벤트 defaultPrevented (자유시점 리스너가 물러나는 신호)', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      item(FIRST).dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(screen.queryByTestId('body-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('메뉴 안 Tab → 닫고 트리거 다음 요소 / Shift+Tab → 닫고 트리거', async () => {
    const user = userEvent.setup();
    renderWithNeighbors();
    trigger().focus();
    await user.keyboard('{Enter}');
    await user.tab();
    expect(screen.queryByTestId('body-menu')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('after'));

    trigger().focus();
    await user.keyboard('{Enter}');
    await user.tab({ shift: true });
    expect(screen.queryByTestId('body-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });
});
