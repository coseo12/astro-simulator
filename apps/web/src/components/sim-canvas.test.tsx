import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { useSimStore } from '@/store/sim-store';
import { coords as coordsApi } from '@astro-simulator/core';
import {
  absoluteViewDirection,
  resetCameraToOverview,
  resolveFocusView,
  shouldPreserveFocus,
  type FocusViewScene,
} from './sim-canvas';

/**
 * #1380 — 캔버스 `pointerenter` refocus 보호 판정의 **배선** 단언 (PR #1384 리뷰 권고 1).
 *
 * 판정 함수 `isFocusInExpandedPopup` 는 `lib/expanded-popup.test.ts` 가 따로 본다. 여기서는 그 판정이 `shouldPreserveFocus`
 * 에 실제로 연결돼 있는지만 본다 — 연결 줄을 지우면 (리뷰어 변이 M3) 첫 케이스가 FAIL 한다. 대조 케이스는 같은 버튼을 팝업이
 * 닫힌 상태로 두어, 「버튼이라서」 가 아니라 「펼쳐진 팝업 안이라서」 보존됨을 가른다 (마우스 포커스 = `:focus-visible` 거짓).
 */
describe('shouldPreserveFocus — 펼쳐진 팝업 (#1380)', () => {
  let root: HTMLDivElement;

  beforeEach(() => {
    root = document.createElement('div');
    document.body.appendChild(root);
  });
  afterEach(() => {
    root.remove();
  });

  function mount(expanded: boolean): HTMLButtonElement {
    root.innerHTML = `
      <button id="trigger" aria-expanded="${expanded}" aria-controls="popup">열기</button>
      <div id="popup"><button id="chip" type="button">화성 충</button></div>
    `;
    return document.getElementById('chip') as HTMLButtonElement;
  }

  it('`aria-expanded="true"` 트리거의 `aria-controls` 대상 안 일반 버튼 (`:focus-visible` 거짓) — 보존한다', () => {
    const chip = mount(true);
    expect(chip.matches(':focus-visible')).toBe(false);
    expect(shouldPreserveFocus(chip)).toBe(true);
  });

  it('대조 — 같은 버튼이라도 팝업이 닫혀 있으면 보존하지 않는다 (#699 마우스 포커스 회수 유지)', () => {
    const chip = mount(false);
    expect(chip.matches(':focus-visible')).toBe(false);
    expect(shouldPreserveFocus(chip)).toBe(false);
  });
});

/**
 * #1390 Amendment 1 — 개요 reset 의 시점 요청 소비 (PR #1396 리뷰 권고 4 · cross-validate ①). 이 함수의 배선이 끊기면 (리뷰어 변이
 * M2 — 요청을 소비하지 않고 `viewDirection` 없이 reset) 투어 개요 단계의 시점 각이 진입 경로를 따라간다.
 */
describe('resetCameraToOverview · absoluteViewDirection (#1390 Amendment 1)', () => {
  beforeEach(() => {
    useSimStore.setState({ focusViewRequest: null });
  });

  it('개요 요청 (bodyId null · ecliptic-oblique) — 소비하고 앱 첫 화면 각 방향으로 reset', () => {
    useSimStore.setState({ focusViewRequest: { bodyId: null, view: 'ecliptic-oblique' } });
    const reset = vi.fn();
    resetCameraToOverview({ reset });
    expect(reset).toHaveBeenCalledTimes(1);
    const [radius, target, dir] = reset.mock.calls[0]!;
    expect(radius).toBe(35);
    expect(target).toBeUndefined();
    // (alpha −90°, beta 72°) → (cos α sin β, cos β, sin α sin β) = (0, 0.309, −0.951).
    expect(dir.x).toBeCloseTo(0, 9);
    expect(dir.y).toBeCloseTo(Math.cos(Math.PI / 2.5), 9);
    expect(dir.z).toBeCloseTo(-Math.sin(Math.PI / 2.5), 9);
    expect(useSimStore.getState().focusViewRequest).toBeNull();
  });

  it('대상이 있는 요청은 남기고 각을 지정하지 않는다 (사건 선택 · 투어 천체 단계 — 그 포커스 진입이 소비)', () => {
    const request = { bodyId: 'moon', view: 'facing-parent' } as const;
    useSimStore.setState({ focusViewRequest: request });
    const reset = vi.fn();
    resetCameraToOverview({ reset });
    expect(reset).toHaveBeenCalledWith(35, undefined, undefined);
    expect(useSimStore.getState().focusViewRequest).toBe(request);
  });

  it('요청 없음 (관찰 · 연구 모드 reset) — 종전과 같이 각을 지정하지 않는다', () => {
    const reset = vi.fn();
    resetCameraToOverview({ reset });
    expect(reset).toHaveBeenCalledWith(35, undefined, undefined);
  });

  it('개요 + 상대 시점 요청 — 소비하되 방향은 없다 (대상이 없어 셈할 수 없음)', () => {
    useSimStore.setState({ focusViewRequest: { bodyId: null, view: 'facing-parent' } });
    const reset = vi.fn();
    resetCameraToOverview({ reset });
    expect(reset).toHaveBeenCalledWith(35, undefined, undefined);
    expect(useSimStore.getState().focusViewRequest).toBeNull();
    expect(absoluteViewDirection('facing-parent')).toBeUndefined();
  });
});

/**
 * #1390 PR3 — `resolveFocusView` (`consumeFocusView` 의 계산부). `from-sun` 분기와 그 화면 위 방향 부호는 #1366 좌수계 경계 바로
 * 위라 여기서 고정한다 (PR #1397 리뷰 권고 6 — 변이 W1 `fromSun` 무력화 · W2 `viewUp` z 부호 반전이 web 테스트를 전부 통과했다).
 */
describe('resolveFocusView — from-sun · facing-parent (#1390 PR3)', () => {
  // 하지 무렵 배치 (장면 좌표): 태양 원점, 지구는 −Y 쪽 (태양 → 지구 선이 장면 +Y 와 거의 평행 — 카메라 극 근처), 달은 지구 곁.
  const POS: Record<string, { x: number; y: number; z: number }> = {
    sun: { x: 0, y: 0, z: 0 },
    earth: { x: 1.4, y: -230, z: 0.02 },
    moon: { x: 1.4 + 0.9, y: -230 + 0.3, z: 0.05 },
  };
  const PARENT: Record<string, string | null> = { sun: null, earth: 'sun', moon: 'earth' };
  const scene: FocusViewScene = {
    positionOf: (id) => POS[id] ?? null,
    parentIdOf: (id) => PARENT[id] ?? null,
  };
  const unit = (v: { x: number; y: number; z: number }) => {
    const l = Math.hypot(v.x, v.y, v.z);
    return { x: v.x / l, y: v.y / l, z: v.z / l };
  };
  const dot = (a: { x: number; y: number; z: number }, b: { x: number; y: number; z: number }) =>
    a.x * b.x + a.y * b.y + a.z * b.z;
  const toward = (from: string, to: string) =>
    unit({
      x: POS[to]!.x - POS[from]!.x,
      y: POS[to]!.y - POS[from]!.y,
      z: POS[to]!.z - POS[from]!.z,
    });
  /** 황도 북극 (데이터 +Z) 의 장면 좌표 — 장면 경계 함수 (`toScene`) 로 만든다. */
  const [nx, ny, nz] = coordsApi.toScene([0, 0, 1]);
  const ECLIPTIC_NORTH_SCENE = { x: nx, y: ny, z: nz };

  it.each(['earth', 'moon'])(
    '%s — 시점 방향 = 정확히 대상 → 태양 (기울기 없음), 화면 위 = 황도 북극',
    (id) => {
      const got = resolveFocusView({ bodyId: id, view: 'from-sun' }, id, scene)!;
      // 달은 모체 (지구) 가 아니라 태양 쪽이어야 한다 — 변이 W1 (`fromSun` 무력화) 이면 지구 쪽 + 15° 기울기가 된다.
      expect(dot(unit(got.viewDirection!), toward(id, 'sun'))).toBeGreaterThan(1 - 1e-12);
      expect(got.viewUp).toBeDefined();
      expect(dot(unit(got.viewUp!), ECLIPTIC_NORTH_SCENE)).toBeCloseTo(1, 12);
      // #1366 — 데이터 +Z (황도 북극) 는 장면 −Z 다. 변이 W2 (부호 반전 — 남쪽이 화면 위) 면 여기서 FAIL.
      expect(got.viewUp!.z).toBeLessThan(0);
    },
  );

  it('facing-parent 는 화면 위를 주지 않고 (기본 +Y 복원) 모체 방향에서 15° 기울인다 — from-sun 과 다른 분기', () => {
    const got = resolveFocusView({ bodyId: 'earth', view: 'facing-parent' }, 'earth', scene)!;
    expect(got.viewUp).toBeUndefined();
    const angleDeg =
      (Math.acos(dot(unit(got.viewDirection!), toward('earth', 'sun'))) * 180) / Math.PI;
    expect(angleDeg).toBeCloseTo(15, 6);
  });

  it('대상이 이번 포커스가 아니거나 위치를 모르면 시점을 내지 않는다', () => {
    expect(resolveFocusView({ bodyId: 'earth', view: 'from-sun' }, 'mars', scene)).toBeUndefined();
    expect(resolveFocusView({ bodyId: 'pluto', view: 'from-sun' }, 'pluto', scene)).toBeUndefined();
  });
});
