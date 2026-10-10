import { act, renderHook, waitFor } from '@testing-library/react';
import { withNuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { useDisplayToggle } from './use-display-toggle';

/**
 * #1265 D16 — 공용 토글 훅: store → command → URL(replace) 를 한 호출에서, 불가하면 셋 다 건드리지 않는다.
 */

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

const HW = { starfield: true, surfaceDetail: true, belt: true };

function setup(searchParams = '') {
  const onUrlUpdate = vi.fn<(e: UrlUpdateEvent) => void>();
  const { result } = renderHook(() => useDisplayToggle(), {
    wrapper: withNuqsTestingAdapter({ searchParams, onUrlUpdate, hasMemory: true }),
  });
  return { toggle: result.current, onUrlUpdate };
}

beforeEach(() => {
  sentCommands = [];
  useSimStore.setState({
    orbitLinesVisible: true,
    starsVisible: true,
    cloudsVisible: true,
    nightLightsVisible: true,
    beltVisible: true,
    kuiperVisible: true,
    displayCapabilities: HW,
  });
});

describe('useDisplayToggle', () => {
  it('OFF — store false · 명령 1건 · URL `clouds=off` (history replace)', async () => {
    const { toggle, onUrlUpdate } = setup();
    act(() => toggle('clouds'));
    expect(useSimStore.getState().cloudsVisible).toBe(false);
    expect(sentCommands).toEqual([{ type: 'setCloudsVisible', visible: false }]);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const last = onUrlUpdate.mock.calls.at(-1)![0];
    expect(last.searchParams.get('clouds')).toBe('off');
    expect(last.options.history).toBe('replace');
  });

  it('ON — `?stars=off` 에서 켜면 키가 사라진다', async () => {
    useSimStore.setState({ starsVisible: false });
    const { toggle, onUrlUpdate } = setup('?stars=off&focus=earth');
    act(() => toggle('stars'));
    expect(sentCommands).toEqual([{ type: 'setStarfieldVisible', visible: true }]);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    const last = onUrlUpdate.mock.calls.at(-1)![0];
    expect(last.searchParams.has('stars')).toBe(false);
    // 다른 키는 건드리지 않는다.
    expect(last.searchParams.get('focus')).toBe('earth');
  });

  it('궤도선 — 기존 명령 · `orbits` 키 (D11 북마크 불일치 해소 경로)', async () => {
    useSimStore.setState({ orbitLinesVisible: false });
    const { toggle, onUrlUpdate } = setup('?orbits=off');
    act(() => toggle('orbits'));
    expect(useSimStore.getState().orbitLinesVisible).toBe(true);
    expect(sentCommands).toEqual([{ type: 'setOrbitLinesVisible', visible: true }]);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.has('orbits')).toBe(false);
  });

  it('소프트웨어 렌더 — 별 토글은 store · 명령 · URL 전부 무변화 (D9 차단 지점)', async () => {
    useSimStore.setState({
      displayCapabilities: { starfield: false, surfaceDetail: true, belt: false },
    });
    const { toggle, onUrlUpdate } = setup();
    act(() => toggle('stars'));
    expect(useSimStore.getState().starsVisible).toBe(true);
    expect(sentCommands).toEqual([]);
    // URL 큐가 비어 있음을 한 틱 뒤에 확인한다.
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it('?surface=off — 구름·불빛 무변화 (D10)', () => {
    useSimStore.setState({
      displayCapabilities: { starfield: true, surfaceDetail: false, belt: true },
    });
    const { toggle } = setup();
    act(() => {
      toggle('clouds');
      toggle('nightLights');
    });
    expect(useSimStore.getState().cloudsVisible).toBe(true);
    expect(useSimStore.getState().nightLightsVisible).toBe(true);
    expect(sentCommands).toEqual([]);
  });

  it('장면 미준비 (caps=null) — 신규 3종 무변화, 궤도선은 동작 (Q4)', () => {
    useSimStore.setState({ displayCapabilities: null });
    const { toggle } = setup();
    act(() => {
      toggle('stars');
      toggle('clouds');
      toggle('nightLights');
      toggle('orbits');
    });
    expect(sentCommands).toEqual([{ type: 'setOrbitLinesVisible', visible: false }]);
  });

  it('#1319 PR3 소행성대 · 카이퍼 — OFF 명령 + URL `belt=off` · `kuiper=off`, ON 은 키 삭제', async () => {
    const { toggle, onUrlUpdate } = setup('?focus=earth');
    act(() => toggle('belt'));
    expect(useSimStore.getState().beltVisible).toBe(false);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.get('belt')).toBe('off');
    act(() => toggle('kuiper'));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.get('kuiper')).toBe('off'),
    );
    act(() => toggle('belt'));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.has('belt')).toBe(false),
    );
    const last = onUrlUpdate.mock.calls.at(-1)![0];
    expect(last.searchParams.get('kuiper')).toBe('off');
    expect(last.searchParams.get('focus')).toBe('earth');
    expect(sentCommands).toEqual([
      { type: 'setAsteroidBeltVisible', visible: false },
      { type: 'setKuiperBeltVisible', visible: false },
      { type: 'setAsteroidBeltVisible', visible: true },
    ]);
  });

  it('#1319 PR3 소프트웨어 렌더 — 소행성대 · 카이퍼 토글은 store · 명령 · URL 전부 무변화 (결정 3)', async () => {
    useSimStore.setState({
      displayCapabilities: { starfield: false, surfaceDetail: true, belt: false },
    });
    const { toggle, onUrlUpdate } = setup();
    act(() => {
      toggle('belt');
      toggle('kuiper');
    });
    expect(useSimStore.getState().beltVisible).toBe(true);
    expect(useSimStore.getState().kuiperVisible).toBe(true);
    expect(sentCommands).toEqual([]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it('같은 틱 연속 호출 — 호출 시점 store 를 기준으로 반전 (왕복)', () => {
    const { toggle } = setup();
    act(() => {
      toggle('nightLights');
      toggle('nightLights');
    });
    expect(sentCommands).toEqual([
      { type: 'setNightLightsVisible', visible: false },
      { type: 'setNightLightsVisible', visible: true },
    ]);
    expect(useSimStore.getState().nightLightsVisible).toBe(true);
  });
});
