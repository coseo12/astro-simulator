'use client';

import { useSimStore } from '@/store/sim-store';
import { useMouseInactivity } from '@/hooks/use-mouse-inactivity';
import type { ReactNode } from 'react';

/**
 * TopBar — 48px 높이 고정.
 * 관찰 모드 + 마우스 3초 비활성 시 페이드아웃 (UI 자기 숨김).
 */
export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const mode = useSimStore((s) => s.mode);
  const inactive = useMouseInactivity(3000);
  const hidden = mode === 'observe' && inactive;

  return (
    <header
      className="absolute top-0 inset-x-0 h-12 flex items-center justify-between px-3 z-[var(--z-hud)] pointer-events-none"
      data-testid="topbar"
      style={{
        opacity: hidden ? 0 : 1,
        transition: 'opacity var(--duration-normal) var(--ease-out)',
      }}
    >
      <div className="flex items-center gap-2 pointer-events-auto">
        <span className="font-display text-body-sm text-fg-primary tracking-tight">
          astro-simulator
        </span>
        {left}
      </div>
      <div className="flex items-center gap-2 pointer-events-auto">{right}</div>
    </header>
  );
}
