'use client';

import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { AU } from '@astro-simulator/shared';
import { useMemo } from 'react';
import type { GalileanId, OscSyncResult } from '@/hooks/use-osculating-sync';

/**
 * P9 #254 D8 — Galilean 이심률·경사 정보 패널.
 *
 * ADR `docs/decisions/20260420-p9-galilean-laplace-rings.md` §인터페이스 박제 L292~L316.
 *
 * 데이터 바인딩:
 *   1차: `oscElements` (동적, `useOsculatingSync` 결과) — 있으면 우선 사용
 *   2차: `solar-system.json` 정적 값 — 폴백
 *
 * #246 경계: 본 컴포넌트는 정보 표시만. 클릭/ARIA/ESC 흐름은 #246 범위 (별도 PR).
 */

export interface SatelliteInfoPanelProps {
  /** 표시 대상 Galilean 4체 (전체 또는 선택된 부분). */
  satellites: readonly GalileanId[];
  /** `useOsculatingSync` 결과. 없으면 JSON 정적값만 표시. */
  oscElements?: OscSyncResult['elements'];
}

const NAME_KO: Record<GalileanId, string> = {
  io: '이오',
  europa: '유로파',
  ganymede: '가니메데',
  callisto: '칼리스토',
};

const RAD_TO_DEG = 180 / Math.PI;

function formatE(value: number): string {
  // 이심률 — 4자리 고정 (Io 0.0041 / Europa 0.009 수준 표현).
  return value.toFixed(4);
}

function formatIDeg(valueDeg: number): string {
  // 경사각 — 3자리 고정 (Io 0.036° / Callisto 0.192° 수준).
  return `${valueDeg.toFixed(3)}°`;
}

function formatAkm(meters: number): string {
  // 장반경 — km 단위. Io≈421800, Callisto≈1882700.
  return `${(meters / 1000).toFixed(0)} km`;
}

interface Row {
  id: GalileanId;
  /** 이심률 */
  e: number;
  /** 경사 [deg] */
  iDeg: number;
  /** 장반경 [m] */
  aMeters: number;
  /** 원순환 근사 배지 여부 */
  singular: boolean;
  /** 데이터 출처 — 'dynamic' = WASM, 'static' = JSON */
  source: 'dynamic' | 'static';
}

export function SatelliteInfoPanel(props: SatelliteInfoPanelProps) {
  const { satellites, oscElements } = props;

  const rows = useMemo<Row[]>(() => {
    const system = ephemerisApi.getSolarSystem();
    const byId = new Map(system.bodies.map((b) => [b.id, b]));
    return satellites.map<Row>((id) => {
      const dyn = oscElements?.[id];
      if (dyn) {
        return {
          id,
          e: dyn.eccentricity,
          iDeg: dyn.inclination * RAD_TO_DEG,
          aMeters: dyn.semiMajorAxis,
          singular: dyn.singularity === 1,
          source: 'dynamic',
        };
      }
      // 정적 폴백 — solar-system.json.
      const body = byId.get(id);
      if (!body || !body.orbit) {
        return { id, e: 0, iDeg: 0, aMeters: 0, singular: false, source: 'static' };
      }
      return {
        id,
        e: body.orbit.eccentricity,
        iDeg: body.orbit.inclination * RAD_TO_DEG,
        aMeters: body.orbit.semiMajorAxis,
        singular: false,
        source: 'static',
      };
    });
  }, [satellites, oscElements]);

  return (
    <div data-testid="satellite-info-panel" className="flex flex-col gap-2">
      <h3 className="text-body-sm text-fg-secondary">갈릴레이 위성 (Jupiter-centric)</h3>
      <table className="text-caption">
        <thead>
          <tr className="text-fg-tertiary">
            <th className="text-left font-normal pr-3">위성</th>
            <th className="text-right font-normal pr-3">장반경</th>
            <th className="text-right font-normal pr-3">이심률 e</th>
            <th className="text-right font-normal pr-3">경사 i</th>
            <th className="text-left font-normal"></th>
          </tr>
        </thead>
        <tbody>
          {rows.map((row) => (
            <tr key={row.id} data-testid={`sat-row-${row.id}`}>
              <td className="pr-3 text-fg-primary">{NAME_KO[row.id]}</td>
              <td className="pr-3 text-right tabular-nums" data-testid={`sat-a-${row.id}`}>
                {formatAkm(row.aMeters)}
              </td>
              <td className="pr-3 text-right tabular-nums" data-testid={`sat-e-${row.id}`}>
                {formatE(row.e)}
              </td>
              <td className="pr-3 text-right tabular-nums" data-testid={`sat-i-${row.id}`}>
                {formatIDeg(row.iDeg)}
              </td>
              <td>
                {row.singular && (
                  <span
                    data-testid={`sat-singularity-${row.id}`}
                    className="inline-block px-1.5 py-0.5 rounded bg-fg-tertiary/20 text-fg-tertiary text-[10px]"
                    title="eccentricity 또는 inclination 이 1e-6 미만이라 원순환 근사를 적용함"
                  >
                    원순환 근사
                  </span>
                )}
                {row.source === 'dynamic' && !row.singular && (
                  <span
                    data-testid={`sat-dynamic-${row.id}`}
                    className="inline-block px-1.5 py-0.5 rounded bg-fg-accent/20 text-fg-accent text-[10px]"
                    title="Osculating 원소 — 매 초 WASM 에서 재측정"
                  >
                    1Hz
                  </span>
                )}
              </td>
            </tr>
          ))}
        </tbody>
      </table>
      <p className="text-caption text-fg-tertiary">
        정적 값: JPL Horizons 2026-01-01. 동적 값: 시뮬레이션 씬에서 매 초 추출 (AU 단위 참고:{' '}
        {(AU / 1_000_000).toFixed(0)} Mkm/AU).
      </p>
    </div>
  );
}
