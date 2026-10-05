'use client';

import type { ReactNode } from 'react';

/**
 * TimeBar — 64px 높이 고정 (기본 관찰 모드에서는 축소된 컨트롤만).
 * D5 (#24)에서 풀 스크러버로 확장.
 */
export function TimeBar({ children }: { children?: ReactNode }) {
  return (
    <footer
      className="absolute bottom-0 inset-x-0 h-16 flex items-center justify-center gap-2 px-3 max-sm:px-2 z-[var(--z-hud)] pointer-events-none"
      data-testid="timebar"
    >
      {/* #1281 — `max-w-full min-w-0`: 내용이 가용폭을 넘으면 `justify-center` 가 래퍼를 좌측 화면 밖으로 밀어 역행 버튼이
          x=-42 에 놓였다 (375 실측, 계약 D9(c)). 래퍼를 가용폭에 묶어 넘침은 안쪽 `time-controls` 의 가로 스크롤이 되게 한다.
          #1288 D9 — `max-sm:px-2` (바깥·안쪽 각 4px×2): 「지금」·100y 추가분을 375 가용폭 안에 담는 압축의 일부. */}
      <div className="pointer-events-auto flex max-w-full min-w-0 items-center gap-2 bg-bg-surface/60 backdrop-blur border border-border-subtle rounded-md px-3 max-sm:px-2 py-2">
        {children ?? (
          <span className="text-caption text-fg-secondary num">TimeBar — D5에서 구현</span>
        )}
      </div>
    </footer>
  );
}
