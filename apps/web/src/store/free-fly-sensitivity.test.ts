/**
 * #704 — free-fly 감도 store setter/reset + localStorage 직렬화/폴백 회귀 가드.
 *
 * ADR `docs/decisions/20260618-704-freefly-sensitivity-settings-ui.md` §결정 2/3.
 *
 * 검증:
 *  - default SSoT = camera.ts const import (하드코딩 재선언 0)
 *  - setFreeFlySensitivity(axis, value, persist) — 메모리 갱신 + persist 분리(onChange vs onCommit)
 *  - resetFreeFlySensitivity — 4축 default 복원 + localStorage 즉시 동기화
 *  - clampSensitivityAxis — 범위 이탈/NaN/타입 손상 → default 정정
 *  - loadPersistedSensitivity — SSR 가드 / JSON 손상 / 스키마 버전 / 부분 손상 폴백
 *  - savePersistedSensitivity ↔ loadPersistedSensitivity 왕복 (새로고침 유지 모사)
 */
import { beforeEach, describe, expect, it } from 'vitest';
import { scene } from '@astro-simulator/core';
import { useSimStore } from './sim-store';
import {
  FREE_FLY_SENSITIVITY_DEFAULT,
  FREE_FLY_SENSITIVITY_RANGES,
  FREE_FLY_ZOOMOUT_FACTOR_DEFAULT,
  SENSITIVITY_STORAGE_KEY,
  SENSITIVITY_SCHEMA_VERSION,
  clampSensitivityAxis,
  loadPersistedSensitivity,
  savePersistedSensitivity,
} from './free-fly-sensitivity';

beforeEach(() => {
  window.localStorage.clear();
  useSimStore.setState({ freeFlySensitivity: { ...FREE_FLY_SENSITIVITY_DEFAULT } });
});

describe('#704 default SSoT drift 가드 — 리터럴 ↔ camera.ts const 일치 (SSR 격리)', () => {
  // free-fly-sensitivity.ts 는 SSR 격리를 위해 babylon 값 import(`scene.*`) 대신 숫자 리터럴로
  // default 를 박제한다. 본 테스트가 SSoT 보증 — 리터럴이 camera.ts const 와 drift 하면 FAIL.
  // (테스트 파일은 SSR 그래프 밖이라 babylon import 무방.)
  it('4축 default 리터럴 = camera.ts named const (drift 시 FAIL)', () => {
    expect(FREE_FLY_SENSITIVITY_DEFAULT.wasd).toBe(scene.WASD_DELTA_PERCENTAGE);
    expect(FREE_FLY_SENSITIVITY_DEFAULT.panning).toBe(scene.PANNING_DELTA_PERCENTAGE);
    expect(FREE_FLY_SENSITIVITY_DEFAULT.zoom).toBe(scene.ZOOM_DELTA_PERCENTAGE);
  });

  it('zoomoutFactor default = FREE_FLY_ZOOMOUT_FACTOR_DEFAULT = 5 (sim-canvas 와 동일 SSoT)', () => {
    // zoomoutFactor 는 camera.ts const 가 아니라 sim-canvas 의 줌아웃 배율과 동일 SSoT.
    // sim-canvas.tsx 는 store 의 freeFlySensitivity.zoomoutFactor 를 직접 pull 하고
    // default 5 를 'FREE_FLY_ZOOMOUT_FACTOR_DEFAULT' 라벨로 주석 박제(중복 선언 아님).
    expect(FREE_FLY_SENSITIVITY_DEFAULT.zoomoutFactor).toBe(FREE_FLY_ZOOMOUT_FACTOR_DEFAULT);
    expect(FREE_FLY_ZOOMOUT_FACTOR_DEFAULT).toBe(5);
  });

  it('default 값이 각 축 슬라이더 범위 내', () => {
    for (const axis of ['wasd', 'zoomoutFactor', 'panning', 'zoom'] as const) {
      const { min, max } = FREE_FLY_SENSITIVITY_RANGES[axis];
      expect(FREE_FLY_SENSITIVITY_DEFAULT[axis]).toBeGreaterThanOrEqual(min);
      expect(FREE_FLY_SENSITIVITY_DEFAULT[axis]).toBeLessThanOrEqual(max);
    }
  });
});

describe('#704 setFreeFlySensitivity — 메모리 갱신 + persist 분리', () => {
  it('persist=false (onValueChange) — 메모리만 갱신, localStorage 미기록', () => {
    useSimStore.getState().setFreeFlySensitivity('wasd', 0.03);
    expect(useSimStore.getState().freeFlySensitivity.wasd).toBe(0.03);
    expect(window.localStorage.getItem(SENSITIVITY_STORAGE_KEY)).toBeNull();
  });

  it('persist=true (onValueCommit) — 메모리 + localStorage 기록', () => {
    useSimStore.getState().setFreeFlySensitivity('panning', 0.02, true);
    expect(useSimStore.getState().freeFlySensitivity.panning).toBe(0.02);
    const loaded = loadPersistedSensitivity();
    expect(loaded.panning).toBe(0.02);
  });

  it('단일 축 갱신은 나머지 3축 보존 (중첩 객체 부분 갱신)', () => {
    useSimStore.getState().setFreeFlySensitivity('zoom', 0.025, true);
    const s = useSimStore.getState().freeFlySensitivity;
    expect(s.zoom).toBe(0.025);
    expect(s.wasd).toBe(FREE_FLY_SENSITIVITY_DEFAULT.wasd);
    expect(s.zoomoutFactor).toBe(FREE_FLY_SENSITIVITY_DEFAULT.zoomoutFactor);
    expect(s.panning).toBe(FREE_FLY_SENSITIVITY_DEFAULT.panning);
  });
});

describe('#704 resetFreeFlySensitivity — default 복원 + localStorage 동기화', () => {
  it('4축 전부 default 복원', () => {
    useSimStore.getState().setFreeFlySensitivity('wasd', 0.04, true);
    useSimStore.getState().setFreeFlySensitivity('zoomoutFactor', 15, true);
    useSimStore.getState().resetFreeFlySensitivity();
    expect(useSimStore.getState().freeFlySensitivity).toEqual(FREE_FLY_SENSITIVITY_DEFAULT);
  });

  it('reset 후 localStorage 도 default — 새로고침 시 이전 영속값 재로드 안 됨 (agy 누락 요소 1)', () => {
    useSimStore.getState().setFreeFlySensitivity('wasd', 0.04, true);
    useSimStore.getState().resetFreeFlySensitivity();
    const loaded = loadPersistedSensitivity();
    expect(loaded).toEqual(FREE_FLY_SENSITIVITY_DEFAULT);
  });
});

describe('#704 clampSensitivityAxis — 범위/타입 가드', () => {
  it('범위 이탈 → min/max clamp', () => {
    expect(clampSensitivityAxis('wasd', 999)).toBe(FREE_FLY_SENSITIVITY_RANGES.wasd.max);
    expect(clampSensitivityAxis('wasd', -1)).toBe(FREE_FLY_SENSITIVITY_RANGES.wasd.min);
  });
  it('NaN/Infinity/타입 손상 → 해당 축 default', () => {
    for (const bad of [Number.NaN, Number.POSITIVE_INFINITY, 'x', null, undefined, {}]) {
      expect(clampSensitivityAxis('zoom', bad)).toBe(FREE_FLY_SENSITIVITY_DEFAULT.zoom);
    }
  });
  it('범위 내 값은 그대로 통과', () => {
    expect(clampSensitivityAxis('panning', 0.02)).toBe(0.02);
  });
});

describe('#704 loadPersistedSensitivity — 3종 방어 폴백', () => {
  it('localStorage 비어있음 → default', () => {
    expect(loadPersistedSensitivity()).toEqual(FREE_FLY_SENSITIVITY_DEFAULT);
  });

  it('JSON 손상 → default (가드 fail-fast, throw 없음)', () => {
    window.localStorage.setItem(SENSITIVITY_STORAGE_KEY, '{ not valid json');
    expect(loadPersistedSensitivity()).toEqual(FREE_FLY_SENSITIVITY_DEFAULT);
  });

  it('스키마 버전 불일치 → default (구버전 폴백)', () => {
    window.localStorage.setItem(
      SENSITIVITY_STORAGE_KEY,
      JSON.stringify({ version: SENSITIVITY_SCHEMA_VERSION + 99, value: { wasd: 0.04 } }),
    );
    expect(loadPersistedSensitivity()).toEqual(FREE_FLY_SENSITIVITY_DEFAULT);
  });

  it('부분 손상 — 한 축만 범위 이탈 → 해당 축만 default 정정, 나머지 보존', () => {
    window.localStorage.setItem(
      SENSITIVITY_STORAGE_KEY,
      JSON.stringify({
        version: SENSITIVITY_SCHEMA_VERSION,
        value: { wasd: 0.03, zoomoutFactor: 999, panning: 0.02, zoom: 0.015 },
      }),
    );
    const loaded = loadPersistedSensitivity();
    expect(loaded.wasd).toBe(0.03);
    // zoomoutFactor 999 는 범위(max 20) 이탈 → clamp(20). (silent 흡수 아님 — 명시 정정.)
    expect(loaded.zoomoutFactor).toBe(FREE_FLY_SENSITIVITY_RANGES.zoomoutFactor.max);
    expect(loaded.panning).toBe(0.02);
    expect(loaded.zoom).toBe(0.015);
  });

  it('__proto__ 등 임의 키 주입 → 4축 명시 할당으로 무시 (spread 미사용)', () => {
    window.localStorage.setItem(
      SENSITIVITY_STORAGE_KEY,
      JSON.stringify({
        version: SENSITIVITY_SCHEMA_VERSION,
        value: { wasd: 0.02, evil: 'x', polluted: true },
      }),
    );
    const loaded = loadPersistedSensitivity();
    expect(loaded.wasd).toBe(0.02);
    expect(Object.keys(loaded).sort()).toEqual(['panning', 'wasd', 'zoom', 'zoomoutFactor']);
    expect((loaded as unknown as Record<string, unknown>).evil).toBeUndefined();
  });
});

describe('#704 save ↔ load 왕복 (새로고침 유지 모사)', () => {
  it('savePersistedSensitivity → loadPersistedSensitivity 동일 값', () => {
    const custom = { wasd: 0.03, zoomoutFactor: 10, panning: 0.02, zoom: 0.008 };
    savePersistedSensitivity(custom);
    expect(loadPersistedSensitivity()).toEqual(custom);
  });

  it('commit 후 새 load — 사용자 조정값 유지 (DoD 새로고침 유지)', () => {
    useSimStore.getState().setFreeFlySensitivity('wasd', 0.045, true);
    useSimStore.getState().setFreeFlySensitivity('zoomoutFactor', 12, true);
    // 새로고침 모사 — store 초기화 후 localStorage 재로드.
    useSimStore.setState({ freeFlySensitivity: { ...FREE_FLY_SENSITIVITY_DEFAULT } });
    const loaded = loadPersistedSensitivity();
    expect(loaded.wasd).toBe(0.045);
    expect(loaded.zoomoutFactor).toBe(12);
  });
});
