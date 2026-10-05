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
// #402 — R-Phase allowlist SSoT (named import — scene namespace 경유 금지).
// ADR `20260504-r-phase-allowlist-guard.md` §Amendment 결정 D1.
//
// ⚠️ `scene as sceneApi` namespace 경유 시 turbopack module dep graph 가
//    solar-system-scene → nbody-engine → physics_wasm `__dirname` 평가를 trigger 하여 SSR 500
//    (라운드 2 실측 재현). 본 컴포넌트는 app-shell.tsx → focus-quick-buttons.tsx 경유로 SSR 평가 대상이므로
//    named import 로 모듈 그래프 영향 0 보장. core/src/index.ts 가 별도 named export 박제.
import { isRPhaseFocusable } from '@astro-simulator/core';
import { useSimCommand } from '@/core/sim-context';
import { nextFocusableAfter } from '@/lib/focus-trap';
import { useSimStore } from '@/store/sim-store';

/**
 * #1281 — 상단 바 「천체 ▾」 메뉴 항목 (종전 `focus-quick-buttons.tsx` `FOCUS_BUTTONS` 를 이전).
 * testid `focus-<id>` 는 그대로다 — 스크립트는 `scripts/browser-verify-utils.mjs` `clickFocusBody` 로 메뉴를 열고 누른다.
 */
export const BODY_MENU_ITEMS = [
  { id: 'sun', label: '태양' },
  { id: 'mercury', label: '수성' }, // R2 #361 — sun 다음 천체 거리 순
  { id: 'venus', label: '금성' }, // R3 #369 — mercury 다음 천체 거리 순
  { id: 'earth', label: '지구' }, // R4 #532 — venus 다음 천체 거리 순
  { id: 'moon', label: '달' }, // R4 #532 — earth 인접 (parent-satellite 자연 그룹)
  { id: 'mars', label: '화성' }, // R5 #594 — Q4a=A (mars 만 추가, phobos/deimos 미등록)
  { id: 'jupiter', label: '목성' }, // R6 #621 — CURRENT_R_PHASE=6 진입으로 isRPhaseFocusable 자동 enabled (배열 변경 0). galilean 4 는 showInShortcutBar=false 라 미등록
  { id: 'saturn', label: '토성' }, // R7 #641 — jupiter 다음 천체 거리순 (showInShortcutBar true 전환 동반, #617 가드 정합). titan 은 showInShortcutBar=false (URL ?focus=titan 진입)
  { id: 'uranus', label: '천왕성' }, // R8 #647 — saturn 다음 천체 거리순 (#617 가드 정합). titania 는 showInShortcutBar=false (URL ?focus=titania 진입)
  { id: 'neptune', label: '해왕성' }, // R9 #653 enabled — CURRENT_R_PHASE=9 1줄 자동 enabled (#613 Concrete Prediction negative→positive 전환 5번째, 배열 변경 0). triton 은 showInShortcutBar=false (URL ?focus=triton 진입). ADR 20260610-r9 §축 5
  { id: 'pluto', label: '명왕성' }, // R10a #659 — PM Q3=A pluto 만 승격 (#617 가드 정합). 거리순 마지막 (39.48 AU). ceres/haumea/makemake/eris 는 showInShortcutBar=false (URL ?focus= 진입 — #624 tradeoff). ADR 20260611-r10a §축 4
  { id: 'halley', label: '핼리 혜성' }, // R10b #664 — PM Q2=A halley 만 승격 (#617 가드 정합). ⚠️ 배치 컨벤션: "행성 8 거리순 블록 + 비-행성 카테고리 후미 (pluto → halley)" — halley a=17.834 AU 를 saturn/uranus 사이 엄격 삽입하면 행성 거리순 블록이 깨져 기각 (ADR 20260612-r10b §축 6 — 후속 비-행성 추가 시 본 컨벤션 답습). encke/swift-tuttle 은 showInShortcutBar=false (URL ?focus= 진입 — #624 tradeoff)
];

// R-Phase 미진입 body 호버 / focus 시 사용자 안내 문구.
// ADR `20260504-r-phase-allowlist-guard.md` §결정 2.
const DISABLED_TOOLTIP = '아직 구현되지 않은 천체입니다 (R-Phase 진입 후 활성화)';

/** 트리거 아래 메뉴 간격 (px). */
const MENU_GAP_PX = 4;
/** 메뉴가 뷰포트 가장자리에 붙지 않게 두는 최소 여백 (px). */
const VIEWPORT_MARGIN_PX = 8;
/** 메뉴 폭 (px) — 가장 긴 라벨 「핼리 혜성」 + 선택 표시가 한 줄에 들어가는 고정값. 우측 clamp 계산에 쓴다. */
const MENU_WIDTH_PX = 144;

/** 메뉴가 열릴 때 포커스를 둘 항목 — APG Menu Button: Enter/Space/↓ = 선택 항목(없으면 첫 항목), ↑ = 마지막. */
type OpenFocus = 'selected' | 'last';

interface MenuPosition {
  top: number;
  left: number;
  maxHeight: number;
}

/** 트리거 좌측 정렬 + 뷰포트 안쪽 clamp. 세로는 뷰포트 하단까지 — 넘치면 메뉴 안에서 스크롤한다. */
function resolveMenuPosition(trigger: HTMLElement): MenuPosition {
  const rect = trigger.getBoundingClientRect();
  const top = rect.bottom + MENU_GAP_PX;
  const maxLeft = window.innerWidth - MENU_WIDTH_PX - VIEWPORT_MARGIN_PX;
  return {
    top,
    left: Math.max(VIEWPORT_MARGIN_PX, Math.min(rect.left, maxLeft)),
    maxHeight: Math.max(0, window.innerHeight - top - VIEWPORT_MARGIN_PX),
  };
}

/**
 * #1281 — 상단 바 「천체 ▾」 메뉴 버튼 (WAI-ARIA APG Menu Button). 1280 폭에서 12개 바로가기 중 11개가 가려지던
 * 문제를 트리거 1개(약 45px)로 해소한다 (이슈 Q3 = A).
 *
 * ## `DisplayPanel` (#1265) 과 같은 골격 — 이유도 같다
 *   - `createPortal(document.body)` + `fixed` + `z-[var(--z-dropdown)]` — 조상 overflow · `z-hud` 쌓임 맥락 ·
 *     canvas 합성 레이어 회피 (`display-panel.tsx` 헤더 주석).
 *   - 닫히면 언마운트 — 서버 렌더 시점엔 항상 `null`.
 *   - 열림 상태는 store `bodyMenuOpen` — `TopBar` 자동 숨김 억제가 읽는다 (D7). 언마운트 시 닫는다.
 *   - **Esc 는 window capture + `preventDefault()`** — `focus-quick-buttons` 의 Esc→자유시점 리스너(bubble)는
 *     `defaultPrevented` 를 보고 물러난다. 메뉴를 닫는 Esc 가 자유시점을 오발화하지 않는 것은 이 한 신호다 (D6).
 *
 * ## 다른 점 — 메뉴이므로 로빙 포커스
 *   - 항목은 `role="menuitemradio"` + `tabIndex=-1`. ↓↑ 순환 · Home/End · Enter/Space(버튼 기본 동작) 선택.
 *   - Tab → 닫고 트리거 다음 요소 (`nextFocusableAfter` — 메뉴가 트리거 바로 뒤에 있는 것처럼), Shift+Tab → 트리거.
 *   - 스크롤 닫기는 두지 않는다 — 트리거가 있는 상단 바 좌측 그룹은 어떤 폭에서도 스크롤되지 않는다 (`top-bar.tsx`).
 *
 * R-Phase 미진입 body 는 disabled + tooltip + opacity 50% + cursor-not-allowed (#402, ADR `20260504` §결정 2).
 */
export function BodyMenu() {
  const open = useSimStore((s) => s.bodyMenuOpen);
  const setOpen = useSimStore((s) => s.setBodyMenuOpen);
  const selected = useSimStore((s) => s.selectedBodyId);
  const sendCommand = useSimCommand();
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const menuRef = useRef<HTMLDivElement | null>(null);
  const openFocusRef = useRef<OpenFocus>('selected');
  const [position, setPosition] = useState<MenuPosition | null>(null);
  const menuId = useId();

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

  /** 지금 누를 수 있는 항목 (R-Phase 미진입 `disabled` 는 포커스도 받지 않으므로 건너뛴다). */
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
    // resize — `fixed` 좌표가 트리거와 어긋나는 것을 재계산 대신 닫아서 없앤다 (DisplayPanel 동형).
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

  // 열리면 항목으로 포커스 — 선택된 천체가 활성이면 그 항목, 아니면 첫 항목 (↑ 로 열었으면 마지막).
  useEffect(() => {
    if (!open) return;
    const items = enabledItems();
    if (items.length === 0) return;
    const target =
      openFocusRef.current === 'last'
        ? items[items.length - 1]
        : (items.find((el) => el.dataset.bodyId === selected) ?? items[0]);
    target?.focus();
    // 열린 순간 1회만 — 열린 채 선택이 바뀌어도 사용자의 포커스를 빼앗지 않는다.
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

  // 포커스가 트리거와 메뉴를 **둘 다** 벗어나면 닫는다. `relatedTarget` 이 없으면 (창 전환 · 비포커스 영역 클릭)
  // 판단하지 않는다 — 클릭은 메뉴 밖 `pointerdown` 이 이미 닫는다 (DisplayPanel 동형).
  const handleBlur = (e: ReactFocusEvent<HTMLElement>) => {
    if (!open) return;
    const to = e.relatedTarget;
    if (!(to instanceof Node)) return;
    if (menuRef.current?.contains(to) || triggerRef.current?.contains(to)) return;
    close(false);
  };

  const choose = (bodyId: string) => {
    sendCommand({ type: 'focusOn', bodyId });
    close(true);
  };

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="body-menu-trigger"
        aria-haspopup="menu"
        aria-expanded={open}
        // 메뉴는 열릴 때만 존재한다 — 닫힌 동안 없는 id 를 가리키지 않는다.
        aria-controls={open ? menuId : undefined}
        onClick={handleTriggerClick}
        onKeyDown={handleTriggerKeyDown}
        onBlur={handleBlur}
        className={`num text-mini min-w-6 min-h-6 shrink-0 px-1 py-0.5 rounded-sm border inline-flex items-center gap-0.5 transition-colors ${
          open
            ? 'bg-primary/20 text-fg-primary border-primary/40'
            : 'bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated'
        }`}
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        천체
        <ChevronDown size={12} aria-hidden="true" />
      </button>
      {open && position
        ? createPortal(
            <div
              ref={menuRef}
              id={menuId}
              role="menu"
              aria-label="천체 선택"
              data-testid="body-menu"
              onKeyDown={handleMenuKeyDown}
              onBlur={handleBlur}
              className="fixed z-[var(--z-dropdown)] flex flex-col gap-0.5 bg-bg-surface border border-border-subtle rounded-sm p-1 shadow-lg overflow-y-auto"
              style={{
                top: position.top,
                left: position.left,
                width: MENU_WIDTH_PX,
                maxHeight: position.maxHeight,
              }}
            >
              {BODY_MENU_ITEMS.map((b) => {
                const enabled = isRPhaseFocusable(b.id);
                const checked = selected === b.id;
                return (
                  <button
                    key={b.id}
                    type="button"
                    role="menuitemradio"
                    tabIndex={-1}
                    aria-checked={checked}
                    data-testid={`focus-${b.id}`}
                    data-body-id={b.id}
                    data-r-phase-disabled={!enabled}
                    disabled={!enabled}
                    aria-disabled={!enabled}
                    title={enabled ? undefined : DISABLED_TOOLTIP}
                    onClick={() => choose(b.id)}
                    className={`w-full flex items-center justify-between gap-2 text-left text-caption px-2 py-1 rounded-xs border transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60 ${
                      !enabled
                        ? 'bg-bg-surface/40 text-fg-muted border-transparent opacity-50 cursor-not-allowed'
                        : checked
                          ? 'bg-primary/20 text-fg-primary border-primary/40'
                          : 'text-fg-secondary border-transparent hover:bg-bg-elevated focus:bg-bg-elevated'
                    }`}
                    style={{ transitionDuration: 'var(--duration-fast)' }}
                  >
                    <span>{b.label}</span>
                    {checked ? (
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
