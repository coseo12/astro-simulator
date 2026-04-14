'use client';

import type { ReactNode } from 'react';

/**
 * TopBar — 48px 높이 고정.
 * 좌: 로고/모드 스위처 (D2)
 * 우: 설정/유저 (P1 범위 밖)
 */
export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  return (
    <header
      className="absolute top-0 inset-x-0 h-12 flex items-center justify-between px-3 z-[var(--z-hud)] pointer-events-none"
      data-testid="topbar"
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
