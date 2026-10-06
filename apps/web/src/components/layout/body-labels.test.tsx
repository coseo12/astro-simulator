import { act, fireEvent, render, screen } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import type { BodyScreenInfo } from '@astro-simulator/core/scene';
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
vi.mock('@/core/sim-context', () => ({
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
});

beforeEach(() => {
  sentCommands = [];
  screenInfoAvailable = true;
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

  it('라벨 클릭 → focusOn 명령', () => {
    screenRows = [row('jupiter', 400, 300)];
    render(<BodyLabels />);
    runFrame();
    fireEvent.click(label('jupiter'));
    expect(sentCommands).toEqual([{ type: 'focusOn', bodyId: 'jupiter' }]);
  });

  it('컨테이너는 포인터를 통과시킨다 (캔버스 드래그 · 클릭 선택 유지 — D6)', () => {
    render(<BodyLabels />);
    expect(screen.getByTestId('body-labels').className).toContain('pointer-events-none');
    expect(label('sun').className).toContain('pointer-events-auto');
  });
});
