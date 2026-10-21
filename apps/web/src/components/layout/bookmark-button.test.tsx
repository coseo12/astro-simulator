import { render, screen, fireEvent, waitFor } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { BookmarkButton } from './bookmark-button';

const writeText = vi.fn(async (_text: string) => {});

beforeEach(() => {
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'research',
    julianDate: 2_451_545.5,
    selectedBodyId: 'jupiter',
    timeScale: 3600,
    fps: null,
    physicsEngine: 'newton',
    massMultipliers: {},
  });
  writeText.mockClear();
  // @ts-expect-error — jsdom navigator.clipboard 주입
  navigator.clipboard = { writeText };
  window.history.replaceState({}, '', '/');
});

describe('BookmarkButton', () => {
  it('julianDate 없으면 disabled', () => {
    useSimStore.setState({ julianDate: null });
    render(<BookmarkButton />);
    expect(screen.getByTestId('bookmark-button')).toBeDisabled();
  });

  it('클릭 시 클립보드에 URL 복사 — t/focus/speed/engine/mode 파라미터 포함', async () => {
    render(<BookmarkButton />);
    fireEvent.click(screen.getByTestId('bookmark-button'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const url = writeText.mock.calls[0]?.[0] ?? '';
    expect(url).toContain('t=2451545.50000');
    expect(url).toContain('focus=jupiter');
    expect(url).toContain('speed=3600');
    expect(url).toContain('engine=newton');
    expect(url).toContain('mode=research');
  });

  it('기본값(observe/kepler/1일/포커스 없음)은 URL에서 생략', async () => {
    useSimStore.setState({
      mode: 'observe',
      selectedBodyId: null,
      timeScale: 86_400,
      physicsEngine: 'kepler',
    });
    render(<BookmarkButton />);
    fireEvent.click(screen.getByTestId('bookmark-button'));
    await waitFor(() => expect(writeText).toHaveBeenCalledTimes(1));
    const url = writeText.mock.calls[0]?.[0] ?? '';
    expect(url).toContain('t=2451545.50000');
    expect(url).not.toContain('focus=');
    expect(url).not.toContain('speed=');
    expect(url).not.toContain('engine=');
    expect(url).not.toContain('mode=');
  });
});

// #1385 — `copied` 전환이 버튼 폭을 바꾸지 않게, 두 글리프를 항상 함께 두고 보이는 쪽만 바꾼다.
// jsdom 은 레이아웃이 없어 폭을 직접 잴 수 없다 → 「두 상태가 같은 칸에 공존」 구조를 계약으로 고정한다.
describe('BookmarkButton — 아이콘 폭 고정 (#1385)', () => {
  const glyphs = () => ({
    idle: screen.getByTestId('bookmark-icon-idle'),
    copied: screen.getByTestId('bookmark-icon-copied'),
  });

  it('복사 전후 모두 두 글리프가 같은 칸에 있고, visibility 만 바뀐다', async () => {
    render(<BookmarkButton />);
    const before = glyphs();
    expect(before.idle).toHaveTextContent('🔖');
    expect(before.copied).toHaveTextContent('✓');
    expect(before.idle).not.toHaveClass('invisible');
    expect(before.copied).toHaveClass('invisible');
    for (const el of [before.idle, before.copied]) {
      expect(el).toHaveClass('col-start-1', 'row-start-1');
    }
    expect(screen.getByTestId('bookmark-icon')).toHaveClass('inline-grid');

    fireEvent.click(screen.getByTestId('bookmark-button'));
    await waitFor(() => expect(glyphs().copied).not.toHaveClass('invisible'));
    const after = glyphs();
    expect(after.idle).toHaveClass('invisible');
    // 같은 노드를 유지한다 — 글자를 갈아 끼우는 렌더(폭 변화 원인)로 돌아가지 않았는지
    expect(after.idle).toBe(before.idle);
    expect(after.copied).toBe(before.copied);
  });

  it('접근 가능한 이름은 상태에 따라 바뀌고, 글리프는 이름에 섞이지 않는다', async () => {
    render(<BookmarkButton />);
    expect(screen.getByRole('button', { name: '북마크' })).toBeInTheDocument();
    expect(screen.getByTestId('bookmark-icon')).toHaveAttribute('aria-hidden', 'true');
    fireEvent.click(screen.getByTestId('bookmark-button'));
    expect(await screen.findByRole('button', { name: '복사됨' })).toBeInTheDocument();
  });
});
