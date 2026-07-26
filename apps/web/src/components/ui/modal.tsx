'use client';

import { useCallback, useEffect, useRef, type ReactNode, type RefObject } from 'react';
import { createPortal } from 'react-dom';
import { resolveFocusTrapTarget } from '@/lib/focus-trap';

/**
 * #848 — 모달 3종(about / sensitivity / onboarding) 공용 셸.
 *
 * 전수 감사 (2026-07-18) a11y 키보드 사각 3건 중 (1) 해소. 세 모달이 같은 마크업을 복붙해오며
 * 계약이 갈라져 있었다:
 *
 *   | 축            | about (이전)      | sensitivity | onboarding |
 *   |---------------|-------------------|-------------|------------|
 *   | portal        | ✗ (형제 DOM)      | ✓ body      | ✓ body     |
 *   | z-index       | `z-40`            | `z-[100]`   | `z-[100]`  |
 *   | focus trap    | ✗                 | ✗           | ✗          |
 *   | 초기 focus    | ✗                 | ✗           | ✓ 닫기버튼 |
 *   | focus 복원    | ✗                 | ✗           | ✓ trigger  |
 *
 * about 의 `z-40` 비-portal 은 sensitivity 가 #704 D-T2 에서 **실 Chrome 에서만 재현되는 가림**
 * 으로 이미 겪고 고쳤던 버그 클래스의 잠복 재노출이었다 (Babylon WebGPU canvas 가 하드웨어 가속
 * 합성 레이어를 형성해 형제 DOM 을 가린다 — headless 미재현). 복붙 계약을 컴포넌트 1개로 수렴시켜
 * "새 모달을 만들면 자동으로 옳은 계약" 이 되게 한다.
 *
 * ## 계약 (3종 공통 — 개별 모달에서 재선언 금지)
 *
 *   1. `createPortal(..., document.body)` + backdrop `z-[100]` — canvas 합성 레이어 위 보장
 *   2. `role="dialog"` + `aria-modal="true"` + `aria-labelledby` + `data-modal-open="true"`
 *      (`data-modal-open` 은 focus-quick-buttons 의 Esc 오발화 가드 SSoT — #737 핵심결정 1)
 *   3. Tab / Shift+Tab 순환을 패널 내부로 가둠 (`resolveFocusTrapTarget`)
 *   4. open 시 닫기 버튼 focus / close 시 **직전 포커스 요소** 복원
 *   5. Esc + backdrop 클릭 닫기
 *
 * ## focus 복원 대상 = "직전 포커스 요소" (onboarding 의 triggerRef 승격)
 *
 *   onboarding 은 `triggerRef` 를 명시 보관했지만, 열기 직전의 `document.activeElement` 를 캡처하면
 *   같은 결과를 얻으면서 트리거가 여럿인 모달까지 일반화된다. 단 **자동 표시**(onboarding 첫 진입)는
 *   열림 시점 activeElement 가 `body` 라 복원할 곳이 없으므로, `fallbackFocusRef` 로 트리거 버튼을
 *   받아 그쪽으로 되돌린다. 초기 mount 에서 한 번도 열리지 않았다면 복원 자체를 하지 않는다
 *   (#737 reviewer 권고 1 — 재방문 유저의 포커스를 트리거 버튼이 탈취하는 버그 차단).
 */
export interface ModalProps {
  /** 열림 여부. `false` 면 아무것도 렌더하지 않는다(언마운트 = SSR/hydration 안전). */
  open: boolean;
  /** 닫기 요청 (Esc / backdrop / 닫기 버튼 공통). */
  onClose: () => void;
  /** 헤더 제목 텍스트. */
  title: ReactNode;
  /** `aria-labelledby` 로 참조할 제목 요소 id. */
  titleId: string;
  /** 패널 `data-testid` (기존 가드/테스트 셀렉터 보존 — 임의 변경 금지). */
  testId: string;
  /** 닫기 버튼 `data-testid`. */
  closeTestId: string;
  /** 패널 크기/스크롤 클래스 (모달별 상이 — 그 외 시각 계약은 공통 고정). */
  panelClassName?: string;
  /** 열림 시점 activeElement 가 없을 때(자동 표시 등) 복원할 대상. */
  fallbackFocusRef?: RefObject<HTMLElement | null>;
  children: ReactNode;
}

/** 패널 기본 클래스 — 크기 축(`max-w-*` / `max-h-*`)만 모달별로 덮어쓴다. */
const PANEL_BASE_CLASS =
  'w-full overflow-y-auto bg-bg-surface border border-border-subtle rounded-sm p-6 shadow-lg';

export function Modal({
  open,
  onClose,
  title,
  titleId,
  testId,
  closeTestId,
  panelClassName = 'max-w-2xl max-h-[80vh]',
  fallbackFocusRef,
  children,
}: ModalProps) {
  const panelRef = useRef<HTMLDivElement | null>(null);
  const closeButtonRef = useRef<HTMLButtonElement | null>(null);
  /** 열기 직전 포커스를 갖고 있던 요소 — 닫힐 때 여기로 되돌린다. */
  const previousFocusRef = useRef<HTMLElement | null>(null);
  /** 한 번이라도 열린 적 있는지 — 초기 mount 의 포커스 탈취 방지 (#737 reviewer 권고 1). */
  const hasOpenedRef = useRef(false);

  // onClose 를 effect 의존성에서 빼기 위한 최신 참조 (호출부가 인라인 화살표 함수를 넘겨도
  // Esc/trap 리스너가 매 렌더 재등록되지 않게 한다).
  const onCloseRef = useRef(onClose);
  useEffect(() => {
    onCloseRef.current = onClose;
  }, [onClose]);

  // ── Esc 닫기 + Tab focus trap (열림 중에만 window 리스너) ────────────────────
  //
  // 리스너를 패널의 React `onKeyDown` 이 아닌 전역에 다는 이유: 포커스가 어떤 경위로든 모달 밖으로
  // 나간 상태(배경 스크립트가 강제 focus 한 경우 등)에서도 다음 Tab 을 회수해야 하기 때문이다.
  // React 핸들러는 포커스가 패널 안에 있을 때만 발화하므로 그 복구 경로를 못 만든다.
  //
  // target=`window` 는 기존 3 모달의 Esc 컨벤션 유지 (focus-quick-buttons 의 Esc 가드도 window).
  // keydown 은 focus 요소 → document → window 로 버블하므로 실브라우저 동작은 document 와 동일하고,
  // Tab 기본 동작(포커스 이동)은 dispatch 완료 후 수행되므로 여기서의 preventDefault 로 차단된다.
  useEffect(() => {
    if (!open) return;
    const handleKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        onCloseRef.current();
        return;
      }
      if (e.key !== 'Tab') return;
      const panel = panelRef.current;
      if (!panel) return;
      const target = resolveFocusTrapTarget(panel, document.activeElement, e.shiftKey);
      // null = 모달 내부 정상 이동 → 브라우저 기본 동작 유지 (개입 최소화).
      if (target === null) return;
      e.preventDefault();
      target.focus();
    };
    window.addEventListener('keydown', handleKey);
    return () => window.removeEventListener('keydown', handleKey);
  }, [open]);

  // ── 초기 focus / 복원 ────────────────────────────────────────────────────────
  useEffect(() => {
    if (open) {
      hasOpenedRef.current = true;
      const active = document.activeElement;
      previousFocusRef.current =
        active instanceof HTMLElement && active !== document.body ? active : null;
      closeButtonRef.current?.focus();
      return;
    }
    if (!hasOpenedRef.current) return;
    const previous = previousFocusRef.current;
    // 복원 대상이 그 사이 언마운트됐으면(조건부 렌더 UI) fallback 으로.
    if (previous && previous.isConnected) previous.focus();
    else fallbackFocusRef?.current?.focus();
    previousFocusRef.current = null;
  }, [open, fallbackFocusRef]);

  const handleBackdropClick = useCallback(() => onCloseRef.current(), []);

  if (!open) return null;

  return createPortal(
    // #704 D-T2 / #848 — body 직속 portal + `z-[100]`. Babylon WebGPU canvas 는 하드웨어 가속
    // 합성 레이어를 형성해 형제 DOM(z-40)을 가릴 수 있다(headless 미재현, 실 Chrome 에서만 발현).
    <div
      className="fixed inset-0 z-[100] bg-bg-base/70 backdrop-blur-sm flex items-center justify-center p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        ref={panelRef}
        className={`${panelClassName} ${PANEL_BASE_CLASS}`}
        onClick={(e) => e.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby={titleId}
        data-modal-open="true"
        data-testid={testId}
        // 포커서블이 0 개인 극단 상황에서 trap 이 회수할 지점 (Tab 이 배경으로 새는 것 차단).
        tabIndex={-1}
      >
        <div className="flex items-center justify-between mb-4">
          <h2 id={titleId} className="font-display text-h3 text-fg-primary">
            {title}
          </h2>
          <button
            ref={closeButtonRef}
            type="button"
            onClick={onClose}
            data-testid={closeTestId}
            aria-label="닫기"
            className="text-fg-secondary hover:text-fg-primary text-body transition-colors"
            style={{ transitionDuration: 'var(--duration-fast)' }}
          >
            ✕
          </button>
        </div>
        {children}
      </div>
    </div>,
    document.body,
  );
}
