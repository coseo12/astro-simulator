/**
 * #1341 PR2 — 거리 자 행 (ADR `20261015-1341` 결정 R1 · R3 ~ R6). 카드 · 우 패널에 붙은 상태로 검증한다.
 */
import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { ephemeris, getOrbitVisualScale } from '@astro-simulator/core';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { computeBodyPairDistance, indexBodies } from '@/lib/body-distance';
import { formatLightTime, formatRulerDistance } from '@/lib/ruler';
import { BodyInfoCard } from './body-info-card';
import { CelestialInfoPanel } from '../panels/celestial-info-panel';

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
  useSimBodyState: () => null,
}));

const J2000 = 2_451_545;
const byId = indexBodies(ephemeris.getSolarSystem().bodies);

beforeEach(() => {
  sentCommands = [];
  useSimStore.setState({
    mode: 'observe',
    julianDate: J2000,
    selectedBodyId: null,
    freeFlyMode: false,
    rulerAnchorId: null,
    physicsEngine: 'kepler',
  });
});

function select(id: string | null) {
  act(() => {
    useSimStore.getState().setSelectedBody(id);
  });
}

describe('#1341 거리 자 — 관찰 모드 카드 흐름 (E5 단위 축)', () => {
  it('「기준점으로」 → 기준점 = 그 시점 선택 · 같은 천체면 안내 문구 · 다른 천체 선택 → 거리 행', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<BodyInfoCard />);
    expect(screen.queryByTestId('ruler-distance')).toBeNull();
    fireEvent.click(screen.getByTestId('ruler-set-anchor'));
    expect(useSimStore.getState().rulerAnchorId).toBe('earth');
    expect(screen.getByTestId('ruler-hint')).toHaveTextContent('지구까지 거리를 표시합니다');
    expect(screen.queryByTestId('ruler-distance')).toBeNull();

    select('mars');
    const dd = screen.getByTestId('ruler-distance');
    const expected = computeBodyPairDistance(byId, 'earth', 'mars', J2000)!;
    expect(Number(dd.getAttribute('data-distance-m'))).toBe(expected);
    expect(dd).toHaveTextContent(formatRulerDistance(expected));
    expect(dd).toHaveTextContent(/ AU · /);
    expect(screen.getByText('지구까지 거리')).toBeInTheDocument();
    // 관찰 모드는 광시간 없음 · 행성 쌍은 배율 고지 없음
    expect(screen.queryByTestId('ruler-light-time')).toBeNull();
    expect(screen.queryByTestId('ruler-visual-scale-notice')).toBeNull();
    // 선택 경로를 가로채지 않는다 — 카드가 명령을 보내지 않는다
    expect(sentCommands).toEqual([]);
  });

  it('지구–달 — km 만 + 배율 고지 (N = getOrbitVisualScale)', () => {
    useSimStore.setState({ selectedBodyId: 'moon', rulerAnchorId: 'earth' });
    render(<BodyInfoCard />);
    const dd = screen.getByTestId('ruler-distance');
    expect(dd.textContent).toMatch(/^\d+(\.\d)?만 km$/);
    expect(screen.getByTestId('ruler-visual-scale-notice')).toHaveTextContent(
      `화면의 달 위치는 모체로부터 ×${getOrbitVisualScale('earth', 'moon')} 떨어져 그려집니다`,
    );
  });

  it('Amendment 1 (리뷰 B1) — 지구–달 고지는 Kepler 에서만 · N-body 전환 시 사라지고 복귀 시 다시 나온다', () => {
    useSimStore.setState({
      selectedBodyId: 'moon',
      rulerAnchorId: 'earth',
      physicsEngine: 'kepler',
    });
    render(<BodyInfoCard />);
    expect(screen.getAllByTestId('ruler-visual-scale-notice')).toHaveLength(1);
    for (const engine of ['newton', 'barnes-hut', 'webgpu', 'auto'] as const) {
      act(() => {
        useSimStore.getState().setPhysicsEngine(engine);
      });
      expect(screen.queryByTestId('ruler-visual-scale-notice'), engine).toBeNull();
      // 거리 행 자체는 남는다 — 고지만 엔진 조건이다.
      expect(screen.getByTestId('ruler-distance'), engine).toBeInTheDocument();
    }
    act(() => {
      useSimStore.getState().setPhysicsEngine('kepler');
    });
    expect(screen.getAllByTestId('ruler-visual-scale-notice')).toHaveLength(1);
  });

  it('「기준점 해제」 → 행 사라짐 · 「기준점으로」 복귀 / 다른 천체에서 「기준점으로」 → 기준점 교체', () => {
    useSimStore.setState({ selectedBodyId: 'mars', rulerAnchorId: 'earth' });
    render(<BodyInfoCard />);
    fireEvent.click(screen.getByTestId('ruler-set-anchor'));
    expect(useSimStore.getState().rulerAnchorId).toBe('mars');
    expect(screen.getByTestId('ruler-hint')).toBeInTheDocument();
    fireEvent.click(screen.getByTestId('ruler-clear'));
    expect(useSimStore.getState().rulerAnchorId).toBeNull();
    expect(screen.queryByTestId('ruler-hint')).toBeNull();
    expect(screen.getByTestId('ruler-set-anchor')).toBeInTheDocument();
  });

  it('Esc (자유시점) → 카드 사라짐 · 기준점은 남는다', () => {
    useSimStore.setState({ selectedBodyId: 'mars', rulerAnchorId: 'earth' });
    render(<BodyInfoCard />);
    act(() => {
      useSimStore.getState().enterFreeFly();
    });
    expect(screen.queryByTestId('body-card')).toBeNull();
    expect(useSimStore.getState().rulerAnchorId).toBe('earth');
  });
});

describe('#1341 거리 자 — 연구 모드 우 패널', () => {
  it('거리 + 광시간 행', () => {
    useSimStore.setState({ mode: 'research', selectedBodyId: 'mars', rulerAnchorId: 'earth' });
    render(<CelestialInfoPanel />);
    const d = computeBodyPairDistance(byId, 'earth', 'mars', J2000)!;
    expect(screen.getByTestId('ruler-distance')).toHaveTextContent(formatRulerDistance(d));
    expect(screen.getByTestId('ruler-light-time')).toHaveTextContent(formatLightTime(d));
  });

  it('선택 없음 — 기준점 · 안내 · 해제만', () => {
    useSimStore.setState({ mode: 'research', selectedBodyId: null, rulerAnchorId: 'earth' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel-empty')).toBeInTheDocument();
    expect(screen.getByTestId('ruler-anchor-name')).toHaveTextContent('지구');
    expect(screen.getByTestId('ruler-hint')).toBeInTheDocument();
    expect(screen.queryByTestId('ruler-set-anchor')).toBeNull();
    fireEvent.click(screen.getByTestId('ruler-clear'));
    expect(useSimStore.getState().rulerAnchorId).toBeNull();
    expect(screen.queryByTestId('ruler')).toBeNull();
  });
});
