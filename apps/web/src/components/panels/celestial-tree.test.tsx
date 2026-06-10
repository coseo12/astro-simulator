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
 * R4 #532 — earth + moon 진입 (Allowlist 5개 활성: sun/mercury/venus/earth/moon).
 *
 * 검증:
 *  - allowlist 박제 body (sun / mercury / venus / earth / moon) 항목은 활성 (focusOn 정상 발행)
 *  - allowlist 외 body (pluto 등 R10) 항목은 disabled + aria-disabled + data-r-phase-disabled (R9 #653 — neptune 진입으로 pluto 교체)
 *  - disabled 항목 강제 click 시 focusOn 명령 발행 0 (HTML disabled 자체 차단)
 *  - tooltip (title 속성) 박제 — 사용자 안내
 *  - 시각 차별화 (opacity-50 / cursor-not-allowed) 박제
 */
describe('CelestialTree — R-Phase Allowlist 가드 UI (#403 + R4 #532)', () => {
  it('R-Phase 박제 body (sun) 항목은 활성', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-sun')).not.toBeDisabled();
  });

  it('R-Phase 박제 body (mercury / venus / earth / moon) 항목은 활성', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-mercury')).not.toBeDisabled();
    expect(screen.getByTestId('tree-venus')).not.toBeDisabled();
    expect(screen.getByTestId('tree-earth')).not.toBeDisabled();
    expect(screen.getByTestId('tree-moon')).not.toBeDisabled();
  });

  it('neptune (R9 #653 진입) 은 활성 — zero-touch 자동 enabled', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-neptune')).not.toBeDisabled();
  });

  it('R-Phase 미박제 body (pluto — R10 미진입) 는 disabled (negative 케이스 교체 보존 — R9 neptune 선례)', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-pluto')).toBeDisabled();
  });

  it('disabled 항목은 aria-disabled="true" 설정 (스크린 리더 인지)', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-pluto')).toHaveAttribute('aria-disabled', 'true');
  });

  it('활성 항목은 aria-disabled="false" (R4 earth / moon + R6 jupiter 포함)', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-sun')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-mercury')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-venus')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-earth')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-moon')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('tree-jupiter')).toHaveAttribute('aria-disabled', 'false'); // R6 #621
  });

  it('disabled 항목은 data-r-phase-disabled="true" 회귀 가드 selector 박제', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-pluto')).toHaveAttribute('data-r-phase-disabled', 'true');
    expect(screen.getByTestId('tree-neptune')).toHaveAttribute('data-r-phase-disabled', 'false'); // R9 #653 진입
    expect(screen.getByTestId('tree-sun')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('tree-earth')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('tree-moon')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('tree-jupiter')).toHaveAttribute('data-r-phase-disabled', 'false'); // R6 #621
  });

  it('disabled 항목은 tooltip (title 속성) 박제 — 사용자 안내 + body 이름 포함', () => {
    render(<CelestialTree />);
    const plutoBtn = screen.getByTestId('tree-pluto');
    expect(plutoBtn).toHaveAttribute('title');
    const title = plutoBtn.getAttribute('title') ?? '';
    expect(title).toMatch(/명왕성/);
    expect(title).toMatch(/R-Phase/);
  });

  it('활성 항목은 title 속성 없음 (불필요 노이즈 차단)', () => {
    render(<CelestialTree />);
    expect(screen.getByTestId('tree-sun')).not.toHaveAttribute('title');
    expect(screen.getByTestId('tree-mercury')).not.toHaveAttribute('title');
    expect(screen.getByTestId('tree-earth')).not.toHaveAttribute('title');
    expect(screen.getByTestId('tree-moon')).not.toHaveAttribute('title');
    expect(screen.getByTestId('tree-jupiter')).not.toHaveAttribute('title'); // R6 #621
  });

  it('disabled 항목 강제 click → focusOn 명령 발행 0 (HTML disabled 자체 차단)', () => {
    render(<CelestialTree />);
    fireEvent.click(screen.getByTestId('tree-pluto'));
    // HTML button[disabled] 는 click 이벤트 자체를 dispatch 하지 않음.
    expect(sentCommands.filter((c) => c.type === 'focusOn')).toEqual([]);
  });

  it('활성 항목 click 시 focusOn 명령 발행 (정상 동작 회귀 가드, R4 earth/moon 포함)', () => {
    render(<CelestialTree />);
    fireEvent.click(screen.getByTestId('tree-sun'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'sun' });
    fireEvent.click(screen.getByTestId('tree-mercury'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'mercury' });
    fireEvent.click(screen.getByTestId('tree-venus'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'venus' });
    fireEvent.click(screen.getByTestId('tree-earth'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'earth' });
    fireEvent.click(screen.getByTestId('tree-moon'));
    expect(sentCommands).toContainEqual({ type: 'focusOn', bodyId: 'moon' });
  });

  it('disabled 항목 시각 차별화 — opacity-50 cursor-not-allowed 클래스 박제', () => {
    render(<CelestialTree />);
    const plutoBtn = screen.getByTestId('tree-pluto');
    expect(plutoBtn.className).toContain('opacity-50');
    expect(plutoBtn.className).toContain('cursor-not-allowed');
  });

  it('selected body active 스타일 — 활성 + selected 일 때 bg-primary/20', () => {
    useSimStore.setState({ selectedBodyId: 'mercury' });
    render(<CelestialTree />);
    const btn = screen.getByTestId('tree-mercury');
    expect(btn.className).toContain('bg-primary/20');
  });
});
