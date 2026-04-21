import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { SatelliteInfoPanel } from './satellite-info-panel';
import { GALILEAN_IDS, type OscSyncResult } from '@/hooks/use-osculating-sync';

/**
 * P9 #254 PR-3 D8 DOM 스냅샷 테스트.
 *
 * 검증 목표:
 *  1. `solar-system.json` 정적 폴백 시 4체 모두 JSON 값으로 표시 (P10-D #261 JPL 재쿼리 후 Io e=0.003988 / i=2.207° 등)
 *  2. `oscElements` 동적 값이 주입되면 WASM 값을 우선 사용
 *  3. `singularity===1` 원소에만 "원순환 근사" 배지 렌더
 *
 * ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md` §인터페이스 박제 L292~L316.
 */

describe('SatelliteInfoPanel', () => {
  it('정적 폴백 — 4 Galilean 모두 JSON 값과 일치', () => {
    render(<SatelliteInfoPanel satellites={GALILEAN_IDS} />);

    // P10-D #261: JPL Horizons 2026-01-01 TDB J2000 ecliptic 재쿼리 값.
    // Io: e=0.003988 / i=2.2065°.
    expect(screen.getByTestId('sat-row-io')).toBeInTheDocument();
    expect(screen.getByTestId('sat-e-io').textContent).toBe('0.0040');
    expect(screen.getByTestId('sat-i-io').textContent).toBe('2.207°');

    // Europa: e=0.009286 / i=2.1504°.
    expect(screen.getByTestId('sat-e-europa').textContent).toBe('0.0093');
    expect(screen.getByTestId('sat-i-europa').textContent).toBe('2.150°');

    // Ganymede: e=0.002186 / i=2.3390°.
    expect(screen.getByTestId('sat-e-ganymede').textContent).toBe('0.0022');
    expect(screen.getByTestId('sat-i-ganymede').textContent).toBe('2.339°');

    // Callisto: e=0.007347 / i=1.9516°.
    expect(screen.getByTestId('sat-e-callisto').textContent).toBe('0.0073');
    expect(screen.getByTestId('sat-i-callisto').textContent).toBe('1.952°');

    // 정적 폴백에서는 1Hz 배지 없음.
    expect(screen.queryByTestId('sat-dynamic-io')).not.toBeInTheDocument();
    // 정적 폴백에는 singularity 플래그 없음.
    expect(screen.queryByTestId('sat-singularity-io')).not.toBeInTheDocument();
  });

  it('동적 값 — oscElements 주입 시 우선 사용 + 1Hz 배지', () => {
    const osc: OscSyncResult['elements'] = {
      io: {
        semiMajorAxis: 421_800_000, // 421800 km
        eccentricity: 0.0055, // JSON 과 다른 값
        inclination: 0.001, // rad — 약 0.057°
        longitudeOfAscendingNode: 0,
        argumentOfPeriapsis: 0,
        meanAnomaly: 0,
        singularity: 0,
      },
      europa: {
        semiMajorAxis: 671_100_000,
        eccentricity: 0.009,
        inclination: 0.008,
        longitudeOfAscendingNode: 0,
        argumentOfPeriapsis: 0,
        meanAnomaly: 0,
        singularity: 0,
      },
      ganymede: {
        semiMajorAxis: 1_070_400_000,
        eccentricity: 0.0013,
        inclination: 0.003,
        longitudeOfAscendingNode: 0,
        argumentOfPeriapsis: 0,
        meanAnomaly: 0,
        singularity: 0,
      },
      callisto: {
        semiMajorAxis: 1_882_700_000,
        eccentricity: 0.0074,
        inclination: 0.0033,
        longitudeOfAscendingNode: 0,
        argumentOfPeriapsis: 0,
        meanAnomaly: 0,
        singularity: 0,
      },
    };
    render(<SatelliteInfoPanel satellites={GALILEAN_IDS} oscElements={osc} />);

    // Io — 동적 값 e=0.0055 반영.
    expect(screen.getByTestId('sat-e-io').textContent).toBe('0.0055');
    // 1Hz 배지 렌더.
    expect(screen.getByTestId('sat-dynamic-io')).toBeInTheDocument();
  });

  it('singularity===1 — 원순환 근사 배지만 표시 (1Hz 배지 없음)', () => {
    const osc: OscSyncResult['elements'] = {
      io: {
        semiMajorAxis: 421_800_000,
        eccentricity: 1e-8,
        inclination: 1e-8,
        longitudeOfAscendingNode: 0,
        argumentOfPeriapsis: 0,
        meanAnomaly: 0,
        singularity: 1, // 원순환 근사 적용.
      },
      europa: {
        semiMajorAxis: 671_100_000,
        eccentricity: 0.009,
        inclination: 0.008,
        longitudeOfAscendingNode: 0,
        argumentOfPeriapsis: 0,
        meanAnomaly: 0,
        singularity: 0,
      },
      ganymede: {
        semiMajorAxis: 1_070_400_000,
        eccentricity: 0.0013,
        inclination: 0.003,
        longitudeOfAscendingNode: 0,
        argumentOfPeriapsis: 0,
        meanAnomaly: 0,
        singularity: 0,
      },
      callisto: {
        semiMajorAxis: 1_882_700_000,
        eccentricity: 0.0074,
        inclination: 0.0033,
        longitudeOfAscendingNode: 0,
        argumentOfPeriapsis: 0,
        meanAnomaly: 0,
        singularity: 0,
      },
    };
    render(<SatelliteInfoPanel satellites={GALILEAN_IDS} oscElements={osc} />);

    // Io 는 singularity 배지 렌더 + 1Hz 배지 미렌더.
    expect(screen.getByTestId('sat-singularity-io')).toBeInTheDocument();
    expect(screen.queryByTestId('sat-dynamic-io')).not.toBeInTheDocument();
    // 다른 체는 singularity 배지 없음.
    expect(screen.queryByTestId('sat-singularity-europa')).not.toBeInTheDocument();
  });
});
