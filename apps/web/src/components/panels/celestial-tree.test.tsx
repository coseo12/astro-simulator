import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { CelestialTree } from './celestial-tree';

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
 * #403 — CelestialTree R-Phase Allowlist 가드 단위 테스트 (defense-in-depth UI 측면 2번째 축).
 *
 * ADR `docs/decisions/20260506-403-r-phase-ui-guard.md` §결정 §CelestialTree UI 가드 박제 패턴.
 *
 * 검증:
 *  - allowlist 박제 body (sun / mercury / venus) 항목은 활성 (focusOn 정상 발행)
 *  - allowlist 외 body (earth / jupiter / neptune 등) 항목은 disabled + aria-disabled + data-r-phase-disabled
 *  - disabled 항목 강제 click 시 focusOn 명령 발행 0 (HTML disabled 자체 차단)
 *  - tooltip (title 속성) 박제 — 사용자 안내
 *  - 시각 차별화 (opacity-50 / cursor-not-allowed) 박제
 */
describe('CelestialTree — R-Phase Allowlist 가드 UI (#403)', () => {
  it('R-Phase 박제 body (sun) 항목은 활성', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-sun')).not.toBeDisabled();
  });

  it('R-Phase 박제 body (mercury / venus) 항목은 활성', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-mercury')).not.toBeDisabled();
    expect(screen.getByTestId('tree-venus')).not.toBeDisabled();
  });

  it('R-Phase 미박제 body (earth / jupiter / neptune) 는 disabled', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-earth')).toBeDisabled();
    expect(screen.getByTestId('tree-jupiter')).toBeDisabled();
    expect(screen.getByTestId('tree-neptune')).toBeDisabled();
  });

  it('disabled 항목은 aria-disabled="true" 설정 (스크린 리더 인지)', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-earth')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('tree-jupiter')).toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('tree-neptune')).toHaveAttribute('aria-disabled', 'true');
  });

  it('활성 항목은 aria-disabled="false"', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-sun')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-mercury')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-venus')).toHaveAttribute('aria-disabled', 'false');
  });

  it('disabled 항목은 data-r-phase-disabled="true" 회귀 가드 selector 박제', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-earth')).toHaveAttribute('data-r-phase-disabled', 'true');
    expect(screen.getByTestId('tree-sun')).toHaveAttribute('data-r-phase-disabled', 'false');
  });

  it('disabled 항목은 tooltip (title 속성) 박제 — 사용자 안내 + body 이름 포함', () => {
    render(<CelestialTree />);
    const earthBtn = screen.getByTestId('tree-earth');
    expect(earthBtn).toHaveAttribute('title');
    const title = earthBtn.getAttribute('title') ?? '';
    expect(title).toMatch(/지구/);
    expect(title).toMatch(/R-Phase/);
  });

  it('활성 항목은 title 속성 없음 (불필요 노이즈 차단)', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-sun')).not.toHaveAttribute('title');
    expect(screen.getByTestId('tree-mercury')).not.toHaveAttribute('title');
  });

  it('disabled 항목 강제 click → focusOn 명령 발행 0 (HTML disabled 자체 차단)', () => {
    render(<CelestialTree />);
    fireEvent.click(screen.getByTestId('tree-earth'));
    fireEvent.click(screen.getByTestId('tree-jupiter'));
    fireEvent.click(screen.getByTestId('tree-neptune'));
    // HTML button[disabled] 는 click 이벤트 자체를 dispatch 하지 않음.
    expect(sentCommands.filter((c) => c.type === 'focusOn')).toEqual([]);
  });

  it('활성 항목 click 시 focusOn 명령 발행 (정상 동작 회귀 가드)', () => {
    render(<CelestialTree />);
    fireEvent.click(screen.getByTestId('tree-sun'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'sun' });
    fireEvent.click(screen.getByTestId('tree-mercury'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'mercury' });
    fireEvent.click(screen.getByTestId('tree-venus'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'venus' });
  });

  it('disabled 항목 시각 차별화 — opacity-50 cursor-not-allowed 클래스 박제', () => {
    render(<CelestialTree />);
    const earthBtn = screen.getByTestId('tree-earth');
    expect(earthBtn.className).toContain('opacity-50');
    expect(earthBtn.className).toContain('cursor-not-allowed');
  });

  it('selected body active 스타일 — 활성 + selected 일 때 bg-primary/20', () => {
    useSimStore.setState({ selectedBodyId: 'mercury' });
    render(<CelestialTree />);
    const btn = screen.getByTestId('tree-mercury');
    expect(btn.className).toContain('bg-primary/20');
  });
});
