'use client';

import {
  useCallback,
  useEffect,
  useId,
  useRef,
  useState,
  type FocusEvent as ReactFocusEvent,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { createPortal } from 'react-dom';
import { ChevronDown } from 'lucide-react';
import type { SimMode } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { useSwitchMode } from '@/core/use-switch-mode';
import { nextFocusableAfter } from '@/lib/focus-trap';

interface ModeDef {
  id: SimMode;
  label: string;
  enabled: boolean;
  tooltip?: string;
}

const MODES: ModeDef[] = [
  { id: 'observe', label: '관찰', enabled: true },
  { id: 'research', label: '연구', enabled: true },
  // #1390 PR1 — 가이드 투어 (ADR `20261021-1390`). 투어 카드 (`tour-card.tsx`) 가 교육 모드에서만 보인다.
  { id: 'education', label: '교육', enabled: true },
  { id: 'sandbox', label: '샌드박스', enabled: false, tooltip: 'P2+ 예정' },
];

/** 모바일 모드 메뉴 — 트리거 아래 간격 (px). */
const MENU_GAP_PX = 4;
/** 메뉴가 뷰포트 가장자리에 붙지 않게 두는 최소 여백 (px). */
const VIEWPORT_MARGIN_PX = 8;
/** 메뉴 폭 (px) — 가장 긴 줄 「샌드박스 · P2+ 예정」 이 한 줄에 들어가는 고정값. 우측 clamp 계산에 쓴다. */
const MENU_WIDTH_PX = 168;

/** 메뉴가 열릴 때 포커스를 둘 항목 — APG Menu Button: Enter/Space/↓ = 현재 모드, ↑ = 마지막 활성 항목. */
type OpenFocus = 'selected' | 'last';

interface MenuPosition {
  top: number;
  left: number;
}

/** 트리거 좌측 정렬 + 뷰포트 안쪽 clamp (`body-menu.tsx` 와 같은 규칙 — 항목 4개라 세로 스크롤은 두지 않는다). */
function resolveMenuPosition(trigger: HTMLElement): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const maxLeft = window.innerWidth - MENU_WIDTH_PX - VIEWPORT_MARGIN_PX;
  return {
    top: rect.bottom + MENU_GAP_PX,
    left: Math.max(VIEWPORT_MARGIN_PX, Math.min(rect.left, maxLeft)),
  };
}

/**
 * ModeSwitcher — 4모드 중 하나 선택.
 * observe/research/education (#1390 PR1) 활성화. sandbox는 비활성 (tooltip).
 * 선택 시 html[data-mode] 속성 갱신 → design-tokens CSS Variables 자동 전환.
 *
 * #1390 PR0 — 폭에 따라 두 표현 중 하나만 보인다 (CSS 분기 — 서버 · 클라 첫 렌더가 같아 hydration 분기가 없다).
 *   - `sm` 이상: 종전 그대로 모드 버튼 4개 (`mode-switcher`). 바뀐 클래스는 `max-sm:` 뿐이고 모바일 트리거는
 *     `sm:hidden` 이라 flex 간격도 차지하지 않는다 — 데스크톱 상단 바 좌표 회귀 0.
 *   - `max-sm`: 현재 모드 1개 + 펼침 메뉴 (`ModeMenuCompact`). 종전 (#1281) 은 비활성 모드만 숨겼는데, 교육을 켜면 그 숨김이
 *     풀려 좌측 그룹이 375 가용폭 351px 를 15px 넘긴다 (ADR `20261021-1390` 1-E). 메뉴로 접으면 상단 바 폭이 **모드 개수와
 *     무관**해진다 — 교육 활성 (PR1) 이 바 폭을 바꾸지 않는다.
 */
export function ModeSwitcher() {
  const mode = useSimStore((s) => s.mode);
  // #1281 — 관찰 모드 카드의 「자세히 → 연구 모드」와 같은 전환 경로.
  const switchMode = useSwitchMode();

  // mode → html data-mode 동기화 (layout에서 초기 observe 세팅하지만 변경 시 동기화 필요)
  useEffect(() => {
    if (typeof document !== 'undefined') {
      document.documentElement.setAttribute('data-mode', mode);
    }
  }, [mode]);

  const handleClick = (next: SimMode, enabled: boolean) => {
    if (!enabled) return;
    switchMode(next);
  };

  return (
    <>
      <div
        className="flex items-center gap-0.5 bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm p-0.5 overflow-x-auto whitespace-nowrap max-w-full max-sm:hidden"
        data-testid="mode-switcher"
      >
        {MODES.map((m) => {
          const active = mode === m.id;
          return (
            <button
              key={m.id}
              type="button"
              data-testid={`mode-${m.id}`}
              data-active={active}
              disabled={!m.enabled}
              title={m.tooltip}
              onClick={() => handleClick(m.id, m.enabled)}
              className={`num text-caption px-2 py-1 rounded-xs transition-colors min-w-6 min-h-6 shrink-0 ${
                active
                  ? 'bg-primary/25 text-fg-primary'
                  : m.enabled
                    ? 'text-fg-secondary hover:bg-bg-elevated'
                    : 'text-fg-disabled cursor-not-allowed'
              }`}
              style={{ transitionDuration: 'var(--duration-fast)' }}
            >
              {m.label}
            </button>
          );
        })}
      </div>
      <ModeMenuCompact mode={mode} onSelect={switchMode} />
    </>
  );
}

/**
 * #1390 PR0 — 모바일(`max-sm`) 모드 메뉴 버튼 (WAI-ARIA APG Menu Button). 골격은 천체 메뉴 (`body-menu.tsx`) 와 같고 이유도 같다:
 *   - `createPortal(document.body)` + `fixed` + `z-[var(--z-dropdown)]` — 조상 overflow · `z-hud` 쌓임 맥락 회피. 닫히면 언마운트.
 *   - 열림 상태는 store `modeMenuOpen` — 상단 바 자동 숨김 억제 · 「⋯」 오버플로 Esc 양보가 읽는다. 언마운트 시 닫는다.
 *   - 트리거 `aria-expanded` + 열린 동안만 `aria-controls` — #1380 캔버스 refocus 보호 (`lib/expanded-popup.ts`) 에 그대로 편입.
 *   - Esc 는 window capture + `preventDefault()` (자유시점 Esc 오발화 차단) · 메뉴 밖 pointerdown · resize · 포커스 이탈로 닫힘.
 *   - 항목 `menuitemradio` + 로빙 포커스 (↓↑ 순환 · Home/End · Tab 은 닫고 트리거 다음 요소).
 *
 * 비활성 모드 (샌드박스 — 교육은 #1390 PR1 에서 활성) 는 메뉴 안에 `disabled` 항목으로 남기고 사유 「P2+ 예정」 을 **보이는 글자**로 둔다 — 터치에는
 * `title` 툴팁이 없다. `sm` 이상에서는 `sm:hidden` 이라 트리거가 보이지 않는다 (resize 로 경계를 넘으면 열린 메뉴는 닫힌다).
 */
function ModeMenuCompact({ mode, onSelect }: { mode: SimMode; onSelect: (next: SimMode) => void }) {
  const open = useSimStore((s) => s.modeMenuOpen);
  const setOpen = useSimStore((s) => s.setModeMenuOpen);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openFocusRef = useRef<OpenFocus>('selected');
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const menuId = useId();
  const currentLabel = MODES.find((m) => m.id === mode)?.label ?? mode;

  const close = useCallback(
    (restoreFocus: boolean) => {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [setOpen],
  );

  const openMenu = (focus: OpenFocus) => {
    if (triggerRef.current) setPosition(resolveMenuPosition(triggerRef.current));
    openFocusRef.current = focus;
    setOpen(true);
  };

  /** 지금 누를 수 있는 항목 (비활성 모드는 포커스도 받지 않으므로 건너뛴다). */
  const enabledItems = () =>
    Array.from(
      menuRef.current?.querySelectorAll<HTMLButtonElement>(
        '[role="menuitemradio"]:not([disabled])',
      ) ?? [],
    );

  // 열린 동안만 전역 리스너 — Esc (capture) · 메뉴 밖 pointerdown · resize.
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      close(true);
    };
    const onPointerDown = (e: PointerEvent) => {
      const target = e.target;
      if (!(target instanceof Node)) return;
      if (menuRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
    // resize — `fixed` 좌표가 트리거와 어긋나는 것 + `sm` 경계를 넘어 트리거가 사라지는 것을 닫아서 없앤다.
    const onResize = () => close(false);
    window.addEventListener('keydown', onKeyDown, { capture: true });
    window.addEventListener('pointerdown', onPointerDown, { capture: true });
    window.addEventListener('resize', onResize);
    return () => {
      window.removeEventListener('keydown', onKeyDown, { capture: true });
      window.removeEventListener('pointerdown', onPointerDown, { capture: true });
      window.removeEventListener('resize', onResize);
    };
  }, [open, close]);

  // 열리면 항목으로 포커스 — 현재 모드 항목 (↑ 로 열었으면 마지막 활성 항목).
  useEffect(() => {
    if (!open) return;
    const items = enabledItems();
    if (items.length === 0) return;
    const target =
      openFocusRef.current === 'last'
        ? items[items.length - 1]
        : (items.find((el) => el.dataset.mode === mode) ?? items[0]);
    target?.focus();
    // 열린 순간 1회만.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open]);

  // 열린 채 언마운트되면 store 가 열림으로 남아 상단 바 자동 숨김이 영구 억제된다 — 수명 경계에서 닫는다.
  useEffect(() => () => setOpen(false), [setOpen]);

  const handleTriggerClick = () => {
    if (open) {
      close(false);
      return;
    }
    openMenu('selected');
  };

  // 트리거 ↓↑ — 열면서 포커스 위치를 정한다. Enter/Space 는 버튼 기본 동작(click)이 연다.
  const handleTriggerKeyDown = (e: ReactKeyboardEvent<HTMLButtonElement>) => {
    if (e.key !== 'ArrowDown' && e.key !== 'ArrowUp') return;
    e.preventDefault();
    const focus: OpenFocus = e.key === 'ArrowUp' ? 'last' : 'selected';
    if (!open) {
      openMenu(focus);
      return;
    }
    const items = enabledItems();
    (focus === 'last' ? items[items.length - 1] : items[0])?.focus();
  };

  const handleMenuKeyDown = (e: ReactKeyboardEvent<HTMLDivElement>) => {
    const items = enabledItems();
    if (items.length === 0) return;
    const i = items.indexOf(e.target as HTMLButtonElement);
    let next: HTMLButtonElement | undefined;
    switch (e.key) {
      case 'ArrowDown':
        next = items[(i + 1) % items.length];
        break;
      case 'ArrowUp':
        next = items[(i - 1 + items.length) % items.length];
        break;
      case 'Home':
        next = items[0];
        break;
      case 'End':
        next = items[items.length - 1];
        break;
      case 'Tab': {
        e.preventDefault();
        const trigger = triggerRef.current;
        if (e.shiftKey || !trigger) {
          close(true);
          return;
        }
        const after = nextFocusableAfter(trigger, menuRef.current);
        close(false);
        // 이어 갈 요소가 없으면 트리거로 — 언마운트되는 항목에 포커스가 남아 body 로 떨어지지 않게.
        (after ?? trigger).focus();
        return;
      }
      default:
        return;
    }
    e.preventDefault();
    next?.focus();
  };

  // 포커스가 트리거와 메뉴를 **둘 다** 벗어나면 닫는다. `relatedTarget` 이 없으면 판단하지 않는다 (클릭은 pointerdown 이 닫는다).
  const handleBlur = (e: ReactFocusEvent<HTMLElement>) => {
    if (!open) return;
    const to = e.relatedTarget;
    if (!(to instanceof Node)) return;
    if (menuRef.current?.contains(to) || triggerRef.current?.contains(to)) return;
    close(false);
  };

  const choose = (next: SimMode) => {
    if (next !== mode) onSelect(next);
    close(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="mode-menu-trigger"
        // 접근 가능한 이름 = 「모드: 관찰」 — 보이는 글자 (현재 모드) 를 포함한다 (WCAG 2.5.3 Label in Name).
        aria-label={`모드: ${currentLabel}`}
        aria-haspopup="menu"
        aria-expanded={open}
        // 메뉴는 열릴 때만 존재한다 — 닫힌 동안 없는 id 를 가리키지 않는다.
        aria-controls={open ? menuId : undefined}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        onBlur={handleBlur}
        className={`sm:hidden shrink-0 inline-flex items-center gap-0.5 rounded-sm border p-0.5 pr-1 backdrop-blur transition-colors ${
          open
            ? 'bg-primary/20 border-primary/40'
            : 'bg-bg-surface/80 border-border-subtle hover:bg-bg-elevated'
        }`}
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        <span className="num text-caption px-2 py-1 rounded-xs min-h-6 bg-primary/25 text-fg-primary">
          {currentLabel}
        </span>
        <ChevronDown size={12} aria-hidden="true" className="text-fg-secondary" />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="모드 선택"
              data-testid="mode-menu"
              onKeyDown={handleMenuKeyDown}
              onBlur={handleBlur}
              className="fixed z-[var(--z-dropdown)] flex flex-col gap-0.5 bg-bg-surface border border-border-subtle rounded-sm p-1 shadow-lg"
              style={{ top: position.top, left: position.left, width: MENU_WIDTH_PX }}
            >
              {MODES.map((m) => {
                const checked = mode === m.id;
                return (
                  <button
                    key={m.id}
                    type="button"
                    role="menuitemradio"
                    tabIndex={-1}
                    aria-checked={checked}
                    data-testid={`mode-menu-${m.id}`}
                    data-mode={m.id}
                    disabled={!m.enabled}
                    aria-disabled={!m.enabled}
                    title={m.tooltip}
                    onClick={() => choose(m.id)}
                    className={`w-full min-h-8 flex items-center justify-between gap-2 text-left text-caption px-2 py-1 rounded-xs border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      !m.enabled
                        ? 'bg-bg-surface/40 text-fg-muted border-transparent opacity-50 cursor-not-allowed'
                        : checked
                          ? 'bg-primary/20 text-fg-primary border-primary/40'
                          : 'text-fg-secondary border-transparent hover:bg-bg-elevated focus:bg-bg-elevated'
                    }`}
                    style={{ transitionDuration: 'var(--duration-fast)' }}
                  >
                    <span>{m.label}</span>
                    {!m.enabled && m.tooltip ? (
                      <span className="text-mini">{m.tooltip}</span>
                    ) : checked ? (
                      <span aria-hidden="true" className="text-mini text-fg-secondary">
                        ●
                      </span>
                    ) : null}
                  </button>
                );
              })}
            </div>,
            document.body,
          )
        : null}
    </>
  );
}
