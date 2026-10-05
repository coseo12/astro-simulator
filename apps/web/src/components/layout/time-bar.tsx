'use client';

import type { ReactNode } from 'react';

/**
 * TimeBar — 64px 높이 고정 (`h-16`). 정보 카드(`bottom-20`)·연구 패널(`bottom-16`)·토스트가 이 높이를 전제로 놓인다.
 *
 * #1288 D9 — 2행 상시 표시: 1행 재생·배속·「지금」(`TimeControls`), 2행 1900~2100 스크러버(`TimeScrubber`).
 * 2행을 넣고도 바깥 높이 64px 를 유지한다 — 종전에는 1행 패널(약 44px)을 64px 안 가운데에 띄웠고, 이제 패널을
 * 아래에 붙이고(`items-end` + `pb-2`) 위아래 패딩을 2행이 나눠 쓴다. 캔버스 가림은 패널 높이 증가분만큼만 는다.
 */
export function TimeBar({ children }: { children?: ReactNode }) {
  return (
    <footer
      className="absolute bottom-0 inset-x-0 h-16 flex items-end justify-center gap-2 px-3 pb-2 max-sm:px-2 z-[var(--z-hud)] pointer-events-none"
      data-testid="timebar"
    >
      {/* #1281 — `max-w-full min-w-0`: 내용이 가용폭을 넘으면 `justify-center` 가 래퍼를 좌측 화면 밖으로 밀어 역행 버튼이
          x=-42 에 놓였다 (375 실측, 계약 D9(c)). 래퍼를 가용폭에 묶어 넘침은 안쪽 `time-controls` 의 가로 스크롤이 되게 한다.
          #1288 D9 — `max-sm:px-2` (바깥·안쪽 각 4px×2): 「지금」·100y 추가분을 375 가용폭 안에 담는 압축의 일부.
          #1288 D9 — `flex-col items-stretch`: 2행 폭은 1행 폭을 따른다. 아래 패딩 0 은 2행(높이 24px, 트랙 4px)이
          트랙 아래로 10px 여백을 이미 품고 있어서다. */}
      <div className="pointer-events-auto flex max-w-full min-w-0 flex-col items-stretch bg-bg-surface/60 backdrop-blur border border-border-subtle rounded-md px-3 max-sm:px-2 pt-1.5 pb-0">
        {children ?? (
          <span className="text-caption text-fg-secondary num">TimeBar — D5에서 구현</span>
        )}
      </div>
    </footer>
  );
}
