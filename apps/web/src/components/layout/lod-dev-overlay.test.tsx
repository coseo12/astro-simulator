/**
 * LOD dev overlay 회귀 가드 (#388)
 *
 * 검증 대상:
 *  - URL 파라미터 부재 시 컴포넌트 미노출 (DCE 외 런타임 가드)
 *  - `?debug=draw-calls` (집계 모드) 정상 표시 — 기존 P11-B 워크플로 회귀 0 보장
 *  - `?lodOverlay=1` (상세 모드) — body 별 LOD/coverage/pxDiameter 표시 + 색상 코딩
 *  - prod 빌드 가드는 `process.env.NODE_ENV` 리터럴 치환에 의존 — vitest 환경에선 dev 경로 검증
 *
 * `__solarScene` 글로벌은 sim-canvas 가 dev 빌드에서 노출. 본 테스트는 그 mock 을 직접 주입.
 */
import { render, screen, act } from '@testing-library/react';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { LodDevOverlay } from './lod-dev-overlay';

// `vi.useFakeTimers` 로 `setInterval` 1초 tick 을 즉시 실행 가능하게 함.
// 컴포넌트는 mount 후 첫 tick 에서 stats/info 수집.

interface MockBodyInfo {
  id: string;
  level: 'high' | 'mid' | 'low';
  screenCoverage: number;
  pxDiameter: number;
  cameraDistanceMeters: number;
}

function setSearch(params: string) {
  // jsdom URL 변경 — `URLSearchParams(window.location.search)` 가 정확히 읽도록.
  window.history.replaceState({}, '', `/?${params}`);
}

function installScene(opts: {
  stats?: { high: number; mid: number; low: number; override: 'auto' | 'high' | 'mid' | 'low' };
  info?: MockBodyInfo[];
}) {
  Object.defineProperty(window, '__solarScene', {
    configurable: true,
    writable: true,
    value: {
      getLodStats: () => opts.stats ?? { high: 1, mid: 0, low: 23, override: 'auto' as const },
      getLodInfo: () => opts.info ?? [],
    },
  });
}

function clearScene() {
  // jsdom 에서 configurable 객체 제거.
  delete (window as unknown as { __solarScene?: unknown }).__solarScene;
}

describe('LodDevOverlay (#388)', () => {
  beforeEach(() => {
    vi.useFakeTimers();
    setSearch('');
    clearScene();
  });

  afterEach(() => {
    vi.useRealTimers();
    clearScene();
  });

  it('URL 파라미터 부재 시 렌더링 안 함', () => {
    installScene({});
    const { container } = render(<LodDevOverlay />);
    act(() => {
      vi.advanceTimersByTime(2000);
    });
    expect(container.firstChild).toBeNull();
  });

  it('`?debug=draw-calls` (집계 모드) — H/M/L 분포 박제', () => {
    setSearch('debug=draw-calls');
    installScene({
      stats: { high: 5, mid: 3, low: 16, override: 'auto' },
    });
    render(<LodDevOverlay />);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    const overlay = screen.getByTestId('lod-dev-overlay');
    expect(overlay).toHaveTextContent('total 24');
    expect(overlay).toHaveTextContent('H:5');
    expect(overlay).toHaveTextContent('M:3');
    expect(overlay).toHaveTextContent('L:16');
    expect(overlay).toHaveTextContent('(auto)');
    // 집계 모드는 detailed 마커 없음.
    expect(overlay).not.toHaveAttribute('data-overlay-mode', 'detailed');
  });

  it('`?lodOverlay=1` (상세 모드) — body 별 LOD/coverage/pxDiameter 행 박제', () => {
    setSearch('lodOverlay=1');
    installScene({
      stats: { high: 1, mid: 1, low: 1, override: 'auto' },
      info: [
        {
          id: 'sun',
          level: 'high',
          screenCoverage: 71.5,
          pxDiameter: 143.0,
          cameraDistanceMeters: 1.5e11,
        },
        {
          id: 'mercury',
          level: 'mid',
          screenCoverage: 12.3,
          pxDiameter: 24.6,
          cameraDistanceMeters: 5.79e10,
        },
        {
          id: 'venus',
          level: 'low',
          screenCoverage: 4.0,
          pxDiameter: 8.0,
          cameraDistanceMeters: 1.08e11,
        },
      ],
    });
    render(<LodDevOverlay />);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    const overlay = screen.getByTestId('lod-dev-overlay');
    expect(overlay).toHaveAttribute('data-overlay-mode', 'detailed');

    // 헤더 행 (집계).
    expect(overlay).toHaveTextContent('total 3');

    // body 별 행 검증 — DoD-3.
    const sunRow = screen.getByTestId('lod-row-sun');
    expect(sunRow).toHaveAttribute('data-lod-level', 'high');
    expect(sunRow).toHaveTextContent('sun');
    expect(sunRow).toHaveTextContent('71.50');
    expect(sunRow).toHaveTextContent('143.00');

    const mercuryRow = screen.getByTestId('lod-row-mercury');
    expect(mercuryRow).toHaveAttribute('data-lod-level', 'mid');

    const venusRow = screen.getByTestId('lod-row-venus');
    expect(venusRow).toHaveAttribute('data-lod-level', 'low');
  });

  it('상세 모드 — `getLodInfo` 빈 배열 시 waiting 메시지', () => {
    setSearch('lodOverlay=1');
    installScene({
      stats: { high: 0, mid: 0, low: 0, override: 'auto' },
      info: [],
    });
    render(<LodDevOverlay />);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByTestId('lod-dev-overlay-empty')).toBeInTheDocument();
  });

  it('상세 모드 — LOD level 별 색상 클래스 부여 (DoD-4)', () => {
    setSearch('lodOverlay=1');
    installScene({
      stats: { high: 1, mid: 1, low: 1, override: 'auto' },
      info: [
        {
          id: 'sun',
          level: 'high',
          screenCoverage: 71.5,
          pxDiameter: 143.0,
          cameraDistanceMeters: 1.5e11,
        },
        {
          id: 'mercury',
          level: 'mid',
          screenCoverage: 12.3,
          pxDiameter: 24.6,
          cameraDistanceMeters: 5.79e10,
        },
        {
          id: 'venus',
          level: 'low',
          screenCoverage: 4.0,
          pxDiameter: 8.0,
          cameraDistanceMeters: 1.08e11,
        },
      ],
    });
    render(<LodDevOverlay />);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    // tailwind 클래스로 색상 박제 — high=emerald / mid=amber / low=rose.
    expect(screen.getByTestId('lod-row-sun').querySelector('.text-emerald-400')).not.toBeNull();
    expect(screen.getByTestId('lod-row-mercury').querySelector('.text-amber-400')).not.toBeNull();
    expect(screen.getByTestId('lod-row-venus').querySelector('.text-rose-400')).not.toBeNull();
  });

  it('상세 모드 — `getLodInfo` 미존재 (구버전 scene) 시 waiting 메시지 유지', () => {
    setSearch('lodOverlay=1');
    // getLodInfo 부재 — 구버전 scene 시뮬레이션.
    Object.defineProperty(window, '__solarScene', {
      configurable: true,
      writable: true,
      value: {
        getLodStats: () => ({ high: 1, mid: 0, low: 0, override: 'auto' as const }),
        // getLodInfo 의도적 부재.
      },
    });
    render(<LodDevOverlay />);
    act(() => {
      vi.advanceTimersByTime(1100);
    });
    expect(screen.getByTestId('lod-dev-overlay-empty')).toBeInTheDocument();
  });
});
