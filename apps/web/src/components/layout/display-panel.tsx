'use client';

import { useCallback, useEffect, useId, useRef, useState } from 'react';
import { createPortal } from 'react-dom';
import { DISPLAY_TOGGLES, type DisplayToggleDef } from '@/core/display-toggles';
import { useDisplayToggle } from '@/core/use-display-toggle';
import { useSimStore } from '@/store/sim-store';

/**
 * #1265 — 상단 바 우측 「표시」 버튼 + 비모달 드롭다운 패널 (ADR `20260927-1265` 결정 6).
 *
 * ## 모달(`ui/modal.tsx`)과 다른 점 — 비모달 disclosure
 *   - backdrop 없음 · `aria-modal` 없음 · 캔버스 조작 유지. 패널 밖 `pointerdown` 은 닫기 (포커스 복원 없음).
 *   - **Tab 을 가두지 않는다** — 비모달 팝오버에 focus trap 을 두지 않는다 (WAI-ARIA APG, 교차검증 반영).
 *     Tab 은 토글 4개를 차례로 지나 패널 밖으로 나간다 (계약 D14 「Tab 으로 토글 4개 순회」는 선형 순회).
 *   - 창 `resize` 시 닫는다 — `fixed` 좌표가 트리거와 어긋나는 것을 재계산 대신 제거한다.
 *
 * ## 모달과 같은 점
 *   - `createPortal(document.body)` + `fixed` + `z-[var(--z-dropdown)]`. (i) 모바일 우측 그룹이
 *     `overflow-x-auto` 라 절대 위치 자식이 잘리고 (`top-bar.tsx`), (ii) 헤더 쌓임 맥락(`z-hud`) 안에서는
 *     사이드 패널 아래로 깔리며, (iii) canvas 합성 레이어가 형제 DOM 을 가린다 (#704 D-T2).
 *   - 닫히면 언마운트 — 서버 렌더 시점에는 항상 `null` 이라 `document` 접근 경로가 없다.
 *
 * ## Esc — window **capture** 단계 + `preventDefault()`
 *   `focus-quick-buttons` 의 Esc→자유시점 리스너는 선택이 바뀔 때마다 window 에 재등록된다. 비모달이라
 *   패널이 열린 채 선택이 바뀌면 그 리스너가 패널 리스너보다 **뒤에** 서고, 패널이 닫히며 속성
 *   (`data-display-panel-open`) 이 사라진 뒤 자유시점 리스너가 돌 수 있다. capture 단계는 등록 순서와 무관하게
 *   bubble 단계보다 먼저 돌고, `defaultPrevented` 가 순서와 무관한 신호를 남긴다 (ADR 축 4 (c)).
 */

/** 트리거 아래 패널 간격 (px). */
const PANEL_GAP_PX = 4;
/** 패널이 뷰포트 가장자리에 붙지 않게 두는 최소 여백 (px). */
const VIEWPORT_MARGIN_PX = 8;

/** 자유시점 Esc 가드가 읽는 속성 — `focus-quick-buttons.tsx` 셀렉터와 짝이다. */
export const DISPLAY_PANEL_OPEN_ATTR = 'data-display-panel-open';

interface PanelPosition {
  top: number;
  right: number;
}

/** 트리거 우측 정렬 + 뷰포트 안쪽 clamp. */
function resolvePanelPosition(trigger: HTMLElement): PanelPosition {
  const rect = trigger.getBoundingClientRect();
  return {
    top: rect.bottom + PANEL_GAP_PX,
    right: Math.max(VIEWPORT_MARGIN_PX, window.innerWidth - rect.right),
  };
}

export function DisplayPanel() {
  const open = useSimStore((s) => s.displayPanelOpen);
  const setOpen = useSimStore((s) => s.setDisplayPanelOpen);
  const triggerRef = useRef<HTMLButtonElement | null>(null);
  const panelRef = useRef<HTMLDivElement | null>(null);
  const [position, setPosition] = useState<PanelPosition | null>(null);
  const panelId = useId();
  const titleId = useId();

  const close = useCallback(
    (restoreFocus: boolean) => {
      setOpen(false);
      if (restoreFocus) triggerRef.current?.focus();
    },
    [setOpen],
  );

  const handleTriggerClick = () => {
    if (open) {
      close(false);
      return;
    }
    if (triggerRef.current) setPosition(resolvePanelPosition(triggerRef.current));
    setOpen(true);
  };

  // 열린 동안만 전역 리스너 — Esc (capture) · 패널 밖 pointerdown · resize.
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
      if (panelRef.current?.contains(target) || triggerRef.current?.contains(target)) return;
      close(false);
    };
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

  // 열리면 첫 토글로 포커스 (키보드 사용자가 Enter 직후 바로 Tab 순회를 시작하게).
  useEffect(() => {
    if (!open) return;
    panelRef.current?.querySelector<HTMLButtonElement>('[data-display-toggle]')?.focus();
  }, [open]);

  // 열린 채 언마운트되면 store 가 열림으로 남아 상단 바 자동 숨김이 영구 억제된다 — 수명 경계에서 닫는다.
  useEffect(() => () => setOpen(false), [setOpen]);

  return (
    <>
      <button
        ref={triggerRef}
        type="button"
        data-testid="display-panel-toggle"
        aria-expanded={open}
        // 패널은 열릴 때만 존재한다 — 닫힌 동안 없는 id 를 가리키지 않는다.
        aria-controls={open ? panelId : undefined}
        title="별 배경 · 구름 · 야간 불빛 · 궤도선 켜고 끄기"
        onClick={handleTriggerClick}
        className="num text-caption bg-bg-surface/80 backdrop-blur border border-border-subtle rounded-sm px-2 py-1 text-fg-secondary hover:bg-bg-elevated transition-colors"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        표시
      </button>
      {open && position
        ? createPortal(
            <div
              ref={panelRef}
              id={panelId}
              role="group"
              aria-labelledby={titleId}
              data-testid="display-panel"
              {...{ [DISPLAY_PANEL_OPEN_ATTR]: 'true' }}
              className="fixed z-[var(--z-dropdown)] w-60 bg-bg-surface border border-border-subtle rounded-sm p-3 shadow-lg"
              style={{ top: position.top, right: position.right }}
            >
              <p id={titleId} className="text-caption text-fg-secondary mb-2">
                표시
              </p>
              <ul className="flex flex-col gap-1">
                {DISPLAY_TOGGLES.map((def) => (
                  <li key={def.id}>
                    <DisplayToggleButton def={def} />
                  </li>
                ))}
              </ul>
            </div>,
            document.body,
          )
        : null}
    </>
  );
}

function DisplayToggleButton({ def }: { def: DisplayToggleDef }) {
  const intent = useSimStore((s) => s[def.intentKey]);
  const caps = useSimStore((s) => s.displayCapabilities);
  const toggle = useDisplayToggle();
  const reasonId = useId();
  const reason = def.disabledReason(caps);
  const pressed = def.pressed(intent, caps);
  const disabled = reason !== null;

  return (
    <button
      type="button"
      data-testid={`display-toggle-${def.id}`}
      data-display-toggle=""
      aria-pressed={pressed}
      aria-disabled={disabled}
      aria-describedby={disabled ? reasonId : undefined}
      title={reason ?? undefined}
      // 가용성 차단은 `toggle()` 안에서만 한다 (`use-display-toggle.ts`) — 여기서 한 번 더 거르지 않는다.
      onClick={() => toggle(def.id)}
      className={`w-full flex items-start justify-between gap-2 text-left rounded-sm border px-2 py-1 transition-colors ${
        disabled
          ? 'border-border-subtle bg-bg-surface cursor-not-allowed'
          : pressed
            ? 'border-primary/40 bg-primary/20 hover:bg-primary/30'
            : 'border-border-subtle bg-bg-surface hover:bg-bg-elevated'
      }`}
      style={{ transitionDuration: 'var(--duration-fast)' }}
    >
      <span className="flex flex-col">
        <span className={`text-caption ${disabled ? 'text-fg-secondary' : 'text-fg-primary'}`}>
          {def.label}
        </span>
        {disabled ? (
          <span id={reasonId} className="text-mini text-fg-secondary">
            {reason}
          </span>
        ) : null}
      </span>
      <span className="num text-mini text-fg-secondary shrink-0">{pressed ? '켜짐' : '꺼짐'}</span>
    </button>
  );
}
