import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import type { BodyScreenInfo, ConstellationScreenInfo } from '@astro-simulator/core/scene';
import { LABEL_OFFSET_PX } from '@/lib/label-layout';
import { useSimStore } from '@/store/sim-store';
import { BodyLabels } from './body-labels';

/**
 * #1293 — 라벨 오버레이 배선 (토글 → 미렌더 · rAF 1 프레임 → 표시/숨김 · 클릭 → focusOn).
 * 배치 · 디클러터 규칙 자체는 `label-layout.test.ts` 가 잰다 — 여기서는 그 결과가 DOM 에 닿는지만 본다.
 */

let sentCommands: CoreCommand[] = [];
let screenRows: BodyScreenInfo[] = [];
let screenInfoAvailable = true;
let constellationRows: ConstellationScreenInfo[] = [];
vi.mock('@/core/sim-context', () => ({
  useSimConstellationScreenInfo: () => () => constellationRows,
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
  useSimBodyScreenInfo: () => (screenInfoAvailable ? () => screenRows : null),
}));

const LABEL_W = 40;
const LABEL_H = 16;

/** rAF 를 손으로 돌린다 — 프레임 1회 = 큐에 쌓인 콜백 실행. */
let rafQueue: FrameRequestCallback[] = [];
function runFrame() {
  const q = rafQueue;
  rafQueue = [];
  act(() => {
    for (const cb of q) cb(performance.now());
  });
}

const row = (id: string, x: number, y: number, radius = 4, onScreen = true): BodyScreenInfo => ({
  id,
  x,
  y,
  radius,
  inFront: onScreen,
  onScreen,
  cameraDistance: 1,
  embeddedInParent: false,
});

beforeEach(() => {
  sentCommands = [];
  screenInfoAvailable = true;
  constellationRows = [];
  rafQueue = [];
  vi.spyOn(window, 'requestAnimationFrame').mockImplementation((cb) => {
    rafQueue.push(cb);
    return rafQueue.length;
  });
  vi.spyOn(window, 'cancelAnimationFrame').mockImplementation(() => undefined);
  // jsdom 은 레이아웃이 없어 박스 크기가 0 이다 — 라벨 크기만 고정한다.
  vi.spyOn(HTMLElement.prototype, 'getBoundingClientRect').mockReturnValue({
    width: LABEL_W,
    height: LABEL_H,
    x: 0,
    y: 0,
    top: 0,
    left: 0,
    right: LABEL_W,
    bottom: LABEL_H,
    toJSON: () => ({}),
  });
  vi.spyOn(HTMLElement.prototype, 'clientWidth', 'get').mockReturnValue(1280);
  useSimStore.setState({ labelsVisible: true, selectedBodyId: null });
});

afterEach(() => {
  vi.restoreAllMocks();
});

const label = (id: string) => screen.getByTestId(`body-label-${id}`);

describe('BodyLabels', () => {
  it('labelsVisible=false (?labels=off) → 오버레이 미렌더', () => {
    useSimStore.setState({ labelsVisible: false });
    render(<BodyLabels />);
    expect(screen.queryByTestId('body-labels')).toBeNull();
  });

  it('scene 준비 전 (getBodyScreenInfo=null) → 미렌더', () => {
    screenInfoAvailable = false;
    render(<BodyLabels />);
    expect(screen.queryByTestId('body-labels')).toBeNull();
  });

  it('1 프레임 — 겹친 낮은 순위 · 화면 밖 · 모체 미선택 위성은 숨김, 나머지는 투영 위치 옆에 표시', () => {
    screenRows = [
      row('sun', 100, 100, 10),
      row('mercury', 100, 102), // 태양 라벨과 겹침 → 숨김
      row('earth', 400, 300, 5),
      row('moon', 600, 300), // 모체 (earth) 미선택 → 숨김
      row('mars', 800, 300, 4, false), // 화면 밖 → 숨김
    ];
    render(<BodyLabels />);
    runFrame();
    expect(label('sun')).toHaveAttribute('data-label-visible', 'true');
    expect(label('earth')).toHaveAttribute('data-label-visible', 'true');
    expect(label('mercury')).toHaveAttribute('data-label-visible', 'false');
    expect(label('moon')).toHaveAttribute('data-label-visible', 'false');
    expect(label('mars')).toHaveAttribute('data-label-visible', 'false');
    expect(label('mars').style.visibility).toBe('hidden');
    expect(label('earth').style.visibility).toBe('visible');
    expect(label('earth').style.transform).toBe(
      `translate3d(${400 + 5 + LABEL_OFFSET_PX}px, ${300 - LABEL_H / 2}px, 0)`,
    );
  });

  it('모체 선택 → 위성 라벨 후보', () => {
    screenRows = [row('earth', 400, 300, 5), row('moon', 600, 300)];
    useSimStore.setState({ selectedBodyId: 'earth' });
    render(<BodyLabels />);
    runFrame();
    expect(label('moon')).toHaveAttribute('data-label-visible', 'true');
    expect(label('earth')).toHaveAttribute('data-focused', 'true');
  });

  it('모체 구에 묻힌 위성 (embeddedInParent) → 모체 선택 중에도 숨김 (#1293 qa B1)', () => {
    screenRows = [row('jupiter', 400, 300, 90), { ...row('io', 467, 300), embeddedInParent: true }];
    useSimStore.setState({ selectedBodyId: 'jupiter' });
    render(<BodyLabels />);
    runFrame();
    expect(label('io')).toHaveAttribute('data-label-visible', 'false');
    expect(label('jupiter')).toHaveAttribute('data-label-visible', 'true');
  });

  it('라벨 위 휠 → 같은 델타로 캔버스에 재발행 (캔버스 줌 유지)', () => {
    screenRows = [row('jupiter', 400, 300)];
    const canvas = document.createElement('canvas');
    const received: WheelEvent[] = [];
    canvas.addEventListener('wheel', (e) => received.push(e));
    render(<BodyLabels wheelTargetRef={{ current: canvas }} />);
    runFrame();
    fireEvent.wheel(label('jupiter'), { deltaY: 120, clientX: 410, clientY: 305 });
    expect(received).toHaveLength(1);
    expect(received[0]!.deltaY).toBe(120);
    expect(received[0]!.clientX).toBe(410);
  });

  it('라벨 클릭 → focusOn 명령', () => {
    screenRows = [row('jupiter', 400, 300)];
    render(<BodyLabels />);
    runFrame();
    fireEvent.click(label('jupiter'));
    expect(sentCommands).toEqual([{ type: 'focusOn', bodyId: 'jupiter' }]);
  });

  describe('라벨 위 드래그 → 캔버스 (#1313)', () => {
    const THRESHOLD = { mouse: 5, touch: 10 };
    const setup = () => {
      screenRows = [row('jupiter', 400, 300)];
      const canvas = document.createElement('canvas');
      const received: PointerEvent[] = [];
      canvas.addEventListener('pointerdown', (e) => received.push(e as PointerEvent));
      canvas.addEventListener('pointermove', (e) => received.push(e as PointerEvent));
      render(<BodyLabels wheelTargetRef={{ current: canvas }} dragThresholdPx={THRESHOLD} />);
      runFrame();
      return received;
    };
    const down = (pointerType: string, x: number, y: number) =>
      fireEvent.pointerDown(label('jupiter'), {
        pointerId: 7,
        pointerType,
        isPrimary: true,
        clientX: x,
        clientY: y,
      });
    const move = (pointerType: string, x: number, y: number) =>
      fireEvent.pointerMove(label('jupiter'), {
        pointerId: 7,
        pointerType,
        clientX: x,
        clientY: y,
      });

    it('터치 임계 초과 이동 → 누른 지점 down + 현재 move 를 캔버스에 재발행, 뒤이은 click 은 포커스 안 함', () => {
      const received = setup();
      down('touch', 410, 305);
      move('touch', 415, 305); // 5px ≤ 터치 임계 10 — 아직 탭
      expect(received).toHaveLength(0);
      move('touch', 430, 305); // 20px > 10 — 드래그
      expect(received.map((e) => e.type)).toEqual(['pointerdown', 'pointermove']);
      expect(received[0]!.clientX).toBe(410);
      expect(received[0]!.pointerId).toBe(7);
      expect(received[1]!.clientX).toBe(430);
      fireEvent.click(label('jupiter'));
      expect(sentCommands).toEqual([]);
    });

    it('터치 임계 이내 이동 후 떼기 → 재발행 없음 · 탭 = focusOn (기존 동작)', () => {
      const received = setup();
      down('touch', 410, 305);
      move('touch', 418, 305); // 8px ≤ 10
      fireEvent.pointerUp(label('jupiter'), { pointerId: 7, pointerType: 'touch' });
      fireEvent.click(label('jupiter'));
      expect(received).toHaveLength(0);
      expect(sentCommands).toEqual([{ type: 'focusOn', bodyId: 'jupiter' }]);
    });

    it('마우스는 마우스 임계 (5) 로 가른다 — 8px 이동이면 드래그', () => {
      const received = setup();
      down('mouse', 410, 305);
      move('mouse', 418, 305);
      expect(received.map((e) => e.type)).toEqual(['pointerdown', 'pointermove']);
    });

    it('드래그 뒤 다음 탭은 다시 포커스한다 (삼킴 플래그는 다음 pointerdown 이 초기화)', () => {
      setup();
      down('touch', 410, 305);
      move('touch', 440, 305);
      // 캡처가 캔버스로 옮겨 가 이 제스처의 click 이 라벨에 오지 않은 경우를 흉내 — click 없이 다음 탭.
      down('touch', 410, 305);
      fireEvent.pointerUp(label('jupiter'), { pointerId: 7, pointerType: 'touch' });
      fireEvent.click(label('jupiter'));
      expect(sentCommands).toEqual([{ type: 'focusOn', bodyId: 'jupiter' }]);
    });

    it('dragThresholdPx 없으면 재발행하지 않는다 (종전 동작)', () => {
      screenRows = [row('jupiter', 400, 300)];
      const canvas = document.createElement('canvas');
      const received: Event[] = [];
      canvas.addEventListener('pointerdown', (e) => received.push(e));
      render(<BodyLabels wheelTargetRef={{ current: canvas }} />);
      runFrame();
      down('touch', 410, 305);
      move('touch', 480, 305);
      expect(received).toHaveLength(0);
    });
  });

  it('라벨은 touch-action: none — 브라우저 패닝이 터치 드래그를 가져가지 않게 (#1313)', () => {
    render(<BodyLabels />);
    expect(label('sun').className).toContain('touch-none');
  });

  it('컨테이너는 포인터를 통과시킨다 (캔버스 드래그 · 클릭 선택 유지 — D6)', () => {
    render(<BodyLabels />);
    expect(screen.getByTestId('body-labels').className).toContain('pointer-events-none');
    expect(label('sun').className).toContain('pointer-events-auto');
  });
});

/** #1373 PR2 결정 N1 ~ N4 · T2 — 별자리 이름이 같은 배치 패스로 DOM 에 닿는가. 규칙 자체는 `label-layout.test.ts`. */
describe('BodyLabels — 별자리 이름 (#1373 PR2)', () => {
  const crow = (id: string, x: number, y: number, onScreen = true): ConstellationScreenInfo => ({
    id,
    nameKo: `${id}자리`,
    x,
    y,
    inFront: onScreen,
    onScreen,
  });
  const cLabel = (id: string) => screen.getByTestId(`constellation-label-${id}`);

  it('행이 없으면 (꺼짐 · 생성 전) 별자리 DOM 0', () => {
    screenRows = [row('earth', 400, 300, 5)];
    render(<BodyLabels />);
    runFrame();
    runFrame();
    expect(screen.queryAllByTestId(/^constellation-label-/)).toHaveLength(0);
  });

  it('행 도착 → 이름 생성 · 기준점 중앙 정렬 표시 · body 라벨과 겹치면 별자리만 숨김', () => {
    screenRows = [row('earth', 400, 300, 5)];
    constellationRows = [crow('Ori', 800, 200), crow('Tau', 420, 300)];
    render(<BodyLabels />);
    runFrame(); // 이름 목록을 state 로 올린다
    runFrame(); // 재측정된 루프의 첫 배치
    expect(cLabel('Ori')).toHaveTextContent('Ori자리');
    expect(cLabel('Ori')).toHaveAttribute('data-label-visible', 'true');
    expect(cLabel('Ori').style.transform).toBe(
      `translate3d(${800 - LABEL_W / 2}px, ${200 - LABEL_H / 2}px, 0)`,
    );
    // Tau 박스 (400..440) 가 지구 라벨 (411..451) 과 겹친다 → body 우선.
    expect(cLabel('Tau')).toHaveAttribute('data-label-visible', 'false');
    expect(label('earth')).toHaveAttribute('data-label-visible', 'true');
  });

  it('기준점이 body 원반 안 → 숨김 (규칙 1b)', () => {
    screenRows = [row('jupiter', 600, 400, 80)];
    constellationRows = [crow('Sgr', 600, 470)];
    render(<BodyLabels />);
    runFrame();
    runFrame();
    expect(cLabel('Sgr')).toHaveAttribute('data-label-visible', 'false');
  });

  it('별자리를 끄면 (행 0) 다음 프레임에 전부 숨김', () => {
    constellationRows = [crow('Ori', 800, 200)];
    render(<BodyLabels />);
    runFrame();
    runFrame();
    expect(cLabel('Ori')).toHaveAttribute('data-label-visible', 'true');
    constellationRows = [];
    runFrame();
    expect(cLabel('Ori')).toHaveAttribute('data-label-visible', 'false');
    expect(cLabel('Ori').style.visibility).toBe('hidden');
  });

  it('N3 — 포인터를 받지 않고 · 버튼이 아니며 · 화면 장식 (aria-hidden)', () => {
    constellationRows = [crow('Ori', 800, 200)];
    render(<BodyLabels />);
    runFrame();
    runFrame();
    const el = cLabel('Ori');
    expect(el.tagName).toBe('SPAN');
    expect(el.className).toContain('pointer-events-none');
    expect(el).toHaveAttribute('aria-hidden', 'true');
    expect(el).not.toHaveAttribute('tabindex');
  });

  it('T2 — ?labels=off 면 별자리 이름도 없다 (오버레이 미렌더)', () => {
    useSimStore.setState({ labelsVisible: false });
    constellationRows = [crow('Ori', 800, 200)];
    render(<BodyLabels />);
    expect(screen.queryByTestId('constellation-label-Ori')).toBeNull();
  });
});
