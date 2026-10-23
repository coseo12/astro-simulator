import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { isAbsoluteFocusView } from '@astro-simulator/core';
import type { CoreCommand } from '@astro-simulator/shared';
import { DISPLAY_TOGGLES } from '@/core/display-toggles';
import { resetTimeEventsForTest } from '@/lib/time-events';
import { decodeTimeEvents } from '@/lib/time-events-data';
import { SCRUBBER_MAX_JD, SCRUBBER_MIN_JD } from '@/lib/time-scrubber';
import { TOURS, TOUR_OVERVIEW, type TourDef } from '@/lib/tours';
import { NEW_MOON_2024_03_10_JD } from '@/lib/tours/eclipse-tour';
import { useSimStore } from '@/store/sim-store';
import { useTourStore } from '@/store/tour-store';
import { TourCard } from './tour-card';

/**
 * #1390 — 투어 카드 + 컨트롤러 통합 (ADR `20261021-1390` DoD E1 · E2 · E3 · E4 · E5).
 *
 * core 는 테스트 더블이다 — 명령을 받으면 `core-adapter` 가 하는 store 반영을 **동기로** 흉내낸다 (PR1 실측: 실제 core 도 동기).
 * 사건 목록은 실제 사전 계산 파일을 로더로 넘긴다 (단계 시각이 실데이터 id 에서 해석되는지까지 본다).
 */

let sentCommands: CoreCommand[] = [];
function fakeCore(cmd: CoreCommand) {
  sentCommands.push(cmd);
  const s = useSimStore.getState();
  switch (cmd.type) {
    case 'focusOn':
      s.setSelectedBody(cmd.bodyId);
      break;
    case 'resetCamera':
      s.setSelectedBody(null);
      break;
    case 'enterFreeFly':
      s.enterFreeFly();
      break;
    case 'jumpToJulianDate':
      s.setTime(cmd.julianDate);
      break;
    case 'setTimeScale':
      s.setTimeScale(cmd.scale);
      break;
    case 'setMode':
      s.setMode(cmd.mode);
      break;
    default:
      break;
  }
}
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => fakeCore,
  // 거리 자 readout (`useRulerDistance`) — 엔진 상태 없음 → Kepler 폴백 (#1390 PR3).
  useSimBodyState: () => null,
}));

const setDisplayUrl = vi.fn();
vi.mock('nuqs', () => ({
  useQueryStates: () => [{}, setDisplayUrl],
  parseAsString: {},
}));

const EVENTS_PATH = resolve(__dirname, '../../../public/data/events/time-events.json');
const EVENTS_RAW: unknown = JSON.parse(readFileSync(EVENTS_PATH, 'utf8'));

const CAPS = {
  starfield: true,
  surfaceDetail: true,
  belt: true,
  cometTails: true,
  corona: true,
  trails: true,
};

const INITIAL_INTENTS = Object.fromEntries(
  DISPLAY_TOGGLES.map((d) => [d.intentKey, d.defaultVisible]),
);

beforeEach(() => {
  sentCommands = [];
  setDisplayUrl.mockReset();
  resetTimeEventsForTest(async () => EVENTS_RAW);
  window.history.replaceState(null, '', '/?mode=education&stars=off');
  useTourStore.getState().reset();
  useSimStore.setState({
    mode: 'education',
    selectedBodyId: null,
    freeFlyMode: false,
    julianDate: 2451545,
    timeScale: 86_400,
    rulerAnchorId: null,
    focusViewRequest: null,
    displayCapabilities: CAPS,
    ...INITIAL_INTENTS,
    starsVisible: false,
  });
});

afterEach(() => {
  // `performance.now` 등 spy 는 단언 실패와 무관하게 여기서 되돌린다 (본문 안 복원은 실패 시 건너뛰어 다음 테스트로 샌다).
  vi.restoreAllMocks();
  resetTimeEventsForTest();
});

/** 시작 → 사건 목록 도착 → 1단계 적용까지. */
async function startEclipse() {
  render(<TourCard />);
  await act(async () => {
    fireEvent.click(screen.getByTestId('tour-item-eclipse'));
  });
  // 로더 promise · 반영 effect.
  await act(async () => {
    await Promise.resolve();
  });
  expect(useTourStore.getState().activeTourId).toBe('eclipse');
}

describe('TourCard — 목록 보기 (E1)', () => {
  it('교육 모드에서 region + 투어 목록 (role=list)', () => {
    render(<TourCard />);
    const region = screen.getByRole('region', { name: '가이드 투어' });
    expect(region).toBeInTheDocument();
    const list = screen.getByRole('list');
    expect(list.querySelectorAll('li')).toHaveLength(TOURS.length);
    for (const tour of TOURS) {
      expect(screen.getByTestId(`tour-item-${tour.id}`)).toHaveTextContent(tour.title);
    }
  });

  it('#1390 — 카드는 HUD 층 한 칸 위 (같은 층 뒤 형제인 줌 슬라이더가 375 머리줄 「×」 · 「접기」 를 덮지 않게 — PR #1394 qa)', () => {
    render(<TourCard />);
    expect(screen.getByTestId('tour-card').className.split(/\s+/)).toContain(
      'z-[calc(var(--z-hud)_+_1)]',
    );
  });

  it('교육 모드가 아니면 아무것도 그리지 않는다', () => {
    useSimStore.setState({ mode: 'observe' });
    render(<TourCard />);
    expect(screen.queryByTestId('tour-card')).toBeNull();
  });
});

describe('TourCard — 시작 · 단계 적용 (E2)', () => {
  it('1단계: 지구 포커스 · 사건 시각 · 정지 · 거리 자 달 · 포커스 = 다음', async () => {
    await startEclipse();
    const s = useSimStore.getState();
    expect(s.selectedBodyId).toBe('earth');
    expect(s.timeScale).toBe(0);
    expect(s.rulerAnchorId).toBe('moon');
    // #1370 — 사건 파일 재생성 (ΔT 적용) 으로 2024-04-08 일식 시각이 `17:56:58 → 17:55:49 UTC` (`2460409.2479 → .2471`).
    expect(s.julianDate).toBeCloseTo(2460409.2471, 3);
    expect(useTourStore.getState().drift).toEqual([]);
    expect(screen.getByTestId('tour-step-title')).toHaveTextContent('일식의 순간');
    expect(screen.getByTestId('tour-progress')).toHaveTextContent('1 / 5');
    expect(document.activeElement).toBe(screen.getByTestId('tour-next'));
    // 순서 계약 — 시각 → 포커스 → 배속.
    const types = sentCommands.map((c) => c.type);
    expect(types.indexOf('jumpToJulianDate')).toBeLessThan(types.indexOf('focusOn'));
    expect(types.indexOf('focusOn')).toBeLessThan(types.indexOf('setTimeScale'));
  });

  it('전 단계 순회 — 각 단계의 포커스 · 시각 · 배속 · 시점 요청', async () => {
    await startEclipse();
    const next = () => act(() => fireEvent.click(screen.getByTestId('tour-next')));

    expect(useSimStore.getState().orbitLinesVisible).toBe(true);
    next();
    expect(useSimStore.getState().focusViewRequest).toEqual({
      bodyId: 'earth',
      view: 'facing-parent',
    });
    expect(useSimStore.getState().rulerAnchorId).toBeNull();
    // 시점 방향 단계는 궤도선을 끈다 (store + core 명령, URL 은 쓰지 않는다 — 결정 E6).
    expect(useSimStore.getState().orbitLinesVisible).toBe(false);
    expect(sentCommands).toContainEqual({ type: 'setOrbitLinesVisible', visible: false });
    expect(setDisplayUrl).not.toHaveBeenCalled();

    next();
    expect(useSimStore.getState().julianDate).toBe(NEW_MOON_2024_03_10_JD);

    next();
    expect(useSimStore.getState().selectedBodyId).toBe('moon');
    // #1370 — 2025-03-14 월식 `07:06:51 → 07:05:41 UTC` (`2460748.7964 → .7956`).
    expect(useSimStore.getState().julianDate).toBeCloseTo(2460748.7956, 3);

    next();
    expect(useSimStore.getState().timeScale).toBe(600);
    expect(useTourStore.getState().planned?.window).not.toBeNull();
    expect(screen.getByTestId('tour-next')).toHaveTextContent('완료');
    // 누른 버튼 그대로 (다음 → 완료 같은 요소).
    expect(document.activeElement).toBe(screen.getByTestId('tour-next'));
    expect(useTourStore.getState().drift).toEqual([]);
  });
});

/** 사건 id → 율리우스일 (실제 사전 계산 파일 — 컨트롤러와 독립으로 기대값을 셈한다). */
const EVENT_JD = new Map(
  decodeTimeEvents(EVENTS_RAW, { startJd: SCRUBBER_MIN_JD, endJd: SCRUBBER_MAX_JD }).map((e) => [
    e.id,
    e.julianDate,
  ]),
);
const HOURS_PER_DAY = 24;

/**
 * #1390 PR2 — 전 투어 전 단계 store 상태 단언 (DoD E2). 투어를 더하면 그대로 새 투어를 순회한다. 기대값은 단계 선언에서 직접
 * 셈한다 (엔진의 `planned` 를 기대값으로 쓰지 않는다 — 같은 출처끼리 비교하면 엔진 결함이 숨는다).
 *
 * 시작 전 별 배경은 꺼져 있다 (`beforeEach` — `stars=off`). 단계가 별 배경을 지정하지 않으면 꺼진 채, 지정하면 그 값이어야 한다.
 */
describe.each(TOURS.map((t) => [t.id, t] as const))(
  'TourCard — 전 단계 상태 (E2) · %s',
  (_id, tour: TourDef) => {
    it('단계마다 포커스 · 시각 · 배속 · 시점 요청 · 표시 의도 12종 · 거리 자 = 단계 선언, 이탈 0', async () => {
      const snapshot = { ...INITIAL_INTENTS, starsVisible: false } as Record<string, boolean>;
      render(<TourCard />);
      await act(async () => {
        fireEvent.click(screen.getByTestId(`tour-item-${tour.id}`));
      });
      await act(async () => {
        await Promise.resolve();
      });
      expect(useTourStore.getState().activeTourId).toBe(tour.id);

      let expectedJd: number | null = useSimStore.getState().julianDate;
      for (const [i, step] of tour.steps.entries()) {
        if (i > 0) act(() => fireEvent.click(screen.getByTestId('tour-next')));
        const s = useSimStore.getState();
        const label = `${tour.id} ${i + 1} (${step.id})`;
        const focus = step.camera.focus === TOUR_OVERVIEW ? null : step.camera.focus;
        expect(s.selectedBodyId, label).toBe(focus);
        expect(s.freeFlyMode, label).toBe(false);
        expect(s.timeScale, label).toBe(step.timeScale ?? 0);
        if (step.time) {
          expectedJd =
            'julianDate' in step.time
              ? step.time.julianDate
              : EVENT_JD.get(step.time.eventId)! + (step.time.offsetHours ?? 0) / HOURS_PER_DAY;
        }
        // 시각 생략 단계는 앞 단계 시각이 유지된다 (테스트 더블은 프레임 진행이 없어 재생 단계도 시작 시각에 머문다).
        expect(Math.abs(s.julianDate! - expectedJd!), label).toBeLessThanOrEqual(1e-6);
        // 시점 요청 — 천체는 그 시점, 개요는 절대 시점만 (`bodyId: null` — #1390 Amendment 1). 테스트 더블에는 소비자가 없어 남는다.
        const view = step.camera.view;
        expect(s.focusViewRequest, label).toEqual(
          view !== undefined && (focus !== null || isAbsoluteFocusView(view))
            ? { bodyId: focus, view }
            : null,
        );
        for (const def of DISPLAY_TOGGLES) {
          const specified = (step.display as Record<string, boolean> | undefined)?.[def.id];
          expect(s[def.intentKey], `${label} display ${def.id}`).toBe(
            specified ?? snapshot[def.intentKey],
          );
        }
        expect(s.rulerAnchorId, label).toBe(step.ruler ?? null);
        // 거리 자 단계는 카드가 거리를 보인다 (교육 모드엔 관찰 카드 거리 자 행이 없다 — #1390 PR3).
        expect(screen.queryByTestId('tour-ruler') !== null, label).toBe(Boolean(step.ruler));
        expect(useTourStore.getState().drift, label).toEqual([]);
        expect(useTourStore.getState().unavailable, label).toEqual([]);
        expect(screen.getByTestId('tour-step-title'), label).toHaveTextContent(step.title);
      }
      expect(screen.getByTestId('tour-next')).toHaveTextContent('완료');
    });
  },
);

describe('TourCard — 계절 투어 거리 자 (#1390 PR3)', () => {
  it('1 · 2 단계 카드가 태양까지 거리를 AU 소수 3자리로 보인다 — 원일점 1.017 · 근일점 0.983', async () => {
    render(<TourCard />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('tour-item-seasons'));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('tour-ruler')).toHaveTextContent('태양까지 거리');
    expect(screen.getByTestId('tour-ruler-distance')).toHaveTextContent(/^1\.017 AU · /);
    act(() => fireEvent.click(screen.getByTestId('tour-next')));
    // 같은 쌍 (태양 · 지구) 이라 거리는 다음 갱신 주기 (`DISTANCE_REFRESH_MS` 4 Hz) 에 바뀐다.
    await waitFor(() =>
      expect(screen.getByTestId('tour-ruler-distance')).toHaveTextContent(/^0\.983 AU · /),
    );
    // 사용자가 다른 천체를 선택하면 (이탈) 숨긴다 — 줄에 B 이름이 없어 화성 거리가 지구 거리처럼 보이면 안 된다 (리뷰 차단 1).
    act(() => useSimStore.getState().setSelectedBody('mars'));
    expect(screen.queryByTestId('tour-ruler')).toBeNull();
    // 단계 장면으로 돌아오면 다시 보인다.
    act(() => fireEvent.click(screen.getByTestId('tour-return')));
    expect(screen.getByTestId('tour-ruler')).toBeInTheDocument();
    // 기준점을 바꿔도 (이탈) 숨긴다.
    act(() => useSimStore.getState().setRulerAnchor('moon'));
    expect(screen.queryByTestId('tour-ruler')).toBeNull();
  });
});

describe('TourCard — 키보드 (E3)', () => {
  it('카드 안 → ← 로 단계 이동, 첫 단계 ← · 마지막 단계 → 는 제자리', async () => {
    await startEclipse();
    const next = screen.getByTestId('tour-next');
    act(() => fireEvent.keyDown(next, { key: 'ArrowLeft' }));
    expect(useTourStore.getState().stepIndex).toBe(0);
    act(() => fireEvent.keyDown(next, { key: 'ArrowRight' }));
    expect(useTourStore.getState().stepIndex).toBe(1);
    act(() => fireEvent.keyDown(next, { key: 'ArrowLeft' }));
    expect(useTourStore.getState().stepIndex).toBe(0);
    for (let i = 0; i < 8; i++) act(() => fireEvent.keyDown(next, { key: 'ArrowRight' }));
    expect(useTourStore.getState().stepIndex).toBe(4);
  });

  it.each(['ArrowRight', 'ArrowLeft'])(
    '이탈 안내의 「돌아가기」 에 포커스가 있을 때 %s 로 단계 이동 → 안내가 사라져도 포커스는 「다음」 (body 로 빠지지 않음 — qa 재검증 B2)',
    async (key) => {
      await startEclipse();
      act(() => fireEvent.click(screen.getByTestId('tour-next')));
      act(() => fakeCore({ type: 'focusOn', bodyId: 'mars' }));
      const ret = screen.getByTestId('tour-return');
      ret.focus();
      expect(document.activeElement).toBe(ret);
      act(() => fireEvent.keyDown(ret, { key }));
      expect(screen.queryByTestId('tour-return')).toBeNull();
      expect(document.activeElement).toBe(screen.getByTestId('tour-next'));
    },
  );

  it('카드 밖 화살표는 단계를 바꾸지 않는다', async () => {
    await startEclipse();
    act(() => fireEvent.keyDown(document.body, { key: 'ArrowRight' }));
    expect(useTourStore.getState().stepIndex).toBe(0);
  });

  it('카드 안 Esc → 종료 + preventDefault (자유시점 오발화 차단) + 목록 항목으로 포커스', async () => {
    await startEclipse();
    const next = screen.getByTestId('tour-next');
    next.focus();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      next.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(true);
    expect(useTourStore.getState().activeTourId).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('tour-item-eclipse'));
  });

  it('카드 밖 Esc 는 투어를 끝내지 않고 기본 동작을 막지 않는다', async () => {
    await startEclipse();
    (document.activeElement as HTMLElement | null)?.blur();
    const event = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      document.body.dispatchEvent(event);
    });
    expect(event.defaultPrevented).toBe(false);
    expect(useTourStore.getState().activeTourId).toBe('eclipse');
  });
});

describe('TourCard — 이탈 (E4)', () => {
  it.each([
    ['다른 천체 선택', () => fakeCore({ type: 'focusOn', bodyId: 'mars' })],
    ['스크러버 이동', () => fakeCore({ type: 'jumpToJulianDate', julianDate: 2451545 })],
    ['재생', () => fakeCore({ type: 'setTimeScale', scale: 86_400 })],
    ['캔버스 Esc (자유시점)', () => fakeCore({ type: 'enterFreeFly' })],
  ])('%s → 안내 + 돌아가기 → 단계 장면 복귀', async (_name, perturb) => {
    await startEclipse();
    act(() => perturb());
    expect(screen.getByTestId('tour-drift')).toBeInTheDocument();
    act(() => fireEvent.click(screen.getByTestId('tour-return')));
    const s = useSimStore.getState();
    expect(s.selectedBodyId).toBe('earth');
    expect(s.freeFlyMode).toBe(false);
    expect(s.timeScale).toBe(0);
    expect(s.julianDate).toBeCloseTo(2460409.2471, 3);
    expect(screen.queryByTestId('tour-drift')).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('tour-next'));
  });

  it('단계가 지정한 표시 토글 변경 → 이탈, 돌아가기 → 지정값 복귀', async () => {
    await startEclipse();
    act(() => fireEvent.click(screen.getByTestId('tour-next')));
    act(() => useSimStore.getState().setOrbitLinesVisible(true));
    expect(screen.getByTestId('tour-drift')).toHaveAttribute('data-drift-axes', 'display');
    act(() => fireEvent.click(screen.getByTestId('tour-return')));
    expect(useSimStore.getState().orbitLinesVisible).toBe(false);
    expect(screen.queryByTestId('tour-drift')).toBeNull();
  });

  it('이전 단계로 돌아가면 그 단계가 지정하지 않은 토글은 스냅샷 값으로', async () => {
    await startEclipse();
    act(() => fireEvent.click(screen.getByTestId('tour-next')));
    expect(useSimStore.getState().orbitLinesVisible).toBe(false);
    act(() => fireEvent.click(screen.getByTestId('tour-prev')));
    expect(useSimStore.getState().orbitLinesVisible).toBe(true);
  });

  it('단계가 지정하지 않은 표시 토글 · 거리 자 변경은 이탈이 아니다', async () => {
    await startEclipse();
    act(() => {
      useSimStore.getState().setCloudsVisible(false);
      useSimStore.getState().setRulerAnchor(null);
    });
    expect(screen.queryByTestId('tour-drift')).toBeNull();
  });

  /** 5단계로 이동 (600 배 재생 · 구간 0.25 일). 벽시계는 `performance.now` 를 고정값으로 돌린다. */
  async function enterShadowSweep(nowRef: { ms: number }) {
    vi.spyOn(performance, 'now').mockImplementation(() => nowRef.ms);
    await startEclipse();
    for (let i = 0; i < 4; i++) act(() => fireEvent.click(screen.getByTestId('tour-next')));
    const planned = useTourStore.getState().planned!;
    expect(planned.timeScale).toBe(600);
    return planned.window!;
  }
  /** 600 배 · 16 ms 프레임 1개의 진행량 [일]. */
  const FRAME_DAYS = (0.016 * 600) / 86_400;

  it('재생 단계는 프레임 진행으로 구간 끝에 닿으면 멈추고 (이탈 아님) 구간 끝 시각에 선다', async () => {
    const now = { ms: 1000 };
    const { startJd, endJd } = await enterShadowSweep(now);
    // 재생 중 프레임 — 구간 안 (벽시계도 그만큼 흐른다).
    now.ms += 16;
    act(() => useSimStore.getState().setTime(startJd + FRAME_DAYS));
    expect(useTourStore.getState().drift).toEqual([]);
    // 끝 직전까지 흐른 상태 → 다음 프레임이 끝을 넘김 → 마이크로태스크에서 정지.
    now.ms += 16;
    act(() => useSimStore.getState().setTime(endJd - FRAME_DAYS / 2));
    now.ms += 16;
    await act(async () => {
      useSimStore.getState().setTime(endJd + FRAME_DAYS / 2);
      await Promise.resolve();
    });
    const s = useSimStore.getState();
    expect(s.timeScale).toBe(0);
    expect(s.julianDate).toBe(endJd);
    expect(useTourStore.getState().drift).toEqual([]);
    expect(useTourStore.getState().stepIndex).toBe(4);
  });

  it.each([
    ['미래 10년 도약 (리뷰 프로브)', (end: number) => end + 3650],
    ['스크러버 앞으로 — 끝을 조금 넘김', (end: number) => end + 0.05],
    ['「지금」 — 먼 미래', (end: number) => end + 900],
  ])(
    'B1 — 재생 중 %s → 시각 유지 · 배속 유지 · time 이탈 안내 (끝으로 되돌리지 않는다)',
    async (_name, target) => {
      const now = { ms: 1000 };
      const { startJd, endJd } = await enterShadowSweep(now);
      now.ms += 16;
      act(() => useSimStore.getState().setTime(startJd + FRAME_DAYS));
      const jd = target(endJd);
      now.ms += 16;
      await act(async () => {
        fakeCore({ type: 'jumpToJulianDate', julianDate: jd });
        await Promise.resolve();
      });
      const s = useSimStore.getState();
      expect(s.julianDate).toBe(jd);
      expect(s.timeScale).toBe(600);
      expect(useTourStore.getState().drift).toEqual(['time']);
      expect(screen.getByTestId('tour-drift')).toHaveAttribute('data-drift-axes', 'time');
    },
  );

  it('B1 대조 — 과거로 도약도 time 이탈 (종전과 같음)', async () => {
    const now = { ms: 1000 };
    const { startJd } = await enterShadowSweep(now);
    now.ms += 16;
    await act(async () => {
      fakeCore({ type: 'jumpToJulianDate', julianDate: startJd - 3650 });
      await Promise.resolve();
    });
    expect(useSimStore.getState().julianDate).toBe(startJd - 3650);
    expect(useTourStore.getState().drift).toEqual(['time']);
  });
});

describe('TourCard — 종료 복원 (E5)', () => {
  it('종료 · 모드 전환 — 표시 의도 12종 = 시작 전, 표시 URL 키 = 시작 전 원문 (투어 중 패널 직접 조작 포함)', async () => {
    const before = { ...useSimStore.getState() };
    await startEclipse();
    // 2단계 (궤도선 끔) 에서 끝낸다 — 투어가 바꾼 토글도 되돌아와야 한다.
    act(() => fireEvent.click(screen.getByTestId('tour-next')));
    expect(useSimStore.getState().orbitLinesVisible).toBe(false);
    // 투어 중 사용자가 표시 패널을 누름 (useDisplayToggle 이 하는 것 — store 의도 반전).
    act(() => {
      useSimStore.getState().setStarsVisible(true);
      useSimStore.getState().setTrailsVisible(true);
    });
    act(() => fireEvent.click(screen.getByTestId('tour-close')));
    const after = useSimStore.getState();
    for (const def of DISPLAY_TOGGLES) {
      expect(after[def.intentKey], def.id).toBe(before[def.intentKey]);
    }
    // URL — 시작 전 원문 (`?stars=off`, 나머지 키 없음) 을 12키 전부 다시 쓴다.
    const urlCall = setDisplayUrl.mock.calls.at(-1)![0] as Record<string, string | null>;
    expect(urlCall.stars).toBe('off');
    expect(Object.keys(urlCall)).toHaveLength(12);
    expect(
      Object.entries(urlCall)
        .filter(([k]) => k !== 'stars')
        .every(([, v]) => v === null),
    ).toBe(true);
    // 카메라 · 시각 · 배속은 되돌리지 않는다 (Q7 (a)).
    expect(after.selectedBodyId).toBe('earth');
    expect(after.timeScale).toBe(0);
  });

  it('모드 전환 (관찰) = 종료 + 복원', async () => {
    await startEclipse();
    act(() => useSimStore.getState().setTrailsVisible(true));
    act(() => useSimStore.getState().setMode('observe'));
    expect(useTourStore.getState().activeTourId).toBeNull();
    expect(useSimStore.getState().trailsVisible).toBe(false);
  });

  it('마지막 단계 「완료」 = 종료', async () => {
    await startEclipse();
    for (let i = 0; i < 4; i++) act(() => fireEvent.click(screen.getByTestId('tour-next')));
    act(() => fireEvent.click(screen.getByTestId('tour-next')));
    expect(useTourStore.getState().activeTourId).toBeNull();
    expect(document.activeElement).toBe(screen.getByTestId('tour-item-eclipse'));
  });
});

describe('TourCard — URL 진입 시작 요청 (E6 · 고유 발견 2 — 가용성 대기)', () => {
  it('장면 미준비 (capabilities null) 동안은 적용하지 않고, 준비되면 그 단계를 적용 · 카드 포커스', async () => {
    useSimStore.setState({ displayCapabilities: null });
    useTourStore.getState().requestStart('eclipse', 2);
    render(<TourCard />);
    await act(async () => {
      await Promise.resolve();
    });
    expect(useTourStore.getState().activeTourId).toBeNull();
    expect(sentCommands).toEqual([]);
    await act(async () => {
      useSimStore.setState({ displayCapabilities: CAPS });
      await Promise.resolve();
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(useTourStore.getState().activeTourId).toBe('eclipse');
    expect(useTourStore.getState().stepIndex).toBe(2);
    expect(useSimStore.getState().julianDate).toBe(NEW_MOON_2024_03_10_JD);
    expect(document.activeElement).toBe(screen.getByTestId('tour-next'));
  });
});

describe('TourCard — 사건 목록 실패', () => {
  it('불러오기 실패 → 오류 문구 · 목록 유지, 다시 누르면 재시도', async () => {
    let calls = 0;
    resetTimeEventsForTest(async () => {
      calls += 1;
      if (calls === 1) throw new Error('offline');
      return EVENTS_RAW;
    });
    const errorSpy = vi.spyOn(console, 'error').mockImplementation(() => {});
    render(<TourCard />);
    await act(async () => {
      fireEvent.click(screen.getByTestId('tour-item-eclipse'));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(screen.getByTestId('tour-error')).toBeInTheDocument();
    expect(useTourStore.getState().activeTourId).toBeNull();
    await act(async () => {
      fireEvent.click(screen.getByTestId('tour-item-eclipse'));
    });
    await act(async () => {
      await Promise.resolve();
    });
    expect(useTourStore.getState().activeTourId).toBe('eclipse');
    errorSpy.mockRestore();
  });
});
