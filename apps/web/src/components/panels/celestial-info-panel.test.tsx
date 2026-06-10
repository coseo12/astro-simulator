import { render, screen } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { CelestialInfoPanel } from './celestial-info-panel';

beforeEach(() => {
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
 * #403 — CelestialInfoPanel R-Phase Allowlist 가드 단위 테스트 (defense-in-depth UI 측면 2번째 축).
 *
 * ADR `docs/decisions/20260506-403-r-phase-ui-guard.md` §결정 §InfoPanel UI 가드 박제 패턴.
 * R4 #532 — earth + moon 진입 (Allowlist 5개 활성).
 *
 * 검증:
 *  - selectedBodyId === null: info-panel-empty 렌더 (기존 분기 회귀 0)
 *  - R-Phase 박제 body (sun / mercury / venus / earth / moon): info-panel 정상 분기 렌더
 *  - R-Phase 미박제 body (pluto — R10): info-panel-r-phase-blocked 분기 렌더 (R9 #653 — neptune 진입으로 pluto 교체)
 *  - R-Phase 차단 분기는 body 이름 포함 + R-Phase 메시지 박제
 *  - 분기 위치 — 정상 분기 *이전* (selected/data 존재 후 R-Phase 검사)
 */
describe('CelestialInfoPanel — R-Phase Allowlist 가드 UI (#403 + R4 #532)', () => {
  it('selectedBodyId === null: info-panel-empty 렌더 (기존 분기 회귀 가드)', () => {
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel')).not.toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "sun": info-panel 정상 분기 렌더 (R1 회귀 보호)', () => {
    useSimStore.setState({ selectedBodyId: 'sun' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "mercury": info-panel 정상 분기 렌더 (R2 회귀 보호)', () => {
    useSimStore.setState({ selectedBodyId: 'mercury' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "venus": info-panel 정상 분기 렌더 (R3 회귀 보호)', () => {
    useSimStore.setState({ selectedBodyId: 'venus' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "earth": info-panel 정상 분기 렌더 (R4 #532 진입)', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "moon": info-panel 정상 분기 렌더 (R4 #532 satellite 첫 본 사례)', () => {
    useSimStore.setState({ selectedBodyId: 'moon' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "jupiter": info-panel 정상 분기 렌더 (R6 #621 진입 — 차단 아님)', () => {
    useSimStore.setState({ selectedBodyId: 'jupiter' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "neptune": info-panel 정상 분기 렌더 (R9 #653 진입 — 차단 아님)', () => {
    useSimStore.setState({ selectedBodyId: 'neptune' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "triton": info-panel 정상 분기 렌더 (R9 #653 — 역행 위성 첫 사례)', () => {
    useSimStore.setState({ selectedBodyId: 'triton' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "pluto": info-panel-r-phase-blocked 분기 렌더 (R10 미진입 negative 교체 보존)', () => {
    useSimStore.setState({ selectedBodyId: 'pluto' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel-r-phase-blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel')).not.toBeInTheDocument();
  });

  it('차단 분기는 body 이름 (명왕성) 포함 — 사용자 인지 우수', () => {
    useSimStore.setState({ selectedBodyId: 'pluto' });
    render(<CelestialInfoPanel />);
    const blocked = screen.getByTestId('info-panel-r-phase-blocked');
    expect(blocked.textContent ?? '').toMatch(/명왕성/);
  });

  it('차단 분기는 R-Phase 메시지 박제', () => {
    useSimStore.setState({ selectedBodyId: 'pluto' });
    render(<CelestialInfoPanel />);
    const blocked = screen.getByTestId('info-panel-r-phase-blocked');
    expect(blocked.textContent ?? '').toMatch(/R-Phase/);
  });

  it('차단 분기는 body 별 이름이 정확히 박제 (jupiter / pluto 회귀 0)', () => {
    useSimStore.setState({ selectedBodyId: 'pluto' });
    render(<CelestialInfoPanel />);
    const blocked = screen.getByTestId('info-panel-r-phase-blocked');
    expect(blocked.textContent ?? '').toMatch(/명왕성/);
    expect(blocked.textContent ?? '').not.toMatch(/목성/);
  });

  it('알 수 없는 body id (data 없음): info-panel-empty 폴백 (R-Phase 분기 미진입)', () => {
    useSimStore.setState({ selectedBodyId: 'invalid-body-id' });
    render(<CelestialInfoPanel />);
    // data === null 이므로 정상 빈 패널 분기로 폴백.
    expect(screen.getByTestId('info-panel-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });
});
