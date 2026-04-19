'use client';

import { parseAsString, useQueryState } from 'nuqs';
import { useSimStore } from '@/store/sim-store';

/**
 * P6-B #190 — accretion disk 5 파라미터 슬라이더 패널.
 *
 * `?bh=2` URL 옵트인 시에만 표시. 슬라이더 값 변경은 store에 반영되고,
 * sim-canvas useEffect가 createBlackHoleRendering handles의 setDisk* 메서드를 호출.
 *
 * LUT 재생성 0회 — eccentricity/thickness/tilt/inner/outer 모두 셰이더 uniform만 갱신.
 *
 * #237 — `useQueryState` 로 URL 파라미터 구독 (`url-sync.tsx` 일관). 이전의
 * useState+useEffect+window.location 조합은 SSR-safe 목적이었으나 react-hooks
 * lint 규칙 위반 + 수동 파싱 부채가 있었다. nuqs 는 SSR 에서 null 반환하므로
 * 동일 hydration 안전성 유지.
 */
export function BlackHoleDiskPanel() {
  const params = useSimStore((s) => s.blackHoleDisk);
  const setParam = useSimStore((s) => s.setBlackHoleDiskParam);
  const reset = useSimStore((s) => s.resetBlackHoleDisk);

  const [bhMode] = useQueryState('bh', parseAsString.withOptions({ history: 'replace' }));

  // ?bh=2 옵트인일 때만 패널 표시 (P5-D `?bh=1`은 별도 PostProcess).
  if (bhMode !== '2') return null;

  return (
    <div data-testid="bh-disk-panel" className="flex flex-col gap-3">
      <div className="flex items-center justify-between">
        <span className="text-caption text-fg-secondary">Accretion Disk (P6-B)</span>
        <button
          type="button"
          data-testid="bh-disk-reset"
          onClick={reset}
          className="num text-caption px-1.5 py-0.5 rounded-xs bg-bg-elevated text-fg-secondary hover:bg-primary/20"
          title="기본값으로 리셋"
        >
          리셋
        </button>
      </div>

      <DiskSlider
        testId="bh-disk-inner"
        label="Inner radius"
        value={params.innerRs}
        unit="Rs"
        min={1.5}
        max={5}
        step={0.05}
        onChange={(v) => setParam('innerRs', v)}
      />
      <DiskSlider
        testId="bh-disk-outer"
        label="Outer radius"
        value={params.outerRs}
        unit="Rs"
        min={2}
        max={15}
        step={0.1}
        onChange={(v) => setParam('outerRs', v)}
      />
      <DiskSlider
        testId="bh-disk-eccentricity"
        label="Eccentricity"
        value={params.eccentricity}
        unit=""
        min={0}
        max={0.9}
        step={0.01}
        onChange={(v) => setParam('eccentricity', v)}
      />
      <DiskSlider
        testId="bh-disk-thickness"
        label="Thickness"
        value={params.thicknessRs}
        unit="Rs"
        min={0.02}
        max={1}
        step={0.01}
        onChange={(v) => setParam('thicknessRs', v)}
      />
      <DiskSlider
        testId="bh-disk-tilt"
        label="Tilt"
        value={params.tiltDeg}
        unit="°"
        min={0}
        max={90}
        step={1}
        onChange={(v) => setParam('tiltDeg', v)}
      />
    </div>
  );
}

interface DiskSliderProps {
  testId: string;
  label: string;
  value: number;
  unit: string;
  min: number;
  max: number;
  step: number;
  onChange: (v: number) => void;
}

function DiskSlider({ testId, label, value, unit, min, max, step, onChange }: DiskSliderProps) {
  return (
    <div data-testid={testId} className="flex flex-col gap-1">
      <div className="flex items-center justify-between">
        <span className="text-caption text-fg-secondary">{label}</span>
        <span className="text-caption num text-fg-primary">
          {value.toFixed(2)}
          {unit ? ` ${unit}` : ''}
        </span>
      </div>
      <input
        type="range"
        data-testid={`${testId}-input`}
        aria-label={label}
        min={min}
        max={max}
        step={step}
        value={value}
        onChange={(e) => onChange(Number(e.target.value))}
        className="w-full accent-primary"
      />
    </div>
  );
}
