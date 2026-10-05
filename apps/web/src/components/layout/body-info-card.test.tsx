import { act, fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type * as AstroCore from '@astro-simulator/core';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { BodyInfoCard } from './body-info-card';

// R-Phase 차단 분기 — `celestial-info-panel.test.tsx` 의 vi.mock partial 패턴 복제 (R10b #664).
// phase 11 진입으로 미진입 실데이터 body 가 0 이라, 지정 body 만 isRPhaseFocusable=false 로 돌린다.
const rPhaseMock = vi.hoisted(() => ({ disabledIds: [] as string[] }));
// D8 — tier 를 데이터에서 읽는지 반증하기 위한 getSolarSystem override. null 이면 실데이터.
const ephemerisMock = vi.hoisted(() => ({ tierOverride: null as number | null }));
vi.mock('@astro-simulator/core', async (importOriginal) => {
  const actual = await importOriginal<typeof AstroCore>();
  return {
    ...actual,
    isRPhaseFocusable: (bodyId: string | null | undefined) =>
      typeof bodyId === 'string' && rPhaseMock.disabledIds.includes(bodyId)
        ? false
        : actual.isRPhaseFocusable(bodyId),
    ephemeris: {
      ...actual.ephemeris,
      getSolarSystem: () => {
        const real = actual.ephemeris.getSolarSystem();
        return ephemerisMock.tierOverride === null
          ? real
          : { ...real, tier: ephemerisMock.tierOverride };
      },
    },
  };
});

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

const J2000 = 2_451_545;

beforeEach(() => {
  rPhaseMock.disabledIds = [];
  ephemerisMock.tierOverride = null;
  sentCommands = [];
  useSimStore.setState({
    mode: 'observe',
    julianDate: J2000,
    selectedBodyId: null,
    freeFlyMode: false,
  });
});

function select(id: string | null) {
  act(() => {
    useSimStore.getState().setSelectedBody(id);
  });
}

/** 상단 바 바로가기 12개 (focus-quick-buttons.tsx FOCUS_BUTTONS) — 표시값은 데이터에서 손으로 옮긴 기대값. */
const SHORTCUT_BODIES = [
  { id: 'sun', nameKo: '태양', kind: '항성', radius: '695,700 km' },
  { id: 'mercury', nameKo: '수성', kind: '행성', radius: '2,440 km' },
  { id: 'venus', nameKo: '금성', kind: '행성', radius: '6,052 km' },
  { id: 'earth', nameKo: '지구', kind: '행성', radius: '6,378 km' },
  { id: 'moon', nameKo: '달', kind: '위성', radius: '1,737 km' },
  { id: 'mars', nameKo: '화성', kind: '행성', radius: '3,396 km' },
  { id: 'jupiter', nameKo: '목성', kind: '행성', radius: '71,492 km' },
  { id: 'saturn', nameKo: '토성', kind: '행성', radius: '60,268 km' },
  { id: 'uranus', nameKo: '천왕성', kind: '행성', radius: '25,559 km' },
  { id: 'neptune', nameKo: '해왕성', kind: '행성', radius: '24,764 km' },
  { id: 'pluto', nameKo: '명왕성', kind: '왜소행성', radius: '1,188 km' },
  { id: 'halley', nameKo: '핼리 혜성', kind: '혜성', radius: '5.5 km' },
] as const;

describe('#1281 BodyInfoCard — 12 천체 렌더 (D1 · D4)', () => {
  it.each(SHORTCUT_BODIES)(
    '$id — 이름 · 영문 · 종류 · 반지름 · 거리 · 링크, raw id 미노출',
    (b) => {
      useSimStore.setState({ selectedBodyId: b.id });
      render(<BodyInfoCard />);
      const card = screen.getByTestId('body-card');
      expect(screen.getByTestId('body-card-name')).toHaveTextContent(b.nameKo);
      expect(screen.getByTestId('body-card-name-en').textContent).not.toBe('');
      expect(screen.getByTestId('body-card-kind')).toHaveTextContent(b.kind);
      expect(screen.getByTestId('body-card-radius')).toHaveTextContent(b.radius);
      expect(screen.getByTestId('body-card-research-link')).toHaveTextContent('자세히 → 연구 모드');
      if (b.id === 'sun') {
        expect(screen.getByTestId('body-card-sun-distance')).toHaveTextContent('태양계 중심');
        expect(screen.queryByTestId('body-card-period')).not.toBeInTheDocument();
      } else {
        expect(screen.getByTestId('body-card-sun-distance').textContent).toMatch(
          /^\d+\.\d{2} AU · [\d.,]+(억|만)? km$/,
        );
        expect(screen.getByTestId('body-card-period').textContent).toMatch(/^[\d.]+ (일|년)$/);
      }
      // D4 — raw id 문자열 (`focus · <id>` 또는 소문자 id 자체) 노출 0.
      expect(card.textContent).not.toContain(b.id);
      expect(card.textContent).not.toContain('focus ·');
    },
  );

  it('달 — 「지구로부터 거리」 행 + 공전주기 27.32 일', () => {
    useSimStore.setState({ selectedBodyId: 'moon' });
    render(<BodyInfoCard />);
    expect(screen.getByText('지구로부터 거리')).toBeInTheDocument();
    expect(screen.getByTestId('body-card-parent-distance').textContent).toMatch(
      /^(3[5-9]|40)\.\d만 km$/, // 근지점 ~36만 · 원지점 ~40.6만 km (J2000 = 40.0만)
    );
    expect(screen.getByTestId('body-card-period')).toHaveTextContent('27.32 일');
  });

  it('행성 · 태양은 모체 거리 행 없음, 지구 공전주기 1.000 년', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    const { unmount } = render(<BodyInfoCard />);
    expect(screen.queryByTestId('body-card-parent-distance')).not.toBeInTheDocument();
    expect(screen.getByTestId('body-card-period')).toHaveTextContent('1.000 년');
    unmount();
    useSimStore.setState({ selectedBodyId: 'sun' });
    render(<BodyInfoCard />);
    expect(screen.queryByTestId('body-card-parent-distance')).not.toBeInTheDocument();
  });

  it('시각(julianDate)이 아직 없으면 거리 자리 「—」', () => {
    useSimStore.setState({ selectedBodyId: 'earth', julianDate: null });
    render(<BodyInfoCard />);
    expect(screen.getByTestId('body-card-sun-distance')).toHaveTextContent('—');
  });

  it('R-Phase 미진입 body — 연구 패널과 같은 차단 문구, 데이터 행 없음', () => {
    rPhaseMock.disabledIds = ['moon'];
    useSimStore.setState({ selectedBodyId: 'moon' });
    render(<BodyInfoCard />);
    expect(screen.getByTestId('body-card-r-phase-blocked')).toHaveTextContent(
      '달 은(는) R-Phase 미진입 — 후속 R-Phase 에서 활성화 예정입니다.',
    );
    expect(screen.queryByTestId('body-card-sun-distance')).not.toBeInTheDocument();
    expect(screen.queryByTestId('body-card-radius')).not.toBeInTheDocument();
  });

  it('선택 없음 · 미등록 id · 연구 모드에서는 렌더하지 않음', () => {
    const { rerender } = render(<BodyInfoCard />);
    expect(screen.queryByTestId('body-card')).not.toBeInTheDocument();
    select('no-such-body');
    rerender(<BodyInfoCard />);
    expect(screen.queryByTestId('body-card')).not.toBeInTheDocument();
    act(() => {
      useSimStore.setState({ selectedBodyId: 'earth', mode: 'research' });
    });
    rerender(<BodyInfoCard />);
    expect(screen.queryByTestId('body-card')).not.toBeInTheDocument();
  });
});

describe('#1281 BodyInfoCard — 접기 / 재펼침 (D3)', () => {
  it('× → 카드 접힘 + 칩 표시 + selectedBodyId 불변 + 칩에 포커스, 칩 → 다시 열림', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<BodyInfoCard />);
    fireEvent.click(screen.getByTestId('body-card-collapse'));
    expect(screen.queryByTestId('body-card')).not.toBeInTheDocument();
    const chip = screen.getByTestId('body-card-expand');
    expect(chip).toHaveAccessibleName('지구 정보 카드 펼치기');
    expect(chip).toHaveFocus();
    expect(useSimStore.getState().selectedBodyId).toBe('earth');
    expect(sentCommands).toEqual([]);

    fireEvent.click(chip);
    expect(screen.getByTestId('body-card')).toBeInTheDocument();
    expect(screen.getByTestId('body-card-collapse')).toHaveFocus();
  });

  it('접힌 중 다른 천체 선택 → 열림, A → B → A 도 열림', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<BodyInfoCard />);
    fireEvent.click(screen.getByTestId('body-card-collapse'));
    select('mars');
    expect(screen.getByTestId('body-card-name')).toHaveTextContent('화성');

    fireEvent.click(screen.getByTestId('body-card-collapse'));
    select('earth');
    expect(screen.getByTestId('body-card-name')).toHaveTextContent('지구');
    select('mars');
    expect(screen.getByTestId('body-card')).toBeInTheDocument();
  });

  it('Esc 자유시점(enterFreeFly) → 카드 사라짐 → 같은 천체 재선택 → 열림', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<BodyInfoCard />);
    fireEvent.click(screen.getByTestId('body-card-collapse'));
    act(() => {
      useSimStore.getState().enterFreeFly();
    });
    expect(screen.queryByTestId('body-card')).not.toBeInTheDocument();
    expect(screen.queryByTestId('body-card-expand')).not.toBeInTheDocument();
    select('earth');
    expect(screen.getByTestId('body-card')).toBeInTheDocument();
  });
});

describe('#1281 BodyInfoCard — 출처 Tier 한 줄 (D8) · 연구 모드 링크', () => {
  it('실데이터 tier 1 → 「JPL 관측 · T1」', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<BodyInfoCard />);
    expect(screen.getByTestId('body-card-tier')).toHaveTextContent('JPL 관측 · T1');
  });

  it('데이터 tier 2 → 「통계 모델 · T2」 (하드코딩 반증)', () => {
    ephemerisMock.tierOverride = 2;
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<BodyInfoCard />);
    expect(screen.getByTestId('body-card-tier')).toHaveTextContent('통계 모델 · T2');
  });

  it('정의 밖 tier 9 → 출처 없이 「T9」 (fail-visible)', () => {
    ephemerisMock.tierOverride = 9;
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<BodyInfoCard />);
    expect(screen.getByTestId('body-card-tier').textContent).toBe('T9');
  });

  it('「자세히 → 연구 모드」 → store mode=research + setMode 명령, 선택 유지', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<BodyInfoCard />);
    fireEvent.click(screen.getByTestId('body-card-research-link'));
    expect(useSimStore.getState().mode).toBe('research');
    expect(useSimStore.getState().selectedBodyId).toBe('earth');
    expect(sentCommands).toContainEqual({ type: 'setMode', mode: 'research' });
    expect(screen.queryByTestId('body-card')).not.toBeInTheDocument();
  });
});
