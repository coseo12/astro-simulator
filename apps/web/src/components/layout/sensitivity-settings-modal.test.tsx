import { render, screen, fireEvent } from '@testing-library/react';
import { beforeEach, describe, expect, it } from 'vitest';
import {
  FREE_FLY_SENSITIVITY_DEFAULT,
  FREE_FLY_SENSITIVITY_RANGES,
  SENSITIVITY_SCHEMA_VERSION,
  SENSITIVITY_STORAGE_KEY,
  type FreeFlySensitivityAxis,
} from '@/store/free-fly-sensitivity';
import { useSimStore } from '@/store/sim-store';
import { SensitivitySettingsModal } from './sensitivity-settings-modal';

/**
 * #889 (#848 / PR #886 reviewer 권고 5) — `sensitivity-settings-modal` 전용 단위 테스트.
 *
 * 모달 3종 중 본 파일만 전용 테스트가 없었다 (선재 결손 — `about-modal.test.tsx` /
 * `onboarding-modal.test.tsx` 는 존재). 3종 중 유일하게 슬라이더 4축 + localStorage 영속 경로를
 * 가지므로 회귀가 **조용히** 일어난다(빌드/타입은 통과하고 값만 안 저장됨).
 *
 * ## 커버리지 경계 — 테스트 ROI 판단 (CLAUDE.md §스프린트 계약 6)
 *
 *   본 파일은 **store ↔ 뷰 배선**만 검증하고, 슬라이더를 실제로 끄는(pointer/keyboard drag) 경로는
 *   의도적으로 다루지 않는다. `onValueChange`(즉시 store) / `onValueCommit`(디스크 쓰기) 분리는
 *   Radix 내부 pointer capture + layout 측정에 의존해 jsdom 에서 구축 비용이 검증 대상 대비 과하고,
 *   런타임 축은 브라우저 가드 `verify:704-sensitivity`(S1~S4)가 이미 커버한다.
 *   반대로 아래 7건은 jsdom 인프라가 이미 갖춰져 있어(`vitest.setup.ts` 의 ResizeObserver stub,
 *   #400) 비용이 사실상 0이면서 조용한 퇴행을 잡는다 → 추가가 명백히 이득이라 판단해 채택했다.
 */
const AXES: readonly FreeFlySensitivityAxis[] = ['wasd', 'zoomoutFactor', 'panning', 'zoom'];

/** localStorage 에 영속 payload 를 스키마 그대로 심는다 (`loadPersistedSensitivity` 계약). */
function seedPersisted(value: Record<string, unknown>): void {
  window.localStorage.setItem(
    SENSITIVITY_STORAGE_KEY,
    JSON.stringify({ version: SENSITIVITY_SCHEMA_VERSION, value }),
  );
}

beforeEach(() => {
  window.localStorage.clear();
  // 축별 default 로 결정적 리셋 (이전 테스트의 store mutation 격리).
  useSimStore.setState({ freeFlySensitivity: { ...FREE_FLY_SENSITIVITY_DEFAULT } });
});

describe('SensitivitySettingsModal (#704 / #848 공용 Modal 이관 / #889 전용 테스트)', () => {
  it('초기 상태 — 트리거 버튼만 표시, 모달 숨김', () => {
    render(<SensitivitySettingsModal />);
    expect(screen.getByTestId('sensitivity-settings-button')).toBeInTheDocument();
    expect(screen.queryByTestId('sensitivity-settings-modal')).toBeNull();
  });

  it('트리거 클릭 → 모달 오픈 + 4축 행/슬라이더 렌더 + Modal 셸 계약', () => {
    render(<SensitivitySettingsModal />);
    fireEvent.click(screen.getByTestId('sensitivity-settings-button'));

    const panel = screen.getByTestId('sensitivity-settings-modal');
    // #848 공용 Modal 계약 — 개별 모달에서 재선언 금지 축이 실제로 위임됐는지 확인.
    expect(panel).toHaveAttribute('role', 'dialog');
    expect(panel).toHaveAttribute('aria-modal', 'true');
    expect(panel).toHaveAttribute('aria-labelledby', 'sensitivity-title');
    // `data-modal-open` 은 focus-quick-buttons Esc 가드 + 캔버스 refocus 가드의 SSoT (#737/#848).
    expect(panel).toHaveAttribute('data-modal-open', 'true');
    expect(screen.getByTestId('sensitivity-close')).toBeInTheDocument();

    for (const axis of AXES) {
      expect(screen.getByTestId(`sensitivity-row-${axis}`)).toBeInTheDocument();
      expect(screen.getByTestId(`sensitivity-thumb-${axis}`)).toBeInTheDocument();
    }
  });

  it('슬라이더 aria 범위 = FREE_FLY_SENSITIVITY_RANGES SSoT (min/max 이원화 방지)', () => {
    render(<SensitivitySettingsModal />);
    fireEvent.click(screen.getByTestId('sensitivity-settings-button'));

    for (const axis of AXES) {
      const thumb = screen.getByTestId(`sensitivity-thumb-${axis}`);
      const range = FREE_FLY_SENSITIVITY_RANGES[axis];
      expect(Number(thumb.getAttribute('aria-valuemin'))).toBe(range.min);
      expect(Number(thumb.getAttribute('aria-valuemax'))).toBe(range.max);
      expect(Number(thumb.getAttribute('aria-valuenow'))).toBe(FREE_FLY_SENSITIVITY_DEFAULT[axis]);
    }
  });

  it('mount 후 useEffect 1회 — localStorage 영속값을 store 로 로드 (Hydration 안전 경로)', () => {
    seedPersisted({ wasd: 0.02, zoomoutFactor: 8, panning: 0.02, zoom: 0.02 });
    render(<SensitivitySettingsModal />);

    expect(useSimStore.getState().freeFlySensitivity).toEqual({
      wasd: 0.02,
      zoomoutFactor: 8,
      panning: 0.02,
      zoom: 0.02,
    });
  });

  it('손상 영속값 — 축별로만 정정하고 정상 축은 보존 (범위 clamp / 타입 폴백)', () => {
    // wasd: 타입 불일치 → default / zoom: 범위 초과 → max clamp / panning: 정상 → 보존.
    seedPersisted({ wasd: 'oops', zoomoutFactor: 8, panning: 0.02, zoom: 999 });
    render(<SensitivitySettingsModal />);

    const state = useSimStore.getState().freeFlySensitivity;
    expect(state.wasd).toBe(FREE_FLY_SENSITIVITY_DEFAULT.wasd);
    expect(state.zoom).toBe(FREE_FLY_SENSITIVITY_RANGES.zoom.max);
    expect(state.panning).toBe(0.02);
    expect(state.zoomoutFactor).toBe(8);
  });

  it('표시 자릿수 — step ≥ 1 축은 정수, 나머지는 소수 3자리 (+ 단위 접미)', () => {
    render(<SensitivitySettingsModal />);
    fireEvent.click(screen.getByTestId('sensitivity-settings-button'));

    // zoomoutFactor: step=1 → 정수 + '×'
    expect(screen.getByTestId('sensitivity-value-zoomoutFactor')).toHaveTextContent(
      `${FREE_FLY_SENSITIVITY_DEFAULT.zoomoutFactor}×`,
    );
    // wasd/panning/zoom: step<1 → toFixed(3), 단위 없음
    expect(screen.getByTestId('sensitivity-value-wasd')).toHaveTextContent(
      FREE_FLY_SENSITIVITY_DEFAULT.wasd.toFixed(3),
    );
    expect(screen.getByTestId('sensitivity-value-zoom')).toHaveTextContent(
      FREE_FLY_SENSITIVITY_DEFAULT.zoom.toFixed(3),
    );
  });

  it('기본값 마커 위치 % = (default − min) / (max − min)', () => {
    render(<SensitivitySettingsModal />);
    fireEvent.click(screen.getByTestId('sensitivity-settings-button'));

    for (const axis of AXES) {
      const { min, max } = FREE_FLY_SENSITIVITY_RANGES[axis];
      const expected = ((FREE_FLY_SENSITIVITY_DEFAULT[axis] - min) / (max - min)) * 100;
      const marker = screen.getByTestId(`sensitivity-default-marker-${axis}`);
      expect(parseFloat(marker.style.left)).toBeCloseTo(expected, 6);
      // 시각 기준점일 뿐이라 접근성 트리에서 제외돼야 한다.
      expect(marker).toHaveAttribute('aria-hidden', 'true');
    }
  });

  it('기본값 복원 버튼 → store 4축 default 복귀 + localStorage 즉시 동기화', () => {
    seedPersisted({ wasd: 0.02, zoomoutFactor: 8, panning: 0.02, zoom: 0.02 });
    render(<SensitivitySettingsModal />);
    fireEvent.click(screen.getByTestId('sensitivity-settings-button'));
    expect(useSimStore.getState().freeFlySensitivity.wasd).toBe(0.02);

    fireEvent.click(screen.getByTestId('sensitivity-reset'));

    expect(useSimStore.getState().freeFlySensitivity).toEqual({ ...FREE_FLY_SENSITIVITY_DEFAULT });
    // 디스크 미동기화면 새로고침에 이전 영속값이 재로드된다 (#704 agy 지적 회귀 가드).
    const raw = window.localStorage.getItem(SENSITIVITY_STORAGE_KEY);
    expect(raw).not.toBeNull();
    expect(JSON.parse(raw as string)).toEqual({
      version: SENSITIVITY_SCHEMA_VERSION,
      value: { ...FREE_FLY_SENSITIVITY_DEFAULT },
    });
  });

  it('Esc / 닫기 버튼 → 모달 제거 (공용 Modal 위임 확인)', () => {
    render(<SensitivitySettingsModal />);
    fireEvent.click(screen.getByTestId('sensitivity-settings-button'));
    fireEvent.keyDown(window, { key: 'Escape' });
    expect(screen.queryByTestId('sensitivity-settings-modal')).toBeNull();

    fireEvent.click(screen.getByTestId('sensitivity-settings-button'));
    fireEvent.click(screen.getByTestId('sensitivity-close'));
    expect(screen.queryByTestId('sensitivity-settings-modal')).toBeNull();
  });
});
