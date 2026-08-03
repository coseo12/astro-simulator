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
 * 표준 포커서블 셀렉터 세트 — **본 상수가 SSoT**.
 *
 * Radix Slider 처럼 `role="slider"` + `tabindex="0"` 인 커스텀 위젯은 마지막 `[tabindex]` 절이 흡수한다.
 *
 * ## 문자열 사본 2곳 — 변경 시 동시 갱신 의무 (#889 / volt #69 숨은 상수 패턴)
 *
 *   `.mjs` 브라우저 가드는 TS 모듈을 import 할 수 없어 셀렉터 **문자열 사본**이 불가피하다.
 *   본 상수를 고치면 아래 2곳을 함께 고쳐야 한다 (양방향 — 두 사본에도 본 파일 역참조 주석이 있다):
 *
 *   | # | 사본 위치 | 사용 방식 |
 *   |---|---|---|
 *   | 1 | `scripts/browser-verify-a11y.mjs` (focusable 수집) | 개수 집계만 — first/last 미사용 |
 *   | 2 | `apps/web/scripts/browser-verify-848-modal-focus.mjs` (S3 경계 순환) | first/last 마커 계산 |
 *
 *   **위험** — 두 사본은 셀렉터만 복제하고 아래 `isFocusableNow` 의 5축 필터 중 `tabindex="-1"`
 *   **1축만** 복제한다 (`disabled` / `aria-hidden="true"` / `hidden`·`[inert]` /
 *   `display:none`·`visibility:hidden` 미복제). 모달 경계(첫·마지막 포커서블)에 `disabled` 버튼이나
 *   조건부 `aria-hidden` 요소가 들어오면 사본 2 의 `data-848-pos` 마커가 구현이 계산하는 first/last 와
 *   어긋나 false FAIL(또는 false PASS)이 난다.
 *
 *   **현행 미발현 근거** (qa 실측, PR #886 실 Chrome) — 모달 3종 패널에서
 *   `가드 셀렉터 수집 개수 == 구현 필터 후 개수` (about 5==5 / sensitivity 6==6 / onboarding 3==3),
 *   경계에 놓인 `disabled`·`aria-hidden="true"`·`hidden`·`[inert]` 포커서블 **0개**. sensitivity 의
 *   `aria-hidden` 은 기본값 마커 `<span>` 이라 비포커서블 → 무영향. 즉 **이론적 위험만 잔존**한다.
 *   → 모달에 `disabled` 버튼이나 조건부 숨김 요소를 추가할 때 사본 2 의 필터도 함께 확장할 것.
 *
 * ## 커버리지 엣지 — 인지 기록 (#889, 현재 이론적)
 *
 *   - `input:not([disabled])` 는 `<input type="hidden">` 도 매칭한다. 실브라우저는 UA 스타일시트의
 *     `display:none` 덕에 아래 `isFocusableNow` 가 걸러내지만, **jsdom 은 그 UA 규칙을 보장하지 않아**
 *     단위 테스트 환경에서만 포커서블로 집계될 수 있다.
 *   - `details`/`summary`/`iframe`/`audio[controls]`/`video[controls]`/`[contenteditable]` 미포함.
 *
 *   현행 모달 3종 콘텐츠에 해당 요소가 없어 이론적이며, 선제 확장은 YAGNI 로 보류했다
 *   (reviewer 권고 7, PR #886). 위 요소를 모달에 넣게 되면 본 셀렉터부터 확장할 것.
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
