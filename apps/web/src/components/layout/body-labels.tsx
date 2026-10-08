'use client';

import {
  useEffect,
  useMemo,
  useRef,
  type PointerEvent as ReactPointerEvent,
  type RefObject,
} from 'react';
import { ephemeris as ephemerisApi, isRPhaseFocusable } from '@astro-simulator/core';
import { useSimBodyScreenInfo, useSimCommand } from '@/core/sim-context';
import { layoutLabels, type LabelCandidate } from '@/lib/label-layout';
import { useSimStore } from '@/store/sim-store';

/**
 * #1293 — 3D 이름 라벨 DOM 오버레이 (사용자 결정 2026-10-06: DOM 오버레이 · 기본 켜짐 · `?labels=off`).
 *
 * ## 갱신 경로 — React state 를 거치지 않는다
 * 라벨 32 개의 위치는 카메라가 움직이는 매 프레임 바뀐다. 매 프레임 setState 하면 32 개 리렌더가 렌더 루프와
 * 경쟁하므로, React 는 버튼을 **한 번** 만들고 rAF 루프가 `transform` · `visibility` 를 직접 쓴다.
 * 값이 바뀐 라벨만 쓴다 (style 쓰기 = style 재계산).
 *
 * ## 프레임 정합
 * core `getBodyScreenInfo()` 는 pull API 라 호출 시점의 view × projection 으로 투영한다. Babylon 렌더 루프의 rAF
 * 콜백 (프레임 위상 → `scene.render()`) 이 먼저 등록돼 있어 같은 틱에서 이 루프가 뒤에 돌고, 따라서 방금 그린
 * 프레임과 같은 행렬을 읽는다. 순서가 뒤집혀도 오차는 1 프레임이다.
 *
 * ## 박스 크기 캐시
 * 디클러터 (`label-layout.ts`) 는 라벨 박스 크기가 필요하다. 글자는 고정이라 마운트 · 웹폰트 로드 · 리사이즈 때만
 * 잰다. 숨김은 `visibility: hidden` 이라 박스가 남아 숨긴 채로도 잴 수 있다 — `display: none` 이면 0×0 이다.
 *
 * ## 포인터
 * 컨테이너는 `pointer-events: none` — 라벨 밖의 캔버스 드래그 · 클릭 선택 (#713 · #719) 이 그대로 캔버스로 간다.
 * 보이는 라벨만 `pointer-events: auto` 다 (숨긴 라벨은 `visibility: hidden` 이 포인터도 막는다).
 *
 * ## 라벨 위에서 시작한 드래그 (#1313)
 * 라벨은 버튼이라 그 위에서 시작한 드래그가 캔버스 회전에 닿지 않았다 (375 터치 · 1280 마우스 실측 — 80px 드래그에
 * 카메라 `alpha` 변화 0). 탭 · 클릭과 드래그를 **캔버스 클릭 선택과 같은 임계** (`dragThresholdPx` — sim-canvas 가
 * core `CLICK_DRAG_THRESHOLD_PX(_TOUCH)` 를 넘긴다) 로 가른다. 임계를 넘는 순간 down 이벤트를 캔버스에 재발행하고
 * 이후 이동은 Babylon 이 그 down 에서 거는 포인터 캡처로 캔버스가 직접 받는다 — 휠 재발행 (#1293) 과 같은 방식.
 * 드래그로 끝난 제스처의 `click` 은 포커스로 잇지 않는다. 좌표계도 캔버스와 같다 (Babylon `pointerX` = `clientX` −
 * 캔버스 rect, CSS px). 라벨은 `touch-action: none` — 아니면 브라우저가 터치 이동을 패닝으로 가져가 `pointercancel`
 * 로 끝난다 (캔버스와 같은 값).
 *
 * ## 키보드
 * 라벨은 매 프레임 움직이고 화면에 따라 나타났다 사라지므로 Tab 순서에 넣지 않는다 (`tabIndex=-1`). 키보드
 * 사용자의 천체 선택 경로는 「천체 ▾」 메뉴와 검색 (#1293 PR1) 이다.
 */

/** 라벨 대상 body (정적 — 데이터 SSoT `solar-system.json`). focusOn 이 받는 body 만 (allowlist). */
interface LabelBody {
  id: string;
  nameKo: string;
  kind: string;
  parentId: string | null;
}

/** 라벨 1개의 마지막으로 쓴 DOM 상태 — 바뀐 값만 쓰기 위한 캐시. */
interface LabelDomState {
  left: number;
  top: number;
  shown: boolean;
}

/** 탭 · 클릭 ↔ 드래그 판정 임계 (CSS px) — 캔버스 클릭 선택 (`sim-canvas.tsx`) 과 같은 값을 받는다. */
export interface LabelDragThresholdPx {
  mouse: number;
  touch: number;
}

/** 라벨 위에서 눌린 채 아직 임계를 넘지 않은 포인터 — 넘으면 캔버스로 넘기고 비운다. */
interface PendingLabelPointer {
  pointerId: number;
  down: PointerEvent;
}

export function BodyLabels({
  wheelTargetRef,
  dragThresholdPx,
}: {
  /**
   * 라벨 위 휠 · 드래그를 넘길 캔버스. 라벨은 클릭을 받으려고 `pointer-events: auto` 라 그 위의 휠이 캔버스 줌에 닿지 않는다
   * — 포커스 시 큰 행성 원반 위 라벨 띠에서 줌이 먹지 않는 체감 (#1293 리뷰 · qa 권고). 휠은 캔버스로 재발행한다.
   * 드래그는 `dragThresholdPx` 가 있을 때 같은 캔버스로 넘긴다 (#1313).
   */
  wheelTargetRef?: RefObject<HTMLCanvasElement | null>;
  /** 없으면 드래그를 넘기지 않는다 (종전 동작 — 라벨 위 드래그는 회전에 닿지 않는다). */
  dragThresholdPx?: LabelDragThresholdPx;
} = {}) {
  const getScreenInfo = useSimBodyScreenInfo();
  const visible = useSimStore((s) => s.labelsVisible);
  const focusedId = useSimStore((s) => s.selectedBodyId);

  const bodies = useMemo<LabelBody[]>(
    () =>
      ephemerisApi
        .getSolarSystem()
        .bodies.filter((b) => isRPhaseFocusable(b.id))
        .map((b) => ({ id: b.id, nameKo: b.nameKo, kind: b.kind, parentId: b.parentId ?? null })),
    [],
  );

  if (!visible || getScreenInfo === null) return null;
  return (
    <BodyLabelsLayer
      bodies={bodies}
      getScreenInfo={getScreenInfo}
      focusedId={focusedId}
      wheelTargetRef={wheelTargetRef}
      dragThresholdPx={dragThresholdPx}
    />
  );
}

function BodyLabelsLayer({
  bodies,
  getScreenInfo,
  focusedId,
  wheelTargetRef,
  dragThresholdPx,
}: {
  bodies: readonly LabelBody[];
  getScreenInfo: NonNullable<ReturnType<typeof useSimBodyScreenInfo>>;
  focusedId: string | null;
  wheelTargetRef?: RefObject<HTMLCanvasElement | null>;
  dragThresholdPx?: LabelDragThresholdPx;
}) {
  const sendCommand = useSimCommand();
  const containerRef = useRef<HTMLDivElement | null>(null);
  const labelRefs = useRef(new Map<string, HTMLButtonElement>());
  const pendingPointerRef = useRef<PendingLabelPointer | null>(null);
  // 드래그로 넘긴 제스처의 뒤이은 `click` 을 삼킨다. 다음 pointerdown 이 초기화한다 — 캡처가 캔버스로 옮겨 가
  // 라벨에 `click` 이 오지 않는 경우에도 다음 탭이 막히지 않는다.
  const suppressClickRef = useRef(false);

  const handlePointerDown = (e: ReactPointerEvent<HTMLButtonElement>) => {
    suppressClickRef.current = false;
    // 두 번째 손가락 (핀치 등) 은 다루지 않는다 — 첫 포인터만 탭 ↔ 드래그를 가른다.
    if (!dragThresholdPx || !e.isPrimary) return;
    pendingPointerRef.current = { pointerId: e.pointerId, down: e.nativeEvent };
    // 마우스가 임계 전에 라벨 밖으로 나가도 move 를 받게 잡는다 (터치는 암시적 캡처). jsdom 등 미지원 환경은 건너뛴다.
    try {
      e.currentTarget.setPointerCapture?.(e.pointerId);
    } catch {
      // 비활성 포인터 — 캡처 없이도 탭 판정은 동작한다.
    }
  };

  const handlePointerMove = (e: ReactPointerEvent<HTMLButtonElement>) => {
    const pending = pendingPointerRef.current;
    if (!pending || !dragThresholdPx || pending.pointerId !== e.pointerId) return;
    const threshold = e.pointerType === 'touch' ? dragThresholdPx.touch : dragThresholdPx.mouse;
    const moved = Math.hypot(e.clientX - pending.down.clientX, e.clientY - pending.down.clientY);
    // 캔버스 클릭 판정과 같은 경계 — `moved > threshold` 가 드래그다.
    if (moved <= threshold) return;
    pendingPointerRef.current = null;
    suppressClickRef.current = true;
    const canvas = wheelTargetRef?.current;
    if (!canvas) return;
    // 누른 지점에서 down 을 재발행해야 회전량 · 캔버스 클릭 판정 (down→up 거리) 이 시작점 기준이 된다.
    canvas.dispatchEvent(new PointerEvent('pointerdown', pending.down));
    canvas.dispatchEvent(new PointerEvent('pointermove', e.nativeEvent));
  };

  const handlePointerEnd = (e: ReactPointerEvent<HTMLButtonElement>) => {
    if (pendingPointerRef.current?.pointerId === e.pointerId) pendingPointerRef.current = null;
  };

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;
    const labels = labelRefs.current;
    const sizes = new Map<string, { width: number; height: number }>();
    const domState = new Map<string, LabelDomState>();
    let viewportWidth = container.clientWidth;

    const measure = () => {
      viewportWidth = container.clientWidth;
      for (const [id, el] of labels) {
        const r = el.getBoundingClientRect();
        sizes.set(id, { width: r.width, height: r.height });
      }
    };
    measure();
    // 웹폰트가 늦게 오면 글자 폭이 바뀐다 — 로드 뒤 한 번 더 잰다.
    let disposed = false;
    void document.fonts?.ready.then(() => {
      if (!disposed) measure();
    });
    const resizeObserver = new ResizeObserver(measure);
    resizeObserver.observe(container);

    const bodyById = new Map(bodies.map((b) => [b.id, b]));
    const candidates: LabelCandidate[] = [];
    let raf = 0;

    const frame = () => {
      raf = requestAnimationFrame(frame);
      candidates.length = 0;
      for (const row of getScreenInfo()) {
        const body = bodyById.get(row.id);
        const size = sizes.get(row.id);
        if (!body || !size) continue;
        candidates.push({
          id: row.id,
          kind: body.kind,
          parentId: body.parentId,
          x: row.x,
          y: row.y,
          radius: row.radius,
          onScreen: row.onScreen,
          distance: row.cameraDistance,
          embedded: row.embeddedInParent,
          width: size.width,
          height: size.height,
        });
      }
      // 선택은 store 에서 매 프레임 읽는다 — prop 은 강조 스타일 (리렌더) 용이고 루프는 재시작하지 않는다.
      const placed = layoutLabels(candidates, {
        focusedId: useSimStore.getState().selectedBodyId,
        viewportWidth,
      });
      const shownBoxes = new Map(placed.map((b) => [b.id, b]));
      for (const [id, el] of labels) {
        const box = shownBoxes.get(id);
        const prev = domState.get(id);
        if (box) {
          if (!prev || !prev.shown || prev.left !== box.left || prev.top !== box.top) {
            el.style.transform = `translate3d(${box.left}px, ${box.top}px, 0)`;
            if (!prev?.shown) el.style.visibility = 'visible';
            domState.set(id, { left: box.left, top: box.top, shown: true });
            el.dataset.labelVisible = 'true';
          }
        } else if (!prev || prev.shown) {
          el.style.visibility = 'hidden';
          el.dataset.labelVisible = 'false';
          domState.set(id, { left: prev?.left ?? 0, top: prev?.top ?? 0, shown: false });
        }
      }
    };
    raf = requestAnimationFrame(frame);

    return () => {
      disposed = true;
      cancelAnimationFrame(raf);
      resizeObserver.disconnect();
    };
  }, [bodies, getScreenInfo]);

  return (
    <div
      ref={containerRef}
      data-testid="body-labels"
      className="absolute inset-0 overflow-hidden pointer-events-none"
    >
      {bodies.map((b) => (
        <button
          key={b.id}
          ref={(el) => {
            if (el) labelRefs.current.set(b.id, el);
            else labelRefs.current.delete(b.id);
          }}
          type="button"
          tabIndex={-1}
          data-testid={`body-label-${b.id}`}
          data-body-label={b.id}
          data-label-visible="false"
          data-focused={focusedId === b.id ? 'true' : undefined}
          onPointerDown={handlePointerDown}
          onPointerMove={handlePointerMove}
          onPointerUp={handlePointerEnd}
          onPointerCancel={handlePointerEnd}
          onClick={() => {
            if (suppressClickRef.current) {
              suppressClickRef.current = false;
              return;
            }
            sendCommand({ type: 'focusOn', bodyId: b.id });
          }}
          // 휠은 캔버스로 — 같은 좌표 · 델타로 재발행한다 (Babylon 은 캔버스의 `wheel` 을 듣는다).
          onWheel={(e) =>
            wheelTargetRef?.current?.dispatchEvent(new WheelEvent('wheel', e.nativeEvent))
          }
          // hud-chip = 밝은 천체 위에서도 대비 AA 를 보장하는 backing (#749). 단 blur 는 끈다 — 32 개 라벨이
          // 매 프레임 다시 그려지는 캔버스 위에서 backdrop-filter 를 돌리면 합성 비용이 크고, 대비는 backing 이 담당한다.
          className={`hud-chip pointer-events-auto touch-none absolute left-0 top-0 whitespace-nowrap px-1.5 py-0.5 text-mini leading-none cursor-pointer ${
            focusedId === b.id ? 'text-fg-primary border-primary/60' : 'text-fg-secondary'
          }`}
          style={{ visibility: 'hidden', backdropFilter: 'none', WebkitBackdropFilter: 'none' }}
        >
          {b.nameKo}
        </button>
      ))}
    </div>
  );
}
