import { render as rtlRender, fireEvent, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import type { ReactElement } from 'react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { BodySearch } from './body-search';
import { FocusQuickButtons } from './focus-quick-buttons';

/**
 * #1293 PR1 — 천체 검색 대화상자. 매칭 순위 자체는 `lib/body-search.test.ts` 가 본다 — 여기는 단축키 · ARIA ·
 * 키보드 선택 · Esc 의 자유시점 비발화 (계약 D1 · D2 · D3 의 단위 측면).
 */

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

// FocusQuickButtons(궤도선 토글)가 nuqs 훅을 쓴다 — D3 테스트에서 함께 렌더하므로 어댑터를 씌운다.
const render = (ui: ReactElement) => rtlRender(ui, { wrapper: withNuqsTestingAdapter() });

const dialog = () => screen.queryByTestId('body-search');
const input = () => screen.getByTestId('body-search-input');
const optionIds = () => screen.getAllByRole('option').map((el) => el.getAttribute('data-body-id'));

beforeEach(() => {
  sentCommands = [];
  useSimStore.setState({ selectedBodyId: null, mode: 'observe', bodyMenuOpen: false });
});

describe('BodySearch — 열기 (D1)', () => {
  it('트리거 클릭 → 대화상자 + 입력창 포커스 + 빈 검색어는 32개 전체', async () => {
    const user = userEvent.setup();
    render(<BodySearch />);
    expect(dialog()).toBeNull();
    await user.click(screen.getByTestId('body-search-trigger'));
    expect(screen.getByRole('dialog', { name: '천체 검색' })).toBeInTheDocument();
    expect(document.activeElement).toBe(input());
    expect(screen.getAllByRole('option')).toHaveLength(32);
  });

  it.each([
    ['/', { key: '/' }],
    ['Ctrl+K', { key: 'k', ctrlKey: true }],
    ['⌘+K', { key: 'k', metaKey: true }],
  ])('%s (포커스 없음) → 열림 + 기본 동작 가로챔', (_, init) => {
    render(<BodySearch />);
    const notPrevented = fireEvent.keyDown(document.body, init);
    expect(notPrevented).toBe(false);
    expect(dialog()).not.toBeNull();
  });

  it('편집 요소 포커스 중 `/` 는 단축키가 아니다 (글자 입력 보호) — Ctrl+K 는 연다', () => {
    render(
      <div>
        <input data-testid="other-input" />
        <BodySearch />
      </div>,
    );
    const other = screen.getByTestId('other-input');
    other.focus();
    expect(fireEvent.keyDown(other, { key: '/' })).toBe(true);
    expect(dialog()).toBeNull();
    fireEvent.keyDown(other, { key: 'k', ctrlKey: true });
    expect(dialog()).not.toBeNull();
  });

  it('수식키 조합 · 한글 조합 중 키는 열지 않는다', () => {
    render(<BodySearch />);
    fireEvent.keyDown(document.body, { key: '/', ctrlKey: true });
    fireEvent.keyDown(document.body, { key: 'k', ctrlKey: true, shiftKey: true });
    fireEvent.keyDown(document.body, { key: '/', isComposing: true });
    fireEvent.keyDown(document.body, { key: 'k' });
    expect(dialog()).toBeNull();
  });

  it('다른 모달이 열려 있으면 열지 않는다 (Modal 동시 open 미지원 계약)', () => {
    render(
      <div>
        <div data-modal-open="true" />
        <BodySearch />
      </div>,
    );
    fireEvent.keyDown(document.body, { key: '/' });
    expect(dialog()).toBeNull();
  });
});

describe('BodySearch — combobox · listbox (D2)', () => {
  it('ARIA — combobox 가 listbox 를 가리키고 활성 항목을 aria-activedescendant 로 표시', async () => {
    const user = userEvent.setup();
    render(<BodySearch />);
    await user.click(screen.getByTestId('body-search-trigger'));
    await user.type(input(), 'jup');
    const listbox = screen.getByRole('listbox');
    expect(input()).toHaveAttribute('role', 'combobox');
    expect(input()).toHaveAttribute('aria-controls', listbox.id);
    expect(input()).toHaveAttribute('aria-expanded', 'true');
    const first = screen.getByTestId('body-search-option-jupiter');
    expect(first).toHaveAttribute('aria-selected', 'true');
    expect(input()).toHaveAttribute('aria-activedescendant', first.id);
  });

  it('종류 표시 — 목성 = 행성, 타이탄 = 위성, 핼리 = 혜성', async () => {
    const user = userEvent.setup();
    render(<BodySearch />);
    await user.click(screen.getByTestId('body-search-trigger'));
    const kindOf = (id: string) =>
      screen
        .getByTestId(`body-search-option-${id}`)
        .querySelector('[data-testid="body-search-kind"]')?.textContent;
    expect(kindOf('jupiter')).toBe('행성');
    expect(kindOf('titan')).toBe('위성');
    expect(kindOf('halley')).toBe('혜성');
    expect(kindOf('pluto')).toBe('왜소행성');
  });

  it('↓ 다음 · ↑ 순환 · Enter → focusOn + 닫힘', async () => {
    const user = userEvent.setup();
    render(<BodySearch />);
    await user.click(screen.getByTestId('body-search-trigger'));
    await user.type(input(), 'tit');
    expect(optionIds()).toEqual(['titan', 'titania']);
    await user.keyboard('{ArrowDown}');
    expect(screen.getByTestId('body-search-option-titania')).toHaveAttribute(
      'aria-selected',
      'true',
    );
    await user.keyboard('{ArrowDown}'); // 끝 → 처음으로 순환
    expect(screen.getByTestId('body-search-option-titan')).toHaveAttribute('aria-selected', 'true');
    await user.keyboard('{ArrowUp}'); // 처음 → 끝으로 순환
    await user.keyboard('{Enter}');
    expect(sentCommands).toEqual([{ type: 'focusOn', bodyId: 'titania' }]);
    expect(dialog()).toBeNull();
  });

  it('검색어가 바뀌면 활성 항목이 1순위로 돌아간다', async () => {
    const user = userEvent.setup();
    render(<BodySearch />);
    await user.click(screen.getByTestId('body-search-trigger'));
    await user.keyboard('{ArrowDown}{ArrowDown}');
    await user.type(input(), '목성');
    expect(optionIds()[0]).toBe('jupiter');
    expect(screen.getByTestId('body-search-option-jupiter')).toHaveAttribute(
      'aria-selected',
      'true',
    );
  });

  it('클릭 선택 → focusOn + 닫힘', async () => {
    const user = userEvent.setup();
    render(<BodySearch />);
    await user.click(screen.getByTestId('body-search-trigger'));
    await user.type(input(), 'Halley');
    await user.click(screen.getByTestId('body-search-option-halley'));
    expect(sentCommands).toEqual([{ type: 'focusOn', bodyId: 'halley' }]);
    expect(dialog()).toBeNull();
  });

  it('결과 없음 → 안내 문구 · 빈 목록 · Enter 무동작', async () => {
    const user = userEvent.setup();
    render(<BodySearch />);
    await user.click(screen.getByTestId('body-search-trigger'));
    await user.type(input(), 'zzz');
    expect(screen.getByTestId('body-search-status')).toHaveTextContent('일치하는 천체가 없습니다');
    expect(screen.queryAllByRole('option')).toHaveLength(0);
    expect(input()).toHaveAttribute('aria-expanded', 'false');
    expect(input()).not.toHaveAttribute('aria-activedescendant');
    await user.keyboard('{Enter}');
    expect(sentCommands).toEqual([]);
    expect(dialog()).not.toBeNull();
  });

  it('다시 열면 검색어가 비어 있다', async () => {
    const user = userEvent.setup();
    render(<BodySearch />);
    await user.click(screen.getByTestId('body-search-trigger'));
    await user.type(input(), 'jup');
    await user.keyboard('{Escape}');
    await user.click(screen.getByTestId('body-search-trigger'));
    expect(input()).toHaveValue('');
  });
});

describe('BodySearch — Esc (D3)', () => {
  it('Esc → 대화상자만 닫힘 · 기본 동작 가로챔 · 자유시점 명령 0 (포커스 천체 있음)', async () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    const user = userEvent.setup();
    render(
      <div>
        <FocusQuickButtons />
        <BodySearch />
      </div>,
    );
    await user.click(screen.getByTestId('body-search-trigger'));
    expect(fireEvent.keyDown(input(), { key: 'Escape' })).toBe(false);
    expect(dialog()).toBeNull();
    expect(sentCommands.filter((c) => c.type === 'enterFreeFly')).toEqual([]);
    // 대조 — 대화상자가 없을 때의 Esc 는 여전히 자유시점이다 (리스너가 살아 있음).
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(sentCommands.filter((c) => c.type === 'enterFreeFly')).toHaveLength(1);
  });
});
