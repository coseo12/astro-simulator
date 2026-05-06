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
 *
 * 검증:
 *  - selectedBodyId === null: info-panel-empty 렌더 (기존 분기 회귀 0)
 *  - R-Phase 박제 body (sun / mercury / venus): info-panel 정상 분기 렌더
 *  - R-Phase 미박제 body (earth / jupiter / neptune): info-panel-r-phase-blocked 분기 렌더
 *  - R-Phase 차단 분기는 body 이름 포함 + R-Phase 메시지 박제
 *  - 분기 위치 — 정상 분기 *이전* (selected/data 존재 후 R-Phase 검사)
 */
describe('CelestialInfoPanel — R-Phase Allowlist 가드 UI (#403)', () => {
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

  it('selectedBodyId === "earth": info-panel-r-phase-blocked 분기 렌더', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel-r-phase-blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "jupiter": info-panel-r-phase-blocked 분기 렌더', () => {
    useSimStore.setState({ selectedBodyId: 'jupiter' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel-r-phase-blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel')).not.toBeInTheDocument();
  });

  it('selectedBodyId === "neptune": info-panel-r-phase-blocked 분기 렌더', () => {
    useSimStore.setState({ selectedBodyId: 'neptune' });
    render(<CelestialInfoPanel />);
    expect(screen.getByTestId('info-panel-r-phase-blocked')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel')).not.toBeInTheDocument();
  });

  it('차단 분기는 body 이름 (지구) 포함 — 사용자 인지 우수', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<CelestialInfoPanel />);
    const blocked = screen.getByTestId('info-panel-r-phase-blocked');
    expect(blocked.textContent ?? '').toMatch(/지구/);
  });

  it('차단 분기는 R-Phase 메시지 박제', () => {
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<CelestialInfoPanel />);
    const blocked = screen.getByTestId('info-panel-r-phase-blocked');
    expect(blocked.textContent ?? '').toMatch(/R-Phase/);
  });

  it('차단 분기는 body 별 이름이 정확히 박제 (mercury 외 venus 회귀 0)', () => {
    useSimStore.setState({ selectedBodyId: 'jupiter' });
    render(<CelestialInfoPanel />);
    const blocked = screen.getByTestId('info-panel-r-phase-blocked');
    expect(blocked.textContent ?? '').toMatch(/목성/);
    expect(blocked.textContent ?? '').not.toMatch(/지구/);
  });

  it('알 수 없는 body id (data 없음): info-panel-empty 폴백 (R-Phase 분기 미진입)', () => {
    useSimStore.setState({ selectedBodyId: 'invalid-body-id' });
    render(<CelestialInfoPanel />);
    // data === null 이므로 정상 빈 패널 분기로 폴백.
    expect(screen.getByTestId('info-panel-empty')).toBeInTheDocument();
    expect(screen.queryByTestId('info-panel-r-phase-blocked')).not.toBeInTheDocument();
  });
});
