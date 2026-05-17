'use client';

import type { SimulationCore } from '@astro-simulator/core';
import type { Tier } from '@astro-simulator/core/scene';
import type { CoreCommand } from '@astro-simulator/shared';
import { createContext, useContext, type ReactNode } from 'react';

/**
 * #400 — ScaleControl 양방향 sync 에 필요한 camera 의 최소 surface.
 *
 * 구조적 타이핑 (duck type) 으로 정의해 `@astro-simulator/core` (`@babylonjs/core@^8`) 와
 * `apps/web` (`@babylonjs/core@^9`) 사이 type duplication 충돌 회피. ArcRotateCamera 인스턴스의
 * `radius` (scene unit) + `onViewMatrixChangedObservable` (Babylon Observable) 만 사용.
 *
 * Babylon Observable 의 `add` / `remove` 도 최소 surface 만 선언 — 실 인스턴스는 더 많은 메소드를
 * 가지나 구조적 호환만 보장하면 충분.
 */
export interface CameraSyncSurface {
  /** scene unit. mutate 금지 (읽기 전용). */
  readonly radius: number;
  readonly onViewMatrixChangedObservable: {
    add(callback: () => void): unknown;
    remove(observer: unknown): void;
  };
}

/**
 * SimulationCore에 대한 명령 전송 인터페이스.
 * 컴포넌트는 이 context를 통해서만 core에 접근 — core 인스턴스 직접 노출은 피한다.
 *
 * #400 ADR 20260512-au-slider-semantics — ScaleControl 양방향 sync 를 위해 readonly camera + tier
 * getter 도 함께 노출한다. camera 인스턴스는 mutate 하지 않고 `onViewMatrixChangedObservable` 구독
 * 및 `radius` 읽기 전용으로만 사용. tier 는 `solar.getTier()` snapshot 함수를 그대로 전달 (매 호출
 * 시점의 active tier 반환).
 */
interface SimCommandApi {
  command: (cmd: CoreCommand) => void;
  /** ScaleControl 양방향 sync 용. mount 이후 항상 non-null (sim-canvas 가 instance 후 children 렌더). */
  camera: CameraSyncSurface | null;
  /** ScaleControl 의 scene unit → m 환산용. solar.getTier 가 snapshot 으로 active tier 반환. */
  getActiveTier: (() => Tier) | null;
}

const SimCommandContext = createContext<SimCommandApi | null>(null);

export function SimCommandProvider({
  core,
  camera,
  getActiveTier,
  children,
}: {
  core: SimulationCore | null;
  /** sim-canvas 가 setupArcRotateCamera 결과를 전달. core 가 ready 후 children 렌더 보장 (#419). */
  camera?: CameraSyncSurface | null;
  /** sim-canvas 가 `solar.getTier` 를 그대로 전달. ScaleControl 이 호출 시점 active tier 조회. */
  getActiveTier?: (() => Tier) | null;
  children: ReactNode;
}) {
  // #419 — core null 시 children 렌더 보류 (mount 순서 정합화).
  // ADR: docs/decisions/20260510-419-sim-canvas-mount-race.md §결정 1 (A1-E early return).
  // sim-canvas.tsx 의 비동기 core 생성 (useEffect → setCore) 이 완료된 후에만 children 의 useEffect 가
  // 발화 → sendCommand 가 항상 non-null core 호출 보장 → useSimCommand race condition 구조적 차단.
  // 부모 ADR 20260504-415-url-sync-guard.md §재검토 조건 1 충족 (line 104 race fallback 의 존재 이유 소멸).
  if (core === null) return null;

  const api: SimCommandApi = {
    command: (cmd) => core.command(cmd),
    camera: camera ?? null,
    getActiveTier: getActiveTier ?? null,
  };
  return <SimCommandContext.Provider value={api}>{children}</SimCommandContext.Provider>;
}

/** core에 명령을 보내는 훅. core가 아직 초기화되지 않았으면 no-op. */
export function useSimCommand(): (cmd: CoreCommand) => void {
  const ctx = useContext(SimCommandContext);
  return ctx?.command ?? (() => undefined);
}

/**
 * #400 ADR — ScaleControl 양방향 sync 용. camera + tier getter 를 함께 반환.
 * camera 가 아직 mount 전이면 `{ camera: null, getActiveTier: null }`. ScaleControl 은 null 시
 * subscribe 를 skip 하고 다음 render 까지 대기.
 */
export function useSimCameraTier(): {
  camera: CameraSyncSurface | null;
  getActiveTier: (() => Tier) | null;
} {
  const ctx = useContext(SimCommandContext);
  return {
    camera: ctx?.camera ?? null,
    getActiveTier: ctx?.getActiveTier ?? null,
  };
}
