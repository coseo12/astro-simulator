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
      data-r1-region="top-nav"
      style={{
        opacity: hidden ? 0 : 1,
        transition: 'opacity var(--duration-normal) var(--ease-out)',
      }}
    >
      {/* #887 — spacing 유틸 발효 후 1280px 에서 좌+우 콘텐츠 합(~1517px)이 뷰포트를 초과한다.
          리셋 무효 시절엔 padding 0 으로 우연히 rightEdge=1280 에 딱 맞았던 레이아웃 (before 실측).

          데스크톱(≥640px): left(focus 퀵버튼 13개 — "임시" 영역, canvas 직접 클릭 #713 대체 경로
          존재)만 가로 스크롤로 양보하고, right(설정/가이드/물리엔진 — 대체 경로 없는 기능 버튼)는
          shrink-0 으로 상시 보존. flex 최소폭 왜곡(버튼 28×76 세로 눌림 실측) 차단이 min-w-0 +
          overflow 의 목적.

          모바일(<640px, max-sm): right 를 shrink-0 으로 두면 351px 컨테이너를 독식해 left 스크롤러가
          w=0 으로 소멸 — focus 버튼이 CSS visible 인데 hittable 불가 (fps-baseline mobile 가드
          TimeoutError 실측, 리뷰 라운드 2). right 도 스크롤러화해 두 그룹이 폭을 나눠 갖게 한다
          (각각 폭 > 0 스크롤러 → 전 버튼이 가로 스크롤로 접근 가능, 눌림 왜곡 없음). */}
      <div className="flex items-center gap-2 pointer-events-auto min-w-0 overflow-x-auto [scrollbar-width:none]">
        <span className="font-display text-body-sm text-fg-primary tracking-tight shrink-0">
          astro-simulator
        </span>
        {left}
      </div>
      <div className="flex items-center gap-2 pointer-events-auto shrink-0 max-sm:shrink max-sm:min-w-0 max-sm:overflow-x-auto max-sm:[scrollbar-width:none]">
        {right}
      </div>
    </header>
  );
}
