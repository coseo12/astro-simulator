import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { TopBar } from './top-bar';

/**
 * #1265 D4 — 표시 패널이 열린 동안 관찰 모드 자동 숨김(3초)이 상단 바를 지우지 않는다.
 * 양성 대조: 패널이 닫혀 있으면 같은 조건에서 숨는다 (억제 술어가 공허 참이 아님을 같은 파일에서 고정).
 */

const INACTIVITY_WAIT_MS = 4000;

beforeEach(() => {
  vi.useFakeTimers();
  useSimStore.setState({ mode: 'observe', displayPanelOpen: false, bodyMenuOpen: false });
});
afterEach(() => {
  vi.useRealTimers();
});

const opacity = () => screen.getByTestId('topbar').style.opacity;

describe('TopBar — 자동 숨김', () => {
  it('관찰 모드 · 패널 닫힘 · 4초 무입력 → opacity 0 (양성 대조)', () => {
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('0');
  });

  it('관찰 모드 · 패널 열림 · 4초 무입력 → opacity 1 (D4)', () => {
    useSimStore.setState({ displayPanelOpen: true });
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('1');
  });

  it('패널을 닫으면 비활성 상태가 다시 숨김으로 이어진다', () => {
    useSimStore.setState({ displayPanelOpen: true });
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    act(() => useSimStore.setState({ displayPanelOpen: false }));
    expect(opacity()).toBe('0');
  });

  it('#1281 D7 — 천체 메뉴 열림 · 4초 무입력 → opacity 1, 닫으면 다시 숨김', () => {
    useSimStore.setState({ bodyMenuOpen: true });
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('1');
    act(() => useSimStore.setState({ bodyMenuOpen: false }));
    expect(opacity()).toBe('0');
  });

  it('#1281 D7 — 숨은 뒤 터치(pointerdown) → 즉시 opacity 1', () => {
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('0');
    act(() => {
      window.dispatchEvent(new Event('pointerdown'));
    });
    expect(opacity()).toBe('1');
  });

  it('research 모드는 패널과 무관하게 숨기지 않는다 (기존 동작 보존)', () => {
    useSimStore.setState({ mode: 'research' });
    render(<TopBar />);
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('1');
  });
});

/**
 * #1313 — 모바일 우측 그룹 오버플로 메뉴 (「⋯」). jsdom 은 미디어 쿼리를 계산하지 않으므로 `max-sm:` 표시 여부가 아니라
 * 상태 · 속성 · 리스너 배선만 본다 (실제 375 · 360 배치는 실 브라우저 검증 — PR 기록).
 */
describe('TopBar — 오버플로 메뉴 (#1313)', () => {
  const toggle = () => screen.getByTestId('topbar-overflow-toggle');
  const group = () => screen.getByTestId('topbar-right');
  const renderBar = () =>
    render(
      <TopBar
        right={
          <button type="button" data-testid="inner-control">
            x
          </button>
        }
      />,
    );

  it('닫힘: aria-expanded=false · 우측 그룹은 max-sm 에서 숨김 클래스 · aria-controls 가 그룹을 가리킨다', () => {
    renderBar();
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(toggle()).toHaveAttribute('aria-controls', group().id);
    expect(toggle()).toHaveAccessibleName(/도구 더 보기/);
    expect(group().className).toContain('max-sm:hidden');
    expect(group()).not.toHaveAttribute('data-overflow-open');
  });

  it('클릭 → 열림 (패널 클래스 · data-overflow-open) · 다시 클릭 → 닫힘', () => {
    renderBar();
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    expect(group()).toHaveAttribute('data-overflow-open', 'true');
    expect(group().className).toContain('max-sm:flex-wrap');
    expect(group().className).not.toContain('max-sm:hidden');
    fireEvent.click(toggle());
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
  });

  it('sm 이상 클래스는 열림 여부와 무관하게 같다 (1280 · 1440 무변경 — max-sm 접두 클래스만 바뀐다)', () => {
    renderBar();
    const smUp = () =>
      group()
        .className.split(/\s+/)
        .filter((c) => c && !c.startsWith('max-sm:'))
        .sort();
    const closed = smUp();
    fireEvent.click(toggle());
    expect(smUp()).toEqual(closed);
    expect(toggle().className).toContain('sm:hidden');
  });

  it('Esc → 닫힘 + preventDefault (자유시점 리스너가 물러나는 신호) + 포커스 「⋯」 복귀', () => {
    renderBar();
    fireEvent.click(toggle());
    screen.getByTestId('inner-control').focus();
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    expect(document.activeElement).toBe(toggle());
  });

  it.each([
    ['표시 패널', () => useSimStore.setState({ displayPanelOpen: true })],
    ['천체 메뉴', () => useSimStore.setState({ bodyMenuOpen: true })],
    [
      '모달',
      () => {
        const m = document.createElement('div');
        m.setAttribute('data-modal-open', 'true');
        document.body.appendChild(m);
      },
    ],
  ])('%s 이 열려 있으면 Esc 를 양보한다 (열림 유지 · preventDefault 안 함)', (_name, openOther) => {
    renderBar();
    fireEvent.click(toggle());
    act(() => openOther());
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      window.dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(false);
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    document.querySelectorAll('[data-modal-open]').forEach((el) => el.remove());
  });

  it('캔버스 pointerdown → 닫힘 / 패널 밖의 다른 요소 pointerdown → 유지', () => {
    renderBar();
    fireEvent.click(toggle());
    const other = document.createElement('div');
    document.body.appendChild(other);
    act(() => {
      other.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(toggle()).toHaveAttribute('aria-expanded', 'true');
    const canvas = document.createElement('canvas');
    document.body.appendChild(canvas);
    act(() => {
      canvas.dispatchEvent(new Event('pointerdown', { bubbles: true }));
    });
    expect(toggle()).toHaveAttribute('aria-expanded', 'false');
    other.remove();
    canvas.remove();
  });

  it('열린 동안 관찰 모드 자동 숨김을 억제한다', () => {
    renderBar();
    fireEvent.click(toggle());
    act(() => {
      vi.advanceTimersByTime(INACTIVITY_WAIT_MS);
    });
    expect(opacity()).toBe('1');
    fireEvent.click(toggle());
    expect(opacity()).toBe('0');
  });
});
