'use client';

import type { ReactNode } from 'react';

/**
 * TimeBar — 64px 높이 고정 (기본 관찰 모드에서는 축소된 컨트롤만).
 * D5 (#24)에서 풀 스크러버로 확장.
 */
export function TimeBar({ children }: { children?: ReactNode }) {
  return (
    <footer
      className="absolute bottom-0 inset-x-0 h-16 flex items-center justify-center gap-2 px-3 z-[var(--z-hud)] pointer-events-none"
      data-testid="timebar"
    >
      <div className="pointer-events-auto flex items-center gap-2 bg-bg-surface/60 backdrop-blur border border-border-subtle rounded-md px-3 py-2">
        {children ?? (
          <span className="text-caption text-fg-tertiary num">TimeBar — D5에서 구현</span>
        )}
      </div>
    </footer>
  );
}
