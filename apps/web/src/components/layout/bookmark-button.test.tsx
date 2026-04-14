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
    unitSystem: 'astro',
    physicsEngine: 'newton',
    massMultipliers: {},
    pingCount: 0,
    lastPingAt: null,
  });
  writeText.mockClear();
  // @ts-expect-error — jsdom navigator.clipboard 주입
  navigator.clipboard = { writeText };
  window.history.replaceState({}, '', '/ko');
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
