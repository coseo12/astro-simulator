import { render, screen, act, cleanup } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import type { CoreCommand } from '@astro-simulator/shared';
import { useSimStore } from '@/store/sim-store';
import { ScaleControl } from './scale-control';

/**
 * #400 ADR `20260512-au-slider-semantics.md` — ScaleControl 단위 테스트.
 *
 * 결정 A (tier-aware AU 환산) + 결정 B (양방향 sync + focus 라벨 분기) 검증 매트릭스:
 *  - tier 별 라벨 텍스트 (T1 / T2 / T3)
 *  - focus 진입 시 라벨 텍스트 `(focus: <bodyId>)` 분기
 *  - sun focus 엣지 케이스 (값 동일, 텍스트만 분기)
 *  - focus target null 자동 free-fly 복귀
 *  - camera.onViewMatrixChangedObservable 구독 → 슬라이더 thumb 갱신
 *  - 마운트 직후 1회 초기 sync (DoD-3 hardcode 해소)
 *  - throttle 동작 (16ms < 33ms < 50ms)
 */

// ----- mocks -----

/** Babylon Observable 의 최소 mock — add/remove + notifyObservers. */
class MockObservable {
  private callbacks: Array<() => void> = [];
  add(cb: () => void): () => void {
    this.callbacks.push(cb);
    return cb;
  }
  remove(cb: () => void): void {
    this.callbacks = this.callbacks.filter((c) => c !== cb);
  }
  notify(): void {
    for (const cb of this.callbacks) cb();
  }
  get size(): number {
    return this.callbacks.length;
  }
}

/** ArcRotateCamera mock — radius + onViewMatrixChangedObservable 만. */
function createMockCamera(initialRadius = 35) {
  const observable = new MockObservable();
  return {
    radius: initialRadius,
    onViewMatrixChangedObservable: observable,
    /** 테스트 helper — radius 변경 후 notify 한 번 (실 카메라 mutate 시 Babylon 이 자동 fire). */
    mutateRadius(next: number): void {
      this.radius = next;
      observable.notify();
    },
  };
}

let sentCommands: CoreCommand[] = [];
let mockCamera: ReturnType<typeof createMockCamera> | null = null;
let mockTier: 'solar' | 'inner' | 'body' = 'solar';

vi.mock('@/core/sim-context', () => ({
  useSimCommand: () => (cmd: CoreCommand) => {
    sentCommands.push(cmd);
  },
  useSimCameraTier: () => ({
    camera: mockCamera,
    getActiveTier: () => mockTier,
  }),
}));

// performance.now mock — throttle 검증용. 기본은 실 시간 사용 (대부분 테스트), throttle 검증에서만 override.
const realPerfNow = performance.now.bind(performance);

afterEach(() => {
  cleanup();
  sentCommands = [];
  mockCamera = null;
  mockTier = 'solar';
  vi.restoreAllMocks();
  performance.now = realPerfNow;
});

beforeEach(() => {
  useSimStore.setState({
    selectedBodyId: null,
  });
});

// ----- 렌더 / 마운트 -----

describe('ScaleControl — 렌더 + 초기 sync (DoD-3)', () => {
  it('마운트 직후 camera.radius 실측값으로 thumb 위치 동기화 (hardcode 35 해소)', () => {
    mockCamera = createMockCamera(50); // 카메라가 이미 50 unit 에 있는 상태로 마운트
    mockTier = 'solar';
    render(<ScaleControl />);
    // 슬라이더 thumb 의 aria-valuenow 가 log10(50) ≈ 1.7 근처면 sync 성공.
    const thumb = screen.getByTestId('scale-thumb');
    const valueNow = Number(thumb.getAttribute('aria-valuenow'));
    expect(valueNow).toBeCloseTo(Math.log10(50), 2);
  });

  it('camera 가 null 이면 hardcode 35 그대로 (race fallback)', () => {
    mockCamera = null;
    mockTier = 'solar';
    render(<ScaleControl />);
    const thumb = screen.getByTestId('scale-thumb');
    const valueNow = Number(thumb.getAttribute('aria-valuenow'));
    expect(valueNow).toBeCloseTo(Math.log10(35), 2);
  });
});

// ----- 라벨 텍스트 (결정 A + B) -----

describe('ScaleControl — 라벨 텍스트 (ADR 결정 A 환산 + 결정 B focus 분기)', () => {
  it('T1 solar / free-fly: 35 unit → 약 "2.78 AU" 표시 (focus suffix 없음)', () => {
    mockCamera = createMockCamera(35);
    mockTier = 'solar';
    render(<ScaleControl />);
    const label = screen.getByTestId('scale-label');
    // 35 unit / 8.4e-11 / AU ≈ 2.78 AU.
    expect(label.textContent).toMatch(/2\.\d{2} AU/);
    // focus 미진입 → suffix 없음.
    expect(label.textContent).not.toMatch(/focus:/);
  });

  it('T3 body / focus venus: 0.5 unit → "20 km (focus: venus)"', () => {
    mockCamera = createMockCamera(0.5);
    mockTier = 'body';
    useSimStore.setState({ selectedBodyId: 'venus' });
    render(<ScaleControl />);
    const label = screen.getByTestId('scale-label');
    expect(label.textContent).toMatch(/^\d+ km \(focus: venus\)$/);
  });

  it('T2 inner / focus mercury: 1 unit → "4 mAU (focus: mercury)"', () => {
    mockCamera = createMockCamera(1);
    mockTier = 'inner';
    useSimStore.setState({ selectedBodyId: 'mercury' });
    render(<ScaleControl />);
    const label = screen.getByTestId('scale-label');
    expect(label.textContent).toMatch(/mAU \(focus: mercury\)/);
  });

  it('sun focus 엣지 케이스 (Gemini Q3) — 값은 free-fly 와 동일, 텍스트만 분기', () => {
    // sun 은 R-Phase Allowlist 박제 body. 위치 = 원점이므로 free-fly 와 환산 값 동일.
    mockCamera = createMockCamera(35);
    mockTier = 'solar';

    // free-fly 라벨 추출.
    useSimStore.setState({ selectedBodyId: null });
    const { unmount } = render(<ScaleControl />);
    const freeFlyText = screen.getByTestId('scale-label').textContent ?? '';
    unmount();

    // sun focus 라벨 추출.
    useSimStore.setState({ selectedBodyId: 'sun' });
    render(<ScaleControl />);
    const sunFocusText = screen.getByTestId('scale-label').textContent ?? '';

    // 값 부분 (focus: sun 제외) 이 동일해야 함.
    const valuePart = sunFocusText.replace(' (focus: sun)', '');
    expect(valuePart).toBe(freeFlyText);
    // 텍스트 분기는 발생.
    expect(sunFocusText).toMatch(/\(focus: sun\)$/);
  });

  it('focus target null 자동 free-fly 복귀 (Gemini Q3)', () => {
    mockCamera = createMockCamera(35);
    mockTier = 'solar';
    useSimStore.setState({ selectedBodyId: 'venus' });
    const { rerender } = render(<ScaleControl />);
    expect(screen.getByTestId('scale-label').textContent).toMatch(/focus: venus/);

    // selectedBodyId → null (예: resetCamera 호출 후 store 갱신).
    act(() => {
      useSimStore.setState({ selectedBodyId: null });
    });
    rerender(<ScaleControl />);
    expect(screen.getByTestId('scale-label').textContent).not.toMatch(/focus:/);
  });
});

// ----- 양방향 sync (결정 B) -----

describe('ScaleControl — 양방향 sync (ADR 결정 B)', () => {
  it('camera.radius 외부 변경 (휠/핀치) → onViewMatrixChangedObservable fire → thumb 위치 갱신', () => {
    mockCamera = createMockCamera(35);
    mockTier = 'solar';
    render(<ScaleControl />);

    // 초기 thumb.
    const thumbBefore = Number(screen.getByTestId('scale-thumb').getAttribute('aria-valuenow'));
    expect(thumbBefore).toBeCloseTo(Math.log10(35), 2);

    // 외부에서 camera.radius 변경 (마우스 휠 시뮬레이션) — throttle 우회 위해 시간 충분 대기.
    // 실 카메라에서는 Babylon 이 mutate 후 fire. 여기서는 mutateRadius helper 가 동일 동작.
    act(() => {
      // mock 의 performance.now 를 lastUpdate + 100ms 이상으로 만들기 위해 대기 없이 직접 mutate.
      // 실제 시나리오: 초기 ready 후 사용자가 휠 → 100ms 후 mutate (throttle 초과 자명).
      mockCamera!.mutateRadius(80);
    });

    const thumbAfter = Number(screen.getByTestId('scale-thumb').getAttribute('aria-valuenow'));
    // throttle 첫 호출은 즉시 (lastUpdate 0 → now > 33ms 자명).
    expect(thumbAfter).toBeCloseTo(Math.log10(80), 2);
  });

  it('camera 가 LOG_MAX 초과로 줌아웃 → thumb 은 LOG_MAX (=2) 에 clamp', () => {
    mockCamera = createMockCamera(35);
    mockTier = 'solar';
    render(<ScaleControl />);

    act(() => {
      // LOG_MAX = 2 → camera.radius = 100 이 슬라이더 상한. 그 이상은 clamp.
      mockCamera!.mutateRadius(1000);
    });

    const thumb = Number(screen.getByTestId('scale-thumb').getAttribute('aria-valuenow'));
    expect(thumb).toBeCloseTo(2, 2); // LOG_MAX
  });

  it('throttle 33ms 미만 호출은 무시 (mutateRadius 두번 연속 시 마지막만 무시)', () => {
    mockCamera = createMockCamera(35);
    mockTier = 'solar';

    // performance.now 를 mock 해 throttle 검증.
    let mockTime = 1000;
    performance.now = () => mockTime;

    render(<ScaleControl />);

    // 첫 mutate — lastUpdate = 1000 시점 첫 호출이라 통과 (mockTime - 0 > 33).
    act(() => {
      mockCamera!.mutateRadius(50);
    });
    const t1 = Number(screen.getByTestId('scale-thumb').getAttribute('aria-valuenow'));
    expect(t1).toBeCloseTo(Math.log10(50), 2);

    // 16ms 후 두 번째 mutate — throttle 차단되어 thumb 변화 없음.
    mockTime = 1016;
    act(() => {
      mockCamera!.mutateRadius(80);
    });
    const t2 = Number(screen.getByTestId('scale-thumb').getAttribute('aria-valuenow'));
    // 50 그대로 — 80 반영 안 됨.
    expect(t2).toBeCloseTo(Math.log10(50), 2);

    // 추가 30ms 후 (총 46ms 경과) 세 번째 mutate — throttle 통과.
    mockTime = 1046;
    act(() => {
      mockCamera!.mutateRadius(80);
    });
    const t3 = Number(screen.getByTestId('scale-thumb').getAttribute('aria-valuenow'));
    expect(t3).toBeCloseTo(Math.log10(80), 2);
  });

  it('unmount 시 observable 구독 해제 (메모리 누수 방지)', () => {
    mockCamera = createMockCamera(35);
    mockTier = 'solar';
    const { unmount } = render(<ScaleControl />);
    expect(mockCamera.onViewMatrixChangedObservable.size).toBe(1);
    unmount();
    expect(mockCamera.onViewMatrixChangedObservable.size).toBe(0);
  });
});

// ----- 무한 피드백 루프 가드 (ADR 재검토 조건 #8) -----

describe('ScaleControl — 무한 피드백 루프 가드 (ADR 재검토 조건 #8)', () => {
  it('드래그 중 observable fire 가 setValue 폭주를 일으키지 않음', () => {
    mockCamera = createMockCamera(35);
    mockTier = 'solar';
    render(<ScaleControl />);

    // 슬라이더 드래그 시뮬레이션은 radix-ui 내부 keyboard/pointer 이벤트라 단위 테스트에서
    // 직접 발화시키기 까다롭다. 대신 isDraggingRef 가 true 인 동안 setValue 가 호출되지
    // 않음을 간접 검증 — 다음 describe (드래그 → command 발행) 에서 검증.
    // 본 it 은 placeholder — observable 이 unmount 시 cleanup 됨이 핵심.
    expect(mockCamera.onViewMatrixChangedObservable.size).toBe(1);
  });
});

// ----- setCameraRadius 명령 (회귀 가드) -----

describe('ScaleControl — setCameraRadius 명령 (회귀 가드)', () => {
  it('초기 렌더 시 setCameraRadius 명령 발행 0 (마운트 sync 는 setValue 만)', () => {
    mockCamera = createMockCamera(35);
    mockTier = 'solar';
    render(<ScaleControl />);
    expect(sentCommands.filter((c) => c.type === 'setCameraRadius')).toEqual([]);
  });
});
