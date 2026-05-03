import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { FocusQuickButtons } from './focus-quick-buttons';

let sentCommands: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
}));

beforeEach(() => {
  sentCommands = [];
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'observe',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    unitSystem: 'astro',
    pingCount: 0,
    lastPingAt: null,
  });
});

/**
 * R2 #361 — FocusQuickButtons 단위 테스트.
 *
 * D-S1 (shortcut bar 수성 항목 추가) 검증:
 *   1. 5 body 버튼 (sun / mercury / earth / jupiter / neptune) + reset 버튼 렌더
 *   2. mercury 클릭 시 focusOn 명령 발행 (R1 패턴 재사용)
 *   3. 천체 거리 순서 (sun → mercury → earth → ...) 보존
 *
 * ADR: docs/decisions/20260428-r2-mercury-visualization.md §결정 2
 */
describe('FocusQuickButtons — R1 sun + R2 mercury', () => {
  it('6 body 버튼 + reset 렌더 (sun / mercury / venus / earth / jupiter / neptune)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).toBeInTheDocument();
    expect(screen.getByTestId('focus-mercury')).toBeInTheDocument();
    expect(screen.getByTestId('focus-venus')).toBeInTheDocument();
    expect(screen.getByTestId('focus-earth')).toBeInTheDocument();
    expect(screen.getByTestId('focus-jupiter')).toBeInTheDocument();
    expect(screen.getByTestId('focus-neptune')).toBeInTheDocument();
    expect(screen.getByTestId('focus-reset')).toBeInTheDocument();
  });

  it('mercury 버튼 텍스트 = "수성" (한국어 라벨, axe 자연 라벨)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-mercury')).toHaveTextContent('수성');
  });

  it('mercury 클릭 시 focusOn 명령 발행 (R1 sun 패턴 재사용)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-mercury'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'mercury' });
  });

  it('sun 클릭 시 focusOn 명령 발행 (R1 회귀 0)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-sun'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'sun' });
  });

  it('reset 클릭 시 resetCamera 명령 발행', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-reset'));
    expect(sentCommands).toContainEqual({ type: 'resetCamera' });
  });

  it('mercury 가 selectedBodyId 일 때 active 스타일 적용', () => {
    useSimStore.setState({ selectedBodyId: 'mercury' });
    render(<FocusQuickButtons />);
    const btn = screen.getByTestId('focus-mercury');
    // active 상태에서는 bg-primary/20 텍스트 색상 변경 (focus-quick-buttons.tsx 28-30 라인)
    expect(btn.className).toContain('bg-primary/20');
  });

  it('sun 다음 위치에 mercury (천체 거리 순서 보존)', () => {
    render(<FocusQuickButtons />);
    const buttons = [
      screen.getByTestId('focus-sun'),
      screen.getByTestId('focus-mercury'),
      screen.getByTestId('focus-venus'),
      screen.getByTestId('focus-earth'),
      screen.getByTestId('focus-jupiter'),
      screen.getByTestId('focus-neptune'),
    ];
    // DOM 순서가 천체 거리 순서와 일치하는지 검증.
    // Node.compareDocumentPosition: 0x04 (DOCUMENT_POSITION_FOLLOWING)
    // = a 가 b 보다 앞에 있음.
    for (let i = 0; i < buttons.length - 1; i++) {
      const current = buttons[i];
      const next = buttons[i + 1];
      if (!current || !next) throw new Error('button index OOB — 6 body 보장 위배');
      expect(current.compareDocumentPosition(next)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });
});

/**
 * #402 — R-Phase Body Allowlist 가드 (defense-in-depth UI 측면).
 *
 * ADR `docs/decisions/20260504-r-phase-allowlist-guard.md` §결정 2.
 *
 * 현재 박제값: R1 sun + R2 mercury + R3 venus 활성. earth/jupiter/neptune 미활성.
 */
describe('FocusQuickButtons — R-Phase allowlist 가드 (#402)', () => {
  it('R-Phase 활성 body (sun/mercury/venus) 는 disabled 아님', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).not.toBeDisabled();
    expect(screen.getByTestId('focus-mercury')).not.toBeDisabled();
    expect(screen.getByTestId('focus-venus')).not.toBeDisabled();
  });

  it('R-Phase 미활성 body (earth/jupiter/neptune) 는 HTML disabled 속성 + aria-disabled', () => {
    render(<FocusQuickButtons />);
    for (const id of ['earth', 'jupiter', 'neptune']) {
      const btn = screen.getByTestId(`focus-${id}`);
      expect(btn).toBeDisabled();
      expect(btn).toHaveAttribute('aria-disabled', 'true');
      expect(btn).toHaveAttribute('data-r-phase-disabled', 'true');
    }
  });

  it('R-Phase 미활성 body 클릭 시 focusOn 명령 발행 0 (UI 가드 1차 방어선)', () => {
    render(<FocusQuickButtons />);
    fireEvent.click(screen.getByTestId('focus-earth'));
    fireEvent.click(screen.getByTestId('focus-jupiter'));
    fireEvent.click(screen.getByTestId('focus-neptune'));
    // disabled 버튼은 브라우저 표준상 click event 차단 → sendCommand 호출 0.
    expect(sentCommands).toHaveLength(0);
  });

  it('R-Phase 활성 body 는 data-r-phase-disabled 속성 부재', () => {
    render(<FocusQuickButtons />);
    for (const id of ['sun', 'mercury', 'venus']) {
      const btn = screen.getByTestId(`focus-${id}`);
      expect(btn).not.toHaveAttribute('data-r-phase-disabled');
    }
  });

  it('R-Phase 미활성 body 는 opacity 0.5 + cursor:not-allowed 시각 차별화', () => {
    render(<FocusQuickButtons />);
    const earthBtn = screen.getByTestId('focus-earth');
    // tailwind 클래스 박제 — 시각 차별화 회귀 가드 (사용자 D-T2 잔재 방지).
    expect(earthBtn.className).toContain('opacity-50');
    expect(earthBtn.className).toContain('cursor-not-allowed');
  });
});
