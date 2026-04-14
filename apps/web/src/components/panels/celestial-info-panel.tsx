'use client';

import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { AU } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { TierBadge } from '../ui/tier-badge';
import { MassSlider } from './mass-slider';
import { useMemo } from 'react';

const KIND_LABEL: Record<string, string> = {
  star: '항성',
  planet: '행성',
  'dwarf-planet': '왜소행성',
  moon: '위성',
};

function formatExp(n: number, digits = 3): string {
  return n.toExponential(digits);
}

function formatDays(seconds: number): string {
  const days = seconds / 86_400;
  if (days < 365) return `${days.toFixed(2)} 일`;
  return `${(days / 365.25).toFixed(3)} 년`;
}

/**
 * 우 패널 — 선택된 천체 정보.
 * Tier 1 관측 데이터이므로 모든 수치에 T1 배지.
 */
export function CelestialInfoPanel() {
  const selected = useSimStore((s) => s.selectedBodyId);

  const data = useMemo(() => {
    if (!selected) return null;
    return ephemerisApi.getSolarSystem().bodies.find((b) => b.id === selected) ?? null;
  }, [selected]);

  if (!selected || !data) {
    return (
      <div data-testid="info-panel-empty">
        <h3 className="text-body-sm text-fg-secondary mb-2">천체 정보</h3>
        <p className="text-caption text-fg-tertiary">
          좌측 트리에서 천체를 선택하면 상세 정보가 표시됩니다.
        </p>
      </div>
    );
  }

  const G = 6.6743e-11;
  const muParent = data.orbit ? G * (data.mass + 0) : null;
  const periodSeconds = data.orbit
    ? 2 * Math.PI * Math.sqrt(data.orbit.semiMajorAxis ** 3 / (G * 1.98892e30))
    : null;

  void muParent; // 향후 활용

  return (
    <div data-testid="info-panel" className="flex flex-col gap-3">
      <div>
        <div className="flex items-center gap-2">
          <span
            className="inline-block w-3 h-3 rounded-full"
            style={{ background: data.colorHint?.hex ?? '#888' }}
            aria-hidden
          />
          <h2 className="font-display text-h4 text-fg-primary">{data.nameKo}</h2>
          <span className="text-caption text-fg-tertiary">{data.nameEn}</span>
        </div>
        <div className="text-caption text-fg-tertiary">{KIND_LABEL[data.kind] ?? data.kind}</div>
      </div>

      <dl className="flex flex-col gap-2 text-body-sm">
        <Row label="질량" value={`${formatExp(data.mass)} kg`} />
        <Row label="반경" value={`${formatExp(data.radius)} m`} />
        {data.orbit && (
          <>
            <Row label="궤도 장반경" value={`${(data.orbit.semiMajorAxis / AU).toFixed(4)} AU`} />
            <Row label="이심률" value={data.orbit.eccentricity.toFixed(5)} />
            <Row
              label="경사각"
              value={`${((data.orbit.inclination * 180) / Math.PI).toFixed(3)}°`}
            />
            {periodSeconds && <Row label="공전주기" value={formatDays(periodSeconds)} />}
          </>
        )}
      </dl>

      <div className="mt-4 pt-3 border-t border-border-subtle">
        <MassSlider />
      </div>
    </div>
  );
}

function Row({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border-subtle/50 pb-1">
      <dt className="text-caption text-fg-tertiary">{label}</dt>
      <dd className="flex items-center gap-2">
        <span className="num text-fg-primary">{value}</span>
        <TierBadge tier={1} />
      </dd>
    </div>
  );
}
