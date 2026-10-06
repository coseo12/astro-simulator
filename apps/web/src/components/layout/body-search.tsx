'use client';

import {
  useEffect,
  useId,
  useMemo,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
} from 'react';
import { Search } from 'lucide-react';
// named import 만 — `@astro-simulator/core` namespace 경유는 SSR 500 (body-menu.tsx 상단 주석 동형).
import { ephemeris as ephemerisApi, isRPhaseFocusable } from '@astro-simulator/core';
import { Modal } from '@/components/ui/modal';
import { useSimCommand } from '@/core/sim-context';
import { kindLabel } from '@/lib/body-info';
import { searchBodies } from '@/lib/body-search';

/** 단축키 안내 문구 — 트리거 title · 대화상자 안내가 같은 문자열을 쓴다. */
const SHORTCUT_HINT = '/ · Ctrl+K';
/** 대화상자 제목 id (Modal `aria-labelledby`). 화면에 하나뿐이라 고정값. */
const TITLE_ID = 'body-search-title';

/** 편집 요소 — `/` 가 글자 입력이어야 하는 곳. focus-quick-buttons Esc 가드의 판정에 `select`(타이핑 검색)를 더했다. */
function isEditableElement(el: Element | null): boolean {
  return (
    el instanceof HTMLInputElement ||
    el instanceof HTMLTextAreaElement ||
    el instanceof HTMLSelectElement ||
    (el instanceof HTMLElement && el.isContentEditable)
  );
}

/** Ctrl/⌘+K — Shift · Alt 조합은 브라우저 · OS 단축키(예: Firefox Ctrl+Shift+K 콘솔)라 건드리지 않는다. */
function isCommandK(e: KeyboardEvent): boolean {
  return (e.ctrlKey || e.metaKey) && !e.altKey && !e.shiftKey && e.key.toLowerCase() === 'k';
}

/** `/` — 수식키 없이. Shift 는 허용한다 (`/` 가 Shift 조합인 자판 배열이 있다). */
function isSlash(e: KeyboardEvent): boolean {
  return e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey;
}

/**
 * #1293 — 천체 검색 (상단 바 검색 버튼 + `/` · Ctrl/⌘+K).
 *
 * 「천체 ▾」 메뉴(12개 바로가기, `body-menu.tsx`)와 별개의 진입점이다 — 메뉴로 갈 수 없는 위성 · 왜소행성 · 혜성까지
 * 32 body 를 이름으로 찾는다. 선택은 메뉴와 같은 `focusOn` 명령이다.
 *
 * ## 셸 = 공용 `Modal` (#848)
 *   portal · focus trap · 직전 포커스 복원 · `data-modal-open` 을 그대로 얻는다. 초기 포커스만 입력창으로 돌린다
 *   (`initialFocusRef`).
 *
 * ## combobox + listbox (WAI-ARIA APG — 목록 자동완성)
 *   포커스는 입력창에 머물고 활성 항목은 `aria-activedescendant` 로 가리킨다. ↑/↓ 순환 · Enter 선택 · Esc 닫기.
 *   항목 `mousedown` 은 기본 동작을 막아 입력창 포커스를 지킨다 (클릭 선택 전에 blur 되지 않게).
 *
 * ## 키보드가 새지 않는 근거 (계약 D1 · D3)
 *   - **Esc** — window **capture** + `preventDefault()`. `focus-quick-buttons` 의 Esc→자유시점 리스너(bubble)는
 *     `defaultPrevented` 를 보고 물러난다 (천체 메뉴 · 표시 패널과 같은 신호). 그 리스너는 편집 요소 포커스 ·
 *     `data-modal-open` 으로도 물러나므로 이 경로에서는 3중이다.
 *   - **W/A/S/D/Q/E** — Babylon 키보드 입력은 canvas 포커스에서만 받고, 이동 루프도 입력창 포커스 중엔 건너뛴다
 *     (`packages/core/src/scene/camera.ts` `attachWasdControl`). 이 컴포넌트가 따로 막을 것은 없다.
 *   - **`/`** — 편집 요소 포커스 중에는 단축키로 보지 않는다 (글자 입력). Ctrl/⌘+K 는 편집 요소에서도 연다.
 *     한글 조합 중(`isComposing`)인 키는 단축키로 보지 않는다.
 */
export function BodySearch() {
  const [open, setOpen] = useState(false);
  const [query, setQuery] = useState('');
  const [activeIndex, setActiveIndex] = useState(0);
  const sendCommand = useSimCommand();
  const inputRef = useRef<HTMLInputElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const listId = useId();

  // 후보 = 데이터 SSoT 전체 중 R-Phase 진입 body (#402 — 메뉴의 disabled 와 같은 가드. 현행 32개 전부 진입).
  const candidates = useMemo(
    () => ephemerisApi.getSolarSystem().bodies.filter((b) => isRPhaseFocusable(b.id)),
    [],
  );
  const results = useMemo(() => searchBodies(candidates, query), [candidates, query]);
  const active = results[activeIndex] ?? null;
  const optionId = (bodyId: string) => `${listId}-option-${bodyId}`;

  const openSearch = () => {
    setQuery('');
    setActiveIndex(0);
    setOpen(true);
  };

  const choose = (bodyId: string) => {
    sendCommand({ type: 'focusOn', bodyId });
    setOpen(false);
  };

  // 단축키 — 상시 리스너 (bubble). 다른 모달이 열려 있으면 열지 않는다 (Modal 동시 open 미지원 계약, #889).
  useEffect(() => {
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.defaultPrevented || e.isComposing) return;
      const commandK = isCommandK(e);
      if (!commandK && !isSlash(e)) return;
      if (!commandK && isEditableElement(document.activeElement)) return;
      if (document.querySelector('[data-modal-open="true"]')) {
        // 이미 열린 검색창 안의 Ctrl/⌘+K 는 브라우저 기본 동작(검색창 이동)만 막는다.
        if (commandK && open) e.preventDefault();
        return;
      }
      e.preventDefault(); // `/` = Firefox 빠른 찾기 · Ctrl/⌘+K = 브라우저 검색창 — 둘 다 가로챈다.
      setQuery('');
      setActiveIndex(0);
      setOpen(true);
    };
    window.addEventListener('keydown', onKeyDown);
    return () => window.removeEventListener('keydown', onKeyDown);
  }, [open]);

  // 열린 동안 Esc 를 capture 로 먼저 받아 `preventDefault()` — 자유시점 리스너 비발화 신호 (계약 D3).
  useEffect(() => {
    if (!open) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape') return;
      e.preventDefault();
      setOpen(false);
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [open]);

  // 활성 항목이 목록 스크롤 밖이면 보이게 (jsdom 은 scrollIntoView 미구현 — 옵셔널 호출).
  useEffect(() => {
    if (!open || !active) return;
    const el = listRef.current?.querySelector<HTMLElement>(`[data-body-id="${active.id}"]`);
    el?.scrollIntoView?.({ block: 'nearest' });
  }, [open, active]);

  const handleInputKeyDown = (e: ReactKeyboardEvent<HTMLInputElement>) => {
    const count = results.length;
    switch (e.key) {
      case 'ArrowDown':
        e.preventDefault();
        if (count > 0) setActiveIndex((i) => (i + 1) % count);
        return;
      case 'ArrowUp':
        e.preventDefault();
        if (count > 0) setActiveIndex((i) => (i - 1 + count) % count);
        return;
      case 'Enter':
        e.preventDefault();
        if (active) choose(active.id);
        return;
      default:
        return;
    }
  };

  return (
    <>
      <button
        type="button"
        data-testid="body-search-trigger"
        aria-label="천체 검색"
        aria-haspopup="dialog"
        aria-expanded={open}
        aria-keyshortcuts="/ Control+K Meta+K"
        title={`천체 검색 (${SHORTCUT_HINT})`}
        onClick={openSearch}
        className={`num text-mini min-w-6 min-h-6 shrink-0 px-1 py-0.5 rounded-sm border inline-flex items-center justify-center transition-colors ${
          open
            ? 'bg-primary/20 text-fg-primary border-primary/40'
            : 'bg-bg-surface/80 text-fg-secondary border-border-subtle hover:bg-bg-elevated'
        }`}
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        <Search size={14} aria-hidden="true" />
      </button>
      <Modal
        open={open}
        onClose={() => setOpen(false)}
        title="천체 검색"
        titleId={TITLE_ID}
        testId="body-search"
        closeTestId="body-search-close"
        panelClassName="max-w-md max-h-[80vh]"
        initialFocusRef={inputRef}
      >
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          data-testid="body-search-input"
          aria-label="천체 이름"
          aria-autocomplete="list"
          aria-expanded={results.length > 0}
          aria-controls={listId}
          aria-activedescendant={active ? optionId(active.id) : undefined}
          placeholder="이름으로 찾기 — 목성, jup, Halley"
          autoComplete="off"
          spellCheck={false}
          enterKeyHint="go"
          value={query}
          onChange={(e) => {
            setQuery(e.target.value);
            setActiveIndex(0);
          }}
          onKeyDown={handleInputKeyDown}
          // 16px — iOS Safari 는 16px 미만 입력창에 포커스하면 화면을 확대한다.
          className="w-full bg-bg-base border border-border-subtle rounded-sm px-3 py-2 text-[16px] text-fg-primary placeholder:text-fg-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        />
        <p
          role="status"
          data-testid="body-search-status"
          className={results.length === 0 ? 'mt-3 text-caption text-fg-secondary' : 'sr-only'}
        >
          {results.length === 0 ? '일치하는 천체가 없습니다' : `결과 ${results.length}개`}
        </p>
        <ul
          ref={listRef}
          id={listId}
          role="listbox"
          aria-label="검색 결과"
          data-testid="body-search-results"
          className="mt-2 max-h-[50vh] overflow-y-auto flex flex-col gap-0.5"
        >
          {results.map((b, i) => {
            const selected = i === activeIndex;
            return (
              <li
                key={b.id}
                id={optionId(b.id)}
                role="option"
                aria-selected={selected}
                data-testid={`body-search-option-${b.id}`}
                data-body-id={b.id}
                onMouseDown={(e) => e.preventDefault()}
                onMouseMove={() => setActiveIndex(i)}
                onClick={() => choose(b.id)}
                className={`flex items-center justify-between gap-2 px-2 py-1.5 rounded-xs border cursor-pointer ${
                  selected
                    ? 'bg-primary/20 text-fg-primary border-primary/40'
                    : 'text-fg-secondary border-transparent'
                }`}
              >
                <span className="min-w-0 truncate">
                  <span className="text-body-sm">{b.nameKo}</span>
                  <span className="ml-2 text-caption text-fg-secondary">{b.nameEn}</span>
                </span>
                <span
                  data-testid="body-search-kind"
                  className="shrink-0 text-mini text-fg-secondary border border-border-subtle rounded-xs px-1"
                >
                  {kindLabel(b.kind)}
                </span>
              </li>
            );
          })}
        </ul>
      </Modal>
    </>
  );
}
