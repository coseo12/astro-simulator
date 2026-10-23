/**
 * #1380 — 포커스가 **펼쳐진 비모달 팝업** 쪽에 있는가.
 *
 * 「펼쳐진 팝업 쪽」 = (a) 포커스 요소 자신이 `aria-expanded="true"` 인 트리거이거나, (b) 어떤 `aria-expanded="true"`
 * 트리거의 `aria-controls` 대상 (팝업 본체) 안에 있다. 대상은 이 ARIA 계약을 가진 팝업 **전부**다 — 지금은 사건 패널
 * (`time-events.tsx`) · 표시 패널 (`display-panel.tsx`) · 천체 메뉴 (`body-menu.tsx`) · 모드 메뉴 (`mode-switcher.tsx`, 640px
 * 미만 — #1390 PR0) · 상단 「⋯」 오버플로 (`top-bar.tsx`, 640px 미만). 이미 있는 계약이라 새 마커 속성 없이 판정한다 — 팝업을
 * 새로 만들 때 ARIA 를 바르게 달면 자동으로 보호된다 (그래서 개수를 적지 않는다).
 *
 * 쓰임: 캔버스 `pointerenter` refocus (`sim-canvas.tsx` `shouldPreserveFocus`). 「⋯」 를 뺀 나머지는 「포커스가 트리거와 팝업을
 * 둘 다 벗어나면 닫는다」 는 blur 규칙을 갖는다. 캔버스가 포커스를 가져가면 그 규칙이 발화해 **포인터가 캔버스를 스치기만 해도**
 * 팝업이 닫혔다 (사건 패널 · 표시 패널 · 천체 메뉴 — #1380. 사건 패널은 필터를 끄면 패널이 줄어 멈춘 포인터 아래로 캔버스가
 * 들어와 같은 경로로 닫혔다). 모드 메뉴도 같은 blur 규칙을 가지며 처음부터 이 보호를 받는다.
 *
 * DOM 만 의존 (React 비의존) — jsdom 단위 테스트로 판정을 고정한다 (`expanded-popup.test.ts`).
 */
export function isFocusInExpandedPopup(active: Element): boolean {
  if (active.getAttribute('aria-expanded') === 'true') return true;
  const doc = active.ownerDocument;
  for (const trigger of doc.querySelectorAll('[aria-expanded="true"][aria-controls]')) {
    // `aria-controls` 는 공백 구분 id 목록이다 (ARIA IDREFS).
    const ids = (trigger.getAttribute('aria-controls') ?? '').split(/\s+/).filter(Boolean);
    for (const id of ids) {
      if (doc.getElementById(id)?.contains(active)) return true;
    }
  }
  return false;
}
