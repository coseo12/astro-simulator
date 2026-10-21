'use client';

import { ChevronLeft, ChevronRight, ChevronUp, X } from 'lucide-react';
import {
  useEffect,
  useId,
  useRef,
  useState,
  type KeyboardEvent as ReactKeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { useTourController, type TourController } from '@/core/use-tour-controller';
import { TOURS, getTour, type TourDef } from '@/lib/tours';
import { useSimStore } from '@/store/sim-store';
import { useTourStore } from '@/store/tour-store';

/**
 * #1390 — 교육 모드 가이드 투어 카드 (ADR `docs/decisions/20261021-1390-education-tour.md` 결정 E5 · E7).
 *
 * - **한 컨테이너의 두 보기** (§교차검증 합의 8) — 투어 없음 = 목록 보기, 투어 중 = 단계 보기. 같은 `role="region"` 이라 보기
 *   전환 때 포커스 위치 계약이 이 컴포넌트 안에서 닫힌다: 시작 → 「다음」, 단계 이동 → 누른 버튼 그대로 (마지막 단계의 「완료」 는
 *   같은 요소), 종료 → 목록의 그 투어 항목.
 * - **위치** — 하단 중앙 · 타임바 (`h-16`) 위 8px, 최대 폭 560px. 375 (`max-sm`) 는 좌우 8px 전폭 바텀시트이고 최대 높이 40vh
 *   (넘치면 본문 스크롤) · 접기 → 1줄 칩. 접힘은 단계가 바뀌어도 유지한다.
 * - **키** — 포커스가 카드 안에 있을 때만: `→` 다음 · `←` 이전 · `Esc` 종료. 카드 밖은 기존 의미 그대로 (캔버스 화살표 = 회전,
 *   `Esc` = 자유시점 → 이탈 안내). `Esc` 는 window capture 에서 `preventDefault()` — `focus-quick-buttons` 의 자유시점 리스너
 *   (bubble) 가 `defaultPrevented` 로 물러난다 (표시 패널 · 모달과 같은 방식 — #1265 Amendment 1).
 * - 비모달 — 포커스 트랩 없음. 단계 제목 · 본문은 `aria-live="polite"` 로 낭독된다.
 *
 * 교육 모드가 아니면 아무것도 그리지 않지만 **마운트는 유지**한다 — 모드 전환 (= 투어 종료) 의 복원이 컨트롤러에서 돌아야 한다.
 */

/** 카드 위치 — 타임바 (64px) 위 8px. 375 는 좌우 8px 전폭, `sm` 이상은 가운데 560px. */
const CARD_POSITION =
  'absolute z-[var(--z-hud)] bottom-[72px] inset-x-2 sm:inset-x-auto sm:left-1/2 sm:-translate-x-1/2 sm:w-[560px] sm:max-w-[calc(100vw-1rem)]';

/** 카드 1차 조작 버튼 — 터치 타깃 32px 이상 (결정 E7). */
const ACTION_BUTTON =
  'inline-flex items-center justify-center gap-1 min-h-8 min-w-8 px-2.5 rounded-sm border text-body-sm transition-colors focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60';

const DRIFT_NOTICE = '장면을 직접 바꿨습니다. 투어는 이 단계에 머뭅니다.';

export function TourCard() {
  const mode = useSimStore((s) => s.mode);
  const controller = useTourController();
  if (mode !== 'education') return null;
  return <TourCardView controller={controller} />;
}

function TourCardView({ controller }: { controller: TourController }) {
  const activeTourId = useTourStore((s) => s.activeTourId);
  const stepIndex = useTourStore((s) => s.stepIndex);
  const pendingTourId = useTourStore((s) => s.pendingStart?.tourId ?? null);
  const drift = useTourStore((s) => s.drift);
  const unavailable = useTourStore((s) => s.unavailable);
  const error = useTourStore((s) => s.error);
  const tour = activeTourId === null ? null : getTour(activeTourId);

  const regionRef = useRef<HTMLElement | null>(null);
  const nextRef = useRef<HTMLButtonElement | null>(null);
  const chipRef = useRef<HTMLButtonElement | null>(null);
  const collapseRef = useRef<HTMLButtonElement | null>(null);
  const listRef = useRef<HTMLUListElement | null>(null);
  const titleId = useId();
  const [collapsed, setCollapsed] = useState(false);
  /** 접기/펼치기를 누른 직후에만 반대쪽 버튼으로 포커스를 옮긴다 (누른 버튼이 언마운트돼 body 로 빠지지 않게). */
  const focusAfterToggle = useRef(false);
  /** 카드에서 끝낸 투어 — 목록이 다시 보이면 그 항목으로 포커스. */
  const endedTourIdRef = useRef<string | null>(null);
  const prevActiveRef = useRef<string | null>(activeTourId);

  // 시작 (목록 → 단계) 이면 「다음」 으로, 끝 (단계 → 목록) 이면 그 투어 항목으로.
  useEffect(() => {
    const prev = prevActiveRef.current;
    prevActiveRef.current = activeTourId;
    if (prev === null && activeTourId !== null) {
      (nextRef.current ?? chipRef.current)?.focus();
    } else if (activeTourId === null && endedTourIdRef.current !== null) {
      const id = endedTourIdRef.current;
      endedTourIdRef.current = null;
      listRef.current?.querySelector<HTMLButtonElement>(`[data-tour-id="${id}"]`)?.focus();
    }
  }, [activeTourId]);

  useEffect(() => {
    if (!focusAfterToggle.current) return;
    focusAfterToggle.current = false;
    (collapsed ? chipRef : collapseRef).current?.focus();
  }, [collapsed]);

  const endFromCard = () => {
    endedTourIdRef.current = activeTourId;
    controller.end();
  };

  // Esc — 포커스가 카드 안일 때만 투어 종료 (window capture + preventDefault — 모듈 머리 주석).
  useEffect(() => {
    if (activeTourId === null) return;
    const onKeyDown = (e: KeyboardEvent) => {
      if (e.key !== 'Escape' || e.defaultPrevented) return;
      const active = document.activeElement;
      if (!active || !regionRef.current?.contains(active)) return;
      e.preventDefault();
      endedTourIdRef.current = useTourStore.getState().activeTourId;
      controller.end();
    };
    window.addEventListener('keydown', onKeyDown, { capture: true });
    return () => window.removeEventListener('keydown', onKeyDown, { capture: true });
  }, [activeTourId, controller]);

  if (tour === null) {
    return (
      <TourRegion regionRef={regionRef} titleId={titleId}>
        <TourListView
          titleId={titleId}
          listRef={listRef}
          pendingTourId={pendingTourId}
          error={error}
          onStart={controller.start}
        />
      </TourRegion>
    );
  }

  const step = tour.steps[stepIndex];
  if (!step) return null;
  const total = tour.steps.length;
  const isFirst = stepIndex === 0;
  const isLast = stepIndex === total - 1;
  const progressLabel = `${stepIndex + 1} / ${total}`;

  if (collapsed) {
    return (
      <TourRegion regionRef={regionRef} titleId={titleId} compact>
        <span id={titleId} className="sr-only">
          {tour.title}
        </span>
        <button
          ref={chipRef}
          type="button"
          data-testid="tour-expand"
          aria-label={`${tour.title} 투어 카드 펼치기 (${stepIndex + 1}/${total}단계)`}
          onClick={() => {
            focusAfterToggle.current = true;
            setCollapsed(false);
          }}
          className={`${ACTION_BUTTON} w-full justify-between bg-bg-surface/95 backdrop-blur border-border-subtle text-fg-primary shadow-lg`}
        >
          <span className="num">
            {stepIndex + 1}/{total} · {tour.shortTitle}
          </span>
          <ChevronUp size={14} aria-hidden="true" />
        </button>
      </TourRegion>
    );
  }

  const handleKeyDown = (e: ReactKeyboardEvent<HTMLElement>) => {
    if (e.key !== 'ArrowRight' && e.key !== 'ArrowLeft') return;
    if (e.altKey || e.ctrlKey || e.metaKey || e.shiftKey) return;
    e.preventDefault();
    if (e.key === 'ArrowRight' && !isLast) controller.next();
    if (e.key === 'ArrowLeft' && !isFirst) controller.prev();
  };

  const unavailableReasons = [...new Set(unavailable.map((u) => u.reason))];

  return (
    <TourRegion regionRef={regionRef} titleId={titleId} onKeyDown={handleKeyDown}>
      <div className="flex shrink-0 items-center gap-2 px-3 pt-2.5 pb-2">
        <h2 id={titleId} className="min-w-0 flex-1 truncate text-body-sm text-fg-secondary">
          {tour.title}
        </h2>
        <span data-testid="tour-progress" className="num shrink-0 text-caption text-fg-secondary">
          <span className="sr-only">단계 </span>
          {progressLabel}
        </span>
        <button
          ref={collapseRef}
          type="button"
          data-testid="tour-collapse"
          aria-label="투어 카드 접기"
          onClick={() => {
            focusAfterToggle.current = true;
            setCollapsed(true);
          }}
          className={`${ACTION_BUTTON} sm:hidden border-transparent text-fg-secondary hover:bg-bg-elevated`}
        >
          <ChevronUp size={14} aria-hidden="true" className="rotate-180" />
        </button>
        <button
          type="button"
          data-testid="tour-close"
          aria-label="투어 종료"
          title="투어 종료 (Esc)"
          onClick={endFromCard}
          className={`${ACTION_BUTTON} border-transparent text-fg-secondary hover:bg-bg-elevated`}
        >
          <X size={14} aria-hidden="true" />
        </button>
      </div>
      <div aria-hidden="true" className="mx-3 h-0.5 shrink-0 rounded-full bg-border-subtle">
        <div
          className="h-full rounded-full bg-primary transition-[width]"
          style={{
            width: `${((stepIndex + 1) / total) * 100}%`,
            transitionDuration: 'var(--duration-fast)',
          }}
        />
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto px-3 pt-2.5 pb-2">
        <div aria-live="polite" aria-atomic="true">
          <h3 data-testid="tour-step-title" className="text-body font-semibold text-fg-primary">
            {step.title}
          </h3>
          <p data-testid="tour-step-body" className="mt-1 text-body-sm text-fg-secondary">
            {step.body}
          </p>
        </div>
        {unavailableReasons.length > 0 ? (
          <p data-testid="tour-unavailable" className="mt-2 text-caption text-fg-secondary">
            {unavailableReasons.join(' · ')}
          </p>
        ) : null}
        {error !== null ? (
          <p data-testid="tour-error" role="alert" className="mt-2 text-caption text-star-m">
            {error}
          </p>
        ) : null}
        <div role="status" className="empty:hidden">
          {drift.length > 0 ? (
            <div
              data-testid="tour-drift"
              data-drift-axes={drift.join(' ')}
              className="mt-2 flex flex-wrap items-center gap-2 rounded-sm border border-primary/40 bg-primary/10 px-2 py-1.5"
            >
              <span className="text-caption text-fg-primary">{DRIFT_NOTICE}</span>
              <button
                type="button"
                data-testid="tour-return"
                onClick={() => {
                  controller.returnToScene();
                  // 이 버튼은 장면이 돌아오면 사라진다 — 포커스를 「다음」 으로 넘겨 body 로 빠지지 않게.
                  nextRef.current?.focus();
                }}
                className={`${ACTION_BUTTON} border-primary/40 bg-primary/20 text-fg-primary hover:bg-primary/30`}
              >
                이 장면으로 돌아가기
              </button>
            </div>
          ) : null}
        </div>
      </div>
      <div className="flex shrink-0 items-center justify-between gap-2 border-t border-border-subtle px-3 py-2">
        <button
          type="button"
          data-testid="tour-prev"
          // 첫 단계에서도 포커스를 받는다 (`aria-disabled`) — 네이티브 disabled 면 「이전」 으로 첫 단계에 온 순간 포커스가 body 로 빠진다.
          aria-disabled={isFirst}
          onClick={() => {
            if (!isFirst) controller.prev();
          }}
          className={`${ACTION_BUTTON} border-border-subtle ${
            isFirst
              ? 'text-fg-disabled cursor-not-allowed'
              : 'text-fg-secondary hover:bg-bg-elevated'
          }`}
        >
          <ChevronLeft size={14} aria-hidden="true" />
          이전
        </button>
        <span className="hidden text-mini text-fg-secondary sm:inline" aria-hidden="true">
          ← → 단계 이동 · Esc 종료
        </span>
        <button
          ref={nextRef}
          type="button"
          data-testid="tour-next"
          onClick={() => (isLast ? endFromCard() : controller.next())}
          className={`${ACTION_BUTTON} border-primary/40 bg-primary/20 text-fg-primary hover:bg-primary/30`}
        >
          {isLast ? '완료' : '다음'}
          {isLast ? null : <ChevronRight size={14} aria-hidden="true" />}
        </button>
      </div>
    </TourRegion>
  );
}

function TourRegion({
  regionRef,
  titleId,
  compact = false,
  onKeyDown,
  children,
}: {
  regionRef: RefObject<HTMLElement | null>;
  titleId: string;
  compact?: boolean;
  onKeyDown?: (e: ReactKeyboardEvent<HTMLElement>) => void;
  children: ReactNode;
}) {
  return (
    <section
      ref={regionRef}
      role="region"
      aria-labelledby={titleId}
      data-testid="tour-card"
      data-compact={compact ? 'true' : undefined}
      onKeyDown={onKeyDown}
      className={`${CARD_POSITION} ${
        compact
          ? ''
          : 'flex max-h-[40vh] flex-col rounded-md border border-border-subtle bg-bg-surface/95 shadow-lg backdrop-blur'
      }`}
    >
      {children}
    </section>
  );
}

function TourListView({
  titleId,
  listRef,
  pendingTourId,
  error,
  onStart,
}: {
  titleId: string;
  listRef: RefObject<HTMLUListElement | null>;
  pendingTourId: string | null;
  error: string | null;
  onStart: (tourId: string) => void;
}) {
  return (
    <div className="flex min-h-0 flex-col gap-2 overflow-y-auto p-3">
      <div>
        <h2 id={titleId} className="text-body font-semibold text-fg-primary">
          가이드 투어
        </h2>
        <p className="mt-0.5 text-caption text-fg-secondary">
          투어를 고르면 장면이 단계별로 바뀝니다. 중간에 언제든 직접 둘러볼 수 있습니다.
        </p>
      </div>
      {error !== null ? (
        <p data-testid="tour-error" role="alert" className="text-caption text-star-m">
          {error}
        </p>
      ) : null}
      <ul ref={listRef} role="list" data-testid="tour-list" className="flex flex-col gap-1.5">
        {TOURS.map((t) => (
          <TourListItem key={t.id} tour={t} pending={pendingTourId === t.id} onStart={onStart} />
        ))}
      </ul>
    </div>
  );
}

function TourListItem({
  tour,
  pending,
  onStart,
}: {
  tour: TourDef;
  pending: boolean;
  onStart: (tourId: string) => void;
}) {
  return (
    <li>
      <button
        type="button"
        data-testid={`tour-item-${tour.id}`}
        data-tour-id={tour.id}
        aria-busy={pending}
        onClick={() => onStart(tour.id)}
        className="flex min-h-8 w-full flex-col items-start gap-0.5 rounded-sm border border-border-subtle px-3 py-2 text-left transition-colors hover:bg-bg-elevated focus:outline-none focus-visible:ring-2 focus-visible:ring-primary/60"
        style={{ transitionDuration: 'var(--duration-fast)' }}
      >
        <span className="flex w-full items-center justify-between gap-2 text-body-sm text-fg-primary">
          {tour.title}
          <span className="num shrink-0 text-caption text-fg-secondary">
            {pending ? '준비 중…' : `${tour.steps.length}단계`}
          </span>
        </span>
        <span className="text-caption text-fg-secondary">{tour.summary}</span>
      </button>
    </li>
  );
}
