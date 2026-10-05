'use client';

import { useSimStore } from '@/store/sim-store';
import { useMouseInactivity } from '@/hooks/use-mouse-inactivity';
import type { ReactNode } from 'react';

/** 관찰 모드 자동 숨김까지의 마우스 비활성 시간 (ms). */
const AUTO_HIDE_INACTIVITY_MS = 3000;

/**
 * TopBar — 48px 높이 고정.
 * 관찰 모드 + 마우스 3초 비활성 시 페이드아웃 (UI 자기 숨김).
 * #1265 — 표시 패널이 열려 있는 동안은 숨기지 않는다 (조작 중인 패널의 트리거가 사라지지 않게 — 계약 D4).
 * #1281 — 천체 메뉴가 열려 있는 동안도 같은 이유로 숨기지 않는다 (계약 D7). 터치(`pointerdown`)도 활동으로 센다
 *   (`use-mouse-inactivity.ts`).
 */
export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const mode = useSimStore((s) => s.mode);
  const displayPanelOpen = useSimStore((s) => s.displayPanelOpen);
  const bodyMenuOpen = useSimStore((s) => s.bodyMenuOpen);
  const inactive = useMouseInactivity(AUTO_HIDE_INACTIVITY_MS);
  const hidden = mode === 'observe' && inactive && !displayPanelOpen && !bodyMenuOpen;

  return (
    <header
      className="absolute top-0 inset-x-0 h-12 flex items-center justify-between gap-2 px-3 z-[var(--z-hud)] pointer-events-none"
      data-testid="topbar"
      data-r1-region="top-nav"
      style={{
        opacity: hidden ? 0 : 1,
        transition: 'opacity var(--duration-normal) var(--ease-out)',
      }}
    >
      {/* #1281 — 넘칠 때 숨는 쪽을 **우측으로 통일**한다 (모든 폭 공통 규칙 — 종전 `max-sm:` 분기 소멸).

          좌측(모드 · 천체 메뉴 · reset · 탐색 · 궤도선)은 `shrink-0` 로 상시 보존한다. 천체 메뉴는 대체 경로가 없는
          진입점이고 (종전 좌측 스크롤러는 1280 폭에서 천체 12개 중 11개를 우측 그룹 아래로 밀어 클릭 불가 — 이슈 감사),
          메뉴로 합친 뒤 좌측 폭은 1280 에서 354px · 1440 이상 454px 로 고정된다 (#1281 PR2 실측).
          우측(날짜 · 엔진 · 설정 버튼)은 `min-w-0 overflow-x-auto` — 가용폭이 모자랄 때만 가로 스크롤로 폴백한다.
          1280 여유 약 38px (우측 856px 실측 — 날짜 오류 문구 같은 일시적 폭 증가는 이 폴백이 흡수), 375 에서는 상시 스크롤러다.
          내부 래퍼(`app-shell.tsx`)는 `w-max` 라 flex 축소가 버튼 글자를 세로로 누르지 않는다 (#887 의 28×76 눌림).

          제목은 1440 미만에서 숨긴다 — 1280 에서 좌우 합이 가용폭에 들어가게 하는 92px (위 여유 계산의 전제). */}
      <div className="flex items-center gap-2 pointer-events-auto shrink-0">
        <span className="font-display text-body-sm text-fg-primary tracking-tight shrink-0 max-[1439px]:hidden">
          astro-simulator
        </span>
        {left}
      </div>
      <div
        data-testid="topbar-right"
        className="flex items-center gap-2 pointer-events-auto min-w-0 overflow-x-auto [scrollbar-width:none]"
      >
        {right}
      </div>
    </header>
  );
}
