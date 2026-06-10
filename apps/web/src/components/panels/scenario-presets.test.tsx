import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { ScenarioPresets } from './scenario-presets';

let sent: CoreCommand[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => sent.push(cmd),
}));

beforeEach(() => {
  sent = [];
  useSimStore.setState({
    rendererKind: null,
    engineError: null,
    mode: 'research',
    julianDate: null,
    selectedBodyId: null,
    timeScale: 86_400,
    fps: null,
    unitSystem: 'astro',
    physicsEngine: 'kepler',
    massMultipliers: { earth: 2 },
    pingCount: 0,
    lastPingAt: null,
  });
});

describe('ScenarioPresets', () => {
  it('5개 프리셋 + 원복 버튼 렌더', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-jupiter-x10')).toBeInTheDocument();
    expect(screen.getByTestId('preset-no-jupiter')).toBeInTheDocument();
    expect(screen.getByTestId('preset-sun-half')).toBeInTheDocument();
    expect(screen.getByTestId('preset-saturn-x10')).toBeInTheDocument();
    expect(screen.getByTestId('preset-uranus-x10')).toBeInTheDocument(); // R7 #641 — negative 케이스 교체 보존
    expect(screen.getByTestId('scenario-reset')).toBeInTheDocument();
  });

  it('원복 — Kepler + 질량 초기화 + 시간 J2000', () => {
    render(<ScenarioPresets />);
    fireEvent.click(screen.getByTestId('scenario-reset'));
    const s = useSimStore.getState();
    expect(s.physicsEngine).toBe('kepler');
    expect(s.massMultipliers).toEqual({});
    expect(sent).toContainEqual({ type: 'jumpToJulianDate', julianDate: 2_451_545.0 });
  });
});

/**
 * #404 — ScenarioPresets R-Phase Allowlist 가드 단위 테스트 (defense-in-depth UI 측면 3번째 축).
 *
 * ADR `docs/decisions/20260508-404-scenario-presets-r-phase-guard.md` §결정 1, 3.
 *
 * 검증 (R6 #621 진입 — jupiter allowlist 포함 후):
 *  - sun-half (R1 박제 sun) preset 활성 — apply 호출 시 setEngine/setMass/sendCommand 정상 발행
 *  - jupiter-x10 / no-jupiter (R6 #621 진입 jupiter) preset 활성 — zero-touch 자동 enabled
 *  - saturn-x10 (R7 미진입 saturn) preset disabled — disabled-path negative 케이스 보존
 *    (jupiter 진입으로 jupiter-x10 / no-jupiter 가 enabled 되어 가드 무력화 위험 → saturn 으로 대체 박제)
 *  - a11y 4축 (disabled / aria-disabled / title / data-r-phase-disabled) 정합성
 *  - sun-half tooltip 부재 (불필요 노이즈 차단), disabled preset tooltip 'R-Phase 진행 시 활성' 박제
 *  - 시각 차별화 (opacity-50 / cursor-not-allowed) 박제
 *  - R-Phase 자동 적응 (zero-touch) — `isPresetEnabled` 일반화 추상화 검증
 */
describe('ScenarioPresets — R-Phase Allowlist 가드 UI (#404)', () => {
  it('sun-half (R1 박제 sun) preset 은 활성 (R-Phase incremental policy 정합)', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-sun-half')).not.toBeDisabled();
  });

  it('jupiter-x10 (R6 #621 진입 jupiter) preset 은 활성 (zero-touch 자동 enabled)', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-jupiter-x10')).not.toBeDisabled();
  });

  it('no-jupiter (R6 #621 진입 jupiter) preset 은 활성 (zero-touch 자동 enabled)', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-no-jupiter')).not.toBeDisabled();
  });

  it('saturn-x10 (R7 #641 진입 saturn) preset 은 활성 (zero-touch 자동 enabled 재현 2번째)', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-saturn-x10')).not.toBeDisabled();
  });

  it('uranus-x10 (R8 미진입 uranus) preset 은 disabled (negative 케이스 교체 보존)', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-uranus-x10')).toBeDisabled();
  });

  it('disabled preset 은 aria-disabled="true" 설정 (스크린 리더 인지)', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-uranus-x10')).toHaveAttribute('aria-disabled', 'true');
  });

  it('활성 preset 은 aria-disabled="false"', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-sun-half')).toHaveAttribute('aria-disabled', 'false');
    expect(screen.getByTestId('preset-jupiter-x10')).toHaveAttribute('aria-disabled', 'false');
  });

  it('disabled preset 은 data-r-phase-disabled="true" 회귀 가드 selector 박제', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-uranus-x10')).toHaveAttribute(
      'data-r-phase-disabled',
      'true',
    );
    expect(screen.getByTestId('preset-sun-half')).toHaveAttribute('data-r-phase-disabled', 'false');
    expect(screen.getByTestId('preset-saturn-x10')).toHaveAttribute(
      'data-r-phase-disabled',
      'false',
    ); // R7 #641 진입
    expect(screen.getByTestId('preset-jupiter-x10')).toHaveAttribute(
      'data-r-phase-disabled',
      'false',
    );
  });

  it('disabled preset 은 tooltip "R-Phase 진행 시 활성" 박제', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-uranus-x10')).toHaveAttribute(
      'title',
      'R-Phase 진행 시 활성',
    );
  });

  it('활성 preset 은 title 속성 없음 (불필요 노이즈 차단)', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('preset-sun-half')).not.toHaveAttribute('title');
    expect(screen.getByTestId('preset-jupiter-x10')).not.toHaveAttribute('title');
  });

  it('disabled preset 시각 차별화 — opacity-50 cursor-not-allowed 클래스 박제', () => {
    render(<ScenarioPresets />);
    const uranusBtn = screen.getByTestId('preset-uranus-x10');
    expect(uranusBtn.className).toContain('opacity-50');
    expect(uranusBtn.className).toContain('cursor-not-allowed');
  });

  it('disabled preset 강제 click → apply 부작용 0 (HTML disabled 자체 차단)', () => {
    render(<ScenarioPresets />);
    fireEvent.click(screen.getByTestId('preset-uranus-x10'));
    // HTML button[disabled] 는 click 이벤트 자체를 dispatch 하지 않음.
    const s = useSimStore.getState();
    expect(s.physicsEngine).toBe('kepler'); // 초기값 유지 (setEngine 호출 0)
    expect(s.massMultipliers).toEqual({ earth: 2 }); // 초기값 유지 (resetMasses/setMass 호출 0)
    expect(sent.filter((c) => c.type === 'jumpToJulianDate')).toEqual([]); // sendCommand 호출 0
  });

  it('jupiter-x10 (활성) click → setEngine(newton) + setMass(jupiter, 10) 정상 동작 (R6 진입 회귀 가드)', () => {
    render(<ScenarioPresets />);
    fireEvent.click(screen.getByTestId('preset-jupiter-x10'));
    const s = useSimStore.getState();
    expect(s.physicsEngine).toBe('newton');
    expect(s.massMultipliers).toEqual({ jupiter: 10 });
    expect(sent).toContainEqual({ type: 'jumpToJulianDate', julianDate: 2_451_545.0 });
  });

  it('sun-half (활성) click → setEngine(newton) + setMass(sun, 0.5) + sendCommand(J2000) 정상 동작 회귀 가드', () => {
    render(<ScenarioPresets />);
    fireEvent.click(screen.getByTestId('preset-sun-half'));
    const s = useSimStore.getState();
    expect(s.physicsEngine).toBe('newton');
    expect(s.massMultipliers).toEqual({ sun: 0.5 });
    expect(sent).toContainEqual({ type: 'jumpToJulianDate', julianDate: 2_451_545.0 });
  });

  it('원복 버튼 (scenario-reset) 은 R-Phase 무관 — 항상 enabled (회귀 0 검증)', () => {
    render(<ScenarioPresets />);
    expect(screen.getByTestId('scenario-reset')).not.toBeDisabled();
    expect(screen.getByTestId('scenario-reset')).not.toHaveAttribute('aria-disabled', 'true');
    expect(screen.getByTestId('scenario-reset')).not.toHaveAttribute(
      'data-r-phase-disabled',
      'true',
    );
  });
});
