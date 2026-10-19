import { act, renderHook, waitFor } from '@testing-library/react';
import { withNuqsTestingAdapter, type UrlUpdateEvent } from 'nuqs/adapters/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { DISPLAY_TOGGLES } from './display-toggles';
import { DISPLAY_URL_KEYS, useDisplayToggle } from './use-display-toggle';

/**
 * #1265 D16 — 공용 토글 훅: store → command → URL(replace) 를 한 호출에서, 불가하면 셋 다 건드리지 않는다.
 */

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

const HW = {
  starfield: true,
  surfaceDetail: true,
  belt: true,
  cometTails: true,
  corona: true,
  trails: true,
};

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
    cometTailsVisible: true,
    coronaVisible: true,
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

  it('#1341 궤적 (기본 꺼짐 행) — 켜면 URL `trails=on` · 끄면 키 삭제 · 엔진 비가용이면 셋 다 무변화', async () => {
    useSimStore.setState({ trailsVisible: false });
    const { toggle, onUrlUpdate } = setup('?focus=earth');
    act(() => toggle('trails'));
    expect(useSimStore.getState().trailsVisible).toBe(true);
    expect(sentCommands).toEqual([{ type: 'setTrailsVisible', visible: true }]);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1));
    expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.get('trails')).toBe('on');
    act(() => toggle('trails'));
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(2));
    const last = onUrlUpdate.mock.calls.at(-1)![0];
    expect(last.searchParams.has('trails')).toBe(false);
    expect(last.searchParams.get('focus')).toBe('earth');
    // N-body 엔진 — 가용성 검사가 막는다
    useSimStore.setState({ displayCapabilities: { ...HW, trails: false } });
    act(() => toggle('trails'));
    expect(useSimStore.getState().trailsVisible).toBe(false);
    expect(sentCommands).toHaveLength(2);
  });

  it('#1347 시간 사건 (web 전용 · 기본 켜짐) — 끄면 URL `events=off` · 켜면 키 삭제 · 명령 0건', async () => {
    useSimStore.setState({ eventsVisible: true });
    const { toggle, onUrlUpdate } = setup('?focus=earth');
    act(() => toggle('events'));
    expect(useSimStore.getState().eventsVisible).toBe(false);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(1));
    expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.get('events')).toBe('off');
    act(() => toggle('events'));
    expect(useSimStore.getState().eventsVisible).toBe(true);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalledTimes(2));
    const last = onUrlUpdate.mock.calls.at(-1)![0];
    expect(last.searchParams.has('events')).toBe(false);
    expect(last.searchParams.get('focus')).toBe('earth');
    expect(sentCommands).toEqual([]);
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
      displayCapabilities: {
        starfield: false,
        surfaceDetail: true,
        belt: false,
        cometTails: false,
        corona: false,
        trails: true,
      },
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
      displayCapabilities: {
        starfield: true,
        surfaceDetail: false,
        belt: true,
        cometTails: true,
        corona: true,
        trails: true,
      },
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
      displayCapabilities: {
        starfield: false,
        surfaceDetail: true,
        belt: false,
        cometTails: false,
        corona: false,
        trails: true,
      },
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

  it('#1329 PR2 혜성 꼬리 — OFF 명령 + URL `comettails=off`, ON 은 키 삭제 (다른 키 유지)', async () => {
    const { toggle, onUrlUpdate } = setup('?t=2446479.5&focus=halley');
    act(() => toggle('cometTails'));
    expect(useSimStore.getState().cometTailsVisible).toBe(false);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.get('comettails')).toBe('off');
    act(() => toggle('cometTails'));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.has('comettails')).toBe(false),
    );
    const last = onUrlUpdate.mock.calls.at(-1)![0];
    expect(last.searchParams.get('t')).toBe('2446479.5');
    expect(last.searchParams.get('focus')).toBe('halley');
    expect(sentCommands).toEqual([
      { type: 'setCometTailsVisible', visible: false },
      { type: 'setCometTailsVisible', visible: true },
    ]);
  });

  it('#1329 PR2 `?comettails=force` 로 연 뒤 끄고 켜면 URL 의 `force` 는 지워진다 (ON = 키 삭제 규약 — `?belt=N` 과 같음)', async () => {
    useSimStore.setState({
      displayCapabilities: {
        starfield: false,
        surfaceDetail: true,
        belt: false,
        cometTails: true,
        corona: false,
        trails: true,
      },
    });
    const { toggle, onUrlUpdate } = setup('?comettails=force');
    act(() => toggle('cometTails'));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.get('comettails')).toBe('off'),
    );
    act(() => toggle('cometTails'));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.has('comettails')).toBe(false),
    );
    expect(sentCommands).toEqual([
      { type: 'setCometTailsVisible', visible: false },
      { type: 'setCometTailsVisible', visible: true },
    ]);
  });

  it('#1329 PR2 소프트웨어 렌더 — 혜성 꼬리 토글은 store · 명령 · URL 전부 무변화 (결정 4)', async () => {
    useSimStore.setState({
      displayCapabilities: {
        starfield: false,
        surfaceDetail: true,
        belt: false,
        cometTails: false,
        corona: false,
        trails: true,
      },
    });
    const { toggle, onUrlUpdate } = setup();
    act(() => toggle('cometTails'));
    expect(useSimStore.getState().cometTailsVisible).toBe(true);
    expect(sentCommands).toEqual([]);
    await act(async () => {
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(onUrlUpdate).not.toHaveBeenCalled();
  });

  it('#1335 PR2 태양 코로나 — OFF 명령 + URL `corona=off`, ON 은 키 삭제 (다른 키 유지)', async () => {
    const { toggle, onUrlUpdate } = setup('?t=2451545&focus=sun');
    act(() => toggle('corona'));
    expect(useSimStore.getState().coronaVisible).toBe(false);
    await waitFor(() => expect(onUrlUpdate).toHaveBeenCalled());
    expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.get('corona')).toBe('off');
    act(() => toggle('corona'));
    expect(useSimStore.getState().coronaVisible).toBe(true);
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.has('corona')).toBe(false),
    );
    const last = onUrlUpdate.mock.calls.at(-1)![0];
    expect(last.searchParams.get('t')).toBe('2451545');
    expect(last.searchParams.get('focus')).toBe('sun');
    expect(sentCommands).toEqual([
      { type: 'setSunCoronaVisible', visible: false },
      { type: 'setSunCoronaVisible', visible: true },
    ]);
  });

  it('#1335 PR2 `?corona=force` 로 연 뒤 끄고 켜면 URL 의 `force` 는 지워진다 (ON = 키 삭제 규약)', async () => {
    useSimStore.setState({
      displayCapabilities: {
        starfield: false,
        surfaceDetail: true,
        belt: false,
        cometTails: false,
        corona: true,
        trails: true,
      },
    });
    const { toggle, onUrlUpdate } = setup('?corona=force');
    act(() => toggle('corona'));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.get('corona')).toBe('off'),
    );
    act(() => toggle('corona'));
    await waitFor(() =>
      expect(onUrlUpdate.mock.calls.at(-1)![0].searchParams.has('corona')).toBe(false),
    );
    expect(sentCommands).toEqual([
      { type: 'setSunCoronaVisible', visible: false },
      { type: 'setSunCoronaVisible', visible: true },
    ]);
  });

  it('#1335 PR2 소프트웨어 렌더 — 태양 코로나 토글은 store · 명령 · URL 전부 무변화 (결정 5)', async () => {
    useSimStore.setState({
      displayCapabilities: {
        starfield: false,
        surfaceDetail: true,
        belt: false,
        cometTails: false,
        corona: false,
        trails: true,
      },
    });
    const { toggle, onUrlUpdate } = setup();
    act(() => toggle('corona'));
    expect(useSimStore.getState().coronaVisible).toBe(true);
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

describe('#1373 PR2 — nuqs 키 맵 ↔ 표시 토글 표 (PR #1376 리뷰 권고 3 · #1347 qa B1 클래스)', () => {
  it('표의 urlKey 가 전부 DISPLAY_URL_KEYS 에 있다 — 없으면 nuqs 가 조용히 무시해 URL 이 안 바뀐다', () => {
    expect(DISPLAY_TOGGLES.map((d) => d.urlKey).filter((k) => !(k in DISPLAY_URL_KEYS))).toEqual(
      [],
    );
  });
});
