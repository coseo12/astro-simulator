'use client';

import { ephemeris as ephemerisApi } from '@astro-simulator/core';
import { AU } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { getBodyScale } from '@/constants/body-scale';
import { TierBadge } from '../ui/tier-badge';
import { MassSlider } from './mass-slider';
import { useMemo } from 'react';

const KIND_LABEL: Record<string, string> = {
  star: '항성',
  planet: '행성',
  'dwarf-planet': '왜소행성',
  moon: '위성',
  comet: '혜성',
};

// P10-B-2 #274 — colorSource 3종 한국어 라벨.
const COLOR_SOURCE_LABEL: Record<string, string> = {
  observed: '관측',
  artistic: '아티스트',
  inferred: '추론',
};

function formatUncertainty(value: number): string {
  // 상대 오차 (0.05 = ±5%) — percent 표시
  return `±${(value * 100).toFixed(value < 0.01 ? 2 : 1)}%`;
}

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

  // R1 #329 — body 별 시각 과장 배수. 1.0 (실측) 이면 과장 안내 미표시.
  const visualScale = getBodyScale(data.id);
  const isExaggerated = visualScale !== 1.0;

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
        <Row
          label="질량"
          value={`${formatExp(data.mass)} kg`}
          uncertainty={data.uncertainty?.mass}
        />
        <Row
          label="반경"
          value={`${formatExp(data.radius)} m`}
          uncertainty={data.uncertainty?.radius}
        />
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
        {/* R1 #329 — 항성 한정 추가 정보 (luminosity / spectral class). solar-system.json 스키마 확장은
            후속 이슈로 분리 (R1 좁은 범위 보호) — 현재는 sun 단일 항성이라 info-panel 한정 박제. */}
        {data.id === 'sun' && (
          <>
            <Row label="광도" value="3.828 × 10²⁶ W (1.0 L☉)" />
            <Row label="분광형" value="G2V" />
          </>
        )}
      </dl>

      {/* R1 #329 — 시각 과장 안내. Gemini 교차검증 개선 제안 2 반영 (사용자 친화 표현 우선).
          ADR `docs/decisions/20260425-r1-sun-visualization.md` Developer 인계 §7. */}
      {isExaggerated && (
        <div
          data-testid="info-panel-visual-scale"
          className="mt-2 px-2 py-1.5 bg-bg-elevated/60 backdrop-blur rounded-sm border border-border-subtle text-caption text-fg-secondary"
        >
          <span className="text-fg-tertiary">표시 크기 · </span>
          <span className="num text-fg-primary">실제의 {visualScale}배</span>
          <span className="text-fg-tertiary"> (가시성 보정)</span>
        </div>
      )}

      {/* P10-C-3 #278 — P10-B 감사 메타데이터 (dataSource / lastVerified / colorSource) */}
      {(data.dataSource || data.lastVerified || data.colorHint?.colorSource) && (
        <div
          className="mt-3 pt-3 border-t border-border-subtle"
          data-testid="info-panel-audit-fields"
        >
          <h3 className="text-caption text-fg-tertiary mb-2">데이터 출처</h3>
          <dl className="flex flex-col gap-1 text-body-sm">
            {data.dataSource && (
              <AuditRow
                label="출처"
                value={
                  typeof data.dataSource === 'string'
                    ? data.dataSource
                    : data.dataSource.join(' / ')
                }
                testId="audit-data-source"
              />
            )}
            {data.lastVerified && (
              <AuditRow label="최종 검증" value={data.lastVerified} testId="audit-last-verified" />
            )}
            {data.colorHint?.colorSource && (
              <AuditRow
                label="색상 출처"
                value={COLOR_SOURCE_LABEL[data.colorHint.colorSource] ?? data.colorHint.colorSource}
                testId="audit-color-source"
              />
            )}
          </dl>
        </div>
      )}

      <div className="mt-4 pt-3 border-t border-border-subtle">
        <MassSlider />
      </div>
    </div>
  );
}

function Row({
  label,
  value,
  uncertainty,
}: {
  label: string;
  value: string;
  uncertainty?: number;
}) {
  return (
    <div className="flex items-baseline justify-between gap-2 border-b border-border-subtle/50 pb-1">
      <dt className="text-caption text-fg-tertiary">{label}</dt>
      <dd className="flex items-center gap-2">
        <span className="num text-fg-primary">{value}</span>
        {uncertainty !== undefined && (
          <span
            className="num text-caption text-fg-tertiary"
            data-testid="audit-uncertainty"
            title="IAU 공식값 부재 — 상대 오차"
          >
            {formatUncertainty(uncertainty)}
          </span>
        )}
        <TierBadge tier={1} />
      </dd>
    </div>
  );
}

function AuditRow({ label, value, testId }: { label: string; value: string; testId: string }) {
  return (
    <div className="flex items-baseline justify-between gap-2">
      <dt className="text-caption text-fg-tertiary shrink-0">{label}</dt>
      <dd
        className="num text-caption text-fg-secondary text-right truncate"
        data-testid={testId}
        title={value}
      >
        {value}
      </dd>
    </div>
  );
}
