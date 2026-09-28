import { act, fireEvent, render, screen } from '@testing-library/react';
import { withNuqsTestingAdapter } from 'nuqs/adapters/testing';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { DISPLAY_DISABLED_REASONS } from '@/core/display-toggles';
import { useSimStore } from '@/store/sim-store';
import { DisplayPanel } from './display-panel';
import { FocusQuickButtons } from './focus-quick-buttons';

/**
 * #1265 D16 — 표시 패널 (ADR `20260927-1265` 결정 6): `aria-pressed` · `aria-disabled` 분기,
 * Esc (capture + preventDefault) 닫힘 + 포커스 복원, 비모달 닫기 경로 (패널 밖 pointerdown · resize).
 */

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

const IDS = ['orbits', 'stars', 'clouds', 'nightLights'] as const;

function renderPanel() {
  return render(<DisplayPanel />, { wrapper: withNuqsTestingAdapter() });
}
const trigger = () => screen.getByTestId('display-panel-toggle');
const toggleEl = (id: (typeof IDS)[number]) => screen.getByTestId(`display-toggle-${id}`);
const openPanel = () => fireEvent.click(trigger());

beforeEach(() => {
  sentCommands = [];
  useSimStore.setState({
    orbitLinesVisible: true,
    starsVisible: true,
    cloudsVisible: true,
    nightLightsVisible: true,
    displayCapabilities: { starfield: true, surfaceDetail: true },
    displayPanelOpen: false,
  });
});

describe('DisplayPanel — 열기/닫기', () => {
  it('닫힘: aria-expanded=false · 패널 없음', () => {
    renderPanel();
    expect(trigger()).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByTestId('display-panel')).toBeNull();
  });

  it('열림: aria-expanded=true · aria-controls=패널 id · 토글 4개 aria-pressed · 속성 가드 부착 (D1)', () => {
    renderPanel();
    openPanel();
    const panel = screen.getByTestId('display-panel');
    expect(trigger()).toHaveAttribute('aria-expanded', 'true');
    expect(trigger()).toHaveAttribute('aria-controls', panel.id);
    expect(panel).toHaveAttribute('data-display-panel-open', 'true');
    expect(panel).not.toHaveAttribute('aria-modal');
    for (const id of IDS) expect(toggleEl(id)).toHaveAttribute('aria-pressed', 'true');
    expect(useSimStore.getState().displayPanelOpen).toBe(true);
  });

  it('열면 첫 토글로 포커스', () => {
    renderPanel();
    openPanel();
    expect(document.activeElement).toBe(toggleEl('orbits'));
  });

  it('트리거 재클릭 → 닫힘', () => {
    renderPanel();
    openPanel();
    openPanel();
    expect(screen.queryByTestId('display-panel')).toBeNull();
    expect(useSimStore.getState().displayPanelOpen).toBe(false);
  });

  it('Esc → 닫힘 + 포커스 트리거 복귀 + preventDefault (D14)', () => {
    renderPanel();
    openPanel();
    const ev = new KeyboardEvent('keydown', { key: 'Escape', bubbles: true, cancelable: true });
    act(() => {
      toggleEl('clouds').dispatchEvent(ev);
    });
    expect(ev.defaultPrevented).toBe(true);
    expect(screen.queryByTestId('display-panel')).toBeNull();
    expect(document.activeElement).toBe(trigger());
  });

  it('Esc 는 window capture 단계에서 처리된다 — bubble 단계 리스너가 이미 defaultPrevented 를 본다', () => {
    renderPanel();
    openPanel();
    let seenDefaultPrevented: boolean | null = null;
    const bubble = (e: KeyboardEvent) => {
      seenDefaultPrevented = e.defaultPrevented;
    };
    // 패널보다 **뒤에** 등록된 bubble 리스너 — 등록 순서와 무관하게 capture 가 먼저라는 것을 고정한다.
    window.addEventListener('keydown', bubble);
    act(() => {
      fireEvent.keyDown(document.body, { key: 'Escape' });
    });
    window.removeEventListener('keydown', bubble);
    expect(seenDefaultPrevented).toBe(true);
  });

  it('패널 밖 pointerdown → 닫힘 (포커스 복원 없음) · 패널 안 pointerdown 은 유지', () => {
    renderPanel();
    openPanel();
    fireEvent.pointerDown(toggleEl('stars'));
    expect(screen.getByTestId('display-panel')).toBeInTheDocument();
    fireEvent.pointerDown(document.body);
    expect(screen.queryByTestId('display-panel')).toBeNull();
    expect(document.activeElement).not.toBe(trigger());
  });

  it('창 resize → 닫힘', () => {
    renderPanel();
    openPanel();
    act(() => {
      window.dispatchEvent(new Event('resize'));
    });
    expect(screen.queryByTestId('display-panel')).toBeNull();
  });

  it('열린 채 언마운트 → store 열림 해제 (자동 숨김 영구 억제 방지)', () => {
    const { unmount } = renderPanel();
    openPanel();
    unmount();
    expect(useSimStore.getState().displayPanelOpen).toBe(false);
  });
});

describe('DisplayPanel — 토글 분기', () => {
  it('클릭 → aria-pressed 반전 + 해당 명령', () => {
    renderPanel();
    openPanel();
    fireEvent.click(toggleEl('clouds'));
    expect(toggleEl('clouds')).toHaveAttribute('aria-pressed', 'false');
    expect(sentCommands).toEqual([{ type: 'setCloudsVisible', visible: false }]);
  });

  it('활성 토글은 aria-disabled=false · title 없음', () => {
    renderPanel();
    openPanel();
    for (const id of IDS) {
      expect(toggleEl(id)).toHaveAttribute('aria-disabled', 'false');
      expect(toggleEl(id)).not.toHaveAttribute('title');
    }
  });

  it('소프트웨어 렌더 — 별: aria-disabled + 사유 title/describedby · 네이티브 disabled 아님 · 클릭 no-op (D9)', () => {
    useSimStore.setState({ displayCapabilities: { starfield: false, surfaceDetail: true } });
    renderPanel();
    openPanel();
    const stars = toggleEl('stars');
    expect(stars).toHaveAttribute('aria-disabled', 'true');
    expect(stars).not.toBeDisabled();
    expect(stars).toHaveAttribute('title', DISPLAY_DISABLED_REASONS.softwareRenderer);
    expect(stars).toHaveAttribute('aria-pressed', 'false');
    const describedBy = stars.getAttribute('aria-describedby');
    expect(describedBy).toBeTruthy();
    expect(document.getElementById(describedBy!)).toHaveTextContent(
      DISPLAY_DISABLED_REASONS.softwareRenderer,
    );
    fireEvent.click(stars);
    expect(sentCommands).toEqual([]);
    expect(stars).toHaveAttribute('aria-pressed', 'false');
  });

  it('?surface=off — 구름·불빛 aria-disabled + 사유, 클릭 no-op (D10)', () => {
    useSimStore.setState({ displayCapabilities: { starfield: true, surfaceDetail: false } });
    renderPanel();
    openPanel();
    for (const id of ['clouds', 'nightLights'] as const) {
      expect(toggleEl(id)).toHaveAttribute('aria-disabled', 'true');
      expect(toggleEl(id)).toHaveAttribute('title', DISPLAY_DISABLED_REASONS.surfaceOff);
      fireEvent.click(toggleEl(id));
    }
    expect(sentCommands).toEqual([]);
    expect(toggleEl('stars')).toHaveAttribute('aria-disabled', 'false');
  });

  it('비활성 토글도 포커스를 받는다 — Tab 순회에서 빠지지 않는다 (D14 · aria-disabled 해석)', () => {
    useSimStore.setState({ displayCapabilities: { starfield: false, surfaceDetail: false } });
    renderPanel();
    openPanel();
    for (const id of IDS) {
      toggleEl(id).focus();
      expect(document.activeElement).toBe(toggleEl(id));
    }
  });

  it('궤도선 store 변경이 패널에 즉시 반영 (단축 바와 같은 store — D3)', () => {
    renderPanel();
    openPanel();
    act(() => useSimStore.getState().setOrbitLinesVisible(false));
    expect(toggleEl('orbits')).toHaveAttribute('aria-pressed', 'false');
  });
});

describe('DisplayPanel × FocusQuickButtons — Esc 가 자유시점으로 새지 않는다 (D14 엣지 · D14b)', () => {
  const renderBoth = () =>
    render(
      <>
        <FocusQuickButtons />
        <DisplayPanel />
      </>,
      { wrapper: withNuqsTestingAdapter() },
    );

  it('focus=earth 에서 패널 열고 Esc → 패널만 닫힘 · enterFreeFly 0', () => {
    useSimStore.setState({ selectedBodyId: 'earth', freeFlyMode: false });
    renderBoth();
    openPanel();
    act(() => {
      fireEvent.keyDown(toggleEl('orbits'), { key: 'Escape' });
    });
    expect(screen.queryByTestId('display-panel')).toBeNull();
    expect(sentCommands).not.toContainEqual({ type: 'enterFreeFly' });
  });

  it('패널 연 채 선택 변경 (자유시점 리스너 재등록 → 패널 리스너보다 뒤) 후 Esc → enterFreeFly 0', () => {
    useSimStore.setState({ selectedBodyId: 'earth', freeFlyMode: false });
    renderBoth();
    openPanel();
    act(() => useSimStore.setState({ selectedBodyId: 'mars' }));
    expect(screen.getByTestId('display-panel')).toBeInTheDocument();
    act(() => {
      fireEvent.keyDown(toggleEl('orbits'), { key: 'Escape' });
    });
    expect(screen.queryByTestId('display-panel')).toBeNull();
    expect(sentCommands).not.toContainEqual({ type: 'enterFreeFly' });
  });

  it('패널이 닫힌 뒤의 Esc 는 기존대로 자유시점 (#509 보존)', () => {
    useSimStore.setState({ selectedBodyId: 'earth', freeFlyMode: false });
    renderBoth();
    fireEvent.keyDown(document.body, { key: 'Escape' });
    expect(sentCommands).toContainEqual({ type: 'enterFreeFly' });
  });
});
