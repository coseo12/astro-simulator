'use client';

import { time as timeApi } from '@astro-simulator/core';
import { useSimStore } from '@/store/sim-store';
import { useSimCommand } from '@/core/sim-context';
import { Pause, Play, Rewind, FastForward } from 'lucide-react';

interface ScalePreset {
  label: string;
  value: number;
}

const SCALE_PRESETS: ScalePreset[] = [
  { label: '1s', value: timeApi.TimeScalePreset.REAL_TIME },
  { label: '1h', value: timeApi.TimeScalePreset.HOUR_PER_SEC },
  { label: '1d', value: timeApi.TimeScalePreset.DAY_PER_SEC },
  { label: '1M', value: timeApi.TimeScalePreset.MONTH_PER_SEC },
  { label: '1y', value: timeApi.TimeScalePreset.YEAR_PER_SEC },
  { label: '10y', value: timeApi.TimeScalePreset.DECADE_PER_SEC },
];

/**
 * TimeBar 제어: 재생/일시정지/역행 + 속도 프리셋 + 현재 UTC.
 * 로그 스크러버는 추후 확장 (P1에서는 기본 제어만).
 */
export function TimeControls() {
  const julianDate = useSimStore((s) => s.julianDate);
  const scale = useSimStore((s) => s.timeScale);
  const sendCommand = useSimCommand();

  const setScale = (v: number) => sendCommand({ type: 'setTimeScale', scale: v });
  // pause/play는 scale 기반으로 구현 — 0이면 정지, 이전 배율 복원
  const lastScale = scale !== 0 ? scale : timeApi.TimeScalePreset.DAY_PER_SEC;
  const play = () => setScale(lastScale);
  const pause = () => setScale(0);

  const utcString =
    julianDate !== null ? timeApi.julianDateToIso(julianDate).slice(0, 19) + 'Z' : '—';
  const isPaused = scale === 0;
  const isReverse = scale < 0;

  return (
    <div className="flex items-center gap-2" data-testid="time-controls">
      <div className="flex items-center gap-1">
        <button
          type="button"
          data-testid="time-reverse"
          onClick={() => setScale(-Math.abs(scale || timeApi.TimeScalePreset.DAY_PER_SEC))}
          className={`p-1 rounded-sm border transition-colors ${
            isReverse
              ? 'bg-primary/20 border-primary/40 text-fg-primary'
              : 'bg-bg-surface/80 border-border-subtle text-fg-secondary hover:bg-bg-elevated'
          }`}
          aria-label="역행"
        >
          <Rewind size={14} />
        </button>
        <button
          type="button"
          data-testid={isPaused ? 'time-play' : 'time-pause'}
          onClick={isPaused ? play : pause}
          className="p-1 rounded-sm border bg-bg-surface/80 border-border-subtle text-fg-primary hover:bg-bg-elevated transition-colors"
          aria-label={isPaused ? '재생' : '일시정지'}
        >
          {isPaused ? <Play size={14} /> : <Pause size={14} />}
        </button>
        <button
          type="button"
          data-testid="time-forward"
          onClick={() => setScale(Math.abs(scale || timeApi.TimeScalePreset.DAY_PER_SEC))}
          className={`p-1 rounded-sm border transition-colors ${
            !isReverse && !isPaused
              ? 'bg-primary/20 border-primary/40 text-fg-primary'
              : 'bg-bg-surface/80 border-border-subtle text-fg-secondary hover:bg-bg-elevated'
          }`}
          aria-label="전진"
        >
          <FastForward size={14} />
        </button>
      </div>

      <div className="flex items-center gap-1 border-l border-border-subtle pl-2">
        {SCALE_PRESETS.map((p) => {
          const active = Math.abs(scale) === p.value;
          return (
            <button
              key={p.label}
              type="button"
              data-testid={`time-preset-${p.label}`}
              onClick={() => setScale((isReverse ? -1 : 1) * p.value)}
              className={`num text-caption px-2 py-0.5 rounded-xs border transition-colors ${
                active
                  ? 'bg-primary/20 border-primary/40 text-fg-primary'
                  : 'bg-transparent border-border-subtle text-fg-secondary hover:bg-bg-elevated'
              }`}
              title={`초당 ${p.label}`}
            >
              {p.label}
            </button>
          );
        })}
      </div>

      <div
        className="num text-caption text-fg-secondary border-l border-border-subtle pl-2"
        data-testid="time-utc"
      >
        {utcString}
      </div>
    </div>
  );
}
