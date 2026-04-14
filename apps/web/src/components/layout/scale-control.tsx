'use client';

import * as Slider from '@radix-ui/react-slider';
import { useState } from 'react';
import { useSimCommand } from '@/core/sim-context';

/**
 * 카메라 거리(로그 스케일) 슬라이더.
 *
 * 로그 범위 0.01 AU ~ 100 AU (근접 ~ 해왕성 외곽).
 * 드래그 → core.command('setCameraRadius'). 마우스 휠 역방향 반영은
 * P2 개선 (현재는 단방향 제어로 MVP 충족).
 */
const LOG_MIN = -2;
const LOG_MAX = 2;

export function ScaleControl() {
  const [value, setValue] = useState<number>(Math.log10(35));
  const sendCommand = useSimCommand();

  const handleChange = (v: number[]) => {
    const logV = v[0];
    if (logV === undefined) return;
    setValue(logV);
    sendCommand({ type: 'setCameraRadius', radius: Math.pow(10, logV) });
  };

  const displayAU = Math.pow(10, value);

  return (
    <div
      data-testid="scale-control"
      className="absolute top-1/2 -translate-y-1/2 right-3 flex flex-col items-center gap-2 z-[var(--z-hud)] pointer-events-auto"
    >
      <span className="num text-caption text-fg-tertiary bg-bg-surface/70 backdrop-blur px-1.5 py-0.5 rounded-xs border border-border-subtle">
        {displayAU < 1 ? `${(displayAU * 1000).toFixed(0)} mAU` : `${displayAU.toFixed(1)} AU`}
      </span>
      <Slider.Root
        orientation="vertical"
        value={[value]}
        min={LOG_MIN}
        max={LOG_MAX}
        step={0.01}
        onValueChange={handleChange}
        className="relative flex items-center justify-center select-none touch-none w-5 h-48"
      >
        <Slider.Track className="relative grow w-1 rounded-full bg-bg-elevated">
          <Slider.Range className="absolute w-full bg-primary/50 rounded-full" />
        </Slider.Track>
        <Slider.Thumb
          data-testid="scale-thumb"
          className="block w-3 h-3 rounded-full bg-primary shadow-md focus:outline-none focus:ring-2 focus:ring-primary/50"
          aria-label="카메라 거리"
        />
      </Slider.Root>
    </div>
  );
}
