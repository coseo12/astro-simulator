import { fireEvent, render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { SidePanels } from './side-panels';

/**
 * #1281 D9(b) — 모바일 패널 탭 전환. 레이아웃은 jsdom 이 계산하지 않으므로 「비활성 패널에 `max-sm:hidden`」 클래스
 * 상태로 본다 (실제 겹침 해소는 375 실 브라우저 `elementFromPoint` 1회 실측 — PR 본문).
 * 패널 내용은 이 테스트의 관심이 아니라 자리표시로 바꾼다.
 */
vi.mock('../panels/celestial-tree', () => ({ CelestialTree: () => <div>tree</div> }));
vi.mock('../panels/celestial-info-panel', () => ({ CelestialInfoPanel: () => <div>info</div> }));
vi.mock('../panels/scenario-presets', () => ({ ScenarioPresets: () => null }));
vi.mock('../panels/satellite-info-panel', () => ({ SatelliteInfoPanel: () => null }));
vi.mock('@/hooks/use-osculating-sync', () => ({
  GALILEAN_IDS: [],
  useOsculatingSync: () => ({ elements: {} }),
}));

const MOBILE_HIDDEN = 'max-sm:hidden';
const hiddenOnMobile = (testId: string) =>
  screen.getByTestId(testId).className.split(/\s+/).includes(MOBILE_HIDDEN);

beforeEach(() => {
  useSimStore.setState({ mode: 'research' });
});

describe('SidePanels — 모바일 탭 (#1281 D9(b))', () => {
  it('관찰 모드: 패널 · 탭 바 없음', () => {
    useSimStore.setState({ mode: 'observe' });
    render(<SidePanels />);
    expect(screen.queryByTestId('panel-tabs')).toBeNull();
    expect(screen.queryByTestId('panel-left')).toBeNull();
  });

  it('연구 모드 기본 = 트리 탭: 좌 표시 · 우 모바일 숨김, 탭 바는 데스크톱 숨김(sm:hidden)', () => {
    render(<SidePanels />);
    expect(screen.getByTestId('panel-tabs').className).toContain('sm:hidden');
    expect(screen.getByTestId('panel-tab-tree')).toHaveAttribute('aria-pressed', 'true');
    expect(hiddenOnMobile('panel-left')).toBe(false);
    expect(hiddenOnMobile('panel-right')).toBe(true);
  });

  it('정보 탭 → 우 표시 · 좌 숨김 / 닫기 → 둘 다 숨김 / 트리 → 복귀 (두 패널은 언마운트되지 않는다)', () => {
    render(<SidePanels />);
    fireEvent.click(screen.getByTestId('panel-tab-info'));
    expect(screen.getByTestId('panel-tab-info')).toHaveAttribute('aria-pressed', 'true');
    expect(hiddenOnMobile('panel-left')).toBe(true);
    expect(hiddenOnMobile('panel-right')).toBe(false);

    fireEvent.click(screen.getByTestId('panel-tab-none'));
    expect(hiddenOnMobile('panel-left')).toBe(true);
    expect(hiddenOnMobile('panel-right')).toBe(true);

    fireEvent.click(screen.getByTestId('panel-tab-tree'));
    expect(hiddenOnMobile('panel-left')).toBe(false);
    expect(hiddenOnMobile('panel-right')).toBe(true);
  });
});
