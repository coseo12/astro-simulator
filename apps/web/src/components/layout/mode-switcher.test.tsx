import { act, render, screen, fireEvent } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { isFocusInExpandedPopup } from '@/lib/expanded-popup';
import { ModeSwitcher } from './mode-switcher';

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

beforeEach(() => {
  sentCommands = [];
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'observe',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    modeMenuOpen: false,
  });
});

describe('ModeSwitcher', () => {
  it('#1390 PR0 — 폭 분기: 버튼 그룹은 모바일(max-sm)에서, 메뉴 트리거는 sm 이상에서 숨는다', () => {
    render(<ModeSwitcher />);
    // jsdom 은 미디어 쿼리를 계산하지 않는다 — 분기는 클래스 계약으로 고정한다 (실 폭은 브라우저 실측).
    expect(screen.getByTestId('mode-switcher').className).toContain('max-sm:hidden');
    expect(screen.getByTestId('mode-menu-trigger').className).toContain('sm:hidden');
    expect(screen.getByTestId('mode-menu-trigger').className).not.toContain('max-sm:hidden');
    // 버튼 그룹 안 개별 버튼에는 폭 분기가 없다 (#1281 의 비활성 모드 개별 숨김은 그룹 숨김으로 흡수).
    for (const id of ['observe', 'research', 'education', 'sandbox']) {
      expect(screen.getByTestId(`mode-${id}`).className).not.toContain('max-sm:');
    }
  });

  it('4개 모드 버튼 렌더', () => {
    render(<ModeSwitcher />);
    expect(screen.getByTestId('mode-observe')).toBeInTheDocument();
    expect(screen.getByTestId('mode-research')).toBeInTheDocument();
    expect(screen.getByTestId('mode-education')).toBeInTheDocument();
    expect(screen.getByTestId('mode-sandbox')).toBeInTheDocument();
  });

  it('observe가 초기 active 상태', () => {
    render(<ModeSwitcher />);
    expect(screen.getByTestId('mode-observe')).toHaveAttribute('data-active', 'true');
    expect(screen.getByTestId('mode-research')).toHaveAttribute('data-active', 'false');
  });

  it('research 클릭 시 store 모드 갱신 + setMode 명령', () => {
    render(<ModeSwitcher />);
    fireEvent.click(screen.getByTestId('mode-research'));
    expect(useSimStore.getState().mode).toBe('research');
    expect(sentCommands).toContainEqual({ type: 'setMode', mode: 'research' });
  });

  it('education 모드는 disabled 상태', () => {
    render(<ModeSwitcher />);
    const btn = screen.getByTestId('mode-education') as HTMLButtonElement;
    expect(btn).toBeDisabled();
    // P2+ 툴팁 존재
    expect(btn).toHaveAttribute('title');
  });

  it('disabled 모드 클릭은 setMode 명령 발행 안 함', () => {
    render(<ModeSwitcher />);
    fireEvent.click(screen.getByTestId('mode-sandbox'));
    expect(sentCommands).not.toContainEqual(
      expect.objectContaining({ type: 'setMode', mode: 'sandbox' }),
    );
  });

  it('모드 변경 시 html[data-mode] 속성 동기화', () => {
    render(<ModeSwitcher />);
    fireEvent.click(screen.getByTestId('mode-research'));
    expect(document.documentElement.getAttribute('data-mode')).toBe('research');
  });
});

const trigger = () => screen.getByTestId('mode-menu-trigger');
const item = (id: string) => screen.getByTestId(`mode-menu-${id}`);

/** 트리거 앞 · 뒤에 포커스 가능한 이웃 — Tab 도달 · 「Tab 으로 닫으면 트리거 다음 요소」 를 보려고 (`body-menu.test.tsx` 동형). */
function renderWithNeighbors() {
  return render(
    <div>
      <button type="button" data-testid="before">
        before
      </button>
      <ModeSwitcher />
      <button type="button" data-testid="after">
        after
      </button>
    </div>,
  );
}

describe('ModeSwitcher — 모바일 모드 메뉴 (#1390 PR0)', () => {
  it('트리거는 현재 모드를 보이고 이름은 「모드: <현재>」, 닫힘 동안 aria-controls 없음', () => {
    useSimStore.setState({ mode: 'research' });
    renderWithNeighbors();
    expect(trigger()).toHaveAttribute('aria-haspopup', 'menu');
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(trigger()).not.toHaveAttribute('aria-controls');
    expect(screen.getByRole('button', { name: '모드: 연구' })).toBe(trigger());
    expect(screen.queryByTestId('mode-menu')).toBeNull();
  });

  it('열림: role=menu · 4 항목 menuitemradio · 현재 모드만 aria-checked · aria-controls = 메뉴 id · store 열림', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    const menu = screen.getByRole('menu', { name: '모드 선택' });
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', menu.id);
    const items = screen.getAllByRole('menuitemradio');
    expect(items.map((el) => el.getAttribute('data-testid'))).toEqual([
      'mode-menu-observe',
      'mode-menu-research',
      'mode-menu-education',
      'mode-menu-sandbox',
    ]);
    expect(items.map((el) => el.getAttribute('aria-checked'))).toEqual([
      'true',
      'false',
      'false',
      'false',
    ]);
    expect(useSimStore.getState().modeMenuOpen).toBe(true);
  });

  it('교육 · 샌드박스는 메뉴 안 비활성 항목 — disabled + 보이는 사유 「P2+ 예정」, 클릭해도 전환 없음', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    for (const id of ['education', 'sandbox']) {
      expect(item(id)).toBeDisabled();
      expect(item(id)).toHaveTextContent('P2+ 예정');
    }
    expect(item('research')).not.toBeDisabled();
    fireEvent.click(item('education'));
    expect(useSimStore.getState().mode).toBe('observe');
    expect(sentCommands).toEqual([]);
  });

  it('#1380 — 열린 메뉴의 항목 · 트리거는 캔버스 refocus 보호 대상, 닫히면 아니다', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    expect(isFocusInExpandedPopup(item('research'))).toBe(true);
    expect(isFocusInExpandedPopup(trigger())).toBe(true);
    expect(isFocusInExpandedPopup(screen.getByTestId('after'))).toBe(false);
    fireEvent.click(trigger());
    expect(screen.queryByTestId('mode-menu')).toBeNull();
    expect(isFocusInExpandedPopup(trigger())).toBe(false);
  });

  it('항목 선택 → 모드 전환 (store + setMode 명령) · 닫힘 · 트리거 포커스 · 트리거 글자 갱신', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    fireEvent.click(item('research'));
    expect(useSimStore.getState().mode).toBe('research');
    expect(sentCommands).toContainEqual({ type: 'setMode', mode: 'research' });
    expect(screen.queryByTestId('mode-menu')).toBeNull();
    expect(useSimStore.getState().modeMenuOpen).toBe(false);
    expect(document.activeElement).toBe(trigger());
    expect(trigger()).toHaveTextContent('연구');
  });

  it('현재 모드 재선택은 명령을 보내지 않고 닫기만 한다', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    fireEvent.click(item('observe'));
    expect(sentCommands).toEqual([]);
    expect(screen.queryByTestId('mode-menu')).toBeNull();
  });

  it('메뉴 밖 pointerdown · resize 로 닫힘, 메뉴 안 pointerdown 은 유지', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    fireEvent.pointerDown(item('research'));
    expect(screen.getByTestId('mode-menu')).toBeInTheDocument();
    fireEvent.pointerDown(screen.getByTestId('after'));
    expect(screen.queryByTestId('mode-menu')).toBeNull();

    fireEvent.click(trigger());
    fireEvent(window, new Event('resize'));
    expect(screen.queryByTestId('mode-menu')).toBeNull();
    expect(useSimStore.getState().modeMenuOpen).toBe(false);
  });

  it('열린 채 언마운트되면 store 를 닫는다 (상단 바 자동 숨김 영구 억제 방지)', () => {
    const { unmount } = renderWithNeighbors();
    fireEvent.click(trigger());
    expect(useSimStore.getState().modeMenuOpen).toBe(true);
    unmount();
    expect(useSimStore.getState().modeMenuOpen).toBe(false);
  });

  it('키보드: Enter 열림 + 현재 모드 포커스 → ↓ 는 비활성 항목을 건너뛰고 순환 → Enter 선택', async () => {
    const user = userEvent.setup();
    renderWithNeighbors();
    trigger().focus();
    await user.keyboard('{Enter}');
    expect(document.activeElement).toBe(item('observe'));
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item('research'));
    // 교육 · 샌드박스 (disabled) 를 건너뛰고 처음으로 순환한다.
    await user.keyboard('{ArrowDown}');
    expect(document.activeElement).toBe(item('observe'));
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(item('research'));
    await user.keyboard('{Enter}');
    expect(useSimStore.getState().mode).toBe('research');
    expect(document.activeElement).toBe(trigger());
  });

  it('키보드: Space 열림 · ↑ 로 열면 마지막 활성 항목 · Home/End', async () => {
    const user = userEvent.setup();
    renderWithNeighbors();
    trigger().focus();
    await user.keyboard(' ');
    expect(document.activeElement).toBe(item('observe'));
    await user.keyboard('{End}');
    expect(document.activeElement).toBe(item('research'));
    await user.keyboard('{Home}');
    expect(document.activeElement).toBe(item('observe'));
    await user.keyboard('{Escape}');
    expect(screen.queryByTestId('mode-menu')).toBeNull();
    await user.keyboard('{ArrowUp}');
    expect(document.activeElement).toBe(item('research'));
  });

  it('Esc 는 capture 에서 preventDefault 하고 닫은 뒤 트리거로 포커스를 돌린다', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(screen.queryByTestId('mode-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('Tab → 닫고 트리거 다음 요소 / Shift+Tab → 닫고 트리거', async () => {
    const user = userEvent.setup();
    renderWithNeighbors();
    trigger().focus();
    await user.keyboard('{Enter}');
    await user.tab();
    expect(screen.queryByTestId('mode-menu')).toBeNull();
    expect(document.activeElement).not.toBe(trigger());
    expect(document.activeElement).not.toBe(document.body);

    trigger().focus();
    await user.keyboard('{Enter}');
    await user.tab({ shift: true });
    expect(screen.queryByTestId('mode-menu')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('포커스가 트리거 · 메뉴를 둘 다 벗어나면 닫힌다', () => {
    renderWithNeighbors();
    fireEvent.click(trigger());
    fireEvent.blur(item('observe'), { relatedTarget: screen.getByTestId('after') });
    expect(screen.queryByTestId('mode-menu')).toBeNull();
  });
});
