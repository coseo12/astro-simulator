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
  it('5 body 버튼 + reset 렌더 (R1 4 + R2 mercury 1)', () => {
    render(<FocusQuickButtons />);
    expect(screen.getByTestId('focus-sun')).toBeInTheDocument();
    expect(screen.getByTestId('focus-mercury')).toBeInTheDocument();
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
      if (!current || !next) throw new Error('button index OOB — 5 body 보장 위배');
      expect(current.compareDocumentPosition(next)).toBe(Node.DOCUMENT_POSITION_FOLLOWING);
    }
  });
});
