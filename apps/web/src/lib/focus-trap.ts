/**
 * #848 — 모달 focus trap 순수 로직 (DOM 만 의존, React 비의존).
 *
 * `role="dialog" aria-modal="true"` 는 **스크린 리더에게만** "배경은 없는 셈 쳐라" 를 알린다.
 * 키보드 Tab 순서는 브라우저가 DOM 순서대로 계속 이동시키므로, 별도 trap 없이는 Tab 이 모달을
 * 벗어나 배경 UI(상단 단축 바 / HUD)로 탈출한다 (WCAG 2.1.2 No Keyboard Trap 의 역방향 결함 —
 * "가둬야 할 것을 못 가둠"). axe 정적 검사는 이 동적 거동을 보지 못해 a11y-baseline-guard 0 위반
 * 상태로 잠복했다 (전수 감사 2026-07-18).
 *
 * ## jsdom 호환 필터 정책 (테스트 용이성)
 *
 *   레이아웃 기반 가시성 판정(`offsetParent` / `getClientRects()`)은 jsdom 이 항상 0·null 을
 *   반환해 **단위 테스트에서 모든 요소가 탈락** 한다. 따라서 본 모듈은 jsdom 이 실제로 구현하는
 *   축(`disabled` / `hidden` / `inert` / `aria-hidden` / `getComputedStyle` 의 display·visibility)
 *   만으로 판정한다. 모달 내부는 조건부 렌더(언마운트)로 요소를 감추므로 레이아웃 판정이 없어도
 *   실브라우저 결과가 동일하다.
 */

/**
 * 표준 포커서블 셀렉터 세트.
 *
 * `scripts/browser-verify-a11y.mjs` 의 focusable 수집 셀렉터와 동일 계열이며, Radix Slider 처럼
 * `role="slider"` + `tabindex="0"` 인 커스텀 위젯은 마지막 `[tabindex]` 절이 흡수한다.
 */
export const FOCUSABLE_SELECTOR = [
  'a[href]',
  'button:not([disabled])',
  'input:not([disabled])',
  'select:not([disabled])',
  'textarea:not([disabled])',
  '[tabindex]:not([tabindex="-1"])',
].join(', ');

/** 요소가 현재 포커스 가능한 상태인지 (숨김/비활성 제외). */
function isFocusableNow(el: HTMLElement): boolean {
  // `tabindex="-1"` 은 **프로그램 전용 포커스** 라 Tab 순회 대상이 아니다. 셀렉터의
  // `[tabindex]:not([tabindex="-1"])` 절만으로는 못 거른다 — `<button tabindex="-1">` 는
  // 앞선 `button:not([disabled])` 절에 먼저 걸리기 때문 (단위 테스트가 잡아낸 실제 결함).
  if (el.getAttribute('tabindex') === '-1') return false;
  if (el.hasAttribute('disabled') || el.getAttribute('aria-hidden') === 'true') return false;
  if (el.hidden || el.closest('[inert]') !== null) return false;
  const style = el.ownerDocument.defaultView?.getComputedStyle(el);
  if (style && (style.display === 'none' || style.visibility === 'hidden')) return false;
  return true;
}

/**
 * 컨테이너 내부의 포커서블 요소를 **DOM 순서** 로 수집.
 *
 * 양수 `tabindex` 는 정렬하지 않는다 — 프로젝트 전역에서 양수 tabindex 를 금지하고 있고
 * (`sim-canvas.tsx` 가 Babylon 기본 `tabindex=1` 을 0 으로 되돌리는 것과 동일 정책),
 * 정렬 규칙을 넣으면 실제 브라우저 순서와 어긋날 위험만 커진다.
 */
export function getFocusableElements(container: HTMLElement): HTMLElement[] {
  return Array.from(container.querySelectorAll<HTMLElement>(FOCUSABLE_SELECTOR)).filter(
    isFocusableNow,
  );
}

/**
 * Tab / Shift+Tab 시 포커스를 이동시켜야 할 대상을 계산 (순수 함수).
 *
 * @param container 모달 패널 요소
 * @param active 현재 `document.activeElement`
 * @param shiftKey Shift 동반 여부
 * @returns 강제 이동 대상. `null` 이면 브라우저 기본 Tab 동작을 그대로 둔다(모달 내부 이동).
 */
export function resolveFocusTrapTarget(
  container: HTMLElement,
  active: Element | null,
  shiftKey: boolean,
): HTMLElement | null {
  const focusables = getFocusableElements(container);
  // 포커서블이 하나도 없으면 컨테이너 자신으로 회수한다(패널에 tabIndex={-1} 부여 전제).
  if (focusables.length === 0) return container;

  const first = focusables[0]!;
  const last = focusables[focusables.length - 1]!;

  // 포커스가 이미 모달 밖이면(배경 클릭 후 body 등) 방향에 맞는 경계로 회수.
  if (!(active instanceof HTMLElement) || !container.contains(active)) {
    return shiftKey ? last : first;
  }
  if (shiftKey && active === first) return last;
  if (!shiftKey && active === last) return first;
  return null;
}
