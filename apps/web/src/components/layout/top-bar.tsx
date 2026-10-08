'use client';

import { useCallback, useEffect, useId, useRef, useState, type ReactNode } from 'react';
import { Ellipsis } from 'lucide-react';
import { useSimStore } from '@/store/sim-store';
import { useMouseInactivity } from '@/hooks/use-mouse-inactivity';

/** 관찰 모드 자동 숨김까지의 마우스 비활성 시간 (ms). */
const AUTO_HIDE_INACTIVITY_MS = 3000;

/**
 * #1313 — 우측 그룹 오버플로 메뉴가 동작하는 폭의 경계. Tailwind `sm` (640px) 과 같은 값이어야 한다 — 「⋯」 버튼 ·
 * 펼친 패널은 `max-sm:` 클래스로만 보이므로, 이 경계를 넘어 넓어지면 열림 상태를 버린다 (자동 숨김 억제가 남지 않게).
 */
const OVERFLOW_MENU_DISABLED_QUERY = '(min-width: 640px)';

/**
 * TopBar — 48px 높이 고정.
 * 관찰 모드 + 마우스 3초 비활성 시 페이드아웃 (UI 자기 숨김).
 * #1265 — 표시 패널이 열려 있는 동안은 숨기지 않는다 (조작 중인 패널의 트리거가 사라지지 않게 — 계약 D4).
 * #1281 — 천체 메뉴가 열려 있는 동안도 같은 이유로 숨기지 않는다 (계약 D7). 터치(`pointerdown`)도 활동으로 센다
 *   (`use-mouse-inactivity.ts`).
 * #1313 — 모바일(`max-sm`) 에서는 우측 그룹을 「⋯」 버튼 뒤 패널로 접는다. 열린 동안도 숨기지 않는다.
 */
export function TopBar({ left, right }: { left?: ReactNode; right?: ReactNode }) {
  const mode = useSimStore((s) => s.mode);
  const displayPanelOpen = useSimStore((s) => s.displayPanelOpen);
  const bodyMenuOpen = useSimStore((s) => s.bodyMenuOpen);
  const inactive = useMouseInactivity(AUTO_HIDE_INACTIVITY_MS);
  const [overflowOpen, setOverflowOpen] = useState(false);
  const overflowToggleRef = useRef<HTMLButtonElement | null>(null);
  const rightGroupId = useId();
  const hidden =
    mode === 'observe' && inactive && !displayPanelOpen && !bodyMenuOpen && !overflowOpen;

  const closeOverflow = useCallback((restoreFocus: boolean) => {
    setOverflowOpen(false);
    if (restoreFocus) overflowToggleRef.current?.focus();
  }, []);

  // 열린 동안만 전역 리스너 — Esc (capture) · 캔버스 pointerdown · sm 이상으로 넓어짐.
  useEffect(() => {
    if (!overflowOpen) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      // 위에 떠 있는 것이 먼저 닫힌다 — 모달 · 표시 패널 · 천체 메뉴가 열려 있으면 그쪽 Esc 에 양보한다. 이 리스너는
      // 그것들보다 먼저 열려 먼저 등록되므로 (같은 window capture) 순서가 아니라 상태로 물러난다.
      const st = useSimStore.getState();
      if (
        st.displayPanelOpen ||
        st.bodyMenuOpen ||
        document.querySelector('[data-modal-open="true"]')
      ) {
        return;
      }
      // `preventDefault` — `focus-quick-buttons` 의 Esc→자유시점 리스너 (bubble) 가 물러나는 신호 (공용 Modal 과 같다).
      e.preventDefault();
      closeOverflow(true);
    };
    // 캔버스를 누르면 닫는다 (장면 조작으로 돌아감). 그 밖 — 패널 안 컨트롤이 연 모달 · 표시 패널 (portal) 등 — 은
    // 닫지 않는다: 패널을 닫으면 그 트리거가 사라져 하위 팝오버의 기준점 · 포커스 복원 대상이 없어진다.
    const onPointerDown = (e: PointerEvent) => {
      if (e.target instanceof HTMLCanvasElement) closeOverflow(false);
    };
    const wideQuery = window.matchMedia?.(OVERFLOW_MENU_DISABLED_QUERY);
    const onWide = () => {
      if (wideQuery?.matches) closeOverflow(false);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    wideQuery?.addEventListener('change', onWide);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      wideQuery?.removeEventListener('change', onWide);
    };
  }, [overflowOpen, closeOverflow]);

  return (
    <header
      // #1313 — 오버플로 패널이 열린 동안은 드롭다운 층으로 올린다. 같은 `z-hud` 층의 뒤 형제 (HUD 코너의 엔진 알림 ·
      // JD 표기) 가 헤더 아래로 펼친 패널 위에 그려졌다 (375 실측). 표시 패널 (portal, 같은 층 · 뒤 DOM) 은 여전히 위다.
      className={`absolute top-0 inset-x-0 h-12 flex items-center justify-between gap-2 px-3 ${
        overflowOpen ? 'z-[var(--z-dropdown)]' : 'z-[var(--z-hud)]'
      } pointer-events-none`}
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
          1440 미만에서는 카메라 · 북마크 · 조작 가이드를 아이콘만 보인다 — 라벨을 다 보이면 macOS 폰트에서 여유 38px 였지만
          Linux 폰트(CI ubuntu)에서는 우측이 약 57px 더 넓어 `?` 가 1286.6 으로 밀렸다 (PR #1283 리뷰 B1). 폴백은 날짜 오류 문구
          같은 일시적 폭 증가를 흡수하는 안전망이고, 375 에서는 상시 스크롤러다.
          내부 래퍼(`app-shell.tsx`)는 `w-max` 라 flex 축소가 버튼 글자를 세로로 누르지 않는다 (#887 의 28×76 눌림).

          제목은 1440 미만에서 숨긴다 — 1280 에서 좌우 합이 가용폭에 들어가게 하는 92px (위 여유 계산의 전제).

          #1313 — 375 에서 그 스크롤러의 가시폭은 50px (360 은 35px) 이라 12 개 컨트롤이 전부 시야 밖이었다 (내용폭 731px,
          스크롤바 없는 스와이프로만 도달). 모바일(`max-sm`) 에서는 우측 그룹을 「⋯」 버튼 뒤로 접고, 누르면 **같은 DOM**
          이 헤더 아래 패널로 줄바꿈해 펼쳐진다 (복제 렌더 없음 — 모달 · 표시 패널 트리거가 하나뿐이어야 한다). sm 이상은
          「⋯」 가 `display: none` 이고 우측 그룹 클래스도 그대로다. */}
      <div className="flex items-center gap-2 pointer-events-auto shrink-0">
        <span className="font-display text-body-sm text-fg-primary tracking-tight shrink-0 max-[1439px]:hidden">
          astro-simulator
        </span>
        {left}
      </div>
      <button
        ref={overflowToggleRef}
        type="button"
        data-testid="topbar-overflow-toggle"
        aria-label="도구 더 보기 (날짜 · 엔진 · 설정 · 표시 · 북마크 · 도움말)"
        aria-expanded={overflowOpen}
        aria-controls={rightGroupId}
        title="도구 더 보기"
        onClick={() => setOverflowOpen((open) => !open)}
        className="sm:hidden pointer-events-auto shrink-0 inline-flex items-center justify-center min-w-7 min-h-7 bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-1.5 text-fg-secondary hover:bg-bg-elevated transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        <Ellipsis size={14} aria-hidden="true" />
      </button>
      <div
        id={rightGroupId}
        data-testid="topbar-right"
        data-overflow-open={overflowOpen ? 'true' : undefined}
        className={`flex items-center gap-2 pointer-events-auto min-w-0 overflow-x-auto [scrollbar-width:none] ${
          overflowOpen
            ? 'max-sm:absolute max-sm:top-12 max-sm:inset-x-3 max-sm:flex-wrap max-sm:overflow-visible max-sm:bg-bg-surface max-sm:border max-sm:border-border-subtle max-sm:rounded-sm max-sm:p-2 max-sm:shadow-lg'
            : 'max-sm:hidden'
        }`}
      >
        {right}
      </div>
    </header>
  );
}
